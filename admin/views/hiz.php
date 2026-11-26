<?php
// Hız: gerçek ziyaretçilerden Core Web Vitals (LCP, CLS, INP yaklaşık), p75 — Google'ın baktığı değer. Kaynak: oyunlar.js → stats.php (wv).
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$gun = in_array((int)($_GET['gun'] ?? 28), [7, 28, 90], true) ? (int)($_GET['gun'] ?? 28) : 28;
$dev = in_array($_GET['dev'] ?? '', ['mobile', 'desktop', 'tablet'], true) ? $_GET['dev'] : '';
$ad = ['lcp' => ['En büyük içerik (LCP)', 'Sayfanın ana içeriğinin görünme süresi. İyi: 2,5 sn altı.'],
       'cls' => ['Düzen kayması (CLS)', 'Yüklenirken içeriğin zıplaması. İyi: 0,1 altı.'],
       'inp' => ['Tepki süresi (INP)', 'Dokunma/tıklamaya tepki (en yavaş etkileşim, yaklaşık). İyi: 200 ms altı.']];
$rate = ['ok' => 'İyi', 'warn' => 'Geliştirilmeli', 'bad' => 'Kötü'];
?>
<h1>Hız</h1>
<div class="row wrap">
  <nav class="tabs" aria-label="Dönem" style="margin:0"><?php foreach ([7 => '7 gün', 28 => '28 gün', 90 => '90 gün'] as $k => $l): ?><a href="./?view=hiz&amp;gun=<?= $k ?>&amp;dev=<?= h($dev) ?>"<?= $k === $gun ? ' aria-current="page"' : '' ?>><?= h($l) ?></a><?php endforeach ?></nav>
  <nav class="tabs" aria-label="Cihaz" style="margin:0"><?php foreach (['' => 'Hepsi', 'mobile' => 'Telefon', 'desktop' => 'Bilgisayar'] as $k => $l): ?><a href="./?view=hiz&amp;gun=<?= $gun ?>&amp;dev=<?= h($k) ?>"<?= $k === $dev ? ' aria-current="page"' : '' ?>><?= h($l) ?></a><?php endforeach ?></nav>
</div>
<?php try { $v = vitals($gun, $dev); ?>
<div class="kpis k3">
<?php foreach ($ad as $m => [$baslik, $acik]): $x = $v['total'][$m]; $r = vital_rate($x['p75'], $m); ?>
  <div class="kpi vital <?= h($r) ?>"><div class="kl"><?= h($baslik) ?></div><div class="kv"><?= vital_fmt($x['p75'], $m) ?></div>
    <div class="ks"><?= $r ? '<b>' . h($rate[$r]) . '</b> · ' : '' ?><?= nf($x['n']) ?> ölçüm · p75</div><div class="ks"><?= h($acik) ?></div></div>
<?php endforeach ?>
</div>
<section class="card"><h2>Sayfalara göre <span class="muted small">(p75; en çok ölçülen üstte)</span></h2>
<?php if (!$v['pages']): ?><p class="muted">Henüz ölçüm yok. Ziyaretçiler sayfadan ayrılırken gelir; bu güncellemeden sonra birikmeye başlar.</p><?php else: ?>
<div class="tw"><table class="small"><thead><tr><th>Sayfa</th><th class="r">LCP</th><th class="r">CLS</th><th class="r">INP</th><th class="r">Ölçüm</th></tr></thead><tbody>
<?php foreach (array_slice($v['pages'], 0, 40, true) as $pg => $ms): ?><tr><td class="path"><?= h($pg) ?></td>
<?php foreach (['lcp', 'cls', 'inp'] as $m): $p = $ms[$m]['p75'] ?? null; ?><td class="r"><span class="pill <?= ['ok' => 'ok', 'warn' => 'warn', 'bad' => 'bad'][vital_rate($p, $m)] ?? '' ?>"><?= vital_fmt($p, $m) ?></span></td><?php endforeach ?>
<td class="r muted"><?= nf(max($ms['lcp']['n'] ?? 0, $ms['inp']['n'] ?? 0)) ?></td></tr><?php endforeach ?>
</tbody></table></div><?php endif ?>
<p class="muted small">p75: ziyaretlerin %75'i bu değerden daha iyi. Google sıralamada bu değere bakar. Az ölçümlü sayfalarda değer oynaktır.</p>
</section>
<?php } catch (Throwable $e) { echo err_box($e, 'Hız verisi okunamadı'); } ?>
