<?php
// Yönetim paneli — Telegram bildirimi. TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID yoksa sessizce hiçbir şey yapmaz.
declare(strict_types=1);

function notify_enabled(): bool { return cfg('TELEGRAM_BOT_TOKEN') && cfg('TELEGRAM_CHAT_ID'); }

/** Hemen gönder. Dönüş: [başarılı mı, hata metni]. */
function notify_now(string $text): array
{
    if (!notify_enabled()) return [false, 'TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID ayarlı değil.'];
    $text = mb_substr($text, 0, 4000);
    [$code, $body, $err] = http_req('POST', 'https://api.telegram.org/bot' . cfg('TELEGRAM_BOT_TOKEN') . '/sendMessage',
        http_build_query(['chat_id' => (string)cfg('TELEGRAM_CHAT_ID'), 'text' => $text, 'disable_web_page_preview' => 'true']),
        ['Content-Type: application/x-www-form-urlencoded'], 20);
    if (function_exists('db_ping')) { try { db_ping(); } catch (Throwable $e) { /* bağlantı yoksa sonraki sorgu raporlar */ } }
    $j = json_decode($body, true);
    if ($code === 200 && !empty($j['ok'])) return [true, ''];
    $why = $err !== '' ? $err : ('HTTP ' . $code . (isset($j['description']) ? ': ' . $j['description'] : ''));
    adm_log('Telegram gönderilemedi: ' . $why);
    return [false, $why];
}

/** Yanıt gönderildikten sonra gönder (ziyaretçiyi bekletme). Yapılandırılmamışsa no-op. */
function notify(string $text): void
{
    if (!notify_enabled()) return;
    if (PHP_SAPI === 'cli') { notify_now($text); return; }
    register_shutdown_function(function () use ($text) {
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
        notify_now($text);
    });
}
