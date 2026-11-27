<?php
// Oyun testi sonuçları: bilgisayardaki zamanlanmış görev (tools/oyun-testi.mjs) her gece her oyunu gerçek tarayıcıda açar,
// sonucu buraya ?key=CRON_KEY ile POST eder: {"results":[{"oyun":"batak","ok":true,"ms":1234,"hata":""}, ...], "surum":"..."}
// Sonuç adm_settings 'e2e_last'; bozulan oyun olursa (ya da düzelirse) Telegram'a yazılır.
declare(strict_types=1);
require __DIR__ . '/../lib/cron.php';
if (PHP_SAPI === 'cli') exit("Bu uç yalnızca HTTP POST ile çalışır.\n");
$key = (string)cfg('CRON_KEY', '');
if ($key === '' || !hash_equals($key, (string)($_GET['key'] ?? '')) || ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(403); exit("403\n"); }
header('Content-Type: application/json; charset=utf-8');
$j = json_decode((string)file_get_contents('php://input', false, null, 0, 200000), true);
$res = [];
foreach ((array)($j['results'] ?? []) as $r) {
    if (!is_array($r) || !preg_match('~^[a-z0-9]{1,20}$~', (string)($r['oyun'] ?? ''))) continue;
    $res[] = ['oyun' => $r['oyun'], 'ok' => !empty($r['ok']), 'ms' => max(0, (int)($r['ms'] ?? 0)), 'hata' => mb_substr((string)($r['hata'] ?? ''), 0, 300)];
}
if (!$res) { http_response_code(400); exit('{"ok":false,"error":"sonuç yok"}'); }
try {
    $prev = json_decode((string)(setting_get('e2e_last', true) ?? ''), true) ?: [];
    $was = [];
    foreach ((array)($prev['res'] ?? []) as $r) $was[$r['oyun']] = $r['ok'];
    setting_set('e2e_last', json_encode(['at' => now(), 'res' => $res], JSON_UNESCAPED_UNICODE));
    q('INSERT INTO adm_cron (name, last_start, last_end, status, message, runs) VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE last_start = VALUES(last_start), last_end = VALUES(last_end), status = VALUES(status), message = VALUES(message), runs = runs + 1',
        ['e2e', now(), now(), 'ok', count(array_filter($res, fn($r) => $r['ok'])) . '/' . count($res) . ' oyun çalışıyor']);
    $msgs = [];
    foreach ($res as $r) {
        $name = game_name_of($r['oyun']);
        if (!$r['ok'] && ($was[$r['oyun']] ?? true)) $msgs[] = '🛑 ' . $name . ' açılmıyor ya da başlamıyor: ' . $r['hata'];
        if ($r['ok'] && isset($was[$r['oyun']]) && !$was[$r['oyun']]) $msgs[] = '✅ ' . $name . ' yine çalışıyor.';
    }
    if ($msgs && notify_enabled()) notify_now("okutan.org oyun testi\n" . implode("\n", $msgs));
    echo json_encode(['ok' => true, 'n' => count($res)]);
} catch (Throwable $e) {
    adm_log('e2e: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
