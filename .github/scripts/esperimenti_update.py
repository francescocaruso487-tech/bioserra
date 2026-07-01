"""
esperimenti_update.py — Genera esperimenti reali dall'incrocio di PDF
Legge le connessioni semantiche tra PDF + i concetti estratti,
Mistral propone esperimenti specifici applicabili nella serra BioSerra.
Aggiorna esperimenti.json con proposte basate su contenuto reale.
"""
import os, json, base64, urllib.request, datetime, re, time

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
RAW  = f'https://raw.githubusercontent.com/{REPO}/main/'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

def gh_get(path):
    """Resiliente: 3 tentativi, timeout, rilancia l'ultima eccezione se falliscono tutti."""
    last_ex = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            # File >1MB: GitHub API content:'' — usa raw URL
            if not d.get('content','').strip():
                raw_url = f'https://raw.githubusercontent.com/{REPO}/main/{path}'
                req2 = urllib.request.Request(raw_url, headers={
                    'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(req2, timeout=30) as r2:
                    return r2.read().decode('utf-8'), d['sha']
            return base64.b64decode(d['content'].replace('\n','')).decode('utf-8'), d['sha']
        except Exception as ex:
            last_ex = ex
            print(f'  gh_get tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    raise last_ex

def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)['sha']
    except: return None

def gh_put(path, content, sha, msg):
    """Resiliente: 3 tentativi, SHA sempre fresco, mai solleva eccezioni (None se fallisce)."""
    if isinstance(content, str):
        content = content.encode('utf-8')
    encoded = base64.b64encode(content).decode('ascii')
    for attempt in range(3):
        try:
            sha_fresco = gh_get_sha(path)
            body = {'message': msg, 'content': encoded, 'branch': 'main'}
            if sha_fresco:
                body['sha'] = sha_fresco
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}',
                data=json.dumps(body).encode(),
                headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
            with urllib.request.urlopen(req) as r:
                return json.load(r)['commit']['sha']
        except Exception as ex:
            print(f'  gh_put tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    return None

def sanitize_testo(t):
    """Regola progetto: niente 'cannabis' nel testo generato/mostrato — sostituisce con 'pianta'."""
    if not t or not isinstance(t, str):
        return t
    t = re.sub(r'\s*(\s*[Cc]annabis\s+sativa\s+L\.?\s*)', '', t)
    t = re.sub(r'\bpianta\s+di\s+[Cc]annabis\b', 'pianta', t, flags=re.IGNORECASE)
    t = t.replace('CANNABIS', 'PIANTA')
    t = t.replace('Cannabis', 'Pianta')
    t = t.replace('cannabis', 'pianta')
    return t

TESTO_FIELDS_STR = ['nome', 'ipotesi', 'variabili_controllo', 'originalita', 'fonte_a', 'fonte_b']
TESTO_FIELDS_LIST = ['protocollo', 'materiali', 'misure', 'fonti']

def sanitizza_esperimento(esp):
    """Sanitizza in-place i campi testo libero di un esperimento (mai id/categoria/difficolta)."""
    for campo in TESTO_FIELDS_STR:
        if campo in esp:
            esp[campo] = sanitize_testo(esp[campo])
    for campo in TESTO_FIELDS_LIST:
        if campo in esp and isinstance(esp[campo], list):
            esp[campo] = [sanitize_testo(v) if isinstance(v, str) else v for v in esp[campo]]
    return esp

def mistral_chat(prompt, max_tokens=1200):
    if not MISTRAL_KEY: return None
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
        method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.load(r)
        return resp['choices'][0]['message']['content'].strip()
    except Exception as ex:
        print(f'  Mistral ERR: {ex}')
        return None

def genera_esperimento_da_connessione(conn, dati_a, dati_b):
    """
    Dato un edge semantico tra due PDF, Mistral propone un esperimento
    che nasce dall'incrocio dei due concetti connessi.
    """
    concetto_a = conn.get('concetto_a', '')
    concetto_b = conn.get('concetto_b', '')
    descrizione_conn = conn.get('descrizione', '')
    titolo_a = dati_a.get('titolo', '')[:60]
    titolo_b = dati_b.get('titolo', '')[:60]

    # Campiona concetti aggiuntivi per contesto
    campione_a = dati_a.get('concetti', [])[:10]
    campione_b = dati_b.get('concetti', [])[:10]

    prompt = f"""Sei un ricercatore agronomo specializzato in Living Soil, biodinamica ed elettrocultura.
Hai trovato questa connessione tra due manuali diversi:

MANUALE A: "{titolo_a}"
Concetto chiave: {concetto_a}
Altri concetti del manuale: {', '.join(campione_a)}

MANUALE B: "{titolo_b}"
Concetto chiave: {concetto_b}
Altri concetti del manuale: {', '.join(campione_b)}

CONNESSIONE TROVATA: {descrizione_conn}

Questa connessione suggerisce un ESPERIMENTO originale per la serra BioSerra Caserta (outdoor, Living Soil, water-only):
- Non deve essere un esperimento generico
- Deve nascere SPECIFICAMENTE dall'incrocio di questi due concetti
- Deve essere praticabile con materiali accessibili
- Deve avere un risultato misurabile

Rispondi con JSON:
{{
  "nome": "nome esperimento specifico e descrittivo",
  "ipotesi": "cosa ci aspettiamo e perche, citando i due manuali",
  "protocollo": [
    "passo 1 dettagliato",
    "passo 2",
    "passo 3",
    "passo 4"
  ],
  "materiali": ["materiale 1", "materiale 2"],
  "durata_giorni": 30,
  "misure": ["cosa misurare", "come verificare il risultato"],
  "variabili_controllo": "cosa tenere costante per isolare l'effetto",
  "categoria": "elettrocultura|biodinamica|living_soil|sinergia",
  "difficolta": "bassa|media|alta",
  "fonte_a": "{titolo_a[:40]}",
  "fonte_b": "{titolo_b[:40]}",
  "originalita": "perche questo esperimento non si trova in nessuno dei due manuali singolarmente"
}}
Solo JSON valido."""

    risposta = mistral_chat(prompt, max_tokens=1000)
    if not risposta: return None
    try:
        s, e = risposta.find('{'), risposta.rfind('}')
        if s >= 0 and e > s:
            return json.loads(risposta[s:e+1])
    except: pass
    return None

def genera_esperimenti_trasversali(tutti_concetti_per_pdf, n_pdf=6):
    """
    Mistral legge i concetti di N PDF insieme e propone esperimenti
    che emergono dall'incrocio di 3 o più documenti.
    """
    # Seleziona i PDF più rilevanti (più concetti estratti)
    pdf_top = sorted(tutti_concetti_per_pdf.items(),
                     key=lambda x: len(x[1].get('concetti',[])), reverse=True)[:n_pdf]

    ctx = '\n\n'.join(
        f'PDF {i+1}: "{d["titolo"][:50]}"\nConcetti: {", ".join(d.get("concetti",[])[:15])}'
        for i, (_, d) in enumerate(pdf_top)
    )

    prompt = f"""Sei un ricercatore che studia la convergenza tra elettrocultura, biodinamica e Living Soil.
Hai letto questi {n_pdf} manuali diversi e ne hai estratto i concetti chiave:

{ctx}

Proponi 3 ESPERIMENTI ORIGINALI che nascono dall'INCROCIO di 3 o più di questi manuali.
Ogni esperimento deve:
1. Citare esplicitamente i manuali che lo ispirano
2. Unire principi che nessun singolo manuale combina
3. Essere praticabile in una serra outdoor Living Soil a Caserta (41N)
4. Avere un risultato misurabile in 2-8 settimane

Rispondi con JSON:
{{
  "esperimenti": [
    {{
      "nome": "nome specifico",
      "fonti": ["PDF 1", "PDF 3", "PDF 5"],
      "ipotesi": "cosa accade e perche dalla combinazione di questi principi",
      "protocollo": ["passo 1", "passo 2", "passo 3"],
      "materiali": ["materiale 1"],
      "durata_giorni": 21,
      "misure": ["misura 1"],
      "categoria": "sinergia_trasversale",
      "difficolta": "media",
      "originalita": "perche non esiste in nessun manuale"
    }}
  ]
}}
Solo JSON valido."""

    risposta = mistral_chat(prompt, max_tokens=1500)
    if not risposta: return []
    try:
        s, e = risposta.find('{'), risposta.rfind('}')
        if s >= 0 and e > s:
            data = json.loads(risposta[s:e+1])
            return data.get('esperimenti', [])
    except: pass
    return []

def main():
    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Esperimenti Update ({oggi}) ===')
    print(f'MISTRAL_KEY: {"OK" if MISTRAL_KEY else "ASSENTE"}')

    # Carica dati
    try:
        raw_esp, sha_esp = gh_get('data/esperimenti.json')
    except Exception as ex:
        print(f'ERRORE CRITICO: lettura esperimenti.json fallita dopo 3 tentativi: {ex}')
        import sys; sys.exit(1)
    esperimenti = json.loads(raw_esp)
    proposte_esistenti = {p.get('nome','') for p in esperimenti.get('proposte', [])}
    print(f'Proposte esistenti: {len(proposte_esistenti)}')

    # Carica concetti completi
    try:
        raw_cc, _ = gh_get('data/concetti_completi.json')
        concetti_per_pdf = json.loads(raw_cc)
    except:
        concetti_per_pdf = {}
    print(f'PDF con concetti: {len(concetti_per_pdf)}')

    if not concetti_per_pdf:
        print('Nessun concetto estratto ancora. Aspetta connessioni_update.')
        return

    # Carica grafo per trovare connessioni semantiche reali
    try:
        raw_g, _ = gh_get('data/pdf_graph.json')
        grafo = json.loads(raw_g)
        edges_semantici = [
            e for e in grafo.get('edges', [])
            if e.get('tipo') == 'semantico_reale' and float(e.get('peso',0)) > 0.6
        ]
    except:
        edges_semantici = []
    print(f'Edges semantici (peso>0.6): {len(edges_semantici)}')

    nuove_proposte = []

    # TIPO 1: Esperimenti da connessioni pairwise
    if edges_semantici:
        print(f'\n[TIPO 1] Esperimenti da connessioni pairwise (max 5)')
        for edge in sorted(edges_semantici, key=lambda e: -float(e.get('peso',0)))[:5]:
            id_a = edge.get('source', '')
            id_b = edge.get('target', '')
            dati_a = concetti_per_pdf.get(id_a, {})
            dati_b = concetti_per_pdf.get(id_b, {})
            if not dati_a or not dati_b:
                continue

            print(f'\n  {dati_a.get("titolo","")[:40]} x {dati_b.get("titolo","")[:40]}')
            esp = genera_esperimento_da_connessione(edge, dati_a, dati_b)
            if esp and esp.get('nome','') not in proposte_esistenti:
                esp['id'] = f'esp_conn_{oggi}_{len(nuove_proposte)+1:03d}'
                esp['data_proposta'] = oggi
                esp['attivo'] = False
                esp['tipo'] = 'connessione_pairwise'
                sanitizza_esperimento(esp)
                nuove_proposte.append(esp)
                proposte_esistenti.add(esp['nome'])
                print(f'  -> {esp["nome"][:60]}')
            time.sleep(2)

    # TIPO 2: Esperimenti trasversali da N PDF
    print(f'\n[TIPO 2] Esperimenti trasversali multi-PDF')
    esps_trasversali = genera_esperimenti_trasversali(concetti_per_pdf, n_pdf=6)
    for esp in esps_trasversali:
        if esp.get('nome','') not in proposte_esistenti:
            esp['id'] = f'esp_trasv_{oggi}_{len(nuove_proposte)+1:03d}'
            esp['data_proposta'] = oggi
            esp['attivo'] = False
            esp['tipo'] = 'trasversale_multi_pdf'
            sanitizza_esperimento(esp)
            nuove_proposte.append(esp)
            proposte_esistenti.add(esp['nome'])
            print(f'  -> {esp["nome"][:60]}')

    # Aggiorna esperimenti.json
    proposte_aggiornate = esperimenti.get('proposte', []) + nuove_proposte
    # Rete di sicurezza: sanitizza anche le proposte storiche (pulizia dati esistenti)
    _sanit_count = 0
    for _p in proposte_aggiornate:
        _prima = json.dumps(_p, ensure_ascii=False)
        sanitizza_esperimento(_p)
        if json.dumps(_p, ensure_ascii=False) != _prima:
            _sanit_count += 1
    if _sanit_count:
        print(f'  Sanitizzate {_sanit_count} proposte esistenti (cannabis->pianta)')
    # Mantieni max 100 proposte (rimuovi le più vecchie)
    if len(proposte_aggiornate) > 100:
        proposte_aggiornate = proposte_aggiornate[-100:]

    esperimenti['proposte'] = proposte_aggiornate
    esperimenti['lastUpdate'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    esperimenti['versione'] = '3.0'
    esperimenti['ultima_generazione'] = {
        'data': oggi,
        'nuove_proposte': len(nuove_proposte),
        'pdf_analizzati': len(concetti_per_pdf),
        'connessioni_usate': len(edges_semantici)
    }

    sha_fresh = gh_get_sha('data/esperimenti.json')
    res = gh_put('data/esperimenti.json',
           json.dumps(esperimenti, indent=2, ensure_ascii=False),
           sha_fresh,
           f'esperimenti: +{len(nuove_proposte)} nuove proposte [{oggi}]')
    if res is None:
        print('  ERRORE CRITICO: salvataggio esperimenti.json fallito dopo 3 tentativi')

    print(f'\n=== COMPLETATO ===')
    print(f'Nuove proposte: {len(nuove_proposte)}')
    print(f'Proposte totali: {len(proposte_aggiornate)}')
    if nuove_proposte:
        print('\nEsempi di nuovi esperimenti:')
        for e in nuove_proposte[:3]:
            print(f'  - {e.get("nome","")[:80]}')
            if e.get('originalita'):
                print(f'    Originalita: {e["originalita"][:100]}')

if __name__ == '__main__':
    main()
