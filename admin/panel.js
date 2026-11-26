/* okutan.org yönetim paneli — küçük davranışlar: "/" ile arama, onay isteyen formlar, canlı ziyaretçi sayacı. */
(function () {
  // Yöneticinin kendi ziyaretleri sayılmasın (assets/oyunlar.js bu bayrağa bakar).
  try { localStorage.setItem('ok_admin_optout', '1'); } catch (e) {}

  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    var q = document.getElementById('q');
    if (q) { e.preventDefault(); q.focus(); q.select(); }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target, m = f && f.getAttribute('data-confirm');
    if (m && !window.confirm(m)) e.preventDefault();
  }, true);

  // Çıkışta ve giriş ekranında gömülü oyun yönetimlerinin jetonlarını da sil.
  function clearGameTokens() { try { sessionStorage.removeItem('bp_admin'); sessionStorage.removeItem('sh_admin'); } catch (e) {} }
  if (!document.querySelector('.layout')) clearGameTokens();
  var outForm = document.querySelector('form.out');
  if (outForm) outForm.addEventListener('submit', clearGameTokens);

  // Gömülü oyun yönetimi (Balon, Sohbet): jetonu yaz, sonra yükle; yüksekliği içeriğe uydur.
  var fr = document.querySelector('iframe.embed[data-src]');
  if (fr) {
    try { sessionStorage.setItem(fr.getAttribute('data-key'), fr.getAttribute('data-tok')); } catch (e) {}
    var fit = function () {
      try { var d = fr.contentDocument; if (d && d.documentElement) fr.style.height = Math.max(400, Math.ceil(d.body.getBoundingClientRect().height) + 16) + 'px'; } catch (e) {}
    };
    fr.addEventListener('load', function () {
      fit();
      try { if (window.ResizeObserver) new ResizeObserver(fit).observe(fr.contentDocument.body); else setInterval(fit, 1000); } catch (e) {}
    });
    fr.src = fr.getAttribute('data-src');
  }

  var live = document.getElementById('live');
  if (!live) return;
  var nEl = live.querySelector('[data-n]'), dEl = live.querySelector('[data-detail]'), timer = null;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() {
    fetch(live.getAttribute('data-src'), { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) { nEl.textContent = '?'; if (dEl) dEl.textContent = (j && j.error) || 'okunamadı'; return; }
        nEl.textContent = j.n;
        if (!dEl) return;
        var devs = j.devs.map(function (d) { return esc(d.dev) + ' ' + d.n; }).join(' · ');
        var pages = j.pages.map(function (p) { return '<li><span class="path">' + esc(p.path) + '</span> <b>' + p.n + '</b></li>'; }).join('');
        dEl.innerHTML = (devs ? '<div class="small">' + devs + '</div>' : '') + (pages ? '<ul class="hits small">' + pages + '</ul>' : '');
      })
      .catch(function () { nEl.textContent = '?'; });
  }
  function start() { clearInterval(timer); load(); timer = setInterval(function () { if (!document.hidden) load(); }, 20000); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  start();
})();
