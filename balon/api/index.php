<?php
// Balon Patlat — skor API'si (PHP + MySQL)
//
//   GET  ?a=top              → {day:[...], week:[...], all:[...]}   (oyuncu başına en iyi skor)
//   POST ?a=start            → {token}                               (oyun başında oturum açar)
//   POST ?a=submit  (JSON)   → {ok, rank:{day,week,all}}              (oyun sonunda skoru kaydeder)
//
// Hile koruması (tarayıcı oyunlarında %100 mümkün değil, ama işi zorlaştırır):
//   - Her skor, sunucunun verdiği tek kullanımlık oturum jetonuna bağlı
//   - Atış başına puan listesi gönderilir; toplam, sınırlar ve süre tutarlılığı kontrol edilir
//   - IP başına hız sınırı (IP'ler açık saklanmaz, tuzlu hash)

declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const MAX_SCORE      = 50000000;
const MAX_GAIN       = 300000;   // tek atışta alınabilecek en yüksek puan (bonus dahil)
const MAX_SHOTS      = 20000;
const MIN_SEC_PER_SHOT = 0.25;   // bir atışın uçuşu bundan kısa sürmez
const SESSION_TTL    = 6 * 3600; // oturum en fazla 6 saat geçerli
const START_PER_HOUR = 120;
const SUBMIT_PER_HOUR = 40;
const LIST_LIMIT     = 20;

function out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $err, int $code = 400): void { out(['ok' => false, 'error' => $err], $code); }

$cfgFile = __DIR__ . '/config.php';
if (!is_file($cfgFile)) fail('not_configured', 503);
$cfg = require $cfgFile;

try {
    $db = new PDO(
        'mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4',
        $cfg['db_user'], $cfg['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
    );
    $db->exec("SET time_zone = '+00:00'");
} catch (Throwable $e) {
    fail('db_unavailable', 503);
}

function create_tables(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS bp_sessions (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        token CHAR(32) NOT NULL,
        ip CHAR(64) NOT NULL,
        created_at DATETIME NOT NULL,
        used TINYINT(1) NOT NULL DEFAULT 0,
        last_seen DATETIME NULL,
        UNIQUE KEY uq_token (token),
        KEY ix_ip_time (ip, created_at),
        KEY ix_seen (last_seen)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS bp_scores (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(20) NOT NULL,
        score INT UNSIGNED NOT NULL,
        level SMALLINT UNSIGNED NOT NULL DEFAULT 1,
        shots INT UNSIGNED NOT NULL,
        duration INT UNSIGNED NOT NULL,
        ip CHAR(64) NOT NULL,
        created_at DATETIME NOT NULL,
        KEY ix_time_score (created_at, score),
        KEY ix_name_score (name, score),
        KEY ix_ip_time (ip, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS bp_stats (
        k VARCHAR(32) NOT NULL PRIMARY KEY,
        v BIGINT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// Eski kurulumları günceller (eksik sütun)
function migrate(PDO $db): void {
    try { $db->exec("ALTER TABLE bp_sessions ADD COLUMN last_seen DATETIME NULL, ADD KEY ix_seen (last_seen)"); } catch (Throwable $e) {}
}

// Tablo yoksa bir kere oluşturup sorguyu tekrar dener
function q(PDO $db, string $sql, array $args = []): PDOStatement {
    try {
        $st = $db->prepare($sql); $st->execute($args); return $st;
    } catch (PDOException $e) {
        $code = $e->getCode();
        if ($code === '42S02') create_tables($db);
        elseif ($code === '42S22') migrate($db);
        else throw $e;
        $st = $db->prepare($sql); $st->execute($args); return $st;
    }
}

function now_utc(): string { return gmdate('Y-m-d H:i:s'); }
const ONLINE_WINDOW = 75; // son 75 sn içinde sinyal gönderen oyuncu "şu an oynuyor"
function online_count(PDO $db): int {
    return (int)q($db, 'SELECT COUNT(*) FROM bp_sessions WHERE used = 0 AND last_seen >= ?', [gmdate('Y-m-d H:i:s', time() - ONLINE_WINDOW)])->fetchColumn();
}
function plays_count(PDO $db): int {
    return (int)(q($db, "SELECT v FROM bp_stats WHERE k = 'plays'")->fetchColumn() ?: 0);
}
function ip_hash(array $cfg): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return hash('sha256', $cfg['salt'] . '|' . $ip);
}
// Dönem başlangıçları İstanbul saatine göre (gün: 00:00, hafta: Pazartesi 00:00), UTC'ye çevrilir
function period_start(string $p): string {
    if ($p === 'all') return '2000-01-01 00:00:00';
    $tz = new DateTimeZone('Europe/Istanbul');
    $d = new DateTime('now', $tz);
    $d->setTime(0, 0, 0);
    if ($p === 'week') $d->modify('-' . ((int)$d->format('N') - 1) . ' days');
    $d->setTimezone(new DateTimeZone('UTC'));
    return $d->format('Y-m-d H:i:s');
}

function clean_name($raw): ?string {
    if (!is_string($raw)) return null;
    $n = preg_replace('/\s+/u', ' ', trim($raw));
    if ($n === null) return null;
    $len = mb_strlen($n, 'UTF-8');
    if ($len < 2 || $len > 16) return null;
    if (!preg_match('/^[\p{L}\p{N}][\p{L}\p{N} ._\-]*$/u', $n)) return null;
    $flat = mb_strtolower(preg_replace('/[^\p{L}\p{N}]/u', '', $n), 'UTF-8');
    $flat = strtr($flat, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '@' => 'a', 'ı' => 'i']);
    $bad = ['amk', 'aminako', 'amina', 'orospu', 'oruspu', 'sikti', 'sikis', 'sikerim', 'siktir', 'yarrak', 'yarak', 'pezevenk',
            'pic', 'gavat', 'kahpe', 'ibne', 'got', 'oç', 'oc', 'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'dick', 'pussy',
            'admin', 'moderator'];
    foreach ($bad as $w) {
        $short = mb_strlen($w, 'UTF-8') <= 3;
        if ($short ? $flat === $w : str_contains($flat, $w)) return null;
    }
    return $n;
}

$a = $_GET['a'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    // ---- Liderlik tablosu ----
    if ($a === 'top' && $method === 'GET') {
        $res = [];
        foreach (['day', 'week', 'all'] as $p) {
            $rows = q($db,
                'SELECT name, MAX(score) AS score FROM bp_scores WHERE created_at >= ? GROUP BY name ORDER BY score DESC, MIN(created_at) ASC LIMIT ' . LIST_LIMIT,
                [period_start($p)]
            )->fetchAll();
            $res[$p] = array_map(fn($r) => ['name' => $r['name'], 'score' => (int)$r['score']], $rows);
        }
        $res['total'] = (int)q($db, 'SELECT COUNT(*) FROM bp_scores')->fetchColumn();
        $res['plays'] = plays_count($db);
        $res['online'] = online_count($db);
        // İsteğe bağlı: ?me=İsim → o oyuncunun rekoru ve sıraları
        $me = isset($_GET['me']) ? clean_name($_GET['me']) : null;
        if ($me !== null) {
            $best = q($db, 'SELECT MAX(score) FROM bp_scores WHERE name = ?', [$me])->fetchColumn();
            if ($best !== null && $best !== false) {
                $info = ['name' => $me, 'best' => (int)$best, 'rank' => []];
                foreach (['day', 'week', 'all'] as $p) {
                    $start = period_start($p);
                    $mine = q($db, 'SELECT MAX(score) FROM bp_scores WHERE name = ? AND created_at >= ?', [$me, $start])->fetchColumn();
                    if ($mine === null || $mine === false) { $info['rank'][$p] = null; $info['score'][$p] = null; continue; }
                    $info['score'][$p] = (int)$mine;
                    $info['rank'][$p] = 1 + (int)q($db,
                        'SELECT COUNT(*) FROM (SELECT name FROM bp_scores WHERE created_at >= ? GROUP BY name HAVING MAX(score) > ?) t',
                        [$start, (int)$mine])->fetchColumn();
                }
                $res['me'] = $info;
            }
        }
        out(['ok' => true] + $res);
    }

    if ($method !== 'POST') fail('method', 405);
    $ip = ip_hash($cfg);

    // ---- Oyun başlangıcı: tek kullanımlık jeton ----
    if ($a === 'start') {
        $hourAgo = gmdate('Y-m-d H:i:s', time() - 3600);
        $n = (int)q($db, 'SELECT COUNT(*) FROM bp_sessions WHERE ip = ? AND created_at >= ?', [$ip, $hourAgo])->fetchColumn();
        if ($n >= START_PER_HOUR) fail('rate_limited', 429);
        if (random_int(1, 50) === 1) {
            q($db, 'DELETE FROM bp_sessions WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 2 * 86400)]);
        }
        $token = bin2hex(random_bytes(16));
        $now = now_utc();
        q($db, 'INSERT INTO bp_sessions (token, ip, created_at, last_seen) VALUES (?, ?, ?, ?)', [$token, $ip, $now, $now]);
        q($db, "INSERT INTO bp_stats (k, v) VALUES ('plays', 1) ON DUPLICATE KEY UPDATE v = v + 1");
        out(['ok' => true, 'token' => $token, 'online' => online_count($db), 'plays' => plays_count($db)]);
    }

    // ---- Çevrimiçi sinyali (oyun sürerken ~25 sn'de bir; end=true oyundan çıkış) ----
    if ($a === 'ping') {
        $in = json_decode(file_get_contents('php://input', false, null, 0, 2000) ?: '', true);
        $token = is_array($in) ? ($in['token'] ?? '') : '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{32}$/', $token)) fail('bad_token');
        $end = is_array($in) && !empty($in['end']);
        q($db, 'UPDATE bp_sessions SET last_seen = ? WHERE token = ? AND used = 0', [$end ? null : now_utc(), $token]);
        out(['ok' => true, 'online' => online_count($db)]);
    }

    // ---- Skor gönderme ----
    if ($a === 'submit') {
        $raw = file_get_contents('php://input', false, null, 0, 200000);
        $in = json_decode($raw ?: '', true);
        if (!is_array($in)) fail('bad_json');

        $token = $in['token'] ?? '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{32}$/', $token)) fail('bad_token');
        $name = clean_name($in['name'] ?? null);
        if ($name === null) fail('bad_name');

        $score = $in['score'] ?? null; $shots = $in['shots'] ?? null; $level = $in['level'] ?? 1; $gains = $in['gains'] ?? null;
        if (!is_int($score) || $score <= 0 || $score > MAX_SCORE || $score % 10 !== 0) fail('bad_score');
        if (!is_int($shots) || $shots < 1 || $shots > MAX_SHOTS) fail('bad_shots');
        if (!is_int($level) || $level < 1 || $level > 999) fail('bad_level');
        if (!is_array($gains) || count($gains) !== $shots) fail('bad_gains');
        $sum = 0;
        foreach ($gains as $g) {
            if (!is_int($g) || $g < 0 || $g > MAX_GAIN || $g % 10 !== 0) fail('bad_gains');
            $sum += $g;
        }
        if ($sum !== $score) fail('bad_gains');

        $hourAgo = gmdate('Y-m-d H:i:s', time() - 3600);
        $n = (int)q($db, 'SELECT COUNT(*) FROM bp_scores WHERE ip = ? AND created_at >= ?', [$ip, $hourAgo])->fetchColumn();
        if ($n >= SUBMIT_PER_HOUR) fail('rate_limited', 429);

        $s = q($db, 'SELECT created_at, used FROM bp_sessions WHERE token = ?', [$token])->fetch();
        if (!$s || (int)$s['used'] === 1) fail('bad_token');
        $elapsed = time() - strtotime($s['created_at'] . ' UTC');
        if ($elapsed > SESSION_TTL) fail('expired');
        if ($elapsed < $shots * MIN_SEC_PER_SHOT) fail('too_fast');

        // Jetonu atomik olarak harca (aynı jetonla ikinci kayıt olmasın)
        $u = q($db, 'UPDATE bp_sessions SET used = 1 WHERE token = ? AND used = 0', [$token]);
        if ($u->rowCount() !== 1) fail('bad_token');

        q($db, 'INSERT INTO bp_scores (name, score, level, shots, duration, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$name, $score, $level, $shots, $elapsed, $ip, now_utc()]);

        $rank = [];
        foreach (['day', 'week', 'all'] as $p) {
            $rank[$p] = 1 + (int)q($db,
                'SELECT COUNT(*) FROM (SELECT name FROM bp_scores WHERE created_at >= ? GROUP BY name HAVING MAX(score) > ?) t',
                [period_start($p), $score]
            )->fetchColumn();
        }
        out(['ok' => true, 'name' => $name, 'rank' => $rank]);
    }

    fail('unknown_action', 404);
} catch (Throwable $e) {
    error_log('[balon] ' . $e->getMessage());
    fail('server_error', 500);
}
