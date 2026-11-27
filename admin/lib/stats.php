<?php
// Yönetim paneli — birinci taraf istatistik sorguları ve basit SVG grafikler.
declare(strict_types=1);

/** [n, uniques] toplamı; $from..$to dahil. */
function st_sum(string $metric, string $from, string $to): array
{
    $r = row('SELECT COALESCE(SUM(n),0) n, COALESCE(SUM(uniques),0) u FROM stats_daily WHERE metric = ? AND day BETWEEN ? AND ?', [$metric, $from, $to]);
    return [(int)$r['n'], (int)$r['u']];
}
/** Gün gün seri: [gün => [n, u]] (boş günler 0). */
function st_series(string $metric, string $from, string $to): array
{
    $out = [];
    for ($d = $from; $d <= $to; $d = day_add($d, 1)) $out[$d] = [0, 0];
    foreach (rows('SELECT day, n, uniques FROM stats_daily WHERE metric = ? AND day BETWEEN ? AND ?', [$metric, $from, $to]) as $r) {
        $out[$r['day']] = [(int)$r['n'], (int)$r['uniques']];
    }
    return $out;
}
/** Haftalık (Pazartesi başlangıçlı) ya da aylık toplama. Tekil sayı günlük tekillerin toplamıdır (ziyaret-gün). */
function st_group(array $series, string $mode): array
{
    $g = [];
    foreach ($series as $d => [$n, $u]) {
        $k = $mode === 'week' ? date('Y-m-d', strtotime($d . ' -' . ((int)date('N', strtotime($d)) - 1) . ' day')) : substr($d, 0, 7);
        $g[$k] = [($g[$k][0] ?? 0) + $n, ($g[$k][1] ?? 0) + $u];
    }
    return $g;
}
function st_dim(string $dim, string $from, string $to, int $limit = 20): array
{
    $limit = max(1, min(500, $limit));
    return rows('SELECT val, SUM(n) n FROM stats_dim WHERE dim = ? AND day BETWEEN ? AND ? GROUP BY val ORDER BY n DESC LIMIT ' . $limit, [$dim, $from, $to]);
}
function st_events(string $from, string $to): array
{
    return rows("SELECT metric, SUM(n) n, SUM(uniques) u FROM stats_daily WHERE metric LIKE 'ev\\_%' AND day BETWEEN ? AND ? GROUP BY metric ORDER BY n DESC", [$from, $to]);
}
function st_online(): array
{
    $since = date('Y-m-d H:i:s', time() - 300);
    $n = (int)val('SELECT COUNT(*) FROM stats_online WHERE last_seen >= ?', [$since]);
    $pages = rows('SELECT path, COUNT(*) n FROM stats_online WHERE last_seen >= ? GROUP BY path ORDER BY n DESC LIMIT 10', [$since]);
    $devs = rows('SELECT dev, COUNT(*) n FROM stats_online WHERE last_seen >= ? GROUP BY dev ORDER BY n DESC', [$since]);
    // Kişi kişi (kimliksiz): sayfa, cihaz, tarayıcı, sistem, ülke, ne zamandır sitede, son sinyal.
    $people = [];
    foreach (rows('SELECT path, dev, br, os, cc, first_seen, last_seen FROM stats_online WHERE last_seen >= ? ORDER BY last_seen DESC LIMIT 50', [$since]) as $r) {
        $people[] = ['path' => $r['path'], 'dev' => val_tr('dev', $r['dev']), 'br' => $r['br'] ?: '—', 'os' => $r['os'] ?: '—',
            'cc' => $r['cc'], 'ulke' => country_tr((string)$r['cc']),
            'sure' => $r['first_seen'] ? max(0, time() - strtotime($r['first_seen'])) : null, 'son' => max(0, time() - strtotime($r['last_seen']))];
    }
    return ['n' => $n, 'pages' => $pages, 'devs' => $devs, 'people' => $people];
}

/** Değişim yüzdesi rozeti (▲/▼). */
function delta_html(float $cur, float $prev, bool $lowerIsBetter = false): string
{
    if ($prev <= 0) return $cur > 0 ? '<span class="dl up">yeni</span>' : '<span class="dl">—</span>';
    $p = ($cur - $prev) / $prev * 100;
    if (abs($p) < 0.5) return '<span class="dl">= %0</span>';
    $good = $lowerIsBetter ? $p < 0 : $p > 0;
    return '<span class="dl ' . ($good ? 'up' : 'down') . '">' . ($p > 0 ? '▲' : '▼') . ' %' . nf(abs($p), abs($p) < 10 ? 1 : 0) . '</span>';
}

$GLOBALS['DIM_TR'] = ['page' => 'Sayfa', 'ref' => 'Gelinen site', 'lang' => 'Dil', 'dev' => 'Cihaz', 'src' => 'Kampanya (utm_source)',
    'br' => 'Tarayıcı', 'os' => 'İşletim sistemi', 'cc' => 'Ülke (saat diliminden)'];
function val_tr(string $dim, string $v): string
{
    if ($dim === 'dev') return ['mobile' => 'Telefon', 'tablet' => 'Tablet', 'desktop' => 'Bilgisayar'][$v] ?? $v;
    if ($dim === 'ref' && $v === 'direct') return 'Doğrudan / bilinmiyor';
    if ($dim === 'cc') return function_exists('country_tr') ? country_tr($v === 'XX' ? '' : $v) : $v;
    if ($dim === 'lang') return ['tr' => 'Türkçe', 'en' => 'İngilizce', 'de' => 'Almanca', 'az' => 'Azerice', 'ru' => 'Rusça', 'fr' => 'Fransızca', 'ar' => 'Arapça', 'nl' => 'Felemenkçe', 'xx' => 'Bilinmiyor'][$v] ?? strtoupper($v);
    return $v;
}
function event_tr(string $metric): string
{
    $e = substr($metric, 3);
    $fixed = ['engaged' => 'Etkin ziyaret (1 dk+ açık)', 'engaged5' => 'Uzun ziyaret (5 dk+ açık)', 'masa_davet' => 'Online masa davetiyle gelen',
        'sohbet_giris' => 'Sohbete bağlandı', 'sohbet_yazdi' => 'Sohbette mesaj yazdı',
        'indir_kelimeler' => 'Kelimeler APK indirildi', 'indir_kelimeler32' => 'Kelimeler 32-bit APK indirildi'];
    if (isset($fixed[$e])) return $fixed[$e];
    if (preg_match('~^(basla|bitir|masa|katil)_([a-z0-9]+)$~', $e, $m) && function_exists('game_name_of')) {
        return game_name_of($m[2]) . ': ' . ['basla' => 'oyun başladı', 'bitir' => 'oyun bitti', 'masa' => 'online masa açtı', 'katil' => 'masaya katıldı'][$m[1]];
    }
    return $e;
}

/**
 * Çubuk grafik (inline SVG). $data: [etiket => [ana değer, ikinci değer|null]]; ikinci değer (ör. tekil) aynı çubuğun içinde koyu gösterilir.
 * Altında "tablo olarak gör" açılır tablosu.
 */
function bar_chart(array $data, string $title, string $l1, ?string $l2 = null, ?callable $fmtLabel = null): string
{
    $fmtLabel = $fmtLabel ?: fn($k) => (string)$k;
    $n = count($data);
    if (!$n) return '<p class="muted">Veri yok.</p>';
    $max = 1;
    foreach ($data as $v) $max = max($max, (float)$v[0], (float)($v[1] ?? 0));
    $W = 600; $H = 160; $pad = 2; $bw = $W / $n;
    $svg = '<svg class="chart" viewBox="0 0 ' . $W . ' ' . $H . '" preserveAspectRatio="none" role="img" aria-label="' . h($title) . '">';
    foreach ([0.25, 0.5, 0.75] as $f) { $gy = round($H - $f * ($H - 4), 1); $svg .= '<line x1="0" y1="' . $gy . '" x2="' . $W . '" y2="' . $gy . '" class="gl"/>'; }
    $svg .= '<line x1="0" y1="' . $H . '" x2="' . $W . '" y2="' . $H . '" class="ax"/>';
    $i = 0; $keys = array_keys($data);
    foreach ($data as $k => $v) {
        $x = $i * $bw + $pad; $w = max(1, $bw - 2 * $pad);
        $h1 = $v[0] / $max * ($H - 4);
        $tip = h($fmtLabel($k)) . ': ' . $l1 . ' ' . nf($v[0]) . ($l2 !== null && $v[1] !== null ? ', ' . $l2 . ' ' . nf($v[1]) : '');
        // Değer ipucu data-t'de (panel.js gösterir); erişilebilir karşılığı alttaki "Tablo olarak gör". Boş günde de üzerine gelinebilsin diye şeffaf alan.
        $svg .= '<g data-t="' . $tip . '"><rect x="' . round($i * $bw, 1) . '" y="0" width="' . round($bw, 1) . '" height="' . $H . '" fill="transparent"/><rect x="' . round($x, 1) . '" y="' . round($H - $h1, 1) . '" width="' . round($w, 1) . '" height="' . round($h1, 1) . '" rx="' . min(3, round($w / 3, 1)) . '" class="b1"/>';
        if ($l2 !== null && $v[1] !== null) {
            $h2 = $v[1] / $max * ($H - 4);
            $svg .= '<rect x="' . round($x, 1) . '" y="' . round($H - $h2, 1) . '" width="' . round($w, 1) . '" height="' . round($h2, 1) . '" rx="' . min(3, round($w / 3, 1)) . '" class="b2"/>';
        }
        $svg .= '</g>';
        $i++;
    }
    $svg .= '</svg>';
    // Eksen etiketleri SVG dışında (SVG esnediği için içindeki yazı bozulur): ilk, orta, son
    $svg .= '<div class="xl"><span>' . h($fmtLabel($keys[0])) . '</span>' . ($n > 2 ? '<span>' . h($fmtLabel($keys[intdiv($n - 1, 2)])) . '</span>' : '') . ($n > 1 ? '<span>' . h($fmtLabel($keys[$n - 1])) . '</span>' : '') . '</div>';
    $leg = '<div class="leg"><span class="k1"></span>' . h($l1) . ($l2 !== null ? ' <span class="k2"></span>' . h($l2) : '') . ' <span class="muted">· en yüksek ' . nf($max) . '</span></div>';
    $tb = '<details class="tbl"><summary>Tablo olarak gör</summary><div class="tw"><table><thead><tr><th>' . h($title) . '</th><th class="r">' . h($l1) . '</th>' . ($l2 !== null ? '<th class="r">' . h($l2) . '</th>' : '') . '</tr></thead><tbody>';
    foreach (array_reverse($data, true) as $k => $v) {
        $tb .= '<tr><td>' . h($fmtLabel($k)) . '</td><td class="r">' . nf($v[0]) . '</td>' . ($l2 !== null ? '<td class="r">' . ($v[1] === null ? '—' : nf($v[1])) . '</td>' : '') . '</tr>';
    }
    $tb .= '</tbody></table></div></details>';
    return $svg . $leg . $tb;
}
/** Küçük çizgi grafik (eğilim); $vals sıralı sayılar. */
function spark(array $vals): string
{
    $vals = array_values(array_map('floatval', $vals));
    $n = count($vals);
    if ($n < 2) return '';
    $max = max(1, max($vals)); $W = 100; $H = 30;
    $pts = [];
    foreach ($vals as $i => $v) $pts[] = round($i / ($n - 1) * $W, 2) . ',' . round($H - 2 - $v / $max * ($H - 4), 2);
    $line = implode(' ', $pts);
    return '<svg class="spark" viewBox="0 0 ' . $W . ' ' . $H . '" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,' . $H . ' ' . $line . ' ' . $W . ',' . $H . '"/><polyline points="' . $line . '"/></svg>';
}
function lbl_day(string $d): string { return tr_date($d); }
function lbl_dm(string $d): string { $t = strtotime($d); return date('j', $t) . '.' . date('m', $t); }
function lbl_month(string $m): string { $ay = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']; return $ay[(int)substr($m, 5, 2)] . ' ' . substr($m, 0, 4); }
