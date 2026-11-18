/* Gizli Kelime — arayüz. Kurallar motor.js'te (window.GizliKelime), kelimeler sozluk.js'te. */
(function () {
  'use strict';
  var G = window.GizliKelime, SZ = window.GizliKelimeSozluk;
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var VALID = new Set(SZ.GECERLI);
  var LEN = G.LEN, TRIES = G.TRIES;
  var PRAISE = ['Dahi!', 'Muhteşem!', 'Harika!', 'Çok iyi!', 'Güzel!', 'Kıl payı!'];

  function ls(k, v) {
    try {
      if (v === undefined) { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  function todayKey() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  // ---------- durum ----------
  var opts = ls('gk_opts') || { hard: false, flip: true };
  var day, dayNo, mode = 'daily', game, cur = '', busy = false;

  function dailyGame() {
    day = todayKey(); dayNo = G.dayNumber(day);
    var s = ls('gk_daily');
    if (!s || s.no !== dayNo) s = { no: dayNo, answer: G.dailyAnswer(SZ.CEVAP, dayNo), guesses: [], done: false, win: false, hard: opts.hard };
    s.answer = G.dailyAnswer(SZ.CEVAP, dayNo); // eski kayıt bozulmuşsa düzelt
    return s;
  }
  function freeGame(fresh) {
    var s = !fresh && ls('gk_free');
    if (!s || !s.answer || SZ.CEVAP.indexOf(s.answer) < 0) s = { answer: G.randomAnswer(SZ.CEVAP, G.dailyAnswer(SZ.CEVAP, dayNo)), guesses: [], done: false, win: false, hard: opts.hard };
    return s;
  }
  function save() { ls(mode === 'daily' ? 'gk_daily' : 'gk_free', game); }
  function scores() { return game.guesses.map(function (g) { return G.score(g, game.answer); }); }

  // ---------- tahta ve klavye ----------
  var board = $('board'), kb = $('kb'), rows = [];
  for (var r = 0; r < TRIES; r++) {
    var row = document.createElement('div'); row.className = 'row'; row.setAttribute('role', 'row');
    var tiles = [];
    for (var c = 0; c < LEN; c++) {
      var t = document.createElement('div'); t.className = 'tile'; t.setAttribute('role', 'gridcell');
      t.innerHTML = '<div class="f fr"></div><div class="f bk"></div>';
      row.appendChild(t); tiles.push(t);
    }
    board.appendChild(row); rows.push({ el: row, tiles: tiles });
  }
  var LAYOUT = ['ertyuıopğü', 'asdfghjklşi', '>zcvbnmöç<'], keys = {};
  LAYOUT.forEach(function (line) {
    var kr = document.createElement('div'); kr.className = 'kr';
    Array.from(line).forEach(function (ch) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'k'; b.tabIndex = -1;
      if (ch === '>') { b.className += ' w'; b.textContent = 'GİR'; b.dataset.k = 'Enter'; b.setAttribute('aria-label', 'Tahmini gönder'); }
      else if (ch === '<') { b.className += ' w'; b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M21 5H9l-6 7 6 7h12z"/><path d="m12 9 6 6m0-6-6 6"/></svg>'; b.dataset.k = 'Backspace'; b.setAttribute('aria-label', 'Sil'); }
      else { b.textContent = G.upper(ch); b.dataset.k = ch; keys[ch] = b; }
      kr.appendChild(b);
    });
    kb.appendChild(kr);
  });
  kb.addEventListener('pointerdown', function (e) { if (e.target.closest('.k')) e.preventDefault(); }); // odak almasın (Enter iki kez çalışmasın)
  kb.addEventListener('click', function (e) { var b = e.target.closest('.k'); if (b) press(b.dataset.k); });

  function paintRow(i, word, sc, reveal) {
    var R = rows[i], w = Array.from(word || '');
    R.el.classList.toggle('cur', i === game.guesses.length && !game.done);
    R.tiles.forEach(function (t, j) {
      var ch = w[j] ? G.upper(w[j]) : '';
      t.children[0].textContent = ch; t.children[1].textContent = ch;
      t.className = 'tile' + (ch ? ' on' : '');
      t.style.removeProperty('animation-delay');
      t.children[0].style.transitionDelay = t.children[1].style.transitionDelay = '';
      if (sc) {
        t.classList.add('s' + sc[j]);
        if (reveal) {
          var d = (j * 0.26) + 's';
          t.children[0].style.transitionDelay = t.children[1].style.transitionDelay = d;
          void t.offsetWidth; // önce çevrilmemiş hâli çizilsin, sonra geçiş başlasın
          t.classList.add('flip');
        } else t.classList.add('flip');
      }
      t.setAttribute('aria-label', ch ? ch + (sc ? ' ' + ['yok', 'başka yerde', 'doğru yerde'][sc[j]] : '') : 'boş');
    });
  }
  function paintKeys() {
    var st = G.keyStates(game.guesses, scores());
    Object.keys(keys).forEach(function (ch) { keys[ch].className = 'k' + (st[ch] !== undefined ? ' s' + st[ch] : ''); });
  }
  function render() {
    var sc = scores();
    for (var i = 0; i < TRIES; i++) {
      if (i < game.guesses.length) paintRow(i, game.guesses[i], sc[i], false);
      else paintRow(i, i === game.guesses.length ? cur : '', null, false);
    }
    paintKeys(); paintSub();
  }
  function paintSub() {
    $('dayNo').textContent = ' #' + dayNo;
    $('tabDaily').setAttribute('aria-selected', mode === 'daily');
    $('tabFree').setAttribute('aria-selected', mode === 'free');
    var st = ls('gk_stats'), streak = G.liveStreak(st, dayNo);
    if (mode === 'daily') {
      $('subL').innerHTML = game.done ? (game.win ? 'Bugünü çözdün ✓' : 'Bugünün kelimesi: <b>' + G.upper(game.answer) + '</b>') : 'Hak: <b>' + (TRIES - game.guesses.length) + '</b> / ' + TRIES + (game.hard ? ' · zor mod' : '');
      $('subR').innerHTML = 'Seri: <b>' + streak + '</b>';
    } else {
      var fs = ls('gk_fstats') || { played: 0, wins: 0 };
      $('subL').innerHTML = game.done ? (game.win ? 'Bildin ✓' : 'Kelime: <b>' + G.upper(game.answer) + '</b>') : 'Hak: <b>' + (TRIES - game.guesses.length) + '</b> / ' + TRIES + (game.hard ? ' · zor mod' : '');
      $('subR').innerHTML = game.done ? '<button class="newbtn" id="newBtn">Yeni kelime →</button>' : 'Serbest: <b>' + fs.wins + '</b>/' + fs.played;
      var nb = $('newBtn'); if (nb) nb.onclick = function () { startFree(true); };
    }
  }

  var toastT;
  function toast(msg, ms) {
    var el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('show'); }, ms || 1600);
  }
  function shake() {
    var el = rows[game.guesses.length].el; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }

  // ---------- giriş ----------
  function press(k) {
    if (busy || game.done || anyModal()) return;
    if (k === 'Enter') return submit();
    if (k === 'Backspace') { cur = Array.from(cur).slice(0, -1).join(''); return paintRow(game.guesses.length, cur); }
    var ch = G.lower(k);
    if (!G.isLetter(ch) || Array.from(cur).length >= LEN) return;
    cur += ch; paintRow(game.guesses.length, cur);
  }
  function submit() {
    if (Array.from(cur).length < LEN) { shake(); return toast('Kelime 5 harf olmalı'); }
    if (!VALID.has(cur)) { shake(); return toast('Sözlükte yok'); }
    if (game.guesses.indexOf(cur) >= 0) { shake(); return toast('Bu kelimeyi zaten denedin'); }
    if (game.hard) { var why = G.hardCheck(cur, game.guesses, scores()); if (why) { shake(); return toast(why); } }
    var i = game.guesses.length, sc = G.score(cur, game.answer);
    game.guesses.push(cur); cur = '';
    var win = G.solved(sc), over = win || game.guesses.length >= TRIES;
    if (over) { game.done = true; game.win = win; }
    save();
    busy = true;
    var anim = opts.flip && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    paintRow(i, game.guesses[i], sc, anim);
    var wait = anim ? 260 * 4 + 520 : 0;
    setTimeout(function () {
      paintKeys(); busy = false;
      if (i + 1 < TRIES) paintRow(i + 1, '');
      if (over) finish(i, win);
      paintSub();
    }, wait);
  }
  function finish(i, win) {
    if (mode === 'daily') {
      ls('gk_stats', G.addResult(ls('gk_stats'), dayNo, win, game.guesses.length));
      try { localStorage.setItem('gk_daily_' + day, win ? 'w' : 'l'); } catch (e) {}
    } else {
      var fs = ls('gk_fstats') || { played: 0, wins: 0 }; fs.played++; if (win) fs.wins++; ls('gk_fstats', fs);
    }
    if (win) {
      toast(PRAISE[i], 1500);
      rows[i].tiles.forEach(function (t, j) { t.style.animationDelay = (j * 0.09) + 's'; t.classList.add('win'); });
    } else toast(G.upper(game.answer), 2200);
    setTimeout(function () { openEnd(true); }, win ? 1500 : 2000);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModals(); return; }
    if (anyModal() || e.metaKey || (e.ctrlKey && !e.altKey)) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Enter') { if (tag === 'BUTTON' && e.target.closest('.info,.top,footer')) return; e.preventDefault(); press('Enter'); return; }
    if (e.key === 'Backspace') { e.preventDefault(); press('Backspace'); return; }
    if (e.key && e.key.length === 1 && G.isLetter(G.lower(e.key))) press(e.key);
  });

  // ---------- pencereler ----------
  function anyModal() { return !!document.querySelector('.modal:not([hidden])'); }
  function openModal(id) { closeModals(); $(id).hidden = false; var b = $(id).querySelector('.btn,.mclose'); if (b) b.focus(); }
  function closeModals() { document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; }); clearInterval(cdT); }
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) closeModals(); });
  });
  $('helpBtn').onclick = function () { openModal('helpModal'); };
  $('setBtn').onclick = function () { $('optHard').checked = !!game.hard; $('optFlip').checked = opts.flip; openModal('setModal'); };
  $('statsBtn').onclick = function () { openEnd(false); };
  $('optHard').onchange = function () {
    if (mode === 'daily' && game.guesses.length && !game.done) { this.checked = !!game.hard; toast('Günün kelimesinde ilk tahminden sonra değişmez'); return; }
    opts.hard = this.checked; ls('gk_opts', opts);
    if (!game.guesses.length || game.done) { game.hard = opts.hard; save(); }
    if (mode === 'free' && !game.done) { game.hard = opts.hard; save(); }
    paintSub();
  };
  $('optFlip').onchange = function () { opts.flip = this.checked; ls('gk_opts', opts); };

  var cdT;
  function countdown() {
    var now = new Date(), ist;
    try { ist = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })); } catch (e) { ist = now; }
    var left = Math.max(0, 86400 - (ist.getHours() * 3600 + ist.getMinutes() * 60 + ist.getSeconds()));
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    $('nextIn').textContent = p(Math.floor(left / 3600)) + ':' + p(Math.floor(left % 3600 / 60)) + ':' + p(left % 60);
    if (left === 0 || todayKey() !== day) { clearInterval(cdT); newDay(); }
  }
  function openEnd(result) {
    var st = ls('gk_stats') || G.newStats(), daily = mode === 'daily';
    var show = result || game.done;
    $('endLabel').textContent = daily ? 'Günün kelimesi #' + dayNo : 'Serbest oyun';
    $('endTitle').textContent = !show ? 'İstatistik' : game.win ? PRAISE[game.guesses.length - 1].replace('!', '') + ' 🎉' : 'Bu sefer olmadı';
    $('endWord').hidden = !show;
    if (show) {
      $('endTiles').className = 'word' + (game.win ? '' : ' lost');
      $('endTiles').innerHTML = Array.from(game.answer).map(function (ch) { return '<i>' + G.upper(ch) + '</i>'; }).join('');
      $('endMean').innerHTML = (game.win ? game.guesses.length + '. tahminde buldun. ' : '') + '<a href="https://sozluk.gov.tr/?kelime=' + encodeURIComponent(game.answer) + '" target="_blank" rel="noopener">Anlamına bak ↗</a>';
    }
    var pct = st.played ? Math.round(st.wins / st.played * 100) : 0, fs = ls('gk_fstats') || { played: 0, wins: 0 };
    var cells = daily ? [[st.played, 'Oynanan'], [pct + '%', 'Kazanma'], [G.liveStreak(st, dayNo), 'Seri'], [st.best, 'En iyi']]
      : [[fs.played, 'Oynanan'], [fs.wins, 'Bilinen'], [(fs.played ? Math.round(fs.wins / fs.played * 100) : 0) + '%', 'Kazanma'], [G.liveStreak(st, dayNo), 'Günlük seri']];
    $('statGrid').innerHTML = cells.map(function (x) { return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join('');
    $('distLabel').hidden = $('dist').hidden = $('nextBox').hidden = !daily;
    var mx = Math.max.apply(null, st.dist.concat([1])), mine = daily && game.done && game.win ? game.guesses.length - 1 : -1;
    $('dist').innerHTML = st.dist.map(function (n, i) {
      return '<li' + (i === mine ? ' class="me"' : '') + '><span>' + (i + 1) + '</span><i style="width:' + Math.max(8, n / mx * 100) + '%">' + n + '</i></li>';
    }).join('');
    $('shareBtn').hidden = !game.done;
    $('freeBtn').textContent = mode === 'free' ? (game.done ? 'Yeni kelime' : 'Oyuna dön') : 'Serbest oyna';
    openModal('endModal');
    countdown(); cdT = setInterval(countdown, 1000);
  }
  $('freeBtn').onclick = function () {
    closeModals();
    if (mode === 'free') { if (game.done) startFree(true); } else startFree(false);
  };
  $('shareBtn').onclick = function () {
    var title = mode === 'daily' ? 'Gizli Kelime #' + dayNo : 'Gizli Kelime · serbest';
    var txt = G.shareText(title, scores(), game.win, game.hard) + '\nokutan.org/gizli-kelime';
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { navigator.share({ text: txt }).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Sonuç kopyalandı'); }, function () { toast('Kopyalanamadı'); });
  };

  // ---------- mod geçişi ----------
  function startDaily() { mode = 'daily'; game = dailyGame(); cur = ''; render(); setUrl(); }
  function startFree(fresh) { mode = 'free'; game = freeGame(fresh); cur = ''; save(); render(); setUrl(); }
  function setUrl() { try { history.replaceState(null, '', mode === 'free' ? '?mod=serbest' : location.pathname); } catch (e) {} }
  $('tabDaily').onclick = function () { if (mode !== 'daily') startDaily(); };
  $('tabFree').onclick = function () { if (mode !== 'free') startFree(false); };
  function newDay() { if (todayKey() !== day) { day = todayKey(); if (mode === 'daily') startDaily(); else paintSub(); } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) newDay(); });

  // ---------- sayfa ----------
  $('yr').textContent = new Date().getFullYear();
  $('themeBtn').onclick = function () {
    var c = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = c === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); try { localStorage.setItem('theme', n); } catch (e) {}
  };
  [['cTabDesk', 'ctlDesk'], ['cTabMob', 'ctlMob']].forEach(function (p, i, all) {
    $(p[0]).onclick = function () { all.forEach(function (q) { $(q[0]).setAttribute('aria-selected', q === p); $(q[1]).hidden = q !== p; }); };
  });
  if (matchMedia('(pointer: coarse)').matches) $('cTabMob').click();

  day = todayKey(); dayNo = G.dayNumber(day);
  if (/[?&]mod=serbest/.test(location.search)) startFree(false); else startDaily();
  if (!ls('gk_seen')) { ls('gk_seen', 1); openModal('helpModal'); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
