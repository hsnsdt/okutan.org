/* Tahta çözücü — Web Worker: sözlüğü bir kez yükler, hamleleri arayüzü kilitlemeden hesaplar. */
importScripts('../motor.js?v=4', 'tahta-motor.js?v=1');
var hazir = null, bekleyen = null;
fetch('../sozluk.txt?v=1').then(function (r) { return r.text(); }).then(function (t) {
  hazir = self.KBTahta.hazirla(self.KelimeBulucu.sozlukAc(t));
  postMessage({ tur: 'hazir', n: hazir.sozluk.length });
  if (bekleyen) { coz(bekleyen); bekleyen = null; }
}).catch(function () { postMessage({ tur: 'hata' }); });
function coz(m) {
  var t0 = Date.now();
  var l = self.KBTahta.enIyiHamleler(hazir, m.tahta, m.raf, { sinir: 60 });
  postMessage({ tur: 'sonuc', id: m.id, hamleler: l, ms: Date.now() - t0 });
}
onmessage = function (e) { if (!hazir) bekleyen = e.data; else coz(e.data); };
