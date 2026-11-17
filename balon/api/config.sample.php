<?php
// Balon Patlat — veritabanı ayarları (ÖRNEK)
// Bu dosyayı sunucuda "config.php" adıyla kopyalayıp bilgileri doldur.
// config.php depoya girmez (.gitignore) ve FTP deploy ona dokunmaz.
//
// cPanel > MySQL Databases:
//   1) Yeni veritabanı oluştur (ör. kullanici_balon)
//   2) Yeni kullanıcı oluştur, veritabanına ekle (ALL PRIVILEGES)
// Tablolar ilk istekte otomatik oluşturulur.

return [
    'db_host' => 'localhost',
    'db_name' => 'kullanici_balon',
    'db_user' => 'kullanici_balon',
    'db_pass' => 'SIFRE_BURAYA',
    // IP adresleri açık tutulmaz, bu tuzla hash'lenir. Uzun, rastgele bir şey yaz.
    'salt'    => 'buraya-uzun-rastgele-bir-metin-yaz',
];
