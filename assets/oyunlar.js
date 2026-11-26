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
  function send(o) { o.p = location.pathname; o.d = dev; try { n.sendBeacon('/stats.php', JSON.stringify(o)); } catch (e) {} }
  window.okSay = function (e) { if (/^[a-z0-9_]{1,30}$/.test(e)) send({ t: 'ev', e: e }); };
  var ref = ''; try { var r = document.referrer ? new URL(document.referrer) : null; if (r && r.hostname !== location.hostname) ref = r.hostname; } catch (e) {}
  var q = {}; try { q = new URLSearchParams(location.search); } catch (e) {}
  var pv = { t: 'pv', r: ref, l: (n.language || '').slice(0, 2).toLowerCase(), s: (q.get && q.get('utm_source') || '').toLowerCase().slice(0, 40) };
  if (q.get && q.get('masa')) pv.e = 'masa_davet';
  send(pv);
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
