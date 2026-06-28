"""
classifica_testi.py — Classifica testi estratti in sottocartelle tematiche
Legge ogni file da data/testi/, Mistral legge il testo reale e assegna categoria,
copia in data/testi/[categoria]/[nome].txt
Gira ogni notte dopo estrai_testi.py (00:30 UTC)
"""
import os, json, base64, urllib.request, urllib.error, datetime, re, time

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
RAW  = f'https://raw.githubusercontent.com/{REPO}/main/'

HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

# Categorie ufficiali con descrizione per il prompt
CATEGORIE = {
    'elettrocultura': 'Tecniche elettriche/magnetiche sulle piante: Lakhovsky, Fe-Cu, spirale rame, acqua magnetizzata, antenna terra, pile galvaniche, elettromagnetismo applicato alla coltivazione',
    'biodinamica':    'Agricoltura biodinamica: Steiner, Thun, calendario lunare, preparati biodinamici, antroposofia, ritmi cosmici, forze formative',
    'living_soil':    'Suolo vivente: compost, micorrize, batteri, funghi, humus, vermicompost, biochar, biologia del suolo, fertilita naturale, Living Soil',
    'fisica_energie': 'Fisica alternativa ed energie: Tesla, Ighina, frequenze vibrazionali, onde scalari, risonanza, campo toroidale, torsione, etere, geometria sacra applicata',
    'fitoterapia':    'Piante medicinali, fitoterapia, terpeni, cannabinoidi, estratti vegetali, aromaterapia, erboristeria, chimica vegetale',
    'agricoltura':    'Agricoltura pratica: tecniche di coltivazione, irrigazione, nutrizione, potatura, semina, raccolta, permacultura, agroforestazione, orticoltura',
    'scienza':        'Scienza convenzionale: fisica, chimica, biologia, elettrotecnica, ingegneria, medicina, neuroscienze, botanica scientifica',
    'esoterismo':     'Esoterismo, occultismo, alchimia, ermetismo, magia, simbolismo, spiritualita, religione, filosofia antica',
    'altro':          'Documenti non classificabili nelle categorie precedenti',
}

def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)['sha']
    except: return None

def gh_list(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except: return []

def gh_put(path, text, sha, msg):
    encoded = base64.b64encode(text.encode('utf-8')).decode('ascii')
    body = {'message': msg, 'content': encoded, 'branch': 'main'}
    if sha: body['sha'] = sha
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=json.dumps(body).encode(),
        headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
    with urllib.request.urlopen(req) as r:
        return json.load(r)['commit']['sha']

def gh_raw(path):
    req = urllib.request.Request(RAW + path, headers={
        'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', errors='replace')

def mistral_classifica(nome_file, testo_preview):
    """Chiede a Mistral di classificare il documento leggendo il testo reale."""
    if not MISTRAL_KEY:
        return classifica_locale(nome_file, testo_preview)

    cat_desc = '\n'.join(f'- {cat}: {desc}' for cat, desc in CATEGORIE.items())

    prompt = f"""Classifica questo documento in UNA delle categorie elencate.
Basa la classificazione SUL TESTO REALE, non sul titolo.

CATEGORIE:
{cat_desc}

DOCUMENTO: {nome_file}
TESTO (prime 1500 chars):
{testo_preview[:1500]}

Rispondi SOLO con il nome della categoria (es: "elettrocultura") senza altro testo.
Se non sei sicuro, usa "altro"."""

    try:
        body = json.dumps({
            'model': 'mistral-small-latest',
            'max_tokens': 20,
            'temperature': 0.0,
            'messages': [{'role': 'user', 'content': prompt}]
        }).encode()
        req = urllib.request.Request(
            'https://api.mistral.ai/v1/chat/completions',
            data=body,
            headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
            method='POST')
        with urllib.request.urlopen(req, timeout=20) as r:
            resp = json.load(r)
        cat = resp['choices'][0]['message']['content'].strip().lower()
        # Normalizza
        cat = cat.replace(' ', '_').replace('-', '_')
        if cat not in CATEGORIE:
            # Cerca match parziale
            for k in CATEGORIE:
                if k in cat or cat in k:
                    return k
            return 'altro'
        return cat
    except Exception as ex:
        print(f'  Mistral classifica ERR: {ex}')
        return classifica_locale(nome_file, testo_preview)

def classifica_locale(nome_file, testo):
    """Fallback locale per classificazione senza Mistral."""
    tl = (nome_file + ' ' + testo[:2000]).lower()
    SCORES = {
        'elettrocultura': ['lakhovsky','fe-cu','spirale rame','acqua magnetizzata','antenna terra',
                           'elettrocultura','electroculture','galvanic','magnetiz','christofleau',
                           'vegetaux','electricite','pile','rame','copper spiral'],
        'biodinamica':    ['biodinamic','biodynamic','steiner','thun','calendario lunare',
                           'preparati','antroposofia','agricoltura biodinamica','forze formative'],
        'living_soil':    ['living soil','suolo vivo','compost','micorriz','humus','vermicompost',
                           'biochar','biologia del suolo','funghi','batteri del suolo'],
        'fisica_energie': ['tesla','ighina','frequenz vibrazion','onde scalar','torsion','etere',
                           'risonanza','campo toroid','geometria sacra'],
        'fitoterapia':    ['fitoterap','piante medicinali','terpeni','cannabin','estratti vegetali',
                           'aromaterapia','erboristeria'],
        'agricoltura':    ['agricoltura organica','coltivazione','irrigaz','nutrizione piante',
                           'potatura','semina','permacultura','agroforest','harina de rocas'],
        'scienza':        ['elettrotecnica','fisica quantistica','chimica organica','biologia molecolare',
                           'ingegneria elettrica','neuroscienza','fondamenti di campi'],
        'esoterismo':     ['crowley','massoneria','alchim','ermetism','occulto','wicca','magia',
                           'kabbal','sacra bibbia','corano','vangelo','spiritualit'],
    }
    best_cat, best_score = 'altro', 0
    for cat, kws in SCORES.items():
        score = sum(1 for kw in kws if kw in tl)
        if score > best_score:
            best_score, best_cat = score, cat
    return best_cat

def aggiorna_categoria_pdf_knowledge(pdf_knowledge, titolo, categoria):
    """Aggiorna il campo categoria_reale in pdf_knowledge.json."""
    for a in pdf_knowledge.get('analisi', []):
        if a.get('titolo', '').strip().lower() == titolo.strip().lower():
            a['categoria_reale'] = categoria
            return True
    return False

def main():
    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Classifica Testi — {oggi} ===')
    print(f'MISTRAL_KEY: {"OK" if MISTRAL_KEY else "ASSENTE (fallback locale)"}')

    # Carica pdf_knowledge per aggiornare categoria_reale
    from urllib.request import urlopen
    url_pk = RAW + 'data/pdf_knowledge.json'
    req_pk = urllib.request.Request(url_pk, headers={
        'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
    with urlopen(req_pk) as r:
        pdf_knowledge = json.loads(r.read())
    print(f'PDF in knowledge base: {len(pdf_knowledge.get("analisi",[]))}')

    # Lista testi in root data/testi/ (non in sottocartelle)
    testi_root = [f for f in gh_list('data/testi')
                  if f.get('type') == 'file' and f['name'].endswith('.txt')]
    print(f'Testi in root da classificare: {len(testi_root)}')

    # Lista testi già classificati (nelle sottocartelle)
    gia_classificati = set()
    for cat in CATEGORIE:
        for f in gh_list(f'data/testi/{cat}'):
            if f.get('type') == 'file' and f['name'].endswith('.txt'):
                gia_classificati.add(f['name'])
    print(f'Già classificati: {len(gia_classificati)}')

    # Testi da classificare = quelli in root non ancora in nessuna sottocartella
    da_classificare = [f for f in testi_root if f['name'] not in gia_classificati]
    print(f'Da classificare ora: {len(da_classificare)}')

    if not da_classificare:
        print('Tutti i testi già classificati.')
        return

    # Batch: 20 per notte (classificazione è veloce)
    batch = da_classificare[:20]
    stats = {cat: 0 for cat in CATEGORIE}
    stats['errori'] = 0
    pk_modificato = False

    for i, f_info in enumerate(batch):
        nome = f_info['name']
        titolo = nome.replace('.txt', '').replace('_', ' ').strip()
        print(f'\n[{i+1}/{len(batch)}] {nome[:70]}')

        # Leggi testo
        try:
            testo = gh_raw(f'data/testi/{nome}')
            # Rimuovi header
            if testo.startswith('==='):
                idx = testo.find('\n\n')
                if idx > 0: testo = testo[idx+2:]
            testo = testo.strip()
            if '[VUOTO]' in testo[:50] or len(testo) < 100:
                print(f'  Testo vuoto/troppo corto, classifico come "altro"')
                categoria = 'altro'
            else:
                # Classifica con Mistral leggendo il testo reale
                categoria = mistral_classifica(nome, testo)
                print(f'  Categoria: {categoria} (da {len(testo)} chars di testo reale)')
        except Exception as ex:
            print(f'  ERR lettura: {ex}')
            stats['errori'] += 1
            continue

        # Copia in data/testi/[categoria]/[nome].txt
        path_dest = f'data/testi/{categoria}/{nome}'
        sha_dest = gh_get_sha(path_dest)

        # Aggiungi header categoria al testo
        header = f'=== CATEGORIA: {categoria} | {nome} ===\n\n'
        contenuto = header + testo

        try:
            gh_put(path_dest, contenuto, sha_dest,
                   f'classifica: {nome} -> {categoria}')
            stats[categoria] = stats.get(categoria, 0) + 1
            print(f'  Salvato in data/testi/{categoria}/')
        except Exception as ex:
            print(f'  ERR salvataggio: {ex}')
            stats['errori'] += 1
            continue

        # Aggiorna categoria_reale in pdf_knowledge
        if aggiorna_categoria_pdf_knowledge(pdf_knowledge, titolo, categoria):
            pk_modificato = True

        time.sleep(1.5)

    # Salva pdf_knowledge aggiornato con categorie_reali
    if pk_modificato:
        print('\nAggiorno pdf_knowledge.json con categorie_reali...')
        pdf_knowledge['lastUpdate'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        content_b64 = base64.b64encode(
            json.dumps(pdf_knowledge, indent=2, ensure_ascii=False).encode()).decode()
        sha_pk = gh_get_sha('data/pdf_knowledge.json')
        body = json.dumps({
            'message': f'classifica: aggiorna categoria_reale [{oggi}]',
            'content': content_b64, 'sha': sha_pk, 'branch': 'main'
        }).encode()
        req2 = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/data/pdf_knowledge.json',
            data=body, headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
        with urllib.request.urlopen(req2) as r:
            print(f'  Salvato: {json.load(r)["commit"]["sha"][:8]}')

    print(f'\n=== COMPLETATO ===')
    print(f'Classificati: {sum(v for k,v in stats.items() if k != "errori")} | Errori: {stats["errori"]}')
    for cat, n in sorted(stats.items(), key=lambda x: -x[1]):
        if n > 0 and cat != 'errori':
            print(f'  {cat}: {n} PDF')
    print(f'Rimanenti in root: {len(da_classificare) - len(batch)}')

if __name__ == '__main__':
    main()
