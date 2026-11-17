/* Balon Patlat — okutan.org
   Canvas üzerinde altıgen ızgaralı balon patlatma oyunu + online liderlik tablosu (api/). */
(function () {
  'use strict';

  // ---------- Sabitler (mantıksal koordinatlar; canvas ölçeklenir) ----------
  // Geniş ekranda 20 sütun (kareye yakın alan), dar ekranda 16 sütun; CSS'teki --ar ile aynı kırılım
  var NARROW = !!(window.matchMedia && matchMedia('(max-width:599px)').matches);
  var R = 16, D = R * 2, COLS = NARROW ? 16 : 20, W = COLS * D, H = 640, ROWH = R * Math.sqrt(3), TOP = 4;
  var DEAD_Y = 540, SH_X = W / 2, SH_Y = 598, SPEED = 1050;
  var MAXROWS = Math.floor((DEAD_Y - TOP - D) / ROWH) + 1;   // 19 sıra (0..18) güvenli
  var NEXT_X = 46, NEXT_Y = 606;
  var API = 'api/';

  var PALETTE = [
    { b: '#ff5a1f', h: '#ffc4a6', l: '#a62e09' }, // turuncu (site vurgusu)
    { b: '#ffc21a', h: '#fff2b0', l: '#a87300' }, // sarı
    { b: '#22b35e', h: '#aef3c9', l: '#0d6531' }, // yeşil
    { b: '#12b4c8', h: '#a9f2fa', l: '#066b78' }, // turkuaz
    { b: '#3366ff', h: '#b9caff', l: '#1534a0' }, // mavi
    { b: '#a845e8', h: '#e5c6fc', l: '#5f1e94' }  // mor
  ];
  var GRAY = { b: '#9a9a96', h: '#e6e6e2', l: '#555552' };

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var cv = $('cv'), ctx = cv.getContext('2d');
  var root = document.documentElement;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  $('yr').textContent = new Date().getFullYear();

  // ---------- Dil ----------
  var EN = {
    crumb: 'Game', title: 'Bubble Pop', 'start.l': 'Free · Online ranking',
    'start.p': 'Match three or more bubbles of the same color to pop them. Bubbles cut off from the ceiling fall and score far more.',
    h1: 'Aim and click (or touch, drag and release).', h2: 'Bank shots off the walls to reach tricky spots.',
    h3: 'Each miss lowers the counter; at zero the ceiling drops a row.', h4: 'If bubbles reach the line, the game is over.',
    play: 'Play', 'end.l': 'Game over', 'end.best': '· New record!', pts: 'pts', lvl: 'Level', shots: 'Shots',
    'end.name': 'Your name, for the leaderboard', 'end.ph': 'Your name', 'end.save': 'Save', again: 'Play again',
    'pause.l': 'Paused', 'pause.t': 'Break', resume: 'Resume', score: 'Score', bestS: 'Your best',
    new: 'New game', pause: 'Pause', 'k.aim': 'aim', 'k.fire': 'shoot', 'k.swap': 'swap bubble', 'k.pause': 'pause',
    'nick.l': 'Your nickname', 'nick.ph': 'Type your name', 'nick.ph2': 'For the leaderboard',
    'nick.hint': 'Your scores are posted under this name.', 'nick.saved': 'Saved. Scores will be posted automatically.',
    rankW: 'Weekly rank', streakS: 'Streak', missS: 'Ceiling', 'st.plays': 'Games played', 'st.online': 'Playing now',
    'lb.live': 'Live', 'm.prev': 'Your previous game was saved: {s} pts.', 'm.auto': 'Saving as {n}…',
    'i.l': 'Free browser game · Online leaderboard', 'i.h1': 'Bubble Pop: Free Online Bubble Shooter Game',
    'i.p': 'Bubble Pop is a bubble shooter you can play right in your browser, with no download and no sign-up. Aim, match three or more bubbles of the same color and pop them. Bubbles cut off from the ceiling fall and score far more. Enter a nickname and see your score on the daily, weekly and all-time leaderboards.',
    'i.how': 'How to play', 'i.how1': 'Aim with your mouse or finger; the bubble flies in the direction you point.',
    'i.how2': 'The bubble sticks where it lands. Three or more bubbles of the same color pop.',
    'i.how3': 'Bounce shots off the side walls to reach tricky gaps.',
    'i.how4': 'Every shot that pops nothing lowers the ceiling counter; at zero the ceiling drops a row.',
    'i.how5': 'If bubbles reach the dashed line the game ends. Clear the board to reach the next level.',
    'i.pts': 'Scoring', 'i.pt1': 'Popped bubble', 'i.pt2': 'Dropped bubble', 'i.pt3': 'Streak multiplier', 'i.pt4': 'Board clear',
    'i.ptp': 'Drop more than 10 bubbles in one shot and dropped points multiply.',
    'i.faq': 'Frequently asked questions',
    q1: 'Is Bubble Pop free?', a1: 'Yes. Bubble Pop is completely free. No download, no account and no ads to watch; it runs straight in your browser.',
    q2: 'How do I get on the leaderboard?', a2: 'Type a nickname in the player card on the right. When a game ends your score is saved automatically under that name to the daily, weekly and all-time leaderboards.',
    q3: 'How is the score calculated?', a3: 'Each popped bubble is worth 10 points and each bubble that falls from the ceiling 20. Consecutive pops give up to a 5× streak multiplier, and clearing the board earns a level bonus.',
    q5: 'What is the daily puzzle?', a5: 'Everyone plays the same board each day and each player gets one try. Your score goes on that day’s own leaderboard; a new puzzle arrives tomorrow.',
    q6: 'How does time attack work?', a6: 'You have 2 minutes; pop as many bubbles as you can before time runs out. This mode has its own leaderboard.',
    q7: 'How do I challenge a friend?', a7: 'When a game ends, press Share. Whoever opens your link starts on the exact same board you played and tries to beat your score.',
    q4: 'Can I play on my phone?', a4: 'Yes. The game works on phones, tablets and computers. On touch screens, aim with your finger and release to shoot.',
    'i.ctl': 'Controls', 't.desk': 'Computer', 't.desk2': 'Keyboard & mouse', 't.mob': 'Mobile', 't.mob2': 'Phone & tablet',
    c1: 'Move the mouse to rotate the aim', c2: 'Left click: the bubble flies where you aim', c3: 'Right click: swap your bubble with the next one',
    c4: 'Fine-tune the aim with the keyboard', c5: 'Shoot the bubble', c6: 'Swap your bubble with the next one',
    c7: 'Pause or resume the game', c8: 'Turn sound on or off', c9: 'Start the game; save your score when it ends',
    m1: 'Drag your finger across the board to aim', m2: 'Lift your finger to shoot', m3: 'Tap the next bubble (bottom left) to swap',
    m4: 'Tap the New game, Pause and sound buttons',
    'lb.l': 'Online ranking', 'lb.t': 'Leaderboard', 'lb.day': 'Today', 'lb.week': 'This week', 'lb.all': 'All time',

    'c.daily': 'DAILY PUZZLE', 'c.timed': 'TIME ATTACK', 'c.timeup': 'TIME\'S UP!', 'c.target': 'TARGET', 'c.passed': 'YOU BEAT IT!',
    'end.time': 'Time\'s up', 'ch.win': 'You beat {n}\'s {s}! 🎉', 'ch.lose': '{d} pts short of {n}', 'ch.banner': '⚔️ {n} challenged you: beat {s} pts!',
    'daily.done': 'You finished today\'s puzzle: {s} pts. New puzzle tomorrow!', 'daily.left': 'One try today. Everyone plays the same board.',
    'mode.classic': 'Endless: clear the board, level up.', 'mode.timed': 'Score as much as you can in 2 minutes.',
    'm.offgame': 'Games started offline are not ranked.', 'm.queued': 'No connection; your score will be sent when you\'re back online.',
    'm.qsent': 'Your pending score was sent.', 'm.daily_done': 'You already played today\'s puzzle.',
    'ms.done': 'Mission complete: {m}', 'ms.all': 'All of today\'s missions done! 🎉',
    'mi.drop10': 'Drop 10 bubbles in one shot', 'mi.blast15': 'Clear 15 bubbles in one shot', 'mi.streak4': 'Reach a ×4 streak',
    'mi.bomb8': 'Destroy 8 bubbles with one bomb', 'mi.joker': 'Use a joker', 'mi.bolt': 'Use a lightning bubble', 'mi.level2': 'Reach level 2',
    'mi.score1500': 'Score 1,500 in one game', 'mi.score3000': 'Score 3,000 in one game', 'mi.timed800': 'Score 800 in time attack',
    'mi.pop100': 'Pop 100 bubbles in one game', 'mi.daily': 'Play the daily puzzle',
    'bd.first': 'First game', 'bd.g10': '10 games', 'bd.g50': '50 games', 'bd.g100': '100 games', 'bd.s1k': '1,000 pts', 'bd.s5k': '5,000 pts',
    'bd.s10k': '10,000 pts', 'bd.s25k': '25,000 pts', 'bd.timed1k': 'Time attack 1,000', 'bd.daily1': 'Daily puzzle', 'bd.daily3': '3-day streak',
    'bd.daily7': '7-day streak', 'bd.king': 'All-time #1',
    'pf.games': 'Games', 'pf.total': 'Total points', 'pf.rank': 'All-time rank', 'pf.streak': 'Daily streak', 'pf.first': 'Since',
    'pf.recent': 'Recent games', 'pf.badges': 'Badges', 'pf.nf': 'No scores for this player yet.', 'pf.link': 'Copy profile link', 'pf.copied': 'Link copied',
    'md.classic': 'Classic', 'md.timed': 'Time attack', 'md.daily': 'Daily puzzle', 'city.ph': '📍 Your city', 'lb.players': 'players',
    'inst': 'Install', 'days': 'days', 'lb.you': 'YOU',
    'tut.1': 'Aim, then click (or touch and release) to shoot', 'tut.2': 'Tip: bounce shots off the walls to reach gaps',
    'tut.3': 'Missed shots lower the ceiling counter; at zero the ceiling drops', 'tut.done': 'You\u2019re ready. Good luck!',
    'lk.locked': '🔒 {s} unlocks at {n} pts (your best: {b})', 'lk.new': '🎉 New look unlocked: {s}',
    'snd.vol': 'Volume', 'snd.vib': 'Vibration', 'snd.mute': 'Mute', 'snd.on': 'On', 'snd.off': 'Off',
    'season': '{m} season · {d} days left', 'season1': '{m} season · last day!', 'ch.title': 'Hall of champions',
    'ch.l': 'Monthly seasons · classic mode', 'ch.empty': 'The first season champion is crowned at the end of this month.',
    'bd.champ': 'Season champion', 'bd.podium': 'Season podium', 'lb.month': 'This month', 'pf.my': 'My profile', 'kel.t': 'Love word games? A Turkish online word game',
    'ms.l': 'Refreshed daily', 'ms.t': 'Today’s missions', 'lb.dailyS': 'Daily', 'lb.cities': 'Cities',
    'c.record': 'NEW RECORD!', 'p.1': 'GREAT!', 'p.2': 'AMAZING!', 'p.3': 'LEGENDARY!',
    'r.togo': '{n} pts to beat your record', 'r.new': 'New record! Previous: {n}', 'r.first': 'Your first record!',
    'sh.text': 'I scored {s} in Bubble Pop! Can you beat me?', 'sh.saved': 'Image downloaded',
    'toast.pass': '{n} just passed you! Weekly rank: #{r}', 'toast.pass2': 'Someone passed you! Weekly rank: #{r}',
    'bdg.crown': 'All-time #1', 'bdg.fire': 'Today\'s best', 'fs': 'Full screen',
    'skin.l': 'Appearance', 'sk.glass': 'Glass', 'sk.flat': 'Matte', 'sk.shapes': 'Shapes', 'sk.neon': 'Neon',
    'r.pop': 'Popped', 'r.drop': 'Dropped', 'r.big': 'Biggest blast', 'r.streak': 'Best streak', share: 'Share',
    c10: 'Toggle full screen',
    'c.next': 'NEXT', 'c.surprise': 'SURPRISE!', 'c.bomb': 'BOOM!', 'c.bolt': 'ZAP!', 'c.joker': 'JOKER',
    'i.sp': 'Surprise bubbles', 'i.sp1': 'Bomb: explodes on impact and destroys bubbles up to two rings around it.',
    'i.sp2': 'Joker: turns into whichever color makes the biggest match where it lands.',
    'i.sp3': 'Lightning: wipes out the row it hits and the row above.',
    'i.spp': 'They show up now and then as the next bubble. Use them wisely; you can swap them in or out with X or a tap.', 'c.level': 'LEVEL', 'c.streak': 'STREAK', 'c.clear': 'CLEARED!', 'c.drop': 'CEILING',
    'lb.empty': 'No scores yet. Be the first!', 'lb.off': 'Leaderboard is unavailable right now.',
    'lb.games': 'games', 'm.saving': 'Saving…',
    'm.ok': 'Saved! Today #{d} · Week #{w} · All time #{a}', 'm.zero': 'Score some points to enter the leaderboard.',
    'm.offline': 'Couldn\'t reach the ranking server; score not saved.', 'm.name': 'Name must be 2–16 characters (letters, digits, space . _ -).',
    'm.badname': 'Please pick a different name.', 'm.rate': 'Too many attempts. Try again later.',
    'm.token': 'Session expired, start a new game.', 'm.err': 'Something went wrong. Please try again.'
  };
  var TR = {
    'nick.saved': 'Kaydedildi. Skorların otomatik yazılacak.', 'm.prev': 'Önceki oyunun skoru kaydedildi: {s} puan.', 'm.auto': '{n} adıyla kaydediliyor…',

    'c.daily': 'GÜNÜN BULMACASI', 'c.timed': 'ZAMANA KARŞI', 'c.timeup': 'SÜRE DOLDU!', 'c.target': 'HEDEF', 'c.passed': 'GEÇTİN!',
    'end.time': 'Süre doldu', 'ch.win': '{n} adlı oyuncunun {s} puanını geçtin! 🎉', 'ch.lose': '{n} adlı oyuncuyu geçmene {d} puan kaldı',
    'ch.banner': '⚔️ {n} seni düelloya çağırdı: {s} puanı geç!',
    'daily.done': 'Bugünkü bulmacayı bitirdin: {s} puan. Yarın yeni bulmaca!', 'daily.left': 'Bugün tek hakkın var. Herkes aynı tahtayı oynuyor.',
    'mode.classic': 'Sonsuz mod: tahtayı temizle, seviye atla.', 'mode.timed': '2 dakikada yapabildiğin en yüksek skoru yap.',
    'm.offgame': 'Çevrimdışı başlayan oyunlar sıralamaya girmez.', 'm.queued': 'İnternet yok; skorun bağlantı gelince gönderilecek.',
    'm.qsent': 'Bekleyen skorun gönderildi.', 'm.daily_done': 'Bugünkü bulmacayı zaten oynadın.',
    'ms.done': 'Görev tamam: {m}', 'ms.all': 'Bugünün görevlerinin hepsi tamam! 🎉',
    'mi.drop10': 'Tek atışta 10 balon düşür', 'mi.blast15': 'Tek atışta 15 balon temizle', 'mi.streak4': '×4 seri yap',
    'mi.bomb8': 'Bir bombayla 8 balon yok et', 'mi.joker': 'Bir joker kullan', 'mi.bolt': 'Bir yıldırım kullan', 'mi.level2': '2. seviyeye ulaş',
    'mi.score1500': 'Tek oyunda 1.500 puan yap', 'mi.score3000': 'Tek oyunda 3.000 puan yap', 'mi.timed800': 'Zamana karşı modunda 800 puan yap',
    'mi.pop100': 'Tek oyunda 100 balon patlat', 'mi.daily': 'Günün bulmacasını oyna',
    'bd.first': 'İlk oyun', 'bd.g10': '10 oyun', 'bd.g50': '50 oyun', 'bd.g100': '100 oyun', 'bd.s1k': '1.000 puan', 'bd.s5k': '5.000 puan',
    'bd.s10k': '10.000 puan', 'bd.s25k': '25.000 puan', 'bd.timed1k': 'Zamana karşı 1.000', 'bd.daily1': 'Günün bulmacası', 'bd.daily3': '3 gün seri',
    'bd.daily7': '7 gün seri', 'bd.king': 'Tüm zamanların birincisi',
    'pf.games': 'Oyun', 'pf.total': 'Toplam puan', 'pf.rank': 'Tüm zamanlar sırası', 'pf.streak': 'Günlük seri', 'pf.first': 'İlk oyun',
    'pf.recent': 'Son oyunlar', 'pf.badges': 'Rozetler', 'pf.nf': 'Bu oyuncunun henüz skoru yok.', 'pf.link': 'Profil bağlantısını kopyala', 'pf.copied': 'Bağlantı kopyalandı',
    'md.classic': 'Klasik', 'md.timed': 'Zamana karşı', 'md.daily': 'Günün bulmacası', 'city.ph': '📍 Şehrin', 'lb.players': 'oyuncu',
    'inst': 'Yükle', 'days': 'gün', 'lb.you': 'SEN',
    'tut.1': 'Nişan al, sonra tıkla (ya da dokunup bırak)', 'tut.2': 'İpucu: duvardan sektirerek boşluklara ulaşabilirsin',
    'tut.3': 'Iskalarsan tavan sayacı azalır; bitince tavan bir sıra iner', 'tut.done': 'Hazırsın. Bol şans!',
    'lk.locked': '🔒 {s} görünümü {n} puanda açılır (rekorun: {b})', 'lk.new': '🎉 Yeni görünüm açıldı: {s}',
    'snd.vol': 'Ses', 'snd.vib': 'Titreşim', 'snd.mute': 'Sessiz', 'snd.on': 'Açık', 'snd.off': 'Kapalı',
    'season': '{m} sezonu · {d} gün kaldı', 'season1': '{m} sezonu · son gün!', 'ch.title': 'Şampiyonlar duvarı',
    'ch.l': 'Aylık sezonlar · klasik mod', 'ch.empty': 'İlk sezon şampiyonu bu ayın sonunda belli olacak.',
    'bd.champ': 'Sezon şampiyonu', 'bd.podium': 'Sezon podyumu',
    'c.record': 'YENİ REKOR!', 'p.1': 'HARİKA!', 'p.2': 'MÜKEMMEL!', 'p.3': 'EFSANE!',
    'r.togo': 'Rekoruna {n} puan kaldı', 'r.new': 'Yeni rekor! Önceki: {n}', 'r.first': 'İlk rekorun bu!',
    'sh.text': 'Balon Patlat\'ta {s} puan yaptım! Beni geçebilir misin?', 'sh.saved': 'Görsel indirildi',
    'toast.pass': '{n} seni geçti! Haftalık sıran: #{r}', 'toast.pass2': 'Biri seni geçti! Haftalık sıran: #{r}',
    'bdg.crown': 'Tüm zamanların birincisi', 'bdg.fire': 'Bugünün en iyisi', 'fs': 'Tam ekran',
    'c.next': 'SIRADAKİ', 'c.surprise': 'SÜRPRİZ!', 'c.bomb': 'BUM!', 'c.bolt': 'ŞİMŞEK!', 'c.joker': 'JOKER', 'c.level': 'SEVİYE', 'c.streak': 'SERİ', 'c.clear': 'TEMİZLENDİ!', 'c.drop': 'TAVAN',
    'lb.empty': 'Henüz skor yok. İlk sen ol!', 'lb.off': 'Liderlik tablosuna şu an ulaşılamıyor.',
    'lb.games': 'oyun', 'm.saving': 'Kaydediliyor…',
    'm.ok': 'Kaydedildi! Bugün #{d} · Hafta #{w} · Tüm zamanlar #{a}', 'm.zero': 'Liderlik tablosuna girmek için puan almalısın.',
    'm.offline': 'Sıralama sunucusuna ulaşılamadı; skor kaydedilemedi.', 'm.name': 'İsim 2–16 karakter olmalı (harf, rakam, boşluk . _ -).',
    'm.badname': 'Lütfen başka bir isim seç.', 'm.rate': 'Çok fazla deneme. Biraz sonra tekrar dene.',
    'm.token': 'Oturum süresi doldu, yeni oyun başlat.', 'm.err': 'Bir şeyler ters gitti. Tekrar dene.'
  };
  document.querySelectorAll('[data-i18n]').forEach(function (el) { TR[el.dataset.i18n] = el.textContent; });
  document.querySelectorAll('[data-i18n-ph]').forEach(function (el) { TR[el.dataset.i18nPh] = el.placeholder; });
  var lang = lsGet('lang') === 'en' ? 'en' : 'tr', TITLE_TR = document.title;
  function t(k) { var d = lang === 'en' ? EN : TR; return d[k] != null ? d[k] : (TR[k] || k); }
  function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.placeholder = t(el.dataset.i18nPh); });
    root.lang = lang;
    $('langBtn').textContent = lang === 'en' ? 'TR' : 'EN';
    document.title = lang === 'en' ? 'Bubble Pop — Free Online Bubble Shooter Game | okutan.org' : TITLE_TR;
    renderBoard();
    if (typeof renderMissions === 'function' && $('msList')) { try { renderMissions(); renderModeSel(); fillCities(); renderSeason(); renderSkins(); syncSoundBtn(); } catch (e) {} }
  }
  $('langBtn').onclick = function () { lang = lang === 'en' ? 'tr' : 'en'; lsSet('lang', lang); applyLang(); };

  // ---------- Tema ----------
  var C = {};
  function readTheme() {
    var cs = getComputedStyle(root);
    ['ink', 'muted', 'line', 'accent', 'field', 'block'].forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim(); });
  }
  $('themeBtn').onclick = function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', n); lsSet('theme', n); readTheme();
  };
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(readTheme);
  }
  readTheme();

  // ---------- Ses (WebAudio, dosya yok) ----------
  var actx = null, master = null, muted = lsGet('bp_mute') === '1';
  var vol = Math.min(1, Math.max(0, +(lsGet('bp_vol') || 0.8))), vib = lsGet('bp_vib') !== '0';
  function buzz(p) { if (vib && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }
  function syncSoundBtn() {
    var b = $('soundBtn');
    b.setAttribute('aria-pressed', muted ? 'true' : 'false');
    var off = muted || vol === 0;
    b.querySelector('.w').style.display = off ? 'none' : '';
    b.querySelector('.x').style.display = off ? '' : 'none';
    if ($('vol')) { $('vol').value = Math.round(vol * 100); $('volVal').textContent = Math.round(vol * 100) + '%'; }
    if ($('muteBtn')) $('muteBtn').setAttribute('aria-pressed', muted ? 'true' : 'false');
    if ($('vibBtn')) { $('vibBtn').setAttribute('aria-pressed', vib ? 'true' : 'false'); $('vibBtn').textContent = t(vib ? 'snd.on' : 'snd.off'); }
    if (master) master.gain.value = vol;
  }
  function toggleMute() { muted = !muted; lsSet('bp_mute', muted ? '1' : '0'); syncSoundBtn(); ensureAudio(); }
  // ses düğmesi: küçük panel (ses seviyesi, sessiz, titreşim)
  $('soundBtn').onclick = function (e) { e.stopPropagation(); ensureAudio(); $('sndPop').hidden = !$('sndPop').hidden; };
  $('sndPop').addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { $('sndPop').hidden = true; });
  $('vol').addEventListener('input', function () {
    vol = this.value / 100; lsSet('bp_vol', String(vol));
    if (vol > 0 && muted) { muted = false; lsSet('bp_mute', '0'); }
    ensureAudio(); syncSoundBtn();
  });
  $('vol').addEventListener('change', function () { tone(660, 0.08, 'triangle', 0.12); });
  $('muteBtn').onclick = toggleMute;
  $('vibBtn').onclick = function () { vib = !vib; lsSet('bp_vib', vib ? '1' : '0'); syncSoundBtn(); buzz(30); };
  if (!('vibrate' in navigator)) $('vibRow').hidden = true;
  syncSoundBtn();
  function ensureAudio() {
    if (actx || muted) { if (actx && actx.state === 'suspended') actx.resume(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = vol; master.connect(actx.destination);
    } catch (e) { actx = null; }
  }
  function tone(f, dur, type, vol, f2, delay) {
    if (muted || !actx) return;
    var t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  var noiseBuf = null;
  function noise(dur, vol, freq, delay) {
    if (muted || !actx) return;
    if (!noiseBuf) {
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.3, actx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t0 = actx.currentTime + (delay || 0), s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq || 2000; f.Q.value = 1.2;
    g.gain.setValueAtTime(vol || 0.2, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
  }
  var sfx = {
    shoot: function () { tone(420, 0.09, 'triangle', 0.08, 760); },
    bounce: function () { tone(300, 0.05, 'sine', 0.05, 240); },
    stick: function () { tone(180, 0.07, 'sine', 0.1, 120); },
    pop: function (n, s) {
      buzz(n >= 8 ? [15, 25, 25] : 12);
      for (var i = 0; i < Math.min(n, 8); i++) {
        noise(0.07, 0.16, 1600 + i * 180, i * 0.035);
        tone(520 + s * 70 + i * 40, 0.08, 'sine', 0.07, 900 + s * 90 + i * 40, i * 0.035);
      }
    },
    drop: function (k) { for (var i = 0; i < Math.min(k, 6); i++) tone(700 - i * 70, 0.12, 'triangle', 0.06, 300 - i * 30, 0.12 + i * 0.05); },
    row: function () { tone(110, 0.25, 'sawtooth', 0.06, 70); noise(0.15, 0.08, 400); },
    clear: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.09, null, i * 0.09); }); },
    over: function () { buzz([60, 40, 120]); [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.09, null, i * 0.16); }); },
    boom: function () { buzz([40, 30, 80]); noise(0.5, 0.35, 180); noise(0.25, 0.2, 900); tone(90, 0.45, 'sawtooth', 0.12, 40); },
    zap: function () { buzz([15, 20, 15, 20, 15]); for (var i = 0; i < 5; i++) noise(0.05, 0.18, 3000 + i * 400, i * 0.03); tone(1400, 0.25, 'square', 0.04, 200); },
    warn: function () { tone(880, 0.06, 'square', 0.03); },
    praise: function (lv) { [659, 784, 988, 1319].slice(0, lv + 1).forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.08, null, 0.05 + i * 0.07); }); },
    record: function () { buzz([30, 30, 30, 30, 90]); [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.2, 'square', 0.04, null, i * 0.08); tone(f * 2, 0.2, 'sine', 0.04, null, i * 0.08); }); }
  };

  // ---------- Çizim: ölçek ve balon görselleri ----------
  var scale = 1, sprites = [], graySprite = null;
  // Balon görünümü: glass (cam), flat (mat), shapes (renk körü dostu şekiller), neon
  var SKINS = ['glass', 'flat', 'shapes', 'neon'], skin = SKINS.indexOf(lsGet('bp_skin')) >= 0 ? lsGet('bp_skin') : 'glass';
  function drawSymbol(g, idx, m, r) {
    var k = r * 0.42;
    g.save(); g.translate(m, m); g.beginPath();
    if (idx === 0) g.arc(0, 0, k * 0.85, 0, Math.PI * 2);
    else if (idx === 1) { g.moveTo(0, -k); g.lineTo(k * 0.95, k * 0.75); g.lineTo(-k * 0.95, k * 0.75); g.closePath(); }
    else if (idx === 2) g.rect(-k * 0.78, -k * 0.78, k * 1.56, k * 1.56);
    else if (idx === 3) { g.moveTo(0, -k); g.lineTo(k, 0); g.lineTo(0, k); g.lineTo(-k, 0); g.closePath(); }
    else if (idx === 4) { for (var j = 0; j < 10; j++) { var a = j * Math.PI / 5 - Math.PI / 2, rr = j % 2 ? k * 0.45 : k; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); }
    else { var w = k * 0.36; g.rect(-w, -k, w * 2, k * 2); g.rect(-k, -w, k * 2, w * 2); }
    g.fillStyle = 'rgba(255,255,255,.95)'; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(1, r * 0.08);
    g.stroke(); g.fill(); g.restore();
  }
  function makeSprite(p, idx) {
    var s = Math.ceil(D * scale) + 4, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d'), m = s / 2, r = D * scale / 2 - 0.5, grd;
    if (skin === 'flat') {
      g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fillStyle = p.b; g.fill();
      g.save(); g.clip(); g.beginPath(); g.arc(m, m + r * 1.25, r * 1.05, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.14)'; g.fill(); g.restore();
      g.beginPath(); g.arc(m - r * 0.38, m - r * 0.38, r * 0.17, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
    } else if (skin === 'neon') {
      grd = g.createRadialGradient(m, m, r * 0.1, m, m, r);
      grd.addColorStop(0, 'rgba(10,10,14,.92)'); grd.addColorStop(0.7, 'rgba(10,10,14,.92)'); grd.addColorStop(1, p.l);
      g.beginPath(); g.arc(m, m, r * 0.96, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
      g.shadowColor = p.b; g.shadowBlur = 7 * scale;
      g.beginPath(); g.arc(m, m, r * 0.74, 0, Math.PI * 2); g.lineWidth = r * 0.2; g.strokeStyle = p.b; g.stroke();
      g.shadowBlur = 0;
      g.beginPath(); g.arc(m, m, r * 0.74, 0, Math.PI * 2); g.lineWidth = r * 0.06; g.strokeStyle = p.h; g.stroke();
      grd = g.createRadialGradient(m, m, 0, m, m, r * 0.6);
      grd.addColorStop(0, p.b + '66'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.beginPath(); g.arc(m, m, r * 0.6, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
    } else {
      grd = g.createRadialGradient(m - r * 0.35, m - r * 0.4, r * 0.1, m, m, r);
      grd.addColorStop(0, p.h); grd.addColorStop(0.42, p.b); grd.addColorStop(1, p.l);
      g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
      g.lineWidth = Math.max(1, scale * 0.8); g.strokeStyle = 'rgba(0,0,0,.18)'; g.stroke();
      // parlama
      g.beginPath(); g.ellipse(m - r * 0.32, m - r * 0.42, r * 0.36, r * 0.22, -0.6, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,.62)'; g.fill();
      g.beginPath(); g.arc(m + r * 0.38, m + r * 0.42, r * 0.12, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,.22)'; g.fill();
    }
    if (skin === 'shapes' && idx != null) drawSymbol(g, idx, m, r);
    return c;
  }
  function buildSprites() {
    sprites = PALETTE.map(function (p, i) { return makeSprite(p, i); }); graySprite = makeSprite(GRAY);
  }
  // Cam ve Şekilli (renk körü dostu) hep açık; Mat 1.000, Neon 5.000 puanda açılır
  var SKIN_REQ = { glass: 0, shapes: 0, flat: 1000, neon: 5000 };
  function topBest() { return Math.max(bestFor('classic'), bestFor('timed'), bestFor('daily')); }
  function skinOpen(k) { return topBest() >= (SKIN_REQ[k] || 0); }
  function skinName(k) { return t('sk.' + k); }
  function setSkin(k, quiet) {
    if (SKINS.indexOf(k) < 0) return;
    if (!skinOpen(k)) {
      if (!quiet) showToast(t('lk.locked').replace('{s}', skinName(k)).replace('{n}', fmt(SKIN_REQ[k])).replace('{b}', fmt(topBest())));
      if (skin === k) k = 'glass'; else return;
    }
    skin = k; lsSet('bp_skin', k); buildSprites();
    renderSkins();
  }
  function renderSkins() {
    var opened = JSON.parse(lsGet('bp_skins_seen') || '[]');
    document.querySelectorAll('.skins button').forEach(function (b) {
      var k = b.dataset.skin, open = skinOpen(k);
      b.setAttribute('aria-pressed', k === skin ? 'true' : 'false');
      b.classList.toggle('locked', !open);
      var lk = b.querySelector('.lk');
      if (!open && !lk) { lk = document.createElement('em'); lk.className = 'lk'; b.appendChild(lk); }
      if (lk) { lk.hidden = open; lk.textContent = '🔒 ' + (SKIN_REQ[k] >= 1000 ? SKIN_REQ[k] / 1000 + 'K' : SKIN_REQ[k]); }
      b.title = open ? '' : t('lk.locked').replace('{s}', skinName(k)).replace('{n}', fmt(SKIN_REQ[k])).replace('{b}', fmt(topBest()));
      // yeni açılan görünümü bir kere duyur
      if (open && SKIN_REQ[k] > 0 && opened.indexOf(k) < 0) {
        opened.push(k); lsSet('bp_skins_seen', JSON.stringify(opened));
        if (lsGet('bp_skins_init')) setTimeout(function () { showToast(t('lk.new').replace('{s}', skinName(k))); }, 900);
      }
    });
    lsSet('bp_skins_init', '1');
  }
  // Sürpriz balonlar: 10 bomba, 11 joker (gökkuşağı), 12 yıldırım
  var BOMB = 10, JOKER = 11, BOLT = 12, specialSprites = [];
  function isSpecial(c) { return c >= 10; }
  function makeSpecial(kind) {
    var s = Math.ceil(D * scale) + 4, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d'), m = s / 2, r = D * scale / 2 - 0.5, k = scale, grd;
    if (kind === BOMB) {
      grd = g.createRadialGradient(m - r * 0.35, m - r * 0.35, r * 0.1, m, m, r);
      grd.addColorStop(0, '#6b6b6b'); grd.addColorStop(0.45, '#2a2a2a'); grd.addColorStop(1, '#050505');
      g.beginPath(); g.arc(m, m + r * 0.08, r * 0.9, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
      // ağızlık + fitil
      g.fillStyle = '#3a3a3a'; g.fillRect(m + r * 0.18, m - r * 0.98, r * 0.42, r * 0.34);
      g.strokeStyle = '#c9a36b'; g.lineWidth = 2 * k; g.lineCap = 'round';
      g.beginPath(); g.moveTo(m + r * 0.4, m - r * 0.95); g.quadraticCurveTo(m + r * 0.75, m - r * 1.2, m + r * 0.88, m - r * 0.92); g.stroke();
      g.beginPath(); g.ellipse(m - r * 0.35, m - r * 0.2, r * 0.22, r * 0.13, -0.7, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fill();
    } else {
      if (kind === JOKER) {
        var cols = ['#ff5a1f', '#ffc21a', '#22b35e', '#12b4c8', '#3366ff', '#a845e8'];
        for (var i = 0; i < 6; i++) {
          g.beginPath(); g.moveTo(m, m); g.arc(m, m, r, i * Math.PI / 3 - Math.PI / 2, (i + 1) * Math.PI / 3 - Math.PI / 2 + 0.02);
          g.closePath(); g.fillStyle = cols[i]; g.fill();
        }
        grd = g.createRadialGradient(m - r * 0.3, m - r * 0.35, r * 0.05, m, m, r);
        grd.addColorStop(0, 'rgba(255,255,255,.85)'); grd.addColorStop(0.5, 'rgba(255,255,255,.1)'); grd.addColorStop(1, 'rgba(0,0,0,.25)');
        g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
        // yıldız
        g.fillStyle = '#fff'; g.beginPath();
        for (var j = 0; j < 10; j++) { var a = j * Math.PI / 5 - Math.PI / 2, rr = j % 2 ? r * 0.2 : r * 0.46; g.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr); }
        g.closePath(); g.fill();
      } else {
        grd = g.createRadialGradient(m - r * 0.35, m - r * 0.4, r * 0.1, m, m, r);
        grd.addColorStop(0, '#d9e4ff'); grd.addColorStop(0.45, '#3b4bd8'); grd.addColorStop(1, '#141a6b');
        g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
        g.fillStyle = '#ffd43b'; g.strokeStyle = '#a87300'; g.lineWidth = 1 * k; g.beginPath();
        var P = [[0.12, -0.62], [-0.32, 0.08], [-0.02, 0.08], [-0.14, 0.62], [0.34, -0.12], [0.04, -0.12], [0.2, -0.62]];
        P.forEach(function (p, n) { g[n ? 'lineTo' : 'moveTo'](m + p[0] * r, m + p[1] * r); });
        g.closePath(); g.fill(); g.stroke();
      }
      g.beginPath(); g.ellipse(m - r * 0.32, m - r * 0.42, r * 0.3, r * 0.17, -0.6, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fill();
    }
    g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.lineWidth = Math.max(1, scale * 0.8); g.strokeStyle = 'rgba(0,0,0,.18)';
    if (kind !== BOMB) g.stroke();
    return c;
  }
  function resize() {
    var rect = cv.getBoundingClientRect();
    if (!rect.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.width * dpr * H / W);
    scale = cv.width / W;
    buildSprites();
    specialSprites = [makeSpecial(BOMB), makeSpecial(JOKER), makeSpecial(BOLT)];
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv); else addEventListener('resize', resize);
  resize();
  function drawBall(color, x, y, k, alpha) {
    var sp = color < 0 ? graySprite : isSpecial(color) ? specialSprites[color - 10] : sprites[color]; if (!sp) return;
    var s = (D + 4 / scale) * (k || 1);
    if (isSpecial(color)) {
      // sürpriz balon: hafif nabız + parıltı halkası
      var now = performance.now(), pul = 1 + Math.sin(now / 160) * 0.04;
      s *= pul;
      ctx.save(); ctx.globalAlpha = (alpha == null ? 1 : alpha) * (0.35 + 0.25 * Math.sin(now / 200));
      ctx.strokeStyle = color === BOMB ? '#ff5a1f' : color === BOLT ? '#ffd43b' : '#ffffff';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R * (k || 1) + 4, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (alpha != null && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    ctx.drawImage(sp, x - s / 2, y - s / 2, s, s);
    ctx.globalAlpha = 1;
    if (color === BOMB) {
      // fitil kıvılcımı
      var fx0 = x + R * 0.88 * (k || 1), fy0 = y - R * 0.92 * (k || 1), fl = 2.2 + Math.random() * 2;
      ctx.fillStyle = Math.random() < 0.5 ? '#ffd43b' : '#ff5a1f';
      ctx.beginPath(); ctx.arc(fx0, fy0, fl, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- Tohumlu rastgelelik (mulberry32): aynı tohum = aynı tahta ----------
  var rngState = 1;
  function seedRng(sd) { rngState = (sd >>> 0) || 1; }
  function rnd() {
    rngState = (rngState + 0x6D2B79F5) >>> 0;
    var q = rngState;
    q = Math.imul(q ^ (q >>> 15), q | 1);
    q ^= q + Math.imul(q ^ (q >>> 7), q | 61);
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  }
  function fnv1a(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  function todayKey() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    catch (e) { var d = new Date(Date.now() + 3 * 3600000); return d.toISOString().slice(0, 10); }
  }
  function dailySeed(day) { return fnv1a('balon-' + day); }

  // ---------- Izgara ----------
  var grid, shift, rowAnim = 0;
  function isOff(r) { return ((r + shift) & 1) === 1; }
  function ncols(r) { return isOff(r) ? COLS - 1 : COLS; }
  function cx(r, c) { return R + c * D + (isOff(r) ? R : 0); }
  function cy(r) { return TOP + R + r * ROWH + rowAnim; }
  function valid(r, c) { return r >= 0 && r < grid.length && c >= 0 && c < ncols(r); }
  function at(r, c) { return valid(r, c) ? grid[r][c] : -1; }
  function emptyRow() { var a = []; for (var i = 0; i < COLS; i++) a.push(-1); return a; }
  function neighbors(r, c) {
    var dl = isOff(r) ? 0 : -1, out = [], cand = [[r, c - 1], [r, c + 1], [r - 1, c + dl], [r - 1, c + dl + 1], [r + 1, c + dl], [r + 1, c + dl + 1]];
    for (var i = 0; i < 6; i++) if (valid(cand[i][0], cand[i][1])) out.push(cand[i]);
    return out;
  }
  function presentColors() {
    var seen = {}, list = [];
    for (var r = 0; r < grid.length; r++) for (var c = 0; c < COLS; c++) { var v = grid[r][c]; if (v >= 0 && !seen[v]) { seen[v] = 1; list.push(v); } }
    return list;
  }
  function boardEmpty() { return presentColors().length === 0; }
  function colorCount() { return level <= 1 ? 4 : level <= 3 ? 5 : 6; }
  function randColor() {
    var p = presentColors();
    if (!p.length) return Math.floor(rnd() * colorCount());
    return p[Math.floor(rnd() * p.length)];
  }
  function fillRow(r, n) {
    for (var c = 0; c < ncols(r); c++) {
      var v = Math.floor(rnd() * n), roll = rnd();
      if (roll < 0.3 && c > 0 && grid[r][c - 1] >= 0) v = grid[r][c - 1];
      else if (roll < 0.5 && r + 1 < grid.length && grid[r + 1][c] >= 0) v = grid[r + 1][c];
      grid[r][c] = v;
    }
  }
  function newBoard() {
    grid = []; shift = 0;
    for (var r = 0; r <= MAXROWS; r++) grid.push(emptyRow());
    var rows = Math.min(5 + level, 10), n = colorCount();
    for (var rr = rows - 1; rr >= 0; rr--) fillRow(rr, n);
    rowAnim = -(rows * ROWH + 40);
  }
  function hitTest(x, y) {
    if (y - R <= TOP + rowAnim) return { ceil: true };
    var r0 = Math.floor((y - TOP - R - rowAnim) / ROWH) - 1, best = null, bd = (D * 0.86) * (D * 0.86);
    for (var r = Math.max(0, r0); r <= r0 + 3 && r < grid.length; r++) {
      for (var c = 0; c < ncols(r); c++) {
        if (grid[r][c] < 0) continue;
        var dx = cx(r, c) - x, dy = cy(r) - y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { r: r, c: c }; }
      }
    }
    return best;
  }
  function supported(r, c) {
    if (r === 0) return true;
    var n = neighbors(r, c);
    for (var i = 0; i < n.length; i++) if (grid[n[i][0]][n[i][1]] >= 0) return true;
    return false;
  }
  function snapCell(x, y) {
    var ra = Math.round((y - TOP - R - rowAnim) / ROWH), best = null, bd = 1e12;
    for (var pass = 0; pass < 2 && !best; pass++) {
      var lo = pass ? 0 : ra - 1, hi = pass ? grid.length - 1 : ra + 1;
      for (var r = Math.max(0, lo); r <= hi && r < grid.length; r++) {
        for (var c = 0; c < ncols(r); c++) {
          if (grid[r][c] >= 0 || !supported(r, c)) continue;
          var dx = cx(r, c) - x, dy = cy(r) - y, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = { r: r, c: c }; }
        }
      }
    }
    return best;
  }
  function flood(r, c, same) {
    var color = grid[r][c], seen = {}, stack = [[r, c]], out = [];
    seen[r + ',' + c] = 1;
    while (stack.length) {
      var p = stack.pop(); out.push(p);
      var n = neighbors(p[0], p[1]);
      for (var i = 0; i < n.length; i++) {
        var k = n[i][0] + ',' + n[i][1], v = grid[n[i][0]][n[i][1]];
        if (seen[k] || v < 0 || (same && v !== color)) continue;
        seen[k] = 1; stack.push(n[i]);
      }
    }
    return out;
  }
  function floating() {
    var seen = {}, stack = [], out = [];
    for (var c = 0; c < ncols(0); c++) if (grid[0][c] >= 0) { seen['0,' + c] = 1; stack.push([0, c]); }
    while (stack.length) {
      var p = stack.pop(), n = neighbors(p[0], p[1]);
      for (var i = 0; i < n.length; i++) {
        var k = n[i][0] + ',' + n[i][1];
        if (seen[k] || grid[n[i][0]][n[i][1]] < 0) continue;
        seen[k] = 1; stack.push(n[i]);
      }
    }
    for (var r = 0; r < grid.length; r++) for (var cc = 0; cc < ncols(r); cc++) if (grid[r][cc] >= 0 && !seen[r + ',' + cc]) out.push([r, cc]);
    return out;
  }
  function dangerRows() {
    for (var r = grid.length - 1; r >= 0; r--) for (var c = 0; c < COLS; c++) if (grid[r][c] >= 0) return MAXROWS - 1 - r;
    return 99;
  }

  // ---------- Oyun durumu ----------
  var state = 'idle', level = 1, score = 0, shots = 0, gains = [], streak = 0, missLimit = 6, missLeft = 6;
  var cur = 0, nxt = 1, ball = null, angle = -Math.PI / 2, lastShot = 0, holdUntil = 0, overT = 0;
  var MODES = ['classic', 'timed', 'daily'], TIMED = 120;
  var mode = MODES.indexOf(lsGet('bp_mode')) >= 0 ? lsGet('bp_mode') : 'classic';
  var seed = 0, timeLeft = 0, target = null, challenge = null, lastScoreId = null, offlineGame = false, overReason = '';
  function bestKey(m) { return 'bp_best' + (m === 'classic' ? '' : '_' + m); }
  function bestFor(m) { return +(lsGet(bestKey(m)) || 0); }
  var shake = 0, recoil = 0, loadT = 1, praise = null, confetti = [], recordBroken = false, gs = {};
  function resetStats() { gs = { popped: 0, dropped: 0, biggest: 0, maxStreak: 0, bomb: 0, joker: 0, bolt: 0 }; }
  resetStats();
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  var fx = [], texts = [], banner = null, token = null, best = bestFor(mode);
  var shownScore = 0;

  function calcMissLimit() { return Math.max(3, 7 - level); }
  function updateHud(bump) {
    $('level').textContent = level; $('shots').textContent = shots; $('best').textContent = fmt(Math.max(best, score));
    var sk = $('streak'); sk.textContent = '×' + Math.max(1, Math.min(streak, 5)); sk.classList.toggle('hot', streak > 1);
    $('scCard').classList.toggle('fire', streak >= 3 && state === 'play');
    var ms = $('miss'); ms.textContent = missLeft + '/' + missLimit; ms.classList.toggle('hot', missLeft === 1 && state === 'play');
    if (bump) { var n = $('score'); n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
  }
  function fmt(n) { return Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR'); }

  var starting = false;
  function startGame() {
    if (starting) return;
    ensureAudio();
    // Küçük ekranda oyun alanını görünür alana oturt
    if (innerWidth < 1000) { try { $('stage').closest('.game').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    if ($('ovStart').classList.contains('show') && $('startName').value.trim() && !setNick($('startName').value, true)) {
      $('startName').focus(); return;
    }
    if (mode === 'daily' && dailyDone()) { showOv('ovStart'); renderModeSel(); return; }
    var prev = score;
    if (quickSave()) {
      var nm = $('nickMsg'); nm.className = 'nick-msg ok'; nm.textContent = t('m.prev').replace('{s}', fmt(prev));
      setTimeout(loadBoard, 1500);
    } else if (token) ping(true);
    starting = true; token = null;
    $('playBtn').disabled = true; $('againBtn').disabled = true;
    var body = { mode: mode }, done = false;
    if (challenge && mode === 'classic') body.ch = challenge.id;
    var go = function (j) {
      if (done) return; done = true; starting = false;
      $('playBtn').disabled = false; $('againBtn').disabled = false;
      begin(j);
    };
    fetch(API + '?a=start', { method: 'POST', cache: 'no-store', body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (done) return;
        if (j && j.ok) { token = j.token; setStats(j.plays, j.online); go(j); } else go(null);
      })
      .catch(function () { go(null); });
    setTimeout(function () { go(null); }, 3500);
  }

  function begin(j) {
    offlineGame = !j;
    seed = j ? (j.seed >>> 0) : (mode === 'daily' ? dailySeed(todayKey()) : 1 + Math.floor(Math.random() * 0x7ffffffe));
    target = j && j.target ? { name: j.target.name, score: j.target.score, passed: false } : null;
    seedRng(seed);
    level = 1; score = 0; shownScore = 0; shots = 0; gains = []; streak = 0; ball = null; fx = []; texts = []; overT = 0;
    praise = null; confetti = []; recordBroken = false; recoil = 0; loadT = 1; resetStats(); sinceSpecial = 0;
    best = bestFor(mode); $('best').textContent = fmt(best);
    $('scCard').classList.remove('record', 'fire');
    timeLeft = mode === 'timed' ? TIMED : 0; overReason = ''; lastScoreId = null;
    missLimit = missLeft = calcMissLimit();
    newBoard();
    cur = randColor(); nxt = randColor();
    state = 'play'; holdUntil = performance.now() + 500;
    banner = mode === 'daily' ? { text: t('c.daily'), t: 0, sub: todayKey() }
      : mode === 'timed' ? { text: t('c.timed'), t: 0, sub: '2:00' }
      : { text: t('c.level') + ' 1', t: 0, sub: target ? t('c.target') + ' ' + fmt(target.score) : null };
    $('score').textContent = '0'; updateHud();
    showOv(null);
    if (mode === 'daily') lsSet('bp_daily', JSON.stringify({ day: todayKey(), score: 0, done: false }));
    missionEvent('start', {});
    tut = lsGet('bp_tut') ? 0 : 1; tutT = 0;
  }

  // Çevrimiçi sinyali: oyun sürerken 25 sn'de bir
  function ping(end) {
    if (!token) return;
    var body = JSON.stringify({ token: token, end: !!end });
    if (end && navigator.sendBeacon) { try { navigator.sendBeacon(API + '?a=ping', body); return; } catch (e) {} }
    fetch(API + '?a=ping', { method: 'POST', cache: 'no-store', body: body, keepalive: !!end })
      .then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) setStats(null, j.online); }).catch(function () {});
  }
  setInterval(function () { if (state === 'play' && !document.hidden) ping(false); }, 25000);
  addEventListener('pagehide', function () { if ((state === 'play' || state === 'paused') && !quickSave()) ping(true); });

  function payload(name) {
    return { token: token, name: name, score: score, shots: shots, level: level, gains: gains, seed: seed, city: lsGet('bp_city') || null };
  }
  // Oyun bitmeden ayrılınca (sayfayı yenileme/kapatma, oyun ortasında Yeni oyun) o ana kadarki skoru kaydet
  function quickSave() {
    var nk = lsGet('bp_name') || '';
    if (!token || score <= 0 || !validName(nk) || !(state === 'play' || state === 'paused')) return false;
    var body = JSON.stringify(payload(nk)), sent = false;
    if (mode === 'daily') lsSet('bp_daily', JSON.stringify({ day: todayKey(), score: score, done: true }));
    token = null;
    try { sent = !!(navigator.sendBeacon && navigator.sendBeacon(API + '?a=submit', new Blob([body], { type: 'text/plain' }))); } catch (e) {}
    if (!sent) fetch(API + '?a=submit', { method: 'POST', cache: 'no-store', body: body, keepalive: true }).catch(function () {});
    return true;
  }

  function fire() {
    var now = performance.now();
    if (state !== 'play' || ball || rowAnim < 0 || now < holdUntil || now - lastShot < 200) return;
    lastShot = now;
    ball = { x: SH_X, y: SH_Y, vx: Math.cos(angle), vy: Math.sin(angle), color: cur };
    cur = nxt; nxt = nextBall();
    recoil = 1; loadT = 0;
    if (tut) { tut++; tutT = 0; if (tut > 3) { tut = 0; lsSet('bp_tut', '1'); addText(W / 2, 380, t('tut.done'), false, C.accent); } }
    fx.push({ k: 'flash', x: SH_X + Math.cos(angle) * 50, y: SH_Y + Math.sin(angle) * 50, t: 0, life: 0.15, r: 14 });
    sfx.shoot();
  }
  var sinceSpecial = 0;
  function nextBall() {
    sinceSpecial++;
    // ~her 12 atışta bir sürpriz; en az 7 atış arayla, ilk 5 atışta yok
    if (shots >= 5 && sinceSpecial >= 7 && rnd() < 0.13) {
      sinceSpecial = 0;
      var roll = rnd(), kind = roll < 0.45 ? BOMB : roll < 0.8 ? JOKER : BOLT;
      addText(NEXT_X + 30, NEXT_Y - 40, t('c.surprise'), false, C.accent);
      tone(880, 0.08, 'triangle', 0.07, 1320); tone(1320, 0.1, 'triangle', 0.06, 1760, 0.08);
      return kind;
    }
    return randColor();
  }
  function swap() {
    if (state !== 'play') return;
    var tmp = cur; cur = nxt; nxt = tmp; tone(600, 0.05, 'sine', 0.05, 800);
  }

  function addText(x, y, s, big, color) { texts.push({ x: x, y: y, s: s, t: 0, big: big, color: color }); }

  // Hücreleri patlat, kopanları düşür, puanı ve tahta temizliğini hesapla
  function blast(cells, r, c, mult) {
    var ox = cx(r, c), oy = cy(r), gain = 0;
    cells.forEach(function (p) {
      var col = grid[p[0]][p[1]], x = cx(p[0], p[1]), y = cy(p[0]);
      grid[p[0]][p[1]] = -1;
      fx.push({ k: 'pop', x: x, y: y, c: col, t: -Math.hypot(x - ox, y - oy) / 900 });
    });
    gain += cells.length * 10 * mult;
    var fl = floating();
    fl.forEach(function (p) {
      fx.push({ k: 'fall', x: cx(p[0], p[1]), y: cy(p[0]), c: grid[p[0]][p[1]], vx: (Math.random() - 0.5) * 140, vy: -60 - Math.random() * 120, t: 0 });
      grid[p[0]][p[1]] = -1;
    });
    var k = fl.length;
    gain += 20 * k * (1 + Math.floor(k / 10));
    if (k) sfx.drop(k);
    gs.popped += cells.length; gs.dropped += k;
    var total = cells.length + k;
    lastShot_total += total; lastShot_dropped += k;
    if (total > gs.biggest) gs.biggest = total;
    if (total >= 10) {
      var lv = total >= 25 ? 3 : total >= 15 ? 2 : 1;
      praise = { text: t('p.' + lv), t: 0, lv: lv };
      sfx.praise(lv);
    }
    addText(ox, oy, '+' + gain, false);
    if (mult > 1) addText(ox, oy + 22, t('c.streak') + ' ×' + mult, false, C.accent);
    if (boardEmpty()) {
      var bonus = Math.min(1000 * level, 50000);
      gain += bonus;
      banner = { text: t('c.clear') + ' +' + fmt(bonus), t: 0, sub: t('c.level') + ' ' + (level + 1) };
      sfx.clear();
      level++; missLimit = missLeft = calcMissLimit();
      holdUntil = performance.now() + 1400;
      setTimeout(function () { if (state === 'play' || state === 'paused') { newBoard(); cur = randColor(); nxt = randColor(); } }, 1100);
    }
    return gain;
  }
  var lastShot_total = 0, lastShot_dropped = 0, lastShot_special = '';
  function occupiedWithin(r, c, radius) {
    var out = [], x0 = cx(r, c), y0 = cy(r);
    for (var rr = Math.max(0, r - 3); rr <= r + 3 && rr < grid.length; rr++)
      for (var cc = 0; cc < ncols(rr); cc++)
        if (grid[rr][cc] >= 0 && Math.hypot(cx(rr, cc) - x0, cy(rr) - y0) <= radius) out.push([rr, cc]);
    return out;
  }
  function miss() {
    streak = 0; sfx.stick();
    missLeft--;
    if (missLeft <= 0) { missLeft = missLimit; addRow(); }
    else if (missLeft === 1) sfx.warn();
  }

  function place(r, c, color) {
    shots++;
    var gain = 0, cells;

    if (color === BOMB || color === BOLT) {
      if (color === BOMB) {
        cells = occupiedWithin(r, c, D * 2.05);
        fx.push({ k: 'ring', x: cx(r, c), y: cy(r), t: 0, col: '#ff5a1f', max: D * 2.6 });
        shake = 0.35; sfx.boom();
        banner = { text: t('c.bomb'), t: 0.4 };
      } else {
        cells = [];
        [r, r - 1].forEach(function (rr) {
          if (rr < 0 || rr >= grid.length) return;
          for (var cc = 0; cc < ncols(rr); cc++) if (grid[rr][cc] >= 0) cells.push([rr, cc]);
        });
        fx.push({ k: 'bolt', y: cy(r), y2: cy(Math.max(0, r - 1)), t: 0 });
        sfx.zap();
        banner = { text: t('c.bolt'), t: 0.4 };
      }
      gs[color === BOMB ? 'bomb' : 'bolt']++; lastShot_special = color === BOMB ? 'bomb' : 'bolt';
      if (cells.length) { streak++; gain = blast(cells, r, c, Math.min(streak, 5)); sfx.pop(Math.min(cells.length, 8), streak); }
      else miss();
    } else {
      if (color === JOKER) {
        gs.joker++; lastShot_special = 'joker';
        // komşulardaki renkler arasından en büyük eşleşmeyi veren renk
        var bestCol = -1, bestN = 0, n = neighbors(r, c);
        n.forEach(function (p) {
          var col = grid[p[0]][p[1]]; if (col < 0) return;
          grid[r][c] = col; var size = flood(r, c, true).length; grid[r][c] = -1;
          if (size > bestN) { bestN = size; bestCol = col; }
        });
        color = bestCol >= 0 ? bestCol : randColor();
        fx.push({ k: 'ring', x: cx(r, c), y: cy(r), t: 0, col: '#ffffff', max: D * 1.4 });
        addText(cx(r, c), cy(r) - 24, t('c.joker'), false, C.accent);
      }
      grid[r][c] = color;
      if (r >= MAXROWS) { gains.push(0); sfx.stick(); return gameOver(); }
      cells = flood(r, c, true);
      if (cells.length >= 3) {
        streak++;
        gain = blast(cells, r, c, Math.min(streak, 5));
        sfx.pop(cells.length, streak);
      } else miss();
    }
    gains.push(gain); score += gain;
    if (streak > gs.maxStreak) gs.maxStreak = streak;
    missionEvent('shot', { total: lastShot_total, dropped: lastShot_dropped, special: lastShot_special });
    lastShot_total = 0; lastShot_dropped = 0; lastShot_special = '';
    if (target && !target.passed && score > target.score) {
      target.passed = true; banner = { text: t('c.passed'), t: 0 }; sfx.record();
    }
    if (gain) updateHud(true); else updateHud();
    if (state !== 'play') return;
    // 6) oyun içinde rekor kırıldı
    if (!recordBroken && best > 0 && score > best) celebrateRecord();
    var p = presentColors();
    if (p.length) {
      if (!isSpecial(cur) && p.indexOf(cur) < 0) cur = randColor();
      if (!isSpecial(nxt) && p.indexOf(nxt) < 0) nxt = randColor();
    }
  }

  function celebrateRecord() {
    recordBroken = true;
    banner = { text: t('c.record'), t: 0 };
    sfx.record();
    var card = $('scCard'); card.classList.remove('record'); void card.offsetWidth; card.classList.add('record');
    for (var i = 0; i < 90; i++) {
      confetti.push({
        x: Math.random() * W, y: -10 - Math.random() * 160, vx: (Math.random() - 0.5) * 80, vy: 90 + Math.random() * 140,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, w: 5 + Math.random() * 4, h: 8 + Math.random() * 6,
        c: PALETTE[i % PALETTE.length].b
      });
    }
  }

  function addRow() {
    shift ^= 1;
    grid.unshift(emptyRow()); grid.pop();
    fillRow(0, colorCount());
    rowAnim = -ROWH;
    sfx.row();
    for (var c = 0; c < COLS; c++) if (grid[MAXROWS][c] >= 0) { rowAnim = 0; return gameOver(); }
  }

  function gameOver() {
    state = 'over'; overT = 0; ball = null; sfx.over();
    $('scCard').classList.remove('fire');
    var prevBest = best, isBest = score > best;
    if (isBest) { best = score; lsSet(bestKey(mode), String(best)); }
    renderSkins();
    if (mode === 'daily') lsSet('bp_daily', JSON.stringify({ day: todayKey(), score: score, done: true }));
    missionEvent('end', {});
    updateHud();
    setTimeout(function () {
      $('endScore').firstChild.nodeValue = fmt(score);
      $('endLevel').textContent = level; $('endShots').textContent = shots;
      $('newBest').classList.toggle('on', isBest && score > 0);
      fillReport(isBest, prevBest);
      var m = $('saveMsg'); m.className = 'msg'; m.textContent = '';
      var form = $('saveForm');
      form.style.display = score > 0 ? '' : 'none';
      if (score <= 0) m.textContent = t('m.zero');
      $('saveBtn').disabled = false; $('nameIn').disabled = false;
      var nk = lsGet('bp_name') || '';
      $('nameIn').value = nk;
      showOv('ovEnd');
      if (score > 0 && validName(nk)) { form.style.display = 'none'; submitScore(nk); }
      else {
        ping(true);
        if (score > 0 && matchMedia('(pointer:fine)').matches) setTimeout(function () { $('nameIn').focus(); }, 300);
      }
    }, 1300);
  }

  function fillReport(isBest, prevBest) {
    $('endL').textContent = overReason === 'time' ? t('end.time') : (mode === 'classic' ? t('end.l') : t('md.' + mode));
    var ch = $('rCh');
    if (target) {
      ch.hidden = false; ch.classList.toggle('win', score > target.score);
      ch.textContent = score > target.score ? t('ch.win').replace('{n}', target.name).replace('{s}', fmt(target.score))
        : t('ch.lose').replace('{n}', target.name).replace('{d}', fmt(target.score - score + 10));
    } else ch.hidden = true;
    $('rPop').textContent = fmt(gs.popped); $('rDrop').textContent = fmt(gs.dropped);
    $('rBig').textContent = fmt(gs.biggest); $('rStreak').textContent = '×' + Math.max(1, Math.min(gs.maxStreak, 5));
    var sp = [];
    if (gs.bomb) sp.push('<span class="mini bomb"></span>' + gs.bomb);
    if (gs.joker) sp.push('<span class="mini joker"></span>' + gs.joker);
    if (gs.bolt) sp.push('<span class="mini bolt"></span>' + gs.bolt);
    $('rSp').innerHTML = sp.join(''); $('rSp').hidden = !sp.length;
    var tg = $('rToGo');
    if (score <= 0) tg.textContent = '';
    else if (isBest) tg.textContent = prevBest > 0 ? t('r.new').replace('{n}', fmt(prevBest)) : t('r.first');
    else tg.textContent = t('r.togo').replace('{n}', fmt(best - score + 10));
    tg.classList.toggle('win', isBest && score > 0);
    $('shareRow').hidden = score <= 0;
  }

  // ---------- Paylaşım görseli ----------
  var SHARE_URL = 'https://okutan.org/balon/';
  function shareBall(g, x, y, r, p) {
    var grd = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grd.addColorStop(0, p.h); grd.addColorStop(0.42, p.b); grd.addColorStop(1, p.l);
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
    g.beginPath(); g.ellipse(x - r * 0.32, y - r * 0.42, r * 0.36, r * 0.22, -0.6, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.fill();
  }
  function makeShareImage() {
    var c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    var g = c.getContext('2d');
    g.fillStyle = '#121212'; g.fillRect(0, 0, 1200, 630);
    g.fillStyle = '#262626';
    for (var yy = 12; yy < 630; yy += 24) for (var xx = 12; xx < 1200; xx += 24) { g.beginPath(); g.arc(xx, yy, 1.3, 0, 6.3); g.fill(); }
    // balon kümesi (sağ)
    var rr = 26, rh = rr * Math.sqrt(3);
    for (var row = 0; row < 7; row++) for (var col = 0; col < 8; col++) {
      if (row > 3 && (col + row) % 3 === 0) continue;
      if (row === 6 && col > 4) continue;
      shareBall(g, 760 + col * rr * 2 + (row % 2 ? rr : 0), 70 + row * rh, rr - 1, PALETTE[(row * 3 + col * 5) % 6]);
    }
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#9a9a9a'; g.font = '500 20px "JetBrains Mono", monospace';
    g.fillText('OKUTAN.ORG/BALON', 72, 92);
    g.font = '800 64px "Inter Tight", sans-serif'; g.fillStyle = '#f4f4f2'; g.fillText('Balon', 72, 168);
    g.fillStyle = '#ff5a1f'; g.fillText('Patlat', 72 + g.measureText('Balon ').width, 168);
    g.font = '800 150px "Inter Tight", sans-serif'; g.fillStyle = '#f4f4f2';
    var sc = fmt(score); g.fillText(sc, 66, 330);
    var sw = g.measureText(sc).width;
    g.font = '500 22px "JetBrains Mono", monospace'; g.fillStyle = '#9a9a9a';
    g.fillText(lang === 'en' ? 'PTS' : 'PUAN', 76 + sw, 330);
    var nk = lsGet('bp_name') || '';
    g.font = '700 30px "Inter Tight", sans-serif'; g.fillStyle = '#f4f4f2';
    g.fillText((nk ? nk + ' · ' : '') + (lang === 'en' ? 'Level ' : 'Seviye ') + level, 72, 382);
    var stats = [[gs.popped, t('r.pop')], [gs.dropped, t('r.drop')], [gs.biggest, t('r.big')], ['×' + Math.max(1, Math.min(gs.maxStreak, 5)), t('r.streak')]];
    stats.forEach(function (st, i) {
      var x = 72 + i * 170;
      g.fillStyle = 'rgba(255,255,255,.06)'; g.strokeStyle = '#2a2a2a'; g.lineWidth = 2;
      g.beginPath(); if (g.roundRect) g.roundRect(x, 420, 156, 92, 14); else g.rect(x, 420, 156, 92); g.fill(); g.stroke();
      g.fillStyle = '#f4f4f2'; g.font = '800 34px "Inter Tight", sans-serif'; g.fillText(typeof st[0] === 'number' ? fmt(st[0]) : st[0], x + 16, 466);
      g.fillStyle = '#9a9a9a'; g.font = '500 14px "JetBrains Mono", monospace'; g.fillText(String(st[1]).toUpperCase().slice(0, 16), x + 16, 494);
    });
    g.fillStyle = '#ff5a1f'; g.font = '700 26px "Inter Tight", sans-serif';
    g.fillText(lang === 'en' ? 'Can you beat me? → okutan.org/balon' : 'Beni geçebilir misin? → okutan.org/balon', 72, 572);
    return c;
  }
  function shareText() { return t('sh.text').replace('{s}', fmt(score)); }
  function shareUrl() { return lastScoreId ? SHARE_URL + 'meydan.php?id=' + lastScoreId : SHARE_URL; }
  function downloadImage(c) {
    var a = document.createElement('a'); a.download = 'balon-patlat-' + score + '.png'; a.href = c.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove(); showToast(t('sh.saved'));
  }
  $('shareBtn').onclick = function () {
    var c = makeShareImage(), txt = shareText();
    c.toBlob(function (blob) {
      var file = null;
      try { file = new File([blob], 'balon-patlat.png', { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], text: txt + ' ' + shareUrl() }).catch(function () {});
      } else if (navigator.share) {
        navigator.share({ text: txt, url: shareUrl() }).catch(function () {});
      } else downloadImage(c);
    }, 'image/png');
  };
  $('dlBtn').onclick = function () { downloadImage(makeShareImage()); };
  $('waBtn').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent(shareText() + ' ' + shareUrl()), '_blank', 'noopener'); };
  $('xBtn').onclick = function () { window.open('https://x.com/intent/post?text=' + encodeURIComponent(shareText()) + '&url=' + encodeURIComponent(shareUrl()), '_blank', 'noopener'); };

  // ---------- Bildirim (toast) ----------
  var toastTimer = 0;
  function showToast(msg) {
    var el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('show'); }, 4200);
  }

  // ---------- 9) Tam ekran ----------
  var gameBox = $('stage').closest('.game');
  var fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  if (!fsOK) $('fsBtn').hidden = true;
  function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFs() {
    if (!fsOK) return;
    try {
      var pr = isFs() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (gameBox.requestFullscreen || gameBox.webkitRequestFullscreen).call(gameBox);
      if (pr && pr.catch) pr.catch(function () {});
    } catch (e) {}
  }
  $('fsBtn').onclick = toggleFs;
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
    document.addEventListener(ev, function () { $('fsBtn').setAttribute('aria-pressed', isFs() ? 'true' : 'false'); });
  });

  // ---------- Görünüm seçici ----------
  document.querySelectorAll('.skins button').forEach(function (b) { b.onclick = function () { setSkin(b.dataset.skin); }; });
  setSkin(skin, true);

  function showOv(id) {
    ['ovStart', 'ovEnd', 'ovPause'].forEach(function (o) { $(o).classList.toggle('show', o === id); });
  }
  function pause() { if (state === 'play') { state = 'paused'; showOv('ovPause'); } }
  function resume() { if (state === 'paused') { state = 'play'; showOv(null); holdUntil = performance.now() + 250; } }

  // ---------- Girdi ----------
  function toLocal(e) {
    var rc = cv.getBoundingClientRect();
    return { x: (e.clientX - rc.left) * W / rc.width, y: (e.clientY - rc.top) * H / rc.height };
  }
  function aimAt(p) {
    var a = Math.atan2(p.y - SH_Y, p.x - SH_X);
    if (a > 0) a = p.x < SH_X ? -Math.PI : 0;
    angle = Math.min(-0.12, Math.max(-Math.PI + 0.12, a));
  }
  function onNext(p) { return Math.hypot(p.x - NEXT_X, p.y - NEXT_Y) < 26; }
  var down = null;
  cv.addEventListener('pointerdown', function (e) {
    ensureAudio();
    var p = toLocal(e);
    if (onNext(p)) { swap(); down = null; return; }
    down = { id: e.pointerId };
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    aimAt(p); e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    var p = toLocal(e);
    if (down || e.pointerType === 'mouse') aimAt(p);
    cv.style.cursor = onNext(p) ? 'pointer' : 'crosshair';
  });
  cv.addEventListener('pointerup', function (e) {
    if (!down) return;
    down = null; aimAt(toLocal(e)); fire();
  });
  cv.addEventListener('pointercancel', function () { down = null; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); swap(); });

  var keys = {};
  addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { keys[k] = 1; e.preventDefault(); }
    else if (k === ' ' || k === 'ArrowUp') { e.preventDefault(); if (state === 'play') { ensureAudio(); fire(); } }
    else if (k === 'x' || k === 'X') swap();
    else if (k === 'm' || k === 'M') toggleMute();
    else if (k === 'f' || k === 'F') toggleFs();
    else if (k === 'p' || k === 'P' || k === 'Escape') { state === 'play' ? pause() : resume(); }
    else if (k === 'Enter' && $('ovStart').classList.contains('show')) startGame();
  });
  addEventListener('keyup', function (e) { delete keys[e.key]; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  addEventListener('blur', function () { keys = {}; });

  $('playBtn').onclick = startGame;
  $('againBtn').onclick = startGame;
  // Yeni oyun: mod seçimi için başlangıç ekranını aç (süren oyun bekletilir, Oyna'ya basınca skoru kaydedilir)
  $('newBtn').onclick = function () {
    if (state === 'play') state = 'paused';
    showOv('ovStart'); renderModeSel();
  };
  $('pauseBtn').onclick = function () { state === 'play' ? pause() : resume(); };
  $('resumeBtn').onclick = resume;

  // ---------- Güncelleme ----------
  var lastTick = 99, tut = 0, tutT = 0;
  function step(dt) {
    if (state === 'play' && mode === 'timed' && rowAnim >= 0 && performance.now() > holdUntil - 400) {
      timeLeft -= dt;
      var whole = Math.ceil(timeLeft);
      if (whole !== lastTick && whole <= 10 && whole > 0) tone(whole <= 3 ? 1200 : 900, 0.05, 'square', 0.03);
      lastTick = whole;
      if (timeLeft <= 0) { timeLeft = 0; overReason = 'time'; ball = null; sfx.clear(); return gameOver(); }
    }
    if (keys.ArrowLeft) angle = Math.max(-Math.PI + 0.12, angle - 1.7 * dt);
    if (keys.ArrowRight) angle = Math.min(-0.12, angle + 1.7 * dt);
    if (rowAnim < 0) rowAnim = Math.min(0, rowAnim + Math.max(ROWH * 4, -rowAnim * 5) * dt);

    if (ball && state === 'play') {
      var dist = SPEED * dt, n = Math.ceil(dist / 4), s = dist / n;
      for (var i = 0; i < n; i++) {
        ball.x += ball.vx * s; ball.y += ball.vy * s;
        if (ball.x < R) { ball.x = 2 * R - ball.x; ball.vx = -ball.vx; sfx.bounce(); }
        if (ball.x > W - R) { ball.x = 2 * (W - R) - ball.x; ball.vx = -ball.vx; sfx.bounce(); }
        if (hitTest(ball.x, ball.y)) {
          var cell = snapCell(ball.x, ball.y), col = ball.color;
          ball = null;
          if (cell) place(cell.r, cell.c, col); else { shots++; gains.push(0); gameOver(); }
          break;
        }
      }
    }
    for (var j = fx.length - 1; j >= 0; j--) {
      var f = fx[j]; f.t += dt;
      if (f.k === 'pop') { if (f.t > 0.32) fx.splice(j, 1); }
      else if (f.k === 'fall') { f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; if (f.y > H + D) fx.splice(j, 1); }
      else if (f.k === 'ring' || f.k === 'bolt') { if (f.t > 0.45) fx.splice(j, 1); }
      else if (f.k === 'spark') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; if (f.t > f.life) fx.splice(j, 1); }
      else if (f.k === 'shard') { f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; if (f.t > f.life) fx.splice(j, 1); }
      else if (f.k === 'flash') { if (f.t > f.life) fx.splice(j, 1); }
    }
    for (var q = texts.length - 1; q >= 0; q--) { texts[q].t += dt; if (texts[q].t > 1.1) texts.splice(q, 1); }
    if (banner) { banner.t += dt; if (banner.t > 1.6) banner = null; }
    if (state === 'over') overT += dt;
    if (shake > 0) shake = Math.max(0, shake - dt);
    if (tut) tutT += dt;
    if (recoil > 0) recoil = Math.max(0, recoil - dt * 6);
    if (loadT < 1) loadT = Math.min(1, loadT + dt * 4);
    if (praise) { praise.t += dt; if (praise.t > 1.3) praise = null; }
    for (var ci = confetti.length - 1; ci >= 0; ci--) {
      var cf = confetti[ci]; cf.x += cf.vx * dt; cf.y += cf.vy * dt; cf.rot += cf.vr * dt; cf.vx += Math.sin(cf.y / 30) * 6 * dt;
      if (cf.y > H + 20) confetti.splice(ci, 1);
    }
    if (shownScore !== score) {
      shownScore += Math.max(1, (score - shownScore) * Math.min(1, dt * 10));
      if (shownScore > score) shownScore = score;
      $('score').textContent = fmt(shownScore);
    }
  }

  // ---------- Çizim ----------
  function trace() {
    // Nişan çizgisi: duvardan sekmeyi hesaba katar, çarpacağı yerde hayalet balon gösterir
    var x = SH_X, y = SH_Y, vx = Math.cos(angle), vy = Math.sin(angle), pts = [], acc = 0, bounces = 0;
    for (var i = 0; i < 400; i++) {
      x += vx * 4; y += vy * 4; acc += 4;
      if (x < R) { x = 2 * R - x; vx = -vx; if (++bounces > 2) break; }
      if (x > W - R) { x = 2 * (W - R) - x; vx = -vx; if (++bounces > 2) break; }
      if (acc >= 16) { acc = 0; pts.push(x, y); }
      if (hitTest(x, y)) return { pts: pts, cell: snapCell(x, y) };
    }
    return { pts: pts, cell: null };
  }

  function draw(now) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (shake > 0) { var sa = shake * 18; ctx.translate((Math.random() - 0.5) * sa, (Math.random() - 0.5) * sa); }

    // 5) seviyeye göre zemin tonu
    var TINTS = [null, '#ff5a1f', '#3366ff', '#22b35e', '#a845e8', '#12b4c8', '#ffc21a'];
    var tc = state !== 'idle' ? TINTS[(level - 1) % TINTS.length] : null;
    if (tc) {
      var tg = ctx.createLinearGradient(0, 0, 0, H);
      tg.addColorStop(0, hexA(tc, 0.13)); tg.addColorStop(0.7, hexA(tc, 0.03)); tg.addColorStop(1, hexA(tc, 0));
      ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);
    }
    // 4) tehlike: balonlar çizgiye yaklaştıkça alttan kırmızı nabız
    var dr = state === 'play' ? dangerRows() : 99;
    if (dr <= 3) {
      var inten = (4 - dr) / 4, puls = 0.5 + 0.5 * Math.sin(now / (dr <= 0 ? 70 : dr <= 1 ? 110 : 170));
      var dg = ctx.createLinearGradient(0, DEAD_Y - 200, 0, H);
      dg.addColorStop(0, 'rgba(220,38,38,0)'); dg.addColorStop(0.55, 'rgba(220,38,38,' + (0.06 + 0.16 * inten * puls) + ')');
      dg.addColorStop(1, 'rgba(220,38,38,' + (0.1 + 0.2 * inten * puls) + ')');
      ctx.fillStyle = dg; ctx.fillRect(0, DEAD_Y - 200, W, H - DEAD_Y + 200);
    }
    // ölüm çizgisi
    var danger = state === 'play' && dangerRows() <= 2;
    ctx.save();
    ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
    ctx.strokeStyle = danger ? C.accent : C.line;
    if (danger) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 140);
    ctx.beginPath(); ctx.moveTo(0, DEAD_Y); ctx.lineTo(W, DEAD_Y); ctx.stroke();
    ctx.restore();

    // balonlar
    var playing = state === 'play' || state === 'paused';
    for (var r = 0; r < grid.length; r++) {
      var y = cy(r); if (y < -R) continue;
      for (var c = 0; c < ncols(r); c++) {
        var v = grid[r][c]; if (v < 0) continue;
        var gray = state === 'over' && overT > (grid.length - r) * 0.05;
        drawBall(gray ? -1 : v, cx(r, c), y);
      }
    }

    // efektler
    fx.forEach(function (f) {
      if (f.k === 'pop') {
        if (f.t < 0) { drawBall(f.c, f.x, f.y); return; }
        if (!f.burst) {
          f.burst = 1;
          fx.push({ k: 'flash', x: f.x, y: f.y, t: 0, life: 0.18, r: R * 1.5 });
          for (var h = 0; h < 2; h++) {
            var dir = h ? 1 : -1;
            fx.push({ k: 'shard', x: f.x + dir * 3, y: f.y, c: f.c, side: h, vx: dir * (70 + Math.random() * 90), vy: -90 - Math.random() * 110, rot: 0, vr: dir * (4 + Math.random() * 5), t: 0, life: 0.55 });
          }
          for (var i = 0; i < 6; i++) {
            var a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 160;
            fx.push({ k: 'spark', x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, c: f.c, t: 0, life: 0.35 + Math.random() * 0.25 });
          }
        }
        var k = f.t / 0.32; drawBall(f.c, f.x, f.y, 1 + k * 0.5, 1 - k);
      } else if (f.k === 'fall') {
        drawBall(f.c, f.x, f.y, 1, f.y > DEAD_Y ? 1 - (f.y - DEAD_Y) / 120 : 1);
      } else if (f.k === 'ring') {
        var q = f.t / 0.45;
        ctx.globalAlpha = Math.max(0, 1 - q); ctx.strokeStyle = f.col; ctx.lineWidth = 6 * (1 - q) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.max * (0.3 + q * 0.7), 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = Math.max(0, 0.35 - q); ctx.fillStyle = f.col; ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.k === 'bolt') {
        var qb = f.t / 0.45;
        ctx.globalAlpha = Math.max(0, 1 - qb); ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        [f.y, f.y2].forEach(function (yy) {
          ctx.beginPath(); ctx.moveTo(0, yy);
          for (var xx = 0; xx <= W; xx += 24) ctx.lineTo(xx, yy + (Math.random() - 0.5) * 16);
          ctx.stroke();
        });
        ctx.globalAlpha = Math.max(0, 0.25 - qb * 0.5); ctx.fillStyle = '#ffd43b';
        ctx.fillRect(0, Math.min(f.y, f.y2) - R, W, Math.abs(f.y - f.y2) + D);
        ctx.globalAlpha = 1;
      } else if (f.k === 'shard') {
        var qa = f.t / f.life, pc = PALETTE[f.c] || GRAY;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = Math.max(0, 1 - qa);
        ctx.beginPath(); ctx.arc(0, 0, R * 0.9, f.side ? -Math.PI / 2 : Math.PI / 2, f.side ? Math.PI / 2 : Math.PI * 1.5); ctx.closePath();
        ctx.fillStyle = pc.b; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = pc.h; ctx.stroke();
        ctx.restore();
      } else if (f.k === 'flash') {
        var qf = f.t / f.life, fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.6 + qf));
        fg.addColorStop(0, 'rgba(255,255,255,' + (0.85 * (1 - qf)) + ')'); fg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + qf), 0, Math.PI * 2); ctx.fill();
      } else if (f.k === 'spark') {
        ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
        ctx.fillStyle = PALETTE[f.c] ? PALETTE[f.c].b : C.ink;
        ctx.beginPath(); ctx.arc(f.x, f.y, 3 * (1 - f.t / f.life) + 1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    });

    // nişan
    if (state === 'play' && !ball && rowAnim >= 0) {
      var tr = trace(), col = cur === BOMB ? '#ff5a1f' : cur === BOLT ? '#e0a800' : cur === JOKER ? C.ink : PALETTE[cur].b;
      ctx.fillStyle = col;
      for (var i = 0; i < tr.pts.length; i += 2) {
        ctx.globalAlpha = 0.55 * (1 - i / (tr.pts.length + 8));
        ctx.beginPath(); ctx.arc(tr.pts[i], tr.pts[i + 1], 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (tr.cell) {
        ctx.save(); ctx.globalAlpha = 0.5; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.strokeStyle = col;
        ctx.beginPath(); ctx.arc(cx(tr.cell.r, tr.cell.c), cy(tr.cell.r), R - 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }

    // uçan balon
    if (ball) drawBall(ball.color, ball.x, ball.y);

    // alt panel: top namlusu (geri tepme + sıradaki balonun yuvarlanarak dolması)
    var rc = recoil * 9;
    ctx.save(); ctx.translate(SH_X, SH_Y); ctx.rotate(angle);
    ctx.fillStyle = C.ink;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(8 - rc, -10, 46, 20, 6); else ctx.rect(8 - rc, -10, 46, 20); ctx.fill();
    ctx.fillStyle = C.accent; ctx.fillRect(36 - rc, -10, 6, 20);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(50 - rc, -12.5, 9, 25, 3); else ctx.rect(50 - rc, -12.5, 9, 25); ctx.fillStyle = C.ink; ctx.fill();
    ctx.restore();
    // gövde
    ctx.beginPath(); ctx.arc(SH_X, SH_Y, 27, 0, Math.PI * 2); ctx.fillStyle = C.block; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.beginPath(); ctx.arc(SH_X, SH_Y, 27, Math.PI * 0.15, Math.PI * 0.85); ctx.lineWidth = 3; ctx.strokeStyle = C.accent; ctx.stroke();
    // tekerlekler
    ctx.fillStyle = C.ink;
    [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.arc(SH_X + sd * 22, SH_Y + 24, 6, 0, Math.PI * 2); ctx.fill(); });
    if (playing || state === 'idle') {
      if (loadT < 1) {
        var e = 1 - Math.pow(1 - loadT, 3);
        drawBall(cur, NEXT_X + (SH_X - NEXT_X) * e, NEXT_Y + (SH_Y - NEXT_Y) * e - Math.sin(e * Math.PI) * 34, 0.8 + 0.2 * e);
      } else drawBall(cur, SH_X, SH_Y);
    }

    // sıradaki
    ctx.font = '500 10px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted; ctx.textAlign = 'center';
    ctx.fillText(t('c.next'), NEXT_X, NEXT_Y - 26);
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(NEXT_X, NEXT_Y, 19, 0, Math.PI * 2); ctx.stroke();
    if ((playing || state === 'idle') && loadT >= 0.6) drawBall(nxt, NEXT_X, NEXT_Y, 0.8 * Math.min(1, (loadT - 0.6) / 0.4));

    // ıska sayacı (tavan inişi)
    ctx.textAlign = 'right'; ctx.fillStyle = C.muted;
    ctx.fillText(t('c.drop'), W - 16, NEXT_Y - 26);
    for (var m = 0; m < missLimit; m++) {
      var mx = W - 22 - m * 18, filled = m < missLeft;
      ctx.beginPath(); ctx.arc(mx, NEXT_Y - 4, 6, 0, Math.PI * 2);
      if (filled) { ctx.fillStyle = missLeft === 1 && state === 'play' ? C.accent : C.ink; ctx.fill(); }
      else { ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    ctx.font = '700 15px "Inter Tight", sans-serif'; ctx.fillStyle = C.ink;
    ctx.fillText(fmt(shownScore), W - 16, NEXT_Y + 24);
    ctx.textAlign = 'left'; ctx.font = '500 10px "JetBrains Mono", monospace'; ctx.fillStyle = C.muted;
    ctx.fillText(t('c.level') + ' ' + level, 16, NEXT_Y + 26 > H - 4 ? H - 6 : NEXT_Y + 28);

    // ilk oyun eğitimi: konuşma balonu + hedefi gösteren ok
    if (tut && state === 'play' && rowAnim >= 0 && !banner) {
      var msg = t('tut.' + tut), a = Math.min(1, tutT * 3);
      var tx0 = W / 2, ty0 = tut === 3 ? DEAD_Y - 70 : DEAD_Y - 110, bob = Math.sin(now / 260) * 4;
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = '700 15px "Inter Tight", sans-serif';
      var tw = Math.min(W - 40, ctx.measureText(msg).width + 32), bx = tx0 - tw / 2, by = ty0 - 22 + bob;
      ctx.fillStyle = C.accent;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, tw, 40, 12); else ctx.rect(bx, by, tw, 40); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(msg, tx0, by + 26, W - 60);
      // ok: 1 → atıcıya, 2 → yan duvara, 3 → tavan sayacına
      var ax, ay, sx = tx0, sy = by + 40;
      if (tut === 1) { ax = SH_X; ay = SH_Y - 40; }
      else if (tut === 2) { ax = 18; ay = by + 20; sx = bx; sy = by + 20; }
      else { ax = W - 50; ay = NEXT_Y - 16; sx = bx + tw - 30; }
      ctx.strokeStyle = C.accent; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ax, ay + bob); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(ax, ay + bob, 6 + Math.sin(now / 200) * 2, 0, Math.PI * 2); ctx.fillStyle = C.accent; ctx.fill();
      ctx.restore();
    }
    // üstte hap rozetleri: süre (sağ), hedef (sol)
    function pill(x, y, txt, col, alignRight) {
      ctx.font = '700 14px "JetBrains Mono", monospace';
      var w = ctx.measureText(txt).width + 22, x0 = alignRight ? x - w : x;
      ctx.globalAlpha = 0.92; ctx.fillStyle = C.ink;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, y, w, 26, 13); else ctx.rect(x0, y, w, 26); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(txt, x0 + 11, y + 18);
    }
    if ((state === 'play' || state === 'paused') && mode === 'timed') {
      var tl = Math.max(0, Math.ceil(timeLeft)), urgent = tl <= 10;
      var tt = '⏱ ' + Math.floor(tl / 60) + ':' + ('0' + tl % 60).slice(-2);
      if (urgent) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 90);
      pill(W - 8, DEAD_Y - 34, tt, urgent ? '#ff6b6b' : C.field, true);
      ctx.globalAlpha = 1;
    }
    if ((state === 'play' || state === 'paused') && target) {
      pill(8, DEAD_Y - 34, (target.passed ? '✓ ' : '⚔ ') + target.name + ' ' + fmt(target.score), target.passed ? '#22c55e' : C.field, false);
    }
    // yazılar
    ctx.textAlign = 'center';
    texts.forEach(function (tx) {
      var k = tx.t / 1.1;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.font = '800 18px "Inter Tight", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = C.field; ctx.strokeText(tx.s, tx.x, tx.y - k * 40);
      ctx.fillStyle = tx.color || C.ink; ctx.fillText(tx.s, tx.x, tx.y - k * 40);
    });
    ctx.globalAlpha = 1;
    if (praise && state !== 'over') {
      var pk = praise.t / 1.3, sc2 = pk < 0.18 ? 0.4 + (pk / 0.18) * 0.75 : pk < 0.28 ? 1.15 - (pk - 0.18) * 1.5 : 1;
      ctx.save(); ctx.translate(W / 2, 220); ctx.rotate(-0.06); ctx.scale(sc2, sc2);
      ctx.globalAlpha = pk > 0.75 ? Math.max(0, (1 - pk) / 0.25) : 1;
      ctx.font = '900 ' + (36 + praise.lv * 8) + 'px "Inter Tight", sans-serif';
      ctx.lineWidth = 10; ctx.strokeStyle = C.ink; ctx.lineJoin = 'round'; ctx.strokeText(praise.text, 0, 0);
      ctx.fillStyle = praise.lv >= 3 ? '#ffc21a' : C.accent; ctx.fillText(praise.text, 0, 0);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    confetti.forEach(function (cf) {
      ctx.save(); ctx.translate(cf.x, cf.y); ctx.rotate(cf.rot); ctx.fillStyle = cf.c;
      ctx.fillRect(-cf.w / 2, -cf.h / 2 * Math.abs(Math.cos(cf.rot * 1.3)), cf.w, cf.h * Math.abs(Math.cos(cf.rot * 1.3)) + 1);
      ctx.restore();
    });
    if (banner && state !== 'over') {
      var bk = banner.t / 1.6, a = bk < 0.15 ? bk / 0.15 : bk > 0.8 ? (1 - bk) / 0.2 : 1;
      ctx.globalAlpha = a;
      ctx.font = '800 40px "Inter Tight", sans-serif';
      ctx.lineWidth = 8; ctx.strokeStyle = C.field; ctx.strokeText(banner.text, W / 2, 300);
      ctx.fillStyle = C.ink; ctx.fillText(banner.text, W / 2, 300);
      if (banner.sub) {
        ctx.font = '500 14px "JetBrains Mono", monospace'; ctx.fillStyle = C.accent; ctx.fillText(banner.sub, W / 2, 330);
      }
      ctx.globalAlpha = 1;
    }
  }

  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (state !== 'paused') step(dt);
    draw(now);
    requestAnimationFrame(loop);
  }

  // Açılışta arka planda örnek tahta
  level = 1; newBoard(); rowAnim = 0; cur = randColor(); nxt = randColor(); missLimit = missLeft = calcMissLimit();
  $('best').textContent = fmt(best);
  requestAnimationFrame(loop);

  // ---------- Liderlik tablosu ----------
  var lb = null, lbErr = false, period = lsGet('bp_period') || 'week', cities = null;
  var LBM = ['classic', 'timed', 'daily', 'cities'], lbMode = LBM.indexOf(lsGet('bp_lbmode')) >= 0 ? lsGet('bp_lbmode') : 'classic';
  var tabs = document.querySelectorAll('#ptabs button');
  document.querySelectorAll('#mtabs button').forEach(function (b) {
    b.onclick = function () { lbMode = b.dataset.m; lsSet('bp_lbmode', lbMode); lb = null; renderBoard(); loadBoard(); };
  });
  tabs.forEach(function (b) {
    b.onclick = function () { period = b.dataset.p; lsSet('bp_period', period); renderBoard(); };
  });
  function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  var stats = { plays: null, online: null };
  function setStats(plays, online) {
    if (plays != null) stats.plays = plays;
    if (online != null) stats.online = online;
    $('stPlays').textContent = stats.plays == null ? '—' : fmt(stats.plays);
    $('stOnline').textContent = stats.online == null ? '—' : fmt(stats.online);
  }
  function pn(n) { return '<button class="pn" data-name="' + esc(n) + '">' + esc(n) + '</button>'; }
  // isimden sabit renk: herkesin balon avatarı hep aynı renkte
  function avatar(n) {
    var p = PALETTE[fnv1a(String(n).toLocaleLowerCase('tr')) % PALETTE.length];
    return '<span class="av2" style="--a:' + p.b + ';--ah:' + p.h + ';--al:' + p.l + '">' + esc(initial(n)) + '</span>';
  }
  var CROWN = '<svg class="crown" viewBox="0 0 30 22" aria-hidden="true"><path d="M2 7l6.5 5L15 2l6.5 10L28 7l-2.6 13H4.6z" fill="#f5c542" stroke="#b8860b" stroke-width="1.4" stroke-linejoin="round"/><circle cx="2" cy="7" r="2" fill="#f5c542"/><circle cx="15" cy="2" r="2" fill="#f5c542"/><circle cx="28" cy="7" r="2" fill="#f5c542"/></svg>';
  // items: [{name, nameHTML, score, sub, me, extra}]
  function podiumHTML(items) {
    return [1, 0, 2].map(function (i, k) {
      var r = items[i];
      if (!r) return '<div class="pz r' + (i + 1) + ' empty" style="--d:' + (k * 90) + 'ms"><span class="av2 ghost">?</span><div class="pz-name">—</div><div class="pz-score">0</div><div class="pz-step"><span>' + (i + 1) + '</span></div></div>';
      return '<div class="pz r' + (i + 1) + (r.me ? ' me' : '') + '" style="--d:' + (k * 90) + 'ms">' + (i === 0 ? CROWN : '') + avatar(r.name) +
        '<div class="pz-name">' + r.nameHTML + '</div>' + ((r.sub || r.extra) ? '<div class="pz-sub">' + (r.extra || '') + (r.sub || '') + '</div>' : '') +
        '<div class="pz-score">' + fmt(r.score) + '</div><div class="pz-step"><span>' + (i + 1) + '</span></div></div>';
    }).join('');
  }
  function rowsHTML(items, topScore) {
    // iki sütuna dengeli dağıt (az satırda tek sütun)
    var el = $('lbList'), n = items.length;
    el.style.setProperty('--rows', n > 6 ? Math.ceil(n / 2) : Math.max(1, n));
    el.classList.toggle('one', n <= 6);
    return items.map(function (r, i) {
      var w = topScore > 0 ? Math.max(4, Math.round(r.score / topScore * 100)) : 0;
      return '<li class="row' + (r.me ? ' me' : '') + '" style="--i:' + i + ';--w:' + w + '%"><span class="rk">' + (i + 4) + '</span>' + avatar(r.name) +
        '<span class="who"><span class="wn">' + r.nameHTML + (r.extra || '') + (r.me ? '<em class="tagme">' + esc(t('lb.you')) + '</em>' : '') + '</span>' +
        (r.sub ? '<small>' + r.sub + '</small>' : '') + '</span><span class="pt">' + fmt(r.score) + '</span></li>';
    }).join('');
  }
  function emptyHTML(msg) { return '<li class="empty"><span class="em-ic" aria-hidden="true">🎈</span>' + esc(msg) + '</li>'; }
  function renderCities() {
    var el = $('lbList'), pod = $('podium'), my = lsGet('bp_city') || '';
    $('meRow').hidden = true;
    var rows = cities || [];
    if (!rows.length) { pod.innerHTML = podiumHTML([]); el.innerHTML = emptyHTML(t('lb.empty')); return; }
    var items = rows.map(function (r) {
      return { name: r.city, nameHTML: esc(r.city), score: r.score, sub: r.players + ' ' + esc(t('lb.players')), me: r.city === my };
    });
    pod.innerHTML = podiumHTML(items);
    el.innerHTML = rowsHTML(items.slice(3), items[0].score);
  }
  function renderBoard() {
    tabs.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.p === period ? 'true' : 'false'); });
    document.querySelectorAll('#mtabs button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.m === lbMode ? 'true' : 'false'); });
    $('ptabs').hidden = lbMode === 'daily' || lbMode === 'cities';
    var el = $('lbList'), pod = $('podium'), meRow = $('meRow');
    $('liveTag').classList.toggle('off', !!lbErr);
    if (lbErr) { pod.innerHTML = ''; meRow.hidden = true; el.innerHTML = emptyHTML(t('lb.off')); return; }
    if (lbMode === 'cities') { if (cities) renderCities(); return; }
    if (!lb || lb.mode !== lbMode) return;
    var per = lbMode === 'daily' ? 'day' : period;
    var rows = lb[per] || [];
    var me = (lsGet('bp_name') || '').toLocaleLowerCase('tr');
    var isMe = function (r) { return !!me && r.name.toLocaleLowerCase('tr') === me; };
    var low = function (n) { return n.toLocaleLowerCase('tr'); };
    var king = lb.king ? low(lb.king) : '', hot = lb.hot ? low(lb.hot) : '';
    var badges = function (n) {
      var l = low(n), b = '';
      if (l === king) b += '<span class="bdg" title="' + esc(t('bdg.crown')) + '">👑</span>';
      if (l === hot) b += '<span class="bdg" title="' + esc(t('bdg.fire')) + '">🔥</span>';
      return b;
    };
    if (!rows.length) { pod.innerHTML = podiumHTML([]); el.innerHTML = emptyHTML(t('lb.empty')); }
    else {
      var items = rows.map(function (r) {
        return { name: r.name, nameHTML: pn(r.name), score: r.score, sub: r.city ? '📍 ' + esc(r.city) : '', me: isMe(r), extra: badges(r.name) };
      });
      pod.innerHTML = podiumHTML(items);
      el.innerHTML = rowsHTML(items.slice(3), rows[0].score);
    }
    // Oyuncunun kendi satırı (listede yoksa)
    var m = lb.me && me && lb.me.name.toLocaleLowerCase('tr') === me ? lb.me : null, inList = rows.some(isMe);
    if (m && m.rank[per] && !inList) {
      meRow.hidden = false;
      meRow.innerHTML = '<span class="rk">#' + m.rank[per] + '</span>' + avatar(m.name) + '<span class="who"><span class="wn">' + pn(m.name) + '<em class="tagme">' + esc(t('lb.you')) + '</em></span></span><span class="pt">' + fmt(m.score[per]) + '</span>';
    } else meRow.hidden = true;
    if (lb.mode === 'classic') $('myRank').textContent = m && m.rank.week ? '#' + m.rank.week : '—';
    if (m && m.best > bestFor(lb.mode)) {
      lsSet(bestKey(lb.mode), String(m.best)); renderSkins();
      if (lb.mode === mode && state !== 'play') { best = m.best; $('best').textContent = fmt(best); }
    }
  }
  // Haftalık sıran düştüyse kimin geçtiğini bildir
  function weekKey() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toDateString(); }
  function checkPassed() {
    var m = lb && lb.mode === 'classic' && lb.me, nk = (lsGet('bp_name') || '').toLocaleLowerCase('tr');
    if (!m || !m.rank || !m.rank.week || m.name.toLocaleLowerCase('tr') !== nk) return;
    var prev = null; try { prev = JSON.parse(lsGet('bp_rk') || 'null'); } catch (e) {}
    var wk = weekKey(), r = m.rank.week;
    if (prev && prev.wk === wk && prev.n === nk && r > prev.r) {
      var above = lb.week && lb.week[r - 2];
      showToast(above ? t('toast.pass').replace('{n}', above.name).replace('{r}', r) : t('toast.pass2').replace('{r}', r));
    }
    lsSet('bp_rk', JSON.stringify({ wk: wk, n: nk, r: r }));
  }
  function loadBoard() {
    var nk = lsGet('bp_name'), qm = lbMode === 'cities' ? 'classic' : lbMode;
    if (lbMode === 'cities') {
      fetch(API + '?a=cities', { cache: 'no-store' }).then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok) { cities = j.cities; lbErr = false; renderBoard(); } }).catch(function () {});
    }
    return fetch(API + '?a=top&mode=' + qm + (nk ? '&me=' + encodeURIComponent(nk) : ''), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw 0; lb = j; lbErr = false; setStats(j.plays, j.online); renderBoard(); checkPassed(); renderModeSel(); })
      .catch(function () { lbErr = true; renderBoard(); });
  }
  loadBoard();
  setInterval(function () { if (!document.hidden && state !== 'play') loadBoard(); }, 30000);

  // ---------- Skor kaydetme ----------
  var ERR = { bad_name: 'm.badname', rate_limited: 'm.rate', bad_token: 'm.token', expired: 'm.token', too_fast: 'm.err', daily_done: 'm.daily_done', bad_seed: 'm.err' };
  function validName(n) { n = (n || '').replace(/\s+/g, ' ').trim(); return n.length >= 2 && n.length <= 16 && /^[\p{L}\p{N}][\p{L}\p{N} ._\-]*$/u.test(n); }
  function initial(n) { return (n || '?').trim().charAt(0).toLocaleUpperCase('tr') || '?'; }

  // Takma ad (oyuncu kartı + başlangıç ekranı)
  function setNick(raw, silent) {
    var n = (raw || '').replace(/\s+/g, ' ').trim(), msg = $('nickMsg'), inp = $('nick');
    if (!n) { lsSet('bp_name', ''); syncNick(); msg.className = 'nick-msg'; msg.textContent = ''; loadBoard(); return true; }
    if (!validName(n)) { inp.classList.add('bad'); msg.className = 'nick-msg err'; msg.textContent = t('m.name'); return false; }
    var changed = n !== lsGet('bp_name');
    lsSet('bp_name', n); syncNick();
    if (changed && !silent) { msg.className = 'nick-msg ok'; msg.textContent = t('nick.saved'); }
    if (changed) loadBoard();
    return true;
  }
  function syncNick() {
    var n = lsGet('bp_name') || '';
    $('nick').value = n; $('startName').value = n; $('nick').classList.remove('bad');
    var av = $('avatar'); av.textContent = n ? initial(n) : '?'; av.classList.toggle('empty', !n);
  }
  $('nick').addEventListener('input', function () {
    var v = this.value.trim(), av = $('avatar');
    av.textContent = v ? initial(v) : '?'; av.classList.toggle('empty', !v);
    this.classList.toggle('bad', !!v && !validName(v));
  });
  $('nick').addEventListener('change', function () { setNick(this.value); });
  $('nick').addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); });
  $('startName').addEventListener('keydown', function (e) { if (e.key === 'Enter') startGame(); });
  syncNick();

  function submitScore(name) {
    var m = $('saveMsg');
    if (!token) { m.className = 'msg err'; m.textContent = t(offlineGame ? 'm.offgame' : 'm.offline'); $('saveForm').style.display = 'none'; return; }
    $('saveBtn').disabled = true; m.className = 'msg'; m.textContent = t('m.auto').replace('{n}', name);
    var pl = payload(name);
    fetch(API + '?a=submit', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pl)
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) {
          token = null;
          if (j.mode === 'classic' && j.id) lastScoreId = j.id;
          lsSet('bp_name', j.name || name); syncNick();
          $('saveForm').style.display = 'none';
          m.className = 'msg ok';
          m.textContent = t('m.ok').replace('{d}', j.rank.day).replace('{w}', j.rank.week).replace('{a}', j.rank.all);
          loadBoard();
        } else {
          var code = j && j.error;
          m.className = 'msg err';
          m.textContent = t(ERR[code] || 'm.err');
          $('saveForm').style.display = '';
          $('saveBtn').disabled = code === 'bad_token' || code === 'expired';
        }
      })
      .catch(function () {
        // bağlantı yok: skoru kuyruğa al, internet gelince gönder (jeton 6 saat geçerli)
        queuePush(pl); token = null;
        m.className = 'msg'; m.textContent = t('m.queued'); $('saveForm').style.display = 'none';
      });
  }
  function queueGet() { try { return JSON.parse(lsGet('bp_queue') || '[]'); } catch (e) { return []; } }
  function queuePush(p) { var q = queueGet(); p.ts = Date.now(); q.push(p); lsSet('bp_queue', JSON.stringify(q.slice(-10))); }
  function flushQueue() {
    var q = queueGet(); if (!q.length || !navigator.onLine) return;
    var p = q.shift(); lsSet('bp_queue', JSON.stringify(q));
    if (Date.now() - (p.ts || 0) > 6 * 3600000) return flushQueue();
    delete p.ts;
    fetch(API + '?a=submit', { method: 'POST', cache: 'no-store', body: JSON.stringify(p) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) { showToast(t('m.qsent')); loadBoard(); } flushQueue(); })
      .catch(function () { queuePush(p); });
  }
  addEventListener('online', flushQueue);
  setTimeout(flushQueue, 2000);
  $('saveForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameIn').value.replace(/\s+/g, ' ').trim(), m = $('saveMsg');
    if (!validName(name)) { m.className = 'msg err'; m.textContent = t('m.name'); return; }
    submitScore(name);
  });

  // ---------- Mod seçici + günün bulmacası ----------
  function dailyInfo() { try { var d = JSON.parse(lsGet('bp_daily') || 'null'); return d && d.day === todayKey() ? d : null; } catch (e) { return null; } }
  function dailyDone() {
    // deneme, oyun başladığı anda harcanmış sayılır
    if (dailyInfo()) return true;
    // sunucu da bugünkü skoru biliyorsa
    return !!(lb && lb.mode === 'daily' && lb.me && lb.me.score && lb.me.score.day);
  }
  function setMode(m) {
    if (MODES.indexOf(m) < 0) return;
    mode = m; lsSet('bp_mode', m);
    if (state !== 'play' && state !== 'paused') { best = bestFor(mode); $('best').textContent = fmt(best); }
    renderModeSel();
  }
  function renderModeSel() {
    document.querySelectorAll('#modeSel button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === mode ? 'true' : 'false'); });
    var note = $('modeNote'), btn = $('playBtn');
    btn.disabled = starting;
    if (challenge && mode === 'classic') { note.textContent = t('ch.banner').replace('{n}', challenge.name).replace('{s}', fmt(challenge.score)); note.className = 'mode-note ch'; return; }
    note.className = 'mode-note';
    if (mode === 'daily') {
      if (dailyDone()) {
        var d = dailyInfo(), sc = (state === 'paused' && mode === 'daily') ? score : d ? d.score : (lb && lb.me && lb.me.score ? lb.me.score.day : 0);
        note.textContent = t('daily.done').replace('{s}', fmt(sc || 0)); note.className = 'mode-note done'; btn.disabled = true;
      } else note.textContent = t('daily.left');
    } else note.textContent = t('mode.' + mode);
  }
  document.querySelectorAll('#modeSel button').forEach(function (b) { b.onclick = function () { setMode(b.dataset.mode); }; });

  // ---------- Meydan okuma bağlantısı (?meydan=kod) ----------
  var params = new URLSearchParams(location.search);
  var chId = params.get('meydan');
  if (chId && /^[0-9a-z]{1,10}$/.test(chId)) {
    fetch(API + '?a=challenge&id=' + chId, { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) { challenge = { id: j.id, name: j.name, score: j.score }; setMode('classic'); } })
      .catch(function () {});
  }

  // ---------- Günlük görevler ----------
  var MISSIONS = {
    drop10: { ev: 'shot', ok: function (e) { return e.dropped >= 10; } },
    blast15: { ev: 'shot', ok: function (e) { return e.total >= 15; } },
    streak4: { ev: 'shot', ok: function () { return streak >= 4; } },
    bomb8: { ev: 'shot', ok: function (e) { return e.special === 'bomb' && e.total >= 8; } },
    joker: { ev: 'shot', ok: function (e) { return e.special === 'joker'; } },
    bolt: { ev: 'shot', ok: function (e) { return e.special === 'bolt'; } },
    level2: { ev: 'shot', ok: function () { return level >= 2; } },
    score1500: { ev: 'shot', ok: function () { return score >= 1500; } },
    score3000: { ev: 'shot', ok: function () { return score >= 3000; } },
    timed800: { ev: 'shot', ok: function () { return mode === 'timed' && score >= 800; } },
    pop100: { ev: 'shot', ok: function () { return gs.popped >= 100; } },
    daily: { ev: 'start', ok: function () { return mode === 'daily'; } }
  };
  function todayMissions() {
    var day = todayKey(), st = null;
    try { st = JSON.parse(lsGet('bp_missions') || 'null'); } catch (e) {}
    if (!st || st.day !== day) {
      var ids = Object.keys(MISSIONS), h = fnv1a('gorev-' + day), pick = [];
      while (pick.length < 3) { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; var id = ids[h % ids.length]; if (pick.indexOf(id) < 0) pick.push(id); }
      st = { day: day, ids: pick, done: {} };
      lsSet('bp_missions', JSON.stringify(st));
    }
    return st;
  }
  function missionEvent(ev, e) {
    var st = todayMissions(), changed = false;
    st.ids.forEach(function (id) {
      var m = MISSIONS[id];
      if (st.done[id] || m.ev !== ev) return;
      if (m.ok(e || {})) {
        st.done[id] = true; changed = true;
        showToast(t('ms.done').replace('{m}', t('mi.' + id)));
        tone(784, 0.1, 'triangle', 0.07); tone(1175, 0.16, 'triangle', 0.07, null, 0.09);
        lsSet('bp_mdone', String(+(lsGet('bp_mdone') || 0) + 1));
      }
    });
    if (changed) {
      lsSet('bp_missions', JSON.stringify(st));
      if (st.ids.every(function (id) { return st.done[id]; })) setTimeout(function () { showToast(t('ms.all')); }, 1800);
      renderMissions();
    }
  }
  function renderMissions() {
    var st = todayMissions(), n = 0;
    $('msList').innerHTML = st.ids.map(function (id) {
      var d = !!st.done[id]; if (d) n++;
      return '<li class="' + (d ? 'done' : '') + '"><span class="ck" aria-hidden="true">' + (d ? '✓' : '') + '</span><span>' + esc(t('mi.' + id)) + '</span></li>';
    }).join('');
    $('msCount').textContent = n + '/3';
  }

  // ---------- Şehir ----------
  var CITIES = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın',
    'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
    'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari',
    'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis',
    'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş',
    'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Şırnak', 'Sivas', 'Tekirdağ',
    'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak'];
  function fillCities() {
    var sel = $('city'), cur = lsGet('bp_city') || '';
    sel.innerHTML = '<option value="">' + esc(t('city.ph')) + '</option>' + CITIES.map(function (c) {
      return '<option' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }
  $('city').onchange = function () { lsSet('bp_city', this.value); if (lbMode === 'cities') renderBoard(); };

  // ---------- Profil ----------
  var BADGE_EMOJI = { champ: '🏆', podium: '🎖️', first: '🎈', g10: '🎯', g50: '🏅', g100: '💯', s1k: '⭐', s5k: '🌟', s10k: '💎', s25k: '🚀', timed1k: '⏱️', daily1: '📅', daily3: '🔥', daily7: '🗓️', king: '👑' };
  function openProfile(name) {
    var box = $('pmodal'), body = $('pBody');
    box.hidden = false; document.body.classList.add('modal-open');
    body.innerHTML = '<div class="p-load"><span class="skel" style="width:60%"></span><span class="skel"></span><span class="skel" style="width:80%"></span></div>';
    try { var u = new URL(location.href); u.searchParams.set('oyuncu', name); history.replaceState(null, '', u); } catch (e) {}
    fetch(API + '?a=profile&name=' + encodeURIComponent(name), { cache: 'no-store' }).then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) { body.innerHTML = '<p class="p-nf"><b>' + esc(name) + '</b><br>' + esc(t('pf.nf')) + '</p>'; return; }
        var stat = function (v, l) { return '<div><b>' + v + '</b><span>' + esc(l) + '</span></div>'; };
        body.innerHTML =
          '<div class="p-head"><div class="av">' + esc(initial(j.name)) + '</div><div><h2 id="pName">' + esc(j.name) + '</h2>' +
          '<div class="p-sub">' + (j.city ? '📍 ' + esc(j.city) + ' · ' : '') + esc(t('pf.first')) + ' ' + esc(j.first) +
          (j.streak ? ' · 🔥 ' + j.streak + ' ' + esc(t('days')) + ' ' + esc(t('pf.streak')).toLocaleLowerCase(lang === 'en' ? 'en' : 'tr') : '') + '</div></div></div>' +
          '<div class="p-stats">' + stat(fmt(j.best.classic), t('md.classic')) + stat(fmt(j.best.timed), t('md.timed')) + stat(fmt(j.best.daily), t('md.daily')) +
          stat(j.rank ? '#' + j.rank : '—', t('pf.rank')) + stat(fmt(j.games), t('pf.games')) + stat(fmt(j.total), t('pf.total')) +
          '</div>' +
          '<h3>' + esc(t('pf.badges')) + '</h3><div class="p-badges">' + j.badges.map(function (b) {
            return '<span class="p-bdg"><i>' + (BADGE_EMOJI[b] || '🏷️') + '</i>' + esc(t('bd.' + b)) + '</span>';
          }).join('') + '</div>' +
          '<h3>' + esc(t('pf.recent')) + '</h3><ol class="p-recent">' + j.recent.map(function (r) {
            return '<li><span>' + esc(t('md.' + r.mode)) + ' · ' + esc(r.at) + '</span><b>' + fmt(r.score) + '</b></li>';
          }).join('') + '</ol>' +
          '<button class="btn btn-g btn-w" id="pCopy">' + esc(t('pf.link')) + '</button>';
        $('pCopy').onclick = function () {
          var link = SHARE_URL + '?oyuncu=' + encodeURIComponent(j.name);
          (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { showToast(t('pf.copied')); }).catch(function () { prompt('', link); });
        };
      })
      .catch(function () { body.innerHTML = '<p class="p-nf">' + esc(t('lb.off')) + '</p>'; });
  }
  function closeProfile() {
    $('pmodal').hidden = true; document.body.classList.remove('modal-open');
    try { var u = new URL(location.href); u.searchParams.delete('oyuncu'); history.replaceState(null, '', u); } catch (e) {}
  }
  $('pClose').onclick = closeProfile;
  $('pmodal').addEventListener('click', function (e) { if (e.target === this) closeProfile(); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('pmodal').hidden) { e.stopPropagation(); closeProfile(); } }, true);
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.pn'); if (b) openProfile(b.dataset.name);
  });
  $('myProfile').onclick = function () { var n = lsGet('bp_name'); if (validName(n || '')) openProfile(n); else $('nick').focus(); };
  if (params.get('oyuncu')) openProfile(params.get('oyuncu').slice(0, 20));

  // ---------- Uygulama gibi kurulum (PWA) ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
    addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  var installEvt = null;
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; $('instBtn').hidden = false; });
  $('instBtn').onclick = function () {
    if (!installEvt) return;
    installEvt.prompt(); installEvt.userChoice.finally(function () { installEvt = null; $('instBtn').hidden = true; });
  };
  addEventListener('appinstalled', function () { $('instBtn').hidden = true; });

  // ---------- Sezon (aylık) + şampiyonlar duvarı ----------
  function monthName(ym) {
    var p = ym.split('-'), d = new Date(+p[0], +p[1] - 1, 15);
    try { return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR', { month: 'long', year: 'numeric' }); } catch (e) { return ym; }
  }
  function renderSeason() {
    var day = todayKey(), y = +day.slice(0, 4), mo = +day.slice(5, 7), dd = +day.slice(8, 10);
    var last = new Date(y, mo, 0).getDate(), left = last - dd + 1;
    var nm = monthName(day.slice(0, 7)).replace(/\s*\d{4}$/, '');
    $('season').textContent = left <= 1 ? t('season1').replace('{m}', nm) : t('season').replace('{m}', nm).replace('{d}', left);
  }
  function loadChampions() {
    fetch(API + '?a=champions', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return;
      var el = $('champList');
      if (!j.seasons.length) { el.innerHTML = '<p class="ch-empty">🏆 ' + esc(t('ch.empty')) + '</p>'; return; }
      el.innerHTML = j.seasons.map(function (sn) {
        return '<div class="champ"><div class="ch-m">' + esc(monthName(sn.month)) + '</div><ol>' + sn.top.map(function (r, i) {
          return '<li class="m' + (i + 1) + '"><span class="md">' + ['🥇', '🥈', '🥉'][i] + '</span>' + avatar(r.name) + '<span class="cn">' + pn(r.name) + '</span><b>' + fmt(r.score) + '</b></li>';
        }).join('') + '</ol></div>';
      }).join('');
    }).catch(function () {});
  }

  renderSeason(); loadChampions();
  fillCities(); renderMissions(); renderModeSel();

  // Kontroller sekmeleri (Bilgisayar / Mobil)
  function ctlTab(mob) {
    $('tabDesk').setAttribute('aria-selected', mob ? 'false' : 'true');
    $('tabMob').setAttribute('aria-selected', mob ? 'true' : 'false');
    $('ctlDesk').hidden = !!mob; $('ctlMob').hidden = !mob;
  }
  $('tabDesk').onclick = function () { ctlTab(false); };
  $('tabMob').onclick = function () { ctlTab(true); };
  if (window.matchMedia && matchMedia('(pointer:coarse)').matches) ctlTab(true);

  applyLang();
})();
