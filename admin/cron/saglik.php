<?php
// Saatlik sağlık kontrolü (cPanel: saatte bir). Sayfa çökmesi, yeni ölümcül PHP hatası türü, 26 saatten eski yedek,
// çalışmayan cron → Telegram. Aynı sorun için tekrar mesaj atmaz: durum PRIVATE_DIR/durum/saglik.json'da, yalnızca değişimde bildirir.
// Ayrıca sayaç tablolarını temizler.
declare(strict_types=1);
require __DIR__ . '/../lib/cron.php';
cron_main('saglik', function () {
    $stateFile = work_dir('durum') . '/saglik.json';
    $state = is_file($stateFile) ? (json_decode((string)file_get_contents($stateFile), true) ?: []) : [];
    $prevIssues = $state['issues'] ?? [];
    $knownFatal = array_flip($state['fatals'] ?? []);
    $firstRun = !isset($state['fatals']);

    $issues = [];
    foreach (health_run() as $r) if (!$r['ok']) $issues['h:' . $r['url']] = 'Sayfa sorunlu: ' . $r['url'] . ' — ' . $r['why'];
    $bl = backup_list();
    if (!$bl) $issues['backup'] = 'Hiç yedek yok.';
    elseif ($bl[0]['time'] < time() - 26 * 3600) $issues['backup'] = 'Son yedek 26 saatten eski (' . date('d.m.Y H:i', $bl[0]['time']) . ').';
    foreach (cron_status() as $k => $c) {
        if ($k === 'saglik') continue;
        if ($c['stale'] && $c['last']) $issues['cron:' . $k] = $c['label'] . ' son ' . $c['hours'] . ' saattir çalışmadı.';
        elseif ($c['status'] === 'error') $issues['cronerr:' . $k] = $c['label'] . ' hata verdi: ' . mb_substr($c['message'], 0, 200);
    }

    $newFatal = [];
    foreach (error_log_groups() as $g) {
        if (!is_fatal($g['level'])) continue;
        if (!isset($knownFatal[$g['key']])) { if (!$firstRun) $newFatal[] = $g; $knownFatal[$g['key']] = 1; }
    }

    $msgs = [];
    foreach ($issues as $k => $v) if (!isset($prevIssues[$k])) $msgs[] = '⚠️ ' . $v;
    foreach ($prevIssues as $k => $v) if (!isset($issues[$k])) $msgs[] = '✅ Düzeldi: ' . $v;
    foreach (array_slice($newFatal, 0, 5) as $g) $msgs[] = '🛑 Yeni PHP hatası (' . basename(dirname($g['file'])) . '/' . basename($g['file']) . '): ' . mb_substr($g['msg'], 0, 300);
    if (count($newFatal) > 5) $msgs[] = '… ve ' . (count($newFatal) - 5) . ' yeni hata türü daha.';
    if ($msgs && notify_enabled()) {
        [$ok, $err] = notify_now("okutan.org sağlık\n" . implode("\n", $msgs));
        if (!$ok) adm_log('Sağlık bildirimi gönderilemedi: ' . $err);
    }

    $state = ['issues' => $issues, 'fatals' => array_slice(array_keys($knownFatal), -500), 'at' => now()];
    if (file_put_contents($stateFile, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX) === false) {
        throw new RuntimeException('Durum dosyası yazılamadı: ' . $stateFile);
    }

    q('DELETE FROM stats_seen WHERE day < ?', [today()]);
    q('DELETE FROM stats_online WHERE last_seen < ?', [date('Y-m-d H:i:s', time() - 900)]);
    q('DELETE FROM adm_login WHERE at < ?', [date('Y-m-d H:i:s', time() - 86400)]);
    return count($issues) . ' sorun, ' . count($newFatal) . ' yeni hata türü, ' . count($msgs) . ' durum değişikliği';
});
