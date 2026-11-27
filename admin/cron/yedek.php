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
    // Pazar gecesi: son yedeği deneme veritabanına açıp tablo/satır sayılarını karşılaştır (ana veritabanına dokunmaz).
    if (date('N') === '7') {
        $rt = restore_test();
        $msg .= ' · geri yükleme denemesi: ' . ($rt['ok'] ? 'sağlam' : 'SORUNLU');
        if (!$rt['ok'] && notify_enabled()) notify_now("okutan.org yedek denemesi başarısız\n" . $rt['msg']);
    }
    $moved = stats_compact();
    if ($moved) $msg .= ' · ' . nf($moved) . ' eski günlük satır aylığa toplandı';
    return $msg;
});
