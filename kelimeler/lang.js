/* Kelimeler — TR/EN dil anahtarı.
   Sayfalar iki blok içerir: <div data-lang-block="tr"> ve "en".
   Görünürlüğü CSS yapar; burada sadece <html data-lang> ayarlanır.
   Tercih localStorage'da saklanır, sayfalar arası korunur.
   ?lang=en / #en ile doğrudan link verilebilir (Apple/Play incelemesi
   ya da yabancı kullanıcıya paylaşım için). */
(function () {
  var KEY = 'kelimeler_lang';

  function pick() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'tr' || q === 'en') return q;
    if (location.hash === '#en') return 'en';
    if (location.hash === '#tr') return 'tr';
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'tr' || saved === 'en') return saved;
    } catch (e) { /* gizli sekmede localStorage kapalı olabilir */ }
    var nav = (navigator.language || 'tr').toLowerCase();
    return nav.indexOf('tr') === 0 ? 'tr' : 'en';
  }

  function apply(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('lang', lang);
    var buttons = document.querySelectorAll('.lang-switch button');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    }
    var t = document.querySelector('title[data-title-' + lang + ']');
    if (t) document.title = t.getAttribute('data-title-' + lang);
  }

  // Blokların yanıp sönmesini önlemek için <head>'de erken çalışır
  apply(pick());

  document.addEventListener('DOMContentLoaded', function () {
    apply(document.documentElement.getAttribute('data-lang') || pick());
    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.lang-switch button') : null;
      if (!btn) return;
      var lang = btn.getAttribute('data-lang');
      try { localStorage.setItem(KEY, lang); } catch (err) { /* yok say */ }
      apply(lang);
    });
  });
})();
