// Canlı Sohbet — özel sohbet ve yönetici yasağı API testleri (yerelde PHP + MySQL açıkken):
//   ADMIN_PASS=… node --test tests/sohbet-ozel.test.mjs
// Yeni kişi sınırı IP başına saatte 30: sohbet-api.test.mjs ile arka arkaya çalıştırmadan önce sh_* tablolarını sil. Canlıda ÇALIŞTIRMA.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/$/, '');
const API = BASE + '/sohbet/api/';
const RUN = Date.now().toString(36).slice(-4);
const post = (a, b = {}) => fetch(`${API}?a=${a}`, { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function kisi(nick, onay = true) {
  const h = await post('hello', {});
  assert.equal((await post('nick', { key: h.key, nick, g: 'b' })).ok, true);
  if (onay) assert.equal((await post('ozel_onay', { key: h.key, yas: 1, kural: 1 })).ok, true);
  return h;
}
let T, A, B, C, D, Y;
before(async () => {
  T = (await post('admin_login', { pass: process.env.ADMIN_PASS || '' })).token;
  assert.ok(T, 'ADMIN_PASS gerekli');
  A = await kisi('Ayse' + RUN); B = await kisi('Burak' + RUN, false); C = await kisi('Cem' + RUN); D = await kisi('Deniz' + RUN);
  Y = await post('hello', {}); await post('admin_claim', { t: T, key: Y.key, nick: 'Yon' + RUN });
});

test('özel sohbet onay ister; iki kutu birden gerekir; onaysız kişiye yazılamaz', async () => {
  assert.equal((await post('dm', { key: B.key, nick: 'Ayse' + RUN })).error, 'ozel_onay');
  assert.equal((await post('ozel_onay', { key: B.key, yas: 1 })).error, 'need_both');
  assert.equal((await post('dm', { key: A.key, nick: 'Burak' + RUN })).error, 'karsi_onay');
  assert.equal((await post('poll', { key: B.key, ch: 'genel', after: 0 })).me.ozel.onay, false);
  assert.equal((await post('ozel_onay', { key: B.key, yas: 1, kural: 1 })).ok, true);
  assert.equal((await post('poll', { key: B.key, ch: 'genel', after: 0 })).me.ozel.onay, true);
  assert.equal((await post('dm', { key: A.key, nick: 'Ayse' + RUN })).error, 'kendin');
});

test('bire bir: aynı çift aynı konuşma; mesaj gelir, okunmamış işaretlenir, üçüncü kişi giremez', async () => {
  const d1 = await post('dm', { key: A.key, nick: 'Burak' + RUN });
  assert.match(d1.ch, /^p\d+$/);
  assert.equal((await post('dm', { key: B.key, nick: 'ayse' + RUN })).ch, d1.ch, 'iki taraftan da aynı konuşma');
  const s = await post('say', { key: A.key, ch: d1.ch, text: 'selam özel ' + RUN });
  assert.equal(s.ok, true, JSON.stringify(s));
  let g = await post('poll', { key: B.key, ch: 'genel', after: 0 });
  assert.equal(g.ozel.find((x) => x.ch === d1.ch).yeni, true);
  assert.equal(g.ozel.find((x) => x.ch === d1.ch).ad, 'Ayse' + RUN);
  const p = await post('poll', { key: B.key, ch: d1.ch, after: 0, users: 1 });
  assert.ok(p.msgs.some((m) => m.id === s.id));
  assert.equal(p.oda.tip, 'd'); assert.equal(p.oda.diger.nick, 'Ayse' + RUN);
  assert.equal(p.users.length, 2);
  g = await post('poll', { key: B.key, ch: 'genel', after: 0 });
  assert.equal(g.ozel.find((x) => x.ch === d1.ch).yeni, false, 'okununca işaret kalkar');
  assert.equal((await post('poll', { key: C.key, ch: d1.ch, after: 0 })).error, 'no_room');
  assert.equal((await post('say', { key: C.key, ch: d1.ch, text: 'sızma' })).error, 'no_room');
  assert.equal((await post('history', { key: C.key, ch: d1.ch, before: s.id + 1 })).error, 'no_room');
  // herkese açık kanalın kişi listesinde özel konuşma yüzünden kaybolmaz
  await post('poll', { key: C.key, ch: 'tavla', after: 0 });
  await post('poll', { key: C.key, ch: 'p999999', after: 0 }).catch(() => {});
  assert.ok((await post('poll', { key: D.key, ch: 'tavla', after: 0, users: 1 })).users.some((u) => u.nick === 'Cem' + RUN));
});

test('engel ve "özel mesajlara kapalıyım"', async () => {
  const d1 = await post('dm', { key: A.key, nick: 'Burak' + RUN });
  await sleep(1100);
  assert.equal((await post('engel', { key: B.key, user: A.me.id })).ok, true);
  assert.equal((await post('say', { key: A.key, ch: d1.ch, text: 'engelli mi ' + RUN })).error, 'engelli');
  assert.equal((await post('dm', { key: A.key, nick: 'Burak' + RUN })).error, 'engelli');
  const b = await post('poll', { key: B.key, ch: d1.ch, after: 0, users: 1 });
  assert.equal(b.oda.engelledim, true);
  await post('engel', { key: B.key, user: A.me.id, kaldir: 1 });
  assert.equal((await post('ozel_ayar', { key: C.key, kapali: 1 })).ok, true);
  assert.equal((await post('dm', { key: A.key, nick: 'Cem' + RUN })).error, 'karsi_kapali');
  await post('ozel_ayar', { key: C.key, kapali: 0 });
});

test('şikâyet: özel konuşma yalnızca şikâyetten sonra yönetimde okunur; genel akışta görünmez; moderatör silemez', async () => {
  const d2 = await post('dm', { key: C.key, nick: 'Deniz' + RUN });
  await sleep(1100);
  const s = await post('say', { key: C.key, ch: d2.ch, text: 'rahatsız edici ' + RUN });
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal((await post('admin_ozel_oku', { t: T, ch: d2.ch })).error, 'no_room', 'şikâyetsiz okunamaz');
  const feed = await post('admin_feed', { t: T });
  assert.ok(!feed.rows.some((r) => r.id === s.id), 'genel akışta özel mesaj yok');
  // moderatör özel mesajı silemez
  await post('admin_op', { t: T, user: A.me.id, op: 1 });
  await post('op_del', { key: A.key, id: s.id });
  await post('admin_op', { t: T, user: A.me.id, op: 0 });
  assert.equal((await post('report', { key: D.key, id: s.id })).inceleme, true);
  const list = await post('admin_ozel', { t: T });
  assert.ok(list.rows.some((r) => r.ch === d2.ch && r.reps === 1));
  const oku = await post('admin_ozel_oku', { t: T, ch: d2.ch });
  const m = oku.rows.find((r) => r.id === s.id);
  assert.ok(m, 'şikâyetten sonra okunur'); assert.equal(m.del, null, 'moderatör silememiş'); assert.equal(m.reps, 1);
  assert.equal((await post('admin_ozel_kapat', { t: T, ch: d2.ch, kapali: 1 })).ok, true);
  assert.equal((await post('say', { key: D.key, ch: d2.ch, text: 'kapalı mı' })).error, 'room_closed');
  await post('admin_ozel_tamam', { t: T, ch: d2.ch });
  assert.equal((await post('admin_ozel_oku', { t: T, ch: d2.ch })).error, 'no_room', 'inceleme bitince yine kapalı');
});

test('özel oda: aç, kodla katıl, üyeler, sahibi çıkarır, çıkarılan dönemez, ayrılan listeden düşer', async () => {
  const o = await post('oda_ac', { key: A.key, ad: 'Çay ocağı ' + RUN });
  assert.match(o.kod, /^[A-Z0-9]{8}$/);
  assert.equal((await post('oda_ac', { key: A.key, ad: 'x' })).error, 'bad_name');
  const k = await post('oda_katil', { key: C.key, kod: o.kod.toLowerCase() });
  assert.equal(k.ch, o.ch);
  await post('oda_katil', { key: D.key, kod: o.kod });
  let p = await post('poll', { key: A.key, ch: o.ch, after: 0, users: 1 });
  assert.equal(p.oda.tip, 'o'); assert.equal(p.oda.kod, o.kod); assert.equal(p.oda.sahip, true);
  assert.equal(p.users.length, 3);
  assert.ok(p.msgs.some((m) => m.x.includes('odaya katıldı')));
  assert.equal((await post('oda_at', { key: C.key, ch: o.ch, user: D.me.id })).error, 'not_owner');
  assert.equal((await post('oda_at', { key: A.key, ch: o.ch, user: D.me.id })).ok, true);
  assert.equal((await post('poll', { key: D.key, ch: o.ch, after: 0 })).error, 'no_room');
  assert.equal((await post('oda_katil', { key: D.key, kod: o.kod })).error, 'atildin');
  assert.equal((await post('oda_cik', { key: C.key, ch: o.ch })).ok, true);
  const g = await post('poll', { key: C.key, ch: 'genel', after: 0 });
  assert.ok(!g.ozel.some((x) => x.ch === o.ch));
  assert.equal((await post('oda_katil', { key: B.key, kod: 'YANLIS22' })).error, 'no_room');
});

test('yönetici sohbetin içinden yasaklar; başkası yasaklayamaz', async () => {
  const z = await kisi('Zarar' + RUN, false);
  assert.equal((await post('op_ban', { key: A.key, user: z.me.id, days: 1 })).error, 'not_admin');
  await post('admin_op', { t: T, user: A.me.id, op: 1 });
  assert.equal((await post('op_ban', { key: A.key, user: z.me.id, days: 1 })).error, 'not_admin', 'moderatör de yasaklayamaz');
  await post('admin_op', { t: T, user: A.me.id, op: 0 });
  const s = await post('say', { key: z.key, ch: 'genel', text: 'kötü mesaj ' + RUN });
  assert.equal((await post('op_ban', { key: Y.key, user: z.me.id, days: 7, wipe: 1, ch: 'genel' })).ok, true);
  assert.equal((await post('say', { key: z.key, ch: 'genel', text: 'yine' })).error, 'banned');
  const feed = await post('admin_feed', { t: T, ch: 'genel' });
  assert.equal(feed.rows.find((r) => r.id === s.id).del, 'admin', 'son 24 saatin mesajları gizlendi');
  assert.ok(feed.rows.some((r) => r.x.includes('7 gün yasaklandı')));
  assert.equal((await post('op_ban', { key: Y.key, user: Y.me.id, days: 1 })).error, 'no_user', 'kendini yasaklayamaz');
});
