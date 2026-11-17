/* Okey oyunları — masa sohbeti (101 Okey ve Okey ortak)
   Oyun sayfası window.OkeySohbetHost = { ctx(), say(seat, text, ms), sound() } tanımlar.
   Yalnızca online masada (bekleme odası dahil) görünür; mesajlar sunucudan gelir (api ?a=t_say / ?a=t_chat). */
(function () {
  'use strict';
  var QUICK = ['Merhaba 👋', 'Kolay gelsin', 'Hadi, sıra sende', 'Güzel hamle 👏', 'Şansa bak 😅', 'Az kaldı!', 'İyi oyunlar 🤝', 'Bir el daha?'];
  var EMO = ['😀', '😂', '😎', '🤔', '😡', '👏', '🔥', '🍀', '☕', '🙏'];

  function host() { return window.OkeySohbetHost || null; }
  // sohbet yalnızca online masada: botlara karşı oyunda ctx() boş döner
  function ctx() { var h = host(), c = h && h.ctx ? h.ctx() : null; return c && c.online ? c : null; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- görünüm ----------
  var css = '' +
    '#chatBtn{position:relative}' +
    '#chatBtn .cb-n{position:absolute;top:-7px;right:-7px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#ff3b30;color:#fff;font:800 10.5px/18px var(--mono,monospace);box-shadow:0 0 0 2px #0f3d2e}' +
    '.chat{position:fixed;right:16px;bottom:16px;z-index:70;width:min(340px,calc(100vw - 32px));max-height:min(500px,calc(100vh - 32px));display:flex;flex-direction:column;' +
    'background:var(--block,#fff);color:var(--ink,#111);border:1px solid var(--line,#ddd);border-radius:18px;box-shadow:0 30px 60px -24px rgba(0,0,0,.6);overflow:hidden;font-family:var(--sans,sans-serif)}' +
    '.chat .ch-h{display:flex;align-items:center;gap:10px;padding:12px 12px 10px 16px;border-bottom:1px solid var(--line,#ddd)}' +
    '.chat .ch-h b{font-size:16px;font-weight:800}.chat .ch-h small{flex:1;min-width:0;font:500 11px var(--mono,monospace);color:var(--muted,#777);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.chat .ch-x{width:30px;height:30px;border-radius:9px;border:1px solid var(--line,#ddd);background:var(--bg,#f4f4f2);cursor:pointer;color:inherit}' +
    '.chat .ch-l{list-style:none;flex:1;min-height:90px;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}' +
    '.chat .ch-l li{max-width:85%;align-self:flex-start;display:flex;flex-direction:column;gap:2px}' +
    '.chat .ch-l li small{font:700 11px var(--mono,monospace);color:var(--muted,#777)}' +
    '.chat .ch-l li span{padding:7px 11px;border-radius:14px 14px 14px 4px;background:var(--bg,#f1f1ee);font-size:14.5px;line-height:1.35;overflow-wrap:anywhere}' +
    '.chat .ch-l li.me{align-self:flex-end;align-items:flex-end}.chat .ch-l li.me span{background:var(--accent,#ff5a1f);color:#fff;border-radius:14px 14px 4px 14px}' +
    '.chat .ch-l li.sys{align-self:center;max-width:100%}.chat .ch-l li.sys span{background:none;color:var(--muted,#777);font-size:12.5px;text-align:center;padding:2px}' +
    '.chat .ch-q{display:flex;gap:6px;overflow-x:auto;padding:8px 12px 4px;scrollbar-width:none}.chat .ch-q::-webkit-scrollbar{display:none}' +
    '.chat .ch-q button{flex:none;height:30px;padding:0 11px;border-radius:999px;border:1px solid var(--line,#ddd);background:var(--bg,#f4f4f2);color:inherit;font:600 12.5px var(--sans,sans-serif);cursor:pointer;white-space:nowrap}' +
    '.chat .ch-q button:hover{border-color:var(--accent,#ff5a1f)}' +
    '.chat .ch-e{display:flex;gap:2px;padding:2px 10px 0;overflow-x:auto;scrollbar-width:none}.chat .ch-e::-webkit-scrollbar{display:none}' +
    '.chat .ch-e button{flex:none;width:32px;height:32px;border:0;border-radius:8px;background:none;font-size:19px;cursor:pointer}.chat .ch-e button:hover{background:var(--bg,#f4f4f2)}' +
    '.chat form{display:flex;gap:6px;padding:8px 12px 12px}' +
    '.chat input{flex:1;min-width:0;height:42px;border-radius:12px;border:1px solid var(--line,#ddd);background:var(--bg,#f4f4f2);color:inherit;font:500 15px var(--sans,sans-serif);padding:0 12px;outline:none}' +
    '.chat input:focus{border-color:var(--accent,#ff5a1f)}' +
    '.chat form button{height:42px;padding:0 14px;border:0;border-radius:12px;background:var(--accent,#ff5a1f);color:#fff;font:700 14px var(--sans,sans-serif);cursor:pointer}' +
    '.chat form button:disabled{opacity:.5;cursor:default}' +
    '.plate .say.chatmsg{width:max-content;max-width:240px;white-space:normal;text-align:center;line-height:1.3}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var btn = el('button', 'hbtn', '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg><b class="cb-n" hidden>0</b>');
  btn.id = 'chatBtn'; btn.hidden = true; btn.setAttribute('aria-label', 'Sohbet (T)'); btn.title = 'Sohbet (T)';
  var newBtn = document.getElementById('newBtn');
  if (newBtn && newBtn.parentNode) newBtn.parentNode.insertBefore(btn, newBtn);
  var badge = btn.querySelector('.cb-n');
  // bekleme odasında üst çubuk pencerenin arkasında kalır: odaya da bir sohbet düğmesi
  var lobbyBtn = el('button', 'btn btn-g', 'Sohbet');
  lobbyBtn.type = 'button'; lobbyBtn.id = 'lobbyChat';
  var leave = document.getElementById('lobbyLeave');
  if (leave && leave.parentNode) leave.parentNode.appendChild(lobbyBtn);

  var panel = el('div', 'chat');
  panel.id = 'chatPanel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Sohbet');
  panel.innerHTML = '<div class="ch-h"><b>Sohbet</b><small id="chatSub"></small><button type="button" class="ch-x" id="chatX" aria-label="Kapat">✕</button></div>' +
    '<ol class="ch-l" id="chatList" aria-live="polite"></ol>' +
    '<div class="ch-q">' + QUICK.map(function (q) { return '<button type="button">' + esc(q) + '</button>'; }).join('') + '</div>' +
    '<div class="ch-e">' + EMO.map(function (q) { return '<button type="button" aria-label="' + q + '">' + q + '</button>'; }).join('') + '</div>' +
    '<form id="chatForm" autocomplete="off"><input id="chatIn" maxlength="140" placeholder="Mesaj yaz…" enterkeyhint="send"><button type="submit">Gönder</button></form>';
  (document.getElementById('stageWrap') || document.body).appendChild(panel);
  var list = panel.querySelector('#chatList'), input = panel.querySelector('#chatIn'), sub = panel.querySelector('#chatSub'), sendBtn = panel.querySelector('form button');

  // ---------- durum ----------
  var msgs = [], lastId = 0, unread = 0, room = null, pollT = 0, polling = false, sending = false;
  function roomKey(c) { return c ? c.code : null; }
  function syncRoom() {
    var c = ctx(), k = roomKey(c);
    if (k !== room) { room = k; msgs = []; lastId = 0; unread = 0; renderList(); renderBadge(); }
    btn.hidden = !c;
    if (!c && !panel.hidden) close();
    sub.textContent = c ? 'Masa ' + c.code + ' · masadaki herkes görür' : '';
    return c;
  }
  function renderBadge() {
    badge.hidden = !unread; badge.textContent = unread > 9 ? '9+' : String(unread);
    lobbyBtn.textContent = unread ? 'Sohbet (' + (unread > 9 ? '9+' : unread) + ')' : 'Sohbet';
  }
  function renderList() {
    var c = ctx(), me = c ? c.me : 0;
    list.innerHTML = '';
    if (!msgs.length) { list.appendChild(el('li', 'sys', '<span>Masaya ilk mesajı sen yaz.</span>')); return; }
    msgs.forEach(function (m) {
      var li = el('li', m.seat === me ? 'me' : '');
      if (m.seat !== me) li.appendChild(el('small', null, esc(m.name)));
      var sp = el('span'); sp.textContent = m.text; li.appendChild(sp);
      list.appendChild(li);
    });
    list.scrollTop = list.scrollHeight;
  }
  function addMsg(m, quiet) {
    msgs.push(m); if (msgs.length > 80) msgs.shift();
    renderList();
    var c = ctx(), h = host();
    if (h && h.say) h.say(m.seat, m.text, Math.min(6000, 2200 + m.text.length * 45));
    if (c && m.seat !== c.me && panel.hidden && !quiet) { unread++; renderBadge(); if (h && h.sound) h.sound(); }
  }

  // ---------- gönder / al ----------
  function post(a, body) { var c = ctx(); return fetch((c && c.api || 'api/') + '?a=' + a, { method: 'POST', cache: 'no-store', body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }
  function send(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    var c = syncRoom(); if (!text || !c || sending) return;
    sending = true; sendBtn.disabled = true;
    post('t_say', { code: c.code, seat: c.seat, seatKey: c.seatKey, text: text }).then(function (j) {
      if (j && j.ok) { if (j.id > lastId) { lastId = j.id; addMsg({ id: j.id, seat: c.seat, name: c.name, text: j.text }); } }
      else sysMsg(j && j.error === 'slow' ? 'Biraz yavaş: mesajlar arasında kısa bir ara ver.' : 'Mesaj gönderilemedi.');
    }).catch(function () { sysMsg('Bağlantı sorunu: mesaj gönderilemedi.'); })
      .then(function () { sending = false; sendBtn.disabled = false; });
  }
  function sysMsg(t) { var li = el('li', 'sys'); var sp = el('span'); sp.textContent = t; li.appendChild(sp); list.appendChild(li); list.scrollTop = list.scrollHeight; }
  function poll() {
    var c = syncRoom();
    if (!c || polling) return;
    polling = true;
    var first = lastId === 0;
    post('t_chat', { code: c.code, seat: c.seat, seatKey: c.seatKey, after: lastId }).then(function (j) {
      if (!j || !j.ok || roomKey(ctx()) !== room) return;
      j.msgs.forEach(function (m) { if (m.id > lastId) { lastId = m.id; addMsg(m, first); } });
    }).catch(function () {}).then(function () { polling = false; });
  }
  function schedule() { clearTimeout(pollT); pollT = setTimeout(function () { if (ctx()) poll(); else syncRoom(); schedule(); }, panel.hidden ? 2500 : 1500); }
  schedule();
  // arka plandaki sekmede tarayıcı zamanlayıcıları seyreltir: sekme öne gelince hemen kontrol et
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { poll(); schedule(); } });

  // ---------- etkileşim ----------
  function open() { if (!syncRoom()) return; panel.hidden = false; unread = 0; renderBadge(); renderList(); poll(); setTimeout(function () { if (matchMedia('(pointer:fine)').matches) input.focus(); }, 30); schedule(); }
  function close() { panel.hidden = true; input.blur(); schedule(); }
  btn.addEventListener('click', function (e) { e.stopPropagation(); if (panel.hidden) open(); else close(); });
  lobbyBtn.addEventListener('click', function (e) { e.stopPropagation(); if (panel.hidden) open(); else close(); });
  panel.querySelector('#chatX').addEventListener('click', close);
  panel.addEventListener('click', function (e) {
    e.stopPropagation();
    var b = e.target.closest('.ch-q button, .ch-e button'); if (!b) return;
    if (b.parentNode.classList.contains('ch-e')) { input.value = (input.value + b.textContent).slice(0, 140); input.focus(); }
    else send(b.textContent);
  });
  panel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  panel.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); send(input.value); input.value = ''; });
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === 't' || e.key === 'T') && ctx()) { e.preventDefault(); if (panel.hidden) open(); else close(); }
  });
  window.OkeySohbet = { open: open, close: close, send: send };
})();
