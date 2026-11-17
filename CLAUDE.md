# okutan.org — çalışma notları

Sedat Okutan'ın kişisel sitesi ve tarayıcı oyunları. Statik HTML/CSS/vanilla JS; oyunların sunucu tarafı PHP 8 + MySQL (cPanel, Apache). Framework ve derleme adımı yok. Ayrıntılı dosya listesi `README.md` içinde.

## Kesin kurallar
- Sitede ve metinlerde ad olarak yalnızca **"Sedat Okutan"** kullanılır.
- Oyun özellikleri için Kelimeler'in Firebase arka ucuna dokunulmaz; site statik kalır.
- `balon/api/config.php` (veritabanı şifreleri, `admin_pass`) **asla commit edilmez**. Her commit öncesi `git diff --cached --name-only | grep config.php` ile kontrol et. Şifreleri sohbete yazma.
- Commit kimliği: `git -c user.name="Sedat Okutan" -c user.email="sedat@okutan.org" commit …` + `Co-Authored-By` satırı. Dal: `main`, push serbest.
- **Yayın elle yapılır:** kullanıcı dosyaları FTP ile cPanel'e yükler (GitHub Actions FTP adımı sırları olmadığı için çalışmıyor). İş bitince yüklenecek dosyaların listesini ver; kullanıcı "yükledim" deyince canlıda kontrol et (dosyaları `curl` ile HEAD sürümüyle karşılaştır, API uçlarını çağır, tarayıcıda oyna).

## Yeni oyun / sayfa kontrol listesi (sorulmadan yapılır)
- Kendi çizimimiz, ticari kalitede görünüm; başka oyunun görselini/adını kopyalama.
- Kontroller bölümü: Bilgisayar/Mobil sekmeleri, SVG simgeler, tuş kapakları; listelenen kısayollar gerçekten çalışmalı.
- Tam SEO: title/description, canonical, og/twitter (og:image:alt dahil), JSON-LD (VideoGame+WebApplication, BreadcrumbList, FAQPage = sayfadaki SSS), H1 ve dizine girecek metin, 1200×630 `og.png`.
- `sitemap.xml` (lastmod), `llms.txt`, `README.md`, ana sayfa kartı (`index.html`, TR + `data-i18n` EN), `/oyunlar/` kartı ve JSON-LD ItemList, diğer oyunların alt bilgi bağlantıları.
- PWA: `manifest.json`, `sw.js`, `icon-192/512/maskable-512.png` (simgeler headless Chrome ile canvas'tan üretilir).
- Mobil test: 320/375/390 dikey, 667/844 yatay; yatay taşma olmamalı (`scrollWidth`).

## Oyun mimarisi
- Her oyunda **kural motoru arayüzden ayrı** (UMD: tarayıcıda `window.X`, Node'da `module.exports`) ve `tests/*.test.mjs` ile test edilir: `node --test tests/<dosya>.test.mjs`.
- Masa oyunları sabit 1100×680 sahne olarak çizilir, `fit()` ile `transform: scale` edilir. Kısa yatay ekranda başlık (`.top`) gizlenir.
- **Ortak API:** `101-okey/api/index.php` üç oyuna hizmet eder. `okey/api` ve `tavla/api`, `OKEY_GAME` tanımlayıp onu çağırır; tablo önekleri `ok_` (101), `oy_` (Okey), `tv_` (Tavla), `tbl()` ile değiştirilir. Tablolar ilk istekte kendiliğinden oluşur (42S02). Tavla masası iki kişiliktir (`$MAX_SEAT`).
- **Online masa:** masa sahibinin tarayıcısı oyunu yönetir; sunucu yalnızca aktarır (`t_create/t_join/t_lobby/t_start/t_move/t_moves/t_state/t_poll`). WebSocket yok, yoklama var.
- **Sohbet:** `assets/okey-sohbet.js`, yalnızca online masada görünür. Oyun sayfası `window.OkeySohbetHost = { ctx, say, sound }` sağlar. Uçlar: `t_say` / `t_chat` (140 karakter, küfür maskesi, hız sınırı).
- Günlük modlarda tohum: FNV-1a(`'okey-'`/`'duz-okey-'`/`'balon-'` + gün), JS ve PHP'de aynı.

## Sık yapılan hatalar
- **Sürüm numarası:** JS değişince `index.html` içindeki `?v=N` ve o oyunun `sw.js` içindeki `CACHE` adı ile `CORE` listesi birlikte artırılır. Yoksa tarayıcı ve service worker eski dosyayı verir (yerel testte de).
- Python ile dosya düzenlerken `'\b'` gibi kaçışlar gerçek kontrol karakterine dönüşür (bir kez regex'i bozdu). Ters bölülü metinde `chr(92)` kullan ya da Edit aracıyla düzenle; sonra `grep -c $'\x08'` ile kontrol et.
- Sahnedeki öğelere `top`, `bot` gibi genel sınıf adları verme; sayfa başlığının `.top` kuralıyla çakışır.
- Plaka/kart yeniden çizilirken içteki balon gibi zamanlayıcılı öğeleri `outerHTML` ile kopyalama; aynı DOM düğümünü koru.
- Sürükle-bırakta hedefi, sürüklenen öğe yeniden tıklanabilir olmadan önce bul.
- Arka plandaki sekmede zincirleme zamanlayıcılar seyrelir; `visibilitychange` ile yenile.

## Yerel test
- MySQL: `C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini --standalone`
- PHP: `C:\xampp\php\php.exe -d extension=gd -S 127.0.0.1:8765 -t .` — tek iş parçacıklıdır; MySQL kapalıyken API isteği takılır ve sayfadaki resimler de bekler.
- API testleri: `node --test tests/okey-api.test.mjs` (101), `BASE=… ADMIN_PASS=… node --test tests/api.test.mjs` (Balon). Canlıda çalıştırma.
- Online iki oyunculu deneme: ikinci oyuncuyu Node betiğiyle API üzerinden oynat ya da ikinci sekmeyi `localhost:8765` kökeninden aç (localStorage ayrı kalır).
- Test bitince yerel `ok_* / oy_* / tv_*` tablolarını sil, sunucuları kapat.
