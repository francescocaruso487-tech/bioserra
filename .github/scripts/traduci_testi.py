"""
traduci_testi.py — BioSerra
Traduce in italiano i testi estratti dai PDF non in italiano.
Batch: 10 file per run. Sovrascrive il .txt originale.
Salva campo 'lingua' in pdf_knowledge.json per ogni PDF.
"""
import os, json, base64, urllib.request, urllib.parse, time, re, unicodedata

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY','')
REPO         = 'francescocaruso487-tech/bioserra'
HEADERS_GH   = {'Authorization': f'token {GITHUB_TOKEN}', 'Accept': 'application/vnd.github.v3+json'}
RAW          = f'https://raw.githubusercontent.com/{REPO}/main/'
BATCH_SIZE   = 15   # Rev.25: alzato da 10 — ora include anche i chunk, backfill più veloce
CHARS_CHUNK  = 3500   # chars per chunk da tradurre (Mistral ~4k token safe)

# ── Utilità GitHub ───────────────────────────────────────────────

def gh_get(path):
    """Resiliente: 3 tentativi, timeout, rilancia l'ultima eccezione se falliscono tutti."""
    last_ex = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{urllib.parse.quote(path)}',
                headers=HEADERS_GH)
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            if not d.get('content','').strip():
                raw_url = RAW + path
                req2 = urllib.request.Request(raw_url,
                    headers={'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(req2, timeout=30) as r2:
                    return r2.read().decode('utf-8'), d['sha']
            return base64.b64decode(d['content'].replace('\n','')).decode('utf-8'), d['sha']
        except Exception as ex:
            last_ex = ex
            print(f'  gh_get tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    raise last_ex

def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{urllib.parse.quote(path)}',
            headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)['sha']
    except Exception:
        return None

def gh_put(path, content_str, sha, message):
    """Resiliente: 3 tentativi, SHA sempre fresco, mai solleva eccezioni (None se fallisce)."""
    content_b64 = base64.b64encode(content_str.encode('utf-8')).decode()
    for attempt in range(3):
        try:
            sha_fresco = gh_get_sha(path)
            body = {'message': message, 'content': content_b64, 'branch': 'main'}
            if sha_fresco:
                body['sha'] = sha_fresco
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{urllib.parse.quote(path)}',
                data=json.dumps(body).encode(),
                headers={**HEADERS_GH, 'Content-Type': 'application/json'},
                method='PUT')
            with urllib.request.urlopen(req) as r:
                return json.load(r)
        except Exception as ex:
            print(f'  gh_put tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    return None

def gh_list(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{urllib.parse.quote(path)}',
        headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def gh_raw(path):
    """Resiliente: 3 tentativi, rilancia l'ultima eccezione se falliscono tutti."""
    last_ex = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(RAW + path,
                headers={'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', errors='replace')
        except Exception as ex:
            last_ex = ex
            print(f'  gh_raw tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    raise last_ex

# ── Rilevamento lingua ───────────────────────────────────────────

def rileva_lingua(testo):
    """Stima lingua dal testo (primi 1000 chars). Restituisce: 'it','en','fr','es','de','pt','altro'."""
    t = testo[:1000].lower()
    scores = {
        'en': sum(t.count(w) for w in [' the ',' of ',' and ',' for ',' with ',' this ',' that ',' are ',' is ',' in ',' to ']),
        'fr': sum(t.count(w) for w in [' le ',' la ',' les ',' des ',' du ',' pour ',' dans ',' est ',' et ',' une ',' pas ']),
        'es': sum(t.count(w) for w in [' el ',' la ',' los ',' las ',' de ',' del ',' para ',' con ',' una ',' que ',' es ']),
        'de': sum(t.count(w) for w in [' der ',' die ',' das ',' und ',' für ',' mit ',' ein ',' ist ',' auf ',' dem ']),
        'it': sum(t.count(w) for w in [' il ',' lo ',' la ',' gli ',' della ',' del ',' per ',' con ',' una ',' che ',' sono ',' questo ']),
        'pt': sum(t.count(w) for w in [' o ',' a ',' os ',' as ',' de ',' do ',' para ',' com ',' uma ',' que ',' são ']),
    }
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 3 else 'altro'

# ── Traduzione Mistral ───────────────────────────────────────────

def traduci_chunk(chunk, lingua_src, titolo):
    """Traduce un chunk di testo in italiano via Mistral."""
    lang_map = {'en':'inglese','fr':'francese','es':'spagnolo','de':'tedesco','pt':'portoghese','altro':'lingua straniera'}
    lang_label = lang_map.get(lingua_src, 'lingua straniera')
    prompt = (
        f'Sei un traduttore tecnico specializzato in agricoltura biologica, elettrocultura e biodinamica.\n'
        f'Traduci fedelmente in italiano il seguente testo estratto da "{titolo}" ({lang_label}).\n'
        f'Mantieni tutti i termini tecnici, numeri, misure e riferimenti. '
        f'Non aggiungere spiegazioni. Restituisci SOLO il testo tradotto.\n\n'
        f'TESTO:\n{chunk}'
    )
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': 2000,
        'temperature': 0.0,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    try:
        req = urllib.request.Request(
            'https://api.mistral.ai/v1/chat/completions',
            data=body,
            headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
            method='POST')
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.load(r)
        return resp['choices'][0]['message']['content'].strip()
    except Exception as ex:
        print(f'  traduci_chunk ERR: {ex}')
        return None

def traduci_testo(testo, lingua_src, titolo):
    """
    Traduce un testo completo in italiano, chunk per chunk.
    Preserva l'header (=== ... ===) e i marker [PAG N].
    """
    linee = testo.split('\n')
    header_lines = []
    corpo_lines  = []
    in_header = True

    for l in linee:
        if in_header and (l.startswith('===') or l.startswith('Metodo:') or
                          l.startswith('Chunks:') or l.startswith('INDICE CHUNKS') or l.strip() == ''):
            header_lines.append(l)
        else:
            in_header = False
            corpo_lines.append(l)

    corpo = '\n'.join(corpo_lines)
    if not corpo.strip():
        return testo  # niente da tradurre

    # Chunking: spezza su marker [PAG N] o ogni CHARS_CHUNK chars
    chunks_out = []
    chunk_corrente = ''
    for riga in corpo.split('\n'):
        is_marker = re.match(r'^\[PAG \d+\]', riga.strip())
        if is_marker and len(chunk_corrente) > CHARS_CHUNK:
            if chunk_corrente.strip():
                chunks_out.append(chunk_corrente)
            chunk_corrente = riga + '\n'
        else:
            chunk_corrente += riga + '\n'
            if len(chunk_corrente) >= CHARS_CHUNK and not is_marker:
                chunks_out.append(chunk_corrente)
                chunk_corrente = ''
    if chunk_corrente.strip():
        chunks_out.append(chunk_corrente)

    print(f'  Chunks da tradurre: {len(chunks_out)}')
    tradotti = []
    for idx, chunk in enumerate(chunks_out):
        print(f'  Chunk {idx+1}/{len(chunks_out)} ({len(chunk)} chars)...')
        rit = traduci_chunk(chunk, lingua_src, titolo)
        if rit:
            tradotti.append(rit)
        else:
            tradotti.append(chunk)  # fallback: mantieni originale
        time.sleep(1)  # rate limit

    corpo_it = '\n'.join(tradotti)
    # Aggiungi nota traduzione all'header
    header_lines.append(f'Tradotto in italiano da: {lingua_src.upper()} | Script: traduci_testi.py')
    return '\n'.join(header_lines) + '\n' + corpo_it

# ── Raccolta file da tradurre ────────────────────────────────────

def raccogli_file_da_tradurre(pdf_knowledge):
    """
    Restituisce lista di dict {path, safe_id, titolo, lingua} per i file
    che non sono ancora italiani e hanno testo estratto.
    Esclude già tradotti (campo lingua=='it' in pdf_knowledge).
    """
    # Mappa safe_id → lingua da pdf_knowledge
    gia_it = set()
    for a in pdf_knowledge.get('analisi', []):
        if a.get('lingua') == 'it':
            gia_it.add(a.get('testo_id',''))

    # Scansiona data/testi/ (root + sottocartelle tematiche + chunks)
    # Rev.25 FIX: prima 'data/testi/chunks' non veniva mai scansionato — per i documenti
    # grandi (chunked), il grosso del testo restava per sempre non tradotto.
    dirs_to_scan = ['data/testi', 'data/testi/chunks']
    cat_dirs = ['elettrocultura','biodinamica','living_soil','fisica_energie',
                'agricoltura','fitoterapia','scienza','esoterismo','altro']
    for c in cat_dirs:
        dirs_to_scan.append(f'data/testi/{c}')

    da_tradurre = []
    for d in dirs_to_scan:
        try:
            items = gh_list(d)
        except:
            continue
        for f in items:
            if not f['name'].endswith('.txt') or f['name'] == 'README.md':
                continue
            safe_id = f['name'].replace('.txt','')
            if safe_id in gia_it:
                continue
            da_tradurre.append({
                'path': f['path'],
                'safe_id': safe_id,
                'name': f['name'],
                'size': f.get('size', 0)
            })

    # Rev.25d FIX: prima i file più piccoli — un documento enorme (es. 200KB+ non chunked)
    # tradotto pezzo per pezzo poteva monopolizzare da solo tutto il timeout di un run,
    # bloccando l'intera coda. Ordinando per dimensione crescente il batch copre più
    # documenti distinti per run; i file grandi vengono comunque tradotti, un po' alla volta,
    # quando restano gli unici candidati.
    da_tradurre.sort(key=lambda f: f.get('size', 0))

    return da_tradurre

# ── Main ─────────────────────────────────────────────────────────

def main():
    print('=== BioSerra Traduci Testi ===')
    print(f'MISTRAL_KEY: {"OK" if MISTRAL_KEY else "ASSENTE"}')

    # 1. Carica pdf_knowledge per sapere cosa è già tradotto
    print('\n[1] Carico pdf_knowledge...')
    try:
        raw, sha_pk = gh_get('data/pdf_knowledge.json')
        pdf_knowledge = json.loads(raw)
    except Exception as ex:
        print(f'  WARN pdf_knowledge: {ex}')
        pdf_knowledge = {'analisi': []}
        sha_pk = None

    analisi_map = {a.get('testo_id','').strip(): a for a in pdf_knowledge.get('analisi',[])}

    # Rev.25: backfill leggero del campo 'lingua' per le voci storiche che non l'hanno mai avuto
    # (versioni pre-v13 di analisi_pdf.py non scrivevano questo campo). Nessuna chiamata Mistral,
    # solo rilevazione locale sul testo già estratto — serve solo a dare visibilità reale sullo
    # stato delle traduzioni, il backfill di traduzione vero resta nel loop sotto.
    senza_lingua = [a for a in pdf_knowledge.get('analisi', []) if not a.get('lingua')]
    n_backfill = 0
    if senza_lingua:
        print(f'\n[0] Backfill campo lingua per {len(senza_lingua)} voci storiche senza il campo...')
        for a in senza_lingua[:60]:  # cap per non appesantire troppo questo run
            tid = a.get('testo_id','').strip()
            if not tid:
                continue
            try:
                testo_preview = gh_raw(f'data/testi/{tid}.txt')
            except:
                continue
            corpo = '\n'.join(testo_preview.split('\n')[6:])
            a['lingua'] = rileva_lingua(corpo) if corpo.strip() else 'altro'
            n_backfill += 1
        print(f'  Backfill completato su {n_backfill} voci (resto al prossimo run)')

    # 2. Trova file da tradurre
    print('\n[2] Scansiono testi estratti...')
    da_tradurre = raccogli_file_da_tradurre(pdf_knowledge)
    print(f'  File candidati: {len(da_tradurre)}')

    # 3. Per ogni file: rileva lingua, salta se già italiano
    da_processare = []
    for f in da_tradurre:
        try:
            testo = gh_raw(f['path'])
        except:
            continue
        if not testo or len(testo) < 200:
            continue
        # Salta header (prime righe) per rilevamento lingua
        corpo = '\n'.join(testo.split('\n')[6:])
        lingua = rileva_lingua(corpo)
        if lingua == 'it':
            # Aggiorna pdf_knowledge con lingua='it' senza tradurre
            if f['safe_id'] in analisi_map:
                analisi_map[f['safe_id']]['lingua'] = 'it'
            continue
        f['lingua'] = lingua
        f['testo'] = testo
        da_processare.append(f)
        if len(da_processare) >= BATCH_SIZE:
            break

    print(f'  Da tradurre questo batch: {len(da_processare)}')
    tradotti_ok = 0
    if not da_processare:
        print('  Niente da tradurre in questo batch.')

    for f in da_processare:
        titolo = f['safe_id'].replace('_',' ')
        lingua = f['lingua']
        print(f'\n[Traduco] {f["name"]} ({lingua.upper()}) — {len(f["testo"])} chars')

        try:
            # Fetch SHA fresco
            _, sha_txt = gh_get(f['path'])
        except Exception as ex:
            print(f'  SHA fetch ERR: {ex}')
            continue

        testo_it = traduci_testo(f['testo'], lingua, titolo)
        if not testo_it or len(testo_it) < 100:
            print('  SKIP: traduzione vuota')
            continue

        # Salva testo tradotto
        try:
            res = gh_put(f['path'], testo_it, sha_txt, f'translate: {f["name"]} ({lingua}→it)')
            if res is None:
                print('  PUT ERR: gh_put fallito dopo 3 tentativi')
                continue
            print(f'  Salvato ({len(testo_it)} chars)')
            tradotti_ok += 1
        except Exception as ex:
            print(f'  PUT ERR: {ex}')
            continue

        # Aggiorna lingua in pdf_knowledge
        if f['safe_id'] in analisi_map:
            analisi_map[f['safe_id']]['lingua'] = 'it'
        time.sleep(2)

    # 4. Salva pdf_knowledge aggiornato con campo lingua
    # Rev.25: salva anche se sono state solo backfillate lingue storiche (n_backfill>0),
    # non solo quando ci sono state traduzioni vere in questo run.
    if (tradotti_ok > 0 or n_backfill > 0) and sha_pk:
        print(f'\n[3] Aggiorno pdf_knowledge.json (campo lingua)...')
        pdf_knowledge['analisi'] = list(analisi_map.values())
        try:
            sha_pk2 = gh_get_sha('data/pdf_knowledge.json')
            out = json.dumps(pdf_knowledge, ensure_ascii=False, indent=2)
            res = gh_put('data/pdf_knowledge.json', out, sha_pk2,
                         f'update: lingua field in pdf_knowledge ({tradotti_ok} tradotti, {n_backfill} backfill)')
            if res is None:
                print('  pdf_knowledge update ERR: gh_put fallito dopo 3 tentativi')
            else:
                print('  pdf_knowledge aggiornato')
        except Exception as ex:
            print(f'  pdf_knowledge update ERR: {ex}')

    print(f'\n=== Fine. Tradotti: {tradotti_ok}/{len(da_processare)} | Backfill lingua: {n_backfill} ===')

    summary_path = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary_path:
        try:
            with open(summary_path, 'a', encoding='utf-8') as f:
                f.write(f'## Traduzione testi — {time.strftime("%Y-%m-%d")}\n\n')
                f.write(f'- Chunk/file tradotti in questo run: **{tradotti_ok}**\n')
                f.write(f'- Voci lingua backfillate: **{n_backfill}**\n')
                restanti_senza_lingua = sum(1 for a in analisi_map.values() if not a.get('lingua'))
                f.write(f'- Voci ancora senza campo lingua: **{restanti_senza_lingua}**\n')
        except Exception as ex:
            print(f'  (step summary non scritto: {ex})')

main()
