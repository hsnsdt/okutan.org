<?php
// Telegram webhook: uyarı mesajlarındaki düğmeler (sohbette mesajı gizle, kişiyi sustur).
// Güvenlik: Telegram'ın gönderdiği gizli başlık (tg_hook_secret, CRON_KEY'den türetilir) ve yalnızca ayarlı sohbetten basılan düğmeler.
// Eylem sohbet API'sinin kendi yönetim uçlarıyla yapılır (admin_del, admin_mute), jetonu panel üretir.
declare(strict_types=1);
ini_set('display_errors', '0');
require __DIR__ . '/lib/boot.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/notify.php';
require __DIR__ . '/lib/shell.php';
require __DIR__ . '/lib/guvenlik.php';

header('Content-Type: application/json');
header('X-Robots-Tag: noindex');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !cfg('CRON_KEY') || !hash_equals(tg_hook_secret(), (string)($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? ''))) {
    http_response_code(403); exit('{}');
}
$u = json_decode((string)file_get_contents('php://input', false, null, 0, 65536), true);
$cb = $u['callback_query'] ?? null;
if (!is_array($cb)) exit('{}');
$answer = function (string $text) use ($cb) { tg_api('answerCallbackQuery', ['callback_query_id' => (string)$cb['id'], 'text' => mb_substr($text, 0, 190), 'show_alert' => false]); };
try {
    if ((string)($cb['from']['id'] ?? '') !== tg_chat_id() && (string)($cb['message']['chat']['id'] ?? '') !== tg_chat_id()) { $answer('Yetkisiz.'); exit('{}'); }
    $data = (string)($cb['data'] ?? '');
    if (!preg_match('~^(del|mute):(\d{1,12})(?::(\d{1,5}))?$~', $data, $m)) { $answer('Bilinmeyen düğme.'); exit('{}'); }
    $tok = game_admin_token('sohbet-admin');
    if (!$tok) { $answer('Sohbet yönetimi kapalı (admin_pass yok).'); exit('{}'); }
    [$a, $body, $ok] = $m[1] === 'del'
        ? ['admin_del', ['t' => $tok, 'id' => (int)$m[2]], 'Mesaj gizlendi ✓']
        : ['admin_mute', ['t' => $tok, 'user' => (int)$m[2], 'min' => max(1, min(10080, (int)($m[3] ?? 60)))], 'Kişi ' . (int)($m[3] ?? 60) . ' dk susturuldu ✓'];
    [$code, $res] = http_req('POST', site_url() . '/sohbet/api/?a=' . $a, json_encode($body), ['Content-Type: application/json'], 20);
    $j = json_decode($res, true);
    if ($code === 200 && !empty($j['ok'])) {
        $answer($ok);
        tg_api('sendMessage', ['chat_id' => tg_chat_id(), 'text' => $ok . ' (' . $data . ')', 'reply_to_message_id' => (int)($cb['message']['message_id'] ?? 0)]);
        audit('tg_mod', $data);
    } else {
        $answer('Olmadı: ' . ($j['error'] ?? ('HTTP ' . $code)));
        audit('tg_mod', $data . ' → ' . ($j['error'] ?? $code), false);
    }
} catch (Throwable $e) {
    adm_log('telegram.php: ' . $e->getMessage());
    $answer('Hata: ' . $e->getMessage());
}
echo '{}';
