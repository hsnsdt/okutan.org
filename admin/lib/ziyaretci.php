<?php
// Ziyaretçi özellikleri (kaba, kimliksiz): tarayıcı ve sistem ailesi (tarayıcı kimliğinden), ülke (IP'den DEĞİL:
// tarayıcının saat dilimi, olmazsa dil bölgesi). stats.php ve panel kullanır.
declare(strict_types=1);

/** Sayfa grubu: binlerce Kelime Bulucu sayfası tek satırda toplanır (yolculuk, hız). */
function path_group(string $p): string
{
    $p = (string)preg_replace('~[?#].*$~s', '', $p);
    if (preg_match('~^/kelime-bulucu/(kelime|liste|sozluk)/.+~', $p, $m)) return '/kelime-bulucu/' . $m[1] . '/*';
    return mb_substr($p === '' ? '/' : $p, 0, 120);
}

/** Hız ölçümü kutucukları: LCP 250 ms, CLS 0,01, INP 25 ms adımlı; üst sınırda toplanır. */
const VITAL_STEP = ['lcp' => 250, 'cls' => 0.01, 'inp' => 25];
const VITAL_MAXBIN = ['lcp' => 60, 'cls' => 100, 'inp' => 60];
/** İyi / geliştirilmeli eşikleri (Google). */
const VITAL_LIMIT = ['lcp' => [2500, 4000], 'cls' => [0.1, 0.25], 'inp' => [200, 500]];

function ua_browser(string $ua): string
{
    $m = [
        '~FBAN|FBAV|FB_IAB~' => 'Facebook', '~Instagram~' => 'Instagram', '~TikTok|musical_ly~' => 'TikTok', '~ (Line|Twitter|Snapchat)/~' => 'Uygulama içi',
        '~Edg(A|iOS)?/~' => 'Edge', '~OPR/|Opera~' => 'Opera', '~SamsungBrowser~' => 'Samsung', '~YaBrowser~' => 'Yandex',
        '~Firefox/|FxiOS~' => 'Firefox', '~CriOS|Chrome/~' => 'Chrome', '~Safari/~' => 'Safari',
    ];
    foreach ($m as $re => $name) if (preg_match($re, $ua)) return $name;
    return 'Diğer';
}
function ua_os(string $ua): string
{
    $m = ['~Android~' => 'Android', '~iPhone|iPad|iPod~' => 'iOS', '~CrOS~' => 'ChromeOS', '~Windows~' => 'Windows', '~Mac OS X|Macintosh~' => 'macOS', '~Linux~' => 'Linux'];
    foreach ($m as $re => $name) if (preg_match($re, $ua)) return $name;
    return 'Diğer';
}

const TZ_CC = [
    'Europe/Istanbul' => 'TR', 'Asia/Istanbul' => 'TR', 'Europe/Berlin' => 'DE', 'Europe/London' => 'GB', 'Europe/Paris' => 'FR', 'Europe/Amsterdam' => 'NL',
    'Europe/Brussels' => 'BE', 'Europe/Vienna' => 'AT', 'Europe/Zurich' => 'CH', 'Europe/Stockholm' => 'SE', 'Europe/Oslo' => 'NO', 'Europe/Copenhagen' => 'DK',
    'Europe/Helsinki' => 'FI', 'Europe/Madrid' => 'ES', 'Europe/Rome' => 'IT', 'Europe/Athens' => 'GR', 'Europe/Sofia' => 'BG', 'Europe/Bucharest' => 'RO',
    'Europe/Kiev' => 'UA', 'Europe/Kyiv' => 'UA', 'Europe/Moscow' => 'RU', 'Europe/Warsaw' => 'PL', 'Europe/Prague' => 'CZ', 'Europe/Budapest' => 'HU',
    'Europe/Belgrade' => 'RS', 'Europe/Sarajevo' => 'BA', 'Europe/Skopje' => 'MK', 'Europe/Tirane' => 'AL', 'Europe/Chisinau' => 'MD', 'Europe/Minsk' => 'BY',
    'Europe/Dublin' => 'IE', 'Europe/Lisbon' => 'PT', 'Europe/Luxembourg' => 'LU', 'Asia/Nicosia' => 'CY', 'Asia/Famagusta' => 'CY', 'Europe/Nicosia' => 'CY',
    'Asia/Baku' => 'AZ', 'Asia/Tbilisi' => 'GE', 'Asia/Yerevan' => 'AM', 'Asia/Almaty' => 'KZ', 'Asia/Tashkent' => 'UZ', 'Asia/Ashgabat' => 'TM',
    'Asia/Bishkek' => 'KG', 'Asia/Tehran' => 'IR', 'Asia/Baghdad' => 'IQ', 'Asia/Damascus' => 'SY', 'Asia/Beirut' => 'LB', 'Asia/Amman' => 'JO',
    'Asia/Riyadh' => 'SA', 'Asia/Dubai' => 'AE', 'Asia/Qatar' => 'QA', 'Asia/Kuwait' => 'KW', 'Asia/Jerusalem' => 'IL', 'Africa/Cairo' => 'EG',
    'America/New_York' => 'US', 'America/Chicago' => 'US', 'America/Denver' => 'US', 'America/Los_Angeles' => 'US', 'America/Phoenix' => 'US',
    'America/Toronto' => 'CA', 'America/Vancouver' => 'CA', 'Australia/Sydney' => 'AU', 'Australia/Melbourne' => 'AU', 'Asia/Tokyo' => 'JP',
    'Asia/Shanghai' => 'CN', 'Asia/Kolkata' => 'IN', 'Asia/Karachi' => 'PK', 'Asia/Seoul' => 'KR', 'Africa/Casablanca' => 'MA', 'Africa/Tunis' => 'TN',
    'Africa/Algiers' => 'DZ',
];
/** Ülke kodu: saat dilimi → ülke; olmazsa dil etiketinin bölgesi (tr-TR → TR); yoksa ''. */
function guess_country(string $tz, string $langTag): string
{
    if (isset(TZ_CC[$tz])) return TZ_CC[$tz];
    if (preg_match('~^[a-z]{2,3}[-_]([A-Z]{2})$~', $langTag, $m)) return $m[1];
    return '';
}
function country_tr(string $cc): string
{
    static $n = ['TR' => 'Türkiye', 'DE' => 'Almanya', 'GB' => 'Birleşik Krallık', 'FR' => 'Fransa', 'NL' => 'Hollanda', 'BE' => 'Belçika', 'AT' => 'Avusturya',
        'CH' => 'İsviçre', 'SE' => 'İsveç', 'NO' => 'Norveç', 'DK' => 'Danimarka', 'FI' => 'Finlandiya', 'ES' => 'İspanya', 'IT' => 'İtalya', 'GR' => 'Yunanistan',
        'BG' => 'Bulgaristan', 'RO' => 'Romanya', 'UA' => 'Ukrayna', 'RU' => 'Rusya', 'PL' => 'Polonya', 'CZ' => 'Çekya', 'HU' => 'Macaristan', 'RS' => 'Sırbistan',
        'BA' => 'Bosna-Hersek', 'MK' => 'Kuzey Makedonya', 'AL' => 'Arnavutluk', 'MD' => 'Moldova', 'BY' => 'Belarus', 'IE' => 'İrlanda', 'PT' => 'Portekiz',
        'LU' => 'Lüksemburg', 'CY' => 'Kıbrıs', 'AZ' => 'Azerbaycan', 'GE' => 'Gürcistan', 'AM' => 'Ermenistan', 'KZ' => 'Kazakistan', 'UZ' => 'Özbekistan',
        'TM' => 'Türkmenistan', 'KG' => 'Kırgızistan', 'IR' => 'İran', 'IQ' => 'Irak', 'SY' => 'Suriye', 'LB' => 'Lübnan', 'JO' => 'Ürdün', 'SA' => 'Suudi Arabistan',
        'AE' => 'BAE', 'QA' => 'Katar', 'KW' => 'Kuveyt', 'IL' => 'İsrail', 'EG' => 'Mısır', 'US' => 'ABD', 'CA' => 'Kanada', 'AU' => 'Avustralya', 'JP' => 'Japonya',
        'CN' => 'Çin', 'IN' => 'Hindistan', 'PK' => 'Pakistan', 'KR' => 'Güney Kore', 'MA' => 'Fas', 'TN' => 'Tunus', 'DZ' => 'Cezayir'];
    return $cc === '' ? 'Bilinmiyor' : ($n[$cc] ?? $cc);
}
