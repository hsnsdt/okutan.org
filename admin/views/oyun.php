<?php
// Oyun ayrıntısı (?view=oyun&k=batak): günlük oynanış, başlayan/biten, masa, hız, JS hataları, en çok oynayanlar, şu an oynayanlar.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$k = (string)($_GET['k'] ?? '');
if (!isset(GAMES[$k])) { echo '<h1>Oyun</h1><div class="flash err">Böyle bir oyun yok.</div><p><a href="./?view=oyunlar">Oyun istatistikleri</a></p>'; return; }
[$name, $path, $pfx] = GAMES[$k];
$gun = in_array((int)($_GET['gun'] ?? 30), [7, 30, 90], true) ? (int)($_GET['gun'] ?? 30) : 30;
$t = today(); $from = day_add($t, -($gun - 1)); $pto = day_add($from, -1); $pfrom = day_add($pto, -($gun - 1));
$ev = game_event_stats($from, $t)[$k]; $pev = game_event_stats($pfrom, $pto)[$k];
$sv = game_server_stats($gun)[$k];
$pct = fn($a, $b) => $b > 0 ? '%' . nf($a / $b * 100) : '—';
?>
<div class="row between wrap"><h1 style="margin:0"><?= h($name) ?></h1><span><a href="./?view=oyunlar">← Oyun istatistikleri</a> · <a href="<?= h($path) ?>" target="_blank" rel="noopener">Oyunu aç ↗</a></span></div>
<nav class="tabs" aria-label="Dönem"><?php foreach ([7 => '7 gün', 30 => '30 gün', 90 => '90 gün'] as $g => $l): ?><a href="./?view=oyun&amp;k=<?= h($k) ?>&amp;gun=<?= $g ?>"<?= $g === $gun ? ' aria-current="page"' : '' ?>><?= h($l) ?></a><?php endforeach ?></nav>

<div class="kpis k4">
  <?= kpi('Sayfa görüntüleme', nf($ev['pv']) . ' ' . delta_html($ev['pv'], $pev['pv'])) ?>
  <?= kpi('Başlayan', nf($ev['ev']['basla'][1]) . ' ' . delta_html($ev['ev']['basla'][1], $pev['ev']['basla'][1]), nf($ev['ev']['basla'][0]) . ' oyun başlatıldı') ?>
  <?= kpi('Bitiren', nf($ev['ev']['bitir'][1]), 'bitirme oranı ' . $pct($ev['ev']['bitir'][1], $ev['ev']['basla'][1])) ?>
  <?= kpi('Online masa', $sv['masa'] === null ? '—' : nf($sv['masa']), ($sv['aktif'] ? nf($sv['aktif']) . ' masa şu an oynanıyor' : 'şu an oynanan yok') . ($ev['ev']['katil'][1] ? ' · ' . nf($ev['ev']['katil'][1]) . ' kişi katıldı' : '')) ?>
</div>

<div class="grid2">
  <section class="card"><h2>Günlük sayfa görüntüleme</h2><?= bar_chart(game_daily($path, $from, $t), 'Gün', 'Görüntüleme', null, 'lbl_dm') ?></section>
  <section class="card"><h2>Günlük başlayan oyun</h2><?= bar_chart(array_map(fn($v) => [$v[0], $v[1]], st_series('ev_basla_' . $k, $from, $t)), 'Gün', 'Başlatılan', 'Tekil kişi', 'lbl_dm') ?></section>
</div>

<div class="grid2">
<section class="card"><h2>Şu an bu oyunda</h2>
<?php try { $on = array_values(array_filter(st_online()['people'], fn($p) => strpos($p['path'], $path) === 0)); if (!$on): ?><p class="muted">Şu an kimse yok.</p><?php else: ?>
  <div class="tw"><table class="small"><tbody><?php foreach ($on as $p): ?><tr><td><?= h($p['dev']) ?></td><td><?= h($p['br'] . ' · ' . $p['os']) ?></td><td><?= h($p['ulke']) ?></td><td class="r muted"><?= $p['sure'] !== null ? nf(intdiv((int)$p['sure'], 60)) . ' dk' : '—' ?></td></tr><?php endforeach ?></tbody></table></div>
<?php endif; } catch (Throwable $e) { echo err_box($e, 'Canlı liste'); } ?>
</section>
<section class="card"><h2>Hız <span class="muted small">(p75, <?= $gun ?> gün)</span></h2>
<?php try { $vp = array_filter(vitals($gun)['pages'], fn($pg) => strpos($pg, $path) === 0, ARRAY_FILTER_USE_KEY); if (!$vp): ?><p class="muted">Henüz ölçüm yok.</p><?php else: foreach ($vp as $pg => $ms): ?>
  <div class="kpis k3"><?php foreach (['lcp' => 'LCP', 'cls' => 'CLS', 'inp' => 'INP'] as $m => $l): $p = $ms[$m]['p75'] ?? null; ?>
    <div class="kpi vital <?= h(vital_rate($p, $m)) ?>"><div class="kl"><?= $l ?></div><div class="kv"><?= vital_fmt($p, $m) ?></div><div class="ks"><?= nf($ms[$m]['n'] ?? 0) ?> ölçüm</div></div><?php endforeach ?></div>
<?php endforeach; endif; } catch (Throwable $e) { echo err_box($e, 'Hız'); } ?>
</section>
</div>

<div class="grid2">
<section class="card"><h2>JavaScript hataları</h2>
<?php try { $je = rows('SELECT msg, src, line, n, last_seen, last_br, last_os FROM stats_jserr WHERE last_path LIKE ? ORDER BY last_seen DESC LIMIT 20', [$path . '%']); if (!$je): ?><p class="okline">Bu oyunda kayıtlı hata yok.</p><?php else: ?>
  <div class="tw"><table class="small"><tbody><?php foreach ($je as $e): ?><tr><td class="msg"><?= h($e['msg']) ?><br><span class="muted"><?= h($e['src'] . ':' . $e['line'] . ' · ' . $e['last_br'] . ' · ' . $e['last_os']) ?></span></td><td class="r"><?= nf($e['n']) ?></td><td class="r muted"><?= h(tr_ago($e['last_seen'])) ?></td></tr><?php endforeach ?></tbody></table></div>
<?php endif; } catch (Throwable $e) { echo err_box($e, 'JS hataları'); } ?>
</section>
<section class="card"><h2>En çok oynayanlar <span class="muted small">(<?= $gun ?> gün, biten oyun)</span></h2>
<?php try {
  $tbl = $pfx === 'bp_' ? 'bp_scores' : ($pfx ? $pfx . 'games' : null);
  $tp = ($tbl && isset(db_tables()[$tbl])) ? rows("SELECT name, COUNT(*) n FROM {$tbl} WHERE created_at >= ? GROUP BY name ORDER BY n DESC LIMIT 15", [utc_ago($gun * 86400)]) : [];
  if (!$tp): ?><p class="muted"><?= $tbl ? 'Bu dönemde kayıt yok.' : 'Bu oyun sunucuya sonuç göndermiyor (tarayıcıda oynanır).' ?></p><?php else: ?>
  <div class="tw"><table class="small"><tbody><?php foreach ($tp as $i => $p): ?><tr><td class="muted"><?= $i + 1 ?></td><td><b><?= h($p['name']) ?></b></td><td class="r"><?= nf($p['n']) ?></td></tr><?php endforeach ?></tbody></table></div>
<?php endif; } catch (Throwable $e) { echo err_box($e, 'Oyuncular'); } ?>
</section>
</div>
