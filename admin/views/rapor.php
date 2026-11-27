<?php
// Yazdırılabilir aylık rapor (?view=rapor&ay=2026-11): tek sayfa, grafikli; tarayıcının "Yazdır → PDF olarak kaydet"i ile PDF olur.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$ay = preg_match('~^\d{4}-\d{2}$~', (string)($_GET['ay'] ?? '')) ? (string)$_GET['ay'] : date('Y-m');
$from = $ay . '-01'; $to = min(date('Y-m-t', strtotime($from)), today());
$pfrom = date('Y-m-01', strtotime($from . ' -1 month')); $pto = date('Y-m-t', strtotime($pfrom));
[$pv, $u] = st_sum('pv', $from, $to); [$ppv, $pu] = st_sum('pv', $pfrom, $pto);
$aylar = []; for ($i = 0; $i < 12; $i++) $aylar[] = date('Y-m', strtotime(date('Y-m-01') . " -$i month"));
?>
<div class="row between wrap noprint">
  <form method="get" action="./" class="range"><input type="hidden" name="view" value="rapor"><select name="ay" aria-label="Ay"><?php foreach ($aylar as $a): ?><option value="<?= $a ?>"<?= $a === $ay ? ' selected' : '' ?>><?= h(lbl_month($a)) ?></option><?php endforeach ?></select><button class="btn ghost small" type="submit">Göster</button></form>
  <button class="btn" type="button" id="printBtn">Yazdır / PDF</button>
</div>
<article class="rapor">
  <header class="rh"><div><div class="muted small">okutan.org · aylık rapor</div><h1 style="margin:0"><?= h(lbl_month($ay)) ?></h1></div><div class="muted small"><?= h(tr_date($from) . ' – ' . tr_date($to)) ?> · hazırlanma <?= h(tr_date(now(), true)) ?></div></header>
  <div class="kpis k4">
    <?= kpi('Görüntüleme', nf($pv) . ' ' . delta_html($pv, $ppv), 'önceki aya göre') ?>
    <?= kpi('Tekil ziyaretçi', nf($u) . ' ' . delta_html($u, $pu), 'günlük tekillerin toplamı') ?>
    <?php [$sn] = st_sum('seg_new', $from, $to); [$sr] = st_sum('seg_ret', $from, $to); ?>
    <?= kpi('Yeni / geri dönen', nf($sn) . ' / ' . nf($sr), 'görüntüleme') ?>
    <?php $gc = null; try { $gt = gsc_total($from, $to, false); $gc = $gt; } catch (Throwable $e) {} ?>
    <?= kpi('Google tıklama', $gc ? nf($gc['clicks']) : '—', $gc ? nf($gc['impressions']) . ' gösterim · ort. sıra ' . nf($gc['position'], 1) : 'Search Console verisi yok') ?>
  </div>
  <section class="card"><h2>Günlük görüntüleme</h2><?= bar_chart(st_series('pv', $from, $to), 'Gün', 'Görüntüleme', 'Tekil', 'lbl_dm') ?></section>
  <div class="grid2">
    <section class="card"><h2>En çok görüntülenen sayfalar</h2><div class="tw"><table class="small"><tbody><?php foreach (st_dim('page', $from, $to, 10) as $x): ?><tr><td class="path"><?= h($x['val']) ?></td><td class="r"><?= nf($x['n']) ?></td></tr><?php endforeach ?></tbody></table></div></section>
    <section class="card"><h2>Oyunlar <span class="muted small">(başlayan kişi)</span></h2><div class="tw"><table class="small"><tbody>
      <?php $gs = game_event_stats($from, $to); uasort($gs, fn($a, $b) => $b['ev']['basla'][1] <=> $a['ev']['basla'][1]); foreach ($gs as $k => $g): if (!$g['pv']) continue; ?>
      <tr><td><?= h(game_name_of($k)) ?></td><td class="r"><?= nf($g['ev']['basla'][1]) ?></td><td class="r muted"><?= nf($g['pv']) ?> sayfa</td></tr><?php endforeach ?></tbody></table></div></section>
  </div>
  <div class="grid2">
    <section class="card"><h2>Ülkeler</h2><?= country_grid(array_map('intval', array_column(st_dim('cc', $from, $to, 200), 'n', 'val'))) ?></section>
    <section class="card"><h2>Hız <span class="muted small">(p75)</span></h2>
      <?php $v = vitals(0, '', $from, $to); ?>
      <div class="kpis k3"><?php foreach (['lcp' => 'LCP', 'cls' => 'CLS', 'inp' => 'INP'] as $m => $l): $p = $v['total'][$m]['p75']; ?><div class="kpi vital <?= h(vital_rate($p, $m)) ?>"><div class="kl"><?= $l ?></div><div class="kv"><?= vital_fmt($p, $m) ?></div></div><?php endforeach ?></div>
      <p class="small">Cihaz: <?= h(implode(' · ', array_map(fn($x) => val_tr('dev', $x['val']) . ' ' . nf($x['n']), st_dim('dev', $from, $to, 3)))) ?: '—' ?></p>
    </section>
  </div>
</article>
