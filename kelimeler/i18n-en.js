/* Kelimeler ana sayfa — İngilizce çeviri sözlüğü.
   Dil seçimi lang.js'tedir (<html data-lang>, ortak "kelimeler_lang" anahtarı).
   Sayfadaki Türkçe metin parçaları birebir anahtar; data-lang="en" olunca
   metin düğümleri bu sözlükle değişir, "tr" olunca orijinale döner.
   Oyuncu yorumları (.rev blockquote) ve il adları bilerek çevrilmez. */
(function () {
  var EN = {
    // menü
    "Oyun Modları": "Game Modes", "Özellikler": "Features", "Destek": "Support", "İndir": "Download",
    // giriş
    "iOS ve Android'de yayında": "Out now on iOS and Android",
    "Türkçe kelime oyunu": "Turkish word game",
    "Türkçe kelime oyununun en zengin sürümü": "The richest Turkish word game is now on",
    "iPhone ve Android": "iPhone and Android",
    "'de.": ".",
    "60.000+ kelime": "60,000+ words",
    ", 81 il arasında şehir savaşları, günün bulmacası ve hızlı oyun modu seni bekliyor.": ", city battles across 81 provinces, a daily puzzle and quick play are waiting for you.",
    "★ Ücretsiz": "★ Free", "Türkçe": "Turkish", "13+ yaş": "Ages 13+", "Telefon ve tablet": "Phone and tablet",
    // rakamlar
    "Türkçe kelime": "Turkish words", "Oyun modu": "Game modes", "Şehir": "Cities", "Oyun tahtası": "Game board", "Platform": "Platforms",
    // modlar
    "Her zevke bir mod": "A mode for every mood",
    "Bota karşı pratik yap, arkadaşınla yarış, şehrini yükselt ya da günün bulmacasını çöz.": "Practice against the bot, race your friends, lift your city up or solve the daily puzzle.",
    "Bota Karşı": "Play vs Bot",
    "3 farklı zorluk seviyesinde yapay zeka rakibe karşı oyna. İnternet gerekmez; istediğin zaman pratik yap, becerini geliştir.": "Play an AI opponent at 3 difficulty levels. No internet needed — practice whenever you like and sharpen your skills.",
    "EN POPÜLER": "MOST POPULAR",
    "Şehir Savaşları": "City Battles",
    "Şehrini seç, 81 il arasında lider tablosunda yarış. 539 yöresel kelime, haftalık şampiyonluk, aylık ödüller. Senin şehrin kazansın!": "Pick your city and compete on the leaderboard of 81 provinces. 539 regional words, weekly championships, monthly prizes. Let your city win!",
    "Günün Bulmacası": "Daily Puzzle",
    "Her gün 7 harfle 3 dakikada en yüksek skoru yakala. 5+ yıl benzersiz bulmaca havuzu, global lider tablosu.": "Every day, score as high as you can with 7 letters in 3 minutes. 5+ years of unique puzzles and a global leaderboard.",
    "Hızlı Oyun": "Quick Play",
    "2 veya 5 dakikalık sıra süreli maçlar. Hızlı düşün, hızlı oyna — adrenalin dolu oyunlar.": "Matches with 2- or 5-minute turns. Think fast, play fast — games full of adrenaline.",
    "Arkadaşla Oyna": "Play with Friends",
    "Arkadaşını kullanıcı adı ya da davet koduyla çağır. 12, 24 veya 72 saat tur süresi; WhatsApp'tan paylaş, oynamaya başlayın.": "Invite a friend by username or invite code. 12, 24 or 72-hour turns; share on WhatsApp and start playing.",
    "Rakip Bul": "Find an Opponent",
    "Anlık eşleşmeyle Türkiye genelinde oyuncularla karşılaş. Klasik ya da hızlı oyun; her seviyeden rakip seni bekliyor.": "Instant matchmaking with players across Türkiye. Classic or quick games — opponents of every level are waiting.",
    // harita
    "81 il, tek şampiyon": "81 provinces, one champion",
    "Şehir Savaşları'nda şehrin adına oynarsın. Haftalık şampiyonluk, aylık ödüller.": "In City Battles you play for your city. Weekly championships, monthly prizes.",
    "Şehrini seç": "Pick your city",
    "Haritada iline dokun. Oyunda da şehrini seçer, 81 il arasındaki lider tablosunda onun için puan toplarsın.": "Tap your province on the map. In the game you pick your city too and collect points for it on the 81-province leaderboard.",
    "il": "provinces", "yöresel kelime": "regional words", "Haftalık": "Weekly", "şampiyonluk": "championship",
    // nasıl oynanır
    "Nasıl oynanır?": "How to play",
    "Harflerini tahtaya diz, bonus kareleri yakala, rakibinden yüksek skor yap.": "Place your letters on the board, catch the bonus squares and outscore your opponent.",
    "Sen": "You", "Rakip": "Opponent", "Maç başlıyor…": "Match starting…",
    "Harflerini diz": "Place your letters",
    "Elindeki 7 taşla tahtadaki kelimelere bağlanan yeni kelimeler kur.": "Use your 7 tiles to build new words that connect to the ones on the board.",
    "Bonusları yakala": "Catch the bonuses",
    "harfin puanını,": "multiply a letter's points,",
    "kelimenin puanını katlar.": "multiply the whole word.",
    "BİNGO yap": "Make a BINGO",
    "7 taşın hepsini tek hamlede kullanırsan +50 puan.": "Use all 7 tiles in one move for +50 points.",
    "Sıra rakibinde": "Your opponent's turn",
    "Hızlı oyunda dakikalar, arkadaş maçında 12–72 saat tur süresi.": "Minutes in quick play, 12–72-hour turns in friend matches.",
    // mini bulmaca
    "Bir tur dene": "Try a round",
    "Günün Bulmacası'ndan bir örnek: bu 7 harften kelime üret. Harflere dokun ya da klavyeyle yaz. Hepsini kullanırsan +20 bonus!": "A sample from the Daily Puzzle: make Turkish words from these 7 letters. Tap the tiles or type on your keyboard. Use them all for a +20 bonus!",
    "Örnek bulmaca": "Sample puzzle", "puan": "points", "Kelimeni kur…": "Build your word…",
    "⌫ Sil": "⌫ Delete", "⤮ Karıştır": "⤮ Shuffle", "Gönder": "Submit",
    "Bulduğun kelimeler ·": "Words you found ·",
    "Henüz yok — ilk kelimeyi bul!": "None yet — find the first word!",
    "Oyunun gerçek sözlüğüyle: bu 7 harfle": "Uses the game's real dictionary: these 7 letters make",
    "56 kelime": "56 words",
    "kurulabiliyor, 3 tanesi 7 harfin hepsini kullanıyor (+20 bonus). Oyunda her gün yeni harfler, 3 dakika ve tek hak var.": "and 3 of them use all 7 letters (+20 bonus). In the game you get new letters every day, 3 minutes and a single try.",
    "Gerçeğini oyna": "Play the real thing", "Kelimeler'i indir": "Get Kelimeler",
    "En az 2 harf seç.": "Pick at least 2 letters.",
    " zaten bulundu.": " is already found.",
    " sözlükte yok, başka bir kelime dene.": " isn't in the dictionary — try another word.",
    "Hepsini buldun! Şimdi gerçeğini oyna 🎉": "You found them all! Now play the real game 🎉",
    "7 harfin hepsi! +20 bonusla +": "All 7 letters! +", " puan 🎉": " points with the +20 bonus 🎉",
    "Harika! +": "Great! +", " puan": " points",
    "Maç bitti · ": "Match over · ", "Sen kazandın!": "You won!", "Rakip kazandı": "Opponent won",
    // ekranlar
    "Oyundan kareler": "Screens from the game",
    "Gerçek oyun ekranları — iPhone'dan.": "Real in-game screens — captured on iPhone.",
    "Ana ekran": "Home screen", "Tüm modlar tek dokunuşta": "Every mode one tap away",
    "15×15 tahta": "15×15 board", "H2 · H3 · K2 · K3 bonusları": "H2 · H3 · K2 · K3 bonuses",
    "7 harf, 3 dakika, tek hak": "7 letters, 3 minutes, one try",
    "Kelime Avı": "Word Hunt", "Seviye seviye kelime bul": "Find words level by level",
    // yorumlar
    "Oyuncular ne diyor?": "What players say",
    "App Store'daki gerçek oyuncu yorumları.": "Real player reviews from the App Store (in Turkish).",
    "App Store puanı": "App Store rating",
    "12 değerlendirme · Türkiye": "12 ratings · Türkiye",
    "Tüm yorumlar →": "All reviews →",
    "Haziran 2026": "June 2026", "Temmuz 2026": "July 2026", "Kasım 2026": "November 2026",
    // özellikler
    "Neden Kelimeler?": "Why Kelimeler?",
    "Her detay düşünüldü, her özellik özenle hazırlandı.": "Every detail considered, every feature carefully crafted.",
    "60.000+ Türkçe kelime": "60,000+ Turkish words",
    "TDK standartlarında sürekli güncellenen sözlük ve 539 yöresel kelime.": "A constantly updated dictionary following TDK standards, plus 539 regional words.",
    "Sohbet ve arkadaşlık": "Chat and friends",
    "Oyun sırasında anlık mesajlaş, arkadaş ekle, her hamlede bildirim al.": "Chat live during games, add friends and get notified on every move.",
    "Lider tabloları": "Leaderboards",
    "Global ve şehir bazlı sıralama, haftalık şampiyonluk, aylık ödüller.": "Global and city rankings, weekly championships, monthly prizes.",
    "Apple ve Google ile giriş": "Sign in with Apple or Google",
    "Tek dokunuşla güvenli giriş; istersen misafir olarak hemen başla.": "Secure one-tap sign-in — or start right away as a guest.",
    "Akıllı bildirimler": "Smart notifications",
    "Sıran geldiğinde, davet aldığında ya da şehrin şampiyon olduğunda haberin olsun.": "Know when it's your turn, when you get an invite or when your city becomes champion.",
    "Joker, bonus, BİNGO": "Blanks, bonuses, BINGO",
    "Joker harfler ve bonus kareler. 7 taşı birden kullan, +50 BİNGO kazan!": "Blank tiles and bonus squares. Use all 7 tiles at once for a +50 BINGO!",
    "İstatistikler": "Statistics",
    "Toplam oyun, kazanma serisi, en uzun kelime, en yüksek skor — hepsi tek ekranda.": "Total games, win streak, longest word, best score — all on one screen.",
    "Akıcı tasarım": "Smooth design",
    "Ferah arayüz, akıcı animasyonlar. Telefon ve tablet uyumlu.": "A clean interface and smooth animations. Works on phones and tablets.",
    // premium
    "Oyunu yükselt": "Level up the game",
    "Temel oyun tamamen ücretsiz. İstersen premium özelliklerle deneyimini geliştir.": "The core game is completely free. Upgrade your experience with premium features if you like.",
    "En popüler · Tam Paket": "Most popular · Full Bundle",
    "5 özellik,": "5 features,", "tek satın alma.": "one purchase.",
    "Tüm premium özelliklere tek seferde sahip ol.": "Get every premium feature in one go.",
    "Reklamsız": "Ad-free", "Puan önizleme": "Score preview", "Torba görüntüleme": "Bag view",
    "Sınırsız oyun": "Unlimited games", "Premium rozet": "Premium badge", "%20 indirimli": "20% off",
    "Reklam kaldır": "Remove ads",
    "Reklam yok, sınırsız ipucu, ×2 skor çarpanı, özel rozet.": "No ads, unlimited hints, ×2 score multiplier, a special badge.",
    "Akıllı oyun": "Smart play",
    "Tahtaya koymadan önce kelimenin canlı puanını gör.": "See a word's live score before you place it.",
    "Strateji": "Strategy",
    "Kalan harf sayılarını gör, rakibin elini tahmin et.": "See how many of each letter are left and guess your opponent's rack.",
    "50 aktif oyun sınırı kalkar; tüm arkadaşlarınla aynı anda oyna.": "Removes the 50 active game limit — play all your friends at once.",
    "Hızlı Oyun (Blitz)": "Quick Play (Blitz)",
    "2 ve 5 dakikalık sıra süreli hızlı modu aç. Hız tutkunlarının modu.": "Unlock the fast mode with 2- and 5-minute turns. Made for speed lovers.",
    "Her gün ücretsiz": "Free every day", "Jetonlar": "Coins",
    "Rakibine çay, gül, baklava gönder; sohbette fotoğraf ve sesli mesaj paylaş. Her gün ücretsiz jeton kazan, istersen paket al.": "Send your opponent tea, a rose or baklava; share photos and voice messages in chat. Earn free coins every day or buy a pack.",
    // indir + alt bilgi
    "Oynamaya başla": "Start playing",
    "Türkçe kelime oyununun en zengin sürümünü ücretsiz indir. iOS ya da Android — fark etmez.": "Download the richest Turkish word game for free. iOS or Android — your choice.",
    "Türkçe kelime oyunu severlerin yeni adresi. Bot, arkadaş ya da rastgele rakiplerle oyna; şehrini yükselt, günün bulmacasını çöz.": "The new home for Turkish word game lovers. Play bots, friends or random opponents; lift your city up and solve the daily puzzle.",
    "Bağlantılar": "Links", "Oyun modları": "Game modes", "İletişim": "Contact", "Yasal": "Legal",
    "Gizlilik Politikası": "Privacy Policy", "Kullanım Şartları": "Terms of Service",
    "KVKK Aydınlatma Metni": "KVKK Notice (Turkish data law)", "Çocuk Güvenliği": "Child Safety"
  };
  window.EN_DICT = EN;
  function lang() { return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'tr'; }
  window.T = function (s) { return lang() === 'en' && EN[s] != null ? EN[s] : s; };

  var orig = new WeakMap();
  function walk(root, l) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || /^(SCRIPT|STYLE|svg|path|title)$/i.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-noi18n], [data-en], .rev blockquote, svg')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = w.nextNode())) {
      var src = orig.has(n) ? orig.get(n) : n.nodeValue;
      var key = src.replace(/\s+/g, ' ').trim();
      if (!key) continue;
      if (l === 'en') {
        if (EN[key] == null) continue;
        if (!orig.has(n)) orig.set(n, src);
        var lead = src.match(/^\s*/)[0], trail = src.match(/\s*$/)[0];
        n.nodeValue = lead + EN[key] + trail;
      } else if (orig.has(n)) {
        n.nodeValue = orig.get(n);
        orig.delete(n);
      }
    }
  }
  function apply() {
    if (!document.body) return;
    var l = lang();
    // açık çeviri isteyen öğeler (aynı Türkçe metnin farklı yerde farklı çevirisi olduğunda)
    document.querySelectorAll('[data-en]').forEach(function (el) {
      if (el.dataset.tr == null) el.dataset.tr = el.textContent;
      el.textContent = l === 'en' ? el.dataset.en : el.dataset.tr;
    });
    walk(document.body, l);
  }
  window.applyI18n = apply;
  document.addEventListener('DOMContentLoaded', function () {
    apply();
    new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
  });
})();
