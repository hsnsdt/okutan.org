// Canlı Sohbet API testleri (yerelde PHP + MySQL açıkken):
//   ADMIN_PASS=… node --test tests/sohbet-api.test.mjs        (BASE varsayılanı http://127.0.0.1:8765)
// Canlı sitede ÇALIŞTIRMA (kayıt açar). Bitince yerel sh_* tablolarını sil.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.BASE || 'http://127.0.0.1:8765').replace(/\/$/, '');
const API = BASE + '/sohbet/api/';
const RUN = Date.now().toString(36).slice(-4);
const post = (a, b = {}) => fetch(`${API}?a=${a}`, { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function kisi(nick) {
  const h = await post('hello', {});
  assert.equal(h.ok, true); assert.match(h.key, /^[a-f0-9]{32}$/);
  if (nick) assert.equal((await post('nick', { key: h.key, nick })).nick, nick);
  return h;
}
let admin = null;
async function adminTok() {
  if (admin) return admin;
  const j = await post('admin_login', { pass: process.env.ADMIN_PASS || '' });
  assert.equal(j.ok, true, 'ADMIN_PASS gerekli'); admin = j.token; return admin;
}

test('GET reddedilir, bilinmeyen anahtar 401', async () => {
  assert.equal((await fetch(API + '?a=poll')).status, 405);
  assert.equal((await post('poll', { key: 'f'.repeat(32), ch: 'genel' })).error, 'bad_key');
});

test('hello: aynı anahtarla aynı kişi döner', async () => {
  const a = await kisi();
  const b = await post('hello', { key: a.key });
  assert.equal(b.key, a.key); assert.equal(b.me.id, a.me.id);
});

test('rumuz: kural, ayrılmış adlar, başkasınınki alınamaz, Türkçe büyük/küçük harf aynı sayılır', async () => {
  const a = await kisi('Işık' + RUN);
  const b = await kisi();
  assert.equal((await post('nick', { key: b.key, nick: 'ışık' + RUN })).error, 'nick_taken');
  for (const n of ['a', 'Sedat Okutan', 'admin1', 'm0derator', '<b>x</b>']) assert.equal((await post('nick', { key: b.key, nick: n })).error, 'bad_nick', n);
  assert.equal((await post('nick', { key: a.key, nick: 'Başka' + RUN })).error, 'nick_wait');
});

test('rumuzsuz mesaj olmaz; mesaj gelir, temizlenir, yoklamada görünür', async () => {
  const z = await kisi();
  assert.equal((await post('say', { key: z.key, ch: 'genel', text: 'merhaba' })).error, 'need_nick');
  const a = await kisi('Yazan' + RUN);
  const b = await kisi('Okuyan' + RUN);
  const p0 = await post('poll', { key: b.key, ch: 'tavla', after: 0, users: 1 });
  const after = p0.msgs.length ? p0.msgs.at(-1).id : 0;
  await sleep(5100); // yeni gelen ilk 5 dakika: 5 sn yavaş mod (ilk mesaj serbest)
  const s = await post('say', { key: a.key, ch: 'tavla', text: '  selam‮  amk  bak https://kotu.site/x ve okutan.org/tavla/?masa=ABC234 ' });
  assert.equal(s.ok, true, JSON.stringify(s));
  assert.equal(s.text, 'selam *** bak [bağlantı] ve okutan.org/tavla/?masa=ABC234');
  const p1 = await post('poll', { key: b.key, ch: 'tavla', after, users: 1, since: p0.now });
  const m = p1.msgs.find((x) => x.id === s.id);
  assert.ok(m); assert.equal(m.n, 'Yazan' + RUN); assert.equal(m.k, 'm');
  assert.ok(p1.users.some((u) => u.nick === 'Okuyan' + RUN), 'okuyan listede');
  assert.ok(p1.counts.tavla >= 1);
});

test('hız sınırı ve tekrar', async () => {
  const a = await kisi('Hizli' + RUN);
  assert.equal((await post('say', { key: a.key, ch: 'kart', text: 'bir' })).ok, true);
  const r = await post('say', { key: a.key, ch: 'kart', text: 'iki' });
  assert.equal(r.error, 'slow'); assert.ok(r.wait >= 1);
});

test('/me türü, yanlış kanal reddedilir', async () => {
  const a = await kisi('Eylem' + RUN);
  const s = await post('say', { key: a.key, ch: 'kelime', text: 'çay koyuyor', me: true });
  const p = await post('poll', { key: a.key, ch: 'kelime', after: s.id - 1 });
  assert.equal(p.msgs[0].k, 'e');
  assert.equal((await post('say', { key: a.key, ch: 'yok', text: 'x' })).error, 'bad_channel');
});

test('şikâyet: kendi mesajını şikâyet edemezsin; üç ayrı ağ gerekir', async () => {
  const a = await kisi('Sikayet' + RUN);
  const s = await post('say', { key: a.key, ch: 'genel', text: 'şikâyet denemesi ' + RUN });
  assert.equal((await post('report', { key: a.key, id: s.id })).error, 'own');
  const b = await kisi('Bildiren' + RUN), c = await kisi('Bildiren2' + RUN), d = await kisi('Bildiren3' + RUN);
  for (const k of [b, c, d]) assert.equal((await post('report', { key: k.key, id: s.id })).ok, true);
  // hepsi aynı yerel IP: gizlenmemeli
  const p = await post('poll', { key: b.key, ch: 'genel', after: s.id - 1 });
  assert.ok(p.msgs.some((m) => m.id === s.id));
});

test('yönetim: yanlış şifre, sil (yoklamada del listesi), sustur, yasakla, op', async () => {
  assert.equal((await post('admin_login', { pass: 'yanlis-' + RUN })).error, 'wrong_pass');
  const t = await adminTok();
  const a = await kisi('Kural' + RUN), b = await kisi('Izleyen' + RUN);
  const s = await post('say', { key: a.key, ch: 'genel', text: 'silinecek ' + RUN });
  const p0 = await post('poll', { key: b.key, ch: 'genel', after: s.id - 1 });
  assert.equal((await post('admin_del', { t, id: s.id })).ok, true);
  const p1 = await post('poll', { key: b.key, ch: 'genel', after: s.id, since: p0.now });
  assert.ok(p1.del.includes(s.id), 'silinen id bildirilir');
  const feed = await post('admin_feed', { t, ch: 'genel' });
  assert.equal(feed.rows.find((r) => r.id === s.id).del, 'admin');

  assert.equal((await post('admin_mute', { t, user: a.me.id, min: 5 })).ok, true);
  const m = await post('say', { key: a.key, ch: 'genel', text: 'susturuldum mu' });
  assert.equal(m.error, 'muted'); assert.ok(m.until > Date.now() / 1000);
  await post('admin_mute', { t, user: a.me.id, min: 0 });

  assert.equal((await post('admin_ban', { t, user: a.me.id, days: 1 })).ok, true);
  assert.equal((await post('say', { key: a.key, ch: 'genel', text: 'yasakli' })).error, 'banned');
  assert.equal((await post('poll', { key: a.key, ch: 'genel', after: 0 })).me.banned, true);
  await post('admin_ban', { t, user: a.me.id, days: 0 });
  assert.equal((await post('poll', { key: a.key, ch: 'genel', after: 0 })).me.banned, false);

  // op: mesaj silebilir, başkasını susturabilir, opu susturamaz
  assert.equal((await post('op_del', { key: b.key, id: s.id })).error, 'not_op');
  await post('admin_op', { t, user: b.me.id, op: 1 });
  await sleep(5100); // yeni gelenin 5 sn yavaş modu
  const s2 = await post('say', { key: a.key, ch: 'genel', text: 'op silsin ' + RUN });
  assert.equal((await post('op_del', { key: b.key, id: s2.id })).ok, true);
  assert.equal((await post('op_mute', { key: b.key, nick: 'Kural' + RUN, min: 2, ch: 'genel' })).ok, true);
  assert.equal((await post('say', { key: a.key, ch: 'genel', text: 'x' })).error, 'muted');
  await post('admin_op', { t, user: a.me.id, op: 1 });
  assert.equal((await post('op_mute', { key: b.key, nick: 'Kural' + RUN })).error, 'not_op');
  await post('admin_op', { t, user: a.me.id, op: 0 }); await post('admin_op', { t, user: b.me.id, op: 0 });
  await post('admin_mute', { t, user: a.me.id, min: 0 });

  const st = await post('admin_stats', { t });
  assert.ok(st.size.some((x) => x.t === 'sh_msgs'));
  const lg = await post('admin_log', { t, user: a.me.id });
  assert.ok(lg.rows.some((r) => r.ev === 'msg' && r.ip), 'yasal kayıtta IP var');
  assert.ok(!('text' in lg.rows[0]), 'kayıtta mesaj metni yok');
});

test('yönetim: kanal konusu ve yavaş mod, duyuru', async () => {
  const t = await adminTok();
  assert.equal((await post('admin_chan', { t, ch: 'kelime', slow: 0, topic: 'Konu ' + RUN })).ok, true);
  const a = await kisi('Konu' + RUN);
  const p = await post('poll', { key: a.key, ch: 'kelime', after: 0, users: 1 });
  assert.equal(p.topic, 'Konu ' + RUN);
  assert.equal((await post('admin_notice', { t, ch: 'kelime', text: 'Duyuru ' + RUN })).ok, true);
  const p2 = await post('poll', { key: a.key, ch: 'kelime', after: p.msgs.length ? p.msgs.at(-1).id : 0 });
  const d = p2.msgs.find((m) => m.x === 'Duyuru ' + RUN);
  assert.ok(d); assert.equal(d.k, 'a'); assert.equal(d.n, 'Sedat Okutan');
  await post('admin_chan', { t, ch: 'kelime', slow: 0, topic: '' });
});

test('yönetici kendi rumuzunu alır: ayrılmış ad serbest, op olur; başkası alamaz', async () => {
  const t = await adminTok();
  const a = await kisi(), b = await kisi();
  assert.equal((await post('nick', { key: b.key, nick: 'okutan' + RUN })).error, 'bad_nick');
  assert.equal((await post('admin_claim', { t: 'yanlis', key: a.key, nick: 'okutan' })).error, 'unauthorized');
  assert.equal((await post('admin_claim', { t, key: 'f'.repeat(32), nick: 'okutan' })).error, 'bad_key');
  assert.equal((await post('admin_claim', { t, key: a.key, nick: 'amk' + RUN })).error, 'bad_nick');
  const j = await post('admin_claim', { t, key: a.key, nick: 'okutan' });
  assert.equal(j.nick, 'okutan');
  const p = await post('poll', { key: a.key, ch: 'genel', after: 0 });
  assert.equal(p.me.nick, 'okutan'); assert.equal(p.me.op, 2);
  assert.equal((await post('nick', { key: b.key, nick: 'Okutan' })).error, 'bad_nick');
});

test('herkese açık sayaç GET ile çalışır ve önbelleğe izin verir', async () => {
  const a = await kisi('Sayac' + RUN);
  await post('poll', { key: a.key, ch: 'tavla', after: 0 });
  const r = await fetch(API + '?a=count');
  assert.match(r.headers.get('cache-control') || '', /max-age=30/);
  const j = await r.json();
  assert.equal(j.ok, true); assert.ok(j.online >= 1); assert.ok(j.ch.tavla >= 1);
});

test('yazıyor: başkasında görünür, bırakınca kaybolur', async () => {
  const a = await kisi('Yaziyor' + RUN), b = await kisi('Bakan' + RUN);
  await post('poll', { key: a.key, ch: 'kelime', after: 0 });
  await post('poll', { key: a.key, ch: 'kelime', after: 0, typing: 1 });
  assert.ok((await post('poll', { key: b.key, ch: 'kelime', after: 0 })).typing.includes('Yaziyor' + RUN));
  assert.ok(!(await post('poll', { key: a.key, ch: 'kelime', after: 0, typing: 1 })).typing.includes('Yaziyor' + RUN), 'kendini görmez');
  await post('poll', { key: a.key, ch: 'kelime', after: 0, typing: 0 });
  assert.ok(!(await post('poll', { key: b.key, ch: 'kelime', after: 0 })).typing.includes('Yaziyor' + RUN));
});

test('eski mesajlar: before öncesini eskiden yeniye verir', async () => {
  const t = await adminTok(), a = await kisi('Eskici' + RUN);
  for (let i = 0; i < 3; i++) await post('admin_notice', { t, ch: 'okey', text: 'eski ' + i + ' ' + RUN });
  const p = await post('poll', { key: a.key, ch: 'okey', after: 0 });
  const last = p.msgs.at(-1).id;
  const h = await post('history', { key: a.key, ch: 'okey', before: last });
  assert.equal(h.ok, true); assert.ok(h.msgs.every((m) => m.id < last));
  assert.deepEqual(h.msgs.map((m) => m.id), [...h.msgs.map((m) => m.id)].sort((x, y) => x - y));
  assert.equal(h.msgs.at(-1).x, 'eski 1 ' + RUN);
});

test('sabit mesaj: yalnızca op sabitler, yoklamada pin gelir, silinince düşer', async () => {
  const t = await adminTok(), a = await kisi('Pinci' + RUN), b = await kisi('Pinsiz' + RUN);
  const s = await post('say', { key: b.key, ch: 'genel', text: 'sabitlenecek ' + RUN });
  assert.equal((await post('op_pin', { key: b.key, ch: 'genel', id: s.id })).error, 'not_op');
  await post('admin_op', { t, user: a.me.id, op: 1 });
  assert.equal((await post('op_pin', { key: a.key, ch: 'genel', id: s.id })).ok, true);
  let p = await post('poll', { key: b.key, ch: 'genel', after: 0, users: 1 });
  assert.equal(p.pin.id, s.id);
  await post('admin_del', { t, id: s.id });
  p = await post('poll', { key: b.key, ch: 'genel', after: 0, users: 1 });
  assert.equal(p.pin, null);
  assert.ok('rozet' in p.users[0], 'kişilerde rozet alanı var');
  await post('op_pin', { key: a.key, ch: 'genel', id: 0 }); await post('admin_op', { t, user: a.me.id, op: 0 });
});

test('yönetimden eklenen yasaklı kelime mesajda yıldızlanır, rumuzda reddedilir', async () => {
  const t = await adminTok();
  assert.equal((await post('admin_words', { t, add: 'x y' })).error, 'bad_word');
  const w = 'zz' + RUN + 'kotu';
  const j = await post('admin_words', { t, add: w.toLocaleUpperCase('tr-TR') });
  assert.ok(j.words.includes(w)); assert.ok(j.base.includes('amk'));
  const a = await kisi('Kelimeci' + RUN);
  const s = await post('say', { key: a.key, ch: 'genel', text: 'bu ' + w + 'ler gitsin' });
  assert.equal(s.text, 'bu *** gitsin');
  const z = await kisi();
  assert.equal((await post('nick', { key: z.key, nick: w.slice(0, 16) })).error, 'bad_nick');
  assert.ok(!(await post('admin_words', { t, del: w })).words.includes(w));
});

test('cinsiyet: rumuzla seçilir, mesajda ve kişi listesinde gelir, sonradan değişir, geçersiz yok sayılır', async () => {
  const h = await post('hello', {});
  const n = await post('nick', { key: h.key, nick: 'Renkli' + RUN, g: 'k' });
  assert.equal(n.g, 'k');
  const s = await post('say', { key: h.key, ch: 'tavla', text: 'renk denemesi' });
  let p = await post('poll', { key: h.key, ch: 'tavla', after: s.id - 1, users: 1 });
  assert.equal(p.me.g, 'k'); assert.equal(p.msgs[0].g, 'k');
  assert.equal(p.users.find((u) => u.nick === 'Renkli' + RUN).g, 'k');
  assert.equal((await post('nick', { key: h.key, nick: 'Renkli' + RUN, g: 'e' })).g, 'e', 'aynı rumuzla yalnızca cinsiyet değişir');
  p = await post('poll', { key: h.key, ch: 'tavla', after: s.id - 1 });
  assert.equal(p.msgs[0].g, 'e', 'eski mesajın rengi de güncel');
  assert.equal((await post('nick', { key: h.key, nick: 'Renkli' + RUN, g: 'z' })).g, 'e');
  assert.equal(typeof p.me.op, 'number');
});

test('yönetici rumuzu op = 2 olur', async () => {
  const t = await adminTok(), a = await kisi();
  await post('admin_claim', { t, key: a.key, nick: 'Yonetici' + RUN });
  const p = await post('poll', { key: a.key, ch: 'genel', after: 0 });
  assert.equal(p.me.op, 2);
  const n = await post('nick', { key: a.key, nick: 'Yonetici' + RUN, g: 'k' });
  assert.equal(n.ok, true, 'ayrılmış rumuzla da cinsiyet değişir'); assert.equal(n.g, 'k');
});
