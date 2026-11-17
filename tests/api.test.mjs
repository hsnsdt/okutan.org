// Balon Patlat — API entegrasyon testleri (Node 18+, ek paket yok)
//
// Çalıştırma (yerelde PHP + MySQL açıkken):
//   BASE=http://127.0.0.1:8765/balon ADMIN_PASS=... node --test tests/api.test.mjs
//
// Testler "Test…" ile başlayan isimlerle kayıt açar; ADMIN_PASS verilirse sonda bu isimleri engelleyip
// skorlarını siler, sonra engeli kaldırır (veritabanında iz kalmaz). Canlı sitede ÇALIŞTIRMA.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.BASE || 'http://127.0.0.1:8765/balon').replace(/\/$/, '');
const API = BASE + '/api/';
const ADMIN = process.env.ADMIN_PASS || '';
const RUN = Date.now().toString(36).slice(-5);
const NAMES = [];
const nm = (s) => { const n = ('Test' + s + RUN).slice(0, 16); NAMES.push(n); return n; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const get = (a, q = '') => fetch(`${API}?a=${a}${q}`).then((r) => r.json());
const post = (a, body = {}) => fetch(`${API}?a=${a}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
function istToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()); }

async function play(mode = 'classic', extra = {}) {
  const s = await post('start', { mode, ...extra });
  assert.equal(s.ok, true, 'start ok');
  return s;
}
async function submit(s, name, score = 120, more = {}) {
  return post('submit', { token: s.token, name, score, shots: 1, level: 1, gains: [score], seed: s.seed, city: 'İzmir', ...more });
}

let adminTok = null;
before(async () => {
  const j = await get('top');
  assert.equal(j.ok, true, 'API çalışmıyor: ' + JSON.stringify(j));
});

test('liderlik: tüm modlar ve dönemler döner', async () => {
  for (const m of ['classic', 'timed', 'daily']) {
    const j = await get('top', '&mode=' + m);
    assert.equal(j.ok, true); assert.equal(j.mode, m);
    for (const p of ['day', 'week', 'month', 'all']) assert.ok(Array.isArray(j[p]), `${m}.${p}`);
  }
});

test('günün bulmacası tohumu istemci ile aynı (FNV-1a)', async () => {
  const s = await play('daily');
  assert.equal(s.day, istToday());
  assert.equal(s.seed, fnv1a('balon-' + s.day));
});

test('yanlış tohum reddedilir', async () => {
  const s = await play();
  await sleep(1100);
  const j = await submit(s, nm('Seed'), 100, { seed: (s.seed ^ 12345) >>> 0 });
  assert.equal(j.error, 'bad_seed');
});

test('insan üstü hız reddedilir', async () => {
  const s = await play();
  const j = await post('submit', { token: s.token, name: nm('Fast'), score: 400, shots: 40, level: 1, gains: Array(39).fill(0).concat([400]), seed: s.seed });
  assert.equal(j.error, 'too_fast');
});

test('toplam ile atış puanları uyuşmazsa reddedilir', async () => {
  const s = await play(); await sleep(1100);
  const j = await submit(s, nm('Sum'), 130, { gains: [120] });
  assert.equal(j.error, 'bad_gains');
});

test('uygunsuz ya da HTML isim reddedilir', async () => {
  const s = await play(); await sleep(1100);
  assert.equal((await submit(s, '<b>x</b>')).error, 'bad_name');
  assert.equal((await submit(s, 'siktir')).error, 'bad_name');
});

test('geçerli skor kaydedilir, jeton tekrar kullanılamaz', async () => {
  const s = await play(); await sleep(1100);
  const n = nm('Ok');
  const j = await submit(s, n, 250);
  assert.equal(j.ok, true); assert.ok(j.id); assert.equal(j.rank.all >= 1, true);
  assert.equal((await submit(s, n, 250)).error, 'bad_token');
});

test('meydan okuma: aynı tahta tohumu ve hedef', async () => {
  const s = await play(); await sleep(1100);
  const n = nm('Ch');
  const j = await submit(s, n, 3330);
  const c = await get('challenge', '&id=' + j.id);
  assert.equal(c.ok, true); assert.equal(c.name, n); assert.equal(c.score, 3330);
  const s2 = await play('classic', { ch: j.id });
  assert.equal(s2.seed, s.seed);
  assert.deepEqual(s2.target, { name: n, score: 3330 });
});

test('günün bulmacası: kişi başı tek deneme', async () => {
  const n = nm('Daily');
  const a = await play('daily'); const b = await play('daily');
  await sleep(1100);
  assert.equal((await submit(a, n, 90)).ok, true);
  assert.equal((await submit(b, n, 300)).error, 'daily_done');
});

test('profil ve şehir sıralaması', async () => {
  const s = await play(); await sleep(1100);
  const n = nm('Prof');
  await submit(s, n, 1200);
  const p = await get('profile', '&name=' + encodeURIComponent(n));
  assert.equal(p.ok, true); assert.equal(p.best.classic, 1200); assert.ok(p.badges.includes('s1k')); assert.equal(p.city, 'İzmir');
  const c = await get('cities');
  assert.equal(c.ok, true); assert.ok(c.cities.some((x) => x.city === 'İzmir'));
  assert.equal((await get('profile', '&name=Yok' + RUN)).error, 'not_found');
});

test('şampiyonlar ucu çalışır', async () => {
  const j = await get('champions');
  assert.equal(j.ok, true); assert.ok(Array.isArray(j.seasons));
});

test('paylaşım önizleme sayfası ve görseli', async () => {
  const s = await play(); await sleep(1100);
  const n = nm('Og');
  const j = await submit(s, n, 4320);
  const html = await fetch(`${BASE}/meydan.php?id=${j.id}`).then((r) => r.text());
  assert.match(html, new RegExp('og:title" content="' + n));
  assert.match(html, /4\.320 puan/);
  const img = await fetch(`${API}og.php?id=${j.id}`, { redirect: 'manual' });
  assert.ok(img.status === 200 || img.status === 302, 'og.php ' + img.status);
  if (img.status === 200) assert.equal(img.headers.get('content-type'), 'image/png');
});

test('yönetim: yanlış şifre reddedilir', { skip: !ADMIN && 'ADMIN_PASS yok' }, async () => {
  const j = await post('admin_login', { pass: 'yanlis-' + RUN });
  assert.equal(j.error, 'wrong_pass');
});

test('yönetim: giriş, istatistik, işaretleme, engelleme', { skip: !ADMIN && 'ADMIN_PASS yok' }, async () => {
  const l = await post('admin_login', { pass: ADMIN });
  assert.equal(l.ok, true); adminTok = l.token;
  const st = await post('admin_stats', { t: adminTok });
  assert.equal(st.ok, true); assert.ok(st.totals.plays > 0);
  assert.equal((await post('admin_stats', { t: 'bozuk' })).error, 'unauthorized');

  // skor işaretlenince listeden düşer, onaylanınca geri gelir
  const s = await play(); await sleep(1100);
  const n = nm('Adm');
  const j = await submit(s, n, 140000);
  const row = (await post('admin_scores', { t: adminTok, filter: 'recent', q: n })).rows[0];
  assert.equal(row.name, n);
  await post('admin_act', { t: adminTok, id: row.id, act: 'flag' });
  let top = await get('top', '&mode=classic');
  assert.ok(!top.all.some((r) => r.name === n), 'işaretli skor listede görünmemeli');
  await post('admin_act', { t: adminTok, id: row.id, act: 'approve' });
  top = await get('top', '&mode=classic');
  assert.ok(top.all.some((r) => r.name === n), 'onaylanan skor listede görünmeli');

  // engellenen isim skor gönderemez
  await post('admin_ban', { t: adminTok, name: n });
  const s2 = await play(); await sleep(1100);
  assert.equal((await submit(s2, n, 100)).error, 'bad_name');
  await post('admin_ban', { t: adminTok, name: n, unban: true });
});

after(async () => {
  if (!adminTok) return;
  // test kayıtlarını temizle
  for (const n of new Set(NAMES)) {
    await post('admin_ban', { t: adminTok, name: n });
    await post('admin_ban', { t: adminTok, name: n, unban: true });
  }
});
