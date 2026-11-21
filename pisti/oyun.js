/* Pişti — arayüz: masa, yığın, deste, kartlar, botlar, animasyonlar, ipucu, süre, günlük el, sıralama, online masa (2 ya da 4 kişi).
   Kurallar motor.js'te. Online masada oyunu masa sahibinin tarayıcısı yönetir; sunucu (api/) yalnızca aktarır. */
(function () {
  'use strict';
  var M = window.PistiKural;
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

  var K_SAVE = 'pst_save', K_ONLINE = 'pst_online', K_STATS = 'pst_stats';
  var BOT_NAMES = ['Ayşe', 'Mehmet', 'Zeynep'];
  var LEVEL_TR = { easy: 'Kolay', normal: 'Orta', hard: 'Zor' };
  var SUIT_TR = { S: 'Maça', H: 'Kupa', D: 'Karo', C: 'Sinek' };
  var RANK_TR = { 11: 'Vale', 12: 'Kız', 13: 'Papaz', 14: 'As' };
  var RANK_LB = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  // game: oyun ayarları ve puanlar · st: motor durumu (yerel ya da masa sahibi) · V: ekrana çizilen görünüm · me: benim koltuğum
  // hold: animasyon sırasında ortada gösterilen yığın (V'deki son durumdan önceki görünüm)
  var game = null, st = null, V = null, me = 0, sel = null, busy = false, hold = null, hintMark = null;

  // ================= tema · ses =================
  var root = document.documentElement;
  $('themeBtn').onclick = function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); lsSet('theme', n);
  };
  var actx = null, master = null, muted = lsGet('pisti_mute') === '1', vol = Math.min(1, Math.max(0, +(lsGet('pisti_vol') || 0.8))), noiseBuf = null;
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
  $('vol').addEventListener('input', function () { vol = this.value / 100; lsSet('pisti_vol', String(vol)); if (vol > 0) { muted = false; lsSet('pisti_mute', '0'); } audio(); syncSound(); });
  $('vol').addEventListener('change', function () { sfx.card(); });
  $('muteBtn').onclick = function () { muted = !muted; lsSet('pisti_mute', muted ? '1' : '0'); syncSound(); };
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
    take: function () { snap(0.35, 2400); snap(0.3, 2000, 0.06); snap(0.25, 1700, 0.12); },
    pisti: function () { [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, 0.18, 'square', 0.04, i * 0.06); tone(f / 2, 0.22, 'triangle', 0.05, i * 0.06); }); },
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
  function N() { return game && game.n === 4 ? 4 : 2; }
  // 2 kişide rakip karşıda (üstte) oturur; 4 kişide sıra sağa döner
  function pos(seat) { return N() === 2 ? (seat === me ? 0 : 2) : (seat - me + 4) % 4; }
  function seatAt(p) { return N() === 2 ? (p === 0 ? me : p === 2 ? 1 - me : -1) : (p + me) % 4; }
  function teamOf(seat) { return N() === 4 ? seat % 2 : seat; }
  function teamName(t) { var nm = names(); return N() === 4 ? nm[t] + ' & ' + nm[t + 2] : nm[t]; }
  var PUBF = ['n', 'turn', 'dealer', 'closed', 'lastTaker', 'over', 'result', 'seen', 'round', 'pistis'];
  function pubPile(s) { return s.pile.map(function (c, i) { return i < s.closed ? null : c; }); }
  function viewFromSt(s) {
    var v = { myHand: s.hands[me], pile: pubPile(s), counts: s.hands.map(function (h) { return h.length; }), caps: s.captured.map(function (h) { return h.length; }),
      deckCount: s.deck.length, deadline: game.deadline || 0, hid: s.seed };
    PUBF.forEach(function (k) { v[k] = s[k]; });
    return v;
  }
  function buildPub() {
    var p = { names: game.names, scores: game.scores, idx: game.idx, finished: !!game.finished, levels: game.levels, target: game.target, gn: game.n,
      pile: pubPile(st), counts: st.hands.map(function (h) { return h.length; }), caps: st.captured.map(function (h) { return h.length; }),
      deckCount: st.deck.length, deadline: game.deadline || 0, hid: st.seed, events: game.events || [], errs: game.errs || {} };
    PUBF.forEach(function (k) { p[k] = st[k]; });
    return p;
  }
  function viewFromPub(pub, priv) {
    var v = { myHand: priv && priv.hand ? priv.hand : [], pile: pub.pile, counts: pub.counts, caps: pub.caps, deckCount: pub.deckCount, deadline: pub.deadline, hid: pub.hid };
    PUBF.forEach(function (k) { v[k] = pub[k]; });
    return v;
  }
  function refreshView() { if (st && (!game || game.mode !== 'online' || game.online.isHost)) V = viewFromSt(st); }
  // ipucu için motorun anlayacağı durum (benim elim + açık bilgiler)
  function fakeSt() {
    var hands = []; for (var q = 0; q < V.n; q++) hands.push(q === me ? V.myHand.slice() : new Array(V.counts[q]));
    var deck = []; deck.length = V.deckCount;
    return { n: V.n, hands: hands, pile: V.pile.slice(), closed: V.closed, deck: deck, seen: V.seen, turn: V.turn, over: V.over, captured: [], pistis: V.pistis };
  }

  // ================= kart görünümü =================
  function isRed(s) { return s === 'H' || s === 'D'; }
  function suitSVG(s, cls) { return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#s' + s + '"/></svg>'; }
  function cardName(c) { return SUIT_TR[c.s] + ' ' + (RANK_TR[c.r] || c.r); }
  function cardEl(c, cls) {
    var d = document.createElement('div');
    if (!c) { d.className = 'card back' + (cls ? ' ' + cls : ''); return d; }
    d.className = 'card' + (isRed(c.s) ? ' red' : '') + (cls ? ' ' + cls : '');
    d.dataset.id = c.id;
    var lb = RANK_LB[c.r] || String(c.r), art;
    if (c.r >= 11 && c.r <= 13) {
      // vale, kız, papaz: klasik İngiliz deseni (assets/kart-saray.webp; sütun renk S H D C, satır J Q K)
      // klasik İngiliz deseni kartın kendisi (köşe harfleri, çerçeve, figür olduğu gibi)
      d.className += ' court';
      d.style.backgroundPosition = (['S', 'H', 'D', 'C'].indexOf(c.s) * 100 / 3) + '% ' + ((c.r - 11) * 50) + '%';
      d.setAttribute('aria-label', cardName(c));
      return d;
    }
    if (c.r === 14) art = '<span class="ring"></span>' + suitSVG(c.s, 'big ace');
    else art = suitSVG(c.s, 'big');
    d.innerHTML = '<span class="ix"><b' + (lb.length > 1 ? ' class="t"' : '') + '>' + lb + '</b>' + suitSVG(c.s) + '</span>' + art;
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
  function rot(id) { return ((id * 37) % 23) - 11; }
  function render(fresh) {
    if (!V || !game) return;
    $('board').classList.toggle('two', N() === 2);
    $('handChip').innerHTML = game.mode === 'daily' ? 'Günlük el' : (game.mode === 'online' ? 'Masa ' + esc(game.online.code) + ' · ' : '') + 'El <b>' + (game.idx + (V.over ? 0 : 1)) + '</b>';
    $('targetChip').innerHTML = game.mode === 'daily' ? 'Tek el' : 'Hedef <b>' + game.target + '</b>';
    for (var p = 0; p < 4; p++) renderPlate(p);
    renderPile(); renderDeck(); renderScore(); renderHand(fresh); renderHint();
    $('hintBtn').disabled = !isMyTurn();
  }
  function renderPlate(p) {
    var el = $('pl' + p), seat = seatAt(p);
    if (seat < 0 || seat >= V.n) { el.innerHTML = ''; return; }
    var nm = names()[seat], keep = el.querySelector('.say');
    el.classList.toggle('turn', V.turn === seat && !V.over);
    var pi = V.pistis[seat] || { normal: 0, vale: 0 }, pc = pi.normal + pi.vale;
    var badge = seat === V.dealer ? '<span class="badge dl">DAĞITAN</span>' : '';
    var line = V.caps[seat] + ' kart' + (pc ? ' · <b>' + pc + ' pişti</b>' : '');
    if (N() === 4) line += ' · ' + (teamOf(seat) === teamOf(me) ? 'takımın' : 'rakip');
    var lvl = game.levels && game.levels[seat] ? ' · ' + LEVEL_TR[game.levels[seat]] : '';
    var fan = '';
    if (p !== 0) { var n = Math.min(4, V.counts[seat]); for (var i = 0; i < n; i++) fan += '<i></i>'; }
    el.innerHTML = '<div class="av"><div class="ring"></div>' + avatarSVG(seat) + badge + '</div>' +
      '<div class="np"><b>' + esc(nm) + '</b><small>' + line + esc(lvl) + '</small></div><div class="fan">' + fan + '</div>';
    el.insertBefore(keep || Object.assign(document.createElement('div'), { className: 'say' }), el.firstChild);
  }
  function renderPile() {
    var cards = hold ? hold.pile : V.pile, el = $('pile'); el.innerHTML = '';
    var start = Math.max(0, cards.length - 9);
    for (var i = start; i < cards.length; i++) {
      var c = cards[i], d = cardEl(c, i === cards.length - 1 ? 'topc' : '');
      var k = i - start, r = c ? rot(c.id) : (i - 1) * 4;
      d.style.transform = 'translate(' + (c ? (k % 3 - 1) * 5 : -6 + i * 3) + 'px,' + (c ? -k * 1.2 : -i * 2) + 'px) rotate(' + r + 'deg)';
      el.appendChild(d);
    }
    $('pileCnt').textContent = cards.length ? 'Yerde ' + cards.length + ' kart' : 'Yer boş';
  }
  function renderDeck() {
    $('deckCnt').textContent = V.deckCount;
    $('deckBox').classList.toggle('empty', !V.deckCount);
  }
  function renderScore() {
    var T = 2, html = '<div class="st"><span>' + (game.mode === 'daily' ? 'Bu el' : 'Puan') + '</span><span>' + (game.mode === 'daily' ? '' : 'hedef ' + game.target) + '</span></div>';
    for (var t = 0; t < T; t++) {
      var cards = 0, pis = 0;
      for (var q = 0; q < V.n; q++) if (teamOf(q) === t) { cards += V.caps[q]; var x = V.pistis[q] || { normal: 0, vale: 0 }; pis += x.normal * 10 + x.vale * 20; }
      var sc = game.mode === 'daily' ? pis : game.scores[t];
      var w = game.mode === 'daily' ? 0 : Math.min(100, Math.max(0, sc / game.target * 100));
      html += '<div class="tr"><div class="tn"><span>' + esc(t === teamOf(me) ? (N() === 4 ? 'Sizin takım' : 'Sen') : teamName(t)) + '</span><b>' + fmt(sc) + '</b></div>' +
        (game.mode === 'daily' ? '' : '<div class="bar"><i style="width:' + w + '%"></i></div>') + '<div class="tm">bu el ' + cards + ' kart' + (pis ? ' · pişti ' + pis : '') + '</div></div>';
    }
    $('scoreBox').innerHTML = html;
  }
  function renderHand(fresh) {
    var el = $('hand'), h = V.myHand, n = h.length, my = isMyTurn();
    el.classList.toggle('my', my);
    el.innerHTML = '';
    var CW = 92, W = 600, sp = 108, total = CW + (n - 1) * sp, x0 = (W - total) / 2;
    h.forEach(function (c, i) {
      var cls = (my ? 'ok' : '') + (sel === c.id ? ' sel' : '') + (hintMark && hintMark.id === c.id ? ' hintpulse' : '');
      var d = cardEl(c, cls), x = x0 + i * sp;
      d.style.left = x + 'px';
      if (fresh) { d.classList.add('deal'); d.style.animationDelay = (i * 70) + 'ms'; d.style.setProperty('--dx', (W / 2 - x - CW / 2) + 'px'); }
      el.appendChild(d);
    });
  }
  function renderHint() {
    var h = '';
    if (V.over || hold) h = '';
    else if (!isMyTurn()) h = waitingText();
    else if (hintMark && hintMark.text) h = '💡 ' + hintMark.text;
    else {
      var t = V.pile.length ? V.pile[V.pile.length - 1] : null;
      if (!t) h = 'Yer boş: bırakacağın kart tek kalacak, rakibin pişti yapmasın.';
      else if (V.pile.length === 1 && V.myHand.some(function (c) { return c.r === t.r; })) h = 'Pişti fırsatı! Aynı kartı at.';
      else h = 'Yerdeki ' + (RANK_TR[t.r] || t.r) + ': aynısını ya da vale atarsan ' + V.pile.length + ' kartı alırsın.';
    }
    $('hint').textContent = h;
  }
  function waitingText() {
    if (!V) return '';
    var n = names()[V.turn];
    if (game.mode === 'online' && game.online && !game.online.isHost && !game.hostAlive) return 'Masa sahibinin bağlantısı bekleniyor…';
    return 'Sıra ' + n + '\'' + bulunma(n) + '…';
  }
  function say(seat, text, ms) {
    var e = $('pl' + pos(seat)) && $('pl' + pos(seat)).querySelector('.say'); if (!e) return;
    e.textContent = text; e.classList.add('on'); e.classList.toggle('chatmsg', !!ms);
    clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('on', 'chatmsg'); }, ms || 1500 * (game ? game.speed : 1) + 300);
  }
  var toastT = 0;
  function toast(m) { var e = $('toast'); e.textContent = m; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 3400); }
  function splash(big, small) {
    var e = $('splash'); e.innerHTML = big + (small ? '<small>' + small + '</small>' : '');
    e.classList.remove('on'); void e.offsetWidth; e.classList.add('on');
  }

  // ================= animasyon =================
  // sayfa gizliyken animasyon oynatma (tarayıcı kare çizmez, animasyon donar); oynatılanı da süresi dolunca bitmiş say
  var reduced = function () { return document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches; };
  function animDone(anim, ms) {
    return new Promise(function (res) { var done = false; function fin() { if (!done) { done = true; res(); } } anim.onfinish = fin; setTimeout(fin, ms + 250); });
  }
  function plateRect(seat) { var e = $('pl' + pos(seat)); var a = e && e.querySelector('.av'); return a ? a.getBoundingClientRect() : null; }
  function snapshot() {
    var r = {}; $('hand').querySelectorAll('.card').forEach(function (e) { r[e.dataset.id] = e.getBoundingClientRect(); });
    return { hand: r };
  }
  function flyer(c) {
    var k = boardScale(), g = cardEl(c, 'flyer');
    g.style.setProperty('--cw', 92 * k + 'px'); g.style.setProperty('--ch', 132 * k + 'px');
    g.style.width = 92 * k + 'px'; g.style.height = 132 * k + 'px';
    return g;
  }
  // kartı yığının en üstüne uçur
  function fly(c, from) {
    var to = $('pile').querySelector('.card:last-child');
    if (!from || !to || reduced()) return Promise.resolve();
    var k = boardScale(), w = 92 * k, h = 132 * k, tr = to.getBoundingClientRect();
    var g = flyer(c), cx = from.left + from.width / 2, cy = from.top + from.height / 2;
    g.style.left = (cx - w / 2) + 'px'; g.style.top = (cy - h / 2) + 'px';
    document.body.appendChild(g);
    var dx = tr.left + tr.width / 2 - cx, dy = tr.top + tr.height / 2 - cy, s0 = Math.max(0.35, from.width / w);
    to.style.visibility = 'hidden';
    var dur = 330 * Math.min(1.2, Math.max(0.7, game ? game.speed : 1));
    var anim = g.animate([{ transform: 'translate(0,0) scale(' + s0 + ') rotate(0)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(1) rotate(' + rot(c.id) + 'deg)' }],
      { duration: dur, easing: 'cubic-bezier(.25,.8,.3,1)' });
    return animDone(anim, dur).then(function () { g.remove(); to.style.visibility = ''; });
  }
  // yığını alan oyuncuya topla
  function collect(seat) {
    var target = plateRect(seat), els = [].slice.call($('pile').querySelectorAll('.card'));
    if (!target || reduced() || !els.length) return Promise.resolve();
    var k = boardScale(), w = 92 * k, h = 132 * k;
    return Promise.all(els.map(function (e, i) {
      var r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var g = e.classList.contains('back') ? flyer(null) : flyer(M.card(+e.dataset.id));
      g.style.left = (cx - w / 2) + 'px'; g.style.top = (cy - h / 2) + 'px';
      document.body.appendChild(g); e.style.visibility = 'hidden';
      var dx = target.left + target.width / 2 - cx, dy = target.top + target.height / 2 - cy;
      var anim = g.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.3)', opacity: 0.15 }],
        { duration: 420, delay: i * 25, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'forwards' });
      return animDone(anim, 420 + i * 25).then(function () { g.remove(); });
    }));
  }
  async function showEvent(ev, before) {
    if (ev.a !== 'play') return;
    var nm = names();
    hold = { pile: ev.pile };
    render();
    sfx.card();
    var from = ev.p === me ? (before && before.hand[ev.c.id]) || plateRect(me) : plateRect(ev.p);
    await fly(ev.c, from);
    if (ev.capture) {
      if (ev.pisti) {
        sfx.pisti(); splash(ev.pisti === 20 ? 'VALE PİŞTİ!' : 'PİŞTİ!', (ev.p === me ? 'Sen' : nm[ev.p]) + ' · +' + ev.pisti);
        say(ev.p, ev.pisti === 20 ? 'Vale piştisi!' : 'Pişti!');
      }
      await sleep(Math.max(350, (ev.pisti ? 1100 : 650) * (game ? game.speed : 1)));
      sfx.take();
      await collect(ev.p);
    }
    hold = null;
    if (ev.dealt) { render(true); sfx.deal(); } else render();
    if (ev.over && ev.rest) toast('Yerde kalan ' + ev.rest + ' kart son alana (' + (ev.restTo === me ? 'sana' : nm[ev.restTo]) + ') gitti.');
  }

  // ================= hata metinleri =================
  var ERR = { not_your_turn: 'Sıra sende değil.', no_card: 'Bu kart elinde değil.' };
  function fail(r) { toast(ERR[r.error] || 'Bu hamle yapılamaz.'); sfx.bad(); }

  // ================= hamle katmanı =================
  function isMyTurn() {
    if (!V || !game || V.over || busy || hold) return false;
    if (V.turn !== me) return false;
    if (game.mode === 'online' && !game.online.isHost && game.pending) return false;
    return true;
  }
  function applyMove(s, p, mv) {
    if (mv.a !== 'play') return { r: { ok: false, error: 'bad_move' }, ev: null };
    var pileBefore = pubPile(s), r = M.play(s, p, mv.id);
    if (!r.ok) return { r: r, ev: null };
    return { r: r, ev: { p: p, a: 'play', c: r.card, pile: clone(pileBefore.concat([r.card])), capture: r.capture, pisti: r.pisti, dealt: r.dealt, over: r.over, rest: r.rest || 0, restTo: s.lastTaker } };
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
    sel = null;
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
  function doPlay(id) {
    if (!isMyTurn()) return;
    if (!V.myHand.some(function (x) { return x.id === id; })) return;
    myMove({ a: 'play', id: id });
  }
  $('hintBtn').onclick = function () {
    if (!isMyTurn()) return;
    var h = M.hint(fakeSt(), me); if (!h) return;
    var c = M.card(h.id), t = V.pile.length ? V.pile[V.pile.length - 1] : null, why = '';
    if (t && V.pile.length === 1 && c.r === t.r) why = c.r === 11 ? ' — vale piştisi!' : ' — pişti!';
    else if (t && (c.r === t.r || c.r === 11)) why = ' — yerdeki ' + V.pile.length + ' kartı alır.';
    else why = ' — rakibe en az fırsat veren kart.';
    hintMark = { id: h.id, text: 'Önerilen kart: ' + cardName(c) + why }; sel = h.id;
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
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8 || !isMyTurn()) return;
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
    if (sel === d.id && isMyTurn()) { doPlay(d.id); return; }
    sel = d.id; sfx.pick(); render();
  });
  document.addEventListener('pointercancel', function () { if (drag && drag.ghost) drag.ghost.remove(); drag = null; if (V) render(); });
  $('pile').addEventListener('click', function () { if (sel != null) doPlay(sel); });

  // ================= süre =================
  function setDeadline() {
    if (!game || !game.timer || !st || st.over) { if (game) game.deadline = 0; return; }
    if (game.levels[st.turn]) { game.deadline = 0; return; }
    game.deadline = Date.now() + game.timer * 1000;
    refreshView();
  }
  function timerLoop() {
    var dl = V && !V.over && !hold ? V.deadline : 0, el = V && V.turn >= 0 ? $('pl' + pos(V.turn)) : null;
    document.querySelectorAll('.plate .ring').forEach(function (r) { r.style.setProperty('--p', '0'); r.classList.remove('on', 'low'); });
    if (dl && el && game) {
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
    var before = snapshot(), res = applyMove(st, seat, { a: 'play', id: M.botPlay(st, seat, 'normal') });
    if (res.r.ok) { if (seat === me) sel = null; afterMove(res, before); }
  }

  // ================= botlar =================
  var gen = 0;
  function delay(ms) { var g = gen; return sleep(ms * game.speed).then(function () { if (g !== gen || !st) throw new Error('stale'); }); }
  function stopLocal() { gen++; st = null; V = null; busy = false; hold = null; hintMark = null; sel = null; if (game) game.deadline = 0; }
  async function botTurn(p) {
    var lv = game.levels[p] || 'normal';
    busy = true; render();
    await delay(V.pile.length ? 620 : 720);
    var g = gen, res = applyMove(st, p, { a: 'play', id: M.botPlay(st, p, lv) });
    if (!res.r.ok) throw new Error('bot: ' + res.r.error);
    pushEvent(res.ev); refreshView();
    if (game.mode === 'online') publish();
    await showEvent(res.ev, null);
    if (g !== gen) throw new Error('stale');
  }
  var advancing = false, advanceAgain = false;
  async function advance() {
    if (advancing) { advanceAgain = true; return; }
    advancing = true;
    try {
      save();
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
  function seatNames(n, myName) { return n === 4 ? [myName].concat(BOT_NAMES) : [myName, BOT_NAMES[0]]; }
  function newLocalGame(cfg) {
    gen++;
    me = 0;
    var n = cfg.n === 4 ? 4 : 2;
    game = { mode: cfg.mode, name: cfg.name, n: n, names: seatNames(n, cfg.name || 'Sen'), levels: n === 4 ? [null, cfg.level, cfg.level, cfg.level] : [null, cfg.level], level: cfg.level,
      target: cfg.target, speed: cfg.speed, idx: 0, scores: [0, 0], dealer: cfg.mode === 'daily' ? 1 : Math.floor(Math.random() * n),
      timer: cfg.timer, token: null, bestHand: 0, pistiCount: 0, events: [], seq: 0 };
    if (cfg.mode === 'daily') { game.day = todayKey(); lsSet('pst_daily_' + game.day, '1'); }
    startHand();
    post('start', { mode: cfg.mode }).then(function (j) { if (j && j.ok) game.token = j.token; }).catch(function () {});
  }
  function startHand() {
    var seed = game.mode === 'daily' ? fnv1a('pisti-' + (game.day || todayKey())) : 1 + Math.floor(Math.random() * 0x7ffffffe);
    st = M.newHand(seed, game.dealer, game.n, { target: game.target });
    game.events = []; game.deadline = 0; hold = null; sel = null; busy = false; hintMark = null;
    refreshView();
    $('startModal').hidden = true; $('endModal').hidden = true; $('lobbyModal').hidden = true; fit();
    if (innerHeight < 760) { try { $('stageWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    render(true); save(); audio(); sfx.deal();
    toast(st.turn === me ? 'İlk kart senden.' : names()[st.turn] + ' başlıyor.');
    if (game.mode === 'online') publish();
    advance();
  }
  function handEnd() {
    var res = st.result;
    if (!res) return;
    if (!st._counted) {
      for (var t = 0; t < 2; t++) game.scores[t] += res.points[t];
      st._counted = true; game.idx++; game.dealer = (game.dealer + 1) % game.n;
      var mt = teamOf(me), myP = st.pistis[me].normal + st.pistis[me].vale;
      game.bestHand = Math.max(game.bestHand, res.points[mt]); game.pistiCount += myP;
      var stats = readJSON(K_STATS, { hands: 0, pisti: 0, games: 0, gwon: 0 });
      stats.hands++; stats.pisti += myP; lsSet(K_STATS, JSON.stringify(stats));
      var top = Math.max(game.scores[0], game.scores[1]);
      game.finished = game.mode === 'daily' || (top >= game.target && game.scores[0] !== game.scores[1]) || game.idx >= 40;
      game.deadline = 0;
      if (game.mode === 'online') publish();
    }
    save();
    showEnd(res);
  }
  function showEnd(res) {
    var last = !!game.finished, mt = teamOf(me), mine = res.points[mt], other = res.points[1 - mt];
    hold = null; render();
    $('endLabel').textContent = game.mode === 'daily' ? 'Günlük el · ' + (game.day || todayKey()) : last ? 'Oyun bitti' : 'El ' + game.idx + ' bitti';
    var title = mine > other ? (N() === 4 ? 'Eli takımın kazandı!' : 'Eli sen kazandın!') : mine < other ? 'Eli ' + teamName(1 - mt) + ' kazandı' : 'El berabere';
    var sub = (N() === 4 ? 'Takımın bu elden ' + mine + ' puan aldı, rakip takım ' + other + '.' : 'Bu elden ' + mine + ' puan aldın, ' + teamName(1 - mt) + ' ' + other + '.');
    if (game.mode === 'daily') {
      title = 'Bugünkü elden ' + mine + ' puan';
      sub = 'Rakibin ' + other + ' puan aldı. Günlük sıralamada yüksek puan üste çıkar. Yarın yeni el!';
      if (!game._statsDone) { game._statsDone = true; submitResult(false, mine); }
      if (mine >= other) sfx.win(); else sfx.lose();
    } else if (last) {
      var won = game.scores[mt] > game.scores[1 - mt];
      title = won ? 'Kazandın! 🎉' : teamName(1 - mt) + ' kazandı';
      sub = game.scores[mt] + ' – ' + game.scores[1 - mt] + ' · hedef ' + game.target + ' puan.';
      if (!game._statsDone) {
        game._statsDone = true;
        var s2 = readJSON(K_STATS, { hands: 0, pisti: 0, games: 0, gwon: 0 });
        s2.games++; if (won) s2.gwon++; lsSet(K_STATS, JSON.stringify(s2));
        submitResult(won, game.scores[mt]);
      }
      if (won) sfx.win(); else sfx.lose();
    } else if (mine > other) sfx.win();
    $('endTitle').textContent = title; $('endSub').textContent = sub;
    var T = res.teams, cols = [mt, 1 - mt];
    $('endHead').innerHTML = '<tr><th></th>' + cols.map(function (t) { return '<th style="text-align:right">' + esc(t === mt ? (N() === 4 ? 'Sizin takım' : 'Sen') : teamName(t)) + '</th>'; }).join('') + '</tr>';
    var row = function (label, f) { return '<tr><td>' + label + '</td>' + cols.map(function (t) { return '<td class="n">' + f(T[t]) + '</td>'; }).join('') + '</tr>'; };
    var rows = row('Kart sayısı', function (d) { return d.cards + (d.most ? ' <small>+3</small>' : ''); }) +
      row('As · vale', function (d) { return d.aces + ' · ' + d.jacks; }) +
      row('Sinek 2 · karo 10', function (d) { return (d.club2 ? '✓' : '–') + ' · ' + (d.dia10 ? '✓' : '–'); }) +
      row('Pişti', function (d) { return d.pisti + d.vale ? d.pisti + (d.vale ? ' + ' + d.vale + ' vale' : '') + ' <small>+' + d.pistiPts + '</small>' : '–'; }) +
      '<tr class="win"><td><b>Bu el</b></td>' + cols.map(function (t) { return '<td class="n">' + T[t].total + '</td>'; }).join('') + '</tr>';
    if (game.mode !== 'daily') rows += '<tr><td><b>Toplam</b></td>' + cols.map(function (t) { return '<td class="n">' + game.scores[t] + '</td>'; }).join('') + '</tr>';
    $('endRows').innerHTML = rows;
    var client = game.mode === 'online' && !game.online.isHost;
    $('nextBtn').hidden = client && !last;
    $('nextBtn').textContent = last ? 'Yeni oyun' : 'Sonraki el';
    $('endWait').hidden = !(client && !last);
    $('endModal').hidden = false;
  }
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
    post('submit', { token: game.token, name: nm, mode: game.mode, level: game.mode === 'online' ? 'mixed' : game.level, hands: Math.max(1, Math.min(40, game.idx)),
      total: total, won: won, bestOpen: Math.max(0, game.bestHand), finished: game.pistiCount })
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
  var segTarget = seg('handsSeg', 'h'), segSpeed = seg('speedSeg', 's'), segLevel = seg('levelSeg', 'l'), segTimer = seg('timerSeg', 't'), segPlayers = seg('playersSeg', 'n');
  var MODE = 'bot';
  function setTab(m) {
    MODE = m;
    document.querySelectorAll('#modeTabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.m === m ? 'true' : 'false'); });
    document.querySelectorAll('.mpane').forEach(function (p) { p.hidden = p.dataset.m !== m; });
    var done = lsGet('pst_daily_' + todayKey());
    $('startBtn').textContent = m === 'online' ? 'Masa kur' : m === 'daily' ? (done ? 'Bugün oynadın' : 'Günlük eli oyna') : 'Oyuna başla';
    $('startBtn').disabled = m === 'daily' && !!done;
  }
  document.querySelectorAll('#modeTabs button').forEach(function (b) { b.onclick = function () { setTab(b.dataset.m); }; });
  function showStart() {
    $('nameIn').value = lsGet('pisti_name') || lsGet('batak_name') || lsGet('okey_name') || lsGet('bp_name') || '';
    segTarget.set(lsGet('pst_target') || '101'); segSpeed.set(lsGet('pisti_speed') || '1'); segLevel.set(lsGet('pisti_level') || 'normal');
    segTimer.set(lsGet('pisti_timer') || '0'); segPlayers.set(lsGet('pst_players') || '2');
    var stats = readJSON(K_STATS, null), rn = $('resumeNote');
    if (stats && stats.hands) { rn.hidden = false; rn.textContent = 'Şimdiye kadar ' + stats.games + ' oyun, ' + stats.gwon + ' galibiyet · ' + stats.hands + ' el, ' + stats.pisti + ' pişti.'; }
    else rn.hidden = true;
    setTab(MODE);
    $('endModal').hidden = true; $('lobbyModal').hidden = true; $('startModal').hidden = false;
  }
  $('startBtn').onclick = function () {
    audio();
    var n = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 16);
    if (n) { lsSet('pisti_name', n); if (!lsGet('bp_name') && validName(n)) lsSet('bp_name', n); }
    lsSet('pst_target', segTarget.get()); lsSet('pisti_speed', segSpeed.get()); lsSet('pisti_level', segLevel.get()); lsSet('pisti_timer', segTimer.get()); lsSet('pst_players', segPlayers.get());
    var players = +segPlayers.get() === 4 ? 4 : 2;
    if (MODE === 'online') { if (!validName(n)) { toast('Online masa için 2–16 karakterlik bir ad yaz.'); $('nameIn').focus(); return; } return createTable(n, players); }
    if (MODE === 'daily') { if (lsGet('pst_daily_' + todayKey())) return; return newLocalGame({ mode: 'daily', name: n || 'Sen', n: 2, level: 'normal', target: 101, speed: +segSpeed.get() || 1, timer: 0 }); }
    newLocalGame({ mode: 'bot', name: n || 'Sen', n: players, level: segLevel.get() || 'normal', target: +segTarget.get() || 101, speed: +segSpeed.get() || 1, timer: +segTimer.get() || 0 });
  };
  $('nameIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('startBtn').click(); });
  $('newBtn').onclick = function () { showStart(); };
  $('startClose').onclick = function () { if (game && V) $('startModal').hidden = true; };

  // ================= online masa =================
  var hostTimer = 0, clientTimer = 0, lobbyTimer = 0, lastMoveId = 0;
  function inviteUrl(code) { return location.origin + location.pathname + '?masa=' + code; }
  async function createTable(name, players) {
    try {
      var j = await post('t_create', { name: name, opts: { game: 'pisti', players: players, target: +segTarget.get() || 101, timer: +segTimer.get() || 0, speed: +segSpeed.get() || 1, level: segLevel.get() || 'normal' } });
      if (!j.ok) return toast(j.error === 'bad_name' ? 'Bu ad kullanılamaz.' : 'Masa kurulamadı.');
      stopLocal();
      game = { mode: 'online', name: name, n: players, online: { code: j.code, hostKey: j.hostKey, seatKey: j.seatKey, seat: 0, isHost: true }, lobby: true };
      me = 0; lsSet(K_ONLINE, JSON.stringify({ v: 1, lobby: true, game: game }));
      showLobby();
    } catch (e) { toast('Sunucuya ulaşılamadı.'); }
  }
  async function joinTable(code, name) {
    try {
      var j = await post('t_join', { code: code, name: name });
      if (!j.ok) return toast({ no_table: 'Masa bulunamadı.', full: 'Masa dolu.', started: 'Bu masada oyun başlamış.', name_taken: 'Bu ad masada var, başka bir ad seç.', bad_name: 'Bu ad kullanılamaz.' }[j.error] || 'Masaya katılınamadı.');
      stopLocal();
      game = { mode: 'online', name: name, n: 4, online: { code: j.code, seatKey: j.seatKey, seat: j.seat, isHost: false }, lobby: true };
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
      var n = j.opts && +j.opts.players === 2 ? 2 : 4; game.n = n;
      $('lobbySeats').innerHTML = j.seats.slice(0, n).map(function (s, i) {
        return '<li class="' + (s ? 'on' : '') + (i === me ? ' me' : '') + '"><span class="ls-av">' + (s ? esc(s.name.charAt(0)) : '?') + '</span><b>' + (s ? esc(s.name) : 'Boş koltuk') + '</b><small>' + (i === 0 ? 'Masa sahibi' : s ? 'Hazır' : n === 2 ? 'Arkadaşın bekleniyor' : 'Başlayınca bot oturur') + (n === 4 ? ' · ' + (i % 2 ? 'B takımı' : 'A takımı') : '') + '</small></li>';
      }).join('');
      if (j.status !== 'lobby' && !game.online.isHost) { clearInterval(lobbyTimer); game.lobby = false; startClient(j); }
    } catch (e) {}
  }
  $('lobbyCopy').onclick = function () {
    var v = $('lobbyLink').value;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Davet bağlantısı kopyalandı.'); }).catch(function () { $('lobbyLink').select(); });
  };
  $('lobbyWa').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent('Pişti masama gel: ' + $('lobbyLink').value), '_blank', 'noopener'); };
  $('lobbyLeave').onclick = function () { clearInterval(lobbyTimer); stopOnline(); lsDel(K_ONLINE); game = null; $('lobbyModal').hidden = true; showStart(); };
  $('lobbyStart').onclick = async function () {
    if (!game || !game.online.isHost) return;
    var j = await post('t_start', { code: game.online.code, hostKey: game.online.hostKey });
    if (!j.ok) return toast('Başlatılamadı.');
    clearInterval(lobbyTimer); game.lobby = false;
    var lv = segLevel.get() || 'normal', n = game.n === 2 ? 2 : 4;
    game.names = j.seats.slice(0, n).map(function (s) { return s.name; });
    game.levels = j.seats.slice(0, n).map(function (s, i) { return i > 0 && s.bot ? lv : null; });
    game.level = lv; game.target = +segTarget.get() || 101; game.speed = +segSpeed.get() || 1; game.timer = +segTimer.get() || 0;
    if (!game.timer && game.levels.filter(function (x) { return !x; }).length > 1) game.timer = 30; // online'da takılmayı önle
    game.idx = 0; game.scores = [0, 0]; game.dealer = Math.floor(Math.random() * n);
    game.bestHand = 0; game.pistiCount = 0; game.ver = 0; game.errs = {}; game.events = []; game.seq = 0;
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
    for (var s = 1; s < game.n; s++) if (!game.levels[s]) priv[s] = { hand: st.hands[s] };
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
    var n = lobbyInfo.opts && +lobbyInfo.opts.players === 2 ? 2 : 4;
    game.n = n;
    game.names = lobbyInfo.seats.slice(0, n).map(function (s) { return s ? s.name : ''; });
    game.levels = lobbyInfo.seats.slice(0, n).map(function (s) { return s && s.bot ? 'normal' : null; });
    game.scores = [0, 0]; game.idx = 0; game.target = 101; game.speed = 1; game.ver = 0; game.lastEvent = 0; game.errSeen = 0;
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
    game.ver = j.ver; game.names = pub.names; game.scores = pub.scores; game.idx = pub.idx; game.finished = pub.finished; game.target = pub.target; game.n = pub.gn;
    game.levels = pub.levels; game.pending = false;
    var newHand = !V || pub.hid !== V.hid;
    V = viewFromPub(pub, j.priv);
    if (newHand) { hold = null; sel = null; hintMark = null; $('endModal').hidden = true; if (!first) sfx.deal(); }
    if (sel != null && !V.myHand.some(function (c) { return c.id === sel; })) sel = null;
    var evs = (pub.events || []).filter(function (e) { return e.seq > (game.lastEvent || 0); });
    if (newHand) evs = [];
    if (pub.events && pub.events.length) game.lastEvent = pub.events[pub.events.length - 1].seq;
    var e2 = pub.errs && pub.errs[me];
    if (e2 && e2.n > (game.errSeen || 0)) { game.errSeen = e2.n; fail({ error: e2.msg }); }
    render(newHand);
    for (var k = 0; k < evs.length; k++) await showEvent(evs[k], before);
    save();
    if (pub.over && pub.result && game._endShownIdx !== pub.idx) { game._endShownIdx = pub.idx; showEnd(pub.result); }
    if (pub.finished) clearInterval(clientTimer);
  }
  function stopOnline() { clearInterval(hostTimer); clearInterval(clientTimer); clearInterval(lobbyTimer); }

  // ================= sıralama =================
  var lbData = null, lbTab = lsGet('pst_lbtab') || 'week';
  function loadBoard() { get('top').then(function (j) { if (j && j.ok) { lbData = j; renderBoard(); } else boardOff(); }).catch(boardOff); }
  function boardOff() { $('lbList').innerHTML = '<li class="empty">Sıralamaya şu an ulaşılamıyor.</li>'; }
  function renderBoard() {
    document.querySelectorAll('#lbTabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.t === lbTab ? 'true' : 'false'); });
    if (!lbData) return;
    $('lbGames').textContent = fmt(lbData.games) + ' oyun';
    var rows = lbData[lbTab] || [], my = (lsGet('pisti_name') || '').toLocaleLowerCase('tr');
    if (!rows.length) { $('lbList').innerHTML = '<li class="empty">' + (lbTab === 'daily' ? 'Bugünün günlük elini henüz kimse oynamadı. İlk sen ol!' : 'Henüz galibiyet yok. İlk kazanan sen ol!') + '</li>'; return; }
    $('lbList').innerHTML = rows.map(function (r, i) {
      var val = lbTab === 'daily' ? sgn(r.score) + ' puan' : r.wins + ' galibiyet', sub = lbTab === 'daily' ? 'bugünkü el' : r.games + ' oyun';
      return '<li class="' + (i < 3 ? 'm' + (i + 1) : '') + (r.name.toLocaleLowerCase('tr') === my ? ' me' : '') + '"><span class="rk">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</span><button class="pn" data-name="' + esc(r.name) + '">' + esc(r.name) + '</button><small>' + sub + '</small><b>' + val + '</b></li>';
    }).join('');
  }
  document.querySelectorAll('#lbTabs button').forEach(function (b) { b.onclick = function () { lbTab = b.dataset.t; lsSet('pst_lbtab', lbTab); renderBoard(); }; });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.pn'); if (!b) return;
    var n = b.dataset.name; $('profModal').hidden = false; $('profBody').innerHTML = '<p class="muted">Yükleniyor…</p>';
    get('profile', '&name=' + encodeURIComponent(n)).then(function (j) {
      if (!j || !j.ok) { $('profBody').innerHTML = '<p>' + esc(n) + ' için kayıt yok.</p>'; return; }
      var rate = j.games ? Math.round(j.wins / j.games * 100) : 0;
      var st2 = function (v, l) { return '<div><b>' + v + '</b><span>' + l + '</span></div>'; };
      $('profBody').innerHTML = '<h2>' + esc(j.name) + '</h2><p class="muted">İlk oyun ' + esc(j.first || '—') + '</p><div class="pstats">' +
        st2(fmt(j.games), 'Oyun') + st2(fmt(j.wins), 'Galibiyet') + st2('%' + rate, 'Kazanma') + st2(j.bestOpen ? j.bestOpen : '—', 'En iyi el') +
        st2(fmt(j.finished), 'Pişti') + st2(j.bestDaily != null ? sgn(j.bestDaily) : '—', 'En iyi günlük el') + '</div>';
    }).catch(function () { $('profBody').innerHTML = '<p>Sunucuya ulaşılamadı.</p>'; });
  });
  $('profClose').onclick = function () { $('profModal').hidden = true; };
  $('profModal').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
  loadBoard();

  // ================= klavye =================
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'Escape') { if (!$('profModal').hidden) { $('profModal').hidden = true; return; } if (!$('startModal').hidden && game && V) { $('startModal').hidden = true; return; } }
    if (!$('startModal').hidden || !$('endModal').hidden || !$('lobbyModal').hidden || !$('profModal').hidden || !V) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLocaleLowerCase('tr'), done = true;
    if (k === 'h') $('hintBtn').click();
    else if (k === 'm') $('muteBtn').click();
    else if (k === 'f') $('fsBtn').click();
    else if (k === 'n') $('newBtn').click();
    else if (/^[1-4]$/.test(k)) { var c = V.myHand[+k - 1]; if (c) { sel = c.id; doPlay(c.id); } }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      var ord = V.myHand.map(function (c) { return c.id; }); if (!ord.length) return;
      var i = ord.indexOf(sel), d = e.key === 'ArrowRight' ? 1 : -1;
      sel = ord[i < 0 ? (d > 0 ? 0 : ord.length - 1) : (i + d + ord.length) % ord.length]; sfx.pick(); render();
    }
    else if ((e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp') && sel != null) doPlay(sel);
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
  if (params.get('test') === '1') window.__ps = { get st() { return st; }, get V() { return V; }, get game() { return game; }, M: M };
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
    lsSet('pisti_name', n); audio(); joinTable(c, n);
  };
  boot();
})();
