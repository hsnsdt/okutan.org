# Kelime Bulucu — Vikisözlük (tr.wiktionary) dökümünden zengin anlam verisi.
# Kullanım: python -I tools/vikisozluk-anlam.py [döküm.xml.bz2] [sözlük.txt]
#   varsayılan döküm: ../kelimelik/scripts/trwiktionary-latest-pages-articles.xml.bz2
#   varsayılan sözlük: ../kelimelik/assets/words/turkce_kelimeler.txt
# Çıktı: tools/.veri/vikisozluk.json  { kelime: { k: köken, t: [{ tur, a: [{ d, e:[etiket], o:[örnek] }] }], s:[eş anlamlı], dy:[deyim] } }
# (kelime-bulucu-uret.mjs bunu okuyup kelime-bulucu/veri/anlam/*.json ve anlam/*.json parçalarını yazar)
# Yalnızca küçük harfli başlıklar alınır: "Aralık" (ilçe) sayfası "aralık" kelimesinin yerine geçmesin.
import bz2, html, json, os, re, sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUMP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(KOK, '..', 'kelimelik', 'scripts', 'trwiktionary-latest-pages-articles.xml.bz2')
SOZ = sys.argv[2] if len(sys.argv) > 2 else os.path.join(KOK, '..', 'kelimelik', 'assets', 'words', 'turkce_kelimeler.txt')
CIKTI = os.path.join(KOK, 'tools', '.veri', 'vikisozluk.json')

kelimeler = set(l.strip() for l in open(SOZ, encoding='utf-8') if l.strip())

TUR = {'ad': 'isim', 'isim': 'isim', 'ön ad': 'sıfat', 'sıfat': 'sıfat', 'fiil': 'fiil', 'eylem': 'fiil', 'zarf': 'zarf', 'belirteç': 'zarf',
       'zamir': 'zamir', 'adıl': 'zamir', 'edat': 'edat', 'ilgeç': 'edat', 'bağlaç': 'bağlaç', 'ünlem': 'ünlem', 'özel ad': 'özel isim',
       'deyim': 'deyim', 'atasözü': 'atasözü', 'kısaltma': 'kısaltma', 'sayı': 'sayı', 'ek': 'ek', 'son ek': 'ek', 'ön ek': 'ek', 'erkek adı': 'özel isim', 'kadın adı': 'özel isim'}
DIL = {'ota': 'Osmanlı Türkçesi', 'ar': 'Arapça', 'fa': 'Farsça', 'fr': 'Fransızca', 'it': 'İtalyanca', 'en': 'İngilizce', 'de': 'Almanca', 'el': 'Yunanca',
       'grc': 'Eski Yunanca', 'la': 'Latince', 'otk': 'Eski Türkçe', 'trk-pro': 'Ön Türkçe', 'trk-oat': 'Eski Anadolu Türkçesi', 'ru': 'Rusça', 'es': 'İspanyolca',
       'hy': 'Ermenice', 'sq': 'Arnavutça', 'bg': 'Bulgarca', 'pt': 'Portekizce', 'nl': 'Felemenkçe', 'hu': 'Macarca', 'sr': 'Sırpça', 'he': 'İbranice',
       'syc': 'Süryanice', 'arc': 'Aramice', 'xcl': 'Eski Ermenice', 'pal': 'Orta Farsça', 'peo': 'Eski Farsça', 'sa': 'Sanskritçe', 'zh': 'Çince',
       'ja': 'Japonca', 'mn': 'Moğolca', 'xmo': 'Orta Moğolca', 'chg': 'Çağatayca', 'ro': 'Rumence', 'pl': 'Lehçe', 'vec': 'Venedikçe', 'lad': 'Ladino',
       'ka': 'Gürcüce', 'ku': 'Kürtçe', 'az': 'Azerice', 'tr': 'Türkçe', 'ine-pro': 'Ön Hint-Avrupa dili', 'gkm': 'Orta Yunanca', 'sv': 'İsveççe', 'cs': 'Çekçe'}
KOKEN_SABLON = re.compile(r'\{\{\s*(?:k|köken|devralınan|ödünç|alıntı|ödünçleme|der|türetilmiş|bor|inh|kökenli)\s*\|([^{}]*)\}\}')

def temizle(s):
    s = re.sub(r'<ref[^>]*/>', '', s)
    s = re.sub(r'<ref[^>]*>.*?</ref>', '', s, flags=re.S)
    s = re.sub(r'<[^>]+>', '', s)
    s = re.sub(r'\[\[(?:Dosya|File|Resim|Image|Kategori|Category):[^\]]*\]\]', '', s, flags=re.I)
    s = re.sub(r'\[\[[^\]|]*\|([^\]]*)\]\]', r'\1', s)
    s = re.sub(r'\[\[([^\]]*)\]\]', r'\1', s)
    s = re.sub(r'\{\{\s*(?:l|bağ|z|bağlantı)\s*\|[^|}]*\|([^|}]*)[^}]*\}\}', r'\1', s)
    s = re.sub(r'\{\{\s*ağız\s*\|([^}]*)\}\}', lambda m: '(' + m.group(1).split('|')[0] + ' ağzı)', s)
    for _ in range(3):
        s = re.sub(r'\{\{[^{}]*\}\}', '', s)
    s = s.replace("'''", '').replace("''", '')
    s = re.sub(r'\s+', ' ', s).strip(' :;,-–')
    return s.strip()

def parametreler(icerik):
    parca = icerik.split('|')
    ad, poz, isim = parca[0].strip(), [], {}
    for p in parca[1:]:
        if '=' in p and re.match(r'^\s*[\wçğıöşü ]+\s*=', p):
            k, v = p.split('=', 1); isim[k.strip()] = v.strip()
        else:
            poz.append(p.strip())
    return ad, poz, isim

def ornek(satir):
    t = satir.lstrip('#*: ').strip()
    m = re.match(r'^\{\{(.*)\}\}\s*$', t, re.S)
    if m and '{{' not in m.group(1):
        ad, poz, isim = parametreler(m.group(1))
        ad = ad.lower()
        if ad in ('ux', 'kullanım örneği'):
            metin, yazar = (poz[1] if len(poz) > 1 else ''), ''
        elif ad in ('örnek',):
            metin = poz[0] if poz else isim.get('1', ''); yazar = poz[1] if len(poz) > 1 else isim.get('yazar', '')
        elif ad in ('kt', 'mt', 'gt', 'alıntı-kitap', 'alıntı-dergi', 'alıntı-gazete', 'alıntı'):
            metin, yazar = isim.get('tanıklık', isim.get('alıntı', '')), isim.get('yazar', '')
            if yazar and yazar.isupper() is False:
                pass
        elif ad in ('eş anlamlılar', 'eş anlamlı', 'eş'):
            return ('es', [temizle(x) for x in poz[1:] if temizle(x)])
        elif ad in ('zıt anlamlılar', 'zıt anlamlı'):
            return None
        else:
            return None
        metin = temizle(metin)
        if not metin or len(metin) < 3:
            return None
        yazar = temizle(yazar)
        if yazar:
            yazar = ' '.join(w.capitalize() if w.isupper() and len(w) > 2 else w for w in yazar.split())
        return ('o', metin + (' — ' + yazar if yazar else ''))
    t = temizle(t)
    t = re.sub(r'^"(.*)"\s*-\s*(.+)$', r'\1 — \2', t)
    t = re.sub(r'\s+-\s+([A-ZÇĞİÖŞÜ][^-]{2,40})$', r' — \1', t)
    if len(t) < 3:
        return None
    return ('o', t.strip('"'))

def bolum_turkce(text):
    m = re.search(r'^==\s*(?:Türkçe|\{\{\s*Dil\s*\|\s*Türkçe\s*\}\})\s*==\s*$', text, re.M)
    if not m:
        return None
    rest = text[m.end():]
    n = re.search(r'^==[^=].*==\s*$', rest, re.M)
    return rest[:n.start()] if n else rest

def birlestir(satirlar):
    # çok satıra yayılan {{...}} şablonlarını tek satıra topla
    out, buf, derin = [], '', 0
    for s in satirlar:
        if buf:
            buf += ' ' + s.strip()
        else:
            buf = s
        derin = buf.count('{{') - buf.count('}}')
        if derin <= 0:
            out.append(buf); buf = ''
    if buf:
        out.append(buf)
    return out

def ayristir(text):
    bol = bolum_turkce(text)
    if bol is None:
        return None
    sonuc = {'t': []}
    baslik, tur, kaynakca = '', None, False
    es, dy = [], []
    satirlar = birlestir(bol.split('\n'))
    koken_satir = []
    for s in satirlar:
        h = re.match(r'^(={3,5})\s*(.*?)\s*\1\s*$', s)
        if h:
            baslik = temizle(h.group(2)).lower() if '{{' not in h.group(2) else h.group(2).lower()
            if 'kaynakça' in baslik:
                kaynakca = True
            if not kaynakca and baslik in TUR:
                tur = {'tur': TUR[baslik], 'a': []}; sonuc['t'].append(tur)
            elif baslik not in TUR:
                tur = None if baslik not in ('çekimleme',) else tur
            continue
        if kaynakca:
            continue
        if baslik == 'köken':
            koken_satir.append(s)
            continue
        if baslik in ('deyimler', 'atasözleri'):
            dy += [temizle(x) for x in re.findall(r'\[\[([^\]]+)\]\]', s)]
            continue
        if baslik in ('eş anlamlılar', 'eş anlamlı'):
            es += [temizle(x) for x in re.findall(r'\[\[([^\]]+)\]\]', s)]
            continue
        if tur is None:
            continue
        if re.match(r'^#\s*[*:]', s):
            if tur['a']:
                r = ornek(s)
                if r and r[0] == 'o' and len(tur['a'][-1]['o']) < 3:
                    tur['a'][-1]['o'].append(r[1])
                elif r and r[0] == 'es':
                    es += r[1]
            continue
        if s.startswith('#'):
            if '{{tr-çekim' in s:
                continue
            ham = s.lstrip('#').strip()
            etiket = []
            for m in re.finditer(r'\{\{\s*t\s*\|([^{}]*)\}\}', ham):
                _, poz, isim = parametreler('t|' + m.group(1))
                etiket += [p for p in poz if p and p not in ('tr',)]
            d = temizle(ham)
            if d and len(d) > 1:
                tur['a'].append({'d': d[0].upper() + d[1:] if d[0].islower() and d[0] not in 'iı' else (d.replace('i', 'İ', 1) if d[0] == 'i' else (d.replace('ı', 'I', 1) if d[0] == 'ı' else d)), 'e': etiket[:3], 'o': []})
    # köken
    dil = []
    for s in koken_satir:
        for m in KOKEN_SABLON.finditer(s):
            _, poz, isim = parametreler('x|' + m.group(1))
            kod = None
            if isim.get('dil') == 'tr' and poz:
                kod = poz[0]
            elif len(poz) >= 2 and poz[0] == 'tr':
                kod = poz[1]
            elif poz:
                kod = poz[0]
            if kod and kod in DIL and DIL[kod] != 'Türkçe' and DIL[kod] not in dil:
                dil.append(DIL[kod])
    if dil:
        sonuc['k'] = ' < '.join(dil)
    sonuc['t'] = [t for t in sonuc['t'] if t['a']]
    for t in sonuc['t']:
        for a in t['a']:
            if not a['e']: del a['e']
            if not a['o']: del a['o']
    es = [x for x in dict.fromkeys(es) if x and x != '']
    dy = [x for x in dict.fromkeys(dy) if x]
    if es: sonuc['s'] = es[:12]
    if dy: sonuc['dy'] = dy[:15]
    if not sonuc['t']:
        return None
    return sonuc

def main():
    os.makedirs(os.path.dirname(CIKTI), exist_ok=True)
    out = {}
    title, ns, intext, buf = '', '', False, []
    with bz2.open(DUMP, 'rt', encoding='utf-8') as f:
        for line in f:
            if not intext:
                if '<title>' in line:
                    title = html.unescape(line.strip()[7:-8]); ns = ''
                elif '<ns>' in line:
                    ns = line.strip()[4:-5]
                elif '<text' in line and ns == '0' and title in kelimeler:
                    i = line.find('>') + 1
                    rest = line[i:]
                    if '</text>' in rest:
                        buf = [rest[:rest.find('</text>')]]
                        r = ayristir(html.unescape(''.join(buf)))
                        if r: out[title] = r
                    else:
                        intext, buf = True, [rest]
            else:
                if '</text>' in line:
                    buf.append(line[:line.find('</text>')])
                    intext = False
                    r = ayristir(html.unescape(''.join(buf)))
                    if r: out[title] = r
                else:
                    buf.append(line)
    with open(CIKTI, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    n_anlam = sum(len(a['a']) for v in out.values() for a in v['t'])
    n_ornek = sum(len(x.get('o', [])) for v in out.values() for a in v['t'] for x in a['a'])
    print('kelime', len(out), 'anlam', n_anlam, 'örnek', n_ornek, 'köken', sum(1 for v in out.values() if 'k' in v))

main()
