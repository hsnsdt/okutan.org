<?php
// Aylık rapor (cPanel: her ayın 1'i 09:00). Geçen ayın özeti Telegram'a; Telegram ayarlı değilse yalnızca metni yazar.
declare(strict_types=1);
require __DIR__ . '/../lib/cron.php';
cron_main('aylik', function () {
    $txt = monthly_report();
    if (PHP_SAPI === 'cli') echo $txt, "\n";
    if (!notify_enabled()) return 'Telegram ayarlı değil, gönderilmedi.';
    [$ok, $err] = notify_now($txt);
    if (!$ok) throw new RuntimeException('Rapor gönderilemedi: ' . $err);
    return 'Aylık rapor gönderildi.';
});
