<?php
// Kelimeler Android indirme sayacı.
//   GET indir.php?f=kelimeler.apk      → indirmeyi sayar, dosyaya yönlendirir (302; dosyayı sunucu doğrudan verir)
//   GET indir.php?f=kelimeler-32bit.apk
//   GET indir.php?say=1                → {"ok":true,"toplam":n,"bugun":n} (sayfadaki sayaç; 60 sn önbellek)
// Sayım: stats_daily metrik dl_kelimeler / dl_kelimeler32 (gün içi tekil: tuzlu IP+tarayıcı özeti, ertesi gün silinir).
// Botlar ve aynı kişinin 5 dakika içindeki tekrar tıklaması sayılmaz. Her indirmede Telegram'a bildirim (yanıttan sonra).
declare(strict_types=1);
ini_set('display_errors', '0');
const DOSYALAR = ['kelimeler.apk' => 'dl_kelimeler', 'kelimeler-32bit.apk' => 'dl_kelimeler32'];

require __DIR__ . '/../admin/lib/boot.php';
require __DIR__ . '/../admin/lib/db.php';
require __DIR__ . '/../admin/lib/notify.php';
require __DIR__ . '/../admin/lib/ziyaretci.php';

if (isset($_GET['say'])) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: public, max-age=60');
    try {
        $tot = (int)val("SELECT COALESCE(SUM(n), 0) FROM stats_daily WHERE metric IN ('dl_kelimeler', 'dl_kelimeler32')");
        $bug = (int)val("SELECT COALESCE(SUM(n), 0) FROM stats_daily WHERE metric IN ('dl_kelimeler', 'dl_kelimeler32') AND day = ?", [today()]);
        echo json_encode(['ok' => true, 'toplam' => $tot, 'bugun' => $bug]);
    } catch (Throwable $e) { adm_log('indir.php say: ' . $e->getMessage()); echo '{"ok":false}'; }
    exit;
}

$f = (string)($_GET['f'] ?? 'kelimeler.apk');
if (!isset(DOSYALAR[$f])) $f = 'kelimeler.apk';
// Önce yönlendir (indirme hiç beklemesin), sonra say.
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
header('Location: /kelimeler/' . $f, true, 302);
ignore_user_abort(true);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();

try {
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    if ($ua === '' || preg_match('~bot|crawl|spider|slurp|preview|headless|python|curl|wget|java/|okhttp|go-http|axios|scrapy|lighthouse|monitor~i', $ua)) exit;
    $metric = DOSYALAR[$f];
    $day = today();
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $salt = stats_salt();
    // Aynı kişi 5 dakika içinde yeniden basarsa sayma (indirme yöneticisi, çift tıklama)
    // (5 dakikalık dilim + bir önceki dilim: dilim sınırına denk gelen tekrar da yakalanır)
    $bucket = intdiv(time(), 300);
    $hb = fn(int $b) => substr(hash('sha256', $salt . '|dl|' . $ip . '|' . $ua . '|' . $f . '|' . $b, true), 0, 16);
    if (val('SELECT COUNT(*) FROM stats_seen WHERE day = ? AND metric = ? AND h = ?', [date('Y-m-d', ($bucket - 1) * 300), $metric . '_5dk', $hb($bucket - 1)])) exit;
    if (q('INSERT IGNORE INTO stats_seen (day, metric, h) VALUES (?, ?, ?)', [$day, $metric . '_5dk', $hb($bucket)])->rowCount() === 0) exit;
    $hDay = substr(hash('sha256', $salt . '|' . $ip . '|' . $ua . '|' . $day, true), 0, 16);
    $new = q('INSERT IGNORE INTO stats_seen (day, metric, h) VALUES (?, ?, ?)', [$day, $metric, $hDay])->rowCount() > 0 ? 1 : 0;
    q('INSERT INTO stats_daily (day, metric, n, uniques) VALUES (?, ?, 1, ?) ON DUPLICATE KEY UPDATE n = n + 1, uniques = uniques + ?', [$day, $metric, $new, $new]);
    // Sayfa da hangi cihazdan indirildiğini görsün (Trafik'teki boyutlarla aynı biçim)
    $dev = preg_match('~iPad|Tablet|Android(?!.*Mobile)~i', $ua) ? 'tablet' : (preg_match('~Mobi|iPhone|Android~i', $ua) ? 'mobile' : 'desktop');
    $lt = (string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '');
    $cc = preg_match('~^[a-z]{2,3}-([A-Z]{2})~', $lt, $m) ? $m[1] : '';
    q('INSERT INTO stats_feed (at, kind, path, dev, br, cc, detail) VALUES (?, ?, ?, ?, ?, ?, ?)', [now(), 'ev', '/kelimeler/android.html', $dev, ua_browser($ua), $cc, 'indir_' . ($f === 'kelimeler.apk' ? 'kelimeler' : 'kelimeler32')]);
    if (notify_enabled()) {
        $tot = (int)val("SELECT COALESCE(SUM(n), 0) FROM stats_daily WHERE metric IN ('dl_kelimeler', 'dl_kelimeler32')");
        $bug = (int)val("SELECT COALESCE(SUM(n), 0) FROM stats_daily WHERE metric IN ('dl_kelimeler', 'dl_kelimeler32') AND day = ?", [$day]);
        // Çok yoğun günde Telegram'ı boğmasın: saatte en çok 30 bildirim; fazlası yalnızca sayılır (panelde görünür).
        $saat = 'dl_tg:' . date('YmdH');
        $gonderilen = (int)(setting_get($saat, true) ?? 0);
        if ($gonderilen < 30) {
            setting_set($saat, (string)($gonderilen + 1), 7200);
            $cihaz = ['mobile' => 'Telefon', 'tablet' => 'Tablet', 'desktop' => 'Bilgisayar'][$dev] . ' · ' . ua_browser($ua) . ' · ' . ua_os($ua) . ($cc !== '' ? ' · ' . country_tr($cc) : '');
            notify_now('📥 Kelimeler indirildi' . ($f !== 'kelimeler.apk' ? ' (32-bit)' : '') . "\nBugün " . $bug . '. indirme · toplam ' . $tot . "\n" . $cihaz);
        }
    }
} catch (Throwable $e) {
    adm_log('indir.php: ' . $e->getMessage());
}
