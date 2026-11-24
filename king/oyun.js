/* King — arayüz: masa, kartlar, oyun seçme ve koz panelleri, puan cetveli, botlar, animasyonlar, ipucu, süre, günlük el, sıralama, online masa.
   Kurallar motor.js'te. Online masada oyunu masa sahibinin tarayıcısı yönetir; sunucu (api/) yalnızca aktarır. */
(function () {
  'use strict';
  var M = window.KingKural;
  var API = 'api/';
  var $ = function (id) { return document.getElementById(id); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('tr-TR'); }
  function sgn(n) { return (n > 0 ? '+' : '') + fmt(n); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function post(a, body) { return fetch(API + '?a=' + a, { method: 'POST', cache: 'no-store', body: JSON.stringify(body || {}) }).then(function (r) { return r.json(); }); }
  function get(a, q) { return fetch(API + '?a=' + a + (q || ''), { cache: 'no-store' }).then(function (r) { return r.json(); }); }
  function fnv1a(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  function todayKey() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()); } catch (e) { return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); } }
  function validName(n) { n = (n || '').replace(/\s+/g, ' ').trim(); return n.length >= 2 && n.length <= 16 && /^[\p{L}\p{N}][\p{L}\p{N} ._\-]*$/u.test(n); }
  function readJSON(k, d) { try { return JSON.parse(lsGet(k) || 'null') || d; } catch (e) { return d; } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  $('yr').textContent = new Date().getFullYear();

  var K_SAVE = 'kng_save', K_ONLINE = 'kng_online', K_STATS = 'kng_stats';
  var BOT_NAMES = ['Ayşe', 'Mehmet', 'Zeynep'];
  var LEVEL_TR = { easy: 'Kolay', normal: 'Orta', hard: 'Zor' };
  var SUIT_TR = { S: 'Maça', H: 'Kupa', D: 'Karo', C: 'Sinek' };
  var RANK_TR = { 11: 'Vale', 12: 'Kız', 13: 'Papaz', 14: 'As' };
  var RANK_LB = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  var SP_ROT = [0, 7, -3, -7];
  // game: oyun ayarları ve puanlar · st: motor durumu (yerel ya da masa sahibi) · V: ekrana çizilen görünüm · me: benim koltuğum
  // hold: animasyon sırasında ortada gösterilen el (V'deki son durumdan önceki görünüm)
  var game = null, st = null, V = null, me = 0, sel = null, busy = false, hold = null, hintMark = null;

  // ================= tema · ses =================
  var root = document.documentElement;
  $('themeBtn').onclick = function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); lsSet('theme', n);
  };
  var actx = null, master = null, muted = lsGet('king_mute') === '1', vol = Math.min(1, Math.max(0, +(lsGet('king_vol') || 0.8))), noiseBuf = null;
  function syncSound() {
    var off = muted || vol === 0;
    $('soundBtn').setAttribute('aria-pressed', off ? 'true' : 'false');
    $('soundBtn').querySelector('.w').style.display = off ? 'none' : '';
    $('soundBtn').querySelector('.x').style.display = off ? '' : 'none';
    $('vol').value = Math.round(vol * 100); $('volVal').textContent = Math.round(vol * 100) + '%';
    $('muteBtn').setAttribute('aria-pressed', muted ? 'true' : 'false');
    if (master) master.gain.value = vol;
  }
  function audio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = vol; master.connect(actx.destination); } catch (e) { actx = null; }
  }
  $('soundBtn').onclick = function (e) { e.stopPropagation(); audio(); $('sndPop').hidden = !$('sndPop').hidden; };
  $('sndPop').addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { $('sndPop').hidden = true; });
  $('vol').addEventListener('input', function () { vol = this.value / 100; lsSet('king_vol', String(vol)); if (vol > 0) { muted = false; lsSet('king_mute', '0'); } audio(); syncSound(); });
  $('vol').addEventListener('change', function () { sfx.card(); });
  $('muteBtn').onclick = function () { muted = !muted; lsSet('king_mute', muted ? '1' : '0'); syncSound(); };
  syncSound();
  function tone(f, d, type, v, delay) {
    if (muted || !actx) return;
    var t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v || 0.12, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + d + 0.02);
  }
  // kart sesi: kısa, kâğıt gibi bir hışırtı + hafif tok vuruş
  function snap(v, f, delay) {
    if (muted || !actx) return;
    if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.2, actx.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4); }
    var t0 = actx.currentTime + (delay || 0), s = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.value = f || 3200; bp.Q.value = 0.9;
    g.gain.setValueAtTime(v || 0.45, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    s.connect(bp); bp.connect(g); g.connect(master); s.start(t0); s.stop(t0 + 0.07);
    tone(140, 0.05, 'sine', (v || 0.45) * 0.25, delay);
  }
  var sfx = {
    card: function () { snap(0.5, 3000); },
    pick: function () { snap(0.22, 4200); },
    deal: function () { for (var i = 0; i < 16; i++) snap(0.2 + Math.random() * 0.12, 2600 + Math.random() * 1800, i * 0.04); },
    choose: function () { [440, 660].forEach(function (f, i) { tone(f, 0.12, 'triangle', 0.07, i * 0.08); }); },
    pen: function () { tone(220, 0.16, 'triangle', 0.06); tone(165, 0.2, 'triangle', 0.05, 0.08); },
    trump: function () { [523, 784].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.08, i * 0.09); }); },
    trick: function () { snap(0.3, 2200); snap(0.25, 2600, 0.05); },
    mine: function () { [784, 1047].forEach(function (f, i) { tone(f, 0.16, 'sine', 0.07, 0.05 + i * 0.07); }); },
    bad: function () { tone(180, 0.22, 'sawtooth', 0.05); tone(120, 0.28, 'sawtooth', 0.04, 0.1); },
    tick: function () { tone(1100, 0.04, 'square', 0.025); },
    win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.22, 'square', 0.035, i * 0.09); tone(f * 2, 0.22, 'sine', 0.035, i * 0.09); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.24, 'triangle', 0.06, i * 0.13); }); }
  };

  // ================= kayıt =================
  function save() {
    if (!game) return;
    if (game.mode === 'online' && !game.online.isHost) { lsSet(K_ONLINE, JSON.stringify({ v: 1, game: game })); return; }
    if (st) lsSet(game.mode === 'online' ? K_ONLINE : K_SAVE, JSON.stringify({ v: 1, game: game, st: st }));
  }

  // ================= görünüm (V) =================
  function pos(seat) { return (seat - me + 4) % 4; }
  function seatAt(p) { return (p + me) % 4; }
  var PUBF = ['phase', 'turn', 'chooser', 'contract', 'trump', 'trick', 'lastTrick', 'tricks', 'taken', 'heartsBroken', 'trumpBroken', 'played', 'voids', 'over', 'early', 'result', 'opts'];
  function viewFromSt(s) {
    var v = { myHand: s.hands[me], counts: s.hands.map(function (h) { return h.length; }), deadline: game.deadline || 0, hid: s.seed };
    PUBF.forEach(function (k) { v[k] = s[k]; });
    return v;
  }
  function buildPub() {
    var p = { names: game.names, scores: game.scores, hands: game.hands, idx: game.idx, finished: !!game.finished, levels: game.levels, plan: game.plan, allowed: game.allowed || [],
      counts: st.hands.map(function (h) { return h.length; }), deadline: game.deadline || 0, hid: st.seed, events: game.events || [], errs: game.errs || {} };
    PUBF.forEach(function (k) { p[k] = st[k]; });
    return p;
  }
  function viewFromPub(pub, priv) {
    var v = { myHand: priv && priv.hand ? priv.hand : [], counts: pub.counts, deadline: pub.deadline, hid: pub.hid };
    PUBF.forEach(function (k) { v[k] = pub[k]; });
    return v;
  }
  function refreshView() { if (st && (!game || game.mode !== 'online' || game.online.isHost)) V = viewFromSt(st); }
  // ipucu için motorun anlayacağı durum (yalnızca benim elim + açık bilgiler)
  function fakeSt() {
    var hands = [[], [], [], []]; hands[me] = V.myHand.slice();
    var s = { hands: hands };
    PUBF.forEach(function (k) { s[k] = V[k]; });
    s.opts = M.opts(V.opts);
    return s;
  }
  function myLegal() {
    if (!V || V.phase !== 'play' || V.turn !== me || V.over) return [];
    return M.legalFor(V.myHand, V.trick, V.contract, V.trump, V, M.opts(V.opts));
  }
  function illegalReason(c) {
    if (!V.trick.length) return V.contract === 'koz' ? 'koz_closed' : 'kupa_closed';
    var led = V.trick[0].c.s;
    if (V.myHand.some(function (x) { return x.s === led; })) return c.s === led ? 'must_burn' : 'must_follow';
    return V.contract === 'koz' ? 'must_trump' : 'must_dump';
  }
  function cname(k) { return k ? M.CONTRACTS[k].ad : '—'; }
  function units(k, n) { var m = M.CONTRACTS[k]; return n + ' ' + m.birim; }

  // ================= kart görünümü =================
  function isRed(s) { return s === 'H' || s === 'D'; }
  function suitSVG(s, cls) { return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#s' + s + '"/></svg>'; }
  function cardName(c) { return SUIT_TR[c.s] + ' ' + (RANK_TR[c.r] || c.r); }
  function cardEl(c, cls) {
    var d = document.createElement('div');
    if (!c) { d.className = 'card back' + (cls ? ' ' + cls : ''); return d; }
    d.className = 'card' + (isRed(c.s) ? ' red' : '') + (cls ? ' ' + cls : '');
    d.dataset.id = c.id;
    // kartın kendisi tek resimden (assets/kart-deste.webp; sütun 2..10 J Q K A, satır S H D C), olduğu gibi
    d.className += ' im';
    d.style.backgroundPosition = ((c.r - 2) * 100 / 12) + '% ' + (['S', 'H', 'D', 'C'].indexOf(c.s) * 100 / 3) + '%';
    d.setAttribute('aria-label', cardName(c));
    return d;
  }
  function names() { return (game && game.names ? game.names : ['Sen'].concat(BOT_NAMES)).map(function (n) { return String(n || '').replace(/\s*\(bot\)$/, ''); }); }
  function bulunma(n) {
    var low = String(n).toLocaleLowerCase('tr'), v = low.match(/[aeıioöuü](?=[^aeıioöuü]*$)/);
    var front = v && 'eiöü'.indexOf(v[0]) >= 0, hard = 'çfhkpsşt'.indexOf(low.slice(-1)) >= 0;
    return (hard ? 't' : 'd') + (front ? 'e' : 'a');
  }

  // ================= avatarlar =================
  var AV = [
    { bg: '#ffd8b0', skin: '#f2c49b', hair: '#3b2a1e', shirt: '#ff5a1f', style: 0 },
    { bg: '#ffd9e6', skin: '#f5cfa8', hair: '#6b3d1f', shirt: '#e2457a', style: 2 },
    { bg: '#cfe3ff', skin: '#e9b48a', hair: '#151515', shirt: '#2f6df0', style: 1 },
    { bg: '#cdf3dc', skin: '#d9a77c', hair: '#1f1410', shirt: '#17975a', style: 4 }
  ];
  function avatarSVG(seat) {
    var a = AV[seat], hair;
    if (a.style === 0) hair = '<path d="M20 30c0-11 8-17 16-17s16 6 16 17c-4-5-9-7-16-7s-12 2-16 7z" fill="' + a.hair + '"/>';
    else if (a.style === 1) hair = '<path d="M21 31c-1-12 7-18 15-18 9 0 16 6 15 18l-3-6c-4 2-9 2-12 0-3 2-9 2-12 0z" fill="' + a.hair + '"/><path d="M26 47c3 4 7 5 10 5s7-1 10-5" stroke="' + a.hair + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    else if (a.style === 2) hair = '<path d="M17 44c-2-20 6-31 19-31s21 11 19 31c-2-6-4-10-5-15-6 3-17 3-27 0-1 5-3 9-6 15z" fill="' + a.hair + '"/>';
    else hair = '<circle cx="36" cy="14" r="7" fill="' + a.hair + '"/><path d="M19 38c-1-16 7-24 17-24s18 8 17 24c-3-7-6-11-8-14-5 2-13 2-18 0-2 3-5 7-8 14z" fill="' + a.hair + '"/>';
    return '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="' + a.bg + '"/>' +
      '<path d="M10 72c2-13 13-20 26-20s24 7 26 20z" fill="' + a.shirt + '"/><path d="M30 52h12v6c-2 2-10 2-12 0z" fill="' + a.skin + '"/>' +
      '<ellipse cx="36" cy="35" rx="14" ry="16" fill="' + a.skin + '"/>' + hair +
      '<circle cx="30.5" cy="36" r="1.8" fill="#222"/><circle cx="41.5" cy="36" r="1.8" fill="#222"/>' +
      '<path d="M31 43c3 2.4 7 2.4 10 0" stroke="#7a3b2a" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
  }

  // ================= sahneyi sığdır =================
  var BW = 1100, BH = 680;
  function fit() {
    var wrap = $('stageWrap'), board = $('board'), fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    var headerHidden = innerHeight <= 560 && innerWidth > innerHeight;
    var availW = fs ? innerWidth : wrap.clientWidth, availH = fs ? innerHeight : innerHeight - (headerHidden ? 12 : 86);
    var k = Math.min(availW / BW, Math.max(0.3, availH / BH));
    board.style.transform = 'scale(' + k + ')';
    board.style.left = Math.max(0, (availW - BW * k) / 2) + 'px';
    board.style.top = fs ? Math.max(0, (innerHeight - BH * k) / 2) + 'px' : '0px';
    wrap.style.height = fs ? '100vh' : Math.round(BH * k) + 'px';
  }
  addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe($('stageWrap'));
  $('fsBtn').onclick = function () {
    var el = $('stageWrap');
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { var r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (r && r.catch) r.catch(function () {}); }
    } catch (e) {}
  };
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) { document.addEventListener(ev, function () { setTimeout(fit, 50); }); });
  if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) $('fsBtn').hidden = true;
  fit();
  function boardScale() { var r = $('board').getBoundingClientRect(); return r.width / BW || 1; }

  // ================= çizim =================
  function render(fresh) {
    if (!V || !game) return;
    $('handChip').innerHTML = game.mode === 'daily' ? 'Günlük el' : (game.mode === 'online' ? 'Masa ' + esc(game.online.code) + ' · ' : '') + 'El <b>' + Math.min(game.hands, game.idx + (V.over ? 0 : 1)) + '/' + game.hands + '</b>';
    $('gameChip').innerHTML = 'Oyun <b>' + (V.contract ? cname(V.contract) : '—') + '</b>';
    $('trumpChip').hidden = V.contract !== 'koz';
    $('trumpChip').innerHTML = 'Koz ' + (V.trump ? suitSVG(V.trump, 'si ' + (isRed(V.trump) ? 'red' : 'blk')) + '<b>' + SUIT_TR[V.trump] + '</b>' : '<b>—</b>');
    for (var p = 0; p < 4; p++) renderPlate(p);
    renderTrick(); renderLast(); renderHand(fresh); renderPanels(); renderHint();
    $('hintBtn').disabled = !isMyTurn();
    $('sheetBtn').disabled = game.mode === 'daily';
  }
  function renderPlate(p) {
    var seat = seatAt(p), el = $('pl' + p), nm = names()[seat];
    var keep = el.querySelector('.say');
    el.classList.toggle('turn', V.turn === seat && !V.over && !deal);
    var badge = '', bcls = '';
    if (seat === V.chooser) {
      if (!V.contract) { badge = 'SEÇİYOR'; bcls = 'dl'; }
      else badge = cname(V.contract).toLocaleUpperCase('tr') + (V.trump ? ' ' + suitSVG(V.trump) : '');
    }
    var line;
    if (!V.contract || V.phase === 'trump') line = (deal ? deal.n[seat] : V.counts[seat]) + ' kart';
    else {
      var u = V.taken[seat], m = M.CONTRACTS[V.contract];
      line = V.contract === 'koz' || V.contract === 'el' ? V.tricks[seat] + ' el' : units(V.contract, u);
      if (u) line += ' · <i>' + sgn(u * m.per) + '</i>';
    }
    if (game.mode !== 'daily') line += ' · ' + fmt(game.scores[seat]);
    var lvl = game.levels && game.levels[seat] ? ' · ' + LEVEL_TR[game.levels[seat]] : '';
    var fan = '';
    if (p !== 0) { var n = Math.min(13, V.counts[seat]); for (var i = 0; i < n; i++) fan += deal && i >= deal.n[seat] ? '<i class="dh"></i>' : '<i></i>'; }
    el.innerHTML = '<div class="av"><div class="ring"></div>' + avatarSVG(seat) + (badge ? '<span class="badge ' + bcls + '">' + badge + '</span>' : '') + '</div>' +
      '<div class="np"><b>' + esc(nm) + '</b><small>' + line + esc(lvl) + '</small></div><div class="fan">' + fan + '</div>';
    el.insertBefore(keep || Object.assign(document.createElement('div'), { className: 'say' }), el.firstChild);
  }
  function renderTrick() {
    var cards = hold ? hold.cards : V.trick, win = hold && hold.winner >= 0 ? hold.winner : -1;
    for (var p = 0; p < 4; p++) $('sp' + p).innerHTML = '';
    (cards || []).forEach(function (t) { $('sp' + pos(t.p)).appendChild(cardEl(t.c, t.p === win ? 'win' : '')); });
  }
  function renderLast() {
    var lt = V.lastTrick, box = $('lastCards');
    if (!lt) { box.innerHTML = '<span class="none">Henüz el alınmadı</span>'; $('lastWho').textContent = ''; return; }
    box.innerHTML = lt.cards.map(function (t) {
      return '<span class="mc p' + pos(t.p) + (isRed(t.c.s) ? ' red' : '') + (t.p === lt.winner ? ' w' : '') + '">' + (RANK_LB[t.c.r] || t.c.r) + suitSVG(t.c.s) + '</span>';
    }).join('');
    var pen = V.contract && V.contract !== 'koz' && lt.units ? ' · ' + sgn(lt.units * M.CONTRACTS[V.contract].per) : '';
    $('lastWho').textContent = (lt.winner === me ? 'Sen aldın' : names()[lt.winner] + ' aldı') + pen;
  }
  function renderHand(fresh) {
    var el = $('hand'), h = V.myHand, n = h.length;
    var legal = myLegal(), ok = {}, myPlay = isMyTurn('play');
    legal.forEach(function (c) { ok[c.id] = 1; });
    el.classList.toggle('my', myPlay);
    el.innerHTML = '';
    if (!n) return;
    var CW = 92, W = 704, gaps = 0;
    for (var i = 1; i < n; i++) if (h[i].s !== h[i - 1].s) gaps++;
    var G = 10, sp = n > 1 ? Math.min(66, (W - CW - gaps * G) / (n - 1)) : 0;
    var total = CW + (n - 1) * sp + gaps * G, x = (W - total) / 2;
    h.forEach(function (c, i) {
      if (i > 0) { x += sp; if (c.s !== h[i - 1].s) x += G; }
      var cls = (myPlay ? (ok[c.id] ? 'ok' : 'no') : '') + (sel === c.id ? ' sel' : '') + (hintMark && hintMark.a === 'play' && hintMark.id === c.id ? ' hintpulse' : '');
      if (deal) cls += (deal.face ? '' : ' dn') + (i >= deal.n[me] ? ' dh' : '');
      var d = cardEl(c, cls);
      d.style.left = x + 'px';
      if (fresh) { d.classList.add('deal'); d.style.animationDelay = (i * 45) + 'ms'; d.style.setProperty('--dx', (W / 2 - x - CW / 2) + 'px'); }
      el.appendChild(d);
    });
  }
  function myPlanInfo() {
    var pl = game.plan; if (!pl) return null;
    var left = M.turnsLeft(pl, me, game.idx), koz = pl.kozPer - pl.kozUsed[me];
    return { koz: koz, ceza: left - koz };
  }
  function renderPanels() {
    var chOn = isMyTurn('choose'), trOn = isMyTurn('trump');
    $('choosePanel').hidden = !chOn; $('trumpPanel').hidden = !trOn;
    if (chOn) {
      var al = game.allowed || [], pl = game.plan;
      var html = M.CEZA.map(function (k, i) {
        var m = M.CONTRACTS[k], rest = pl ? pl.cezaMax - pl.used[k] : 1;
        return '<button data-k="' + k + '"' + (al.indexOf(k) < 0 ? ' disabled' : '') + ' class="' + (hintMark && hintMark.a === 'choose' && hintMark.k === k ? 'hintpulse' : '') + '"><b>' + m.ad + '</b><small>' + m.birim + ' başı ' + m.per + '</small><i>' + (i + 1) + (pl ? ' · ' + rest + ' kaldı' : '') + '</i></button>';
      }).join('');
      if ($('ctrBtns').dataset.k !== html) { $('ctrBtns').innerHTML = html; $('ctrBtns').dataset.k = html; }
      var kb = $('kozBtn'), mi = myPlanInfo();
      kb.disabled = al.indexOf('koz') < 0;
      kb.classList.toggle('hintpulse', !!(hintMark && hintMark.a === 'choose' && hintMark.k === 'koz'));
      kb.querySelector('i').textContent = '7' + (mi ? ' · ' + mi.koz + ' kaldı' : '');
      $('chooseInfo').innerHTML = mi ? 'Sıra sende. Kalan seçimlerin: <b>' + mi.koz + ' koz</b>, <b>' + mi.ceza + ' ceza</b>.' + (mi.ceza === 0 ? ' Koz seçmek zorundasın.' : mi.koz === 0 ? ' Kozların bitti, ceza seç.' : '') : 'Ceza oyunlarından birini ya da kozu seç.';
    }
    if (trOn) {
      var cnt = {}; V.myHand.forEach(function (c) { cnt[c.s] = (cnt[c.s] || 0) + 1; });
      $('suitBtns').innerHTML = M.SUITS.map(function (s, i) {
        return '<button data-s="' + s + '" class="' + (isRed(s) ? 'red' : '') + (hintMark && hintMark.a === 'trump' && hintMark.s === s ? ' hintpulse' : '') + '">' + suitSVG(s) + '<b>' + SUIT_TR[s] + '</b><small>' + (cnt[s] || 0) + ' kart <span class="kc2">' + (i + 1) + '</span></small></button>';
      }).join('');
      $('trumpInfo').innerHTML = 'Koz oyunu senin: alacağın <b>her el +50</b>. İlk kartı sen atacaksın.';
    }
  }
  function renderHint() {
    var h = '';
    if (V.over || hold) h = '';
    else if (deal) h = deal.face ? '' : 'Kartlar dağıtılıyor… (geçmek için dokun)';
    else if (!isMyTurn()) h = waitingText();
    else if (hintMark && hintMark.text) h = '💡 ' + hintMark.text;
    else if (V.phase === 'play') {
      var k = V.contract, left = k === 'kupa' || k === 'erkek' || k === 'kiz' ? M.CONTRACTS[k].max - V.taken.reduce(function (a, b) { return a + b; }, 0) : 0;
      var goal = k === 'koz' ? 'El topla' : k === 'el' ? 'El alma' : k === 'son' ? 'Son iki eli alma' : k === 'rifki' ? 'Rıfkıyı (kupa papazı) alma' : M.CONTRACTS[k].ad + (left ? ' (' + left + ' kaldı)' : '');
      if (!V.trick.length) h = goal + ': bir kartla başla.';
      else {
        var led = V.trick[0].c.s, has = V.myHand.some(function (c) { return c.s === led; });
        h = goal + ' · ' + (has ? SUIT_TR[led] + ' atılmalı.' : k === 'koz' ? SUIT_TR[led] + ' sende yok: koz at.' : SUIT_TR[led] + ' sende yok: ceza kartını yak.');
      }
    }
    $('hint').textContent = h;
  }
  function waitingText() {
    if (!V) return '';
    var n = names()[V.turn];
    if (game.mode === 'online' && game.online && !game.online.isHost && !game.hostAlive) return 'Masa sahibinin bağlantısı bekleniyor…';
    if (V.phase === 'choose') return n + ' oyununu seçiyor…';
    if (V.phase === 'trump') return n + ' koz rengini seçiyor…';
    return 'Sıra ' + n + '\'' + bulunma(n) + '…';
  }
  function say(seat, text, ms) {
    var e = $('pl' + pos(seat)) && $('pl' + pos(seat)).querySelector('.say'); if (!e) return;
    e.textContent = text; e.classList.add('on'); e.classList.toggle('chatmsg', !!ms);
    clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('on', 'chatmsg'); }, ms || 1500 * (game ? game.speed : 1) + 300);
  }
  var toastT = 0;
  function toast(m) { var e = $('toast'); e.textContent = m; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 3400); }

  // ================= animasyon =================
  // sayfa gizliyken animasyon oynatma (tarayıcı kare çizmez, animasyon donar); oynatılanı da süresi dolunca bitmiş say
  var reduced = function () { return document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches; };
  function animDone(anim, ms) {
    return new Promise(function (res) { var done = false; function fin() { if (!done) { done = true; res(); } } anim.onfinish = fin; setTimeout(fin, ms + 250); });
  }
  function plateRect(seat) { var e = $('pl' + pos(seat)); return e ? e.querySelector('.av').getBoundingClientRect() : null; }
  function snapshot() {
    var r = {}; $('hand').querySelectorAll('.card').forEach(function (e) { r[e.dataset.id] = e.getBoundingClientRect(); });
    return { hand: r };
  }
  function flyer(c, rot) {
    var k = boardScale(), g = cardEl(c, 'flyer');
    g.style.setProperty('--cw', 80 * k + 'px'); g.style.setProperty('--ch', 114 * k + 'px');
    g.style.width = 80 * k + 'px'; g.style.height = 114 * k + 'px';
    void rot;
    return g;
  }
  function fly(c, from, toSpotP) {
    var to = $('sp' + toSpotP).querySelector('.card');
    if (!from || !to || reduced()) return Promise.resolve();
    var k = boardScale(), w = 80 * k, h = 114 * k, sp = $('sp' + toSpotP).getBoundingClientRect();
    var g = flyer(c);
    var cx = from.left + from.width / 2, cy = from.top + from.height / 2;
    g.style.left = (cx - w / 2) + 'px'; g.style.top = (cy - h / 2) + 'px';
    document.body.appendChild(g);
    var dx = sp.left + sp.width / 2 - cx, dy = sp.top + sp.height / 2 - cy, s0 = Math.max(0.35, from.width / w);
    to.style.visibility = 'hidden';
    var dur = 340 * Math.min(1.2, Math.max(0.7, game ? game.speed : 1));
    var anim = g.animate([{ transform: 'translate(0,0) scale(' + s0 + ') rotate(0)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1) rotate(' + SP_ROT[toSpotP] + 'deg)' }],
      { duration: dur, easing: 'cubic-bezier(.25,.8,.3,1)' });
    return animDone(anim, dur).then(function () { g.remove(); to.style.visibility = ''; });
  }
  function collect(winner) {
    var target = plateRect(winner), els = [];
    for (var p = 0; p < 4; p++) { var e = $('sp' + p).querySelector('.card'); if (e) els.push({ e: e, p: p }); }
    if (!target || reduced() || !els.length) return Promise.resolve();
    var k = boardScale(), w = 80 * k, h = 114 * k;
    return Promise.all(els.map(function (o, i) {
      var r = $('sp' + o.p).getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var c = { id: +o.e.dataset.id }; c = M.card(c.id);
      var g = flyer(c); g.style.left = (cx - w / 2) + 'px'; g.style.top = (cy - h / 2) + 'px';
      document.body.appendChild(g); o.e.style.visibility = 'hidden';
      var dx = target.left + target.width / 2 - cx, dy = target.top + target.height / 2 - cy;
      var anim = g.animate([{ transform: 'translate(0,0) scale(1) rotate(' + SP_ROT[o.p] + 'deg)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.3) rotate(' + (SP_ROT[o.p] * 3) + 'deg)', opacity: 0.15 }],
        { duration: 420, delay: i * 30, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'forwards' });
      return animDone(anim, 420 + i * 30).then(function () { g.remove(); });
    }));
  }
  // ================= dağıtım =================
  // Deste dağıtanın önünde durur; kartlar kapalı olarak dağıtanın sağından başlayıp birer birer gider (motorun dağıttığı sıra).
  // Benim kartlarım kapalı iner, dağıtım bitince açılır. Tıklayınca ya da bir tuşa basınca atlanır; sayfa gizliyken hiç oynamaz.
  var deal = null;
  function boardXY(el) {
    var B = $('board').getBoundingClientRect(), k = B.width / BW || 1, r = el.getBoundingClientRect();
    return { x: (r.left - B.left + r.width / 2) / k, y: (r.top - B.top + r.height / 2) / k, w: r.width / k };
  }
  function dealTargets(seat) {
    return seat === me ? $('hand').querySelectorAll('.card') : $('pl' + pos(seat)).querySelectorAll('.fan i');
  }
  function skipDeal() {
    if (!deal || deal.skip) return;
    deal.skip = true;
    deal.anims.forEach(function (a) { try { a.finish(); } catch (e) {} });
  }
  async function playDeal(dealer, order) {
    if (!V) return;
    if (reduced()) { render(); return; }
    var full = V.counts.slice(), D = deal = { n: [0, 0, 0, 0], face: false, skip: false, anims: [] };
    var live = function () { if (document.hidden && deal === D) skipDeal(); return deal === D && !D.skip; };
    render();
    if (!order) {
      order = []; var given = [0, 0, 0, 0], left = full.reduce(function (a, b) { return a + b; }, 0);
      for (var k = 0; left > 0 && k < 400; k++) { var s = (dealer + 1 + k) % 4; if (given[s] < full[s]) { order.push(s); given[s]++; left--; } }
    }
    var dp = boardXY($('pl' + pos(dealer)).querySelector('.av')), cx = 550, cy = 300;
    var dx0 = cx + (dp.x - cx) * 0.42, dy0 = cy + (dp.y - cy) * 0.42;
    var deck = cardEl(null, 'deck'); deck.style.left = (dx0 - 40) + 'px'; deck.style.top = (dy0 - 57) + 'px';
    $('board').appendChild(deck);
    var spd = Math.min(1.25, Math.max(0.6, game ? game.speed : 1)), gap = 34 * spd, dur = 320 * spd, sent = [0, 0, 0, 0], flights = [];
    sfx.deal(); await sleep(260 * spd);
    for (var i = 0; i < order.length && live(); i++) {
      var seat = order[i], idx = sent[seat]++, ts = dealTargets(seat), t = ts[Math.min(idx, ts.length - 1)];
      if (!t) continue;
      var to = boardXY(t), g = cardEl(null, 'dfly'), r0 = (Math.random() * 16 - 8);
      g.style.left = (dx0 - 40) + 'px'; g.style.top = (dy0 - 57) + 'px';
      $('board').appendChild(g);
      var anim = g.animate([{ transform: 'translate(0,0) rotate(' + r0 + 'deg) scale(1)' },
        { transform: 'translate(' + (to.x - dx0) + 'px,' + (to.y - dy0) + 'px) rotate(0deg) scale(' + (to.w / 80) + ')' }],
        { duration: dur, easing: 'cubic-bezier(.3,.75,.4,1)', fill: 'forwards' });
      D.anims.push(anim);
      snap(0.1 + Math.random() * 0.06, 3600 + Math.random() * 1400);
      flights.push(animDone(anim, dur).then(function (g, seat) { return function () {
        g.remove(); if (deal !== D) return; D.n[seat]++;
        if (!D.skip) { if (seat === me) renderHand(); else renderPlate(pos(seat)); }
      }; }(g, seat)));
      await sleep(gap);
    }
    if (D.skip) D.anims.forEach(function (a) { try { a.finish(); } catch (e) {} });
    await Promise.all(flights);
    deck.remove();
    if (deal !== D) return;
    D.n = full.slice(); render();
    var cards = [].slice.call($('hand').querySelectorAll('.card'));
    if (cards.length && !D.skip && !reduced()) {
      await Promise.all(cards.map(function (e, i) { return animDone(e.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 110, delay: i * 14, fill: 'forwards' }), 110 + i * 14); }));
      if (deal !== D) return;
      deal = null; render();
      sfx.pick();
      [].slice.call($('hand').querySelectorAll('.card')).forEach(function (e, i) { e.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 130, delay: i * 14, fill: 'backwards' }); });
      await sleep(130 + cards.length * 14);
    } else { deal = null; render(); }
  }
  $('board').addEventListener('pointerdown', function () { if (deal) skipDeal(); }, true);

  // Bir olayı göster: ses, balon, kart uçuşu, eli toplama. Yerel oyunda, masa sahibinde ve misafirde aynı.
  async function showEvent(ev, before) {
    var nm = names();
    if (ev.a === 'choose') {
      sfx.choose(); if (ev.p !== me) say(ev.p, cname(ev.k));
      toast((ev.p === me ? 'Seçtiğin oyun: ' : nm[ev.p] + ' seçti: ') + cname(ev.k) + '.');
      render(); return;
    }
    if (ev.a === 'trump') {
      sfx.trump(); if (ev.p !== me) say(ev.p, 'Koz ' + SUIT_TR[ev.s]);
      toast('Koz ' + SUIT_TR[ev.s] + '.');
      render(); return;
    }
    if (ev.a === 'play') {
      hold = { cards: ev.trick, winner: -1 };
      render();
      sfx.card();
      var from = ev.p === me ? (before && before.hand[ev.c.id]) || plateRect(me) : plateRect(ev.p);
      await fly(ev.c, from, pos(ev.p));
      if (ev.winner >= 0) {
        hold.winner = ev.winner; render();
        var ctr = V && V.contract;
        if (ctr === 'koz') { if (ev.winner === me) sfx.mine(); }
        else if (ev.units) { sfx.pen(); say(ev.winner, sgn(ev.units * M.CONTRACTS[ctr].per)); }
        await sleep(Math.max(450, 850 * (game ? game.speed : 1)));
        sfx.trick();
        await collect(ev.winner);
        if (ev.early) toast({ kupa: 'Bütün kupalar çıktı', erkek: 'Bütün papaz ve valeler çıktı', kiz: 'Bütün kızlar çıktı', rifki: 'Rıfkı çıktı' }[V.contract] + ': el bitti.');
      }
      hold = null; render();
    }
  }

  // ================= hata metinleri =================
  var ERR = {
    must_follow: 'Yerdeki renkten atmalısın.', must_burn: 'Yerde daha büyüğü var: elindeki cezalı kartı yakmalısın.',
    must_trump: 'Bu renk sende yok: koz atmalısın.', must_dump: 'Bu renk sende yok: elindeki cezalı kartı atmalısın.',
    koz_closed: 'Koz henüz açılmadı: kozla başlayamazsın.', kupa_closed: 'Kupa henüz açılmadı: kupayla başlayamazsın.',
    not_your_turn: 'Sıra sende değil.', not_allowed: 'Bu oyun artık seçilemez.', no_card: 'Bu kart elinde değil.'
  };
  function fail(r) { toast(ERR[r.error] || 'Bu hamle yapılamaz.'); sfx.bad(); }

  // ================= hamle katmanı =================
  function isMyTurn(phase) {
    if (!V || !game || V.over || busy || hold || deal) return false;
    if (V.turn !== me) return false;
    if (game.mode === 'online' && !game.online.isHost && game.pending) return false;
    return !phase || V.phase === phase;
  }
  function applyMove(s, p, mv) {
    var r;
    if (mv.a === 'choose') { r = M.choose(s, p, mv.k, game.allowed); return { r: r, ev: r.ok ? { p: p, a: 'choose', k: mv.k } : null }; }
    if (mv.a === 'trump') { r = M.chooseTrump(s, p, mv.s); return { r: r, ev: r.ok ? { p: p, a: 'trump', s: mv.s } : null }; }
    if (mv.a === 'play') {
      r = M.play(s, p, mv.id);
      return { r: r, ev: r.ok ? { p: p, a: 'play', c: r.card, trick: clone(r.done ? s.lastTrick.cards : s.trick), winner: r.done ? r.winner : -1, units: r.units || 0, early: !!r.early } : null };
    }
    return { r: { ok: false, error: 'bad_move' }, ev: null };
  }
  function pushEvent(ev) {
    if (!ev) return;
    game.seq = (game.seq || 0) + 1; ev.seq = game.seq;
    game.events = (game.events || []).concat([ev]).slice(-12);
  }
  async function myMove(mv) {
    if (!isMyTurn()) return;
    audio(); hintMark = null;
    if (game.mode === 'online' && !game.online.isHost) {
      game.pending = true; render();
      try {
        var j = await post('t_move', { code: game.online.code, seat: me, seatKey: game.online.seatKey, move: mv });
        if (!j.ok) { game.pending = false; toast('Hamle gönderilemedi.'); render(); }
      } catch (e) { game.pending = false; toast('Bağlantı sorunu: hamle gönderilemedi.'); render(); }
      setTimeout(clientPoll, 250);
      return;
    }
    var before = snapshot(), res = applyMove(st, me, mv);
    if (!res.r.ok) return fail(res.r);
    if (mv.a === 'play') sel = null;
    afterMove(res, before);
  }
  async function afterMove(res, before) {
    pushEvent(res.ev); refreshView(); game.deadline = 0;
    if (game.mode === 'online') publish();
    busy = true;
    try { if (res.ev) await showEvent(res.ev, before); } finally { busy = false; }
    save();
    if (st && st.over) return handEnd();
    setDeadline(); refreshView(); render();
    if (game.mode === 'online') publish();
    advance();
  }

  // ---------- oyuncu hamleleri ----------
  function doChoose(k) {
    if (!isMyTurn('choose')) return;
    if ((game.allowed || []).indexOf(k) < 0) { fail({ error: 'not_allowed' }); return; }
    myMove({ a: 'choose', k: k });
  }
  function doTrump(s) { if (isMyTurn('trump') && M.SUITS.indexOf(s) >= 0) myMove({ a: 'trump', s: s }); }
  function doPlay(id) {
    if (!isMyTurn('play')) return;
    var c = V.myHand.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    if (!myLegal().some(function (x) { return x.id === id; })) { fail({ error: illegalReason(c) }); return; }
    myMove({ a: 'play', id: id });
  }
  $('ctrBtns').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) doChoose(b.dataset.k); });
  $('kozBtn').onclick = function () { if (!this.disabled) doChoose('koz'); };
  $('suitBtns').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) doTrump(b.dataset.s); });
  $('hintBtn').onclick = function () {
    if (!isMyTurn()) return;
    var h = M.hint(fakeSt(), me, game.allowed); if (!h) return;
    if (h.a === 'choose') hintMark = { a: 'choose', k: h.k, text: 'Elin için en iyi seçim: ' + cname(h.k) + '.' };
    else if (h.a === 'trump') hintMark = { a: 'trump', s: h.s, text: 'En güçlü rengin ' + SUIT_TR[h.s] + ': onu koz yap.' };
    else if (h.a === 'play') { var c = M.card(h.id); hintMark = { a: 'play', id: h.id, text: 'Önerilen kart: ' + cardName(c) + '.' }; sel = h.id; }
    sfx.tick(); render();
  };

  // ---------- elden kart seçme, sürükleme ----------
  var drag = null, lastTap = { id: null, t: 0 };
  $('hand').addEventListener('pointerdown', function (e) {
    var ce = e.target.closest('.card'); if (!ce || !V) return;
    audio();
    drag = { id: +ce.dataset.id, x: e.clientX, y: e.clientY, el: ce, ghost: null };
    try { ce.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
  });
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8 || !isMyTurn('play')) return;
      var r = drag.el.getBoundingClientRect();
      drag.ghost = cardEl(M.card(drag.id), 'ghost');
      drag.ghost.style.setProperty('--cw', r.width + 'px'); drag.ghost.style.setProperty('--ch', r.height + 'px');
      document.body.appendChild(drag.ghost); drag.el.classList.add('dim'); sfx.pick();
    }
    drag.ghost.style.left = (e.clientX - drag.ghost.offsetWidth / 2) + 'px';
    drag.ghost.style.top = (e.clientY - drag.ghost.offsetHeight / 2) + 'px';
  });
  document.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var d = drag; drag = null;
    if (d.ghost) {
      d.ghost.remove();
      var top = $('hand').getBoundingClientRect().top;
      if (e.clientY < top - 4) { sel = d.id; doPlay(d.id); } else render();
      return;
    }
    var nowT = Date.now();
    if (lastTap.id === d.id && nowT - lastTap.t < 330) { lastTap = { id: null, t: 0 }; doPlay(d.id); return; }
    lastTap = { id: d.id, t: nowT };
    if (sel === d.id && isMyTurn('play')) { doPlay(d.id); return; }
    if (isMyTurn('play') && !myLegal().some(function (x) { return x.id === d.id; })) { fail({ error: illegalReason(M.card(d.id)) }); return; }
    sel = d.id; sfx.pick(); render();
  });
  document.addEventListener('pointercancel', function () { if (drag && drag.ghost) drag.ghost.remove(); drag = null; if (V) render(); });

  // ================= süre =================
  function setDeadline() {
    if (!game || !game.timer || !st || st.over) { if (game) game.deadline = 0; return; }
    if (game.levels[st.turn]) { game.deadline = 0; return; }
    game.deadline = Date.now() + game.timer * 1000;
    refreshView();
  }
  function timerLoop() {
    var dl = V && !V.over && !hold ? V.deadline : 0, el = $('pl' + (V ? pos(V.turn) : 0));
    document.querySelectorAll('.plate .ring').forEach(function (r) { r.style.setProperty('--p', '0'); r.classList.remove('on', 'low'); });
    if (dl && el && game && V.turn >= 0) {
      var left = Math.max(0, dl - Date.now()), frac = left / ((game.timer || 30) * 1000), ring = el.querySelector('.ring');
      if (ring) { ring.classList.add('on'); ring.classList.toggle('low', left < 6000); ring.style.setProperty('--p', String(frac)); }
      if (V.turn === me && left < 5500 && left > 0 && Math.floor(left / 1000) !== timerLoop.last) { timerLoop.last = Math.floor(left / 1000); sfx.tick(); }
      if (left <= 0 && st && (game.mode !== 'online' || game.online.isHost) && !busy && !game.levels[st.turn]) autoMove(st.turn);
    }
    requestAnimationFrame(timerLoop);
  }
  requestAnimationFrame(timerLoop);
  function autoMove(seat) {
    if (busy || !st || st.over) return;
    game.deadline = 0;
    if (seat === me) toast('Süren doldu: senin yerine oynandı.');
    var mv = st.phase === 'choose' ? { a: 'choose', k: M.botChoose(st.hands[seat], game.allowed, 'normal') } : st.phase === 'trump' ? { a: 'trump', s: M.botTrump(st.hands[seat]) } : { a: 'play', id: M.botPlay(st, seat, 'normal') };
    var before = snapshot(), res = applyMove(st, seat, mv);
    if (res.r.ok) { if (seat === me) sel = null; afterMove(res, before); }
  }

  // ================= botlar =================
  // Oyun değişince (yeni oyun / online masa) bekleyen bot turu sessizce durur
  var gen = 0;
  function delay(ms) { var g = gen; return sleep(ms * game.speed).then(function () { if (g !== gen || !st) throw new Error('stale'); }); }
  function stopLocal() { gen++; st = null; V = null; busy = false; hold = null; hintMark = null; sel = null; if (game) game.deadline = 0; }
  async function botTurn(p) {
    var lv = game.levels[p] || 'normal', mv;
    busy = true; render();
    if (st.phase === 'choose') { await delay(1000); mv = { a: 'choose', k: M.botChoose(st.hands[p], game.allowed, lv) }; }
    else if (st.phase === 'trump') { await delay(800); mv = { a: 'trump', s: M.botTrump(st.hands[p]) }; }
    else { await delay(st.trick.length ? 520 : 680); mv = { a: 'play', id: M.botPlay(st, p, lv) }; }
    var g = gen, res = applyMove(st, p, mv);
    if (!res.r.ok) throw new Error('bot: ' + res.r.error);
    pushEvent(res.ev); refreshView();
    if (game.mode === 'online') publish();
    await showEvent(res.ev, null);
    if (g !== gen) throw new Error('stale');
  }
  var advancing = false, advanceAgain = false, dealing = null;
  async function advance() {
    if (advancing) { advanceAgain = true; return; }
    advancing = true;
    try {
      save();
      if (dealing) { await dealing; dealing = null; }
      while (st && !st.over && game.levels && game.levels[st.turn]) {
        await botTurn(st.turn);
        busy = false; refreshView(); render(); save();
      }
      busy = false;
      if (st && st.over) { advancing = false; return handEnd(); }
      setDeadline(); refreshView(); render();
      if (game.mode === 'online') publish();
    } catch (e) { busy = false; if (window.console && e.message !== 'stale') console.error(e); } finally {
      advancing = false;
      if (advanceAgain) { advanceAgain = false; advance(); }
    }
  }

  // ================= el / oyun =================
  var DAILY_K = ['el', 'kupa', 'erkek', 'kiz', 'son', 'rifki', 'koz'];
  function newLocalGame(cfg) {
    gen++;
    me = 0;
    var plan = M.newPlan(cfg.mode === 'daily' ? 'short' : cfg.len, cfg.mode === 'daily' ? 0 : Math.floor(Math.random() * 4));
    game = { mode: cfg.mode, name: cfg.name, names: [cfg.name || 'Sen'].concat(BOT_NAMES), levels: [null, cfg.level, cfg.level, cfg.level], level: cfg.level,
      len: cfg.len, plan: plan, hands: cfg.mode === 'daily' ? 1 : plan.hands, speed: cfg.speed, idx: 0, scores: [0, 0, 0, 0],
      opts: cfg.opts, timer: cfg.timer, token: null, bestHand: 0, clean: 0, events: [], seq: 0 };
    if (cfg.mode === 'daily') { game.day = todayKey(); lsSet('kng_daily_' + game.day, '1'); }
    startHand();
    post('start', { mode: cfg.mode }).then(function (j) { if (j && j.ok) game.token = j.token; }).catch(function () {});
  }
  function startHand() {
    var daily = game.mode === 'daily', seed = daily ? fnv1a('king-' + (game.day || todayKey())) : 1 + Math.floor(Math.random() * 0x7ffffffe);
    var chooser = daily ? 0 : M.chooserAt(game.plan, game.idx);
    game.allowed = daily ? [DAILY_K[seed % 7]] : M.allowed(game.plan, game.idx);
    st = M.newHand(seed, chooser, game.opts);
    game.events = []; game.deadline = 0; hold = null; sel = null; busy = false; hintMark = null;
    if (daily) { M.choose(st, 0, game.allowed[0], game.allowed); }
    refreshView();
    $('startModal').hidden = true; $('endModal').hidden = true; $('lobbyModal').hidden = true; $('sheetModal').hidden = true; fit();
    if (innerHeight < 760) { try { $('stageWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    save(); audio();
    dealing = playDeal((st.chooser + 3) % 4);
    if (daily) toast('Bugünün oyunu: ' + cname(st.contract) + (st.contract === 'koz' ? ' — koz rengini seç.' : '. İlk kart senden.'));
    else toast(chooser === me ? 'Oyunu sen seçiyorsun.' : 'Oyunu ' + names()[chooser] + ' seçiyor.');
    if (game.mode === 'online') publish();
    advance();
  }
  function handEnd() {
    var res = st.result;
    if (!res) return;
    if (!st._counted) {
      for (var i = 0; i < 4; i++) game.scores[i] += res.points[i];
      if (game.mode !== 'daily') M.record(game.plan, game.idx, res.contract, { trump: res.trump, points: res.points });
      st._counted = true; game.idx++;
      game.bestHand = Math.max(game.bestHand, res.points[me]);
      if (res.contract !== 'koz' && res.points[me] === 0) game.clean++;
      var stats = readJSON(K_STATS, { hands: 0, clean: 0, games: 0, gwon: 0 });
      stats.hands++; if (res.contract !== 'koz' && res.points[me] === 0) stats.clean++;
      lsSet(K_STATS, JSON.stringify(stats));
      game.finished = game.mode === 'daily' || game.idx >= game.hands;
      game.deadline = 0;
      if (game.mode === 'online') publish();
    }
    save();
    showEnd(res);
  }
  function showEnd(res) {
    var nm = names(), k = res.contract, last = !!game.finished, mine = res.points[me], c = res.chooser;
    hold = null; render();
    $('endLabel').textContent = game.mode === 'daily' ? 'Günlük el · ' + (game.day || todayKey()) : last ? 'Oyun bitti' : 'El ' + game.idx + ' / ' + game.hands + ' bitti';
    var title = cname(k) + (k === 'koz' && res.trump ? ' (' + SUIT_TR[res.trump] + ')' : '') + ' bitti';
    var sub = (c === me ? 'Sen seçtin. ' : nm[c] + ' seçti. ') + (res.early ? 'Cezalar erken bitti. ' : '') +
      (k === 'koz' ? 'Sen ' + res.tricks[me] + ' el aldın: ' + sgn(mine) + ' puan.' : mine ? 'Sen ' + units(k === 'son' ? 'son' : k, res.taken[me]) + ' aldın: ' + sgn(mine) + ' puan.' : 'Hiç ceza almadın, temiz geçtin! 👏');
    if (game.mode === 'daily') {
      title = 'Bugünkü elden ' + sgn(mine) + ' puan';
      sub = 'Bugünün oyunu: ' + cname(k) + '. Günlük sıralamada yüksek puan üste çıkar. Yarın yeni el!';
      if (!game._statsDone) { game._statsDone = true; submitResult(false, mine); }
      if (mine >= 0) sfx.win(); else sfx.lose();
    } else if (last) {
      var top = Math.max.apply(null, game.scores), best = game.scores.indexOf(top), won = game.scores[me] === top;
      title = won ? 'Kazandın! 🎉' : nm[best] + ' kazandı';
      sub = game.hands + ' el bitti: ' + (won ? 'en çok puan sende (' + sgn(game.scores[me]) + ').' : 'sen ' + sgn(game.scores[me]) + ' puanla bitirdin.');
      if (!game._statsDone) {
        game._statsDone = true;
        var s2 = readJSON(K_STATS, { hands: 0, clean: 0, games: 0, gwon: 0 });
        s2.games++; if (won) s2.gwon++; lsSet(K_STATS, JSON.stringify(s2));
        submitResult(won, game.scores[me]);
      }
      if (won) sfx.win(); else sfx.lose();
    } else if (mine > 0 || (k !== 'koz' && mine === 0)) sfx.win();
    $('endTitle').textContent = title; $('endSub').textContent = sub;
    var order = [0, 1, 2, 3];
    if (game.mode !== 'daily' && last) order.sort(function (x, y) { return game.scores[y] - game.scores[x]; });
    $('endRows').innerHTML = order.map(function (i) {
      var d = res.points[i], tot = game.mode === 'daily' ? '—' : sgn(game.scores[i]);
      var got = k === 'koz' || k === 'el' ? res.tricks[i] + ' el' : units(k, res.taken[i]);
      return '<tr class="' + (d > 0 ? 'win' : d < 0 ? 'lose' : '') + (i === me ? ' me' : '') + '"><td><b>' + esc(nm[i]) + '</b>' + (i === c ? '<small>oyunu seçti</small>' : '') + '</td>' +
        '<td class="n">' + got + '</td><td class="n d">' + sgn(d) + '</td><td class="n">' + tot + '</td></tr>';
    }).join('');
    var client = game.mode === 'online' && !game.online.isHost;
    $('nextBtn').hidden = client && !last;
    $('nextBtn').textContent = last ? 'Yeni oyun' : 'Sonraki el';
    $('endWait').hidden = !(client && !last);
    $('endModal').hidden = false;
  }
  // ---------- puan cetveli ----------
  function renderSheet() {
    var pl = game && game.plan; if (!pl) { $('sheetBody').innerHTML = '<p class="muted">Cetvel oyun başlayınca dolar.</p>'; return; }
    var nm = names(), tot = [0, 0, 0, 0];
    var head = '<tr><th>El · oyun</th>' + nm.map(function (n, i) { return '<th class="' + (i === me ? 'me' : '') + '">' + esc(n) + '</th>'; }).join('') + '</tr>';
    var rows = pl.log.map(function (x) {
      var pts = x.points || [0, 0, 0, 0];
      pts.forEach(function (v, i) { tot[i] += v; });
      return '<tr><td>' + (x.i + 1) + '. ' + cname(x.k) + (x.trump ? ' ' + SUIT_TR[x.trump] : '') + '<small>' + esc(nm[x.p]) + ' seçti</small></td>' +
        pts.map(function (v) { return '<td class="' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '') + '">' + (v ? sgn(v) : '·') + '</td>'; }).join('') + '</tr>';
    }).join('');
    if (V && !V.over && V.contract) rows += '<tr><td>' + (game.idx + 1) + '. ' + cname(V.contract) + '<small>oynanıyor</small></td>' + [0, 1, 2, 3].map(function () { return '<td>…</td>'; }).join('') + '</tr>';
    var totRow = '<tr class="tot"><td>Toplam</td>' + game.scores.map(function (v) { return '<td class="' + (v > 0 ? 'pos' : v < 0 ? 'neg' : '') + '">' + sgn(v) + '</td>'; }).join('') + '</tr>';
    var left = M.CEZA.map(function (k) { var r = pl.cezaMax - pl.used[k]; return '<span class="' + (r ? '' : 'done') + '">' + cname(k) + ' · ' + r + '</span>'; }).join('') +
      nm.map(function (n, i) { var r = pl.kozPer - pl.kozUsed[i]; return '<span class="' + (r ? '' : 'done') + '">' + esc(n) + ' koz · ' + r + '</span>'; }).join('');
    $('sheetBody').innerHTML = '<div class="sheetw"><table class="sheet"><thead>' + head + '</thead><tbody>' + rows + totRow + '</tbody></table></div>' +
      '<div class="label" style="margin-top:16px">Kalan oyunlar</div><div class="left">' + left + '</div>';
  }
  function toggleSheet(on) {
    if (on == null) on = $('sheetModal').hidden;
    if (on) { renderSheet(); $('sheetModal').hidden = false; } else $('sheetModal').hidden = true;
  }
  $('sheetBtn').onclick = function () { if (game && game.mode !== 'daily') toggleSheet(true); };
  $('sheetClose').onclick = function () { toggleSheet(false); };
  $('sheetModal').addEventListener('click', function (e) { if (e.target === this) toggleSheet(false); });
  $('nextBtn').onclick = function () {
    audio();
    if (game.finished) {
      if (game.mode === 'online') lsDel(K_ONLINE); else lsDel(K_SAVE);
      stopOnline(); showStart(); return;
    }
    startHand();
  };
  function submitResult(won, total) {
    var nm = game.name;
    if (!game.token || !validName(nm)) { if (game.mode === 'daily' && !validName(nm)) toast('Günlük sıralamaya girmek için başlangıçta adını yaz.'); return; }
    post('submit', { token: game.token, name: nm, mode: game.mode, level: game.mode === 'online' ? 'mixed' : game.level, hands: Math.max(1, Math.min(20, game.idx)),
      total: total, won: won, bestOpen: Math.max(0, game.bestHand), finished: game.clean })
      .then(function (j) {
        if (j && j.ok) { if (j.rank) toast('Günlük el sıralamasında ' + j.rank + '. oldun!'); loadBoard(); }
        else if (j && j.error === 'daily_done') toast('Bugünkü eli zaten oynamıştın; skor kaydedilmedi.');
      }).catch(function () {});
  }

  // ================= başlangıç penceresi =================
  function seg(id, attr) {
    var el = $(id);
    el.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; el.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); });
    return {
      get: function () { var b = el.querySelector('[aria-pressed="true"]'); return b ? b.dataset[attr] : null; },
      set: function (v) { el.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset[attr] === String(v) ? 'true' : 'false'); }); }
    };
  }
  var segHands = seg('handsSeg', 'h'), segSpeed = seg('speedSeg', 's'), segLevel = seg('levelSeg', 'l'), segTimer = seg('timerSeg', 't');
  var MODE = 'bot';
  function setTab(m) {
    MODE = m;
    document.querySelectorAll('#modeTabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.m === m ? 'true' : 'false'); });
    document.querySelectorAll('.mpane').forEach(function (p) { p.hidden = p.dataset.m !== m; });
    $('rulesBox').hidden = m === 'daily';
    var done = lsGet('kng_daily_' + todayKey());
    $('startBtn').textContent = m === 'online' ? 'Masa kur' : m === 'daily' ? (done ? 'Bugün oynadın' : 'Günlük eli oyna') : 'Oyuna başla';
    $('startBtn').disabled = m === 'daily' && !!done;
  }
  document.querySelectorAll('#modeTabs button').forEach(function (b) { b.onclick = function () { setTab(b.dataset.m); }; });
  function readOpts() { return { strict: $('optStrict').checked, kozBreak: $('optKoz').checked }; }
  function showStart() {
    $('nameIn').value = lsGet('king_name') || lsGet('batak_name') || lsGet('okey_name') || lsGet('bp_name') || '';
    segHands.set(lsGet('kng_len') || 'full'); segSpeed.set(lsGet('king_speed') || '1'); segLevel.set(lsGet('king_level') || 'normal');
    segTimer.set(lsGet('king_timer') || '0');
    var o = M.opts(readJSON('kng_opts', M.DEFAULTS));
    $('optStrict').checked = o.strict; $('optKoz').checked = o.kozBreak;
    var stats = readJSON(K_STATS, null), rn = $('resumeNote');
    if (stats && stats.hands) { rn.hidden = false; rn.textContent = 'Şimdiye kadar ' + stats.games + ' oyun, ' + stats.gwon + ' galibiyet · ' + stats.hands + ' el, ' + stats.clean + ' kez cezadan temiz çıktın.'; }
    else rn.hidden = true;
    setTab(MODE);
    $('endModal').hidden = true; $('lobbyModal').hidden = true; $('startModal').hidden = false;
  }
  $('startBtn').onclick = function () {
    audio();
    var n = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 16);
    if (n) { lsSet('king_name', n); if (!lsGet('bp_name') && validName(n)) lsSet('bp_name', n); }
    var opts = readOpts();
    lsSet('kng_len', segHands.get()); lsSet('king_speed', segSpeed.get()); lsSet('king_level', segLevel.get()); lsSet('king_timer', segTimer.get());
    lsSet('kng_opts', JSON.stringify(opts));
    if (MODE === 'online') { if (!validName(n)) { toast('Online masa için 2–16 karakterlik bir ad yaz.'); $('nameIn').focus(); return; } return createTable(n, opts); }
    if (MODE === 'daily') { if (lsGet('kng_daily_' + todayKey())) return; return newLocalGame({ mode: 'daily', name: n || 'Sen', level: 'normal', len: 'short', speed: +segSpeed.get() || 1, opts: M.DEFAULTS, timer: 0 }); }
    newLocalGame({ mode: 'bot', name: n || 'Sen', level: segLevel.get() || 'normal', len: segHands.get() || 'full', speed: +segSpeed.get() || 1, opts: opts, timer: +segTimer.get() || 0 });
  };
  $('nameIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('startBtn').click(); });
  $('newBtn').onclick = function () { showStart(); };
  $('startClose').onclick = function () { if (game && V) $('startModal').hidden = true; };

  // ================= online masa =================
  var hostTimer = 0, clientTimer = 0, lobbyTimer = 0, lastMoveId = 0;
  function inviteUrl(code) { return location.origin + location.pathname + '?masa=' + code; }
  async function createTable(name, opts) {
    try {
      var j = await post('t_create', { name: name, opts: { game: 'king', opts: opts, len: segHands.get() || 'full', timer: +segTimer.get() || 0, speed: +segSpeed.get() || 1, level: segLevel.get() || 'normal' } });
      if (!j.ok) return toast(j.error === 'bad_name' ? 'Bu ad kullanılamaz.' : 'Masa kurulamadı.');
      stopLocal();
      game = { mode: 'online', name: name, online: { code: j.code, hostKey: j.hostKey, seatKey: j.seatKey, seat: 0, isHost: true }, lobby: true };
      me = 0; lsSet(K_ONLINE, JSON.stringify({ v: 1, lobby: true, game: game }));
      showLobby();
    } catch (e) { toast('Sunucuya ulaşılamadı.'); }
  }
  async function joinTable(code, name) {
    try {
      var j = await post('t_join', { code: code, name: name });
      if (!j.ok) return toast({ no_table: 'Masa bulunamadı.', full: 'Masa dolu.', started: 'Bu masada oyun başlamış.', name_taken: 'Bu ad masada var, başka bir ad seç.', bad_name: 'Bu ad kullanılamaz.' }[j.error] || 'Masaya katılınamadı.');
      stopLocal();
      game = { mode: 'online', name: name, online: { code: j.code, seatKey: j.seatKey, seat: j.seat, isHost: false }, lobby: true };
      me = j.seat; lsSet(K_ONLINE, JSON.stringify({ v: 1, lobby: true, game: game }));
      showLobby();
    } catch (e) { toast('Sunucuya ulaşılamadı.'); }
  }
  function showLobby() {
    $('startModal').hidden = true; $('endModal').hidden = true; $('lobbyModal').hidden = false;
    $('lobbyCode').textContent = game.online.code; $('lobbyLink').value = inviteUrl(game.online.code);
    $('lobbyStart').hidden = !game.online.isHost; $('lobbyWait').hidden = game.online.isHost;
    clearInterval(lobbyTimer); lobbyTimer = setInterval(pollLobby, 1500); pollLobby();
  }
  async function pollLobby() {
    if (!game || !game.lobby) { clearInterval(lobbyTimer); return; }
    try {
      var j = await get('t_lobby', '&code=' + game.online.code); if (!j.ok) return;
      $('lobbySeats').innerHTML = j.seats.map(function (s, i) {
        return '<li class="' + (s ? 'on' : '') + (i === me ? ' me' : '') + '"><span class="ls-av">' + (s ? esc(s.name.charAt(0)) : '?') + '</span><b>' + (s ? esc(s.name) : 'Boş koltuk') + '</b><small>' + (i === 0 ? 'Masa sahibi' : s ? 'Hazır' : 'Başlayınca bot oturur') + '</small></li>';
      }).join('');
      if (j.status !== 'lobby' && !game.online.isHost) { clearInterval(lobbyTimer); game.lobby = false; startClient(j); }
    } catch (e) {}
  }
  $('lobbyCopy').onclick = function () {
    var v = $('lobbyLink').value;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Davet bağlantısı kopyalandı.'); }).catch(function () { $('lobbyLink').select(); });
  };
  $('lobbyWa').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent('King masama gel: ' + $('lobbyLink').value), '_blank', 'noopener'); };
  $('lobbyLeave').onclick = function () { clearInterval(lobbyTimer); stopOnline(); lsDel(K_ONLINE); game = null; $('lobbyModal').hidden = true; showStart(); };
  $('lobbyStart').onclick = async function () {
    if (!game || !game.online.isHost) return;
    var j = await post('t_start', { code: game.online.code, hostKey: game.online.hostKey });
    if (!j.ok) return toast('Başlatılamadı.');
    clearInterval(lobbyTimer); game.lobby = false;
    var lv = segLevel.get() || 'normal';
    game.names = j.seats.map(function (s) { return s.name; });
    game.levels = j.seats.map(function (s, i) { return i > 0 && s.bot ? lv : null; });
    game.len = segHands.get() || 'full'; game.plan = M.newPlan(game.len, Math.floor(Math.random() * 4));
    game.level = lv; game.hands = game.plan.hands; game.speed = +segSpeed.get() || 1; game.timer = +segTimer.get() || 0;
    if (!game.timer && game.levels.filter(function (x) { return !x; }).length > 1) game.timer = 40; // online'da takılmayı önle
    game.opts = readJSON('kng_opts', M.DEFAULTS); game.idx = 0; game.scores = [0, 0, 0, 0];
    game.bestHand = 0; game.clean = 0; game.ver = 0; game.errs = {}; game.events = []; game.seq = 0;
    post('start', { mode: 'online' }).then(function (x) { if (x && x.ok) game.token = x.token; }).catch(function () {});
    startHost();
    startHand();
  };
  function startHost() { clearInterval(hostTimer); hostTimer = setInterval(hostPoll, 800); }
  var publishing = false, publishAgain = false;
  async function publish() {
    if (!game || game.mode !== 'online' || !game.online.isHost || !st) return;
    if (publishing) { publishAgain = true; return; }
    publishing = true;
    game.ver = (game.ver || 0) + 1;
    var priv = {};
    for (var s = 1; s < 4; s++) if (!game.levels[s]) priv[s] = { hand: st.hands[s] };
    try { await post('t_state', { code: game.online.code, hostKey: game.online.hostKey, ver: game.ver, pub: buildPub(), priv: priv, over: !!game.finished }); } catch (e) {}
    publishing = false;
    if (publishAgain) { publishAgain = false; publish(); }
  }
  var hostBusy = false;
  async function hostPoll() {
    if (!game || game.mode !== 'online' || !game.online.isHost || hostBusy) return;
    hostBusy = true;
    try {
      var j = await post('t_moves', { code: game.online.code, hostKey: game.online.hostKey, after: lastMoveId });
      if (j && j.ok) {
        for (var i = 0; i < j.moves.length; i++) {
          // animasyon sürerken gelen hamle kuyrukta bekler, sonraki yoklamada işlenir
          if (busy || hold || advancing) break;
          var mv = j.moves[i]; lastMoveId = mv.id;
          if (!st || st.over || st.turn !== mv.seat || game.levels[mv.seat]) {
            if (st && !st.over) { game.errs[mv.seat] = { n: (game.errs[mv.seat] ? game.errs[mv.seat].n : 0) + 1, msg: 'not_your_turn' }; publish(); }
            continue;
          }
          var res = applyMove(st, mv.seat, mv.move || {});
          if (!res.r.ok) { game.errs[mv.seat] = { n: (game.errs[mv.seat] ? game.errs[mv.seat].n : 0) + 1, msg: res.r.error }; publish(); continue; }
          await afterMove(res, null);
        }
        game.lastMoveId = lastMoveId;
      }
    } catch (e) {}
    hostBusy = false;
  }
  function startClient(lobbyInfo) {
    game.names = lobbyInfo.seats.map(function (s) { return s ? s.name : ''; });
    game.levels = lobbyInfo.seats.map(function (s) { return s && s.bot ? 'normal' : null; });
    game.scores = [0, 0, 0, 0]; game.idx = 0; game.hands = 20; game.speed = 1; game.ver = 0; game.lastEvent = 0; game.errSeen = 0;
    $('lobbyModal').hidden = true; $('startModal').hidden = true;
    clearInterval(clientTimer); clientTimer = setInterval(clientPoll, 1000); clientPoll();
  }
  var polling = false;
  async function clientPoll() {
    if (!game || game.mode !== 'online' || game.online.isHost || polling) return;
    polling = true;
    try {
      var j = await post('t_poll', { code: game.online.code, seat: me, seatKey: game.online.seatKey, ver: game.ver || 0 });
      if (j && j.ok) {
        if (j.hostAlive !== game.hostAlive) { game.hostAlive = j.hostAlive; if (V) render(); }
        if (j.pub) await applyRemote(j);
      } else if (j && j.error === 'no_table') { toast('Masa kapandı.'); stopOnline(); lsDel(K_ONLINE); }
    } catch (e) { if (window.console) console.error(e); }
    polling = false;
  }
  async function applyRemote(j) {
    var pub = j.pub, before = V ? snapshot() : null, first = !V;
    game.ver = j.ver; game.names = pub.names; game.scores = pub.scores; game.idx = pub.idx; game.hands = pub.hands; game.finished = pub.finished;
    game.plan = pub.plan; game.allowed = pub.allowed || [];
    game.levels = pub.levels || j.seats.map(function (s) { return s && s.bot ? 'normal' : null; }); game.pending = false;
    var newHand = !V || pub.hid !== V.hid;
    V = viewFromPub(pub, j.priv);
    if (newHand) { hold = null; sel = null; hintMark = null; $('endModal').hidden = true; }
    var fresh = newHand && !(pub.events && pub.events.length) && !pub.over;
    if (sel != null && !V.myHand.some(function (c) { return c.id === sel; })) sel = null;
    var evs = (pub.events || []).filter(function (e) { return e.seq > (game.lastEvent || 0); });
    if (newHand) evs = [];
    if (pub.events && pub.events.length) game.lastEvent = pub.events[pub.events.length - 1].seq;
    var e2 = pub.errs && pub.errs[me];
    if (e2 && e2.n > (game.errSeen || 0)) { game.errSeen = e2.n; fail({ error: e2.msg }); }
    if (fresh) await playDeal((V.chooser + 3) % 4); else render(newHand);
    for (var k = 0; k < evs.length; k++) await showEvent(evs[k], before);
    save();
    if (pub.over && pub.result && game._endShownIdx !== pub.idx) { game._endShownIdx = pub.idx; showEnd(pub.result); }
    if (!$('sheetModal').hidden) renderSheet();
    if (pub.finished) clearInterval(clientTimer);
  }
  function stopOnline() { clearInterval(hostTimer); clearInterval(clientTimer); clearInterval(lobbyTimer); }

  // ================= sıralama =================
  var lbData = null, lbTab = lsGet('kng_lbtab') || 'week';
  function loadBoard() { get('top').then(function (j) { if (j && j.ok) { lbData = j; renderBoard(); } else boardOff(); }).catch(boardOff); }
  function boardOff() { $('lbList').innerHTML = '<li class="empty">Sıralamaya şu an ulaşılamıyor.</li>'; }
  function renderBoard() {
    document.querySelectorAll('#lbTabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.t === lbTab ? 'true' : 'false'); });
    if (!lbData) return;
    $('lbGames').textContent = fmt(lbData.games) + ' oyun';
    var rows = lbData[lbTab] || [], my = (lsGet('king_name') || '').toLocaleLowerCase('tr');
    if (!rows.length) { $('lbList').innerHTML = '<li class="empty">' + (lbTab === 'daily' ? 'Bugünün günlük elini henüz kimse oynamadı. İlk sen ol!' : 'Henüz galibiyet yok. İlk kazanan sen ol!') + '</li>'; return; }
    $('lbList').innerHTML = rows.map(function (r, i) {
      var val = lbTab === 'daily' ? sgn(r.score) + ' puan' : r.wins + ' galibiyet', sub = lbTab === 'daily' ? 'bugünkü el' : r.games + ' oyun';
      return '<li class="' + (i < 3 ? 'm' + (i + 1) : '') + (r.name.toLocaleLowerCase('tr') === my ? ' me' : '') + '"><span class="rk">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</span><button class="pn" data-name="' + esc(r.name) + '">' + esc(r.name) + '</button><small>' + sub + '</small><b>' + val + '</b></li>';
    }).join('');
  }
  document.querySelectorAll('#lbTabs button').forEach(function (b) { b.onclick = function () { lbTab = b.dataset.t; lsSet('kng_lbtab', lbTab); renderBoard(); }; });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.pn'); if (!b) return;
    var n = b.dataset.name; $('profModal').hidden = false; $('profBody').innerHTML = '<p class="muted">Yükleniyor…</p>';
    get('profile', '&name=' + encodeURIComponent(n)).then(function (j) {
      if (!j || !j.ok) { $('profBody').innerHTML = '<p>' + esc(n) + ' için kayıt yok.</p>'; return; }
      var rate = j.games ? Math.round(j.wins / j.games * 100) : 0;
      var st2 = function (v, l) { return '<div><b>' + v + '</b><span>' + l + '</span></div>'; };
      $('profBody').innerHTML = '<h2>' + esc(j.name) + '</h2><p class="muted">İlk oyun ' + esc(j.first || '—') + '</p><div class="pstats">' +
        st2(fmt(j.games), 'Oyun') + st2(fmt(j.wins), 'Galibiyet') + st2('%' + rate, 'Kazanma') + st2(j.bestOpen ? sgn(j.bestOpen) : '—', 'En iyi el') +
        st2(fmt(j.finished), 'Temiz ceza') + st2(j.bestDaily != null ? sgn(j.bestDaily) : '—', 'En iyi günlük el') + '</div>';
    }).catch(function () { $('profBody').innerHTML = '<p>Sunucuya ulaşılamadı.</p>'; });
  });
  $('profClose').onclick = function () { $('profModal').hidden = true; };
  $('profModal').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
  loadBoard();

  // ================= klavye =================
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'Escape') { if (!$('sheetModal').hidden) { toggleSheet(false); return; } if (!$('profModal').hidden) { $('profModal').hidden = true; return; } if (!$('startModal').hidden && game && V) { $('startModal').hidden = true; return; } }
    if (!$('sheetModal').hidden && (e.key === 'c' || e.key === 'C')) { toggleSheet(false); e.preventDefault(); return; }
    if (!$('startModal').hidden || !$('endModal').hidden || !$('lobbyModal').hidden || !$('profModal').hidden || !$('sheetModal').hidden || !V) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (deal) { skipDeal(); e.preventDefault(); return; }
    var k = e.key.toLocaleLowerCase('tr'), done = true;
    if (k === 'h') $('hintBtn').click();
    else if (k === 'm') $('muteBtn').click();
    else if (k === 'f') $('fsBtn').click();
    else if (k === 'n') $('newBtn').click();
    else if (k === 'c') { if (game.mode !== 'daily') toggleSheet(true); }
    else if (isMyTurn('choose') && /^[1-7]$/.test(k)) doChoose(k === '7' ? 'koz' : M.CEZA[+k - 1]);
    else if (isMyTurn('trump') && /^[1-4]$/.test(k)) doTrump(M.SUITS[+k - 1]);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      var pool = isMyTurn('play') ? myLegal() : V.myHand;
      var ord = V.myHand.filter(function (c) { return pool.some(function (x) { return x.id === c.id; }); }).map(function (c) { return c.id; });
      if (!ord.length) return;
      var i = ord.indexOf(sel), d = e.key === 'ArrowRight' ? 1 : -1;
      sel = ord[i < 0 ? (d > 0 ? 0 : ord.length - 1) : (i + d + ord.length) % ord.length]; sfx.pick(); render();
    }
    else if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp') && sel != null && isMyTurn('play')) doPlay(sel);
    else done = false;
    if (done) e.preventDefault();
  });

  // ================= kontroller sekmeleri =================
  function ctlTab(mob) {
    $('tabDesk').setAttribute('aria-selected', mob ? 'false' : 'true');
    $('tabMob').setAttribute('aria-selected', mob ? 'true' : 'false');
    $('ctlDesk').hidden = !!mob; $('ctlMob').hidden = !mob;
  }
  $('tabDesk').onclick = function () { ctlTab(false); };
  $('tabMob').onclick = function () { ctlTab(true); };
  if (window.matchMedia && matchMedia('(pointer:coarse)').matches) ctlTab(true);

  // ================= PWA =================
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname))) {
    addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  var installEvt = null;
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; $('instBtn').hidden = false; });
  $('instBtn').onclick = function () { if (!installEvt) return; installEvt.prompt(); installEvt.userChoice.finally(function () { installEvt = null; $('instBtn').hidden = true; }); };

  // ================= sohbet (assets/okey-sohbet.js) =================
  window.OkeySohbetHost = {
    ctx: function () {
      if (!game) return null;
      var on = game.mode === 'online' && game.online;
      return { online: !!on, code: on ? game.online.code : null, seat: me, seatKey: on ? game.online.seatKey : null, me: me,
        name: names()[me] || 'Sen', names: names(), bots: game.levels || [], api: API };
    },
    say: function (seat, text, ms) { if (V) say(seat, text, ms); },
    sound: function () { audio(); sfx.tick(); }
  };

  // ================= açılış =================
  var params = new URLSearchParams(location.search), joinCode = (params.get('masa') || '').toUpperCase();
  if (params.get('test') === '1') window.__kg = { get st() { return st; }, get V() { return V; }, get game() { return game; }, M: M };
  function boot() {
    var on = readJSON(K_ONLINE, null);
    if (joinCode && /^[A-Z0-9]{6}$/.test(joinCode) && !(on && on.game && on.game.online && on.game.online.code === joinCode)) {
      MODE = 'online'; showStart(); $('joinCode').value = joinCode; setTab('online');
      toast('Masaya katılmak için adını yaz ve Katıl\'a bas.');
      return;
    }
    if (on && on.game && on.game.mode === 'online') {
      game = on.game; me = game.online.seat;
      if (on.lobby || game.lobby) { showLobby(); return; }
      if (game.online.isHost && on.st) { st = on.st; refreshView(); render(); startHost(); toast('Masaya geri döndün.'); publish(); if (st.over) handEnd(); else advance(); return; }
      if (!game.online.isHost) { game.ver = 0; game.lastEvent = 0; clearInterval(clientTimer); clientTimer = setInterval(clientPoll, 1000); clientPoll(); toast('Masaya geri döndün.'); return; }
    }
    var sv = readJSON(K_SAVE, null);
    if (sv && sv.v === 1 && sv.st) {
      game = sv.game; me = 0; st = sv.st; refreshView(); render();
      if (!st.over) { toast('Kaldığın yerden devam ediyorsun.'); advance(); }
      else if (!game.finished) handEnd();
      else showStart();
      return;
    }
    showStart();
  }
  $('joinBtn').onclick = function () {
    var n = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 16), c = $('joinCode').value.trim().toUpperCase();
    if (!validName(n)) { toast('Önce 2–16 karakterlik bir ad yaz.'); $('nameIn').focus(); return; }
    if (!/^[A-Z0-9]{6}$/.test(c)) { toast('Masa kodu 6 karakter olmalı.'); return; }
    lsSet('king_name', n); audio(); joinTable(c, n);
  };
  boot();
})();
