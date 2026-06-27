import os, json, base64, urllib.request, datetime

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
REPO = 'francescocaruso487-tech/bioserra'
LAT  = 41.09696262016739
LON  = 14.388065360906802

HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

# Date fisse da calendario — usate solo per calcoli temporali, NON per determinare fase
PIANTE = [
    {'id': 7,  'nome': 'Epsilon F1',       'tipo': 'autofiorente', 'germoglio': '2026-04-21', 'harvest_min': 60, 'harvest_max': 60},
    {'id': 1,  'nome': 'Milky Way F1',     'tipo': 'autofiorente', 'germoglio': '2026-04-23', 'harvest_min': 70, 'harvest_max': 75},
    {'id': 2,  'nome': 'Titan F1',         'tipo': 'autofiorente', 'germoglio': '2026-04-22', 'harvest_min': 70, 'harvest_max': 75},
    {'id': 3,  'nome': 'Medusa F1',        'tipo': 'autofiorente', 'germoglio': '2026-04-21', 'harvest_min': 70, 'harvest_max': 75},
    {'id': 8,  'nome': 'Gaia F1',          'tipo': 'autofiorente', 'germoglio': '2026-04-21', 'harvest_min': 65, 'harvest_max': 70},
    {'id': 4,  'nome': 'Astro Lemonade F1','tipo': 'femminizzata', 'germoglio': '2026-04-21', 'flor_start': '2026-10-01', 'taglio': '2026-11-20'},
    {'id': 11, 'nome': 'Cosmic Cheddar F1','tipo': 'femminizzata', 'germoglio': '2026-05-02', 'flor_start': '2026-10-01', 'taglio': '2026-11-20'},
    {'id': 6,  'nome': 'Orbital Banana F1','tipo': 'femminizzata', 'germoglio': '2026-04-30', 'flor_start': '2026-10-01', 'taglio': '2026-11-25'},
    {'id': 10, 'nome': 'Royal Gorilla',    'tipo': 'femminizzata', 'germoglio': '2026-04-22', 'flor_start': '2026-10-15', 'taglio': '2026-12-09'},
    {'id': 9,  'nome': 'Mexican Rush',     'tipo': 'femminizzata', 'germoglio': '2026-04-21', 'flor_start': '2026-10-15', 'taglio': '2026-12-14'},
]

ESSICCAZIONE_GG = 15
CONCIA_GG = 20

def gh_get(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        data = json.load(r)
    return base64.b64decode(data['content'].replace('\n', '')).decode('utf-8'), data['sha']

def gh_put(path, content_b64, sha, message):
    body = json.dumps({'message': message, 'content': content_b64, 'sha': sha}).encode()
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=body, headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT'
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def fetch_ore_luce():
    try:
        url = (
            f'https://api.open-meteo.com/v1/forecast'
            f'?latitude={LAT}&longitude={LON}'
            f'&daily=sunrise,sunset'
            f'&timezone=Europe/Rome&forecast_days=1'
        )
        with urllib.request.urlopen(urllib.request.Request(url), timeout=15) as r:
            d = json.load(r)
        daily = d.get('daily', {})
        sr = daily.get('sunrise', [''])[0]
        ss = daily.get('sunset',  [''])[0]
        if sr and ss:
            diff = datetime.datetime.fromisoformat(ss) - datetime.datetime.fromisoformat(sr)
            ore = round(diff.total_seconds() / 3600, 2)
            print(f'  Ore luce: {ore}h')
            return ore
    except Exception as ex:
        print(f'  Meteo error: {ex}')
    return 14.5

def main():
    oggi = datetime.date.today()
    oggi_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    print(f'=== BioSerra Piante Stato Update ({oggi.isoformat()}) ===')

    ore_luce = fetch_ore_luce()

    # Leggi stato attuale — la fase viene PRESERVATA da qui
    print('Leggo piante_stato.json attuale...')
    raw, sha = gh_get('data/piante_stato.json')
    stato_attuale = json.loads(raw)
    # Mappa id -> entry attuale per recuperare la fase reale
    fase_map = {}
    for p in stato_attuale.get('data', {}).get('stato_piante', []):
        fase_map[p['id']] = p.get('fase', 'Vegetazione')
    print(f'  Fasi esistenti: {fase_map}')

    stato_piante = []
    alerts_oggi  = []

    for p in PIANTE:
        germ = datetime.date.fromisoformat(p['germoglio'])
        giorni_vita = (oggi - germ).days

        # Fase: SEMPRE dalla piante_stato.json esistente (fonte di verita = app)
        # Se la pianta non esiste ancora nel file, default Vegetazione
        fase = fase_map.get(p['id'], 'Vegetazione')

        if p['tipo'] == 'autofiorente':
            # Date di riferimento basate su harvest_min fisso (no moltiplicatore)
            data_taglio = germ + datetime.timedelta(days=p['harvest_min'])
            data_essic  = data_taglio + datetime.timedelta(days=ESSICCAZIONE_GG)
            data_concia = data_essic  + datetime.timedelta(days=CONCIA_GG)

            giorni_a_raccolta     = (data_taglio - oggi).days
            giorni_a_essiccazione = (data_essic  - oggi).days
            giorni_a_concia       = (data_concia - oggi).days

            entry = {
                'id': p['id'],
                'nome': p['nome'],
                'tipo': 'autofiorente',
                'germoglio': p['germoglio'],
                'giorni_vita': giorni_vita,
                'ore_luce_oggi': ore_luce,
                'fase': fase,
                'giorni_a_raccolta': giorni_a_raccolta,
                'giorni_a_essiccazione': giorni_a_essiccazione,
                'giorni_a_concia': giorni_a_concia,
                'data_raccolta': data_taglio.isoformat(),
                'data_essiccazione': data_essic.isoformat(),
                'data_concia': data_concia.isoformat()
            }

            # Alert solo se fase attiva e raccolta imminente
            if fase == 'Fioritura' and 0 < giorni_a_raccolta <= 7:
                alerts_oggi.append({
                    'tipo': 'raccolta_imminente',
                    'pianta_id': p['id'],
                    'msg': f"{p['nome']}: raccolta prevista tra {giorni_a_raccolta} giorni ({data_taglio.isoformat()})"
                })
            elif fase == 'Taglio':
                alerts_oggi.append({
                    'tipo': 'taglio_in_corso',
                    'pianta_id': p['id'],
                    'msg': f"{p['nome']}: in fase Taglio, essiccazione il {data_essic.isoformat()}"
                })
            elif fase == 'Essiccazione':
                alerts_oggi.append({
                    'tipo': 'essiccazione',
                    'pianta_id': p['id'],
                    'msg': f"{p['nome']}: essiccazione in corso, concia il {data_concia.isoformat()}"
                })

        else:  # femminizzata
            flor_d   = datetime.date.fromisoformat(p['flor_start'])
            taglio_d = datetime.date.fromisoformat(p['taglio'])
            essic_d  = taglio_d + datetime.timedelta(days=ESSICCAZIONE_GG)
            concia_d = essic_d  + datetime.timedelta(days=CONCIA_GG)

            giorni_a_fioritura    = (flor_d   - oggi).days
            giorni_a_raccolta     = (taglio_d - oggi).days
            giorni_a_essiccazione = (essic_d  - oggi).days
            giorni_a_concia       = (concia_d - oggi).days

            entry = {
                'id': p['id'],
                'nome': p['nome'],
                'tipo': 'femminizzata',
                'germoglio': p['germoglio'],
                'giorni_vita': giorni_vita,
                'fase': fase,
                'giorni_a_fioritura': giorni_a_fioritura,
                'giorni_a_raccolta': giorni_a_raccolta,
                'giorni_a_essiccazione': giorni_a_essiccazione,
                'giorni_a_concia': giorni_a_concia,
                'data_fioritura': p['flor_start'],
                'data_raccolta': p['taglio'],
                'data_essiccazione': essic_d.isoformat(),
                'data_concia': concia_d.isoformat()
            }

            if fase == 'Vegetazione' and 0 < giorni_a_fioritura <= 14:
                alerts_oggi.append({
                    'tipo': 'fioritura_imminente',
                    'pianta_id': p['id'],
                    'msg': f"{p['nome']}: fioritura tra {giorni_a_fioritura} giorni ({p['flor_start']})"
                })

        stato_piante.append(entry)
        print(f"  [{p['id']:2}] {p['nome']:<20} giorno {giorni_vita:3}d | fase={fase} (preservata)")

    output = {
        'lastUpdate': oggi_iso,
        'ore_luce_oggi': ore_luce,
        'data': {
            'stato_piante': stato_piante,
            'alerts_oggi': alerts_oggi
        }
    }

    print(f'\nAlerts generati: {len(alerts_oggi)}')
    for a in alerts_oggi:
        print(f'  [{a["tipo"]}] {a["msg"]}')

    # SHA fresco prima del PUT
    _, sha_fresco = gh_get('data/piante_stato.json')
    content_b64 = base64.b64encode(
        json.dumps(output, indent=2, ensure_ascii=False).encode()
    ).decode()
    result = gh_put('data/piante_stato.json', content_b64, sha_fresco,
                    f'BioSerra piante stato {oggi.isoformat()} [auto]')

    print(f'\n=== COMPLETATO ===')
    print(f'Commit: {result["commit"]["sha"][:8]}')
    print(f'Piante: {len(stato_piante)} | Ore luce: {ore_luce}h')

if __name__ == '__main__':
    main()
