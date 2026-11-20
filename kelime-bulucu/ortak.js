/* Kelime Bulucu — araç, liste ve kelime sayfalarında ortak: tema, anlam penceresi (araçta), küçük arama formu,
   liste sayfasında puana göre sıralama. Liste ve kelime sayfalarının HTML'ini PHP üretir (liste.php, kelime.php).
   Anlamlar /kelime-bulucu/anlam/<ilk harf>.json parçalarından gerektikçe yüklenir (Vikisözlük, CC BY-SA).
   Adreslerde Türkçe karakter yok: kelime sayfası adresi window.KBSlug (araçta sözlükten) ya da ASCII çevirisi;
   araç adreslerinde Türkçe harf büyük ASCII harfle yazılır (ç→C …, ? → _). */
(function () {
  'use strict';
  var root = document.documentElement;
  function $(id) { return document.getElementById(id); }
  var PARCA = { 'ç': 'c1', 'ğ': 'g1', 'ı': 'i1', 'ö': 'o1', 'ş': 's1', 'ü': 'u1' };
  var yuklu = {};
  // Türkçe Scrabble taş puanları (motor.js'teki PUAN ile aynı; joker 0).
  var PUAN = { a: 1, b: 3, c: 4, 'ç': 4, d: 3, e: 1, f: 7, g: 5, 'ğ': 8, h: 5, 'ı': 2, i: 1, j: 10, k: 1, l: 1, m: 2,
    n: 1, o: 2, 'ö': 7, p: 5, r: 1, s: 2, 'ş': 4, t: 1, u: 2, 'ü': 3, v: 7, y: 3, z: 4 };
  function kat(p) { return p >= 20 ? 4 : p >= 12 ? 3 : p >= 7 ? 2 : 1; }
  function rozet(p) { return '<sub class="pt t' + kat(p) + '" title="' + p + ' puan">' + p + '</sub>'; }
  function puan(w) { var t = 0; for (var i = 0; i < w.length; i++) t += PUAN[w[i]] || 0; return t; }
  function buyuk(s) { return String(s).replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase(); }
  function kucuk(s) { return String(s).replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ascii(s) { return String(s).replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u'); }
  function aracKod(s) { return String(s).replace(/[çğıöşü?]/g, function (c) { return { 'ç': 'C', 'ğ': 'G', 'ı': 'I', 'ö': 'O', 'ş': 'S', 'ü': 'U', '?': '_' }[c]; }); }
  function kelimeUrl(w) { return '/kelime-bulucu/kelime/' + (window.KBSlug ? window.KBSlug(w) : ascii(w)) + '/'; }
  function aracUrl(p, v) { return '/kelime-bulucu/?' + p + '=' + encodeURIComponent(aracKod(v)); }

  function anlam(w) {
    var p = PARCA[w[0]] || w[0];
    if (!/^[a-z][1]?$/.test(p)) return Promise.resolve(null);
    if (!yuklu[p]) {
      yuklu[p] = fetch('/kelime-bulucu/anlam/' + p + '.json?v=2').then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .catch(function () { delete yuklu[p]; return null; });
    }
    return yuklu[p].then(function (d) { return d ? (d[w] || '') : null; });
  }

  // ---------- anlam penceresi (araçta sonuçtaki kelimeye tıklayınca) ----------
  var modal = null, sonOdak = null;
  function pencere() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal'; modal.hidden = true;
    modal.innerHTML = '<div class="mcard" role="dialog" aria-modal="true" aria-labelledby="mTitle">' +
      '<button class="mclose" data-close aria-label="Kapat">✕</button>' +
      '<div class="label">Kelimenin anlamı</div><h2 id="mTitle" class="tiles"></h2>' +
      '<p class="mdef" id="mDef"></p><p class="mmeta" id="mMeta"></p><div class="mlinks" id="mLinks"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-close]')) kapat(); });
    return modal;
  }
  function kapat() { if (modal && !modal.hidden) { modal.hidden = true; if (sonOdak && sonOdak.focus) sonOdak.focus(); } }
  function goster(w) {
    w = kucuk(w).replace(/[^a-zçğıöşü]/g, '');
    if (!w) return;
    var m = pencere(); sonOdak = document.activeElement;
    var t = $('mTitle');
    t.className = 'tiles' + (w.length > 9 ? ' long' : '');
    t.setAttribute('aria-label', buyuk(w));
    t.innerHTML = w.split('').map(function (c) { return '<i aria-hidden="true">' + buyuk(c) + '<small>' + (PUAN[c] || 0) + '</small></i>'; }).join('');
    $('mDef').className = 'mdef'; $('mDef').textContent = 'Yükleniyor…';
    var meta = w.length + ' harf · ' + puan(w) + ' puan';
    $('mMeta').textContent = meta;
    $('mLinks').innerHTML =
      '<a class="ana" href="' + kelimeUrl(w) + '">Kelime sayfası: anlamlar, hece, türetilenler →</a>' +
      '<a href="' + aracUrl('k', w + '*') + '">Bununla başlayanlar</a>' +
      '<a href="' + aracUrl('k', '*' + w) + '">Bununla bitenler</a>' +
      '<a href="' + aracUrl('h', w) + '">Harflerinden türet</a>';
    m.hidden = false;
    m.querySelector('.mclose').focus();
    anlam(w).then(function (d) {
      if (m.hidden || t.getAttribute('aria-label') !== buyuk(w)) return;
      var el = $('mDef');
      if (d) { el.textContent = d.charAt(0).toLocaleUpperCase('tr') + d.slice(1); $('mMeta').textContent = meta + ' · Kaynak: Vikisözlük'; }
      else if (d === '') { el.className = 'mdef none'; el.textContent = 'Bu kelimenin anlamı sözlüğümüzde henüz yok.'; }
      else { el.className = 'mdef none'; el.textContent = 'Anlam yüklenemedi; internet bağlantını kontrol et.'; }
    });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') kapat(); });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) return; // bağlantılı kelimeler sayfaya gider
    var li = e.target.closest && e.target.closest('.ws li[data-k]');
    if (li) goster(li.getAttribute('data-k'));
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.ws li[data-k]')) { e.preventDefault(); goster(e.target.getAttribute('data-k')); }
  });

  // ---------- sayfa ----------
  var yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();
  var tb = $('themeBtn');
  if (tb) tb.onclick = function () {
    var c = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = c === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); try { localStorage.setItem('theme', n); } catch (e) {}
  };
  // Liste/kelime sayfasındaki küçük form: harfleri araca taşır.
  var mf = $('miniForm');
  if (mf) mf.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = kucuk($('miniInp').value).replace(/[?.]/g, '*').replace(/[^a-zçğıöşü*]/g, '');
    if (v) location.href = aracUrl('h', v);
  });

  // ---------- liste sayfası: puana göre sıralama (HTML'i liste.php üretir) ----------
  (function () {
    var bolum = document.querySelector('section[data-srv]');
    if (!bolum || !bolum.querySelector('.sortb button')) return;
    var gruplar = bolum.querySelectorAll('.grp'), lens = bolum.querySelector('.lens'), puanGrp = null;
    function sirala(s) {
      [].forEach.call(bolum.querySelectorAll('.sortb button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-s') === s); });
      if (s === 'puan' && !puanGrp) {
        var lis = [], gor = {};
        [].forEach.call(gruplar, function (g) { [].forEach.call(g.querySelectorAll('li'), function (li) { var h = li.querySelector('a').getAttribute('href'); if (!gor[h]) { gor[h] = 1; lis.push(li); } }); });
        var p = function (li) { var s2 = li.querySelector('sub.pt'); return s2 ? +s2.textContent : 0; };
        lis.sort(function (a, b) { return p(b) - p(a) || b.textContent.length - a.textContent.length; });
        puanGrp = document.createElement('div');
        puanGrp.className = 'grp puanl';
        puanGrp.innerHTML = '<h3>Puana göre, yüksekten düşüğe <small>' + lis.length.toLocaleString('tr-TR') + '</small></h3><ul class="ws"></ul>';
        var ul = puanGrp.querySelector('ul');
        lis.forEach(function (li) { ul.appendChild(li.cloneNode(true)); });
        gruplar[gruplar.length - 1].insertAdjacentElement('afterend', puanGrp);
      }
      [].forEach.call(gruplar, function (g) { g.hidden = s === 'puan'; });
      if (lens) lens.hidden = s === 'puan';
      if (puanGrp) puanGrp.hidden = s !== 'puan';
      try { localStorage.setItem('kb_sira', s); } catch (e) {}
    }
    bolum.addEventListener('click', function (e) { var b = e.target.closest('.sortb button'); if (b) sirala(b.getAttribute('data-s')); });
    var kayit = null; try { kayit = localStorage.getItem('kb_sira'); } catch (e) {}
    if (kayit === 'puan') sirala('puan');
  })();

  window.KBOrtak = { goster: goster, kapat: kapat, anlam: anlam, buyuk: buyuk, esc: esc, puan: puan, PUAN: PUAN, rozet: rozet, kat: kat,
    kelimeUrl: kelimeUrl, aracUrl: aracUrl };
})();
