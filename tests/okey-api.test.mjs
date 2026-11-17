// 101 Okey API testleri (yerelde PHP + MySQL açıkken):
//   BASE=http://127.0.0.1:8765/101-okey node --test tests/okey-api.test.mjs
// Canlı sitede ÇALIŞTIRMA (kayıt açar).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.BASE || 'http://127.0.0.1:8765/101-okey').replace(/\/$/, '');
const API = BASE + '/api/';
const RUN = Date.now().toString(36).slice(-5);
const post = (a, b = {}) => fetch(`${API}?a=${a}`, { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const get = (a, q = '') => fetch(`${API}?a=${a}${q}`).then((r) => r.json());
function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }

test('sıralama ucu çalışır', async () => {
  const j = await get('top');
  assert.equal(j.ok, true); assert.ok(Array.isArray(j.week) && Array.isArray(j.all) && Array.isArray(j.daily));
});

test('günlük el tohumu istemciyle aynı', async () => {
  const s = await post('start', { mode: 'daily' });
  assert.equal(s.ok, true); assert.equal(s.seed, fnv1a('okey-' + s.day));
});

test('çok hızlı biten oyun reddedilir', async () => {
  const s = await post('start', { mode: 'bot' });
  const j = await post('submit', { token: s.token, name: 'TestHiz' + RUN, mode: 'bot', level: 'hard', hands: 5, total: -500, won: true });
  assert.equal(j.error, 'too_fast');
});

test('online masa: kur, katıl, başlat, hamle ilet, durum al', async () => {
  const host = await post('t_create', { name: 'Ev' + RUN, opts: { hands: 1 } });
  assert.equal(host.ok, true); assert.match(host.code, /^[A-Z0-9]{6}$/);
  const guest = await post('t_join', { code: host.code, name: 'Misafir' + RUN });
  assert.equal(guest.ok, true); assert.equal(guest.seat, 1);
  assert.equal((await post('t_join', { code: host.code, name: 'Misafir' + RUN })).error, 'name_taken');
  const lob = await get('t_lobby', '&code=' + host.code);
  assert.equal(lob.seats[1].name, 'Misafir' + RUN);
  assert.equal((await post('t_start', { code: host.code, hostKey: 'yanlis' })).error, 'unauthorized');
  const started = await post('t_start', { code: host.code, hostKey: host.hostKey });
  assert.equal(started.seats[2].bot, true);
  assert.equal((await post('t_join', { code: host.code, name: 'Gec' + RUN })).error, 'started');
  // masa sahibi durumu yayınlar; misafir yalnızca kendi elini görür
  await post('t_state', { code: host.code, hostKey: host.hostKey, ver: 1, pub: { turn: 1, phase: 'draw' }, priv: { 1: { hand: [{ id: 5, c: 'k', n: 3 }] }, 3: { hand: [{ id: 9, c: 'm', n: 1 }] } } });
  const p = await post('t_poll', { code: host.code, seat: 1, seatKey: guest.seatKey, ver: 0 });
  assert.equal(p.pub.turn, 1); assert.deepEqual(p.priv.hand, [{ id: 5, c: 'k', n: 3 }]);
  assert.equal((await post('t_poll', { code: host.code, seat: 1, seatKey: 'yanlis', ver: 0 })).error, 'unauthorized');
  // misafir hamlesi masa sahibine ulaşır
  await post('t_move', { code: host.code, seat: 1, seatKey: guest.seatKey, move: { a: 'draw', side: false } });
  const mv = await post('t_moves', { code: host.code, hostKey: host.hostKey, after: 0 });
  assert.equal(mv.moves.length, 1); assert.deepEqual(mv.moves[0].move, { a: 'draw', side: false });
});
