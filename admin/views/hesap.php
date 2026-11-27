<?php
// Şifre ve oturum: panel şifresini değiştir (hash adm_settings'e yazılır, config.php'ye dokunulmaz), öbür oturumları kapat.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
?>
<h1>Şifre ve oturum</h1>
<?php $mode = twofa_mode(); $yeni = $_SESSION['totp_new'] ?? null; ?>
<section class="card">
  <h2>İki aşamalı giriş <span class="pill <?= $mode ? 'ok' : 'bad' ?>"><?= $mode === 'telegram' ? 'açık · Telegram kodu' : ($mode === 'totp' ? 'açık · doğrulayıcı uygulama' : 'kapalı') ?></span></h2>
  <p class="small">Açıkken girişte şifreden sonra 6 haneli bir kod sorulur; şifre ele geçse bile panele girilemez.</p>
  <?php if ($yeni): ?>
    <div class="flash warn">Doğrulayıcı uygulamada (Google Authenticator, Microsoft Authenticator, 1Password…) <b>Anahtarı elle gir</b>'i seç ve şunu yaz:<br>
      <code style="font-size:1.05rem;letter-spacing:.08em"><?= h(trim(chunk_split($yeni, 4, ' '))) ?></code><br><span class="small">Hesap adı: <?= h(site_host()) ?> · zaman tabanlı · 6 hane · 30 sn</span></div>
    <details class="tbl"><summary>otpauth bağlantısı (QR üreten bir uygulamaya yapıştırmak için)</summary><pre class="code wrapline"><?= h(totp_uri($yeni)) ?></pre></details>
    <?= form_open('twofa_totp_confirm', [], 'class="noteform"') ?><label class="grow">Uygulamadaki kod<input name="code" inputmode="numeric" maxlength="7" required autocomplete="one-time-code"></label><button class="btn" type="submit">Doğrula ve aç</button></form>
  <?php elseif (!$mode): ?>
    <div class="row wrap">
      <?= form_open('twofa_tg', [], 'class="noteform"') ?><label>Şifren<input type="password" name="pass" required autocomplete="current-password"></label><button class="btn" type="submit"<?= notify_enabled() ? '' : ' disabled' ?>>Telegram koduyla aç</button></form>
      <?= form_open('twofa_totp_start', [], 'class="noteform"') ?><label>Şifren<input type="password" name="pass" required autocomplete="current-password"></label><button class="btn ghost" type="submit">Doğrulayıcı uygulamayla kur</button></form>
    </div>
    <p class="muted small">Telegram yolu en kolayı: girişte bota 6 haneli kod gelir. Uygulama yolu Telegram'a bağlı değildir.</p>
  <?php else: ?>
    <?= form_open('twofa_off', [], 'class="noteform" data-confirm="İki aşamalı giriş kapatılsın mı?"') ?><label>Şifren<input type="password" name="pass" required autocomplete="current-password"></label><button class="btn ghost" type="submit">Kapat</button></form>
  <?php endif ?>
  <p class="muted small">Kodlara erişimini kaybedersen: config.php → <code>'ADMIN_PASS_RESET' => true</code> iken iki aşamalı giriş de atlanır.</p>
</section>
<div class="grid2">
<section class="card">
  <h2>Şifreyi değiştir</h2>
  <?= form_open('pass_change', [], 'autocomplete="off"') ?>
    <label>Mevcut şifre<input type="password" name="current" required autocomplete="current-password"></label>
    <label>Yeni şifre (en az 10 karakter)<input type="password" name="new" required minlength="10" autocomplete="new-password"></label>
    <label>Yeni şifre (tekrar)<input type="password" name="new2" required minlength="10" autocomplete="new-password"></label>
    <button class="btn" type="submit">Şifreyi değiştir</button>
  </form>
  <p class="muted small">Şifrenin geçerli kaynağı: <b><?= h(admin_hash_source()) ?></b>. Değiştirince öbür cihazlardaki oturumlar kapanır.</p>
</section>
<section class="card">
  <h2>Oturumlar</h2>
  <p class="small">Başka bir cihazda açık kalan panel oturumlarını kapatır (bu oturum açık kalır).</p>
  <?= form_open('sessions_end', [], 'data-confirm="Bu oturum dışındaki bütün oturumlar kapatılsın mı?"') ?><button class="btn ghost" type="submit">Öbür oturumları kapat</button></form>
  <h3>Şifreyi unutursan</h3>
  <ol class="steps small">
    <li><code>admin/config.php</code> içine <code>'ADMIN_PASS_RESET' => true,</code> yaz.</li>
    <li>Config'teki şifreyle (ilk kurulum şifresi) gir; panelde belirlenen şifre silinir.</li>
    <li>Buradan yeni şifre belirle ve <code>ADMIN_PASS_RESET</code> satırını kaldır.</li>
  </ol>
  <p class="muted small">Oturum 12 saat işlem yapılmazsa kapanır. 15 dakikada 5 hatalı deneme o IP'yi 15 dakika kilitler.</p>
</section>
</div>
