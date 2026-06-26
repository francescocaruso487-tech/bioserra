import os, json, base64, urllib.request, urllib.error, time, sys

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
GROQ_KEY = os.environ.get('GROQ_KEY', '')
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

def groq_chat(prompt, max_tokens=4000):
    print(f'  GROQ_KEY presente: {"si" if GROQ_KEY else "NO - ERRORE"}')
    if not GROQ_KEY:
        raise Exception('GROQ_KEY non impostata')
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
        tokens_used = resp.get('usage', {}).get('total_tokens', 0)
        print(f'  Groq OK: {len(content)} chars, {tokens_used} tokens')
        return content
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f'  Groq HTTP {e.code}: {err[:600]}')
        raise

def build_concetti_from_tecniche(tecniche_agg, analisi):
    """Fallback: costruisce concetti direttamente dalle tecniche senza Groq"""
    print('  Costruisco concetti da tecniche senza Groq...')

    CATEGORIE_MAP = {
        'compost': 'suolo', 'humus': 'suolo', 'suolo': 'suolo', 'terra': 'suolo',
        'microbi': 'suolo', 'fungh': 'suolo', 'micoriz': 'suolo', 'ammendant': 'suolo',
        'irrigazion': 'irrigazione', 'acqua': 'irrigazione', 'drip': 'irrigazione',
        'goccia': 'irrigazione', 'humid': 'irrigazione',
        'nutri': 'nutrizione', 'fertiliz': 'nutrizione', 'azoto': 'nutrizione',
        'fosforo': 'nutrizione', 'potassio': 'nutrizione', 'minerali': 'nutrizione',
        'elettro': 'elettrocultura', 'lakhovsky': 'elettrocultura', 'galvanic': 'elettrocultura',
        'rame': 'elettrocultura', 'antenna': 'elettrocultura', 'magnetiz': 'elettrocultura',
        'risonanz': 'elettrocultura', 'spirale': 'elettrocultura', 'pantacolo': 'elettrocultura',
        'biodinam': 'biodinamica', 'luna': 'biodinamica', 'steiner': 'biodinamica',
        'calendario': 'biodinamica', 'pianeta': 'biodinamica', 'cosm': 'biodinamica',
        'parassit': 'fitosanitario', 'malattia': 'fitosanitario', 'fungicd': 'fitosanitario',
        'insetti': 'fitosanitario', 'difesa': 'fitosanitario', 'trappola': 'fitosanitario',
        'raccolt': 'raccolta', 'fioritura': 'raccolta', 'maturaz': 'raccolta',
        'essiccaz': 'raccolta', 'taglio': 'raccolta',
    }

    def categorizza(label):
        l = label.lower()
        for kw, cat in CATEGORIE_MAP.items():
            if kw in l:
                return cat
        return 'altro'

    # Prendi top 40 tecniche per frequenza
    top = sorted(tecniche_agg.items(), key=lambda x: -x[1]['count'])[:40]
    concetti = []
    used_ids = set()

    for t_norm, td in top:
        label = td['label']
        cat = categorizza(label)
        consiglio = td['consigli'][0] if td['consigli'] else f'Applica {label} in modo regolare'
        elettro = td['elettro'][0] if td['elettro'] else ''

        istruzioni = [consiglio]
        if elettro:
            istruzioni.append(elettro)
        istruzioni.append(f'Monitora i risultati dopo ogni applicazione')

        base_id = ''.join(ch if ch.isalnum() else '_' for ch in label.lower())[:20].strip('_')
        uid = base_id if base_id not in used_ids else f'{base_id}_{len(used_ids)}'
        used_ids.add(uid)

        concetti.append({
            'id': uid,
            'label': label,
            'categoria': cat,
            'descrizione': f'{label} estratta da {td["count"]} documenti scientifici. {consiglio}',
            'istruzioni_pratiche': istruzioni[:3],
            'varianti': [],
            'fasi_guida': ['vegetazione', 'fioritura'],
            'rilevanza': min(95, 50 + td['count'] * 5),
            'tag_correlati': [cat, 'living-soil'],
            'pdf_ids': list(dict.fromkeys(td['pdf_ids']))[:10],
            'pdf_count': len(td['pdf_ids'])
        })

    return concetti

def main():
    oggi = __import__('datetime').date.today().isoformat()
    print('=== BioSerra Concetti Index v5 ===')
    print(f'GROQ_KEY: {"presente (" + GROQ_KEY[:8] + "...)" if GROQ_KEY else "ASSENTE"}')

    print('Leggo pdf_knowledge.json...')
    raw, _ = gh_api_get('data/pdf_knowledge.json')
    knowledge = json.loads(raw)
    analisi = knowledge.get('analisi', [])
    print(f'PDF: {len(analisi)}')

    # Estrai tecniche
    SKIP = ['harina de roca','non specificat','non disponib','nessuna tecn','nessun']
    tecniche_agg = {}
    for a in analisi:
        pid = a.get('id','')
        for t in a.get('tecniche_chiave', []):
            t_clean = t.strip()
            if len(t_clean) < 5: continue
            if any(s in t_clean.lower() for s in SKIP): continue
            t_norm = t_clean.lower()
            if t_norm not in tecniche_agg:
                tecniche_agg[t_norm] = {'label': t_clean, 'count': 0, 'pdf_ids': [], 'consigli': [], 'elettro': []}
            tecniche_agg[t_norm]['count'] += 1
            tecniche_agg[t_norm]['pdf_ids'].append(pid)
            c = a.get('consiglio_coltivazione','')
            if c and len(tecniche_agg[t_norm]['consigli']) < 3:
                tecniche_agg[t_norm]['consigli'].append(c[:100])
            e = a.get('consiglio_elettrocultura','')
            if e and len(tecniche_agg[t_norm]['elettro']) < 2:
                tecniche_agg[t_norm]['elettro'].append(e[:80])

    print(f'Tecniche uniche: {len(tecniche_agg)}')

    # Prova Groq
    concetti = []
    if GROQ_KEY:
        top_tec = sorted(tecniche_agg.items(), key=lambda x: -x[1]['count'])[:60]
        lista_tec = '\n'.join([f'- {td["label"]} ({td["count"]} doc)' for _, td in top_tec])

        prompt = (
            'Agronomo esperto Living Soil Italia. Raggruppa queste tecniche in 25-35 concetti pratici distinti per serra outdoor.\n'
            f'Tecniche estratte da 103 PDF scientifici:\n{lista_tec}\n\n'
            'Escludi: filosofia pura, "harina de rocas", testi religiosi.\n'
            'Rispondi SOLO con JSON valido:\n'
            '{"concetti":[{"id":"slug","label":"Nome","categoria":"suolo|irrigazione|nutrizione|elettrocultura|biodinamica|fitosanitario|raccolta|altro","descrizione":"2 frasi pratiche","istruzioni_pratiche":["passo1","passo2","passo3"],"varianti":["alt"],"fasi_guida":["vegetazione"],"rilevanza":80,"tag_correlati":["tag1"]}]}'
        )
        print(f'Prompt: {len(prompt)} chars')
        try:
            risposta = groq_chat(prompt)
            print(f'Risposta (200 chars): {risposta[:200]}')
            s = risposta.find('{"concetti"')
            if s == -1: s = risposta.find('{')
            e = risposta.rfind('}')
            if s >= 0 and e > s:
                parsed = json.loads(risposta[s:e+1])
                concetti = parsed.get('concetti', [])
                print(f'Concetti Groq: {len(concetti)}')
        except Exception as ex:
            print(f'Groq fallito: {ex}')

    # Fallback locale se Groq non funziona o restituisce 0
    if not concetti:
        print('Uso fallback locale...')
        concetti = build_concetti_from_tecniche(tecniche_agg, analisi)
        print(f'Concetti fallback: {len(concetti)}')

    # Arricchisci pdf_ids per concetti Groq (non fallback che li ha già)
    if GROQ_KEY:
        used_ids = set()
        for i, c in enumerate(concetti):
            base_id = ''.join(ch if ch.isalnum() else '_' for ch in c.get('id',c.get('label','c')).lower())[:20].strip('_')
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
    nodi = [{'id': c['id'], 'label': c['label'], 'categoria': c.get('categoria','altro')} for c in concetti]
    edges = []
    for i, a in enumerate(concetti):
        for j, b in enumerate(concetti):
            if j <= i: continue
            peso = len(set(a.get('tag_correlati',[])) & set(b.get('tag_correlati',[]))) * 2
            if a.get('categoria') == b.get('categoria'): peso += 1
            if peso >= 1:
                edges.append({'source': a['id'], 'target': b['id'], 'peso': peso})

    out = {
        'lastUpdate': oggi,
        'total': len(concetti),
        'fonte': f'{len(analisi)} PDF analizzati',
        'concetti': concetti,
        'grafo': {'nodi': nodi, 'edges': edges}
    }

    content_b64 = base64.b64encode(json.dumps(out, indent=2, ensure_ascii=False).encode()).decode()
    _, sha = gh_api_get('data/concetti_index.json')
    gh_put('data/concetti_index.json', content_b64, sha,
           f'BioSerra concetti {oggi} ({len(concetti)} concetti da {len(analisi)} PDF)')

    print(f'\n=== COMPLETATO: {len(concetti)} concetti, {len(edges)} edges ===')
    cat_count = {}
    for c in concetti:
        cat = c.get('categoria','altro')
        cat_count[cat] = cat_count.get(cat,0)+1
    for cat, cnt in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt}')

if __name__ == '__main__':
    main()
