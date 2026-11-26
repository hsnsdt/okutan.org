<?php
// Şifre ve oturum: panel şifresini değiştir (hash adm_settings'e yazılır, config.php'ye dokunulmaz), öbür oturumları kapat.
declare(strict_types=1);
if (!defined('ADM_DIR')) exit; // yalnızca admin/index.php içinden
?>
<h1>Şifre ve oturum</h1>
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
