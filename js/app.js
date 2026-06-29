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
  // piante: renderActivePlants è gestita da navigateTo, non richiamarla di nuovo qui
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
/* Pulsante 🔄 header — aggiorna tutti i dati */
function refreshAll() {
  if (typeof cfgAggiornaTutto === 'function') { cfgAggiornaTutto(); return; }
  // Fallback: ricarica i loader principali singolarmente
  try { if (typeof renderActivePlants === 'function') renderActivePlants(); } catch(e) {}
  try { if (typeof loadWeather === 'function') loadWeather(); } catch(e) {}
  try { if (typeof renderLunarSection === 'function') renderLunarSection(); } catch(e) {}
  try { if (typeof loadLunaConsigli6 === 'function') loadLunaConsigli6(); } catch(e) {}
  try { if (typeof labLoadAll === 'function') labLoadAll(); } catch(e) {}
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
};


