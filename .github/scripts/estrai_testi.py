"""
estrai_testi.py — Estrae testo completo da tutti i PDF in MANUALI/
Salva in data/testi/[titolo_safe].txt (un file per PDF)
Usa raw URL per PDF >1MB, OCR Tesseract per scansionati
Gira su GitHub Actions con timeout 300 min
"""
import os, json, base64, urllib.request, urllib.error, time, datetime, io, re, sys

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}
RAW_BASE = f'https://raw.githubusercontent.com/{REPO}/main/'

def gh_get(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def gh_put(path, text, sha, message):
    encoded = base64.b64encode(text.encode('utf-8')).decode('ascii')
    body = {'message': message, 'content': encoded, 'branch': 'main'}
    if sha:
        body['sha'] = sha
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=json.dumps(body).encode(),
        headers={**HEADERS_GH, 'Content-Type': 'application/json'},
        method='PUT')
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def gh_get_sha(path):
    try:
        return gh_get(path)['sha']
    except:
        return None

def scarica_pdf(nome_file):
    """Scarica PDF via raw URL (funziona per qualsiasi dimensione)."""
    url = RAW_BASE + 'MANUALI/' + urllib.request.quote(nome_file)
    req = urllib.request.Request(url, headers={
        'Authorization': f'token {GITHUB_TOKEN}',
        'Cache-Control': 'no-cache'
    })
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def titolo_safe(nome_file):
    """Converte nome file in ID sicuro per path."""
    base = nome_file.replace('.pdf', '').strip()
    safe = re.sub(r'[^\w\-]', '_', base)
    safe = re.sub(r'_+', '_', safe).strip('_')
    return safe[:80]

def estrai_testo_completo(pdf_bytes, titolo):
    """Estrae TUTTO il testo dal PDF. Prova metodi digitali, poi OCR su tutte le pagine."""
    testo = ''

    # Metodo 1: fitz (testo digitale)
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        n_pages = len(doc)
        parti = []
        for page in doc:
            t = page.get_text().strip()
            if t:
                parti.append(t)
        doc.close()
        testo = '\n'.join(parti)
        if len(testo.strip()) > 200:
            print(f'  fitz: {len(testo)} chars, {n_pages} pagine')
            return testo, 'digitale'
    except Exception as ex:
        print(f'  fitz: {ex}')

    # Metodo 2: pdfplumber
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            n_pages = len(pdf.pages)
            parti = [page.extract_text() or '' for page in pdf.pages]
        testo = '\n'.join(p.strip() for p in parti if p.strip())
        if len(testo.strip()) > 200:
            print(f'  pdfplumber: {len(testo)} chars, {n_pages} pagine')
            return testo, 'digitale'
    except Exception as ex:
        print(f'  pdfplumber: {ex}')

    # Metodo 3: OCR Tesseract - TUTTE le pagine
    print(f'  OCR su tutte le pagine...')
    try:
        import pytesseract
        from pdf2image import convert_from_bytes

        images = convert_from_bytes(pdf_bytes, dpi=200)
        n_pages = len(images)
        print(f'  {n_pages} pagine da processare')
        parti = []
        for i, img in enumerate(images):
            try:
                t = pytesseract.image_to_string(img, lang='ita+eng', config='--psm 3')
            except:
                t = pytesseract.image_to_string(img, lang='eng', config='--psm 3')
            t = t.strip()
            if t:
                parti.append(f'[p{i+1}] ' + t)
            if (i+1) % 10 == 0:
                print(f'  OCR: {i+1}/{n_pages} pagine ({sum(len(p) for p in parti)} chars)')

        testo = '\n'.join(parti)
        if len(testo) > 50:
            print(f'  OCR: {len(testo)} chars totali, {n_pages} pagine')
            return testo, 'ocr'
        else:
            print(f'  OCR scarso: {len(testo)} chars')
    except Exception as ex:
        print(f'  OCR: {ex}')

    return '', 'vuoto'

def main():
    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Estrai Testi — {oggi} ===')

    os.system('pip install pymupdf pdfplumber pytesseract pdf2image Pillow -q 2>/dev/null')

    # Lista PDF
    manuali = gh_get('MANUALI')
    pdf_files = sorted([f for f in manuali if f['name'].endswith('.pdf')], key=lambda x: x['name'])
    print(f'PDF totali: {len(pdf_files)}')

    # Lista testi già estratti
    try:
        testi_esistenti = gh_get('data/testi')
        gia_estratti = {f['name'].replace('.txt','') for f in testi_esistenti if f['name'].endswith('.txt')}
    except:
        gia_estratti = set()
    print(f'Testi già estratti: {len(gia_estratti)}')

    # Processa tutti i PDF mancanti (batch da 5 per notte, OCR è lento)
    da_fare = [f for f in pdf_files if titolo_safe(f['name']) not in gia_estratti]
    print(f'Da estrarre: {len(da_fare)}')

    if not da_fare:
        print('Tutti estratti!')
        return

    batch = da_fare[:13]  # 13 per notte → 89 PDF completati in 7 notti

    stats = {'ok': 0, 'digitale': 0, 'ocr': 0, 'vuoti': 0}

    for i, pdf_file in enumerate(batch):
        nome = pdf_file['name']
        safe_id = titolo_safe(nome)
        path_out = f'data/testi/{safe_id}.txt'
        print(f'\n[{i+1}/{len(batch)}] {nome[:70]}')
        print(f'  Size: {pdf_file.get("size",0)/1024:.0f} KB')

        try:
            pdf_bytes = scarica_pdf(nome)
            print(f'  Scaricato: {len(pdf_bytes)/1024:.0f} KB')
        except Exception as ex:
            print(f'  Download ERR: {ex}')
            continue

        testo, metodo = estrai_testo_completo(pdf_bytes, safe_id)

        if not testo:
            # Salva placeholder vuoto per non ritentare
            testo = f'[VUOTO] {nome}\nOCR non ha prodotto testo leggibile.'
            stats['vuoti'] += 1
        else:
            stats['ok'] += 1
            stats[metodo] = stats.get(metodo, 0) + 1

        # Header con metadati
        header = f'=== {nome} ===\nMetodo: {metodo} | Chars: {len(testo)} | Data: {oggi}\n\n'
        contenuto = header + testo

        # Salva su GitHub
        sha = gh_get_sha(path_out)
        try:
            gh_put(path_out, contenuto, sha, f'testi: {safe_id} [{metodo}, {len(testo)}c]')
            print(f'  Salvato: {path_out} ({len(contenuto)} chars)')
        except Exception as ex:
            print(f'  Salvataggio ERR: {ex}')
            # Se file troppo grande (>1MB), tronca
            if len(contenuto) > 900000:
                print(f'  File grande, tronco a 900KB')
                contenuto = contenuto[:900000] + '\n[TRONCATO]'
                sha2 = gh_get_sha(path_out)
                gh_put(path_out, contenuto, sha2, f'testi: {safe_id} [troncato]')

        time.sleep(3)

    print(f'\n=== BATCH COMPLETATO: ok={stats["ok"]} digitale={stats.get("digitale",0)} ocr={stats.get("ocr",0)} vuoti={stats["vuoti"]} ===')
    print(f'Rimanenti: {len(da_fare) - len(batch)}')

if __name__ == '__main__':
    main()
