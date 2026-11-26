<?php
// Gece yedeği (cPanel: her gece 03:30). Ayrıntı: admin/lib/cron.php
declare(strict_types=1);
require __DIR__ . '/../lib/cron.php';
cron_main('yedek', function () {
    $r = backup_create();
    $msg = basename($r['file']) . ' · ' . $r['tables'] . ' tablo, ' . nf($r['rows']) . ' satır, ' . fmt_bytes((float)$r['size']);
    // Haftada bir (Pazartesi) yedeğin bir kopyası Telegram'a: sunucu çökse de yedek elde kalsın. BACKUP_TELEGRAM => false kapatır.
    if (date('N') === '1' && cfg('BACKUP_TELEGRAM', true) !== false && notify_enabled()) {
        [$ok, $err] = notify_document($r['file'], 'okutan.org haftalık veritabanı yedeği · ' . date('d.m.Y'));
        $msg .= $ok ? " · Telegram'a gönderildi" : " · Telegram'a gönderilemedi: " . $err;
    }
    return $msg;
});
