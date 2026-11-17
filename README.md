# okutan.org

Sedat Okutan'ın kişisel geliştirici sitesi. Tek sayfa, framework yok: `index.html` + `assets/`.

- `index.html` — ana sayfa (TR/EN, açık/koyu tema)
- `404.html` — hata sayfası (`.htaccess` ile bağlı)
- `og.png` — paylaşım görseli · `llms.txt` — yapay zeka özeti · `sitemap.xml`, `robots.txt`
- `assets/` — logo, fontlar (kendi sunucumuzdan), ekran görüntüleri, profil görselleri
- `github-profile/` — github.com/hsnsdt profil README'si (siteye yüklenmez)

**Yayın:** `main` dalına push → GitHub Actions FTP ile cPanel'e yükler (`.github/workflows/deploy.yml`).
`.htaccess` otomatik yüklenmez; elle yüklenir. İçindeki yönlendirme kuralı, üst klasördeki (ana cPanel hesabı) kuralların okutan.org'u bozmasını engeller.
`kelimeler/` — Kelimeler oyununun sitesi (aynı tasarım dili, oyunun lavanta/mor paleti). APK dosyaları repoda değildir; sunucuda elle güncellenir.
`balon/` — Balon Patlat (HTML5 canvas oyunu) + `balon/api/` PHP/MySQL liderlik tablosu. Veritabanı bilgileri `balon/api/config.php` içinde; bu dosya depoda yok (şablon: `config.sample.php`), sunucuya elle yüklenir. Tablolar ilk istekte otomatik oluşur, eski kurulumlara eksik sütunlar kendiliğinden eklenir. PWA: `balon/manifest.json`, `balon/sw.js` (oyun.js sürümü değişince sw.js içindeki `CACHE` ve `CORE` listesini de güncelle).

**Balon Patlat yönetimi ve testler**
- Yönetim paneli: `/balon/yonetim/` — şifre `balon/api/config.php` içindeki `admin_pass` (boşsa panel kapalı). Şüpheli skorları onaylama/silme, isim engelleme, 30 günlük grafik.
- Paylaşım önizlemesi: `/balon/meydan.php?id=…` (meta etiketleri) + `/balon/api/og.php?id=…` (GD ile skor görseli; font: `balon/api/fonts/InterTight-ExtraBold.ttf`, OFL). GD yoksa genel `og.png` kullanılır.
- Testler (yerelde PHP + MySQL açıkken): `BASE=http://127.0.0.1:8765/balon ADMIN_PASS=... node --test tests/api.test.mjs`. Canlı sitede çalıştırma.
- Yerel sunucu: `php -d extension=gd -S 127.0.0.1:8765 -t .` (XAMPP).

`101-okey/` — 101 Okey (botlara karşı). Kurallar ve botlar `101-okey/okey-motor.js` içinde (arayüzden bağımsız), arayüz `okey.js`. Motor testleri: `node --test tests/okey.test.mjs`.
101 Okey API: `101-okey/api/` (veritabanı ayarı Balon ile ortak, `balon/api/config.php`). Online masada oyunu masa sahibinin tarayıcısı yönetir; sunucu hamleleri ve durumu aktarır. API testleri: `node --test tests/okey-api.test.mjs`. PWA: `101-okey/manifest.json`, `101-okey/sw.js` (okey.js sürümü değişince CACHE/CORE güncellenir).
