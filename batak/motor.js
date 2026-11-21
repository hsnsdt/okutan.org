/* Batak — kural motoru (arayüzden bağımsız; tarayıcıda window.BatakKural, Node'da module.exports)
 *
 * Kurallar (yaygın İhaleli Batak):
 *  - 52 kart, 4 oyuncu, herkese 13 kart. Sıra sağa döner (koltuk + 1). Her el dağıtan bir sağa kayar.
 *  - İhale: dağıtanın sağındaki oyuncudan başlar. Herkes ya önceki en yüksek ihaleden fazlasını söyler ya da pas der;
 *    pas diyen o elde bir daha ihaleye girmez. En az ihale opts.minBid (varsayılan 4), en çok 13.
 *    Tek kişi kalınca ihale onundur. Herkes pas derse ihale en az değerden dağıtana kalır.
 *  - İhaleyi alan kozu seçer ve ilk kartı o atar.
 *  - Yerdeki renkten kartın varsa o renkten atmak zorundasın; yerdeki en büyük kart o renktense ve geçebiliyorsan
 *    büyüğünü atmak zorundasın (opts.mustRaise). O renk yoksa koz atmak zorundasın; yerde koz varsa ve geçebiliyorsan
 *    büyüğünü atarsın. Koz da yoksa istediğin kartı atarsın.
 *  - Koz açılmadan (biri koz atmadan) kozla başlanmaz; elinde yalnızca koz varsa başlanır (opts.kozBreak).
 *  - El: kozu atan varsa en büyük koz, yoksa yerdeki rengin en büyüğü alır; eli alan sıradaki ilk kartı atar.
 *  - Puan: ihaleyi tutturan aldığı el sayısı kadar alır, tutturamayan ihale kadar kaybeder ("batar");
 *    diğer oyuncular aldıkları el sayısı kadar alır.
 *
 * Kart: { id, s, r }  s: 'S' maça · 'H' kupa · 'D' karo · 'C' sinek · r: 2–14 (11 Vale, 12 Kız, 13 Papaz, 14 As)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BatakKural = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUITS = ['S', 'H', 'C', 'D']; // ekranda renkler sırayla: maça, kupa, sinek, karo (siyah-kırmızı)
  var DEFAULTS = { minBid: 4, kozBreak: true, mustRaise: true };
  function opts(o) {
    var r = {};
    r.minBid = o && +o.minBid >= 1 && +o.minBid <= 13 ? Math.floor(+o.minBid) : DEFAULTS.minBid;
    r.kozBreak = o && o.kozBreak != null ? !!o.kozBreak : DEFAULTS.kozBreak;
    r.mustRaise = o && o.mustRaise != null ? !!o.mustRaise : DEFAULTS.mustRaise;
    return r;
  }

  // ---------- rastgelelik (mulberry32) ----------
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function card(id) { return { id: id, s: ['S', 'H', 'D', 'C'][Math.floor(id / 13)], r: (id % 13) + 2 }; }
  function cardId(s, r) { return ['S', 'H', 'D', 'C'].indexOf(s) * 13 + (r - 2); }
  function makeDeck() { var d = []; for (var i = 0; i < 52; i++) d.push(card(i)); return d; }
  function sortHand(h, trump) {
    var ord = SUITS.slice();
    if (trump) { ord.splice(ord.indexOf(trump), 1); ord.unshift(trump); }
    return h.slice().sort(function (a, b) { return (ord.indexOf(a.s) - ord.indexOf(b.s)) || (b.r - a.r); });
  }

  // ---------- el başlat ----------
  function newHand(seed, dealer, o) {
    var R = rng(seed), deck = makeDeck();
    for (var i = deck.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    var hands = [[], [], [], []];
    for (var k = 0; k < 52; k++) hands[(dealer + 1 + k) % 4].push(deck[k]);
    var byId = {}; deck.forEach(function (c) { byId[c.id] = c; });
    return {
      seed: seed, dealer: dealer, opts: opts(o), byId: byId, hands: hands.map(function (h) { return sortHand(h); }),
      phase: 'bid', turn: (dealer + 1) % 4, bids: [null, null, null, null], high: null, bidder: -1, bid: 0, forced: false,
      trump: null, trick: [], leader: -1, tricks: [0, 0, 0, 0], history: [], lastTrick: null, trumpBroken: false,
      played: [], voids: [{}, {}, {}, {}], over: false, result: null
    };
  }

  // ---------- ihale ----------
  function minBidFor(st) { return st.high ? st.high.n + 1 : st.opts.minBid; }
  function bidOptions(st, p) {
    if (st.phase !== 'bid' || st.turn !== p) return null;
    return { min: minBidFor(st), max: 13 };
  }
  function nextBidder(st, p) {
    for (var k = 1; k <= 4; k++) { var q = (p + k) % 4; if (st.bids[q] !== 0) return q; }
    return -1;
  }
  // n = 0: pas
  function bid(st, p, n) {
    if (st.phase !== 'bid') return { ok: false, error: 'not_bidding' };
    if (st.turn !== p) return { ok: false, error: 'not_your_turn' };
    n = Math.floor(+n || 0);
    if (n !== 0 && (n < minBidFor(st) || n > 13)) return { ok: false, error: 'bad_bid' };
    st.bids[p] = n;
    if (n > 0) st.high = { p: p, n: n };
    var passed = st.bids.filter(function (b) { return b === 0; }).length;
    var acted = st.bids.filter(function (b) { return b !== null; }).length;
    if (st.high && (st.high.n === 13 || (passed === 3 && acted === 4))) return closeBid(st, st.high.p, st.high.n, false);
    if (!st.high && passed === 4) return closeBid(st, st.dealer, st.opts.minBid, true);
    st.turn = nextBidder(st, p);
    return { ok: true, done: false };
  }
  function closeBid(st, p, n, forced) {
    st.bidder = p; st.bid = n; st.forced = forced; st.phase = 'trump'; st.turn = p;
    return { ok: true, done: true, bidder: p, bid: n, forced: forced };
  }
  function chooseTrump(st, p, s) {
    if (st.phase !== 'trump') return { ok: false, error: 'not_trump_phase' };
    if (st.turn !== p) return { ok: false, error: 'not_your_turn' };
    if (SUITS.indexOf(s) < 0) return { ok: false, error: 'bad_suit' };
    st.trump = s; st.phase = 'play'; st.leader = p; st.turn = p;
    st.hands = st.hands.map(function (h) { return sortHand(h, s); });
    return { ok: true };
  }

  // ---------- oyun ----------
  function beats(c, w, led, trump) {
    if (c.s === w.s) return c.r > w.r;
    return c.s === trump;
  }
  function winnerIdx(trick, trump) {
    var led = trick[0].c.s, b = 0;
    for (var i = 1; i < trick.length; i++) if (beats(trick[i].c, trick[b].c, led, trump)) b = i;
    return b;
  }
  function legalFor(hand, trick, trump, trumpBroken, o) {
    if (!trick.length) {
      if (o.kozBreak && !trumpBroken) {
        var nt = hand.filter(function (c) { return c.s !== trump; });
        if (nt.length) return nt;
      }
      return hand.slice();
    }
    var led = trick[0].c.s, w = trick[winnerIdx(trick, trump)].c;
    var follow = hand.filter(function (c) { return c.s === led; });
    if (follow.length) {
      if (o.mustRaise && w.s === led) { var hi = follow.filter(function (c) { return c.r > w.r; }); if (hi.length) return hi; }
      return follow;
    }
    var tr = hand.filter(function (c) { return c.s === trump; });
    if (tr.length) {
      if (o.mustRaise && w.s === trump) { var ht = tr.filter(function (c) { return c.r > w.r; }); if (ht.length) return ht; }
      return tr;
    }
    return hand.slice();
  }
  function legal(st, p) {
    if (st.phase !== 'play' || st.turn !== p) return [];
    return legalFor(st.hands[p], st.trick, st.trump, st.trumpBroken, st.opts);
  }
  function play(st, p, id) {
    if (st.phase !== 'play') return { ok: false, error: 'not_playing' };
    if (st.turn !== p) return { ok: false, error: 'not_your_turn' };
    var h = st.hands[p], i = -1;
    for (var k = 0; k < h.length; k++) if (h[k].id === id) { i = k; break; }
    if (i < 0) return { ok: false, error: 'no_card' };
    var c = h[i];
    if (!legal(st, p).some(function (x) { return x.id === id; })) {
      var why = 'must_follow';
      if (!st.trick.length) why = 'koz_closed';
      else {
        var led = st.trick[0].c.s;
        if (h.some(function (x) { return x.s === led; })) why = c.s === led ? 'must_raise' : 'must_follow';
        else why = c.s === st.trump ? 'must_raise_trump' : 'must_trump';
      }
      return { ok: false, error: why };
    }
    if (st.trick.length) { var ld = st.trick[0].c.s; if (c.s !== ld) { st.voids[p][ld] = true; if (c.s !== st.trump) st.voids[p][st.trump] = true; } }
    h.splice(i, 1);
    st.trick.push({ p: p, c: c }); st.played.push(c.id);
    if (c.s === st.trump) st.trumpBroken = true;
    if (st.trick.length < 4) { st.turn = (p + 1) % 4; return { ok: true, card: c, done: false }; }
    var wi = winnerIdx(st.trick, st.trump), winner = st.trick[wi].p;
    st.tricks[winner]++;
    st.lastTrick = { cards: st.trick, winner: winner, leader: st.trick[0].p };
    st.history.push(st.lastTrick);
    st.trick = []; st.leader = winner; st.turn = winner;
    if (st.history.length === 13) endHand(st);
    return { ok: true, card: c, done: true, winner: winner, over: st.over };
  }
  function handPoints(tricks, bidder, bidN) {
    return tricks.map(function (t, i) { return i === bidder ? (t >= bidN ? t : -bidN) : t; });
  }
  function endHand(st) {
    st.phase = 'over'; st.over = true; st.turn = -1;
    var made = st.tricks[st.bidder] >= st.bid;
    st.result = { bidder: st.bidder, bid: st.bid, trump: st.trump, tricks: st.tricks.slice(), made: made, forced: st.forced,
      points: handPoints(st.tricks, st.bidder, st.bid) };
    return st.result;
  }

  // ---------- botlar ----------
  // El gücü: koz s iken kaç el alınacağının kaba tahmini
  function evalHand(hand, trump) {
    var by = { S: [], H: [], D: [], C: [] };
    hand.forEach(function (c) { by[c.s].push(c.r); });
    var tricks = 0, tl = trump ? by[trump].length : 0;
    SUITS.forEach(function (s) {
      var rs = by[s].sort(function (a, b) { return b - a; }), len = rs.length, has = function (r) { return rs.indexOf(r) >= 0; };
      if (s === trump) {
        var hon = (has(14) ? 1 : 0) + (has(13) ? (len >= 2 ? 0.9 : 0.3) : 0) + (has(12) ? (len >= 3 ? 0.7 : 0.2) : 0) + (has(11) ? (len >= 4 ? 0.5 : 0.1) : 0);
        tricks += Math.min(len, hon + Math.max(0, len - 3) * 0.9);
      } else {
        if (has(14)) tricks += len <= 5 ? 1 : 0.7;
        if (has(13)) tricks += len >= 2 ? (has(14) ? 0.85 : 0.65) : 0.15;
        if (has(12) && len >= 3) tricks += (has(14) || has(13)) ? 0.45 : 0.25;
        if (trump && tl >= 3) tricks += Math.min(Math.max(0, tl - 2) * 0.5, len === 0 ? 1.1 : len === 1 ? 0.6 : len === 2 ? 0.25 : 0);
      }
    });
    return tricks;
  }
  function bestTrump(hand) {
    var best = null, bv = -1;
    SUITS.forEach(function (s) {
      var v = evalHand(hand, s) + hand.filter(function (c) { return c.s === s; }).length * 0.01;
      if (v > bv) { bv = v; best = s; }
    });
    return { s: best, v: bv };
  }
  function botBid(st, p, lv, R) {
    var o = bidOptions(st, p); if (!o) return 0;
    var est = bestTrump(st.hands[p]).v;
    if (lv === 'easy') est += ((R || Math.random)() - 0.5) * 2.2 - 0.3;
    else if (lv === 'hard') est += 0.6;
    else est += 0.3;
    var want = Math.floor(est + 0.25);
    return want >= o.min ? o.min : 0;
  }
  function botTrump(st, p) { return bestTrump(st.hands[p]).s; }
  function hasId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return true; return false; }
  // Bu kart, rengindeki en büyük oynanmamış kart mı (elimdekiler hariç)?
  function isMaster(st, p, c) {
    for (var r = c.r + 1; r <= 14; r++) {
      var id = cardId(c.s, r);
      if (st.played.indexOf(id) < 0 && !hasId(st.hands[p], id)) return false;
    }
    return true;
  }
  function outsideCount(st, p, s) {
    var n = 0;
    for (var r = 2; r <= 14; r++) { var id = cardId(s, r); if (st.played.indexOf(id) < 0 && !hasId(st.hands[p], id)) n++; }
    return n;
  }
  function lowVal(c, trump) { return c.r + (c.s === trump ? 20 : 0); }
  function lowest(cs, trump) { return cs.slice().sort(function (a, b) { return lowVal(a, trump) - lowVal(b, trump); })[0]; }
  function botPlay(st, p, lv, R) {
    var L = legal(st, p); if (!L.length) return null;
    if (L.length === 1) return L[0].id;
    var tr = st.trump, rnd = R || Math.random;
    if (lv === 'easy' && rnd() < 0.35) return L[Math.floor(rnd() * L.length)].id;
    var smart = lv !== 'easy';
    var master = function (c) { return smart ? isMaster(st, p, c) : c.r === 14; };
    if (!st.trick.length) {
      // koz çekme: ihaleyi alan, en büyük koz elindeyse ve dışarıda koz varsa kozu çeker
      var trumps = L.filter(function (c) { return c.s === tr; });
      if (smart && p === st.bidder && trumps.length && outsideCount(st, p, tr) > 0) {
        var mt = trumps.filter(master);
        if (mt.length) return mt[0].id;
      }
      // başkalarının bitmiş olduğu (koz atabileceği) renkleri zor bot açmaz
      var risky = function (s) {
        if (lv !== 'hard' || s === tr) return false;
        for (var q = 0; q < 4; q++) if (q !== p && st.voids[q][s] && !st.voids[q][tr]) return true;
        return false;
      };
      var ms = L.filter(function (c) { return c.s !== tr && master(c) && !risky(c.s); });
      if (ms.length) return ms.sort(function (a, b) { return b.r - a.r; })[0].id;
      var side = L.filter(function (c) { return c.s !== tr && !risky(c.s); });
      if (!side.length) side = L.filter(function (c) { return c.s !== tr; });
      if (!side.length) return lowest(L, tr).id;
      // en uzun yan renkten küçük kart
      var cnt = {}; st.hands[p].forEach(function (c) { cnt[c.s] = (cnt[c.s] || 0) + 1; });
      side.sort(function (a, b) { return (cnt[b.s] - cnt[a.s]) || (a.r - b.r); });
      return side[0].id;
    }
    var led = st.trick[0].c.s, w = st.trick[winnerIdx(st.trick, tr)].c;
    var win = L.filter(function (c) { return beats(c, w, led, tr); }).sort(function (a, b) { return lowVal(a, tr) - lowVal(b, tr); });
    if (!win.length) return lowest(L, tr).id;
    var last = st.trick.length === 3;
    if (last) return win[0].id;
    // sonra oynayacaklar geçebilir mi?
    var safe = win.filter(function (c) {
      if (c.s === tr) {
        if (led === tr) return master(c);
        if (!smart) return true;
        // sonrakilerden biri yerdeki renkten bitmişse daha büyük kozla geçebilir
        for (var k = st.trick.length + 1; k < 4; k++) {
          var q = (st.trick[0].p + k) % 4;
          if (st.voids[q][led] && !st.voids[q][tr] && !master(c)) return false;
        }
        return true;
      }
      if (!master(c)) return false;
      if (lv !== 'hard') return true;
      for (var k2 = st.trick.length + 1; k2 < 4; k2++) {
        var q2 = (st.trick[0].p + k2) % 4;
        if (st.voids[q2][led] && !st.voids[q2][tr]) return false;
      }
      return true;
    });
    if (safe.length) return safe[0].id;
    return lowest(L, tr).id;
  }
  // İpucu: oyuncunun yerine zor bot ne yapardı
  function hint(st, p) {
    if (st.over || st.turn !== p) return null;
    if (st.phase === 'bid') {
      var o = bidOptions(st, p), bt = bestTrump(st.hands[p]), est = bt.v + 0.6, want = Math.floor(est + 0.25);
      return { a: 'bid', n: want >= o.min ? o.min : 0, est: Math.max(0, Math.round(bt.v)), trump: bt.s };
    }
    if (st.phase === 'trump') return { a: 'trump', s: botTrump(st, p) };
    if (st.phase === 'play') return { a: 'play', id: botPlay(st, p, 'hard') };
    return null;
  }

  return {
    SUITS: SUITS, DEFAULTS: DEFAULTS, opts: opts, rng: rng, card: card, cardId: cardId, makeDeck: makeDeck, sortHand: sortHand,
    newHand: newHand, bidOptions: bidOptions, bid: bid, chooseTrump: chooseTrump, beats: beats, winnerIdx: winnerIdx,
    legalFor: legalFor, legal: legal, play: play, handPoints: handPoints, endHand: endHand,
    evalHand: evalHand, bestTrump: bestTrump, botBid: botBid, botTrump: botTrump, botPlay: botPlay, isMaster: isMaster, hint: hint
  };
});
