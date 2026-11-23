// Canlı Sohbet motor testleri: node --test tests/sohbet.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('../sohbet/motor.js');

test('düz mesaj ve // kaçışı', () => {
  assert.deepEqual(M.komut('selam'), { t: 'say', text: 'selam' });
  assert.deepEqual(M.komut('//me değil'), { t: 'say', text: '/me değil' });
  assert.equal(M.komut('   ').t, 'bos');
});

test('/me, /nick, /join, /away, /clear, /yardim', () => {
  assert.deepEqual(M.komut('/me çay koyuyor'), { t: 'me', text: 'çay koyuyor' });
  assert.equal(M.komut('/me').t, 'hata');
  assert.deepEqual(M.komut('/nick  Ali   Veli '), { t: 'nick', nick: 'Ali Veli' });
  assert.equal(M.komut('/nick a').t, 'hata');
  assert.equal(M.komut('/nick <script>').t, 'hata');
  assert.deepEqual(M.komut('/join #OKEY'), { t: 'join', ch: 'okey' });
  assert.deepEqual(M.komut('/j tavla'), { t: 'join', ch: 'tavla' });
  assert.equal(M.komut('/join #yok').t, 'hata');
  assert.deepEqual(M.komut('/away yemekteyim'), { t: 'away', reason: 'yemekteyim' });
  assert.deepEqual(M.komut('/back'), { t: 'away', reason: '', back: true });
  assert.equal(M.komut('/CLEAR').t, 'clear');
  assert.equal(M.komut('/yardım').t, 'help');
  assert.equal(M.komut('/olmayan').t, 'hata');
});

test('/sustur dakikayı 1–60 arasında tutar', () => {
  assert.deepEqual(M.komut('/sustur Ali Veli 15'), { t: 'mute', nick: 'Ali Veli', min: 15 });
  assert.deepEqual(M.komut('/sustur Ali'), { t: 'mute', nick: 'Ali', min: 10 });
  assert.equal(M.komut('/sustur Ali 999').min, 60);
});

test('rumuz kuralı', () => {
  for (const n of ['Al', 'Işıl', 'Çağrı_34', 'ali.veli', 'Sedat O']) assert.ok(M.rumuzGecerli(n), n);
  for (const n of ['a', '_ali', 'x'.repeat(17), 'ali<b>', '-', 'a‮b']) assert.ok(!M.rumuzGecerli(n), n);
});

test('rumuz rengi büyük/küçük harften bağımsız ve 0–9', () => {
  assert.equal(M.renk('IŞIK'), M.renk('ışık'));
  for (const n of ['a', 'Ali', 'Zeynep', 'x y']) { const r = M.renk(n); assert.ok(r >= 0 && r <= 9); }
});

test('adı geçince: kelime sınırı ve Türkçe harf', () => {
  assert.ok(M.bahsediyor('selam ışık nasılsın', 'Işık'));
  assert.ok(M.bahsediyor('ALİ: gel', 'ali'));
  assert.ok(!M.bahsediyor('alisveris', 'Ali'));
  assert.ok(!M.bahsediyor('kalinti', 'ali'));
  assert.ok(M.bahsediyor('Ali Veli, bak', 'Ali Veli'));
});

test('davet bağlantısı karta dönüşür, diğer okutan.org bağlantıları bağlantı olur', () => {
  const p = M.parcala('gelin https://okutan.org/okey/?masa=ab3d9k hemen');
  assert.deepEqual(p.map((x) => x.t), ['text', 'davet', 'text']);
  assert.equal(p[1].kod, 'AB3D9K'); assert.equal(p[1].ad, 'Okey'); assert.equal(p[1].href, '/okey/?masa=AB3D9K');
  const q = M.parcala('okutan.org/101-okey/?masa=XYZ234.');
  assert.equal(q[0].t, 'davet'); assert.equal(q[0].ad, '101 Okey'); assert.equal(q[1].v, '.');
  const r = M.parcala('bak: okutan.org/kelime-bulucu/kelime/cicek/');
  assert.equal(r[1].t, 'link'); assert.equal(r[1].href, 'https://okutan.org/kelime-bulucu/kelime/cicek/');
  assert.equal(M.parcala('sahteokutan.org/x').length, 1);
  assert.equal(M.parcala('okutan.org/bilinmeyen/?masa=AAAAAA')[0].t, 'link');
});

test('kişi listesi farkı', () => {
  const f = M.farklar([{ id: 1, nick: 'A' }, { id: 2, nick: 'B' }], [{ id: 2, nick: 'B2' }, { id: 3, nick: 'C' }]);
  assert.deepEqual(f, { gelen: ['C'], giden: ['A'] });
});

test('Tab tamamlama sırayla döner', () => {
  const l = ['Ayşe', 'ali', 'Ahmet', 'Zeki'];
  assert.equal(M.tamamla('a', l, 0), 'Ahmet');
  assert.equal(M.tamamla('a', l, 1), 'ali');
  assert.equal(M.tamamla('a', l, 3), 'Ahmet');
  assert.equal(M.tamamla('q', l, 0), null);
});

test('kanal adları sunucudakiyle aynı', async () => {
  const fs = await import('node:fs');
  const php = fs.readFileSync(new URL('../sohbet/api/index.php', import.meta.url), 'utf8');
  const m = /const KANALLAR = \[([^\]]+)\]/.exec(php);
  assert.ok(m, 'PHP KANALLAR bulunamadı');
  const phpList = m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(phpList, M.KANALLAR.map((k) => k.id));
});
