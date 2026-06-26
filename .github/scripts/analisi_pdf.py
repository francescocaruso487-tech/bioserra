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
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        testo = []
        for page in reader.pages[:10]:
            t = page.extract_text()
            if t:
                testo.append(t.strip())
        risultato = '\n'.join(testo)[:4000]
        return risultato
    except Exception as ex:
        print(f'  pypdf errore: {ex}')
        return ''

def groq_analizza(titolo, testo):
    print(f'  GROQ_KEY: {"OK " + GROQ_KEY[:8] if GROQ_KEY else "ASSENTE"}')
    if not GROQ_KEY:
        print('  ERRORE: GROQ_KEY non impostata')
        return None

    if testo and len(testo) > 100:
        contenuto = f'Testo estratto:\n\n{testo[:3000]}'
    else:
        contenuto = f'(PDF non leggibile, analizza dal titolo)'

    prompt = (
        f'Sei un esperto di Living Soil, biodinamica ed elettrocultura per coltivazione outdoor italiana.\n'
        f'Analizza "{titolo}" e trova connessioni pratiche con la serra BioSerra Caserta.\n'
        f'Tecniche attive: Lakhovsky, pila Fe-Cu, acqua magnetizzata, spirale rame, antenna terra.\n\n'
        f'{contenuto}\n\n'
        f'Rispondi SOLO con JSON, nessun testo fuori:\n'
        f'{{"sommario":"2 frasi contenuto","tecniche_chiave":["tecnica1","tecnica2"],'
        f'"consiglio_coltivazione":"azione concreta","consiglio_elettrocultura":"connessione o stringa vuota",'
        f'"tag":["tag1","tag2"],"rilevanza":"alta|media|bassa","estratto_chiave":"max 150 char"}}'
    )

    body = json.dumps({
        'model': 'llama-3.3-70b-versatile',
        'max_tokens': 600,
        'temperature': 0.1,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()

    for tentativo in range(3):
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
            print(f'  Groq OK ({len(content)} chars): {content[:80]}')
            s, e = content.find('{'), content.rfind('}')
            if s >= 0 and e > s:
                return json.loads(content[s:e+1])
            print(f'  WARN JSON non trovato')
            return None
        except urllib.error.HTTPError as ex:
            err = ex.read().decode()
            print(f'  Groq HTTP {ex.code} (tentativo {tentativo+1}): {err[:200]}')
            if ex.code == 429:
                print('  Rate limit — aspetto 30s')
                time.sleep(30)
            else:
                return None
        except Exception as ex:
            print(f'  Groq errore: {ex}')
            return None
    return None

def main():
    oggi = datetime.date.today().isoformat()
    print('=== BioSerra Analisi PDF v7 ===')
    print(f'GROQ_KEY: {"presente (" + GROQ_KEY[:8] + "...)" if GROQ_KEY else "ASSENTE — ERRORE"}')

    if not GROQ_KEY:
        print('ERRORE CRITICO: GROQ_KEY non impostata')
        sys.exit(1)

    # Installa pypdf
    os.system('pip install pypdf -q --break-system-packages 2>/dev/null || pip install pypdf -q')

    # Leggi knowledge
    print('Leggo pdf_knowledge.json...')
    kdata = gh_get('data/pdf_knowledge.json')
    decoded = base64.b64decode(kdata['content'].replace('\n','')).decode('utf-8')
    knowledge = json.loads(decoded)
    analisi_esistenti = knowledge.get('analisi', [])
    print(f'Gia analizzati: {len(analisi_esistenti)}')

    # Filtra solo quelli con sommario reale (esclude "Analisi non disponibile")
    analisi_valide = [a for a in analisi_esistenti if a.get('sommario','') != 'Analisi non disponibile']
    analisi_invalide = [a for a in analisi_esistenti if a.get('sommario','') == 'Analisi non disponibile']
    print(f'Validi: {len(analisi_valide)} | Da rianalizzare: {len(analisi_invalide)}')

    titoli_validi = {a['titolo'].strip().lower() for a in analisi_valide}

    # Lista PDF in MANUALI/
    manuali = gh_get('MANUALI')
    pdf_files = sorted([f for f in manuali if f['name'].endswith('.pdf')], key=lambda x: x['name'])
    print(f'PDF in MANUALI/: {len(pdf_files)}')

    # Da analizzare: non validi + nuovi
    da_analizzare = [f for f in pdf_files
                     if f['name'].replace('.pdf','').strip().lower() not in titoli_validi]
    print(f'Da analizzare (nuovi + falliti): {len(da_analizzare)}')

    if not da_analizzare:
        print('Tutti i PDF gia analizzati correttamente.')
        return

    # Batch piccolo: 8 per run (evita rate limit Groq)
    batch = da_analizzare[:8]
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
                print(f'  PDF: {size_mb:.1f} MB')
                if size_mb < 15:
                    pdf_bytes = base64.b64decode(raw_b64)
                else:
                    print('  Troppo grande, uso solo titolo')
        except Exception as ex:
            print(f'  Download fallito: {ex}')

        # Estrai testo
        testo = ''
        if pdf_bytes:
            testo = estrai_testo_pdf(pdf_bytes)
            print(f'  Testo estratto: {len(testo)} chars')

        # Analizza
        result = groq_analizza(titolo, testo)

        if result:
            result['titolo'] = titolo
            result['data_analisi'] = oggi
            nuove_analisi.append(result)
            print(f'  OK: [{result.get("rilevanza","?")}] tec:{len(result.get("tecniche_chiave",[]))}')
        else:
            print(f'  FALLITO — salto questo PDF')

        # Delay generoso tra chiamate
        time.sleep(5)

    if not nuove_analisi:
        print('\nNessuna analisi riuscita — verifica GROQ_KEY su GitHub Secrets')
        sys.exit(1)

    # Assembla: validi + nuovi (escludi invalidi rimpiazzati)
    titoli_nuovi = {a['titolo'].strip().lower() for a in nuove_analisi}
    tutte = [a for a in analisi_valide if a['titolo'].strip().lower() not in titoli_nuovi]
    tutte += nuove_analisi

    for idx, a in enumerate(tutte):
        a['id'] = a.get('id') or f'pdf_{idx}'

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
           f'BioSerra PDF {oggi} (+{len(nuove_analisi)}, validi:{len(tutte)}/89)')

    print(f'\n=== COMPLETATO: +{len(nuove_analisi)} analizzati, totale validi: {len(tutte)}/89 ===')
    rils = {}
    for a in nuove_analisi:
        r = a.get('rilevanza','bassa')
        rils[r] = rils.get(r,0)+1
    for r, c in sorted(rils.items()):
        print(f'  {r}: {c}')

if __name__ == '__main__':
    main()
