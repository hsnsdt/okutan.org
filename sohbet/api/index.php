<?php
// Canlı Sohbet — API (PHP + MySQL, yoklama; WebSocket yok). Veritabanı ayarı ortak: ../../balon/api/config.php
//
// Kullanıcı (hesapsız; tarayıcıdaki gizli anahtar rumuzu sahiplenir, sunucu anahtarın yalnızca SHA-256 özetini tutar):
//   POST ?a=hello  {key?}                              → {key, me:{id, nick, op}}   (anahtar yoksa ya da tanınmazsa yenisi verilir)
//   POST ?a=nick   {key, nick}                         → {nick}
//   POST ?a=poll   {key, ch, after, since, users, away} → {msgs, del, now, users?, counts?, slow, me}
//   POST ?a=say    {key, ch, text, me}                 → {id, text}
//   POST ?a=report {key, id}                           → 3 ayrı ağdan şikâyet gelen mesaj kendiliğinden gizlenir
//   POST ?a=op_del {key, id} · op_mute {key, nick, min} → moderatör (op) işlemleri
// Yönetim (config.php: admin_pass; 12 saatlik imzalı jeton):
//   POST ?a=admin_login {pass} · admin_stats · admin_feed · admin_users · admin_del · admin_mute · admin_ban · admin_ipban
//        admin_op · admin_chan · admin_notice · admin_log
//        admin_claim {t, key, nick} → yöneticinin kendi rumuzu (ayrılmış adlar serbest, op olur)
//
// Tablolar (sh_*), ilk istekte kendiliğinden oluşur:
//   sh_users     kişi başına bir satır (rumuz, op, susturma/yasak)
//   sh_presence  kişi başına TEK satır: "buradayım" sinyali UPDATE edilir, satır eklenmez
//   sh_msgs      mesajlar; 30 günden eskiler silinir
//   sh_log       yasal kayıt: kim, ne zaman, hangi IP ve port — mesaj METNİ YOK; config 'sohbet_kayit_gun' (varsayılan 730) gün saklanır
//   sh_reports, sh_ipbans, sh_kanal (yavaş mod, konu)
// Katıldı/ayrıldı satırları veritabanına yazılmaz; tarayıcı kişi listesinin farkından üretir.
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const KANALLAR = ['genel', 'okey', 'tavla', 'kart', 'kelime'];
const MSG_DAYS = 30;          // mesajlar bu kadar gün saklanır
const ONLINE_SEC = 70;        // bu kadar saniyedir sinyal gelmeyen kişi listeden düşer
const PRESENCE_SEC = 15;      // "buradayım" satırı en sık bu aralıkla yazılır
const MAX_TEXT = 300;
const NEWBIE_SEC = 300;       // yeni gelen ilk 5 dakika: yavaş mod 5 sn
const FLOOD_PER_MIN = 50;     // kanalda dakikada bundan fazla mesaj → 5 dakikalık otomatik yavaş mod
const BAD_WORDS = ['amk', 'aminako', 'amına', 'orospu', 'sikti', 'sikis', 'sikerim', 'siktir', 'yarrak', 'pezevenk', 'gavat', 'kahpe', 'ibne', 'fuck', 'shit', 'bitch'];
const RESERVED = ['admin', 'moderator', 'yonetici', 'yönetici', 'sedatokutan', 'okutan', 'sistem', 'system', 'operator', 'nickserv', 'chanserv'];

function out(array $d, int $c = 200): void { http_response_code($c); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }
function fail(string $e, int $c = 400, array $x = []): void { out(['ok' => false, 'error' => $e] + $x, $c); }

$cfgFile = __DIR__ . '/../../balon/api/config.php';
if (!is_file($cfgFile)) fail('not_configured', 503);
$cfg = require $cfgFile;
$LOG_DAYS = max(30, (int)($cfg['sohbet_kayit_gun'] ?? 730));
try {
    $db = new PDO('mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4', $cfg['db_user'], $cfg['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    $db->exec("SET time_zone = '+00:00'");
} catch (Throwable $e) { fail('db_unavailable', 503); }

function create_tables(PDO $db): void {
    $o = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci';
    $db->exec('CREATE TABLE IF NOT EXISTS sh_users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, key_hash CHAR(64) NOT NULL, nick VARCHAR(16) NULL, nick_lc VARCHAR(16) NULL,
        op TINYINT(1) NOT NULL DEFAULT 0, ip CHAR(64) NOT NULL, created_at DATETIME NOT NULL, last_seen DATETIME NOT NULL,
        nick_at DATETIME NULL, muted_until DATETIME NULL, banned_until DATETIME NULL,
        UNIQUE KEY ux_key (key_hash), UNIQUE KEY ux_nick (nick_lc), KEY ix_ip (ip, created_at)
    )' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_presence (
        user_id INT UNSIGNED NOT NULL PRIMARY KEY, ch VARCHAR(12) NOT NULL, nick VARCHAR(16) NOT NULL, op TINYINT(1) NOT NULL DEFAULT 0,
        away VARCHAR(40) NULL, seen DATETIME NOT NULL, KEY ix_ch (ch, seen)
    )' . $o);
    $db->exec("CREATE TABLE IF NOT EXISTS sh_msgs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, ch VARCHAR(12) NOT NULL, user_id INT UNSIGNED NOT NULL, nick VARCHAR(16) NOT NULL,
        op TINYINT(1) NOT NULL DEFAULT 0, kind CHAR(1) NOT NULL DEFAULT 'm', text VARCHAR(400) NOT NULL, created_at DATETIME NOT NULL,
        del_at DATETIME NULL, del_by VARCHAR(8) NULL,
        KEY ix_ch (ch, id), KEY ix_user (user_id, id), KEY ix_del (ch, del_at), KEY ix_time (created_at)
    )" . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_log (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL, nick VARCHAR(16) NULL, ev VARCHAR(8) NOT NULL,
        ref BIGINT UNSIGNED NULL, ip VARCHAR(45) NOT NULL, port SMALLINT UNSIGNED NULL, created_at DATETIME NOT NULL,
        KEY ix_time (created_at), KEY ix_ip (ip, ev, created_at), KEY ix_user (user_id, created_at)
    )' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_reports (
        msg_id BIGINT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, ip CHAR(64) NOT NULL, created_at DATETIME NOT NULL,
        PRIMARY KEY (msg_id, user_id), KEY ix_time (created_at)
    )' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_ipbans (
        ip CHAR(64) NOT NULL PRIMARY KEY, until DATETIME NOT NULL, created_at DATETIME NOT NULL, note VARCHAR(100) NULL
    )' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_kanal (
        ch VARCHAR(12) NOT NULL PRIMARY KEY, slow SMALLINT UNSIGNED NOT NULL DEFAULT 0, auto_until DATETIME NULL, topic VARCHAR(120) NULL
    )' . $o);
}
function q(PDO $db, string $sql, array $a = []): PDOStatement {
    try { $s = $db->prepare($sql); $s->execute($a); return $s; }
    catch (PDOException $e) {
        if ($e->getCode() !== '42S02') throw $e;
        create_tables($db); $s = $db->prepare($sql); $s->execute($a); return $s;
    }
}
function now(): string { return gmdate('Y-m-d H:i:s'); }
function ago(int $sec): string { return gmdate('Y-m-d H:i:s', time() - $sec); }
function ts(?string $dt): ?int { return $dt ? (int)strtotime($dt . ' UTC') : null; }
function ip_raw(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45); }
function ip_hash(array $cfg): string { return hash('sha256', $cfg['salt'] . '|' . ip_raw()); }
function body(): array { $j = json_decode(file_get_contents('php://input', false, null, 0, 20000) ?: '', true); return is_array($j) ? $j : []; }
function lc(string $s): string { return mb_strtolower(strtr($s, ['I' => 'ı', 'İ' => 'i']), 'UTF-8'); }
function flat(string $s): string {
    $f = lc((string)preg_replace('/[^\p{L}\p{N}]/u', '', $s));
    return strtr($f, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', 'ı' => 'i', 'ş' => 's', 'ç' => 'c', 'ğ' => 'g', 'ö' => 'o', 'ü' => 'u']);
}
// $reserved = false: yalnızca yönetici kendi rumuzunu alırken (admin_claim) ayrılmış adlar serbest
function clean_nick($raw, bool $reserved = true): ?string {
    if (!is_string($raw)) return null;
    $n = (string)preg_replace('/\s+/u', ' ', trim($raw));
    $len = mb_strlen($n, 'UTF-8');
    if ($len < 2 || $len > 16 || !preg_match('/^[\p{L}\p{N}][\p{L}\p{N} ._\-]*$/u', $n)) return null;
    $f = flat($n);
    foreach ($reserved ? array_merge(BAD_WORDS, RESERVED) : BAD_WORDS as $w) if (str_contains($f, flat($w))) return null;
    return $n;
}
// Mesaj metni: denetim karakterleri atılır, boşluk sadeleşir, 300 karakter; küfür *** olur; okutan.org dışındaki bağlantılar kaldırılır
function clean_text($raw): ?string {
    if (!is_string($raw)) return null;
    $t = preg_replace('/[\p{Cc}\p{Co}\p{Cn}\x{202A}-\x{202E}\x{2066}-\x{2069}]+/u', ' ', $raw);
    $t = trim((string)preg_replace('/\s+/u', ' ', (string)$t));
    if ($t === '') return null;
    $t = mb_substr($t, 0, MAX_TEXT, 'UTF-8');
    $t = (string)preg_replace_callback('~\b(?:https?://|www\.)\S+|\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|tr|io|me|gg|ly|co|xyz|info|biz|app|link|club|site|online|ru|de|tk|ml|ga|cf|top|live|tv|to|cc|us|uk|eu|shop|store)\b(?:/\S*)?~iu',
        fn($m) => preg_match('~^(?:https?://)?(?:www\.)?okutan\.org(?:[/?#]|$)~i', $m[0]) ? $m[0] : '[bağlantı]', $t);
    foreach (BAD_WORDS as $w) $t = (string)preg_replace('/[\p{L}\p{N}]*' . preg_quote($w, '/') . '[\p{L}\p{N}]*/iu', '***', $t);
    return $t;
}
function chan($c): string { if (!is_string($c) || !in_array($c, KANALLAR, true)) fail('bad_channel'); return $c; }
function log_ev(PDO $db, array $u, string $ev, ?int $ref = null): void {
    $port = (int)($_SERVER['REMOTE_PORT'] ?? 0);
    q($db, 'INSERT INTO sh_log (user_id, nick, ev, ref, ip, port, created_at) VALUES (?,?,?,?,?,?,?)',
        [(int)$u['id'], $u['nick'] ?? null, $ev, $ref, ip_raw(), $port ?: null, now()]);
}
function user_by_key(PDO $db, $key): array {
    if (!is_string($key) || !preg_match('/^[a-f0-9]{32}$/', $key)) fail('bad_key', 401);
    $u = q($db, 'SELECT u.*, p.ch AS p_ch, p.seen AS p_seen, p.away AS p_away FROM sh_users u LEFT JOIN sh_presence p ON p.user_id = u.id WHERE u.key_hash = ?',
        [hash('sha256', $key)])->fetch();
    if (!$u) fail('bad_key', 401);
    return $u;
}
function is_banned(PDO $db, array $u, string $ip): bool {
    if ($u['banned_until'] && ts($u['banned_until']) > time()) return true;
    return (bool)q($db, 'SELECT 1 FROM sh_ipbans WHERE ip = ? AND until > ?', [$ip, now()])->fetchColumn();
}
function me_info(array $u, bool $banned): array {
    $mu = ts($u['muted_until']);
    return ['id' => (int)$u['id'], 'nick' => $u['nick'], 'op' => (bool)$u['op'], 'banned' => $banned, 'muted' => $mu && $mu > time() ? $mu : null];
}
function kanal_row(PDO $db, string $ch): array {
    $k = q($db, 'SELECT slow, auto_until, topic FROM sh_kanal WHERE ch = ?', [$ch])->fetch();
    return $k ?: ['slow' => 0, 'auto_until' => null, 'topic' => null];
}
function slow_of(array $k): int { return max((int)$k['slow'], ($k['auto_until'] && ts($k['auto_until']) > time()) ? 5 : 0); }
function msg_row(array $r): array {
    return ['id' => (int)$r['id'], 'u' => (int)$r['user_id'], 'n' => $r['nick'], 'op' => (bool)$r['op'], 'k' => $r['kind'], 'x' => $r['text'], 't' => ts($r['created_at'])];
}
function sys_msg(PDO $db, string $ch, string $text, array $u = ['id' => 0, 'nick' => '*', 'op' => 1], string $kind = 's'): int {
    q($db, 'INSERT INTO sh_msgs (ch, user_id, nick, op, kind, text, created_at) VALUES (?,?,?,?,?,?,?)', [$ch, (int)$u['id'], (string)$u['nick'], (int)$u['op'], $kind, $text, now()]);
    return (int)$db->lastInsertId();
}
function cleanup(PDO $db, int $logDays): void {
    q($db, 'DELETE FROM sh_msgs WHERE created_at < ? LIMIT 2000', [ago(MSG_DAYS * 86400)]);
    q($db, 'DELETE FROM sh_log WHERE created_at < ? LIMIT 2000', [ago($logDays * 86400)]);
    q($db, 'DELETE FROM sh_reports WHERE created_at < ? LIMIT 2000', [ago(MSG_DAYS * 86400)]);
    q($db, 'DELETE FROM sh_presence WHERE seen < ? LIMIT 2000', [ago(86400)]);
    q($db, 'DELETE FROM sh_ipbans WHERE until < ? LIMIT 500', [now()]);
}

// ---- Yönetim jetonu: config.php içindeki admin_pass; Balon yönetiminden ayrı imza ----
function admin_token(array $cfg): string {
    $exp = time() + 12 * 3600;
    return $exp . '.' . hash_hmac('sha256', (string)$exp, $cfg['salt'] . '|sohbet-admin|' . ($cfg['admin_pass'] ?? ''));
}
function admin_check(array $cfg, $tok): void {
    if (empty($cfg['admin_pass'])) fail('admin_disabled', 403);
    if (!is_string($tok) || !preg_match('/^(\d+)\.([a-f0-9]{64})$/', $tok, $m) || (int)$m[1] < time()) fail('unauthorized', 401);
    if (!hash_equals(hash_hmac('sha256', $m[1], $cfg['salt'] . '|sohbet-admin|' . $cfg['admin_pass']), $m[2])) fail('unauthorized', 401);
}

$a = $_GET['a'] ?? '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') fail('method', 405);
$in = body(); $ip = ip_hash($cfg);

try {
    // ---------- giriş: anahtar yoksa yeni kişi ----------
    if ($a === 'hello') {
        $key = $in['key'] ?? null; $u = null;
        if (is_string($key) && preg_match('/^[a-f0-9]{32}$/', $key)) $u = q($db, 'SELECT * FROM sh_users WHERE key_hash = ?', [hash('sha256', $key)])->fetch() ?: null;
        if (!$u) {
            if ((bool)q($db, 'SELECT 1 FROM sh_ipbans WHERE ip = ? AND until > ?', [$ip, now()])->fetchColumn()) fail('banned', 403);
            // aynı ağdan saatte en çok 20 yeni kişi (mobil operatörlerde çok kişi aynı IP'yi paylaşır; sınır geniş)
            if ((int)q($db, 'SELECT COUNT(*) FROM sh_users WHERE ip = ? AND created_at >= ?', [$ip, ago(3600)])->fetchColumn() >= 20) fail('rate_limited', 429);
            $key = bin2hex(random_bytes(16));
            q($db, 'INSERT INTO sh_users (key_hash, ip, created_at, last_seen) VALUES (?,?,?,?)', [hash('sha256', $key), $ip, now(), now()]);
            $u = q($db, 'SELECT * FROM sh_users WHERE id = ?', [(int)$db->lastInsertId()])->fetch();
            log_ev($db, $u, 'new');
        } else {
            q($db, 'UPDATE sh_users SET last_seen = ?, ip = ? WHERE id = ?', [now(), $ip, $u['id']]);
            log_ev($db, $u, 'hello');
        }
        $banned = is_banned($db, $u, $ip);
        $topics = [];
        foreach (q($db, 'SELECT ch, topic, slow FROM sh_kanal')->fetchAll() as $r) $topics[$r['ch']] = ['topic' => $r['topic'], 'slow' => (int)$r['slow']];
        out(['ok' => true, 'key' => $key, 'me' => me_info($u, $banned), 'kanallar' => (object)$topics, 'now' => time()]);
    }

    // ---------- yönetim ----------
    if (strpos($a, 'admin_') === 0) {
        if ($a === 'admin_login') {
            if (empty($cfg['admin_pass'])) fail('admin_disabled', 403);
            $n = (int)q($db, "SELECT COUNT(*) FROM sh_log WHERE ip = ? AND ev = 'admfail' AND created_at >= ?", [ip_raw(), ago(3600)])->fetchColumn();
            if ($n >= 10) fail('rate_limited', 429);
            $pass = $in['pass'] ?? '';
            if (!is_string($pass) || !hash_equals((string)$cfg['admin_pass'], $pass)) { log_ev($db, ['id' => 0, 'nick' => null], 'admfail'); usleep(400000); fail('wrong_pass', 401); }
            out(['ok' => true, 'token' => admin_token($cfg)]);
        }
        admin_check($cfg, $in['t'] ?? null);
        $admin = ['id' => 0, 'nick' => 'Sedat Okutan', 'op' => 1];

        if ($a === 'admin_stats') {
            $size = q($db, "SELECT table_name AS t, ROUND((data_length + index_length) / 1048576, 2) AS mb, table_rows AS r FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name LIKE 'sh\\_%'")->fetchAll();
            out(['ok' => true,
                'online' => (int)q($db, 'SELECT COUNT(*) FROM sh_presence WHERE seen >= ?', [ago(ONLINE_SEC)])->fetchColumn(),
                'perCh' => q($db, 'SELECT ch, COUNT(*) AS n FROM sh_presence WHERE seen >= ? GROUP BY ch', [ago(ONLINE_SEC)])->fetchAll(),
                'msgs24' => (int)q($db, 'SELECT COUNT(*) FROM sh_msgs WHERE created_at >= ?', [ago(86400)])->fetchColumn(),
                'users' => (int)q($db, 'SELECT COUNT(*) FROM sh_users WHERE nick IS NOT NULL')->fetchColumn(),
                'reports' => (int)q($db, 'SELECT COUNT(DISTINCT msg_id) FROM sh_reports r JOIN sh_msgs m ON m.id = r.msg_id WHERE r.created_at >= ?', [ago(86400)])->fetchColumn(),
                'kanallar' => q($db, 'SELECT ch, slow, auto_until, topic FROM sh_kanal')->fetchAll(),
                'ipbans' => q($db, 'SELECT LEFT(ip, 12) AS ip, until, note FROM sh_ipbans WHERE until > ? ORDER BY until DESC LIMIT 100', [now()])->fetchAll(),
                'size' => $size, 'logDays' => $LOG_DAYS]);
        }
        if ($a === 'admin_feed') {
            // son mesajlar (silinenler dahil), şikâyet sayısıyla; süzgeç: kanal, rumuz, yalnızca şikâyetli/silinmiş
            $w = []; $args = [];
            if (!empty($in['ch'])) { $w[] = 'm.ch = ?'; $args[] = chan($in['ch']); }
            if (!empty($in['user'])) { $w[] = 'm.user_id = ?'; $args[] = (int)$in['user']; }
            if (($in['only'] ?? '') === 'del') $w[] = 'm.del_at IS NOT NULL';
            if (!empty($in['before'])) { $w[] = 'm.id < ?'; $args[] = (int)$in['before']; }
            $rep = ($in['only'] ?? '') === 'rep';
            $rows = q($db, 'SELECT m.*, (SELECT COUNT(*) FROM sh_reports r WHERE r.msg_id = m.id) AS reps, u.muted_until, u.banned_until, u.op AS u_op, LEFT(u.ip, 10) AS iph
                FROM sh_msgs m LEFT JOIN sh_users u ON u.id = m.user_id' . ($w ? ' WHERE ' . implode(' AND ', $w) : '') .
                ($rep ? ' HAVING reps > 0' : '') . ' ORDER BY m.id DESC LIMIT 100', $args)->fetchAll();
            out(['ok' => true, 'rows' => array_map(fn($r) => msg_row($r) + ['ch' => $r['ch'], 'del' => $r['del_by'], 'reps' => (int)$r['reps'], 'iph' => $r['iph'],
                'muted' => ts($r['muted_until']) > time(), 'banned' => ts($r['banned_until']) > time()], $rows)]);
        }
        if ($a === 'admin_users') {
            $qn = is_string($in['q'] ?? null) ? trim($in['q']) : '';
            $rows = $qn !== ''
                ? q($db, 'SELECT id, nick, op, created_at, last_seen, muted_until, banned_until, LEFT(ip, 10) AS iph FROM sh_users WHERE nick LIKE ? ORDER BY last_seen DESC LIMIT 50',
                    ['%' . str_replace(['%', '_'], ['\%', '\_'], mb_substr($qn, 0, 16)) . '%'])->fetchAll()
                : q($db, 'SELECT id, nick, op, created_at, last_seen, muted_until, banned_until, LEFT(ip, 10) AS iph FROM sh_users WHERE nick IS NOT NULL AND (op = 1 OR muted_until > ? OR banned_until > ?) ORDER BY last_seen DESC LIMIT 100', [now(), now()])->fetchAll();
            out(['ok' => true, 'rows' => array_map(fn($r) => ['id' => (int)$r['id'], 'nick' => $r['nick'], 'op' => (bool)$r['op'], 'iph' => $r['iph'],
                'created' => ts($r['created_at']), 'seen' => ts($r['last_seen']), 'muted' => ts($r['muted_until']) > time() ? ts($r['muted_until']) : null,
                'banned' => ts($r['banned_until']) > time() ? ts($r['banned_until']) : null], $rows)]);
        }
        if ($a === 'admin_del') {
            $id = (int)($in['id'] ?? 0);
            if (!empty($in['undo'])) q($db, 'UPDATE sh_msgs SET del_at = NULL, del_by = NULL WHERE id = ?', [$id]);
            else q($db, "UPDATE sh_msgs SET del_at = ?, del_by = 'admin' WHERE id = ? AND del_at IS NULL", [now(), $id]);
            out(['ok' => true]);
        }
        if ($a === 'admin_mute') {
            $min = max(0, min(7 * 1440, (int)($in['min'] ?? 0)));
            q($db, 'UPDATE sh_users SET muted_until = ? WHERE id = ?', [$min ? gmdate('Y-m-d H:i:s', time() + $min * 60) : null, (int)($in['user'] ?? 0)]);
            out(['ok' => true]);
        }
        if ($a === 'admin_ban') {
            // days: 0 = yasağı kaldır, -1 = süresiz; wipe: son 24 saatteki mesajlarını gizle; ipHours: aynı ağı da şu kadar saat kapat
            $uid = (int)($in['user'] ?? 0); $days = (int)($in['days'] ?? 0);
            $u = q($db, 'SELECT * FROM sh_users WHERE id = ?', [$uid])->fetch(); if (!$u) fail('no_user', 404);
            $until = $days === 0 ? null : ($days < 0 ? '2099-01-01 00:00:00' : gmdate('Y-m-d H:i:s', time() + min($days, 3650) * 86400));
            q($db, 'UPDATE sh_users SET banned_until = ? WHERE id = ?', [$until, $uid]);
            if ($until) q($db, 'DELETE FROM sh_presence WHERE user_id = ?', [$uid]);
            if ($until && !empty($in['wipe'])) q($db, "UPDATE sh_msgs SET del_at = ?, del_by = 'admin' WHERE user_id = ? AND created_at >= ? AND del_at IS NULL", [now(), $uid, ago(86400)]);
            $h = (int)($in['ipHours'] ?? 0);
            if ($until && $h > 0) q($db, 'REPLACE INTO sh_ipbans (ip, until, created_at, note) VALUES (?,?,?,?)', [$u['ip'], gmdate('Y-m-d H:i:s', time() + min($h, 24 * 365) * 3600), now(), mb_substr('#' . $uid . ' ' . $u['nick'], 0, 100)]);
            if (!$until) q($db, 'DELETE FROM sh_ipbans WHERE ip = ?', [$u['ip']]);
            out(['ok' => true]);
        }
        if ($a === 'admin_ipban') {
            // yalnızca IP yasağını kaldırma (liste admin_stats'ta, özetin ilk 12 karakteriyle)
            $p = is_string($in['ip'] ?? null) ? $in['ip'] : '';
            if (!preg_match('/^[a-f0-9]{12}$/', $p)) fail('bad_ip');
            q($db, 'DELETE FROM sh_ipbans WHERE ip LIKE ?', [$p . '%']);
            out(['ok' => true]);
        }
        if ($a === 'admin_op') {
            $uid = (int)($in['user'] ?? 0); $op = !empty($in['op']) ? 1 : 0;
            q($db, 'UPDATE sh_users SET op = ? WHERE id = ?', [$op, $uid]);
            q($db, 'UPDATE sh_presence SET op = ? WHERE user_id = ?', [$op, $uid]);
            out(['ok' => true]);
        }
        if ($a === 'admin_chan') {
            $ch = chan($in['ch'] ?? ''); $slow = max(0, min(300, (int)($in['slow'] ?? 0)));
            $topic = is_string($in['topic'] ?? null) ? mb_substr(trim((string)clean_text($in['topic'])), 0, 120) : '';
            q($db, 'INSERT INTO sh_kanal (ch, slow, topic) VALUES (?,?,?) ON DUPLICATE KEY UPDATE slow = VALUES(slow), topic = VALUES(topic)', [$ch, $slow, $topic !== '' ? $topic : null]);
            if (!empty($in['autoOff'])) q($db, 'UPDATE sh_kanal SET auto_until = NULL WHERE ch = ?', [$ch]);
            out(['ok' => true]);
        }
        if ($a === 'admin_notice') {
            $text = clean_text($in['text'] ?? null); if ($text === null) fail('empty');
            $chs = ($in['ch'] ?? '') === '*' ? KANALLAR : [chan($in['ch'] ?? '')];
            foreach ($chs as $c) sys_msg($db, $c, $text, $admin, 'a');
            out(['ok' => true]);
        }
        if ($a === 'admin_claim') {
            // yöneticinin kendi sohbet rumuzu: yönetim sayfası aynı tarayıcıdaki sohbet anahtarını gönderir;
            // ayrılmış adlar (okutan, admin…) yalnızca böyle alınır, kişi moderatör olur
            $u = user_by_key($db, $in['key'] ?? null);
            $nick = clean_nick($in['nick'] ?? null, false); if ($nick === null) fail('bad_nick');
            $lc = lc($nick);
            $other = q($db, 'SELECT id FROM sh_users WHERE nick_lc = ? AND id <> ?', [$lc, $u['id']])->fetch();
            if ($other) q($db, 'UPDATE sh_users SET nick = NULL, nick_lc = NULL WHERE id = ?', [$other['id']]);
            q($db, 'UPDATE sh_users SET nick = ?, nick_lc = ?, nick_at = ?, op = 1, banned_until = NULL, muted_until = NULL WHERE id = ?', [$nick, $lc, now(), $u['id']]);
            q($db, 'UPDATE sh_presence SET nick = ?, op = 1 WHERE user_id = ?', [$nick, $u['id']]);
            $u['nick'] = $nick; log_ev($db, $u, 'nick');
            out(['ok' => true, 'nick' => $nick, 'id' => (int)$u['id']]);
        }
        if ($a === 'admin_log') {
            // yasal kayıt sorgusu: kişi numarasına ya da IP'ye göre (mesaj metni burada yok)
            $w = []; $args = [];
            if (!empty($in['user'])) { $w[] = 'user_id = ?'; $args[] = (int)$in['user']; }
            if (is_string($in['ip'] ?? null) && $in['ip'] !== '') { $w[] = 'ip = ?'; $args[] = mb_substr($in['ip'], 0, 45); }
            if (!$w) fail('need_filter');
            $rows = q($db, 'SELECT id, user_id, nick, ev, ref, ip, port, created_at FROM sh_log WHERE ' . implode(' AND ', $w) . ' ORDER BY id DESC LIMIT 500', $args)->fetchAll();
            out(['ok' => true, 'rows' => array_map(fn($r) => ['id' => (int)$r['id'], 'u' => (int)$r['user_id'], 'n' => $r['nick'], 'ev' => $r['ev'], 'ref' => $r['ref'] ? (int)$r['ref'] : null,
                'ip' => $r['ip'], 'port' => $r['port'] ? (int)$r['port'] : null, 't' => ts($r['created_at'])], $rows)]);
        }
        fail('unknown_action', 404);
    }

    // ---------- buradan sonrası anahtar ister ----------
    $u = user_by_key($db, $in['key'] ?? null);
    $banned = is_banned($db, $u, $ip);

    if ($a === 'nick') {
        if ($banned) fail('banned', 403);
        $nick = clean_nick($in['nick'] ?? null); if ($nick === null) fail('bad_nick');
        if ($u['nick'] === $nick) out(['ok' => true, 'nick' => $nick]);
        if ($u['nick_at'] && ts($u['nick_at']) > time() - 30 && lc((string)$u['nick']) !== lc($nick)) fail('nick_wait', 429);
        $lc = lc($nick);
        $other = q($db, 'SELECT id, last_seen FROM sh_users WHERE nick_lc = ? AND id <> ?', [$lc, $u['id']])->fetch();
        if ($other) {
            // 60 gündür gelmeyen kişinin rumuzu serbest kalır
            if (ts($other['last_seen']) > time() - 60 * 86400) fail('nick_taken', 409);
            q($db, 'UPDATE sh_users SET nick = NULL, nick_lc = NULL WHERE id = ?', [$other['id']]);
        }
        try { q($db, 'UPDATE sh_users SET nick = ?, nick_lc = ?, nick_at = ? WHERE id = ?', [$nick, $lc, now(), $u['id']]); }
        catch (PDOException $e) { if ($e->getCode() === '23000') fail('nick_taken', 409); throw $e; }
        $old = $u['nick']; $u['nick'] = $nick;
        log_ev($db, $u, 'nick');
        if ($old && $u['p_ch'] && ts($u['p_seen']) > time() - ONLINE_SEC) {
            sys_msg($db, $u['p_ch'], $old . ' → ' . $nick, $u, 'n');
            q($db, 'UPDATE sh_presence SET nick = ? WHERE user_id = ?', [$nick, $u['id']]);
        }
        out(['ok' => true, 'nick' => $nick]);
    }

    if ($a === 'poll') {
        $ch = chan($in['ch'] ?? 'genel'); $after = max(0, (int)($in['after'] ?? 0)); $since = (int)($in['since'] ?? 0);
        $away = is_string($in['away'] ?? null) ? mb_substr(trim((string)clean_text($in['away']) ?: ''), 0, 40) : '';
        $now = time();
        // "buradayım": yalnızca kanal/uzakta değiştiyse ya da 15 sn geçtiyse yazılır
        if ($u['nick'] && !$banned && ($u['p_ch'] !== $ch || ts($u['p_seen']) < $now - PRESENCE_SEC || (string)$u['p_away'] !== $away)) {
            q($db, 'REPLACE INTO sh_presence (user_id, ch, nick, op, away, seen) VALUES (?,?,?,?,?,?)', [$u['id'], $ch, $u['nick'], (int)$u['op'], $away !== '' ? $away : null, now()]);
            if (ts($u['last_seen']) < $now - 300) q($db, 'UPDATE sh_users SET last_seen = ? WHERE id = ?', [now(), $u['id']]);
        }
        $rows = $after > 0
            ? q($db, 'SELECT * FROM sh_msgs WHERE ch = ? AND id > ? AND del_at IS NULL ORDER BY id LIMIT 200', [$ch, $after])->fetchAll()
            : array_reverse(q($db, 'SELECT * FROM sh_msgs WHERE ch = ? AND del_at IS NULL ORDER BY id DESC LIMIT 100', [$ch])->fetchAll());
        $res = ['ok' => true, 'msgs' => array_map('msg_row', $rows), 'now' => $now, 'me' => me_info($u, $banned)];
        if ($since > 0) $res['del'] = array_map('intval', q($db, 'SELECT id FROM sh_msgs WHERE ch = ? AND del_at >= ?', [$ch, gmdate('Y-m-d H:i:s', $since - 2)])->fetchAll(PDO::FETCH_COLUMN));
        if (!empty($in['users'])) {
            $res['users'] = array_map(fn($r) => ['id' => (int)$r['user_id'], 'nick' => $r['nick'], 'op' => (bool)$r['op'], 'away' => $r['away']],
                q($db, 'SELECT user_id, nick, op, away FROM sh_presence WHERE ch = ? AND seen >= ? ORDER BY op DESC, nick LIMIT 300', [$ch, ago(ONLINE_SEC)])->fetchAll());
            $res['counts'] = [];
            foreach (q($db, 'SELECT ch, COUNT(*) AS n FROM sh_presence WHERE seen >= ? GROUP BY ch', [ago(ONLINE_SEC)])->fetchAll() as $r) $res['counts'][$r['ch']] = (int)$r['n'];
            $k = kanal_row($db, $ch); $res['slow'] = slow_of($k); $res['topic'] = $k['topic'];
        }
        if (random_int(1, 400) === 1) cleanup($db, $LOG_DAYS);
        out($res);
    }

    if ($a === 'say') {
        if ($banned) fail('banned', 403);
        if (!$u['nick']) fail('need_nick');
        if ($u['muted_until'] && ts($u['muted_until']) > time()) fail('muted', 403, ['until' => ts($u['muted_until'])]);
        $ch = chan($in['ch'] ?? ''); $text = clean_text($in['text'] ?? null); if ($text === null) fail('empty');
        $kind = !empty($in['me']) ? 'e' : 'm';
        $last = q($db, 'SELECT text, created_at FROM sh_msgs WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$u['id']])->fetch();
        $lastT = $last ? ts($last['created_at']) : 0;
        $k = kanal_row($db, $ch);
        $slow = max(slow_of($k), ts($u['created_at']) > time() - NEWBIE_SEC ? 5 : 0, 1);
        if ($lastT > time() - $slow) fail('slow', 429, ['wait' => $lastT + $slow - time()]);
        if ($last && $last['text'] === $text && $lastT > time() - 120) fail('dup', 429);
        if ((int)q($db, 'SELECT COUNT(*) FROM sh_msgs WHERE user_id = ? AND created_at >= ?', [$u['id'], ago(60)])->fetchColumn() >= 15) fail('slow', 429, ['wait' => 10]);
        // aynı ağdan çok hesapla akıtma
        if ((int)q($db, "SELECT COUNT(*) FROM sh_log WHERE ip = ? AND ev = 'msg' AND created_at >= ?", [ip_raw(), ago(60)])->fetchColumn() >= 40) fail('slow', 429, ['wait' => 10]);
        // kanalda sel: otomatik 5 dakikalık yavaş mod
        if (!($k['auto_until'] && ts($k['auto_until']) > time()) && (int)q($db, 'SELECT COUNT(*) FROM sh_msgs WHERE ch = ? AND created_at >= ?', [$ch, ago(60)])->fetchColumn() >= FLOOD_PER_MIN)
            q($db, 'INSERT INTO sh_kanal (ch, auto_until) VALUES (?, ?) ON DUPLICATE KEY UPDATE auto_until = VALUES(auto_until)', [$ch, gmdate('Y-m-d H:i:s', time() + 300)]);
        $id = sys_msg($db, $ch, $text, $u, $kind);
        log_ev($db, $u, 'msg', $id);
        if (random_int(1, 100) === 1) cleanup($db, $LOG_DAYS);
        out(['ok' => true, 'id' => $id, 'text' => $text]);
    }

    if ($a === 'report') {
        if ($banned || !$u['nick']) fail('need_nick');
        $id = (int)($in['id'] ?? 0);
        $m = q($db, 'SELECT id, user_id, del_at FROM sh_msgs WHERE id = ?', [$id])->fetch(); if (!$m) fail('no_msg', 404);
        if ((int)$m['user_id'] === (int)$u['id']) fail('own');
        q($db, 'INSERT IGNORE INTO sh_reports (msg_id, user_id, ip, created_at) VALUES (?,?,?,?)', [$id, $u['id'], $ip, now()]);
        log_ev($db, $u, 'report', $id);
        // üç ayrı ağdan şikâyet: mesaj yönetici bakana kadar gizlenir
        $n = (int)q($db, 'SELECT COUNT(DISTINCT ip) FROM sh_reports WHERE msg_id = ?', [$id])->fetchColumn();
        if ($n >= 3 && !$m['del_at']) q($db, "UPDATE sh_msgs SET del_at = ?, del_by = 'report' WHERE id = ?", [now(), $id]);
        out(['ok' => true, 'hidden' => $n >= 3]);
    }

    // ---------- moderatör (op) ----------
    if ($a === 'op_del' || $a === 'op_mute') {
        if (!(int)$u['op'] || $banned) fail('not_op', 403);
        if ($a === 'op_del') {
            $id = (int)($in['id'] ?? 0);
            q($db, "UPDATE sh_msgs SET del_at = ?, del_by = 'op' WHERE id = ? AND del_at IS NULL", [now(), $id]);
            log_ev($db, $u, 'op_del', $id);
            out(['ok' => true]);
        }
        $nick = clean_nick($in['nick'] ?? null); if ($nick === null) fail('no_user', 404);
        $t = q($db, 'SELECT id, op FROM sh_users WHERE nick_lc = ?', [lc($nick)])->fetch();
        if (!$t) fail('no_user', 404);
        if ((int)$t['op']) fail('not_op', 403);
        $min = max(1, min(60, (int)($in['min'] ?? 10)));
        q($db, 'UPDATE sh_users SET muted_until = ? WHERE id = ?', [gmdate('Y-m-d H:i:s', time() + $min * 60), $t['id']]);
        log_ev($db, $u, 'op_mute', (int)$t['id']);
        $ch = in_array($in['ch'] ?? '', KANALLAR, true) ? $in['ch'] : 'genel';
        sys_msg($db, $ch, $nick . ' ' . $min . ' dakika susturuldu (' . $u['nick'] . ').');
        out(['ok' => true]);
    }

    fail('unknown_action', 404);
} catch (Throwable $e) {
    error_log('[sohbet] ' . $e->getMessage());
    fail('server_error', 500);
}
