import os, json, base64, urllib.request, time

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
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)['choices'][0]['message']['content']

def main():
    oggi = __import__('datetime').date.today().isoformat()

    # Leggi pdf_knowledge via API GitHub (no cache)
    print('Leggo pdf_knowledge.json via API...')
    raw, _ = gh_api_get('data/pdf_knowledge.json')
    knowledge = json.loads(raw)
    analisi = knowledge.get('analisi', [])
    print(f'PDF in archivio: {len(analisi)}')

    # Costruisci dizionario ricco per ogni PDF
    # Usa sommario + estratto + tecniche per avere dati reali
    pdf_summary = []
    for a in analisi:
        entry = {
            'id': a.get('id',''),
            'titolo': a.get('titolo',''),
            'sommario': a.get('sommario','')[:150],
            'tecniche': a.get('tecniche_chiave',[])[:4],
            'consiglio': a.get('consiglio_coltivazione','')[:100],
            'tag': a.get('tag',[])[:5],
            'elettro': a.get('consiglio_elettrocultura','')[:80],
        }
        pdf_summary.append(entry)

    # Aggrega per blocchi da 25 PDF e chiedi a Groq
    # Poi unisci tutti i concetti
    tutti_concetti_raw = []
    blocchi = [pdf_summary[i:i+25] for i in range(0, len(pdf_summary), 25)]

    for idx, blocco in enumerate(blocchi):
        print(f'Blocco {idx+1}/{len(blocchi)} ({len(blocco)} PDF)...')

        # Formatta blocco
        righe = []
        for p in blocco:
            tec = ', '.join(p['tecniche']) if p['tecniche'] else 'nessuna'
            righe.append(
                f"PDF: {p['titolo'][:50]}\n"
                f"  Sommario: {p['sommario']}\n"
                f"  Tecniche: {tec}\n"
                f"  Consiglio: {p['consiglio']}\n"
                f"  Tag: {', '.join(p['tag'])}"
            )
        blocco_str = '\n\n'.join(righe)

        prompt = f'''Sei un esperto pratico di agricoltura biodinamica, Living Soil ed elettrocultura.

Analizza questi {len(blocco)} PDF e estrai TUTTE le tecniche pratiche applicabili in una serra outdoor Living Soil a Caserta, Italia.

{blocco_str}

Contesto serra: piante outdoor in vasi, Living Soil water-only, elettrocultura attiva (Lakhovsky, Fe-Cu, acqua magnetizzata, spirale rame, antenna terra), calendario biodinamico Steiner/Thun.

Estrai ogni tecnica concreta menzionata. Includi tutto: pratiche del suolo, irrigazione, nutrizione, elettrocultura, biodinamica, fitosanitario, raccolta, ecc.
Escludi: riferimenti a testi religiosi, "harina de rocas", tecniche non applicabili all'aperto.

Rispondi SOLO con JSON:
{{"concetti": [
  {{
    "id": "slug_unico_breve",
    "label": "Nome pratico breve",
    "categoria": "elettrocultura|biodinamica|suolo|irrigazione|nutrizione|fitosanitario|raccolta|altro",
    "descrizione": "Cosa e e perche usarla, 2 frasi",
    "istruzioni_pratiche": ["passo 1 concreto", "passo 2", "passo 3"],
    "varianti": ["metodo alternativo se esiste"],
    "fasi_guida": ["vegetazione|fioritura|taglio|essiccazione"],
    "rilevanza": 80,
    "tag_correlati": ["tag1", "tag2"]
  }}
]}}'''

        try:
            risposta = groq_chat(prompt)
            s, e = risposta.index('{'), risposta.rindex('}')
            result = json.loads(risposta[s:e+1])
            blocco_concetti = result.get('concetti', [])
            print(f'  Estratti: {len(blocco_concetti)} concetti')
            tutti_concetti_raw.extend(blocco_concetti)
        except Exception as ex:
            print(f'  Errore blocco {idx+1}: {ex}')
        time.sleep(2)

    print(f'\nTotale concetti grezzi: {len(tutti_concetti_raw)}')

    # Dedup per label simile
    seen_labels = {}
    concetti_dedup = []
    for c in tutti_concetti_raw:
        label_norm = c.get('label','').strip().lower()[:30]
        if label_norm and label_norm not in seen_labels:
            seen_labels[label_norm] = True
            concetti_dedup.append(c)

    print(f'Dopo dedup: {len(concetti_dedup)} concetti')

    # Assegna ID univoco e arricchisci con pdf_ids
    tecniche_map = {}
    for a in analisi:
        for t in a.get('tecniche_chiave', []):
            t_norm = t.strip().lower()
            if t_norm not in tecniche_map:
                tecniche_map[t_norm] = []
            tecniche_map[t_norm].append(a.get('id',''))

    for i, c in enumerate(concetti_dedup):
        # ID univoco
        slug = c.get('id','') or c.get('label','concetto').lower().replace(' ','_')[:20]
        slug = slug.replace(' ','_').replace('/','_')
        c['id'] = f"{slug}_{i}" if slug in [x.get('id','') for x in concetti_dedup[:i]] else slug

        # pdf_ids reali
        label_words = [w for w in c.get('label','').lower().split() if len(w) > 3]
        pdf_ids = []
        for t_norm, pids in tecniche_map.items():
            if any(w in t_norm for w in label_words):
                pdf_ids.extend(pids)
        c['pdf_ids'] = list(dict.fromkeys(pdf_ids))[:10]
        c['pdf_count'] = len(c['pdf_ids'])

    # Grafo
    nodi = [{'id': c['id'], 'label': c['label'], 'categoria': c['categoria']} for c in concetti_dedup]
    edges = []
    for i, a in enumerate(concetti_dedup):
        for j, b in enumerate(concetti_dedup):
            if j <= i: continue
            tag_comuni = set(a.get('tag_correlati',[])) & set(b.get('tag_correlati',[]))
            cat_stessa = 1 if a.get('categoria') == b.get('categoria') else 0
            peso = len(tag_comuni) * 2 + cat_stessa
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

    print(f'\n✅ Salvato: {len(concetti_dedup)} concetti, {len(edges)} edges')
    cat_count = {}
    for c in concetti_dedup:
        cat = c.get('categoria','altro')
        cat_count[cat] = cat_count.get(cat, 0) + 1
    for cat, cnt in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt}')

if __name__ == '__main__':
    main()
