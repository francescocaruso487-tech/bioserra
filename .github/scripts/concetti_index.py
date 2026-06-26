import os, json, base64, urllib.request, time

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
GROQ_KEY = os.environ['GROQ_KEY']
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
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        return json.load(r)['sha']

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
        'max_tokens': 2000,
        'temperature': 0.2,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {GROQ_KEY}', 'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.load(r)
    return resp['choices'][0]['message']['content']

def main():
    oggi = __import__('datetime').date.today().isoformat()
    print('Leggo pdf_knowledge.json...')
    
    raw = gh_get_raw('data/pdf_knowledge.json')
    knowledge = json.loads(raw)
    analisi = knowledge.get('analisi', [])
    
    # Estrai tutte le tecniche uniche dai PDF
    tecniche_raw = {}
    for a in analisi:
        for t in a.get('tecniche_chiave', []):
            t_norm = t.strip().lower()
            if len(t_norm) < 5: continue
            if t_norm not in tecniche_raw:
                tecniche_raw[t_norm] = {
                    'label': t.strip(),
                    'pdf_ids': [],
                    'tags': set(),
                    'rilevanze': []
                }
            tecniche_raw[t_norm]['pdf_ids'].append(a.get('id',''))
            tecniche_raw[t_norm]['tags'].update(a.get('tag', []))
            tecniche_raw[t_norm]['rilevanze'].append(a.get('rilevanza','media'))
    
    print(f'Tecniche grezze estratte: {len(tecniche_raw)}')
    
    # Chiedi a Groq di clusterizzare e arricchire
    lista_tecniche = '\n'.join([f'- {v["label"]} (fonte: {len(v["pdf_ids"])} PDF)' 
                                 for v in list(tecniche_raw.values())[:80]])
    
    prompt = f'''Sei un esperto di agricoltura biodinamica e Living Soil.
Ho estratto queste tecniche/concetti da {len(analisi)} PDF scientifici sulla coltivazione:

{lista_tecniche}

Crea un indice strutturato di concetti pratici per una serra Living Soil outdoor a Caserta, Italia.
Tecniche elettrocultura attive: Lakhovsky, pila galvanica Fe-Cu, acqua magnetizzata, spirale cosmica rame, antenna terra.

Rispondi SOLO con JSON valido:
{{
  "concetti": [
    {{
      "id": "concetto_1",
      "label": "Nome breve del concetto",
      "categoria": "elettrocultura|biodinamica|suolo|irrigazione|nutrizione|fitosanitario|raccolta|altro",
      "descrizione": "Descrizione pratica 2-3 frasi",
      "istruzioni_pratiche": ["passo 1", "passo 2", "passo 3"],
      "varianti": ["variante o metodo alternativo"],
      "fasi_guida": ["vegetazione", "fioritura"],
      "rilevanza": 85,
      "tag_correlati": ["tag1", "tag2"]
    }}
  ]
}}

Crea massimo 40 concetti, solo quelli praticamente applicabili in serra. NO "harina de rocas" (artefatto spagnolo).'''

    print('Chiedo clustering a Groq...')
    try:
        risposta = groq_chat(prompt)
        s, e = risposta.index('{'), risposta.rindex('}')
        result = json.loads(risposta[s:e+1])
        concetti = result.get('concetti', [])
        print(f'Concetti generati: {len(concetti)}')
    except Exception as ex:
        print(f'Errore Groq: {ex}')
        return
    
    # Arricchisci con pdf_ids
    for c in concetti:
        label_lower = c.get('label','').lower()
        pdf_ids = []
        for t_norm, tdata in tecniche_raw.items():
            if any(w in t_norm for w in label_lower.split()[:3]):
                pdf_ids.extend(tdata['pdf_ids'])
        c['pdf_ids'] = list(set(pdf_ids))[:10]
        c['pdf_count'] = len(c['pdf_ids'])
    
    # Costruisci grafo nodi/edges
    nodi = [{'id': c['id'], 'label': c['label'], 'categoria': c['categoria']} for c in concetti]
    edges = []
    for i, a in enumerate(concetti):
        for j, b in enumerate(concetti):
            if j <= i: continue
            tag_comuni = set(a.get('tag_correlati',[])) & set(b.get('tag_correlati',[]))
            if len(tag_comuni) >= 1:
                edges.append({'source': a['id'], 'target': b['id'], 'peso': len(tag_comuni)})
    
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
    
    sha = gh_get_sha('data/concetti_index.json')
    gh_put('data/concetti_index.json', content_b64, sha,
           f'BioSerra concetti {oggi} ({len(concetti)} concetti da {len(analisi)} PDF)')
    
    print(f'concetti_index.json salvato: {len(concetti)} concetti')

if __name__ == '__main__':
    main()
