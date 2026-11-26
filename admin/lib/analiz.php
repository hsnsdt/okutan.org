<?php
// Yönetim paneli — ileri analiz: yolculuk (giriş, geçiş, çıkış), saat ısı haritası, hız (Web Vitals p75), JS hataları,
// ülke ızgara haritası, karşılaştırmalı çizgi grafik, CSV, eski verinin aylığa toplanması, aylık rapor, masaüstü uyarı sayaçları.
declare(strict_types=1);

// ---------------- Yolculuk ----------------
/** Sayfa grubu başına görüntüleme (Kelime Bulucu alt sayfaları tek satır). */
function page_groups(string $from, string $to): array
{
    $g = [];
    foreach (rows("SELECT val, SUM(n) n FROM stats_dim WHERE dim = 'page' AND day BETWEEN ? AND ? GROUP BY val", [$from, $to]) as $r) {
        $k = path_group($r['val']);
        $g[$k] = ($g[$k] ?? 0) + (int)$r['n'];
    }
    arsort($g);
    return $g;
}
/** [giriş sayfaları, geçişler (önceki → sonraki), çıkış oranı (sayfadan başka sayfaya geçilmeyen görüntüleme payı)]. */
function journey(string $from, string $to): array
{
    $entry = array_column(rows("SELECT val, SUM(n) n FROM stats_dim WHERE dim = 'entry' AND day BETWEEN ? AND ? GROUP BY val ORDER BY n DESC LIMIT 20", [$from, $to]), 'n', 'val');
    $flows = rows("SELECT val, SUM(n) n FROM stats_dim WHERE dim = 'flow' AND day BETWEEN ? AND ? GROUP BY val ORDER BY n DESC LIMIT 300", [$from, $to]);
    $out = [];
    foreach ($flows as $f) { [$a] = explode(' → ', $f['val'], 2); $out[$a] = ($out[$a] ?? 0) + (int)$f['n']; }
    $exit = [];
    foreach (array_slice(page_groups($from, $to), 0, 25, true) as $pg => $pv) {
        $exit[$pg] = ['pv' => $pv, 'devam' => min($pv, $out[$pg] ?? 0), 'cikis' => $pv > 0 ? max(0, $pv - ($out[$pg] ?? 0)) / $pv : 0];
    }
    return ['entry' => $entry, 'flows' => array_slice($flows, 0, 25), 'exit' => $exit];
}

// ---------------- Saat ısı haritası ----------------
/** [haftanın günü 1..7][saat 0..23] => ortalama görüntüleme. */
function hour_heat(int $days): array
{
    $from = day_add(today(), -($days - 1));
    $m = []; $cnt = [];
    for ($d = $from; $d <= today(); $d = day_add($d, 1)) { $w = (int)date('N', strtotime($d)); $cnt[$w] = ($cnt[$w] ?? 0) + 1; }
    foreach (rows('SELECT day, hour, n FROM stats_hour WHERE day >= ?', [$from]) as $r) {
        $w = (int)date('N', strtotime($r['day']));
        $m[$w][(int)$r['hour']] = ($m[$w][(int)$r['hour']] ?? 0) + (int)$r['n'];
    }
    foreach ($m as $w => $hs) foreach ($hs as $h => $n) $m[$w][$h] = $n / max(1, $cnt[$w] ?? 1);
    return $m;
}
function heat_html(array $m): string
{
    $max = 0;
    foreach ($m as $hs) foreach ($hs as $v) $max = max($max, $v);
    if ($max <= 0) return '<p class="muted">Henüz saatlik veri yok (yeni eklendi).</p>';
    $gun = [1 => 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    $s = '<div class="heat" role="img" aria-label="Haftanın günü ve saate göre ortalama görüntüleme"><div class="hh"></div>';
    for ($h = 0; $h < 24; $h++) $s .= '<div class="hh">' . ($h % 3 === 0 ? sprintf('%02d', $h) : '') . '</div>';
    foreach ($gun as $w => $ad) {
        $s .= '<div class="hd">' . $ad . '</div>';
        for ($h = 0; $h < 24; $h++) {
            $v = $m[$w][$h] ?? 0;
            $a = $v > 0 ? 0.12 + 0.88 * ($v / $max) : 0;
            $s .= '<div class="hc" style="--a:' . round($a, 2) . '" data-t="' . $ad . ' ' . sprintf('%02d:00', $h) . ': ort. ' . nf($v, $v < 10 ? 1 : 0) . ' görüntüleme"></div>';
        }
    }
    return $s . '</div><div class="leg">Koyu = daha yoğun · en yoğun saat ort. ' . nf($max, 1) . ' görüntüleme</div>';
}

// ---------------- Hız (Web Vitals) ----------------
function vital_p75(array $bins, string $m): ?float
{
    $tot = array_sum($bins);
    if ($tot <= 0) return null;
    ksort($bins);
    $need = 0.75 * $tot; $acc = 0;
    foreach ($bins as $b => $n) { $acc += $n; if ($acc >= $need) return ($b + 1) * VITAL_STEP[$m]; }
    return (max(array_keys($bins)) + 1) * VITAL_STEP[$m];
}
function vital_rate(?float $v, string $m): string
{
    if ($v === null) return '';
    [$good, $ni] = VITAL_LIMIT[$m];
    return $v <= $good ? 'ok' : ($v <= $ni ? 'warn' : 'bad');
}
function vital_fmt(?float $v, string $m): string
{
    if ($v === null) return '—';
    if ($m === 'cls') return nf($v, 2);
    return $v >= 1000 ? nf($v / 1000, 1) . ' sn' : nf($v) . ' ms';
}
/** Sayfa grubu ve cihaza göre p75 + ölçüm sayısı. $dev boşsa hepsi. */
function vitals(int $days, string $dev = ''): array
{
    $from = day_add(today(), -($days - 1));
    $sql = 'SELECT pg, metric, bin, SUM(n) n FROM stats_vital WHERE day >= ?' . ($dev !== '' ? ' AND dev = ?' : '') . ' GROUP BY pg, metric, bin';
    $b = [];
    foreach (rows($sql, $dev !== '' ? [$from, $dev] : [$from]) as $r) $b[$r['pg']][$r['metric']][(int)$r['bin']] = (int)$r['n'];
    $out = []; $all = [];
    foreach ($b as $pg => $ms) {
        foreach ($ms as $m => $bins) {
            $out[$pg][$m] = ['p75' => vital_p75($bins, $m), 'n' => array_sum($bins)];
            foreach ($bins as $k => $n) $all[$m][$k] = ($all[$m][$k] ?? 0) + $n;
        }
    }
    uasort($out, fn($x, $y) => (($y['lcp']['n'] ?? 0) <=> ($x['lcp']['n'] ?? 0)));
    $tot = [];
    foreach (VITAL_STEP as $m => $_) $tot[$m] = ['p75' => isset($all[$m]) ? vital_p75($all[$m], $m) : null, 'n' => array_sum($all[$m] ?? [])];
    return ['pages' => $out, 'total' => $tot];
}

// ---------------- JS hataları ----------------
function js_errors(int $limit = 100): array
{
    return rows('SELECT msg, src, line, col, n, first_seen, last_seen, last_path, last_br, last_os, last_dev FROM stats_jserr ORDER BY last_seen DESC LIMIT ' . (int)$limit);
}

// ---------------- Ülke ızgara haritası ----------------
/** Kabaca coğrafi yerleşimli kare ızgara (sütun, satır). Harita verisi indirmeden, her ülke bir kare. */
const CC_GRID = [
    'CA' => [1, 1], 'US' => [1, 2],
    'IE' => [7, 1], 'GB' => [8, 1], 'NO' => [10, 0], 'SE' => [11, 0], 'FI' => [12, 0],
    'PT' => [7, 3], 'ES' => [8, 3], 'FR' => [8, 2], 'BE' => [9, 1], 'NL' => [10, 1], 'DK' => [11, 1], 'LU' => [9, 2], 'DE' => [10, 2], 'PL' => [12, 2], 'BY' => [13, 1], 'RU' => [14, 1],
    'CH' => [9, 3], 'AT' => [10, 3], 'CZ' => [11, 2], 'HU' => [12, 3], 'UA' => [13, 2], 'MD' => [14, 3],
    'IT' => [10, 4], 'BA' => [11, 4], 'RS' => [12, 4], 'RO' => [13, 3], 'BG' => [13, 4], 'AL' => [11, 5], 'MK' => [12, 5], 'GR' => [12, 6],
    'TR' => [14, 5], 'GE' => [15, 4], 'AM' => [15, 5], 'AZ' => [16, 5], 'KZ' => [17, 3], 'UZ' => [17, 4], 'KG' => [18, 4], 'TM' => [17, 5],
    'CY' => [13, 7], 'SY' => [14, 6], 'IQ' => [15, 6], 'IR' => [16, 6], 'LB' => [13, 8], 'IL' => [13, 9], 'JO' => [14, 8], 'KW' => [15, 7], 'SA' => [15, 8], 'QA' => [16, 8], 'AE' => [17, 8], 'PK' => [18, 6], 'IN' => [19, 7],
    'MA' => [8, 6], 'DZ' => [9, 7], 'TN' => [10, 6], 'EG' => [12, 8],
    'CN' => [20, 5], 'KR' => [21, 5], 'JP' => [22, 5], 'AU' => [21, 9],
];
function country_grid(array $counts): string
{
    $max = max(1, $counts ? max($counts) : 1);
    $cell = 26; $gap = 3; $W = 23 * ($cell + $gap); $H = 10 * ($cell + $gap);
    $s = '<svg class="cgrid" viewBox="0 0 ' . $W . ' ' . $H . '" role="img" aria-label="Ülkelere göre ziyaret (ızgara harita)">';
    foreach (CC_GRID as $cc => [$c, $r]) {
        $n = (int)($counts[$cc] ?? 0);
        $a = $n > 0 ? 0.2 + 0.8 * ($n / $max) : 0;
        $x = $c * ($cell + $gap); $y = $r * ($cell + $gap);
        $s .= '<g data-t="' . h(country_tr($cc)) . ': ' . nf($n) . '"><rect x="' . $x . '" y="' . $y . '" width="' . $cell . '" height="' . $cell . '" rx="6" class="' . ($n ? 'on' : 'off') . '" style="--a:' . round($a, 2) . '"/>'
            . '<text x="' . ($x + $cell / 2) . '" y="' . ($y + $cell / 2 + 4) . '" text-anchor="middle"' . ($a > 0.55 ? ' class="hi"' : '') . '>' . $cc . '</text></g>';
    }
    $other = array_diff_key($counts, CC_GRID);
    unset($other['XX'], $other['']);
    $s .= '</svg>';
    if ($other) $s .= '<p class="muted small">Haritada olmayan: ' . h(implode(', ', array_map(fn($k, $v) => country_tr((string)$k) . ' ' . nf($v), array_keys($other), $other))) . '</p>';
    if (!empty($counts['XX'])) $s .= '<p class="muted small">Ülkesi bilinmeyen: ' . nf($counts['XX']) . '</p>';
    return $s;
}

// ---------------- Karşılaştırmalı çizgi ----------------
/** İki seri (aynı uzunlukta): şimdiki (dolu çizgi) ve önceki dönem (kesik çizgi). $labels x ekseni için. */
function line_compare(array $cur, array $prev, array $labels, string $l1, string $l2): string
{
    $cur = array_values($cur); $prev = array_values($prev); $n = max(count($cur), count($prev));
    if ($n < 2) return '<p class="muted">Veri yok.</p>';
    $max = max(1, max(array_merge($cur, $prev)));
    $W = 600; $H = 160;
    $pts = function (array $v) use ($n, $max, $W, $H) { $o = []; foreach ($v as $i => $x) $o[] = round($i / ($n - 1) * $W, 1) . ',' . round($H - 4 - $x / $max * ($H - 10), 1); return implode(' ', $o); };
    $s = '<svg class="chart line" viewBox="0 0 ' . $W . ' ' . $H . '" preserveAspectRatio="none" role="img" aria-label="' . h($l1) . ' ve ' . h($l2) . '">';
    foreach ([0.25, 0.5, 0.75] as $f) { $gy = round($H - 4 - $f * ($H - 10), 1); $s .= '<line x1="0" y1="' . $gy . '" x2="' . $W . '" y2="' . $gy . '" class="gl"/>'; }
    $s .= '<polyline points="' . $pts($prev) . '" class="lp"/><polyline points="' . $pts($cur) . '" class="lc"/>';
    for ($i = 0; $i < $n; $i++) {
        $x = $i / ($n - 1) * $W; $w = $W / ($n - 1);
        $s .= '<g data-t="' . h(($labels[$i] ?? '') . ': ' . $l1 . ' ' . nf($cur[$i] ?? 0) . ' · ' . $l2 . ' ' . nf($prev[$i] ?? 0)) . '"><rect x="' . round(max(0, $x - $w / 2), 1) . '" y="0" width="' . round($w, 1) . '" height="' . $H . '" fill="transparent"/></g>';
    }
    $s .= '</svg><div class="xl"><span>' . h($labels[0] ?? '') . '</span><span>' . h($labels[$n - 1] ?? '') . '</span></div>';
    return $s . '<div class="leg"><span class="k2"></span>' . h($l1) . ' <span class="kd"></span>' . h($l2) . '</div>';
}

// ---------------- CSV ----------------
function csv_send(string $name, array $head, array $rows): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . preg_replace('~[^a-z0-9._-]~i', '-', $name) . '"');
    $o = fopen('php://output', 'w');
    fwrite($o, "\xEF\xBB\xBF"); // Excel Türkçe karakterleri doğru açsın
    fputcsv($o, $head, ';');
    foreach ($rows as $r) fputcsv($o, array_values($r), ';');
    fclose($o);
    exit;
}

// ---------------- Saklama: eski günlük veriyi aylığa topla ----------------
/** 400 günden eski stats_dim satırları stats_dim_month'a toplanıp silinir; eski saat/hız satırları silinir. Dönüş: taşınan satır. */
function stats_compact(): int
{
    $cut = day_add(today(), -400);
    $moved = (int)val('SELECT COUNT(*) FROM stats_dim WHERE day < ?', [$cut]);
    if ($moved > 0) {
        q("INSERT INTO stats_dim_month (month, dim, val, n) SELECT DATE_FORMAT(day, '%Y-%m'), dim, val, SUM(n) FROM stats_dim WHERE day < ? GROUP BY DATE_FORMAT(day, '%Y-%m'), dim, val
           ON DUPLICATE KEY UPDATE n = n + VALUES(n)", [$cut]);
        q('DELETE FROM stats_dim WHERE day < ?', [$cut]);
    }
    q('DELETE FROM stats_hour WHERE day < ?', [$cut]);
    q('DELETE FROM stats_vital WHERE day < ?', [$cut]);
    q('DELETE FROM stats_jserr WHERE last_seen < ?', [date('Y-m-d H:i:s', time() - 180 * 86400)]);
    return $moved;
}

// ---------------- Aylık rapor ----------------
function monthly_report(): string
{
    $first = date('Y-m-01', strtotime(date('Y-m-01') . ' -1 month'));
    $last = date('Y-m-t', strtotime($first));
    $pfirst = date('Y-m-01', strtotime($first . ' -1 month')); $plast = date('Y-m-t', strtotime($pfirst));
    $pct = function ($c, $p) { if ($p <= 0) return $c > 0 ? ' (yeni)' : ''; $x = ($c - $p) / $p * 100; return ' (' . ($x >= 0 ? '▲' : '▼') . ' %' . nf(abs($x)) . ')'; };
    [$pv, $u] = st_sum('pv', $first, $last); [$ppv, $pu] = st_sum('pv', $pfirst, $plast);
    $ay = lbl_month(substr($first, 0, 7));
    $L = ['okutan.org aylık rapor · ' . $ay, '', 'Ziyaret', '• Görüntüleme: ' . nf($pv) . $pct($pv, $ppv), '• Tekil ziyaretçi (günlük toplam): ' . nf($u) . $pct($u, $pu)];
    $top = st_dim('page', $first, $last, 5);
    if ($top) $L[] = '• En çok: ' . implode(', ', array_map(fn($r) => $r['val'] . ' (' . nf($r['n']) . ')', $top));
    $cc = st_dim('cc', $first, $last, 3);
    if ($cc) $L[] = '• Ülke: ' . implode(', ', array_map(fn($r) => country_tr($r['val'] === 'XX' ? '' : $r['val']) . ' ' . nf($r['n']), $cc));
    $L[] = '';
    $L[] = 'Oyunlar (başlayan tekil ziyaretçi)';
    $g = [];
    foreach (GAMES as $k => [$name]) { [, $s] = st_sum('ev_basla_' . $k, $first, $last); if ($s) $g[$name] = $s; }
    arsort($g);
    $L[] = $g ? '• ' . implode(', ', array_map(fn($k, $v) => "$k $v", array_keys($g), $g)) : '• kayıt yok';
    try {
        $c = gsc_total($first, $last, false); $p = gsc_total($pfirst, $plast, false);
        $L[] = '';
        $L[] = 'Google';
        $L[] = '• Tıklama: ' . nf($c['clicks']) . $pct($c['clicks'], $p['clicks']) . ' · Gösterim: ' . nf($c['impressions']) . $pct($c['impressions'], $p['impressions']);
        $L[] = '• Ort. sıra: ' . nf($c['position'], 1);
    } catch (Throwable $e) { $L[] = 'Google verisi alınamadı: ' . google_reason_tr($e); }
    $v = vitals(30);
    $L[] = '';
    $L[] = 'Hız (p75, son 30 gün): LCP ' . vital_fmt($v['total']['lcp']['p75'], 'lcp') . ' · CLS ' . vital_fmt($v['total']['cls']['p75'], 'cls') . ' · INP ' . vital_fmt($v['total']['inp']['p75'], 'inp');
    $je = (int)val('SELECT COUNT(*) FROM stats_jserr WHERE last_seen BETWEEN ? AND ?', [$first . ' 00:00:00', $last . ' 23:59:59']);
    $L[] = 'JavaScript hata türü (ay içinde görülen): ' . $je;
    return implode("\n", $L);
}

// ---------------- Masaüstü uyarı sayaçları (panel 20 sn'de bir çeker) ----------------
function alert_counts(): array
{
    $t = db_tables();
    $since = utc_ago(86400);
    return [
        'sikayet' => isset($t['sh_reports']) ? (int)val('SELECT COUNT(*) FROM sh_reports WHERE created_at >= ?', [$since]) : 0,
        'supheli' => isset($t['bp_scores']) ? (int)val('SELECT COUNT(*) FROM bp_scores WHERE flag = 1') : 0,
        'jshata' => isset($t['stats_jserr']) ? (int)val('SELECT COUNT(*) FROM stats_jserr WHERE first_seen >= ?', [date('Y-m-d H:i:s', time() - 86400)]) : 0,
    ];
}

// ---------------- Site duyurusu (assets/duyuru.json; ortak betik okur) ----------------
function duyuru_file(): string { return SITE_ROOT . '/assets/duyuru.json'; }
function duyuru_read(): array
{
    $f = duyuru_file();
    if (!is_file($f)) return ['active' => false];
    $d = json_decode((string)file_get_contents($f), true);
    return is_array($d) ? $d : ['active' => false];
}
function duyuru_write(array $d): void
{
    $f = duyuru_file();
    if (file_put_contents($f, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX) === false) {
        throw new RuntimeException('Duyuru dosyası yazılamadı (assets/ klasörüne yazma izni): ' . $f);
    }
}

// ---------------- IndexNow (Bing, Yandex…) ----------------
const INDEXNOW_KEY = '610356dc09b83793bcbe941706bbe023';
/** Dönüş: [HTTP kodu, hata metni]. */
function indexnow_send(array $urls): array
{
    $host = site_host();
    [$code, $body, $err] = http_req('POST', 'https://api.indexnow.org/indexnow',
        json_encode(['host' => $host, 'key' => INDEXNOW_KEY, 'keyLocation' => site_url() . '/' . INDEXNOW_KEY . '.txt', 'urlList' => array_values($urls)]),
        ['Content-Type: application/json; charset=utf-8'], 30);
    try { db_ping(); } catch (Throwable $e) { /* sonraki sorgu raporlar */ }
    return [$code, $err !== '' ? $err : ($code >= 300 ? mb_substr($body, 0, 200) : '')];
}
