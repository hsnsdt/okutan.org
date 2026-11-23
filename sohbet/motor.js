/* Canlı Sohbet — kural motoru (arayüzden ayrı; tarayıcıda window.SohbetMotor, Node'da module.exports)
   Komut ayrıştırma, rumuz denetimi ve rengi, mesajın parçalara ayrılması (bağlantı, oyun daveti, ad geçmesi),
   kişi listesi farkı (katıldı/ayrıldı satırları veritabanına yazılmaz, buradan üretilir), Tab ile rumuz tamamlama. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SohbetMotor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Kanallar sabit; sunucu (api/index.php) aynı listeyi kullanır.
  var KANALLAR = [
    { id: 'genel', ad: 'genel', konu: 'Her şeyden konuşalım. Hoş geldin!' },
    { id: 'okey', ad: 'okey', konu: 'Okey ve 101 Okey: masa kur, davet bağlantını paylaş.' },
    { id: 'tavla', ad: 'tavla', konu: 'Tavla: rakip ara, maç sonrası sohbet.' },
    { id: 'kart', ad: 'kart', konu: 'Batak, King ve Pişti masaları.' },
    { id: 'kelime', ad: 'kelime', konu: 'Gizli Kelime, Kelime Bulucu ve Kelimeler.' }
  ];
  var KANAL_ID = {}; KANALLAR.forEach(function (k) { KANAL_ID[k.id] = k; });

  // Davet bağlantısı verilebilen oyunlar: yol → görünen ad
  var OYUNLAR = { '101-okey': '101 Okey', 'okey': 'Okey', 'tavla': 'Tavla', 'batak': 'Batak', 'king': 'King', 'pisti': 'Pişti', 'ates-ve-su': 'Ateş ve Su' };

  // Oyunun davetinin düşeceği kanal (oyunlardaki "Sohbette duyur" düğmesi de aynı eşlemeyi kullanır: assets/okey-sohbet.js)
  var OYUN_KANAL = { '101-okey': 'okey', 'okey': 'okey', 'tavla': 'tavla', 'batak': 'kart', 'king': 'kart', 'pisti': 'kart', 'ates-ve-su': 'genel' };
  function kanalOyun(oyun) { return OYUN_KANAL[oyun] || 'genel'; }

  var MAKS_MESAJ = 300;

  function trKucuk(s) { return String(s).replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase(); }

  // Sunucudaki clean_name ile aynı kural (son söz sunucunun): 2–16 karakter, harf/rakamla başlar; harf, rakam, boşluk, . _ -
  function rumuzDuzelt(n) { return String(n == null ? '' : n).replace(/\s+/g, ' ').trim(); }
  function rumuzGecerli(n) {
    n = rumuzDuzelt(n);
    var len = Array.from(n).length;
    if (len < 2 || len > 16) return false;
    return /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(n);
  }

  // Rumuz rengi: FNV-1a(küçük harf) → 10 renkten biri (CSS'te --n0 … --n9)
  function fnv1a(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  function renk(nick) { return fnv1a(trKucuk(nick)) % 10; }

  // Cinsiyete göre rumuz rengi: e erkek (mavi), k kadın (pembe), b ya da seçilmemiş (yeşil). CSS: .g-e .g-k .g-b
  function gSinif(g) { return 'g-' + (g === 'e' || g === 'k' ? g : 'b'); }
  var CINSIYET = { e: 'Erkek', k: 'Kadın', b: 'Belirtmek istemiyorum' };
  // Avatar harfi: rumuzun ilk harfi ya da rakamı, Türkçe büyük harf (i → İ)
  function basHarf(nick) { var c = Array.from(String(nick || '?').trim())[0] || '?'; return c.toLocaleUpperCase('tr-TR'); }
  // Rol: op 1 moderatör, 2 yönetici
  function rolAdi(op) { return op === 2 ? 'YÖNETİCİ' : op ? 'MOD' : ''; }

  // özel konuşma: 'p' + oda numarası (sunucu üyeliği denetler)
  function ozelMi(ch) { return /^p\d{1,10}$/.test(String(ch || '')); }

  function kanalBul(s) {
    s = trKucuk(String(s || '').trim()).replace(/^#/, '');
    return KANAL_ID[s] ? s : null;
  }

  // Yazılan satırı komuta çevirir. "//" ile başlayan satır komut değil, düz mesajdır.
  function komut(satir) {
    var s = String(satir == null ? '' : satir).replace(/\s+$/, '');
    if (!s.trim()) return { t: 'bos' };
    if (s.slice(0, 2) === '//') return { t: 'say', text: s.slice(1) };
    if (s[0] !== '/') return { t: 'say', text: s };
    var m = /^\/(\S+)\s*([\s\S]*)$/.exec(s), ad = trKucuk(m[1]), arg = m[2].trim();
    switch (ad) {
      case 'me': case 'ben':
        return arg ? { t: 'me', text: arg } : { t: 'hata', msg: '/me ardından ne yaptığını yaz: /me çay koyuyor' };
      case 'nick': case 'rumuz': case 'ad':
        if (!arg) return { t: 'hata', msg: 'Yeni rumuzu yaz: /nick Rumuz' };
        return rumuzGecerli(arg) ? { t: 'nick', nick: rumuzDuzelt(arg) } : { t: 'hata', msg: 'Rumuz 2–16 karakter olmalı; harf, rakam, boşluk, nokta, alt çizgi ve tire kullanılabilir.' };
      case 'join': case 'j': case 'katil': case 'katıl': case 'kanal': {
        var k = kanalBul(arg);
        return k ? { t: 'join', ch: k } : { t: 'hata', msg: 'Böyle bir kanal yok. Kanallar: ' + KANALLAR.map(function (x) { return '#' + x.id; }).join(' ') };
      }
      case 'away': case 'uzakta': case 'afk':
        return { t: 'away', reason: Array.from(arg).slice(0, 40).join('') };
      case 'back': case 'dondum': case 'döndüm':
        return { t: 'away', reason: '', back: true };
      case 'clear': case 'temizle': case 'cls':
        return { t: 'clear' };
      case 'help': case 'yardim': case 'yardım': case 'komutlar': case '?':
        return { t: 'help' };
      case 'msg': case 'query': case 'q': case 'ozel': case 'özel': {
        // /msg Rumuz metin · /query Rumuz · boşluklu rumuz tırnakla: /msg "Ali Veli" selam
        var mq = /^"([^"]+)"\s*([\s\S]*)$/.exec(arg) || /^(\S+)\s*([\s\S]*)$/.exec(arg);
        if (!mq) return { t: 'hata', msg: 'Kullanım: /msg Rumuz mesaj (boşluklu rumuzu tırnağa al: /msg "Ali Veli" selam)' };
        var hn = rumuzDuzelt(mq[1]), ht = mq[2].trim();
        if (!rumuzGecerli(hn)) return { t: 'hata', msg: 'Rumuz geçersiz: ' + hn };
        return ad === 'msg' && ht ? { t: 'msg', nick: hn, text: ht } : { t: 'query', nick: hn };
      }
      case 'sustur': case 'mute': {
        var mm = /^(.+?)(?:\s+(\d{1,3}))?$/.exec(arg);
        if (!mm) return { t: 'hata', msg: 'Kullanım: /sustur Rumuz 10 (dakika, en çok 60)' };
        return { t: 'mute', nick: rumuzDuzelt(mm[1]), min: Math.max(1, Math.min(60, +(mm[2] || 10))) };
      }
      default:
        return { t: 'hata', msg: '/' + m[1] + ' diye bir komut yok. Komutlar için /yardim yaz.' };
    }
  }

  // Mesaj metninde benim rumuzum geçiyor mu? (büyük/küçük harf ve Türkçe I/İ duyarsız, kelime sınırıyla)
  function bahsediyor(text, nick) {
    if (!nick) return false;
    var t = trKucuk(text), n = trKucuk(nick), i = 0;
    while ((i = t.indexOf(n, i)) !== -1) {
      var once = i > 0 ? t[i - 1] : '', sonra = t[i + n.length] || '';
      if (!/[\p{L}\p{N}]/u.test(once) && !/[\p{L}\p{N}]/u.test(sonra)) return true;
      i += 1;
    }
    return false;
  }

  // Metni parçalara ayırır: düz metin, okutan.org bağlantısı, oyun daveti. (Başka sitelerin bağlantılarını sunucu zaten kaldırır.)
  var LINK = /(?:https?:\/\/)?(?:www\.)?okutan\.org(\/[^\s<>"']*)?/gi;
  function parcala(text) {
    var out = [], s = String(text), last = 0, m;
    LINK.lastIndex = 0;
    while ((m = LINK.exec(s))) {
      var once = m.index > 0 ? s[m.index - 1] : '';
      if (/[\p{L}\p{N}.@-]/u.test(once)) continue; // ör. "xokutan.org" ya da e-posta değil
      var ham = m[0].replace(/[.,!?;:)\]]+$/, ''); // cümle sonundaki noktalama bağlantıya dahil değil
      var yol = (m[1] || '/').slice(0, (m[1] || '/').length - (m[0].length - ham.length));
      if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
      var d = /^\/([a-z0-9-]+)\/?(?:index\.html)?\?(?:[^#\s]*&)?masa=([A-Za-z0-9]{6})(?![A-Za-z0-9])/.exec(yol);
      if (d && OYUNLAR[d[1]]) out.push({ t: 'davet', oyun: d[1], ad: OYUNLAR[d[1]], kod: d[2].toUpperCase(), href: '/' + d[1] + '/?masa=' + d[2].toUpperCase(), v: ham });
      else out.push({ t: 'link', href: 'https://okutan.org' + (yol || '/'), v: ham });
      last = m.index + ham.length;
      LINK.lastIndex = last;
    }
    if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
    return out;
  }

  // Kişi listesi farkı: [{id, nick}] eski ve yeni → katılanlar ve ayrılanlar (rumuz değişikliği ayrı mesajla gelir, aynı id ise sayılmaz)
  function farklar(eski, yeni) {
    var a = {}, b = {}, gelen = [], giden = [];
    (eski || []).forEach(function (u) { a[u.id] = u; });
    (yeni || []).forEach(function (u) { b[u.id] = u; if (!a[u.id]) gelen.push(u.nick); });
    (eski || []).forEach(function (u) { if (!b[u.id]) giden.push(u.nick); });
    return { gelen: gelen, giden: giden };
  }

  // Tab tamamlama: önekle başlayan rumuzlar (alfabetik, Türkçe); sıradaki için indeks verilir
  function tamamla(onek, nickler, sira) {
    var o = trKucuk(onek || '');
    if (!o) return null;
    var list = (nickler || []).filter(function (n) { return trKucuk(n).indexOf(o) === 0; })
      .sort(function (x, y) { return trKucuk(x).localeCompare(trKucuk(y), 'tr'); });
    if (!list.length) return null;
    return list[(sira || 0) % list.length];
  }

  // Gün ayırıcı etiketi: aynı gün "Bugün", bir önceki "Dün", daha eskisi "21 Kasım 2026" (yerel saat)
  var AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  function gunAnahtari(t) { var d = new Date(t * 1000); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  function gunEtiketi(t, simdi) {
    var d = new Date(t * 1000), n = new Date((simdi || Date.now() / 1000) * 1000);
    var bugun = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime(), o = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var fark = Math.round((bugun - o) / 86400000);
    if (fark === 0) return 'Bugün';
    if (fark === 1) return 'Dün';
    return d.getDate() + ' ' + AYLAR[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Emoji seçici (sık kullanılanlar)
  var EMOJILER = ['😀', '😂', '🤣', '😊', '😍', '😎', '🤔', '😅', '😢', '😡', '😴', '🙄', '👍', '👎', '👏', '🙏', '🤝', '👋', '💪', '🔥', '❤️', '💔', '⭐', '🎉',
    '☕', '🍵', '🍀', '🎲', '🃏', '♠️', '♥️', '♦️', '♣️', '🏆', '😇', '😏', '😬', '🤗', '🤐', '👀'];

  // Sunucu hata kodlarının Türkçesi
  var HATALAR = {
    slow: 'Biraz yavaş: birkaç saniye sonra tekrar yaz.',
    dup: 'Aynı mesajı az önce gönderdin.',
    muted: 'Şu an susturuldun; bir süre mesaj gönderemezsin.',
    banned: 'Bu sohbete erişimin kapatıldı.',
    nick_taken: 'Bu rumuz başkasında. Başka bir rumuz seç.',
    bad_nick: 'Bu rumuz kullanılamaz. Harf, rakam, boşluk, nokta, alt çizgi ve tire kullan (2–16 karakter).',
    nick_wait: 'Rumuzu çok sık değiştiriyorsun; biraz bekle.',
    need_nick: 'Önce bir rumuz seç.',
    empty: 'Boş mesaj gönderilemez.',
    not_op: 'Bunu yalnızca moderatörler yapabilir.',
    no_user: 'Bu rumuzda kimse yok.',
    rate_limited: 'Çok fazla deneme; biraz sonra tekrar dene.',
    ozel_onay: 'Özel sohbet için önce 18 yaş beyanını ve kuralları onayla.',
    need_both: 'İki kutuyu da işaretlemelisin.',
    karsi_onay: 'Bu kişi özel sohbeti açmamış.',
    karsi_kapali: 'Bu kişi özel mesaj almıyor.',
    engelli: 'Bu konuşmada engel var; mesaj gönderilemez.',
    kendin: 'Kendine özel mesaj gönderemezsin.',
    no_room: 'Oda bulunamadı ya da kapatıldı.',
    oda_dolu: 'Oda dolu (en çok 50 kişi).',
    atildin: 'Bu odadan çıkarıldın.',
    room_closed: 'Bu konuşma yönetici tarafından kapatıldı.',
    not_owner: 'Bunu yalnızca oda sahibi yapabilir.',
    not_admin: 'Bunu yalnızca yönetici yapabilir.',
    bad_name: 'Oda adı en az 2 karakter olmalı.',
    db_unavailable: 'Sohbet şu an kapalı; birazdan tekrar dene.',
    not_configured: 'Sohbet henüz kurulmadı.'
  };
  function hataMetni(kod) { return HATALAR[kod] || 'Bir şey ters gitti; tekrar dene.'; }

  return { KANALLAR: KANALLAR, OYUNLAR: OYUNLAR, MAKS_MESAJ: MAKS_MESAJ, trKucuk: trKucuk, rumuzDuzelt: rumuzDuzelt, rumuzGecerli: rumuzGecerli,
    renk: renk, fnv1a: fnv1a, kanalBul: kanalBul, komut: komut, bahsediyor: bahsediyor, parcala: parcala, farklar: farklar, tamamla: tamamla, hataMetni: hataMetni,
    gunAnahtari: gunAnahtari, gunEtiketi: gunEtiketi, EMOJILER: EMOJILER, kanalOyun: kanalOyun,
    gSinif: gSinif, CINSIYET: CINSIYET, basHarf: basHarf, rolAdi: rolAdi, ozelMi: ozelMi };
});
