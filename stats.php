<?php
// Birinci taraf sayaç (çerezsiz). Gönderen: assets/oyunlar.js (navigator.sendBeacon, text/plain JSON).
// Her zaman 204 döner. Yalnızca agregat saklanır: stats_daily, stats_dim; tekillik için gün içi tuzlu hash (stats_seen,
// ertesi gün silinir); "şu an sitede" için stats_online (5 dk). Ham IP, tam tarayıcı kimliği ya da çerez saklanmaz.
//   {t:'pv', p:'/yol/', r:'google.com', l:'tr', d:'mobile', s:'utm_source', e?:'olay'}  sayfa görüntüleme
//   {t:'hb', p:'/yol/', e?:'engaged'|'engaged5'}                                         sayfa açıkken dakikada bir
//   {t:'ev', p:'/yol/', e:'olay'}                                                          siteye özel olay (okSay('olay'))
declare(strict_types=1);
ini_set('display_errors', '0');
http_response_code(204);
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') exit;
$raw = (string)file_get_contents('php://input', false, null, 0, 2048);
// Yanıtı hemen bitir, işi arkada yap (ziyaretçi beklemez).
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();

require __DIR__ . '/admin/lib/boot.php';
require __DIR__ . '/admin/lib/db.php';
require __DIR__ . '/admin/lib/ziyaretci.php';

try {
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($ua === '' || strlen($ua) > 600) exit;
    if (preg_match('~bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|preview|headless|phantom|selenium|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|python|curl|wget|java/|okhttp|go-http|axios|node-fetch|httpclient|libwww|scrapy|ahrefs|semrush|mj12|dotbot|petal|yandex|baidu|bytespider|gptbot|ccbot|perplexity|anthropic|claudebot~i', $ua)) exit;
    // Yalnızca kendi sitemizden gelen istekler (sendBeacon Origin başlığı yollar).
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '');
    $oh = strtolower((string)parse_url($origin, PHP_URL_HOST));
    $ok = [site_host(), 'localhost', '127.0.0.1'];
    if ($oh === '' || !in_array($oh, $ok, true)) exit;

    $j = json_decode($raw, true);
    if (!is_array($j)) exit;
    $t = (string)($j['t'] ?? '');
    if (!in_array($t, ['pv', 'hb', 'ev', 'wv', 'err'], true)) exit;

    $path = (string)($j['p'] ?? '/');
    $path = preg_replace('~[?#].*$~s', '', $path);
    $path = preg_replace('~[\x00-\x1F\x7F]~', '', $path);
    if ($path === '' || $path[0] !== '/') $path = '/';
    $path = mb_substr($path, 0, 191);
    $dev = in_array($j['d'] ?? '', ['mobile', 'tablet', 'desktop'], true) ? $j['d'] : 'desktop';
    $br = ua_browser($ua);
    $os = ua_os($ua);
    $tz = (string)($j['z'] ?? '');
    $lt = (string)($j['lt'] ?? '');
    $cc = guess_country(preg_match('~^[A-Za-z_]+/[A-Za-z_/+-]{1,40}$~', $tz) ? $tz : '', preg_match('~^[a-z]{2,3}[-_][A-Z]{2}$~', $lt) ? $lt : '');
    $ev = (string)($j['e'] ?? '');
    if (!preg_match('~^[a-z0-9_]{1,30}$~', $ev)) $ev = '';

    $day = today();
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $salt = stats_salt();
    $hDay = substr(hash('sha256', $salt . '|' . $ip . '|' . $ua . '|' . $day, true), 0, 16);
    $hOn = substr(hash('sha256', $salt . '|online|' . $ip . '|' . $ua, true), 0, 16);

    $count = function (string $metric) use ($day, $hDay): void {
        $new = q('INSERT IGNORE INTO stats_seen (day, metric, h) VALUES (?, ?, ?)', [$day, $metric, $hDay])->rowCount() > 0 ? 1 : 0;
        q('INSERT INTO stats_daily (day, metric, n, uniques) VALUES (?, ?, 1, ?) ON DUPLICATE KEY UPDATE n = n + 1, uniques = uniques + ?',
            [$day, $metric, $new, $new]);
    };
    $dim = function (string $d, string $v) use ($day): void {
        q('INSERT INTO stats_dim (day, dim, val, n) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE n = n + 1', [$day, $d, $v]);
    };

    if ($t === 'pv') {
        $count('pv');
        $dim('page', $path);
        $ref = strtolower((string)($j['r'] ?? ''));
        $ref = preg_replace('~^www\.~', '', $ref);
        if (!preg_match('~^[a-z0-9.-]{1,100}$~', $ref) || $ref === site_host()) $ref = 'direct';
        $dim('ref', $ref);
        $lang = strtolower((string)($j['l'] ?? ''));
        $dim('lang', preg_match('~^[a-z]{2}$~', $lang) ? $lang : 'xx');
        $dim('dev', $dev);
        $dim('br', $br);
        $dim('os', $os);
        $dim('cc', $cc !== '' ? $cc : 'XX');
        $src = strtolower((string)($j['s'] ?? ''));
        if (preg_match('~^[a-z0-9._-]{1,40}$~', $src)) $dim('src', $src);
        // Yolculuk: site içinden gelindiyse "önceki → bu" geçişi, dışarıdan gelindiyse giriş sayfası.
        $from = (string)($j['f'] ?? '');
        if ($from !== '' && $from[0] === '/' && !preg_match('~[\x00-\x1F]~', $from)) $dim('flow', mb_substr(path_group($from) . ' → ' . path_group($path), 0, 191));
        else $dim('entry', path_group($path));
        q('INSERT INTO stats_hour (day, hour, n) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE n = n + 1', [$day, (int)date('G')]);
    }
    if ($ev !== '') $count('ev_' . $ev);
    if ($t === 'wv') {
        $pg = path_group($path);
        foreach (VITAL_STEP as $m => $step) {
            if (!isset($j[$m]) || !is_numeric($j[$m])) continue;
            $v = (float)$j[$m];
            if ($v < 0 || ($m !== 'cls' && $v <= 0) || $v > 600000) continue;
            $bin = min(VITAL_MAXBIN[$m], (int)floor($v / $step));
            q('INSERT INTO stats_vital (day, pg, dev, metric, bin, n) VALUES (?, ?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE n = n + 1', [$day, $pg, $dev, $m, $bin]);
        }
    }
    if ($t === 'err') {
        $msg = mb_substr(trim((string)preg_replace('~[\x00-\x1F]+~', ' ', (string)($j['m'] ?? ''))), 0, 255);
        $src = mb_substr((string)preg_replace('~[^\w./-]~u', '', (string)($j['s'] ?? '')), 0, 191);
        $ln = max(0, min(10000000, (int)($j['ln'] ?? 0))); $col = max(0, min(100000, (int)($j['c'] ?? 0)));
        if ($msg !== '') {
            $eh = substr(md5($msg . '|' . $src . '|' . $ln, true), 0, 16);
            q('INSERT INTO stats_jserr (eh, msg, src, line, col, n, first_seen, last_seen, last_path, last_br, last_os, last_dev) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE n = n + 1, last_seen = VALUES(last_seen), last_path = VALUES(last_path), last_br = VALUES(last_br), last_os = VALUES(last_os), last_dev = VALUES(last_dev)',
                [$eh, $msg, $src, $ln, $col, now(), now(), $path, $br, $os, $dev]);
        }
    }
    if ($t === 'pv' || $t === 'hb') {
        q('INSERT INTO stats_online (h, last_seen, path, dev, br, os, cc, first_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE first_seen = IF(last_seen < ?, VALUES(first_seen), COALESCE(first_seen, VALUES(first_seen))),
           last_seen = VALUES(last_seen), path = VALUES(path), dev = VALUES(dev), br = VALUES(br), os = VALUES(os), cc = IF(VALUES(cc) = \'\', cc, VALUES(cc))',
            [$hOn, now(), $path, $dev, $br, $os, $cc, now(), date('Y-m-d H:i:s', time() - 900)]);
    }
    // Ara sıra temizlik (cron kurulmamış olsa da tablolar büyümesin).
    if (mt_rand(1, 200) === 1) {
        q('DELETE FROM stats_seen WHERE day < ?', [$day]);
        q('DELETE FROM stats_online WHERE last_seen < ?', [date('Y-m-d H:i:s', time() - 900)]);
    }
} catch (Throwable $e) {
    adm_log('stats.php: ' . $e->getMessage());
}
