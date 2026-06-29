"""
brain_update.py v6 — Second Brain reale
Legge TUTTI i testi estratti da data/testi/, li sintetizza per categoria,
poi genera consigli basati su contenuto vero dei PDF + stato piante + meteo + luna.
Include memoria conversazioni e briefing proattivo.
"""
import os, json, base64, urllib.request, urllib.error, datetime, re, time

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
LAT  = 41.09696262016739
LON  = 14.388065360906802
RAW  = f'https://raw.githubusercontent.com/{REPO}/main/'

HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

# ── GitHub helpers ──────────────────────────────────────────────

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

def gh_raw(path):
    req = urllib.request.Request(RAW + path, headers={
        'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', errors='replace')

def gh_list(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        return json.load(r)

# ── Mistral ─────────────────────────────────────────────────────

def mistral_chat(prompt, max_tokens=2000, temperatura=0.2):
    if not MISTRAL_KEY:
        raise Exception('MISTRAL_KEY mancante')
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': max_tokens,
        'temperature': temperatura,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    req = urllib.request.Request(
        'https://api.mistral.ai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
        method='POST')
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.load(r)
    content = resp['choices'][0]['message']['content']
    tokens = resp.get('usage', {}).get('total_tokens', 0)
    print(f'  Mistral: {len(content)}c, {tokens} tokens')
    return content

def parse_json(testo):
    s, e = testo.find('{'), testo.rfind('}')
    if s >= 0 and e > s:
        try: return json.loads(testo[s:e+1])
        except: pass
    return None

# ── Meteo ───────────────────────────────────────────────────────

def fetch_meteo():
    try:
        url = (f'https://api.open-meteo.com/v1/forecast'
               f'?latitude={LAT}&longitude={LON}'
               f'&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code'
               f'&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset'
               f'&timezone=Europe/Rome&forecast_days=3')
        with urllib.request.urlopen(url, timeout=15) as r:
            d = json.load(r)
        cur   = d.get('current', {})
        daily = d.get('daily', {})
        ore_luce = 'N/A'
        try:
            from datetime import datetime as dt
            sr = daily.get('sunrise', [''])[0]
            ss = daily.get('sunset',  [''])[0]
            if sr and ss:
                ore_luce = round((dt.fromisoformat(ss)-dt.fromisoformat(sr)).total_seconds()/3600, 1)
        except: pass
        return {
            'temp_now': cur.get('temperature_2m'),
            'umidita':  cur.get('relative_humidity_2m'),
            'pioggia':  cur.get('precipitation', 0),
            'vento':    cur.get('wind_speed_10m'),
            'tmax': daily.get('temperature_2m_max', [None])[0],
            'tmin': daily.get('temperature_2m_min', [None])[0],
            'tmax1': daily.get('temperature_2m_max', [None,None])[1] if len(daily.get('temperature_2m_max',[])) > 1 else None,
            'pioggia_giorno': daily.get('precipitation_sum', [0])[0],
            'pioggia1': daily.get('precipitation_sum', [0,0])[1] if len(daily.get('precipitation_sum',[])) > 1 else 0,
            'ore_luce': ore_luce
        }
    except Exception as ex:
        print(f'  Meteo error: {ex}')
        return {}

# ── Leggi testi PDF ─────────────────────────────────────────────

def carica_testi_pdf(pdf_knowledge, max_testi=30, chars_per_testo=3000):
    """
    Carica testi estratti dalle sottocartelle tematiche di data/testi/.
    Legge prima le categorie prioritarie (elettrocultura, biodinamica, living_soil...)
    poi integra con testi dalla root non ancora classificati.
    Restituisce lista di dict {id, titolo, testo, tecniche, categoria}.
    """
    analisi = pdf_knowledge.get('analisi', [])

    # Mappa titolo -> analisi per lookup rapido
    by_titolo = {}
    for a in analisi:
        safe = re.sub(r'[^\w\-]', '_', a.get('titolo','').strip())
        safe = re.sub(r'_+', '_', safe).strip('_')[:80]
        by_titolo[safe] = a

    # Categorie in ordine di priorita per la serra
    CATEGORIE_ORDINE = [
        'elettrocultura', 'biodinamica', 'living_soil',
        'fisica_energie', 'agricoltura', 'fitoterapia',
        'scienza', 'esoterismo', 'altro'
    ]
    # Quanti testi per categoria (piu dalle categorie rilevanti)
    QUOTA_CAT = {
        'elettrocultura': 10, 'biodinamica': 6, 'living_soil': 6,
        'fisica_energie': 4, 'agricoltura': 3, 'fitoterapia': 2,
        'scienza': 2, 'esoterismo': 1, 'altro': 1
    }

    testi = []
    totale_per_cat = {}

    # 1. Carica dalle sottocartelle classificate
    for cat in CATEGORIE_ORDINE:
        if len(testi) >= max_testi:
            break
        quota = QUOTA_CAT.get(cat, 1)
        try:
            files_cat = gh_list(f'data/testi/{cat}')
            files_cat = [f for f in files_cat if f.get('type') == 'file' and f['name'].endswith('.txt')]
        except:
            files_cat = []

        cat_count = 0
        for f_info in files_cat:
            if len(testi) >= max_testi or cat_count >= quota:
                break
            safe_id = f_info['name'].replace('.txt', '')
            a = by_titolo.get(safe_id, {})
            try:
                testo_raw = gh_raw(f'data/testi/{cat}/{f_info["name"]}')
                # Rimuovi header
                if testo_raw.startswith('==='):
                    idx_h = testo_raw.find('\n\n')
                    if idx_h > 0: testo_raw = testo_raw[idx_h+2:]
                if '[VUOTO]' in testo_raw[:50] or len(testo_raw.strip()) < 100:
                    continue
                testo_raw = testo_raw.strip()[:chars_per_testo]
                testi.append({
                    'id':          a.get('id', safe_id),
                    'titolo':      a.get('titolo', safe_id.replace('_',' ')),
                    'testo':       testo_raw,
                    'tecniche':    a.get('tecniche_chiave', []),
                    'sommario':    a.get('sommario', ''),
                    'connessioni': len(a.get('connessioni', [])),
                    'categoria':   cat
                })
                cat_count += 1
            except:
                continue

        totale_per_cat[cat] = cat_count
        if cat_count > 0:
            print(f'  {cat}: {cat_count} testi')

    # 2. Integra con testi non ancora classificati (root data/testi/)
    if len(testi) < max_testi:
        try:
            files_root = gh_list('data/testi')
            files_root = [f for f in files_root
                         if f.get('type') == 'file' and f['name'].endswith('.txt')]
        except:
            files_root = []

        gia_caricati = {t['id'] for t in testi}
        for f_info in files_root:
            if len(testi) >= max_testi:
                break
            safe_id = f_info['name'].replace('.txt', '')
            a = by_titolo.get(safe_id, {})
            if a.get('id','') in gia_caricati:
                continue
            try:
                testo_raw = gh_raw(f'data/testi/{f_info["name"]}')
                if testo_raw.startswith('==='):
                    idx_h = testo_raw.find('\n\n')
                    if idx_h > 0: testo_raw = testo_raw[idx_h+2:]
                if '[VUOTO]' in testo_raw[:50] or len(testo_raw.strip()) < 100:
                    continue
                testi.append({
                    'id':          a.get('id', safe_id),
                    'titolo':      a.get('titolo', safe_id.replace('_',' ')),
                    'testo':       testo_raw.strip()[:chars_per_testo],
                    'tecniche':    a.get('tecniche_chiave', []),
                    'sommario':    a.get('sommario', ''),
                    'connessioni': len(a.get('connessioni', [])),
                    'categoria':   'non_classificato'
                })
            except:
                continue

    print(f'  Testi totali caricati: {len(testi)}/{max_testi} (classificati: {sum(totale_per_cat.values())})')
    return testi

# ── Sintetizza knowledge base ───────────────────────────────────

def sintetizza_kb(testi, piante_fasi, meteo):
    """
    Chiama Mistral per sintetizzare i testi PDF in una knowledge base
    strutturata per categorie: elettrocultura, suolo, biodinamica, ecc.
    Restituisce una stringa markdown compatta.
    """
    if not testi:
        return ''

    # Raggruppa per categoria tecnica
    categorie = {}
    for t in testi:
        for tec in (t['tecniche'] or ['generale']):
            cat = tec.split()[0].lower() if tec else 'generale'
            categorie.setdefault(cat, []).append(t)

    # Costruisci contesto compatto (max 6000 chars totali)
    ctx = ''
    chars_usati = 0
    for cat, lst in sorted(categorie.items(), key=lambda x: -len(x[1]))[:8]:
        for t in lst[:3]:
            snippet = f'[{t["id"]}] {t["titolo"][:50]}:\n{t["testo"][:800]}\n\n'
            if chars_usati + len(snippet) > 5500:
                break
            ctx += snippet
            chars_usati += len(snippet)

    fasi_attive = list(set(p.get('fase','') for p in piante_fasi))

    prompt = f"""Sei un agronomo esperto Living Soil, biodinamica ed elettrocultura.
Hai letto {len(testi)} manuali della biblioteca BioSerra Caserta.
Fasi attive in serra oggi: {', '.join(fasi_attive)}.
Meteo: {meteo.get('temp_now')}C, umidita {meteo.get('umidita')}%, pioggia {meteo.get('pioggia_giorno')}mm.

ESTRATTI DAI MANUALI:
{ctx}

Sintetizza in JSON le conoscenze piu rilevanti PER OGGI estratte da questi testi:
{{
  "principi_attivi": ["max 5 principi o tecniche chiave che emergono dai testi"],
  "consiglio_elettro_da_testi": "consiglio specifico elettrocultura citando il manuale [id]",
  "consiglio_suolo_da_testi": "consiglio suolo/radici citando il manuale [id]",
  "consiglio_biodinamica_da_testi": "consiglio biodinamica/luna citando il manuale [id]",
  "scoperta_del_giorno": "osservazione interessante dai testi correlata alla situazione attuale",
  "tecnica_da_provare": {{
    "nome": "nome tecnica specifica dai manuali",
    "descrizione": "come applicarla in serra oggi",
    "fonte": "[id manuale]",
    "materiali": ["lista materiali"]
  }}
}}
Rispondi SOLO JSON valido."""

    try:
        risposta = mistral_chat(prompt, max_tokens=1200, temperatura=0.2)
        return parse_json(risposta) or {}
    except Exception as ex:
        print(f'  sintetizza_kb ERR: {ex}')
        return {}

# ── Genera briefing proattivo ────────────────────────────────────

def genera_briefing(piante, meteo, luna, kb_sintesi, memoria, oggi_data):
    """
    Genera il briefing completo del giorno: consigli specifici pianta per pianta,
    tecniche da applicare, avvisi urgenti. Usa la knowledge base sintetizzata.
    """
    stato_piante = piante.get('stato_piante', [])
    alerts       = piante.get('alerts_oggi', [])

    ctx_piante = '\n'.join(
        f'{p["nome"]} ({p.get("tipo","?")[0].upper()}): '
        f'fase={p.get("fase","?")}, giorno {p.get("giorni_vita","?")}d, '
        f'raccolta tra {p.get("giorni_a_raccolta","?")}gg'
        for p in stato_piante
    )
    ctx_alerts = '\n'.join(a['msg'] for a in alerts[:5]) if alerts else 'Nessun alert critico'

    # Memoria ultima sessione
    ctx_memoria = ''
    if memoria:
        ultime = memoria.get('sessioni', [])[-3:]
        if ultime:
            ctx_memoria = 'MEMORIA ULTIME SESSIONI:\n'
            for s in ultime:
                ctx_memoria += f"- {s.get('data','')}: {s.get('riassunto','')[:200]}\n"

    # Knowledge base sintetizzata
    ctx_kb = ''
    if kb_sintesi:
        ctx_kb = f"""CONOSCENZE DAI MANUALI BioSerra:
Principi attivi oggi: {', '.join(kb_sintesi.get('principi_attivi', []))}
Elettrocultura: {kb_sintesi.get('consiglio_elettro_da_testi', '')}
Suolo: {kb_sintesi.get('consiglio_suolo_da_testi', '')}
Biodinamica: {kb_sintesi.get('consiglio_biodinamica_da_testi', '')}
Scoperta: {kb_sintesi.get('scoperta_del_giorno', '')}"""

    prompt = f"""Sei il cervello AI di BioSerra, una serra Living Soil outdoor a Caserta (41N).
Hai studiato {89} manuali di elettrocultura, biodinamica e Living Soil.
Oggi {oggi_data}. Rispondi in italiano. Sii SPECIFICO e PRATICO, cita i manuali quando possibile.

=== PIANTE IN SERRA ===
{ctx_piante}

=== ALERTS ===
{ctx_alerts}

=== METEO CASERTA ===
Ora: {meteo.get('temp_now')}C, umidita {meteo.get('umidita')}%, vento {meteo.get('vento')} km/h
Oggi: max {meteo.get('tmax')}C / min {meteo.get('tmin')}C, pioggia {meteo.get('pioggia_giorno')}mm
Domani: max {meteo.get('tmax1')}C, pioggia {meteo.get('pioggia1')}mm

=== LUNA ===
Fase: {luna.get('fase','?')} {luna.get('emoji','')}
Illuminazione: {luna.get('illuminazione', luna.get('illuminazione_pct',50))}%
Tipo giorno biodinamico: {luna.get('tipo_giorno', 'da calcolare')}

{ctx_kb}

{ctx_memoria}

Genera JSON completo:
{{
  "consigli_giorno": [
    "consiglio 1 specifico per oggi con riferimento a tecnica/manuale",
    "consiglio 2 specifico",
    "consiglio 3 specifico"
  ],
  "briefing_mattutino": "paragrafo di 3-4 frasi: stato generale serra, cosa fare oggi, perche — cita manuali",
  "consigli_piante": {{
    "autofiorenti": "azione specifica per Epsilon/Milky Way/Titan/Medusa/Gaia oggi",
    "femminizzate": "azione specifica per Astro Lemonade/Cosmic Cheddar/Orbital Banana/Royal Gorilla/Mexican Rush oggi",
    "per_pianta": [
      {{"nome": "Epsilon F1", "azione": "cosa fare oggi", "priorita": "alta/media/bassa"}}
    ]
  }},
  "tecniche_nuove": [{{
    "nome": "nome tecnica dai manuali",
    "descrizione": "come applicarla specificamente nella tua serra",
    "fonte": "[id manuale]",
    "materiali": ["lista"],
    "difficolta": "bassa/media/alta"
  }}],
  "scoperte": ["osservazione scientifica interessante correlata alla situazione attuale"],
  "avvisi": ["alert urgente 1", "alert urgente 2"],
  "piano_giornata": {{
    "mattina": "cosa fare 07-12",
    "pomeriggio": "cosa fare 12-18 (evitare ore calde se >30C)",
    "sera": "cosa fare 18-21"
  }},
  "agenti": {{
    "piante": {{
      "stato_generale": "ottimale/monitoraggio/attenzione/critico",
      "irrigazione": "quando e quanto irrigare oggi con motivazione",
      "nutrizione": "integrazioni o nessuna (water-only)"
    }},
    "ambiente": {{
      "luna": {{
        "fase": "{luna.get('fase','?')}",
        "emoji": "{luna.get('emoji','')}",
        "illuminazione_pct": {luna.get('illuminazione', luna.get('illuminazione_pct',50))},
        "consiglio": "azione specifica correlata alla fase lunare"
      }},
      "ore_luce": {meteo.get('ore_luce', 14)}
    }},
    "elettro": {{
      "verifica_oggi": ["verifica tecnica 1", "verifica tecnica 2"],
      "ottimizzazione": "suggerimento specifico dai manuali"
    }}
  }}
}}
Rispondi SOLO JSON valido. Nessun testo fuori dal JSON."""

    try:
        risposta = mistral_chat(prompt, max_tokens=2500, temperatura=0.25)
        return parse_json(risposta)
    except Exception as ex:
        print(f'  genera_briefing ERR: {ex}')
        return None

# ── Memoria conversazioni ────────────────────────────────────────

def carica_memoria():
    """Carica memoria sessioni precedenti da data/memoria_chat.json."""
    try:
        raw = gh_raw('data/memoria_chat.json')
        return json.loads(raw)
    except:
        return {'sessioni': [], 'temi_ricorrenti': [], 'esperimenti_attivi': []}

def aggiorna_memoria_giornaliera(memoria, brain_oggi, oggi_data):
    """
    Aggiunge entry giornaliera alla memoria con riassunto del contesto.
    La memoria accumula gli stati giornalieri — il Cervello AI la legge all'avvio.
    """
    nuova_entry = {
        'data': oggi_data,
        'tipo': 'brain_giornaliero',
        'riassunto': (
            f"Avvisi: {'; '.join(brain_oggi.get('avvisi',[])[:2])}. "
            f"Consigli: {brain_oggi.get('consigli_giorno',[''])[0][:100]}. "
            f"Piano: {brain_oggi.get('piano_giornata',{}).get('mattina','')[:80]}"
        ),
        'tecniche_suggerite': [t.get('nome','') for t in brain_oggi.get('tecniche_nuove',[])]
    }

    sessioni = memoria.get('sessioni', [])
    # Rimuovi entry della stessa data se esiste
    sessioni = [s for s in sessioni if s.get('data') != oggi_data]
    sessioni.append(nuova_entry)
    # Mantieni ultimi 30 giorni
    sessioni = sessioni[-30:]
    memoria['sessioni'] = sessioni
    return memoria

def salva_memoria(memoria, sha):
    content_b64 = base64.b64encode(
        json.dumps(memoria, indent=2, ensure_ascii=False).encode()).decode()
    sha_fresh = gh_get_sha('data/memoria_chat.json') or sha
    gh_put('data/memoria_chat.json', content_b64, sha_fresh or 'new',
           f'memoria: {datetime.date.today().isoformat()}')

# ── Fallback ─────────────────────────────────────────────────────

def brain_fallback(piante, luna, meteo, oggi):
    alerts = piante.get('alerts_oggi', [])
    avvisi = [a['msg'] for a in alerts[:3]] if alerts else ['Nessun avviso critico']
    return {
        'consigli_giorno': [
            f'Fase luna: {luna.get("fase","?")}. Controlla stato piante.',
            'Verifica irrigazione e umidita substrato.',
            'Controlla tecniche elettrocultura attive.'
        ],
        'briefing_mattutino': 'Sistema in modalita fallback. Controlla connessione Mistral.',
        'consigli_piante': {
            'autofiorenti': 'Monitora crescita e avvisi raccolta.',
            'femminizzate': 'Verifica vegetazione.',
            'per_pianta': []
        },
        'tecniche_nuove': [],
        'scoperte': [],
        'avvisi': avvisi,
        'piano_giornata': {'mattina': 'Controlla piante', 'pomeriggio': 'Riposo ore calde', 'sera': 'Irrigazione'},
        'agenti': {
            'piante': {'stato_generale': 'monitoraggio', 'irrigazione': 'Valuta al mattino', 'nutrizione': 'Water-only'},
            'ambiente': {'luna': {'fase': luna.get('fase','?'), 'emoji': luna.get('emoji',''), 'illuminazione_pct': 50, 'consiglio': ''}, 'ore_luce': 14},
            'elettro': {'verifica_oggi': ['Controlla circuito Lakhovsky', 'Verifica spirale rame'], 'ottimizzazione': ''}
        }
    }

# ── Main ─────────────────────────────────────────────────────────

def main():
    oggi_iso  = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    oggi_data = datetime.date.today().isoformat()
    print(f'=== BioSerra Brain v6 — Second Brain reale ({oggi_data}) ===')
    print(f'MISTRAL_KEY: {"OK " + MISTRAL_KEY[:8] + "..." if MISTRAL_KEY else "ASSENTE"}')

    # 1. Carica dati base
    print('\n[1/6] Dati base...')
    raw_p, _ = gh_get('data/piante_stato.json')
    piante    = json.loads(raw_p).get('data', {})
    stato_piante = piante.get('stato_piante', [])
    print(f'  Piante: {len(stato_piante)}')

    raw_l, _ = gh_get('data/luna_consigli.json')
    luna_raw  = json.loads(raw_l)
    luna      = luna_raw.get('data', luna_raw)
    print(f'  Luna: {luna.get("fase","?")}')

    meteo = fetch_meteo()
    print(f'  Meteo: {meteo.get("temp_now")}C')

    # 2. Carica pdf_knowledge
    print('\n[2/6] PDF knowledge...')
    raw_pdf, _ = gh_get('data/pdf_knowledge.json')
    pdf_knowledge = json.loads(raw_pdf)
    print(f'  PDF analizzati: {len(pdf_knowledge.get("analisi",[]))}')

    # 3. Carica memoria
    print('\n[3/6] Memoria sessioni...')
    memoria = carica_memoria()
    print(f'  Sessioni in memoria: {len(memoria.get("sessioni",[]))}')

    # 4. Carica e sintetizza testi PDF (il cuore del Second Brain)
    print('\n[4/6] Carico testi PDF dalla knowledge base...')
    testi = carica_testi_pdf(pdf_knowledge, max_testi=25, chars_per_testo=2500)

    kb_sintesi = {}
    if testi and MISTRAL_KEY:
        print(f'\n[4b] Sintetizzo {len(testi)} testi PDF con Mistral...')
        kb_sintesi = sintetizza_kb(testi, stato_piante, meteo)
        print(f'  Principi estratti: {len(kb_sintesi.get("principi_attivi",[]))}')
        time.sleep(2)

    # 5. Genera briefing completo
    print('\n[5/6] Genera briefing proattivo...')
    cervello_data = None
    if MISTRAL_KEY:
        cervello_data = genera_briefing(piante, meteo, luna, kb_sintesi, memoria, oggi_data)
        if cervello_data:
            print(f'  Briefing OK: {len(cervello_data.get("consigli_giorno",[]))} consigli')
        else:
            print('  Fallback...')

    if not cervello_data:
        cervello_data = brain_fallback(piante, luna, meteo, oggi_data)

    # Aggiungi dati kb_sintesi al brain
    if kb_sintesi:
        cervello_data['kb_sintesi'] = kb_sintesi
        cervello_data['testi_letti'] = len(testi)

    # Assicura struttura agenti minima
    agenti = cervello_data.setdefault('agenti', {})
    agenti.setdefault('piante', {}).setdefault('piante_critiche', [
        {'id': p['id'], 'nome': p['nome'], 'giorni_a_raccolta': p.get('giorni_a_raccolta')}
        for p in stato_piante if 0 < (p.get('giorni_a_raccolta') or 999) <= 14
    ])

    # 6. Salva brain.json
    print('\n[6/6] Salvo brain.json...')
    brain_out = {
        'lastUpdate': oggi_iso,
        'versione': '6.0',
        'testi_pdf_letti': len(testi),
        'cervello': {
            'consigli_giorno':   cervello_data.get('consigli_giorno', []),
            'briefing_mattutino': cervello_data.get('briefing_mattutino', ''),
            'consigli_piante':   cervello_data.get('consigli_piante', {}),
            'tecniche_nuove':    cervello_data.get('tecniche_nuove', []),
            'scoperte':          cervello_data.get('scoperte', []),
            'avvisi':            cervello_data.get('avvisi', []),
            'piano_giornata':    cervello_data.get('piano_giornata', {}),
            'kb_sintesi':        cervello_data.get('kb_sintesi', {})
        },
        'agenti':          cervello_data.get('agenti', {}),
        'tecniche_nuove':  cervello_data.get('tecniche_nuove', []),
        'avvisi':          cervello_data.get('avvisi', []),
        'consigli_giorno': cervello_data.get('consigli_giorno', [])
    }

    content_b64 = base64.b64encode(
        json.dumps(brain_out, indent=2, ensure_ascii=False).encode()).decode()
    _, sha = gh_get('data/brain.json')
    gh_put('data/brain.json', content_b64, sha, f'brain v6 {oggi_data} [{len(testi)} testi PDF]')
    print(f'  Salvato. Testi letti: {len(testi)}, Consigli: {len(brain_out["consigli_giorno"])}')

    # Aggiorna e salva memoria
    memoria = aggiorna_memoria_giornaliera(memoria, cervello_data, oggi_data)
    sha_mem = gh_get_sha('data/memoria_chat.json')
    salva_memoria(memoria, sha_mem)
    print(f'  Memoria aggiornata: {len(memoria["sessioni"])} sessioni')

    print(f'\n=== COMPLETATO — v6.0 | {len(testi)} PDF letti | {oggi_data} ===')
    if brain_out['consigli_giorno']:
        print(f'Consiglio 1: {brain_out["consigli_giorno"][0][:120]}')
    if brain_out['cervello'].get('briefing_mattutino'):
        print(f'Briefing: {brain_out["cervello"]["briefing_mattutino"][:150]}')

if __name__ == '__main__':
    import traceback, sys
    try:
        main()
    except Exception as ex:
        tb = traceback.format_exc()
        log = f'BRAIN CRASH: {type(ex).__name__}: {ex}\n\n{tb}'
        print(log)
        try:
            import datetime
            oggi = datetime.date.today().isoformat()
            tok = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
            path_log = 'data/brain_crash_log.txt'
            req_sha = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path_log}',
                headers={'Authorization': f'token {tok}', 'Accept': 'application/vnd.github+json'})
            try:
                with urllib.request.urlopen(req_sha) as r: sha_log = json.load(r)['sha']
            except: sha_log = None
            body_log = json.dumps({
                'message': f'crash: brain_update [{oggi}]',
                'content': base64.b64encode(log.encode()).decode('ascii'),
                'branch': 'main',
                **({'sha': sha_log} if sha_log else {})
            }).encode()
            req_put = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path_log}',
                data=body_log,
                headers={'Authorization': f'token {tok}', 'Content-Type': 'application/json',
                         'Accept': 'application/vnd.github+json'},
                method='PUT')
            with urllib.request.urlopen(req_put): print('Log salvato!')
        except Exception as log_ex:
            print(f'Log ERR: {log_ex}')
        sys.exit(1)
