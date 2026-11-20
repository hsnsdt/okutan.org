/* Kelime Bulucu — tahta çözücü motoru (arayüzden bağımsız). Tarayıcıda/Worker'da window|self.KBTahta, Node'da module.exports.
   15×15 tahta, standart Scrabble tarzı katlı kareler (H3 kelime ×3, K2 kelime ×2, H3 harf ×3, H2 harf ×2), merkez (7,7) ×2.
   Tahta: 15×15 dizi; boş hücre null, dolu hücre { h: 'a', j: true|false } (j = joker, 0 puan).
   enIyiHamleler(sozluk, tahta, raf, secenek) → [{ kelime, r, c, yon: 'y'|'d', puan, yeni: [{ r, c, h, j }], capraz: [kelime…], bingo }] */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KBTahta = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var N = 15, BINGO = 50, RAF = 7;
  var PUAN = { a: 1, b: 3, c: 4, 'ç': 4, d: 3, e: 1, f: 7, g: 5, 'ğ': 8, h: 5, 'ı': 2, i: 1, j: 10, k: 1, l: 1, m: 2,
    n: 1, o: 2, 'ö': 7, p: 5, r: 1, s: 2, 'ş': 4, t: 1, u: 2, 'ü': 3, v: 7, y: 3, z: 4 };
  var HARFLER = 'abcçdefgğhıijklmnoöprsştuüvyz'.split('');

  // Katlı kareler: 'K3' kelime ×3, 'K2' kelime ×2, 'H3' harf ×3, 'H2' harf ×2
  var KARE = (function () {
    var m = [], i, r, c;
    for (r = 0; r < N; r++) { m.push([]); for (c = 0; c < N; c++) m[r].push(''); }
    function koy(t, l) { for (i = 0; i < l.length; i++) { var p = l[i]; [[p[0], p[1]], [p[1], p[0]], [N - 1 - p[0], p[1]], [p[0], N - 1 - p[1]], [N - 1 - p[0], N - 1 - p[1]], [N - 1 - p[1], p[0]], [p[1], N - 1 - p[0]], [N - 1 - p[1], N - 1 - p[0]]].forEach(function (q) { m[q[0]][q[1]] = t; }); } }
    koy('K3', [[0, 0], [0, 7]]);
    koy('K2', [[1, 1], [2, 2], [3, 3], [4, 4], [7, 7]]);
    koy('H3', [[1, 5], [5, 5]]);
    koy('H2', [[0, 3], [2, 6], [3, 7], [6, 6]]);
    return m;
  })();
  var MERKEZ = [7, 7];

  function bosTahta() { var t = []; for (var r = 0; r < N; r++) { t.push([]); for (var c = 0; c < N; c++) t[r].push(null); } return t; }
  function dolu(t) { for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (t[r][c]) return true; return false; }
  function cevir(t) { var o = bosTahta(); for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) o[c][r] = t[r][c]; return o; } // yatay ↔ dikey
  function hp(h) { return PUAN[h] || 0; }
  function sayac(s) { var o = Object.create(null); for (var i = 0; i < s.length; i++) o[s[i]] = (o[s[i]] || 0) + 1; return o; }

  // Satır için boş hücrelerin dikey (çapraz) kısıtları: üst + harf + alt sözlükte olmalı
  function caprazBilgi(t, kume) {
    var b = [];
    for (var r = 0; r < N; r++) {
      b.push([]);
      for (var c = 0; c < N; c++) {
        if (t[r][c]) { b[r].push(null); continue; }
        var ust = '', alt = '', usP = 0, i;
        for (i = r - 1; i >= 0 && t[i][c]; i--) { ust = t[i][c].h + ust; usP += t[i][c].j ? 0 : hp(t[i][c].h); }
        for (i = r + 1; i < N && t[i][c]; i++) { alt += t[i][c].h; usP += t[i][c].j ? 0 : hp(t[i][c].h); }
        if (!ust && !alt) { b[r].push(null); continue; }
        var izin = Object.create(null);
        for (var k = 0; k < HARFLER.length; k++) if (kume[ust + HARFLER[k] + alt]) izin[HARFLER[k]] = 1;
        b[r].push({ izin: izin, ust: ust, alt: alt, p: usP });
      }
    }
    return b;
  }

  // Yatay hamleler (dikey için tahta çevrilip aynı işlev kullanılır)
  function yatay(sozluk, sayaclar, kume, t, rafS, joker, ilk, cevrik) {
    var out = [], capraz = caprazBilgi(t, kume);
    for (var r = 0; r < N; r++) {
      // bu satırda ya da komşu satırlarda taş yoksa (ve ilk hamle değilse) hamle olamaz
      var satirHarf = '', komsu = ilk && r === MERKEZ[0];
      for (var c0 = 0; c0 < N; c0++) {
        if (t[r][c0]) { satirHarf += t[r][c0].h; komsu = true; }
        else if ((r > 0 && t[r - 1][c0]) || (r < N - 1 && t[r + 1][c0])) komsu = true;
      }
      if (!komsu) continue;
      var mevcut = sayac(satirHarf);
      for (var n = 0; n < sozluk.length; n++) {
        var w = sozluk[n], L = w.length;
        if (L < 2 || L > N) continue;
        // ön eleme: kelimenin harfleri raf + satırdaki harfler + jokerlerle karşılanabilmeli
        var sc = sayaclar[n], eksik = 0;
        for (var h in sc) { var v = sc[h] - (rafS[h] || 0) - (mevcut[h] || 0); if (v > 0) { eksik += v; if (eksik > joker) break; } }
        if (eksik > joker) continue;
        for (var c = 0; c + L <= N; c++) {
          if (c > 0 && t[r][c - 1]) continue;
          if (c + L < N && t[r][c + L]) continue;
          var hm = dene(w, r, c, t, capraz, rafS, joker, ilk, kume);
          if (hm) { hm.yon = cevrik ? 'd' : 'y'; if (cevrik) { var rr = hm.r; hm.r = hm.c; hm.c = rr; hm.yeni.forEach(function (y) { var x = y.r; y.r = y.c; y.c = x; }); } out.push(hm); }
        }
      }
    }
    return out;
  }

  function dene(w, r, c, t, capraz, rafS, joker, ilk, kume) {
    var L = w.length, gerek = Object.create(null), yeniPos = [], bagli = false, merkez = false, i;
    for (i = 0; i < L; i++) {
      var hc = t[r][c + i];
      if (hc) { if (hc.h !== w[i]) return null; bagli = true; continue; }
      var cb = capraz[r][c + i];
      if (cb) { if (!cb.izin[w[i]]) return null; bagli = true; }
      if (r === MERKEZ[0] && c + i === MERKEZ[1]) merkez = true;
      gerek[w[i]] = (gerek[w[i]] || 0) + 1; yeniPos.push(i);
    }
    if (!yeniPos.length || yeniPos.length > RAF) return null;
    if (ilk ? !merkez : !bagli) return null;
    // raf yeterli mi; jokerleri en az puan kaybettirecek yerlere ver
    var jokerGerek = 0, eksikHarf = Object.create(null);
    for (var h in gerek) { var e = gerek[h] - (rafS[h] || 0); if (e > 0) { jokerGerek += e; eksikHarf[h] = e; } }
    if (jokerGerek > joker) return null;
    var jokerPos = Object.create(null);
    if (jokerGerek) {
      for (var hh in eksikHarf) {
        var adaylar = yeniPos.filter(function (p) { return w[p] === hh; }).map(function (p) { return { p: p, k: kareDeger(r, c + p, hp(hh)) }; });
        adaylar.sort(function (a, b) { return a.k - b.k; });
        for (var q = 0; q < eksikHarf[hh]; q++) jokerPos[adaylar[q].p] = 1;
      }
    }
    // puan: ana kelime
    var ana = 0, carpan = 1, toplam = 0, yeni = [], capr = [];
    for (i = 0; i < L; i++) {
      var hc2 = t[r][c + i];
      if (hc2) { ana += hc2.j ? 0 : hp(hc2.h); continue; }
      var j = !!jokerPos[i], lp = j ? 0 : hp(w[i]), k = KARE[r][c + i];
      if (k === 'H2') lp *= 2; else if (k === 'H3') lp *= 3;
      ana += lp;
      if (k === 'K2') carpan *= 2; else if (k === 'K3') carpan *= 3;
      yeni.push({ r: r, c: c + i, h: w[i], j: j });
      var cb2 = capraz[r][c + i];
      if (cb2) {
        var cp = cb2.p + lp, cc = k === 'K2' ? 2 : k === 'K3' ? 3 : 1;
        toplam += cp * cc; capr.push(cb2.ust + w[i] + cb2.alt);
      }
    }
    toplam += ana * carpan;
    var bingo = yeni.length === RAF;
    if (bingo) toplam += BINGO;
    return { kelime: w, r: r, c: c, puan: toplam, yeni: yeni, capraz: capr, bingo: bingo };
  }
  function kareDeger(r, c, p) { var k = KARE[r][c]; return k === 'H3' ? p * 3 : k === 'H2' ? p * 2 : k === 'K3' ? p * 3 : k === 'K2' ? p * 2 : p; }

  function hazirla(sozluk) {
    var kume = Object.create(null), sayaclar = new Array(sozluk.length);
    for (var i = 0; i < sozluk.length; i++) { kume[sozluk[i]] = 1; sayaclar[i] = sayac(sozluk[i]); }
    return { sozluk: sozluk, kume: kume, sayaclar: sayaclar };
  }
  function enIyiHamleler(hazir, t, raf, secenek) {
    secenek = secenek || {};
    var r = String(raf || '').replace(/[?.]/g, '*'), joker = (r.match(/\*/g) || []).length, harf = r.replace(/[^a-zçğıöşü]/g, '');
    var rafS = sayac(harf), ilk = !dolu(t);
    var l = yatay(hazir.sozluk, hazir.sayaclar, hazir.kume, t, rafS, joker, ilk, false)
      .concat(yatay(hazir.sozluk, hazir.sayaclar, hazir.kume, cevir(t), rafS, joker, ilk, true));
    // aynı yerleşimi (ilk hamlede yatay/dikey simetrisi dahil) bir kez say
    var gor = Object.create(null), o = [];
    l.sort(function (a, b) { return b.puan - a.puan || b.kelime.length - a.kelime.length; });
    for (var i = 0; i < l.length; i++) {
      var k = l[i].yeni.map(function (y) { return y.r + ',' + y.c + y.h + (y.j ? '*' : ''); }).sort().join('|') + (ilk ? '' : l[i].yon);
      if (gor[k]) continue; gor[k] = 1; o.push(l[i]);
      if (o.length >= (secenek.sinir || 60)) break;
    }
    return o;
  }
  function koordinat(r, c) { return String.fromCharCode(65 + c) + (r + 1); } // A1 … O15
  return { N: N, KARE: KARE, MERKEZ: MERKEZ, PUAN: PUAN, BINGO: BINGO, bosTahta: bosTahta, hazirla: hazirla, enIyiHamleler: enIyiHamleler, koordinat: koordinat };
});
