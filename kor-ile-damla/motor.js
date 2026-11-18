/* Kor ile Damla — fizik ve kural motoru (arayüzden bağımsız)
   Tarayıcıda window.KorDamla, Node'da module.exports.
   Dünya 34×21 karelik (32 px) sabit bir sahnedir: 1088×672.

   Harita karakterleri:
     #  duvar / zemin        .  boş
     L  lav (Damla ölür)    W  su (Kor ölür)     A  asit (ikisi de ölür)
     k  Kor başlangıcı       d  Damla başlangıcı
     K  Kor kapısı           D  Damla kapısı     (kapı bu karenin üstüyle iki kare yüksekliğindedir)
     r  Kor'un kor taşı      b  Damla'nın incisi
   Düzenekler bölüm nesnesinde ayrıca tanımlanır:
     plates: [{x, y, g}]           basınç düğmesi (üstünde oyuncu ya da kutu varken grup g açık)
     levers: [{x, y, g, on}]       kol (üstünden sağa yürüyen açar, sola yürüyen kapatır; aynı gruptaki kollar
                                   iki yönlü anahtar gibi çalışır: açık kol sayısı tekse grup açıktır)
     movers: [{x, y, w, h, dx, dy, g, sp}]  hareketli platform / kapı: grup açıkken (dx, dy) kadar kayar
     boxes:  [{x, y}]               itilebilir kutu */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KorDamla = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var T = 32, COLS = 34, ROWS = 21, W = COLS * T, H = ROWS * T;
  var GRAV = 1900, JUMP = 600, SPEED = 215, ACC_G = 2600, ACC_A = 1600, MAXFALL = 820;
  var PW = 22, PH = 30, LIQ = 12, BOX = 30;
  var COYOTE = 0.09, BUFFER = 0.12, DT = 1 / 60;
  var KILL = { k: { W: 1, A: 1 }, d: { L: 1, A: 1 } };
  var LIQUIDS = { L: 1, W: 1, A: 1 };

  function tileAt(w, tx, ty) {
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return '#';
    return w.map[ty][tx];
  }
  function isSolidTile(c) { return c === '#' || c === 'L' || c === 'W' || c === 'A'; }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  // ---------- bölümden dünya ----------
  function create(level) {
    var w = {
      level: level, map: level.map.map(function (r) { return r.split(''); }),
      t: 0, won: false, dead: null, p: {}, gems: [], doors: {},
      plates: (level.plates || []).map(function (p) { return { x: p.x, y: p.y, g: p.g, on: false }; }),
      levers: (level.levers || []).map(function (l) { return { x: l.x, y: l.y, g: l.g, on: !!l.on }; }),
      movers: (level.movers || []).map(function (m) {
        return { x0: m.x * T, y0: m.y * T, w: m.w * T, h: m.h * T, dx: m.dx * T, dy: m.dy * T, g: m.g, sp: m.sp || 70, s: 0, x: m.x * T, y: m.y * T, vx: 0, vy: 0 };
      }),
      boxes: (level.boxes || []).map(function (b, i) { return { id: i, x: b.x * T + (T - BOX) / 2, y: b.y * T + (T - BOX), w: BOX, h: BOX, vy: 0, t: 0 }; }),
      groups: {}
    };
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      var c = w.map[y][x];
      if (c === 'k' || c === 'd') { w.p[c] = newPlayer(c, x, y); w.map[y][x] = '.'; }
      else if (c === 'K' || c === 'D') { w.doors[c.toLowerCase()] = { x: x * T + 2, y: (y - 1) * T, w: T - 4, h: 2 * T }; w.map[y][x] = '.'; }
      else if (c === 'r' || c === 'b') { w.gems.push({ id: w.gems.length, c: c === 'r' ? 'k' : 'd', x: x * T + 8, y: y * T + 8, w: 16, h: 16, got: false }); w.map[y][x] = '.'; }
    }
    updateGroups(w);
    return w;
  }
  function newPlayer(c, tx, ty) {
    return { c: c, x: tx * T + (T - PW) / 2, y: ty * T + (T - PH), w: PW, h: PH, vx: 0, vy: 0, ground: false,
      coyote: 0, buf: 0, face: 1, atDoor: false, dead: false, on: null };
  }

  // ---------- katı dikdörtgenler ----------
  function solids(w, r, skip) {
    var out = [], x0 = Math.floor(r.x / T) - 1, x1 = Math.floor((r.x + r.w) / T) + 1, y0 = Math.floor(r.y / T) - 1, y1 = Math.floor((r.y + r.h) / T) + 1;
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      var c = tileAt(w, tx, ty);
      if (c === '#') out.push({ x: tx * T, y: ty * T, w: T, h: T, k: 'tile' });
      else if (LIQUIDS[c]) out.push({ x: tx * T, y: ty * T + LIQ, w: T, h: T - LIQ, k: 'liq' });
    }
    w.movers.forEach(function (m) { out.push({ x: m.x, y: m.y, w: m.w, h: m.h, k: 'mover', ref: m }); });
    w.boxes.forEach(function (b) { if (b !== skip) out.push({ x: b.x, y: b.y, w: b.w, h: b.h, k: 'box', ref: b }); });
    return out;
  }
  function hits(w, r, skip) { return solids(w, r, skip).filter(function (s) { return overlap(r, s); }); }

  // Kutuyu yatay it; gidebildiği mesafeyi döndürür
  function pushBox(w, b, dx) {
    var step = dx > 0 ? 1 : -1, moved = 0, n = Math.abs(dx);
    for (var i = 0; i < n; i += 1) {
      var d = Math.min(1, n - i) * step, r = { x: b.x + d, y: b.y, w: b.w, h: b.h };
      if (hits(w, r, b).length) break;
      b.x += d; moved += d;
    }
    if (moved) { b.t = w.t; b.v = (b.v || 0) + 1; b.mine = true; } // online eşitleme için sürüm
    return moved;
  }

  // Bir gövdeyi eksen eksen taşı (oyuncu ya da kutu)
  function moveBody(w, o, dx, dy, isPlayer) {
    var r, hs, i;
    if (dx) {
      o.x += dx; r = { x: o.x, y: o.y, w: o.w, h: o.h };
      hs = hits(w, r, isPlayer ? null : o);
      for (i = 0; i < hs.length; i++) {
        var s = hs[i];
        if (isPlayer && s.k === 'box' && o.wasGround) {
          var need = dx > 0 ? (o.x + o.w) - s.x : (o.x) - (s.x + s.w);
          var got = pushBox(w, s.ref, need * 1);
          if (Math.abs(got - need) < 0.01) continue;
          s = { x: s.ref.x, y: s.ref.y, w: s.ref.w, h: s.ref.h };
        }
        if (!overlap({ x: o.x, y: o.y, w: o.w, h: o.h }, s)) continue;
        if (dx > 0) o.x = s.x - o.w; else o.x = s.x + s.w;
        if (isPlayer) o.vx = 0;
      }
    }
    if (dy) {
      o.y += dy; r = { x: o.x, y: o.y, w: o.w, h: o.h };
      hs = hits(w, r, isPlayer ? null : o);
      for (i = 0; i < hs.length; i++) {
        var t = hs[i];
        if (!overlap({ x: o.x, y: o.y, w: o.w, h: o.h }, t)) continue;
        if (dy > 0) { o.y = t.y - o.h; o.ground = true; o.on = t.k === 'mover' || t.k === 'box' ? t.ref : null; }
        else o.y = t.y + t.h;
        o.vy = 0;
      }
    }
  }

  // ---------- düzenekler ----------
  function bodies(w) {
    var a = [];
    ['k', 'd'].forEach(function (c) { var p = w.p[c]; if (p && !p.dead) a.push(p); }); // hayalet (online karşı oyuncu) de düğmeye basar
    return a.concat(w.boxes);
  }
  function updateGroups(w) {
    if (w.force) { w.groups = w.force; return; } // test ve çözücü için: grupları dışarıdan sabitle
    var g = {}, bs = bodies(w);
    w.plates.forEach(function (pl) {
      var r = { x: pl.x * T + 3, y: pl.y * T + T - 8, w: T - 6, h: 8 };
      pl.on = bs.some(function (b) { return overlap(r, b); });
      if (pl.on) g[pl.g] = true;
    });
    var lev = {};
    w.levers.forEach(function (l) { if (l.on) lev[l.g] = !lev[l.g]; });
    for (var k in lev) if (lev[k]) g[k] = true;
    w.groups = g;
  }
  function stepMovers(w, dt) {
    w.movers.forEach(function (m) {
      var target = w.groups[m.g] ? 1 : 0, len = Math.max(1, Math.hypot(m.dx, m.dy));
      var ds = (m.sp * dt) / len, s = m.s;
      if (s < target) s = Math.min(target, s + ds); else if (s > target) s = Math.max(target, s - ds);
      var nx = m.x0 + m.dx * s, ny = m.y0 + m.dy * s, mx = nx - m.x, my = ny - m.y;
      if (!mx && !my) { m.vx = m.vy = 0; return; }
      // Aşağı inerken altında gövde varsa dur (ezmesin)
      if (my > 0 || mx) {
        var probe = { x: nx, y: ny, w: m.w, h: m.h };
        var blocked = bodies(w).some(function (b) {
          if (b.on === m) return false;
          var above = b.y + b.h <= m.y + 0.5;
          return !above && overlap(probe, b);
        });
        if (blocked) { m.vx = m.vy = 0; return; }
      }
      // Üstünde duranları taşı
      var riders = bodies(w).filter(function (b) { return b.on === m && !b.ghost; });
      m.x = nx; m.y = ny; m.s = s; m.vx = mx / dt; m.vy = my / dt;
      riders.forEach(function (b) {
        if (mx) moveBody(w, b, mx, 0, !!b.c);
        if (my < 0) { b.y = m.y - b.h; } else if (my > 0) moveBody(w, b, 0, my, !!b.c);
      });
    });
  }
  function stepBoxes(w, dt) {
    w.boxes.forEach(function (b) {
      b.vy = Math.min(MAXFALL, b.vy + GRAV * dt);
      b.ground = false; b.on = null;
      moveBody(w, b, 0, b.vy * dt, false);
      if (b.y > H) b.y = H; // haritadan düşmez
    });
  }

  // ---------- oyuncu ----------
  function stepPlayer(w, p, inp, dt) {
    if (p.dead) return;
    inp = inp || {};
    var dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0), acc = p.ground ? ACC_G : ACC_A;
    if (dir) { p.vx += dir * acc * dt; p.face = dir; if (Math.abs(p.vx) > SPEED) p.vx = SPEED * Math.sign(p.vx); }
    else { var f = acc * dt; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; }
    if (inp.u && !p.upHeld) p.buf = BUFFER;
    p.upHeld = !!inp.u;
    p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - dt);
    p.buf = Math.max(0, p.buf - dt);
    if (p.buf > 0 && p.coyote > 0) { p.vy = -JUMP; p.buf = 0; p.coyote = 0; p.ground = false; p.on = null; p.jumped = true; }
    if (!inp.u && p.vy < -JUMP * 0.45) p.vy = -JUMP * 0.45; // kısa basınca alçak zıplar
    p.vy = Math.min(MAXFALL, p.vy + GRAV * dt);
    var was = p.ground; p.wasGround = was; p.ground = false; var onWas = p.on; p.on = null;
    moveBody(w, p, p.vx * dt, 0, true);
    moveBody(w, p, 0, p.vy * dt, true);
    if (!p.ground && was && onWas && p.vy >= 0) { /* kenardan düştü */ }
    p.landed = p.ground && !was;
    if (p.y > H + 40) kill(w, p, 'fall');
    // sıvı teması
    var feet = { x: p.x + 3, y: p.y + p.h, w: p.w - 6, h: 2 };
    var tx0 = Math.floor(feet.x / T), tx1 = Math.floor((feet.x + feet.w) / T), ty = Math.floor((p.y + p.h + 1) / T);
    for (var tx = tx0; tx <= tx1; tx++) {
      var c = tileAt(w, tx, ty);
      if (LIQUIDS[c] && p.y + p.h >= ty * T + LIQ - 1) {
        var ov = Math.min(feet.x + feet.w, (tx + 1) * T) - Math.max(feet.x, tx * T);
        if (ov >= 3) { p.touch = c; if (KILL[p.c][c]) { kill(w, p, c); return; } }
      }
    }
    // taşlar
    w.gems.forEach(function (g) { if (!g.got && g.c === p.c && overlap(p, g)) { g.got = true; g.t = w.t; w.events.push({ e: 'gem', id: g.id, c: p.c }); } });
    // kollar
    w.levers.forEach(function (l) {
      var r = { x: l.x * T + 6, y: l.y * T + 8, w: T - 12, h: T - 8 };
      if (overlap(p, r)) {
        if (p.vx > 60 && !l.on) { l.on = true; l.t = w.t; l.v = (l.v || 0) + 1; w.events.push({ e: 'lever', i: w.levers.indexOf(l), on: true }); }
        else if (p.vx < -60 && l.on) { l.on = false; l.t = w.t; l.v = (l.v || 0) + 1; w.events.push({ e: 'lever', i: w.levers.indexOf(l), on: false }); }
      }
    });
    var d = w.doors[p.c];
    p.atDoor = !!d && p.ground && p.x + p.w / 2 > d.x && p.x + p.w / 2 < d.x + d.w && Math.abs(p.y + p.h - (d.y + d.h)) < 4;
  }
  function kill(w, p, why) { p.dead = true; w.dead = { c: p.c, why: why }; w.events.push({ e: 'dead', c: p.c, why: why }); }

  // ---------- bir adım ----------
  // inputs: { k: {l, r, u}, d: {l, r, u} }. Online oyunda karşı karakter w.p[c].ghost = true ile işaretlenir:
  // fizik işlemez, konumu dışarıdan verilir; ama düğmelere basar.
  function step(w, inputs, dt) {
    dt = dt || DT; w.events = [];
    if (w.won || w.dead) return w.events;
    w.t += dt;
    updateGroups(w);
    stepMovers(w, dt);
    stepBoxes(w, dt);
    ['k', 'd'].forEach(function (c) { var p = w.p[c]; if (p && !p.ghost) stepPlayer(w, p, inputs && inputs[c], dt); });
    updateGroups(w);
    var pk = w.p.k, pd = w.p.d;
    if (pk && pd && !w.dead && pk.atDoor && pd.atDoor) { w.won = true; w.events.push({ e: 'win' }); }
    return w.events;
  }

  // Toplanan taşlar ve süre üzerinden puan: 3 yıldız
  function stars(w) {
    var tot = w.gems.length, got = w.gems.filter(function (g) { return g.got; }).length;
    var par = w.level.par || 60, s = 1;
    if (got === tot) s++;
    if (w.t <= par) s++;
    return s;
  }

  return {
    T: T, COLS: COLS, ROWS: ROWS, W: W, H: H, PW: PW, PH: PH, LIQ: LIQ, DT: DT, JUMP: JUMP, GRAV: GRAV, SPEED: SPEED,
    create: create, step: step, stars: stars, overlap: overlap, tileAt: tileAt, isSolidTile: isSolidTile, updateGroups: updateGroups
  };
});
