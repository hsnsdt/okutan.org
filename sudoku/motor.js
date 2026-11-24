/* Sudoku — kural motoru (arayüzden bağımsız)
   Tarayıcıda window.Sudoku, Node'da module.exports.
   Tahta: 81 sayılık dizi (satır satır), 0 = boş. Adaylar 9 bitlik maske (bit d-1 = rakam d).
   Üretim tohumludur: aynı tohum ve zorluk her tarayıcıda aynı bulmacayı verir (günün bulmacası). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sudoku = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPOCH = '2026-11-24'; // 1 numaralı günün bulmacası
  var ALL = 511;

  // ---------- komşuluk ----------
  var ROW = [], COL = [], BOX = [], UNITS = [], PEERS = [];
  (function () {
    var i, u;
    for (i = 0; i < 81; i++) { ROW[i] = Math.floor(i / 9); COL[i] = i % 9; BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3); }
    for (u = 0; u < 9; u++) { UNITS.push([]); UNITS.push([]); UNITS.push([]); }
    for (i = 0; i < 81; i++) { UNITS[ROW[i]].push(i); UNITS[9 + COL[i]].push(i); UNITS[18 + BOX[i]].push(i); }
    for (i = 0; i < 81; i++) {
      var p = [];
      for (var j = 0; j < 81; j++) if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
      PEERS.push(p);
    }
  })();
  var BITS = [], CNT = [];
  for (var m = 0; m < 512; m++) {
    var b = [], c = 0;
    for (var d = 1; d <= 9; d++) if (m & (1 << (d - 1))) { b.push(d); c++; }
    BITS.push(b); CNT.push(c);
  }

  // ---------- tohumlu rastgele ----------
  function fnv1a(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, R) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ---------- temel ----------
  function candMask(g, i) {
    var used = 0, p = PEERS[i];
    for (var k = 0; k < p.length; k++) if (g[p[k]]) used |= 1 << (g[p[k]] - 1);
    return ALL & ~used;
  }
  function candidates(g, i) { return g[i] ? [] : BITS[candMask(g, i)].slice(); }
  // Kurala aykırı hücreler (aynı satır/sütun/kutuda aynı rakam)
  function conflicts(g) {
    var bad = {};
    for (var i = 0; i < 81; i++) {
      if (!g[i]) continue;
      var p = PEERS[i];
      for (var k = 0; k < p.length; k++) if (g[p[k]] === g[i]) { bad[i] = true; break; }
    }
    return Object.keys(bad).map(Number);
  }
  function isSolved(g, sol) {
    for (var i = 0; i < 81; i++) if (!g[i] || (sol && g[i] !== sol[i])) return false;
    return sol ? true : conflicts(g).length === 0;
  }

  // ---------- çözüm sayma (en az adaylı hücreden geri izleme) ----------
  function countSolutions(g0, limit) {
    limit = limit || 2;
    var g = g0.slice(), n = 0, out = null;
    (function go() {
      if (n >= limit) return;
      var best = -1, bm = 0, bc = 10;
      for (var i = 0; i < 81; i++) {
        if (g[i]) continue;
        var mk = candMask(g, i), c = CNT[mk];
        if (c < bc) { bc = c; best = i; bm = mk; if (c <= 1) break; }
      }
      if (best < 0) { n++; if (!out) out = g.slice(); return; }
      if (!bc) return;
      var ds = BITS[bm];
      for (var k = 0; k < ds.length && n < limit; k++) { g[best] = ds[k]; go(); }
      g[best] = 0;
    })();
    return { count: n, solution: out };
  }
  function solve(g) { var r = countSolutions(g, 1); return r.solution; }

  // ---------- tam çözüm üret ----------
  function fill(R) {
    var g = new Array(81).fill(0);
    (function go() {
      var best = -1, bm = 0, bc = 10;
      for (var i = 0; i < 81; i++) {
        if (g[i]) continue;
        var mk = candMask(g, i), c = CNT[mk];
        if (c < bc) { bc = c; best = i; bm = mk; if (c <= 1) break; }
      }
      if (best < 0) return true;
      var ds = shuffle(BITS[bm].slice(), R);
      for (var k = 0; k < ds.length; k++) { g[best] = ds[k]; if (go()) return true; }
      g[best] = 0;
      return false;
    })();
    return g;
  }

  // ---------- insan gibi çözen değerlendirici ----------
  // Teknik düzeyleri: 1 = tek aday / gizli tek, 2 = çift ve kutu-çizgi eleme, 3 = gizli çift ve üçlü,
  // 4 = bu tekniklerle çözülemiyor (uzman: daha ileri teknik ya da deneme gerekir).
  function rate(g0) {
    var g = g0.slice(), cand = new Array(81), maxT = 0, steps = 0, i;
    for (i = 0; i < 81; i++) cand[i] = g[i] ? 0 : candMask(g, i);
    function place(i, d) {
      g[i] = d; cand[i] = 0;
      var bit = 1 << (d - 1), p = PEERS[i];
      for (var k = 0; k < p.length; k++) cand[p[k]] &= ~bit;
    }
    function singles() {
      var any = false, i, u, k;
      for (i = 0; i < 81; i++) if (!g[i] && CNT[cand[i]] === 1) { place(i, BITS[cand[i]][0]); any = true; }
      for (u = 0; u < 27; u++) {
        var cells = UNITS[u];
        for (var d = 1; d <= 9; d++) {
          var bit = 1 << (d - 1), at = -1, n = 0, done = false;
          for (k = 0; k < 9; k++) { var c = cells[k]; if (g[c] === d) { done = true; break; } if (cand[c] & bit) { n++; at = c; } }
          if (!done && n === 1) { place(at, d); any = true; }
        }
      }
      return any;
    }
    function nakedSubsets(size) {
      var any = false;
      for (var u = 0; u < 27; u++) {
        var cells = UNITS[u].filter(function (c) { return !g[c] && CNT[cand[c]] >= 2 && CNT[cand[c]] <= size; });
        combos(cells, size, function (set) {
          var m = 0; set.forEach(function (c) { m |= cand[c]; });
          if (CNT[m] !== size) return;
          UNITS[u].forEach(function (c) { if (!g[c] && set.indexOf(c) < 0 && (cand[c] & m)) { cand[c] &= ~m; any = true; } });
        });
      }
      return any;
    }
    function hiddenSubsets(size) {
      var any = false;
      for (var u = 0; u < 27; u++) {
        var cells = UNITS[u], digs = [];
        for (var d = 1; d <= 9; d++) {
          var bit = 1 << (d - 1), n = 0, placed = false;
          cells.forEach(function (c) { if (g[c] === d) placed = true; else if (!g[c] && (cand[c] & bit)) n++; });
          if (!placed && n >= 2 && n <= size) digs.push(d);
        }
        combos(digs, size, function (ds) {
          var m = 0; ds.forEach(function (d) { m |= 1 << (d - 1); });
          var where = cells.filter(function (c) { return !g[c] && (cand[c] & m); });
          if (where.length !== size) return;
          where.forEach(function (c) { if (cand[c] & ~m) { cand[c] &= m; any = true; } });
        });
      }
      return any;
    }
    // kutu-çizgi: bir kutudaki rakam tek satır/sütundaysa o satırın kalanından silinir (ve tersi)
    function boxLine() {
      var any = false;
      for (var d = 1; d <= 9; d++) {
        var bit = 1 << (d - 1);
        for (var u = 0; u < 27; u++) {
          var where = UNITS[u].filter(function (c) { return !g[c] && (cand[c] & bit); });
          if (where.length < 2) continue;
          var others = [];
          if (u >= 18) { // kutu → satır ya da sütun
            if (where.every(function (c) { return ROW[c] === ROW[where[0]]; })) others = UNITS[ROW[where[0]]];
            else if (where.every(function (c) { return COL[c] === COL[where[0]]; })) others = UNITS[9 + COL[where[0]]];
          } else if (where.every(function (c) { return BOX[c] === BOX[where[0]]; })) others = UNITS[18 + BOX[where[0]]];
          others.forEach(function (c) { if (where.indexOf(c) < 0 && !g[c] && (cand[c] & bit)) { cand[c] &= ~bit; any = true; } });
        }
      }
      return any;
    }
    function filled() { for (var i = 0; i < 81; i++) if (!g[i]) return false; return true; }
    function broken() { for (var i = 0; i < 81; i++) if (!g[i] && !cand[i]) return true; return false; }
    while (!filled()) {
      if (broken()) return { level: 4, steps: steps, solved: false };
      steps++;
      if (singles()) { maxT = Math.max(maxT, 1); continue; }
      if (nakedSubsets(2) || boxLine()) { maxT = Math.max(maxT, 2); continue; }
      if (hiddenSubsets(2) || nakedSubsets(3) || hiddenSubsets(3)) { maxT = Math.max(maxT, 3); continue; }
      return { level: 4, steps: steps, solved: false };
    }
    return { level: Math.max(1, maxT), steps: steps, solved: true };
  }
  function combos(arr, k, fn) {
    var n = arr.length, idx = [];
    if (k > n) return;
    (function go(s, d) {
      if (d === k) { fn(idx.map(function (i) { return arr[i]; })); return; }
      for (var i = s; i <= n - (k - d); i++) { idx[d] = i; go(i + 1, d + 1); }
    })(0, 0);
  }

  // ---------- bulmaca üret ----------
  // minT/maxT: gereken en zor teknik; target: verilen rakam sayısı (en az bu kadar silinmeye çalışılır)
  var LEVELS = {
    kolay: { name: 'Kolay', minT: 1, maxT: 1, target: 38 },
    orta: { name: 'Orta', minT: 1, maxT: 1, target: 30 },
    zor: { name: 'Zor', minT: 2, maxT: 3, target: 26 },
    uzman: { name: 'Uzman', minT: 3, maxT: 4, target: 23 }
  };
  var LEVEL_KEYS = ['kolay', 'orta', 'zor', 'uzman'];
  function generate(seed, level) {
    var L = LEVELS[level] || LEVELS.orta, best = null;
    for (var attempt = 0; attempt < 40; attempt++) {
      var R = rng((seed + Math.imul(attempt, 0x9E3779B1)) >>> 0);
      var sol = fill(R), puz = sol.slice(), givens = 81;
      var order = shuffle(Array.from({ length: 41 }, function (_, i) { return i; }), R);
      for (var k = 0; k < order.length && givens > L.target; k++) {
        var a = order[k], b = 80 - a, va = puz[a], vb = puz[b];
        puz[a] = 0; puz[b] = 0;
        var ok = countSolutions(puz, 2).count === 1;
        if (ok && L.maxT < 4) ok = rate(puz).level <= L.maxT;
        if (ok) givens -= a === b ? 1 : 2;
        else { puz[a] = va; puz[b] = vb; }
      }
      var r = rate(puz);
      var cand = { puzzle: puz, solution: sol, level: level, rating: r.level, givens: givens };
      if (r.level >= L.minT && r.level <= L.maxT) return cand;
      if (!best || Math.abs(r.level - L.minT) < Math.abs(best.rating - L.minT)) best = cand;
    }
    return best;
  }

  // ---------- günün bulmacası ----------
  function dayNumber(dayKey) {
    var a = Date.UTC(+EPOCH.slice(0, 4), +EPOCH.slice(5, 7) - 1, +EPOCH.slice(8, 10));
    var b = Date.UTC(+dayKey.slice(0, 4), +dayKey.slice(5, 7) - 1, +dayKey.slice(8, 10));
    return Math.round((b - a) / 86400000) + 1;
  }
  // Haftanın gününe göre zorluk: Pzt kolay, Sal–Çar orta, Per–Cum zor, Cmt uzman, Paz orta
  function dailyLevel(dayKey) {
    var wd = new Date(Date.UTC(+dayKey.slice(0, 4), +dayKey.slice(5, 7) - 1, +dayKey.slice(8, 10))).getUTCDay();
    return ['orta', 'kolay', 'orta', 'orta', 'zor', 'zor', 'uzman'][wd];
  }
  function daily(dayKey) { return generate(fnv1a('sudoku-' + dayKey), dailyLevel(dayKey)); }

  // ---------- ipucu: bir sonraki mantıklı adım ----------
  function hint(g, sol) {
    var i, wrong = [];
    for (i = 0; i < 81; i++) if (g[i] && sol && g[i] !== sol[i]) wrong.push(i);
    if (wrong.length) return { type: 'wrong', i: wrong[0] };
    var cand = [];
    for (i = 0; i < 81; i++) cand[i] = g[i] ? 0 : candMask(g, i);
    for (i = 0; i < 81; i++) if (!g[i] && CNT[cand[i]] === 1) return { type: 'naked', i: i, v: BITS[cand[i]][0] };
    var names = ['satırda', 'sütunda', 'kutuda'];
    for (var u = 0; u < 27; u++) {
      for (var d = 1; d <= 9; d++) {
        var bit = 1 << (d - 1), at = -1, n = 0, done = false;
        for (var k = 0; k < 9; k++) { var c = UNITS[u][k]; if (g[c] === d) { done = true; break; } if (cand[c] & bit) { n++; at = c; } }
        if (!done && n === 1) return { type: 'hidden', i: at, v: d, unit: names[Math.floor(u / 9)] };
      }
    }
    // mantıklı tek adım yoksa: en az adaylı boş hücrenin doğru rakamı
    var best = -1;
    for (i = 0; i < 81; i++) if (!g[i] && (best < 0 || CNT[cand[i]] < CNT[cand[best]])) best = i;
    if (best < 0) return null;
    return { type: 'reveal', i: best, v: sol ? sol[best] : (solve(g) || [])[best] };
  }

  // ---------- istatistik ----------
  function newStats() { return { played: 0, solved: 0, streak: 0, best: 0, last: 0, times: {} }; }
  function addResult(st, dayNo, sec) {
    st = st || newStats();
    if (st.last === dayNo) return st;
    st.played++; st.solved++;
    st.streak = st.last === dayNo - 1 ? st.streak + 1 : 1;
    st.best = Math.max(st.best, st.streak); st.last = dayNo;
    return st;
  }
  function liveStreak(st, dayNo) { return st && (st.last === dayNo || st.last === dayNo - 1) ? st.streak : 0; }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60, p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' + p(m) : p(m)) + ':' + p(s);
  }

  return {
    EPOCH: EPOCH, LEVELS: LEVELS, LEVEL_KEYS: LEVEL_KEYS, ROW: ROW, COL: COL, BOX: BOX, PEERS: PEERS,
    fnv1a: fnv1a, rng: rng, candidates: candidates, conflicts: conflicts, isSolved: isSolved,
    countSolutions: countSolutions, solve: solve, rate: rate, generate: generate,
    dayNumber: dayNumber, dailyLevel: dailyLevel, daily: daily, hint: hint,
    newStats: newStats, addResult: addResult, liveStreak: liveStreak, fmtTime: fmtTime
  };
});
