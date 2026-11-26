<?php
// Yönetim paneli — veritabanı. Ayarlar ortak dosyadan (balon/api/config.php) okunur.
// Kurallar: tüm SQL prepared statement; hata YUTULMAZ (günlüğe yazılır ve DbError fırlatılır, ekranda görünür);
// tablolar ilk kullanımda oluşur (42S02 gelince şema kurulur, sorgu bir kez yeniden denenir);
// bağlantı koparsa (2006/2013, paylaşımlı hostta wait_timeout kısa) bir kez yeniden bağlanılır.
declare(strict_types=1);

final class DbError extends RuntimeException {}
final class Db
{
    public static ?PDO $pdo = null;
    public static bool $schemaDone = false;
    public static bool $migrated = false;
    public static ?string $failed = null; // bu istekte bağlantı kurulamadıysa tekrar denenmez (her deneme saniyeler sürebilir)
}

function db(): PDO
{
    if (Db::$pdo) return Db::$pdo;
    if (Db::$failed !== null) throw new DbError(Db::$failed);
    $c = db_config();
    if (!$c || empty($c['db_name'])) throw new DbError('Veritabanı ayarı bulunamadı (balon/api/config.php yok ya da eksik).');
    try {
        $pdo = new PDO('mysql:host=' . ($c['db_host'] ?? 'localhost') . ';dbname=' . $c['db_name'] . ';charset=utf8mb4',
            (string)($c['db_user'] ?? ''), (string)($c['db_pass'] ?? ''), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_TIMEOUT => 5,
            ]);
        // Tarih/saatler PHP'nin saat dilimiyle (Europe/Istanbul) yazılır ve karşılaştırılır.
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    } catch (PDOException $e) {
        adm_log('DB bağlantı hatası: ' . $e->getMessage());
        Db::$failed = 'Veritabanına bağlanılamadı: ' . $e->getMessage();
        throw new DbError(Db::$failed);
    }
    return Db::$pdo = $pdo;
}

/** Uzun dış API çağrılarından sonra: bağlantı ölmüşse yeniden bağlan. */
function db_ping(): void
{
    if (!Db::$pdo) return;
    try { Db::$pdo->query('SELECT 1'); } catch (Throwable $e) { Db::$pdo = null; db(); }
}

function q(string $sql, array $a = [], int $try = 0): PDOStatement
{
    try {
        $st = db()->prepare($sql);
        $st->execute($a);
        return $st;
    } catch (PDOException $e) {
        $code = (string)$e->getCode();
        $drv = (int)($e->errorInfo[1] ?? 0);
        if ($code === '42S02' && !Db::$schemaDone && $try < 2) { db_schema(); return q($sql, $a, $try + 1); }
        if ($code === '42S22' && !Db::$migrated && $try < 2) { db_migrate(); return q($sql, $a, $try + 1); }
        if (($drv === 2006 || $drv === 2013) && $try < 2) { Db::$pdo = null; return q($sql, $a, $try + 1); }
        adm_log('SQL hatası: ' . $e->getMessage() . ' | ' . preg_replace('/\s+/', ' ', $sql));
        throw new DbError('Sorgu başarısız: ' . $e->getMessage());
    }
}
function rows(string $sql, array $a = []): array { return q($sql, $a)->fetchAll(); }
function row(string $sql, array $a = []): ?array { $r = q($sql, $a)->fetch(); return $r === false ? null : $r; }
function val(string $sql, array $a = []) { $r = q($sql, $a)->fetchColumn(); return $r === false ? null : $r; }

/** Ayar/önbellek deposu (adm_settings). */
function setting_get(string $k, bool $allowExpired = false): ?string
{
    $r = row('SELECT v, expires_at FROM adm_settings WHERE k = ?', [$k]);
    if (!$r) return null;
    if (!$allowExpired && $r['expires_at'] !== null && strtotime($r['expires_at']) < time()) return null;
    return $r['v'];
}
function setting_set(string $k, ?string $v, ?int $ttl = null): void
{
    q('INSERT INTO adm_settings (k, v, expires_at, updated_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE v = VALUES(v), expires_at = VALUES(expires_at), updated_at = VALUES(updated_at)',
        [$k, $v, $ttl ? date('Y-m-d H:i:s', time() + $ttl) : null, now()]);
}
function setting_del(string $prefix): void { q('DELETE FROM adm_settings WHERE k LIKE ?', [$prefix . '%']); }

/** Sonradan eklenen sütunlar (eski kurulumlar): 42S22 gelince bir kez çalışır; sütun zaten varsa (1060) geçilir. */
function db_migrate(): void
{
    Db::$migrated = true;
    $alter = [
        "ALTER TABLE stats_online ADD COLUMN br VARCHAR(16) NOT NULL DEFAULT ''",
        "ALTER TABLE stats_online ADD COLUMN os VARCHAR(16) NOT NULL DEFAULT ''",
        "ALTER TABLE stats_online ADD COLUMN cc CHAR(2) NOT NULL DEFAULT ''",
        "ALTER TABLE stats_online ADD COLUMN first_seen DATETIME NULL",
    ];
    foreach ($alter as $s) {
        try { db()->exec($s); }
        catch (PDOException $e) {
            if ((int)($e->errorInfo[1] ?? 0) === 1060) continue;
            adm_log('Göç başarısız: ' . $e->getMessage());
            throw new DbError('Tablo güncellenemedi: ' . $e->getMessage());
        }
    }
}

/** Tüm panel tabloları — site tablolarıyla aynı karakter seti ve collation (metin JOIN'lerinde sorun çıkmasın). */
function db_schema(): void
{
    Db::$schemaDone = true;
    $T = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci';
    $sql = [
        "CREATE TABLE IF NOT EXISTS stats_daily (day DATE NOT NULL, metric VARCHAR(40) NOT NULL, n INT UNSIGNED NOT NULL DEFAULT 0,
            uniques INT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (day, metric))",
        "CREATE TABLE IF NOT EXISTS stats_dim (day DATE NOT NULL, dim VARCHAR(8) NOT NULL, val VARCHAR(191) NOT NULL,
            n INT UNSIGNED NOT NULL DEFAULT 0, PRIMARY KEY (day, dim, val), KEY ix_dim (dim, day))",
        "CREATE TABLE IF NOT EXISTS stats_seen (day DATE NOT NULL, metric VARCHAR(40) NOT NULL, h BINARY(16) NOT NULL,
            PRIMARY KEY (day, metric, h))",
        "CREATE TABLE IF NOT EXISTS stats_online (h BINARY(16) NOT NULL PRIMARY KEY, last_seen DATETIME NOT NULL,
            path VARCHAR(191) NOT NULL, dev VARCHAR(8) NOT NULL, br VARCHAR(16) NOT NULL DEFAULT '', os VARCHAR(16) NOT NULL DEFAULT '',
            cc CHAR(2) NOT NULL DEFAULT '', first_seen DATETIME NULL, KEY ix_seen (last_seen))",
        "CREATE TABLE IF NOT EXISTS adm_settings (k VARCHAR(191) NOT NULL PRIMARY KEY, v MEDIUMTEXT NULL,
            expires_at DATETIME NULL, updated_at DATETIME NOT NULL)",
        "CREATE TABLE IF NOT EXISTS adm_login (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, ip_hash CHAR(64) NOT NULL,
            at DATETIME NOT NULL, KEY ix_ip (ip_hash, at))",
        "CREATE TABLE IF NOT EXISTS adm_notes (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, text TEXT NOT NULL,
            priority TINYINT UNSIGNED NOT NULL DEFAULT 2, due DATE NULL, done TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL, done_at DATETIME NULL, KEY ix_open (done, due))",
        "CREATE TABLE IF NOT EXISTS adm_cron (name VARCHAR(32) NOT NULL PRIMARY KEY, last_start DATETIME NULL, last_end DATETIME NULL,
            status VARCHAR(8) NOT NULL DEFAULT '', message TEXT NULL, runs INT UNSIGNED NOT NULL DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS adm_inspect (uh BINARY(20) NOT NULL PRIMARY KEY, url VARCHAR(1000) NOT NULL,
            in_list TINYINT(1) NOT NULL DEFAULT 1, verdict VARCHAR(32) NULL, coverage VARCHAR(191) NULL, indexing VARCHAR(48) NULL,
            robots VARCHAR(32) NULL, fetch_state VARCHAR(48) NULL, last_crawl DATETIME NULL, google_canonical VARCHAR(1000) NULL,
            user_canonical VARCHAR(1000) NULL, checked_at DATETIME NULL, error TEXT NULL, KEY ix_checked (in_list, checked_at))",
    ];
    foreach ($sql as $s) {
        try { db()->exec($s . $T); }
        catch (PDOException $e) {
            adm_log('Tablo oluşturulamadı: ' . $e->getMessage());
            throw new DbError('Tablo oluşturulamadı: ' . $e->getMessage());
        }
    }
}
