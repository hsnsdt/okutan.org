/* Gizli Kelime — kural motoru (arayüzden bağımsız)
   Tarayıcıda window.GizliKelime, Node'da module.exports.
   Puan kodları: 2 = doğru yerde, 1 = kelimede var ama başka yerde, 0 = yok. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GizliKelime = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LEN = 5, TRIES = 6;
  var ALPHABET = 'abcçdefgğhıijklmnoöprsştuüvyz';
  var EPOCH = '2026-11-18'; // 1 numaralı günün kelimesi

  // Türkçe büyük/küçük harf: I ↔ ı, İ ↔ i
  function lower(s) { return String(s).replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase(); }
  function upper(s) { return String(s).replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase(); }
  function isLetter(ch) { return ch.length === 1 && ALPHABET.indexOf(ch) >= 0; }
  function clean(s) {
    var out = '', t = lower(s);
    for (var i = 0; i < t.length; i++) if (isLetter(t[i])) out += t[i];
    return out;
  }

  // Tahmini cevapla karşılaştır; tekrar eden harfler cevaptaki sayı kadar işaretlenir
  function score(guess, answer) {
    var g = Array.from(guess), a = Array.from(answer), res = [], left = {}, i;
    for (i = 0; i < a.length; i++) {
      if (g[i] === a[i]) res[i] = 2;
      else { res[i] = 0; left[a[i]] = (left[a[i]] || 0) + 1; }
    }
    for (i = 0; i < g.length; i++) {
      if (res[i] === 2) continue;
      if (left[g[i]] > 0) { res[i] = 1; left[g[i]]--; }
    }
    return res;
  }
  function solved(sc) { for (var i = 0; i < sc.length; i++) if (sc[i] !== 2) return false; return sc.length === LEN; }

  // Klavye: her harfin bilinen en iyi durumu
  function keyStates(guesses, scores) {
    var m = {};
    for (var r = 0; r < guesses.length; r++) {
      var g = Array.from(guesses[r]);
      for (var i = 0; i < g.length; i++) {
        var s = scores[r][i];
        if (m[g[i]] === undefined || s > m[g[i]]) m[g[i]] = s;
      }
    }
    return m;
  }

  // Zor mod: bulunan ipuçları sonraki tahminde kullanılmalı. Uygunsa null, değilse açıklama döner.
  function hardCheck(guess, guesses, scores) {
    var g = Array.from(guess);
    for (var r = 0; r < guesses.length; r++) {
      var p = Array.from(guesses[r]), need = {}, i;
      for (i = 0; i < p.length; i++) {
        if (scores[r][i] === 2 && g[i] !== p[i]) return (i + 1) + '. harf ' + upper(p[i]) + ' olmalı';
        if (scores[r][i] > 0) need[p[i]] = (need[p[i]] || 0) + 1;
      }
      for (var ch in need) {
        var have = 0;
        for (i = 0; i < g.length; i++) if (g[i] === ch) have++;
        if (have < need[ch]) return 'Tahmin ' + upper(ch) + ' harfini içermeli';
      }
    }
    return null;
  }

  // Tohumlu rastgele: FNV-1a + mulberry32
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
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
  function shuffled(list, seedStr) {
    var r = rng(fnv1a(seedStr)), a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // 'YYYY-AA-GG' → gün numarası (EPOCH = 1)
  function dayNumber(key) {
    var p = key.split('-'), e = EPOCH.split('-');
    var d = Date.UTC(+p[0], +p[1] - 1, +p[2]), d0 = Date.UTC(+e[0], +e[1] - 1, +e[2]);
    return Math.round((d - d0) / 86400000) + 1;
  }
  // Günün kelimesi: sabit karıştırılmış listede sırayla ilerler, liste bitince yeni turda yeniden karışır
  function dailyAnswer(answers, no) {
    var n = answers.length, k = Math.max(0, no - 1), round = Math.floor(k / n);
    return shuffled(answers, 'gizli-kelime-' + round)[k % n];
  }
  function randomAnswer(answers, avoid, rand) {
    rand = rand || Math.random;
    for (var t = 0; t < 20; t++) { var w = answers[Math.floor(rand() * answers.length)]; if (w !== avoid) return w; }
    return answers[0];
  }

  // Paylaşım metni (kelimeyi açık etmez)
  var SQ = ['⬛', '🟧', '🟦'];
  function shareText(title, scores, win, hard) {
    var head = title + ' ' + (win ? scores.length : 'X') + '/' + TRIES + (hard ? '*' : '');
    var rows = scores.map(function (s) { return s.map(function (v) { return SQ[v]; }).join(''); });
    return head + '\n\n' + rows.join('\n');
  }

  // İstatistik: { played, wins, streak, best, dist[6], last }
  function newStats() { return { played: 0, wins: 0, streak: 0, best: 0, dist: [0, 0, 0, 0, 0, 0], last: 0 }; }
  function addResult(st, no, win, tries) {
    st = st || newStats();
    if (st.last === no) return st; // aynı gün iki kez sayılmaz
    st.played++;
    if (win) {
      st.wins++;
      st.streak = st.last === no - 1 ? st.streak + 1 : 1;
      st.best = Math.max(st.best, st.streak);
      st.dist[tries - 1]++;
    } else st.streak = 0;
    st.last = no;
    return st;
  }
  // Seri bozulmuş mu (dün oynanmadıysa gösterilecek seri 0)
  function liveStreak(st, today) { return st && (st.last === today || st.last === today - 1) ? st.streak : 0; }

  return {
    LEN: LEN, TRIES: TRIES, ALPHABET: ALPHABET, EPOCH: EPOCH,
    lower: lower, upper: upper, isLetter: isLetter, clean: clean,
    score: score, solved: solved, keyStates: keyStates, hardCheck: hardCheck,
    fnv1a: fnv1a, rng: rng, shuffled: shuffled, dayNumber: dayNumber, dailyAnswer: dailyAnswer, randomAnswer: randomAnswer,
    shareText: shareText, newStats: newStats, addResult: addResult, liveStreak: liveStreak
  };
});
