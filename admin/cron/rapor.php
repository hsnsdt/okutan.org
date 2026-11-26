<?php
// Haftalık rapor (cPanel: Pazartesi 09:00). Telegram'a gönderir; Telegram ayarlı değilse yalnızca metni yazar.
declare(strict_types=1);
require __DIR__ . '/../lib/cron.php';
cron_main('rapor', function () {
    $txt = weekly_report();
    if (PHP_SAPI === 'cli') echo $txt, "\n";
    if (!notify_enabled()) return 'Telegram ayarlı değil, gönderilmedi.';
    [$ok, $err] = notify_now($txt);
    if (!$ok) throw new RuntimeException('Rapor gönderilemedi: ' . $err);
    return 'Rapor gönderildi.';
});
