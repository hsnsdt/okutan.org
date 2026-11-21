<?php
// 101 Okey — API (PHP + MySQL). Veritabanı ayarı Balon Patlat ile ortak: ../../balon/api/config.php
//
// Sıralama / profil:
//   POST ?a=start {mode}                         → {token, day, seed}  (mode: bot | daily | online)
//   POST ?a=submit {token, name, mode, level, hands, total, won, bestOpen, finished}  → {ok, rank}
//   GET  ?a=top                                  → {week, all, daily}
//   GET  ?a=profile&name=…                       → oyuncu istatistikleri
// Online masa (masa sahibinin tarayıcısı oyunu yönetir; sunucu yalnızca aktarır):
//   POST ?a=t_create {name, opts}                → {code, hostKey, seatKey}
//   POST ?a=t_join {code, name}                  → {seat, seatKey}
//   GET  ?a=t_lobby&code=…                       → {status, seats, opts}
//   POST ?a=t_start {code, hostKey}
//   POST ?a=t_move {code, seat, seatKey, move}   → hamleyi kuyruğa ekler
//   POST ?a=t_moves {code, hostKey, after}       → masa sahibi kuyruktaki hamleleri alır
//   POST ?a=t_state {code, hostKey, ver, pub, priv}  → masa sahibi durumu yayınlar (her koltuğa yalnızca kendi eli)
//   POST ?a=t_poll {code, seat, seatKey, ver}    → oyuncu yeni durumu alır
//   POST ?a=t_say {code, seat, seatKey, text}    → masaya sohbet mesajı (140 karakter, küfür maskelenir)
//   POST ?a=t_chat {code, seat, seatKey, after}  → yeni sohbet mesajları
//   POST ?a=t_sync {code, seat, seatKey, data}   → (yalnızca Kor ile Damla) kendi anlık durumunu yazar, öbür koltuğunkini alır
//
// Aynı dosya düz Okey'e, Tavla'ya, Batak'a, King'e ve Pişti'ye de hizmet eder: okey/api, tavla/api, batak/api, king/api ve pisti/api, OKEY_GAME tanımlayıp bu dosyayı çağırır.
// Oyunlar ayrı tablolar kullanır (101: ok_*, Okey: oy_*, Tavla: tv_*, Batak: bt_*, King: kg_*, Pişti: ps_*), böylece sıralamalar ve masalar karışmaz.
// Batak, King ve Pişti'de günlük elde puan (en yüksek üstte) tutulur; diğerlerinde çekiş sayısı (en az üstte).
// Tavla masası iki kişiliktir (koltuk 0 ve 1). Kor ile Damla (kor-ile-damla/api, kd_*) da iki kişiliktir; masa sahibi oyunu
// yönetmez, iki tarayıcı t_sync ile anlık durumlarını değiş tokuş eder (ok_private'ta koltuk 10 ve 11).
declare(strict_types=1);
$GAME = defined('OKEY_GAME') ? OKEY_GAME : '101';
$PFX = ['okey' => 'oy_', 'tavla' => 'tv_', 'kor' => 'kd_', 'batak' => 'bt_', 'king' => 'kg_', 'pisti' => 'ps_'][$GAME] ?? 'ok_';
$HI = in_array($GAME, ['batak', 'king', 'pisti'], true); // günlük elde yüksek puan iyi
$MAX_SEAT = in_array($GAME, ['tavla', 'kor'], true) ? 1 : 3;
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function out(array $d, int $c = 200): void { http_response_code($c); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function fail(string $e, int $c = 400): void { out(['ok' => false, 'error' => $e], $c); }

$cfgFile = __DIR__ . '/../../balon/api/config.php';
if (!is_file($cfgFile)) fail('not_configured', 503);
$cfg = require $cfgFile;
try {
    $db = new PDO('mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4', $cfg['db_user'], $cfg['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    $db->exec("SET time_zone = '+00:00'");
} catch (Throwable $e) { fail('db_unavailable', 503); }

function tbl(string $sql): string { return preg_replace('/\bok_(sessions|games|tables|private|moves|chat)\b/', $GLOBALS['PFX'] . '$1', $sql); }
function create_tables(PDO $db): void {
    $db->exec(tbl("CREATE TABLE IF NOT EXISTS ok_sessions (
        token CHAR(32) NOT NULL PRIMARY KEY, ip CHAR(64) NOT NULL, mode VARCHAR(8) NOT NULL, day DATE NULL,
        created_at DATETIME NOT NULL, used TINYINT(1) NOT NULL DEFAULT 0, KEY ix_ip (ip, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci"));
    $db->exec(tbl("CREATE TABLE IF NOT EXISTS ok_games (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(20) NOT NULL, mode VARCHAR(8) NOT NULL, level VARCHAR(8) NOT NULL,
        hands TINYINT UNSIGNED NOT NULL, total INT NOT NULL, won TINYINT(1) NOT NULL, best_open SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        finished TINYINT UNSIGNED NOT NULL DEFAULT 0, day DATE NULL, duration INT UNSIGNED NOT NULL, ip CHAR(64) NOT NULL,
        created_at DATETIME NOT NULL, flag TINYINT(1) NOT NULL DEFAULT 0,
        KEY ix_name (name), KEY ix_time (created_at), KEY ix_day (mode, day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci"));
    $db->exec(tbl("CREATE TABLE IF NOT EXISTS ok_tables (
        code CHAR(6) NOT NULL PRIMARY KEY, host_key CHAR(32) NOT NULL, status VARCHAR(8) NOT NULL DEFAULT 'lobby',
        seats TEXT NOT NULL, opts TEXT NOT NULL, ver INT UNSIGNED NOT NULL DEFAULT 0, pub MEDIUMTEXT NULL,
        created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, host_seen DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci"));
    $db->exec(tbl("CREATE TABLE IF NOT EXISTS ok_private (
        code CHAR(6) NOT NULL, seat TINYINT UNSIGNED NOT NULL, data MEDIUMTEXT NOT NULL, PRIMARY KEY (code, seat)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci"));
    $db->exec(tbl("CREATE TABLE IF NOT EXISTS ok_moves (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code CHAR(6) NOT NULL, seat TINYINT UNSIGNED NOT NULL,
        move TEXT NOT NULL, created_at DATETIME NOT NULL, KEY ix_code (code, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci"));
    $db->exec(tbl("CREATE TABLE IF NOT EXISTS ok_chat (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code CHAR(6) NOT NULL, seat TINYINT UNSIGNED NOT NULL, name VARCHAR(20) NOT NULL,
        text VARCHAR(160) NOT NULL, created_at DATETIME NOT NULL, KEY ix_code (code, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci"));
}
function q(PDO $db, string $sql, array $a = []): PDOStatement {
    $sql = tbl($sql);
    try { $s = $db->prepare($sql); $s->execute($a); return $s; }
    catch (PDOException $e) {
        if ($e->getCode() !== '42S02') throw $e;
        create_tables($db); $s = $db->prepare($sql); $s->execute($a); return $s;
    }
}
function now(): string { return gmdate('Y-m-d H:i:s'); }
function ip_hash(array $cfg): string { return hash('sha256', $cfg['salt'] . '|' . ($_SERVER['REMOTE_ADDR'] ?? '')); }
function ist_today(): string { return (new DateTime('now', new DateTimeZone('Europe/Istanbul')))->format('Y-m-d'); }
function week_start(): string {
    $d = new DateTime('now', new DateTimeZone('Europe/Istanbul')); $d->setTime(0, 0); $d->modify('-' . ((int)$d->format('N') - 1) . ' days');
    $d->setTimezone(new DateTimeZone('UTC')); return $d->format('Y-m-d H:i:s');
}
function fnv1a(string $s): int { $h = 0x811c9dc5; for ($i = 0; $i < strlen($s); $i++) { $h ^= ord($s[$i]); $h = ($h * 0x01000193) & 0xffffffff; } return $h; }
function clean_name($raw): ?string {
    if (!is_string($raw)) return null;
    $n = preg_replace('/\s+/u', ' ', trim($raw));
    $len = mb_strlen((string)$n, 'UTF-8');
    if ($len < 2 || $len > 16 || !preg_match('/^[\p{L}\p{N}][\p{L}\p{N} ._\-]*$/u', (string)$n)) return null;
    $flat = mb_strtolower(preg_replace('/[^\p{L}\p{N}]/u', '', (string)$n), 'UTF-8');
    $flat = strtr($flat, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', 'ı' => 'i']);
    foreach (array_merge(BAD_WORDS, ['admin', 'moderator']) as $w)
        if (str_contains($flat, $w)) return null;
    return (string)$n;
}
const BAD_WORDS = ['amk', 'aminako', 'orospu', 'sikti', 'sikis', 'sikerim', 'siktir', 'yarrak', 'pezevenk', 'gavat', 'kahpe', 'ibne', 'fuck', 'shit', 'bitch'];
// Sohbet metni: kontrol karakterleri atılır, boşluklar sadeleşir, 140 karakter, küfür içeren kelimeler *** olur
function clean_chat($raw): ?string {
    if (!is_string($raw)) return null;
    // denetim/özel karakterler ve yazı yönünü çeviren işaretler atılır; emoji birleştiricileri (ZWJ) kalır
    $t = preg_replace('/[\p{Cc}\p{Co}\p{Cn}\x{202A}-\x{202E}\x{2066}-\x{2069}]+/u', ' ', $raw);
    $t = trim((string)preg_replace('/\s+/u', ' ', (string)$t));
    if ($t === '') return null;
    $t = mb_substr($t, 0, 140, 'UTF-8');
    foreach (BAD_WORDS as $w) $t = (string)preg_replace('/[\p{L}\p{N}]*' . preg_quote($w, '/') . '[\p{L}\p{N}]*/iu', '***', $t);
    return $t;
}
function seat_auth(array $t, $seat, $key): int {
    $seat = (int)$seat;
    if ($seat < 0 || $seat > 3 || !$t['seats'][$seat] || !hash_equals((string)($t['seats'][$seat]['key'] ?? ''), (string)$key)) fail('unauthorized', 401);
    return $seat;
}
function body(): array { $j = json_decode(file_get_contents('php://input', false, null, 0, 400000) ?: '', true); return is_array($j) ? $j : []; }
function rand_code(): string { $a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $s = ''; for ($i = 0; $i < 6; $i++) $s .= $a[random_int(0, strlen($a) - 1)]; return $s; }
function table_row(PDO $db, $code): array {
    if (!is_string($code) || !preg_match('/^[A-Z0-9]{6}$/', $code)) fail('bad_code');
    $t = q($db, 'SELECT * FROM ok_tables WHERE code = ?', [$code])->fetch();
    if (!$t) fail('no_table', 404);
    $t['seats'] = json_decode($t['seats'], true);
    return $t;
}
// masadaki en büyük koltuk: Pişti masası iki kişilik kurulabilir (opts.players = 2)
function table_max(array $t): int {
    global $GAME, $MAX_SEAT;
    if ($GAME === 'pisti') { $o = json_decode((string)$t['opts'], true); if ((int)($o['players'] ?? 4) === 2) return 1; }
    return $MAX_SEAT;
}
function public_seats(array $seats): array { return array_map(fn($s) => $s ? ['name' => $s['name'], 'bot' => !empty($s['bot'])] : null, $seats); }

$a = $_GET['a'] ?? ''; $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
try {
    // ---------- sıralama ----------
    if ($a === 'top' && $m === 'GET') {
        $wins = function (?string $since) use ($db) {
            $sql = "SELECT name, SUM(won) AS w, COUNT(*) AS g FROM ok_games WHERE flag = 0 AND mode <> 'daily'" . ($since ? ' AND created_at >= ?' : '') .
                ' GROUP BY name HAVING w > 0 ORDER BY w DESC, g ASC LIMIT 20';
            return array_map(fn($r) => ['name' => $r['name'], 'wins' => (int)$r['w'], 'games' => (int)$r['g']], q($db, $sql, $since ? [$since] : [])->fetchAll());
        };
        $daily = q($db, "SELECT name, " . ($HI ? 'MAX' : 'MIN') . "(total) AS s FROM ok_games WHERE flag = 0 AND mode = 'daily' AND day = ? GROUP BY name ORDER BY s " . ($HI ? 'DESC' : 'ASC') . ", MIN(created_at) ASC LIMIT 20", [ist_today()])->fetchAll();
        out(['ok' => true, 'week' => $wins(week_start()), 'all' => $wins(null), 'day' => ist_today(),
            'daily' => array_map(fn($r) => ['name' => $r['name'], 'score' => (int)$r['s']], $daily),
            'games' => (int)q($db, 'SELECT COUNT(*) FROM ok_games')->fetchColumn()]);
    }
    if ($a === 'profile' && $m === 'GET') {
        $n = clean_name($_GET['name'] ?? null); if ($n === null) fail('bad_name');
        $r = q($db, "SELECT COUNT(*) g, SUM(won) w, MAX(best_open) bo, SUM(finished) f, MIN(created_at) first FROM ok_games WHERE name = ? AND mode <> 'daily'", [$n])->fetch();
        $d = q($db, "SELECT COUNT(*) g, " . ($HI ? 'MAX' : 'MIN') . "(total) best FROM ok_games WHERE name = ? AND mode = 'daily'", [$n])->fetch();
        if (!(int)$r['g'] && !(int)$d['g']) fail('not_found', 404);
        out(['ok' => true, 'name' => $n, 'games' => (int)$r['g'], 'wins' => (int)$r['w'], 'bestOpen' => (int)$r['bo'], 'finished' => (int)$r['f'],
            'daily' => (int)$d['g'], 'bestDaily' => $d['best'] !== null ? (int)$d['best'] : null, 'first' => substr((string)$r['first'], 0, 10)]);
    }

    if ($m !== 'POST' && strpos($a, 't_') !== 0) fail('method', 405);
    $ip = ip_hash($cfg);

    if ($a === 'start') {
        $in = body(); $mode = in_array($in['mode'] ?? '', ['bot', 'daily', 'online'], true) ? $in['mode'] : 'bot';
        $n = (int)q($db, 'SELECT COUNT(*) FROM ok_sessions WHERE ip = ? AND created_at >= ?', [$ip, gmdate('Y-m-d H:i:s', time() - 3600)])->fetchColumn();
        if ($n >= 60) fail('rate_limited', 429);
        if (random_int(1, 40) === 1) q($db, 'DELETE FROM ok_sessions WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 3 * 86400)]);
        $tok = bin2hex(random_bytes(16)); $day = $mode === 'daily' ? ist_today() : null;
        q($db, 'INSERT INTO ok_sessions (token, ip, mode, day, created_at) VALUES (?, ?, ?, ?, ?)', [$tok, $ip, $mode, $day, now()]);
        out(['ok' => true, 'token' => $tok, 'day' => $day, 'seed' => $day ? fnv1a((['okey' => 'duz-okey-', 'batak' => 'batak-', 'king' => 'king-', 'pisti' => 'pisti-'][$GAME] ?? 'okey-') . $day) : null]);
    }
    if ($a === 'submit') {
        $in = body();
        $tok = $in['token'] ?? ''; if (!is_string($tok) || !preg_match('/^[a-f0-9]{32}$/', $tok)) fail('bad_token');
        $name = clean_name($in['name'] ?? null); if ($name === null) fail('bad_name');
        $s = q($db, 'SELECT * FROM ok_sessions WHERE token = ?', [$tok])->fetch();
        if (!$s || (int)$s['used']) fail('bad_token');
        $mode = $s['mode']; $hands = (int)($in['hands'] ?? 0); $total = $in['total'] ?? null; $won = !empty($in['won']) ? 1 : 0;
        $level = in_array($in['level'] ?? '', ['easy', 'normal', 'hard', 'mixed'], true) ? $in['level'] : 'normal';
        $maxHands = ['okey' => 99, 'tavla' => 25, 'batak' => 16, 'king' => 20, 'pisti' => 40][$GAME] ?? 11;
        $range = ['okey' => [-400, 400], 'tavla' => [0, 30], 'batak' => [-210, 210], 'king' => [-5300, 5300], 'pisti' => [0, 2000]][$GAME] ?? [-3232, 30000];
        // King'de ceza elleri erken bitebilir: el başına en az süre ve şüpheli süre daha kısa
        $minSec = ['king' => 8][$GAME] ?? 20; $flagSec = ['king' => 25][$GAME] ?? 45;
        if (!is_int($total) || $total < $range[0] || $total > $range[1]) fail('bad_total');
        if ($hands < 1 || $hands > $maxHands) fail('bad_hands');
        $elapsed = time() - strtotime($s['created_at'] . ' UTC');
        if ($elapsed < $hands * $minSec) fail('too_fast');
        if ($elapsed > 6 * 3600) fail('expired');
        if ($mode === 'daily') {
            if ($hands !== 1) fail('bad_hands');
            if ((int)q($db, "SELECT COUNT(*) FROM ok_games WHERE name = ? AND mode = 'daily' AND day = ?", [$name, $s['day']])->fetchColumn()) fail('daily_done');
        }
        $flag = ($elapsed < $hands * $flagSec && $won) ? 1 : 0;
        $u = q($db, 'UPDATE ok_sessions SET used = 1 WHERE token = ? AND used = 0', [$tok]); if ($u->rowCount() !== 1) fail('bad_token');
        q($db, 'INSERT INTO ok_games (name, mode, level, hands, total, won, best_open, finished, day, duration, ip, created_at, flag) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$name, $mode, $level, $hands, $total, $won, max(0, min(999, (int)($in['bestOpen'] ?? 0))), max(0, min($maxHands, (int)($in['finished'] ?? 0))), $s['day'], $elapsed, $ip, now(), $flag]);
        $rank = null;
        if ($mode === 'daily') $rank = 1 + (int)q($db, "SELECT COUNT(*) FROM (SELECT name FROM ok_games WHERE mode = 'daily' AND day = ? AND flag = 0 GROUP BY name HAVING " . ($HI ? 'MAX(total) > ?' : 'MIN(total) < ?') . ") t", [$s['day'], $total])->fetchColumn();
        out(['ok' => true, 'rank' => $rank]);
    }

    // ---------- online masa ----------
    if ($a === 't_create') {
        $in = body(); $name = clean_name($in['name'] ?? null); if ($name === null) fail('bad_name');
        $n = (int)q($db, 'SELECT COUNT(*) FROM ok_sessions WHERE ip = ? AND created_at >= ?', [$ip, gmdate('Y-m-d H:i:s', time() - 3600)])->fetchColumn();
        if ($n >= 60) fail('rate_limited', 429);
        if (random_int(1, 20) === 1) {
            $old = gmdate('Y-m-d H:i:s', time() - 86400);
            // kod ASCII; BINARY karşılaştırma tablo karakter düzeninden bağımsız çalışır
            q($db, 'DELETE p FROM ok_private p JOIN ok_tables t ON BINARY t.code = BINARY p.code WHERE t.updated_at < ?', [$old]);
            q($db, 'DELETE m FROM ok_moves m JOIN ok_tables t ON BINARY t.code = BINARY m.code WHERE t.updated_at < ?', [$old]);
            q($db, 'DELETE c FROM ok_chat c JOIN ok_tables t ON BINARY t.code = BINARY c.code WHERE t.updated_at < ?', [$old]);
            q($db, 'DELETE FROM ok_tables WHERE updated_at < ?', [$old]);
        }
        $hk = bin2hex(random_bytes(16)); $sk = bin2hex(random_bytes(16));
        $opts = is_array($in['opts'] ?? null) ? json_encode(array_slice($in['opts'], 0, 12)) : '{}';
        $seats = [['name' => $name, 'key' => $sk], null, null, null];
        for ($try = 0; ; $try++) { // aynı kod çıkarsa yeni kodla dene
            $code = rand_code();
            try { q($db, 'INSERT INTO ok_tables (code, host_key, seats, opts, created_at, updated_at, host_seen) VALUES (?,?,?,?,?,?,?)', [$code, $hk, json_encode($seats, JSON_UNESCAPED_UNICODE), $opts, now(), now(), now()]); break; }
            catch (PDOException $e) { if ($e->getCode() !== '23000' || $try >= 4) throw $e; }
        }
        out(['ok' => true, 'code' => $code, 'hostKey' => $hk, 'seat' => 0, 'seatKey' => $sk]);
    }
    if ($a === 't_join') {
        $in = body(); $name = clean_name($in['name'] ?? null); if ($name === null) fail('bad_name');
        $t = table_row($db, $in['code'] ?? '');
        // aynı isimle yeniden bağlanma: anahtarı yoksa yeni koltuk verilmez
        if ($t['status'] !== 'lobby') fail('started');
        foreach ($t['seats'] as $s) if ($s && mb_strtolower($s['name'], 'UTF-8') === mb_strtolower($name, 'UTF-8')) fail('name_taken');
        $seat = -1; for ($i = 1; $i <= table_max($t); $i++) if (!$t['seats'][$i]) { $seat = $i; break; }
        if ($seat < 0) fail('full');
        $sk = bin2hex(random_bytes(16)); $t['seats'][$seat] = ['name' => $name, 'key' => $sk];
        q($db, 'UPDATE ok_tables SET seats = ?, updated_at = ? WHERE code = ?', [json_encode($t['seats'], JSON_UNESCAPED_UNICODE), now(), $t['code']]);
        out(['ok' => true, 'seat' => $seat, 'seatKey' => $sk, 'code' => $t['code']]);
    }
    if ($a === 't_lobby') {
        $t = table_row($db, $_GET['code'] ?? '');
        out(['ok' => true, 'status' => $t['status'], 'seats' => public_seats($t['seats']), 'opts' => json_decode($t['opts'], true),
            'hostAlive' => strtotime($t['host_seen'] . ' UTC') > time() - 30]);
    }
    if ($a === 't_start') {
        $in = body(); $t = table_row($db, $in['code'] ?? '');
        if (!hash_equals($t['host_key'], (string)($in['hostKey'] ?? ''))) fail('unauthorized', 401);
        if ($GAME === 'kor' && !$t['seats'][1]) fail('need_guest');
        for ($i = 1; $i <= table_max($t); $i++) if (!$t['seats'][$i]) $t['seats'][$i] = ['name' => ($GAME === 'tavla' ? ['Mehmet'] : ['Ayşe', 'Mehmet', 'Zeynep'])[$i - 1], 'bot' => true];
        q($db, "UPDATE ok_tables SET status = 'play', seats = ?, updated_at = ?, host_seen = ? WHERE code = ?", [json_encode($t['seats'], JSON_UNESCAPED_UNICODE), now(), now(), $t['code']]);
        out(['ok' => true, 'seats' => public_seats($t['seats'])]);
    }
    if ($a === 't_move') {
        $in = body(); $t = table_row($db, $in['code'] ?? ''); $seat = (int)($in['seat'] ?? -1);
        if ($seat < 1 || $seat > 3 || !$t['seats'][$seat] || !hash_equals((string)($t['seats'][$seat]['key'] ?? ''), (string)($in['seatKey'] ?? ''))) fail('unauthorized', 401);
        $mv = json_encode($in['move'] ?? null); if (strlen($mv) > 2000) fail('too_big');
        q($db, 'INSERT INTO ok_moves (code, seat, move, created_at) VALUES (?,?,?,?)', [$t['code'], $seat, $mv, now()]);
        out(['ok' => true]);
    }
    if ($a === 't_moves') {
        $in = body(); $t = table_row($db, $in['code'] ?? '');
        if (!hash_equals($t['host_key'], (string)($in['hostKey'] ?? ''))) fail('unauthorized', 401);
        q($db, 'UPDATE ok_tables SET host_seen = ? WHERE code = ?', [now(), $t['code']]);
        $rows = q($db, 'SELECT id, seat, move FROM ok_moves WHERE code = ? AND id > ? ORDER BY id LIMIT 50', [$t['code'], (int)($in['after'] ?? 0)])->fetchAll();
        out(['ok' => true, 'moves' => array_map(fn($r) => ['id' => (int)$r['id'], 'seat' => (int)$r['seat'], 'move' => json_decode($r['move'], true)], $rows),
            'seats' => public_seats($t['seats'])]);
    }
    if ($a === 't_state') {
        $in = body(); $t = table_row($db, $in['code'] ?? '');
        if (!hash_equals($t['host_key'], (string)($in['hostKey'] ?? ''))) fail('unauthorized', 401);
        $ver = (int)($in['ver'] ?? 0); $pub = json_encode($in['pub'] ?? null, JSON_UNESCAPED_UNICODE);
        if (strlen($pub) > 300000) fail('too_big');
        q($db, 'UPDATE ok_tables SET ver = ?, pub = ?, updated_at = ?, host_seen = ?, status = ? WHERE code = ?',
            [$ver, $pub, now(), now(), !empty($in['over']) ? 'over' : 'play', $t['code']]);
        foreach (($in['priv'] ?? []) as $seat => $data) {
            $seat = (int)$seat; if ($seat < 0 || $seat > 3) continue;
            q($db, 'REPLACE INTO ok_private (code, seat, data) VALUES (?,?,?)', [$t['code'], $seat, json_encode($data)]);
        }
        out(['ok' => true]);
    }
    if ($a === 't_poll') {
        $in = body(); $t = table_row($db, $in['code'] ?? ''); $seat = (int)($in['seat'] ?? -1);
        if ($seat < 0 || $seat > 3 || !$t['seats'][$seat] || !hash_equals((string)($t['seats'][$seat]['key'] ?? ''), (string)($in['seatKey'] ?? ''))) fail('unauthorized', 401);
        $res = ['ok' => true, 'status' => $t['status'], 'ver' => (int)$t['ver'], 'seats' => public_seats($t['seats']),
            'hostAlive' => strtotime($t['host_seen'] . ' UTC') > time() - 30];
        if ((int)$t['ver'] > (int)($in['ver'] ?? 0) && $t['pub']) {
            $res['pub'] = json_decode($t['pub'], true);
            $p = q($db, 'SELECT data FROM ok_private WHERE code = ? AND seat = ?', [$t['code'], $seat])->fetchColumn();
            $res['priv'] = $p ? json_decode($p, true) : null;
        }
        out($res);
    }
    // ---------- Kor ile Damla: anlık durum değişimi ----------
    if ($a === 't_sync' && $GAME === 'kor') {
        $in = body(); $t = table_row($db, $in['code'] ?? ''); $seat = seat_auth($t, $in['seat'] ?? -1, $in['seatKey'] ?? '');
        if ($seat > 1) fail('unauthorized', 401);
        $d = json_encode($in['data'] ?? null, JSON_UNESCAPED_UNICODE); if (strlen($d) > 6000) fail('too_big');
        q($db, 'REPLACE INTO ok_private (code, seat, data) VALUES (?,?,?)', [$t['code'], 10 + $seat, $d]);
        if (strtotime($t['updated_at'] . ' UTC') < time() - 15)
            q($db, 'UPDATE ok_tables SET updated_at = ? WHERE code = ?', [now(), $t['code']]);
        if ($seat === 0 && strtotime($t['host_seen'] . ' UTC') < time() - 10)
            q($db, 'UPDATE ok_tables SET host_seen = ? WHERE code = ?', [now(), $t['code']]);
        $o = q($db, 'SELECT data FROM ok_private WHERE code = ? AND seat = ?', [$t['code'], 11 - $seat])->fetchColumn();
        out(['ok' => true, 'other' => $o ? json_decode($o, true) : null, 'status' => $t['status'], 'seats' => public_seats($t['seats'])]);
    }
    // ---------- sohbet ----------
    if ($a === 't_say') {
        $in = body(); $t = table_row($db, $in['code'] ?? ''); $seat = seat_auth($t, $in['seat'] ?? -1, $in['seatKey'] ?? '');
        $text = clean_chat($in['text'] ?? null); if ($text === null) fail('empty');
        $last = q($db, 'SELECT created_at FROM ok_chat WHERE code = ? AND seat = ? ORDER BY id DESC LIMIT 1', [$t['code'], $seat])->fetchColumn();
        if ($last && strtotime($last . ' UTC') >= time() - 1) fail('slow', 429);
        $n = (int)q($db, 'SELECT COUNT(*) FROM ok_chat WHERE code = ? AND seat = ? AND created_at >= ?', [$t['code'], $seat, gmdate('Y-m-d H:i:s', time() - 60)])->fetchColumn();
        if ($n >= 20) fail('slow', 429);
        q($db, 'INSERT INTO ok_chat (code, seat, name, text, created_at) VALUES (?,?,?,?,?)', [$t['code'], $seat, $t['seats'][$seat]['name'], $text, now()]);
        out(['ok' => true, 'id' => (int)$db->lastInsertId(), 'text' => $text]);
    }
    if ($a === 't_chat') {
        $in = body(); $t = table_row($db, $in['code'] ?? ''); seat_auth($t, $in['seat'] ?? -1, $in['seatKey'] ?? '');
        $after = (int)($in['after'] ?? 0);
        $rows = $after > 0
            ? q($db, 'SELECT id, seat, name, text FROM ok_chat WHERE code = ? AND id > ? ORDER BY id LIMIT 50', [$t['code'], $after])->fetchAll()
            : array_reverse(q($db, 'SELECT id, seat, name, text FROM ok_chat WHERE code = ? ORDER BY id DESC LIMIT 30', [$t['code']])->fetchAll());
        out(['ok' => true, 'msgs' => array_map(fn($r) => ['id' => (int)$r['id'], 'seat' => (int)$r['seat'], 'name' => $r['name'], 'text' => $r['text']], $rows)]);
    }
    fail('unknown_action', 404);
} catch (Throwable $e) {
    error_log('[' . $GAME . '] ' . $e->getMessage());
    fail('server_error', 500);
}
