/* Tavla — kural motoru (arayüzden bağımsız; tarayıcıda window.TavlaKural, Node'da module.exports)
 *
 * Türk tavlası (katlama zarı yok):
 *  - 24 hane, oyuncu başına 15 pul. Oyuncu 0 (beyaz, alt) 24 → 1 yönünde oynar, evi 1–6;
 *    oyuncu 1 (siyah, üst) 1 → 24 yönünde oynar, evi 19–24. Tahta: b[1..24] işaretli sayı (+ oyuncu 0, − oyuncu 1).
 *  - Başlangıç: 24'te 2, 13'te 5, 8'de 3, 6'da 5 (rakip için aynalı).
 *  - Çift zar dört kez oynanır. İki zar da oynanabiliyorsa ikisi de oynanmak zorunda; yalnız biri oynanabiliyorsa büyük olan.
 *  - Tek pul (açık) kırılabilir; kırık pul bara gider ve önce o girer. 2+ rakip pulu olan haneye girilemez.
 *  - Bütün pullar evdeyse toplanır: tam zar ya da (daha yukarıda pul yoksa) büyük zarla.
 *  - Bitiren 1 puan, rakibi hiç pul toplamadıysa (mars) 2 puan alır.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TavlaKural = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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
  function rollDice(rnd) { var r = rnd || Math.random; return [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)]; }

  // ---------- pozisyon ----------
  function newPos() {
    var b = []; for (var i = 0; i < 26; i++) b.push(0);
    b[24] = 2; b[13] = 5; b[8] = 3; b[6] = 5;
    b[1] = -2; b[12] = -5; b[17] = -3; b[19] = -5;
    return { b: b, bar: [0, 0], off: [0, 0] };
  }
  function clonePos(pos) { return { b: pos.b.slice(), bar: pos.bar.slice(), off: pos.off.slice() }; }
  function sgn(p) { return p === 0 ? 1 : -1; }
  function own(pos, p, a) { return pos.b[a] * sgn(p); }           // >0 kendi pulları, <0 rakip pulları
  function abs(p, r) { return p === 0 ? r : 25 - r; }             // göreli hane (1 = evin en dibi) → mutlak
  function rel(p, a) { return p === 0 ? a : 25 - a; }
  function posKey(pos) { return pos.b.join(',') + '|' + pos.bar.join(',') + '|' + pos.off.join(','); }
  function allHome(pos, p) {
    if (pos.bar[p]) return false;
    for (var r = 7; r <= 24; r++) if (own(pos, p, abs(p, r)) > 0) return false;
    return true;
  }
  function pip(pos, p) {
    var s = pos.bar[p] * 25;
    for (var r = 1; r <= 24; r++) { var n = own(pos, p, abs(p, r)); if (n > 0) s += n * r; }
    return s;
  }
  function count(pos, p) { var n = pos.bar[p] + pos.off[p]; for (var a = 1; a <= 24; a++) if (own(pos, p, a) > 0) n += own(pos, p, a); return n; }

  // ---------- tek zarla hamleler ----------
  // hamle: { from: mutlak hane | 'bar', to: mutlak hane | 'off', die, hit }
  function singleMoves(pos, p, d) {
    var res = [];
    if (pos.bar[p] > 0) {
      var ea = abs(p, 25 - d), eo = own(pos, p, ea);
      if (eo >= -1) res.push({ from: 'bar', to: ea, die: d, hit: eo === -1 });
      return res;
    }
    var home = allHome(pos, p);
    for (var r = 24; r >= 1; r--) {
      var a = abs(p, r);
      if (own(pos, p, a) <= 0) continue;
      var tr = r - d;
      if (tr >= 1) {
        var ta = abs(p, tr), o = own(pos, p, ta);
        if (o >= -1) res.push({ from: a, to: ta, die: d, hit: o === -1 });
      } else if (home) {
        if (tr === 0) res.push({ from: a, to: 'off', die: d, hit: false });
        else {
          var higher = false;
          for (var q = r + 1; q <= 6; q++) if (own(pos, p, abs(p, q)) > 0) { higher = true; break; }
          if (!higher) res.push({ from: a, to: 'off', die: d, hit: false });
        }
      }
    }
    return res;
  }
  function applyMove(pos, p, m) {
    var s = sgn(p);
    if (m.from === 'bar') pos.bar[p]--; else pos.b[m.from] -= s;
    if (m.to === 'off') { pos.off[p]++; return pos; }
    if (pos.b[m.to] === -s) { pos.b[m.to] = 0; pos.bar[1 - p]++; }
    pos.b[m.to] += s;
    return pos;
  }
  function expandDice(dice) { return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]]; }
  function removeOne(arr, v) { var i = arr.indexOf(v), c = arr.slice(); if (i >= 0) c.splice(i, 1); return c; }
  function uniq(arr) { return arr.filter(function (v, i) { return arr.indexOf(v) === i; }); }

  // Bu zarlarla en fazla kaç zar oynanabilir
  function maxPlayable(pos, p, dice, memo) {
    if (!dice.length) return 0;
    memo = memo || {};
    var key = posKey(pos) + '#' + dice.slice().sort().join('');
    if (memo[key] != null) return memo[key];
    var best = 0, ds = uniq(dice);
    for (var i = 0; i < ds.length && best < dice.length; i++) {
      var ms = singleMoves(pos, p, ds[i]), rest = removeOne(dice, ds[i]);
      for (var k = 0; k < ms.length && best < dice.length; k++) {
        var v = 1 + maxPlayable(applyMove(clonePos(pos), p, ms[k]), p, rest, memo);
        if (v > best) best = v;
      }
    }
    memo[key] = best;
    return best;
  }
  // Tur başında: kaç zar oynanmalı ve (yalnız biri oynanabiliyorsa) hangi zar
  function turnInfo(pos, p, dice) {
    var all = expandDice(dice), max = maxPlayable(pos, p, all), forceDie = null;
    if (max === 1 && dice[0] !== dice[1]) {
      var hi = Math.max(dice[0], dice[1]), lo = Math.min(dice[0], dice[1]);
      forceDie = singleMoves(pos, p, hi).length ? hi : lo;
    }
    return { dice: all, max: max, forceDie: forceDie };
  }
  // Oynanabilir sonraki tek hamleler (kural: toplam oynanan zar sayısı en fazlaya ulaşabilmeli)
  // left: kalan zarlar · need: daha kaç zar oynanmalı · forceDie: yalnız bu zar
  function nextMoves(pos, p, left, need, forceDie) {
    if (need <= 0) return [];
    var res = [], ds = uniq(left), memo = {};
    ds.forEach(function (d) {
      if (forceDie != null && d !== forceDie) return;
      var rest = removeOne(left, d);
      singleMoves(pos, p, d).forEach(function (m) {
        if (1 + maxPlayable(applyMove(clonePos(pos), p, m), p, rest, memo) >= need) res.push(m);
      });
    });
    return res;
  }
  // Bütün geçerli turlar (botlar için): sonuç pozisyonuna göre tekilleştirilmiş
  function legalTurns(pos, p, dice) {
    var info = turnInfo(pos, p, dice), out = [], seen = {};
    if (!info.max) return [{ moves: [], pos: clonePos(pos) }];
    function dfs(cur, left, moves) {
      if (moves.length === info.max) {
        var k = posKey(cur);
        if (!seen[k]) { seen[k] = 1; out.push({ moves: moves.slice(), pos: cur }); }
        return;
      }
      var nm = nextMoves(cur, p, left, info.max - moves.length, moves.length === 0 ? info.forceDie : null);
      for (var i = 0; i < nm.length; i++) {
        var m = nm[i];
        moves.push(m); dfs(applyMove(clonePos(cur), p, m), removeOne(left, m.die), moves); moves.pop();
      }
    }
    dfs(clonePos(pos), info.dice, []);
    return out;
  }
  function sameMove(a, b) { return a.from === b.from && a.to === b.to && a.die === b.die; }
  // Bir hamle dizisinin geçerli bir tur olup olmadığını denetle (online masa için)
  function validateTurn(pos, p, dice, moves) {
    var info = turnInfo(pos, p, dice), cur = clonePos(pos), left = info.dice.slice();
    if (moves.length !== info.max) return null;
    for (var i = 0; i < moves.length; i++) {
      var nm = nextMoves(cur, p, left, info.max - i, i === 0 ? info.forceDie : null);
      var m = nm.find(function (x) { return sameMove(x, moves[i]); });
      if (!m) return null;
      applyMove(cur, p, m); left = removeOne(left, m.die);
    }
    return cur;
  }
  function winner(pos) { return pos.off[0] === 15 ? 0 : pos.off[1] === 15 ? 1 : -1; }
  function gamePoints(pos, w) { return pos.off[1 - w] === 0 ? 2 : 1; } // mars: 2

  // ---------- değerlendirme ve botlar ----------
  // p'nin pulu (mutlak a) için rakip q'nun kırma mesafeleri
  function hitDistances(pos, q, a) {
    var rq = rel(q, a), ds = [];
    if (pos.bar[q]) ds.push(25 - rq);
    for (var r = rq + 1; r <= 24; r++) if (own(pos, q, abs(q, r)) > 0) ds.push(r - rq);
    return ds.filter(function (d) { return d >= 1 && d <= 24; });
  }
  var ROLLS = []; (function () { for (var i = 1; i <= 6; i++) for (var j = 1; j <= 6; j++) ROLLS.push([i, j]); })();
  function rollHits(roll, dist) {
    var a = roll[0], b = roll[1];
    if (a === b) return dist % a === 0 && dist / a <= 4;
    return dist === a || dist === b || dist === a + b;
  }
  // Bir sonraki atışta açık pullarımdan en az birinin kırılma olasılığı ve beklenen kayıp (pip)
  function exposure(pos, p, exact) {
    var q = 1 - p, blots = [];
    for (var a = 1; a <= 24; a++) if (own(pos, p, a) === 1) {
      var ds = hitDistances(pos, q, a);
      if (ds.length) blots.push({ r: rel(p, a), ds: ds });
    }
    if (!blots.length) return { prob: 0, loss: 0 };
    if (!exact) {
      var loss = 0, pr = 0;
      blots.forEach(function (bl) {
        var direct = bl.ds.filter(function (d) { return d <= 6; }).length, ind = bl.ds.filter(function (d) { return d > 6 && d <= 12; }).length;
        var pp = Math.min(0.9, direct * 0.31 + ind * 0.08);
        pr = Math.max(pr, pp); loss += pp * (25 - bl.r);
      });
      return { prob: pr, loss: loss };
    }
    var hits = 0, lossSum = 0;
    ROLLS.forEach(function (roll) {
      var worst = 0;
      blots.forEach(function (bl) { if (bl.ds.some(function (d) { return rollHits(roll, d); })) worst = Math.max(worst, 25 - bl.r); });
      if (worst) { hits++; lossSum += worst; }
    });
    return { prob: hits / 36, loss: lossSum / 36 };
  }
  function contact(pos) {
    // 0'ın en geri pulu (göreli en büyük) 1'in en geri pulunu geçmişse temas bitmiştir
    var back0 = 0, back1 = 0;
    if (pos.bar[0]) back0 = 25; if (pos.bar[1]) back1 = 25;
    for (var a = 1; a <= 24; a++) {
      if (pos.b[a] > 0) back0 = Math.max(back0, a);
      if (pos.b[a] < 0) back1 = Math.max(back1, 25 - a);
    }
    return back0 + back1 > 25;
  }
  function evaluate(pos, p, level) {
    var q = 1 - p, my = pip(pos, p), op = pip(pos, q);
    if (pos.off[p] === 15) return 1e6 + (pos.off[q] === 0 ? 1e5 : 0);
    if (!contact(pos)) return (op - my) * 1.2 + pos.off[p] * 0.4 - stackWaste(pos, p);
    var hard = level === 'hard', s = (op - my) * (hard ? 0.9 : 1);
    var made = [];
    for (var r = 1; r <= 24; r++) {
      var n = own(pos, p, abs(p, r));
      made[r] = n >= 2;
      if (n >= 2) s += r <= 6 ? 1.6 : r === 7 ? 1.4 : r <= 11 ? 0.6 : r >= 19 ? 0.7 : 0.1;
      if (n > 5) s -= (n - 5) * 0.35;
    }
    // sur (art arda kapalı haneler)
    var run = 0, bestRun = 0;
    for (var r2 = 1; r2 <= 12; r2++) { run = made[r2] ? run + 1 : 0; bestRun = Math.max(bestRun, run); }
    s += bestRun >= 3 ? (bestRun - 2) * (bestRun - 2) * 1.2 : 0;
    // rakip barda: evim ne kadar kapalıysa o kadar iyi
    var homeClosed = 0; for (var h = 1; h <= 6; h++) if (made[h]) homeClosed++;
    s += pos.bar[q] * (3 + homeClosed * 1.1);
    s -= pos.bar[p] * 4;
    var ex = exposure(pos, p, hard);
    s -= ex.loss * (hard ? 0.55 : 0.4) * (1 + homeStrength(pos, q) * 0.15);
    return s;
  }
  function homeStrength(pos, q) { var n = 0; for (var r = 1; r <= 6; r++) if (own(pos, q, abs(q, r)) >= 2) n++; return n; }
  function stackWaste(pos, p) { var w = 0; for (var r = 1; r <= 6; r++) { var n = own(pos, p, abs(p, r)); if (n > 3) w += (n - 3) * 0.3 * (r <= 2 ? 1.5 : 1); } return w; }
  function chooseTurn(pos, p, dice, level, rnd) {
    var turns = legalTurns(pos, p, dice);
    if (turns.length <= 1) return turns[0];
    var r = rnd || Math.random;
    if (level === 'easy') {
      if (r() < 0.45) return turns[Math.floor(r() * turns.length)];
      turns.forEach(function (t) { t.v = (pip(t.pos, 1 - p) - pip(t.pos, p)) + t.pos.bar[1 - p] * 6; });
    } else turns.forEach(function (t) { t.v = evaluate(t.pos, p, level); });
    turns.sort(function (a, b) { return b.v - a.v; });
    return turns[0];
  }

  return {
    rng: rng, rollDice: rollDice, newPos: newPos, clonePos: clonePos, own: own, abs: abs, rel: rel, pip: pip, count: count,
    allHome: allHome, singleMoves: singleMoves, applyMove: applyMove, expandDice: expandDice, maxPlayable: maxPlayable,
    turnInfo: turnInfo, nextMoves: nextMoves, legalTurns: legalTurns, validateTurn: validateTurn, sameMove: sameMove,
    winner: winner, gamePoints: gamePoints, evaluate: evaluate, exposure: exposure, contact: contact, chooseTurn: chooseTurn, posKey: posKey
  };
});
