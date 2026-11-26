<?php
// Yönetim paneli — Telegram bildirimi. Token ya da sohbet kimliği yoksa sessizce hiçbir şey yapmaz.
declare(strict_types=1);

/** Sohbet kimliği: TELEGRAM_CHAT_ID; boşsa Bildirimler ekranındaki "Sohbeti bul" ile kaydedilen (adm_settings). */
function tg_chat_id(): string
{
    $c = (string)cfg('TELEGRAM_CHAT_ID', '');
    if ($c !== '') return $c;
    try { return (string)(setting_get('tg_chat_id', true) ?? ''); } catch (Throwable $e) { return ''; }
}
function notify_enabled(): bool { return cfg('TELEGRAM_BOT_TOKEN') && tg_chat_id() !== ''; }

/** Bota son yazan özel sohbeti bulur ve kaydeder. Dönüş: [kimlik|null, açıklama]. */
function tg_find_chat(): array
{
    if (!cfg('TELEGRAM_BOT_TOKEN')) return [null, 'TELEGRAM_BOT_TOKEN ayarlı değil (admin/config.php).'];
    [$code, $body, $err] = http_req('GET', 'https://api.telegram.org/bot' . cfg('TELEGRAM_BOT_TOKEN') . '/getUpdates', null, [], 20);
    db_ping();
    $j = json_decode($body, true);
    if ($code !== 200 || empty($j['ok'])) return [null, 'Telegram yanıt vermedi: ' . ($err !== '' ? $err : 'HTTP ' . $code . (isset($j['description']) ? ' ' . $j['description'] : ''))];
    $found = null;
    foreach ($j['result'] ?? [] as $u) {
        $c = $u['message']['chat'] ?? null;
        if ($c && ($c['type'] ?? '') === 'private') $found = $c;
    }
    if (!$found) return [null, "Bota henüz mesaj gelmemiş. Telegram'da botu açıp bir mesaj (ör. /start) yaz, sonra tekrar bas."];
    setting_set('tg_chat_id', (string)$found['id']);
    return [(string)$found['id'], trim(($found['first_name'] ?? '') . ' ' . ($found['last_name'] ?? ''))];
}

/** Hemen gönder. Dönüş: [başarılı mı, hata metni]. */
function notify_now(string $text): array
{
    if (!notify_enabled()) return [false, cfg('TELEGRAM_BOT_TOKEN') ? 'Sohbet kimliği yok: bota bir mesaj yazıp Bildirimler ekranında "Sohbeti bul"a bas.' : 'TELEGRAM_BOT_TOKEN ayarlı değil (admin/config.php).'];
    $text = mb_substr($text, 0, 4000);
    [$code, $body, $err] = http_req('POST', 'https://api.telegram.org/bot' . cfg('TELEGRAM_BOT_TOKEN') . '/sendMessage',
        http_build_query(['chat_id' => tg_chat_id(), 'text' => $text, 'disable_web_page_preview' => 'true']),
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
