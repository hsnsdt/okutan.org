// Kelime Bulucu — veri ve statik liste sayfası üretici.
// Kullanım: node tools/kelime-bulucu-uret.mjs  (KAYNAK=… ile kelime klasörü, FREKANS=… ile sıklık dosyası)
// Üretir: kelime-bulucu/sozluk.txt, kelime-bulucu/anlam/*.json, kelime-bulucu/liste/**/index.html, kelime-bulucu/sitemap.xml
// Kaynak: Kelimeler oyununun sözlüğü (turkce_kelimeler.txt) ve Vikisözlük'ten derlenen anlamlar (definitions.json).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const KB = require(join(KOK, 'kelime-bulucu', 'motor.js'));
const KAYNAK = process.env.KAYNAK || join(KOK, '..', 'kelimelik', 'assets', 'words');
const FREKANS = process.env.FREKANS || join(KOK, '..', 'kelimelik', 'scripts', 'tr_freq_50k.txt');
const BUGUN = process.env.TARIH || new Date().toISOString().slice(0, 10);
const SITE = 'https://okutan.org';
const DIZ = join(KOK, 'kelime-bulucu');
const V = 1; // kb.css / ortak.js / motor.js sürümü (index.html ile aynı tutulur)

// ---------------- veri ----------------
const kucuk = s => s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
const buyuk = KB.buyuk;
const cmp = KB.karsilastir;
const ham = readFileSync(join(KAYNAK, 'turkce_kelimeler.txt'), 'utf8').split(/\r?\n/).map(s => KB.harf(s.trim())).filter(w => w.length >= 2 && /[aeıioöuü]/.test(w)); // sessiz kısaltmalar (cm, kg) atılır
const kelimeler = [...new Set(ham)].sort(cmp);
console.log('kelime', kelimeler.length);

const tanimHam = JSON.parse(readFileSync(join(KAYNAK, 'definitions.json'), 'utf8'));
const kume = new Set(kelimeler);
const tanim = new Map();
for (const [k, v] of Object.entries(tanimHam)) {
  const w = kucuk(k);
  if (!kume.has(w)) continue;
  let d = String(v).replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  if (d.length < 3) continue;
  tanim.set(w, d);
}
console.log('anlam', tanim.size);

const sira = new Map();
if (existsSync(FREKANS)) {
  readFileSync(FREKANS, 'utf8').split(/\r?\n/).forEach((l, i) => { const w = l.split(' ')[0]; if (w && !sira.has(w)) sira.set(w, i); });
}
const yaygin = (liste, n) => liste.filter(w => sira.has(w)).sort((a, b) => sira.get(a) - sira.get(b)).slice(0, n);

// sözlük (ön ekle sıkıştırılmış)
writeFileSync(join(DIZ, 'sozluk.txt'), KB.sozlukSikistir(kelimeler));

// anlam parçaları (ilk harfe göre)
const PARCA = { 'ç': 'c1', 'ğ': 'g1', 'ı': 'i1', 'ö': 'o1', 'ş': 's1', 'ü': 'u1' };
rmSync(join(DIZ, 'anlam'), { recursive: true, force: true });
mkdirSync(join(DIZ, 'anlam'), { recursive: true });
const parcalar = {};
for (const w of kelimeler) if (tanim.has(w)) { const p = PARCA[w[0]] || w[0]; (parcalar[p] ||= {})[w] = tanim.get(w); }
for (const [p, o] of Object.entries(parcalar)) writeFileSync(join(DIZ, 'anlam', p + '.json'), JSON.stringify(o));

// ---------------- sayfa seçimi ----------------
const HARF = [...KB.HARFLER];
const say = (f) => { const m = new Map(); for (const w of kelimeler) for (const k of f(w)) { if (!m.has(k)) m.set(k, []); m.get(k).push(w); } return m; };
const onek = L => say(w => w.length > L ? [w.slice(0, L)] : []);
const sonek = L => say(w => w.length > L ? [w.slice(-L)] : []);
const icerik = L => say(w => { const r = new Set(); for (let i = 0; i + L <= w.length; i++) r.add(w.slice(i, i + L)); return [...r].filter(k => k !== w); });
const uzunluk = say(w => [w.length]);

const sayfalar = new Map(); // slug -> sayfa
function ekle(s) { s.url = '/kelime-bulucu/liste/' + s.slug + '/'; sayfalar.set(s.slug, s); return s; }
const slugBas = k => k + '-ile-baslayan-kelimeler';
const slugBit = k => k + '-ile-biten-kelimeler';
const slugIc = k => 'icinde-' + k + '-gecen-kelimeler';
const slugUz = L => L + '-harfli-kelimeler';
const slugBasUz = (k, L) => k + '-ile-baslayan-' + L + '-harfli-kelimeler';
const slugBitUz = (k, L) => k + '-ile-biten-' + L + '-harfli-kelimeler';

const ESIK = { bas1: 3, bas2: 20, bas3: 50, bit1: 3, bit2: 20, bit3: 30, ic1: 1, ic2: 300, uz: 5, harfUz: 3 };
for (const [L, esik] of [[1, ESIK.bas1], [2, ESIK.bas2], [3, ESIK.bas3]]) for (const [k, ws] of onek(L)) if (ws.length >= esik) ekle({ tip: 'bas', k, ws, slug: slugBas(k) });
for (const [L, esik] of [[1, ESIK.bit1], [2, ESIK.bit2], [3, ESIK.bit3]]) for (const [k, ws] of sonek(L)) if (ws.length >= esik) ekle({ tip: 'bit', k, ws, slug: slugBit(k) });
for (const [L, esik] of [[1, ESIK.ic1], [2, ESIK.ic2]]) for (const [k, ws] of icerik(L)) if (ws.length >= esik) ekle({ tip: 'ic', k, ws, slug: slugIc(k) });
for (const [L, ws] of uzunluk) if (ws.length >= ESIK.uz) ekle({ tip: 'uz', L, ws, slug: slugUz(L) });
for (const h of HARF) {
  for (const L of [...uzunluk.keys()].sort((a, b) => a - b)) {
    const b = kelimeler.filter(w => w.length === L && w[0] === h);
    if (b.length >= ESIK.harfUz && sayfalar.has(slugBas(h))) ekle({ tip: 'basUz', k: h, L, ws: b, slug: slugBasUz(h, L) });
    const e = kelimeler.filter(w => w.length === L && w[w.length - 1] === h);
    if (e.length >= ESIK.harfUz && sayfalar.has(slugBit(h))) ekle({ tip: 'bitUz', k: h, L, ws: e, slug: slugBitUz(h, L) });
  }
}
const sayac = {}; for (const s of sayfalar.values()) sayac[s.tip] = (sayac[s.tip] || 0) + 1;
console.log('sayfa', sayfalar.size, sayac);

// ---------------- metin yardımcıları ----------------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sayi = n => n.toLocaleString('tr-TR');
const K = k => buyuk(k); // anahtar büyük harfle
const tirnak = w => '“' + w + '”';
function ad(s) { // başlıktaki ad
  switch (s.tip) {
    case 'bas': return `${K(s.k)} ile Başlayan Kelimeler`;
    case 'bit': return `${K(s.k)} ile Biten Kelimeler`;
    case 'ic': return `İçinde ${K(s.k)} Geçen Kelimeler`;
    case 'uz': return `${s.L} Harfli Kelimeler`;
    case 'basUz': return `${K(s.k)} ile Başlayan ${s.L} Harfli Kelimeler`;
    case 'bitUz': return `${K(s.k)} ile Biten ${s.L} Harfli Kelimeler`;
  }
}
function adKisa(s) { // bağlantı metni
  switch (s.tip) {
    case 'bas': return `${K(s.k)} ile başlayan`;
    case 'bit': return `${K(s.k)} ile biten`;
    case 'ic': return `İçinde ${K(s.k)} geçen`;
    case 'uz': return `${s.L} harfli`;
    case 'basUz': return `${K(s.k)} ile başlayan ${s.L} harfli`;
    case 'bitUz': return `${K(s.k)} ile biten ${s.L} harfli`;
  }
}
function ifade(s) { // cümle içinde: "j ile başlayan"
  switch (s.tip) {
    case 'bas': return `${K(s.k)} ile başlayan`;
    case 'bit': return `${K(s.k)} ile biten`;
    case 'ic': return `içinde ${K(s.k)} geçen`;
    case 'uz': return `${s.L} harfli`;
    case 'basUz': return `${K(s.k)} ile başlayan ${s.L} harfli`;
    case 'bitUz': return `${K(s.k)} ile biten ${s.L} harfli`;
  }
}
function kalipOf(s) { // araçta aynı aramayı yapan kalıp
  switch (s.tip) {
    case 'bas': case 'basUz': return s.k + '*';
    case 'bit': case 'bitUz': return '*' + s.k;
    case 'ic': return '*' + s.k + '*';
    case 'uz': return '*';
  }
}
function vurgula(s, w) {
  if (s.tip === 'bas' || s.tip === 'basUz') return '<b>' + w.slice(0, s.k.length) + '</b>' + w.slice(s.k.length);
  if (s.tip === 'bit' || s.tip === 'bitUz') return w.slice(0, w.length - s.k.length) + '<b>' + w.slice(-s.k.length) + '</b>';
  if (s.tip === 'ic') { const i = w.indexOf(s.k); return w.slice(0, i) + '<b>' + s.k + '</b>' + w.slice(i + s.k.length); }
  return w;
}
const link = (slug, metin, ek) => { const p = sayfalar.get(slug); return p ? `<a href="${p.url}">${esc(metin || adKisa(p))}${ek === false ? '' : `<small>${sayi(p.ws.length)}</small>`}</a>` : ''; };
const araclink = (kalip, L) => '/kelime-bulucu/?k=' + encodeURIComponent(kalip) + (L ? '&u=' + L : '');

function gruplar(ws) {
  const g = new Map();
  for (const w of ws) { if (!g.has(w.length)) g.set(w.length, []); g.get(w.length).push(w); }
  return [...g.entries()].sort((a, b) => a[0] - b[0]);
}

// ---------------- ilgili bağlantılar ----------------
function ilgili(s) {
  const bolum = [];
  const ek = (baslik, html, cls) => { html = html.filter(Boolean); if (html.length) bolum.push(`<h3>${baslik}</h3><div class="lk${cls ? ' ' + cls : ''}">${html.join('')}</div>`); };
  const cocuk = (slugF, uret) => HARF.map(h => sayfalar.get(slugF(uret(h)))).filter(Boolean).sort((a, b) => b.ws.length - a.ws.length).slice(0, 24).map(p => link(p.slug));
  const abc = (slugF) => HARF.map(h => link(slugF(h), K(h), false));
  const L = s.L;
  if (s.tip === 'bas') {
    if (s.k.length === 1) ek(`${K(s.k)} ile başlayan, harf sayısına göre`, [...uzunluk.keys()].sort((a, b) => a - b).map(n => link(slugBasUz(s.k, n), `${n} harfli`)));
    ek('Daha uzun başlangıçlar', cocuk(slugBas, h => s.k + h));
    if (s.k.length > 1) ek('Daha kısa', [link(slugBas(s.k.slice(0, -1))), s.k.length > 2 ? link(slugBas(s.k.slice(0, 1))) : '']);
    ek('Aynı harflerle', [link(slugBit(s.k)), link(slugIc(s.k))]);
    ek('Harfle başlayan kelimeler', abc(slugBas), 'abc');
  } else if (s.tip === 'bit') {
    if (s.k.length === 1) ek(`${K(s.k)} ile biten, harf sayısına göre`, [...uzunluk.keys()].sort((a, b) => a - b).map(n => link(slugBitUz(s.k, n), `${n} harfli`)));
    ek('Daha uzun sonlar', cocuk(slugBit, h => h + s.k));
    if (s.k.length > 1) ek('Daha kısa', [link(slugBit(s.k.slice(1))), s.k.length > 2 ? link(slugBit(s.k.slice(-1))) : '']);
    ek('Aynı harflerle', [link(slugBas(s.k)), link(slugIc(s.k))]);
    ek('Harfle biten kelimeler', abc(slugBit), 'abc');
  } else if (s.tip === 'ic') {
    ek('Aynı harflerle', [link(slugBas(s.k)), link(slugBit(s.k))]);
    if (s.k.length === 1) ek('İçinde iki harf geçen', [...HARF.map(h => sayfalar.get(slugIc(s.k + h))), ...HARF.map(h => sayfalar.get(slugIc(h + s.k)))].filter(Boolean).sort((a, b) => b.ws.length - a.ws.length).slice(0, 24).map(p => link(p.slug)));
    else ek('Tek harf', [link(slugIc(s.k[0])), link(slugIc(s.k[1]))]);
    ek('İçinde harf geçen kelimeler', abc(slugIc), 'abc');
  } else if (s.tip === 'uz') {
    ek(`Harfle başlayan ${L} harfli kelimeler`, HARF.map(h => link(slugBasUz(h, L), K(h))), 'abc');
    ek(`Harfle biten ${L} harfli kelimeler`, HARF.map(h => link(slugBitUz(h, L), K(h))), 'abc');
    ek('Başka uzunluklar', [...uzunluk.keys()].sort((a, b) => a - b).map(n => n === L ? '' : link(slugUz(n))));
  } else {
    const bas = s.tip === 'basUz', sb = bas ? slugBasUz : slugBitUz;
    ek(`${K(s.k)} ile ${bas ? 'başlayan' : 'biten'}, başka uzunluklar`, [...uzunluk.keys()].sort((a, b) => a - b).map(n => n === L ? '' : link(sb(s.k, n), `${n} harfli`)));
    ek(`${bas ? 'Harfle başlayan' : 'Harfle biten'} ${L} harfli kelimeler`, HARF.map(h => h === s.k ? '' : link(sb(h, L), K(h))), 'abc');
    ek('Genel listeler', [link(bas ? slugBas(s.k) : slugBit(s.k)), link(slugUz(L)), link(bas ? slugBitUz(s.k, L) : slugBasUz(s.k, L))]);
  }
  ek('Tüm listeler', ['<a href="/kelime-bulucu/liste/">Kelime listeleri dizini</a>', '<a href="/kelime-bulucu/">Harflerden kelime bul</a>']);
  return bolum.join('');
}

// ---------------- SSS ----------------
function sss(s) {
  const ws = s.ws, n = ws.length, g = gruplar(ws);
  const enUzun = ws.reduce((a, w) => (w.length > a.length ? w : a), '');
  const uzunlar = ws.filter(w => w.length === enUzun.length).slice(0, 4);
  const ifd = ifade(s);
  const out = [];
  const dagilim = g.map(([L, l]) => `${L} harfli ${sayi(l.length)}`).join(', ');
  out.push([`${cumleBas(ifd)} kaç kelime var?`, `Bu listede ${ifd} ${sayi(n)} kelime var.` + (g.length > 1 ? ` Harf sayısına göre dağılımı: ${dagilim}.` : '')]);
  if (s.tip !== 'uz' && s.tip !== 'basUz' && s.tip !== 'bitUz') {
    out.push([`${cumleBas(ifd)} en uzun kelime hangisi?`, `${cumleBas(ifd)} en uzun kelime ${enUzun.length} harfli ${tirnak(enUzun)}.` + (uzunlar.length > 1 ? ` Aynı uzunlukta olanlar: ${uzunlar.filter(w => w !== enUzun).join(', ')}.` : '')]);
    const bes = ws.filter(w => w.length === 5);
    if (bes.length) out.push([`${cumleBas(ifd)} 5 harfli kelimeler hangileri?`, `${sayi(bes.length)} tane var: ${(yaygin(bes, 15).length >= 5 ? [...new Set([...yaygin(bes, 15), ...bes])] : bes).slice(0, 15).join(', ')}${bes.length > 15 ? ' ve diğerleri' : ''}.`]);
  } else {
    const ornek = (yaygin(ws, 12).length >= 6 ? yaygin(ws, 12) : ws.slice(0, 12));
    out.push([`En sık kullanılan ${ifd} kelimeler hangileri?`, `Günlük dilde sık geçenlerden bazıları: ${ornek.join(', ')}.`]);
    if (s.tip !== 'uz') out.push([`Bu kelimeler hangi oyunlarda işe yarar?`, `${cumleBas(ifd)} kelimeler Wordle tarzı tahmin oyunlarında, bulmacada ve harflerden kelime türetilen oyunlarda işe yarar. Harflerini bildiğin ama yerini bilmediğin durumlarda kelime bulucunun kalıpla arama sekmesini kullanabilirsin.`]);
  }
  out.push(['Bu kelime listesi nereden geliyor?', `Liste, Kelimeler oyununun 60.000'den fazla kelimelik Türkçe sözlüğünden üretilir. Özel adlar yoktur; çekimli biçimlerin bir kısmı vardır. Kelimelerin anlamları Vikisözlük'ten alınır.`]);
  return out;
}
const cumleBas = t => t.charAt(0).toLocaleUpperCase('tr') + t.slice(1);

// ---------------- sayfa şablonu ----------------
const ikonlar = `<link rel="icon" href="/kelime-bulucu/favicon-32.png" type="image/png" sizes="32x32"><link rel="apple-touch-icon" href="/kelime-bulucu/icon-192.png">`;
const tema = `<script>(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})();</script>`;
const ust = (crumb) => `<header class="b top"><div class="brand"><a href="/" class="logo" aria-label="okutan.org"><img class="l-light" src="/assets/logo.svg" width="96" height="26" alt="okutan"><img class="l-dark" src="/assets/logo-dark.svg" width="96" height="26" alt="okutan"></a><span class="crumb">${crumb}</span></div><button class="ctrl" id="themeBtn" aria-label="Tema"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button></header>`;
const alt = `<footer class="b"><span>© <span id="yr">2026</span> Sedat Okutan</span><nav aria-label="Diğer sayfalar"><a href="/">okutan.org</a><a href="/kelime-bulucu/">Kelime Bulucu</a><a href="/kelime-bulucu/liste/">Kelime Listeleri</a><a href="/gizli-kelime/">Gizli Kelime</a><a href="/oyunlar/">Oyunlar</a><a href="/kelimeler/">Kelimeler</a></nav></footer>`;
const ARA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
const mini = `<form class="mini" id="miniForm" action="/kelime-bulucu/" role="search"><input class="inp" id="miniInp" name="h" placeholder="Harflerini yaz: kalem*" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="16" aria-label="Harflerin"><button class="go" type="submit">${ARA_SVG}<span>Kelime bul</span></button></form>`;

function bas(head) {
  const { baslik, aciklama, url, ogBaslik, jsonld } = head;
  const tam = SITE + encodeURI(url);
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(baslik)}</title>
<meta name="description" content="${esc(aciklama)}">
<meta name="author" content="Sedat Okutan">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#f6f8f7">
<link rel="canonical" href="${tam}">
<meta property="og:type" content="website"><meta property="og:site_name" content="okutan.org"><meta property="og:locale" content="tr_TR">
<meta property="og:title" content="${esc(ogBaslik)}"><meta property="og:description" content="${esc(aciklama)}"><meta property="og:url" content="${tam}">
<meta property="og:image" content="${SITE}/kelime-bulucu/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Kelime Bulucu: yeşil harf taşlarıyla yazılmış Türkçe kelimeler ve arama kutusu">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@okutanapp"><meta name="twitter:title" content="${esc(ogBaslik)}"><meta name="twitter:description" content="${esc(aciklama)}"><meta name="twitter:image" content="${SITE}/kelime-bulucu/og.png"><meta name="twitter:image:alt" content="Kelime Bulucu: yeşil harf taşlarıyla yazılmış Türkçe kelimeler ve arama kutusu">
${ikonlar}
<link rel="preload" href="/assets/fonts/Roboto-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/kelime-bulucu/kb.css?v=${V}">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
${tema}
</head>`;
}
function breadcrumb(son) {
  const items = [['okutan.org', SITE + '/'], ['Kelime Bulucu', SITE + '/kelime-bulucu/'], ['Kelime Listeleri', SITE + '/kelime-bulucu/liste/']];
  if (son) items.push(son);
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) };
}

function sayfaHtml(s) {
  const ws = s.ws, n = ws.length, g = gruplar(ws);
  const enUzun = ws.reduce((a, w) => (w.length > a.length ? w : a), '');
  const enKisa = ws.reduce((a, w) => (w.length < a.length ? w : a), ws[0]);
  const enCok = g.reduce((a, x) => (x[1].length > a[1].length ? x : a), g[0]);
  const sik = yaygin(ws, 8);
  const ifd = ifade(s), A = ad(s);
  const baslik = s.tip === 'uz'
    ? `${A} — ${sayi(n)} Kelimelik Tam Liste ve Anlamları | okutan.org`
    : `${A} — ${sayi(n)} Kelime${g.length > 1 ? ', Harf Sayısına Göre' : ''} | okutan.org`;
  const aciklama = s.tip === 'uz'
    ? `${s.L} harfli Türkçe kelimelerin tam listesi: ${sayi(n)} kelime. ${sik.length ? 'Sık kullanılanlar: ' + sik.slice(0, 5).join(', ') + '. ' : ''}Harfe göre ayrılmış listeler, anlamlar ve harflerden kelime bulucu.`
    : `${cumleBas(ifd)} ${sayi(n)} Türkçe kelime${g.length > 1 ? `, ${enKisa.length} harfliden ${enUzun.length} harfliye uzunluğa göre` : ''}. ${sik.length ? 'Örnek: ' + sik.slice(0, 4).join(', ') + '. ' : ''}Anlamlar ve harflerden kelime bulucu.`;
  // giriş paragrafı
  let p = `Sözlüğümüzde ${ifd} <b>${sayi(n)} kelime</b> var.`;
  if (g.length > 1) p += ` En kısası ${enKisa.length} harfli ${tirnak(enKisa)}, en uzunu ${enUzun.length} harfli ${tirnak(enUzun)}. En çok kelime ${enCok[0]} harflilerde (${sayi(enCok[1].length)}).`;
  if (sik.length >= 3) p += ` Günlük dilde en sık geçenler: ${sik.slice(0, 6).join(', ')}.`;
  p += ` Bir kelimeye dokununca anlamı açılır; elindeki harflerle kelime türetmek için aşağıdaki kutuyu kullan.`;

  // liste
  const buyukListe = n > 6000 && s.tip !== 'uz';
  const lens = g.length > 1 ? `<nav class="lens" aria-label="Harf sayısı">${g.map(([L, l]) => `<a href="#u${L}">${L}<small>${sayi(l.length)}</small></a>`).join('')}</nav>` : '';
  const govde = g.map(([L, l]) => {
    let goster = l, devam = '';
    if (buyukListe && l.length > 250) {
      const yaygin250 = new Set(yaygin(l, 250));
      goster = l.filter(w => yaygin250.has(w));
      if (goster.length < 250) goster = [...new Set([...goster, ...l])].slice(0, 250).sort(cmp); else goster.sort(cmp);
      const alt = s.tip === 'bas' && s.k.length === 1 ? sayfalar.get(slugBasUz(s.k, L)) : s.tip === 'bit' && s.k.length === 1 ? sayfalar.get(slugBitUz(s.k, L)) : null;
      const href = alt ? alt.url : araclink(kalipOf(s), L);
      devam = `<a class="more" href="${href}">Tüm ${L} harfli ${sayi(l.length)} kelimeyi gör →</a>`;
    }
    const h3 = g.length > 1 || s.tip === 'uz' ? `<h3 id="u${L}">${L} harfli ${s.tip === 'uz' ? '' : ifd + ' '}kelimeler <small>${sayi(l.length)}${goster.length < l.length ? ' · ' + sayi(goster.length) + ' tanesi' : ''}</small></h3>` : '';
    return `<div class="grp">${h3}<ul class="ws">${goster.map(w => `<li>${vurgula(s, w)}</li>`).join('')}</ul>${devam}</div>`;
  }).join('');

  // anlamlar
  let anlamli = yaygin(ws.filter(w => tanim.has(w)), 12);
  if (anlamli.length < 8) anlamli = [...new Set([...anlamli, ...ws.filter(w => tanim.has(w) && tanim.get(w).length > 12)])].slice(0, 8);
  const anlamHtml = anlamli.length ? `<section class="b" aria-labelledby="hAnlam"><h2 id="hAnlam">Bazı ${ifd} kelimelerin anlamları</h2><dl class="defs">${anlamli.map(w => `<div><dt>${buyuk(w)}</dt><dd>${esc(cumleBas(tanim.get(w)))}</dd></div>`).join('')}</dl><p class="src">Anlamlar: <a href="https://tr.wiktionary.org/" target="_blank" rel="noopener">Vikisözlük</a> (CC BY-SA). Ayrıntılı tanım için TDK Güncel Türkçe Sözlük'e bakabilirsin.</p></section>` : '';

  const sorular = sss(s);
  const jsonld = { '@context': 'https://schema.org', '@graph': [
    breadcrumb([A, SITE + encodeURI(s.url)]),
    { '@type': 'FAQPage', mainEntity: sorular.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ] };
  const crumb = `<a href="/kelime-bulucu/">Kelime Bulucu</a> / <a href="/kelime-bulucu/liste/">Listeler</a> / <b>${esc(adKisa(s))}</b>`;
  return bas({ baslik, aciklama, url: s.url, ogBaslik: `${A} (${sayi(n)} kelime)`, jsonld }) + `
<body>
<div class="wrap">
${ust(crumb)}
<main>
<section class="b intro" aria-labelledby="pageTitle">
<div class="label">Kelime listesi · ${sayi(n)} kelime</div>
<h1 id="pageTitle">${esc(A)}</h1>
<p>${p}</p>
<div class="chips"><span class="chip"><b>${sayi(n)}</b><span>kelime</span></span>${g.length > 1 ? `<span class="chip"><b>${enUzun.length} harf</b><span>en uzun</span></span><span class="chip"><b>${enCok[0]} harfli</b><span>en kalabalık</span></span>` : ''}${tanim.size ? `<span class="chip"><b>${sayi(ws.filter(w => tanim.has(w)).length)}</b><span>anlamıyla</span></span>` : ''}</div>
${mini}
</section>
<section class="b res" aria-labelledby="hListe">
<div class="res-h"><h2 id="hListe">${esc(cumleBas(ifd))} kelimeler <small>${sayi(n)}</small></h2>${lens}</div>
${govde}
</section>
${anlamHtml}
<section class="b links" aria-label="İlgili listeler">${ilgili(s)}</section>
<section class="b faq" aria-labelledby="hSss"><h2 id="hSss">Sık sorulan sorular</h2>${sorular.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
</main>
${alt}
</div>
<script src="/kelime-bulucu/ortak.js?v=${V}" defer></script>
</body>
</html>
`;
}

// ---------------- dizin sayfası ----------------
function dizinHtml() {
  const grup = (tip, f = () => true) => [...sayfalar.values()].filter(s => s.tip === tip && f(s));
  const abc = (tip) => grup(tip, s => s.k.length === 1).sort((a, b) => cmp(a.k, b.k)).map(s => `<a href="${s.url}">${K(s.k)}</a>`).join('');
  const liste = (arr) => arr.sort((a, b) => cmp(a.k, b.k)).map(s => `<a href="${s.url}">${K(s.k)}<small>${sayi(s.ws.length)}</small></a>`).join('');
  const uzlar = grup('uz').sort((a, b) => a.L - b.L).map(s => `<a href="${s.url}">${s.L} harfli<small>${sayi(s.ws.length)}</small></a>`).join('');
  const tablo = (tip) => {
    const Ls = [...new Set(grup(tip).map(s => s.L))].sort((a, b) => a - b);
    return HARF.filter(h => grup(tip, s => s.k === h).length).map(h => `<h3>${K(h)} ile ${tip === 'basUz' ? 'başlayan' : 'biten'}</h3><div class="lk">${Ls.map(L => { const p = sayfalar.get((tip === 'basUz' ? slugBasUz : slugBitUz)(h, L)); return p ? `<a href="${p.url}">${L} harfli<small>${sayi(p.ws.length)}</small></a>` : ''; }).join('')}</div>`).join('');
  };
  const sorular = [
    ['Kaç kelime listesi var?', `Toplam ${sayi(sayfalar.size)} liste var: harfle başlayan, biten, içinde geçen, harf sayısına göre ve bunların birleşimleri. Hepsi ${sayi(kelimeler.length)} kelimelik Türkçe sözlükten üretilir.`],
    ['Aradığım liste yoksa ne yapmalıyım?', 'Kelime Bulucu\'nun kalıpla arama sekmesinde ? tek harf, * ise herhangi sayıda harf yerine geçer. Örneğin ka* ka ile başlayan, *lık lık ile biten, k?t?p ise beş harfli ve k_t_p biçimindeki kelimeleri bulur.'],
  ];
  const jsonld = { '@context': 'https://schema.org', '@graph': [breadcrumb(null), { '@type': 'FAQPage', mainEntity: sorular.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] };
  return bas({
    baslik: 'Kelime Listeleri — Harfle Başlayan, Biten, İçinde Geçen ve Harf Sayısına Göre Türkçe Kelimeler | okutan.org',
    aciklama: `Türkçe kelime listeleri: A'dan Z'ye harfle başlayan, biten, içinde geçen kelimeler; 2 harfliden 20 harfliye harf sayısına göre listeler. ${sayi(sayfalar.size)} liste, ${sayi(kelimeler.length)} kelime.`,
    url: '/kelime-bulucu/liste/', ogBaslik: 'Türkçe Kelime Listeleri', jsonld,
  }) + `
<body>
<div class="wrap">
${ust('<a href="/kelime-bulucu/">Kelime Bulucu</a> / <b>Listeler</b>')}
<main>
<section class="b intro" aria-labelledby="pageTitle">
<div class="label">${sayi(sayfalar.size)} liste · ${sayi(kelimeler.length)} kelime</div>
<h1 id="pageTitle">Türkçe Kelime Listeleri</h1>
<p>Harfle başlayan, harfle biten, içinde belli harfler geçen ve harf sayısına göre ayrılmış Türkçe kelime listeleri. Bulmaca, Wordle tarzı oyunlar, kelime türetme oyunları ve ödevler için. Her listede kelimeler uzunluğa göre gruplanır; bir kelimeye dokununca anlamı açılır.</p>
${mini}
</section>
<section class="b links" aria-label="Listeler">
<h3>Harf sayısına göre</h3><div class="lk">${uzlar}</div>
<h3>Harfle başlayan kelimeler</h3><div class="lk abc">${abc('bas')}</div>
<h3>Harfle biten kelimeler</h3><div class="lk abc">${abc('bit')}</div>
<h3>İçinde harf geçen kelimeler</h3><div class="lk abc">${abc('ic')}</div>
<h3>İki harfle başlayan</h3><div class="lk">${liste(grup('bas', s => s.k.length === 2))}</div>
<h3>Üç harfle başlayan</h3><div class="lk">${liste(grup('bas', s => s.k.length === 3))}</div>
<h3>İki harfle biten</h3><div class="lk">${liste(grup('bit', s => s.k.length === 2))}</div>
<h3>Üç harfle biten</h3><div class="lk">${liste(grup('bit', s => s.k.length === 3))}</div>
<h3>İçinde iki harf geçen</h3><div class="lk">${liste(grup('ic', s => s.k.length === 2))}</div>
</section>
<section class="b links" aria-label="Harf ve uzunluk"><h2>Harfle başlayan, harf sayısına göre</h2>${tablo('basUz')}</section>
<section class="b links" aria-label="Harf ve uzunluk"><h2>Harfle biten, harf sayısına göre</h2>${tablo('bitUz')}</section>
<section class="b faq" aria-labelledby="hSss"><h2 id="hSss">Sık sorulan sorular</h2>${sorular.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
</main>
${alt}
</div>
<script src="/kelime-bulucu/ortak.js?v=${V}" defer></script>
</body>
</html>
`;
}

// ---------------- yaz ----------------
const LDIZ = join(DIZ, 'liste');
rmSync(LDIZ, { recursive: true, force: true });
mkdirSync(LDIZ, { recursive: true });
let toplam = 0, enBuyuk = ['', 0];
for (const s of sayfalar.values()) {
  const html = sayfaHtml(s);
  mkdirSync(join(LDIZ, s.slug), { recursive: true });
  writeFileSync(join(LDIZ, s.slug, 'index.html'), html);
  toplam += Buffer.byteLength(html);
  if (Buffer.byteLength(html) > enBuyuk[1]) enBuyuk = [s.slug, Buffer.byteLength(html)];
}
writeFileSync(join(LDIZ, 'index.html'), dizinHtml());
const urls = [`${SITE}/kelime-bulucu/liste/`, ...[...sayfalar.values()].map(s => SITE + encodeURI(s.url))];
writeFileSync(join(DIZ, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${esc(u)}</loc><lastmod>${BUGUN}</lastmod><changefreq>monthly</changefreq><priority>${u.endsWith('/liste/') ? '0.7' : '0.5'}</priority></url>`).join('\n')}\n</urlset>\n`);
// araç sayfasındaki "hazır listeler" bölümü (<!--LISTE--> … <!--/LISTE-->)
{
  const tipte = (tip, f) => [...sayfalar.values()].filter(s => s.tip === tip && f(s));
  const abc = (tip, f = s => s.k.length === 1) => tipte(tip, f).sort((a, b) => cmp(a.k, b.k)).map(s => `<a href="${s.url.replace('/kelime-bulucu/', '')}">${K(s.k)}</a>`).join('');
  const blok = `<!--LISTE-->
    <div class="b links" aria-labelledby="hHazir">
      <h2 id="hHazir">Hazır kelime listeleri</h2>
      <h3>Harf sayısına göre</h3><div class="lk">${tipte('uz', s => s.L <= 15).sort((a, b) => a.L - b.L).map(s => `<a href="${s.url.replace('/kelime-bulucu/', '')}">${s.L} harfli<small>${sayi(s.ws.length)}</small></a>`).join('')}</div>
      <h3>Harfle başlayan kelimeler</h3><div class="lk abc">${abc('bas')}</div>
      <h3>Harfle biten kelimeler</h3><div class="lk abc">${abc('bit')}</div>
      <h3>Harfle başlayan 5 harfli kelimeler</h3><div class="lk abc">${abc('basUz', s => s.L === 5)}</div>
      <h3>Tümü</h3><div class="lk"><a href="liste/">Kelime listeleri dizini<small>${sayi(sayfalar.size)}</small></a></div>
    </div>
<!--/LISTE-->`;
  const yol = join(DIZ, 'index.html');
  const html = readFileSync(yol, 'utf8');
  const yeni = html.replace(/<!--LISTE-->[\s\S]*?<!--\/LISTE-->/, blok);
  if (yeni === html && !html.includes('<!--LISTE-->')) console.warn('UYARI: index.html içinde <!--LISTE--> işareti yok');
  writeFileSync(yol, yeni);
}
console.log('yazıldı',sayfalar.size + 1, 'sayfa,', (toplam / 1048576).toFixed(1), 'MB; en büyük', enBuyuk[0], (enBuyuk[1] / 1024).toFixed(0), 'KB');
