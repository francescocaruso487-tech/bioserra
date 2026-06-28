import os, json, base64, urllib.request, urllib.error, time, datetime

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
MISTRAL_KEY  = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

def gh_get(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def gh_get_sha(path):
    try:
        return gh_get(path)['sha']
    except Exception:
        return None

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

def gh_raw(path):
    url = f'https://raw.githubusercontent.com/{REPO}/main/{path}'
    req = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req) as r:
        return r.read().decode('utf-8')

def mistral_chat(prompt, max_tokens=800):
    if not MISTRAL_KEY:
        return None
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': max_tokens,
        'temperature': 0.2,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    try:
        req = urllib.request.Request(
            'https://api.mistral.ai/v1/chat/completions',
            data=body,
            headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
            method='POST')
        with urllib.request.urlopen(req, timeout=45) as r:
            resp = json.loads(r.read())
        return resp['choices'][0]['message']['content'].strip()
    except Exception as ex:
        print(f'  Mistral: {ex}')
        return None

def carica_dati():
    """Carica tutti i JSON necessari via raw URL."""
    dati = {}
    try:
        dati['pdf'] = json.loads(gh_raw('data/pdf_knowledge.json'))
        print(f"  pdf_knowledge: {len(dati['pdf'].get('analisi',[]))} PDF")
    except Exception as e:
        print(f'  pdf_knowledge ERR: {e}')
        dati['pdf'] = {'analisi': []}
    try:
        dati['concetti'] = json.loads(gh_raw('data/concetti_index.json'))
        print(f"  concetti_index: {len(dati['concetti'].get('concetti',[]))} concetti")
    except Exception as e:
        print(f'  concetti_index ERR: {e}')
        dati['concetti'] = {'concetti': []}
    try:
        dati['brain'] = json.loads(gh_raw('data/brain.json'))
        print('  brain.json: OK')
    except Exception as e:
        print(f'  brain ERR: {e}')
        dati['brain'] = {}
    try:
        dati['guide'] = json.loads(gh_raw('data/guide_complete.json'))
        print(f"  guide: {len(dati['guide'].get('guide',[]))} guide")
    except Exception as e:
        print(f'  guide ERR: {e}')
        dati['guide'] = {'guide': []}
    return dati

def genera_pagina_concetto(concetto, analisi_pdf, guide):
    """Genera pagina wiki markdown per un concetto usando Mistral."""
    cid    = concetto.get('id', '')
    label  = concetto.get('label', cid)
    cat    = concetto.get('categoria', '')
    desc   = concetto.get('descrizione', '')
    istr   = concetto.get('istruzioni_pratiche', [])
    varianti = concetto.get('varianti', [])
    fasi   = concetto.get('fasi_guida', [])
    tags   = concetto.get('tag_correlati', [])
    pdf_ids = concetto.get('pdf_ids', [])

    # PDF collegati a questo concetto
    pdf_collegati = [a for a in analisi_pdf if a.get('id') in pdf_ids or
                     any(t.lower() in a.get('sommario','').lower() or
                         t.lower() in ' '.join(a.get('tecniche_chiave',[])).lower()
                         for t in [label] + varianti)][:6]

    # Guide rilevanti
    guide_rel = [g for g in guide if
                 any(f.lower() in (g.get('fase','') + g.get('titolo','')).lower() for f in fasi + [label])][:2]

    # Contesto per Mistral
    ctx_pdf = ''
    for a in pdf_collegati[:4]:
        ctx_pdf += f"- [{a['id']}] {a.get('titolo','')}:\n"
        ctx_pdf += f"  Sommario: {a.get('sommario','')[:200]}\n"
        if a.get('estratto_chiave'):
            ctx_pdf += f"  Estratto: {a.get('estratto_chiave','')[:180]}\n"
        if a.get('consiglio_elettrocultura'):
            ctx_pdf += f"  Elettrocultura: {a.get('consiglio_elettrocultura','')[:150]}\n"

    ctx_istr = '\n'.join(f'- {i}' for i in istr[:5])

    prompt = f"""Sei un agronomo esperto Living Soil ed elettrocultura per serra outdoor italiana (Caserta, 41N).
Scrivi una pagina wiki markdown per il concetto: **{label}** (categoria: {cat}).

Descrizione base: {desc}
Istruzioni pratiche disponibili:
{ctx_istr if ctx_istr else '(nessuna)'}
Varianti/sinonimi: {', '.join(varianti) if varianti else 'nessuna'}
Fasi coltivazione rilevanti: {', '.join(fasi) if fasi else 'tutte'}

PDF della knowledge base che trattano questo concetto:
{ctx_pdf if ctx_pdf else '(nessun PDF specifico indicizzato)'}

Scrivi la pagina wiki in markdown con ESATTAMENTE queste sezioni:
## Descrizione
(2-3 paragrafi approfonditi sul concetto, meccanismo d'azione, perche funziona)

## Come si applica in serra
(istruzioni concrete passo-passo per la serra outdoor Living Soil a Caserta)

## Sinergie con altri elementi
(come si combina con altre tecniche: Lakhovsky, Fe-Cu, acqua magnetizzata, suolo vivente, luna)

## Errori comuni da evitare
(lista puntata, max 4 errori)

## Note dai PDF BioSerra
(citazioni o riferimenti concreti dai PDF elencati sopra, con [id])

## Connessioni wiki
(lista di altri concetti correlati, formato: [[id_concetto]])

Rispondi SOLO con il markdown, niente testo fuori."""

    testo = mistral_chat(prompt, max_tokens=900)

    if not testo:
        # Fallback: pagina strutturata da dati locali
        testo = f"""## Descrizione
{desc}

{'**Varianti:** ' + ', '.join(varianti) if varianti else ''}

## Come si applica in serra
{chr(10).join('- ' + i for i in istr) if istr else '- Consultare i PDF della knowledge base per istruzioni dettagliate.'}

## Sinergie con altri elementi
- Combinare con le altre tecniche elettrocultura attive nella serra
- Applicare in fase {', '.join(fasi) if fasi else 'vegetativa e di fioritura'}

## Errori comuni da evitare
- Applicare senza conoscere il meccanismo d'azione
- Ignorare le condizioni del suolo vivente

## Note dai PDF BioSerra
{chr(10).join('- [' + a.get('id','') + '] ' + a.get('titolo','')[:60] for a in pdf_collegati) if pdf_collegati else '- Nessun PDF specifico indicizzato ancora.'}

## Connessioni wiki
{chr(10).join('[[' + t + ']]' for t in tags) if tags else ''}"""

    return testo

def genera_overview(dati):
    """Genera pagina overview sintesi Living Soil BioSerra."""
    concetti = dati['concetti'].get('concetti', [])
    analisi  = dati['pdf'].get('analisi', [])
    brain    = dati['brain']
    cerv     = brain.get('cervello', brain)
    consigli = cerv.get('consigli_giorno', brain.get('consigli_giorno', []))

    categorie = {}
    for c in concetti:
        cat = c.get('categoria', 'altro')
        categorie.setdefault(cat, []).append(c.get('label', c.get('id','')))

    top_pdf = sorted(analisi, key=lambda a: len(a.get('connessioni',[])), reverse=True)[:8]

    prompt = f"""Sei il cervello principale di BioSerra, una serra Living Soil outdoor a Caserta (41N).
La serra usa: suolo vivente water-only, biodinamica, elettrocultura (Lakhovsky, Fe-Cu, acqua magnetizzata, spirale rame, antenna terra).
Hai {len(analisi)} manuali analizzati e {len(concetti)} concetti attivi.

Categorie attive:
{chr(10).join(f'- {cat}: {", ".join(lst)}' for cat, lst in categorie.items())}

PDF piu connessi nella knowledge base:
{chr(10).join(f'- [{a.get("id","")}] {a.get("titolo","")[:60]}: {a.get("sommario","")[:150]}' for a in top_pdf)}

Consigli AI correnti:
{chr(10).join(f'- {c}' for c in consigli[:3])}

Scrivi la pagina overview markdown del wiki BioSerra con queste sezioni:
## Filosofia BioSerra
(Living Soil, water-only, biodinamica, elettrocultura - visione integrata)

## Sistema di conoscenza
(come i {len(analisi)} PDF, {len(concetti)} concetti e le guide si integrano)

## Tecniche elettrocultura attive
(panoramica delle 5 tecniche principali con rimando alle pagine wiki)

## Principi Living Soil
(microbioma, minerali, biostimolanti, acqua)

## Calendario e ritmi
(luna, stagioni, fasi coltivazione a Caserta 41N)

## Come usare questo wiki
(breve guida: concetti collegati con [[id]], PDF citati con [id])

Rispondi SOLO con il markdown."""

    testo = mistral_chat(prompt, max_tokens=1000)

    if not testo:
        cat_str = '\n'.join(f'- **{cat}**: {", ".join(lst)}' for cat, lst in categorie.items())
        testo = f"""## Filosofia BioSerra
Serra Living Soil outdoor a Caserta (41N). Sistema water-only, suolo vivente, biodinamica (Steiner/Thun/Masson), elettrocultura avanzata.

## Sistema di conoscenza
{len(analisi)} PDF analizzati, {len(concetti)} concetti estratti, guide per fase aggiornate settimanalmente.

## Tecniche elettrocultura attive
- [[circuito_lakhovsky]] — circuito oscillante a onde multiple
- [[sinergia_ferro_rame]] — pile galvanica Fe-Cu
- [[acqua_magnetizzata]] — magnetizzazione acqua irrigazione
- [[spirale_rame]] — spirale cosmica rame
- [[antenna_terra]] — antenna terrestre

## Categorie knowledge base
{cat_str}

## Come usare questo wiki
Ogni concetto ha la sua pagina in `concetti/[id].md`. PDF citati come [pdf_N]. Concetti collegati come [[id_concetto]]."""

    return testo

def genera_index(concetti, oggi):
    """Genera index.md master del wiki."""
    cat_gruppi = {}
    for c in concetti:
        cat = c.get('categoria', 'altro')
        cat_gruppi.setdefault(cat, []).append(c)

    righe = [
        f'# BioSerra Wiki — Indice',
        f'',
        f'> Aggiornato: {oggi} | {len(concetti)} concetti | Knowledge base Living Soil + Elettrocultura',
        f'',
        f'## Panoramica',
        f'- [Overview generale](sintesi/overview.md)',
        f'',
    ]
    for cat, lst in cat_gruppi.items():
        righe.append(f'## {cat.capitalize()}')
        for c in lst:
            pdf_note = f' *(in {c.get("pdf_count",0)} PDF)*' if c.get('pdf_count',0) > 0 else ''
            righe.append(f'- [{c.get("label", c.get("id",""))}](concetti/{c.get("id","")}.md){pdf_note} — {c.get("descrizione","")[:80]}')
        righe.append('')

    righe += [
        '## Log aggiornamenti',
        '- [log.md](log.md)',
        '',
        '---',
        f'*Wiki generato automaticamente da GitHub Actions — BioSerra v3*'
    ]
    return '\n'.join(righe)

def main():
    oggi = datetime.date.today().isoformat()
    ora  = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    print(f'=== BioSerra Wiki Update — {oggi} ===')

    dati = carica_dati()
    concetti  = dati['concetti'].get('concetti', [])
    analisi   = dati['pdf'].get('analisi', [])
    guide     = dati['guide'].get('guide', [])

    aggiornati = []
    errori     = []

    # 1. Pagine concetti (una per concetto)
    print(f'\n--- Generazione pagine concetti ({len(concetti)}) ---')
    for i, concetto in enumerate(concetti):
        cid = concetto.get('id', f'concetto_{i}')
        path = f'data/wiki/concetti/{cid}.md'
        print(f'[{i+1}/{len(concetti)}] {cid}')
        try:
            testo = genera_pagina_concetto(concetto, analisi, guide)
            header = f'---\nid: {cid}\nlabel: {concetto.get("label","")}\ncategoria: {concetto.get("categoria","")}\naggiornato: {oggi}\npdf_count: {concetto.get("pdf_count",0)}\n---\n\n# {concetto.get("label", cid)}\n\n'
            pagina = header + testo
            sha = gh_get_sha(path)
            gh_put(path, pagina, sha, f'wiki: aggiorna {cid} [{oggi}]')
            aggiornati.append(cid)
            print(f'  OK ({len(pagina)} chars)')
        except Exception as ex:
            print(f'  ERR: {ex}')
            errori.append(cid)
        time.sleep(2)

    # 2. Overview sintetica
    print('\n--- Overview ---')
    try:
        testo_ov = genera_overview(dati)
        header_ov = f'---\ntipo: overview\naggiornato: {oggi}\n---\n\n# BioSerra — Knowledge Base Overview\n\n'
        sha_ov = gh_get_sha('data/wiki/sintesi/overview.md')
        gh_put('data/wiki/sintesi/overview.md', header_ov + testo_ov, sha_ov, f'wiki: overview [{oggi}]')
        aggiornati.append('overview')
        print('  OK')
    except Exception as ex:
        print(f'  ERR overview: {ex}')
        errori.append('overview')

    # 3. Index master
    print('\n--- Index ---')
    try:
        index_md = genera_index(concetti, oggi)
        sha_idx = gh_get_sha('data/wiki/index.md')
        gh_put('data/wiki/index.md', index_md, sha_idx, f'wiki: index [{oggi}]')
        print('  OK')
    except Exception as ex:
        print(f'  ERR index: {ex}')

    # 4. Log append
    print('\n--- Log ---')
    try:
        try:
            log_esistente = gh_raw('data/wiki/log.md')
        except Exception:
            log_esistente = '# BioSerra Wiki — Log\n\n'
        nuova_entry = (
            f'## [{ora}] aggiornamento\n'
            f'- Pagine aggiornate: {len(aggiornati)}\n'
            f'- Errori: {len(errori)} ({", ".join(errori) if errori else "nessuno"})\n'
            f'- PDF nella knowledge base: {len(analisi)}\n'
            f'- Concetti: {len(concetti)}\n\n'
        )
        # Mantieni ultimi 30 aggiornamenti (max ~100KB)
        righe = log_esistente.split('\n## [')
        if len(righe) > 31:
            righe = righe[:31]
            log_esistente = righe[0] + '\n## [' + '\n## ['.join(righe[1:])
        log_nuovo = log_esistente.rstrip() + '\n\n' + nuova_entry
        sha_log = gh_get_sha('data/wiki/log.md')
        gh_put('data/wiki/log.md', log_nuovo, sha_log, f'wiki: log [{oggi}]')
        print('  OK')
    except Exception as ex:
        print(f'  ERR log: {ex}')

    print(f'\n=== DONE: {len(aggiornati)} aggiornati, {len(errori)} errori ===')

if __name__ == '__main__':
    main()
