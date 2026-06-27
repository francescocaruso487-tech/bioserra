import os, json, urllib.request, urllib.error, base64, datetime

OR_KEY = os.environ.get('OPENROUTER_KEY', '')
GH_TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {'Authorization': f'Bearer {GH_TOKEN}', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'}

print(f"OR_KEY: {OR_KEY[:20] if OR_KEY else 'ASSENTE'}...")

result = {'ts': datetime.datetime.utcnow().isoformat(), 'or_key': bool(OR_KEY)}

body = json.dumps({
    'model': 'meta-llama/llama-3.3-70b-instruct:free',
    'max_tokens': 50,
    'messages': [{'role': 'user', 'content': 'Rispondi solo: {"test":"ok"}'}]
}).encode()

req = urllib.request.Request(
    'https://openrouter.ai/api/v1/chat/completions',
    data=body,
    headers={
        'Authorization': 'Bearer ' + OR_KEY,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://francescocaruso487-tech.github.io/bioserra',
        'X-Title': 'BioSerra'
    },
    method='POST'
)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        resp = json.loads(r.read())
    raw = resp['choices'][0]['message']['content']
    print(f"OR RISPOSTA: {repr(raw)}")
    result['or_response'] = raw
    result['or_ok'] = True
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f"OR HTTP {e.code}: {err[:500]}")
    result['or_error'] = f"HTTP {e.code}: {err[:500]}"
    result['or_ok'] = False
except Exception as e:
    print(f"OR ERRORE: {type(e).__name__}: {e}")
    result['or_error'] = str(e)
    result['or_ok'] = False

# Salva risultato
content = base64.b64encode(json.dumps(result, indent=2).encode()).decode()
try:
    req2 = urllib.request.Request(f'https://api.github.com/repos/{REPO}/contents/data/or_test.json', headers=HEADERS_GH)
    try:
        with urllib.request.urlopen(req2) as r: sha = json.load(r).get('sha')
    except: sha = None
    b = {'message': 'or test', 'content': content}
    if sha: b['sha'] = sha
    req3 = urllib.request.Request(f'https://api.github.com/repos/{REPO}/contents/data/or_test.json', data=json.dumps(b).encode(), headers=HEADERS_GH, method='PUT')
    with urllib.request.urlopen(req3) as r: print(f"Salvato: {json.load(r)['content']['sha'][:8]}")
except Exception as e:
    print(f"Save: {e}")
