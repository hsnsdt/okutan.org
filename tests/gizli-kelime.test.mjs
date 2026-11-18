// Gizli Kelime kural motoru testleri: node --test tests/gizli-kelime.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('../gizli-kelime/motor.js');
const S = require('../gizli-kelime/sozluk.js');

test('Türkçe büyük/küçük harf', () => {
  assert.equal(G.lower('IŞIK'), 'ışık');
  assert.equal(G.lower('İNCİR'), 'incir');
  assert.equal(G.upper('incir'), 'İNCİR');
  assert.equal(G.upper('ışık'), 'IŞIK');
  assert.equal(G.clean(' Kâ-lem1 '), 'klem'); // harf olmayanlar atılır
});

test('puanlama: doğru yer, başka yer, yok', () => {
  assert.deepEqual(G.score('kalem', 'kalem'), [2, 2, 2, 2, 2]);
  assert.deepEqual(G.score('melek', 'kalem'), [1, 0, 2, 2, 1]);
  assert.deepEqual(G.score('çiçek', 'kalem'), [0, 0, 0, 2, 1]);
  assert.ok(G.solved(G.score('deniz', 'deniz')));
  assert.ok(!G.solved(G.score('deniz', 'kalem')));
});

test('puanlama: tekrar eden harfler cevaptaki sayı kadar işaretlenir', () => {
  // cevapta tek A var: ilk A doğru yerdeyse ikinci A boş kalır
  assert.deepEqual(G.score('aaaaa', 'kalem'), [0, 2, 0, 0, 0]);
  // cevapta iki E var (melek): tahmindeki üç E'den yalnızca ikisi işaretlenir
  assert.deepEqual(G.score('eeeee', 'melek'), [0, 2, 0, 2, 0]);
  // doğru yerdeki harf, başka yerdeki aynı harften önce sayılır
  assert.deepEqual(G.score('ekmek', 'ceket'), [1, 1, 0, 2, 0]);
  // ı ile i farklı harftir
  assert.deepEqual(G.score('kılıç', 'kilim'), [2, 0, 2, 0, 0]);
});

test('klavye durumları en iyi bilgiyi tutar', () => {
  const g = ['melek', 'kalem'], sc = g.map(w => G.score(w, 'kalem'));
  const k = G.keyStates(g, sc);
  assert.equal(k.k, 2); assert.equal(k.m, 2); assert.equal(k.e, 2);
});

test('zor mod: bulunan ipuçları kullanılmalı', () => {
  const g = ['çiçek'], sc = [G.score('çiçek', 'kalem')]; // E doğru yerde, K başka yerde
  assert.match(G.hardCheck('kalıp', g, sc), /4\. harf E/);
  assert.match(G.hardCheck('belez', g, sc), /K harfini/);
  assert.equal(G.hardCheck('kalem', g, sc), null);
});

test('günün kelimesi: sabit, listeden ve tüm tur boyunca tekrarsız', () => {
  assert.equal(G.dayNumber('2026-11-18'), 1);
  assert.equal(G.dayNumber('2026-12-18'), 31);
  assert.equal(G.dayNumber('2027-01-01'), 45);
  assert.equal(G.dailyAnswer(S.CEVAP, 1), G.dailyAnswer(S.CEVAP, 1));
  const seen = new Set();
  for (let n = 1; n <= S.CEVAP.length; n++) seen.add(G.dailyAnswer(S.CEVAP, n));
  assert.equal(seen.size, S.CEVAP.length);
  assert.equal(G.fnv1a('gizli-kelime-0'), G.fnv1a('gizli-kelime-0'));
});

test('sözlük: cevaplar geçerli, hepsi 5 Türkçe harf, tekrar yok', () => {
  const ok = new Set(S.GECERLI);
  assert.ok(S.CEVAP.length >= 365);
  assert.equal(new Set(S.CEVAP).size, S.CEVAP.length);
  for (const w of S.CEVAP) assert.ok(ok.has(w), w);
  for (const w of S.GECERLI) {
    assert.equal(Array.from(w).length, G.LEN, w);
    assert.equal(G.clean(w), w, w);
  }
});

test('istatistik ve seri', () => {
  let st = G.newStats();
  st = G.addResult(st, 10, true, 3);
  st = G.addResult(st, 10, true, 3); // aynı gün sayılmaz
  st = G.addResult(st, 11, true, 4);
  assert.deepEqual([st.played, st.wins, st.streak, st.best], [2, 2, 2, 2]);
  assert.deepEqual(st.dist, [0, 0, 1, 1, 0, 0]);
  st = G.addResult(st, 13, true, 2); // bir gün atlandı: seri baştan
  assert.equal(st.streak, 1); assert.equal(st.best, 2);
  st = G.addResult(st, 14, false, 6);
  assert.equal(st.streak, 0); assert.equal(st.played, 4);
  assert.equal(G.liveStreak({ last: 12, streak: 5 }, 14), 0);
  assert.equal(G.liveStreak({ last: 13, streak: 5 }, 14), 5);
});

test('paylaşım metni kelimeyi açık etmez', () => {
  const sc = [G.score('çiçek', 'kalem'), G.score('kalem', 'kalem')];
  const t = G.shareText('Gizli Kelime #3', sc, true, false);
  assert.equal(t, 'Gizli Kelime #3 2/6\n\n⬛⬛⬛🟦🟧\n🟦🟦🟦🟦🟦');
  assert.ok(!/kalem/i.test(t));
  assert.match(G.shareText('X', sc, false, true), /X\/6\*/);
});
