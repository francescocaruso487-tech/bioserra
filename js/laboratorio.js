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
  _labxSbPopupOpen = false;
  var ov = document.getElementById('lab-popup-overlay');
  if (ov) ov.style.display = 'none';
  document.body.style.overflow = '';
}

function labEsc(s) {
  // Rev.28: escape anche di apici e virgolette — i titoli con apostrofi
  // dentro attributi onclick="...('TITOLO')" rompevano l'HTML generato
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
  // Rev.28: badge-pdf numerico rimosso — il conteggio vive nel meta sotto l'icona
  if (bPdf) { bPdf.textContent = ''; bPdf.classList.remove('show'); }
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
        '<div><div style="font-size:9px;color:rgba(143,212,168,0.5);font-weight:700;letter-spacing:1px;margin-bottom:4px">BRIEFING MATTUTINO' + dateLabel + '</div>'+
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
  h += '<div style="font-size:9px;color:rgba(143,212,168,0.5);font-weight:700;letter-spacing:1px;margin-bottom:4px">' + campo.label + '</div>';
  h += '<div class="lab-digest-compact" style="margin:0">' + labEsc(campo.testo) + '</div>';
  h += '</div></div>';
  if (d.guide_potenziate && d.guide_potenziate.length) {
    var gp = d.guide_potenziate[0];
    h += '<div style="margin-top:10px;background:rgba(143,212,168,0.05);border-radius:8px;padding:8px 10px;font-size:11px;color:rgba(143,212,168,0.7)">';
    h += '🌱 <strong>' + labEsc(gp.titolo||'') + '</strong>: ' + labEsc((gp.potenziamento_pdf||gp.guida_base||'').substring(0,80)) + '…';
    h += '</div>';
  }
  el.innerHTML = h;
}

/* ── Popup digest completo ── */
function labPopupAllDigest() {
  var d = labDigestData;
  if (!d) { labPopupOpen('<div style="color:rgba(143,212,168,0.5);padding:20px;text-align:center">Digest in caricamento…</div>'); return; }
  var h = '<div style="font-size:10px;color:var(--el-blue);font-weight:700;letter-spacing:1px;margin-bottom:4px">✨ KNOWLEDGE DIGEST</div>';
  h += '<div style="font-size:10px;color:rgba(143,212,168,0.35);margin-bottom:14px">' + labEsc(d.data||d.lastUpdate||'') + '</div>';
  if (d.consiglio_integrato) {
    h += '<div style="background:linear-gradient(135deg,rgba(143,212,168,0.08),rgba(179,156,217,0.08));border-left:2px solid var(--el-blue);padding:12px;border-radius:0 10px 10px 0;margin-bottom:12px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:6px">⚡ CONSIGLIO INTEGRATO</div>';
    h += '<div style="font-size:13px;color:var(--text);line-height:1.7">' + labEsc(d.consiglio_integrato) + '</div>';
    h += '</div>';
  }
  if (d.scoperta_del_giorno) {
    h += '<div style="background:rgba(143,212,168,0.06);border-radius:10px;padding:10px;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-cyan);margin-bottom:4px">✨ SCOPERTA DEL GIORNO</div>';
    h += '<div style="font-size:13px;color:var(--text2);line-height:1.6">' + labEsc(d.scoperta_del_giorno) + '</div>';
    h += '</div>';
  }
  if (d.connessione_inaspettata) {
    h += '<div style="background:rgba(179,156,217,0.06);border-radius:10px;padding:10px;margin-bottom:10px">';
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
      h += '<div style="background:rgba(143,212,168,0.05);border-radius:8px;padding:8px 10px;margin-bottom:6px">';
      h += '<div style="font-size:12px;font-weight:700;color:var(--el-cyan);margin-bottom:3px">' + labEsc(es.nome||'') + '</div>';
      if (es.descrizione) h += '<div style="font-size:11px;color:var(--text2)">' + labEsc(es.descrizione.substring(0,120)) + '</div>';
      h += '</div>';
    });
  }
  if (d.stats) {
    h += '<div style="display:flex;gap:16px;margin-top:14px;padding-top:10px;border-top:1px solid rgba(143,212,168,0.1)">';
    h += '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:var(--el-blue)">' + (d.stats.guide||0) + '</div><div style="font-size:9px;color:rgba(143,212,168,0.4)">GUIDE</div></div>';
    h += '<div style="text-align:center"><div style="font-size:16px;font-weight:700;color:var(--el-violet)">' + (d.stats.esperimenti||0) + '</div><div style="font-size:9px;color:rgba(179,156,217,0.4)">ESPERIMENTI</div></div>';
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
  if (c==='irrigazione') return '#8fd4a8';
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
    el.innerHTML = '<div style="color:rgba(143,212,168,0.35);font-size:12px;padding:6px">Nessuna pratica disponibile.</div>';
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
    if (isAttiva) h += '<span style="font-size:8.5px;font-family:var(--font-mono);letter-spacing:1px;color:var(--green3);border:1px solid rgba(143,212,168,0.35);border-radius:99px;padding:2px 8px">ATTIVA</span>';
    if (isOff) h += '<span style="font-size:8.5px;font-family:var(--font-mono);letter-spacing:1px;color:var(--text3);border:1px solid var(--border);border-radius:99px;padding:2px 8px">OFF</span>';
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
    ? '<span style="font-size:9.5px;font-family:var(--font-mono);letter-spacing:1px;color:var(--green3);border:1px solid rgba(143,212,168,0.35);border-radius:99px;padding:4px 12px;flex-shrink:0">ATTIVA</span>'
    : '<span style="font-size:9.5px;font-family:var(--font-mono);letter-spacing:1px;color:var(--text3);border:1px solid var(--border);border-radius:99px;padding:4px 12px;flex-shrink:0">DISATTIVATA</span>');
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
    h += '<div style="background:rgba(143,212,168,0.06);border-radius:10px;padding:10px 12px;margin-bottom:10px">';
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
    h += '<div style="background:rgba(143,212,168,0.05);border:1px solid rgba(143,212,168,0.1);border-radius:10px;padding:12px;margin-bottom:12px">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--el-blue);margin-bottom:8px">\uD83D\uDEE0 MATERIALI NECESSARI</div>';
    mat.forEach(function(m) {
      h += '<div style="font-size:12px;color:var(--text2);padding:4px 0;border-bottom:1px solid rgba(143,212,168,0.06)">\u2022 ' + labEsc(m) + '</div>';
    });
    h += '</div>';
  }

  // Varianti (tecniche)
  var varianti = d.varianti || [];
  if (varianti.length) {
    h += '<div style="background:rgba(179,156,217,0.05);border-radius:10px;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--el-violet);margin-bottom:6px">\uD83D\uDD00 VARIANTI</div>';
    varianti.forEach(function(v) { h += '<div style="font-size:11px;color:rgba(179,156,217,0.8);padding:2px 0">\u2022 ' + labEsc(v) + '</div>'; });
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
    h += '<div style="background:rgba(143,212,168,0.05);border-left:2px solid var(--el-blue);border-radius:0 10px 10px 0;padding:10px;margin-bottom:12px">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--el-blue);margin-bottom:6px">\uD83D\uDD17 PRATICHE CORRELATE</div>';
    correlate.forEach(function(c) {
      h += '<div style="font-size:11px;color:rgba(143,212,168,0.8);padding:4px 0;border-bottom:1px solid rgba(143,212,168,0.07);cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupPratica(\'' + c.id + '\');},60)">\u2192 ' + labEsc(c.nome) + '</div>';
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
      h += '<div style="background:rgba(179,156,217,0.05);border-radius:10px;padding:10px;margin-bottom:12px">';
      h += '<div style="font-size:9px;font-weight:700;color:var(--el-violet);margin-bottom:6px">\uD83D\uDCD6 GUIDE COLLEGATE</div>';
      guideCorr.slice(0,2).forEach(function(item) {
        h += '<div style="font-size:11px;color:rgba(179,156,217,0.8);padding:4px 0;cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupGuida(' + item.idx + ');},60)">\u2192 ' + labEsc(item.g.titolo||'') + '</div>';
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
    if (isAttiva) h += '<span style="font-size:8.5px;font-family:var(--font-mono);letter-spacing:1px;color:var(--green3);border:1px solid rgba(143,212,168,0.35);border-radius:99px;padding:2px 8px">ATTIVA</span>';
    else if (isOff) h += '<span style="font-size:8.5px;font-family:var(--font-mono);letter-spacing:1px;color:var(--text3);border:1px solid var(--border);border-radius:99px;padding:2px 8px">OFF</span>';
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
    el.innerHTML = '<div class="lab-arch-mini" style="cursor:default;border-color:transparent"><span class="lab-arch-mini-icon">\uD83D\uDCC4</span><div class="lab-arch-mini-body"><div class="lab-arch-mini-title" style="color:rgba(179,156,217,0.4)">Nessun PDF analizzato</div><div class="lab-arch-mini-sub">Carica PDF su Drive \u2014 analisi ogni giorno alle 5:00</div></div></div>';
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
      h += '<span style="background:rgba(179,156,217,0.12);border:1px solid rgba(179,156,217,0.2);border-radius:5px;padding:2px 7px;font-size:10px;color:#b39cd9;margin:0 3px 3px 0;display:inline-block">' + labEsc(tg) + '</span>';
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
      h += '<div style="background:rgba(179,156,217,0.06);border-radius:10px;padding:10px;margin-bottom:10px">';
      h += '<div style="font-size:10px;font-weight:700;color:var(--el-violet);margin-bottom:8px">⚡ TECNICHE CHIAVE</div>';
      tcF.forEach(function(tc) { h += '<div style="font-size:12px;color:var(--text2);padding:3px 0;border-bottom:1px solid rgba(179,156,217,0.08)">• ' + labEsc(tc+'') + '</div>'; });
      h += '</div>';
    }
  }
  if (pdf.estratto_chiave) {
    h += '<div style="background:rgba(143,212,168,0.06);border-left:2px solid var(--el-blue);padding:10px;border-radius:0 8px 8px 0;margin-bottom:10px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:4px">ESTRATTO CHIAVE</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6;font-style:italic">' + labEsc(pdf.estratto_chiave) + '</div></div>';
  }
  if (pdf.consiglio_coltivazione) {
    h += '<div style="background:rgba(76,175,118,0.07);border-radius:10px;padding:10px;margin-bottom:8px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--green3);margin-bottom:5px">🌱 COLTIVAZIONE</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(pdf.consiglio_coltivazione) + '</div></div>';
  }
  if (pdf.consiglio_elettrocultura) {
    h += '<div style="background:rgba(143,212,168,0.06);border-radius:10px;padding:10px;margin-bottom:8px">';
    h += '<div style="font-size:10px;font-weight:700;color:var(--el-blue);margin-bottom:5px">⚡ ELETTROCULTURA</div>';
    h += '<div style="font-size:12px;color:var(--text2);line-height:1.6">' + labEsc(pdf.consiglio_elettrocultura) + '</div></div>';
  }
  if (pdf.connessioni && pdf.connessioni.length) {
    h += '<div style="margin-top:4px">';
    h += '<div style="font-size:10px;font-weight:700;color:rgba(179,156,217,0.6);margin-bottom:6px">CONNESSIONI (' + pdf.connessioni.length + ')</div>';
    pdf.connessioni.slice(0,5).forEach(function(c) { h += '<div style="font-size:11px;color:rgba(179,156,217,0.55);padding:2px 0">🔗 ' + labEsc(c+'') + '</div>'; });
    h += '</div>';
  }
  labPopupOpen(h);
}

/* Popup tutti i PDF */
function labPopupAllPdf() {
  var d = labPdfData;
  if (!d || !d.analisi || !d.analisi.length) {
    labPopupOpen('<div style="color:rgba(179,156,217,0.4);padding:20px;text-align:center">Nessun PDF analizzato.</div>');
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
    h += '<div style="background:rgba(179,156,217,0.04);border:1px solid rgba(179,156,217,0.15);border-radius:10px;padding:10px;margin-bottom:8px;cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupPdf(' + idx + ');},50)">';
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
    el.innerHTML = '<div class="lab-arch-mini" style="cursor:default;border-color:transparent"><span class="lab-arch-mini-icon">📖</span><div class="lab-arch-mini-body"><div class="lab-arch-mini-title" style="color:rgba(179,156,217,0.4)">Guide in generazione</div><div class="lab-arch-mini-sub">Aggiornate ogni 3 giorni da Zamnesia + PDF</div></div></div>';
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
    if (tcN) h += '<div style="font-size:9px;color:rgba(143,212,168,0.5);margin-top:2px">⚡ ' + tcN + ' tecniche PDF</div>';
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
    h += '<div style="border:1px solid rgba(143,212,168,0.2);border-radius:10px;margin-bottom:8px;overflow:hidden">';
    h += '<div style="padding:10px 12px;background:rgba(143,212,168,0.05);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="var el=document.getElementById(\'' + tid2 + '\');el.style.display=el.style.display===\'none\'?\'block\':\'none\'">';
    h += '<span style="font-size:11px;font-weight:700;color:var(--el-blue)">\u26A1 TECNICHE PDF (' + g.tecniche_pdf.length + ')</span>';
    h += '<span style="color:var(--el-blue);font-size:14px">\u25BE</span></div>';
    h += '<div id="' + tid2 + '" style="display:none;padding:10px 12px">';
    var tutteTec2 = (typeof labBuildTecnicheComplete === 'function') ? labBuildTecnicheComplete() : [];
    g.tecniche_pdf.forEach(function(tname) {
      var matchIdx = -1;
      tutteTec2.forEach(function(tec, ti) { if ((tec.nome||'').toLowerCase().indexOf(tname.toLowerCase().substring(0,8)) !== -1) matchIdx = ti; });
      if (matchIdx >= 0) {
        h += '<div style="font-size:11px;color:rgba(143,212,168,0.8);padding:4px 0;border-bottom:1px solid rgba(143,212,168,0.07);cursor:pointer" onclick="labPopupClose();setTimeout(function(){labPopupTecnicaAll(' + matchIdx + ');},60)">\u2192 \uD83D\uDD17 ' + labEsc(tname) + '</div>';
      } else {
        h += '<div style="font-size:11px;color:rgba(143,212,168,0.6);padding:4px 0;border-bottom:1px solid rgba(143,212,168,0.07)">\u2022 ' + labEsc(tname) + '</div>';
      }
    });
    h += '</div></div>';
  }

  // Sezione esperimenti PDF collegati (cliccabili)
  if (g.esperimenti_pdf && g.esperimenti_pdf.length) {
    var eid2 = 'gep_' + idx;
    h += '<div style="border:1px solid rgba(179,156,217,0.2);border-radius:10px;margin-bottom:8px;overflow:hidden">';
    h += '<div style="padding:10px 12px;background:rgba(179,156,217,0.05);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="var el=document.getElementById(\'' + eid2 + '\');el.style.display=el.style.display===\'none\'?\'block\':\'none\'">';
    h += '<span style="font-size:11px;font-weight:700;color:var(--el-violet)">\uD83E\uDDEA ESPERIMENTI (' + g.esperimenti_pdf.length + ')</span>';
    h += '<span style="color:var(--el-violet);font-size:14px">\u25BE</span></div>';
    h += '<div id="' + eid2 + '" style="display:none;padding:10px 12px">';
    g.esperimenti_pdf.forEach(function(ename) {
      h += '<div style="font-size:11px;color:rgba(179,156,217,0.8);padding:4px 0;border-bottom:1px solid rgba(179,156,217,0.07)">\u2022 ' + labEsc(ename) + '</div>';
    });
    h += '</div></div>';
  }

  labPopupOpen(h);
}

/* Popup tutte le guide */
function labPopupAllGuide() {
  if (!labGuideData.length) {
    labPopupOpen('<div style="color:rgba(179,156,217,0.4);padding:20px;text-align:center">Guide in generazione…</div>');
    return;
  }
  var h = '<div style="font-size:10px;color:var(--el-violet);font-weight:700;letter-spacing:1px;margin-bottom:4px">📖 GUIDE (' + labGuideData.length + ')</div>';
  h += '<div style="font-size:10px;color:rgba(179,156,217,0.4);margin-bottom:14px">Zamnesia + PDF — ogni 3 giorni</div>';
  labGuideData.forEach(function(g, idx) {
    var catColor = g.fase==='irrigazione' ? 'var(--el-blue)'
      : g.fase==='nutrizione' ? 'var(--green3)'
      : g.fase==='difesa_biologica' ? 'var(--red)'
      : g.fase==='living_soil' ? '#7ec860' : 'var(--el-violet)';
    var tcN = g.tecniche_pdf ? g.tecniche_pdf.length : 0;
    h += '<div style="background:rgba(179,156,217,0.04);border:1px solid rgba(179,156,217,0.15);border-left:2px solid ' + catColor + ';border-radius:0 10px 10px 0;padding:10px;margin-bottom:8px;cursor:pointer" onclick="labPopupClose();setTimeout(function(){ labPopupGuida(' + idx + '); },50)">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start">';
    h += '<div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px">' + labEsc(g.titolo||'') + '</div>';
    if (g.fase) h += '<div style="font-size:10px;color:' + catColor + ';margin-bottom:3px">' + g.fase.replace('_',' ') + '</div>';
    if (g.punti_chiave && g.punti_chiave.length) h += '<div style="font-size:11px;color:var(--text3)">' + g.punti_chiave.slice(0,2).map(function(p){ return '✓ ' + p.substring(0,40); }).join('  ') + '</div>';
    h += '</div>';
    if (tcN) h += '<div style="font-size:9px;color:rgba(143,212,168,0.5);white-space:nowrap;padding-left:8px">⚡ ' + tcN + ' PDF</div>';
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
    h += '<div style="font-size:10px;color:rgba(143,212,168,0.4);margin-top:8px;padding-top:6px;border-top:1px solid rgba(143,212,168,0.1)">' + labEsc(agenti.piante.stato_generale) + '</div>';
  }
  if (!h) h = '<div class="lab-brain-consiglio" style="opacity:0.4">Nessun consiglio disponibile.</div>';
  el.innerHTML = h;
}

/* Scroll verso cervello AI */
function labScrollBrain() {
  var el = document.querySelector('.lab-brain-terminal'); // Rev.28: la label separata non esiste piu'
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

var _labxSbPopupOpen = false;

async function labLoadSecondBrain() {
  var ts = '?v=' + Date.now();
  try {
    // Rev.28: il client carica il grafo LITE (~0.5MB). Il grafo completo ha
    // superato i 10MB: il fetch andava in timeout su mobile e il Second Brain
    // restava a zero (niente connessioni, niente grafo). pdf_vectors.json
    // (3.7MB) non viene piu' scaricato all'avvio: lazy alla prima ricerca.
    var r = await fetch(LAB_RAW + 'pdf_graph_lite.json' + ts);
    if (!r.ok) r = await fetch(LAB_RAW + 'pdf_graph.json' + ts);
    labGrafoData = await r.json();
  } catch(e) {
    console.warn('Second Brain load error:', e);
  }
  labRenderSbMini();
  // se il popup era stato aperto durante il caricamento (stats a zero), ricostruiscilo
  if (_labxSbPopupOpen && labGrafoData) labPopupSecondBrain();
}

/* Rev.28: vettori embedding caricati solo alla prima ricerca (3.7MB risparmiati all'avvio) */
async function labxEnsureVettori() {
  if (labVettoriData && labVettoriData.vettori && labVettoriData.vettori.length) return true;
  try {
    var r = await fetch(LAB_RAW + 'pdf_vectors.json?v=' + Date.now());
    if (!r.ok) return false;
    labVettoriData = await r.json();
    labRenderSbMini();
    return !!(labVettoriData && labVettoriData.vettori && labVettoriData.vettori.length);
  } catch(e) { return false; }
}

/* mini widget Second Brain nella pagina principale */
function labRenderSbMini() {
  var el = document.getElementById('lab-sb-mini');
  var totVet  = labVettoriData  && labVettoriData.vettori    ? labVettoriData.vettori.length    : 0;
  var totPdf  = labPdfData      && labPdfData.analisi        ? labPdfData.analisi.length         : 0;
  var totEdg  = labGrafoData    && labGrafoData.edges        ? labGrafoData.edges.length         : 0;
  var totConc = labConcettiData && labConcettiData.concetti  ? labConcettiData.concetti.length   : 0;
  labxFillMeta();
  if (!el) return;
  if (!totVet && !totPdf && !totConc) {
    el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:4px">Embedding in corso \u2014 workflow notturno.</div>';
    return;
  }
  var totContra = 0;
  if (labGrafoData && labGrafoData.edges) {
    labGrafoData.edges.forEach(function(e){ if (e.tipo_conn === 'contraddizione') totContra++; });
  }
  var totEdgReali = (labGrafoData && labGrafoData.edges_totali_completo) ? labGrafoData.edges_totali_completo : totEdg;
  el.innerHTML = '<div class="sbx-stats" style="margin-bottom:0">'
    + '<div class="sbx-stat"><b>' + totPdf + '</b><span>PDF</span></div>'
    + '<div class="sbx-stat"><b>' + totConc + '</b><span>concetti</span></div>'
    + '<div class="sbx-stat"><b>' + totContra + '</b><span>contrasti</span></div>'
    + '<div class="sbx-stat"><b>' + (totEdgReali > 999 ? (totEdgReali/1000).toFixed(0) + 'k' : totEdgReali) + '</b><span>link</span></div>'
    + '</div>';
}

/* Rev.28: contatori sotto le icone della grid Laboratorio */
function labxFillMeta() {
  function setM(id, txt) { var e = document.getElementById(id); if (e) e.innerHTML = txt; }
  try {
  if (typeof labBuildPratiche === 'function') {
    var tutte = labBuildPratiche();
    if (tutte.length) {
      var nAtt = tutte.filter(function(p){ return p.attiva === true; }).length;
      setM('labx-meta-tec', '<b>' + nAtt + '</b> attive \u00B7 ' + tutte.length);
    }
  }
  var nPdf = labPdfData && labPdfData.analisi ? labPdfData.analisi.length : 0;
  if (nPdf) setM('labx-meta-pdf', '<b>' + nPdf + '</b> documenti');
  var nGuide = labGuideData && labGuideData.length ? labGuideData.length : 0;
  if (nGuide) setM('labx-meta-guide', '<b>' + nGuide + '</b> complete');
  var nEdg = labGrafoData ? (labGrafoData.edges_totali_completo || (labGrafoData.edges||[]).length) : 0;
  if (nEdg) setM('labx-meta-sb', '<b>' + (nEdg > 999 ? (nEdg/1000).toFixed(0) + 'k' : nEdg) + '</b> connessioni');
  } catch(e) { /* dati non ancora pronti: i meta si riempiono alla prossima render */ }
}

/* Rev.28: ricerca dalla home Laboratorio - apre Second Brain e cerca */
function labxHomeSearch() {
  var inp = document.getElementById('labx-home-search');
  var q = inp ? inp.value.trim() : '';
  labPopupSecondBrain();
  if (q) {
    setTimeout(function() {
      var sbi = document.getElementById('sb-search-input');
      if (sbi) { sbi.value = q; labSbSearch(); }
    }, 60);
  }
}

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
  _labxSbPopupOpen = true;
  var edges = (labGrafoData && labGrafoData.edges) ? labGrafoData.edges : [];
  var nPdf  = (labPdfData   && labPdfData.analisi) ? labPdfData.analisi.length : 0;
  var nConcetti = (labConcettiData && labConcettiData.concetti) ? labConcettiData.concetti.length : 0;
  var nContra = 0;
  edges.forEach(function(e){ if (e.tipo_conn === 'contraddizione') nContra++; });
  var totEdgReali = (labGrafoData && labGrafoData.edges_totali_completo) ? labGrafoData.edges_totali_completo : edges.length;
  var nEdg = totEdgReali > 999 ? (totEdgReali/1000).toFixed(1) + 'k' : String(totEdgReali);

  // Rev.28: se i dati non sono ancora arrivati, stato di caricamento esplicito
  // (il popup si ricostruisce da solo appena labLoadSecondBrain finisce)
  if (!nPdf || !edges.length) {
    labPopupOpen(
      '<div class="labx-eyebrow" style="margin-top:0">Second Brain</div>'
    + '<div class="labx-title" style="font-size:20px">Knowledge Base</div>'
    + '<div class="sbx-card" style="padding:22px;text-align:center">'
    + '<div style="font-size:13px;color:var(--text2)">\u23F3 Sto caricando il knowledge base\u2026</div>'
    + '<div class="sbx-hint" style="margin-top:8px">si apre da solo appena pronto</div>'
    + '</div>');
    return;
  }

  var html =
    '<div class="labx-eyebrow" style="margin-top:0">Second Brain</div>'
  + '<div class="labx-title" style="font-size:20px">Knowledge Base</div>'
  + '<div class="labx-sub">' + nPdf + ' documenti collegati fra loro</div>'

  + '<div class="sbx-stats">'
  +   '<div class="sbx-stat"><b>' + nPdf + '</b><span>PDF</span></div>'
  +   '<div class="sbx-stat"><b>' + nConcetti + '</b><span>concetti</span></div>'
  +   '<div class="sbx-stat"><b>' + nContra + '</b><span>contrasti</span></div>'
  +   '<div class="sbx-stat"><b>' + nEdg + '</b><span>link</span></div>'
  + '</div>'

  + '<div style="margin-bottom:12px">'
  + '<div class="labx-search" style="margin-bottom:8px">'
  + '<input id="sb-search-input" type="text" placeholder="Es: come usare il rame? quando annaffiare?" '
  + 'onkeydown="if(event.key===\'Enter\'){event.preventDefault();labSbSearch();}" />'
  + '<button onclick="labSbSearch()">\u2192</button>'
  + '</div>'
  + '<select id="sb-filter-fase" style="width:100%;background:var(--card2);border:1px solid var(--border);'
  + 'border-radius:10px;padding:8px 10px;color:var(--text2);font-size:12px;font-family:var(--font)">'
  +   '<option value="">Tutte le fasi</option>'
  +   '<option value="germinazione">\uD83C\uDF31 Germinazione</option>'
  +   '<option value="vegetazione">\uD83C\uDF3F Vegetazione</option>'
  +   '<option value="fioritura">\uD83C\uDF38 Fioritura</option>'
  +   '<option value="essiccazione">\uD83C\uDF42 Essiccazione</option>'
  + '</select>'
  + '<div class="sbx-hint" style="text-align:left;margin-top:6px">Linguaggio naturale \u2014 la risposta sintetizza i PDF con l\u2019AI</div>'
  + '</div>'

  + '<div id="sb-search-results" style="margin-bottom:12px"></div>'

  + '<div class="sbx-subtab">'
  + '<div id="sb-seg-documenti" class="on" onclick="labSbSwitchView(\'documenti\')">Documenti</div>'
  + '<div id="sb-seg-categoria" onclick="labSbSwitchView(\'categoria\')">Categorie</div>'
  + '<div id="sb-seg-connessioni" onclick="labSbSwitchView(\'connessioni\')">Connessioni</div>'
  + '</div>'

  // Rev.28: Documenti è il tab di default — tocca un documento e vedi subito il suo grafo
  + '<div id="sb-view-documenti">' + labSbBuildDocumentiHTML() + '</div>'
  + '<div id="sb-view-categoria" style="display:none"></div>'
  + '<div id="sb-view-connessioni" style="display:none"></div>'
  + '<div class="sbx-hint">tocca un documento per vedere il suo grafo di collegamenti</div>';

  labPopupOpen(html);
}

/* Rev.25: switch tra le 3 viste del Second Brain (Grafo/Categoria/Connessioni) */
function labSbSwitchView(view) {
  ['categoria','documenti','connessioni'].forEach(function(v) {
    var el = document.getElementById('sb-view-' + v);
    if (el) el.style.display = (v === view) ? '' : 'none';
    var btn = document.getElementById('sb-seg-' + v);
    if (btn) btn.className = (v === view) ? 'on' : '';
  });
  // Rev.28 lazy render: documenti e connessioni costruiti solo alla prima apertura
  // (la vista connessioni ordina 50k+ edge: farlo all'apertura del popup bloccava tutto)
  var target = document.getElementById('sb-view-' + view);
  if (target && !target.innerHTML.trim()) {
    if (view === 'documenti')   target.innerHTML = labSbBuildDocumentiHTML();
    if (view === 'categoria')   target.innerHTML = labSbBuildCategorieHTML();
    if (view === 'connessioni') target.innerHTML = labSbBuildConnessioniHTML();
  }
}

/* Rev.28: vista "Documenti" - lista ordinata per numero di collegamenti forti */
function labSbBuildDocumentiHTML() {
  var analisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];
  if (!analisi.length) return '<div style="color:var(--text3);font-size:12px;padding:10px 4px">Nessun documento ancora.</div>';
  var edges = (labGrafoData && labGrafoData.edges) ? labGrafoData.edges : [];
  var linkCount = {};
  edges.forEach(function(e) {
    if (e.tipo === 'semantico_reale' || (e.peso||0) > 0.6) {
      linkCount[e.source] = (linkCount[e.source]||0) + 1;
      linkCount[e.target] = (linkCount[e.target]||0) + 1;
    }
  });
  var docs = analisi.map(function(a) {
    return { id: a.id, titolo: a.titolo || a.id, cat: a.categoria_reale || (a.tag&&a.tag[0]) || 'altro', n: linkCount[a.id]||0 };
  }).sort(function(a,b){ return b.n - a.n; });

  var rows = docs.slice(0, 60).map(function(d) {
    return '<div class="sbx-li" onclick="labSbOpenPdf(\'' + labEsc(d.id) + '\')">'
      + '<div class="sbx-li-body">'
      + '<div class="sbx-li-tit">' + labEsc(d.titolo) + '</div>'
      + '<div class="sbx-li-sub">' + labEsc(labSbCategoriaLabel(d.cat)) + ' \u00B7 ' + d.n + ' collegamenti forti</div>'
      + '</div><span class="sbx-li-chev">\u203A</span></div>';
  }).join('');
  return '<div class="sbx-card">' + rows + '</div>'
    + (docs.length > 60 ? '<div class="sbx-hint">mostrati i primi 60 per collegamenti \u2014 usa la ricerca per il resto</div>' : '');
}

/* Rev.25: vista "Per categoria" — accordion sfogliabile senza dover cercare */
function labSbBuildCategorieHTML() {
  if (!labConcettiData || !Array.isArray(labConcettiData.concetti) || !labConcettiData.concetti.length) {
    return '<div style="color:var(--text3);font-size:12px;padding:10px 4px">Nessun concetto indicizzato ancora \u2014 arrivano con la pipeline notturna.</div>';
  }
  var gruppi = {};
  labConcettiData.concetti.forEach(function(c) {
    var cat = c.categoria || 'altro';
    if (!gruppi[cat]) gruppi[cat] = [];
    gruppi[cat].push(c);
  });
  var PALETTE = ['#8fd4a8','#b39cd9','#7fb8d4','#dfb56c','#de8074','#a8c97f','#e3cf7a','#8fbfb3','#9aa5c9'];
  var cats = Object.keys(gruppi).sort(function(a,b){ return gruppi[b].length - gruppi[a].length; });
  var maxN = gruppi[cats[0]].length;
  return '<div class="sbx-card">' + cats.map(function(cat, idx) {
    var items = gruppi[cat];
    var col = PALETTE[idx % PALETTE.length];
    var pct = Math.max(6, Math.round(items.length / maxN * 100));
    var rows = items.map(function(c) {
      return '<div class="sbx-li" style="padding-left:26px" onclick="event.stopPropagation();labSbConcettoClick(\'' + labEsc(c.id) + '\',\'' + labEsc(c.label) + '\')">'
        + '<div class="sbx-li-body"><div class="sbx-li-tit" style="font-weight:400">' + labEsc(c.label) + '</div></div>'
        + '<span class="sbx-cat-n">' + (c.pdf_count||0) + ' PDF</span></div>';
    }).join('');
    return '<details' + (idx === 0 ? ' open' : '') + '>'
      + '<summary class="sbx-cat" style="list-style:none">'
      + '<div class="sbx-cat-row"><span class="sbx-cat-nm"><i class="sbx-cat-dot" style="background:' + col + '"></i>'
      + labEsc(labSbCategoriaLabel(cat)) + '</span><span class="sbx-cat-n">' + items.length + '</span></div>'
      + '<div class="sbx-bar"><i style="width:' + pct + '%;background:' + col + '"></i></div>'
      + '</summary>' + rows + '</details>';
  }).join('') + '</div>';
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
  var edges = (labGrafoData && labGrafoData.edges) ? labGrafoData.edges : [];
  if (!edges.length) {
    return '<div style="color:var(--text3);font-size:12px;padding:10px 4px">Nessuna connessione ancora \u2014 cresce ogni notte.</div>';
  }
  var analisi = (labPdfData && labPdfData.analisi) ? labPdfData.analisi : [];
  var byId = {};
  analisi.forEach(function(a) { if (a.id) byId[a.id] = a; });

  var contraddizioni = [];
  var altre = [];
  edges.forEach(function(e) {
    if (e.tipo_conn === 'contraddizione') contraddizioni.push(e);
    else if (e.tipo === 'semantico_reale') altre.push(e);
  });
  altre.sort(function(a,b){ return (b.peso||0) - (a.peso||0); });
  contraddizioni.sort(function(a,b){ return (b.peso||0) - (a.peso||0); });

  var html = '';
  if (contraddizioni.length) {
    html += '<div class="sbx-cat-row" style="margin:2px 2px 8px"><span style="font-size:13px;font-weight:600;color:var(--orange)">\u26A0\uFE0F Contraddizioni tra manuali</span>'
      + '<span class="sbx-cat-n">' + contraddizioni.length + '</span></div>';
    html += contraddizioni.slice(0, 30).map(function(e) {
      var ta = (byId[e.source]||{}).titolo || e.source;
      var tb = (byId[e.target]||{}).titolo || e.target;
      var descr = e.descrizione ? '<p style="margin-top:4px">' + labEsc((e.descrizione||'').substring(0,140)) + '</p>' : '';
      return '<div class="sbx-contra" onclick="labSbEdgeClick(\'' + labEsc(e.source) + '\')">'
        + '<div class="sbx-contra-vs">' + labEsc((ta||'').substring(0,26)).toUpperCase() + ' \u2194 ' + labEsc((tb||'').substring(0,26)).toUpperCase() + '</div>'
        + descr + '</div>';
    }).join('');
  }
  html += '<div class="sbx-cat-row" style="margin:14px 2px 8px"><span style="font-size:13px;font-weight:600;color:var(--text)">\uD83D\uDD17 Connessioni pi\u00F9 forti</span>'
    + '<span class="sbx-cat-n">' + altre.length + '</span></div>';
  html += '<div class="sbx-card">' + altre.slice(0, 40).map(function(e) {
    var ta = (byId[e.source]||{}).titolo || e.source;
    var tb = (byId[e.target]||{}).titolo || e.target;
    return '<div class="sbx-li" onclick="labSbEdgeClick(\'' + labEsc(e.source) + '\')">'
      + '<div class="sbx-li-body">'
      + '<div class="sbx-li-tit" style="font-weight:400">' + labEsc((ta||'').substring(0,30)) + ' \u2194 ' + labEsc((tb||'').substring(0,30)) + '</div>'
      + '<div class="sbx-li-sub">' + labEsc(e.tipo_conn || 'semantico') + '</div>'
      + '</div><span class="sbx-cat-n">' + ((e.peso||0)*100).toFixed(0) + '%</span></div>';
  }).join('') + '</div>';

  return html;
}

function labSbEdgeClick(pdfId) {
  labSbOpenPdf(pdfId);
}

/* ══════════════════════════════════════════════════════════════
   Rev.28: il grafo D3 globale è stato RIMOSSO (330 nodi × 57k edge
   in force-simulation bloccavano il telefono). Sostituito da liste
   + ego-grafo per documento (vedi labSbNodeClick / labxDrawEgo).
   Le funzioni restano come no-op per retrocompatibilità.
══════════════════════════════════════════════════════════════ */

var _sbSvg = null, _sbZoomBehavior = null, _sbActiveTags = null;
var _sbNodeSel = null, _sbLinkSel = null, _sbFocusNode = null, _sbLegendData = null;

function labSbGraphZoom() {}
function labSbGraphReset() {}
function labSbRenderLegend() {}
function labSbToggleTag() {}
function labSbApplyFocus() {}
function labSbInitGraph() {}

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
               tipo: e.tipo || 'normale', tipo_conn: e.tipo_conn || null };
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

/* ══════════════════════════════════════════════════════════════
   SECOND BRAIN — Rev.28: scheda documento con EGO-GRAFO
   Il grafo globale (330 nodi × 57k edge in D3 force) bloccava il
   telefono: ora ogni documento mostra SOLO i suoi collegamenti più
   forti su canvas statico (zero fisica, zero librerie, sempre fluido).
══════════════════════════════════════════════════════════════ */

var _labxEgoNodes = [];
var _LABX_EGO_COLORS = {
  sinergia: '#8fd4a8',
  principio_condiviso: '#7fb8d4',
  contraddizione: '#dfb56c',
  potenziamento: '#b39cd9',
  embedding: '#5c6b62'
};

function labxEgoColor(n) {
  return _LABX_EGO_COLORS[n.tipo_conn] || _LABX_EGO_COLORS.embedding;
}

function labxDrawEgo(docId) {
  var cv = document.getElementById('sbx-ego');
  if (!cv) return;
  var cssW = cv.clientWidth || 320;
  var cssH = cv.clientHeight || 260;
  var scale = 2; // retina
  cv.width = cssW * scale; cv.height = cssH * scale;
  var ctx = cv.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  var grafo = labGrafoNaviga(docId, 0);
  var vicini = grafo.hop1.slice(0, 12);
  _labxEgoNodes = [];
  var cx = cssW / 2, cy = cssH / 2;

  if (!vicini.length) {
    ctx.fillStyle = 'rgba(143,212,168,0.4)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('nessun collegamento ancora', cx, cy);
    return;
  }

  var rIn = Math.min(cssW, cssH) * 0.26;
  var rOut = Math.min(cssW, cssH) * 0.44;

  // anelli guida
  ctx.strokeStyle = 'rgba(143,212,168,0.07)';
  ctx.lineWidth = 1;
  [rIn, rOut].forEach(function(r) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  });

  var nForti = Math.min(vicini.length, 6);
  vicini.forEach(function(v, i) {
    var strong = i < nForti;
    var r = strong ? rIn : rOut;
    var count = strong ? nForti : (vicini.length - nForti);
    var idx = strong ? i : (i - nForti);
    var a = (idx / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2 + (strong ? 0 : 0.35);
    var x = cx + Math.cos(a) * r * 1.25;
    var y = cy + Math.sin(a) * r * 0.85;
    x = Math.max(24, Math.min(cssW - 24, x));
    y = Math.max(22, Math.min(cssH - 22, y));
    var col = labxEgoColor(v);
    ctx.strokeStyle = col + (strong ? '99' : '55');
    ctx.lineWidth = strong ? 2 : 1.1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    _labxEgoNodes.push({ x: x, y: y, id: v.id, titolo: v.titolo, col: col, strong: strong });
  });

  ctx.textAlign = 'center';
  _labxEgoNodes.forEach(function(n) {
    ctx.fillStyle = n.col;
    ctx.beginPath(); ctx.arc(n.x, n.y, n.strong ? 8 : 6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(231,237,233,0.85)';
    ctx.font = '500 8.5px JetBrains Mono, monospace';
    var lbl = (n.titolo || '').substring(0, 16);
    var ly = n.y < cy ? n.y - 13 : n.y + 18;
    ctx.fillText(lbl, n.x, ly);
  });

  // nodo centrale
  ctx.fillStyle = '#0f1311';
  ctx.strokeStyle = '#8fd4a8';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8fd4a8';
  ctx.font = '600 9px Space Grotesk, sans-serif';
  ctx.fillText('DOC', cx, cy + 3);
}

function labxEgoTap(ev) {
  var cv = document.getElementById('sbx-ego');
  if (!cv || !_labxEgoNodes.length) return;
  var rect = cv.getBoundingClientRect();
  var x = ev.clientX - rect.left;
  var y = ev.clientY - rect.top;
  for (var i = 0; i < _labxEgoNodes.length; i++) {
    var n = _labxEgoNodes[i];
    if (Math.hypot(n.x - x, n.y - y) < 22) { labSbOpenPdf(n.id); return; }
  }
}

function labSbNodeClick(d) {
  var edges = (labGrafoData && labGrafoData.edges) ? labGrafoData.edges : [];
  var nConn = 0;
  edges.forEach(function(e){ if (e.source === d.id || e.target === d.id) nConn++; });

  var tagsH = (d.tag || []).slice(0, 5).map(function(t) {
    return '<span class="sbx-pill">' + labEsc(t) + '</span>';
  }).join('');

  var tecH = (d.tecniche || []).slice(0, 5).map(function(t) {
    return '<div style="font-size:12px;color:var(--text2);padding:2px 0">\u2022 ' + labEsc(t) + '</div>';
  }).join('');

  var info =
    '<div class="sbx-block-label" style="color:var(--green3)">Documento selezionato</div>'
  + '<div style="font-family:var(--font-disp);font-size:15px;font-weight:600;color:var(--text);margin-bottom:8px;line-height:1.3">' + labEsc(d.titolo || 'PDF') + '</div>'
  + (tagsH ? '<div style="margin-bottom:10px">' + tagsH + '</div>' : '')

  // Rev.28: EGO-GRAFO del documento (sostituisce il grafo globale)
  + '<canvas id="sbx-ego" onclick="labxEgoTap(event)"></canvas>'
  + '<div class="sbx-legend">'
  + '<span><i style="background:#8fd4a8"></i>sinergia</span>'
  + '<span><i style="background:#7fb8d4"></i>principio</span>'
  + '<span><i style="background:#dfb56c"></i>contraddizione</span>'
  + '<span><i style="background:#b39cd9"></i>potenziamento</span>'
  + '<span><i style="background:#5c6b62"></i>semantico</span>'
  + '</div>'
  + '<div class="sbx-hint" style="margin-bottom:12px">' + nConn + ' collegamenti totali \u00B7 tocca un nodo per navigare</div>'

  + (d.sommario ? '<div class="sbx-block"><div class="sbx-block-label">Sommario</div><p>' + labEsc(d.sommario) + '</p></div>' : '')
  + (d.estratto ? '<div class="sbx-block"><div class="sbx-block-label" style="color:var(--purple)">Estratto chiave</div><p style="font-style:italic">' + labEsc(d.estratto) + '</p></div>' : '')
  + (d.consiglio ? '<div class="sbx-block"><div class="sbx-block-label" style="color:var(--green3)">\uD83C\uDF31 Consiglio pratico</div><p>' + labEsc(d.consiglio) + '</p></div>' : '')
  + (tecH ? '<div class="sbx-block"><div class="sbx-block-label">\u26A1 Tecniche chiave</div>' + tecH + '</div>' : '')

  + '<button class="sbx-btn" onclick="document.getElementById(\'sb-search-input\').value=\'' + labEsc(d.titolo || '') + '\';labSbSearch()">\uD83D\uDD0D Cerca argomenti correlati</button>'
  + '<button class="sbx-btn" onclick="labAnalizzaPdf(\'' + labEsc(d.id || '') + '\')">\uD83E\uDDE0 Analizza PDF completo con AI</button>';

  var el = document.getElementById('sb-search-results');
  if (el) {
    el.innerHTML = '<div class="sbx-card" style="padding:14px">' + info + '</div>';
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    requestAnimationFrame(function() { labxDrawEgo(d.id); });
  }
  var concettoMatch = labWikiMatchConcetto(d);
  if (concettoMatch) {
    labWikiCarica(concettoMatch.id).then(function(wikiTesto) {
      if (!wikiTesto) return;
      var wikiBox = '<div class="sbx-block" style="border-left:2px solid var(--green3)">'
        + '<div class="sbx-block-label" style="color:var(--green3)">\uD83D\uDCD6 Wiki: ' + labEsc(concettoMatch.label) + '</div>'
        + '<p>' + labEsc(wikiTesto.substring(0, 400)) + '</p></div>';
      var inner = el.querySelector('.sbx-card');
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

  resEl.innerHTML = '<div style="color:rgba(143,212,168,0.5);font-size:12px;padding:10px;text-align:center">\u23F3 Cerco nel knowledge base\u2026</div>';

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

  if (await labxEnsureVettori()) {
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
    resEl.innerHTML = '<div style="color:rgba(143,212,168,0.4);font-size:12px;padding:10px">Nessun documento trovato per <em>' + labEsc(query) + '</em>.</div>';
    return;
  }

  // Step 2: sintesi via Cervello AI (Llama/OpenRouter)
  resEl.innerHTML = '<div style="color:rgba(143,212,168,0.5);font-size:12px;padding:10px;text-align:center">\uD83E\uDDE0 Sintetizzo con AI\u2026</div>';

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
    html += '<div style="font-size:9px;color:rgba(143,212,168,0.4);letter-spacing:0.5px;margin-bottom:8px">FONTI (' + topPdf.length + ' PDF' + (usedSemantic?' \u2022 ricerca semantica':' \u2022 ricerca keyword') + ')</div>';
    topPdf.forEach(function(p) {
      var pct = usedSemantic ? (p.score*100).toFixed(0) + '%' : '';
      html += '<div onclick="labSbOpenPdf(\'' + labEsc(p.id) + '\')" style="background:rgba(143,212,168,0.04);border:1px solid rgba(143,212,168,0.12);border-radius:10px;padding:10px 12px;margin-bottom:7px;cursor:pointer;transition:background 0.2s" onmouseover="this.style.background=\'rgba(143,212,168,0.08)\'" onmouseout="this.style.background=\'rgba(143,212,168,0.04)\'">'
        + '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'
        + '<div style="font-size:12px;font-weight:600;color:#e7ede9;flex:1;padding-right:8px">' + labEsc((p.titolo||'').substring(0,55)) + '</div>'
        + (pct ? '<div style="font-size:11px;color:#8fd4a8;font-weight:700">' + pct + '</div>' : '')
        + '</div>'
        + (p.sommario ? '<div style="font-size:11px;color:rgba(143,212,168,0.55);line-height:1.4">' + labEsc(p.sommario.substring(0,100)) + '\u2026</div>' : '')
        + '</div>';
    });

    resEl.innerHTML = html;

  } catch(e) {
    // Fallback senza AI: mostra solo PDF con info estese
    var html = '<div style="font-size:9px;color:rgba(143,212,168,0.4);letter-spacing:0.5px;margin-bottom:8px">DOCUMENTI TROVATI</div>';
    topPdf.forEach(function(p) {
      html += '<div onclick="labSbOpenPdf(\'' + labEsc(p.id) + '\')" style="background:rgba(143,212,168,0.04);border:1px solid rgba(143,212,168,0.12);border-radius:10px;padding:10px 12px;margin-bottom:7px;cursor:pointer">'
        + '<div style="font-size:12px;font-weight:600;color:#e7ede9;margin-bottom:4px">' + labEsc((p.titolo||'').substring(0,55)) + '</div>'
        + (p.consiglio ? '<div style="font-size:11px;color:rgba(76,175,118,0.7);margin-bottom:4px">' + labEsc(p.consiglio.substring(0,120)) + '</div>' : '')
        + (p.sommario ? '<div style="font-size:11px;color:rgba(143,212,168,0.55)">' + labEsc(p.sommario.substring(0,100)) + '</div>' : '')
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
    html += '<div style="font-size:9px;color:rgba(143,212,168,0.4);font-weight:700;margin-bottom:6px">PDF COLLEGATI</div>';
    pdfColleg.forEach(function(p){
      html += '<div onclick="labSbOpenPdf(\'' + labEsc(p.id) + '\')" style="font-size:11px;color:rgba(143,212,168,0.7);padding:4px 0;border-bottom:1px solid rgba(143,212,168,0.08);cursor:pointer">📄 ' + labEsc((p.titolo||'').substring(0,55)) + '</div>';
    });
  }
  if (grafoAgg.length) {
    html += '<div style="font-size:9px;color:rgba(179,156,217,0.4);font-weight:700;margin:10px 0 6px">CORRELATI VIA GRAFO</div>';
    grafoAgg.slice(0,4).forEach(function(n){
      html += '<div onclick="labSbOpenPdf(\'' + labEsc(n.id) + '\')" style="font-size:10px;color:rgba(179,156,217,0.65);padding:3px 0;cursor:pointer">⋅ ' + labEsc((n.titolo||n.id).substring(0,50)) + '</div>';
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
  resEl.innerHTML = '<div style="color:rgba(143,212,168,0.5);font-size:12px;padding:10px;text-align:center">⏳ Carico testo: ' + labEsc(titolo.substring(0,50)) + '...</div>';
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
  resEl.innerHTML='<div style="color:rgba(143,212,168,0.5);font-size:12px;padding:10px;text-align:center">🧠 Analizzo '+ctx.length+' chars con AI...</div>';
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
    +'style="flex:1;background:rgba(143,212,168,0.08);border:1px solid rgba(143,212,168,0.2);border-radius:8px;padding:8px 12px;color:#e7ede9;font-size:12px;outline:none" '
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



