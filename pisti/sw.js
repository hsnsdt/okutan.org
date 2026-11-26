/* Pişti — service worker (botlara karşı oyun internetsiz de çalışır)
   - Sayfa: önce ağ, yoksa önbellek · Statik dosyalar: önbellekten, arkada tazele · API önbelleğe alınmaz
   oyun.js / motor.js sürümü değişince CACHE ve CORE'u da güncelle. */
var CACHE = 'pisti-v4';
var CORE = ['./', 'oyun.js?v=4', '/assets/okey-sohbet.js?v=4', 'motor.js?v=1', 'manifest.json', 'icon-192.png', '/assets/fonts/fonts.css',
  '/assets/fonts/Nunito-latin.woff2', '/assets/fonts/Nunito-latin-ext.woff2', '/assets/logo.svg', '/assets/logo-dark.svg', '/favicon.svg', '/assets/kart-deste.webp'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  // Ortak site betikleri (sayaç, alt bilgi, masa sohbeti) önbellekten verilmez: değişiklik herkese hemen ulaşsın (.htaccess: no-cache).
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.indexOf('/pisti/api/') === 0 || url.pathname === '/assets/oyunlar.js' || url.pathname === '/assets/okey-sohbet.js') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) { var c = res.clone(); caches.open(CACHE).then(function (x) { x.put('./', c); }); return res; })
      .catch(function () { return caches.match('./'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) { if (res && res.ok) { var c = res.clone(); caches.open(CACHE).then(function (x) { x.put(req, c); }); } return res; }).catch(function () { return hit; });
    return hit || net;
  }));
});
