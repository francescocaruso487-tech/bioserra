import os, json, base64, urllib.request, urllib.error, time, sys

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
MISTRAL_KEY = os.environ.get('MISTRAL_KEY', '')
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

def mistral_chat(prompt, max_tokens=6000):
    print(f'  MISTRAL_KEY presente: {"si" if MISTRAL_KEY else "NO"}')
    if not MISTRAL_KEY:
        raise Exception('MISTRAL_KEY non impostata')
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': max_tokens,
        'temperature': 0.15,
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
    tokens_used = resp.get('usage', {}).get('total_tokens', 0)
    print(f'  Mistral OK: {len(content)} chars, {tokens_used} tokens')
    return content

def build_concetti_fallback(tecniche_agg, analisi):
    """Fallback locale senza LLM"""
    print('  Costruisco concetti da tecniche (fallback)...')
    CATEGORIE_MAP = {
        'compost': 'suolo', 'humus': 'suolo', 'suolo': 'suolo', 'terra': 'suolo',
        'microbi': 'suolo', 'fungh': 'suolo', 'micoriz': 'suolo', 'ammendant': 'suolo',
        'pacciamatura': 'suolo', 'geobiolog': 'suolo', 'mappatura': 'suolo',
        'irrigazion': 'irrigazione', 'acqua': 'irrigazione', 'drip': 'irrigazione',
        'goccia': 'irrigazione', 'humid': 'irrigazione', 'ionizzata': 'irrigazione',
        'nutri': 'nutrizione', 'fertiliz': 'nutrizione', 'azoto': 'nutrizione',
        'fosforo': 'nutrizione', 'potassio': 'nutrizione', 'farina': 'nutrizione',
        'elettro': 'elettrocultura', 'lakhovsky': 'elettrocultura', 'galvanic': 'elettrocultura',
        'rame': 'elettrocultura', 'antenna': 'elettrocultura', 'magnetiz': 'elettrocultura',
        'risonanz': 'elettrocultura', 'spirale': 'elettrocultura', 'pantacolo': 'elettrocultura',
        'fe-cu': 'elettrocultura', 'ferro-rame': 'elettrocultura', 'ighina': 'elettrocultura',
        'biodinam': 'biodinamica', 'luna': 'biodinamica', 'steiner': 'biodinamica',
        'calendario': 'biodinamica', 'cosm': 'biodinamica',
        'parassit': 'fitosanitario', 'malattia': 'fitosanitario', 'insetti': 'fitosanitario',
        'difesa': 'fitosanitario', 'trappola': 'fitosanitario',
        'raccolt': 'raccolta', 'fioritura': 'raccolta', 'maturaz': 'raccolta',
        'essiccaz': 'raccolta', 'taglio': 'raccolta',
    }
    def categorizza(label):
        l = label.lower()
        for kw, cat in CATEGORIE_MAP.items():
            if kw in l: return cat
        return 'altro'

    # Dedup: raggruppa varianti dello stesso concetto base
    GRUPPI = {
        'acqua magnetizzata': ['acqua magnetizzata'],
        'antenna di terra': ['antenna di terra', 'antenna terra'],
        'spirale in rame': ['spirale rame', 'spirale in rame', 'spirale di rame'],
        'lakhovsky': ['lakhovsky', 'risonanza di lakhovsky', 'risonanza cellulare (lakhovsky)'],
        'fe-cu (ferro-rame)': ['fe-cu', 'fe-cu (ferro-rame)', 'interazione metalli (fe-cu)'],
        'campi elettromagnetici': ['campi elettromagnetici naturali', 'campi elettromagnetici controllati'],
        'farine di rocce': ['farine di rocce'],
        'salute del suolo': ['salute del suolo', 'agricoltura biologica'],
        'atomo magnetico di ighina': ['atomo magnetico di ighina'],
        'pacciamatura': ['pacciamatura'],
        'mappatura geobiologica': ['mappatura geobiologica', 'geobiolog'],
    }

    concetti = []
    used_ids = set()
    for label_principale, varianti_kw in GRUPPI.items():
        count_tot = 0
        pdf_ids_set = []
        consigli = []
        elettro = []
        for t_norm, td in tecniche_agg.items():
            if any(kw in t_norm for kw in varianti_kw):
                count_tot += td['count']
                pdf_ids_set.extend(td['pdf_ids'])
                consigli.extend(td['consigli'])
                elettro.extend(td['elettro'])
        if count_tot == 0: continue
        cat = categorizza(label_principale)
        consiglio = consigli[0] if consigli else f'Applica {label_principale} regolarmente'
        base_id = ''.join(ch if ch.isalnum() else '_' for ch in label_principale.lower())[:25].strip('_')
        uid = base_id if base_id not in used_ids else f'{base_id}_{len(used_ids)}'
        used_ids.add(uid)
        concetti.append({
            'id': uid, 'label': label_principale.title(), 'categoria': cat,
            'descrizione': f'{label_principale.title()} citata in {count_tot} documenti. {consiglio}',
            'istruzioni_pratiche': ([consiglio] + (elettro[:1] if elettro else []) + ['Monitora i risultati'])[:3],
            'varianti': list(set(varianti_kw))[:3],
            'fasi_guida': ['vegetazione', 'fioritura'],
            'rilevanza': min(95, 50 + count_tot * 2),
            'tag_correlati': [cat, 'living-soil'],
            'pdf_ids': list(dict.fromkeys(pdf_ids_set))[:10],
            'pdf_count': min(len(set(pdf_ids_set)), 10)
        })
    return concetti

def main():
    oggi = __import__('datetime').date.today().isoformat()
    print('=== BioSerra Concetti Index v7 (Mistral) ===')

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

    print(f'Tecniche uniche: {len(tecniche_agg)}')

    # Raggruppa varianti simili prima di mandare a Mistral
    # Prendi top per count ma dedup semplice: salta varianti di concetti gia inclusi
    top_raw = sorted(tecniche_agg.items(), key=lambda x: -x[1]['count'])
    # Dedup greedy: se una tecnica contiene le stesse prime 8 lettere di una gia inclusa, salta
    top_dedup = []
    seen_prefixes = set()
    for t_norm, td in top_raw:
        words = t_norm.split()
        prefix = (words[0][:8] + (words[1][:5] if len(words) > 1 else ''))
        if prefix not in seen_prefixes or td['count'] >= 5:
            top_dedup.append((t_norm, td))
            seen_prefixes.add(prefix)
        if len(top_dedup) >= 50:
            break

    lista_tec = '\n'.join([f'- {td["label"]} ({td["count"]} occorrenze)' for _, td in top_dedup])
    print(f'Tecniche inviate a Mistral (dopo dedup): {len(top_dedup)}')

    # Estrai anche sommari e consigli per dare contesto
    sommari_sample = []
    for a in analisi[:15]:
        s = a.get('sommario', '')
        if s and len(s) > 20:
            sommari_sample.append(s[:100])

    contesto_sommari = '\n'.join([f'- {s}' for s in sommari_sample[:8]])

    concetti = []
    if MISTRAL_KEY:
        prompt = (
            'Sei un agronomo esperto di coltivazione Living Soil outdoor in Italia. '
            'Hai analizzato 89 manuali scientifici principalmente su elettrocultura, biofisica e agricoltura energetica. '
            'Devi creare un indice pratico di 25-35 concetti applicabili in una serra outdoor.\n\n'
            '=== TECNICHE ESTRATTE DAI PDF (con frequenza) ===\n'
            f'{lista_tec}\n\n'
            '=== CONTESTO: estratti dai sommari PDF ===\n'
            f'{contesto_sommari}\n\n'
            '=== ISTRUZIONI ===\n'
            '1. Raggruppa varianti identiche (es: "Spirale rame", "Spirale in rame", "spirale di rame" -> un solo concetto "Spirale in Rame")\n'
            '2. I concetti di elettrocultura (Lakhovsky, Fe-Cu, Spirale, Antenna, Acqua magnetizzata) devono essere DETTAGLIATI e SEPARATI\n'
            '3. Aggiungi 8-12 concetti di coltivazione Living Soil PRATICI che un esperto outdoor userebbe:\n'
            '   (es: gestione suolo vivente, compostaggio, micorrize, irrigazione, nutrizione organica, '
            '   fotoperiodo, gestione fioritura, essiccazione, cura radici, biodiversita, ph suolo, ecc.)\n'
            '4. Categoria: suolo|irrigazione|nutrizione|elettrocultura|biodinamica|fitosanitario|raccolta|altro\n'
            '5. fasi_guida: scegli tra [germinazione, vegetazione, fioritura, taglio, essiccazione, concia]\n'
            '6. istruzioni_pratiche: 3 passi CONCRETI e APPLICABILI in serra outdoor\n'
            '7. rilevanza: 1-100 (elettrocultura alta, tecniche comuni media)\n'
            '8. id: slug senza spazi (es: spirale_rame, acqua_magnetizzata, gestione_suolo)\n\n'
            'Rispondi SOLO con JSON valido, nessun testo prima o dopo:\n'
            '{"concetti":[{"id":"slug","label":"Nome Completo","categoria":"categoria","descrizione":"2 frasi pratiche",'
            '"istruzioni_pratiche":["passo1","passo2","passo3"],"varianti":["variante1"],'
            '"fasi_guida":["vegetazione"],"rilevanza":80,"tag_correlati":["tag1","tag2"]}]}'
        )
        print(f'Prompt: {len(prompt)} chars')
        try:
            risposta = mistral_chat(prompt, max_tokens=8000)
            print(f'Risposta (400 chars): {risposta[:400]}')
            # Estrai JSON robusto
            s = risposta.find('{"concetti"')
            if s == -1: s = risposta.find('{')
            e = risposta.rfind('}')
            if s >= 0 and e > s:
                parsed = json.loads(risposta[s:e+1])
                concetti = parsed.get('concetti', [])
                print(f'Concetti Mistral: {len(concetti)}')
            else:
                print('  JSON non trovato')
        except json.JSONDecodeError as ex:
            print(f'  JSON parse error: {ex}')
        except Exception as ex:
            print(f'  Mistral fallito: {ex}')

    if not concetti:
        print('Uso fallback locale...')
        concetti = build_concetti_fallback(tecniche_agg, analisi)

    # Normalizza IDs e arricchisci pdf_ids
    used_ids = set()
    for i, c in enumerate(concetti):
        raw_id = c.get('id', f'concetto_{i}')
        base_id = ''.join(ch if ch.isalnum() else '_' for ch in raw_id.lower())[:25].strip('_')
        uid = base_id if base_id not in used_ids else f'{base_id}_{i}'
        used_ids.add(uid)
        c['id'] = uid

        if not c.get('pdf_ids'):
            words = [w for w in c.get('label', '').lower().split() if len(w) > 3]
            pdf_ids = []
            for t_norm, tdata in tecniche_agg.items():
                if any(w in t_norm for w in words):
                    pdf_ids.extend(tdata['pdf_ids'])
            c['pdf_ids'] = list(dict.fromkeys(pdf_ids))[:10]
        c['pdf_count'] = len(c.get('pdf_ids', []))

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
           f'BioSerra concetti {oggi} ({len(concetti)} concetti) [Mistral v7]')

    print(f'\n=== COMPLETATO: {len(concetti)} concetti, {len(edges)} edges ===')
    cat_count = {}
    for c in concetti:
        cat = c.get('categoria', 'altro')
        cat_count[cat] = cat_count.get(cat, 0) + 1
    for cat, cnt in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt}')

if __name__ == '__main__':
    main()
