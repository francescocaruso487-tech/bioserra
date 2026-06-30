import os, json, base64, urllib.request, time, math

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
MISTRAL_KEY = os.environ['MISTRAL_KEY']
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

def gh_get_raw(path):
    url = f'https://raw.githubusercontent.com/{REPO}/main/{path}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {GITHUB_TOKEN}'})
    with urllib.request.urlopen(req) as r:
        return r.read().decode('utf-8')

def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)['sha']
    except Exception:
        return None

def gh_put(path, content, sha, message):
    """Resiliente: 3 tentativi, SHA sempre fresco, mai solleva eccezioni (None se fallisce)."""
    if isinstance(content, str):
        content = content.encode('utf-8')
    encoded = base64.b64encode(content).decode('ascii')
    for attempt in range(3):
        try:
            sha_fresco = gh_get_sha(path)
            body = {'message': message, 'content': encoded, 'branch': 'main'}
            if sha_fresco:
                body['sha'] = sha_fresco
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}',
                data=json.dumps(body).encode(),
                headers={**HEADERS_GH, 'Content-Type': 'application/json'},
                method='PUT')
            with urllib.request.urlopen(req) as r:
                return json.load(r)
        except Exception as ex:
            print(f'  gh_put tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    return None

def mistral_embed(testo):
    body = json.dumps({'model': 'mistral-embed', 'input': [testo[:2000]]}).encode()
    req = urllib.request.Request(
        'https://api.mistral.ai/v1/embeddings',
        data=body,
        headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.load(r)
    return resp['data'][0]['embedding']

def cosine(a, b):
    dot = sum(x*y for x,y in zip(a,b))
    na = math.sqrt(sum(x*x for x in a))
    nb = math.sqrt(sum(x*x for x in b))
    return dot/(na*nb) if na and nb else 0

def main():
    oggi = __import__('datetime').date.today().isoformat()
    print('Leggo pdf_knowledge.json...')
    
    raw = gh_get_raw('data/pdf_knowledge.json')
    knowledge = json.loads(raw)
    analisi = knowledge.get('analisi', [])
    print(f'PDF in knowledge: {len(analisi)}')
    
    # Leggi vettori esistenti
    try:
        raw_v = gh_get_raw('data/pdf_vectors.json')
        vettori_esistenti = json.loads(raw_v).get('vettori', [])
        print(f'Vettori esistenti: {len(vettori_esistenti)}')
    except:
        vettori_esistenti = []
        print('Nessun vettore esistente')
    
    id_vettorizzati = {v['id'] for v in vettori_esistenti}
    
    # Filtra non vettorizzati (max 20)
    da_vettorizzare = [a for a in analisi if a.get('id') not in id_vettorizzati][:20]
    print(f'Da vettorizzare: {len(da_vettorizzare)}')
    
    if not da_vettorizzare:
        print('Tutti già vettorizzati.')
        return
    
    nuovi_vettori = []
    for i, a in enumerate(da_vettorizzare):
        testo = f"{a.get('titolo','')} {' '.join(a.get('tag',[]))} {a.get('sommario','')} {' '.join(a.get('tecniche_chiave',[]))}"
        print(f'[{i+1}/{len(da_vettorizzare)}] {a.get("titolo","")[:50]}')
        try:
            vettore = mistral_embed(testo)
            # Comprimi a 6 cifre decimali
            vettore_c = [round(v, 6) for v in vettore]
            nuovi_vettori.append({
                'id': a['id'],
                'titolo': a.get('titolo',''),
                'tag': a.get('tag',[]),
                'rilevanza': a.get('rilevanza','media'),
                'vettore': vettore_c
            })
            print(f'  OK ({len(vettore)} dim)')
        except Exception as ex:
            print(f'  Errore: {ex}')
        time.sleep(0.5)
    
    tutti_vettori = vettori_esistenti + nuovi_vettori
    
    # Calcola grafo cosine similarity
    print('Calcolo grafo...')
    edges = []
    for i, a in enumerate(tutti_vettori):
        for j, b in enumerate(tutti_vettori):
            if j <= i: continue
            sim = cosine(a['vettore'], b['vettore'])
            if sim > 0.45:
                edges.append({'source': a['id'], 'target': b['id'], 'peso': round(sim, 4)})
    
    print(f'Edges: {len(edges)}')
    
    # Salva vettori
    vectors_json = {'lastUpdate': oggi, 'total': len(tutti_vettori), 'vettori': tutti_vettori}
    v_json = json.dumps(vectors_json, ensure_ascii=False)
    sha_v = gh_get_sha('data/pdf_vectors.json')
    res_v = gh_put('data/pdf_vectors.json', v_json, sha_v, f'BioSerra vettori {oggi} (tot:{len(tutti_vettori)})')
    if res_v is None:
        print('  ERRORE CRITICO: salvataggio pdf_vectors.json fallito dopo 3 tentativi')
    else:
        print(f'pdf_vectors.json salvato ({len(tutti_vettori)} vettori)')
    
    # Preserva edge semantici (semantico_reale) scritti da connessioni_update.py:
    # senza questo, embedding_pdf sovrascriverebbe il grafo semantico ogni notte.
    edges_semantici = []
    try:
        graph_old = json.loads(gh_get_raw('data/pdf_graph.json'))
        for e in graph_old.get('edges', []):
            tp = e.get('tipo') or e.get('tipo_conn') or ''
            if 'semantico' in str(tp):
                edges_semantici.append(e)
        if edges_semantici:
            print(f'Preservati {len(edges_semantici)} edge semantici esistenti')
    except Exception as ex:
        print(f'  Nota: impossibile leggere edge semantici esistenti: {ex}')

    # Marca gli edge embedding e fonde con i semantici preservati
    for e in edges:
        e['tipo'] = 'embedding'
    edges_finali = edges_semantici + edges

    # Salva grafo
    nodi = [{'id': v['id'], 'titolo': v['titolo'], 'rilevanza': v['rilevanza']} for v in tutti_vettori]
    grafo = {'lastUpdate': oggi, 'nodi': nodi, 'edges': edges_finali}
    g_json = json.dumps(grafo, ensure_ascii=False)
    sha_g = gh_get_sha('data/pdf_graph.json')
    res_g = gh_put('data/pdf_graph.json', g_json, sha_g, f'BioSerra grafo {oggi} ({len(edges_finali)} edges, {len(edges_semantici)} semantici preservati)')
    if res_g is None:
        print('  ERRORE CRITICO: salvataggio pdf_graph.json fallito dopo 3 tentativi')
    else:
        print(f'pdf_graph.json salvato ({len(edges_finali)} edges)')

if __name__ == '__main__':
    main()
