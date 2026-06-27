import os, json, urllib.request, urllib.error, base64, datetime

GROQ_KEY = os.environ.get('GROQ_KEY', '')
GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO = 'francescocaruso487-tech/bioserra'
HEADERS_GH = {
    'Authorization': f'Bearer {GITHUB_TOKEN}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
}

print(f"GROQ_KEY: {GROQ_KEY[:15] if GROQ_KEY else 'ASSENTE'}...")
print(f"GITHUB_TOKEN: {'PRESENTE' if GITHUB_TOKEN else 'ASSENTE'}")

result = {'timestamp': datetime.datetime.utcnow().isoformat(), 'groq_key_presente': bool(GROQ_KEY)}

# Chiamata Groq minima
body = json.dumps({
    'model': 'llama-3.3-70b-versatile',
    'max_tokens': 50,
    'messages': [{'role': 'user', 'content': 'Rispondi solo: {"test":"ok"}'}]
}).encode()

req = urllib.request.Request(
    'https://api.groq.com/openai/v1/chat/completions',
    data=body,
    headers={'Authorization': 'Bearer ' + GROQ_KEY, 'Content-Type': 'application/json'},
    method='POST'
)
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        resp = json.load(r)
    raw = resp['choices'][0]['message']['content']
    print(f"GROQ RISPOSTA: {repr(raw)}")
    result['groq_response'] = raw
    result['groq_ok'] = True
except urllib.error.HTTPError as e:
    err = e.read().decode()
    print(f"GROQ HTTP {e.code}: {err}")
    result['groq_error'] = f"HTTP {e.code}: {err[:500]}"
    result['groq_ok'] = False
except Exception as e:
    print(f"GROQ ERRORE: {type(e).__name__}: {e}")
    result['groq_error'] = str(e)
    result['groq_ok'] = False

# Salva risultato su GitHub
content = base64.b64encode(json.dumps(result, indent=2, ensure_ascii=False).encode()).decode()
try:
    req2 = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/data/groq_test_result.json',
        headers=HEADERS_GH)
    try:
        with urllib.request.urlopen(req2) as r:
            sha = json.load(r).get('sha')
    except:
        sha = None
    body2 = {'message': 'groq test result', 'content': content}
    if sha:
        body2['sha'] = sha
    req3 = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/data/groq_test_result.json',
        data=json.dumps(body2).encode(), headers=HEADERS_GH, method='PUT')
    with urllib.request.urlopen(req3) as r:
        print(f"Risultato salvato su GitHub: {json.load(r)['content']['sha'][:8]}")
except Exception as e:
    print(f"Save error: {e}")
