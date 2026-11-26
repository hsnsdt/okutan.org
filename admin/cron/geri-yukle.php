<?php
// Yedekten geri yükleme — YALNIZCA komut satırından (HTTP isteği reddedilir).
//   php admin/cron/geri-yukle.php okutan-20261127-033000.sql.gz            → ortak veritabanına (tüm tablolar yedektekiyle değişir!)
//   php admin/cron/geri-yukle.php /tam/yol/yedek.sql.gz --db=deneme_db     → başka bir veritabanına (deneme için)
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit("403\n"); }
require __DIR__ . '/../lib/boot.php';
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/backup.php';

$file = $argv[1] ?? '';
$dbName = null;
foreach (array_slice($argv, 2) as $a) if (strpos($a, '--db=') === 0) $dbName = substr($a, 5);
if ($file === '') { fwrite(STDERR, "Kullanım: php geri-yukle.php <yedek.sql.gz> [--db=veritabani]\n"); exit(2); }
if (!is_file($file) && ($d = priv_dir('yedek')) && is_file($d . '/' . basename($file))) $file = $d . '/' . basename($file);
if (!is_file($file)) { fwrite(STDERR, "Yedek bulunamadı: $file\n"); exit(2); }

$c = db_config();
$target = $dbName ?: (string)$c['db_name'];
if (!$dbName) {
    fwrite(STDOUT, "DİKKAT: '$target' veritabanındaki tablolar yedektekilerle DEĞİŞTİRİLECEK. Devam için EVET yaz: ");
    if (trim((string)fgets(STDIN)) !== 'EVET') { echo "Vazgeçildi.\n"; exit(1); }
}
$t = microtime(true);
try {
    $pdo = new PDO('mysql:host=' . ($c['db_host'] ?? 'localhost') . ';dbname=' . $target . ';charset=utf8mb4', (string)$c['db_user'], (string)$c['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('SET SESSION wait_timeout = 900');
    $n = backup_restore($file, $pdo);
} catch (Throwable $e) {
    fwrite(STDERR, 'HATA: ' . $e->getMessage() . "\n");
    exit(1);
}
echo "Tamam: $n komut çalıştı (" . round(microtime(true) - $t, 1) . " sn) → $target\n";
