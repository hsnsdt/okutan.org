/* Kelime Bulucu — arayüz. Arama motoru motor.js'te (window.KelimeBulucu), ortak parçalar ortak.js'te (window.KBOrtak).
   Sözlük sozluk.txt'den (ön ekle sıkıştırılmış) bir kez yüklenir; arama tamamen tarayıcıda yapılır.
   Adres: ?h=harfler&b=geçecek&u=uzunluk (harflerle) · ?k=kalıp&u=uzunluk (kalıpla) */
(function () {
  'use strict';
  var KB = window.KelimeBulucu, O = window.KBOrtak;
  function $(id) { return document.getElementById(id); }
  var sozluk = null, bekleyen = false, gecenL = 0, sira = 'uz', sonDuz = [], puanTum = false, mod = 'harf', sonInput = null, sonGruplar = [], secUz = 0;
  var SINIR = 400;

  var hInp = $('hInp'), bInp = $('bInp'), kInp = $('kInp'), uSel = $('uSel');

  // ---------- sözlük ----------
  fetch('sozluk.txt?v=1').then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (t) {
    sozluk = KB.sozlukAc(t);
    $('dictInfo').textContent = sozluk.length.toLocaleString('tr-TR') + ' kelime hazır';
    if (bekleyen) ara(false);
  }).catch(function () {
    $('dictInfo').textContent = 'Sözlük yüklenemedi; sayfayı yenile.';
  });

  // ---------- sekmeler ----------
  function modSec(m, odak) {
    mod = m;
    $('tabHarf').setAttribute('aria-selected', m === 'harf');
    $('tabKalip').setAttribute('aria-selected', m === 'kalip');
    $('hFld').hidden = $('bFld').hidden = m !== 'harf';
    $('kFld').hidden = m !== 'kalip';
    $('kQ').hidden = m !== 'kalip';
    $('hintHarf').hidden = m !== 'harf';
    $('hintKalip').hidden = m !== 'kalip';
    if (odak) (m === 'harf' ? hInp : kInp).focus();
  }
  $('tabHarf').onclick = function () { modSec('harf', true); };
  $('tabKalip').onclick = function () { modSec('kalip', true); };

  // ---------- Türkçe harf tuşları ----------
  [hInp, bInp, kInp].forEach(function (el) { el.addEventListener('focus', function () { sonInput = el; }); });
  $('keys').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
  $('keys').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var el = sonInput && !sonInput.closest('[hidden]') ? sonInput : (mod === 'harf' ? hInp : kInp);
    var c = b.getAttribute('data-c');
    if (b.id === 'kSil') { sil(el); return; }
    if (b.id === 'kTemiz') { hInp.value = bInp.value = kInp.value = ''; uSel.value = '0'; temizle(); el.focus(); return; }
    if (el === bInp && (c === '*' || c === '?')) el = hInp;
    yaz(el, c);
  });
  function yaz(el, c) {
    var s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
    if (el.maxLength > 0 && el.value.length - (e - s) >= el.maxLength) return;
    el.value = el.value.slice(0, s) + c + el.value.slice(e);
    try { el.setSelectionRange(s + c.length, s + c.length); } catch (x) {}
    el.focus();
  }
  function sil(el) {
    var s = el.selectionStart == null ? el.value.length : el.selectionStart, e = el.selectionEnd == null ? s : el.selectionEnd;
    if (s === e && s > 0) s--;
    el.value = el.value.slice(0, s) + el.value.slice(e);
    try { el.setSelectionRange(s, s); } catch (x) {}
    el.focus();
  }
  // "/" ile arama kutusuna git
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); (mod === 'harf' ? hInp : kInp).focus(); }
  });

  // ---------- arama ----------
  $('form').addEventListener('submit', function (e) { e.preventDefault(); ara(true); });
  uSel.addEventListener('change', function () { if (sonGruplar.length || adresVar()) ara(true); });
  function adresVar() { return /[?&](h|k)=/.test(location.search); }

  function ara(kaydir) {
    var u = +uSel.value || 0, sonuc, ozet;
    if (mod === 'harf') {
      var r = KB.raf(hInp.value), g = KB.harf(bInp.value);
      if (!r) { hata('Harflerini yaz', 'Örneğin: kalem, kitap* ya da sadece harfler: aeklm'); adresYaz(); return; }
      if (!sozluk) { bekleyen = true; yukleniyor(); return; }
      sonuc = KB.harflerle(sozluk, r, { gecen: g, uzunluk: u }); gecenL = g.length;
      ozet = '<b>' + KB.buyuk(r) + '</b>' + (g ? ' + geçecek <b>' + KB.buyuk(g) + '</b>' : '');
    } else {
      var k = KB.kalip(kInp.value);
      if (!k || (k === '*' && !u)) { hata('Bir kalıp yaz', '? tek harf, * herhangi sayıda harf: k?t?p, ka*, *lık'); adresYaz(); return; }
      if (!sozluk) { bekleyen = true; yukleniyor(); return; }
      sonuc = KB.kalipla(sozluk, k, { uzunluk: u });
      ozet = 'kalıp <b>' + KB.buyuk(k) + '</b>';
    }
    bekleyen = false;
    adresYaz();
    secUz = 0;
    sonGruplar = KB.grupla(sonuc); sonDuz = KB.puanaGore(sonuc); puanTum = false;
    ciz(sonuc.length, ozet + (u ? ' · ' + u + ' harfli' : ''));
    if (kaydir && sonuc.length && matchMedia('(max-width: 820px)').matches) $('res').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function adresYaz() {
    var p = new URLSearchParams(), u = uSel.value;
    if (mod === 'harf') { if (hInp.value) p.set('h', KB.raf(hInp.value)); if (bInp.value) p.set('b', KB.harf(bInp.value)); }
    else if (kInp.value) p.set('k', KB.kalip(kInp.value));
    if (u && u !== '0') p.set('u', u);
    var q = p.toString();
    try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '')); } catch (e) {}
  }

  function yukleniyor() {
    $('res').hidden = false;
    $('resTitle').innerHTML = 'Sözlük yükleniyor…';
    $('lens').innerHTML = ''; $('resBody').innerHTML = '';
  }
  function hata(b, a) {
    $('res').hidden = false;
    $('resTitle').innerHTML = '';
    $('lens').innerHTML = ''; sonGruplar = [];
    $('resBody').innerHTML = '<div class="empty"><b>' + b + '</b>' + a + '</div>';
  }
  function temizle() {
    sonGruplar = [];
    $('res').hidden = true;
    adresYaz();
  }

  function kelimeHtml(x) {
    var w = x.k, j = {}, out = '';
    for (var i = 0; i < x.j.length; i++) j[x.j[i]] = 1;
    var gb = x.g, ge = x.g >= 0 ? x.g + gecenL : -1;
    for (var n = 0; n < w.length; n++) {
      var c = w[n];
      if (n === gb) out += '<u>';
      out += j[n] ? '<i>' + c + '</i>' : c;
      if (n === ge - 1) out += '</u>';
    }
    return '<li data-k="' + w + '">' + out + '<sub>' + x.p + '</sub></li>';
  }

  function ciz(toplam, ozet) {
    $('res').hidden = false;
    if (!toplam) {
      $('resTitle').innerHTML = '';
      $('lens').innerHTML = ''; $('sortB').hidden = true;
      $('resBody').innerHTML = '<div class="empty"><b>Kelime bulunamadı</b>' + ozet + ' ile kurulan bir kelime yok. ' +
        (mod === 'harf' ? 'Bir joker (*) eklemeyi ya da uzunluk süzgecini kaldırmayı dene.' : 'Kalıba * ekleyerek aramayı genişletebilirsin.') + '</div>';
      return;
    }
    var en = sonDuz[0];
    $('resTitle').innerHTML = toplam.toLocaleString('tr-TR') + ' kelime <small>' + ozet + ' · en yüksek puan: ' + KB.buyuk(en.k) + ' ' + en.p + '</small>';
    $('sortB').hidden = false;
    var l = '<button type="button" data-u="0" class="on">Tümü<small>' + toplam.toLocaleString('tr-TR') + '</small></button>';
    sonGruplar.forEach(function (g) { l += '<button type="button" data-u="' + g.uzunluk + '">' + g.uzunluk + ' harf<small>' + g.liste.length.toLocaleString('tr-TR') + '</small></button>'; });
    $('lens').innerHTML = sonGruplar.length > 1 ? l : '';
    govde();
  }
  function govde() {
    var h = '';
    if (sira === 'puan') {
      var l = secUz ? sonDuz.filter(function (x) { return x.k.length === secUz; }) : sonDuz;
      var lim = puanTum ? l.length : Math.min(l.length, SINIR);
      h = '<div class="grp"><h3>Puana göre, yüksekten düşüğe <small>' + l.length.toLocaleString('tr-TR') + '</small></h3><ul class="ws">';
      for (var n = 0; n < lim; n++) h += kelimeHtml(l[n]);
      h += '</ul>' + (lim < l.length ? '<button type="button" class="more" data-tump="1">Tüm ' + l.length.toLocaleString('tr-TR') + ' kelimeyi göster →</button>' : '') + '</div>';
      $('resBody').innerHTML = h;
      return;
    }
    sonGruplar.forEach(function (g) {
      if (secUz && g.uzunluk !== secUz) return;
      var limit = secUz ? g.liste.length : Math.min(g.liste.length, SINIR);
      h += '<div class="grp"><h3>' + g.uzunluk + ' harfli <small>' + g.liste.length.toLocaleString('tr-TR') + '</small></h3><ul class="ws">';
      for (var i = 0; i < limit; i++) h += kelimeHtml(g.liste[i]);
      h += '</ul>' + (limit < g.liste.length ? '<button type="button" class="more" data-tum="' + g.uzunluk + '">Tüm ' + g.liste.length.toLocaleString('tr-TR') + ' kelimeyi göster →</button>' : '') + '</div>';
    });
    $('resBody').innerHTML = h;
  }
  $('lens').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    secUz = +b.getAttribute('data-u');
    [].forEach.call($('lens').children, function (x) { x.classList.toggle('on', x === b); });
    govde();
  });
  $('resBody').addEventListener('click', function (e) {
    if (e.target.closest('[data-tump]')) { puanTum = true; govde(); return; }
    var b = e.target.closest('[data-tum]'); if (!b) return;
    secUz = +b.getAttribute('data-tum');
    [].forEach.call($('lens').children, function (x) { x.classList.toggle('on', +x.getAttribute('data-u') === secUz); });
    govde();
    $('res').scrollIntoView({ block: 'start' });
  });
  // örnek aramalar
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-ornek]'); if (!a) return;
    e.preventDefault();
    var p = new URLSearchParams(a.getAttribute('data-ornek'));
    adrestenAc(p); ara(true);
  });

  // ---------- sıralama (harf sayısı / puan) ----------
  function siraSec(s2) {
    sira = s2 === 'puan' ? 'puan' : 'uz';
    [].forEach.call($('sortB').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-s') === sira); });
    try { localStorage.setItem('kb_sira', sira); } catch (e) {}
  }
  $('sortB').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    siraSec(b.getAttribute('data-s')); if (sonGruplar.length) govde();
  });
  try { siraSec(localStorage.getItem('kb_sira')); } catch (e) {}

  // ---------- kontroller sekmesi ----------
  [['cTabDesk', 'ctlDesk'], ['cTabMob', 'ctlMob']].forEach(function (p, i, all) {
    $(p[0]).onclick = function () { all.forEach(function (q) { $(q[0]).setAttribute('aria-selected', q === p); $(q[1]).hidden = q !== p; }); };
  });
  if (matchMedia('(pointer: coarse)').matches) $('cTabMob').click();

  // ---------- başlangıç ----------
  function adrestenAc(p) {
    hInp.value = p.get('h') || ''; bInp.value = p.get('b') || ''; kInp.value = p.get('k') || '';
    var u = p.get('u'); uSel.value = u && uSel.querySelector('option[value="' + (+u) + '"]') ? String(+u) : '0';
    modSec(p.get('k') != null && !p.get('h') ? 'kalip' : 'harf', false);
  }
  var ilk = new URLSearchParams(location.search);
  adrestenAc(ilk);
  if (ilk.get('h') || ilk.get('k')) ara(false);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
