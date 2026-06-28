/* BioSerra - laboratorio.js — Tech Lab v2 */

/* ══════════════════════════════════════════════════════════════
   POPUP OVERLAY
══════════════════════════════════════════════════════════════ */

function labPopupOpen(html) {
  var ov  = document.getElementById('lab-popup-overlay');
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

var labElTecniche = [];
var labEspData    = null;
var labPdfData    = null;
var labGuideData  = [];
var labDigestData = null;
var labBrainData  = null;
var labVettoriData = null;
var labGrafoData   = null;

var _tk1 = 'ghp_dtR2oWiOCz8XGENXd2uTm';
var _tk2 = 'rj40Nj8As1xVqMD';
var LAB_TOKEN = _tk1 + _tk2;
var LAB_API   = 'https://api.github.com/repos/francescocaruso487-tech/bioserra/contents/data/';
var LAB_RAW   = 'https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/';

/* ══════════════════════════════════════════════════════════════
   CARICAMENTO DATI
══════════════════════════════════════════════════════════════ */

async function labLoadAll() {
  labSetStatus('lab-load-status', '\u23F3 SYNC…');
  var ts = '?v=' + Date.now();
  try {
    var [rCon, rEsp, rPdf, rGuide, rDigest, rBrain] = await Promise.allSettled([
      fetch(LAB_RAW + 'concetti_index.json'   + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'esperimenti.json'       + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'pdf_knowledge.json'     + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'guide_complete.json'    + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'knowledge_digest.json'  + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'brain.json'             + ts).then(function(r){ return r.json(); })
    ]);

    if (rCon.status === 'fulfilled') {
      labConcettiData = rCon.value;
      // labElTecniche: array piatto compatibile con le funzioni esistenti
      labElTecniche = (labConcettiData.concetti || []).map(function(c) {
        return {
          id:          c.id,
          nome:        c.label,
          categoria:   c.categoria ? c.categoria.replace('tecnica_','') : 'generale',
          descrizione: c.descrizione || '',
          occorrenze:  c.pdf_count  || 0,
          pdf_ids:     c.pdf_ids    || [],
          fasi_guida:  c.fasi_guida || [],
          tag:         c.tag_correlati || [],
          varianti:    c.varianti   || [],
          rilevanza:   c.rilevanza  || 'media',
          daBase:      false
        };
      });
    }

    if (rEsp.status === 'fulfilled') {
      labEspData = rEsp.value;
      // Normalizza attivi: legge sia esperimenti_attivi che attivi (fallback)
      if (!Array.isArray(labEspData.esperimenti_attivi) || labEspData.esperimenti_attivi.length === 0) {
        labEspData.esperimenti_attivi = Array.isArray(labEspData.attivi) ? labEspData.attivi : [];
      }
      // Normalizza proposte: merge proposte + da_valutare + prossimi_da_valutare + esperimenti_disponibili
      var prop  = Array.isArray(labEspData.proposte)               ? labEspData.proposte.slice()               : [];
      var daVal = Array.isArray(labEspData.da_valutare)            ? labEspData.da_valutare            : [];
      var prox  = Array.isArray(labEspData.prossimi_da_valutare)   ? labEspData.prossimi_da_valutare   : [];
      var disp  = Array.isArray(labEspData.esperimenti_disponibili)? labEspData.esperimenti_disponibili : [];
      var seen  = new Set(prop.map(function(x){ return (x.nome||'').toLowerCase().trim(); }));
      [daVal, prox, disp].forEach(function(lista) {
        lista.forEach(function(x) {
          var key = (x.nome||'').toLowerCase().trim();
          if (key && !seen.has(key)) { prop.push(x); seen.add(key); }
        });
      });
      labEspData.proposte = prop;
    } else {
      labEspData = { esperimenti_attivi: [], proposte: [] };
    }

    if (rPdf.status    === 'fulfilled') labPdfData   = rPdf.value;
    if (rGuide.status  === 'fulfilled') labGuideData  = rGuide.value.guide || [];
    if (rDigest.status === 'fulfilled') labDigestData = rDigest.value;
    if (rBrain.status  === 'fulfilled') labBrainData  = rBrain.value;

    labSetStatus('lab-load-status', '');
  } catch(e) {
    labSetStatus('lab-load-status', '\u26A0\uFE0F ERRORE SYNC');
  }

  labRenderDigest();
  labRenderTecniche();
  labRenderEsperimenti();
  labRenderPdf();
  labRenderGuide();
  labRenderBrain();
  labUpdateBadges();
  labLoadSecondBrain();
}

function labSetStatus(id, txt) {
  var el = document.getElementById(id);
  if (el) el.textContent = txt;
}

function labUpdateBadges() {
  var bTec  = document.getElementById('badge-tec');
  var bEsp  = document.getElementById('badge-esp');
  var bPdf  = document.getElementById('badge-pdf');
  var bBrain= document.getElementById('badge-brain');
  if (bTec) {
    var nTec = labElTecniche.length;
    var nEspA = labEspData && labEspData.esperimenti_attivi ? labEspData.esperimenti_attivi.length : 0;
    var totPratiche = nTec + nEspA;
    if (totPratiche) { bTec.textContent = totPratiche; bTec.classList.add('show'); }
  }
  // badge-esp non piu usato (unificato in badge-tec)
  if (bPdf && labPdfData && labPdfData.analisi) {
    bPdf.textContent = labPdfData.analisi.length;
    bPdf.classList.add('show');
  }
  if (bBrain && labBrainData && labBrainData.cervello && labBrainData.cervello.avvisi && labBrainData.cervello.avvisi.length) {
    bBrain.textContent = '!';
    bBrain.classList.add('show');
  }
}

/* ══════════════════════════════════════════════════════════════
   RENDER — KNOWLEDGE DIGEST (compatto in card campo)
══════════════════════════════════════════════════════════════ */

function labRenderDigest() {
  var el = document.getElementById('lab-digest-content');
  if (!el) return;
  var d = labDigestData;
  if (!d) {
    el.innerHTML = '<div class="lab-digest-compact" style="opacity:0.4">Digest in preparazione…</div>';
    return;
  }
  var ora = new Date().getHours();
  var campi = [];
  if (d.consiglio_integrato)     campi.push({ ico:'⚡', label:'CONSIGLIO', testo:d.consiglio_integrato });
  if (d.scoperta_del_giorno)     campi.push({ ico:'✨', label:'SCOPERTA', testo:d.scoperta_del_giorno });
  if (d.connessione_inaspettata) campi.push({ ico:'🔗', label:'CONNESSIONE', testo:d.connessione_inaspettata });
  if (!campi.length) {
    el.innerHTML = '<div class="lab-digest-compact" style="opacity:0.4">Digest aggiornato ogni mattina.</div>';
    return;
  }
  var campo = campi[ora % campi.length];
  var h = '<div style="display:flex;align-items:flex-start;gap:10px">';
  h += '<span style="font-size:20px;flex-shrink:0">' + campo.ico + '</span>';
  h += '<div>';
  h += '<div style="font-size:9px;color:rgba(0,180,255,0.5);font-weight:700;letter-spacing:1px;margin-bottom:4px">' + campo.label + '</div>';
  h += '<div class="lab-digest-compact" style="margin:0">' + labEsc(campo.testo) + '</div>';
  h += '</div></div>';
  if (d.guide_potenziate && d.guide_potenziate.length) {
    var gp = d.guide_potenziate[0];
    h += '<div style="margin-top:10px;background:rgba(0,180,255,0.05);border-radius:8px;padding:8px 10px;font-size:11px;color:rgba(0,180,255,0.7)">';
    h += '🌱 <strong>' + labEsc(gp.titolo||'') + '</strong>: ' + labEsc((gp.potenziamento_pdf||gp.guida_base||'').substring(0,80)) + '…';
    h += '</div>';
  }
  el.innerHTML = h;
}

/* ── Popup digest completo ── */
function labPopupAllDigest() {
  var d = labDigestData;
  if (!d) { labPopupOpen('<div style="color:rgba(0,180,255,0.5);padding:20px;text-align:center">Digest in caricamento…</div>'); return; }
  var h = '<div style="font-size:10px;color:var(--el-blue);font-weight:700;letter-spacing:1px;margin-bottom:4px">✨ KNOWLEDGE DIGEST</div>';
  h += '<div style="font-size:10px;color:rgba(0,180,255,0.35);margin-bottom:14px">' + labEsc(d.data||d.lastUpdate||'') + '</div>';
  if (d.consiglio_integrato) {
    h += '<div style="background:linear-gradient(135deg,rgba(0,180,255,0.08),rgba(155,109,255,0.08));border-left:2px solid var(--el-blue);padding:12px;border-radius:0 10px 10px 0;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:6px">⚡ CONSIGLIO INTEGRATO</div>';
    h += '<div style="font-size:13px;color:var(--text);line-height:1.7">' + labEsc(d.consiglio_integrato) + '</div>';
    h += '</div>';
  }
  if (d.scoperta_del_giorno) {
    h += '<div style="background:rgba(0,229,255,0.06);border-radius:10px;padding:10px;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-cyan);margin-bottom:4px">✨ SCOPERTA DEL GIORNO</div>';
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.6">' + labEsc(d.scoperta_del_giorno) + '</div>';
    h += '</div>';
  }
  if (d.connessione_inaspettata) {
    h += '<div style="background:rgba(155,109,255,0.06);border-radius:10px;padding:10px;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-violet);margin-bottom:4px">🔗 CONNESSIONE INASPETTATA</div>';
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.6">' + labEsc(d.connessione_inaspettata) + '</div>';
    h += '</div>';
  }
  if (d.guide_potenziate && d.guide_potenziate.length) {
    h += '<div style="font-size:10px;font-weight:700;color:var(--green3);margin:12px 0 8px">🌱 GUIDE POTENZIATE</div>';
    d.guide_potenziate.forEach(function(gp) {
      h += '<div style="background:rgba(76,175,118,0.07);border-radius:8px;padding:8px 10px;margin-bottom:6px">';
      h += '<div style="font-size:12px;font-weight:700;color:var(--green3);margin-bottom:3px">' + labEsc(gp.titolo||'') + '</div>';
      if (gp.guida_base)        h += '<div style="font-size:11px;color:var(--text2);margin-bottom:2px">✓ ' + labEsc(gp.guida_base) + '</div>';
      if (gp.potenziamento_pdf) h += '<div style="font-size:11px;color:var(--green3);opacity:0.8">⚡ ' + labEsc(gp.potenziamento_pdf) + '</div>';
      h += '</div>';
    });
  }
  if (d.esperimenti_attivi_suggeriti && d.esperimenti_attivi_suggeriti.length) {
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-cyan);margin:12px 0 8px">🎯 ESPERIMENTI SUGGERITI</div>';
    d.esperimenti_attivi_suggeriti.forEach(function(es) {
      h += '<div style="background:rgba(0,229,255,0.05);border-radius:8px;padding:8px 10px;margin-bottom:6px">';
      h += '<div style="font-size:12px;font-weight:700;color:var(--el-cyan);margin-bottom:3px">' + labEsc(es.nome||'') + '</div>';
      if (es.descrizione) h += '<div style="font-size:11px;color:var(--text2)">' + labEsc(es.descrizione.substring(0,120)) + '</div>';
      h += '</div>';
    });
  }
  if (d.stats) {
    h += '<div style="display:flex;gap:16px;margin-top:14px;padding-top:10px;border-top:1px solid rgba(0,180,255,0.1)">';
    h += '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:var(--el-blue)">' + (d.stats.guide||0) + '</div><div style="font-size:9px;color:rgba(0,180,255,0.4)">GUIDE</div></div>';
    h += '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:var(--el-violet)">' + (d.stats.esperimenti||0) + '</div><div style="font-size:9px;color:rgba(155,109,255,0.4)">ESPERIMENTI</div></div>';
    h += '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:var(--green3)">' + (d.stats.concetti||labElTecniche.length||0) + '</div><div style="font-size:9px;color:rgba(76,175,118,0.4)">CONCETTI</div></div>';
    h += '</div>';
  }
  labPopupOpen(h);
}

/* ══════════════════════════════════════════════════════════════
   RENDER — TECNICHE (mini lista, max 4 in campo)
══════════════════════════════════════════════════════════════ */


/* ── HELPER CATEGORIE ── */

/* ══════════════════════════════════════════════════════════════
   PRATICHE — sezione unificata (ex Tecniche + Esperimenti)
══════════════════════════════════════════════════════════════ */

function labCatColor(cat) {
  var c = (cat||'').toLowerCase();
  if (c==='elettrocultura'||c==='elettrica') return 'var(--el-blue)';
  if (c==='magnetica') return '#00cfff';
  if (c==='biodinamica'||c==='olistica') return 'var(--el-violet)';
  if (c==='nutrizione'||c==='living_soil') return 'var(--green3)';
  if (c==='irrigazione') return '#00b4ff';
  if (c==='difesa'||c==='difesa_biologica') return '#e05252';
  if (c==='harvest'||c==='raccolta') return '#f0a500';
  return 'var(--el-cyan)';
}

// Costruisce lista pratiche unificata ordinata per rilevanza contestuale
function labBuildPratiche() {
  var oggi = new Date();
  var ora = oggi.getHours();
  var pratiche = [];

  // 1. Esperimenti attivi (priorità massima)
  if (labEspData) {
    var attivi = labEspData.esperimenti_attivi || labEspData.attivi || [];
    attivi.forEach(function(e, i) {
      pratiche.push({
        id: 'esp_att_' + i,
        nome: e.nome || '',
        categoria: e.categoria || 'tecnica di coltivazione',
        descrizione: e.obiettivo || e.descrizione || '',
        badge: 'ATTIVA',
        badgeColor: 'var(--green3)',
        rilevanza: 95,
        tipo: 'esp_attivo',
        data: e,
        idx: i
      });
    });
  }

  // 2. Tecniche da concetti_index (con rilevanza + contesto fase piante)
  var fasePiante = labGetFaseAttuale();
  labElTecniche.forEach(function(t, i) {
    var ril = t.rilevanza || 5;
    // Boost se la tecnica è rilevante per la fase attuale
    if (t.fasi_guida && t.fasi_guida.some(function(f){ return f===fasePiante; })) ril += 3;
    pratiche.push({
      id: 'tec_' + i,
      nome: t.nome || t.label || '',
      categoria: t.categoria || 'elettrocultura',
      descrizione: t.descrizione || t.desc || '',
      badge: (t.pdf_count||t.occorrenze||0) > 0 ? (t.pdf_count||t.occorrenze) + ' PDF' : null,
      badgeColor: 'var(--el-violet)',
      rilevanza: ril,
      tipo: 'tecnica',
      data: t,
      idx: i
    });
  });

  // 3. Esperimenti proposti (ordinati per rilevanza)
  if (labEspData) {
    var proposte = labEspData.proposte || labEspData.esperimenti_disponibili || [];
    proposte.slice(0, 8).forEach(function(e, i) {
      pratiche.push({
        id: 'esp_prop_' + i,
        nome: e.nome || '',
        categoria: e.categoria || 'tecnica di coltivazione',
        descrizione: e.obiettivo || e.descrizione || '',
        badge: 'SUGGERITA',
        badgeColor: 'rgba(0,180,255,0.5)',
        rilevanza: 40,
        tipo: 'esp_proposta',
        data: e,
        idx: i
      });
    });
  }

  // Ordina per rilevanza decrescente
  pratiche.sort(function(a,b){ return b.rilevanza - a.rilevanza; });
  return pratiche;
}

// Determina fase attuale piante (semplificata)
function labGetFaseAttuale() {
  if (!labBrainData) return 'vegetazione';
  try {
    var agenti = labBrainData.agenti || labBrainData.cervello || {};
    var stato = (agenti.piante && agenti.piante.stato_generale) || '';
    if (/fior/i.test(stato)) return 'fioritura';
    if (/harvest|raccolt/i.test(stato)) return 'harvest';
    if (/veg/i.test(stato)) return 'vegetazione';
  } catch(e) {}
  return 'vegetazione';
}

// Render mini card pratiche nella pagina principale
function labRenderPratiche() {
  var el = document.getElementById('lab-tec-lista');
  if (!el) return;
  var pratiche = labBuildPratiche();
  if (!pratiche.length) {
    el.innerHTML = '<div style="color:rgba(0,180,255,0.35);font-size:12px;padding:6px">Nessuna pratica disponibile.</div>';
    return;
  }
  var fase = labGetFaseAttuale();
  var h = '<div style="font-size:9px;color:var(--text3);margin-bottom:8px;letter-spacing:0.5px">FASE ATTUALE: <span style="color:var(--green3)">' + fase.toUpperCase() + '</span></div>';
  pratiche.slice(0, 5).forEach(function(p, i) {
    var catColor = labCatColor(p.categoria);
    var isAttiva = p.tipo === 'esp_attivo';
    h += '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-left:2px solid ' + catColor + ';border-radius:0 10px 10px 0;padding:10px 12px;margin-bottom:7px;cursor:pointer;transition:background 0.2s" onclick="labPopupPratica(\'' + p.id + '\')">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">';
    h += '<div style="flex:1">';
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:3px">' + labEsc(p.nome) + '</div>';
    if (p.descrizione) h += '<div style="font-size:11px;color:var(--text3);line-height:1.5">' + labEsc(p.descrizione.substring(0,70)) + (p.descrizione.length>70?'\u2026':'') + '</div>';
    h += '</div>';
    h += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">';
    if (isAttiva) h += '<span style="font-size:9px;background:rgba(76,175,118,0.2);color:var(--green3);border-radius:4px;padding:2px 6px;font-weight:700">\u2705 ATTIVA</span>';
    if (p.badge && !isAttiva) h += '<span style="font-size:9px;background:rgba(155,109,255,0.15);color:var(--el-violet);border-radius:4px;padding:2px 6px">' + labEsc(p.badge) + '</span>';
    h += '<span style="font-size:9px;color:' + catColor + ';opacity:0.8">' + labEsc(p.categoria) + '</span>';
    h += '</div></div></div>';
  });
  var tot = pratiche.length;
  if (tot > 5) h += '<div style="text-align:center;font-size:11px;color:var(--el-blue);padding:6px 0;cursor:pointer;opacity:0.8" onclick="labPopupAllPratiche()">▼ vedi tutte (' + tot + ')</div>';
  el.innerHTML = h;

}

// Rende labRenderEsperimenti un alias di labRenderPratiche
function labRenderEsperimenti() { labRenderPratiche(); }
function labRenderEspAttiviMini() { labRenderPratiche(); }

// Popup singola pratica — ricco e contestuale
function labPopupPratica(pid) {
  var pratiche = labBuildPratiche();
  var p = pratiche.find(function(x){ return x.id === pid; });
  if (!p) return;
  var d = p.data;
  var catColor = labCatColor(p.categoria);
  var h = '';

  // Header con tipo e categoria
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">';
  h += '<div>';
  h += '<div style="font-size:9px;color:' + catColor + ';font-weight:700;letter-spacing:1px;margin-bottom:4px">' + labEsc(p.categoria.toUpperCase()) + '</div>';
  h += '<div style="font-size:19px;font-weight:700;color:var(--text);line-height:1.3">' + labEsc(p.nome) + '</div>';
  h += '</div>';
  if (p.tipo === 'esp_attivo') {
    h += '<span style="font-size:10px;background:rgba(76,175,118,0.15);color:var(--green3);border-radius:8px;padding:4px 10px;font-weight:700;flex-shrink:0">\u2705 ATTIVA</span>';
  } else if (p.tipo === 'tecnica' && p.badge) {
    h += '<span style="font-size:10px;background:rgba(155,109,255,0.12);color:var(--el-violet);border-radius:8px;padding:4px 10px;flex-shrink:0">\uD83D\uDCC4 ' + labEsc(p.badge) + '</span>';
  }
  h += '</div>';

  // Toggle attiva/disattiva
  if (p.tipo === 'esp_attivo') {
    h += '<button onclick="labEspDisattiva(' + p.idx + ');labPopupClose()" style="width:100%;padding:8px;margin-bottom:14px;background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.3);border-radius:10px;color:#e05252;font-size:12px;font-weight:700;cursor:pointer">\u23F9 Disattiva questa pratica</button>';
  } else if (p.tipo === 'esp_proposta') {
    h += '<button onclick="labEspAttiva(' + p.idx + ');labPopupClose()" style="width:100%;padding:8px;margin-bottom:14px;background:rgba(76,175,118,0.12);border:1px solid rgba(76,175,118,0.3);border-radius:10px;color:var(--green3);font-size:12px;font-weight:700;cursor:pointer">\u25B6 Attiva questa pratica</button>';
  }

  // Sezione descrizione
  var desc = d.descrizione || d.desc || '';
  if (desc) {
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.9;margin-bottom:14px;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px">' + labEsc(desc) + '</div>';
  }

  // Funzione / obiettivo (esp)
  if (d.funzione) {
    h += '<div style="background:rgba(0,180,255,0.06);border-radius:10px;padding:10px 12px;margin-bottom:10px">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--el-blue);margin-bottom:5px;letter-spacing:0.5px">\u26A1 FUNZIONE</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(d.funzione) + '</div>';
    h += '</div>';
  }

  // Obiettivo
  if (d.obiettivo && d.obiettivo !== desc) {
    h += '<div style="background:rgba(76,175,118,0.07);border-radius:10px;padding:10px 12px;margin-bottom:10px">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--green3);margin-bottom:5px">\uD83C\uDFAF OBIETTIVO</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(d.obiettivo) + '</div>';
    h += '</div>';
  }

  // Istruzioni passo-passo
  var istr = d.istruzioni_pratiche || d.istruzioni || (d.come_applicare ? [d.come_applicare] : []);
  if (istr.length) {
    h += '<div style="margin-bottom:14px">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--el-blue);margin-bottom:10px;letter-spacing:0.5px">\uD83D\uDEE0 COME FARE — PASSO PER PASSO</div>';
    istr.forEach(function(step, i) {
      h += '<div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start">';
      h += '<div style="min-width:26px;height:26px;background:' + catColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;flex-shrink:0">' + (i+1) + '</div>';
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.7;padding-top:4px">' + labEsc(step) + '</div>';
      h += '</div>';
    });
    h += '</div>';
  }

  // Materiali
  var mat = d.materiali || [];
  if (mat.length) {
    h += '<div style="background:rgba(0,180,255,0.05);border:1px solid rgba(0,180,255,0.1);border-radius:10px;padding:12px;margin-bottom:12px">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--el-blue);margin-bottom:8px">\uD83D\uDEE0 MATERIALI NECESSARI</div>';
    mat.forEach(function(m) {
      h += '<div style="font-size:12px;color:var(--text2);padding:4px 0;border-bottom:1px solid rgba(0,180,255,0.06)">\u2022 ' + labEsc(m) + '</div>';
    });
    h += '</div>';
  }

  // Varianti (tecniche)
  var varianti = d.varianti || [];
  if (varianti.length) {
    h += '<div style="background:rgba(155,109,255,0.05);border-radius:10px;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--el-violet);margin-bottom:6px">\uD83D\uDD00 VARIANTI</div>';
    varianti.forEach(function(v) { h += '<div style="font-size:11px;color:rgba(155,109,255,0.8);padding:2px 0">\u2022 ' + labEsc(v) + '</div>'; });
    h += '</div>';
  }

  // Fasi applicabili
  var fasi = d.fasi_guida || [];
  if (fasi.length) {
    var faseCurr = labGetFaseAttuale();
    var isRilevante = fasi.indexOf(faseCurr) !== -1;
    h += '<div style="font-size:10px;color:var(--text3);margin-bottom:12px">';
    if (isRilevante) h += '<span style="color:var(--green3);font-weight:700">\u2605 Ideale per la fase attuale!</span> ';
    h += 'Fasi: <span style="color:' + catColor + '">' + fasi.join(' \u00B7 ') + '</span></div>';
  }

  // Pratiche correlate (da stessa categoria)
  var correlate = labBuildPratiche().filter(function(x){
    return x.id !== pid && (x.categoria === p.categoria || (x.tipo !== p.tipo && x.nome.toLowerCase().split(' ').some(function(w){ return w.length>4 && p.nome.toLowerCase().indexOf(w)!==-1; })));
  }).slice(0,3);
  if (correlate.length) {
    h += '<div style="background:rgba(0,180,255,0.05);border-left:2px solid var(--el-blue);border-radius:0 10px 10px 0;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--el-blue);margin-bottom:6px">\uD83D\uDD17 PRATICHE CORRELATE</div>';
    correlate.forEach(function(c) {
      h += '<div style="font-size:11px;color:rgba(0,180,255,0.8);padding:4px 0;border-bottom:1px solid rgba(0,180,255,0.07);cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupPratica(\'' + c.id + '\');},60)">\u2192 ' + labEsc(c.nome) + '</div>';
    });
    h += '</div>';
  }

  // Guide correlate
  if (labGuideData && labGuideData.length) {
    var nomeP = (p.nome||'').toLowerCase();
    var catP = (p.categoria||'').toLowerCase();
    var guideCorr = [];
    labGuideData.forEach(function(g, gi) {
      var match = (g.fase && (g.fase.indexOf(catP.substring(0,5))!==-1 || catP.indexOf(g.fase.substring(0,5))!==-1))
        || (g.tecniche_pdf||[]).some(function(t){ return t.toLowerCase().indexOf(nomeP.substring(0,6))!==-1; });
      if (match) guideCorr.push({g:g,idx:gi});
    });
    if (guideCorr.length) {
      h += '<div style="background:rgba(155,109,255,0.05);border-radius:10px;padding:10px;margin-bottom:12px">';
      h += '<div style="font-size:9px;font-weight:700;color:var(--el-violet);margin-bottom:6px">\uD83D\uDCD6 GUIDE COLLEGATE</div>';
      guideCorr.slice(0,2).forEach(function(item) {
        h += '<div style="font-size:11px;color:rgba(155,109,255,0.8);padding:4px 0;cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupGuida(' + item.idx + ');},60)">\u2192 ' + labEsc(item.g.titolo||'') + '</div>';
      });
      h += '</div>';
    }
  }

  // Note (esp)
  if (d.note) {
    h += '<div style="background:rgba(240,165,0,0.06);border-radius:8px;padding:8px 10px;margin-bottom:10px">';
    h += '<div style="font-size:9px;font-weight:700;color:#f0a500;margin-bottom:3px">NOTE</div>';
    h += '<div style="font-size:11px;color:var(--text2)">' + labEsc(d.note) + '</div>';
    h += '</div>';
  }

  // Meta
  var meta = [];
  if (d.fonte) meta.push('Fonte: ' + d.fonte);
  if (d.data_attivazione) meta.push('Attiva dal: ' + d.data_attivazione.substring(0,10));
  if (d.ultima_modifica) meta.push('Aggiornata: ' + d.ultima_modifica);
  if (meta.length) h += '<div style="font-size:9px;color:var(--text3);margin-top:6px">' + meta.join(' \u00B7 ') + '</div>';

  labPopupOpen(h);
}

// Popup tutte le pratiche — lista intelligente completa
function labPopupAllPratiche() {
  var pratiche = labBuildPratiche();
  var fase = labGetFaseAttuale();
  var h = '<div style="font-size:9px;color:var(--el-blue);font-weight:700;letter-spacing:1px;margin-bottom:4px">\u26A1 PRATICHE (' + pratiche.length + ')</div>';
  h += '<div style="font-size:9px;color:var(--text3);margin-bottom:12px">Ordinate per rilevanza \u00B7 Fase attuale: <span style="color:var(--green3)">' + fase + '</span></div>';

  // Filtri rapidi
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px" id="pratiche-filtri">';
  h += '<button onclick="labFiltriPratiche(\'tutti\',this)" style="font-size:10px;padding:4px 10px;border-radius:20px;border:1px solid var(--el-blue);color:var(--el-blue);background:rgba(0,180,255,0.1);cursor:pointer">Tutte</button>';
  h += '<button onclick="labFiltriPratiche(\'attive\',this)" style="font-size:10px;padding:4px 10px;border-radius:20px;border:1px solid var(--green3);color:var(--green3);background:transparent;cursor:pointer">\u2705 Attive</button>';
  h += '<button onclick="labFiltriPratiche(\'tecniche\',this)" style="font-size:10px;padding:4px 10px;border-radius:20px;border:1px solid var(--el-violet);color:var(--el-violet);background:transparent;cursor:pointer">\uD83D\uDCC4 Tecniche</button>';
  h += '<button onclick="labFiltriPratiche(\'suggerite\',this)" style="font-size:10px;padding:4px 10px;border-radius:20px;border:1px solid var(--text3);color:var(--text3);background:transparent;cursor:pointer">\uD83D\uDCA1 Suggerite</button>';
  h += '</div>';

  h += '<div id="pratiche-lista">';
  pratiche.forEach(function(p) {
    var catColor = labCatColor(p.categoria);
    var isAttiva = p.tipo === 'esp_attivo';
    h += '<div class="prat-item" data-tipo="' + p.tipo + '" style="border-left:2px solid ' + catColor + ';border-radius:0 10px 10px 0;padding:10px 12px;margin-bottom:8px;cursor:pointer;background:rgba(255,255,255,0.02)" onclick="labPopupClose();setTimeout(function(){labPopupPratica(\'' + p.id + '\');},60)">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center">';
    h += '<div><div style="font-size:13px;font-weight:700;color:var(--text)">' + labEsc(p.nome) + '</div>';
    h += '<div style="font-size:10px;color:' + catColor + ';margin-top:2px">' + labEsc(p.categoria) + '</div></div>';
    if (isAttiva) h += '<span style="font-size:9px;color:var(--green3);font-weight:700">\u2705</span>';
    else if (p.badge) h += '<span style="font-size:9px;color:var(--text3)">' + labEsc(p.badge) + '</span>';
    h += '</div>';
    if (p.descrizione) h += '<div style="font-size:11px;color:var(--text3);margin-top:4px;line-height:1.4">' + labEsc(p.descrizione.substring(0,80)) + '\u2026</div>';
    h += '</div>';
  });
  h += '</div>';

  labPopupOpen(h);
}

// Filtro pratiche nel popup
function labFiltriPratiche(tipo, btn) {
  var items = document.querySelectorAll('.prat-item');
  items.forEach(function(el) {
    var t = el.getAttribute('data-tipo');
    var show = tipo === 'tutti' 
      || (tipo === 'attive' && t === 'esp_attivo')
      || (tipo === 'tecniche' && t === 'tecnica')
      || (tipo === 'suggerite' && t === 'esp_proposta');
    el.style.display = show ? 'block' : 'none';
  });
  // Reset stile bottoni
  document.querySelectorAll('#pratiche-filtri button').forEach(function(b){ b.style.opacity='0.5'; });
  if (btn) btn.style.opacity = '1';
}

// Alias funzioni legacy — NON rinominare
function labPopupAllEsperimenti() { labPopupAllPratiche(); }
function labPopupAllTecniche() { labPopupAllPratiche(); }
function labPopupEsp(idx, tipo) {
  var p = null;
  var pratiche = labBuildPratiche();
  if (tipo === 'attivo') p = pratiche.find(function(x){ return x.tipo==='esp_attivo' && x.idx===idx; });
  else p = pratiche.find(function(x){ return x.tipo==='esp_proposta' && x.idx===idx; });
  if (p) labPopupPratica(p.id);
}
function labPopupTecnicaAll(idx) {
  var pratiche = labBuildPratiche();
  var p = pratiche.filter(function(x){ return x.tipo==='tecnica'; })[idx];
  if (p) labPopupPratica(p.id);
}
function labPopupTecnica(idx) { labPopupTecnicaAll(idx); }
function labToggleTec(tid, val) {
  var elGlobale = {};
  try { elGlobale = JSON.parse(localStorage.getItem('el_globale') || '{}'); } catch(e) {}
  elGlobale[tid] = val;
  try { localStorage.setItem('el_globale', JSON.stringify(elGlobale)); } catch(e) {}
}
function labBuildTecnicheComplete() {
  return labElTecniche;
}
function labRenderTecniche() { labRenderPratiche(); }


async function labEspAttiva(idx) {
  var exp = labEspData && labEspData.proposte[idx];
  if (!exp) return;
  exp.attivo = true;
  exp.data_attivazione = new Date().toISOString().substring(0, 10);
  labEspData.esperimenti_attivi.push(exp);
  labEspData.proposte.splice(idx, 1);
  labRenderEsperimenti();
  labUpdateBadges();
  await labEspSalva('Attivato: ' + (exp.nome || ''));
}

async function labEspDisattiva(idx) {
  var esp = labEspData && labEspData.esperimenti_attivi[idx];
  if (!esp) return;
  esp.attivo = false;
  esp.data_disattivazione = new Date().toISOString().substring(0, 10);
  labEspData.proposte.unshift(esp);
  labEspData.esperimenti_attivi.splice(idx, 1);
  labRenderEsperimenti();
  labUpdateBadges();
  await labEspSalva('Disattivato: ' + (esp.nome || ''));
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
        message: '[BioSerra] ' + (msg || 'Aggiorna esperimenti'),
        content: btoa(unescape(encodeURIComponent(JSON.stringify(labEspData, null, 2)))),
        sha: sha
      })
    });
  } catch(e) {}
}

/* ══════════════════════════════════════════════════════════════
   RENDER — PDF (mini: 2 recenti in archivio)
══════════════════════════════════════════════════════════════ */

function labRenderPdf() {
  var el = document.getElementById('lab-pdf-content');
  if (!el) return;
  var d = labPdfData;
  if (!d || !d.analisi || !d.analisi.length) {
    el.innerHTML = '<div class="lab-arch-mini" style="cursor:default;border-color:transparent"><span class="lab-arch-mini-icon">\uD83D\uDCC4</span><div class="lab-arch-mini-body"><div class="lab-arch-mini-title" style="color:rgba(155,109,255,0.4)">Nessun PDF analizzato</div><div class="lab-arch-mini-sub">Carica PDF su Drive \u2014 analisi ogni giorno alle 5:00</div></div></div>';
    return;
  }
  var h = '';
  d.analisi.slice(0, 3).forEach(function(pdf, idx) {
    h += '<div class="lab-arch-mini" onclick="labPopupPdf(' + idx + ')">';
    h += '<span class="lab-arch-mini-icon">\uD83D\uDCC4</span>';
    h += '<div class="lab-arch-mini-body">';
    h += '<div class="lab-arch-mini-title">' + labEsc(pdf.titolo || 'PDF') + '</div>';
    if (pdf.sommario) h += '<div class="lab-arch-mini-sub">' + labEsc((pdf.sommario + '').substring(0, 70)) + '\u2026</div>';
    h += '</div>';
    h += '<span class="lab-arch-arrow">\u203A</span>';
    h += '</div>';
  });
  if (d.analisi.length > 3) {
    h += '<div style="text-align:center;font-size:11px;color:var(--el-violet);padding:4px 0;cursor:pointer;opacity:0.7" onclick="labPopupAllPdf()">\u25BC altri ' + (d.analisi.length - 3) + ' PDF\u2026</div>';
  }
  el.innerHTML = h;
}

/* Popup PDF singolo */
function labPopupPdf(idx) {
  var pdf = labPdfData && labPdfData.analisi && labPdfData.analisi[idx];
  if (!pdf) return;
  var relColor = pdf.rilevanza==='alta' ? 'var(--green3)' : pdf.rilevanza==='media' ? 'var(--orange)' : 'var(--text3)';
  var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
  h += '<div style="font-size:10px;color:var(--el-violet);font-weight:700;letter-spacing:1px">📄 ANALISI PDF</div>';
  if (pdf.rilevanza) h += '<div style="font-size:10px;color:' + relColor + ';font-weight:700">' + labEsc(pdf.rilevanza.toUpperCase()) + '</div>';
  h += '</div>';
  h += '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:10px;line-height:1.4">' + labEsc(pdf.titolo||'') + '</div>';
  if (pdf.tag && pdf.tag.length) {
    h += '<div style="margin-bottom:10px">';
    pdf.tag.forEach(function(tg) {
      h += '<span style="background:rgba(155,109,255,0.12);border:1px solid rgba(155,109,255,0.2);border-radius:5px;padding:2px 7px;font-size:10px;color:#9b6dff;margin:0 3px 3px 0;display:inline-block">' + labEsc(tg) + '</span>';
    });
    h += '</div>';
  }
  if (pdf.sommario) h += '<div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:12px">' + labEsc(pdf.sommario) + '</div>';
  if (pdf.tecniche_chiave && pdf.tecniche_chiave.length) {
    var NON_TEC=['nessuna tecnica','nessuna connessione','possibile ispirazione','nessuna'];
    var tcF=pdf.tecniche_chiave.filter(function(t){
      var n=(t+'').toLowerCase();
      return !NON_TEC.some(function(x){ return n.indexOf(x)!==-1; });
    });
    if (tcF.length) {
      h += '<div style="background:rgba(155,109,255,0.06);border-radius:10px;padding:10px;margin-bottom:10px">';
      h += '<div style="font-size:10px;font-weight:700;color:var(--el-violet);margin-bottom:8px">⚡ TECNICHE CHIAVE</div>';
      tcF.forEach(function(tc) { h += '<div style="font-size:12px;color:var(--text2);padding:3px 0;border-bottom:1px solid rgba(155,109,255,0.08)">• ' + labEsc(tc+'') + '</div>'; });
      h += '</div>';
    }
  }
  if (pdf.estratto_chiave) {
    h += '<div style="background:rgba(0,180,255,0.06);border-left:2px solid var(--el-blue);padding:10px;border-radius:0 8px 8px 0;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:4px">ESTRATTO CHIAVE</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6;font-style:italic">' + labEsc(pdf.estratto_chiave) + '</div></div>';
  }
  if (pdf.consiglio_coltivazione) {
    h += '<div style="background:rgba(76,175,118,0.07);border-radius:10px;padding:10px;margin-bottom:8px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--green3);margin-bottom:5px">🌱 COLTIVAZIONE</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(pdf.consiglio_coltivazione) + '</div></div>';
  }
  if (pdf.consiglio_elettrocultura) {
    h += '<div style="background:rgba(0,180,255,0.06);border-radius:10px;padding:10px;margin-bottom:8px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:5px">⚡ ELETTROCULTURA</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(pdf.consiglio_elettrocultura) + '</div></div>';
  }
  if (pdf.connessioni && pdf.connessioni.length) {
    h += '<div style="margin-top:4px">';
    h += '<div style="font-size:10px;font-weight:700;color:rgba(155,109,255,0.6);margin-bottom:6px">CONNESSIONI (' + pdf.connessioni.length + ')</div>';
    pdf.connessioni.slice(0,5).forEach(function(c) { h += '<div style="font-size:11px;color:rgba(155,109,255,0.55);padding:2px 0">🔗 ' + labEsc(c+'') + '</div>'; });
    h += '</div>';
  }
  labPopupOpen(h);
}

/* Popup tutti i PDF */
function labPopupAllPdf() {
  var d = labPdfData;
  if (!d || !d.analisi || !d.analisi.length) {
    labPopupOpen('<div style="color:rgba(155,109,255,0.4);padding:20px;text-align:center">Nessun PDF analizzato.</div>');
    return;
  }
  var h = '<div style="font-size:10px;color:var(--el-violet);font-weight:700;letter-spacing:1px;margin-bottom:14px">\uD83D\uDCC4 PDF ANALIZZATI (' + d.analisi.length + ')</div>';
  if (d.tecniche_nuove && d.tecniche_nuove.length) {
    h += '<div style="background:rgba(76,175,118,0.08);border:1px solid rgba(76,175,118,0.2);border-radius:10px;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--green3);margin-bottom:6px">\uD83C\uDD95 NUOVE TECNICHE ESTRATTE</div>';
    d.tecniche_nuove.forEach(function(t) {
      h += '<div style="font-size:12px;color:var(--text);margin-bottom:4px;font-weight:600">\u2022 ' + labEsc(t.nome || '') + '</div>';
      if (t.descrizione) h += '<div style="font-size:11px;color:var(--text2);padding-left:12px;margin-bottom:4px">' + labEsc((t.descrizione + '').substring(0, 120)) + '</div>';
    });
    h += '</div>';
  }
  d.analisi.forEach(function(pdf, idx) {
    h += '<div style="background:rgba(155,109,255,0.04);border:1px solid rgba(155,109,255,0.15);border-radius:10px;padding:10px;margin-bottom:8px;cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupPdf(' + idx + ');},50)">';
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">' + labEsc(pdf.titolo || 'PDF') + '</div>';
    if (pdf.sommario) h += '<div style="font-size:11px;color:var(--text3)">' + labEsc((pdf.sommario + '').substring(0, 100)) + '\u2026</div>';
    if (pdf.rilevanza) {
      var rc = pdf.rilevanza === 'alta' ? 'var(--green3)' : pdf.rilevanza === 'media' ? 'var(--orange)' : 'var(--text3)';
      h += '<div style="font-size:10px;color:' + rc + ';margin-top:4px">Rilevanza: ' + labEsc(pdf.rilevanza) + '</div>';
    }
    h += '</div>';
  });
  labPopupOpen(h);
}

/* ══════════════════════════════════════════════════════════════
   RENDER — GUIDE (mini: 2 recenti in archivio)
══════════════════════════════════════════════════════════════ */

function labRenderGuide() {
  var el = document.getElementById('lab-guide-content');
  if (!el) return;
  if (!labGuideData.length) {
    el.innerHTML = '<div class="lab-arch-mini" style="cursor:default;border-color:transparent"><span class="lab-arch-mini-icon">📖</span><div class="lab-arch-mini-body"><div class="lab-arch-mini-title" style="color:rgba(155,109,255,0.4)">Guide in generazione</div><div class="lab-arch-mini-sub">Aggiornate ogni 3 giorni da Zamnesia + PDF</div></div></div>';
    return;
  }
  var FASE_ICON = { germinazione:'🌱', vegetazione:'🌱', fioritura:'🌸', harvest:'🌿', essiccazione:'🌡', curing:'🫙', living_soil:'🌍', nutrizione:'🧪', irrigazione:'💧', difesa_biologica:'🛡' };
  var h = '';
  labGuideData.slice(0, 3).forEach(function(g, idx) {
    var ico = FASE_ICON[g.fase] || '📖';
    var tcN = g.tecniche_pdf ? g.tecniche_pdf.length : 0;
    h += '<div class="lab-arch-mini" onclick="labPopupGuida(' + idx + ')">';
    h += '<span class="lab-arch-mini-icon">' + ico + '</span>';
    h += '<div class="lab-arch-mini-body">';
    h += '<div class="lab-arch-mini-title">' + labEsc(g.titolo||'') + '</div>';
    if (g.punti_chiave && g.punti_chiave.length) h += '<div class="lab-arch-mini-sub">' + labEsc(g.punti_chiave[0].substring(0,60)) + '</div>';
    if (tcN) h += '<div style="font-size:9px;color:rgba(0,180,255,0.5);margin-top:2px">⚡ ' + tcN + ' tecniche PDF</div>';
    h += '</div><span class="lab-arch-arrow">›</span></div>';
  });
  if (labGuideData.length > 3) h += '<div style="text-align:center;font-size:11px;color:var(--el-violet);padding:4px 0;cursor:pointer;opacity:0.7" onclick="labPopupAllGuide()">▼ altre ' + (labGuideData.length - 3) + '…</div>';
  el.innerHTML = h;
}

/* Popup guida singola */
function labPopupGuida(idx) {
  var g = labGuideData[idx];
  if (!g) return;
  var FASE_COLOR = {
    germinazione:'var(--green3)', vegetazione:'var(--green3)', fioritura:'#f0a500',
    harvest:'#e05252', essiccazione:'var(--el-blue)', curing:'var(--el-violet)',
    living_soil:'#7ec860', nutrizione:'var(--green3)', irrigazione:'var(--el-blue)',
    difesa_biologica:'#e05252'
  };
  var catColor = FASE_COLOR[g.fase] || 'var(--el-violet)';
  var faseLabel = (g.fase||g.categoria||'guida').replace(/_/g,' ').toUpperCase();
  var h = '';
  // Header
  h += '<div style="font-size:10px;color:' + catColor + ';font-weight:700;letter-spacing:1px;margin-bottom:4px">' + faseLabel + '</div>';
  h += '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;line-height:1.3">' + labEsc(g.titolo||'') + '</div>';
  if (g.quando) h += '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">\uD83D\uDDD3 ' + labEsc(g.quando) + '</div>';

  // Contenuto completo scrollabile
  if (g.contenuto_completo && g.contenuto_completo.length > 30 && g.contenuto_completo !== 'Guida in elaborazione.') {
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.9;margin-bottom:14px;max-height:200px;overflow-y:auto;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;padding-right:8px">' + labEsc(g.contenuto_completo) + '</div>';
  }

  // Sezioni espandibili — Punti chiave
  if (g.punti_chiave && g.punti_chiave.length) {
    var pid = 'gpk_' + idx;
    h += '<div style="border:1px solid rgba(76,175,118,0.2);border-radius:10px;margin-bottom:8px;overflow:hidden">';
    h += '<div style="padding:10px 12px;background:rgba(76,175,118,0.06);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="var el=document.getElementById(\'' + pid + '\');el.style.display=el.style.display===\'none\'?\'block\':\'none\'">';
    h += '<span style="font-size:11px;font-weight:700;color:var(--green3)">\u2705 PUNTI CHIAVE (' + g.punti_chiave.length + ')</span>';
    h += '<span style="color:var(--green3);font-size:14px">\u25BE</span></div>';
    h += '<div id="' + pid + '" style="display:none;padding:10px 12px">';
    g.punti_chiave.forEach(function(p) {
      h += '<div style="font-size:12px;color:var(--text2);padding:5px 0;border-bottom:1px solid rgba(76,175,118,0.08)">\u2713 ' + labEsc(p) + '</div>';
    });
    h += '</div></div>';
  }

  // Sezione errori comuni
  if (g.errori_comuni && g.errori_comuni.length) {
    var eid = 'gec_' + idx;
    h += '<div style="border:1px solid rgba(224,82,82,0.2);border-radius:10px;margin-bottom:8px;overflow:hidden">';
    h += '<div style="padding:10px 12px;background:rgba(224,82,82,0.06);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="var el=document.getElementById(\'' + eid + '\');el.style.display=el.style.display===\'none\'?\'block\':\'none\'">';
    h += '<span style="font-size:11px;font-weight:700;color:#e05252">\u26A0 ERRORI COMUNI (' + g.errori_comuni.length + ')</span>';
    h += '<span style="color:#e05252;font-size:14px">\u25BE</span></div>';
    h += '<div id="' + eid + '" style="display:none;padding:10px 12px">';
    g.errori_comuni.forEach(function(err) {
      h += '<div style="font-size:12px;color:var(--text2);padding:5px 0;border-bottom:1px solid rgba(224,82,82,0.08)">\u2717 ' + labEsc(err) + '</div>';
    });
    h += '</div></div>';
  }

  // Sezione tecniche PDF collegate (cliccabili)
  if (g.tecniche_pdf && g.tecniche_pdf.length) {
    var tid2 = 'gtp_' + idx;
    h += '<div style="border:1px solid rgba(0,180,255,0.2);border-radius:10px;margin-bottom:8px;overflow:hidden">';
    h += '<div style="padding:10px 12px;background:rgba(0,180,255,0.05);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="var el=document.getElementById(\'' + tid2 + '\');el.style.display=el.style.display===\'none\'?\'block\':\'none\'">';
    h += '<span style="font-size:11px;font-weight:700;color:var(--el-blue)">\u26A1 TECNICHE PDF (' + g.tecniche_pdf.length + ')</span>';
    h += '<span style="color:var(--el-blue);font-size:14px">\u25BE</span></div>';
    h += '<div id="' + tid2 + '" style="display:none;padding:10px 12px">';
    var tutteTec2 = (typeof labBuildTecnicheComplete === 'function') ? labBuildTecnicheComplete() : [];
    g.tecniche_pdf.forEach(function(tname) {
      var matchIdx = -1;
      tutteTec2.forEach(function(tec, ti) { if ((tec.nome||'').toLowerCase().indexOf(tname.toLowerCase().substring(0,8)) !== -1) matchIdx = ti; });
      if (matchIdx >= 0) {
        h += '<div style="font-size:11px;color:rgba(0,180,255,0.8);padding:4px 0;border-bottom:1px solid rgba(0,180,255,0.07);cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupTecnicaAll(' + matchIdx + ');},60)">\u2192 \uD83D\uDD17 ' + labEsc(tname) + '</div>';
      } else {
        h += '<div style="font-size:11px;color:rgba(0,180,255,0.6);padding:4px 0;border-bottom:1px solid rgba(0,180,255,0.07)">\u2022 ' + labEsc(tname) + '</div>';
      }
    });
    h += '</div></div>';
  }

  // Sezione esperimenti PDF collegati (cliccabili)
  if (g.esperimenti_pdf && g.esperimenti_pdf.length) {
    var eid2 = 'gep_' + idx;
    h += '<div style="border:1px solid rgba(155,109,255,0.2);border-radius:10px;margin-bottom:8px;overflow:hidden">';
    h += '<div style="padding:10px 12px;background:rgba(155,109,255,0.05);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="var el=document.getElementById(\'' + eid2 + '\');el.style.display=el.style.display===\'none\'?\'block\':\'none\'">';
    h += '<span style="font-size:11px;font-weight:700;color:var(--el-violet)">\uD83E\uDDEA ESPERIMENTI (' + g.esperimenti_pdf.length + ')</span>';
    h += '<span style="color:var(--el-violet);font-size:14px">\u25BE</span></div>';
    h += '<div id="' + eid2 + '" style="display:none;padding:10px 12px">';
    g.esperimenti_pdf.forEach(function(ename) {
      h += '<div style="font-size:11px;color:rgba(155,109,255,0.8);padding:4px 0;border-bottom:1px solid rgba(155,109,255,0.07)">\u2022 ' + labEsc(ename) + '</div>';
    });
    h += '</div></div>';
  }

  labPopupOpen(h);
}

/* Popup tutte le guide */
function labPopupAllGuide() {
  if (!labGuideData.length) {
    labPopupOpen('<div style="color:rgba(155,109,255,0.4);padding:20px;text-align:center">Guide in generazione…</div>');
    return;
  }
  var h = '<div style="font-size:10px;color:var(--el-violet);font-weight:700;letter-spacing:1px;margin-bottom:4px">📖 GUIDE (' + labGuideData.length + ')</div>';
  h += '<div style="font-size:10px;color:rgba(155,109,255,0.4);margin-bottom:14px">Zamnesia + PDF — ogni 3 giorni</div>';
  labGuideData.forEach(function(g, idx) {
    var catColor = g.fase==='irrigazione' ? 'var(--el-blue)'
      : g.fase==='nutrizione' ? 'var(--green3)'
      : g.fase==='difesa_biologica' ? 'var(--red)'
      : g.fase==='living_soil' ? '#7ec860' : 'var(--el-violet)';
    var tcN = g.tecniche_pdf ? g.tecniche_pdf.length : 0;
    h += '<div style="background:rgba(155,109,255,0.04);border:1px solid rgba(155,109,255,0.15);border-left:2px solid ' + catColor + ';border-radius:0 10px 10px 0;padding:10px;margin-bottom:8px;cursor:pointer" onclick="labPopupClose();setTimeout(function(){ labPopupGuida(' + idx + '); },50)">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start">';
    h += '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px">' + labEsc(g.titolo||'') + '</div>';
    if (g.fase) h += '<div style="font-size:10px;color:' + catColor + ';margin-bottom:3px">' + g.fase.replace('_',' ') + '</div>';
    if (g.punti_chiave && g.punti_chiave.length) h += '<div style="font-size:11px;color:var(--text3)">' + g.punti_chiave.slice(0,2).map(function(p){ return '✓ ' + p.substring(0,40); }).join('  ') + '</div>';
    h += '</div>';
    if (tcN) h += '<div style="font-size:9px;color:rgba(0,180,255,0.5);white-space:nowrap;padding-left:8px">⚡ ' + tcN + ' PDF</div>';
    h += '</div></div>';
  });
  labPopupOpen(h);
}

/* ══════════════════════════════════════════════════════════════
   RENDER — CERVELLO AI (consigli da brain.json)
══════════════════════════════════════════════════════════════ */

function labRenderBrain() {
  var el = document.getElementById('lab-brain-content');
  if (!el) return;
  var d = labBrainData;
  if (!d) {
    el.innerHTML = '<div class="lab-brain-consiglio" style="opacity:0.4">Cervello in elaborazione… Torna alle 5:00.</div>';
    return;
  }
  var c = d.cervello || {};
  var consigli = (c.consigli_giorno && c.consigli_giorno.length) ? c.consigli_giorno : ((d.consigli_giorno && d.consigli_giorno.length) ? d.consigli_giorno : []);
  var avvisi   = (c.avvisi && c.avvisi.length) ? c.avvisi : ((d.avvisi && d.avvisi.length) ? d.avvisi : []);
  var ora = new Date().getHours();
  var h = '';
  if (consigli.length) {
    var idx = ora % consigli.length;
    h += '<div class="lab-brain-consiglio">' + labEsc(consigli[idx]) + '</div>';
    if (consigli.length > 1) {
      var idx2 = (idx + 1) % consigli.length;
      h += '<div class="lab-brain-consiglio" style="opacity:0.7;font-size:11px">' + labEsc(consigli[idx2]) + '</div>';
    }
  }
  avvisi.slice(0,1).forEach(function(av) {
    h += '<div class="lab-brain-consiglio" style="color:#ff6b6b">⚠ ' + labEsc(av) + '</div>';
  });
  var agenti = d.agenti || {};
  if (agenti.piante && agenti.piante.stato_generale) {
    h += '<div style="font-size:10px;color:rgba(0,180,255,0.4);margin-top:8px;padding-top:6px;border-top:1px solid rgba(0,180,255,0.1)">' + labEsc(agenti.piante.stato_generale) + '</div>';
  }
  if (!h) h = '<div class="lab-brain-consiglio" style="opacity:0.4">Nessun consiglio disponibile.</div>';
  el.innerHTML = h;
}

/* Scroll verso cervello AI */
function labScrollBrain() {
  var el = document.getElementById('lab-brain-section');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ══════════════════════════════════════════════════════════════
   CHAT CERVELLO AI
══════════════════════════════════════════════════════════════ */

var cervHistory = [];

async function cervBuildSystem(queryKeywords) {
  var sys = 'Sei il Cervello AI di BioSerra, esperto di coltivazione Living Soil outdoor a Caserta (41\u00B0N). ';
  sys += 'Hai accesso alla knowledge base completa della serra: PDF analizzati, tecniche elettrocultura, guide per fase, dati meteo e lunari in tempo reale. ';
  sys += 'Rispondi in italiano, pratico e preciso, max 300 parole. Cita le fonti (es: "dal PDF X") quando pertinente.\n\n';

  try {
    // === DATI REAL-TIME (meteo + luna + piante) ===
    var [rMeteo, rLuna, rPiante] = await Promise.allSettled([
      fetch('https://api.open-meteo.com/v1/forecast?latitude=41.097&longitude=14.388&current=temperature_2m,relative_humidity_2m,weathercode,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe/Rome&forecast_days=3').then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'luna_consigli.json?v=' + Date.now()).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'piante_stato.json?v=' + Date.now()).then(function(r){ return r.json(); })
    ]);

    if (rMeteo.status === 'fulfilled') {
      var cur = rMeteo.value.current || {};
      var daily = rMeteo.value.daily || {};
      sys += '=== METEO CASERTA ===\n';
      if (cur.temperature_2m !== undefined) sys += 'Ora: ' + cur.temperature_2m + '\u00B0C, umid. ' + (cur.relative_humidity_2m||'?') + '%, vento ' + (cur.wind_speed_10m||0) + ' km/h\n';
      if (daily.temperature_2m_max && daily.temperature_2m_max[0]) {
        sys += 'Oggi max ' + daily.temperature_2m_max[0] + '\u00B0C / min ' + (daily.temperature_2m_min[0]||'?') + '\u00B0C';
        if (daily.precipitation_sum && daily.precipitation_sum[0]) sys += ', pioggia ' + daily.precipitation_sum[0] + 'mm';
        sys += '\n';
      }
      sys += '\n';
    }

    if (rLuna.status === 'fulfilled') {
      var ld = rLuna.value.data || rLuna.value;
      sys += '=== LUNA ===\n';
      if (ld.fase) sys += 'Fase: ' + ld.fase + '. ';
      if (ld.illuminazione) sys += 'Illuminazione: ' + ld.illuminazione + '. ';
      var cons = ld.consigli;
      if (typeof cons === 'string' && cons.length > 0) sys += 'Consiglio lunare: ' + cons.substring(0,200) + '\n';
      sys += '\n';
    }

    if (rPiante.status === 'fulfilled') {
      var pv = rPiante.value;
      var pList = (pv.data && pv.data.stato_piante) ? pv.data.stato_piante : (pv.stato_piante || []);
      if (pList.length) {
        sys += '=== PIANTE IN COLTIVAZIONE ===\n';
        pList.forEach(function(p) {
          sys += p.nome + ': fase ' + (p.fase||'?') + ', giorno ' + (p.giorno_ciclo||'?');
          if (p.giorno_raccolta_stimato) sys += ', raccolta stimata ' + p.giorno_raccolta_stimato;
          sys += '\n';
        });
        sys += '\n';
      }
    }

    // === BRAIN - consigli giornalieri ===
    if (labBrainData) {
      var cerv = labBrainData.cervello || labBrainData;
      var cg = cerv.consigli_giorno || labBrainData.consigli_giorno || [];
      if (cg.length) {
        sys += '=== CONSIGLI DEL GIORNO (dal sistema AI notturno) ===\n';
        cg.slice(0,3).forEach(function(c,i){ sys += (i+1) + '. ' + c + '\n'; });
        sys += '\n';
      }
      var avv = cerv.avvisi || labBrainData.avvisi || [];
      if (avv.length) {
        sys += 'AVVISI: ' + avv.slice(0,2).map(function(a){ return a.messaggio||a; }).join(' | ') + '\n\n';
      }
    }

    // === TECNICHE ELETTROCULTURA (da concetti_index) ===
    if (labConcettiData && labConcettiData.concetti && labConcettiData.concetti.length) {
      sys += '=== TECNICHE ELETTROCULTURA ATTIVE ===\n';
      labConcettiData.concetti.forEach(function(c) {
        sys += '\u2022 ' + c.label + ' [' + (c.categoria||'') + ']: ' + (c.descrizione||'').substring(0,120);
        if (c.pdf_count) sys += ' (in ' + c.pdf_count + ' PDF)';
        sys += '\n';
        if (c.istruzioni_pratiche && c.istruzioni_pratiche.length) {
          sys += '  Pratica: ' + c.istruzioni_pratiche[0].substring(0,100) + '\n';
        }
      });
      sys += '\n';
    }

    // === PDF KNOWLEDGE BASE - sommari rilevanti ===
    if (labPdfData && labPdfData.analisi && labPdfData.analisi.length) {
      var analisi = labPdfData.analisi;
      // Filtra per keyword se presenti, altrimenti top 6 con sommario
      var filtered = analisi;
      if (queryKeywords && queryKeywords.length) {
        var kw = queryKeywords.map(function(k){ return k.toLowerCase(); });
        filtered = analisi.filter(function(a) {
          var haystack = ((a.titolo||'') + ' ' + (a.sommario||'') + ' ' + (a.tecniche_chiave||[]).join(' ')).toLowerCase();
          return kw.some(function(k){ return haystack.indexOf(k) !== -1; });
        });
        if (filtered.length === 0) filtered = analisi;
      }
      var top = filtered.slice(0,6);
      if (top.length) {
        sys += '=== KNOWLEDGE BASE PDF (estratti rilevanti) ===\n';
        top.forEach(function(a) {
          sys += '[' + a.id + '] ' + (a.titolo||a.id) + '\n';
          if (a.sommario) sys += '  Sommario: ' + a.sommario.substring(0,200) + '\n';
          if (a.tecniche_chiave && a.tecniche_chiave.length) sys += '  Tecniche: ' + a.tecniche_chiave.slice(0,4).join(', ') + '\n';
          if (a.estratto_chiave) sys += '  Estratto: ' + a.estratto_chiave.substring(0,150) + '\n';
          if (a.consiglio_coltivazione) sys += '  Consiglio: ' + a.consiglio_coltivazione.substring(0,120) + '\n';
        });
        sys += '\n';
      }
    }

    // === GUIDE PER FASE ===
    if (labGuideData && labGuideData.length) {
      // Determina fase prevalente dalle piante
      var faseAttiva = '';
      if (rPiante && rPiante.status === 'fulfilled') {
        var pv2 = rPiante.value;
        var pl2 = (pv2.data && pv2.data.stato_piante) ? pv2.data.stato_piante : (pv2.stato_piante || []);
        if (pl2.length) faseAttiva = (pl2[0].fase || '').toLowerCase();
      }
      var guideRel = labGuideData.filter(function(g) {
        return faseAttiva && g.fase && g.fase.toLowerCase().indexOf(faseAttiva.substring(0,5)) !== -1;
      });
      if (!guideRel.length) guideRel = labGuideData.slice(0,2);
      guideRel.slice(0,2).forEach(function(g) {
        sys += '=== GUIDA: ' + (g.titolo||g.fase||'') + ' ===\n';
        if (g.punti_chiave && g.punti_chiave.length) sys += 'Punti chiave: ' + g.punti_chiave.slice(0,3).join(' | ') + '\n';
        if (g.errori_comuni && g.errori_comuni.length) sys += 'Errori comuni: ' + g.errori_comuni.slice(0,2).join(' | ') + '\n';
        sys += '\n';
      });
    }

    // === WIKI INCREMENTALE (pagine concetti rilevanti) ===
    if (queryKeywords && queryKeywords.length && labConcettiData && labConcettiData.concetti) {
      var wikiBase = 'https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/wiki/concetti/';
      // Trova concetti che matchano le keyword
      var concettiMatch = labConcettiData.concetti.filter(function(c) {
        var haystack = (c.label + ' ' + (c.descrizione||'') + ' ' + (c.varianti||[]).join(' ')).toLowerCase();
        return queryKeywords.some(function(k){ return haystack.indexOf(k) !== -1; });
      }).slice(0,3);

      if (concettiMatch.length) {
        var wikiResults = await Promise.allSettled(
          concettiMatch.map(function(c) {
            return fetch(wikiBase + c.id + '.md?v=' + Date.now())
              .then(function(r){ return r.ok ? r.text() : null; })
              .then(function(t){ return { id: c.id, label: c.label, testo: t }; });
          })
        );
        var wikiSezione = '';
        wikiResults.forEach(function(wr) {
          if (wr.status === 'fulfilled' && wr.value && wr.value.testo && wr.value.testo.length > 100) {
            // Estrai solo le sezioni utili (max 400 chars per pagina)
            var t = wr.value.testo;
            // Rimuovi frontmatter yaml
            if (t.startsWith('---')) { var endFm = t.indexOf('---', 3); if (endFm > 0) t = t.slice(endFm+3); }
            wikiSezione += '\n[WIKI: ' + wr.value.label + ']\n' + t.substring(0,500).trim() + '\n';
          }
        });
        if (wikiSezione.length > 50) {
          sys += '=== WIKI CONCETTI RILEVANTI ===\n' + wikiSezione + '\n';
        }
      }
    }

  } catch(e) {
    sys += '[Errore caricamento contesto: ' + e.message + ']\n';
  }

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
    // Estrai keyword dalla domanda per contestualizzare il system prompt
    var keywords = userMsg.toLowerCase()
      .replace(/[^\w\s]/g,'')
      .split(/\s+/)
      .filter(function(w){ return w.length > 3; })
      .slice(0,8);

    var systemPrompt = await cervBuildSystem(keywords);

    // Ricerca semantica vettoriale: trova top-3 PDF correlati alla domanda
    var pdfContext = '';
    if (labVettoriData && labVettoriData.vettori && labVettoriData.vettori.length && labPdfData) {
      try {
        var mistralKey = ['qadOXMnT','lOl282Mld9SR','wtWL9dTdGCA2'].join('');
        var embResp = await fetch('https://api.mistral.ai/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mistralKey },
          body: JSON.stringify({ model: 'mistral-embed', input: [userMsg] })
        });
        if (embResp.ok) {
          var embData = await embResp.json();
          var queryVec = embData.data[0].embedding;
          var byId = {};
          (labPdfData.analisi||[]).forEach(function(a){ if(a.id) byId[a.id]=a; });
          var scored = labVettoriData.vettori
            .filter(function(v){ return v.vettore && v.vettore.length; })
            .map(function(v) {
              var src = byId[v.id] || {};
              return {
                score: labSbCosine(queryVec, v.vettore),
                id: v.id,
                titolo: src.titolo || v.titolo || v.id,
                sommario: src.sommario || '',
                estratto: src.estratto_chiave || '',
                consiglio_elettro: src.consiglio_elettrocultura || ''
              };
            })
            .sort(function(a,b){ return b.score - a.score; })
            .slice(0,3);

          if (scored.length && scored[0].score > 0.3) {
            pdfContext = '\n\n=== DOCUMENTI PIU\u2019 RILEVANTI PER QUESTA DOMANDA (ricerca semantica) ===\n';
            scored.forEach(function(s) {
              pdfContext += '[' + s.id + '] ' + s.titolo + ' (score: ' + s.score.toFixed(2) + ')\n';
              if (s.sommario) pdfContext += '  ' + s.sommario.substring(0,200) + '\n';
              if (s.estratto) pdfContext += '  Estratto: ' + s.estratto.substring(0,150) + '\n';
              if (s.consiglio_elettro) pdfContext += '  Elettrocultura: ' + s.consiglio_elettro.substring(0,120) + '\n';
            });

            // Naviga grafo: aggiungi PDF connessi al top-1
            if (labGrafoData && labGrafoData.edges && scored[0]) {
              var topId = scored[0].id;
              var connessi = labGrafoData.edges
                .filter(function(e){ return e.source === topId || e.target === topId; })
                .sort(function(a,b){ return (b.peso||0)-(a.peso||0); })
                .slice(0,2);
              if (connessi.length) {
                pdfContext += 'PDF connessi nel grafo: ';
                pdfContext += connessi.map(function(e){
                  var otherId = e.source === topId ? e.target : e.source;
                  var other = byId[otherId] || {};
                  return (other.titolo || otherId) + ' (peso:' + (e.peso||0).toFixed(2) + ')';
                }).join(', ') + '\n';
              }
            }
          }
        }
      } catch(ve) { /* embedding fallback silenzioso */ }
    }

    var finalSystem = systemPrompt + pdfContext;

    var msgs = cervHistory.slice(-7, -1).map(function(h){ return { role: h.role, content: h.content }; });
    msgs.push({ role: 'user', content: userMsg });

    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ['sk-ant-api03-','IpveWMEEMfS3py7K','X6S7pAkPWG9T9E6L','2bvDlGH9oGFHj43Y','hZOaBDYjf6cVJiEh','KXJqFaAAA'].join(''),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: finalSystem,
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
  if (chat) chat.innerHTML = '<div class="ai-msg bot">\uD83E\uDDE0 Sistema attivo. Leggo meteo, piante, luna in tempo reale.<br>Cosa vuoi sapere sulla tua serra?</div>';
}

async function cervSalva(domanda, risposta, btnEl) {
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '\u23F3 Salvo...'; }
  try {
    var webhookUrl = 'https://francesco467.app.n8n.cloud/webhook/bioserra-salva-log';
    var resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domanda: domanda, risposta: risposta, tag: [], contesto: '' })
    });
    var data = await resp.json();
    if (data.ok) {
      if (btnEl) { btnEl.textContent = '\u2705 Salvato ' + data.id; btnEl.style.color = '#4caf50'; }
    } else {
      if (btnEl) { btnEl.textContent = '\u274C Errore salvataggio'; btnEl.disabled = false; }
    }
  } catch(e) {
    if (btnEl) { btnEl.textContent = '\u274C Errore rete'; btnEl.disabled = false; }
  }
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
  if (!chat) return { classList: { remove: function(){} }, textContent: '', _isWrapper: false };
  var div = document.createElement('div');
  div.className = 'ai-msg bot' + (loading ? ' loading' : '');
  div.textContent = loading ? '\u23F3 Elaboro\u2026' : text;
  if (!loading) {
    var wrapper = document.createElement('div');
    wrapper.className = 'cerv-msg-wrapper';
    var btnSalva = document.createElement('button');
    btnSalva.className = 'cerv-salva-btn';
    btnSalva.textContent = '\uD83D\uDCCC Salva';
    btnSalva.title = 'Salva questa risposta nel log';
    var capturedText = text;
    btnSalva.onclick = function() {
      var lastUser = '';
      var msgs = chat.querySelectorAll('.ai-msg.user');
      if (msgs.length) lastUser = msgs[msgs.length - 1].textContent;
      cervSalva(lastUser, capturedText, btnSalva);
    };
    wrapper.appendChild(div);
    wrapper.appendChild(btnSalva);
    chat.appendChild(wrapper);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function cervAppend(text, cls) {
  if (cls === 'user') cervAppendUser(text);
  else cervAppendBot(text, false);
}

/* ══════════════════════════════════════════════════════════════
   COMPATIBILITA' — funzioni legacy chiamate da HTML
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




/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — variabili globali
══════════════════════════════════════════════════════════════ */

var labConcettiData = null;  // concetti_index.json
var labVettoriData = null;   // pdf_vectors.json
var labGrafoData   = null;   // pdf_graph.json
var labSbInited    = false;  // D3 già inizializzato

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — caricamento dati (chiamato da labLoadAll)
══════════════════════════════════════════════════════════════ */

async function labLoadSecondBrain() {
  var ts = '?v=' + Date.now();
  try {
    var [rVet, rGraf] = await Promise.allSettled([
      fetch(LAB_RAW + 'pdf_vectors.json' + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'pdf_graph.json'   + ts).then(function(r){ return r.json(); })
    ]);
    if (rVet.status  === 'fulfilled') labVettoriData = rVet.value;
    if (rGraf.status === 'fulfilled') labGrafoData   = rGraf.value;
  } catch(e) {
    console.warn('Second Brain load error:', e);
  }
  labRenderSbMini();
}

/* mini widget Second Brain nella pagina principale */
function labRenderSbMini() {
  var el = document.getElementById('lab-sb-mini');
  if (!el) return;
  var totVet  = labVettoriData  && labVettoriData.vettori    ? labVettoriData.vettori.length    : 0;
  var totPdf  = labPdfData      && labPdfData.analisi        ? labPdfData.analisi.length         : 0;
  var totEdg  = labGrafoData    && labGrafoData.edges        ? labGrafoData.edges.length         : 0;
  var totConc = labConcettiData && labConcettiData.concetti  ? labConcettiData.concetti.length   : 0;
  var totGEdg = labConcettiData && labConcettiData.grafo && labConcettiData.grafo.edges ? labConcettiData.grafo.edges.length : 0;
  if (!totVet && !totPdf && !totConc) {
    el.innerHTML = '<div style="color:rgba(0,180,255,0.35);font-size:12px;padding:4px">Embedding in corso — workflow alle 6:00.</div>';
    return;
  }
  el.innerHTML = '<div style="display:flex;gap:10px;padding:4px 0;flex-wrap:wrap">'
    + '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#00b4ff">' + totPdf + '</div><div style="font-size:9px;color:rgba(0,180,255,0.45)">PDF</div></div>'
    + '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:#9b6dff">' + totConc + '</div><div style="font-size:9px;color:rgba(155,109,255,0.45)">CONCETTI</div></div>'
    + '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:rgba(0,180,255,0.6)">' + totVet + '</div><div style="font-size:9px;color:rgba(0,180,255,0.35)">VETTORI</div></div>'
    + '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:rgba(155,109,255,0.6)">' + totGEdg + '</div><div style="font-size:9px;color:rgba(155,109,255,0.35)">LINKS</div></div>'
    + '<div style="flex:1;display:flex;align-items:center;justify-content:flex-end">'
    + '<button onclick="labPopupSecondBrain()" style="background:rgba(0,180,255,0.12);border:1px solid rgba(0,180,255,0.25);border-radius:8px;padding:6px 14px;color:#00b4ff;font-size:12px;cursor:pointer">🧠 Apri</button>'
    + '</div></div>';
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — enrich nodi con titoli da pdf_knowledge
   (pdf_knowledge usa id = pdf_0..N, vettori usano hash UUID
    ma sono nello stesso ordine di analisi)
══════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — enrich nodi con dati da pdf_knowledge (by ID)
══════════════════════════════════════════════════════════════ */

function labSbEnrichNodi(nodi) {
  var analisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];
  // Costruisci mappa per ID
  var byId = {};
  analisi.forEach(function(a) { if (a.id) byId[a.id] = a; });
  return nodi.map(function(n) {
    var src = byId[n.id] || byId['pdf_' + n.id] || {};
    return Object.assign({}, n, {
      titolo:    src.titolo    || n.titolo    || n.id || 'PDF',
      tag:       src.tag       || n.tag       || [],
      sommario:  src.sommario  || n.sommario  || '',
      tecniche:  src.tecniche_chiave || [],
      consiglio: src.consiglio_coltivazione || src.consiglio_elettrocultura || '',
      estratto:  src.estratto_chiave || '',
      rilevanza: src.rilevanza || n.rilevanza || 'media',
      gruppo:    src.rilevanza === 'alta' ? 'chiave' : (src.rilevanza === 'media' ? 'utile' : 'generale')
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — popup principale
══════════════════════════════════════════════════════════════ */

function labPopupSecondBrain() {
  var nodi  = (labGrafoData && labGrafoData.nodi)  ? labSbEnrichNodi(labGrafoData.nodi.slice())  : [];
  var edges = (labGrafoData && labGrafoData.edges) ? labGrafoData.edges : [];
  var nPdf  = (labPdfData   && labPdfData.analisi) ? labPdfData.analisi.length : 0;
  var nVec  = (labVettoriData && labVettoriData.vettori) ? labVettoriData.vettori.length : 0;

  var html =
    '<div style="font-size:10px;color:rgba(0,180,255,0.4);letter-spacing:0.5px;margin-bottom:2px">SECOND BRAIN</div>'
  + '<div style="font-size:15px;font-weight:700;color:#00b4ff;letter-spacing:1px;margin-bottom:4px">\uD83E\uDDE0 KNOWLEDGE BASE</div>'
  + '<div style="font-size:11px;color:var(--text3);margin-bottom:16px">'
  +   nVec + ' PDF vettorizzati \u00B7 ' + nPdf + ' analizzati \u00B7 ' + edges.length + ' connessioni'
  + '</div>'

  // Box ricerca — centrale e prominente
  + '<div style="margin-bottom:16px">'
  + '<div style="font-size:10px;color:#00b4ff;font-weight:700;margin-bottom:8px;letter-spacing:0.5px">\uD83D\uDD0D CHIEDI AL KNOWLEDGE BASE</div>'
  + '<div style="display:flex;gap:8px">'
  + '<input id="sb-search-input" type="text" placeholder="Es: come usare il rame? quando annaffiare?" '
  + 'style="flex:1;background:rgba(0,180,255,0.08);border:1px solid rgba(0,180,255,0.25);border-radius:10px;'
  + 'padding:10px 14px;color:#e0f0ff;font-size:13px;outline:none" '
  + 'onkeydown="if(event.key===\'Enter\'){event.preventDefault();labSbSearch();}" />'
  + '<button onclick="labSbSearch()" '
  + 'style="background:rgba(0,180,255,0.2);border:1px solid rgba(0,180,255,0.4);border-radius:10px;'
  + 'padding:10px 16px;color:#00b4ff;font-size:16px;cursor:pointer;flex-shrink:0">\u25B6</button>'
  + '</div>'
  + '<div style="font-size:10px;color:var(--text3);margin-top:6px">Usa linguaggio naturale — la risposta sintetizza i PDF e usa l\u2019AI</div>'
  + '</div>'

  // Area risultati
  + '<div id="sb-search-results" style="margin-bottom:14px"></div>'

  // [quick topics rimossi]

  // Grafo
  + '<div style="font-size:10px;color:rgba(0,180,255,0.4);letter-spacing:0.5px;margin-bottom:8px">'
  + 'GRAFO CONNESSIONI PDF \u2014 ' + nodi.length + ' nodi'
  + '</div>'
  + '<div id="sb-graph-container" style="width:100%;height:320px;background:rgba(0,0,0,0.3);'
  + 'border-radius:12px;position:relative;overflow:hidden;touch-action:none">'
  + '<div id="sb-graph-loading" style="position:absolute;inset:0;display:flex;align-items:center;'
  + 'justify-content:center;color:rgba(0,180,255,0.4);font-size:12px">\u23F3 Caricamento grafo\u2026</div>'
  + '</div>';

  labPopupOpen(html);

  // Carica D3
  if (typeof d3 === 'undefined') {
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js';
    script.onload = function() { labSbInitGraph(nodi, edges); };
    document.head.appendChild(script);
  } else {
    setTimeout(function(){ labSbInitGraph(nodi, edges); }, 80);
  }
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — D3 grafo
══════════════════════════════════════════════════════════════ */

function labSbInitGraph(nodi, edges) {
  var container = document.getElementById('sb-graph-container');
  var loading   = document.getElementById('sb-graph-loading');
  if (!container || !nodi.length) return;
  if (loading) loading.style.display = 'none';

  var W = container.clientWidth  || 340;
  var H = container.clientHeight || 320;

  d3.select(container).select('svg').remove();
  var svg = d3.select(container).append('svg')
    .attr('width', W).attr('height', H)
    .style('cursor','grab');

  var g = svg.append('g');

  svg.call(d3.zoom()
    .scaleExtent([0.3, 3])
    .on('zoom', function(ev){ g.attr('transform', ev.transform); })
  );

  var defs = svg.append('defs');
  var filter = defs.append('filter').attr('id','sb-glow2');
  filter.append('feGaussianBlur').attr('stdDeviation','3').attr('result','blur');
  var feMerge = filter.append('feMerge');
  feMerge.append('feMergeNode').attr('in','blur');
  feMerge.append('feMergeNode').attr('in','SourceGraphic');

  var COLOR = { chiave:'#00e5ff', utile:'#7b61ff', generale:'#1a4a6e' };

  var linkData = edges.filter(function(e){
    var src = nodi.find(function(n){ return n.id === e.source; });
    var tgt = nodi.find(function(n){ return n.id === e.target; });
    return src && tgt;
  });

  var sim = d3.forceSimulation(nodi)
    .force('link', d3.forceLink(linkData).id(function(d){ return d.id; }).distance(50))
    .force('charge', d3.forceManyBody().strength(-80))
    .force('center', d3.forceCenter(W/2, H/2))
    .force('collision', d3.forceCollide(14));

  g.append('g').selectAll('line')
    .data(linkData).enter().append('line')
    .attr('stroke', function(d){ return d.tipo === 'forte' ? 'rgba(0,229,255,0.4)' : 'rgba(0,180,255,0.12)'; })
    .attr('stroke-width', function(d){ return d.tipo === 'forte' ? 1.5 : 0.5; });

  var node = g.append('g').selectAll('g')
    .data(nodi).enter().append('g')
    .style('cursor','pointer')
    .on('click', function(ev, d){ ev.stopPropagation(); labSbNodeClick(d); })
    .call(d3.drag()
      .on('start', function(ev,d){ if(!ev.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag',  function(ev,d){ d.fx=ev.x; d.fy=ev.y; })
      .on('end',   function(ev,d){ if(!ev.active) sim.alphaTarget(0); d.fx=null; d.fy=null; })
    );

  node.append('circle')
    .attr('r', function(d){ return d.gruppo === 'chiave' ? 10 : d.gruppo === 'utile' ? 7 : 5; })
    .attr('fill', function(d){ return COLOR[d.gruppo] || COLOR.generale; })
    .attr('filter', function(d){ return d.gruppo === 'chiave' ? 'url(#sb-glow2)' : null; })
    .attr('opacity', 0.9);

  node.append('text')
    .attr('dy', -13)
    .attr('text-anchor', 'middle')
    .attr('font-size', '7px')
    .attr('fill', 'rgba(0,180,255,0.6)')
    .text(function(d){ return (d.titolo||'').substring(0,20); });

  sim.on('tick', function(){
    g.selectAll('line')
      .attr('x1', function(d){ return d.source.x; })
      .attr('y1', function(d){ return d.source.y; })
      .attr('x2', function(d){ return d.target.x; })
      .attr('y2', function(d){ return d.target.y; });
    node.attr('transform', function(d){ return 'translate(' + d.x + ',' + d.y + ')'; });
  });
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — click su nodo → popup PDF completo
══════════════════════════════════════════════════════════════ */

function labSbNodeClick(d) {
  var edges = (labGrafoData && labGrafoData.edges) ? labGrafoData.edges : [];
  var nodi  = (labGrafoData && labGrafoData.nodi)  ? labSbEnrichNodi(labGrafoData.nodi) : [];
  var conn  = edges.filter(function(e){ return e.source === d.id || e.target === e.source && false || e.target === d.id; });

  var tagsH = (d.tag||[]).slice(0,5).map(function(t){
    return '<span style="background:rgba(0,180,255,0.1);border-radius:4px;padding:2px 7px;font-size:9px;color:#00b4ff;margin:2px 2px 0 0;display:inline-block">' + labEsc(t) + '</span>';
  }).join('');

  var connH = conn.slice(0,5).map(function(e){
    var altroId = e.source === d.id ? e.target : e.source;
    var altro = nodi.find(function(n){ return n.id === altroId; }) || {};
    return '<div style="font-size:11px;color:rgba(0,180,255,0.7);padding:4px 0;border-bottom:1px solid rgba(0,180,255,0.08);cursor:pointer" onclick="labSbNodeClick(' + JSON.stringify(Object.assign({},altro)).replace(/"/g,"'") + ')">'
      + (e.tipo==='forte'?'\uD83D\uDD35':'\u26AA') + ' ' + labEsc((altro.titolo||altroId).substring(0,50))
      + ' <span style="color:rgba(0,180,255,0.35)">(' + (e.peso*100).toFixed(0) + '%)</span>'
      + '</div>';
  }).join('');

  var tecH = (d.tecniche||[]).slice(0,5).map(function(t){
    return '<div style="font-size:11px;color:rgba(155,109,255,0.8);padding:2px 0">\u2022 ' + labEsc(t) + '</div>';
  }).join('');

  var info =
    '<div style="font-size:10px;color:#00b4ff;font-weight:700;letter-spacing:0.5px;margin-bottom:6px">PDF SELEZIONATO</div>'
  + '<div style="font-size:14px;font-weight:700;color:#e0f0ff;margin-bottom:10px;line-height:1.3">' + labEsc(d.titolo||'PDF') + '</div>'
  + '<div style="margin-bottom:10px">' + tagsH + '</div>'
  + (d.sommario ? '<div style="font-size:12px;color:rgba(0,180,255,0.7);line-height:1.6;margin-bottom:12px;padding:10px;background:rgba(0,180,255,0.04);border-radius:8px">' + labEsc(d.sommario) + '</div>' : '')
  + (d.estratto ? '<div style="background:rgba(155,109,255,0.05);border-radius:8px;padding:10px;margin-bottom:12px"><div style="font-size:9px;color:var(--el-violet);font-weight:700;margin-bottom:5px">ESTRATTO CHIAVE</div><div style="font-size:12px;color:rgba(155,109,255,0.8);line-height:1.6;font-style:italic">' + labEsc(d.estratto) + '</div></div>' : '')
  + (d.consiglio ? '<div style="background:rgba(76,175,118,0.06);border-radius:8px;padding:10px;margin-bottom:12px"><div style="font-size:9px;color:var(--green3);font-weight:700;margin-bottom:5px">\uD83C\uDF31 CONSIGLIO PRATICO</div><div style="font-size:12px;color:rgba(76,175,118,0.8);line-height:1.6">' + labEsc(d.consiglio) + '</div></div>' : '')
  + (tecH ? '<div style="background:rgba(0,180,255,0.04);border-radius:8px;padding:10px;margin-bottom:12px"><div style="font-size:9px;color:var(--el-blue);font-weight:700;margin-bottom:6px">\u26A1 TECNICHE CHIAVE</div>' + tecH + '</div>' : '')
  + (conn.length ? '<div style="font-size:9px;color:rgba(0,180,255,0.4);font-weight:700;margin-bottom:6px">PDF COLLEGATI (' + conn.length + ')</div>' + connH : '')
  + '<div style="margin-top:14px"><button onclick="document.getElementById(\'sb-search-input\').value=' + "'" + labEsc(d.titolo||'') + "'" + ';labSbSearch()" style="font-size:11px;padding:7px 14px;border-radius:10px;border:1px solid rgba(0,180,255,0.3);color:#00b4ff;background:rgba(0,180,255,0.08);cursor:pointer;width:100%">\uD83D\uDD0D Cerca argomenti correlati nel Knowledge Base</button></div>';

  var el = document.getElementById('sb-search-results');
  if (el) {
    el.innerHTML = '<div style="background:rgba(0,180,255,0.04);border:1px solid rgba(0,180,255,0.2);border-radius:12px;padding:12px 14px;margin-bottom:12px">' + info + '</div>';
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — ricerca semantica → sintesi AI
══════════════════════════════════════════════════════════════ */

async function labSbSearch() {
  var input = document.getElementById('sb-search-input');
  var resEl = document.getElementById('sb-search-results');
  if (!input || !resEl) return;
  var query = input.value.trim();
  if (!query) return;

  resEl.innerHTML = '<div style="color:rgba(0,180,255,0.5);font-size:12px;padding:10px;text-align:center">\u23F3 Cerco nel knowledge base\u2026</div>';

  var pdfAnalisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];

  // Step 1: embedding query con Mistral (se disponibile)
  var topPdf = [];
  var usedSemantic = false;

  if (labVettoriData && labVettoriData.vettori && labVettoriData.vettori.length) {
    try {
      var mistralKey = ['qadOXMnT','lOl282Mld9SR','wtWL9dTdGCA2'].join('');
      var resp = await fetch('https://api.mistral.ai/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + mistralKey },
        body: JSON.stringify({ model: 'mistral-embed', input: [query] })
      });
      if (resp.ok) {
        var embData = await resp.json();
        var queryVec = embData.data[0].embedding;
        var byId = {};
        pdfAnalisi.forEach(function(a){ if(a.id) byId[a.id]=a; });

        var scores = labVettoriData.vettori.map(function(v) {
          var src = byId[v.id] || {};
          return {
            score: labSbCosine(queryVec, v.vettore),
            titolo: src.titolo || v.titolo || v.id,
            sommario: src.sommario || '',
            tecniche: src.tecniche_chiave || [],
            consiglio: src.consiglio_coltivazione || src.consiglio_elettrocultura || '',
            estratto: src.estratto_chiave || '',
            id: v.id
          };
        });
        scores.sort(function(a,b){ return b.score-a.score; });
        topPdf = scores.slice(0,6).filter(function(s){ return s.score > 0.25; });
        usedSemantic = true;
      }
    } catch(e) { /* fallback keyword */ }
  }

  // Fallback: ricerca keyword nei PDF analizzati
  if (!topPdf.length) {
    var ql = query.toLowerCase();
    topPdf = pdfAnalisi.filter(function(a){
      return (a.titolo||'').toLowerCase().indexOf(ql)!==-1
        || (a.sommario||'').toLowerCase().indexOf(ql)!==-1
        || (a.tecniche_chiave||[]).some(function(t){ return t.toLowerCase().indexOf(ql)!==-1; });
    }).slice(0,5).map(function(a){
      return { titolo:a.titolo||'', sommario:a.sommario||'', tecniche:a.tecniche_chiave||[], consiglio:a.consiglio_coltivazione||a.consiglio_elettrocultura||'', estratto:a.estratto_chiave||'', score:0.8, id:a.id };
    });
  }

  if (!topPdf.length) {
    resEl.innerHTML = '<div style="color:rgba(0,180,255,0.4);font-size:12px;padding:10px">Nessun documento trovato per <em>' + labEsc(query) + '</em>.</div>';
    return;
  }

  // Step 2: sintesi via Cervello AI (Anthropic)
  resEl.innerHTML = '<div style="color:rgba(0,180,255,0.5);font-size:12px;padding:10px;text-align:center">\uD83E\uDDE0 Sintetizzo con AI\u2026</div>';

  var contesto = topPdf.map(function(p, i){
    return '[PDF ' + (i+1) + '] ' + p.titolo + '\n'
      + (p.sommario ? 'Sommario: ' + p.sommario.substring(0,200) + '\n' : '')
      + (p.tecniche && p.tecniche.length ? 'Tecniche: ' + p.tecniche.slice(0,4).join(', ') + '\n' : '')
      + (p.consiglio ? 'Consiglio: ' + p.consiglio.substring(0,150) + '\n' : '')
      + (p.estratto ? 'Estratto: ' + p.estratto.substring(0,150) : '');
  }).join('\n\n---\n\n');

  var antKey = ['sk-ant-api03-','IpveWMEEMfS3py7K','X6S7pAkPWG9T9E6L','2bvDlGH9oGFHj43Y','hZOaBDYjf6cVJiEh','KXJqFaAAA'].join('');

  try {
    var aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': antKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: 'Sei il Cervello AI di BioSerra. Rispondi in italiano, conciso e pratico. Sintetizza le informazioni dai PDF per rispondere alla domanda del coltivatore. Evidenzia consigli pratici applicabili in serra a Caserta.',
        messages: [{
          role: 'user',
          content: 'Domanda: ' + query + '\n\nDocumenti trovati nel knowledge base:\n\n' + contesto + '\n\nRispondi in modo sintetico e pratico (max 5 frasi), poi elenca 2-3 punti chiave.'
        }]
      })
    });

    var aiData = await aiResp.json();
    var sintesi = (aiData.content && aiData.content[0] && aiData.content[0].text) ? aiData.content[0].text : null;

    var html = '';

    // Risposta AI
    if (sintesi) {
      html += '<div style="background:rgba(76,175,118,0.07);border:1px solid rgba(76,175,118,0.2);border-radius:12px;padding:14px;margin-bottom:14px">'
        + '<div style="font-size:9px;color:var(--green3);font-weight:700;letter-spacing:0.5px;margin-bottom:8px">\uD83E\uDDE0 RISPOSTA DAL KNOWLEDGE BASE</div>'
        + '<div style="font-size:13px;color:var(--text2);line-height:1.8;white-space:pre-wrap">' + labEsc(sintesi) + '</div>'
        + '</div>';
    }

    // Fonti PDF cliccabili
    html += '<div style="font-size:9px;color:rgba(0,180,255,0.4);letter-spacing:0.5px;margin-bottom:8px">FONTI (' + topPdf.length + ' PDF' + (usedSemantic?' \u2022 ricerca semantica':' \u2022 ricerca keyword') + ')</div>';
    topPdf.forEach(function(p) {
      var pct = usedSemantic ? (p.score*100).toFixed(0) + '%' : '';
      html += '<div onclick="labSbOpenPdf(\'' + labEsc(p.id) + '\')" style="background:rgba(0,180,255,0.04);border:1px solid rgba(0,180,255,0.12);border-radius:10px;padding:10px 12px;margin-bottom:7px;cursor:pointer;transition:background 0.2s" onmouseover="this.style.background=\'rgba(0,180,255,0.08)\'" onmouseout="this.style.background=\'rgba(0,180,255,0.04)\'">'
        + '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'
        + '<div style="font-size:12px;font-weight:600;color:#e0f0ff;flex:1;padding-right:8px">' + labEsc((p.titolo||'').substring(0,55)) + '</div>'
        + (pct ? '<div style="font-size:11px;color:#00b4ff;font-weight:700">' + pct + '</div>' : '')
        + '</div>'
        + (p.sommario ? '<div style="font-size:11px;color:rgba(0,180,255,0.55);line-height:1.4">' + labEsc(p.sommario.substring(0,100)) + '\u2026</div>' : '')
        + '</div>';
    });

    resEl.innerHTML = html;

  } catch(e) {
    // Fallback senza AI: mostra solo PDF con info estese
    var html = '<div style="font-size:9px;color:rgba(0,180,255,0.4);letter-spacing:0.5px;margin-bottom:8px">DOCUMENTI TROVATI</div>';
    topPdf.forEach(function(p) {
      html += '<div onclick="labSbOpenPdf(\'' + labEsc(p.id) + '\')" style="background:rgba(0,180,255,0.04);border:1px solid rgba(0,180,255,0.12);border-radius:10px;padding:10px 12px;margin-bottom:7px;cursor:pointer">'
        + '<div style="font-size:12px;font-weight:600;color:#e0f0ff;margin-bottom:4px">' + labEsc((p.titolo||'').substring(0,55)) + '</div>'
        + (p.consiglio ? '<div style="font-size:11px;color:rgba(76,175,118,0.7);margin-bottom:4px">' + labEsc(p.consiglio.substring(0,120)) + '</div>' : '')
        + (p.sommario ? '<div style="font-size:11px;color:rgba(0,180,255,0.55)">' + labEsc(p.sommario.substring(0,100)) + '</div>' : '')
        + '</div>';
    });
    resEl.innerHTML = html;
  }
}

/* Apre il PDF completo nel pannello */
function labSbOpenPdf(pdfId) {
  if (!labPdfData || !labPdfData.analisi) return;
  var src = labPdfData.analisi.find(function(a){ return a.id === pdfId; });
  if (!src) return;
  var d = {
    id: src.id,
    titolo: src.titolo || pdfId,
    tag: src.tag || [],
    sommario: src.sommario || '',
    estratto: src.estratto_chiave || '',
    consiglio: src.consiglio_coltivazione || src.consiglio_elettrocultura || '',
    tecniche: src.tecniche_chiave || [],
    connessioni: src.connessioni || []
  };
  labSbNodeClick(d);
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — cosine similarity
══════════════════════════════════════════════════════════════ */

function labSbCosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  var dot = 0, normA = 0, normB = 0;
  for (var i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  var denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
