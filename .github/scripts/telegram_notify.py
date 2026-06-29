import os, json, base64, urllib.request, urllib.error, datetime, sys

GITHUB_TOKEN  = os.environ.get('BIOSERRA_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN','')
BOT_TOKEN     = os.environ.get('TELEGRAM_BOT_TOKEN', '')
CHAT_ID       = os.environ.get('TELEGRAM_CHAT_ID', '')
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
        data = json.load(r)
    return json.loads(base64.b64decode(data['content'].replace('\n','')).decode('utf-8'))

def tg_send(text):
    if not BOT_TOKEN or not CHAT_ID:
        print('  TELEGRAM credenziali mancanti — skip invio')
        print(f'  Messaggio sarebbe:\n{text}')
        return
    url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
    body = json.dumps({
        'chat_id': CHAT_ID,
        'text': text,
        'parse_mode': 'HTML'
    }).encode()
    req = urllib.request.Request(url, data=body,
        headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = json.load(r)
        if resp.get('ok'):
            print(f'  Telegram OK: message_id={resp["result"]["message_id"]}')
        else:
            print(f'  Telegram errore: {resp}')
    except Exception as ex:
        print(f'  Telegram exception: {ex}')

def emoji_fase(fase):
    MAP = {
        'Germinazione': chr(0x1F331),
        'Vegetazione':  chr(0x1F33F),
        'Fioritura':    chr(0x1F338),
        'Taglio':       chr(0x2702),
        'Essiccazione': chr(0x1F4A8),
        'Concia':       chr(0x1F6E2),
        'Fine':         chr(0x2705),
    }
    return MAP.get(fase, chr(0x1F4CD))

def main():
    oggi = datetime.date.today().strftime('%d/%m/%Y')
    ora  = datetime.datetime.now().strftime('%H:%M')
    print(f'=== BioSerra Telegram Notify ({oggi} {ora}) ===')

    # 1. Leggi notifiche_config
    try:
        cfg = gh_get('data/notifiche_config.json')
        print(f'Config: piante={cfg.get("piante")}, luna={cfg.get("luna")}, ai={cfg.get("ai")}, elettro={cfg.get("elettro")}')
    except Exception as ex:
        print(f'Config error: {ex} — uso defaults tutti true')
        cfg = {'piante': True, 'luna': True, 'ai': True, 'elettro': True}

    # 2. Leggi brain.json
    try:
        brain = gh_get('data/brain.json')
        print('brain.json letto OK')
    except Exception as ex:
        print(f'brain.json error: {ex}')
        brain = {}

    # 3. Leggi piante_stato.json
    try:
        ps_raw = gh_get('data/piante_stato.json')
        piante_stato = ps_raw.get('data', {})
        print('piante_stato.json letto OK')
    except Exception as ex:
        print(f'piante_stato error: {ex}')
        piante_stato = {}

    # Costruisci messaggio
    lines = []
    lines.append(f'<b>' + chr(0x1F331) + ' BioSerra — {oggi}</b>')
    lines.append('')

    # Sezione AVVISI URGENTI (sempre, indipendente da config)
    avvisi = brain.get('avvisi', [])
    alerts = piante_stato.get('alerts_oggi', [])

    avvisi_urgenti = []
    # Alerts piante con <= 3 giorni
    for a in alerts:
        giorni = a.get('giorni', 999)
        if isinstance(giorni, (int, float)) and giorni <= 3:
            avvisi_urgenti.append(chr(0x1F534) + ' ' + a.get('msg', ''))
    # Avvisi dal brain con parole chiave urgenti
    for av in avvisi:
        av_str = str(av)
        if any(kw in av_str.lower() for kw in ['urgent', 'critic', 'imminent', 'oggi', 'immed', 'attenzione']):
            avvisi_urgenti.append(chr(0x26A0) + ' ' + av_str[:120])

    if avvisi_urgenti:
        lines.append('<b>' + chr(0x1F6A8) + ' AVVISI URGENTI</b>')
        for av in avvisi_urgenti[:3]:
            lines.append(av)
        lines.append('')

    # Sezione PIANTE
    if cfg.get('piante', True):
        stato_piante = piante_stato.get('stato_piante', [])
        lines.append('<b>' + chr(0x1F33F) + ' PIANTE</b>')

        # Piante critiche (raccolta entro 14gg)
        critiche = [p for p in stato_piante if isinstance(p.get('giorni_a_raccolta'), (int,float)) and 0 < p['giorni_a_raccolta'] <= 14]
        if critiche:
            for p in critiche[:4]:
                em = emoji_fase(p.get('fase', ''))
                lines.append(f'{em} <b>{p["nome"]}</b>: {p.get("fase","?")} — raccolta tra {p["giorni_a_raccolta"]}gg')
        else:
            # Mostra stato generale
            ag_piante = brain.get('agenti', {}).get('piante', {})
            stato_gen = ag_piante.get('stato_generale', 'monitoraggio')
            lines.append(f'Stato generale: {stato_gen}')
            for p in stato_piante[:3]:
                em = emoji_fase(p.get('fase', ''))
                lines.append(f'{em} {p["nome"]}: {p.get("fase","?")}')

        # Alert piante non urgenti
        for a in alerts:
            giorni = a.get('giorni', 999)
            if isinstance(giorni, (int, float)) and 3 < giorni <= 14:
                lines.append(chr(0x1F7E1) + ' ' + a.get('msg', '')[:100])

        # Consiglio irrigazione
        irr = brain.get('agenti', {}).get('piante', {}).get('irrigazione', '')
        if irr:
            lines.append(chr(0x1F4A7) + ' ' + str(irr)[:100])
        lines.append('')

    # Sezione LUNA
    if cfg.get('luna', True):
        luna = brain.get('agenti', {}).get('ambiente', {}).get('luna', {})
        fase_luna = luna.get('fase', '')
        emoji_luna = luna.get('emoji', chr(0x1F319))
        consiglio_luna = luna.get('consiglio', '')
        ore_luce = brain.get('agenti', {}).get('ambiente', {}).get('ore_luce', '')
        if fase_luna:
            lines.append('<b>' + chr(0x1F319) + ' LUNA & AMBIENTE</b>')
            lines.append(f'{emoji_luna} {fase_luna}')
            if consiglio_luna:
                lines.append(str(consiglio_luna)[:100])
            if ore_luce:
                lines.append(f'{chr(0x2600)} Ore luce: {ore_luce}h')
            lines.append('')

    # Sezione AI — consiglio del giorno
    if cfg.get('ai', True):
        consigli = brain.get('consigli_giorno', [])
        if not consigli:
            consigli = brain.get('cervello', {}).get('consigli_giorno', [])
        if consigli:
            lines.append('<b>' + chr(0x1F9E0) + ' CONSIGLIO AI</b>')
            lines.append(str(consigli[0])[:150])
            lines.append('')

    # Sezione ELETTRO
    if cfg.get('elettro', True):
        verifica = brain.get('agenti', {}).get('elettro', {}).get('verifica_oggi', [])
        if verifica:
            lines.append('<b>' + chr(0x26A1) + ' ELETTROCULTURA</b>')
            lines.append(str(verifica[0])[:120])
            lines.append('')

    # Footer
    lines.append('<i>BioSerra AI — aggiornamento automatico</i>')

    messaggio = '\n'.join(lines)
    print(f'\nMessaggio ({len(messaggio)} chars):')
    print(messaggio[:500])
    print('...' if len(messaggio) > 500 else '')

    tg_send(messaggio)
    print('\n=== COMPLETATO ===')

if __name__ == '__main__':
    main()
