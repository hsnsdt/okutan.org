/* Okey — kural motoru (arayüzden bağımsız; tarayıcıda window.OkeyKural, Node'da module.exports)
 *
 * Kurallar (yaygın Türk okeyi):
 *  - 106 taş: 4 renk × 1–13 × 2 + 2 sahte okey. Gösterge açılır; okey = göstergenin aynı renkte bir fazlası (13 → 1).
 *    Gerçek okey taşları her taşın yerine geçer; sahte okey, okeyin kendi rengi/sayısı olarak oynar.
 *  - Dağıtanın sağındaki oyuncu 15, diğerleri 14 taş alır. 15 taşlı oyuncu taş atarak başlar. Sıra sağa döner.
 *  - Sıran gelince desteden ya da soldaki oyuncunun son attığı taşı çek, sonra bir taş at.
 *  - Bitirmek: 15. taşı ortaya bırakırken kalan 14 taşın tamamı perlerden (seri: aynı renk ardışık ≥3, 12-13-1 olur
 *    ama 13-1-2 olmaz; per: aynı sayı farklı renk 3–4) ya da 7 çiftten oluşmalı.
 *  - Puan (herkes başlangıç puanıyla başlar, kaybedenlerden düşülür):
 *      normal bitiş 2 · okey atarak bitiş 4 · çift bitiş 4 · çift + okey 8 · gösterge 1.
 *    Gösterge: göstergenin aynısı elindeyse ilk taşını çekmeden (başlayan için ilk atıştan önce) gösterebilirsin.
 *  - Deste biter ve sırası gelen oyuncu yandaki taşı da almazsa el berabere biter (gösterge puanı yine sayılır).
 *
 * Seçenekler (newHand(seed, dealer, opts)): show (gösterge puanı, varsayılan açık), cift (7 çiftle bitirme, varsayılan açık)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OkeyKural = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLORS = ['k', 's', 'm', 'y']; // kırmızı, sarı, mavi, siyah
  var PTS = { normal: 2, okey: 4, cift: 4, ciftOkey: 8, show: 1 };
  var DEFAULTS = { show: true, cift: true };
  function opts(o) { var r = {}; for (var k in DEFAULTS) r[k] = o && o[k] != null ? !!o[k] : DEFAULTS[k]; return r; }

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
  // Seri: aynı renk ardışık; 1 ya altta (1-2-3) ya üstte (12-13-1) olabilir, ikisi birden olamaz.
  function runSpan(real, jokers, as14) {
    var seen = {}, ns = [];
    for (var i = 0; i < real.length; i++) {
      var n = as14 && real[i].n === 1 ? 14 : real[i].n;
      if (seen[n]) return null;
      seen[n] = 1; ns.push(n);
    }
    ns.sort(function (a, b) { return a - b; });
    var lo = ns[0], hi = ns[ns.length - 1], gaps = hi - lo + 1 - real.length;
    if (gaps > jokers) return null;
    var maxN = as14 ? 14 : 13, extra = jokers - gaps, up = Math.min(extra, maxN - hi), down = extra - up;
    if (lo - down < (as14 ? 2 : 1)) return null;
    return { lo: lo - down, hi: hi + up };
  }
  function checkRun(tiles) {
    if (tiles.length < 3 || tiles.length > 13) return null;
    var real = tiles.filter(function (t) { return !t.joker; }), jokers = tiles.length - real.length;
    if (!real.length) return null;
    var c = real[0].c;
    for (var i = 0; i < real.length; i++) if (real[i].c !== c) return null;
    var r = runSpan(real, jokers, false);
    if (!r && real.some(function (t) { return t.n === 1; })) r = runSpan(real, jokers, true);
    return r ? { type: 'run', c: c, lo: r.lo, hi: r.hi } : null;
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
    return { type: 'set', n: n };
  }
  function checkMeld(tiles) { return checkRun(tiles) || checkSet(tiles); }
  function checkPair(tiles) {
    if (tiles.length !== 2) return null;
    var a = tiles[0], b = tiles[1];
    return a.joker || b.joker || (a.c === b.c && a.n === b.n) ? { type: 'pair' } : null;
  }
  // Serideki taşları sıraya koy (okeyler yerlerine)
  function orderRun(tiles) {
    var r = checkRun(tiles); if (!r) return tiles.slice();
    var real = tiles.filter(function (t) { return !t.joker; }), jk = tiles.filter(function (t) { return t.joker; }), out = [];
    for (var k = r.lo; k <= r.hi; k++) {
      var nn = k === 14 ? 1 : k, i = real.findIndex(function (t) { return t.n === nn; });
      out.push(i >= 0 ? real.splice(i, 1)[0] : jk.shift());
    }
    return out;
  }

  // ---------- eli bitirme kontrolü ----------
  // 14 taşın tamamı perlere bölünebiliyor mu? (tam örtü araması) → per dizisi ya da null
  function arrangeAll(tiles) {
    var jk = tiles.filter(function (t) { return t.joker; }), real = tiles.filter(function (t) { return !t.joker; });
    var pool = {}; real.forEach(function (t) { (pool[t.c + t.n] = pool[t.c + t.n] || []).push(t); });
    var melds = [], steps = 0;
    function has(c, n) { var a = pool[c + n]; return a && a.length; }
    function first() { for (var ci = 0; ci < 4; ci++) for (var n = 1; n <= 13; n++) if (has(COLORS[ci], n)) return { c: COLORS[ci], n: n }; return null; }
    function rec(j) {
      if (++steps > 200000) return false;
      var f = first();
      if (!f) {
        // artan okeyler bir pere eklenir (seri uzar ya da 3'lü per 4'lü olur)
        var used = [];
        for (var q = 0; q < j; q++) {
          var mi = melds.findIndex(function (m) { return checkMeld(m.concat([jk[jk.length - 1 - q]])); });
          if (mi < 0) { used.forEach(function (x) { melds[x].pop(); }); return false; }
          melds[mi].push(jk[jk.length - 1 - q]); used.push(mi);
        }
        return true;
      }
      var t = pool[f.c + f.n].pop(), jl = jk.length - j;
      // 1) aynı sayı farklı renk (per)
      var others = COLORS.filter(function (c) { return c !== f.c && has(c, f.n); });
      for (var mask = 0; mask < (1 << others.length); mask++) {
        var pick = others.filter(function (_, i) { return mask & (1 << i); });
        for (var ju = 0; ju <= Math.min(j, 2); ju++) {
          var size = 1 + pick.length + ju;
          if (size < 3 || size > 4) continue;
          var ts = [t].concat(pick.map(function (c) { return pool[c + f.n].pop(); }));
          for (var x = 0; x < ju; x++) ts.push(jk[jl + x]);
          melds.push(ts);
          if (rec(j - ju)) return true;
          melds.pop();
          pick.forEach(function (c, i) { pool[c + f.n].push(ts[1 + i]); });
        }
      }
      // 2) seri: t en küçük gerçek taş; altındaki konumlar okeyle dolar
      for (var s = Math.max(1, f.n - j); s <= f.n; s++) {
        var below = f.n - s, seq = [];
        for (var b = 0; b < below; b++) seq.push(jk[jl + b]);
        seq.push(t);
        if (grow(f.c, f.n + 1, seq, below, j)) return true;
      }
      // 3) 1'i üstte kullanan seri: ...-12-13-1
      if (f.n === 1) {
        for (var s2 = 12; s2 >= 2; s2--) if (fixedTop(f.c, s2, t, j)) return true;
      }
      pool[f.c + f.n].push(t);
      return false;
    }
    function grow(c, pos, seq, ju, j) {
      if (seq.length >= 3) { melds.push(seq.slice()); if (rec(j - ju)) return true; melds.pop(); }
      if (pos > 13) return false;
      if (has(c, pos)) {
        var tt = pool[c + pos].pop(); seq.push(tt);
        if (grow(c, pos + 1, seq, ju, j)) return true;
        seq.pop(); pool[c + pos].push(tt);
      }
      if (ju < j) {
        seq.push(jk[jk.length - j + ju]);
        if (grow(c, pos + 1, seq, ju + 1, j)) return true;
        seq.pop();
      }
      return false;
    }
    function fixedTop(c, s, t, j) {
      var jl = jk.length - j;
      function fill(pos, seq, ju) {
        if (pos > 13) {
          melds.push(seq.concat([t]));
          if (rec(j - ju)) return true;
          melds.pop(); return false;
        }
        if (has(c, pos)) {
          var tt = pool[c + pos].pop(); seq.push(tt);
          if (fill(pos + 1, seq, ju)) return true;
          seq.pop(); pool[c + pos].push(tt);
        }
        if (ju < j) { seq.push(jk[jl + ju]); if (fill(pos + 1, seq, ju + 1)) return true; seq.pop(); }
        return false;
      }
      return fill(s, [], 0);
    }
    if (!real.length) return null;
    return rec(jk.length) ? melds.map(function (m) { return checkRun(m) ? orderRun(m) : m; }) : null;
  }
  function sevenPairs(tiles) {
    if (tiles.length !== 14) return null;
    var jk = tiles.filter(function (t) { return t.joker; }), by = {}, pairs = [], single = [];
    tiles.forEach(function (t) { if (!t.joker) (by[t.c + t.n] = by[t.c + t.n] || []).push(t); });
    Object.keys(by).forEach(function (k) { var a = by[k]; while (a.length >= 2) pairs.push([a.shift(), a.shift()]); if (a.length) single.push(a[0]); });
    if (single.length > jk.length) return null;
    single.forEach(function (t) { pairs.push([t, jk.shift()]); });
    if (jk.length) pairs.push(jk.splice(0, 2));
    return pairs.length === 7 ? pairs : null;
  }
  // 14 taş: 'cift' | 'seri' | null
  function finishKind(tiles, o) {
    if (tiles.length !== 14) return null;
    if ((!o || o.cift !== false) && sevenPairs(tiles)) return 'cift';
    return arrangeAll(tiles) ? 'seri' : null;
  }

  // ---------- en iyi dizilim (ıstaka dizme ve botlar için): en çok taşı perlere koy ----------
  function bestArrange(hand, lim) {
    var jokers = hand.filter(function (t) { return t.joker; }), real = hand.filter(function (t) { return !t.joker; });
    var byKey = {}; real.forEach(function (t) { var k = t.c + t.n; (byKey[k] = byKey[k] || []).push(t); });
    var cands = [];
    COLORS.forEach(function (c) {
      for (var s = 1; s <= 12; s++) for (var L = 3; s + L - 1 <= 14 && L <= 13; L++) {
        var need = [], miss = 0;
        for (var n = s; n < s + L; n++) {
          var nn = n === 14 ? 1 : n;
          if (n === 14 && s === 1) { miss = 99; break; }
          if (byKey[c + nn]) need.push(c + nn); else miss++;
        }
        if (miss <= jokers.length && need.length >= 2 && miss < L) cands.push({ keys: need, j: miss, size: L });
      }
    });
    for (var n2 = 1; n2 <= 13; n2++) {
      [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3], [0, 1, 2, 3]].forEach(function (combo) {
        var keys = [], miss = 0;
        combo.forEach(function (ci) { if (byKey[COLORS[ci] + n2]) keys.push(COLORS[ci] + n2); else miss++; });
        if (keys.length >= 2 && miss <= jokers.length) cands.push({ keys: keys, j: miss, size: combo.length });
      });
    }
    // gerçek taş çok, okey az kullanan adaylar önce
    cands.sort(function (a, b) { return (b.keys.length - a.keys.length) || (a.j - b.j); });
    var cnt = {}; Object.keys(byKey).forEach(function (k) { cnt[k] = byKey[k].length; });
    var best = { val: -1, picks: [] }, picks = [], steps = 0, LIMIT = lim || 20000;
    function score(realUsed, jUsed) { return realUsed * 10 + jUsed * 10 - jUsed; }
    function dfs(i, realUsed, jLeft, realLeft) {
      if (++steps > LIMIT) return;
      var v = score(realUsed, jokers.length - jLeft);
      if (v > best.val) best = { val: v, picks: picks.slice() };
      if ((realUsed + realLeft + jLeft) * 10 <= best.val) return;
      for (var k = i; k < cands.length; k++) {
        var cd = cands[k];
        if (cd.j > jLeft) continue;
        var ok = true;
        for (var q = 0; q < cd.keys.length; q++) if (!cnt[cd.keys[q]]) { ok = false; break; }
        if (!ok) continue;
        cd.keys.forEach(function (key) { cnt[key]--; });
        picks.push(cd);
        dfs(k, realUsed + cd.keys.length, jLeft - cd.j, realLeft - cd.keys.length);
        picks.pop();
        cd.keys.forEach(function (key) { cnt[key]++; });
      }
    }
    dfs(0, 0, jokers.length, real.length);
    var pool = {}; Object.keys(byKey).forEach(function (k) { pool[k] = byKey[k].slice(); });
    var jpool = jokers.slice();
    var melds = best.picks.map(function (cd) {
      var ts = cd.keys.map(function (k) { return pool[k].shift(); });
      for (var x = 0; x < cd.j; x++) ts.push(jpool.shift());
      return checkRun(ts) ? orderRun(ts) : ts;
    });
    // kalan okeyleri perlere ekle (seri uzar)
    while (jpool.length) {
      var jt = jpool[0], mi = melds.findIndex(function (m) { return checkMeld(m.concat([jt])); });
      if (mi < 0) break;
      melds[mi] = checkRun(melds[mi].concat([jt])) ? orderRun(melds[mi].concat([jt])) : melds[mi].concat([jt]);
      jpool.shift();
    }
    var used = {}; melds.forEach(function (m) { m.forEach(function (t) { used[t.id] = 1; }); });
    var rest = hand.filter(function (t) { return !used[t.id]; });
    return { melds: melds, covered: hand.length - rest.length, rest: rest };
  }
  function bestPairs(hand) {
    var jokers = hand.filter(function (t) { return t.joker; }), real = hand.filter(function (t) { return !t.joker; });
    var byKey = {}, pairs = [], single = [];
    real.forEach(function (t) { var k = t.c + t.n; (byKey[k] = byKey[k] || []).push(t); });
    Object.keys(byKey).forEach(function (k) {
      var a = byKey[k].slice();
      while (a.length >= 2) pairs.push([a.shift(), a.shift()]);
      if (a.length) single.push(a[0]);
    });
    single.sort(function (a, b) { return b.n - a.n; });
    var js = jokers.slice();
    while (js.length && single.length) pairs.push([single.shift(), js.shift()]);
    if (js.length >= 2) pairs.push([js.shift(), js.shift()]);
    var used = {}; pairs.forEach(function (p) { p.forEach(function (t) { used[t.id] = 1; }); });
    return { pairs: pairs, rest: hand.filter(function (t) { return !used[t.id]; }) };
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
    var starter = (dealer + 1) % 4, hands = [[], [], [], []];
    for (var p = 0; p < 4; p++) {
      var seat = (starter + p) % 4;
      hands[seat] = deck.splice(0, p === 0 ? 15 : 14);
    }
    var byId = {}; tiles.forEach(function (t) { byId[t.id] = t; });
    return {
      seed: seed, opts: opts(o), byId: byId, indicator: ind, okey: okey, deck: deck, hands: hands, discards: [[], [], [], []],
      sideHist: [[], [], [], []], drawn: [0, 0, 0, 0], turn: starter, dealer: dealer, starter: starter, phase: 'play',
      shown: -1, finishTile: null, over: false, result: null, turnCount: 0
    };
  }
  function removeFrom(arr, id) { var i = arr.findIndex(function (t) { return t.id === id; }); return i >= 0 ? arr.splice(i, 1)[0] : null; }
  function sideTile(st, p) { var d = st.discards[(p + 3) % 4]; return d.length ? d[d.length - 1] : null; }
  function err(msg) { return { ok: false, error: msg }; }
  function showTile(st, p) {
    var ind = st.indicator;
    return st.hands[p].find(function (t) { return !t.fake && !t.joker && t.c === ind.c && t.n === ind.n; }) || null;
  }
  function canShow(st, p) {
    if (st.over || st.shown >= 0 || st.turn !== p || st.drawn[p] > 0 || (st.opts && !st.opts.show)) return false;
    if (p === st.starter && st.turnCount > 0) return false;
    if (p !== st.starter && st.phase !== 'draw') return false;
    return !!showTile(st, p);
  }
  function show(st, p) {
    if (!canShow(st, p)) return err('cant_show');
    st.shown = p;
    return { ok: true, tile: showTile(st, p) };
  }
  function draw(st, p, fromSide) {
    if (st.over || st.turn !== p) return err('not_your_turn');
    if (st.phase !== 'draw') return err('already_drawn');
    var t;
    if (fromSide) {
      t = sideTile(st, p); if (!t) return err('no_side');
      st.discards[(p + 3) % 4].pop(); st.sideHist[p].push(t);
    } else {
      if (!st.deck.length) return err('deck_empty');
      t = st.deck.shift();
    }
    st.hands[p].push(t); st.drawn[p]++; st.phase = 'play';
    return { ok: true, tile: t };
  }
  // Deste bitti ve oyuncu yandakini de almıyor: el berabere
  function pass(st, p) {
    if (st.over || st.turn !== p || st.phase !== 'draw') return err('not_your_turn');
    if (st.deck.length) return err('deck_not_empty');
    endHand(st, -1, null);
    return { ok: true, end: true };
  }
  function discard(st, p, id) {
    if (st.over || st.turn !== p) return err('not_your_turn');
    if (st.phase !== 'play') return err('need_draw');
    var t = removeFrom(st.hands[p], id); if (!t) return err('no_tile');
    st.discards[p].push(t);
    st.turn = (p + 1) % 4; st.phase = 'draw'; st.turnCount++;
    return { ok: true, tile: t };
  }
  function finish(st, p, id) {
    if (st.over || st.turn !== p) return err('not_your_turn');
    if (st.phase !== 'play') return err('need_draw');
    var t = st.hands[p].find(function (x) { return x.id === id; }); if (!t) return err('no_tile');
    var rest = st.hands[p].filter(function (x) { return x.id !== id; }), kind = finishKind(rest, st.opts);
    if (!kind) return err('not_finished');
    removeFrom(st.hands[p], id); st.finishTile = t;
    endHand(st, p, { kind: kind, okey: !!t.joker });
    return { ok: true, tile: t, kind: kind, okey: !!t.joker, end: true };
  }
  // Atılınca eli bitiren taş (okey öncelikli; çift > seri)
  function findFinish(hand, o) {
    var order = hand.slice().sort(function (a, b) { return (b.joker - a.joker); });
    var best = null;
    for (var i = 0; i < order.length; i++) {
      var rest = hand.filter(function (x) { return x.id !== order[i].id; }), k = finishKind(rest, o);
      if (!k) continue;
      var pts = finishPoints(k, !!order[i].joker);
      if (!best || pts > best.pts) best = { id: order[i].id, kind: k, okey: !!order[i].joker, pts: pts };
    }
    return best;
  }
  function finishPoints(kind, okey) { return kind === 'cift' ? (okey ? PTS.ciftOkey : PTS.cift) : (okey ? PTS.okey : PTS.normal); }
  function endHand(st, winner, info) {
    var pts = [0, 0, 0, 0];
    if (winner >= 0) { var v = finishPoints(info.kind, info.okey); for (var q = 0; q < 4; q++) if (q !== winner) pts[q] -= v; }
    if (st.shown >= 0) for (var q2 = 0; q2 < 4; q2++) if (q2 !== st.shown) pts[q2] -= PTS.show;
    st.over = true; st.phase = 'over';
    st.result = { winner: winner, kind: info ? info.kind : null, okey: info ? info.okey : false, shown: st.shown, points: pts };
  }

  // ---------- botlar ----------
  // El değeri: perdeki taşlar + yarım perler (yan yana / aynı sayı) ya da çift yolu
  function handScore(hand, o) {
    var ba = bestArrange(hand, 6000), rest = ba.rest.filter(function (t) { return !t.joker; }), near = 0, used = {};
    for (var i = 0; i < rest.length; i++) for (var j = i + 1; j < rest.length; j++) {
      var a = rest[i], b = rest[j];
      if (used[a.id] || used[b.id]) continue;
      var close = (a.c === b.c && Math.abs(a.n - b.n) <= 2 && a.n !== b.n) || (a.n === b.n && a.c !== b.c) || (a.c === b.c && ((a.n === 1 && b.n >= 12) || (b.n === 1 && a.n >= 12)));
      if (close) { near++; used[a.id] = used[b.id] = 1; }
    }
    var seri = ba.covered + near * 0.45;
    var bp = bestPairs(hand), np = bp.pairs.length, cift = o && o.cift === false ? 0 : np >= 5 ? np * 2 - 0.5 : np >= 4 ? np * 1.6 : 0;
    return Math.max(seri, cift);
  }
  // Bir sonraki oyuncu bu taşı işine yarar diye alabilir mi? (yalnızca açık bilgi: aldığı yan taşlar)
  function danger(st, p, t) {
    var nx = (p + 1) % 4, d = 0;
    st.sideHist[nx].forEach(function (s) {
      if (s.joker) return;
      if (s.c === t.c && Math.abs(s.n - t.n) <= 2) d += 0.6;
      if (s.n === t.n && s.c !== t.c) d += 0.6;
    });
    return d;
  }
  function chooseDiscard(st, p, level) {
    var hand = st.hands[p], opts = [];
    hand.forEach(function (t) {
      if (t.joker) return;
      var rest = hand.filter(function (x) { return x.id !== t.id; });
      var v = handScore(rest, st.opts);
      if (level === 'hard') v -= danger(st, p, t);
      opts.push({ id: t.id, v: v, n: t.n });
    });
    if (!opts.length) return hand[0].id;
    opts.sort(function (a, b) { return (b.v - a.v) || (b.n - a.n); });
    if (level === 'easy') { var k = Math.min(opts.length - 1, Math.floor(Math.random() * 3)); return opts[k].id; }
    return opts[0].id;
  }
  function botWantsSide(st, p, level) {
    var s = sideTile(st, p); if (!s) return false;
    var hand = st.hands[p], withS = hand.concat([s]);
    if (findFinish(withS, st.opts)) return true;
    if (s.joker) return true;
    if (level === 'easy') return false;
    var cur = handScore(hand, st.opts), best = -1;
    withS.forEach(function (t) {
      if (t.joker || t.id === s.id) return;
      var v = handScore(withS.filter(function (x) { return x.id !== t.id; }), st.opts);
      if (v > best) best = v;
    });
    return best >= cur + (level === 'hard' ? 0.8 : 1);
  }
  // ---------- ipucu ----------
  function hint(st, p) {
    if (st.over || st.turn !== p) return null;
    if (canShow(st, p)) return { a: 'show' };
    if (st.phase === 'draw') {
      if (sideTile(st, p) && botWantsSide(st, p, 'normal')) return { a: 'side', id: sideTile(st, p).id };
      return st.deck.length ? { a: 'deck' } : { a: 'pass' };
    }
    var f = findFinish(st.hands[p], st.opts);
    if (f) return { a: 'finish', id: f.id, kind: f.kind, okey: f.okey };
    return { a: 'discard', id: chooseDiscard(st, p, 'normal') };
  }

  return {
    COLORS: COLORS, PTS: PTS, DEFAULTS: DEFAULTS, rng: rng, makeTiles: makeTiles, okeyOf: okeyOf,
    checkRun: checkRun, checkSet: checkSet, checkMeld: checkMeld, checkPair: checkPair, orderRun: orderRun,
    arrangeAll: arrangeAll, sevenPairs: sevenPairs, finishKind: finishKind, bestArrange: bestArrange, bestPairs: bestPairs,
    newHand: newHand, sideTile: sideTile, canShow: canShow, showTile: showTile, show: show, draw: draw, pass: pass,
    discard: discard, finish: finish, findFinish: findFinish, finishPoints: finishPoints, endHand: endHand,
    handScore: handScore, chooseDiscard: chooseDiscard, botWantsSide: botWantsSide, hint: hint
  };
});
