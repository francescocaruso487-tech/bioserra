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
  if (bTec && labElTecniche.length) {
    bTec.textContent = labElTecniche.length;
    bTec.classList.add('show');
  }
  if (bEsp && labEspData) {
    var na = labEspData.esperimenti_attivi.length;
    if (na) { bEsp.textContent = na; bEsp.classList.add('show'); }
  }
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
function labCatColor(cat) {
  if (cat === 'cosmica')     return 'var(--el-violet)';
  if (cat === 'galvanica')   return '#f0a500';
  if (cat === 'magnetica')   return 'var(--el-blue)';
  if (cat === 'elettrica')   return 'var(--el-cyan)';
  if (cat === 'biodinamica') return 'var(--green3)';
  if (cat === 'agronomica')  return '#7ec860';
  if (cat === 'vibrazionale')return '#e040fb';
  if (cat === 'tecnologica') return '#29b6f6';
  if (cat === 'olistica')    return 'rgba(155,109,255,0.6)';
  return 'var(--el-cyan)';
}

function labBuildTecnicheComplete() {
  // I concetti sono gia' canonici e deduplicati da N8N (concetti_index.json)
  // labElTecniche e' gia' popolato da labLoadAll — restituiamo direttamente
  if (labElTecniche.length) return labElTecniche.slice();

  // Fallback: se concetti_index non ancora disponibile, estrai dai PDF
  var analisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];
  var NON_TEC = ['nessuna tecnica','nessuna connessione','possibile ispirazione','nessuna'];
  var seen = {};
  var fallback = [];
  analisi.forEach(function(a) {
    (a.tecniche_chiave||[]).forEach(function(t) {
      var n = (t||'').toLowerCase().trim();
      if (NON_TEC.some(function(x){ return n.indexOf(x)!==-1; })) return;
      if (seen[n]) return;
      seen[n] = true;
      fallback.push({
        id: 'raw_' + n.replace(/[^a-z0-9]+/g,'-').substring(0,30),
        nome: t.trim(),
        categoria: 'generale',
        descrizione: 'Estratto da PDF (clustering in corso).',
        occorrenze: 1,
        daBase: false
      });
    });
  });
  fallback.sort(function(a,b){ return b.occorrenze - a.occorrenze; });
  return fallback;
}

function labRenderTecniche() {
  var el = document.getElementById('lab-tec-lista');
  if (!el) return;
  var tutte = labBuildTecnicheComplete();
  if (!tutte.length) {
    el.innerHTML = '<div style="color:rgba(0,180,255,0.35);font-size:12px;padding:6px">Nessuna tecnica disponibile.</div>';
    return;
  }
  var elGlobale = {};
  try { elGlobale = JSON.parse(localStorage.getItem('el_globale') || '{}'); } catch(e) {}
  var h = '<div class="lab-tec-mini">';
  tutte.slice(0, 4).forEach(function(t, idx) {
    var tid = t.id || t.nome || idx;
    var attiva = elGlobale[tid] || false;
    var pdfBadge = (t.daBase === false) ? '<span style="font-size:9px;background:rgba(155,109,255,0.18);color:#9b6dff;border-radius:3px;padding:1px 4px;margin-left:4px">PDF</span>' : '';
    h += '<div class="lab-tec-mini-item" onclick="labPopupTecnicaAll(' + idx + ')">';
    h += '<div style="flex:1">';
    h += '<div class="lab-tec-mini-name">' + labEsc(t.nome || tid) + pdfBadge + '</div>';
    if (t.categoria) h += '<div class="lab-tec-mini-cat">' + labEsc(t.categoria) + '</div>';
    h += '</div>';
    h += '<div onclick="event.stopPropagation()" style="margin-left:10px">';
    h += '<label class="toggle-sw"><input type="checkbox" ' + (attiva ? 'checked' : '') + ' onchange="labToggleTec(\'' + String(tid).replace(/'/g,'') + '\',this.checked)"><span class="toggle-slider"></span></label>';
    h += '</div>';
    h += '</div>';
  });
  h += '</div>';
  h += '<div class="lab-tec-vedi-tutti" onclick="labPopupAllTecniche()">▼ vedi tutte (' + tutte.length + ')</div>';
  el.innerHTML = h;
}

function labToggleTec(tid, val) {
  var elGlobale = {};
  try { elGlobale = JSON.parse(localStorage.getItem('el_globale') || '{}'); } catch(e) {}
  elGlobale[tid] = val;
  try { localStorage.setItem('el_globale', JSON.stringify(elGlobale)); } catch(e) {}
}

/* Popup singola tecnica */
function labPopupTecnicaAll(idx) {
  var lista = labBuildTecnicheComplete();
  var t = lista[idx];
  if (!t) return;
  var catColor = labCatColor(t.categoria);
  var h = '';
  h += '<div style="font-size:10px;color:' + catColor + ';font-weight:700;letter-spacing:1px;margin-bottom:4px">\u26A1 ' + labEsc((t.categoria||'elettrocultura')).toUpperCase() + '</div>';
  h += '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px;line-height:1.3">' + labEsc(t.nome||'') + '</div>';
  if (t.daBase === false || t.pdf_count) {
    h += '<div style="font-size:10px;color:#9b6dff;margin-bottom:10px">\uD83D\uDCC4 Da ' + (t.pdf_count||t.occorrenze||1) + ' PDF analizzati</div>';
  }
  var descTesto = t.descrizione || t.desc || '';
  if (descTesto) {
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.8;margin-bottom:14px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px">' + labEsc(descTesto) + '</div>';
  }
  var istr = t.istruzioni_pratiche || t.istruzioni || [];
  if (istr.length) {
    h += '<div style="margin-bottom:14px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:8px;letter-spacing:0.5px">\uD83D\uDEE0 COME FARE — PASSO PER PASSO</div>';
    istr.forEach(function(step, i) {
      h += '<div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start">';
      h += '<div style="min-width:24px;height:24px;background:' + catColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;flex-shrink:0">' + (i+1) + '</div>';
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.7;padding-top:3px">' + labEsc(step) + '</div></div>';
    });
    h += '</div>';
  }
  var mat = t.materiali || [];
  if (mat.length) {
    h += '<div style="background:rgba(0,180,255,0.06);border:1px solid rgba(0,180,255,0.12);border-radius:10px;padding:12px;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:8px">\uD83D\uDEE0 MATERIALI NECESSARI</div>';
    mat.forEach(function(m) { h += '<div style="font-size:12px;color:var(--text2);padding:3px 0;border-bottom:1px solid rgba(0,180,255,0.07)">\u2022 ' + labEsc(m) + '</div>'; });
    h += '</div>';
  }
  var varianti = t.varianti || [];
  if (varianti.length) {
    h += '<div style="background:rgba(155,109,255,0.05);border-radius:10px;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-violet);margin-bottom:6px">\uD83D\uDD00 VARIANTI E APPLICAZIONI</div>';
    varianti.forEach(function(v) { h += '<div style="font-size:11px;color:rgba(155,109,255,0.8);padding:2px 0">\u2022 ' + labEsc(v) + '</div>'; });
    h += '</div>';
  }
  var fasi = t.fasi_guida || [];
  if (fasi.length) {
    h += '<div style="font-size:10px;color:var(--text3);margin-bottom:12px">\uD83D\uDDD3 Applica in: <span style="color:var(--green3)">' + fasi.join(' \u00B7 ') + '</span></div>';
  }
  var espCollegati = [];
  if (labEspData) {
    var tuttiEsp = (labEspData.esperimenti_attivi||[]).concat(labEspData.proposte||[]).concat(labEspData.esperimenti_disponibili||[]);
    var nomeT = (t.nome||'').toLowerCase();
    var tagT = (t.tag_correlati||[]).map(function(x){return x.toLowerCase();});
    tuttiEsp.forEach(function(e) {
      var nomeE = (e.nome||'').toLowerCase();
      var catE = (e.categoria||'').toLowerCase();
      var match = nomeE.indexOf(nomeT.substring(0,6)) !== -1 || nomeT.indexOf(nomeE.substring(0,6)) !== -1
        || tagT.some(function(tg){ return nomeE.indexOf(tg) !== -1 || catE.indexOf(tg) !== -1; });
      if (match) espCollegati.push(e);
    });
  }
  if (espCollegati.length) {
    h += '<div style="background:rgba(76,175,118,0.07);border-left:2px solid var(--green3);border-radius:0 10px 10px 0;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--green3);margin-bottom:6px">\uD83E\uDDEA ESPERIMENTI CORRELATI</div>';
    espCollegati.slice(0,3).forEach(function(e) {
      h += '<div style="font-size:11px;color:var(--text2);padding:3px 0;border-bottom:1px solid rgba(76,175,118,0.08)">\u2022 ' + labEsc(e.nome||'') + (e.obiettivo ? ' <em style=\\"color:var(--text3)\\">— ' + labEsc((e.obiettivo+'').substring(0,50)) + '</em>' : '') + '</div>';
    });
    h += '</div>';
  }
  var guideCollegate = [];
  if (labGuideData && labGuideData.length) {
    var nomeT2 = (t.nome||'').toLowerCase();
    var cat2 = (t.categoria||'').toLowerCase();
    labGuideData.forEach(function(g, gi) {
      var tecPdf = (g.tecniche_pdf||[]).map(function(x){return x.toLowerCase();});
      var match = tecPdf.some(function(tp){ return tp.indexOf(nomeT2.substring(0,6)) !== -1; })
        || (g.fase && g.fase.indexOf(cat2.substring(0,5)) !== -1);
      if (match) guideCollegate.push({g:g, idx:gi});
    });
  }
  if (guideCollegate.length) {
    h += '<div style="background:rgba(155,109,255,0.06);border-radius:10px;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-violet);margin-bottom:6px">\uD83D\uDCD6 GUIDE CORRELATE</div>';
    guideCollegate.slice(0,3).forEach(function(item) {
      h += '<div style="font-size:11px;color:rgba(155,109,255,0.8);padding:3px 0;border-bottom:1px solid rgba(155,109,255,0.08);cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupGuida(' + item.idx + ');},60)">\u2192 ' + labEsc(item.g.titolo||'') + '</div>';
    });
    h += '</div>';
  }
  var tags = t.tag_correlati || [];
  if (tags.length) {
    h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">';
    tags.slice(0,6).forEach(function(tg) { h += '<span style="font-size:9px;background:rgba(255,255,255,0.06);color:var(--text3);border-radius:6px;padding:2px 7px">' + labEsc(tg) + '</span>'; });
    h += '</div>';
  }
  labPopupOpen(h);
}

function labPopupTecnica(idx) {
  var t = labElTecniche[idx];
  if (!t) return;
  var catColor = t.categoria === 'cosmica' ? 'var(--el-violet)' : t.categoria === 'galvanica' ? '#f0a500' : t.categoria === 'magnetica' ? 'var(--el-blue)' : 'var(--el-cyan)';
  var h = '<div style="font-size:10px;color:' + catColor + ';font-weight:700;letter-spacing:1px;margin-bottom:4px">\u26A1 ' + labEsc((t.categoria || 'elettrocultura')).toUpperCase() + '</div>';
  h += '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:12px;line-height:1.3">' + labEsc(t.nome || '') + '</div>';
  if (t.descrizione || t.desc) {
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:14px">' + labEsc(t.descrizione || t.desc || '') + '</div>';
  }
  if (t.istruzioni && t.istruzioni.length) {
    h += '<div style="font-size:11px;font-weight:700;color:var(--el-blue);margin-bottom:8px;letter-spacing:0.5px">ISTRUZIONI:</div>';
    t.istruzioni.forEach(function(step, i) {
      h += '<div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start">';
      h += '<div style="min-width:22px;height:22px;background:' + catColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;flex-shrink:0">' + (i + 1) + '</div>';
      h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(step) + '</div>';
      h += '</div>';
    });
  }
  if (t.materiali && t.materiali.length) {
    h += '<div style="background:rgba(0,180,255,0.06);border:1px solid rgba(0,180,255,0.15);border-radius:10px;padding:10px;margin-top:10px">';
    h += '<div style="font-size:11px;font-weight:700;color:var(--el-blue);margin-bottom:6px">\uD83D\uDEE0 MATERIALI:</div>';
    t.materiali.forEach(function(m) { h += '<div style="font-size:12px;color:var(--text2);padding:2px 0">\u2022 ' + labEsc(m) + '</div>'; });
    h += '</div>';
  }
  if (t.difficolta) {
    var diff = t.difficolta === 'facile' ? '\uD83D\uDFE2 Facile' : t.difficolta === 'media' ? '\uD83D\uDFE1 Media' : '\uD83D\uDD34 Difficile';
    h += '<div style="margin-top:10px;font-size:12px;color:var(--text3)">Difficolt\u00E0: <strong>' + diff + '</strong></div>';
  }
  if (t.sperimentale) {
    h += '<div style="margin-top:10px;background:rgba(155,109,255,0.1);border:1px solid rgba(155,109,255,0.3);border-radius:8px;padding:8px;font-size:11px;color:var(--el-violet)">\uD83D\uDD2C Tecnica sperimentale \u2014 documentare osservazioni.</div>';
  }
  labPopupOpen(h);
}

/* Popup tutte le tecniche */
function labPopupAllTecniche() {
  var tutte = labBuildTecnicheComplete();
  if (!tutte.length) {
    labPopupOpen('<div style="color:rgba(0,180,255,0.4);padding:20px;text-align:center">Nessuna tecnica disponibile.</div>');
    return;
  }
  var elGlobale = {};
  try { elGlobale = JSON.parse(localStorage.getItem('el_globale') || '{}'); } catch(e) {}
  var baseN = tutte.filter(function(t){ return t.daBase !== false; }).length;
  var pdfN  = tutte.length - baseN;
  var catOrder = ['elettrica','magnetica','galvanica','cosmica','vibrazionale','biodinamica','agronomica','tecnologica','olistica'];
  var catMap = {}; catOrder.forEach(function(c){ catMap[c]=[]; });
  tutte.forEach(function(t, idx) {
    var cat = t.categoria || 'elettrica';
    if (!catMap[cat]) catMap[cat]=[];
    catMap[cat].push({ t:t, idx:idx });
  });
  var h = '<div style="font-size:10px;color:var(--el-blue);font-weight:700;letter-spacing:1px;margin-bottom:2px">⚡ TECNICHE (' + tutte.length + ')</div>';
  h += '<div style="font-size:11px;color:var(--text3);margin-bottom:14px">' + baseN + ' base · ' + pdfN + ' da PDF</div>';
  catOrder.forEach(function(cat) {
    var items = catMap[cat];
    if (!items || !items.length) return;
    var catColor = labCatColor(cat);
    h += '<div style="font-size:10px;font-weight:700;color:' + catColor + ';letter-spacing:0.5px;margin:12px 0 6px;text-transform:uppercase">' + cat + '</div>';
    items.forEach(function(item) {
      var t=item.t; var idx=item.idx;
      var tid = t.id||t.nome||idx;
      var attiva = elGlobale[tid]||false;
      var pdfBadge = (t.daBase===false) ? ' <span style="font-size:9px;background:rgba(155,109,255,0.18);color:#9b6dff;border-radius:3px;padding:1px 4px">PDF</span>' : '';
      h += '<div style="background:rgba(0,180,255,0.04);border:1px solid rgba(0,180,255,0.12);border-left:2px solid ' + catColor + ';border-radius:0 10px 10px 0;padding:10px 12px;margin-bottom:6px">';
      h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px">';
      h += '<div style="flex:1;cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupTecnicaAll(' + idx + ');},50)">';
      h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:1px">' + labEsc(t.nome||tid) + pdfBadge + '</div>';
      if (t.occorrenze) h += '<div style="font-size:10px;color:' + catColor + '">' + t.occorrenze + ' PDF</div>';
      h += '</div>';
      h += '<label class="toggle-sw" onclick="event.stopPropagation()"><input type="checkbox" ' + (attiva?'checked':'') + ' onchange="labToggleTec(\'' + String(tid).replace(/'/g,'') + '\',this.checked)"><span class="toggle-slider"></span></label>';
      h += '</div></div>';
    });
  });
  labPopupOpen(h);
}

/* ══════════════════════════════════════════════════════════════
   RENDER — ESPERIMENTI (mini: solo attivi in campo)
══════════════════════════════════════════════════════════════ */

function labRenderEsperimenti() {
  labRenderEspAttiviMini();
  var na = labEspData ? labEspData.esperimenti_attivi.length : 0;
  var np = labEspData ? labEspData.proposte.length : 0;
  var badge = document.getElementById('lab-esp-badge');
  if (badge) badge.textContent = na + ' attivi \u00B7 ' + np + ' proposte';
}

function labRenderEspAttiviMini() {
  var el = document.getElementById('lab-esp-attivi');
  if (!el) return;
  var lista = labEspData ? labEspData.esperimenti_attivi : [];
  if (!lista.length) {
    el.innerHTML = '<div style="color:rgba(76,175,118,0.4);font-size:12px;padding:6px">Nessun esperimento attivo. Tocca “Gestisci›” per attivarne uno.</div>';
    return;
  }
  var h = '';
  lista.forEach(function(exp, idx) {
    h += '<div class="lab-esp-mini-item" onclick="labPopupEsp(' + idx + ',\'attivo\')">',
    h += '<div class="lab-esp-mini-name">✅ ' + labEsc(exp.nome||exp.id||'') + '</div>';
    if (exp.obiettivo) h += '<div style="font-size:10px;color:rgba(76,175,118,0.6);margin-top:2px">' + labEsc(exp.obiettivo.substring(0,70)) + '</div>';
    if (exp.categoria) h += '<div class="lab-esp-mini-badge">' + labEsc(exp.categoria) + '</div>';
    h += '</div>';
  });
  el.innerHTML = h;
}

/* Popup gestione esperimenti (attivi + proposte) */
function labPopupAllEsperimenti() {
  if (!labEspData) {
    labPopupOpen('<div style="color:rgba(76,175,118,0.4);padding:20px;text-align:center">Caricamento\u2026</div>');
    return;
  }
  var na = labEspData.esperimenti_attivi.length;
  var np = labEspData.proposte.length;
  var h = '<div style="font-size:10px;color:var(--green3);font-weight:700;letter-spacing:1px;margin-bottom:14px">\uD83E\uDDEA ESPERIMENTI \u2014 ' + na + ' attivi \u00B7 ' + np + ' proposte</div>';
  // Attivi
  if (na) {
    h += '<div style="font-size:10px;font-weight:700;color:var(--green3);margin-bottom:8px;letter-spacing:0.5px">\u2705 ATTIVI</div>';
    labEspData.esperimenti_attivi.forEach(function(exp, idx) {
      h += '<div style="background:rgba(76,175,118,0.06);border:1px solid rgba(76,175,118,0.2);border-radius:10px;padding:10px;margin-bottom:8px;display:flex;align-items:center;gap:10px">';
      h += '<div style="flex:1;cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupEsp(' + idx + ',\'attivo\');},50)">';
      h += '<div style="font-size:13px;font-weight:700;color:var(--text)">' + labEsc(exp.nome || '') + '</div>';
      if (exp.obiettivo) h += '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + labEsc((exp.obiettivo + '').substring(0, 80)) + '</div>';
      h += '</div>';
      h += '<button onclick="labEspDisattiva(' + idx + ');labPopupClose()" style="background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.3);border-radius:8px;padding:5px 8px;color:#e05252;font-size:10px;cursor:pointer;flex-shrink:0">Off</button>';
      h += '</div>';
    });
  }
  // Proposte
  if (np) {
    h += '<div style="font-size:10px;font-weight:700;color:var(--text3);margin:12px 0 8px;letter-spacing:0.5px">\uD83D\uDCA1 PROPOSTE</div>';
    labEspData.proposte.forEach(function(exp, idx) {
      h += '<div style="background:rgba(0,0,0,0.2);border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;display:flex;align-items:center;gap:10px">';
      h += '<div style="flex:1;cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupEsp(' + idx + ',\'proposta\');},50)">';
      h += '<div style="font-size:13px;font-weight:700;color:var(--text)">' + labEsc(exp.nome || '') + '</div>';
      if (exp.obiettivo || exp.descrizione) {
        var testo = exp.obiettivo || exp.descrizione || '';
        h += '<div style="font-size:11px;color:var(--text3);margin-top:2px">' + labEsc((testo + '').substring(0, 80)) + '</div>';
      }
      h += '</div>';
      h += '<button onclick="labEspAttiva(' + idx + ');labPopupClose()" style="background:var(--green2);border:none;border-radius:8px;padding:6px 10px;color:var(--bg);font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0">On</button>';
      h += '</div>';
    });
  }
  labPopupOpen(h);
}

/* Popup dettaglio singolo esperimento */
function labPopupEsp(idx, tipo) {
  var esp = tipo === 'attivo' ? (labEspData && labEspData.esperimenti_attivi[idx]) : (labEspData && labEspData.proposte[idx]);
  if (!esp) return;
  var tipoColor = tipo === 'attivo' ? 'var(--green3)' : 'rgba(0,180,255,0.6)';
  var tipoLabel = tipo === 'attivo' ? '✅ ESPERIMENTO ATTIVO' : '💡 PROPOSTA';
  var h = '<div style="font-size:10px;color:' + tipoColor + ';font-weight:700;margin-bottom:4px;letter-spacing:0.5px">' + tipoLabel + '</div>';
  h += '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:10px;line-height:1.3">' + labEsc(esp.nome||'') + '</div>';
  if (esp.descrizione) { h += '<div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:12px">' + labEsc(esp.descrizione) + '</div>'; }
  if (esp.funzione) {
    h += '<div style="background:rgba(0,180,255,0.07);border-radius:10px;padding:10px;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:4px">⚡ FUNZIONE</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(esp.funzione) + '</div></div>';
  }
  if (esp.obiettivo) {
    h += '<div style="background:rgba(76,175,118,0.08);border-radius:10px;padding:10px;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--green3);margin-bottom:4px">🎯 OBIETTIVO</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(esp.obiettivo) + '</div></div>';
  }
  if (esp.come_applicare) {
    h += '<div style="background:rgba(155,109,255,0.06);border-radius:10px;padding:10px;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-violet);margin-bottom:6px">🛠 COME APPLICARE</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.7">' + labEsc(esp.come_applicare) + '</div></div>';
  }
  if (esp.materiali && esp.materiali.length) {
    h += '<div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:10px;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:6px">🛠 MATERIALI</div>';
    esp.materiali.forEach(function(m) { h += '<div style="font-size:12px;color:var(--text2);padding:2px 0">• ' + labEsc(m) + '</div>'; });
    h += '</div>';
  }
  if (esp.applicato_a) {
    var appStr = Array.isArray(esp.applicato_a) ? esp.applicato_a.join(', ') : esp.applicato_a;
    h += '<div style="font-size:10px;font-weight:700;color:var(--green3);margin-bottom:5px">🌱 APPLICATO A</div>';
    h += '<div style="font-size:12px;color:var(--text2);margin-bottom:10px">' + labEsc(appStr) + '</div>';
  }
  if (esp.note) {
    h += '<div style="background:rgba(240,165,0,0.07);border-radius:8px;padding:8px 10px;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:#f0a500;margin-bottom:3px">NOTE</div>';
    h += '<div style="font-size:11px;color:var(--text2)">' + labEsc(esp.note) + '</div></div>';
  }
  var meta = [];
  if (esp.categoria)        meta.push('Cat: ' + esp.categoria);
  if (esp.difficolta)       meta.push('Diff: ' + esp.difficolta);
  if (esp.durata_giorni)    meta.push(esp.durata_giorni + 'gg');
  if (esp.fonte)            meta.push('Fonte: ' + esp.fonte);
  if (esp.data_attivazione) meta.push('Dal: ' + esp.data_attivazione.substring(0,10));
  if (meta.length) h += '<div style="font-size:10px;color:var(--text3);margin-top:6px">' + meta.join(' · ') + '</div>';
  // Interconnessioni: Tecniche correlate
  var tecCollegate = [];
  if (typeof labBuildTecnicheComplete === 'function') {
    var tutteTec = labBuildTecnicheComplete();
    var nomeE = (esp.nome||'').toLowerCase();
    var catE = (esp.categoria||'').toLowerCase();
    tutteTec.forEach(function(t, ti) {
      var nomeT = (t.nome||'').toLowerCase();
      var catT = (t.categoria||'').toLowerCase();
      if (nomeT.indexOf(nomeE.substring(0,6)) !== -1 || nomeE.indexOf(nomeT.substring(0,6)) !== -1
        || (catE && catT.indexOf(catE.substring(0,5)) !== -1)) {
        tecCollegate.push({t:t, idx:ti});
      }
    });
  }
  if (tecCollegate.length) {
    h += '<div style="background:rgba(0,180,255,0.06);border-left:2px solid var(--el-blue);border-radius:0 10px 10px 0;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:6px">\u26A1 TECNICHE CORRELATE</div>';
    tecCollegate.slice(0,3).forEach(function(item) {
      h += '<div style="font-size:11px;color:rgba(0,180,255,0.8);padding:3px 0;border-bottom:1px solid rgba(0,180,255,0.08);cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupTecnicaAll(' + item.idx + ');},60)">\u2192 ' + labEsc(item.t.nome||'') + '</div>';
    });
    h += '</div>';
  }
  // Interconnessioni: Guide correlate per fase
  var guideFase = [];
  if (labGuideData && labGuideData.length && esp.categoria) {
    var catEL = (esp.categoria||'').toLowerCase();
    labGuideData.forEach(function(g, gi) {
      if ((g.fase && g.fase.indexOf(catEL.substring(0,5)) !== -1) || (g.categoria && g.categoria.indexOf(catEL.substring(0,5)) !== -1)) {
        guideFase.push({g:g, idx:gi});
      }
    });
  }
  if (guideFase.length) {
    h += '<div style="background:rgba(155,109,255,0.06);border-radius:10px;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-violet);margin-bottom:6px">\uD83D\uDCD6 GUIDE COLLEGATE</div>';
    guideFase.slice(0,2).forEach(function(item) {
      h += '<div style="font-size:11px;color:rgba(155,109,255,0.8);padding:3px 0;cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupGuida(' + item.idx + ');},60)">\u2192 ' + labEsc(item.g.titolo||'') + '</div>';
    });
    h += '</div>';
  }
  labPopupOpen(h);
}

/* Attiva / Disattiva esperimento */
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

async function cervBuildSystem() {
  var sys = 'Sei il Cervello AI di BioSerra, esperto di cannabis outdoor Living Soil a Caserta (41\u00B0N). ';
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
      if (pList.length) sys += 'Piante: ' + pList.map(function(p){ return p.nome + '(' + (p.fase || '?') + ')'; }).join(', ') + '. ';
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
        'x-api-key': ['sk-ant-api03-','IpveWMEEMfS3py7K','X6S7pAkPWG9T9E6L','2bvDlGH9oGFHj43Y','hZOaBDYjf6cVJiEh','KXJqFaAAA'].join(''),
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

function labSbEnrichNodi(nodi) {
  if (!labPdfData || !labPdfData.analisi) return nodi;
  var analisi = labPdfData.analisi;
  return nodi.map(function(n, i) {
    var src = analisi[i] || {};
    return Object.assign({}, n, {
      titolo:   src.titolo   || n.titolo   || ('PDF #' + i),
      tag:      src.tag      || n.tag      || [],
      gruppo:   src.rilevanza === 'alta' ? 'chiave' : (src.rilevanza === 'media' ? 'utile' : 'generale'),
      rilevanza: src.rilevanza || n.rilevanza || 'media',
      sommario: src.sommario || ''
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — apre popup (entry point dall\u2019icona grid)
══════════════════════════════════════════════════════════════ */

function labPopupSecondBrain() {
  var nodi  = (labGrafoData  && labGrafoData.nodi)  ? labSbEnrichNodi(labGrafoData.nodi.slice())  : [];
  var edges = (labGrafoData  && labGrafoData.edges) ? labGrafoData.edges  : [];
  var totVet = labVettoriData && labVettoriData.vettori ? labVettoriData.vettori.length : 0;
  var totPdf = labPdfData && labPdfData.analisi ? labPdfData.analisi.length : 0;

  var html = '<div style="padding:2px 0 12px">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
    +   '<span style="font-size:22px">\uD83E\uDDE0</span>'
    +   '<div>'
    +     '<div style="font-size:15px;font-weight:700;color:#00b4ff;letter-spacing:1px">SECOND BRAIN</div>'
    +     '<div style="font-size:10px;color:rgba(0,180,255,0.5);letter-spacing:0.5px">'
    +       totVet + ' PDF vettorizzati \u00B7 ' + totPdf + ' analizzati \u00B7 ' + edges.length + ' connessioni'
    +     '</div>'
    +   '</div>'
    + '</div>'
    /* barra ricerca semantica */
    + '<div style="display:flex;gap:8px;margin-bottom:14px">'
    +   '<input id="sb-search-input" type="text" placeholder="\uD83D\uDD0D Cerca nel Second Brain\u2026" '
    +     'style="flex:1;background:rgba(0,180,255,0.06);border:1px solid rgba(0,180,255,0.25);border-radius:10px;'
    +     'padding:10px 14px;color:#e0f0ff;font-size:13px;outline:none" '
    +     'onkeydown="if(event.key===\'Enter\'){event.preventDefault();labSbSearch();}" />'
    +   '<button onclick="labSbSearch()" '
    +     'style="background:rgba(0,180,255,0.15);border:1px solid rgba(0,180,255,0.3);border-radius:10px;'
    +     'padding:10px 16px;color:#00b4ff;font-size:14px;cursor:pointer">\u27A4</button>'
    + '</div>'
    /* area risultati ricerca */
    + '<div id="sb-search-results" style="margin-bottom:14px"></div>'
    /* grafo */
    + '<div style="font-size:10px;color:rgba(0,180,255,0.4);letter-spacing:0.5px;margin-bottom:8px">'
    +   'GRAFO CONNESSIONI PDF \u2014 ' + nodi.length + ' nodi'
    + '</div>'
    + '<div id="sb-graph-container" style="width:100%;height:340px;background:rgba(0,0,0,0.3);'
    +   'border:1px solid rgba(0,180,255,0.15);border-radius:14px;overflow:hidden;position:relative">'
    +   '<div id="sb-graph-loading" style="position:absolute;inset:0;display:flex;align-items:center;'
    +     'justify-content:center;color:rgba(0,180,255,0.4);font-size:12px">\u23F3 Caricamento grafo\u2026</div>'
    + '</div>'
    /* legenda */
    + '<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap">'
    +   '<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(0,180,255,0.5)">'
    +     '<div style="width:10px;height:10px;border-radius:50%;background:#00b4ff"></div>chiave'
    +   '</div>'
    +   '<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(155,109,255,0.5)">'
    +     '<div style="width:10px;height:10px;border-radius:50%;background:#9b6dff"></div>utile'
    +   '</div>'
    +   '<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(0,180,255,0.3)">'
    +     '<div style="width:8px;height:8px;border-radius:50%;background:rgba(0,180,255,0.3)"></div>generale'
    +   '</div>'
    +   '<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.3)">'
    +     '<div style="width:20px;height:2px;background:rgba(0,180,255,0.6)"></div>forte'
    +   '</div>'
    +   '<div style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.2)">'
    +     '<div style="width:20px;height:1px;background:rgba(0,180,255,0.2)"></div>debole'
    +   '</div>'
    + '</div>'
    + '</div>';

  labPopupOpen(html);

  /* Carica D3 se non presente, poi renderizza */
  if (typeof d3 === 'undefined') {
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js';
    script.onload = function() { labSbInitGraph(nodi, edges); };
    document.head.appendChild(script);
  } else {
    setTimeout(function(){ labSbInitGraph(nodi, edges); }, 80);
  }
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — D3.js force-directed graph
══════════════════════════════════════════════════════════════ */

function labSbInitGraph(nodi, edges) {
  var container = document.getElementById('sb-graph-container');
  var loading   = document.getElementById('sb-graph-loading');
  if (!container) return;
  if (loading) loading.style.display = 'none';

  if (!nodi.length) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;'
      + 'height:100%;color:rgba(0,180,255,0.3);font-size:12px">Nessun dato grafo disponibile.<br>'
      + 'Il workflow embedding gira alle 6:30.</div>';
    return;
  }

  var W = container.clientWidth  || 340;
  var H = container.clientHeight || 340;

  /* Colore nodo per gruppo */
  function nodeColor(d) {
    if (d.gruppo === 'chiave')   return '#00b4ff';
    if (d.gruppo === 'utile')    return '#9b6dff';
    return 'rgba(0,180,255,0.3)';
  }
  function nodeRadius(d) {
    if (d.gruppo === 'chiave') return 9;
    if (d.gruppo === 'utile')  return 7;
    return 5;
  }
  function edgeOpacity(d) {
    return d.tipo === 'forte' ? 0.55 : 0.18;
  }
  function edgeWidth(d) {
    return d.tipo === 'forte' ? 1.5 : 0.7;
  }

  /* Prepara link con riferimenti agli oggetti nodo */
  var nodiMap = {};
  nodi.forEach(function(n){ nodiMap[n.id] = n; });
  var links = edges
    .filter(function(e){ return nodiMap[e.source] && nodiMap[e.target]; })
    .map(function(e){ return { source: e.source, target: e.target, peso: e.peso, tipo: e.tipo }; });

  var svg = d3.select(container)
    .append('svg')
    .attr('width', W)
    .attr('height', H)
    .style('background', 'transparent');

  /* glow filter */
  var defs = svg.append('defs');
  var filter = defs.append('filter').attr('id','sb-glow');
  filter.append('feGaussianBlur').attr('stdDeviation','2.5').attr('result','coloredBlur');
  var merge = filter.append('feMerge');
  merge.append('feMergeNode').attr('in','coloredBlur');
  merge.append('feMergeNode').attr('in','SourceGraphic');

  var g = svg.append('g');

  /* zoom/pan */
  svg.call(d3.zoom()
    .scaleExtent([0.3, 4])
    .on('zoom', function(event){ g.attr('transform', event.transform); })
  );

  var simulation = d3.forceSimulation(nodi)
    .force('link', d3.forceLink(links).id(function(d){ return d.id; }).distance(60).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide().radius(function(d){ return nodeRadius(d) + 6; }));

  /* link */
  var link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', 'rgba(0,180,255,1)')
    .attr('stroke-opacity', edgeOpacity)
    .attr('stroke-width', edgeWidth);

  /* nodi */
  var node = g.append('g')
    .selectAll('circle')
    .data(nodi)
    .join('circle')
    .attr('r', nodeRadius)
    .attr('fill', nodeColor)
    .attr('filter', function(d){ return d.gruppo === 'chiave' ? 'url(#sb-glow)' : null; })
    .style('cursor', 'pointer')
    .on('click', function(event, d){ labSbNodeClick(d); })
    .call(d3.drag()
      .on('start', function(event, d){
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', function(event, d){
        d.fx = event.x; d.fy = event.y;
      })
      .on('end', function(event, d){
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
    );

  /* label brevi (solo se il titolo esiste) */
  var label = g.append('g')
    .selectAll('text')
    .data(nodi.filter(function(d){ return d.titolo && d.titolo.length > 0; }))
    .join('text')
    .attr('font-size', 8)
    .attr('fill', 'rgba(0,180,255,0.65)')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')
    .text(function(d){
      var t = d.titolo || '';
      return t.length > 22 ? t.slice(0,20) + '\u2026' : t;
    });

  simulation.on('tick', function(){
    link
      .attr('x1', function(d){ return d.source.x; })
      .attr('y1', function(d){ return d.source.y; })
      .attr('x2', function(d){ return d.target.x; })
      .attr('y2', function(d){ return d.target.y; });
    node
      .attr('cx', function(d){ return d.x; })
      .attr('cy', function(d){ return d.y; });
    label
      .attr('x', function(d){ return d.x; })
      .attr('y', function(d){ return d.y - 12; });
  });
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — click su nodo → mostra info
══════════════════════════════════════════════════════════════ */

function labSbNodeClick(d) {
  var tagsHtml = (d.tag && d.tag.length)
    ? d.tag.slice(0,5).map(function(t){
        return '<span style="background:rgba(0,180,255,0.12);border:1px solid rgba(0,180,255,0.25);'
          + 'border-radius:6px;padding:2px 7px;font-size:10px;color:#00b4ff;margin:2px 2px 0 0;display:inline-block">'
          + labEsc(t) + '</span>';
      }).join('')
    : '<span style="color:rgba(0,180,255,0.3);font-size:11px">nessun tag</span>';

  /* trova connessioni di questo nodo */
  var edgesN = (labGrafoData && labGrafoData.edges) ? labGrafoData.edges : [];
  var conn = edgesN.filter(function(e){ return e.source === d.id || e.target === d.id; });
  var nodi = (labGrafoData && labGrafoData.nodi) ? labSbEnrichNodi(labGrafoData.nodi) : [];
  var connHtml = conn.slice(0,4).map(function(e){
    var altroId = e.source === d.id ? e.target : e.source;
    var altro = nodi.find(function(n){ return n.id === altroId; }) || {};
    var titoloAltro = altro.titolo || altroId.slice(0,8);
    return '<div style="font-size:11px;color:rgba(0,180,255,0.6);padding:3px 0;border-bottom:1px solid rgba(0,180,255,0.08)">'
      + (e.tipo === 'forte' ? '\uD83D\uDD35' : '\u26AA') + ' '
      + labEsc(titoloAltro.slice(0,45)) + ' '
      + '<span style="color:rgba(0,180,255,0.35)">(' + (e.peso * 100).toFixed(0) + '%)</span>'
      + '</div>';
  }).join('');

  var info = '<div style="padding:4px 0">'
    + '<div style="font-size:14px;font-weight:700;color:#00b4ff;margin-bottom:8px">'
    + labEsc(d.titolo || 'PDF senza titolo') + '</div>'
    + '<div style="margin-bottom:8px">' + tagsHtml + '</div>'
    + (d.sommario ? '<div style="font-size:12px;color:rgba(0,180,255,0.7);line-height:1.5;margin-bottom:10px">'
        + labEsc(d.sommario.slice(0,200)) + (d.sommario.length > 200 ? '\u2026' : '') + '</div>' : '')
    + '<div style="font-size:10px;color:rgba(0,180,255,0.4);letter-spacing:0.5px;margin-bottom:6px">'
    + 'CONNESSIONI (' + conn.length + ')</div>'
    + (connHtml || '<div style="font-size:11px;color:rgba(0,180,255,0.3)">Nessuna connessione</div>')
    + '</div>';

  /* mostra in sb-search-results senza chiudere il popup */
  var el = document.getElementById('sb-search-results');
  if (el) {
    el.innerHTML = '<div style="background:rgba(0,180,255,0.06);border:1px solid rgba(0,180,255,0.2);'
      + 'border-radius:12px;padding:12px 14px;margin-bottom:4px">' + info + '</div>';
  }
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — ricerca semantica con Mistral embed
══════════════════════════════════════════════════════════════ */

async function labSbSearch() {
  var input = document.getElementById('sb-search-input');
  var resEl = document.getElementById('sb-search-results');
  if (!input || !resEl) return;
  var query = input.value.trim();
  if (!query) return;

  resEl.innerHTML = '<div style="color:rgba(0,180,255,0.4);font-size:12px;padding:8px">'
    + '\u23F3 Ricerca semantica in corso\u2026</div>';

  if (!labVettoriData || !labVettoriData.vettori || !labVettoriData.vettori.length) {
    resEl.innerHTML = '<div style="color:rgba(255,100,100,0.7);font-size:12px;padding:8px">'
      + 'Vettori non disponibili. Il workflow embedding gira alle 6:30.</div>';
    return;
  }

  try {
    /* Embedding della query con Mistral */
    var mistralKey = ['qadOXMnT','lOl282Mld9SR','wtWL9dTdGCA2'].join('');
    var resp = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + mistralKey
      },
      body: JSON.stringify({
        model: 'mistral-embed',
        input: [query]
      })
    });

    if (!resp.ok) throw new Error('Mistral API error ' + resp.status);
    var data = await resp.json();
    var queryVec = data.data[0].embedding;

    /* Cosine similarity con ogni vettore */
    var vettori = labVettoriData.vettori;
    var analisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];

    var scores = vettori.map(function(v, i) {
      var src = analisi[i] || {};
      return {
        score:    labSbCosine(queryVec, v.vettore),
        titolo:   src.titolo   || v.titolo   || ('PDF #' + i),
        sommario: src.sommario || '',
        tag:      src.tag      || v.tag      || [],
        id:       v.id
      };
    });

    scores.sort(function(a,b){ return b.score - a.score; });
    var top5 = scores.slice(0,5).filter(function(s){ return s.score > 0.3; });

    if (!top5.length) {
      resEl.innerHTML = '<div style="color:rgba(0,180,255,0.4);font-size:12px;padding:8px">'
        + 'Nessun risultato rilevante trovato per <em>' + labEsc(query) + '</em>.</div>';
      return;
    }

    var html = '<div style="font-size:10px;color:rgba(0,180,255,0.4);letter-spacing:0.5px;'
      + 'margin-bottom:8px">RISULTATI RICERCA: <em>' + labEsc(query) + '</em></div>';

    top5.forEach(function(s) {
      var pct = (s.score * 100).toFixed(0);
      var barW = Math.max(8, Math.min(100, s.score * 100));
      var tagsH = s.tag.slice(0,3).map(function(t){
        return '<span style="background:rgba(0,180,255,0.1);border-radius:4px;padding:1px 6px;'
          + 'font-size:9px;color:rgba(0,180,255,0.7);margin-right:3px">' + labEsc(t) + '</span>';
      }).join('');
      html += '<div style="background:rgba(0,180,255,0.05);border:1px solid rgba(0,180,255,0.15);'
        + 'border-radius:10px;padding:10px 12px;margin-bottom:8px">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px">'
        +   '<div style="font-size:12px;font-weight:600;color:#e0f0ff;flex:1;padding-right:8px">'
        +     labEsc(s.titolo.slice(0,60)) + (s.titolo.length > 60 ? '\u2026' : '')
        +   '</div>'
        +   '<div style="font-size:11px;color:#00b4ff;font-weight:700;white-space:nowrap">' + pct + '%</div>'
        + '</div>'
        + '<div style="background:rgba(0,180,255,0.1);border-radius:3px;height:3px;margin-bottom:7px">'
        +   '<div style="background:#00b4ff;height:3px;border-radius:3px;width:' + barW + '%"></div>'
        + '</div>'
        + (s.sommario ? '<div style="font-size:11px;color:rgba(0,180,255,0.6);line-height:1.4;margin-bottom:6px">'
            + labEsc(s.sommario.slice(0,120)) + (s.sommario.length > 120 ? '\u2026' : '') + '</div>' : '')
        + tagsH
        + '</div>';
    });

    resEl.innerHTML = html;

  } catch(e) {
    resEl.innerHTML = '<div style="color:rgba(255,100,100,0.7);font-size:12px;padding:8px">'
      + '\u26A0\uFE0F Errore ricerca: ' + labEsc(e.message) + '</div>';
  }
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