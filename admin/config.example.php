<?php
// okutan.org yonetim paneli - ayarlar (ORNEK). Bu dosya ASCII kalir.
// Sunucuda "admin/config.php" adiyla kopyala ve doldur. config.php depoya girmez (.gitignore).
// Veritabani bilgisi ayrica yazilmaz: ortak balon/api/config.php okunur.
// Bos birakilan ('') anahtar "ayarli degil" sayilir.

return [
    // Panel sifresinin hash'i. Bos ise panel /admin/ adresinde bir kurulum ekrani acar:
    // sifreni yaz, uretilen satiri buraya yapistir. Duz sifre YAZMA.
    'ADMIN_PASS_HASH' => '',
    // Panelden sifre degistirilebilir (Sifre ve oturum ekrani; yeni hash veritabaninda tutulur). Unutursan
    // 'ADMIN_PASS_RESET' => true yaz: config'teki sifreyle girilir, paneldeki silinir; sonra bu satiri kaldir.
    'ADMIN_PASS_RESET' => false,

    // Gizli klasor: WEB KOKUNUN DISINDA olmali (yedekler, gunlukler, kilit ve durum dosyalari).
    // Bos ise otomatik: PHP'nin calistigi hesabin ev dizini + /okutan-ozel (cPanel: /home/KULLANICI/okutan-ozel).
    // Elle yazarsan: public_html ya da okutan.org klasorunun ICINDE OLMASIN.
    'PRIVATE_DIR' => '',

    // Cron betiklerini HTTP ile tetikleme anahtari (?key=...). Uzun, rastgele bir metin.
    'CRON_KEY' => 'BURAYA-UZUN-RASTGELE-BIR-METIN',

    // Sayac tuzu (ziyaretci hash'leri icin). Bos ise balon/api/config.php icindeki salt kullanilir.
    'STATS_SALT' => '',

    'SITE_URL' => 'https://okutan.org',
    'TIMEZONE' => 'Europe/Istanbul',

    // Google Search Console: servis hesabi JSON anahtari (WEB KOKU DISINDA) ve mulk.
    // URL on eki mulku: 'https://okutan.org/'  |  Alan adi mulku: 'sc-domain:okutan.org'
    // GSC_KEY_FILE bos ise: PRIVATE_DIR/gsc-anahtar.json
    'GSC_KEY_FILE' => '',
    'GSC_SITE' => 'https://okutan.org/',

    // GA4 mulk kimligi (yalnizca rakam, ornek 123456789). Bos ise Ozet'teki GA4 karti gosterilmez.
    'GA4_PROPERTY' => '',

    // URL Inspection: denetlenecek adresler (site haritasi + istege bagli elle liste), gunluk kota.
    'INSPECT_SITEMAP' => 'https://okutan.org/sitemap.xml',
    'INSPECT_URLS' => [],
    'INSPECT_DAILY_QUOTA' => 2000,

    // Saglik kontrolu: adres ve sayfada aranacak metin. Bos ise varsayilan liste kullanilir.
    'HEALTH_URLS' => [
        ['url' => 'https://okutan.org/', 'expect' => 'Sedat Okutan'],
        ['url' => 'https://okutan.org/oyunlar/', 'expect' => 'Oyunlar'],
        ['url' => 'https://okutan.org/kelime-bulucu/kelime/kitap/', 'expect' => 'kitap'],
        ['url' => 'https://okutan.org/okey/api/?a=top', 'expect' => '"ok"'],
        ['url' => 'https://okutan.org/sohbet/api/?a=count', 'expect' => '"ok"'],
    ],

    // Ek PHP hata gunlukleri (tam yol). Web kokundeki "error_log" dosyalari zaten taranir.
    'ERROR_LOGS' => [],

    // Yedek: kac dosya tutulsun, hangi tablolarin yalnizca yapisi yazilsin (gecici / hiz siniri tablolari).
    'BACKUP_KEEP' => 7,
    'BACKUP_SKIP_DATA' => ['stats_seen', 'stats_online', 'adm_login', 'bp_sessions', 'bp_logins', '*_sessions', '*_moves', '*_private', '*_chat', 'sh_presence', 'sh_radyo_dinleyen'],

    // Telegram bildirimi (token bos ise bildirim gonderilmez). CHAT_ID bos birakilabilir:
    // bota bir mesaj yaz, panel > Bildirimler > "Sohbeti bul" kimligi bulup kaydeder.
    'TELEGRAM_BOT_TOKEN' => '',
    'TELEGRAM_CHAT_ID' => '',
    // Pazartesi gecesi yedeginin bir kopyasi Telegram'a gonderilsin mi (sunucu cokse de yedek elde kalsin).
    'BACKUP_TELEGRAM' => true,
    // "Sitede su an N kisi" uyarisi esigi (15 dakikalik uyari cron'u).
    'ALERT_ONLINE' => 20,

    // Trafik ekranindaki huni: [[metrik, etiket], ...]. Bos ise varsayilan: pv -> ev_engaged -> ev_engaged5.
    // Metrikler: pv, ev_engaged, ev_engaged5, ev_masa_davet, ev_<okSay adi>. (Etiketler ASCII yazilmali.)
    'FUNNEL' => [],
];
