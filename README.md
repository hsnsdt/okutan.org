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
