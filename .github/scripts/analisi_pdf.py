import os, json, base64, urllib.request, urllib.error, time, datetime

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
ANTHROPIC_KEY = os.environ['ANTHROPIC_KEY']
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

def analizza_con_anthropic(titolo, pdf_b64):
    """Analizza PDF reale con Anthropic claude-sonnet-4-6 che supporta PDF base64"""
    prompt = (
        f'Analizza questo PDF "{titolo}" e trova connessioni pratiche con la coltivazione Living Soil outdoor a Caserta, Italia.\n\n'
        'Contesto: serra outdoor, piante in vasi Living Soil water-only, tecniche elettrocultura attive: '
        'circuito Lakhovsky, pila galvanica Fe-Cu, acqua magnetizzata, spirale cosmica rame, antenna terra, pantacolo rame. '
        'Metodo biodinamico Steiner/Thun/Masson.\n\n'
        'Rispondi SOLO con questo JSON valido, nessun testo fuori:\n'
        '{"titolo":"' + titolo + '",'
        '"sommario":"2-3 frasi sul contenuto reale del PDF",'
        '"tecniche_chiave":["tecnica pratica applicabile 1","tecnica 2","tecnica 3"],'
        '"consiglio_coltivazione":"1 azione concreta da fare in serra",'
        '"consiglio_elettrocultura":"connessione con elettrocultura o biodinamica se presente, altrimenti stringa vuota",'
        '"tag":["tag1","tag2","tag3"],'
        '"rilevanza":"alta|media|bassa",'
        '"estratto_chiave":"frase o concetto piu rilevante max 200 caratteri"}'
    )

    if pdf_b64:
        messages = [{
            'role': 'user',
            'content': [
                {
                    'type': 'document',
                    'source': {
                        'type': 'base64',
                        'media_type': 'application/pdf',
                        'data': pdf_b64
                    }
                },
                {'type': 'text', 'text': prompt}
            ]
        }]
    else:
        messages = [{'role': 'user', 'content': prompt + f'\n\n(PDF non disponibile, analizza dal titolo: {titolo})'}]

    body = json.dumps({
        'model': 'claude-sonnet-4-6',
        'max_tokens': 1000,
        'messages': messages
    }).encode()

    req = urllib.request.Request(
        'https://api.anthropic.com/v1/messages',
        data=body,
        headers={
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.load(r)
        content = resp['content'][0]['text']
        s, e = content.find('{'), content.rfind('}')
        if s >= 0 and e > s:
            return json.loads(content[s:e+1])
        print(f'  WARN: JSON non trovato in risposta: {content[:200]}')
        return None
    except urllib.error.HTTPError as ex:
        err = ex.read().decode()
        print(f'  Anthropic HTTP {ex.code}: {err[:300]}')
        return None
    except Exception as ex:
        print(f'  Errore Anthropic: {ex}')
        return None

def main():
    oggi = datetime.date.today().isoformat()
    print('=== BioSerra Analisi PDF v5 (Anthropic) ===')

    # Leggi knowledge attuale
    print('Leggo pdf_knowledge.json...')
    kdata = gh_get('data/pdf_knowledge.json')
    decoded = base64.b64decode(kdata['content'].replace('\n','')).decode('utf-8')
    knowledge = json.loads(decoded)
    analisi_esistenti = knowledge.get('analisi', [])
    print(f'Già analizzati: {len(analisi_esistenti)}')

    titoli_analizzati = {a['titolo'].strip().lower() for a in analisi_esistenti}

    # Lista PDF in MANUALI/
    print('Leggo MANUALI/...')
    manuali = gh_get('MANUALI')
    pdf_files = sorted([f for f in manuali if f['name'].endswith('.pdf')], key=lambda x: x['name'])
    print(f'PDF totali in MANUALI/: {len(pdf_files)}')

    # Filtra non analizzati
    da_analizzare = [f for f in pdf_files
                     if f['name'].replace('.pdf','').strip().lower() not in titoli_analizzati]
    print(f'Da analizzare: {len(da_analizzare)}')

    if not da_analizzare:
        print('Tutti i PDF già analizzati.')
        return

    # Analizza max 15 per run (PDF reali richiedono più tempo)
    batch = da_analizzare[:15]
    nuove_analisi = []

    for i, pdf_file in enumerate(batch):
        titolo = pdf_file['name'].replace('.pdf','').strip()
        print(f'\n[{i+1}/{len(batch)}] {titolo[:65]}')

        # Scarica PDF (GitHub API restituisce base64 direttamente)
        pdf_b64 = None
        try:
            pdf_data = gh_get(f"MANUALI/{pdf_file['name']}")
            raw_b64 = pdf_data.get('content','').replace('\n','')
            if raw_b64 and len(raw_b64) > 100:
                # Verifica dimensione: Anthropic max ~32MB base64 (~24MB PDF)
                size_mb = len(raw_b64) * 3 / 4 / 1024 / 1024
                print(f'  PDF: {size_mb:.1f} MB')
                if size_mb < 20:
                    pdf_b64 = raw_b64
                else:
                    print(f'  PDF troppo grande ({size_mb:.1f}MB) — analisi solo titolo')
        except Exception as ex:
            print(f'  Download fallito: {ex}')

        result = analizza_con_anthropic(titolo, pdf_b64)

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

        time.sleep(2)

    # Assembla
    tutte = analisi_esistenti + nuove_analisi
    for idx, a in enumerate(tutte):
        a['id'] = a.get('id') or f'pdf_{idx}'

    # Connessioni per tag
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

    # SHA fresco
    sha_fresco = gh_get('data/pdf_knowledge.json')['sha']
    gh_put('data/pdf_knowledge.json', content_b64, sha_fresco,
           f'BioSerra PDF {oggi} (+{len(nuove_analisi)}, tot:{len(tutte)})')

    print(f'\n=== COMPLETATO: {len(nuove_analisi)} nuovi, totale {len(tutte)}/89 ===')
    rils = {}
    for a in nuove_analisi:
        r = a.get('rilevanza','?')
        rils[r] = rils.get(r,0) + 1
    for r, c in sorted(rils.items()):
        print(f'  {r}: {c}')

if __name__ == '__main__':
    main()
