"""
guide_update.py v2 — Guide basate su testi PDF reali
Legge i testi estratti rilevanti per ogni fase, genera guide molto più ricche e specifiche.
"""
import os, json, base64, urllib.request, datetime, re, time

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
RAW  = f'https://raw.githubusercontent.com/{REPO}/main/'

HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

FASI = [
    {'fase': 'germinazione',  'keywords': ['germinazione','seme','radichetta','substrato','umidita iniziale']},
    {'fase': 'vegetazione',   'keywords': ['vegetazione','crescita','foglie','azoto','radici','luce']},
    {'fase': 'fioritura',     'keywords': ['fioritura','pistilli','terpeni','resine','potassio','fosforo']},
    {'fase': 'pre_raccolta',  'keywords': ['raccolta','trichomi','flush','maturazione','lavaggio radici']},
    {'fase': 'essiccazione',  'keywords': ['essiccazione','secco','umidita','ventilazione','buio','temperatura']},
    {'fase': 'concia',        'keywords': ['concia','curing','barattolo','burping','fermentazione','profumo']},
    {'fase': 'suolo',         'keywords': ['living soil','compost','micorrize','batteri','enzimi','humus','suolo']},
    {'fase': 'elettrocultura',     'keywords': ['lakhovsky','elettrocultura','rame','spirale','fe-cu','antenna','magnetizzata']},
    {'fase': 'biodinamica',   'keywords': ['biodinamica','luna','calendario','steiner','thun','preparati']},
    {'fase': 'irrigazione',   'keywords': ['irrigazione','acqua','ph','ec','deficienza','minerali']},
]

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
    except: return None

def gh_put(path, content_b64, sha, message):
    body = json.dumps({'message': message, 'content': content_b64,
                       'sha': sha, 'branch': 'main'}).encode()
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=body, headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def gh_list(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def gh_raw(path):
    req = urllib.request.Request(RAW + path, headers={
        'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', errors='replace')

def mistral_chat(prompt, max_tokens=1500):
    if not MISTRAL_KEY: return None
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
        method='POST')
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.load(r)
    return resp['choices'][0]['message']['content'].strip()

def titolo_safe(nome):
    safe = re.sub(r'[^\w\-]', '_', nome.strip())
    return re.sub(r'_+', '_', safe).strip('_')[:80]

def trova_testi_per_fase(fase_info, pdf_knowledge, testi_disponibili, max_testi=8):
    """Trova testi PDF rilevanti per la fase, leggendo i file estratti."""
    keywords = fase_info['keywords']
    analisi  = pdf_knowledge.get('analisi', [])

    # Score ogni PDF per rilevanza alla fase
    def score(a):
        tl = (a.get('titolo','') + ' ' + a.get('sommario','') + ' ' +
              ' '.join(a.get('tecniche_chiave',[])) + ' ' +
              ' '.join(a.get('tag',[]))).lower()
        base = sum(2 if kw in tl else 0 for kw in keywords) + len(a.get('connessioni',[]))*0.1
        # Boost forte per testi fusi pertinenti
        if a.get('fonte_sito') == 'fuso' and base > 0:
            base += 10
        return base

    rilevanti = sorted(
        [a for a in analisi if score(a) > 0],
        key=score, reverse=True
    )[:max_testi]

    testi = []
    for a in rilevanti:
        safe_id = titolo_safe(a.get('titolo',''))
        if safe_id not in testi_disponibili:
            # Usa sommario come fallback se testo non estratto
            testi.append({
                'id': a.get('id',''), 'titolo': a.get('titolo',''),
                'testo': a.get('sommario','') + '\n' + a.get('estratto_chiave',''),
                'fonte': 'sommario'
            })
            continue
        try:
            # Cerca in ordine: fusi > data/testi/ > web/
            raw = ''
            try:
                raw = gh_raw(f'data/testi/fusi/{safe_id}.txt')
            except:
                pass
            if not raw:
                try:
                    raw = gh_raw(f'data/testi/{safe_id}.txt')
                except:
                    pass
            if not raw:
                for sito_web in ['zamnesia', 'rqs']:
                    try:
                        raw = gh_raw(f'data/testi/web/{sito_web}/{safe_id}.txt')
                        if raw:
                            break
                    except:
                        pass
            if raw.startswith('==='): raw = raw[raw.find('\n\n')+2:]
            if '[VUOTO]' in raw[:50]: continue
            testi.append({
                'id': a.get('id',''), 'titolo': a.get('titolo',''),
                'testo': raw.strip()[:2500], 'fonte': 'ocr'
            })
        except: continue

    return testi

def genera_guida_fase(fase_info, testi, oggi):
    fase = fase_info['fase']

    ctx = '\n\n'.join(
        f'[{t["id"]}] {t["titolo"]} ({t["fonte"]}):\n{t["testo"][:1500]}'
        for t in testi[:5]
    ) if testi else '(nessun testo specifico disponibile)'

    prompt = f"""Sei un agronomo esperto Living Soil, biodinamica ed elettrocultura per serra outdoor Caserta (41N, clima mediterraneo).
Hai letto questi manuali specifici per la fase "{fase}":

{ctx}

Genera una guida pratica completa per la fase "{fase}" in JSON:
{{
  "fase": "{fase}",
  "titolo": "titolo descrittivo della guida",
  "contenuto_completo": "guida narrativa di 400-600 parole: cosa succede in questa fase, come gestirla in Living Soil outdoor a Caserta, tecniche specifiche dai manuali, timing stagionale italiano",
  "punti_chiave": [
    "punto chiave 1 specifico con riferimento tecnico",
    "punto chiave 2",
    "punto chiave 3",
    "punto chiave 4",
    "punto chiave 5"
  ],
  "errori_comuni": [
    "errore 1 con spiegazione del perche",
    "errore 2",
    "errore 3"
  ],
  "tecniche_elettrocultura": [
    "tecnica specifica applicabile in questa fase con istruzioni"
  ],
  "tecniche_biodinamica": [
    "pratica biodinamica specifica per questa fase"
  ],
  "timeline_caserta": "quando tipicamente si manifesta questa fase a Caserta con date indicative",
  "indicatori_visivi": ["segnale 1 da osservare", "segnale 2"],
  "tecniche_pdf": {json.dumps([t['titolo'][:40] for t in testi[:4]])},
  "pdf_fonti": {json.dumps([t['id'] for t in testi[:4]])}
}}
Rispondi SOLO JSON valido. Nessun testo fuori."""

    try:
        risposta = mistral_chat(prompt, max_tokens=1800)
        if not risposta: return None
        s, e = risposta.find('{'), risposta.rfind('}')
        if s >= 0 and e > s:
            return json.loads(risposta[s:e+1])
    except Exception as ex:
        print(f'  guida {fase} ERR: {ex}')
    return None

def guida_fallback(fase_info):
    return {
        'fase': fase_info['fase'],
        'titolo': f'Guida {fase_info["fase"].capitalize()}',
        'contenuto_completo': f'Guida per la fase {fase_info["fase"]}. Consultare i manuali per dettagli.',
        'punti_chiave': ['Monitoraggio costante', 'Rispetta il suolo vivente'],
        'errori_comuni': ['Eccesso di intervento'],
        'tecniche_elettrocultura': ['Mantieni circuito Lakhovsky attivo'],
        'tecniche_biodinamica': ['Segui calendario lunare'],
        'timeline_caserta': 'Variabile secondo stagione',
        'indicatori_visivi': ['Osservazione diretta'],
        'tecniche_pdf': [],
        'pdf_fonti': []
    }

def main():
    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Guide v2 — da testi reali ({oggi}) ===')

    # Carica pdf_knowledge
    raw_pdf, _ = gh_get('data/pdf_knowledge.json')
    pdf_knowledge = json.loads(raw_pdf)
    print(f'PDF in knowledge base: {len(pdf_knowledge.get("analisi",[]))}')

    # Lista testi disponibili (PDF + web)
    try:
        lista = gh_list('data/testi')
        testi_disp = {f['name'].replace('.txt','') for f in lista if f['name'].endswith('.txt')}
    except:
        testi_disp = set()
    # Aggiungi testi web (zamnesia, rqs)
    for sito_web in ['zamnesia', 'rqs']:
        try:
            for f in gh_list(f'data/testi/web/{sito_web}'):
                if f.get('type') == 'file' and f['name'].endswith('.txt'):
                    testi_disp.add(f['name'].replace('.txt',''))
        except:
            pass
    # Testi fusi per categoria
    try:
        for f in gh_list('data/testi/fusi'):
            if f.get('type') == 'file' and f['name'].endswith('.txt'):
                testi_disp.add(f['name'].replace('.txt',''))
    except:
        pass
    print(f'Testi disponibili (PDF+web+fusi): {len(testi_disp)}')

    # Carica guide esistenti
    try:
        raw_g, sha_g = gh_get('data/guide_complete.json')
        guide_data = json.loads(raw_g)
    except:
        guide_data = {'guide': []}
        sha_g = None

    guide_esistenti = {g['fase']: g for g in guide_data.get('guide', [])}
    guide_nuove = []
    aggiornate = 0

    for fase_info in FASI:
        fase = fase_info['fase']
        print(f'\n[{fase}]')

        testi = trova_testi_per_fase(fase_info, pdf_knowledge, testi_disp, max_testi=8)
        print(f'  Testi trovati: {len(testi)} (OCR: {sum(1 for t in testi if t["fonte"]=="ocr")})')

        guida = None
        if MISTRAL_KEY:
            guida = genera_guida_fase(fase_info, testi, oggi)
            if guida:
                print(f'  OK: {len(guida.get("contenuto_completo",""))}c, {len(guida.get("punti_chiave",[]))} punti')
                aggiornate += 1
            else:
                print('  Fallback')

        if not guida:
            # Mantieni guida esistente se disponibile, altrimenti fallback
            guida = guide_esistenti.get(fase) or guida_fallback(fase_info)

        guida['data_aggiornamento'] = oggi
        guide_nuove.append(guida)
        time.sleep(2)

    guide_data_new = {
        'lastUpdate': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'versione': '2.0',
        'testi_usati': len(testi_disp),
        'guide': guide_nuove
    }

    content_b64 = base64.b64encode(
        json.dumps(guide_data_new, indent=2, ensure_ascii=False).encode()).decode()
    sha_fresh = gh_get_sha('data/guide_complete.json') or sha_g
    gh_put('data/guide_complete.json', content_b64, sha_fresh,
           f'guide v2 {oggi} [{aggiornate}/{len(FASI)} Mistral, {len(testi_disp)} testi]')

    print(f'\n=== COMPLETATO: {aggiornate}/{len(FASI)} guide Mistral, {len(testi_disp)} testi usati ===')

if __name__ == '__main__':
    main()


