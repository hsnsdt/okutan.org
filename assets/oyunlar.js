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
    ['/okey/', 'Okey'],
    ['/batak/', 'Batak'],
    ['/king/', 'King'],
    ['/pisti/', 'Pişti'],
    ['/tavla/', 'Tavla'],
    ['/101-okey/', '101 Okey'],
    ['/balon/', 'Balon Patlat'],
    ['/kelime-bulucu/', 'Kelime Bulucu'],
    ['/kelimeler/', 'Kelimeler']
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
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
