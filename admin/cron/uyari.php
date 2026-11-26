<?php
// Anlık uyarılar (cPanel: 15 dakikada bir; barındırma firması daha sık çalıştırmaya izin vermiyor). Telegram'a yalnızca yeni olanı yazar; durum PRIVATE_DIR/durum/uyari.json'da.
//   - Sohbette yeni şikâyet
//   - Balon Patlat'ta yeni şüpheli skor (flag = 1)
//   - Sitede şu an ALERT_ONLINE (varsayılan 20) ya da daha fazla kişi (sayı yarının altına inince yeniden kurulur)
// Oyun ve sohbet tabloları UTC saat tutar.
declare(strict_types=1);
require __DIR__ . '/../lib/cron.php';
cron_main('uyari', function () {
    $file = work_dir('durum') . '/uyari.json';
    $st = is_file($file) ? (json_decode((string)file_get_contents($file), true) ?: []) : [];
    $t = db_tables();
    $msgs = [];
    $panel = site_url() . '/admin/';

    if (isset($t['sh_reports'])) {
        $last = (string)($st['rep_at'] ?? gmdate('Y-m-d H:i:s'));
        $r = row('SELECT COUNT(*) n, MAX(created_at) m FROM sh_reports WHERE created_at > ?', [$last]);
        if ((int)$r['n'] > 0) { $msgs[] = '🚩 Sohbette ' . $r['n'] . ' yeni şikâyet. ' . $panel . '?view=sohbet'; $last = (string)$r['m']; }
        $st['rep_at'] = $last;
    }
    if (isset($t['bp_scores'])) {
        $maxId = (int)val('SELECT COALESCE(MAX(id), 0) FROM bp_scores');
        $lastId = (int)($st['bp_id'] ?? $maxId);
        $f = rows('SELECT name, score FROM bp_scores WHERE flag = 1 AND id > ? ORDER BY id LIMIT 5', [$lastId]);
        if ($f) $msgs[] = '🎈 Balon Patlat: ' . count($f) . ' yeni şüpheli skor (' . implode(', ', array_map(fn($x) => $x['name'] . ' ' . nf($x['score']), $f)) . '). ' . $panel . '?view=balon';
        $st['bp_id'] = $maxId;
    }
    $lim = max(2, (int)cfg('ALERT_ONLINE', 20));
    $n = (int)st_online()['n'];
    if ($n >= $lim && empty($st['crowd'])) { $msgs[] = '👥 Sitede şu an ' . $n . ' kişi var.'; $st['crowd'] = 1; }
    elseif ($n < $lim / 2) $st['crowd'] = 0;

    if ($msgs && notify_enabled()) {
        [$ok, $err] = notify_now("okutan.org\n" . implode("\n", $msgs));
        if (!$ok) throw new RuntimeException('Uyarı gönderilemedi: ' . $err);
    }
    if (file_put_contents($file, json_encode($st), LOCK_EX) === false) throw new RuntimeException('Durum dosyası yazılamadı: ' . $file);
    return count($msgs) . ' uyarı · şu an ' . $n . ' kişi';
});
