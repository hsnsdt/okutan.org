<?php
// Gece indeks denetimi (cPanel: her gece 04:15). URL Inspection ile 20 adres ilerler (en eski denetlenenler önce);
// dizinden düşen ya da yeni giren adres olursa Telegram'a yazar.
declare(strict_types=1);
require __DIR__ . '/../lib/cron.php';
cron_main('indeks', function () {
    if (!gkey_status()['ok']) return 'Search Console bağlı değil, atlandı.';
    $before = [];
    foreach (rows('SELECT url, verdict FROM adm_inspect WHERE in_list = 1') as $r) $before[$r['url']] = $r['verdict'];
    $res = inspect_run(20);
    $since = date('Y-m-d H:i:s', time() - 3600);
    $dropped = []; $gained = [];
    foreach (rows('SELECT url, verdict, coverage FROM adm_inspect WHERE in_list = 1 AND checked_at >= ?', [$since]) as $r) {
        $was = $before[$r['url']] ?? null;
        if ($was === 'PASS' && $r['verdict'] !== 'PASS') $dropped[] = $r['url'] . ' (' . ($r['coverage'] ?: $r['verdict']) . ')';
        if ($was !== null && $was !== 'PASS' && $r['verdict'] === 'PASS') $gained[] = $r['url'];
    }
    $msgs = [];
    if ($dropped) $msgs[] = '📉 Dizinden düştü: ' . implode(', ', array_slice($dropped, 0, 10));
    if ($gained) $msgs[] = '📈 Dizine girdi: ' . implode(', ', array_slice($gained, 0, 10));
    if ($msgs && notify_enabled()) notify_now("okutan.org indeks\n" . implode("\n", $msgs));
    if ($res['error'] !== null) throw new RuntimeException($res['done'] . '/' . $res['total'] . ' adres denetlendi, sonra hata: ' . $res['error']);
    return $res['done'] . ' adres denetlendi · ' . count($dropped) . ' düşen, ' . count($gained) . ' giren';
});
