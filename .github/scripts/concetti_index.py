import os, json, base64, urllib.request, urllib.error, time, sys

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
MISTRAL_KEY = os.environ.get('MISTRAL_KEY', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

CATEGORIE_VALIDE = {'suolo','irrigazione','nutrizione','elettrocultura','biodinamica','fitosanitario','raccolta','altro'}
ELETTRO_KW = ['lakhovsky','spirale','rame','antenna','magnetiz','fe-cu','ferro-rame','ighina','elettromagn','galvanic','risonanz','oscillat']
SUOLO_KW = ['suolo','compost','humus','micoriz','fungh','microbi','ph suolo','biodiver','ammend','torba','perlite','lombrichi','argilla','silicati']
IRRIGAZIONE_KW = ['acqua','irrigaz','goccia','drip','ionizzata','struttur','umidita']
NUTRIZIONE_KW = ['nutriz','fertiliz','azoto','fosforo','potassio','organica','concime','aminoacid','alghe','guano']
BIODINAMICA_KW = ['luna','biodinam','steiner','cosm','calendario','planetar','preparati']
FITOSANITARIO_KW = ['parassit','malattia','insetti','difesa','trappol','neem','companion']
RACCOLTA_KW = ['raccolt','taglio','essiccaz','concia','maturaz','trichomi','flush']

def categorizza_auto(label, cat_orig):
    l = label.lower()
    if any(kw in l for kw in ELETTRO_KW): return 'elettrocultura'
    if any(kw in l for kw in RACCOLTA_KW): return 'raccolta'
    if any(kw in l for kw in FITOSANITARIO_KW): return 'fitosanitario'
    if any(kw in l for kw in BIODINAMICA_KW): return 'biodinamica'
    if any(kw in l for kw in NUTRIZIONE_KW): return 'nutrizione'
    if any(kw in l for kw in IRRIGAZIONE_KW): return 'irrigazione'
    if any(kw in l for kw in SUOLO_KW): return 'suolo'
    return cat_orig if cat_orig in CATEGORIE_VALIDE else 'altro'

def gh_api_get(path):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        data = json.load(r)
    # File >1MB: l'API restituisce content vuoto -> fallback raw URL (no-cache)
    if not data.get('content','').strip():
        raw_url = f'https://raw.githubusercontent.com/{REPO}/main/{path}'
        req2 = urllib.request.Request(raw_url, headers={
            'Authorization': f'token {GITHUB_TOKEN}', 'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req2) as r2:
            return r2.read().decode('utf-8'), data['sha']
    return base64.b64decode(data['content'].replace('\n','')).decode('utf-8'), data['sha']

def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)['sha']
    except Exception:
        return None

def gh_put(path, content, sha, message):
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
            with urllib.request.urlopen(req) as r:
                return json.load(r)
        except Exception as ex:
            print(f'  gh_put tentativo {attempt+1} fallito ({path}): {ex}')
            time.sleep(3)
    return None

def mistral_chat(prompt, max_tokens=3000):
    if not MISTRAL_KEY:
        raise Exception('MISTRAL_KEY mancante')
    body = json.dumps({
        'model': 'mistral-small-latest',
        'max_tokens': max_tokens,
        'temperature': 0.1,
        'messages': [{'role': 'user', 'content': prompt}]
    }).encode()
    req = urllib.request.Request(
        'https://api.mistral.ai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {MISTRAL_KEY}', 'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        resp = json.load(r)
    content = resp['choices'][0]['message']['content']
    tokens = resp.get('usage', {}).get('total_tokens', 0)
    print(f'  Mistral OK: {len(content)} chars, {tokens} tokens')
    return content

def parse_concetti_json(risposta):
    """Estrae lista concetti da risposta Mistral in modo robusto"""
    # Prova parsing diretto
    s = risposta.find('[')
    e = risposta.rfind(']')
    # Prima cerca {"concetti":[...]}
    s2 = risposta.find('{"concetti"')
    if s2 >= 0:
        e2 = risposta.rfind('}')
        if e2 > s2:
            try:
                parsed = json.loads(risposta[s2:e2+1])
                return parsed.get('concetti', [])
            except: pass
    # Poi prova array diretto [...]
    if s >= 0 and e > s:
        try:
            return json.loads(risposta[s:e+1])
        except: pass
    return []

def concetti_dai_pdf(lista_tec):
    """Chiamata 1: concetti dalle tecniche dei PDF"""
    prompt = (
        'Agronomo esperto Living Soil. '
        'Queste tecniche sono estratte da 89 PDF di elettrocultura e biofisica applicata alle piante. '
        'Raggruppa le varianti identiche e crea 8-10 concetti distinti.\n\n'
        'Tecniche (con frequenza):\n' + lista_tec + '\n\n'
        'Per ogni concetto:\n'
        '- id: slug minuscolo con underscore (es: spirale_rame)\n'
        '- label: nome chiaro italiano (es: Spirale in Rame)\n'
        '- categoria: usa "elettrocultura" per tecniche EM/frequenza/metalli, "irrigazione" per acqua\n'
        '- descrizione: 1 frase pratica applicabile in serra\n'
        '- istruzioni_pratiche: array di 3 azioni concrete\n'
        '- varianti: array con i nomi alternativi raggruppati\n'
        '- fasi_guida: array con valori da [germinazione,vegetazione,fioritura,taglio,essiccazione,concia]\n'
        '- rilevanza: numero 1-100\n'
        '- tag_correlati: array di 2-3 tag\n\n'
        'Rispondi SOLO con JSON array, nessun testo:\n'
        '[{"id":"slug","label":"Nome","categoria":"elettrocultura","descrizione":"frase","istruzioni_pratiche":["a","b","c"],"varianti":["v1"],"fasi_guida":["vegetazione"],"rilevanza":90,"tag_correlati":["t1"]}]'
    )
    risposta = mistral_chat(prompt, max_tokens=2500)
    print(f'  Risposta PDF (300 chars): {risposta[:300]}')
    return parse_concetti_json(risposta)

def concetti_living_soil():
    """Chiamata 2: concetti pratici Living Soil outdoor"""
    prompt = (
        'Agronomo esperto di coltivazione Living Soil outdoor in Italia. '
        'Crea 20-22 concetti pratici per una serra outdoor Living Soil, '
        'coperti da queste categorie:\n'
        '- suolo (6-7 concetti): gestione suolo vivente, compostaggio, micorrize, ph, pacciamatura, humus, lombrichi\n'
        '- irrigazione (3): gestione irrigazione, acqua strutturata, umidita ambiente\n'
        '- nutrizione (3-4): fertilizzazione organica, te di compost, farine di rocce, alghe marine\n'
        '- fitosanitario (2-3): controllo parassiti naturale, olio neem, piante companion\n'
        '- raccolta (2-3): timing raccolta, essiccazione corretta, cura trichomi\n'
        '- biodinamica (2-3): calendario lunare, preparati biodinamici, giorni radice/fiore\n\n'
        'Per ogni concetto:\n'
        '- id: slug minuscolo con underscore\n'
        '- label: nome pratico italiano\n'
        '- categoria: uno tra suolo|irrigazione|nutrizione|fitosanitario|raccolta|biodinamica\n'
        '- descrizione: 1 frase concreta applicabile in serra outdoor\n'
        '- istruzioni_pratiche: array 3 azioni pratiche\n'
        '- varianti: array con 1-2 nomi alternativi\n'
        '- fasi_guida: array con valori da [germinazione,vegetazione,fioritura,taglio,essiccazione,concia]\n'
        '- rilevanza: numero 1-100\n'
        '- tag_correlati: array 2-3 tag\n\n'
        'Rispondi SOLO con JSON array, nessun testo:\n'
        '[{"id":"slug","label":"Nome","categoria":"suolo","descrizione":"frase","istruzioni_pratiche":["a","b","c"],"varianti":["v1"],"fasi_guida":["vegetazione"],"rilevanza":85,"tag_correlati":["t1"]}]'
    )
    risposta = mistral_chat(prompt, max_tokens=4000)
    print(f'  Risposta Living Soil (300 chars): {risposta[:300]}')
    return parse_concetti_json(risposta)

def main():
    oggi = __import__('datetime').date.today().isoformat()
    print('=== BioSerra Concetti Index v9 (Mistral 2-step) ===')
    print(f'MISTRAL_KEY: {"presente" if MISTRAL_KEY else "ASSENTE"}')

    print('\nLeggo pdf_knowledge.json...')
    raw, _ = gh_api_get('data/pdf_knowledge.json')
    knowledge = json.loads(raw)
    analisi = knowledge.get('analisi', [])
    print(f'PDF: {len(analisi)}')

    # Estrai tecniche
    SKIP = ['harina de roca', 'non specificat', 'non disponib', 'nessuna tecn', 'nessun']
    tecniche_agg = {}
    for a in analisi:
        pid = a.get('id', '')
        for t in a.get('tecniche_chiave', []):
            t_clean = t.strip()
            if len(t_clean) < 5: continue
            if any(s in t_clean.lower() for s in SKIP): continue
            t_norm = t_clean.lower()
            if t_norm not in tecniche_agg:
                tecniche_agg[t_norm] = {'label': t_clean, 'count': 0, 'pdf_ids': [], 'consigli': []}
            tecniche_agg[t_norm]['count'] += 1
            tecniche_agg[t_norm]['pdf_ids'].append(pid)
            c = a.get('consiglio_coltivazione', '')
            if c and len(tecniche_agg[t_norm]['consigli']) < 2:
                tecniche_agg[t_norm]['consigli'].append(c[:100])

    # Dedup: prendi top 20 con almeno 2 occorrenze (salta varianti minori)
    top_dedup = []
    seen_p = set()
    for t_norm, td in sorted(tecniche_agg.items(), key=lambda x: -x[1]['count']):
        if td['count'] < 2: break
        words = t_norm.split()
        prefix = words[0][:7] + (words[1][:4] if len(words) > 1 else '')
        if prefix not in seen_p:
            top_dedup.append((t_norm, td))
            seen_p.add(prefix)
        if len(top_dedup) >= 20: break

    lista_tec = '\n'.join([f'- {td["label"]} ({td["count"]}x)' for _, td in top_dedup])
    print(f'Tecniche uniche (>1 occ, dedup): {len(top_dedup)}')

    concetti_pdf = []
    concetti_ls = []

    if MISTRAL_KEY:
        # Chiamata 1: tecniche dai PDF
        print('\n--- Chiamata 1: Concetti dai PDF ---')
        try:
            concetti_pdf = concetti_dai_pdf(lista_tec)
            print(f'  Concetti PDF: {len(concetti_pdf)}')
        except Exception as ex:
            print(f'  Errore chiamata 1: {ex}')

        # Pausa tra chiamate
        time.sleep(3)

        # Chiamata 2: Living Soil pratiche
        print('\n--- Chiamata 2: Living Soil pratiche ---')
        try:
            concetti_ls = concetti_living_soil()
            print(f'  Concetti Living Soil: {len(concetti_ls)}')
        except Exception as ex:
            print(f'  Errore chiamata 2: {ex}')

    # Fallback se una delle due chiamate ha fallito
    if not concetti_pdf:
        print('Fallback PDF: uso concetti hardcoded elettrocultura')
        concetti_pdf = [
            {'id': 'acqua_magnetizzata', 'label': 'Acqua Magnetizzata', 'categoria': 'irrigazione',
             'descrizione': 'Trattamento acqua con magneti per migliorare assorbimento radicale.',
             'istruzioni_pratiche': ['Posiziona magneti sul tubo di alimentazione', 'Usa acqua trattata per irrigazioni', 'Monitora crescita radicale'], 'varianti': ['acqua strutturata', 'acqua polarizzata'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 95, 'tag_correlati': ['elettrocultura', 'irrigazione']},
            {'id': 'spirale_rame', 'label': 'Spirale in Rame', 'categoria': 'elettrocultura',
             'descrizione': 'Spirale in rame per armonizzazione campi elettromagnetici nella zona radice.',
             'istruzioni_pratiche': ['Inserisci spirale nel substrato vicino alle radici', 'Orienta in senso antiorario', 'Pulisci periodicamente con acqua acidula'], 'varianti': ['spirale di rame', 'spirale rame'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 92, 'tag_correlati': ['elettrocultura', 'rame']},
            {'id': 'circuito_lakhovsky', 'label': 'Circuito di Lakhovsky', 'categoria': 'elettrocultura',
             'descrizione': 'Oscillatore multicellulare per stimolazione risonanza cellulare delle piante.',
             'istruzioni_pratiche': ['Installa l\'anello Lakhovsky attorno alla pianta', 'Assicura buon contatto col suolo', 'Verifica assenza interferenze metalliche vicine'], 'varianti': ['oscillatore Lakhovsky', 'MWO'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 90, 'tag_correlati': ['elettrocultura', 'risonanza']},
            {'id': 'elettrodi_fe_cu', 'label': 'Elettrodi Fe-Cu', 'categoria': 'elettrocultura',
             'descrizione': 'Coppia ferro-rame nel suolo per stimolazione bioelettrochimica radicale.',
             'istruzioni_pratiche': ['Inserisci elettrodi a 10-15cm dalla base', 'Mantieni distanza 20cm tra Fe e Cu', 'Rinnova ogni ciclo vegetativo'], 'varianti': ['pila galvanica Fe-Cu', 'ferro-rame'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 88, 'tag_correlati': ['elettrocultura', 'galvanica']},
            {'id': 'antenna_terra', 'label': 'Antenna di Terra', 'categoria': 'elettrocultura',
             'descrizione': 'Connessione a terra per captare energie telluriche e migliorare il campo bioelettrico.',
             'istruzioni_pratiche': ['Inserisci antenna in rame a 30cm di profondita', 'Orienta verticalmente al nord', 'Collega a spirale rame se presente'], 'varianti': ['antenna terra', 'connessione geobiologica'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 85, 'tag_correlati': ['elettrocultura', 'geobiologia']},
        ]

    if not concetti_ls:
        print('Fallback Living Soil: uso concetti base')
        concetti_ls = [
            {'id': 'gestione_suolo_vivente', 'label': 'Suolo Vivente', 'categoria': 'suolo', 'descrizione': 'Mantenimento microbioma del suolo attivo.', 'istruzioni_pratiche': ['Aggiungi compost maturo ogni 2 settimane', 'Evita prodotti chimici', 'Mantieni umidita costante'], 'varianti': ['living soil', 'suolo biologico'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 95, 'tag_correlati': ['suolo', 'living-soil']},
            {'id': 'compostaggio_organico', 'label': 'Compostaggio Organico', 'categoria': 'suolo', 'descrizione': 'Produzione compost di qualita per ammendare il substrato.', 'istruzioni_pratiche': ['Bilancia materiali verdi e marroni', 'Tieni temperatura 55-65C', 'Rivolta ogni 2-3 giorni'], 'varianti': ['compost'], 'fasi_guida': ['germinazione', 'vegetazione'], 'rilevanza': 88, 'tag_correlati': ['suolo', 'nutrizione']},
            {'id': 'inoculazione_micorrize', 'label': 'Inoculazione Micorrize', 'categoria': 'suolo', 'descrizione': 'Introduzione funghi micorrizici per simbiosi radicale.', 'istruzioni_pratiche': ['Applica inoculo alla radice al trapianto', 'Usa 5-10g per pianta', 'Evita fungicidi nei 30 giorni successivi'], 'varianti': ['micorrize', 'funghi radicali'], 'fasi_guida': ['germinazione', 'vegetazione'], 'rilevanza': 92, 'tag_correlati': ['suolo', 'micorrize']},
            {'id': 'fertilizzazione_organica', 'label': 'Fertilizzazione Organica', 'categoria': 'nutrizione', 'descrizione': 'Apporto nutrienti tramite ammendanti organici naturali.', 'istruzioni_pratiche': ['Usa farine organiche (sangue, osso, pesce)', 'Applica in dose ridotta ogni 2 settimane', 'Monitora colore foglie'], 'varianti': ['nutrizione organica', 'concimazione biologica'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 85, 'tag_correlati': ['nutrizione', 'organico']},
            {'id': 'te_di_compost', 'label': 'Te di Compost', 'categoria': 'nutrizione', 'descrizione': 'Infuso aerobico di compost per applicazione fogliare o radicale.', 'istruzioni_pratiche': ['Immergi compost in acqua per 24h con aeratore', 'Aggiungi melassa come cibo per batteri', 'Applica entro 4 ore dalla preparazione'], 'varianti': ['compost tea', 'infuso microbico'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 88, 'tag_correlati': ['nutrizione', 'microbi']},
            {'id': 'farine_di_rocce', 'label': 'Farine di Rocce', 'categoria': 'nutrizione', 'descrizione': 'Minerali in polvere per rimineralizzazione lenta del substrato.', 'istruzioni_pratiche': ['Mischia 2-3% nel substrato', 'Usa basalto o silicio verde', 'Rinnova ogni ciclo'], 'varianti': ['silice in polvere', 'polvere di roccia'], 'fasi_guida': ['germinazione', 'vegetazione'], 'rilevanza': 80, 'tag_correlati': ['nutrizione', 'minerali']},
            {'id': 'calendario_lunare', 'label': 'Calendario Lunare', 'categoria': 'biodinamica', 'descrizione': 'Pianificazione operazioni colturali secondo ciclo lunare.', 'istruzioni_pratiche': ['Trapianta nei giorni Radice', 'Annaffia e fertilizza nei giorni Frutto/Fiore', 'Evita operazioni nei giorni sfavorevoli'], 'varianti': ['giorni lunari', 'biodinamica lunare'], 'fasi_guida': ['germinazione', 'vegetazione', 'fioritura'], 'rilevanza': 75, 'tag_correlati': ['biodinamica', 'luna']},
            {'id': 'controllo_parassiti', 'label': 'Controllo Parassiti Naturale', 'categoria': 'fitosanitario', 'descrizione': 'Gestione biologica di infestazioni con metodi naturali.', 'istruzioni_pratiche': ['Ispeziona quotidianamente foglie e steli', 'Applica olio di neem preventivo ogni 7 giorni', 'Usa insetti utili (acari predatori)'], 'varianti': ['difesa biologica', 'pest management'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 82, 'tag_correlati': ['fitosanitario', 'biologico']},
            {'id': 'essiccazione_corretta', 'label': 'Essiccazione Corretta', 'categoria': 'raccolta', 'descrizione': 'Processo di asciugatura lenta per preservare qualita.', 'istruzioni_pratiche': ['Mantieni 60-70% umidita e 18-22C', 'Essicca in buio totale', 'Testa dopo 10-14 giorni con crack test'], 'varianti': ['curing', 'asciugatura'], 'fasi_guida': ['essiccazione'], 'rilevanza': 80, 'tag_correlati': ['raccolta', 'qualita']},
            {'id': 'gestione_ph_suolo', 'label': 'Gestione pH Suolo', 'categoria': 'suolo', 'descrizione': 'Mantenimento pH ottimale 6.0-7.0 per biodisponibilita nutrienti.', 'istruzioni_pratiche': ['Misura pH ogni settimana', 'Correggi con calce se sotto 5.8', 'Correggi con zolfo se sopra 7.2'], 'varianti': ['ph substrato', 'acidita suolo'], 'fasi_guida': ['vegetazione', 'fioritura'], 'rilevanza': 85, 'tag_correlati': ['suolo', 'nutrizione']},
        ]

    # Unisci e normalizza
    tutti = concetti_pdf + concetti_ls
    used_ids = set()
    concetti_finali = []
    for i, c in enumerate(tutti):
        raw_id = c.get('id', f'concetto_{i}')
        base_id = ''.join(ch if ch.isalnum() else '_' for ch in raw_id.lower())[:28].strip('_')
        uid = base_id if base_id not in used_ids else f'{base_id}_{i}'
        used_ids.add(uid)
        c['id'] = uid
        c['categoria'] = categorizza_auto(c.get('label', ''), c.get('categoria', 'altro'))
        fasi_valide = {'germinazione', 'vegetazione', 'fioritura', 'taglio', 'essiccazione', 'concia'}
        c['fasi_guida'] = [f for f in c.get('fasi_guida', []) if f in fasi_valide] or ['vegetazione']
        if not c.get('pdf_ids'):
            words = [w for w in c.get('label', '').lower().split() if len(w) > 3]
            pdf_ids = []
            for t_norm, tdata in tecniche_agg.items():
                if any(w in t_norm for w in words):
                    pdf_ids.extend(tdata['pdf_ids'])
            c['pdf_ids'] = list(dict.fromkeys(pdf_ids))[:10]
        c['pdf_count'] = len(c.get('pdf_ids', []))
        concetti_finali.append(c)

    # Grafo
    nodi = [{'id': c['id'], 'label': c['label'], 'categoria': c.get('categoria', 'altro')} for c in concetti_finali]
    edges = []
    for i, a in enumerate(concetti_finali):
        for j, b in enumerate(concetti_finali):
            if j <= i: continue
            peso = len(set(a.get('tag_correlati', [])) & set(b.get('tag_correlati', []))) * 2
            if a.get('categoria') == b.get('categoria'): peso += 1
            if peso >= 1:
                edges.append({'source': a['id'], 'target': b['id'], 'peso': peso})

    out = {
        'lastUpdate': oggi,
        'total': len(concetti_finali),
        'fonte': f'{len(analisi)} PDF analizzati',
        'concetti': concetti_finali,
        'grafo': {'nodi': nodi, 'edges': edges}
    }

    content_json = json.dumps(out, indent=2, ensure_ascii=False)
    sha = gh_get_sha('data/concetti_index.json')
    res = gh_put('data/concetti_index.json', content_json, sha,
           f'BioSerra concetti {oggi} ({len(concetti_finali)} concetti) [Mistral v9 2-step]')
    if res is None:
        print('  ERRORE CRITICO: salvataggio concetti_index.json fallito dopo 3 tentativi')
        sys.exit(1)

    print(f'\n=== COMPLETATO: {len(concetti_finali)} concetti, {len(edges)} edges ===')
    cat_count = {}
    for c in concetti_finali:
        cat = c.get('categoria', 'altro')
        cat_count[cat] = cat_count.get(cat, 0) + 1
    for cat, cnt in sorted(cat_count.items(), key=lambda x: -x[1]):
        print(f'  {cat}: {cnt}')

if __name__ == '__main__':
    main()
