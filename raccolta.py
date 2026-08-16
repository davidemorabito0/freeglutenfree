#!/usr/bin/env python3
"""
RACCOLTA — freeglutenfree
═══════════════════════════════════════════════════════════════════════════
Scarica da OpenStreetMap i punti utili a chi mangia senza glutine, una
provincia alla volta, spalmando il lavoro su piu' esecuzioni nel corso
delle ore. Ogni esecuzione riprende da dove si era fermata.

FONTE UNICA: OpenStreetMap (licenza ODbL 1.0).
Nessun altro archivio viene interrogato. I database delle piattaforme
italiane dedicate alla celiachia sono protetti dal diritto sui generis
del costitutore (art. 102-bis L.633/1941): estrarli in modo automatico
sarebbe illecito anche riscrivendo i dati, quindi qui non si fa.

Uscita:
  data/_province.json      elenco province con bounding box
  data/_stato.json         punto a cui e' arrivata la raccolta
  data/_indice.json        conteggi per provincia, letto dall'app
  data/mangiare/<SG>.json  locali con indicazioni senza glutine
  data/spesa/<SG>.json     farmacie, bio, supermercati, negozi dedicati
"""

import json, os, re, sys, time, unicodedata
from datetime import datetime, timezone
from urllib import request, error

RADICE   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATI     = os.path.join(RADICE, 'data')
ENDPOINT = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.osm.jp/api/interpreter',
]
UA = 'freeglutenfree-harvester/1.0 (+https://www.davidemorabito.com; info@davidemorabito.com)'

PER_ESECUZIONE = int(os.environ.get('PROVINCE_PER_RUN', '14'))
PAUSA          = int(os.environ.get('PAUSA_SECONDI',   '18'))

NOME_GF = 'senza glutine|gluten ?free|glutenfree|celiac'

# ─────────────────────────────────────────────────────────────── rete

def chiedi(query, tentativi=4):
    dati = query.encode('utf-8')
    ultimo = None
    for giro in range(tentativi):
        url = ENDPOINT[giro % len(ENDPOINT)]
        try:
            req = request.Request(url, data=dati, headers={
                'User-Agent': UA, 'Content-Type': 'text/plain; charset=utf-8'})
            with request.urlopen(req, timeout=600) as r:
                return json.loads(r.read().decode('utf-8'))
        except error.HTTPError as e:
            ultimo = f'HTTP {e.code}'
            attesa = 60 if e.code in (429, 504) else 20
        except Exception as e:
            ultimo = str(e)
            attesa = 25
        attesa = attesa * (giro + 1)
        print(f'   ritento fra {attesa}s ({ultimo})', flush=True)
        time.sleep(attesa)
    raise RuntimeError(f'Overpass non risponde: {ultimo}')

# ─────────────────────────────────────────────────────── query per zona

def q_mangiare(bb):
    s, w, n, e = bb
    f = f'({s},{w},{n},{e})'
    return f"""[out:json][timeout:300];
(
  nwr["diet:gluten_free"]{f};
  nwr["gluten_free"]{f};
  nwr["diet:celiac"]{f};
  nwr["diet:coeliac"]{f};
  nwr["cuisine"~"gluten_free|celiac",i]{f};
  nwr["amenity"]["name"~"{NOME_GF}",i]{f};
  nwr["shop"]["name"~"{NOME_GF}",i]{f};
  nwr["amenity"]["description"~"glutine|gluten",i]{f};
  nwr["shop"]["description"~"glutine|gluten",i]{f};
);
out center tags;"""

def q_spesa(bb):
    s, w, n, e = bb
    f = f'({s},{w},{n},{e})'
    return f"""[out:json][timeout:300];
(
  nwr["amenity"="pharmacy"]{f};
  nwr["shop"="chemist"]{f};
  nwr["shop"="health_food"]{f};
  nwr["shop"="herbalist"]{f};
  nwr["shop"="organic"]{f};
  nwr["shop"="supermarket"]{f};
  nwr["shop"]["diet:gluten_free"]{f};
);
out center tags;"""

Q_PROVINCE = """[out:json][timeout:600];
area["ISO3166-1"="IT"][admin_level=2]->.it;
relation["admin_level"="6"]["boundary"="administrative"](area.it);
out ids tags bb;"""

# ─────────────────────────────────────────────────── normalizzazione

MAP_LIVELLO = {'only':'gf_100', 'yes':'dati_insufficienti',
               'limited':'dati_insufficienti', 'no':'condivisa_senza_garanzie'}

MAP_TIPO = {
    'amenity:restaurant':'ristorante','amenity:fast_food':'fast_food','amenity:cafe':'caffetteria',
    'amenity:bar':'bar','amenity:pub':'pub','amenity:biergarten':'birreria','amenity:ice_cream':'gelateria',
    'shop:bakery':'panificio','shop:pastry':'pasticceria','shop:confectionery':'pasticceria',
    'shop:supermarket':'supermercato','shop:deli':'negozio','shop:health_food':'negozio',
    'shop:convenience':'negozio','shop:greengrocer':'negozio','shop:chocolate':'negozio',
    'tourism:hotel':'hotel','tourism:guest_house':'b_and_b','tourism:hostel':'ostello',
    'tourism:apartment':'b_and_b',
}

def coord(el):
    if el.get('type') == 'node':
        return el.get('lat'), el.get('lon')
    c = el.get('center') or {}
    return c.get('lat'), c.get('lon')

def pulisci(v):
    return v if v not in ('', None) else None

def tipo_di(t):
    nome = (t.get('name') or '').lower()
    cuc  = (t.get('cuisine') or '').lower()
    if 'pizza' in cuc or 'pizzeri' in nome:
        return 'pizzeria'
    for k in ('amenity', 'shop', 'tourism'):
        v = t.get(k)
        if v and f'{k}:{v}' in MAP_TIPO:
            return MAP_TIPO[f'{k}:{v}']
    return 'altro'

def norm_mangiare(el):
    t = el.get('tags') or {}
    lat, lng = coord(el)
    if lat is None or lng is None:
        return None
    gf = t.get('diet:gluten_free') or t.get('gluten_free') or t.get('diet:celiac') or t.get('diet:coeliac')
    nome = t.get('name') or ''
    per_nome   = not gf and re.search(NOME_GF, nome, re.I)
    per_cucina = not gf and re.search('gluten', t.get('cuisine') or '', re.I)
    per_desc   = not gf and re.search('glutine|gluten', t.get('description') or '', re.I)
    if not (gf or per_nome or per_cucina or per_desc):
        return None
    # MAPPING PESSIMISTA: solo "only" viene promosso. "yes" dice che esistono
    # opzioni senza glutine, non come e' gestita la contaminazione.
    r = {
        'k': f"{el['type']}/{el['id']}", 'ty': el['type'][0], 'id': el['id'],
        'n': nome or 'Locale senza nome',
        'la': round(lat, 6), 'ln': round(lng, 6),
        'tp': tipo_di(t),
        'lv': MAP_LIVELLO.get(gf, 'dati_insufficienti') if gf else 'dati_insufficienti',
        'or': 'tag' if gf else ('cucina' if per_cucina else ('descrizione' if per_desc else 'nome')),
    }
    for chiave, tag in (('gf','diet:gluten_free'), ('ind',None), ('com','addr:city'),
                        ('tel','phone'), ('web','website'), ('ora','opening_hours'),
                        ('cuc','cuisine'), ('des','description'),
                        ('lat_','diet:lactose_free'), ('veg','diet:vegetarian'), ('vgn','diet:vegan'),
                        ('asp','takeaway'), ('con','delivery'), ('deh','outdoor_seating'),
                        ('acc','wheelchair')):
        if chiave == 'ind':
            v = ' '.join(x for x in (t.get('addr:street'), t.get('addr:housenumber')) if x) or None
        elif chiave == 'gf':
            v = gf
        else:
            v = pulisci(t.get(tag))
        if v:
            r[chiave] = v
    if not r.get('tel'):
        v = pulisci(t.get('contact:phone'))
        if v: r['tel'] = v
    if not r.get('web'):
        v = pulisci(t.get('contact:website'))
        if v: r['web'] = v
    return r

def cat_spesa(t):
    gf = t.get('diet:gluten_free') or t.get('gluten_free')
    if gf == 'only' or re.search(NOME_GF, t.get('name') or '', re.I):
        return 'specializzato'
    if t.get('amenity') == 'pharmacy' or t.get('shop') == 'chemist':
        return 'farmacia'
    if t.get('shop') in ('health_food', 'herbalist', 'organic'):
        return 'bio'
    if t.get('shop') == 'supermarket':
        return 'supermercato'
    return 'specializzato' if gf else None

ETICHETTA = {'farmacia':'Farmacia','bio':'Negozio bio',
             'supermercato':'Supermercato','specializzato':'Negozio senza glutine'}

def norm_spesa(el):
    t = el.get('tags') or {}
    lat, lng = coord(el)
    if lat is None or lng is None:
        return None
    cat = cat_spesa(t)
    if not cat:
        return None
    r = {
        'k': f"s:{el['type']}/{el['id']}", 'ty': el['type'][0], 'id': el['id'],
        'n': t.get('name') or ETICHETTA[cat],
        'la': round(lat, 6), 'ln': round(lng, 6), 'ct': cat,
    }
    for chiave, tag in (('mar','brand'), ('com','addr:city'), ('tel','phone'),
                        ('web','website'), ('ora','opening_hours'), ('gf','diet:gluten_free')):
        v = pulisci(t.get(tag))
        if v: r[chiave] = v
    if not r.get('mar'):
        v = pulisci(t.get('operator'))
        if v: r['mar'] = v
    v = ' '.join(x for x in (t.get('addr:street'), t.get('addr:housenumber')) if x)
    if v: r['ind'] = v
    return r

# ─────────────────────────────────────────────────────────── utilita'

def sigla_da(tags, usate):
    for k in ('ref', 'short_name', 'ref:ISTAT'):
        v = (tags.get(k) or '').strip()
        if re.fullmatch(r'[A-Za-z]{2,3}', v):
            s = v.upper()
            if s not in usate:
                return s
    base = unicodedata.normalize('NFKD', tags.get('name') or 'ZZ')
    base = ''.join(c for c in base if c.isalnum()).upper()[:4] or 'ZZ'
    s, i = base, 1
    while s in usate:
        i += 1
        s = f'{base}{i}'
    return s

def leggi(percorso, difetto):
    try:
        with open(percorso, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return difetto

def scrivi(percorso, oggetto):
    os.makedirs(os.path.dirname(percorso), exist_ok=True)
    with open(percorso, 'w', encoding='utf-8') as f:
        json.dump(oggetto, f, ensure_ascii=False, separators=(',', ':'))

def adesso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

# ────────────────────────────────────────────────────────────── passi

def carica_province():
    percorso = os.path.join(DATI, '_province.json')
    prov = leggi(percorso, None)
    if prov:
        return prov
    print('Scarico l\'elenco delle province italiane…', flush=True)
    ris = chiedi(Q_PROVINCE)
    prov, usate = [], set()
    for el in ris.get('elements', []):
        t = el.get('tags') or {}
        b = el.get('bounds')
        if not b or not t.get('name'):
            continue
        s = sigla_da(t, usate)
        usate.add(s)
        prov.append({
            'sg': s, 'nome': t['name'],
            'bb': [round(b['minlat'],4), round(b['minlon'],4),
                   round(b['maxlat'],4), round(b['maxlon'],4)],
        })
    prov.sort(key=lambda x: x['nome'])
    scrivi(percorso, prov)
    print(f'  trovate {len(prov)} province', flush=True)
    return prov

def raccogli(prov):
    esiti = {}
    for modo, costruttore, normalizzatore in (
            ('mangiare', q_mangiare, norm_mangiare),
            ('spesa',    q_spesa,    norm_spesa)):
        ris = chiedi(costruttore(prov['bb']))
        righe, visti = [], set()
        for el in ris.get('elements', []):
            r = normalizzatore(el)
            if r and r['k'] not in visti:
                visti.add(r['k'])
                righe.append(r)
        righe.sort(key=lambda x: x['n'])
        scrivi(os.path.join(DATI, modo, f"{prov['sg']}.json"), {
            'provincia': prov['nome'], 'sigla': prov['sg'], 'modo': modo,
            'aggiornato': adesso(),
            'fonte': 'OpenStreetMap contributors, ODbL 1.0',
            'punti': righe,
        })
        esiti[modo] = len(righe)
        print(f"   {modo:9} {len(righe):5}", flush=True)
        time.sleep(PAUSA)
    return esiti

def main():
    os.makedirs(DATI, exist_ok=True)
    province = carica_province()
    stato = leggi(os.path.join(DATI, '_stato.json'),
                  {'indice': 0, 'ciclo': 1, 'iniziato': adesso()})
    indice = leggi(os.path.join(DATI, '_indice.json'), {'province': {}})

    inizio = stato['indice'] % len(province)
    lotto = [province[(inizio + i) % len(province)] for i in range(min(PER_ESECUZIONE, len(province)))]

    print(f"Ciclo {stato['ciclo']} · province {inizio+1}–{inizio+len(lotto)} di {len(province)}\n", flush=True)

    for prov in lotto:
        print(f"→ {prov['nome']} ({prov['sg']})", flush=True)
        try:
            esiti = raccogli(prov)
            indice['province'][prov['sg']] = {
                'nome': prov['nome'], 'bb': prov['bb'],
                'mangiare': esiti['mangiare'], 'spesa': esiti['spesa'],
                'aggiornato': adesso(),
            }
        except Exception as e:
            print(f'   saltata: {e}', flush=True)

    nuovo = inizio + len(lotto)
    if nuovo >= len(province):
        stato['ciclo'] += 1
        nuovo = 0
        print('\nGiro completo: riparto dall\'inizio al prossimo avvio.', flush=True)
    stato['indice'] = nuovo
    stato['ultimo'] = adesso()

    tot_m = sum(p['mangiare'] for p in indice['province'].values())
    tot_s = sum(p['spesa']    for p in indice['province'].values())
    indice.update({
        'aggiornato': adesso(),
        'province_coperte': len(indice['province']),
        'province_totali': len(province),
        'totale_mangiare': tot_m,
        'totale_spesa': tot_s,
        'fonte': 'OpenStreetMap contributors, ODbL 1.0',
    })

    scrivi(os.path.join(DATI, '_stato.json'), stato)
    scrivi(os.path.join(DATI, '_indice.json'), indice)

    print(f'\nCopertura: {len(indice["province"])}/{len(province)} province')
    print(f'Totali finora — mangiare {tot_m} · spesa {tot_s}')

if __name__ == '__main__':
    sys.exit(main())
