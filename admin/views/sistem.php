<?php
// Sistem: sağlık kontrolü, PHP hata günlüğü, veritabanı, yedekler, cron durumu, ayar anahtarları, önbellek.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$tab = in_array($_GET['tab'] ?? '', ['genel', 'hatalar', 'jshata', 'veritabani', 'yedek', 'denetim'], true) ? $_GET['tab'] : 'genel';
?>
<h1>Sistem</h1>
<nav class="tabs"><?php foreach (['genel' => 'Genel', 'hatalar' => 'PHP hataları', 'jshata' => 'JS hataları', 'veritabani' => 'Veritabanı', 'yedek' => 'Yedekler', 'denetim' => 'Denetim kaydı'] as $k => $l): ?><a href="./?view=sistem&amp;tab=<?= $k ?>"<?= $k === $tab ? ' aria-current="page"' : '' ?>><?= h($l) ?></a><?php endforeach ?></nav>
<?php foreach (path_warnings() as $w): ?><div class="flash err"><?= h($w) ?></div><?php endforeach ?>

<?php if ($tab === 'genel'): ?>
<section class="card"><div class="row between"><h2>Sağlık kontrolü</h2><?= form_open('health_run', ['tab' => 'genel']) ?><button class="btn" type="submit">Şimdi kontrol et</button></form></div>
<?php try { $hl = health_last(); if (!$hl): ?><p class="muted">Henüz kontrol yapılmadı.</p><?php else: ?>
<p class="muted small">Son kontrol: <?= h(tr_ago($hl['at'])) ?> · Adresler config.php → HEALTH_URLS</p>
<div class="tw"><table class="small"><thead><tr><th>Adres</th><th class="r">HTTP</th><th class="r">Süre</th><th>Sonuç</th></tr></thead><tbody>
<?php foreach ($hl['res'] as $r): ?><tr><td class="path"><?= h($r['url']) ?></td><td class="r"><?= (int)$r['code'] ?></td><td class="r"><?= nf($r['ms']) ?> ms</td><td><span class="pill <?= $r['ok'] ? 'ok' : 'bad' ?>"><?= $r['ok'] ? 'Sağlıklı' : 'Sorunlu' ?></span> <?= h($r['why']) ?></td></tr><?php endforeach ?>
</tbody></table></div><?php endif; } catch (Throwable $e) { echo err_box($e, 'Sağlık sonucu okunamadı'); } ?>
</section>

<section class="card"><h2>Oyun testi <span class="muted small">(gerçek tarayıcıda, bilgisayardaki zamanlanmış görevden)</span></h2>
<?php try { $e2 = json_decode((string)(setting_get('e2e_last', true) ?? ''), true); if (!$e2): ?>
  <p class="muted">Henüz sonuç gelmedi. Bilgisayardaki "okutan oyun testi" görevi her gece çalışır; bilgisayar kapalıysa o gün atlanır. Elle: <code>node tools/oyun-testi.mjs</code></p>
<?php else: ?>
  <p class="muted small">Son test: <?= h(tr_ago($e2['at'])) ?> (<?= h(tr_date($e2['at'], true)) ?>)<?= strtotime($e2['at']) < time() - 3 * 86400 ? ' · <b class="errtxt">3 günden eski: bilgisayar kapalı mı?</b>' : '' ?></p>
  <div class="tw"><table class="small"><thead><tr><th>Oyun</th><th>Sonuç</th><th class="r">Süre</th><th>Ayrıntı</th></tr></thead><tbody>
  <?php foreach ($e2['res'] as $r): ?><tr class="<?= $r['ok'] ? '' : 'rowerr' ?>"><td><?= h(game_name_of($r['oyun'])) ?></td><td><span class="pill <?= $r['ok'] ? 'ok' : 'bad' ?>"><?= $r['ok'] ? 'çalışıyor' : 'BOZUK' ?></span></td><td class="r"><?= nf($r['ms']) ?> ms</td><td class="msg"><?= h($r['hata']) ?></td></tr><?php endforeach ?>
  </tbody></table></div>
<?php endif; } catch (Throwable $e) { echo err_box($e, 'Oyun testi okunamadı'); } ?>
</section>

<section class="card"><h2>Cron durumu</h2>
<?php try { $cs = cron_status(); ?>
<div class="tw"><table class="small"><thead><tr><th>İş</th><th>Zamanlama</th><th>Son çalışma</th><th>Sonuç</th></tr></thead><tbody>
<?php foreach ($cs as $k => $c): ?><tr><td><?= h($c['label']) ?></td><td><code><?= h($c['sched']) ?></code></td>
<td><?= $c['last'] ? h(tr_date($c['last'], true)) . ' <span class="muted">(' . h(tr_ago($c['last'])) . ')</span>' : '—' ?></td>
<td><?php if (!$c['last'] && !$c['stale']): ?><span class="pill">ilk çalışma bekleniyor</span><?php elseif ($c['stale']): ?><span class="pill bad"><?= $c['last'] ? 'son ' . $c['hours'] . ' saattir çalışmadı' : 'hiç çalışmadı' ?></span><?php elseif ($c['status'] === 'error'): ?><span class="pill bad">hata</span><?php elseif ($c['status'] === 'running'): ?><span class="pill">çalışıyor</span><?php else: ?><span class="pill ok">tamam</span><?php endif ?> <span class="small"><?= h(mb_substr($c['message'], 0, 300)) ?></span></td></tr><?php endforeach ?>
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

<?php elseif ($tab === 'denetim'):
try { $au = rows('SELECT * FROM adm_audit ORDER BY id DESC LIMIT 200'); ?>
<section class="card"><h2>Denetim kaydı <span class="muted small">(son 200; 400 gün saklanır)</span></h2>
<?php if (!$au): ?><p class="muted">Henüz kayıt yok.</p><?php else: ?>
<div class="tw"><table class="small"><thead><tr><th>Zaman</th><th>İşlem</th><th>Ayrıntı</th><th>Oturum</th><th>IP (özet)</th></tr></thead><tbody>
<?php foreach ($au as $a): ?><tr class="<?= $a['ok'] ? '' : 'rowerr' ?>"><td class="nowrap"><?= h(date('d.m H:i:s', strtotime($a['at']))) ?></td><td><?= h(AUDIT_TR[$a['act']] ?? $a['act']) ?><?= $a['ok'] ? '' : ' <span class="pill bad">başarısız</span>' ?></td>
<td class="msg"><?= h($a['detail']) ?></td><td><code><?= h($a['sess']) ?></code></td><td><code><?= h($a['ip']) ?></code></td></tr><?php endforeach ?>
</tbody></table></div><?php endif ?>
<p class="muted small">IP adresi açık tutulmaz; tuzlu özetin ilk 10 hanesi aynı bağlantıyı ayırt etmeye yeter.</p>
</section>
<?php } catch (Throwable $e) { echo err_box($e, 'Denetim kaydı okunamadı'); }

elseif ($tab === 'jshata'):
try { $je = js_errors(200); ?>
<section class="card"><div class="row between"><h2>Ziyaretçilerin tarayıcısındaki JavaScript hataları</h2><a class="csv" href="./?csv=jshata">CSV</a></div>
<p class="muted small">Yalnızca kendi dosyalarımızdan gelen hatalar (eklenti ve başka site hataları, ağ kopmaları sayılmaz); ziyaretçi başına sayfada en çok 5. Yeni hata türü 15 dakika içinde Telegram'a gelir.</p>
<?php if (!$je): ?><p class="okline">Kayıtlı JavaScript hatası yok.</p><?php else: ?>
<div class="tw"><table class="small"><thead><tr><th>Mesaj</th><th>Dosya:satır</th><th class="r">Sayı</th><th>Son sayfa · tarayıcı</th><th>İlk</th><th>Son</th></tr></thead><tbody>
<?php foreach ($je as $e): $yeni = strtotime($e['first_seen']) > time() - 86400; ?><tr class="<?= $yeni ? 'rowerr' : '' ?>">
<td class="msg"><?= h($e['msg']) ?></td><td class="path"><?= h($e['src']) ?>:<?= (int)$e['line'] ?></td><td class="r"><?= nf($e['n']) ?></td>
<td class="small"><span class="path"><?= h($e['last_path']) ?></span><br><span class="muted"><?= h($e['last_br'] . ' · ' . $e['last_os'] . ' · ' . val_tr('dev', $e['last_dev'])) ?></span></td>
<td><?= h(date('d.m H:i', strtotime($e['first_seen']))) ?></td><td><?= h(tr_ago($e['last_seen'])) ?></td></tr><?php endforeach ?>
</tbody></table></div><?php endif ?>
</section>
<?php } catch (Throwable $e) { echo err_box($e, 'JS hataları okunamadı'); }

elseif ($tab === 'hatalar'):
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
<h3>Geri yükleme denemesi <span class="muted small">(her Pazar gecesi; deneme veritabanı <code><?= h(restore_test_db()) ?></code>)</span></h3>
<?php $rl = json_decode((string)(setting_get('restore_last', true) ?? ''), true); ?>
<p class="small"><?= $rl ? '<span class="pill ' . ($rl['ok'] ? 'ok' : 'bad') . '">' . ($rl['ok'] ? 'sağlam' : 'sorunlu') . '</span> ' . h(tr_ago($rl['at'])) . ': ' . h($rl['msg']) : '<span class="muted">Henüz denenmedi.</span>' ?></p>
<?= form_open('restore_test', ['tab' => 'yedek']) ?><button class="btn ghost" type="submit">Şimdi dene</button></form>
<p class="muted small">Son yedek ayrı bir deneme veritabanına açılır, tablo ve satır sayıları yedek alınırkenkiyle karşılaştırılır, sonra deneme tabloları silinir. Ana veritabanına dokunulmaz.</p>
<details class="tbl"><summary>Geri yükleme</summary><p class="small">Geri yükleme yalnızca komut satırından yapılır (yanlışlıkla basılmasın diye panelde düğme yok): cPanel → Terminal:</p>
<pre class="code">php <?= h(str_replace('\\', '/', ADM_DIR)) ?>/cron/geri-yukle.php okutan-YYYYMMDD-HHMMSS.sql.gz</pre></details>
</section>
<?php } catch (Throwable $e) { echo err_box($e, 'Yedekler okunamadı'); }
endif;
