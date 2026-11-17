/* 101 Okey — kural motoru (arayüzden bağımsız; tarayıcıda window.OkeyMotor, Node'da module.exports)
 *
 * Varsayılan kurallar (yaygın kahvehane 101):
 *  - 106 taş: 4 renk × 1–13 × 2 + 2 sahte okey. Gösterge açılır; okey = göstergenin aynı renkte bir fazlası (13 → 1).
 *    Gerçek okey taşları joker gibi her taşın yerine geçer; sahte okey, okeyin kendi rengi/sayısı olarak oynar.
 *  - Dağıtan 22, diğerleri 21 taş alır. Dağıtan taş çekmeden atarak başlar. Sıra sağa döner.
 *  - Açmak için perlerin toplamı en az 101 (seri: aynı renk ardışık ≥3; per: aynı sayı farklı renk 3–4) ya da en az 5 çift.
 *  - Açan oyuncu sonraki turlarda yeni per açabilir, masadaki perlere taş işleyebilir, masadaki okeyi gerçek taşıyla alabilir.
 *  - Yandan alınan taş o turda kullanılmalıdır.
 *  - Ceza: okey atmak, masadaki bir pere işlenebilecek taşı atmak.
 *  - Bitiren: −101. Okeyle, çiftle ve elden bitirme puanları ikiye katlar.
 *  - Diğerleri: açmadıysa 202; seri açtıysa kalan toplamı; çift açtıysa iki katı. Elde kalan okey 101 sayılır.
 *
 * Seçenekler (newHand(seed, dealer, opts)):
 *  wrap       12-13-1 serisine izin (1 burada 1 puan sayılır)          — varsayılan kapalı
 *  okeySwap   masadaki okeyi gerçek taşıyla değiştirip alma             — varsayılan açık
 *  katlamali  her seri açılışı bir öncekinden büyük olmalı              — varsayılan kapalı
 *  ciftIsler  çift açan oyuncu masaya taş işleyebilir                   — varsayılan kapalı
 *  ceza       ceza miktarı (101 ya da 202)                              — varsayılan 101
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OkeyMotor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLORS = ['k', 's', 'm', 'y']; // kırmızı, sarı, mavi, siyah
  var OPEN_MIN = 101, PAIRS_MIN = 5, PENALTY = 101;
  var DEFAULTS = { wrap: false, okeySwap: true, katlamali: false, ciftIsler: false, ceza: 101 };
  function opts(o) { var r = {}; for (var k in DEFAULTS) r[k] = o && o[k] != null ? o[k] : DEFAULTS[k]; return r; }

  // ---------- rastgelelik ----------
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var x = arr[i]; arr[i] = arr[j]; arr[j] = x; }
    return arr;
  }

  // ---------- taşlar ----------
  function makeTiles() {
    var t = [], id = 0;
    for (var d = 0; d < 2; d++) for (var ci = 0; ci < 4; ci++) for (var n = 1; n <= 13; n++) t.push({ id: id++, c: COLORS[ci], n: n });
    t.push({ id: id++, fake: true }); t.push({ id: id++, fake: true });
    return t;
  }
  function okeyOf(ind) { return { c: ind.c, n: ind.n === 13 ? 1 : ind.n + 1 }; }
  function assignRoles(tiles, okey) {
    tiles.forEach(function (t) {
      t.joker = false;
      if (t.fake) { t.c = okey.c; t.n = okey.n; }
      else if (t.c === okey.c && t.n === okey.n) t.joker = true;
    });
  }

  // ---------- per doğrulama ----------
  // Seri: real taşların sayıları (wrap'te 1 → 14 denenir), jokerler boşlukları doldurur.
  function runFrom(real, jokers, c, maxN, as14) {
    var seen = {}, ns = [];
    for (var i = 0; i < real.length; i++) {
      var n = as14 && real[i].n === 1 ? 14 : real[i].n;
      if (seen[n]) return null;
      seen[n] = 1; ns.push(n);
    }
    ns.sort(function (a, b) { return a - b; });
    var lo = ns[0], hi = ns[ns.length - 1], gaps = hi - lo + 1 - real.length;
    if (gaps > jokers) return null;
    var extra = jokers - gaps, up = Math.min(extra, maxN - hi), down = extra - up;
    if (lo - down < 1) return null;
    lo -= down; hi += up;
    if (hi - lo + 1 > 13) return null;
    var rep = [], value = 0;
    for (var k = lo; k <= hi; k++) { var nn = k === 14 ? 1 : k; rep.push({ c: c, n: nn, pos: k }); value += nn; }
    return { ok: true, type: 'run', value: value, rep: rep };
  }
  function checkRun(tiles, o) {
    if (tiles.length < 3 || tiles.length > 13) return null;
    var real = tiles.filter(function (t) { return !t.joker; }), jokers = tiles.length - real.length;
    if (!real.length) return null;
    var c = real[0].c;
    for (var i = 0; i < real.length; i++) if (real[i].c !== c) return null;
    var r = runFrom(real, jokers, c, 13, false);
    if (r) return r;
    if (o && o.wrap && real.some(function (t) { return t.n === 1; })) {
      r = runFrom(real, jokers, c, 14, true);
      if (r && r.rep[r.rep.length - 1].pos === 14) return r; // yalnızca 12-13-1 biçimi
    }
    return null;
  }
  function checkSet(tiles) {
    if (tiles.length < 3 || tiles.length > 4) return null;
    var real = tiles.filter(function (t) { return !t.joker; });
    if (!real.length) return null;
    var n = real[0].n, cols = {};
    for (var i = 0; i < real.length; i++) {
      if (real[i].n !== n || cols[real[i].c]) return null;
      cols[real[i].c] = 1;
    }
    var rep = real.map(function (t) { return { c: t.c, n: n }; });
    var free = COLORS.filter(function (c) { return !cols[c]; });
    for (var j = real.length; j < tiles.length; j++) rep.push({ c: free.shift(), n: n });
    return { ok: true, type: 'set', value: n * tiles.length, rep: rep };
  }
  function checkMeld(tiles, o) { return checkRun(tiles, o) || checkSet(tiles); }
  function checkPair(tiles) {
    if (tiles.length !== 2) return null;
    var a = tiles[0], b = tiles[1];
    if (a.joker && b.joker) return { ok: true, type: 'pair', value: 0 };
    if (a.joker || b.joker || (a.c === b.c && a.n === b.n)) return { ok: true, type: 'pair', value: (a.joker ? b.n : a.n) * 2 };
    return null;
  }
  function tileValue(t) { return t.joker ? PENALTY : t.n; }

  // Perdeki taşları gösterim sırasına koy (jokerler temsil ettikleri yere)
  function orderMeld(tiles, o) {
    var r = checkRun(tiles, o);
    if (!r) return tiles.slice();
    var real = tiles.filter(function (t) { return !t.joker; }), jk = tiles.filter(function (t) { return t.joker; });
    return r.rep.map(function (p) {
      var i = real.findIndex(function (t) { return t.n === p.n; });
      if (i >= 0) return real.splice(i, 1)[0];
      return jk.shift();
    });
  }

  // ---------- en iyi dizilim ----------
  function bestMelds(hand, o, lim) {
    var jokers = hand.filter(function (t) { return t.joker; });
    var real = hand.filter(function (t) { return !t.joker; });
    var byKey = {};
    real.forEach(function (t) { var k = t.c + t.n; (byKey[k] = byKey[k] || []).push(t); });
    var cands = [], maxS = o && o.wrap ? 12 : 11, maxN = o && o.wrap ? 14 : 13;
    COLORS.forEach(function (c) {
      for (var s = 1; s <= maxS; s++) for (var L = 3; s + L - 1 <= maxN && L <= 13; L++) {
        var need = [], miss = 0, val = 0;
        for (var n = s; n < s + L; n++) {
          var nn = n === 14 ? 1 : n;
          if (n === 14 && s === 1) { miss = 99; break; } // 1 iki kez kullanılamaz
          val += nn;
          if (byKey[c + nn] && need.indexOf(c + nn) < 0) need.push(c + nn); else miss++;
        }
        if (miss <= jokers.length && need.length >= 1 && miss < L) cands.push({ keys: need, j: miss, value: val, type: 'run' });
      }
    });
    for (var n2 = 1; n2 <= 13; n2++) {
      [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2, 3]].forEach(function (combo) {
        var keys = [], miss = 0;
        combo.forEach(function (ci) { if (byKey[COLORS[ci] + n2]) keys.push(COLORS[ci] + n2); else miss++; });
        if (keys.length >= 1 && miss <= jokers.length) cands.push({ keys: keys, j: miss, value: n2 * combo.length, type: 'set' });
      });
    }
    cands.sort(function (a, b) { return b.value - a.value; });
    var cnt = {}; Object.keys(byKey).forEach(function (k) { cnt[k] = byKey[k].length; });
    var totalReal = real.reduce(function (s, t) { return s + t.n; }, 0);
    var best = { value: 0, picks: [] }, picks = [], steps = 0, LIMIT = lim || 60000;
    function dfs(i, val, jLeft, remVal) {
      if (++steps > LIMIT) return;
      if (val > best.value) best = { value: val, picks: picks.slice() };
      if (val + remVal + jLeft * 13 <= best.value) return;
      for (var k = i; k < cands.length; k++) {
        var cd = cands[k];
        if (cd.j > jLeft) continue;
        var ok = true;
        for (var q = 0; q < cd.keys.length; q++) if (!cnt[cd.keys[q]]) { ok = false; break; }
        if (!ok) continue;
        var used = 0;
        cd.keys.forEach(function (key) { cnt[key]--; used += +key.slice(1); });
        picks.push(cd);
        dfs(k, val + cd.value, jLeft - cd.j, remVal - used);
        picks.pop();
        cd.keys.forEach(function (key) { cnt[key]++; });
      }
    }
    dfs(0, 0, jokers.length, totalReal);
    var pool = {}; Object.keys(byKey).forEach(function (k) { pool[k] = byKey[k].slice(); });
    var jpool = jokers.slice();
    var melds = best.picks.map(function (cd) {
      var ts = cd.keys.map(function (k) { return pool[k].shift(); });
      for (var x = 0; x < cd.j; x++) ts.push(jpool.shift());
      return orderMeld(ts, o);
    });
    var usedIds = {}; melds.forEach(function (m) { m.forEach(function (t) { usedIds[t.id] = 1; }); });
    var rest = hand.filter(function (t) { return !usedIds[t.id]; });
    return { melds: melds, value: melds.reduce(function (s, m) { var r = checkMeld(m, o); return s + (r ? r.value : 0); }, 0), rest: rest };
  }
  function bestPairs(hand) {
    var jokers = hand.filter(function (t) { return t.joker; }), real = hand.filter(function (t) { return !t.joker; });
    var byKey = {}, pairs = [], single = [];
    real.forEach(function (t) { var k = t.c + t.n; (byKey[k] = byKey[k] || []).push(t); });
    Object.keys(byKey).forEach(function (k) {
      var a = byKey[k];
      while (a.length >= 2) pairs.push([a.shift(), a.shift()]);
      if (a.length) single.push(a[0]);
    });
    single.sort(function (a, b) { return b.n - a.n; });
    while (jokers.length && single.length) pairs.push([single.shift(), jokers.shift()]);
    if (jokers.length >= 2) pairs.push([jokers.shift(), jokers.shift()]);
    var used = {}; pairs.forEach(function (p) { p.forEach(function (t) { used[t.id] = 1; }); });
    return { pairs: pairs, rest: hand.filter(function (t) { return !used[t.id]; }) };
  }

  // ---------- masaya işleme / okeyi alma ----------
  function addToMeld(meld, tile, o) {
    if (meld.type === 'pair') return null;
    var a = checkMeld(meld.tiles.concat([tile]), o);
    if (!a || a.type !== meld.type) return null;
    return a.type === 'run' ? orderMeld(meld.tiles.concat([tile]), o) : meld.tiles.concat([tile]);
  }
  function canProcess(table, tile, o) {
    for (var i = 0; i < table.length; i++) if (addToMeld(table[i], tile, o)) return i;
    return -1;
  }
  // Masadaki okeyin yerine geçtiği gerçek taşı koyup okeyi almak: yeni taş dizisi + alınan okey
  function swapInfo(meld, tile, o) {
    if (meld.type === 'pair' || tile.joker) return null;
    var ji = -1;
    if (meld.type === 'run') {
      var r = checkRun(meld.tiles, o); if (!r) return null;
      for (var i = 0; i < meld.tiles.length; i++) {
        if (meld.tiles[i].joker && r.rep[i] && r.rep[i].c === tile.c && r.rep[i].n === tile.n) { ji = i; break; }
      }
    } else {
      var real = meld.tiles.filter(function (t) { return !t.joker; });
      if (!real.length || real[0].n !== tile.n || real.some(function (t) { return t.c === tile.c; })) return null;
      ji = meld.tiles.findIndex(function (t) { return t.joker; });
    }
    if (ji < 0) return null;
    var nt = meld.tiles.slice(), joker = nt[ji]; nt[ji] = tile;
    var ok = meld.type === 'run' ? checkRun(nt, o) : checkSet(nt);
    if (!ok) return null;
    return { tiles: meld.type === 'run' ? orderMeld(nt, o) : nt, joker: joker };
  }

  // ---------- oyun durumu ----------
  // Oyuncular: 0 = sen (alt), 1 = sağ, 2 = üst, 3 = sol. Sıra 0→1→2→3 (sağa);
  // p'nin "yan taşı" = (p+3)%4 oyuncusunun son attığı taş.
  function newHand(seed, dealer, o) {
    var r = rng(seed), tiles = shuffle(makeTiles(), r);
    var ind;
    do { ind = tiles[Math.floor(r() * tiles.length)]; } while (ind.fake);
    var okey = okeyOf(ind);
    assignRoles(tiles, okey);
    var deck = tiles.filter(function (t) { return t.id !== ind.id; });
    var hands = [[], [], [], []];
    for (var p = 0; p < 4; p++) {
      var seat = (dealer + p) % 4, n = p === 0 ? 22 : 21;
      hands[seat] = deck.splice(0, n);
    }
    var byId = {}; tiles.forEach(function (t) { byId[t.id] = t; });
    return {
      seed: seed, byId: byId, indicator: ind, okey: okey, deck: deck, hands: hands, opts: opts(o),
      discards: [[], [], [], []], table: [], opened: [null, null, null, null], openValue: [0, 0, 0, 0], highOpen: 0,
      openedThisTurn: false, turn: dealer, dealer: dealer, phase: 'play', sideTaken: null, noSide: -1,
      sideHist: [[], [], [], []], penalties: [0, 0, 0, 0], log: [], over: false, result: null, turnCount: 0
    };
  }
  function removeFrom(arr, id) { var i = arr.findIndex(function (t) { return t.id === id; }); return i >= 0 ? arr.splice(i, 1)[0] : null; }
  function sideTile(st, p) { var d = st.discards[(p + 3) % 4]; return d.length ? d[d.length - 1] : null; }
  function err(msg) { return { ok: false, error: msg }; }
  function openNeed(st) { return st.opts.katlamali ? Math.max(OPEN_MIN, st.highOpen + 1) : OPEN_MIN; }
  function canProc(st, p) { return st.opened[p] === 'seri' || (st.opened[p] === 'cift' && st.opts.ciftIsler); }

  function draw(st, p, fromSide) {
    if (st.over) return err('over');
    if (st.turn !== p || st.phase !== 'draw') return err('not_your_draw');
    var t;
    if (fromSide) {
      if (st.noSide === p) return err('side_returned');
      t = sideTile(st, p); if (!t) return err('no_side');
      st.discards[(p + 3) % 4].pop(); st.sideTaken = t.id; st.sideHist[p].push(t);
    } else {
      if (!st.deck.length) return endHand(st, -1, null);
      t = st.deck.shift();
    }
    st.hands[p].push(t); st.phase = 'play'; st.openedThisTurn = false;
    st.log.push({ p: p, a: fromSide ? 'side' : 'draw', id: t.id });
    return { ok: true, tile: t };
  }

  function open(st, p, groups, kind) {
    if (st.turn !== p || st.phase !== 'play') return err('not_your_turn');
    if (st.opened[p]) return err('already_open');
    var o = st.opts, hand = st.hands[p], idset = {}, total = 0, checked = [];
    for (var g = 0; g < groups.length; g++) {
      var ts = groups[g].map(function (id) { return st.byId[id]; });
      for (var i = 0; i < ts.length; i++) {
        if (!ts[i] || idset[ts[i].id] || !hand.some(function (h) { return h.id === ts[i].id; })) return err('bad_tiles');
        idset[ts[i].id] = 1;
      }
      var r = kind === 'cift' ? checkPair(ts) : checkMeld(ts, o);
      if (!r) return err('bad_group');
      total += r.value; checked.push({ tiles: kind === 'cift' ? ts : orderMeld(ts, o), type: r.type });
    }
    if (kind === 'cift') { if (checked.length < PAIRS_MIN) return err('need_pairs'); }
    else if (total < openNeed(st)) return err(st.opts.katlamali && st.highOpen ? 'need_more' : 'need_101');
    if (hand.length - Object.keys(idset).length < 1) return err('need_discard');
    checked.forEach(function (m) {
      m.tiles.forEach(function (t) { removeFrom(hand, t.id); });
      st.table.push({ owner: p, tiles: m.tiles, type: m.type });
    });
    if (st.sideTaken != null && idset[st.sideTaken]) st.sideTaken = null;
    st.opened[p] = kind; st.openedThisTurn = true; st.openValue[p] = total;
    if (kind === 'seri') st.highOpen = Math.max(st.highOpen, total);
    st.log.push({ p: p, a: 'open', kind: kind, value: total });
    return { ok: true, value: total, count: checked.length };
  }
  function lay(st, p, ids) {
    if (st.turn !== p || st.phase !== 'play') return err('not_your_turn');
    if (!st.opened[p]) return err('not_open');
    var hand = st.hands[p], ts = ids.map(function (id) { return st.byId[id]; });
    if (ts.some(function (t) { return !t || !hand.some(function (h) { return h.id === t.id; }); })) return err('bad_tiles');
    var r = st.opened[p] === 'cift' ? checkPair(ts) : checkMeld(ts, st.opts);
    if (!r) return err('bad_group');
    if (hand.length - ts.length < 1) return err('need_discard');
    ts.forEach(function (t) { removeFrom(hand, t.id); });
    st.table.push({ owner: p, tiles: st.opened[p] === 'cift' ? ts : orderMeld(ts, st.opts), type: r.type });
    if (st.sideTaken != null && ids.indexOf(st.sideTaken) >= 0) st.sideTaken = null;
    st.log.push({ p: p, a: 'lay' });
    return { ok: true };
  }
  function process(st, p, id, meldIndex) {
    if (st.turn !== p || st.phase !== 'play') return err('not_your_turn');
    if (!canProc(st, p)) return err(st.opened[p] ? 'pairs_cant_process' : 'not_open');
    var hand = st.hands[p], t = hand.find(function (h) { return h.id === id; });
    if (!t) return err('bad_tiles');
    var m = st.table[meldIndex]; if (!m) return err('bad_meld');
    var nt = addToMeld(m, t, st.opts); if (!nt) return err('cant_process');
    if (hand.length - 1 < 1) return err('need_discard');
    removeFrom(hand, id); m.tiles = nt;
    if (st.sideTaken === id) st.sideTaken = null;
    st.log.push({ p: p, a: 'process', id: id, mi: meldIndex });
    return { ok: true };
  }
  // Masadaki okeyi gerçek taşıyla değiştirip almak (açmış oyuncu, kendi sırasında)
  function swap(st, p, id, meldIndex) {
    if (!st.opts.okeySwap) return err('swap_off');
    if (st.turn !== p || st.phase !== 'play') return err('not_your_turn');
    if (!canProc(st, p)) return err(st.opened[p] ? 'pairs_cant_process' : 'not_open');
    var hand = st.hands[p], t = hand.find(function (h) { return h.id === id; });
    if (!t) return err('bad_tiles');
    var m = st.table[meldIndex]; if (!m) return err('bad_meld');
    var sw = swapInfo(m, t, st.opts); if (!sw) return err('cant_swap');
    removeFrom(hand, id); hand.push(sw.joker); m.tiles = sw.tiles;
    if (st.sideTaken === id) st.sideTaken = null;
    st.log.push({ p: p, a: 'swap', id: id, mi: meldIndex });
    return { ok: true, joker: sw.joker };
  }
  function discard(st, p, id) {
    if (st.turn !== p || st.phase !== 'play') return err('not_your_turn');
    if (st.sideTaken != null && st.hands[p].some(function (h) { return h.id === st.sideTaken; })) return err('must_use_side');
    var t = removeFrom(st.hands[p], id); if (!t) return err('bad_tiles');
    var pen = 0, why = null, C = st.opts.ceza;
    if (t.joker) { pen = C; why = 'okey'; }
    else if (canProcess(st.table, t, st.opts) >= 0 && st.hands[p].length > 0) { pen = C; why = 'islek'; }
    if (pen) st.penalties[p] += pen;
    st.discards[p].push(t); st.sideTaken = null; st.noSide = -1;
    st.log.push({ p: p, a: 'discard', id: id, pen: why });
    if (st.hands[p].length === 0) {
      var mult = 1;
      if (t.joker) mult *= 2;
      if (st.opened[p] === 'cift') mult *= 2;
      if (st.openedThisTurn) mult *= 2;
      if (t.joker) st.penalties[p] -= C; // okeyle bitirmek ceza değil
      return endHand(st, p, { mult: mult, okey: !!t.joker, cift: st.opened[p] === 'cift', elden: st.openedThisTurn });
    }
    st.turn = (p + 1) % 4; st.phase = 'draw'; st.turnCount++;
    return { ok: true, penalty: why };
  }
  function returnSide(st, p) {
    if (st.sideTaken == null) return err('no_side');
    var t = removeFrom(st.hands[p], st.sideTaken); if (!t) return err('bad_tiles');
    st.discards[(p + 3) % 4].push(t); st.sideTaken = null; st.penalties[p] += st.opts.ceza;
    st.phase = 'draw'; st.noSide = p;
    return { ok: true };
  }

  function endHand(st, winner, info) {
    var mult = info ? info.mult : 1, pts = [0, 0, 0, 0];
    for (var p = 0; p < 4; p++) {
      if (p === winner) { pts[p] = -PENALTY * mult; continue; }
      var rem = st.hands[p].reduce(function (s, t) { return s + tileValue(t); }, 0);
      if (!st.opened[p]) pts[p] = 2 * PENALTY;
      else pts[p] = st.opened[p] === 'cift' ? rem * 2 : rem;
      pts[p] *= mult;
    }
    for (var q = 0; q < 4; q++) pts[q] += st.penalties[q];
    st.over = true; st.phase = 'over';
    st.result = { winner: winner, points: pts, info: info };
    st.log.push({ a: 'end', winner: winner });
    return { ok: true, end: true, result: st.result };
  }

  // ---------- botlar: easy | normal | hard ----------
  function usefulness(t, hand) {
    if (t.joker) return 999;
    var u = 0;
    hand.forEach(function (h) {
      if (h.id === t.id || h.joker) return;
      if (h.c === t.c && Math.abs(h.n - t.n) === 1) u += 3;
      else if (h.c === t.c && Math.abs(h.n - t.n) === 2) u += 1.5;
      if (h.n === t.n && h.c !== t.c) u += 2;
      if (h.n === t.n && h.c === t.c) u += 1;
    });
    return u;
  }
  // Sonraki oyuncunun (sağdakinin) bu taşı isteme ihtimali — yalnızca açık bilgilerden (yandan aldıkları, attıkları)
  function danger(st, p, t) {
    var nx = (p + 1) % 4, d = 0;
    st.sideHist[nx].forEach(function (h) {
      if (h.joker) return;
      if (h.c === t.c && Math.abs(h.n - t.n) <= 2) d += 2;
      if (h.n === t.n && h.c !== t.c) d += 2;
    });
    st.discards[nx].forEach(function (h) { if (h.c === t.c && h.n === t.n) d -= 2; else if (h.n === t.n) d -= 0.5; });
    return d;
  }
  function chooseDiscard(st, p, level) {
    var hand = st.hands[p], o = st.opts;
    if (hand.length === 1) return hand[0].id;
    var keep = {};
    if (st.opened[p] !== 'cift') bestMelds(hand, o, level === 'easy' ? 3000 : 60000).melds.forEach(function (m) { m.forEach(function (t) { keep[t.id] = 1; }); });
    else bestPairs(hand).pairs.forEach(function (pr) { pr.forEach(function (t) { keep[t.id] = 1; }); });
    var cands = hand.filter(function (t) { return !t.joker && !keep[t.id] && t.id !== st.sideTaken; });
    if (!cands.length) cands = hand.filter(function (t) { return !t.joker && t.id !== st.sideTaken; });
    if (!cands.length) cands = hand.slice();
    var safe = cands.filter(function (t) { return canProcess(st.table, t, o) < 0; });
    if (safe.length) cands = safe;
    if (level === 'easy') {
      // kolay: belirgin ama kusurlu seçim — en yüksek sayılı kullanılmayan taş
      cands.sort(function (a, b) { return (b.joker ? 0 : b.n) - (a.joker ? 0 : a.n); });
      return cands[0].id;
    }
    var score = function (t) {
      var s = usefulness(t, hand) * 3 - (t.joker ? 0 : t.n) * 0.15;
      if (level === 'hard') s += danger(st, p, t) * 2;
      return s;
    };
    cands.sort(function (a, b) { return score(a) - score(b); });
    return cands[0].id;
  }
  function botWantsSide(st, p, level) {
    var t = sideTile(st, p); if (!t || st.noSide === p) return false;
    var hand = st.hands[p], o = st.opts;
    if (t.joker) return level !== 'easy';
    if (level === 'easy') return false;
    if (canProc(st, p)) {
      if (canProcess(st.table, t, o) >= 0) return true;
      var w = bestMelds(hand.concat([t]), o), wo = bestMelds(hand, o);
      return w.melds.some(function (m) { return m.indexOf(t) >= 0; }) && w.value > wo.value;
    }
    if (st.opened[p]) return false;
    var withT = bestMelds(hand.concat([t]), o);
    if (withT.value >= openNeed(st) && withT.melds.some(function (m) { return m.indexOf(t) >= 0; })) return true;
    return false;
  }
  function botPlay(st, p, level) {
    var hand = st.hands[p], acts = [], o = st.opts;
    if (!st.opened[p]) {
      var bm = bestMelds(hand, o), bp = bestPairs(hand);
      var goPairs = bp.pairs.length >= PAIRS_MIN && bp.rest.length >= 1 && (bm.value < openNeed(st) || (level === 'hard' && bm.value < openNeed(st) + 20 && bp.pairs.length >= 6));
      if (level === 'easy') goPairs = false;
      if (!goPairs && bm.value >= openNeed(st) && bm.rest.length >= 1) {
        var r = open(st, p, bm.melds.map(function (m) { return m.map(function (t) { return t.id; }); }), 'seri');
        if (r.ok) acts.push({ a: 'open', kind: 'seri', value: r.value });
      } else if (goPairs) {
        var r2 = open(st, p, bp.pairs.map(function (m) { return m.map(function (t) { return t.id; }); }), 'cift');
        if (r2.ok) acts.push({ a: 'open', kind: 'cift' });
      }
    }
    if (st.opened[p] === 'seri' || canProc(st, p)) {
      if (st.opened[p] === 'seri') {
        bestMelds(st.hands[p], o).melds.forEach(function (m) {
          if (st.hands[p].length - m.length >= 1 && lay(st, p, m.map(function (t) { return t.id; })).ok) acts.push({ a: 'lay' });
        });
      }
      // zor/normal: masadaki okeyi gerçek taşıyla al
      if (level !== 'easy' && o.okeySwap) {
        for (var mi = 0; mi < st.table.length; mi++) {
          for (var hi = 0; hi < st.hands[p].length; hi++) {
            var ht = st.hands[p][hi];
            if (swapInfo(st.table[mi], ht, o) && swap(st, p, ht.id, mi).ok) { acts.push({ a: 'swap' }); hi = 99; }
          }
        }
        if (st.opened[p] === 'seri') bestMelds(st.hands[p], o).melds.forEach(function (m) {
          if (st.hands[p].length - m.length >= 1 && lay(st, p, m.map(function (t) { return t.id; })).ok) acts.push({ a: 'lay' });
        });
      }
      var changed = true;
      while (changed) {
        changed = false;
        for (var i = 0; i < st.hands[p].length && st.hands[p].length > 1; i++) {
          var t = st.hands[p][i];
          if (t.joker) continue;
          var mx = canProcess(st.table, t, o);
          if (mx >= 0 && process(st, p, t.id, mx).ok) { acts.push({ a: 'process' }); changed = true; break; }
        }
      }
    }
    if (st.opened[p] === 'cift') {
      bestPairs(st.hands[p]).pairs.forEach(function (pr) {
        if (st.hands[p].length - 2 >= 1 && lay(st, p, pr.map(function (t) { return t.id; })).ok) acts.push({ a: 'lay' });
      });
    }
    if (st.sideTaken != null && st.hands[p].some(function (h) { return h.id === st.sideTaken; })) {
      returnSide(st, p); acts.push({ a: 'return' });
    }
    return acts;
  }

  // ---------- ipucu (insan oyuncu için) ----------
  function hint(st, p) {
    if (st.turn !== p || st.over) return null;
    var o = st.opts, hand = st.hands[p];
    if (st.phase === 'draw') {
      var side = sideTile(st, p);
      if (side && botWantsSide(st, p, 'hard')) return { a: 'side', id: side.id };
      return { a: 'deck' };
    }
    if (!st.opened[p]) {
      var bm = bestMelds(hand, o);
      if (bm.value >= openNeed(st) && bm.rest.length >= 1) return { a: 'open', kind: 'seri', value: bm.value };
      var bp = bestPairs(hand);
      if (bp.pairs.length >= PAIRS_MIN && bp.rest.length >= 1) return { a: 'open', kind: 'cift' };
    } else if (canProc(st, p)) {
      for (var mi = 0; mi < st.table.length; mi++) for (var i = 0; i < hand.length; i++) {
        if (o.okeySwap && swapInfo(st.table[mi], hand[i], o)) return { a: 'swap', id: hand[i].id, mi: mi };
      }
      for (var j = 0; j < hand.length && hand.length > 1; j++) {
        if (hand[j].joker) continue;
        var m = canProcess(st.table, hand[j], o); if (m >= 0) return { a: 'process', id: hand[j].id, mi: m };
      }
    }
    return { a: 'discard', id: chooseDiscard(st, p, 'hard') };
  }

  return {
    COLORS: COLORS, OPEN_MIN: OPEN_MIN, PAIRS_MIN: PAIRS_MIN, PENALTY: PENALTY, DEFAULTS: DEFAULTS,
    rng: rng, shuffle: shuffle, makeTiles: makeTiles, okeyOf: okeyOf, assignRoles: assignRoles,
    checkRun: checkRun, checkSet: checkSet, checkMeld: checkMeld, checkPair: checkPair, tileValue: tileValue,
    bestMelds: bestMelds, bestPairs: bestPairs, orderMeld: orderMeld, addToMeld: addToMeld, canProcess: canProcess, swapInfo: swapInfo,
    newHand: newHand, sideTile: sideTile, openNeed: openNeed, canProc: canProc,
    draw: draw, open: open, lay: lay, process: process, swap: swap, discard: discard, returnSide: returnSide, endHand: endHand,
    chooseDiscard: chooseDiscard, botWantsSide: botWantsSide, botPlay: botPlay, hint: hint, usefulness: usefulness, danger: danger
  };
});
