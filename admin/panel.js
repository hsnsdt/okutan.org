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

  // Masaüstü bildirimi izni (Bildirimler ekranı)
  var nb = document.getElementById('notifBtn'), ns = document.getElementById('notifState');
  function nState() { if (!ns) return; ns.textContent = !window.Notification ? 'Bu tarayıcı desteklemiyor.' : Notification.permission === 'granted' ? 'Açık ✓' : Notification.permission === 'denied' ? 'Tarayıcıda engellenmiş: site ayarlarından izin ver.' : 'Kapalı'; }
  if (nb) { nState(); nb.addEventListener('click', function () { if (window.Notification) Notification.requestPermission().then(nState); }); }

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
    var g = e.target.closest && e.target.closest('svg.chart g[data-t], svg.cgrid g[data-t], .heat .hc[data-t]');
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
  // (Canlı sayı yoksa da çalışır: başlıktaki uyarı sayısı ve masaüstü bildirimi için.)
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setN(t) { for (var i = 0; i < nEls.length; i++) nEls[i].textContent = t; }
  function setD(h) { for (var i = 0; i < dEls.length; i++) dEls[i].innerHTML = h; }
  // Uyarı sayaçları: sekme başlığında sayı, izin verildiyse masaüstü bildirimi (yalnızca artış olunca).
  var baseTitle = document.title, lastAlerts = null;
  try { lastAlerts = JSON.parse(sessionStorage.getItem('adm_alerts') || 'null'); } catch (e) {}
  function alerts(a) {
    if (!a) return;
    var total = (a.sikayet || 0) + (a.supheli || 0) + (a.jshata || 0);
    document.title = (total ? '(' + total + ') ' : '') + baseTitle;
    if (lastAlerts && window.Notification && Notification.permission === 'granted') {
      var msg = [];
      if (a.sikayet > (lastAlerts.sikayet || 0)) msg.push('Sohbette yeni şikâyet (' + a.sikayet + ')');
      if (a.supheli > (lastAlerts.supheli || 0)) msg.push("Balon'da yeni şüpheli skor (" + a.supheli + ')');
      if (a.jshata > (lastAlerts.jshata || 0)) msg.push('Yeni JavaScript hatası (' + a.jshata + ')');
      if (msg.length) { try { new Notification('okutan.org yönetim', { body: msg.join(' · '), tag: 'okutan-admin' }); } catch (e) {} }
    }
    lastAlerts = a;
    try { sessionStorage.setItem('adm_alerts', JSON.stringify(a)); } catch (e) {}
  }
  function load() {
    fetch('./?ajax=online', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) alerts(j.alerts);
        if (!j || !j.ok) { setN('?'); setD(esc((j && j.error) || 'okunamadı')); return; }
        setN(j.n);
        var devs = j.devs.map(function (d) { return esc(d.dev) + ' ' + d.n; }).join(' · ');
        function dk(s) { if (s == null) return '—'; return s < 60 ? s + ' sn' : s < 3600 ? Math.floor(s / 60) + ' dk' : Math.floor(s / 3600) + ' sa ' + Math.floor(s % 3600 / 60) + ' dk'; }
        var rows = (j.people || []).map(function (p) {
          return '<tr><td class="path">' + esc(p.path) + '</td><td>' + esc(p.dev) + '</td><td>' + esc(p.br) + ' · ' + esc(p.os) + '</td><td>' + esc(p.ulke) + '</td>' +
            '<td class="r">' + dk(p.sure) + '</td><td class="r muted">' + dk(p.son) + ' önce</td></tr>';
        }).join('');
        setD(!j.n ? '<p class="muted small">Şu an kimse yok.</p>' :
          '<div class="small">' + devs + '</div><div class="tw"><table class="small live"><thead><tr><th>Sayfa</th><th>Cihaz</th><th>Tarayıcı · sistem</th><th>Ülke</th><th class="r">Sitede</th><th class="r">Son sinyal</th></tr></thead><tbody>' + rows + '</tbody></table></div>');
      })
      .catch(function () { setN('?'); });
  }
  function start() { clearInterval(timer); load(); timer = setInterval(function () { if (!document.hidden) load(); }, 20000); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  start();
})();
