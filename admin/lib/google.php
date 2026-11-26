<?php
// Yönetim paneli — Google API'leri (Search Console, URL Inspection, Sitemaps, GA4 Data). Harici kütüphane yok:
// servis hesabının JSON anahtarıyla JWT elle RS256 imzalanır (openssl_sign), erişim jetonu ~55 dk adm_settings'te saklanır.
declare(strict_types=1);

final class GoogleError extends RuntimeException
{
    public string $reason; // no_config | no_file | unreadable | invalid | token | http_403 | http
    public int $http;
    public function __construct(string $reason, string $msg, int $http = 0)
    {
        parent::__construct($msg);
        $this->reason = $reason;
        $this->http = $http;
    }
}

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

/** Anahtar dosyası: GSC_KEY_FILE; boşsa gizli klasördeki gsc-anahtar.json. */
function gsc_key_path(): string
{
    $f = (string)cfg('GSC_KEY_FILE', '');
    if ($f !== '') return $f;
    $d = priv_dir();
    return $d ? $d . '/gsc-anahtar.json' : '';
}
function gsc_site(): string { return (string)cfg('GSC_SITE', site_url() . '/'); }

/** Anahtar dosyası durumu (ağa çıkmadan). */
function gkey_status(): array
{
    $f = gsc_key_path();
    $st = ['ok' => false, 'reason' => '', 'msg' => '', 'email' => '', 'warn' => null, 'file' => $f];
    if ($f === '') { $st['reason'] = 'no_config'; $st['msg'] = 'GSC_KEY_FILE ayarlı değil (admin/config.php).'; return $st; }
    if (!cfg('GSC_KEY_FILE') && !is_file($f)) { $st['reason'] = 'no_file'; $st['msg'] = 'Anahtar dosyası henüz yüklenmedi. Beklenen yer: ' . $f; return $st; }
    $st['warn'] = public_path_risk($f);
    if (!is_file($f)) { $st['reason'] = 'no_file'; $st['msg'] = 'Anahtar dosyası bulunamadı: ' . $f; return $st; }
    $raw = @file_get_contents($f); // okunamazsa false döner ve aşağıda açıkça raporlanır
    if ($raw === false) { $st['reason'] = 'unreadable'; $st['msg'] = 'Anahtar dosyası okunamıyor (izinleri kontrol et): ' . $f; return $st; }
    $j = json_decode($raw, true);
    if (!is_array($j) || empty($j['client_email']) || empty($j['private_key'])) {
        $st['reason'] = 'invalid'; $st['msg'] = 'Anahtar dosyası geçersiz: JSON değil ya da client_email / private_key alanı yok.'; return $st;
    }
    if (!openssl_pkey_get_private($j['private_key'])) {
        $st['reason'] = 'invalid'; $st['msg'] = 'Anahtar dosyasındaki private_key okunamadı (bozuk anahtar).'; return $st;
    }
    $st['ok'] = true;
    $st['email'] = (string)$j['client_email'];
    $st['key'] = $j;
    return $st;
}

function b64url(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }

/** Servis hesabı erişim jetonu (önbellekli). */
function google_token(string $scope, bool $force = false): string
{
    $st = gkey_status();
    if (!$st['ok']) throw new GoogleError($st['reason'], $st['msg']);
    $ck = 'gtok:' . md5($scope . '|' . $st['email']);
    if (!$force && ($t = setting_get($ck))) return $t;
    // Son deneme başarısızsa 10 dk tekrar deneme (her sayfa açılışında Google'a gitmesin); "Yenile" bunu siler.
    if (!$force && ($last = setting_get('gtok_err:' . $ck))) throw new GoogleError('token', $last . ' (10 dk içinde yeniden denenecek; hemen denemek için Google ekranında "Yenile")');
    $now = time();
    $hdr = b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $clm = b64url(json_encode(['iss' => $st['email'], 'scope' => $scope, 'aud' => 'https://oauth2.googleapis.com/token', 'iat' => $now, 'exp' => $now + 3600]));
    $sig = '';
    if (!openssl_sign($hdr . '.' . $clm, $sig, $st['key']['private_key'], OPENSSL_ALGO_SHA256)) {
        throw new GoogleError('invalid', 'JWT imzalanamadı: ' . (openssl_error_string() ?: 'openssl hatası'));
    }
    $jwt = $hdr . '.' . $clm . '.' . b64url($sig);
    [$code, $body, $err] = http_req('POST', 'https://oauth2.googleapis.com/token',
        http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt]),
        ['Content-Type: application/x-www-form-urlencoded']);
    db_ping();
    $j = json_decode($body, true);
    if ($code !== 200 || empty($j['access_token'])) {
        $why = $err !== '' ? $err : (($j['error'] ?? 'HTTP ' . $code) . (isset($j['error_description']) ? ': ' . $j['error_description'] : ''));
        setting_set('gtok_err:' . $ck, 'Erişim jetonu alınamadı (' . $why . ').', 600);
        throw new GoogleError('token', 'Erişim jetonu alınamadı (' . $why . ').', $code);
    }
    setting_set($ck, (string)$j['access_token'], min(3300, max(60, (int)($j['expires_in'] ?? 3600) - 300)));
    return (string)$j['access_token'];
}

/** Google API çağrısı; hata olursa GoogleError (403 ayrı). */
function google_api(string $method, string $url, ?array $body, string $scope): array
{
    $tok = google_token($scope);
    [$code, $res, $err] = http_req($method, $url, $body === null ? null : json_encode($body),
        ['Authorization: Bearer ' . $tok, 'Content-Type: application/json'], 60);
    db_ping(); // uzun çağrıdan sonra MySQL bağlantısı kapanmış olabilir
    if ($code === 401) { // jeton süresi dolmuş olabilir: bir kez yenile
        $tok = google_token($scope, true);
        [$code, $res, $err] = http_req($method, $url, $body === null ? null : json_encode($body),
            ['Authorization: Bearer ' . $tok, 'Content-Type: application/json'], 60);
        db_ping();
    }
    $j = json_decode($res, true);
    if ($code >= 200 && $code < 300 && is_array($j)) return $j;
    $msg = $err !== '' ? $err : (string)($j['error']['message'] ?? ('HTTP ' . $code . ' ' . mb_substr($res, 0, 300)));
    throw new GoogleError($code === 403 ? 'http_403' : 'http', 'Google API hatası (HTTP ' . $code . '): ' . $msg, $code);
}

function google_reason_tr(Throwable $e): string
{
    if (!$e instanceof GoogleError) return $e->getMessage();
    $m = $e->getMessage();
    if ($e->reason === 'http_403') $m .= ' — 403 genellikle iki şeyden olur: (1) GSC_SITE mülk tipiyle uyuşmuyor (URL ön eki ise tam olarak "' . site_url() . '/", Alan adı mülkü ise "sc-domain:' . site_host() . '"), (2) servis hesabının e-postası Search Console\'da bu mülke kullanıcı olarak eklenmemiş.';
    return $m;
}

/** Search Analytics sorgusu; sonuç 6 saat önbellekte. */
function gsc_query(array $body, bool $force = false): array
{
    $body += ['dataState' => 'final', 'rowLimit' => 1000];
    $ck = 'gsc:' . md5(gsc_site() . json_encode($body));
    if (!$force && ($c = setting_get($ck)) !== null) return json_decode($c, true) ?: [];
    $j = google_api('POST', 'https://www.googleapis.com/webmasters/v3/sites/' . rawurlencode(gsc_site()) . '/searchAnalytics/query', $body, GSC_SCOPE);
    $rows = $j['rows'] ?? [];
    setting_set($ck, json_encode($rows), 6 * 3600);
    setting_set('gsc_fetched_at', now());
    return $rows;
}

/** Google'ın kesinleşmiş verisi 2-3 gün geriden gelir: son 28 gün = (bugün-3)'e kadar. */
function gsc_range(): array
{
    $end = day_add(today(), -3);
    $start = day_add($end, -27);
    return ['start' => $start, 'end' => $end, 'pstart' => day_add($start, -28), 'pend' => day_add($start, -1)];
}
function gsc_total(string $from, string $to, bool $force): array
{
    $r = gsc_query(['startDate' => $from, 'endDate' => $to], $force)[0] ?? [];
    return ['clicks' => (float)($r['clicks'] ?? 0), 'impressions' => (float)($r['impressions'] ?? 0), 'ctr' => (float)($r['ctr'] ?? 0), 'position' => (float)($r['position'] ?? 0)];
}
/** Gün gün tıklama/gösterim (son 60 gün içinde gelen veri). */
function gsc_daily(bool $force = false): array
{
    $out = [];
    foreach (gsc_query(['startDate' => day_add(today(), -60), 'endDate' => today(), 'dimensions' => ['date']], $force) as $r) {
        $out[$r['keys'][0]] = [(float)$r['clicks'], (float)$r['impressions'], (float)$r['ctr'], (float)$r['position']];
    }
    ksort($out);
    return $out;
}
function gsc_dashboard(bool $force = false): array
{
    $g = gsc_range();
    $b = ['startDate' => $g['start'], 'endDate' => $g['end']];
    $d = ['range' => $g];
    $d['tot'] = gsc_total($g['start'], $g['end'], $force);
    $d['ptot'] = gsc_total($g['pstart'], $g['pend'], $force);
    $d['daily'] = gsc_daily($force);
    $d['queries'] = gsc_query($b + ['dimensions' => ['query']], $force);
    usort($d['queries'], fn($a, $c) => $c['impressions'] <=> $a['impressions']);
    $qp = gsc_query($b + ['dimensions' => ['query', 'page']], $force);
    $d['opps'] = array_values(array_filter($qp, fn($r) => $r['position'] >= 8 && $r['position'] <= 20));
    usort($d['opps'], fn($a, $c) => $c['impressions'] <=> $a['impressions']);
    $d['pages'] = gsc_query($b + ['dimensions' => ['page']], $force);
    usort($d['pages'], fn($a, $c) => $c['impressions'] <=> $a['impressions']);
    $d['countries'] = gsc_query($b + ['dimensions' => ['country']], $force);
    $d['devices'] = gsc_query($b + ['dimensions' => ['device']], $force);
    $d['fetched_at'] = setting_get('gsc_fetched_at', true);
    return $d;
}
/** Sitemaps API: gönderilen site haritaları, hata/uyarı sayısı. */
function gsc_sitemaps(bool $force = false): array
{
    $ck = 'gsc_sitemaps:' . md5(gsc_site());
    if (!$force && ($c = setting_get($ck)) !== null) return json_decode($c, true) ?: [];
    $j = google_api('GET', 'https://www.googleapis.com/webmasters/v3/sites/' . rawurlencode(gsc_site()) . '/sitemaps', null, GSC_SCOPE);
    $s = $j['sitemap'] ?? [];
    setting_set($ck, json_encode($s), 6 * 3600);
    return $s;
}

/** GA4: son 28 gün ve önceki 28 gün kullanıcı/oturum. GA4_PROPERTY yoksa null. */
function ga4_summary(bool $force = false): ?array
{
    $p = preg_replace('~\D~', '', (string)cfg('GA4_PROPERTY', ''));
    if ($p === '') return null;
    $ck = 'ga4:' . $p;
    if (!$force && ($c = setting_get($ck)) !== null) return json_decode($c, true);
    $j = google_api('POST', 'https://analyticsdata.googleapis.com/v1beta/properties/' . $p . ':runReport', [
        'dateRanges' => [['startDate' => '28daysAgo', 'endDate' => 'yesterday', 'name' => 'cur'], ['startDate' => '56daysAgo', 'endDate' => '29daysAgo', 'name' => 'prev']],
        'metrics' => [['name' => 'activeUsers'], ['name' => 'sessions'], ['name' => 'screenPageViews']],
    ], GA_SCOPE);
    $out = ['cur' => [0, 0, 0], 'prev' => [0, 0, 0]];
    foreach ($j['rows'] ?? [] as $r) {
        $k = $r['dimensionValues'][0]['value'] ?? 'cur';
        $out[$k === 'prev' ? 'prev' : 'cur'] = array_map(fn($m) => (float)$m['value'], $r['metricValues']);
    }
    setting_set($ck, json_encode($out), 6 * 3600);
    return $out;
}

// ---------------- URL Inspection ----------------

/** Denetlenecek adresler: site haritası (INSPECT_SITEMAP) + elle liste (INSPECT_URLS). Site haritası dizini ise alt haritalar da okunur (en çok 500 adres). */
function sitemap_urls(): array
{
    $urls = [];
    $read = function (string $u) {
        $own = site_url() . '/';
        if (strpos($u, $own) === 0) { // kendi sitemiz: dosyayı diskten oku (HTTP'ye ve bot korumasına gerek yok)
            $f = SITE_ROOT . '/' . substr($u, strlen($own));
            if (is_file($f)) return (string)file_get_contents($f);
        }
        [$code, $body] = http_req('GET', $u, null, [], 20);
        return $code === 200 ? $body : '';
    };
    $queue = [(string)cfg('INSPECT_SITEMAP', site_url() . '/sitemap.xml')];
    $seen = 0;
    while ($queue && $seen < 6 && count($urls) < 500) {
        $xml = $read(array_shift($queue));
        $seen++;
        if ($xml === '') continue;
        $isIndex = stripos($xml, '<sitemapindex') !== false;
        if (preg_match_all('~<loc>\s*([^<\s]+)\s*</loc>~i', $xml, $m)) {
            foreach ($m[1] as $loc) {
                $loc = html_entity_decode($loc, ENT_QUOTES | ENT_XML1, 'UTF-8');
                if ($isIndex) $queue[] = $loc; else $urls[$loc] = 1;
            }
        }
    }
    foreach ((array)cfg('INSPECT_URLS', []) as $u) if (is_string($u) && $u !== '') $urls[$u] = 1;
    return array_slice(array_keys($urls), 0, 500);
}
/** Listeyi adm_inspect ile eşitle (yeni adresler eklenir, listeden çıkanlar in_list=0). */
function inspect_sync(): int
{
    $urls = sitemap_urls();
    if (!$urls) return 0;
    q('UPDATE adm_inspect SET in_list = 0');
    foreach ($urls as $u) {
        q('INSERT INTO adm_inspect (uh, url, in_list) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE in_list = 1', [sha1($u, true), $u]);
    }
    return count($urls);
}
function inspect_quota_used(): int { return (int)(setting_get('inspect_quota:' . today(), true) ?? 0); }

/** En fazla $max adres denetler. Dönüş: ['done'=>n, 'total'=>n, 'error'=>?string, 'skipped'=>n]. */
function inspect_run(int $max = 20): array
{
    $n = inspect_sync();
    if (!$n) return ['done' => 0, 'total' => 0, 'error' => 'Site haritasından adres okunamadı (INSPECT_SITEMAP / INSPECT_URLS).', 'skipped' => 0];
    $limit = (int)cfg('INSPECT_DAILY_QUOTA', 2000);
    $left = $limit - inspect_quota_used();
    if ($left <= 0) return ['done' => 0, 'total' => 0, 'error' => 'Günlük URL Inspection kotası (' . $limit . ') doldu; yarın tekrar dene.', 'skipped' => 0];
    $max = min($max, $left);
    $cut = date('Y-m-d H:i:s', time() - 7 * 86400);
    $list = rows('SELECT uh, url FROM adm_inspect WHERE in_list = 1 AND (checked_at IS NULL OR checked_at < ?)
                  ORDER BY checked_at IS NOT NULL, checked_at LIMIT ' . (int)$max, [$cut]);
    $skipped = (int)val('SELECT COUNT(*) FROM adm_inspect WHERE in_list = 1 AND checked_at >= ?', [$cut]);
    $done = 0;
    foreach ($list as $r) {
        try {
            $j = google_api('POST', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
                ['inspectionUrl' => $r['url'], 'siteUrl' => gsc_site(), 'languageCode' => 'tr-TR'], GSC_SCOPE);
        } catch (Throwable $e) {
            q('UPDATE adm_inspect SET error = ? WHERE uh = ?', [$e->getMessage(), $r['uh']]);
            return ['done' => $done, 'total' => count($list), 'error' => google_reason_tr($e) . ' (adres: ' . $r['url'] . ')', 'skipped' => $skipped];
        }
        $s = $j['inspectionResult']['indexStatusResult'] ?? [];
        $lc = !empty($s['lastCrawlTime']) ? date('Y-m-d H:i:s', strtotime($s['lastCrawlTime'])) : null;
        q('UPDATE adm_inspect SET verdict = ?, coverage = ?, indexing = ?, robots = ?, fetch_state = ?, last_crawl = ?,
           google_canonical = ?, user_canonical = ?, checked_at = ?, error = NULL WHERE uh = ?', [
            $s['verdict'] ?? null, isset($s['coverageState']) ? mb_substr($s['coverageState'], 0, 191) : null, $s['indexingState'] ?? null,
            $s['robotsTxtState'] ?? null, $s['pageFetchState'] ?? null, $lc, $s['googleCanonical'] ?? null, $s['userCanonical'] ?? null, now(), $r['uh'],
        ]);
        setting_set('inspect_quota:' . today(), (string)(inspect_quota_used() + 1), 2 * 86400);
        $done++;
    }
    return ['done' => $done, 'total' => count($list), 'error' => null, 'skipped' => $skipped];
}

/** coverageState → Türkçe açıklama. */
function coverage_tr(?string $c): string
{
    if ($c === null || $c === '') return 'Henüz denetlenmedi';
    $map = [
        'submitted and indexed' => 'Gönderildi ve dizinde. Sorun yok.',
        'indexed, not submitted' => 'Dizinde ama site haritasında yok. Sorun değil; istersen site haritasına ekle.',
        'indexed, though blocked' => 'robots.txt engellemesine rağmen dizinde. robots.txt kuralını gözden geçir.',
        'crawled - currently not indexed' => 'Tarandı, şu an dizinde değil: Google sayfayı gördü ama eklemeye değer bulmadı (içerik zayıf ya da başka sayfalara çok benziyor olabilir). İçeriği güçlendir, iç bağlantı ver; zamanla eklenebilir.',
        'discovered - currently not indexed' => 'Bulundu, henüz taranmadı: Google adresi biliyor ama taramayı erteledi (tarama önceliği düşük). İç bağlantı ve site haritası yardımcı olur.',
        'duplicate without user-selected canonical' => 'Kopya, canonical belirtilmemiş: Google başka bir sayfayı asıl saydı. Sayfaya canonical etiketi ekle ya da içeriği ayrıştır.',
        'duplicate, google chose different canonical' => 'Kopya: Google, senin belirttiğin canonical yerine başka bir sayfayı asıl seçti.',
        'duplicate, submitted url not selected' => 'Kopya: gönderilen adres asıl sayfa olarak seçilmedi.',
        'alternate page with proper canonical' => 'Doğru canonical etiketli alternatif sayfa. Sorun değil.',
        'noindex' => 'noindex etiketiyle hariç tutuldu. Dizine girmesi gerekiyorsa noindex\'i kaldır.',
        'page with redirect' => 'Yönlendirmeli sayfa: adres başka bir adrese yönleniyor. Site haritasına son adresi koy.',
        'not found (404)' => 'Bulunamadı (404). Sayfa silindiyse site haritasından çıkar.',
        'soft 404' => 'Yumuşak 404: sayfa açılıyor ama Google içeriği "boş / bulunamadı" sayıyor.',
        'blocked by robots.txt' => 'robots.txt ile engellendi.',
        'server error' => 'Sunucu hatası (5xx): Google tararken sunucu hata verdi.',
        'redirect error' => 'Yönlendirme hatası (döngü ya da çok uzun zincir).',
        'unauthorized request (401)' => 'Yetkisiz istek (401) yüzünden engellendi.',
        'access forbidden (403)' => 'Erişim yasak (403) yüzünden engellendi.',
        'other 4xx' => 'Başka bir 4xx hatası yüzünden engellendi.',
        'url is unknown to google' => 'Google bu adresi bilmiyor: hiç keşfedilmemiş. Site haritasında ve iç bağlantılarda olduğundan emin ol; Search Console\'da dizine eklenmesini iste.',
    ];
    $l = strtolower(str_replace(['‘', '’'], "'", $c));
    foreach ($map as $k => $v) if (strpos($l, $k) !== false) return $v;
    return $c;
}
function verdict_tr(?string $v): string
{
    return ['PASS' => 'Dizinde', 'PARTIAL' => 'Kısmen', 'FAIL' => 'Hata', 'NEUTRAL' => 'Dizinde değil'][$v ?? ''] ?? ($v ? $v : 'Denetlenmedi');
}
function inspect_summary(): array
{
    $r = row("SELECT COUNT(*) total, SUM(checked_at IS NOT NULL) checked, SUM(verdict = 'PASS') indexed,
              SUM(checked_at IS NOT NULL AND (verdict IS NULL OR verdict <> 'PASS')) notindexed FROM adm_inspect WHERE in_list = 1");
    return array_map('intval', $r ?: ['total' => 0, 'checked' => 0, 'indexed' => 0, 'notindexed' => 0]);
}
