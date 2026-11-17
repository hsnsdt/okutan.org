/* Tavla — arayüz: tahta, pullar, zarlar, sürükle-bırak, botlar, süre, sıralama, online masa (sohbet: /assets/okey-sohbet.js).
   Kurallar motor.js'te. Online masada oyunu masa sahibinin tarayıcısı yönetir (zarı o atar, hamleleri o doğrular). */
(function () {
  'use strict';
  var R = window.TavlaKural;
  var API = 'api/';
  var $ = function (id) { return document.getElementById(id); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function readJSON(k, d) { try { return JSON.parse(lsGet(k) || 'null') || d; } catch (e) { return d; } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n).toLocaleString('tr-TR'); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function post(a, body) { return fetch(API + '?a=' + a, { method: 'POST', cache: 'no-store', body: JSON.stringify(body || {}) }).then(function (r) { return r.json(); }); }
  function get(a, q) { return fetch(API + '?a=' + a + (q || ''), { cache: 'no-store' }).then(function (r) { return r.json(); }); }
  function validName(n) { n = (n || '').replace(/\s+/g, ' ').trim(); return n.length >= 2 && n.length <= 16 && /^[\p{L}\p{N}][\p{L}\p{N} ._\-]*$/u.test(n); }
  $('yr').textContent = new Date().getFullYear();

  var K_SAVE = 'tv_save', K_ONLINE = 'tv_online', K_STATS = 'tv_stats';
  var LEVEL_TR = { easy: 'Kolay', normal: 'Orta', hard: 'Zor' };
  // game: maç ayarları ve skor · S: oyun durumu (yerelde ya da masa sahibinde asıl; oyuncuda yayından kopya) · me: benim koltuğum
  // T: benim turum (önizleme): { info, left, played, snaps, work }
  var game = null, S = null, me = 0, T = null, busy = false, gen = 0;

  // ================= tema · ses =================
  var root = document.documentElement;
  $('themeBtn').onclick = function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); lsSet('theme', n);
  };
  var actx = null, master = null, muted = lsGet('tv_mute') === '1', vol = Math.min(1, Math.max(0, +(lsGet('tv_vol') || 0.8))), noiseBuf = null;
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
  $('vol').addEventListener('input', function () { vol = this.value / 100; lsSet('tv_vol', String(vol)); if (vol > 0) { muted = false; lsSet('tv_mute', '0'); } audio(); syncSound(); });
  $('vol').addEventListener('change', function () { sfx.clack(); });
  $('muteBtn').onclick = function () { muted = !muted; lsSet('tv_mute', muted ? '1' : '0'); syncSound(); };
  syncSound();
  function tone(f, d, type, v, delay) {
    if (muted || !actx) return;
    var t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v || 0.12, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + d + 0.02);
  }
  function knock(v, f, delay, len) {
    if (muted || !actx) return;
    if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.25, actx.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
    var t0 = actx.currentTime + (delay || 0), s = actx.createBufferSource(), bp = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.value = f || 1400; bp.Q.value = 1.2;
    g.gain.setValueAtTime(v || 0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (len || 0.09));
    s.connect(bp); bp.connect(g); g.connect(master); s.start(t0); s.stop(t0 + (len || 0.09) + 0.02);
    tone((f || 1400) / 9, 0.07, 'triangle', (v || 0.5) * 0.25, delay);
  }
  var sfx = {
    clack: function () { knock(0.55, 1300); },
    pick: function () { knock(0.3, 2200, 0, 0.05); },
    hit: function () { knock(0.8, 900); knock(0.5, 1600, 0.05); tone(90, 0.18, 'sine', 0.12, 0.02); },
    off: function () { knock(0.35, 2600, 0, 0.06); knock(0.25, 1900, 0.06, 0.06); },
    dice: function () { for (var i = 0; i < 7; i++) knock(0.25 + Math.random() * 0.25, 2600 + Math.random() * 2000, i * 0.055 + Math.random() * 0.02, 0.04); knock(0.5, 900, 0.42); },
    bad: function () { tone(180, 0.22, 'sawtooth', 0.05); tone(120, 0.28, 'sawtooth', 0.04, 0.1); },
    tick: function () { tone(1100, 0.04, 'square', 0.025); },
    win: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.22, 'square', 0.035, i * 0.09); tone(f * 2, 0.22, 'sine', 0.035, i * 0.09); }); }
  };

  // ================= tahta geometrisi =================
  var BW = 1100, BH = 680, PW = 62, CKS = 54;
  function disp(a) { return me === 0 ? a : 25 - a; }     // mutlak hane → ekrandaki hane (ben hep alttayım, evim sağ altta)
  function undisp(d) { return me === 0 ? d : 25 - d; }
  function pointLeft(d) {
    if (d <= 6) return 962 - d * PW;
    if (d <= 12) return 540 - (d - 6) * PW;
    if (d <= 18) return 168 + (d - 13) * PW;
    return 590 + (d - 19) * PW;
  }
  function buildPoints() {
    var L = $('pts'); L.innerHTML = '';
    for (var d = 1; d <= 24; d++) {
      var x = pointLeft(d), top = d >= 13, a = undisp(d);
      var tri = document.createElement('div'); tri.className = 'tri ' + (top ? 'up' : 'dn') + ' ' + (d % 2 ? 'a' : 'b');
      tri.style.left = (x + 3) + 'px'; L.appendChild(tri);
      var z = document.createElement('div'); z.className = 'zone ' + (top ? 'up' : 'dn'); z.dataset.a = a; z.style.left = x + 'px'; L.appendChild(z);
      var n = document.createElement('div'); n.className = 'pnum'; n.textContent = d; n.style.left = x + 'px'; n.style.top = (top ? 65 : 646) + 'px'; L.appendChild(n);
    }
  }

  // ================= pullar (kimlikli; animasyon için yer değiştirir) =================
  var stk = null, ckEls = [];
  function colorOf(id) { return id < 15 ? 0 : 1; }
  function emptyStk() { var p = {}; for (var a = 1; a <= 24; a++) p[a] = []; return { pts: p, bar: [[], []], off: [[], []] }; }
  function makeCheckers() {
    var L = $('cks'); L.innerHTML = ''; ckEls = [];
    for (var id = 0; id < 30; id++) {
      var e = document.createElement('div'); e.className = 'ck c' + colorOf(id); e.dataset.id = id; e.innerHTML = '<span class="n"></span>';
      L.appendChild(e); ckEls.push(e);
    }
  }
  // pozisyona göre pulları yerleştir; yerinde kalanların kimliğini koru
  function syncStacks(pos) {
    var old = stk || emptyStk(), nw = emptyStk(), used = {};
    function need(p, a) { if (a === 'bar') return pos.bar[p]; if (a === 'off') return pos.off[p]; var n = pos.b[a] * (p === 0 ? 1 : -1); return n > 0 ? n : 0; }
    function oldList(a, p) { return a === 'bar' ? old.bar[p] : a === 'off' ? old.off[p] : old.pts[a].filter(function (id) { return colorOf(id) === p; }); }
    function target(a, p) { return a === 'bar' ? nw.bar[p] : a === 'off' ? nw.off[p] : nw.pts[a]; }
    var locs = ['bar', 'off']; for (var a = 1; a <= 24; a++) locs.push(a);
    [0, 1].forEach(function (p) {
      locs.forEach(function (loc) {
        var n = need(p, loc), keep = oldList(loc, p).slice(0, n);
        keep.forEach(function (id) { used[id] = 1; target(loc, p).push(id); });
      });
      var pool = []; for (var id = p * 15; id < p * 15 + 15; id++) if (!used[id]) pool.push(id);
      locs.forEach(function (loc) { var t = target(loc, p); while (t.length < need(p, loc)) t.push(pool.shift()); });
    });
    stk = nw;
  }
  function moveChecker(p, m) {
    var src = m.from === 'bar' ? stk.bar[p] : stk.pts[m.from], id = src.pop();
    if (m.to === 'off') { stk.off[p].push(id); return; }
    var dst = stk.pts[m.to];
    if (dst.length === 1 && colorOf(dst[0]) !== p) stk.bar[1 - p].push(dst.pop());
    dst.push(id);
  }
  function layout() {
    if (!stk) return;
    function place(id, x, y, off) {
      var e = ckEls[id]; e.style.left = x + 'px'; e.style.top = y + 'px'; e.classList.toggle('off', !!off); e.querySelector('.n').textContent = '';
    }
    for (var a = 1; a <= 24; a++) {
      var ids = stk.pts[a], n = ids.length; if (!n) continue;
      var d = disp(a), x = pointLeft(d) + 4, top = d >= 13, step = n <= 5 ? CKS : Math.max(16, (226 - CKS) / (n - 1));
      ids.forEach(function (id, i) { place(id, x, top ? 82 + i * step : 644 - 2 - CKS - i * step); });
      if (n > 5) ckEls[ids[n - 1]].querySelector('.n').textContent = n;
    }
    [0, 1].forEach(function (p) {
      var mine = p === me;
      stk.bar[p].forEach(function (id, i) { place(id, 538, mine ? 250 - i * 36 : 376 + i * 36); });
      stk.off[p].forEach(function (id, i) { place(id, 996, mine ? 644 - 8 - 14 - i * 16 : 88 + i * 16, true); });
    });
  }
  function shownPos() { return T ? T.work : S ? S.pos : R.newPos(); }

  // ================= sahneyi sığdır =================
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
  function boardScale() { return $('board').getBoundingClientRect().width / BW; }
  function toBoard(cx, cy) { var r = $('board').getBoundingClientRect(), k = r.width / BW; return { x: (cx - r.left) / k, y: (cy - r.top) / k }; }

  // ================= avatarlar ve plakalar =================
  var AV = [
    { bg: '#ffd8b0', skin: '#f2c49b', hair: '#3b2a1e', shirt: '#ff5a1f', style: 0 },
    { bg: '#cfe3ff', skin: '#e9b48a', hair: '#151515', shirt: '#2f6df0', style: 1 }
  ];
  function avatarSVG(i) {
    var a = AV[i], hair = a.style === 0 ? '<path d="M20 30c0-11 8-17 16-17s16 6 16 17c-4-5-9-7-16-7s-12 2-16 7z" fill="' + a.hair + '"/>'
      : '<path d="M21 31c-1-12 7-18 15-18 9 0 16 6 15 18l-3-6c-4 2-9 2-12 0-3 2-9 2-12 0z" fill="' + a.hair + '"/><path d="M26 47c3 4 7 5 10 5s7-1 10-5" stroke="' + a.hair + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
    return '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="' + a.bg + '"/><path d="M10 72c2-13 13-20 26-20s24 7 26 20z" fill="' + a.shirt + '"/><path d="M30 52h12v6c-2 2-10 2-12 0z" fill="' + a.skin + '"/><ellipse cx="36" cy="35" rx="14" ry="16" fill="' + a.skin + '"/>' + hair +
      '<circle cx="30.5" cy="36" r="1.8" fill="#222"/><circle cx="41.5" cy="36" r="1.8" fill="#222"/><path d="M31 43c3 2.4 7 2.4 10 0" stroke="#7a3b2a" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
  }
  function names() { return (game && game.names ? game.names : ['Sen', 'Mehmet']).map(function (n) { return String(n || '').replace(/\s*\(bot\)$/, ''); }); }
  function plateEl(seat) { return seat === me ? $('plB') : $('plT'); }
  function renderPlates() {
    if (!game || !S) return;
    var nm = names(), pos = shownPos();
    [0, 1].forEach(function (seat) {
      var el = plateEl(seat), keep = el.querySelector('.say'), sayHTML = '';
      el.classList.toggle('turn', S.turn === seat && S.phase !== 'over' && S.phase !== 'opening');
      var lvl = game.levels && game.levels[seat] ? LEVEL_TR[game.levels[seat]] : '';
      el.innerHTML = sayHTML + '<div class="av"><div class="ring"></div>' + avatarSVG(seat === me ? 0 : 1) + '</div>' +
        '<div class="np"><b><i class="chip2 c' + seat + '"></i>' + esc(nm[seat]) + '</b><small>' + (lvl ? lvl + ' · ' : '') + 'Maç <i>' + game.score[seat] + '</i></small><span class="pipv">PİP ' + R.pip(pos, seat) + '</span></div>';
    // balon aynı öğe olarak kalır: kapanma zamanlayıcısı çalışmaya devam eder
    el.insertBefore(keep || Object.assign(document.createElement('div'), { className: 'say' }), el.firstChild);
    });
  }

  // ================= zarlar =================
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHTML(v, cls) { var h = ''; for (var i = 0; i < 9; i++) h += '<i' + (PIPS[v].indexOf(i) >= 0 ? ' class="on"' : '') + '></i>'; return '<div class="die ' + (cls || '') + '">' + h + '</div>'; }
  // seat'in zarlarını kendi tarafına çiz; used: kullanılan zar sayısı (sıraya göre)
  function renderDice(roll) {
    $('diceL').innerHTML = ''; $('diceR').innerHTML = '';
    if (!S) return;
    if (S.phase === 'opening' && S.opening) {
      [0, 1].forEach(function (seat) { if (S.opening[seat]) (seat === me ? $('diceR') : $('diceL')).innerHTML = dieHTML(S.opening[seat], (seat === 1 ? 'd1' : '') + (roll ? ' roll' : '')); });
      return;
    }
    if (!S.dice || (S.phase !== 'move')) return;
    var seat = S.turn, box = seat === me ? $('diceR') : $('diceL'), dbl = S.dice[0] === S.dice[1];
    var all = dbl ? [S.dice[0], S.dice[0], S.dice[0], S.dice[0]] : S.dice.slice();
    var left = T && seat === me ? T.left.slice() : (S.left || all).slice();
    var h = '';
    all.forEach(function (v) { var i = left.indexOf(v), used = i < 0; if (!used) left.splice(i, 1); h += dieHTML(v, (dbl ? 'sm ' : '') + (seat === 1 ? 'd1 ' : '') + (used ? 'used ' : '') + (roll ? 'roll' : '')); });
    box.innerHTML = h;
    box.style.left = (seat === me ? (dbl ? 694 : 716) : (dbl ? 272 : 294)) + 'px';
    box.style.top = (dbl ? 341 : 335) + 'px';
  }

  // ================= çizim =================
  var hintMark = null;
  function render(rollAnim) {
    if (!game || !S) return;
    $('matchChip').innerHTML = 'Maç: ' + game.target + ' puan · Oyun ' + (game.gameNo || 1);
    var nm = names();
    $('scoreChip').innerHTML = esc(nm[me]) + ' <b>' + game.score[me] + '</b> – <b>' + game.score[1 - me] + '</b> ' + esc(nm[1 - me]);
    layout(); renderPlates(); renderDice(rollAnim); renderControls();
  }
  function myTurnPhase(ph) { return !!(S && game && S.turn === me && S.phase === ph && !busy && (!game.pending)); }
  function renderControls() {
    var rollable = myTurnPhase('roll') && !isBotSeat(me);
    $('rollBtn').hidden = !rollable;
    var moving = !!T && S.phase === 'move' && S.turn === me;
    $('mvBtns').hidden = !moving;
    var done = moving && T.played.length >= T.info.max;
    $('undoBtn').disabled = !moving || !T.played.length;
    $('doneBtn').disabled = !moving || !done; $('doneBtn').classList.toggle('hot', !!done);
    $('hintBtn').disabled = !(moving && !done) && !rollable;
    // oynanabilir pullar
    ckEls.forEach(function (e) { e.classList.remove('mv', 'sel', 'hintpulse'); });
    document.querySelectorAll('#pts .zone').forEach(function (z) { z.classList.remove('can', 'hintpulse'); });
    $('trayB').classList.remove('can');
    if (moving && !done) {
      T.cands.forEach(function (m) { var id = topChecker(m.from); if (id != null) ckEls[id].classList.add('mv'); });
      if (T.sel != null) {
        var sid = topChecker(T.sel); if (sid != null) ckEls[sid].classList.add('sel');
        Object.keys(T.dests).forEach(function (k) { if (k === 'off') $('trayB').classList.add('can'); else { var z = zoneEl(+k); if (z) z.classList.add('can'); } });
      }
      if (hintMark) { var hid = topChecker(hintMark.from); if (hid != null) ckEls[hid].classList.add('hintpulse'); if (hintMark.to === 'off') $('trayB').classList.add('can'); else { var hz = zoneEl(hintMark.to); if (hz) hz.classList.add('hintpulse'); } }
    }
    var h = '';
    if (S.phase === 'opening') h = 'Başlangıç zarları: büyük atan başlar.';
    else if (S.phase === 'over') h = '';
    else if (S.turn !== me || isBotSeat(me)) h = waitingText();
    else if (hintMark && hintMark.text) h = '💡 ' + hintMark.text;
    else if (S.phase === 'roll') h = 'Sıra sende: zarı at (boşluk).';
    else if (T && !T.info.max) h = 'Bu zarla oynanacak hamle yok.';
    else if (done) h = game.auto ? '' : 'Hamlen bitti: Tamam\'a bas ya da geri al.';
    else if (T && T.work.bar[me]) h = 'Kırık pulun var: önce onu oyuna sok.';
    else if (T && R.allHome(T.work, me)) h = 'Bütün pulların evde: topla!';
    else h = 'Bir pul seç, sonra parlayan haneye oyna.';
    $('hint').textContent = h;
  }
  function waitingText() {
    var n = names()[S.turn];
    if (game.mode === 'online' && game.online && !game.online.isHost && game.hostAlive === false) return 'Masa sahibinin bağlantısı bekleniyor…';
    return 'Sıra ' + n + '\'' + bulunma(n) + '…';
  }
  function bulunma(n) {
    var low = String(n).toLocaleLowerCase('tr'), v = low.match(/[aeıioöuü](?=[^aeıioöuü]*$)/);
    var front = v && 'eiöü'.indexOf(v[0]) >= 0, hard = 'çfhkpsşt'.indexOf(low.slice(-1)) >= 0;
    return (hard ? 't' : 'd') + (front ? 'e' : 'a');
  }
  function zoneEl(a) { return $('pts').querySelector('.zone[data-a="' + a + '"]'); }
  function topChecker(from) {
    if (!stk) return null;
    var p = me, list = from === 'bar' ? stk.bar[p] : stk.pts[from];
    return list && list.length ? list[list.length - 1] : null;
  }
  function say(seat, text, ms) {
    var e = plateEl(seat) && plateEl(seat).querySelector('.say'); if (!e) return;
    e.textContent = text; e.classList.add('on'); e.classList.toggle('chatmsg', !!ms);
    clearTimeout(e._t); e._t = setTimeout(function () { e.classList.remove('on', 'chatmsg'); }, ms || 1700);
  }
  var toastT = 0;
  function toast(m) { var e = $('toast'); e.textContent = m; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 3200); }

  // ================= benim turum (önizleme) =================
  function isBotSeat(seat) { return !!(game && game.levels && game.levels[seat]); }
  function startMyTurn() {
    var info = R.turnInfo(S.pos, me, S.dice);
    T = { info: info, left: info.dice.slice(), played: [], snaps: [], work: R.clonePos(S.pos), sel: null, dests: {}, cands: [] };
    hintMark = null;
    computeCands();
    syncStacks(T.work); render();
    if (!info.max) {
      toast('Bu zarla oynanacak hamle yok.');
      setTimeout(function () { if (T && !T.played.length && T.info.max === 0) finishMyTurn(); }, 1500);
    }
  }
  function computeCands() {
    T.cands = R.nextMoves(T.work, me, T.left, T.info.max - T.played.length, T.played.length === 0 ? T.info.forceDie : null);
    T.sel = null; T.dests = {};
  }
  // seçili kaynaktan gidilebilecek yerler: tek zar ya da aynı pulla art arda (birleşik) hamleler
  function destsFor(src) {
    var out = {};
    function walk(pos, left, played, from, path) {
      var c = R.nextMoves(pos, me, left, T.info.max - played, played === 0 ? T.info.forceDie : null).filter(function (m) { return m.from === from; });
      c.forEach(function (m) {
        var key = String(m.to), np = path.concat([m]);
        if (!out[key] || out[key].length > np.length) out[key] = np;
        if (m.to !== 'off' && !m.hit) walk(R.applyMove(R.clonePos(pos), me, m), removeOne(left, m.die), played + 1, m.to, np);
      });
    }
    walk(T.work, T.left, T.played.length, src, []);
    return out;
  }
  // tur ortasında: kalan zarlarla en iyi devam (zor botun değerlendirmesiyle)
  function bestRemaining() {
    var best = null, need = T.info.max - T.played.length, seen = {};
    function dfs(pos, left, moves) {
      var key = R.posKey(pos) + '#' + moves.length;
      if (seen[key]) return; seen[key] = 1;
      if (moves.length === need) { var v = R.evaluate(pos, me, 'hard'); if (!best || v > best.v) best = { v: v, moves: moves.slice() }; return; }
      var nm = R.nextMoves(pos, me, left, need - moves.length, T.played.length + moves.length === 0 ? T.info.forceDie : null);
      nm.forEach(function (m) { moves.push(m); dfs(R.applyMove(R.clonePos(pos), me, m), removeOne(left, m.die), moves); moves.pop(); });
    }
    dfs(T.work, T.left, []);
    return best;
  }
  function removeOne(arr, v) { var c = arr.slice(), i = c.indexOf(v); if (i >= 0) c.splice(i, 1); return c; }
  function selectSource(src) {
    if (!T || !T.cands.some(function (m) { return m.from === src; })) return false;
    T.sel = src; T.dests = destsFor(src); sfx.pick(); renderControls(); return true;
  }
  async function playPath(path) {
    if (!T || busy) return;
    busy = true;
    for (var i = 0; i < path.length; i++) { doMove(path[i]); if (i < path.length - 1) await sleep(170); }
    busy = false;
    afterMyMove();
  }
  function doMove(m) {
    T.snaps.push({ work: R.clonePos(T.work), left: T.left.slice() });
    R.applyMove(T.work, me, m); T.left = removeOne(T.left, m.die); T.played.push(m);
    moveChecker(me, m); layout();
    if (m.hit) { sfx.hit(); say(1 - me, 'Kırıldım!'); } else if (m.to === 'off') sfx.off(); else sfx.clack();
  }
  function afterMyMove() {
    hintMark = null; computeCands(); renderPlates(); renderDice(); renderControls();
    if (T.work.off[me] === 15) { finishMyTurn(); return; }
    if (T.played.length >= T.info.max && game.auto) setTimeout(function () { if (T && T.played.length >= T.info.max && !busy) finishMyTurn(); }, 380);
  }
  function undoMove() {
    if (!T || !T.snaps.length || busy) return;
    var sn = T.snaps.pop(); T.work = sn.work; T.left = sn.left; T.played.pop();
    hintMark = null; computeCands(); syncStacks(T.work); sfx.clack(); render();
  }
  function finishMyTurn() {
    if (!T) return;
    var moves = T.played.slice();
    if (game.mode === 'online' && !game.online.isHost) {
      game.pending = true; renderControls();
      post('t_move', { code: game.online.code, seat: me, seatKey: game.online.seatKey, move: { a: 'turn', moves: moves } })
        .then(function (j) { if (!j.ok) { game.pending = false; toast('Hamle gönderilemedi.'); renderControls(); } })
        .catch(function () { game.pending = false; toast('Bağlantı sorunu: hamle gönderilemedi.'); renderControls(); });
      setTimeout(clientPoll, 250);
      return;
    }
    var v = R.validateTurn(S.pos, me, S.dice, moves);
    if (!v) { toast('Geçersiz hamle.'); sfx.bad(); T = null; startMyTurn(); return; }
    T = null;
    commitTurn(me, moves, v, true);
  }

  // ================= tur akışı (yerel / masa sahibi) =================
  function pushEvent(ev) { game.seq = (game.seq || 0) + 1; ev.seq = game.seq; game.events = (game.events || []).concat([ev]).slice(-10); }
  function commitTurn(seat, moves, newPos, shown) {
    S.pos = newPos; S.lastMoves = moves; S.left = null;
    pushEvent({ p: seat, a: 'turn', moves: moves, dice: S.dice });
    if (!shown) { syncStacks(S.pos); }
    var w = R.winner(S.pos);
    if (w >= 0) return gameOver(w);
    S.turn = 1 - seat; S.phase = 'roll'; S.dice = null;
    setDeadline(); save(); publish(); render();
    advance();
  }
  function rollFor(seat) {
    S.dice = R.rollDice(); S.phase = 'move'; S.left = null;
    pushEvent({ p: seat, a: 'roll', dice: S.dice });
    sfx.dice(); setDeadline(true); save(); publish();
    if (seat === me && !isBotSeat(me)) { startMyTurn(); renderDice(true); }
    else render(true);
  }
  function delay(ms) { var g = gen; return sleep(ms * (game.speed || 1)).then(function () { if (g !== gen || !S) throw new Error('stale'); }); }
  var advancing = false;
  async function advance() {
    if (advancing || !S || S.phase === 'over' || (game.mode === 'online' && !game.online.isHost)) return;
    advancing = true;
    try {
      while (S && S.phase !== 'over' && isBotSeat(S.turn)) {
        var seat = S.turn, lv = game.levels[seat];
        busy = true; render();
        await delay(450);
        if (S.phase === 'roll') { rollFor(seat); await delay(750); }
        var t = R.chooseTurn(S.pos, seat, S.dice, lv);
        if (!t.moves.length) { say(seat, 'Hamle yok'); await delay(900); }
        var pos = R.clonePos(S.pos);
        for (var i = 0; i < t.moves.length; i++) {
          var m = t.moves[i];
          R.applyMove(pos, seat, m); moveChecker(seat, m);
          S.left = removeOne(S.left || R.expandDice(S.dice), m.die);
          layout(); renderDice(); renderPlates();
          if (m.hit) { sfx.hit(); toast(seat === me ? 'Rakibini kırdın!' : names()[seat] + ' pulunu kırdı!'); } else if (m.to === 'off') sfx.off(); else sfx.clack();
          await delay(430);
        }
        busy = false;
        commitTurn(seat, t.moves, pos, true);
        return;
      }
      busy = false;
      if (S && S.phase === 'roll' && S.turn === me) render();
    } catch (e) { busy = false; if (window.console && e.message !== 'stale') console.error(e); } finally { advancing = false; }
  }

  // ================= oyun / maç =================
  function newPosState(starter) {
    return { pos: R.newPos(), turn: starter == null ? 0 : starter, phase: starter == null ? 'opening' : 'roll', dice: null, opening: null, left: null, lastMoves: null, over: null };
  }
  function startGame(starter) {
    gen++;
    S = newPosState(starter); T = null; hintMark = null; busy = false;
    game.events = []; game.deadline = 0;
    syncStacks(S.pos);
    $('startModal').hidden = true; $('endModal').hidden = true; $('lobbyModal').hidden = true; fit();
    if (innerHeight < 760) { try { $('stageWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    render(); save(); publish();
    if (S.phase === 'opening') openingRoll();
    else { toast((S.turn === me ? 'Sen' : names()[S.turn]) + ' başlıyor.'); setDeadline(); advance(); }
  }
  async function openingRoll() {
    var g = gen;
    await sleep(500); if (g !== gen) return;
    var a, b; do { a = 1 + Math.floor(Math.random() * 6); b = 1 + Math.floor(Math.random() * 6); } while (a === b);
    S.opening = [a, b]; sfx.dice(); renderDice(true); publish();
    pushEvent({ a: 'opening', opening: S.opening });
    await sleep(1300); if (g !== gen) return;
    var st = a > b ? 0 : 1;
    toast((st === me ? 'Sen' : names()[st]) + ' başlıyor (' + Math.max(a, b) + ' – ' + Math.min(a, b) + ').');
    S.turn = st; S.phase = 'roll'; S.opening = null;
    setDeadline(); save(); publish(); render();
    advance();
  }
  function gameOver(w) {
    var pts = game.mars ? R.gamePoints(S.pos, w) : 1;
    S.phase = 'over'; S.dice = null; S.over = { winner: w, points: pts, mars: pts === 2 };
    game.score[w] += pts; game.deadline = 0;
    if (w === me) { game.gamesWon = (game.gamesWon || 0) + 1; if (pts === 2) game.marsWins = (game.marsWins || 0) + 1; }
    game.finished = game.score[w] >= game.target;
    game.lastWinner = w;
    var st = readJSON(K_STATS, { games: 0, won: 0, matches: 0, mwon: 0 }); st.games++; if (w === me) st.won++;
    if (game.finished) { st.matches++; if (w === me) st.mwon++; }
    lsSet(K_STATS, JSON.stringify(st));
    render(); save(); publish();
    showEnd();
  }
  function showEnd() {
    var o = S.over, nm = names(), w = o.winner, last = !!game.finished;
    $('endLabel').textContent = last ? 'Maç bitti' : 'Oyun ' + (game.gameNo || 1) + ' bitti';
    var title = w === me ? (o.mars ? 'Mars ettin! 🎉' : 'Oyunu kazandın!') : nm[w] + (o.mars ? ' mars etti' : ' kazandı');
    var sub = o.mars ? 'Rakip hiç pul toplayamadı: 2 puan.' : '1 puan.';
    if (last) {
      title = w === me ? 'Maçı kazandın! 🏆' : nm[w] + ' maçı kazandı';
      sub = game.score[me] + ' – ' + game.score[1 - me] + ' · ' + game.target + ' puanlık maç';
      if (!game._statsDone) { game._statsDone = true; submitResult(w === me); }
    }
    if (w === me) sfx.win(); else sfx.bad();
    $('endTitle').textContent = title; $('endSub').textContent = sub;
    $('endRows').innerHTML = [me, 1 - me].map(function (i) {
      return '<tr class="' + (i === w ? 'win' : '') + (i === me ? ' me' : '') + '"><td><b>' + esc(nm[i]) + '</b><small>' + (i === w ? (o.mars ? 'mars' : 'kazandı') : S.pos.off[i] + ' pul topladı') + '</small></td><td class="n">' + (i === w ? '+' + o.points : '0') + '</td><td class="n">' + game.score[i] + '</td></tr>';
    }).join('');
    var client = game.mode === 'online' && !game.online.isHost;
    $('nextBtn').hidden = client && !last;
    $('nextBtn').textContent = last ? 'Yeni maç' : 'Sonraki oyun';
    $('endWait').hidden = !(client && !last);
    $('endModal').hidden = false;
  }
  $('nextBtn').onclick = function () {
    audio();
    if (game.finished) { if (game.mode === 'online') lsDel(K_ONLINE); else lsDel(K_SAVE); stopOnline(); showStart(); return; }
    game.gameNo = (game.gameNo || 1) + 1;
    startGame(game.lastWinner);
  };
  function newLocalGame(cfg) {
    gen++; me = 0;
    game = { mode: 'bot', name: cfg.name, names: [cfg.name || 'Sen', 'Mehmet'], levels: [null, cfg.level], level: cfg.level, target: cfg.target,
      speed: cfg.speed, timer: cfg.timer, auto: cfg.auto, mars: cfg.mars, score: [0, 0], gameNo: 1, token: null, gamesWon: 0, marsWins: 0, events: [], seq: 0 };
    buildPoints();
    startGame(null);
    post('start', { mode: 'bot' }).then(function (j) { if (j && j.ok) game.token = j.token; }).catch(function () {});
  }
  function submitResult(won) {
    if (!game.token || !validName(game.name)) return;
    post('submit', { token: game.token, name: game.name, mode: game.mode, level: game.mode === 'online' ? 'mixed' : game.level, hands: Math.max(1, Math.min(25, game.gameNo || 1)),
      total: game.score[me], won: won, bestOpen: game.marsWins || 0, finished: game.gamesWon || 0 })
      .then(function (j) { if (j && j.ok) loadBoard(); }).catch(function () {});
  }

  // ================= kayıt =================
  function save() {
    if (!game || !S) return;
    if (game.mode === 'online' && !game.online.isHost) return;
    lsSet(game.mode === 'online' ? K_ONLINE : K_SAVE, JSON.stringify({ v: 1, game: game, S: S, me: me }));
  }

  // ================= süre =================
  function setDeadline(keep) {
    if (!game || !game.timer || !S || S.phase === 'over' || S.phase === 'opening' || isBotSeat(S.turn)) { if (game) game.deadline = 0; return; }
    if (keep && game.deadline) return;
    game.deadline = Date.now() + game.timer * 1000;
  }
  function timerLoop() {
    var dl = game && S && S.phase !== 'over' ? (game.mode === 'online' && !game.online.isHost ? game.pubDeadline : game.deadline) : 0;
    document.querySelectorAll('.plate .ring').forEach(function (r) { r.style.setProperty('--p', '0'); r.classList.remove('on', 'low'); });
    if (dl && S) {
      var left = Math.max(0, dl - Date.now()), ring = plateEl(S.turn) && plateEl(S.turn).querySelector('.ring');
      if (ring) { ring.classList.add('on'); ring.classList.toggle('low', left < 8000); ring.style.setProperty('--p', String(left / ((game.timer || 30) * 1000))); }
      if (S.turn === me && left < 5500 && left > 0 && Math.floor(left / 1000) !== timerLoop.last) { timerLoop.last = Math.floor(left / 1000); sfx.tick(); }
      if (left <= 0 && (game.mode !== 'online' || game.online.isHost) && !busy) autoPlay(S.turn);
    }
    requestAnimationFrame(timerLoop);
  }
  requestAnimationFrame(timerLoop);
  function autoPlay(seat) {
    game.deadline = 0;
    if (seat === me) toast('Süren doldu: senin yerine oynandı.');
    if (S.phase === 'roll') { rollFor(seat); if (seat !== me) return; }
    var t = R.chooseTurn(S.pos, seat, S.dice, 'normal');
    if (seat === me) T = null;
    commitTurn(seat, t.moves, t.pos, false);
  }

  // ================= girdi: tıkla, çift tıkla, sürükle =================
  var drag = null, lastTap = { id: null, t: 0 };
  function srcOfChecker(id) {
    if (!stk) return null;
    if (stk.bar[me].indexOf(id) >= 0) return 'bar';
    for (var a = 1; a <= 24; a++) if (stk.pts[a].indexOf(id) >= 0) return a;
    return null;
  }
  $('cks').addEventListener('pointerdown', function (e) {
    var ce = e.target.closest('.ck'); if (!ce || !T || busy) return;
    audio();
    var id = +ce.dataset.id, src = srcOfChecker(id);
    if (T.sel != null) {
      var loc = stk.off[me].indexOf(id) >= 0 ? 'off' : srcOfCheckerAny(id);
      if (loc != null && loc !== T.sel && T.dests[String(loc)]) { e.preventDefault(); playPath(T.dests[String(loc)]); return; }
    }
    if (src == null || colorOf(id) !== me) return;
    // yığının en üstündeki pulu tut
    var tid = topChecker(src); if (tid == null) return;
    drag = { id: tid, src: src, x: e.clientX, y: e.clientY, moved: false, el: ckEls[tid] };
    try { ce.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
  });
  function zoneAt(cx, cy) {
    var el = document.elementFromPoint(cx, cy); if (!el) return null;
    if (el.closest('#trayB')) return 'off';
    var z = el.closest('.zone'); if (z) return +z.dataset.a;
    var ck = el.closest('.ck'); if (ck) { var s = srcOfCheckerAny(+ck.dataset.id); return s; }
    return null;
  }
  function srcOfCheckerAny(id) { for (var a = 1; a <= 24; a++) if (stk.pts[a].indexOf(id) >= 0) return a; return null; }
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      if (!selectSource(drag.src)) { drag = null; return; }
      drag.moved = true; drag.el.classList.add('drag'); drag.el.style.pointerEvents = 'none';
    }
    var p = toBoard(e.clientX, e.clientY);
    drag.el.style.left = (p.x - CKS / 2) + 'px'; drag.el.style.top = (p.y - CKS / 2) + 'px';
  });
  document.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var d = drag; drag = null;
    // hedefi, sürüklenen pul yeniden tıklanabilir olmadan önce bul (yoksa imlecin altında pulun kendisi çıkar)
    var tgt = d.moved ? zoneAt(e.clientX, e.clientY) : null;
    d.el.classList.remove('drag'); d.el.style.pointerEvents = '';
    if (d.moved) {
      var path = tgt != null && T && T.dests[String(tgt)];
      if (path) { playPath(path); return; }
      layout(); renderControls(); return;
    }
    // tıklama: çift tıklama → büyük zarla oyna; tek tıklama → seç / seçimi kaldır
    var now = Date.now();
    if (lastTap.id === d.src && now - lastTap.t < 330) {
      lastTap = { id: null, t: 0 };
      var best = T.cands.filter(function (m) { return m.from === d.src; }).sort(function (a, b) { return b.die - a.die; })[0];
      if (best) playPath([best]);
      return;
    }
    lastTap = { id: d.src, t: now };
    if (T.sel === d.src) { T.sel = null; T.dests = {}; renderControls(); return; }
    if (T.sel != null && T.dests[String(d.src)]) { playPath(T.dests[String(d.src)]); return; }
    if (!selectSource(d.src)) { if (T.cands.length) { sfx.bad(); toast(T.work.bar[me] && d.src !== 'bar' ? 'Önce kırık pulunu oyuna sokmalısın.' : 'Bu pul oynanamaz.'); } }
  });
  document.addEventListener('pointercancel', function () { if (drag) { drag.el.classList.remove('drag'); drag.el.style.pointerEvents = ''; drag = null; layout(); } });
  $('pts').addEventListener('click', function (e) {
    var z = e.target.closest('.zone'); if (!z || !T || busy || T.sel == null) return;
    var path = T.dests[z.dataset.a]; if (path) playPath(path);
  });
  $('trayB').addEventListener('click', function () { if (T && T.sel != null && T.dests.off && !busy) playPath(T.dests.off); });
  $('rollBtn').onclick = function () { audio(); doRoll(); };
  $('undoBtn').onclick = undoMove;
  $('doneBtn').onclick = function () { if (T && T.played.length >= T.info.max) finishMyTurn(); };
  $('hintBtn').onclick = function () {
    if (myTurnPhase('roll')) { toast('Önce zarı at.'); return; }
    if (!T || T.played.length >= T.info.max) return;
    var t = bestRemaining();
    if (!t || !t.moves.length) return;
    var m = t.moves[0];
    var txt = t.moves.map(function (x) { return (x.from === 'bar' ? 'bar' : R.rel(me, x.from)) + '/' + (x.to === 'off' ? 'topla' : R.rel(me, x.to)) + (x.hit ? '*' : ''); }).join(', ');
    hintMark = { from: m.from, to: m.to, text: 'Önerilen: ' + txt };
    selectSource(m.from); sfx.tick(); renderControls();
  };
  function doRoll() {
    if (!myTurnPhase('roll') || isBotSeat(me)) return;
    if (game.mode === 'online' && !game.online.isHost) {
      game.pending = true; renderControls();
      post('t_move', { code: game.online.code, seat: me, seatKey: game.online.seatKey, move: { a: 'roll' } }).catch(function () {}).then(function () { setTimeout(clientPoll, 200); });
      return;
    }
    rollFor(me);
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
  var segMatch = seg('matchSeg', 'h'), segSpeed = seg('speedSeg', 's'), segLevel = seg('levelSeg', 'l'), segTimer = seg('timerSeg', 't');
  var MODE = 'bot';
  function setTab(m) {
    MODE = m;
    document.querySelectorAll('#modeTabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.m === m ? 'true' : 'false'); });
    document.querySelectorAll('.mpane').forEach(function (p) { p.hidden = p.dataset.m !== m; });
    $('startBtn').textContent = m === 'online' ? 'Masa kur' : 'Oyuna başla';
  }
  document.querySelectorAll('#modeTabs button').forEach(function (b) { b.onclick = function () { setTab(b.dataset.m); }; });
  function showStart() {
    $('nameIn').value = lsGet('okey_name') || lsGet('bp_name') || '';
    segMatch.set(lsGet('tv_match') || '5'); segSpeed.set(lsGet('tv_speed') || '1'); segLevel.set(lsGet('tv_level') || 'normal'); segTimer.set(lsGet('tv_timer') || '0');
    $('optAuto').checked = lsGet('tv_auto') !== '0'; $('optMars').checked = lsGet('tv_mars') !== '0';
    var st = readJSON(K_STATS, null), rn = $('resumeNote');
    if (st && st.matches) { rn.hidden = false; rn.textContent = 'Şimdiye kadar ' + st.matches + ' maç, ' + st.mwon + ' galibiyet · ' + st.games + ' oyun, ' + st.won + ' kez kazandın.'; } else rn.hidden = true;
    setTab(MODE);
    $('endModal').hidden = true; $('lobbyModal').hidden = true; $('startModal').hidden = false;
  }
  function readCfg() {
    return { target: +segMatch.get() || 5, speed: +segSpeed.get() || 1, level: segLevel.get() || 'normal', timer: +segTimer.get() || 0, auto: $('optAuto').checked, mars: $('optMars').checked };
  }
  $('startBtn').onclick = function () {
    audio();
    var n = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 16), c = readCfg();
    if (n) { lsSet('okey_name', n); if (!lsGet('bp_name') && validName(n)) lsSet('bp_name', n); }
    lsSet('tv_match', String(c.target)); lsSet('tv_speed', String(c.speed)); lsSet('tv_level', c.level); lsSet('tv_timer', String(c.timer));
    lsSet('tv_auto', c.auto ? '1' : '0'); lsSet('tv_mars', c.mars ? '1' : '0');
    if (MODE === 'online') { if (!validName(n)) { toast('Online masa için 2–16 karakterlik bir ad yaz.'); $('nameIn').focus(); return; } return createTable(n, c); }
    c.name = n || 'Sen'; newLocalGame(c);
  };
  $('nameIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('startBtn').click(); });
  $('newBtn').onclick = function () { if (busy) return; showStart(); };
  $('startClose').onclick = function () { if (game && S) $('startModal').hidden = true; };

  // ================= online masa =================
  var hostTimer = 0, clientTimer = 0, lobbyTimer = 0, lastMoveId = 0;
  function stopLocal() { gen++; S = null; T = null; busy = false; hintMark = null; }
  function inviteUrl(code) { return location.origin + location.pathname + '?masa=' + code; }
  async function createTable(name, cfg) {
    try {
      var j = await post('t_create', { name: name, opts: { game: 'tavla', cfg: cfg } });
      if (!j.ok) return toast(j.error === 'bad_name' ? 'Bu ad kullanılamaz.' : 'Masa kurulamadı.');
      stopLocal();
      game = { mode: 'online', name: name, cfg: cfg, online: { code: j.code, hostKey: j.hostKey, seatKey: j.seatKey, seat: 0, isHost: true }, lobby: true };
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
      $('lobbySeats').innerHTML = j.seats.slice(0, 2).map(function (s, i) {
        return '<li class="' + (s ? 'on' : '') + (i === me ? ' me' : '') + '"><span class="ls-av">' + (s ? esc(s.name.charAt(0)) : '?') + '</span><b>' + (s ? esc(s.name) : 'Boş koltuk') + '</b><small>' + (i === 0 ? 'Masa sahibi · beyaz' : s ? 'Hazır · koyu' : 'Gelmezse bot oturur') + '</small></li>';
      }).join('');
      if (j.status !== 'lobby' && !game.online.isHost) { clearInterval(lobbyTimer); game.lobby = false; startClient(j); }
    } catch (e) {}
  }
  $('lobbyCopy').onclick = function () {
    var v = $('lobbyLink').value;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('Davet bağlantısı kopyalandı.'); }).catch(function () { $('lobbyLink').select(); });
  };
  $('lobbyWa').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent('Tavla masama gel: ' + $('lobbyLink').value), '_blank', 'noopener'); };
  $('lobbyLeave').onclick = function () { clearInterval(lobbyTimer); stopOnline(); lsDel(K_ONLINE); game = null; $('lobbyModal').hidden = true; showStart(); };
  $('lobbyStart').onclick = async function () {
    if (!game || !game.online.isHost) return;
    var j = await post('t_start', { code: game.online.code, hostKey: game.online.hostKey });
    if (!j.ok) return toast('Başlatılamadı.');
    clearInterval(lobbyTimer); game.lobby = false;
    var c = game.cfg || readCfg();
    game.names = [j.seats[0].name, j.seats[1].name];
    game.levels = [null, j.seats[1].bot ? c.level : null];
    game.level = c.level; game.target = c.target; game.speed = c.speed; game.auto = c.auto; game.mars = c.mars;
    game.timer = c.timer || (game.levels[1] ? 0 : 60); // iki insan oyuncuda takılmayı önle
    game.score = [0, 0]; game.gameNo = 1; game.gamesWon = 0; game.marsWins = 0; game.ver = 0; game.errs = {}; game.events = []; game.seq = 0;
    post('start', { mode: 'online' }).then(function (x) { if (x && x.ok) game.token = x.token; }).catch(function () {});
    buildPoints(); startHost(); startGame(null);
  };
  function startHost() { clearInterval(hostTimer); hostTimer = setInterval(hostPoll, 800); }
  var publishing = false, publishAgain = false;
  function buildPub() {
    return { names: game.names, levels: game.levels, score: game.score, target: game.target, gameNo: game.gameNo, auto: game.auto, mars: game.mars, timer: game.timer,
      finished: !!game.finished, S: S, deadline: game.deadline || 0, events: game.events || [], errs: game.errs || {} };
  }
  async function publish() {
    if (!game || game.mode !== 'online' || !game.online.isHost || !S) return;
    if (publishing) { publishAgain = true; return; }
    publishing = true; game.ver = (game.ver || 0) + 1;
    try { await post('t_state', { code: game.online.code, hostKey: game.online.hostKey, ver: game.ver, pub: buildPub(), priv: {}, over: !!game.finished }); } catch (e) {}
    publishing = false;
    if (publishAgain) { publishAgain = false; publish(); }
  }
  var hostBusy = false;
  async function hostPoll() {
    if (!game || game.mode !== 'online' || !game.online.isHost || hostBusy || !S) return;
    hostBusy = true;
    try {
      var j = await post('t_moves', { code: game.online.code, hostKey: game.online.hostKey, after: lastMoveId });
      if (j && j.ok) for (var i = 0; i < j.moves.length; i++) {
        var mv = j.moves[i], m = mv.move || {}; lastMoveId = mv.id;
        var bad = function (msg) { game.errs[mv.seat] = { n: (game.errs[mv.seat] ? game.errs[mv.seat].n : 0) + 1, msg: msg }; publish(); };
        if (S.turn !== mv.seat || isBotSeat(mv.seat) || busy) { bad('not_your_turn'); continue; }
        if (m.a === 'roll') { if (S.phase !== 'roll') { bad('not_now'); continue; } rollFor(mv.seat); continue; }
        if (m.a === 'turn') {
          if (S.phase !== 'move') { bad('not_now'); continue; }
          var v = R.validateTurn(S.pos, mv.seat, S.dice, m.moves || []);
          if (!v) { bad('bad_turn'); continue; }
          busy = true;
          for (var k = 0; k < m.moves.length; k++) { moveChecker(mv.seat, m.moves[k]); layout(); if (m.moves[k].hit) sfx.hit(); else sfx.clack(); await sleep(300); }
          busy = false;
          commitTurn(mv.seat, m.moves, v, true);
        }
      }
    } catch (e) { busy = false; }
    hostBusy = false;
  }
  function startClient() {
    game.score = [0, 0]; game.ver = 0; game.lastEvent = 0; game.errSeen = 0; game.target = 5;
    $('lobbyModal').hidden = true; $('startModal').hidden = true;
    buildPoints();
    clearInterval(clientTimer); clientTimer = setInterval(clientPoll, 900); clientPoll();
  }
  var polling = false;
  async function clientPoll() {
    if (!game || game.mode !== 'online' || game.online.isHost || polling) return;
    polling = true;
    try {
      var j = await post('t_poll', { code: game.online.code, seat: me, seatKey: game.online.seatKey, ver: game.ver || 0 });
      if (j && j.ok) {
        if (j.hostAlive !== game.hostAlive) { game.hostAlive = j.hostAlive; if (S) renderControls(); }
        if (j.pub) await applyRemote(j);
      } else if (j && j.error === 'no_table') { toast('Masa kapandı.'); stopOnline(); lsDel(K_ONLINE); }
    } catch (e) {}
    polling = false;
  }
  async function applyRemote(j) {
    var pub = j.pub, prev = S, first = !S;
    game.ver = j.ver; game.names = pub.names; game.levels = pub.levels; game.score = pub.score; game.target = pub.target; game.gameNo = pub.gameNo;
    game.auto = pub.auto; game.mars = pub.mars; game.timer = pub.timer; game.finished = pub.finished; game.pubDeadline = pub.deadline; game.pending = false;
    var newGame = !prev || (pub.S.phase === 'opening' && prev.phase !== 'opening') || (prev.phase === 'over' && pub.S.phase !== 'over');
    var evs = (pub.events || []).filter(function (e) { return e.seq > (game.lastEvent || 0); });
    if (pub.events && pub.events.length) game.lastEvent = pub.events[pub.events.length - 1].seq;
    var e2 = pub.errs && pub.errs[me];
    if (e2 && e2.n > (game.errSeen || 0)) { game.errSeen = e2.n; toast(e2.msg === 'bad_turn' ? 'Hamle geçersiz sayıldı, tekrar oyna.' : 'Sıra sende değil.'); sfx.bad(); T = null; }
    if (first || newGame) { S = pub.S; T = null; syncStacks(S.pos); if (newGame && !first) $('endModal').hidden = true; render(); }
    else {
      // rakibin hamlelerini canlandır (kendi hamlem zaten önizlemede yapıldı)
      for (var k = 0; k < evs.length; k++) {
        var ev = evs[k];
        if (ev.a === 'roll' || ev.a === 'opening') { sfx.dice(); }
        if (ev.a === 'turn' && ev.p !== me && S) {
          syncStacks(S.pos); S.dice = ev.dice; S.turn = ev.p; S.phase = 'move'; renderDice();
          for (var i = 0; i < ev.moves.length; i++) { moveChecker(ev.p, ev.moves[i]); layout(); if (ev.moves[i].hit) { sfx.hit(); toast(names()[ev.p] + ' pulunu kırdı!'); } else sfx.clack(); await sleep(320); }
        }
      }
      var wasMine = T && pub.S.phase === 'move' && pub.S.turn === me && S.phase === 'move' && S.turn === me && String(S.dice) === String(pub.S.dice);
      S = pub.S;
      if (!wasMine) { T = null; syncStacks(S.pos); }
    }
    if (S.phase === 'move' && S.turn === me && !T) { startMyTurn(); if (evs.some(function (e) { return e.a === 'roll'; })) renderDice(true); }
    else render(evs.some(function (e) { return e.a === 'roll' || e.a === 'opening'; }));
    if (S.phase === 'over' && S.over && game._endShown !== game.gameNo) { game._endShown = game.gameNo; showEnd(); }
    if (pub.finished) clearInterval(clientTimer);
  }
  function stopOnline() { clearInterval(hostTimer); clearInterval(clientTimer); clearInterval(lobbyTimer); }

  // ================= sıralama =================
  var lbData = null, lbTab = lsGet('tv_lbtab') || 'week';
  if (lbTab !== 'week' && lbTab !== 'all') lbTab = 'week';
  function loadBoard() { get('top').then(function (j) { if (j && j.ok) { lbData = j; renderBoard(); } else boardOff(); }).catch(boardOff); }
  function boardOff() { $('lbList').innerHTML = '<li class="empty">Sıralamaya şu an ulaşılamıyor.</li>'; }
  function renderBoard() {
    document.querySelectorAll('#lbTabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.t === lbTab ? 'true' : 'false'); });
    if (!lbData) return;
    $('lbGames').textContent = fmt(lbData.games) + ' maç';
    var rows = lbData[lbTab], my = (lsGet('okey_name') || '').toLocaleLowerCase('tr');
    if (!rows.length) { $('lbList').innerHTML = '<li class="empty">Henüz galibiyet yok. İlk kazanan sen ol!</li>'; return; }
    $('lbList').innerHTML = rows.map(function (r, i) {
      return '<li class="' + (i < 3 ? 'm' + (i + 1) : '') + (r.name.toLocaleLowerCase('tr') === my ? ' me' : '') + '"><span class="rk">' + (i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1) + '</span><button class="pn" data-name="' + esc(r.name) + '">' + esc(r.name) + '</button><small>' + r.games + ' maç</small><b>' + r.wins + ' galibiyet</b></li>';
    }).join('');
  }
  document.querySelectorAll('#lbTabs button').forEach(function (b) { b.onclick = function () { lbTab = b.dataset.t; lsSet('tv_lbtab', lbTab); renderBoard(); }; });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.pn'); if (!b) return;
    var n = b.dataset.name; $('profModal').hidden = false; $('profBody').innerHTML = '<p class="muted">Yükleniyor…</p>';
    get('profile', '&name=' + encodeURIComponent(n)).then(function (j) {
      if (!j || !j.ok) { $('profBody').innerHTML = '<p>' + esc(n) + ' için kayıt yok.</p>'; return; }
      var rate = j.games ? Math.round(j.wins / j.games * 100) : 0, st2 = function (v, l) { return '<div><b>' + v + '</b><span>' + l + '</span></div>'; };
      $('profBody').innerHTML = '<h2>' + esc(j.name) + '</h2><p class="muted">İlk maç ' + esc(j.first || '—') + '</p><div class="pstats">' +
        st2(fmt(j.games), 'Maç') + st2(fmt(j.wins), 'Galibiyet') + st2('%' + rate, 'Kazanma') + st2(fmt(j.finished), 'Kazandığı oyun') + st2(fmt(j.bestOpen), 'En çok mars') + '</div>';
    }).catch(function () { $('profBody').innerHTML = '<p>Sunucuya ulaşılamadı.</p>'; });
  });
  $('profClose').onclick = function () { $('profModal').hidden = true; };
  $('profModal').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
  loadBoard();

  // ================= klavye =================
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'Escape') { if (!$('profModal').hidden) { $('profModal').hidden = true; return; } if (!$('startModal').hidden && game && S) { $('startModal').hidden = true; return; } if (T && T.sel != null) { T.sel = null; T.dests = {}; renderControls(); } return; }
    if (!$('startModal').hidden || !$('endModal').hidden || !$('lobbyModal').hidden || !S) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoMove(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLocaleLowerCase('tr'), done = true;
    if (k === ' ' || k === 'r') doRoll();
    else if (e.key === 'Enter') $('doneBtn').click();
    else if (k === 'u' || e.key === 'Backspace') undoMove();
    else if (k === 'h') $('hintBtn').click();
    else if (k === 'm') $('muteBtn').click();
    else if (k === 'f') $('fsBtn').click();
    else if (k === 'n') $('newBtn').click();
    else done = false;
    if (done) e.preventDefault();
  });

  // ================= kontroller sekmeleri =================
  function ctlTab(mob) {
    $('tabDesk').setAttribute('aria-selected', mob ? 'false' : 'true'); $('tabMob').setAttribute('aria-selected', mob ? 'true' : 'false');
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
    say: function (seat, text, ms) { if (S) say(seat, text, ms); },
    sound: function () { audio(); sfx.tick(); }
  };

  // ================= açılış =================
  makeCheckers(); buildPoints(); syncStacks(R.newPos()); layout(); fit();
  var params = new URLSearchParams(location.search), joinCode = (params.get('masa') || '').toUpperCase();
  function boot() {
    var on = readJSON(K_ONLINE, null);
    if (joinCode && /^[A-Z0-9]{6}$/.test(joinCode) && !(on && on.game && on.game.online && on.game.online.code === joinCode)) {
      MODE = 'online'; showStart(); $('joinCode').value = joinCode; setTab('online');
      toast('Masaya katılmak için adını yaz ve Katıl\'a bas.');
      return;
    }
    if (on && on.game && on.game.mode === 'online') {
      game = on.game; me = game.online.seat; buildPoints();
      if (on.lobby || game.lobby) { showLobby(); return; }
      if (game.online.isHost && on.S) { S = on.S; syncStacks(S.pos); render(); startHost(); toast('Masaya geri döndün.'); publish(); resumeLocal(); return; }
      if (!game.online.isHost) { game.ver = 0; game.lastEvent = 0; clearInterval(clientTimer); clientTimer = setInterval(clientPoll, 900); clientPoll(); toast('Masaya geri döndün.'); return; }
    }
    var sv = readJSON(K_SAVE, null);
    if (sv && sv.v === 1 && sv.S && sv.game) {
      game = sv.game; me = 0; S = sv.S; buildPoints(); syncStacks(S.pos); render();
      if (S.phase === 'over') { if (!game.finished) showEnd(); else showStart(); return; }
      toast('Kaldığın yerden devam ediyorsun.'); resumeLocal(); return;
    }
    showStart();
  }
  function resumeLocal() {
    if (S.phase === 'opening') { openingRoll(); return; }
    if (S.phase === 'move' && S.turn === me && !isBotSeat(me)) { startMyTurn(); return; }
    setDeadline(); advance();
  }
  $('joinBtn').onclick = function () {
    var n = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 16), c = $('joinCode').value.trim().toUpperCase();
    if (!validName(n)) { toast('Önce 2–16 karakterlik bir ad yaz.'); $('nameIn').focus(); return; }
    if (!/^[A-Z0-9]{6}$/.test(c)) { toast('Masa kodu 6 karakter olmalı.'); return; }
    lsSet('okey_name', n); audio(); joinTable(c, n);
  };
  boot();
})();
