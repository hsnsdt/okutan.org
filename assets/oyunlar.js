/* Bot denetimi + birinci taraf sayaç (çerezsiz; sunucu yalnızca günlük toplam tutar, bkz. /stats.php ve /admin/).
   Bot, otomasyon ya da şüpheli ekran görülürse ne sayaç ne de Google etiketi çalışır. Yönetim panelini açan
   tarayıcı (localStorage ok_admin_optout) sayılmaz. Siteye özel olay: okSay('ad') (a-z, 0-9, _). */
(function () {
  var n = navigator, s = window.screen || {}, ua = n.userAgent || '';
  window.okBot = !!(n.webdriver || /bot|crawl|spider|slurp|headless|phantom|lighthouse|pagespeed|selenium|puppeteer|playwright|electron/i.test(ua) ||
    window._phantom || window.callPhantom || window.__nightmare || s.width <= 1 || s.height <= 1 || (s.width === 800 && s.height === 600) ||
    (n.languages && n.languages.length === 0));
  var off = false; try { off = localStorage.getItem('ok_admin_optout') === '1'; } catch (e) {}
  window.okSay = function () {};
  if (window.okBot || off || !n.sendBeacon || !window.JSON) return;
  var dev = /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1) ? 'tablet' :
    /Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua) ? 'mobile' : 'desktop';
  var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  var lt = (n.language || '').replace('_', '-');
  // Ülke tahmini için yalnızca saat dilimi ve dil etiketi gider (IP'den konum sorgulanmaz).
  function send(o) { o.p = location.pathname; o.d = dev; o.z = tz; o.lt = lt; try { n.sendBeacon('/stats.php', JSON.stringify(o)); } catch (e) {} }
  window.okSay = function (e) { if (/^[a-z0-9_]{1,30}$/.test(e)) send({ t: 'ev', e: e }); };
  var ref = '', from = ''; try { var r = document.referrer ? new URL(document.referrer) : null; if (r && r.hostname !== location.hostname) ref = r.hostname; else if (r) from = r.pathname; } catch (e) {}
  var q = {}; try { q = new URLSearchParams(location.search); } catch (e) {}
  var pv = { t: 'pv', r: ref, l: (n.language || '').slice(0, 2).toLowerCase(), s: (q.get && q.get('utm_source') || '').toLowerCase().slice(0, 40) };
  if (q.get && q.get('masa')) pv.e = 'masa_davet';
  if (from && from !== location.pathname) pv.f = from.slice(0, 120); // site içi geçiş (yolculuk)
  send(pv);

  // Hız (Core Web Vitals, gerçek ziyaretçi): LCP, CLS ve INP (en yavaş etkileşim, yaklaşık). Sayfa gizlenince bir kez gider.
  var wv = { lcp: 0, cls: 0, inp: 0 }, wvSent = false;
  if (window.PerformanceObserver) {
    try { new PerformanceObserver(function (l) { var e = l.getEntries(); if (e.length) wv.lcp = Math.round(e[e.length - 1].startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
    try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) wv.cls += e.value; }); }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
    try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (e.interactionId && e.duration > wv.inp) wv.inp = e.duration; }); }).observe({ type: 'event', buffered: true, durationThreshold: 40 }); } catch (e) {}
  }
  function sendWv() { if (wvSent || (!wv.lcp && !wv.inp)) return; wvSent = true; send({ t: 'wv', lcp: wv.lcp, cls: Math.round(wv.cls * 1000) / 1000, inp: Math.round(wv.inp) }); }
  document.addEventListener('visibilitychange', function () { if (document.hidden) sendWv(); });
  window.addEventListener('pagehide', sendWv);

  // JavaScript hataları: yalnızca kendi dosyalarımız, sayfa başına en çok 5, aynısı bir kez; ağ kopmaları sayılmaz.
  var errN = 0, errSeen = {};
  function jsErr(msg, src, line, col) {
    msg = String(msg || '').slice(0, 220);
    if (errN >= 5 || !msg || /^Script error\.?$/i.test(msg) || /Failed to fetch|NetworkError|Load failed|network connection was lost|AbortError/i.test(msg)) return;
    src = String(src || '');
    if (src && src.indexOf(location.origin) !== 0) return;
    var k = msg + '|' + src + '|' + line; if (errSeen[k]) return; errSeen[k] = 1; errN++;
    send({ t: 'err', m: msg, s: (src.replace(location.origin, '').split('?')[0] || location.pathname).slice(0, 120), ln: line | 0, c: col | 0 });
  }
  window.addEventListener('error', function (e) { if (e && e.message) jsErr(e.message, e.filename, e.lineno, e.colno); });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason, st = r && r.stack ? String(r.stack) : '', m = st.match(/(https?:\/\/[^\s)]+?):(\d+):(\d+)/);
    jsErr('Promise: ' + (r && r.message ? r.message : String(r)), m ? m[1] : location.origin + location.pathname, m ? +m[2] : 0, m ? +m[3] : 0);
  });
  // Oyun ve sohbet olayları: sayfalara dokunmadan, oyunların kendi API çağrılarından yakalanır.
  //   basla_<oyun> (yeni oyun), bitir_<oyun> (skor/sonuç gönderildi), masa_<oyun> (online masa açtı), katil_<oyun> (masaya katıldı)
  //   sohbet_giris (sohbete bağlandı), sohbet_yazdi (ilk mesaj) · sunucusuz oyunlarda bitiş localStorage kaydından.
  var oyun = (location.pathname.split('/')[1] || '').replace(/[^a-z0-9]/g, '');
  if (oyun === '101okey') oyun = 'okey101';
  var bir = {};
  function olay(e, tekSefer) { if (tekSefer) { if (bir[e]) return; bir[e] = 1; } window.okSay(e); }
  if (oyun && window.fetch) {
    var of = window.fetch, AD = { start: 'basla', submit: 'bitir', t_create: 'masa', t_join: 'katil' };
    window.fetch = function (u) {
      try {
        var m = /(?:^|\/)api\/(?:index\.php)?\?a=([a-z_]+)/.exec(typeof u === 'string' ? u : (u && u.url) || '');
        if (m) {
          if (oyun === 'sohbet') { if (m[1] === 'poll') olay('sohbet_giris', 1); else if (m[1] === 'say') olay('sohbet_yazdi', 1); }
          else if (AD[m[1]]) olay(AD[m[1]] + '_' + oyun);
        }
      } catch (e) {}
      return of.apply(this, arguments);
    };
  }
  if ((oyun === 'sudoku' || oyun === 'gizlikelime') && window.Storage) {
    var ss = Storage.prototype.setItem, onek = oyun === 'sudoku' ? 'sd_daily_' : 'gk_daily_';
    Storage.prototype.setItem = function (k) {
      try { if (this === window.localStorage && String(k).indexOf(onek) === 0 && this.getItem(k) === null) olay('bitir_' + oyun); } catch (e) {}
      return ss.apply(this, arguments);
    };
  }
  // Sayfa açık kaldıkça dakikada bir "buradayım" ("şu an sitede" = son 5 dk): arka plandaki sekme de sayılır
  // (sohbette, masada bekleyen); en çok 8 saat. 1 ve 5 dk etkin ziyaret olayı yalnızca sekme öndeyken sayılır.
  var k = 0, vis = 0, t = setInterval(function () {
    k++;
    var o = { t: 'hb' };
    if (!document.hidden) { vis++; if (vis === 1) o.e = 'engaged'; else if (vis === 5) o.e = 'engaged5'; }
    send(o);
    if (k >= 480) clearInterval(t);
  }, 60000);
  // Sekme uzun süre arkada kalıp geri gelince (telefonda zamanlayıcı durur) hemen bildir.
  document.addEventListener('visibilitychange', function () { if (!document.hidden && k < 480) send({ t: 'hb' }); });
})();
/* Site duyurusu: yönetim panelinden yazılır (assets/duyuru.json). Sayfanın köşesinde küçük kutu; kapatılınca
   ya da 3 sayfa görüntülemeden sonra o duyuru bir daha gösterilmez. Sol altta, 12 sn sonra kendiliğinden kaybolur. */
(function () {
  if (window.okBot || !window.fetch) return;
  function goster(d) {
    var id = String(d.id || ''), kap = 'ok_duyuru_' + id, say = 0;
    try { if (localStorage.getItem(kap) === 'x') return; say = +(localStorage.getItem(kap) || 0); if (say >= 3) return; localStorage.setItem(kap, String(say + 1)); } catch (e) {}
    var k = document.createElement('div');
    k.setAttribute('role', 'status');
    k.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;max-width:min(380px,calc(100vw - 24px));box-sizing:border-box;' +
      'background:#0e0e0e;color:#f4f4f2;border-left:4px solid #ff5a1f;border-radius:12px;padding:10px 38px 10px 14px;' +
      'font:600 14px/1.45 Nunito,system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)';
    var t = document.createElement('span'); t.textContent = String(d.text || ''); k.appendChild(t);
    if (d.link) { var a = document.createElement('a'); a.href = String(d.link); a.textContent = ' ' + (d.linkText || 'Göz at') + ' →'; a.style.cssText = 'color:#ff8a5c;font-weight:800;text-decoration:none;white-space:nowrap';
      a.addEventListener('click', function () { try { localStorage.setItem(kap, 'x'); } catch (e) {} }); k.appendChild(a); }
    var x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', 'Kapat'); x.textContent = '×';
    x.style.cssText = 'position:absolute;top:4px;right:6px;width:28px;height:28px;border:0;background:none;color:#aaa;font:700 20px/1 system-ui;cursor:pointer';
    x.addEventListener('click', function () { try { localStorage.setItem(kap, 'x'); } catch (e) {} k.remove(); });
    k.appendChild(x);
    document.body.appendChild(k);
    // Oyun düğmelerini (telefonda alt kısım) uzun süre örtmesin: 12 sn sonra kendiliğinden kaybolur (kapatılmış sayılmaz).
    setTimeout(function () { k.style.transition = 'opacity .4s'; k.style.opacity = '0'; setTimeout(function () { k.remove(); }, 450); }, 12000);
  }
  function yukle() {
    fetch('/assets/duyuru.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.active || !d.text) return;
      if (d.until && new Date(d.until + 'T23:59:59') < new Date()) return;
      if (location.pathname.indexOf('/admin/') === 0) return;
      goster(d);
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', yukle); else yukle();
})();
/* Google Tag Manager — tüm sayfalarda bu dosya üzerinden yüklenir (kimlik tek yerde). Botlarda ve yöneticide yüklenmez. */
(function () {
  var off = false; try { off = localStorage.getItem('ok_admin_optout') === '1'; } catch (e) {}
  if (window.okBot || off) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  var g = document.createElement('script'); g.async = true;
  g.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-KRP75675';
  document.head.appendChild(g);
})();
/* Alt bilgideki oyun bağlantıları — tek yerden yönetilir.
   Kullanım: <nav ... data-oyunlar>sabit bağlantılar</nav> + <script src="/assets/oyunlar.js" defer></script>
   Betik listede olmayan oyunları ekler, bulunulan sayfayı atlar; [data-oyunlar-yer] varsa onun önüne koyar.
   Yeni oyun eklenince yalnızca bu listeye bir satır eklenir. */
(function () {
  var OYUNLAR = [
    ['/ates-ve-su/', 'Ateş ve Su'],
    ['/gizli-kelime/', 'Gizli Kelime'],
    ['/sudoku/', 'Sudoku'],
    ['/okey/', 'Okey'],
    ['/batak/', 'Batak'],
    ['/king/', 'King'],
    ['/pisti/', 'Pişti'],
    ['/tavla/', 'Tavla'],
    ['/101-okey/', '101 Okey'],
    ['/balon/', 'Balon Patlat'],
    ['/kelime-bulucu/', 'Kelime Bulucu'],
    ['/kelimeler/', 'Kelimeler'],
    ['/sohbet/', 'Sohbet']
  ];
  function run() {
    var here = location.pathname;
    var navs = document.querySelectorAll('nav[data-oyunlar]');
    for (var n = 0; n < navs.length; n++) {
      var nav = navs[n], have = {}, links = nav.querySelectorAll('a');
      for (var i = 0; i < links.length; i++) have[links[i].pathname] = 1;
      var at = nav.querySelector('[data-oyunlar-yer]');
      for (var k = 0; k < OYUNLAR.length; k++) {
        var o = OYUNLAR[k];
        if (have[o[0]] || here.indexOf(o[0]) === 0) continue;
        var a = document.createElement('a'); a.href = o[0]; a.textContent = o[1];
        nav.insertBefore(a, at);
      }
    }
  }
  // Canlı Sohbet sayacı: sayfada [data-sohbet-sayi] varsa doldurur, kutusunu ([data-sohbet-kutu]) açar.
  // Yalnızca bu öğesi olan sayfalar istek atar; sunucu 30 sn önbellekte tutar.
  function sohbetSayi() {
    var els = document.querySelectorAll('[data-sohbet-sayi]');
    if (!els.length || !window.fetch) return;
    fetch('/sohbet/api/?a=count').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return;
      var en = (document.documentElement.lang || '').slice(0, 2) === 'en', n = j.online | 0;
      for (var i = 0; i < els.length; i++) {
        els[i].textContent = n ? (en ? n + (n === 1 ? ' person' : ' people') + ' chatting now' : n + ' kişi şu an sohbette') : (en ? 'Be the first in the chat' : 'Sohbete ilk sen gel');
        var k = els[i].closest('[data-sohbet-kutu]'); if (k) k.hidden = false;
      }
    }).catch(function () {});
  }
  function basla() { run(); sohbetSayi(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', basla); else basla();
})();
