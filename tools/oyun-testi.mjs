// Canlıda uçtan uca oyun testi: her oyunu gerçek (headless) Chrome'da açar; sayfa açılıyor mu, oyun dosyaları yükleniyor mu,
// oyun alanı çiziliyor mu, JavaScript hatası var mı bakar. Sonucu yönetim paneline gönderir (admin/cron/e2e.php).
// Harici paket yok: Chrome'un uzaktan hata ayıklama protokolü (CDP) ve Node'un yerleşik WebSocket'i (Node 22+).
//   node tools/oyun-testi.mjs              → test et ve panele gönder
//   node tools/oyun-testi.mjs --gonderme   → yalnızca ekrana yaz
// Anahtar: tools/.oyun-testi.json  {"site":"https://okutan.org","key":"CRON_KEY"}  (depoya girmez, .gitignore)
// Headless Chrome'un kimliğinde "HeadlessChrome" geçtiği için sayaç ve Google bu ziyaretleri saymaz.
// Windows zamanlanmış görevi: "okutan oyun testi" (her gece 04:45; bilgisayar kapalıysa o gün atlanır).
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const CFG = JSON.parse(readFileSync(join(DIR, '.oyun-testi.json'), 'utf8'));
const SITE = (CFG.site || 'https://okutan.org').replace(/\/$/, '');
const CHROME = CFG.chrome || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const GONDERME = process.argv.includes('--gonderme');

// oyun anahtarı (panelde GAMES ile aynı) → adres ve "oyun alanı hazır" denetimi (tarayıcıda çalışır, true/false ya da açıklama döner)
const OYUNLAR = [
  ['okey', '/okey/', `!!document.querySelector('#board')`],
  ['okey101', '/101-okey/', `!!document.querySelector('#board')`],
  ['batak', '/batak/', `!!document.querySelector('#board')`],
  ['king', '/king/', `!!document.querySelector('#board')`],
  ['pisti', '/pisti/', `!!document.querySelector('#board')`],
  ['tavla', '/tavla/', `!!document.querySelector('#board')`],
  ['atesvesu', '/ates-ve-su/', `(function(){var c=document.querySelector('canvas#cv');return !!c&&c.width>0&&c.getBoundingClientRect().width>0})()`],
  ['balon', '/balon/', `(function(){var c=document.querySelector('canvas#cv');return !!c&&c.width>0&&c.getBoundingClientRect().width>0})()`],
  ['sudoku', '/sudoku/', `document.querySelectorAll('#grid .cell').length === 81 || ('karesi: ' + document.querySelectorAll('#grid .cell').length)`],
  ['gizlikelime', '/gizli-kelime/', `document.querySelectorAll('#board *').length >= 30 || ('kutusu: ' + document.querySelectorAll('#board *').length)`],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  if (!CHROME) throw new Error('Chrome bulunamadı (tools/.oyun-testi.json → "chrome" ile yol ver).');
  const prof = mkdtempSync(join(tmpdir(), 'okutan-e2e-'));
  const port = 9333 + Math.floor(Math.random() * 500);
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,900', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  let ws, id = 0;
  const wait = new Map(), events = [];
  try {
    let tabs;
    for (let i = 0; i < 50; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (tabs.length) break; } catch {} await sleep(200); }
    const page = tabs.find(t => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method) events.push(d); };
    const send = (method, params = {}) => new Promise(res => { const i = ++id; wait.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

    const results = [];
    for (const [oyun, path, check] of OYUNLAR) {
      events.length = 0;
      const t0 = Date.now();
      let hata = '';
      try {
        const nav = await send('Page.navigate', { url: SITE + path });
        if (nav.result?.errorText) throw new Error('açılmadı: ' + nav.result.errorText);
        for (let i = 0; i < 100 && !events.some(e => e.method === 'Page.loadEventFired'); i++) await sleep(150);
        await sleep(4000); // oyunun kendini kurması
        const doc = events.find(e => e.method === 'Network.responseReceived' && e.params.type === 'Document');
        if (doc && doc.params.response.status >= 400) throw new Error('HTTP ' + doc.params.response.status);
        const bad = events.filter(e => e.method === 'Network.responseReceived' && ['Script', 'Stylesheet'].includes(e.params.type) && e.params.response.url.startsWith(SITE) && e.params.response.status >= 400)
          .map(e => e.params.response.status + ' ' + e.params.response.url.replace(SITE, ''));
        if (bad.length) throw new Error('dosya yüklenmedi: ' + bad.join(', '));
        const ex = events.filter(e => e.method === 'Runtime.exceptionThrown').map(e => (e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text || '').split('\n')[0]);
        if (ex.length) throw new Error('JS hatası: ' + ex.slice(0, 2).join(' | '));
        const r = await send('Runtime.evaluate', { expression: check, returnByValue: true });
        const v = r.result?.result?.value;
        if (v !== true) throw new Error('oyun alanı çizilmedi' + (typeof v === 'string' ? ' (' + v + ')' : ''));
      } catch (e) { hata = String(e.message || e).slice(0, 280); }
      results.push({ oyun, ok: !hata, ms: Date.now() - t0, hata });
      console.log((hata ? 'BOZUK  ' : 'tamam  ') + oyun.padEnd(12) + String(Date.now() - t0).padStart(6) + ' ms  ' + hata);
    }
    if (!GONDERME) {
      const r = await fetch(`${SITE}/admin/cron/e2e.php?key=${encodeURIComponent(CFG.key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ results }) });
      console.log('panele gönderildi:', r.status, await r.text());
    }
    return results.every(r => r.ok) ? 0 : 1;
  } finally {
    try { ws?.close(); } catch {}
    ch.kill();
    await sleep(500);
    try { rmSync(prof, { recursive: true, force: true }); } catch {}
  }
}
main().then(c => process.exit(c), e => { console.error('HATA', e.message); process.exit(2); });
