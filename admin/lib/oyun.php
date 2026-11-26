<?php
// Yönetim paneli — oyun istatistikleri: oyunların kendi tabloları (UTC saat tutarlar!), sayaç olayları (basla_/bitir_/masa_/katil_),
// sohbet hacmi ve Kelime Bulucu aramaları (kelime-bulucu/veri/arama/GG.json, UTC gün).
declare(strict_types=1);

/** anahtar => [ad, sayfa yolu, tablo öneki|null]. Anahtar, oyunlar.js'teki olay adlarıyla aynı (basla_<anahtar>). */
const GAMES = [
    'okey' => ['Okey', '/okey/', 'oy_'],
    'okey101' => ['101 Okey', '/101-okey/', 'ok_'],
    'batak' => ['Batak', '/batak/', 'bt_'],
    'king' => ['King', '/king/', 'kg_'],
    'pisti' => ['Pişti', '/pisti/', 'ps_'],
    'tavla' => ['Tavla', '/tavla/', 'tv_'],
    'atesvesu' => ['Ateş ve Su', '/ates-ve-su/', 'kd_'],
    'balon' => ['Balon Patlat', '/balon/', 'bp_'],
    'sudoku' => ['Sudoku', '/sudoku/', null],
    'gizlikelime' => ['Gizli Kelime', '/gizli-kelime/', null],
];

function db_tables(): array
{
    static $t = null;
    if ($t === null) $t = array_flip(array_column(rows('SELECT TABLE_NAME n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'), 'n'));
    return $t;
}
function utc_ago(int $sec): string { return gmdate('Y-m-d H:i:s', time() - $sec); }

/** Oyun başına sunucu kayıtları: biten oyun (sıralamaya giden), açılan masa, şu an oynanan masa. */
function game_server_stats(int $days): array
{
    $t = db_tables();
    $since = utc_ago($days * 86400);
    $out = [];
    foreach (GAMES as $k => [$name, $path, $pfx]) {
        $r = ['oyun' => null, 'masa' => null, 'aktif' => null];
        if ($pfx === 'bp_') {
            if (isset($t['bp_scores'])) $r['oyun'] = (int)val('SELECT COUNT(*) FROM bp_scores WHERE created_at >= ?', [$since]);
            if (isset($t['bp_sessions'])) $r['aktif'] = (int)val('SELECT COUNT(*) FROM bp_sessions WHERE used = 0 AND last_seen >= ?', [utc_ago(120)]);
        } elseif ($pfx) {
            if (isset($t[$pfx . 'games'])) $r['oyun'] = (int)val("SELECT COUNT(*) FROM {$pfx}games WHERE created_at >= ?", [$since]);
            if (isset($t[$pfx . 'tables'])) {
                $r['masa'] = (int)val("SELECT COUNT(*) FROM {$pfx}tables WHERE created_at >= ?", [$since]);
                $r['aktif'] = (int)val("SELECT COUNT(*) FROM {$pfx}tables WHERE status <> 'lobby' AND updated_at >= ?", [utc_ago(300)]);
            }
        }
        $out[$k] = $r;
    }
    return $out;
}
/** Sayaç tarafı: sayfa görüntüleme (yol ön ekiyle) ve olay tekilleri. Günler Europe/Istanbul. */
function game_event_stats(string $from, string $to): array
{
    $out = [];
    foreach (GAMES as $k => [$name, $path]) {
        $pv = (int)val("SELECT COALESCE(SUM(n),0) FROM stats_dim WHERE dim = 'page' AND day BETWEEN ? AND ? AND val LIKE ?", [$from, $to, $path . '%']);
        $ev = [];
        foreach (['basla', 'bitir', 'masa', 'katil'] as $e) { [$n, $u] = st_sum('ev_' . $e . '_' . $k, $from, $to); $ev[$e] = [$n, $u]; }
        $out[$k] = ['pv' => $pv, 'ev' => $ev];
    }
    return $out;
}
/** Son 7 günde en çok oyun bitiren isimler (bütün oyun tabloları). */
function top_players(int $days, int $limit = 15): array
{
    $t = db_tables();
    $since = utc_ago($days * 86400);
    $agg = [];
    foreach (GAMES as $k => [$name, , $pfx]) {
        $tbl = $pfx === 'bp_' ? 'bp_scores' : ($pfx ? $pfx . 'games' : null);
        if (!$tbl || !isset($t[$tbl])) continue;
        foreach (rows("SELECT name, COUNT(*) n FROM {$tbl} WHERE created_at >= ? GROUP BY name ORDER BY n DESC LIMIT 50", [$since]) as $r) {
            $key = mb_strtolower($r['name']);
            $agg[$key]['name'] = $r['name'];
            $agg[$key]['n'] = ($agg[$key]['n'] ?? 0) + (int)$r['n'];
            $agg[$key]['g'][$name] = ($agg[$key]['g'][$name] ?? 0) + (int)$r['n'];
        }
    }
    uasort($agg, fn($a, $b) => $b['n'] <=> $a['n']);
    return array_slice(array_values($agg), 0, $limit);
}
function chat_stats(int $days): ?array
{
    $t = db_tables();
    if (!isset($t['sh_msgs'])) return null;
    $since = utc_ago($days * 86400);
    return [
        'mesaj' => (int)val("SELECT COUNT(*) FROM sh_msgs WHERE kind = 'm' AND created_at >= ?", [$since]),
        'yazan' => (int)val("SELECT COUNT(DISTINCT user_id) FROM sh_msgs WHERE kind = 'm' AND created_at >= ?", [$since]),
        'simdi' => isset($t['sh_presence']) ? (int)val('SELECT COUNT(*) FROM sh_presence WHERE seen >= ?', [utc_ago(120)]) : null,
        'sikayet' => isset($t['sh_reports']) ? (int)val('SELECT COUNT(*) FROM sh_reports WHERE created_at >= ?', [$since]) : null,
        'kanal' => rows("SELECT ch, COUNT(*) n FROM sh_msgs WHERE kind = 'm' AND created_at >= ? AND ch NOT LIKE 'p%' GROUP BY ch ORDER BY n DESC LIMIT 10", [$since]),
    ];
}

/** Kelime Bulucu aramaları: tür => [[sorgu, sayı]...]. h: harflerden, k: kalıp, w: Wordle, g: geçerli mi (var), x: geçerli mi (sözlükte yok). */
function word_searches(int $days): array
{
    $dir = SITE_ROOT . '/kelime-bulucu/veri/arama';
    $sum = [];
    for ($i = 0; $i < $days; $i++) {
        $f = $dir . '/' . gmdate('Y-m-d', time() - $i * 86400) . '.json';
        if (!is_file($f)) continue;
        $d = json_decode((string)file_get_contents($f), true);
        if (!is_array($d)) continue;
        foreach ($d as $k => $n) { [$t, $q] = array_pad(explode(':', (string)$k, 2), 2, ''); $sum[$t][$q] = ($sum[$t][$q] ?? 0) + (int)$n; }
    }
    $out = [];
    foreach ($sum as $t => $list) { arsort($list); $out[$t] = array_slice($list, 0, 30, true); }
    return $out;
}
function game_name_of(string $key): string { return GAMES[$key][0] ?? ($key === 'sohbet' ? 'Canlı Sohbet' : $key); }
