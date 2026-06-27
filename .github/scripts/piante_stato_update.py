import os, json, base64, urllib.request, datetime, sys

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
REPO = 'francescocaruso487-tech/bioserra'
LAT  = 41.09696262016739
LON  = 14.388065360906802

HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

# ==============================================================
# PIANTE HARDCODATE (fonte: calendario PDF + istruzioni progetto)
# ==============================================================
PIANTE = [
    # AUTOFIORENTI — logica: giorni_reali = harvestMin * (14 / ore_luce_correnti)
    {'id': 7,  'nome': 'Epsilon F1',      'tipo': 'autofiorente', 'germoglio': '2026-04-21', 'harvest_min': 60, 'harvest_max': 60},
    {'id': 1,  'nome': 'Milky Way F1',    'tipo': 'autofiorente', 'germoglio': '2026-04-23', 'harvest_min': 70, 'harvest_max': 75},
    {'id': 2,  'nome': 'Titan F1',        'tipo': 'autofiorente', 'germoglio': '2026-04-22', 'harvest_min': 70, 'harvest_max': 75},
    {'id': 3,  'nome': 'Medusa F1',       'tipo': 'autofiorente', 'germoglio': '2026-04-21', 'harvest_min': 70, 'harvest_max': 75},
    {'id': 8,  'nome': 'Gaia F1',         'tipo': 'autofiorente', 'germoglio': '2026-04-21', 'harvest_min': 65, 'harvest_max': 70},
    # FEMMINIZZATE — florStart data fissa, NO moltiplicatore
    {'id': 4,  'nome': 'Astro Lemonade F1', 'tipo': 'femminizzata', 'germoglio': '2026-04-21', 'flor_start': '2026-10-01', 'taglio': '2026-11-20'},
    {'id': 11, 'nome': 'Cosmic Cheddar F1', 'tipo': 'femminizzata', 'germoglio': '2026-05-02', 'flor_start': '2026-10-01', 'taglio': '2026-11-20'},
    {'id': 6,  'nome': 'Orbital Banana F1', 'tipo': 'femminizzata', 'germoglio': '2026-04-30', 'flor_start': '2026-10-01', 'taglio': '2026-11-25'},
    {'id': 10, 'nome': 'Royal Gorilla',     'tipo': 'femminizzata', 'germoglio': '2026-04-22', 'flor_start': '2026-10-15', 'taglio': '2026-12-09'},
    {'id': 9,  'nome': 'Mexican Rush',      'tipo': 'femminizzata', 'germoglio': '2026-04-21', 'flor_start': '2026-10-15', 'taglio': '2026-12-14'},
]

# Durate fisse fasi post-taglio (istruzioni progetto)
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
    """Open-Meteo: calcola ore di luce reali da sunrise/sunset"""
    try:
        url = (
            f'https://api.open-meteo.com/v1/forecast'
            f'?latitude={LAT}&longitude={LON}'
            f'&daily=sunrise,sunset'
            f'&timezone=Europe/Rome&forecast_days=1'
        )
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.load(r)
        daily = d.get('daily', {})
        sr = daily.get('sunrise', [''])[0]
        ss = daily.get('sunset', [''])[0]
        if sr and ss:
            diff = datetime.datetime.fromisoformat(ss) - datetime.datetime.fromisoformat(sr)
            ore = round(diff.total_seconds() / 3600, 2)
            print(f'  Ore luce: {ore}h (sunrise={sr}, sunset={ss})')
            return ore
    except Exception as ex:
        print(f'  Meteo error: {ex}')
    # Fallback stagionale: fine giugno Caserta ~14.5h
    return 14.5

def calcola_data(base_str, giorni):
    """Aggiunge giorni_reali a una data base (stringa ISO)"""
    base = datetime.date.fromisoformat(base_str)
    return (base + datetime.timedelta(days=int(giorni))).isoformat()

def determina_fase_auto(germ_str, oggi, data_taglio, data_essiccazione, data_concia):
    """Determina la fase corrente di una pianta autofiorente"""
    germ = datetime.date.fromisoformat(germ_str)
    taglio = datetime.date.fromisoformat(data_taglio)
    essic = datetime.date.fromisoformat(data_essiccazione)
    concia = datetime.date.fromisoformat(data_concia)
    fine = concia + datetime.timedelta(days=1)

    giorni_vita = (oggi - germ).days

    if oggi >= fine:
        return 'Fine'
    elif oggi >= concia:
        return 'Concia'
    elif oggi >= essic:
        return 'Essiccazione'
    elif oggi >= taglio:
        return 'Taglio'
    elif giorni_vita >= 30:
        # Approssimazione: fioritura inizia ~30gg per auto
        return 'Fioritura'
    else:
        return 'Vegetazione'

def determina_fase_fem(germ_str, oggi, flor_start_str, taglio_str):
    """Determina la fase corrente di una pianta femminizzata"""
    germ = datetime.date.fromisoformat(germ_str)
    flor_start = datetime.date.fromisoformat(flor_start_str)
    taglio = datetime.date.fromisoformat(taglio_str)
    essic = taglio + datetime.timedelta(days=ESSICCAZIONE_GG)
    concia = essic + datetime.timedelta(days=CONCIA_GG)
    fine = concia + datetime.timedelta(days=1)

    if oggi >= fine:
        return 'Fine', taglio.isoformat(), essic.isoformat(), concia.isoformat()
    elif oggi >= concia:
        return 'Concia', taglio.isoformat(), essic.isoformat(), concia.isoformat()
    elif oggi >= essic:
        return 'Essiccazione', taglio.isoformat(), essic.isoformat(), concia.isoformat()
    elif oggi >= taglio:
        return 'Taglio', taglio.isoformat(), essic.isoformat(), concia.isoformat()
    elif oggi >= flor_start:
        return 'Fioritura', taglio.isoformat(), essic.isoformat(), concia.isoformat()
    else:
        return 'Vegetazione', taglio.isoformat(), essic.isoformat(), concia.isoformat()

def main():
    oggi = datetime.date.today()
    oggi_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    print(f'=== BioSerra Piante Stato Update ({oggi.isoformat()}) ===')

    # Fetch ore luce reali
    ore_luce = fetch_ore_luce()
    IDEAL_H = 14.0

    stato_piante = []
    alerts_oggi = []

    for p in PIANTE:
        germ_str = p['germoglio']
        germ = datetime.date.fromisoformat(germ_str)
        giorni_vita = (oggi - germ).days

        if p['tipo'] == 'autofiorente':
            # Calcolo giorni_reali con moltiplicatore ore luce
            giorni_reali = round(p['harvest_min'] * (IDEAL_H / ore_luce))
            data_taglio = calcola_data(germ_str, giorni_reali)
            data_essic  = calcola_data(data_taglio, ESSICCAZIONE_GG)
            data_concia = calcola_data(data_essic, CONCIA_GG)

            fase = determina_fase_auto(germ_str, oggi, data_taglio, data_essic, data_concia)

            taglio_d = datetime.date.fromisoformat(data_taglio)
            essic_d  = datetime.date.fromisoformat(data_essic)
            concia_d = datetime.date.fromisoformat(data_concia)

            giorni_a_raccolta   = (taglio_d - oggi).days
            giorni_a_essiccazione = (essic_d - oggi).days
            giorni_a_concia     = (concia_d - oggi).days

            entry = {
                'id': p['id'],
                'nome': p['nome'],
                'tipo': 'autofiorente',
                'germoglio': germ_str,
                'giorni_vita': giorni_vita,
                'ore_luce_oggi': ore_luce,
                'giorni_reali_calcolati': giorni_reali,
                'fase': fase,
                'giorni_a_raccolta': giorni_a_raccolta,
                'giorni_a_essiccazione': giorni_a_essiccazione,
                'giorni_a_concia': giorni_a_concia,
                'data_raccolta': data_taglio,
                'data_essiccazione': data_essic,
                'data_concia': data_concia
            }

            # Alert raccolta imminente (<=5 giorni)
            if 0 < giorni_a_raccolta <= 5:
                alerts_oggi.append({
                    'tipo': 'raccolta_imminente',
                    'pianta_id': p['id'],
                    'msg': f"{p['nome']}: raccolta tra {giorni_a_raccolta} giorni ({data_taglio})"
                })
            elif fase == 'Taglio':
                alerts_oggi.append({
                    'tipo': 'taglio_in_corso',
                    'pianta_id': p['id'],
                    'msg': f"{p['nome']}: in fase Taglio"
                })
            elif fase == 'Essiccazione':
                alerts_oggi.append({
                    'tipo': 'essiccazione',
                    'pianta_id': p['id'],
                    'msg': f"{p['nome']}: essiccazione, fine il {data_concia}"
                })

        else:  # femminizzata
            flor_start_str = p['flor_start']
            taglio_str     = p['taglio']
            fase, data_taglio, data_essic, data_concia = determina_fase_fem(
                germ_str, oggi, flor_start_str, taglio_str
            )

            taglio_d = datetime.date.fromisoformat(data_taglio)
            essic_d  = datetime.date.fromisoformat(data_essic)
            concia_d = datetime.date.fromisoformat(data_concia)
            flor_d   = datetime.date.fromisoformat(flor_start_str)

            giorni_a_fioritura    = (flor_d - oggi).days if oggi < flor_d else 0
            giorni_a_raccolta     = (taglio_d - oggi).days
            giorni_a_essiccazione = (essic_d - oggi).days
            giorni_a_concia       = (concia_d - oggi).days

            entry = {
                'id': p['id'],
                'nome': p['nome'],
                'tipo': 'femminizzata',
                'germoglio': germ_str,
                'giorni_vita': giorni_vita,
                'fase': fase,
                'giorni_a_fioritura': giorni_a_fioritura,
                'giorni_a_raccolta': giorni_a_raccolta,
                'giorni_a_essiccazione': giorni_a_essiccazione,
                'giorni_a_concia': giorni_a_concia,
                'data_fioritura': flor_start_str,
                'data_raccolta': data_taglio,
                'data_essiccazione': data_essic,
                'data_concia': data_concia
            }

            # Alert fioritura imminente (<=14 giorni)
            if 0 < giorni_a_fioritura <= 14:
                alerts_oggi.append({
                    'tipo': 'fioritura_imminente',
                    'pianta_id': p['id'],
                    'msg': f"{p['nome']}: fioritura tra {giorni_a_fioritura} giorni ({flor_start_str})"
                })

        stato_piante.append(entry)
        print(f"  {p['nome']}: {fase}, giorno {giorni_vita}d")

    # Costruisci output
    output = {
        'lastUpdate': oggi_iso,
        'ore_luce_oggi': ore_luce,
        'data': {
            'stato_piante': stato_piante,
            'alerts_oggi': alerts_oggi
        }
    }

    print(f'\nAlerts: {len(alerts_oggi)}')
    for a in alerts_oggi:
        print(f'  [{a["tipo"]}] {a["msg"]}')

    # Salva su GitHub
    content_b64 = base64.b64encode(
        json.dumps(output, indent=2, ensure_ascii=False).encode()
    ).decode()

    _, sha = gh_get('data/piante_stato.json')
    result = gh_put('data/piante_stato.json', content_b64, sha,
                    f'BioSerra piante stato {oggi.isoformat()} [auto]')
    print(f'\n=== COMPLETATO ===')
    print(f'Commit: {result["commit"]["sha"][:8]}')
    print(f'Piante: {len(stato_piante)}, Ore luce: {ore_luce}h')

if __name__ == '__main__':
    main()
