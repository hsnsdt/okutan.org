// Okey (düz) kural motoru testleri: node --test tests/duz-okey.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../okey/motor.js');

let uid = 1000;
const T = (c, n) => ({ id: uid++, c, n, joker: false });
const J = () => ({ id: uid++, c: 'k', n: 9, joker: true });
const parse = (s) => s.split(' ').map((x) => (x === 'J' ? J() : T(x[0], +x.slice(1))));

test('seri ve per doğrulama', () => {
  assert.ok(M.checkRun(parse('k3 k4 k5')));
  assert.ok(M.checkRun(parse('k12 k13 k1')), '12-13-1 olur');
  assert.equal(M.checkRun(parse('k13 k1 k2')), null, '13-1-2 olmaz');
  assert.ok(M.checkRun(parse('m5 J m7')));
  assert.equal(M.checkRun(parse('m5 s6 m7')), null);
  assert.ok(M.checkSet(parse('k7 s7 m7')));
  assert.equal(M.checkSet(parse('k7 k7 m7')), null, 'aynı renk iki kez olmaz');
  assert.ok(M.checkSet(parse('k7 s7 J y7')));
});

test('eli bitirme: seri, 12-13-1, okeyli ve 7 çift', () => {
  assert.equal(M.finishKind(parse('k1 k2 k3 k4 s5 m5 y5 m9 m10 m11 y12 y13 y1 s5')), null);
  assert.equal(M.finishKind(parse('k1 k2 k3 k4 s5 m5 y5 m9 m10 m11 y11 y12 y13 y1')), 'seri');
  assert.equal(M.finishKind(parse('k1 k2 k3 J s5 m5 y5 m9 m10 m11 y11 y12 J y1')), 'seri');
  assert.equal(M.finishKind(parse('k1 k1 s4 s4 m7 m7 y9 y9 k13 k13 s2 s2 m3 J')), 'cift');
  assert.equal(M.finishKind(parse('k1 k1 s4 s4 m7 m7 y9 y9 k13 k13 s2 s2 m3 m4')), null);
  // aynı sayıdan iki taş: biri pere, biri seriye
  assert.equal(M.finishKind(parse('k5 s5 m5 k5 k6 k7 y1 y2 y3 y4 s10 s11 s12 s13')), 'seri');
  assert.equal(M.finishKind(parse('k5 s5 m5 y5 k6 k8 y1 y2 y3 y4 s10 s11 s12 s13')), null);
});

test('dağıtım: başlayan 15, diğerleri 14 taş; deste 48', () => {
  const st = M.newHand(42, 0);
  assert.equal(st.starter, 1);
  assert.deepEqual(st.hands.map((h) => h.length), [14, 15, 14, 14]);
  assert.equal(st.deck.length, 106 - 1 - 57);
  assert.equal(st.turn, 1); assert.equal(st.phase, 'play');
  assert.ok(!st.indicator.fake);
});

test('puanlama: normal 2, okeyle 4, çift 4, çift+okey 8, gösterge 1', () => {
  assert.equal(M.finishPoints('seri', false), 2);
  assert.equal(M.finishPoints('seri', true), 4);
  assert.equal(M.finishPoints('cift', false), 4);
  assert.equal(M.finishPoints('cift', true), 8);
  const st = M.newHand(7, 3); st.shown = 2; M.endHand(st, 0, { kind: 'seri', okey: false });
  assert.deepEqual(st.result.points, [-1, -3, -2, -3]);
});

test('sıra kuralları: çekmeden atılmaz, yan taş soldan gelir', () => {
  const st = M.newHand(5, 3); // başlayan 0
  assert.equal(M.draw(st, 0, false).error, 'already_drawn');
  const t = st.hands[0][0];
  assert.ok(M.discard(st, 0, t.id).ok);
  assert.equal(st.turn, 1);
  assert.equal(M.discard(st, 1, st.hands[1][0].id).error, 'need_draw');
  const r = M.draw(st, 1, true);
  assert.ok(r.ok); assert.equal(r.tile.id, t.id);
  assert.equal(M.finish(st, 1, st.hands[1][0].id).error, 'not_finished');
});

test('gösterge: yalnızca ilk çekişten önce', () => {
  for (let seed = 1; seed < 400; seed++) {
    const st = M.newHand(seed, 0); const p = st.starter;
    if (!M.showTile(st, p)) continue;
    assert.ok(M.canShow(st, p));
    M.discard(st, p, st.hands[p].find((t) => !M.showTile(st, p) || t.id !== M.showTile(st, p).id).id);
    assert.equal(M.canShow(st, p), false, 'atıştan sonra gösterilemez');
    return;
  }
  assert.fail('göstergeli el bulunamadı');
});

function playHand(seed, dealer, levels) {
  const st = M.newHand(seed, dealer);
  let guard = 0;
  while (!st.over && guard++ < 400) {
    const p = st.turn, lv = levels[p];
    if (M.canShow(st, p)) M.show(st, p);
    if (st.phase === 'draw') {
      const side = M.botWantsSide(st, p, lv);
      if (!side && !st.deck.length) { M.pass(st, p); break; }
      assert.ok(M.draw(st, p, side).ok);
    }
    const f = M.findFinish(st.hands[p], st.opts);
    if (f) { assert.ok(M.finish(st, p, f.id).ok); break; }
    assert.ok(M.discard(st, p, M.chooseDiscard(st, p, lv)).ok);
    for (let q = 0; q < 4; q++) assert.equal(st.hands[q].length, q === st.turn ? 14 : 14);
  }
  assert.ok(st.over, 'el bitmeli');
  return st;
}

test('bot simülasyonu: orta botlar eli bitirir, taş sayısı korunur', () => {
  let wins = 0;
  for (let i = 0; i < 120; i++) {
    const st = playHand(1000 + i, i % 4, ['normal', 'normal', 'normal', 'normal']);
    const total = st.deck.length + st.hands.flat().length + st.discards.flat().length + (st.finishTile ? 1 : 0);
    assert.equal(total, 105);
    if (st.result.winner >= 0) wins++;
  }
  assert.ok(wins >= 60, 'bitirilen el: ' + wins);
});

test('zor bot, kolay bota karşı daha çok kazanır', () => {
  let hard = 0, easy = 0;
  for (let i = 0; i < 120; i++) {
    const st = playHand(5000 + i, i % 4, ['hard', 'easy', 'hard', 'easy']);
    if (st.result.winner === 0 || st.result.winner === 2) hard++;
    else if (st.result.winner >= 0) easy++;
  }
  assert.ok(hard > easy, 'zor ' + hard + ' / kolay ' + easy);
});

test('ipucu: başlayana atış ya da bitiş önerir', () => {
  const st = M.newHand(9, 0); const h = M.hint(st, st.starter);
  assert.ok(['discard', 'finish', 'show'].includes(h.a));
});

test('seçenekler: çift kapalıysa 7 çift bitirmez, gösterge kapalıysa gösterilemez', () => {
  const pairs = parse('k1 k1 s4 s4 m7 m7 y9 y9 k13 k13 s2 s2 m3 J');
  assert.equal(M.finishKind(pairs, { cift: false }), null);
  for (let seed = 1; seed < 400; seed++) {
    const st = M.newHand(seed, 0, { show: false });
    if (M.showTile(st, st.starter)) { assert.equal(M.canShow(st, st.starter), false); return; }
  }
});
