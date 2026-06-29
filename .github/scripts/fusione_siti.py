"""
fusione_siti.py — Fonde articoli Zamnesia + RQS per categoria tematica
Salva i testi unificati in data/testi/fusi/[categoria].txt
Aggiunge voci in pdf_knowledge.json (categoria_reale = fusa_[cat])
Da eseguire ogni domenica dopo scraping_siti.py
"""
import os, json, base64, urllib.request, urllib.error
import datetime, re, time

GITHUB_TOKEN = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
REPO = 'francescocaruso487-tech/bioserra'
RAW  = f'https://raw.githubusercontent.com/{REPO}/main/'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

# ── Mappa categoria → articoli per sito ──────────────────────────────────────

CATEGORIE_FUSE = {

    'germinazione': {
        'zamnesia': [
            '284-germinare-semi-con-lo-smart-start',
            '286-come-risolvere-problemi-di-germinazione-di-cannabis',
        ],
        'rqs': [
            '45-la-germinazione',
            'blog-guida-alla-risoluzione-di-problemi-durante-il-periodo-di-germinazione-delle',
            'blog-il-trattamento-dei-germogli--n33',
        ]
    },

    'plantula': {
        'zamnesia': [
            '287-fase-plantula-cannabis',
        ],
        'rqs': [
            'blog-come-comportarsi-con-le-plantule-di-cannabis-alte-ed-esili-n777',
            'blog-come-e-quando-trapiantare-la-cannabis-n350',
            'blog-come-e-quando-trapiantare-le-piantine-di-cannabis-n910',
        ]
    },

    'vegetativa': {
        'zamnesia': [
            '288-fase-vegetativa-cannabis',
        ],
        'rqs': [
            '43-la-crescita-o-fase-vegetativa',
            'blog-quando-passare-la-cannabis-dalla-fase-vegetativa-a-quella-di-fioritura-n107',
            'blog-stretching-come-controllare-l-allungamento-della-cannabis-n487',
            'blog-cosa-fare-quando-le-piante-di-cannabis-crescono-lentamente-n961',
            'blog-cosa-fare-quando-le-piante-di-cannabis-diventano-troppo-grandi-n728',
        ]
    },

    'fioritura': {
        'zamnesia': [
            '290-fase-fioritura-cannabis',
        ],
        'rqs': [
            '46-la-fase-di-fioritura',
            '47-le-ultime-settimane-di-fioritura',
            'blog-la-fase-di-fioritura-della-cannabis-settimana-per-settimana-n611',
            'blog-cosa-fare-quando-le-piante-di-cannabis-non-fioriscono-n479',
        ]
    },

    'raccolta': {
        'zamnesia': [
            '324-come-raccogliere-cannabis',
            '503-quando-raccogliere-le-piante-di-cannabis',
        ],
        'rqs': [
            '48-tempo-di-raccolta',
            'blog-conoscere-il-momento-giusto-per-raccogliere-la-cannabis-n84',
            'blog-l-importanza-dei-pistilli-per-i-coltivatori-di-cannabis-n999',
            'blog-e-meglio-che-raccogli-la-tua-cannabis-in-anticipo-o-in-ritardo-n1001',
        ]
    },

    'essiccazione_concia': {
        'zamnesia': [
            '328-come-conciare-cannabis',
            '333-lavaggio-delle-cime',
            '334-water-curing-marijuana',
            '335-conservare-cannabis',
            '554-come-pulire-piante-cannabis',
            '562-modi-migliori-essiccare-cime-cannabis',
        ],
        'rqs': [
            'blog-consigli-su-come-essiccare-e-conciare-le-cime-di-cannabis-fresche-n682',
            'blog-come-essiccare-piu-velocemente-la-cannabis-n821',
            'blog-trimming-di-infiorescenze-di-cannabis-fresche-vs-essiccate-n608',
            'blog-evitare-la-muffa-durante-la-concia-della-marijuana-n417',
            'blog-lavaggio-delle-cime-come-pulire-la-cannabis-nell-acqua-n1429',
        ]
    },

    'substrati_vasi': {
        'zamnesia': [
            '293-suolo-cannabis-terricci',
            '295-cocco',
            '297-guida-coltivazione-cannabis-lana-di-roccia',
            '300-scegliere-il-vaso-delle-giuste-dimensioni-per-le-vostre-piante',
        ],
        'rqs': [
            'blog-qual-e-il-miglior-substrato-di-coltivazione-per-la-cannabis-n1302',
            'blog-la-guida-per-il-coltivatore-domestico-sui-migliori-suoli-per-la-cannabis-n8',
            'blog-creare-il-proprio-terreno-misto-per-cannabis-n75',
            'blog-il-miglior-terriccio-per-coltivare-la-cannabis-autofiorente-n904',
        ]
    },

    'nutrizione_ph': {
        'zamnesia': [
            '301-come-irrigare-le-piante-di-cannabis',
            '302-lavaggio-delle-radici',
            '305-la-concimazione-della-cannabis',
            '308-rapporti-npk',
            '346-ec-ppm-cannabis-spiegati',
            '500-elementi-mobili-immobili',
            '502-disponibilita-nutrienti-erba',
            '570-come-misurare-regolare-ph-cannabis',
            '371-autofiorenti-nutrienti',
        ],
        'rqs': [
            'blog-come-usare-le-sostanze-nutritive-per-la-cannabis-n329',
            'blog-come-innaffiare-le-piante-di-cannabis-una-guida-completa-n1205',
            'blog-come-quando-e-perche-fare-il-risciacquo-delle-piante-di-marijuana-n312',
            'blog-come-rimediare-ad-un-irrigazione-eccessiva-o-insufficiente-n694',
            'blog-cannabis-qualita-dell-acqua-parte-2-ppm-ec-n298',
            'blog-il-valore-perfetto-di-ph-per-una-pianta-di-cannabis--n87',
            'blog-tabella-dei-nutrienti-e-insufficienze-della-cannabis--n88',
            'blog-melassa-un-eccellente-supplemento-per-le-piante-di-cannabis-n1148',
            'blog-come-impedire-e-risolvere-il-blocco-dei-nutrienti-nella-cannabis-n665',
            'blog-fertilizzanti-rqs-i-migliori-concimi-per-cannabis-n1436',
        ]
    },

    'problemi': {
        'zamnesia': [
            '344-identificare-risolvere-marciume-radicale-cannabis',
            '349-creature-amichevoli-cannabis',
            '351-olio-di-neem',
            '493-carenza-di-azoto',
            '494-carenze-nutrizionali',
            '495-tossicita-azoto-piante-cannabis',
            '497-carenza-di-magnesio',
            '499-carenza-zolfo-piante-cannabis',
            '505-crescita-lenta-della-cannabis',
            '507-carenza-di-fosforo',
            '510-carenza-di-zinco',
            '512-carenza-di-ferro',
            '515-carenza-di-potassio',
            '518-carenza-di-boro',
            '521-carenza-di-molibdeno',
            '522-carenze-di-rame',
            '558-oidio-cannabis',
            '560-macchie-bianche-erba-guida-coltivatori',
            '563-botrite-cime-cannabis-guida-coltivatore',
            '564-foglie-gialle-cannabis-diagnosi-trattamento',
            '565-guida-macchie-eccesso-fertilizzante-cannabis',
            '566-macchie-scure-foglie-cannabis',
            '567-macchie-nere-cannabis-diagnosi-trattamento',
            '571-foglie-cannabis-arricciate-verso',
            '572-rimedia-foglie-cannabis-arricciate-velocemente',
            '583-afidi-cannabis-riconoscerli-intervenire-subito',
        ],
        'rqs': [
            'blog-identificare-e-trattare-le-comuni-malattie-della-cannabis--n90',
            'blog-pythium-il-terrore-nascosto-sotto-le-piante-di-cannabis-n427',
            'blog-la-bruciatura-da-nutrienti-nella-pianta-di-cannabis-n680',
            'blog-come-impedire-e-risolvere-il-blocco-dei-nutrienti-nella-cannabis-n665',
            'blog-prevenire-e-trattare-le-foglie-di-cannabis-secche-e-friabili-n731',
            'blog-ingiallimento-fogliare-delle-piante-di-cannabis-n523',
            'blog-cosa-puo-dirvi-una-foglia-di-marijuana-n733',
        ]
    },

    'training': {
        'zamnesia': [
            '413-scrog-cannabis',
            '412-sog',
            '418-consigli-tecniche-potare-cannabis',
            '419-low-stress-training-cannabis-tutto-quello-che-c-e-da-sapere',
            '420-cimatura-cannabis',
            '421-fimming-cannabis',
            '423-defogliazione',
            '426-main-lining',
            '429-lollipopping-cannabis',
            '431-supercropping-cannabis',
            '434-tecnica-splitting-cannabis',
            '436-tutoraggio-rete-cannabis',
        ],
        'rqs': [
            'blog-coltivazione-di-cannabis-con-il-scrog-schermo-verde-metodo-n53',
            'blog-come-eseguire-low-stress-training-sulla-cannabis-per-migliori-rendimenti-n1',
            'blog-potare-la-marijuana-cimatura-vs-fimming-n621',
            'blog-defogliazione-una-tecnica-rischiosa-per-aumentare-le-rese-n562',
            'blog-come-aumentare-il-rendimento-della-cannabis-con-il-lollipopping-n1314',
        ]
    },

    'autofiorenti': {
        'zamnesia': [
            '369-consigli-coltivare-cannabis-autofiorente-indoor-e-outdoor',
            '371-autofiorenti-nutrienti',
            '406-ciclo-di-illuminazione-per-autofiorenti',
            '517-come-applicare-tecniche-training-varieta-autofiorenti',
            '573-topping-autofiorenti',
            '578-travasi-autofiorenti',
            '579-low-stress-training-autofiorenti-guida',
        ],
        'rqs': [
            'blog-come-coltivare-cannabis-auto-fiorente-n83',
            'blog-consigli-su-come-coltivare-piante-di-cannabis-autofiorente-n183',
            'blog-consigli-per-coltivare-cannabis-autofiorente-all-aperto-n1219',
            'blog-il-piano-d-illuminazione-perfetto-per-la-cannabis-autofiorente-n319',
            '144-massimizzare-le-rese-con-varieta-di-cannabis-autofiorenti',
        ]
    },

    'outdoor': {
        'zamnesia': [
            '374-come-coltivare-cannabis-outdoor',
            '377-coltivazione-discreta',
            '379-coltivare-in-giardini-cortili',
            '380-coltivare-balconi-terrazze',
            '383-coltivazione-guerrilla',
            '384-coltivazioni-in-serra-verande',
            '387-calendario-per-coltivare-cannabis',
        ],
        'rqs': [
            'blog-coltivare-cannabis-alaperto--n98',
            'blog-le-basi-della-coltivazione-outdoor-parte-1-n240',
            'blog-consigli-caldi-per-coltivare-marijuana-al-freddo-n429',
            '175-selezionare-le-migliori-varieta-di-marijuana-per-l-outdoor-secondo-il-clima',
            '136-lista-delle-migliori-piante-da-coltivare-insieme-alla-cannabis',
            '48-consociazione-di-piante',
            'blog-di-quanta-luce-solare-ha-bisogno-la-cannabis-per-crescere-all-aperto-n849',
        ]
    },

}

# ── GitHub helpers ────────────────────────────────────────────────────────────

def gh_raw(path):
    req = urllib.request.Request(
        f'{RAW}{path}',
        headers={'Authorization': f'Bearer {GITHUB_TOKEN}',
                 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8', errors='replace')

def gh_get_sha(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}',
            headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            return json.load(r)['sha']
    except:
        return None

def gh_put(path, content, sha, msg):
    if isinstance(content, str):
        content = content.encode('utf-8')
    body = json.dumps({
        'message': msg,
        'content': base64.b64encode(content).decode('ascii'),
        'branch':  'main',
        **({'sha': sha} if sha else {})
    }).encode()
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=body,
        headers={**HEADERS_GH, 'Content-Type': 'application/json'},
        method='PUT')
    with urllib.request.urlopen(req) as r:
        return json.load(r)['commit']['sha']

def gh_get_json(path):
    try:
        req = urllib.request.Request(
            f'https://api.github.com/repos/{REPO}/contents/{path}',
            headers=HEADERS_GH)
        with urllib.request.urlopen(req) as r:
            d = json.load(r)
        return json.loads(base64.b64decode(
            d['content'].replace('\n', '')).decode('utf-8')), d['sha']
    except:
        return None, None

# ── Leggi testo di un articolo web ───────────────────────────────────────────

def leggi_testo(sito, slug):
    """Carica testo da data/testi/web/{sito}/{slug}.txt, pulisce header."""
    path = f'data/testi/web/{sito}/{slug}.txt'
    try:
        raw = gh_raw(path)
    except Exception as ex:
        print(f'    SKIP (non trovato): {slug[:50]} — {ex}')
        return ''
    # Rimuovi header (=== titolo ===, FONTE:, DATA:)
    lines = raw.split('\n')
    testo_lines = []
    skip_header = True
    for line in lines:
        if skip_header:
            if line.startswith('===') or line.startswith('FONTE:') \
               or line.startswith('DATA:') or line.strip() == '':
                continue
            skip_header = False
        testo_lines.append(line)
    return '\n'.join(testo_lines).strip()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    oggi = datetime.date.today().isoformat()
    print(f'=== BioSerra Fusione Siti ({oggi}) ===')

    # Carica pdf_knowledge.json
    pdf_knowledge, sha_pk = gh_get_json('data/pdf_knowledge.json')
    if not pdf_knowledge:
        print('ERRORE: pdf_knowledge.json non trovato')
        return
    analisi = pdf_knowledge.get('analisi', [])
    ids_esistenti = {a['id'] for a in analisi}
    print(f'Voci esistenti: {len(analisi)}')

    nuove_voci = []
    file_salvati = 0

    for categoria, siti in CATEGORIE_FUSE.items():
        print(f'\n--- Categoria: {categoria} ---')
        sezioni = []

        # Leggi articoli Zamnesia
        sezione_zamn = []
        for slug in siti.get('zamnesia', []):
            testo = leggi_testo('zamnesia', slug)
            if len(testo) > 100:
                titolo_art = slug.replace('-', ' ').title()
                sezione_zamn.append(
                    f'## [Zamnesia] {titolo_art}\n\n{testo}')
                print(f'  + zamn: {slug[:50]} ({len(testo)} chars)')
            time.sleep(0.3)

        # Leggi articoli RQS
        sezione_rqs = []
        for slug in siti.get('rqs', []):
            testo = leggi_testo('rqs', slug)
            if len(testo) > 100:
                titolo_art = slug.replace('-', ' ').replace('blog ', '').title()
                sezione_rqs.append(
                    f'## [Royal Queen Seeds] {titolo_art}\n\n{testo}')
                print(f'  + rqs:  {slug[:50]} ({len(testo)} chars)')
            time.sleep(0.3)

        if not sezione_zamn and not sezione_rqs:
            print(f'  SKIP: nessun testo disponibile')
            continue

        # Costruisci file fuso
        intestazione = (
            f'=== GUIDA FUSA: {categoria.upper().replace("_"," ")} ===\n'
            f'FONTI: Zamnesia + Royal Queen Seeds\n'
            f'DATA: {oggi}\n'
            f'ARTICOLI: {len(sezione_zamn)} Zamnesia + {len(sezione_rqs)} RQS\n\n'
        )

        if sezione_zamn:
            intestazione += '# ZAMNESIA\n\n'
            sezioni.extend(sezione_zamn)

        if sezione_rqs:
            sezioni.append('\n# ROYAL QUEEN SEEDS\n')
            sezioni.extend(sezione_rqs)

        testo_fuso = intestazione + '\n\n---\n\n'.join(sezioni)
        chars_totali = len(testo_fuso)
        print(f'  Testo fuso: {chars_totali:,} chars')

        # Salva in data/testi/fusi/{categoria}.txt
        path_fuso = f'data/testi/fusi/{categoria}.txt'
        sha_fuso = gh_get_sha(path_fuso)
        gh_put(path_fuso, testo_fuso, sha_fuso,
               f'fusi: {categoria} [{oggi}]')
        file_salvati += 1
        print(f'  Salvato: {path_fuso}')

        # Aggiorna o crea voce in pdf_knowledge.json
        art_id = f'fuso_{categoria}'
        voce = {
            'id': art_id,
            'titolo': f'Guida Fusa: {categoria.replace("_", " ").title()}',
            'tag': ['coltivazione', 'guida', 'fusa', categoria,
                    'zamnesia', 'rqs'],
            'tecniche_chiave': [],
            'sommario': (
                f'Contenuto fuso da Zamnesia ({len(sezione_zamn)} articoli) '
                f'e Royal Queen Seeds ({len(sezione_rqs)} articoli) '
                f'sulla fase {categoria.replace("_"," ")}.'
            ),
            'connessioni': [],
            'rilevanza': 'alta',
            'consiglio_coltivazione': (
                f'Fonte unificata per {categoria.replace("_"," ")}: '
                f'integra approcci Zamnesia e RQS.'
            ),
            'consiglio_elettrocultura': '',
            'estratto_chiave': testo_fuso[:400],
            'mistral_analizzato': False,
            'testo_chars': chars_totali,
            'testo_id': categoria,
            'categoria_reale': f'fusa_{categoria}',
            'fonte_sito': 'fuso',
            'fonte_siti': ['zamnesia', 'rqs'],
            'n_articoli_zamn': len(sezione_zamn),
            'n_articoli_rqs': len(sezione_rqs),
        }

        # Aggiorna se esiste, aggiungi se nuovo
        if art_id in ids_esistenti:
            analisi = [voce if a['id'] == art_id else a for a in analisi]
            print(f'  Aggiornato: {art_id}')
        else:
            nuove_voci.append(voce)
            ids_esistenti.add(art_id)
            print(f'  Aggiunto: {art_id}')

        time.sleep(0.5)

    # Salva pdf_knowledge.json aggiornato
    if nuove_voci or file_salvati > 0:
        analisi.extend(nuove_voci)
        pdf_knowledge['analisi'] = analisi
        pdf_knowledge['lastUpdate'] = datetime.datetime.now(
            datetime.timezone.utc).isoformat()

        sha_pk_fresh = gh_get_sha('data/pdf_knowledge.json')
        gh_put('data/pdf_knowledge.json',
               json.dumps(pdf_knowledge, indent=2, ensure_ascii=False),
               sha_pk_fresh,
               f'fusione: {file_salvati} categorie [{oggi}]')
        print(f'\nSalvato pdf_knowledge.json: +{len(nuove_voci)} voci fuse')

    print(f'\n=== COMPLETATO ===')
    print(f'File fusi salvati: {file_salvati}')
    print(f'Nuove voci pdf_knowledge: {len(nuove_voci)}')

if __name__ == '__main__':
    main()
