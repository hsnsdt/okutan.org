/* Google Tag Manager — tüm sayfalarda bu dosya üzerinden yüklenir (kimlik tek yerde). */
(function () {
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
