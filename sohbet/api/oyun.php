<?php
// Canlı Sohbet — oyun kanalları ve eğlence komutları. index.php içinden çağrılır (q, lc, sys_msg, words, now, ago, ts orada).
//
// Kanallar: avi (kelime avı: karışık harften kelimeyi bul), zincir (son harfle yeni kelime), gizli (kanalda Wordle tarzı tahmin),
//           yarisma (bilgi yarışması, sorular sorular.json'da).
// Bot sunucuda sürekli çalışmaz: oyunun durumu sh_oyun'da tutulur; yoklama (oyun_tik) ve mesaj (oyun_mesaj) sırasında süresi
// dolan adım (ipucu, cevap, yeni tur) işlenir. OYUN_BOS_SN boyunca insan mesajı yoksa yeni tur başlamaz (boş kanalda bot konuşmaz).
// Kelimeler Kelime Bulucu'nun sözlüğünden (kelime-bulucu/sozluk.txt, ön ekle sıkıştırılmış) ve sık kelime listesinden (veri/sik.txt).
// Puanlar sh_puan'da haftalık (Türkiye saatiyle pazartesi başlar); haftanın ilk 10'u kişi listesinde rozet olarak görünür.

const OYUNLAR = [
    'avi' => ['bot' => 'KelimeBot', 'ad' => 'Kelime Avı'],
    'zincir' => ['bot' => 'ZincirBot', 'ad' => 'Zincir'],
    'gizli' => ['bot' => 'GizliBot', 'ad' => 'Gizli Kelime'],
    'yarisma' => ['bot' => 'BilgiBot', 'ad' => 'Yarışma'],
];
const OYUN_BOS_SN = 180;   // bu kadar süredir insan mesajı yoksa yeni tur başlamaz
const OYUN_ARA_SN = 6;     // tur bitince yenisine kadar bekleme
const ZINCIR_BOS_SN = 600; // zincir bu kadar sessiz kalırsa yeni zincir başlar

function oyun_tablolar(PDO $db): void {
    $o = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci';
    $db->exec('CREATE TABLE IF NOT EXISTS sh_oyun (
        ch VARCHAR(12) NOT NULL PRIMARY KEY, tur INT UNSIGNED NOT NULL DEFAULT 0, durum VARCHAR(8) NOT NULL DEFAULT \'bekle\',
        cevap VARCHAR(200) NULL, veri TEXT NULL, basla DATETIME NULL, sonraki DATETIME NULL, ipucu TINYINT UNSIGNED NOT NULL DEFAULT 0
    )' . $o);
    $db->exec('CREATE TABLE IF NOT EXISTS sh_puan (
        user_id INT UNSIGNED NOT NULL, oyun VARCHAR(10) NOT NULL, hafta DATE NOT NULL, puan INT UNSIGNED NOT NULL DEFAULT 0, nick VARCHAR(16) NOT NULL,
        PRIMARY KEY (user_id, oyun, hafta), KEY ix_tablo (oyun, hafta, puan)
    )' . $o);
}

// ---------- metin yardımcıları ----------
function tr_up(string $s): string { return mb_strtoupper(strtr($s, ['i' => 'İ', 'ı' => 'I']), 'UTF-8'); }
function katla(string $s): string { return strtr(lc($s), ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u']); }
function harfler(string $s): array { return preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: []; }
// cevap karşılaştırması: küçük harf, Türkçe harfler katlanır, harf ve rakam dışı her şey atılır
function cevap_norm(string $s): string { return (string)preg_replace('/[^a-z0-9]/', '', katla($s)); }
// mesaj tek kelimeyse (yalnızca harf) küçük harfle döner, değilse null
function tek_kelime(string $t): ?string { $t = trim($t); return preg_match('/^\p{L}{2,20}$/u', $t) ? lc($t) : null; }
function aralikli(string $w): string { return implode(' ', harfler(tr_up($w))); }

// ---------- sözlük ----------
// set: kelime → 1 (UTF-8, küçük harf); katli: Türkçe harfsiz yazım → kelime (telefonda Türkçe klavyesi olmayanlar için)
function sozluk(): array {
    static $S = null;
    if ($S !== null) return $S;
    $S = ['set' => [], 'katli' => []];
    $f = __DIR__ . '/../../kelime-bulucu/sozluk.txt';
    if (!is_file($f)) return $S;
    $iso = (string)iconv('UTF-8', 'ISO-8859-9//IGNORE', (string)file_get_contents($f));
    $tr = (string)iconv('UTF-8', 'ISO-8859-9', 'çğıöşü');
    $o = '';
    foreach (explode("\n", $iso) as $sat) {
        $sat = rtrim($sat, "\r"); if ($sat === '') continue;
        $j = strspn($sat, '0123456789'); $n = $j ? (int)substr($sat, 0, $j) : 0;
        $o = substr($o, 0, $n) . substr($sat, $j);
        $u = (string)iconv('ISO-8859-9', 'UTF-8', $o);
        $S['set'][$u] = 1;
        $k = strtr($o, $tr, 'cgiosu');
        if (!isset($S['katli'][$k])) $S['katli'][$k] = $u;
    }
    return $S;
}
// yazılan kelimenin sözlükteki hâli (Türkçe harfsiz yazılmışsa tamamlanır) ya da null
function sozlukte(string $w): ?string {
    $S = sozluk(); $w = lc($w);
    if (isset($S['set'][$w])) return $w;
    $k = katla($w);
    return $S['katli'][$k] ?? null;
}
// sık kullanılan kelimelerden, harf sayısı aralığında, sözlükte olan ve küfür içermeyenler
function sik_kelimeler(int $min, int $max, int $ilk = 4000): array {
    static $cache = [];
    $key = "$min-$max-$ilk";
    if (isset($cache[$key])) return $cache[$key];
    $f = __DIR__ . '/../../kelime-bulucu/veri/sik.txt';
    $out = [];
    if (is_file($f)) {
        $S = sozluk(); $kotu = array_map('flat', words());
        foreach (array_slice(explode("\n", str_replace("\r", '', (string)file_get_contents($f))), 0, $ilk) as $w) {
            $w = trim($w); $n = mb_strlen($w, 'UTF-8');
            if ($n < $min || $n > $max || !preg_match('/^\p{Ll}+$/u', $w) || !isset($S['set'][$w])) continue;
            $fl = flat($w); foreach ($kotu as $k) if ($k !== '' && str_contains($fl, $k)) continue 2;
            $out[] = $w;
        }
    }
    return $cache[$key] = $out;
}
function sec(array $liste, array $son): ?string {
    if (!$liste) return null;
    for ($i = 0; $i < 20; $i++) { $w = $liste[random_int(0, count($liste) - 1)]; if (!in_array($w, $son, true)) return $w; }
    return $liste[random_int(0, count($liste) - 1)];
}
function sorular(): array {
    static $Q = null;
    if ($Q === null) { $j = json_decode((string)@file_get_contents(__DIR__ . '/sorular.json'), true); $Q = is_array($j) ? array_values($j) : []; }
    return $Q;
}

// ---------- durum ve puan ----------
function bot(PDO $db, string $ch, string $text): int {
    return sys_msg($db, $ch, $text, ['id' => 0, 'nick' => OYUNLAR[$ch]['bot'] ?? 'Bot', 'op' => 0], 'b');
}
// oyun satırını kilitleyerek okur (iki istek aynı anda tur ilerletmesin); çağıran oyun_kaydet ile bitirir
function oyun_kilit(PDO $db, string $ch): array {
    $db->beginTransaction();
    $o = q($db, 'SELECT * FROM sh_oyun WHERE ch = ? FOR UPDATE', [$ch])->fetch();
    if (!$o) {
        q($db, "INSERT IGNORE INTO sh_oyun (ch, durum) VALUES (?, 'bekle')", [$ch]);
        $o = q($db, 'SELECT * FROM sh_oyun WHERE ch = ? FOR UPDATE', [$ch])->fetch();
    }
    $o['veri'] = json_decode((string)$o['veri'], true) ?: [];
    return $o;
}
function oyun_kaydet(PDO $db, array $o): void {
    q($db, 'UPDATE sh_oyun SET tur = ?, durum = ?, cevap = ?, veri = ?, basla = ?, sonraki = ?, ipucu = ? WHERE ch = ?',
        [(int)$o['tur'], $o['durum'], $o['cevap'], json_encode($o['veri'], JSON_UNESCAPED_UNICODE), $o['basla'], $o['sonraki'], (int)$o['ipucu'], $o['ch']]);
    $db->commit();
}
function oyun_birak(PDO $db): void { if ($db->inTransaction()) $db->commit(); }
function hafta(): string { return (new DateTime(week_start() . ' UTC'))->setTimezone(new DateTimeZone('Europe/Istanbul'))->format('Y-m-d'); }
function puan_ekle(PDO $db, array $u, string $oyun, int $p): int {
    q($db, 'INSERT INTO sh_puan (user_id, oyun, hafta, puan, nick) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE puan = puan + VALUES(puan), nick = VALUES(nick)',
        [$u['id'], $oyun, hafta(), $p, $u['nick']]);
    return (int)q($db, 'SELECT puan FROM sh_puan WHERE user_id = ? AND oyun = ? AND hafta = ?', [$u['id'], $oyun, hafta()])->fetchColumn();
}
function son_insan(PDO $db, string $ch): int {
    $t = q($db, "SELECT created_at FROM sh_msgs WHERE ch = ? AND user_id > 0 AND kind IN ('m','e') ORDER BY id DESC LIMIT 1", [$ch])->fetchColumn();
    return $t ? (int)ts($t) : 0;
}

// ---------- tur başlatma ve zaman adımları ----------
function yeni_tur(PDO $db, array &$o): void {
    $ch = $o['ch']; $son = $o['veri']['son'] ?? [];
    $o['tur'] = (int)$o['tur'] + 1; $o['ipucu'] = 0; $o['basla'] = now(); $o['sonraki'] = null; $o['durum'] = 'aktif';
    if ($ch === 'avi') {
        $w = sec(sik_kelimeler(4, 8), $son); if ($w === null) { $o['durum'] = 'bekle'; return; }
        $h = harfler($w);
        for ($i = 0; $i < 10; $i++) { shuffle($h); if (implode('', $h) !== $w) break; }
        $o['cevap'] = $w; $o['veri'] = ['son' => array_slice(array_merge([$w], $son), 0, 40), 'karisik' => implode('', $h)];
        bot($db, $ch, '🔤 Tur ' . $o['tur'] . ': ' . aralikli(implode('', $h)) . ' (' . count($h) . ' harf). Harfleri dizip kelimeyi ilk bulan kazanır!');
    } elseif ($ch === 'gizli') {
        $w = sec(sik_kelimeler(5, 5, 3000), $son); if ($w === null) { $o['durum'] = 'bekle'; return; }
        $o['cevap'] = $w; $o['veri'] = ['son' => array_slice(array_merge([$w], $son), 0, 40), 'hak' => []];
        bot($db, $ch, '🟦 Tur ' . $o['tur'] . ': 5 harfli bir kelime tuttum. Tahminini tek kelime olarak yaz; herkesin 6 hakkı var. 🟦 doğru yerde, 🟧 kelimede var ama başka yerde, ⬜ yok.');
    } elseif ($ch === 'yarisma') {
        $Q = sorular(); if (!$Q) { $o['durum'] = 'bekle'; return; }
        $i = 0; for ($try = 0; $try < 30; $try++) { $i = random_int(0, count($Q) - 1); if (!in_array($i, $son, true)) break; }
        $o['cevap'] = json_encode($Q[$i]['c'], JSON_UNESCAPED_UNICODE);
        $o['veri'] = ['son' => array_slice(array_merge([$i], $son), 0, min(80, (int)floor(count($Q) * 0.7))), 'soru' => $Q[$i]['s']];
        bot($db, $ch, '❓ Soru ' . $o['tur'] . ': ' . $Q[$i]['s']);
    }
}
function ipucu_maske(string $w, int $acik): string {
    $h = harfler(tr_up($w)); $out = [];
    foreach ($h as $i => $c) $out[] = ($c === ' ') ? ' ' : ($i < $acik ? $c : '_');
    return implode(' ', $out);
}
// yoklama sırasında: süresi dolan ipucu, cevap açıklama ya da yeni tur
function oyun_tik(PDO $db, string $ch): void {
    if (!isset(OYUNLAR[$ch]) || $ch === 'zincir') return;
    $now = time();
    $o = q($db, 'SELECT durum, basla, sonraki, ipucu FROM sh_oyun WHERE ch = ?', [$ch])->fetch();
    // kilitsiz ön kontrol: yapılacak iş yoksa veritabanına yazmadan çık
    if (!$o || $o['durum'] === 'bekle') return;                                   // bekleyen oyunu yalnızca insan mesajı başlatır
    if ($o['durum'] === 'ara' && $o['sonraki'] && (int)ts($o['sonraki']) > $now) return;
    if ($o['durum'] === 'aktif') {
        $esik = $ch === 'gizli' ? 300 : [20, 40, 60][min(2, (int)$o['ipucu'])];   // sıradaki ipucu ya da süre sonu
        if ($now - (int)ts($o['basla']) < $esik) return;
    }
    $o = oyun_kilit($db, $ch);
    try {
        if ($o['durum'] === 'aktif') oyun_adim($db, $o, $now);
        elseif ($o['durum'] === 'ara' || $o['durum'] === '') {
            if ($o['sonraki'] && (int)ts($o['sonraki']) > $now) { oyun_birak($db); return; }
            if (son_insan($db, $ch) < $now - OYUN_BOS_SN) {
                $o['durum'] = 'bekle'; $o['sonraki'] = null;
                bot($db, $ch, '💤 Kanal sessiz, oyunu durdurdum. Yeni tur için bir şey yazman yeter.');
            } else yeni_tur($db, $o);
        }
        oyun_kaydet($db, $o);
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}
function oyun_adim(PDO $db, array &$o, int $now): void {
    $ch = $o['ch']; $gec = $now - (int)ts($o['basla']);
    if ($ch === 'gizli') {
        if ($gec >= 300) { bot($db, $ch, '⏰ Süre doldu. Kelime: ' . tr_up($o['cevap']) . '. Yeni tur geliyor…'); tur_bitti($o, $now); }
        return;
    }
    $cevap = $ch === 'yarisma' ? (json_decode((string)$o['cevap'], true)[0] ?? '') : (string)$o['cevap'];
    if ($gec >= 60) {
        bot($db, $ch, '⏰ Süre doldu. ' . ($ch === 'avi' ? 'Kelime: ' : 'Cevap: ') . ($ch === 'avi' ? tr_up($cevap) : $cevap) . '. Yeni tur geliyor…');
        tur_bitti($o, $now);
    } elseif ($gec >= 40 && (int)$o['ipucu'] < 2) {
        $o['ipucu'] = 2; bot($db, $ch, '💡 İpucu: ' . ipucu_maske($cevap, $ch === 'avi' ? max(2, intdiv(mb_strlen($cevap), 2)) : 2));
    } elseif ($gec >= 20 && (int)$o['ipucu'] < 1) {
        $o['ipucu'] = 1; bot($db, $ch, '💡 İpucu: ' . ipucu_maske($cevap, 1) . ($ch === 'yarisma' ? ' (' . mb_strlen(str_replace(' ', '', $cevap)) . ' harf)' : ''));
    }
}
function tur_bitti(array &$o, int $now): void { $o['durum'] = 'ara'; $o['sonraki'] = gmdate('Y-m-d H:i:s', $now + OYUN_ARA_SN); }

// ---------- mesaj geldiğinde: cevap, tahmin, zincir ----------
function oyun_mesaj(PDO $db, string $ch, array $u, string $text): void {
    if (!isset(OYUNLAR[$ch])) return;
    if ($ch === 'zincir') { zincir_mesaj($db, $u, $text); return; }
    $now = time();
    $o = oyun_kilit($db, $ch);
    try {
        if ($o['durum'] !== 'aktif') {
            // bekleyen ya da arası dolmuş oyunu insan mesajı başlatır
            if ($o['durum'] === 'bekle' || !$o['sonraki'] || (int)ts($o['sonraki']) <= $now) {
                yeni_tur($db, $o);
                // gizli kelimede turu başlatan 5 harfli kelime ilk tahmin sayılır
                if ($ch === 'gizli' && $o['durum'] === 'aktif') gizli_tahmin($db, $o, $u, $text, $now);
            }
            oyun_kaydet($db, $o); return;
        }
        if ($ch === 'avi') avi_cevap($db, $o, $u, $text, $now);
        elseif ($ch === 'yarisma') yarisma_cevap($db, $o, $u, $text, $now);
        elseif ($ch === 'gizli') gizli_tahmin($db, $o, $u, $text, $now);
        oyun_kaydet($db, $o);
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}
function harf_sirali(string $w): string { $h = harfler(katla($w)); sort($h); return implode('', $h); }
function avi_cevap(PDO $db, array &$o, array $u, string $text, int $now): void {
    $w = tek_kelime($text); if ($w === null) return;
    $c = (string)$o['cevap'];
    // tutulan kelime ya da aynı harflerle kurulan başka bir sözlük kelimesi kabul
    $dogru = katla($w) === katla($c) || (harf_sirali($w) === harf_sirali($c) && sozlukte($w) !== null);
    if (!$dogru) return;
    $p = max(1, mb_strlen($c) - 2 * (int)$o['ipucu']);
    $top = puan_ekle($db, $u, 'avi', $p);
    $ek = katla($w) !== katla($c) ? ' (tuttuğum: ' . tr_up($c) . ')' : '';
    bot($db, 'avi', '🎉 ' . $u['nick'] . ' buldu: ' . tr_up(sozlukte($w) ?? $w) . $ek . '. +' . $p . ' puan, bu hafta ' . $top . '.');
    tur_bitti($o, $now);
}
function yarisma_cevap(PDO $db, array &$o, array $u, string $text, int $now): void {
    $n = cevap_norm($text); if ($n === '') return;
    $cevaplar = json_decode((string)$o['cevap'], true) ?: [];
    foreach ($cevaplar as $c) if (cevap_norm((string)$c) === $n) {
        $p = max(1, 3 - (int)$o['ipucu']);
        $top = puan_ekle($db, $u, 'yarisma', $p);
        bot($db, 'yarisma', '🎉 ' . $u['nick'] . ' bildi: ' . $cevaplar[0] . '. +' . $p . ' puan, bu hafta ' . $top . '.');
        tur_bitti($o, $now);
        return;
    }
}
// Wordle renkleri: önce doğru yerdekiler, kalan harf sayısıyla başka yerdekiler (aynı harf iki kez geçebilir)
function renkle(string $tahmin, string $cevap): array {
    $t = harfler($tahmin); $c = harfler($cevap); $r = array_fill(0, count($c), '⬜'); $kalan = [];
    foreach ($c as $i => $h) if (($t[$i] ?? '') === $h) $r[$i] = '🟦'; else $kalan[$h] = ($kalan[$h] ?? 0) + 1;
    foreach ($t as $i => $h) if ($r[$i] !== '🟦' && !empty($kalan[$h])) { $r[$i] = '🟧'; $kalan[$h]--; }
    return $r;
}
function gizli_tahmin(PDO $db, array &$o, array $u, string $text, int $now): void {
    $w = tek_kelime($text); if ($w === null || mb_strlen($w) !== 5) return;
    $s = sozlukte($w);
    if ($s === null) { bot($db, 'gizli', '✗ ' . $u['nick'] . ': ' . tr_up($w) . ' sözlükte yok.'); return; }
    $uid = (string)$u['id']; $n = (int)($o['veri']['hak'][$uid] ?? 0);
    if ($n >= 6) { bot($db, 'gizli', $u['nick'] . ', bu turdaki 6 hakkını kullandın; başkaları bulana ya da süre dolana kadar izle.'); return; }
    $o['veri']['hak'][$uid] = ++$n;
    $r = renkle($s, (string)$o['cevap']);
    if ($s === $o['cevap']) {
        $p = 7 - $n;
        $top = puan_ekle($db, $u, 'gizli', $p);
        bot($db, 'gizli', '🎉 ' . $u['nick'] . ' buldu: ' . aralikli($s) . ' ' . implode('', $r) . ' (' . $n . '. tahmin). +' . $p . ' puan, bu hafta ' . $top . '.');
        tur_bitti($o, $now);
    } else bot($db, 'gizli', $u['nick'] . ' (' . $n . '/6): ' . aralikli($s) . ' ' . implode('', $r));
}
// zincir: sıradaki kelime öncekinin son harfiyle başlar (ğ ile biten kelimede bir önceki harf)
function zincir_harf(string $w): string { $h = harfler($w); $s = array_pop($h); if ($s === 'ğ' && $h) $s = array_pop($h); return $s; }
function zincir_mesaj(PDO $db, array $u, string $text): void {
    $now = time();
    $o = oyun_kilit($db, 'zincir');
    try {
        $v = $o['veri'];
        $sessiz = !$o['basla'] || (int)ts($o['basla']) < $now - ZINCIR_BOS_SN || empty($v['son']);
        if ($sessiz) {
            // başlangıç kelimesi ı ya da ğ ile bitmesin (ı ile başlayan kelime az, zincir zor başlar)
            $w = sec(array_values(array_filter(sik_kelimeler(4, 7), fn($x) => !in_array(mb_substr($x, -1), ['ı', 'ğ'], true))), $v['kullanilan'] ?? []);
            if ($w === null) { oyun_birak($db); return; }
            $o['tur'] = (int)$o['tur'] + 1; $o['durum'] = 'aktif'; $o['basla'] = now();
            $o['veri'] = ['son' => $w, 'kullanilan' => [$w], 'uzunluk' => 1, 'kim' => 0];
            bot($db, 'zincir', '🔗 Yeni zincir: ' . tr_up($w) . ' → sıradaki kelime ' . tr_up(zincir_harf($w)) . ' ile başlamalı.');
            oyun_kaydet($db, $o); return;
        }
        $w = tek_kelime($text);
        if ($w === null) { oyun_birak($db); return; } // tek kelime değilse sohbet
        $o['basla'] = now(); // zincir canlı
        $harf = zincir_harf((string)$v['son']);
        $s = sozlukte($w);
        if ($s === null) bot($db, 'zincir', '✗ ' . tr_up($w) . ' sözlükte yok.');
        elseif (harfler($s)[0] !== $harf) bot($db, 'zincir', '✗ ' . tr_up($s) . ' olmaz: ' . tr_up($harf) . ' ile başlamalı.');
        elseif (in_array($s, $v['kullanilan'] ?? [], true)) bot($db, 'zincir', '✗ ' . tr_up($s) . ' bu zincirde söylendi.');
        else {
            $ayni = (int)($v['kim'] ?? 0) === (int)$u['id'];
            $p = $ayni ? 0 : (mb_strlen($s) >= 7 ? 2 : 1);
            $v['son'] = $s; $v['kullanilan'] = array_slice(array_merge($v['kullanilan'] ?? [], [$s]), -400); $v['uzunluk'] = (int)($v['uzunluk'] ?? 0) + 1; $v['kim'] = (int)$u['id'];
            $top = $p ? puan_ekle($db, $u, 'zincir', $p) : null;
            bot($db, 'zincir', '✓ ' . $u['nick'] . ': ' . tr_up($s) . ($p ? ' (+' . $p . ', bu hafta ' . $top . ')' : ' (üst üste puan yok)') . ' → ' . tr_up(zincir_harf($s)) . ' · zincir ' . $v['uzunluk']);
            $o['veri'] = $v;
        }
        oyun_kaydet($db, $o);
    } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}

// ---------- eğlence komutları: herkes görür, sunucu üretir (taklit edilemez) ----------
function eglence(PDO $db, string $ch, array $u, string $tur, $arg): string {
    if ($tur === 'zar') {
        $n = max(1, min(5, (int)($arg ?: 2)));
        $yuz = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']; $z = []; for ($i = 0; $i < $n; $i++) $z[] = random_int(1, 6);
        $t = '🎲 ' . $u['nick'] . ' zar attı: ' . implode(' ', array_map(fn($x) => $yuz[$x] . ' ' . $x, $z)) . ($n > 1 ? ' (toplam ' . array_sum($z) . ')' : '');
        $bot = 'Zar';
    } elseif ($tur === 'yazitura') {
        $t = '🪙 ' . $u['nick'] . ' yazı-tura attı: ' . (random_int(0, 1) ? 'YAZI' : 'TURA'); $bot = 'Zar';
    } elseif ($tur === 'sayi') {
        $a = 1; $b = 100;
        if (is_string($arg) && preg_match('/^(\d{1,6})\s*[-–]\s*(\d{1,6})$/', trim($arg), $m)) { $a = (int)$m[1]; $b = (int)$m[2]; if ($a > $b) [$a, $b] = [$b, $a]; }
        elseif (is_string($arg) && preg_match('/^\d{1,6}$/', trim($arg))) $b = max(1, (int)$arg);
        $t = '🔢 ' . $u['nick'] . ' ' . $a . '–' . $b . ' arasında sayı çekti: ' . random_int($a, $b); $bot = 'Zar';
    } else fail('bad_cmd');
    return (string)sys_msg($db, $ch, $t, ['id' => 0, 'nick' => $bot, 'op' => 0], 'b');
}
// puan tablosu: oyun kanalında o oyunun, başka yerde dört oyunun haftalık ilk 10'u
function puan_tablosu(PDO $db, array $u, string $ch): array {
    $oyunlar = isset(OYUNLAR[$ch]) ? [$ch] : array_keys(OYUNLAR);
    $out = [];
    foreach ($oyunlar as $g) {
        $out[] = ['oyun' => $g, 'ad' => OYUNLAR[$g]['ad'],
            'hafta' => array_map(fn($r) => ['nick' => $r['nick'], 'puan' => (int)$r['puan']], q($db, 'SELECT nick, puan FROM sh_puan WHERE oyun = ? AND hafta = ? ORDER BY puan DESC, nick LIMIT 10', [$g, hafta()])->fetchAll()),
            'ben' => (int)q($db, 'SELECT puan FROM sh_puan WHERE oyun = ? AND hafta = ? AND user_id = ?', [$g, hafta(), $u['id']])->fetchColumn(),
            'toplam' => (int)q($db, 'SELECT COALESCE(SUM(puan), 0) FROM sh_puan WHERE oyun = ? AND user_id = ?', [$g, $u['id']])->fetchColumn()];
    }
    return $out;
}
