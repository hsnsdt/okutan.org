/* Kelime Bulucu — arama motoru (arayüzden bağımsız)
   Tarayıcıda window.KelimeBulucu, Node'da module.exports.
   - harflerle(): elindeki harflerden (joker * ya da ?) kurulabilen kelimeler;
     isteğe bağlı "kelimede geçecek" ifade (tahtadaki harfler) ve uzunluk.
   - kalipla(): ? tek harf, * herhangi sayıda harf (bulmaca kalıbı).
   - sozlukAc(): ön ekle sıkıştırılmış sözlük metnini kelime dizisine açar. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KelimeBulucu = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HARFLER = 'abcçdefgğhıijklmnoöprsştuüvyz';
  var HARF_RE = /^[a-zçğıöşü]$/;
  var MAX_HARF = 16;
  // Türkçe Scrabble taş puanları (Kelimeler oyunundaki letter_tile.dart ile aynı); joker 0 puan.
  // ortak.js'te aynı tablo var (liste sayfaları motor.js yüklemez); test ikisinin eşitliğini denetler.
  var PUAN = { a: 1, b: 3, c: 4, 'ç': 4, d: 3, e: 1, f: 7, g: 5, 'ğ': 8, h: 5, 'ı': 2, i: 1, j: 10, k: 1, l: 1, m: 2,
    n: 1, o: 2, 'ö': 7, p: 5, r: 1, s: 2, 'ş': 4, t: 1, u: 2, 'ü': 3, v: 7, y: 3, z: 4 };
  // Kelimenin puanı; joker konumlarındaki harfler sayılmaz.
  function puan(w, jokerler) {
    var t = 0, j = {};
    if (jokerler) for (var i = 0; i < jokerler.length; i++) j[jokerler[i]] = 1;
    for (var n = 0; n < w.length; n++) if (!j[n]) t += PUAN[w[n]] || 0;
    return t;
  }

  // Türkçe küçük harf; â î û düzleşir; harf ve joker dışındakiler atılır.
  function kucuk(s) {
    return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase()
      .replace(/i̇/g, 'i').replace(/[âàá]/g, 'a').replace(/[îìí]/g, 'i').replace(/[ûùú]/g, 'u')
      .replace(/[ôòó]/g, 'o').replace(/[èéê]/g, 'e').replace(/q/g, 'k').replace(/w/g, 'v').replace(/x/g, 'ks');
  }
  // Yalnızca harfler.
  function harf(s) { return kucuk(s).replace(/[^a-zçğıöşü]/g, ''); }
  // Harfler + joker (* ? . hepsi tek jokere döner, '*' olarak).
  function raf(s) { return kucuk(s).replace(/[?.]/g, '*').replace(/[^a-zçğıöşü*]/g, '').slice(0, MAX_HARF); }
  // Kalıp: harf, ? (tek harf), * (sıfır ya da daha çok harf). Art arda * tekleşir.
  function kalip(s) { return kucuk(s).replace(/\./g, '?').replace(/[^a-zçğıöşü?*]/g, '').replace(/\*+/g, '*').slice(0, 30); }

  // Ön ekle sıkıştırılmış satırlar: "3lık" = önceki kelimenin ilk 3 harfi + "lık".
  function sozlukAc(metin) {
    var satir = String(metin).split('\n'), out = [], onceki = '';
    for (var i = 0; i < satir.length; i++) {
      var s = satir[i].replace(/\r$/, '');
      if (!s) continue;
      var j = 0, n = 0;
      while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) { n = n * 10 + (s.charCodeAt(j) - 48); j++; }
      var w = onceki.slice(0, n) + s.slice(j);
      out.push(w); onceki = w;
    }
    return out;
  }
  function sozlukSikistir(kelimeler) {
    var out = [], onceki = '';
    for (var i = 0; i < kelimeler.length; i++) {
      var w = kelimeler[i], n = 0, m = Math.min(w.length, onceki.length);
      while (n < m && w[n] === onceki[n]) n++;
      out.push((n ? n : '') + w.slice(n)); onceki = w;
    }
    return out.join('\n') + '\n';
  }

  function say(s) {
    var c = Object.create(null);
    for (var i = 0; i < s.length; i++) c[s[i]] = (c[s[i]] || 0) + 1;
    return c;
  }

  // w'nin [bas, bas+bl) dışındaki harfleri raftan çıkar; sığmazsa null, sığarsa joker konumları.
  function sigdir(w, bas, bl, sayac, joker) {
    var kalan = Object.create(null), j = joker, jk = [];
    for (var k in sayac) kalan[k] = sayac[k];
    for (var i = 0; i < w.length; i++) {
      if (i >= bas && i < bas + bl) continue;
      var h = w[i];
      if (kalan[h] > 0) kalan[h]--;
      else if (j > 0) { j--; jk.push(i); }
      else return null;
    }
    return jk;
  }

  /* Harflerle arama.
     sozluk: kelime dizisi · rafMetni: "kalem*" · secenek: { gecen: "ka", uzunluk: 5, enAz: 2 }
     Dönüş: [{ k: kelime, j: [joker konumları], g: geçen ifadenin başladığı konum ya da -1 }] */
  function harflerle(sozluk, rafMetni, secenek) {
    secenek = secenek || {};
    var r = raf(rafMetni), gecen = harf(secenek.gecen || ''), uz = +secenek.uzunluk || 0;
    var joker = 0, duz = '';
    for (var i = 0; i < r.length; i++) { if (r[i] === '*') joker++; else duz += r[i]; }
    var sayac = say(duz), enCok = r.length + gecen.length, enAz = Math.max(2, +secenek.enAz || 2, gecen.length + (r.length ? 1 : 0));
    if (!r.length && !gecen) return [];
    if (!r.length) return []; // raf boşsa harflerle arama yok (kalıpla aransın)
    var out = [];
    for (var n = 0; n < sozluk.length; n++) {
      var w = sozluk[n], L = w.length;
      if (L > enCok || L < enAz) continue;
      if (uz && L !== uz) continue;
      if (gecen) {
        var at = w.indexOf(gecen), bulundu = null, bas = -1;
        while (at !== -1) {
          var jk = sigdir(w, at, gecen.length, sayac, joker);
          if (jk) { bulundu = jk; bas = at; break; }
          at = w.indexOf(gecen, at + 1);
        }
        if (bulundu) out.push({ k: w, j: bulundu, g: bas, p: puan(w, bulundu) });
      } else {
        var jk2 = sigdir(w, 0, 0, sayac, joker);
        if (jk2) out.push({ k: w, j: jk2, g: -1, p: puan(w, jk2) });
      }
    }
    return out;
  }

  function kalipRegex(k) {
    var src = '';
    for (var i = 0; i < k.length; i++) {
      var c = k[i];
      if (c === '?') src += '[a-zçğıöşü]';
      else if (c === '*') src += '[a-zçğıöşü]*';
      else src += c;
    }
    return new RegExp('^' + src + '$');
  }

  /* Kalıpla arama: "k?l?m", "ka*", "*lık", "*su*". secenek: { uzunluk }.
     Dönüş: [{ k, j: [], g: -1, s: [kalıptaki sabit harflerin konumları] }] */
  function kalipla(sozluk, kalipMetni, secenek) {
    secenek = secenek || {};
    var k = kalip(kalipMetni), uz = +secenek.uzunluk || 0;
    if (!k || k === '*') { if (!uz) return []; }
    var re = kalipRegex(k || '*'), sabitSay = k.replace(/[?*]/g, '').length, out = [];
    var yildizYok = k.indexOf('*') === -1;
    for (var n = 0; n < sozluk.length; n++) {
      var w = sozluk[n];
      if (uz && w.length !== uz) continue;
      if (yildizYok && w.length !== k.length) continue;
      if (w.length < Math.max(2, sabitSay)) continue;
      if (re.test(w)) out.push({ k: w, j: [], g: -1, p: puan(w) });
    }
    return out;
  }

  var tr = null;
  function karsilastir(a, b) {
    if (!tr) {
      try { tr = new Intl.Collator('tr').compare; } catch (e) { tr = function (x, y) { return x < y ? -1 : x > y ? 1 : 0; }; }
    }
    return tr(a, b);
  }
  // Uzundan kısaya, aynı uzunlukta alfabetik gruplar: [{ uzunluk, liste }]
  function grupla(sonuc) {
    var g = Object.create(null), uz = [];
    for (var i = 0; i < sonuc.length; i++) {
      var L = sonuc[i].k.length;
      if (!g[L]) { g[L] = []; uz.push(L); }
      g[L].push(sonuc[i]);
    }
    uz.sort(function (a, b) { return b - a; });
    return uz.map(function (L) {
      return { uzunluk: L, liste: g[L].sort(function (a, b) { return karsilastir(a.k, b.k); }) };
    });
  }

  // Puana göre: yüksekten düşüğe, eşitse uzun olan, sonra alfabetik.
  function puanaGore(sonuc) {
    return sonuc.slice().sort(function (a, b) {
      var pa = a.p != null ? a.p : puan(a.k, a.j), pb = b.p != null ? b.p : puan(b.k, b.j);
      return pb - pa || b.k.length - a.k.length || karsilastir(a.k, b.k);
    });
  }

  // Joker harfi büyük harfle göstermek için Türkçe büyük harf.
  function buyuk(s) { return String(s).replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase(); }

  return {
    HARFLER: HARFLER, MAX_HARF: MAX_HARF, kucuk: kucuk, harf: harf, raf: raf, kalip: kalip, buyuk: buyuk,
    sozlukAc: sozlukAc, sozlukSikistir: sozlukSikistir, harflerle: harflerle, kalipla: kalipla,
    grupla: grupla, karsilastir: karsilastir, PUAN: PUAN, puan: puan, puanaGore: puanaGore, harfMi: function (c) { return HARF_RE.test(c); }
  };
});
