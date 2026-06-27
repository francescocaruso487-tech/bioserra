import os, json, base64, urllib.request, urllib.error, time, sys

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
MISTRAL_KEY = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

CATEGORIE_VALIDE = {'suolo','irrigazione','nutrizione','elettrocultura','biodinamica','fitosanitario','raccolta','altro'}

ELETTRO_KW = [
    'lakhovsky','spirale','rame','antenna','magnetiz','fe-cu','ferro-rame','ighina',
    'elettromagn','galvanic','risonanz','pantacolo','campo elettr','oscillat'
]
SUOLO_KW = ['suolo','compost','humus','micoriz','fungh','microbi','ph','biodiver','ammend','torba','perlite','farina','rocce']
IRRIGAZIONE_KW = ['acqua','irrigaz','umidità','goccia','drip','ionizzata','struttur']
NUTRIZIONE_KW = ['nutriz','fertiliz','azoto','fosforo','potassio','organica','minerali','concime']
BIODINAMICA_KW = ['luna','biodinam','steiner','cosm','calendario','planetar']
FITOSANITARIO_KW = ['parassit','malattia','insetti','difesa','trappol','fungicd','alghe']
RACCOLTA_KW = ['raccolt','fioritura','taglio','essiccaz','concia','maturaz','trichomi']

def categorizza_auto(label, cat_mistral):
    """Corregge la categoria basandosi su keyword nel label"""
    if cat_mistral in CATEGORIE_VALIDE and cat_mistral != 'altro':
        # Verifica se la categoria assegnata ha senso, altrimenti correggi
        l = label.lower()
        if any(kw in l for kw in ELETTRO_KW):
            return 'elettrocultura'
    l = label.lower()
    if any(kw in l for kw in ELETTRO_KW): return 'elettrocultura'
    if any(kw in l for kw in SUOLO_KW): return 'suolo'
    if any(kw in l for kw in IRRIGAZIONE_KW): return 'irrigazione'
    if any(kw in l for kw in NUTRIZIONE_KW): return 'nutrizione'
    if any(kw in l for kw in BIODINAMICA_KW): return 'biodinamica'
    if any(kw in l for kw in FITOSANITARIO_KW): return 'fitosanitario'
    if any(kw in l for kw in RACCOLTA_KW): return 'raccolta'
    return cat_mistral if cat_mistral in CATEGORIE_VALIDE else 'altro'

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

def mistral_chat(prompt, max_tokens=7000):
    if not MISTRAL_KEY:
        raise Exception('MISTRAL_KEY non impostata')
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': max_tokens,
        'temperature': 0.2,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    req = urllib.request.Request(
        'https://api.mistral.ai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        resp = json.load(r)
    content = resp['choices'][0]['message']['content']
    tokens = resp.get('usage', {}).get('total_tokens', 0)
    print(f'  Mistral OK: {len(content)} chars, {tokens} tokens')
    return content

def build_concetti_fallback(tecniche_agg):
    """Fallback con dedup manuale"""
    print('  Uso fallback locale con dedup...')
    GRUPPI = {
        'Acqua Magnetizzata': {'kw': ['acqua magnetizzata'], 'cat': 'irrigazione'},
        'Antenna di Terra': {'kw': ['antenna di terra', 'antenna terra'], 'cat': 'elettrocultura'},
        'Spirale in Rame': {'kw': ['spirale rame', 'spirale in rame', 'spirale di rame'], 'cat': 'elettrocultura'},
        'Circuito di Lakhovsky': {'kw': ['lakhovsky', 'risonanza di lakhovsky'], 'cat': 'elettrocultura'},
        'Elettrodi Fe-Cu': {'kw': ['fe-cu', 'ferro-rame'], 'cat': 'elettrocultura'},
        'Atomo Magnetico di Ighina': {'kw': ['ighina', 'atomo magnetico'], 'cat': 'elettrocultura'},
        'Farine di Rocce': {'kw': ['farin', 'rocce'], 'cat': 'nutrizione'},
        'Salute del Suolo': {'kw': ['salute del suolo', 'suolo vivente', 'agricoltura biologica'], 'cat': 'suolo'},
        'Campi Elettromagnetici': {'kw': ['campi elettromagn'], 'cat': 'elettrocultura'},
    }
    concetti = []
    used_ids = set()
    for label, info in GRUPPI.items():
        count_tot = 0
        pdf_ids_set = []
        consigli = []
        for t_norm, td in tecniche_agg.items():
            if any(kw in t_norm for kw in info['kw']):
                count_tot += td['count']
                pdf_ids_set.extend(td['pdf_ids'])
                consigli.extend(td['consigli'])
        if count_tot == 0: continue
        base_id = ''.join(ch if ch.isalnum() else '_' for ch in label.lower())[:25].strip('_')
        uid = base_id if base_id not in used_ids else f'{base_id}_{len(used_ids)}'
        used_ids.add(uid)
        concetti.append({
            'id': uid, 'label': label, 'categoria': info['cat'],
            'descrizione': f'{label} presente in {count_tot} documenti.',
            'istruzioni_pratiche': (consigli[:2] + ['Monitora i risultati'])[:3],
            'varianti': info['kw'][:3],
            'fasi_guida': ['vegetazione', 'fioritura'],
            'rilevanza': min(95, 50 + count_tot * 2),
            'tag_correlati': [info['cat'], 'living-soil'],
            'pdf_ids': list(dict.fromkeys(pdf_ids_set))[:10],
            'pdf_count': min(len(set(pdf_ids_set)), 10)
        })
    return concetti

def main():
    oggi = __import__('datetime').date.today().isoformat()
    print('=== BioSerra Concetti Index v8 (Mistral) ===')
    print(f'MISTRAL_KEY: {"presente" if MISTRAL_KEY else "ASSENTE"}')

    print('Leggo pdf_knowledge.json...')
    raw, _ = gh_api_get('data/pdf_knowledge.json')
    knowledge = json.loads(raw)
    analisi = knowledge.get('analisi', [])
    print(f'PDF: {len(analisi)}')

    # Estrai e aggrega tecniche
    SKIP = ['harina de roca', 'non specificat', 'non disponib', 'nessuna tecn', 'nessun']
    tecniche_agg = {}
    for a in analisi:
        pid = a.get('id', '')
        for t in a.get('tecniche_chiave', []):
            t_clean = t.strip()
            if len(t_clean) < 5: continue
            if any(s in t_clean.lower() for s in SKIP): continue
            t_norm = t_clean.lower()
            if t_norm not in tecniche_agg:
                tecniche_agg[t_norm] = {'label': t_clean, 'count': 0, 'pdf_ids': [], 'consigli': [], 'elettro': []}
            tecniche_agg[t_norm]['count'] += 1
            tecniche_agg[t_norm]['pdf_ids'].append(pid)
            c = a.get('consiglio_coltivazione', '')
            if c and len(tecniche_agg[t_norm]['consigli']) < 3:
                tecniche_agg[t_norm]['consigli'].append(c[:120])
            e = a.get('consiglio_elettrocultura', '')
            if e and len(tecniche_agg[t_norm]['elettro']) < 2:
                tecniche_agg[t_norm]['elettro'].append(e[:100])

    print(f'Tecniche uniche grezze: {len(tecniche_agg)}')

    # Dedup greedy: raggruppa varianti dello stesso concetto base
    seen_prefixes = set()
    top_dedup = []
    for t_norm, td in sorted(tecniche_agg.items(), key=lambda x: -x[1]['count']):
        words = t_norm.split()
        prefix = words[0][:8] + (words[1][:5] if len(words) > 1 else '')
        if prefix not in seen_prefixes or td['count'] >= 4:
            top_dedup.append((t_norm, td))
            seen_prefixes.add(prefix)
        if len(top_dedup) >= 40:
            break

    lista_tec = '\n'.join([f'- {td["label"]} ({td["count"]}x)' for _, td in top_dedup])
    print(f'Tecniche uniche dopo dedup: {len(top_dedup)}')

    concetti = []
    if MISTRAL_KEY:
        prompt = (
            'Sei un agronomo esperto di coltivazione Living Soil outdoor in Italia. '
            'Devi creare un indice COMPLETO di tecniche e concetti per una serra outdoor.\n\n'
            '== TECNICHE ESTRATTE DA 89 PDF (principalmente elettrocultura e biofisica) ==\n'
            f'{lista_tec}\n\n'
            '== COMPITO ==\n'
            'Crea esattamente 30-35 concetti distinti suddivisi in DUE GRUPPI:\n\n'
            'GRUPPO A - Dai PDF (12-15 concetti): Usa le tecniche della lista sopra. '
            'Raggruppa varianti identiche in un solo concetto. '
            'Categoria "elettrocultura" per: Lakhovsky, Spirale rame, Antenna terra, Fe-Cu, Acqua magnetizzata, Ighina, campi EM.\n\n'
            'GRUPPO B - Living Soil pratiche (18-20 concetti): Aggiungi concetti pratici di coltivazione outdoor '
            'che un esperto Living Soil userebbe, suddivisi per queste categorie:\n'
            '- suolo (6-7): es. compostaggio, micorrize, biodiversita suolo, ph suolo, pacciamatura, humus, lombrichi\n'
            '- irrigazione (2-3): es. irrigazione goccia, gestione umidita, acqua strutturata\n'
            '- nutrizione (3-4): es. fertilizzazione organica, tè di compost, farine di rocce, aminoacidi\n'
            '- fitosanitario (2-3): es. controllo parassiti, olio di neem, piante companion\n'
            '- raccolta (2-3): es. timing raccolta, essiccazione, cura trichomi\n'
            '- biodinamica (2-3): es. calendario lunare, preparati biodinamici, semine lunari\n\n'
            '== FORMATO RISPOSTA ==\n'
            'Rispondi SOLO con JSON. Nessun testo aggiuntivo.\n'
            'Categorie valide: suolo|irrigazione|nutrizione|elettrocultura|biodinamica|fitosanitario|raccolta|altro\n'
            'fasi_guida valide: germinazione|vegetazione|fioritura|taglio|essiccazione|concia\n'
            '{"concetti":[{"id":"slug_senza_spazi","label":"Nome Pratico","categoria":"elettrocultura",'
            '"descrizione":"Una frase pratica concreta per serra outdoor","istruzioni_pratiche":["azione 1","azione 2","azione 3"],'
            '"varianti":["alt1"],"fasi_guida":["vegetazione","fioritura"],"rilevanza":85,"tag_correlati":["tag1","tag2"]}]}'
        )
        print(f'Prompt inviato: {len(prompt)} chars')
        try:
            risposta = mistral_chat(prompt, max_tokens=8000)
            print(f'Risposta (500 chars): {risposta[:500]}')
            s = risposta.find('{"concetti"')
            if s == -1: s = risposta.find('{')
            e = risposta.rfind('}')
            if s >= 0 and e > s:
                parsed = json.loads(risposta[s:e+1])
                concetti = parsed.get('concetti', [])
                print(f'Concetti Mistral: {len(concetti)}')
            else:
                print('  JSON non trovato nella risposta Mistral')
        except json.JSONDecodeError as ex:
            print(f'  JSON parse error: {ex}')
        except Exception as ex:
            print(f'  Mistral fallito: {ex}')

    if not concetti:
        print('Uso fallback locale...')
        concetti = build_concetti_fallback(tecniche_agg)

    # Post-processing: normalizza IDs, correggi categorie, arricchisci pdf_ids
    used_ids = set()
    for i, c in enumerate(concetti):
        # Normalizza ID
        raw_id = c.get('id', f'concetto_{i}')
        base_id = ''.join(ch if ch.isalnum() else '_' for ch in raw_id.lower())[:28].strip('_')
        uid = base_id if base_id not in used_ids else f'{base_id}_{i}'
        used_ids.add(uid)
        c['id'] = uid

        # Correggi categoria
        c['categoria'] = categorizza_auto(c.get('label', ''), c.get('categoria', 'altro'))

        # Associa pdf_ids se assenti
        if not c.get('pdf_ids'):
            words = [w for w in c.get('label', '').lower().split() if len(w) > 3]
            pdf_ids = []
            for t_norm, tdata in tecniche_agg.items():
                if any(w in t_norm for w in words):
                    pdf_ids.extend(tdata['pdf_ids'])
            c['pdf_ids'] = list(dict.fromkeys(pdf_ids))[:10]
        c['pdf_count'] = len(c.get('pdf_ids', []))

        # Assicura fasi_guida valide
        fasi_valide = {'germinazione', 'vegetazione', 'fioritura', 'taglio', 'essiccazione', 'concia'}
        c['fasi_guida'] = [f for f in c.get('fasi_guida', ['vegetazione']) if f in fasi_valide] or ['vegetazione']

    print(f'\nConcetti totali: {len(concetti)}')

    # Grafo
    nodi = [{'id': c['id'], 'label': c['label'], 'categoria': c.get('categoria', 'altro')} for c in concetti]
    edges = []
    for i, a in enumerate(concetti):
        for j, b in enumerate(concetti):
            if j <= i: continue
            peso = len(set(a.get('tag_correlati', [])) & set(b.get('tag_correlati', []))) * 2
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
           f'BioSerra concetti {oggi} ({len(concetti)} concetti) [Mistral v8]')

    print(f'\n=== COMPLETATO: {len(concetti)} concetti, {len(edges)} edges ===')
    cat_count = {}
    for c in concetti:
        cat = c.get('categoria', 'altro')
        cat_count[cat] = cat_count.get(cat, 0) + 1
    for cat, cnt in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt}')

if __name__ == '__main__':
    main()
