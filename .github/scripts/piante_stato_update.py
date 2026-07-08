import os, json, base64, urllib.request, datetime, time

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
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
    {'id': 4,  'nome': 'Astro Lemonade F1','tipo': 'femminizzata', 'germoglio': '2026-04-21', 'flor_start': '2026-10-01', 'harvest_min': 50},
    {'id': 11, 'nome': 'Cosmic Cheddar F1','tipo': 'femminizzata', 'germoglio': '2026-05-02', 'flor_start': '2026-10-01', 'harvest_min': 50},
    {'id': 6,  'nome': 'Orbital Banana F1','tipo': 'femminizzata', 'germoglio': '2026-04-30', 'flor_start': '2026-10-01', 'harvest_min': 55},
    {'id': 10, 'nome': 'Royal Gorilla',    'tipo': 'femminizzata', 'germoglio': '2026-04-22', 'flor_start': '2026-10-15', 'harvest_min': 55},
    {'id': 9,  'nome': 'Mexican Rush',     'tipo': 'femminizzata', 'germoglio': '2026-04-21', 'flor_start': '2026-10-15', 'harvest_min': 60},
]

# FIX Rev.22: moltiplicatori ore-sole — stessa logica dei helper client in piante.js
# (autoSunMult cap 1.8x da Rev.21, femmSunMult cap 1.4x invariato). Prima le date
# server erano baseline pure (nessun moltiplicatore): generavano date_raccolta e
# alert errati (es. Epsilon "in essiccazione" a inizio luglio, mentre la stima
# reale di campo Rev.21 era taglio ~07/08). idealH=14 come nel client.
IDEAL_H  = 14
CAP_AUTO = 1.8   # ricalibrato Rev.21 su ancora reale (Epsilon F1)
CAP_FEMM = 1.4   # invariato — ricalibrazione rimandata a inizio ottobre 2026

ESSICCAZIONE_GG = 15
CONCIA_GG = 20

def gh_get(path):
    """Resiliente: 3 tentativi, timeout, rilancia l'ultima eccezione se falliscono tutti."""
    last_ex = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            return base64.b64decode(data['content'].replace('\n', '')).decode('utf-8'), data['sha']
        except Exception as ex:
            last_ex = ex
            print(f'  gh_get tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    raise last_ex

def gh_put(path, content_b64, sha, message):
    """Resiliente: 3 tentativi, SHA sempre fresco, mai solleva eccezioni (None se fallisce)."""
    for attempt in range(3):
        try:
            sha_fresco = None
            try:
                _, sha_fresco = gh_get(path)
            except Exception:
                pass
            body = {'message': message, 'content': content_b64}
            if sha_fresco:
                body['sha'] = sha_fresco
            elif sha:
                body['sha'] = sha
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}',
                data=json.dumps(body).encode(),
                headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT'
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as ex:
            print(f'  gh_put tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    return None

def fetch_ore_luce_astronomiche():
    """Open-Meteo: ore luce astronomiche (per info, non usate nei calcoli)"""
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
            return round(diff.total_seconds() / 3600, 2)
    except Exception as ex:
        print(f'  Meteo error: {ex}')
    return None

def main():
    oggi = datetime.date.today()
    oggi_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    print(f'=== BioSerra Piante Stato Update ({oggi.isoformat()}) ===')

    # Leggi stato attuale — la fase E le ore luce effettive vengono PRESERVATE da qui
    print('Leggo piante_stato.json attuale...')
    try:
        raw, sha = gh_get('data/piante_stato.json')
    except Exception as ex:
        print(f'ERRORE CRITICO: lettura piante_stato.json fallita dopo 3 tentativi: {ex}')
        import sys; sys.exit(1)
    stato_attuale = json.loads(raw)

    # Ore luce effettive: impostate dall'utente via slider nell'app
    # Fallback: ore astronomiche da Open-Meteo se non ancora impostato
    ore_luce_effettive = stato_attuale.get('ore_luce_effettive', None)
    if ore_luce_effettive:
        print(f'  Ore luce effettive (da app): {ore_luce_effettive}h')
        ore_luce = float(ore_luce_effettive)
    else:
        ore_luce_astro = fetch_ore_luce_astronomiche()
        ore_luce = ore_luce_astro if ore_luce_astro else 14.5
        print(f'  Ore luce effettive non impostate — uso astronomiche: {ore_luce}h')

    # Mappa id -> fase attuale per recuperarla (fonte di verita = app)
    fase_map = {}
    override_map = {}
    for p in stato_attuale.get('data', {}).get('stato_piante', []):
        fase_map[p['id']] = p.get('fase', 'Vegetazione')
        if p.get('override'):
            override_map[p['id']] = p['override']
    print(f'  Fasi esistenti: {fase_map}')
    if override_map:
        print(f'  Override presenti (Rev.23, da app): {list(override_map.keys())}')

    # FIX Rev.22: moltiplicatori ore-sole (stessa formula dei helper client).
    # Con fallback astronomico (~15h estate) il rapporto scende sotto 1 e il
    # minimo 1x riporta alle date baseline — comportamento neutro e sicuro.
    _rapp = (IDEAL_H / ore_luce) if ore_luce and ore_luce > 0 else 1.0
    mult_auto = min(CAP_AUTO, max(1.0, _rapp))
    mult_femm = min(CAP_FEMM, max(1.0, _rapp))
    print(f'  Moltiplicatori ore-sole: auto x{mult_auto:.2f} (cap {CAP_AUTO}) | femm x{mult_femm:.2f} (cap {CAP_FEMM})')

    stato_piante = []
    alerts_oggi  = []

    for p in PIANTE:
        germ = datetime.date.fromisoformat(p['germoglio'])
        giorni_vita = (oggi - germ).days

        # Fase: SEMPRE dalla piante_stato.json esistente (fonte di verita = app)
        # Se la pianta non esiste ancora nel file, default Vegetazione
        fase = fase_map.get(p['id'], 'Vegetazione')
        override = override_map.get(p['id'])

        if p['tipo'] == 'autofiorente':
            # FIX Rev.22: date corrette col moltiplicatore ore-sole (come
            # autoSunDays() client) — prima erano baseline pure, senza
            # moltiplicatore, e generavano alert/Telegram errati.
            # FIX Rev.23: se l'app ha scritto un override.harvestDate (modal
            # "Modifica fase"), quella data vince sul calcolo automatico —
            # stessa priorità del client (getEffectiveFlorStart/harvestDate).
            if override and override.get('harvestDate'):
                data_taglio = datetime.date.fromisoformat(override['harvestDate'])
            else:
                giorni_taglio = round(p['harvest_min'] * mult_auto)
                data_taglio = germ + datetime.timedelta(days=giorni_taglio)
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
            if override:
                entry['override'] = override
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
            # FIX Rev.22: taglio calcolato = flor_start + durata fioritura
            # x moltiplicatore (come femmFlorDays() client, cap 1.4x) —
            # prima era una data hardcoded baseline.
            # FIX Rev.23: override.florStart (fioritura confermata manualmente
            # nel modal) vince sulla data produttore; override.harvestDate
            # (taglio manuale) vince sul calcolo automatico — stessa priorità
            # del client (getEffectiveFlorStart / ovr.harvestDate).
            flor_d = (datetime.date.fromisoformat(override['florStart'])
                      if override and override.get('florStart')
                      else datetime.date.fromisoformat(p['flor_start']))
            if override and override.get('harvestDate'):
                taglio_d = datetime.date.fromisoformat(override['harvestDate'])
            else:
                giorni_fior = round(p['harvest_min'] * mult_femm)
                taglio_d = flor_d + datetime.timedelta(days=giorni_fior)
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
                'data_fioritura': flor_d.isoformat(),
                'data_raccolta': taglio_d.isoformat(),
                'data_essiccazione': essic_d.isoformat(),
                'data_concia': concia_d.isoformat()
            }
            if override:
                entry['override'] = override

            if fase == 'Vegetazione' and 0 < giorni_a_fioritura <= 14:
                alerts_oggi.append({
                    'tipo': 'fioritura_imminente',
                    'pianta_id': p['id'],
                    'msg': f"{p['nome']}: fioritura tra {giorni_a_fioritura} giorni ({p['flor_start']})"
                })

        stato_piante.append(entry)
        override_tag = ' [OVERRIDE app]' if override else ''
        print(f"  [{p['id']:2}] {p['nome']:<20} giorno {giorni_vita:3}d | fase={fase} (preservata){override_tag}")

    output = {
        'lastUpdate': oggi_iso,
        'ore_luce_oggi': ore_luce,
        'data': {
            'stato_piante': stato_piante,
            'alerts_oggi': alerts_oggi
        }
    }
    # FIX Rev.22: preserva le chiavi scritte dall'app (slider ore sole).
    # Prima venivano PERSE ad ogni run notturno: il run successivo non trovava
    # ore_luce_effettive e ricadeva sulle ore astronomiche (~15h estate) invece
    # delle effettive (4-6.5h), azzerando di fatto il moltiplicatore.
    if ore_luce_effettive:
        output['ore_luce_effettive'] = float(ore_luce_effettive)
    if stato_attuale.get('ore_luce_update'):
        output['ore_luce_update'] = stato_attuale['ore_luce_update']

    print(f'\nAlerts generati: {len(alerts_oggi)}')
    for a in alerts_oggi:
        print(f'  [{a["tipo"]}] {a["msg"]}')

    # SHA fresco: gh_put() la rifetcha internamente ad ogni tentativo,
    # ma passiamo comunque quella nota come fallback se il refetch interno fallisse
    content_b64 = base64.b64encode(
        json.dumps(output, indent=2, ensure_ascii=False).encode()
    ).decode()
    result = gh_put('data/piante_stato.json', content_b64, sha,
                    f'BioSerra piante stato {oggi.isoformat()} [auto]')
    if result is None:
        print('  ERRORE CRITICO: salvataggio piante_stato.json fallito dopo 3 tentativi')
        import sys; sys.exit(1)

    print(f'\n=== COMPLETATO ===')
    print(f'Commit: {result["commit"]["sha"][:8]}')
    print(f'Piante: {len(stato_piante)} | Ore luce: {ore_luce}h')

    # Step Summary (Rev.23): riepilogo leggibile nella pagina del run, utile
    # per un controllo veloce da telefono senza dover aprire i log completi.
    summary_path = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary_path:
        try:
            with open(summary_path, 'a', encoding='utf-8') as f:
                f.write(f'## 🌿 Piante Stato Update - {oggi.isoformat()}\n\n')
                f.write(f'Ore luce effettive: **{ore_luce}h**\n\n')
                f.write('| Pianta | Fase | Data raccolta | Override |\n')
                f.write('|---|---|---|---|\n')
                for p in stato_piante:
                    ovr = '✓' if p.get('override') else ''
                    f.write(f"| {p['nome']} | {p['fase']} | {p.get('data_raccolta','-')} | {ovr} |\n")
                if alerts_oggi:
                    f.write(f'\n**Alert generati:** {len(alerts_oggi)}\n')
                    for a in alerts_oggi:
                        f.write(f"- [{a['tipo']}] {a['msg']}\n")
                else:
                    f.write('\nNessun alert generato.\n')
        except Exception as ex:
            print(f'  (step summary non scritto: {ex})')

if __name__ == '__main__':
    main()
