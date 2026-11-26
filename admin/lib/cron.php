<?php
// Yönetim paneli — cron çalıştırıcı. Her cron betiği:
//   CLI:  php -d display_errors=1 /tam/yol/admin/cron/yedek.php >> ~/logs/yedek.log 2>&1
//   HTTP: https://okutan.org/admin/cron/yedek.php?key=CRON_KEY   (anahtarsız ya da yanlış anahtar: 403)
// flock ile aynı anda iki kez çalışmaz; son çalışma zamanı ve sonucu adm_cron tablosuna yazılır.
declare(strict_types=1);
require_once __DIR__ . '/boot.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/ziyaretci.php';
require_once __DIR__ . '/stats.php';
require_once __DIR__ . '/oyun.php';
require_once __DIR__ . '/analiz.php';
require_once __DIR__ . '/google.php';
require_once __DIR__ . '/notify.php';
require_once __DIR__ . '/backup.php';
require_once __DIR__ . '/system.php';

function cron_main(string $name, callable $fn): void
{
    if (PHP_SAPI !== 'cli') {
        $key = (string)cfg('CRON_KEY', '');
        if ($key === '' || !hash_equals($key, (string)($_GET['key'] ?? ''))) { http_response_code(403); header('Content-Type: text/plain; charset=utf-8'); exit("403\n"); }
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Robots-Tag: noindex');
        ignore_user_abort(true);
    }
    @set_time_limit(900); // bazı hostlarda kapalıdır; o durumda varsayılan süre geçerli
    $lockFile = work_dir('lock') . '/' . $name . '.lock';
    $lock = fopen($lockFile, 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) { echo date('c') . " $name: zaten çalışıyor, çıkılıyor\n"; exit(0); }
    $t0 = microtime(true);
    try {
        db()->exec('SET SESSION wait_timeout = 900');
        q('INSERT INTO adm_cron (name, last_start, status, runs) VALUES (?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE last_start = VALUES(last_start), status = VALUES(status), runs = runs + 1', [$name, now(), 'running']);
        $msg = (string)$fn();
        db_ping();
        q('UPDATE adm_cron SET last_end = ?, status = ?, message = ? WHERE name = ?', [now(), 'ok', mb_substr($msg, 0, 2000), $name]);
        echo date('c') . " $name: tamam (" . round(microtime(true) - $t0, 1) . " sn) $msg\n";
    } catch (Throwable $e) {
        $m = get_class($e) . ': ' . $e->getMessage();
        adm_log("cron $name: $m");
        try { db_ping(); q('UPDATE adm_cron SET last_end = ?, status = ?, message = ? WHERE name = ?', [now(), 'error', mb_substr($m, 0, 2000), $name]); }
        catch (Throwable $e2) { adm_log("cron $name: sonuç yazılamadı: " . $e2->getMessage()); }
        echo date('c') . " $name: HATA $m\n";
        flock($lock, LOCK_UN);
        exit(1);
    }
    flock($lock, LOCK_UN);
}

/** Haftalık rapor metni (son 7 gün vs önceki 7 gün). Panelden "şimdi gönder" de bunu kullanır. */
function weekly_report(): string
{
    $to = day_add(today(), -1); $from = day_add($to, -6);
    $pto = day_add($from, -1); $pfrom = day_add($pto, -6);
    [$pv, $u] = st_sum('pv', $from, $to);
    [$ppv, $pu] = st_sum('pv', $pfrom, $pto);
    $pct = function ($c, $p) { if ($p <= 0) return $c > 0 ? ' (yeni)' : ''; $x = ($c - $p) / $p * 100; return ' (' . ($x >= 0 ? '▲' : '▼') . ' %' . nf(abs($x)) . ')'; };
    $L = [];
    $L[] = 'okutan.org haftalık rapor';
    $L[] = tr_date($from) . ' – ' . tr_date($to);
    $L[] = '';
    $L[] = 'Ziyaret';
    $L[] = '• Görüntüleme: ' . nf($pv) . $pct($pv, $ppv);
    $L[] = '• Tekil ziyaretçi (günlük toplam): ' . nf($u) . $pct($u, $pu);
    $top = st_dim('page', $from, $to, 3);
    if ($top) $L[] = '• En çok: ' . implode(', ', array_map(fn($r) => $r['val'] . ' (' . nf($r['n']) . ')', $top));
    $L[] = '';
    try {
        $gend = day_add(today(), -3); $gfrom = day_add($gend, -6);
        $gpend = day_add($gfrom, -1); $gpfrom = day_add($gpend, -6);
        $c = gsc_total($gfrom, $gend, false); $p = gsc_total($gpfrom, $gpend, false);
        $L[] = 'Google (' . tr_date($gfrom) . ' – ' . tr_date($gend) . ', veri 2-3 gün geriden gelir)';
        $L[] = '• Tıklama: ' . nf($c['clicks']) . $pct($c['clicks'], $p['clicks']);
        $L[] = '• Gösterim: ' . nf($c['impressions']) . $pct($c['impressions'], $p['impressions']);
        $L[] = '• Ort. sıra: ' . nf($c['position'], 1);
        foreach (['query' => 'sorgu', 'page' => 'sayfa'] as $dim => $lbl) {
            $cur = []; $prev = [];
            foreach (gsc_query(['startDate' => $gfrom, 'endDate' => $gend, 'dimensions' => [$dim]]) as $r) $cur[$r['keys'][0]] = $r['clicks'];
            foreach (gsc_query(['startDate' => $gpfrom, 'endDate' => $gpend, 'dimensions' => [$dim]]) as $r) $prev[$r['keys'][0]] = $r['clicks'];
            $best = null; $bd = 0;
            foreach ($cur as $k => $v) { $d = $v - ($prev[$k] ?? 0); if ($d > $bd) { $bd = $d; $best = $k; } }
            if ($best !== null) $L[] = '• En çok büyüyen ' . $lbl . ': ' . $best . ' (+' . nf($bd) . ' tık)';
        }
        $s = inspect_summary();
        if ($s['checked']) $L[] = '• İndeks: ' . $s['indexed'] . ' dizinde, ' . $s['notindexed'] . ' dizinde değil (' . $s['checked'] . '/' . $s['total'] . ' adres denetlendi)';
    } catch (Throwable $e) {
        $L[] = 'Google verisi alınamadı: ' . google_reason_tr($e);
    }
    return implode("\n", $L);
}
