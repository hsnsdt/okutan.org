// Yönetim paneli testleri — YEREL sunucuya karşı (canlıda çalıştırma).
//   PHP sunucusu + MySQL açık, admin/config.php'de ADMIN_PASS_HASH var olmalı:
//   PANEL_PASS=... BASE=http://127.0.0.1:8765 PHP=C:/xampp/php/php.exe node --test tests/admin-panel.test.mjs
// Son test kaba kuvvet kilidini dener: bitince bu IP 15 dk giriş yapamaz (yerel adm_login tablosunu sil).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/$/, '');
const PASS = process.env.PANEL_PASS || '';
const PHP = process.env.PHP || 'php';
const skipHttp = !PASS && 'PANEL_PASS verilmedi';

function php(code) {
  return execFileSync(PHP, ['-r', "require 'admin/lib/boot.php'; require 'admin/lib/db.php'; require 'admin/lib/stats.php'; require 'admin/lib/google.php';" + code], { encoding: 'utf8' });
}

test('birim: web kökü uyarısı, değişim oku, sparkline, kapsam açıklaması', () => {
  assert.match(php("echo public_path_risk(SITE_ROOT . '/admin/x.json') ?? '-';"), /web kökünün içinde/);
  assert.match(php("echo public_path_risk('/home/u/public_html/x.json') ?? '-';"), /public_html/);
  assert.equal(php("echo public_path_risk('/home/u/okutan-ozel/x.json') ?? '-';"), '-');
  assert.match(php('echo delta_html(120, 100);'), /▲ %20/);
  assert.match(php('echo delta_html(5, 10, true);'), /dl up/); // sıra düştü = iyi
  assert.match(php('echo spark([1, 3, 2]);'), /<polyline points="0,/);
  assert.match(php("echo coverage_tr('Crawled - currently not indexed');"), /Tarandı/);
});

// --- HTTP: çerezli basit istemci ---
let cookie = '';
async function req(path, opt = {}) {
  const r = await fetch(BASE + path, { redirect: 'manual', ...opt, headers: { ...(opt.headers || {}), cookie } });
  for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; const [k] = kv.split('='); cookie = cookie.split('; ').filter(x => x && !x.startsWith(k + '=')).concat(kv).join('; '); }
  return r;
}
const csrfOf = html => (html.match(/name="csrf" value="([^"]+)"/) || [])[1];
async function post(fields) {
  const page = await (await req('/admin/?view=ozet')).text();
  const body = new URLSearchParams({ csrf: csrfOf(page) || '', ...fields });
  return req('/admin/', { method: 'POST', body });
}

test('sayaç: her zaman 204; bot ve yabancı köken sayılmaz', { skip: skipHttp }, async () => {
  const ua = { 'User-Agent': 'Mozilla/5.0 (test)', Origin: BASE };
  assert.equal((await fetch(BASE + '/stats.php', { method: 'POST', headers: ua, body: JSON.stringify({ t: 'pv', p: '/__test__/', d: 'mobile', l: 'tr' }) })).status, 204);
  assert.equal((await fetch(BASE + '/stats.php', { method: 'POST', headers: { ...ua, 'User-Agent': 'Googlebot/2.1' }, body: JSON.stringify({ t: 'pv', p: '/__bot__/' }) })).status, 204);
  assert.equal((await fetch(BASE + '/stats.php', { method: 'POST', headers: { ...ua, Origin: 'https://evil.example' }, body: JSON.stringify({ t: 'pv', p: '/__yabanci__/' }) })).status, 204);
  assert.equal((await fetch(BASE + '/stats.php')).status, 204);
});

test('korumalı yollar: cron anahtarsız 403, görünüm doğrudan boş', { skip: skipHttp }, async () => {
  assert.equal((await fetch(BASE + '/admin/cron/saglik.php')).status, 403);
  assert.equal((await fetch(BASE + '/admin/cron/saglik.php?key=yanlis')).status, 403);
  assert.equal((await fetch(BASE + '/admin/cron/geri-yukle.php')).status, 403);
  assert.equal((await (await fetch(BASE + '/admin/views/ozet.php')).text()).trim(), '');
});

test('giriş, CSRF, ekranlar ve canlı sayı', { skip: skipHttp }, async () => {
  let r = await post({ act: 'login', pass: PASS });
  assert.equal(r.status, 303);
  const html = await (await req('/admin/?view=ozet')).text();
  assert.match(html, /<h1>Özet<\/h1>/, 'giriş başarısız');

  // CSRF'siz POST yapılmaz
  r = await req('/admin/', { method: 'POST', body: new URLSearchParams({ act: 'note_add', text: 'csrf-yok' }) });
  assert.equal(r.status, 303);
  assert.match(await (await req('/admin/?view=notlar')).text(), /CSRF/);

  for (const v of ['ozet', 'trafik', 'google', 'oyunlar', 'balon', 'sohbet', 'sistem', 'bildirim', 'notlar', 'ara&q=test', 'hesap']) {
    const t = await (await req('/admin/?view=' + v)).text();
    assert.doesNotMatch(t, /Fatal error|Ekran yüklenemedi/, v);
    assert.match(t, /<h1>/, v);
  }
  const j = await (await req('/admin/?ajax=online')).json();
  assert.equal(j.ok, true);
  assert.ok(j.pages.some(p => p.path === '/__test__/'), 'test ziyareti görünmeli');
  assert.ok(!j.pages.some(p => p.path === '/__bot__/' || p.path === '/__yabanci__/'), 'bot/yabancı sayılmamalı');

  // Not ekle → ara → sil
  await post({ act: 'note_add', text: 'panel-test-notu', priority: '2', back: 'notlar' });
  assert.match(await (await req('/admin/?view=ara&q=panel-test')).text(), /panel-test-notu/);
});

test('şifre değiştirme: yanlış mevcut şifre reddedilir, kısa şifre reddedilir', { skip: skipHttp }, async () => {
  await post({ act: 'pass_change', current: 'yanlis-sifre', new: 'yenisifre-12345', new2: 'yenisifre-12345', back: 'hesap' });
  assert.match(await (await req('/admin/?view=hesap')).text(), /Mevcut şifre yanlış/);
  await post({ act: 'pass_change', current: PASS, new: 'kisa', new2: 'kisa', back: 'hesap' });
  assert.match(await (await req('/admin/?view=hesap')).text(), /en az 10 karakter/);
});

test('kaba kuvvet kilidi: 5 hatadan sonra kilit (bu IP 15 dk kilitlenir)', { skip: skipHttp }, async () => {
  cookie = '';
  let last = '';
  for (let i = 0; i < 6; i++) {
    const page = await (await req('/admin/')).text();
    await req('/admin/', { method: 'POST', body: new URLSearchParams({ csrf: csrfOf(page) || '', act: 'login', pass: 'yanlis-' + i }) });
    last = await (await req('/admin/')).text();
  }
  assert.match(last, /Çok fazla hatalı deneme/);
});
