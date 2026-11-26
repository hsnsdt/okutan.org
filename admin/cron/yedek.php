<?php
// Gece yedeği (cPanel: her gece 03:30). Ayrıntı: admin/lib/cron.php
declare(strict_types=1);
require __DIR__ . '/../lib/cron.php';
cron_main('yedek', function () {
    $r = backup_create();
    return basename($r['file']) . ' · ' . $r['tables'] . ' tablo, ' . nf($r['rows']) . ' satır, ' . fmt_bytes((float)$r['size']);
});
