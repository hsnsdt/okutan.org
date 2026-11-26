<?php
// Bildirimler: Telegram ayarı, deneme mesajı, haftalık raporu şimdi gönder, rapor önizlemesi.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
$on = notify_enabled();
?>
<h1>Bildirimler</h1>
<section class="card">
  <h2>Telegram <span class="pill <?= $on ? 'ok' : 'bad' ?>"><?= $on ? 'ayarlı' : 'ayarlı değil' ?></span></h2>
  <?php if (!$on): ?>
  <ol class="steps">
    <li>Telegram'da <b>@BotFather</b>'a yaz: <code>/newbot</code> → ad ver → verdiği <b>token</b>'ı <code>admin/config.php</code> → <code>'TELEGRAM_BOT_TOKEN' => '…'</code> satırına yaz.<?= cfg('TELEGRAM_BOT_TOKEN') ? ' <span class="pill ok">yapıldı</span>' : '' ?></li>
    <li>Telegram'da botunu aç ve ona bir mesaj yaz (ör. <code>/start</code>).</li>
    <li>Aşağıdaki <b>Sohbeti bul</b>'a bas: panel sohbet kimliğini bulup kaydeder ve deneme mesajı yollar.</li>
  </ol>
  <?php if (cfg('TELEGRAM_BOT_TOKEN')): ?><div class="row"><?= form_open('tg_find') ?><button class="btn" type="submit">Sohbeti bul</button></form></div><?php endif ?>
  <?php endif ?>
  <div class="row wrap">
    <?= form_open('tg_test') ?><button class="btn" type="submit"<?= $on ? '' : ' disabled' ?>>Deneme mesajı gönder</button></form>
    <?= form_open('report_send') ?><button class="btn ghost" type="submit"<?= $on ? '' : ' disabled' ?>>Haftalık raporu şimdi gönder</button></form>
  </div>
  <p class="muted small">Saatlik sağlık cron'u yalnızca durum değişince yazar (sayfa çöktü / düzeldi, yeni PHP hatası türü, 26 saatten eski yedek, çalışmayan cron). Haftalık rapor Pazartesi 09:00'da gelir.</p>
</section>
<section class="card"><h2>Haftalık rapor önizlemesi</h2>
<?php try { ?><pre class="code wrapline"><?= h(weekly_report()) ?></pre><?php } catch (Throwable $e) { echo err_box($e, 'Rapor hazırlanamadı'); } ?>
</section>
