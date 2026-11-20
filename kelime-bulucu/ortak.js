/* Kelime Bulucu — araç ve liste sayfalarında ortak: tema, anlam penceresi, kelimeye tıklama, küçük arama formu.
   Anlamlar /kelime-bulucu/anlam/<ilk harf>.json parçalarından gerektikçe yüklenir (Vikisözlük, CC BY-SA). */
(function () {
  'use strict';
  var root = document.documentElement;
  function $(id) { return document.getElementById(id); }
  var PARCA = { 'ç': 'c1', 'ğ': 'g1', 'ı': 'i1', 'ö': 'o1', 'ş': 's1', 'ü': 'u1' };
  var yuklu = {};
  function buyuk(s) { return String(s).replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase(); }
  function kucuk(s) { return String(s).replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function anlam(w) {
    var p = PARCA[w[0]] || w[0];
    if (!/^[a-z][1]?$/.test(p)) return Promise.resolve(null);
    if (!yuklu[p]) {
      yuklu[p] = fetch('/kelime-bulucu/anlam/' + p + '.json?v=1').then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .catch(function () { delete yuklu[p]; return null; });
    }
    return yuklu[p].then(function (d) { return d ? (d[w] || '') : null; });
  }

  // ---------- anlam penceresi ----------
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
    t.innerHTML = buyuk(w).split('').map(function (c) { return '<i aria-hidden="true">' + c + '</i>'; }).join('');
    $('mDef').className = 'mdef'; $('mDef').textContent = 'Yükleniyor…';
    $('mMeta').textContent = w.length + ' harf';
    var q = encodeURIComponent;
    $('mLinks').innerHTML =
      '<a href="/kelime-bulucu/?k=' + q(w) + '*">Bununla başlayanlar</a>' +
      '<a href="/kelime-bulucu/?k=*' + q(w) + '">Bununla bitenler</a>' +
      '<a href="/kelime-bulucu/?h=' + q(w) + '">Harflerinden türet</a>' +
      '<a href="https://sozluk.gov.tr/?kelime=' + q(w) + '" target="_blank" rel="noopener">TDK sözlükte ↗</a>';
    m.hidden = false;
    m.querySelector('.mclose').focus();
    anlam(w).then(function (d) {
      if (m.hidden || t.getAttribute('aria-label') !== buyuk(w)) return;
      var el = $('mDef');
      if (d) { el.textContent = d.charAt(0).toLocaleUpperCase('tr') + d.slice(1); $('mMeta').textContent = w.length + ' harf · Kaynak: Vikisözlük'; }
      else if (d === '') { el.className = 'mdef none'; el.textContent = 'Bu kelimenin anlamı sözlüğümüzde henüz yok. TDK sözlükte bakabilirsin.'; }
      else { el.className = 'mdef none'; el.textContent = 'Anlam yüklenemedi; internet bağlantını kontrol et.'; }
    });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') kapat(); });
  // Kelime listelerinde bir kelimeye tıklayınca anlamı açılır.
  document.addEventListener('click', function (e) {
    var li = e.target.closest && e.target.closest('.ws li');
    if (li) goster(li.getAttribute('data-k') || li.textContent);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.ws li')) { e.preventDefault(); goster(e.target.getAttribute('data-k') || e.target.textContent); }
  });

  // ---------- sayfa ----------
  var yr = $('yr'); if (yr) yr.textContent = new Date().getFullYear();
  var tb = $('themeBtn');
  if (tb) tb.onclick = function () {
    var c = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = c === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); try { localStorage.setItem('theme', n); } catch (e) {}
  };
  // Liste sayfasındaki küçük form: harfleri araca taşır.
  var mf = $('miniForm');
  if (mf) mf.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = kucuk($('miniInp').value).replace(/[?.]/g, '*').replace(/[^a-zçğıöşü*]/g, '');
    if (v) location.href = '/kelime-bulucu/?h=' + encodeURIComponent(v);
  });

  window.KBOrtak = { goster: goster, kapat: kapat, anlam: anlam, buyuk: buyuk, esc: esc };
})();
