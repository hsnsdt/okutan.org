<?php
// Canlı Sohbet — API (PHP + MySQL, yoklama; WebSocket yok). Veritabanı ayarı ortak: ../../balon/api/config.php
//
// Kullanıcı (hesapsız; tarayıcıdaki gizli anahtar rumuzu sahiplenir, sunucu anahtarın yalnızca SHA-256 özetini tutar):
//   POST ?a=hello  {key?}                              → {key, me:{id, nick, op}}   (anahtar yoksa ya da tanınmazsa yenisi verilir)
//   POST ?a=nick   {key, nick, g?}                     → {nick, g}   (g: e erkek, k kadın, b belirtmek istemiyor; rumuz rengi)
//   POST ?a=poll   {key, ch, after, since, users, away} → {msgs, del, now, users?, counts?, slow, me}
//   POST ?a=say    {key, ch, text, me}                 → {id, text}
//        poll ayrıca: typing (yazıyor), users istenirse kişi rozetleri ve kanalın sabit mesajı (pin)
//   POST ?a=history {key, ch, before}                  → önceki 100 mesaj
//   POST ?a=report {key, id}                           → 3 ayrı ağdan şikâyet gelen mesaj kendiliğinden gizlenir
//   POST ?a=op_del {key, id} · op_mute {key, nick, min} · op_pin {key, ch, id} → moderatör (op) işlemleri
//   POST ?a=op_ban {key, user, days, wipe?, ch}       → yalnızca yönetici (op = 2): sohbetin içinden yasaklama
//   GET  ?a=count                                      → {online, ch} herkese açık sayaç (30 sn önbellek)
// #radyo (radyo.php): YouTube ile ortak dinleme. POST ?a=radyo · radyo_ekle {url} · radyo_sure {id, sure} · radyo_hata {id, kod} · radyo_oy · radyo_gec (DJ) · radyo_sil {id}; admin_dj {t, user, dj}
// Oyun kanalları (avi, zincir, gizli, yarisma; motor oyun.php): cevaplar normal mesajla (say) verilir, botlar kind 'b' mesaj yazar.
//   POST ?a=eglence {key, ch, tur: zar|yazitura|sayi, arg} · puan {key, ch} → haftalık tablo · admin_oyun {t, ch, sifirla?}
// Özel sohbet (18+ beyanı ve kural onayı gerekir; ch = 'p' + oda numarası, poll/say/history aynı uçlar):
//   POST ?a=ozel_onay {key, yas, kural} · ozel_ayar {key, kapali} · engel {key, user, kaldir?}
//   POST ?a=dm {key, nick} → {ch} bire bir · oda_ac {key, ad} → {ch, kod} · oda_katil {key, kod} · oda_cik {key, ch} · oda_at {key, ch, user}
//   Özel mesajları kimse okumaz; şikâyet edilen konuşma yönetimde incelemeye açılır (admin_ozel, admin_ozel_oku, admin_ozel_kapat, admin_ozel_tamam).
// Yönetim (config.php: admin_pass; 12 saatlik imzalı jeton):
//   POST ?a=admin_login {pass} · admin_stats · admin_feed · admin_users · admin_del · admin_mute · admin_ban · admin_ipban
//        admin_op · admin_chan · admin_notice · admin_log
//        admin_claim {t, key, nick} → yöneticinin kendi rumuzu (ayrılmış adlar serbest, op = 2: yönetici)
//        admin_words {t, add?, del?} → yasaklı kelime listesi (sh_words, koddaki temel listeye eklenir)
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

const KANALLAR = ['genel', 'okey', 'tavla', 'kart', 'kelime', 'radyo', 'avi', 'zincir', 'gizli', 'yarisma'];
const MSG_DAYS = 30;          // mesajlar bu kadar gün saklanır
const ONLINE_SEC = 70;        // bu kadar saniyedir sinyal gelmeyen kişi listeden düşer
const PRESENCE_SEC = 15;      // "buradayım" satırı en sık bu aralıkla yazılır
const MAX_TEXT = 300;
const NEWBIE_SEC = 300;       // yeni gelen ilk 5 dakika: yavaş mod 5 sn
const FLOOD_PER_MIN = 50;     // kanalda dakikada bundan fazla mesaj → 5 dakikalık otomatik yavaş mod
const BAD_WORDS = ['amk', 'aminako', 'amına', 'orospu', 'sikti', 'sikis', 'sikerim', 'siktir', 'yarrak', 'pezevenk', 'gavat', 'kahpe', 'ibne', 'fuck', 'shit', 'bitch'];
// bot adları birebir alınamaz ("Botan" gibi adlar engellenmesin diye içerme değil eşitlik)
const BOT_ADLARI = ['bot', 'kelimebot', 'zincirbot', 'gizlibot', 'bilgibot', 'zar', 'radyobot'];
const RESERVED = ['admin', 'moderator', 'yonetici', 'yönetici', 'sedatokutan', 'okutan', 'sistem', 'system', 'operator', 'nickserv', 'chanserv'];

require_once __DIR__ . '/oyun.php';
require_once __DIR__ . '/radyo.php';

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
        op TINYINT(1) NOT NULL DEFAULT 0, gender CHAR(1) NULL, ozel_onay DATETIME NULL, ozel_kapali TINYINT(1) NOT NULL DEFAULT 0, dj TINYINT(1) NOT NULL DEFAULT 0, ip CHAR(64) NOT NULL, created_at DATETIME NOT NULL, last_seen DATETIME NOT NULL,
        nick_at DATETIME NULL, muted_until DATETIME NULL, banned_until DATETIME NULL,
        UNIQUE KEY ux_key (key_hash), UNIQUE KEY ux_nick (nick_lc), KEY ix_ip (ip, created_at)
    )' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_presence (
        user_id INT UNSIGNED NOT NULL PRIMARY KEY, ch VARCHAR(12) NOT NULL, nick VARCHAR(16) NOT NULL, op TINYINT(1) NOT NULL DEFAULT 0,
        away VARCHAR(40) NULL, seen DATETIME NOT NULL, typing_at DATETIME NULL, KEY ix_ch (ch, seen)
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
        ch VARCHAR(12) NOT NULL PRIMARY KEY, slow SMALLINT UNSIGNED NOT NULL DEFAULT 0, auto_until DATETIME NULL, topic VARCHAR(120) NULL,
        pin_id BIGINT UNSIGNED NULL
    )' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_words (word VARCHAR(30) NOT NULL PRIMARY KEY, created_at DATETIME NOT NULL)' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_rozet (nick_lc VARCHAR(40) NOT NULL PRIMARY KEY, label VARCHAR(40) NOT NULL)' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_meta (k VARCHAR(20) NOT NULL PRIMARY KEY, v VARCHAR(40) NOT NULL)' . $o);
    // özel sohbet: tip d = bire bir (dm_a < dm_b), o = davetle girilen oda (kod); mesajlar sh_msgs'te ch = 'p' + id
    $db->exec('CREATE TABLE IF NOT EXISTS sh_odalar (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tip CHAR(1) NOT NULL, ad VARCHAR(40) NULL, kod CHAR(8) NULL, sahip INT UNSIGNED NOT NULL,
        dm_a INT UNSIGNED NULL, dm_b INT UNSIGNED NULL, son_id BIGINT UNSIGNED NOT NULL DEFAULT 0, son_at DATETIME NOT NULL, created_at DATETIME NOT NULL,
        kapali TINYINT(1) NOT NULL DEFAULT 0, inceleme TINYINT(1) NOT NULL DEFAULT 0,
        UNIQUE KEY ux_kod (kod), UNIQUE KEY ux_dm (dm_a, dm_b), KEY ix_inc (inceleme, son_at), KEY ix_sahip (sahip, created_at)
    )' . $o);
    // cikti: 0 üye, 1 ayrıldı (bire birde yeni mesaj gelince yeniden açılır), 2 oda sahibi çıkardı
    $db->exec('CREATE TABLE IF NOT EXISTS sh_uyeler (
        oda_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, katildi DATETIME NOT NULL, okundu BIGINT UNSIGNED NOT NULL DEFAULT 0,
        cikti TINYINT(1) NOT NULL DEFAULT 0, typing_at DATETIME NULL, PRIMARY KEY (oda_id, user_id), KEY ix_user (user_id, cikti)
    )' . $o);
    oyun_tablolar($db);
    radyo_tablolar($db);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_engel (user_id INT UNSIGNED NOT NULL, hedef_id INT UNSIGNED NOT NULL, created_at DATETIME NOT NULL, PRIMARY KEY (user_id, hedef_id))' . $o);
}
// eski kurulumlara sonradan eklenen sütunlar (canlıdaki tablolar ilk sürümle oluştu)
function migrate(PDO $db): void {
    foreach (['ALTER TABLE sh_presence ADD COLUMN typing_at DATETIME NULL', 'ALTER TABLE sh_kanal ADD COLUMN pin_id BIGINT UNSIGNED NULL',
        'ALTER TABLE sh_users ADD COLUMN gender CHAR(1) NULL', 'ALTER TABLE sh_users ADD COLUMN ozel_onay DATETIME NULL',
        'ALTER TABLE sh_users ADD COLUMN ozel_kapali TINYINT(1) NOT NULL DEFAULT 0', 'ALTER TABLE sh_users ADD COLUMN dj TINYINT(1) NOT NULL DEFAULT 0'] as $sql)
        try { $db->exec($sql); } catch (PDOException $e) { if ($e->getCode() !== '42S21') throw $e; }
}
function q(PDO $db, string $sql, array $a = []): PDOStatement {
    try { $s = $db->prepare($sql); $s->execute($a); return $s; }
    catch (PDOException $e) {
        if ($e->getCode() === '42S02') create_tables($db);
        elseif ($e->getCode() === '42S22') migrate($db);
        else throw $e;
        $s = $db->prepare($sql); $s->execute($a); return $s;
    }
}
// küfür listesi: koddaki temel liste + yönetimden eklenenler (sh_words); istek başına bir kez okunur
function words(): array {
    static $w = null;
    if ($w === null) {
        $w = BAD_WORDS;
        try { foreach (q($GLOBALS['db'], 'SELECT word FROM sh_words')->fetchAll(PDO::FETCH_COLUMN) as $x) $w[] = (string)$x; } catch (Throwable $e) {}
        $w = array_values(array_unique($w));
    }
    return $w;
}
function week_start(): string {
    $d = new DateTime('now', new DateTimeZone('Europe/Istanbul')); $d->setTime(0, 0); $d->modify('-' . ((int)$d->format('N') - 1) . ' days');
    $d->setTimezone(new DateTimeZone('UTC')); return $d->format('Y-m-d H:i:s');
}
// Oyun rozetleri: bu haftanın en çok kazanan ilk 10'u (101 Okey, Okey, Tavla, Batak, King, Pişti). 10 dakikada bir yeniden hesaplanır.
// Oyun adları sahiplenilmez; rozet yalnızca sohbetteki rumuzla oyundaki adın aynı olduğunu gösterir.
function rozetler(PDO $db): array {
    $at = q($db, "SELECT v FROM sh_meta WHERE k = 'rozet_at'")->fetchColumn();
    if (!$at || (int)$at < time() - 600) {
        q($db, "REPLACE INTO sh_meta (k, v) VALUES ('rozet_at', ?)", [(string)time()]);
        $best = [];
        foreach (['ok_' => '101 Okey', 'oy_' => 'Okey', 'tv_' => 'Tavla', 'bt_' => 'Batak', 'kg_' => 'King', 'ps_' => 'Pişti'] as $p => $ad) {
            try {
                $s = $db->prepare("SELECT name, SUM(won) AS w FROM {$p}games WHERE flag = 0 AND mode <> 'daily' AND created_at >= ? GROUP BY name HAVING w > 0 ORDER BY w DESC, COUNT(*) ASC LIMIT 10");
                $s->execute([week_start()]);
                foreach ($s->fetchAll() as $i => $r) { $k = mb_substr(lc((string)$r['name']), 0, 40); if (!isset($best[$k]) || $best[$k][0] > $i) $best[$k] = [$i, $ad . ' #' . ($i + 1)]; }
            } catch (Throwable $e) {} // oyunun tablosu henüz yoksa atla
        }
        foreach (OYUNLAR as $g => $og) {
            try {
                foreach (q($db, 'SELECT nick, puan FROM sh_puan WHERE oyun = ? AND hafta = ? ORDER BY puan DESC LIMIT 10', [$g, hafta()])->fetchAll() as $i => $r) {
                    $k = mb_substr(lc((string)$r['nick']), 0, 40); if (!isset($best[$k]) || $best[$k][0] > $i) $best[$k] = [$i, $og['ad'] . ' #' . ($i + 1)];
                }
            } catch (Throwable $e) {}
        }
        $db->beginTransaction();
        q($db, 'DELETE FROM sh_rozet');
        foreach ($best as $k => $v) q($db, 'INSERT INTO sh_rozet (nick_lc, label) VALUES (?, ?)', [$k, $v[1]]);
        $db->commit();
    }
    $out = [];
    foreach (q($db, 'SELECT nick_lc, label FROM sh_rozet')->fetchAll() as $r) $out[$r['nick_lc']] = $r['label'];
    return $out;
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
    if (in_array($f, BOT_ADLARI, true)) return null;
    foreach ($reserved ? array_merge(words(), RESERVED) : words() as $w) if (str_contains($f, flat($w))) return null;
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
    foreach (words() as $w) $t = (string)preg_replace('/[\p{L}\p{N}]*' . preg_quote($w, '/') . '[\p{L}\p{N}]*/iu', '***', $t);
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
    $u = q($db, 'SELECT u.*, p.ch AS p_ch, p.seen AS p_seen, p.away AS p_away, p.typing_at AS p_typing FROM sh_users u LEFT JOIN sh_presence p ON p.user_id = u.id WHERE u.key_hash = ?',
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
    return ['id' => (int)$u['id'], 'nick' => $u['nick'], 'op' => (int)$u['op'], 'g' => $u['gender'] ?? null, 'dj' => !empty($u['dj']),
        'ozel' => ['onay' => !empty($u['ozel_onay']), 'kapali' => !empty($u['ozel_kapali'])], 'banned' => $banned, 'muted' => $mu && $mu > time() ? $mu : null];
}
// ---- özel sohbet ----
const ODA_MAX = 50;
// herkese açık kanal için null; 'p<id>' için üyesi olunan oda satırı (değilse 404). Özel sohbet 18+/kural onayı ister.
function hedef(PDO $db, array $u, $c): ?array {
    if (is_string($c) && in_array($c, KANALLAR, true)) return null;
    if (!is_string($c) || !preg_match('/^p(\d{1,10})$/', $c, $m)) fail('bad_channel');
    if (empty($u['ozel_onay'])) fail('ozel_onay', 403);
    $o = q($db, 'SELECT o.*, y.okundu, y.cikti, y.typing_at AS y_typing FROM sh_odalar o JOIN sh_uyeler y ON y.oda_id = o.id AND y.user_id = ? WHERE o.id = ?', [$u['id'], (int)$m[1]])->fetch();
    if (!$o || ($o['tip'] === 'o' && (int)$o['cikti'] !== 0)) fail('no_room', 404);
    return $o;
}
function engelli(PDO $db, int $a, int $b): bool {
    return (bool)q($db, 'SELECT 1 FROM sh_engel WHERE (user_id = ? AND hedef_id = ?) OR (user_id = ? AND hedef_id = ?)', [$a, $b, $b, $a])->fetchColumn();
}
// odanın başlık bilgisi; bire birde karşı taraf ve engel durumu
function oda_bilgi(PDO $db, array $o, array $u): array {
    $b = ['ch' => 'p' . $o['id'], 'tip' => $o['tip'], 'ad' => $o['ad'], 'kapali' => (bool)$o['kapali'], 'sahip' => (int)$o['sahip'] === (int)$u['id']];
    if ($o['tip'] === 'o') $b['kod'] = $o['kod'];
    if ($o['tip'] === 'd') {
        $diger = (int)$o['dm_a'] === (int)$u['id'] ? (int)$o['dm_b'] : (int)$o['dm_a'];
        $d = q($db, 'SELECT id, nick, gender, op FROM sh_users WHERE id = ?', [$diger])->fetch();
        $b['diger'] = $d ? ['id' => (int)$d['id'], 'nick' => $d['nick'], 'g' => $d['gender'], 'op' => (int)$d['op']] : null;
        $b['engelledim'] = (bool)q($db, 'SELECT 1 FROM sh_engel WHERE user_id = ? AND hedef_id = ?', [$u['id'], $diger])->fetchColumn();
        $b['engellendim'] = (bool)q($db, 'SELECT 1 FROM sh_engel WHERE user_id = ? AND hedef_id = ?', [$diger, $u['id']])->fetchColumn();
    }
    return $b;
}
// kenar çubuğundaki özel konuşmalar: son mesaja göre, okunmamış işaretiyle
function ozel_liste(PDO $db, array $u): array {
    $rows = q($db, 'SELECT o.id, o.tip, o.ad, o.son_id, o.dm_a, o.dm_b, y.okundu FROM sh_uyeler y JOIN sh_odalar o ON o.id = y.oda_id
        WHERE y.user_id = ? AND y.cikti = 0 ORDER BY o.son_at DESC LIMIT 40', [$u['id']])->fetchAll();
    $diger = [];
    foreach ($rows as $r) if ($r['tip'] === 'd') $diger[] = (int)$r['dm_a'] === (int)$u['id'] ? (int)$r['dm_b'] : (int)$r['dm_a'];
    $kim = [];
    if ($diger) foreach (q($db, 'SELECT id, nick, gender FROM sh_users WHERE id IN (' . implode(',', array_map('intval', $diger)) . ')')->fetchAll() as $k) $kim[(int)$k['id']] = $k;
    return array_map(function ($r) use ($u, $kim) {
        $x = ['ch' => 'p' . $r['id'], 'tip' => $r['tip'], 'ad' => $r['ad'], 'yeni' => (int)$r['son_id'] > (int)$r['okundu'], 'son' => (int)$r['son_id']];
        if ($r['tip'] === 'd') { $d = $kim[(int)$r['dm_a'] === (int)$u['id'] ? (int)$r['dm_b'] : (int)$r['dm_a']] ?? null; $x['ad'] = $d['nick'] ?? '?'; $x['g'] = $d['gender'] ?? null; }
        return $x;
    }, $rows);
}
function oda_kodu(): string { $a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $s = ''; for ($i = 0; $i < 8; $i++) $s .= $a[random_int(0, strlen($a) - 1)]; return $s; }

function kanal_row(PDO $db, string $ch): array {
    $k = q($db, 'SELECT slow, auto_until, topic FROM sh_kanal WHERE ch = ?', [$ch])->fetch();
    return $k ?: ['slow' => 0, 'auto_until' => null, 'topic' => null];
}
function slow_of(array $k): int { return max((int)$k['slow'], ($k['auto_until'] && ts($k['auto_until']) > time()) ? 5 : 0); }
function msg_row(array $r): array {
    return ['id' => (int)$r['id'], 'u' => (int)$r['user_id'], 'n' => $r['nick'], 'op' => (int)$r['op'], 'g' => $r['g'] ?? null, 'k' => $r['kind'], 'x' => $r['text'], 't' => ts($r['created_at'])];
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
    q($db, 'DELETE y FROM sh_uyeler y JOIN sh_odalar o ON o.id = y.oda_id WHERE o.son_at < ?', [ago(90 * 86400)]);
    q($db, 'DELETE FROM sh_odalar WHERE son_at < ? LIMIT 500', [ago(90 * 86400)]);
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
// herkese açık sayaç (ana sayfa, oyunlar, oyun sayfaları): kimlik istemez, 30 sn önbellekte kalır
if ($a === 'count') {
    try {
        $per = [];
        foreach (q($db, 'SELECT ch, COUNT(*) AS n FROM sh_presence WHERE seen >= ? GROUP BY ch', [ago(ONLINE_SEC)])->fetchAll() as $r) $per[$r['ch']] = (int)$r['n'];
        header('Cache-Control: public, max-age=30');
        header('X-LiteSpeed-Cache-Control: public,max-age=30');
        out(['ok' => true, 'online' => array_sum($per), 'ch' => (object)$per]);
    } catch (Throwable $e) { fail('server_error', 500); }
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') fail('method', 405);
$in = body(); $ip = ip_hash($cfg);

try {
    // ---------- giriş: anahtar yoksa yeni kişi ----------
    if ($a === 'hello') {
        $key = $in['key'] ?? null; $u = null;
        if (is_string($key) && preg_match('/^[a-f0-9]{32}$/', $key)) $u = q($db, 'SELECT * FROM sh_users WHERE key_hash = ?', [hash('sha256', $key)])->fetch() ?: null;
        if (!$u) {
            if ((bool)q($db, 'SELECT 1 FROM sh_ipbans WHERE ip = ? AND until > ?', [$ip, now()])->fetchColumn()) fail('banned', 403);
            // aynı ağdan saatte en çok 30 yeni kişi (mobil operatörlerde çok kişi aynı IP'yi paylaşır; sınır geniş)
            if ((int)q($db, 'SELECT COUNT(*) FROM sh_users WHERE ip = ? AND created_at >= ?', [$ip, ago(3600)])->fetchColumn() >= 30) fail('rate_limited', 429);
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
            // özel mesajlar bu akışta hiç görünmez; yalnızca şikâyet edilen konuşma admin_ozel_oku ile açılır
            $w = ["m.ch NOT LIKE 'p%'"]; $args = [];
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
                ? q($db, 'SELECT id, nick, op, dj, created_at, last_seen, muted_until, banned_until, LEFT(ip, 10) AS iph FROM sh_users WHERE nick LIKE ? ORDER BY last_seen DESC LIMIT 50',
                    ['%' . str_replace(['%', '_'], ['\%', '\_'], mb_substr($qn, 0, 16)) . '%'])->fetchAll()
                : q($db, 'SELECT id, nick, op, dj, created_at, last_seen, muted_until, banned_until, LEFT(ip, 10) AS iph FROM sh_users WHERE nick IS NOT NULL AND (op > 0 OR dj = 1 OR muted_until > ? OR banned_until > ?) ORDER BY last_seen DESC LIMIT 100', [now(), now()])->fetchAll();
            out(['ok' => true, 'rows' => array_map(fn($r) => ['id' => (int)$r['id'], 'nick' => $r['nick'], 'op' => (int)$r['op'], 'dj' => !empty($r['dj']), 'iph' => $r['iph'],
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
        if ($a === 'admin_words') {
            // yasaklı kelimeler: koddaki temel liste değişmez; buradan eklenenler hem mesajda yıldızlanır hem rumuzda reddedilir
            $add = is_string($in['add'] ?? null) ? lc(trim($in['add'])) : '';
            $del = is_string($in['del'] ?? null) ? lc(trim($in['del'])) : '';
            if ($add !== '') {
                if (!preg_match('/^[\p{L}\p{N}]{2,30}$/u', $add)) fail('bad_word');
                q($db, 'INSERT IGNORE INTO sh_words (word, created_at) VALUES (?, ?)', [$add, now()]);
            }
            if ($del !== '') q($db, 'DELETE FROM sh_words WHERE word = ?', [$del]);
            out(['ok' => true, 'base' => BAD_WORDS, 'words' => q($db, 'SELECT word FROM sh_words ORDER BY word')->fetchAll(PDO::FETCH_COLUMN)]);
        }
        if ($a === 'admin_claim') {
            // yöneticinin kendi sohbet rumuzu: yönetim sayfası aynı tarayıcıdaki sohbet anahtarını gönderir;
            // ayrılmış adlar (okutan, admin…) yalnızca böyle alınır; kişi yönetici olur (op = 2, YÖNETİCİ rozeti)
            $u = user_by_key($db, $in['key'] ?? null);
            $nick = clean_nick($in['nick'] ?? null, false); if ($nick === null) fail('bad_nick');
            if (in_array($in['g'] ?? null, ['e', 'k', 'b'], true)) q($db, 'UPDATE sh_users SET gender = ? WHERE id = ?', [$in['g'], $u['id']]);
            $lc = lc($nick);
            $other = q($db, 'SELECT id FROM sh_users WHERE nick_lc = ? AND id <> ?', [$lc, $u['id']])->fetch();
            if ($other) q($db, 'UPDATE sh_users SET nick = NULL, nick_lc = NULL WHERE id = ?', [$other['id']]);
            q($db, 'UPDATE sh_users SET nick = ?, nick_lc = ?, nick_at = ?, op = 2, banned_until = NULL, muted_until = NULL WHERE id = ?', [$nick, $lc, now(), $u['id']]);
            q($db, 'UPDATE sh_presence SET nick = ?, op = 2 WHERE user_id = ?', [$nick, $u['id']]);
            $u['nick'] = $nick; log_ev($db, $u, 'nick');
            out(['ok' => true, 'nick' => $nick, 'id' => (int)$u['id']]);
        }
        if ($a === 'admin_ozel') {
            // incelemeye açılmış (şikâyet edilmiş) özel konuşmalar
            $rows = q($db, 'SELECT o.id, o.tip, o.ad, o.kapali, o.son_at, (SELECT COUNT(*) FROM sh_reports r JOIN sh_msgs m ON m.id = r.msg_id WHERE m.ch = CONCAT(\'p\', o.id)) AS reps
                FROM sh_odalar o WHERE o.inceleme = 1 ORDER BY o.son_at DESC LIMIT 100')->fetchAll();
            out(['ok' => true, 'rows' => array_map(function ($r) use ($db) {
                $uy = q($db, 'SELECT u.id, u.nick FROM sh_uyeler y JOIN sh_users u ON u.id = y.user_id WHERE y.oda_id = ? LIMIT 60', [$r['id']])->fetchAll();
                return ['ch' => 'p' . $r['id'], 'tip' => $r['tip'], 'ad' => $r['ad'], 'kapali' => (bool)$r['kapali'], 'son' => ts($r['son_at']), 'reps' => (int)$r['reps'],
                    'uyeler' => array_map(fn($x) => ['id' => (int)$x['id'], 'nick' => $x['nick']], $uy)];
            }, $rows), 'toplam' => (int)q($db, 'SELECT COUNT(*) FROM sh_odalar')->fetchColumn()]);
        }
        if ($a === 'admin_ozel_oku' || $a === 'admin_ozel_kapat' || $a === 'admin_ozel_tamam') {
            $oid = preg_match('/^p(\d+)$/', (string)($in['ch'] ?? ''), $mm) ? (int)$mm[1] : 0;
            $o = q($db, 'SELECT * FROM sh_odalar WHERE id = ?', [$oid])->fetch();
            if (!$o || !(int)$o['inceleme']) fail('no_room', 404);   // şikâyet edilmemiş konuşma okunamaz
            if ($a === 'admin_ozel_kapat') { q($db, 'UPDATE sh_odalar SET kapali = ? WHERE id = ?', [!empty($in['kapali']) ? 1 : 0, $oid]); out(['ok' => true]); }
            if ($a === 'admin_ozel_tamam') { q($db, 'UPDATE sh_odalar SET inceleme = 0 WHERE id = ?', [$oid]); out(['ok' => true]); }
            $rows = array_reverse(q($db, 'SELECT m.*, u.gender AS g, (SELECT COUNT(*) FROM sh_reports r WHERE r.msg_id = m.id) AS reps FROM sh_msgs m LEFT JOIN sh_users u ON u.id = m.user_id WHERE m.ch = ? ORDER BY m.id DESC LIMIT 300', ['p' . $oid])->fetchAll());
            out(['ok' => true, 'rows' => array_map(fn($r) => msg_row($r) + ['reps' => (int)$r['reps'], 'del' => $r['del_by']], $rows)]);
        }
        if ($a === 'admin_dj') {
            q($db, 'UPDATE sh_users SET dj = ? WHERE id = ?', [!empty($in['dj']) ? 1 : 0, (int)($in['user'] ?? 0)]);
            out(['ok' => true]);
        }
        if ($a === 'admin_oyun') {
            $ch = chan($in['ch'] ?? ''); if (!isset(OYUNLAR[$ch])) fail('bad_channel');
            if (!empty($in['sifirla'])) q($db, 'DELETE FROM sh_oyun WHERE ch = ?', [$ch]);
            $o = q($db, 'SELECT * FROM sh_oyun WHERE ch = ?', [$ch])->fetch();
            out(['ok' => true, 'oyun' => $o ? ['tur' => (int)$o['tur'], 'durum' => $o['durum'], 'cevap' => $o['cevap'], 'veri' => json_decode((string)$o['veri'], true), 'basla' => ts($o['basla']), 'ipucu' => (int)$o['ipucu']] : null]);
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
        // rumuz aynı kaldıysa denetlenmez (yöneticinin ayrılmış rumuzu da olabilir); yalnızca cinsiyet güncellenir
        $same = is_string($in['nick'] ?? null) && $u['nick'] !== null && trim(preg_replace('/\s+/u', ' ', $in['nick'])) === $u['nick'];
        $nick = $same ? $u['nick'] : clean_nick($in['nick'] ?? null); if ($nick === null) fail('bad_nick');
        // cinsiyet (isteğe bağlı): e erkek, k kadın, b belirtmek istemiyor; rumuz rengini belirler
        $g = in_array($in['g'] ?? null, ['e', 'k', 'b'], true) ? $in['g'] : null;
        if ($g !== null && $g !== ($u['gender'] ?? null)) q($db, 'UPDATE sh_users SET gender = ? WHERE id = ?', [$g, $u['id']]);
        if ($u['nick'] === $nick) out(['ok' => true, 'nick' => $nick, 'g' => $g ?? ($u['gender'] ?? null)]);
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
        out(['ok' => true, 'nick' => $nick, 'g' => $g ?? ($u['gender'] ?? null)]);
    }

    if ($a === 'poll') {
        $ch = $in['ch'] ?? 'genel'; $oda = hedef($db, $u, $ch); $after = max(0, (int)($in['after'] ?? 0)); $since = (int)($in['since'] ?? 0);
        $away = is_string($in['away'] ?? null) ? mb_substr(trim((string)clean_text($in['away']) ?: ''), 0, 40) : '';
        $now = time();
        // özel konuşmadayken kanal listesinde son açık kanalda görünmeye devam eder (yoksa hiçbir kanalda listelenmez)
        $pch = $oda ? ((string)$u['p_ch'] !== '' ? (string)$u['p_ch'] : '-') : $ch;
        // "buradayım": yalnızca kanal/uzakta değiştiyse ya da 15 sn geçtiyse yazılır
        if ($u['nick'] && !$banned && ($u['p_ch'] !== $pch || ts($u['p_seen']) < $now - PRESENCE_SEC || (string)$u['p_away'] !== $away)) {
            q($db, 'REPLACE INTO sh_presence (user_id, ch, nick, op, away, seen) VALUES (?,?,?,?,?,?)', [$u['id'], $pch, $u['nick'], (int)$u['op'], $away !== '' ? $away : null, now()]);
            if (ts($u['last_seen']) < $now - 300) q($db, 'UPDATE sh_users SET last_seen = ? WHERE id = ?', [now(), $u['id']]);
            $u['p_typing'] = null;
        }
        // "yazıyor…": yazarken en sık 3 sn'de bir, bırakınca bir kez yazılır
        $typing = !empty($in['typing']) && $u['nick'] && !$banned;
        if ($oda) {
            $tt = ts($oda['y_typing']);
            if ($typing && (!$tt || $tt < $now - 3)) q($db, 'UPDATE sh_uyeler SET typing_at = ? WHERE oda_id = ? AND user_id = ?', [now(), $oda['id'], $u['id']]);
            elseif (!$typing && $tt && $tt >= $now - 6) q($db, 'UPDATE sh_uyeler SET typing_at = NULL WHERE oda_id = ? AND user_id = ?', [$oda['id'], $u['id']]);
        } else {
            $tt = ts($u['p_typing']);
            if ($typing && (!$tt || $tt < $now - 3)) q($db, 'UPDATE sh_presence SET typing_at = ? WHERE user_id = ?', [now(), $u['id']]);
            elseif (!$typing && $tt && $tt >= $now - 6) q($db, 'UPDATE sh_presence SET typing_at = NULL WHERE user_id = ?', [$u['id']]);
        }
        if (!$oda && isset(OYUNLAR[$ch])) oyun_tik($db, $ch);
        $rows = $after > 0
            ? q($db, 'SELECT m.*, u.gender AS g FROM sh_msgs m LEFT JOIN sh_users u ON u.id = m.user_id WHERE m.ch = ? AND m.id > ? AND m.del_at IS NULL ORDER BY m.id LIMIT 200', [$ch, $after])->fetchAll()
            : array_reverse(q($db, 'SELECT m.*, u.gender AS g FROM sh_msgs m LEFT JOIN sh_users u ON u.id = m.user_id WHERE m.ch = ? AND m.del_at IS NULL ORDER BY m.id DESC LIMIT 100', [$ch])->fetchAll());
        $res = ['ok' => true, 'msgs' => array_map('msg_row', $rows), 'now' => $now, 'me' => me_info($u, $banned)];
        if ($oda && $rows) { $son = (int)end($rows)['id']; if ($son > (int)$oda['okundu']) q($db, 'UPDATE sh_uyeler SET okundu = ? WHERE oda_id = ? AND user_id = ?', [$son, $oda['id'], $u['id']]); }
        if (!empty($u['ozel_onay'])) $res['ozel'] = ozel_liste($db, $u);
        if ($ch === RADYO_KANAL) { radyo_tik($db); $res['radyo'] = radyo_durum($db, $u); }
        if ($since > 0) $res['del'] = array_map('intval', q($db, 'SELECT id FROM sh_msgs WHERE ch = ? AND del_at >= ?', [$ch, gmdate('Y-m-d H:i:s', $since - 2)])->fetchAll(PDO::FETCH_COLUMN));
        $res['typing'] = $oda
            ? q($db, 'SELECT u.nick FROM sh_uyeler y JOIN sh_users u ON u.id = y.user_id WHERE y.oda_id = ? AND y.cikti = 0 AND y.typing_at >= ? AND y.user_id <> ? LIMIT 5', [$oda['id'], ago(6), $u['id']])->fetchAll(PDO::FETCH_COLUMN)
            : q($db, 'SELECT nick FROM sh_presence WHERE ch = ? AND typing_at >= ? AND user_id <> ? LIMIT 5', [$ch, ago(6), $u['id']])->fetchAll(PDO::FETCH_COLUMN);
        if (!empty($in['users']) && $oda) {
            // özel konuşmada kişi listesi = üyeler (çevrimiçi olanlar işaretli)
            $res['users'] = array_map(fn($r) => ['id' => (int)$r['user_id'], 'nick' => $r['nick'], 'op' => (int)$r['op'], 'g' => $r['g'], 'away' => null, 'rozet' => null, 'cevrimdisi' => !$r['seen'] || ts($r['seen']) < $now - ONLINE_SEC],
                q($db, 'SELECT y.user_id, u.nick, u.op, u.gender AS g, p.seen FROM sh_uyeler y JOIN sh_users u ON u.id = y.user_id LEFT JOIN sh_presence p ON p.user_id = y.user_id WHERE y.oda_id = ? AND y.cikti = 0 ORDER BY u.nick LIMIT 60', [$oda['id']])->fetchAll());
            $res['counts'] = [];
            foreach (q($db, 'SELECT ch, COUNT(*) AS n FROM sh_presence WHERE seen >= ? GROUP BY ch', [ago(ONLINE_SEC)])->fetchAll() as $r) if (in_array($r['ch'], KANALLAR, true)) $res['counts'][$r['ch']] = (int)$r['n'];
            $res['slow'] = 0; $res['topic'] = null; $res['pin'] = null; $res['oda'] = oda_bilgi($db, $oda, $u);
        } elseif (!empty($in['users'])) {
            $roz = rozetler($db);
            $res['users'] = array_map(fn($r) => ['id' => (int)$r['user_id'], 'nick' => $r['nick'], 'op' => (int)$r['op'], 'g' => $r['g'], 'away' => $r['away'], 'dj' => (bool)$r['dj'], 'rozet' => $roz[mb_substr(lc($r['nick']), 0, 40)] ?? null],
                q($db, 'SELECT p.user_id, p.nick, p.op, p.away, u.gender AS g, u.dj FROM sh_presence p LEFT JOIN sh_users u ON u.id = p.user_id WHERE p.ch = ? AND p.seen >= ? ORDER BY p.op DESC, p.nick LIMIT 300', [$ch, ago(ONLINE_SEC)])->fetchAll());
            $res['counts'] = [];
            foreach (q($db, 'SELECT ch, COUNT(*) AS n FROM sh_presence WHERE seen >= ? GROUP BY ch', [ago(ONLINE_SEC)])->fetchAll() as $r) if (in_array($r['ch'], KANALLAR, true)) $res['counts'][$r['ch']] = (int)$r['n'];
            $k = q($db, 'SELECT slow, auto_until, topic, pin_id FROM sh_kanal WHERE ch = ?', [$ch])->fetch() ?: ['slow' => 0, 'auto_until' => null, 'topic' => null, 'pin_id' => null];
            $res['slow'] = slow_of($k); $res['topic'] = $k['topic'];
            $pin = $k['pin_id'] ? q($db, 'SELECT m.*, u.gender AS g FROM sh_msgs m LEFT JOIN sh_users u ON u.id = m.user_id WHERE m.id = ? AND m.del_at IS NULL', [(int)$k['pin_id']])->fetch() : null;
            $res['pin'] = $pin ? msg_row($pin) : null;
        }
        if (random_int(1, 400) === 1) cleanup($db, $LOG_DAYS);
        out($res);
    }

    if ($a === 'say') {
        if ($banned) fail('banned', 403);
        if (!$u['nick']) fail('need_nick');
        if ($u['muted_until'] && ts($u['muted_until']) > time()) fail('muted', 403, ['until' => ts($u['muted_until'])]);
        $ch = $in['ch'] ?? ''; $oda = hedef($db, $u, $ch); $text = clean_text($in['text'] ?? null); if ($text === null) fail('empty');
        $kind = !empty($in['me']) ? 'e' : 'm';
        if ($oda) {
            if ((int)$oda['kapali']) fail('room_closed', 403);
            if ($oda['tip'] === 'd') {
                $diger = (int)$oda['dm_a'] === (int)$u['id'] ? (int)$oda['dm_b'] : (int)$oda['dm_a'];
                if (engelli($db, (int)$u['id'], $diger)) fail('engelli', 403);
            }
        }
        $last = q($db, 'SELECT text, created_at FROM sh_msgs WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$u['id']])->fetch();
        $lastT = $last ? ts($last['created_at']) : 0;
        $k = $oda ? ['slow' => 0, 'auto_until' => '2000-01-01 00:00:00'] : kanal_row($db, $ch);
        $slow = max(slow_of($k), ts($u['created_at']) > time() - NEWBIE_SEC ? 5 : 0, 1);
        if ($lastT > time() - $slow) fail('slow', 429, ['wait' => $lastT + $slow - time()]);
        // aynı mesajı tekrar yazma engeli; oyun kanallarında yok (aynı tahmin ya da cevap yeniden denenebilir)
        if (!isset(OYUNLAR[$ch]) && $last && $last['text'] === $text && $lastT > time() - 120) fail('dup', 429);
        if ((int)q($db, 'SELECT COUNT(*) FROM sh_msgs WHERE user_id = ? AND created_at >= ?', [$u['id'], ago(60)])->fetchColumn() >= 15) fail('slow', 429, ['wait' => 10]);
        // aynı ağdan çok hesapla akıtma
        if ((int)q($db, "SELECT COUNT(*) FROM sh_log WHERE ip = ? AND ev = 'msg' AND created_at >= ?", [ip_raw(), ago(60)])->fetchColumn() >= 40) fail('slow', 429, ['wait' => 10]);
        // kanalda sel: otomatik 5 dakikalık yavaş mod
        if (!$oda && !($k['auto_until'] && ts($k['auto_until']) > time()) && (int)q($db, 'SELECT COUNT(*) FROM sh_msgs WHERE ch = ? AND user_id > 0 AND created_at >= ?', [$ch, ago(60)])->fetchColumn() >= FLOOD_PER_MIN)
            q($db, 'INSERT INTO sh_kanal (ch, auto_until) VALUES (?, ?) ON DUPLICATE KEY UPDATE auto_until = VALUES(auto_until)', [$ch, gmdate('Y-m-d H:i:s', time() + 300)]);
        $id = sys_msg($db, $ch, $text, $u, $kind);
        log_ev($db, $u, 'msg', $id);
        if ($oda) {
            q($db, 'UPDATE sh_odalar SET son_id = ?, son_at = ? WHERE id = ?', [$id, now(), $oda['id']]);
            q($db, 'UPDATE sh_uyeler SET okundu = ?, typing_at = NULL WHERE oda_id = ? AND user_id = ?', [$id, $oda['id'], $u['id']]);
            // bire birde kapatılmış konuşma yeni mesajla iki tarafta da yeniden açılır
            if ($oda['tip'] === 'd') q($db, 'UPDATE sh_uyeler SET cikti = 0 WHERE oda_id = ? AND cikti = 1', [$oda['id']]);
        }
        if ($u['p_typing']) q($db, 'UPDATE sh_presence SET typing_at = NULL WHERE user_id = ?', [$u['id']]);
        if (!$oda && $kind === 'm' && isset(OYUNLAR[$ch])) oyun_mesaj($db, $ch, $u, $text);
        if (random_int(1, 100) === 1) cleanup($db, $LOG_DAYS);
        out(['ok' => true, 'id' => $id, 'text' => $text]);
    }

    if ($a === 'report') {
        if ($banned || !$u['nick']) fail('need_nick');
        $id = (int)($in['id'] ?? 0);
        $m = q($db, 'SELECT id, user_id, ch, del_at FROM sh_msgs WHERE id = ?', [$id])->fetch(); if (!$m) fail('no_msg', 404);
        if ((int)$m['user_id'] === (int)$u['id']) fail('own');
        if ($m['ch'][0] === 'p') {
            // özel mesaj: yalnızca konuşmanın üyesi şikâyet edebilir; konuşma yönetici incelemesine açılır (mesaj gizlenmez)
            $oda = hedef($db, $u, $m['ch']);
            q($db, 'INSERT IGNORE INTO sh_reports (msg_id, user_id, ip, created_at) VALUES (?,?,?,?)', [$id, $u['id'], $ip, now()]);
            q($db, 'UPDATE sh_odalar SET inceleme = 1 WHERE id = ?', [$oda['id']]);
            log_ev($db, $u, 'report', $id);
            out(['ok' => true, 'hidden' => false, 'inceleme' => true]);
        }
        q($db, 'INSERT IGNORE INTO sh_reports (msg_id, user_id, ip, created_at) VALUES (?,?,?,?)', [$id, $u['id'], $ip, now()]);
        log_ev($db, $u, 'report', $id);
        // üç ayrı ağdan şikâyet: mesaj yönetici bakana kadar gizlenir
        $n = (int)q($db, 'SELECT COUNT(DISTINCT ip) FROM sh_reports WHERE msg_id = ?', [$id])->fetchColumn();
        if ($n >= 3 && !$m['del_at']) q($db, "UPDATE sh_msgs SET del_at = ?, del_by = 'report' WHERE id = ?", [now(), $id]);
        out(['ok' => true, 'hidden' => $n >= 3]);
    }

    if ($a === 'history') {
        // yukarı kaydırınca: verilen mesajdan önceki 100 mesaj (eskiden yeniye)
        $ch = $in['ch'] ?? ''; hedef($db, $u, $ch); $before = (int)($in['before'] ?? 0); if ($before <= 0) fail('bad_id');
        $rows = array_reverse(q($db, 'SELECT m.*, u.gender AS g FROM sh_msgs m LEFT JOIN sh_users u ON u.id = m.user_id WHERE m.ch = ? AND m.id < ? AND m.del_at IS NULL ORDER BY m.id DESC LIMIT 100', [$ch, $before])->fetchAll());
        out(['ok' => true, 'msgs' => array_map('msg_row', $rows), 'more' => count($rows) === 100]);
    }

    // ---------- #radyo: ortak dinleme (radyo.php) ----------
    if (strpos($a, 'radyo') === 0) radyo_islem($db, $a, $u, $banned, $in);

    // ---------- eğlence komutları ve oyun puanları ----------
    if ($a === 'eglence') {
        if ($banned) fail('banned', 403);
        if (!$u['nick']) fail('need_nick');
        if ($u['muted_until'] && ts($u['muted_until']) > time()) fail('muted', 403, ['until' => ts($u['muted_until'])]);
        $ch = $in['ch'] ?? ''; $oda = hedef($db, $u, $ch);
        if ($oda && (int)$oda['kapali']) fail('room_closed', 403);
        if ((int)q($db, "SELECT COUNT(*) FROM sh_log WHERE user_id = ? AND ev = 'eglence' AND created_at >= ?", [$u['id'], ago(5)])->fetchColumn() >= 1) fail('slow', 429, ['wait' => 5]);
        $id = (int)eglence($db, $ch, $u, (string)($in['tur'] ?? ''), $in['arg'] ?? null);
        log_ev($db, $u, 'eglence', $id);
        if ($oda) q($db, 'UPDATE sh_odalar SET son_id = ?, son_at = ? WHERE id = ?', [$id, now(), $oda['id']]);
        out(['ok' => true, 'id' => $id]);
    }
    if ($a === 'puan') {
        $ch = is_string($in['ch'] ?? null) ? $in['ch'] : '';
        out(['ok' => true, 'tablo' => puan_tablosu($db, $u, $ch)]);
    }

    // ---------- özel sohbet ----------
    if ($a === 'ozel_onay') {
        // 18 yaş beyanı ve özel sohbet kuralları: ikisi de işaretlenmeli
        if ($banned || !$u['nick']) fail('need_nick');
        if (empty($in['yas']) || empty($in['kural'])) fail('need_both');
        if (empty($u['ozel_onay'])) { q($db, 'UPDATE sh_users SET ozel_onay = ? WHERE id = ?', [now(), $u['id']]); log_ev($db, $u, 'onay'); }
        out(['ok' => true]);
    }
    if ($a === 'ozel_ayar') {
        q($db, 'UPDATE sh_users SET ozel_kapali = ? WHERE id = ?', [!empty($in['kapali']) ? 1 : 0, $u['id']]);
        out(['ok' => true]);
    }
    if ($a === 'dm') {
        if ($banned) fail('banned', 403);
        if (!$u['nick']) fail('need_nick');
        if (empty($u['ozel_onay'])) fail('ozel_onay', 403);
        $nick = is_string($in['nick'] ?? null) ? trim(preg_replace('/\s+/u', ' ', $in['nick'])) : '';
        $t = $nick !== '' ? q($db, 'SELECT id, nick, ozel_onay, ozel_kapali, banned_until FROM sh_users WHERE nick_lc = ?', [lc($nick)])->fetch() : null;
        if (!$t) fail('no_user', 404);
        if ((int)$t['id'] === (int)$u['id']) fail('kendin');
        if (empty($t['ozel_onay'])) fail('karsi_onay', 403);
        if ((int)$t['ozel_kapali']) fail('karsi_kapali', 403);
        if (engelli($db, (int)$u['id'], (int)$t['id'])) fail('engelli', 403);
        $a1 = min((int)$u['id'], (int)$t['id']); $b1 = max((int)$u['id'], (int)$t['id']);
        $o = q($db, "SELECT id FROM sh_odalar WHERE tip = 'd' AND dm_a = ? AND dm_b = ?", [$a1, $b1])->fetch();
        if ($o) { q($db, 'UPDATE sh_uyeler SET cikti = 0 WHERE oda_id = ? AND user_id = ?', [$o['id'], $u['id']]); out(['ok' => true, 'ch' => 'p' . $o['id']]); }
        if ((int)q($db, 'SELECT COUNT(*) FROM sh_odalar WHERE sahip = ? AND created_at >= ?', [$u['id'], ago(3600)])->fetchColumn() >= 20) fail('rate_limited', 429);
        q($db, "INSERT INTO sh_odalar (tip, sahip, dm_a, dm_b, son_at, created_at) VALUES ('d', ?, ?, ?, ?, ?)", [$u['id'], $a1, $b1, now(), now()]);
        $oid = (int)$db->lastInsertId();
        foreach ([$u['id'], $t['id']] as $uid) q($db, 'INSERT INTO sh_uyeler (oda_id, user_id, katildi) VALUES (?,?,?)', [$oid, $uid, now()]);
        log_ev($db, $u, 'dm', $oid);
        out(['ok' => true, 'ch' => 'p' . $oid]);
    }
    if ($a === 'oda_ac') {
        if ($banned) fail('banned', 403);
        if (!$u['nick']) fail('need_nick');
        if (empty($u['ozel_onay'])) fail('ozel_onay', 403);
        $ad = clean_text($in['ad'] ?? null); $ad = $ad === null ? '' : mb_substr($ad, 0, 40);
        if (mb_strlen($ad) < 2) fail('bad_name');
        if ((int)q($db, "SELECT COUNT(*) FROM sh_odalar WHERE tip = 'o' AND sahip = ? AND created_at >= ?", [$u['id'], ago(3600)])->fetchColumn() >= 5) fail('rate_limited', 429);
        for ($try = 0; ; $try++) {
            $kod = oda_kodu();
            try { q($db, "INSERT INTO sh_odalar (tip, ad, kod, sahip, son_at, created_at) VALUES ('o', ?, ?, ?, ?, ?)", [$ad, $kod, $u['id'], now(), now()]); break; }
            catch (PDOException $e) { if ($e->getCode() !== '23000' || $try >= 4) throw $e; }
        }
        $oid = (int)$db->lastInsertId();
        q($db, 'INSERT INTO sh_uyeler (oda_id, user_id, katildi) VALUES (?,?,?)', [$oid, $u['id'], now()]);
        log_ev($db, $u, 'oda_ac', $oid);
        sys_msg($db, 'p' . $oid, $u['nick'] . ' "' . $ad . '" odasını açtı. Davet bağlantısını paylaşarak kişileri çağırabilirsin.');
        out(['ok' => true, 'ch' => 'p' . $oid, 'kod' => $kod]);
    }
    if ($a === 'oda_katil') {
        if ($banned) fail('banned', 403);
        if (!$u['nick']) fail('need_nick');
        if (empty($u['ozel_onay'])) fail('ozel_onay', 403);
        $kod = is_string($in['kod'] ?? null) ? strtoupper(trim($in['kod'])) : '';
        if (!preg_match('/^[A-Z0-9]{8}$/', $kod)) fail('no_room', 404);
        $o = q($db, "SELECT * FROM sh_odalar WHERE tip = 'o' AND kod = ?", [$kod])->fetch();
        if (!$o || (int)$o['kapali']) fail('no_room', 404);
        $uy = q($db, 'SELECT cikti FROM sh_uyeler WHERE oda_id = ? AND user_id = ?', [$o['id'], $u['id']])->fetch();
        if ($uy && (int)$uy['cikti'] === 2) fail('atildin', 403);
        if (!$uy || (int)$uy['cikti'] !== 0) {
            if ((int)q($db, 'SELECT COUNT(*) FROM sh_uyeler WHERE oda_id = ? AND cikti = 0', [$o['id']])->fetchColumn() >= ODA_MAX) fail('oda_dolu', 403);
            q($db, 'INSERT INTO sh_uyeler (oda_id, user_id, katildi, okundu) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE cikti = 0, katildi = VALUES(katildi)', [$o['id'], $u['id'], now()]);
            sys_msg($db, 'p' . $o['id'], $u['nick'] . ' odaya katıldı.');
            log_ev($db, $u, 'oda_katil', (int)$o['id']);
        }
        out(['ok' => true, 'ch' => 'p' . $o['id']]);
    }
    if ($a === 'oda_cik') {
        $oda = hedef($db, $u, $in['ch'] ?? '');
        q($db, 'UPDATE sh_uyeler SET cikti = 1, typing_at = NULL WHERE oda_id = ? AND user_id = ?', [$oda['id'], $u['id']]);
        if ($oda['tip'] === 'o') sys_msg($db, 'p' . $oda['id'], $u['nick'] . ' odadan ayrıldı.');
        out(['ok' => true]);
    }
    if ($a === 'oda_at') {
        // oda sahibi birini çıkarır; çıkarılan aynı kodla geri giremez
        $oda = hedef($db, $u, $in['ch'] ?? '');
        if ($oda['tip'] !== 'o' || (int)$oda['sahip'] !== (int)$u['id']) fail('not_owner', 403);
        $hid = (int)($in['user'] ?? 0); if ($hid === (int)$u['id']) fail('kendin');
        $t = q($db, 'SELECT u.nick FROM sh_uyeler y JOIN sh_users u ON u.id = y.user_id WHERE y.oda_id = ? AND y.user_id = ? AND y.cikti = 0', [$oda['id'], $hid])->fetch();
        if (!$t) fail('no_user', 404);
        q($db, 'UPDATE sh_uyeler SET cikti = 2 WHERE oda_id = ? AND user_id = ?', [$oda['id'], $hid]);
        sys_msg($db, 'p' . $oda['id'], $t['nick'] . ' odadan çıkarıldı.');
        log_ev($db, $u, 'oda_at', $hid);
        out(['ok' => true]);
    }
    if ($a === 'engel') {
        $hid = (int)($in['user'] ?? 0); if ($hid <= 0 || $hid === (int)$u['id']) fail('no_user', 404);
        if (!empty($in['kaldir'])) q($db, 'DELETE FROM sh_engel WHERE user_id = ? AND hedef_id = ?', [$u['id'], $hid]);
        else { q($db, 'INSERT IGNORE INTO sh_engel (user_id, hedef_id, created_at) VALUES (?,?,?)', [$u['id'], $hid, now()]); log_ev($db, $u, 'engel', $hid); }
        out(['ok' => true]);
    }

    // ---------- moderatör (op) ----------
    if ($a === 'op_pin') {
        // kanalın üstüne mesaj sabitle (id = 0: kaldır)
        if (!(int)$u['op'] || $banned) fail('not_op', 403);
        $ch = chan($in['ch'] ?? ''); $id = max(0, (int)($in['id'] ?? 0));
        if ($id && !q($db, 'SELECT 1 FROM sh_msgs WHERE id = ? AND ch = ? AND del_at IS NULL', [$id, $ch])->fetchColumn()) fail('no_msg', 404);
        q($db, 'INSERT INTO sh_kanal (ch, pin_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE pin_id = VALUES(pin_id)', [$ch, $id ?: null]);
        log_ev($db, $u, 'op_pin', $id ?: null);
        sys_msg($db, $ch, $u['nick'] . ($id ? ' bir mesajı sabitledi.' : ' sabit mesajı kaldırdı.'));
        out(['ok' => true]);
    }
    if ($a === 'op_ban') {
        // yalnızca yönetici: kişiyi sohbetin içinden yasaklar; days 1, 7, 30 ya da -1 (süresiz); wipe: son 24 saatteki herkese açık mesajları gizlenir
        if ((int)$u['op'] !== 2 || $banned) fail('not_admin', 403);
        $hid = (int)($in['user'] ?? 0);
        $t = q($db, 'SELECT id, nick, op FROM sh_users WHERE id = ?', [$hid])->fetch();
        if (!$t || $hid === (int)$u['id']) fail('no_user', 404);
        if ((int)$t['op'] === 2) fail('not_admin', 403);
        $days = (int)($in['days'] ?? 1); if (!in_array($days, [1, 7, 30, -1], true)) $days = 1;
        q($db, 'UPDATE sh_users SET banned_until = ?, op = 0 WHERE id = ?', [$days < 0 ? '2099-01-01 00:00:00' : gmdate('Y-m-d H:i:s', time() + $days * 86400), $hid]);
        q($db, 'DELETE FROM sh_presence WHERE user_id = ?', [$hid]);
        if (!empty($in['wipe'])) q($db, "UPDATE sh_msgs SET del_at = ?, del_by = 'admin' WHERE user_id = ? AND created_at >= ? AND del_at IS NULL AND ch NOT LIKE 'p%'", [now(), $hid, ago(86400)]);
        log_ev($db, $u, 'op_ban', $hid);
        $ch = in_array($in['ch'] ?? '', KANALLAR, true) ? $in['ch'] : 'genel';
        sys_msg($db, $ch, $t['nick'] . ' sohbetten ' . ($days < 0 ? 'süresiz' : $days . ' gün') . ' yasaklandı.');
        out(['ok' => true]);
    }
    if ($a === 'op_del' || $a === 'op_mute') {
        if (!(int)$u['op'] || $banned) fail('not_op', 403);
        if ($a === 'op_del') {
            $id = (int)($in['id'] ?? 0);
            // özel konuşmalara moderatör karışmaz (yalnızca yönetici, şikâyet üzerine)
            q($db, "UPDATE sh_msgs SET del_at = ?, del_by = 'op' WHERE id = ? AND del_at IS NULL AND ch NOT LIKE 'p%'", [now(), $id]);
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
