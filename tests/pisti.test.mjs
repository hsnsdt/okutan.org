// Pişti kural motoru testleri: node --test tests/pisti.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../pisti/motor.js');

const C = (x) => M.card(M.cardId(x[0], +x.slice(1)));
const H = (s) => s.split(' ').map(C);

test('dağıtım: 2 ve 4 kişide 4er kart, yerde 4 kart (3 kapalı), deste doğru', () => {
  const a = M.newHand(7, 0, 2);
  assert.deepEqual(a.hands.map((h) => h.length), [4, 4]);
  assert.equal(a.pile.length, 4); assert.equal(a.closed, 3);
  assert.equal(a.deck.length, 52 - 4 - 8);
  assert.equal(a.turn, 1, 'dağıtanın sağı başlar');
  const b = M.newHand(7, 3, 4);
  assert.deepEqual(b.hands.map((h) => h.length), [4, 4, 4, 4]);
  assert.equal(b.deck.length, 52 - 4 - 16);
  assert.equal(b.turn, 0);
  assert.deepEqual(M.newHand(7, 0, 2).hands, a.hands, 'aynı tohum aynı el');
});

function setup(n, hands, pile, closed = 0, deck = []) {
  const st = M.newHand(1, n - 1, n);
  st.hands = hands.map(H); st.pile = pile ? H(pile) : []; st.closed = closed; st.deck = deck; st.turn = 0;
  return st;
}

test('aynı sayıyla al, vale ile al, pişti ve vale piştisi', () => {
  let st = setup(2, ['S7 H2', 'C9 D4'], 'D5 C7');
  let r = M.play(st, 0, C('S7').id);
  assert.ok(r.capture); assert.equal(r.pisti, 0); assert.equal(st.captured[0].length, 3); assert.equal(st.pile.length, 0);
  st = setup(2, ['S7 H2', 'C9 D4'], 'D7');
  r = M.play(st, 0, C('S7').id);
  assert.equal(r.pisti, 10); assert.equal(st.pistis[0].normal, 1);
  st = setup(2, ['S11 H2', 'C9 D4'], 'D11');
  r = M.play(st, 0, C('S11').id);
  assert.equal(r.pisti, 20, 'vale piştisi'); assert.equal(st.pistis[0].vale, 1);
  st = setup(2, ['S11 H2', 'C9 D4'], 'D5');
  r = M.play(st, 0, C('S11').id);
  assert.ok(r.capture); assert.equal(r.pisti, 0, 'tek kartı vale ile almak pişti değil');
  st = setup(2, ['S8 H2', 'C9 D4'], 'D5');
  r = M.play(st, 0, C('S8').id);
  assert.ok(!r.capture); assert.equal(st.pile.length, 2);
  assert.equal(M.play(st, 0, C('H2').id).error, 'not_your_turn');
});

test('eller bitince yeniden dağıtılır; el sonunda yerde kalan son alana gider', () => {
  const st = setup(2, ['S7', 'C9'], 'D7', 0, H('S2 S3 S4 S5 H2 H3 H4 H5'));
  M.play(st, 0, C('S7').id); // 0 alır
  const r = M.play(st, 1, C('C9').id);
  assert.ok(r.dealt); assert.deepEqual(st.hands.map((h) => h.length), [4, 4]);
  const s2 = setup(2, ['S7 H3', 'C9 D4'], 'D7');
  M.play(s2, 0, C('S7').id); // pişti, 0 son alan
  M.play(s2, 1, C('C9').id); M.play(s2, 0, C('H3').id);
  const end = M.play(s2, 1, C('D4').id);
  assert.ok(end.over); assert.equal(s2.result.rest, 3); assert.equal(s2.captured[0].length, 5);
});

test('puan: as, vale, sinek 2, karo 10, en çok kart, pişti', () => {
  const st = M.newHand(3, 0, 2);
  st.captured = [H('S14 H14 C2 D10 S11 H5 H6 H7'), H('D14 C14 D11 C11 H11 S3')];
  st.pistis = [{ normal: 1, vale: 0 }, { normal: 0, vale: 1 }];
  const r = M.scoreHand(st);
  assert.equal(r.teams[0].cardPts, 2 + 2 + 3 + 1); // 2 as, sinek 2, karo 10, 1 vale
  assert.equal(r.teams[0].most, 3);
  assert.deepEqual(r.points, [8 + 3 + 10, 5 + 20]);
  // eşitlikte en çok kart puanı yok
  st.captured = [H('S2 S3'), H('S4 S5')]; st.pistis = [{ normal: 0, vale: 0 }, { normal: 0, vale: 0 }];
  assert.deepEqual(M.scoreHand(st).points, [0, 0]);
});

test('eşli oyunda takım puanı birleşir', () => {
  const st = M.newHand(3, 0, 4);
  st.captured = [H('S14'), H('H14'), H('C2'), H('D10')];
  st.pistis = [{ normal: 1, vale: 0 }, { normal: 0, vale: 0 }, { normal: 0, vale: 0 }, { normal: 0, vale: 0 }];
  const r = M.scoreHand(st);
  assert.deepEqual(r.points, [1 + 2 + 10, 1 + 3]);
});

function playOut(seed, n, levels, R) {
  const st = M.newHand(seed, seed % n, n);
  let g = 0;
  while (!st.over && g++ < 80) {
    const p = st.turn, id = M.botPlay(st, p, levels[p], R);
    assert.ok(st.hands[p].some((c) => c.id === id));
    assert.ok(M.play(st, p, id).ok);
  }
  assert.ok(st.over);
  return st;
}

test('botlar 300 el oynar: 52 kartın hepsi dağıtılır, kart puanı her elde 13 (+3 en çok kart)', () => {
  const lv = ['easy', 'normal', 'hard'];
  for (let i = 1; i <= 300; i++) {
    const n = i % 3 === 0 ? 4 : 2;
    const st = playOut(i * 7919, n, [0, 1, 2, 3].map((k) => lv[(i + k) % 3]), M.rng(i));
    assert.equal(st.captured.flat().length, 52);
    const r = st.result;
    assert.equal(r.teams.reduce((a, d) => a + d.cardPts, 0), 13);
    const pist = st.pistis.reduce((a, x) => a + x.normal * 10 + x.vale * 20, 0);
    assert.equal(r.points.reduce((a, b) => a + b, 0), 13 + (r.teams.some((d) => d.most) ? 3 : 0) + pist);
  }
});

test('zor bot kolay bottan çok puan alır', () => {
  let hard = 0, easy = 0;
  for (let i = 1; i <= 400; i++) {
    const st = playOut(i * 104729, 2, i % 2 ? ['hard', 'easy'] : ['easy', 'hard'], M.rng(i));
    const h = i % 2 ? 0 : 1;
    hard += st.result.points[h]; easy += st.result.points[1 - h];
  }
  assert.ok(hard > easy * 1.1, `zor ${hard} · kolay ${easy}`);
});

test('ipucu: tek kart varken aynısı elde ise pişti önerir', () => {
  const st = setup(2, ['S7 H2 C9 D4', 'C3 D5 H6 S8'], 'D7');
  assert.equal(M.hint(st, 0).id, C('S7').id);
  const s2 = setup(2, ['S11 H2 C9 D4', 'C3 D5 H6 S8'], 'D11');
  assert.equal(M.hint(s2, 0).id, C('S11').id, 'vale piştisi');
});
