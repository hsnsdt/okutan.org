// Sudoku kural motoru testleri: node --test tests/sudoku.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../sudoku/motor.js');

// Bilinen, tek çözümlü bir bulmaca
const P = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'.split('').map(Number);
const SOL = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'.split('').map(Number);

test('komşuluk: her hücrenin 20 komşusu var', () => {
  for (let i = 0; i < 81; i++) assert.equal(S.PEERS[i].length, 20);
  assert.equal(S.BOX[0], 0); assert.equal(S.BOX[80], 8); assert.equal(S.BOX[40], 4);
});

test('çözücü bilinen bulmacayı çözer, tek çözüm sayar', () => {
  assert.deepEqual(S.solve(P), SOL);
  assert.equal(S.countSolutions(P, 2).count, 1);
  const empty = new Array(81).fill(0);
  assert.equal(S.countSolutions(empty, 2).count, 2);
});

test('adaylar ve çakışmalar', () => {
  assert.deepEqual(S.candidates(P, 2), [1, 2, 4]);
  assert.deepEqual(S.candidates(P, 0), []);
  const g = P.slice(); g[2] = 5; // aynı satırda iki 5
  assert.deepEqual(S.conflicts(g).sort((a, b) => a - b), [0, 2]);
  assert.equal(S.conflicts(P).length, 0);
  assert.ok(S.isSolved(SOL, SOL));
  assert.ok(!S.isSolved(P, SOL));
});

test('değerlendirici: kolay bulmaca tek adaylarla çözülür', () => {
  const r = S.rate(P);
  assert.ok(r.solved);
  assert.equal(r.level, 1);
});

test('üretici: her zorlukta tek çözüm, verilenler çözümle uyumlu, zorluk aralıkta', () => {
  for (const lv of S.LEVEL_KEYS) {
    for (let s = 1; s <= 6; s++) {
      const p = S.generate(4242 + s, lv), L = S.LEVELS[lv];
      assert.equal(S.countSolutions(p.puzzle, 2).count, 1, lv + ' tek çözüm');
      for (let i = 0; i < 81; i++) if (p.puzzle[i]) assert.equal(p.puzzle[i], p.solution[i]);
      assert.ok(S.isSolved(p.solution));
      assert.ok(p.rating >= L.minT && p.rating <= L.maxT, lv + ' zorluk ' + p.rating);
      assert.equal(p.givens, p.puzzle.filter(Boolean).length);
    }
  }
});

test('üretici tohumlu: aynı tohum aynı bulmaca', () => {
  assert.deepEqual(S.generate(99, 'zor'), S.generate(99, 'zor'));
  assert.notDeepEqual(S.generate(99, 'zor').puzzle, S.generate(100, 'zor').puzzle);
});

test('günün bulmacası: gün numarası, haftalık zorluk, herkese aynı', () => {
  assert.equal(S.dayNumber(S.EPOCH), 1);
  assert.equal(S.dayNumber('2026-11-25'), 2);
  assert.equal(S.dayNumber('2027-01-01'), 39);
  assert.equal(S.dailyLevel('2026-11-23'), 'kolay'); // pazartesi
  assert.equal(S.dailyLevel('2026-11-28'), 'uzman'); // cumartesi
  assert.deepEqual(S.daily('2026-11-24'), S.daily('2026-11-24'));
  assert.equal(S.daily('2026-11-24').level, 'orta');
});

test('ipucu: yanlış rakamı, tek adayı ya da gizli teki gösterir', () => {
  const g = P.slice(); g[2] = 1; // doğrusu 4
  assert.deepEqual(S.hint(g, SOL), { type: 'wrong', i: 2 });
  const h = S.hint(P, SOL);
  assert.ok(h.type === 'naked' || h.type === 'hidden');
  assert.equal(h.v, SOL[h.i]);
  assert.equal(S.hint(SOL, SOL), null);
});

test('istatistik: seri ve süre biçimi', () => {
  let st = S.addResult(null, 5, 300);
  st = S.addResult(st, 6, 200);
  assert.equal(st.streak, 2); assert.equal(st.solved, 2);
  st = S.addResult(st, 6, 200); // aynı gün iki kez sayılmaz
  assert.equal(st.solved, 2);
  st = S.addResult(st, 9, 100);
  assert.equal(st.streak, 1); assert.equal(st.best, 2);
  assert.equal(S.liveStreak(st, 10), 1); assert.equal(S.liveStreak(st, 11), 0);
  assert.equal(S.fmtTime(65), '01:05'); assert.equal(S.fmtTime(3725), '1:02:05');
});
