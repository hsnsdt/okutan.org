<?php
// Balon Patlat — meydan okuma paylaşım görseli (1200x630 PNG)
//   /balon/api/og.php?id=kod  → "Ali 4.320 puan yaptı" görseli
// GD/FreeType yoksa ya da skor bulunamazsa genel paylaşım görseline yönlendirir.
declare(strict_types=1);
ini_set('display_errors', '0');

function fallback(): void { header('Location: /balon/og.png', true, 302); exit; }

$id = $_GET['id'] ?? '';
if (!is_string($id) || !preg_match('/^[0-9a-z]{1,10}$/', $id)) fallback();
if (!function_exists('imagettftext')) fallback();
$font = __DIR__ . '/fonts/InterTight-ExtraBold.ttf';
if (!is_file($font) || !is_file(__DIR__ . '/config.php')) fallback();
$cfg = require __DIR__ . '/config.php';

try {
    $db = new PDO('mysql:host=' . $cfg['db_host'] . ';dbname=' . $cfg['db_name'] . ';charset=utf8mb4', $cfg['db_user'], $cfg['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $st = $db->prepare('SELECT name, score, level, city FROM bp_scores WHERE id = ? AND flag = 0');
    $st->execute([(int)base_convert($id, 36, 10)]);
    $r = $st->fetch();
} catch (Throwable $e) { fallback(); }
if (!$r) fallback();

$W = 1200; $H = 630;
$im = imagecreatetruecolor($W, $H);
imagealphablending($im, true);
imageantialias($im, true);
$bg = imagecolorallocate($im, 18, 18, 18);
imagefill($im, 0, 0, $bg);
$dot = imagecolorallocate($im, 40, 40, 40);
for ($y = 12; $y < $H; $y += 24) for ($x = 12; $x < $W; $x += 24) imagefilledellipse($im, $x, $y, 3, 3, $dot);

// balonlar: koyudan açığa eşmerkezli dairelerle degrade + parlama
$pal = [[255, 90, 31], [255, 194, 26], [34, 179, 94], [18, 180, 200], [51, 102, 255], [168, 69, 232]];
function ball($im, int $cx, int $cy, int $r, array $c): void {
    for ($i = $r; $i > 0; $i -= 1) {
        $k = $i / $r;                       // 1 = kenar, 0 = merkez
        $f = 0.62 + 0.38 * (1 - $k);        // kenarda koyu
        $col = imagecolorallocate($im, (int)min(255, $c[0] * $f + 40 * (1 - $k)), (int)min(255, $c[1] * $f + 40 * (1 - $k)), (int)min(255, $c[2] * $f + 40 * (1 - $k)));
        imagefilledellipse($im, $cx - (int)(($r - $i) * 0.25), $cy - (int)(($r - $i) * 0.3), $i * 2, $i * 2, $col);
    }
    $hl = imagecolorallocatealpha($im, 255, 255, 255, 55);
    imagefilledellipse($im, $cx - (int)($r * 0.32), $cy - (int)($r * 0.42), (int)($r * 0.7), (int)($r * 0.42), $hl);
}
$rr = 27; $rh = (int)round($rr * sqrt(3));
for ($row = 0; $row < 7; $row++) for ($col = 0; $col < 8; $col++) {
    if ($row > 3 && ($col + $row) % 3 === 0) continue;
    if ($row === 6 && $col > 4) continue;
    ball($im, 770 + $col * $rr * 2 + ($row % 2 ? $rr : 0), 80 + $row * $rh, $rr - 1, $pal[($row * 3 + $col * 5) % 6]);
}

$white = imagecolorallocate($im, 244, 244, 242);
$muted = imagecolorallocate($im, 154, 154, 154);
$accent = imagecolorallocate($im, 255, 90, 31);
function txt($im, float $size, int $x, int $y, $color, string $font, string $s): int {
    $b = imagettftext($im, $size, 0, $x, $y, $color, $font, $s);
    return $b[2] - $b[0];
}
txt($im, 17, 72, 96, $muted, $font, 'OKUTAN.ORG/BALON  ·  MEYDAN OKUMA');
$w = txt($im, 50, 72, 172, $white, $font, 'Balon ');
txt($im, 50, 72 + $w, 172, $accent, $font, 'Patlat');
$name = mb_substr((string)$r['name'], 0, 16);
txt($im, 34, 72, 252, $white, $font, $name . ' yaptı:');
$score = number_format((int)$r['score'], 0, ',', '.');
$sw = txt($im, 120, 64, 400, $white, $font, $score);
txt($im, 20, 84 + $sw, 400, $muted, $font, 'PUAN');
$sub = 'Seviye ' . (int)$r['level'] . ($r['city'] ? '  ·  ' . $r['city'] : '');
txt($im, 22, 72, 452, $muted, $font, $sub);
txt($im, 34, 72, 556, $accent, $font, 'Geçebilir misin?');

header('Content-Type: image/png');
header('Cache-Control: public, max-age=86400');
imagepng($im, null, 6);
imagedestroy($im);
