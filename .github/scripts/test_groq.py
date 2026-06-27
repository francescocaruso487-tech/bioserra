import os, json, urllib.request, urllib.error

GROQ_KEY = os.environ['GROQ_KEY']

print(f'Key: {GROQ_KEY[:12]}...')

body = json.dumps({
    'model': 'llama-3.3-70b-versatile',
    'max_tokens': 100,
    'temperature': 0.0,
    'messages': [
        {'role': 'system', 'content': 'Rispondi solo con JSON valido.'},
        {'role': 'user', 'content': 'Rispondi con {"test":"ok","numero":42}'}
    ]
}).encode()

req = urllib.request.Request(
    'https://api.groq.com/openai/v1/chat/completions',
    data=body,
    headers={
        'Authorization': 'Bearer ' + GROQ_KEY,
        'Content-Type': 'application/json'
    },
    method='POST'
)

try:
    with urllib.request.urlopen(req, timeout=15) as r:
        resp = json.load(r)
    raw = resp['choices'][0]['message']['content']
    print(f'Risposta: {raw}')
    print(f'Tokens: {resp.get("usage",{})}')
except urllib.error.HTTPError as e:
    print(f'HTTP {e.code}: {e.read().decode()}')
except Exception as e:
    print(f'Errore: {e}')
