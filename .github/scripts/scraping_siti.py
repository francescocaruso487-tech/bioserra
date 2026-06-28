"""
scraping_siti.py — Scarica guide coltivazione da Zamnesia e Royal Queen Seeds
Salva i testi in data/testi/web/zamnesia/ e data/testi/web/rqs/
Aggiunge entry sintetiche in pdf_knowledge.json (trattate come PDF)
"""
import os, json, base64, urllib.request, urllib.error, urllib.parse
import datetime, re, time, html

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
RAW  = f'https://raw.githubusercontent.com/{REPO}/main/'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

# URL indici guide
SITI = [
    {
        'nome': 'zamnesia',
        'url_indice': 'https://www.zamnesia.io/it/guida-coltivare-cannabis',
        'pattern_articoli': r'href="(https://www\.zamnesia\.io/it/guida-coltivare-cannabis/[\w\-]+)"',
        'prefisso_id': 'web_zamn_'
    },
    {
        'nome': 'rqs',
        'url_indice': 'https://www.royalqueenseeds.it/guida-alla-coltivazione-della-cannabis',
        'pattern_articoli': r'href="(https://www\.royalqueenseeds\.it/[\w\-/]+)"',
        'prefisso_id': 'web_rqs_'
    }
]

HEADERS_WEB = {
    'User-Agent': 'Mozilla/5.0 (compatible; BioSerra/1.0)',
    'Accept-Language': 'it-IT,it;q=0.9'
}

# ── GitHub helpers ─────────────────────────────────────────────────────────────

def gh_get(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        d = json.load(r)
    return base64.b64decode(d['content'].replace('\n','')).decode('utf-8'), d['sha']

def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)['sha']
    except:
        return None

def gh_put(path, content, sha, msg):
    if isinstance(content, str):
        content = content.encode('utf-8')
    encoded = base64.b64encode(content).decode('ascii')
    body = {'message': msg, 'content': encoded, 'branch': 'main'}
    if sha:
        body['sha'] = sha
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=json.dumps(body).encode(),
        headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
    with urllib.request.urlopen(req) as r:
        return json.load(r)['commit']['sha']

def gh_list(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except:
        return []

# ── Web helpers ────────────────────────────────────────────────────────────────

def fetch_url(url, timeout=20):
    """Scarica una pagina web, restituisce HTML grezzo."""
    try:
        req = urllib.request.Request(url, headers=HEADERS_WEB)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            charset = 'utf-8'
            ct = r.headers.get('Content-Type','')
            if 'charset=' in ct:
                charset = ct.split('charset=')[-1].strip()
            return r.read().decode(charset, errors='replace')
    except Exception as ex:
        print(f'  FETCH ERR {url}: {ex}')
        return ''

def pulisci_html(html_raw):
    """
    Rimuove tag HTML, script, style, nav, footer.
    Restituisce testo pulito.
    """
    # Rimuovi blocchi non utili
    for tag in ['script', 'style', 'nav', 'footer', 'header', 'aside',
                 'noscript', 'form', 'button', 'input', 'select']:
        html_raw = re.sub(rf'<{tag}[^>]*>.*?</{tag}>', ' ', html_raw,
                          flags=re.DOTALL | re.IGNORECASE)
    # Rimuovi tutti i tag HTML
    testo = re.sub(r'<[^>]+>', ' ', html_raw)
    # Decodifica entità HTML
    testo = html.unescape(testo)
    # Normalizza spazi bianchi
    testo = re.sub(r'[ \t]+', ' ', testo)
    testo = re.sub(r'\n{3,}', '\n\n', testo)
    testo = testo.strip()
    return testo

def slug_da_url(url):
    """Estrae slug identificativo dall'URL."""
    path = urllib.parse.urlparse(url).path
    slug = path.rstrip('/').split('/')[-1]
    slug = re.sub(r'[^\w\-]', '_', slug)[:80]
    return slug

def estrai_titolo(html_raw):
    """Estrae il titolo dell'articolo dall'HTML."""
    m = re.search(r'<h1[^>]*>(.*?)</h1>', html_raw, re.DOTALL | re.IGNORECASE)
    if m:
        t = re.sub(r'<[^>]+>', '', m.group(1))
        return html.unescape(t).strip()
    m = re.search(r'<title[^>]*>(.*?)</title>', html_raw, re.DOTALL | re.IGNORECASE)
    if m:
        t = re.sub(r'<[^>]+>', '', m.group(1))
        return html.unescape(t).strip().split('|')[0].strip()
    return ''

def estrai_articolo(html_raw):
    """
    Tenta di estrarre solo il corpo dell'articolo (esclude menu, footer ecc).
    """
    # Cerca contenitore principale articolo
    for pattern in [
        r'<article[^>]*>(.*?)</article>',
        r'<div[^>]*class="[^"]*article[^"]*"[^>]*>(.*?)</div>',
        r'<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)</div>',
        r'<main[^>]*>(.*?)</main>',
        r'<div[^>]*id="[^"]*content[^"]*"[^>]*>(.*?)</div>',
    ]:
        m = re.search(pattern, html_raw, re.DOTALL | re.IGNORECASE)
        if m and len(m.group(1)) > 500:
            return pulisci_html(m.group(1))
    # Fallback: pulisci tutto l'HTML
    return pulisci_html(html_raw)

def estrai_links_da_indice(html_raw, pattern):
    """Estrae tutti gli URL articoli dall'indice."""
    links = re.findall(pattern, html_raw)
    # Deduplica preservando ordine
    visti = set()
    unici = []
    for l in links:
        if l not in visti:
            visti.add(l)
            unici.append(l)
    return unici

def sommario_mistral(titolo, testo, max_chars=3000):
    """Genera sommario breve via Mistral."""
    if not MISTRAL_KEY:
        return testo[:300]
    estratto = testo[:max_chars]
    prompt = f"""Testo estratto da articolo web sulla coltivazione:
Titolo: {titolo}
Testo: {estratto}

Scrivi un sommario di 2-3 frasi che catturi i punti chiave pratici per un coltivatore Living Soil outdoor.
Solo il sommario, nessun altro testo."""
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': 200,
        'temperature': 0.1,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    req = urllib.request.Request(
        'https://api.mistral.ai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {MISTRAL_KEY}',
                 'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            resp = json.load(r)
        return resp['choices'][0]['message']['content'].strip()
    except Exception as ex:
        print(f'  Mistral sommario ERR: {ex}')
        return testo[:200]

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Scraping Siti ({oggi}) ===')

    # Carica pdf_knowledge.json esistente
    raw_pk, sha_pk = gh_get('data/pdf_knowledge.json')
    pdf_knowledge = json.loads(raw_pk)
    analisi = pdf_knowledge.get('analisi', [])
    ids_esistenti = {a['id'] for a in analisi}
    print(f'Voci esistenti in pdf_knowledge: {len(analisi)}')

    nuove_voci = []
    testi_salvati = 0

    for sito in SITI:
        nome = sito['nome']
        print(f'\n--- Sito: {nome} ({sito["url_indice"]}) ---')

        # 1. Scarica indice
        html_indice = fetch_url(sito['url_indice'])
        if not html_indice:
            print(f'  SKIP: impossibile scaricare indice')
            continue

        # 2. Estrai tutti i link articoli
        links = estrai_links_da_indice(html_indice, sito['pattern_articoli'])
        print(f'  Link trovati: {len(links)}')

        if not links:
            print(f'  ATTENZIONE: nessun link trovato, pattern potrebbe non matchare')
            continue

        # 3. Per ogni articolo
        for url in links:
            slug = slug_da_url(url)
            art_id = sito['prefisso_id'] + slug

            # Cartella destinazione testi
            path_testo = f'data/testi/web/{nome}/{slug}.txt'

            # Controlla se già salvato (non riscarica se esiste)
            sha_esistente = gh_get_sha(path_testo)
            if sha_esistente and art_id in ids_esistenti:
                print(f'  [GIA] {slug[:50]}')
                continue

            print(f'  [SCARICO] {slug[:50]}')
            time.sleep(1.5)  # delay cortese

            # 4. Scarica articolo
            html_art = fetch_url(url)
            if not html_art or len(html_art) < 200:
                print(f'    SKIP: risposta vuota')
                continue

            titolo = estrai_titolo(html_art) or slug.replace('_', ' ').replace('-', ' ').title()
            testo = estrai_articolo(html_art)

            if len(testo) < 200:
                print(f'    SKIP: testo troppo corto ({len(testo)} chars)')
                continue

            print(f'    Titolo: {titolo[:50]}')
            print(f'    Testo: {len(testo)} chars')

            # 5. Salva testo in data/testi/web/nome/slug.txt
            contenuto_file = f'=== {titolo} ===\nFONTE: {url}\nDATA: {oggi}\n\n{testo}'
            sha_testo = gh_get_sha(path_testo)
            gh_put(path_testo, contenuto_file, sha_testo,
                   f'web/{nome}: {slug[:40]} [{oggi}]')
            testi_salvati += 1

            # 6. Genera sommario con Mistral
            sommario = sommario_mistral(titolo, testo)
            time.sleep(1)

            # 7. Prepara voce pdf_knowledge
            if art_id not in ids_esistenti:
                voce = {
                    'id': art_id,
                    'titolo': titolo,
                    'tag': ['coltivazione', 'guida', nome, 'web'],
                    'tecniche_chiave': [],
                    'sommario': sommario,
                    'connessioni': [],
                    'rilevanza': 'alta',
                    'consiglio_coltivazione': sommario,
                    'consiglio_elettrocultura': '',
                    'estratto_chiave': testo[:400],
                    'mistral_analizzato': True,
                    'or_analizzato': False,
                    'testo_chars': len(testo),
                    'testo_id': slug,
                    'categoria_reale': 'web_coltivazione',
                    'fonte_web': url,
                    'fonte_sito': nome
                }
                nuove_voci.append(voce)
                ids_esistenti.add(art_id)
                print(f'    Aggiunto a pdf_knowledge')

        print(f'  Completato {nome}: {testi_salvati} testi salvati finora')

    # 8. Aggiorna pdf_knowledge.json con nuove voci web
    if nuove_voci:
        analisi.extend(nuove_voci)
        pdf_knowledge['analisi'] = analisi
        pdf_knowledge['lastUpdate'] = datetime.datetime.now(
            datetime.timezone.utc).isoformat()

        # SHA fresco prima del PUT
        sha_pk_fresh = gh_get_sha('data/pdf_knowledge.json')
        gh_put('data/pdf_knowledge.json',
               json.dumps(pdf_knowledge, indent=2, ensure_ascii=False),
               sha_pk_fresh,
               f'scraping web: +{len(nuove_voci)} articoli [{oggi}]')
        print(f'\nSalvato pdf_knowledge.json: +{len(nuove_voci)} voci web')
    else:
        print('\nNessuna nuova voce da aggiungere')

    print(f'\n=== COMPLETATO ===')
    print(f'Testi salvati: {testi_salvati}')
    print(f'Nuove voci pdf_knowledge: {len(nuove_voci)}')

if __name__ == '__main__':
    main()
