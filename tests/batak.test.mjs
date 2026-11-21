// Batak kural motoru testleri: node --test tests/batak.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../batak/motor.js');

// 'S14' → maça as · 'H10' → kupa 10
const C = (x) => M.card(M.cardId(x[0], +x.slice(1)));
const H = (s) => s.split(' ').map(C);
const T = (pairs) => pairs.map(([p, x]) => ({ p, c: C(x) }));
const O = M.opts();

test('dağıtım: herkese 13 kart, 52 farklı kart, tohum aynıysa aynı el', () => {
  const a = M.newHand(12345, 0), b = M.newHand(12345, 0);
  assert.deepEqual(a.hands.map((h) => h.length), [13, 13, 13, 13]);
  const ids = new Set(a.hands.flat().map((c) => c.id));
  assert.equal(ids.size, 52);
  assert.deepEqual(a.hands, b.hands);
  assert.equal(a.turn, 1, 'ihale dağıtanın sağından başlar');
  assert.notDeepEqual(M.newHand(54321, 0).hands, a.hands);
});

test('ihale: artırma, pas, tek kalan alır', () => {
  const st = M.newHand(1, 3); // 0 başlar
  assert.equal(M.bid(st, 1, 5).error, 'not_your_turn');
  assert.equal(M.bid(st, 0, 3).error, 'bad_bid', 'en az 4');
  assert.ok(M.bid(st, 0, 5).ok);
  assert.equal(M.bid(st, 1, 5).error, 'bad_bid', 'eşit ihale olmaz');
  assert.ok(M.bid(st, 1, 6).ok);
  assert.ok(M.bid(st, 2, 0).ok);
  assert.ok(M.bid(st, 3, 0).ok);
  assert.equal(st.turn, 0, 'pas diyen atlanır, sıra yeniden 0\'da');
  assert.ok(M.bid(st, 0, 7).ok);
  const r = M.bid(st, 1, 0);
  assert.ok(r.done); assert.equal(st.bidder, 0); assert.equal(st.bid, 7);
  assert.equal(st.phase, 'trump'); assert.equal(st.turn, 0);
  assert.equal(M.chooseTrump(st, 1, 'H').error, 'not_your_turn');
  assert.ok(M.chooseTrump(st, 0, 'H').ok);
  assert.equal(st.phase, 'play'); assert.equal(st.turn, 0, 'ihaleyi alan başlar');
  assert.equal(st.hands[0][0].s === 'H' || !st.hands[0].some((c) => c.s === 'H'), true, 'koz elde başa dizilir');
});

test('ihale: herkes pas derse dağıtana en az ihaleyle kalır; 13 söyleyen hemen alır', () => {
  const st = M.newHand(2, 2);
  [3, 0, 1, 2].forEach((p) => assert.ok(M.bid(st, p, 0).ok));
  assert.equal(st.bidder, 2); assert.equal(st.bid, 4); assert.equal(st.forced, true);
  const s2 = M.newHand(3, 0);
  M.bid(s2, 1, 0);
  const r = M.bid(s2, 2, 13);
  assert.ok(r.done); assert.equal(s2.bidder, 2); assert.equal(s2.bid, 13);
  const s3 = M.newHand(4, 0, { minBid: 5 });
  assert.equal(M.bid(s3, 1, 4).error, 'bad_bid');
  assert.ok(M.bid(s3, 1, 5).ok);
});

test('elin kazananı: koz varsa en büyük koz, yoksa yerdeki rengin en büyüğü', () => {
  assert.equal(M.winnerIdx(T([[0, 'S10'], [1, 'S14'], [2, 'H2'], [3, 'S13']]), 'D'), 1);
  assert.equal(M.winnerIdx(T([[0, 'S10'], [1, 'S14'], [2, 'H2'], [3, 'S13']]), 'H'), 2);
  assert.equal(M.winnerIdx(T([[0, 'S10'], [1, 'H3'], [2, 'H9'], [3, 'S13']]), 'H'), 2);
  assert.equal(M.winnerIdx(T([[0, 'C5'], [1, 'D14'], [2, 'C4'], [3, 'C6']]), 'S'), 3, 'başka renk as almaz');
});

test('yasal kartlar: renge uy, yükselt, koz at, koz açılmadan kozla başlama', () => {
  const ids = (cs) => cs.map((c) => c.id).sort((a, b) => a - b);
  const h = H('S14 S9 S3 H12 D5');
  // renge uy + yükselt
  assert.deepEqual(ids(M.legalFor(h, T([[1, 'S10']]), 'H', false, O)), ids(H('S14')));
  // geçemiyorsan aynı renkten herhangi biri
  assert.deepEqual(ids(M.legalFor(H('S9 S3 H12'), T([[1, 'S10']]), 'H', false, O)), ids(H('S9 S3')));
  // yerde koz varsa renge uy ama yükseltme zorunlu değil
  assert.deepEqual(ids(M.legalFor(h, T([[1, 'S10'], [2, 'H2']]), 'H', true, O)), ids(H('S14 S9 S3')));
  // renk yoksa koz zorunlu
  assert.deepEqual(ids(M.legalFor(h, T([[1, 'C10']]), 'H', false, O)), ids(H('H12')));
  // yerde koz varsa büyük kozla geç
  assert.deepEqual(ids(M.legalFor(H('H12 H4 D5'), T([[1, 'C10'], [2, 'H9']]), 'H', true, O)), ids(H('H12')));
  // geçemeyen yine koz atar
  assert.deepEqual(ids(M.legalFor(H('H8 H4 D5'), T([[1, 'C10'], [2, 'H9']]), 'H', true, O)), ids(H('H8 H4')));
  // koz da yoksa her kart
  assert.deepEqual(ids(M.legalFor(H('S3 D5'), T([[1, 'C10']]), 'H', false, O)), ids(H('S3 D5')));
  // koz açılmadan kozla başlanmaz; elde yalnız koz varsa olur
  assert.deepEqual(ids(M.legalFor(h, [], 'H', false, O)), ids(H('S14 S9 S3 D5')));
  assert.deepEqual(ids(M.legalFor(H('H12 H3'), [], 'H', false, O)), ids(H('H12 H3')));
  assert.deepEqual(ids(M.legalFor(h, [], 'H', true, O)), ids(h));
  // kurallar kapalıyken
  const loose = M.opts({ kozBreak: false, mustRaise: false });
  assert.deepEqual(ids(M.legalFor(h, [], 'H', false, loose)), ids(h));
  assert.deepEqual(ids(M.legalFor(h, T([[1, 'S10']]), 'H', false, loose)), ids(H('S14 S9 S3')));
});

test('hatalı kartın nedeni', () => {
  const st = M.newHand(7, 3);
  st.phase = 'play'; st.trump = 'H'; st.turn = 0; st.bidder = 0; st.bid = 5;
  st.hands = [H('S14 S9 H12 D5'), H('S10 S2 C3 C4'), H('D2 D3 D4 D6'), H('C5 C6 C7 C8')];
  assert.equal(M.play(st, 0, C('H12').id).error, 'koz_closed');
  assert.ok(M.play(st, 0, C('S9').id).ok);
  assert.equal(M.play(st, 1, C('C3').id).error, 'must_follow');
  assert.equal(M.play(st, 1, C('S2').id).error, 'must_raise');
  assert.ok(M.play(st, 1, C('S10').id).ok);
  assert.ok(M.play(st, 2, C('D2').id).ok, 'renk de koz da yok: serbest');
  assert.equal(st.voids[2].S, true); assert.equal(st.voids[2].H, true);
  const r = M.play(st, 3, C('C5').id);
  assert.ok(r.done); assert.equal(r.winner, 1); assert.equal(st.turn, 1); assert.equal(st.tricks[1], 1);
});

test('puan: tutturan aldığı kadar, batan ihale kadar eksi, diğerleri aldığı kadar', () => {
  assert.deepEqual(M.handPoints([8, 2, 2, 1], 0, 7), [8, 2, 2, 1]);
  assert.deepEqual(M.handPoints([6, 3, 2, 2], 0, 7), [-7, 3, 2, 2]);
  assert.deepEqual(M.handPoints([0, 13, 0, 0], 1, 13), [0, 13, 0, 0]);
});

// Botlar her seviyede yalnızca yasal hamle yapar ve el her zaman 13 elde biter
function simulate(seed, dealer, levels, o) {
  const st = M.newHand(seed, dealer, o), R = M.rng(seed ^ 0x9e3779b9);
  let guard = 0;
  while (!st.over && guard++ < 400) {
    const p = st.turn, lv = levels[p];
    if (st.phase === 'bid') assert.ok(M.bid(st, p, M.botBid(st, p, lv, R)).ok);
    else if (st.phase === 'trump') assert.ok(M.chooseTrump(st, p, M.botTrump(st, p)).ok);
    else {
      const id = M.botPlay(st, p, lv, R);
      assert.ok(M.legal(st, p).some((c) => c.id === id), 'bot yasal kart atar');
      const r = M.play(st, p, id); assert.ok(r.ok, r.error);
    }
  }
  return st;
}

test('botlar: 300 el sonuna kadar oynanır, toplam 13 el, puanlar tutarlı', () => {
  const lv = ['easy', 'normal', 'hard'];
  let made = 0, hands = 0, bidSum = 0;
  for (let i = 1; i <= 300; i++) {
    const st = simulate(i * 7919, i % 4, [0, 1, 2, 3].map((k) => lv[(i + k) % 3]), i % 5 === 0 ? { kozBreak: false, mustRaise: false } : null);
    assert.ok(st.over);
    assert.equal(st.tricks.reduce((a, b) => a + b, 0), 13);
    assert.equal(st.hands.flat().length, 0);
    assert.equal(st.played.length, 52);
    const r = st.result;
    assert.equal(r.points[r.bidder], r.made ? r.tricks[r.bidder] : -r.bid);
    hands++; bidSum += r.bid; if (r.made) made++;
  }
  // botların ihalesi makul olmalı: ne hep batan ne hep çok düşük
  const rate = made / hands;
  assert.ok(rate > 0.35 && rate < 0.95, 'ihaleyi tutturma oranı ' + rate);
  assert.ok(bidSum / hands >= 4 && bidSum / hands < 9, 'ortalama ihale ' + bidSum / hands);
});

test('zor bot, kolay bota karşı daha çok el alır', () => {
  let hard = 0, easy = 0;
  for (let i = 1; i <= 200; i++) {
    const st = simulate(i * 104729, i % 4, ['hard', 'easy', 'hard', 'easy']);
    hard += st.result.points[0] + st.result.points[2];
    easy += st.result.points[1] + st.result.points[3];
  }
  assert.ok(hard > easy, `zor ${hard} · kolay ${easy}`);
});

test('ipucu her aşamada geçerli bir hamle önerir', () => {
  const st = M.newHand(99, 3);
  let h = M.hint(st, 0);
  assert.equal(h.a, 'bid'); assert.ok(h.n === 0 || h.n >= 4);
  assert.equal(M.hint(st, 1), null, 'sıra başkasındayken ipucu yok');
  M.bid(st, 0, 4); M.bid(st, 1, 0); M.bid(st, 2, 0); M.bid(st, 3, 0);
  h = M.hint(st, 0); assert.equal(h.a, 'trump'); assert.ok(M.SUITS.includes(h.s));
  M.chooseTrump(st, 0, h.s);
  h = M.hint(st, 0); assert.equal(h.a, 'play');
  assert.ok(M.legal(st, 0).some((c) => c.id === h.id));
});
