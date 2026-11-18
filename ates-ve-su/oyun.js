/* Kor ile Damla — arayüz: çizim, kontroller, ses, bölüm seçimi, online masa.
   Kurallar motor.js'te (window.KorDamla), bölümler bolumler.js'te (window.KorDamlaBolumler). */
(function () {
  'use strict';
  var M = window.KorDamla, LV = window.AtesSuBolumler;
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement, T = M.T, W = M.W, H = M.H;
  var API = 'api/';
  var NAMES = { k: 'Ateş', d: 'Su' };
  var GCOL = { 1: '#ffd23f', 2: '#ff6fb5', 3: '#35d0ff' };

  function ls(k, v) {
    try { if (v === undefined) { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { return null; }
  }
  var prog = ls('kd_prog') || {};           // { "0": {stars, time} }
  var opts = ls('kd_opts') || { snd: true, vol: 0.7 };

  // ---------- sahne ----------
  var cv = $('cv'), cx = cv.getContext('2d'), wrap = $('stageWrap'), stage = $('stage');
  var qd = location.search.match(/[?&]dpr=(\d)/), DPR = qd ? +qd[1] : Math.min(2, window.devicePixelRatio || 1); // dpr: yalnızca yakın inceleme için
  cv.width = W * DPR; cv.height = H * DPR; cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  function fit() {
    var avail = wrap.clientWidth, maxH = window.innerHeight - (document.querySelector('.top').offsetHeight || 0) - 30;
    var s = Math.min(avail / W, Math.max(0.2, maxH / H));
    stage.style.transform = 'scale(' + s + ')'; wrap.style.height = Math.round(H * s) + 'px'; stage.dataset.s = s;
  }
  window.addEventListener('resize', fit); window.addEventListener('orientationchange', function () { setTimeout(fit, 200); });

  // ---------- oyun durumu ----------
  var enterT = 0, w, lvIdx = 0, mode = 'local', active = 'k', running = false, paused = false, deadT = 0, wonShown = false;
  var keys = {}, touch = { l: false, r: false, u: false }, parts = [], bg = null, shake = 0;
  var net = null; // online: {code, seat, seatKey, hostKey, me:'k'|'d', run, lv, sendT, other, timer}

  function load(i, keepNet) {
    lvIdx = i; w = M.create(LV[i]); wonShown = false; enterT = 0;
    w.torches = []; w.crystals = [];
    w.doorAt = function (tx, ty) { return ['k', 'd'].some(function (c) { var d = w.doors[c]; return d && tx * T < d.x + d.w + 10 && tx * T + T > d.x - 10 && ty * T < d.y + d.h && ty * T + T > d.y - 24; }); }; deadT = 0; parts = []; running = true; paused = false;
    if (net) { var other = net.me === 'k' ? 'd' : 'k'; w.p[other].ghost = true; net.target = null; }
    bg = buildBg(w); hud(); hint(LV[i].ipucu);
    closeModals();
  }
  function restart(local) {
    if (net && local) { net.run++; }
    var keep = net ? net.run : 0;
    load(lvIdx); if (net) net.run = keep;
  }

  // ---------- giriş ----------
  var KMAP = { ArrowLeft: ['k', 'l'], ArrowRight: ['k', 'r'], ArrowUp: ['k', 'u'], KeyA: ['d', 'l'], KeyD: ['d', 'r'], KeyW: ['d', 'u'] };
  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (KMAP[e.code]) { keys[e.code] = true; e.preventDefault(); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (anyModal()) { if (running) closeModals(), paused = false; } else openLevels(); return; }
    if (anyModal()) { if (e.code === 'Enter' && !$('endModal').hidden) $('nextBtn').click(); return; }
    if (e.code === 'KeyR') restart(true);
    else if (e.code === 'KeyM') toggleSound();
    else if (e.code === 'KeyF') fullscreen();
    else if (e.code === 'Tab' && mode === 'local') { e.preventDefault(); swap(); }
  });
  document.addEventListener('keyup', function (e) { if (KMAP[e.code]) keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; touch.l = touch.r = touch.u = false; });
  function inputs() {
    var inp = { k: {}, d: {} };
    for (var c in KMAP) if (keys[c]) inp[KMAP[c][0]][KMAP[c][1]] = true;
    var tc = net ? net.me : active;
    if (touch.l) inp[tc].l = true; if (touch.r) inp[tc].r = true; if (touch.u) inp[tc].u = true;
    if (net) { // online: iki tuş takımı da kendi karakterini yönetir
      var o = net.me === 'k' ? 'd' : 'k', mine = inp[net.me];
      ['l', 'r', 'u'].forEach(function (k) { if (inp[o][k]) mine[k] = true; });
      inp[o] = {};
    }
    return inp;
  }
  // dokunmatik düğmeler
  document.querySelectorAll('[data-t]').forEach(function (b) {
    var k = b.dataset.t;
    var on = function (e) { e.preventDefault(); touch[k] = true; b.classList.add('on'); };
    var off = function (e) { e.preventDefault(); touch[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  });
  $('swapBtn').onclick = swap;
  function swap() { if (net) return; active = active === 'k' ? 'd' : 'k'; hud(); toast((active === 'k' ? 'Ateş' : 'Su') + ' seçildi'); }

  // ---------- ses ----------
  var ac = null;
  function tone(f, d, type, vol, slide) {
    if (!opts.snd) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime((vol || 0.2) * opts.vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) {}
  }
  var SND = {
    jump: function (c) { tone(c === 'k' ? 300 : 420, 0.14, 'triangle', 0.12, c === 'k' ? 520 : 700); },
    gem: function () { tone(880, 0.09, 'sine', 0.16); setTimeout(function () { tone(1320, 0.12, 'sine', 0.14); }, 70); },
    lever: function () { tone(180, 0.08, 'square', 0.08); },
    plate: function () { tone(240, 0.06, 'square', 0.06); },
    dead: function () { tone(220, 0.4, 'sawtooth', 0.14, 60); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.18, 'triangle', 0.16); }, i * 110); }); }
  };
  function toggleSound() { opts.snd = !opts.snd; ls('kd_opts', opts); $('sndBtn').setAttribute('aria-pressed', !opts.snd); toast(opts.snd ? 'Ses açık' : 'Ses kapalı'); }
  $('sndBtn').onclick = toggleSound; $('sndBtn').setAttribute('aria-pressed', !opts.snd);

  // ---------- döngü ----------
  var last = 0, acc = 0, plateWas = {};
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    if (!w) return;
    if (net && mode === 'online') follow(); // bölüm sonu penceresi açıkken de masa sahibinin bölümünü izle
    if (running && !paused && !document.hidden) {
      acc += dt;
      var inp = inputs();
      while (acc >= M.DT) {
        if (net) applyRemote();
        var ev = M.step(w, inp, M.DT); acc -= M.DT;
        handle(ev);
        ['k', 'd'].forEach(function (c) { var p = w.p[c]; if (p && p.jumped) { p.jumped = false; SND.jump(c); } if (p && p.landed && !p.ghost) puff(p); });
        w.plates.forEach(function (pl, i) { if (pl.on && !plateWas[i]) SND.plate(); plateWas[i] = pl.on; });
      }
      if (w.dead) { deadT += dt; if (deadT > 1.1 && (!net || true)) restart(true); }
    } else acc = 0;
    if (net) syncTick(ts);
    draw(ts / 1000);
    tickHud();
  }
  function handle(ev) {
    ev.forEach(function (e) {
      if (e.e === 'gem') { SND.gem(); var g = w.gems[e.id]; burst(g.x + 8, g.y + 8, e.c === 'k' ? '#ffb347' : '#8fd3ff', 14); hud(); }
      else if (e.e === 'lever') SND.lever();
      else if (e.e === 'dead') { SND.dead(); shake = 0.35; var p = w.p[e.c]; burst(p.x + p.w / 2, p.y + p.h / 2, e.c === 'k' ? '#ff8a3d' : '#5ab8ff', 30); toast(deathText(e)); }
      else if (e.e === 'win') win();
    });
  }
  function deathText(e) {
    var n = NAMES[e.c];
    if (e.why === 'A') return n + ' aside düştü!';
    if (e.why === 'W') return 'Ateş suya düştü, söndü!';
    if (e.why === 'L') return 'Su lavda buharlaştı!';
    return n + ' düştü!';
  }

  // ---------- parçacıklar ----------
  function burst(x, y, col, n) {
    for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220; parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.6 + Math.random() * 0.5, t: 0, col: col, r: 2 + Math.random() * 3 }); }
  }
  function puff(p) { for (var i = 0; i < 6; i++) parts.push({ x: p.x + p.w / 2 + (Math.random() - 0.5) * 20, y: p.y + p.h, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 40, life: 0.35, t: 0, col: 'rgba(220,210,240,.6)', r: 2 + Math.random() * 2 }); }

  // ---------- çizim ----------
  var ROUND = '"Nunito","Inter Tight",system-ui,sans-serif';
  function rnd0(seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
  function solidAt(w, tx, ty) { return M.tileAt(w, tx, ty) === '#'; }
  function rrect(g, x, y, ww, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); }

  var WORLDS = ['Mağara', 'Kristal', 'Volkan', 'Derinlik', 'Çekirdek'];
  var PAL = [
    { bg: ['#2b2442', '#1d1830', '#130f1f'], sil: ['#231d37', '#1a152a'], tile: ['#463d61', '#383052'], cap: ['#8e80bd', '#5d5182'], lip: '#6a5d92', arch: '#6b5f93', key: '#7d70a8', fog: '120,100,190', pool: '#2a2340', poolEdge: '#5d5182' },
    { bg: ['#1f3148', '#16253a', '#0d1726'], sil: ['#1a2a40', '#132034'], tile: ['#3b5873', '#2e4760'], cap: ['#86bfdf', '#4f7f9e'], lip: '#5f8fae', arch: '#5a87a6', key: '#76a6c4', fog: '110,200,235', pool: '#1d2c40', poolEdge: '#4f7f9e' },
    { bg: ['#3a2121', '#291616', '#170b0b'], sil: ['#331c1c', '#251313'], tile: ['#5c3b33', '#48302a'], cap: ['#c07a5f', '#844e3b'], lip: '#9a5f49', arch: '#8a5643', key: '#a8705a', fog: '255,120,60', pool: '#2f1a17', poolEdge: '#844e3b' },
    { bg: ['#173029', '#10231e', '#0a1512'], sil: ['#142a24', '#0f201b'], tile: ['#34534b', '#29423c'], cap: ['#74ad9d', '#4b7d70'], lip: '#5b9282', arch: '#55897b', key: '#6fa494', fog: '90,220,180', pool: '#14261f', poolEdge: '#4b7d70' },
    { bg: ['#2d2339', '#1e1729', '#110c19'], sil: ['#271e33', '#1c1526'], tile: ['#4e4162', '#3c3251'], cap: ['#d9b66d', '#9b7b3e'], lip: '#b8964f', arch: '#8f7a52', key: '#d0ad62', fog: '255,210,120', pool: '#251c30', poolEdge: '#9b7b3e' }
  ];
  function pal() { return PAL[Math.min(PAL.length - 1, Math.floor(lvIdx / 20))]; }
  function buildBg(w) {
    var P = pal();
    var c = document.createElement('canvas'); c.width = W * DPR; c.height = H * DPR;
    var g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    var rnd = rnd0(11 + lvIdx * 977), tx, ty, i;
    // 1. derin mağara zemini
    var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, P.bg[0]); gr.addColorStop(0.55, P.bg[1]); gr.addColorStop(1, P.bg[2]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // 2. uzak kaya siluetleri (iki katman)
    [[P.sil[0], 0.9, 120], [P.sil[1], 1, 70]].forEach(function (L, k) {
      g.fillStyle = L[0];
      g.beginPath(); g.moveTo(0, 0);
      for (var x = 0; x <= W + 40; x += 40) g.lineTo(x, L[2] * (0.4 + rnd()) * (k ? 0.8 : 1));
      g.lineTo(W, 0); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, H);
      for (x = 0; x <= W + 50; x += 50) g.lineTo(x, H - L[2] * (0.6 + rnd() * 1.2));
      g.lineTo(W, H); g.closePath(); g.fill();
    });
    // 3. arka duvar taşları (soluk, büyük)
    g.strokeStyle = 'rgba(255,255,255,.03)'; g.lineWidth = 1.5;
    for (var y = 20; y < H; y += 44) { var off = (y / 44) % 2 ? 0 : 46; for (var x2 = -off; x2 < W; x2 += 92) { rrect(g, x2 + 3, y + 3, 86, 38, 9); g.stroke(); } }
    // 4. sis
    var fog = g.createLinearGradient(0, H * 0.55, 0, H); fog.addColorStop(0, 'rgba(' + P.fog + ',0)'); fog.addColorStop(1, 'rgba(' + P.fog + ',.10)');
    g.fillStyle = fog; g.fillRect(0, 0, W, H);
    // 5. platform altlarına gölge (ortam kapatma)
    for (ty = 0; ty < M.ROWS; ty++) for (tx = 0; tx < M.COLS; tx++) {
      if (!solidAt(w, tx, ty) || solidAt(w, tx, ty + 1) || ty + 1 >= M.ROWS) continue;
      var sh = g.createLinearGradient(0, (ty + 1) * T, 0, (ty + 1) * T + 26); sh.addColorStop(0, 'rgba(5,3,12,.55)'); sh.addColorStop(1, 'rgba(5,3,12,0)');
      g.fillStyle = sh; g.fillRect(tx * T, (ty + 1) * T, T, 26);
    }
    // 6. taş bloklar (havaya uzaklık: kaya kütlesinin içi koyulaşır)
    var depth = [];
    for (ty = 0; ty < M.ROWS; ty++) { depth[ty] = []; for (tx = 0; tx < M.COLS; tx++) depth[ty][tx] = solidAt(w, tx, ty) ? 99 : 0; }
    for (var pass = 0; pass < 5; pass++) for (ty = 0; ty < M.ROWS; ty++) for (tx = 0; tx < M.COLS; tx++) {
      if (!depth[ty][tx]) continue;
      var nb = Math.min(ty > 0 ? depth[ty - 1][tx] : 99, ty < M.ROWS - 1 ? depth[ty + 1][tx] : 99, tx > 0 ? depth[ty][tx - 1] : 99, tx < M.COLS - 1 ? depth[ty][tx + 1] : 99);
      depth[ty][tx] = Math.min(depth[ty][tx], nb + 1);
    }
    for (ty = 0; ty < M.ROWS; ty++) for (tx = 0; tx < M.COLS; tx++) {
      if (!solidAt(w, tx, ty)) continue;
      if (depth[ty][tx] >= 3) { // iç kaya: harçsız, koyu, lekeli
        var dk = Math.min(1, (depth[ty][tx] - 2) / 4);
        g.fillStyle = P.tile[1]; g.fillRect(tx * T, ty * T, T, T);
        g.fillStyle = 'rgba(6,4,12,' + (0.25 + dk * 0.45) + ')'; g.fillRect(tx * T, ty * T, T, T);
        for (i = 0; i < 2; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.025 * (1 - dk)) + ')'; g.beginPath(); g.ellipse(tx * T + rnd() * T, ty * T + rnd() * T, 3 + rnd() * 6, 2 + rnd() * 4, rnd() * 3, 0, 7); g.fill(); }
        continue;
      }
      var X = tx * T, Y = ty * T, up = !solidAt(w, tx, ty - 1) && !/[LWA]/.test(M.tileAt(w, tx, ty - 1)), dn = !solidAt(w, tx, ty + 1), lf = !solidAt(w, tx - 1, ty), rt = !solidAt(w, tx + 1, ty);
      var base = g.createLinearGradient(0, Y, 0, Y + T); base.addColorStop(0, P.tile[0]); base.addColorStop(1, P.tile[1]);
      g.fillStyle = base; g.fillRect(X, Y, T, T);
      if (depth[ty][tx] === 2) { g.fillStyle = 'rgba(6,4,12,.18)'; g.fillRect(X, Y, T, T); }
      // harç çizgileri
      g.fillStyle = 'rgba(20,14,34,.45)';
      g.fillRect(X, Y + 15, T, 1.5);
      g.fillRect(X + ((ty % 2) ? 8 : 24), Y, 1.5, 15); g.fillRect(X + ((ty % 2) ? 24 : 8), Y + 16, 1.5, 16);
      // taş dokusu
      for (i = 0; i < 3; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.08)'; g.fillRect(X + rnd() * 26, Y + rnd() * 26, 2 + rnd() * 4, 2 + rnd() * 3); }
      if (lf) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(X, Y, 2, T); }
      if (rt) { g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(X + T - 3, Y, 3, T); }
      if (dn) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(X, Y + T - 4, T, 4); }
      if (up) { // açık üst yüzey: yuvarlatılmış açık taş kapak
        var cap = g.createLinearGradient(0, Y - 2, 0, Y + 9); cap.addColorStop(0, P.cap[0]); cap.addColorStop(1, P.cap[1]);
        g.fillStyle = cap; rrect(g, X - (lf ? 1 : 0), Y - 2, T + (lf ? 1 : 0) + (rt ? 1 : 0), 10, lf || rt ? 5 : 0); g.fill();
        if (!lf && !rt) { g.fillRect(X, Y - 2, T, 10); }
        g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(X + (lf ? 4 : 0), Y - 2, T - (lf ? 4 : 0) - (rt ? 4 : 0), 1.5);
        if (rnd() < 0.3) { g.fillStyle = P.lip; g.beginPath(); g.ellipse(X + 6 + rnd() * 20, Y - 2, 3, 2, 0, Math.PI, 0); g.fill(); }
      }
    }
    // 7. sarkıtlar ve kristaller
    for (ty = 1; ty < M.ROWS - 1; ty++) for (tx = 1; tx < M.COLS - 1; tx++) {
      if (w.map[ty][tx] !== '.') continue;
      if (solidAt(w, tx, ty - 1) && rnd() < 0.3) {
        var len = 8 + rnd() * 18, sx = tx * T + 6 + rnd() * 20, sgr = g.createLinearGradient(0, ty * T, 0, ty * T + len);
        sgr.addColorStop(0, '#3a3252'); sgr.addColorStop(1, '#2a2440');
        g.fillStyle = sgr; g.beginPath(); g.moveTo(sx - 5, ty * T); g.quadraticCurveTo(sx - 1, ty * T + len * 0.6, sx, ty * T + len); g.quadraticCurveTo(sx + 1, ty * T + len * 0.6, sx + 5, ty * T); g.fill();
      }
      if (solidAt(w, tx, ty + 1) && !w.doorAt(tx, ty) && rnd() < 0.07) {
        var kx = tx * T + 8 + rnd() * 16, ky = (ty + 1) * T - 2, hue = rnd() < 0.5 ? ['#9b8cff', '#5a46d6'] : ['#5fe3d6', '#1f9c94'];
        [[-6, 10, -0.25], [0, 17, 0], [6, 11, 0.3]].forEach(function (k) {
          g.save(); g.translate(kx + k[0], ky); g.rotate(k[2]);
          var cg = g.createLinearGradient(-3, 0, 3, 0); cg.addColorStop(0, hue[0]); cg.addColorStop(1, hue[1]);
          g.fillStyle = cg; g.beginPath(); g.moveTo(-3.2, 0); g.lineTo(-2.4, -k[1] * 0.75); g.lineTo(0, -k[1]); g.lineTo(2.4, -k[1] * 0.75); g.lineTo(3.2, 0); g.fill();
          g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(-1.6, -k[1] * 0.7, 1, k[1] * 0.55); g.restore();
        });
        w.crystals.push({ x: kx, y: ky - 8, c: hue[0] });
      }
    }
    // 8. meşale yerleri
    for (var tries = 0; tries < 200 && w.torches.length < 4; tries++) { // en fazla 4 meşale, birbirinden uzak
      tx = 2 + Math.floor(rnd() * (M.COLS - 4)); ty = 3 + Math.floor(rnd() * (M.ROWS - 7));
      if (w.map[ty][tx] !== '.' || w.map[ty + 1][tx] !== '.' || w.map[ty - 1][tx] !== '.' || w.doorAt(tx, ty)) continue;
      var far = w.torches.every(function (o) { return Math.abs(o.x - (tx * T + 16)) > 8 * T || Math.abs(o.y - (ty * T + 18)) > 6 * T; });
      if (far) w.torches.push({ x: tx * T + 16, y: ty * T + 18 });
    }
    w.torches.forEach(function (o) {
      g.fillStyle = '#2a2236'; rrect(g, o.x - 7, o.y + 2, 14, 5, 2); g.fill();
      var tg = g.createLinearGradient(o.x - 3, 0, o.x + 3, 0); tg.addColorStop(0, '#7a5a3a'); tg.addColorStop(1, '#4a3424');
      g.fillStyle = tg; g.beginPath(); g.moveTo(o.x - 5, o.y - 2); g.lineTo(o.x + 5, o.y - 2); g.lineTo(o.x + 2.5, o.y + 14); g.lineTo(o.x - 2.5, o.y + 14); g.fill();
      g.fillStyle = '#2a1f17'; g.fillRect(o.x - 6, o.y - 4, 12, 3);
    });
    // 9. kapı kemerleri (kanatlar her karede çizilir)
    ['k', 'd'].forEach(function (cc) {
      var d = w.doors[cc]; if (!d) return;
      var col = cc === 'k' ? ['#ff9a3d', '#ff5a1f'] : ['#5ab8ff', '#2f7dff'], cxd = d.x + d.w / 2, top = d.y - 4;
      // iç boşluk
      g.fillStyle = '#0d0a16'; g.beginPath(); g.moveTo(d.x, d.y + d.h); g.lineTo(d.x, top + 16); g.arc(cxd, top + 16, d.w / 2, Math.PI, 0); g.lineTo(d.x + d.w, d.y + d.h); g.fill();
      // taş kemer
      g.lineWidth = 7; g.strokeStyle = P.arch;
      g.beginPath(); g.moveTo(d.x - 3.5, d.y + d.h); g.lineTo(d.x - 3.5, top + 16); g.arc(cxd, top + 16, d.w / 2 + 3.5, Math.PI, 0); g.lineTo(d.x + d.w + 3.5, d.y + d.h); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.25)';
      g.beginPath(); g.moveTo(d.x - 6.5, d.y + d.h); g.lineTo(d.x - 6.5, top + 16); g.arc(cxd, top + 16, d.w / 2 + 6.5, Math.PI, 0); g.stroke();
      // kilit taşı ve simge
      g.fillStyle = P.key; rrect(g, cxd - 9, top - 9, 18, 15, 4); g.fill();
      g.fillStyle = col[0]; icon(g, cc, cxd, top - 1.5, 5.2);
    });
    // 10. kenar karartma
    var vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // toz zerreleri
    w.motes = []; for (i = 0; i < 36; i++) w.motes.push({ x: rnd() * W, y: rnd() * H, s: 0.4 + rnd() * 1.2, p: rnd() * 6.28, v: 4 + rnd() * 10 });
    return c;
  }
  function icon(g, c, x, y, r) {
    g.beginPath();
    if (c === 'k') { g.moveTo(x, y - r * 1.3); g.bezierCurveTo(x + r * 1.2, y - r * 0.2, x + r * 0.9, y + r, x, y + r); g.bezierCurveTo(x - r * 0.9, y + r, x - r * 1.2, y - r * 0.2, x - r * 0.3, y - r * 0.6); g.quadraticCurveTo(x - r * 0.1, y - r * 0.1, x, y - r * 1.3); }
    else { g.moveTo(x, y - r * 1.3); g.bezierCurveTo(x + r * 0.5, y - r * 0.6, x + r, y, x + r * 0.95, y + r * 0.3); g.arc(x, y + r * 0.3, r * 0.95, 0, Math.PI); g.bezierCurveTo(x - r, y, x - r * 0.5, y - r * 0.6, x, y - r * 1.3); }
    g.fill();
  }

  var LIQ = { L: ['#ffc65a', '#ff5a1f', '#a8220c'], W: ['#9be0ff', '#2f8cff', '#173f9e'], A: ['#e2b6ff', '#9b4dff', '#4c1796'] };
  var light = document.createElement('canvas'), lx = light.getContext('2d'); light.width = W / 2; light.height = H / 2;
  function draw(t) {
    cx.save();
    if (shake > 0) { shake -= 1 / 60; cx.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake); }
    cx.drawImage(bg, 0, 0, W, H);
    var lights = [];
    // toz
    (w.motes || []).forEach(function (m) {
      var y = (m.y - t * m.v) % H; if (y < 0) y += H;
      cx.fillStyle = 'rgba(220,210,255,' + (0.18 + Math.sin(t + m.p) * 0.1) + ')'; cx.beginPath(); cx.arc(m.x + Math.sin(t * 0.6 + m.p) * 10, y, m.s, 0, 7); cx.fill();
    });
    // meşaleler
    (w.torches || []).forEach(function (o, i) {
      var fl = 1 + Math.sin(t * 13 + i * 2) * 0.12 + Math.sin(t * 7.3 + i) * 0.08;
      lights.push([o.x, o.y - 8, 150 * fl, 'rgba(255,170,80,']);
      cx.globalCompositeOperation = 'lighter';
      var gl = cx.createRadialGradient(o.x, o.y - 8, 1, o.x, o.y - 8, 26 * fl); gl.addColorStop(0, 'rgba(255,190,90,.55)'); gl.addColorStop(1, 'rgba(255,120,30,0)');
      cx.fillStyle = gl; cx.beginPath(); cx.arc(o.x, o.y - 8, 26 * fl, 0, 7); cx.fill();
      cx.globalCompositeOperation = 'source-over';
      cx.fillStyle = '#ff7a24'; cx.beginPath(); cx.moveTo(o.x - 5, o.y - 2); cx.quadraticCurveTo(o.x - 5 * fl, o.y - 12, o.x + Math.sin(t * 9 + i) * 1.5, o.y - 19 * fl); cx.quadraticCurveTo(o.x + 5 * fl, o.y - 12, o.x + 5, o.y - 2); cx.fill();
      cx.fillStyle = '#ffe08a'; cx.beginPath(); cx.moveTo(o.x - 2.4, o.y - 2); cx.quadraticCurveTo(o.x - 2.6, o.y - 8, o.x, o.y - 12 * fl); cx.quadraticCurveTo(o.x + 2.6, o.y - 8, o.x + 2.4, o.y - 2); cx.fill();
      if (Math.random() < 0.08) parts.push({ x: o.x, y: o.y - 16, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 30, life: 0.7, t: 0, col: '#ffb347', r: 1.1, g: -0.2 });
    });
    (w.crystals || []).forEach(function (k, i) { lights.push([k.x, k.y, 46 + Math.sin(t * 2 + i) * 6, k.c === '#9b8cff' ? 'rgba(150,130,255,' : 'rgba(80,220,210,']); });
    // sıvılar
    for (var ty = 0; ty < M.ROWS; ty++) {
      for (var tx = 0; tx < M.COLS; tx++) {
        var c = w.map[ty][tx]; if (!LIQ[c] || w.map[ty][tx - 1] === c) continue;
        var tx2 = tx; while (w.map[ty][tx2 + 1] === c) tx2++;
        var X = tx * T, X2 = (tx2 + 1) * T, Y = ty * T, col = LIQ[c], top = Y + M.LIQ - 3;
        var wave = function (xx) { return top + Math.sin(t * 2.6 + xx * 0.09) * 1.8 + Math.sin(t * 4.1 + xx * 0.21) * 0.9; };
        // havuz kenarı
        var P = pal(); cx.fillStyle = P.pool; cx.fillRect(X, Y + 4, X2 - X, T - 4);
        var gr = cx.createLinearGradient(0, top, 0, Y + T); gr.addColorStop(0, col[1]); gr.addColorStop(1, col[2]);
        cx.fillStyle = gr; cx.beginPath(); cx.moveTo(X + 2, Y + T);
        for (var xx = X + 2; xx <= X2 - 2; xx += 2) cx.lineTo(xx, wave(xx));
        cx.lineTo(X2 - 2, Y + T); cx.closePath(); cx.fill();
        cx.strokeStyle = col[0]; cx.lineWidth = 2.4; cx.lineCap = 'round'; cx.beginPath();
        for (xx = X + 3; xx <= X2 - 3; xx += 2) { var yy = wave(xx); xx === X + 3 ? cx.moveTo(xx, yy) : cx.lineTo(xx, yy); }
        cx.stroke();
        var n = tx2 - tx + 1;
        for (var i = 0; i < n * 2; i++) {
          var ph = (t * (c === 'W' ? 0.35 : 0.7) + i * 0.37 + tx * 0.13) % 1, bx = X + 4 + ((i * 23 + tx * 7) % Math.max(1, X2 - X - 10));
          if (c === 'W') { cx.fillStyle = 'rgba(255,255,255,' + (0.4 * Math.sin(ph * Math.PI)) + ')'; rrect(cx, bx, top + 6 + (i % 3) * 4, 7, 1.6, 0.8); cx.fill(); }
          else { cx.fillStyle = col[0]; cx.globalAlpha = 0.85 * (1 - ph); cx.beginPath(); cx.arc(bx, top + 8 - ph * 16, 1.4 + ph * 2.2, 0, 7); cx.fill(); cx.globalAlpha = 1; }
        }
        // kenar taşları
        cx.fillStyle = P.poolEdge; rrect(cx, X - 2, Y + 2, 5, T - 2, 2); cx.fill(); rrect(cx, X2 - 3, Y + 2, 5, T - 2, 2); cx.fill();
        if (c !== 'W') lights.push([(X + X2) / 2, top, 60 + n * 22, c === 'L' ? 'rgba(255,110,30,' : 'rgba(170,90,255,']);
        else lights.push([(X + X2) / 2, top, 40 + n * 14, 'rgba(70,150,255,']);
        tx = tx2;
      }
    }
    // düğmeler
    w.plates.forEach(function (pl) {
      var X = pl.x * T, Y = pl.y * T + T, gc = GCOL[pl.g] || '#fff', h = pl.on ? 3 : 7;
      cx.fillStyle = '#2b2440'; rrect(cx, X + 1, Y - 6, T - 2, 6, 2); cx.fill();
      var mg = cx.createLinearGradient(0, Y - 6 - h, 0, Y - 6); mg.addColorStop(0, '#b8b2cc'); mg.addColorStop(1, '#6f6889');
      cx.fillStyle = mg; rrect(cx, X + 5, Y - 6 - h, T - 10, h + 1, 2.5); cx.fill();
      cx.fillStyle = gc; cx.globalAlpha = pl.on ? 1 : 0.55; rrect(cx, X + 9, Y - 5 - h, T - 18, 2.4, 1.2); cx.fill(); cx.globalAlpha = 1;
      if (pl.on) lights.push([X + T / 2, Y - 8, 50, hexA(gc)]);
    });
    // kollar
    w.levers.forEach(function (l) {
      var X = l.x * T + T / 2, Y = l.y * T + T, gc = GCOL[l.g] || '#fff', a = l.on ? 0.6 : -0.6;
      cx.save(); cx.translate(X, Y - 6); cx.rotate(a);
      var hg = cx.createLinearGradient(-2, 0, 2, 0); hg.addColorStop(0, '#d9d4e8'); hg.addColorStop(1, '#8a84a2');
      cx.fillStyle = hg; rrect(cx, -2, -22, 4, 22, 2); cx.fill();
      var kg = cx.createRadialGradient(-1.5, -24, 0.5, 0, -23, 6); kg.addColorStop(0, '#fff'); kg.addColorStop(0.35, gc); kg.addColorStop(1, shade(gc));
      cx.fillStyle = kg; cx.beginPath(); cx.arc(0, -23, 5.5, 0, 7); cx.fill();
      cx.restore();
      var bgL = cx.createLinearGradient(0, Y - 10, 0, Y); bgL.addColorStop(0, '#5f5781'); bgL.addColorStop(1, '#3a3352');
      cx.fillStyle = bgL; cx.beginPath(); cx.moveTo(X - 13, Y); cx.lineTo(X - 9, Y - 9); cx.lineTo(X + 9, Y - 9); cx.lineTo(X + 13, Y); cx.closePath(); cx.fill();
      cx.fillStyle = l.on ? gc : '#2a2340'; cx.beginPath(); cx.arc(X, Y - 4, 2.2, 0, 7); cx.fill();
      if (l.on) lights.push([X, Y - 6, 40, hexA(gc)]);
    });
    // hareketli platformlar ve kapılar
    w.movers.forEach(function (m) {
      var gc = GCOL[m.g] || '#fff', moving = Math.abs(m.vx) + Math.abs(m.vy) > 1;
      if (m.h > m.w) { // demir parmaklıklı kapı
        cx.fillStyle = 'rgba(20,14,34,.6)'; cx.fillRect(m.x, m.y, m.w, m.h);
        var bg2 = cx.createLinearGradient(m.x, 0, m.x + m.w, 0); bg2.addColorStop(0, '#7d7698'); bg2.addColorStop(0.5, '#b9b3cf'); bg2.addColorStop(1, '#6b6487');
        cx.fillStyle = bg2;
        for (var bx2 = m.x + 5; bx2 < m.x + m.w - 3; bx2 += 9) rrect(cx, bx2, m.y + 2, 4, m.h - 4, 2), cx.fill();
        cx.fillStyle = '#5b5478'; [m.y + 4, m.y + m.h / 2 - 3, m.y + m.h - 10].forEach(function (yy) { rrect(cx, m.x + 1, yy, m.w - 2, 6, 2); cx.fill(); });
        cx.fillStyle = gc; cx.globalAlpha = 0.9; rrect(cx, m.x + 3, m.y + m.h - 8, m.w - 6, 2.5, 1); cx.fill(); cx.globalAlpha = 1;
        lights.push([m.x + m.w / 2, m.y + m.h - 6, 30, hexA(gc)]);
      } else { // perçinli platform
        var pg = cx.createLinearGradient(0, m.y, 0, m.y + m.h); pg.addColorStop(0, '#a49dbd'); pg.addColorStop(0.25, '#7a7396'); pg.addColorStop(1, '#4e4769');
        cx.fillStyle = pg; rrect(cx, m.x, m.y, m.w, m.h, 4); cx.fill();
        cx.fillStyle = 'rgba(255,255,255,.35)'; cx.fillRect(m.x + 4, m.y + 1, m.w - 8, 1.5);
        cx.fillStyle = '#3d3657'; for (var rx = m.x + 8; rx < m.x + m.w - 4; rx += 16) { cx.beginPath(); cx.arc(rx, m.y + m.h / 2 + 1, 1.8, 0, 7); cx.fill(); }
        cx.fillStyle = gc; rrect(cx, m.x + 6, m.y + m.h - 5, m.w - 12, 2.6, 1.3); cx.fill();
        lights.push([m.x + m.w / 2, m.y + m.h, 44, hexA(gc)]);
      }
      if (moving && Math.random() < 0.3) parts.push({ x: m.x + Math.random() * m.w, y: m.y + m.h, vx: (Math.random() - 0.5) * 40, vy: 20, life: 0.3, t: 0, col: '#ffd27a', r: 1 });
    });
    // kutular
    w.boxes.forEach(function (b) {
      var wg = cx.createLinearGradient(0, b.y, 0, b.y + b.h); wg.addColorStop(0, '#b98552'); wg.addColorStop(1, '#7c5230');
      cx.fillStyle = wg; rrect(cx, b.x, b.y, b.w, b.h, 3); cx.fill();
      cx.fillStyle = 'rgba(60,35,15,.55)'; [b.y + 9, b.y + 19].forEach(function (yy) { cx.fillRect(b.x + 3, yy, b.w - 6, 1.5); });
      cx.strokeStyle = '#5a3a1e'; cx.lineWidth = 3; rrect(cx, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, 2.5); cx.stroke();
      cx.strokeStyle = '#6e4826'; cx.lineWidth = 3.5; cx.beginPath(); cx.moveTo(b.x + 4, b.y + 4); cx.lineTo(b.x + b.w - 4, b.y + b.h - 4); cx.stroke();
      cx.fillStyle = '#9a95ad'; [[b.x + 2, b.y + 2], [b.x + b.w - 7, b.y + 2], [b.x + 2, b.y + b.h - 7], [b.x + b.w - 7, b.y + b.h - 7]].forEach(function (q) { rrect(cx, q[0], q[1], 5, 5, 1.2); cx.fill(); });
    });
    // taşlar
    w.gems.forEach(function (g) {
      if (g.got) return;
      var x = g.x + 8, y = g.y + 8 + Math.sin(t * 3 + g.id) * 3, fire = g.c === 'k';
      lights.push([x, y, 34, fire ? 'rgba(255,140,40,' : 'rgba(80,170,255,']);
      cx.save(); cx.translate(x, y);
      if (fire) { // kesme elmas
        cx.fillStyle = '#c2340f'; cx.beginPath(); cx.moveTo(-8, -2); cx.lineTo(-4, -7); cx.lineTo(4, -7); cx.lineTo(8, -2); cx.lineTo(0, 8); cx.closePath(); cx.fill();
        cx.fillStyle = '#ff7a2a'; cx.beginPath(); cx.moveTo(-8, -2); cx.lineTo(-4, -7); cx.lineTo(0, -2); cx.closePath(); cx.fill(); cx.beginPath(); cx.moveTo(8, -2); cx.lineTo(4, -7); cx.lineTo(0, -2); cx.closePath(); cx.fill();
        cx.fillStyle = '#ffb347'; cx.beginPath(); cx.moveTo(-4, -7); cx.lineTo(4, -7); cx.lineTo(0, -2); cx.closePath(); cx.fill();
        cx.fillStyle = '#ff9a3d'; cx.beginPath(); cx.moveTo(-8, -2); cx.lineTo(0, -2); cx.lineTo(0, 8); cx.closePath(); cx.fill();
      } else { // damla mücevher
        cx.fillStyle = '#1f5fd6'; cx.beginPath(); cx.moveTo(0, -9); cx.bezierCurveTo(3, -4, 7, 0, 7, 3); cx.arc(0, 3, 7, 0, Math.PI); cx.bezierCurveTo(-7, 0, -3, -4, 0, -9); cx.fill();
        cx.fillStyle = '#5cb8ff'; cx.beginPath(); cx.moveTo(0, -9); cx.bezierCurveTo(3, -4, 7, 0, 7, 3); cx.lineTo(0, 3); cx.closePath(); cx.fill();
        cx.fillStyle = '#9fdcff'; cx.beginPath(); cx.moveTo(0, -9); cx.lineTo(0, 3); cx.lineTo(-7, 3); cx.bezierCurveTo(-7, 0, -3, -4, 0, -9); cx.fill();
      }
      cx.fillStyle = 'rgba(255,255,255,.9)'; cx.beginPath(); cx.ellipse(-2.5, -3, 1.4, 2.4, 0.5, 0, 7); cx.fill();
      var tw = Math.max(0, Math.sin(t * 2.2 + g.id * 1.7)); if (tw > 0.85) { cx.globalAlpha = (tw - 0.85) / 0.15; star(5, -6, 5); cx.globalAlpha = 1; }
      cx.restore();
    });
    // kapı kanatları
    ['k', 'd'].forEach(function (c) {
      var d = w.doors[c], p = w.p[c]; if (!d) return;
      d.open = d.open || 0; var target = (p && p.atDoor) || w.won ? 1 : 0;
      d.open += (target - d.open) * 0.12;
      var cxd = d.x + d.w / 2, top = d.y - 4, col = c === 'k' ? ['255,150,60', '#ff9a3d', '#ff5a1f'] : ['90,180,255', '#5ab8ff', '#2f7dff'];
      cx.save(); cx.beginPath(); cx.moveTo(d.x, d.y + d.h); cx.lineTo(d.x, top + 16); cx.arc(cxd, top + 16, d.w / 2, Math.PI, 0); cx.lineTo(d.x + d.w, d.y + d.h); cx.closePath(); cx.clip();
      if (d.open > 0.02) { // içeriden ışık
        var ig = cx.createRadialGradient(cxd, d.y + d.h * 0.55, 2, cxd, d.y + d.h * 0.55, 40); ig.addColorStop(0, 'rgba(255,255,255,' + 0.9 * d.open + ')'); ig.addColorStop(0.3, 'rgba(' + col[0] + ',' + 0.9 * d.open + ')'); ig.addColorStop(1, 'rgba(' + col[0] + ',0.1)');
        cx.fillStyle = ig; cx.fillRect(d.x, top, d.w, d.h + 8);
        for (var s = 0; s < 4; s++) { var sp = (t * 0.7 + s * 0.25) % 1; cx.fillStyle = 'rgba(255,255,255,' + (1 - sp) * d.open + ')'; cx.beginPath(); cx.arc(cxd + Math.sin(t * 3 + s * 2) * 7, d.y + d.h - sp * d.h, 1.3, 0, 7); cx.fill(); }
      }
      var half = d.w / 2, slide = half * d.open;
      [[-1, d.x - slide], [1, cxd + slide]].forEach(function (q) {
        var px = q[1], dg = cx.createLinearGradient(px, 0, px + half, 0);
        dg.addColorStop(0, q[0] < 0 ? '#4a4068' : '#3b3355'); dg.addColorStop(1, q[0] < 0 ? '#3b3355' : '#4a4068');
        cx.fillStyle = dg; cx.fillRect(px, top - 10, half, d.h + 16);
        cx.fillStyle = 'rgba(0,0,0,.25)'; for (var yy = top + 6; yy < d.y + d.h; yy += 10) cx.fillRect(px + 2, yy, half - 4, 1.2);
        cx.fillStyle = col[1]; cx.globalAlpha = 0.85; cx.fillRect(q[0] < 0 ? px + half - 2 : px, top - 10, 2, d.h + 16); cx.globalAlpha = 1;
      });
      cx.restore();
      if (d.open > 0.05) lights.push([cxd, d.y + d.h * 0.6, 90 * d.open + 20, 'rgba(' + col[0] + ',']);
      else lights.push([cxd, d.y + 6, 28, 'rgba(' + col[0] + ',']);
    });
    // karakterler
    ['d', 'k'].forEach(function (c) {
      var p = w.p[c]; if (!p || p.dead) return;
      var ent = w.won && enterT ? Math.min(1, (performance.now() - enterT) / 700) : 0;
      if (ent > 0) { var d = w.doors[c]; cx.save(); cx.globalAlpha = 1 - ent; var ox = d.x + d.w / 2, oy = d.y + d.h; cx.translate(ox, oy); cx.scale(1 - ent * 0.5, 1 - ent * 0.5); cx.translate(-ox, -oy); }
      hero(p, t);
      if (ent > 0) cx.restore();
      lights.push([p.x + p.w / 2, p.y + p.h / 2 - 4, c === 'k' ? 120 : 80, c === 'k' ? 'rgba(255,150,60,' : 'rgba(110,190,255,']);
    });
    // parçacıklar
    parts = parts.filter(function (q) { q.t += 1 / 60; return q.t < q.life; });
    cx.globalCompositeOperation = 'lighter';
    parts.forEach(function (q) { q.vy += (q.g != null ? q.g : 1) * 500 / 60; q.x += q.vx / 60; q.y += q.vy / 60; cx.globalAlpha = Math.max(0, 1 - q.t / q.life); cx.fillStyle = q.col; cx.beginPath(); cx.arc(q.x, q.y, q.r, 0, 7); cx.fill(); });
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
    // ışıklandırma: sahneyi hafifçe karart, ışık kaynaklarını aç (yarım çözünürlüklü ışık haritası)
    lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, light.width, light.height);
    lx.fillStyle = 'rgba(8,5,18,.42)'; lx.fillRect(0, 0, light.width, light.height);
    lx.globalCompositeOperation = 'destination-out';
    lights.forEach(function (L) { var g2 = lx.createRadialGradient(L[0] / 2, L[1] / 2, 0, L[0] / 2, L[1] / 2, L[2] / 2); g2.addColorStop(0, 'rgba(0,0,0,.9)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); lx.fillStyle = g2; lx.beginPath(); lx.arc(L[0] / 2, L[1] / 2, L[2] / 2, 0, 7); lx.fill(); });
    cx.drawImage(light, 0, 0, W, H);
    cx.globalCompositeOperation = 'lighter';
    lights.forEach(function (L) { var g2 = cx.createRadialGradient(L[0], L[1], 0, L[0], L[1], L[2] * 0.6); g2.addColorStop(0, L[3] + '0.10)'); g2.addColorStop(1, L[3] + '0)'); cx.fillStyle = g2; cx.beginPath(); cx.arc(L[0], L[1], L[2] * 0.6, 0, 7); cx.fill(); });
    cx.globalCompositeOperation = 'source-over';
    if (paused && running) { cx.fillStyle = 'rgba(10,8,20,.55)'; cx.fillRect(0, 0, W, H); }
    cx.restore();
  }
  function star(x, y, r) { cx.fillStyle = '#fff'; cx.beginPath(); cx.moveTo(x, y - r); cx.quadraticCurveTo(x, y, x + r, y); cx.quadraticCurveTo(x, y, x, y + r); cx.quadraticCurveTo(x, y, x - r, y); cx.quadraticCurveTo(x, y, x, y - r); cx.fill(); }
  function hexA(h) { var n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ','; }
  function shade(h) { var n = parseInt(h.slice(1), 16); return 'rgb(' + ((n >> 16) * 0.55 | 0) + ',' + (((n >> 8) & 255) * 0.55 | 0) + ',' + ((n & 255) * 0.55 | 0) + ')'; }
  function hero(p, t) {
    var x = p.x + p.w / 2, y = p.y + p.h, moving = Math.abs(p.vx) > 20 && p.ground;
    var air = !p.ground, sq = air ? (p.vy < 0 ? 0.88 : 1.07) : (moving ? 1 + Math.sin(t * 18) * 0.035 : 1 + Math.sin(t * 2.6) * 0.022);
    if (p.landed) p.squash = 0.18;
    if (p.squash) { sq *= 1 - p.squash; p.squash = Math.max(0, p.squash - 0.02); }
    var sw = 1 / sq, mine = !net || p.c === net.me, sel = !net && mode === 'local' && document.body.classList.contains('touch') && p.c === active;
    var walk = moving ? t * 16 : 0;
    // zemin gölgesi
    if (p.ground) { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(x, y + 1, 13, 3.5, 0, 0, 7); cx.fill(); }
    cx.save(); cx.translate(x, y); cx.scale(sw, sq);
    if (p.c === 'k') drawKor(p, t, walk); else drawDamla(p, t, walk);
    cx.restore();
    if (p.c === 'k' && Math.random() < 0.35) parts.push({ x: x + (Math.random() - 0.5) * 18, y: y - 30, vx: (Math.random() - 0.5) * 26, vy: -50 - Math.random() * 70, life: 0.5 + Math.random() * 0.4, t: 0, col: Math.random() < 0.5 ? '#ffd36b' : '#ff7a1a', r: 1 + Math.random() * 1.6 });
    if (!mine || sel) {
      cx.font = '800 12px ' + ROUND; cx.textAlign = 'center';
      var label = sel ? '▼' : (net && net.otherName) || NAMES[p.c], lw = cx.measureText(label).width + 12;
      cx.fillStyle = 'rgba(10,8,20,.55)'; cx.beginPath(); cx.roundRect ? cx.roundRect(x - lw / 2, p.y - 30, lw, 16, 8) : cx.rect(x - lw / 2, p.y - 30, lw, 16); cx.fill();
      cx.fillStyle = p.c === 'k' ? '#ffcf9a' : '#bfe6ff'; cx.fillText(label, x, p.y - 18.5);
    }
  }
  function blob(path) { cx.beginPath(); path(); cx.closePath(); }
  function korShape() { // yuvarlak, altı genişçe bir kömür taşı
    blob(function () {
      cx.moveTo(-15, -6);
      cx.bezierCurveTo(-17, -20, -11, -33, 0, -33);
      cx.bezierCurveTo(11, -33, 17, -20, 15, -6);
      cx.bezierCurveTo(14, -1, 9, 0, 0, 0);
      cx.bezierCurveTo(-9, 0, -14, -1, -15, -6);
    });
  }
  function drawKor(p, t, walk) {
    var pulse = 0.65 + Math.sin(t * 5.2) * 0.2 + Math.sin(t * 11.3) * 0.08;
    // sıcak ışık
    cx.globalCompositeOperation = 'lighter';
    var gl = cx.createRadialGradient(0, -16, 2, 0, -16, 46); gl.addColorStop(0, 'rgba(255,140,40,' + (0.32 * pulse) + ')'); gl.addColorStop(1, 'rgba(255,90,20,0)');
    cx.fillStyle = gl; cx.beginPath(); cx.arc(0, -16, 46, 0, 7); cx.fill();
    cx.globalCompositeOperation = 'source-over';
    // ayaklar
    var f1 = Math.sin(walk) * 2.5, f2 = Math.sin(walk + Math.PI) * 2.5;
    cx.fillStyle = '#1c1310';
    cx.beginPath(); cx.ellipse(-7, -1.5 + Math.min(0, f1), 5, 3.2, 0, 0, 7); cx.fill();
    cx.beginPath(); cx.ellipse(7, -1.5 + Math.min(0, f2), 5, 3.2, 0, 0, 7); cx.fill();
    // gövde
    korShape();
    var bg = cx.createRadialGradient(-5 * p.face, -24, 2, 0, -14, 22);
    bg.addColorStop(0, '#6e5244'); bg.addColorStop(0.55, '#3a2822'); bg.addColorStop(1, '#1d1310');
    cx.fillStyle = bg; cx.fill();
    // iç ateş: çatlaklar
    cx.save(); korShape(); cx.clip();
    var core = cx.createRadialGradient(0, -8, 1, 0, -8, 16); core.addColorStop(0, 'rgba(255,170,60,' + (0.45 * pulse) + ')'); core.addColorStop(1, 'rgba(255,90,20,0)');
    cx.fillStyle = core; cx.fillRect(-18, -34, 36, 36);
    var cracks = [[[-12, -4], [-7, -10], [-9, -16], [-4, -22]], [[13, -8], [8, -12], [10, -19]], [[-2, -2], [2, -7], [0, -11]], [[4, -30], [1, -26], [5, -22]]];
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    [[4.5, 'rgba(255,110,20,' + (0.45 * pulse) + ')'], [2.2, '#ff8a2a'], [1, '#ffe28a']].forEach(function (s) {
      cx.lineWidth = s[0]; cx.strokeStyle = s[1];
      cracks.forEach(function (c) { cx.beginPath(); c.forEach(function (pt, i) { i ? cx.lineTo(pt[0], pt[1]) : cx.moveTo(pt[0], pt[1]); }); cx.stroke(); });
    });
    // üst kenar ışığı
    cx.strokeStyle = 'rgba(255,200,150,.25)'; cx.lineWidth = 3; cx.beginPath(); cx.arc(-3 * p.face, -15, 16, Math.PI * 1.15, Math.PI * 1.6); cx.stroke();
    cx.restore();
    korShape(); cx.strokeStyle = '#0f0806'; cx.lineWidth = 2; cx.stroke();
    // tepedeki küçük alevler (çatlaktan çıkan)
    cx.globalCompositeOperation = 'lighter';
    [[-4, 0.9, 0], [3, 1.15, 1.7], [9, 0.75, 3.1]].forEach(function (f) {
      var h = (7 + Math.sin(t * 9 + f[2]) * 2.2) * f[1], sway = Math.sin(t * 6 + f[2]) * 1.6, bx = f[0] - 2, by = -30 + Math.abs(f[0]) * 0.18;
      cx.fillStyle = 'rgba(255,110,25,.85)'; cx.beginPath(); cx.moveTo(bx - 3.2, by + 2); cx.quadraticCurveTo(bx - 3, by - h * 0.6, bx + sway, by - h); cx.quadraticCurveTo(bx + 3, by - h * 0.5, bx + 3.2, by + 2); cx.fill();
      cx.fillStyle = 'rgba(255,225,130,.9)'; cx.beginPath(); cx.moveTo(bx - 1.5, by + 1.5); cx.quadraticCurveTo(bx - 1.2, by - h * 0.4, bx + sway * 0.6, by - h * 0.62); cx.quadraticCurveTo(bx + 1.3, by - h * 0.3, bx + 1.5, by + 1.5); cx.fill();
    });
    cx.globalCompositeOperation = 'source-over';
    eyesPro(p, t, -17, 7, '#fff3dc', '#2b1206', '#ffb347');
    // ağız
    cx.strokeStyle = '#140a06'; cx.lineWidth = 1.6; cx.lineCap = 'round';
    cx.beginPath(); cx.arc(p.face * 2, -10.5, 2.6, 0.15 * Math.PI, 0.85 * Math.PI); cx.stroke();
  }
  function damlaShape(t, moving) {
    var wb = function (k) { return Math.sin(t * 7 + k) * (moving ? 1.3 : 0.8); };
    blob(function () {
      cx.moveTo(0 + wb(0) * 0.6, -38);
      cx.bezierCurveTo(4 + wb(1), -30, 15 + wb(2), -22, 15.5 + wb(3), -11);
      cx.bezierCurveTo(16 + wb(4), -3, 9, 0, 0, 0);
      cx.bezierCurveTo(-9, 0, -16 - wb(5), -3, -15.5 - wb(6), -11);
      cx.bezierCurveTo(-15 - wb(7), -22, -4 - wb(8), -30, 0 + wb(0) * 0.6, -38);
    });
  }
  function drawDamla(p, t, walk) {
    var moving = !!walk;
    cx.globalCompositeOperation = 'lighter';
    var gl = cx.createRadialGradient(0, -14, 2, 0, -14, 36); gl.addColorStop(0, 'rgba(80,170,255,.22)'); gl.addColorStop(1, 'rgba(40,120,255,0)');
    cx.fillStyle = gl; cx.beginPath(); cx.arc(0, -14, 36, 0, 7); cx.fill();
    cx.globalCompositeOperation = 'source-over';
    damlaShape(t, moving);
    var bg = cx.createLinearGradient(-10, -38, 8, 0);
    bg.addColorStop(0, '#c9f1ff'); bg.addColorStop(0.35, '#5cc2ff'); bg.addColorStop(0.8, '#2a83f0'); bg.addColorStop(1, '#1a5ccc');
    cx.fillStyle = bg; cx.fill();
    cx.save(); damlaShape(t, moving); cx.clip();
    // iç ışık kırılması ve kabarcıklar
    cx.fillStyle = 'rgba(255,255,255,.18)'; cx.beginPath(); cx.ellipse(5, -6, 11, 5, -0.3, 0, 7); cx.fill();
    cx.fillStyle = 'rgba(10,60,160,.25)'; cx.beginPath(); cx.ellipse(0, 2, 18, 7, 0, 0, 7); cx.fill();
    for (var i = 0; i < 4; i++) {
      var ph = (t * 0.45 + i * 0.27) % 1, bx = Math.sin(i * 2.3 + t * 2) * 6 + (i - 1.5) * 3, by = -3 - ph * 26;
      cx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - ph)) + ')'; cx.beginPath(); cx.arc(bx, by, 1.2 + (i % 2), 0, 7); cx.fill();
    }
    cx.restore();
    damlaShape(t, moving); cx.strokeStyle = '#0b3a8f'; cx.lineWidth = 2; cx.stroke();
    // parlak yansıma
    cx.strokeStyle = 'rgba(255,255,255,.9)'; cx.lineWidth = 2.6; cx.lineCap = 'round';
    cx.beginPath(); cx.moveTo(-9, -15); cx.quadraticCurveTo(-9, -22, -4.5, -27); cx.stroke();
    cx.fillStyle = 'rgba(255,255,255,.9)'; cx.beginPath(); cx.arc(-10, -11.5, 1.4, 0, 7); cx.fill();
    // yanaklar
    cx.fillStyle = 'rgba(255,140,180,.28)';
    cx.beginPath(); cx.ellipse(-8 + p.face * 2, -8.5, 3, 1.8, 0, 0, 7); cx.fill();
    cx.beginPath(); cx.ellipse(8 + p.face * 2, -8.5, 3, 1.8, 0, 0, 7); cx.fill();
    eyesPro(p, t, -14, 6.5, '#ffffff', '#0c2350', '#7fd0ff');
    cx.strokeStyle = '#0b2a66'; cx.lineWidth = 1.5; cx.lineCap = 'round';
    cx.beginPath(); cx.arc(p.face * 2, -8, 2.3, 0.15 * Math.PI, 0.85 * Math.PI); cx.stroke();
  }
  function eyesPro(p, t, ey, gap, white, pupil, iris) {
    var seed = p.c === 'k' ? 0 : 1.7, blink = ((t + seed) % 4) < 0.12, dx = p.face * 2.2, dy = p.vy < -50 ? -1.2 : p.vy > 120 ? 1 : 0;
    [-gap, gap].forEach(function (ox) {
      var ex = ox + dx;
      if (blink) { cx.strokeStyle = pupil; cx.lineWidth = 1.8; cx.beginPath(); cx.moveTo(ex - 3.5, ey); cx.lineTo(ex + 3.5, ey); cx.stroke(); return; }
      cx.fillStyle = white; cx.beginPath(); cx.ellipse(ex, ey, 4.3, 5.2, 0, 0, 7); cx.fill();
      cx.strokeStyle = 'rgba(0,0,0,.35)'; cx.lineWidth = 0.8; cx.stroke();
      cx.fillStyle = iris; cx.beginPath(); cx.arc(ex + p.face * 1.3, ey + 0.6 + dy, 3, 0, 7); cx.fill();
      cx.fillStyle = pupil; cx.beginPath(); cx.arc(ex + p.face * 1.5, ey + 0.8 + dy, 1.9, 0, 7); cx.fill();
      cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(ex + p.face * 0.6 - 0.8, ey - 1.4 + dy, 1.1, 0, 7); cx.fill();
    });
  }
  function rr(x, y, w2, h2, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w2, y, x + w2, y + h2, r); cx.arcTo(x + w2, y + h2, x, y + h2, 4); cx.arcTo(x, y + h2, x, y, 4); cx.arcTo(x, y, x + w2, y, r); cx.closePath(); }

  // ---------- üst bilgi ----------
  function hud() {
    if (!w) return;
    $('lvChip').innerHTML = '<b>' + (lvIdx + 1) + '</b> · ' + esc(LV[lvIdx].name);
    var gk = w.gems.filter(function (g) { return g.c === 'k'; }), gd = w.gems.filter(function (g) { return g.c === 'd'; });
    $('gemK').textContent = gk.filter(function (g) { return g.got; }).length + '/' + gk.length;
    $('gemD').textContent = gd.filter(function (g) { return g.got; }).length + '/' + gd.length;
    $('swapBtn').hidden = !!net;
    $('swapBtn').dataset.c = active;
    $('modeChip').textContent = net ? 'Online · sen ' + NAMES[net.me] : 'Aynı cihaz';
  }
  var lastSec = -1;
  function tickHud() {
    if (!w) return;
    var s = Math.floor(w.t); if (s === lastSec) return; lastSec = s;
    $('timeChip').textContent = Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
  }
  var hintT;
  function hint(txt) { var el = $('hint'); el.textContent = txt; el.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(function () { el.classList.remove('show'); }, 7000); }
  var toastT;
  function toast(m, ms) { var el = $('toast'); el.textContent = m; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('show'); }, ms || 1800); }

  // ---------- bölüm sonu ----------
  function win() {
    if (wonShown) return; wonShown = true; running = false; enterT = performance.now(); SND.win();
    var st = M.stars(w), time = w.t, best = prog[lvIdx];
    if (!best || st > best.stars || (st === best.stars && time < best.time)) prog[lvIdx] = { stars: st, time: Math.round(time * 10) / 10 };
    ls('kd_prog', prog);
    var got = w.gems.filter(function (g) { return g.got; }).length;
    $('endTitle').textContent = ['', 'Geçtiniz!', 'Çok iyi!', 'Kusursuz!'][st];
    $('endStars').innerHTML = [1, 2, 3].map(function (i) { return '<i class="' + (i <= st ? 'on' : '') + '">★</i>'; }).join('');
    $('endInfo').innerHTML = 'Süre <b>' + fmt(time) + '</b> (hedef ' + fmt(LV[lvIdx].par) + ') · Taş <b>' + got + '/' + w.gems.length + '</b>';
    var lastLv = lvIdx >= LV.length - 1;
    $('nextBtn').textContent = lastLv ? 'Bölümler' : 'Sonraki bölüm →';
    $('nextBtn').hidden = !!(net && net.me !== 'k' && !lastLv);
    $('endWait').hidden = !(net && net.me !== 'k' && !lastLv);
    if (lastLv) $('endInfo').innerHTML += '<br>Bütün bölümleri bitirdiniz! Daha az sürede, bütün taşlarla yeniden deneyin.';
    setTimeout(function () { openModal('endModal'); }, 1100);
  }
  function fmt(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  $('nextBtn').onclick = function () {
    if (lvIdx >= LV.length - 1) { openLevels(); return; }
    if (net) { net.lv = lvIdx + 1; net.run = 0; }
    load(lvIdx + 1);
  };
  $('againBtn').onclick = function () { restart(true); };
  $('listBtn').onclick = openLevels;

  // ---------- pencereler ----------
  function anyModal() { return !!document.querySelector('.modal:not([hidden])'); }
  function openModal(id) { closeModals(); $(id).hidden = false; paused = true; }
  function closeModals() { document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; }); paused = false; }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { closeModals(); }; });

  function openLevels(first) {
    worldSel = first ? -1 : Math.floor(lvIdx / 20); renderLevels(); openModal('startModal');
    $('startClose').hidden = !w;
  }
  var worldSel = -1;
  function unlocked(i) { return i === 0 || !!prog[i - 1]; }
  function renderLevels() {
    var last = 0; for (var i = 0; i < LV.length; i++) if (unlocked(i)) last = i;
    var nW = Math.ceil(LV.length / 20); if (worldSel < 0) worldSel = Math.floor((tabMode === 'online' ? pickLv : last) / 20);
    var totalStars = Object.keys(prog).reduce(function (s2, k) { return s2 + (prog[k].stars || 0); }, 0);
    $('worldTabs').innerHTML = Array.from({ length: nW }, function (_, k) {
      var from = k * 20, to = Math.min(LV.length, from + 20), done = 0;
      for (var j = from; j < to; j++) if (prog[j]) done++;
      return '<button type="button" data-w="' + k + '" aria-selected="' + (k === worldSel) + '"' + (unlocked(from) ? '' : ' class="lock"') + '><b>' + WORLDS[k] + '</b><small>' + (from + 1) + '–' + to + ' · ' + done + '/' + (to - from) + '</small></button>';
    }).join('');
    $('starSum').textContent = '★ ' + totalStars + ' / ' + LV.length * 3;
    $('worldTabs').querySelectorAll('button').forEach(function (b) { b.onclick = function () { worldSel = +b.dataset.w; renderLevels(); }; });
    var html = '', from = worldSel * 20, to = Math.min(LV.length, from + 20);
    for (i = from; i < to; i++) {
      var p = prog[i], open = unlocked(i), l = LV[i];
      html += '<button class="lvb' + (p ? ' done' : '') + (i === last && !p ? ' next' : '') + '"' + (open ? '' : ' disabled') + ' data-i="' + i + '" title="' + esc(l.name) + '"><b>' + (i + 1) + '</b><span>' + esc(l.name) + '</span><small>' +
        (p ? '★★★'.slice(0, p.stars) + '<em>' + '★★★'.slice(p.stars) + '</em>' : open ? 'Oyna' : '🔒') + '</small></button>';
    }
    $('lvGrid').innerHTML = html;
    $('lvGrid').querySelectorAll('.lvb').forEach(function (b) {
      b.onclick = function () {
        var i = +b.dataset.i;
        if (tabMode === 'online') { pickLv = i; $('lvGrid').querySelectorAll('.lvb').forEach(function (x) { x.classList.toggle('sel', x === b); }); return; }
        if (net) leaveNet();
        mode = 'local'; load(i);
      };
    });
    if (tabMode === 'online') { var sb = $('lvGrid').querySelector('[data-i="' + pickLv + '"]'); if (sb) sb.classList.add('sel'); }
  }
  var tabMode = 'local', pickLv = 0;
  document.querySelectorAll('#modeTabs button').forEach(function (b) {
    b.onclick = function () {
      tabMode = b.dataset.m;
      document.querySelectorAll('#modeTabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      $('onlinePane').hidden = tabMode !== 'online'; $('localNote').hidden = tabMode === 'online';
      $('lvHead').textContent = tabMode === 'online' ? 'Hangi bölümden başlansın?' : 'Bölüm seç';
      renderLevels();
    };
  });

  // ---------- online ----------
  function api(a, body) {
    return fetch(API + '?a=' + a, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
      .then(function (r) { return r.json(); });
  }
  var ERR = { bad_name: 'Ad 2–16 harf olmalı', no_table: 'Masa bulunamadı', started: 'Bu masada oyun başlamış', full: 'Masa dolu', name_taken: 'Bu ad masada var', need_guest: 'Arkadaşın gelmeden başlatılamaz', rate_limited: 'Çok fazla deneme, biraz bekle', db_unavailable: 'Sunucu şu an yanıt vermiyor' };
  function errText(j) { return (j && ERR[j.error]) || 'Bağlantı sorunu, tekrar dene'; }
  function myName() { var n = $('nameIn').value.trim(); ls('kd_name', n); return n; }
  $('nameIn').value = ls('kd_name') || '';
  $('createBtn').onclick = function () {
    var n = myName(); if (n.length < 2) { toast('Önce adını yaz'); $('nameIn').focus(); return; }
    api('t_create', { name: n, opts: { lv: pickLv } }).then(function (j) {
      if (!j.ok) return toast(errText(j));
      net = { code: j.code, seat: 0, seatKey: j.seatKey, hostKey: j.hostKey, me: 'k', run: 0, lv: pickLv };
      ls('kd_net', { code: j.code, seat: 0, seatKey: j.seatKey, hostKey: j.hostKey });
      lobby();
    }).catch(function () { toast('Bağlantı sorunu'); });
  };
  $('joinBtn').onclick = function () { join($('joinCode').value.trim().toUpperCase()); };
  function join(code) {
    var n = myName(); if (n.length < 2) { toast('Önce adını yaz'); $('nameIn').focus(); return; }
    if (!/^[A-Z0-9]{6}$/.test(code)) { toast('Masa kodu 6 karakter'); return; }
    api('t_join', { code: code, name: n }).then(function (j) {
      if (!j.ok) return toast(errText(j));
      net = { code: code, seat: j.seat, seatKey: j.seatKey, me: 'd', run: 0, lv: 0 };
      ls('kd_net', { code: code, seat: j.seat, seatKey: j.seatKey });
      lobby();
    }).catch(function () { toast('Bağlantı sorunu'); });
  }
  var lobbyT;
  function lobby() {
    openModal('lobbyModal');
    var link = location.origin + location.pathname + '?masa=' + net.code;
    $('lobbyCode').textContent = net.code; $('lobbyLink').value = link;
    $('lobbyWa').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent('Ateş ve Su oynayalım! Masama gel: ' + link), '_blank', 'noopener'); };
    $('lobbyStart').hidden = net.me !== 'k'; $('lobbyWait').hidden = net.me === 'k';
    clearInterval(lobbyT); lobbyT = setInterval(pollLobby, 1500); pollLobby();
  }
  $('lobbyCopy').onclick = function () { var i = $('lobbyLink'); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).then(function () { toast('Bağlantı kopyalandı'); }, function () { document.execCommand && document.execCommand('copy'); toast('Bağlantı kopyalandı'); }); };
  function pollLobby() {
    if (!net) return clearInterval(lobbyT);
    api('t_lobby&code=' + net.code).then(function (j) {
      if (!j.ok) return;
      var s = j.seats;
      $('lobbySeats').innerHTML = [0, 1].map(function (i) {
        var x = s[i], c = i === 0 ? 'k' : 'd';
        return '<li class="' + (x ? 'on' : '') + (i === net.seat ? ' me' : '') + '"><span class="av ' + c + '"></span><b>' + (x ? esc(x.name) : 'Bekleniyor…') + '</b><small>' + NAMES[c] + (i === net.seat ? ' · sen' : '') + '</small></li>';
      }).join('');
      net.otherName = s[1 - net.seat] && s[1 - net.seat].name;
      $('lobbyStart').disabled = !s[1];
      if (j.status === 'play') { clearInterval(lobbyT); net.lv = net.me === 'k' ? net.lv : ((j.opts && j.opts.lv) || 0); startNet(); }
    });
  }
  $('lobbyStart').onclick = function () {
    api('t_start', { code: net.code, hostKey: net.hostKey }).then(function (j) { if (!j.ok) return toast(errText(j)); clearInterval(lobbyT); startNet(); });
  };
  $('lobbyLeave').onclick = function () { leaveNet(); openLevels(); };
  function leaveNet() { clearInterval(lobbyT); net = null; try { localStorage.removeItem('kd_net'); } catch (e) {} if (window.OkeySohbet && window.OkeySohbet.close) window.OkeySohbet.close(); hud(); }
  function startNet() {
    mode = 'online'; net.run = 0; load(net.lv || 0);
    toast('Sen ' + NAMES[net.me] + ' oluyorsun · ' + (net.me === 'k' ? 'ok tuşları' : 'W A D') + ' ya da hangisi rahatsa', 3500);
  }
  // Anlık eşitleme: ~7 kez/sn kendi durumunu yaz, öbürünkünü al
  var syncBusy = false, lastSync = 0, lastOther = 0;
  function syncTick(ts) {
    if (!net || mode !== 'online' || syncBusy || ts - lastSync < 140) return;
    lastSync = ts; syncBusy = true;
    var p = w.p[net.me];
    var data = {
      lv: lvIdx, run: net.run, won: w.won,
      p: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, vx: Math.round(p.vx), vy: Math.round(p.vy), f: p.face, g: p.ground ? 1 : 0, a: p.atDoor ? 1 : 0, dd: p.dead ? 1 : 0 },
      gems: w.gems.filter(function (g) { return g.got && g.c === net.me; }).map(function (g) { return g.id; }),
      lev: w.levers.map(function (l) { return [l.on ? 1 : 0, l.v || 0]; }),
      box: w.boxes.map(function (b) { return [Math.round(b.x), Math.round(b.y), b.v || 0]; })
    };
    api('t_sync', { code: net.code, seat: net.seat, seatKey: net.seatKey, data: data }).then(function (j) {
      syncBusy = false;
      if (!j || !j.ok) return;
      net.otherName = j.seats && j.seats[1 - net.seat] && j.seats[1 - net.seat].name;
      if (j.other) { net.in = j.other; lastOther = performance.now(); }
      $('netDot').className = 'dot ' + (performance.now() - lastOther < 3000 ? 'ok' : 'bad');
    }).catch(function () { syncBusy = false; $('netDot').className = 'dot bad'; });
  }
  // Bölüm ve deneme numarası: misafir masa sahibinin bölümüne geçer; kim yeniden başlarsa öbürü de başlar
  function follow() {
    var o = net.in; if (!o || typeof o.lv !== 'number' || !LV[o.lv]) return;
    if (net.me === 'd' && o.lv !== lvIdx) { net.run = o.run || 0; net.in = null; load(o.lv); return; }
    if (o.lv === lvIdx && (o.run || 0) > net.run) { net.run = o.run; net.in = null; load(lvIdx); }
  }
  function applyRemote() {
    var o = net.in; if (!o) return;
    if (o.lv !== lvIdx || (o.run || 0) !== net.run) return;
    var other = net.me === 'k' ? 'd' : 'k', g = w.p[other], q = o.p;
    if (!g || !q) return;
    g.ghost = true;
    // yumuşak takip: hedefe doğru hızla yaklaş, çok uzaksa ışınla
    var tx = q.x + (q.vx || 0) * 0.07, ty = q.y;
    if (Math.abs(tx - g.x) > 120 || Math.abs(ty - g.y) > 120) { g.x = tx; g.y = ty; }
    else { g.x += (tx - g.x) * 0.25; g.y += (ty - g.y) * 0.3; }
    g.vx = q.vx || 0; g.vy = q.vy || 0; g.face = q.f || 1; g.ground = !!q.g; g.atDoor = !!q.a;
    if (q.dd && !w.dead) { g.dead = true; w.dead = { c: other, why: 'net' }; deadT = 0.2; SND.dead(); toast((net.otherName || NAMES[other]) + ' yandı, baştan!'); }
    (o.gems || []).forEach(function (id) { var gm = w.gems[id]; if (gm && !gm.got) { gm.got = true; SND.gem(); hud(); } });
    (o.lev || []).forEach(function (x, i) { var l = w.levers[i]; if (l && x[1] > (l.v || 0)) { l.on = !!x[0]; l.v = x[1]; SND.lever(); } });
    (o.box || []).forEach(function (x, i) { var b = w.boxes[i]; if (b && x[2] > (b.v || 0)) { b.x = x[0]; b.y = x[1]; b.v = x[2]; } });
    if (g.atDoor && w.p[net.me].atDoor && !w.won) { w.won = true; win(); }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // sohbet modülü (okey oyunlarıyla ortak)
  window.OkeySohbetHost = {
    ctx: function () {
      if (!net) return null;
      var names = net.seat === 0 ? [myName(), net.otherName || 'Arkadaşın'] : [net.otherName || 'Arkadaşın', myName()];
      return { online: true, code: net.code, seat: net.seat, seatKey: net.seatKey, me: net.seat, name: myName(), names: names, bots: [], api: API };
    },
    say: function () {}, sound: function () { tone(660, 0.08, 'sine', 0.1); }
  };

  // ---------- tam ekran ----------
  function fullscreen() {
    var el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().then(function () { try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }).catch(function () {});
    setTimeout(fit, 300);
  }
  $('fsBtn').onclick = fullscreen;
  $('menuBtn').onclick = openLevels;
  $('newBtn').onclick = function () { restart(true); };

  // ---------- sayfa ----------
  $('yr').textContent = new Date().getFullYear();
  $('themeBtn').onclick = function () {
    var c = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = c === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); try { localStorage.setItem('theme', n); } catch (e) {}
  };
  [['cTabDesk', 'ctlDesk'], ['cTabMob', 'ctlMob']].forEach(function (p, i, all) {
    $(p[0]).onclick = function () { all.forEach(function (q) { $(q[0]).setAttribute('aria-selected', q === p); $(q[1]).hidden = q !== p; }); };
  });
  if (matchMedia('(pointer: coarse)').matches) { document.body.classList.add('touch'); $('cTabMob').click(); }
  document.addEventListener('visibilitychange', function () { keys = {}; });

  if (/[?&]test=1/.test(location.search)) window.__kd = { get w() { return w; }, load: load, get net() { return net; } };
  fit();
  var resume = 0; for (var ri = 0; ri < LV.length; ri++) if (ri === 0 || prog[ri - 1]) resume = ri; // kaldığı bölüm
  load(resume); paused = true;
  var qm = location.search.match(/[?&]masa=([A-Za-z0-9]{6})/);
  openLevels(true);
  if (qm) {
    $('modeTabs').querySelector('[data-m="online"]').click();
    $('joinCode').value = qm[1].toUpperCase();
    toast('Masaya katılmak için adını yazıp Katıl’a bas', 4000);
  }
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
