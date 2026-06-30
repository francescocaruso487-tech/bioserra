/* BioSerra - app.js */

/* ══════════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════════ */
function showSection(id, btn) {
  document.querySelectorAll('.section').forEach(function(s){ s.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(b){ b.classList.remove('active'); });
  var sec = document.getElementById('sec-' + id);
  if (sec) sec.classList.add('active');
  if (btn) btn.classList.add('active');
  window.scrollTo(0, 0);
  try { if (id === 'laboratorio') { setTimeout(aiInitUI, 50); initElettrocultura(); } } catch(e) {}
  try { if (id === 'impostazioni') setTimeout(initImpostazioni, 50); } catch(e) {}
  try { if (id === 'ambiente') initAmbiente(); } catch(e) {}
  // FIX Rev.16: in precedenza il refresh di Piante era delegato a navigateTo(),
  // funzione mai collegata ad alcun bottone -> alert/stato piante non si
  // aggiornavano mai tornando sulla tab dopo la prima apertura dell'app.
  try {
    if (id === 'piante') {
      if (typeof renderActivePlants === 'function') renderActivePlants();
      if (typeof checkHarvestAlerts === 'function') checkHarvestAlerts();
    }
  } catch(e) { console.error('[BioSerra] refresh piante on showSection:', e); }
}

/* ── Tab Laboratorio ── */
function switchLabTab(tab) {
  ['elettro','manuali','cervello'].forEach(function(t) {
    var panel = document.getElementById('lab-panel-' + t);
    var btn   = document.getElementById('lab-tab-' + t);
    if (panel) panel.classList.toggle('active', t === tab);
    if (btn)   btn.classList.toggle('active',   t === tab);
  });
  if (tab === 'cervello') { brainLoad(); setTimeout(aiInitUI, 50); }
  if (tab === 'manuali')  { manRenderNote(); loadManualiJSON(); }
  if (tab === 'elettro')  { elTecRicarica(); espLoad(); }
}


/* ══════════════════════════════════════════════════════════════
   HEADER ACTIONS
══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   (18) VISTA DI OGGI UNIFICATA
   Card che fonde: consiglio Cervello + giorno biodinamico + meteo critico +
   piante vicine al raccolto. Legge dati già caricati da altri moduli, senza
   nuove chiamate di rete. Va richiamata dopo che i loader principali hanno
   avuto modo di completare (è tollerante a dati ancora assenti).
══════════════════════════════════════════════════════════════ */
function renderVistaOggiUnificata() {
  var box = document.getElementById('vista-oggi-unificata');
  if (!box) return;
  var esc = function(s) { return (typeof labEsc === 'function') ? labEsc(s) : String(s == null ? '' : s); };
  var parts = [];

  // 1. Consiglio Cervello del giorno
  try {
    if (typeof labBrainData !== 'undefined' && labBrainData && labBrainData.cervello) {
      var briefing = labBrainData.cervello.briefing_mattutino || '';
      if (briefing && briefing.indexOf('```') < 0 && briefing.length > 10) {
        parts.push({ icon: '🧠', label: 'Consiglio Cervello', testo: esc(briefing.substring(0, 140)) + (briefing.length > 140 ? '…' : '') });
      }
    }
  } catch (e) {}

  // 2. Giorno biodinamico
  try {
    if (typeof getDayType === 'function' && typeof DAY_TYPES !== 'undefined') {
      var ct = getDayType(new Date());
      var bioT = DAY_TYPES[ct.type];
      if (bioT) parts.push({ icon: bioT.icon, label: 'Giorno biodinamico', testo: bioT.label });
    }
  } catch (e) {}

  // 3. Meteo critico (legge il box già renderizzato da renderAlertMeteoCritici in ambiente.js)
  try {
    var meteoBox = document.getElementById('w-alert-critici');
    if (meteoBox && meteoBox.style.display !== 'none' && meteoBox.children.length) {
      parts.push({ icon: '⚠️', label: 'Meteo critico nei prossimi giorni', testo: meteoBox.children.length + ' alert attivi — dettagli in Ambiente' });
    }
  } catch (e) {}

  // 4. Piante vicine al raccolto (entro 7gg)
  try {
    if (typeof loadActivePlants === 'function') {
      var plants = loadActivePlants();
      var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
      var vicine = 0;
      plants.forEach(function(p) {
        var ovr = (typeof loadPlantPhaseOverride === 'function') ? loadPlantPhaseOverride(p.id) : null;
        var hd = null;
        if (ovr && ovr.harvestDate) hd = new Date(ovr.harvestDate);
        else if (p.type === 'auto' && p.germDate) hd = addDays(new Date(p.germDate), p.harvestMin);
        else if (p.type === 'femm' && typeof getEffectiveFlorStart === 'function') {
          var fi = getEffectiveFlorStart(p);
          hd = addDays(fi.date, femmFlorDays(p, p.harvestMin));
        }
        if (hd) { var dl = daysDiff(oggi, hd); if (dl >= 0 && dl <= 7) vicine++; }
      });
      if (vicine > 0) parts.push({ icon: '🌾', label: 'Raccolti imminenti', testo: vicine + ' pianta' + (vicine > 1 ? 'e' : '') + ' entro 7 giorni' });
    }
  } catch (e) {}

  if (!parts.length) { box.style.display = 'none'; return; }

  box.innerHTML = '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">📋 Vista di oggi</div>'
    + parts.map(function(p) {
        return '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">'
          + '<span style="font-size:16px;flex-shrink:0;">' + p.icon + '</span>'
          + '<div><div style="font-size:10px;color:var(--text3);font-weight:600;">' + p.label + '</div>'
          + '<div style="font-size:12px;color:var(--text);">' + p.testo + '</div></div></div>';
      }).join('');
  box.style.display = 'block';
}

/* ══════════════════════════════════════════════════════════════
   (19) RICERCA GLOBALE
   Interroga in un colpo solo piante, PDF, tecniche, esperimenti e diario.
   Solo lettura/visualizzazione: niente navigazione automatica tra sezioni,
   per restare semplice e robusto (match testuale, non semantico).
══════════════════════════════════════════════════════════════ */
function openRicercaGlobale() {
  var modal = document.getElementById('modal-ricerca-globale');
  var input = document.getElementById('ricerca-globale-input');
  var resEl = document.getElementById('ricerca-globale-results');
  if (!modal) return;
  modal.classList.add('open');
  if (input) { input.value = ''; setTimeout(function(){ input.focus(); }, 100); }
  if (resEl) resEl.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text3);font-size:12px;">Digita almeno 2 caratteri per cercare in piante, PDF, tecniche, esperimenti e diario.</div>';
}

function closeRicercaGlobale(e) {
  var m = document.getElementById('modal-ricerca-globale');
  if (!e || e.target === m) { if (m) m.classList.remove('open'); }
}

var _ricercaGlobaleTimer = null;
function ricercaGlobaleEsegui() {
  clearTimeout(_ricercaGlobaleTimer);
  _ricercaGlobaleTimer = setTimeout(_ricercaGlobaleEseguiOra, 200);
}

function _rgEsc(s) { return (typeof labEsc === 'function') ? labEsc(s) : String(s == null ? '' : s); }

function _ricercaGlobaleEseguiOra() {
  var input = document.getElementById('ricerca-globale-input');
  var resEl = document.getElementById('ricerca-globale-results');
  if (!input || !resEl) return;
  var q = input.value.trim().toLowerCase();
  if (q.length < 2) {
    resEl.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text3);font-size:12px;">Digita almeno 2 caratteri…</div>';
    return;
  }

  var sezioni = [];

  // Piante attive
  try {
    if (typeof loadActivePlants === 'function') {
      var pM = loadActivePlants().filter(function(p) { return (p.name || '').toLowerCase().indexOf(q) !== -1; });
      if (pM.length) sezioni.push({ titolo: '🌿 Piante', items: pM.map(function(p) {
        return { label: (p.icon || '') + ' ' + p.name, sub: p.type === 'auto' ? 'Autofiorente' : 'Femminizzata' };
      }) });
    }
  } catch (e) {}

  // PDF analizzati
  try {
    if (typeof labPdfData !== 'undefined' && labPdfData && Array.isArray(labPdfData.analisi)) {
      var pdfM = labPdfData.analisi.filter(function(a) {
        return (a.titolo || '').toLowerCase().indexOf(q) !== -1 || (a.sommario || '').toLowerCase().indexOf(q) !== -1;
      }).slice(0, 8);
      if (pdfM.length) sezioni.push({ titolo: '📄 PDF', items: pdfM.map(function(a) {
        return { label: a.titolo || a.id, sub: (a.sommario || '').substring(0, 70) };
      }) });
    }
  } catch (e) {}

  // Tecniche / concetti
  try {
    if (typeof labElTecniche !== 'undefined' && Array.isArray(labElTecniche)) {
      var tecM = labElTecniche.filter(function(t) {
        return ((t.nome || t.label || '').toLowerCase().indexOf(q) !== -1) || ((t.descrizione || t.desc || '').toLowerCase().indexOf(q) !== -1);
      }).slice(0, 8);
      if (tecM.length) sezioni.push({ titolo: '⚡ Tecniche', items: tecM.map(function(t) {
        return { label: t.nome || t.label, sub: (t.descrizione || t.desc || '').substring(0, 70) };
      }) });
    }
  } catch (e) {}

  // Esperimenti (attivi + proposte)
  try {
    if (typeof labEspData !== 'undefined' && labEspData) {
      var tutti = (labEspData.esperimenti_attivi || []).concat(labEspData.proposte || labEspData.esperimenti_disponibili || []);
      var espM = tutti.filter(function(e) {
        return ((e.nome || '').toLowerCase().indexOf(q) !== -1) || ((e.descrizione || '').toLowerCase().indexOf(q) !== -1);
      }).slice(0, 8);
      if (espM.length) sezioni.push({ titolo: '🔬 Esperimenti', items: espM.map(function(e) {
        return { label: e.nome, sub: (e.descrizione || '').substring(0, 70) };
      }) });
    }
  } catch (e) {}

  // Diario interventi
  try {
    if (typeof loadDiario === 'function') {
      var diaM = loadDiario().filter(function(iv) {
        var tipoLabel = (typeof DIARIO_TIPI !== 'undefined' && DIARIO_TIPI[iv.tipo]) || iv.tipo || '';
        return (iv.note || '').toLowerCase().indexOf(q) !== -1 || tipoLabel.toLowerCase().indexOf(q) !== -1;
      }).slice(-8).reverse();
      if (diaM.length) sezioni.push({ titolo: '📔 Diario', items: diaM.map(function(iv) {
        var tipoLabel = (typeof DIARIO_TIPI !== 'undefined' && DIARIO_TIPI[iv.tipo]) || iv.tipo;
        return { label: tipoLabel, sub: (iv.note ? iv.note.substring(0, 60) + ' · ' : '') + (iv.data || '') };
      }) });
    }
  } catch (e) {}

  if (!sezioni.length) {
    resEl.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text3);font-size:12px;">Nessun risultato per "' + _rgEsc(q) + '".</div>';
    return;
  }

  resEl.innerHTML = sezioni.map(function(s) {
    return '<div style="margin-bottom:14px;">'
      + '<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">' + s.titolo + '</div>'
      + s.items.map(function(it) {
          return '<div style="background:var(--bg3);border-radius:8px;padding:8px 10px;margin-bottom:6px;">'
            + '<div style="font-size:13px;font-weight:600;color:var(--text);">' + _rgEsc(it.label) + '</div>'
            + (it.sub ? '<div style="font-size:11px;color:var(--text3);margin-top:2px;">' + _rgEsc(it.sub) + '</div>' : '')
            + '</div>';
        }).join('')
      + '</div>';
  }).join('');
}

/* Pulsante 🔄 header — aggiorna tutti i dati */
function refreshAll() {
  if (typeof cfgAggiornaTutto === 'function') { cfgAggiornaTutto(); setTimeout(renderVistaOggiUnificata, 1800); return; }
  // Fallback: ricarica i loader principali singolarmente
  try { if (typeof renderActivePlants === 'function') renderActivePlants(); } catch(e) {}
  try { if (typeof loadWeather === 'function') loadWeather(); } catch(e) {}
  try { if (typeof renderLunarSection === 'function') renderLunarSection(); } catch(e) {}
  try { if (typeof loadLunaConsigli6 === 'function') loadLunaConsigli6(); } catch(e) {}
  try { if (typeof labLoadAll === 'function') labLoadAll(); } catch(e) {}
  setTimeout(renderVistaOggiUnificata, 1800);
}

/* Pulsante 🔔 header — apre le notifiche (sezione Impostazioni) */
function showNotifPanel() {
  var navBtn = document.querySelector('.nav-item[onclick*="impostazioni"]');
  showSection('impostazioni', navBtn || null);
  try { if (typeof initImpostazioni === 'function') setTimeout(initImpostazioni, 50); } catch(e) {}
  // Scrolla al gruppo notifiche Telegram se presente
  setTimeout(function() {
    var lbl = Array.prototype.find.call(
      document.querySelectorAll('.setting-group-label'),
      function(el){ return /Notifiche/i.test(el.textContent || ''); }
    );
    if (lbl && lbl.scrollIntoView) lbl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

/* ══════════════════════════════════════════════════════════════
   INIT APP
══════════════════════════════════════════════════════════════ */
window._appInitialized = false;
window.initApp = function() {
  // 1. Piante
  try { if (typeof initPiante === 'function') initPiante(); } catch(e) { console.error('[BioSerra] initPiante:', e); }
  // 2. Elettrocultura
  try { if (typeof initElettrocultura === 'function') initElettrocultura(); } catch(e) { console.error('[BioSerra] initElettrocultura:', e); }
  // 3. Calendario bio
  try { if (typeof renderBioCalendar === 'function') renderBioCalendar(); } catch(e) { console.error('[BioSerra] renderBioCalendar:', e); }
  // 4. JSON loaders (meteo, luna, AI, piante stato)
  try { if (typeof initJsonLoaders === 'function') initJsonLoaders(); } catch(e) { console.error('[BioSerra] initJsonLoaders:', e); }
  // 5. Tema salvato
  try {
    var tema = localStorage.getItem('bioserra_tema');
    if (tema && typeof cfgApplyThemeCSS === 'function') cfgApplyThemeCSS(tema);
  } catch(e) {}
  // 6. Notifiche panel
  try { if (typeof applyNotificheAtBoot === 'function') setTimeout(applyNotificheAtBoot, 100); } catch(e) {}
  // 7. Vista di oggi unificata (18) — ritardata per dare tempo ai fetch async (meteo, brain, ecc.)
  try { setTimeout(renderVistaOggiUnificata, 2200); } catch(e) {}
};


