<?php
// Balon Patlat — meydan okuma bağlantısı (/balon/meydan.php?id=kod)
// WhatsApp, X, Telegram gibi uygulamalar bu sayfanın meta etiketlerinden önizleme üretir:
// "Ali Balon Patlat'ta 4.320 puan yaptı! Geçebilir misin?" + skora özel görsel.
// İnsan ziyaretçi anında oyuna (/balon/?meydan=kod) yönlendirilir.
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');

$id = $_GET['id'] ?? '';
if (!is_string($id) || !preg_match('/^[0-9a-z]{1,10}$/', $id)) { header('Location: /balon/', true, 302); exit; }

$name = null; $score = null;
$cfgFile = __DIR__ . '/api/config.php';
if (is_file($cfgFile)) {
    $cfg = require $cfgFile;
    try {
        $db = new PDO('mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4', $cfg['db_user'], $cfg['db_pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $st = $db->prepare('SELECT name, score FROM bp_scores WHERE id = ? AND flag = 0 AND mode = ?');
        $st->execute([(int)base_convert($id, 36, 10), 'classic']);
        if ($r = $st->fetch()) { $name = $r['name']; $score = number_format((int)$r['score'], 0, ',', '.'); }
    } catch (Throwable $e) {}
}

$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$target = '/balon/?meydan=' . $id;
$title = $name ? "$name Balon Patlat'ta $score puan yaptı! Geçebilir misin?" : 'Balon Patlat — Ücretsiz Online Balon Patlatma Oyunu';
$desc = $name ? 'Aynı tahtayı oyna, skoru geç. Ücretsiz, tarayıcıda, üyeliksiz.' : 'Aynı renkten üç balonu birleştir, patlat, liderlik tablosuna gir.';
$img = $name ? 'https://okutan.org/balon/api/og.php?id=' . $id : 'https://okutan.org/balon/og.png';
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $h($title) ?></title>
<meta name="robots" content="noindex">
<meta name="description" content="<?= $h($desc) ?>">
<link rel="canonical" href="https://okutan.org/balon/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="okutan.org">
<meta property="og:locale" content="tr_TR">
<meta property="og:title" content="<?= $h($title) ?>">
<meta property="og:description" content="<?= $h($desc) ?>">
<meta property="og:url" content="https://okutan.org/balon/meydan.php?id=<?= $h($id) ?>">
<meta property="og:image" content="<?= $h($img) ?>">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@okutanapp">
<meta name="twitter:title" content="<?= $h($title) ?>">
<meta name="twitter:description" content="<?= $h($desc) ?>">
<meta name="twitter:image" content="<?= $h($img) ?>">
<meta http-equiv="refresh" content="0;url=<?= $h($target) ?>">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#121212;color:#f4f4f2;font:600 18px system-ui,sans-serif}a{color:#ff5a1f}</style>
</head>
<body>
<p><a href="<?= $h($target) ?>">Oyuna git →</a></p>
<script>location.replace(<?= json_encode($target) ?>);</script>
</body>
</html>
