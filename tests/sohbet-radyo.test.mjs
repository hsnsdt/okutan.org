// Canlı Sohbet — #radyo (YouTube ortak dinleme) API testleri (yerelde PHP + MySQL açıkken; YouTube oEmbed'e erişim gerekir):
//   ADMIN_PASS=… node --test tests/sohbet-radyo.test.mjs      (önceki sohbet test dosyasından sonra sh_* tablolarını sil)
// Canlıda ÇALIŞTIRMA. Dinleyen sinyali 25 sn geçerli; "dinleyen yoksa bekler" testi bu yüzden 26 sn bekler.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/$/, '');
const API = BASE + '/sohbet/api/';
const RUN = Date.now().toString(36).slice(-4);
const post = (a, b = {}) => fetch(`${API}?a=${a}`, { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V1 = 'dQw4w9WgXcQ', V2 = '9bZkp7q19f0', V3 = 'kJQP7kiw5Fk', V4 = 'jNQXAC9IVRw';
let T, A, B, C, D;
async function kisi(nick) { const h = await post('hello', {}); assert.equal((await post('nick', { key: h.key, nick })).ok, true); return h; }
const dinle = (k) => post('poll', { key: k.key, ch: 'radyo', after: 0, dinle: 1 });
const durum = async (k) => (await post('poll', { key: k.key, ch: 'radyo', after: 0 })).radyo;
before(async () => {
  T = (await post('admin_login', { pass: process.env.ADMIN_PASS || '' })).token; assert.ok(T, 'ADMIN_PASS gerekli');
  A = await kisi('Dinleyen' + RUN); B = await kisi('Oycu' + RUN); C = await kisi('Oycu2' + RUN); D = await kisi('Djci' + RUN);
});

test('bağlantı doğrulama: YouTube dışı, kimliksiz ve olmayan video eklenmez', async () => {
  assert.equal((await post('radyo_ekle', { key: A.key, url: 'https://vimeo.com/1' })).error, 'yt_bad');
  assert.equal((await post('radyo_ekle', { key: A.key, url: 'https://www.youtube.com/' })).error, 'yt_bad');
  assert.equal((await post('radyo_ekle', { key: A.key, url: 'https://youtu.be/aaaaaaaaaa0' })).error, 'yt_gomulemez');
});

test('dinleyen yoksa bekler: şarkı sırada kalır, biri dinleyince baştan başlar; herkes gidince duraklar, dönünce kaldığı yerden sürer', async () => {
  const e = await post('radyo_ekle', { key: A.key, url: 'https://www.youtube.com/watch?v=' + V1 + '&t=30s' });
  assert.equal(e.ok, true, JSON.stringify(e));
  assert.equal(e.radyo.simdi, null, 'kimse dinlemiyor: başlamadı');
  assert.equal(e.radyo.sira[0].video, V1); assert.ok(e.radyo.sira[0].baslik.length > 3);
  const d = (await dinle(B)).radyo;
  assert.equal(d.simdi.video, V1, 'biri dinleyince başladı');
  assert.ok(Math.abs(d.simdi.basla - d.now) <= 2, 'baştan');
  assert.equal(d.dinleyen, 1);
  const p = await post('poll', { key: C.key, ch: 'radyo', after: 0 });
  assert.ok(p.msgs.some((m) => m.k === 'b' && m.n === 'RadyoBot' && m.x.startsWith('🎵 Şimdi çalıyor')));
  await sleep(26000); // dinleyen sinyali düştü
  const b = await durum(C);
  assert.equal(b.simdi.durak, true, 'dinleyen yok: duraklandı'); assert.ok(b.simdi.konum >= 20, String(b.simdi.konum));
  await sleep(3000);
  assert.equal((await durum(C)).simdi.konum, b.simdi.konum, 'duraklamışken ilerlemez');
  const g = (await dinle(B)).radyo;
  assert.equal(g.simdi.durak, false); assert.ok(Math.abs((g.now - g.simdi.basla) - b.simdi.konum) <= 2, 'kaldığı yerden');
});

test('aynı şarkı ikinci kez girmez; ekleme aralığı; ekleyen kendi şarkısını sıradan çıkarır', async () => {
  assert.equal((await post('radyo_ekle', { key: B.key, url: 'https://youtu.be/' + V1 })).error, 'yt_sirada');
  const e = await post('radyo_ekle', { key: C.key, url: 'https://youtu.be/' + V2 });
  assert.equal(e.ok, true, JSON.stringify(e));
  assert.equal((await post('radyo_ekle', { key: C.key, url: 'https://youtu.be/' + V3 })).error, 'slow', '20 sn ekleme aralığı');
  const s = await post('radyo_sil', { key: C.key, id: e.radyo.sira.find((x) => x.video === V2).id });
  assert.equal(s.ok, true); assert.ok(!s.radyo.sira.some((x) => x.video === V2));
});

test('süre bildirimi: yalnızca çalan şarkıya, bir kez; 5 sn altı reddedilir', async () => {
  const st = (await dinle(B)).radyo;
  assert.equal((await post('radyo_sure', { key: B.key, id: st.simdi.id, sure: 3 })).error, 'bad_sure');
  await post('radyo_sure', { key: B.key, id: st.simdi.id, sure: 213.4 });
  await post('radyo_sure', { key: C.key, id: st.simdi.id, sure: 400 });
  assert.equal((await durum(A)).simdi.sure, 213);
});

test('atla oylaması: 4 dinleyende 2 oy gerekir; tek dinleyen kendi oyuyla geçer', async () => {
  for (const k of [A, B, C, D]) await dinle(k);
  const e = await post('radyo_ekle', { key: B.key, url: 'https://youtu.be/' + V2 });
  assert.equal(e.ok, true, JSON.stringify(e));
  assert.equal(e.radyo.sira[0].video, V2);
  const o1 = await post('radyo_oy', { key: B.key });
  assert.equal(o1.radyo.simdi.video, V1); assert.equal(o1.radyo.oy, 1); assert.equal(o1.radyo.verdim, true);
  assert.equal(o1.radyo.oyGerek, 2, '4 dinleyen: 2 oy');
  const o2 = await post('radyo_oy', { key: C.key });
  assert.equal(o2.radyo.simdi.video, V2, 'oyla geçti');
  const p = await post('poll', { key: A.key, ch: 'radyo', after: 0 });
  assert.ok(p.msgs.some((m) => m.k === 'b' && m.x.includes('oyuyla geçildi')));
});

test('DJ: yalnızca DJ ve moderatör geçer; ekleyen ve DJ sıradan siler; 10 dakikadan uzun şarkı geçilir', async () => {
  assert.equal((await post('radyo_gec', { key: C.key })).error, 'not_dj');
  await post('admin_dj', { t: T, user: D.me.id, dj: 1 });
  assert.equal((await post('poll', { key: D.key, ch: 'radyo', after: 0 })).me.dj, true);
  const e = await post('radyo_ekle', { key: D.key, url: V3 });
  assert.equal(e.ok, true, JSON.stringify(e));
  const sira = e.radyo.sira.find((x) => x.video === V3);
  assert.equal((await post('radyo_sil', { key: C.key, id: sira.id })).error, 'not_dj');
  await dinle(D);
  const g = await post('radyo_gec', { key: D.key });
  assert.equal(g.ok, true); assert.equal(g.radyo.simdi.video, V3);
  assert.equal((await post('radyo_sure', { key: A.key, id: g.radyo.simdi.id, sure: 700 })).ok, true);
  assert.equal((await durum(A)).simdi, null, 'uzun şarkı geçildi, sıra boş');
  const kisi = (await post('poll', { key: A.key, ch: 'radyo', after: 0, users: 1 })).users.find((u) => u.nick === 'Djci' + RUN);
  assert.equal(kisi.dj, true);
});

test('çalınamaz bildirimi: tek kişi atlatamaz, iki dinleyen bildirince geçilir', async () => {
  for (const k of [A, B]) await dinle(k);
  const e = await post('radyo_ekle', { key: A.key, url: V4 }); // A'nın son eklemesinin üstünden 20 sn'den çok geçti
  assert.equal(e.ok, true, JSON.stringify(e));
  const id = e.radyo.simdi.id;
  assert.equal((await post('radyo_hata', { key: A.key, id, kod: 7 })).error, 'bad_kod');
  const h1 = await post('radyo_hata', { key: A.key, id, kod: 150 });
  assert.equal(h1.radyo.simdi && h1.radyo.simdi.id, id, 'tek bildirim yetmez');
  await post('radyo_hata', { key: A.key, id, kod: 150 });
  assert.equal((await durum(A)).simdi?.id, id, 'aynı kişinin ikinci bildirimi sayılmaz');
  const h2 = await post('radyo_hata', { key: B.key, id, kod: 150 });
  assert.notEqual(h2.radyo.simdi && h2.radyo.simdi.id, id, 'iki bildirimle geçildi');
  const p = await post('poll', { key: A.key, ch: 'radyo', after: 0 });
  assert.ok(p.msgs.some((m) => m.k === 'b' && m.x.includes('Burada çalınamıyor')));
});

test('bot adı korunur', async () => {
  const h = await post('hello', {});
  assert.equal((await post('nick', { key: h.key, nick: 'RadyoBot' })).error, 'bad_nick');
});
