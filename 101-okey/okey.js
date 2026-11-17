/* 101 Okey — arayüz (masa, ıstaka, sürükle-bırak, botlar). Kurallar okey-motor.js'te. */
(function () {
  'use strict';
  var M = window.OkeyMotor;
  var $ = function (id) { return document.getElementById(id); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('tr-TR'); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  $('yr').textContent = new Date().getFullYear();

  var BOT_NAMES = ['Ayşe', 'Mehmet', 'Zeynep'], SEAT_COLORS = ['#ff5a1f', '#3366ff', '#a845e8', '#22b35e'];
  var game = null, st = null, rack = [], sel = null, busy = false;

  // ---------- tema + ses ----------
  var root = document.documentElement;
  $('themeBtn').onclick = function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); lsSet('theme', n);
  };
  var actx = null, muted = lsGet('okey_mute') === '1';
  function syncSound() {
    $('soundBtn').setAttribute('aria-pressed', muted ? 'true' : 'false');
    $('soundBtn').querySelector('.w').style.display = muted ? 'none' : '';
    $('soundBtn').querySelector('.x').style.display = muted ? '' : 'none';
  }
  $('soundBtn').onclick = function () { muted = !muted; lsSet('okey_mute', muted ? '1' : '0'); syncSound(); audio(); };
  syncSound();
  function audio() { if (actx || muted) { if (actx && actx.state === 'suspended') actx.resume(); return; } try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  function tone(f, d, type, v, delay) {
    if (muted || !actx) return;
    var t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v || 0.12, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + d + 0.02);
  }
  var sfx = {
    tick: function () { tone(1400, 0.03, 'square', 0.03); tone(700, 0.05, 'triangle', 0.05, 0.01); },
    draw: function () { tone(520, 0.06, 'triangle', 0.08); tone(780, 0.07, 'triangle', 0.06, 0.04); },
    drop: function () { tone(240, 0.07, 'square', 0.04); tone(160, 0.09, 'triangle', 0.08, 0.01); },
    open: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.09, i * 0.07); }); },
    bad: function () { tone(180, 0.25, 'sawtooth', 0.06); tone(120, 0.3, 'sawtooth', 0.05, 0.12); },
    win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.22, 'square', 0.04, i * 0.09); tone(f * 2, 0.22, 'sine', 0.04, i * 0.09); }); }
  };

  // ---------- kayıt ----------
  function serialize(s) {
    var ids = function (a) { return a.map(function (t) { return t.id; }); };
    return {
      tiles: Object.keys(s.byId).map(function (k) { return s.byId[k]; }), ind: s.indicator.id, okey: s.okey, seed: s.seed,
      deck: ids(s.deck), hands: s.hands.map(ids), discards: s.discards.map(ids),
      table: s.table.map(function (m) { return { owner: m.owner, type: m.type, ids: ids(m.tiles), v: m.v }; }),
      opened: s.opened, openedThisTurn: s.openedThisTurn, turn: s.turn, dealer: s.dealer, phase: s.phase, sideTaken: s.sideTaken,
      noSide: s.noSide, penalties: s.penalties, over: s.over, result: s.result, turnCount: s.turnCount, log: []
    };
  }
  function restore(o) {
    var byId = {}; o.tiles.forEach(function (t) { byId[t.id] = t; });
    var T = function (a) { return a.map(function (id) { return byId[id]; }); };
    return {
      byId: byId, indicator: byId[o.ind], okey: o.okey, seed: o.seed, deck: T(o.deck), hands: o.hands.map(T), discards: o.discards.map(T),
      table: o.table.map(function (m) { return { owner: m.owner, type: m.type, tiles: T(m.ids), v: m.v }; }),
      opened: o.opened, openedThisTurn: o.openedThisTurn, turn: o.turn, dealer: o.dealer, phase: o.phase, sideTaken: o.sideTaken,
      noSide: o.noSide, penalties: o.penalties, over: o.over, result: o.result, turnCount: o.turnCount, log: []
    };
  }
  function save() { if (game && st) lsSet('okey_save', JSON.stringify({ v: 1, game: game, st: serialize(st), rack: rack })); }
  function loadSave() { try { var o = JSON.parse(lsGet('okey_save') || 'null'); return o && o.v === 1 ? o : null; } catch (e) { return null; } }

  // ---------- taş görünümü ----------
  function tileEl(t, cls) {
    var d = document.createElement('div');
    d.className = 'tile ' + t.c + (t.joker ? ' joker' : '') + (t.fake ? ' fake' : '') + (cls ? ' ' + cls : '');
    d.dataset.id = t.id;
    d.innerHTML = '<span>' + t.n + '</span>' + (t.joker ? '<i class="jk" aria-hidden="true">★</i>' : '');
    d.setAttribute('aria-label', (t.fake ? 'Sahte okey ' : t.joker ? 'Okey ' : '') + ({ k: 'kırmızı', s: 'sarı', m: 'mavi', y: 'siyah' }[t.c]) + ' ' + t.n);
    return d;
  }
  function miniHTML(t) { var e = tileEl(t, 'mini'); e.style.setProperty('--tw', '26px'); e.style.setProperty('--th', '36px'); return e.outerHTML; }
  function names() { return [game.name || 'Sen'].concat(BOT_NAMES); }

  // ---------- ıstaka ----------
  var SLOTS = 30, ROW = 15;
  function handIds() { return st.hands[0].map(function (t) { return t.id; }); }
  function syncRack(fresh) {
    var ids = handIds(), has = {};
    ids.forEach(function (i) { has[i] = 1; });
    for (var s = 0; s < SLOTS; s++) if (rack[s] != null && !has[rack[s]]) rack[s] = null;
    var inRack = {}; rack.forEach(function (i) { if (i != null) inRack[i] = 1; });
    ids.forEach(function (i) {
      if (inRack[i]) return;
      var slot = -1;
      for (var s2 = SLOTS - 1; s2 >= 0; s2--) if (rack[s2] == null) { slot = s2; break; }
      rack[slot] = i; if (fresh) fresh[i] = 1;
    });
  }
  // gruplar: ıstakadaki yan yana taşlar
  function groups() {
    var out = [];
    for (var r = 0; r < 2; r++) {
      var cur = [];
      for (var c = 0; c < ROW; c++) {
        var id = rack[r * ROW + c];
        if (id != null) cur.push(st.byId[id]); else { if (cur.length) out.push(cur); cur = []; }
      }
      if (cur.length) out.push(cur);
    }
    return out;
  }
  function seriGroups() { return groups().filter(function (g) { return g.length >= 3 && M.checkMeld(g); }); }
  function pairGroups() { return groups().filter(function (g) { return g.length === 2 && M.checkPair(g); }); }
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
  function sortTiles(ts) {
    var ord = { k: 0, s: 1, m: 2, y: 3 };
    return ts.slice().sort(function (a, b) { return (a.joker - b.joker) || (ord[a.c] - ord[b.c]) || (a.n - b.n); });
  }
  // kalan taşları renklere göre küçük gruplara ayır (sığmazsa tek parça)
  function restGroups(rest) {
    var by = {}; sortTiles(rest).forEach(function (t) { var k = t.joker ? 'j' : t.c; (by[k] = by[k] || []).push(t); });
    return Object.keys(by).map(function (k) { return by[k]; });
  }
  function compact(gs) {
    var all = [].concat.apply([], gs), out = [];
    for (var i = 0; i < SLOTS; i++) out.push(all[i] ? all[i].id : null);
    return out;
  }
  function arrangeSeri() {
    var bm = M.bestMelds(st.hands[0]);
    var gs = bm.melds.concat(restGroups(bm.rest));
    rack = place(gs) || place(bm.melds.concat([sortTiles(bm.rest)])) || compact(gs); sel = null;
  }
  function arrangePairs() {
    var bp = M.bestPairs(st.hands[0]);
    var gs = bp.pairs.concat(restGroups(bp.rest));
    rack = place(gs) || place(bp.pairs.concat([sortTiles(bp.rest)])) || compact(gs); sel = null;
  }
  function arrangeSorted() { var gs = restGroups(st.hands[0]); rack = place(gs) || compact(gs); sel = null; }

  // ---------- avatarlar (kendi çizimimiz: renkli zemin + yüz + saç) ----------
  var AV = [
    { bg: '#ffd8b0', skin: '#f2c49b', hair: '#3b2a1e', shirt: '#ff5a1f', style: 0 },
    { bg: '#ffd9e6', skin: '#f5cfa8', hair: '#6b3d1f', shirt: '#e2457a', style: 2 },   // Ayşe
    { bg: '#cfe3ff', skin: '#e9b48a', hair: '#151515', shirt: '#2f6df0', style: 1 },   // Mehmet
    { bg: '#cdf3dc', skin: '#d9a77c', hair: '#1f1410', shirt: '#17975a', style: 4 }    // Zeynep
  ];
  function avatarSVG(p) {
    var a = AV[p], hair;
    if (a.style === 0) hair = '<path d="M20 30c0-11 8-17 16-17s16 6 16 17c-4-5-9-7-16-7s-12 2-16 7z" fill="' + a.hair + '"/>';
    else if (a.style === 1) hair = '<path d="M21 31c-1-12 7-18 15-18 9 0 16 6 15 18l-3-6c-4 2-9 2-12 0-3 2-9 2-12 0z" fill="' + a.hair + '"/><path d="M26 47c3 4 7 5 10 5s7-1 10-5" stroke="' + a.hair + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    else if (a.style === 2) hair = '<path d="M17 44c-2-20 6-31 19-31s21 11 19 31c-2-6-4-10-5-15-6 3-17 3-27 0-1 5-3 9-6 15z" fill="' + a.hair + '"/>';
    else if (a.style === 4) hair = '<circle cx="36" cy="14" r="7" fill="' + a.hair + '"/><path d="M19 38c-1-16 7-24 17-24s18 8 17 24c-3-7-6-11-8-14-5 2-13 2-18 0-2 3-5 7-8 14z" fill="' + a.hair + '"/>';
    else hair = '<path d="M21 28c2-9 8-14 15-14s13 5 15 14c-5-3-10-4-15-4s-10 1-15 4z" fill="' + a.hair + '"/>';
    return '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="' + a.bg + '"/>' +
      '<path d="M10 72c2-13 13-20 26-20s24 7 26 20z" fill="' + a.shirt + '"/><path d="M30 52h12v6c-2 2-10 2-12 0z" fill="' + a.skin + '"/>' +
      '<ellipse cx="36" cy="35" rx="14" ry="16" fill="' + a.skin + '"/>' + hair +
      '<circle cx="30.5" cy="36" r="1.8" fill="#222"/><circle cx="41.5" cy="36" r="1.8" fill="#222"/>' +
      '<path d="M31 43c3 2.4 7 2.4 10 0" stroke="#7a3b2a" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
  }

  // ---------- sahneyi ekrana sığdır ----------
  var BW = 1100, BH = 680;
  function fit() {
    var wrap = $('stageWrap'), board = $('board');
    var fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    var availW = wrap.clientWidth, top = fs ? 0 : Math.max(0, wrap.getBoundingClientRect().top + scrollY - scrollY);
    // yatay telefonda üst başlık gizlenir; tüm yüksekliği kullan
    var headerHidden = innerHeight <= 560 && innerWidth > innerHeight;
    var availH = fs ? innerHeight : innerHeight - (headerHidden ? 12 : 86);
    var k = Math.min(availW / BW, Math.max(0.3, availH / BH));
    if (fs) k = Math.min(innerWidth / BW, innerHeight / BH);
    board.style.transform = 'scale(' + k + ')';
    board.style.left = Math.max(0, (availW - BW * k) / 2) + 'px';
    wrap.style.height = Math.round(BH * k) + 'px';
    void top;
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

  // ---------- çizim ----------
  function render(freshIds) {
    if (!st) return;
    var nm = names();
    $('handChip').textContent = 'El ' + (game.idx + 1) + ' / ' + game.hands;
    setMini($('indMini'), st.indicator.c, st.indicator.n); setMini($('okeyMini'), st.okey.c, st.okey.n);
    $('scoreChips').innerHTML = nm.map(function (n, i) { return '<span class="chip">' + esc(n) + ' <b>' + fmt(game.totals[i]) + '</b></span>'; }).join('');
    [0, 1, 2, 3].forEach(renderPlate);
    renderMelds(); renderPiles(); renderRack(freshIds); renderButtons();
  }
  function setMini(el, c, n) { el.textContent = n; el.style.color = 'var(--t-' + c + ')'; }
  function renderPlate(p) {
    var el = $('pl' + p), nm = names()[p], o = st.opened[p];
    var keep = el.querySelector('.say'), sayHTML = keep ? keep.outerHTML : '<div class="say"></div>';
    el.classList.toggle('turn', st.turn === p && !st.over);
    var status = o === 'cift' ? 'ÇİFT' : o ? 'AÇTI' : '';
    var sub = p === 0 ? st.hands[0].length + ' taş · <i>' + fmt(game.totals[0]) + '</i>' : st.hands[p].length + ' taş · <i>' + fmt(game.totals[p]) + '</i>';
    el.innerHTML = sayHTML + '<div class="av">' + avatarSVG(p) + (status ? '<span class="badge">' + status + '</span>' : '') + '</div>' +
      '<div class="np"><b>' + esc(nm) + '</b><small>' + sub + '</small></div>';
  }
  function meldEl(m, i) {
    var d = document.createElement('div'); d.className = 'meld'; d.dataset.mi = i;
    m.tiles.forEach(function (t) { d.appendChild(tileEl(t)); });
    return d;
  }
  // panolar: sol üst Zeynep, sağ üst Mehmet, sol alt sen, sağ alt Ayşe
  var QUAD = [3, 2, 0, 1];
  function renderMelds() {
    var nm = names(), q = $('quads'), c = $('ciftCols');
    q.innerHTML = ''; c.innerHTML = '';
    QUAD.forEach(function (p) {
      var box = document.createElement('div'); box.className = 'quad' + (p === 0 ? ' mine' : '');
      st.table.forEach(function (m, i) { if (m.owner === p && m.type !== 'pair') box.appendChild(meldEl(m, i)); });
      box.insertAdjacentHTML('beforeend', '<span class="qn">' + esc(nm[p]) + '</span>');
      q.appendChild(box);
    });
    [0, 1, 2, 3].forEach(function (p) {
      var col = document.createElement('div'); col.className = 'ccol' + (p === 0 ? ' mine' : '');
      st.table.forEach(function (m, i) {
        if (m.owner !== p || m.type !== 'pair') return;
        var pr = document.createElement('div'); pr.className = 'pr';
        m.tiles.forEach(function (t) { pr.appendChild(tileEl(t)); });
        col.appendChild(pr); void i;
      });
      col.insertAdjacentHTML('beforeend', '<span class="qn">' + esc(nm[p]) + '</span>');
      c.appendChild(col);
    });
    if (sel != null && st.turn === 0 && st.phase === 'play' && st.opened[0] === 'seri') {
      var t = st.byId[sel];
      q.querySelectorAll('.meld').forEach(function (d) { if (M.addToMeld(st.table[+d.dataset.mi], t)) d.classList.add('can'); });
    }
  }
  function slotTile(id, t, cls) {
    var el = $(id); el.querySelectorAll('.tile').forEach(function (x) { x.remove(); });
    if (t) el.insertBefore(tileEl(t, cls), el.firstChild);
  }
  function renderPiles() {
    var nm = names();
    var myDraw = st.turn === 0 && st.phase === 'draw' && !st.over && !busy;
    slotTile('d3', M.sideTile(st, 0));
    $('d3').classList.toggle('live', myDraw && !!M.sideTile(st, 0) && st.noSide !== 0);
    slotTile('d2', st.discards[2][st.discards[2].length - 1]); $('d2c').textContent = nm[2];
    slotTile('d1', st.discards[1][st.discards[1].length - 1]); $('d1c').textContent = nm[1];
    slotTile('d0', st.discards[0][st.discards[0].length - 1], 'dim');
    $('d0').classList.toggle('can', st.turn === 0 && st.phase === 'play' && sel != null && !busy);
    $('deckCnt').textContent = st.deck.length; $('deck').classList.toggle('live', myDraw);
    $('indPile').innerHTML = ''; $('indPile').appendChild(tileEl(st.indicator));
  }
  function renderRack(freshIds) {
    var el = $('rack'); el.innerHTML = '';
    for (var s = 0; s < SLOTS; s++) {
      var slot = document.createElement('div'); slot.className = 'slot'; slot.dataset.s = s;
      var id = rack[s];
      if (id != null) slot.appendChild(tileEl(st.byId[id], (sel === id || st.sideTaken === id ? 'sel' : '') + (freshIds && freshIds[id] ? ' new' : '')));
      el.appendChild(slot);
    }
    var o = st.opened[0], sum = seriGroups().reduce(function (a, g) { return a + M.checkMeld(g).value; }, 0), pc = pairGroups().length;
    var b = $('sumBadge');
    if (o === 'seri') { b.innerHTML = st.hands[0].length + '<small>TAŞ</small>'; b.classList.remove('ok'); b.title = 'Elindeki taş sayısı'; }
    else if (o === 'cift' || (pc >= 4 && sum < 101)) { b.innerHTML = pc + '<small>ÇİFT</small>'; b.classList.toggle('ok', !o && pc >= 5); b.title = 'Dizili çift sayısı'; }
    else { b.textContent = sum; b.classList.toggle('ok', sum >= 101); b.title = 'Istakada dizili perlerin toplamı'; }
  }
  function renderButtons() {
    var my = st.turn === 0 && !st.over && !busy, play = my && st.phase === 'play', o = st.opened[0];
    var sum = seriGroups().reduce(function (a, g) { return a + M.checkMeld(g).value; }, 0), pc = pairGroups().length;
    $('openSeri').hidden = !!o; $('openCift').hidden = !!o; $('layBtn').hidden = !o;
    $('openSeri').disabled = !play; $('openCift').disabled = !play; $('layBtn').disabled = !play;
    $('openSeri').classList.toggle('hot', play && !o && sum >= 101);
    $('openCift').classList.toggle('hot', play && !o && pc >= 5);
    var sideUnused = st.sideTaken != null && st.hands[0].some(function (t) { return t.id === st.sideTaken; });
    $('returnBtn').hidden = !(play && sideUnused);
    var h = '';
    if (st.over) h = '';
    else if (!my) h = 'Sıra ' + names()[st.turn] + "'" + bulunma(names()[st.turn]) + '…';
    else if (st.phase === 'draw') h = 'Desteden ya da sol alttaki yan taştan bir taş çek.';
    else if (sideUnused) h = 'Yandan aldığın taşı bu tur kullanmalısın.';
    else if (!o && sum >= 101) h = '101\'e ulaştın: Seri aç!';
    else if (!o && pc >= 5) h = '5 çiftin var: Çift aç!';
    else if (st.hands[0].length === 1) h = 'Son taşını at, eli bitir!';
    else h = 'Bir taşı sağ alttaki yuvaya sürükle ya da çift tıkla.';
    $('hint').textContent = h;
  }
  // Türkçe bulunma eki: Ayşe'de, Mehmet'te, Burak'ta, Ali'de
  function bulunma(n) {
    var low = String(n).toLocaleLowerCase('tr'), v = low.match(/[aeıioöuü](?=[^aeıioöuü]*$)/);
    var front = v && 'eiöü'.indexOf(v[0]) >= 0, hard = 'çfhkpsşt'.indexOf(low.slice(-1)) >= 0;
    return (hard ? 't' : 'd') + (front ? 'e' : 'a');
  }
  function say(p, text) {
    var e = $('pl' + p) && $('pl' + p).querySelector('.say'); if (!e) return;
    e.textContent = text; e.classList.add('on');
    clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('on'); }, 1500 * game.speed + 400);
  }
  var toastT = 0;
  function toast(m) { var e = $('toast'); e.textContent = m; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 3200); }

  // ---------- hatalar ----------
  var ERR = {
    need_101: 'Açmak için dizili perlerin toplamı en az 101 olmalı.', need_pairs: 'Çifte gitmek için en az 5 çift gerekli.',
    bad_group: 'Istakada geçersiz bir grup var.', need_discard: 'Atmak için elinde en az bir taş kalmalı.',
    must_use_side: 'Yandan aldığın taşı önce kullanmalısın (ya da geri koy, 101 ceza).', cant_process: 'Bu taş o pere işlenemez.',
    pairs_cant_process: 'Çifte giden oyuncu masaya taş işleyemez.', not_open: 'Taş işlemek için önce elini açmalısın.',
    side_returned: 'Bu tur yandan tekrar alamazsın.', no_side: 'Yanda alınacak taş yok.'
  };
  function fail(r) { toast(ERR[r.error] || 'Bu hamle yapılamaz.'); sfx.bad(); }

  // ---------- oyuncu hamleleri ----------
  function myTurn(phase) { return st && st.turn === 0 && !st.over && !busy && (!phase || st.phase === phase); }
  function drawFrom(side) {
    if (!myTurn('draw')) return;
    audio();
    var r = M.draw(st, 0, side);
    if (!r.ok) return fail(r);
    if (st.over) return handEnd();
    var fresh = {}; syncRack(fresh); sfx.draw(); render(fresh); save();
  }
  $('deck').onclick = function () { drawFrom(false); };
  $('d3').onclick = function () { drawFrom(true); };
  function doOpen(kind) {
    if (!myTurn('play')) return;
    var gs = kind === 'cift' ? pairGroups() : seriGroups();
    var r = M.open(st, 0, gs.map(function (g) { return g.map(function (t) { return t.id; }); }), kind);
    if (!r.ok) return fail(r);
    syncRack(); sfx.open(); toast(kind === 'cift' ? r.count + ' çiftle çifte gittin!' : r.value + ' ile elini açtın!');
    render(); save();
  }
  $('openSeri').onclick = function () { doOpen('seri'); };
  $('openCift').onclick = function () { doOpen('cift'); };
  $('layBtn').onclick = function () {
    if (!myTurn('play')) return;
    var gs = st.opened[0] === 'cift' ? pairGroups() : seriGroups(), n = 0, last = null;
    gs.forEach(function (g) { var r = M.lay(st, 0, g.map(function (t) { return t.id; })); if (r.ok) n++; else last = r; });
    if (!n) { if (last) fail(last); else toast(st.opened[0] === 'cift' ? 'Istakada yan yana dizili bir çift yok.' : 'Istakada yan yana dizili geçerli bir per yok (en az 3 taş).'); return; }
    syncRack(); sfx.open(); render(); save();
  };
  function doProcess(id, mi) {
    if (!myTurn('play')) return;
    var r = M.process(st, 0, id, mi);
    if (!r.ok) return fail(r);
    sel = null; syncRack(); sfx.drop(); render(); save();
  }
  function doDiscard(id) {
    if (!myTurn('play')) return;
    var r = M.discard(st, 0, id);
    if (!r.ok) return fail(r);
    sel = null; syncRack(); sfx.drop();
    if (r.penalty) { toast(r.penalty === 'okey' ? 'Okey attın: 101 ceza!' : 'Masaya işlenebilecek taş attın: 101 ceza!'); sfx.bad(); }
    render(); save();
    if (st.over) return handEnd();
    advance();
  }
  $('returnBtn').onclick = function () {
    if (!myTurn('play')) return;
    var r = M.returnSide(st, 0); if (!r.ok) return fail(r);
    toast('Yan taşı geri koydun: 101 ceza. Şimdi desteden çek.'); sfx.bad(); syncRack(); render(); save();
  };
  $('sortSeri').onclick = function () { if (!st) return; arrangeSeri(); sfx.tick(); render(); save(); };
  $('sortCift').onclick = function () { if (!st) return; arrangePairs(); sfx.tick(); render(); save(); };

  // ---------- sürükle-bırak + seçim ----------
  var drag = null, lastTap = { id: null, t: 0 };
  $('rack').addEventListener('pointerdown', function (e) {
    var te = e.target.closest('.tile'); if (!te || !st) return;
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
  function setOver(t) {
    if (overEl) overEl.classList.remove('over', 'drop');
    overEl = t ? t.el : null;
    if (overEl) overEl.classList.add(t.kind === 'slot' ? 'over' : 'drop');
  }
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('ghost'); drag.ghost.classList.remove('sel');
      var r = drag.el.getBoundingClientRect();
      drag.ghost.style.setProperty('--tw', r.width + 'px'); drag.ghost.style.setProperty('--th', r.height + 'px');
      document.body.appendChild(drag.ghost); drag.el.classList.add('dim');
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
    if (!d.ghost) { // tıklama: seç / bırak · aynı taşa hızlı ikinci dokunuş: at
      var nowT = Date.now();
      if (lastTap.id === d.id && nowT - lastTap.t < 330) { lastTap = { id: null, t: 0 }; doDiscard(d.id); return; }
      lastTap = { id: d.id, t: nowT };
      sel = sel === d.id ? null : d.id; sfx.tick(); render(); return;
    }
    if (!t) { render(); return; }
    if (t.kind === 'slot') {
      var other = rack[t.s]; rack[t.s] = d.id; rack[d.from] = other != null && t.s !== d.from ? other : (t.s === d.from ? d.id : null);
      sfx.tick(); render(); save();
    } else if (t.kind === 'discard') doDiscard(d.id);
    else if (t.kind === 'meld') doProcess(d.id, t.mi);
  });
  document.addEventListener('pointercancel', function () { if (drag && drag.ghost) drag.ghost.remove(); drag = null; setOver(null); render(); });
  $('seriPanel').addEventListener('click', function (e) {
    var m = e.target.closest('.meld'); if (m && sel != null) doProcess(sel, +m.dataset.mi);
  });
  $('d0').addEventListener('click', function () { if (sel != null) doDiscard(sel); });
  // çift tıklayınca at
  // çift tıklama pointerup içinde yakalanıyor (fare ve dokunmada aynı)

  // ---------- botlar ----------
  function delay(ms) { return sleep(ms * game.speed); }
  async function botTurn(p) {
    busy = true; render();
    await delay(650);
    if (st.phase === 'draw') {
      var side = M.botWantsSide(st, p);
      var r = M.draw(st, p, side);
      if (st.over) return;
      if (r.ok) { say(p, side ? 'Yandan aldı' : 'Desteden çekti'); sfx.draw(); }
      render(); await delay(600);
    }
    var acts = M.botPlay(st, p);
    if (acts.length) {
      var op = acts.find(function (a) { return a.a === 'open'; });
      if (op) { say(p, op.kind === 'cift' ? 'Çifte gitti!' : op.value + ' ile açtı!'); sfx.open(); toast(names()[p] + (op.kind === 'cift' ? ' çifte gitti.' : ' ' + op.value + ' ile elini açtı.')); }
      else if (acts.some(function (a) { return a.a === 'process' || a.a === 'lay'; })) say(p, 'Taş işledi');
      if (acts.some(function (a) { return a.a === 'return'; })) say(p, 'Yan taşı geri koydu');
      render(); await delay(700);
    }
    if (st.phase === 'draw') { M.draw(st, p, false); if (st.over) return; render(); await delay(400); }
    var id = M.chooseDiscard(st, p), dr = M.discard(st, p, id);
    if (dr.ok) {
      sfx.drop();
      if (dr.penalty) { toast(names()[p] + (dr.penalty === 'okey' ? ' okey attı: 101 ceza!' : ' işlek taş attı: 101 ceza!')); }
      say(p, st.over ? 'Bitirdi!' : 'Taş attı');
    }
  }
  async function advance() {
    save();
    while (st && !st.over && st.turn !== 0) {
      await botTurn(st.turn);
      busy = false; render(); save();
    }
    busy = false;
    if (st.over) return handEnd();
    render();
  }

  // ---------- el / oyun ----------
  function newGame(name, hands, speed) {
    game = { name: name || 'Sen', hands: hands, speed: speed, idx: 0, totals: [0, 0, 0, 0], dealer: Math.floor(Math.random() * 4) };
    lsSet('okey_name', game.name); lsSet('okey_hands', String(hands)); lsSet('okey_speed', String(speed));
    startHand();
  }
  function startHand() {
    st = M.newHand(1 + Math.floor(Math.random() * 0x7ffffffe), game.dealer);
    rack = []; for (var i = 0; i < SLOTS; i++) rack.push(null);
    syncRack(); arrangeSorted(); sel = null; busy = false;
    $('startModal').hidden = true; $('endModal').hidden = true; fit();
    if (innerHeight < 760) { try { $('stageWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    render(); save();
    toast(game.dealer === 0 ? 'Dağıtan sensin: 22 taşın var, bir taş atarak başla.' : names()[game.dealer] + ' dağıttı.');
    advance();
  }
  var REASON = { open: '', notopen: 'açmadı', cift: 'çift ×2' };
  function handEnd() {
    var res = st.result, nm = names();
    if (!res) return;
    if (!st._counted) {
      for (var i = 0; i < 4; i++) game.totals[i] += res.points[i];
      st._counted = true;
      game.idx++; game.dealer = (game.dealer + 1) % 4;
      var stats = JSON.parse(lsGet('okey_stats') || '{"hands":0,"won":0,"games":0,"gwon":0}');
      stats.hands++; if (res.winner === 0) stats.won++;
      lsSet('okey_stats', JSON.stringify(stats));
    }
    var last = game.idx >= game.hands;
    render();
    var w = res.winner;
    $('endLabel').textContent = last ? 'Oyun bitti' : 'El ' + game.idx + '/' + game.hands + ' bitti';
    var title, sub = '';
    if (w < 0) title = 'Deste bitti';
    else { title = (w === 0 ? 'Elini bitirdin!' : nm[w] + ' bitirdi'); var inf = res.info || {}; var m = [];
      if (inf.okey) m.push('okeyle'); if (inf.cift) m.push('çiftle'); if (inf.elden) m.push('elden');
      if (m.length) sub = m.join(', ') + ' bitirme: puanlar ×' + inf.mult; }
    if (last) {
      var best = game.totals.indexOf(Math.min.apply(null, game.totals));
      title = best === 0 ? 'Kazandın! 🎉' : nm[best] + ' kazandı';
      sub = 'En düşük toplam kazanır.';
      var stats2 = JSON.parse(lsGet('okey_stats') || '{"hands":0,"won":0,"games":0,"gwon":0}');
      if (!game._finished) { stats2.games++; if (best === 0) stats2.gwon++; lsSet('okey_stats', JSON.stringify(stats2)); game._finished = true; }
      if (best === 0) sfx.win(); else sfx.bad();
    } else if (w === 0) sfx.win();
    $('endTitle').textContent = title; $('endSub').textContent = sub;
    $('endRows').innerHTML = nm.map(function (n, i) {
      var why = i === w ? 'bitirdi' : !st.opened[i] ? 'açmadı (202)' : st.opened[i] === 'cift' ? 'çift: kalan ×2' : 'kalan taşlar';
      if (st.penalties[i] > 0) why += ' · ceza +' + st.penalties[i];
      return '<tr class="' + (i === w ? 'win' : '') + '"><td><b>' + esc(n) + '</b><small>' + why + '</small></td><td class="n">' + (res.points[i] > 0 ? '+' : '') + fmt(res.points[i]) + '</td><td class="n">' + fmt(game.totals[i]) + '</td></tr>';
    }).join('');
    $('nextBtn').textContent = last ? 'Yeni oyun' : 'Sonraki el';
    $('endModal').hidden = false;
    save();
  }
  $('nextBtn').onclick = function () {
    audio();
    if (game.idx >= game.hands) { lsSet('okey_save', ''); showStart(); return; }
    startHand();
  };

  // ---------- başlangıç ----------
  function segPick(id, attr, val) {
    $(id).querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset[attr] === String(val) ? 'true' : 'false'); });
  }
  function segVal(id, attr) { var b = $(id).querySelector('[aria-pressed="true"]'); return b ? +b.dataset[attr] : null; }
  ['handsSeg', 'speedSeg'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; segPick(id, id === 'handsSeg' ? 'h' : 's', b.dataset[id === 'handsSeg' ? 'h' : 's']); });
  });
  function showStart() {
    $('nameIn').value = lsGet('okey_name') || lsGet('bp_name') || '';
    segPick('handsSeg', 'h', lsGet('okey_hands') || '5'); segPick('speedSeg', 's', lsGet('okey_speed') || '1');
    var stats = JSON.parse(lsGet('okey_stats') || 'null');
    var rn = $('resumeNote');
    if (stats && stats.games) { rn.hidden = false; rn.textContent = 'Şimdiye kadar ' + stats.games + ' oyun, ' + stats.gwon + ' galibiyet · ' + stats.hands + ' el, ' + stats.won + ' kez bitirdin.'; }
    else rn.hidden = true;
    $('endModal').hidden = true; $('startModal').hidden = false;
    setTimeout(function () { $('nameIn').focus(); }, 50);
  }
  $('startBtn').onclick = function () {
    audio();
    var n = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 16);
    newGame(n || 'Sen', segVal('handsSeg', 'h') || 5, segVal('speedSeg', 's') || 1);
  };
  $('nameIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('startBtn').click(); });
  $('newBtn').onclick = function () { if (busy) return; showStart(); };
  // ---------- klavye kısayolları ----------
  function rackOrder() { return rack.filter(function (id) { return id != null; }); }
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'Escape' && !$('startModal').hidden && st) { $('startModal').hidden = true; return; }
    if (!$('startModal').hidden || !$('endModal').hidden || !st || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLocaleLowerCase('tr'), done = true;
    if (k === 'd') drawFrom(false);
    else if (k === 'y') drawFrom(true);
    else if (k === 's') $('sortSeri').click();
    else if (k === 'ç' || k === 'c') $('sortCift').click();
    else if (k === 'a') doOpen(e.shiftKey ? 'cift' : 'seri');
    else if (k === 'e') $('layBtn').click();
    else if (k === 'g') $('returnBtn').click();
    else if (k === 'm') $('soundBtn').click();
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

  // ---------- kontroller sekmeleri ----------
  function ctlTab(mob) {
    $('tabDesk').setAttribute('aria-selected', mob ? 'false' : 'true');
    $('tabMob').setAttribute('aria-selected', mob ? 'true' : 'false');
    $('ctlDesk').hidden = !!mob; $('ctlMob').hidden = !mob;
  }
  $('tabDesk').onclick = function () { ctlTab(false); };
  $('tabMob').onclick = function () { ctlTab(true); };
  if (window.matchMedia && matchMedia('(pointer:coarse)').matches) ctlTab(true);

  // ---------- açılış: kayıt varsa devam ----------
  var sv = loadSave();
  if (sv && sv.st && !sv.st.over) {
    game = sv.game; st = restore(sv.st); rack = sv.rack; syncRack(); render();
    toast('Kaldığın yerden devam ediyorsun.');
    advance();
  } else if (sv && sv.st && sv.st.over && sv.game.idx < sv.game.hands) {
    game = sv.game; st = restore(sv.st); rack = sv.rack; st._counted = true; render(); handEnd();
  } else showStart();
})();
