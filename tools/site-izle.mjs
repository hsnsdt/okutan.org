// Dışarıdan site izleme: bilgisayardaki zamanlanmış görev ("okutan site izleme") 5 dakikada bir çalıştırır.
// Sunucu tamamen giderse sunucudaki cron'lar haber veremez; bu betik siteye dışarıdan bakar, Telegram'a doğrudan yazar.
//   - Önce kendi internetini dener (yanlış alarm olmasın): internet yoksa hiçbir şey yapmaz.
//   - Bir adres üst üste 2 kontrolde (≈10 dk) açılmazsa "🔴 açılmıyor", düzelince "✅ düzeldi" (ne kadar sürdüğüyle).
// Ayar: tools/.site-izle.json {"token":"bot token","chat":"sohbet kimliği"} (depoya girmez, .gitignore).
// Durum: %LOCALAPPDATA%\okutan-site-izle.json
//   node tools/site-izle.mjs          → kontrol et, gerekirse bildir
//   node tools/site-izle.mjs --dene   → Telegram'a deneme mesajı
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(readFileSync(join(DIR, '.site-izle.json'), 'utf8'));
const STATE = join(process.env.LOCALAPPDATA || DIR, 'okutan-site-izle.json');
const ADRESLER = CFG.adresler || [
  ['https://okutan.org/', 'Sedat Okutan'],
  ['https://okutan.org/oyunlar/', 'Oyunlar'],
  ['https://okutan.org/okey/api/?a=top', '"ok"'],
];
const UA = 'okutan-site-izle/1.0';

async function getir(url, timeoutMs = 20000) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' }, redirect: 'follow' });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, status: 0, body: '', ms: Date.now() - t0, err: e.name === 'TimeoutError' ? 'zaman aşımı (20 sn)' : (e.cause?.code || e.message) }; }
}
async function telegram(text) {
  const r = await fetch(`https://api.telegram.org/bot${CFG.token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CFG.chat, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('Telegram HTTP ' + r.status);
}

async function main() {
  if (process.argv.includes('--dene')) { await telegram('okutan.org dış izleme: deneme mesajı (bilgisayardan). Site açılmazsa buraya yazacağım.'); console.log('gönderildi'); return; }
  // Kendi internetimiz var mı? (iki ayrı adres; ikisi de yoksa çık)
  const net = await getir('https://www.google.com/generate_204', 8000);
  const net2 = net.status === 204 ? net : await getir('https://cloudflare.com/cdn-cgi/trace', 8000);
  if (!(net.status === 204 || net2.ok)) { console.log(new Date().toISOString(), 'internet yok, atlandı'); return; }

  const st = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
  const msgs = [];
  for (const [url, beklenen] of ADRESLER) {
    const r = await getir(url);
    const iyi = r.ok && (!beklenen || r.body.includes(beklenen));
    const neden = r.err || (r.status && !r.ok ? 'HTTP ' + r.status : (!iyi ? 'beklenen içerik yok' : ''));
    const d = st[url] || { n: 0, since: Date.now(), sent: false };
    if (iyi) {
      if (d.sent) msgs.push(`✅ Düzeldi (dışarıdan): ${url} yeniden açılıyor (${Math.max(1, Math.round((Date.now() - d.since) / 60000))} dk sürdü).`);
      delete st[url];
    } else {
      d.n++;
      if (d.n >= 2 && !d.sent) { msgs.push(`🔴 Açılmıyor (dışarıdan): ${url} — ${neden} (${d.n} kontroldür)`); d.sent = true; }
      st[url] = d;
    }
    console.log(new Date().toISOString(), iyi ? 'tamam' : 'SORUN', url, r.status, r.ms + ' ms', neden);
  }
  if (msgs.length) await telegram('okutan.org\n' + msgs.join('\n'));
  writeFileSync(STATE, JSON.stringify(st));
}
main().catch(e => { console.error('HATA', e.message); process.exit(1); });
