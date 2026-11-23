// Canlı Sohbet — #radyo (YouTube ortak dinleme) API testleri (yerelde PHP + MySQL açıkken; YouTube oEmbed'e erişim gerekir):
//   ADMIN_PASS=… node --test tests/sohbet-radyo.test.mjs      (önceki sohbet test dosyasından sonra sh_* tablolarını sil)
// Canlıda ÇALIŞTIRMA.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/$/, '');
const API = BASE + '/sohbet/api/';
const RUN = Date.now().toString(36).slice(-4);
const post = (a, b = {}) => fetch(`${API}?a=${a}`, { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const V1 = 'dQw4w9WgXcQ', V2 = '9bZkp7q19f0', V3 = 'kJQP7kiw5Fk';
let T, A, B, C, D;
async function kisi(nick) { const h = await post('hello', {}); assert.equal((await post('nick', { key: h.key, nick })).ok, true); return h; }
before(async () => {
  T = (await post('admin_login', { pass: process.env.ADMIN_PASS || '' })).token; assert.ok(T, 'ADMIN_PASS gerekli');
  A = await kisi('Dinleyen' + RUN); B = await kisi('Oycu' + RUN); C = await kisi('Oycu2' + RUN); D = await kisi('Djci' + RUN);
  for (const k of [A, B, C, D]) await post('poll', { key: k.key, ch: 'radyo', after: 0 });
});

test('bağlantı doğrulama: YouTube dışı, kimliksiz ve olmayan video eklenmez', async () => {
  assert.equal((await post('radyo_ekle', { key: A.key, url: 'https://vimeo.com/1' })).error, 'yt_bad');
  assert.equal((await post('radyo_ekle', { key: A.key, url: 'https://www.youtube.com/' })).error, 'yt_bad');
  assert.equal((await post('radyo_ekle', { key: A.key, url: 'https://youtu.be/aaaaaaaaaa0' })).error, 'yt_gomulemez');
});

test('ekle: ilk şarkı hemen çalar, bot duyurur; aynı şarkı ikinci kez girmez; kişi başı 2 sınırı', async () => {
  const r = await post('radyo_ekle', { key: A.key, url: 'https://www.youtube.com/watch?v=' + V1 + '&t=30s' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.radyo.simdi.video, V1); assert.ok(r.radyo.simdi.baslik.length > 3); assert.equal(r.radyo.simdi.nick, 'Dinleyen' + RUN);
  assert.ok(Math.abs(r.radyo.simdi.basla - r.radyo.now) <= 2);
  const p = await post('poll', { key: B.key, ch: 'radyo', after: 0 });
  assert.ok(p.radyo && p.radyo.simdi.video === V1, 'yoklamada radyo durumu');
  assert.ok(p.msgs.some((m) => m.k === 'b' && m.n === 'RadyoBot' && m.x.startsWith('🎵 Şimdi çalıyor')));
  assert.equal((await post('radyo_ekle', { key: B.key, url: 'https://youtu.be/' + V1 })).error, 'yt_sirada');
  assert.equal((await post('radyo_ekle', { key: A.key, url: 'https://youtu.be/' + V2 })).error, 'slow', '20 sn ekleme aralığı');
});

test('süre bildirimi: yalnızca çalan şarkıya, bir kez; 5 sn altı reddedilir', async () => {
  const st = (await post('radyo', { key: A.key })).radyo;
  assert.equal((await post('radyo_sure', { key: B.key, id: st.simdi.id, sure: 3 })).error, 'bad_sure');
  await post('radyo_sure', { key: B.key, id: st.simdi.id, sure: 213.4 });
  await post('radyo_sure', { key: C.key, id: st.simdi.id, sure: 400 });
  assert.equal((await post('radyo', { key: A.key })).radyo.simdi.sure, 213);
});

test('atla oylaması: dinleyenlerin yarısı (en az 2) isteyince geçer; sıradaki başlar', async () => {
  const e = await post('radyo_ekle', { key: B.key, url: 'https://youtu.be/' + V2 });
  assert.equal(e.ok, true, JSON.stringify(e));
  assert.equal(e.radyo.sira.length, 1); assert.equal(e.radyo.sira[0].video, V2);
  const o1 = await post('radyo_oy', { key: B.key });
  assert.equal(o1.radyo.simdi.video, V1); assert.equal(o1.radyo.oy, 1); assert.equal(o1.radyo.verdim, true);
  assert.ok(o1.radyo.oyGerek >= 2);
  let son = o1;
  for (const k of [C, A, D]) { if (son.radyo.simdi.video !== V1) break; son = await post('radyo_oy', { key: k.key }); }
  assert.equal(son.radyo.simdi.video, V2, 'oyla geçti');
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
  const g = await post('radyo_gec', { key: D.key });
  assert.equal(g.ok, true); assert.equal(g.radyo.simdi.video, V3);
  const uzun = await post('radyo_sure', { key: A.key, id: g.radyo.simdi.id, sure: 700 });
  assert.equal(uzun.ok, true);
  const st = (await post('radyo', { key: A.key })).radyo;
  assert.equal(st.simdi, null, 'uzun şarkı geçildi, sıra boş');
  const kisi = (await post('poll', { key: A.key, ch: 'radyo', after: 0, users: 1 })).users.find((u) => u.nick === 'Djci' + RUN);
  assert.equal(kisi.dj, true);
});

test('radyo dosyaları ve bot adı korunur', async () => {
  const h = await post('hello', {});
  assert.equal((await post('nick', { key: h.key, nick: 'RadyoBot' })).error, 'bad_nick');
});

test('çalınamaz bildirimi: tek kişi atlatamaz, iki dinleyen bildirince geçilir', async () => {
  const e = await post('radyo_ekle', { key: C.key, url: 'jNQXAC9IVRw' });
  assert.equal(e.ok, true, JSON.stringify(e));
  const id = e.radyo.simdi.id;
  assert.equal((await post('radyo_hata', { key: A.key, id, kod: 7 })).error, 'bad_kod');
  const h1 = await post('radyo_hata', { key: A.key, id, kod: 150 });
  assert.equal(h1.radyo.simdi && h1.radyo.simdi.id, id, 'tek bildirim yetmez');
  await post('radyo_hata', { key: A.key, id, kod: 150 });
  assert.equal((await post('radyo', { key: A.key })).radyo.simdi?.id, id, 'aynı kişinin ikinci bildirimi sayılmaz');
  const h2 = await post('radyo_hata', { key: B.key, id, kod: 150 });
  assert.notEqual(h2.radyo.simdi && h2.radyo.simdi.id, id, 'iki bildirimle geçildi');
  const p = await post('poll', { key: A.key, ch: 'radyo', after: 0 });
  assert.ok(p.msgs.some((m) => m.k === 'b' && m.x.includes('Burada çalınamıyor')));
});
