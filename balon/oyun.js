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
    q4: 'Can I play on my phone?', a4: 'Yes. The game works on phones, tablets and computers. On touch screens, aim with your finger and release to shoot.',
    'i.ctl': 'Controls', 't.desk': 'Computer', 't.desk2': 'Keyboard & mouse', 't.mob': 'Mobile', 't.mob2': 'Phone & tablet',
    c1: 'Move the mouse to rotate the aim', c2: 'Left click: the bubble flies where you aim', c3: 'Right click: swap your bubble with the next one',
    c4: 'Fine-tune the aim with the keyboard', c5: 'Shoot the bubble', c6: 'Swap your bubble with the next one',
    c7: 'Pause or resume the game', c8: 'Turn sound on or off', c9: 'Start the game; save your score when it ends',
    m1: 'Drag your finger across the board to aim', m2: 'Lift your finger to shoot', m3: 'Tap the next bubble (bottom left) to swap',
    m4: 'Tap the New game, Pause and sound buttons',
    'lb.l': 'Online ranking', 'lb.t': 'Leaderboard', 'lb.day': 'Today', 'lb.week': 'This week', 'lb.all': 'All time',
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
  var actx = null, muted = lsGet('bp_mute') === '1';
  function syncSoundBtn() {
    var b = $('soundBtn');
    b.setAttribute('aria-pressed', muted ? 'true' : 'false');
    b.querySelector('.w').style.display = muted ? 'none' : '';
    b.querySelector('.x').style.display = muted ? '' : 'none';
  }
  $('soundBtn').onclick = function () { muted = !muted; lsSet('bp_mute', muted ? '1' : '0'); syncSoundBtn(); ensureAudio(); };
  syncSoundBtn();
  function ensureAudio() {
    if (actx || muted) { if (actx && actx.state === 'suspended') actx.resume(); return; }
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
  function tone(f, dur, type, vol, f2, delay) {
    if (muted || !actx) return;
    var t0 = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
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
    s.connect(f); f.connect(g); g.connect(actx.destination); s.start(t0); s.stop(t0 + dur + 0.02);
  }
  var sfx = {
    shoot: function () { tone(420, 0.09, 'triangle', 0.08, 760); },
    bounce: function () { tone(300, 0.05, 'sine', 0.05, 240); },
    stick: function () { tone(180, 0.07, 'sine', 0.1, 120); },
    pop: function (n, s) {
      for (var i = 0; i < Math.min(n, 8); i++) {
        noise(0.07, 0.16, 1600 + i * 180, i * 0.035);
        tone(520 + s * 70 + i * 40, 0.08, 'sine', 0.07, 900 + s * 90 + i * 40, i * 0.035);
      }
    },
    drop: function (k) { for (var i = 0; i < Math.min(k, 6); i++) tone(700 - i * 70, 0.12, 'triangle', 0.06, 300 - i * 30, 0.12 + i * 0.05); },
    row: function () { tone(110, 0.25, 'sawtooth', 0.06, 70); noise(0.15, 0.08, 400); },
    clear: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.09, null, i * 0.09); }); },
    over: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.09, null, i * 0.16); }); },
    boom: function () { noise(0.5, 0.35, 180); noise(0.25, 0.2, 900); tone(90, 0.45, 'sawtooth', 0.12, 40); },
    zap: function () { for (var i = 0; i < 5; i++) noise(0.05, 0.18, 3000 + i * 400, i * 0.03); tone(1400, 0.25, 'square', 0.04, 200); },
    warn: function () { tone(880, 0.06, 'square', 0.03); },
    praise: function (lv) { [659, 784, 988, 1319].slice(0, lv + 1).forEach(function (f, i) { tone(f, 0.16, 'triangle', 0.08, null, 0.05 + i * 0.07); }); },
    record: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.2, 'square', 0.04, null, i * 0.08); tone(f * 2, 0.2, 'sine', 0.04, null, i * 0.08); }); }
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
  function setSkin(k) {
    if (SKINS.indexOf(k) < 0) return;
    skin = k; lsSet('bp_skin', k); buildSprites();
    document.querySelectorAll('.skins button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.skin === k ? 'true' : 'false'); });
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
    if (!p.length) return Math.floor(Math.random() * colorCount());
    return p[Math.floor(Math.random() * p.length)];
  }
  function fillRow(r, n) {
    for (var c = 0; c < ncols(r); c++) {
      var v = Math.floor(Math.random() * n), roll = Math.random();
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
  var shake = 0, recoil = 0, loadT = 1, praise = null, confetti = [], recordBroken = false, gs = {};
  function resetStats() { gs = { popped: 0, dropped: 0, biggest: 0, maxStreak: 0, bomb: 0, joker: 0, bolt: 0 }; }
  resetStats();
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  var fx = [], texts = [], banner = null, token = null, best = +(lsGet('bp_best') || 0);
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

  function startGame() {
    ensureAudio();
    // Küçük ekranda oyun alanını görünür alana oturt
    if (innerWidth < 1000) { try { $('stage').closest('.game').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
    if ($('ovStart').classList.contains('show') && $('startName').value.trim() && !setNick($('startName').value, true)) {
      $('startName').focus(); return;
    }
    var prev = score;
    if (quickSave()) {
      var nm = $('nickMsg'); nm.className = 'nick-msg ok'; nm.textContent = t('m.prev').replace('{s}', fmt(prev));
      setTimeout(loadBoard, 1500);
    } else if (token) ping(true);
    level = 1; score = 0; shownScore = 0; shots = 0; gains = []; streak = 0; ball = null; fx = []; texts = []; overT = 0;
    praise = null; confetti = []; recordBroken = false; recoil = 0; loadT = 1; resetStats();
    $('scCard').classList.remove('record', 'fire');
    missLimit = missLeft = calcMissLimit();
    newBoard();
    cur = randColor(); nxt = randColor();
    state = 'play'; holdUntil = performance.now() + 500;
    banner = { text: t('c.level') + ' 1', t: 0 };
    $('score').textContent = '0'; updateHud();
    showOv(null);
    token = null;
    fetch(API + '?a=start', { method: 'POST', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) { token = j.token; setStats(j.plays, j.online); } })
      .catch(function () {});
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

  // Oyun bitmeden ayrılınca (sayfayı yenileme/kapatma, oyun ortasında Yeni oyun) o ana kadarki skoru kaydet
  function quickSave() {
    var nk = lsGet('bp_name') || '';
    if (!token || score <= 0 || !validName(nk) || !(state === 'play' || state === 'paused')) return false;
    var body = JSON.stringify({ token: token, name: nk, score: score, shots: shots, level: level, gains: gains }), sent = false;
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
    fx.push({ k: 'flash', x: SH_X + Math.cos(angle) * 50, y: SH_Y + Math.sin(angle) * 50, t: 0, life: 0.15, r: 14 });
    sfx.shoot();
  }
  var sinceSpecial = 0;
  function nextBall() {
    sinceSpecial++;
    // ~her 12 atışta bir sürpriz; en az 7 atış arayla, ilk 5 atışta yok
    if (shots >= 5 && sinceSpecial >= 7 && Math.random() < 0.13) {
      sinceSpecial = 0;
      var roll = Math.random(), kind = roll < 0.45 ? BOMB : roll < 0.8 ? JOKER : BOLT;
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
      gs[color === BOMB ? 'bomb' : 'bolt']++;
      if (cells.length) { streak++; gain = blast(cells, r, c, Math.min(streak, 5)); sfx.pop(Math.min(cells.length, 8), streak); }
      else miss();
    } else {
      if (color === JOKER) {
        gs.joker++;
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
    if (isBest) { best = score; lsSet('bp_best', String(best)); }
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
        navigator.share({ files: [file], text: txt + ' ' + SHARE_URL }).catch(function () {});
      } else if (navigator.share) {
        navigator.share({ text: txt, url: SHARE_URL }).catch(function () {});
      } else downloadImage(c);
    }, 'image/png');
  };
  $('dlBtn').onclick = function () { downloadImage(makeShareImage()); };
  $('waBtn').onclick = function () { window.open('https://wa.me/?text=' + encodeURIComponent(shareText() + ' ' + SHARE_URL), '_blank', 'noopener'); };
  $('xBtn').onclick = function () { window.open('https://x.com/intent/post?text=' + encodeURIComponent(shareText()) + '&url=' + encodeURIComponent(SHARE_URL), '_blank', 'noopener'); };

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
  setSkin(skin);

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
    else if (k === 'm' || k === 'M') $('soundBtn').click();
    else if (k === 'f' || k === 'F') toggleFs();
    else if (k === 'p' || k === 'P' || k === 'Escape') { state === 'play' ? pause() : resume(); }
    else if (k === 'Enter' && $('ovStart').classList.contains('show')) startGame();
  });
  addEventListener('keyup', function (e) { delete keys[e.key]; });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  addEventListener('blur', function () { keys = {}; });

  $('playBtn').onclick = startGame;
  $('againBtn').onclick = startGame;
  $('newBtn').onclick = startGame;
  $('pauseBtn').onclick = function () { state === 'play' ? pause() : resume(); };
  $('resumeBtn').onclick = resume;

  // ---------- Güncelleme ----------
  function step(dt) {
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
  var lb = null, lbErr = false, period = lsGet('bp_period') || 'week';
  var tabs = document.querySelectorAll('.tabs button');
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
  function renderBoard() {
    tabs.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.p === period ? 'true' : 'false'); });
    var el = $('lbList'), pod = $('podium'), meRow = $('meRow');
    $('liveTag').classList.toggle('off', !!lbErr);
    if (lbErr) { pod.innerHTML = ''; meRow.hidden = true; el.innerHTML = '<li class="empty">' + esc(t('lb.off')) + '</li>'; return; }
    if (!lb) return;
    var rows = lb[period] || [];
    var me = (lsGet('bp_name') || '').toLocaleLowerCase('tr');
    var isMe = function (r) { return !!me && r.name.toLocaleLowerCase('tr') === me; };
    var low = function (n) { return n.toLocaleLowerCase('tr'); };
    var king = lb.all && lb.all[0] ? low(lb.all[0].name) : '', hot = lb.day && lb.day[0] ? low(lb.day[0].name) : '';
    var badges = function (n) {
      var l = low(n), b = '';
      if (l === king) b += '<span class="bdg" title="' + esc(t('bdg.crown')) + '">👑</span>';
      if (l === hot) b += '<span class="bdg" title="' + esc(t('bdg.fire')) + '">🔥</span>';
      return b;
    };
    if (!rows.length) { pod.innerHTML = ''; el.innerHTML = '<li class="empty">' + esc(t('lb.empty')) + '</li>'; }
    else {
      pod.innerHTML = [1, 0, 2].map(function (i) {
        var r = rows[i]; if (!r) return '<div class="pd"></div>';
        return '<div class="pd r' + (i + 1) + (isMe(r) ? ' me' : '') + '"><div class="pdb">' + badges(r.name) + '</div><div class="ball">' + esc(initial(r.name)) + '</div><div class="who">' + esc(r.name) + '</div><div class="pts">' + fmt(r.score) + '</div><div class="step">' + (i + 1) + '</div></div>';
      }).join('');
      el.innerHTML = rows.slice(3).map(function (r, i) {
        return '<li class="' + (isMe(r) ? 'me' : '') + '"><span class="rk">' + (i + 4) + '</span><span class="nm">' + esc(r.name) + badges(r.name) + '</span><span class="pt">' + fmt(r.score) + '</span></li>';
      }).join('');
    }
    // Oyuncunun kendi satırı (listede yoksa)
    var m = lb.me && me && lb.me.name.toLocaleLowerCase('tr') === me ? lb.me : null, inList = rows.some(isMe);
    if (m && m.rank[period] && !inList) {
      meRow.hidden = false;
      meRow.innerHTML = '<span class="rk">' + m.rank[period] + '</span><span class="nm">' + esc(m.name) + '</span><span class="pt">' + fmt(m.score[period]) + '</span>';
    } else meRow.hidden = true;
    $('myRank').textContent = m && m.rank.week ? '#' + m.rank.week : '—';
    if (m && m.best > best) { best = m.best; lsSet('bp_best', String(best)); $('best').textContent = fmt(best); }
  }
  // Haftalık sıran düştüyse kimin geçtiğini bildir
  function weekKey() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toDateString(); }
  function checkPassed() {
    var m = lb && lb.me, nk = (lsGet('bp_name') || '').toLocaleLowerCase('tr');
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
    var nk = lsGet('bp_name');
    return fetch(API + '?a=top' + (nk ? '&me=' + encodeURIComponent(nk) : ''), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw 0; lb = j; lbErr = false; setStats(j.plays, j.online); renderBoard(); checkPassed(); })
      .catch(function () { lbErr = true; renderBoard(); });
  }
  loadBoard();
  setInterval(function () { if (!document.hidden && state !== 'play') loadBoard(); }, 30000);

  // ---------- Skor kaydetme ----------
  var ERR = { bad_name: 'm.badname', rate_limited: 'm.rate', bad_token: 'm.token', expired: 'm.token', too_fast: 'm.err' };
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
    if (!token) { m.className = 'msg err'; m.textContent = t('m.offline'); $('saveForm').style.display = ''; return; }
    $('saveBtn').disabled = true; m.className = 'msg'; m.textContent = t('m.auto').replace('{n}', name);
    fetch(API + '?a=submit', {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, name: name, score: score, shots: shots, level: level, gains: gains })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) {
          token = null;
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
      .catch(function () { m.className = 'msg err'; m.textContent = t('m.offline'); $('saveForm').style.display = ''; $('saveBtn').disabled = false; });
  }
  $('saveForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameIn').value.replace(/\s+/g, ' ').trim(), m = $('saveMsg');
    if (!validName(name)) { m.className = 'msg err'; m.textContent = t('m.name'); return; }
    submitScore(name);
  });

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
