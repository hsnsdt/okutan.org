import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const KB = require('../kelime-bulucu/motor.js');

const mini = ['ak', 'al', 'ala', 'alem', 'el', 'kal', 'kale', 'kalem', 'kalemler', 'kelam', 'lame', 'makale', 'mal', 'mel', 'şeker', 'ışık', 'iç'];
const kel = r => r.map(x => x.k).sort();

test('kucuk: Türkçe büyük harfler doğru küçülür', () => {
  assert.equal(KB.kucuk('IŞIK İÇİN'), 'ışık için');
  assert.equal(KB.kucuk('Kâğıt'), 'kağıt');
  assert.equal(KB.harf('K-a l3m!'), 'kalm');
  assert.equal(KB.raf('ka?L.*'), 'ka*l**');
  assert.equal(KB.kalip('K**L.M'), 'k*l?m');
});

test('harflerle: yalnızca raftaki harfler, her harf bir kez', () => {
  assert.deepEqual(kel(KB.harflerle(mini, 'kalem')), ['ak', 'al', 'ala', 'alem', 'el', 'kal', 'kale', 'kalem', 'kelam', 'lame', 'mal', 'mel'].filter(w => {
    // "ala" iki a ister, rafta bir a var
    return w !== 'ala';
  }));
});

test('harflerle: joker eksik harfi tamamlar ve konumu döner', () => {
  const r = KB.harflerle(mini, 'kale*');
  const ala = r.find(x => x.k === 'ala');
  assert.ok(ala, 'joker ikinci a için kullanılmalı');
  assert.deepEqual(ala.j, [2]);
  const kalem = r.find(x => x.k === 'kalem');
  assert.deepEqual(kalem.j, [4]);
  assert.ok(!r.find(x => x.k === 'makale'), 'iki eksik harf, tek joker');
});

test('harflerle: Türkçe harfler ayrı sayılır', () => {
  assert.deepEqual(kel(KB.harflerle(mini, 'ışk')), []);
  assert.deepEqual(kel(KB.harflerle(mini, 'ışık')), ['ışık']);
  assert.deepEqual(kel(KB.harflerle(mini, 'İÇ')), ['iç']);
});

test('harflerle: geçecek ifade raftan sayılmaz, kelimeden fazlası olmalı', () => {
  const r = KB.harflerle(mini, 'mler', { gecen: 'kale' });
  assert.deepEqual(kel(r), ['kalem', 'kalemler']);
  assert.equal(r.find(x => x.k === 'kalem').g, 0);
  assert.deepEqual(kel(KB.harflerle(mini, 'ma', { gecen: 'kale' })), ['kalem', 'makale']);
  assert.ok(!KB.harflerle(mini, 'x', { gecen: 'kale' }).find(x => x.k === 'kale'));
});

test('harflerle: uzunluk süzgeci', () => {
  assert.deepEqual(kel(KB.harflerle(mini, 'kalem', { uzunluk: 4 })), ['alem', 'kale', 'lame']);
});

test('kalipla: ? tek harf, * her şey', () => {
  assert.deepEqual(kel(KB.kalipla(mini, 'k?l?m')), ['kalem', 'kelam']);
  assert.deepEqual(kel(KB.kalipla(mini, 'ka*')), ['kal', 'kale', 'kalem', 'kalemler']);
  assert.deepEqual(kel(KB.kalipla(mini, '*em')), ['alem', 'kalem']);
  assert.deepEqual(kel(KB.kalipla(mini, '*ale*')), ['alem', 'kale', 'kalem', 'kalemler', 'makale']);
  assert.deepEqual(kel(KB.kalipla(mini, 'kalem')), ['kalem']);
  assert.deepEqual(kel(KB.kalipla(mini, '*', { uzunluk: 2 })), ['ak', 'al', 'el', 'iç']);
  assert.deepEqual(KB.kalipla(mini, '*'), []);
});

test('grupla: uzundan kısaya, Türkçe alfabetik', () => {
  const g = KB.grupla(['ışık', 'iç', 'çay', 'cam', 'ıt', 'il'].map(k => ({ k })));
  assert.deepEqual(g.map(x => x.uzunluk), [4, 3, 2]);
  assert.deepEqual(g[1].liste.map(x => x.k), ['cam', 'çay']);
  assert.deepEqual(g[2].liste.map(x => x.k), ['ıt', 'iç', 'il']);
});

test('sözlük sıkıştırma: aç(sıkıştır(x)) = x', () => {
  const w = ['ab', 'aba', 'abacı', 'abacılık', 'b', 'baba', 'çay', 'ü'];
  const s = KB.sozlukSikistir(w);
  assert.ok(s.includes('3cı'));
  assert.deepEqual(KB.sozlukAc(s), w);
  assert.deepEqual(KB.sozlukAc(s.replace(/\n/g, '\r\n')), w);
});

test('gerçek sözlük açılır ve aramalar çalışır', () => {
  const metin = readFileSync(new URL('../kelime-bulucu/sozluk.txt', import.meta.url), 'utf8');
  const s = KB.sozlukAc(metin);
  assert.ok(s.length > 60000);
  assert.ok(s.every(w => /^[a-zçğıöşü]{2,}$/.test(w)), 'yalnızca küçük Türkçe harfler');
  assert.equal(new Set(s).size, s.length, 'tekrar yok');
  const t0 = Date.now();
  const r = KB.harflerle(s, 'kitaplık**');
  assert.ok(Date.now() - t0 < 1500);
  assert.ok(r.find(x => x.k === 'kitaplık') && r.find(x => x.k === 'kitapçı' && x.j.length === 1));
  assert.ok(KB.kalipla(s, 'k?t?p').find(x => x.k === 'kitap'));
});

test('puan: Türkçe Scrabble taş değerleri, joker 0; üç dosyada aynı tablo', () => {
  assert.equal(KB.puan('kalem'), 6);
  assert.equal(KB.puan('jilet'), 14);
  assert.equal(KB.puan('ağaç'), 14);
  assert.equal(KB.puan('kalem', [4]), 4);
  const r = KB.harflerle(['kalem', 'kale'], 'kale*');
  assert.equal(r.find(x => x.k === 'kalem').p, 4);
  assert.deepEqual(KB.puanaGore([{ k: 'ala', j: [] }, { k: 'jel', j: [] }, { k: 'kale', j: [] }]).map(x => x.k), ['jel', 'kale', 'ala']);
  const tablo = src => { const m = src.match(/PUAN = \{([\s\S]*?)\};/); return Object.fromEntries([...m[1].matchAll(/'?([a-zçğıöşü])'?: (\d+)/g)].map(x => [x[1], +x[2]])); };
  const ortak = tablo(readFileSync(new URL('../kelime-bulucu/ortak.js', import.meta.url), 'utf8'));
  assert.deepEqual(ortak, KB.PUAN);
  const php = readFileSync(new URL('../kelime-bulucu/ortak.php', import.meta.url), 'utf8').match(/const PUAN = \[([\s\S]*?)\];/)[1];
  const phpT = Object.fromEntries([...php.matchAll(/'([a-zçğıöşü])' => (\d+)/g)].map(x => [x[1], +x[2]]));
  assert.deepEqual(phpT, KB.PUAN);
  assert.equal(Object.keys(KB.PUAN).length, 29);
});

test('ascii adres: Türkçe karakter yok, çakışanlar -2/-3', () => {
  const s = ['asi', 'ası', 'aşı', 'kalem', 'kir', 'kır', 'çiçek'];
  const h = KB.slugHarita(s);
  assert.equal(h.slug('kalem'), 'kalem');
  assert.equal(h.slug('çiçek'), 'cicek');
  assert.equal(h.slug('asi'), 'asi');
  assert.equal(h.slug('ası'), 'asi-2');
  assert.equal(h.slug('aşı'), 'asi-3');
  assert.equal(h.slug('kır'), 'kir-2');
  assert.equal(h.kelime('asi-3'), 'aşı');
  assert.equal(h.kelime('cicek'), 'çiçek');
  assert.equal(h.kelime('asi-9'), null);
});

test('araç adresi: Türkçe harf büyük ASCII, ? → _', () => {
  assert.equal(KB.aracKod('çiçek?ş'), 'CiCek_S');
  assert.equal(KB.aracCoz('CiCek_S'), 'çiçek?ş');
  assert.equal(KB.aracCoz(KB.aracKod('ığdır*öü')), 'ığdır*öü');
  assert.ok(/^[\x20-\x7e]*$/.test(KB.aracKod('şğüçöı?*')));
});

test('torba: tek J, iki joker', () => {
  assert.equal(KB.torbaFazla('kalem'), 0);
  assert.equal(KB.torbaFazla('jüjitsu'), 1);
  assert.equal(KB.torbaFazla('ffff'), 3);
});

test('wordle: yeşil, sarı, gri', () => {
  const s = ['kalem', 'kelam', 'kalım', 'melek', 'lamba', 'elmas', 'kaşık'];
  const k = r => r.map(x => x.k).sort();
  assert.deepEqual(k(KB.wordle(s, { yesil: ['k', '', 'l', '', 'm'], sari: [], gri: '' })), ['kalem', 'kalım', 'kelam']);
  assert.deepEqual(k(KB.wordle(s, { yesil: ['', '', '', '', ''], sari: ['', 'a', '', '', ''], gri: 'k' })), ['elmas']);
  assert.deepEqual(k(KB.wordle(s, { yesil: ['k', '', '', '', ''], sari: [], gri: 'ı' })), ['kalem', 'kelam']);
  // aynı harf hem yeşil hem gri: yalnızca fazladan tekrarı yasak
  assert.deepEqual(k(KB.wordle(s, { yesil: ['', 'e', '', '', ''], sari: [], gri: 'e' })), ['kelam']);
});

test('ascii adres kuralı PHP ile aynı (php varsa)', async t => {
  const { execFileSync } = await import('node:child_process');
  const { existsSync } = await import('node:fs');
  const php = ['C:/xampp/php/php.exe', '/usr/bin/php'].find(p => existsSync(p));
  if (!php) return t.skip('php yok');
  const s = KB.sozlukAc(readFileSync(new URL('../kelime-bulucu/sozluk.txt', import.meta.url), 'utf8'));
  const h = KB.slugHarita(s);
  const ornek = ['ası', 'asi', 'aşı', 'nasır', 'nasir', 'naşir', 'şasi', 'şaşı', 'sası', 'kalem', 'çiçek', 'ığdır', 'güneş', 'kır', 'kir', 'şiş', 'sis', 'şış'].filter(w => s.includes(w));
  const kod = `require 'kelime-bulucu/ortak.php'; $o=[]; foreach (json_decode($argv[1], true) as $w) { $sl = Sozluk::slug($w); $o[$w] = [$sl, Sozluk::kelime($sl)]; } echo json_encode($o, JSON_UNESCAPED_UNICODE);`;
  const out = JSON.parse(execFileSync(php, ['-r', kod, JSON.stringify(ornek)], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }));
  for (const w of ornek) { assert.equal(out[w][0], h.slug(w), w); assert.equal(out[w][1], w, w + ' geri'); }
});
