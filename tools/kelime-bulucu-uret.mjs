// Kelime Bulucu — veri üretici. Sayfaları PHP üretir (kelime.php, liste.php); bu betik yalnızca veri ve site haritası yazar.
// Kullanım: python -I tools/vikisozluk-anlam.py   (Vikisözlük dökümünden tools/.veri/vikisozluk.json; döküm değişince)
//           node tools/kelime-bulucu-uret.mjs      (KAYNAK=… kelime klasörü, FREKANS=… sıklık dosyası, TARIH=… lastmod)
// Yazar:
//   kelime-bulucu/sozluk.txt              ön ekle sıkıştırılmış sözlük (araç ve PHP)
//   kelime-bulucu/anlam/<p>.json          ilk anlam (araçtaki anlam penceresi; küçük)
//   kelime-bulucu/veri/anlam/<p>.json     zengin anlam: türler, anlamlar, etiketler, örnekler, köken, eş anlamlılar, deyimler (PHP)
//   kelime-bulucu/veri/listeler.json      liste sayfaları: ASCII slug → [tür, anahtar, uzunluk, kelime sayısı]
//   kelime-bulucu/veri/sik.txt            sözlükte olan kelimeler, sıklık sırasıyla (PHP: sık geçenler)
//   kelime-bulucu/veri/gunluk.txt         günün kelimesi adayları (araç)
//   kelime-bulucu/sitemap.xml, sitemap-kelime-N.xml   ASCII adresler
//   kelime-bulucu/index.html              <!--LISTE--> bölümü
// Adreslerde Türkçe karakter yoktur; çakışma kuralı ortak.php / motor.js ile aynıdır.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const KB = createRequire(import.meta.url)(join(KOK, 'kelime-bulucu', 'motor.js'));
const KAYNAK = process.env.KAYNAK || join(KOK, '..', 'kelimelik', 'assets', 'words');
const FREKANS = process.env.FREKANS || join(KOK, '..', 'kelimelik', 'scripts', 'tr_freq_50k.txt');
const VIKI = join(KOK, 'tools', '.veri', 'vikisozluk.json');
const BUGUN = process.env.TARIH || new Date().toISOString().slice(0, 10);
const SITE = 'https://okutan.org';
const DIZ = join(KOK, 'kelime-bulucu');
const cmp = KB.karsilastir;
const kucuk = s => s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();

// ---------------- sözlük ----------------
const ham = readFileSync(join(KAYNAK, 'turkce_kelimeler.txt'), 'utf8').split(/\r?\n/).map(s => KB.harf(s.trim())).filter(w => w.length >= 2 && /[aeıioöuü]/.test(w)); // sessiz kısaltmalar (cm, kg) atılır
const kelimeler = [...new Set(ham)].sort(cmp);
const kume = new Set(kelimeler);
writeFileSync(join(DIZ, 'sozluk.txt'), KB.sozlukSikistir(kelimeler));
console.log('kelime', kelimeler.length);

// ---------------- anlamlar ----------------
const KATEGORI = /(lar|ler|ları|leri)$/; // "aylar", "odalar", "yazma aletleri" gibi konu kategorileri etiket değildir
const zengin = new Map();
if (existsSync(VIKI)) {
  for (const [w, v] of Object.entries(JSON.parse(readFileSync(VIKI, 'utf8')))) {
    if (!kume.has(w)) continue;
    for (const t of v.t) for (const a of t.a) {
      if (a.e) { a.e = a.e.filter(e => !KATEGORI.test(e) && e.length < 30); if (!a.e.length) delete a.e; }
      if (a.o) { a.o = [...new Set(a.o)].filter(o => o.length < 400).slice(0, 2); if (!a.o.length) delete a.o; }
    }
    zengin.set(w, v);
  }
} else console.warn('UYARI: tools/.veri/vikisozluk.json yok; önce python -I tools/vikisozluk-anlam.py');
// Vikisözlük'te olmayan kelimeler için eski tek satırlık anlamlar (Kelimeler oyununun definitions.json'u)
const eski = new Map();
for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(KAYNAK, 'definitions.json'), 'utf8')))) {
  const w = kucuk(k); if (!kume.has(w)) continue;
  const d = String(v).replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  if (d.length >= 3) eski.set(w, d);
}
const ilkAnlam = w => zengin.get(w)?.t[0]?.a[0]?.d || eski.get(w) || null;
const PARCA = { 'ç': 'c1', 'ğ': 'g1', 'ı': 'i1', 'ö': 'o1', 'ş': 's1', 'ü': 'u1' };
const parca = w => PARCA[w[0]] || w[0];
for (const d of ['anlam', join('veri', 'anlam')]) { rmSync(join(DIZ, d), { recursive: true, force: true }); mkdirSync(join(DIZ, d), { recursive: true }); }
const kisa = {}, uzun = {};
for (const w of kelimeler) {
  const a = ilkAnlam(w); if (a) (kisa[parca(w)] ||= {})[w] = a;
  const z = zengin.get(w) || (eski.has(w) ? { t: [{ tur: '', a: [{ d: eski.get(w) }] }] } : null);
  if (z) (uzun[parca(w)] ||= {})[w] = z;
}
for (const [p, o] of Object.entries(kisa)) writeFileSync(join(DIZ, 'anlam', p + '.json'), JSON.stringify(o));
for (const [p, o] of Object.entries(uzun)) writeFileSync(join(DIZ, 'veri', 'anlam', p + '.json'), JSON.stringify(o));
console.log('anlam: zengin', zengin.size, '· tek satır', [...kelimeler].filter(w => !zengin.has(w) && eski.has(w)).length);

// ---------------- sıklık, günün kelimesi ----------------
const sira = [];
if (existsSync(FREKANS)) { const g = new Set(); for (const l of readFileSync(FREKANS, 'utf8').split(/\r?\n/)) { const w = l.split(' ')[0]; if (w && kume.has(w) && !g.has(w)) { g.add(w); sira.push(w); } } }
writeFileSync(join(DIZ, 'veri', 'sik.txt'), sira.join('\n') + '\n');
const gunluk = sira.filter(w => w.length >= 4 && w.length <= 10 && zengin.has(w) && zengin.get(w).t[0].a.length >= 1 && (zengin.get(w).t[0].a[0].d || '').length > 12).slice(0, 4000);
writeFileSync(join(DIZ, 'veri', 'gunluk.txt'), gunluk.join('\n') + '\n');
console.log('sık', sira.length, '· günlük aday', gunluk.length);

// ---------------- liste sayfaları ----------------
const HARF = [...KB.HARFLER];
const say = f => { const m = new Map(); for (const w of kelimeler) for (const k of f(w)) m.set(k, (m.get(k) || 0) + 1); return m; };
const onek = L => say(w => w.length > L ? [w.slice(0, L)] : []);
const sonek = L => say(w => w.length > L ? [w.slice(-L)] : []);
const icerik = L => say(w => { const r = new Set(); for (let i = 0; i + L <= w.length; i++) r.add(w.slice(i, i + L)); return [...r].filter(k => k !== w); });
const uzunluk = say(w => [w.length]);
const ESIK = { bas1: 3, bas2: 20, bas3: 50, bit1: 3, bit2: 20, bit3: 30, ic1: 1, ic2: 300, uz: 5, harfUz: 3 };
const sayfa = []; // [tür, anahtar, uzunluk, sayı]
for (const [L, e] of [[1, ESIK.bas1], [2, ESIK.bas2], [3, ESIK.bas3]]) for (const [k, n] of onek(L)) if (n >= e) sayfa.push(['bas', k, 0, n]);
for (const [L, e] of [[1, ESIK.bit1], [2, ESIK.bit2], [3, ESIK.bit3]]) for (const [k, n] of sonek(L)) if (n >= e) sayfa.push(['bit', k, 0, n]);
for (const [L, e] of [[1, ESIK.ic1], [2, ESIK.ic2]]) for (const [k, n] of icerik(L)) if (n >= e) sayfa.push(['ic', k, 0, n]);
for (const [L, n] of uzunluk) if (n >= ESIK.uz) sayfa.push(['uz', '', L, n]);
const varmi = (t, k) => sayfa.some(s => s[0] === t && s[1] === k);
for (const h of HARF) for (const L of [...uzunluk.keys()]) {
  const b = kelimeler.filter(w => w.length === L && w[0] === h).length, e = kelimeler.filter(w => w.length === L && w.at(-1) === h).length;
  if (b >= ESIK.harfUz && varmi('bas', h)) sayfa.push(['basUz', h, L, b]);
  if (e >= ESIK.harfUz && varmi('bit', h)) sayfa.push(['bitUz', h, L, e]);
}
// Scrabble listeleri
sayfa.push(['puan', '', 0, 300]);
for (let L = 2; L <= 10; L++) sayfa.push(['puan', '', L, Math.min(300, uzunluk.get(L) || 0)]);
const degerli = kelimeler.filter(w => w.length <= 5 && /[jğföv]/.test(w)).length;
sayfa.push(['deger', '', 0, degerli]);
// ASCII slug + çakışma kuralı (Türkçe harfi az olan sade adres; eşitse Türkçe alfabe sırası)
const ascii = s => s.replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
const trSay = s => (s.match(/[çğıöşü]/g) || []).length;
const tabanSlug = ([t, k, L]) => ({
  bas: `${ascii(k)}-ile-baslayan-kelimeler`, bit: `${ascii(k)}-ile-biten-kelimeler`, ic: `icinde-${ascii(k)}-gecen-kelimeler`,
  uz: `${L}-harfli-kelimeler`, basUz: `${ascii(k)}-ile-baslayan-${L}-harfli-kelimeler`, bitUz: `${ascii(k)}-ile-biten-${L}-harfli-kelimeler`,
  puan: L ? `en-yuksek-puanli-${L}-harfli-kelimeler` : 'en-yuksek-puanli-kelimeler', deger: 'degerli-harfli-kisa-kelimeler',
}[t]);
const gruplar = new Map();
for (const s of sayfa) { const b = tabanSlug(s); if (!gruplar.has(b)) gruplar.set(b, []); gruplar.get(b).push(s); }
const listeler = {};
for (const [b, l] of [...gruplar.entries()].sort((x, y) => cmp(x[0], y[0]))) {
  l.sort((x, y) => trSay(x[1]) - trSay(y[1]) || cmp(x[1], y[1]));
  l.forEach((s, i) => { listeler[i ? `${b}-${i + 1}` : b] = s[2] ? [s[0], s[1], s[2], s[3]] : [s[0], s[1], 0, s[3]]; });
}
writeFileSync(join(DIZ, 'veri', 'listeler.json'), JSON.stringify(listeler));
const sayac = {}; for (const s of sayfa) sayac[s[0]] = (sayac[s[0]] || 0) + 1;
console.log('liste', Object.keys(listeler).length, sayac);

// ---------------- site haritaları ----------------
for (const f of readdirSync(DIZ)) if (/^sitemap.*\.xml$/.test(f)) rmSync(join(DIZ, f));
const harita = (dosya, urls, oncelik) => writeFileSync(join(DIZ, dosya), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc><lastmod>${BUGUN}</lastmod><changefreq>monthly</changefreq><priority>${oncelik(u)}</priority></url>`).join('\n')}\n</urlset>\n`);
// A–Z sözlük dizini (sozluk.php ile aynı harf adresleri ve sayfa boyu)
const HARF_SLUG = { 'ç': 'c-2', 'ğ': 'g-2', 'ı': 'i-2', 'ö': 'o-2', 'ş': 's-2', 'ü': 'u-2' }, DIZIN_SAYFA = 200;
const dizin = [`${SITE}/kelime-bulucu/sozluk/`];
for (const h of HARF) { const n = kelimeler.filter(w => w[0] === h).length; for (let p = 1; p <= Math.ceil(n / DIZIN_SAYFA); p++) dizin.push(`${SITE}/kelime-bulucu/sozluk/${HARF_SLUG[h] || h}/${p > 1 ? p + '/' : ''}`); }
harita('sitemap.xml', [`${SITE}/kelime-bulucu/tahta/`, `${SITE}/kelime-bulucu/liste/`, ...Object.keys(listeler).map(s => `${SITE}/kelime-bulucu/liste/${s}/`), ...dizin],
  u => /\/(tahta|liste)\/$/.test(u) || /puan|degerli/.test(u) ? '0.7' : /\/sozluk\//.test(u) ? '0.4' : '0.5');
const sh = KB.slugHarita(kelimeler);
const kUrl = kelimeler.map(w => `${SITE}/kelime-bulucu/kelime/${sh.slug(w)}/`);
if (kUrl.some(u => /[^\x20-\x7e]/.test(u))) throw new Error('ASCII olmayan adres');
const PAR = 45000; let n = 0;
for (let i = 0; i < kUrl.length; i += PAR) harita(`sitemap-kelime-${++n}.xml`, kUrl.slice(i, i + PAR), () => '0.4');
console.log('site haritası: liste', Object.keys(listeler).length + 1, '· kelime', kUrl.length, `(${n} dosya)`);

// ---------------- araç sayfasındaki "hazır listeler" bölümü ----------------
{
  const L = (t, k = '', u = 0) => Object.entries(listeler).find(([, v]) => v[0] === t && v[1] === k && v[2] === u)?.[0];
  const K = KB.buyuk;
  const abc = (t, u = 0) => HARF.map(h => { const s = L(t, h, u); return s ? `<a href="liste/${s}/">${K(h)}</a>` : ''; }).join('');
  const blok = `<!--LISTE-->
    <div class="b links" aria-labelledby="hHazir">
      <h2 id="hHazir">Hazır kelime listeleri</h2>
      <h3>Araçlar ve sözlük</h3><div class="lk"><a href="tahta/">Tahta çözücü</a><a href="sozluk/">A–Z Türkçe sözlük</a><a href="?m=wordle">Wordle yardımcısı</a><a href="?m=gecerli">Kelime geçerli mi?</a></div>
      <h3>Scrabble</h3><div class="lk"><a href="liste/en-yuksek-puanli-kelimeler/">En yüksek puanlı kelimeler</a>${[2, 3, 4, 5, 6, 7].map(u => `<a href="liste/en-yuksek-puanli-${u}-harfli-kelimeler/">En yüksek puanlı ${u} harfli</a>`).join('')}<a href="liste/degerli-harfli-kisa-kelimeler/">J, Ğ, F, Ö, V geçen kısa kelimeler</a><a href="liste/2-harfli-kelimeler/">2 harfli kelimeler</a></div>
      <h3>Harf sayısına göre</h3><div class="lk">${[...Array(14)].map((_, i) => i + 2).map(u => { const s = L('uz', '', u); return s ? `<a href="liste/${s}/">${u} harfli<small>${listeler[s][3].toLocaleString('tr-TR')}</small></a>` : ''; }).join('')}</div>
      <h3>Harfle başlayan kelimeler</h3><div class="lk abc">${abc('bas')}</div>
      <h3>Harfle biten kelimeler</h3><div class="lk abc">${abc('bit')}</div>
      <h3>Harfle başlayan 5 harfli kelimeler</h3><div class="lk abc">${abc('basUz', 5)}</div>
      <h3>Tümü</h3><div class="lk"><a href="liste/">Kelime listeleri dizini<small>${Object.keys(listeler).length.toLocaleString('tr-TR')}</small></a></div>
    </div>
<!--/LISTE-->`;
  const yol = join(DIZ, 'index.html'), html = readFileSync(yol, 'utf8');
  if (!html.includes('<!--LISTE-->')) console.warn('UYARI: index.html içinde <!--LISTE--> yok');
  writeFileSync(yol, html.replace(/<!--LISTE-->[\s\S]*?<!--\/LISTE-->/, blok));
}
