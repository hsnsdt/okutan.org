// Ateş ve Su — bölüm üretici (siteye yüklenmez).
// İlk 6 bölüm elle yapılmıştır ve aynen korunur; 7–100 arası bölümler, kendi içinde çözülebilir parçaların
// soldan sağa dizilmesiyle üretilir ve her biri oyunun fizik motoruyla çalışan çözücüden geçer.
// Kullanım: node tools/ates-ve-su-bolumler.mjs   (ates-ve-su/bolumler.js dosyasını yeniden yazar)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const M = require('../ates-ve-su/motor.js');
const FILE = new URL('../ates-ve-su/bolumler.js', import.meta.url);
const COLS = 34, ROWS = 21, TOTAL = 100, HAND = 6;

// ---------- tohumlu rastgele ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

// ---------- harita kurucu ----------
class Lvl {
  constructor() {
    this.g = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => (y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1) ? '#' : '.'));
    this.plates = []; this.levers = []; this.movers = []; this.boxes = []; this.kinds = []; this.group = 0; this.colGy = [];
  }
  set(x, y, c) { if (x > 0 && x < COLS - 1 && y > 0 && y < ROWS - 1) this.g[y][x] = c; }
  ground(x, gy) { for (let y = gy; y < ROWS - 1; y++) this.set(x, y, '#'); this.colGy[x] = gy; }
  get(x, y) { return this.g[y][x]; }
}

// Her parça: (L, x, gy, r) → {w, gy}. gy: zeminin (katı karenin) satırı; karakter gy-1'de durur.
const SEG = {
  // karşılıklı havuzlar: biri yürür, öbürü zıplar
  pools(L, x, gy, r) {
    const a = int(r, 1, 3), b = int(r, 1, 3), first = r() < 0.5 ? 'L' : 'W', second = first === 'L' ? 'W' : 'L';
    let c = x; L.ground(c++, gy);
    for (let i = 0; i < a; i++) { L.ground(c, gy); L.set(c, gy, first); if (i === Math.floor(a / 2)) L.set(c, gy - 2, first === 'L' ? 'r' : 'b'); c++; }
    L.ground(c++, gy); L.ground(c++, gy);
    for (let i = 0; i < b; i++) { L.ground(c, gy); L.set(c, gy, second); if (i === Math.floor(b / 2)) L.set(c, gy - 2, second === 'L' ? 'r' : 'b'); c++; }
    L.ground(c++, gy);
    L.kinds.push('pools'); return { w: c - x, gy };
  },
  // asit: ikisi de zıplar
  acid(L, x, gy, r) {
    const a = int(r, 1, 2); let c = x; L.ground(c++, gy);
    for (let i = 0; i < a; i++) { L.ground(c, gy); L.set(c, gy, 'A'); c++; }
    L.ground(c++, gy); L.kinds.push('acid'); return { w: c - x, gy };
  },
  // basamak: 1–2 kare yukarı ya da aşağı
  step(L, x, gy, r) {
    let d = int(r, 1, 2) * (r() < 0.5 ? -1 : 1);
    if (gy - d < 9) d = Math.abs(d); if (gy - d > 19) d = -Math.abs(d);
    const ng = Math.max(9, Math.min(19, gy - d));
    L.ground(x, gy); L.ground(x + 1, ng); L.ground(x + 2, ng);
    L.kinds.push('step'); return { w: 3, gy: ng };
  },
  // havada taşlı platform
  ledge(L, x, gy, r) {
    for (let c = x; c < x + 5; c++) L.ground(c, gy);
    const py = gy - 3; if (py < 3) return SEG.flat(L, x, gy, r);
    for (let c = x + 1; c <= x + 3; c++) L.set(c, py, '#');
    L.set(x + 1, py - 1, 'r'); L.set(x + 3, py - 1, 'b');
    L.kinds.push('ledge'); return { w: 5, gy };
  },
  flat(L, x, gy) { for (let c = x; c < x + 2; c++) L.ground(c, gy); return { w: 2, gy }; },
  // düğmeli kapı: biri bu taraftaki düğmede bekler, öbürü geçip karşı düğmeye basar
  plateGate(L, x, gy, r) {
    if (gy < 10) return SEG.pools(L, x, gy, r);
    const g = ++L.group; for (let c = x; c < x + 9; c++) L.ground(c, gy);
    L.plates.push({ x: x + 1, y: gy - 1, g }, { x: x + 7, y: gy - 1, g });
    L.movers.push({ x: x + 4, y: gy - 4, w: 1, h: 4, dx: 0, dy: -4, g, sp: 220 });
    L.kinds.push('plateGate'); return { w: 9, gy };
  },
  // kollu kapı: kolu açan ikisine de yol açar
  leverGate(L, x, gy, r) {
    if (gy < 10) return SEG.acid(L, x, gy, r);
    const g = ++L.group; for (let c = x; c < x + 6; c++) L.ground(c, gy);
    L.levers.push({ x: x + 1, y: gy - 1, g });
    L.movers.push({ x: x + 4, y: gy - 4, w: 1, h: 4, dx: 0, dy: -4, g, sp: 220 });
    L.kinds.push('leverGate'); return { w: 6, gy };
  },
  // kutuyu düğmeye it: düğmenin hemen arkasındaki alçak taş kutuyu düğmede durdurur
  boxGate(L, x, gy, r) {
    if (gy < 10) return SEG.pools(L, x, gy, r);
    const g = ++L.group; for (let c = x; c < x + 10; c++) L.ground(c, gy);
    L.boxes.push({ x: x + 2, y: gy - 1 });
    L.plates.push({ x: x + 5, y: gy - 1, g });
    L.set(x + 6, gy - 1, '#');
    L.movers.push({ x: x + 8, y: gy - 4, w: 1, h: 4, dx: 0, dy: -4, g, sp: 220 });
    L.kinds.push('boxGate'); return { w: 10, gy };
  },
  // iki kollu asansörle yukarı kat: biri çıkar, kolla asansörü arkadaşına geri yollar
  lift(L, x, gy, r) {
    const R = int(r, 4, 6), ng = gy - 1 - R;
    if (ng < 7) return SEG.step(L, x, gy, r);
    const g = ++L.group;
    for (let c = x; c < x + 4; c++) L.ground(c, gy);
    for (let c = x + 4; c < x + 7; c++) L.ground(c, gy);
    for (let c = x + 7; c < x + 10; c++) L.ground(c, ng);
    L.levers.push({ x: x + 1, y: gy - 1, g }, { x: x + 8, y: ng - 1, g });
    L.movers.push({ x: x + 4, y: gy - 1, w: 3, h: 1, dx: 0, dy: -R, g, sp: 100 });
    L.kinds.push('lift'); return { w: 10, gy: ng };
  },
};

// dünya başına izin verilen parçalar ve parça sayısı
function plan(n, r) {
  const world = Math.floor((n - 1) / 20);
  const easy = ['pools', 'pools', 'step', 'ledge', 'acid'];
  const mech = [['plateGate', 'leverGate'], ['plateGate', 'leverGate', 'boxGate'], ['plateGate', 'leverGate', 'boxGate', 'lift'],
    ['plateGate', 'leverGate', 'boxGate', 'lift', 'lift'], ['plateGate', 'boxGate', 'lift', 'lift', 'leverGate']][world];
  const nMech = Math.min(3, [1, 1, 2, 2, 3][world] + (r() < 0.35 ? 1 : 0));
  const nEasy = [2, 3, 3, 3, 3][world] + int(r, 0, 1);
  const list = [];
  for (let i = 0; i < nMech; i++) list.push(pick(r, mech));
  for (let i = 0; i < nEasy; i++) list.push(pick(r, easy));
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  if (world >= 2 && !list.includes('lift') && r() < 0.6) list.splice(int(r, 0, list.length), 0, 'lift');
  return list;
}

function build(n, seed) {
  const r = rng(seed), L = new Lvl();
  let x = 1, gy = 19;
  for (let c = 1; c <= 4; c++) L.ground(c, gy);
  L.set(2, gy - 1, 'k'); L.set(3, gy - 1, 'd'); x = 5;
  for (const k of plan(n, r)) {
    const need = { pools: 10, acid: 4, step: 3, ledge: 5, plateGate: 9, leverGate: 6, boxGate: 10, lift: 10 }[k];
    if (x + need > COLS - 1 - 6) continue;
    const res = SEG[k](L, x, gy, r); x += res.w; gy = res.gy;
  }
  // bitiş: kapılar arasında bir kare boşluk
  while (x < COLS - 1) { L.ground(x, gy); x++; }
  L.set(COLS - 6, gy - 1, 'K'); L.set(COLS - 4, gy - 1, 'D');
  // taş garantisi: iki karakter için de en az bir taş (düz zeminin 2 kare üstüne)
  for (const ch of ['r', 'b']) {
    if (L.g.some(row => row.includes(ch))) continue;
    for (let t = 0; t < 60; t++) {
      const cx = int(r, 5, COLS - 8), cg = L.colGy[cx];
      if (cg && L.get(cx, cg - 2) === '.' && L.get(cx, cg - 1) === '.' && L.get(cx, cg) === '#' && L.get(cx, cg - 3) === '.') { L.set(cx, cg - 2, ch); break; }
    }
  }
  // mağara tavanı: her sütunda zeminin 9 kare üstünden yukarısı kaya (kapı kayma, asansör ve zıplama payı korunur)
  for (let c = 1; c < COLS - 1; c++) {
    const cg = L.colGy[c] || 19, low = Math.min(cg, L.colGy[c - 1] || cg, L.colGy[c + 1] || cg);
    const cut = low - 9 - (r() < 0.35 ? 1 : 0);
    for (let y = 1; y <= cut; y++) if (L.get(c, y) === '.') L.set(c, y, '#');
  }
  return L;
}

// ---------- adlar ve ipuçları ----------
const WORLDS = ['Mağara', 'Kristal', 'Volkan', 'Derinlik', 'Çekirdek'];
const ADJ = ['Sessiz', 'Kızıl', 'Derin', 'Gizli', 'Eski', 'Dar', 'Uzun', 'Yankılı', 'Karanlık', 'Parlak', 'Sisli', 'Dolambaçlı', 'Sıcak', 'Serin', 'Unutulmuş', 'Taşlı', 'Yıldızlı', 'Kayıp', 'Çatlak', 'Yüksek'];
const NOUN = { 0: ['Geçit', 'Dehliz', 'Oyuk', 'Koridor', 'Yol', 'Kuyu'], 1: ['Mağara', 'Salon', 'Damar', 'Galeri', 'Oda', 'Köprü'], 2: ['Ağız', 'Kanal', 'Ocak', 'Yamaç', 'Çukur', 'Kazan'],
  3: ['Dip', 'Uçurum', 'Labirent', 'Kat', 'Tünel', 'Boşluk'], 4: ['Çekirdek', 'Kalp', 'Ocak', 'Kapı', 'Merkez', 'Sınır'] };
const TIPS = {
  plateGate: 'Biri düğmede beklerken öbürü kapıdan geçsin; sonra karşıdaki düğmeye basıp arkadaşını geçirsin.',
  leverGate: 'Kolu açmak için üstünden sağa yürü; kapı açık kalır.',
  boxGate: 'Kutuyu düğmeye kadar it; arkasındaki taş onu düğmede durdurur.',
  lift: 'Asansör iki kolla çalışır: biri yukarı çıksın, yukarıdaki kolla asansörü arkadaşına geri yollasın.',
  acid: 'Mor asit ikinizi de yakar; üstünden zıplayın.',
  pools: 'Ateş lavda, Su suda yürür; karşı tarafın havuzunun üstünden zıplayın.',
};

// ---------- çözücü (testlerdekiyle aynı mantık) ----------
function clone(w) {
  const c = Object.assign({}, w);
  c.p = {}; for (const k in w.p) c.p[k] = Object.assign({}, w.p[k]);
  c.boxes = w.boxes.map(b => Object.assign({}, b)); c.gems = w.gems.map(g => Object.assign({}, g));
  c.levers = w.levers.map(l => Object.assign({}, l)); c.plates = w.plates.map(p => Object.assign({}, p)); c.movers = w.movers.map(m => Object.assign({}, m));
  return c;
}
const ACTS = [[{ l: true }, 8], [{ r: true }, 8], [{}, 8], [{ u: true }, 22], [{ u: true, l: true }, 22], [{ u: true, r: true }, 22], [{ u: true, r: true }, 8], [{ u: true, l: true }, 8]];
function reach(level, c, limit) {
  const w0 = M.create(level); delete w0.p[c === 'k' ? 'd' : 'k'];
  const groups = [...new Set([...(level.plates || []), ...(level.levers || []), ...(level.movers || [])].map(x => x.g))];
  w0.force = {}; for (let i = 0; i < 10; i++) M.step(w0, {});
  const seen = new Set(), q = [w0], gems = new Set(); let door = false, n = 0;
  const acts = ACTS.map(a => ({ a })).concat(groups.map(g => ({ g })));
  while (q.length && n < limit) {
    const w = q.shift(); n++;
    for (const act of acts) {
      const v = clone(w);
      if (act.g !== undefined) { v.force = Object.assign({}, v.force); v.force[act.g] = !v.force[act.g]; for (let i = 0; i < 20; i++) M.step(v, {}); }
      else for (let i = 0; i < act.a[1]; i++) { M.step(v, { [c]: act.a[0] }); if (v.dead) break; }
      for (let i = 0; i < 40 && !v.p[c].ground && !v.dead; i++) M.step(v, {});
      if (v.dead) continue;
      const p = v.p[c]; v.gems.forEach(g => { if (g.got) gems.add(g.id); }); if (p.atDoor) door = true;
      if (door && w0.gems.filter(g => g.c === c).every(g => gems.has(g.id))) return true;
      const key = Math.round(p.x / 8) + ',' + Math.round(p.y / 8) + '|' + v.movers.map(m => Math.round(m.s * 4)).join('') + v.boxes.map(b => Math.round(b.x / 16)).join(',');
      if (seen.has(key)) continue; seen.add(key); q.push(v);
    }
  }
  return false;
}
const solvable = lv => ['k', 'd'].every(c => reach(lv, c, 40000));

// ---------- üret ----------
const src = fs.readFileSync(FILE, 'utf8');
const a = src.indexOf('[\n  {'), b = src.lastIndexOf(']');
const hand = JSON.parse(src.slice(a, b + 1)).slice(0, HAND);
const out = hand.slice(), used = new Set(hand.map(l => l.name));
for (let n = HAND + 1; n <= TOTAL; n++) {
  let lv = null;
  for (let attempt = 0; attempt < 40 && !lv; attempt++) {
    const L = build(n, n * 7919 + attempt * 104729);
    const world = Math.floor((n - 1) / 20), rn = rng(n * 31 + attempt);
    let name; do name = pick(rn, ADJ) + ' ' + pick(rn, NOUN[world]); while (used.has(name));
    const first = L.kinds.find(k => TIPS[k] && !out.some(o => (o.kinds || []).includes(k)));
    const mech = L.kinds.find(k => ['lift', 'boxGate', 'plateGate', 'leverGate'].includes(k));
    const ipucu = TIPS[first || mech || 'pools'];
    const par = 14 + L.kinds.reduce((s, k) => s + ({ pools: 4, acid: 2, step: 2, ledge: 4, plateGate: 10, leverGate: 5, boxGate: 10, lift: 14 }[k] || 3), 0);
    const cand = { name, ipucu, par, map: L.g.map(r => r.join('')), kinds: L.kinds };
    for (const k of ['plates', 'levers', 'movers', 'boxes']) if (L[k].length) cand[k] = L[k];
    if (solvable(cand)) { lv = cand; used.add(name); }
    else process.stdout.write('  ' + n + ': deneme ' + attempt + ' çözülemedi\n');
  }
  if (!lv) throw new Error('Bölüm ' + n + ' üretilemedi');
  out.push(lv);
  process.stdout.write(n + ' ' + lv.name + ' [' + lv.kinds.join(', ') + ']\n');
}
const body = out.map(l => { const o = Object.assign({}, l); delete o.kinds; return '  ' + JSON.stringify(o); }).join(',\n');
fs.writeFileSync(FILE, src.slice(0, a) + '[\n' + body + '\n' + src.slice(b), 'utf8');
console.log('yazıldı:', out.length, 'bölüm');
