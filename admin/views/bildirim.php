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
    <?= form_open('backup_tg') ?><button class="btn ghost" type="submit"<?= $on ? '' : ' disabled' ?>>Son yedeği Telegram'a gönder</button></form>
  </div>
  <ul class="small">
    <li><b>Kesinti (15 dakikada bir, sunucudan):</b> önemli sayfalardan biri üst üste 2 kontrolde açılmazsa "🔴 açılmıyor", düzelince "✅ düzeldi" ve ne kadar sürdüğü.</li>
    <li><b>Kesinti (5 dakikada bir, dışarıdan):</b> bilgisayarındaki "okutan site izleme" görevi; sunucu tamamen giderse de haber verir (bilgisayar açıkken).</li>
    <li><b>Saatlik sağlık:</b> yalnızca durum değişince (yeni PHP hatası türü, 26 saatten eski yedek, çalışmayan cron).</li>
    <li><b>15 dakikada bir:</b> sohbette yeni şikâyet, Balon'da yeni şüpheli skor, sitede <?= (int)cfg('ALERT_ONLINE', 20) ?>+ kişi (ALERT_ONLINE).</li>
    <li><b>Her gece:</b> 20 adres indeks denetimi; dizinden düşen ya da giren adres olursa.</li>
    <li><b>Pazartesi:</b> 09:00 haftalık rapor; gece yedeğinin bir kopyası (<?= cfg('BACKUP_TELEGRAM', true) !== false ? 'açık' : 'kapalı' ?>, BACKUP_TELEGRAM).</li>
  </ul>
</section>
<section class="card">
  <h2>Telegram düğmeleri <span class="pill <?= setting_get('tg_hook', true) ? 'ok' : '' ?>"><?= setting_get('tg_hook', true) ? 'etkin' : 'kapalı' ?></span></h2>
  <p class="small">Etkinken sohbet şikâyeti uyarılarında <b>🙈 Gizle</b> ve <b>🔇 60 dk sustur</b> düğmeleri çıkar; panele girmeden Telegram'dan müdahale edersin. Düğmeler yalnızca senin sohbetinden basılınca çalışır.</p>
  <?= form_open('tg_hook') ?><button class="btn" type="submit"<?= notify_enabled() ? '' : ' disabled' ?>><?= setting_get('tg_hook', true) ? 'Yeniden etkinleştir' : 'Etkinleştir' ?></button></form>
</section>
<section class="card">
  <h2>Masaüstü bildirimi</h2>
  <p class="small">Panel bir sekmede açıkken yeni şikâyet, şüpheli skor ya da yeni JavaScript hatası olunca bu bilgisayarda bildirim çıkar; sekme başlığında sayı görünür (ör. "(2) Özet"). Panel kapalıyken Telegram uyarıları devam eder.</p>
  <div class="row"><button class="btn" type="button" id="notifBtn">Masaüstü bildirimlerini aç</button><span class="small muted" id="notifState"></span></div>
</section>
<section class="card"><h2>Haftalık rapor resmi <span class="muted small">(Telegram'a metinden önce gider)</span></h2>
  <img src="./?ajax=rapor_png" alt="Son 7 günün grafikli özeti" class="rapor-img" loading="lazy">
</section>
<section class="card"><div class="row between"><h2>Aylık rapor önizlemesi <span class="muted small">(her ayın 1'i 09:00)</span></h2><a class="btn ghost small" href="./?view=rapor">Yazdırılabilir rapor</a></div>
<?php try { ?><pre class="code wrapline"><?= h(monthly_report()) ?></pre><?php } catch (Throwable $e) { echo err_box($e, 'Aylık rapor hazırlanamadı'); } ?>
</section>
<section class="card"><h2>Haftalık rapor önizlemesi</h2>
<?php try { ?><pre class="code wrapline"><?= h(weekly_report()) ?></pre><?php } catch (Throwable $e) { echo err_box($e, 'Rapor hazırlanamadı'); } ?>
</section>
