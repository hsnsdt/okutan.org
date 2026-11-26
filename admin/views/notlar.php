<?php
// Notlar / yapılacaklar. Her satırın alanları tablonun dışındaki formlara form="..." ile bağlanır (iç içe form yok).
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$show = ($_GET['goster'] ?? '') === 'hepsi';
$list = rows('SELECT * FROM adm_notes WHERE ' . ($show ? '1' : 'done = 0') . ' ORDER BY done, due IS NULL, due, priority, id DESC');
$pri = [1 => 'Yüksek', 2 => 'Normal', 3 => 'Düşük'];
$t = today();
?>
<h1>Notlar</h1>
<section class="card">
  <h2>Yeni not</h2>
  <?= form_open('note_add', [], 'class="noteform"') ?>
    <label class="grow">Metin<input name="text" required maxlength="2000"></label>
    <label>Öncelik<select name="priority"><?php foreach ($pri as $k => $l): ?><option value="<?= $k ?>"<?= $k === 2 ? ' selected' : '' ?>><?= h($l) ?></option><?php endforeach ?></select></label>
    <label>Son tarih<input type="date" name="due"></label>
    <button class="btn" type="submit">Ekle</button>
  </form>
</section>
<section class="card">
  <div class="row between"><h2><?= $show ? 'Tüm notlar' : 'Açık notlar' ?></h2><a href="./?view=notlar<?= $show ? '' : '&amp;goster=hepsi' ?>"><?= $show ? 'Yalnızca açıklar' : 'Tamamlananları da göster' ?></a></div>
  <?php if (!$list): ?><p class="muted">Not yok.</p><?php else: ?>
  <?php foreach ($list as $n): $id = (int)$n['id']; ?>
    <?= form_open('note_update', ['id' => $id], 'id="nu' . $id . '"') ?></form>
    <?= form_open('note_toggle', ['id' => $id], 'id="nt' . $id . '"') ?></form>
    <?= form_open('note_delete', ['id' => $id], 'id="nd' . $id . '" data-confirm="Not silinsin mi?"') ?></form>
  <?php endforeach ?>
  <div class="tw"><table class="notes"><thead><tr><th></th><th>Metin</th><th>Öncelik</th><th>Son tarih</th><th></th></tr></thead><tbody>
  <?php foreach ($list as $n): $id = (int)$n['id']; $late = !$n['done'] && $n['due'] && $n['due'] < $t; ?>
    <tr class="<?= $n['done'] ? 'done' : '' ?><?= $late ? ' rowerr' : '' ?>">
      <td><button class="chk" type="submit" form="nt<?= $id ?>" aria-label="<?= $n['done'] ? 'Geri al' : 'Tamamlandı' ?>"><?= $n['done'] ? '✓' : '' ?></button></td>
      <td><input form="nu<?= $id ?>" name="text" value="<?= h($n['text']) ?>" required maxlength="2000" aria-label="Metin"></td>
      <td><select form="nu<?= $id ?>" name="priority" aria-label="Öncelik"><?php foreach ($pri as $k => $l): ?><option value="<?= $k ?>"<?= $k === (int)$n['priority'] ? ' selected' : '' ?>><?= h($l) ?></option><?php endforeach ?></select></td>
      <td><input form="nu<?= $id ?>" type="date" name="due" value="<?= h($n['due'] ?? '') ?>" aria-label="Son tarih"></td>
      <td class="nowrap"><button class="btn small" type="submit" form="nu<?= $id ?>">Kaydet</button> <button class="btn ghost small" type="submit" form="nd<?= $id ?>">Sil</button></td>
    </tr>
  <?php endforeach ?></tbody></table></div><?php endif ?>
</section>
