/* Kor ile Damla — arayüz: çizim, kontroller, ses, bölüm seçimi, online masa.
   Kurallar motor.js'te (window.KorDamla), bölümler bolumler.js'te (window.KorDamlaBolumler). */
(function () {
  'use strict';
  var M = window.KorDamla, LV = window.KorDamlaBolumler;
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement, T = M.T, W = M.W, H = M.H;
  var API = 'api/';
  var NAMES = { k: 'Kor', d: 'Damla' };
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
  var w, lvIdx = 0, mode = 'local', active = 'k', running = false, paused = false, deadT = 0, wonShown = false;
  var keys = {}, touch = { l: false, r: false, u: false }, parts = [], bg = null, shake = 0;
  var net = null; // online: {code, seat, seatKey, hostKey, me:'k'|'d', run, lv, sendT, other, timer}

  function load(i, keepNet) {
    lvIdx = i; w = M.create(LV[i]); wonShown = false; deadT = 0; parts = []; running = true; paused = false;
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
  function swap() { if (net) return; active = active === 'k' ? 'd' : 'k'; hud(); toast((active === 'k' ? 'Kor' : 'Damla') + ' seçildi'); }

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
    if (e.why === 'W') return 'Kor suya düştü, söndü!';
    if (e.why === 'L') return 'Damla lavda buharlaştı!';
    return n + ' düştü!';
  }

  // ---------- parçacıklar ----------
  function burst(x, y, col, n) {
    for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220; parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.6 + Math.random() * 0.5, t: 0, col: col, r: 2 + Math.random() * 3 }); }
  }
  function puff(p) { for (var i = 0; i < 6; i++) parts.push({ x: p.x + p.w / 2 + (Math.random() - 0.5) * 20, y: p.y + p.h, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 40, life: 0.35, t: 0, col: 'rgba(220,210,240,.6)', r: 2 + Math.random() * 2 }); }

  // ---------- çizim ----------
  function buildBg(w) {
    var c = document.createElement('canvas'); c.width = W * DPR; c.height = H * DPR;
    var g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#221d33'); gr.addColorStop(1, '#141220');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // arka plan taş deseni
    g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1;
    for (var y = 0; y < H; y += 24) { var off = (y / 24) % 2 ? 24 : 0; for (var x = -off; x < W; x += 48) { g.strokeRect(x + 0.5, y + 0.5, 48, 24); } }
    var vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // duvarlar
    for (var ty = 0; ty < M.ROWS; ty++) for (var tx = 0; tx < M.COLS; tx++) {
      if (w.map[ty][tx] !== '#') continue;
      var X = tx * T, Y = ty * T;
      g.fillStyle = (tx + ty) % 2 ? '#4a4360' : '#463f5b'; g.fillRect(X, Y, T, T);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(X, Y + T - 3, T, 3); g.fillRect(X + T - 2, Y, 2, T);
      var up = M.tileAt(w, tx, ty - 1);
      if (up !== '#' && !/[LWA]/.test(up)) { g.fillStyle = '#6d6390'; g.fillRect(X, Y, T, 5); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(X, Y, T, 1.5); }
      g.fillStyle = 'rgba(255,255,255,.05)'; if ((tx * 7 + ty * 3) % 5 === 0) g.fillRect(X + 6, Y + 12, 6, 4);
    }
    // süs: sarkıtlar, kristaller (bölüme göre sabit rastgele)
    var seed = 7 + lvIdx * 131; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (ty = 1; ty < M.ROWS - 1; ty++) for (tx = 1; tx < M.COLS - 1; tx++) {
      var here = w.map[ty][tx], above = M.tileAt(w, tx, ty - 1), below = M.tileAt(w, tx, ty + 1);
      if (here !== '.') continue;
      if (above === '#' && rnd() < 0.28) { // sarkıt
        var len = 6 + rnd() * 16, sx = tx * T + 6 + rnd() * 20;
        g.fillStyle = '#3b3550'; g.beginPath(); g.moveTo(sx - 5, ty * T); g.lineTo(sx + 5, ty * T); g.lineTo(sx, ty * T + len); g.fill();
      }
      if (below === '#' && rnd() < 0.07) { // kristal kümesi
        var kx = tx * T + 8 + rnd() * 16, ky = (ty + 1) * T, hue = rnd() < 0.5 ? ['#7f6bff', 'rgba(127,107,255,.25)'] : ['#3fd0c9', 'rgba(63,208,201,.22)'];
        g.fillStyle = hue[1]; g.beginPath(); g.arc(kx, ky - 6, 16, 0, 7); g.fill();
        g.fillStyle = hue[0];
        [[-5, 10], [0, 16], [5, 9]].forEach(function (k) { g.beginPath(); g.moveTo(kx + k[0] - 3, ky); g.lineTo(kx + k[0], ky - k[1]); g.lineTo(kx + k[0] + 3, ky); g.fill(); });
      }
    }
    // meşale yerleri (çizimde titrer)
    w.torches = [];
    for (ty = 3; ty < M.ROWS - 3; ty += 5) for (tx = 3; tx < M.COLS - 3; tx += 9) {
      if (w.map[ty][tx] === '.' && w.map[ty + 1][tx] === '.' && rnd() < 0.55) w.torches.push({ x: tx * T + 16, y: ty * T + 18 });
    }
    w.torches.forEach(function (o) { g.fillStyle = '#5a4b3a'; g.fillRect(o.x - 3, o.y, 6, 14); g.fillStyle = '#3b3027'; g.fillRect(o.x - 6, o.y - 2, 12, 4); });
    // kapılar
    ['k', 'd'].forEach(function (c) {
      var d = w.doors[c]; if (!d) return;
      g.fillStyle = '#2a2438'; g.beginPath(); g.moveTo(d.x - 3, d.y + d.h); g.lineTo(d.x - 3, d.y + 14); g.quadraticCurveTo(d.x + d.w / 2, d.y - 10, d.x + d.w + 3, d.y + 14); g.lineTo(d.x + d.w + 3, d.y + d.h); g.fill();
      g.strokeStyle = c === 'k' ? '#ff8a3d' : '#4aa8ff'; g.lineWidth = 3; g.stroke();
      g.fillStyle = c === 'k' ? '#ff8a3d' : '#4aa8ff'; icon(g, c, d.x + d.w / 2, d.y + 26, 9);
    });
    return c;
  }
  function icon(g, c, x, y, r) {
    g.beginPath();
    if (c === 'k') { g.moveTo(x, y - r * 1.2); g.quadraticCurveTo(x + r, y - r * 0.1, x + r * 0.6, y + r * 0.6); g.quadraticCurveTo(x, y + r * 1.1, x - r * 0.6, y + r * 0.6); g.quadraticCurveTo(x - r, y - r * 0.1, x, y - r * 1.2); }
    else { g.moveTo(x, y - r * 1.2); g.quadraticCurveTo(x + r, y + r * 0.1, x + r * 0.7, y + r * 0.5); g.arc(x, y + r * 0.35, r * 0.72, 0.15, Math.PI - 0.15); g.quadraticCurveTo(x - r, y + r * 0.1, x, y - r * 1.2); }
    g.fill();
  }
  var LIQ = { L: ['#ffb02e', '#ff5a1f', '#b8280f'], W: ['#7fd0ff', '#2f8cff', '#1a4fbf'], A: ['#d39bff', '#9b4dff', '#5b1fb0'] };
  function draw(t) {
    cx.save();
    if (shake > 0) { shake -= 1 / 60; cx.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake); }
    cx.drawImage(bg, 0, 0, W, H);
    (w.torches || []).forEach(function (o, i) {
      var fl = 1 + Math.sin(t * 13 + i * 2) * 0.12 + Math.sin(t * 7.3 + i) * 0.08;
      var gl = cx.createRadialGradient(o.x, o.y - 6, 2, o.x, o.y - 6, 70 * fl); gl.addColorStop(0, 'rgba(255,170,70,.22)'); gl.addColorStop(1, 'rgba(255,140,40,0)');
      cx.fillStyle = gl; cx.beginPath(); cx.arc(o.x, o.y - 6, 70 * fl, 0, 7); cx.fill();
      cx.fillStyle = '#ff8a3d'; cx.beginPath(); cx.ellipse(o.x, o.y - 7, 4.5 * fl, 8 * fl, 0, 0, 7); cx.fill();
      cx.fillStyle = '#ffe08a'; cx.beginPath(); cx.ellipse(o.x, o.y - 5, 2.2, 4 * fl, 0, 0, 7); cx.fill();
    });
    // sıvılar: yan yana havuzlar tek yüzey olarak çizilir
    for (var ty = 0; ty < M.ROWS; ty++) {
      for (var tx = 0; tx < M.COLS; tx++) {
        var c = w.map[ty][tx]; if (!LIQ[c] || w.map[ty][tx - 1] === c) continue;
        var tx2 = tx; while (w.map[ty][tx2 + 1] === c) tx2++;
        var X = tx * T, X2 = (tx2 + 1) * T, Y = ty * T, col = LIQ[c], top = Y + M.LIQ - 3;
        var wave = function (xx) { return top + Math.sin(t * 2.6 + xx * 0.09) * 1.8 + Math.sin(t * 4.1 + xx * 0.21) * 0.9; };
        // üstte parıltı
        cx.globalCompositeOperation = 'lighter';
        var hg = cx.createLinearGradient(0, top - 26, 0, top + 2);
        hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(1, c === 'L' ? 'rgba(255,120,30,.32)' : c === 'A' ? 'rgba(170,90,255,.28)' : 'rgba(60,150,255,.22)');
        cx.fillStyle = hg; cx.fillRect(X, top - 26, X2 - X, 28);
        cx.globalCompositeOperation = 'source-over';
        // gövde
        var gr = cx.createLinearGradient(0, top, 0, Y + T); gr.addColorStop(0, col[1]); gr.addColorStop(1, col[2]);
        cx.fillStyle = gr; cx.beginPath(); cx.moveTo(X, Y + T);
        for (var xx = X; xx <= X2; xx += 2) cx.lineTo(xx, wave(xx));
        cx.lineTo(X2, Y + T); cx.closePath(); cx.fill();
        // yüzey çizgisi
        cx.strokeStyle = col[0]; cx.lineWidth = 2.2; cx.lineCap = 'round'; cx.beginPath();
        for (xx = X + 1; xx <= X2 - 1; xx += 2) { var yy = wave(xx); xx === X + 1 ? cx.moveTo(xx, yy) : cx.lineTo(xx, yy); }
        cx.stroke();
        // ışık yansımaları / kabarcıklar
        var n = tx2 - tx + 1;
        for (var i = 0; i < n * 2; i++) {
          var ph = (t * (c === 'W' ? 0.35 : 0.7) + i * 0.37 + tx * 0.13) % 1, bx = X + ((i * 23 + tx * 7) % (X2 - X - 6)) + 3;
          if (c === 'W') { cx.fillStyle = 'rgba(255,255,255,' + (0.35 * Math.sin(ph * Math.PI)) + ')'; cx.fillRect(bx, top + 6 + (i % 3) * 4, 6, 1.5); }
          else { cx.fillStyle = col[0]; cx.globalAlpha = 0.85 * (1 - ph); cx.beginPath(); cx.arc(bx, top + 8 - ph * 16, 1.4 + ph * 2.2, 0, 7); cx.fill(); cx.globalAlpha = 1; }
        }
        tx = tx2;
      }
    }
    // düğmeler
    w.plates.forEach(function (pl) {
      var X = pl.x * T, Y = pl.y * T + T;
      cx.fillStyle = '#2d2838'; cx.fillRect(X + 2, Y - 5, T - 4, 5);
      cx.fillStyle = GCOL[pl.g] || '#fff'; cx.fillRect(X + 6, Y - (pl.on ? 6 : 10), T - 12, pl.on ? 2 : 5);
    });
    // kollar
    w.levers.forEach(function (l) {
      var X = l.x * T + T / 2, Y = l.y * T + T;
      cx.fillStyle = '#2d2838'; cx.beginPath(); cx.arc(X, Y, 10, Math.PI, 0); cx.fill();
      var a = l.on ? 0.55 : -0.55; cx.strokeStyle = '#c9c2d8'; cx.lineWidth = 4; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(X, Y - 4); cx.lineTo(X + Math.sin(a) * 22, Y - 4 - Math.cos(a) * 22); cx.stroke();
      cx.fillStyle = GCOL[l.g] || '#fff'; cx.beginPath(); cx.arc(X + Math.sin(a) * 22, Y - 4 - Math.cos(a) * 22, 5, 0, 7); cx.fill();
    });
    // hareketli platformlar
    w.movers.forEach(function (m) {
      cx.fillStyle = '#5b566b'; cx.fillRect(m.x, m.y, m.w, m.h);
      cx.fillStyle = 'rgba(255,255,255,.12)'; cx.fillRect(m.x, m.y, m.w, 3);
      cx.fillStyle = GCOL[m.g] || '#fff';
      if (m.h > m.w) { for (var yy = m.y + 8; yy < m.y + m.h - 4; yy += 16) cx.fillRect(m.x + 6, yy, m.w - 12, 5); }
      else { cx.fillRect(m.x + 4, m.y + m.h - 6, m.w - 8, 3); }
    });
    // kutular
    w.boxes.forEach(function (b) {
      cx.fillStyle = '#9a6a3a'; cx.fillRect(b.x, b.y, b.w, b.h);
      cx.strokeStyle = '#6b4523'; cx.lineWidth = 3; cx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      cx.beginPath(); cx.moveTo(b.x + 3, b.y + 3); cx.lineTo(b.x + b.w - 3, b.y + b.h - 3); cx.moveTo(b.x + b.w - 3, b.y + 3); cx.lineTo(b.x + 3, b.y + b.h - 3); cx.stroke();
    });
    // taşlar
    w.gems.forEach(function (g) {
      if (g.got) return;
      var x = g.x + 8, y = g.y + 8 + Math.sin(t * 3 + g.id) * 3;
      cx.save(); cx.translate(x, y);
      cx.fillStyle = g.c === 'k' ? 'rgba(255,140,40,.25)' : 'rgba(80,170,255,.25)'; cx.beginPath(); cx.arc(0, 0, 13, 0, 7); cx.fill();
      if (g.c === 'k') { cx.rotate(t); cx.fillStyle = '#ff8a3d'; cx.beginPath(); for (var i = 0; i < 6; i++) { var a = i * Math.PI / 3; cx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); } cx.fill(); cx.fillStyle = '#ffd27a'; cx.fillRect(-3, -3, 6, 6); }
      else { var gr = cx.createRadialGradient(-3, -3, 1, 0, 0, 8); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#8fd3ff'); gr.addColorStop(1, '#2f8cff'); cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, 7.5, 0, 7); cx.fill(); }
      cx.restore();
    });
    // kapı parıltısı
    ['k', 'd'].forEach(function (c) { var p = w.p[c], d = w.doors[c]; if (p && d && p.atDoor) { cx.fillStyle = c === 'k' ? 'rgba(255,140,40,.22)' : 'rgba(80,170,255,.22)'; cx.fillRect(d.x - 3, d.y + 6, d.w + 6, d.h - 6); } });
    // karakterler
    ['d', 'k'].forEach(function (c) { var p = w.p[c]; if (p && !p.dead) hero(p, t); });
    // parçacıklar
    parts = parts.filter(function (q) { q.t += 1 / 60; return q.t < q.life; });
    parts.forEach(function (q) { q.vy += 500 / 60; q.x += q.vx / 60; q.y += q.vy / 60; cx.globalAlpha = 1 - q.t / q.life; cx.fillStyle = q.col; cx.beginPath(); cx.arc(q.x, q.y, q.r, 0, 7); cx.fill(); });
    cx.globalAlpha = 1;
    if (paused && running) { cx.fillStyle = 'rgba(10,8,20,.55)'; cx.fillRect(0, 0, W, H); }
    cx.restore();
  }
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
      cx.font = '800 11px "Inter Tight",system-ui'; cx.textAlign = 'center';
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
    $('lvChip').innerHTML = '<b>' + (lvIdx + 1) + '</b> · ' + LV[lvIdx].name;
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
    if (wonShown) return; wonShown = true; running = false; SND.win();
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
    setTimeout(function () { openModal('endModal'); }, 700);
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

  function openLevels() {
    renderLevels(); openModal('startModal');
    $('startClose').hidden = !w;
  }
  function renderLevels() {
    var html = '';
    LV.forEach(function (l, i) {
      var p = prog[i], open = i === 0 || prog[i - 1];
      html += '<button class="lvb' + (p ? ' done' : '') + '"' + (open ? '' : ' disabled') + ' data-i="' + i + '"><b>' + (i + 1) + '</b><span>' + l.name + '</span><small>' +
        (p ? '★★★'.slice(0, p.stars) + '<em>' + '★★★'.slice(p.stars) + '</em> · ' + fmt(p.time) : open ? 'Oyna' : '🔒 Kilitli') + '</small></button>';
    });
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
    $('lobbyWa').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent('Kor ile Damla oynayalım! Masama gel: ' + link), '_blank', 'noopener'); };
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
  load(0); paused = true;
  var qm = location.search.match(/[?&]masa=([A-Za-z0-9]{6})/);
  openLevels();
  if (qm) {
    $('modeTabs').querySelector('[data-m="online"]').click();
    $('joinCode').value = qm[1].toUpperCase();
    toast('Masaya katılmak için adını yazıp Katıl’a bas', 4000);
  }
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
