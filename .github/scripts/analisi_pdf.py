import os, json, base64, urllib.request, urllib.error, time, datetime, sys, io

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
GROQ_KEY = os.environ['GROQ_KEY']
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
    """Estrae testo dal PDF con pypdf"""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        testo = []
        for page in reader.pages[:15]:  # max 15 pagine
            t = page.extract_text()
            if t:
                testo.append(t.strip())
        return '\n'.join(testo)[:6000]  # max 6000 chars a Groq
    except Exception as ex:
        print(f'  pypdf errore: {ex}')
        return ''

def groq_analizza(titolo, testo):
    """Analizza con Groq usando testo estratto dal PDF"""
    if testo and len(testo) > 100:
        contenuto = f'Testo estratto dal PDF:\n\n{testo}'
    else:
        contenuto = f'PDF non leggibile — analizza dal titolo: {titolo}'

    prompt = (
        f'Sei un esperto di agricoltura biodinamica, Living Soil ed elettrocultura per coltivazione outdoor italiana.\n\n'
        f'Analizza questo documento "{titolo}" e trova connessioni pratiche con la coltivazione Living Soil outdoor a Caserta.\n\n'
        f'Contesto serra: piante outdoor in vasi Living Soil water-only, tecniche elettrocultura attive: '
        f'circuito Lakhovsky, pila galvanica Fe-Cu, acqua magnetizzata, spirale cosmica rame, antenna terra, pantacolo rame. '
        f'Metodo biodinamico Steiner/Thun/Masson/Pistis.\n\n'
        f'{contenuto}\n\n'
        f'Rispondi SOLO con JSON valido, nessun testo fuori:\n'
        f'{{"titolo":"{titolo}",'
        f'"sommario":"2-3 frasi sul contenuto reale del documento",'
        f'"tecniche_chiave":["tecnica pratica applicabile 1","tecnica 2","tecnica 3"],'
        f'"consiglio_coltivazione":"1 azione concreta da fare in serra",'
        f'"consiglio_elettrocultura":"connessione con elettrocultura o biodinamica se presente nel testo, altrimenti stringa vuota",'
        f'"tag":["tag1","tag2","tag3"],'
        f'"rilevanza":"alta|media|bassa",'
        f'"estratto_chiave":"frase o concetto piu rilevante max 200 caratteri"}}'
    )

    body = json.dumps({
        'model': 'llama-3.3-70b-versatile',
        'max_tokens': 800,
        'temperature': 0.2,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()

    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {GROQ_KEY}', 'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.load(r)
        content = resp['choices'][0]['message']['content']
        s, e = content.find('{'), content.rfind('}')
        if s >= 0 and e > s:
            return json.loads(content[s:e+1])
        print(f'  WARN: JSON non trovato: {content[:150]}')
        return None
    except urllib.error.HTTPError as ex:
        err = ex.read().decode()
        print(f'  Groq HTTP {ex.code}: {err[:200]}')
        return None
    except Exception as ex:
        print(f'  Groq errore: {ex}')
        return None

def main():
    oggi = datetime.date.today().isoformat()
    print('=== BioSerra Analisi PDF v6 (pypdf + Groq) ===')

    # Installa pypdf se non presente
    print('Installo pypdf...')
    os.system('pip install pypdf -q')
    print('pypdf pronto')

    # Leggi knowledge attuale
    print('Leggo pdf_knowledge.json...')
    kdata = gh_get('data/pdf_knowledge.json')
    decoded = base64.b64decode(kdata['content'].replace('\n','')).decode('utf-8')
    knowledge = json.loads(decoded)
    analisi_esistenti = knowledge.get('analisi', [])
    print(f'Gia analizzati: {len(analisi_esistenti)}')

    titoli_analizzati = {a['titolo'].strip().lower() for a in analisi_esistenti}

    # Lista PDF in MANUALI/
    print('Leggo MANUALI/...')
    manuali = gh_get('MANUALI')
    pdf_files = sorted(
        [f for f in manuali if f['name'].endswith('.pdf')],
        key=lambda x: x['name']
    )
    print(f'PDF totali in MANUALI/: {len(pdf_files)}')

    da_analizzare = [f for f in pdf_files
                     if f['name'].replace('.pdf','').strip().lower() not in titoli_analizzati]
    print(f'Da analizzare: {len(da_analizzare)}')

    if not da_analizzare:
        print('Tutti i PDF gia analizzati.')
        return

    batch = da_analizzare[:15]
    nuove_analisi = []

    for i, pdf_file in enumerate(batch):
        titolo = pdf_file['name'].replace('.pdf','').strip()
        print(f'\n[{i+1}/{len(batch)}] {titolo[:65]}')

        # Scarica PDF bytes
        pdf_bytes = None
        try:
            pdf_data = gh_get(f"MANUALI/{pdf_file['name']}")
            raw_b64 = pdf_data.get('content','').replace('\n','')
            if raw_b64:
                pdf_bytes = base64.b64decode(raw_b64)
                print(f'  Scaricato: {len(pdf_bytes)/1024:.0f} KB')
        except Exception as ex:
            print(f'  Download fallito: {ex}')

        # Estrai testo
        testo = ''
        if pdf_bytes:
            testo = estrai_testo_pdf(pdf_bytes)
            print(f'  Testo estratto: {len(testo)} chars')
        else:
            print('  Nessun PDF — uso solo titolo')

        # Analizza con Groq
        result = groq_analizza(titolo, testo)

        if result:
            result['titolo'] = titolo
            result['data_analisi'] = oggi
            nuove_analisi.append(result)
            print(f'  OK: rilevanza={result.get("rilevanza","?")} | tecniche={len(result.get("tecniche_chiave",[]))}')
        else:
            nuove_analisi.append({
                'titolo': titolo, 'sommario': 'Analisi non disponibile',
                'tecniche_chiave': [], 'consiglio_coltivazione': '',
                'consiglio_elettrocultura': '', 'tag': [],
                'rilevanza': 'bassa', 'estratto_chiave': '', 'data_analisi': oggi
            })

        time.sleep(1.5)  # rate limit Groq

    # Assembla
    tutte = analisi_esistenti + nuove_analisi
    for idx, a in enumerate(tutte):
        a['id'] = a.get('id') or f'pdf_{idx}'

    # Connessioni per tag condivisi
    for a in tutte:
        conn = []
        for b in tutte:
            if b['id'] == a['id']: continue
            comuni = set(a.get('tag',[])) & set(b.get('tag',[]))
            if len(comuni) >= 2:
                conn.append({'id': b['id'], 'titolo': b['titolo'], 'peso': len(comuni)})
        conn.sort(key=lambda x: -x['peso'])
        a['connessioni'] = conn[:5]

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
           f'BioSerra PDF {oggi} (+{len(nuove_analisi)}, tot:{len(tutte)}/89)')

    print(f'\n=== COMPLETATO: +{len(nuove_analisi)} nuovi, totale {len(tutte)}/89 ===')
    rils = {}
    for a in nuove_analisi:
        r = a.get('rilevanza','bassa')
        rils[r] = rils.get(r,0) + 1
    for r, c in sorted(rils.items()):
        print(f'  {r}: {c}')

if __name__ == '__main__':
    main()
