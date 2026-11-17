/* 101 Okey — kural motoru (arayüzden bağımsız; tarayıcıda window.OkeyMotor, Node'da module.exports)
 *
 * Kurallar (yaygın kahvehane 101):
 *  - 106 taş: 4 renk × 1–13 × 2 + 2 sahte okey. Gösterge açılır; okey = göstergenin aynı renkte bir fazlası (13 → 1).
 *    Gerçek okey taşları joker gibi her taşın yerine geçer; sahte okey, okeyin kendi rengi/sayısı olarak oynar.
 *  - Dağıtan 22, diğerleri 21 taş alır. Dağıtan taş çekmeden atarak başlar. Sıra sağa döner.
 *  - Açmak için perlerin toplamı en az 101 olmalı (seri: aynı renk ardışık ≥3; per: aynı sayı farklı renk 3–4),
 *    ya da en az 5 çift. 12-13-1 gibi başa dönen seri yoktur.
 *  - Açan oyuncu sonraki turlarda yeni per açabilir ve masadaki perlere taş işleyebilir (çift açan yalnızca çift ekler).
 *  - Yandan (soldaki oyuncunun attığı) alınan taş o turda kullanılmalıdır.
 *  - Ceza (+101): okey atmak, masadaki bir pere işlenebilecek taşı atmak.
 *  - Bitiren: −101. Okeyle bitirme, çiftle bitirme ve elden bitirme (aynı turda açıp bitirme) puanları ikiye katlar.
 *  - Diğerleri: açmadıysa 202; seri açtıysa elindeki taşların toplamı; çift açtıysa toplamın iki katı. Elde kalan okey 101 sayılır.
 *  - Deste biterse el bitenler olmadan kapanır, herkes elindekine göre yazar.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OkeyMotor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLORS = ['k', 's', 'm', 'y']; // kırmızı, sarı, mavi, siyah
  var OPEN_MIN = 101, PAIRS_MIN = 5, PENALTY = 101;

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
  // Gösterge sonrası taşlara rol ver: gerçek okey = joker; sahte okey = okeyin rengi/sayısı
  function assignRoles(tiles, okey) {
    tiles.forEach(function (t) {
      t.joker = false;
      if (t.fake) { t.c = okey.c; t.n = okey.n; }
      else if (t.c === okey.c && t.n === okey.n) t.joker = true;
    });
  }

  // ---------- per doğrulama ----------
  // tiles: taş nesneleri. Dönüş: {ok, type:'run'|'set', value, rep:[{c,n}] (sıralı temsil)}
  function checkRun(tiles) {
    if (tiles.length < 3 || tiles.length > 13) return null;
    var real = tiles.filter(function (t) { return !t.joker; }), jokers = tiles.length - real.length;
    if (!real.length) return null;
    var c = real[0].c, seen = {};
    for (var i = 0; i < real.length; i++) {
      if (real[i].c !== c || seen[real[i].n]) return null;
      seen[real[i].n] = 1;
    }
    var ns = real.map(function (t) { return t.n; }).sort(function (a, b) { return a - b; });
    var lo = ns[0], hi = ns[ns.length - 1], gaps = hi - lo + 1 - real.length;
    if (gaps > jokers) return null;
    var extra = jokers - gaps;
    // fazla jokerler: önce yukarı (değer yüksek), sonra aşağı
    var up = Math.min(extra, 13 - hi), down = extra - up;
    if (lo - down < 1) return null;
    lo -= down; hi += up;
    var rep = [], value = 0;
    for (var n = lo; n <= hi; n++) { rep.push({ c: c, n: n }); value += n; }
    return { ok: true, type: 'run', value: value, rep: rep };
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
  function checkMeld(tiles) { return checkRun(tiles) || checkSet(tiles); }
  function checkPair(tiles) {
    if (tiles.length !== 2) return null;
    var a = tiles[0], b = tiles[1];
    if (a.joker && b.joker) return { ok: true, type: 'pair', value: 0 };
    if (a.joker || b.joker || (a.c === b.c && a.n === b.n)) return { ok: true, type: 'pair', value: (a.joker ? b.n : a.n) * 2 };
    return null;
  }
  function tileValue(t) { return t.joker ? PENALTY : t.n; }

  // ---------- en iyi dizilim (botlar ve "Seri diz" için) ----------
  // Elden ayrık perler seçip toplam değeri en büyük yapar. Taş sayısı ≤ 22, küçük aramayla hızlıdır.
  function bestMelds(hand, opts) {
    opts = opts || {};
    var jokers = hand.filter(function (t) { return t.joker; });
    var real = hand.filter(function (t) { return !t.joker; });
    var byKey = {};
    real.forEach(function (t) { var k = t.c + t.n; (byKey[k] = byKey[k] || []).push(t); });
    var cands = [];
    // seriler
    COLORS.forEach(function (c) {
      for (var s = 1; s <= 11; s++) for (var L = 3; s + L - 1 <= 13; L++) {
        var need = [], miss = 0, val = 0;
        for (var n = s; n < s + L; n++) { val += n; if (byKey[c + n]) need.push(c + n); else miss++; }
        if (miss <= jokers.length && need.length >= 1 && miss < L) cands.push({ keys: need, j: miss, value: val, type: 'run', c: c, s: s, L: L });
      }
    });
    // perler
    for (var n = 1; n <= 13; n++) {
      var have = COLORS.filter(function (c) { return byKey[c + n]; });
      [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2, 3]].forEach(function (combo) {
        var keys = [], miss = 0;
        combo.forEach(function (ci) { if (byKey[COLORS[ci] + n]) keys.push(COLORS[ci] + n); else miss++; });
        if (keys.length >= 1 && miss <= jokers.length) cands.push({ keys: keys, j: miss, value: n * combo.length, type: 'set', n: n });
      });
      void have;
    }
    cands.sort(function (a, b) { return b.value - a.value; });
    var cnt = {}; Object.keys(byKey).forEach(function (k) { cnt[k] = byKey[k].length; });
    var totalReal = real.reduce(function (s, t) { return s + t.n; }, 0);
    var best = { value: 0, picks: [] }, picks = [], steps = 0;
    var LIMIT = opts.limit || 60000;
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
    // seçilen adayları gerçek taşlara çevir
    var pool = {}; Object.keys(byKey).forEach(function (k) { pool[k] = byKey[k].slice(); });
    var jpool = jokers.slice();
    var melds = best.picks.map(function (cd) {
      var ts = cd.keys.map(function (k) { return pool[k].shift(); });
      for (var x = 0; x < cd.j; x++) ts.push(jpool.shift());
      if (cd.type === 'run') ts.sort(function (a, b) { return (a.joker ? 99 : a.n) - (b.joker ? 99 : b.n); });
      return ts;
    });
    // jokerleri doğru konuma yerleştir (seride boşluklar)
    melds = melds.map(orderMeld);
    var usedIds = {}; melds.forEach(function (m) { m.forEach(function (t) { usedIds[t.id] = 1; }); });
    var rest = hand.filter(function (t) { return !usedIds[t.id]; });
    return { melds: melds, value: melds.reduce(function (s, m) { var r = checkMeld(m); return s + (r ? r.value : 0); }, 0), rest: rest };
  }
  // Perdeki taşları gösterim sırasına koy (jokerler temsil ettikleri yere)
  function orderMeld(tiles) {
    var r = checkRun(tiles);
    if (!r) return tiles.slice();
    var real = tiles.filter(function (t) { return !t.joker; }), jk = tiles.filter(function (t) { return t.joker; });
    return r.rep.map(function (p) {
      var i = real.findIndex(function (t) { return t.n === p.n; });
      if (i >= 0) return real.splice(i, 1)[0];
      return jk.shift();
    });
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

  // ---------- masadaki pere işleme ----------
  // meld: {tiles:[...], type}. Dönüş: yeni taş dizisi ya da null
  function addToMeld(meld, tile) {
    if (meld.type === 'pair') return null;
    var a = checkMeld(meld.tiles.concat([tile]));
    if (!a || a.type !== meld.type) return null;
    return a.type === 'run' ? orderMeld(meld.tiles.concat([tile])) : meld.tiles.concat([tile]);
  }
  function canProcess(table, tile) {
    for (var i = 0; i < table.length; i++) if (addToMeld(table[i], tile)) return i;
    return -1;
  }

  // ---------- oyun durumu ----------
  // Oyuncular: 0 = sen (alt), 1 = sağ, 2 = üst, 3 = sol. Sıra 0→1→2→3 (sağa) döner;
  // p oyuncusunun "yan taşı" = (p+3)%4 oyuncusunun son attığı taş.
  function newHand(seed, dealer) {
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
      seed: seed, byId: byId, indicator: ind, okey: okey, deck: deck, hands: hands,
      discards: [[], [], [], []], table: [], opened: [null, null, null, null],
      openedThisTurn: false, turn: dealer, dealer: dealer, phase: 'play', sideTaken: null,
      penalties: [0, 0, 0, 0], log: [], over: false, result: null, turnCount: 0
    };
  }
  function handOf(st, p) { return st.hands[p]; }
  function removeFrom(arr, id) { var i = arr.findIndex(function (t) { return t.id === id; }); return i >= 0 ? arr.splice(i, 1)[0] : null; }
  function sideTile(st, p) { var d = st.discards[(p + 3) % 4]; return d.length ? d[d.length - 1] : null; }
  function err(msg) { return { ok: false, error: msg }; }

  function draw(st, p, fromSide) {
    if (st.over) return err('over');
    if (st.turn !== p || st.phase !== 'draw') return err('not_your_draw');
    var t;
    if (fromSide) {
      if (st.noSide === p) return err('side_returned');
      t = sideTile(st, p); if (!t) return err('no_side');
      st.discards[(p + 3) % 4].pop(); st.sideTaken = t.id;
    } else {
      if (!st.deck.length) return endHand(st, -1, null);
      t = st.deck.shift();
    }
    st.hands[p].push(t); st.phase = 'play'; st.openedThisTurn = false;
    st.log.push({ p: p, a: fromSide ? 'side' : 'draw' });
    return { ok: true, tile: t };
  }

  // groups: taş id dizilerinin dizisi. kind: 'seri' | 'cift'
  function open(st, p, groups, kind) {
    if (st.turn !== p || st.phase !== 'play') return err('not_your_turn');
    if (st.opened[p]) return err('already_open');
    var hand = st.hands[p], idset = {}, total = 0, checked = [];
    for (var g = 0; g < groups.length; g++) {
      var ts = groups[g].map(function (id) { return st.byId[id]; });
      for (var i = 0; i < ts.length; i++) {
        if (!ts[i] || idset[ts[i].id] || !hand.some(function (h) { return h.id === ts[i].id; })) return err('bad_tiles');
        idset[ts[i].id] = 1;
      }
      var r = kind === 'cift' ? checkPair(ts) : checkMeld(ts);
      if (!r) return err('bad_group');
      total += r.value; checked.push({ tiles: kind === 'cift' ? ts : orderMeld(ts), type: r.type });
    }
    if (kind === 'cift' ? checked.length < PAIRS_MIN : total < OPEN_MIN) return err(kind === 'cift' ? 'need_pairs' : 'need_101');
    if (hand.length - Object.keys(idset).length < 1) return err('need_discard');
    checked.forEach(function (m) {
      m.tiles.forEach(function (t) { removeFrom(hand, t.id); });
      st.table.push({ owner: p, tiles: m.tiles, type: m.type });
    });
    if (st.sideTaken != null && idset[st.sideTaken]) st.sideTaken = null;
    st.opened[p] = kind; st.openedThisTurn = true;
    st.log.push({ p: p, a: 'open', kind: kind, value: total });
    return { ok: true, value: total, count: checked.length };
  }
  // Açtıktan sonra yeni per/çift koymak
  function lay(st, p, ids) {
    if (st.turn !== p || st.phase !== 'play') return err('not_your_turn');
    if (!st.opened[p]) return err('not_open');
    var hand = st.hands[p], ts = ids.map(function (id) { return st.byId[id]; });
    if (ts.some(function (t) { return !t || !hand.some(function (h) { return h.id === t.id; }); })) return err('bad_tiles');
    var r = st.opened[p] === 'cift' ? checkPair(ts) : checkMeld(ts);
    if (!r) return err('bad_group');
    if (hand.length - ts.length < 1) return err('need_discard');
    ts.forEach(function (t) { removeFrom(hand, t.id); });
    st.table.push({ owner: p, tiles: st.opened[p] === 'cift' ? ts : orderMeld(ts), type: r.type });
    if (st.sideTaken != null && ids.indexOf(st.sideTaken) >= 0) st.sideTaken = null;
    st.log.push({ p: p, a: 'lay' });
    return { ok: true };
  }
  function process(st, p, id, meldIndex) {
    if (st.turn !== p || st.phase !== 'play') return err('not_your_turn');
    if (st.opened[p] !== 'seri') return err(st.opened[p] ? 'pairs_cant_process' : 'not_open');
    var hand = st.hands[p], t = hand.find(function (h) { return h.id === id; });
    if (!t) return err('bad_tiles');
    var m = st.table[meldIndex]; if (!m) return err('bad_meld');
    var nt = addToMeld(m, t); if (!nt) return err('cant_process');
    if (hand.length - 1 < 1) return err('need_discard');
    removeFrom(hand, id); m.tiles = nt;
    if (st.sideTaken === id) st.sideTaken = null;
    st.log.push({ p: p, a: 'process' });
    return { ok: true };
  }
  function discard(st, p, id) {
    if (st.turn !== p || st.phase !== 'play') return err('not_your_turn');
    // yandan alınan taş kullanılmadan atılamaz (ister o taş, ister başka bir taş)
    if (st.sideTaken != null && st.hands[p].some(function (h) { return h.id === st.sideTaken; })) return err('must_use_side');
    var t = removeFrom(st.hands[p], id); if (!t) return err('bad_tiles');
    var pen = 0, why = null;
    if (t.joker) { pen = PENALTY; why = 'okey'; }
    else if (canProcess(st.table, t) >= 0 && st.hands[p].length > 0) { pen = PENALTY; why = 'islek'; }
    if (pen) st.penalties[p] += pen;
    st.discards[p].push(t); st.sideTaken = null; st.noSide = -1;
    st.log.push({ p: p, a: 'discard', id: id, pen: why });
    if (st.hands[p].length === 0) {
      var mult = 1;
      if (t.joker) mult *= 2;
      if (st.opened[p] === 'cift') mult *= 2;
      if (st.openedThisTurn) mult *= 2;
      if (t.joker) st.penalties[p] -= PENALTY; // okeyle bitirmek ceza değil
      return endHand(st, p, { mult: mult, okey: !!t.joker, cift: st.opened[p] === 'cift', elden: st.openedThisTurn });
    }
    st.turn = (p + 1) % 4; st.phase = 'draw'; st.turnCount++;
    return { ok: true, penalty: why };
  }
  // Yandan alınan taşı kullanamayan oyuncu: taşı geri koyar, 101 ceza
  function returnSide(st, p) {
    if (st.sideTaken == null) return err('no_side');
    var t = removeFrom(st.hands[p], st.sideTaken); if (!t) return err('bad_tiles');
    st.discards[(p + 3) % 4].push(t); st.sideTaken = null; st.penalties[p] += PENALTY;
    st.phase = 'draw'; st.noSide = p; // bu tur yandan tekrar alamaz
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

  // ---------- bot ----------
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
  function chooseDiscard(st, p) {
    var hand = st.hands[p];
    if (hand.length === 1) return hand[0].id;
    var keep = {};
    if (st.opened[p] !== 'cift') bestMelds(hand).melds.forEach(function (m) { m.forEach(function (t) { keep[t.id] = 1; }); });
    var cands = hand.filter(function (t) { return !t.joker && !keep[t.id] && t.id !== st.sideTaken; });
    if (!cands.length) cands = hand.filter(function (t) { return !t.joker && t.id !== st.sideTaken; });
    if (!cands.length) cands = hand.slice();
    var safe = cands.filter(function (t) { return canProcess(st.table, t) < 0; });
    if (safe.length) cands = safe;
    cands.sort(function (a, b) { return (usefulness(a, hand) - usefulness(b, hand)) || ((b.joker ? 0 : b.n) - (a.joker ? 0 : a.n)); });
    return cands[0].id;
  }
  // Botun çekme kararı: yan taş açmayı ya da işlemeyi sağlıyorsa al
  function botWantsSide(st, p) {
    var t = sideTile(st, p); if (!t || st.noSide === p) return false;
    if (t.joker) return true;
    var hand = st.hands[p];
    if (st.opened[p] === 'seri') return canProcess(st.table, t) >= 0 || bestMelds(hand.concat([t])).melds.some(function (m) { return m.indexOf(t) >= 0; }) && bestMelds(hand.concat([t])).value > bestMelds(hand).value;
    if (st.opened[p]) return false;
    var withT = bestMelds(hand.concat([t]));
    return withT.value >= OPEN_MIN && withT.melds.some(function (m) { return m.indexOf(t) >= 0; });
  }
  // Botun çekmeden sonraki hamleleri (açma, per ekleme, işleme); atmadan önce çağrılır
  function botPlay(st, p) {
    var hand = st.hands[p], acts = [];
    if (!st.opened[p]) {
      var bm = bestMelds(hand), bp = bestPairs(hand);
      if (bm.value >= OPEN_MIN && bm.rest.length >= 1) {
        var r = open(st, p, bm.melds.map(function (m) { return m.map(function (t) { return t.id; }); }), 'seri');
        if (r.ok) acts.push({ a: 'open', kind: 'seri', value: r.value });
      } else if (bp.pairs.length >= PAIRS_MIN && bp.rest.length >= 1) {
        var r2 = open(st, p, bp.pairs.map(function (m) { return m.map(function (t) { return t.id; }); }), 'cift');
        if (r2.ok) acts.push({ a: 'open', kind: 'cift' });
      }
    }
    if (st.opened[p] === 'seri') {
      var more = bestMelds(st.hands[p]);
      more.melds.forEach(function (m) {
        if (st.hands[p].length - m.length >= 1 && lay(st, p, m.map(function (t) { return t.id; })).ok) acts.push({ a: 'lay' });
      });
      var changed = true;
      while (changed) {
        changed = false;
        for (var i = 0; i < st.hands[p].length && st.hands[p].length > 1; i++) {
          var t = st.hands[p][i];
          if (t.joker) continue;
          var mi = canProcess(st.table, t);
          if (mi >= 0 && process(st, p, t.id, mi).ok) { acts.push({ a: 'process' }); changed = true; break; }
        }
      }
    } else if (st.opened[p] === 'cift') {
      var bp2 = bestPairs(st.hands[p]);
      bp2.pairs.forEach(function (pr) {
        if (st.hands[p].length - 2 >= 1 && lay(st, p, pr.map(function (t) { return t.id; })).ok) acts.push({ a: 'lay' });
      });
    }
    if (st.sideTaken != null && st.hands[p].some(function (h) { return h.id === st.sideTaken; })) {
      // kullanamadıysa (olmamalı) geri koy
      returnSide(st, p); acts.push({ a: 'return' });
    }
    return acts;
  }

  return {
    COLORS: COLORS, OPEN_MIN: OPEN_MIN, PAIRS_MIN: PAIRS_MIN, PENALTY: PENALTY,
    rng: rng, shuffle: shuffle, makeTiles: makeTiles, okeyOf: okeyOf, assignRoles: assignRoles,
    checkRun: checkRun, checkSet: checkSet, checkMeld: checkMeld, checkPair: checkPair, tileValue: tileValue,
    bestMelds: bestMelds, bestPairs: bestPairs, orderMeld: orderMeld, addToMeld: addToMeld, canProcess: canProcess,
    newHand: newHand, sideTile: sideTile, draw: draw, open: open, lay: lay, process: process, discard: discard,
    returnSide: returnSide, endHand: endHand, chooseDiscard: chooseDiscard, botWantsSide: botWantsSide, botPlay: botPlay,
    usefulness: usefulness
  };
});
