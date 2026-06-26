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
    url = f'https://raw.githubusercontent.com/{REPO}/main/{path}?t={int(time.time())}'
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
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
        'max_tokens': 3000,
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
    print(f'PDF disponibili: {len(analisi)}')

    # Estrai tecniche uniche con metadati completi
    tecniche_map = {}
    for a in analisi:
        pid = a.get('id', '')
        titolo_pdf = a.get('titolo', '')
        for t in a.get('tecniche_chiave', []):
            t_norm = t.strip().lower()
            if len(t_norm) < 4:
                continue
            # Escludi artefatti
            if any(x in t_norm for x in ['harina de roca', 'flour rock', 'cannabis']):
                continue
            if t_norm not in tecniche_map:
                tecniche_map[t_norm] = {
                    'label': t.strip(),
                    'pdf_ids': [],
                    'pdf_titoli': [],
                    'tags': set(),
                    'sommari': []
                }
            tecniche_map[t_norm]['pdf_ids'].append(pid)
            tecniche_map[t_norm]['pdf_titoli'].append(titolo_pdf)
            tecniche_map[t_norm]['tags'].update(a.get('tag', []))
            if a.get('sommario'):
                tecniche_map[t_norm]['sommari'].append(a['sommario'][:100])

    print(f'Tecniche uniche estratte: {len(tecniche_map)}')

    # Costruisci lista arricchita per Groq (max 100)
    top_tecniche = sorted(tecniche_map.items(), key=lambda x: -len(x[1]['pdf_ids']))[:100]
    lista = []
    for t_norm, td in top_tecniche:
        lista.append(f"- {td['label']} (in {len(td['pdf_ids'])} PDF: {', '.join(td['pdf_titoli'][:2])})")
    lista_str = '\n'.join(lista)

    # Estrai anche tag globali frequenti
    tag_freq = {}
    for a in analisi:
        for tag in a.get('tag', []):
            tag_freq[tag] = tag_freq.get(tag, 0) + 1
    top_tags = sorted(tag_freq.items(), key=lambda x: -x[1])[:30]
    tags_str = ', '.join([f"{t}({c})" for t,c in top_tags])

    prompt = f'''Sei un esperto di agricoltura biodinamica, Living Soil ed elettrocultura.
Ho analizzato {len(analisi)} PDF scientifici sulla coltivazione outdoor e estratto queste tecniche/concetti:

{lista_str}

Tag piu frequenti nei PDF: {tags_str}

Contesto: Serra BioSerra Caserta Italia. Piante outdoor Living Soil in vasi.
Tecniche elettrocultura attive: circuito Lakhovsky, pila galvanica Fe-Cu, acqua magnetizzata, spirale cosmica rame, antenna terra, pantacolo rame.
Metodo biodinamico: calendario Steiner/Thun/Masson/Pistis.

Crea un indice strutturato di TUTTI i concetti pratici applicabili.
Raggruppa concetti simili, elimina duplicati, crea massimo 40 concetti distinti.
Escludi: "harina de rocas" e qualsiasi riferimento a testi religiosi non applicabili.

Rispondi SOLO con JSON valido senza testo fuori:
{{
  "concetti": [
    {{
      "id": "slug_univoco",
      "label": "Nome breve pratico",
      "categoria": "elettrocultura|biodinamica|suolo|irrigazione|nutrizione|fitosanitario|raccolta|altro",
      "descrizione": "Descrizione pratica 2-3 frasi su cosa e e perche usarla",
      "istruzioni_pratiche": ["passo concreto 1", "passo concreto 2", "passo concreto 3"],
      "varianti": ["variante o metodo alternativo se esiste"],
      "fasi_guida": ["germinazione|vegetazione|fioritura|taglio|essiccazione"],
      "rilevanza": 85,
      "tag_correlati": ["tag1", "tag2"]
    }}
  ]
}}'''

    print('Chiedo clustering a Groq...')
    try:
        risposta = groq_chat(prompt)
        s, e = risposta.index('{'), risposta.rindex('}')
        result = json.loads(risposta[s:e+1])
        concetti = result.get('concetti', [])
        print(f'Concetti generati: {len(concetti)}')
    except Exception as ex:
        print(f'Errore Groq: {ex}')
        print(f'Risposta raw: {risposta[:500]}')
        return

    # Arricchisci ogni concetto con pdf_ids reali
    for c in concetti:
        label_lower = c.get('label', '').lower()
        parole = [w for w in label_lower.split() if len(w) > 3]
        pdf_ids = []
        for t_norm, tdata in tecniche_map.items():
            if any(w in t_norm for w in parole):
                pdf_ids.extend(tdata['pdf_ids'])
        c['pdf_ids'] = list(dict.fromkeys(pdf_ids))[:10]  # dedup, max 10
        c['pdf_count'] = len(c['pdf_ids'])

    # Grafo concetti
    nodi = [{'id': c['id'], 'label': c['label'], 'categoria': c['categoria']} for c in concetti]
    edges = []
    for i, a in enumerate(concetti):
        for j, b in enumerate(concetti):
            if j <= i:
                continue
            tag_comuni = set(a.get('tag_correlati', [])) & set(b.get('tag_correlati', []))
            cat_stessa = 1 if a['categoria'] == b['categoria'] else 0
            peso = len(tag_comuni) + cat_stessa
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

    sha = gh_get_sha('data/concetti_index.json')
    gh_put('data/concetti_index.json', content_b64, sha,
           f'BioSerra concetti {oggi} ({len(concetti)} concetti da {len(analisi)} PDF)')

    print(f'\nconcetti_index.json salvato: {len(concetti)} concetti, {len(edges)} edges nel grafo')
    print('Categorie:')
    cat_count = {}
    for c in concetti:
        cat = c.get('categoria','altro')
        cat_count[cat] = cat_count.get(cat, 0) + 1
    for cat, cnt in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt}')

if __name__ == '__main__':
    main()
