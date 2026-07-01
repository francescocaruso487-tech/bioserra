"""
analisi_pdf.py v13 — Legge testi da data/testi/ (pre-estratti con OCR)
Passa testo completo a Mistral in chunk, produce analisi ricca
"""
import os, json, base64, urllib.request, urllib.error, time, datetime, io, re, sys

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}
RAW_BASE = f'https://raw.githubusercontent.com/{REPO}/main/'

# Campi testo GENERATO (no id/testo_id/fonte_web: chiavi tecniche e URL, mai toccare)
SANITIZE_FIELDS = ['titolo', 'sommario', 'consiglio_coltivazione', 'consiglio_elettrocultura', 'estratto_chiave']

def sanitize_testo(t):
    """Regola progetto: niente 'cannabis' nel testo generato/mostrato — sostituisce con 'pianta'."""
    if not t or not isinstance(t, str):
        return t
    t = re.sub(r'\s*\(\s*[Cc]annabis\s+sativa\s+L\.?\s*\)', '', t)
    t = re.sub(r'\bpianta\s+di\s+[Cc]annabis\b', 'pianta', t, flags=re.IGNORECASE)
    t = t.replace('CANNABIS', 'PIANTA')
    t = t.replace('Cannabis', 'Pianta')
    t = t.replace('cannabis', 'pianta')
    return t

def sanitizza_entry(a):
    for campo in SANITIZE_FIELDS:
        if campo in a and isinstance(a[campo], str):
            a[campo] = sanitize_testo(a[campo])
    return a

def gh_get(path):
    """Resiliente: 3 tentativi, timeout, rilancia l'ultima eccezione se falliscono tutti."""
    last_ex = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            # File >1MB: GitHub API restituisce content:'' — usa raw URL
            if isinstance(d, dict) and d.get('content','') == '' and d.get('size',0) > 0:
                raw_url = f'https://raw.githubusercontent.com/{REPO}/main/{path}'
                req2 = urllib.request.Request(raw_url,
                    headers={'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(req2, timeout=30) as r2:
                    raw = r2.read().decode('utf-8')
                return {'content': base64.b64encode(raw.encode()).decode(), 'sha': d.get('sha','')}
            return d
        except Exception as ex:
            last_ex = ex
            print(f'  gh_get tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    raise last_ex

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

def gh_get_sha(path):
    try: return gh_get(path)['sha']
    except: return None

def leggi_testo_estratto(safe_id):
    """Legge file testo pre-estratto da data/testi/."""
    url = RAW_BASE + f'data/testi/{safe_id}.txt'
    try:
        req = urllib.request.Request(url, headers={
            'Authorization': f'token {GITHUB_TOKEN}',
            'Cache-Control': 'no-cache'
        })
        with urllib.request.urlopen(req, timeout=30) as r:
            content = r.read().decode('utf-8', errors='replace')
        # Rimuovi header
        if content.startswith('==='):
            idx = content.find('\n\n')
            if idx > 0:
                content = content[idx+2:]
        return content.strip()
    except:
        return ''

def titolo_safe(nome_file):
    base = nome_file.replace('.pdf', '').strip()
    safe = re.sub(r'[^\w\-]', '_', base)
    safe = re.sub(r'_+', '_', safe).strip('_')
    return safe[:80]

def rileva_lingua(testo):
    """Rilevazione lingua via parole funzione. Fallback robusto per campo lingua."""
    t1k = (' ' + (testo or '')[:2000].lower() + ' ')
    def _score(t, words): return sum(t.count(w) for w in words)
    scores = {
        'it': _score(t1k,[' il ',' la ',' di ',' che ',' per ',' con ',' del ',' una ',' sono ',' alle ']),
        'en': _score(t1k,[' the ',' of ',' and ',' for ',' with ',' this ',' are ',' is ',' in ',' to ']),
        'fr': _score(t1k,[' le ',' la ',' les ',' des ',' du ',' pour ',' dans ',' est ',' et ']),
        'es': _score(t1k,[' el ',' los ',' las ',' de ',' del ',' para ',' con ',' que ',' es ']),
        'de': _score(t1k,[' der ',' die ',' das ',' und ',' fur ',' mit ',' ein ',' ist ']),
    }
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 2 else 'altro'

def mistral_analizza_completo(titolo, testo_completo):
    """Analisi Mistral con testo completo suddiviso in chunk."""
    if not MISTRAL_KEY:
        return None

    titolo_safe_str = titolo.replace('"', "'")[:80]

    # Se testo corto, una sola chiamata
    if len(testo_completo) <= 4000:
        return mistral_singola(titolo_safe_str, testo_completo, testo_completo)

    # Testo lungo: prima chunk (inizio) + ultima chunk (fine) + sommario intermedio
    inizio = testo_completo[:3000]
    fine   = testo_completo[-2000:] if len(testo_completo) > 5000 else ''
    medio  = testo_completo[3000:6000] if len(testo_completo) > 3000 else ''

    # Chiamata 1: analisi inizio documento
    risultato = mistral_singola(titolo_safe_str, inizio, testo_completo[:500])
    if not risultato:
        return None

    # Chiamata 2: integra con fine documento (se significativa)
    if fine and len(fine) > 200:
        integrazione = mistral_integra(titolo_safe_str, risultato, medio + '\n...\n' + fine)
        if integrazione:
            risultato = integrazione

    return risultato

def mistral_singola(titolo, testo, estratto_raw):
    """Singola chiamata Mistral per analisi documento."""
    ha_testo = len(testo) > 100
    contenuto = testo[:4000] if ha_testo else '(testo non disponibile, analizza dal titolo)'

    # Rileva lingua del testo
    def _score(t, words): return sum(t.count(w) for w in words)
    t1k = contenuto[:1000].lower()
    lingua_scores = {
        'it': _score(t1k,[' il ',' lo ',' la ',' gli ',' della ',' del ',' per ',' con ',' che ',' sono ']),
        'en': _score(t1k,[' the ',' of ',' and ',' for ',' with ',' this ',' are ',' is ',' in ',' to ']),
        'fr': _score(t1k,[' le ',' la ',' les ',' des ',' du ',' pour ',' dans ',' est ',' et ']),
        'es': _score(t1k,[' el ',' los ',' las ',' de ',' del ',' para ',' con ',' que ',' es ']),
        'de': _score(t1k,[' der ',' die ',' das ',' und ',' fur ',' mit ',' ein ',' ist ']),
    }
    lingua_det = max(lingua_scores, key=lambda k: lingua_scores[k]) if max(lingua_scores.values())>2 else 'altro'
    lingua_nota = '' if lingua_det=='it' else f'NOTA: Il testo e in {lingua_det.upper()}. Rispondi comunque in italiano.\n'

    prompt = (
        'Sei un agronomo esperto di Living Soil, biodinamica ed elettrocultura per serra outdoor italiana.\n'
        'Analizza questo documento per la serra BioSerra Caserta (41N).\n'
        'Tecniche attive: Lakhovsky, Fe-Cu, acqua magnetizzata, spirale rame, antenna terra, biodinamica.\n'
        + lingua_nota +
        f'Titolo: {titolo}\n'
        f'Testo estratto:\n{contenuto}\n\n'
        'Rispondi SOLO con JSON valido (tutti i campi in italiano):\n'
        '{"sommario":"3-4 frasi dettagliate sul contenuto reale",'
        '"tecniche_chiave":["max 5 tecniche specifiche menzionate"],'
        '"concetti_principali":["concetti teorici chiave del documento"],'
        '"consiglio_coltivazione":"azione pratica concreta e specifica",'
        '"consiglio_elettrocultura":"applicazione specifica delle tecniche elettrocultura",'
        '"tag":["4-6 tag specifici"],'
        '"estratto_chiave":"frase o passaggio significativo max 200 char",'
        '"lingua":"codice lingua originale: it/en/fr/es/de/pt/altro",'
        '"applicabilita_serra":"alta/media/bassa - perche"}'
    )

    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': 600,
        'temperature': 0.0,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()

    try:
        req = urllib.request.Request(
            'https://api.mistral.ai/v1/chat/completions',
            data=body,
            headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
            method='POST')
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())
        raw = resp['choices'][0]['message']['content'].strip()
        s, e = raw.find('{'), raw.rfind('}')
        if s >= 0 and e > s:
            return json.loads(raw[s:e+1])
    except Exception as ex:
        print(f'  mistral_singola ERR: {ex}')
    return None

def mistral_integra(titolo, risultato_base, testo_aggiuntivo):
    """Seconda chiamata: integra analisi con resto del documento."""
    sommario_base = risultato_base.get('sommario', '')
    tecniche_base = risultato_base.get('tecniche_chiave', [])

    prompt = (
        f'Documento: {titolo}\n'
        f'Analisi parziale già fatta:\n'
        f'Sommario: {sommario_base}\n'
        f'Tecniche: {", ".join(tecniche_base)}\n\n'
        f'Testo aggiuntivo del documento:\n{testo_aggiuntivo[:3000]}\n\n'
        'Aggiorna e arricchisci l\'analisi integrando le nuove informazioni.\n'
        'Rispondi SOLO con JSON:\n'
        '{"sommario":"versione aggiornata e completa",'
        '"tecniche_chiave":["lista aggiornata"],'
        '"concetti_principali":["lista aggiornata"],'
        '"consiglio_coltivazione":"consiglio aggiornato",'
        '"consiglio_elettrocultura":"applicazione aggiornata",'
        '"tag":["tag aggiornati"],'
        '"estratto_chiave":"estratto piu significativo",'
        '"applicabilita_serra":"alta/media/bassa - perche"}'
    )

    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': 600,
        'temperature': 0.0,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()

    try:
        req = urllib.request.Request(
            'https://api.mistral.ai/v1/chat/completions',
            data=body,
            headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
            method='POST')
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.loads(r.read())
        raw = resp['choices'][0]['message']['content'].strip()
        s, e = raw.find('{'), raw.rfind('}')
        if s >= 0 and e > s:
            return json.loads(raw[s:e+1])
    except Exception as ex:
        print(f'  mistral_integra ERR: {ex}')
    return None

def analizza_locale(titolo, testo):
    KW = {
        'compost': ('Compostaggio', 'suolo'), 'humus': ('Humus', 'suolo'),
        'micorriza': ('Micorrize', 'suolo'), 'mycorrhiz': ('Micorrize', 'suolo'),
        'biochar': ('Biochar', 'suolo'), 'vermicompost': ('Vermicompostaggio', 'suolo'),
        'elettrocoltura': ('Elettrocultura', 'elettrocultura'),
        'electroculture': ('Elettrocultura', 'elettrocultura'),
        'lakhovsky': ('Circuito Lakhovsky', 'elettrocultura'),
        'rame': ('Spirale cosmica rame', 'elettrocultura'),
        'copper': ('Rame in coltivazione', 'elettrocultura'),
        'magnetiz': ('Acqua magnetizzata', 'elettrocultura'),
        'antenna': ('Antenna terrestre', 'elettrocultura'),
        'biodinamic': ('Biodinamica', 'biodinamica'),
        'biodynamic': ('Biodinamica', 'biodinamica'),
        'steiner': ('Metodo Steiner', 'biodinamica'),
        'living soil': ('Living Soil', 'suolo'),
        'tesla': ('Principi Tesla', 'elettrocultura'),
        'ighina': ('Atomo magnetico Ighina', 'elettrocultura'),
    }
    tl = (titolo + ' ' + testo).lower()
    tecniche, tags = [], set()
    for kw, (tec, tag) in KW.items():
        if kw in tl and tec not in tecniche:
            tecniche.append(tec); tags.add(tag)
    return {
        'sommario': f'Documento BioSerra: {titolo[:100]}',
        'tecniche_chiave': tecniche[:5],
        'concetti_principali': [],
        'consiglio_coltivazione': f'Consulta il documento per tecniche specifiche',
        'consiglio_elettrocultura': '',
        'tag': list(tags)[:6],
        'estratto_chiave': '',
        'applicabilita_serra': 'media - da valutare'
    }

def ricalcola_connessioni(analisi):
    for a in analisi:
        conn = []
        for b in analisi:
            if b['id'] == a['id']: continue
            tag_s = len(set(a.get('tag',[]) ) & set(b.get('tag',[])))
            tec_s = len(set(a.get('tecniche_chiave',[])) & set(b.get('tecniche_chiave',[]))) * 2
            conc_s = len(set(a.get('concetti_principali',[])) & set(b.get('concetti_principali',[])))
            score = tag_s + tec_s + conc_s
            if score >= 1:
                conn.append({'id': b['id'], 'titolo': b['titolo'], 'peso': score})
        conn.sort(key=lambda x: -x['peso'])
        a['connessioni'] = conn[:10]
    return analisi

def main():
    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Analisi PDF v13 (da testi pre-estratti) — {oggi} ===')
    print(f'MISTRAL_KEY: {"OK " + MISTRAL_KEY[:8] + "..." if MISTRAL_KEY else "ASSENTE"}')

    # Carica pdf_knowledge esistente
    try:
        kdata = gh_get('data/pdf_knowledge.json')
    except Exception as ex:
        print(f'ERRORE CRITICO: lettura pdf_knowledge.json fallita dopo 3 tentativi: {ex}')
        sys.exit(1)
    knowledge = json.loads(base64.b64decode(kdata['content'].replace('\n','')).decode('utf-8'))
    analisi_esistenti = knowledge.get('analisi', [])

    # Carica lista testi estratti
    try:
        testi_list = gh_get('data/testi')
        testi_disponibili = {f['name'].replace('.txt',''): True
                             for f in testi_list if f['name'].endswith('.txt')}
    except:
        testi_disponibili = {}
    print(f'Testi disponibili in data/testi/: {len(testi_disponibili)}')

    # Carica lista PDF in MANUALI
    try:
        manuali = gh_get('MANUALI')
    except Exception as ex:
        print(f'ERRORE CRITICO: lettura MANUALI fallita dopo 3 tentativi: {ex}')
        sys.exit(1)
    pdf_files = sorted([f for f in manuali if f['name'].endswith('.pdf')], key=lambda x: x['name'])

    # Costruisci mappa titolo -> analisi esistente
    by_titolo = {}
    for a in analisi_esistenti:
        by_titolo[a.get('titolo','').strip().lower()] = a

    # Identifica PDF con testo disponibile MA analisi scarsa (da rianalizzare)
    # Criteri: ha testo estratto E (non mistral_analizzato O sommario <150c O no concetti_principali)
    da_rianalizzare = []
    for pdf_file in pdf_files:
        titolo = pdf_file['name'].replace('.pdf','').strip()
        safe_id = titolo_safe(pdf_file['name'])
        ha_testo = safe_id in testi_disponibili
        analisi_curr = by_titolo.get(titolo.lower())
        analisi_scarsa = (not analisi_curr or
                          not analisi_curr.get('mistral_analizzato') or
                          len(analisi_curr.get('sommario','')) < 150 or
                          not analisi_curr.get('concetti_principali'))
        if ha_testo and analisi_scarsa:
            da_rianalizzare.append((pdf_file, safe_id, titolo))

    print(f'PDF con testo + analisi scarsa: {len(da_rianalizzare)}')

    if not da_rianalizzare:
        print('Tutto aggiornato — ricalcolo connessioni')
        analisi_esistenti = [sanitizza_entry(a) for a in analisi_esistenti]
        knowledge['analisi'] = ricalcola_connessioni(analisi_esistenti)
        knowledge['lastUpdate'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        content_json = json.dumps(knowledge, indent=2, ensure_ascii=False)
        sha = gh_get_sha('data/pdf_knowledge.json')
        res = gh_put('data/pdf_knowledge.json', content_json, sha, f'PDF v13 {oggi} connessioni')
        if res is None:
            print('  ERRORE CRITICO: salvataggio pdf_knowledge.json fallito dopo 3 tentativi')
        return

    # Batch: 10 per notte (veloce perché il testo è già estratto)
    batch = da_rianalizzare[:20]  # 20 per notte (testo gia estratto, veloce)
    nuove = []
    mistral_count = 0

    for i, (pdf_file, safe_id, titolo) in enumerate(batch):
        print(f'\n[{i+1}/{len(batch)}] {titolo[:65]}')

        # Leggi testo pre-estratto
        testo = leggi_testo_estratto(safe_id)
        print(f'  Testo: {len(testo)} chars')

        if len(testo) < 50:
            print('  Testo troppo corto, skip')
            continue

        # Analisi Mistral con testo completo
        result = mistral_analizza_completo(titolo, testo) if MISTRAL_KEY else None
        mistral_ok = result is not None

        if not result:
            print('  Fallback locale')
            result = analizza_locale(titolo, testo)

        if mistral_ok:
            mistral_count += 1
            n_chunk = 2 if len(testo) > 4000 else 1
            print(f'  Mistral OK: sommario={len(result.get("sommario",""))}c chunk={n_chunk}')
        else:
            print(f'  Locale: {len(result.get("sommario",""))}c')

        # Mantieni id esistente se c'è
        analisi_curr = by_titolo.get(titolo.lower(), {})
        result['id']   = analisi_curr.get('id') or f'pdf_{len(analisi_esistenti)+i}'
        result['titolo'] = titolo
        result['data_analisi'] = oggi
        result['rilevanza'] = 'alta'
        # Campo lingua: usa quello di Mistral, altrimenti rilevazione locale
        if not result.get('lingua') or result.get('lingua') not in ('it','en','fr','es','de','pt','altro'):
            prev_lng = analisi_curr.get('lingua')
            result['lingua'] = prev_lng if prev_lng in ('it','en','fr','es','de','pt','altro') else rileva_lingua(testo)
        result['mistral_analizzato'] = mistral_ok
        result['testo_chars'] = len(testo)
        result['testo_id'] = safe_id
        sanitizza_entry(result)
        nuove.append(result)

        time.sleep(1)

    # Merge
    titoli_nuovi = {a['titolo'].strip().lower() for a in nuove}
    tutte = [a for a in analisi_esistenti if a.get('titolo','').strip().lower() not in titoli_nuovi]
    tutte += nuove
    for idx, a in enumerate(tutte):
        if not a.get('id'):
            a['id'] = f'pdf_{idx}'
        a['rilevanza'] = 'alta'

    tutte = ricalcola_connessioni(tutte)
    tutte = [sanitizza_entry(a) for a in tutte]

    knowledge_new = {
        'lastUpdate': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'total_pdf': len(tutte),
        'analisi': tutte
    }

    content_json = json.dumps(knowledge_new, indent=2, ensure_ascii=False)
    sha_fresco = gh_get_sha('data/pdf_knowledge.json')
    res = gh_put('data/pdf_knowledge.json', content_json, sha_fresco,
           f'PDF v13 {oggi} (+{len(nuove)} mistral:{mistral_count} tot:{len(tutte)}/89)')
    if res is None:
        print('  ERRORE CRITICO: salvataggio pdf_knowledge.json fallito dopo 3 tentativi')

    print(f'\n=== +{len(nuove)} | tot:{len(tutte)}/89 | Mistral:{mistral_count} ===')

if __name__ == '__main__':
    main()
