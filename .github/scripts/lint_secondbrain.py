"""
lint_secondbrain.py — Health check di sola lettura per il Second Brain BioSerra.
Aggrega numeri già presenti in pdf_knowledge.json e pdf_graph.json in un report
di copertura/coerenza. Nessuna chiamata Mistral, nessun costo, sola aggregazione.
Output: data/brain_health.json + Step Summary.
"""
import os, json, base64, urllib.request, urllib.error, datetime, time

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

FINESTRA_CHARS = 4500  # deve restare coerente con analisi_pdf.py

def gh_get(path):
    """Resiliente: 3 tentativi, fallback raw per file >1MB."""
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

def gh_put(path, content, sha, msg):
    if isinstance(content, str):
        content = content.encode('utf-8')
    encoded = base64.b64encode(content).decode('ascii')
    for attempt in range(3):
        try:
            fresh = gh_get_sha(path) or sha
            body = {'message': msg, 'content': encoded, 'branch': 'main'}
            if fresh:
                body['sha'] = fresh
            req = urllib.request.Request(
                f'https://api.github.com/repos/{REPO}/contents/{path}',
                data=json.dumps(body).encode(),
                headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT')
            with urllib.request.urlopen(req) as r:
                return json.load(r)['commit']['sha']
        except Exception as ex:
            print(f'  gh_put {path} tentativo {attempt+1} fallito: {ex}')
            time.sleep(3)
    print(f'  ERRORE: gh_put {path} fallito dopo 3 tentativi')
    return None


STUB_PREFISSI = ('Documento BioSerra:', 'Manuale biblioteca BioSerra:')

def e_stub(voce):
    somm = voce.get('sommario', '') or ''
    return (not voce.get('mistral_analizzato', False)) or any(somm.startswith(p) for p in STUB_PREFISSI)


def analizza_knowledge(analisi):
    tot = len(analisi)
    v25 = [a for a in analisi if a.get('pipeline_ver') == 'v25_fulltext']
    non_migrate = tot - len(v25)
    stub = [a for a in analisi if e_stub(a)]

    finestre_vals = [a['finestre_analizzate'] for a in analisi if a.get('finestre_analizzate') is not None]
    finestre_stats = None
    if finestre_vals:
        finestre_stats = {
            'min': min(finestre_vals), 'max': max(finestre_vals),
            'media': round(sum(finestre_vals) / len(finestre_vals), 1)
        }

    # Documenti dove il testo estratto è molto più grande di quanto le finestre coprano
    # (candidati a "16 stub" tipo IL CORANO — cap 20 finestre insufficiente)
    sottocoperti = []
    for a in analisi:
        fin = a.get('finestre_analizzate')
        chars = a.get('testo_chars')
        if fin is not None and chars:
            copertura = fin * FINESTRA_CHARS
            if chars > copertura * 3:
                sottocoperti.append({
                    'id': a.get('id'), 'titolo': (a.get('titolo') or '')[:60],
                    'testo_chars': chars, 'finestre_analizzate': fin,
                    'pct_coperta': round(copertura / chars * 100, 1)
                })
    sottocoperti.sort(key=lambda x: x['pct_coperta'])

    lingua_vals = [a.get('lingua') for a in analisi if a.get('lingua')]
    lingua_breakdown = {}
    for l in lingua_vals:
        lingua_breakdown[l] = lingua_breakdown.get(l, 0) + 1

    # categoria_reale: popolato da classifica_testi.py, non presente su tutte le voci
    categoria_breakdown = {}
    senza_categoria = 0
    for a in analisi:
        cat = a.get('categoria_reale')
        if cat:
            categoria_breakdown[cat] = categoria_breakdown.get(cat, 0) + 1
        else:
            senza_categoria += 1

    # copertura v25_fulltext e stub incrociati per categoria (dove una categoria è sistematicamente indietro)
    per_categoria_stato = {}
    for a in analisi:
        cat = a.get('categoria_reale') or '(senza categoria)'
        d = per_categoria_stato.setdefault(cat, {'totale': 0, 'v25_fulltext': 0, 'stub': 0})
        d['totale'] += 1
        if a.get('pipeline_ver') == 'v25_fulltext':
            d['v25_fulltext'] += 1
        if e_stub(a):
            d['stub'] += 1

    chunk_prog = [a.get('chunk_progresso') for a in analisi if a.get('chunk_progresso')]
    chunk_anomali = []
    tot_tradotti = tot_chunk = 0
    for a in analisi:
        cp = a.get('chunk_progresso')
        if cp:
            tradotti = cp.get('tradotti', 0)
            totale = cp.get('totale', 0)
            tot_tradotti += tradotti
            tot_chunk += totale
            if totale and tradotti > totale:
                chunk_anomali.append({'id': a.get('id'), 'chunk_progresso': cp})

    return {
        'totale_voci': tot,
        'pipeline_v25_fulltext': len(v25),
        'non_ancora_riprocessate': non_migrate,
        'stub_count': len(stub),
        'stub_ids': [a.get('id') for a in stub][:30],
        'finestre_analizzate_stats': finestre_stats,
        'documenti_sottocoperti': sottocoperti[:20],
        'categoria_breakdown': categoria_breakdown,
        'categoria_senza_valore': senza_categoria,
        'per_categoria_stato': per_categoria_stato,
        'lingua_popolata': len(lingua_vals),
        'lingua_breakdown': lingua_breakdown,
        'chunk_progresso_doc_con_dato': len(chunk_prog),
        'chunk_progresso_totale_tradotti': tot_tradotti,
        'chunk_progresso_totale_chunk': tot_chunk,
        'chunk_progresso_anomalie': chunk_anomali[:20],
    }


def analizza_coerenza(analisi):
    ids = [a.get('id') for a in analisi]
    visti = {}
    duplicati = []
    for a in analisi:
        i = a.get('id')
        if i in visti:
            duplicati.append(i)
        else:
            visti[i] = True
    mancanti = [
        a.get('id') or '(senza id)'
        for a in analisi if not a.get('id') or not a.get('titolo')
    ]
    return {
        'id_duplicati': sorted(set(duplicati)),
        'voci_con_id_o_titolo_mancante': mancanti[:20],
    }


def analizza_grafo(grafo):
    nodi = grafo.get('nodi', [])
    edges = grafo.get('edges', [])
    nodi_ids = {n.get('id') for n in nodi}

    grado = {}
    dangling = []
    pesi = []
    tipo_conn_count = {}
    for e in edges:
        s, t = e.get('source'), e.get('target')
        grado[s] = grado.get(s, 0) + 1
        grado[t] = grado.get(t, 0) + 1
        if s not in nodi_ids or t not in nodi_ids:
            dangling.append({'source': s, 'target': t})
        if 'peso' in e:
            pesi.append(e['peso'])
        tc = e.get('tipo_conn', '(nessuno)')
        tipo_conn_count[tc] = tipo_conn_count.get(tc, 0) + 1

    isolati = [n['id'] for n in nodi if grado.get(n['id'], 0) == 0]
    peso_stats = None
    if pesi:
        peso_stats = {
            'min': min(pesi), 'max': max(pesi),
            'media': round(sum(pesi) / len(pesi), 3)
        }

    n_tot = len(nodi)
    coppie_possibili = n_tot * (n_tot - 1) // 2 if n_tot > 1 else 0
    coppie_fatte = len(edges)
    copertura_pct = round(coppie_fatte / coppie_possibili * 100, 1) if coppie_possibili else 0

    return {
        'nodi_totali': n_tot,
        'edges_totali': len(edges),
        'nodi_isolati': len(isolati),
        'nodi_isolati_ids': isolati[:30],
        'peso_stats': peso_stats,
        'tipo_conn_breakdown': tipo_conn_count,
        'edges_dangling': dangling[:20],
        'copertura_coppie_pct_stimata': copertura_pct,
    }


def main():
    print('=== Lint Second Brain ===')

    raw_knowledge, _ = gh_get('data/pdf_knowledge.json')
    knowledge = json.loads(raw_knowledge)
    analisi = knowledge.get('analisi', [])

    raw_grafo, _ = gh_get('data/pdf_graph.json')
    grafo = json.loads(raw_grafo)

    report_analisi = analizza_knowledge(analisi)
    report_coerenza = analizza_coerenza(analisi)
    report_grafo = analizza_grafo(grafo)

    oggi = datetime.datetime.utcnow().strftime('%Y-%m-%d')
    report = {
        'lastUpdate': datetime.datetime.utcnow().isoformat() + '+00:00',
        'analisi': report_analisi,
        'traduzione': {
            'lingua_popolata': report_analisi['lingua_popolata'],
            'lingua_breakdown': report_analisi['lingua_breakdown'],
            'chunk_progresso_doc_con_dato': report_analisi['chunk_progresso_doc_con_dato'],
            'chunk_progresso_totale_tradotti': report_analisi['chunk_progresso_totale_tradotti'],
            'chunk_progresso_totale_chunk': report_analisi['chunk_progresso_totale_chunk'],
        },
        'connessioni': report_grafo,
        'coerenza': report_coerenza,
    }

    sha = gh_get_sha('data/brain_health.json')
    gh_put('data/brain_health.json', json.dumps(report, indent=2, ensure_ascii=False),
           sha, f'brain_health: lint second brain [{oggi}]')

    print(f"Analisi: {report_analisi['pipeline_v25_fulltext']}/{report_analisi['totale_voci']} "
          f"v25_fulltext, {report_analisi['stub_count']} stub")
    print(f"Traduzione: {report_analisi['lingua_popolata']}/{report_analisi['totale_voci']} con lingua")
    print(f"Grafo: {report_grafo['nodi_totali']} nodi, {report_grafo['edges_totali']} edges, "
          f"{report_grafo['nodi_isolati']} isolati")
    if report_coerenza['id_duplicati']:
        print(f"ATTENZIONE: id duplicati trovati: {report_coerenza['id_duplicati']}")
    if report_grafo['edges_dangling']:
        print(f"ATTENZIONE: {len(report_grafo['edges_dangling'])} edge con riferimenti a nodi mancanti")

    summary_path = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary_path:
        try:
            with open(summary_path, 'a', encoding='utf-8') as f:
                f.write(f'## Lint Second Brain — {oggi}\n\n')
                f.write('### Analisi full-text\n')
                f.write(f"- Riprocessate v25: **{report_analisi['pipeline_v25_fulltext']}/{report_analisi['totale_voci']}**\n")
                f.write(f"- Ancora stub: **{report_analisi['stub_count']}**\n")
                if report_analisi['finestre_analizzate_stats']:
                    fs = report_analisi['finestre_analizzate_stats']
                    f.write(f"- Finestre analizzate: min {fs['min']}, max {fs['max']}, media {fs['media']}\n")
                if report_analisi['documenti_sottocoperti']:
                    f.write(f"- Documenti sospetti sotto-coperti (>3x oltre le finestre): "
                            f"**{len(report_analisi['documenti_sottocoperti'])}**\n")
                f.write('\n### Per categoria (categoria_reale)\n')
                if report_analisi['categoria_senza_valore']:
                    f.write(f"- Senza categoria assegnata: **{report_analisi['categoria_senza_valore']}**\n")
                for cat, stato in sorted(report_analisi['per_categoria_stato'].items(),
                                          key=lambda x: -x[1]['totale']):
                    f.write(f"- `{cat}`: {stato['totale']} voci, "
                            f"{stato['v25_fulltext']} v25_fulltext, {stato['stub']} stub\n")
                f.write('\n### Traduzione\n')
                f.write(f"- Lingua popolata: **{report_analisi['lingua_popolata']}/{report_analisi['totale_voci']}**\n")
                if report_analisi['chunk_progresso_totale_chunk']:
                    f.write(f"- Chunk tradotti: **{report_analisi['chunk_progresso_totale_tradotti']}/"
                            f"{report_analisi['chunk_progresso_totale_chunk']}**\n")
                f.write('\n### Connessioni\n')
                f.write(f"- Nodi: **{report_grafo['nodi_totali']}**, Edges: **{report_grafo['edges_totali']}**\n")
                f.write(f"- Isolati: **{report_grafo['nodi_isolati']}**\n")
                f.write(f"- Copertura coppie stimata: **{report_grafo['copertura_coppie_pct_stimata']}%**\n")
                f.write('\n### Coerenza dati\n')
                if report_coerenza['id_duplicati']:
                    f.write(f"- ⚠️ ID duplicati: **{report_coerenza['id_duplicati']}**\n")
                else:
                    f.write('- Nessun ID duplicato\n')
                if report_grafo['edges_dangling']:
                    f.write(f"- ⚠️ Edge con riferimenti a nodi mancanti: **{len(report_grafo['edges_dangling'])}**\n")
                else:
                    f.write('- Nessun edge dangling\n')
        except Exception as ex:
            print(f'  (step summary non scritto: {ex})')

    print('=== Lint completato ===')


if __name__ == '__main__':
    main()
