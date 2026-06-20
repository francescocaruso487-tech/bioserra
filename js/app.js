/* BioSerra - js/app.js - Migrazione automatica */
<script>
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

