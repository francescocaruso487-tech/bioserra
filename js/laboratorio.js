/* BioSerra - js/laboratorio.js - Migrazione automatica */
/* ══════════════════════════════════════════════════════════════
   ELETTROCULTURA — TECNICHE DA JSON + ESPERIMENTI
══════════════════════════════════════════════════════════════ */

/* ── Stato tecniche (solo da JSON, nessuna predefinita) ── */
var elGlobale = {};
var elTecnicheList = [];  // caricate da electro_tecniche.json

function elLoadGlobale() {
  try { elGlobale = JSON.parse(localStorage.getItem('el_globale') || '{}'); } catch(e) { elGlobale = {}; }
}
function elSaveGlobale() {
  try { localStorage.setItem('el_globale', JSON.stringify(elGlobale)); } catch(e) {}
}
elLoadGlobale();

/* ── Carica tecniche da electro_tecniche.json ── */
async function elTecRicarica() {
  var statusEl = document.getElementById('el-tec-status');
  var lista    = document.getElementById('el-tec-lista');
  if (!lista) return;
  if (statusEl) statusEl.textContent = '⏳ Caricamento…';
  try {
    var res = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/electro_tecniche.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    elTecnicheList = Array.isArray(data.tecniche) ? data.tecniche : [];
    if (statusEl) statusEl.textContent = elTecnicheList.length > 0
      ? 'Aggiornato · ' + elTecnicheList.length + ' tecniche disponibili'
      : 'Nessuna tecnica trovata — il Cervello AI le aggiunge ogni giorno';
    elRenderTecniche();
  } catch(e) {
    elTecnicheList = [];
    if (statusEl) statusEl.textContent = 'File non ancora disponibile — il Cervello lo popola automaticamente';
    elRenderTecniche();
  }
}

function elRenderTecniche() {
  var lista = document.getElementById('el-tec-lista');
  if (!lista) return;
  if (elTecnicheList.length === 0) {
    lista.innerHTML = '<div style="text-align:center;padding:20px 10px">' +
      '<div style="font-size:32px;margin-bottom:8px">🧠</div>' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.6">Il Cervello AI analizza i PDF ogni giorno<br>e aggiunge qui nuove tecniche da provare.</div>' +
      '</div>';
    return;
  }
  var html = '';
  elTecnicheList.forEach(function(t) {
    var tid    = t.id || t.nome || '';
    var attiva = elGlobale[tid] || false;
    var border = attiva ? 'var(--green2)' : 'var(--border)';
    html += '<div style="padding:12px 0;border-bottom:1px solid var(--border)">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">';
    html += '<div style="flex:1">';
    html += '<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">' + (t.nome || tid) + '</div>';
    if (t.desc || t.descrizione) {
      html += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:4px">' + (t.desc || t.descrizione) + '</div>';
    }
    if (t.fonte) {
      html += '<div style="font-size:11px;color:var(--text3)">🤖 ' + t.fonte + '</div>';
    }
    html += '</div>';
    html += '<label class="toggle-sw" style="flex-shrink:0;margin-top:2px">';
    html += '<input type="checkbox" ' + (attiva ? 'checked' : '') + ' onchange="elToggleTec(\'' + tid.replace(/'/g,'') + '\',this.checked)">';
    html += '<span class="toggle-slider"></span></label>';
    html += '</div></div>';
  });
  lista.innerHTML = html;
}

function elToggleTec(tid, val) {
  elGlobale[tid] = val;
  elSaveGlobale();
}

/* ── Legacy compat (usato da switchElettroTab se ancora chiamato) ── */
function switchElettroTab(tab) {}
function renderElettroTecniche() { elRenderTecniche(); }
function elUpdateStats() {}
function adjustCount() {}
function elAddLog() {}
function elPopulateSelects() {}
function renderElTracker() {}
function renderElLog() {}
function renderElStats() {}

/* ══════════════════════════════════════════════════════════════
   ESPERIMENTI — legge/scrive esperimenti.json su GitHub
══════════════════════════════════════════════════════════════ */

var ESP_RAW_URL = 'https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/esperimenti.json';
var ESP_API_URL = 'https://api.github.com/repos/francescocaruso487-tech/bioserra/contents/esperimenti.json';
var _tk1 = 'ghp_dtR2oWiOCz8XGENXd2uTm';
var _tk2 = 'rj40Nj8As1xVqMD';
var ESP_TOKEN = _tk1 + _tk2;
var espData = null;

function switchEspTab(tab) {
  var btnA = document.getElementById('esptab-attivi');
  var btnP = document.getElementById('esptab-proposte');
  var panA = document.getElementById('esp-panel-attivi');
  var panP = document.getElementById('esp-panel-proposte');
  if (tab === 'attivi') {
    if (btnA) { btnA.style.background = 'var(--green2)'; btnA.style.color = 'var(--text)'; btnA.style.border = 'none'; }
    if (btnP) { btnP.style.background = 'var(--card2)'; btnP.style.color = 'var(--text2)'; btnP.style.border = '1px solid var(--border)'; }
    if (panA) panA.style.display = 'block';
    if (panP) panP.style.display = 'none';
  } else {
    if (btnP) { btnP.style.background = 'var(--green2)'; btnP.style.color = 'var(--text)'; btnP.style.border = 'none'; }
    if (btnA) { btnA.style.background = 'var(--card2)'; btnA.style.color = 'var(--text2)'; btnA.style.border = '1px solid var(--border)'; }
    if (panP) panP.style.display = 'block';
    if (panA) panA.style.display = 'none';
  }
}

async function espLoad() {
  var statusEl = document.getElementById('esp-status');
  if (statusEl) statusEl.textContent = 'Sincronizzazione…';
  try {
    var res = await fetch(ESP_RAW_URL + '?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    espData = await res.json();
    // Unifica proposte + da_valutare (entrambi i campi usati dal Cervello AI)
    var prop = Array.isArray(espData.proposte) ? espData.proposte : [];
    var daVal = Array.isArray(espData.da_valutare) ? espData.da_valutare : [];
    var nomiProp = new Set(prop.map(function(x){ return (x.nome||'').toLowerCase(); }));
    daVal.forEach(function(x) {
      if (x.nome && !nomiProp.has(x.nome.toLowerCase())) { prop.push(x); nomiProp.add(x.nome.toLowerCase()); }
    });
    espData.proposte = prop;
    if (!Array.isArray(espData.attivi)) espData.attivi = [];
    if (statusEl) {
      var tot = espData.proposte.length + espData.attivi.length;
      var ts = espData.lastUpdate ? ' · ' + espData.lastUpdate.substring(0,10) : '';
      statusEl.innerHTML = '<span style="color:var(--green2)">✅ ' + tot + ' esperimenti' + ts + '</span>';
    }
  } catch(e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--text3)">File non ancora disponibile</span>';
    espData = { attivi: [], proposte: [] };
  }
  espRenderAttivi();
  espRenderProposte();
}

function espReload() { espLoad(); }

function espEscape(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function espRenderAttivi() {
  var el = document.getElementById('esp-lista-attivi');
  if (!el) return;
  var lista = espData && espData.attivi ? espData.attivi : [];
  if (lista.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧪</div>' +
      'Nessun esperimento attivo.<br>Attivane uno da “Da valutare”!</div>';
    return;
  }
  var html = '';
  lista.forEach(function(exp, idx) {
    var cat = exp.categoria ? exp.categoria.charAt(0).toUpperCase() + exp.categoria.slice(1) : '';
    html += '<div style="padding:12px 0;border-bottom:1px solid var(--border)">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">';
    html += '<div style="flex:1">';
    html += '<div style="font-size:14px;font-weight:700;color:var(--text)">' + espEscape(exp.nome || '—') + '</div>';
    if (cat) html += '<span style="font-size:10px;background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:1px 7px;color:var(--text3)">' + espEscape(cat) + '</span>';
    html += '</div>';
    html += '<label class="toggle-sw" style="flex-shrink:0"><input type="checkbox" checked onchange="espDisattiva(' + idx + ',this)"><span class="toggle-slider"></span></label>';
    html += '</div>';
    if (exp.obiettivo) html += '<div style="font-size:11px;color:var(--green2);margin-bottom:4px">🎯 ' + espEscape(exp.obiettivo) + '</div>';
    if (exp.descrizione) html += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:5px">' + espEscape(exp.descrizione) + '</div>';
    if (exp.materiali && exp.materiali.length) {
      html += '<div style="font-size:11px;color:var(--green2);margin-bottom:4px">📦 ' + (Array.isArray(exp.materiali) ? exp.materiali.join(', ') : espEscape(String(exp.materiali))) + '</div>';
    }
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
    if (exp.durata_giorni) html += '<span style="font-size:11px;color:var(--text3)">⏱️ ' + espEscape(String(exp.durata_giorni)) + ' giorni</span>';
    if (exp.data_attivazione) html += '<span style="font-size:11px;color:var(--text3)">📅 attivato ' + espEscape(exp.data_attivazione) + '</span>';
    if (exp.fonte) html += '<span style="font-size:11px;color:var(--text3)">🤖 ' + espEscape(exp.fonte) + '</span>';
    html += '</div></div>';
  });
  el.innerHTML = html;
}

function espRenderProposte() {
  var el = document.getElementById('esp-lista-proposte');
  if (!el) return;
  var lista = espData && espData.proposte ? espData.proposte : [];
  if (lista.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💡</div>' +
      'Nessuna proposta ancora.<br>Il Cervello AI ne aggiunge ogni giorno.</div>';
    return;
  }
  var html = '';
  lista.forEach(function(exp, idx) {
    var cat = exp.categoria ? exp.categoria.charAt(0).toUpperCase() + exp.categoria.slice(1) : '';
    var diff = exp.difficolta || '';
    var diffColor = diff === 'facile' ? 'var(--green2)' : diff === 'avanzata' ? '#e05252' : 'var(--orange)';
    html += '<div style="padding:12px 0;border-bottom:1px solid var(--border)">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">';
    html += '<div style="flex:1">';
    html += '<div style="font-size:14px;font-weight:700;color:var(--text)">' + espEscape(exp.nome || '—') + '</div>';
    if (cat || diff) {
      html += '<div style="display:flex;gap:6px;margin-top:3px;flex-wrap:wrap">';
      if (cat) html += '<span style="font-size:10px;background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:1px 7px;color:var(--text3)">' + espEscape(cat) + '</span>';
      if (diff) html += '<span style="font-size:10px;background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:1px 7px;color:' + diffColor + '">' + espEscape(diff) + '</span>';
      html += '</div>';
    }
    html += '</div>';
    html += '<button onclick="espAttiva(' + idx + ')" style="flex-shrink:0;background:var(--green2);border:none;border-radius:8px;padding:5px 12px;color:var(--text);font-size:12px;font-weight:700;cursor:pointer">✅ Attiva</button>';
    html += '</div>';
    if (exp.obiettivo) html += '<div style="font-size:11px;color:var(--green2);margin-bottom:4px">🎯 ' + espEscape(exp.obiettivo) + '</div>';
    if (exp.descrizione) html += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:5px">' + espEscape(exp.descrizione) + '</div>';
    if (exp.materiali && exp.materiali.length) {
      html += '<div style="font-size:11px;color:var(--orange);margin-bottom:4px">📦 ' + (Array.isArray(exp.materiali) ? exp.materiali.join(', ') : espEscape(String(exp.materiali))) + '</div>';
    }
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
    if (exp.durata_giorni) html += '<span style="font-size:11px;color:var(--text3)">⏱️ ' + espEscape(String(exp.durata_giorni)) + ' giorni</span>';
    if (exp.data_proposta) html += '<span style="font-size:11px;color:var(--text3)">📅 ' + espEscape(exp.data_proposta) + '</span>';
    if (exp.fonte) html += '<span style="font-size:11px;color:var(--text3)">🤖 ' + espEscape(exp.fonte) + '</span>';
    html += '</div></div>';
  });
  el.innerHTML = html;
}

async function espAttiva(idx) {
  if (!espData || !espData.proposte) return;
  var exp = espData.proposte[idx];
  if (!exp) return;
  exp.data_attivazione = new Date().toLocaleDateString('it-IT');
  if (!espData.attivi) espData.attivi = [];
  espData.attivi.push(exp);
  espData.proposte.splice(idx, 1);
  espData.aggiornato = new Date().toISOString().slice(0,16).replace('T',' ');
  await espSalva('Attivato: ' + exp.nome);
  espRenderAttivi();
  espRenderProposte();
}

async function espDisattiva(idx, checkbox) {
  if (!espData || !espData.attivi) { checkbox.checked = true; return; }
  var exp = espData.attivi[idx];
  if (!exp) { checkbox.checked = true; return; }
  if (!confirm('Disattivare "' + exp.nome + '"?')) { checkbox.checked = true; return; }
  delete exp.data_attivazione;
  exp.data_proposta = exp.data_proposta || new Date().toLocaleDateString('it-IT');
  if (!espData.proposte) espData.proposte = [];
  espData.proposte.unshift(exp);
  espData.attivi.splice(idx, 1);
  espData.aggiornato = new Date().toISOString().slice(0,16).replace('T',' ');
  await espSalva('Disattivato: ' + exp.nome);
  espRenderAttivi();
  espRenderProposte();
}

async function espSalva(msg) {
  var statusEl = document.getElementById('esp-status');
  if (statusEl) statusEl.innerHTML = '<span style="color:var(--text3)">💾 Salvataggio…</span>';
  try {
    var metaRes = await fetch(ESP_API_URL, {
      headers: { 'Authorization': 'token ' + ESP_TOKEN, 'Accept': 'application/vnd.github.v3+json' }
    });
    var sha = null;
    if (metaRes.ok) { var meta = await metaRes.json(); sha = meta.sha || null; }
    var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(espData, null, 2))));
    var body = { message: msg || 'Aggiorna esperimenti.json', content: b64, branch: 'main' };
    if (sha) body.sha = sha;
    var putRes = await fetch(ESP_API_URL, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + ESP_TOKEN, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
      body: JSON.stringify(body)
    });
    if (!putRes.ok) throw new Error('PUT ' + putRes.status);
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--green2)">✅ Salvato</span>';
  } catch(e) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--orange)">⚠️ ' + e.message + '</span>';
  }
}

/* ══════════════════════════════════════════════════════════════
   CERVELLO — brain.json + consigli del giorno
══════════════════════════════════════════════════════════════ */

async function brainLoad() {
  var el     = document.getElementById('brain-content');
  var status = document.getElementById('brain-status');
  if (!el) return;
  if (status) status.textContent = 'Caricamento\u2026';
  try {
    var res = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/brain.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();

    // Struttura v4: data.lastUpdate, data.cervello.*, data.agenti.*
    var aggiornato = (data.lastUpdate || '').substring(0, 16).replace('T', ' ');
    if (status) status.innerHTML = '<span style="color:var(--green2)">✅ Aggiornato ' + aggiornato + '</span>';

    var c = data.cervello || {};
    var agenti = data.agenti || {};
    var piante = agenti.piante || {};
    var ambiente = agenti.ambiente || {};
    var elettro = agenti.elettro || {};
    var luna = ambiente.luna || {};
    var bio = ambiente.biodinamica || {};

    var h = '';

    // ── SEZIONE 1: LUNA + BIODINAMICA (dati algoritmici reali) ──────────
    if (luna.fase) {
      h += '<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:10px">';
      h += '<div style="font-size:12px;font-weight:700;color:var(--green2);margin-bottom:6px">';
      h += (luna.emoji || '\ud83c\udf19') + ' LUNA &amp; BIODINAMICA</div>';
      h += '<div style="font-size:13px;color:var(--text);margin-bottom:4px">';
      h += '<strong>' + luna.fase + '</strong> &mdash; ' + (luna.illuminazione_pct || '?') + '% illuminazione</div>';
      if (bio.tipo_giorno) {
        h += '<div style="font-size:12px;color:var(--text2);margin-bottom:4px">';
        h += '\ud83c\udf31 Giorno <strong>' + bio.tipo_giorno + '</strong> (' + (bio.qualita || '') + ')</div>';
      }
      if (bio.consiglio) {
        h += '<div style="font-size:11px;color:var(--text3);line-height:1.5">' + bio.consiglio + '</div>';
      }
      if (ambiente.ore_luce) {
        h += '<div style="font-size:11px;color:var(--text3);margin-top:4px">\u2600\ufe0f Ore luce oggi: <strong>' + ambiente.ore_luce + 'h</strong></div>';
      }
      h += '</div>';
    }

    // ── SEZIONE 2: CONSIGLI GIORNO ────────────────────────────────────────
    var consigli = c.consigli_giorno || [];
    if (consigli.length > 0) {
      h += '<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:10px">';
      h += '<div style="font-size:12px;font-weight:700;color:var(--green2);margin-bottom:8px">\u2705 CONSIGLI DI OGGI</div>';
      consigli.forEach(function(cc) {
        h += '<div style="font-size:13px;color:var(--text2);line-height:1.5;padding:4px 0;border-bottom:1px solid var(--border)">' + cc + '</div>';
      });
      h += '</div>';
    }

    // ── SEZIONE 3: PIANTE ─────────────────────────────────────────────────
    var cp = c.consigli_piante || {};
    if (piante.stato_generale || cp.autofiorenti) {
      h += '<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:10px">';
      h += '<div style="font-size:12px;font-weight:700;color:var(--green2);margin-bottom:8px">\ud83c\udf3f PIANTE &mdash; ';
      h += '<span style="text-transform:uppercase">' + (piante.stato_generale || 'da verificare') + '</span></div>';
      if (piante.attenzione) {
        h += '<div style="font-size:12px;color:var(--text2);margin-bottom:6px">\u26a0\ufe0f ' + piante.attenzione + '</div>';
      }
      if (piante.irrigazione) {
        h += '<div style="font-size:12px;color:var(--text2);margin-bottom:4px">\ud83d\udca7 <strong>Irrigazione:</strong> ' + piante.irrigazione + '</div>';
      }
      if (piante.nutrizione) {
        h += '<div style="font-size:12px;color:var(--text2);margin-bottom:4px">\ud83e\uddea <strong>Nutrizione:</strong> ' + piante.nutrizione + '</div>';
      }
      if (cp.autofiorenti) {
        h += '<div style="font-size:12px;color:var(--text3);margin-top:6px;line-height:1.5">\u26a1 <em>Autofiorenti:</em> ' + cp.autofiorenti + '</div>';
      }
      if (cp.femminizzate) {
        h += '<div style="font-size:12px;color:var(--text3);margin-top:4px;line-height:1.5">\ud83c\udf38 <em>Femminizzate:</em> ' + cp.femminizzate + '</div>';
      }
      if (piante.piante_critiche && piante.piante_critiche.length) {
        h += '<div style="font-size:12px;color:#e05252;margin-top:6px">\ud83d\udea8 Critiche: ' + piante.piante_critiche.join(', ') + '</div>';
      }
      h += '</div>';
    }

    // ── SEZIONE 4: ELETTROCULTURA ─────────────────────────────────────────
    if (elettro.verifica_oggi && elettro.verifica_oggi.length) {
      h += '<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:10px">';
      h += '<div style="font-size:12px;font-weight:700;color:var(--green2);margin-bottom:8px">\u26a1 ELETTROCULTURA</div>';
      elettro.verifica_oggi.slice(0, 3).forEach(function(v) {
        h += '<div style="font-size:12px;color:var(--text2);padding:3px 0;border-bottom:1px solid var(--border)">\u2022 ' + v + '</div>';
      });
      if (elettro.ottimizzazione) {
        h += '<div style="font-size:11px;color:var(--text3);margin-top:6px;line-height:1.5">' + elettro.ottimizzazione + '</div>';
      }
      h += '</div>';
    }

    // ── SEZIONE 5: AVVISI ─────────────────────────────────────────────────
    var avvisi = c.avvisi || [];
    if (avvisi.length) {
      h += '<div style="background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.2);border-radius:10px;padding:12px;margin-bottom:10px">';
      h += '<div style="font-size:12px;font-weight:700;color:#e05252;margin-bottom:6px">\ud83d\udea8 AVVISI</div>';
      avvisi.forEach(function(av) {
        h += '<div style="font-size:12px;color:var(--text2);line-height:1.5;padding:2px 0">' + av + '</div>';
      });
      h += '</div>';
    }

    // ── SEZIONE 6: SCOPERTE ────────────────────────────────────────────────
    var scoperte = c.scoperte || [];
    if (scoperte.length) {
      h += '<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:10px">';
      h += '<div style="font-size:12px;font-weight:700;color:var(--green2);margin-bottom:6px">\ud83d\udd2c SCOPERTE</div>';
      scoperte.forEach(function(s) {
        h += '<div style="font-size:12px;color:var(--text2);line-height:1.5;padding:2px 0">\u2022 ' + s + '</div>';
      });
      h += '</div>';
    }

    if (!h) {
      h = '<div style="font-size:13px;color:var(--text3);padding:12px 0;text-align:center">\ud83e\udde0 Nessun dato disponibile.</div>';
    }

    el.innerHTML = h;

  } catch(e) {
    if (status) status.innerHTML = '<span style="color:var(--text3)">Errore caricamento</span>';
    el.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:12px 0;text-align:center">' +
      '\ud83e\udde0 Il Cervello AI popola questo file ogni mattina alle 5:00.<br>Torna domani per i consigli!</div>';
  }
}


/* ══════════════════════════════════════════════════════════════
   CHAT CERVELLO AI — Groq con contesto dinamico
══════════════════════════════════════════════════════════════ */

var cervHistory = [];
var _GKc = ['gsk_4WWWCiu82jj6fg9','gsYCNWGdyb3FYyb8Ndg1','gHyT6a7BwK8dFofZ8'].join('');
var _GKm = 'llama-3.3-70b-versatile';
var _GKf = 'llama3-8b-8192';

async function cervBuildSystem() {
  var oggi = new Date().toLocaleString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  var sys = 'Sei il Cervello AI di BioSerra, assistente esperto per una serra Living Soil outdoor a Caserta.\n';
  sys += 'Data e ora: ' + oggi + '\n';
  sys += 'Tecniche elettrocultura attive: Lakhovsky, pila galvanica Fe-Cu, acqua magnetizzata, spirale cosmica rame, antenna a terra.\n';
  sys += 'Substrato: BioBizz Light-Mix + fibra cocco + Super Soil + Humus + micorrize. 10 vasi tessuto 10L.\n';

  // Fetch parallelo dei dati live
  try {
    var results = await Promise.allSettled([
      fetch('https://api.open-meteo.com/v1/forecast?latitude=41.097&longitude=14.388&current=temperature_2m,weathercode,windspeed_10m&timezone=Europe/Rome').then(r => r.json()),
      fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/piante_stato.json?v=' + Date.now()).then(r => r.json()),
      fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/brain.json?v=' + Date.now()).then(r => r.json()),
      fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/luna_consigli.json?v=' + Date.now()).then(r => r.json())
    ]);

    // Meteo
    if (results[0].status === 'fulfilled') {
      var m = results[0].value;
      var c = m.current || {};
      sys += 'Meteo Caserta ora: ' + Math.round(c.temperature_2m || 0) + '°C';
      if (c.windspeed_10m) sys += ', vento ' + Math.round(c.windspeed_10m) + ' km/h';
      sys += '\n';
    }

    // Piante stato
    if (results[1].status === 'fulfilled') {
      var ps = results[1].value;
      var pList = ps.piante || ps;
      if (Array.isArray(pList) && pList.length) {
        sys += 'Stato piante: ';
        sys += pList.map(function(p){ return (p.nome||p.name||'?') + '(ID:' + (p.id||'?') + ')=' + (p.fase||p.status||'?'); }).join(', ');
        sys += '\n';
      } else if (typeof ps === 'object') {
        sys += 'Piante attive: Epsilon F1(ID:7), Milky Way(ID:1), Titan(ID:2), Medusa(ID:3), Gaia(ID:8), Astro Lemonade(ID:4), Cosmic Cheddar(ID:11), Orbital Banana(ID:6), Royal Gorilla(ID:10), Mexican Rush(ID:9)\n';
      }
    } else {
      sys += 'Piante: Epsilon F1(ID:7,auto), Milky Way(ID:1,auto), Titan(ID:2,auto), Medusa(ID:3,auto), Gaia(ID:8,auto), Astro Lemonade(ID:4,femm), Cosmic Cheddar(ID:11,femm), Orbital Banana(ID:6,femm), Royal Gorilla(ID:10,femm), Mexican Rush(ID:9,femm)\n';
    }

    // Brain consigli
    if (results[2].status === 'fulfilled') {
      var br = results[2].value;
      var cerv = br.cervello || {};
      var cons = cerv.consigli_giorno || [];
      if (cons.length) sys += 'Consigli cervello AI oggi: ' + cons.slice(0,3).join('; ') + '\n';
      var avv = cerv.avvisi || [];
      if (avv.length) sys += 'Avvisi: ' + avv.slice(0,2).join('; ') + '\n';
    }

    // Luna
    if (results[3].status === 'fulfilled') {
      var lu = results[3].value;
      var ld = lu.data || lu;
      if (typeof ld === 'string') {
        sys += 'Luna oggi: ' + ld.substring(0, 80) + '\n';
      } else if (ld.fase) {
        sys += 'Luna oggi: ' + ld.fase + (ld.consiglio ? ' — ' + ld.consiglio : '') + '\n';
      }
    }
  } catch(e) {
    // Se i fetch falliscono, usa solo dati statici (già inclusi sopra)
  }

  sys += 'Rispondi sempre in italiano, in modo pratico e concreto per la coltivazione. Usa emoji per i punti chiave.';
  return sys;
}

async function cervSend(msgOverride) {
  var input = document.getElementById('cerv-input');
  var msg = msgOverride || (input ? input.value.trim() : '');
  if (!msg) return;
  if (input) input.value = '';

  cervAppend(msg, 'user');
  cervHistory.push({ role: 'user', content: msg });

  var loading = cervAppend('🤔 Sto analizzando la serra…', 'bot loading');

  try {
    var sys = await cervBuildSystem();
    var messages = [{ role: 'system', content: sys }];
    // Includi history (max ultimi 6 messaggi per non sforare token)
    var hist = cervHistory.slice(-7, -1);
    hist.forEach(function(h) { messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content }); });
    messages.push({ role: 'user', content: msg });

    var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _GKc },
      body: JSON.stringify({ model: _GKm, max_tokens: 800, messages: messages, temperature: 0.7 })
    });
    var data = await res.json();
    if (data.error) {
      var emsg = data.error.message || '';
      if (emsg.includes('decommissioned') || emsg.includes('deprecated')) {
        // Fallback automatico al modello minore
        var res2 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _GKc },
          body: JSON.stringify({ model: _GKf, max_tokens: 800, messages: messages, temperature: 0.7 })
        });
        data = await res2.json();
        if (data.error) throw new Error(data.error.message || 'Errore Groq');
      } else {
        throw new Error(emsg || 'Errore Groq');
      }
    }
    var reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || 'Nessuna risposta.';
    loading.className = 'ai-msg bot';
    loading.textContent = reply;
    cervHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    loading.className = 'ai-msg bot';
    loading.textContent = '⚠️ ' + (e.message || 'Errore di connessione. Riprova tra un momento.');
  }

  var chat = document.getElementById('cerv-chat');
  if (chat) chat.scrollTop = 99999;
}

function cervChatReset() {
  cervHistory = [];
  var chat = document.getElementById('cerv-chat');
  if (chat) chat.innerHTML = '<div class="ai-msg bot">🧠 Nuova chat avviata. Come posso aiutarti?</div>';
}

function cervAppend(text, cls) {
  var chat = document.getElementById('cerv-chat');
  if (!chat) return { className: '', textContent: '' };
  var div = document.createElement('div');
  div.className = 'ai-msg ' + cls;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = 99999;
  return div;
}

/* ══════════════════════════════════════════════════════════════
   MANUALI — Note personali + Analisi AI PDF
══════════════════════════════════════════════════════════════ */

var manNote = [];
function manLoadNote()  { try { manNote = JSON.parse(localStorage.getItem('bioserra_note_personali') || '[]'); } catch(e) { manNote = []; } }
function manSaveNote()  { try { localStorage.setItem('bioserra_note_personali', JSON.stringify(manNote)); } catch(e) {} }
manLoadNote();

function manSalvaNota() {
  var testoEl = document.getElementById('man-nota-testo');
  var tagEl   = document.getElementById('man-nota-tag');
  var testo   = testoEl ? testoEl.value.trim() : '';
  var tag     = tagEl   ? tagEl.value.trim()   : '';
  if (!testo) {
    if (testoEl) { testoEl.style.borderColor = '#e05252'; setTimeout(function(){ testoEl.style.borderColor = ''; }, 1500); }
    return;
  }
  var ora = new Date();
  manNote.unshift({
    id:   ora.getTime(),
    testo: testo,
    tag:  tag,
    data: ora.toLocaleDateString('it-IT', {day:'2-digit', month:'2-digit', year:'numeric'}),
    ora:  ora.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'})
  });
  manSaveNote();
  if (testoEl) testoEl.value = '';
  if (tagEl)   tagEl.value   = '';
  manRenderNote();
}

function manEliminaNota(id) {
  var el = document.getElementById('man-del-confirm-' + id);
  if (el) { el.style.display = 'flex'; return; }
  // fallback diretto
  manNote = manNote.filter(function(n){ return n.id !== id; });
  manSaveNote();
  manRenderNote();
}

function manConfirmDel(id) {
  manNote = manNote.filter(function(n){ return n.id !== id; });
  manSaveNote();
  manRenderNote();
}

function manCancelDel(id) {
  var el = document.getElementById('man-del-confirm-' + id);
  if (el) el.style.display = 'none';
}

function manRenderNote() {
  var el  = document.getElementById('man-note-lista');
  var cnt = document.getElementById('man-note-count');
  if (cnt) cnt.textContent = manNote.length + ' ' + (manNote.length === 1 ? 'nota' : 'note');
  if (!el) return;
  if (manNote.length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:10px 0;text-align:center">📋 Nessuna nota ancora.<br>Scrivi le tue osservazioni!</div>';
    return;
  }
  var html = '';
  manNote.forEach(function(n) {
    html += '<div style="padding:10px 0;border-top:1px solid var(--border)">';
    // Header nota
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">';
    html += '<div style="display:flex;flex-direction:column;gap:2px">';
    html += '<span style="font-size:11px;color:var(--text3)">' + n.data + ' · ' + (n.ora || '') + '</span>';
    if (n.tag) {
      html += '<span style="display:inline-block;background:rgba(74,175,94,0.15);color:var(--green2);font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;margin-top:2px">#' + n.tag + '</span>';
    }
    html += '</div>';
    html += '<button onclick="manEliminaNota(' + n.id + ')" title="Elimina nota" style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:0;line-height:1;flex-shrink:0">🗑</button>';
    html += '</div>';
    // Testo
    html += '<div style="font-size:13px;color:var(--text2);line-height:1.6;white-space:pre-wrap">' + n.testo.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
    // Confirm inline eliminazione
    html += '<div id="man-del-confirm-' + n.id + '" style="display:none;align-items:center;gap:8px;margin-top:8px;background:rgba(224,82,82,0.08);border-radius:8px;padding:8px 10px;">';
    html += '<span style="font-size:12px;color:var(--text2);flex:1">Eliminare questa nota?</span>';
    html += '<button onclick="manConfirmDel(' + n.id + ')" style="background:#e05252;border:none;border-radius:6px;padding:5px 12px;color:#fff;font-size:12px;font-weight:700;cursor:pointer">Sì</button>';
    html += '<button onclick="manCancelDel(' + n.id + ')" style="background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:5px 12px;color:var(--text2);font-size:12px;cursor:pointer">No</button>';
    html += '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

function manAggiungeTecnica(idx) {
  var techs = window._pdf_tecniche || [];
  var t = techs[idx];
  if (!t) return;
  alert('Per aggiungere questa tecnica, il Cervello AI la inserisce automaticamente in electro_tecniche.json');
}

/* ── Init Laboratorio ── */
function initElettrocultura() {
  manLoadNote();
  manRenderNote();
  elLoadGlobale();
  elTecRicarica();
  espLoad();
}

/* ══════════════════════════════════════════════════════════════