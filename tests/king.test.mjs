// King kural motoru testleri: node --test tests/king.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../king/motor.js');

const C = (x) => M.card(M.cardId(x[0], +x.slice(1)));
const H = (s) => s.split(' ').map(C);
const T = (pairs) => pairs.map(([p, x]) => ({ p, c: C(x) }));
const ids = (cs) => cs.map((c) => c.id).sort((a, b) => a - b);

test('plan: tam oyunda 20 el, her ceza 2 kez, herkese 2 koz + 3 ceza', () => {
  for (let trial = 0; trial < 200; trial++) {
    const R = M.rng(trial + 1), plan = M.newPlan('full', trial % 4);
    for (let i = 0; i < plan.hands; i++) {
      const al = M.allowed(plan, i);
      assert.ok(al.length > 0, 'her elde seçilecek oyun olmalı');
      assert.ok(M.record(plan, i, al[Math.floor(R() * al.length)]));
    }
    M.CEZA.forEach((k) => assert.equal(plan.used[k], 2, k));
    assert.deepEqual(plan.kozUsed, [2, 2, 2, 2]);
    for (let p = 0; p < 4; p++) assert.equal(plan.log.filter((x) => x.p === p).length, 5);
  }
});

test('plan: kısa oyunda 10 el, her ceza 1 kez, herkese 1 koz; izin verilmeyen oyun seçilemez', () => {
  for (let trial = 0; trial < 200; trial++) {
    const R = M.rng(trial + 99), plan = M.newPlan('short', trial % 4);
    for (let i = 0; i < plan.hands; i++) {
      const al = M.allowed(plan, i);
      assert.ok(al.length > 0);
      assert.ok(M.record(plan, i, al[Math.floor(R() * al.length)]));
    }
    M.CEZA.forEach((k) => assert.equal(plan.used[k], 1, k));
    assert.deepEqual(plan.kozUsed, [1, 1, 1, 1]);
  }
  const plan = M.newPlan('full', 0);
  M.record(plan, 0, 'kiz'); M.record(plan, 1, 'kiz');
  assert.ok(!M.allowed(plan, 2).includes('kiz'), 'iki kez oynanan ceza bir daha seçilemez');
  assert.equal(M.record(plan, 2, 'kiz'), false);
});

test('elin kazananı: koz oyununda koz, cezada yerdeki rengin en büyüğü', () => {
  assert.equal(M.winnerIdx(T([[0, 'S10'], [1, 'S14'], [2, 'H2'], [3, 'S13']]), null), 1);
  assert.equal(M.winnerIdx(T([[0, 'S10'], [1, 'S14'], [2, 'H2'], [3, 'S13']]), 'H'), 2);
});

test('yasal kartlar: renge uy, koz zorunlu, ceza kartını atma zorunluluğu, kupa açılmadan kupayla başlanmaz', () => {
  const O = M.opts();
  // renge uy
  assert.deepEqual(ids(M.legalFor(H('S14 S3 H12 D5'), T([[1, 'S10']]), 'el', null, {}, O)), ids(H('S14 S3')));
  // koz: renk yoksa koz at (yükseltme zorunlu değil)
  assert.deepEqual(ids(M.legalFor(H('H12 H2 D5'), T([[1, 'C10'], [2, 'H13']]), 'koz', 'H', {}, O)), ids(H('H12 H2')));
  // kız almaz: renk yoksa kız at
  assert.deepEqual(ids(M.legalFor(H('H12 D12 D5 S3'), T([[1, 'C10']]), 'kiz', null, {}, O)), ids(H('H12 D12')));
  // kız almaz: yerde papaz varken elindeki kızı atmak zorundasın
  assert.deepEqual(ids(M.legalFor(H('C12 C3 D5'), T([[1, 'C13']]), 'kiz', null, {}, O)), ids(H('C12')));
  // ...ama yerde küçük kart varken serbest
  assert.deepEqual(ids(M.legalFor(H('C12 C3 D5'), T([[1, 'C9']]), 'kiz', null, {}, O)), ids(H('C12 C3')));
  // rıfkı: kupa yoksa ve kupa açılmışsa rıfkıyı at
  assert.deepEqual(ids(M.legalFor(H('H13 S2 D5'), T([[1, 'C10']]), 'rifki', null, {}, O)), ids(H('H13')));
  // rıfkı: yerde kupa ası varsa rıfkı yakılır
  assert.deepEqual(ids(M.legalFor(H('H13 H3'), T([[1, 'H14']]), 'rifki', null, {}, O)), ids(H('H13')));
  // erkek almaz: renk yoksa papaz/vale at
  assert.deepEqual(ids(M.legalFor(H('S11 D13 D5'), T([[1, 'C10']]), 'erkek', null, {}, O)), ids(H('S11 D13')));
  // kupa almaz: kupa açılmadan kupayla başlanmaz
  assert.deepEqual(ids(M.legalFor(H('H5 S3'), [], 'kupa', null, { heartsBroken: false }, O)), ids(H('S3')));
  assert.deepEqual(ids(M.legalFor(H('H5 S3'), [], 'kupa', null, { heartsBroken: true }, O)), ids(H('H5 S3')));
  assert.deepEqual(ids(M.legalFor(H('H5 H3'), [], 'kupa', null, { heartsBroken: false }, O)), ids(H('H5 H3')));
  // koz açılmadan kozla başlanmaz
  assert.deepEqual(ids(M.legalFor(H('H5 S3'), [], 'koz', 'H', { trumpBroken: false }, O)), ids(H('S3')));
  // kurallar kapalıyken renk yoksa serbest
  const loose = M.opts({ strict: false, kozBreak: false });
  assert.deepEqual(ids(M.legalFor(H('H12 D12 D5 S3'), T([[1, 'C10']]), 'kiz', null, {}, loose)), ids(H('H12 D12 D5 S3')));
  assert.deepEqual(ids(M.legalFor(H('H5 S3'), [], 'kupa', null, {}, loose)), ids(H('H5 S3')));
});

test('ceza birimleri ve son iki', () => {
  const cards = T([[0, 'H12'], [1, 'H13'], [2, 'S11'], [3, 'D12']]);
  assert.equal(M.trickUnits('kupa', cards, 0), 2);
  assert.equal(M.trickUnits('erkek', cards, 0), 2);
  assert.equal(M.trickUnits('kiz', cards, 0), 2);
  assert.equal(M.trickUnits('rifki', cards, 0), 1);
  assert.equal(M.trickUnits('el', cards, 0), 1);
  assert.equal(M.trickUnits('son', cards, 10), 0);
  assert.equal(M.trickUnits('son', cards, 11), 1);
  assert.equal(M.trickUnits('son', cards, 12), 1);
});

test('el akışı ve erken bitiş: rıfkı alınınca el biter', () => {
  const st = M.newHand(5, 0);
  assert.equal(st.phase, 'choose'); assert.equal(st.turn, 0);
  assert.equal(M.choose(st, 0, 'koz', ['el']).error, 'not_allowed');
  assert.ok(M.choose(st, 0, 'rifki', ['rifki']).ok);
  st.hands = [H('H13 S2'), H('H14 S3'), H('C5 S4'), H('D5 S5')];
  st.heartsBroken = true;
  assert.ok(M.play(st, 0, C('H13').id).ok);
  assert.ok(M.play(st, 1, C('H14').id).ok);
  assert.ok(M.play(st, 2, C('C5').id).ok);
  const r = M.play(st, 3, C('D5').id);
  assert.ok(r.done && r.over && r.early);
  assert.equal(st.result.points[1], -320);
  assert.deepEqual(st.result.points, [0, -320, 0, 0]);
});

// bir eli botlarla sonuna kadar oynat
function playHand(seed, chooser, k, levels, R, o) {
  const st = M.newHand(seed, chooser, o);
  assert.ok(M.choose(st, chooser, k).ok);
  if (k === 'koz') assert.ok(M.chooseTrump(st, chooser, M.botTrump(st.hands[chooser])).ok);
  let g = 0;
  while (!st.over && g++ < 60) {
    const p = st.turn, id = M.botPlay(st, p, levels[p], R);
    assert.ok(M.legal(st, p).some((c) => c.id === id), 'bot yasal kart atar');
    const res = M.play(st, p, id); assert.ok(res.ok, res.error);
  }
  assert.ok(st.over);
  return st;
}

test('botlar: her oyun türünde el biter, ceza toplamı tam çıkar', () => {
  const lv = ['easy', 'normal', 'hard'];
  const full = { el: -650, kupa: -390, erkek: -480, kiz: -400, son: -360, rifki: -320, koz: 650 };
  for (let i = 1; i <= 140; i++) {
    const k = M.CEZA.concat(['koz'])[i % 7], R = M.rng(i);
    const st = playHand(i * 7919, i % 4, k, [0, 1, 2, 3].map((x) => lv[(i + x) % 3]), R, i % 5 === 0 ? { strict: false, kozBreak: false } : null);
    const sum = st.result.points.reduce((a, b) => a + b, 0);
    assert.equal(sum, full[k], k + ' toplamı');
    if (!st.early) assert.equal(st.tricks.reduce((a, b) => a + b, 0), 13);
  }
});

test('bütün oyun: 20 el, puan toplamı sıfır', () => {
  for (let g = 0; g < 10; g++) {
    const R = M.rng(1000 + g), plan = M.newPlan('full', g % 4), scores = [0, 0, 0, 0];
    for (let i = 0; i < plan.hands; i++) {
      const p = M.chooserAt(plan, i), al = M.allowed(plan, i);
      const st = M.newHand(5000 + g * 31 + i, p);
      const k = M.botChoose(st.hands[p], al, 'normal', R);
      assert.ok(al.includes(k));
      const done = playHand(5000 + g * 31 + i, p, k, ['hard', 'normal', 'hard', 'normal'], R);
      M.record(plan, i, k, { points: done.result.points });
      done.result.points.forEach((v, q) => { scores[q] += v; });
    }
    assert.equal(scores.reduce((a, b) => a + b, 0), 0);
  }
});

test('zor bot cezalarda kolay bottan az puan kaybeder', () => {
  let hard = 0, easy = 0;
  for (let i = 1; i <= 240; i++) {
    const k = M.CEZA[i % 6];
    const st = playHand(i * 104729, i % 4, k, ['hard', 'easy', 'hard', 'easy'], M.rng(i));
    hard += st.result.points[0] + st.result.points[2];
    easy += st.result.points[1] + st.result.points[3];
  }
  assert.ok(hard > easy, `zor ${hard} · kolay ${easy}`);
});

test('ipucu her aşamada geçerli hamle önerir', () => {
  const st = M.newHand(77, 2);
  let h = M.hint(st, 2, ['kiz', 'koz']);
  assert.equal(h.a, 'choose'); assert.ok(['kiz', 'koz'].includes(h.k));
  assert.equal(M.hint(st, 1), null);
  M.choose(st, 2, 'koz'); h = M.hint(st, 2); assert.equal(h.a, 'trump');
  M.chooseTrump(st, 2, h.s); h = M.hint(st, 2); assert.equal(h.a, 'play');
  assert.ok(M.legal(st, 2).some((c) => c.id === h.id));
});

test('ipucu, arayüzün kurduğu kısıtlı durumda da çalışır (history yok, yalnız kendi elim)', () => {
  for (const k of M.CEZA.concat(['koz'])) {
    const st = M.newHand(4242, 0);
    M.choose(st, 0, k); if (k === 'koz') M.chooseTrump(st, 0, 'S');
    // birkaç kart oynat
    for (let n = 0; n < 6 && !st.over; n++) M.play(st, st.turn, M.botPlay(st, st.turn, 'normal'));
    if (st.over) continue;
    const p = st.turn, hands = [[], [], [], []]; hands[p] = st.hands[p];
    const fake = { ...st, hands, history: undefined, lastTrick: st.lastTrick };
    const h = M.hint(fake, p);
    assert.equal(h.a, 'play', k);
    assert.ok(M.legal(st, p).some((c) => c.id === h.id), k + ' ipucu yasal');
  }
});
