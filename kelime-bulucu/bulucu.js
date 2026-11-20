/* Kelime Bulucu — arayüz. Arama motoru motor.js'te (window.KelimeBulucu), ortak parçalar ortak.js'te (window.KBOrtak).
   Sözlük sozluk.txt'den (ön ekle sıkıştırılmış) bir kez yüklenir; arama tamamen tarayıcıda yapılır.
   Sekmeler: harf (harflerden), kalip (kalıpla), wordle (Wordle yardımcısı), gecerli (kelime geçerli mi?).
   Adres (Türkçe karakter yok; Türkçe harf büyük ASCII: ç→C ğ→G ı→I ö→O ş→S ü→U, ? → _):
     ?h=harfler&b=geçecek&u=uzunluk · ?k=kalıp&u= · ?wy=yeşil(5, boş=.)&ws=sarı(5, | ile)&wg=gri · ?g=kelime */
(function () {
  'use strict';
  var KB = window.KelimeBulucu, O = window.KBOrtak;
  function $(id) { return document.getElementById(id); }
  var sozluk = null, kume = null, bekleyen = false, gecenL = 0, sira = 'uz', torba = false, sonHam = [], sonDuz = [], puanTum = false,
    mod = 'harf', sonInput = null, sonGruplar = [], secUz = 0, sonOzet = '';
  var SINIR = 400;
  var hInp = $('hInp'), bInp = $('bInp'), kInp = $('kInp'), gInp = $('gInp'), uSel = $('uSel'), wgInp = $('wg');
  var wy = [].slice.call(document.querySelectorAll('.wy')), ws = [].slice.call(document.querySelectorAll('.ws5'));
  var tumInput = [hInp, bInp, kInp, gInp, wgInp].concat(wy, ws);
  var esc = O.esc, sayi = function (n) { return n.toLocaleString('tr-TR'); };

  // ---------- sözlük ----------
  fetch('sozluk.txt?v=1').then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (t) {
    sozluk = KB.sozlukAc(t);
    kume = Object.create(null); for (var i = 0; i < sozluk.length; i++) kume[sozluk[i]] = 1;
    var sh = KB.slugHarita(sozluk); window.KBSlug = sh.slug;
    $('dictInfo').textContent = sayi(sozluk.length) + ' kelime hazır';
    if (bekleyen) ara(false);
    gununKelimesi();
  }).catch(function () { $('dictInfo').textContent = 'Sözlük yüklenemedi; sayfayı yenile.'; });

  // ---------- sekmeler ----------
  var MODLAR = ['harf', 'kalip', 'wordle', 'gecerli'];
  function modSec(m, odak) {
    mod = MODLAR.indexOf(m) >= 0 ? m : 'harf';
    MODLAR.forEach(function (x) { var t = $('tab_' + x); t.setAttribute('aria-selected', x === mod); });
    $('hFld').hidden = $('bFld').hidden = mod !== 'harf';
    $('kFld').hidden = mod !== 'kalip';
    $('wFld').hidden = mod !== 'wordle';
    $('gFld').hidden = mod !== 'gecerli';
    $('uFld').hidden = mod === 'wordle' || mod === 'gecerli';
    $('kQ').hidden = mod !== 'kalip';
    $('kJ').hidden = mod === 'wordle' || mod === 'gecerli';
    ['Harf', 'Kalip', 'Wordle', 'Gecerli'].forEach(function (x) { $('hint' + x).hidden = x.toLowerCase() !== mod; });
    $('form').className = 'form m-' + mod;
    if (odak) ({ harf: hInp, kalip: kInp, wordle: wy[0], gecerli: gInp })[mod].focus();
  }
  MODLAR.forEach(function (m) { $('tab_' + m).onclick = function () { modSec(m, true); if (mod === 'gecerli' && gInp.value) ara(false); }; });

  // ---------- Türkçe harf tuşları ----------
  tumInput.forEach(function (el) { el.addEventListener('focus', function () { sonInput = el; }); });
  $('keys').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
  $('keys').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var el = sonInput && !sonInput.closest('[hidden]') ? sonInput : ({ harf: hInp, kalip: kInp, wordle: wy[0], gecerli: gInp })[mod];
    var c = b.getAttribute('data-c');
    if (b.id === 'kSil') { sil(el); return; }
    if (b.id === 'kTemiz') { tumInput.forEach(function (x) { x.value = ''; }); uSel.value = '0'; boya(); temizle(); el.focus(); return; }
    if (el === bInp && (c === '*' || c === '?')) el = hInp;
    yaz(el, c);
    boya();
    if (el.classList.contains('wy') && el.value) ilerle(el, wy);
  });
  function yaz(el, c) {
    var s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
    if (el.maxLength > 0 && el.value.length - (e - s) >= el.maxLength) { if (el.maxLength === 1) { el.value = c; return; } return; }
    el.value = el.value.slice(0, s) + c + el.value.slice(e);
    try { el.setSelectionRange(s + c.length, s + c.length); } catch (x) {}
    el.focus();
  }
  function sil(el) {
    var s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
    if (s === e && s > 0) s--;
    el.value = el.value.slice(0, s) + el.value.slice(e);
    try { el.setSelectionRange(s, s); } catch (x) {}
    el.focus();
  }
  // Wordle yeşil kutuları: harf yazınca sonrakine geç, boşken ⌫ ile öncekine dön
  function boya() { wy.forEach(function (x) { x.classList.toggle('dolu', !!x.value); }); }
  function ilerle(el, dizi) { var i = dizi.indexOf(el); if (i >= 0 && i < dizi.length - 1) dizi[i + 1].focus(); }
  wy.forEach(function (el, i) {
    el.addEventListener('input', function () { el.value = KB.harf(el.value).slice(-1); boya(); if (el.value) ilerle(el, wy); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !el.value && i > 0) { wy[i - 1].focus(); wy[i - 1].value = ''; e.preventDefault(); } });
  });
  // "/" ile arama kutusuna git
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); ({ harf: hInp, kalip: kInp, wordle: wy[0], gecerli: gInp })[mod].focus(); }
  });

  // ---------- arama ----------
  $('form').addEventListener('submit', function (e) { e.preventDefault(); ara(true); });
  uSel.addEventListener('change', function () { if (sonGruplar.length || adresVar()) ara(true); });
  gInp.addEventListener('input', function () { if (sozluk) ara(false); });
  function adresVar() { return /[?&](h|k|wy|ws|wg|g)=/.test(location.search); }

  function ara(kaydir) {
    var u = +uSel.value || 0, sonuc, ozet;
    if (mod === 'gecerli') { gecerli(); adresYaz(); return; }
    if (mod === 'harf') {
      var r = KB.raf(hInp.value), g = KB.harf(bInp.value);
      if (!r) { hata('Harflerini yaz', 'Örneğin: kalem, kitap* ya da sadece harfler: aeklm'); adresYaz(); return; }
      if (!sozluk) { bekleyen = true; yukleniyor(); return; }
      sonuc = KB.harflerle(sozluk, r, { gecen: g, uzunluk: u }); gecenL = g.length;
      ozet = '<b>' + KB.buyuk(r) + '</b>' + (g ? ' + geçecek <b>' + KB.buyuk(g) + '</b>' : '');
    } else if (mod === 'kalip') {
      var k = KB.kalip(kInp.value);
      if (!k || (k === '*' && !u)) { hata('Bir kalıp yaz', '? tek harf, * herhangi sayıda harf: k?t?p, ka*, *lık'); adresYaz(); return; }
      if (!sozluk) { bekleyen = true; yukleniyor(); return; }
      sonuc = KB.kalipla(sozluk, k, { uzunluk: u }); gecenL = 0;
      ozet = 'kalıp <b>' + KB.buyuk(k) + '</b>';
    } else {
      var yes = wy.map(function (x) { return KB.harf(x.value).slice(0, 1); }), sar = ws.map(function (x) { return KB.harf(x.value); }), gri = KB.harf(wgInp.value);
      if (!yes.join('') && !sar.join('') && !gri) { hata('Harf ipuçlarını yaz', 'Yeşil: yeri doğru harf · sarı: kelimede var ama o yerde değil · gri: kelimede yok'); adresYaz(); return; }
      if (!sozluk) { bekleyen = true; yukleniyor(); return; }
      sonuc = KB.wordle(sozluk, { yesil: yes, sari: sar, gri: gri }); gecenL = 0; u = 0;
      ozet = 'Wordle · <b>' + yes.map(function (c) { return c ? KB.buyuk(c) : '_'; }).join('') + '</b>' + (sar.join('') ? ' · sarı ' + KB.buyuk(sar.join('')) : '') + (gri ? ' · gri ' + KB.buyuk(gri) : '');
    }
    bekleyen = false;
    adresYaz();
    secUz = 0; sonHam = sonuc; sonOzet = ozet + (u ? ' · ' + u + ' harfli' : '');
    if (kaydir) { sonEkle(); logla(); }
    hazirla();
    ciz();
    if (kaydir && sonuc.length && matchMedia('(max-width: 820px)').matches) $('res').scrollIntoView({ behavior: 'smooth', block: 'start' });
    stickGuncelle();
  }
  function hazirla() {
    var l = torba ? sonHam.filter(function (x) { return KB.torbaFazla(x.k) <= 2; }) : sonHam;
    sonGruplar = KB.grupla(l); sonDuz = KB.puanaGore(l); puanTum = false;
    if (mod === 'wordle') { var s = KB.puanaGore(l); sonDuz = s; }
  }

  // Geçerli mi? — anında cevap
  function gecerli() {
    var w = KB.harf(gInp.value);
    $('res').hidden = false; $('lens').innerHTML = ''; $('sortB').hidden = true; sonGruplar = [];
    if (!w) { $('resTitle').innerHTML = ''; $('resBody').innerHTML = '<div class="empty"><b>Bir kelime yaz</b>Sözlükte olup olmadığını, puanını ve anlamını hemen gör.</div>'; return; }
    if (!sozluk) { bekleyen = true; yukleniyor(); return; }
    $('resTitle').innerHTML = '';
    var var_ = !!kume[w], p = KB.puan(w);
    var h = '<div class="gec ' + (var_ ? 'ok' : 'yok') + '"><div class="gec-i" aria-hidden="true">' + (var_ ? '✓' : '✕') + '</div><div><b>' + esc(KB.buyuk(w)) + '</b> ' +
      (var_ ? 'sözlükte var' : 'sözlükte yok') + '<small>' + w.length + ' harf · ' + p + ' puan' + (var_ && KB.torbaFazla(w) > 2 ? ' · torbada yeterli taş yok' : '') + '</small>' +
      (var_ ? '<p class="gec-a" id="gecA">…</p><a class="more" href="' + O.kelimeUrl(w) + '">Kelime sayfası: anlamlar, hece, türetilenler →</a>' : '') + '</div></div>';
    if (!var_) {
      var ben = sozluk.filter(function (x) { if (Math.abs(x.length - w.length) > 1) return false; return yakin(x, w); }).slice(0, 24);
      if (ben.length) h += '<div class="grp"><h3>Bunu mu demek istedin?</h3><ul class="ws">' + ben.map(function (x) { return kelimeHtml({ k: x, j: [], g: -1, p: KB.puan(x) }); }).join('') + '</ul></div>';
    }
    $('resBody').innerHTML = h;
    if (var_) O.anlam(w).then(function (d) { var el = $('gecA'); if (el) el.textContent = d ? d.charAt(0).toLocaleUpperCase('tr') + d.slice(1) : 'Anlamı sözlüğümüzde henüz yok.'; });
  }
  function yakin(a, b) { // en çok bir düzenleme (değiştirme, ekleme, silme)
    if (a === b) return false;
    if (a.length === b.length) { var f = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i] && ++f > 1) return false; return true; }
    var s = a.length < b.length ? a : b, l = a.length < b.length ? b : a;
    for (var j = 0; j < l.length; j++) if (l.slice(0, j) + l.slice(j + 1) === s) return true;
    return false;
  }

  function adresYaz() {
    var p = [], u = uSel.value, K = function (v) { return encodeURIComponent(KB.aracKod(v)).replace(/%2A/g, '*'); };
    if (mod === 'harf') { if (hInp.value) p.push('h=' + K(KB.raf(hInp.value))); if (bInp.value) p.push('b=' + K(KB.harf(bInp.value))); }
    else if (mod === 'kalip') { if (kInp.value) p.push('k=' + K(KB.kalip(kInp.value))); }
    else if (mod === 'wordle') {
      var y = wy.map(function (x) { return KB.harf(x.value).slice(0, 1) || '.'; }).join(''), s = ws.map(function (x) { return KB.harf(x.value); }).join('|');
      if (y !== '.....') p.push('wy=' + K(y)); if (s.replace(/\|/g, '')) p.push('ws=' + K(s)); if (wgInp.value) p.push('wg=' + K(KB.harf(wgInp.value)));
      if (!p.length) p.push('m=wordle');
    } else { p.push(gInp.value ? 'g=' + K(KB.harf(gInp.value)) : 'm=gecerli'); }
    if (u && u !== '0' && (mod === 'harf' || mod === 'kalip')) p.push('u=' + u);
    try { history.replaceState(null, '', location.pathname + (p.length ? '?' + p.join('&') : '')); } catch (e) {}
  }

  function yukleniyor() { $('res').hidden = false; $('resTitle').innerHTML = 'Sözlük yükleniyor…'; $('lens').innerHTML = ''; $('resBody').innerHTML = ''; }
  function hata(b, a) { $('res').hidden = false; $('resTitle').innerHTML = ''; $('lens').innerHTML = ''; $('sortB').hidden = true; sonGruplar = []; $('resBody').innerHTML = '<div class="empty"><b>' + b + '</b>' + a + '</div>'; stickGuncelle(); }
  function temizle() { sonGruplar = []; sonHam = []; $('res').hidden = true; adresYaz(); stickGuncelle(); }

  var sayac = 0;
  function kelimeHtml(x) {
    var w = x.k, j = {}, out = '';
    for (var i = 0; i < x.j.length; i++) j[x.j[i]] = 1;
    var gb = x.g, ge = x.g >= 0 ? x.g + gecenL : -1;
    for (var n = 0; n < w.length; n++) {
      var c = w[n];
      if (n === gb) out += '<u>';
      out += j[n] ? '<i>' + c + '</i>' : c;
      if (n === ge - 1) out += '</u>';
    }
    var anim = sayac < 48 ? ' style="--i:' + (sayac++) + '"' : '';
    var trb = KB.torbaFazla(w) > 2 ? ' class="trb" title="Türkçe Scrabble torbasında yeterli taş yok"' : '';
    return '<li data-k="' + w + '"' + anim + (trb ? trb : '') + ' tabindex="0">' + out + O.rozet(x.p) + '</li>';
  }

  function ciz() {
    var toplam = sonGruplar.reduce(function (t, g) { return t + g.liste.length; }, 0);
    $('res').hidden = false;
    if (!toplam) {
      $('resTitle').innerHTML = ''; $('lens').innerHTML = ''; $('sortB').hidden = !sonHam.length;
      $('resBody').innerHTML = '<div class="empty"><b>Kelime bulunamadı</b>' + sonOzet + ' ile kurulan bir kelime yok. ' +
        (torba && sonHam.length ? 'Torba süzgecini kapatınca ' + sayi(sonHam.length) + ' kelime görünür.' : mod === 'harf' ? 'Bir joker (*) eklemeyi ya da uzunluk süzgecini kaldırmayı dene.' : mod === 'kalip' ? 'Kalıba * ekleyerek aramayı genişletebilirsin.' : 'İpuçlarını kontrol et: aynı harf hem gri hem yeşil olabilir.') + '</div>';
      return;
    }
    var en = sonDuz[0];
    $('resTitle').innerHTML = sayi(toplam) + ' kelime <small>' + sonOzet + ' · en yüksek puan: ' + KB.buyuk(en.k) + ' ' + en.p + '</small>';
    $('sortB').hidden = false;
    [].forEach.call($('sortB').querySelectorAll('button[data-s]'), function (b) { b.hidden = mod === 'wordle'; });
    var l = '<button type="button" data-u="0" class="on">Tümü<small>' + sayi(toplam) + '</small></button>';
    sonGruplar.forEach(function (g) { l += '<button type="button" data-u="' + g.uzunluk + '">' + g.uzunluk + ' harf<small>' + sayi(g.liste.length) + '</small></button>'; });
    $('lens').innerHTML = sonGruplar.length > 1 ? l : '';
    govde();
  }
  function govde() {
    var h = ''; sayac = 0;
    if (sira === 'puan' || mod === 'wordle') {
      var l = secUz ? sonDuz.filter(function (x) { return x.k.length === secUz; }) : sonDuz;
      var lim = puanTum ? l.length : Math.min(l.length, SINIR);
      h = '<div class="grp"><h3>' + (mod === 'wordle' ? 'Olası kelimeler, puana göre' : 'Puana göre, yüksekten düşüğe') + ' <small>' + sayi(l.length) + '</small></h3><ul class="ws">';
      for (var n = 0; n < lim; n++) h += kelimeHtml(l[n]);
      h += '</ul>' + (lim < l.length ? '<button type="button" class="more" data-tump="1">Tüm ' + sayi(l.length) + ' kelimeyi göster →</button>' : '') + '</div>';
      $('resBody').innerHTML = h;
      return;
    }
    sonGruplar.forEach(function (g) {
      if (secUz && g.uzunluk !== secUz) return;
      var limit = secUz ? g.liste.length : Math.min(g.liste.length, SINIR);
      h += '<div class="grp"><h3>' + g.uzunluk + ' harfli <small>' + sayi(g.liste.length) + '</small></h3><ul class="ws">';
      for (var i = 0; i < limit; i++) h += kelimeHtml(g.liste[i]);
      h += '</ul>' + (limit < g.liste.length ? '<button type="button" class="more" data-tum="' + g.uzunluk + '">Tüm ' + sayi(g.liste.length) + ' kelimeyi göster →</button>' : '') + '</div>';
    });
    $('resBody').innerHTML = h;
  }
  $('lens').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    secUz = +b.getAttribute('data-u');
    [].forEach.call($('lens').children, function (x) { x.classList.toggle('on', x === b); });
    govde();
  });
  $('resBody').addEventListener('click', function (e) {
    if (e.target.closest('[data-tump]')) { puanTum = true; govde(); return; }
    var b = e.target.closest('[data-tum]'); if (!b) return;
    secUz = +b.getAttribute('data-tum');
    [].forEach.call($('lens').children, function (x) { x.classList.toggle('on', +x.getAttribute('data-u') === secUz); });
    govde();
    $('res').scrollIntoView({ block: 'start' });
  });
  // örnek aramalar
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-ornek]'); if (!a) return;
    e.preventDefault();
    adrestenAc(new URLSearchParams(a.getAttribute('data-ornek'))); rafCiz(); ara(true);
  });

  // ---------- sıralama ve torba ----------
  function siraSec(s2) {
    sira = s2 === 'puan' ? 'puan' : 'uz';
    [].forEach.call($('sortB').querySelectorAll('button[data-s]'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-s') === sira); });
    try { localStorage.setItem('kb_sira', sira); } catch (e) {}
  }
  $('sortB').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-s]'); if (!b) return;
    siraSec(b.getAttribute('data-s')); if (sonGruplar.length) govde();
  });
  $('torbaCb').addEventListener('change', function () {
    torba = this.checked; try { localStorage.setItem('kb_torba', torba ? '1' : ''); } catch (e) {}
    if (sonHam.length) { secUz = 0; hazirla(); ciz(); }
  });
  try { siraSec(localStorage.getItem('kb_sira')); torba = $('torbaCb').checked = localStorage.getItem('kb_torba') === '1'; } catch (e) {}

  // ---------- telefonda sabit arama çubuğu ----------
  var stick = $('stick'), formGorunur = true;
  function stickGuncelle() {
    var goster = !formGorunur && !$('res').hidden && matchMedia('(max-width: 820px)').matches;
    stick.hidden = !goster;
    if (goster) $('stickQ').innerHTML = sonOzet || '';
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { formGorunur = e[0].isIntersecting; stickGuncelle(); }).observe($('form'));
  $('stickBtn').onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(function () { ({ harf: hInp, kalip: kInp, wordle: wy[0], gecerli: gInp })[mod].focus(); }, 350); };

  // ---------- harf rafı (yazdığın harfler puanlı taşlar olarak) ----------
  function rafCiz(karis) {
    var r = KB.raf(hInp.value), el = $('hraf');
    if (!r) { el.innerHTML = ''; return; }
    el.innerHTML = r.split('').map(function (c) { return c === '*' ? '<i class="jk">*<small>0</small></i>' : '<i>' + KB.buyuk(c) + '<small>' + (KB.PUAN[c] || 0) + '</small></i>'; }).join('') +
      (r.length > 1 ? '<button type="button" class="kar" id="karBtn" title="Harfleri karıştır"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>Karıştır</button>' : '');
    if (karis) { el.classList.remove('karis'); void el.offsetWidth; el.classList.add('karis'); }
  }
  hInp.addEventListener('input', function () { rafCiz(); });
  $('hraf').addEventListener('click', function (e) {
    if (!e.target.closest('#karBtn')) return;
    var a = KB.raf(hInp.value).split('');
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    hInp.value = a.join(''); rafCiz(true);
  });

  // ---------- son aramalar (yalnızca bu tarayıcıda) ----------
  function sonOku() { try { return JSON.parse(localStorage.getItem('kb_son') || '[]'); } catch (e) { return []; } }
  function sonEkle() {
    var q = location.search.slice(1); if (!q || /^m=/.test(q)) return;
    var etiket = $('resTitle').textContent ? sonOzet.replace(/<[^>]+>/g, '') : '';
    if (mod === 'gecerli') etiket = KB.buyuk(KB.harf(gInp.value));
    if (!etiket) return;
    var l = sonOku().filter(function (x) { return x.q !== q; }); l.unshift({ q: q, e: etiket.slice(0, 40) });
    try { localStorage.setItem('kb_son', JSON.stringify(l.slice(0, 8))); } catch (e) {}
    sonCiz();
  }
  function sonCiz() {
    var l = sonOku(), el = $('son');
    el.hidden = !l.length;
    el.innerHTML = l.length ? 'Son aramaların: ' + l.map(function (x) { return '<a href="?' + esc(x.q) + '" data-ornek="' + esc(x.q) + '">' + esc(x.e) + '</a>'; }).join('') + '<button type="button" class="sil" id="sonSil">temizle</button>' : '';
  }
  $('son').addEventListener('click', function (e) { if (e.target.id === 'sonSil') { try { localStorage.removeItem('kb_son'); } catch (x) {} sonCiz(); } });
  sonCiz();

  // ---------- popüler aramalar (kimlik bilgisi olmadan sayılır: api.php) ----------
  function logla() {
    var t = { harf: 'h', kalip: 'k', wordle: 'w', gecerli: 'g' }[mod], q;
    if (mod === 'harf') q = KB.raf(hInp.value) + (bInp.value ? '.' + KB.harf(bInp.value) : '');
    else if (mod === 'kalip') q = KB.kalip(kInp.value);
    else if (mod === 'wordle') q = wy.map(function (x) { return KB.harf(x.value).slice(0, 1) || '.'; }).join('');
    else q = KB.harf(gInp.value);
    if (!q || !navigator.sendBeacon) return;
    try { var f = new FormData(); f.append('t', t); f.append('q', q); navigator.sendBeacon('api.php?a=say', f); } catch (e) {}
  }
  var gecZ = null;
  gInp.addEventListener('input', function () { clearTimeout(gecZ); gecZ = setTimeout(function () { if (kume && kume[KB.harf(gInp.value)]) { logla(); sonEkle(); } }, 1800); });
  fetch('api.php?a=populer').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
    var h = (d.h || []).slice(0, 10), g = (d.g || []).slice(0, 10), el = $('pop');
    if (!h.length && !g.length) return;
    el.innerHTML = 'Popüler: ' + h.map(function (x) { var q = x[0].split('.')[0]; return '<a href="?h=' + encodeURIComponent(KB.aracKod(q)) + '" data-ornek="h=' + encodeURIComponent(KB.aracKod(q)) + '">' + esc(KB.buyuk(q)) + '</a>'; }).join('') +
      g.map(function (x) { return '<a href="kelime/' + esc(x[2]) + '/">' + esc(x[0]) + '</a>'; }).join('');
    el.hidden = false;
  }).catch(function () {});

  // ---------- günün kelimesi ----------
  function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function gununKelimesi() {
    var kutu = $('gunk'); if (!kutu) return;
    var d = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // Türkiye saati
    fetch('veri/gunluk.txt?v=1').then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (t) {
      var l = t.split('\n').filter(Boolean); if (!l.length) return;
      var w = l[fnv('kelime-' + d) % l.length];
      $('gunkT').innerHTML = w.split('').map(function (c) { return '<i>' + KB.buyuk(c) + '<small>' + (KB.PUAN[c] || 0) + '</small></i>'; }).join('');
      $('gunkM').textContent = w.length + ' harf · ' + KB.puan(w) + ' puan';
      $('gunkA').href = O.kelimeUrl(w);
      kutu.hidden = false;
      O.anlam(w).then(function (a) { $('gunkD').textContent = a ? a.charAt(0).toLocaleUpperCase('tr') + a.slice(1) : ''; });
    }).catch(function () {});
  }

  // ---------- kontroller sekmesi ----------
  [['cTabDesk', 'ctlDesk'], ['cTabMob', 'ctlMob']].forEach(function (p, i, all) {
    $(p[0]).onclick = function () { all.forEach(function (q) { $(q[0]).setAttribute('aria-selected', q === p); $(q[1]).hidden = q !== p; }); };
  });
  if (matchMedia('(pointer: coarse)').matches) $('cTabMob').click();

  // ---------- başlangıç ----------
  function coz(v) { return v == null ? '' : KB.aracCoz(v); }
  function adrestenAc(p) {
    hInp.value = coz(p.get('h')); bInp.value = coz(p.get('b')); kInp.value = coz(p.get('k')); gInp.value = coz(p.get('g'));
    var y = coz(p.get('wy')), s = coz(p.get('ws')).split('|');
    wy.forEach(function (x, i) { x.value = y[i] && y[i] !== '.' ? y[i] : ''; }); boya(); ws.forEach(function (x, i) { x.value = s[i] || ''; }); wgInp.value = coz(p.get('wg'));
    var u = p.get('u'); uSel.value = u && uSel.querySelector('option[value="' + (+u) + '"]') ? String(+u) : '0';
    modSec(p.get('g') != null || p.get('m') === 'gecerli' ? 'gecerli' : p.get('wy') != null || p.get('ws') != null || p.get('wg') != null || p.get('m') === 'wordle' ? 'wordle' : p.get('k') != null && !p.get('h') ? 'kalip' : 'harf', false);
  }
  var ilk = new URLSearchParams(location.search);
  adrestenAc(ilk); rafCiz();
  if (adresVar()) ara(false);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
