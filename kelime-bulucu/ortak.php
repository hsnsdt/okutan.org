<?php
/* Kelime Bulucu — kelime.php, liste.php ve og.php için ortak parçalar.
   Veri: sozluk.txt (ön ekle sıkıştırılmış), veri/listeler.json, veri/sik.txt, veri/anlam/<harf>.json (Vikisözlük, CC BY-SA).
   Sözlük işlemleri ISO-8859-9 (her Türkçe harf tek bayt) üzerinde yapılır; çıktı UTF-8.
   ADRESLER: Türkçe karakter yok. ç→c ğ→g ı→i ö→o ş→s ü→u; aynı ASCII adrese düşen kelimelerde Türkçe harfi az olan
   (eşitse sözlükte önce gelen) sade adresi alır, ötekiler -2, -3 … alır. Aynı kural motor.js'te (slugHarita) ve üreticide var. */
declare(strict_types=1);
mb_internal_encoding('UTF-8');
const SITE = 'https://okutan.org';
const KB_V = 4; // kb.css / ortak.js sürümü
const KB_DIR = __DIR__;

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function tr_lower(string $s): string { return mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $s)); }
function tr_upper(string $s): string { return mb_strtoupper(str_replace(['i', 'ı'], ['İ', 'I'], $s)); }
function l5(string $s): string { return (string)iconv('UTF-8', 'ISO-8859-9//IGNORE', $s); }
function u8(string $s): string { return (string)iconv('ISO-8859-9', 'UTF-8', $s); }
function sayi(int $n): string { return number_format($n, 0, ',', '.'); }
function harfler(string $w): array { return preg_split('//u', $w, -1, PREG_SPLIT_NO_EMPTY) ?: []; }
function cumle(string $s): string { $s = trim($s); if ($s === '') return $s; $c = mb_substr($s, 0, 1); return ($c === 'i' ? 'İ' : ($c === 'ı' ? 'I' : mb_strtoupper($c))) . mb_substr($s, 1); }
function temiz_kelime(string $s): string {
  $s = tr_lower(str_replace(['â', 'î', 'û', 'Â', 'Î', 'Û'], ['a', 'i', 'u', 'a', 'i', 'u'], $s));
  return preg_replace('/[^a-zçğıöşü]/u', '', $s) ?? '';
}

const PUAN = ['a' => 1, 'b' => 3, 'c' => 4, 'ç' => 4, 'd' => 3, 'e' => 1, 'f' => 7, 'g' => 5, 'ğ' => 8, 'h' => 5, 'ı' => 2, 'i' => 1, 'j' => 10, 'k' => 1, 'l' => 1, 'm' => 2,
  'n' => 1, 'o' => 2, 'ö' => 7, 'p' => 5, 'r' => 1, 's' => 2, 'ş' => 4, 't' => 1, 'u' => 2, 'ü' => 3, 'v' => 7, 'y' => 3, 'z' => 4];
// Türkçe Scrabble torbası: harf başına taş sayısı (+2 joker)
const TORBA = ['a' => 12, 'b' => 2, 'c' => 2, 'ç' => 2, 'd' => 2, 'e' => 8, 'f' => 1, 'g' => 1, 'ğ' => 1, 'h' => 1, 'ı' => 4, 'i' => 7, 'j' => 1, 'k' => 7, 'l' => 7, 'm' => 4,
  'n' => 5, 'o' => 3, 'ö' => 1, 'p' => 1, 'r' => 6, 's' => 3, 'ş' => 2, 't' => 5, 'u' => 3, 'ü' => 2, 'v' => 1, 'y' => 2, 'z' => 2];
const SESLI = 'aeıioöuü';
const TR_L5 = "\xE7\xF0\xFD\xF6\xFE\xFC"; // ç ğ ı ö ş ü (ISO-8859-9)

function puan(string $w): int { $t = 0; foreach (harfler($w) as $c) $t += PUAN[$c] ?? 0; return $t; }
function kat(int $p): int { return $p >= 20 ? 4 : ($p >= 12 ? 3 : ($p >= 7 ? 2 : 1)); }
function rozet(int $p): string { return '<sub class="pt t' . kat($p) . '" title="' . $p . ' puan">' . $p . '</sub>'; }
// Torbada fazla gelen taş sayısı (2 jokerle kapatılabilir)
function torba_fazla(string $w): int { $n = []; foreach (harfler($w) as $c) $n[$c] = ($n[$c] ?? 0) + 1; $f = 0; foreach ($n as $c => $k) $f += max(0, $k - (TORBA[$c] ?? 0)); return $f; }
function ascii(string $s): string { return strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'Ç' => 'c', 'Ğ' => 'g', 'İ' => 'i', 'Ö' => 'o', 'Ş' => 's', 'Ü' => 'u', 'I' => 'i']); }
function hece(string $w): array {
  $c = harfler($w); $v = [];
  foreach ($c as $i => $ch) if (mb_strpos(SESLI, $ch) !== false) $v[] = $i;
  if (count($v) < 2) return [$w];
  $kes = [];
  for ($k = 0; $k < count($v) - 1; $k++) { $n = $v[$k + 1] - $v[$k] - 1; $kes[] = $n === 0 ? $v[$k + 1] : $v[$k + 1] - 1; }
  $out = []; $bas = 0;
  foreach ($kes as $x) { $out[] = implode('', array_slice($c, $bas, $x - $bas)); $bas = $x; }
  $out[] = implode('', array_slice($c, $bas));
  return $out;
}

// ---------- sözlük ----------
final class Sozluk {
  public static ?array $S = null;      // ISO-8859-9 kelimeler, sözlük sırasıyla
  public static ?array $idx = null;    // kelime(l5) → sıra
  public static ?array $grup = null;   // ascii taban → [sıra, …] (yalnızca çakışanlar, kurala göre dizili)
  public static ?array $asc = null;    // sıra → ascii taban
  static function yukle(): void {
    if (self::$S !== null) return;
    $metin = l5((string)file_get_contents(KB_DIR . '/sozluk.txt'));
    $S = []; $o = '';
    foreach (explode("\n", $metin) as $sat) {
      $sat = rtrim($sat, "\r"); if ($sat === '') continue;
      $j = strspn($sat, '0123456789'); $n = $j ? (int)substr($sat, 0, $j) : 0;
      $o = substr($o, 0, $n) . substr($sat, $j); $S[] = $o;
    }
    self::$S = $S; self::$idx = array_flip($S);
    $A = explode("\n", strtr(implode("\n", $S), TR_L5, 'cgiosu'));
    self::$asc = $A;
    $g = [];
    foreach ($A as $i => $a) $g[$a][] = $i;
    $c = [];
    foreach ($g as $a => $l) if (count($l) > 1) {
      usort($l, function ($x, $y) use ($S) {
        $tx = strlen($S[$x]) - strlen(str_replace(str_split(TR_L5), '', $S[$x]));
        $ty = strlen($S[$y]) - strlen(str_replace(str_split(TR_L5), '', $S[$y]));
        return $tx <=> $ty ?: $x <=> $y;
      });
      $c[$a] = $l;
    }
    self::$grup = $c;
  }
  static function var(string $w): bool { self::yukle(); return isset(self::$idx[l5($w)]); }
  static function slug(string $w): string { // UTF-8 kelime → ASCII adres parçası
    self::yukle();
    $l = l5($w); $a = strtr($l, TR_L5, 'cgiosu');
    if (isset(self::$grup[$a], self::$idx[$l])) { $p = array_search(self::$idx[$l], self::$grup[$a], true); if ($p) return $a . '-' . ($p + 1); }
    return $a;
  }
  static function kelime(string $slug): ?string { // ASCII adres → UTF-8 kelime
    self::yukle();
    $n = 1;
    if (preg_match('/^([a-z]+)-(\d+)$/', $slug, $m)) { $slug = $m[1]; $n = (int)$m[2]; }
    if (!preg_match('/^[a-z]+$/', $slug)) return null;
    if (isset(self::$grup[$slug])) return isset(self::$grup[$slug][$n - 1]) ? u8(self::$S[self::$grup[$slug][$n - 1]]) : null;
    if ($n !== 1) return null;
    $i = array_search($slug, self::$asc, true);
    return $i === false ? null : u8(self::$S[$i]);
  }
  static function kardesler(string $w): array { // aynı ASCII adrese düşen öteki kelimeler
    self::yukle(); $l = l5($w); $a = strtr($l, TR_L5, 'cgiosu');
    return isset(self::$grup[$a]) ? array_values(array_filter(array_map(fn($i) => u8(self::$S[$i]), self::$grup[$a]), fn($x) => $x !== $w)) : [];
  }
}
function kurl(string $w): string { return '/kelime-bulucu/kelime/' . Sozluk::slug($w) . '/'; }
// Araç adresleri: Türkçe harf büyük ASCII harfle (ç→C …), ? → _ ; adres çubuğunda Türkçe karakter olmaz.
function arac_kod(string $s): string { return strtr($s, ['ç' => 'C', 'ğ' => 'G', 'ı' => 'I', 'ö' => 'O', 'ş' => 'S', 'ü' => 'U', '?' => '_']); }
function arac_url(string $p, string $v, int $u = 0): string { return '/kelime-bulucu/?' . $p . '=' . rawurlencode(arac_kod($v)) . ($u ? '&u=' . $u : ''); }

// ---------- liste sayfası dizini ----------
final class Listeler {
  public static ?array $L = null;     // slug → [t, k, L, n]
  public static ?array $ters = null;  // "t|k|L" → slug
  static function yukle(): void {
    if (self::$L !== null) return;
    $d = json_decode((string)@file_get_contents(KB_DIR . '/veri/listeler.json'), true) ?: [];
    self::$L = $d; self::$ters = [];
    foreach ($d as $s => $x) self::$ters[$x[0] . '|' . ($x[1] ?? '') . '|' . ($x[2] ?? 0)] = $s;
  }
  static function slug(string $t, string $k = '', int $L = 0): ?string { self::yukle(); return self::$ters["$t|$k|$L"] ?? null; }
  static function bilgi(string $slug): ?array { self::yukle(); return self::$L[$slug] ?? null; }
}
function lurl(string $slug): string { return '/kelime-bulucu/liste/' . $slug . '/'; }

// ---------- sıklık ve anlam ----------
function sik(): array { static $r = null; if ($r === null) { $r = array_flip(array_values(array_filter(explode("\n", str_replace("\r", '', (string)@file_get_contents(KB_DIR . '/veri/sik.txt')))))); } return $r; }
function yaygin(array $ws, int $n): array { $s = sik(); $a = array_values(array_filter($ws, fn($w) => isset($s[$w]))); usort($a, fn($x, $y) => $s[$x] <=> $s[$y]); return array_slice($a, 0, $n); }
function parca(string $w): string { $c = mb_substr($w, 0, 1); return ['ç' => 'c1', 'ğ' => 'g1', 'ı' => 'i1', 'ö' => 'o1', 'ş' => 's1', 'ü' => 'u1'][$c] ?? $c; }
function anlam_zengin(string $w): ?array {
  static $c = []; $p = parca($w);
  if (!preg_match('/^[a-z]1?$/', $p)) return null;
  if (!array_key_exists($p, $c)) $c[$p] = json_decode((string)@file_get_contents(KB_DIR . "/veri/anlam/$p.json"), true) ?: [];
  return $c[$p][$w] ?? null;
}
function anlam_ilk(string $w): ?string { $a = anlam_zengin($w); return $a['t'][0]['a'][0]['d'] ?? null; }

// ---------- sayfa iskeleti ----------
function sayfa_bas(array $o): void {
  $can = $o['can'] ?? null; $ac = $o['aciklama'] ?? ''; $ogb = $o['og_baslik'] ?? ($o['baslik'] ?? '');
  $img = $o['og_img'] ?? SITE . '/kelime-bulucu/og.png'; $alt = $o['og_alt'] ?? 'Kelime Bulucu: yeşil harf taşlarıyla yazılmış Türkçe kelimeler ve arama kutusu';
  header('Content-Type: text/html; charset=UTF-8');
  if (!isset($o['durum']) || $o['durum'] === 200) header('Cache-Control: public, max-age=3600');
  ?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= h($o['baslik']) ?></title>
<?php if ($can): ?>
<meta name="description" content="<?= h($ac) ?>">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="<?= h($can) ?>">
<meta property="og:type" content="<?= h($o['og_tur'] ?? 'website') ?>"><meta property="og:site_name" content="okutan.org"><meta property="og:locale" content="tr_TR">
<meta property="og:title" content="<?= h($ogb) ?>"><meta property="og:description" content="<?= h($ac) ?>"><meta property="og:url" content="<?= h($can) ?>">
<meta property="og:image" content="<?= h($img) ?>"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="<?= h($alt) ?>">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@okutanapp"><meta name="twitter:title" content="<?= h($ogb) ?>"><meta name="twitter:description" content="<?= h($ac) ?>"><meta name="twitter:image" content="<?= h($img) ?>"><meta name="twitter:image:alt" content="<?= h($alt) ?>">
<?php if (!empty($o['jsonld'])): ?><script type="application/ld+json"><?= json_encode($o['jsonld'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script><?php endif; ?>
<?php else: ?>
<meta name="robots" content="noindex, follow">
<?php endif; ?>
<meta name="author" content="Sedat Okutan">
<meta name="theme-color" content="#f6f8f7">
<link rel="icon" href="/kelime-bulucu/favicon-32.png" type="image/png" sizes="32x32"><link rel="apple-touch-icon" href="/kelime-bulucu/icon-192.png">
<link rel="preload" href="/assets/fonts/Roboto-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/kelime-bulucu/kb.css?v=<?= KB_V ?>">
<script>(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})();</script>
</head>
<body>
<div class="wrap">
<header class="b top"><div class="brand"><a href="/" class="logo" aria-label="okutan.org"><img class="l-light" src="/assets/logo.svg" width="96" height="26" alt="okutan"><img class="l-dark" src="/assets/logo-dark.svg" width="96" height="26" alt="okutan"></a><span class="crumb"><?= $o['crumb'] ?></span></div><button class="ctrl" id="themeBtn" aria-label="Tema"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button></header>
<main>
<?php
}
function sayfa_son(): void { ?>
</main>
<footer class="b"><span>© <span id="yr">2026</span> Sedat Okutan</span><nav aria-label="Diğer sayfalar"><a href="/">okutan.org</a><a href="/kelime-bulucu/">Kelime Bulucu</a><a href="/kelime-bulucu/liste/">Kelime Listeleri</a><a href="/kelime-bulucu/liste/en-yuksek-puanli-kelimeler/">En yüksek puanlı kelimeler</a><a href="/gizli-kelime/">Gizli Kelime</a><a href="/oyunlar/">Oyunlar</a><a href="/kelimeler/">Kelimeler</a></nav></footer>
</div>
<script src="/kelime-bulucu/ortak.js?v=<?= KB_V ?>" defer></script>
</body>
</html>
<?php }
function breadcrumb(array $son): array {
  $it = [['okutan.org', SITE . '/'], ['Kelime Bulucu', SITE . '/kelime-bulucu/']];
  foreach ($son as $x) $it[] = $x;
  return ['@type' => 'BreadcrumbList', 'itemListElement' => array_map(fn($x, $i) => ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $x[0], 'item' => $x[1]], $it, array_keys($it))];
}
function faq(array $sss): array { return ['@type' => 'FAQPage', 'mainEntity' => array_map(fn($q) => ['@type' => 'Question', 'name' => $q[0], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $q[1]]], $sss)]; }
// Bağlantılı kelime çipleri (puan rozetli)
function cipler(array $ws, ?callable $vurgu = null, string $cls = 'ws'): string {
  $o = '<ul class="' . $cls . '">';
  foreach ($ws as $w) { $p = puan($w); $o .= '<li><a href="' . kurl($w) . '">' . ($vurgu ? $vurgu($w) : h($w)) . rozet($p) . '</a></li>'; }
  return $o . '</ul>';
}
