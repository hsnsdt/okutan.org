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
    return ['n' => $n, 'pages' => $pages, 'devs' => $devs];
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

$GLOBALS['DIM_TR'] = ['page' => 'Sayfa', 'ref' => 'Gelinen site', 'lang' => 'Dil', 'dev' => 'Cihaz', 'src' => 'Kampanya (utm_source)'];
function val_tr(string $dim, string $v): string
{
    if ($dim === 'dev') return ['mobile' => 'Telefon', 'tablet' => 'Tablet', 'desktop' => 'Bilgisayar'][$v] ?? $v;
    if ($dim === 'ref' && $v === 'direct') return 'Doğrudan / bilinmiyor';
    if ($dim === 'lang') return ['tr' => 'Türkçe', 'en' => 'İngilizce', 'de' => 'Almanca', 'az' => 'Azerice', 'ru' => 'Rusça', 'fr' => 'Fransızca', 'ar' => 'Arapça', 'nl' => 'Felemenkçe', 'xx' => 'Bilinmiyor'][$v] ?? strtoupper($v);
    return $v;
}
function event_tr(string $metric): string
{
    $e = substr($metric, 3);
    return ['engaged' => 'Etkin ziyaret (1 dk+ açık)', 'engaged5' => 'Uzun ziyaret (5 dk+ açık)', 'masa_davet' => 'Online masa davetiyle gelen'][$e] ?? $e;
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
    $svg .= '<line x1="0" y1="' . $H . '" x2="' . $W . '" y2="' . $H . '" class="ax"/>';
    $i = 0; $keys = array_keys($data);
    foreach ($data as $k => $v) {
        $x = $i * $bw + $pad; $w = max(1, $bw - 2 * $pad);
        $h1 = $v[0] / $max * ($H - 4);
        $tip = h($fmtLabel($k)) . ': ' . $l1 . ' ' . nf($v[0]) . ($l2 !== null && $v[1] !== null ? ', ' . $l2 . ' ' . nf($v[1]) : '');
        $svg .= '<g><title>' . $tip . '</title><rect x="' . round($x, 1) . '" y="' . round($H - $h1, 1) . '" width="' . round($w, 1) . '" height="' . round($h1, 1) . '" class="b1"/>';
        if ($l2 !== null && $v[1] !== null) {
            $h2 = $v[1] / $max * ($H - 4);
            $svg .= '<rect x="' . round($x, 1) . '" y="' . round($H - $h2, 1) . '" width="' . round($w, 1) . '" height="' . round($h2, 1) . '" class="b2"/>';
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
function lbl_day(string $d): string { return tr_date($d); }
function lbl_dm(string $d): string { $t = strtotime($d); return date('j', $t) . '.' . date('m', $t); }
function lbl_month(string $m): string { $ay = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']; return $ay[(int)substr($m, 5, 2)] . ' ' . substr($m, 0, 4); }
