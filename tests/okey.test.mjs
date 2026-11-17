// 101 Okey — kural motoru testleri:  node --test tests/okey.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../101-okey/okey-motor.js');

let id = 1000;
const T = (c, n) => ({ id: id++, c, n, joker: false });
const J = () => ({ id: id++, c: 'k', n: 5, joker: true });

test('seri: aynı renk ardışık, joker boşluk doldurur', () => {
  assert.equal(M.checkRun([T('k', 3), T('k', 4), T('k', 5)]).value, 12);
  assert.equal(M.checkRun([T('k', 3), J(), T('k', 5)]).value, 12);
  assert.equal(M.checkRun([T('k', 11), T('k', 12), J()]).value, 11 + 12 + 13);   // joker yukarı
  assert.equal(M.checkRun([T('k', 12), T('k', 13), J()]).value, 11 + 12 + 13);   // 13'ten sonra yer yok → aşağı
  assert.equal(M.checkRun([T('k', 3), T('m', 4), T('k', 5)]), null);              // farklı renk
  assert.equal(M.checkRun([T('k', 12), T('k', 13), T('k', 1)]), null);             // başa dönme yok
  assert.equal(M.checkRun([T('k', 3), T('k', 3), T('k', 4)]), null);              // tekrar eden sayı
});

test('per: aynı sayı farklı renk, 3-4 taş', () => {
  assert.equal(M.checkSet([T('k', 9), T('s', 9), T('m', 9)]).value, 27);
  assert.equal(M.checkSet([T('k', 9), T('s', 9), T('m', 9), T('y', 9)]).value, 36);
  assert.equal(M.checkSet([T('k', 9), T('k', 9), T('m', 9)]), null);
  assert.equal(M.checkSet([T('k', 9), J(), T('m', 9)]).value, 27);
  assert.equal(M.checkSet([T('k', 9), T('s', 9), T('m', 9), T('y', 9), J()]), null);
});

test('çift: aynı taş ya da joker', () => {
  assert.ok(M.checkPair([T('k', 7), T('k', 7)]));
  assert.ok(M.checkPair([T('k', 7), J()]));
  assert.equal(M.checkPair([T('k', 7), T('m', 7)]), null);
});

test('en iyi dizilim 101 ve üstünü bulur', () => {
  const hand = [
    T('k', 10), T('k', 11), T('k', 12), T('k', 13),   // 46
    T('s', 13), T('m', 13), T('y', 13),               // 39
    T('m', 5), T('m', 6), T('m', 7),                  // 18
    T('y', 1), T('s', 4), T('k', 2)
  ];
  const r = M.bestMelds(hand);
  assert.ok(r.value >= 101, 'değer ' + r.value);
  r.melds.forEach((m) => assert.ok(M.checkMeld(m), 'geçersiz per'));
  const ids = new Set(); r.melds.flat().forEach((t) => { assert.ok(!ids.has(t.id), 'taş iki kez kullanıldı'); ids.add(t.id); });
});

test('jokerli dizilim seriyi tamamlar', () => {
  const r = M.bestMelds([T('k', 11), T('k', 13), J(), T('m', 2)]);
  assert.equal(r.value, 36);
  assert.equal(r.melds.length, 1);
  assert.deepEqual(r.melds[0].map((t) => (t.joker ? 'J' : t.n)), [11, 'J', 13]);
});

test('çift dizilimi', () => {
  const r = M.bestPairs([T('k', 1), T('k', 1), T('m', 4), T('m', 4), T('s', 9), J()]);
  assert.equal(r.pairs.length, 3);
});

test('masaya işleme', () => {
  const meld = { type: 'run', tiles: [T('k', 4), T('k', 5), T('k', 6)] };
  assert.ok(M.addToMeld(meld, T('k', 7)));
  assert.ok(M.addToMeld(meld, T('k', 3)));
  assert.equal(M.addToMeld(meld, T('k', 9)), null);
  const set = { type: 'set', tiles: [T('k', 8), T('s', 8), T('m', 8)] };
  assert.ok(M.addToMeld(set, T('y', 8)));
  assert.equal(M.addToMeld(set, T('k', 8)), null);
});

test('dağıtım: 22/21/21/21, gösterge ve okey doğru', () => {
  const st = M.newHand(12345, 2);
  assert.equal(st.hands[2].length, 22);
  [0, 1, 3].forEach((p) => assert.equal(st.hands[p].length, 21));
  assert.equal(st.deck.length, 106 - 1 - 85);
  assert.equal(st.turn, 2); assert.equal(st.phase, 'play');
  const okey = M.okeyOf(st.indicator);
  const all = Object.values(st.byId);
  assert.equal(all.filter((t) => t.joker).length, 2); // gösterge okeyin bir eksiği olduğu için iki gerçek okey de oyunda
  all.filter((t) => t.fake).forEach((t) => { assert.equal(t.c, okey.c); assert.equal(t.n, okey.n); assert.equal(t.joker, false); });
});

test('yandan alınan taş kullanılmadan atılamaz', () => {
  const st = M.newHand(7, 0);
  // 0 atar, 1 çeker ve atar, 2 yandan alır
  M.discard(st, 0, M.chooseDiscard(st, 0));
  M.draw(st, 1, false); M.discard(st, 1, M.chooseDiscard(st, 1));
  const r = M.draw(st, 2, true); assert.equal(r.ok, true);
  const other = st.hands[2].find((t) => t.id !== st.sideTaken);
  assert.equal(M.discard(st, 2, other.id).error, 'must_use_side');
  assert.equal(M.discard(st, 2, st.sideTaken).error, 'must_use_side');
  assert.equal(M.returnSide(st, 2).ok, true);
  assert.equal(st.penalties[2], 101);
});

test('okey atmak ceza', () => {
  const st = M.newHand(99, 0);
  const j = Object.values(st.byId).find((t) => t.joker);
  // okeyi 0'ın eline koy
  st.hands.forEach((h) => { const i = h.indexOf(j); if (i >= 0) h.splice(i, 1); });
  st.hands[0].push(j);
  M.discard(st, 0, j.id);
  assert.equal(st.penalties[0], 101);
});

// Dört bot tam el oynar: her el hatasız bitmeli, kurallar korunmalı
function playBotHand(seed, dealer, opts, level) {
  const st = M.newHand(seed, dealer, opts);
  let guard = 0;
  while (!st.over && guard++ < 2000) {
    const p = st.turn;
    if (st.phase === 'draw') {
      const side = M.botWantsSide(st, p, level);
      const r = M.draw(st, p, side);
      assert.ok(r.ok, 'draw: ' + r.error);
      if (st.over) break;
    }
    M.botPlay(st, p, level);
    if (st.phase === 'draw') continue; // yan taşı geri koyduysa
    const r = M.discard(st, p, M.chooseDiscard(st, p, level));
    assert.ok(r.ok, 'discard: ' + r.error);
  }
  assert.ok(st.over, 'el bitmedi');
  // taş korunumu: hiçbir taş kaybolmadı ya da çoğalmadı
  const seen = new Set();
  const add = (t) => { assert.ok(!seen.has(t.id), 'çift taş ' + t.id); seen.add(t.id); };
  st.hands.flat().forEach(add); st.discards.flat().forEach(add); st.deck.forEach(add); st.table.forEach((m) => m.tiles.forEach(add)); add(st.indicator);
  assert.equal(seen.size, 106);
  st.table.forEach((m) => assert.ok(m.type === 'pair' ? M.checkPair(m.tiles) : M.checkMeld(m.tiles, st.opts), 'masada geçersiz per'));
  return st;
}

test('dört bot 200 eli hatasız oynar', () => {
  let wins = 0, deckOut = 0;
  for (let i = 0; i < 200; i++) {
    const st = playBotHand(1000 + i, i % 4);
    if (st.result.winner >= 0) wins++; else deckOut++;
    if (st.result.winner >= 0) assert.ok(st.result.points[st.result.winner] < 0);
  }
  // dağıtımdan sonra destede yalnızca 20 taş kalır; ellerin bir kısmı deste bitince kapanır
  assert.ok(wins >= 50, `bitirilen el az: ${wins}/200 (deste bitti: ${deckOut})`);
});

test('12-13-1 yalnızca seçenek açıkken geçerli', () => {
  const run = [T('k', 12), T('k', 13), T('k', 1)];
  assert.equal(M.checkRun(run), null);
  const r = M.checkRun(run, { wrap: true });
  assert.ok(r); assert.equal(r.value, 12 + 13 + 1);
  assert.equal(M.checkRun([T('k', 13), T('k', 1), T('k', 2)], { wrap: true }), null); // 13-1-2 yok
  const best = M.bestMelds([T('m', 12), T('m', 13), T('m', 1), T('s', 4)], { wrap: true });
  assert.equal(best.value, 26);
});

test('masadaki okeyi gerçek taşıyla almak', () => {
  const j = J();
  const meld = { type: 'run', tiles: [T('k', 4), j, T('k', 6)] };
  const real5 = T('k', 5);
  const sw = M.swapInfo(meld, real5);
  assert.ok(sw); assert.equal(sw.joker, j);
  assert.deepEqual(sw.tiles.map((t) => t.n), [4, 5, 6]);
  assert.equal(M.swapInfo(meld, T('k', 7)), null);
  const set = { type: 'set', tiles: [T('k', 9), T('s', 9), J()] };
  assert.ok(M.swapInfo(set, T('m', 9)));
  assert.equal(M.swapInfo(set, T('k', 9)), null);
});

test('katlamalı: sonraki açılış öncekinden büyük olmalı', () => {
  const st = M.newHand(5, 0, { katlamali: true });
  st.highOpen = 120;
  assert.equal(M.openNeed(st), 121);
  const st2 = M.newHand(5, 0);
  st2.highOpen = 120;
  assert.equal(M.openNeed(st2), 101);
});

test('çift açan işleyebilir seçeneği', () => {
  const st = M.newHand(5, 0, { ciftIsler: true });
  st.opened[0] = 'cift';
  assert.equal(M.canProc(st, 0), true);
  const st2 = M.newHand(5, 0);
  st2.opened[0] = 'cift';
  assert.equal(M.canProc(st2, 0), false);
});

for (const level of ['easy', 'hard']) {
  test(`${level} botlar ve tüm kural seçenekleri 80 eli hatasız oynar`, () => {
    let wins = 0;
    for (let i = 0; i < 80; i++) {
      const st = playBotHand(5000 + i, i % 4, { wrap: true, okeySwap: true, katlamali: i % 2 === 0, ciftIsler: i % 3 === 0, ceza: 202 }, level);
      if (st.result.winner >= 0) wins++;
    }
    if (level === 'hard') assert.ok(wins >= 10, `${level}: bitirilen el ${wins}/80`); // kolay bot bilerek zayıf
  });
}

test('ipucu her durumda geçerli bir öneri verir', () => {
  const st = M.newHand(77, 0);
  const h = M.hint(st, 0);
  assert.ok(h && ['open', 'discard', 'process', 'swap'].includes(h.a));
  if (h.a === 'discard') assert.ok(st.hands[0].some((t) => t.id === h.id));
});
