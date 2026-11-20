// IndexNow: okutan.org sayfalarını Bing, Yandex ve diğer IndexNow arama motorlarına bildirir.
// Anahtar dosyası kökte: /610356dc09b83793bcbe941706bbe023.txt (önce sunucuya yüklenmeli).
// Kullanım: node tools/indexnow.mjs            → kelime bulucu site haritalarındaki bütün adresler
//           node tools/indexnow.mjs URL URL …  → yalnızca verilen adresler
// Bir istekte en çok 10.000 adres gider. Canlıda yalnızca sayfalar gerçekten değiştiğinde çalıştır.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = '610356dc09b83793bcbe941706bbe023';
const HOST = 'okutan.org';
let urls = process.argv.slice(2);
if (!urls.length) {
  for (const f of ['sitemap.xml', 'kelime-bulucu/sitemap.xml', 'kelime-bulucu/sitemap-kelime-1.xml', 'kelime-bulucu/sitemap-kelime-2.xml'])
    urls.push(...[...readFileSync(join(KOK, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
}
urls = [...new Set(urls)].filter(u => u.startsWith(`https://${HOST}/`));
console.log('adres', urls.length);
for (let i = 0; i < urls.length; i += 10000) {
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(i, i + 10000) }),
  });
  console.log(`${i + 1}–${Math.min(i + 10000, urls.length)}:`, r.status, r.statusText);
}
