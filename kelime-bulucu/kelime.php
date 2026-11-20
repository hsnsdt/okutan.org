<?php
/* Kelime Bulucu — kelime sayfası: /kelime-bulucu/kelime/<kelime>/  (.htaccess bu dosyaya ?k= ile yönlendirir)
   Tek dosya; veriyi sozluk.txt (ön ekle sıkıştırılmış) ve anlam/<harf>.json'dan okur. Veritabanı yok.
   Hesaplar ISO-8859-9 (her Türkçe harf bir bayt) üzerinde yapılır, çıktı UTF-8'dir. */
declare(strict_types=1);
mb_internal_encoding('UTF-8');
const SITE = 'https://okutan.org';
const V = 3; // kb.css / ortak.js sürümü
$DIR = __DIR__;

function tr_lower(string $s): string { return mb_strtolower(str_replace(['İ', 'I'], ['i', 'ı'], $s)); }
function tr_upper(string $s): string { return mb_strtoupper(str_replace(['i', 'ı'], ['İ', 'I'], $s)); }
function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function l5(string $s): string { return (string)iconv('UTF-8', 'ISO-8859-9//IGNORE', $s); }
function u8(string $s): string { return (string)iconv('ISO-8859-9', 'UTF-8', $s); }
function sayi(int $n): string { return number_format($n, 0, ',', '.'); }
function harfler(string $w): array { return preg_split('//u', $w, -1, PREG_SPLIT_NO_EMPTY) ?: []; }
function kurl(string $w): string { return '/kelime-bulucu/kelime/' . $w . '/'; }
function cumle(string $s): string { $s = trim($s); return $s === '' ? $s : mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1); }

const PUAN = ['a' => 1, 'b' => 3, 'c' => 4, 'ç' => 4, 'd' => 3, 'e' => 1, 'f' => 7, 'g' => 5, 'ğ' => 8, 'h' => 5, 'ı' => 2, 'i' => 1, 'j' => 10, 'k' => 1, 'l' => 1, 'm' => 2,
  'n' => 1, 'o' => 2, 'ö' => 7, 'p' => 5, 'r' => 1, 's' => 2, 'ş' => 4, 't' => 1, 'u' => 2, 'ü' => 3, 'v' => 7, 'y' => 3, 'z' => 4];
const SESLI = 'aeıioöuü';
function puan(string $w): int { $t = 0; foreach (harfler($w) as $c) $t += PUAN[$c] ?? 0; return $t; }
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
$PARCA = ['ç' => 'c1', 'ğ' => 'g1', 'ı' => 'i1', 'ö' => 'o1', 'ş' => 's1', 'ü' => 'u1'];
$sluglar = fn(string $s) => is_file($DIR . '/liste/' . $s . '/index.html');

// ---------- istek ----------
$ham = (string)($_GET['k'] ?? '');
$w = preg_replace('/[^a-zçğıöşü]/u', '', tr_lower(str_replace(['â', 'î', 'û', 'Â', 'Î', 'Û'], ['a', 'i', 'u', 'a', 'i', 'u'], $ham))) ?? '';
if ($w === '') { header('Location: /kelime-bulucu/', true, 302); exit; }
$istenen = rawurldecode(strtok((string)($_SERVER['REQUEST_URI'] ?? ''), '?'));
if (strpos($istenen, '/kelime-bulucu/kelime/') === 0 && $istenen !== kurl($w)) { header('Location: ' . kurl(rawurlencode($w)), true, 301); exit; }

// ---------- sözlük ----------
$metin = l5((string)file_get_contents($DIR . '/sozluk.txt'));
$S = []; $onceki = '';
foreach (explode("\n", $metin) as $sat) {
  $sat = rtrim($sat, "\r"); if ($sat === '') continue;
  $j = strspn($sat, '0123456789'); $n = $j ? (int)substr($sat, 0, $j) : 0;
  $onceki = substr($onceki, 0, $n) . substr($sat, $j); $S[] = $onceki;
}
$idx = array_flip($S);
$W = l5($w); $L = strlen($W);
$var = isset($idx[$W]);

// anlam
$anlam = null;
$p = $PARCA[mb_substr($w, 0, 1)] ?? mb_substr($w, 0, 1);
if (preg_match('/^[a-z]1?$/', $p) && is_file($DIR . "/anlam/$p.json")) {
  $d = json_decode((string)file_get_contents($DIR . "/anlam/$p.json"), true);
  if (is_array($d) && isset($d[$w])) $anlam = cumle((string)$d[$w]);
}

// ---------- hesaplar ----------
$wc = count_chars($W, 1);
$turetilen = []; $anagram = []; $benzer = []; $basla = []; $biten = []; $icinde = [];
$nBasla = $nBiten = $nIcinde = 0;
$anahtar = function (string $x): string { $a = str_split($x); sort($a); return implode('', $a); };
$wk = $anahtar($W);
foreach ($S as $x) {
  $xl = strlen($x);
  if ($x === $W) continue;
  if ($xl < $L) {
    $ok = true;
    foreach (count_chars($x, 1) as $b => $c) if (($wc[$b] ?? 0) < $c) { $ok = false; break; }
    if ($ok) $turetilen[] = $x;
    continue;
  }
  if ($xl === $L) {
    if (strlen(str_replace("\0", '', $x ^ $W)) === 1) $benzer[] = $x;
    if ($anahtar($x) === $wk) $anagram[] = $x;
    continue;
  }
  if (strncmp($x, $W, $L) === 0) { $nBasla++; if (count($basla) < 40) $basla[] = $x; }
  if (substr($x, -$L) === $W) { $nBiten++; if (count($biten) < 40) $biten[] = $x; }
  elseif (strpos($x, $W) !== false && strncmp($x, $W, $L) !== 0) { $nIcinde++; if (count($icinde) < 40) $icinde[] = $x; }
}
$u = fn(array $a) => array_map('u8', $a);
$turetilen = $u($turetilen); $anagram = $u($anagram); $benzer = $u($benzer); $basla = $u($basla); $biten = $u($biten); $icinde = $u($icinde);
$puanli = function (array $a): array { $o = array_map(fn($x) => [$x, puan($x)], $a); usort($o, fn($a, $b) => $b[1] <=> $a[1] ?: mb_strlen($b[0]) <=> mb_strlen($a[0]) ?: strcmp($a[0], $b[0])); return $o; };
$turP = $puanli($turetilen);

// alfabetik komşular
$komsu = [[], []];
if ($var) { $i = $idx[$W]; $komsu = [$u(array_slice($S, max(0, $i - 6), min(6, $i))), $u(array_slice($S, $i + 1, 6))]; }

// bilgiler
$hs = harfler($w); $harfSay = count($hs);
$puan = puan($w);
$heceler = hece($w);
$sesli = array_values(array_filter($hs, fn($c) => mb_strpos(SESLI, $c) !== false));
$ters = implode('', array_reverse($hs));
$enDeger = $hs ? array_reduce($hs, fn($a, $c) => (PUAN[$c] ?? 0) > (PUAN[$a] ?? 0) ? $c : $a, $hs[0]) : '';
$W_ = tr_upper($w); $Wc = cumle($w);

// ---------- çıktı ----------
if (!$var) http_response_code(404);
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: public, max-age=86400');
$can = SITE . kurl(rawurlencode($w));
$kisa = $anlam ? (mb_strlen($anlam) > 110 ? rtrim(mb_substr($anlam, 0, 107)) . '…' : $anlam) : '';
$baslik = $var ? "$Wc Ne Demek? Anlamı, Hecelenişi, Scrabble Puanı ve Türetilen Kelimeler | okutan.org" : "$Wc — sözlükte yok | okutan.org";
$aciklama = $var ? ($kisa ? "$Wc ne demek: $kisa " : "$Wc kelimesi: ") . "$harfSay harfli, " . count($heceler) . " heceli (" . implode('-', $heceler) . "), Scrabble'da $puan puan. $W_ harfleriyle türetilen " . sayi(count($turetilen)) . " kelime, anagramlar ve benzer kelimeler." : '';

$liste = function (array $a, bool $puanGoster = true) { // bağlantılı kelime çipleri
  return '<ul class="wl">' . implode('', array_map(function ($x) use ($puanGoster) {
    $w = is_array($x) ? $x[0] : $x; $p = is_array($x) ? $x[1] : puan($w);
    return '<li><a href="' . h(kurl($w)) . '">' . h($w) . ($puanGoster ? '<sub class="pt t' . ($p >= 20 ? 4 : ($p >= 12 ? 3 : ($p >= 7 ? 2 : 1))) . '" title="' . $p . ' puan">' . $p . '</sub>' : '') . '</a></li>';
  }, $a)) . '</ul>';
};
$lk = function (string $slug, string $metin) use ($sluglar) { return $sluglar($slug) ? '<a href="/kelime-bulucu/liste/' . h($slug) . '/">' . h($metin) . '</a>' : ''; };
$ilk = $hs[0] ?? ''; $son = $hs[$harfSay - 1] ?? '';
$ilgiliListe = array_filter([
  $lk("$ilk-ile-baslayan-kelimeler", tr_upper($ilk) . ' ile başlayan kelimeler'),
  $lk("$ilk-ile-baslayan-$harfSay-harfli-kelimeler", tr_upper($ilk) . " ile başlayan $harfSay harfli"),
  $lk("$harfSay-harfli-kelimeler", "$harfSay harfli kelimeler"),
  $lk("$son-ile-biten-kelimeler", tr_upper($son) . ' ile biten kelimeler'),
  $lk("$son-ile-biten-$harfSay-harfli-kelimeler", tr_upper($son) . " ile biten $harfSay harfli"),
  $harfSay >= 2 ? $lk(mb_substr($w, 0, 2) . '-ile-baslayan-kelimeler', tr_upper(mb_substr($w, 0, 2)) . ' ile başlayan') : '',
  $harfSay >= 3 ? $lk(mb_substr($w, 0, 3) . '-ile-baslayan-kelimeler', tr_upper(mb_substr($w, 0, 3)) . ' ile başlayan') : '',
  $harfSay >= 3 ? $lk(mb_substr($w, -3) . '-ile-biten-kelimeler', tr_upper(mb_substr($w, -3)) . ' ile biten') : '',
  $harfSay >= 2 ? $lk(mb_substr($w, -2) . '-ile-biten-kelimeler', tr_upper(mb_substr($w, -2)) . ' ile biten') : '',
]);
$sss = $var ? array_values(array_filter([
  ["$Wc ne demek?", $anlam ? "$Wc: $anlam" : "$Wc kelimesinin anlamı sözlüğümüzde henüz yok; TDK Güncel Türkçe Sözlük'e bakabilirsin."],
  ["$Wc kaç harfli?", "$Wc $harfSay harfli bir kelimedir: " . count($sesli) . ' sesli, ' . ($harfSay - count($sesli)) . ' sessiz harf. ' . count($heceler) . ' heceden oluşur: ' . implode('-', $heceler) . '.'],
  ["$Wc Scrabble'da kaç puan?", "Türkçe Scrabble taş puanlarıyla $W_ $puan puan eder (" . implode(' + ', array_map(fn($c) => tr_upper($c) . ' ' . (PUAN[$c] ?? 0), $hs)) . "). Harf ve kelime katlı karelerde puan artar."],
  ["$W_ harfleriyle hangi kelimeler türetilir?", $turetilen ? "$W_ harflerinden " . sayi(count($turetilen)) . ' kelime türetilir. En yüksek puanlıları: ' . implode(', ', array_map(fn($x) => $x[0] . ' (' . $x[1] . ')', array_slice($turP, 0, 8))) . '.' : "$W_ harfleriyle türetilebilen başka bir kelime yok."],
  $anagram ? ["$Wc kelimesinin anagramı var mı?", 'Evet, aynı harflerle yazılan kelimeler: ' . implode(', ', $anagram) . '.'] : null,
])) : [];
$jsonld = ['@context' => 'https://schema.org', '@graph' => [
  ['@type' => 'DefinedTerm', 'name' => $w, 'url' => $can, 'description' => $anlam ?: "$Wc, $harfSay harfli Türkçe kelime.", 'inLanguage' => 'tr',
    'inDefinedTermSet' => ['@type' => 'DefinedTermSet', 'name' => 'Kelime Bulucu Türkçe sözlüğü', 'url' => SITE . '/kelime-bulucu/']],
  ['@type' => 'BreadcrumbList', 'itemListElement' => [
    ['@type' => 'ListItem', 'position' => 1, 'name' => 'okutan.org', 'item' => SITE . '/'],
    ['@type' => 'ListItem', 'position' => 2, 'name' => 'Kelime Bulucu', 'item' => SITE . '/kelime-bulucu/'],
    ['@type' => 'ListItem', 'position' => 3, 'name' => $Wc, 'item' => $can]]],
  ['@type' => 'FAQPage', 'mainEntity' => array_map(fn($q) => ['@type' => 'Question', 'name' => $q[0], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $q[1]]], $sss)],
]];
if (!$sss) array_pop($jsonld['@graph']);
?><!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= h($baslik) ?></title>
<?php if ($var): ?>
<meta name="description" content="<?= h($aciklama) ?>">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="<?= h($can) ?>">
<meta property="og:type" content="article"><meta property="og:site_name" content="okutan.org"><meta property="og:locale" content="tr_TR">
<meta property="og:title" content="<?= h("$Wc ne demek?") ?>"><meta property="og:description" content="<?= h($aciklama) ?>"><meta property="og:url" content="<?= h($can) ?>">
<meta property="og:image" content="<?= SITE ?>/kelime-bulucu/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Kelime Bulucu: yeşil harf taşlarıyla yazılmış Türkçe kelimeler ve arama kutusu">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:site" content="@okutanapp"><meta name="twitter:title" content="<?= h("$Wc ne demek?") ?>"><meta name="twitter:description" content="<?= h($aciklama) ?>"><meta name="twitter:image" content="<?= SITE ?>/kelime-bulucu/og.png"><meta name="twitter:image:alt" content="Kelime Bulucu: yeşil harf taşlarıyla yazılmış Türkçe kelimeler ve arama kutusu">
<script type="application/ld+json"><?= json_encode($jsonld, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script>
<?php else: ?>
<meta name="robots" content="noindex, follow">
<?php endif; ?>
<meta name="author" content="Sedat Okutan">
<meta name="theme-color" content="#f6f8f7">
<link rel="icon" href="/kelime-bulucu/favicon-32.png" type="image/png" sizes="32x32"><link rel="apple-touch-icon" href="/kelime-bulucu/icon-192.png">
<link rel="preload" href="/assets/fonts/Roboto-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/kelime-bulucu/kb.css?v=<?= V ?>">
<script>(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})();</script>
</head>
<body>
<div class="wrap">
<header class="b top"><div class="brand"><a href="/" class="logo" aria-label="okutan.org"><img class="l-light" src="/assets/logo.svg" width="96" height="26" alt="okutan"><img class="l-dark" src="/assets/logo-dark.svg" width="96" height="26" alt="okutan"></a><span class="crumb"><a href="/kelime-bulucu/">Kelime Bulucu</a> / <a href="/kelime-bulucu/liste/">Listeler</a> / <b><?= h($W_) ?></b></span></div><button class="ctrl" id="themeBtn" aria-label="Tema"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button></header>
<main>
<?php if (!$var): ?>
<section class="b intro">
<div class="label">Sözlükte yok</div>
<h1 id="pageTitle"><?= h($W_) ?> sözlüğümüzde yok</h1>
<p>Bu kelime 60.000'den fazla kelimelik Türkçe sözlüğümüzde bulunamadı. Yazımı kontrol et ya da harflerini kelime bulucuda ara.</p>
<div class="mlinks"><a href="/kelime-bulucu/?h=<?= h(rawurlencode($w)) ?>">Harflerinden kelime türet</a><a href="https://sozluk.gov.tr/?kelime=<?= h(rawurlencode($w)) ?>" target="_blank" rel="noopener">TDK sözlükte ara ↗</a></div>
<?php if ($benzer): ?><h2 class="wh">Bunu mu demek istedin?</h2><?= $liste(array_slice($benzer, 0, 30)) ?><?php endif; ?>
</section>
<?php else: ?>
<section class="b intro wp" aria-labelledby="pageTitle">
<div class="label">Kelime · <?= $harfSay ?> harf · <?= $puan ?> puan</div>
<h1 id="pageTitle"><?= h($Wc) ?> ne demek?</h1>
<div class="tiles big" aria-label="<?= h($W_) ?>"><?php foreach ($hs as $c): ?><i aria-hidden="true"><?= h(tr_upper($c)) ?><small><?= PUAN[$c] ?? 0 ?></small></i><?php endforeach; ?></div>
<?php if ($anlam): ?>
<p class="anlam"><?= h($anlam) ?></p>
<p class="src">Kaynak: <a href="https://tr.wiktionary.org/wiki/<?= h(rawurlencode($w)) ?>" target="_blank" rel="noopener">Vikisözlük</a> (CC BY-SA) · <a href="https://sozluk.gov.tr/?kelime=<?= h(rawurlencode($w)) ?>" target="_blank" rel="noopener">TDK sözlükte bak ↗</a></p>
<?php else: ?>
<p class="anlam none"><?= h($Wc) ?> kelimesinin anlamı sözlüğümüzde henüz yok. <a href="https://sozluk.gov.tr/?kelime=<?= h(rawurlencode($w)) ?>" target="_blank" rel="noopener">TDK Güncel Türkçe Sözlük'te bak ↗</a></p>
<?php endif; ?>
<div class="chips">
<span class="chip"><b><?= $harfSay ?></b><span>harf</span></span>
<span class="chip"><b><?= $puan ?></b><span>Scrabble puanı</span></span>
<span class="chip"><b><?= h(implode('-', $heceler)) ?></b><span><?= count($heceler) ?> hece</span></span>
<span class="chip"><b><?= count($sesli) ?> / <?= $harfSay - count($sesli) ?></b><span>sesli / sessiz</span></span>
<span class="chip"><b><?= sayi(count($turetilen)) ?></b><span>türetilen kelime</span></span>
</div>
</section>

<section class="b" aria-labelledby="hHak">
<h2 id="hHak"><?= h($Wc) ?> kelimesi hakkında</h2>
<ul class="rules">
<li><b><?= h($Wc) ?></b> <?= $harfSay ?> harfli, <?= count($heceler) ?> heceli bir kelimedir; hecelere <b><?= h(implode('-', $heceler)) ?></b> diye ayrılır.</li>
<li><?= count($sesli) ?> sesli (<?= h(implode(', ', array_unique($sesli))) ?>) ve <?= $harfSay - count($sesli) ?> sessiz harf içerir.</li>
<li>Türkçe Scrabble taş puanlarıyla <b><?= $puan ?> puan</b> eder; en değerli harfi <b><?= h(tr_upper($enDeger)) ?></b> (<?= PUAN[$enDeger] ?? 0 ?> puan).</li>
<li>Tersten yazılışı <b><?= h($ters) ?></b><?= $ters === $w ? ': tersinden de aynı okunur (palindrom).' : (isset($idx[l5($ters)]) ? ', bu da sözlükte olan bir kelime: <a href="' . h(kurl($ters)) . '">' . h($ters) . '</a>.' : '.') ?></li>
<?php if ($komsu[0] || $komsu[1]): ?><li>Alfabetik sırada <?= $komsu[0] ? '<a href="' . h(kurl(end($komsu[0]))) . '">' . h(end($komsu[0])) . '</a>' : '' ?><?= $komsu[0] && $komsu[1] ? ' ile ' : '' ?><?= $komsu[1] ? '<a href="' . h(kurl($komsu[1][0])) . '">' . h($komsu[1][0]) . '</a>' : '' ?> <?= $komsu[0] && $komsu[1] ? 'arasında' : 'yanında' ?> gelir.</li><?php endif; ?>
</ul>
</section>

<?php if ($turetilen): ?>
<section class="b" aria-labelledby="hTur">
<h2 id="hTur"><?= h($W_) ?> harflerinden türetilen kelimeler <small class="cnt"><?= sayi(count($turetilen)) ?></small></h2>
<p class="sub2">Kelimenin harfleriyle, her harf bir kez kullanılarak kurulabilen kelimeler; puana göre sıralı.</p>
<?= $liste(array_slice($turP, 0, 60)) ?>
<?php if (count($turetilen) > 60): ?><a class="more" href="/kelime-bulucu/?h=<?= h(rawurlencode($w)) ?>">Tüm <?= sayi(count($turetilen)) ?> kelimeyi kelime bulucuda gör →</a><?php endif; ?>
</section>
<?php endif; ?>

<?php if ($anagram || $benzer): ?>
<div class="cols2">
<?php if ($anagram): ?><section class="b" aria-labelledby="hAna"><h2 id="hAna">Anagramlar <small class="cnt"><?= count($anagram) ?></small></h2><p class="sub2">Aynı harflerin farklı dizilişiyle yazılan kelimeler.</p><?= $liste($anagram) ?></section><?php endif; ?>
<?php if ($benzer): ?><section class="b" aria-labelledby="hBen"><h2 id="hBen">Benzer kelimeler <small class="cnt"><?= count($benzer) ?></small></h2><p class="sub2">Yalnızca bir harfi farklı olan <?= $harfSay ?> harfli kelimeler.</p><?= $liste(array_slice($benzer, 0, 40)) ?></section><?php endif; ?>
</div>
<?php endif; ?>

<?php foreach ([[$basla, $nBasla, "$W_ ile başlayan kelimeler", "$w-ile-baslayan-kelimeler", "$w*"], [$biten, $nBiten, "$W_ ile biten kelimeler", "$w-ile-biten-kelimeler", "*$w"], [$icinde, $nIcinde, "İçinde $W_ geçen kelimeler", "icinde-$w-gecen-kelimeler", "*$w*"]] as [$arr, $n, $bas, $slug, $kalip]): if (!$arr) continue; ?>
<section class="b">
<h2><?= h($bas) ?> <small class="cnt"><?= sayi($n) ?></small></h2>
<?= $liste($arr) ?>
<?php if ($n > count($arr)): ?><a class="more" href="<?= $sluglar($slug) ? '/kelime-bulucu/liste/' . h($slug) . '/' : '/kelime-bulucu/?k=' . h(rawurlencode($kalip)) ?>">Tüm <?= sayi($n) ?> kelimeyi gör →</a><?php endif; ?>
</section>
<?php endforeach; ?>

<section class="b links" aria-label="İlgili listeler">
<?php if ($ilgiliListe): ?><h3>İlgili kelime listeleri</h3><div class="lk"><?= implode('', $ilgiliListe) ?></div><?php endif; ?>
<?php if ($komsu[0] || $komsu[1]): ?><h3>Alfabetik sırada yakın kelimeler</h3><div class="lk"><?php foreach (array_merge($komsu[0], $komsu[1]) as $x): ?><a href="<?= h(kurl($x)) ?>"><?= h($x) ?></a><?php endforeach; ?></div><?php endif; ?>
<h3>Araçlar</h3><div class="lk"><a href="/kelime-bulucu/?h=<?= h(rawurlencode($w)) ?>">Harflerinden türet</a><a href="/kelime-bulucu/?k=<?= h(rawurlencode($w . '*')) ?>">Bununla başlayanlar</a><a href="/kelime-bulucu/?k=<?= h(rawurlencode('*' . $w)) ?>">Bununla bitenler</a><a href="/kelime-bulucu/liste/">Tüm kelime listeleri</a></div>
</section>

<section class="b faq" aria-labelledby="hSss"><h2 id="hSss">Sık sorulan sorular</h2>
<?php foreach ($sss as $q): ?><details><summary><?= h($q[0]) ?></summary><p><?= h($q[1]) ?></p></details><?php endforeach; ?>
<p class="src">Anlamlar <a href="https://tr.wiktionary.org/" target="_blank" rel="noopener">Vikisözlük</a>'ten (CC BY-SA). Puanlar Türkçe Scrabble taş değerleridir; Scrabble, Hasbro ve Mattel'in markasıdır, bu sayfayla bağlantısı yoktur.</p>
</section>
<?php endif; ?>
</main>
<footer class="b"><span>© <span id="yr">2026</span> Sedat Okutan</span><nav aria-label="Diğer sayfalar"><a href="/">okutan.org</a><a href="/kelime-bulucu/">Kelime Bulucu</a><a href="/kelime-bulucu/liste/">Kelime Listeleri</a><a href="/gizli-kelime/">Gizli Kelime</a><a href="/oyunlar/">Oyunlar</a><a href="/kelimeler/">Kelimeler</a></nav></footer>
</div>
<script src="/kelime-bulucu/ortak.js?v=<?= V ?>" defer></script>
</body>
</html>
