import os, json, base64, urllib.request, urllib.error, datetime, sys

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
LAT  = 41.09696262016739
LON  = 14.388065360906802

HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

def gh_get(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        data = json.load(r)
    return base64.b64decode(data['content'].replace('\n','')).decode('utf-8'), data['sha']

def gh_put(path, content_b64, sha, message):
    body = json.dumps({'message': message, 'content': content_b64, 'sha': sha}).encode()
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=body, headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT'
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def fetch_meteo():
    """Open-Meteo: temperatura, umidita, vento, pioggia oggi"""
    try:
        url = (
            f'https://api.open-meteo.com/v1/forecast'
            f'?latitude={LAT}&longitude={LON}'
            f'&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code'
            f'&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset'
            f'&timezone=Europe/Rome&forecast_days=1'
        )
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.load(r)
        cur = d.get('current', {})
        daily = d.get('daily', {})
        ore_luce = 'N/A'
        try:
            sr = daily.get('sunrise', [''])[0]
            ss = daily.get('sunset', [''])[0]
            if sr and ss:
                from datetime import datetime as dt
                diff = dt.fromisoformat(ss) - dt.fromisoformat(sr)
                ore_luce = round(diff.total_seconds() / 3600, 1)
        except: pass
        return {
            'temp_now': cur.get('temperature_2m'),
            'umidita': cur.get('relative_humidity_2m'),
            'pioggia': cur.get('precipitation', 0),
            'vento': cur.get('wind_speed_10m'),
            'tmax': daily.get('temperature_2m_max', [None])[0],
            'tmin': daily.get('temperature_2m_min', [None])[0],
            'pioggia_giorno': daily.get('precipitation_sum', [0])[0],
            'ore_luce': ore_luce
        }
    except Exception as ex:
        print(f'  Meteo error: {ex}')
        return {}

def mistral_chat(prompt, max_tokens=2000):
    if not MISTRAL_KEY:
        raise Exception('MISTRAL_KEY mancante')
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': max_tokens,
        'temperature': 0.3,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    req = urllib.request.Request(
        'https://api.mistral.ai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.load(r)
    content = resp['choices'][0]['message']['content']
    tokens = resp.get('usage', {}).get('total_tokens', 0)
    print(f'  Mistral OK: {len(content)} chars, {tokens} tokens')
    return content

def parse_json_risposta(testo):
    s = testo.find('{')
    e = testo.rfind('}')
    if s >= 0 and e > s:
        try:
            return json.loads(testo[s:e+1])
        except: pass
    return None

def brain_fallback(piante, luna, meteo, oggi):
    """Genera brain.json senza LLM se Mistral non disponibile"""
    alerts = piante.get('alerts_oggi', [])
    fase_luna = luna.get('fase', 'N/A')
    avvisi = [a['msg'] for a in alerts[:3]] if alerts else ['Nessun avviso critico oggi']
    return {
        'consigli_giorno': [
            f'Fase luna: {fase_luna}. Monitora le piante nelle fasi attive.',
            'Controlla irrigazione e umidita substrato.',
            'Verifica tecniche elettrocultura attive.'
        ],
        'consigli_piante': {
            'autofiorenti': 'Monitora stato crescita e avvisi raccolta.',
            'femminizzate': 'Verifica vegetazione e prepara per fioritura autunnale.'
        },
        'tecniche_nuove': [],
        'scoperte': [],
        'avvisi': avvisi
    }

def main():
    oggi_iso = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    oggi_data = datetime.date.today().isoformat()
    print(f'=== BioSerra Brain Update ({oggi_data}) ===')

    # 1. Leggi piante_stato.json
    print('Leggo piante_stato.json...')
    raw_p, _ = gh_get('data/piante_stato.json')
    piante_raw = json.loads(raw_p)
    piante = piante_raw.get('data', {})
    stato_piante = piante.get('stato_piante', [])
    alerts = piante.get('alerts_oggi', [])
    print(f'  Piante: {len(stato_piante)}, Alerts: {len(alerts)}')

    # 2. Leggi luna_consigli.json
    print('Leggo luna_consigli.json...')
    raw_l, _ = gh_get('data/luna_consigli.json')
    luna_raw = json.loads(raw_l)
    luna = luna_raw.get('data', {})
    print(f'  Luna: {luna.get("fase","?")} {luna.get("emoji","")}')

    # 3. Meteo Open-Meteo
    print('Fetch meteo...')
    meteo = fetch_meteo()
    print(f'  Temp: {meteo.get("temp_now")}C, Umid: {meteo.get("umidita")}%, Pioggia: {meteo.get("pioggia_giorno")}mm')

    # 4. Prepara contesto piante (compatto)
    piante_critiche = [p for p in stato_piante if p.get('giorni_a_raccolta', 999) <= 14 and p.get('giorni_a_raccolta', 999) > 0]
    piante_in_fioritura = [p for p in stato_piante if p.get('fase') == 'Fioritura']
    piante_in_essiccazione = [p for p in stato_piante if p.get('fase') == 'Essiccazione']

    ctx_piante = []
    for p in stato_piante:
        ctx_piante.append(
            f'{p["nome"]} ({p["tipo"][0].upper()}): fase={p.get("fase","?")}, '
            f'giorno {p.get("giorni_vita","?")}d, raccolta tra {p.get("giorni_a_raccolta","?")}gg'
        )

    ctx_alerts = [a['msg'] for a in alerts[:5]] if alerts else ['Nessun alert critico']

    # 5. Prompt Mistral
    prompt = (
        f'Sei il cervello AI di BioSerra, una serra Living Soil outdoor a Caserta, Italia. '
        f'Oggi {oggi_data}. Genera i consigli giornalieri in italiano.\n\n'
        f'=== STATO PIANTE ===\n' +
        '\n'.join(ctx_piante) + '\n\n'
        f'=== ALERTS OGGI ===\n' +
        '\n'.join(ctx_alerts) + '\n\n'
        f'=== METEO CASERTA ===\n'
        f'Temperatura: {meteo.get("temp_now")}C (min {meteo.get("tmin")}C / max {meteo.get("tmax")}C)\n'
        f'Umidita: {meteo.get("umidita")}%, Pioggia giorno: {meteo.get("pioggia_giorno")}mm\n'
        f'Vento: {meteo.get("vento")} km/h, Ore luce: {meteo.get("ore_luce")}h\n\n'
        f'=== LUNA ===\n'
        f'Fase: {luna.get("fase","?")} {luna.get("emoji","")}, Illuminazione: {luna.get("illuminazione","?")}%\n'
        f'Giorni a piena: {luna.get("giorni_a_piena","?")}, Tipo giorno biodinamico: contestuale\n\n'
        f'=== RICHIESTA ===\n'
        f'Genera un JSON con questi campi:\n'
        f'- consigli_giorno: array di 3 consigli pratici specifici per oggi (massimo 1 frase ciascuno)\n'
        f'- consigli_piante.autofiorenti: 1 frase sulle auto (Epsilon, Milky Way, Titan, Medusa, Gaia)\n'
        f'- consigli_piante.femminizzate: 1 frase sulle foto (Astro Lemonade, Cosmic Cheddar, Orbital Banana, Royal Gorilla, Mexican Rush)\n'
        f'- tecniche_nuove: array di 1 tecnica elettrocultura/Living Soil da provare (nome, descrizione breve, materiali[], difficolta)\n'
        f'- scoperte: array di 1 osservazione scientifica interessante dal contesto di oggi\n'
        f'- avvisi: array con gli alert urgenti (raccolta imminente, meteo avverso, ecc.)\n'
        f'- agenti.piante.stato_generale: stringa breve (es: "ottimale", "monitoraggio", "attenzione")\n'
        f'- agenti.piante.irrigazione: consiglio irrigazione per oggi\n'
        f'- agenti.piante.nutrizione: consiglio nutrizione per oggi\n'
        f'- agenti.ambiente.luna.fase: "{luna.get("fase","?")}"\n'
        f'- agenti.ambiente.luna.emoji: "{luna.get("emoji","?")}"\n'
        f'- agenti.ambiente.luna.illuminazione_pct: {luna.get("illuminazione", luna.get("illuminazione_pct", 50))}\n'
        f'- agenti.ambiente.luna.consiglio: 1 frase sul momento lunare\n'
        f'- agenti.ambiente.ore_luce: {meteo.get("ore_luce", 14)}\n'
        f'- agenti.elettro.verifica_oggi: array di 1-2 verifiche tecniche da fare\n'
        f'- agenti.elettro.ottimizzazione: suggerimento ottimizzazione\n\n'
        f'Rispondi SOLO con JSON valido. Nessun testo prima o dopo.'
    )

    print(f'Prompt: {len(prompt)} chars')

    # 6. Chiama Mistral
    cervello_data = None
    if MISTRAL_KEY:
        try:
            risposta = mistral_chat(prompt, max_tokens=2000)
            print(f'Risposta (200 chars): {risposta[:200]}')
            cervello_data = parse_json_risposta(risposta)
            if cervello_data:
                print('JSON parsato OK')
            else:
                print('JSON non trovato, uso fallback')
        except Exception as ex:
            print(f'Mistral errore: {ex}')

    if not cervello_data:
        print('Uso fallback...')
        cervello_data = brain_fallback(piante, luna, meteo, oggi_data)

    # 7. Costruisci brain.json finale
    # Assicura struttura minima
    if 'agenti' not in cervello_data:
        cervello_data['agenti'] = {}
    if 'piante' not in cervello_data['agenti']:
        cervello_data['agenti']['piante'] = {'stato_generale': 'monitoraggio', 'piante_critiche': []}
    if 'ambiente' not in cervello_data['agenti']:
        cervello_data['agenti']['ambiente'] = {
            'luna': {'fase': luna.get('fase','?'), 'emoji': luna.get('emoji',''), 'illuminazione_pct': 50, 'consiglio': ''},
            'ore_luce': meteo.get('ore_luce', 14)
        }
    if 'elettro' not in cervello_data['agenti']:
        cervello_data['agenti']['elettro'] = {'verifica_oggi': [], 'ottimizzazione': ''}

    # Aggiungi piante_critiche (calcolato)
    cervello_data['agenti']['piante']['piante_critiche'] = [
        {'id': p['id'], 'nome': p['nome'], 'giorni_a_raccolta': p.get('giorni_a_raccolta')}
        for p in piante_critiche
    ]

    # Aggiungi ore_luce reale
    if 'ambiente' in cervello_data['agenti']:
        cervello_data['agenti']['ambiente']['ore_luce'] = meteo.get('ore_luce', 14)

    brain_out = {
        'lastUpdate': oggi_iso,
        'versione': '5.0',
        'cervello': {
            'consigli_giorno': cervello_data.get('consigli_giorno', []),
            'consigli_piante': cervello_data.get('consigli_piante', {}),
            'tecniche_nuove': cervello_data.get('tecniche_nuove', []),
            'scoperte': cervello_data.get('scoperte', []),
            'avvisi': cervello_data.get('avvisi', [])
        },
        'agenti': cervello_data.get('agenti', {}),
        'tecniche_nuove': cervello_data.get('tecniche_nuove', []),
        'avvisi': cervello_data.get('avvisi', []),
        'consigli_giorno': cervello_data.get('consigli_giorno', [])
    }

    # 8. Salva
    content_b64 = base64.b64encode(json.dumps(brain_out, indent=2, ensure_ascii=False).encode()).decode()
    _, sha = gh_get('data/brain.json')
    gh_put('data/brain.json', content_b64, sha,
           f'BioSerra brain {oggi_data} [Mistral v5]')

    print(f'\n=== COMPLETATO ===')
    print(f'Consigli giorno: {len(brain_out["consigli_giorno"])}')
    print(f'Avvisi: {len(brain_out["avvisi"])}')
    print(f'Versione: {brain_out["versione"]}')
    if brain_out['consigli_giorno']:
        print(f'Consiglio 1: {brain_out["consigli_giorno"][0][:100]}')

if __name__ == '__main__':
    main()
