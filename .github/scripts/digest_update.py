#!/usr/bin/env python3
"""
BioSerra - digest_update.py
Rigenera knowledge_digest.json combinando i dati gia prodotti dalla pipeline
(brain.json v6, guide_complete.json, esperimenti.json, concetti_index.json).
Sostituisce la vecchia generazione N8N (dismessa).
Nessuna chiamata Mistral: usa kb_sintesi gia sintetizzata da brain_update.py.
"""
import os, json, base64, urllib.request, datetime, time

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
REPO = 'francescocaruso487-tech/bioserra'
RAW = f'https://raw.githubusercontent.com/{REPO}/main/'
HEADERS_GH = {
    'Authorization': f'token {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}


def gh_get(path):
    """Lettura con fallback raw per file >1MB. Resiliente: 3 tentativi, rilancia l'ultima eccezione."""
    last_ex = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            if not d.get('content', '').strip():
                req2 = urllib.request.Request(RAW + path, headers={
                    'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(req2, timeout=30) as r2:
                    return r2.read().decode('utf-8'), d['sha']
            return base64.b64decode(d['content'].replace('\n', '')).decode('utf-8'), d['sha']
        except Exception as ex:
            last_ex = ex
            print(f'  gh_get tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    raise last_ex


def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)['sha']
    except Exception:
        return None


def gh_put(path, content, msg):
    """Scrittura resiliente: SHA fresco + 3 tentativi."""
    if isinstance(content, str):
        content = content.encode('utf-8')
    encoded = base64.b64encode(content).decode('ascii')
    for attempt in range(3):
        try:
            sha = gh_get_sha(path)  # SHA sempre fresco prima del PUT
            body = {'message': msg, 'content': encoded, 'branch': 'main'}
            if sha:
                body['sha'] = sha
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}',
                data=json.dumps(body).encode(),
                headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
            with urllib.request.urlopen(req) as r:
                return json.load(r)['commit']['sha']
        except Exception as ex:
            print(f'  gh_put tentativo {attempt+1} fallito: {ex}')
            time.sleep(3)
    return None


def load_json(path, default):
    for _ in range(3):
        try:
            raw, _sha = gh_get(path)
            if raw and raw.strip():
                return json.loads(raw)
        except Exception as ex:
            print(f'  load {path} fallito: {ex}')
            time.sleep(2)
    print(f'  WARN: {path} non disponibile, uso default')
    return default


def s(v, n=300):
    """Stringa pulita, troncata, senza termini vietati."""
    if not v:
        return ''
    if isinstance(v, dict):
        # estrai il testo piu sensato da un oggetto
        v = v.get('descrizione') or v.get('nome') or v.get('testo') or ' '.join(str(x) for x in v.values() if isinstance(x, str))
    if isinstance(v, list):
        v = ' '.join(str(x) for x in v if x)
    v = str(v).replace('```json', '').replace('```', '').strip()
    # Sanitizzazione termine vietato (regola progetto: niente 'cannabis')
    import re as _re
    v = _re.sub(r'(?i)\bdi cannabis\b', '', v)
    v = _re.sub(r'(?i)cannabis', 'pianta', v)
    v = _re.sub(r'\s{2,}', ' ', v).strip()
    return v[:n]


def main():
    oggi = datetime.date.today().isoformat()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    print(f'=== BioSerra Digest Update — {oggi} ===')

    brain = load_json('data/brain.json', {})
    guide = load_json('data/guide_complete.json', {})
    esper = load_json('data/esperimenti.json', {})
    piante_stato = load_json('data/piante_stato.json', {})

    cerv = brain.get('cervello', {}) if isinstance(brain, dict) else {}
    kb = cerv.get('kb_sintesi', {}) if isinstance(cerv.get('kb_sintesi'), dict) else {}

    # --- mappa fase guida -> piante attive in quella fase (per piante_coinvolte) ---
    stato_piante = ((piante_stato.get('data', {}) or {}).get('stato_piante', [])
                     if isinstance(piante_stato, dict) else [])
    FASE_DIRETTA = {'germinazione', 'vegetazione', 'fioritura', 'essiccazione', 'concia'}
    FASE_TRASVERSALE = {'suolo', 'elettrocultura', 'biodinamica', 'irrigazione'}  # tutta la serra
    tutte_le_piante = [p.get('nome', '') for p in stato_piante if p.get('nome')]

    def piante_per_fase(fase_guida):
        fase_guida = (fase_guida or '').lower()
        if fase_guida in FASE_TRASVERSALE:
            return tutte_le_piante  # elettrocultura/biodinamica si applicano a tutta la serra
        if fase_guida == 'pre_raccolta':
            vicine = [p.get('nome', '') for p in stato_piante
                      if str(p.get('fase', '')).lower() == 'fioritura'
                      and isinstance(p.get('giorni_a_raccolta'), (int, float))
                      and 0 <= p['giorni_a_raccolta'] <= 14]
            if vicine:
                return vicine
            fase_guida = 'fioritura'  # fallback se nessuna è ancora vicina al taglio
        return [p.get('nome', '') for p in stato_piante if str(p.get('fase', '')).lower() == fase_guida]

    # --- guide_potenziate: dalle guide reali con tecniche elettrocultura/pdf ---
    guide_list = guide.get('guide', []) if isinstance(guide, dict) else []
    guide_pot = []
    for g in guide_list:
        tec_el = g.get('tecniche_elettrocultura', []) or g.get('tecniche_pdf', [])
        punti = g.get('punti_chiave', [])
        if not punti:
            continue
        guide_pot.append({
            'titolo': s(g.get('titolo', g.get('fase', '')), 90),
            'guida_base': s(punti[0] if punti else '', 120),
            'potenziamento_pdf': s(tec_el[0] if tec_el else (punti[1] if len(punti) > 1 else ''), 150),
            'esperimento_suggerito': s(g.get('timeline_caserta', ''), 150),
            'applicabile_oggi': True,
            'piante_coinvolte': piante_per_fase(g.get('fase'))
        })
        if len(guide_pot) >= 2:
            break

    # --- esperimenti_attivi_suggeriti: dai proposti/attivi ---
    attivi = esper.get('esperimenti_attivi', []) if isinstance(esper, dict) else []
    proposte = esper.get('proposte', []) if isinstance(esper, dict) else []
    fonte_esp = attivi if attivi else proposte
    esp_sugg = []
    for e in fonte_esp[:2]:
        esp_sugg.append({
            'nome': s(e.get('nome', ''), 80),
            'descrizione': s(e.get('descrizione', ''), 160),
            'urgenza': e.get('difficolta', 'media') if e.get('difficolta') in ('alta', 'media', 'bassa') else 'media',
            'piante': []
        })

    # --- campi sintesi da brain.kb_sintesi (gia prodotti, no Mistral) ---
    scoperta = s(kb.get('scoperta_del_giorno', ''), 250)
    consiglio = s(kb.get('consiglio_elettro_da_testi', '') or kb.get('consiglio_suolo_da_testi', ''), 250)
    connessione = s(kb.get('tecnica_da_provare', '') or kb.get('consiglio_biodinamica_da_testi', ''), 250)

    # Fallback su briefing/consigli se kb_sintesi vuota
    if not scoperta:
        scoperta = s(cerv.get('briefing_mattutino', ''), 250)
    if not consiglio:
        cg = cerv.get('consigli_giorno', []) or brain.get('consigli_giorno', [])
        consiglio = s([c for c in cg if isinstance(c, str) and not c.startswith('{')], 250)

    digest = {
        'lastUpdate': now_iso,
        'data': oggi,
        'guide_potenziate': guide_pot,
        'esperimenti_attivi_suggeriti': esp_sugg,
        'scoperta_del_giorno': scoperta,
        'consiglio_integrato': consiglio,
        'connessione_inaspettata': connessione,
        'stats': {
            'guide': len(guide_pot),
            'esperimenti': len(esp_sugg)
        }
    }

    new_sha = gh_put('data/knowledge_digest.json',
                     json.dumps(digest, ensure_ascii=False, indent=2),
                     f'digest: rigenerato da brain+guide+esperimenti [{oggi}]')
    if new_sha:
        print(f'  knowledge_digest.json salvato (commit {new_sha[:7]})')
        print(f'  guide:{len(guide_pot)} esperimenti:{len(esp_sugg)} '
              f'scoperta:{bool(scoperta)} consiglio:{bool(consiglio)} connessione:{bool(connessione)}')
    else:
        print('  ERRORE: salvataggio fallito')


if __name__ == '__main__':
    main()
