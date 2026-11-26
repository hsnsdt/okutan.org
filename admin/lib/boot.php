<?php
// Yönetim paneli — ortak başlangıç: ayarlar, saat dilimi, yardımcılar.
// Hem panel (admin/index.php) hem cron betikleri hem de kökteki stats.php bunu yükler; ağır iş yapmaz.
declare(strict_types=1);

define('ADM_DIR', dirname(__DIR__));
define('SITE_ROOT', dirname(ADM_DIR));

/** Ayar oku (admin/config.php). Boş metin ve null "ayarlı değil" sayılır, $def döner. */
function cfg(string $k, $def = null)
{
    static $c = null;
    if ($c === null) {
        $f = ADM_DIR . '/config.php';
        $c = is_file($f) ? (require $f) : [];
        if (!is_array($c)) $c = [];
    }
    if (!array_key_exists($k, $c)) return $def;
    $v = $c[$k];
    return ($v === '' || $v === null || $v === []) ? $def : $v;
}
function cfg_file_exists(): bool { return is_file(ADM_DIR . '/config.php'); }

date_default_timezone_set((string)cfg('TIMEZONE', 'Europe/Istanbul'));
mb_internal_encoding('UTF-8');

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function nf($n, int $d = 0): string { return number_format((float)$n, $d, ',', '.'); }
function site_url(): string { return rtrim((string)cfg('SITE_URL', 'https://okutan.org'), '/'); }
function site_host(): string { return (string)parse_url(site_url(), PHP_URL_HOST); }
function now(): string { return date('Y-m-d H:i:s'); }
function today(): string { return date('Y-m-d'); }
function day_add(string $day, int $n): string { return date('Y-m-d', strtotime($day . ' ' . ($n >= 0 ? '+' : '') . $n . ' day')); }

/** Gizli klasör (web kökü dışı). Ayarlı değilse null. $sub verilirse alt klasörü oluşturur. */
function priv_dir(string $sub = ''): ?string
{
    $d = cfg('PRIVATE_DIR') ?: auto_private_dir();
    if (!$d) return null;
    $d = rtrim(str_replace('\\', '/', (string)$d), '/');
    $p = $sub === '' ? $d : $d . '/' . $sub;
    if (!is_dir($p)) @mkdir($p, 0700, true); // yoksa oluştur; olmazsa çağıran is_dir ile denetler
    return $p;
}
/** PRIVATE_DIR boşsa: PHP'nin çalıştığı hesabın ev dizini + /okutan-ozel (cPanel: /home/KULLANICI/okutan-ozel). Web kökü altındaysa kullanılmaz. */
function auto_private_dir(): ?string
{
    if (PHP_OS_FAMILY === 'Windows') return null;
    $home = '';
    if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) $home = (string)(posix_getpwuid(posix_geteuid())['dir'] ?? '');
    if ($home === '') $home = (string)getenv('HOME');
    if ($home === '' || $home === '/' || !is_dir($home)) return null;
    $d = rtrim($home, '/') . '/okutan-ozel';
    return public_path_risk($d) === null ? $d : null;
}
/** Kilit, durum dosyası gibi küçük işler için: gizli klasör yoksa sistemin geçici klasörü. */
function work_dir(string $sub): string
{
    $p = priv_dir($sub);
    if ($p && is_dir($p) && is_writable($p)) return $p;
    $t = rtrim(str_replace('\\', '/', sys_get_temp_dir()), '/') . '/okutan-admin/' . $sub;
    if (!is_dir($t)) @mkdir($t, 0700, true);
    return $t;
}

/** Yol web kökü altındaysa (ya da public_html gibi herkese açık bir klasördeyse) uyarı metni döner. */
function public_path_risk(string $path): ?string
{
    if ($path === '') return null;
    $norm = function (string $p): string {
        $r = realpath($p);
        return rtrim(str_replace('\\', '/', $r !== false ? $r : $p), '/');
    };
    $p = strtolower($norm($path));
    $roots = [$norm(SITE_ROOT)];
    if (!empty($_SERVER['DOCUMENT_ROOT'])) $roots[] = $norm((string)$_SERVER['DOCUMENT_ROOT']);
    foreach ($roots as $r) {
        $r = strtolower($r);
        if ($r !== '' && ($p === $r || strpos($p . '/', $r . '/') === 0)) return 'Bu yol sitenin web kökünün içinde: dosya herkese açık olabilir. Web kökünün dışına (ör. /home/KULLANICI/okutan-ozel/) taşı.';
    }
    if (preg_match('~/(public_html|www|htdocs|httpdocs)(/|$)~', $p)) return 'Bu yol public_html altında: başka bir alan adının web kökü olabilir, dosya herkese açık olabilir. /home/KULLANICI/ altında public_html dışına taşı.';
    return null;
}

/** Panelin kendi günlüğü (gizli klasörde; yoksa PHP error_log). */
function adm_log(string $msg): void
{
    $line = '[' . date('Y-m-d H:i:s') . '] ' . str_replace(["\r", "\n"], ' ', $msg) . "\n";
    $d = priv_dir('logs');
    if ($d && is_dir($d) && @file_put_contents($d . '/admin.log', $line, FILE_APPEND | LOCK_EX) !== false) return;
    error_log('okutan-admin: ' . $msg);
}

/** Sayaç tuzu: STATS_SALT; yoksa ortak veritabanı ayarındaki salt. */
function stats_salt(): string
{
    $s = (string)cfg('STATS_SALT', '');
    if ($s !== '') return $s;
    $c = db_config();
    return (string)($c['salt'] ?? 'okutan');
}
function db_config(): array
{
    static $c = null;
    if ($c !== null) return $c;
    $f = (string)cfg('DB_CONFIG', SITE_ROOT . '/balon/api/config.php');
    $c = is_file($f) ? (require $f) : [];
    if (!is_array($c)) $c = [];
    return $c;
}

/** HTTP isteği (curl). Dönüş: [kod, gövde, hata metni, süre ms]. */
function http_req(string $method, string $url, ?string $body = null, array $headers = [], int $timeout = 30): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_USERAGENT => 'okutan-panel/1.0',
        CURLOPT_ENCODING => '',
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $t = microtime(true);
    $res = curl_exec($ch);
    $ms = (int)round((microtime(true) - $t) * 1000);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = $res === false ? curl_error($ch) : '';
    curl_close($ch);
    return [$code, $res === false ? '' : (string)$res, $err, $ms];
}

function tr_ago(?string $dt): string
{
    if (!$dt) return 'hiç';
    $s = time() - strtotime($dt);
    if ($s < 0) $s = 0;
    if ($s < 60) return 'az önce';
    if ($s < 3600) return floor($s / 60) . ' dk önce';
    if ($s < 86400) return floor($s / 3600) . ' sa önce';
    return floor($s / 86400) . ' gün önce';
}
function tr_date(?string $d, bool $time = false): string
{
    if (!$d) return '—';
    $t = strtotime($d);
    if ($t === false) return h($d);
    $ay = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    $s = (int)date('j', $t) . ' ' . $ay[(int)date('n', $t)] . ' ' . date('Y', $t);
    return $time ? $s . ' ' . date('H:i', $t) : $s;
}
function fmt_bytes(float $b): string
{
    $u = ['B', 'KB', 'MB', 'GB'];
    $i = 0;
    while ($b >= 1024 && $i < 3) { $b /= 1024; $i++; }
    return nf($b, $i ? 1 : 0) . ' ' . $u[$i];
}
