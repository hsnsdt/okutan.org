/* Sudoku — arayüz. Kurallar ve üretim motor.js'te (window.Sudoku). İlerleme localStorage'da (sd_*). */
(function () {
  'use strict';
  var S = window.Sudoku;
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;

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
  var LV = S.LEVELS, LVK = S.LEVEL_KEYS;
  var TEST = /[?&]test=1/.test(location.search);

  // ---------- durum ----------
  var opts = Object.assign({ err: true, same: true, auto: true, time: true }, ls('sd_opts') || {});
  var day = todayKey(), dayNo = S.dayNumber(day), mode = 'daily', freeLevel = LVK.indexOf(ls('sd_lvl')) >= 0 ? ls('sd_lvl') : 'orta';
  var game = null, sel = -1, notesMode = false, paused = false;

  function fresh(p, extra) {
    return Object.assign({ level: p.level, puzzle: p.puzzle, solution: p.solution, grid: p.puzzle.slice(), notes: new Array(81).fill(0),
      time: 0, errors: 0, hints: 0, done: false, hist: [] }, extra);
  }
  function valid(g) { return g && g.puzzle && g.puzzle.length === 81 && g.solution && g.grid && g.notes; }
  function dailyGame() {
    day = todayKey(); dayNo = S.dayNumber(day);
    var g = ls('sd_daily');
    if (!valid(g) || g.day !== day) g = fresh(S.daily(day), { kind: 'daily', day: day, no: dayNo });
    return g;
  }
  function freeGame(level, forceNew) {
    var g = !forceNew && ls('sd_free_' + level);
    if (!valid(g)) g = fresh(S.generate(1 + Math.floor(Math.random() * 0x7ffffffe), level), { kind: 'free' });
    return g;
  }
  function save() { if (game) ls(game.kind === 'daily' ? 'sd_daily' : 'sd_free_' + game.level, game); }

  // ---------- tahta ----------
  var grid = $('grid'), cells = new Array(81);
  for (var b = 0; b < 9; b++) {
    var box = document.createElement('div'); box.className = 'box';
    for (var k = 0; k < 9; k++) {
      var r = Math.floor(b / 3) * 3 + Math.floor(k / 3), c = (b % 3) * 3 + k % 3, i = r * 9 + c;
      var el = document.createElement('div'); el.className = 'cell'; el.setAttribute('role', 'gridcell'); el.dataset.i = i;
      el.innerHTML = '<span class="v"></span><span class="n"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
      box.appendChild(el); cells[i] = el;
    }
    grid.insertBefore(box, $('paused'));
  }
  grid.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('.cell'); if (!el || paused) return;
    e.preventDefault(); select(+el.dataset.i);
  });
  var pad = $('pad'), nums = [];
  for (var d = 1; d <= 9; d++) {
    var nb = document.createElement('button'); nb.type = 'button'; nb.className = 'num'; nb.dataset.d = d;
    nb.innerHTML = d + '<small></small>'; nb.setAttribute('aria-label', d + ' yaz');
    pad.appendChild(nb); nums[d] = nb;
  }
  pad.addEventListener('pointerdown', function (e) { if (e.target.closest('.num')) e.preventDefault(); });
  pad.addEventListener('click', function (e) { var nb = e.target.closest('.num'); if (nb) input(+nb.dataset.d, notesMode); });

  function render() {
    if (!game) return;
    var g = game.grid, sol = game.solution, clash = {}, sd = sel >= 0 ? g[sel] : 0;
    S.conflicts(g).forEach(function (i) { clash[i] = 1; });
    var counts = new Array(10).fill(0), right = new Array(10).fill(0);
    for (var i = 0; i < 81; i++) {
      var el = cells[i], v = g[i], given = !!game.puzzle[i];
      if (v) { counts[v]++; if (v === sol[i]) right[v]++; }
      var cls = 'cell' + (given ? ' g' : '');
      if (sel >= 0 && !paused) {
        if (i === sel) cls += ' sel';
        else if (opts.same && sd && v === sd) cls += ' same';
        else if (S.ROW[i] === S.ROW[sel] || S.COL[i] === S.COL[sel] || S.BOX[i] === S.BOX[sel]) cls += ' peer';
      }
      if (v && !given && opts.err && v !== sol[i]) cls += ' bad';
      if (clash[i] && !given) cls += ' clash bad';
      else if (clash[i]) cls += ' clash';
      if (el.className.indexOf(' pop') >= 0) cls += ' pop';
      if (el.className.indexOf(' hint') >= 0) cls += ' hint';
      el.className = cls;
      el.children[0].textContent = v || '';
      var ns = el.children[1].children, m = v ? 0 : game.notes[i];
      for (var q = 0; q < 9; q++) {
        var on = m & (1 << q);
        ns[q].textContent = on ? q + 1 : '';
        ns[q].className = on && opts.same && sd === q + 1 ? 'hl' : '';
      }
      el.setAttribute('aria-label', (S.ROW[i] + 1) + '. satır ' + (S.COL[i] + 1) + '. sütun: ' + (v ? v + (given ? ' (verilen)' : '') : 'boş'));
    }
    for (var dd = 1; dd <= 9; dd++) {
      nums[dd].classList.toggle('done', right[dd] >= 9);
      nums[dd].children[0].textContent = Math.max(0, 9 - counts[dd]);
    }
    pad.classList.toggle('notes', notesMode);
    $('noteBtn').classList.toggle('on', notesMode); $('noteBtn').setAttribute('aria-pressed', notesMode);
    $('noteBadge').textContent = notesMode ? 'AÇIK' : 'KAPALI';
    $('hintBadge').textContent = game.hints;
    $('undoBtn').disabled = !game.hist.length || game.done;
    $('paused').hidden = !paused;
    paintSub(); paintTime();
  }
  function paintSub() {
    $('dayNo').textContent = ' #' + dayNo;
    $('tabDaily').setAttribute('aria-selected', mode === 'daily');
    $('tabFree').setAttribute('aria-selected', mode === 'free');
    if (mode === 'daily') {
      $('subL').innerHTML = '<span class="lvchip"><i>' + LV[game.level].name + '</i>' + (game.done ? 'Çözdün ✓</span> <span class="lvls"><button data-free>Serbest oyna →</button>' : 'Seri: <b>' + S.liveStreak(ls('sd_stats'), dayNo) + '</b>') + '</span>';
    } else {
      $('subL').innerHTML = '<span class="lvls">' + LVK.map(function (k) {
        return '<button data-lv="' + k + '" aria-pressed="' + (k === game.level) + '">' + LV[k].name + '</button>';
      }).join('') + '<button data-new aria-label="Yeni bulmaca">↻ Yeni</button></span>';
    }
    $('errs').innerHTML = opts.err ? 'Hata: <b>' + game.errors + '</b>' : '';
    $('newBtn').hidden = mode !== 'free';
    $('newBtn').textContent = game.done ? 'Yeni bulmaca →' : 'Yeni bulmaca';
  }
  function paintTime() {
    $('tmBox').style.visibility = opts.time || game.done ? '' : 'hidden';
    $('timer').textContent = S.fmtTime(game.time);
    $('pauseBtn').hidden = game.done;
  }
  $('subL').addEventListener('click', function (e) {
    var bt = e.target.closest('button'); if (!bt) return;
    if (bt.hasAttribute('data-new')) return askNew();
    if (bt.hasAttribute('data-free')) return startFree(freeLevel);
    if (bt.dataset.lv && bt.dataset.lv !== game.level) { save(); startFree(bt.dataset.lv); }
  });

  var toastT;
  function toast(msg, ms) {
    var el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove('show'); }, ms || 1800);
  }
  function flash(i, cls) {
    var el = cells[i]; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, cls === 'hint' ? 1300 : 300);
  }

  // ---------- hamleler ----------
  function select(i) { sel = i; render(); }
  function busy() { return !game || game.done || paused || anyModal(); }
  function push(h) { game.hist.push(h); if (game.hist.length > 300) game.hist.shift(); }
  function input(d, asNote) {
    if (busy()) return;
    if (sel < 0) return toast('Önce bir kare seç');
    if (game.puzzle[sel]) return toast('Bu rakam bulmacada verilmiş');
    if (asNote) {
      if (game.grid[sel]) return toast('Not için kareyi boşalt');
      push({ i: sel, v: 0, n: game.notes[sel], p: [] });
      game.notes[sel] ^= 1 << (d - 1);
      save(); render(); return;
    }
    if (game.grid[sel] === d) return erase();
    place(sel, d, false);
  }
  function place(i, d, byHint) {
    var h = { i: i, v: game.grid[i], n: game.notes[i], p: [] };
    game.grid[i] = d; game.notes[i] = 0;
    if (opts.auto) S.PEERS[i].forEach(function (j) {
      var bit = 1 << (d - 1);
      if (game.notes[j] & bit) { h.p.push([j, game.notes[j]]); game.notes[j] &= ~bit; }
    });
    push(h);
    if (!byHint && opts.err && d !== game.solution[i]) { game.errors++; toast('Bu rakam buraya uymuyor', 1400); }
    flash(i, 'pop');
    save(); render();
    if (S.isSolved(game.grid, game.solution)) finish();
  }
  function erase() {
    if (busy() || sel < 0 || game.puzzle[sel] || (!game.grid[sel] && !game.notes[sel])) return;
    push({ i: sel, v: game.grid[sel], n: game.notes[sel], p: [] });
    game.grid[sel] = 0; game.notes[sel] = 0;
    save(); render();
  }
  function undo() {
    if (busy() || !game.hist.length) return;
    var h = game.hist.pop();
    game.grid[h.i] = h.v; game.notes[h.i] = h.n;
    h.p.forEach(function (x) { game.notes[x[0]] = x[1]; });
    sel = h.i; save(); render();
  }
  function hint() {
    if (busy()) return;
    var h = S.hint(game.grid, game.solution);
    if (!h) return;
    sel = h.i;
    if (h.type === 'wrong') { render(); flash(h.i, 'hint'); return toast('Bu rakam yanlış: sil ya da değiştir', 2400); }
    game.hints++;
    var why = h.type === 'naked' ? 'Bu kareye yalnızca ' + h.v + ' uyuyor.'
      : h.type === 'hidden' ? 'Bu ' + h.unit + ' ' + h.v + ' yalnızca buraya gelebilir.'
      : 'Bu karenin rakamı ' + h.v + '.';
    toast(why, 2800);
    place(h.i, h.v, true);
    flash(h.i, 'hint');
  }
  function toggleNotes() { if (!busy()) { notesMode = !notesMode; render(); } }
  function setPaused(p) {
    if (!game || game.done) p = false;
    paused = p; render();
  }
  $('undoBtn').onclick = undo;
  $('eraseBtn').onclick = erase;
  $('noteBtn').onclick = toggleNotes;
  $('hintBtn').onclick = hint;
  $('pauseBtn').onclick = function () { setPaused(!paused); };
  $('resumeBtn').onclick = function () { setPaused(false); };

  // ---------- süre ----------
  var lastSave = 0;
  setInterval(function () {
    if (!game || game.done || paused || document.hidden || anyModal()) return;
    game.time++; paintTime();
    if (++lastSave >= 5) { lastSave = 0; save(); }
  }, 1000);

  // ---------- bitiş ----------
  function finish() {
    game.done = true; sel = -1; notesMode = false; paused = false;
    if (game.kind === 'daily') {
      ls('sd_stats', S.addResult(ls('sd_stats'), game.no, game.time));
      try { localStorage.setItem('sd_daily_' + game.day, '1'); } catch (e) {}
    } else {
      var fs = ls('sd_fstats') || { solved: 0 }; fs.solved++; ls('sd_fstats', fs);
    }
    var best = ls('sd_best') || {}, rec = !!best[game.level] && game.time < best[game.level];
    if (!best[game.level] || rec) { best[game.level] = game.time; ls('sd_best', best); }
    game.record = rec;
    save(); render();
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) cells.forEach(function (el, i) { el.style.animationDelay = ((S.ROW[i] + S.COL[i]) * 0.035) + 's'; el.classList.add('win'); });
    setTimeout(function () {
      cells.forEach(function (el) { el.classList.remove('win'); el.style.animationDelay = ''; });
      openEnd(true);
    }, reduce ? 300 : 1300);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModals(); return; }
    var tag = (e.target && e.target.tagName) || '';
    if (anyModal() || e.metaKey || e.altKey || tag === 'INPUT' || tag === 'TEXTAREA') return;
    var k = (e.key || '').toLocaleLowerCase('tr'), code = e.code || '', m = code.match(/^(?:Digit|Numpad)([0-9])$/);
    var dg = m ? +m[1] : /^[0-9]$/.test(k) ? +k : -1;
    if (e.ctrlKey) { if (k === 'z') { e.preventDefault(); undo(); } return; }
    if (k === 'p') { e.preventDefault(); return setPaused(!paused); }
    if (paused) return;
    if (dg >= 1) { e.preventDefault(); return input(dg, notesMode !== e.shiftKey); }
    if (dg === 0 || k === 'backspace' || k === 'delete') { e.preventDefault(); return erase(); }
    if (k === 'n') { e.preventDefault(); return toggleNotes(); }
    if (k === 'z') { e.preventDefault(); return undo(); }
    if (k === 'h') { e.preventDefault(); return hint(); }
    var mv = { arrowleft: [0, -1], arrowright: [0, 1], arrowup: [-1, 0], arrowdown: [1, 0] }[k];
    if (mv && game && !game.done) {
      e.preventDefault();
      if (sel < 0) return select(40);
      select(((S.ROW[sel] + mv[0] + 9) % 9) * 9 + (S.COL[sel] + mv[1] + 9) % 9);
    }
  });

  // ---------- pencereler ----------
  function anyModal() { return !!document.querySelector('.modal:not([hidden])'); }
  function openModal(id) { closeModals(); $(id).hidden = false; var b2 = $(id).querySelector('.btn,.mclose'); if (b2) b2.focus(); }
  function closeModals() { document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; }); clearInterval(cdT); }
  document.querySelectorAll('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) closeModals(); });
  });
  $('helpBtn').onclick = function () { openModal('helpModal'); };
  $('statsBtn').onclick = function () { openEnd(false); };
  $('setBtn').onclick = function () {
    $('optErr').checked = opts.err; $('optSame').checked = opts.same; $('optAuto').checked = opts.auto; $('optTime').checked = opts.time;
    openModal('setModal');
  };
  [['optErr', 'err'], ['optSame', 'same'], ['optAuto', 'auto'], ['optTime', 'time']].forEach(function (p) {
    $(p[0]).onchange = function () { opts[p[1]] = this.checked; ls('sd_opts', opts); render(); };
  });

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
    var st = ls('sd_stats') || S.newStats(), best = ls('sd_best') || {}, show = result || game.done;
    var lbl = game.kind === 'daily' ? 'Günün Sudoku\'su #' + game.no + ' · ' + LV[game.level].name : 'Serbest · ' + LV[game.level].name;
    $('endLabel').textContent = show ? lbl : 'İstatistik';
    $('endTitle').textContent = !show ? 'İstatistik' : game.record ? 'Yeni rekor! 🏆' : 'Tebrikler, çözdün! 🎉';
    $('endRes').hidden = !show;
    if (show) $('endRes').innerHTML = [[S.fmtTime(game.time), 'Süre'], [game.hints, 'İpucu'], [opts.err ? game.errors : '—', 'Hata']]
      .map(function (x) { return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join('');
    var solvedToday = (ls('sd_daily') || {}).day === day && (ls('sd_daily') || {}).done;
    $('statGrid').innerHTML = [[st.solved, 'Çözülen'], [S.liveStreak(st, dayNo), 'Seri'], [st.best, 'En iyi seri'], [solvedToday ? '✓' : '—', 'Bugün']]
      .map(function (x) { return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join('');
    $('bestGrid').innerHTML = LVK.map(function (k) { return '<div><b>' + (best[k] ? S.fmtTime(best[k]) : '—') + '</b><span>' + LV[k].name + '</span></div>'; }).join('');
    $('shareBtn').hidden = !game.done;
    $('freeBtn').textContent = mode === 'free' ? (game.done ? 'Yeni bulmaca' : 'Oyuna dön') : 'Serbest oyna';
    openModal('endModal');
    countdown(); cdT = setInterval(countdown, 1000);
  }
  $('freeBtn').onclick = function () {
    closeModals();
    if (mode === 'free') { if (game.done) startFree(game.level, true); } else startFree(freeLevel);
  };
  $('shareBtn').onclick = function () {
    var title = game.kind === 'daily' ? 'Sudoku #' + game.no + ' · ' + LV[game.level].name : 'Sudoku · ' + LV[game.level].name + ' · serbest';
    var txt = title + '\n✅ ' + S.fmtTime(game.time) + ' · ipucu ' + game.hints + (opts.err ? ' · hata ' + game.errors : '') + '\nokutan.org/sudoku';
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { navigator.share({ text: txt }).catch(function () {}); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Sonuç kopyalandı'); }, function () { toast('Kopyalanamadı'); });
  };
  function askNew() {
    if (game.done || !game.hist.length) return startFree(game.level, true);
    openModal('newModal');
  }
  $('newBtn').onclick = askNew;
  $('newOk').onclick = function () { closeModals(); startFree(game.level, true); };

  // ---------- mod geçişi ----------
  function firstEmpty() { for (var i = 0; i < 81; i++) if (!game.grid[i]) return i; return -1; }
  function begin() { sel = game.done ? -1 : firstEmpty(); notesMode = false; paused = false; render(); setUrl(); }
  function startDaily() { if (game) save(); mode = 'daily'; game = dailyGame(); save(); begin(); }
  function startFree(level, forceNew) {
    if (game && !forceNew) save();
    mode = 'free'; freeLevel = level; ls('sd_lvl', level);
    game = freeGame(level, forceNew); save(); begin();
    if (forceNew) toast('Yeni ' + LV[level].name.toLocaleLowerCase('tr') + ' bulmaca');
  }
  function setUrl() { try { history.replaceState(null, '', (mode === 'free' ? '?mod=serbest' : location.pathname) + (TEST ? (mode === 'free' ? '&' : '?') + 'test=1' : '')); } catch (e) {} }
  $('tabDaily').onclick = function () { if (mode !== 'daily') startDaily(); };
  $('tabFree').onclick = function () { if (mode !== 'free') startFree(freeLevel); };
  function newDay() {
    if (todayKey() === day) return;
    day = todayKey(); dayNo = S.dayNumber(day);
    if (mode === 'daily') startDaily(); else paintSub();
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); else newDay(); });
  addEventListener('pagehide', save);

  // ---------- sayfa ----------
  $('yr').textContent = new Date().getFullYear();
  $('themeBtn').onclick = function () {
    var cur = root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var n = cur === 'dark' ? 'light' : 'dark'; root.setAttribute('data-theme', n); try { localStorage.setItem('theme', n); } catch (e) {}
  };
  [['cTabDesk', 'ctlDesk'], ['cTabMob', 'ctlMob']].forEach(function (p, i, all) {
    $(p[0]).onclick = function () { all.forEach(function (q) { $(q[0]).setAttribute('aria-selected', q === p); $(q[1]).hidden = q !== p; }); };
  });
  if (matchMedia('(pointer: coarse)').matches) { $('cTabMob').click(); $('kbHelp').hidden = true; }

  if (/[?&]mod=serbest/.test(location.search)) startFree(freeLevel); else startDaily();
  if (!ls('sd_seen')) { ls('sd_seen', 1); openModal('helpModal'); }
  if (TEST) window.__sd = { get game() { return game; }, S: S, render: render, select: select, input: input };
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
