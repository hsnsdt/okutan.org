// Canlı Sohbet — oyun kanalları ve eğlence komutları API testleri (yerelde PHP + MySQL açıkken):
//   ADMIN_PASS=… node --test tests/sohbet-oyun.test.mjs        (önceki sohbet test dosyasından sonra sh_* tablolarını sil)
// Canlıda ÇALIŞTIRMA.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/$/, '');
const API = BASE + '/sohbet/api/';
const RUN = Date.now().toString(36).slice(-4);
const post = (a, b = {}) => fetch(`${API}?a=${a}`, { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const trLower = (s) => s.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
const katla = (s) => trLower(s).replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]));

// sözlük (ön ekle sıkıştırılmış, karakter sayısıyla): zincirde geçerli kelime bulmak için
const SOZ = (() => {
  const out = []; let o = [];
  for (const sat of readFileSync(new URL('../kelime-bulucu/sozluk.txt', import.meta.url), 'utf8').split('\n')) {
    const s = sat.replace(/\r$/, ''); if (!s) continue;
    const m = /^(\d*)(.*)$/u.exec(s); o = o.slice(0, m[1] ? +m[1] : 0).concat(Array.from(m[2])); out.push(o.join(''));
  }
  return out;
})();
let T, kisiler = [];
async function kisi(nick) { const h = await post('hello', {}); assert.equal((await post('nick', { key: h.key, nick })).ok, true); return h; }
const durum = async (ch) => (await post('admin_oyun', { t: T, ch })).oyun;
const son = async (key, ch, n = 6) => (await post('poll', { key, ch, after: 0 })).msgs.slice(-n);
before(async () => {
  T = (await post('admin_login', { pass: process.env.ADMIN_PASS || '' })).token;
  assert.ok(T, 'ADMIN_PASS gerekli');
  for (let i = 0; i < 6; i++) kisiler.push(await kisi('Oyuncu' + i + RUN));
});

test('bot adları rumuz olamaz; içinde "bot" geçen gerçek ad olur', async () => {
  const h = await post('hello', {});
  for (const n of ['KelimeBot', 'zar', 'BOT', 'BilgiBot']) assert.equal((await post('nick', { key: h.key, nick: n })).error, 'bad_nick', n);
  assert.equal((await post('nick', { key: h.key, nick: 'Botan' + RUN })).ok, true);
});

test('kelime avı: ilk mesaj turu başlatır, yanlış cevap geçmez, doğru cevap puan verir', async () => {
  const [a, b] = kisiler;
  await post('admin_oyun', { t: T, ch: 'avi', sifirla: 1 });
  await post('say', { key: a.key, ch: 'avi', text: 'selam' });
  const o = await durum('avi');
  assert.equal(o.durum, 'aktif'); assert.ok(o.cevap.length >= 4);
  const m1 = await son(a.key, 'avi');
  assert.ok(m1.some((m) => m.k === 'b' && m.n === 'KelimeBot' && m.x.includes('Tur 1')), 'bot turu açtı');
  assert.notEqual(o.veri.karisik, o.cevap, 'harfler karışık');
  await post('say', { key: b.key, ch: 'avi', text: 'zzzzqq' });
  assert.equal((await durum('avi')).durum, 'aktif');
  // Türkçe harfsiz ve büyük harfle yazılsa da kabul (yeni gelenin 5 sn yavaş modu yüzünden bekle)
  await sleep(5200);
  const s = await post('say', { key: b.key, ch: 'avi', text: katla(o.cevap).toUpperCase() });
  assert.equal(s.ok, true, JSON.stringify(s));
  const o2 = await durum('avi');
  assert.equal(o2.durum, 'ara');
  const m2 = await son(a.key, 'avi');
  assert.ok(m2.some((m) => m.k === 'b' && m.x.includes('Oyuncu1' + RUN + ' buldu')), JSON.stringify(m2.map((m) => m.x)));
  const p = await post('puan', { key: b.key, ch: 'avi' });
  assert.equal(p.tablo[0].oyun, 'avi'); assert.ok(p.tablo[0].ben >= 1); assert.equal(p.tablo[0].hafta[0].nick, 'Oyuncu1' + RUN);
  const hepsi = await post('puan', { key: b.key, ch: 'genel' });
  assert.equal(hepsi.tablo.length, 4);
});

test('kelime avı: 20 sn sonra ipucu, arası dolunca yoklama yeni tur açar', async () => {
  const [a, , c] = kisiler;
  await post('admin_oyun', { t: T, ch: 'avi', sifirla: 1 });
  await post('say', { key: c.key, ch: 'avi', text: 'başla' });
  const o = await durum('avi');
  await sleep(21000);
  await post('poll', { key: a.key, ch: 'avi', after: 0 });
  assert.equal((await durum('avi')).ipucu, 1);
  const m = await son(a.key, 'avi', 3);
  assert.ok(m.some((x) => x.k === 'b' && x.x.startsWith('💡 İpucu: ' + o.cevap.toLocaleUpperCase('tr-TR')[0])), JSON.stringify(m.map((x) => x.x)));
});

test('gizli kelime: sözlükte olmayan reddedilir, renkli cevap, doğru tahmin kazanır', async () => {
  const [, , , d, e] = kisiler;
  await post('admin_oyun', { t: T, ch: 'gizli', sifirla: 1 });
  await post('say', { key: d.key, ch: 'gizli', text: 'merhaba' });
  const o = await durum('gizli');
  assert.equal(o.durum, 'aktif'); assert.equal(Array.from(o.cevap).length, 5);
  await post('say', { key: e.key, ch: 'gizli', text: 'qxqxq' });
  let m = await son(d.key, 'gizli', 2);
  assert.ok(m.some((x) => x.k === 'b' && x.x.includes('sözlükte yok')), JSON.stringify(m.map((x) => x.x)));
  await sleep(5200);
  const yanlis = o.cevap === 'kalem' ? 'kitap' : 'kalem';
  await post('say', { key: e.key, ch: 'gizli', text: yanlis });
  m = await son(d.key, 'gizli', 2);
  assert.ok(m.some((x) => x.k === 'b' && /\(1\/6\)/.test(x.x) && /[🟦🟧⬜]{5}/u.test(x.x)), JSON.stringify(m.map((x) => x.x)));
  await sleep(5200);
  await post('say', { key: e.key, ch: 'gizli', text: o.cevap });
  m = await son(d.key, 'gizli', 2);
  assert.ok(m.some((x) => x.k === 'b' && x.x.includes('buldu') && x.x.includes('🟦🟦🟦🟦🟦') && x.x.includes('+5')), JSON.stringify(m.map((x) => x.x)));
});

test('zincir: yeni zincir başlar, doğru harfle sözlük kelimesi kabul, yanlış harf ve tekrar reddedilir', async () => {
  const [a, b] = kisiler;
  await post('admin_oyun', { t: T, ch: 'zincir', sifirla: 1 });
  await sleep(5200);
  await post('say', { key: a.key, ch: 'zincir', text: 'merhaba arkadaşlar' });
  let o = await durum('zincir');
  const ilk = o.veri.son;
  let harf = Array.from(ilk).pop(); if (harf === 'ğ') harf = Array.from(ilk).slice(-2)[0];
  const w = SOZ.find((x) => x.startsWith(harf) && x.length >= 3 && x.length <= 6 && !o.veri.kullanilan.includes(x));
  await post('say', { key: b.key, ch: 'zincir', text: w });
  o = await durum('zincir');
  assert.equal(o.veri.son, w); assert.equal(o.veri.uzunluk, 2);
  let m = await son(a.key, 'zincir', 2);
  assert.ok(m.some((x) => x.k === 'b' && x.x.startsWith('✓ Oyuncu1' + RUN)), JSON.stringify(m.map((x) => x.x)));
  let h2 = Array.from(w).pop(); if (h2 === 'ğ') h2 = Array.from(w).slice(-2)[0];
  const yanlisHarf = SOZ.find((x) => !x.startsWith(h2) && x.length === 5);
  await sleep(5200);
  await post('say', { key: a.key, ch: 'zincir', text: yanlisHarf });
  m = await son(a.key, 'zincir', 2);
  assert.ok(m.some((x) => x.k === 'b' && x.x.includes('ile başlamalı')), JSON.stringify(m.map((x) => x.x)));
  await sleep(5200);
  await post('say', { key: a.key, ch: 'zincir', text: w });
  m = await son(a.key, 'zincir', 2);
  assert.ok(m.some((x) => x.k === 'b' && (x.x.includes('söylendi') || x.x.includes('ile başlamalı'))), JSON.stringify(m.map((x) => x.x)));
});

test('yarışma: soru gelir, Türkçe harfsiz ve küçük harfle verilen cevap kabul', async () => {
  const [, , c, d] = kisiler;
  await post('admin_oyun', { t: T, ch: 'yarisma', sifirla: 1 });
  await sleep(5200);
  await post('say', { key: c.key, ch: 'yarisma', text: 'soru gelsin' });
  const o = await durum('yarisma');
  assert.equal(o.durum, 'aktif');
  const cevap = JSON.parse(o.cevap)[0];
  await sleep(5200);
  await post('say', { key: d.key, ch: 'yarisma', text: katla(cevap) });
  const m = await son(c.key, 'yarisma', 2);
  assert.ok(m.some((x) => x.k === 'b' && x.x.includes('bildi') && x.x.includes('+3')), JSON.stringify(m.map((x) => x.x)));
});

test('eğlence: zar, yazı-tura, sayı herkese bot mesajı olarak düşer; 5 sn sınırı', async () => {
  const f = kisiler[5];
  const z = await post('eglence', { key: f.key, ch: 'genel', tur: 'zar', arg: 2 });
  assert.equal(z.ok, true);
  assert.equal((await post('eglence', { key: f.key, ch: 'genel', tur: 'zar' })).error, 'slow');
  let m = await son(f.key, 'genel', 2);
  const zm = m.find((x) => x.id === z.id);
  assert.equal(zm.k, 'b'); assert.equal(zm.n, 'Zar'); assert.match(zm.x, /zar attı: .+ \(toplam \d+\)/);
  await sleep(6500);
  const s = await post('eglence', { key: f.key, ch: 'genel', tur: 'sayi', arg: '10-12' });
  m = await son(f.key, 'genel', 2);
  const n = +/: (\d+)$/.exec(m.find((x) => x.id === s.id).x)[1];
  assert.ok(n >= 10 && n <= 12, String(n));
  await sleep(6500); // sınır saniye çözünürlüğünde
  assert.equal((await post('eglence', { key: f.key, ch: 'genel', tur: 'yok' })).error, 'bad_cmd');
});
