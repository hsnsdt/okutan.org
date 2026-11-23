<?php
// Canlı Sohbet — #radyo: YouTube ile ortak dinleme. index.php içinden çağrılır (q, lc, sys_msg, clean_text, now, ago, ts, fail orada).
//
// Ses bizim sunucudan geçmez: sunucu yalnızca sırayı ve "hangi video, ne zaman başladı" bilgisini tutar (sh_radyo).
// Herkes YouTube'un resmi gömülü oynatıcısıyla (youtube-nocookie.com) aynı videoyu, başlangıçtan geçen süre kadar ileriden çalar.
// Video süresini YouTube'dan almak API anahtarı ister; onun yerine ilk dinleyenin oynatıcısı bildirir (radyo_sure, 5–RADYO_MAX_SN arası).
// oEmbed gömmeye kapalı videoların hepsini yakalamaz (hata 150); oynatıcı bildirir, dinleyenlerden yeterlisi bildirince geçilir (radyo_hata).
// Süre bildirilmezse şarkı en geç RADYO_MAX_SN sonra geçer. Sıra ilerletme yoklamada (radyo_tik) yapılır, satırlar kilitlenir.
// Eklenen bağlantı YouTube oEmbed ile doğrulanır: video yoksa ya da sahibi gömmeyi kapattıysa sıraya girmez; başlık oradan gelir.

const RADYO_KANAL = 'radyo';
const RADYO_MAX_SN = 600;     // en uzun şarkı (10 dk); daha uzunu bildirilince geçilir
const RADYO_SIRA_MAX = 30;    // sıradaki en çok şarkı
const RADYO_KISI_MAX = 2;     // kişi başı sırada bekleyen şarkı
const RADYO_EKLE_SN = 20;     // iki ekleme arası en az süre (kişi başı)

function radyo_tablolar(PDO $db): void {
    $o = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci';
    // durum: 0 sırada, 1 çalıyor, 2 bitti, 3 geçildi, 4 silindi
    $db->exec('CREATE TABLE IF NOT EXISTS sh_radyo (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, video CHAR(11) NOT NULL, baslik VARCHAR(160) NOT NULL, kanal VARCHAR(80) NULL,
        user_id INT UNSIGNED NOT NULL, nick VARCHAR(16) NOT NULL, eklendi DATETIME NOT NULL, basla DATETIME NULL, sure SMALLINT UNSIGNED NULL,
        durum TINYINT UNSIGNED NOT NULL DEFAULT 0, KEY ix_durum (durum, id), KEY ix_user (user_id, durum)
    )' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_radyo_oy (sira_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, PRIMARY KEY (sira_id, user_id))' . $o);
    // oynatıcının "burada çalınamaz" bildirimi (YouTube hata 100/101/150…): yeterli dinleyen bildirince şarkı geçilir
    $db->exec('CREATE TABLE IF NOT EXISTS sh_radyo_hata (sira_id INT UNSIGNED NOT NULL, user_id INT UNSIGNED NOT NULL, kod SMALLINT NOT NULL, PRIMARY KEY (sira_id, user_id))' . $o);
}

// YouTube bağlantısından 11 karakterlik video kimliği (watch?v=, youtu.be/, shorts/, embed/, live/, music.youtube.com)
function yt_kimlik(string $s): ?string {
    $s = trim($s);
    if (preg_match('/^[A-Za-z0-9_-]{11}$/', $s)) return $s;
    if (!preg_match('~^(?:https?://)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/~i', $s)) return null;
    if (preg_match('~[?&]v=([A-Za-z0-9_-]{11})~', $s, $m)) return $m[1];
    if (preg_match('~(?:youtu\.be/|/shorts/|/embed/|/live/)([A-Za-z0-9_-]{11})~', $s, $m)) return $m[1];
    return null;
}
// oEmbed: video var ve gömülebiliyorsa başlık ve kanal adı, değilse null
function yt_bilgi(string $id): ?array {
    $u = 'https://www.youtube.com/oembed?format=json&url=' . rawurlencode('https://www.youtube.com/watch?v=' . $id);
    $ctx = stream_context_create(['http' => ['timeout' => 5, 'ignore_errors' => true, 'header' => "User-Agent: okutan-sohbet\r\n"]]);
    $r = @file_get_contents($u, false, $ctx);
    if ($r === false) {
        if (function_exists('curl_init')) {
            $c = curl_init($u); curl_setopt_array($c, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 5, CURLOPT_USERAGENT => 'okutan-sohbet']);
            $r = curl_exec($c); $kod = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
            if ($kod !== 200) return null;
        } else return null;
    } elseif (isset($http_response_header[0]) && !preg_match('/\s200\s/', $http_response_header[0])) return null;
    $j = json_decode((string)$r, true);
    if (!is_array($j) || empty($j['title'])) return null;
    return ['baslik' => mb_substr((string)(clean_text((string)$j['title']) ?? 'Adsız'), 0, 160), 'kanal' => mb_substr((string)($j['author_name'] ?? ''), 0, 80)];
}
function radyo_bot(PDO $db, string $text): void { sys_msg($db, RADYO_KANAL, $text, ['id' => 0, 'nick' => 'RadyoBot', 'op' => 0], 'b'); }
function dj_mi(array $u): bool { return (int)$u['op'] > 0 || !empty($u['dj']); }

// sırayı ilerletir: çalan bittiyse sıradakini başlatır (en çok birkaç adım; uzun sessizlikte biriken şarkılar atlanır)
function radyo_tik(PDO $db): void {
    $c = q($db, 'SELECT id, basla, sure FROM sh_radyo WHERE durum = 1 ORDER BY id LIMIT 1')->fetch();
    $now = time();
    if ($c) {
        $bitis = (int)ts($c['basla']) + ($c['sure'] ? (int)$c['sure'] + 2 : RADYO_MAX_SN);
        if ($now < $bitis) return;
    } elseif (!q($db, 'SELECT 1 FROM sh_radyo WHERE durum = 0 LIMIT 1')->fetchColumn()) return;
    $db->beginTransaction();
    try {
        // çalan bittiyse sıradaki, öncekinin bittiği andan başlamış sayılır; kimse yokken biten şarkılar böylece art arda geçer
        for ($i = 0; $i < 40; $i++) {
            $c = q($db, 'SELECT * FROM sh_radyo WHERE durum = 1 ORDER BY id LIMIT 1 FOR UPDATE')->fetch();
            if ($c) {
                $bitis = (int)ts($c['basla']) + ($c['sure'] ? (int)$c['sure'] + 2 : RADYO_MAX_SN);
                if ($now < $bitis) break;
                q($db, 'UPDATE sh_radyo SET durum = 2 WHERE id = ?', [$c['id']]);
                $ref = $bitis;
            } else $ref = $now;
            $n = q($db, 'SELECT * FROM sh_radyo WHERE durum = 0 ORDER BY id LIMIT 1 FOR UPDATE')->fetch();
            if (!$n) break;
            $bas = max($ref, $now - RADYO_MAX_SN);
            q($db, 'UPDATE sh_radyo SET durum = 1, basla = ? WHERE id = ?', [gmdate('Y-m-d H:i:s', $bas), $n['id']]);
            if ($now - $bas < 30) radyo_bot($db, '🎵 Şimdi çalıyor: ' . $n['baslik'] . ' (ekleyen ' . $n['nick'] . ')');
        }
        $db->commit();
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}
function radyo_durum(PDO $db, array $u): array {
    $row = fn($r) => ['id' => (int)$r['id'], 'video' => $r['video'], 'baslik' => $r['baslik'], 'kanal' => $r['kanal'], 'nick' => $r['nick'], 'u' => (int)$r['user_id'],
        'basla' => $r['basla'] ? ts($r['basla']) : null, 'sure' => $r['sure'] ? (int)$r['sure'] : null];
    $c = q($db, 'SELECT * FROM sh_radyo WHERE durum = 1 ORDER BY id LIMIT 1')->fetch();
    $sira = q($db, 'SELECT * FROM sh_radyo WHERE durum = 0 ORDER BY id LIMIT ' . RADYO_SIRA_MAX)->fetchAll();
    $oy = $c ? (int)q($db, 'SELECT COUNT(*) FROM sh_radyo_oy WHERE sira_id = ?', [$c['id']])->fetchColumn() : 0;
    $verdim = $c ? (bool)q($db, 'SELECT 1 FROM sh_radyo_oy WHERE sira_id = ? AND user_id = ?', [$c['id'], $u['id']])->fetchColumn() : false;
    return ['simdi' => $c ? $row($c) : null, 'sira' => array_map($row, $sira), 'oy' => $oy, 'oyGerek' => radyo_oy_esik($db), 'verdim' => $verdim, 'dj' => dj_mi($u), 'now' => time()];
}
// atlamak için gereken oy: kanalda dinleyenlerin yarısı, en az 2
function radyo_oy_esik(PDO $db): int {
    $n = (int)q($db, 'SELECT COUNT(*) FROM sh_presence WHERE ch = ? AND seen >= ?', [RADYO_KANAL, ago(70)])->fetchColumn();
    return max(2, (int)ceil($n / 2));
}
function radyo_gec(PDO $db, int $id, string $neden): void {
    q($db, 'UPDATE sh_radyo SET durum = 3 WHERE id = ? AND durum = 1', [$id]);
    radyo_bot($db, '⏭ ' . $neden);
    radyo_tik($db);
}

// ---------- uçlar (index.php çağırır; $u doğrulanmış kişi, $banned) ----------
function radyo_islem(PDO $db, string $a, array $u, bool $banned, array $in): void {
    if ($a === 'radyo') { radyo_tik($db); out(['ok' => true, 'radyo' => radyo_durum($db, $u)]); }
    if ($banned) fail('banned', 403);
    if (!$u['nick']) fail('need_nick');
    if ($a === 'radyo_ekle') {
        if ($u['muted_until'] && ts($u['muted_until']) > time()) fail('muted', 403, ['until' => ts($u['muted_until'])]);
        $id = yt_kimlik((string)($in['url'] ?? '')); if ($id === null) fail('yt_bad');
        if (q($db, 'SELECT 1 FROM sh_radyo WHERE video = ? AND durum IN (0, 1)', [$id])->fetchColumn()) fail('yt_sirada');
        if (!dj_mi($u)) {
            if ((int)q($db, 'SELECT COUNT(*) FROM sh_radyo WHERE user_id = ? AND durum = 0', [$u['id']])->fetchColumn() >= RADYO_KISI_MAX) fail('yt_kisi');
            $son = q($db, 'SELECT eklendi FROM sh_radyo WHERE user_id = ? ORDER BY id DESC LIMIT 1', [$u['id']])->fetchColumn();
            if ($son && (int)ts($son) > time() - RADYO_EKLE_SN) fail('slow', 429, ['wait' => (int)ts($son) + RADYO_EKLE_SN - time()]);
        }
        if ((int)q($db, 'SELECT COUNT(*) FROM sh_radyo WHERE durum = 0')->fetchColumn() >= RADYO_SIRA_MAX) fail('yt_dolu');
        $b = yt_bilgi($id); if ($b === null) fail('yt_gomulemez');
        q($db, 'INSERT INTO sh_radyo (video, baslik, kanal, user_id, nick, eklendi) VALUES (?,?,?,?,?,?)', [$id, $b['baslik'], $b['kanal'], $u['id'], $u['nick'], now()]);
        $yeni = (int)$db->lastInsertId();
        log_ev($db, $u, 'radyo', $yeni);
        $once = (int)q($db, 'SELECT COUNT(*) FROM sh_radyo WHERE durum IN (0, 1) AND id < ?', [$yeni])->fetchColumn();
        radyo_bot($db, '➕ ' . $u['nick'] . ' sıraya ekledi: ' . $b['baslik'] . ($once ? ' (' . $once . ' şarkı sonra)' : ''));
        radyo_tik($db);
        out(['ok' => true, 'radyo' => radyo_durum($db, $u)]);
    }
    if ($a === 'radyo_sure') {
        // ilk dinleyenin oynatıcısı süreyi bildirir; yalnızca çalan şarkı için ve bir kez
        $id = (int)($in['id'] ?? 0); $s = (int)round((float)($in['sure'] ?? 0));
        if ($s < 5) fail('bad_sure');
        $c = q($db, 'SELECT id, sure, nick, baslik FROM sh_radyo WHERE id = ? AND durum = 1', [$id])->fetch();
        if (!$c || $c['sure']) out(['ok' => true]);
        if ($s > RADYO_MAX_SN) { q($db, 'UPDATE sh_radyo SET sure = ? WHERE id = ?', [$s, $id]); radyo_gec($db, $id, $c['baslik'] . ' 10 dakikadan uzun, geçildi.'); out(['ok' => true]); }
        q($db, 'UPDATE sh_radyo SET sure = ? WHERE id = ? AND sure IS NULL', [$s, $id]);
        out(['ok' => true]);
    }
    if ($a === 'radyo_hata') {
        $id = (int)($in['id'] ?? 0); $kod = (int)($in['kod'] ?? 0);
        if (!in_array($kod, [2, 5, 100, 101, 150, 153], true)) fail('bad_kod');
        $c = q($db, 'SELECT id, baslik FROM sh_radyo WHERE id = ? AND durum = 1', [$id])->fetch(); if (!$c) out(['ok' => true]);
        q($db, 'INSERT IGNORE INTO sh_radyo_hata (sira_id, user_id, kod) VALUES (?,?,?)', [$id, $u['id'], $kod]);
        $n = (int)q($db, 'SELECT COUNT(*) FROM sh_radyo_hata WHERE sira_id = ?', [$id])->fetchColumn();
        $dinleyen = (int)q($db, 'SELECT COUNT(*) FROM sh_presence WHERE ch = ? AND seen >= ?', [RADYO_KANAL, ago(70)])->fetchColumn();
        // tek kişi sahte bildirimle şarkı atlatamasın: en az 2 bildirim (kanalda tek dinleyen varsa 1)
        if ($n >= min(2, max(1, $dinleyen))) radyo_gec($db, $id, 'Burada çalınamıyor (sahibi başka sitelerde çalınmasını kapatmış), geçildi: ' . $c['baslik']);
        out(['ok' => true, 'radyo' => radyo_durum($db, $u)]);
    }
    if ($a === 'radyo_oy') {
        $c = q($db, 'SELECT id, baslik FROM sh_radyo WHERE durum = 1 ORDER BY id LIMIT 1')->fetch(); if (!$c) fail('yt_yok');
        q($db, 'INSERT IGNORE INTO sh_radyo_oy (sira_id, user_id) VALUES (?, ?)', [$c['id'], $u['id']]);
        $oy = (int)q($db, 'SELECT COUNT(*) FROM sh_radyo_oy WHERE sira_id = ?', [$c['id']])->fetchColumn();
        if ($oy >= radyo_oy_esik($db)) radyo_gec($db, (int)$c['id'], 'Dinleyenlerin oyuyla geçildi: ' . $c['baslik']);
        out(['ok' => true, 'radyo' => radyo_durum($db, $u)]);
    }
    if ($a === 'radyo_gec') {
        if (!dj_mi($u)) fail('not_dj', 403);
        $c = q($db, 'SELECT id, baslik FROM sh_radyo WHERE durum = 1 ORDER BY id LIMIT 1')->fetch(); if (!$c) fail('yt_yok');
        radyo_gec($db, (int)$c['id'], $u['nick'] . ' geçti: ' . $c['baslik']);
        log_ev($db, $u, 'radyo_gec', (int)$c['id']);
        out(['ok' => true, 'radyo' => radyo_durum($db, $u)]);
    }
    if ($a === 'radyo_sil') {
        // sıradaki şarkıyı ekleyen ya da DJ siler
        $id = (int)($in['id'] ?? 0);
        $r = q($db, 'SELECT id, user_id FROM sh_radyo WHERE id = ? AND durum = 0', [$id])->fetch(); if (!$r) fail('yt_yok', 404);
        if ((int)$r['user_id'] !== (int)$u['id'] && !dj_mi($u)) fail('not_dj', 403);
        q($db, 'UPDATE sh_radyo SET durum = 4 WHERE id = ?', [$id]);
        out(['ok' => true, 'radyo' => radyo_durum($db, $u)]);
    }
    fail('unknown_action', 404);
}
