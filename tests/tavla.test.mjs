// Tavla kural motoru testleri: node --test tests/tavla.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const T = createRequire(import.meta.url)('../tavla/motor.js');

function empty() { const b = []; for (let i = 0; i < 26; i++) b.push(0); return { b, bar: [0, 0], off: [0, 0] }; }

test('başlangıç: 15er pul, pip 167', () => {
  const p = T.newPos();
  assert.equal(T.count(p, 0), 15); assert.equal(T.count(p, 1), 15);
  assert.equal(T.pip(p, 0), 167); assert.equal(T.pip(p, 1), 167);
});

test('kırma: tek pul bara gider; 2+ pul haneye girilmez', () => {
  const p = empty(); p.b[10] = 1; p.b[7] = -1; p.b[5] = -2; p.off = [14, 13];
  const ms = T.singleMoves(p, 0, 3);
  const hit = ms.find((m) => m.from === 10 && m.to === 7);
  assert.ok(hit && hit.hit);
  assert.equal(T.singleMoves(p, 0, 5).find((m) => m.from === 10 && m.to === 5), undefined);
  T.applyMove(p, 0, hit);
  assert.equal(p.bar[1], 1); assert.equal(p.b[7], 1);
});

test('kırık pul önce girer; kapalı haneye giremez', () => {
  const p = empty(); p.bar[0] = 1; p.b[13] = 3; p.b[20] = -2; p.off = [11, 13];
  assert.deepEqual(T.singleMoves(p, 0, 5), []);           // 25-5 = 20 kapalı
  const m = T.singleMoves(p, 0, 4);
  assert.equal(m.length, 1); assert.equal(m[0].from, 'bar'); assert.equal(m[0].to, 21);
});

test('toplama: tam zar, büyük zarla yalnızca yukarıda pul yoksa', () => {
  const p = empty(); p.b[5] = 2; p.b[3] = 1; p.b[20] = -1; p.off = [12, 14];
  assert.ok(T.singleMoves(p, 0, 5).some((m) => m.from === 5 && m.to === 'off'));
  assert.ok(!T.singleMoves(p, 0, 6).some((m) => m.from === 3 && m.to === 'off'), '5\'te pul varken 3 büyük zarla toplanmaz');
  assert.ok(T.singleMoves(p, 0, 6).some((m) => m.from === 5 && m.to === 'off'), 'en yukarıdaki pul büyük zarla toplanır');
  p.b[8] = 1; p.off[0] = 11;
  assert.ok(!T.singleMoves(p, 0, 5).some((m) => m.to === 'off'), 'ev dışında pul varken toplanmaz');
});

test('iki zar zorunlu; yalnız biri oynanabiliyorsa büyük zar', () => {
  // Beyaz 13'te tek pul; 6-1: 13→7→6 ya da 13→12→6 ... iki zar da oynanmalı
  const p = empty(); p.b[13] = 1; p.b[1] = -14; p.b[2] = -1;
  const info = T.turnInfo(p, 0, [6, 1]);
  assert.equal(info.max, 2);
  // Yalnız biri oynanabilir: 6 ve 5; 6 oynanınca 5 kapalı, 5 oynanınca 6 kapalı → büyük (6) zorunlu
  const q = empty(); q.b[13] = 1; q.b[7] = -2; q.b[8] = -2; q.b[2] = -2; q.b[1] = -9; q.b[3] = -2;
  // 13-6=7 kapalı! farklı kurgu: 13'ten 6 → 7 açık, sonra 5 → 2 kapalı; 13'ten 5 → 8 açık, sonra 6 → 2 kapalı
  q.b[7] = 0; q.b[8] = 0; q.b[1] = -13;
  const qi = T.turnInfo(q, 0, [6, 5]);
  assert.equal(qi.max, 1); assert.equal(qi.forceDie, 6);
  const nm = T.nextMoves(q, 0, qi.dice, qi.max, qi.forceDie);
  assert.ok(nm.length && nm.every((m) => m.die === 6));
});

test('çift zar dört kez oynanır', () => {
  const p = T.newPos();
  const info = T.turnInfo(p, 0, [3, 3]);
  assert.equal(info.dice.length, 4); assert.equal(info.max, 4);
  const turns = T.legalTurns(p, 0, [3, 3]);
  assert.ok(turns.length > 5);
  turns.forEach((t) => assert.equal(t.moves.length, 4));
});

test('tur doğrulama: geçerli dizi kabul, geçersiz red', () => {
  const p = T.newPos();
  const ok = T.validateTurn(p, 0, [3, 1], [{ from: 8, to: 5, die: 3 }, { from: 6, to: 5, die: 1 }]);
  assert.ok(ok); assert.equal(ok.b[5], 2);
  assert.equal(T.validateTurn(p, 0, [3, 1], [{ from: 8, to: 5, die: 3 }]), null, 'eksik zar');
  assert.equal(T.validateTurn(p, 0, [3, 1], [{ from: 6, to: 1, die: 5 }, { from: 6, to: 5, die: 1 }]), null, 'olmayan zar');
});

test('mars: rakip hiç toplamadıysa 2 puan', () => {
  const p = empty(); p.off = [15, 0]; p.b[20] = -15;
  assert.equal(T.winner(p), 0); assert.equal(T.gamePoints(p, 0), 2);
  p.off[1] = 1; p.b[20] = -14; assert.equal(T.gamePoints(p, 0), 1);
});

function playGame(seed, levels) {
  const rnd = T.rng(seed);
  let pos = T.newPos(), turn = seed % 2, guard = 0;
  while (T.winner(pos) < 0 && guard++ < 2000) {
    const dice = T.rollDice(rnd), t = T.chooseTurn(pos, turn, dice, levels[turn], rnd);
    const v = T.validateTurn(pos, turn, dice, t.moves);
    assert.ok(v, 'bot geçerli tur oynamalı');
    pos = v;
    assert.equal(T.count(pos, 0), 15); assert.equal(T.count(pos, 1), 15);
    turn = 1 - turn;
  }
  return pos;
}

test('bot simülasyonu: oyunlar biter, pul sayısı korunur', () => {
  for (let i = 0; i < 30; i++) assert.ok(T.winner(playGame(100 + i, ['normal', 'normal'])) >= 0);
});

test('zor bot kolaya karşı açık ara kazanır', () => {
  let hard = 0;
  for (let i = 0; i < 40; i++) {
    const swap = i % 2, lv = swap ? ['easy', 'hard'] : ['hard', 'easy'];
    const w = T.winner(playGame(900 + i, lv));
    if (w === (swap ? 1 : 0)) hard++;
  }
  assert.ok(hard >= 28, 'zor bot: ' + hard + '/40');
});
