/* 101 Okey — arayüz: masa, ıstaka, sürükle-bırak, botlar, animasyonlar, ipuçları, süre, günlük el, sıralama, online masa.
   Kurallar okey-motor.js'te. Online masada oyunu masa sahibinin tarayıcısı yönetir; sunucu (api/) yalnızca aktarır. */
(function () {
  'use strict';
  var M = window.OkeyMotor;
  var API = 'api/';
  var $ = function (id) { return document.getElementById(id); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('tr-TR'); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function post(a, body) { return fetch(API + '?a=' + a, { method: 'POST', cache: 'no-store', body: JSON.stringify(body || {}) }).then(function (r) { return r.json(); }); }
  function get(a, q) { return fetch(API + '?a=' + a + (q || ''), { cache: 'no-store' }).then(function (r) { return r.json(); }); }
  function fnv1a(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  function todayKey() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()); } catch (e) { return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); } }
  function validName(n) { n = (n || '').replace(/\s+/g, ' ').trim(); return n.length >= 2 && n.length <= 16 && /^[\p{L}\p{N}][\p{L}\p{N} ._\-]*$/u.test(n); }
  $('yr').textContent = new Date().getFullYear();

  var BOT_NAMES = ['Ayşe', 'Mehmet', 'Zeynep'];
  var LEVEL_TR = { easy: 'Kolay', normal: 'Orta', hard: 'Zor' };
  // game: oyun ayarları ve toplamlar · st: motor durumu (yerel ya da masa sahibi) · V: ekrana çizilen görünüm · me: benim koltuğum
  var game = null, st = null, V = null, me = 0, rack = [], sel = null, busy = false, rackHist = [];

  // ================= tema · ses =================
  var root = document.documentElement;
  $('themeBtn').onclick = function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); lsSet('theme', n);
  };
  var actx = null, master = null, muted = lsGet('okey_mute') === '1', vol = Math.min(1, Math.max(0, +(lsGet('okey_vol') || 0.8))), noiseBuf = null;
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
  $('vol').addEventListener('input', function () { vol = this.value / 100; lsSet('okey_vol', String(vol)); if (vol > 0) { muted = false; lsSet('okey_mute', '0'); } audio(); syncSound(); });
  $('vol').addEventListener('change', function () { sfx.clack(); });
  $('muteBtn').onclick = function () { muted = !muted; lsSet('okey_mute', muted ? '1' : '0'); syncSound(); };
  syncSound();
  function tone(f, d, type, v, delay) {
    if (muted || !actx) return;
    var t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v || 0.12, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + d + 0.02);
  }
  // taş tıkırtısı: kısa, süzülmüş gürültü + tok bir vuruş
  function clack(v, f, delay) {
    if (muted || !actx) return;
    if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.2, actx.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
    var t0 = actx.currentTime + (delay || 0), s = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.value = f || 2600; bp.Q.value = 1.4;
    g.gain.setValueAtTime(v || 0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    s.connect(bp); bp.connect(g); g.connect(master); s.start(t0); s.stop(t0 + 0.08);
    tone((f || 2600) / 14, 0.05, 'triangle', (v || 0.5) * 0.18, delay);
  }
  var sfx = {
    clack: function () { clack(0.45, 2800); },
    pick: function () { clack(0.35, 3400); },
    draw: function () { clack(0.3, 2000); clack(0.4, 3000, 0.07); },
    drop: function () { clack(0.6, 2200); clack(0.25, 1400, 0.03); },
    lay: function () { for (var i = 0; i < 4; i++) clack(0.35, 2400 + i * 200, i * 0.06); },
    open: function () { sfx.lay(); [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.08, 0.25 + i * 0.07); }); },
    deal: function () { for (var i = 0; i < 10; i++) clack(0.22, 2200 + Math.random() * 1600, i * 0.045); },
    bad: function () { tone(180, 0.22, 'sawtooth', 0.05); tone(120, 0.28, 'sawtooth', 0.04, 0.1); },
    tick: function () { tone(1100, 0.04, 'square', 0.025); },
    win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.22, 'square', 0.035, i * 0.09); tone(f * 2, 0.22, 'sine', 0.035, i * 0.09); }); }
  };

  // ================= kayıt =================
  function tileObj(t) { return { id: t.id, c: t.c, n: t.n, joker: !!t.joker, fake: !!t.fake }; }
  function serialize(s) {
    var ids = function (a) { return a.map(function (t) { return t.id; }); };
    return {
      tiles: Object.keys(s.byId).map(function (k) { return s.byId[k]; }), ind: s.indicator.id, okey: s.okey, seed: s.seed, opts: s.opts,
      deck: ids(s.deck), hands: s.hands.map(ids), discards: s.discards.map(ids), sideHist: s.sideHist.map(ids),
      table: s.table.map(function (m) { return { owner: m.owner, type: m.type, ids: ids(m.tiles) }; }),
      opened: s.opened, openValue: s.openValue, highOpen: s.highOpen, openedThisTurn: s.openedThisTurn, turn: s.turn, dealer: s.dealer,
      phase: s.phase, sideTaken: s.sideTaken, noSide: s.noSide, penalties: s.penalties, over: s.over, result: s.result, turnCount: s.turnCount, _counted: s._counted
    };
  }
  function restore(o) {
    var byId = {}; o.tiles.forEach(function (t) { byId[t.id] = t; });
    var T = function (a) { return a.map(function (id) { return byId[id]; }); };
    return {
      byId: byId, indicator: byId[o.ind], okey: o.okey, seed: o.seed, opts: o.opts || M.DEFAULTS, deck: T(o.deck), hands: o.hands.map(T),
      discards: o.discards.map(T), sideHist: (o.sideHist || [[], [], [], []]).map(T),
      table: o.table.map(function (m) { return { owner: m.owner, type: m.type, tiles: T(m.ids) }; }),
      opened: o.opened, openValue: o.openValue || [0, 0, 0, 0], highOpen: o.highOpen || 0, openedThisTurn: o.openedThisTurn, turn: o.turn,
      dealer: o.dealer, phase: o.phase, sideTaken: o.sideTaken, noSide: o.noSide, penalties: o.penalties, over: o.over, result: o.result,
      turnCount: o.turnCount, log: [], _counted: o._counted
    };
  }
  function saveKey() { return game && game.mode === 'online' ? 'okey_online' : 'okey_save'; }
  function save() {
    if (!game) return;
    if (game.mode === 'online' && !game.online.isHost) { lsSet('okey_online', JSON.stringify({ v: 2, client: true, game: game, rack: rack })); return; }
    if (st) lsSet(saveKey(), JSON.stringify({ v: 2, game: game, st: serialize(st), rack: rack }));
  }

  // ================= görünüm (V) =================
  function pos(seat) { return (seat - me + 4) % 4; }
  function seatAt(p) { return (p + me) % 4; }
  function viewFromSt(s) {
    return {
      byId: s.byId, indicator: s.indicator, okey: s.okey, deckCount: s.deck.length, counts: s.hands.map(function (h) { return h.length; }),
      myHand: s.hands[me], discards: s.discards, table: s.table, opened: s.opened, openValue: s.openValue, highOpen: s.highOpen,
      turn: s.turn, phase: s.phase, sideTaken: s.turn === me ? s.sideTaken : null, noSide: s.noSide, penalties: s.penalties,
      over: s.over, result: s.result, opts: s.opts, deadline: game.deadline || 0
    };
  }
  function buildPub() {
    var T = function (a) { return a.map(tileObj); };
    return {
      names: game.names, totals: game.totals, idx: game.idx, hands: game.hands, dealer: st.dealer, opts: st.opts, finished: !!game.finished,
      indicator: tileObj(st.indicator), okey: st.okey, deckCount: st.deck.length, counts: st.hands.map(function (h) { return h.length; }),
      discards: st.discards.map(T), table: st.table.map(function (m) { return { owner: m.owner, type: m.type, tiles: T(m.tiles) }; }),
      opened: st.opened, openValue: st.openValue, highOpen: st.highOpen, turn: st.turn, phase: st.phase, noSide: st.noSide,
      penalties: st.penalties, over: st.over, result: st.result, deadline: game.deadline || 0, events: game.events || [], errs: game.errs || {}
    };
  }
  function viewFromPub(pub, priv) {
    var byId = {};
    var add = function (t) { byId[t.id] = t; return t; };
    add(pub.indicator);
    pub.discards.forEach(function (d) { d.forEach(add); });
    pub.table.forEach(function (m) { m.tiles.forEach(add); });
    var hand = priv && priv.hand ? priv.hand.map(add) : [];
    return {
      byId: byId, indicator: pub.indicator, okey: pub.okey, deckCount: pub.deckCount, counts: pub.counts, myHand: hand,
      discards: pub.discards, table: pub.table, opened: pub.opened, openValue: pub.openValue, highOpen: pub.highOpen,
      turn: pub.turn, phase: pub.phase, sideTaken: priv ? priv.sideTaken : null, noSide: pub.noSide, penalties: pub.penalties,
      over: pub.over, result: pub.result, opts: pub.opts, deadline: pub.deadline
    };
  }
  function refreshView() { if (st && (!game || game.mode !== 'online' || game.online.isHost)) V = viewFromSt(st); }
  // ipucu ve tahminler için motorun anlayacağı sahte durum (yalnızca benim elim + açık bilgiler)
  function fakeSt() {
    var hands = [[], [], [], []]; hands[me] = V.myHand;
    return { hands: hands, discards: V.discards, table: V.table, opts: V.opts, opened: V.opened, turn: V.turn, phase: V.phase, over: V.over,
      sideTaken: V.sideTaken, noSide: V.noSide, sideHist: [[], [], [], []], highOpen: V.highOpen || 0, byId: V.byId, penalties: V.penalties };
  }

  // ================= taş görünümü =================
  function tileEl(t, cls) {
    var d = document.createElement('div');
    // Gerçek okey ters dönük taş gibi görünür (sayısı yok, her taşın yerine geçer); sahte okey okeyin sayısıyla, köşesinde yıldızla
    d.className = 'tile ' + (t.joker ? 'okeyt' : t.c) + (t.joker ? ' joker' : '') + (t.fake ? ' fake2' : '') + (cls ? ' ' + cls : '');
    d.dataset.id = t.id;
    d.innerHTML = t.joker ? '<b class="om" aria-hidden="true"><i>★</i>OKEY</b>' : '<span>' + t.n + '</span>' + (t.fake ? '<i class="fk" aria-hidden="true">★</i>' : '');
    d.setAttribute('aria-label', t.joker ? 'Okey: her taşın yerine geçer' : (t.fake ? 'Sahte okey: ' : '') + ({ k: 'kırmızı', s: 'sarı', m: 'mavi', y: 'siyah' }[t.c]) + ' ' + t.n);
    return d;
  }
  // görünen adlar: online masada sunucunun eklediği "(bot)" ekini at (bot olduğu plakada zorlukla yazıyor)
  function names() { return (game && game.names ? game.names : ['Sen'].concat(BOT_NAMES)).map(function (n) { return String(n || '').replace(/\s*\(bot\)$/, ''); }); }

  // ================= ıstaka =================
  var SLOTS = 30, ROW = 15;
  function syncRack(fresh) {
    if (!V) return;
    var has = {}; V.myHand.forEach(function (t) { has[t.id] = 1; });
    for (var s = 0; s < SLOTS; s++) if (rack[s] != null && !has[rack[s]]) rack[s] = null;
    var inRack = {}; rack.forEach(function (i) { if (i != null) inRack[i] = 1; });
    V.myHand.forEach(function (t) {
      if (inRack[t.id]) return;
      var slot = -1;
      for (var s2 = SLOTS - 1; s2 >= 0; s2--) if (rack[s2] == null) { slot = s2; break; }
      if (slot >= 0) { rack[slot] = t.id; if (fresh) fresh[t.id] = 1; }
    });
  }
  function groups() {
    var out = [];
    for (var r = 0; r < 2; r++) {
      var cur = [];
      for (var c = 0; c < ROW; c++) {
        var id = rack[r * ROW + c];
        if (id != null && V.byId[id]) cur.push(V.byId[id]); else { if (cur.length) out.push(cur); cur = []; }
      }
      if (cur.length) out.push(cur);
    }
    return out;
  }
  function seriGroups() { return groups().filter(function (g) { return g.length >= 3 && M.checkMeld(g, V.opts); }); }
  function pairGroups() { return groups().filter(function (g) { return g.length === 2 && M.checkPair(g); }); }
  function seriSum() { return seriGroups().reduce(function (a, g) { return a + M.checkMeld(g, V.opts).value; }, 0); }
  function place(gs) {
    var out = []; for (var i = 0; i < SLOTS; i++) out.push(null);
    var r = 0, c = 0;
    for (var g = 0; g < gs.length; g++) {
      var len = gs[g].length;
      if (len > ROW) return null;
      if (c + len > ROW) { r++; c = 0; }
      if (r > 1) return null;
      for (var k = 0; k < len; k++) out[r * ROW + c + k] = gs[g][k].id;
      c += len + 1;
    }
    return out;
  }
  function sortTiles(ts) { var ord = { k: 0, s: 1, m: 2, y: 3 }; return ts.slice().sort(function (a, b) { return (a.joker - b.joker) || (ord[a.c] - ord[b.c]) || (a.n - b.n); }); }
  function restGroups(rest) { var by = {}; sortTiles(rest).forEach(function (t) { var k = t.joker ? 'j' : t.c; (by[k] = by[k] || []).push(t); }); return Object.keys(by).map(function (k) { return by[k]; }); }
  function compact(gs) { var all = [].concat.apply([], gs), out = []; for (var i = 0; i < SLOTS; i++) out.push(all[i] ? all[i].id : null); return out; }
  function pushHist() { rackHist.push(rack.slice()); if (rackHist.length > 30) rackHist.shift(); }
  // Seri diz sonrası kalan taşlar: aynı sayı farklı renk (9-9, 5-5) yan yana; aynı renkte ardışık komşusu olan taş kendi renginde kalır
  function seriRest(rest) {
    var real = rest.filter(function (t) { return !t.joker; }), jk = rest.filter(function (t) { return t.joker; }), used = {}, sets = [];
    function nb(t) { return real.some(function (u) { return u !== t && u.c === t.c && Math.abs(u.n - t.n) === 1; }); }
    for (var n = 13; n >= 1; n--) {
      var cols = {}, g = [];
      sortTiles(real).forEach(function (t) { if (t.n === n && !cols[t.c] && !nb(t)) { cols[t.c] = 1; g.push(t); } });
      if (g.length >= 2) { sets.push(g); g.forEach(function (t) { used[t.id] = 1; }); }
    }
    var gs = sets.concat(restGroups(real.filter(function (t) { return !used[t.id]; })));
    if (jk.length) gs.push(jk);
    return gs;
  }
  // sığmazsa kalan grupları sondan başlayarak birleştir (perler ve 9-9 gibi gruplar ayrı kalsın)
  function placeSeri(melds, rgs) {
    rgs = rgs.slice();
    for (;;) {
      var r = place(melds.concat(rgs)); if (r) return r;
      if (rgs.length < 2) return compact(melds.concat(rgs));
      var b = rgs.pop(); rgs[rgs.length - 1] = rgs[rgs.length - 1].concat(b);
    }
  }
  function arrangeSeri() { pushHist(); var bm = M.bestMelds(V.myHand, V.opts); rack = placeSeri(bm.melds, seriRest(bm.rest)); sel = null; }
  function arrangePairs() { pushHist(); var bp = M.bestPairs(V.myHand); var gs = bp.pairs.concat(restGroups(bp.rest)); rack = place(gs) || place(bp.pairs.concat([sortTiles(bp.rest)])) || compact(gs); sel = null; }
  function arrangeSorted() { var gs = restGroups(V.myHand); rack = place(gs) || compact(gs); sel = null; }
  function undo() {
    var prev = rackHist.pop(); if (!prev) { toast('Geri alınacak dizilim yok.'); return; }
    rack = prev; syncRack(); sel = null; sfx.clack(); render(); save();
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

  // ================= çizim =================
  var hintMark = null, warnId = null, warnT = 0;
  function render(fresh) {
    if (!V || !game) return;
    var nm = names();
    $('handChip').textContent = (game.mode === 'daily' ? 'Günlük el · ' : game.mode === 'online' ? 'Masa ' + game.online.code + ' · ' : '') + 'El ' + Math.min(game.idx + 1, game.hands) + ' / ' + game.hands;
    setMini($('indMini'), V.indicator.c, V.indicator.n); setMini($('okeyMini'), V.okey.c, V.okey.n);
    $('scoreChips').innerHTML = [0, 1, 2, 3].map(function (i) { var s = seatAt(i); return '<span class="chip' + (s === me ? ' me' : '') + '">' + esc(nm[s]) + ' <b>' + fmt(game.totals[s]) + '</b></span>'; }).join('');
    for (var p = 0; p < 4; p++) renderPlate(p);
    renderMelds(); renderPiles(); renderRack(fresh); renderButtons();
  }
  function setMini(el, c, n) { el.textContent = n; el.style.color = 'var(--t-' + c + ')'; }
  function renderPlate(p) {
    var seat = seatAt(p), el = $('pl' + p), nm = names()[seat], o = V.opened[seat];
    var keep = el.querySelector('.say'), sayHTML = '';
    el.classList.toggle('turn', V.turn === seat && !V.over);
    var status = o === 'cift' ? 'ÇİFT' : o ? 'AÇTI ' + (V.openValue[seat] || '') : '';
    var lvl = game.levels && game.levels[seat] ? ' · ' + LEVEL_TR[game.levels[seat]] : '';
    el.innerHTML = sayHTML + '<div class="av"><div class="ring"></div>' + avatarSVG(seat) + (status ? '<span class="badge">' + status + '</span>' : '') + '</div>' +
      '<div class="np"><b>' + esc(nm) + '</b><small>' + V.counts[seat] + ' taş · <i>' + fmt(game.totals[seat]) + '</i>' + esc(lvl) + '</small></div>';
    // balon aynı öğe olarak kalır: kapanma zamanlayıcısı çalışmaya devam eder
    el.insertBefore(keep || Object.assign(document.createElement('div'), { className: 'say' }), el.firstChild);
  }
  function meldEl(m, i) {
    var d = document.createElement('div'); d.className = 'meld'; d.dataset.mi = i;
    m.tiles.forEach(function (t) { d.appendChild(tileEl(t)); });
    return d;
  }
  // seri panosu: sol üst = soldaki, sağ üst = karşıdaki, sol alt = ben, sağ alt = sağdaki
  var QUAD = [3, 2, 0, 1];
  function renderMelds() {
    var nm = names(), q = $('quads'), c = $('ciftCols');
    q.innerHTML = ''; c.innerHTML = '';
    QUAD.forEach(function (p) {
      var seat = seatAt(p), box = document.createElement('div'); box.className = 'quad' + (seat === me ? ' mine' : '');
      V.table.forEach(function (m, i) { if (m.owner === seat && m.type !== 'pair') box.appendChild(meldEl(m, i)); });
      box.insertAdjacentHTML('beforeend', '<span class="qn">' + esc(nm[seat]) + '</span>');
      q.appendChild(box);
    });
    [0, 1, 2, 3].forEach(function (p) {
      var seat = seatAt(p), col = document.createElement('div'); col.className = 'ccol' + (seat === me ? ' mine' : '');
      V.table.forEach(function (m) {
        if (m.owner !== seat || m.type !== 'pair') return;
        var pr = document.createElement('div'); pr.className = 'pr';
        m.tiles.forEach(function (t) { pr.appendChild(tileEl(t)); });
        col.appendChild(pr);
      });
      col.insertAdjacentHTML('beforeend', '<span class="qn">' + esc(nm[seat]) + '</span>');
      c.appendChild(col);
    });
    if (sel != null && isMyTurn('play') && M.canProc(fakeSt(), me)) {
      var t = V.byId[sel];
      q.querySelectorAll('.meld').forEach(function (d) {
        var m = V.table[+d.dataset.mi];
        if (M.addToMeld(m, t, V.opts) || (V.opts.okeySwap && M.swapInfo(m, t, V.opts))) d.classList.add('can');
      });
    }
    if (hintMark && hintMark.mi != null) { var hm = q.querySelector('.meld[data-mi="' + hintMark.mi + '"]'); if (hm) hm.classList.add('hintpulse'); }
  }
  function slotTile(id, t, cls) {
    var el = $(id); el.querySelectorAll('.tile').forEach(function (x) { x.remove(); });
    if (t) el.insertBefore(tileEl(t, cls), el.firstChild);
  }
  function lastOf(a) { return a.length ? a[a.length - 1] : null; }
  function renderPiles() {
    var nm = names(), myDraw = isMyTurn('draw');
    for (var p = 0; p < 4; p++) {
      var seat = seatAt(p);
      slotTile('d' + p, lastOf(V.discards[seat]), p === 0 ? 'dim' : '');
      if (p === 1 || p === 2) $('d' + p + 'c').textContent = nm[seat];
    }
    var side = lastOf(V.discards[(me + 3) % 4]);
    $('d3').classList.toggle('live', myDraw && !!side && V.noSide !== me);
    $('d0').classList.toggle('can', isMyTurn('play') && sel != null);
    $('deckCnt').textContent = V.deckCount; $('deck').classList.toggle('live', myDraw);
    $('deck').classList.toggle('hintpulse', !!hintMark && hintMark.a === 'deck');
    $('d3').classList.toggle('hintpulse', !!hintMark && hintMark.a === 'side');
    $('indPile').innerHTML = ''; $('indPile').appendChild(tileEl(V.indicator));
  }
  function renderRack(fresh) {
    var el = $('rack'); el.innerHTML = '';
    var canP = isMyTurn('play') && M.canProc(fakeSt(), me);
    for (var s = 0; s < SLOTS; s++) {
      var slot = document.createElement('div'); slot.className = 'slot'; slot.dataset.s = s;
      var id = rack[s];
      if (id != null && V.byId[id]) {
        var t = V.byId[id], cls = (sel === id || V.sideTaken === id ? 'sel' : '') + (fresh && fresh[id] ? ' new' : '') + (hintMark && hintMark.id === id ? ' hintpulse' : '');
        if (canP && !t.joker && V.table.length) {
          if (M.canProcess(V.table, t, V.opts) >= 0) cls += ' islek';
          else if (V.opts.okeySwap && V.table.some(function (m) { return M.swapInfo(m, t, V.opts); })) cls += ' islek';
        }
        slot.appendChild(tileEl(t, cls));
      }
      el.appendChild(slot);
    }
    var o = V.opened[me], sum = seriSum(), pc = pairGroups().length, need = M.openNeed(fakeSt()), b = $('sumBadge');
    if (o) { b.innerHTML = V.myHand.length + '<small>TAŞ</small>'; b.classList.remove('ok'); b.title = 'Elindeki taş sayısı'; }
    else if (pc >= 4 && sum < need) { b.innerHTML = pc + '<small>ÇİFT</small>'; b.classList.toggle('ok', pc >= 5); b.title = 'Dizili çift sayısı'; }
    else { b.textContent = sum; b.classList.toggle('ok', sum >= need); b.title = 'Istakada dizili perlerin toplamı (gereken ' + need + ')'; }
  }
  function renderButtons() {
    var my = isMyTurn(), play = isMyTurn('play'), o = V.opened[me];
    var sum = seriSum(), pc = pairGroups().length, need = M.openNeed(fakeSt());
    $('openSeri').hidden = !!o; $('openCift').hidden = !!o; $('layBtn').hidden = !o;
    $('openSeri').disabled = !play; $('openCift').disabled = !play; $('layBtn').disabled = !play;
    $('openSeri').classList.toggle('hot', play && !o && sum >= need);
    $('openCift').classList.toggle('hot', play && !o && pc >= 5);
    var sideUnused = V.sideTaken != null && V.myHand.some(function (t) { return t.id === V.sideTaken; });
    $('returnBtn').hidden = !(play && sideUnused);
    $('hintBtn').disabled = !my; $('undoBtn').disabled = !rackHist.length;
    var h = '';
    if (V.over) h = '';
    else if (!my) h = waitingText();
    else if (hintMark && hintMark.text) h = '💡 ' + hintMark.text;
    else if (V.phase === 'draw') h = 'Desteden ya da sol alttaki yan taştan bir taş çek.';
    else if (sideUnused) h = 'Yandan aldığın taşı bu tur kullanmalısın.';
    else if (!o && sum >= need) h = need + '\'e ulaştın: Seri aç!';
    else if (!o && pc >= 5) h = '5 çiftin var: Çift aç!';
    else if (!o && sum > 0) h = 'Açmana ' + (need - sum) + ' puan kaldı · bir taş at.';
    else if (V.myHand.length === 1) h = 'Son taşını at, eli bitir!';
    else h = 'Bir taşı sağ alttaki yuvaya sürükle ya da çift tıkla.';
    $('hint').textContent = h;
  }
  function waitingText() {
    var n = names()[V.turn];
    if (game.mode === 'online' && game.online && !game.online.isHost && !game.hostAlive) return 'Masa sahibinin bağlantısı bekleniyor…';
    return 'Sıra ' + n + '\'' + bulunma(n) + '…';
  }
  function bulunma(n) {
    var low = String(n).replace(/\s*\(bot\)$/, '').toLocaleLowerCase('tr'), v = low.match(/[aeıioöuü](?=[^aeıioöuü]*$)/);
    var front = v && 'eiöü'.indexOf(v[0]) >= 0, hard = 'çfhkpsşt'.indexOf(low.slice(-1)) >= 0;
    if (/\(bot\)$/.test(n)) return (front ? 'de' : 'da');
    return (hard ? 't' : 'd') + (front ? 'e' : 'a');
  }
  function say(seat, text, ms) {
    var e = $('pl' + pos(seat)) && $('pl' + pos(seat)).querySelector('.say'); if (!e) return;
    e.textContent = text; e.classList.add('on'); e.classList.toggle('chatmsg', !!ms);
    clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('on', 'chatmsg'); }, ms || 1500 * (game ? game.speed : 1) + 400);
  }
  var toastT = 0;
  function toast(m) { var e = $('toast'); e.textContent = m; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 3400); }

  // ================= animasyon: taş uçur =================
  function rectOf(el) { return el ? el.getBoundingClientRect() : null; }
  function boardScale() { var r = $('board').getBoundingClientRect(); return r.width / BW; }
  // from: DOMRect · toEl: hedef eleman (görünmez yapılır, varınca görünür) · t: taş (null = kapalı taş)
  function fly(t, from, toEl, dur) {
    if (!from || !toEl || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    var to = toEl.getBoundingClientRect(); if (!to.width) return Promise.resolve();
    var k = boardScale(), w = 58 * k, h = 78 * k;
    var g = t ? tileEl(t) : (function () { var d = document.createElement('div'); d.className = 'tile back'; return d; })();
    g.classList.add('flyer'); g.style.setProperty('--tw', w + 'px'); g.style.setProperty('--th', h + 'px');
    g.style.left = (from.left + from.width / 2 - w / 2) + 'px'; g.style.top = (from.top + from.height / 2 - h / 2) + 'px';
    document.body.appendChild(g);
    var dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
    var sc = Math.max(to.width / w, 0.4);
    toEl.style.visibility = 'hidden';
    var anim = g.animate([{ transform: 'translate(0,0) scale(1) rotate(0)' }, { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 30 * k) + 'px) scale(' + (1 + sc) / 2 + ') rotate(-6deg)', offset: 0.5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ') rotate(0)' }], { duration: (dur || 380) * (game ? Math.min(1.2, Math.max(0.6, game.speed)) : 1), easing: 'cubic-bezier(.3,.7,.3,1)' });
    return new Promise(function (res) { anim.onfinish = function () { g.remove(); toEl.style.visibility = ''; res(); }; });
  }
  function plateRect(seat) { var e = $('pl' + pos(seat)); return rectOf(e && e.querySelector('.av')); }
  function rackTileEl(id) { return $('rack').querySelector('.tile[data-id="' + id + '"]'); }
  function slotTileEl(seat) { var e = $('d' + pos(seat)); return e && e.querySelector('.tile'); }
  // olay öncesi kaynak konumları al, durumu uygula ve çiz, sonra uçur
  function animateEvent(ev, before) {
    if (!ev) return Promise.resolve();
    var seat = ev.p, t = ev.tile ? V.byId[ev.tile.id] || ev.tile : null;
    if ((ev.a === 'draw' || ev.a === 'side') && ev.tile) {
      var from = ev.a === 'side' ? before.side : before.deck;
      return seat === me ? fly(t, from, rackTileEl(ev.tile.id)) : fly(ev.a === 'side' ? t : null, from, $('pl' + pos(seat)).querySelector('.av'), 360);
    }
    if (ev.a === 'discard') {
      var src = seat === me ? before.rack[ev.tile.id] : plateRect(seat);
      return fly(t, src, slotTileEl(seat));
    }
    if ((ev.a === 'process' || ev.a === 'swap') && ev.tile) {
      var tgt = $('quads').querySelector('.meld[data-mi="' + ev.mi + '"] .tile[data-id="' + ev.tile.id + '"]');
      return fly(t, seat === me ? before.rack[ev.tile.id] : plateRect(seat), tgt);
    }
    return Promise.resolve();
  }
  function snapshot() {
    var r = {}; $('rack').querySelectorAll('.tile').forEach(function (e) { r[e.dataset.id] = e.getBoundingClientRect(); });
    return { deck: rectOf($('deck')), side: rectOf($('d3').querySelector('.tile') || $('d3')), rack: r };
  }

  // ================= hata metinleri =================
  var ERR = {
    need_101: 'Açmak için dizili perlerin toplamı en az 101 olmalı.', need_more: 'Katlamalı oyunda öncekinden yüksek açmalısın.',
    need_pairs: 'Çifte gitmek için en az 5 çift gerekli.', bad_group: 'Istakada geçersiz bir grup var.', need_discard: 'Atmak için elinde en az bir taş kalmalı.',
    must_use_side: 'Yandan aldığın taşı önce kullanmalısın (ya da geri koy, ceza).', cant_process: 'Bu taş o pere işlenemez.', cant_swap: 'Bu taşla oradaki okey alınamaz.',
    pairs_cant_process: 'Çifte giden oyuncu masaya taş işleyemez.', not_open: 'Bunun için önce elini açmalısın.', side_returned: 'Bu tur yandan tekrar alamazsın.',
    no_side: 'Yanda alınacak taş yok.', not_your_turn: 'Sıra sende değil.', not_your_draw: 'Önce taş çekmelisin.', swap_off: 'Bu masada okey alınamaz.'
  };
  function fail(r) { toast(ERR[r.error] || 'Bu hamle yapılamaz.'); sfx.bad(); }

  // ================= hamle katmanı =================
  // Yerel/masa sahibi: motora uygula. Online oyuncu: sunucuya gönder.
  function isMyTurn(phase) {
    if (!V || !game || V.over || busy) return false;
    if (V.turn !== me) return false;
    if (game.mode === 'online' && !game.online.isHost && game.pending) return false;
    return !phase || V.phase === phase;
  }
  function applyMove(s, p, mv) {
    var tile = null, r;
    if (mv.a === 'draw') {
      r = M.draw(s, p, !!mv.side);
      if (r.ok && r.end) return { r: r, ev: { p: p, a: 'deckout' } }; // deste bitti: el kapandı
      return { r: r, ev: r.ok ? { p: p, a: mv.side ? 'side' : 'draw', tile: tileObj(r.tile) } : null };
    }
    if (mv.a === 'open') { r = M.open(s, p, mv.groups, mv.kind); return { r: r, ev: r.ok ? { p: p, a: 'open', kind: mv.kind, value: r.value } : null }; }
    if (mv.a === 'lay') {
      var n = 0, last = null;
      mv.groups.forEach(function (g) { var x = M.lay(s, p, g); if (x.ok) n++; else last = x; });
      r = n ? { ok: true, n: n } : (last || { ok: false, error: 'bad_group' });
      return { r: r, ev: n ? { p: p, a: 'lay' } : null };
    }
    if (mv.a === 'process' || mv.a === 'swap') {
      tile = s.byId[mv.id];
      r = mv.a === 'swap' ? M.swap(s, p, mv.id, mv.mi) : M.process(s, p, mv.id, mv.mi);
      if (!r.ok && mv.a === 'process' && s.opts.okeySwap) { var r2 = M.swap(s, p, mv.id, mv.mi); if (r2.ok) { r = r2; mv = { a: 'swap', id: mv.id, mi: mv.mi }; } }
      return { r: r, ev: r.ok ? { p: p, a: mv.a, tile: tileObj(tile), mi: mv.mi, joker: r.joker ? tileObj(r.joker) : null } : null };
    }
    if (mv.a === 'discard') { tile = s.byId[mv.id]; r = M.discard(s, p, mv.id); return { r: r, ev: r.ok ? { p: p, a: 'discard', tile: tileObj(tile), pen: r.penalty || null, end: !!r.end } : null }; }
    if (mv.a === 'return') { r = M.returnSide(s, p); return { r: r, ev: r.ok ? { p: p, a: 'return' } : null }; }
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
      game.pending = true; renderButtons();
      try {
        var j = await post('t_move', { code: game.online.code, seat: me, seatKey: game.online.seatKey, move: mv });
        if (!j.ok) { game.pending = false; toast('Hamle gönderilemedi.'); renderButtons(); }
      } catch (e) { game.pending = false; toast('Bağlantı sorunu: hamle gönderilemedi.'); renderButtons(); }
      setTimeout(clientPoll, 250);
      return;
    }
    var before = snapshot(), res = applyMove(st, me, mv);
    if (!res.r.ok) return fail(res.r);
    afterMove(res, before, true);
  }
  // hamle sonrası: ses, bildirim, çizim, animasyon, yayın, sıra ilerletme
  async function afterMove(res, before, mine) {
    var ev = res.ev; pushEvent(ev);
    var fresh = {};
    refreshView(); syncRack(fresh); if (ev && ev.a !== 'draw' && ev.a !== 'side') fresh = null;
    sel = mine && ev && (ev.a === 'discard' || ev.a === 'process' || ev.a === 'swap') ? null : sel;
    if (ev) eventFeedback(ev);
    render(fresh);
    if (ev) await animateEvent(ev, before);
    if (game.mode === 'online') publish();
    save();
    if (st && st.over) return handEnd();
    if (ev && (ev.a === 'discard')) { setDeadline(); advance(); }
    else if (ev && (ev.a === 'draw' || ev.a === 'side' || ev.a === 'return') && st.turn === me) setDeadline(true);
  }
  function eventFeedback(ev) {
    var nm = names()[ev.p];
    if (ev.a === 'deckout') { toast('Deste bitti: el kapandı.'); }
    else if (ev.a === 'draw' || ev.a === 'side') { sfx.draw(); if (ev.p !== me) say(ev.p, ev.a === 'side' ? 'Yandan aldı' : 'Desteden çekti'); }
    else if (ev.a === 'open') { sfx.open(); if (ev.p === me) toast(ev.kind === 'cift' ? 'Çifte gittin!' : ev.value + ' ile elini açtın!'); else { say(ev.p, ev.kind === 'cift' ? 'Çifte gitti!' : ev.value + ' ile açtı!'); toast(nm + (ev.kind === 'cift' ? ' çifte gitti.' : ' ' + ev.value + ' ile elini açtı.')); } }
    else if (ev.a === 'lay') { sfx.lay(); if (ev.p !== me) say(ev.p, 'Per ekledi'); }
    else if (ev.a === 'process') { sfx.drop(); if (ev.p !== me) say(ev.p, 'Taş işledi'); }
    else if (ev.a === 'swap') { sfx.open(); if (ev.p === me) toast('Masadaki okeyi aldın!'); else { say(ev.p, 'Okeyi aldı!'); toast(nm + ' masadaki okeyi aldı.'); } }
    else if (ev.a === 'return') { sfx.bad(); if (ev.p === me) toast('Yan taşı geri koydun: ceza. Şimdi desteden çek.'); else say(ev.p, 'Yan taşı geri koydu'); }
    else if (ev.a === 'discard') {
      sfx.drop();
      if (ev.pen) toast((ev.p === me ? 'Sen ' : nm + ' ') + (ev.pen === 'okey' ? 'okey attı: ceza!' : 'işlek taş attı: ceza!'));
      if (ev.p !== me) say(ev.p, ev.end ? 'Bitirdi!' : 'Taş attı');
    }
  }

  // ---------- oyuncu düğmeleri ----------
  function drawFrom(side) { if (!isMyTurn('draw')) return; myMove({ a: 'draw', side: !!side }); }
  $('deck').onclick = function () { drawFrom(false); };
  $('d3').onclick = function () { drawFrom(true); };
  function doOpen(kind) {
    if (!isMyTurn('play')) return;
    var gs = kind === 'cift' ? pairGroups() : seriGroups();
    if (!gs.length) { toast(kind === 'cift' ? 'Istakada yan yana dizili çift yok. Çift diz ile dizebilirsin.' : 'Istakada yan yana dizili per yok. Seri diz ile dizebilirsin.'); return; }
    myMove({ a: 'open', kind: kind, groups: gs.map(function (g) { return g.map(function (t) { return t.id; }); }) });
  }
  $('openSeri').onclick = function () { doOpen('seri'); };
  $('openCift').onclick = function () { doOpen('cift'); };
  $('layBtn').onclick = function () {
    if (!isMyTurn('play')) return;
    var gs = V.opened[me] === 'cift' ? pairGroups() : seriGroups();
    if (!gs.length) { toast(V.opened[me] === 'cift' ? 'Istakada yan yana dizili bir çift yok.' : 'Istakada yan yana dizili geçerli bir per yok (en az 3 taş).'); return; }
    myMove({ a: 'lay', groups: gs.map(function (g) { return g.map(function (t) { return t.id; }); }) });
  };
  function doProcess(id, mi) { if (!isMyTurn('play')) return; myMove({ a: 'process', id: id, mi: mi }); }
  function doDiscard(id) {
    if (!isMyTurn('play')) return;
    var t = V.byId[id]; if (!t) return;
    // ceza uyarısı: okey ya da işlek taş atmadan önce bir kez sor
    var risky = V.myHand.length > 1 && (t.joker || M.canProcess(V.table, t, V.opts) >= 0);
    if (risky && !(warnId === id && Date.now() - warnT < 4000)) {
      warnId = id; warnT = Date.now(); sfx.bad();
      toast(t.joker ? '⚠️ Bu okey! Atarsan ' + V.opts.ceza + ' ceza. Atmak için tekrar at.' : '⚠️ Bu taş masaya işlenebilir. Atarsan ' + V.opts.ceza + ' ceza. Atmak için tekrar at.');
      return;
    }
    warnId = null;
    myMove({ a: 'discard', id: id });
  }
  $('returnBtn').onclick = function () { if (isMyTurn('play')) myMove({ a: 'return' }); };
  $('sortSeri').onclick = function () { if (!V) return; arrangeSeri(); sfx.clack(); render(); save(); };
  $('sortCift').onclick = function () { if (!V) return; arrangePairs(); sfx.clack(); render(); save(); };
  $('undoBtn').onclick = undo;
  $('hintBtn').onclick = function () {
    if (!isMyTurn()) return;
    var h = M.hint(fakeSt(), me); if (!h) return;
    var t = h.id != null ? V.byId[h.id] : null, tn = t ? (t.joker ? 'okeyi' : ({ k: 'kırmızı', s: 'sarı', m: 'mavi', y: 'siyah' }[t.c]) + ' ' + t.n) : '';
    var text = h.a === 'deck' ? 'Desteden çek.' : h.a === 'side' ? 'Yandaki taşı al: işine yarıyor.' : h.a === 'open' ? (h.kind === 'cift' ? '5 çiftin var: Çift diz, sonra Çift aç.' : 'Açabilirsin: Seri diz, sonra Seri aç (' + h.value + ').')
      : h.a === 'swap' ? tn + ' ile masadaki okeyi alabilirsin: taşı o pere sürükle.' : h.a === 'process' ? tn + ' masadaki bir pere işlenebilir: taşı pere sürükle.' : 'Önerilen atış: ' + tn + '.';
    hintMark = { a: h.a, id: h.id, mi: h.mi, text: text };
    if (h.a === 'open') { if (h.kind === 'cift') arrangePairs(); else arrangeSeri(); }
    if (h.a === 'discard') sel = h.id;
    sfx.tick(); render();
  };

  // ---------- sürükle-bırak + seçim ----------
  var drag = null, lastTap = { id: null, t: 0 };
  $('rack').addEventListener('pointerdown', function (e) {
    var te = e.target.closest('.tile'); if (!te || !V) return;
    audio();
    drag = { id: +te.dataset.id, x: e.clientX, y: e.clientY, el: te, ghost: null, from: +te.parentNode.dataset.s };
    try { te.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
  });
  function targetAt(x, y) {
    var el = document.elementFromPoint(x, y); if (!el) return null;
    var slot = el.closest('.slot'); if (slot && slot.parentNode.id === 'rack') return { kind: 'slot', s: +slot.dataset.s, el: slot };
    if (el.closest('#d0')) return { kind: 'discard', el: $('d0') };
    var meld = el.closest('.meld'); if (meld) return { kind: 'meld', mi: +meld.dataset.mi, el: meld };
    return null;
  }
  var overEl = null;
  function setOver(t) { if (overEl) overEl.classList.remove('over', 'drop'); overEl = t ? t.el : null; if (overEl) overEl.classList.add(t.kind === 'slot' ? 'over' : 'drop'); }
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('ghost'); drag.ghost.classList.remove('sel', 'hintpulse');
      var r = drag.el.getBoundingClientRect();
      drag.ghost.style.setProperty('--tw', r.width + 'px'); drag.ghost.style.setProperty('--th', r.height + 'px');
      document.body.appendChild(drag.ghost); drag.el.classList.add('dim'); sfx.pick();
    }
    drag.ghost.style.left = (e.clientX - drag.ghost.offsetWidth / 2) + 'px';
    drag.ghost.style.top = (e.clientY - drag.ghost.offsetHeight / 2) + 'px';
    setOver(targetAt(e.clientX, e.clientY));
  });
  document.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    var t = d.ghost ? targetAt(e.clientX, e.clientY) : null;
    setOver(null);
    if (!d.ghost) {
      var nowT = Date.now();
      if (lastTap.id === d.id && nowT - lastTap.t < 330) { lastTap = { id: null, t: 0 }; doDiscard(d.id); return; }
      lastTap = { id: d.id, t: nowT };
      sel = sel === d.id ? null : d.id; sfx.tick(); render(); return;
    }
    if (!t) { render(); return; }
    if (t.kind === 'slot') {
      if (t.s !== d.from) { pushHist(); var other = rack[t.s]; rack[t.s] = d.id; rack[d.from] = other != null ? other : null; }
      sfx.clack(); render(); save();
    } else if (t.kind === 'discard') { render(); doDiscard(d.id); }
    else if (t.kind === 'meld') { render(); doProcess(d.id, t.mi); }
  });
  document.addEventListener('pointercancel', function () { if (drag && drag.ghost) drag.ghost.remove(); drag = null; setOver(null); render(); });
  $('seriPanel').addEventListener('click', function (e) { var m = e.target.closest('.meld'); if (m && sel != null) doProcess(sel, +m.dataset.mi); });
  $('d0').addEventListener('click', function () { if (sel != null) doDiscard(sel); });

  // ================= süre =================
  function setDeadline(keep) {
    if (!game || !game.timer || !st || st.over) { if (game) game.deadline = 0; return; }
    var human = !game.levels[st.turn];
    if (!human) { game.deadline = 0; return; }
    if (keep && game.deadline) return;
    game.deadline = Date.now() + game.timer * 1000;
  }
  function timerLoop() {
    var dl = V && !V.over ? V.deadline : 0, el = $('pl' + (V ? pos(V.turn) : 0));
    document.querySelectorAll('.plate .ring').forEach(function (r) { r.style.setProperty('--p', '0'); r.classList.remove('on', 'low'); });
    if (dl && el) {
      var left = Math.max(0, dl - Date.now()), frac = left / ((game.timer || 30) * 1000), ring = el.querySelector('.ring');
      if (ring) { ring.classList.add('on'); ring.classList.toggle('low', left < 8000); ring.style.setProperty('--p', String(frac)); }
      if (V.turn === me && left < 5500 && left > 0 && Math.floor(left / 1000) !== timerLoop.last) { timerLoop.last = Math.floor(left / 1000); sfx.tick(); }
      // yerel/masa sahibi: süresi dolan insan oyuncu için otomatik hamle
      if (left <= 0 && st && (game.mode !== 'online' || game.online.isHost) && !busy && !game.levels[st.turn]) autoMove(st.turn);
    }
    requestAnimationFrame(timerLoop);
  }
  requestAnimationFrame(timerLoop);
  async function autoMove(seat) {
    if (busy) return; busy = true; game.deadline = 0;
    if (seat === me) toast('Süren doldu: senin yerine oynandı.');
    var before = snapshot(), res;
    if (st.phase === 'draw') { res = applyMove(st, seat, { a: 'draw', side: false }); busy = false; await afterMove(res, before, seat === me); if (st.over) return; busy = true; before = snapshot(); }
    if (st.sideTaken != null && st.hands[seat].some(function (t) { return t.id === st.sideTaken; })) M.returnSide(st, seat);
    if (st.phase === 'draw') M.draw(st, seat, false);
    res = applyMove(st, seat, { a: 'discard', id: M.chooseDiscard(st, seat, 'normal') });
    busy = false; await afterMove(res, before, seat === me);
  }

  // ================= botlar =================
  // Oyun değişince (yeni oyun / online masa) bekleyen bot turu sessizce durur
  var gen = 0;
  function delay(ms) { var g = gen; return sleep(ms * game.speed).then(function () { if (g !== gen || !st) throw new Error('stale'); }); }
  function stopLocal() { gen++; st = null; V = null; busy = false; hintMark = null; sel = null; game && (game.deadline = 0); }
  async function botTurn(p) {
    var lv = game.levels[p] || 'normal', before, res;
    busy = true; render();
    await delay(600);
    if (st.phase === 'draw') {
      before = snapshot();
      res = applyMove(st, p, { a: 'draw', side: M.botWantsSide(st, p, lv) });
      busy = true; await afterMoveBot(res, before); if (st.over) return;
      await delay(450);
    }
    var acts = M.botPlay(st, p, lv);
    if (acts.length) {
      var op = acts.find(function (a) { return a.a === 'open'; });
      var ev = op ? { p: p, a: 'open', kind: op.kind, value: op.value } : acts.some(function (a) { return a.a === 'swap'; }) ? { p: p, a: 'swap' } :
        acts.some(function (a) { return a.a === 'return'; }) ? { p: p, a: 'return' } : { p: p, a: 'lay' };
      pushEvent(ev); eventFeedback(ev); refreshView(); render();
      if (game.mode === 'online') publish();
      await delay(650);
    }
    if (st.phase === 'draw') { before = snapshot(); res = applyMove(st, p, { a: 'draw', side: false }); await afterMoveBot(res, before); if (st.over) return; await delay(350); }
    before = snapshot();
    res = applyMove(st, p, { a: 'discard', id: M.chooseDiscard(st, p, lv) });
    await afterMoveBot(res, before);
  }
  async function afterMoveBot(res, before) {
    pushEvent(res.ev); refreshView();
    if (res.ev) eventFeedback(res.ev);
    render();
    if (res.ev) await animateEvent(res.ev, before);
    if (game.mode === 'online') publish();
  }
  var advancing = false;
  async function advance() {
    if (advancing) return; advancing = true;
    try {
      save();
      while (st && !st.over && game.levels && game.levels[st.turn]) {
        await botTurn(st.turn);
        busy = false; setDeadline(); refreshView(); render(); save();
      }
      busy = false;
      if (st && st.over) { advancing = false; return handEnd(); }
      setDeadline(true); refreshView(); render();
      if (game.mode === 'online') publish();
    } catch (e) { busy = false; if (window.console && e.message !== 'stale') console.error(e); } finally { advancing = false; }
  }

  // ================= el / oyun =================
  function defaultNames(n) { return [n || 'Sen'].concat(BOT_NAMES); }
  function newLocalGame(cfg) {
    gen++;
    me = 0;
    game = { mode: cfg.mode, name: cfg.name, names: defaultNames(cfg.name), levels: [null, cfg.level, cfg.level, cfg.level], level: cfg.level,
      hands: cfg.hands, speed: cfg.speed, idx: 0, totals: [0, 0, 0, 0], dealer: cfg.mode === 'daily' ? 0 : Math.floor(Math.random() * 4),
      opts: cfg.opts, timer: cfg.timer, seed: cfg.seed || null, token: null, bestOpen: 0, finishedHands: 0, events: [], seq: 0 };
    if (cfg.mode === 'daily') { game.day = todayKey(); lsSet('okey_daily_' + game.day, '1'); }
    startHand();
    // sıralama için oturum
    post('start', { mode: cfg.mode }).then(function (j) { if (j && j.ok) game.token = j.token; }).catch(function () {});
  }
  function startHand() {
    var seed = game.mode === 'daily' ? fnv1a('okey-' + (game.day || todayKey())) : 1 + Math.floor(Math.random() * 0x7ffffffe);
    st = M.newHand(seed, game.dealer, game.opts);
    game.events = []; game.deadline = 0;
    refreshView();
    rack = []; for (var i = 0; i < SLOTS; i++) rack.push(null);
    rackHist = []; syncRack(); arrangeSorted(); sel = null; busy = false; hintMark = null;
    $('startModal').hidden = true; $('endModal').hidden = true; $('lobbyModal').hidden = true; fit();
    if (innerHeight < 760) { try { $('stageWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    render(); save(); audio(); sfx.deal();
    toast(st.dealer === me ? 'Dağıtan sensin: 22 taşın var, bir taş atarak başla.' : names()[st.dealer] + ' dağıttı.');
    if (game.mode === 'online') publish();
    advance();
  }
  function handEnd() {
    var res = st.result, nm = names();
    if (!res) return;
    if (!st._counted) {
      for (var i = 0; i < 4; i++) game.totals[i] += res.points[i];
      st._counted = true; game.idx++; game.dealer = (game.dealer + 1) % 4;
      if (st.openValue[me] > game.bestOpen) game.bestOpen = st.openValue[me];
      if (res.winner === me) game.finishedHands++;
      var stats = JSON.parse(lsGet('okey_stats') || '{"hands":0,"won":0,"games":0,"gwon":0}');
      stats.hands++; if (res.winner === me) stats.won++;
      lsSet('okey_stats', JSON.stringify(stats));
      game.finished = game.idx >= game.hands;
      game.deadline = 0;
      if (game.mode === 'online') publish();
    }
    save();
    showEnd(st.result, st.opened, st.penalties);
  }
  function showEnd(res, opened, penalties) {
    var nm = names(), w = res.winner, last = game.idx >= game.hands;
    render();
    $('endLabel').textContent = game.mode === 'daily' ? 'Günlük el · ' + (game.day || todayKey()) : last ? 'Oyun bitti' : 'El ' + game.idx + '/' + game.hands + ' bitti';
    var title, sub = '';
    if (w < 0) title = 'Deste bitti';
    else {
      title = w === me ? 'Elini bitirdin!' : nm[w] + ' bitirdi';
      var inf = res.info || {}, m = [];
      if (inf.okey) m.push('okeyle'); if (inf.cift) m.push('çiftle'); if (inf.elden) m.push('elden');
      if (m.length) sub = m.join(', ') + ' bitirme: puanlar ×' + inf.mult;
    }
    if (last && game.mode !== 'daily') {
      var best = game.totals.indexOf(Math.min.apply(null, game.totals));
      title = best === me ? 'Kazandın! 🎉' : nm[best] + ' kazandı';
      sub = 'En düşük toplam kazanır.';
      if (!game._statsDone) {
        game._statsDone = true;
        var s2 = JSON.parse(lsGet('okey_stats') || '{"hands":0,"won":0,"games":0,"gwon":0}');
        s2.games++; if (best === me) s2.gwon++; lsSet('okey_stats', JSON.stringify(s2));
        submitResult(best === me);
      }
      if (best === me) sfx.win(); else sfx.bad();
    } else if (game.mode === 'daily') {
      title = res.points[me] < 0 ? 'Günlük eli bitirdin! 🎉' : 'Günlük el bitti';
      sub = 'Puanın: ' + fmt(res.points[me]) + ' (düşük olan iyi). Yarın yeni el!';
      if (!game._statsDone) { game._statsDone = true; submitResult(false); }
    } else if (w === me) sfx.win();
    $('endTitle').textContent = title; $('endSub').textContent = sub;
    $('endRows').innerHTML = nm.map(function (n, i) {
      var why = i === w ? 'bitirdi' : !opened[i] ? 'açmadı (202)' : opened[i] === 'cift' ? 'çift: kalan ×2' : 'kalan taşlar';
      if (penalties[i] > 0) why += ' · ceza +' + penalties[i];
      return '<tr class="' + (i === w ? 'win' : '') + (i === me ? ' me' : '') + '"><td><b>' + esc(n) + '</b><small>' + why + '</small></td><td class="n">' + (res.points[i] > 0 ? '+' : '') + fmt(res.points[i]) + '</td><td class="n">' + fmt(game.totals[i]) + '</td></tr>';
    }).join('');
    var client = game.mode === 'online' && !game.online.isHost;
    $('nextBtn').hidden = client && !last;
    $('nextBtn').textContent = last || game.mode === 'daily' ? 'Yeni oyun' : 'Sonraki el';
    $('endWait').hidden = !(client && !last);
    $('endModal').hidden = false;
  }
  $('nextBtn').onclick = function () {
    audio();
    if (game.mode === 'daily' || game.idx >= game.hands) {
      if (game.mode === 'online') lsDel('okey_online'); else lsDel('okey_save');
      stopOnline(); showStart(); return;
    }
    startHand();
  };
  function submitResult(won) {
    var nm = game.name;
    if (!game.token || !validName(nm)) { if (game.mode === 'daily' && !validName(nm)) toast('Günlük sıralamaya girmek için başlangıçta adını yaz.'); return; }
    var total = game.mode === 'daily' ? st.result.points[me] : game.totals[me];
    post('submit', { token: game.token, name: nm, mode: game.mode, level: game.mode === 'online' ? 'mixed' : game.level, hands: game.mode === 'daily' ? 1 : game.hands,
      total: total, won: won, bestOpen: game.bestOpen, finished: game.finishedHands })
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
  var segHands = seg('handsSeg', 'h'), segSpeed = seg('speedSeg', 's'), segLevel = seg('levelSeg', 'l'), segTimer = seg('timerSeg', 't'), segCeza = seg('cezaSeg', 'c');
  var MODE = 'bot';
  function setTab(m) {
    MODE = m;
    document.querySelectorAll('#modeTabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.m === m ? 'true' : 'false'); });
    document.querySelectorAll('.mpane').forEach(function (p) { p.hidden = p.dataset.m !== m; });
    $('rulesBox').hidden = m === 'daily';
    var done = lsGet('okey_daily_' + todayKey());
    $('startBtn').textContent = m === 'online' ? 'Masa kur' : m === 'daily' ? (done ? 'Bugün oynadın' : 'Günlük eli oyna') : 'Oyuna başla';
    $('startBtn').disabled = m === 'daily' && !!done;
  }
  document.querySelectorAll('#modeTabs button').forEach(function (b) { b.onclick = function () { setTab(b.dataset.m); }; });
  function readOpts() {
    return { wrap: $('optWrap').checked, okeySwap: $('optSwap').checked, katlamali: $('optKat').checked, ciftIsler: $('optCift').checked, ceza: +(segCeza.get() || 101) };
  }
  function showStart() {
    $('nameIn').value = lsGet('okey_name') || lsGet('bp_name') || '';
    segHands.set(lsGet('okey_hands') || '5'); segSpeed.set(lsGet('okey_speed') || '1'); segLevel.set(lsGet('okey_level') || 'normal');
    segTimer.set(lsGet('okey_timer') || '0'); segCeza.set(lsGet('okey_ceza') || '101');
    var o = JSON.parse(lsGet('okey_opts') || 'null') || M.DEFAULTS;
    $('optWrap').checked = !!o.wrap; $('optSwap').checked = o.okeySwap !== false; $('optKat').checked = !!o.katlamali; $('optCift').checked = !!o.ciftIsler;
    var stats = JSON.parse(lsGet('okey_stats') || 'null'), rn = $('resumeNote');
    if (stats && stats.games) { rn.hidden = false; rn.textContent = 'Şimdiye kadar ' + stats.games + ' oyun, ' + stats.gwon + ' galibiyet · ' + stats.hands + ' el, ' + stats.won + ' kez bitirdin.'; }
    else rn.hidden = true;
    setTab(MODE);
    $('endModal').hidden = true; $('lobbyModal').hidden = true; $('startModal').hidden = false;
  }
  $('startBtn').onclick = function () {
    audio();
    var n = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 16);
    if (n) { lsSet('okey_name', n); if (!lsGet('bp_name') && validName(n)) lsSet('bp_name', n); }
    var opts = readOpts();
    lsSet('okey_hands', segHands.get()); lsSet('okey_speed', segSpeed.get()); lsSet('okey_level', segLevel.get()); lsSet('okey_timer', segTimer.get());
    lsSet('okey_ceza', segCeza.get()); lsSet('okey_opts', JSON.stringify(opts));
    if (MODE === 'online') { if (!validName(n)) { toast('Online masa için 2–16 karakterlik bir ad yaz.'); $('nameIn').focus(); return; } return createTable(n, opts); }
    if (MODE === 'daily') { if (lsGet('okey_daily_' + todayKey())) return; return newLocalGame({ mode: 'daily', name: n || 'Sen', level: 'normal', hands: 1, speed: +segSpeed.get() || 1, opts: M.DEFAULTS, timer: 0 }); }
    newLocalGame({ mode: 'bot', name: n || 'Sen', level: segLevel.get() || 'normal', hands: +segHands.get() || 5, speed: +segSpeed.get() || 1, opts: opts, timer: +segTimer.get() || 0 });
  };
  $('nameIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('startBtn').click(); });
  $('newBtn').onclick = function () { if (busy) return; showStart(); };
  $('startClose').onclick = function () { if (game) $('startModal').hidden = true; };

  // ================= online masa =================
  var hostTimer = 0, clientTimer = 0, lobbyTimer = 0, lastMoveId = 0;
  function inviteUrl(code) { return location.origin + location.pathname + '?masa=' + code; }
  async function createTable(name, opts) {
    try {
      var j = await post('t_create', { name: name, opts: { opts: opts, hands: +segHands.get() || 5, timer: +segTimer.get() || 0, speed: +segSpeed.get() || 1, level: segLevel.get() || 'normal' } });
      if (!j.ok) return toast(j.error === 'bad_name' ? 'Bu ad kullanılamaz.' : 'Masa kurulamadı.');
      stopLocal();
      game = { mode: 'online', name: name, online: { code: j.code, hostKey: j.hostKey, seatKey: j.seatKey, seat: 0, isHost: true }, lobby: true };
      me = 0; lsSet('okey_online', JSON.stringify({ v: 2, lobby: true, game: game }));
      showLobby();
    } catch (e) { toast('Sunucuya ulaşılamadı.'); }
  }
  async function joinTable(code, name) {
    try {
      var j = await post('t_join', { code: code, name: name });
      if (!j.ok) return toast({ no_table: 'Masa bulunamadı.', full: 'Masa dolu.', started: 'Bu masada oyun başlamış.', name_taken: 'Bu ad masada var, başka bir ad seç.', bad_name: 'Bu ad kullanılamaz.' }[j.error] || 'Masaya katılınamadı.');
      stopLocal();
      game = { mode: 'online', name: name, online: { code: j.code, seatKey: j.seatKey, seat: j.seat, isHost: false }, lobby: true };
      me = j.seat; lsSet('okey_online', JSON.stringify({ v: 2, lobby: true, game: game }));
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
  $('lobbyWa').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent('101 Okey masama gel: ' + $('lobbyLink').value), '_blank', 'noopener'); };
  $('lobbyLeave').onclick = function () { clearInterval(lobbyTimer); stopOnline(); lsDel('okey_online'); game = null; $('lobbyModal').hidden = true; showStart(); };
  $('lobbyStart').onclick = async function () {
    if (!game || !game.online.isHost) return;
    var j = await post('t_start', { code: game.online.code, hostKey: game.online.hostKey });
    if (!j.ok) return toast('Başlatılamadı.');
    clearInterval(lobbyTimer); game.lobby = false;
    var cfg = JSON.parse(lsGet('okey_opts') || 'null') || M.DEFAULTS;
    var lv = segLevel.get() || 'normal';
    game.names = j.seats.map(function (s) { return s.name; });
    game.levels = j.seats.map(function (s, i) { return i > 0 && s.bot ? lv : null; });
    game.level = lv; game.hands = +segHands.get() || 5; game.speed = +segSpeed.get() || 1; game.timer = +segTimer.get() || 0;
    if (!game.timer && game.levels.filter(function (x) { return !x; }).length > 1) game.timer = 45; // online'da takılmayı önle
    game.opts = cfg; game.idx = 0; game.totals = [0, 0, 0, 0]; game.dealer = Math.floor(Math.random() * 4); game.bestOpen = 0; game.finishedHands = 0;
    game.ver = 0; game.errs = {};
    post('start', { mode: 'online' }).then(function (x) { if (x && x.ok) game.token = x.token; }).catch(function () {});
    startHost();
    startHand();
  };
  // --- masa sahibi ---
  function startHost() {
    clearInterval(hostTimer);
    hostTimer = setInterval(hostPoll, 800);
  }
  var publishing = false, publishAgain = false;
  async function publish() {
    if (!game || game.mode !== 'online' || !game.online.isHost || !st) return;
    if (publishing) { publishAgain = true; return; }
    publishing = true;
    game.ver = (game.ver || 0) + 1;
    var priv = {};
    for (var s = 1; s < 4; s++) if (!game.levels[s]) priv[s] = { hand: st.hands[s].map(tileObj), sideTaken: st.turn === s ? st.sideTaken : null };
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
          var mv = j.moves[i]; lastMoveId = mv.id;
          if (!st || st.over || st.turn !== mv.seat || game.levels[mv.seat] || busy) {
            if (st && !st.over) { game.errs[mv.seat] = { n: (game.errs[mv.seat] ? game.errs[mv.seat].n : 0) + 1, msg: 'not_your_turn' }; publish(); }
            continue;
          }
          var before = snapshot(), res = applyMove(st, mv.seat, mv.move || {});
          if (!res.r.ok) { game.errs[mv.seat] = { n: (game.errs[mv.seat] ? game.errs[mv.seat].n : 0) + 1, msg: res.r.error }; publish(); continue; }
          await afterMove(res, before, false);
        }
        game.lastMoveId = lastMoveId;
      }
    } catch (e) {}
    hostBusy = false;
  }
  // --- oyuncu ---
  function startClient(lobbyInfo) {
    game.names = lobbyInfo.seats.map(function (s) { return s ? s.name : ''; });
    game.levels = lobbyInfo.seats.map(function (s) { return s && s.bot ? 'normal' : null; });
    game.totals = [0, 0, 0, 0]; game.idx = 0; game.hands = 5; game.speed = 1; game.ver = 0; game.lastEvent = 0; game.errSeen = 0;
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
        var alive = j.hostAlive;
        if (alive !== game.hostAlive) { game.hostAlive = alive; if (V) renderButtons(); }
        if (j.pub) applyRemote(j);
      } else if (j && j.error === 'no_table') { toast('Masa kapandı.'); stopOnline(); lsDel('okey_online'); }
    } catch (e) {}
    polling = false;
  }
  async function applyRemote(j) {
    var pub = j.pub, before = V ? snapshot() : null, first = !V;
    game.ver = j.ver; game.names = pub.names; game.totals = pub.totals; game.idx = pub.idx; game.hands = pub.hands;
    game.levels = j.seats.map(function (s) { return s && s.bot ? 'normal' : null; }); game.pending = false;
    var newHand = !V || (pub.indicator.id !== V.indicator.id) || pub.deckCount > V.deckCount;
    V = viewFromPub(pub, j.priv);
    if (newHand) { rack = []; for (var i = 0; i < SLOTS; i++) rack.push(null); rackHist = []; syncRack(); arrangeSorted(); $('endModal').hidden = true; if (!first) sfx.deal(); }
    var fresh = {}; syncRack(fresh);
    var evs = (pub.events || []).filter(function (e) { return e.seq > (game.lastEvent || 0); });
    if (newHand) evs = [];
    var e2 = pub.errs && pub.errs[me];
    if (e2 && e2.n > (game.errSeen || 0)) { game.errSeen = e2.n; fail({ error: e2.msg }); }
    render(evs.some(function (e) { return e.a === 'draw' || e.a === 'side'; }) ? fresh : null);
    for (var k = 0; k < evs.length; k++) { eventFeedback(evs[k]); if (before) await animateEvent(evs[k], before); }
    if (pub.events && pub.events.length) game.lastEvent = pub.events[pub.events.length - 1].seq;
    save();
    if (pub.over && pub.result && game._endShownIdx !== pub.idx) { game._endShownIdx = pub.idx; showEnd(pub.result, pub.opened, pub.penalties); }
    if (pub.finished) { clearInterval(clientTimer); }
  }
  function stopOnline() { clearInterval(hostTimer); clearInterval(clientTimer); clearInterval(lobbyTimer); }

  // ================= sıralama =================
  var lbData = null, lbTab = lsGet('okey_lbtab') || 'week';
  function loadBoard() {
    get('top').then(function (j) { if (j && j.ok) { lbData = j; renderBoard(); } else boardOff(); }).catch(boardOff);
  }
  function boardOff() { $('lbList').innerHTML = '<li class="empty">Sıralamaya şu an ulaşılamıyor.</li>'; }
  function renderBoard() {
    document.querySelectorAll('#lbTabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.t === lbTab ? 'true' : 'false'); });
    if (!lbData) return;
    $('lbGames').textContent = fmt(lbData.games) + ' oyun';
    var rows = lbTab === 'daily' ? lbData.daily : lbData[lbTab], my = (lsGet('okey_name') || '').toLocaleLowerCase('tr');
    if (!rows.length) { $('lbList').innerHTML = '<li class="empty">' + (lbTab === 'daily' ? 'Bugünün günlük elini henüz kimse oynamadı. İlk sen ol!' : 'Henüz galibiyet yok. İlk kazanan sen ol!') + '</li>'; return; }
    $('lbList').innerHTML = rows.map(function (r, i) {
      var val = lbTab === 'daily' ? fmt(r.score) + ' puan' : r.wins + ' galibiyet', sub = lbTab === 'daily' ? '' : r.games + ' oyun';
      return '<li class="' + (i < 3 ? 'm' + (i + 1) : '') + (r.name.toLocaleLowerCase('tr') === my ? ' me' : '') + '"><span class="rk">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</span><button class="pn" data-name="' + esc(r.name) + '">' + esc(r.name) + '</button><small>' + sub + '</small><b>' + val + '</b></li>';
    }).join('');
  }
  document.querySelectorAll('#lbTabs button').forEach(function (b) { b.onclick = function () { lbTab = b.dataset.t; lsSet('okey_lbtab', lbTab); renderBoard(); }; });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.pn'); if (!b) return;
    var n = b.dataset.name; $('profModal').hidden = false; $('profBody').innerHTML = '<p class="muted">Yükleniyor…</p>';
    get('profile', '&name=' + encodeURIComponent(n)).then(function (j) {
      if (!j || !j.ok) { $('profBody').innerHTML = '<p>' + esc(n) + ' için kayıt yok.</p>'; return; }
      var rate = j.games ? Math.round(j.wins / j.games * 100) : 0;
      var st2 = function (v, l) { return '<div><b>' + v + '</b><span>' + l + '</span></div>'; };
      $('profBody').innerHTML = '<h2>' + esc(j.name) + '</h2><p class="muted">İlk oyun ' + esc(j.first || '—') + '</p><div class="pstats">' +
        st2(fmt(j.games), 'Oyun') + st2(fmt(j.wins), 'Galibiyet') + st2('%' + rate, 'Kazanma') + st2(fmt(j.bestOpen), 'En yüksek açış') +
        st2(fmt(j.finished), 'Bitirdiği el') + st2(j.bestDaily != null ? fmt(j.bestDaily) : '—', 'En iyi günlük el') + '</div>';
    }).catch(function () { $('profBody').innerHTML = '<p>Sunucuya ulaşılamadı.</p>'; });
  });
  $('profClose').onclick = function () { $('profModal').hidden = true; };
  $('profModal').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
  loadBoard();

  // ================= klavye =================
  function rackOrder() { return rack.filter(function (id) { return id != null; }); }
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'Escape') { if (!$('profModal').hidden) { $('profModal').hidden = true; return; } if (!$('startModal').hidden && game && V) { $('startModal').hidden = true; return; } }
    if (!$('startModal').hidden || !$('endModal').hidden || !$('lobbyModal').hidden || !V) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLocaleLowerCase('tr'), done = true;
    if (k === 'd') drawFrom(false);
    else if (k === 'y') drawFrom(true);
    else if (k === 's') $('sortSeri').click();
    else if (k === 'ç' || k === 'c') $('sortCift').click();
    else if (k === 'a') doOpen(e.shiftKey ? 'cift' : 'seri');
    else if (k === 'e') $('layBtn').click();
    else if (k === 'g') $('returnBtn').click();
    else if (k === 'h') $('hintBtn').click();
    else if (k === 'u') undo();
    else if (k === 'm') $('muteBtn').click();
    else if (k === 'f') $('fsBtn').click();
    else if (k === 'n') $('newBtn').click();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      var ord = rackOrder(); if (!ord.length) return;
      var i = ord.indexOf(sel), n = e.key === 'ArrowRight' ? 1 : -1;
      sel = ord[i < 0 ? (n > 0 ? 0 : ord.length - 1) : (i + n + ord.length) % ord.length]; sfx.tick(); render();
    }
    else if ((e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace') && sel != null) doDiscard(sel);
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
  function boot() {
    var on = null; try { on = JSON.parse(lsGet('okey_online') || 'null'); } catch (e) {}
    if (joinCode && /^[A-Z0-9]{6}$/.test(joinCode) && !(on && on.game && on.game.online && on.game.online.code === joinCode)) {
      MODE = 'online'; showStart(); $('joinCode').value = joinCode; setTab('online');
      toast('Masaya katılmak için adını yaz ve Katıl\'a bas.');
      return;
    }
    if (on && on.game && on.game.mode === 'online') {
      game = on.game; me = game.online.seat;
      if (on.lobby || game.lobby) { showLobby(); return; }
      if (game.online.isHost && on.st) { st = restore(on.st); rack = on.rack || []; refreshView(); syncRack(); render(); startHost(); toast('Masaya geri döndün.'); publish(); if (st.over) handEnd(); else advance(); return; }
      if (!game.online.isHost) { rack = on.rack || []; game.ver = 0; game.lastEvent = 0; clearInterval(clientTimer); clientTimer = setInterval(clientPoll, 1000); clientPoll(); toast('Masaya geri döndün.'); return; }
    }
    var sv = null; try { sv = JSON.parse(lsGet('okey_save') || 'null'); } catch (e) {}
    if (sv && sv.v === 2 && sv.st) {
      game = sv.game; me = 0; st = restore(sv.st); rack = sv.rack || []; refreshView(); syncRack(); render();
      if (!st.over) { toast('Kaldığın yerden devam ediyorsun.'); advance(); }
      else if (game.idx < game.hands || game.mode === 'daily') handEnd();
      else showStart();
      return;
    }
    showStart();
  }
  $('joinBtn').onclick = function () {
    var n = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 16), c = $('joinCode').value.trim().toUpperCase();
    if (!validName(n)) { toast('Önce 2–16 karakterlik bir ad yaz.'); $('nameIn').focus(); return; }
    if (!/^[A-Z0-9]{6}$/.test(c)) { toast('Masa kodu 6 karakter olmalı.'); return; }
    lsSet('okey_name', n); audio(); joinTable(c, n);
  };
  boot();
})();
