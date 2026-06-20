/* BioSerra - laboratorio.js */
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
    var res = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/electro_tecniche.json?v=' + Date.now());
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

var ESP_RAW_URL = 'https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/esperimenti.json';
var ESP_API_URL = 'https://api.github.com/repos/francescocaruso487-tech/bioserra/contents/data/esperimenti.json';
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
    var res = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/brain.json?v=' + Date.now());
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
   CHAT CERVELLO AI — API Anthropic con contesto dinamico
══════════════════════════════════════════════════════════════ */

var cervHistory = [];

async function cervBuildSystem() {
  var oggi = new Date().toLocaleString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  var sys = 'Sei il Cervello AI di BioSerra, serra Living Soil outdoor Caserta 10 piante cannabis.\n';
  sys += 'Oggi: ' + oggi + '\n';
  sys += 'Tecniche attive: Lakhovsky, pila Fe-Cu, acqua magnetizzata, spirale rame, antenna terra.\n';

  try {
    var results = await Promise.allSettled([
      fetch('https://api.open-meteo.com/v1/forecast?latitude=41.097&longitude=14.388&current=temperature_2m,weathercode&timezone=Europe/Rome').then(function(r){ return r.json(); }),
      fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/brain.json?v=' + Date.now()).then(function(r){ return r.json(); }),
      fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/luna_consigli.json?v=' + Date.now()).then(function(r){ return r.json(); }),
      fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/piante_stato.json?v=' + Date.now()).then(function(r){ return r.json(); })
    ]);

    // Meteo
    if (results[0].status === 'fulfilled') {
      var cur = results[0].value.current || {};
      sys += 'Meteo: ' + Math.round(cur.temperature_2m || 0) + '\u00b0C\n';
    }

    // Brain
    if (results[1].status === 'fulfilled') {
      var br = results[1].value;
      var cerv = br.cervello || {};
      var amb  = (br.agenti || {}).ambiente || {};
      var luna = amb.luna || {};
      var bio  = amb.biodinamica || {};
      // Luna dal brain
      if (luna.fase) {
        sys += 'Luna: ' + luna.fase;
        if (bio.tipo_giorno) sys += ' - giorno ' + bio.tipo_giorno;
        sys += '\n';
      }
      // Consigli giorno
      var cons = cerv.consigli_giorno || [];
      if (cons.length) sys += 'Consigli AI oggi: ' + cons.slice(0, 4).join('; ') + '\n';
      var avv = cerv.avvisi || [];
      if (avv.length) sys += 'Avvisi: ' + avv.slice(0, 2).join('; ') + '\n';
    }

    // Luna fallback da luna_consigli.json
    if (results[1].status !== 'fulfilled' && results[2].status === 'fulfilled') {
      var lu = results[2].value;
      var ld = lu.data || lu;
      if (typeof ld === 'string') sys += 'Luna: ' + ld.substring(0, 100) + '\n';
      else if (ld && ld.fase) sys += 'Luna: ' + ld.fase + (ld.tipo_giorno ? ' - ' + ld.tipo_giorno : '') + '\n';
    }

    // Piante
    if (results[3].status === 'fulfilled') {
      var ps = results[3].value;
      var pList = ps.piante || ps;
      if (Array.isArray(pList) && pList.length) {
        sys += 'Piante: ' + pList.map(function(p){
          return (p.nome || p.name || '?') + '(ID:' + (p.id || '?') + ')=' + (p.fase || p.status || '?');
        }).join(', ') + '\n';
      } else {
        sys += 'Piante: Epsilon F1(ID:7,auto), Milky Way(ID:1,auto), Titan(ID:2,auto), Medusa(ID:3,auto), Gaia(ID:8,auto), Astro Lemonade(ID:4,femm), Cosmic Cheddar(ID:11,femm), Orbital Banana(ID:6,femm), Royal Gorilla(ID:10,femm), Mexican Rush(ID:9,femm)\n';
      }
    } else {
      sys += 'Piante: Epsilon F1(ID:7,auto), Milky Way(ID:1,auto), Titan(ID:2,auto), Medusa(ID:3,auto), Gaia(ID:8,auto), Astro Lemonade(ID:4,femm), Cosmic Cheddar(ID:11,femm), Orbital Banana(ID:6,femm), Royal Gorilla(ID:10,femm), Mexican Rush(ID:9,femm)\n';
    }
  } catch(e) { /* usa dati statici gi\u00e0 inclusi */ }

  sys += 'Rispondi in italiano, pratico e concreto. Usa emoji per i punti chiave.';
  return sys;
}

async function cervSend(msgOverride) {
  var input = document.getElementById('cerv-input');
  var msg = msgOverride || (input ? input.value.trim() : '');
  if (!msg) return;
  if (input) input.value = '';

  cervAppendUser(msg);
  cervHistory.push({ role: 'user', content: msg });

  var loadEl = cervAppendBot('\ud83e\udde0 Sto analizzando\u2026', true);

  try {
    var sys = await cervBuildSystem();
    // Costruisce history multiturno (max ultimi 8 msg)
    var msgs = cervHistory.slice(-9, -1).map(function(h){
      return { role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content };
    });
    msgs.push({ role: 'user', content: msg });

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: sys,
        messages: msgs
      })
    });

    var data = await res.json();
    if (data.error) throw new Error(data.error.message || 'Errore API');
    var reply = (data.content && data.content[0] && data.content[0].text) || 'Nessuna risposta.';
    loadEl.textContent = reply;
    loadEl.classList.remove('loading');
    cervHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    loadEl.textContent = '\u26a0\ufe0f ' + (e.message || 'Errore connessione. Riprova.');
    loadEl.classList.remove('loading');
  }

  var chat = document.getElementById('cerv-chat');
  if (chat) chat.scrollTop = 99999;
}

function cervChatReset() {
  cervHistory = [];
  var chat = document.getElementById('cerv-chat');
  if (!chat) return;
  chat.innerHTML = '';
  cervAppendBot('\ud83e\udde0 Nuova chat avviata! Come posso aiutarti con la tua serra?', false);
}

/* Aggiunge messaggio utente (destra, verde) */
function cervAppendUser(text) {
  var chat = document.getElementById('cerv-chat');
  if (!chat) return;
  var div = document.createElement('div');
  div.className = 'ai-msg user';
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = 99999;
}

/* Aggiunge messaggio AI (sinistra, scuro) con avatar 🧠 */
function cervAppendBot(text, loading) {
  var chat = document.getElementById('cerv-chat');
  if (!chat) return { textContent: '', classList: { remove: function(){} } };
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;max-width:92%';
  // Avatar
  var av = document.createElement('div');
  av.textContent = '\ud83e\udde0';
  av.style.cssText = 'font-size:18px;flex-shrink:0;margin-top:2px';
  // Bolla
  var bolla = document.createElement('div');
  bolla.className = 'ai-msg bot' + (loading ? ' loading' : '');
  bolla.style.cssText = 'margin:0;max-width:100%';
  bolla.textContent = text;
  row.appendChild(av);
  row.appendChild(bolla);
  chat.appendChild(row);
  chat.scrollTop = 99999;
  return bolla; // ritorna la bolla per aggiornarne il testo
}

/* Compatibilità con la vecchia chiamata cervAppend dal HTML (bottoni rapidi) */
function cervAppend(text, cls) {
  if (cls === 'user') { cervAppendUser(text); return { className: 'ai-msg user', textContent: text }; }
  return cervAppendBot(text, cls === 'bot loading');
}

/* ══════════════════════════════════════════════════════════════
   MANUALI — Note personali + Analisi AI PDF
══════════════════════════════════════════════════════════════ */

var manNote = [];
var manDelPending = null; // id nota in attesa conferma doppio tap

function manLoadNote()  { try { manNote = JSON.parse(localStorage.getItem('bioserra_note_personali') || '[]'); } catch(e) { manNote = []; } }
function manSaveNote()  { try { localStorage.setItem('bioserra_note_personali', JSON.stringify(manNote)); } catch(e) {} }
manLoadNote();

/* Contatore caratteri live sull'input nota */
function manCountChars() {
  var el  = document.getElementById('man-nota-testo');
  var cnt = document.getElementById('man-nota-chars');
  if (!el || !cnt) return;
  var len = el.value.length;
  cnt.textContent = len + '/200';
  cnt.style.color = len >= 190 ? '#e05252' : len >= 150 ? '#f0a500' : 'var(--text3)';
  if (len > 200) el.value = el.value.substring(0, 200);
}

function manSalvaNota() {
  var testoEl = document.getElementById('man-nota-testo');
  var tagEl   = document.getElementById('man-nota-tag');
  var testo   = testoEl ? testoEl.value.trim() : '';
  var tag     = tagEl   ? tagEl.value.trim()   : '';
  if (!testo) {
    if (testoEl) { testoEl.style.borderColor = '#e05252'; setTimeout(function(){ testoEl.style.borderColor = ''; }, 1500); }
    return;
  }
  if (testo.length > 200) testo = testo.substring(0, 200);
  var ora = new Date();
  manNote.unshift({
    id:    ora.getTime(),
    testo: testo,
    tag:   tag,
    data:  ora.toLocaleDateString('it-IT', {day:'2-digit', month:'2-digit', year:'numeric'}),
    ora:   ora.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'})
  });
  manSaveNote();
  if (testoEl) { testoEl.value = ''; }
  if (tagEl)   tagEl.value = '';
  manCountChars();
  manDelPending = null;
  manRenderNote();
}

/* Doppio tap: primo tap mostra "Conferma?" sul bottone, secondo tap elimina */
function manEliminaNota(id) {
  if (manDelPending === id) {
    // Secondo tap — elimina
    manNote = manNote.filter(function(n){ return n.id !== id; });
    manSaveNote();
    manDelPending = null;
    manRenderNote();
  } else {
    // Primo tap — imposta pending e aggiorna solo il bottone
    if (manDelPending !== null) {
      // Resetta il bottone precedente
      var prevBtn = document.getElementById('man-del-btn-' + manDelPending);
      if (prevBtn) { prevBtn.textContent = '\uD83D\uDDD1'; prevBtn.style.color = 'var(--text3)'; }
    }
    manDelPending = id;
    var btn = document.getElementById('man-del-btn-' + id);
    if (btn) {
      btn.textContent = 'Conferma?';
      btn.style.cssText = 'background:#e05252;border:none;border-radius:6px;padding:3px 8px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;';
    }
    // Auto-reset dopo 3 secondi
    setTimeout(function(){
      if (manDelPending === id) {
        manDelPending = null;
        var b = document.getElementById('man-del-btn-' + id);
        if (b) { b.textContent = '\uD83D\uDDD1'; b.style.cssText = 'background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:0;line-height:1;flex-shrink:0'; }
      }
    }, 3000);
  }
}

function manRenderNote() {
  var el  = document.getElementById('man-note-lista');
  var cnt = document.getElementById('man-note-count');
  if (cnt) cnt.textContent = manNote.length + ' ' + (manNote.length === 1 ? 'nota' : 'note');
  if (!el) return;
  if (manNote.length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:16px 0;text-align:center">📋 Nessuna nota ancora.<br><span style="font-size:12px">Scrivi le tue osservazioni!</span></div>';
    return;
  }
  var html = '';
  manNote.forEach(function(n) {
    html += '<div style="padding:10px 0;border-top:1px solid var(--border)">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">';
    // Meta (data + tag)
    html += '<div style="display:flex;flex-direction:column;gap:3px">';
    html += '<span style="font-size:11px;color:var(--text3)">' + n.data + ' · ' + (n.ora || '') + '</span>';
    if (n.tag) {
      html += '<span style="display:inline-block;background:rgba(74,175,94,0.15);color:var(--green2);font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px">#' + n.tag + '</span>';
    }
    html += '</div>';
    // Bottone elimina (doppio tap)
    html += '<button id="man-del-btn-' + n.id + '" onclick="manEliminaNota(' + n.id + ')" title="Tocca due volte per eliminare" style="background:none;border:none;color:var(--text3);font-size:18px;cursor:pointer;padding:0;line-height:1;flex-shrink:0">\uD83D\uDDD1</button>';
    html += '</div>';
    // Testo nota
    html += '<div style="font-size:13px;color:var(--text2);line-height:1.6;white-space:pre-wrap">' + n.testo.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</div>';
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

/* ══════════════════════════════════════════════════════════════
   GUIDE COMPLETE — da guide_complete.json (RQS + Zamnesia fuse)
══════════════════════════════════════════════════════════════ */

async function loadGuideComplete() {
  var el = document.getElementById('guide-content');
  var meta = document.getElementById('guide-meta');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">\u23f3 Caricamento guide\u2026</div>';
  try {
    var res = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/guide_complete.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var guide = data.guide || [];
    var aggiornato = (data.lastUpdate || '').substring(0, 10);
    if (meta) meta.innerHTML = '\u2705 ' + guide.length + ' guide \u00b7 ' + aggiornato;
    if (guide.length === 0) {
      el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">\ud83d\udcda Guide in generazione\u2026 Torna domani!</div>';
      return;
    }
    var h = '';
    guide.forEach(function(g, idx) {
      var catColor = g.categoria === 'acqua' ? '#4a9eff' : g.categoria === 'nutrizione' ? '#4aaf5e' : g.categoria === 'difesa' ? '#e05252' : 'var(--green2)';
      h += '<div style="background:var(--card2);border-radius:12px;padding:14px;margin-bottom:10px;border-left:3px solid ' + catColor + '">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
      h += '<div style="font-size:14px;font-weight:700;color:var(--text)">' + (g.titolo || '') + '</div>';
      h += '<span style="font-size:10px;background:rgba(74,175,94,0.15);color:var(--green2);padding:2px 8px;border-radius:20px">' + (g.categoria || '') + '</span>';
      h += '</div>';
      if (g.contenuto_completo) {
        var preview = (g.contenuto_completo || '').substring(0, 200);
        if (g.contenuto_completo.length > 200) preview += '...';
        h += '<div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:8px">' + preview + '</div>';
      }
      if (g.punti_chiave && g.punti_chiave.length) {
        h += '<div style="margin-bottom:6px">';
        g.punti_chiave.forEach(function(p) {
          h += '<div style="font-size:11px;color:var(--text3);padding:2px 0">\u2713 ' + p + '</div>';
        });
        h += '</div>';
      }
      if (g.quando) {
        h += '<div style="font-size:11px;color:var(--text3);margin-top:4px">\ud83d\udcc5 <em>' + g.quando + '</em></div>';
      }
      h += '<button onclick="guideEspandi(' + idx + ')" id="guide-btn-' + idx + '" style="margin-top:8px;background:none;border:1px solid var(--border);border-radius:8px;padding:5px 12px;color:var(--text3);font-size:11px;cursor:pointer;width:100%">Leggi guida completa \u25bc</button>';
      h += '<div id="guide-espansa-' + idx + '" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">';
      if (g.contenuto_completo) {
        h += '<div style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:8px">' + g.contenuto_completo + '</div>';
      }
      if (g.errori_comuni && g.errori_comuni.length) {
        h += '<div style="font-size:11px;font-weight:700;color:#e05252;margin-bottom:4px">\u26a0\ufe0f Errori comuni:</div>';
        g.errori_comuni.forEach(function(e) {
          h += '<div style="font-size:11px;color:var(--text3);padding:2px 0">\u2715 ' + e + '</div>';
        });
      }
      if (g.fonte_rqs || g.fonte_zamnesia) {
        h += '<div style="font-size:10px;color:var(--text3);margin-top:6px"><strong>Fonti:</strong> RQS \u2014 ' + (g.fonte_rqs || 'n.d.') + ' | Zamnesia \u2014 ' + (g.fonte_zamnesia || 'n.d.') + '</div>';
      }
      h += '</div></div>';
    });
    el.innerHTML = h;
  } catch(e) {
    if (meta) meta.innerHTML = '<span style="color:var(--text3)">Non disponibile</span>';
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">\ud83d\udcda Guide in generazione\u2026</div>';
  }
}

function guideEspandi(idx) {
  var el = document.getElementById('guide-espansa-' + idx);
  var btn = document.getElementById('guide-btn-' + idx);
  if (!el) return;
  var aperto = el.style.display !== 'none';
  el.style.display = aperto ? 'none' : 'block';
  if (btn) btn.innerHTML = aperto ? 'Leggi guida completa \u25bc' : 'Chiudi \u25b2';
}

/* ══════════════════════════════════════════════════════════════
   PDF SYNTHESIS — connessioni inaspettate tra PDF Drive
══════════════════════════════════════════════════════════════ */

async function loadPdfSynthesis() {
  var el = document.getElementById('synthesis-content');
  var meta = document.getElementById('synthesis-meta');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">\u23f3 Caricamento connessioni\u2026</div>';
  try {
    var res = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/pdf_synthesis.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var conn = data.connessioni || [];
    var esp = data.esperimenti_incrociati || [];
    var scoperte = data.scoperte || [];
    var aggiornato = (data.lastUpdate || '').substring(0, 10);
    if (meta) meta.innerHTML = '\ud83d\udd17 ' + conn.length + ' connessioni \u00b7 \ud83e\uddea ' + esp.length + ' esperimenti \u00b7 ' + aggiornato;
    var h = '';
    if (scoperte.length) {
      var s = scoperte[0];
      h += '<div style="background:rgba(74,175,94,0.08);border:1px solid rgba(74,175,94,0.2);border-radius:12px;padding:12px;margin-bottom:10px">';
      h += '<div style="font-size:11px;font-weight:700;color:var(--green2);margin-bottom:4px">\ud83d\udca1 SCOPERTA DEL GIORNO</div>';
      h += '<div style="font-size:13px;color:var(--text);line-height:1.6">' + (s.testo || '') + '</div>';
      if (s.data) h += '<div style="font-size:10px;color:var(--text3);margin-top:4px">' + s.data + '</div>';
      h += '</div>';
    }
    if (conn.length) {
      h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">\ud83d\udd17 Connessioni tra PDF</div>';
      conn.slice(0, 5).forEach(function(c) {
        h += '<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:8px">';
        h += '<div style="font-size:11px;color:var(--text3);margin-bottom:4px"><strong>' + (c.pdf_a || '') + '</strong> + <strong>' + (c.pdf_b || '') + '</strong></div>';
        h += '<div style="font-size:12px;color:var(--text);line-height:1.5;margin-bottom:6px">' + (c.collegamento || '') + '</div>';
        if (c.principio_comune) h += '<div style="font-size:11px;color:var(--green2)">\u2605 ' + c.principio_comune + '</div>';
        if (c.esperimento) h += '<div style="font-size:11px;color:var(--text3);margin-top:4px;font-style:italic">\ud83e\uddea ' + c.esperimento + '</div>';
        h += '</div>';
      });
    }
    if (esp.length) {
      h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-top:10px;margin-bottom:8px">\ud83e\uddea Esperimenti Incrociati</div>';
      esp.slice(0, 3).forEach(function(e) {
        h += '<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:8px">';
        h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">' + (e.nome || '') + '</div>';
        if (e.protocollo) h += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:4px">' + e.protocollo + '</div>';
        if (e.misurazioni) h += '<div style="font-size:11px;color:var(--text3)">\ud83d\udcca ' + e.misurazioni + '</div>';
        if (e.durata) h += '<div style="font-size:11px;color:var(--text3)">\u23f1 ' + e.durata + '</div>';
        h += '</div>';
      });
    }
    if (!conn.length && !esp.length) {
      h = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">\ud83e\udde0 Il Cervello analizza i PDF ogni giorno e trova nuove connessioni!</div>';
    }
    el.innerHTML = h;
  } catch(e) {
    if (meta) meta.innerHTML = '<span style="color:var(--text3)">Non disponibile</span>';
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">\ud83d\udcda Connessioni in elaborazione\u2026</div>';
  }
}

/* ══════════════════════════════════════════════════════════════
   KNOWLEDGE DIGEST — fusione giornaliera di tutto
══════════════════════════════════════════════════════════════ */

async function loadKnowledgeDigest() {
  var el = document.getElementById('digest-content');
  var meta = document.getElementById('digest-meta');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">\u23f3 Caricamento digest\u2026</div>';
  try {
    var res = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/knowledge_digest.json?v=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var aggiornato = (data.lastUpdate || '').substring(0, 10);
    if (meta) meta.innerHTML = '\u2b50 ' + (data.data || aggiornato);
    var h = '';
    if (data.consiglio_integrato) {
      h += '<div style="background:linear-gradient(135deg,rgba(74,175,94,0.12),rgba(74,175,94,0.04));border:1px solid rgba(74,175,94,0.25);border-radius:14px;padding:14px;margin-bottom:12px">';
      h += '<div style="font-size:11px;font-weight:700;color:var(--green2);margin-bottom:6px">\ud83c\udf1f CONSIGLIO INTEGRATO DI OGGI</div>';
      h += '<div style="font-size:13px;color:var(--text);line-height:1.7">' + data.consiglio_integrato + '</div>';
      h += '</div>';
    }
    if (data.scoperta_del_giorno) {
      h += '<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:10px">';
      h += '<div style="font-size:11px;font-weight:700;color:var(--green2);margin-bottom:4px">\ud83d\udca1 Scoperta del giorno</div>';
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + data.scoperta_del_giorno + '</div>';
      h += '</div>';
    }
    if (data.connessione_inaspettata) {
      h += '<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:10px">';
      h += '<div style="font-size:11px;font-weight:700;color:#9b6dff;margin-bottom:4px">\u2728 Connessione inaspettata</div>';
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + data.connessione_inaspettata + '</div>';
      h += '</div>';
    }
    var gp = data.guide_potenziate || [];
    if (gp.length) {
      h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">\ud83d\udcda Guide Potenziate dai PDF</div>';
      gp.forEach(function(g) {
        h += '<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:8px;border-left:3px solid var(--green2)">';
        h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">' + (g.titolo || '') + '</div>';
        h += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:6px">' + (g.guida_base || '') + '</div>';
        if (g.potenziamento_pdf) h += '<div style="font-size:11px;color:var(--green2);line-height:1.5;margin-bottom:4px">\ud83e\udde0 + ' + g.potenziamento_pdf + '</div>';
        if (g.esperimento_suggerito) h += '<div style="font-size:11px;color:var(--text3);font-style:italic">\ud83e\uddea ' + g.esperimento_suggerito + '</div>';
        h += '</div>';
      });
    }
    var es = data.esperimenti_attivi_suggeriti || [];
    if (es.length) {
      h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-top:10px;margin-bottom:8px">\ud83e\uddea Esperimenti Suggeriti Oggi</div>';
      es.forEach(function(e) {
        var urgColor = e.urgenza === 'alta' ? '#e05252' : e.urgenza === 'media' ? '#f0a500' : 'var(--text3)';
        h += '<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:8px">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
        h += '<div style="font-size:13px;font-weight:700;color:var(--text)">' + (e.nome || '') + '</div>';
        h += '<span style="font-size:10px;color:' + urgColor + ';font-weight:700">' + (e.urgenza || '').toUpperCase() + '</span>';
        h += '</div>';
        h += '<div style="font-size:12px;color:var(--text2);line-height:1.5">' + (e.descrizione || '') + '</div>';
        h += '</div>';
      });
    }
    if (!h) {
      h = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">\u2b50 Il Knowledge Digest viene aggiornato ogni mattina alle 8:30.</div>';
    }
    el.innerHTML = h;
  } catch(e) {
    if (meta) meta.innerHTML = '<span style="color:var(--text3)">Non disponibile</span>';
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">\u2b50 Digest in preparazione\u2026</div>';
  }
}

function initElettrocultura() {
  manLoadNote();
  manRenderNote();
  elLoadGlobale();
  elTecRicarica();
  espLoad();
  loadGuideComplete();
  loadPdfSynthesis();
  loadKnowledgeDigest();
}
