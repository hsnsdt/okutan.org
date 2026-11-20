// Kelime Bulucu — kelime sayfaları için site haritaları (kelime-bulucu/sitemap-kelime-N.xml, en çok 45.000 adres).
// Kullanım: node tools/kelime-sitemap.mjs  (sozluk.txt'den okur; liste sayfalarına dokunmaz)
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const KB = createRequire(import.meta.url)(join(KOK, 'kelime-bulucu', 'motor.js'));
const DIZ = join(KOK, 'kelime-bulucu');
const BUGUN = process.env.TARIH || new Date().toISOString().slice(0, 10);
const kelimeler = KB.sozlukAc(readFileSync(join(DIZ, 'sozluk.txt'), 'utf8'));
for (const f of readdirSync(DIZ)) if (/^sitemap-kelime-\d+\.xml$/.test(f)) rmSync(join(DIZ, f));
const PARCA = 45000;
let n = 0;
for (let i = 0; i < kelimeler.length; i += PARCA) {
  n++;
  const urls = kelimeler.slice(i, i + PARCA).map(w => `  <url><loc>https://okutan.org/kelime-bulucu/kelime/${encodeURIComponent(w)}/</loc><lastmod>${BUGUN}</lastmod><changefreq>monthly</changefreq><priority>0.4</priority></url>`);
  writeFileSync(join(DIZ, `sitemap-kelime-${n}.xml`), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
}
console.log(kelimeler.length, 'kelime,', n, 'site haritası');
