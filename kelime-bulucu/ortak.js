/* Kelime Bulucu — araç ve liste sayfalarında ortak: tema, anlam penceresi, kelimeye tıklama, küçük arama formu.
   Anlamlar /kelime-bulucu/anlam/<ilk harf>.json parçalarından gerektikçe yüklenir (Vikisözlük, CC BY-SA).
   Liste sayfaları statik üretilir ve bu dosyayı yükler: listelere sonradan eklenen özellikler (puan, sıralama)
   buradan gelir, böylece 2.000+ sayfayı yeniden üretip yüklemek gerekmez. */
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
  var tr = (function () { try { return new Intl.Collator('tr').compare; } catch (e) { return function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }; } })();
  var LEJANT = '<span class="pleg">Puan:' + rozet(1).replace('>1<', '>1–6<') + rozet(7).replace('>7<', '>7–11<') + rozet(12).replace('>12<', '>12–19<') + rozet(20).replace('>20<', '>20+<') + '</span>';
  function puanSira(a, b) { return b.p - a.p || b.k.length - a.k.length || tr(a.k, b.k); }

  // Puan rozeti ve sıralama düğmeleri için stiller (kb.css önbellekte eski kalsa da çalışsın diye burada).
  (function () {
    var st = document.createElement('style');
    st.textContent =
      '/* puan rozeti: kelimenin yanında minik Scrabble taşı; renk puana göre (t1 1–6, t2 7–11, t3 12–19, t4 20+) */sub.pt{display:inline-flex;align-items:center;justify-content:center;min-width:23px;height:22px;margin:-4px -6px -4px 9px;padding:0 5px;border-radius:7px;font:700 12px/1 var(--round);font-variant-numeric:tabular-nums;letter-spacing:0;vertical-align:middle;color:#fff;background:linear-gradient(180deg,#9aa6b4,#7c8796);box-shadow:inset 0 -2px 0 rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.35),0 1px 2px rgba(0,0,0,.15);transition:transform .15s}sub.pt.t2{background:linear-gradient(180deg,#22c08f,#0f9d76)}sub.pt.t3{background:linear-gradient(180deg,#ffa449,#f2700f)}sub.pt.t4{color:#4a3300;background:linear-gradient(180deg,#ffe07a,#f2b51d);box-shadow:inset 0 -2px 0 rgba(120,80,0,.3),inset 0 1px 0 rgba(255,255,255,.6),0 0 0 1px rgba(200,140,0,.35),0 2px 6px -2px rgba(200,140,0,.6)}.ws li:hover sub.pt,.wl a:hover sub.pt{transform:scale(1.1) rotate(-4deg)}.ws li,.wl a,.ws li a{display:inline-flex;align-items:center}.tops .ws li{font-size:16.5px}.tops sub.pt{min-width:27px;height:25px;font-size:13.5px}.pleg{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap;font:600 12.5px var(--round);color:var(--muted)}.pleg sub.pt{margin:0 2px 0 6px;height:18px;min-width:34px;font-size:10.5px}' +
      '.sortb{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0 2px;font:600 13px var(--round);color:var(--muted)}' +
      '.sortb button{height:32px;padding:0 13px;border-radius:999px;border:1px solid var(--line);background:var(--block);font:600 13px var(--round);cursor:pointer}' +
      '.sortb button:hover{border-color:var(--muted)}.sortb button[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--block)}' +
      '.tops{margin:14px 0 4px;padding:14px 16px 16px;border-radius:14px;background:var(--g2);border:1px solid color-mix(in srgb,var(--g) 30%,transparent)}' +
      '.tops h3{font:700 16px var(--round);margin-bottom:10px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px}' +
      '.tops h3 small{font:700 12.5px var(--round);color:var(--muted)}' +
      '.tops .ws li{background:var(--block)}' +
      '.tops ol{list-style:none}' +
      '.puanl{margin-top:4px}';
    document.head.appendChild(st);
  })();
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
    var meta = w.length + ' harf · ' + puan(w) + ' puan';
    $('mMeta').textContent = meta;
    var q = encodeURIComponent;
    $('mLinks').innerHTML =
      '<a href="/kelime-bulucu/kelime/' + w + '/"><b>Kelime sayfası →</b></a>' +
      '<a href="/kelime-bulucu/?k=' + q(w) + '*">Bununla başlayanlar</a>' +
      '<a href="/kelime-bulucu/?k=*' + q(w) + '">Bununla bitenler</a>' +
      '<a href="/kelime-bulucu/?h=' + q(w) + '">Harflerinden türet</a>' +
      '<a href="https://sozluk.gov.tr/?kelime=' + q(w) + '" target="_blank" rel="noopener">TDK sözlükte ↗</a>';
    m.hidden = false;
    m.querySelector('.mclose').focus();
    anlam(w).then(function (d) {
      if (m.hidden || t.getAttribute('aria-label') !== buyuk(w)) return;
      var el = $('mDef');
      if (d) { el.textContent = d.charAt(0).toLocaleUpperCase('tr') + d.slice(1); $('mMeta').textContent = meta + ' · Kaynak: Vikisözlük'; }
      else if (d === '') { el.className = 'mdef none'; el.textContent = 'Bu kelimenin anlamı sözlüğümüzde henüz yok. TDK sözlükte bakabilirsin.'; }
      else { el.className = 'mdef none'; el.textContent = 'Anlam yüklenemedi; internet bağlantını kontrol et.'; }
    });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') kapat(); });
  // Kelime listelerinde bir kelimeye tıklayınca anlamı açılır.
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) return; // bağlantılı kelimeler sayfaya gider
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

  // ---------- liste sayfaları: puan rozeti, en yüksek puanlılar, puana göre sıralama ----------
  function listeSayfasi() {
    var bolum = $('hListe') && $('hListe').closest('section');
    if (!bolum) return;
    var lis = bolum.querySelectorAll('.grp .ws li'), kelimeler = [], gor = {};
    for (var i = 0; i < lis.length; i++) {
      var li = lis[i], w = li.getAttribute('data-k') || li.textContent;
      li.setAttribute('data-k', w);
      var p = puan(w);
      li.innerHTML = '<a href="/kelime-bulucu/kelime/' + w + '/">' + li.innerHTML + rozet(p) + '</a>';
      if (!gor[w]) { gor[w] = 1; kelimeler.push({ k: w, p: p, h: li.innerHTML }); }
    }
    if (kelimeler.length < 2) return;
    var sirali = kelimeler.slice().sort(puanSira);
    var ad = ($('pageTitle') ? $('pageTitle').textContent : '').replace(/ Kelimeler$/, '').toLocaleLowerCase('tr');
    var en = sirali.slice(0, 12);
    var bas = bolum.querySelector('.res-h');
    bas.insertAdjacentHTML('afterend',
      '<div class="tops"><h3>En yüksek puanlı ' + esc(ad) + ' kelimeler <small>Scrabble taş puanlarıyla · en yüksek ' + buyuk(sirali[0].k) + ', ' + sirali[0].p + ' puan</small></h3>' +
      '<ul class="ws">' + en.map(function (x) { return '<li data-k="' + x.k + '">' + x.h + '</li>'; }).join('') + '</ul></div>' +
      '<div class="sortb" role="group" aria-label="Sıralama">Sırala: <button type="button" data-s="uz" aria-pressed="true">Harf sayısına göre</button><button type="button" data-s="puan" aria-pressed="false">Puana göre</button><span class="sp"></span>' + LEJANT + '</div>');
    var gruplar = bolum.querySelectorAll('.grp'), lens = bolum.querySelector('.lens'), puanGrp = null;
    function sirala(s) {
      [].forEach.call(bolum.querySelectorAll('.sortb button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-s') === s); });
      if (s === 'puan' && !puanGrp) {
        puanGrp = document.createElement('div');
        puanGrp.className = 'grp puanl';
        puanGrp.innerHTML = '<h3>Puana göre, yüksekten düşüğe <small>' + sirali.length.toLocaleString('tr-TR') + '</small></h3><ul class="ws">' +
          sirali.map(function (x) { return '<li data-k="' + x.k + '">' + x.h + '</li>'; }).join('') + '</ul>';
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
  }
  listeSayfasi();

  window.KBOrtak = { goster: goster, kapat: kapat, anlam: anlam, buyuk: buyuk, esc: esc, puan: puan, PUAN: PUAN, rozet: rozet };
})();
