<?php
// Oyun istatistikleri: oyun başına sayfa, başlayan/biten (sayaç olayları), sunucu kayıtları (biten oyun, masa), şu an oynanan masa;
// en çok oynayanlar, sohbet hacmi, Kelime Bulucu aramaları.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$gun = in_array((int)($_GET['gun'] ?? 7), [1, 7, 30], true) ? (int)($_GET['gun'] ?? 7) : 7;
$t = today(); $from = day_add($t, -($gun - 1));
$pct = fn($a, $b) => $b > 0 ? '%' . nf($a / $b * 100) : '—';
?>
<h1>Oyun istatistikleri</h1>
<nav class="tabs" aria-label="Dönem"><?php foreach ([1 => 'Bugün', 7 => '7 gün', 30 => '30 gün'] as $k => $l): ?><a href="./?view=oyunlar&amp;gun=<?= $k ?>"<?= $k === $gun ? ' aria-current="page"' : '' ?>><?= h($l) ?></a><?php endforeach ?></nav>

<?php try { $ev = game_event_stats($from, $t); $sv = game_server_stats($gun); ?>
<section class="card">
  <h2>Oyunlar</h2>
  <div class="tw"><table class="small">
    <thead><tr><th>Oyun</th><th class="r">Sayfa</th><th class="r" title="Tekil ziyaretçi">Başlayan</th><th class="r" title="Tekil ziyaretçi">Bitiren</th><th class="r">Bitirme</th><th class="r" title="Tekil ziyaretçi">Masa açan</th><th class="r" title="Tekil ziyaretçi">Katılan</th><th class="r" title="Sıralamaya giden oyun (sunucu)">Biten oyun</th><th class="r" title="Açılan online masa (sunucu)">Masa</th><th class="r" title="Son 5 dk'da hareket olan masa / Balon'da oynayan">Şu an</th></tr></thead>
    <tbody>
    <?php foreach (GAMES as $k => [$name, $path]): $e = $ev[$k]['ev']; $s = $sv[$k]; $start = $e['basla'][1]; ?>
      <tr><td><a href="<?= h($path) ?>" target="_blank" rel="noopener"><?= h($name) ?></a></td>
        <td class="r"><?= nf($ev[$k]['pv']) ?></td>
        <td class="r"><?= $start ? nf($start) : '—' ?></td>
        <td class="r"><?= $e['bitir'][1] ? nf($e['bitir'][1]) : '—' ?></td>
        <td class="r muted"><?= $pct($e['bitir'][1], $start) ?></td>
        <td class="r"><?= $e['masa'][1] ? nf($e['masa'][1]) : '—' ?></td>
        <td class="r"><?= $e['katil'][1] ? nf($e['katil'][1]) : '—' ?></td>
        <td class="r"><?= $s['oyun'] === null ? '—' : nf($s['oyun']) ?></td>
        <td class="r"><?= $s['masa'] === null ? '—' : nf($s['masa']) ?></td>
        <td class="r"><?= $s['aktif'] ? '<b>' . nf($s['aktif']) . '</b>' : '—' ?></td></tr>
    <?php endforeach ?>
    </tbody></table></div>
  <p class="muted small">Başlayan / bitiren / masa açan / katılan: tekil ziyaretçi (sayaç olayları, botlar ve yönetici hariç; sayaç kurulduğundan beri). Biten oyun ve masa: oyunların kendi sunucu kayıtları. Sudoku ve Gizli Kelime'de "bitiren" günün bulmacasını bitirendir.</p>
</section>
<?php } catch (Throwable $e) { echo err_box($e, 'Oyun istatistikleri okunamadı'); } ?>

<div class="grid2">
<section class="card"><h2>En çok oynayanlar <span class="muted small">(<?= $gun ?> gün, biten oyun)</span></h2>
<?php try { $tp = top_players($gun); if (!$tp): ?><p class="muted">Bu dönemde kayıt yok.</p><?php else: ?>
  <div class="tw"><table class="small"><tbody><?php foreach ($tp as $i => $p): arsort($p['g']); ?><tr><td class="muted"><?= $i + 1 ?></td><td><b><?= h($p['name']) ?></b><br><span class="muted"><?= h(implode(', ', array_map(fn($g, $n) => "$g $n", array_keys($p['g']), $p['g']))) ?></span></td><td class="r"><?= nf($p['n']) ?></td></tr><?php endforeach ?></tbody></table></div>
<?php endif; } catch (Throwable $e) { echo err_box($e, 'Oyuncular okunamadı'); } ?>
</section>
<section class="card"><h2>Canlı Sohbet <span class="muted small">(<?= $gun ?> gün)</span></h2>
<?php try { $c = chat_stats($gun); if (!$c): ?><p class="muted">Sohbet tabloları yok.</p><?php else: [, $gu] = st_sum('ev_sohbet_giris', $from, $t); [, $yu] = st_sum('ev_sohbet_yazdi', $from, $t); ?>
  <div class="kpis k2">
    <?= kpi('Mesaj', nf($c['mesaj']), nf($c['yazan']) . ' kişi yazdı') ?>
    <?= kpi('Şu an sohbette', $c['simdi'] === null ? '—' : nf($c['simdi']), $c['sikayet'] ? nf($c['sikayet']) . ' şikâyet' : 'şikâyet yok') ?>
  </div>
  <p class="small">Sohbete bağlanan <b><?= nf($gu) ?></b> ziyaretçiden <b><?= nf($yu) ?></b> tanesi yazdı (<?= $pct($yu, $gu) ?>).</p>
  <?php if ($c['kanal']): ?><div class="tw"><table class="small"><tbody><?php foreach ($c['kanal'] as $k): ?><tr><td>#<?= h($k['ch']) ?></td><td class="r"><?= nf($k['n']) ?></td></tr><?php endforeach ?></tbody></table></div><?php endif ?>
<?php endif; } catch (Throwable $e) { echo err_box($e, 'Sohbet okunamadı'); } ?>
</section>
</div>

<section class="card"><h2>Kelime Bulucu aramaları <span class="muted small">(<?= $gun ?> gün)</span></h2>
<?php try { $ws = word_searches($gun); if (!$ws): ?><p class="muted">Bu dönemde arama kaydı yok.</p><?php else: ?>
<div class="grid3">
<?php foreach (['x' => ['Sözlükte olmayan aramalar', 'Aranıyor ama sözlükte yok: yeni kelime ya da içerik fikri.'], 'g' => ['"Geçerli mi?" en çok aranan', ''], 'h' => ['Harflerden en çok aranan', '']] as $tp => [$title, $note]): $l = $ws[$tp] ?? []; ?>
  <div><h3><?= h($title) ?></h3><?= $note ? '<p class="muted small">' . h($note) . '</p>' : '' ?>
  <?php if (!$l): ?><p class="muted small">Kayıt yok<?= $tp === 'x' ? ' (bu sayım yeni eklendi)' : '' ?>.</p><?php else: ?>
  <ol class="hits small"><?php foreach (array_slice($l, 0, 15, true) as $q => $n): ?><li><?= $tp === 'g' ? '<a href="/kelime-bulucu/kelime/' . h(rawurlencode(strtr((string)$q, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u']))) . '/" target="_blank" rel="noopener">' . h($q) . '</a>' : h($q) ?> <span class="muted">· <?= nf($n) ?></span></li><?php endforeach ?></ol>
  <?php endif ?></div>
<?php endforeach ?>
</div>
<?php endif; } catch (Throwable $e) { echo err_box($e, 'Aramalar okunamadı'); } ?>
</section>
