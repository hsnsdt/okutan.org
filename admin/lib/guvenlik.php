<?php
// Yönetim paneli — iki aşamalı giriş (Telegram kodu ya da doğrulayıcı uygulama / TOTP, RFC 6238) ve denetim kaydı.
// Ayar adm_settings'te: 2fa_mode ('' | telegram | totp), totp_secret (base32), totp_last (tekrar kullanımı önler).
// Kurtarma: config'te ADMIN_PASS_RESET => true iken iki aşamalı giriş de atlanır (config şifresiyle girilir).
declare(strict_types=1);

// ---------------- Denetim kaydı ----------------
function audit(string $act, string $detail = '', bool $ok = true): void
{
    try {
        q('INSERT INTO adm_audit (at, act, detail, ok, ip, sess) VALUES (?, ?, ?, ?, ?, ?)',
            [now(), mb_substr($act, 0, 32), mb_substr($detail, 0, 255), $ok ? 1 : 0, substr(ip_hash(), 0, 10), substr(hash('sha256', session_id() . '|' . stats_salt()), 0, 8)]);
        if (mt_rand(1, 100) === 1) q('DELETE FROM adm_audit WHERE at < ?', [date('Y-m-d H:i:s', time() - 400 * 86400)]);
    } catch (Throwable $e) { adm_log('Denetim kaydı yazılamadı: ' . $e->getMessage()); }
}
const AUDIT_TR = [
    'login' => 'Giriş', 'login_fail' => 'Hatalı giriş', 'login2' => 'İkinci adım', 'login2_fail' => 'Hatalı ikinci adım kodu', 'logout' => 'Çıkış',
    'pass_change' => 'Şifre değiştirildi', 'sessions_end' => 'Öbür oturumlar kapatıldı', 'twofa_on' => 'İki aşamalı giriş açıldı', 'twofa_off' => 'İki aşamalı giriş kapatıldı',
    'backup_now' => 'Yedek alındı', 'backup_dl' => 'Yedek indirildi', 'backup_tg' => "Yedek Telegram'a gönderildi", 'restore_test' => 'Geri yükleme denemesi',
    'duyuru_save' => 'Duyuru yayınlandı', 'duyuru_off' => 'Duyuru kaldırıldı', 'indexnow_send' => 'IndexNow bildirimi', 'cache_purge' => 'Önbellek temizlendi',
    'log_clear' => 'PHP günlüğü temizlendi', 'gsc_refresh' => 'Google verisi yenilendi', 'inspect_run' => 'URL denetimi', 'tg_test' => 'Telegram deneme',
    'report_send' => 'Rapor gönderildi', 'tg_find' => 'Telegram sohbeti bulundu', 'tg_hook' => 'Telegram düğmeleri', 'tg_mod' => 'Telegram\'dan moderasyon',
    'health_run' => 'Sağlık kontrolü', 'note_add' => 'Not eklendi', 'note_update' => 'Not düzenlendi', 'note_toggle' => 'Not işaretlendi', 'note_delete' => 'Not silindi',
];

// ---------------- TOTP ----------------
function b32_encode(string $bin): string
{
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 5) as $chunk) $out .= $a[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}
function b32_decode(string $s): string
{
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; $out = '';
    foreach (str_split(strtoupper(preg_replace('~[^A-Za-z2-7]~', '', $s))) as $c) $bits .= str_pad(decbin(strpos($a, $c)), 5, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}
function totp_code(string $secretB32, int $counter): string
{
    $h = hash_hmac('sha1', pack('N2', 0, $counter), b32_decode($secretB32), true);
    $o = ord($h[19]) & 0x0f;
    $v = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string)($v % 1000000), 6, '0', STR_PAD_LEFT);
}
/** ±30 sn tolerans; aynı kod iki kez kabul edilmez. */
function totp_verify(string $secretB32, string $code, bool $remember = true): bool
{
    $code = preg_replace('~\D~', '', $code);
    if (strlen($code) !== 6) return false;
    $now = intdiv(time(), 30);
    $last = (int)(setting_get('totp_last', true) ?? 0);
    foreach ([0, -1, 1] as $d) {
        $c = $now + $d;
        if ($c <= $last) continue;
        if (hash_equals(totp_code($secretB32, $c), $code)) { if ($remember) setting_set('totp_last', (string)$c); return true; }
    }
    return false;
}
function totp_uri(string $secretB32): string
{
    return 'otpauth://totp/' . rawurlencode(site_host() . ':yonetim') . '?secret=' . $secretB32 . '&issuer=' . rawurlencode(site_host()) . '&digits=6&period=30';
}

// ---------------- İki aşamalı giriş ----------------
function twofa_mode(): string
{
    if (cfg('ADMIN_PASS_RESET')) return '';
    try { $m = (string)(setting_get('2fa_mode', true) ?? ''); } catch (Throwable $e) { return ''; }
    return in_array($m, ['telegram', 'totp'], true) ? $m : '';
}
/** Şifre doğrulandıktan sonra: ikinci adım gerekiyorsa bekleyen oturumu başlatır (Telegram'a kod yollar). Dönüş: ikinci adım gerekiyor mu. */
function twofa_begin(): bool
{
    $m = twofa_mode();
    if ($m === '') return false;
    $_SESSION['pend'] = ['at' => time(), 'tries' => 0, 'mode' => $m];
    if ($m === 'telegram') {
        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $_SESSION['pend']['code'] = password_hash($code, PASSWORD_DEFAULT);
        [$ok, $err] = notify_now('okutan.org yönetim giriş kodu: ' . $code . "\n5 dakika geçerli. Sen giriş yapmıyorsan şifreni değiştir.");
        if (!$ok) { unset($_SESSION['pend']); throw new RuntimeException('Telegram kodu gönderilemedi: ' . $err . ' (kurtarma: config.php → ADMIN_PASS_RESET)'); }
    }
    return true;
}
/** İkinci adım kodu. Dönüş: null (başarılı) ya da hata. */
function twofa_finish(string $code): ?string
{
    $p = $_SESSION['pend'] ?? null;
    if (!$p || $p['at'] < time() - 300) { unset($_SESSION['pend']); return 'Süre doldu; şifreyle yeniden gir.'; }
    if (++$_SESSION['pend']['tries'] > 5) { unset($_SESSION['pend']); login_fail_add(); return 'Çok fazla hatalı kod; şifreyle yeniden gir.'; }
    $ok = $p['mode'] === 'totp'
        ? totp_verify((string)(setting_get('totp_secret', true) ?? ''), $code)
        : (isset($p['code']) && password_verify(preg_replace('~\D~', '', $code), $p['code']));
    if (!$ok) return 'Kod yanlış.';
    unset($_SESSION['pend']);
    return null;
}
