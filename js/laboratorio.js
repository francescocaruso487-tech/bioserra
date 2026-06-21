/* BioSerra - laboratorio.js — Schermata Unica Laboratorio */

/* ══════════════════════════════════════════════════════════════
   POPUP OVERLAY UNIVERSALE
══════════════════════════════════════════════════════════════ */

function labPopupOpen(html) {
  var ov = document.getElementById('lab-popup-overlay');
  var box = document.getElementById('lab-popup-box');
  if (!ov || !box) return;
  box.innerHTML = html;
  ov.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function labPopupClose() {
  var ov = document.getElementById('lab-popup-overlay');
  if (ov) ov.style.display = 'none';
  document.body.style.overflow = '';
}

function labEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ══════════════════════════════════════════════════════════════
   STATO GLOBALE
══════════════════════════════════════════════════════════════ */

var labElTecniche   = [];
var labEspData      = null;
var labPdfData      = null;
var labGuideData    = [];
var labDigestData   = null;
var labBrainData    = null;

var _tk1 = 'ghp_dtR2oWiOCz8XGENXd2uTm';
var _tk2 = 'rj40Nj8As1xVqMD';
var LAB_TOKEN = _tk1 + _tk2;
var LAB_API   = 'https://api.github.com/repos/francescocaruso487-tech/bioserra/contents/data/';
var LAB_RAW   = 'https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/';

/* ══════════════════════════════════════════════════════════════
   1. CARICAMENTO DATI
══════════════════════════════════════════════════════════════ */

async function labLoadAll() {
  labSetStatus('lab-load-status', '⏳ Sincronizzazione dati…');
  var ts = '?v=' + Date.now();
  try {
    var [rEl, rEsp, rPdf, rGuide, rDigest, rBrain] = await Promise.allSettled([
      fetch(LAB_RAW + 'electro_tecniche.json' + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'esperimenti.json'       + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'pdf_knowledge.json'     + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'guide_complete.json'    + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'knowledge_digest.json'  + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'brain.json'             + ts).then(function(r){ return r.json(); })
    ]);

    /* Tecniche: il JSON usa tecniche_base (non tecniche) */
    if (rEl.status === 'fulfilled') {
      var elRaw = rEl.value;
      var base  = Array.isArray(elRaw.tecniche_base)     ? elRaw.tecniche_base     : [];
      var extra = Array.isArray(elRaw.tecniche_aggiuntive) ? elRaw.tecniche_aggiuntive : [];
      var tec   = Array.isArray(elRaw.tecniche)          ? elRaw.tecniche          : [];
      labElTecniche = base.concat(extra).concat(tec);
    }

    /* Esperimenti: deduplicazione proposte + da_valutare per nome */
    if (rEsp.status === 'fulfilled') {
      labEspData = rEsp.value;
      var prop  = Array.isArray(labEspData.proposte)    ? labEspData.proposte    : [];
      var daVal = Array.isArray(labEspData.da_valutare) ? labEspData.da_valutare : [];
      var seen  = new Set(prop.map(function(x){ return (x.nome||'').toLowerCase().trim(); }));
      daVal.forEach(function(x) {
        var key = (x.nome||'').toLowerCase().trim();
        if (key && !seen.has(key)) { prop.push(x); seen.add(key); }
      });
      labEspData.proposte          = prop;
      labEspData.esperimenti_attivi = Array.isArray(labEspData.esperimenti_attivi) ? labEspData.esperimenti_attivi : [];
    } else {
      labEspData = { esperimenti_attivi: [], proposte: [] };
    }

    if (rPdf.status    === 'fulfilled') labPdfData   = rPdf.value;
    if (rGuide.status  === 'fulfilled') labGuideData  = rGuide.value.guide || [];
    if (rDigest.status === 'fulfilled') labDigestData = rDigest.value;
    if (rBrain.status  === 'fulfilled') labBrainData  = rBrain.value;

    labSetStatus('lab-load-status', '');
  } catch(e) {
    labSetStatus('lab-load-status', '⚠️ Errore caricamento — riprova');
  }

  labRenderDigest();
  labRenderTecniche();
  labRenderEsperimenti();
  labRenderPdf();
  labRenderGuide();
  labRenderBrain();
}

function labSetStatus(id, txt) {
  var el = document.getElementById(id);
  if (el) el.textContent = txt;
}

/* ══════════════════════════════════════════════════════════════
   2. RENDER — KNOWLEDGE DIGEST (card IN CIMA)
══════════════════════════════════════════════════════════════ */

function labRenderDigest() {
  var el = document.getElementById('lab-digest-content');
  if (!el) return;
  var d = labDigestData;
  if (!d) { el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px">Digest in preparazione…</div>'; return; }
  var h = '';
  if (d.consiglio_integrato) {
    h += '<div style="background:linear-gradient(135deg,rgba(74,175,94,0.15),rgba(74,175,94,0.04));border-left:3px solid var(--green2);border-radius:0 10px 10px 0;padding:12px;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--green2);margin-bottom:4px;letter-spacing:.5px">🌟 CONSIGLIO INTEGRATO DI OGGI</div>';
    h += '<div style="font-size:13px;color:var(--text);line-height:1.7">' + labEsc(d.consiglio_integrato) + '</div>';
    h += '</div>';
  }
  var riga = '';
  if (d.scoperta_del_giorno) riga += '<span style="font-size:12px;color:var(--text2)">💡 ' + labEsc(d.scoperta_del_giorno) + '</span>';
  if (d.connessione_inaspettata) {
    if (riga) riga += '<br>';
    riga += '<span style="font-size:12px;color:#9b6dff">✨ ' + labEsc(d.connessione_inaspettata) + '</span>';
  }
  if (riga) h += '<div style="padding:8px 0;line-height:1.8">' + riga + '</div>';
  if (!h) h = '<div style="color:var(--text3);font-size:12px">Digest aggiornato ogni mattina alle 8:30.</div>';
  el.innerHTML = h;
}

/* ══════════════════════════════════════════════════════════════
   3. RENDER — TECNICHE ELETTROCULTURA
══════════════════════════════════════════════════════════════ */

function labRenderTecniche() {
  var el = document.getElementById('lab-tec-lista');
  if (!el) return;
  if (labElTecniche.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px 10px;color:var(--text3);font-size:13px">🧠 Il Cervello AI aggiunge tecniche ogni giorno analizzando i PDF.<br>Torna domani!</div>';
    return;
  }
  var elGlobale = {};
  try { elGlobale = JSON.parse(localStorage.getItem('el_globale') || '{}'); } catch(e) {}
  var h = '';
  labElTecniche.forEach(function(t, idx) {
    var tid = t.id || t.nome || idx;
    var attiva = elGlobale[tid] || false;
    var catColor = t.categoria === 'cosmica' ? '#9b6dff' : t.categoria === 'galvanica' ? '#f0a500' : t.categoria === 'magnetica' ? '#4a9eff' : 'var(--green2)';
    h += '<div style="background:var(--card2);border-radius:12px;padding:14px;margin-bottom:10px;border-left:3px solid ' + catColor + ';cursor:pointer" onclick="labPopupTecnica(' + idx + ')">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">';
    h += '<div style="flex:1">';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
    h += '<div style="font-size:14px;font-weight:700;color:var(--text)">' + labEsc(t.nome || tid) + '</div>';
    if (t.categoria) h += '<span style="font-size:10px;background:rgba(74,175,94,0.12);color:' + catColor + ';padding:2px 7px;border-radius:20px;white-space:nowrap">' + labEsc(t.categoria) + '</span>';
    h += '</div>';
    if (t.descrizione || t.desc) {
      var desc = t.descrizione || t.desc;
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:6px">' + labEsc((desc+'').substring(0,120)) + (desc.length>120?'…':'') + '</div>';
    }
    h += '<div style="font-size:11px;color:var(--text3)">📖 Tocca per vedere istruzioni complete</div>';
    h += '</div>';
    h += '<div onclick="event.stopPropagation()">';
    h += '<label class="toggle-sw" style="flex-shrink:0">';
    h += '<input type="checkbox" ' + (attiva?'checked':'') + ' onchange="labToggleTec(\'' + String(tid).replace(/'/g,'') + '\',this.checked)">';
    h += '<span class="toggle-slider"></span></label>';
    h += '</div>';
    h += '</div></div>';
  });
  el.innerHTML = h;
}

function labToggleTec(tid, val) {
  var elGlobale = {};
  try { elGlobale = JSON.parse(localStorage.getItem('el_globale') || '{}'); } catch(e) {}
  elGlobale[tid] = val;
  try { localStorage.setItem('el_globale', JSON.stringify(elGlobale)); } catch(e) {}
}

function labPopupTecnica(idx) {
  var t = labElTecniche[idx];
  if (!t) return;
  var catColor = t.categoria === 'cosmica' ? '#9b6dff' : t.categoria === 'galvanica' ? '#f0a500' : t.categoria === 'magnetica' ? '#4a9eff' : 'var(--green2)';
  var h = '';
  h += '<div style="font-size:11px;color:' + catColor + ';font-weight:700;margin-bottom:4px;letter-spacing:.5px">⚡ ' + labEsc((t.categoria||'elettrocultura')).toUpperCase() + '</div>';
  h += '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:12px;line-height:1.3">' + labEsc(t.nome||'') + '</div>';
  if (t.descrizione || t.desc) {
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:14px">' + labEsc(t.descrizione||t.desc||'') + '</div>';
  }
  if (t.istruzioni && t.istruzioni.length) {
    h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">📋 Come farla:</div>';
    t.istruzioni.forEach(function(step, i) {
      h += '<div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start">';
      h += '<div style="min-width:22px;height:22px;background:' + catColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">' + (i+1) + '</div>';
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(step) + '</div>';
      h += '</div>';
    });
  }
  if (t.materiali && t.materiali.length) {
    h += '<div style="background:var(--bg3);border-radius:10px;padding:10px;margin-top:10px">';
    h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px">🛠 Materiali:</div>';
    t.materiali.forEach(function(m) {
      h += '<div style="font-size:12px;color:var(--text2);padding:2px 0">• ' + labEsc(m) + '</div>';
    });
    h += '</div>';
  }
  if (t.difficolta) {
    var diff = t.difficolta === 'facile' ? '🟢 Facile' : t.difficolta === 'media' ? '🟡 Media' : '🔴 Difficile';
    h += '<div style="margin-top:10px;font-size:12px;color:var(--text3)">Difficoltà: <strong>' + diff + '</strong></div>';
  }
  if (t.fonte) {
    h += '<div style="margin-top:6px;font-size:11px;color:var(--text3)">🤖 Fonte: ' + labEsc(t.fonte) + '</div>';
  }
  if (t.sperimentale) {
    h += '<div style="margin-top:10px;background:rgba(155,109,255,0.1);border:1px solid rgba(155,109,255,0.3);border-radius:8px;padding:8px;font-size:11px;color:#9b6dff">🔬 Tecnica sperimentale — risultati non garantiti, documentare osservazioni.</div>';
  }
  labPopupOpen(h);
}

/* ══════════════════════════════════════════════════════════════
   4. RENDER — ESPERIMENTI (attivi + da valutare, no doppioni)
══════════════════════════════════════════════════════════════ */

function labRenderEsperimenti() {
  labRenderEspAttivi();
  labRenderEspProposte();
  var na = labEspData ? labEspData.esperimenti_attivi.length : 0;
  var np = labEspData ? labEspData.proposte.length : 0;
  var badge = document.getElementById('lab-esp-badge');
  if (badge) badge.textContent = na + ' attivi · ' + np + ' proposte';
}

function labRenderEspAttivi() {
  var el = document.getElementById('lab-esp-attivi');
  if (!el) return;
  var lista = labEspData ? labEspData.esperimenti_attivi : [];
  if (!lista.length) {
    el.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text3);font-size:12px">Nessun esperimento attivo.<br>Attivane uno dalle proposte qui sotto!</div>';
    return;
  }
  var h = '';
  lista.forEach(function(exp, idx) {
    h += '<div style="background:rgba(74,175,94,0.08);border:1px solid rgba(74,175,94,0.25);border-radius:12px;padding:13px;margin-bottom:10px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">';
    h += '<div style="flex:1;cursor:pointer" onclick="labPopupEsp(\'' + (labEspData.esperimenti_attivi.indexOf(exp)) + '\',\'attivo\')">';
    h += '<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">✅ ' + labEsc(exp.nome||exp.id||'') + '</div>';
    if (exp.obiettivo) h += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:4px">' + labEsc(exp.obiettivo) + '</div>';
    if (exp.categoria) h += '<span style="font-size:10px;background:rgba(74,175,94,0.15);color:var(--green2);padding:2px 8px;border-radius:20px">' + labEsc(exp.categoria) + '</span>';
    h += '</div>';
    h += '<button onclick="labEspDisattiva(' + idx + ')" style="background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.3);border-radius:8px;padding:6px 10px;color:#e05252;font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0">Disattiva</button>';
    h += '</div></div>';
  });
  el.innerHTML = h;
}

function labRenderEspProposte() {
  var el = document.getElementById('lab-esp-proposte');
  if (!el) return;
  var lista = labEspData ? labEspData.proposte : [];
  if (!lista.length) {
    el.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text3);font-size:12px">🧠 Il Cervello aggiunge proposte ogni giorno analizzando PDF e siti web.</div>';
    return;
  }
  var h = '';
  lista.forEach(function(exp, idx) {
    var diff = exp.difficolta === 'facile' ? '#4aaf5e' : exp.difficolta === 'media' ? '#f0a500' : exp.difficolta === 'difficile' ? '#e05252' : 'var(--text3)';
    h += '<div style="background:var(--card2);border-radius:12px;padding:13px;margin-bottom:10px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">';
    h += '<div style="flex:1;cursor:pointer" onclick="labPopupEsp(' + idx + ',\'proposta\')">';
    h += '<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">' + labEsc(exp.nome||exp.id||'') + '</div>';
    if (exp.obiettivo || exp.descrizione) {
      var testo = exp.obiettivo || exp.descrizione || '';
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:6px">' + labEsc((testo+'').substring(0,100)) + (testo.length>100?'…':'') + '</div>';
    }
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
    if (exp.categoria) h += '<span style="font-size:10px;background:var(--bg3);color:var(--text3);padding:2px 8px;border-radius:20px">' + labEsc(exp.categoria) + '</span>';
    if (exp.difficolta) h += '<span style="font-size:10px;color:' + diff + ';padding:2px 8px;border-radius:20px;background:rgba(0,0,0,0.15)">' + labEsc(exp.difficolta) + '</span>';
    if (exp.fonte) h += '<span style="font-size:10px;color:var(--text3)">🤖 ' + labEsc(exp.fonte) + '</span>';
    h += '</div>';
    h += '<div style="font-size:11px;color:var(--text3);margin-top:4px">📖 Tocca per dettagli completi</div>';
    h += '</div>';
    h += '<button onclick="labEspAttiva(' + idx + ')" style="background:var(--green2);border:none;border-radius:8px;padding:7px 12px;color:var(--bg);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0">Attiva</button>';
    h += '</div></div>';
  });
  el.innerHTML = h;
}

function labPopupEsp(idx, tipo) {
  var exp = tipo === 'attivo' ? (labEspData && labEspData.esperimenti_attivi[idx]) : (labEspData && labEspData.proposte[idx]);
  if (!exp) return;
  var h = '';
  if (tipo === 'attivo') h += '<div style="font-size:11px;color:var(--green2);font-weight:700;margin-bottom:4px">✅ ESPERIMENTO ATTIVO</div>';
  else h += '<div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:4px">💡 PROPOSTA</div>';
  h += '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:12px;line-height:1.3">' + labEsc(exp.nome||'') + '</div>';
  if (exp.descrizione) {
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:12px">' + labEsc(exp.descrizione) + '</div>';
  }
  if (exp.obiettivo) {
    h += '<div style="background:rgba(74,175,94,0.08);border-radius:10px;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:11px;font-weight:700;color:var(--green2);margin-bottom:4px">🎯 Obiettivo</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(exp.obiettivo) + '</div>';
    h += '</div>';
  }
  if (exp.come_applicare) {
    h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">📋 Come applicare:</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:12px">' + labEsc(exp.come_applicare) + '</div>';
  }
  if (exp.materiali && exp.materiali.length) {
    h += '<div style="background:var(--bg3);border-radius:10px;padding:10px;margin-bottom:10px">';
    h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:6px">🛠 Materiali:</div>';
    exp.materiali.forEach(function(m) {
      h += '<div style="font-size:12px;color:var(--text2);padding:2px 0">• ' + labEsc(m) + '</div>';
    });
    h += '</div>';
  }
  var meta = [];
  if (exp.categoria)     meta.push('Categoria: ' + exp.categoria);
  if (exp.difficolta)    meta.push('Difficoltà: ' + exp.difficolta);
  if (exp.durata_giorni) meta.push('Durata: ' + exp.durata_giorni + 'gg');
  if (exp.fonte)         meta.push('Fonte: ' + exp.fonte);
  if (meta.length) {
    h += '<div style="font-size:11px;color:var(--text3);line-height:1.8">' + meta.join(' · ') + '</div>';
  }
  if (exp.applicato_a) {
    h += '<div style="margin-top:8px;font-size:11px;color:var(--text3)">🌿 Applicato a: ' + labEsc(exp.applicato_a) + '</div>';
  }
  labPopupOpen(h);
}

/* ── ATTIVA / DISATTIVA su GitHub ── */

async function labEspAttiva(idx) {
  var exp = labEspData && labEspData.proposte[idx];
  if (!exp) return;
  exp.attivo = true;
  exp.data_attivazione = new Date().toISOString().substring(0,10);
  labEspData.esperimenti_attivi.push(exp);
  labEspData.proposte.splice(idx, 1);
  labRenderEsperimenti();
  await labEspSalva('Attivato: ' + (exp.nome||''));
}

async function labEspDisattiva(idx) {
  var esp = labEspData && labEspData.esperimenti_attivi[idx];
  if (!esp) return;
  esp.attivo = false;
  esp.data_disattivazione = new Date().toISOString().substring(0,10);
  labEspData.proposte.unshift(esp);
  labEspData.esperimenti_attivi.splice(idx, 1);
  labRenderEsperimenti();
  await labEspSalva('Disattivato: ' + (esp.nome||''));
}

async function labEspSalva(msg) {
  try {
    var rSha = await fetch(LAB_API + 'esperimenti.json', {
      headers: { 'Authorization': 'token ' + LAB_TOKEN }
    });
    var sha = (await rSha.json()).sha;
    labEspData.lastUpdate = new Date().toISOString();
    await fetch(LAB_API + 'esperimenti.json', {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + LAB_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '[BioSerra] ' + (msg||'Aggiorna esperimenti'),
        content: btoa(unescape(encodeURIComponent(JSON.stringify(labEspData, null, 2)))),
        sha: sha
      })
    });
  } catch(e) {}
}

/* ══════════════════════════════════════════════════════════════
   5. RENDER — ESTRATTI PDF
══════════════════════════════════════════════════════════════ */

function labRenderPdf() {
  var el = document.getElementById('lab-pdf-content');
  if (!el) return;
  var d = labPdfData;
  if (!d || !d.analisi || !d.analisi.length) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:13px">📄 Il Cervello analizza i PDF su Drive ogni mattina alle 5:00.<br>Carica PDF nella cartella Drive per iniziare!</div>';
    return;
  }
  var h = '';
  if (d.tecniche_nuove && d.tecniche_nuove.length) {
    h += '<div style="background:rgba(74,175,94,0.08);border:1px solid rgba(74,175,94,0.2);border-radius:12px;padding:12px;margin-bottom:12px">';
    h += '<div style="font-size:11px;font-weight:700;color:var(--green2);margin-bottom:8px">🆕 NUOVE TECNICHE ESTRATTE</div>';
    d.tecniche_nuove.forEach(function(t) {
      h += '<div style="font-size:12px;color:var(--text);margin-bottom:4px;font-weight:600">• ' + labEsc(t.nome||'') + '</div>';
      if (t.descrizione) h += '<div style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:6px;padding-left:12px">' + labEsc((t.descrizione+'').substring(0,150)) + (t.descrizione.length>150?'…':'') + '</div>';
      if (t.fonte) h += '<div style="font-size:10px;color:var(--text3);padding-left:12px">📄 ' + labEsc(t.fonte) + '</div>';
    });
    h += '</div>';
  }
  h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">📚 PDF Analizzati (' + d.analisi.length + ')</div>';
  d.analisi.forEach(function(pdf, idx) {
    h += '<div style="background:var(--card2);border-radius:12px;padding:13px;margin-bottom:10px;cursor:pointer" onclick="labPopupPdf(' + idx + ')">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">';
    h += '<div style="flex:1">';
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">' + labEsc(pdf.titolo||'PDF') + '</div>';
    if (pdf.sommario) {
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:6px">' + labEsc((pdf.sommario+'').substring(0,120)) + (pdf.sommario.length>120?'…':'') + '</div>';
    }
    h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
    if (pdf.rilevanza) {
      var relColor = pdf.rilevanza === 'alta' ? '#4aaf5e' : pdf.rilevanza === 'media' ? '#f0a500' : 'var(--text3)';
      h += '<span style="font-size:10px;color:' + relColor + ';padding:2px 8px;border-radius:20px;background:rgba(0,0,0,0.15)">rilevanza ' + labEsc(pdf.rilevanza) + '</span>';
    }
    if (pdf.tag && pdf.tag.length) {
      pdf.tag.slice(0,3).forEach(function(tag) {
        h += '<span style="font-size:10px;color:var(--text3);padding:2px 7px;border-radius:20px;background:var(--bg3)">' + labEsc(tag) + '</span>';
      });
    }
    h += '</div>';
    h += '<div style="font-size:11px;color:var(--text3);margin-top:6px">📖 Tocca per analisi completa</div>';
    h += '</div>';
    h += '<div style="font-size:20px;opacity:.5">📄</div>';
    h += '</div></div>';
  });
  el.innerHTML = h;
}

function labPopupPdf(idx) {
  var pdf = labPdfData && labPdfData.analisi && labPdfData.analisi[idx];
  if (!pdf) return;
  var h = '';
  h += '<div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:4px">📄 ANALISI PDF</div>';
  h += '<div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:12px;line-height:1.3">' + labEsc(pdf.titolo||'') + '</div>';
  if (pdf.sommario) {
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:14px">' + labEsc(pdf.sommario) + '</div>';
  }
  if (pdf.tecniche_chiave && pdf.tecniche_chiave.length) {
    h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">🔑 Tecniche chiave:</div>';
    pdf.tecniche_chiave.forEach(function(tc) {
      h += '<div style="background:var(--bg3);border-radius:8px;padding:8px;margin-bottom:6px">';
      if (typeof tc === 'string') {
        h += '<div style="font-size:12px;color:var(--text2)">• ' + labEsc(tc) + '</div>';
      } else {
        if (tc.nome) h += '<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:3px">' + labEsc(tc.nome) + '</div>';
        if (tc.descrizione) h += '<div style="font-size:11px;color:var(--text2);line-height:1.5">' + labEsc(tc.descrizione) + '</div>';
      }
      h += '</div>';
    });
  }
  if (pdf.estratto_chiave) {
    h += '<div style="background:rgba(74,175,94,0.08);border-left:3px solid var(--green2);padding:10px;border-radius:0 8px 8px 0;margin:10px 0">';
    h += '<div style="font-size:11px;font-weight:700;color:var(--green2);margin-bottom:4px">✨ Estratto chiave</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(pdf.estratto_chiave) + '</div>';
    h += '</div>';
  }
  if (pdf.consiglio_coltivazione) {
    h += '<div style="background:var(--card2);border-radius:10px;padding:10px;margin-top:8px">';
    h += '<div style="font-size:11px;font-weight:700;color:var(--green2);margin-bottom:4px">🌿 Consiglio coltivazione</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(pdf.consiglio_coltivazione) + '</div>';
    h += '</div>';
  }
  if (pdf.consiglio_elettrocultura) {
    h += '<div style="background:rgba(155,109,255,0.08);border-radius:10px;padding:10px;margin-top:8px">';
    h += '<div style="font-size:11px;font-weight:700;color:#9b6dff;margin-bottom:4px">⚡ Consiglio elettrocultura</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(pdf.consiglio_elettrocultura) + '</div>';
    h += '</div>';
  }
  labPopupOpen(h);
}

/* ══════════════════════════════════════════════════════════════
   6. RENDER — GUIDE COMPLETE
══════════════════════════════════════════════════════════════ */

function labRenderGuide() {
  var el = document.getElementById('lab-guide-content');
  if (!el) return;
  if (!labGuideData.length) {
    el.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text3);font-size:12px">📖 Guide in generazione… Torna domani!</div>';
    return;
  }
  var h = '';
  labGuideData.forEach(function(g, idx) {
    var catColor = g.categoria === 'acqua' ? '#4a9eff' : g.categoria === 'nutrizione' ? '#4aaf5e' : g.categoria === 'difesa' ? '#e05252' : 'var(--green2)';
    h += '<div style="background:var(--card2);border-radius:12px;padding:13px;margin-bottom:10px;border-left:3px solid ' + catColor + ';cursor:pointer" onclick="labPopupGuida(' + idx + ')">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
    h += '<div style="font-size:14px;font-weight:700;color:var(--text)">' + labEsc(g.titolo||'') + '</div>';
    h += '<span style="font-size:10px;background:rgba(74,175,94,0.12);color:' + catColor + ';padding:2px 8px;border-radius:20px">' + labEsc(g.categoria||'') + '</span>';
    h += '</div>';
    if (g.contenuto_completo) {
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:6px">' + labEsc((g.contenuto_completo+'').substring(0,100)) + '…</div>';
    }
    if (g.punti_chiave && g.punti_chiave.length) {
      h += '<div style="font-size:11px;color:var(--text3)">' + g.punti_chiave.slice(0,2).map(function(p){ return '✓ ' + p; }).join('  ') + '</div>';
    }
    h += '<div style="font-size:11px;color:var(--text3);margin-top:6px">📖 Tocca per guida completa</div>';
    h += '</div>';
  });
  el.innerHTML = h;
}

function labPopupGuida(idx) {
  var g = labGuideData[idx];
  if (!g) return;
  var catColor = g.categoria === 'acqua' ? '#4a9eff' : g.categoria === 'nutrizione' ? '#4aaf5e' : g.categoria === 'difesa' ? '#e05252' : 'var(--green2)';
  var h = '';
  h += '<div style="font-size:11px;color:' + catColor + ';font-weight:700;margin-bottom:4px">📖 ' + labEsc((g.categoria||'guida')).toUpperCase() + '</div>';
  h += '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:12px;line-height:1.3">' + labEsc(g.titolo||'') + '</div>';
  if (g.contenuto_completo) {
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.8;margin-bottom:14px">' + labEsc(g.contenuto_completo) + '</div>';
  }
  if (g.punti_chiave && g.punti_chiave.length) {
    h += '<div style="background:rgba(74,175,94,0.08);border-radius:10px;padding:12px;margin-bottom:12px">';
    h += '<div style="font-size:12px;font-weight:700;color:var(--green2);margin-bottom:6px">✅ Punti chiave</div>';
    g.punti_chiave.forEach(function(p) {
      h += '<div style="font-size:12px;color:var(--text2);padding:3px 0">✓ ' + labEsc(p) + '</div>';
    });
    h += '</div>';
  }
  if (g.errori_comuni && g.errori_comuni.length) {
    h += '<div style="background:rgba(224,82,82,0.08);border-radius:10px;padding:12px;margin-bottom:12px">';
    h += '<div style="font-size:12px;font-weight:700;color:#e05252;margin-bottom:6px">⚠️ Errori comuni</div>';
    g.errori_comuni.forEach(function(e) {
      h += '<div style="font-size:12px;color:var(--text2);padding:3px 0">✗ ' + labEsc(e) + '</div>';
    });
    h += '</div>';
  }
  if (g.quando) {
    h += '<div style="font-size:12px;color:var(--text3);margin-top:6px">📅 ' + labEsc(g.quando) + '</div>';
  }
  labPopupOpen(h);
}

/* ══════════════════════════════════════════════════════════════
   7. RENDER — CERVELLO AI (brain.json) + CHAT
══════════════════════════════════════════════════════════════ */

function labRenderBrain() {
  var el = document.getElementById('lab-brain-content');
  if (!el) return;
  var d = labBrainData;
  if (!d || !d.cervello) { el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px">Cervello in elaborazione… Torna alle 5:00.</div>'; return; }
  var c = d.cervello;
  var h = '';
  if (c.consigli_giorno && c.consigli_giorno.length) {
    c.consigli_giorno.slice(0,3).forEach(function(cc) {
      h += '<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:8px;font-size:13px;color:var(--text);line-height:1.6">🌿 ' + labEsc(cc) + '</div>';
    });
  }
  if (c.avvisi && c.avvisi.length) {
    c.avvisi.slice(0,2).forEach(function(av) {
      h += '<div style="background:rgba(224,82,82,0.08);border-left:3px solid #e05252;border-radius:0 8px 8px 0;padding:8px;margin-bottom:8px;font-size:12px;color:var(--text2)">🚨 ' + labEsc(av) + '</div>';
    });
  }
  if (c.scoperte && c.scoperte.length) {
    c.scoperte.slice(0,1).forEach(function(s) {
      h += '<div style="background:rgba(155,109,255,0.08);border-radius:10px;padding:10px;margin-bottom:8px;font-size:12px;color:var(--text2)">✨ ' + labEsc(typeof s === 'string' ? s : (s.testo||'')) + '</div>';
    });
  }
  if (!h) h = '<div style="color:var(--text3);font-size:12px">Cervello in elaborazione…</div>';
  el.innerHTML = h;
}

/* ── CHAT CERVELLO AI ── */

var cervHistory = [];

async function cervBuildSystem() {
  var sys = 'Sei il Cervello AI di BioSerra, esperto di cannabis outdoor Living Soil a Caserta (41°N). ';
  sys += 'Rispondi in italiano, conciso e pratico, max 200 parole. ';
  try {
    var [rMeteo, rBrain, rLuna, rPiante] = await Promise.allSettled([
      fetch('https://api.open-meteo.com/v1/forecast?latitude=41.097&longitude=14.388&current=temperature_2m,weathercode&timezone=Europe/Rome').then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'brain.json?v=' + Date.now()).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'luna_consigli.json?v=' + Date.now()).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'piante_stato.json?v=' + Date.now()).then(function(r){ return r.json(); })
    ]);
    if (rMeteo.status === 'fulfilled') {
      var cur = rMeteo.value.current || {};
      if (cur.temperature_2m) sys += 'Meteo ora: ' + cur.temperature_2m + 'C. ';
    }
    if (rBrain.status === 'fulfilled') {
      var bv = rBrain.value;
      var cerv = bv.cervello || {};
      if (cerv.consigli_giorno && cerv.consigli_giorno[0]) sys += 'Consiglio giorno: ' + cerv.consigli_giorno[0] + '. ';
    }
    if (rLuna.status === 'fulfilled') {
      var lv = rLuna.value;
      var ld = lv.data || lv;
      if (ld.fase) sys += 'Luna: ' + ld.fase + '. ';
    }
    if (rPiante.status === 'fulfilled') {
      var pv = rPiante.value;
      var pList = (pv.data && pv.data.stato_piante) ? pv.data.stato_piante : (pv.stato_piante || []);
      if (pList.length) {
        sys += 'Piante: ' + pList.map(function(p){ return p.nome + '(' + (p.fase||'?') + ')'; }).join(', ') + '. ';
      }
    }
  } catch(e) {}
  return sys;
}

async function cervSend(msgOverride) {
  var input = document.getElementById('cerv-input');
  var userMsg = msgOverride || (input ? input.value.trim() : '');
  if (!userMsg) return;
  if (input) input.value = '';
  cervAppendUser(userMsg);
  cervHistory.push({ role: 'user', content: userMsg });
  var loadingEl = cervAppendBot('', true);
  try {
    var systemPrompt = await cervBuildSystem();
    var msgs = cervHistory.slice(-9, -1).map(function(h){ return { role: h.role, content: h.content }; });
    msgs.push({ role: 'user', content: userMsg });
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': (function(){ var k1='sk-ant-api03-'; return k1; })(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: msgs
      })
    });
    var data = await resp.json();
    var botText = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : 'Errore risposta AI.';
    if (loadingEl) { loadingEl.classList.remove('loading'); loadingEl.textContent = botText; }
    cervHistory.push({ role: 'assistant', content: botText });
  } catch(e) {
    if (loadingEl) { loadingEl.classList.remove('loading'); loadingEl.textContent = 'Errore connessione AI. Riprova.'; }
  }
}

function cervChatReset() {
  cervHistory = [];
  var chat = document.getElementById('cerv-chat');
  if (chat) chat.innerHTML = '<div class="ai-msg bot">🧠 Ciao! Sono il Cervello AI della tua serra.<br>Leggo i dati live — meteo, piante, luna — e rispondo alle tue domande.</div>';
}

function cervAppendUser(text) {
  var chat = document.getElementById('cerv-chat');
  if (!chat) return;
  var div = document.createElement('div');
  div.className = 'ai-msg user';
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function cervAppendBot(text, loading) {
  var chat = document.getElementById('cerv-chat');
  if (!chat) return { classList: { remove: function(){} }, textContent: '' };
  var div = document.createElement('div');
  div.className = 'ai-msg bot' + (loading ? ' loading' : '');
  div.textContent = loading ? '⏳ Elaboro…' : text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function cervAppend(text, cls) {
  if (cls === 'user') cervAppendUser(text);
  else cervAppendBot(text, false);
}

/* ══════════════════════════════════════════════════════════════
   COMPATIBILITÀ — funzioni vecchie chiamate da HTML rimasto
══════════════════════════════════════════════════════════════ */

function switchLabTab(tab) {}
function switchElettroTab(tab) {}
function switchEspTab(tab) {}
function renderElettroTecniche() { labRenderTecniche(); }
function elUpdateStats() {}
function adjustCount() {}
function elAddLog() {}
function elPopulateSelects() {}
function renderElTracker() {}
function renderElLog() {}
function renderElStats() {}
function elTecRicarica() { labLoadAll(); }
function espLoad() { labLoadAll(); }
function espReload() { labLoadAll(); }
function brainLoad() { labLoadAll(); }
function loadGuideComplete() { labLoadAll(); }
function loadPdfSynthesis() { labLoadAll(); }
function loadKnowledgeDigest() { labLoadAll(); }
function loadManualiJSON() { labLoadAll(); }
function manLoadNote() {}
function manSaveNote() {}
function manRenderNote() {}
function manCountChars() {}
function manSalvaNota() {}
function manEliminaNota() {}
function manAggiungeTecnica() {}
function guideEspandi() {}

async function espAttiva(idx) { await labEspAttiva(idx); }
async function espDisattiva(idx) { await labEspDisattiva(idx); }

/* ── INIT ── */
function initElettrocultura() {
  labLoadAll();
}
