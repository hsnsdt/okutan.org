/* Canlı Sohbet — arayüz. Kurallar motor.js'te (window.SohbetMotor), sunucu api/index.php.
   Yoklama: görünür sekmede 2,5 sn (bir süre sessizse 5 sn), arka planda 20 sn; aynı anda tek istek.
   Katıldı/ayrıldı satırları kişi listesinin farkından burada üretilir (veritabanına yazılmaz).
   Ayarlar (görünüm, yazı boyutu, saat, giriş/çıkış, ses, bildirim) localStorage 'sh_ayar'da. */
(function () {
  'use strict';
  var M = window.SohbetMotor, API = '/sohbet/api/', root = document.documentElement;
  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var log = $('log'), inp = $('inp'), form = $('form'), chat = $('chat');
  var S = {
    key: lsGet('sh_key'), me: null, ch: 'genel', lastId: 0, since: 0, gen: 0,
    users: null, usersAt: 0, counts: {}, slow: 0, topic: null, pin: null, more: false,
    away: '', inflight: false, timer: 0, fails: 0, lastAct: Date.now(), loaded: false, typingUntil: 0,
    atBot: true, hist: [], histIdx: -1, tab: null, unread: 0, mention: false, sending: false, mutedTimer: 0
  };
  var AYAR = { tema: 'yeni', boyut: 'm', saat: true, giris: lsGet('sh_joins') !== '0', ses: lsGet('sh_ses') !== '0', bildirim: false };
  try { var kayitli = JSON.parse(lsGet('sh_ayar') || 'null'); if (kayitli) for (var k in AYAR) if (k in kayitli) AYAR[k] = kayitli[k]; } catch (e) {}
  var BASE_TITLE = document.title;

  // ---------- sunucu ----------
  function api(a, body) {
    return fetch(API + '?a=' + a, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'server_error' }; }); });
  }

  // ---------- durum satırı ----------
  var stTimer = 0;
  function status(t, ms) { $('status').textContent = t || ''; clearTimeout(stTimer); if (t && ms) stTimer = setTimeout(function () { $('status').textContent = ''; }, ms); }

  // ---------- ayarlar ----------
  function ayarKaydet() { lsSet('sh_ayar', JSON.stringify(AYAR)); }
  function ayarUygula() {
    chat.classList.toggle('klasik', AYAR.tema === 'klasik');
    chat.classList.toggle('fs-s', AYAR.boyut === 's'); chat.classList.toggle('fs-l', AYAR.boyut === 'l');
    chat.classList.toggle('no-time', !AYAR.saat);
    log.querySelectorAll('.ln.j').forEach(function (x) { x.hidden = !AYAR.giris; });
    [['segTema', AYAR.tema], ['segBoyut', AYAR.boyut]].forEach(function (p) {
      $(p[0]).querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === p[1]); });
    });
    $('optSaat').checked = AYAR.saat; $('optGiris').checked = AYAR.giris; $('optSes').checked = AYAR.ses;
    var izin = 'Notification' in window ? Notification.permission : 'yok';
    $('optBildirim').checked = AYAR.bildirim && izin === 'granted';
    $('optBildirim').disabled = izin === 'yok' || izin === 'denied';
    $('bildirimNot').textContent = izin === 'yok' ? 'Bu tarayıcı bildirimleri desteklemiyor.' : izin === 'denied' ? 'Bildirim izni kapalı; tarayıcı ayarlarından açabilirsin.' : 'Sekme arka plandayken adın geçerse bildirim gelir.';
    renderSound();
  }
  [['segTema', 'tema'], ['segBoyut', 'boyut']].forEach(function (p) {
    $(p[0]).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; AYAR[p[1]] = b.dataset.v; ayarKaydet(); ayarUygula(); stick(true); });
  });
  $('optSaat').onchange = function () { AYAR.saat = this.checked; ayarKaydet(); ayarUygula(); };
  $('optGiris').onchange = function () { AYAR.giris = this.checked; ayarKaydet(); ayarUygula(); };
  $('optSes').onchange = function () { AYAR.ses = this.checked; ayarKaydet(); ayarUygula(); if (AYAR.ses) ping(); };
  $('optBildirim').onchange = function () {
    var cb = this;
    if (!cb.checked) { AYAR.bildirim = false; ayarKaydet(); ayarUygula(); return; }
    Notification.requestPermission().then(function (p) { AYAR.bildirim = p === 'granted'; ayarKaydet(); ayarUygula(); });
  };
  $('setBtn').onclick = function () { ayarUygula(); openModal('setModal'); };

  // ---------- kanallar ----------
  function konuOf(ch) { var k = M.KANALLAR.filter(function (x) { return x.id === ch; })[0]; return k ? k.konu : ''; }
  function renderChannels() {
    var nav = $('chList'), tabs = $('chTabs');
    nav.textContent = ''; tabs.textContent = '';
    M.KANALLAR.forEach(function (k) {
      var n = S.counts[k.id] || 0;
      var b = el('button'); b.type = 'button'; b.setAttribute('aria-current', k.id === S.ch);
      b.appendChild(el('span', 'h', '#')); b.appendChild(document.createTextNode(k.ad));
      if (n) b.appendChild(el('small', null, String(n)));
      b.title = '#' + k.id + ' · ' + k.konu;
      b.onclick = function () { switchCh(k.id); };
      nav.appendChild(b);
      var t = el('button'); t.type = 'button'; t.setAttribute('role', 'tab'); t.setAttribute('aria-current', k.id === S.ch); t.setAttribute('aria-selected', k.id === S.ch);
      t.textContent = '#' + k.ad; if (n) t.appendChild(el('small', null, String(n)));
      t.onclick = function () { switchCh(k.id); };
      tabs.appendChild(t);
      if (k.id === S.ch) setTimeout(function () { try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }, 0);
    });
    $('chName').textContent = '#' + S.ch;
    $('topic').textContent = S.topic || konuOf(S.ch);
    var sl = $('slowTag'); sl.hidden = !(S.slow > 1); sl.textContent = 'Yavaş mod · ' + S.slow + ' sn';
  }
  function switchCh(ch, keepHash) {
    if (!M.kanalBul(ch) || ch === S.ch && S.loaded) return;
    S.ch = ch; S.gen++; S.lastId = 0; S.since = 0; S.users = null; S.usersAt = 0; S.topic = null; S.slow = 0; S.loaded = false; S.pin = null; S.more = false; S.olderLoaded = false; S.atBot = true;
    lsSet('sh_ch', ch);
    if (!keepHash) try { history.replaceState(null, '', location.pathname + location.search + '#' + ch); } catch (e) {}
    log.textContent = ''; $('users').textContent = ''; $('typing').textContent = ''; renderPin(); closePop(); closeDrawer();
    renderChannels();
    poll(true);
  }

  // ---------- satırlar ----------
  function hhmm(t) { var d = t ? new Date(t * 1000) : new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function atBottom() { return log.scrollHeight - log.scrollTop - log.clientHeight < 60; }
  function stick(was) { if (was) { log.scrollTop = log.scrollHeight; S.atBot = true; $('newBelow').hidden = true; } else $('newBelow').hidden = false; }
  // alta yapışık mıydık? kaydırma olayından tutulur; "yazıyor" satırı ya da sabit mesaj alanı daraltınca kopmasın
  if (window.ResizeObserver) new ResizeObserver(function () { if (S.atBot) log.scrollTop = log.scrollHeight; }).observe(log);
  function trim() {
    var max = S.olderLoaded ? 2000 : 500;
    while (log.querySelectorAll('.ln').length > max) { var f = log.querySelector('.ln'); f.remove(); }
  }
  function nickSpan(nick, op) {
    var s = el('span', 'nk c' + M.renk(nick));
    s.textContent = nick; s.dataset.nick = nick;
    if (op) { var o = el('span', 'op', '@'); s.insertBefore(o, s.firstChild); }
    return s;
  }
  function fillText(tx, text) {
    M.parcala(text).forEach(function (p) {
      if (p.t === 'text') tx.appendChild(document.createTextNode(p.v));
      else if (p.t === 'link') { var a = el('a', null, p.v); a.href = p.href; a.target = '_blank'; a.rel = 'noopener'; tx.appendChild(a); }
      else if (p.t === 'davet') {
        var d = el('a', 'davet'); d.href = p.href; d.target = '_blank'; d.rel = 'noopener';
        var img = el('img'); img.src = '/' + p.oyun + '/icon-192.png'; img.alt = ''; img.width = 40; img.height = 40; img.loading = 'lazy';
        var sp = el('span'); sp.appendChild(el('b', null, p.ad + ' masası')); sp.appendChild(el('small', null, 'Masa kodu ' + p.kod));
        d.appendChild(img); d.appendChild(sp); d.appendChild(el('i', null, 'Katıl'));
        tx.appendChild(d);
      }
    });
  }
  // gün ayırıcılarını yeniden diz: her günün ilk satırının önüne "Bugün / Dün / tarih"
  function renderDays() {
    log.querySelectorAll('.gun').forEach(function (g) { g.remove(); });
    var son = null, now = Date.now() / 1000;
    log.querySelectorAll('.ln[data-t]').forEach(function (d) {
      var t = +d.dataset.t, g = M.gunAnahtari(t);
      if (g !== son) { var s = el('div', 'gun', M.gunEtiketi(t, now)); s.setAttribute('role', 'separator'); d.parentNode.insertBefore(s, d); son = g; }
    });
  }
  function localLine(text, cls) {
    var was = S.atBot;
    var d = el('div', 'ln ' + (cls || 's')); d.dataset.t = Math.floor(Date.now() / 1000); d.appendChild(el('time', null, hhmm()));
    d.appendChild(el('span', 'tx', text));
    if (cls === 'j' && !AYAR.giris) d.hidden = true;
    log.appendChild(d); trim(); stick(was || cls === 'err');
    return d;
  }
  function buildMsg(m) {
    var d = el('div', 'ln'), mine = S.me && m.u === S.me.id, tx = el('span', 'tx');
    d.dataset.id = m.id; d.dataset.u = m.u; d.dataset.t = m.t;
    d.appendChild(el('time', null, hhmm(m.t)));
    if (m.k === 'm') {
      d.appendChild(document.createTextNode('<')); d.appendChild(nickSpan(m.n, m.op)); d.appendChild(document.createTextNode('> '));
      fillText(tx, m.x);
    } else if (m.k === 'e') {
      d.classList.add('e'); d.appendChild(nickSpan(m.n, m.op)); d.appendChild(document.createTextNode(' ')); fillText(tx, m.x);
    } else if (m.k === 'a') {
      d.classList.add('a'); d.appendChild(nickSpan(m.n, true)); d.appendChild(document.createTextNode(': ')); fillText(tx, m.x);
    } else if (m.k === 'n') {
      d.classList.add('s'); var p = m.x.split(' → ');
      tx.textContent = (p[0] || '') + ' artık ' + (p[1] || '') + ' olarak biliniyor';
    } else { d.classList.add('s'); tx.textContent = m.x; }
    d.appendChild(tx);
    if (m.k === 'm' || m.k === 'e') {
      var b = el('button', 'lm', '⋯'); b.type = 'button'; b.setAttribute('aria-label', 'Mesaj işlemleri');
      b.onclick = function (ev) { ev.stopPropagation(); openPop(b, m, d); };
      d.appendChild(b);
      if (!mine && S.me && S.me.nick && M.bahsediyor(m.x, S.me.nick)) d.classList.add('hl');
    }
    return d;
  }
  function addMsg(m, quiet) {
    if (log.querySelector('.ln[data-id="' + m.id + '"]')) return;
    var d = buildMsg(m), mine = S.me && m.u === S.me.id, sys = m.k === 's' || m.k === 'n';
    // sekme arka plandayken gelen ilk mesajın önüne "okunmamış" çizgisi
    if (!quiet && !mine && !sys && document.hidden && !log.querySelector('.okunmamis')) log.appendChild(el('div', 'okunmamis', 'Okunmamış mesajlar'));
    log.appendChild(d);
    if (quiet || mine) return;
    if (d.classList.contains('hl')) { ping(); if (document.hidden) { S.mention = true; notify(m); } }
    if (document.hidden && !sys) S.unread++;
  }
  function delMsg(id) { var d = log.querySelector('.ln[data-id="' + id + '"]'); if (d) d.remove(); if (S.pin && S.pin.id === id) { S.pin = null; renderPin(); } }

  // ---------- eski mesajlar ----------
  function renderOlder() {
    var b = log.querySelector('.eski');
    if (!S.more) { if (b) b.remove(); return; }
    if (!b) { b = el('button', 'eski', 'Daha eski mesajlar'); b.type = 'button'; b.onclick = loadOlder; log.insertBefore(b, log.firstChild); }
  }
  function loadOlder() {
    var first = log.querySelector('.ln[data-id]'); if (!first) return;
    var b = log.querySelector('.eski'); if (b) { b.disabled = true; b.textContent = 'Yükleniyor…'; }
    var gen = S.gen;
    api('history', { key: S.key, ch: S.ch, before: +first.dataset.id }).then(function (r) {
      if (gen !== S.gen) return;
      if (b) { b.disabled = false; b.textContent = 'Daha eski mesajlar'; }
      if (!r.ok) { status(M.hataMetni(r.error), 3000); return; }
      var h = log.scrollHeight, top = log.scrollTop, frag = document.createDocumentFragment();
      r.msgs.forEach(function (m) { if (!log.querySelector('.ln[data-id="' + m.id + '"]')) frag.appendChild(buildMsg(m)); });
      log.insertBefore(frag, first.previousElementSibling && first.previousElementSibling.classList.contains('gun') ? first.previousElementSibling : first);
      S.olderLoaded = true; S.more = r.more; renderOlder(); renderDays();
      log.scrollTop = top + (log.scrollHeight - h);
    }).catch(function () { if (b) { b.disabled = false; b.textContent = 'Daha eski mesajlar'; } });
  }

  // ---------- sabit mesaj ----------
  function renderPin() {
    var bar = $('pinBar'), p = S.pin;
    bar.hidden = !p;
    if (!p) return;
    var t = $('pinText'); t.textContent = '';
    t.appendChild(el('b', 'c' + M.renk(p.n), p.n)); fillText(t, p.x);
    t.title = p.n + ': ' + p.x;
    $('pinOff').hidden = !(S.me && S.me.op);
  }
  function setPin(id) {
    api('op_pin', { key: S.key, ch: S.ch, id: id }).then(function (r) { if (r.ok) poll(true); else localLine(M.hataMetni(r.error), 'err'); });
  }
  $('pinOff').onclick = function () { setPin(0); };
  $('pinText').onclick = function (e) {
    if (e.target.closest('a') || !S.pin) return;
    var d = log.querySelector('.ln[data-id="' + S.pin.id + '"]');
    if (d) { d.scrollIntoView({ block: 'center', behavior: 'smooth' }); d.classList.add('menu'); setTimeout(function () { d.classList.remove('menu'); }, 1500); }
  };

  // ---------- kişi listesi ----------
  function renderUsers() {
    var ul = $('users'), list = S.users || [];
    ul.textContent = '';
    if (!list.length) ul.appendChild(el('li', 'empty', S.users ? 'Kanalda şu an kimse yok.' : 'Yükleniyor…'));
    list.forEach(function (u) {
      var li = el('li', (u.away ? 'aw' : '') + (S.me && u.id === S.me.id ? ' me' : ''));
      li.appendChild(el('span', 'o', u.op ? '@' : ''));
      li.appendChild(el('span', 'c' + M.renk(u.nick), u.nick));
      if (u.rozet) { var r = el('span', 'rz', u.rozet); r.title = 'Bu haftanın en çok kazananları: ' + u.rozet; li.appendChild(r); }
      if (u.away) li.title = 'Uzakta: ' + u.away;
      li.onclick = function () { mention(u.nick); closeDrawer(); };
      ul.appendChild(li);
    });
    $('usersN').textContent = list.length;
    $('usersTitle').textContent = 'Kişiler · ' + list.length;
  }
  function mention(nick) {
    var v = inp.value;
    inp.value = v ? v.replace(/\s*$/, ' ') + nick + ' ' : nick + ': ';
    inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
  }
  log.addEventListener('click', function (e) { var n = e.target.closest('.nk'); if (n && n.dataset.nick) mention(n.dataset.nick); });

  // ---------- yazıyor ----------
  function renderTyping(list) {
    list = (list || []).filter(function (n) { return !S.me || n !== S.me.nick; });
    $('typing').textContent = !list.length ? '' : list.length > 3 ? 'Birkaç kişi yazıyor…' : list.join(', ') + ' yazıyor…';
  }

  // ---------- yoklama ----------
  function interval() {
    if (document.hidden) return 20000;
    return Date.now() - S.lastAct > 120000 ? 5000 : 2500;
  }
  function schedule(ms) { clearTimeout(S.timer); S.timer = setTimeout(function () { poll(false); }, ms); }
  function poll(force) {
    if (!S.key) return;
    if (S.inflight) { if (force) S.again = true; return; }
    S.inflight = true; clearTimeout(S.timer);
    var gen = S.gen, wantUsers = !S.users || Date.now() - S.usersAt > 10000 || force;
    var typing = Date.now() < S.typingUntil && inp.value.trim() !== '' && inp.value[0] !== '/';
    api('poll', { key: S.key, ch: S.ch, after: S.lastId, since: S.since, users: wantUsers ? 1 : 0, away: S.away, typing: typing ? 1 : 0 })
      .then(function (r) {
        S.inflight = false;
        if (gen !== S.gen) { poll(true); return; }
        if (!r.ok) {
          if (r.error === 'bad_key') { S.key = null; lsSet('sh_key', ''); hello(); return; }
          throw new Error(r.error || 'server_error');
        }
        if (S.fails) { status('Bağlantı yeniden kuruldu.', 2500); S.fails = 0; }
        handle(r, wantUsers);
        if (S.again) { S.again = false; poll(true); } else schedule(interval());
      })
      .catch(function () {
        S.inflight = false; S.fails++;
        status('Bağlantı koptu, yeniden deneniyor…');
        schedule(Math.min(30000, 2000 * Math.pow(2, Math.min(4, S.fails))));
      });
  }
  function handle(r, withUsers) {
    var first = !S.loaded, was = S.atBot || first;
    setMe(r.me);
    (r.del || []).forEach(delMsg);
    r.msgs.forEach(function (m) { addMsg(m, first); if (m.id > S.lastId) S.lastId = m.id; });
    if (r.msgs.length && !first) S.lastAct = Date.now();
    if (first) {
      S.loaded = true; S.more = r.msgs.length >= 100; renderOlder();
      localLine('#' + S.ch + ' kanalına girdin. ' + (r.topic || konuOf(S.ch)), 's');
      if (!S.me || !S.me.nick) localLine('Yazmak için bir rumuz seç: /nick Rumuz ya da alttaki Rumuz düğmesi.', 's');
    }
    if (withUsers && r.users) {
      if (S.users && !first) {
        var f = M.farklar(S.users, r.users), me = S.me && S.me.nick;
        f.gelen.forEach(function (n) { if (n !== me) localLine('→ ' + n + ' katıldı', 'j'); });
        f.giden.forEach(function (n) { if (n !== me) localLine('← ' + n + ' ayrıldı', 'j'); });
      }
      S.users = r.users; S.usersAt = Date.now(); S.counts = r.counts || {}; S.slow = r.slow || 0; S.topic = r.topic || null;
      S.pin = r.pin || null; renderPin();
      renderUsers(); renderChannels();
    }
    renderTyping(r.typing);
    trim();
    if (r.msgs.length || first) { renderDays(); stick(was); }
    S.since = r.now;
    updateTitle();
  }
  function updateTitle() {
    if (!document.hidden) { S.unread = 0; S.mention = false; }
    document.title = (S.mention ? '(!) ' : S.unread ? '(' + S.unread + ') ' : '') + BASE_TITLE;
  }
  document.addEventListener('visibilitychange', function () { updateTitle(); if (!document.hidden) { S.lastAct = Date.now(); poll(true); } });
  window.addEventListener('online', function () { poll(true); });
  window.addEventListener('hashchange', function () { var c = M.kanalBul(location.hash); if (c) switchCh(c, true); });

  // ---------- masaüstü bildirimi ----------
  function notify(m) {
    if (!AYAR.bildirim || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      var n = new Notification('#' + S.ch + ' · ' + m.n, { body: m.x.slice(0, 140), icon: '/sohbet/icon-192.png', tag: 'sohbet-' + m.id });
      n.onclick = function () { window.focus(); n.close(); };
    } catch (e) {}
  }

  // ---------- ben ----------
  function setMe(me) {
    if (!me) return;
    var wasOp = S.me && S.me.op;
    S.me = me;
    var nick = me.nick || 'Rumuz seç';
    $('nickBtn').textContent = nick; $('meNick').textContent = me.nick || '—';
    if (wasOp !== me.op) renderPin();
    clearTimeout(S.mutedTimer);
    if (me.banned) { inp.disabled = true; inp.placeholder = M.hataMetni('banned'); $('sendBtn').disabled = true; return; }
    if (me.muted) {
      var left = me.muted * 1000 - Date.now();
      inp.disabled = true; $('sendBtn').disabled = true;
      inp.placeholder = 'Susturuldun · ' + new Date(me.muted * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + ' saatine kadar yazamazsın';
      S.mutedTimer = setTimeout(function () { poll(true); }, Math.max(1000, left + 500));
      return;
    }
    inp.disabled = false; $('sendBtn').disabled = S.sending;
    inp.placeholder = me.nick ? 'Mesaj yaz… (komutlar: /yardim)' : 'Yazmak için önce rumuz seç';
  }
  function hello() {
    return api('hello', { key: S.key }).then(function (r) {
      if (!r.ok) {
        if (r.error === 'banned') { setMe({ id: 0, nick: null, banned: true }); status(M.hataMetni('banned')); return; }
        status(M.hataMetni(r.error) + ' Yeniden deneniyor…'); setTimeout(hello, 10000); return;
      }
      S.key = r.key; lsSet('sh_key', r.key); setMe(r.me);
      status('');
      if (!r.me.nick && !r.me.banned) openNick();
      poll(true);
    }).catch(function () { status('Sunucuya ulaşılamadı. Yeniden deneniyor…'); setTimeout(hello, 10000); });
  }

  // ---------- gönderme ----------
  function send(text, me) {
    if (!S.me || !S.me.nick) { openNick(); return Promise.resolve(false); }
    S.sending = true; $('sendBtn').disabled = true;
    return api('say', { key: S.key, ch: S.ch, text: text, me: !!me }).then(function (r) {
      S.sending = false; $('sendBtn').disabled = inp.disabled;
      if (r.ok) {
        S.lastAct = Date.now(); S.typingUntil = 0;
        var o = log.querySelector('.okunmamis'); if (o) o.remove();
        poll(true); return true;
      }
      if (r.error === 'slow' && r.wait) status('Yavaş mod: ' + r.wait + ' sn sonra tekrar yaz.', 3500);
      else if (r.error === 'muted' || r.error === 'banned') poll(true);
      else if (r.error === 'need_nick') openNick();
      else status(M.hataMetni(r.error), 4000);
      return false;
    }).catch(function () { S.sending = false; $('sendBtn').disabled = false; status('Gönderilemedi; bağlantını kontrol et.', 4000); return false; });
  }
  function setNick(nick) {
    return api('nick', { key: S.key, nick: nick }).then(function (r) {
      if (!r.ok) return r.error;
      S.me.nick = r.nick; setMe(S.me); lsSet('sh_nick', r.nick);
      if (!lsGet('bp_name')) lsSet('bp_name', r.nick);
      renderUsers(); poll(true);
      return null;
    }).catch(function () { return 'server_error'; });
  }
  function opMute(nick, min) {
    api('op_mute', { key: S.key, nick: nick, min: min, ch: S.ch }).then(function (r) {
      if (r.ok) poll(true); else localLine(M.hataMetni(r.error), 'err');
    });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = inp.value, c = M.komut(v);
    if (c.t === 'bos') return;
    if (c.t !== 'hata') { S.hist.push(v); if (S.hist.length > 30) S.hist.shift(); }
    S.histIdx = -1;
    switch (c.t) {
      case 'say': case 'me':
        send(c.text, c.t === 'me').then(function (ok) { if (ok) inp.value = ''; });
        return;
      case 'nick':
        setNick(c.nick).then(function (err) { if (err) localLine(M.hataMetni(err), 'err'); else inp.value = ''; });
        return;
      case 'join': inp.value = ''; switchCh(c.ch); return;
      case 'away':
        inp.value = '';
        S.away = c.back ? '' : (c.reason || 'uzakta');
        localLine(S.away ? 'Uzakta görünüyorsun. Dönünce /back yaz.' : 'Tekrar buradasın.', 's');
        poll(true); return;
      case 'clear': inp.value = ''; log.textContent = ''; S.more = false; return;
      case 'help': inp.value = ''; openModal('helpModal'); return;
      case 'mute':
        inp.value = '';
        if (!S.me || !S.me.op) { localLine(M.hataMetni('not_op'), 'err'); return; }
        opMute(c.nick, c.min); return;
      case 'hata': localLine(c.msg, 'err'); return;
    }
  });

  // ---------- klavye ----------
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      var nicks = (S.users || []).map(function (u) { return u.nick; }).filter(function (n) { return !S.me || n !== S.me.nick; });
      var pos = inp.selectionStart, v = inp.value;
      if (!S.tab) {
        var m = /(\S+)$/.exec(v.slice(0, pos));
        if (!m) return; // boşken Tab sayfada gezinmeye devam etsin
        S.tab = { start: pos - m[1].length, end: pos, prefix: m[1], i: 0 };
      } else S.tab.i++;
      var n = M.tamamla(S.tab.prefix, nicks, S.tab.i);
      if (!n) { S.tab = null; return; }
      e.preventDefault();
      var ins = n + (S.tab.start === 0 ? ': ' : ' ');
      inp.value = v.slice(0, S.tab.start) + ins + v.slice(S.tab.end);
      S.tab.end = S.tab.start + ins.length;
      inp.setSelectionRange(S.tab.end, S.tab.end);
      return;
    }
    S.tab = null;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      var ids = M.KANALLAR.map(function (k) { return k.id; }), i = ids.indexOf(S.ch);
      switchCh(ids[(i + (e.key === 'ArrowUp' ? -1 : 1) + ids.length) % ids.length]); return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.ctrlKey && !e.metaKey && S.hist.length) {
      if (e.key === 'ArrowUp') S.histIdx = S.histIdx < 0 ? S.hist.length - 1 : Math.max(0, S.histIdx - 1);
      else if (S.histIdx < 0) return; else S.histIdx = S.histIdx + 1;
      e.preventDefault();
      if (S.histIdx >= S.hist.length) { S.histIdx = -1; inp.value = ''; return; }
      inp.value = S.hist[S.histIdx]; inp.setSelectionRange(inp.value.length, inp.value.length);
      return;
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); log.scrollBy(0, (e.key === 'PageUp' ? -1 : 1) * log.clientHeight * 0.85); }
  });
  inp.addEventListener('input', function () {
    S.lastAct = Date.now();
    var basladi = Date.now() >= S.typingUntil;
    S.typingUntil = inp.value.trim() ? Date.now() + 4000 : 0;
    if (basladi && S.typingUntil && inp.value[0] !== '/') poll(false); // yazmaya başlayınca öbürleri hemen görsün
  });
  inp.addEventListener('focus', function () { if (S.me && !S.me.nick && !S.me.banned) openNick(); });
  log.addEventListener('scroll', function () { S.atBot = atBottom(); if (S.atBot) $('newBelow').hidden = true; closePop(); }, { passive: true });
  $('newBelow').onclick = function () { log.scrollTop = log.scrollHeight; $('newBelow').hidden = true; };

  // ---------- açılır menüler (mesaj işlemleri, emoji) ----------
  var pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; document.querySelectorAll('.ln.menu').forEach(function (x) { x.classList.remove('menu'); }); } }
  function placePop(btn) {
    var r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    var x = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)), y = r.bottom + 4;
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 4);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function openPop(btn, m, line) {
    closePop();
    var mine = S.me && m.u === S.me.id;
    pop = el('div', 'pop'); pop.setAttribute('role', 'menu');
    function item(t, fn, cls) { var b = el('button', cls || null, t); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.onclick = function () { closePop(); fn(); }; pop.appendChild(b); return b; }
    item('Yanıtla', function () { mention(m.n); });
    if (!mine) item('Şikâyet et', function () {
      if (!S.me || !S.me.nick) { openNick(); return; }
      api('report', { key: S.key, id: m.id }).then(function (r) {
        localLine(r.ok ? (r.hidden ? 'Şikâyetin alındı; mesaj gizlendi.' : 'Şikâyetin alındı. Teşekkürler.') : M.hataMetni(r.error), r.ok ? 's' : 'err');
        if (r.hidden) delMsg(m.id);
      });
    }, 'd');
    if (S.me && S.me.op) {
      if (!S.pin || S.pin.id !== m.id) item('Kanala sabitle (moderatör)', function () { setPin(m.id); });
      item('Sil (moderatör)', function () { api('op_del', { key: S.key, id: m.id }).then(function (r) { if (r.ok) delMsg(m.id); else localLine(M.hataMetni(r.error), 'err'); }); }, 'd');
      if (!mine) item('10 dk sustur (moderatör)', function () { opMute(m.n, 10); }, 'd');
    }
    chat.appendChild(pop);
    line.classList.add('menu');
    placePop(btn);
    pop.querySelector('button').focus();
  }
  $('emoBtn').onclick = function (ev) {
    ev.stopPropagation();
    if (pop && pop.classList.contains('emo-pop')) { closePop(); return; }
    closePop();
    pop = el('div', 'pop emo-pop'); pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', 'Emoji');
    M.EMOJILER.forEach(function (em) {
      var b = el('button', null, em); b.type = 'button'; b.setAttribute('aria-label', em);
      b.onclick = function () {
        var s = inp.selectionStart != null ? inp.selectionStart : inp.value.length, e2 = inp.selectionEnd != null ? inp.selectionEnd : s;
        inp.value = inp.value.slice(0, s) + em + inp.value.slice(e2);
        closePop(); inp.focus(); try { inp.setSelectionRange(s + em.length, s + em.length); } catch (e) {}
      };
      pop.appendChild(b);
    });
    chat.appendChild(pop); placePop($('emoBtn'));
  };
  document.addEventListener('click', function (e) { if (pop && !pop.contains(e.target)) closePop(); });

  // ---------- kişiler çekmecesi (telefon) ----------
  function openDrawer() { $('userPane').classList.add('open'); $('shade').hidden = false; }
  function closeDrawer() { $('userPane').classList.remove('open'); $('shade').hidden = true; }
  $('usersBtn').onclick = openDrawer; $('usersClose').onclick = closeDrawer; $('shade').onclick = closeDrawer;

  // ---------- pencereler ----------
  function openModal(id) { $(id).hidden = false; var f = $(id).querySelector('input:not([type=checkbox]),button.btn'); if (f) setTimeout(function () { f.focus(); }, 30); }
  function closeModal(m) { m.hidden = true; }
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (pop) { closePop(); return; }
    if ($('userPane').classList.contains('open')) { closeDrawer(); return; }
    document.querySelectorAll('.modal:not([hidden])').forEach(closeModal);
  });
  function openNick() {
    var cur = (S.me && S.me.nick) || lsGet('sh_nick') || lsGet('bp_name') || '';
    $('nickInp').value = M.rumuzGecerli(cur) ? M.rumuzDuzelt(cur) : '';
    $('nickErr').textContent = '';
    $('nickTitle').textContent = S.me && S.me.nick ? 'Rumuzu değiştir' : 'Rumuzunu seç';
    $('nickOk').textContent = S.me && S.me.nick ? 'Kaydet' : 'Sohbete gir';
    openModal('nickModal');
  }
  $('nickForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = M.rumuzDuzelt($('nickInp').value);
    if (!M.rumuzGecerli(n)) { $('nickErr').textContent = M.hataMetni('bad_nick'); return; }
    $('nickOk').disabled = true;
    setNick(n).then(function (err) {
      $('nickOk').disabled = false;
      if (err) { $('nickErr').textContent = M.hataMetni(err); return; }
      closeModal($('nickModal')); inp.focus();
    });
  });
  $('nickBtn').onclick = openNick; $('nickBtn2').onclick = openNick;
  $('helpBtn').onclick = function () { openModal('helpModal'); };

  // ---------- ses: adın geçince kısa bir çınlama ----------
  var actx = null;
  function ping() {
    if (!AYAR.ses) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var t = actx.currentTime;
      [880, 1320].forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.18);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.2);
      });
    } catch (e) {}
  }
  function renderSound() {
    var b = $('soundBtn'); b.setAttribute('aria-pressed', AYAR.ses);
    b.querySelector('.wv').toggleAttribute('hidden', !AYAR.ses); b.querySelector('.mt').toggleAttribute('hidden', AYAR.ses);
  }
  $('soundBtn').onclick = function () { AYAR.ses = !AYAR.ses; ayarKaydet(); ayarUygula(); if (AYAR.ses) ping(); };

  // ---------- oyundan "Sohbette duyur": /sohbet/?duyur=<davet bağlantısı>#kanal ----------
  function duyuruHazirla() {
    var q = new URLSearchParams(location.search), d = q.get('duyur');
    if (!d) return;
    var p = M.parcala(d).filter(function (x) { return x.t === 'davet'; })[0];
    if (p) S.ch = M.kanalBul(location.hash) || M.kanalOyun(p.oyun);
    try { history.replaceState(null, '', location.pathname + '#' + S.ch); } catch (e) {}
    if (!p) return;
    inp.value = p.ad + ' masası kurdum, gelin! ' + d;
    setTimeout(function () { if (S.me && S.me.nick) { inp.focus(); status('Davet hazır: göndermek için Enter.', 5000); } }, 600);
  }

  // ---------- sayfa ----------
  $('themeBtn').onclick = function () {
    var c = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = c === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); lsSet('theme', n);
  };
  [['cTabDesk', 'ctlDesk'], ['cTabMob', 'ctlMob']].forEach(function (p, i, all) {
    $(p[0]).onclick = function () { all.forEach(function (q) { $(q[0]).setAttribute('aria-selected', q === p); $(q[1]).hidden = q !== p; }); };
  });
  if (matchMedia('(pointer: coarse)').matches) $('cTabMob').click();
  $('yr').textContent = new Date().getFullYear();
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });

  S.ch = M.kanalBul(location.hash) || M.kanalBul(lsGet('sh_ch')) || 'genel';
  duyuruHazirla();
  ayarUygula(); renderChannels(); renderUsers();
  hello();

  if (/[?&]test=1/.test(location.search)) window.__sh = { S: S, AYAR: AYAR, poll: poll, switchCh: switchCh, M: M };
})();
