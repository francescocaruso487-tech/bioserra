#!/usr/bin/env python3
"""
memoria_lungo_termine.py
Distilla pattern ricorrenti da diario_interventi.json + memoria_chat.json (sessioni)
+ correlazioni interventi<->esiti calcolate su storico_cicli.json, in "appunti permanenti"
salvati in memoria_chat.json -> temi_ricorrenti[]. cervBuildSystem() in laboratorio.js
inietta questi appunti nel system prompt del Cervello AI, cosi' impara nel tempo dalla
serra specifica invece di ripartire ogni notte da una sintesi generica.

Gira DOPO brain_update.py (che scrive .sessioni di memoria_chat.json) per non essere
sovrascritto - vedi orario nel workflow yml.
"""
import json, base64, urllib.request, time, sys, re, os
from datetime import datetime, timezone

REPO = 'francescocaruso487-tech/bioserra'
GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
MISTRAL_KEY = os.environ.get('MISTRAL_KEY', '')
HEADERS_GH = {'Authorization': f'token {GITHUB_TOKEN}', 'Accept': 'application/vnd.github+json'}

MAX_TEMI = 15  # cap appunti permanenti conservati


def sanitize_testo(t):
    """Regola progetto: niente 'cannabis' nel testo generato/mostrato - sostituisce con 'pianta'."""
    if not t or not isinstance(t, str):
        return t
    t = re.sub(r'\s*(\s*[Cc]annabis\s+sativa\s+L\.?\s*)', '', t)
    t = re.sub(r'\bpianta\s+di\s+[Cc]annabis\b', 'pianta', t, flags=re.IGNORECASE)
    t = t.replace('CANNABIS', 'PIANTA')
    t = t.replace('Cannabis', 'Pianta')
    t = t.replace('cannabis', 'pianta')
    return t


def gh_get(path):
    """Resiliente: 3 tentativi, timeout, rilancia l'ultima eccezione se falliscono tutti."""
    last_ex = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.load(r)
            if not d.get('content', '').strip():
                raw_url = f'https://raw.githubusercontent.com/{REPO}/main/{path}'
                req2 = urllib.request.Request(raw_url, headers={
                    'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
                with urllib.request.urlopen(req2, timeout=30) as r2:
                    return r2.read().decode('utf-8'), d['sha']
            return base64.b64decode(d['content'].replace('\n', '')).decode('utf-8'), d['sha']
        except Exception as ex:
            last_ex = ex
            print(f'  gh_get tentativo {attempt + 1} fallito ({path}): {ex}')
            time.sleep(3)
    raise last_ex


def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)['sha']
    except Exception:
        return None


def gh_put(path, content, message):
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
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as ex:
            print(f'  gh_put tentativo {attempt + 1} fallito ({path}): {ex}')
            time.sleep(3)
    return None


def mistral_call(prompt, max_tokens=700):
    body = {
        'model': 'mistral-small-latest',
        'messages': [{'role': 'user', 'content': prompt}],
        'temperature': 0.0,
        'max_tokens': max_tokens,
    }
    req = urllib.request.Request(
        'https://api.mistral.ai/v1/chat/completions',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
        method='POST')
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.load(r)
    txt = d['choices'][0]['message']['content'].strip()
    if txt.startswith('```'):
        txt = re.sub(r'^```(json)?\s*', '', txt)
        txt = re.sub(r'```\s*$', '', txt)
    return txt.strip()


def parse_json_list(txt):
    try:
        v = json.loads(txt)
        if isinstance(v, list):
            return v
    except Exception:
        pass
    m = re.search(r'\[.*\]', txt, re.DOTALL)
    if m:
        try:
            v = json.loads(m.group(0))
            if isinstance(v, list):
                return v
        except Exception:
            pass
    return None


def build_correlazioni(storico, diario):
    """
    Replica (server-side, semplificata) la logica di buildCorrelazioniInterventi() in piante.js:
    richiede almeno 3 cicli archiviati totali e, per tipo di intervento, almeno 2 cicli "con"
    e 1 "senza" quel tipo nel loro periodo attivo germinazione->raccolta, confrontando voto/resa medi.
    Nomi campo tollerati su piu' varianti perche' storico_cicli.json non ha schema documentato rigido.
    """
    cicli = storico.get('storico_cicli', []) or []
    interventi = diario.get('interventi', []) or []
    if len(cicli) < 3 or not interventi:
        return []

    tipi = sorted(set(i.get('tipo') for i in interventi if i.get('tipo')))
    risultati = []

    for tipo in tipi:
        con, senza = [], []
        for c in cicli:
            pid = c.get('id_pianta') if c.get('id_pianta') is not None else c.get('plant_id')
            germ = c.get('germinazione') or c.get('data_germinazione')
            racc = c.get('data_raccolta') or c.get('raccolta')
            ha = False
            for iv in interventi:
                if iv.get('tipo') != tipo:
                    continue
                if pid is not None and pid not in (iv.get('piante') or []):
                    continue
                d = iv.get('data')
                if germ and racc and d and not (germ <= d <= racc):
                    continue
                ha = True
                break
            voto = c.get('voto')
            resa = c.get('resa') if c.get('resa') is not None else (
                c.get('resa_g') if c.get('resa_g') is not None else c.get('resa_grammi'))
            entry = {'voto': voto, 'resa': resa}
            (con if ha else senza).append(entry)

        if len(con) >= 2 and len(senza) >= 1:
            def media(lst, campo):
                vals = [x[campo] for x in lst if isinstance(x.get(campo), (int, float))]
                return round(sum(vals) / len(vals), 2) if vals else None

            risultati.append({
                'tipo': tipo,
                'n_con': len(con), 'n_senza': len(senza),
                'voto_medio_con': media(con, 'voto'), 'voto_medio_senza': media(senza, 'voto'),
                'resa_media_con': media(con, 'resa'), 'resa_media_senza': media(senza, 'resa'),
            })
    return risultati


_TRACE = {}


def _salva_trace(extra=None):
    if extra:
        _TRACE.update(extra)
    try:
        gh_put('data/_debug_memoria.json',
               json.dumps(_TRACE, ensure_ascii=False, indent=2, default=str),
               'debug temporaneo memoria_lungo_termine')
    except Exception as ex:
        print('impossibile salvare trace:', ex)


def main():
    print('=== memoria_lungo_termine.py avviato', datetime.now(timezone.utc).isoformat(), '===')
    _TRACE['ts'] = datetime.now(timezone.utc).isoformat()
    _TRACE['token_present'] = bool(GITHUB_TOKEN)
    _TRACE['mistral_key_present'] = bool(MISTRAL_KEY)
    _salva_trace({'step': '1_start'})

    try:
        raw_mem, _ = gh_get('data/memoria_chat.json')
        memoria = json.loads(raw_mem)
    except Exception as ex:
        print(f'ERRORE CRITICO: lettura memoria_chat.json fallita dopo 3 tentativi: {ex}')
        sys.exit(1)

    try:
        raw_dia, _ = gh_get('data/diario_interventi.json')
        diario = json.loads(raw_dia)
    except Exception as ex:
        print(f'ERRORE CRITICO: lettura diario_interventi.json fallita dopo 3 tentativi: {ex}')
        sys.exit(1)

    try:
        raw_sto, _ = gh_get('data/storico_cicli.json')
        storico = json.loads(raw_sto)
    except Exception as ex:
        print(f'ATTENZIONE: lettura storico_cicli.json fallita, procedo senza correlazioni: {ex}')
        storico = {'storico_cicli': []}

    _salva_trace({'step': '2_letture_ok'})
    sessioni = memoria.get('sessioni', []) or []
    interventi = diario.get('interventi', []) or []
    temi_esistenti = memoria.get('temi_ricorrenti', []) or []

    if not sessioni and not interventi:
        print('Nessun dato sufficiente (sessioni e interventi vuoti). Esco senza modificare nulla.')
        return

    correlazioni = build_correlazioni(storico, diario)
    _salva_trace({'step': '3_correlazioni_ok', 'n_sessioni': len(sessioni),
                  'n_interventi': len(interventi), 'n_correlazioni': len(correlazioni)})

    ctx = '=== SESSIONI RECENTI CERVELLO AI (ultime 10) ===\n'
    for s in sessioni[-10:]:
        ctx += f"{s.get('data', '?')}: {str(s.get('riassunto', ''))[:200]}\n"
        tec = s.get('tecniche_suggerite') or []
        if tec:
            ctx += '  Tecniche: ' + ', '.join(tec) + '\n'

    ctx += '\n=== INTERVENTI DIARIO (ultimi 40) ===\n'
    for iv in interventi[-40:]:
        ctx += (f"{iv.get('data', '?')} {iv.get('tipo', '?')} "
                f"piante={iv.get('piante', [])} note={str(iv.get('note', ''))[:80]}\n")

    if correlazioni:
        ctx += '\n=== CORRELAZIONI STATISTICHE (interventi vs esiti cicli archiviati) ===\n'
        for c in correlazioni:
            ctx += json.dumps(c, ensure_ascii=False) + '\n'
    else:
        ctx += '\n(Correlazioni statistiche non ancora disponibili: servono almeno 3 cicli archiviati)\n'

    if temi_esistenti:
        ctx += "\n=== APPUNTI PERMANENTI GIA' MEMORIZZATI (non ripetere, solo integrare/aggiornare) ===\n"
        for t in temi_esistenti:
            ctx += '- ' + (t.get('testo') if isinstance(t, dict) else str(t)) + '\n'

    prompt = (
        "Sei il modulo di memoria a lungo termine del Cervello AI di BioSerra (serra Living Soil "
        "outdoor a Caserta, elettrocultura + biodinamica). Analizza il contesto sotto e distilla "
        "SOLO pattern concreti, specifici, ripetuti almeno 2 volte o statisticamente supportati - "
        "MAI consigli generici da manuale, MAI ripetizioni di appunti gia' memorizzati. "
        "Se non ci sono pattern reali nuovi, ritorna una lista vuota: [].\n"
        "Rispondi SOLO con un array JSON valido, nessun testo fuori dal JSON, max 8 elementi, "
        "ogni elemento: {\"testo\": \"frase breve max 25 parole in italiano, con pianta/tecnica/esito "
        "specifico se disponibile\", \"evidenza\": \"breve motivo/fonte, max 15 parole\"}.\n\n"
        + ctx
    )

    try:
        _salva_trace({'step': '4_pre_mistral_call', 'prompt_len': len(prompt)})
        risposta = mistral_call(prompt)
        _salva_trace({'step': '5_mistral_ok', 'risposta_grezza': risposta[:500]})
    except Exception as ex:
        print(f'ATTENZIONE: chiamata Mistral fallita, nessun aggiornamento in questa run: {ex}')
        gh_put('data/_debug_memoria.json',
               json.dumps({'errore': 'mistral_call', 'dettaglio': str(ex)}, ensure_ascii=False, indent=2),
               'debug temporaneo memoria_lungo_termine')
        return

    nuovi = parse_json_list(risposta)
    _salva_trace({'step': '5b_parse_ok', 'nuovi_tipo': type(nuovi).__name__,
                  'nuovi_len': (len(nuovi) if isinstance(nuovi, list) else None)})
    if nuovi is None:
        print("ATTENZIONE: risposta Mistral non e' una lista JSON valida, nessun aggiornamento.")
        print('Risposta grezza (troncata):', risposta[:300])
        gh_put('data/_debug_memoria.json',
               json.dumps({'errore': 'parse_json_list', 'risposta_grezza': risposta[:1000]}, ensure_ascii=False, indent=2),
               'debug temporaneo memoria_lungo_termine')
        return

    oggi = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    nuovi_puliti = []
    for n in nuovi:
        if not isinstance(n, dict):
            continue
        testo = sanitize_testo(str(n.get('testo', '')).strip())
        evid = sanitize_testo(str(n.get('evidenza', '')).strip())
        if not testo:
            continue
        nuovi_puliti.append({'testo': testo, 'evidenza': evid, 'data': oggi})

    # sweep di sicurezza (sanitizzazione) anche sui temi gia' esistenti
    temi_puliti_esistenti = []
    for t in temi_esistenti:
        if isinstance(t, dict):
            t2 = dict(t)
            t2['testo'] = sanitize_testo(str(t.get('testo', '')))
            if t.get('evidenza'):
                t2['evidenza'] = sanitize_testo(str(t.get('evidenza', '')))
            temi_puliti_esistenti.append(t2)
        else:
            temi_puliti_esistenti.append({'testo': sanitize_testo(str(t)), 'data': oggi})

    # merge + dedup (per testo normalizzato) + cap a MAX_TEMI, i nuovi in cima
    def norm(s):
        return re.sub(r'\W+', '', s.lower())[:60]

    visti = set()
    combinati = []
    for t in (nuovi_puliti + temi_puliti_esistenti):
        k = norm(t['testo'])
        if not k or k in visti:
            continue
        visti.add(k)
        combinati.append(t)
    combinati = combinati[:MAX_TEMI]

    if not nuovi_puliti:
        print('Nessun nuovo pattern distillato in questa run (lista vuota o solo doppioni).')

    memoria['temi_ricorrenti'] = combinati
    _salva_trace({'step': '6_pre_gh_put_finale', 'n_nuovi': len(nuovi_puliti), 'n_combinati': len(combinati)})

    ok = gh_put(
        'data/memoria_chat.json',
        json.dumps(memoria, ensure_ascii=False, indent=2),
        'memoria_lungo_termine: aggiorna temi_ricorrenti (' + oggi + ')')
    if ok is None:
        print('ERRORE: salvataggio memoria_chat.json fallito dopo 3 tentativi.')
        sys.exit(1)

    print(f'OK: temi_ricorrenti aggiornato, {len(combinati)} appunti permanenti totali '
          f'({len(nuovi_puliti)} nuovi in questa run).')


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        import traceback
        tb = traceback.format_exc()
        print('ECCEZIONE NON GESTITA:', tb)
        try:
            gh_put('data/_debug_memoria.json',
                   json.dumps({'errore': 'eccezione_non_gestita', 'traceback': tb}, ensure_ascii=False, indent=2),
                   'debug: eccezione non gestita')
        except Exception:
            pass
        sys.exit(1)
