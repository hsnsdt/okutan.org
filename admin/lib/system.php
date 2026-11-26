<?php
// Yönetim paneli — sistem: sağlık kontrolü, PHP hata günlüğü, veritabanı boyutu, cron durumu, dikkat isteyen işler.
declare(strict_types=1);

/** Cron'lar: ad => [etiket, en fazla kaç saatte bir çalışmalı, cPanel zamanlaması, betik]. */
const CRONS = [
    'yedek' => ['Gece yedeği', 26, '30 3 * * *', 'yedek.php'],
    'saglik' => ['Saatlik sağlık kontrolü', 2, '0 * * * *', 'saglik.php'],
    'rapor' => ['Haftalık rapor', 24 * 8, '0 9 * * 1', 'rapor.php'],
    'uyari' => ['Anlık uyarılar (15 dk)', 1, '*/15 * * * *', 'uyari.php'],
    'indeks' => ['Gece indeks denetimi', 26, '15 4 * * *', 'indeks.php'],
];

function health_targets(): array
{
    $def = [
        ['url' => site_url() . '/', 'expect' => 'Sedat Okutan'],
        ['url' => site_url() . '/oyunlar/', 'expect' => 'Oyunlar'],
        ['url' => site_url() . '/kelime-bulucu/kelime/kitap/', 'expect' => 'kitap'],
        ['url' => site_url() . '/okey/api/?a=top', 'expect' => '"ok"'],
        ['url' => site_url() . '/sohbet/api/?a=count', 'expect' => '"ok"'],
    ];
    $out = [];
    foreach ((array)cfg('HEALTH_URLS', $def) as $t) {
        if (is_string($t)) $t = ['url' => $t, 'expect' => ''];
        if (!empty($t['url'])) $out[] = ['url' => (string)$t['url'], 'expect' => (string)($t['expect'] ?? '')];
    }
    return $out;
}
/** Tüm hedefleri çeker; sonucu adm_settings'e yazar. */
function health_run(): array
{
    $res = [];
    foreach (health_targets() as $t) {
        [$code, $body, $err, $ms] = http_req('GET', $t['url'], null, ['Accept: text/html,application/json'], 20);
        $found = $t['expect'] === '' || mb_stripos($body, $t['expect']) !== false;
        $ok = $err === '' && $code >= 200 && $code < 400 && $found;
        $why = $err !== '' ? 'Bağlantı hatası: ' . $err : ($code >= 400 || $code === 0 ? 'HTTP ' . $code : (!$found ? 'Beklenen metin yok: "' . $t['expect'] . '"' : ''));
        $res[] = ['url' => $t['url'], 'code' => $code, 'ms' => $ms, 'ok' => $ok, 'why' => $why];
    }
    db_ping();
    setting_set('health_last', json_encode(['at' => now(), 'res' => $res]));
    return $res;
}
function health_last(): ?array { $v = setting_get('health_last', true); return $v ? json_decode($v, true) : null; }

/** error_log dosyaları: ERROR_LOGS ayarı + web kökündeki "error_log" dosyaları (sığ tarama) + panel günlüğü. */
function error_log_files(): array
{
    $files = [];
    foreach ((array)cfg('ERROR_LOGS', []) as $f) if (is_string($f) && is_file($f)) $files[$f] = 1;
    $skip = ['tools', 'assets', 'anlam', 'veri', 'img', 'kelimeler', 'node_modules', '.git'];
    $walk = function (string $dir, int $depth) use (&$walk, &$files, $skip) {
        if (is_file($dir . '/error_log')) $files[$dir . '/error_log'] = 1;
        if ($depth <= 0) return;
        foreach (scandir($dir) ?: [] as $e) {
            if ($e[0] === '.' || in_array($e, $skip, true)) continue;
            if (is_dir($dir . '/' . $e)) $walk($dir . '/' . $e, $depth - 1);
        }
    };
    $walk(SITE_ROOT, 3);
    $ini = (string)ini_get('error_log');
    if ($ini !== '' && is_file($ini)) $files[$ini] = 1;
    if (($d = priv_dir('logs')) && is_dir($d)) foreach (glob($d . '/*.log') ?: [] as $f) $files[$f] = 1;
    return array_keys($files);
}
/** Satırları mesaja göre grupla. Dönüş: [[key, level, msg, count, first, last, file]] en yeni üstte. */
function error_log_groups(int $tailBytes = 2000000): array
{
    $g = [];
    foreach (error_log_files() as $f) {
        $size = filesize($f);
        $fh = fopen($f, 'rb');
        if (!$fh) continue;
        if ($size > $tailBytes) { fseek($fh, -$tailBytes, SEEK_END); fgets($fh); }
        while (($line = fgets($fh)) !== false) {
            if (!preg_match('~^\[([^\]]+)\]\s+(?:PHP\s+)?(Fatal error|Parse error|Warning|Notice|Deprecated|Recoverable fatal error|SQL hatası|DB bağlantı hatası|[^:]{0,40}?):?\s*(.*)$~u', rtrim($line), $m)) continue;
            $t = strtotime(preg_replace('~\s+[A-Za-z_]+/[A-Za-z_]+$~', '', $m[1])) ?: null;
            $level = trim($m[2]) !== '' ? trim($m[2]) : 'Bilgi';
            $msg = trim($m[3]);
            if ($msg === '') continue;
            // Gruplama anahtarı: sayılar ve tırnak içi değerler dışında aynı mesaj
            $key = md5(basename($f) . '|' . $level . '|' . preg_replace(['~\d+~', "~'[^']*'~"], ['#', "'…'"], $msg));
            if (!isset($g[$key])) $g[$key] = ['key' => $key, 'level' => $level, 'msg' => mb_substr($msg, 0, 600), 'count' => 0, 'first' => $t, 'last' => $t, 'file' => $f];
            $g[$key]['count']++;
            if ($t && (!$g[$key]['first'] || $t < $g[$key]['first'])) $g[$key]['first'] = $t;
            if ($t && (!$g[$key]['last'] || $t >= $g[$key]['last'])) { $g[$key]['last'] = $t; $g[$key]['msg'] = mb_substr($msg, 0, 600); }
        }
        fclose($fh);
    }
    $g = array_values($g);
    usort($g, fn($a, $b) => ($b['last'] ?? 0) <=> ($a['last'] ?? 0));
    return $g;
}
function is_fatal(string $level): bool { return stripos($level, 'fatal') !== false || stripos($level, 'parse') !== false; }
function level_tr(string $l): string
{
    return ['Fatal error' => 'Ölümcül hata', 'Parse error' => 'Söz dizimi hatası', 'Warning' => 'Uyarı', 'Notice' => 'Bilgi notu', 'Deprecated' => 'Eskimiş kullanım', 'Recoverable fatal error' => 'Ölümcül hata (kurtarılabilir)'][$l] ?? $l;
}

function db_sizes(): array
{
    return rows('SELECT TABLE_NAME name, ENGINE engine, TABLE_ROWS row_count, DATA_LENGTH + INDEX_LENGTH size FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() ORDER BY size DESC');
}

function cron_status(): array
{
    $db = [];
    foreach (rows('SELECT * FROM adm_cron') as $r) $db[$r['name']] = $r;
    $out = [];
    foreach (CRONS as $k => [$label, $hours, $sched, $script]) {
        $r = $db[$k] ?? null;
        $last = $r['last_start'] ?? null;
        if ($last) $stale = strtotime($last) < time() - $hours * 3600;
        else {
            // Hiç çalışmadı: panelin bu cron'u ilk gördüğü andan itibaren kendi aralığı kadar bekle (yeni kurulanı uyarma).
            $seen = setting_get('cron_seen:' . $k, true);
            if (!$seen) { $seen = now(); setting_set('cron_seen:' . $k, $seen); }
            $stale = strtotime($seen) < time() - $hours * 3600;
        }
        $out[$k] = ['label' => $label, 'hours' => $hours, 'sched' => $sched, 'script' => $script, 'last' => $last, 'end' => $r['last_end'] ?? null,
            'status' => $r['status'] ?? '', 'message' => $r['message'] ?? '', 'runs' => (int)($r['runs'] ?? 0), 'stale' => $stale];
    }
    return $out;
}

/** Ayar anahtarlarının dolu olup olmadığı (değerler gösterilmez). */
function config_keys(): array
{
    $keys = ['ADMIN_PASS_HASH', 'ADMIN_PASS_RESET', 'PRIVATE_DIR', 'CRON_KEY', 'STATS_SALT', 'SITE_URL', 'TIMEZONE', 'GSC_KEY_FILE', 'GSC_SITE', 'GA4_PROPERTY',
        'INSPECT_SITEMAP', 'INSPECT_URLS', 'HEALTH_URLS', 'ERROR_LOGS', 'BACKUP_KEEP', 'BACKUP_SKIP_DATA', 'BACKUP_TELEGRAM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALERT_ONLINE', 'FUNNEL'];
    $out = [];
    foreach ($keys as $k) $out[$k] = cfg($k) !== null;
    return $out;
}

/** Gizli klasör ve anahtar yolları için uyarılar. */
function path_warnings(): array
{
    $w = [];
    $d = (string)(cfg('PRIVATE_DIR') ?: auto_private_dir() ?: '');
    if ($d === '') $w[] = 'PRIVATE_DIR ayarlı değil ve ev dizini bulunamadı: yedekler ve günlükler yazılamıyor (admin/config.php).';
    else {
        if ($r = public_path_risk($d)) $w[] = 'PRIVATE_DIR (' . $d . '): ' . $r;
        elseif (!is_dir($d) || !is_writable($d)) $w[] = 'PRIVATE_DIR yok ya da yazılamıyor: ' . $d;
    }
    if (($k = (string)cfg('GSC_KEY_FILE', '')) !== '' && ($r = public_path_risk($k))) $w[] = 'GSC_KEY_FILE: ' . $r;
    if (!cfg('CRON_KEY')) $w[] = 'CRON_KEY ayarlı değil: cron betikleri HTTP üzerinden çalıştırılamaz (CLI çalışır).';
    return $w;
}

/** Özet ekranı ve menü rozeti için dikkat isteyen işler: [[seviye, metin, bağlantı view]]. */
function attention_items(): array
{
    $a = [];
    foreach (path_warnings() as $w) $a[] = ['warn', $w, 'sistem'];
    try {
        $h = health_last();
        if ($h) foreach ($h['res'] as $r) if (!$r['ok']) $a[] = ['err', 'Sağlık kontrolü: ' . $r['url'] . ' — ' . $r['why'], 'sistem'];
        foreach (cron_status() as $c) if ($c['stale']) $a[] = ['warn', $c['label'] . ': ' . ($c['last'] ? 'son ' . $c['hours'] . ' saattir çalışmadı (son: ' . tr_ago($c['last']) . ')' : 'hiç çalışmadı; cPanel → Cron Jobs\'ta kurulu mu bak'), 'sistem'];
            elseif ($c['status'] === 'error') $a[] = ['err', $c['label'] . ' son çalışmada hata verdi: ' . mb_substr($c['message'], 0, 200), 'sistem'];
        $bl = backup_list();
        if (!$bl) $a[] = ['warn', 'Hiç yedek yok.', 'sistem'];
        elseif ($bl[0]['time'] < time() - 26 * 3600) $a[] = ['warn', 'Son yedek eski: ' . tr_ago(date('Y-m-d H:i:s', $bl[0]['time'])), 'sistem'];
        $due = (int)val('SELECT COUNT(*) FROM adm_notes WHERE done = 0 AND due IS NOT NULL AND due <= ?', [today()]);
        if ($due) $a[] = ['warn', $due . ' notun vadesi geldi.', 'notlar'];
    } catch (Throwable $e) {
        $a[] = ['err', 'Durum okunamadı: ' . $e->getMessage(), 'sistem'];
    }
    $fat = 0;
    foreach (error_log_groups() as $g) if (is_fatal($g['level']) && $g['last'] && $g['last'] > time() - 86400) $fat++;
    if ($fat) $a[] = ['err', 'Son 24 saatte ' . $fat . ' farklı ölümcül PHP hatası.', 'sistem'];
    return $a;
}

/** LiteSpeed önbelleğini temizle: yanıt başlığıyla tüm siteyi boşaltır (Kelime Bulucu sayfaları). */
function cache_purge_header(): void { header('X-LiteSpeed-Purge: *'); }
