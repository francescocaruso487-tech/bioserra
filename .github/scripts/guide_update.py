import os, json, base64, urllib.request, urllib.error, datetime, time, sys

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'

HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

# Fasi da generare con metadati
FASI = [
    {'fase': 'germinazione',    'quando': 'Aprile a Caserta (outdoor)',       'fasi_app': ['germinazione']},
    {'fase': 'vegetazione',     'quando': 'Aprile-Giugno a Caserta',          'fasi_app': ['vegetazione']},
    {'fase': 'fioritura',       'quando': 'Giugno-Ottobre a Caserta',         'fasi_app': ['fioritura']},
    {'fase': 'harvest',         'quando': 'Giugno-Dicembre (varia per tipo)', 'fasi_app': ['taglio']},
    {'fase': 'essiccazione',    'quando': '15 giorni dopo il taglio',         'fasi_app': ['essiccazione']},
    {'fase': 'curing',          'quando': '20 giorni dopo essiccazione',      'fasi_app': ['concia']},
    {'fase': 'living_soil',     'quando': 'Tutto il ciclo',                   'fasi_app': ['vegetazione','fioritura']},
    {'fase': 'nutrizione',      'quando': 'Vegetazione e fioritura',          'fasi_app': ['vegetazione','fioritura']},
    {'fase': 'irrigazione',     'quando': 'Tutto il ciclo',                   'fasi_app': ['germinazione','vegetazione','fioritura']},
    {'fase': 'difesa_biologica','quando': 'Vegetazione e fioritura',          'fasi_app': ['vegetazione','fioritura']},
]

# Tecniche elettrocultura da passare come contesto
TECNICHE_ELETTRO = [
    'Acqua Magnetizzata', 'Spirale in Rame', 'Circuito di Lakhovsky',
    'Elettrodi Fe-Cu', 'Antenna di Terra'
]

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

def mistral_chat(prompt, max_tokens=1500):
    if not MISTRAL_KEY:
        raise Exception('MISTRAL_KEY mancante')
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': max_tokens,
        'temperature': 0.2,
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
    print(f'    Mistral OK: {len(content)} chars, {tokens} tokens')
    return content

def parse_json(testo):
    s = testo.find('{')
    e = testo.rfind('}')
    if s >= 0 and e > s:
        try:
            return json.loads(testo[s:e+1])
        except:
            pass
    return None

def genera_guida(fase_info, tecniche_pdf_ctx, pdf_sommari):
    """Genera una guida per la fase specificata"""
    fase = fase_info['fase']
    quando = fase_info['quando']

    # Titolo leggibile per la fase
    TITOLI = {
        'germinazione':    'Germinazione',
        'vegetazione':     'Fase Vegetativa',
        'fioritura':       'Fase di Fioritura',
        'harvest':         'Raccolta (Taglio)',
        'essiccazione':    'Essiccazione',
        'curing':          'Concia (Curing)',
        'living_soil':     'Gestione Living Soil',
        'nutrizione':      'Nutrizione Organica',
        'irrigazione':     'Irrigazione e Acqua',
        'difesa_biologica':'Difesa Biologica',
    }
    titolo_fase = TITOLI.get(fase, fase.replace('_',' ').title())

    prompt = (
        f'Sei un agronomo esperto di coltivazione Living Soil outdoor a Caserta, Italia. '
        f'Scrivi una guida pratica completa per la fase: {titolo_fase.upper()}\n\n'
        f'Contesto:\n'
        f'- Serra outdoor Living Soil a Caserta (lat 41.09N)\n'
        f'- Periodo: {quando}\n'
        f'- Varieta autofiorenti (Epsilon F1, Milky Way F1, Titan F1, Medusa F1, Gaia F1)\n'
        f'- Varieta femminizzate fotoperiodiche (Astro Lemonade, Cosmic Cheddar, Orbital Banana, Royal Gorilla, Mexican Rush)\n'
        f'- Tecniche elettrocultura attive: {", ".join(TECNICHE_ELETTRO)}\n\n'
        f'Genera un JSON con questi campi:\n'
        f'- titolo: "{titolo_fase} — Guida Pratica Outdoor Caserta"\n'
        f'- contenuto_completo: testo guida pratica dettagliata, 200-300 parole, in italiano, '
        f'specifico per clima mediterraneo e Living Soil, menziona le tecniche elettrocultura dove pertinente\n'
        f'- punti_chiave: array di 4-5 punti chiave pratici (stringhe brevi)\n'
        f'- errori_comuni: array di 3-4 errori da evitare (stringhe brevi)\n'
        f'- tecniche_pdf: array di 2-3 tecniche specifiche da applicare in questa fase '
        f'(scegli da: {", ".join(TECNICHE_ELETTRO + ["compostaggio", "te di compost", "micorrize", "calendario lunare", "olio di neem"])})\n'
        f'- esperimenti_pdf: array di 1-2 esperimenti suggeriti (stringhe descrittive)\n\n'
        f'Rispondi SOLO con JSON valido. Nessun testo aggiuntivo.'
    )

    # Guida fallback se Mistral non disponibile
    fallback = {
        'titolo': f'{titolo_fase} — Guida Pratica Outdoor Caserta',
        'contenuto_completo': f'Guida pratica per la fase {titolo_fase} in serra Living Soil outdoor a Caserta. Segui le indicazioni specifiche per il clima mediterraneo e le varieta in coltivazione.',
        'punti_chiave': [f'Monitora costantemente le piante in {titolo_fase}', 'Adatta alle condizioni meteo locali', 'Applica tecniche elettrocultura'],
        'errori_comuni': ['Non monitorare abbastanza', 'Eccesso di irrigazione', 'Ignorare il calendario lunare'],
        'tecniche_pdf': TECNICHE_ELETTRO[:2],
        'esperimenti_pdf': []
    }

    if not MISTRAL_KEY:
        return fallback

    try:
        risposta = mistral_chat(prompt, max_tokens=1500)
        parsed = parse_json(risposta)
        if parsed and parsed.get('contenuto_completo') and len(parsed['contenuto_completo']) > 50:
            return parsed
        else:
            print(f'    JSON non valido per {fase}, uso fallback')
            return fallback
    except Exception as ex:
        print(f'    Errore Mistral per {fase}: {ex}')
        return fallback

def main():
    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Guide Update ({oggi}) ===')
    print(f'MISTRAL_KEY: {"presente" if MISTRAL_KEY else "ASSENTE"}')

    # Leggi pdf_knowledge per contesto tecniche
    print('\nLeggo pdf_knowledge.json...')
    raw_k, _ = gh_get('data/pdf_knowledge.json')
    knowledge = json.loads(raw_k)
    analisi = knowledge.get('analisi', [])

    # Estrai tecniche reali dai PDF (top 10)
    tec_count = {}
    for a in analisi:
        for t in a.get('tecniche_chiave', []):
            t = t.strip()
            if len(t) > 4:
                tec_count[t] = tec_count.get(t, 0) + 1
    top_tec = [t for t, _ in sorted(tec_count.items(), key=lambda x: -x[1])[:10]]

    # Sommari PDF per contesto
    sommari = [a.get('sommario', '') for a in analisi[:5] if a.get('sommario')]

    print(f'Tecniche PDF estratte: {len(top_tec)}')

    # Genera ogni guida
    guide = []
    for i, fase_info in enumerate(FASI):
        fase = fase_info['fase']
        print(f'\n[{i+1}/{len(FASI)}] Genera guida: {fase}...')

        guida_content = genera_guida(fase_info, top_tec, sommari)

        guida = {
            'fase': fase,
            'categoria': 'fase' if fase in ['germinazione','vegetazione','fioritura','harvest','essiccazione','curing'] else 'tecnica',
            'titolo': guida_content.get('titolo', f'{fase.replace("_"," ").title()} — Guida Pratica'),
            'quando': fase_info['quando'],
            'contenuto_completo': guida_content.get('contenuto_completo', ''),
            'punti_chiave': guida_content.get('punti_chiave', []),
            'errori_comuni': guida_content.get('errori_comuni', []),
            'tecniche_pdf': guida_content.get('tecniche_pdf', []),
            'esperimenti_pdf': guida_content.get('esperimenti_pdf', []),
            'fasi_app': fase_info['fasi_app']
        }
        guide.append(guida)
        print(f'    OK: {len(guida["contenuto_completo"])} chars, {len(guida["punti_chiave"])} punti')

        # Pausa tra chiamate Mistral
        if MISTRAL_KEY and i < len(FASI) - 1:
            time.sleep(2)

    # Salva
    out = {
        'lastUpdate': oggi,
        'total': len(guide),
        'guide': guide
    }

    content_b64 = base64.b64encode(json.dumps(out, indent=2, ensure_ascii=False).encode()).decode()
    _, sha = gh_get('data/guide_complete.json')
    gh_put('data/guide_complete.json', content_b64, sha,
           f'BioSerra guide {oggi} ({len(guide)} guide) [Mistral]')

    print(f'\n=== COMPLETATO: {len(guide)} guide generate ===')
    for g in guide:
        print(f'  {g["fase"]}: {len(g["contenuto_completo"])} chars, {len(g["tecniche_pdf"])} tecniche PDF')

if __name__ == '__main__':
    main()
