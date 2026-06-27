import os, json, base64, urllib.request, urllib.error, time, datetime, sys, io

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
MISTRAL_KEY = os.environ.get('MISTRAL_KEY', '')
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
        data=body, headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def estrai_testo(pdf_bytes):
    testo = ''
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        pagine = [page.get_text().strip() for i, page in enumerate(doc) if i < 10]
        doc.close()
        testo = '\n'.join(p for p in pagine if p)
        if testo.strip(): return testo[:3000]
    except Exception as ex:
        print(f'  fitz: {ex}')
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pagine = [page.extract_text() or '' for i, page in enumerate(pdf.pages) if i < 10]
        testo = '\n'.join(p.strip() for p in pagine if p.strip())
        if testo.strip(): return testo[:3000]
    except Exception as ex:
        print(f'  pdfplumber: {ex}')
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pagine = [page.extract_text() or '' for i, page in enumerate(reader.pages) if i < 10]
        testo = '\n'.join(p.strip() for p in pagine if p.strip())
        if testo.strip(): return testo[:3000]
    except Exception as ex:
        print(f'  pypdf: {ex}')
    return ''

def mistral_analizza(titolo, testo):
    if not MISTRAL_KEY:
        print('  SKIP: MISTRAL_KEY assente')
        return None

    titolo_safe = titolo.replace('"', "'")[:80]
    contenuto = testo[:800] if len(testo) > 50 else '(PDF scansionato, analizza dal titolo)'

    prompt = (
        'Sei un agronomo esperto di Living Soil, biodinamica ed elettrocultura per serra outdoor italiana.\n'
        'Analizza questo documento per la serra BioSerra Caserta.\n'
        'Tecniche attive: Lakhovsky, Fe-Cu, acqua magnetizzata, spirale rame, antenna terra.\n\n'
        'Titolo: ' + titolo_safe + '\n'
        'Contenuto: ' + contenuto + '\n\n'
        'Rispondi SOLO con JSON valido, niente testo fuori:\n'
        '{"sommario":"2 frasi sul contenuto reale","tecniche_chiave":["tecnica1","tecnica2"],'
        '"consiglio_coltivazione":"azione pratica concreta","consiglio_elettrocultura":"",'
        '"tag":["tag1","tag2"],"estratto_chiave":"frase chiave max 150 char"}'
    )

    body_data = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': 400,
        'temperature': 0.0,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()

    print('  Mistral...')
    try:
        req_m = urllib.request.Request(
            'https://api.mistral.ai/v1/chat/completions',
            data=body_data,
            headers={'Authorization': 'Bearer ' + MISTRAL_KEY, 'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req_m, timeout=30) as r:
            resp = json.loads(r.read())
    except urllib.error.HTTPError as ex:
        print(f'  HTTP {ex.code}: {ex.read().decode()[:200]}')
        return None
    except Exception as ex:
        print(f'  Errore: {type(ex).__name__}: {ex}')
        return None

    raw = resp['choices'][0]['message']['content'].strip()
    print(f'  Raw ({len(raw)}c): {repr(raw[:200])}')

    s = raw.find('{')
    e = raw.rfind('}')
    if s < 0 or e <= s:
        print('  Nessun JSON trovato')
        return None
    try:
        result = json.loads(raw[s:e+1])
        print(f'  OK: sommario={len(result.get("sommario",""))}c tec={len(result.get("tecniche_chiave",[]))}')
        return result
    except json.JSONDecodeError as ex:
        print(f'  JSON decode: {ex}')
        return None

def analizza_locale(titolo, testo):
    KW = {
        'compost': ('Compostaggio', 'suolo'),
        'humus': ('Humus', 'suolo'),
        'micorriza': ('Micorrize', 'suolo'),
        'mycorrhiz': ('Micorrize', 'suolo'),
        'biochar': ('Biochar', 'suolo'),
        'vermicompost': ('Vermicompostaggio', 'suolo'),
        'elettrocoltura': ('Elettrocultura', 'elettrocultura'),
        'electroculture': ('Elettrocultura', 'elettrocultura'),
        'electro': ('Elettrocultura', 'elettrocultura'),
        'lakhovsky': ('Circuito Lakhovsky', 'elettrocultura'),
        'rame': ('Spirale cosmica rame', 'elettrocultura'),
        'copper': ('Rame in coltivazione', 'elettrocultura'),
        'magnetiz': ('Acqua magnetizzata', 'elettrocultura'),
        'antenna': ('Antenna terrestre', 'elettrocultura'),
        'biodinamic': ('Biodinamica', 'biodinamica'),
        'biodynamic': ('Biodinamica', 'biodinamica'),
        'steiner': ('Metodo Steiner', 'biodinamica'),
        'luna': ('Calendario lunare', 'biodinamica'),
        'living soil': ('Living Soil', 'suolo'),
        'soil biology': ('Biologia del suolo', 'suolo'),
        'tesla': ('Principi Tesla', 'elettrocultura'),
        'ighina': ('Atomo magnetico Ighina', 'elettrocultura'),
        'frequenz': ('Frequenze vibrazionali', 'biodinamica'),
        'frequency': ('Frequenze', 'biodinamica'),
        'agricol': ('Tecniche agricole', 'suolo'),
        'organic': ('Agricoltura organica', 'suolo'),
        'irrigaz': ('Irrigazione', 'irrigazione'),
        'fertil': ('Fertilizzazione', 'nutrizione'),
        'plant': ('Fisiologia vegetale', 'suolo'),
        'piante': ('Fisiologia vegetale', 'suolo'),
        'ermet': ('Principi ermetici', 'altro'),
        'alchim': ('Alchimia', 'altro'),
    }
    testo_full = (titolo + ' ' + testo).lower()
    tecniche, tags = [], set()
    for kw, (tec, tag) in KW.items():
        if kw in testo_full and tec not in tecniche:
            tecniche.append(tec)
            tags.add(tag)
    tags.add('alta-rilevanza')

    if testo and len(testo) > 100:
        righe = [r.strip() for r in testo.split('\n') if len(r.strip()) > 40][:3]
        sommario = ' '.join(righe)[:250] if righe else f'Manuale: {titolo}'
    else:
        sommario = f'Manuale biblioteca BioSerra: {titolo}'

    estratto = ''
    for kw in ['living soil', 'elettrocultura', 'lakhovsky', 'tesla', 'ighina', 'biodinamica']:
        idx = testo_full.find(kw)
        if idx >= 0:
            estratto = testo[max(0, idx-10):idx+130].strip()
            break

    elettro_kw = ['elettro', 'electro', 'lakhov', 'tesla', 'magnet', 'antenna', 'rame', 'copper', 'ighina', 'frequen']
    consiglio_elettro = 'Principi applicabili al circuito Lakhovsky e spirale cosmica rame' if any(k in testo_full for k in elettro_kw) else ''

    return {
        'sommario': sommario[:300],
        'tecniche_chiave': tecniche[:5],
        'consiglio_coltivazione': f'Applica {tecniche[0]} in serra' if tecniche else f'Consulta: {titolo[:50]}',
        'consiglio_elettrocultura': consiglio_elettro,
        'tag': list(tags)[:6],
        'estratto_chiave': estratto[:200]
    }

def ricalcola_connessioni(analisi):
    for a in analisi:
        conn = []
        for b in analisi:
            if b['id'] == a['id']: continue
            tag_s = len(set(a.get('tag', [])) & set(b.get('tag', [])))
            tec_s = len(set(a.get('tecniche_chiave', [])) & set(b.get('tecniche_chiave', []))) * 2
            score = tag_s + tec_s
            if score >= 1:
                conn.append({'id': b['id'], 'titolo': b['titolo'], 'peso': score})
        conn.sort(key=lambda x: -x['peso'])
        a['connessioni'] = conn[:8]
    return analisi

def main():
    oggi = datetime.date.today().isoformat()
    print('=== BioSerra Analisi PDF v11 (Mistral chat) ===')
    print(f'MISTRAL_KEY: {"PRESENTE " + MISTRAL_KEY[:10] + "..." if MISTRAL_KEY else "ASSENTE"}')

    os.system('pip install pymupdf pdfplumber pypdf -q 2>/dev/null')

    kdata = gh_get('data/pdf_knowledge.json')
    knowledge = json.loads(base64.b64decode(kdata['content'].replace('\n', '')).decode('utf-8'))
    analisi_esistenti = knowledge.get('analisi', [])

    # Validi = analizzati da Mistral
    analisi_valide = [a for a in analisi_esistenti if a.get('mistral_analizzato') is True]
    titoli_validi = {a['titolo'].strip().lower() for a in analisi_valide}
    print(f'Gia analizzati con Mistral: {len(analisi_valide)}/89')

    manuali = gh_get('MANUALI')
    pdf_files = sorted([f for f in manuali if f['name'].endswith('.pdf')], key=lambda x: x['name'])
    print(f'PDF in MANUALI/: {len(pdf_files)}')

    da_analizzare = [f for f in pdf_files
                     if f['name'].replace('.pdf', '').strip().lower() not in titoli_validi]
    print(f'Da analizzare: {len(da_analizzare)}')

    if not da_analizzare:
        print('Tutti analizzati — ricalcolo connessioni')
        for a in analisi_esistenti:
            a['rilevanza'] = 'alta'
        knowledge['analisi'] = ricalcola_connessioni(analisi_esistenti)
        knowledge['lastUpdate'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        content_b64 = base64.b64encode(json.dumps(knowledge, indent=2, ensure_ascii=False).encode()).decode()
        sha = gh_get('data/pdf_knowledge.json')['sha']
        gh_put('data/pdf_knowledge.json', content_b64, sha, f'BioSerra PDF {oggi} connessioni')
        print('Salvato.')
        return

    batch = da_analizzare[:10]
    nuove = []

    for i, pdf_file in enumerate(batch):
        titolo = pdf_file['name'].replace('.pdf', '').strip()
        print(f'\n[{i+1}/{len(batch)}] {titolo[:65]}')

        pdf_bytes = None
        try:
            pdf_data = gh_get(f"MANUALI/{pdf_file['name']}")
            raw_b64 = pdf_data.get('content', '').replace('\n', '')
            if raw_b64:
                size_mb = len(raw_b64) * 3 / 4 / 1024 / 1024
                if size_mb < 20:
                    pdf_bytes = base64.b64decode(raw_b64)
                    print(f'  PDF: {size_mb:.1f} MB')
                else:
                    print(f'  Troppo grande ({size_mb:.1f}MB)')
        except Exception as ex:
            print(f'  Download: {ex}')

        testo = estrai_testo(pdf_bytes) if pdf_bytes else ''
        print(f'  Testo: {len(testo)} chars')

        result = mistral_analizza(titolo, testo) if MISTRAL_KEY else None
        mistral_ok = result is not None

        if not result:
            print('  Fallback locale')
            result = analizza_locale(titolo, testo)

        result['titolo'] = titolo
        result['data_analisi'] = oggi
        result['rilevanza'] = 'alta'
        result['mistral_analizzato'] = mistral_ok
        nuove.append(result)
        print(f'  [{"Mistral" if mistral_ok else "locale"}] sommario:{len(result.get("sommario",""))}c tec:{len(result.get("tecniche_chiave",[]))}')

        time.sleep(2)

    titoli_nuovi = {a['titolo'].strip().lower() for a in nuove}
    tutte = [a for a in analisi_valide if a['titolo'].strip().lower() not in titoli_nuovi] + nuove

    for idx, a in enumerate(tutte):
        a['id'] = a.get('id') or f'pdf_{idx}'
        a['rilevanza'] = 'alta'

    tutte = ricalcola_connessioni(tutte)

    knowledge_new = {
        'lastUpdate': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'total_pdf': len(tutte),
        'analisi': tutte
    }

    content_b64 = base64.b64encode(json.dumps(knowledge_new, indent=2, ensure_ascii=False).encode()).decode()
    sha_fresco = gh_get('data/pdf_knowledge.json')['sha']
    mistral_count = sum(1 for a in nuove if a.get('mistral_analizzato'))
    gh_put('data/pdf_knowledge.json', content_b64, sha_fresco,
           f'BioSerra PDF {oggi} (+{len(nuove)} mistral:{mistral_count}, tot:{len(tutte)}/89)')

    con_conn = sum(1 for a in tutte if len(a.get('connessioni', [])) > 0)
    print(f'\n=== +{len(nuove)} | tot:{len(tutte)}/89 | Mistral:{mistral_count} | conn:{con_conn} ===')

if __name__ == '__main__':
    main()
