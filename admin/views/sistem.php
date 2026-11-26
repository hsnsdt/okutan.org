<?php
// Sistem: sağlık kontrolü, PHP hata günlüğü, veritabanı, yedekler, cron durumu, ayar anahtarları, önbellek.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$tab = in_array($_GET['tab'] ?? '', ['genel', 'hatalar', 'veritabani', 'yedek'], true) ? $_GET['tab'] : 'genel';
?>
<h1>Sistem</h1>
<nav class="tabs"><?php foreach (['genel' => 'Genel', 'hatalar' => 'PHP hataları', 'veritabani' => 'Veritabanı', 'yedek' => 'Yedekler'] as $k => $l): ?><a href="./?view=sistem&amp;tab=<?= $k ?>"<?= $k === $tab ? ' aria-current="page"' : '' ?>><?= h($l) ?></a><?php endforeach ?></nav>
<?php foreach (path_warnings() as $w): ?><div class="flash err"><?= h($w) ?></div><?php endforeach ?>

<?php if ($tab === 'genel'): ?>
<section class="card"><div class="row between"><h2>Sağlık kontrolü</h2><?= form_open('health_run', ['tab' => 'genel']) ?><button class="btn" type="submit">Şimdi kontrol et</button></form></div>
<?php try { $hl = health_last(); if (!$hl): ?><p class="muted">Henüz kontrol yapılmadı.</p><?php else: ?>
<p class="muted small">Son kontrol: <?= h(tr_ago($hl['at'])) ?> · Adresler config.php → HEALTH_URLS</p>
<div class="tw"><table class="small"><thead><tr><th>Adres</th><th class="r">HTTP</th><th class="r">Süre</th><th>Sonuç</th></tr></thead><tbody>
<?php foreach ($hl['res'] as $r): ?><tr><td class="path"><?= h($r['url']) ?></td><td class="r"><?= (int)$r['code'] ?></td><td class="r"><?= nf($r['ms']) ?> ms</td><td><span class="pill <?= $r['ok'] ? 'ok' : 'bad' ?>"><?= $r['ok'] ? 'Sağlıklı' : 'Sorunlu' ?></span> <?= h($r['why']) ?></td></tr><?php endforeach ?>
</tbody></table></div><?php endif; } catch (Throwable $e) { echo err_box($e, 'Sağlık sonucu okunamadı'); } ?>
</section>

<section class="card"><h2>Cron durumu</h2>
<?php try { $cs = cron_status(); ?>
<div class="tw"><table class="small"><thead><tr><th>İş</th><th>Zamanlama</th><th>Son çalışma</th><th>Sonuç</th></tr></thead><tbody>
<?php foreach ($cs as $k => $c): ?><tr><td><?= h($c['label']) ?></td><td><code><?= h($c['sched']) ?></code></td>
<td><?= $c['last'] ? h(tr_date($c['last'], true)) . ' <span class="muted">(' . h(tr_ago($c['last'])) . ')</span>' : '—' ?></td>
<td><?php if ($c['stale']): ?><span class="pill bad"><?= $c['last'] ? 'son ' . $c['hours'] . ' saattir çalışmadı' : 'hiç çalışmadı' ?></span><?php elseif ($c['status'] === 'error'): ?><span class="pill bad">hata</span><?php elseif ($c['status'] === 'running'): ?><span class="pill">çalışıyor</span><?php else: ?><span class="pill ok">tamam</span><?php endif ?> <span class="small"><?= h(mb_substr($c['message'], 0, 300)) ?></span></td></tr><?php endforeach ?>
</tbody></table></div>
<details class="tbl"><summary>cPanel → Cron Jobs satırları</summary>
<p class="small">Komut satırına (CLI) şunları gir. <code>~/logs</code> klasörünü bir kez oluştur.</p>
<pre class="code"><?php foreach ($cs as $k => $c) echo h($c['sched'] . ' /usr/local/bin/php -d display_errors=1 ' . str_replace('\\', '/', ADM_DIR) . '/cron/' . $c['script'] . ' >> $HOME/logs/okutan-' . $k . '.log 2>&1') . "\n"; ?></pre>
<p class="small">HTTP ile tetiklemek için: <code><?= h(site_url()) ?>/admin/cron/saglik.php?key=CRON_KEY</code> (anahtarsız istek 403 alır).</p></details>
<?php } catch (Throwable $e) { echo err_box($e, 'Cron durumu okunamadı'); } ?>
</section>

<div class="grid2">
<section class="card"><h2>Ayar anahtarları</h2><p class="muted small">admin/config.php — değerler gösterilmez.</p>
<ul class="keys"><?php foreach (config_keys() as $k => $set): ?><li><span class="<?= $set ? 'yes' : 'no' ?>"><?= $set ? '✓' : '✗' ?></span> <code><?= h($k) ?></code></li><?php endforeach ?></ul></section>
<section class="card"><h2>Önbellek</h2>
<p class="small">Kelime Bulucu sayfaları sunucunun LiteSpeed önbelleğinden gelir (1 gün). Veri ya da tasarım değişince temizle.</p>
<?= form_open('cache_purge', ['tab' => 'genel'], 'data-confirm="Tüm LiteSpeed önbelleği temizlensin mi?"') ?><button class="btn" type="submit">Önbelleği temizle</button></form>
<p class="muted small">Tarayıcı önbelleği ve oyunların service worker'ı bu düğmeyle temizlenmez; onlar için dosyalardaki <code>?v=N</code> sürümü artırılır.</p>
<h3>Sunucu</h3><ul class="keys small"><li>PHP <?= h(PHP_VERSION) ?></li><li>Saat dilimi: <?= h(date_default_timezone_get()) ?> (<?= h(date('d.m.Y H:i')) ?>)</li>
<li>Web kökü: <code><?= h(str_replace('\\', '/', SITE_ROOT)) ?></code></li><li>Gizli klasör: <code><?= h((string)(priv_dir() ?? '—')) ?></code><?= cfg('PRIVATE_DIR') ? '' : ' (otomatik)' ?></li></ul></section>
</div>

<?php elseif ($tab === 'hatalar'):
try { $files = error_log_files(); $gr = error_log_groups(); ?>
<section class="card"><h2>PHP hata günlüğü</h2>
<p class="muted small">Okunan dosyalar (her birinin son 2 MB'ı): <?= $files ? implode(', ', array_map(fn($f) => '<code>' . h(str_replace(str_replace('\\', '/', SITE_ROOT), '', str_replace('\\', '/', $f))) . '</code>', $files)) : 'yok' ?></p>
<?php if (!$gr): ?><p class="okline">Günlükte hata yok.</p><?php else: ?>
<div class="tw"><table class="small"><thead><tr><th>Tür</th><th>Mesaj</th><th class="r">Sayı</th><th>İlk</th><th>Son</th></tr></thead><tbody>
<?php foreach (array_slice($gr, 0, 200) as $g): ?><tr class="<?= is_fatal($g['level']) ? 'rowerr' : '' ?>"><td><?= h(level_tr($g['level'])) ?></td><td class="msg"><?= h($g['msg']) ?><br><span class="muted"><?= h(basename(dirname($g['file'])) . '/' . basename($g['file'])) ?></span></td>
<td class="r"><?= nf($g['count']) ?></td><td><?= $g['first'] ? h(date('d.m H:i', $g['first'])) : '—' ?></td><td><?= $g['last'] ? h(date('d.m H:i', $g['last'])) : '—' ?></td></tr><?php endforeach ?>
</tbody></table></div><?php endif ?>
<?php if ($files): ?><h3>Günlüğü temizle</h3><div class="row wrap"><?php foreach ($files as $f): ?>
<?= form_open('log_clear', ['file' => $f, 'tab' => 'hatalar'], 'data-confirm="Bu günlük dosyası boşaltılsın mı?"') ?><button class="btn ghost small" type="submit"><?= h(basename(dirname($f)) . '/' . basename($f)) ?></button></form><?php endforeach ?></div><?php endif ?>
</section>
<?php } catch (Throwable $e) { echo err_box($e, 'Hata günlüğü okunamadı'); }

elseif ($tab === 'veritabani'):
try { $t = db_sizes(); $sum = array_sum(array_column($t, 'size')); ?>
<section class="card"><h2>Veritabanı <span class="muted small">toplam <?= fmt_bytes((float)$sum) ?>, <?= count($t) ?> tablo</span></h2>
<div class="tw"><table class="small"><thead><tr><th>Tablo</th><th class="r">Satır (yaklaşık)</th><th class="r">Boyut</th><th>Yedekte</th></tr></thead><tbody>
<?php foreach ($t as $r): ?><tr><td><code><?= h($r['name']) ?></code></td><td class="r"><?= nf($r['row_count']) ?></td><td class="r"><?= fmt_bytes((float)$r['size']) ?></td><td class="muted"><?= backup_skip_data($r['name']) ? 'yalnızca yapı' : 'tam' ?></td></tr><?php endforeach ?>
</tbody></table></div></section>
<?php } catch (Throwable $e) { echo err_box($e, 'Tablo boyutları okunamadı'); }

else:
try { $bl = backup_list(); ?>
<section class="card"><div class="row between"><h2>Yedekler</h2><?= form_open('backup_now', ['tab' => 'yedek']) ?><button class="btn" type="submit">Şimdi yedek al</button></form></div>
<p class="muted small">Saf PHP ile gzip'li SQL; klasör: <code><?= h((string)(priv_dir('yedek') ?? 'PRIVATE_DIR ayarlı değil')) ?></code>. Son <?= (int)cfg('BACKUP_KEEP', 7) ?> yedek tutulur; geçici tabloların yalnızca yapısı yazılır.</p>
<?php if (!$bl): ?><p class="muted">Henüz yedek yok.</p><?php else: ?>
<div class="tw"><table class="small"><thead><tr><th>Dosya</th><th>Tarih</th><th class="r">Boyut</th><th></th></tr></thead><tbody>
<?php foreach ($bl as $b): ?><tr><td><code><?= h($b['file']) ?></code></td><td><?= h(date('d.m.Y H:i', $b['time'])) ?> <span class="muted">(<?= h(tr_ago(date('Y-m-d H:i:s', $b['time']))) ?>)</span></td><td class="r"><?= fmt_bytes((float)$b['size']) ?></td><td><a href="./?dl=<?= h(rawurlencode($b['file'])) ?>">İndir</a></td></tr><?php endforeach ?>
</tbody></table></div><?php endif ?>
<details class="tbl"><summary>Geri yükleme</summary><p class="small">Geri yükleme yalnızca komut satırından yapılır (yanlışlıkla basılmasın diye panelde düğme yok): cPanel → Terminal:</p>
<pre class="code">php <?= h(str_replace('\\', '/', ADM_DIR)) ?>/cron/geri-yukle.php okutan-YYYYMMDD-HHMMSS.sql.gz</pre></details>
</section>
<?php } catch (Throwable $e) { echo err_box($e, 'Yedekler okunamadı'); }
endif;
