<?php
// Yönetim paneli — ortak kabuk: oturum, giriş, CSRF, flash (PRG), menü haritası, sayfa başı/sonu.
// Yeni ekran eklemek = adm_menu()'ye bir satır + admin/views/<ad>.php. Gerekirse admin/index.php'deki act switch'ine eylem.
declare(strict_types=1);

/** Menü haritası: grup => [view => etiket]. Rozet sayıları attention_items()'tan (o ekrana bağlanan iş sayısı). */
function adm_menu(): array
{
    return [
        'Genel' => ['ozet' => 'Özet', 'trafik' => 'Trafik', 'google' => 'Google arama'],
        'Site' => ['sistem' => 'Sistem', 'bildirim' => 'Bildirimler', 'notlar' => 'Notlar', 'ara' => 'Arama'],
    ];
}
/** Diğer yönetim sayfaları (ayrı uygulamalar). */
function adm_links(): array
{
    return ['/balon/yonetim/' => 'Balon yönetimi', '/sohbet/yonetim/' => 'Sohbet yönetimi', '/' => 'Siteye git'];
}
function adm_views(): array { $v = []; foreach (adm_menu() as $items) $v += $items; return $v; }

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

/** Giriş denemesi. Dönüş: null (başarılı) ya da hata metni. */
function login_try(string $pass): ?string
{
    $hash = (string)cfg('ADMIN_PASS_HASH', '');
    if ($hash === '') return 'Panel şifresi ayarlı değil.';
    if (login_fail_count() >= 5) return 'Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.';
    if (!password_verify($pass, $hash)) {
        login_fail_add();
        usleep(300000);
        return 'Şifre yanlış.';
    }
    login_clear();
    session_regenerate_id(true);
    $_SESSION['adm'] = 1;
    $_SESSION['seen'] = time();
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return null;
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
<link rel="stylesheet" href="./panel.css?v=4">
<script nonce="<?= h($n) ?>">try { localStorage.setItem('ok_admin_optout', '1'); } catch (e) {}</script>
</head>
<body>
<?php if ($menu): ?>
<header class="bar">
  <a class="brand" href="./">okutan.org <span>yönetim</span></a>
  <form class="search" method="get" action="./" role="search"><input type="hidden" name="view" value="ara"><input id="q" type="search" name="q" placeholder="Ara ( / )" value="<?= h($view === 'ara' ? ($_GET['q'] ?? '') : '') ?>" aria-label="Panelde ara"></form>
  <?= form_open('logout', [], 'class="out"') ?><button type="submit" class="btn ghost">Çıkış</button></form>
</header>
<div class="layout">
<nav class="side" aria-label="Panel menüsü">
<?php foreach (adm_menu() as $group => $items): ?>
  <div class="grp"><?= h($group) ?></div>
  <ul><?php foreach ($items as $k => $label): ?><li><a href="./?view=<?= h($k) ?>"<?= $k === $view ? ' aria-current="page"' : '' ?>><?= h($label) ?><?php if (!empty($badges[$k])): ?> <b class="badge"><?= h($badges[$k]) ?></b><?php endif ?></a></li><?php endforeach ?></ul>
<?php endforeach ?>
  <div class="grp">Bağlantılar</div>
  <ul><?php foreach (adm_links() as $u => $l): ?><li><a href="<?= h($u) ?>"><?= h($l) ?></a></li><?php endforeach ?></ul>
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
<script nonce="<?= h(adm_nonce()) ?>" src="./panel.js?v=1"></script>
</body>
</html>
<?php
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
