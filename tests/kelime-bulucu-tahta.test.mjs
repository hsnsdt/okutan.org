import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../kelime-bulucu/tahta/tahta-motor.js');
const KB = require('../kelime-bulucu/motor.js');

const mini = ['kalem', 'kale', 'al', 'el', 'ak', 'ela', 'kel', 'elma', 'lama', 'ama', 'am', 'ma', 'me', 'em', 'ek', 'la', 'le'];
const H = T.hazirla(mini);
const koy = (t, r, c, s, yon = 'y') => { [...s].forEach((h, i) => { t[yon === 'y' ? r : r + i][yon === 'y' ? c + i : c] = { h, j: false }; }); return t; };

test('katlı kareler: standart düzen ve simetri', () => {
  assert.equal(T.KARE[0][0], 'K3'); assert.equal(T.KARE[7][7], 'K2'); assert.equal(T.KARE[1][5], 'H3');
  assert.equal(T.KARE[0][3], 'H2'); assert.equal(T.KARE[14][11], 'H2'); assert.equal(T.KARE[7][3], 'H2');
  const say = t => T.KARE.flat().filter(x => x === t).length;
  assert.equal(say('K3'), 8); assert.equal(say('K2'), 17); assert.equal(say('H3'), 12); assert.equal(say('H2'), 24);
});

test('ilk hamle merkezden geçer, merkez ×2', () => {
  const m = T.enIyiHamleler(H, T.bosTahta(), 'kalem');
  assert.ok(m.length);
  for (const x of m) assert.ok(x.yeni.some(y => y.r === 7 && y.c === 7), x.kelime + ' merkezden geçmeli');
  const kalem = m.find(x => x.kelime === 'kalem');
  // k1 a1 l1 e1 m2 = 6; konuma göre H2 kareye düşebilir; en az 6×2 = 12
  assert.ok(kalem.puan >= 12, 'kalem ' + kalem.puan);
  assert.equal(m[0].puan, Math.max(...m.map(x => x.puan)));
});

test('raf yetmezse hamle yok, joker 0 puan', () => {
  assert.equal(T.enIyiHamleler(H, T.bosTahta(), 'zzz').length, 0);
  const m = T.enIyiHamleler(H, T.bosTahta(), 'kale*');
  const kalem = m.find(x => x.kelime === 'kalem');
  assert.ok(kalem && kalem.yeni.filter(y => y.j).length === 1);
  const jk = kalem.yeni.find(y => y.j); assert.equal(jk.h, 'm');
});

test('tahtaya bağlı olmalı, çapraz kelimeler geçerli olmalı', () => {
  const t = koy(T.bosTahta(), 7, 5, 'kale'); // K A L E yatay, (7,5)-(7,8)
  const m = T.enIyiHamleler(H, t, 'm');
  // "kalem" için m (7,9)'a eklenir
  const k = m.find(x => x.kelime === 'kalem' && x.yon === 'y');
  assert.ok(k, 'kalem uzatması bulunmalı');
  assert.deepEqual(k.yeni, [{ r: 7, c: 9, h: 'm', j: false }]);
  // kale üzerindeki harfler raf sayılmaz; her hamle en az bir yeni taş koyar ve tahtaya bağlıdır
  for (const x of m) assert.ok(x.yeni.length >= 1);
  // dikey "el" e harfinin altına l koyarak: e (7,8) + l (8,8)
  const t2 = koy(T.bosTahta(), 7, 5, 'kale');
  const m2 = T.enIyiHamleler(H, t2, 'l');
  assert.ok(m2.find(x => x.kelime === 'el' && x.yon === 'd'));
});

test('7 taş: 50 bonus', () => {
  const s = ['abcçdef'.slice(0, 0) + 'kalemle'];
  const h2 = T.hazirla(['kalemle']);
  const m = T.enIyiHamleler(h2, T.bosTahta(), 'kalemle');
  assert.ok(m.length && m[0].bingo);
  assert.ok(m[0].puan >= 50 + 9);
});

test('gerçek sözlükte ilk hamle makul sürede', () => {
  const s = KB.sozlukAc(readFileSync(new URL('../kelime-bulucu/sozluk.txt', import.meta.url), 'utf8'));
  const hz = T.hazirla(s);
  const t0 = Date.now();
  const m = T.enIyiHamleler(hz, T.bosTahta(), 'jkalem*');
  assert.ok(m.length > 10);
  const t = koy(T.bosTahta(), 7, 4, 'kitap');
  const m2 = T.enIyiHamleler(hz, t, 'aerslmu');
  assert.ok(m2.length > 10);
  assert.ok(Date.now() - t0 < 15000, 'süre ' + (Date.now() - t0));
  assert.equal(T.koordinat(7, 7), 'H8');
});
