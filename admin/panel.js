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
