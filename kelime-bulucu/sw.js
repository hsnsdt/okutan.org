/* Kelime Bulucu — service worker (araç internetsiz de çalışır)
   - Yalnızca araç sayfası (/kelime-bulucu/) önbelleğe alınır; liste sayfalarına karışılmaz.
   - Sayfa: önce ağ, yoksa önbellek · Statik dosyalar ve anlam parçaları: önbellekten, arkada tazele.
   bulucu.js / motor.js / ortak.js / kb.css / sozluk.txt sürümü değişince CACHE ve CORE'u da güncelle. */
var CACHE = 'kelime-bulucu-v1';
var CORE = ['./', 'bulucu.js?v=1', 'motor.js?v=1', 'ortak.js?v=1', 'kb.css?v=1', 'sozluk.txt?v=1', 'manifest.json', 'icon-192.png', '/assets/fonts/fonts.css',
  '/assets/fonts/Nunito-latin.woff2', '/assets/fonts/Nunito-latin-ext.woff2',
  '/assets/logo.svg', '/assets/logo-dark.svg'];
var KOK = '/kelime-bulucu/';
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('kelime-bulucu-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf(KOK + 'liste/') === 0) return; // liste sayfaları her zaman ağdan
  if (req.mode === 'navigate') {
    if (url.pathname !== KOK && url.pathname !== KOK + 'index.html') return;
    e.respondWith(fetch(req).then(function (res) { var c = res.clone(); caches.open(CACHE).then(function (x) { x.put('./', c); }); return res; })
      .catch(function () { return caches.match('./'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) { if (res && res.ok) { var c = res.clone(); caches.open(CACHE).then(function (x) { x.put(req, c); }); } return res; }).catch(function () { return hit; });
    return hit || net;
  }));
});
