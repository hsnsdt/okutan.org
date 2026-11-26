<?php
// Google arama: Search Console (Search Analytics, URL Inspection, Sitemaps). Kurulum talimatı bağlı değilse görünür.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$tab = in_array($_GET['tab'] ?? '', ['arama', 'indeks', 'haritalar'], true) ? $_GET['tab'] : 'arama';
$st = gkey_status();
$cc = function (string $c): string {
    static $tr = ['tur' => 'Türkiye', 'usa' => 'ABD', 'deu' => 'Almanya', 'aze' => 'Azerbaycan', 'nld' => 'Hollanda', 'gbr' => 'Birleşik Krallık', 'fra' => 'Fransa', 'aut' => 'Avusturya', 'bel' => 'Belçika', 'cyp' => 'Kıbrıs', 'bgr' => 'Bulgaristan', 'che' => 'İsviçre', 'swe' => 'İsveç', 'rus' => 'Rusya', 'kaz' => 'Kazakistan', 'irq' => 'Irak', 'grc' => 'Yunanistan'];
    return $tr[strtolower($c)] ?? strtoupper($c);
};
$dev = fn($d) => ['MOBILE' => 'Telefon', 'DESKTOP' => 'Bilgisayar', 'TABLET' => 'Tablet'][$d] ?? $d;
$rel = fn($u) => strpos($u, site_url()) === 0 ? (substr($u, strlen(site_url())) ?: '/') : $u;
?>
<h1>Google arama</h1>
<?php if (!$st['ok'] || $st['warn']): ?>
<section class="card">
  <h2>Search Console bağlantısı</h2>
  <?php if (!$st['ok']): ?><div class="flash err"><b>Bağlı değil:</b> <?= h($st['msg']) ?></div><?php endif ?>
  <?php if ($st['warn']): ?><div class="flash err"><b>Güvenlik uyarısı:</b> <?= h($st['warn']) ?></div><?php endif ?>
  <?php if (!$st['ok']): ?>
  <h3>Kurulum (bir kez)</h3>
  <ol class="steps">
    <li><a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud Console</a>'da yeni bir proje aç (ör. "okutan-panel").</li>
    <li><b>API'ler ve Hizmetler → Kitaplık</b>'ta <b>Google Search Console API</b>'yi bul ve <b>Etkinleştir</b>. (GA4 kartı da istiyorsan <b>Google Analytics Data API</b>'yi de etkinleştir.)</li>
    <li><b>IAM ve Yönetici → Hizmet hesapları → Hizmet hesabı oluştur</b>. Ad ver; <b>rol verme</b> adımını boş geç.</li>
    <li>Oluşan hesaba tıkla → <b>Anahtarlar → Anahtar ekle → Yeni anahtar → JSON</b>. Bir .json dosyası iner.</li>
    <li>Dosyanın adını <code>gsc-anahtar.json</code> yap ve cPanel Dosya Yöneticisi ile <b>web kökünün DIŞINA</b> yükle: <code><?= h(gsc_key_path() ?: '/home/KULLANICI/okutan-ozel/gsc-anahtar.json') ?></code>. <code>public_html</code> ya da okutan.org klasörünün içine koyma.</li>
    <li>JSON dosyasındaki <code>client_email</code> adresini kopyala. <a href="https://search.google.com/search-console/users" target="_blank" rel="noopener">Search Console → Ayarlar → Kullanıcılar ve izinler</a>'de bu adresi <b>Kısıtlı</b> izinle kullanıcı olarak ekle.</li>
    <li>Hepsi bu: dosya yukarıdaki yerdeyse panel onu kendiliğinden bulur. (Başka bir yer kullanacaksan <code>admin/config.php</code> → <code>GSC_KEY_FILE</code>.) Mülk: <code><?= h(gsc_site()) ?></code></li>
  </ol>
  <p class="muted small">Mülk tipi: URL ön eki mülkünde GSC_SITE tam olarak <code><?= h(site_url()) ?>/</code> (sondaki / dahil), Alan adı mülkünde <code>sc-domain:<?= h(site_host()) ?></code> olmalı. Yanlış tip ya da kullanıcı eklenmemişse Google 403 döner.</p>
  <?php endif ?>
</section>
<?php endif;
if (!$st['ok']) return; ?>

<nav class="tabs"><?php foreach (['arama' => 'Arama performansı', 'indeks' => 'İndeks durumu', 'haritalar' => 'Site haritaları'] as $k => $l): ?><a href="./?view=google&amp;tab=<?= $k ?>"<?= $k === $tab ? ' aria-current="page"' : '' ?>><?= h($l) ?></a><?php endforeach ?></nav>

<?php if ($tab === 'arama'):
try { $d = gsc_dashboard(); $g = $d['range']; ?>
<div class="row between"><p class="muted small">Mülk: <code><?= h(gsc_site()) ?></code> · Son 28 gün: <?= tr_date($g['start']) ?> – <?= tr_date($g['end']) ?> (önceki: <?= tr_date($g['pstart']) ?> – <?= tr_date($g['pend']) ?>). Google'ın kesinleşmiş verisi 2-3 gün geriden gelir. Önbellek 6 saat; son çekim <?= h(tr_ago($d['fetched_at'])) ?>.</p>
<?= form_open('gsc_refresh', ['tab' => 'arama']) ?><button class="btn ghost" type="submit">Yenile</button></form></div>
<div class="kpis k4">
  <?= kpi('Tıklama', nf($d['tot']['clicks']) . ' ' . delta_html($d['tot']['clicks'], $d['ptot']['clicks'])) ?>
  <?= kpi('Gösterim', nf($d['tot']['impressions']) . ' ' . delta_html($d['tot']['impressions'], $d['ptot']['impressions'])) ?>
  <?= kpi('Tıklama oranı', '%' . nf($d['tot']['ctr'] * 100, 1) . ' ' . delta_html($d['tot']['ctr'], $d['ptot']['ctr'])) ?>
  <?= kpi('Ortalama sıra', nf($d['tot']['position'], 1) . ' ' . delta_html($d['tot']['position'], $d['ptot']['position'], true), 'küçük olan iyi') ?>
</div>
<?php $daily = []; foreach ($d['daily'] as $day => $v) if ($day >= $g['start']) $daily[$day] = $v; ?>
<div class="grid2">
  <section class="card"><h2>Günlük tıklama</h2><?= bar_chart(array_map(fn($v) => [$v[0], null], $daily), 'Gün', 'Tıklama', null, 'lbl_dm') ?></section>
  <section class="card"><h2>Günlük gösterim</h2><?= bar_chart(array_map(fn($v) => [$v[1], null], $daily), 'Gün', 'Gösterim', null, 'lbl_dm') ?></section>
</div>

<?php $tbl = function (array $rows, array $cols, int $lim = 25) { // $cols: [başlık => fn(row)]
    if (!$rows) return '<p class="muted">Veri yok.</p>';
    $s = '<div class="tw"><table><thead><tr>';
    foreach ($cols as $c => $f) $s .= '<th' . ($c[0] === '#' ? ' class="r"' : '') . '>' . h(ltrim($c, '#')) . '</th>';
    $s .= '</tr></thead><tbody>';
    foreach (array_slice($rows, 0, $lim) as $r) { $s .= '<tr>'; foreach ($cols as $c => $f) $s .= '<td' . ($c[0] === '#' ? ' class="r"' : '') . '>' . $f($r) . '</td>'; $s .= '</tr>'; }
    return $s . '</tbody></table></div>' . (count($rows) > $lim ? '<p class="muted small">İlk ' . $lim . ' / ' . count($rows) . ' satır.</p>' : '');
};
$num = ['#Gösterim' => fn($r) => nf($r['impressions']), '#Tık' => fn($r) => nf($r['clicks']), '#TO' => fn($r) => '%' . nf($r['ctr'] * 100, 1), '#Sıra' => fn($r) => nf($r['position'], 1)]; ?>
<section class="card"><h2>En çok gösterim alan sorgular</h2><?= $tbl($d['queries'], ['Sorgu' => fn($r) => h($r['keys'][0])] + $num) ?></section>
<section class="card"><h2>Fırsatlar <span class="muted small">(8–20. sıra: "2. sayfa")</span></h2>
  <p class="muted small">Bu sorgularda ilk sayfaya yakınsın. Sayfanın başlığını, açıklamasını ve metnini bu sorguya göre güçlendirmek en hızlı kazançtır.</p>
  <?= $tbl($d['opps'], ['Sorgu' => fn($r) => h($r['keys'][0]), 'Sayfa' => fn($r) => '<span class="path">' . h($rel($r['keys'][1])) . '</span>'] + $num) ?></section>
<section class="card"><h2>Sayfalar</h2><?= $tbl($d['pages'], ['Sayfa' => fn($r) => '<a class="path" href="' . h($r['keys'][0]) . '" target="_blank" rel="noopener">' . h($rel($r['keys'][0])) . '</a>'] + $num, 50) ?></section>
<div class="grid2">
  <section class="card"><h2>Ülke</h2><?= $tbl($d['countries'], ['Ülke' => fn($r) => h($cc($r['keys'][0]))] + $num, 15) ?></section>
  <section class="card"><h2>Cihaz</h2><?= $tbl($d['devices'], ['Cihaz' => fn($r) => h($dev($r['keys'][0]))] + $num) ?></section>
</div>
<?php } catch (Throwable $e) { echo '<div class="flash err">' . h(google_reason_tr($e)) . '</div>'; }

elseif ($tab === 'indeks'):
try {
    $s = inspect_summary();
    $groups = rows("SELECT coverage, COUNT(*) n FROM adm_inspect WHERE in_list = 1 AND checked_at IS NOT NULL GROUP BY coverage ORDER BY n DESC");
    $list = rows('SELECT * FROM adm_inspect WHERE in_list = 1 ORDER BY verdict = \'PASS\', checked_at IS NULL, url'); ?>
<div class="kpis k4">
  <?= kpi('Listede', nf($s['total']), 'site haritası + elle liste') ?>
  <?= kpi('Dizinde', nf($s['indexed'])) ?>
  <?= kpi('Dizinde değil', nf($s['notindexed'])) ?>
  <?= kpi('Bugünkü kota', nf(inspect_quota_used()) . ' / ' . nf((int)cfg('INSPECT_DAILY_QUOTA', 2000))) ?>
</div>
<div class="row"><?= form_open('inspect_run', ['tab' => 'indeks']) ?><button class="btn" type="submit">20 adres denetle</button></form>
<p class="muted small">Her basışta en fazla 20 adres: önce hiç denetlenmemişler, sonra en eski denetlenenler; son 7 günde denetlenenler atlanır. Liste: <code><?= h((string)cfg('INSPECT_SITEMAP', site_url() . '/sitemap.xml')) ?></code></p></div>
<?php if ($groups): ?>
<section class="card"><h2>Durumlara göre</h2><div class="tw"><table><thead><tr><th>Durum</th><th class="r">Adres</th><th>Ne demek?</th></tr></thead><tbody>
<?php foreach ($groups as $gr): ?><tr><td><?= h($gr['coverage'] ?? '—') ?></td><td class="r"><?= nf($gr['n']) ?></td><td class="small"><?= h(coverage_tr($gr['coverage'])) ?></td></tr><?php endforeach ?>
</tbody></table></div></section>
<?php endif ?>
<section class="card"><h2>Adresler</h2><div class="tw"><table class="small"><thead><tr><th>Adres</th><th>Sonuç</th><th>Durum</th><th>Son tarama</th><th>Google'ın canonical'ı</th><th>Denetlendi</th></tr></thead><tbody>
<?php foreach ($list as $r): $canonDiff = $r['google_canonical'] && rtrim($r['google_canonical'], '/') !== rtrim($r['url'], '/'); ?>
<tr<?= $r['error'] ? ' class="rowerr"' : '' ?>><td class="path"><a href="<?= h($r['url']) ?>" target="_blank" rel="noopener"><?= h($rel($r['url'])) ?></a></td>
<td><span class="pill <?= $r['verdict'] === 'PASS' ? 'ok' : ($r['verdict'] ? 'bad' : '') ?>"><?= h(verdict_tr($r['verdict'])) ?></span></td>
<td title="<?= h(coverage_tr($r['coverage'])) ?>"><?= h($r['coverage'] ?? '—') ?><?= $r['error'] ? '<br><span class="errtxt">' . h(mb_substr($r['error'], 0, 160)) . '</span>' : '' ?></td>
<td><?= tr_date($r['last_crawl']) ?></td>
<td class="path"><?= $r['google_canonical'] ? ($canonDiff ? '<b class="errtxt" title="Adresten farklı">≠ </b>' : '') . h($rel($r['google_canonical'])) : '—' ?></td>
<td><?= $r['checked_at'] ? h(tr_ago($r['checked_at'])) : '—' ?></td></tr>
<?php endforeach ?></tbody></table></div><?php if (!$list): ?><p class="muted">Henüz liste yok: "20 adres denetle"ye bas, liste site haritasından okunur.</p><?php endif ?></section>
<?php } catch (Throwable $e) { echo err_box($e, 'İndeks durumu okunamadı'); }

else:
try { $sm = gsc_sitemaps(); ?>
<section class="card"><h2>Gönderilen site haritaları</h2>
<?php if (!$sm): ?><p class="muted">Search Console'a gönderilmiş site haritası yok. Search Console → Site haritaları'ndan <code><?= h(site_url()) ?>/sitemap.xml</code> gönder.</p><?php else: ?>
<div class="tw"><table class="small"><thead><tr><th>Site haritası</th><th>Gönderildi</th><th>Son okuma</th><th class="r">Adres</th><th class="r">Hata</th><th class="r">Uyarı</th></tr></thead><tbody>
<?php foreach ($sm as $m): $cnt = 0; foreach ($m['contents'] ?? [] as $c) $cnt += (int)($c['submitted'] ?? 0); ?>
<tr><td class="path"><?= h($rel($m['path'])) ?><?= !empty($m['isPending']) ? ' <span class="pill">bekliyor</span>' : '' ?><?= !empty($m['isSitemapsIndex']) ? ' <span class="pill">dizin</span>' : '' ?></td>
<td><?= tr_date($m['lastSubmitted'] ?? null) ?></td><td><?= tr_date($m['lastDownloaded'] ?? null) ?></td><td class="r"><?= nf($cnt) ?></td>
<td class="r<?= (int)($m['errors'] ?? 0) ? ' errtxt' : '' ?>"><?= nf($m['errors'] ?? 0) ?></td><td class="r"><?= nf($m['warnings'] ?? 0) ?></td></tr>
<?php endforeach ?></tbody></table></div><?php endif ?>
<?= form_open('gsc_refresh', ['tab' => 'haritalar']) ?><button class="btn ghost" type="submit">Yenile</button></form>
</section>
<?php } catch (Throwable $e) { echo '<div class="flash err">' . h(google_reason_tr($e)) . '</div>'; }
endif;
