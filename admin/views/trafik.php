<?php
// Trafik: birinci taraf istatistik (çerezsiz, yalnızca agregat). Kaynak: kökteki stats.php ← assets/oyunlar.js
// Dönem: 1/7/30/90 gün ya da özel aralık (?from=&to=). Karşılaştırma: aynı uzunluktaki önceki dönem.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$t = today();
$isDate = fn($d) => is_string($d) && preg_match('~^\d{4}-\d{2}-\d{2}$~', $d) && strtotime($d) !== false;
if ($isDate($_GET['from'] ?? null) && $isDate($_GET['to'] ?? null) && $_GET['from'] <= $_GET['to']) {
    $from = $_GET['from']; $to = min($_GET['to'], $t); $gun = 0;
    $len = (int)round((strtotime($to) - strtotime($from)) / 86400) + 1;
} else {
    $gun = in_array((int)($_GET['gun'] ?? 7), [1, 7, 30, 90], true) ? (int)($_GET['gun'] ?? 7) : 7;
    $to = $t; $from = day_add($t, -($gun - 1)); $len = $gun;
}
$pto = day_add($from, -1); $pfrom = day_add($pto, -($len - 1));
[$pv, $u] = st_sum('pv', $from, $to);
[$ppv, $pu] = st_sum('pv', $pfrom, $pto);
$funnel = (array)cfg('FUNNEL', [['pv', 'Sayfa görüntüleyen'], ['ev_engaged', '1 dakikadan uzun kalan'], ['ev_engaged5', '5 dakikadan uzun kalan']]);
$csv = fn(string $q) => '<a class="csv" href="./?csv=' . $q . '&amp;gun=' . max(1, $len) . '">CSV</a>';
$donem = tr_date($from) . ($from !== $to ? ' – ' . tr_date($to) : '');
?>
<h1>Trafik</h1>
<div class="row wrap between">
  <nav class="tabs" aria-label="Dönem" style="margin:0"><?php foreach ([1 => 'Bugün', 7 => '7 gün', 30 => '30 gün', 90 => '90 gün'] as $k => $l): ?><a href="./?view=trafik&amp;gun=<?= $k ?>"<?= $k === $gun ? ' aria-current="page"' : '' ?>><?= h($l) ?></a><?php endforeach ?></nav>
  <form method="get" action="./" class="range"><input type="hidden" name="view" value="trafik">
    <input type="date" name="from" value="<?= h($from) ?>" max="<?= h($t) ?>" aria-label="Başlangıç"> – <input type="date" name="to" value="<?= h($to) ?>" max="<?= h($t) ?>" aria-label="Bitiş">
    <button class="btn ghost small" type="submit">Göster</button></form>
</div>
<p class="muted small"><?= h($donem) ?> (<?= $len ?> gün) · karşılaştırma: <?= h(tr_date($pfrom) . ($pfrom !== $pto ? ' – ' . tr_date($pto) : '')) ?></p>

<div class="kpis k3">
  <?= kpi('Görüntüleme', nf($pv) . ' ' . delta_html($pv, $ppv), 'önceki ' . $len . ' güne göre') ?>
  <?= kpi('Tekil ziyaretçi', nf($u) . ' ' . delta_html($u, $pu), $len > 1 ? 'günlük tekillerin toplamı' : 'bugün') ?>
  <div class="kpi"><div class="kl">Şu an sitede</div><div class="kv" data-live-n>…</div><div class="ks" data-live-detail></div></div>
</div>

<?php if ($len > 1):
  $cs = st_series('pv', $from, $to);
  $cur = array_column($cs, 0); $prev = array_column(st_series('pv', $pfrom, $pto), 0);
  $labels = array_map('lbl_dm', array_keys($cs)); ?>
<section class="card"><div class="row between"><h2>Bu dönem / önceki dönem</h2><?= $csv('gunluk') ?></div>
  <?= line_compare($cur, $prev, $labels, 'Bu dönem', 'Önceki dönem') ?></section>
<?php endif ?>

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

<div class="grid2">
  <section class="card"><h2>Saat ısı haritası <span class="muted small">(son 28 gün, ortalama)</span></h2>
    <?php try { echo heat_html(hour_heat(28)); } catch (Throwable $e) { echo err_box($e, 'Isı haritası'); } ?>
    <p class="muted small">Duyuru ya da yeni oyunu en yoğun saatlerden hemen önce yayınlamak etkili olur.</p></section>
  <section class="card"><div class="row between"><h2>Ülkeler <span class="muted small">(<?= $len ?> gün)</span></h2><?= $csv('boyut&amp;dim=cc') ?></div>
    <?php $cc = array_column(st_dim('cc', $from, $to, 200), 'n', 'val'); echo country_grid(array_map('intval', $cc)); ?>
    <p class="muted small">Ülke IP'den değil tarayıcının saat diliminden tahmin edilir (VPN ya da yanlış saat ayarında farklı çıkabilir).</p></section>
</div>

<section class="card">
  <div class="row between"><h2>Yolculuk <span class="muted small">(<?= $len ?> gün)</span></h2><span><?= str_replace('>CSV<', '>Giriş CSV<', $csv('boyut&amp;dim=entry')) ?> <?= str_replace('>CSV<', '>Geçiş CSV<', $csv('boyut&amp;dim=flow')) ?></span></div>
  <?php try { $jr = journey($from, $to); ?>
  <div class="grid3">
    <div><h3>Giriş sayfaları</h3><?php if (!$jr['entry']): ?><p class="muted small">Henüz veri yok (yeni eklendi).</p><?php else: ?>
      <div class="tw"><table class="small"><tbody><?php foreach ($jr['entry'] as $p => $n): ?><tr><td class="path"><?= h($p) ?></td><td class="r"><?= nf($n) ?></td></tr><?php endforeach ?></tbody></table></div><?php endif ?></div>
    <div><h3>Sayfadan sayfaya</h3><?php if (!$jr['flows']): ?><p class="muted small">Henüz veri yok.</p><?php else: ?>
      <div class="tw"><table class="small"><tbody><?php foreach ($jr['flows'] as $f): [$a, $b] = array_pad(explode(' → ', $f['val'], 2), 2, ''); ?><tr><td class="path"><?= h($a) ?> <span class="muted">→</span> <?= h($b) ?></td><td class="r"><?= nf($f['n']) ?></td></tr><?php endforeach ?></tbody></table></div><?php endif ?></div>
    <div><h3>Çıkış oranı</h3><?php if (!$jr['exit']): ?><p class="muted small">Henüz veri yok.</p><?php else: ?>
      <div class="tw"><table class="small"><thead><tr><th>Sayfa</th><th class="r">Görüntüleme</th><th class="r">Çıkış</th></tr></thead><tbody>
      <?php foreach ($jr['exit'] as $p => $x): ?><tr><td class="path"><?= h($p) ?></td><td class="r"><?= nf($x['pv']) ?></td><td class="r <?= $x['cikis'] > .8 ? 'errtxt' : '' ?>">%<?= nf($x['cikis'] * 100) ?></td></tr><?php endforeach ?></tbody></table></div><?php endif ?></div>
  </div>
  <p class="muted small">Çıkış: o sayfadan sonra sitede başka sayfaya geçilmeyen görüntüleme payı. Oyunlarda yüksek çıkış normaldir (oyun aynı sayfada oynanır); ana sayfa ve listelerde yüksekse ziyaretçi aradığını bulamıyor olabilir. Kelime Bulucu alt sayfaları tek satırda toplanır. Geçiş verisi bu güncellemeden sonra birikmeye başlar.</p>
  <?php } catch (Throwable $e) { echo err_box($e, 'Yolculuk okunamadı'); } ?>
</section>

<section class="card">
  <div class="row between"><h2>Huni <span class="muted small">(tekil ziyaretçi, <?= $len ?> gün)</span></h2><?= $csv('olay') ?></div>
  <?php $first = null; ?>
  <div class="funnel"><?php foreach ($funnel as $i => [$metric, $label]):
      [, $fu] = st_sum((string)$metric, $from, $to); $first ??= max(1, $fu); $pct = $fu / $first * 100; ?>
    <div class="fs"><div class="fl"><?= $i ? '→ ' : '' ?><?= h($label) ?></div><div class="fb"><span style="width:<?= round(min(100, $pct), 1) ?>%"></span></div><div class="fv"><?= nf($fu) ?> <span class="muted">%<?= nf($pct, $pct < 10 ? 1 : 0) ?></span></div></div>
  <?php endforeach ?></div>
  <?php $ev = st_events($from, $to); if ($ev): ?>
  <details class="tbl"><summary>Tüm olaylar</summary><div class="tw"><table><thead><tr><th>Olay</th><th class="r">Sayı</th><th class="r">Tekil</th></tr></thead><tbody>
  <?php foreach ($ev as $e): ?><tr><td><?= h(event_tr($e['metric'])) ?></td><td class="r"><?= nf($e['n']) ?></td><td class="r"><?= nf($e['u']) ?></td></tr><?php endforeach ?></tbody></table></div></details>
  <?php endif ?>
</section>

<div class="grid2">
<?php foreach (['page' => 30, 'ref' => 20, 'br' => 12, 'os' => 10, 'dev' => 5, 'lang' => 15, 'src' => 20] as $dim => $lim): $r = st_dim($dim, $from, $to, $lim); $sum = array_sum(array_column($r, 'n')) ?: 1; ?>
  <section class="card"><div class="row between"><h2><?= h($GLOBALS['DIM_TR'][$dim]) ?></h2><?= $csv('boyut&amp;dim=' . $dim) ?></div>
  <?php if (!$r): ?><p class="muted">Bu dönemde veri yok.</p><?php else: ?>
  <div class="tw"><table><tbody><?php foreach ($r as $x): ?><tr>
    <td class="<?= $dim === 'page' ? 'path' : '' ?>"><?= $dim === 'page' ? '<a href="' . h(site_url() . $x['val']) . '" target="_blank" rel="noopener">' . h($x['val']) . '</a>' : h(val_tr($dim, $x['val'])) ?></td>
    <td class="r"><?= nf($x['n']) ?></td><td class="r muted">%<?= nf($x['n'] / $sum * 100) ?></td></tr><?php endforeach ?></tbody></table></div>
  <?php endif ?></section>
<?php endforeach ?>
</div>
<p class="muted small">Botlar sunucuda (tarayıcı kimliği listesi) ve tarayıcıda (webdriver, headless, şüpheli ekran boyutu) elenir. Bu panelden giren tarayıcı kendi ziyaretlerini saymaz.</p>
