import os, json, base64, urllib.request, urllib.error, time

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

def groq_chat(prompt):
    body = json.dumps({
        'model': 'llama-3.3-70b-versatile',
        'max_tokens': 4000,
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
        return resp['choices'][0]['message']['content']
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()
        raise Exception(f'Groq HTTP {e.code}: {body_err[:300]}')

def main():
    oggi = __import__('datetime').date.today().isoformat()

    print('Leggo pdf_knowledge.json via API GitHub...')
    raw, _ = gh_api_get('data/pdf_knowledge.json')
    knowledge = json.loads(raw)
    analisi = knowledge.get('analisi', [])
    print(f'PDF in archivio: {len(analisi)}')

    # Costruisci sommari
    pdf_summary = []
    for a in analisi:
        pdf_summary.append({
            'id': a.get('id',''),
            'titolo': a.get('titolo','')[:60],
            'sommario': a.get('sommario','')[:120],
            'tecniche': a.get('tecniche_chiave',[])[:5],
            'consiglio': a.get('consiglio_coltivazione','')[:80],
            'tag': a.get('tag',[])[:5],
            'elettro': a.get('consiglio_elettrocultura','')[:60],
        })

    tutti_concetti_raw = []
    blocchi = [pdf_summary[i:i+20] for i in range(0, len(pdf_summary), 20)]

    for idx, blocco in enumerate(blocchi):
        print(f'\nBlocco {idx+1}/{len(blocchi)} ({len(blocco)} PDF)...')

        righe = []
        for p in blocco:
            tec = ', '.join(p['tecniche']) if p['tecniche'] else 'non specificato'
            righe.append(
                f"- Titolo: {p['titolo']}\n"
                f"  Sommario: {p['sommario']}\n"
                f"  Tecniche estratte: {tec}\n"
                f"  Consiglio pratico: {p['consiglio']}"
            )
        blocco_str = '\n'.join(righe)

        prompt = (
            'Sei un agronomo esperto di Living Soil, biodinamica ed elettrocultura per coltivazione outdoor in Italia.\n\n'
            f'Analizza questi {len(blocco)} testi e crea concetti pratici applicabili in una serra outdoor a Caserta:\n\n'
            f'{blocco_str}\n\n'
            'Crea da 5 a 15 concetti pratici concreti. Escludi filosofia pura, testi religiosi, "harina de rocas".\n'
            'Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, nessun testo prima o dopo:\n'
            '{"concetti": ['
            '{"id": "slug_breve", "label": "Nome tecnica", '
            '"categoria": "suolo|irrigazione|nutrizione|elettrocultura|biodinamica|fitosanitario|raccolta|altro", '
            '"descrizione": "Cosa e e come si usa in 2 frasi", '
            '"istruzioni_pratiche": ["fase 1", "fase 2", "fase 3"], '
            '"varianti": ["alternativa"], '
            '"fasi_guida": ["vegetazione"], '
            '"rilevanza": 75, '
            '"tag_correlati": ["tag1", "tag2"]}'
            ']}'
        )

        try:
            risposta = groq_chat(prompt)
            print(f'  Risposta Groq ({len(risposta)} chars): {risposta[:200]}...')

            # Parse robusto
            s = risposta.find('{"concetti"')
            if s == -1:
                s = risposta.find('{')
            e = risposta.rfind('}')
            if s == -1 or e == -1:
                print(f'  WARN: nessun JSON trovato nella risposta')
                print(f'  Risposta completa: {risposta}')
                continue

            parsed = json.loads(risposta[s:e+1])
            blocco_concetti = parsed.get('concetti', [])
            print(f'  Estratti: {len(blocco_concetti)} concetti')
            for c in blocco_concetti:
                print(f'    - [{c.get("categoria","?")}] {c.get("label","")}')
            tutti_concetti_raw.extend(blocco_concetti)

        except json.JSONDecodeError as ex:
            print(f'  ERRORE JSON parse blocco {idx+1}: {ex}')
            print(f'  Raw: {risposta[:500] if "risposta" in dir() else "N/A"}')
        except Exception as ex:
            print(f'  ERRORE blocco {idx+1}: {ex}')

        time.sleep(3)

    print(f'\nTotale concetti grezzi: {len(tutti_concetti_raw)}')

    if not tutti_concetti_raw:
        print('ERRORE CRITICO: nessun concetto estratto da Groq. Aborting.')
        import sys
        sys.exit(1)

    # Dedup per label
    seen = {}
    concetti_dedup = []
    for c in tutti_concetti_raw:
        key = c.get('label','').strip().lower()[:25]
        if key and key not in seen:
            seen[key] = True
            concetti_dedup.append(c)

    print(f'Dopo dedup: {len(concetti_dedup)} concetti')

    # Mappa tecniche -> pdf_ids
    tecniche_map = {}
    for a in analisi:
        for t in a.get('tecniche_chiave', []):
            t_norm = t.strip().lower()
            if t_norm not in tecniche_map:
                tecniche_map[t_norm] = []
            tecniche_map[t_norm].append(a.get('id',''))

    # Assegna ID e pdf_ids
    used_ids = set()
    for i, c in enumerate(concetti_dedup):
        base_id = (c.get('id') or c.get('label','c')).lower()
        base_id = ''.join(ch if ch.isalnum() or ch == '_' else '_' for ch in base_id)[:20]
        uid = base_id
        if uid in used_ids:
            uid = f'{base_id}_{i}'
        used_ids.add(uid)
        c['id'] = uid

        words = [w for w in c.get('label','').lower().split() if len(w) > 3]
        pdf_ids = []
        for t_norm, pids in tecniche_map.items():
            if any(w in t_norm for w in words):
                pdf_ids.extend(pids)
        c['pdf_ids'] = list(dict.fromkeys(pdf_ids))[:10]
        c['pdf_count'] = len(c['pdf_ids'])

    # Grafo
    nodi = [{'id': c['id'], 'label': c['label'], 'categoria': c['categoria']} for c in concetti_dedup]
    edges = []
    for i, a in enumerate(concetti_dedup):
        for j, b in enumerate(concetti_dedup):
            if j <= i: continue
            peso = len(set(a.get('tag_correlati',[])) & set(b.get('tag_correlati',[]))) * 2
            if a.get('categoria') == b.get('categoria'):
                peso += 1
            if peso >= 1:
                edges.append({'source': a['id'], 'target': b['id'], 'peso': peso})

    concetti_index = {
        'lastUpdate': oggi,
        'total': len(concetti_dedup),
        'fonte': f'{len(analisi)} PDF analizzati',
        'concetti': concetti_dedup,
        'grafo': {'nodi': nodi, 'edges': edges}
    }

    content_b64 = base64.b64encode(
        json.dumps(concetti_index, indent=2, ensure_ascii=False).encode()
    ).decode()

    _, sha = gh_api_get('data/concetti_index.json')
    gh_put('data/concetti_index.json', content_b64, sha,
           f'BioSerra concetti {oggi} ({len(concetti_dedup)} concetti da {len(analisi)} PDF)')

    print(f'\nSalvato: {len(concetti_dedup)} concetti, {len(edges)} edges')
    cat_count = {}
    for c in concetti_dedup:
        cat = c.get('categoria','altro')
        cat_count[cat] = cat_count.get(cat,0) + 1
    for cat, cnt in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt}')

if __name__ == '__main__':
    main()
