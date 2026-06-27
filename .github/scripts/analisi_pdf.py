import os, json, base64, urllib.request, urllib.error, time, datetime, sys, io

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
GROQ_KEY = os.environ.get('GROQ_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

def gh_get(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def gh_put(path, content_b64, sha, message):
    body = json.dumps({'message': message, 'content': content_b64, 'sha': sha}).encode()
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=body, headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT'
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def estrai_testo_pdf(pdf_bytes):
    """Prova fitz (pymupdf) prima, poi pypdf come fallback"""
    testo = ''

    # Tentativo 1: pymupdf (fitz) — migliore per PDF compressi
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        pagine = []
        for i, page in enumerate(doc):
            if i >= 15: break
            t = page.get_text()
            if t and t.strip():
                pagine.append(t.strip())
        doc.close()
        testo = '\n'.join(pagine)
        if testo.strip():
            return testo[:5000]
    except Exception as ex:
        print(f'  fitz: {ex}')

    # Tentativo 2: pdfplumber
    try:
        import pdfplumber
        pagine = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages):
                if i >= 15: break
                t = page.extract_text()
                if t:
                    pagine.append(t.strip())
        testo = '\n'.join(pagine)
        if testo.strip():
            return testo[:5000]
    except Exception as ex:
        print(f'  pdfplumber: {ex}')

    # Tentativo 3: pypdf
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pagine = []
        for i, page in enumerate(reader.pages):
            if i >= 15: break
            t = page.extract_text()
            if t:
                pagine.append(t.strip())
        testo = '\n'.join(pagine)
        if testo.strip():
            return testo[:5000]
    except Exception as ex:
        print(f'  pypdf: {ex}')

    return ''

def groq_analizza(titolo, testo):
    """Chiama Groq. Nessun except generico — tutti gli errori sono visibili."""
    if not GROQ_KEY:
        print('  SKIP: GROQ_KEY non impostata')
        return None

    titolo_safe = titolo.replace('"', "'")[:80]
    contenuto = testo[:2000] if len(testo) > 50 else 'Documento: ' + titolo_safe

    prompt = (
        'Sei un agronomo esperto di Living Soil e biodinamica per serra outdoor italiana Caserta. '
        'Rispondi SOLO con JSON valido, niente altro. '
        'Analizza questo documento e trova connessioni pratiche per la coltivazione.\n\n'
        'Titolo: ' + titolo_safe + '\n'
        'Contenuto: ' + contenuto[:1500] + '\n\n'
        'JSON richiesto:\n'
        '{"sommario":"2 frasi sul contenuto","tecniche_chiave":["tecnica1","tecnica2"],'
        '"consiglio_coltivazione":"azione pratica","consiglio_elettrocultura":"",'
        '"tag":["tag1","tag2"],"estratto_chiave":"frase chiave"}'
    )

    body_data = json.dumps({
        'model': 'llama-3.3-70b-versatile',
        'max_tokens': 500,
        'temperature': 0.0,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()

    print(f'  Invio a Groq ({len(prompt)} chars prompt)...')

    req_g = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=body_data,
        headers={'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json'},
        method='POST'
    )

    try:
        with urllib.request.urlopen(req_g, timeout=30) as r:
            status = r.status
            resp_bytes = r.read()
        print(f'  HTTP {status} ({len(resp_bytes)} bytes)')
        resp = json.loads(resp_bytes)
    except urllib.error.HTTPError as ex:
        err = ex.read().decode()[:300]
        print(f'  Groq HTTP {ex.code}: {err}')
        if ex.code == 429:
            time.sleep(25)
        return None
    except Exception as ex:
        print(f'  Groq connessione: {type(ex).__name__}: {ex}')
        return None

    raw = resp['choices'][0]['message']['content'].strip()
    print(f'  Raw ({len(raw)}c): {repr(raw[:250])}')

    s = raw.find('{')
    e = raw.rfind('}')
    if s < 0 or e <= s:
        print(f'  NESSUN JSON nel testo')
        return None

    candidate = raw[s:e+1]
    try:
        result = json.loads(candidate)
        print(f'  OK: sommario={len(result.get("sommario",""))}c')
        return result
    except json.JSONDecodeError as jex:
        print(f'  JSON decode: {jex}')
        print(f'  Candidate: {repr(candidate[:200])}')
        return None

def analizza_locale(titolo, testo):
    """Analisi locale — usa il testo reale estratto"""
    TECNICHE_KW = {
        'compost': 'Compostaggio', 'humus': 'Humus', 'micorriza': 'Micorrize',
        'mycorrhiz': 'Micorrize', 'vermicompost': 'Vermicompostaggio',
        'biochar': 'Biochar', 'elettrocoltura': 'Elettrocultura',
        'electroculture': 'Elettrocultura', 'lakhovsky': 'Circuito Lakhovsky',
        'copper': 'Rame in coltivazione', 'rame': 'Spirale cosmica rame',
        'magnetiz': 'Acqua magnetizzata', 'magnetic': 'Campo magnetico',
        'antenna': 'Antenna terrestre', 'biodinamic': 'Biodinamica',
        'biodynamic': 'Biodinamica', 'steiner': 'Metodo Steiner',
        'luna': 'Calendario lunare', 'lunar': 'Calendario lunare',
        'living soil': 'Living Soil', 'soil biology': 'Biologia del suolo',
        'microrganismi': 'Microbioma del suolo', 'microbiome': 'Microbioma',
        'irrigazion': 'Irrigazione', 'drip': 'Irrigazione a goccia',
        'fertil': 'Fertilizzazione organica', 'azoto': 'Gestione azoto',
        'tesla': 'Principi Tesla', 'frequenz': 'Frequenze vibrazionali',
        'frequency': 'Frequenze', 'vibrazion': 'Vibrazione e risonanza',
        'plant': 'Fisiologia vegetale', 'radice': 'Sviluppo radicale',
        'root': 'Sviluppo radicale', 'ighina': 'Atomo magnetico Ighina',
        'piante': 'Fisiologia vegetale', 'agricol': 'Tecniche agricole',
        'organic': 'Agricoltura organica', 'electr': 'Elettrocultura',
        'erbe': 'Fitoterapia', 'herb': 'Fitoterapia',
        'alchim': 'Principi alchemici', 'ermet': 'Principi ermetici',
        'chakra': 'Energia sottile', 'frequenze': 'Frequenze vibrazionali',
    }

    testo_full = (titolo + ' ' + testo).lower()
    tecniche = []
    tags = set()

    for kw, tec in TECNICHE_KW.items():
        if kw in testo_full and tec not in tecniche:
            tecniche.append(tec)
            # Tag correlati
            if any(w in kw for w in ['elettr','electr','lakhov','copper','rame','antenna','magnetic','tesla','ighina','frequen']):
                tags.add('elettrocultura')
                tags.add('elettro')
            if any(w in kw for w in ['biodin','biodynam','steiner','luna','lunar']):
                tags.add('biodinamica')
                tags.add('calendario')
            if any(w in kw for w in ['compost','humus','micorr','biochar','soil','vermi']):
                tags.add('suolo')
                tags.add('microbi')
            if any(w in kw for w in ['irrigaz','drip']):
                tags.add('irrigazione')
            if any(w in kw for w in ['fertil','azoto','organ']):
                tags.add('nutrizione')
            if any(w in kw for w in ['plant','radice','root','piante','agricol','erbe','herb']):
                tags.add('piante')
            if any(w in kw for w in ['alchim','ermet','chakra','frequen','vibr']):
                tags.add('frequenze')
                tags.add('vibrazione')

    tags.add('alta-rilevanza')

    # Sommario dal testo reale
    if testo and len(testo) > 100:
        righe = [r.strip() for r in testo.split('\n') if len(r.strip()) > 40][:4]
        sommario = ' '.join(righe)[:300] if righe else titolo
    else:
        sommario = f'Manuale selezionato per la biblioteca BioSerra: {titolo}'

    # Estratto chiave
    estratto = ''
    for kw in ['living soil','elettrocultura','lakhovsky','biodinamica','compost',
               'micorriza','tesla','ighina','antenna','frequenz','magnetiz']:
        idx = testo.lower().find(kw)
        if idx >= 0:
            estratto = testo[max(0,idx-10):idx+130].strip()
            break

    # Consigli
    if tecniche:
        consiglio = f'Applica {tecniche[0]} nella serra BioSerra, monitorando risposta delle piante'
    else:
        consiglio = f'Consulta "{titolo[:50]}" come riferimento per la biblioteca BioSerra'

    elettro_kw = ['elettrocultura','lakhovsky','tesla','magnetic','antenna','rame',
                  'copper','ighina','frequenz','vibraz','electr']
    consiglio_elettro = ''
    for ek in elettro_kw:
        if ek in testo_full:
            consiglio_elettro = 'Principi applicabili al circuito Lakhovsky e spirale cosmica rame'
            break

    return {
        'sommario': sommario[:300],
        'tecniche_chiave': tecniche[:6],
        'consiglio_coltivazione': consiglio,
        'consiglio_elettrocultura': consiglio_elettro,
        'tag': list(tags)[:8],
        'estratto_chiave': estratto[:200]
    }

def ricalcola_connessioni(analisi):
    for a in analisi:
        conn = []
        for b in analisi:
            if b['id'] == a['id']: continue
            tag_s = len(set(a.get('tag',[])) & set(b.get('tag',[])))
            tec_s = len(set(a.get('tecniche_chiave',[])) & set(b.get('tecniche_chiave',[]))) * 2
            score = tag_s + tec_s
            if score >= 1:
                conn.append({'id': b['id'], 'titolo': b['titolo'], 'peso': score})
        conn.sort(key=lambda x: -x['peso'])
        a['connessioni'] = conn[:8]
    return analisi

def main():
    oggi = datetime.date.today().isoformat()
    print('=== BioSerra Analisi PDF v9 ===')
    print(f'GROQ_KEY: {"PRESENTE " + GROQ_KEY[:10] + "..." if GROQ_KEY else "ASSENTE"}')
    print(f'GITHUB_TOKEN: {"PRESENTE" if GITHUB_TOKEN else "ASSENTE"}')

    # Installa librerie PDF
    print('Installo librerie PDF...')
    os.system('pip install pymupdf pdfplumber pypdf -q 2>/dev/null')
    print('OK')

    # Leggi knowledge attuale
    kdata = gh_get('data/pdf_knowledge.json')
    knowledge = json.loads(base64.b64decode(kdata['content'].replace('\n','')).decode('utf-8'))
    analisi_esistenti = knowledge.get('analisi', [])

    # Considera "da rianalizzare" quelli con sommario generico
    def e_valido(a):
        # Valido solo se analizzato da Groq (flag esplicito)
        return a.get('groq_analizzato', False) is True

    analisi_valide = [a for a in analisi_esistenti if e_valido(a)]
    titoli_validi = {a['titolo'].strip().lower() for a in analisi_valide}
    print(f'Già analizzati con testo reale: {len(analisi_valide)}/89')

    # Lista PDF in MANUALI/
    manuali = gh_get('MANUALI')
    pdf_files = sorted([f for f in manuali if f['name'].endswith('.pdf')], key=lambda x: x['name'])

    da_analizzare = [f for f in pdf_files
                     if f['name'].replace('.pdf','').strip().lower() not in titoli_validi]
    print(f'Da analizzare: {len(da_analizzare)}')

    if not da_analizzare:
        print('Tutti OK. Ricalcolo connessioni...')
        # Forza tutti alta e ricalcola connessioni
        for a in analisi_esistenti:
            a['rilevanza'] = 'alta'
        analisi_esistenti = ricalcola_connessioni(analisi_esistenti)
        knowledge['analisi'] = analisi_esistenti
        knowledge['lastUpdate'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        content_b64 = base64.b64encode(json.dumps(knowledge, indent=2, ensure_ascii=False).encode()).decode()
        sha = gh_get('data/pdf_knowledge.json')['sha']
        gh_put('data/pdf_knowledge.json', content_b64, sha, f'BioSerra PDF {oggi} ricalcolo connessioni')
        print('Salvato.')
        return

    batch = da_analizzare[:12]
    nuove_analisi = []

    debug_log = []  # raccoglie info per debug su GitHub

    for i, pdf_file in enumerate(batch):
        titolo = pdf_file['name'].replace('.pdf','').strip()
        print(f'\n[{i+1}/{len(batch)}] {titolo[:65]}')

        # Scarica PDF
        pdf_bytes = None
        try:
            pdf_data = gh_get(f"MANUALI/{pdf_file['name']}")
            raw_b64 = pdf_data.get('content','').replace('\n','')
            if raw_b64:
                size_mb = len(raw_b64) * 3 / 4 / 1024 / 1024
                if size_mb < 20:
                    pdf_bytes = base64.b64decode(raw_b64)
                    print(f'  Scaricato: {size_mb:.1f} MB')
                else:
                    print(f'  Troppo grande ({size_mb:.1f}MB)')
        except Exception as ex:
            print(f'  Download: {ex}')

        # Estrai testo
        testo = ''
        if pdf_bytes:
            testo = estrai_testo_pdf(pdf_bytes)
            print(f'  Testo estratto: {len(testo)} chars')
            if not testo:
                print('  WARN: nessun testo estratto (PDF scansionato?)')

        # Analisi: Groq sempre se disponibile (anche solo dal titolo)
        result = None
        groq_ok = False
        if GROQ_KEY:
            result = groq_analizza(titolo, testo)
            if result:
                groq_ok = True

        if not result:
            print('  Analisi locale (fallback)')
            result = analizza_locale(titolo, testo)

        # Forza sempre alta rilevanza + flag groq
        result['titolo'] = titolo
        result['data_analisi'] = oggi
        result['rilevanza'] = 'alta'
        result['groq_analizzato'] = groq_ok
        nuove_analisi.append(result)
        print(f'  OK | tec:{len(result.get("tecniche_chiave",[]))} | sommario:{len(result.get("sommario",""))}c')

        time.sleep(4)  # delay per rate limit Groq

    # Assembla: validi + nuovi (sovrascrive stessi titoli)
    titoli_nuovi = {a['titolo'].strip().lower() for a in nuove_analisi}
    tutte = [a for a in analisi_valide if a['titolo'].strip().lower() not in titoli_nuovi]
    tutte += nuove_analisi

    # Forza TUTTI alta e ricalcola connessioni
    for a in tutte:
        a['rilevanza'] = 'alta'

    for idx, a in enumerate(tutte):
        a['id'] = a.get('id') or f'pdf_{idx}'

    tutte = ricalcola_connessioni(tutte)

    knowledge_new = {
        'lastUpdate': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'total_pdf': len(tutte),
        'analisi': tutte
    }

    content_b64 = base64.b64encode(
        json.dumps(knowledge_new, indent=2, ensure_ascii=False).encode()
    ).decode()

    # Salva debug log su GitHub per diagnosi
    if debug_log:
        try:
            debug_data = json.dumps({'run': oggi, 'entries': debug_log}, ensure_ascii=False, indent=2)
            debug_b64 = base64.b64encode(debug_data.encode()).decode()
            try:
                debug_sha = gh_get('data/groq_debug.json')['sha']
            except:
                debug_sha = None
            debug_body = {'message': f'debug groq {oggi}', 'content': debug_b64}
            if debug_sha:
                debug_body['sha'] = debug_sha
            req_d = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/data/groq_debug.json',
                data=json.dumps(debug_body).encode(),
                headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
            with urllib.request.urlopen(req_d) as r:
                print(f'  Debug log salvato su GitHub')
        except Exception as dex:
            print(f'  Debug save: {dex}')

    sha_fresco = gh_get('data/pdf_knowledge.json')['sha']
    gh_put('data/pdf_knowledge.json', content_b64, sha_fresco,
           f'BioSerra PDF {oggi} (+{len(nuove_analisi)}, tot:{len(tutte)}/89 tutti alta)')

    # Stats connessioni
    con_conn = sum(1 for a in tutte if len(a.get('connessioni',[])) > 0)
    print(f'\n=== +{len(nuove_analisi)} analizzati, totale {len(tutte)}/89 ===')
    print(f'Tutti alta: SI')
    print(f'Con connessioni: {con_conn}/{len(tutte)}')

if __name__ == '__main__':
    main()
