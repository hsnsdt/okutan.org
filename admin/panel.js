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

  // Telefonda alt menü: açık ekranı görünür alana kaydır.
  var cur = document.querySelector('.side a[aria-current]');
  if (cur && window.matchMedia('(max-width: 860px)').matches) { try { cur.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }

  // Açık / koyu tema (sitenin "theme" ayarıyla ortak; gömülü oyun yönetimine de uygulanır).
  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var root = document.documentElement, cur = root.getAttribute('data-theme');
    if (!cur) cur = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    var f = document.querySelector('iframe.embed');
    try { if (f && f.contentDocument) f.contentDocument.documentElement.setAttribute('data-theme', next); } catch (e) {}
  });

  // Grafik çubuklarında değer ipucu (data-t; dokunmatikte de çalışır).
  var tip = null;
  function showTip(g, x, y) {
    var t = g.getAttribute('data-t'); if (!t) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 'ctip'; document.body.appendChild(tip); }
    tip.textContent = t; tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.hidden = false;
  }
  function hideTip() { if (tip) tip.hidden = true; }
  document.addEventListener('pointermove', function (e) {
    var g = e.target.closest && e.target.closest('svg.chart g[data-t]');
    if (g) showTip(g, e.clientX, e.clientY); else hideTip();
  });
  document.addEventListener('scroll', hideTip, true);

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

  // "Şu an sitede": [data-live-n] sayıyı, [data-live-detail] sayfa ve cihaz dökümünü gösterir (20 sn'de bir).
  var nEls = document.querySelectorAll('[data-live-n]'), dEls = document.querySelectorAll('[data-live-detail]'), timer = null;
  if (!nEls.length && !dEls.length) return;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setN(t) { for (var i = 0; i < nEls.length; i++) nEls[i].textContent = t; }
  function setD(h) { for (var i = 0; i < dEls.length; i++) dEls[i].innerHTML = h; }
  function load() {
    fetch('./?ajax=online', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) { setN('?'); setD(esc((j && j.error) || 'okunamadı')); return; }
        setN(j.n);
        var devs = j.devs.map(function (d) { return esc(d.dev) + ' ' + d.n; }).join(' · ');
        var pages = j.pages.map(function (p) { return '<li><span class="path">' + esc(p.path) + '</span> <b>' + p.n + '</b></li>'; }).join('');
        setD((devs ? '<div class="small">' + devs + '</div>' : '') + (pages ? '<ul class="hits small">' + pages + '</ul>' : (j.n ? '' : '<p class="muted small">Şu an kimse yok.</p>')));
      })
      .catch(function () { setN('?'); });
  }
  function start() { clearInterval(timer); load(); timer = setInterval(function () { if (!document.hidden) load(); }, 20000); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  start();
})();
