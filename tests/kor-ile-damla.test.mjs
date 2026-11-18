// Kor ile Damla motor testleri: node --test tests/kor-ile-damla.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../kor-ile-damla/motor.js');
const LV = require('../kor-ile-damla/bolumler.js');

const T = M.T;
function run(w, inputs, frames) { for (let i = 0; i < frames; i++) M.step(w, typeof inputs === 'function' ? inputs(i) : inputs); }
function flat(rows) { // küçük test haritası: 34 sütuna ve 21 satıra tamamlanır
  const map = rows.map(r => (r + '#'.repeat(34)).slice(0, 34));
  while (map.length < 21) map.unshift('#' + '.'.repeat(32) + '#');
  return map;
}
const FLOOR = '#'.repeat(34);

test('bölümler: 34×21, birer başlangıç ve kapı', () => {
  assert.ok(LV.length >= 6);
  for (const l of LV) {
    assert.equal(l.map.length, M.ROWS, l.name);
    for (const r of l.map) assert.equal([...r].length, M.COLS, l.name);
    const all = l.map.join('');
    for (const ch of 'kdKD') assert.equal(all.split(ch).length - 1, 1, l.name + ' ' + ch);
    assert.ok(l.ipucu && l.par > 0);
  }
});

test('yerçekimi, yürüme ve zıplama yüksekliği', () => {
  const w = M.create({ map: flat(['#..k......d.....', FLOOR]) });
  run(w, {}, 30);
  const p = w.p.k, floorY = (M.ROWS - 1) * T;
  assert.ok(p.ground); assert.equal(p.y + p.h, floorY);
  const x0 = p.x; run(w, { k: { r: true } }, 30);
  assert.ok(p.x - x0 > 80 && p.x - x0 < 110, 'yarım saniyede yaklaşık 100 px');
  let top = p.y; run(w, i => ({ k: { u: true } }), 40); // basılı tutunca tam zıplama
  const w2 = M.create({ map: flat(['#..k......d.....', FLOOR]) }); run(w2, {}, 20);
  const y0 = w2.p.k.y; let minY = y0;
  for (let i = 0; i < 60; i++) { M.step(w2, { k: { u: true } }); minY = Math.min(minY, w2.p.k.y); }
  const h = y0 - minY;
  assert.ok(h > 80 && h < 96, 'zıplama ~2,9 kare: ' + h);
  assert.ok(top <= p.y + 1);
});

test('Kor lavda yürür, suda ölür; Damla tersi; asit ikisini de yakar', () => {
  const base = (row) => M.create({ map: flat(['#.kd.............', row]) });
  let w = base('##LLLLLLLLLLLLLLLLL#################'); run(w, {}, 30);
  assert.equal(w.dead && w.dead.c, 'd'); assert.ok(!w.p.k.dead);
  w = base('##WWWWWWWWWWWWWWWWW#################'); run(w, {}, 30);
  assert.equal(w.dead && w.dead.c, 'k');
  w = M.create({ map: flat(['#.k...............', '##AAAA##################']) }); run(w, {}, 30);
  assert.equal(w.dead && w.dead.c, 'k');
  // lavda yürüyen Kor biraz batar (sıvı yüzeyi karenin 12 px altında)
  w = M.create({ map: flat(['#.k........d.....', '##LLLLLL##########']) }); run(w, {}, 30);
  assert.equal(w.p.k.y + w.p.k.h, (M.ROWS - 1) * T + M.LIQ);
});

test('taşları yalnızca sahibi toplar', () => {
  const w = M.create({ map: flat(['#.k.b.r..d.......', FLOOR]) });
  run(w, { k: { r: true } }, 40);
  const [b, r] = w.gems;
  assert.equal(b.got, false); assert.equal(r.got, true);
});

test('düğme kapıyı açar, bırakınca kapanır', () => {
  const lv = { map: flat(['#.k.......d.......', FLOOR]), plates: [{ x: 5, y: 19, g: 1 }], movers: [{ x: 12, y: 16, w: 1, h: 3, dx: 0, dy: -3, g: 1, sp: 300 }] };
  lv.plates[0].y = M.ROWS - 2;
  const w = M.create(lv); run(w, {}, 10);
  assert.ok(!w.groups[1]);
  run(w, { k: { r: true } }, 22); run(w, {}, 40); // Kor düğmeye yürür
  assert.ok(w.plates[0].on, 'Kor düğmede'); assert.ok(w.groups[1]);
  assert.ok(w.movers[0].s > 0.99, 'kapı tamamen açıldı');
  run(w, { k: { r: true } }, 30); run(w, {}, 60);
  assert.ok(!w.groups[1]); assert.ok(w.movers[0].s < 0.01, 'kapı kapandı');
});

test('kol: sağa yürüyünce açılır, sola yürüyünce kapanır; iki kol iki yönlü anahtar gibi', () => {
  const lv = { map: flat(['#.k................d', FLOOR]), levers: [{ x: 5, y: M.ROWS - 2, g: 1 }, { x: 12, y: M.ROWS - 2, g: 1 }] };
  const w = M.create(lv); run(w, {}, 5);
  run(w, { k: { r: true } }, 25);
  assert.ok(w.levers[0].on); assert.ok(w.groups[1]);
  for (let i = 0; i < 200 && !w.levers[1].on; i++) M.step(w, { k: { r: true } });
  M.step(w, {});
  assert.ok(w.levers[1].on); assert.ok(!w.groups[1], 'iki açık kol: kapalı');
  for (let i = 0; i < 200 && w.levers[1].on; i++) M.step(w, { k: { l: true } });
  M.step(w, {});
  assert.ok(!w.levers[1].on); assert.ok(w.groups[1]);
});

test('kutu itilir, düğmeyi basılı tutar', () => {
  const lv = { map: flat(['#.k.................d', FLOOR]), boxes: [{ x: 5, y: M.ROWS - 2 }], plates: [{ x: 9, y: M.ROWS - 2, g: 1 }] };
  const w = M.create(lv); run(w, {}, 10);
  const bx = w.boxes[0].x;
  run(w, { k: { r: true } }, 60); run(w, {}, 10);
  assert.ok(w.boxes[0].x > bx + 60, 'kutu ilerledi');
  run(w, { k: { l: true } }, 50); run(w, {}, 30);
  // kutuyu tam düğmeye getir
  const w2 = M.create(lv); run(w2, {}, 5);
  for (let i = 0; i < 400 && !w2.plates[0].on; i++) M.step(w2, { k: { r: true } });
  assert.ok(w2.plates[0].on);
  run(w2, { k: { l: true } }, 60);
  assert.ok(w2.plates[0].on, 'Kor gidince de kutu düğmeyi tutar');
});

test('asansör üstündekini taşır', () => {
  const lv = { map: flat(['#..........d......', FLOOR]), movers: [{ x: 3, y: M.ROWS - 2, w: 3, h: 1, dx: 0, dy: -5, g: 1, sp: 120 }] };
  lv.map[M.ROWS - 4] = (lv.map[M.ROWS - 4].slice(0, 4) + 'k' + lv.map[M.ROWS - 4].slice(5));
  const w = M.create(lv); run(w, {}, 40);
  const y0 = w.p.k.y; w.force = { 1: true }; run(w, {}, 120);
  assert.ok(y0 - w.p.k.y > 150, 'Kor asansörle yükseldi'); assert.ok(w.p.k.ground);
});

test('ikisi de kapısındayken bölüm biter', () => {
  const w = M.create({ map: flat(['#.k.K......d.D...', FLOOR]) });
  for (let i = 0; i < 200 && !w.won; i++) M.step(w, { k: { r: !w.p.k.atDoor }, d: { r: !w.p.d.atDoor } });
  assert.ok(w.won);
  assert.equal(M.stars(w), 3);
});

// ---- Çözülebilirlik: her karakter, düzenekler açık/kapalı sabitken kapısına ulaşabiliyor mu ----
function clone(w) {
  const c = Object.assign({}, w);
  c.p = {}; for (const k in w.p) c.p[k] = Object.assign({}, w.p[k]);
  c.boxes = w.boxes.map(b => Object.assign({}, b));
  c.gems = w.gems.map(g => Object.assign({}, g));
  c.levers = w.levers.map(l => Object.assign({}, l));
  c.plates = w.plates.map(p => Object.assign({}, p));
  c.movers = w.movers.map(m => Object.assign({}, m));
  return c;
}
const ACTS = [[{ l: true }, 8], [{ r: true }, 8], [{}, 8], [{ u: true }, 22], [{ u: true, l: true }, 22], [{ u: true, r: true }, 22], [{ u: true, r: true }, 8], [{ u: true, l: true }, 8]];
// Tek karakter arar; öbür oyuncunun yardımı, herhangi bir grubu istediği an açıp kapatabilmek olarak modellenir.
function reach(level, c) {
  const w0 = M.create(level); delete w0.p[c === 'k' ? 'd' : 'k'];
  const groups = [...new Set([...(level.plates || []), ...(level.levers || []), ...(level.movers || [])].map(x => x.g))];
  w0.force = {}; run(w0, {}, 10);
  const seen = new Set(), q = [w0], gems = new Set(); let door = false, n = 0;
  const acts = ACTS.map(a => ({ a })).concat(groups.map(g => ({ g })));
  while (q.length && n < 25000) {
    const w = q.shift(); n++;
    for (const act of acts) {
      const v = clone(w);
      if (act.g !== undefined) { v.force = Object.assign({}, v.force); v.force[act.g] = !v.force[act.g]; for (let i = 0; i < 20; i++) M.step(v, {}); }
      else for (let i = 0; i < act.a[1]; i++) { M.step(v, { [c]: act.a[0] }); if (v.dead) break; }
      for (let i = 0; i < 40 && !v.p[c].ground && !v.dead; i++) M.step(v, {});
      if (v.dead) continue;
      const p = v.p[c];
      v.gems.forEach(g => { if (g.got) gems.add(g.id); });
      if (p.atDoor) door = true;
      const key = Math.round(p.x / 8) + ',' + Math.round(p.y / 8) + '|' + v.movers.map(m => Math.round(m.s * 4)).join('') + v.boxes.map(b => Math.round(b.x / 16)).join(',');
      if (seen.has(key)) continue; seen.add(key); q.push(v);
    }
  }
  return { door, gems, mine: w0.gems.filter(g => g.c === c).map(g => g.id), n };
}
for (const lv of LV) {
  test('çözülebilir: ' + lv.name, () => {
    for (const c of ['k', 'd']) {
      const r = reach(lv, c);
      assert.ok(r.door, lv.name + ': ' + c + ' kapısına ulaşamıyor (' + r.n + ' durum)');
      for (const id of r.mine) assert.ok(r.gems.has(id), lv.name + ': ' + c + ' taş ' + id + ' alınamıyor');
    }
  });
}
