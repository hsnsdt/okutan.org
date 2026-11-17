<?php
// Balon Patlat — skor API'si (PHP + MySQL)
//
//   GET  ?a=top&mode=classic|timed|daily[&me=İsim]  → liderlik listeleri (oyuncu başına en iyi skor)
//   GET  ?a=cities                                   → bu haftanın şehir sıralaması
//   GET  ?a=profile&name=İsim                        → oyuncu profili
//   GET  ?a=challenge&id=kod                         → meydan okuma bilgisi (tahta tohumu + hedef skor)
//   GET  ?a=champions                                → geçmiş aylık sezonların ilk üçü
//   POST ?a=admin_login {pass} / admin_stats / admin_scores / admin_act / admin_ban  → yönetim (config.php: admin_pass)
//   POST ?a=start {mode, ch}                         → {token, seed, mode, day}
//   POST ?a=ping  {token, end}                       → çevrimiçi sinyali
//   POST ?a=submit {token, name, score, shots, level, gains, seed, city} → {ok, rank, id}
//
// Hile koruması (tarayıcı oyunlarında %100 mümkün değil, ama işi zorlaştırır):
//   - Her skor, sunucunun verdiği tek kullanımlık oturum jetonuna ve rastgelelik tohumuna bağlı
//   - Atış başına puan listesi: toplam, sınırlar ve süre tutarlılığı kontrol edilir
//   - Şüpheli skorlar (çok hızlı atış, olağandışı puan) işaretlenir ve listelerde gösterilmez
//   - IP başına hız sınırı (IP'ler açık saklanmaz, tuzlu hash)

declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const MAX_SCORE        = 50000000;
const MAX_GAIN         = 500000;   // tek atışta alınabilecek en yüksek puan (bonus dahil)
const MAX_SHOTS        = 20000;
const MIN_SEC_PER_SHOT = 0.25;     // bir atışın uçuşu bundan kısa sürmez
const SESSION_TTL      = 6 * 3600; // oturum en fazla 6 saat geçerli
const START_PER_HOUR   = 150;
const SUBMIT_PER_HOUR  = 60;
const LIST_LIMIT       = 20;
const TIMED_SECONDS    = 120;
const MODES            = ['classic', 'timed', 'daily'];

const CITIES = ['Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin', 'Aydın',
    'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
    'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari',
    'Hatay', 'Iğdır', 'Isparta', 'İstanbul', 'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kilis',
    'Kırıkkale', 'Kırklareli', 'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş',
    'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize', 'Sakarya', 'Samsun', 'Şanlıurfa', 'Siirt', 'Sinop', 'Şırnak', 'Sivas', 'Tekirdağ',
    'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak'];

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
        mode VARCHAR(8) NOT NULL DEFAULT 'classic',
        seed INT UNSIGNED NOT NULL DEFAULT 0,
        day DATE NULL,
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
        mode VARCHAR(8) NOT NULL DEFAULT 'classic',
        city VARCHAR(24) NULL,
        seed INT UNSIGNED NOT NULL DEFAULT 0,
        day DATE NULL,
        flag TINYINT(1) NOT NULL DEFAULT 0,
        KEY ix_time_score (created_at, score),
        KEY ix_name_score (name, score),
        KEY ix_ip_time (ip, created_at),
        KEY ix_mode_time (mode, created_at),
        KEY ix_mode_day (mode, day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS bp_bans (
        name VARCHAR(20) NOT NULL PRIMARY KEY,
        created_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci");
    $db->exec("CREATE TABLE IF NOT EXISTS bp_daily (
        day DATE NOT NULL PRIMARY KEY,
        plays INT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS bp_logins (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        ip CHAR(64) NOT NULL,
        at DATETIME NOT NULL,
        KEY ix_ip_at (ip, at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS bp_stats (
        k VARCHAR(32) NOT NULL PRIMARY KEY,
        v BIGINT UNSIGNED NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// Eski kurulumları günceller (eksik sütunlar). Her adım ayrı; zaten varsa hata yutulur.
function migrate(PDO $db): void {
    $steps = [
        "ALTER TABLE bp_sessions ADD COLUMN last_seen DATETIME NULL, ADD KEY ix_seen (last_seen)",
        "ALTER TABLE bp_sessions ADD COLUMN mode VARCHAR(8) NOT NULL DEFAULT 'classic'",
        "ALTER TABLE bp_sessions ADD COLUMN seed INT UNSIGNED NOT NULL DEFAULT 0",
        "ALTER TABLE bp_sessions ADD COLUMN day DATE NULL",
        "ALTER TABLE bp_scores ADD COLUMN mode VARCHAR(8) NOT NULL DEFAULT 'classic'",
        "ALTER TABLE bp_scores ADD COLUMN city VARCHAR(24) NULL",
        "ALTER TABLE bp_scores ADD COLUMN seed INT UNSIGNED NOT NULL DEFAULT 0",
        "ALTER TABLE bp_scores ADD COLUMN day DATE NULL",
        "ALTER TABLE bp_scores ADD COLUMN flag TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE bp_scores ADD KEY ix_mode_time (mode, created_at)",
        "ALTER TABLE bp_scores ADD KEY ix_mode_day (mode, day)",
    ];
    foreach ($steps as $sql) { try { $db->exec($sql); } catch (Throwable $e) {} }
}

// Tablo/sütun yoksa bir kere oluşturup sorguyu tekrar dener
function q(PDO $db, string $sql, array $args = []): PDOStatement {
    try {
        $st = $db->prepare($sql); $st->execute($args); return $st;
    } catch (PDOException $e) {
        $code = $e->getCode();
        if ($code === '42S02') { create_tables($db); migrate($db); }  // eksik tablo (yeni tablolar dahil)
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
function ist_today(): string { return (new DateTime('now', new DateTimeZone('Europe/Istanbul')))->format('Y-m-d'); }
// Dönem başlangıçları İstanbul saatine göre (gün: 00:00, hafta: Pazartesi 00:00), UTC'ye çevrilir
function period_start(string $p): string {
    if ($p === 'all') return '2000-01-01 00:00:00';
    $d = new DateTime('now', new DateTimeZone('Europe/Istanbul'));
    $d->setTime(0, 0, 0);
    if ($p === 'week') $d->modify('-' . ((int)$d->format('N') - 1) . ' days');
    if ($p === 'month') $d->modify('first day of this month');
    $d->setTimezone(new DateTimeZone('UTC'));
    return $d->format('Y-m-d H:i:s');
}
// FNV-1a 32 bit: günün bulmacasının tohumu (istemcideki ile birebir aynı)
function fnv1a(string $s): int {
    $h = 0x811c9dc5;
    for ($i = 0, $n = strlen($s); $i < $n; $i++) { $h ^= ord($s[$i]); $h = ($h * 0x01000193) & 0xffffffff; }
    return $h;
}
function daily_seed(string $day): int { return fnv1a('balon-' . $day); }
function get_mode($m): string { return in_array($m, MODES, true) ? $m : 'classic'; }
function clean_city($c): ?string { return is_string($c) && in_array($c, CITIES, true) ? $c : null; }

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

// Bir mod + dönem için liste (işaretli skorlar hariç)
function top_list(PDO $db, string $mode, string $period): array {
    if ($mode === 'daily') {
        $rows = q($db, 'SELECT name, MAX(score) AS score, MAX(city) AS city FROM bp_scores WHERE mode = ? AND day = ? AND flag = 0 GROUP BY name ORDER BY score DESC, MIN(created_at) ASC LIMIT ' . LIST_LIMIT,
            ['daily', ist_today()])->fetchAll();
    } else {
        $rows = q($db, 'SELECT name, MAX(score) AS score, MAX(city) AS city FROM bp_scores WHERE mode = ? AND created_at >= ? AND flag = 0 GROUP BY name ORDER BY score DESC, MIN(created_at) ASC LIMIT ' . LIST_LIMIT,
            [$mode, period_start($period)])->fetchAll();
    }
    return array_map(fn($r) => ['name' => $r['name'], 'score' => (int)$r['score'], 'city' => $r['city'] ?: null], $rows);
}
function rank_of(PDO $db, string $mode, string $period, int $score): int {
    if ($mode === 'daily') {
        return 1 + (int)q($db, 'SELECT COUNT(*) FROM (SELECT name FROM bp_scores WHERE mode = ? AND day = ? AND flag = 0 GROUP BY name HAVING MAX(score) > ?) t',
            ['daily', ist_today(), $score])->fetchColumn();
    }
    return 1 + (int)q($db, 'SELECT COUNT(*) FROM (SELECT name FROM bp_scores WHERE mode = ? AND created_at >= ? AND flag = 0 GROUP BY name HAVING MAX(score) > ?) t',
        [$mode, period_start($period), $score])->fetchColumn();
}
function periods(string $mode): array { return $mode === 'daily' ? ['day'] : ['day', 'week', 'month', 'all']; }

// Geçmiş aylık sezonlar (klasik mod): her ayın ilk üçü, en yeniden eskiye
function champions(PDO $db, int $months = 12): array {
    $tz = new DateTimeZone('Europe/Istanbul'); $utc = new DateTimeZone('UTC');
    $out = [];
    for ($i = 1; $i <= $months; $i++) {
        $start = new DateTime('first day of this month 00:00', $tz); $start->modify("-$i month");
        $end = clone $start; $end->modify('+1 month');
        $label = $start->format('Y-m');
        $s = (clone $start)->setTimezone($utc)->format('Y-m-d H:i:s');
        $e = (clone $end)->setTimezone($utc)->format('Y-m-d H:i:s');
        $rows = q($db, 'SELECT name, MAX(score) AS score FROM bp_scores WHERE mode = ? AND flag = 0 AND created_at >= ? AND created_at < ? GROUP BY name ORDER BY score DESC, MIN(created_at) ASC LIMIT 3',
            ['classic', $s, $e])->fetchAll();
        if ($rows) $out[] = ['month' => $label, 'top' => array_map(fn($r) => ['name' => $r['name'], 'score' => (int)$r['score']], $rows)];
    }
    return $out;
}
function is_banned(PDO $db, string $name): bool {
    return (bool)q($db, 'SELECT 1 FROM bp_bans WHERE name = ?', [$name])->fetchColumn();
}

// ---- Yönetim: config.php içindeki admin_pass ile giriş, 12 saatlik imzalı jeton ----
function admin_token(array $cfg): string {
    $exp = time() + 12 * 3600;
    return $exp . '.' . hash_hmac('sha256', (string)$exp, $cfg['salt'] . '|admin|' . ($cfg['admin_pass'] ?? ''));
}
function admin_check(array $cfg, $tok): void {
    if (empty($cfg['admin_pass'])) fail('admin_disabled', 403);
    if (!is_string($tok) || !preg_match('/^(\d+)\.([a-f0-9]{64})$/', $tok, $m)) fail('unauthorized', 401);
    if ((int)$m[1] < time()) fail('unauthorized', 401);
    $want = hash_hmac('sha256', $m[1], $cfg['salt'] . '|admin|' . $cfg['admin_pass']);
    if (!hash_equals($want, $m[2])) fail('unauthorized', 401);
}

$a = $_GET['a'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    // ---- Liderlik tablosu ----
    if ($a === 'top' && $method === 'GET') {
        $mode = get_mode($_GET['mode'] ?? 'classic');
        $res = ['mode' => $mode, 'day' => ist_today()];
        foreach (periods($mode) as $p) $res[$p] = top_list($db, $mode, $p);
        if ($mode === 'daily') { $res['week'] = $res['day']; $res['month'] = $res['day']; $res['all'] = $res['day']; }
        // rozetler için: klasik tüm zamanlar 1.si ve bugünün 1.si
        $k = q($db, "SELECT name FROM bp_scores WHERE mode = 'classic' AND flag = 0 ORDER BY score DESC, created_at ASC LIMIT 1")->fetchColumn();
        $h = q($db, "SELECT name FROM bp_scores WHERE created_at >= ? AND flag = 0 ORDER BY score DESC, created_at ASC LIMIT 1", [period_start('day')])->fetchColumn();
        $res['king'] = $k ?: null; $res['hot'] = $h ?: null;
        $res['total'] = (int)q($db, 'SELECT COUNT(*) FROM bp_scores')->fetchColumn();
        $res['plays'] = plays_count($db);
        $res['online'] = online_count($db);
        $me = isset($_GET['me']) ? clean_name($_GET['me']) : null;
        if ($me !== null) {
            $best = q($db, 'SELECT MAX(score) FROM bp_scores WHERE name = ? AND mode = ?', [$me, $mode])->fetchColumn();
            $info = ['name' => $me, 'best' => $best !== null && $best !== false ? (int)$best : 0, 'rank' => [], 'score' => []];
            foreach (['day', 'week', 'month', 'all'] as $p) {
                if ($mode === 'daily') {
                    $mine = q($db, 'SELECT MAX(score) FROM bp_scores WHERE name = ? AND mode = ? AND day = ?', [$me, 'daily', ist_today()])->fetchColumn();
                } else {
                    $mine = q($db, 'SELECT MAX(score) FROM bp_scores WHERE name = ? AND mode = ? AND created_at >= ?', [$me, $mode, period_start($p)])->fetchColumn();
                }
                if ($mine === null || $mine === false) { $info['rank'][$p] = null; $info['score'][$p] = null; continue; }
                $info['score'][$p] = (int)$mine;
                $info['rank'][$p] = rank_of($db, $mode, $p, (int)$mine);
            }
            $res['me'] = $info;
        }
        out(['ok' => true] + $res);
    }

    // ---- Şehir sıralaması (bu hafta, klasik mod: her oyuncunun en iyi skoru şehrine yazılır) ----
    if ($a === 'cities' && $method === 'GET') {
        $rows = q($db, 'SELECT city, SUM(best) AS total, COUNT(*) AS players FROM (
                SELECT name, city, MAX(score) AS best FROM bp_scores
                WHERE mode = ? AND created_at >= ? AND flag = 0 AND city IS NOT NULL GROUP BY name, city
            ) t GROUP BY city ORDER BY total DESC LIMIT 20', ['classic', period_start('week')])->fetchAll();
        out(['ok' => true, 'cities' => array_map(fn($r) => ['city' => $r['city'], 'score' => (int)$r['total'], 'players' => (int)$r['players']], $rows)]);
    }

    // ---- Şampiyonlar duvarı (geçmiş aylık sezonlar) ----
    if ($a === 'champions' && $method === 'GET') {
        out(['ok' => true, 'seasons' => champions($db)]);
    }

    // ---- Meydan okuma ----
    if ($a === 'challenge' && $method === 'GET') {
        $id = $_GET['id'] ?? '';
        if (!is_string($id) || !preg_match('/^[0-9a-z]{1,10}$/', $id)) fail('bad_id');
        $r = q($db, 'SELECT name, score, level, mode, seed FROM bp_scores WHERE id = ? AND flag = 0', [(int)base_convert($id, 36, 10)])->fetch();
        if (!$r || $r['mode'] !== 'classic' || (int)$r['seed'] === 0) fail('not_found', 404);
        out(['ok' => true, 'id' => $id, 'name' => $r['name'], 'score' => (int)$r['score'], 'level' => (int)$r['level']]);
    }

    // ---- Oyuncu profili ----
    if ($a === 'profile' && $method === 'GET') {
        $name = clean_name($_GET['name'] ?? null);
        if ($name === null) fail('bad_name');
        $agg = q($db, 'SELECT COUNT(*) AS games, COALESCE(SUM(score),0) AS total, MIN(created_at) AS first FROM bp_scores WHERE name = ?', [$name])->fetch();
        if (!$agg || (int)$agg['games'] === 0) fail('not_found', 404);
        $best = [];
        foreach (MODES as $m) {
            $b = q($db, 'SELECT MAX(score) FROM bp_scores WHERE name = ? AND mode = ?', [$name, $m])->fetchColumn();
            $best[$m] = $b !== null && $b !== false ? (int)$b : 0;
        }
        $city = q($db, 'SELECT city FROM bp_scores WHERE name = ? AND city IS NOT NULL ORDER BY created_at DESC LIMIT 1', [$name])->fetchColumn() ?: null;
        $recent = q($db, 'SELECT score, mode, level, created_at FROM bp_scores WHERE name = ? ORDER BY created_at DESC LIMIT 8', [$name])->fetchAll();
        $rankAll = $best['classic'] > 0 ? rank_of($db, 'classic', 'all', $best['classic']) : null;
        // günlük bulmaca serisi: bugünden (ya da dünden) geriye kesintisiz gün sayısı
        $days = q($db, 'SELECT DISTINCT day FROM bp_scores WHERE name = ? AND mode = ? AND day IS NOT NULL ORDER BY day DESC LIMIT 400', [$name, 'daily'])->fetchAll(PDO::FETCH_COLUMN);
        $streak = 0;
        if ($days) {
            $cur = new DateTime(ist_today());
            if ($days[0] !== $cur->format('Y-m-d')) $cur->modify('-1 day');
            foreach ($days as $d) {
                if ($d === $cur->format('Y-m-d')) { $streak++; $cur->modify('-1 day'); } else break;
            }
        }
        $games = (int)$agg['games'];
        $badges = [];
        if ($games >= 1) $badges[] = 'first';
        foreach ([10 => 'g10', 50 => 'g50', 100 => 'g100'] as $n => $id) if ($games >= $n) $badges[] = $id;
        foreach ([1000 => 's1k', 5000 => 's5k', 10000 => 's10k', 25000 => 's25k'] as $n => $id) if ($best['classic'] >= $n) $badges[] = $id;
        if ($best['timed'] >= 1000) $badges[] = 'timed1k';
        if ($best['daily'] > 0) $badges[] = 'daily1';
        if ($streak >= 3) $badges[] = 'daily3';
        if ($streak >= 7) $badges[] = 'daily7';
        if ($rankAll === 1) $badges[] = 'king';
        $champ = 0; $pod = 0;
        foreach (champions($db) as $season) {
            foreach ($season['top'] as $i => $r) {
                if (mb_strtolower($r['name'], 'UTF-8') === mb_strtolower($name, 'UTF-8')) { if ($i === 0) $champ++; else $pod++; }
            }
        }
        if ($champ) $badges[] = 'champ';
        if ($pod || $champ) $badges[] = 'podium';
        out(['ok' => true, 'name' => $name, 'city' => $city, 'games' => $games, 'total' => (int)$agg['total'],
            'first' => substr((string)$agg['first'], 0, 10), 'best' => $best, 'rank' => $rankAll, 'streak' => $streak, 'badges' => $badges, 'champ' => $champ,
            'recent' => array_map(fn($r) => ['score' => (int)$r['score'], 'mode' => $r['mode'], 'level' => (int)$r['level'], 'at' => substr((string)$r['created_at'], 0, 10)], $recent)]);
    }

    if ($method !== 'POST') fail('method', 405);
    $ip = ip_hash($cfg);

    // ---- Oyun başlangıcı: tek kullanımlık jeton + tohum ----
    if ($a === 'start') {
        $in = json_decode(file_get_contents('php://input', false, null, 0, 2000) ?: '', true);
        $mode = get_mode(is_array($in) ? ($in['mode'] ?? 'classic') : 'classic');
        $hourAgo = gmdate('Y-m-d H:i:s', time() - 3600);
        $n = (int)q($db, 'SELECT COUNT(*) FROM bp_sessions WHERE ip = ? AND created_at >= ?', [$ip, $hourAgo])->fetchColumn();
        if ($n >= START_PER_HOUR) fail('rate_limited', 429);
        if (random_int(1, 50) === 1) {
            q($db, 'DELETE FROM bp_sessions WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 2 * 86400)]);
        }
        $day = null; $seed = random_int(1, 0x7fffffff); $target = null;
        if ($mode === 'daily') { $day = ist_today(); $seed = daily_seed($day); }
        $ch = is_array($in) ? ($in['ch'] ?? null) : null;
        if ($mode === 'classic' && is_string($ch) && preg_match('/^[0-9a-z]{1,10}$/', $ch)) {
            $r = q($db, 'SELECT name, score, seed, mode FROM bp_scores WHERE id = ? AND flag = 0', [(int)base_convert($ch, 36, 10)])->fetch();
            if ($r && $r['mode'] === 'classic' && (int)$r['seed'] > 0) { $seed = (int)$r['seed']; $target = ['name' => $r['name'], 'score' => (int)$r['score']]; }
        }
        $token = bin2hex(random_bytes(16));
        $now = now_utc();
        q($db, 'INSERT INTO bp_sessions (token, ip, created_at, last_seen, mode, seed, day) VALUES (?, ?, ?, ?, ?, ?, ?)', [$token, $ip, $now, $now, $mode, $seed, $day]);
        q($db, "INSERT INTO bp_stats (k, v) VALUES ('plays', 1) ON DUPLICATE KEY UPDATE v = v + 1");
        q($db, 'INSERT INTO bp_daily (day, plays) VALUES (?, 1) ON DUPLICATE KEY UPDATE plays = plays + 1', [ist_today()]);
        out(['ok' => true, 'token' => $token, 'seed' => $seed, 'mode' => $mode, 'day' => $day, 'target' => $target,
            'online' => online_count($db), 'plays' => plays_count($db)]);
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
        $raw = file_get_contents('php://input', false, null, 0, 300000);
        $in = json_decode($raw ?: '', true);
        if (!is_array($in)) fail('bad_json');

        $token = $in['token'] ?? '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{32}$/', $token)) fail('bad_token');
        $name = clean_name($in['name'] ?? null);
        if ($name === null || is_banned($db, $name)) fail('bad_name');
        $city = clean_city($in['city'] ?? null);

        $score = $in['score'] ?? null; $shots = $in['shots'] ?? null; $level = $in['level'] ?? 1; $gains = $in['gains'] ?? null;
        if (!is_int($score) || $score <= 0 || $score > MAX_SCORE || $score % 10 !== 0) fail('bad_score');
        if (!is_int($shots) || $shots < 1 || $shots > MAX_SHOTS) fail('bad_shots');
        if (!is_int($level) || $level < 1 || $level > 999) fail('bad_level');
        if (!is_array($gains) || count($gains) !== $shots) fail('bad_gains');
        $sum = 0; $maxGain = 0;
        foreach ($gains as $g) {
            if (!is_int($g) || $g < 0 || $g > MAX_GAIN || $g % 10 !== 0) fail('bad_gains');
            $sum += $g; if ($g > $maxGain) $maxGain = $g;
        }
        if ($sum !== $score) fail('bad_gains');

        $hourAgo = gmdate('Y-m-d H:i:s', time() - 3600);
        $n = (int)q($db, 'SELECT COUNT(*) FROM bp_scores WHERE ip = ? AND created_at >= ?', [$ip, $hourAgo])->fetchColumn();
        if ($n >= SUBMIT_PER_HOUR) fail('rate_limited', 429);

        $s = q($db, 'SELECT created_at, used, mode, seed, day FROM bp_sessions WHERE token = ?', [$token])->fetch();
        if (!$s || (int)$s['used'] === 1) fail('bad_token');
        $mode = get_mode($s['mode']);
        // tohum, oturumun tohumuyla aynı olmalı (başka bir tahtada oynanmış skor kabul edilmez)
        if ((int)$s['seed'] !== 0 && ($in['seed'] ?? null) !== (int)$s['seed']) fail('bad_seed');
        $elapsed = time() - strtotime($s['created_at'] . ' UTC');
        if ($elapsed > SESSION_TTL) fail('expired');
        if ($elapsed < $shots * MIN_SEC_PER_SHOT) fail('too_fast');
        $day = $s['day'] ?: null;
        if ($mode === 'daily') {
            // günün bulmacası: kişi başı günde tek deneme
            $done = q($db, 'SELECT COUNT(*) FROM bp_scores WHERE name = ? AND mode = ? AND day = ?', [$name, 'daily', $day])->fetchColumn();
            if ((int)$done > 0) fail('daily_done');
        }

        // Şüpheli skor işaretleme (listelerde gösterilmez)
        $flag = 0;
        if ($shots >= 30 && $elapsed / $shots < 0.4) $flag = 1;                 // insan üstü atış hızı
        if ($maxGain > 150000 && $level <= 2) $flag = 1;                          // erken seviyede olağandışı tek atış
        if ($shots >= 20 && $score / $shots > 3000) $flag = 1;                    // atış başına olağandışı ortalama
        if ($mode === 'timed' && $elapsed < 20 && $score > 3000) $flag = 1;

        // Jetonu atomik olarak harca (aynı jetonla ikinci kayıt olmasın)
        $u = q($db, 'UPDATE bp_sessions SET used = 1 WHERE token = ? AND used = 0', [$token]);
        if ($u->rowCount() !== 1) fail('bad_token');

        q($db, 'INSERT INTO bp_scores (name, score, level, shots, duration, ip, created_at, mode, city, seed, day, flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$name, $score, $level, $shots, $elapsed, $ip, now_utc(), $mode, $city, (int)$s['seed'], $day, $flag]);
        $id = (int)$db->lastInsertId();

        $rank = [];
        foreach (['day', 'week', 'month', 'all'] as $p) $rank[$p] = rank_of($db, $mode, $mode === 'daily' ? 'day' : $p, $score);
        out(['ok' => true, 'name' => $name, 'mode' => $mode, 'rank' => $rank, 'id' => base_convert((string)$id, 10, 36)]);
    }

    // ---- Yönetim ----
    if (strpos($a, 'admin_') === 0) {
        $in = json_decode(file_get_contents('php://input', false, null, 0, 10000) ?: '', true);
        if (!is_array($in)) $in = [];
        if ($a === 'admin_login') {
            if (empty($cfg['admin_pass'])) fail('admin_disabled', 403);
            $hourAgo = gmdate('Y-m-d H:i:s', time() - 3600);
            $n = (int)q($db, 'SELECT COUNT(*) FROM bp_logins WHERE ip = ? AND at >= ?', [$ip, $hourAgo])->fetchColumn();
            if ($n >= 10) fail('rate_limited', 429);
            q($db, 'INSERT INTO bp_logins (ip, at) VALUES (?, ?)', [$ip, now_utc()]);
            $pass = $in['pass'] ?? '';
            if (!is_string($pass) || !hash_equals((string)$cfg['admin_pass'], $pass)) { usleep(400000); fail('wrong_pass', 401); }
            out(['ok' => true, 'token' => admin_token($cfg)]);
        }
        admin_check($cfg, $in['t'] ?? null);

        if ($a === 'admin_stats') {
            $from = (new DateTime('now', new DateTimeZone('Europe/Istanbul')))->modify('-29 days')->format('Y-m-d');
            $plays = q($db, 'SELECT day, plays FROM bp_daily WHERE day >= ? ORDER BY day', [$from])->fetchAll();
            $scores = q($db, "SELECT DATE(CONVERT_TZ(created_at, '+00:00', '+03:00')) AS day, COUNT(*) AS n, COUNT(DISTINCT name) AS players FROM bp_scores WHERE created_at >= ? GROUP BY day ORDER BY day",
                [gmdate('Y-m-d H:i:s', time() - 30 * 86400)])->fetchAll();
            out(['ok' => true,
                'plays' => array_map(fn($r) => ['day' => $r['day'], 'n' => (int)$r['plays']], $plays),
                'scores' => array_map(fn($r) => ['day' => $r['day'], 'n' => (int)$r['n'], 'players' => (int)$r['players']], $scores),
                'totals' => [
                    'plays' => plays_count($db),
                    'scores' => (int)q($db, 'SELECT COUNT(*) FROM bp_scores')->fetchColumn(),
                    'players' => (int)q($db, 'SELECT COUNT(DISTINCT name) FROM bp_scores')->fetchColumn(),
                    'flagged' => (int)q($db, 'SELECT COUNT(*) FROM bp_scores WHERE flag = 1')->fetchColumn(),
                    'online' => online_count($db),
                ],
                'bans' => q($db, 'SELECT name, created_at FROM bp_bans ORDER BY created_at DESC LIMIT 200')->fetchAll()]);
        }
        if ($a === 'admin_scores') {
            $filter = $in['filter'] ?? 'flagged'; $qn = $in['q'] ?? ''; $page = max(0, (int)($in['page'] ?? 0));
            $where = []; $args = [];
            if ($filter === 'flagged') $where[] = 'flag = 1';
            if (is_string($qn) && $qn !== '') { $where[] = 'name LIKE ?'; $args[] = '%' . str_replace(['%', '_'], ['\%', '\_'], mb_substr($qn, 0, 20)) . '%'; }
            $sql = 'SELECT id, name, score, mode, level, shots, duration, city, flag, created_at FROM bp_scores' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') .
                ($filter === 'top' ? ' ORDER BY score DESC' : ' ORDER BY id DESC') . ' LIMIT 50 OFFSET ' . ($page * 50);
            $rows = q($db, $sql, $args)->fetchAll();
            out(['ok' => true, 'rows' => array_map(fn($r) => [
                'id' => (int)$r['id'], 'name' => $r['name'], 'score' => (int)$r['score'], 'mode' => $r['mode'], 'level' => (int)$r['level'],
                'shots' => (int)$r['shots'], 'duration' => (int)$r['duration'], 'city' => $r['city'], 'flag' => (int)$r['flag'], 'at' => $r['created_at'],
            ], $rows)]);
        }
        if ($a === 'admin_act') {
            $id = (int)($in['id'] ?? 0); $act = $in['act'] ?? '';
            if ($id <= 0) fail('bad_id');
            if ($act === 'approve') q($db, 'UPDATE bp_scores SET flag = 0 WHERE id = ?', [$id]);
            elseif ($act === 'flag') q($db, 'UPDATE bp_scores SET flag = 1 WHERE id = ?', [$id]);
            elseif ($act === 'delete') q($db, 'DELETE FROM bp_scores WHERE id = ?', [$id]);
            else fail('bad_act');
            out(['ok' => true]);
        }
        if ($a === 'admin_ban') {
            $name = is_string($in['name'] ?? null) ? preg_replace('/\s+/u', ' ', trim($in['name'])) : '';
            if ($name === '' || mb_strlen($name, 'UTF-8') > 20) fail('bad_name');
            if (!empty($in['unban'])) { q($db, 'DELETE FROM bp_bans WHERE name = ?', [$name]); out(['ok' => true]); }
            q($db, 'INSERT IGNORE INTO bp_bans (name, created_at) VALUES (?, ?)', [$name, now_utc()]);
            $del = q($db, 'DELETE FROM bp_scores WHERE name = ?', [$name])->rowCount();
            out(['ok' => true, 'deleted' => $del]);
        }
        fail('unknown_action', 404);
    }

    fail('unknown_action', 404);
} catch (Throwable $e) {
    error_log('[balon] ' . $e->getMessage());
    fail('server_error', 500);
}
