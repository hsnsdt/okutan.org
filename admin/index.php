<?php
// okutan.org yönetim paneli — tek giriş noktası.
//   GET  ./?view=<ekran>      ekranlar (admin/views/<ekran>.php; menü haritası lib/shell.php → adm_menu())
//   GET  ./?ajax=online       "şu an sitede" (JSON; panel 20 sn'de bir çeker)
//   GET  ./?dl=<yedek>        yedek indir
//   POST act=<eylem>          tüm eylemler aşağıdaki tek switch'ten geçer, flash yazar ve yönlendirir (PRG)
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/stats.php';
require __DIR__ . '/lib/google.php';
require __DIR__ . '/lib/notify.php';
require __DIR__ . '/lib/backup.php';
require __DIR__ . '/lib/system.php';
require __DIR__ . '/lib/cron.php';
require __DIR__ . '/lib/shell.php';

adm_boot();

// ---------------- POST eylemleri ----------------
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $act = (string)($_POST['act'] ?? '');
    $back = (string)($_POST['back'] ?? 'ozet');
    if (!isset(adm_views()[$back])) $back = 'ozet';
    if (!csrf_ok()) { flash('err', 'Oturum doğrulaması başarısız (CSRF). Sayfayı yenileyip tekrar dene.'); redirect_to($back); }
    if ($act === 'login') {
        $err = login_try((string)($_POST['pass'] ?? ''));
        if ($err !== null) flash('err', $err);
        redirect_to('ozet');
    }
    if ($act === 'hash') {
        if (cfg('ADMIN_PASS_HASH')) redirect_to('ozet');
        $p = (string)($_POST['pass'] ?? '');
        if (mb_strlen($p) < 10) flash('err', 'Şifre en az 10 karakter olmalı.');
        else $_SESSION['hash_out'] = password_hash($p, PASSWORD_DEFAULT);
        redirect_to('ozet');
    }
    if (!adm_authed()) { flash('err', 'Önce giriş yap.'); redirect_to('ozet'); }

    try {
        switch ($act) {
            case 'logout':
                $_SESSION = [];
                session_regenerate_id(true);
                flash('ok', 'Çıkış yapıldı.');
                redirect_to('ozet');
            case 'health_run':
                $res = health_run();
                $bad = array_filter($res, fn($r) => !$r['ok']);
                flash($bad ? 'err' : 'ok', $bad ? count($bad) . ' adreste sorun var.' : 'Tüm adresler sağlıklı (' . count($res) . ').');
                break;
            case 'backup_now':
                $r = backup_create();
                flash('ok', 'Yedek alındı: ' . basename($r['file']) . ' (' . $r['tables'] . ' tablo, ' . nf($r['rows']) . ' satır, ' . fmt_bytes((float)$r['size']) . ').');
                break;
            case 'log_clear':
                $f = (string)($_POST['file'] ?? '');
                if (!in_array($f, error_log_files(), true)) throw new RuntimeException('Bu günlük dosyası listede yok.');
                if (file_put_contents($f, '') === false) throw new RuntimeException('Günlük temizlenemedi (yazma izni yok): ' . $f);
                flash('ok', 'Günlük temizlendi: ' . $f);
                break;
            case 'cache_purge':
                cache_purge_header();
                flash('ok', 'LiteSpeed önbelleğine "tümünü temizle" komutu gönderildi. Kelime Bulucu sayfaları bir sonraki istekte yeniden üretilecek.');
                break;
            case 'gsc_refresh':
                setting_del('gsc:');
                setting_del('gsc_sitemaps:');
                setting_del('ga4:');
                setting_del('gtok_err:');
                gsc_dashboard(true);
                flash('ok', 'Google verisi yenilendi.');
                break;
            case 'inspect_run':
                $r = inspect_run(20);
                if ($r['error'] !== null) flash('err', 'Denetim yarıda kaldı: ' . $r['done'] . '/' . $r['total'] . ' adres tamamlandı.' . "\nHata: " . $r['error']);
                elseif ($r['total'] === 0) flash('ok', 'Denetlenecek adres yok: hepsi son 7 günde denetlendi (' . $r['skipped'] . ' adres).');
                else flash('ok', $r['done'] . ' adres denetlendi. Bugün kullanılan kota: ' . inspect_quota_used() . '/' . (int)cfg('INSPECT_DAILY_QUOTA', 2000) . '.');
                break;
            case 'tg_find':
                [$id, $why] = tg_find_chat();
                if ($id === null) flash('err', $why);
                else {
                    [$ok, $err] = notify_now('okutan.org yönetim paneli bağlandı. Bildirimler bu sohbete gelecek.');
                    flash($ok ? 'ok' : 'err', 'Sohbet bulundu' . ($why !== '' ? ' (' . $why . ')' : '') . ($ok ? '; deneme mesajı gönderildi.' : '; ama mesaj gönderilemedi: ' . $err));
                }
                break;
            case 'tg_test':
                [$ok, $err] = notify_now('okutan.org yönetim paneli: deneme mesajı (' . date('d.m.Y H:i') . ')');
                flash($ok ? 'ok' : 'err', $ok ? 'Deneme mesajı gönderildi.' : 'Gönderilemedi: ' . $err);
                break;
            case 'report_send':
                [$ok, $err] = notify_now(weekly_report());
                flash($ok ? 'ok' : 'err', $ok ? 'Haftalık rapor gönderildi.' : 'Gönderilemedi: ' . $err);
                break;
            case 'note_add':
            case 'note_update':
                $text = trim((string)($_POST['text'] ?? ''));
                $pri = max(1, min(3, (int)($_POST['priority'] ?? 2)));
                $due = preg_match('~^\d{4}-\d{2}-\d{2}$~', (string)($_POST['due'] ?? '')) ? $_POST['due'] : null;
                if ($text === '') throw new RuntimeException('Not metni boş olamaz.');
                if ($act === 'note_add') { q('INSERT INTO adm_notes (text, priority, due, created_at) VALUES (?, ?, ?, ?)', [mb_substr($text, 0, 2000), $pri, $due, now()]); flash('ok', 'Not eklendi.'); }
                else { q('UPDATE adm_notes SET text = ?, priority = ?, due = ? WHERE id = ?', [mb_substr($text, 0, 2000), $pri, $due, (int)($_POST['id'] ?? 0)]); flash('ok', 'Not kaydedildi.'); }
                break;
            case 'note_toggle':
                q('UPDATE adm_notes SET done = 1 - done, done_at = IF(done = 1, NULL, ?) WHERE id = ?', [now(), (int)($_POST['id'] ?? 0)]);
                break;
            case 'note_delete':
                q('DELETE FROM adm_notes WHERE id = ?', [(int)($_POST['id'] ?? 0)]);
                flash('ok', 'Not silindi.');
                break;
            default:
                flash('err', 'Bilinmeyen eylem: ' . $act);
        }
    } catch (Throwable $e) {
        adm_log("act $act: " . get_class($e) . ': ' . $e->getMessage());
        flash('err', ($e instanceof GoogleError ? google_reason_tr($e) : $e->getMessage()));
    }
    redirect_to($back, array_filter(['tab' => (string)($_POST['tab'] ?? '')]));
}

// ---------------- AJAX ve indirme ----------------
if (isset($_GET['ajax'])) {
    header('Content-Type: application/json; charset=utf-8');
    if (!adm_authed()) { http_response_code(403); exit('{"ok":false,"error":"auth"}'); }
    try {
        if ($_GET['ajax'] === 'online') {
            $o = st_online();
            foreach ($o['devs'] as &$d) $d['dev'] = val_tr('dev', $d['dev']);
            echo json_encode(['ok' => true] + $o, JSON_UNESCAPED_UNICODE);
        } else { http_response_code(404); echo '{"ok":false}'; }
    } catch (Throwable $e) {
        adm_log('ajax: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
    }
    exit;
}
if (isset($_GET['dl'])) {
    if (!adm_authed()) { http_response_code(403); exit; }
    $name = basename((string)$_GET['dl']);
    $d = priv_dir('yedek');
    if (!$d || !preg_match('~^okutan-\d{8}-\d{6}\.sql\.gz$~', $name) || !is_file($d . '/' . $name)) { http_response_code(404); exit('Yedek bulunamadı.'); }
    header('Content-Type: application/gzip');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Content-Length: ' . filesize($d . '/' . $name));
    readfile($d . '/' . $name);
    exit;
}

// ---------------- Giriş / kurulum ----------------
if (!adm_authed()) {
    page_head('Giriş', '', false);
    $hashOut = $_SESSION['hash_out'] ?? null;
    unset($_SESSION['hash_out']);
    if (!cfg_file_exists() || !cfg('ADMIN_PASS_HASH')) {
        echo '<section class="card narrow"><h1>Panel kurulumu</h1>';
        if (!cfg_file_exists()) echo '<p><code>admin/config.php</code> yok. <code>admin/config.example.php</code> dosyasını <code>config.php</code> adıyla kopyalayıp doldur.</p>';
        echo '<p>Panel şifresi henüz ayarlı değil. Aşağıya bir şifre yaz; panel onun <b>hash</b>\'ini üretir (hiçbir yere kaydetmez). Çıkan satırı <code>admin/config.php</code> içine yapıştır.</p>';
        if ($hashOut) echo '<p>config.php içine:</p><pre class="code">\'ADMIN_PASS_HASH\' => \'' . h($hashOut) . '\',</pre>';
        echo form_open('hash') . '<label>Yeni şifre (en az 10 karakter)<input type="password" name="pass" minlength="10" required autocomplete="new-password"></label><button class="btn" type="submit">Hash üret</button></form></section>';
    } else {
        echo '<section class="card narrow"><h1>Yönetim paneli</h1>' . form_open('login')
            . '<label>Şifre<input type="password" name="pass" required autofocus autocomplete="current-password"></label><button class="btn" type="submit">Giriş</button></form></section>';
    }
    page_foot();
    exit;
}

// ---------------- Ekranlar ----------------
$view = (string)($_GET['view'] ?? 'ozet');
$views = adm_views();
if (!isset($views[$view])) { http_response_code(404); $view = 'ozet'; flash('err', 'Böyle bir ekran yok.'); }
$GLOBALS['adm_view'] = $view;
page_head($views[$view], $view);
try {
    require __DIR__ . '/views/' . $view . '.php';
} catch (Throwable $e) {
    echo err_box($e, 'Ekran yüklenemedi');
}
page_foot();
