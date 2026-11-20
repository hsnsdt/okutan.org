<?php
/* Kelime Bulucu — kelimeye özel paylaşım görseli (1200×630 PNG, GD). /kelime-bulucu/og.php?k=<ascii-adres>
   Önbellek: veri/og/<adres>.png (klasör yazılabilirse). GD yoksa genel og.png'ye yönlendirir. */
require __DIR__ . '/ortak.php';
$slug = preg_replace('/[^a-z0-9-]/', '', (string)($_GET['k'] ?? ''));
$w = $slug !== '' ? Sozluk::kelime($slug) : null;
if (!$w || !function_exists('imagecreatetruecolor') || !function_exists('imagettftext')) { header('Location: /kelime-bulucu/og.png', true, 302); exit; }
$onb = KB_DIR . '/veri/og'; $dosya = "$onb/$slug.png";
header('Content-Type: image/png');
header('Cache-Control: public, max-age=604800');
if (is_file($dosya) && filemtime($dosya) >= filemtime(KB_DIR . '/og.php')) { readfile($dosya); exit; }

$F5 = KB_DIR . '/veri/font/Roboto-500.ttf'; $F7 = KB_DIR . '/veri/font/Roboto-700.ttf'; $F9 = KB_DIR . '/veri/font/Roboto-900.ttf';
$W = 1200; $H = 630; $im = imagecreatetruecolor($W, $H);
imagealphablending($im, true); imageantialias($im, true);
$rgb = fn($h, $a = 0) => imagecolorallocatealpha($im, hexdec(substr($h, 1, 2)), hexdec(substr($h, 3, 2)), hexdec(substr($h, 5, 2)), $a);
// zemin: koyu yeşil eğim
for ($y = 0; $y < $H; $y++) { $t = $y / $H; imageline($im, 0, $y, $W, $y, imagecolorallocate($im, (int)(11 + 2 * $t), (int)(42 + 32 * $t), (int)(33 + 24 * $t))); }
function yuv($im, $x, $y, $w, $h, $r, $c) {
  imagefilledrectangle($im, (int)($x + $r), (int)$y, (int)($x + $w - $r), (int)($y + $h), $c);
  imagefilledrectangle($im, (int)$x, (int)($y + $r), (int)($x + $w), (int)($y + $h - $r), $c);
  foreach ([[$x + $r, $y + $r], [$x + $w - $r, $y + $r], [$x + $r, $y + $h - $r], [$x + $w - $r, $y + $h - $r]] as [$cx, $cy]) imagefilledellipse($im, (int)$cx, (int)$cy, (int)(2 * $r), (int)(2 * $r), $c);
}
function yazi($im, $boy, $font, $x, $y, $c, $s, $hiza = 'sol') {
  $b = imagettfbbox($boy, 0, $font, $s); $gen = $b[2] - $b[0];
  if ($hiza === 'orta') $x -= $gen / 2; elseif ($hiza === 'sag') $x -= $gen;
  imagettftext($im, $boy, 0, (int)$x, (int)$y, $c, $font, $s); return $gen;
}
$beyaz = $rgb('#ffffff'); $acik = $rgb('#9fd9c4'); $krem = $rgb('#fbfaf5'); $kremAlt = $rgb('#d6e8e0'); $yesil = $rgb('#0a8462'); $golge = $rgb('#000000', 90);

// üst: marka
yuv($im, 60, 52, 54, 54, 14, $rgb('#14b688'));
yazi($im, 30, $F9, 87, 92, $beyaz, 'K', 'orta');
yazi($im, 26, $F7, 130, 90, $beyaz, 'Kelime Bulucu');
yazi($im, 20, $F5, 1140, 88, $acik, 'okutan.org', 'sag');

// harf taşları
$hs = harfler($w); $n = count($hs);
$bosluk = 14; $ts = (int)min(118, floor((1080 - $bosluk * ($n - 1)) / $n));
$gen = $n * $ts + ($n - 1) * $bosluk; $x0 = (int)(($W - $gen) / 2); $y0 = 170;
foreach ($hs as $i => $c) {
  $x = $x0 + $i * ($ts + $bosluk);
  yuv($im, $x + 3, $y0 + 9, $ts, $ts, $ts * .18, $golge);
  yuv($im, $x, $y0, $ts, $ts, $ts * .18, $kremAlt);
  yuv($im, $x, $y0, $ts, $ts - $ts * .08, $ts * .18, $krem);
  yazi($im, (int)($ts * .48), $F9, $x + $ts / 2, $y0 + $ts * .68, $yesil, tr_upper($c), 'orta');
  yazi($im, (int)max(10, $ts * .16), $F7, $x + $ts - $ts * .1, $y0 + $ts * .86, $yesil, (string)(PUAN[$c] ?? 0), 'sag');
}
// puan rozeti
$p = puan($w); $k = kat($p); $renk = [1 => '#7c8796', 2 => '#0f9d76', 3 => '#f2700f', 4 => '#f2b51d'][$k];
$py = $y0 + $ts + 50;
$ps = "$p puan"; $b = imagettfbbox(28, 0, $F9, $ps); $pg = $b[2] - $b[0] + 44;
$bilgi = count($hs) . ' harf  ·  ' . implode('-', hece($w));
$b2 = imagettfbbox(26, 0, $F7, $bilgi); $bg = $b2[2] - $b2[0];
$toplam = $pg + 24 + $bg; $sx = (int)(($W - $toplam) / 2);
yuv($im, $sx, $py, $pg, 58, 16, $rgb($renk));
yazi($im, 28, $F9, $sx + $pg / 2, $py + 41, $k === 4 ? $rgb('#4a3300') : $beyaz, $ps, 'orta');
yazi($im, 26, $F7, $sx + $pg + 24, $py + 40, $beyaz, $bilgi);
// anlam (en çok 2 satır)
$a = anlam_ilk($w);
if ($a) {
  $kel = preg_split('/\s+/', $a); $sat = ['']; $max = 1040;
  foreach ($kel as $k2) {
    $den = trim(end($sat) . ' ' . $k2); $bb = imagettfbbox(26, 0, $F5, $den);
    if ($bb[2] - $bb[0] > $max) { if (count($sat) === 2) { $sat[1] = rtrim($sat[1], ',;: ') . '…'; break; } $sat[] = $k2; } else $sat[count($sat) - 1] = $den;
  }
  foreach ($sat as $j => $s) yazi($im, 26, $F5, $W / 2, $py + 118 + $j * 42, $acik, $s, 'orta');
}
yazi($im, 20, $F5, $W / 2, 600, $rgb('#6fbfa3'), 'okutan.org/kelime-bulucu/kelime/' . $slug . '/', 'orta');

ob_start(); imagepng($im, null, 6); $png = (string)ob_get_clean(); imagedestroy($im);
if ((is_dir($onb) || @mkdir($onb, 0755, true)) && is_writable($onb)) @file_put_contents($dosya, $png);
echo $png;
