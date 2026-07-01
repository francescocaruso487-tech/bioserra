"""
estrai_testi.py v2 — Estrazione TOTALE senza limiti artificiali
Tutto il testo di ogni PDF, diviso in chunk da 45000 chars con marker [CHUNK_N/TOT]
Nessun troncamento del contenuto. File salvati in data/testi/[nome].txt
"""
import os, json, base64, urllib.request, urllib.error, datetime, io, re, time

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}
RAW_BASE = f'https://raw.githubusercontent.com/{REPO}/main/'
CHUNK_SIZE = 45000  # chars per chunk — sotto il limite GitHub 50MB per file

def gh_get(path):
    """Resiliente: 3 tentativi, timeout, rilancia l'ultima eccezione se falliscono tutti."""
    import urllib.parse
    last_ex = None
    for attempt in range(3):
        try:
            path_encoded = '/'.join(urllib.parse.quote(p, safe='') for p in path.split('/'))
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path_encoded}', headers=HEADERS_GH)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as ex:
            last_ex = ex
            print(f'  gh_get tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    raise last_ex

def gh_get_sha(path):
    try: return gh_get(path)['sha']
    except: return None

def gh_put(path, content_bytes, sha, message):
    """
    Resiliente: 3 tentativi, SHA sempre fresco (rifetchato ad ogni retry per evitare 409),
    non solleva eccezioni — un fallimento qui non deve mai crashare l'intero batch notturno.
    """
    encoded = base64.b64encode(content_bytes).decode('ascii')
    import urllib.parse
    path_encoded = '/'.join(urllib.parse.quote(p, safe='') for p in path.split('/'))
    url = f'https://api.github.com/repos/{REPO}/contents/{path_encoded}'
    for attempt in range(3):
        try:
            current_sha = sha if attempt == 0 else gh_get_sha(path)
            body = {'message': message, 'content': encoded, 'branch': 'main'}
            if current_sha: body['sha'] = current_sha
            req = urllib.request.Request(
                url, data=json.dumps(body).encode(),
                headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
            with urllib.request.urlopen(req) as r:
                return json.load(r)
        except Exception as ex:
            print(f'  gh_put tentativo {attempt+1}/3 fallito ({path}): {ex}')
            time.sleep(3)
    print(f'  gh_put FALLITO definitivamente dopo 3 tentativi: {path}')
    return None

def gh_list(path):
    """3 tentativi; se falliscono tutti mantiene il comportamento storico (lista vuota)."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as ex:
            print(f'  gh_list tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    return []

def scarica_pdf(nome_file):
    url = RAW_BASE + 'MANUALI/' + urllib.request.quote(nome_file)
    print(f'  URL: {url[:80]}')
    req = urllib.request.Request(url, headers={
        'Authorization': f'token {GITHUB_TOKEN}',
        'Cache-Control': 'no-cache'
    })
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            data = r.read()
            print(f'  Download OK: {len(data)//1024} KB')
            return data
    except urllib.error.HTTPError as e:
        print(f'  HTTP {e.code}: {e.reason} — {url[:60]}')
        raise
    except Exception as e:
        print(f'  Download ERR: {type(e).__name__}: {e}')
        raise

def titolo_safe(nome_file):
    import unicodedata
    # Normalizza unicode → ASCII (es. á→a, ã→a)
    base = nome_file.replace('.pdf', '').strip()
    base = unicodedata.normalize('NFKD', base)
    base = base.encode('ascii', errors='ignore').decode('ascii')
    safe = re.sub(r'[^\w\-]', '_', base)
    safe = re.sub(r'_+', '_', safe).strip('_')
    return safe[:80]

def estrai_testo_totale(pdf_bytes, nome):
    """
    Estrae TUTTO il testo dal PDF senza alcun limite.
    Restituisce (testo_completo, metodo, n_pagine).
    """
    # Metodo 1: fitz — miglior qualità per PDF digitali
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        n_pages = len(doc)
        parti = []
        for i, page in enumerate(doc):
            t = page.get_text().strip()
            if t:
                parti.append(f'[PAG {i+1}]\n{t}')
        doc.close()
        testo = '\n\n'.join(parti)
        if len(testo.strip()) > 500:
            print(f'  fitz: {len(testo):,} chars, {n_pages} pagine')
            return testo, 'digitale_fitz', n_pages
    except Exception as ex:
        print(f'  fitz ERR: {ex}')

    # Metodo 2: pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            n_pages = len(pdf.pages)
            parti = []
            for i, page in enumerate(pdf.pages):
                t = page.extract_text() or ''
                if t.strip():
                    parti.append(f'[PAG {i+1}]\n{t.strip()}')
        testo = '\n\n'.join(parti)
        if len(testo.strip()) > 500:
            print(f'  pdfplumber: {len(testo):,} chars, {n_pages} pagine')
            return testo, 'digitale_pdfplumber', n_pages
    except Exception as ex:
        print(f'  pdfplumber ERR: {ex}')

    # Metodo 3: OCR Tesseract su TUTTE le pagine
    print(f'  Testo digitale assente -> OCR su tutte le pagine...')
    try:
        import pytesseract
        from pdf2image import convert_from_bytes

        images = convert_from_bytes(pdf_bytes, dpi=200)
        n_pages = len(images)
        print(f'  {n_pages} pagine da processare via OCR')
        parti = []
        for i, img in enumerate(images):
            try:
                t = pytesseract.image_to_string(img, lang='ita+eng', config='--psm 3')
            except:
                t = pytesseract.image_to_string(img, lang='eng', config='--psm 3')
            t = t.strip()
            if t:
                parti.append(f'[PAG {i+1}]\n{t}')
            if (i+1) % 5 == 0:
                tot_chars = sum(len(p) for p in parti)
                print(f'  OCR: {i+1}/{n_pages} pag, {tot_chars:,} chars finora')

        testo = '\n\n'.join(parti)
        if len(testo) > 100:
            print(f'  OCR totale: {len(testo):,} chars, {n_pages} pagine')
            return testo, 'ocr_tesseract', n_pages
        else:
            print(f'  OCR scarso: {len(testo)} chars')
    except Exception as ex:
        print(f'  OCR ERR: {ex}')

    return '', 'vuoto', 0

def salva_testo_chunked(nome, testo, metodo, n_pagine, oggi):
    """
    Salva il testo completo.
    Se >45000 chars, salva un file indice + file chunk separati.
    """
    safe_id = titolo_safe(nome)
    n_chars = len(testo)

    if n_chars <= CHUNK_SIZE:
        # File singolo
        header = (f'=== {nome} ===\n'
                  f'Metodo: {metodo} | Pagine: {n_pagine} | Chars: {n_chars:,} | Data: {oggi}\n'
                  f'Chunks: 1/1\n\n')
        contenuto = (header + testo).encode('utf-8')
        path = f'data/testi/{safe_id}.txt'
        sha = gh_get_sha(path)
        gh_put(path, contenuto, sha, f'testi: {safe_id} [{metodo}, {n_chars}c, 1 chunk]')
        print(f'  Salvato: {path} ({n_chars:,} chars)')
        return 1

    else:
        # Dividi in chunk
        chunks = []
        pos = 0
        while pos < len(testo):
            # Trova fine paragrafo vicina al limite
            end = min(pos + CHUNK_SIZE, len(testo))
            if end < len(testo):
                # Cerca fine paragrafo
                nl = testo.rfind('\n\n', pos + CHUNK_SIZE - 2000, end)
                if nl > pos + CHUNK_SIZE // 2:
                    end = nl
            chunks.append(testo[pos:end])
            pos = end
        n_chunks = len(chunks)
        print(f'  Testo grande: {n_chars:,} chars -> {n_chunks} chunk')

        # Salva file indice con sommario
        indice_lines = [
            f'=== {nome} ===',
            f'Metodo: {metodo} | Pagine: {n_pagine} | Chars totali: {n_chars:,} | Data: {oggi}',
            f'Chunks: {n_chunks}',
            f'',
            f'INDICE CHUNKS:',
        ]
        for ci, chunk in enumerate(chunks):
            n_ci = len(chunk)
            # Prendi prime 200 chars come preview
            preview = chunk.strip()[:200].replace('\n', ' ')
            indice_lines.append(f'  chunk_{ci+1:03d}: {n_ci:,} chars — {preview}...')
        indice_lines.append('')
        indice_lines.append('TESTO COMPLETO CHUNK 1 (prime pagine):')
        indice_lines.append(chunks[0][:3000])  # Prime 3000 chars nel file indice

        indice_content = '\n'.join(indice_lines).encode('utf-8')
        path_idx = f'data/testi/{safe_id}.txt'
        sha_idx = gh_get_sha(path_idx)
        gh_put(path_idx, indice_content, sha_idx,
               f'testi: {safe_id} [indice, {n_chars}c, {n_chunks} chunks]')
        print(f'  Indice: {path_idx}')
        time.sleep(1)

        # Salva ogni chunk
        for ci, chunk in enumerate(chunks):
            chunk_header = (f'=== {nome} — CHUNK {ci+1}/{n_chunks} ===\n'
                           f'Chars: {len(chunk):,} | Offset: {sum(len(c) for c in chunks[:ci]):,}\n\n')
            chunk_content = (chunk_header + chunk).encode('utf-8')
            path_chunk = f'data/testi/chunks/{safe_id}_chunk_{ci+1:03d}.txt'
            sha_chunk = gh_get_sha(path_chunk)
            gh_put(path_chunk, chunk_content, sha_chunk,
                   f'testi: {safe_id} chunk {ci+1}/{n_chunks}')
            print(f'  Chunk {ci+1}/{n_chunks}: {len(chunk):,} chars -> {path_chunk}')
            time.sleep(1.5)

        return n_chunks

def main():
    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Estrai Testi v2 — COMPLETO, nessun limite ({oggi}) ===')

    os.system('pip install pymupdf pdfplumber pytesseract pdf2image Pillow -q 2>/dev/null')

    # Lista PDF
    try:
        manuali = gh_get('MANUALI')
    except Exception as ex:
        print(f'ERRORE CRITICO: lettura MANUALI fallita dopo 3 tentativi: {ex}')
        import sys; sys.exit(1)
    pdf_files = sorted([f for f in manuali if f['name'].endswith('.pdf')], key=lambda x: x['name'])
    print(f'PDF totali: {len(pdf_files)}')

    # Testi già estratti (file indice in root)
    testi_esistenti = {f['name'].replace('.txt','')
                       for f in gh_list('data/testi')
                       if f.get('type') == 'file' and f['name'].endswith('.txt')}
    print(f'Testi già estratti: {len(testi_esistenti)}')

    da_fare = [f for f in pdf_files if titolo_safe(f['name']) not in testi_esistenti]
    print(f'Da estrarre: {len(da_fare)}')

    if not da_fare:
        print('Tutti estratti!')
        return

    # 30 per run — completiamo 89 PDF in ~3 run
    batch = da_fare[:30]
    stats = {'ok': 0, 'digitale': 0, 'ocr': 0, 'vuoti': 0, 'chunks_totali': 0}

    for i, pdf_file in enumerate(batch):
        nome = pdf_file['name']
        print(f'\n[{i+1}/{len(batch)}] {nome[:75]}')
        print(f'  Size: {pdf_file.get("size",0)/1024:.0f} KB')

        try:
            pdf_bytes = scarica_pdf(nome)
            print(f'  Scaricato: {len(pdf_bytes)/1024:.0f} KB')
        except Exception as ex:
            print(f'  Download ERR: {ex}')
            continue

        testo, metodo, n_pagine = None, None, None
        try:
            testo, metodo, n_pagine = estrai_testo_totale(pdf_bytes, nome)

            if not testo or len(testo) < 50:
                # Salva placeholder vuoto per non ritentare
                placeholder = f'=== {nome} ===\nMetodo: vuoto | Pagine: {n_pagine} | Data: {oggi}\n\n[VUOTO] OCR non ha prodotto testo leggibile.\n'
                path = f'data/testi/{titolo_safe(nome)}.txt'
                sha = gh_get_sha(path)
                gh_put(path, placeholder.encode('utf-8'), sha, f'testi: {titolo_safe(nome)} [VUOTO]')
                stats['vuoti'] += 1
                print(f'  Salvato placeholder VUOTO')
                time.sleep(2)
                continue

            n_chunks = salva_testo_chunked(nome, testo, metodo, n_pagine, oggi)
            stats['ok'] += 1
            stats['chunks_totali'] += n_chunks
            if 'ocr' in metodo: stats['ocr'] += 1
            else: stats['digitale'] += 1
        except Exception as ex:
            # Non crashare l'intero batch per un singolo PDF problematico (es. file molto grandi
            # o con caratteri particolari nel nome) — logga e prosegui con i successivi.
            print(f'  ERRORE imprevisto su {nome}: {type(ex).__name__}: {ex}')
            stats['vuoti'] += 1
            continue

        time.sleep(3)

    print(f'\n=== COMPLETATO ===')
    print(f'OK: {stats["ok"]} | Digitale: {stats["digitale"]} | OCR: {stats["ocr"]} | Vuoti: {stats["vuoti"]}')
    print(f'Chunks totali creati: {stats["chunks_totali"]}')
    print(f'Rimanenti: {len(da_fare) - len(batch)}')

if __name__ == '__main__':
    main()
