import os, json, base64, urllib.request, urllib.error, time, datetime, sys, io

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
OPENROUTER_KEY = os.environ.get('OPENROUTER_KEY', '')
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
    """Prova fitz, pdfplumber, pypdf in sequenza."""
    testo = ''
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        pagine = []
        for i, page in enumerate(doc):
            if i >= 10: break
            t = page.get_text()
            if t and t.strip():
                pagine.append(t.strip())
        doc.close()
        testo = '\n'.join(pagine)
        if testo.strip():
            return testo[:3000]
    except Exception as ex:
        print(f'  fitz: {ex}')

    try:
        import pdfplumber
        pagine = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages):
                if i >= 10: break
                t = page.extract_text()
                if t:
                    pagine.append(t.strip())
        testo = '\n'.join(pagine)
        if testo.strip():
            return testo[:3000]
    except Exception as ex:
        print(f'  pdfplumber: {ex}')

    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pagine = []
        for i, page in enumerate(reader.pages):
            if i >= 10: break
            t = page.extract_text()
            if t:
                pagine.append(t.strip())
        testo = '\n'.join(pagine)
        if testo.strip():
            return testo[:3000]
    except Exception as ex:
        print(f'  pypdf: {ex}')

    return ''

def openrouter_analizza(titolo, testo):
    """Chiama OpenRouter — accessibile da GitHub Actions senza blocchi Cloudflare."""
    if not OPENROUTER_KEY:
        print('  SKIP: OPENROUTER_KEY non impostata')
        return None

    titolo_safe = titolo.replace('"', "'")[:80]
    contenuto = testo[:800] if len(testo) > 50 else '(PDF scansionato)'

    prompt = (
        'Sei un agronomo esperto di Living Soil, biodinamica ed elettrocultura per serra outdoor italiana.\n'
        'Analizza questo documento e trova connessioni pratiche per la coltivazione outdoor a Caserta.\n'
        'Tecniche elettrocultura attive: Lakhovsky, Fe-Cu, acqua magnetizzata, spirale rame, antenna terra.\n\n'
        'Titolo: ' + titolo_safe + '\n'
        'Contenuto: ' + contenuto + '\n\n'
        'Rispondi SOLO con JSON valido, niente altro:\n'
        '{"sommario":"2 frasi sul contenuto reale","tecniche_chiave":["tecnica1","tecnica2"],'
        '"consiglio_coltivazione":"azione pratica concreta","consiglio_elettrocultura":"",'
        '"tag":["tag1","tag2"],"estratto_chiave":"frase chiave max 150 char"}'
    )

    body_data = json.dumps({
        'model': 'meta-llama/llama-3.3-70b-instruct:free',
        'max_tokens': 400,
        'temperature': 0.0,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()

    print(f'  OpenRouter...')
    try:
        req_g = urllib.request.Request(
            'https://openrouter.ai/api/v1/chat/completions',
            data=body_data,
            headers={
                'Authorization': 'Bearer ' + OPENROUTER_KEY,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://francescocaruso487-tech.github.io/bioserra',
                'X-Title': 'BioSerra'
            },
            method='POST'
        )
        with urllib.request.urlopen(req_g, timeout=30) as r:
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
        print(f'  Nessun JSON')
        return None

    try:
        result = json.loads(raw[s:e+1])
        print(f'  OK: sommario={len(result.get("sommario",""))}c tec={len(result.get("tecniche_chiave",[]))}')
        return result
    except json.JSONDecodeError as ex:
        print(f'  JSON decode: {ex}')
        return None

def analizza_locale(titolo, testo):
    """Fallback locale con keyword matching."""
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
        'ermet': ('Principi ermetici', 'altro'),
        'alchim': ('Alchimia', 'altro'),
        'plant': ('Fisiologia vegetale', 'suolo'),
        'piante': ('Fisiologia vegetale', 'suolo'),
    }

    testo_full = (titolo + ' ' + testo).lower()
    tecniche = []
    tags = set()

    for kw, (tec, tag) in KW.items():
        if kw in testo_full and tec not in tecniche:
            tecniche.append(tec)
            tags.add(tag)

    tags.add('alta-rilevanza')

    if testo and len(testo) > 100:
        righe = [r.strip() for r in testo.split('\n') if len(r.strip()) > 40][:3]
        sommario = ' '.join(righe)[:250] if righe else f'Manuale: {titolo}'
    else:
        sommario = f'Manuale selezionato per la biblioteca BioSerra: {titolo}'

    estratto = ''
    for kw in ['living soil', 'elettrocultura', 'lakhovsky', 'biodinamica', 'compost', 'tesla', 'ighina']:
        idx = testo_full.find(kw)
        if idx >= 0:
            estratto = testo[max(0, idx-10):idx+130].strip()
            break

    consiglio = f'Applica {tecniche[0]} nella serra BioSerra' if tecniche else f'Consulta: {titolo[:50]}'
    elettro_kw = ['elettro', 'electro', 'lakhov', 'tesla', 'magnet', 'antenna', 'rame', 'copper', 'ighina', 'frequen']
    consiglio_elettro = 'Principi applicabili al circuito Lakhovsky e spirale cosmica rame' if any(k in testo_full for k in elettro_kw) else ''

    return {
        'sommario': sommario[:300],
        'tecniche_chiave': tecniche[:5],
        'consiglio_coltivazione': consiglio,
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
    print('=== BioSerra Analisi PDF v10 (OpenRouter) ===')
    print(f'OPENROUTER_KEY: {"PRESENTE " + OPENROUTER_KEY[:15] + "..." if OPENROUTER_KEY else "ASSENTE"}')

    os.system('pip install pymupdf pdfplumber pypdf -q 2>/dev/null')

    # Leggi knowledge via API (no cache)
    kdata = gh_get('data/pdf_knowledge.json')
    knowledge = json.loads(base64.b64decode(kdata['content'].replace('\n', '')).decode('utf-8'))
    analisi_esistenti = knowledge.get('analisi', [])

    # Validi = analizzati da OpenRouter (flag or_analizzato)
    analisi_valide = [a for a in analisi_esistenti if a.get('or_analizzato') is True]
    titoli_validi = {a['titolo'].strip().lower() for a in analisi_valide}
    print(f'Gia analizzati con OpenRouter: {len(analisi_valide)}/89')

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
        analisi_esistenti = ricalcola_connessioni(analisi_esistenti)
        knowledge['analisi'] = analisi_esistenti
        knowledge['lastUpdate'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        content_b64 = base64.b64encode(json.dumps(knowledge, indent=2, ensure_ascii=False).encode()).decode()
        sha = gh_get('data/pdf_knowledge.json')['sha']
        gh_put('data/pdf_knowledge.json', content_b64, sha, f'BioSerra PDF {oggi} ricalcolo connessioni')
        return

    batch = da_analizzare[:10]
    nuove = []

    for i, pdf_file in enumerate(batch):
        titolo = pdf_file['name'].replace('.pdf', '').strip()
        print(f'\n[{i+1}/{len(batch)}] {titolo[:65]}')

        # Scarica PDF
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
                    print(f'  PDF troppo grande ({size_mb:.1f}MB)')
        except Exception as ex:
            print(f'  Download: {ex}')

        # Estrai testo
        testo = estrai_testo(pdf_bytes) if pdf_bytes else ''
        print(f'  Testo: {len(testo)} chars')

        # Analisi OpenRouter, fallback locale
        result = openrouter_analizza(titolo, testo) if OPENROUTER_KEY else None
        or_ok = result is not None

        if not result:
            print('  Fallback locale')
            result = analizza_locale(titolo, testo)

        result['titolo'] = titolo
        result['data_analisi'] = oggi
        result['rilevanza'] = 'alta'
        result['or_analizzato'] = or_ok
        nuove.append(result)
        print(f'  [{"OR" if or_ok else "loc"}] sommario:{len(result.get("sommario",""))}c tec:{len(result.get("tecniche_chiave",[]))}')

        time.sleep(3)

    # Assembla
    titoli_nuovi = {a['titolo'].strip().lower() for a in nuove}
    tutte = [a for a in analisi_valide if a['titolo'].strip().lower() not in titoli_nuovi]
    tutte += nuove

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
    gh_put('data/pdf_knowledge.json', content_b64, sha_fresco,
           f'BioSerra PDF {oggi} (+{len(nuove)} OR:{sum(1 for a in nuove if a.get("or_analizzato"))}, tot:{len(tutte)}/89)')

    or_ok_count = sum(1 for a in tutte if a.get('or_analizzato'))
    con_conn = sum(1 for a in tutte if len(a.get('connessioni', [])) > 0)
    print(f'\n=== +{len(nuove)} analizzati | tot:{len(tutte)}/89 | OR:{or_ok_count} | conn:{con_conn} ===')

if __name__ == '__main__':
    main()
