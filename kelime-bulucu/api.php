<?php
/* Kelime Bulucu — popüler aramalar. Kimlik, IP ya da çerez tutulmaz; yalnızca aranan harf/kelime günlük olarak sayılır.
   POST ?a=say  (t: h|k|w|g, q: arama)   → 204
   GET  ?a=populer                         → {"h":[[q,n],…],"g":[[q,n,adres],…]} (son 7 gün, 10 dk önbellek)
   Veri: veri/arama/GG-AA-YYYY.json (klasör yazılabilir olmalı; değilse sessizce sayılmaz). */
require __DIR__ . '/ortak.php';
$DIR = KB_DIR . '/veri/arama';
$a = (string)($_GET['a'] ?? '');

if ($a === 'say' && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $t = (string)($_POST['t'] ?? '');
  $q = tr_lower(trim((string)($_POST['q'] ?? '')));
  if (!in_array($t, ['h', 'k', 'w', 'g'], true) || $q === '' || mb_strlen($q) > 24 || !preg_match('/^[a-zçğıöşü*?._|]+$/u', $q)) { http_response_code(400); exit; }
  if ($t === 'g' && !Sozluk::var($q)) { http_response_code(204); exit; } // geçersiz kelimeler sayılmaz
  if ((is_dir($DIR) || @mkdir($DIR, 0755, true)) && is_writable($DIR)) {
    $f = $DIR . '/' . gmdate('Y-m-d') . '.json';
    $h = @fopen($f, 'c+');
    if ($h && flock($h, LOCK_EX)) {
      $d = json_decode((string)stream_get_contents($h), true) ?: [];
      $k = "$t:$q";
      if (isset($d[$k]) || count($d) < 20000) $d[$k] = ($d[$k] ?? 0) + 1;
      ftruncate($h, 0); rewind($h); fwrite($h, json_encode($d, JSON_UNESCAPED_UNICODE)); fflush($h); flock($h, LOCK_UN);
    }
    if ($h) fclose($h);
    if (mt_rand(1, 200) === 1) foreach (glob($DIR . '/*.json') ?: [] as $e) if (@filemtime($e) < time() - 40 * 86400) @unlink($e);
  }
  http_response_code(204); exit;
}

if ($a === 'populer') {
  header('Content-Type: application/json; charset=UTF-8');
  header('Cache-Control: public, max-age=600');
  $onb = $DIR . '/populer.cache';
  if (is_file($onb) && filemtime($onb) > time() - 600) { readfile($onb); exit; }
  $top = [];
  for ($i = 0; $i < 7; $i++) {
    $f = $DIR . '/' . gmdate('Y-m-d', time() - $i * 86400) . '.json';
    if (!is_file($f)) continue;
    foreach (json_decode((string)file_get_contents($f), true) ?: [] as $k => $n) $top[$k] = ($top[$k] ?? 0) + $n;
  }
  arsort($top);
  $o = ['h' => [], 'g' => []];
  foreach ($top as $k => $n) {
    [$t, $q] = explode(':', $k, 2);
    if ($t === 'h' && count($o['h']) < 16) $o['h'][] = [$q, $n];
    if ($t === 'g' && count($o['g']) < 16) $o['g'][] = [$q, $n, Sozluk::slug($q)];
    if (count($o['h']) >= 16 && count($o['g']) >= 16) break;
  }
  $j = json_encode($o, JSON_UNESCAPED_UNICODE);
  if (is_dir($DIR) && is_writable($DIR)) @file_put_contents($onb, $j);
  echo $j; exit;
}
http_response_code(400);
