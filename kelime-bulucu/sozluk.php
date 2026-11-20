<?php
/* Kelime Bulucu — A–Z sözlük dizini: /kelime-bulucu/sozluk/ , /kelime-bulucu/sozluk/<harf>/ , /kelime-bulucu/sozluk/<harf>/<sayfa>/
   Her kelime sayfasına tıklanabilir bağlantı verir (arama motorları 60.000+ kelimeye bağlantıyla ulaşır).
   Harf adresleri ASCII: ç → c-2, ğ → g-2, ı → i-2, ö → o-2, ş → s-2, ü → u-2. */
require __DIR__ . '/ortak.php';

$istenen = rawurldecode((string)strtok((string)($_SERVER['REQUEST_URI'] ?? ''), '?'));
$ON = '/kelime-bulucu/sozluk/';
$yol = strpos($istenen, $ON) === 0 ? trim(substr($istenen, strlen($ON)), '/') : trim((string)($_GET['y'] ?? ''), '/');
$p = $yol === '' ? [] : explode('/', $yol);
$SLUG_HARF = array_flip(HARF_SLUG);
$harf = null; $sayfa = 1;
if ($p) {
  $harf = $SLUG_HARF[$p[0]] ?? null;
  if ($harf === null) { // Türkçe harfli eski biçim (ç/) → yeni adres
    $t = temiz_kelime($p[0]);
    if (isset(HARF_SLUG[$t])) { header('Location: ' . durl($t, (int)($p[1] ?? 1)), true, 301); exit; }
  }
  $sayfa = isset($p[1]) ? (int)$p[1] : 1;
}
$gecersiz = $p && ($harf === null || count($p) > 2 || (isset($p[1]) && ($sayfa < 2 || (string)$sayfa !== $p[1])));

Sozluk::yukle();
$HARFLER = harfler('abcçdefgğhıijklmnoöprsştuüvyz');
$say = []; foreach (Sozluk::$S as $w) { $c = u8($w[0]); $say[$c] = ($say[$c] ?? 0) + 1; }

if ($gecersiz || ($harf !== null && $sayfa > max(1, (int)ceil(($say[$harf] ?? 0) / DIZIN_SAYFA)))) {
  http_response_code(404);
  sayfa_bas(['baslik' => 'Sayfa bulunamadı | okutan.org', 'durum' => 404, 'crumb' => '<a href="/kelime-bulucu/">Kelime Bulucu</a> / <a href="/kelime-bulucu/sozluk/">Sözlük</a>']);
  echo '<section class="b intro"><div class="label">404</div><h1 id="pageTitle">Bu sözlük sayfası yok</h1><p><a href="/kelime-bulucu/sozluk/">A–Z sözlük dizinine</a> dön.</p></section>';
  sayfa_son(); exit;
}
if ($istenen !== '' && strpos($istenen, $ON) === 0 && $istenen !== ($harf ? durl($harf, $sayfa) : $ON)) { header('Location: ' . ($harf ? durl($harf, $sayfa) : $ON), true, 301); exit; }

$abc = '<div class="lk abc">' . implode('', array_map(fn($c) => isset($say[$c]) ? '<a href="' . durl($c) . '"' . ($c === $harf ? ' class="on"' : '') . '>' . h(tr_upper($c)) . '</a>' : '', $HARFLER)) . '</div>';

if ($harf === null) {
  $sss = [['Sözlükte kaç kelime var?', 'Sözlükte ' . sayi(count(Sozluk::$S)) . ' Türkçe kelime var. Her kelimenin anlamı, hecelenişi, Scrabble puanı, harflerinden türetilen kelimeler ve anagramları kendi sayfasında yer alır.'],
    ['Kelimelerin anlamları nereden geliyor?', "Anlamlar, türler, örnek cümleler ve kökenler Vikisözlük'ten (CC BY-SA) alınır. Sözlüğün kendisi Kelimeler oyununun Türkçe kelime listesidir."]];
  sayfa_bas(['baslik' => 'Türkçe Sözlük A–Z — ' . sayi(count(Sozluk::$S)) . ' Kelime, Anlamları ve Scrabble Puanları | okutan.org',
    'aciklama' => 'A’dan Z’ye Türkçe sözlük dizini: ' . sayi(count(Sozluk::$S)) . ' kelime, her biri anlamı, hecelenişi, Scrabble puanı ve türetilen kelimeleriyle. Harfe göre gez.',
    'can' => SITE . $ON, 'og_baslik' => 'Türkçe Sözlük A–Z', 'crumb' => '<a href="/kelime-bulucu/">Kelime Bulucu</a> / <b>Sözlük</b>',
    'jsonld' => ['@context' => 'https://schema.org', '@graph' => [breadcrumb([['Sözlük', SITE . $ON]]), faq($sss)]]]);
  ?>
<section class="b intro" aria-labelledby="pageTitle">
<div class="label"><?= sayi(count(Sozluk::$S)) ?> kelime · 29 harf</div>
<h1 id="pageTitle">Türkçe Sözlük A–Z</h1>
<p>Sözlükteki bütün kelimeler harf harf. Bir harf seç, kelimeleri anlamları ve Scrabble puanlarıyla gör; kelimeye dokununca anlamları, hecelenişi, türetilen kelimeleri ve anagramları açılır.</p>
</section>
<section class="b links" aria-label="Harfler"><h3>Harf seç</h3><?= $abc ?>
<h3>Harflere göre kelime sayısı</h3><div class="lk"><?php foreach ($HARFLER as $c): if (!isset($say[$c])) continue; ?><a href="<?= durl($c) ?>"><?= h(tr_upper($c)) ?><small><?= sayi($say[$c]) ?></small></a><?php endforeach; ?></div></section>
<section class="b faq" aria-labelledby="hSss"><h2 id="hSss">Sık sorulan sorular</h2><?php foreach ($sss as $q): ?><details><summary><?= h($q[0]) ?></summary><p><?= h($q[1]) ?></p></details><?php endforeach; ?></section>
<?php sayfa_son(); exit;
}

// ---------- harf sayfası ----------
$H5 = l5($harf); $ws = [];
foreach (Sozluk::$S as $w) if ($w[0] === $H5) $ws[] = $w;
$toplam = count($ws); $sayfaSay = (int)ceil($toplam / DIZIN_SAYFA);
$dilim = array_map('u8', array_slice($ws, ($sayfa - 1) * DIZIN_SAYFA, DIZIN_SAYFA));
$ilk = $dilim[0]; $son = end($dilim);
$H = tr_upper($harf);
$ek = $sayfaSay > 1 ? " (Sayfa $sayfa/$sayfaSay)" : '';
$sayfalar = function () use ($harf, $sayfa, $sayfaSay) {
  if ($sayfaSay < 2) return '';
  $o = '<nav class="sayfalar" aria-label="Sayfalar">';
  if ($sayfa > 1) $o .= '<a href="' . durl($harf, $sayfa - 1) . '" rel="prev">← Önceki</a>';
  for ($i = 1; $i <= $sayfaSay; $i++) $o .= $i === $sayfa ? '<b aria-current="page">' . $i . '</b>' : '<a href="' . durl($harf, $i) . '">' . $i . '</a>';
  if ($sayfa < $sayfaSay) $o .= '<a href="' . durl($harf, $sayfa + 1) . '" rel="next">Sonraki →</a>';
  return $o . '</nav>';
};
sayfa_bas(['baslik' => "$H Harfi — Türkçe Sözlük$ek: " . tr_upper($ilk) . '–' . tr_upper($son) . ' | okutan.org',
  'aciklama' => "Türkçe sözlükte $H harfiyle başlayan " . sayi($toplam) . " kelime$ek: " . implode(', ', array_slice($dilim, 0, 6)) . ' … anlamları ve Scrabble puanlarıyla.',
  'can' => SITE . durl($harf, $sayfa), 'og_baslik' => "Türkçe Sözlük: $H harfi$ek",
  'crumb' => '<a href="/kelime-bulucu/">Kelime Bulucu</a> / <a href="/kelime-bulucu/sozluk/">Sözlük</a> / <b>' . h($H) . ($sayfa > 1 ? " · $sayfa" : '') . '</b>',
  'jsonld' => ['@context' => 'https://schema.org', '@graph' => [breadcrumb([['Sözlük', SITE . $ON], ["$H harfi$ek", SITE . durl($harf, $sayfa)]])]]]);
?>
<section class="b intro" aria-labelledby="pageTitle">
<div class="label">Sözlük · <?= h($H) ?> harfi · <?= sayi($toplam) ?> kelime<?= $sayfaSay > 1 ? " · sayfa $sayfa/$sayfaSay" : '' ?></div>
<h1 id="pageTitle"><?= h($H) ?> Harfi<?= h($ek) ?></h1>
<p><?= h(tr_upper($ilk)) ?> ile <?= h(tr_upper($son)) ?> arasındaki kelimeler, anlamları ve Scrabble puanlarıyla. <?= h($H) ?> ile başlayan kelimeleri harf sayısına göre görmek için <?= ($s = Listeler::slug('bas', $harf)) ? '<a href="' . lurl($s) . '">' . h($H) . ' ile başlayan kelimeler</a> listesine' : 'kelime listelerine' ?> bak.</p>
<?= $abc ?>
</section>
<section class="b" aria-label="Kelimeler">
<?= $sayfalar() ?>
<dl class="dizin"><?php foreach ($dilim as $w): $a = anlam_ilk($w); ?><div><dt><a href="<?= kurl($w) ?>"><?= h($w) ?></a><?= rozet(puan($w)) ?></dt><?php if ($a): ?><dd><?= h(mb_strlen($a) > 110 ? rtrim(mb_substr($a, 0, 107)) . '…' : $a) ?></dd><?php endif; ?></div><?php endforeach; ?></dl>
<?= $sayfalar() ?>
<p class="src">Anlamlar: <a href="https://tr.wiktionary.org/" target="_blank" rel="noopener">Vikisözlük</a> (CC BY-SA).</p>
</section>
<?php sayfa_son();
