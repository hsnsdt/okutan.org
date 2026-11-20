/* Tahta çözücü — arayüz. Motor tahta-motor.js (KBTahta), hesap tahta-isci.js (Web Worker).
   Tahta ve raf tarayıcıda saklanır (localStorage kb_tahta). */
(function () {
  'use strict';
  var T = window.KBTahta, KB = window.KelimeBulucu, O = window.KBOrtak;
  function $(id) { return document.getElementById(id); }
  var N = T.N, tahta = T.bosTahta(), imlec = { r: 7, c: 7 }, yon = 'y', hamleler = [], secili = -1, gecmis = [];
  var izgara = $('tahta'), gizli = $('gizliInp'), rafInp = $('rafInp');
  var buyuk = KB.buyuk, sayi = function (n) { return n.toLocaleString('tr-TR'); };

  // ---------- kaydet / yükle ----------
  function kaydet() { try { localStorage.setItem('kb_tahta', JSON.stringify({ t: tahta, r: rafInp.value })); } catch (e) {} }
  try { var k = JSON.parse(localStorage.getItem('kb_tahta') || 'null'); if (k && k.t && k.t.length === N) { tahta = k.t; rafInp.value = k.r || ''; } } catch (e) {}

  // ---------- tahta çizimi ----------
  var hucreler = [];
  (function kur() {
    var h = '<div class="tk"></div>';
    for (var c = 0; c < N; c++) h += '<div class="tk">' + String.fromCharCode(65 + c) + '</div>';
    for (var r = 0; r < N; r++) {
      h += '<div class="tk">' + (r + 1) + '</div>';
      for (var c2 = 0; c2 < N; c2++) {
        var kr = T.KARE[r][c2];
        h += '<button type="button" class="hk ' + (kr ? kr.toLowerCase() : '') + (r === 7 && c2 === 7 ? ' mrk' : '') + '" data-r="' + r + '" data-c="' + c2 + '" aria-label="' + T.koordinat(r, c2) + '"><span class="kl">' + ({ K3: 'K×3', K2: 'K×2', H3: 'H×3', H2: 'H×2' }[kr] || '') + '</span></button>';
      }
    }
    izgara.innerHTML = h;
    hucreler = [].slice.call(izgara.querySelectorAll('.hk'));
  })();
  function hucre(r, c) { return hucreler[r * N + c]; }
  function ciz() {
    var on = secili >= 0 ? hamleler[secili] : null, hayal = Object.create(null);
    if (on) on.yeni.forEach(function (y) { hayal[y.r * N + y.c] = y; });
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var el = hucre(r, c), t = tahta[r][c], hy = hayal[r * N + c];
      var x = t || hy;
      el.classList.toggle('dolu', !!t); el.classList.toggle('hayal', !!hy); el.classList.toggle('jk', !!(x && x.j));
      el.classList.toggle('imlec', r === imlec.r && c === imlec.c);
      el.innerHTML = x ? '<b>' + buyuk(x.h) + '</b><small>' + (x.j ? 0 : (T.PUAN[x.h] || 0)) + '</small>' : '<span class="kl">' + ({ K3: 'K×3', K2: 'K×2', H3: 'H×3', H2: 'H×2' }[T.KARE[r][c]] || (r === 7 && c === 7 ? '★' : '')) + '</span>';
    }
    izgara.setAttribute('data-yon', yon);
    $('yonBtn').textContent = yon === 'y' ? 'Yön: yatay →' : 'Yön: dikey ↓';
    rafCiz();
  }
  function rafCiz() {
    var r = KB.raf(rafInp.value).slice(0, 7);
    $('rafT').innerHTML = r.split('').map(function (c) { return c === '*' ? '<i class="jk">*<small>0</small></i>' : '<i>' + buyuk(c) + '<small>' + (T.PUAN[c] || 0) + '</small></i>'; }).join('') +
      '<span class="bos">' + new Array(Math.max(0, 8 - r.length)).join('<i class="b"></i>') + '</span>';
  }

  // ---------- yazma ----------
  function sec(r, c, odak) { imlec = { r: r, c: c }; ciz(); if (odak !== false) { gizli.value = ''; gizli.focus({ preventScroll: true }); } }
  function ilerle(adim) {
    var r = imlec.r + (yon === 'd' ? adim : 0), c = imlec.c + (yon === 'y' ? adim : 0);
    if (r >= 0 && r < N && c >= 0 && c < N) imlec = { r: r, c: c };
  }
  function harfKoy(h, joker) {
    gecmis.push(JSON.stringify(tahta));
    tahta[imlec.r][imlec.c] = { h: h, j: !!joker };
    ilerle(1); temizleSonuc(); kaydet(); ciz();
  }
  function sil(geri) {
    gecmis.push(JSON.stringify(tahta));
    if (geri && !tahta[imlec.r][imlec.c]) ilerle(-1);
    tahta[imlec.r][imlec.c] = null; temizleSonuc(); kaydet(); ciz();
  }
  izgara.addEventListener('click', function (e) {
    var b = e.target.closest('.hk'); if (!b) return;
    var r = +b.getAttribute('data-r'), c = +b.getAttribute('data-c');
    if (r === imlec.r && c === imlec.c && !tahta[r][c]) { yon = yon === 'y' ? 'd' : 'y'; ciz(); gizli.focus({ preventScroll: true }); return; }
    sec(r, c);
  });
  izgara.addEventListener('dblclick', function (e) {
    var b = e.target.closest('.hk'); if (!b) return;
    var r = +b.getAttribute('data-r'), c = +b.getAttribute('data-c');
    if (tahta[r][c]) { tahta[r][c].j = !tahta[r][c].j; temizleSonuc(); kaydet(); ciz(); }
  });
  var jokerSonraki = false;
  gizli.addEventListener('input', function () {
    var v = KB.kucuk(gizli.value); gizli.value = '';
    for (var i = 0; i < v.length; i++) {
      var ch = v[i];
      if (ch === '*' || ch === '?') { jokerSonraki = true; continue; }
      if (KB.harfMi(ch)) { harfKoy(ch, jokerSonraki); jokerSonraki = false; }
    }
  });
  gizli.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'Backspace') { e.preventDefault(); sil(true); }
    else if (k === 'Delete') { e.preventDefault(); sil(false); }
    else if (k === ' ' || k === 'Tab') { e.preventDefault(); yon = yon === 'y' ? 'd' : 'y'; ciz(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      var r = imlec.r + (k === 'ArrowDown') - (k === 'ArrowUp'), c = imlec.c + (k === 'ArrowRight') - (k === 'ArrowLeft');
      if (r >= 0 && r < N && c >= 0 && c < N) sec(r, c);
    } else if (k === 'Enter') { e.preventDefault(); bul(); }
    else if (k === 'Escape') gizli.blur();
  });
  $('yonBtn').onclick = function () { yon = yon === 'y' ? 'd' : 'y'; ciz(); gizli.focus({ preventScroll: true }); };
  $('jokerBtn').onclick = function () { var x = tahta[imlec.r][imlec.c]; if (x) { x.j = !x.j; temizleSonuc(); kaydet(); ciz(); } else { jokerSonraki = !jokerSonraki; $('jokerBtn').classList.toggle('on', jokerSonraki); } gizli.focus({ preventScroll: true }); };
  $('geriBtn').onclick = function () { if (gecmis.length) { tahta = JSON.parse(gecmis.pop()); temizleSonuc(); kaydet(); ciz(); } };
  $('temizBtn').onclick = function () { if (!confirmSil()) return; gecmis.push(JSON.stringify(tahta)); tahta = T.bosTahta(); temizleSonuc(); kaydet(); ciz(); };
  function confirmSil() { var b = $('temizBtn'); if (b.dataset.onay) { delete b.dataset.onay; b.textContent = 'Tahtayı temizle'; return true; } b.dataset.onay = '1'; b.textContent = 'Emin misin? Tekrar bas'; setTimeout(function () { delete b.dataset.onay; b.textContent = 'Tahtayı temizle'; }, 2500); return false; }
  // Türkçe harf tuşları: odaktaki alana (tahta ya da raf) yazar
  var sonAlan = 'tahta';
  gizli.addEventListener('focus', function () { sonAlan = 'tahta'; izgara.classList.add('odak'); });
  gizli.addEventListener('blur', function () { izgara.classList.remove('odak'); });
  rafInp.addEventListener('focus', function () { sonAlan = 'raf'; });
  rafInp.addEventListener('input', function () { kaydet(); rafCiz(); temizleSonuc(); });
  $('keys').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
  $('keys').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-c]'); if (!b) return;
    var c = b.getAttribute('data-c');
    if (sonAlan === 'raf') { if (KB.raf(rafInp.value).length < 7) { rafInp.value += c; rafCiz(); kaydet(); } rafInp.focus(); }
    else if (c === '*') { jokerSonraki = true; $('jokerBtn').classList.add('on'); gizli.focus({ preventScroll: true }); }
    else { harfKoy(c, jokerSonraki); jokerSonraki = false; $('jokerBtn').classList.remove('on'); gizli.focus({ preventScroll: true }); }
  });

  // ---------- çözüm ----------
  var isci = new Worker('tahta-isci.js?v=1'), istekId = 0, hazir = false;
  isci.onmessage = function (e) {
    var m = e.data;
    if (m.tur === 'hazir') { hazir = true; $('durum').textContent = sayi(m.n) + ' kelime hazır'; return; }
    if (m.tur === 'hata') { $('durum').textContent = 'Sözlük yüklenemedi; sayfayı yenile.'; return; }
    if (m.id !== istekId) return;
    hamleler = m.hamleler; secili = hamleler.length ? 0 : -1;
    sonucCiz(m.ms); ciz();
  };
  function bul() {
    var r = KB.raf(rafInp.value).slice(0, 7);
    if (!r) { $('sonuc').hidden = false; $('sonucL').innerHTML = '<div class="empty"><b>Raftaki harflerini yaz</b>En çok 7 harf; boş taş (joker) için *.</div>'; $('sonucB').textContent = ''; rafInp.focus(); return; }
    $('sonuc').hidden = false; $('sonucB').textContent = hazir ? 'Hesaplanıyor…' : 'Sözlük yükleniyor…'; $('sonucL').innerHTML = '';
    isci.postMessage({ id: ++istekId, tahta: tahta, raf: r });
  }
  $('bulBtn').onclick = bul;
  function temizleSonuc() { if (hamleler.length) { hamleler = []; secili = -1; $('sonuc').hidden = true; } }
  function sonucCiz(ms) {
    if (!hamleler.length) { $('sonucB').textContent = 'Hamle bulunamadı'; $('sonucL').innerHTML = '<div class="empty"><b>Bu harflerle uygun hamle yok</b>Bir joker (*) eklemeyi ya da tahtadaki harfleri kontrol etmeyi dene. İlk hamle ortadaki ★ kareden geçmeli.</div>'; return; }
    $('sonucB').innerHTML = sayi(hamleler.length) + ' hamle <small>' + (ms / 1000).toFixed(1).replace('.', ',') + ' sn</small>';
    $('sonucL').innerHTML = hamleler.map(function (h, i) {
      return '<li><button type="button" class="hm' + (i === secili ? ' on' : '') + '" data-i="' + i + '"><span class="hs">' + (i + 1) + '</span><span class="hw">' +
        h.kelime.split('').map(function (c, j) { var y = h.yeni.find(function (q) { return (h.yon === 'y' ? q.c - h.c : q.r - h.r) === j; }); return '<i class="' + (y ? (y.j ? 'yn jk' : 'yn') : 'es') + '">' + buyuk(c) + '</i>'; }).join('') +
        '</span><span class="hk2">' + T.koordinat(h.r, h.c) + (h.yon === 'y' ? ' →' : ' ↓') + (h.capraz.length ? ' · +' + h.capraz.join(', ') : '') + (h.bingo ? ' · <b>+50</b>' : '') + '</span>' + O.rozet(h.puan) + '</button></li>';
    }).join('');
  }
  $('sonucL').addEventListener('click', function (e) {
    var b = e.target.closest('.hm'); if (!b) return;
    secili = +b.getAttribute('data-i');
    [].forEach.call($('sonucL').querySelectorAll('.hm'), function (x) { x.classList.toggle('on', +x.getAttribute('data-i') === secili); });
    ciz();
    if (matchMedia('(max-width: 820px)').matches) izgara.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('koyBtn').onclick = function () {
    var h = hamleler[secili]; if (!h) return;
    gecmis.push(JSON.stringify(tahta));
    var raf = KB.raf(rafInp.value).split('');
    h.yeni.forEach(function (y) { tahta[y.r][y.c] = { h: y.h, j: y.j }; var i = raf.indexOf(y.j ? '*' : y.h); if (i >= 0) raf.splice(i, 1); });
    rafInp.value = raf.join(''); hamleler = []; secili = -1; $('sonuc').hidden = true; kaydet(); ciz();
  };
  $('sayfaBtn').onclick = function () { var h = hamleler[secili]; if (h) location.href = O.kelimeUrl(h.kelime); };

  // ---------- kontroller sekmesi ----------
  [['cTabDesk', 'ctlDesk'], ['cTabMob', 'ctlMob']].forEach(function (p, i, all) {
    $(p[0]).onclick = function () { all.forEach(function (q) { $(q[0]).setAttribute('aria-selected', q === p); $(q[1]).hidden = q !== p; }); };
  });
  if (matchMedia('(pointer: coarse)').matches) $('cTabMob').click();
  ciz();
})();
