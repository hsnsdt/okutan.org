<?php
// Site duyurusu: bütün sayfalarda sol altta küçük kutu (assets/oyunlar.js okur, assets/duyuru.json). Sayfalara dokunulmaz.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$d = duyuru_read();
$aktif = !empty($d['active']) && (empty($d['until']) || $d['until'] >= today());
?>
<h1>Duyuru</h1>
<div class="grid2">
<section class="card">
  <h2>Yeni duyuru</h2>
  <?= form_open('duyuru_save') ?>
    <label>Metin (en çok 160 karakter)<input name="text" maxlength="160" required value="<?= h($aktif ? ($d['text'] ?? '') : '') ?>" placeholder="ör. Yeni oyun: King! Arkadaşınla online oyna."></label>
    <label>Bağlantı (isteğe bağlı)<input name="link" value="<?= h($aktif ? ($d['link'] ?? '') : '') ?>" placeholder="/king/"></label>
    <label>Bağlantı yazısı<input name="linkText" maxlength="30" value="<?= h($aktif ? ($d['linkText'] ?? '') : '') ?>" placeholder="Göz at"></label>
    <label>Son gün (isteğe bağlı)<input type="date" name="until" min="<?= h(today()) ?>" value="<?= h($aktif ? ($d['until'] ?? '') : '') ?>"></label>
    <button class="btn" type="submit">Yayınla</button>
  </form>
  <p class="muted small">Her ziyaretçi bir duyuruyu en çok 3 sayfada görür; kapatırsa ya da bağlantıya tıklarsa bir daha görmez. Metni değiştirip yayınlamak yeni duyuru sayılır, herkese yeniden gösterilir.</p>
</section>
<section class="card">
  <h2>Şu an <span class="pill <?= $aktif ? 'ok' : '' ?>"><?= $aktif ? 'yayında' : 'duyuru yok' ?></span></h2>
  <?php if ($aktif): ?>
  <div class="toastprev"><span><?= h($d['text']) ?></span><?php if (!empty($d['link'])): ?> <b><?= h(($d['linkText'] ?? '') ?: 'Göz at') ?> →</b><?php endif ?></div>
  <p class="small muted">Yayın: <?= h(tr_date($d['at'] ?? null, true)) ?><?= !empty($d['until']) ? ' · son gün ' . h(tr_date($d['until'])) : '' ?><?= !empty($d['link']) ? ' · bağlantı <code>' . h($d['link']) . '</code>' : '' ?></p>
  <?= form_open('duyuru_off', [], 'data-confirm="Duyuru kaldırılsın mı?"') ?><button class="btn ghost" type="submit">Kaldır</button></form>
  <?php else: ?><p class="muted">Sitede şu an duyuru gösterilmiyor.</p><?php endif ?>
  <p class="muted small">Oyunların service worker'ı duyuru dosyasını bir açılış gecikmeyle tazeleyebilir: bazı ziyaretçiler ilk açılışta eskisini, ikincide yenisini görür.</p>
</section>
</div>
