<?php
// Anlık uyarılar (cPanel: 15 dakikada bir; barındırma firması daha sık çalıştırmaya izin vermiyor). Telegram'a yalnızca yeni olanı yazar; durum PRIVATE_DIR/durum/uyari.json'da.
//   - Sohbette yeni şikâyet
//   - Balon Patlat'ta yeni şüpheli skor (flag = 1)
//   - Sitede şu an ALERT_ONLINE (varsayılan 20) ya da daha fazla kişi (sayı yarının altına inince yeniden kurulur)
// Oyun ve sohbet tabloları UTC saat tutar.
declare(strict_types=1);
require __DIR__ . '/../lib/cron.php';
cron_main('uyari', function () {
    $file = work_dir('durum') . '/uyari.json';
    $st = is_file($file) ? (json_decode((string)file_get_contents($file), true) ?: []) : [];
    $t = db_tables();
    $msgs = [];
    $panel = site_url() . '/admin/';

    // Kesinti: önemli adresler (HEALTH_URLS) üst üste 2 kontrolde açılmazsa "açılmıyor", düzelince "düzeldi" (tek seferlik takılma bildirilmez).
    $down = (array)($st['down'] ?? []);   // url => ['n' => art arda hata, 'since' => ilk hata, 'sent' => bildirildi mi]
    foreach (health_run() as $r) {
        $u = $r['url'];
        if ($r['ok']) {
            if (!empty($down[$u]['sent'])) {
                $dk = max(1, (int)round((time() - (int)$down[$u]['since']) / 60));
                $msgs[] = '✅ Düzeldi: ' . $u . ' yeniden açılıyor (' . $dk . ' dk sürdü).';
            }
            unset($down[$u]);
            continue;
        }
        $d = $down[$u] ?? ['n' => 0, 'since' => time(), 'sent' => false];
        $d['n']++;
        if ($d['n'] >= 2 && !$d['sent']) {
            $msgs[] = '🔴 Açılmıyor: ' . $u . ' — ' . $r['why'] . ' (' . $d['n'] . ' kontroldür, ' . max(1, (int)round((time() - $d['since']) / 60)) . ' dk)';
            $d['sent'] = true;
        }
        $down[$u] = $d;
    }
    $st['down'] = $down;

    $buttonMsgs = []; // [metin, düğmeler]: şikâyet başına ayrı mesaj, Telegram'dan tek dokunuşla gizle / sustur
    if (isset($t['sh_reports'])) {
        $last = (string)($st['rep_at'] ?? gmdate('Y-m-d H:i:s'));
        $reps = rows('SELECT r.msg_id, COUNT(*) n, MAX(r.created_at) m, s.user_id, s.nick, s.ch, s.text FROM sh_reports r LEFT JOIN sh_msgs s ON s.id = r.msg_id
                      WHERE r.created_at > ? GROUP BY r.msg_id, s.user_id, s.nick, s.ch, s.text ORDER BY m LIMIT 5', [$last]);
        foreach ($reps as $r) {
            $last = max($last, (string)$r['m']);
            $txt = '🚩 Sohbette şikâyet (' . $r['n'] . '): ' . ($r['nick'] ?? '?') . ($r['ch'] && $r['ch'][0] !== 'p' ? ' #' . $r['ch'] : ' (özel)') . "
«" . mb_substr((string)($r['text'] ?? ''), 0, 300) . '»';
            $btn = [[['text' => '🙈 Gizle', 'callback_data' => 'del:' . (int)$r['msg_id']], ['text' => '🔇 60 dk sustur', 'callback_data' => 'mute:' . (int)$r['user_id'] . ':60']],
                    [['text' => 'Panelde aç', 'url' => $panel . '?view=sohbet']]];
            $buttonMsgs[] = [$txt, $btn];
        }
        $st['rep_at'] = $last;
    }
    if (isset($t['bp_scores'])) {
        $maxId = (int)val('SELECT COALESCE(MAX(id), 0) FROM bp_scores');
        $lastId = (int)($st['bp_id'] ?? $maxId);
        $f = rows('SELECT name, score FROM bp_scores WHERE flag = 1 AND id > ? ORDER BY id LIMIT 5', [$lastId]);
        if ($f) $msgs[] = '🎈 Balon Patlat: ' . count($f) . ' yeni şüpheli skor (' . implode(', ', array_map(fn($x) => $x['name'] . ' ' . nf($x['score']), $f)) . '). ' . $panel . '?view=balon';
        $st['bp_id'] = $maxId;
    }
    if (isset($t['stats_jserr'])) {
        $lastJs = (string)($st['js_at'] ?? now());
        $nj = rows('SELECT msg, src, line, last_path FROM stats_jserr WHERE first_seen > ? ORDER BY first_seen LIMIT 5', [$lastJs]);
        if ($nj) $msgs[] = '🐞 Yeni JavaScript hatası: ' . implode(' | ', array_map(fn($e) => mb_substr($e['msg'], 0, 120) . ' (' . $e['src'] . ':' . $e['line'] . ', ' . $e['last_path'] . ')', $nj)) . ' ' . $panel . '?view=sistem&tab=jshata';
        $st['js_at'] = now();
    }
    // Bir oyunda/sayfada son 1 saatte JS hatası patlaması (ALERT_JS, varsayılan 10); aynı sayfa için 6 saatte bir.
    if (isset($t['stats_errh'])) {
        $lim = max(3, (int)cfg('ALERT_JS', 10));
        $h1 = (int)date('G'); $d1 = today(); $h0 = (int)date('G', time() - 3600); $d0 = date('Y-m-d', time() - 3600);
        $spk = rows('SELECT pg, SUM(n) n FROM stats_errh WHERE (day = ? AND hour = ?) OR (day = ? AND hour = ?) GROUP BY pg HAVING n >= ?', [$d1, $h1, $d0, $h0, $lim]);
        foreach ($spk as $r) {
            if (($st['spike'][$r['pg']] ?? 0) > time() - 6 * 3600) continue;
            $st['spike'][$r['pg']] = time();
            $msgs[] = '💥 ' . page_label($r['pg']) . ': son 1 saatte ' . $r['n'] . ' JavaScript hatası. Bozulmuş olabilir. ' . $panel . '?view=sistem&tab=jshata';
        }
    }
    // Yavaşlama: son 24 saatte bir sayfanın LCP p75'i 4 sn'yi geçerse (en az 10 ölçüm), günde bir kez.
    if (isset($t['stats_vital']) && (int)date('G') >= 8) {
        foreach (vitals(1)['pages'] as $pg => $ms) {
            $p = $ms['lcp']['p75'] ?? null;
            if ($p === null || ($ms['lcp']['n'] ?? 0) < 10 || $p <= 4000 || ($st['slow'][$pg] ?? '') === today()) continue;
            $st['slow'][$pg] = today();
            $msgs[] = '🐢 ' . page_label($pg) . ' yavaş: LCP p75 ' . vital_fmt($p, 'lcp') . ' (' . $ms['lcp']['n'] . ' ölçüm). ' . $panel . '?view=hiz';
        }
    }
    $lim = max(2, (int)cfg('ALERT_ONLINE', 20));
    $n = (int)st_online()['n'];
    if ($n >= $lim && empty($st['crowd'])) { $msgs[] = '👥 Sitede şu an ' . $n . ' kişi var.'; $st['crowd'] = 1; }
    elseif ($n < $lim / 2) $st['crowd'] = 0;

    if ($msgs && notify_enabled()) {
        [$ok, $err] = notify_now("okutan.org\n" . implode("\n", $msgs));
        if (!$ok) throw new RuntimeException('Uyarı gönderilemedi: ' . $err);
    }
    if ($buttonMsgs && notify_enabled()) foreach ($buttonMsgs as [$txt, $btn]) notify_now($txt, setting_get('tg_hook', true) ? $btn : [array_pop($btn)]);
    $msgs = array_merge($msgs, array_column($buttonMsgs, 0));
    if (file_put_contents($file, json_encode($st), LOCK_EX) === false) throw new RuntimeException('Durum dosyası yazılamadı: ' . $file);
    return count($msgs) . ' uyarı · şu an ' . $n . ' kişi';
});
