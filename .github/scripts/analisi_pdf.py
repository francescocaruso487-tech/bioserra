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
    if not GROQ_KEY:
        return None

    # Pulisci titolo da caratteri che rompono il JSON
    titolo_safe = titolo.replace('"', "'").replace('\\', '')[:80]
    contenuto = testo[:2500] if len(testo) > 100 else '(PDF scansionato, analizza dal titolo)'

    # Usa system+user separati per evitare problemi di parsing
    system_msg = (
        'Sei un esperto di Living Soil, biodinamica ed elettrocultura per serra outdoor italiana. '
        'Rispondi SEMPRE e SOLO con un oggetto JSON valido. '
        'Nessun testo prima o dopo il JSON. Nessun markdown. Solo il JSON grezzo.'
    )

    user_msg = (
        'Analizza questo documento per la serra BioSerra Caserta. '
        'Tecniche attive: Lakhovsky, Fe-Cu, acqua magnetizzata, spirale rame, antenna terra.\n\n'
        'Titolo: ' + titolo_safe + '\n\n'
        'Contenuto estratto:\n' + contenuto + '\n\n'
        'Rispondi con questo JSON (compila i valori reali):\n'
        '{"sommario":"descrizione del contenuto in 2 frasi","tecniche_chiave":["tecnica1","tecnica2"],'
        '"consiglio_coltivazione":"azione pratica concreta","consiglio_elettrocultura":"connessione o vuoto",'
        '"tag":["tag1","tag2"],"estratto_chiave":"frase chiave max 150 char"}'
    )

    body = json.dumps({
        'model': 'llama-3.3-70b-versatile',
        'max_tokens': 600,
        'temperature': 0.0,
        'messages': [
            {'role': 'system', 'content': system_msg},
            {'role': 'user', 'content': user_msg}
        ]
    }).encode()

    headers_groq = {
        'Authorization': 'Bearer ' + GROQ_KEY,
        'Content-Type': 'application/json'
    }

    for tentativo in range(3):
        try:
            req_g = urllib.request.Request(
                'https://api.groq.com/openai/v1/chat/completions',
                data=body, headers=headers_groq, method='POST'
            )
            with urllib.request.urlopen(req_g, timeout=30) as r:
                resp = json.load(r)
            raw = resp['choices'][0]['message']['content'].strip()
            print(f'  Groq risposta ({len(raw)}c): {raw[:80]}')

            # Parse robusto: cerca primo { e ultimo }
            s = raw.find('{')
            e = raw.rfind('}')
            if s < 0 or e <= s:
                print(f'  WARN: nessun JSON trovato')
                continue

            candidate = raw[s:e+1]
            result = json.loads(candidate)
            print(f'  Groq OK: sommario={len(result.get("sommario",""))}c tec={len(result.get("tecniche_chiave",[]))}')
            return result

        except json.JSONDecodeError as ex:
            print(f'  JSON decode err (tentativo {tentativo+1}): {ex} | raw={raw[:100] if "raw" in dir() else "N/A"}')
            time.sleep(3)
        except urllib.error.HTTPError as ex:
            err = ex.read().decode()
            print(f'  Groq HTTP {ex.code}: {err[:200]}')
            if ex.code == 429:
                print('  Rate limit — aspetto 30s')
                time.sleep(30)
            else:
                break
        except Exception as ex:
            print(f'  Groq errore: {ex}')
            time.sleep(3)

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
    print('=== BioSerra Analisi PDF v9 (fitz+pdfplumber+pypdf, tutti alta) ===')
    print(f'Groq: {"disponibile" if GROQ_KEY else "non configurato"}')

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
