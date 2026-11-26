/* Gizli Kelime — service worker (oyun internetsiz de çalışır)
   - Sayfa: önce ağ, yoksa önbellek · Statik dosyalar: önbellekten, arkada tazele
   oyun.js / motor.js / sozluk.js sürümü değişince CACHE ve CORE'u da güncelle. */
var CACHE = 'gizli-kelime-v3';
var CORE = ['./', 'oyun.js?v=1', 'motor.js?v=1', 'sozluk.js?v=1', 'manifest.json', 'icon-192.png', '/assets/fonts/fonts.css',
  '/assets/fonts/InterTight-latin.woff2', '/assets/fonts/InterTight-latin-ext.woff2', '/assets/fonts/JetBrainsMono-latin.woff2', '/assets/fonts/Nunito-latin.woff2', '/assets/fonts/Nunito-latin-ext.woff2',
  '/assets/logo.svg', '/assets/logo-dark.svg'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('gizli-kelime-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  // Ortak site betikleri (sayaç, alt bilgi, masa sohbeti) önbellekten verilmez: değişiklik herkese hemen ulaşsın (.htaccess: no-cache).
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/assets/oyunlar.js' || url.pathname === '/assets/okey-sohbet.js') return;
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
