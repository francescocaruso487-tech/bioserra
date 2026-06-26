import os, json, base64, urllib.request, urllib.error, time, datetime, sys, io, re

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
GROQ_KEY = os.environ.get('GROQ_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

# Mappa keyword → tecniche + categoria
ALTA_KEYWORDS = [
    'electroculture','elettrocoltura','electro','lakhovsky','ighina',
    'tesla','soil biology','soil primer','living soil','magnacult',
    'biodinamic','biodynamic','antenna uomo','atomo magnetico',
    'magnetico','agricoltura organica','agricultural testament',
    'frequenz','vibrazion','campi elettromagnetici','elcult','laemstrom',
    'hull','dudgrichelcult','nollet','vegetaux','starterkit'
]

MEDIA_KEYWORDS = [
    'nikola','hermes','kybalion','ermete','corpus hermeticum',
    'ighina','scoperta','pimandro','aradia','strega','luna',
    'chakra','organum','ouspensky','rol ','gustavo','cervello',
    'quantico','gateway','inner eye','book of wisdom','registri',
    'vita segreta','melodie','strega verde','cabala','occulta'
]

def calcola_rilevanza(titolo, tag):
    t = titolo.lower()
    for kw in ALTA_KEYWORDS:
        if kw in t:
            return 'alta'
    tag_alta = {'elettrocultura','living-soil','biodinamica','compost',
                'micorrize','suolo','magnetismo','frequenze','antenna'}
    if len(set(tag) & tag_alta) >= 2:
        return 'alta'
    for kw in MEDIA_KEYWORDS:
        if kw in t:
            return 'media'
    tag_media = {'elettro','rame','spirale','vibrazione','luna','piante'}
    if len(set(tag) & tag_media) >= 1:
        return 'media'
    return 'bassa'

def ricalcola_connessioni(analisi):
    for a in analisi:
        conn = []
        for b in analisi:
            if b['id'] == a['id']: continue
            tag_score = len(set(a.get('tag',[])) & set(b.get('tag',[])))
            tec_score = len(set(a.get('tecniche_chiave',[])) & set(b.get('tecniche_chiave',[]))) * 2
            score = tag_score + tec_score
            if score >= 1:
                conn.append({'id': b['id'], 'titolo': b['titolo'], 'peso': score})
        conn.sort(key=lambda x: -x['peso'])
        a['connessioni'] = conn[:8]
    return analisi

KEYWORD_MAP = {
    'compost': {'tec': 'Compostaggio', 'tag': ['compost','suolo'], 'rel': 'alta'},
    'humus': {'tec': 'Humus e materia organica', 'tag': ['humus','suolo'], 'rel': 'alta'},
    'micorriza': {'tec': 'Micorrize', 'tag': ['micorrize','funghi','suolo'], 'rel': 'alta'},
    'mycorrhiz': {'tec': 'Micorrize', 'tag': ['micorrize','funghi'], 'rel': 'alta'},
    'vermicompost': {'tec': 'Vermicompostaggio', 'tag': ['vermi','compost','suolo'], 'rel': 'alta'},
    'biochar': {'tec': 'Biochar', 'tag': ['biochar','suolo','carbonio'], 'rel': 'alta'},
    'elettrocoltura': {'tec': 'Elettrocultura', 'tag': ['elettrocultura','elettro'], 'rel': 'alta'},
    'electroculture': {'tec': 'Elettrocultura', 'tag': ['elettrocultura','elettro'], 'rel': 'alta'},
    'lakhovsky': {'tec': 'Circuito Lakhovsky', 'tag': ['lakhovsky','elettro','risonanza'], 'rel': 'alta'},
    'copper': {'tec': 'Rame in coltivazione', 'tag': ['rame','elettro'], 'rel': 'alta'},
    'rame': {'tec': 'Spirale cosmica in rame', 'tag': ['rame','elettro','spirale'], 'rel': 'alta'},
    'magnetiz': {'tec': 'Acqua magnetizzata', 'tag': ['acqua','magnetismo','elettro'], 'rel': 'alta'},
    'magnetic': {'tec': 'Campo magnetico per piante', 'tag': ['magnetismo','elettro'], 'rel': 'alta'},
    'antenna': {'tec': 'Antenna terrestre', 'tag': ['antenna','elettro','risonanza'], 'rel': 'alta'},
    'biodinamic': {'tec': 'Agricoltura biodinamica', 'tag': ['biodinamica','steiner'], 'rel': 'alta'},
    'biodynamic': {'tec': 'Agricoltura biodinamica', 'tag': ['biodinamica','steiner'], 'rel': 'alta'},
    'steiner': {'tec': 'Metodo Steiner', 'tag': ['steiner','biodinamica'], 'rel': 'alta'},
    'luna': {'tec': 'Calendario lunare', 'tag': ['luna','biodinamica','calendario'], 'rel': 'alta'},
    'lunar': {'tec': 'Calendario lunare', 'tag': ['luna','biodinamica'], 'rel': 'alta'},
    'living soil': {'tec': 'Living Soil', 'tag': ['living-soil','suolo','microbi'], 'rel': 'alta'},
    'soil biology': {'tec': 'Biologia del suolo', 'tag': ['suolo','microbi'], 'rel': 'alta'},
    'microrganismi': {'tec': 'Microbioma del suolo', 'tag': ['microbi','suolo'], 'rel': 'alta'},
    'microbiome': {'tec': 'Microbioma del suolo', 'tag': ['microbi','suolo'], 'rel': 'alta'},
    'irrigazion': {'tec': 'Irrigazione ottimizzata', 'tag': ['irrigazione','acqua'], 'rel': 'media'},
    'drip': {'tec': 'Irrigazione a goccia', 'tag': ['irrigazione','goccia'], 'rel': 'media'},
    'fertil': {'tec': 'Fertilizzazione organica', 'tag': ['nutrizione','organico'], 'rel': 'media'},
    'azoto': {'tec': 'Gestione azoto organico', 'tag': ['azoto','nutrizione'], 'rel': 'media'},
    'nitrogen': {'tec': 'Gestione azoto', 'tag': ['azoto','nutrizione'], 'rel': 'media'},
    'tesla': {'tec': 'Principi elettromagnetici Tesla', 'tag': ['tesla','elettro','frequenze'], 'rel': 'media'},
    'frequenz': {'tec': 'Frequenze vibrazionali', 'tag': ['frequenze','vibrazione','elettro'], 'rel': 'media'},
    'frequency': {'tec': 'Frequenze vibrazionali', 'tag': ['frequenze','vibrazione'], 'rel': 'media'},
    'vibrazion': {'tec': 'Vibrazione e risonanza', 'tag': ['vibrazione','risonanza'], 'rel': 'media'},
    'piant': {'tec': 'Fisiologia vegetale', 'tag': ['piante','fisiologia'], 'rel': 'media'},
    'plant': {'tec': 'Fisiologia vegetale', 'tag': ['piante','fisiologia'], 'rel': 'media'},
    'root': {'tec': 'Sviluppo radicale', 'tag': ['radici','suolo'], 'rel': 'media'},
    'radice': {'tec': 'Sviluppo radicale', 'tag': ['radici','suolo'], 'rel': 'media'},
    'agricol': {'tec': 'Tecniche agricole', 'tag': ['agricoltura','coltivazione'], 'rel': 'media'},
    'organic': {'tec': 'Agricoltura organica', 'tag': ['organico','biologico'], 'rel': 'media'},
    'ighina': {'tec': 'Atomo magnetico Ighina', 'tag': ['ighina','magnetismo','elettro'], 'rel': 'media'},
    'hermes': {'tec': 'Principi ermetici', 'tag': ['ermetico','filosofia'], 'rel': 'bassa'},
    'kybalio': {'tec': 'Leggi universali Kybalion', 'tag': ['ermetico','leggi'], 'rel': 'bassa'},
}

def estrai_testo_pdf(pdf_bytes):
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        testo = []
        for page in reader.pages[:10]:
            t = page.extract_text()
            if t:
                testo.append(t.strip())
        return '\n'.join(testo)[:5000]
    except Exception as ex:
        print(f'  pypdf: {ex}')
        return ''

def analizza_locale(titolo, testo):
    """Analisi locale con keyword matching — zero API, sempre funziona"""
    testo_lower = (titolo + ' ' + testo).lower()

    tecniche = []
    tags = set()
    rilevanza_punteggio = 0
    max_rel = 'bassa'

    for kw, info in KEYWORD_MAP.items():
        if kw in testo_lower:
            if info['tec'] not in tecniche:
                tecniche.append(info['tec'])
            tags.update(info['tag'])
            if info['rel'] == 'alta':
                rilevanza_punteggio += 3
            elif info['rel'] == 'media':
                rilevanza_punteggio += 1

    if rilevanza_punteggio >= 6:
        max_rel = 'alta'
    elif rilevanza_punteggio >= 2:
        max_rel = 'media'
    else:
        max_rel = 'bassa'

    # Sommario dalle prime righe del testo
    if testo and len(testo) > 50:
        righe = [r.strip() for r in testo.split('\n') if len(r.strip()) > 30][:3]
        sommario = ' '.join(righe)[:250] if righe else f'Documento: {titolo}'
    else:
        sommario = f'Documento analizzato per connessioni con Living Soil e elettrocultura: {titolo}'

    # Estratto chiave
    estratto = ''
    for kw in ['living soil','elettrocultura','lakhovsky','biodinamica','compost','micorriza']:
        idx = testo_lower.find(kw)
        if idx >= 0:
            estratto = testo[max(0,idx-20):idx+120].strip()
            break

    # Consiglio coltivazione
    consigli_map = {
        'alta': f'Applica le tecniche di {tecniche[0] if tecniche else titolo} durante la fase vegetativa',
        'media': f'Esplora i principi di {titolo[:40]} per ottimizzare il microbioma del suolo',
        'bassa': f'Consulta per ispirazione: {titolo[:40]}'
    }

    elettro_kw = ['elettrocultura','lakhovsky','tesla','magnetic','antenna','rame','copper','ighina','frequenz']
    consiglio_elettro = ''
    for ek in elettro_kw:
        if ek in testo_lower:
            consiglio_elettro = f'Principi applicabili a circuito Lakhovsky e spirale cosmica rame'
            break

    return {
        'sommario': sommario[:300],
        'tecniche_chiave': tecniche[:5],
        'consiglio_coltivazione': consigli_map[max_rel],
        'consiglio_elettrocultura': consiglio_elettro,
        'tag': list(tags)[:6],
        'rilevanza': max_rel,
        'estratto_chiave': estratto[:200]
    }

def groq_analizza(titolo, testo):
    if not GROQ_KEY:
        return None
    contenuto = testo[:3000] if testo and len(testo) > 100 else f'Analizza dal titolo: {titolo}'
    prompt = (
        f'Esperto Living Soil Italia. Analizza "{titolo}" per serra outdoor Caserta.\n'
        f'Tecniche attive: Lakhovsky, Fe-Cu, acqua magnetizzata, spirale rame, antenna terra.\n\n'
        f'Testo:\n{contenuto}\n\n'
        f'JSON SOLO:\n'
        f'{{"sommario":"2 frasi","tecniche_chiave":["t1","t2"],'
        f'"consiglio_coltivazione":"azione","consiglio_elettrocultura":"o vuoto",'
        f'"tag":["t1","t2"],"rilevanza":"alta|media|bassa","estratto_chiave":"max 150c"}}'
    )
    body = json.dumps({
        'model': 'llama-3.3-70b-versatile',
        'max_tokens': 600,
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
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.load(r)
        content = resp['choices'][0]['message']['content']
        s, e = content.find('{'), content.rfind('}')
        if s >= 0 and e > s:
            result = json.loads(content[s:e+1])
            print(f'  Groq OK: [{result.get("rilevanza","?")}]')
            return result
    except urllib.error.HTTPError as ex:
        print(f'  Groq HTTP {ex.code}: {ex.read().decode()[:150]}')
    except Exception as ex:
        print(f'  Groq errore: {ex}')
    return None

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

def main():
    oggi = datetime.date.today().isoformat()
    print('=== BioSerra Analisi PDF v8 (locale + Groq opzionale) ===')
    print(f'Groq: {"disponibile" if GROQ_KEY else "non configurato — uso analisi locale"}')

    os.system('pip install pypdf -q 2>/dev/null')

    kdata = gh_get('data/pdf_knowledge.json')
    knowledge = json.loads(base64.b64decode(kdata['content'].replace('\n','')).decode('utf-8'))
    analisi_esistenti = knowledge.get('analisi', [])

    # Separa validi da invalidi
    analisi_valide = [a for a in analisi_esistenti
                      if a.get('sommario','') not in ('Analisi non disponibile', '')]
    titoli_validi = {a['titolo'].strip().lower() for a in analisi_valide}
    print(f'Gia validi: {len(analisi_valide)}')

    manuali = gh_get('MANUALI')
    pdf_files = sorted([f for f in manuali if f['name'].endswith('.pdf')], key=lambda x: x['name'])
    print(f'PDF in MANUALI/: {len(pdf_files)}')

    da_analizzare = [f for f in pdf_files
                     if f['name'].replace('.pdf','').strip().lower() not in titoli_validi]
    print(f'Da analizzare: {len(da_analizzare)}')

    if not da_analizzare:
        print('Tutti i PDF gia analizzati.')
        return

    batch = da_analizzare[:15]
    nuove_analisi = []

    for i, pdf_file in enumerate(batch):
        titolo = pdf_file['name'].replace('.pdf','').strip()
        print(f'\n[{i+1}/{len(batch)}] {titolo[:65]}')

        # Scarica PDF
        pdf_bytes = None
        try:
            pdf_data = gh_get(f"MANUALI/{pdf_file['name']}")
            raw_b64 = pdf_data.get('content','').replace('\n','')
            if raw_b64:
                size_mb = len(raw_b64) * 3 / 4 / 1024 / 1024
                if size_mb < 15:
                    pdf_bytes = base64.b64decode(raw_b64)
                    print(f'  PDF: {size_mb:.1f} MB')
                else:
                    print(f'  PDF {size_mb:.1f}MB — troppo grande, solo titolo')
        except Exception as ex:
            print(f'  Download: {ex}')

        # Estrai testo
        testo = estrai_testo_pdf(pdf_bytes) if pdf_bytes else ''
        if testo:
            print(f'  Testo: {len(testo)} chars')

        # Prova Groq, fallback locale
        result = groq_analizza(titolo, testo) if GROQ_KEY else None
        if not result:
            print('  Uso analisi locale')
            result = analizza_locale(titolo, testo)

        result['titolo'] = titolo
        result['data_analisi'] = oggi
        nuove_analisi.append(result)
        print(f'  [{result.get("rilevanza","?")}] tec:{len(result.get("tecniche_chiave",[]))}')

        time.sleep(2)

    # Assembla
    titoli_nuovi = {a['titolo'].strip().lower() for a in nuove_analisi}
    tutte = [a for a in analisi_valide if a['titolo'].strip().lower() not in titoli_nuovi]
    tutte += nuove_analisi

    for idx, a in enumerate(tutte):
        a['id'] = a.get('id') or f'pdf_{idx}'

    # Ricalcola rilevanza e connessioni per tutti
    for a in tutte:
        a['rilevanza'] = calcola_rilevanza(a.get('titolo',''), a.get('tag',[]))
    tutte = ricalcola_connessioni(tutte)

    knowledge_new = {
        'lastUpdate': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'total_pdf': len(tutte),
        'analisi': tutte
    }

    content_b64 = base64.b64encode(
        json.dumps(knowledge_new, indent=2, ensure_ascii=False).encode()
    ).decode()

    sha_fresco = gh_get('data/pdf_knowledge.json')['sha']
    gh_put('data/pdf_knowledge.json', content_b64, sha_fresco,
           f'BioSerra PDF {oggi} (+{len(nuove_analisi)}, tot:{len(tutte)}/89)')

    print(f'\n=== +{len(nuove_analisi)} analizzati, totale: {len(tutte)}/89 ===')
    rils = {}
    for a in nuove_analisi:
        rils[a.get('rilevanza','bassa')] = rils.get(a.get('rilevanza','bassa'),0)+1
    for r, c in sorted(rils.items()):
        print(f'  {r}: {c}')

if __name__ == '__main__':
    main()
