/* King — kural motoru (arayüzden bağımsız; tarayıcıda window.KingKural, Node'da module.exports)
 *
 * Kurallar (yaygın Türk King'i):
 *  - 52 kart, 4 oyuncu, herkese 13 kart. Sıra sağa döner (koltuk + 1).
 *  - Her elde sırası gelen oyuncu (seçen) oyunu seçer ve ilk kartı o atar. Tam oyunda 20 el: her oyuncu 5 kez seçer,
 *    bunların 2'si koz, 3'ü ceza olur; her ceza bütün oyunda en çok 2 kez oynanır. Kısa oyunda 10 el: her ceza 1 kez, herkes 1 koz.
 *  - Cezalar: El almaz (el başı −50), Kupa almaz (kupa başı −30), Erkek almaz (papaz ve vale başı −60),
 *    Kız almaz (kız başı −100), Son iki (son iki elin her biri −180), Rıfkı (kupa papazı −320). Koz: alınan her el +50.
 *    Toplam ceza ile toplam koz puanı eşittir; oyunun puan toplamı sıfırdır.
 *  - Yerdeki renkten kartın varsa o renkten atarsın. Koz oyununda o renk yoksa koz atmak zorundasın (varsa).
 *  - opts.strict (varsayılan açık): ceza oyununda yerdeki renk yoksa elindeki ceza kartını atmak zorundasın (Kupa almazda kupa,
 *    Erkek almazda papaz/vale, Kız almazda kız, Rıfkıda kupa papazı); yerde o rengin daha büyüğü varken elindeki ceza kartı
 *    (kız, papaz/vale, rıfkı) o renkten atılmak zorundadır; Kupa almaz ve Rıfkıda kupa açılmadan kupayla başlanmaz.
 *  - opts.kozBreak (varsayılan açık): koz oyununda koz açılmadan kozla başlanmaz (elinde yalnız koz varsa olur).
 *  - Cezalı kartların hepsi çıkınca (bütün kupalar, papaz/valeler, kızlar ya da rıfkı) el erken biter.
 *
 * Kart: { id, s, r }  s: 'S' maça · 'H' kupa · 'D' karo · 'C' sinek · r: 2–14 (11 Vale, 12 Kız, 13 Papaz, 14 As)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KingKural = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUITS = ['S', 'H', 'C', 'D'];
  var CEZA = ['el', 'kupa', 'erkek', 'kiz', 'son', 'rifki'];
  var CONTRACTS = {
    el: { ad: 'El almaz', per: -50, birim: 'el', max: 13 },
    kupa: { ad: 'Kupa almaz', per: -30, birim: 'kupa', max: 13 },
    erkek: { ad: 'Erkek almaz', per: -60, birim: 'erkek', max: 8 },
    kiz: { ad: 'Kız almaz', per: -100, birim: 'kız', max: 4 },
    son: { ad: 'Son iki', per: -180, birim: 'el', max: 2 },
    rifki: { ad: 'Rıfkı', per: -320, birim: 'rıfkı', max: 1 },
    koz: { ad: 'Koz', per: 50, birim: 'el', max: 13 }
  };
  var DEFAULTS = { strict: true, kozBreak: true };
  function opts(o) {
    return { strict: o && o.strict != null ? !!o.strict : true, kozBreak: o && o.kozBreak != null ? !!o.kozBreak : true };
  }
  var KH = 1 * 13 + (13 - 2); // kupa papazı (rıfkı)

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
  function sortHand(h, trump) {
    var ord = SUITS.slice();
    if (trump) { ord.splice(ord.indexOf(trump), 1); ord.unshift(trump); }
    return h.slice().sort(function (a, b) { return (ord.indexOf(a.s) - ord.indexOf(b.s)) || (b.r - a.r); });
  }

  // ---------- oyun planı: kim ne zaman seçer, hangi oyunlar kaldı ----------
  // mode: 'full' (20 el) | 'short' (10 el) · first: ilk eli seçen koltuk
  function newPlan(mode, first) {
    var short = mode === 'short', used = {};
    CEZA.forEach(function (k) { used[k] = 0; });
    return { mode: short ? 'short' : 'full', first: first || 0, hands: short ? 10 : 20, cezaMax: short ? 1 : 2, kozPer: short ? 1 : 2,
      used: used, kozUsed: [0, 0, 0, 0], log: [] };
  }
  function chooserAt(plan, i) { return (plan.first + i) % 4; }
  function turnsLeft(plan, p, i) { var n = 0; for (var j = i; j < plan.hands; j++) if (chooserAt(plan, j) === p) n++; return n; }
  // i. eli seçen oyuncunun seçebileceği oyunlar
  function allowed(plan, i) {
    var p = chooserAt(plan, i), left = turnsLeft(plan, p, i), kozNeed = plan.kozPer - plan.kozUsed[p], out = [];
    if (left - kozNeed > 0) CEZA.forEach(function (k) { if (plan.used[k] < plan.cezaMax) out.push(k); });
    if (kozNeed > 0) out.push('koz');
    return out;
  }
  function record(plan, i, k, extra) {
    var p = chooserAt(plan, i);
    if (allowed(plan, i).indexOf(k) < 0) return false;
    if (k === 'koz') plan.kozUsed[p]++; else plan.used[k]++;
    plan.log.push({ i: i, p: p, k: k, trump: extra && extra.trump || null, points: extra && extra.points || null });
    return true;
  }

  // ---------- el ----------
  function newHand(seed, chooser, o) {
    var R = rng(seed), deck = [];
    for (var i = 0; i < 52; i++) deck.push(card(i));
    for (var k = deck.length - 1; k > 0; k--) { var j = Math.floor(R() * (k + 1)); var t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
    var hands = [[], [], [], []];
    for (var n = 0; n < 52; n++) hands[(chooser + n) % 4].push(deck[n]);
    return {
      seed: seed, chooser: chooser, opts: opts(o), hands: hands.map(function (h) { return sortHand(h); }),
      phase: 'choose', turn: chooser, contract: null, trump: null, trick: [], tricks: [0, 0, 0, 0], taken: [0, 0, 0, 0],
      history: [], lastTrick: null, heartsBroken: false, trumpBroken: false, played: [], voids: [{}, {}, {}, {}],
      over: false, early: false, result: null
    };
  }
  function choose(st, p, k, allowedList) {
    if (st.phase !== 'choose') return { ok: false, error: 'not_choosing' };
    if (st.turn !== p) return { ok: false, error: 'not_your_turn' };
    if (!CONTRACTS[k] || (allowedList && allowedList.indexOf(k) < 0)) return { ok: false, error: 'not_allowed' };
    st.contract = k;
    if (k === 'koz') st.phase = 'trump';
    else st.phase = 'play';
    return { ok: true };
  }
  function chooseTrump(st, p, s) {
    if (st.phase !== 'trump') return { ok: false, error: 'not_trump_phase' };
    if (st.turn !== p) return { ok: false, error: 'not_your_turn' };
    if (SUITS.indexOf(s) < 0) return { ok: false, error: 'bad_suit' };
    st.trump = s; st.phase = 'play';
    st.hands = st.hands.map(function (h) { return sortHand(h, s); });
    return { ok: true };
  }

  // ---------- kartlar ----------
  // Kartın bu oyunda taşıdığı ceza birimi (el almaz ve son iki için 0: ceza elin kendisidir)
  function danger(k, c) {
    if (k === 'kupa') return c.s === 'H' ? 1 : 0;
    if (k === 'erkek') return c.r === 13 || c.r === 11 ? 1 : 0;
    if (k === 'kiz') return c.r === 12 ? 1 : 0;
    if (k === 'rifki') return c.id === KH ? 1 : 0;
    return 0;
  }
  function trickUnits(k, cards, idx) {
    if (k === 'el' || k === 'koz') return 1;
    if (k === 'son') return idx >= 11 ? 1 : 0;
    return cards.reduce(function (a, t) { return a + danger(k, t.c); }, 0);
  }
  function beats(c, w, trump) {
    if (c.s === w.s) return c.r > w.r;
    return !!trump && c.s === trump;
  }
  function winnerIdx(trick, trump) {
    var b = 0;
    for (var i = 1; i < trick.length; i++) if (beats(trick[i].c, trick[b].c, trump)) b = i;
    return b;
  }
  function legalFor(hand, trick, k, trump, flags, o) {
    o = opts(o); flags = flags || {};
    if (!trick.length) {
      var pool = hand;
      if (o.strict && (k === 'kupa' || k === 'rifki') && !flags.heartsBroken) { var nh = hand.filter(function (c) { return c.s !== 'H'; }); if (nh.length) pool = nh; }
      if (k === 'koz' && o.kozBreak && !flags.trumpBroken) { var nt = hand.filter(function (c) { return c.s !== trump; }); if (nt.length) pool = nt; }
      return pool.slice();
    }
    var led = trick[0].c.s, w = trick[winnerIdx(trick, k === 'koz' ? trump : null)].c;
    var follow = hand.filter(function (c) { return c.s === led; });
    if (follow.length) {
      if (o.strict && (k === 'kiz' || k === 'erkek' || k === 'rifki') && w.s === led) {
        var burn = follow.filter(function (c) { return danger(k, c) && c.r < w.r; });
        if (burn.length) return burn;
      }
      return follow;
    }
    if (k === 'koz') { var tr = hand.filter(function (c) { return c.s === trump; }); if (tr.length) return tr; }
    else if (o.strict) { var d = hand.filter(function (c) { return danger(k, c); }); if (d.length) return d; }
    return hand.slice();
  }
  function legal(st, p) {
    if (st.phase !== 'play' || st.turn !== p) return [];
    return legalFor(st.hands[p], st.trick, st.contract, st.trump, st, st.opts);
  }
  function whyIllegal(st, p, c) {
    var o = st.opts, k = st.contract;
    if (!st.trick.length) return k === 'koz' ? 'koz_closed' : 'kupa_closed';
    var led = st.trick[0].c.s, h = st.hands[p];
    if (h.some(function (x) { return x.s === led; })) return c.s === led ? 'must_burn' : 'must_follow';
    if (k === 'koz') return 'must_trump';
    void o;
    return 'must_dump';
  }
  function penaltyLeft(st) {
    var k = st.contract, m = CONTRACTS[k];
    if (k === 'el' || k === 'son' || k === 'koz') return null;
    return m.max - st.taken.reduce(function (a, b) { return a + b; }, 0);
  }
  function play(st, p, id) {
    if (st.phase !== 'play') return { ok: false, error: 'not_playing' };
    if (st.turn !== p) return { ok: false, error: 'not_your_turn' };
    var h = st.hands[p], i = -1;
    for (var x = 0; x < h.length; x++) if (h[x].id === id) { i = x; break; }
    if (i < 0) return { ok: false, error: 'no_card' };
    var c = h[i];
    if (!legal(st, p).some(function (y) { return y.id === id; })) return { ok: false, error: whyIllegal(st, p, c) };
    if (st.trick.length) {
      var ld = st.trick[0].c.s;
      if (c.s !== ld) { st.voids[p][ld] = true; if (st.contract === 'koz' && c.s !== st.trump) st.voids[p][st.trump] = true; }
    }
    h.splice(i, 1);
    st.trick.push({ p: p, c: c }); st.played.push(c.id);
    if (c.s === 'H') st.heartsBroken = true;
    if (st.trump && c.s === st.trump) st.trumpBroken = true;
    if (st.trick.length < 4) { st.turn = (p + 1) % 4; return { ok: true, card: c, done: false }; }
    var trump = st.contract === 'koz' ? st.trump : null, winner = st.trick[winnerIdx(st.trick, trump)].p;
    var units = trickUnits(st.contract, st.trick, st.history.length);
    st.tricks[winner]++; st.taken[winner] += units;
    st.lastTrick = { cards: st.trick, winner: winner, units: units };
    st.history.push(st.lastTrick);
    st.trick = []; st.turn = winner;
    var left = penaltyLeft(st);
    if (st.history.length === 13 || left === 0) endHand(st, left === 0 && st.history.length < 13);
    return { ok: true, card: c, done: true, winner: winner, units: units, over: st.over, early: st.early };
  }
  function endHand(st, early) {
    var m = CONTRACTS[st.contract];
    st.phase = 'over'; st.over = true; st.turn = -1; st.early = !!early;
    st.result = { contract: st.contract, trump: st.trump, chooser: st.chooser, tricks: st.tricks.slice(), taken: st.taken.slice(), early: !!early,
      points: st.taken.map(function (u) { return (u * m.per) || 0; }) };
    return st.result;
  }

  // ---------- botlar ----------
  function hasId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return true; return false; }
  function outsideHigher(st, p, c) {
    var n = 0;
    for (var r = c.r + 1; r <= 14; r++) { var id = cardId(c.s, r); if (st.played.indexOf(id) < 0 && !hasId(st.hands[p], id)) n++; }
    return n;
  }
  function outsideLower(st, p, c) {
    var n = 0;
    for (var r = 2; r < c.r; r++) { var id = cardId(c.s, r); if (st.played.indexOf(id) < 0 && !hasId(st.hands[p], id)) n++; }
    return n;
  }
  function outsideCount(st, p, s) {
    var n = 0;
    for (var r = 2; r <= 14; r++) { var id = cardId(s, r); if (st.played.indexOf(id) < 0 && !hasId(st.hands[p], id)) n++; }
    return n;
  }
  // Elin bir oyunda ne kadar puan getireceğinin kaba tahmini (ceza için eksi, koz için artı)
  var RISK = { 14: 0.9, 13: 0.72, 12: 0.5, 11: 0.33, 10: 0.2, 9: 0.1 };
  function trickRisk(hand) {
    var by = { S: [], H: [], D: [], C: [] };
    hand.forEach(function (c) { by[c.s].push(c); });
    var t = 0;
    SUITS.forEach(function (s) {
      var len = by[s].length;
      by[s].forEach(function (c) {
        var r = RISK[c.r] || 0.04;
        // kısa renkte büyük kart kaçamaz; uzun renkte küçük kartlar sona kalınca el alır
        if (len <= 2 && c.r >= 12) r = Math.min(1, r + 0.15);
        if (len >= 6 && c.r < 9) r += 0.08;
        t += r;
      });
      if (len >= 2 && by[s].some(function (c) { return c.r <= 4; })) t -= 0.15; // küçük kartla kaçma imkânı
    });
    return Math.max(0, t);
  }
  function kozTricks(hand, trump) {
    var by = { S: [], H: [], D: [], C: [] };
    hand.forEach(function (c) { by[c.s].push(c.r); });
    var tricks = 0, tl = by[trump].length;
    SUITS.forEach(function (s) {
      var rs = by[s].sort(function (a, b) { return b - a; }), len = rs.length, has = function (r) { return rs.indexOf(r) >= 0; };
      if (s === trump) {
        var hon = (has(14) ? 1 : 0) + (has(13) ? (len >= 2 ? 0.9 : 0.3) : 0) + (has(12) ? (len >= 3 ? 0.7 : 0.2) : 0) + (has(11) ? (len >= 4 ? 0.5 : 0.1) : 0);
        tricks += Math.min(len, hon + Math.max(0, len - 3) * 0.9);
      } else {
        if (has(14)) tricks += len <= 5 ? 1 : 0.7;
        if (has(13)) tricks += len >= 2 ? (has(14) ? 0.85 : 0.65) : 0.15;
        if (has(12) && len >= 3) tricks += (has(14) || has(13)) ? 0.45 : 0.25;
        if (tl >= 3) tricks += Math.min(Math.max(0, tl - 2) * 0.5, len === 0 ? 1.1 : len === 1 ? 0.6 : len === 2 ? 0.25 : 0);
      }
    });
    return tricks;
  }
  function bestTrump(hand) {
    var best = null, bv = -1;
    SUITS.forEach(function (s) { var v = kozTricks(hand, s) + hand.filter(function (c) { return c.s === s; }).length * 0.01; if (v > bv) { bv = v; best = s; } });
    return { s: best, v: bv };
  }
  // Seçenin bakış açısından oyunun değeri: kendi puanı − adil payı (toplamın dörtte biri)
  function contractValue(hand, k) {
    var t = trickRisk(hand), cnt = function (f) { return hand.filter(f).length; };
    var hearts = cnt(function (c) { return c.s === 'H'; }), highH = cnt(function (c) { return c.s === 'H' && c.r >= 11; });
    var exp;
    if (k === 'koz') { var bt = bestTrump(hand); return bt.v * 50 - 162.5; }
    if (k === 'el') exp = 50 * t;
    else if (k === 'kupa') exp = 30 * (t * 0.95 + highH * 0.6 - (hearts >= 4 && highH === 0 ? 0.6 : 0));
    else if (k === 'erkek') exp = 60 * (cnt(function (c) { return c.r === 13 || c.r === 11; }) * 0.45 + t * 0.25);
    else if (k === 'kiz') exp = 100 * (cnt(function (c) { return c.r === 12; }) * 0.4 + t * 0.12);
    else if (k === 'son') exp = 180 * Math.min(2, t / 13 * 2 * 1.25 + cnt(function (c) { return c.r === 14; }) * 0.12);
    else exp = 320 * (hasId(hand, KH) ? (hearts >= 5 ? 0.3 : hearts >= 3 ? 0.45 : 0.6) : 0.1 + 0.025 * t);
    var total = -CONTRACTS[k].per * CONTRACTS[k].max;
    return total / 4 - exp;
  }
  function botChoose(hand, allowedList, lv, R) {
    var best = allowedList[0], bv = -1e9, rnd = R || Math.random;
    allowedList.forEach(function (k) {
      var v = contractValue(hand, k);
      if (lv === 'easy') v += (rnd() - 0.5) * 160;
      if (v > bv) { bv = v; best = k; }
    });
    return best;
  }
  function botTrump(hand) { return bestTrump(hand).s; }
  function highest(cs) { return cs.slice().sort(function (a, b) { return b.r - a.r; })[0]; }
  function lowest(cs) { return cs.slice().sort(function (a, b) { return a.r - b.r; })[0]; }
  function botPlay(st, p, lv, R) {
    var L = legal(st, p); if (!L.length) return null;
    if (L.length === 1) return L[0].id;
    var rnd = R || Math.random;
    if (lv === 'easy' && rnd() < 0.35) return L[Math.floor(rnd() * L.length)].id;
    return st.contract === 'koz' ? kozPlay(st, p, L, lv) : cezaPlay(st, p, L, lv);
  }
  function cezaPlay(st, p, L, lv) {
    var k = st.contract, idx = st.history ? st.history.length : Math.floor((st.played.length - st.trick.length) / 4), smart = lv === 'hard';
    var safeD = function (cs) { var n = cs.filter(function (c) { return !danger(k, c); }); return n.length ? n : cs; };
    // Son iki: ilk ellerde büyük kartlardan kurtul, eli almak zararsız
    var early = k === 'son' && idx <= 8;
    if (!st.trick.length) {
      var pool = safeD(L);
      if (early) return highest(pool).id;
      if (smart) {
        // dışarıda daha büyüğü olan en küçük kartla başla (eli başkası alsın)
        var cand = pool.filter(function (c) { return outsideHigher(st, p, c) > 0; });
        if (cand.length) {
          cand.sort(function (a, b) { return (a.r - outsideLower(st, p, a) * 0.5) - (b.r - outsideLower(st, p, b) * 0.5) || outsideCount(st, p, b.s) - outsideCount(st, p, a.s); });
          return cand[0].id;
        }
      }
      return lowest(pool).id;
    }
    var led = st.trick[0].c.s, w = st.trick[winnerIdx(st.trick, null)].c, last = st.trick.length === 3;
    if (L[0].s === led) {
      var under = L.filter(function (c) { return !(c.r > w.r && w.s === led); });
      if (early) return highest(L).id;
      if (under.length) {
        // eli kaçırabiliyorsan: önce ceza kartını yak, sonra kaçan en büyük kartı at
        under.sort(function (a, b) { return danger(k, b) - danger(k, a) || b.r - a.r; });
        return under[0].id;
      }
      var winners = safeD(L);
      // elin alınması kaçınılmaz: sonuncuysan en büyüğü at, değilsen en küçüğüyle başkasına bırak
      return (last ? highest(winners) : lowest(winners)).id;
    }
    // renk yok: ceza kartlarını, sonra en büyük kartı at
    var d = L.filter(function (c) { return danger(k, c); });
    if (d.length) return highest(d).id;
    var cnt = {}; st.hands[p].forEach(function (c) { cnt[c.s] = (cnt[c.s] || 0) + 1; });
    return L.slice().sort(function (a, b) { return b.r - a.r || cnt[a.s] - cnt[b.s]; })[0].id;
  }
  function isMaster(st, p, c) { return outsideHigher(st, p, c) === 0; }
  function kozPlay(st, p, L, lv) {
    var tr = st.trump, smart = lv !== 'easy';
    var master = function (c) { return smart ? isMaster(st, p, c) : c.r === 14; };
    var lowVal = function (c) { return c.r + (c.s === tr ? 20 : 0); };
    var low = function (cs) { return cs.slice().sort(function (a, b) { return lowVal(a) - lowVal(b); })[0]; };
    if (!st.trick.length) {
      var trumps = L.filter(function (c) { return c.s === tr; });
      if (smart && p === st.chooser && trumps.length && outsideCount(st, p, tr) > 0) {
        var mt = trumps.filter(master); if (mt.length) return mt[0].id;
      }
      var risky = function (s) {
        if (lv !== 'hard' || s === tr) return false;
        for (var q = 0; q < 4; q++) if (q !== p && st.voids[q][s] && !st.voids[q][tr]) return true;
        return false;
      };
      var ms = L.filter(function (c) { return c.s !== tr && master(c) && !risky(c.s); });
      if (ms.length) return ms.sort(function (a, b) { return b.r - a.r; })[0].id;
      var side = L.filter(function (c) { return c.s !== tr && !risky(c.s); });
      if (!side.length) side = L.filter(function (c) { return c.s !== tr; });
      if (!side.length) return low(L).id;
      var cnt = {}; st.hands[p].forEach(function (c) { cnt[c.s] = (cnt[c.s] || 0) + 1; });
      side.sort(function (a, b) { return (cnt[b.s] - cnt[a.s]) || (a.r - b.r); });
      return side[0].id;
    }
    var led = st.trick[0].c.s, w = st.trick[winnerIdx(st.trick, tr)].c;
    var win = L.filter(function (c) { return beats(c, w, tr); }).sort(function (a, b) { return lowVal(a) - lowVal(b); });
    if (!win.length) return low(L).id;
    if (st.trick.length === 3) return win[0].id;
    var safe = win.filter(function (c) {
      if (c.s === tr) {
        if (led === tr) return master(c);
        if (!smart) return true;
        for (var k2 = st.trick.length + 1; k2 < 4; k2++) { var q = (st.trick[0].p + k2) % 4; if (st.voids[q][led] && !st.voids[q][tr] && !master(c)) return false; }
        return true;
      }
      if (!master(c)) return false;
      if (lv !== 'hard') return true;
      for (var k3 = st.trick.length + 1; k3 < 4; k3++) { var q2 = (st.trick[0].p + k3) % 4; if (st.voids[q2][led] && !st.voids[q2][tr]) return false; }
      return true;
    });
    if (safe.length) return safe[0].id;
    return low(L).id;
  }
  // İpucu: zor bot ne yapardı
  function hint(st, p, allowedList) {
    if (st.over || st.turn !== p) return null;
    if (st.phase === 'choose') return { a: 'choose', k: botChoose(st.hands[p], allowedList || CEZA.concat(['koz']), 'hard') };
    if (st.phase === 'trump') return { a: 'trump', s: botTrump(st.hands[p]) };
    if (st.phase === 'play') return { a: 'play', id: botPlay(st, p, 'hard') };
    return null;
  }

  return {
    SUITS: SUITS, CEZA: CEZA, CONTRACTS: CONTRACTS, DEFAULTS: DEFAULTS, KH: KH, opts: opts, rng: rng, card: card, cardId: cardId, sortHand: sortHand,
    newPlan: newPlan, chooserAt: chooserAt, turnsLeft: turnsLeft, allowed: allowed, record: record,
    newHand: newHand, choose: choose, chooseTrump: chooseTrump, danger: danger, trickUnits: trickUnits, beats: beats, winnerIdx: winnerIdx,
    legalFor: legalFor, legal: legal, play: play, endHand: endHand, penaltyLeft: penaltyLeft,
    trickRisk: trickRisk, contractValue: contractValue, botChoose: botChoose, botTrump: botTrump, botPlay: botPlay, hint: hint
  };
});
