<?php
// Yönetim paneli — saf PHP ile gzip'li SQL yedeği (mysqldump gerekmez) ve geri yükleme.
// Yedekler PRIVATE_DIR/yedek/ altında (web kökü dışı), son BACKUP_KEEP (7) dosya tutulur.
// Geçici/hız sınırı tablolarının yalnızca yapısı yazılır, verisi atlanır (BACKUP_SKIP_DATA).
declare(strict_types=1);

const BACKUP_SKIP_DEFAULT = ['stats_seen', 'stats_online', 'adm_login', 'bp_sessions', 'bp_logins', '*_sessions', '*_moves', '*_private', '*_chat', 'sh_presence', 'sh_radyo_dinleyen'];

function backup_dir(): string
{
    $d = priv_dir('yedek');
    if (!$d) throw new RuntimeException('PRIVATE_DIR ayarlı değil: yedekler web kökü dışında bir klasöre yazılmalı (admin/config.php).');
    if (!is_dir($d) || !is_writable($d)) throw new RuntimeException('Yedek klasörü oluşturulamadı ya da yazılamıyor: ' . $d);
    if ($w = public_path_risk($d)) throw new RuntimeException('Yedek klasörü herkese açık olabilir, yedek alınmadı. ' . $w);
    return $d;
}
function backup_list(): array
{
    $d = priv_dir('yedek');
    if (!$d || !is_dir($d)) return [];
    $out = [];
    foreach (glob($d . '/okutan-*.sql.gz') ?: [] as $f) $out[] = ['file' => basename($f), 'size' => filesize($f), 'time' => filemtime($f)];
    usort($out, fn($a, $b) => $b['time'] <=> $a['time']);
    return $out;
}
function backup_skip_data(string $table): bool
{
    foreach ((array)cfg('BACKUP_SKIP_DATA', BACKUP_SKIP_DEFAULT) as $p) if (fnmatch((string)$p, $table)) return true;
    return false;
}

/** Yedek al. Dönüş: ['file'=>yol, 'tables'=>n, 'rows'=>n, 'size'=>bayt]. */
function backup_create(): array
{
    $dir = backup_dir();
    $c = db_config();
    // Büyük tablolar belleğe alınmasın diye ayrı, tamponsuz bağlantı.
    $pdo = new PDO('mysql:host=' . ($c['db_host'] ?? 'localhost') . ';dbname=' . $c['db_name'] . ';charset=utf8mb4', (string)$c['db_user'], (string)$c['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_NUM, PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    $pdo->exec('SET SESSION wait_timeout = 900');
    $tables = [];
    foreach ($pdo->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll() as $r) $tables[] = $r[0];
    $name = 'okutan-' . date('Ymd-His') . '.sql.gz';
    $part = $dir . '/' . $name . '.part';
    $gz = gzopen($part, 'wb6');
    if (!$gz) throw new RuntimeException('Yedek dosyası açılamadı: ' . $part);
    $w = function (string $s) use ($gz, $part) { if (gzwrite($gz, $s) === false) throw new RuntimeException('Yedek dosyasına yazılamadı: ' . $part); };
    $w("-- okutan.org veritabanı yedeği\n-- " . date('c') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET time_zone = '+00:00';\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n");
    $total = 0;
    try {
        foreach ($tables as $t) {
            $qt = '`' . str_replace('`', '``', $t) . '`';
            $create = $pdo->query('SHOW CREATE TABLE ' . $qt)->fetch()[1];
            $w("DROP TABLE IF EXISTS $qt;\n" . $create . ";\n");
            if (backup_skip_data($t)) { $w("-- veri atlandı (geçici tablo)\n\n"); continue; }
            $st = $pdo->query('SELECT * FROM ' . $qt);
            $buf = []; $len = 0;
            while ($r = $st->fetch()) {
                $vals = [];
                foreach ($r as $v) {
                    if ($v === null) $vals[] = 'NULL';
                    elseif (!mb_check_encoding((string)$v, 'UTF-8')) $vals[] = '0x' . bin2hex((string)$v);
                    else $vals[] = $pdo->quote((string)$v); // \n, \r, ' gibi karakterler kaçışlanır: her INSERT tek satır kalır
                }
                $line = '(' . implode(',', $vals) . ')';
                $buf[] = $line; $len += strlen($line); $total++;
                if (count($buf) >= 200 || $len > 512000) { $w("INSERT INTO $qt VALUES " . implode(',', $buf) . ";\n"); $buf = []; $len = 0; }
            }
            $st->closeCursor();
            if ($buf) $w("INSERT INTO $qt VALUES " . implode(',', $buf) . ";\n");
            $w("\n");
        }
        $w("SET FOREIGN_KEY_CHECKS = 1;\n-- son\n");
    } catch (Throwable $e) {
        gzclose($gz);
        @unlink($part); // yarım dosya kalmasın
        throw $e;
    }
    gzclose($gz);
    $file = $dir . '/' . $name;
    if (!rename($part, $file)) throw new RuntimeException('Yedek dosyası yeniden adlandırılamadı: ' . $part);
    // Eskileri sil (son N tut).
    $keep = max(1, (int)cfg('BACKUP_KEEP', 7));
    foreach (array_slice(backup_list(), $keep) as $old) @unlink($dir . '/' . $old['file']);
    setting_set('backup_last', json_encode(['file' => $name, 'at' => now(), 'tables' => count($tables), 'rows' => $total, 'size' => filesize($file)]));
    return ['file' => $file, 'tables' => count($tables), 'rows' => $total, 'size' => filesize($file)];
}

/** Yedeği verilen bağlantıya geri yükle. Dönüş: çalıştırılan komut sayısı. */
function backup_restore(string $file, PDO $pdo): int
{
    $gz = gzopen($file, 'rb');
    if (!$gz) throw new RuntimeException('Yedek açılamadı: ' . $file);
    $stmt = ''; $n = 0;
    while (($line = gzgets($gz)) !== false) {
        if ($stmt === '' && (strncmp($line, '--', 2) === 0 || trim($line) === '')) continue;
        $stmt .= $line;
        if (substr(rtrim($line), -1) === ';') { $pdo->exec($stmt); $stmt = ''; $n++; }
    }
    gzclose($gz);
    if (trim($stmt) !== '') throw new RuntimeException('Yedek dosyası yarım: son komut tamamlanmamış.');
    return $n;
}
