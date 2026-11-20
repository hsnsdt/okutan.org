<?php
/* Kelime Bulucu — liste sayfaları: /kelime-bulucu/liste/<slug>/ ve dizin /kelime-bulucu/liste/ (.htaccess bu dosyaya yönlendirir).
   Hangi listelerin olduğu veri/listeler.json'da (üretici yazar); kelimeler istek anında sözlükten süzülür. */
require __DIR__ . '/ortak.php';

$istenen = rawurldecode((string)strtok((string)($_SERVER['REQUEST_URI'] ?? ''), '?'));
$ON = '/kelime-bulucu/liste/';
$slug = strpos($istenen, $ON) === 0 ? trim(substr($istenen, strlen($ON)), '/') : (string)($_GET['s'] ?? '');
if (strpos($slug, '/') !== false) $slug = explode('/', $slug)[0];
if ($slug === 'index.html') $slug = '';
Listeler::yukle();

// Eski (Türkçe karakterli) adresler → yeni ASCII adres
if ($slug !== '' && !Listeler::bilgi($slug)) {
  $eski = tr_lower($slug); $bul = null;
  foreach (Listeler::$L as $s => [$t, $k, $L]) {
    $o = ['bas' => "$k-ile-baslayan-kelimeler", 'bit' => "$k-ile-biten-kelimeler", 'ic' => "icinde-$k-gecen-kelimeler", 'basUz' => "$k-ile-baslayan-$L-harfli-kelimeler", 'bitUz' => "$k-ile-biten-$L-harfli-kelimeler"][$t] ?? null;
    if ($o === $eski) { $bul = $s; break; }
  }
  if ($bul) { header('Location: ' . lurl($bul), true, 301); exit; }
  http_response_code(404);
  sayfa_bas(['baslik' => 'Liste bulunamadı | okutan.org', 'crumb' => '<a href="/kelime-bulucu/">Kelime Bulucu</a> / <a href="/kelime-bulucu/liste/">Listeler</a>', 'durum' => 404]);
  echo '<section class="b intro"><div class="label">404</div><h1 id="pageTitle">Bu liste yok</h1><p>Aradığın kelime listesi bulunamadı. <a href="/kelime-bulucu/liste/">Kelime listeleri dizinine</a> ya da <a href="/kelime-bulucu/">kelime bulucuya</a> göz at.</p></section>';
  sayfa_son(); exit;
}
if ($slug !== '' && $istenen !== $ON . $slug . '/' && strpos($istenen, $ON) === 0) { header('Location: ' . lurl($slug), true, 301); exit; }

Sozluk::yukle();
$S = Sozluk::$S;
$K = fn(string $k) => tr_upper($k);
$HARF = harfler('abcçdefgğhıijklmnoöprsştuüvyz');

// ---------- kelimeleri süz ----------
function puan_l5(string $w): int {
  static $P = null;
  if ($P === null) { $P = []; foreach (PUAN as $c => $p) $P[l5($c)] = $p; }
  $t = 0; for ($i = 0, $n = strlen($w); $i < $n; $i++) $t += $P[$w[$i]] ?? 0; return $t;
}
function suz(string $t, string $k, int $L): array {
  $S = Sozluk::$S; $K5 = l5($k); $kl = strlen($K5); $o = [];
  switch ($t) {
    case 'bas': foreach ($S as $w) if (strlen($w) > $kl && strncmp($w, $K5, $kl) === 0) $o[] = $w; break;
    case 'bit': foreach ($S as $w) if (strlen($w) > $kl && substr($w, -$kl) === $K5) $o[] = $w; break;
    case 'ic': foreach ($S as $w) if ($w !== $K5 && strpos($w, $K5) !== false) $o[] = $w; break;
    case 'uz': foreach ($S as $w) if (strlen($w) === $L) $o[] = $w; break;
    case 'basUz': foreach ($S as $w) if (strlen($w) === $L && $w[0] === $K5) $o[] = $w; break;
    case 'bitUz': foreach ($S as $w) if (strlen($w) === $L && $w[$L - 1] === $K5) $o[] = $w; break;
    case 'puan': case 'deger':
      $p = [];
      foreach ($S as $w) {
        if ($t === 'puan' && $L && strlen($w) !== $L) continue;
        if ($t === 'deger' && (strlen($w) > 5 || !preg_match('/[j\xF0fv\xF6]/', $w))) continue;
        $p[$w] = puan_l5($w);
      }
      uksort($p, fn($a, $b) => $p[$b] <=> $p[$a] ?: strlen($a) <=> strlen($b) ?: strcmp($a, $b));
      $o = array_keys($p); if ($t === 'puan') $o = array_slice($o, 0, 300);
      break;
  }
  return array_map('u8', $o);
}
function ad(array $x): string { [$t, $k, $L] = $x; $K = tr_upper($k);
  return ['bas' => "$K ile Başlayan Kelimeler", 'bit' => "$K ile Biten Kelimeler", 'ic' => "İçinde $K Geçen Kelimeler", 'uz' => "$L Harfli Kelimeler",
    'basUz' => "$K ile Başlayan $L Harfli Kelimeler", 'bitUz' => "$K ile Biten $L Harfli Kelimeler",
    'puan' => $L ? "En Yüksek Puanlı $L Harfli Kelimeler" : 'En Yüksek Puanlı Kelimeler', 'deger' => 'J, Ğ, F, Ö, V Geçen Kısa Kelimeler'][$t]; }
function ad_kisa(array $x): string { [$t, $k, $L] = $x; $K = tr_upper($k);
  return ['bas' => "$K ile başlayan", 'bit' => "$K ile biten", 'ic' => "İçinde $K geçen", 'uz' => "$L harfli", 'basUz' => "$K ile başlayan $L harfli",
    'bitUz' => "$K ile biten $L harfli", 'puan' => $L ? "En yüksek puanlı $L harfli" : 'En yüksek puanlı', 'deger' => 'Değerli harfli kısa'][$t]; }
function ifade(array $x): string { $s = ad_kisa($x); return $x[0] === 'ic' ? 'içinde ' . tr_upper($x[1]) . ' geçen' : ($x[0] === 'puan' || $x[0] === 'deger' ? mb_strtolower($s) : $s); }
function kalip(array $x): string { [$t, $k] = $x; return ['bas' => "$k*", 'basUz' => "$k*", 'bit' => "*$k", 'bitUz' => "*$k", 'ic' => "*$k*"][$t] ?? '*'; }
function vurgu(array $x, string $w): string {
  [$t, $k] = $x; $n = mb_strlen($k);
  if ($t === 'bas' || $t === 'basUz') return '<b>' . h(mb_substr($w, 0, $n)) . '</b>' . h(mb_substr($w, $n));
  if ($t === 'bit' || $t === 'bitUz') return h(mb_substr($w, 0, mb_strlen($w) - $n)) . '<b>' . h(mb_substr($w, -$n)) . '</b>';
  if ($t === 'ic') { $i = mb_strpos($w, $k); return h(mb_substr($w, 0, $i)) . '<b>' . h($k) . '</b>' . h(mb_substr($w, $i + $n)); }
  return h($w);
}
function link_l(?string $s, ?string $metin = null, bool $say = true): string {
  if (!$s || !($x = Listeler::bilgi($s))) return '';
  return '<a href="' . lurl($s) . '">' . h($metin ?? ad_kisa($x)) . ($say ? '<small>' . sayi((int)$x[3]) . '</small>' : '') . '</a>';
}
function gruplar(array $ws): array { $g = []; foreach ($ws as $w) $g[mb_strlen($w)][] = $w; ksort($g); return $g; }
$MINI = '<form class="mini" id="miniForm" action="/kelime-bulucu/" role="search"><input class="inp" id="miniInp" name="h" placeholder="Harflerini yaz: kalem*" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="16" aria-label="Harflerin"><button class="go" type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg><span>Kelime bul</span></button></form>';
$LEJANT = '<span class="pleg">Puan:' . str_replace('>1<', '>1–6<', rozet(1)) . str_replace('>7<', '>7–11<', rozet(7)) . str_replace('>12<', '>12–19<', rozet(12)) . str_replace('>20<', '>20+<', rozet(20)) . '</span>';

// =====================================================================
// DİZİN
// =====================================================================
if ($slug === '') {
  $grup = function (string $t, ?callable $f = null) { $o = []; foreach (Listeler::$L as $s => $x) if ($x[0] === $t && (!$f || $f($x))) $o[$s] = $x; uasort($o, fn($a, $b) => strcmp(l5($a[1]), l5($b[1])) ?: $a[2] <=> $b[2]); return $o; };
  $abc = fn(string $t) => implode('', array_map(fn($s, $x) => '<a href="' . lurl($s) . '">' . h(tr_upper($x[1])) . '</a>', array_keys($g = $grup($t, fn($x) => mb_strlen($x[1]) === 1)), $g));
  $liste = fn(array $g) => implode('', array_map(fn($s, $x) => '<a href="' . lurl($s) . '">' . h(tr_upper($x[1])) . '<small>' . sayi((int)$x[3]) . '</small></a>', array_keys($g), $g));
  $uz = $grup('uz'); uasort($uz, fn($a, $b) => $a[2] <=> $b[2]);
  $sss = [['Kaç kelime listesi var?', 'Toplam ' . sayi(count(Listeler::$L)) . ' liste var: harfle başlayan, biten, içinde geçen, harf sayısına göre, bunların birleşimleri ve Scrabble puanına göre listeler. Hepsi ' . sayi(count($S)) . ' kelimelik Türkçe sözlükten üretilir.'],
    ['Aradığım liste yoksa ne yapmalıyım?', "Kelime Bulucu'nun kalıpla arama sekmesinde ? tek harf, * ise herhangi sayıda harf yerine geçer. Örneğin ka* ka ile başlayan, *lık lık ile biten, k?t?p ise beş harfli ve k_t_p biçimindeki kelimeleri bulur."]];
  sayfa_bas(['baslik' => 'Kelime Listeleri — Harfle Başlayan, Biten, İçinde Geçen, Harf Sayısına ve Puana Göre Türkçe Kelimeler | okutan.org',
    'aciklama' => "Türkçe kelime listeleri: A'dan Z'ye harfle başlayan, biten, içinde geçen kelimeler; 2 harfliden 20 harfliye harf sayısına göre listeler; en yüksek Scrabble puanlı kelimeler. " . sayi(count(Listeler::$L)) . ' liste, ' . sayi(count($S)) . ' kelime.',
    'can' => SITE . '/kelime-bulucu/liste/', 'og_baslik' => 'Türkçe Kelime Listeleri', 'crumb' => '<a href="/kelime-bulucu/">Kelime Bulucu</a> / <b>Listeler</b>',
    'jsonld' => ['@context' => 'https://schema.org', '@graph' => [breadcrumb([['Kelime Listeleri', SITE . '/kelime-bulucu/liste/']]), faq($sss)]]]);
  ?>
<section class="b intro" aria-labelledby="pageTitle">
<div class="label"><?= sayi(count(Listeler::$L)) ?> liste · <?= sayi(count($S)) ?> kelime</div>
<h1 id="pageTitle">Türkçe Kelime Listeleri</h1>
<p>Harfle başlayan, harfle biten, içinde belli harfler geçen, harf sayısına ve Scrabble puanına göre ayrılmış Türkçe kelime listeleri. Bulmaca, Wordle tarzı oyunlar, Scrabble ve kelime türetme oyunları için. Her kelimenin yanında taş puanı yazar; kelimeye dokununca anlamı ve ayrıntıları açılır.</p>
<?= $MINI ?>
</section>
<section class="b links" aria-label="Listeler">
<h3>Scrabble</h3><div class="lk"><?php foreach ($grup('puan') as $s => $x) echo link_l($s, null, false); foreach ($grup('deger') as $s => $x) echo link_l($s); ?></div>
<h3>Harf sayısına göre</h3><div class="lk"><?php foreach ($uz as $s => $x) echo link_l($s); ?></div>
<h3>Harfle başlayan kelimeler</h3><div class="lk abc"><?= $abc('bas') ?></div>
<h3>Harfle biten kelimeler</h3><div class="lk abc"><?= $abc('bit') ?></div>
<h3>İçinde harf geçen kelimeler</h3><div class="lk abc"><?= $abc('ic') ?></div>
<h3>İki harfle başlayan</h3><div class="lk"><?= $liste($grup('bas', fn($x) => mb_strlen($x[1]) === 2)) ?></div>
<h3>Üç harfle başlayan</h3><div class="lk"><?= $liste($grup('bas', fn($x) => mb_strlen($x[1]) === 3)) ?></div>
<h3>İki harfle biten</h3><div class="lk"><?= $liste($grup('bit', fn($x) => mb_strlen($x[1]) === 2)) ?></div>
<h3>Üç harfle biten</h3><div class="lk"><?= $liste($grup('bit', fn($x) => mb_strlen($x[1]) === 3)) ?></div>
<h3>İçinde iki harf geçen</h3><div class="lk"><?= $liste($grup('ic', fn($x) => mb_strlen($x[1]) === 2)) ?></div>
</section>
<?php foreach (['basUz' => 'başlayan', 'bitUz' => 'biten'] as $t => $fiil): ?>
<section class="b links" aria-label="Harf ve uzunluk"><h2>Harfle <?= $fiil ?>, harf sayısına göre</h2>
<?php foreach ($HARF as $hf): $g = $grup($t, fn($x) => $x[1] === $hf); if (!$g) continue; ?>
<h3><?= h(tr_upper($hf)) ?> ile <?= $fiil ?></h3><div class="lk"><?php foreach ($g as $s => $x) echo link_l($s, $x[2] . ' harfli'); ?></div>
<?php endforeach; ?></section>
<?php endforeach; ?>
<section class="b faq" aria-labelledby="hSss"><h2 id="hSss">Sık sorulan sorular</h2><?php foreach ($sss as $q): ?><details><summary><?= h($q[0]) ?></summary><p><?= h($q[1]) ?></p></details><?php endforeach; ?></section>
<?php
  sayfa_son(); exit;
}

// =====================================================================
// LİSTE SAYFASI
// =====================================================================
$X = Listeler::bilgi($slug); [$t, $k, $L] = $X; $L = (int)$L;
$ws = suz($t, $k, $L);
$n = count($ws);
$puanli = $t === 'puan' || $t === 'deger';
$g = $puanli ? [0 => $ws] : gruplar($ws);
$uzunlar = array_map('mb_strlen', $ws);
$enUzun = ''; $enKisa = $ws[0] ?? '';
foreach ($ws as $w) { if (mb_strlen($w) > mb_strlen($enUzun)) $enUzun = $w; if (mb_strlen($w) < mb_strlen($enKisa)) $enKisa = $w; }
$enCok = [0, []]; foreach ($g as $u => $l) if (count($l) > count($enCok[1])) $enCok = [$u, $l];
$sik = yaygin($ws, 8);
$ifd = ifade($X); $A = ad($X);
$puanS = []; foreach ($ws as $w) $puanS[$w] = puan($w);
$enP = $puanS; arsort($enP); $enP = array_slice(array_keys($enP), 0, 12);
$top = $enP[0] ?? '';

if ($t === 'puan') {
  $baslik = "$A — Scrabble'da En Çok Puan Getiren Türkçe Kelimeler | okutan.org";
  $aciklama = ($L ? "$L harfli " : '') . "Türkçe kelimeler Scrabble taş puanına göre: en yüksek " . tr_upper($top) . ' (' . ($puanS[$top] ?? 0) . ' puan). ' . implode(', ', array_slice($ws, 1, 5)) . ' ve diğerleri; anlamları ve kelime bulucu.';
  $p = "Türkçe Scrabble taş puanlarıyla " . ($L ? "<b>$L harfli</b> " : '') . "en çok puan getiren " . sayi($n) . " kelime, yüksekten düşüğe. Zirvede <b>" . h(tr_upper($top)) . '</b> (' . ($puanS[$top] ?? 0) . ' puan) var. J (10), Ğ (8), F, Ö ve V (7) gibi değerli harfler puanı uçurur; katlı karelerle daha da artar.';
} elseif ($t === 'deger') {
  $baslik = "J, Ğ, F, Ö, V Geçen Kısa Kelimeler — Scrabble'da Değerli Harfi Bitirmek İçin | okutan.org";
  $aciklama = "En fazla 5 harfli, içinde J, Ğ, F, Ö ya da V geçen " . sayi($n) . ' Türkçe kelime, puana göre: ' . implode(', ', array_slice($ws, 0, 6)) . '. Elde kalan değerli harfi değerlendirmek için.';
  $p = "Elinde J, Ğ, F, Ö ya da V kaldıysa bu kısa kelimeler kurtarır: en fazla 5 harfli, içinde değerli harflerden en az biri geçen <b>" . sayi($n) . ' kelime</b>, puana göre sıralı. En kısaları tahtada dar yerlere sığar.';
} else {
  $baslik = $t === 'uz' ? "$A — " . sayi($n) . ' Kelimelik Tam Liste, Puanları ve Anlamları | okutan.org' : "$A — " . sayi($n) . ' Kelime' . (count($g) > 1 ? ', Harf Sayısına ve Puana Göre' : ', Puanlarıyla') . ' | okutan.org';
  $aciklama = $t === 'uz' ? "$L harfli Türkçe kelimelerin tam listesi: " . sayi($n) . ' kelime. ' . ($sik ? 'Sık kullanılanlar: ' . implode(', ', array_slice($sik, 0, 5)) . '. ' : '') . 'En yüksek puanlısı ' . tr_upper($top) . '. Harfe göre listeler ve anlamlar.'
    : cumle($ifd) . ' ' . sayi($n) . ' Türkçe kelime' . (count($g) > 1 ? ', ' . mb_strlen($enKisa) . ' harfliden ' . mb_strlen($enUzun) . ' harfliye' : '') . '. ' . ($sik ? 'Örnek: ' . implode(', ', array_slice($sik, 0, 4)) . '. ' : '') . 'En yüksek puanlısı ' . tr_upper($top) . ' (' . ($puanS[$top] ?? 0) . ').';
  $p = 'Sözlüğümüzde ' . h($ifd) . ' <b>' . sayi($n) . ' kelime</b> var.';
  if (count($g) > 1) $p .= ' En kısası ' . mb_strlen($enKisa) . ' harfli “' . h($enKisa) . '”, en uzunu ' . mb_strlen($enUzun) . ' harfli “' . h($enUzun) . '”. En çok kelime ' . $enCok[0] . ' harflilerde (' . sayi(count($enCok[1])) . ').';
  if (count($sik) >= 3) $p .= ' Günlük dilde en sık geçenler: ' . h(implode(', ', array_slice($sik, 0, 6))) . '.';
  $p .= ' Scrabble\'da en çok puan getiren <b>' . h(tr_upper($top)) . '</b> (' . ($puanS[$top] ?? 0) . ' puan).';
}

// SSS
$sss = [];
$dag = implode(', ', array_map(fn($u, $l) => "$u harfli " . sayi(count($l)), array_keys($g), $g));
if (!$puanli) {
  $sss[] = [cumle($ifd) . ' kaç kelime var?', "Bu listede $ifd " . sayi($n) . ' kelime var.' . (count($g) > 1 ? " Harf sayısına göre dağılımı: $dag." : '')];
  $sss[] = [cumle($ifd) . ' en yüksek puanlı kelime hangisi?', 'Türkçe Scrabble taş puanlarıyla en yüksek puanlısı ' . tr_upper($top) . ' (' . ($puanS[$top] ?? 0) . ' puan). Ardından: ' . implode(', ', array_map(fn($w) => "$w ({$puanS[$w]})", array_slice($enP, 1, 5))) . '.'];
  if ($t !== 'uz' && $t !== 'basUz' && $t !== 'bitUz') {
    $sss[] = [cumle($ifd) . ' en uzun kelime hangisi?', cumle($ifd) . ' en uzun kelime ' . mb_strlen($enUzun) . " harfli “{$enUzun}”."];
    $bes = array_values(array_filter($ws, fn($w) => mb_strlen($w) === 5));
    if ($bes) $sss[] = [cumle($ifd) . ' 5 harfli kelimeler hangileri?', sayi(count($bes)) . ' tane var: ' . implode(', ', array_slice(array_values(array_unique(array_merge(yaygin($bes, 15), $bes))), 0, 15)) . (count($bes) > 15 ? ' ve diğerleri' : '') . '.'];
  } else {
    $orn = count(yaygin($ws, 12)) >= 6 ? yaygin($ws, 12) : array_slice($ws, 0, 12);
    $sss[] = ["En sık kullanılan $ifd kelimeler hangileri?", 'Günlük dilde sık geçenlerden bazıları: ' . implode(', ', $orn) . '.'];
  }
} else {
  $sss[] = ['Türkçe Scrabble harf puanları nedir?', 'A, E, İ, K, L, N, R, T 1; I, M, O, S, U 2; B, D, Ü, Y 3; C, Ç, Ş, Z 4; G, H, P 5; F, Ö, V 7; Ğ 8; J 10 puan; joker (boş taş) 0 puandır.'];
  $sss[] = ['En çok puan getiren kelime hangisi?', 'Bu listede en yüksek puanlısı ' . tr_upper($top) . ' (' . ($puanS[$top] ?? 0) . ' puan). Tahtadaki harf ve kelime katlı kareler puanı iki ya da üç katına çıkarır.'];
}
$sss[] = ['Bu kelime listesi nereden geliyor?', "Liste, Kelimeler oyununun 60.000'den fazla kelimelik Türkçe sözlüğünden üretilir. Özel adlar yoktur; çekimli biçimlerin bir kısmı vardır. Anlamlar Vikisözlük'ten alınır."];

// ilgili bağlantılar
$ilg = [];
$ek = function (string $b, array $l, string $cls = '') use (&$ilg) { $l = array_filter($l); if ($l) $ilg[] = "<h3>$b</h3><div class=\"lk" . ($cls ? " $cls" : '') . '">' . implode('', $l) . '</div>'; };
$uzlar = []; foreach (Listeler::$L as $x) if ($x[0] === 'uz') $uzlar[] = (int)$x[2]; sort($uzlar);
$cocuk = function (string $tt, callable $f) use ($HARF) { $o = []; foreach ($HARF as $hf) { $s = Listeler::slug($tt, $f($hf)); if ($s) $o[$s] = Listeler::bilgi($s)[3]; } arsort($o); return array_map(fn($s) => link_l($s), array_slice(array_keys($o), 0, 24)); };
$abc = fn(string $tt, int $u = 0, ?string $haric = null) => array_map(fn($hf) => $hf === $haric ? '' : link_l(Listeler::slug($tt, $hf, $u), tr_upper($hf), false), $HARF);
if ($t === 'bas') {
  if (mb_strlen($k) === 1) $ek(tr_upper($k) . ' ile başlayan, harf sayısına göre', array_map(fn($u) => link_l(Listeler::slug('basUz', $k, $u), "$u harfli"), $uzlar));
  $ek('Daha uzun başlangıçlar', $cocuk('bas', fn($hf) => $k . $hf));
  if (mb_strlen($k) > 1) $ek('Daha kısa', [link_l(Listeler::slug('bas', mb_substr($k, 0, -1))), mb_strlen($k) > 2 ? link_l(Listeler::slug('bas', mb_substr($k, 0, 1))) : '']);
  $ek('Aynı harflerle', [link_l(Listeler::slug('bit', $k)), link_l(Listeler::slug('ic', $k))]);
  $ek('Harfle başlayan kelimeler', $abc('bas'), 'abc');
} elseif ($t === 'bit') {
  if (mb_strlen($k) === 1) $ek(tr_upper($k) . ' ile biten, harf sayısına göre', array_map(fn($u) => link_l(Listeler::slug('bitUz', $k, $u), "$u harfli"), $uzlar));
  $ek('Daha uzun sonlar', $cocuk('bit', fn($hf) => $hf . $k));
  if (mb_strlen($k) > 1) $ek('Daha kısa', [link_l(Listeler::slug('bit', mb_substr($k, 1))), mb_strlen($k) > 2 ? link_l(Listeler::slug('bit', mb_substr($k, -1))) : '']);
  $ek('Aynı harflerle', [link_l(Listeler::slug('bas', $k)), link_l(Listeler::slug('ic', $k))]);
  $ek('Harfle biten kelimeler', $abc('bit'), 'abc');
} elseif ($t === 'ic') {
  $ek('Aynı harflerle', [link_l(Listeler::slug('bas', $k)), link_l(Listeler::slug('bit', $k))]);
  $ek('İçinde harf geçen kelimeler', $abc('ic'), 'abc');
} elseif ($t === 'uz') {
  $ek("Harfle başlayan $L harfli kelimeler", $abc('basUz', $L), 'abc');
  $ek("Harfle biten $L harfli kelimeler", $abc('bitUz', $L), 'abc');
  $ek('Puana göre', [link_l(Listeler::slug('puan', '', $L), "En yüksek puanlı $L harfli", false)]);
  $ek('Başka uzunluklar', array_map(fn($u) => $u === $L ? '' : link_l(Listeler::slug('uz', '', $u)), $uzlar));
} elseif ($t === 'basUz' || $t === 'bitUz') {
  $bas = $t === 'basUz';
  $ek(tr_upper($k) . ' ile ' . ($bas ? 'başlayan' : 'biten') . ', başka uzunluklar', array_map(fn($u) => $u === $L ? '' : link_l(Listeler::slug($t, $k, $u), "$u harfli"), $uzlar));
  $ek(($bas ? 'Harfle başlayan' : 'Harfle biten') . " $L harfli kelimeler", $abc($t, $L, $k), 'abc');
  $ek('Genel listeler', [link_l(Listeler::slug($bas ? 'bas' : 'bit', $k)), link_l(Listeler::slug('uz', '', $L)), link_l(Listeler::slug($bas ? 'bitUz' : 'basUz', $k, $L))]);
} else {
  $ek('Puana göre, harf sayısıyla', array_map(fn($u) => link_l(Listeler::slug('puan', '', $u), "$u harfli", false), range(2, 10)));
  $ek('Diğer', [link_l(Listeler::slug('puan'), 'En yüksek puanlı kelimeler', false), link_l(Listeler::slug('deger')), link_l(Listeler::slug('uz', '', 2))]);
}
$ek('Tüm listeler', ['<a href="/kelime-bulucu/liste/">Kelime listeleri dizini</a>', '<a href="/kelime-bulucu/">Harflerden kelime bul</a>']);

// anlamlar
$anlamli = array_values(array_filter(yaygin($ws, 40), fn($w) => anlam_ilk($w)));
if (count($anlamli) < 8) foreach ($ws as $w) { if (count($anlamli) >= 8) break; if (!in_array($w, $anlamli, true) && ($a = anlam_ilk($w)) && mb_strlen($a) > 12) $anlamli[] = $w; }
$anlamli = array_slice($anlamli, 0, 12);

sayfa_bas(['baslik' => $baslik, 'aciklama' => $aciklama, 'can' => SITE . lurl($slug), 'og_baslik' => "$A (" . sayi($n) . ' kelime)',
  'crumb' => '<a href="/kelime-bulucu/">Kelime Bulucu</a> / <a href="/kelime-bulucu/liste/">Listeler</a> / <b>' . h(ad_kisa($X)) . '</b>',
  'jsonld' => ['@context' => 'https://schema.org', '@graph' => [breadcrumb([['Kelime Listeleri', SITE . '/kelime-bulucu/liste/'], [$A, SITE . lurl($slug)]]), faq($sss)]]]);
$sinir = !$puanli && $n > 6000 && $t !== 'uz';
?>
<section class="b intro" aria-labelledby="pageTitle">
<div class="label">Kelime listesi · <?= sayi($n) ?> kelime</div>
<h1 id="pageTitle"><?= h($A) ?></h1>
<p><?= $p ?> Bir kelimeye dokununca anlamı ve ayrıntıları açılır.</p>
<div class="chips"><span class="chip"><b><?= sayi($n) ?></b><span>kelime</span></span><?php if (count($g) > 1): ?><span class="chip"><b><?= mb_strlen($enUzun) ?> harf</b><span>en uzun</span></span><span class="chip"><b><?= $enCok[0] ?> harfli</b><span>en kalabalık</span></span><?php endif; ?><span class="chip"><b><?= $puanS[$top] ?? 0 ?></b><span>en yüksek puan</span></span></div>
<?= $MINI ?>
</section>
<section class="b res" aria-labelledby="hListe" data-srv="1">
<div class="res-h"><h2 id="hListe"><?= h(cumle($ifd)) ?> kelimeler <small><?= sayi($n) ?></small></h2><?php if (count($g) > 1): ?><nav class="lens" aria-label="Harf sayısı"><?php foreach ($g as $u => $l): ?><a href="#u<?= $u ?>"><?= $u ?><small><?= sayi(count($l)) ?></small></a><?php endforeach; ?></nav><?php endif; ?></div>
<?php if (!$puanli): ?>
<div class="tops"><h3>En yüksek puanlı <?= h($ifd) ?> kelimeler <small>Scrabble taş puanlarıyla · en yüksek <?= h(tr_upper($top)) ?>, <?= $puanS[$top] ?? 0 ?> puan</small></h3><?= cipler($enP, fn($w) => vurgu($X, $w)) ?></div>
<div class="sortb" role="group" aria-label="Sıralama">Sırala: <button type="button" data-s="uz" aria-pressed="true">Harf sayısına göre</button><button type="button" data-s="puan" aria-pressed="false">Puana göre</button><span class="sp"></span><?= $LEJANT ?></div>
<?php else: ?>
<div class="sortb"><span class="sp"></span><?= $LEJANT ?></div>
<?php endif; ?>
<?php foreach ($g as $u => $l):
  $goster = $l; $devam = '';
  if ($sinir && count($l) > 250) {
    $goster = array_values(array_unique(array_merge(yaygin($l, 250), $l))); $goster = array_slice($goster, 0, 250);
    usort($goster, fn($a, $b) => strcmp(l5($a), l5($b)));
    $alt = (mb_strlen($k) === 1 && ($t === 'bas' || $t === 'bit')) ? Listeler::slug($t . 'Uz', $k, $u) : null;
    $devam = '<a class="more" href="' . ($alt ? lurl($alt) : h(arac_url('k', kalip($X), $u))) . '">Tüm ' . $u . ' harfli ' . sayi(count($l)) . ' kelimeyi gör →</a>';
  } ?>
<div class="grp"><?php if (!$puanli && (count($g) > 1 || $t === 'uz')): ?><h3 id="u<?= $u ?>"><?= $u ?> harfli <?= $t === 'uz' ? '' : h($ifd) . ' ' ?>kelimeler <small><?= sayi(count($l)) ?><?= count($goster) < count($l) ? ' · ' . sayi(count($goster)) . ' tanesi' : '' ?></small></h3><?php endif; ?><?= cipler($goster, fn($w) => vurgu($X, $w)) ?><?= $devam ?></div>
<?php endforeach; ?>
</section>
<?php if ($anlamli): ?>
<section class="b" aria-labelledby="hAnlam"><h2 id="hAnlam">Bazı <?= h($ifd) ?> kelimelerin anlamları</h2><dl class="defs"><?php foreach ($anlamli as $w): ?><div><dt><a href="<?= kurl($w) ?>"><?= h(tr_upper($w)) ?></a> <?= rozet(puan($w)) ?></dt><dd><?= h(anlam_ilk($w)) ?></dd></div><?php endforeach; ?></dl><p class="src">Anlamlar: <a href="https://tr.wiktionary.org/" target="_blank" rel="noopener">Vikisözlük</a> (CC BY-SA).</p></section>
<?php endif; ?>
<section class="b links" aria-label="İlgili listeler"><?= implode('', $ilg) ?></section>
<section class="b faq" aria-labelledby="hSss"><h2 id="hSss">Sık sorulan sorular</h2><?php foreach ($sss as $q): ?><details><summary><?= h($q[0]) ?></summary><p><?= h($q[1]) ?></p></details><?php endforeach; ?><p class="src">Puanlar Türkçe Scrabble taş değerleridir; Scrabble, Hasbro ve Mattel'in markasıdır, bu sayfayla bağlantısı yoktur.</p></section>
<?php sayfa_son();
