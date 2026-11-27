<?php
// Özet: bugün/dün/7/30 gün kartları, şu an sitede, dikkat isteyen işler, vadesi gelen notlar, GA4, en çok görüntülenenler.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$t = today();
$periods = [
    'Bugün' => [$t, $t, day_add($t, -1), day_add($t, -1)],
    'Dün' => [day_add($t, -1), day_add($t, -1), day_add($t, -2), day_add($t, -2)],
    'Son 7 gün' => [day_add($t, -6), $t, day_add($t, -13), day_add($t, -7)],
    'Son 30 gün' => [day_add($t, -29), $t, day_add($t, -59), day_add($t, -30)],
];
$gd = null; $gErr = null;
if (gkey_status()['ok']) { try { $gd = gsc_daily(); } catch (Throwable $e) { $gErr = google_reason_tr($e); } }
$gsum = function (string $a, string $b) use ($gd): ?float {
    if ($gd === null) return null;
    $s = 0; $any = false;
    foreach ($gd as $d => $v) if ($d >= $a && $d <= $b) { $s += $v[0]; $any = true; }
    return $any ? $s : null;
};
?>
<div class="row between"><h1 style="margin:0">Özet</h1><button class="btn ghost small" type="button" id="duzenBtn" aria-expanded="false">Düzenle</button></div>
<div id="duzenPanel" class="card" hidden><h2>Özeti düzenle</h2><p class="muted small">Blokları gizle ya da sırala; bu tarayıcıda saklanır.</p><ul class="duzen" id="duzenListe"></ul><button class="btn ghost small" type="button" id="duzenSifirla">Varsayılana dön</button></div>
<div id="bloklar">
<?php
$att = []; try { $att = attention_items(); } catch (Throwable $e) { echo err_box($e, 'Dikkat listesi okunamadı'); }
try {
    [$tpv] = st_sum('pv', $t, $t); [$ypv] = st_sum('pv', day_add($t, -1), day_add($t, -1));
    $g7 = $gsum(day_add($t, -9), $t); $gp7 = $gsum(day_add($t, -19), day_add($t, -10));
?>
<div class="strip" data-blok="serit" data-ad="Üst şerit">
  <div><div class="sl">Bugün görüntüleme</div><div class="sv"><?= nf($tpv) ?></div><div class="sl"><?= delta_html($tpv, $ypv) ?> düne göre</div></div>
  <div class="live"><div class="sl">Şu an sitede</div><div class="sv" data-live-n>…</div><div class="sl">son 5 dakika</div></div>
  <div><div class="sl">Google tıklama (son 10 gün)</div><div class="sv"><?= $g7 === null ? '—' : nf($g7) ?></div><div class="sl"><?= $g7 !== null && $gp7 !== null ? delta_html($g7, $gp7) . ' önceki 10 güne göre' : ($gErr ? 'bağlı değil' : 'veri 2-3 gün geriden') ?></div></div>
  <div class="<?= $att ? 'bad' : 'good' ?>"><div class="sl">Dikkat isteyen</div><div class="sv"><?= $att ? count($att) : '✓' ?></div><div class="sl"><?= $att ? 'aşağıda listelendi' : 'her şey yolunda' ?></div></div>
</div>

<div class="kpis k4" data-blok="donem" data-ad="Dönem kartları">
<?php foreach ($periods as $label => [$a, $b, $pa, $pb]):
    [$pv, $u] = st_sum('pv', $a, $b); [$ppv, $pu] = st_sum('pv', $pa, $pb);
    $gc = $gsum($a, $b); $pgc = $gsum($pa, $pb);
    $sp = $a !== $b ? spark(array_column(st_series('pv', $a, $b), 0)) : ''; ?>
  <div class="kpi">
    <div class="kl"><?= h($label) ?></div>
    <div class="kv"><?= nf($pv) ?> <?= delta_html($pv, $ppv) ?></div>
    <div class="ks">görüntüleme · <?= nf($u) ?> tekil <?= delta_html($u, $pu) ?></div>
    <div class="kr"><b><?= $gc === null ? '—' : nf($gc) ?></b> Google tıklama <?= $gc !== null && $pgc !== null ? delta_html($gc, $pgc) : '' ?></div>
    <?= $sp ?>
  </div>
<?php endforeach ?>
</div>
<p class="muted small" data-blok="donem">Tekil ziyaretçi birden çok gün için günlük tekillerin toplamıdır (çerez kullanılmaz). Google verisi 2-3 gün geriden gelir; bugün ve dün için genellikle "—" görünür.<?= $gErr ? ' Google: ' . h($gErr) : '' ?></p>
<?php } catch (Throwable $e) { echo err_box($e, 'İstatistik okunamadı'); } ?>

<div class="grid2" data-blok="canli" data-ad="Şu an sitede ve dikkat isteyenler">
  <section class="card">
    <h2>Şu an sitede</h2>
    <div class="big" data-live-n>…</div><p class="muted small">Son 5 dakikada sinyal veren ziyaretçi · 20 sn'de bir yenilenir</p><div data-live-detail></div>
  </section>
  <section class="card">
    <h2>Dikkat isteyen işler</h2>
    <?php if (!$att): ?><p class="okline">Her şey yolunda.</p><?php else: ?>
    <ul class="att"><?php foreach ($att as [$lvl, $txt, $v]): ?><li class="<?= h($lvl) ?>"><a href="./?view=<?= h($v) ?>"><?= h($txt) ?></a></li><?php endforeach ?></ul>
    <?php endif ?>
  </section>
</div>

<section class="card" data-blok="akis" data-ad="Canlı akış"><div class="row between"><h2>Canlı akış</h2><span class="muted small">son olaylar · 10 sn'de bir</span></div><ul class="feed" id="feed"><li class="muted">Yükleniyor…</li></ul></section>

<?php try {
    $due = rows('SELECT * FROM adm_notes WHERE done = 0 AND due IS NOT NULL AND due <= ? ORDER BY due, priority', [day_add($t, 3)]);
    if ($due): ?>
<section class="card" data-blok="notlar" data-ad="Vadesi gelen notlar"><h2>Vadesi gelen notlar</h2><ul class="att"><?php foreach ($due as $n): ?>
  <li class="<?= $n['due'] < $t ? 'err' : 'warn' ?>"><a href="./?view=notlar"><?= h($n['text']) ?></a> <span class="muted">· <?= tr_date($n['due']) ?></span></li><?php endforeach ?></ul></section>
<?php endif; } catch (Throwable $e) { echo err_box($e, 'Notlar okunamadı'); } ?>

<?php if (cfg('GA4_PROPERTY')): ?>
<section class="card" data-blok="ga4" data-ad="Google Analytics"><h2>Google Analytics (son 28 gün)</h2>
<?php try { $ga = ga4_summary(); if ($ga): ?>
  <div class="kpis k3">
    <?= kpi('Kullanıcı', nf($ga['cur'][0]) . ' ' . delta_html($ga['cur'][0], $ga['prev'][0])) ?>
    <?= kpi('Oturum', nf($ga['cur'][1]) . ' ' . delta_html($ga['cur'][1], $ga['prev'][1])) ?>
    <?= kpi('Sayfa görüntüleme', nf($ga['cur'][2] ?? 0) . ' ' . delta_html($ga['cur'][2] ?? 0, $ga['prev'][2] ?? 0)) ?>
  </div>
<?php endif; } catch (Throwable $e) { echo '<div class="flash err">' . h(google_reason_tr($e)) . '<br>Servis hesabının e-postasını GA4 mülküne "Görüntüleyici" olarak ekle (Yönetici → Mülk erişim yönetimi).</div>'; } ?>
</section>
<?php endif ?>

<?php try { $from = day_add($t, -6); ?>
<div class="grid2" data-blok="enler" data-ad="En çok görüntülenen sayfalar ve gelinen siteler">
  <section class="card"><h2>En çok görüntülenen sayfalar <span class="muted small">(7 gün)</span></h2>
    <?php $r = st_dim('page', $from, $t, 10); if (!$r): ?><p class="muted">Henüz veri yok.</p><?php else: ?>
    <div class="tw"><table><tbody><?php foreach ($r as $x): ?><tr><td class="path"><a href="<?= h(site_url() . $x['val']) ?>" target="_blank" rel="noopener"><?= h($x['val']) ?></a></td><td class="r"><?= nf($x['n']) ?></td></tr><?php endforeach ?></tbody></table></div><?php endif ?>
  </section>
  <section class="card"><h2>En çok gelinen siteler <span class="muted small">(7 gün)</span></h2>
    <?php $r = st_dim('ref', $from, $t, 10); if (!$r): ?><p class="muted">Henüz veri yok.</p><?php else: ?>
    <div class="tw"><table><tbody><?php foreach ($r as $x): ?><tr><td><?= h(val_tr('ref', $x['val'])) ?></td><td class="r"><?= nf($x['n']) ?></td></tr><?php endforeach ?></tbody></table></div><?php endif ?>
  </section>
</div>
<?php } catch (Throwable $e) { echo err_box($e, 'Sayfa listesi okunamadı'); } ?>
</div><!-- #bloklar -->
