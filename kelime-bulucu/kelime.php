<?php
/* Kelime Bulucu — kelime sayfası: /kelime-bulucu/kelime/<ascii-adres>/ (.htaccess bu dosyaya yönlendirir).
   Adreslerde Türkçe karakter yok (ortak.php: Sozluk::slug / Sozluk::kelime). Türkçe karakterli eski adresler 301 ile yeni adrese gider. */
require __DIR__ . '/ortak.php';

$istenen = rawurldecode((string)strtok((string)($_SERVER['REQUEST_URI'] ?? ''), '?'));
$ON = '/kelime-bulucu/kelime/';
$parca = strpos($istenen, $ON) === 0 ? explode('/', substr($istenen, strlen($ON)))[0] : (string)($_GET['k'] ?? '');
if (!mb_check_encoding($parca, 'UTF-8')) $parca = (string)@iconv('WINDOWS-1254', 'UTF-8//IGNORE', $parca);
$parca = trim($parca);
if ($parca === '') { header('Location: /kelime-bulucu/', true, 302); exit; }

Sozluk::yukle();
$w = null;
if (preg_match('/^[a-z]+(-\d+)?$/', $parca)) $w = Sozluk::kelime($parca);   // ASCII adres
if ($w === null) {                                                           // Türkçe karakterli/büyük harfli eski adres ya da ?k=
  $t = preg_match('/^[a-zCGIOSU]+$/', $parca) && preg_match('/[CGIOSU]/', $parca) ? arac_coz($parca) : temiz_kelime($parca); // asI → ası (araç kodu)
  if (!Sozluk::var($t)) $t = temiz_kelime($parca);
  if ($t !== '' && Sozluk::var($t)) { header('Location: ' . kurl($t), true, 301); exit; }
  $w = null; $aranan = $t !== '' ? $t : $parca;
}
if ($w !== null && $istenen !== kurl($w) && strpos($istenen, $ON) === 0) { header('Location: ' . kurl($w), true, 301); exit; }

// ---------- sözlükte yok ----------
if ($w === null) {
  http_response_code(404);
  $A5 = strtr(l5($aranan), TR_L5, 'cgiosu'); $L = strlen($A5); $oneri = [];
  foreach (Sozluk::$asc as $i => $a) if (strlen($a) === $L && strlen(str_replace("\0", '', $a ^ $A5)) <= 1) { $oneri[] = u8(Sozluk::$S[$i]); if (count($oneri) >= 30) break; }
  sayfa_bas(['baslik' => tr_upper($aranan) . ' — sözlükte yok | okutan.org', 'durum' => 404, 'crumb' => '<a href="/kelime-bulucu/">Kelime Bulucu</a> / <b>Bulunamadı</b>']);
  ?>
<section class="b intro"><div class="label">Sözlükte yok</div><h1 id="pageTitle"><?= h(tr_upper($aranan)) ?> sözlüğümüzde yok</h1>
<p>Bu kelime 60.000'den fazla kelimelik Türkçe sözlüğümüzde bulunamadı. Yazımı kontrol et ya da harflerini kelime bulucuda ara.</p>
<div class="mlinks"><a href="<?= h(arac_url('h', temiz_kelime($aranan))) ?>">Harflerinden kelime türet</a><a href="https://sozluk.gov.tr/?kelime=<?= h(rawurlencode($aranan)) ?>" target="_blank" rel="noopener">TDK sözlükte ara ↗</a></div>
<?php if ($oneri): ?><h2 class="wh">Bunu mu demek istedin?</h2><?= cipler($oneri) ?><?php endif; ?></section>
<?php sayfa_son(); exit;
}

// ---------- hesaplar ----------
$S = Sozluk::$S; $W = l5($w); $L = strlen($W);
$wc = count_chars($W, 1);
$turetilen = $anagram = $benzer = $basla = $biten = $icinde = [];
$kafiye = []; $kMin = $L <= 3 ? 2 : 3; // en az bu kadar son harfi ortak olanlar (kelimenin tamamıyla bitenler hariç)
$nBasla = $nBiten = $nIcinde = 0;
$anahtar = function (string $x): string { $a = str_split($x); sort($a); return implode('', $a); };
$wk = $anahtar($W);
foreach ($S as $x) {
  $xl = strlen($x);
  if ($x === $W) continue;
  $o = 0; $mx = min($xl, $L);
  while ($o < $mx && $x[$xl - 1 - $o] === $W[$L - 1 - $o]) $o++;
  if ($o >= $kMin && $o < $L && $o < $xl) $kafiye[$o][] = $x;
  if ($xl < $L) { $ok = true; foreach (count_chars($x, 1) as $b => $c) if (($wc[$b] ?? 0) < $c) { $ok = false; break; } if ($ok) $turetilen[] = $x; continue; }
  if ($xl === $L) { if (strlen(str_replace("\0", '', $x ^ $W)) === 1) $benzer[] = $x; if ($anahtar($x) === $wk) $anagram[] = $x; continue; }
  if (strncmp($x, $W, $L) === 0) { $nBasla++; if (count($basla) < 40) $basla[] = $x; }
  if (substr($x, -$L) === $W) { $nBiten++; if (count($biten) < 40) $biten[] = $x; }
  elseif (strpos($x, $W) !== false && strncmp($x, $W, $L) !== 0) { $nIcinde++; if (count($icinde) < 40) $icinde[] = $x; }
}
$u = fn(array $a) => array_map('u8', $a);
[$turetilen, $anagram, $benzer, $basla, $biten, $icinde] = [$u($turetilen), $u($anagram), $u($benzer), $u($basla), $u($biten), $u($icinde)];
usort($turetilen, fn($a, $b) => puan($b) <=> puan($a) ?: mb_strlen($b) <=> mb_strlen($a) ?: strcmp(l5($a), l5($b)));
krsort($kafiye); $kafiyeL = []; $kafiyeN = 0; $kSik = sik();
foreach ($kafiye as $o => $l) { $kafiyeN += count($l); $l = array_map('u8', $l); usort($l, fn($a, $b) => ($kSik[$a] ?? 1e9) <=> ($kSik[$b] ?? 1e9) ?: mb_strlen($a) <=> mb_strlen($b)); foreach ($l as $x) { if (count($kafiyeL) >= 48) break 2; $kafiyeL[] = $x; } }
$i = Sozluk::$idx[$W];
$komsu = [$u(array_slice($S, max(0, $i - 6), min(6, $i))), $u(array_slice($S, $i + 1, 6))];
$kardes = Sozluk::kardesler($w);

$hs = harfler($w); $harfSay = count($hs); $puan = puan($w); $heceler = hece($w);
$sesli = array_values(array_filter($hs, fn($c) => mb_strpos(SESLI, $c) !== false));
$ters = implode('', array_reverse($hs));
$enDeger = array_reduce($hs, fn($a, $c) => (PUAN[$c] ?? 0) > (PUAN[$a] ?? 0) ? $c : $a, $hs[0]);
$fazla = torba_fazla($w);
$Wc = cumle($w); $W_ = tr_upper($w);
$Z = anlam_zengin($w);
$ilk = $Z['t'][0]['a'][0]['d'] ?? null;
$sik = sik(); $sikSira = $sik[$w] ?? null;

$kisa = $ilk ? (mb_strlen($ilk) > 110 ? rtrim(mb_substr($ilk, 0, 107)) . '…' : $ilk) : '';
$baslik = "$Wc Ne Demek? Anlamı, Hecelenişi, Scrabble Puanı ve Türetilen Kelimeler | okutan.org";
$aciklama = ($kisa ? "$Wc ne demek: $kisa " : "$Wc kelimesi: ") . "$harfSay harfli, " . count($heceler) . ' heceli (' . implode('-', $heceler) . "), Scrabble'da $puan puan. $W_ harfleriyle türetilen " . sayi(count($turetilen)) . ' kelime, anagramlar ve benzer kelimeler.';
$can = SITE . kurl($w);

$hf0 = $hs[0]; $hfS = $hs[$harfSay - 1];
$ilgili = array_filter([
  link_lst(Listeler::slug('bas', $hf0), "$hf0|bas"), link_lst(Listeler::slug('basUz', $hf0, $harfSay), "$hf0|basUz|$harfSay"), link_lst(Listeler::slug('uz', '', $harfSay)),
  link_lst(Listeler::slug('bit', $hfS)), link_lst(Listeler::slug('bitUz', $hfS, $harfSay)),
  $harfSay >= 2 ? link_lst(Listeler::slug('bas', mb_substr($w, 0, 2))) : '', $harfSay >= 3 ? link_lst(Listeler::slug('bas', mb_substr($w, 0, 3))) : '',
  $harfSay >= 3 ? link_lst(Listeler::slug('bit', mb_substr($w, -3))) : '', $harfSay >= 2 ? link_lst(Listeler::slug('bit', mb_substr($w, -2))) : '',
  link_lst(Listeler::slug('puan', '', $harfSay), null, "En yüksek puanlı $harfSay harfli"),
]);
function link_lst(?string $s, ?string $_ = null, ?string $metin = null): string {
  if (!$s || !($x = Listeler::bilgi($s))) return '';
  [$t, $k, $L] = $x; $K = tr_upper($k);
  $m = $metin ?? ['bas' => "$K ile başlayan kelimeler", 'bit' => "$K ile biten kelimeler", 'uz' => "$L harfli kelimeler", 'basUz' => "$K ile başlayan $L harfli", 'bitUz' => "$K ile biten $L harfli"][$t] ?? $s;
  return '<a href="' . lurl($s) . '">' . h($m) . '</a>';
}

$sss = array_values(array_filter([
  ["$Wc ne demek?", $ilk ? "$Wc: $ilk" . (isset($Z['t'][0]['a'][1]) ? ' Ayrıca: ' . $Z['t'][0]['a'][1]['d'] : '') : "$Wc kelimesinin anlamı sözlüğümüzde henüz yok; TDK Güncel Türkçe Sözlük'e bakabilirsin."],
  ["$Wc kaç harfli, kaç heceli?", "$Wc $harfSay harfli bir kelimedir: " . count($sesli) . ' sesli, ' . ($harfSay - count($sesli)) . ' sessiz harf. ' . count($heceler) . ' heceden oluşur: ' . implode('-', $heceler) . '.'],
  ["$Wc Scrabble'da kaç puan?", "Türkçe Scrabble taş puanlarıyla $W_ $puan puan eder (" . implode(' + ', array_map(fn($c) => tr_upper($c) . ' ' . (PUAN[$c] ?? 0), $hs)) . '). ' . ($fazla === 0 ? 'Torbadaki taşlarla kurulabilir.' : "Torbada yeterli taş olmadığı için $fazla joker gerekir.")],
  isset($Z['k']) ? ["$Wc kelimesinin kökeni nedir?", "$Wc kelimesi " . $Z['k'] . ' kökenlidir.'] : null,
  ["$W_ harfleriyle hangi kelimeler türetilir?", $turetilen ? "$W_ harflerinden " . sayi(count($turetilen)) . ' kelime türetilir. En yüksek puanlıları: ' . implode(', ', array_map(fn($x) => $x . ' (' . puan($x) . ')', array_slice($turetilen, 0, 8))) . '.' : "$W_ harfleriyle türetilebilen başka bir kelime yok."],
  $kafiyeL ? ["$Wc ile kafiyeli kelimeler hangileri?", "$Wc ile kafiyeli (sonu aynı seslerle biten) kelimelerden bazıları: " . implode(', ', array_slice($kafiyeL, 0, 15)) . '.'] : null,
  $anagram ? ["$Wc kelimesinin anagramı var mı?", 'Evet, aynı harflerle yazılan kelimeler: ' . implode(', ', $anagram) . '.'] : null,
]));
$jsonld = ['@context' => 'https://schema.org', '@graph' => [
  ['@type' => 'DefinedTerm', 'name' => $w, 'url' => $can, 'description' => $ilk ?: "$Wc, $harfSay harfli Türkçe kelime.", 'inLanguage' => 'tr',
    'inDefinedTermSet' => ['@type' => 'DefinedTermSet', 'name' => 'Kelime Bulucu Türkçe sözlüğü', 'url' => SITE . '/kelime-bulucu/']],
  breadcrumb([[$Wc, $can]]), faq($sss)]];

sayfa_bas(['baslik' => $baslik, 'aciklama' => $aciklama, 'can' => $can, 'og_tur' => 'article', 'og_baslik' => "$Wc ne demek?",
  'og_img' => SITE . '/kelime-bulucu/og.php?k=' . Sozluk::slug($w), 'og_alt' => "$W_: harf taşları, $puan puan" . ($kisa ? ", $kisa" : ''),
  'crumb' => '<a href="/kelime-bulucu/">Kelime Bulucu</a> / <a href="/kelime-bulucu/liste/">Listeler</a> / <b>' . h($W_) . '</b>', 'jsonld' => $jsonld]);
$sesliMi = fn($c) => mb_strpos(SESLI, $c) !== false;
?>
<section class="b intro wp" aria-labelledby="pageTitle">
<div class="label">Kelime · <?= $harfSay ?> harf · <?= $puan ?> puan<?= $sikSira !== null && $sikSira < 3000 ? ' · sık kullanılır' : '' ?></div>
<h1 id="pageTitle"><?= h($Wc) ?> ne demek?</h1>
<div class="tiles big" aria-label="<?= h($W_) ?>"><?php foreach ($hs as $c): ?><i class="<?= $sesliMi($c) ? 'sl' : 'ss' ?>" aria-hidden="true"><?= h(tr_upper($c)) ?><small><?= PUAN[$c] ?? 0 ?></small></i><?php endforeach; ?><b class="tsum" title="Toplam puan"><?= $puan ?></b></div>
<?php if ($ilk): ?>
<p class="anlam"><?= h($ilk) ?></p>
<?php else: ?>
<p class="anlam none"><?= h($Wc) ?> kelimesinin anlamı sözlüğümüzde henüz yok. <a href="https://sozluk.gov.tr/?kelime=<?= h(rawurlencode($w)) ?>" target="_blank" rel="noopener">TDK Güncel Türkçe Sözlük'te bak ↗</a></p>
<?php endif; ?>
<?php if (!empty($Z['ses'])): ?><p class="dinle-s"><button type="button" class="dinle" data-ses="https://commons.wikimedia.org/wiki/Special:FilePath/<?= h(rawurlencode($Z['ses'])) ?>"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>Dinle</button><small>Ses kaydı: Wikimedia Commons</small></p><?php endif; ?>
<?php if ($kardes): ?><p class="src">Benzer yazılış: <?php foreach ($kardes as $j => $x): ?><?= $j ? ', ' : '' ?><a href="<?= kurl($x) ?>"><b><?= h($x) ?></b></a><?php endforeach; ?></p><?php endif; ?>
<div class="chips">
<span class="chip"><b><?= $harfSay ?></b><span>harf</span></span>
<span class="chip"><b><?= $puan ?></b><span>Scrabble puanı</span></span>
<span class="chip"><b><?= count($heceler) ?></b><span>hece</span></span>
<span class="chip"><b><?= count($sesli) ?> / <?= $harfSay - count($sesli) ?></b><span>sesli / sessiz</span></span>
<span class="chip"><b><?= sayi(count($turetilen)) ?></b><span>türetilen kelime</span></span>
<span class="chip"><b><?= $fazla === 0 ? '✓' : "+$fazla joker" ?></b><span>torbayla kurulur</span></span>
</div>
<?= paylas_html($can, "$Wc ne demek? $harfSay harf, $puan puan" . ($kisa ? ": $kisa" : '')) ?>
<div class="hecev" aria-label="Heceler: <?= h(implode('-', $heceler)) ?>"><?php foreach ($heceler as $j => $hc): ?><span class="hc h<?= $j % 3 ?>"><?php foreach (harfler($hc) as $c): ?><i class="<?= $sesliMi($c) ? 'sl' : 'ss' ?>"><?= h(tr_upper($c)) ?></i><?php endforeach; ?></span><?php endforeach; ?><span class="hleg"><i class="sl">A</i> sesli <i class="ss">B</i> sessiz</span></div>
</section>

<?php if ($Z && !empty($Z['t'][0]['tur'])): ?>
<section class="b" aria-labelledby="hAnl">
<h2 id="hAnl"><?= h($Wc) ?> kelimesinin anlamları <small class="cnt"><?= array_sum(array_map(fn($t) => count($t['a']), $Z['t'])) ?></small></h2>
<?php if (!empty($Z['k'])): ?><p class="sub2">Köken: <b><?= h($Z['k']) ?></b></p><?php endif; ?>
<?php foreach ($Z['t'] as $tur): ?>
<div class="tur"><span class="turad"><?= h($tur['tur']) ?></span>
<ol class="anl"><?php foreach ($tur['a'] as $a): ?><li><?php foreach ($a['e'] ?? [] as $e): ?><span class="et"><?= h($e) ?></span><?php endforeach; ?><?= h($a['d']) ?><?php foreach ($a['o'] ?? [] as $o): ?><q><?= h($o) ?></q><?php endforeach; ?></li><?php endforeach; ?></ol></div>
<?php endforeach; ?>
<?php if (!empty($Z['s'])): ?><p class="sub2">Eş anlamlıları: <?php foreach ($Z['s'] as $j => $x): $x5 = temiz_kelime($x); ?><?= $j ? ', ' : '' ?><?= Sozluk::var($x5) && $x5 === tr_lower($x) ? '<a href="' . kurl($x5) . '">' . h($x) . '</a>' : h($x) ?><?php endforeach; ?></p><?php endif; ?>
<?php if (!empty($Z['dy'])): ?><p class="sub2">Deyimler ve atasözleri: <?= h(implode(' · ', $Z['dy'])) ?></p><?php endif; ?>
<p class="src">Kaynak: <a href="https://tr.wiktionary.org/wiki/<?= h(rawurlencode($w)) ?>" target="_blank" rel="noopener">Vikisözlük</a> (CC BY-SA) · <a href="https://sozluk.gov.tr/?kelime=<?= h(rawurlencode($w)) ?>" target="_blank" rel="noopener">TDK sözlükte bak ↗</a></p>
</section>
<?php endif; ?>

<section class="b" aria-labelledby="hHak">
<h2 id="hHak"><?= h($Wc) ?> kelimesi hakkında</h2>
<ul class="rules">
<li><b><?= h($Wc) ?></b> <?= $harfSay ?> harfli, <?= count($heceler) ?> heceli bir kelimedir; hecelere <b><?= h(implode('-', $heceler)) ?></b> diye ayrılır.</li>
<li><?= count($sesli) ?> sesli (<?= h(implode(', ', array_unique($sesli))) ?>) ve <?= $harfSay - count($sesli) ?> sessiz harf içerir.</li>
<li>Türkçe Scrabble taş puanlarıyla <b><?= $puan ?> puan</b> eder; en değerli harfi <b><?= h(tr_upper($enDeger)) ?></b> (<?= PUAN[$enDeger] ?? 0 ?> puan). <?= $fazla === 0 ? 'Torbadaki taşlarla kurulabilir.' : "Torbada yeterli taş olmadığından <b>$fazla joker</b> gerekir." ?></li>
<li>Tersten yazılışı <b><?= h($ters) ?></b><?= $ters === $w ? ': tersinden de aynı okunur (palindrom).' : (Sozluk::var($ters) ? ', bu da sözlükte olan bir kelime: <a href="' . kurl($ters) . '">' . h($ters) . '</a>.' : '.') ?></li>
<?php if ($komsu[0] || $komsu[1]): ?><li>Alfabetik sırada <?= $komsu[0] ? '<a href="' . kurl(end($komsu[0])) . '">' . h(end($komsu[0])) . '</a>' : '' ?><?= $komsu[0] && $komsu[1] ? ' ile ' : '' ?><?= $komsu[1] ? '<a href="' . kurl($komsu[1][0]) . '">' . h($komsu[1][0]) . '</a>' : '' ?> <?= $komsu[0] && $komsu[1] ? 'arasında' : 'yanında' ?> gelir.</li><?php endif; ?>
</ul>
</section>

<?php if ($turetilen): ?>
<section class="b" aria-labelledby="hTur">
<h2 id="hTur"><?= h($W_) ?> harflerinden türetilen kelimeler <small class="cnt"><?= sayi(count($turetilen)) ?></small></h2>
<p class="sub2">Kelimenin harfleriyle, her harf bir kez kullanılarak kurulabilen kelimeler; puana göre sıralı.</p>
<?= cipler(array_slice($turetilen, 0, 60), null, 'wl') ?>
<?php if (count($turetilen) > 60): ?><a class="more" href="<?= h(arac_url('h', $w)) ?>">Tüm <?= sayi(count($turetilen)) ?> kelimeyi kelime bulucuda gör →</a><?php endif; ?>
</section>
<?php endif; ?>

<?php if ($kafiyeL): ?>
<section class="b" aria-labelledby="hKaf">
<h2 id="hKaf"><?= h($Wc) ?> ile kafiyeli kelimeler <small class="cnt"><?= sayi($kafiyeN) ?></small></h2>
<p class="sub2">Sonu <?= h($W_) ?> ile aynı seslerle biten kelimeler; en çok harfi ortak olanlar önce. Şiir, şarkı sözü ve tekerleme için.</p>
<?= cipler($kafiyeL, fn($x) => (function ($x) use ($w) { $o = 0; $a = harfler($x); $b = harfler($w); while ($o < count($a) && $o < count($b) && $a[count($a) - 1 - $o] === $b[count($b) - 1 - $o]) $o++; return h(implode('', array_slice($a, 0, count($a) - $o))) . '<b>' . h(implode('', array_slice($a, count($a) - $o))) . '</b>'; })($x), 'wl') ?>
</section>
<?php endif; ?>

<?= kelimeler_kart($w) ?>

<?php if ($anagram || $benzer): ?>
<div class="cols2">
<?php if ($anagram): ?><section class="b" aria-labelledby="hAna"><h2 id="hAna">Anagramlar <small class="cnt"><?= count($anagram) ?></small></h2><p class="sub2">Aynı harflerin farklı dizilişiyle yazılan kelimeler.</p><?= cipler($anagram, null, 'wl') ?></section><?php endif; ?>
<?php if ($benzer): ?><section class="b" aria-labelledby="hBen"><h2 id="hBen">Benzer kelimeler <small class="cnt"><?= count($benzer) ?></small></h2><p class="sub2">Yalnızca bir harfi farklı olan <?= $harfSay ?> harfli kelimeler.</p><?= cipler(array_slice($benzer, 0, 40), null, 'wl') ?></section><?php endif; ?>
</div>
<?php endif; ?>

<?php foreach ([[$basla, $nBasla, "$W_ ile başlayan kelimeler", Listeler::slug('bas', $w), "$w*"], [$biten, $nBiten, "$W_ ile biten kelimeler", Listeler::slug('bit', $w), "*$w"], [$icinde, $nIcinde, "İçinde $W_ geçen kelimeler", Listeler::slug('ic', $w), "*$w*"]] as [$arr, $n, $bas, $ls, $kal]): if (!$arr) continue; ?>
<section class="b"><h2><?= h($bas) ?> <small class="cnt"><?= sayi($n) ?></small></h2><?= cipler($arr, null, 'wl') ?>
<?php if ($n > count($arr)): ?><a class="more" href="<?= $ls ? lurl($ls) : h(arac_url('k', $kal)) ?>">Tüm <?= sayi($n) ?> kelimeyi gör →</a><?php endif; ?></section>
<?php endforeach; ?>

<section class="b links" aria-label="İlgili listeler">
<?php if ($ilgili): ?><h3>İlgili kelime listeleri</h3><div class="lk"><?= implode('', $ilgili) ?></div><?php endif; ?>
<?php if ($komsu[0] || $komsu[1]): ?><h3>Alfabetik sırada yakın kelimeler</h3><div class="lk"><?php foreach (array_merge($komsu[0], $komsu[1]) as $x): ?><a href="<?= kurl($x) ?>"><?= h($x) ?></a><?php endforeach; ?></div><?php endif; ?>
<h3>Araçlar</h3><div class="lk"><a href="<?= h(arac_url('h', $w)) ?>">Harflerinden türet</a><a href="<?= h(arac_url('k', "$w*")) ?>">Bununla başlayanlar</a><a href="<?= h(arac_url('k', "*$w")) ?>">Bununla bitenler</a><a href="/kelime-bulucu/liste/">Tüm kelime listeleri</a></div>
</section>

<section class="b faq" aria-labelledby="hSss"><h2 id="hSss">Sık sorulan sorular</h2>
<?php foreach ($sss as $q): ?><details><summary><?= h($q[0]) ?></summary><p><?= h($q[1]) ?></p></details><?php endforeach; ?>
<p class="src">Anlamlar <a href="https://tr.wiktionary.org/" target="_blank" rel="noopener">Vikisözlük</a>'ten (CC BY-SA). Puanlar Türkçe Scrabble taş değerleridir; Scrabble, Hasbro ve Mattel'in markasıdır, bu sayfayla bağlantısı yoktur.</p>
</section>
<?php sayfa_son();
