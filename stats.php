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
    if (!in_array($t, ['pv', 'hb', 'ev'], true)) exit;

    $path = (string)($j['p'] ?? '/');
    $path = preg_replace('~[?#].*$~s', '', $path);
    $path = preg_replace('~[\x00-\x1F\x7F]~', '', $path);
    if ($path === '' || $path[0] !== '/') $path = '/';
    $path = mb_substr($path, 0, 191);
    $dev = in_array($j['d'] ?? '', ['mobile', 'tablet', 'desktop'], true) ? $j['d'] : 'desktop';
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
        $src = strtolower((string)($j['s'] ?? ''));
        if (preg_match('~^[a-z0-9._-]{1,40}$~', $src)) $dim('src', $src);
    }
    if ($ev !== '') $count('ev_' . $ev);
    if ($t === 'pv' || $t === 'hb') {
        q('INSERT INTO stats_online (h, last_seen, path, dev) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen), path = VALUES(path), dev = VALUES(dev)', [$hOn, now(), $path, $dev]);
    }
    // Ara sıra temizlik (cron kurulmamış olsa da tablolar büyümesin).
    if (mt_rand(1, 200) === 1) {
        q('DELETE FROM stats_seen WHERE day < ?', [$day]);
        q('DELETE FROM stats_online WHERE last_seen < ?', [date('Y-m-d H:i:s', time() - 900)]);
    }
} catch (Throwable $e) {
    adm_log('stats.php: ' . $e->getMessage());
}
