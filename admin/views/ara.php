<?php
// Arama: notlar, sayfa yolları / gelinen siteler / kampanyalar (90 gün), Google sorguları ve sayfaları (önbellekteki veri),
// URL Inspection adresleri, PHP hata mesajları. "/" tuşu üstteki kutuya odaklar.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$q = trim((string)($_GET['q'] ?? ''));
?>
<h1>Arama</h1>
<form method="get" action="./" class="row"><input type="hidden" name="view" value="ara"><input type="search" name="q" value="<?= h($q) ?>" placeholder="Not, sayfa yolu, sorgu, hata…" class="grow" aria-label="Aranacak metin" autofocus><button class="btn" type="submit">Ara</button></form>
<?php if (mb_strlen($q) < 2) { echo '<p class="muted">En az 2 karakter yaz.</p>'; return; }
$like = '%' . addcslashes($q, '%_\\') . '%';
$sections = [];

try {
    $r = rows('SELECT id, text, due, done FROM adm_notes WHERE text LIKE ? ORDER BY done, id DESC LIMIT 50', [$like]);
    $sections['Notlar'] = array_map(fn($n) => '<a href="./?view=notlar' . ($n['done'] ? '&amp;goster=hepsi' : '') . '">' . h($n['text']) . '</a>' . ($n['done'] ? ' <span class="pill">tamam</span>' : '') . ($n['due'] ? ' <span class="muted">· ' . tr_date($n['due']) . '</span>' : ''), $r);
} catch (Throwable $e) { echo err_box($e, 'Notlarda arama'); }

try {
    $r = rows('SELECT dim, val, SUM(n) n FROM stats_dim WHERE dim IN (\'page\', \'ref\', \'src\') AND val LIKE ? AND day >= ? GROUP BY dim, val ORDER BY n DESC LIMIT 50', [$like, day_add(today(), -89)]);
    $sections['Trafik (90 gün)'] = array_map(fn($x) => '<span class="pill">' . h($GLOBALS['DIM_TR'][$x['dim']]) . '</span> <span class="path">' . h(val_tr($x['dim'], $x['val'])) . '</span> <span class="muted">· ' . nf($x['n']) . ' görüntüleme</span>', $r);
} catch (Throwable $e) { echo err_box($e, 'Trafikte arama'); }

try {
    $hits = [];
    foreach (rows("SELECT v FROM adm_settings WHERE k LIKE 'gsc:%' AND (expires_at IS NULL OR expires_at > ?)", [now()]) as $c) {
        foreach (json_decode((string)$c['v'], true) ?: [] as $row) {
            if (empty($row['keys'])) continue;
            foreach ($row['keys'] as $k) if (is_string($k) && !preg_match('~^\d{4}-\d{2}-\d{2}$~', $k) && mb_stripos($k, $q) !== false) {
                $hits[$k] = max($hits[$k] ?? 0, (float)$row['impressions']);
            }
        }
    }
    arsort($hits);
    $sections['Google sorguları ve sayfaları (önbellek)'] = array_map(fn($k, $v) => '<span class="path">' . h($k) . '</span> <span class="muted">· ' . nf($v) . ' gösterim</span>', array_keys(array_slice($hits, 0, 50, true)), array_slice($hits, 0, 50, true));
} catch (Throwable $e) { echo err_box($e, 'Google verisinde arama'); }

try {
    $r = rows('SELECT url, verdict, coverage FROM adm_inspect WHERE url LIKE ? OR coverage LIKE ? LIMIT 50', [$like, $like]);
    $sections['İndeks durumu'] = array_map(fn($x) => '<a class="path" href="./?view=google&amp;tab=indeks">' . h($x['url']) . '</a> <span class="muted">· ' . h(verdict_tr($x['verdict'])) . ($x['coverage'] ? ', ' . h($x['coverage']) : '') . '</span>', $r);
} catch (Throwable $e) { echo err_box($e, 'İndekste arama'); }

try {
    $r = array_filter(error_log_groups(), fn($g) => mb_stripos($g['msg'], $q) !== false);
    $sections['PHP hataları'] = array_map(fn($g) => '<a href="./?view=sistem&amp;tab=hatalar">' . h(level_tr($g['level'])) . '</a>: <span class="msg">' . h(mb_substr($g['msg'], 0, 240)) . '</span> <span class="muted">· ' . nf($g['count']) . ' kez</span>', array_slice(array_values($r), 0, 50));
} catch (Throwable $e) { echo err_box($e, 'Hatalarda arama'); }

$total = 0;
foreach ($sections as $title => $items): $total += count($items); if (!$items) continue; ?>
<section class="card"><h2><?= h($title) ?> <span class="muted small"><?= count($items) ?></span></h2><ul class="hits"><?php foreach ($items as $it): ?><li><?= $it ?></li><?php endforeach ?></ul></section>
<?php endforeach;
if (!$total) echo '<p class="muted">"' . h($q) . '" için sonuç yok.</p>';
