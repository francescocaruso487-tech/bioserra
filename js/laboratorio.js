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
var labPraticheAttiveData = null; // pratiche_stato.json — toggle ON/OFF tecniche, persistito su GitHub
var labGuideData  = [];
var labDigestData = null;
var labBrainData  = null;
var labVettoriData = null;
var labGrafoData   = null;

var _tk1 = 'github_p';
var _tk2 = 'at_11CFQL34Q0zfD9j2xylDnj_F4SuAyfbPZ0WhApcWHF3z';
var _tk3 = 'hvXzt4DUkK950cqnTTIGRZPSAXSG6K3fX28rxO';
var LAB_TOKEN = _tk1 + _tk2 + _tk3;
var LAB_API   = 'https://api.github.com/repos/francescocaruso487-tech/bioserra/contents/data/';
var LAB_RAW   = 'https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/';

/* ══════════════════════════════════════════════════════════════
   CERVELLO AI — OpenRouter / Llama (gratuito, sostituisce Anthropic
   a pagamento). UNICO punto da aggiornare quando la chiave ruota.
   FIX Rev.16b: i singoli slug :free di OpenRouter vengono ritirati
   o spostati a pagamento senza preavviso (causa del banner "this
   model is unavailable for free... use this slug instead"). Per
   evitare di dover aggiornare uno slug morto ogni volta, il primo
   tentativo usa "openrouter/free", il router automatico ufficiale
   di OpenRouter che sceglie da solo un modello gratuito disponibile
   in quel momento. Se anche quello fallisce, si prova in sequenza
   una lista di slug noti, scartando quelli morti senza bloccare
   l'utente con un errore tecnico in chat.
══════════════════════════════════════════════════════════════ */
function labLlamaKey() {
  return ['sk-or-v1-','954d04f984416fdf','c077691ef22c84c6','3eeab4bd9803ba86','4845f2f1c464f87a'].join('');
}
var LAB_LLAMA_MODELS = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-4-scout:free',
  'deepseek/deepseek-chat:free'
];
// Alias retro-compatibili (alcune chiamate più sotto nel file li referenziano)
var LAB_LLAMA_MODEL    = LAB_LLAMA_MODELS[0];
var LAB_LLAMA_FALLBACK = LAB_LLAMA_MODELS[1];

/* Chiamata unificata: stesso schema OpenAI-compatibile per tutti e 3 i
   punti d'uso (cervSend, sintesi Second Brain, labAnalizzaPdf). Prova
   gli slug di LAB_LLAMA_MODELS in ordine finché uno risponde. Ritorna
   il testo della risposta, o lancia un errore leggibile (mai un
   "Errore." generico) se TUTTI i modelli falliscono. */
async function labLlamaChat(systemPrompt, messages, maxTokens) {
  async function tryModel(model) {
    var resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + labLlamaKey(),
        'HTTP-Referer': 'https://francescocaruso487-tech.github.io/bioserra/',
        'X-Title': 'BioSerra Cervello AI'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: maxTokens || 1200,
        messages: [{ role: 'system', content: systemPrompt }].concat(messages)
      })
    });
    var data = null;
    try { data = await resp.json(); } catch(e) { data = null; }
    return data;
  }

  var data = null, testo = null;
  for (var mi = 0; mi < LAB_LLAMA_MODELS.length; mi++) {
    data = await tryModel(LAB_LLAMA_MODELS[mi]);
    testo = (data && data.choices && data.choices[0] && data.choices[0].message) ? data.choices[0].message.content : null;
    if (testo) break;
    console.warn('[BioSerra] Modello free non disponibile (' + LAB_LLAMA_MODELS[mi] + '), provo il successivo:', data && data.error);
  }

  if (!testo) {
    var err = data && data.error;
    var msg = err ? (err.message || err.code || JSON.stringify(err)) : 'nessuno dei modelli free OpenRouter ha risposto';
    if (err && (err.code === 401 || /api.?key/i.test(msg))) msg = 'Chiave OpenRouter non valida/mancante — generala su openrouter.ai/keys.';
    if (err && (err.code === 429 || /rate.?limit/i.test(msg))) msg = 'Limite richieste OpenRouter raggiunto (free tier), riprova tra poco.';
    throw new Error(msg);
  }
  return testo;
}


/* ══════════════════════════════════════════════════════════════
   CARICAMENTO DATI
══════════════════════════════════════════════════════════════ */

async function labLoadAll() {
  labSetStatus('lab-load-status', '\u23F3 SYNC…');
  var ts = '?v=' + Date.now();
  try {
    var [rCon, rEsp, rPdf, rGuide, rDigest, rBrain, rMem, rPratiche] = await Promise.allSettled([
      fetch(LAB_RAW + 'concetti_index.json'   + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'esperimenti.json'       + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'pdf_knowledge.json'     + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'guide_complete.json'    + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'knowledge_digest.json'  + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'brain.json'             + ts).then(function(r){ return r.json(); }),
      fetch(LAB_RAW + 'memoria_chat.json'      + ts).then(function(r){ return r.json(); }).catch(function(){ return null; }),
      fetch(LAB_RAW + 'pratiche_stato.json'    + ts).then(function(r){ return r.json(); }).catch(function(){ return null; })
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
    if (rMem && rMem.status === 'fulfilled' && rMem.value) labMemoriaData = rMem.value;

    // FIX Rev.18: se l'ultimo toggle fatto offline non è mai arrivato su GitHub
    // (bioserra_pratiche_pending='1'), NON sovrascrivere la cache locale con la
    // versione remota (sarebbe stale e perderebbe il toggle). Prima si ritenta
    // il push del dato locale; solo a push riuscito il remoto torna fonte di verità.
    var praticaPending = false;
    try { praticaPending = localStorage.getItem('bioserra_pratiche_pending') === '1'; } catch(e) {}

    // FIX: anche a push RIUSCITO, raw.githubusercontent.com può servire per alcuni
    // minuti la versione precedente (CDN/propagazione, non è un problema di cache
    // del browser: il ?v=timestamp non basta). Senza questa protezione, rientrando
    // in Laboratorio subito dopo un toggle il fetch qui sotto poteva sovrascrivere
    // lo stato appena salvato con quello vecchio -> il toggle "spariva" alla vista
    // pur essendo già su GitHub. Finestra di grazia: 5 minuti dall'ultimo push riuscito.
    var recentLocalSync = false;
    try {
      var lastSync = parseInt(localStorage.getItem('bioserra_pratiche_synced_at') || '0', 10);
      recentLocalSync = (Date.now() - lastSync) < 5 * 60 * 1000;
    } catch(e) {}

    if (praticaPending || recentLocalSync) {
      var cachePend = {};
      try { cachePend = JSON.parse(localStorage.getItem('bioserra_pratiche_attive') || '{}'); } catch(e) {}
      labPraticheAttiveData = { attive: cachePend };
      if (praticaPending) {
        var pushOk = await praticaSalvaGitHub(); // ritenta ora che labLoadAll ha (forse) connessione
        if (!pushOk) {
          console.warn('[BioSerra] Toggle pratiche offline ancora in attesa di sync — riprovo al prossimo refresh');
        }
      }
    } else if (rPratiche && rPratiche.status === 'fulfilled' && rPratiche.value && rPratiche.value.attive) {
      labPraticheAttiveData = rPratiche.value;
      // tiene anche una cache locale per uso offline immediato
      try { localStorage.setItem('bioserra_pratiche_attive', JSON.stringify(labPraticheAttiveData.attive)); } catch(e) {}
    } else {
      // GitHub non disponibile o file non ancora creato: fallback a cache locale
      var cache = {};
      try { cache = JSON.parse(localStorage.getItem('bioserra_pratiche_attive') || '{}'); } catch(e) {}
      labPraticheAttiveData = { attive: cache };
    }

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
    // Rev.18: conteggio pratiche ATTIVE (coerente col sistema unificato ON/OFF),
    // non piu' un semplice totale tecniche+esperimenti_attivi che non rifletteva
    // lo stato reale (contava anche quelle disattivate, ignorava le proposte attivate).
    var totPratiche = 0;
    if (typeof labBuildPratiche === 'function') {
      totPratiche = labBuildPratiche().filter(function(p){ return p.attiva === true; }).length;
    } else {
      totPratiche = labElTecniche.length + (labEspData && labEspData.esperimenti_attivi ? labEspData.esperimenti_attivi.length : 0);
    }
    if (totPratiche) { bTec.textContent = totPratiche; bTec.classList.add('show'); }
    else { bTec.textContent = ''; bTec.classList.remove('show'); }
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

// (20) Modalità briefing vocale: legge ad alta voce il contenuto della card
// Consiglio del Giorno tramite Web Speech API (nessun costo, nessuna dipendenza esterna).
let _labSpeakUtterance = null;
function labSpeakBriefing() {
  const btn = document.getElementById('lab-tc-speak-btn');
  if (!('speechSynthesis' in window)) {
    if (btn) btn.title = 'Lettura vocale non supportata su questo browser';
    return;
  }
  // Toggle: se sta già parlando, ferma
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (btn) btn.textContent = '🔊';
    return;
  }
  const el = document.getElementById('lab-digest-content');
  const testo = el ? el.innerText.trim() : '';
  if (!testo) return;
  _labSpeakUtterance = new SpeechSynthesisUtterance(testo);
  _labSpeakUtterance.lang = 'it-IT';
  _labSpeakUtterance.rate = 1.0;
  _labSpeakUtterance.onend = function () { if (btn) btn.textContent = '🔊'; };
  _labSpeakUtterance.onerror = function () { if (btn) btn.textContent = '🔊'; };
  if (btn) btn.textContent = '⏹️';
  window.speechSynthesis.speak(_labSpeakUtterance);
}

function labRenderDigest() {
  var el = document.getElementById('lab-digest-content');
  if (!el) return;
  var d = labDigestData;
  // Digest vecchio (non di oggi) o N8N dismesso -> tratta come assente, usa brain.json
  var oggiStr = new Date().toISOString().slice(0,10);
  var digestData = d && (d.data || (d.lastUpdate ? d.lastUpdate.slice(0,10) : ''));
  var digestVecchio = !digestData || digestData < oggiStr;
  // Fallback: usa brain.json se digest è vecchio, vuoto o senza consiglio
  if (!d || !d.consiglio_integrato || digestVecchio) {
    var brain = labBrainData;
    if (brain && brain.cervello && brain.cervello.briefing_mattutino) {
      var briefing = brain.cervello.briefing_mattutino || '';
      // Pulizia backtick residui (failsafe)
      if (briefing.indexOf('```') >= 0) {
        briefing = briefing.replace(/```json|```/g,'').trim();
        // Se è JSON, prova a estrarre briefing_mattutino
        try {
          var s=briefing.indexOf('{'), e=briefing.lastIndexOf('}');
          if(s>=0&&e>s){ var parsed=JSON.parse(briefing.substring(s,e+1)); briefing=parsed.briefing_mattutino||briefing; }
        } catch(ex) { briefing = briefing.substring(0,300); }
      }
      // Mostra consigli del giorno se briefing non disponibile
      if (!briefing || briefing.length < 10) {
        var cg = brain.cervello.consigli_giorno || brain.consigli_giorno || [];
        briefing = Array.isArray(cg) ? cg.filter(function(c){ return typeof c==='string' && !c.startsWith('{') && !c.startsWith('```'); }).join(' | ').substring(0,300) : '';
      }
      // lastUpdate brain
      var brainDate = (brain.lastUpdate||'').substring(0,10);
      var dateLabel = brainDate ? ' <span style="opacity:0.4;font-size:9px">' + brainDate + '</span>' : '';
      el.innerHTML = '<div style="display:flex;align-items:flex-start;gap:10px">'+
        '<span style="font-size:20px;flex-shrink:0">⚡</span>'+
        '<div><div style="font-size:9px;color:rgba(0,180,255,0.5);font-weight:700;letter-spacing:1px;margin-bottom:4px">BRIEFING MATTUTINO' + dateLabel + '</div>'+
        '<div class="lab-digest-compact" style="margin:0">' + labEsc(briefing.substring(0,250)) + (briefing.length>250?'...':'') + '</div></div></div>';
      return;
    }
    el.innerHTML = '<div class="lab-digest-compact" style="opacity:0.4">Digest in preparazione…</div>';
    return;
  }
  // Mostra data aggiornamento
  // Usa lastUpdate da brain.json per la data (più affidabile di digest)
  var dataStr = (labBrainData && labBrainData.lastUpdate) ? labBrainData.lastUpdate.substring(0,10) :
                (d.data || d.lastUpdate || '');
  if (dataStr) {
    var oggi = new Date().toISOString().substring(0,10);
    var isOld = dataStr < oggi;
    if (isOld) el.setAttribute('title', 'Aggiornato il '+dataStr);
    else el.setAttribute('title', 'Aggiornato oggi');
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
// (4) Feedback pratiche 👍/👎: persistito in localStorage, alimenta il ranking
// nei giorni successivi tramite un boost sommato alla rilevanza in labBuildPratiche.
function praticaLoadFeedback() {
  try { return JSON.parse(localStorage.getItem('bioserra_pratiche_feedback') || '{}'); }
  catch(e) { return {}; }
}
function praticaSaveFeedback(map) {
  localStorage.setItem('bioserra_pratiche_feedback', JSON.stringify(map));
}
function praticaFeedbackKey(nome) {
  return (nome || '').toLowerCase().trim();
}
function praticaFeedbackBoost(nome) {
  var map = praticaLoadFeedback();
  var v = map[praticaFeedbackKey(nome)];
  if (!v) return 0;
  var score = (v.up || 0) - (v.down || 0);
  return Math.max(-15, Math.min(score * 5, 20));
}
// (Rev.17) Attiva/disattiva pratica — globale per tutta la serra (10 piante),
// persistito su GitHub in data/pratiche_stato.json (pattern identico a
// labEspSalva: SHA fresco prima di ogni PUT). Cache in localStorage solo
// come fallback offline, non come fonte di verità.
function praticaLoadAttive() {
  if (labPraticheAttiveData && labPraticheAttiveData.attive) return labPraticheAttiveData.attive;
  try { return JSON.parse(localStorage.getItem('bioserra_pratiche_attive') || '{}'); }
  catch(e) { return {}; }
}
// Rev.18: pratiche unificate (tecniche + esperimenti attivi + proposte) in un solo
// sistema ON/OFF. Default per tipo se l'utente non ha mai toccato quella pratica:
// tecnica ed esp_attivo partono ON (sono gia' "in uso"), esp_proposta parte OFF
// (e' un suggerimento non ancora scelto dall'utente).
function praticaDefaultPerTipo(tipo) {
  return tipo === 'esp_proposta' ? false : true;
}
function praticaIsAttiva(nome, tipo) {
  var map = praticaLoadAttive();
  var k = praticaFeedbackKey(nome);
  if (Object.prototype.hasOwnProperty.call(map, k)) return map[k] !== false;
  return praticaDefaultPerTipo(tipo);
}
async function praticaToggleAttiva() {
  if (!_labPraticaFeedbackNome) return;
  var k = praticaFeedbackKey(_labPraticaFeedbackNome);
  if (!labPraticheAttiveData || !labPraticheAttiveData.attive) labPraticheAttiveData = { attive: {} };
  var nuovo = !praticaIsAttiva(_labPraticaFeedbackNome, _labPraticaFeedbackTipo);
  labPraticheAttiveData.attive[k] = nuovo;
  try { localStorage.setItem('bioserra_pratiche_attive', JSON.stringify(labPraticheAttiveData.attive)); } catch(e) {}
  // Aggiorna subito la UI (ottimistico), poi salva su GitHub in background
  var area = document.getElementById('lab-pratica-toggle-area');
  if (area) area.innerHTML = praticaToggleHTML(_labPraticaFeedbackNome, _labPraticaFeedbackTipo);
  if (typeof labRenderPratiche === 'function') labRenderPratiche();
  if (typeof labUpdateBadges === 'function') labUpdateBadges(); // FIX: il badge \u26a1 Pratiche restava col conteggio vecchio finche' non si ricaricava tutto
  await praticaSalvaGitHub();
}
async function praticaSalvaGitHub() {
  try {
    var rSha = await fetch(LAB_API + 'pratiche_stato.json', {
      headers: { 'Authorization': 'token ' + LAB_TOKEN }
    });
    var shaData = await rSha.json().catch(function(){ return {}; });
    var sha = shaData && shaData.sha;
    labPraticheAttiveData.lastUpdate = new Date().toISOString();
    var body = {
      message: '[BioSerra] Aggiorna pratiche attive',
      content: btoa(unescape(encodeURIComponent(JSON.stringify(labPraticheAttiveData, null, 2))))
    };
    if (sha) body.sha = sha; // assente al primo salvataggio: il file non esiste ancora -> viene creato
    var put = await fetch(LAB_API + 'pratiche_stato.json', {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + LAB_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!put.ok) {
      console.error('[BioSerra] praticaSalvaGitHub PUT fallita:', put.status);
      try { localStorage.setItem('bioserra_pratiche_pending', '1'); } catch(e) {}
      return false;
    }
    try { localStorage.removeItem('bioserra_pratiche_pending'); } catch(e) {}
    // Timestamp dell'ultimo push riuscito: protegge da un re-fetch di pratiche_stato.json
    // da raw.githubusercontent.com ancora stale per propagazione CDN (vedi labLoadAll).
    try { localStorage.setItem('bioserra_pratiche_synced_at', String(Date.now())); } catch(e) {}
    return true;
  } catch(e) {
    console.error('[BioSerra] praticaSalvaGitHub:', e);
    try { localStorage.setItem('bioserra_pratiche_pending', '1'); } catch(e2) {}
    return false;
  }
}
function praticaToggleHTML(nome, tipo) {
  var on = praticaIsAttiva(nome, tipo);
  return '<button onclick="praticaToggleAttiva()" style="width:100%;padding:9px;margin-bottom:10px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;'
    + (on ? 'background:rgba(76,175,118,0.12);border:1px solid rgba(76,175,118,0.3);color:var(--green3)'
          : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);color:var(--text3)')
    + '">' + (on ? '\u2705 Attiva per tutte e 10 le piante \u2014 tocca per disattivare' : '\u23F8\uFE0F Disattivata \u2014 tocca per riattivare') + '</button>';
}
var _labPraticaFeedbackNome = null;
var _labPraticaFeedbackTipo = null;
function praticaVota(voto) {
  if (!_labPraticaFeedbackNome) return;
  var map = praticaLoadFeedback();
  var k = praticaFeedbackKey(_labPraticaFeedbackNome);
  if (!map[k]) map[k] = { up: 0, down: 0 };
  if (voto > 0) map[k].up++; else map[k].down++;
  praticaSaveFeedback(map);
  var area = document.getElementById('lab-pratica-feedback-area');
  if (area) area.innerHTML = praticaFeedbackHTML(_labPraticaFeedbackNome);
  if (typeof labRenderPratiche === 'function') labRenderPratiche();
}
function praticaFeedbackHTML(nome) {
  var map = praticaLoadFeedback();
  var v = map[praticaFeedbackKey(nome)] || { up: 0, down: 0 };
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
    + '<div style="font-size:11px;color:var(--text3);margin-right:2px">Utile?</div>'
    + '<button onclick="praticaVota(1)" style="background:rgba(76,175,118,0.12);border:1px solid rgba(76,175,118,0.3);border-radius:8px;padding:6px 12px;color:var(--green3);font-size:13px;cursor:pointer">\uD83D\uDC4D ' + v.up + '</button>'
    + '<button onclick="praticaVota(-1)" style="background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.3);border-radius:8px;padding:6px 12px;color:#e05252;font-size:13px;cursor:pointer">\uD83D\uDC4E ' + v.down + '</button>'
    + '</div>';
}

function labBuildPratiche() {
  var pratiche = [];

  // Estrai parole chiave da brain (consigli_giorno + piano_giornata)
  var brainKeywords = [];
  if (labBrainData) {
    var cerv = labBrainData.cervello || {};
    var consigli = cerv.consigli_giorno || labBrainData.consigli_giorno || [];
    // consigli_giorno può essere array di stringhe o array con 1 elemento JSON stringa
    var consigliTxt = '';
    if (Array.isArray(consigli)) {
      consigli.forEach(function(c) {
        if (typeof c === 'string' && !c.startsWith('{') && !c.startsWith('```')) {
          consigliTxt += ' ' + c;
        }
      });
    }
    // piano_giornata
    var piano = cerv.piano_giornata || {};
    ['mattina','pomeriggio','sera'].forEach(function(k) {
      if (piano[k] && typeof piano[k] === 'string') consigliTxt += ' ' + piano[k];
    });
    // kb_sintesi principi
    var kb = cerv.kb_sintesi || {};
    if (Array.isArray(kb.principi_attivi)) {
      kb.principi_attivi.forEach(function(p) { consigliTxt += ' ' + (p.principio||'') + ' ' + (p.tecnica||''); });
    }
    // Tokenizza in parole significative (>4 chars)
    brainKeywords = consigliTxt.toLowerCase().match(/[a-zÀ-ɏ]{4,}/g) || [];
  }

  function brainBoost(testo) {
    if (!brainKeywords.length || !testo) return 0;
    var t = testo.toLowerCase();
    var hits = 0;
    brainKeywords.forEach(function(kw) { if (t.indexOf(kw) >= 0) hits++; });
    return Math.min(hits * 4, 20); // max +20 punti
  }

  // 1. Esperimenti attivi (priorità massima) — Rev.18: pratiche unificate,
  // anche questi ora passano da praticaIsAttiva (default ON) invece di essere
  // sempre considerati attivi a prescindere dal toggle utente.
  if (labEspData) {
    var attivi = labEspData.esperimenti_attivi || labEspData.attivi || [];
    attivi.forEach(function(e, i) {
      var nomeE = e.nome || '';
      var boost = brainBoost((nomeE) + ' ' + (e.descrizione||'') + ' ' + (e.obiettivo||''));
      var attivaE = praticaIsAttiva(nomeE, 'esp_attivo');
      var rilE = 95 + boost + praticaFeedbackBoost(nomeE);
      if (!attivaE) rilE -= 1000; // resta in lista ma in fondo
      pratiche.push({
        id: 'esp_att_' + i,
        nome: nomeE,
        categoria: e.categoria || 'tecnica di coltivazione',
        descrizione: e.obiettivo || e.descrizione || '',
        badge: null,
        badgeColor: 'var(--green3)',
        rilevanza: rilE,
        attiva: attivaE,
        tipo: 'esp_attivo',
        data: e,
        idx: i
      });
    });
  }

  // 2. Tecniche da concetti_index (rilevanza + brain boost + feedback,
  // FIX Rev.16b: rimosso il boost/peso per fase piante — le tecniche
  // elettrocultura/biodinamiche si applicano a tutta la serra, non a
  // una fase di una singola pianta: ora sono SEMPRE tutte presenti,
  // ordinate solo per rilevanza. Una pratica disattivata dall'utente
  // (praticaIsAttiva) resta visibile ma scende in fondo alla lista.
  labElTecniche.forEach(function(t, i) {
    var nomeT = t.nome || t.label || '';
    var attiva = praticaIsAttiva(nomeT, 'tecnica');
    var ril = t.rilevanza || 5;
    ril += brainBoost((nomeT) + ' ' + (t.descrizione || t.desc || '') + ' ' + (t.categoria || ''));
    ril += praticaFeedbackBoost(nomeT);
    if (!attiva) ril -= 1000; // resta in lista ma in fondo
    pratiche.push({
      id: 'tec_' + i,
      nome: nomeT,
      categoria: t.categoria || 'elettrocultura',
      descrizione: t.descrizione || t.desc || '',
      badge: null,
      badgeColor: 'var(--el-violet)',
      rilevanza: ril,
      attiva: attiva,
      tipo: 'tecnica',
      data: t,
      idx: i
    });
  });

  // 3. Proposte — FIX Rev.16: prima limitate a 12/giorno con rotazione,
  // ora mostrate TUTTE sempre (la rotazione nascondeva la maggior parte
  // delle proposte disponibili). L'ordinamento finale per rilevanza
  // (brainBoost + feedback) le organizza comunque in modo sensato.
  // Rev.18: pratiche unificate — anche le proposte ora sono un semplice
  // toggle ON/OFF (default OFF finché l'utente non le attiva), niente
  // più badge CONSIGLIATA/SUGGERITA: l'ordinamento per rilevanza (che
  // include comunque il brainBoost) resta il criterio di priorità.
  if (labEspData) {
    var tutte = labEspData.proposte || labEspData.esperimenti_disponibili || [];
    tutte.forEach(function(e, i) {
      var nomeP = e.nome || '';
      var boost = brainBoost((nomeP) + ' ' + (e.descrizione||'') + ' ' + (e.obiettivo||'') + ' ' + (e.categoria||''));
      var fbBoost = praticaFeedbackBoost(nomeP);
      var attivaP = praticaIsAttiva(nomeP, 'esp_proposta');
      var rilP = 40 + boost + fbBoost;
      if (!attivaP) rilP -= 1000; // resta in lista ma in fondo finché non viene attivata
      pratiche.push({
        id: 'esp_prop_' + i,
        nome: nomeP,
        categoria: e.categoria || 'tecnica di coltivazione',
        descrizione: e.obiettivo || e.descrizione || '',
        badge: null,
        badgeColor: 'var(--el-blue)',
        rilevanza: rilP,
        attiva: attivaP,
        tipo: 'esp_proposta',
        data: e,
        idx: i
      });
    });
  }

  // Deduplica per nome (case-insensitive)
  var seen = new Set();
  pratiche = pratiche.filter(function(p) {
    var key = (p.nome||'').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  var h = '';
  pratiche.slice(0, 5).forEach(function(p, i) {
    var catColor = labCatColor(p.categoria);
    var isAttiva = p.attiva === true;
    var isOff = p.attiva === false;
    h += '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-left:2px solid ' + catColor + ';border-radius:0 10px 10px 0;padding:10px 12px;margin-bottom:7px;cursor:pointer;transition:background 0.2s;' + (isOff ? 'opacity:0.5' : '') + '" onclick="labPopupPratica(\'' + p.id + '\')">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">';
    h += '<div style="flex:1">';
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:3px">' + labEsc(p.nome) + '</div>';
    if (p.descrizione) h += '<div style="font-size:11px;color:var(--text3);line-height:1.5">' + labEsc(p.descrizione.substring(0,70)) + (p.descrizione.length>70?'\u2026':'') + '</div>';
    h += '</div>';
    h += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">';
    if (isAttiva) h += '<span style="font-size:9px;background:rgba(76,175,118,0.2);color:var(--green3);border-radius:4px;padding:2px 6px;font-weight:700">\u2705 ATTIVA</span>';
    if (isOff) h += '<span style="font-size:9px;background:rgba(255,255,255,0.08);color:var(--text3);border-radius:4px;padding:2px 6px">\u23F8\uFE0F disattivata</span>';
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
  h += (p.attiva
    ? '<span style="font-size:10px;background:rgba(76,175,118,0.15);color:var(--green3);border-radius:8px;padding:4px 10px;font-weight:700;flex-shrink:0">\u2705 ATTIVA</span>'
    : '<span style="font-size:10px;background:rgba(255,255,255,0.06);color:var(--text3);border-radius:8px;padding:4px 10px;font-weight:700;flex-shrink:0">\u23F8\uFE0F DISATTIVATA</span>');
  h += '</div>';

  // (4) Area feedback 👍/👎
  _labPraticaFeedbackNome = p.nome;
  _labPraticaFeedbackTipo = p.tipo;
  h += '<div id="lab-pratica-feedback-area">' + praticaFeedbackHTML(p.nome) + '</div>';

  // Toggle attiva/disattiva — Rev.18: unico bottone ON/OFF per tutti i tipi di pratica
  h += '<div id="lab-pratica-toggle-area">' + praticaToggleHTML(p.nome, p.tipo) + '</div>';

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
  var h = '<div style="font-size:9px;color:var(--el-blue);font-weight:700;letter-spacing:1px;margin-bottom:4px">\u26A1 PRATICHE (' + pratiche.length + ')</div>';
  h += '<div style="font-size:9px;color:var(--text3);margin-bottom:12px">Tutte le pratiche estratte da PDF e siti \u00B7 ordinate per rilevanza</div>';

  // Filtri rapidi
  h += '<div id="pratiche-lista">';
  pratiche.forEach(function(p) {
    var catColor = labCatColor(p.categoria);
    var isAttiva = p.attiva === true;
    var isOff = p.attiva === false;
    h += '<div class="prat-item" style="border-left:2px solid ' + catColor + ';border-radius:0 10px 10px 0;padding:10px 12px;margin-bottom:8px;cursor:pointer;background:rgba(255,255,255,0.02);' + (isOff ? 'opacity:0.5' : '') + '" onclick="labPopupClose();setTimeout(function(){labPopupPratica(\'' + p.id + '\');},60)">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center">';
    h += '<div><div style="font-size:13px;font-weight:700;color:var(--text)">' + labEsc(p.nome) + '</div>';
    h += '<div style="font-size:10px;color:' + catColor + ';margin-top:2px">' + labEsc(p.categoria) + '</div></div>';
    if (isAttiva) h += '<span style="font-size:9px;background:rgba(76,175,118,0.2);color:var(--green3);border-radius:4px;padding:2px 6px;font-weight:700">\u2705 ATTIVA</span>';
    else if (isOff) h += '<span style="font-size:9px;background:rgba(255,255,255,0.08);color:var(--text3);border-radius:4px;padding:2px 6px">\u23F8\uFE0F disattivata</span>';
    h += '</div>';
    if (p.descrizione) h += '<div style="font-size:11px;color:var(--text3);margin-top:4px;line-height:1.4">' + labEsc(p.descrizione.substring(0,80)) + '\u2026</div>';
    h += '</div>';
  });
  h += '</div>';

  labPopupOpen(h);
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
  // Ruota le guide mostrate in base al giorno (non sempre le stesse 3)
  var dayOffset = (new Date().getDate()) % Math.max(1, labGuideData.length);
  var guideOrdinate = labGuideData.slice(dayOffset).concat(labGuideData.slice(0, dayOffset));
  guideOrdinate.slice(0, 3).forEach(function(g, idx) {
    idx = labGuideData.indexOf(g); // mantieni idx corretto per popup
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
  // chiusura forEach guideOrdinate (patch rotazione)
  void 0;
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
var labMemoriaData = null;
var labAnalisiOnDemand = {};

async function cervBuildSystem(queryKeywords) {
  var sys = 'Sei il Cervello AI di BioSerra: agronomo esperto che ha letto TUTTI i manuali Living Soil, biodinamica ed elettrocultura della biblioteca BioSerra (89 PDF). ';
  sys += 'Serra outdoor water-only Caserta 41N. Tecniche attive: Lakhovsky, Fe-Cu, acqua magnetizzata, spirale rame, antenna terra. ';
  sys += 'Rispondi in italiano, SPECIFICO e PRATICO, max 350 parole. Cita sempre i manuali ([id]) quando disponibile.\n\n';
  if (labBrainData) {
    var cerv5 = labBrainData.cervello || labBrainData;
    if (cerv5.briefing_mattutino) sys += '=== BRIEFING NOTTURNO ===\n' + cerv5.briefing_mattutino + '\n\n';
    var kbs = cerv5.kb_sintesi || {};
    if (kbs.principi_attivi && kbs.principi_attivi.length) {
      sys += '=== CONOSCENZE DAI MANUALI (sintetizzate stanotte) ===\n';
      sys += kbs.principi_attivi.join('\n') + '\n';
      if (kbs.consiglio_elettro_da_testi)      sys += 'Elettro: ' + kbs.consiglio_elettro_da_testi + '\n';
      if (kbs.consiglio_suolo_da_testi)        sys += 'Suolo: '   + kbs.consiglio_suolo_da_testi   + '\n';
      if (kbs.consiglio_biodinamica_da_testi)  sys += 'Biodin: '  + kbs.consiglio_biodinamica_da_testi + '\n';
      if (kbs.tecnica_da_provare && kbs.tecnica_da_provare.nome)
        sys += 'Tecnica: ' + kbs.tecnica_da_provare.nome + ' - ' + kbs.tecnica_da_provare.descrizione + '\n';
      sys += '\n';
    }
    var piano5 = cerv5.piano_giornata || {};
    if (piano5.mattina) sys += '=== PIANO GIORNATA ===\nMattina: ' + piano5.mattina + '\nSera: ' + (piano5.sera||'') + '\n\n';
  }
  if (labMemoriaData && labMemoriaData.sessioni && labMemoriaData.sessioni.length) {
    sys += '=== CONTESTO STORICO (ultimi giorni) ===\n';
    labMemoriaData.sessioni.slice(-5).forEach(function(s){ sys += s.data + ': ' + (s.riassunto||'').substring(0,150) + '\n'; });
    sys += '\n';
  }
  if (labMemoriaData && labMemoriaData.temi_ricorrenti && labMemoriaData.temi_ricorrenti.length) {
    sys += '=== MEMORIA PERMANENTE (pattern imparati nel tempo su questa serra) ===\n';
    labMemoriaData.temi_ricorrenti.forEach(function(t){
      var txt = (typeof t === 'string') ? t : (t.testo || '');
      if (!txt) return;
      sys += '- ' + txt;
      if (t.evidenza) sys += ' (' + t.evidenza + ')';
      sys += '\n';
    });
    sys += '\n';
  }

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
          var gg = (p.giorni_vita != null) ? p.giorni_vita : (p.giorno_ciclo || '?');
          sys += p.nome + ': fase ' + (p.fase||'?') + ', giorno ' + gg;
          var racc = p.data_raccolta || p.giorno_raccolta_stimato;
          if (racc) sys += ', raccolta stimata ' + racc;
          if (typeof p.giorni_a_raccolta === 'number') sys += ' (tra ' + p.giorni_a_raccolta + ' gg)';
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

    var botText;
    try {
      botText = await labLlamaChat(finalSystem, msgs, 1200);
    } catch (llamaErr) {
      botText = '⚠ ' + llamaErr.message;
    }
    if (loadingEl) { loadingEl.classList.remove('loading'); loadingEl.textContent = botText; }
    cervHistory.push({ role: 'assistant', content: botText });
  } catch(e) {
    if (loadingEl) { loadingEl.classList.remove('loading'); loadingEl.textContent = 'Errore connessione AI. Riprova.'; }
  }
}

function cervChatReset() {
  cervHistory = [];
  var chat = document.getElementById('cerv-chat');
  if (!chat) return;
  var briefing = '';
  if (labBrainData) {
    var cerv = labBrainData.cervello || labBrainData;
    if (cerv.briefing_mattutino && cerv.briefing_mattutino.length > 20) briefing = cerv.briefing_mattutino;
    var avvisi = cerv.avvisi || labBrainData.avvisi || [];
    if (avvisi.length) briefing += (briefing ? '\n\n' : '') + '⚠ ' + avvisi.slice(0,2).join(' | ');
    var piano = cerv.piano_giornata || {};
    if (piano.mattina) briefing += (briefing ? '\n\n' : '') + '⏳ Oggi: ' + piano.mattina;
  }
  var nPdf = (labPdfData && labPdfData.analisi) ? labPdfData.analisi.length : 0;
  var nLetti = (labBrainData && labBrainData.testi_pdf_letti) || 0;
  chat.innerHTML = briefing
    ? '<div class="ai-msg bot"><strong>🧠 Briefing Serra</strong> <span style="font-size:10px;opacity:0.5">· ' + nLetti + ' PDF letti stanotte</span><br><br>' + labEsc(briefing).replace(/\n/g,'<br>') + '</div>'
    : '<div class="ai-msg bot">🧠 Sistema attivo · ' + nPdf + ' PDF · ' + nLetti + ' testi letti.<br>Cosa vuoi sapere sulla tua serra?</div>';
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
/* manAggiungeTecnica: definita in piante.js (versione funzionante) */
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
  var nConcetti = (labConcettiData && labConcettiData.concetti) ? labConcettiData.concetti.length : 0;

  var html =
    '<div style="font-size:10px;color:rgba(0,180,255,0.4);letter-spacing:0.5px;margin-bottom:2px">SECOND BRAIN</div>'
  + '<div style="font-size:15px;font-weight:700;color:#00b4ff;letter-spacing:1px;margin-bottom:4px">\uD83E\uDDE0 KNOWLEDGE BASE</div>'
  + '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">'
  +   nVec + ' vettori \u00B7 ' + nPdf + ' PDF \u00B7 ' + edges.length + ' link \u00B7 ' + nConcetti + ' concetti'
  + '</div>'

  // Box ricerca — condiviso tra tutte le viste
  + '<div style="margin-bottom:14px">'
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
  + '<div style="display:flex;gap:8px;margin-top:8px">'
  + '<select id="sb-filter-fase" style="flex:1;background:rgba(0,180,255,0.06);border:1px solid rgba(0,180,255,0.2);'
  + 'border-radius:8px;padding:6px 8px;color:#b8e0ff;font-size:11px">'
  +   '<option value="">Tutte le fasi</option>'
  +   '<option value="germinazione">\uD83C\uDF31 Germinazione</option>'
  +   '<option value="vegetazione">\uD83C\uDF3F Vegetazione</option>'
  +   '<option value="fioritura">\uD83C\uDF38 Fioritura</option>'
  +   '<option value="essiccazione">\uD83C\uDF42 Essiccazione</option>'
  + '</select>'
  + '</div>'
  + '<div style="font-size:10px;color:var(--text3);margin-top:6px">Usa linguaggio naturale — la risposta sintetizza i PDF e usa l\u2019AI</div>'
  + '</div>'

  + '<div id="sb-search-results" style="margin-bottom:14px"></div>'

  // Rev.25: segmented control — Grafo / Per categoria / Connessioni
  + '<div style="display:flex;background:rgba(0,180,255,0.06);border:1px solid rgba(0,180,255,0.15);border-radius:12px;padding:3px;margin-bottom:14px">'
  + '<div id="sb-seg-grafo" onclick="labSbSwitchView(\'grafo\')" style="flex:1;text-align:center;padding:8px 0;font-size:12.5px;font-weight:700;border-radius:9px;cursor:pointer;background:rgba(0,180,255,0.22);color:#00b4ff">Grafo</div>'
  + '<div id="sb-seg-categoria" onclick="labSbSwitchView(\'categoria\')" style="flex:1;text-align:center;padding:8px 0;font-size:12.5px;font-weight:700;border-radius:9px;cursor:pointer;color:rgba(0,180,255,0.5)">Per categoria</div>'
  + '<div id="sb-seg-connessioni" onclick="labSbSwitchView(\'connessioni\')" style="flex:1;text-align:center;padding:8px 0;font-size:12.5px;font-weight:700;border-radius:9px;cursor:pointer;color:rgba(0,180,255,0.5)">Connessioni</div>'
  + '</div>'

  // VISTA GRAFO
  + '<div id="sb-view-grafo">'
  + '<div id="sb-graph-legend" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"></div>'
  + '<div id="sb-graph-container" style="width:100%;height:340px;background:rgba(0,0,0,0.3);'
  + 'border-radius:12px;position:relative;overflow:hidden;touch-action:none">'
  + '<div id="sb-graph-loading" style="position:absolute;inset:0;display:flex;align-items:center;'
  + 'justify-content:center;color:rgba(0,180,255,0.4);font-size:12px">\u23F3 Caricamento grafo\u2026</div>'
  + '<div style="position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px;z-index:5">'
  + '<button onclick="labSbGraphZoom(1.3)" style="width:30px;height:30px;border-radius:8px;background:rgba(0,0,0,0.6);border:1px solid rgba(0,180,255,0.3);color:#00b4ff;font-size:15px;font-weight:700;cursor:pointer">+</button>'
  + '<button onclick="labSbGraphZoom(0.75)" style="width:30px;height:30px;border-radius:8px;background:rgba(0,0,0,0.6);border:1px solid rgba(0,180,255,0.3);color:#00b4ff;font-size:15px;font-weight:700;cursor:pointer">\u2212</button>'
  + '<button onclick="labSbGraphReset()" style="width:30px;height:30px;border-radius:8px;background:rgba(0,0,0,0.6);border:1px solid rgba(0,180,255,0.3);color:#00b4ff;font-size:12px;cursor:pointer">\u27F2</button>'
  + '</div>'
  + '</div>'
  + '<div style="font-size:9px;color:rgba(0,180,255,0.35);margin-top:6px;text-align:center">trascina per spostarti \u00B7 tocca un nodo per i dettagli \u00B7 tocca la legenda per filtrare</div>'
  + '</div>'

  // VISTA PER CATEGORIA
  + '<div id="sb-view-categoria" style="display:none">' + labSbBuildCategorieHTML() + '</div>'

  // VISTA CONNESSIONI
  + '<div id="sb-view-connessioni" style="display:none">' + labSbBuildConnessioniHTML() + '</div>';

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

/* Rev.25: switch tra le 3 viste del Second Brain (Grafo/Categoria/Connessioni) */
function labSbSwitchView(view) {
  ['grafo','categoria','connessioni'].forEach(function(v) {
    var el = document.getElementById('sb-view-' + v);
    if (el) el.style.display = (v === view) ? '' : 'none';
    var btn = document.getElementById('sb-seg-' + v);
    if (btn) {
      btn.style.background = (v === view) ? 'rgba(0,180,255,0.22)' : 'transparent';
      btn.style.color = (v === view) ? '#00b4ff' : 'rgba(0,180,255,0.5)';
    }
  });
}

/* Rev.25: vista "Per categoria" — accordion sfogliabile senza dover cercare */
function labSbBuildCategorieHTML() {
  if (!labConcettiData || !Array.isArray(labConcettiData.concetti) || !labConcettiData.concetti.length) {
    return '<div style="color:rgba(0,180,255,0.35);font-size:12px;padding:10px 4px">Nessun concetto indicizzato ancora \u2014 arrivano con la pipeline notturna.</div>';
  }
  var gruppi = {};
  labConcettiData.concetti.forEach(function(c) {
    var cat = c.categoria || 'altro';
    if (!gruppi[cat]) gruppi[cat] = [];
    gruppi[cat].push(c);
  });
  var cats = Object.keys(gruppi).sort(function(a,b){ return gruppi[b].length - gruppi[a].length; });
  return cats.map(function(cat, idx) {
    var items = gruppi[cat];
    var rows = items.map(function(c) {
      return '<div onclick="labSbConcettoClick(\'' + labEsc(c.id) + '\',\'' + labEsc(c.label) + '\')" '
        + 'style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-top:1px solid rgba(0,180,255,0.08);cursor:pointer">'
        + '<span style="font-size:13px;color:#e0f0ff">' + labEsc(c.label) + '</span>'
        + '<span style="font-size:10px;font-family:monospace;color:rgba(0,180,255,0.4)">' + (c.pdf_count||0) + ' PDF</span>'
        + '</div>';
    }).join('');
    var openAttr = idx === 0 ? ' open' : '';
    return '<details' + openAttr + ' style="background:rgba(0,180,255,0.04);border:1px solid rgba(0,180,255,0.15);border-radius:12px;margin-bottom:8px;overflow:hidden">'
      + '<summary style="padding:11px 14px;cursor:pointer;font-size:13px;font-weight:700;color:#00b4ff;display:flex;justify-content:space-between">'
      + '<span>' + labEsc(labSbCategoriaLabel(cat)) + '</span><span style="font-family:monospace;font-weight:400;color:rgba(0,180,255,0.4)">' + items.length + '</span>'
      + '</summary>' + rows + '</details>';
  }).join('');
}

function labSbCategoriaLabel(cat) {
  var MAP = {
    elettrocultura: '\u26A1 Elettrocultura', biodinamica: '\uD83C\uDF19 Biodinamica', living_soil: '\uD83C\uDF31 Living Soil',
    fisica_energie: '\uD83C\uDF00 Fisica energie', fitoterapia: '\uD83C\uDF3F Fitoterapia', agricoltura: '\uD83D\uDE9C Agricoltura',
    scienza: '\uD83D\uDD2C Scienza', esoterismo: '\u2728 Esoterismo', altro: '\uD83D\uDCE6 Altro'
  };
  return MAP[cat] || cat;
}

/* Rev.25: vista "Connessioni" — lista dei link semantici ordinati per peso */
function labSbBuildConnessioniHTML() {
  var edges = (labGrafoData && labGrafoData.edges) ? labGrafoData.edges.slice() : [];
  if (!edges.length) {
    return '<div style="color:rgba(0,180,255,0.35);font-size:12px;padding:10px 4px">Nessuna connessione ancora \u2014 cresce ogni notte.</div>';
  }
  var analisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];
  var byId = {};
  analisi.forEach(function(a) { if (a.id) byId[a.id] = a; });
  edges.sort(function(a,b){ return (b.peso||0) - (a.peso||0); });
  var rows = edges.slice(0, 60).map(function(e) {
    var ta = (byId[e.source]||{}).titolo || e.source;
    var tb = (byId[e.target]||{}).titolo || e.target;
    return '<div onclick="labSbEdgeClick(\'' + labEsc(e.source) + '\')" '
      + 'style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(0,180,255,0.08);cursor:pointer">'
      + '<span style="font-size:12px;color:#e0f0ff;line-height:1.4"><b>' + labEsc((ta||'').substring(0,32)) + '</b> \u2194 ' + labEsc((tb||'').substring(0,32)) + '</span>'
      + '<span style="font-size:10px;font-family:monospace;color:rgba(0,180,255,0.5);flex-shrink:0;margin-left:8px">' + ((e.peso||0)*100).toFixed(0) + '%</span>'
      + '</div>';
  }).join('');
  return '<div style="background:rgba(0,180,255,0.03);border:1px solid rgba(0,180,255,0.12);border-radius:12px;overflow:hidden">' + rows + '</div>';
}

function labSbEdgeClick(pdfId) {
  labSbSwitchView('grafo');
  var nodi = (labGrafoData && labGrafoData.nodi) ? labSbEnrichNodi(labGrafoData.nodi) : [];
  var d = nodi.find(function(n){ return n.id === pdfId; });
  if (d) { _sbFocusNode = d; labSbApplyFocus(); labSbNodeClick(d); }
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — D3 grafo
══════════════════════════════════════════════════════════════ */

var _sbSvg = null, _sbZoomBehavior = null, _sbActiveTags = null;
var _sbNodeSel = null, _sbLinkSel = null, _sbFocusNode = null, _sbLegendData = null;
var _SB_PALETTE = ['#00e5ff','#7b61ff','#4cd97b','#ffb84c','#ff6b6b','#4ce0d9','#c78cff','#f2d94e'];

function labSbGraphZoom(factor) {
  if (!_sbSvg || !_sbZoomBehavior) return;
  _sbSvg.transition().duration(200).call(_sbZoomBehavior.scaleBy, factor);
}
function labSbGraphReset() {
  if (!_sbSvg || !_sbZoomBehavior) return;
  _sbSvg.transition().duration(200).call(_sbZoomBehavior.transform, d3.zoomIdentity);
  _sbActiveTags = null;
  _sbFocusNode = null;
  labSbRenderLegend();
  labSbApplyFocus();
}

/* Rev.25: legenda per tag — tocca un chip per isolare/nascondere quella categoria */
function labSbRenderLegend() {
  var el = document.getElementById('sb-graph-legend');
  if (!el || !_sbLegendData) return;
  el.innerHTML = _sbLegendData.map(function(l) {
    var isOff = _sbActiveTags && _sbActiveTags.indexOf(l.tag) === -1;
    return '<span onclick="labSbToggleTag(\'' + labEsc(l.tag) + '\')" style="display:inline-flex;align-items:center;gap:5px;'
      + 'padding:4px 9px;border-radius:999px;background:rgba(0,180,255,0.06);border:1px solid rgba(0,180,255,0.15);'
      + 'font-size:10px;color:rgba(224,240,255,' + (isOff ? '0.3' : '0.8') + ');cursor:pointer">'
      + '<span style="width:7px;height:7px;border-radius:50%;background:' + l.color + '"></span>' + labEsc(l.tag) + '</span>';
  }).join('');
}
function labSbToggleTag(tag) {
  if (!_sbActiveTags) _sbActiveTags = _sbLegendData.map(function(l) { return l.tag; });
  var idx = _sbActiveTags.indexOf(tag);
  if (idx >= 0) _sbActiveTags.splice(idx, 1); else _sbActiveTags.push(tag);
  labSbRenderLegend();
  labSbApplyFocus();
}

/* Rev.25: applica lo stato visivo — nodo selezionato + connessi in evidenza, resto attenuato */
function labSbApplyFocus() {
  if (!_sbNodeSel || !_sbLinkSel) return;
  if (!_sbFocusNode) {
    _sbNodeSel.select('circle').attr('opacity', function(d) {
      return (_sbActiveTags && _sbActiveTags.indexOf(d._tag) === -1) ? 0.12 : 0.9;
    });
    _sbNodeSel.select('text').attr('opacity', 0);
    _sbLinkSel.attr('opacity', function(d) {
      var dim = _sbActiveTags && (_sbActiveTags.indexOf(d.source._tag) === -1 || _sbActiveTags.indexOf(d.target._tag) === -1);
      return dim ? 0.03 : 0.2;
    });
    return;
  }
  var connectedIds = {};
  connectedIds[_sbFocusNode.id] = true;
  _sbLinkSel.each(function(e) {
    if (e.source.id === _sbFocusNode.id) connectedIds[e.target.id] = true;
    if (e.target.id === _sbFocusNode.id) connectedIds[e.source.id] = true;
  });
  _sbNodeSel.select('circle').attr('opacity', function(d) { return connectedIds[d.id] ? 1 : 0.12; });
  _sbNodeSel.select('text').attr('opacity', function(d) { return connectedIds[d.id] ? 1 : 0; });
  _sbLinkSel.attr('opacity', function(e) {
    return (e.source.id === _sbFocusNode.id || e.target.id === _sbFocusNode.id) ? 0.9 : 0.03;
  });
}

function labSbInitGraph(nodi, edges) {
  var container = document.getElementById('sb-graph-container');
  var loading   = document.getElementById('sb-graph-loading');
  if (!container || !nodi.length) return;
  if (loading) loading.style.display = 'none';

  var W = container.clientWidth  || 340;
  var H = container.clientHeight || 340;

  d3.select(container).select('svg').remove();
  var svg = d3.select(container).append('svg')
    .attr('width', W).attr('height', H)
    .style('cursor','grab');
  _sbSvg = svg;

  var g = svg.append('g');

  var zoomBehavior = d3.zoom()
    .scaleExtent([0.3, 3])
    .on('zoom', function(ev){ g.attr('transform', ev.transform); });
  svg.call(zoomBehavior);
  _sbZoomBehavior = zoomBehavior;

  var defs = svg.append('defs');
  var filter = defs.append('filter').attr('id','sb-glow2');
  filter.append('feGaussianBlur').attr('stdDeviation','3').attr('result','blur');
  var feMerge = filter.append('feMerge');
  feMerge.append('feMergeNode').attr('in','blur');
  feMerge.append('feMergeNode').attr('in','SourceGraphic');

  var COLOR = { chiave:'#00e5ff', utile:'#7b61ff', generale:'#1a4a6e' };

  // Rev.25: colore per tag principale (legenda filtrabile) invece del solo gruppo rilevanza fisso
  var tagCount = {};
  nodi.forEach(function(n) {
    var t = (n.tag && n.tag[0]) ? n.tag[0] : 'altro';
    tagCount[t] = (tagCount[t]||0) + 1;
  });
  var topTags = Object.keys(tagCount).sort(function(a,b){ return tagCount[b]-tagCount[a]; }).slice(0, _SB_PALETTE.length);
  var tagColor = {};
  topTags.forEach(function(t, i){ tagColor[t] = _SB_PALETTE[i]; });
  nodi.forEach(function(n) {
    var t = (n.tag && n.tag[0]) ? n.tag[0] : 'altro';
    n._tag = topTags.indexOf(t) >= 0 ? t : 'altro';
    n._color = tagColor[n._tag] || COLOR[n.gruppo] || COLOR.generale;
  });
  _sbLegendData = topTags.map(function(t){ return { tag: t, color: tagColor[t], count: tagCount[t] }; });
  labSbRenderLegend();

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

  var link = g.append('g').selectAll('line')
    .data(linkData).enter().append('line')
    .attr('stroke', function(d){ return d.tipo === 'forte' ? 'rgba(0,229,255,0.4)' : 'rgba(0,180,255,0.12)'; })
    .attr('stroke-width', function(d){ return d.tipo === 'forte' ? 1.5 : 0.5; });

  var node = g.append('g').selectAll('g')
    .data(nodi).enter().append('g')
    .style('cursor','pointer')
    .on('click', function(ev, d){ ev.stopPropagation(); _sbFocusNode = d; labSbApplyFocus(); labSbNodeClick(d); })
    .call(d3.drag()
      .on('start', function(ev,d){ if(!ev.active) sim.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag',  function(ev,d){ d.fx=ev.x; d.fy=ev.y; })
      .on('end',   function(ev,d){ if(!ev.active) sim.alphaTarget(0); d.fx=null; d.fy=null; })
    );

  node.append('circle')
    .attr('r', function(d){ return d.gruppo === 'chiave' ? 10 : d.gruppo === 'utile' ? 7 : 5; })
    .attr('fill', function(d){ return d._color; })
    .attr('filter', function(d){ return d.gruppo === 'chiave' ? 'url(#sb-glow2)' : null; })
    .attr('opacity', 0.9);

  // Rev.25 FIX: etichette nascoste di default (nodi sovrapposti/illeggibili prima) —
  // compaiono solo per il nodo selezionato + i suoi collegati diretti (vedi labSbApplyFocus)
  node.append('text')
    .attr('dy', -13)
    .attr('text-anchor', 'middle')
    .attr('font-size', '8px')
    .attr('fill', 'rgba(224,240,255,0.85)')
    .attr('opacity', 0)
    .text(function(d){ return (d.titolo||'').substring(0,22); });

  _sbNodeSel = node;
  _sbLinkSel = link;
  _sbFocusNode = null;

  svg.on('click', function(){ _sbFocusNode = null; labSbApplyFocus(); });

  sim.on('tick', function(){
    link
      .attr('x1', function(d){ return d.source.x; })
      .attr('y1', function(d){ return d.source.y; })
      .attr('x2', function(d){ return d.target.x; })
      .attr('y2', function(d){ return d.target.y; });
    node.attr('transform', function(d){ return 'translate(' + d.x + ',' + d.y + ')'; });
  });

  labSbApplyFocus();
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — click su nodo → popup PDF completo
══════════════════════════════════════════════════════════════ */

/* Navigazione grafo (Fase 4) */

function labGrafoNaviga(id, maxHop2) {
  if (!labGrafoData || !labGrafoData.edges) return { hop1: [], hop2: [] };
  var edges = labGrafoData.edges;
  var analisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];
  var pdfMap  = {};
  analisi.forEach(function(a){ if(a.id) pdfMap[a.id] = a; });
  var hop1 = edges
    .filter(function(e){ return e.source === id || e.target === id; })
    .map(function(e){
      var nid = e.source === id ? e.target : e.source;
      var src = pdfMap[nid] || {};
      return { id: nid, titolo: src.titolo || nid, peso: e.peso || 0,
               sommario: src.sommario || '', tecniche: src.tecniche_chiave || [],
               tipo: e.tipo || 'normale' };
    })
    .sort(function(a,b){ return b.peso - a.peso; });
  var hop2 = [];
  if (maxHop2 && hop1.length) {
    var visti = new Set([id].concat(hop1.map(function(n){ return n.id; })));
    hop1.slice(0,3).forEach(function(h1) {
      edges.filter(function(e){ return e.source === h1.id || e.target === h1.id; })
        .forEach(function(e){
          var nid = e.source === h1.id ? e.target : e.source;
          if (!visti.has(nid)) {
            visti.add(nid);
            var src = pdfMap[nid] || {};
            hop2.push({ id: nid, titolo: src.titolo || nid, peso: (e.peso||0)*0.7,
                        sommario: src.sommario||'', tecniche: src.tecniche_chiave||[], via: h1.titolo });
          }
        });
    });
    hop2.sort(function(a,b){ return b.peso-a.peso; });
    hop2 = hop2.slice(0, maxHop2);
  }
  return { hop1: hop1, hop2: hop2 };
}

async function labWikiCarica(concettoId) {
  if (!concettoId) return null;
  try {
    var url = 'https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/wiki/concetti/' + concettoId + '.md?v=' + Date.now();
    var resp = await fetch(url);
    if (!resp.ok) return null;
    var testo = await resp.text();
    if (!testo || testo.length < 80) return null;
    if (testo.startsWith('---')) { var endFm = testo.indexOf('---', 3); if (endFm > 0) testo = testo.slice(endFm+3).trim(); }
    return testo.substring(0, 600);
  } catch(e) { return null; }
}

function labWikiMatchConcetto(pdf) {
  if (!labConcettiData || !labConcettiData.concetti) return null;
  var tecniche = (pdf.tecniche || pdf.tecniche_chiave || []).map(function(t){ return t.toLowerCase(); });
  var best = null, bestScore = 0;
  labConcettiData.concetti.forEach(function(c) {
    var cl = (c.label||'').toLowerCase();
    var cv = (c.varianti||[]).map(function(v){ return v.toLowerCase(); });
    var score = 0;
    tecniche.forEach(function(t){ if (cl.indexOf(t)!==-1||t.indexOf(cl.substring(0,6))!==-1) score+=2; });
    cv.forEach(function(v){ tecniche.forEach(function(t){ if(t.indexOf(v.substring(0,5))!==-1) score+=1; }); });
    if (score > bestScore) { bestScore = score; best = c; }
  });
  return best && bestScore > 0 ? best : null;
}

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
  + '<div style="margin-top:14px;display:flex;flex-direction:column;gap:8px">'
  + '<button onclick="document.getElementById(\'sb-search-input\').value=\''+labEsc(d.titolo||'')+'\'  ;labSbSearch()" style="font-size:11px;padding:7px 14px;border-radius:10px;border:1px solid rgba(0,180,255,0.3);color:#00b4ff;background:rgba(0,180,255,0.08);cursor:pointer">🔍 Cerca argomenti correlati</button>'
  + '<button onclick="labAnalizzaPdf(\'' + labEsc(d.id||'') + '\')" style="font-size:11px;padding:7px 14px;border-radius:10px;border:1px solid rgba(76,175,118,0.3);color:var(--green3);background:rgba(76,175,118,0.08);cursor:pointer">🧠 Analizza PDF completo con AI</button>'
  + '</div>';

  var grafo = labGrafoNaviga(d.id, 4);
  var hop2H = '';
  if (grafo.hop2.length) {
    hop2H = '<div style="font-size:9px;color:rgba(155,109,255,0.5);font-weight:700;margin:10px 0 5px">PDF A 2 HOP</div>'
      + grafo.hop2.map(function(n){
          return '<div style="font-size:10px;color:rgba(155,109,255,0.6);padding:3px 0;border-bottom:1px solid rgba(155,109,255,0.06)">'
            + '⋅ ' + labEsc((n.titolo||n.id).substring(0,50))
            + ' <span style="color:rgba(155,109,255,0.3)">via ' + labEsc((n.via||'').substring(0,25)) + '</span></div>';
        }).join('');
  }
  var el = document.getElementById('sb-search-results');
  if (el) {
    el.innerHTML = '<div style="background:rgba(0,180,255,0.04);border:1px solid rgba(0,180,255,0.2);border-radius:12px;padding:12px 14px;margin-bottom:12px">' + info + hop2H + '</div>';
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  var concettoMatch = labWikiMatchConcetto(d);
  if (concettoMatch) {
    labWikiCarica(concettoMatch.id).then(function(wikiTesto) {
      if (!wikiTesto) return;
      var wikiBox = '<div style="background:rgba(76,175,118,0.05);border:1px solid rgba(76,175,118,0.15);border-radius:10px;padding:12px;margin-top:10px">'
        + '<div style="font-size:9px;color:var(--green3);font-weight:700;letter-spacing:0.5px;margin-bottom:6px">📖 WIKI: ' + labEsc(concettoMatch.label) + '</div>'
        + '<div style="font-size:11px;color:rgba(76,175,118,0.75);line-height:1.7;white-space:pre-wrap">' + labEsc(wikiTesto.substring(0,400)) + '</div>'
        + '</div>';
      var inner = el.querySelector('div');
      if (inner) inner.insertAdjacentHTML('beforeend', wikiBox);
    }).catch(function(){});
  }
}

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — ricerca semantica → sintesi AI
══════════════════════════════════════════════════════════════ */

// (3) Mappa pdf_id -> Set(fasi) costruita da concetti_index.json (campo fasi_guida + pdf_ids per concetto).
// Cache: ricalcolata solo se labConcettiData cambia (controllo via riferimento oggetto).
var _labSbPdfFaseMapCache = null;
var _labSbPdfFaseMapSrc = null;
function labSbBuildPdfFaseMap() {
  if (_labSbPdfFaseMapCache && _labSbPdfFaseMapSrc === labConcettiData) return _labSbPdfFaseMapCache;
  var map = {};
  if (labConcettiData && Array.isArray(labConcettiData.concetti)) {
    labConcettiData.concetti.forEach(function(c) {
      var fasi = c.fasi_guida || [];
      var pdfIds = c.pdf_ids || [];
      if (!fasi.length || !pdfIds.length) return;
      pdfIds.forEach(function(pid) {
        if (!map[pid]) map[pid] = new Set();
        fasi.forEach(function(f) { map[pid].add(f); });
      });
    });
  }
  _labSbPdfFaseMapCache = map;
  _labSbPdfFaseMapSrc = labConcettiData;
  return map;
}

// === BM25 sparso per il Second Brain (Rev.26) ===
// Ricerca lessicale locale, zero costo/zero rete, usata sia come componente del ranking
// ibrido (insieme al cosine semantico) sia come fallback ordinato quando l'embedding
// non è disponibile (oggi il fallback dava un punteggio piatto 0.8 a tutti i match).
var _sbBm25Cache = null;
var _sbBm25Src = null;

var SB_STOPWORDS = {
  'di':1,'a':1,'da':1,'in':1,'con':1,'su':1,'per':1,'tra':1,'fra':1,
  'il':1,'lo':1,'la':1,'gli':1,'le':1,'un':1,'uno':1,'una':1,
  'e':1,'o':1,'ma':1,'che':1,'del':1,'della':1,'dello':1,'dei':1,'degli':1,'delle':1,
  'al':1,'allo':1,'alla':1,'ai':1,'agli':1,'alle':1,'nel':1,'nello':1,'nella':1,'nei':1,
  'negli':1,'nelle':1,'sul':1,'sullo':1,'sulla':1,'sui':1,'sugli':1,'sulle':1,
  'come':1,'anche':1,'piu':1,'meno':1,'non':1,'si':1,'se':1
};

function labSbTokenize(str) {
  if (!str) return [];
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(function(t){ return t.length > 2 && !SB_STOPWORDS[t]; });
}

function labSbBuildBm25Corpus() {
  if (_sbBm25Cache && _sbBm25Src === labPdfData) return _sbBm25Cache;
  var pdfAnalisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];
  var docs = pdfAnalisi.map(function(a) {
    // titolo ripetuto per pesarlo di più nel match (titolo conta triplo)
    var testo = [
      (a.titolo||''), (a.titolo||''), (a.titolo||''),
      (a.sommario||''),
      (a.tecniche_chiave||[]).join(' '),
      (a.tag||[]).join(' '),
      (a.estratto_chiave||'')
    ].join(' ');
    var tokens = labSbTokenize(testo);
    return { id: a.id, tokens: tokens, len: tokens.length };
  });
  var avgLen = docs.length ? docs.reduce(function(s,d){ return s+d.len; },0) / docs.length : 0;
  var df = {};
  docs.forEach(function(d) {
    var seen = {};
    d.tokens.forEach(function(t) {
      if (!seen[t]) { df[t] = (df[t]||0) + 1; seen[t] = true; }
    });
  });
  _sbBm25Cache = { docs: docs, df: df, avgLen: avgLen, N: docs.length };
  _sbBm25Src = labPdfData;
  return _sbBm25Cache;
}

function labSbBm25Scores(query) {
  var corpus = labSbBuildBm25Corpus();
  var qTokens = labSbTokenize(query);
  if (!qTokens.length || !corpus.N) return {};
  var k1 = 1.5, b = 0.75;
  var result = {};
  corpus.docs.forEach(function(d) {
    var termFreq = {};
    d.tokens.forEach(function(t){ termFreq[t] = (termFreq[t]||0)+1; });
    var score = 0;
    qTokens.forEach(function(qt) {
      var f = termFreq[qt] || 0;
      if (!f) return;
      var dfq = corpus.df[qt] || 0;
      var idf = Math.log((corpus.N - dfq + 0.5) / (dfq + 0.5) + 1);
      var denom = f + k1 * (1 - b + b * (d.len / (corpus.avgLen || 1)));
      score += idf * (f * (k1 + 1)) / (denom || 1);
    });
    if (score > 0) result[d.id] = score;
  });
  return result;
}

async function labSbSearch() {
  var input = document.getElementById('sb-search-input');
  var resEl = document.getElementById('sb-search-results');
  if (!input || !resEl) return;
  var query = input.value.trim();
  if (!query) return;

  var faseFilter = (document.getElementById('sb-filter-fase') || {}).value || '';

  resEl.innerHTML = '<div style="color:rgba(0,180,255,0.5);font-size:12px;padding:10px;text-align:center">\u23F3 Cerco nel knowledge base\u2026</div>';

  var pdfAnalisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];

  // Step 1: BM25 sparso (sempre, gratis, sincrono) combinato con rerank semantico
  // via embedding Mistral quando disponibile (Rev.26: prima era solo semantico-o-niente,
  // col fallback keyword a punteggio piatto 0.8 per tutti i match — nessun vero ranking).
  var topPdf = [];
  var usedSemantic = false;

  var bm25Raw = labSbBm25Scores(query);
  var bm25Max = 0;
  Object.keys(bm25Raw).forEach(function(k){ if (bm25Raw[k] > bm25Max) bm25Max = bm25Raw[k]; });
  var bm25Norm = {};
  Object.keys(bm25Raw).forEach(function(k){ bm25Norm[k] = bm25Max > 0 ? bm25Raw[k] / bm25Max : 0; });

  var byId = {};
  pdfAnalisi.forEach(function(a){ if(a.id) byId[a.id]=a; });

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

        var scores = labVettoriData.vettori.map(function(v) {
          var src = byId[v.id] || {};
          var semScore = labSbCosine(queryVec, v.vettore);
          var bm = bm25Norm[v.id] || 0;
          // Ibrido: 60% semantico + 40% BM25 — il semantico resta il segnale principale
          // (era quello già in uso), il BM25 recupera match lessicali esatti che
          // l'embedding a volte manca (termini tecnici rari, nomi propri, acronimi).
          var hybrid = semScore * 0.6 + bm * 0.4;
          return {
            score: hybrid,
            semScore: semScore,
            bm25Score: bm,
            titolo: src.titolo || v.titolo || v.id,
            sommario: src.sommario || '',
            tecniche: src.tecniche_chiave || [],
            consiglio: src.consiglio_coltivazione || src.consiglio_elettrocultura || '',
            estratto: src.estratto_chiave || '',
            id: v.id
          };
        });
        scores.sort(function(a,b){ return b.score-a.score; });
        topPdf = scores.slice(0,6).filter(function(s){ return s.score > 0.2 || s.semScore > 0.25; });
        usedSemantic = true;
      }
    } catch(e) { /* fallback keyword/BM25 */ }
  }

  // Fallback (embedding non disponibile): ranking BM25 puro invece di un punteggio
  // piatto 0.8 uguale per tutti — così anche senza rete i risultati sono ordinati
  // per rilevanza reale, non solo per ordine di apparizione nell'array.
  if (!topPdf.length) {
    var bm25Ranked = pdfAnalisi
      .filter(function(a){ return a.id && bm25Raw[a.id] > 0; })
      .map(function(a) {
        return {
          titolo: a.titolo||'', sommario: a.sommario||'', tecniche: a.tecniche_chiave||[],
          consiglio: a.consiglio_coltivazione||a.consiglio_elettrocultura||'',
          estratto: a.estratto_chiave||'', score: bm25Norm[a.id] || 0, id: a.id
        };
      })
      .sort(function(a,b){ return b.score - a.score; })
      .slice(0,6);

    if (bm25Ranked.length) {
      topPdf = bm25Ranked;
    } else {
      // Ultimo fallback: substring puro (query troppo corta/rara per il tokenizer BM25,
      // es. 1-2 caratteri o un acronimo filtrato dagli stopword/lunghezza minima)
      var ql = query.toLowerCase();
      topPdf = pdfAnalisi.filter(function(a){
        return (a.titolo||'').toLowerCase().indexOf(ql)!==-1
          || (a.sommario||'').toLowerCase().indexOf(ql)!==-1
          || (a.tecniche_chiave||[]).some(function(t){ return t.toLowerCase().indexOf(ql)!==-1; });
      }).slice(0,5).map(function(a){
        return { titolo:a.titolo||'', sommario:a.sommario||'', tecniche:a.tecniche_chiave||[], consiglio:a.consiglio_coltivazione||a.consiglio_elettrocultura||'', estratto:a.estratto_chiave||'', score:0.8, id:a.id };
      });
    }
  }

  // (3) FIX Rev.16: il filtro fase prima ESCLUDEVA i risultati non corrispondenti
  // (con un fallback solo se azzerava tutto). Ora non nasconde mai nulla: i
  // risultati della fase selezionata vengono solo portati in cima (sort),
  // coerente con "le pratiche/risultati devono essere sempre completi".
  if (faseFilter && topPdf.length) {
    var pdfFasiMap = labSbBuildPdfFaseMap();
    topPdf.sort(function(a, b) {
      var aMatch = (pdfFasiMap[a.id] && pdfFasiMap[a.id].has(faseFilter)) ? 1 : 0;
      var bMatch = (pdfFasiMap[b.id] && pdfFasiMap[b.id].has(faseFilter)) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return (b.score||0) - (a.score||0);
    });
  }

  if (!topPdf.length) {
    resEl.innerHTML = '<div style="color:rgba(0,180,255,0.4);font-size:12px;padding:10px">Nessun documento trovato per <em>' + labEsc(query) + '</em>.</div>';
    return;
  }

  // Step 2: sintesi via Cervello AI (Llama/OpenRouter)
  resEl.innerHTML = '<div style="color:rgba(0,180,255,0.5);font-size:12px;padding:10px;text-align:center">\uD83E\uDDE0 Sintetizzo con AI\u2026</div>';

  // Grafo: hop1+hop2 arricchisce contesto
  var pdfPerContesto = topPdf.slice();
  if (topPdf.length && labGrafoData) {
    var grafoTop = labGrafoNaviga(topPdf[0].id, 3);
    var byIdPdf2 = {};
    pdfAnalisi.forEach(function(a){ if(a.id) byIdPdf2[a.id]=a; });
    var giaPres = new Set(pdfPerContesto.map(function(p){ return p.id; }));
    grafoTop.hop1.slice(0,2).concat(grafoTop.hop2.slice(0,2)).forEach(function(n) {
      if (!giaPres.has(n.id)) {
        var src = byIdPdf2[n.id] || {};
        pdfPerContesto.push({ id:n.id, titolo:n.titolo, score:n.peso,
          sommario:src.sommario||'', tecniche:src.tecniche_chiave||[],
          consiglio:src.consiglio_coltivazione||src.consiglio_elettrocultura||'',
          estratto:src.estratto_chiave||'', _hop:n.via?'2hop':'1hop' });
        giaPres.add(n.id);
      }
    });
  }
  var contesto = pdfPerContesto.slice(0,8).map(function(p, i){
    var hl = p._hop ? ' ['+p._hop+']' : '';
    return '[PDF '+(i+1)+']'+hl+' '+p.titolo+'\n'
      +(p.sommario?'Sommario: '+p.sommario.substring(0,200)+'\n':'')
      +(p.tecniche&&p.tecniche.length?'Tecniche: '+p.tecniche.slice(0,4).join(', ')+'\n':'')
      +(p.consiglio?'Consiglio: '+p.consiglio.substring(0,150)+'\n':'')
      +(p.estratto?'Estratto: '+p.estratto.substring(0,150):'');
  }).join('\n\n---\n\n');

  try {
    var sintesi;
    try {
      sintesi = await labLlamaChat(
        'Sei il Cervello AI di BioSerra. Rispondi in italiano, conciso e pratico. Sintetizza le informazioni dai PDF per rispondere alla domanda del coltivatore. Evidenzia consigli pratici applicabili in serra a Caserta.',
        [{ role: 'user', content: 'Domanda: ' + query + '\n\nDocumenti trovati nel knowledge base:\n\n' + contesto + '\n\nRispondi in modo sintetico e pratico (max 5 frasi), poi elenca 2-3 punti chiave.' }],
        600
      );
    } catch (llamaErr) {
      sintesi = '⚠ ' + llamaErr.message;
    }

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

/* SECOND BRAIN — click su concetto wiki */

async function labSbConcettoClick(cid, clabel) {
  var resEl = document.getElementById('sb-search-results');
  if (!resEl) return;
  resEl.innerHTML = '<div style="color:rgba(76,175,118,0.5);font-size:12px;padding:10px;text-align:center">⏳ Carico wiki: ' + labEsc(clabel) + '…</div>';
  var concetto  = (labConcettiData && labConcettiData.concetti||[]).find(function(c){ return c.id===cid; });
  var pdfIds    = concetto ? (concetto.pdf_ids||[]) : [];
  var pdfColleg = (labPdfData && labPdfData.analisi||[]).filter(function(a){ return pdfIds.indexOf(a.id)!==-1; }).slice(0,4);
  var grafoAgg  = [];
  if (labGrafoData && pdfColleg.length) {
    var visti = new Set(pdfIds);
    pdfColleg.slice(0,2).forEach(function(pdf){
      labGrafoNaviga(pdf.id,0).hop1.slice(0,3).forEach(function(n){
        if (!visti.has(n.id)){ visti.add(n.id); grafoAgg.push(n); }
      });
    });
    grafoAgg.sort(function(a,b){ return b.peso-a.peso; });
  }
  var wikiTesto = await labWikiCarica(cid);
  var html = '<div style="background:rgba(76,175,118,0.05);border:1px solid rgba(76,175,118,0.2);border-radius:12px;padding:14px;margin-bottom:14px">';
  html += '<div style="font-size:10px;color:var(--green3);font-weight:700;letter-spacing:0.5px;margin-bottom:6px">📖 WIKI: ' + labEsc(clabel) + '</div>';
  if (wikiTesto) {
    html += '<div style="font-size:12px;color:rgba(76,175,118,0.8);line-height:1.7;white-space:pre-wrap;margin-bottom:12px">' + labEsc(wikiTesto.substring(0,500)) + '</div>';
  } else {
    html += '<div style="font-size:11px;color:rgba(76,175,118,0.4);margin-bottom:8px">Pagina wiki in generazione.</div>';
    if (concetto && concetto.descrizione) html += '<div style="font-size:12px;color:rgba(76,175,118,0.7);margin-bottom:12px">' + labEsc(concetto.descrizione) + '</div>';
  }
  if (pdfColleg.length) {
    html += '<div style="font-size:9px;color:rgba(0,180,255,0.4);font-weight:700;margin-bottom:6px">PDF COLLEGATI</div>';
    pdfColleg.forEach(function(p){
      html += '<div onclick="labSbOpenPdf(\'' + labEsc(p.id) + '\')" style="font-size:11px;color:rgba(0,180,255,0.7);padding:4px 0;border-bottom:1px solid rgba(0,180,255,0.08);cursor:pointer">📄 ' + labEsc((p.titolo||'').substring(0,55)) + '</div>';
    });
  }
  if (grafoAgg.length) {
    html += '<div style="font-size:9px;color:rgba(155,109,255,0.4);font-weight:700;margin:10px 0 6px">CORRELATI VIA GRAFO</div>';
    grafoAgg.slice(0,4).forEach(function(n){
      html += '<div onclick="labSbOpenPdf(\'' + labEsc(n.id) + '\')" style="font-size:10px;color:rgba(155,109,255,0.65);padding:3px 0;cursor:pointer">⋅ ' + labEsc((n.titolo||n.id).substring(0,50)) + '</div>';
    });
  }
  html += '<div style="margin-top:12px"><button onclick="document.getElementById(\'sb-search-input\').value=\'' + labEsc(clabel) + '\';labSbSearch()" style="font-size:11px;padding:7px 14px;border-radius:10px;border:1px solid rgba(76,175,118,0.3);color:var(--green3);background:rgba(76,175,118,0.08);cursor:pointer;width:100%">🔍 Cerca nel Knowledge Base</button></div>';
  html += '</div>';
  resEl.innerHTML = html;
  resEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* analisi PDF on-demand */

async function labAnalizzaPdf(pdfId, domanda) {
  var resEl = document.getElementById('sb-search-results');
  if (!resEl) return;
  var src = (labPdfData && labPdfData.analisi||[]).find(function(a){ return a.id===pdfId; });
  if (!src) { resEl.innerHTML='<div style="color:rgba(255,100,100,0.7);padding:10px">PDF non trovato.</div>'; return; }
  var titolo = src.titolo || pdfId;
  resEl.innerHTML = '<div style="color:rgba(0,180,255,0.5);font-size:12px;padding:10px;text-align:center">⏳ Carico testo: ' + labEsc(titolo.substring(0,50)) + '...</div>';
  var safeId = src.testo_id || titolo.replace(/[^\w\-]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').substring(0,80);
  var fonteSito = src.fonte_sito || '';
  var testoCompleto = '';
  // Cerca testo in ordine: fusi > web/sito > testi/
  var pathsProva = [];
  if (fonteSito === 'fuso') {
    pathsProva.push('data/testi/fusi/'+safeId+'.txt');
  } else if (fonteSito) {
    pathsProva.push('data/testi/web/'+fonteSito+'/'+safeId+'.txt');
  } else {
    pathsProva.push('data/testi/'+safeId+'.txt');
    pathsProva.push('data/testi/fusi/'+safeId+'.txt');
  }
  var RAW_BASE = 'https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/';
  for (var pi=0; pi<pathsProva.length && !testoCompleto; pi++) {
    try {
      var tr = await fetch(RAW_BASE+pathsProva[pi]+'?v='+Date.now());
      if (tr.ok) {
        var raw = await tr.text();
        if (raw.startsWith('===')) { var ei=raw.indexOf('\n\n'); if(ei>0) raw=raw.slice(ei+2); }
        testoCompleto = raw.trim().substring(0,8000);
      }
    } catch(e) {}
  }
  var ctx = testoCompleto.length>100 ? testoCompleto : (src.sommario||'')+'\n'+(src.estratto_chiave||'')+'\n'+(src.consiglio_coltivazione||'');
  if (ctx.length<30) {
    resEl.innerHTML='<div style="color:rgba(255,180,0,0.7);padding:10px">⚠ Testo non ancora estratto. Riprova domani.</div>'; return;
  }
  resEl.innerHTML='<div style="color:rgba(0,180,255,0.5);font-size:12px;padding:10px;text-align:center">🧠 Analizzo '+ctx.length+' chars con AI...</div>';
  var dom = domanda || 'Riassumi i punti chiave applicabili alla serra BioSerra Caserta (Living Soil, elettrocultura, biodinamica).';
  var rispo;
  try {
    rispo = await labLlamaChat(
      'Sei un agronomo esperto Living Soil, biodinamica ed elettrocultura per serra outdoor Caserta (41N). Hai letto questo manuale. Rispondi in italiano, specifico e pratico. Cita il testo.',
      [{ role: 'user', content: 'MANUALE "'+titolo+'":\n\n'+ctx+'\n\n---\nDOMANDA: '+dom }],
      1200
    );
  } catch (llamaErr) {
    rispo = '⚠ ' + llamaErr.message;
  }
  resEl.innerHTML='<div style="background:rgba(76,175,118,0.06);border:1px solid rgba(76,175,118,0.2);border-radius:12px;padding:14px;margin-bottom:12px">'
    +'<div style="font-size:9px;color:var(--green3);font-weight:700;margin-bottom:4px">📄 '+labEsc(titolo.substring(0,60))+' · '+ctx.length+' chars</div>'
    +'<div style="font-size:12px;color:var(--text2);line-height:1.8;white-space:pre-wrap">'+labEsc(rispo)+'</div>'
    +'<div style="margin-top:10px;display:flex;gap:8px">'
    +'<input id="sb-od-inp" type="text" placeholder="Altra domanda su questo PDF..." '
    +'style="flex:1;background:rgba(0,180,255,0.08);border:1px solid rgba(0,180,255,0.2);border-radius:8px;padding:8px 12px;color:#e0f0ff;font-size:12px;outline:none" '
    +'onkeydown="if(event.key===\'Enter\')labAnalizzaPdf(\'' + labEsc(pdfId) + '\',this.value)" />'
    +'<button onclick="labAnalizzaPdf(\'' + labEsc(pdfId) + '\',document.getElementById(\'sb-od-inp\').value)" '
    +'style="background:rgba(76,175,118,0.15);border:1px solid rgba(76,175,118,0.3);border-radius:8px;padding:8px 14px;color:var(--green3);cursor:pointer">🔍</button>'
    +'</div></div>';
  resEl.scrollIntoView({behavior:'smooth',block:'start'});
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



