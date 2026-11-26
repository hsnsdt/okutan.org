<?php
// Trafik: birinci taraf istatistik (çerezsiz, yalnızca agregat). Kaynak: kökteki stats.php ← assets/oyunlar.js
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$gun = in_array((int)($_GET['gun'] ?? 7), [1, 7, 30, 90], true) ? (int)($_GET['gun'] ?? 7) : 7;
$t = today();
$from = day_add($t, -($gun - 1)); $pto = day_add($from, -1); $pfrom = day_add($pto, -($gun - 1));
[$pv, $u] = st_sum('pv', $from, $t);
[$ppv, $pu] = st_sum('pv', $pfrom, $pto);
$funnel = (array)cfg('FUNNEL', [['pv', 'Sayfa görüntüleyen'], ['ev_engaged', '1 dakikadan uzun kalan'], ['ev_engaged5', '5 dakikadan uzun kalan']]);
?>
<h1>Trafik</h1>
<nav class="tabs" aria-label="Dönem"><?php foreach ([1 => 'Bugün', 7 => '7 gün', 30 => '30 gün', 90 => '90 gün'] as $k => $l): ?><a href="./?view=trafik&amp;gun=<?= $k ?>"<?= $k === $gun ? ' aria-current="page"' : '' ?>><?= h($l) ?></a><?php endforeach ?></nav>

<div class="kpis k3">
  <?= kpi('Görüntüleme', nf($pv) . ' ' . delta_html($pv, $ppv), 'önceki ' . $gun . ' güne göre') ?>
  <?= kpi('Tekil ziyaretçi', nf($u) . ' ' . delta_html($u, $pu), $gun > 1 ? 'günlük tekillerin toplamı' : 'bugün') ?>
  <div class="kpi"><div class="kl">Şu an sitede</div><div id="live" data-src="./?ajax=online"><div class="kv" data-n>…</div><div class="ks" data-detail></div></div></div>
</div>

<section class="card">
  <h2>Günlük <span class="muted small">(son 30 gün)</span></h2>
  <?= bar_chart(st_series('pv', day_add($t, -29), $t), 'Gün', 'Görüntüleme', 'Tekil', 'lbl_dm') ?>
</section>
<div class="grid2">
  <section class="card">
    <h2>Haftalık <span class="muted small">(12 hafta)</span></h2>
    <?php $wk = st_group(st_series('pv', date('Y-m-d', strtotime($t . ' -' . ((int)date('N') - 1) . ' day -11 week')), $t), 'week'); ?>
    <?= bar_chart($wk, 'Hafta başı', 'Görüntüleme', 'Tekil', 'lbl_dm') ?>
  </section>
  <section class="card">
    <h2>Aylık <span class="muted small">(12 ay)</span></h2>
    <?php $mo = st_group(st_series('pv', date('Y-m-01', strtotime(date('Y-m-01') . ' -11 month')), $t), 'month'); ?>
    <?= bar_chart($mo, 'Ay', 'Görüntüleme', 'Tekil', 'lbl_month') ?>
  </section>
</div>

<section class="card">
  <h2>Huni <span class="muted small">(tekil ziyaretçi, <?= $gun ?> gün)</span></h2>
  <?php $first = null; ?>
  <div class="funnel"><?php foreach ($funnel as $i => [$metric, $label]):
      [, $fu] = st_sum((string)$metric, $from, $t); $first ??= max(1, $fu); $pct = $fu / $first * 100; ?>
    <div class="fs"><div class="fl"><?= $i ? '→ ' : '' ?><?= h($label) ?></div><div class="fb"><span style="width:<?= round(min(100, $pct), 1) ?>%"></span></div><div class="fv"><?= nf($fu) ?> <span class="muted">%<?= nf($pct, $pct < 10 ? 1 : 0) ?></span></div></div>
  <?php endforeach ?></div>
  <?php $ev = st_events($from, $t); if ($ev): ?>
  <details class="tbl"><summary>Tüm olaylar</summary><div class="tw"><table><thead><tr><th>Olay</th><th class="r">Sayı</th><th class="r">Tekil</th></tr></thead><tbody>
  <?php foreach ($ev as $e): ?><tr><td><?= h(event_tr($e['metric'])) ?></td><td class="r"><?= nf($e['n']) ?></td><td class="r"><?= nf($e['u']) ?></td></tr><?php endforeach ?></tbody></table></div></details>
  <?php endif ?>
  <p class="muted small">Olaylar ortak betikten gelir (assets/oyunlar.js): sayfa 1 ve 5 dakika açık kalınca, online masa davetiyle gelince. Yeni olay için sayfada <code>okSay('ad')</code> çağır; huniyi config.php → FUNNEL ile değiştir.</p>
</section>

<div class="grid2">
<?php foreach (['page' => 30, 'ref' => 20, 'src' => 20, 'dev' => 5, 'lang' => 15] as $dim => $lim): $r = st_dim($dim, $from, $t, $lim); $sum = array_sum(array_column($r, 'n')) ?: 1; ?>
  <section class="card"><h2><?= h($GLOBALS['DIM_TR'][$dim]) ?></h2>
  <?php if (!$r): ?><p class="muted">Bu dönemde veri yok.</p><?php else: ?>
  <div class="tw"><table><tbody><?php foreach ($r as $x): ?><tr>
    <td class="<?= $dim === 'page' ? 'path' : '' ?>"><?= $dim === 'page' ? '<a href="' . h(site_url() . $x['val']) . '" target="_blank" rel="noopener">' . h($x['val']) . '</a>' : h(val_tr($dim, $x['val'])) ?></td>
    <td class="r"><?= nf($x['n']) ?></td><td class="r muted">%<?= nf($x['n'] / $sum * 100) ?></td></tr><?php endforeach ?></tbody></table></div>
  <?php endif ?></section>
<?php endforeach ?>
</div>
<p class="muted small">Botlar sunucuda (tarayıcı kimliği listesi) ve tarayıcıda (webdriver, headless, şüpheli ekran boyutu) elenir. Bu panelden giren tarayıcı kendi ziyaretlerini saymaz.</p>
