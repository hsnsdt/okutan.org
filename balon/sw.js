/* Balon Patlat — service worker (çevrimdışı oynama)
   - Sayfa: önce ağ, yoksa önbellek
   - Statik dosyalar: önbellekten ver, arkada tazele
   - API (/balon/api/) hiçbir zaman önbelleğe alınmaz */
var CACHE = 'balon-v3';
var CORE = [
  './',
  'oyun.js?v=11',
  'manifest.json',
  'icon-192.png',
  '/assets/fonts/fonts.css',
  '/assets/fonts/InterTight-latin.woff2',
  '/assets/fonts/InterTight-latin-ext.woff2',
  '/assets/fonts/JetBrainsMono-latin.woff2',
  '/assets/logo.svg',
  '/assets/logo-dark.svg',
  '/favicon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.indexOf('/balon/api/') === 0) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put('./', copy); });
      return res;
    }).catch(function () { return caches.match('./'); }));
    return;
  }

  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
