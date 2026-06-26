import os, json, base64, urllib.request, urllib.error, time, sys

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
GROQ_KEY = os.environ['GROQ_KEY']
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

def gh_api_get(path):
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

def groq_chat(prompt, max_tokens=2000):
    body = json.dumps({
        'model': 'llama-3.3-70b-versatile',
        'max_tokens': max_tokens,
        'temperature': 0.1,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {GROQ_KEY}', 'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.load(r)
        content = resp['choices'][0]['message']['content']
        print(f'  [Groq OK] {len(content)} chars, finish_reason={resp["choices"][0].get("finish_reason")}')
        return content
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f'  [Groq HTTP {e.code}] {err[:400]}')
        raise

def main():
    oggi = __import__('datetime').date.today().isoformat()

    print('=== BioSerra Concetti Index v5 ===')
    print('Leggo pdf_knowledge.json via API GitHub...')
    raw, _ = gh_api_get('data/pdf_knowledge.json')
    knowledge = json.loads(raw)
    analisi = knowledge.get('analisi', [])
    print(f'PDF in archivio: {len(analisi)}')

    # Estrai tecniche aggregate — approccio diverso:
    # NON mandare tutto a Groq in blocchi
    # Estrai direttamente le tecniche+consigli da tutti i PDF
    # e costruisci concetti manualmente, poi chiedi a Groq di arricchirli

    tecniche_agg = {}  # label_norm -> {count, pdf_ids, descrizioni, consigli}
    for a in analisi:
        pid = a.get('id','')
        sommario = a.get('sommario','')
        consiglio = a.get('consiglio_coltivazione','')
        elettro = a.get('consiglio_elettrocultura','')

        for t in a.get('tecniche_chiave', []):
            t_clean = t.strip()
            if len(t_clean) < 5: continue
            skip_words = ['harina de roca','cannabis','non specificat','non disponib','nessuna tecn','nessun conness']
            if any(w in t_clean.lower() for w in skip_words): continue

            t_norm = t_clean.lower()
            if t_norm not in tecniche_agg:
                tecniche_agg[t_norm] = {
                    'label': t_clean,
                    'count': 0,
                    'pdf_ids': [],
                    'consigli': [],
                    'elettro': []
                }
            tecniche_agg[t_norm]['count'] += 1
            tecniche_agg[t_norm]['pdf_ids'].append(pid)
            if consiglio and len(tecniche_agg[t_norm]['consigli']) < 3:
                tecniche_agg[t_norm]['consigli'].append(consiglio[:100])
            if elettro and len(tecniche_agg[t_norm]['elettro']) < 2:
                tecniche_agg[t_norm]['elettro'].append(elettro[:80])

    print(f'Tecniche aggregate: {len(tecniche_agg)}')

    # Ordina per frequenza, prendi top 80
    top_tec = sorted(tecniche_agg.items(), key=lambda x: -x[1]['count'])[:80]
    print(f'Top {len(top_tec)} tecniche per rilevanza:')
    for t, td in top_tec[:10]:
        print(f'  {td["label"]} ({td["count"]} PDF)')

    # Ora manda a Groq SOLO la lista delle tecniche (non i PDF completi)
    # per clustering e categorizzazione — prompt molto corto
    lista_tec = '\n'.join([
        f'- {td["label"]} (da {td["count"]} documenti)'
        for _, td in top_tec
    ])

    prompt = (
        'Sei un agronomo esperto di Living Soil, biodinamica ed elettrocultura per coltivazione outdoor italiana.\n\n'
        'Ho estratto queste tecniche da 103 testi scientifici sulla coltivazione:\n\n'
        f'{lista_tec}\n\n'
        'Categorizza e raggruppa queste tecniche in 20-35 concetti pratici distinti.\n'
        'Elimina duplicati e concetti troppo simili. Escludi filosofia pura non applicabile.\n'
        'Per ogni concetto fornisci istruzioni pratiche concrete per una serra outdoor.\n\n'
        'Rispondi SOLO con JSON, nessun testo fuori:\n'
        '{"concetti": [\n'
        '{"id": "slug_breve", "label": "Nome pratico", '
        '"categoria": "suolo|irrigazione|nutrizione|elettrocultura|biodinamica|fitosanitario|raccolta|altro", '
        '"descrizione": "Cosa e e perche usarla in 2 frasi pratiche", '
        '"istruzioni_pratiche": ["passo 1 concreto", "passo 2", "passo 3"], '
        '"varianti": ["alternativa pratica"], '
        '"fasi_guida": ["vegetazione|fioritura|taglio|essiccazione"], '
        '"rilevanza": 80, '
        '"tag_correlati": ["tag1", "tag2"]}\n'
        ']}'
    )

    print(f'\nPrompt length: {len(prompt)} chars')
    print('Invio a Groq...')

    try:
        risposta = groq_chat(prompt, max_tokens=4000)
    except Exception as ex:
        print(f'ERRORE CRITICO Groq: {ex}')
        sys.exit(1)

    # Parse
    print(f'Risposta raw (primi 500): {risposta[:500]}')

    try:
        s = risposta.find('{"concetti"')
        if s == -1:
            s = risposta.find('{')
        e = risposta.rfind('}')
        if s == -1 or e == -1 or e <= s:
            print(f'ERRORE: JSON non trovato. Risposta completa:\n{risposta}')
            sys.exit(1)

        parsed = json.loads(risposta[s:e+1])
        concetti = parsed.get('concetti', [])
        print(f'Concetti estratti: {len(concetti)}')
    except json.JSONDecodeError as ex:
        print(f'ERRORE JSON decode: {ex}')
        print(f'JSON tentato:\n{risposta[s:e+1][:500] if "s" in dir() else risposta}')
        sys.exit(1)

    if not concetti:
        print('ERRORE: lista concetti vuota')
        print(f'Risposta completa:\n{risposta}')
        sys.exit(1)

    # Arricchisci con pdf_ids reali
    used_ids = set()
    for i, c in enumerate(concetti):
        base_id = (c.get('id') or c.get('label','c')).lower()
        base_id = ''.join(ch if ch.isalnum() else '_' for ch in base_id)[:20].strip('_')
        uid = base_id if base_id not in used_ids else f'{base_id}_{i}'
        used_ids.add(uid)
        c['id'] = uid

        words = [w for w in c.get('label','').lower().split() if len(w) > 3]
        pdf_ids = []
        for t_norm, tdata in tecniche_agg.items():
            if any(w in t_norm for w in words):
                pdf_ids.extend(tdata['pdf_ids'])
        c['pdf_ids'] = list(dict.fromkeys(pdf_ids))[:10]
        c['pdf_count'] = len(c['pdf_ids'])

    # Grafo
    nodi = [{'id': c['id'], 'label': c['label'], 'categoria': c['categoria']} for c in concetti]
    edges = []
    for i, a in enumerate(concetti):
        for j, b in enumerate(concetti):
            if j <= i: continue
            peso = len(set(a.get('tag_correlati',[])) & set(b.get('tag_correlati',[]))) * 2
            if a.get('categoria') == b.get('categoria'):
                peso += 1
            if peso >= 1:
                edges.append({'source': a['id'], 'target': b['id'], 'peso': peso})

    concetti_index = {
        'lastUpdate': oggi,
        'total': len(concetti),
        'fonte': f'{len(analisi)} PDF analizzati',
        'concetti': concetti,
        'grafo': {'nodi': nodi, 'edges': edges}
    }

    content_b64 = base64.b64encode(
        json.dumps(concetti_index, indent=2, ensure_ascii=False).encode()
    ).decode()

    _, sha = gh_api_get('data/concetti_index.json')
    gh_put('data/concetti_index.json', content_b64, sha,
           f'BioSerra concetti {oggi} ({len(concetti)} concetti da {len(analisi)} PDF)')

    print(f'\n=== COMPLETATO ===')
    print(f'Concetti: {len(concetti)} | Edges grafo: {len(edges)}')
    cat_count = {}
    for c in concetti:
        cat = c.get('categoria','altro')
        cat_count[cat] = cat_count.get(cat,0)+1
    for cat, cnt in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt}')

if __name__ == '__main__':
    main()
