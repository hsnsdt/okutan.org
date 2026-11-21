/* Pişti — kural motoru (arayüzden bağımsız; tarayıcıda window.PistiKural, Node'da module.exports)
 *
 * Kurallar (yaygın Türk piştisi):
 *  - 52 kart. 2 oyuncu ya da 4 oyuncu eşli (karşılıklı oturanlar takım: 0–2 ve 1–3). Sıra sağa döner (koltuk + 1).
 *  - Dağıtanın sağından başlayarak herkese 4 kart, yere 4 kart (3'ü kapalı, en üstteki açık) dağıtılır.
 *    Eller bitince deste bitene kadar herkese yeniden 4'er kart dağıtılır (yere kart açılmaz).
 *  - Sırası gelen bir kart atar. Yerdeki en üst kartla aynı sayıda kart ya da vale atan yerdeki bütün kartları alır.
 *  - Yerde tek kart varken aynısıyla alırsan PİŞTİ: 10 puan. Tek vale üstüne vale atarsan VALE PİŞTİSİ: 20 puan.
 *    (Tek kartı vale ile almak pişti sayılmaz.)
 *  - El sonunda yerde kalan kartlar son alan oyuncuya gider.
 *  - Puan: her as 1, her vale 1, sinek ikilisi 2, karo onlusu 3, en çok kart alan 3 (eşitlikte kimse), piştiler.
 *    Bir elde kart puanlarının toplamı 13, en çok kart puanıyla 16'dır (+ piştiler). Hedef puana (opts.target) ilk ulaşan kazanır.
 *
 * Kart: { id, s, r }  s: 'S' maça · 'H' kupa · 'D' karo · 'C' sinek · r: 2–14 (11 Vale, 12 Kız, 13 Papaz, 14 As)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PistiKural = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUITS = ['S', 'H', 'C', 'D'];
  var DEFAULTS = { target: 101 };
  function opts(o) { var t = o && +o.target; return { target: t >= 21 && t <= 501 ? Math.floor(t) : 101 }; }
  var J = 11;

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
  function sortHand(h) { return h.slice().sort(function (a, b) { return (a.r - b.r) || (SUITS.indexOf(a.s) - SUITS.indexOf(b.s)); }); }
  function cardPoints(c) {
    if (c.s === 'D' && c.r === 10) return 3;
    if (c.s === 'C' && c.r === 2) return 2;
    if (c.r === 14 || c.r === J) return 1;
    return 0;
  }
  function team(st, p) { return st.n === 4 ? p % 2 : p; }

  // ---------- el ----------
  function newHand(seed, dealer, n, o) {
    n = n === 4 ? 4 : 2;
    var R = rng(seed), deck = [];
    for (var i = 0; i < 52; i++) deck.push(card(i));
    for (var k = deck.length - 1; k > 0; k--) { var j = Math.floor(R() * (k + 1)); var t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
    var st = {
      seed: seed, n: n, dealer: dealer % n, opts: opts(o), deck: deck, hands: [], pile: [], closed: 3, captured: [], pistis: [],
      lastTaker: -1, turn: (dealer + 1) % n, round: 0, seen: [], over: false, result: null
    };
    for (var p = 0; p < n; p++) { st.hands.push([]); st.captured.push([]); st.pistis.push({ normal: 0, vale: 0 }); }
    st.pile = st.deck.splice(0, 4);
    st.seen.push(st.pile[3].id);
    deal(st);
    return st;
  }
  function deal(st) {
    for (var k = 0; k < 4; k++) for (var q = 1; q <= st.n; q++) st.hands[(st.dealer + q) % st.n].push(st.deck.shift());
    st.hands = st.hands.map(sortHand);
    st.round++;
  }
  function top(st) { return st.pile.length ? st.pile[st.pile.length - 1] : null; }
  function captures(st, c) { var t = top(st); return !!t && (c.r === t.r || c.r === J); }
  function pistiOf(st, c) {
    var t = top(st);
    if (!t || st.pile.length !== 1 || c.r !== t.r) return 0;
    return c.r === J ? 20 : 10;
  }
  function play(st, p, id) {
    if (st.over) return { ok: false, error: 'over' };
    if (st.turn !== p) return { ok: false, error: 'not_your_turn' };
    var h = st.hands[p], i = -1;
    for (var x = 0; x < h.length; x++) if (h[x].id === id) { i = x; break; }
    if (i < 0) return { ok: false, error: 'no_card' };
    var c = h.splice(i, 1)[0];
    st.seen.push(c.id);
    var res = { ok: true, card: c, capture: false, pisti: 0, taken: [], dealt: false, over: false };
    if (captures(st, c)) {
      res.pisti = pistiOf(st, c);
      res.capture = true;
      res.taken = st.pile.concat([c]);
      // kapalı kartlar alınınca herkes görür
      st.pile.slice(0, st.closed).forEach(function (k) { if (st.seen.indexOf(k.id) < 0) st.seen.push(k.id); });
      st.captured[p] = st.captured[p].concat(res.taken);
      if (res.pisti === 20) st.pistis[p].vale++; else if (res.pisti) st.pistis[p].normal++;
      st.pile = []; st.closed = 0; st.lastTaker = p;
    } else st.pile.push(c);
    st.turn = (p + 1) % st.n;
    if (st.hands.every(function (hh) { return !hh.length; })) {
      if (st.deck.length) { deal(st); res.dealt = true; st.turn = (st.dealer + 1) % st.n; }
      else { finish(st); res.over = true; res.rest = st.result.rest; }
    }
    return res;
  }
  function finish(st) {
    var rest = 0;
    if (st.pile.length && st.lastTaker >= 0) { rest = st.pile.length; st.captured[st.lastTaker] = st.captured[st.lastTaker].concat(st.pile); st.pile = []; st.closed = 0; }
    st.over = true; st.turn = -1;
    st.result = scoreHand(st);
    st.result.rest = rest; st.result.restTo = st.lastTaker;
    return st.result;
  }
  // takım başına ayrıntılı puan
  function scoreHand(st) {
    var T = st.n === 4 ? 2 : st.n, teams = [];
    for (var t = 0; t < T; t++) teams.push({ cards: 0, aces: 0, jacks: 0, club2: 0, dia10: 0, most: 0, pisti: 0, vale: 0, pistiPts: 0, cardPts: 0, total: 0 });
    for (var p = 0; p < st.n; p++) {
      var d = teams[team(st, p)];
      st.captured[p].forEach(function (c) {
        d.cards++;
        if (c.r === 14) d.aces++;
        if (c.r === J) d.jacks++;
        if (c.s === 'C' && c.r === 2) d.club2 = 2;
        if (c.s === 'D' && c.r === 10) d.dia10 = 3;
        d.cardPts += cardPoints(c);
      });
      d.pisti += st.pistis[p].normal; d.vale += st.pistis[p].vale;
    }
    var mx = Math.max.apply(null, teams.map(function (d) { return d.cards; }));
    var tops = teams.filter(function (d) { return d.cards === mx; });
    if (tops.length === 1) tops[0].most = 3;
    teams.forEach(function (d) { d.pistiPts = d.pisti * 10 + d.vale * 20; d.total = d.cardPts + d.most + d.pistiPts; });
    return { teams: teams, points: teams.map(function (d) { return d.total; }) };
  }

  // ---------- botlar ----------
  // dışarıda (görülmemiş) kaç tane bu sayıdan kart var
  function unseenOfRank(st, p, r) {
    var n = 0;
    for (var si = 0; si < 4; si++) {
      var id = cardId(SUITS[si], r);
      if (st.seen.indexOf(id) >= 0) continue;
      if (st.hands[p].some(function (c) { return c.id === id; })) continue;
      n++;
    }
    return n;
  }
  function pileValue(st) {
    return st.pile.reduce(function (a, c, i) { return a + (i < st.closed ? 0.25 : cardPoints(c)) + 0.12; }, 0);
  }
  function botPlay(st, p, lv, R) {
    var h = st.hands[p]; if (!h.length) return null;
    if (h.length === 1) return h[0].id;
    var rnd = R || Math.random, smart = lv !== 'easy', hard = lv === 'hard';
    if (lv === 'easy' && rnd() < 0.3) return h[Math.floor(rnd() * h.length)].id;
    var t = top(st), mate = st.n === 4 ? (p + 2) % 4 : -1;
    // 1) toplayabiliyorsan
    if (t) {
      var same = h.filter(function (c) { return c.r === t.r && c.r !== J; });
      var jacks = h.filter(function (c) { return c.r === J; });
      if (same.length) return same.sort(function (a, b) { return cardPoints(b) - cardPoints(a); })[0].id; // pişti ya da aynı sayıyla alım (değerlisini kullan)
      if (t.r === J && jacks.length) return jacks[0].id;                                                  // vale üstüne vale (tekse vale piştisi)
      // vale ile al: yerdeki kartlar değerliyse ya da çoksa
      var pv = pileValue(st);
      var lastRound = st.deck.length === 0;
      if (jacks.length && (pv >= (smart ? 1.4 : 2.2) || st.pile.length >= (smart ? 5 : 7) || (lastRound && h.length <= 2 && pv > 0.5))) {
        // eşin yerde bıraktığı tek kart: zor bot ona bırakmaz (eş alır) — eşli oyunda basit bir incelik
        return jacks[0].id;
      }
    }
    // 2) atılacak kart: değersiz, vale olmayan, rakibin piştisine kapı açmayan
    var opp = (p + 1) % st.n;
    if (hard) return hardDiscard(st, p, h, opp).id;
    var score = function (c) {
      var v = 0;
      if (c.r === J) v += 30;                   // valeyi sakla
      v += cardPoints(c) * 6;                   // değerli kartı verme
      // orta bot kart saymaz: her sayıdan dışarıda ortalama 1,5 kart var sayar, yalnız açıkta gördüğünü hesaba katar
      var out = smart ? Math.min(1.5, unseenOfRank(st, p, c.r)) : 1.5;
      if (!st.pile.length) v += out * 3;        // yere tek kart koyuyorsan rakip aynısıyla pişti yapabilir
      else v += out * (0.5 + Math.min(1.5, pileValue(st) / 3)); // yer büyürken rakip bu sayıyı tutuyorsa yeri alır
      if (smart && h.filter(function (x) { return x.r === c.r; }).length >= 2) v -= 4; // ikisi bende: birini atmak güvenli
      void mate;
      return v + c.r * 0.01;
    };
    return h.slice().sort(function (a, b) { return score(a) - score(b); })[0].id;
  }
  // rakibin elinde, görülmemiş k kartın en az birinin bulunma olasılığı (U görülmemiş kart, rakipte h kart)
  function pHas(k, U, h) {
    if (k <= 0 || h <= 0 || U <= 0) return 0;
    var q = 1;
    for (var i = 0; i < h; i++) { if (U - i <= 0) return 1; q *= Math.max(0, U - k - i) / (U - i); }
    return 1 - q;
  }
  // Zor bot: rakibin yeri alma olasılığını görülmemiş kartlardan hesaplar, beklenen kaybı en az kartı atar
  function hardDiscard(st, p, h, opp) {
    var U = 52 - st.seen.length - h.length - st.closed;
    U = Math.max(U, st.hands[opp].length);
    var hOpp = st.hands[opp].length, pv = pileValue(st), jOut = unseenOfRank(st, p, J);
    var best = null, bv = 1e9;
    h.forEach(function (c) {
      var own = cardPoints(c), k = unseenOfRank(st, p, c.r), loss;
      if (!st.pile.length) {
        // yere tek kart: rakip aynısıyla pişti (10, vale ise 20), valeyle düz alım
        var pSame = c.r === J ? pHas(k, U, hOpp) : pHas(k, U, hOpp);
        var pJ = c.r === J ? 0 : pHas(jOut, U, hOpp) * (1 - pSame);
        loss = pSame * ((c.r === J ? 20 : 10) + own + 0.3) + pJ * (own + 1.3);
      } else {
        var value = pv + own + 0.15 + (st.pile.length >= 6 ? 1 : 0); // çok kart en çok kart puanına yaklaştırır
        var pTake = c.r === J ? 0 : 1 - (1 - pHas(k, U, hOpp)) * (1 - pHas(jOut, U, hOpp));
        loss = pTake * value;
        if (c.r === J) loss = -pv; // vale toplar (buraya yalnızca yer boşsa düşmez); güvenlik için
      }
      var keep = c.r === J ? 6 : 0;               // valeyi sonraya sakla
      var pair = h.filter(function (x) { return x.r === c.r; }).length >= 2 ? -0.8 : 0;
      var v = loss + keep + own * 0.6 + pair + c.r * 0.001;
      if (v < bv) { bv = v; best = c; }
    });
    return best;
  }
  function hint(st, p) { if (st.over || st.turn !== p) return null; return { a: 'play', id: botPlay(st, p, 'hard') }; }

  return {
    SUITS: SUITS, DEFAULTS: DEFAULTS, J: J, opts: opts, rng: rng, card: card, cardId: cardId, sortHand: sortHand, cardPoints: cardPoints, team: team,
    newHand: newHand, top: top, captures: captures, pistiOf: pistiOf, play: play, finish: finish, scoreHand: scoreHand,
    unseenOfRank: unseenOfRank, botPlay: botPlay, hint: hint
  };
});
