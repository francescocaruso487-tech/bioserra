import os, json, urllib.request, urllib.error, base64, datetime

MISTRAL_KEY = os.environ.get('MISTRAL_KEY', '')
GH_TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {'Authorization': f'Bearer {GH_TOKEN}', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json'}

print(f"MISTRAL_KEY: {MISTRAL_KEY[:15] if MISTRAL_KEY else 'ASSENTE'}...")

result = {'ts': datetime.datetime.utcnow().isoformat()}

# Test Mistral chat con mistral-small-latest (gratuito tier free)
body = json.dumps({
    'model': 'mistral-small-latest',
    'max_tokens': 100,
    'messages': [{'role': 'user', 'content': 'Rispondi solo: {"test":"ok"}'}]
}).encode()

req = urllib.request.Request(
    'https://api.mistral.ai/v1/chat/completions',
    data=body,
    headers={'Authorization': 'Bearer ' + MISTRAL_KEY, 'Content-Type': 'application/json'},
    method='POST'
)
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        resp = json.loads(r.read())
    raw = resp['choices'][0]['message']['content']
    print(f"MISTRAL RISPOSTA: {repr(raw)}")
    result['mistral_ok'] = True
    result['mistral_response'] = raw
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f"MISTRAL HTTP {e.code}: {err[:400]}")
    result['mistral_ok'] = False
    result['mistral_error'] = f"HTTP {e.code}: {err[:400]}"
except Exception as e:
    print(f"MISTRAL ERRORE: {type(e).__name__}: {e}")
    result['mistral_ok'] = False
    result['mistral_error'] = str(e)

# Salva
content = base64.b64encode(json.dumps(result, indent=2).encode()).decode()
try:
    req2 = urllib.request.Request(f'https://api.github.com/repos/{REPO}/contents/data/mistral_test.json', headers=HEADERS_GH)
    try:
        with urllib.request.urlopen(req2) as r: sha = json.load(r).get('sha')
    except: sha = None
    b = {'message': 'mistral chat test', 'content': content}
    if sha: b['sha'] = sha
    req3 = urllib.request.Request(f'https://api.github.com/repos/{REPO}/contents/data/mistral_test.json', data=json.dumps(b).encode(), headers=HEADERS_GH, method='PUT')
    with urllib.request.urlopen(req3) as r: print(f"Salvato: {json.load(r)['content']['sha'][:8]}")
except Exception as e: print(f"Save: {e}")
