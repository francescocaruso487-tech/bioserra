"""
connessioni_update.py — Grafo di connessioni semantiche reali tra PDF
Legge i testi completi (tutti i chunk) di ogni PDF,
Mistral analizza trasversalmente e trova connessioni concettuali profonde.
Aggiorna pdf_graph.json con connessioni basate su contenuto reale.
"""
import os, json, base64, urllib.request, urllib.error, datetime, re, time, sys

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
RAW  = f'https://raw.githubusercontent.com/{REPO}/main/'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

def gh_get(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        d = json.load(r)
    return base64.b64decode(d['content'].replace('\n','')).decode('utf-8'), d['sha']

def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)['sha']
    except: return None

def gh_put(path, content, sha, msg):
    if isinstance(content, str):
        content = content.encode('utf-8')
    encoded = base64.b64encode(content).decode('ascii')
    body = {'message': msg, 'content': encoded, 'branch': 'main'}
    if sha: body['sha'] = sha
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=json.dumps(body).encode(),
        headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
    with urllib.request.urlopen(req) as r:
        return json.load(r)['commit']['sha']

def gh_list(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except: return []

def gh_raw(path):
    req = urllib.request.Request(RAW + path, headers={
        'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', errors='replace')

def titolo_safe(titolo):
    safe = re.sub(r'[^\w\-]', '_', titolo.strip())
    return re.sub(r'_+', '_', safe).strip('_')[:80]

def mistral_chat(prompt, max_tokens=1000):
    if not MISTRAL_KEY: return None
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': max_tokens,
        'temperature': 0.1,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    req = urllib.request.Request(
        'https://api.mistral.ai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
        method='POST')
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            resp = json.load(r)
        return resp['choices'][0]['message']['content'].strip()
    except Exception as ex:
        print(f'  Mistral ERR: {ex}')
        return None

def carica_testo_completo(safe_id):
    """
    Carica il testo completo di un PDF, inclusi tutti i chunk.
    Restituisce il testo unificato.
    """
    testo_parts = []

    # 1. File principale (indice + prime pagine)
    try:
        raw = gh_raw(f'data/testi/{safe_id}.txt')
        if raw.startswith('==='):
            idx = raw.find('\n\n')
            if idx > 0: raw = raw[idx+2:]
        if '[VUOTO]' in raw[:50]:
            return ''
        # Rimuovi sezione indice se presente
        if 'INDICE CHUNKS:' in raw:
            idx_fine = raw.find('TESTO COMPLETO CHUNK 1')
            if idx_fine > 0:
                raw = raw[raw.find('\n', idx_fine)+1:]
        testo_parts.append(raw.strip())
    except:
        return ''

    # 2. Carica chunk aggiuntivi da data/testi/chunks/
    chunk_idx = 2
    while True:
        path_chunk = f'data/testi/chunks/{safe_id}_chunk_{chunk_idx:03d}.txt'
        try:
            chunk_raw = gh_raw(path_chunk)
            if chunk_raw.startswith('==='):
                idx = chunk_raw.find('\n\n')
                if idx > 0: chunk_raw = chunk_raw[idx+2:]
            testo_parts.append(chunk_raw.strip())
            chunk_idx += 1
            if chunk_idx > 50:  # max 50 chunk (= ~2.2M chars)
                break
        except:
            break  # nessun altro chunk

    return '\n\n'.join(testo_parts)

def estrai_concetti_pdf(pdf_id, titolo, testo_completo):
    """
    Mistral legge il testo completo a finestre e estrae tutti i concetti,
    principi, tecniche e scoperte del documento.
    """
    if not MISTRAL_KEY or len(testo_completo) < 100:
        return []

    # Divide testo in finestre da 4000 chars con overlap
    FINESTRA = 4000
    OVERLAP = 500
    pos = 0
    tutti_concetti = []
    n_finestre = 0

    while pos < len(testo_completo):
        finestra = testo_completo[pos:pos+FINESTRA]
        n_finestre += 1

        prompt = f"""Documento: {titolo}
Sezione del testo (pagine {n_finestre}):
{finestra}

Estrai da questo testo TUTTI i concetti, principi, tecniche, esperimenti, 
sostanze, frequenze, materiali, processi menzionati.
Sii specifico: non "elettrocultura" ma "spirale rame 1.5mm avvolta in senso orario attorno fusto".
Non "biodinamica" ma "preparato 500 (letame bovino fermentato in corno)".

Rispondi con JSON:
{{"concetti": ["concetto specifico 1", "concetto specifico 2", ...]}}
Max 15 concetti per sezione. Solo JSON, nessun testo fuori."""

        risposta = mistral_chat(prompt, max_tokens=400)
        if risposta:
            try:
                s, e = risposta.find('{'), risposta.rfind('}')
                if s >= 0 and e > s:
                    data = json.loads(risposta[s:e+1])
                    nuovi = data.get('concetti', [])
                    tutti_concetti.extend([c for c in nuovi if c not in tutti_concetti])
            except: pass

        pos += FINESTRA - OVERLAP
        if n_finestre % 5 == 0:
            print(f'  finestra {n_finestre}: {len(tutti_concetti)} concetti finora')
        time.sleep(1)

    return tutti_concetti

def trova_connessioni_trasversali(pdf_a, concetti_a, pdf_b, concetti_b):
    """
    Mistral confronta i concetti di due PDF e trova connessioni non ovvie.
    """
    if not MISTRAL_KEY: return []
    if not concetti_a or not concetti_b: return []

    prompt = f"""Sei un agronomo ricercatore Living Soil ed elettrocultura.
Hai letto due manuali diversi e hai estratto questi concetti:

MANUALE A: {pdf_a['titolo'][:60]}
Concetti: {', '.join(concetti_a[:20])}

MANUALE B: {pdf_b['titolo'][:60]}
Concetti: {', '.join(concetti_b[:20])}

Trova CONNESSIONI NON OVVIE tra i due manuali:
- Principi fisici o biologici condivisi anche se descritti diversamente
- Tecniche di un manuale che potenziano quelle dell'altro
- Contraddizioni interessanti da investigare
- Sinergie applicabili nella serra outdoor Living Soil

Rispondi con JSON:
{{
  "connessioni": [
    {{
      "concetto_a": "concetto dal manuale A",
      "concetto_b": "concetto dal manuale B",
      "tipo": "sinergia|principio_condiviso|contraddizione|potenziamento",
      "descrizione": "spiegazione della connessione in 1-2 frasi",
      "peso": 0.0
    }}
  ]
}}
Peso da 0 (debole) a 1 (fortissima). Max 5 connessioni. Solo JSON."""

    risposta = mistral_chat(prompt, max_tokens=600)
    if not risposta: return []
    try:
        s, e = risposta.find('{'), risposta.rfind('}')
        if s >= 0 and e > s:
            data = json.loads(risposta[s:e+1])
            return data.get('connessioni', [])
    except: pass
    return []

def main():
    # Modalita: notte (default) = 5 PDF + 10 coppie
    #           pomeriggio      = 3 PDF + 20 coppie (piu connessioni)
    MODE = 'notte'
    for arg in sys.argv[1:]:
        if arg in ('--mode', '-m'):
            pass  # handled next
        elif arg in ('pomeriggio', 'notte'):
            MODE = arg
        elif sys.argv[sys.argv.index(arg)-1] in ('--mode', '-m'):
            MODE = arg

    MAX_PDF_CONCETTI = 3 if MODE == 'pomeriggio' else 5
    MAX_COPPIE       = 20 if MODE == 'pomeriggio' else 10

    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Connessioni Update [{MODE.upper()}] ({oggi}) ===')
    print(f'MISTRAL_KEY: {"OK" if MISTRAL_KEY else "ASSENTE"}')

    # Carica pdf_knowledge
    raw_pk, sha_pk = gh_get('data/pdf_knowledge.json')
    pdf_knowledge = json.loads(raw_pk)
    analisi = pdf_knowledge.get('analisi', [])
    print(f'PDF: {len(analisi)}')

    # Carica grafo esistente
    raw_g, sha_g = gh_get('data/pdf_graph.json')
    grafo = json.loads(raw_g)
    edges_esistenti = {
        f'{e["source"]}|{e["target"]}': e
        for e in grafo.get('edges', [])
    }
    print(f'Edges esistenti: {len(edges_esistenti)}')

    # Carica concetti già estratti
    try:
        raw_ce, _ = gh_get('data/concetti_completi.json')
        concetti_per_pdf = json.loads(raw_ce)
    except:
        concetti_per_pdf = {}
    print(f'PDF con concetti estratti: {len(concetti_per_pdf)}')

    # Lista testi disponibili (PDF + web)
    testi_disp = {f['name'].replace('.txt','')
                  for f in gh_list('data/testi')
                  if f.get('type') == 'file' and f['name'].endswith('.txt')}
    # Aggiungi testi web (zamnesia, rqs)
    for sito in ['zamnesia', 'rqs']:
        for f in gh_list(f'data/testi/web/{sito}'):
            if f.get('type') == 'file' and f['name'].endswith('.txt'):
                testi_disp.add(f['name'].replace('.txt',''))
    print(f'Testi disponibili (PDF+web): {len(testi_disp)}')

    # FASE 1: Estrai concetti da PDF rilevanti non ancora processati
    CATEGORIE_RILEVANTI = {
        'elettrocultura', 'biodinamica', 'living_soil', 'agricoltura',
        'fisica_energie', 'fitoterapia', 'scienza', 'web_coltivazione'
    }
    TAG_RILEVANTI = ['coltivazione', 'suolo', 'piante', 'elettro', 'biodinamic',
                     'living', 'compost', 'fertilit', 'guida', 'web']

    def is_rilevante(a):
        cat = a.get('categoria_reale','')
        if cat in CATEGORIE_RILEVANTI:
            return True
        tags = ' '.join(a.get('tag',[])).lower()
        if any(t in tags for t in TAG_RILEVANTI):
            return True
        # Web sempre rilevante
        if a.get('fonte_sito'):
            return True
        return False

    # Prima i rilevanti, poi gli altri — entrambi filtrati per testo disponibile
    pdf_senza_concetti_rilevanti = [
        a for a in analisi
        if (titolo_safe(a.get('titolo','')) in testi_disp
            or a.get('fonte_sito'))
        and a.get('id','') not in concetti_per_pdf
        and is_rilevante(a)
    ]
    pdf_senza_concetti_altri = [
        a for a in analisi
        if (titolo_safe(a.get('titolo','')) in testi_disp
            or a.get('fonte_sito'))
        and a.get('id','') not in concetti_per_pdf
        and not is_rilevante(a)
    ]
    # Usa prima i rilevanti, poi eventualmente gli altri se ne restano slot
    pdf_senza_concetti = (pdf_senza_concetti_rilevanti + pdf_senza_concetti_altri)[:MAX_PDF_CONCETTI]
    print(f'  Rilevanti: {len(pdf_senza_concetti_rilevanti)} | Altri: {len(pdf_senza_concetti_altri)}')

    print(f'\n[FASE 1] Estrazione concetti: {len(pdf_senza_concetti)} PDF (max {MAX_PDF_CONCETTI})')
    nuovi_concetti = 0

    for a in pdf_senza_concetti:
        titolo = a.get('titolo', '')
        safe_id = titolo_safe(titolo)
        print(f'\n  {titolo[:60]}')

        # Per voci web usa path specifico
        if a.get('fonte_sito'):
            slug = a.get('testo_id', safe_id)
            sito = a.get('fonte_sito','')
            try:
                testo = gh_raw(f'data/testi/web/{sito}/{slug}.txt')
            except:
                testo = ''
        else:
            testo = carica_testo_completo(safe_id)
        if len(testo) < 200:
            print(f'  Testo insufficiente ({len(testo)} chars)')
            continue

        print(f'  Testo: {len(testo):,} chars')
        concetti = estrai_concetti_pdf(a.get('id',''), titolo, testo)
        print(f'  Concetti estratti: {len(concetti)}')

        concetti_per_pdf[a.get('id','')] = {
            'titolo': titolo,
            'safe_id': safe_id,
            'concetti': concetti,
            'n_chars': len(testo),
            'data': oggi
        }
        nuovi_concetti += 1
        time.sleep(2)

    # Salva concetti_completi.json
    if nuovi_concetti > 0 or not gh_get_sha('data/concetti_completi.json'):
        sha_cc = gh_get_sha('data/concetti_completi.json')
        gh_put('data/concetti_completi.json',
               json.dumps(concetti_per_pdf, indent=2, ensure_ascii=False),
               sha_cc, f'concetti: +{nuovi_concetti} nuovi [{oggi}]')
        print(f'\nSalvato concetti_completi.json: {len(concetti_per_pdf)} PDF')

    # FASE 2: Trova connessioni trasversali tra coppie di PDF (10 coppie per notte)
    pdf_con_concetti = list(concetti_per_pdf.items())
    print(f'\n[FASE 2] Connessioni trasversali: {len(pdf_con_concetti)} PDF disponibili')

    nuove_connessioni = []
    coppie_processate = 0

    # Scegli coppie prioritarie: PDF con molti concetti in comune sui temi rilevanti
    # Temi rilevanti: elettrocultura/biodinamica E coltivazione base
    TEMI_PRIORITARI = ['lakhovsky', 'spirale', 'rame', 'magnetiz', 'antenna',
                       'suolo', 'compost', 'micorriz', 'luna', 'biodinamic',
                       'frequenz', 'risonanz', 'tesla', 'ighina', 'elettro']
    TEMI_COLTIV = ['radici', 'substrato', 'irrigaz', 'germinaz', 'fiorit',
                   'vegetat', 'nutrient', 'fertil', 'ph', 'outdoor',
                   'harvest', 'raccolt', 'essiccat', 'coltivaz', 'guida']
    CAT_ESCLUSE_FASE2 = {'esoterismo', 'filosofia', 'spiritualita'}

    def rilevanza_pdf(entry):
        pid, dati = entry
        # Escludi categorie non pertinenti
        cat = dati.get('categoria', '')
        if cat in CAT_ESCLUSE_FASE2:
            return -1
        concetti = dati.get('concetti', [])
        tl = ' '.join(concetti).lower()
        score = sum(2 for t in TEMI_PRIORITARI if t in tl)
        score += sum(1 for t in TEMI_COLTIV if t in tl)
        # Boost per articoli web (fonte nota e pertinente)
        if pid.startswith('web_'):
            score += 3
        return score

    pdf_ordinati = sorted(pdf_con_concetti, key=rilevanza_pdf, reverse=True)
    # Escludi PDF con score negativo (esoterismo)
    pdf_ordinati = [(pid, dati) for pid, dati in pdf_ordinati
                    if rilevanza_pdf((pid, dati)) >= 0]

    # Set di coppie già analizzate semanticamente (per non rifare)
    edges_semantici_set = set()
    for e in grafo.get('edges', []):
        if e.get('tipo') == 'semantico_reale':
            edges_semantici_set.add(f'sem|{e["source"]}|{e["target"]}')

    # Genera coppie prioritizzando i più rilevanti
    coppie_da_fare = []
    for i in range(min(10, len(pdf_ordinati))):
        for j in range(i+1, min(15, len(pdf_ordinati))):
            pdf_id_a = pdf_ordinati[i][0]
            pdf_id_b = pdf_ordinati[j][0]
            chiave = f'{pdf_id_a}|{pdf_id_b}'
            chiave_inv = f'{pdf_id_b}|{pdf_id_a}'
            # Salta solo se già esiste un edge semantico_reale tra questi due PDF
            chiave_sem = f'sem|{pdf_id_a}|{pdf_id_b}'
            chiave_sem_inv = f'sem|{pdf_id_b}|{pdf_id_a}'
            if chiave_sem in edges_semantici_set or chiave_sem_inv in edges_semantici_set:
                continue
            coppie_da_fare.append((pdf_ordinati[i], pdf_ordinati[j]))

    print(f'  Coppie da analizzare: {len(coppie_da_fare)} (max {MAX_COPPIE} [{MODE}])')

    for (id_a, dati_a), (id_b, dati_b) in coppie_da_fare[:MAX_COPPIE]:
        pdf_a = {'id': id_a, 'titolo': dati_a.get('titolo','')}
        pdf_b = {'id': id_b, 'titolo': dati_b.get('titolo','')}
        print(f'\n  {pdf_a["titolo"][:40]} <-> {pdf_b["titolo"][:40]}')

        connessioni = trova_connessioni_trasversali(
            pdf_a, dati_a.get('concetti', []),
            pdf_b, dati_b.get('concetti', [])
        )
        print(f'  Connessioni trovate: {len(connessioni)}')
        for conn in connessioni:
            print(f'    peso={conn.get("peso",0):.2f} tipo={conn.get("tipo_conn",conn.get("tipo","?"))} ca={conn.get("concetto_a","")[:30]}')

        for conn in connessioni:
            peso = float(conn.get('peso', 0.5))
            if peso <= 0: continue  # accetta anche pesi bassi, esclude solo 0
            chiave = f'{id_a}|{id_b}'
            tipo_conn = conn.get('tipo_conn', conn.get('tipo', 'sinergia'))
            edges_esistenti[chiave] = {
                'source': id_a,
                'target': id_b,
                'peso': peso,
                'tipo': 'semantico_reale',
                'concetto_a': conn.get('concetto_a',''),
                'concetto_b': conn.get('concetto_b',''),
                'descrizione': conn.get('descrizione',''),
                'tipo_conn': tipo_conn,
                'data': oggi
            }
            nuove_connessioni.append(chiave)

        coppie_processate += 1
        time.sleep(2)

    # Aggiorna pdf_graph.json
    edges_list = list(edges_esistenti.values())
    nodi_ids = set()
    for e in edges_list:
        nodi_ids.add(e['source'])
        nodi_ids.add(e['target'])

    by_id = {a['id']: a for a in analisi}
    nodi = [{'id': nid, 'titolo': by_id.get(nid,{}).get('titolo',''), 'size': 1}
            for nid in nodi_ids]

    grafo_new = {
        'lastUpdate': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'versione': '2.0_semantico',
        'nodi': nodi,
        'edges': edges_list
    }

    sha_g_fresh = gh_get_sha('data/pdf_graph.json')
    gh_put('data/pdf_graph.json',
           json.dumps(grafo_new, indent=2, ensure_ascii=False),
           sha_g_fresh,
           f'grafo: +{len(nuove_connessioni)} connessioni semantiche [{oggi}]')

    print(f'\n=== COMPLETATO ===')
    print(f'Concetti estratti da {nuovi_concetti} nuovi PDF')
    print(f'Nuove connessioni semantiche: {len(nuove_connessioni)}')
    print(f'Grafo totale: {len(nodi)} nodi, {len(edges_list)} edges')

if __name__ == '__main__':
    main()



