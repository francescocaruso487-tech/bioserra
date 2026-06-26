import os
import json
import base64
import urllib.request
import urllib.error
import time

GITHUB_TOKEN = os.environ['GITHUB_TOKEN']
GROQ_KEY = os.environ['GROQ_KEY']
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}

def gh_get(path):
    req = urllib.request.Request(f'https://api.github.com/repos/{REPO}/contents/{path}', headers=HEADERS_GH)
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def gh_put(path, content_b64, sha, message):
    body = json.dumps({'message': message, 'content': content_b64, 'sha': sha}).encode()
    req = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=body, headers={**HEADERS_GH, 'Content-Type': 'application/json'}, method='PUT'
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

def groq_analizza(titolo, pdf_b64):
    system = ('Sei un esperto di agricoltura biodinamica, Living Soil e coltivazione outdoor. '
              'Serra BioSerra Caserta, piante Living Soil outdoor. '
              'Tecniche attive: elettrocultura Lakhovsky, pila galvanica Fe-Cu, acqua magnetizzata, '
              'spirale cosmica rame, antenna a terra. '
              'Rispondi SOLO con un oggetto JSON valido, nessun testo fuori dal JSON.')
    
    istruzioni = (f'Analizza questo PDF "{titolo}" e trova connessioni pratiche con la coltivazione Living Soil.\n\n'
                  f'Rispondi SOLO con questo JSON:\n'
                  f'{{"titolo":"{titolo}","sommario":"2-3 frasi sul contenuto","tecniche_chiave":["tecnica 1","tecnica 2"],'
                  f'"consiglio_coltivazione":"1 azione concreta","consiglio_elettrocultura":"connessione biodinamica o stringa vuota",'
                  f'"tag":["tag1","tag2"],"rilevanza":"alta/media/bassa","estratto_chiave":"max 200 caratteri"}}')
    
    if pdf_b64:
        messages = [
            {'role': 'user', 'content': [
                {'type': 'text', 'text': istruzioni},
                {'type': 'image_url', 'image_url': {'url': f'data:application/pdf;base64,{pdf_b64}'}}
            ]}
        ]
    else:
        messages = [{'role': 'user', 'content': istruzioni + f'\n\n(Analizza dal titolo: {titolo})'}]
    
    body = json.dumps({
        'model': 'llama-3.3-70b-versatile',
        'max_tokens': 1000,
        'temperature': 0.3,
        'messages': [{'role': 'system', 'content': system}] + messages
    }).encode()
    
    req = urllib.request.Request(
        'https://api.groq.com/openai/v1/chat/completions',
        data=body,
        headers={'Authorization': f'Bearer {GROQ_KEY}', 'Content-Type': 'application/json'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.load(r)
        content = resp['choices'][0]['message']['content']
        s, e = content.index('{'), content.rindex('}')
        return json.loads(content[s:e+1])
    except Exception as ex:
        print(f'  Errore Groq: {ex}')
        return None

def main():
    oggi = __import__('datetime').date.today().isoformat()
    
    # 1. Leggi pdf_knowledge.json
    print('Leggo pdf_knowledge.json...')
    kdata = gh_get('data/pdf_knowledge.json')
    decoded = base64.b64decode(kdata['content'].replace('\n','')).decode('utf-8')
    knowledge = json.loads(decoded)
    analisi_esistenti = knowledge.get('analisi', [])
    sha_knowledge = kdata['sha']
    
    titoli_analizzati = {a['titolo'].strip().lower() for a in analisi_esistenti}
    
    # 2. Elenca PDF in MANUALI/
    print('Leggo lista MANUALI/...')
    manuali = gh_get('MANUALI')
    pdf_files = [f for f in manuali if f['name'].endswith('.pdf')]
    
    # 3. Filtra non analizzati
    da_analizzare = [f for f in pdf_files 
                     if f['name'].replace('.pdf','').strip().lower() not in titoli_analizzati]
    
    print(f'PDF totali: {len(pdf_files)}, da analizzare: {len(da_analizzare)}')
    
    if not da_analizzare:
        print('Tutti i PDF già analizzati.')
        return
    
    # 4. Analizza max 20
    batch = da_analizzare[:20]
    nuove_analisi = []
    
    for i, pdf_file in enumerate(batch):
        titolo = pdf_file['name'].replace('.pdf','').strip()
        print(f'[{i+1}/{len(batch)}] {titolo[:60]}...')
        
        # Scarica PDF
        pdf_b64 = None
        try:
            pdf_data = gh_get(f"MANUALI/{pdf_file['name']}")
            if pdf_data.get('content'):
                pdf_b64 = pdf_data['content'].replace('\n','')
                print(f'  PDF scaricato ({len(pdf_b64)} chars b64)')
        except Exception as ex:
            print(f'  Scaricamento fallito: {ex}')
        
        # Analizza con Groq (solo testo dal titolo se PDF troppo grande)
        # Groq non supporta PDF direttamente — usiamo solo il titolo
        result = groq_analizza(titolo, None)
        
        if result:
            result['titolo'] = titolo
            result['data_analisi'] = oggi
            nuove_analisi.append(result)
            print(f'  OK: rilevanza={result.get("rilevanza","?")}')
        else:
            nuove_analisi.append({
                'titolo': titolo, 'sommario': 'Analisi non disponibile',
                'tecniche_chiave': [], 'consiglio_coltivazione': '',
                'consiglio_elettrocultura': '', 'tag': [],
                'rilevanza': 'bassa', 'estratto_chiave': '', 'data_analisi': oggi
            })
        
        time.sleep(1)  # rate limit Groq
    
    # 5. Assembla e salva
    tutte = analisi_esistenti + nuove_analisi
    tutte_con_id = []
    for idx, a in enumerate(tutte):
        a2 = dict(a)
        a2['id'] = a.get('id') or f'pdf_{idx}'
        tutte_con_id.append(a2)
    
    # Calcola connessioni
    for a in tutte_con_id:
        connessioni = []
        for b in tutte_con_id:
            if b['id'] == a['id']: continue
            tag_comuni = set(a.get('tag',[])) & set(b.get('tag',[]))
            peso = len(tag_comuni) * 2
            if peso >= 2:
                connessioni.append({'id': b['id'], 'titolo': b['titolo'], 'peso': peso})
        connessioni.sort(key=lambda x: -x['peso'])
        a['connessioni'] = connessioni[:5]
    
    knowledge_new = {
        'lastUpdate': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'total_pdf': len(tutte_con_id),
        'analisi': tutte_con_id
    }
    
    content_b64 = base64.b64encode(json.dumps(knowledge_new, indent=2, ensure_ascii=False).encode()).decode()
    
    # Fetch SHA fresco
    sha_fresco = gh_get('data/pdf_knowledge.json')['sha']
    
    gh_put('data/pdf_knowledge.json', content_b64, sha_fresco,
           f'BioSerra PDF analisi {oggi} (+{len(nuove_analisi)} nuovi, tot:{len(tutte_con_id)})')
    
    print(f'\nSalvato! Totale: {len(tutte_con_id)}, Nuovi: {len(nuove_analisi)}')

if __name__ == '__main__':
    main()
