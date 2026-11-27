<?php
// Yönetim paneli — ortak kabuk: oturum, giriş, CSRF, flash (PRG), menü haritası, sayfa başı/sonu.
// Yeni ekran eklemek = adm_menu()'ye bir satır + admin/views/<ad>.php. Gerekirse admin/index.php'deki act switch'ine eylem.
declare(strict_types=1);

/** Menü haritası: grup => [view => etiket]. Rozet sayıları attention_items()'tan (o ekrana bağlanan iş sayısı). */
function adm_menu(): array
{
    return [
        'Genel' => ['ozet' => 'Özet', 'trafik' => 'Trafik', 'hiz' => 'Hız', 'google' => 'Google arama'],
        'Oyunlar' => ['oyunlar' => 'Oyun istatistikleri', 'balon' => 'Balon Patlat', 'sohbet' => 'Canlı Sohbet'],
        'Site' => ['sistem' => 'Sistem', 'duyuru' => 'Duyuru', 'bildirim' => 'Bildirimler', 'notlar' => 'Notlar', 'ara' => 'Arama', 'hesap' => 'Şifre ve oturum'],
    ];
}
/** Menü ikonları (24×24 çizgi, currentColor). */
function adm_icon(string $k): string
{
    static $d = [
        'ozet' => '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
        'trafik' => '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/>',
        'google' => '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
        'oyunlar' => '<rect x="2" y="7" width="20" height="12" rx="4"/><path d="M7 11v4M5 13h4"/><circle cx="16" cy="12" r="1"/><circle cx="18" cy="14" r="1"/>',
        'balon' => '<path d="M12 3a6 6 0 0 0-6 6c0 4 3.5 7 6 8 2.5-1 6-4 6-8a6 6 0 0 0-6-6z"/><path d="M12 17v4"/>',
        'sohbet' => '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
        'sistem' => '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
        'bildirim' => '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
        'notlar' => '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
        'ara' => '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/>',
        'hesap' => '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        'site' => '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
        'hiz' => '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
        'duyuru' => '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a3 3 0 0 1 0 6M19 6a7 7 0 0 1 0 12"/>',
        'tema' => '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
        'cikis' => '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    ];
    return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' . ($d[$k] ?? $d['site']) . '</svg>';
}
/** Menünün altındaki dış bağlantılar. */
function adm_links(): array
{
    return ['/' => 'Siteye git'];
}
function adm_views(): array { $v = []; foreach (adm_menu() as $items) $v += $items; return $v + ['oyun' => 'Oyun ayrıntısı', 'rapor' => 'Aylık rapor']; }
/** Balon (scope 'admin') ve Sohbet ('sohbet-admin') API'lerinin beklediği 12 saatlik yönetim jetonu; API'deki imzayla aynı. */
function game_admin_token(string $scope): ?string
{
    $c = db_config();
    if (empty($c['admin_pass'])) return null;
    $exp = time() + 12 * 3600;
    return $exp . '.' . hash_hmac('sha256', (string)$exp, ($c['salt'] ?? '') . '|' . $scope . '|' . $c['admin_pass']);
}

function adm_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}
function adm_is_local(): bool
{
    $h = strtolower(preg_replace('~:\d+$~', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
    return in_array($h, ['localhost', '127.0.0.1', '[::1]'], true);
}
/** Panelin adres kökü (ör. /admin/); yönlendirme ve form hedefi için. */
function adm_base(): string { return rtrim(strtr(dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/admin/index.php')), '\\', '/'), '/') . '/'; }
function adm_nonce(): string { static $n = null; return $n ??= base64_encode(random_bytes(16)); }

function adm_boot(): void
{
    // HTTPS zorunlu (yerel deneme hariç).
    if (!adm_is_https() && !adm_is_local()) {
        header('Location: https://' . ($_SERVER['HTTP_HOST'] ?? site_host()) . ($_SERVER['REQUEST_URI'] ?? '/admin/'), true, 301);
        exit;
    }
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: same-origin');
    header("Content-Security-Policy: default-src 'self'; script-src 'nonce-" . adm_nonce() . "'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'self'; base-uri 'none'");
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('okadm');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/admin/', 'secure' => adm_is_https(), 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
    if (!empty($_SESSION['adm']) && ($_SESSION['seen'] ?? 0) < time() - 12 * 3600) { $_SESSION = []; session_regenerate_id(true); }
    if (!empty($_SESSION['adm']) && ($_SESSION['pv'] ?? '0') !== pass_ver()) { $_SESSION = []; session_regenerate_id(true); }
    if (!empty($_SESSION['adm'])) $_SESSION['seen'] = time();
}
function adm_authed(): bool { return !empty($_SESSION['adm']); }

function csrf_token(): string { return $_SESSION['csrf'] ??= bin2hex(random_bytes(32)); }
function csrf_ok(): bool { return isset($_POST['csrf'], $_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$_POST['csrf']); }
/** Form başlangıcı (gizli csrf + act). $id verilirse dışarıdaki alanlar form="id" ile bağlanabilir. */
function form_open(string $act, array $hidden = [], string $attrs = ''): string
{
    $hidden += ['back' => $GLOBALS['adm_view'] ?? 'ozet'];
    $s = '<form method="post" action="' . h(adm_base()) . '"' . ($attrs ? ' ' . $attrs : '') . '><input type="hidden" name="csrf" value="' . h(csrf_token()) . '"><input type="hidden" name="act" value="' . h($act) . '">';
    foreach ($hidden as $k => $v) $s .= '<input type="hidden" name="' . h($k) . '" value="' . h($v) . '">';
    return $s;
}

function flash(string $type, string $msg): void { $_SESSION['flash'][] = [$type, $msg]; }
function flash_take(): array { $f = $_SESSION['flash'] ?? []; unset($_SESSION['flash']); return $f; }
function redirect_to(string $view = 'ozet', array $q = []): void
{
    header('Location: ' . adm_base() . '?' . http_build_query(['view' => $view] + $q), true, 303);
    exit;
}

// ---- Giriş ve kaba kuvvet kilidi (IP hash'i; 15 dk içinde 5 hata = 15 dk kilit). DB yoksa dosyaya yazar. ----
function ip_hash(): string { return hash('sha256', stats_salt() . '|adm|' . ($_SERVER['REMOTE_ADDR'] ?? '')); }
function login_attempts_file(): string { return work_dir('durum') . '/giris.json'; }
function login_fail_count(): int
{
    $since = date('Y-m-d H:i:s', time() - 900);
    try { return (int)val('SELECT COUNT(*) FROM adm_login WHERE ip_hash = ? AND at >= ?', [ip_hash(), $since]); }
    catch (DbError $e) {
        $d = json_decode((string)@file_get_contents(login_attempts_file()), true) ?: []; // dosya yoksa boş
        return count(array_filter($d[ip_hash()] ?? [], fn($t) => $t >= time() - 900));
    }
}
function login_fail_add(): void
{
    try { q('INSERT INTO adm_login (ip_hash, at) VALUES (?, ?)', [ip_hash(), now()]); }
    catch (DbError $e) {
        $f = login_attempts_file();
        $d = json_decode((string)@file_get_contents($f), true) ?: [];
        $d[ip_hash()] = array_values(array_filter(array_merge($d[ip_hash()] ?? [], [time()]), fn($t) => $t >= time() - 900));
        file_put_contents($f, json_encode($d), LOCK_EX);
    }
}
function login_clear(): void { try { q('DELETE FROM adm_login WHERE ip_hash = ?', [ip_hash()]); } catch (DbError $e) { /* DB yoksa dosyadaki kayıt 15 dk'da düşer */ } }

/**
 * Geçerli şifre hash'i: panelden değiştirildiyse adm_settings'teki, yoksa config'teki ADMIN_PASS_HASH.
 * ADMIN_PASS_RESET => true iken panelde belirlenen şifre yok sayılır (unutulursa kurtarma); config şifresiyle girince silinir.
 * Veritabanına ulaşılamazsa config'teki hash geçerlidir (panel teşhis için açılabilsin).
 */
function admin_hash(): string
{
    if (!cfg('ADMIN_PASS_RESET')) {
        try { $h = setting_get('admin_pass_hash', true); if ($h) return $h; } catch (Throwable $e) { /* DB yok: config */ }
    }
    return (string)cfg('ADMIN_PASS_HASH', '');
}
function admin_hash_source(): string
{
    if (cfg('ADMIN_PASS_RESET')) return 'config (ADMIN_PASS_RESET açık)';
    try { if (setting_get('admin_pass_hash', true)) return 'panel'; } catch (Throwable $e) { return 'config (veritabanına ulaşılamadı)'; }
    return 'config';
}
/** Şifre sürümü: değişince (şifre değişti / öbür oturumlar kapatıldı) eski oturumlar düşer. */
function pass_ver(): string { try { return (string)(setting_get('admin_pass_ver', true) ?? '0'); } catch (Throwable $e) { return '0'; } }
function pass_ver_bump(): string { $v = (string)((int)pass_ver() + 1); setting_set('admin_pass_ver', $v); return $v; }

/** Giriş denemesi. Dönüş: null (başarılı) ya da hata metni. */
function login_try(string $pass): ?string
{
    $hash = admin_hash();
    if ($hash === '') return 'Panel şifresi ayarlı değil.';
    if (login_fail_count() >= 5) return 'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.';
    if (!password_verify($pass, $hash)) {
        login_fail_add();
        usleep(300000);
        return 'Şifre yanlış.';
    }
    login_clear();
    if (cfg('ADMIN_PASS_RESET')) {
        try { setting_del('admin_pass_hash'); pass_ver_bump(); flash('ok', "Panelde belirlenen şifre silindi; config şifresiyle girdin. Yeni şifre belirle ve config.php'den ADMIN_PASS_RESET satırını kaldır."); }
        catch (Throwable $e) { /* DB yok: zaten config şifresi geçerli */ }
    }
    session_regenerate_id(true);
    if (twofa_begin()) return '__2fa__'; // ikinci adım bekleniyor (Telegram kodu ya da uygulama)
    login_finalize();
    return null;
}
/** Girişi tamamla (şifre ve gerekiyorsa ikinci adım doğrulandıktan sonra). */
function login_finalize(): void
{
    session_regenerate_id(true);
    $_SESSION['pv'] = pass_ver();
    $_SESSION['adm'] = 1;
    $_SESSION['seen'] = time();
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

// ---- Sayfa iskeleti ----
function page_head(string $title, string $view = '', bool $menu = true): void
{
    $n = adm_nonce();
    $GLOBALS['adm_layout'] = $menu;
    $badges = [];
    if ($menu) {
        try { foreach (attention_items() as $a) { $badges[$a[2]] = ($badges[$a[2]] ?? 0) + 1; $badges['ozet'] = ($badges['ozet'] ?? 0) + 1; } }
        catch (Throwable $e) { $badges['sistem'] = '!'; }
    }
    ?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title><?= h($title) ?> · Yönetim</title>
<link rel="icon" href="/favicon.svg">
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="./panel.css?v=8">
<script nonce="<?= h($n) ?>">try { localStorage.setItem('ok_admin_optout', '1'); var t = localStorage.getItem('theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}</script>
</head>
<body>
<?php if ($menu): ?>
<header class="bar">
  <a class="brand" href="./"><span class="dot" aria-hidden="true">o</span>okutan.org <span class="sub">yönetim</span></a>
  <form class="search" method="get" action="./" role="search"><input type="hidden" name="view" value="ara"><input id="q" type="search" name="q" placeholder="Ara ( / )" value="<?= h($view === 'ara' ? ($_GET['q'] ?? '') : '') ?>" aria-label="Panelde ara"></form>
  <button type="button" class="iconbtn" id="themeBtn" aria-label="Açık / koyu tema" title="Açık / koyu tema"><?= adm_icon('tema') ?></button>
  <?= form_open('logout', [], 'class="out"') ?><button type="submit" class="iconbtn" aria-label="Çıkış" title="Çıkış"><?= adm_icon('cikis') ?></button></form>
</header>
<div class="layout">
<nav class="side" aria-label="Panel menüsü">
<?php foreach (adm_menu() as $group => $items): ?>
  <div class="grp"><?= h($group) ?></div>
  <ul><?php foreach ($items as $k => $label): ?><li><a href="./?view=<?= h($k) ?>"<?= $k === $view ? ' aria-current="page"' : '' ?>><?= adm_icon($k) ?><span class="lbl"><?= h($label) ?></span><?php if (!empty($badges[$k])): ?><b class="badge"><?= h($badges[$k]) ?></b><?php endif ?></a></li><?php endforeach ?></ul>
<?php endforeach ?>
  <div class="grp">Bağlantılar</div>
  <ul><?php foreach (adm_links() as $u => $l): ?><li><a href="<?= h($u) ?>" target="_blank" rel="noopener"><?= adm_icon('site') ?><span class="lbl"><?= h($l) ?></span></a></li><?php endforeach ?></ul>
</nav>
<main class="main">
<?php else: ?>
<main class="main solo">
<?php endif;
    foreach (flash_take() as [$t, $m]) echo '<div class="flash ' . h($t) . '" role="status">' . nl2br(h($m)) . '</div>';
}
function page_foot(): void
{
    ?>
</main>
<?= !empty($GLOBALS['adm_layout']) ? '</div>' : '' ?>
<script nonce="<?= h(adm_nonce()) ?>" src="./panel.js?v=5"></script>
</body>
</html>
<?php
}
/**
 * Oyun yönetimleri (Balon, Sohbet) panelin içinde: mevcut yönetim sayfası aynı kökenden iframe'de açılır,
 * API'nin beklediği 12 saatlik yönetim jetonunu panel üretir (ortak config: salt + admin_pass; imza API'dekiyle aynı),
 * panel.js jetonu sessionStorage'a yazar, sonra iframe'i yükler. Böylece ikinci şifre sorulmaz.
 */
function embed_admin(string $title, string $src, string $storeKey, string $scope, string $siteUrl, string $siteLabel): void
{
    $c = db_config();
    echo '<div class="row between"><h1>' . h($title) . '</h1><a href="' . h($siteUrl) . '" target="_blank" rel="noopener">' . h($siteLabel) . ' ↗</a></div>';
    if (empty($c['admin_pass'])) {
        echo '<div class="flash err">Oyun yönetimi kapalı: balon/api/config.php içinde <code>admin_pass</code> boş.</div>';
        return;
    }
    $tok = (string)game_admin_token($scope);
    echo '<iframe class="embed" data-src="' . h($src) . '" data-key="' . h($storeKey) . '" data-tok="' . h($tok) . '" title="' . h($title) . ' yönetimi"></iframe>';
}

/** Görünümde hata kutusu (hata yutulmaz: mesaj ekranda ve günlükte). */
function err_box(Throwable $e, string $what = ''): string
{
    adm_log(($what ? $what . ': ' : '') . get_class($e) . ': ' . $e->getMessage());
    return '<div class="flash err">' . ($what ? '<b>' . h($what) . '</b>: ' : '') . h($e->getMessage()) . '</div>';
}
function kpi(string $label, string $value, string $sub = ''): string
{
    return '<div class="kpi"><div class="kl">' . h($label) . '</div><div class="kv">' . $value . '</div>' . ($sub !== '' ? '<div class="ks">' . $sub . '</div>' : '') . '</div>';
}
