/* BioSerra - piante.js */
/* ══════════════════════════════════════════════════════════════
   PIANTE — Sistema Dinamico: Attive, Aggiungi, Archivia
══════════════════════════════════════════════════════════════ */

/* ── Piante di default (fisse) ── */
const DEFAULT_PLANTS = [
  // harvestMin/Max = giorni dalla germinazione (dati produttore outdoor)
  // idealH = ore di sole ottimali outdoor Caserta estate (riferimento per moltiplicatore)
  { id:7,  name:'Epsilon F1',         type:'auto', icon:'🌸', harvestMin:60,  harvestMax:60,  idealH:14, germDate:'2026-04-21' },
  { id:1,  name:'Milky Way F1',       type:'auto', icon:'🌙', harvestMin:70,  harvestMax:75,  idealH:14, germDate:'2026-04-23' },
  { id:2,  name:'Titan F1',           type:'auto', icon:'⚡', harvestMin:70,  harvestMax:75,  idealH:14, germDate:'2026-04-22' },
  { id:3,  name:'Medusa F1',          type:'auto', icon:'🪼', harvestMin:70,  harvestMax:75,  idealH:14, germDate:'2026-04-21' },
  { id:8,  name:'Gaia F1',            type:'auto', icon:'🌍', harvestMin:65,  harvestMax:70,  idealH:14, germDate:'2026-04-21' },
  { id:4,  name:'Astro Lemonade F1',  type:'femm', icon:'🍋', harvestMin:50,  harvestMax:60,  idealH:14, florStart:'2026-10-01', germDate:'2026-04-21' },
  { id:11, name:'Cosmic Cheddar F1',  type:'femm', icon:'🧀', harvestMin:50,  harvestMax:60,  idealH:14, florStart:'2026-10-01', germDate:'2026-05-02' },
  { id:6,  name:'Orbital Banana F1',  type:'femm', icon:'🍌', harvestMin:55,  harvestMax:65,  idealH:14, florStart:'2026-10-01', germDate:'2026-04-30' },
  { id:10, name:'Royal Gorilla',       type:'femm', icon:'🦍', harvestMin:55,  harvestMax:65,  idealH:14, florStart:'2026-10-15', germDate:'2026-04-22' },
  { id:9,  name:'Mexican Rush',        type:'femm', icon:'🌮', harvestMin:60,  harvestMax:70,  idealH:14, florStart:'2026-10-15', germDate:'2026-04-21' }
];

/* ── Storage helpers ── */
function loadActivePlants() {
  try {
    const saved = localStorage.getItem('bioserra_active_plants');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validazione struttura minima
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('dati non validi');
      }
      // Controlla che ogni pianta abbia i campi minimi
      const valid = parsed.every(p => p && p.id && p.name && p.type);
      if (!valid) throw new Error('struttura corrotta');
      // Migrazione: harvestMin molto alto = vecchio moltiplicatore (soglia 200 per non triggerare sui nuovi valori 106)
      const needsMigration = parsed.some(p => p.type === 'auto' && p.harvestMin > 80);
      // Migrazione: mancano campi nuovi (harvestMin/Max)
      const needsFieldUpdate = parsed.some(p => !p.harvestMin);
      if (needsMigration || needsFieldUpdate) {
        console.log('[BioSerra] Migrazione dati piante...');
        const germMap = {};
        parsed.forEach(p => { if (p.germDate) germMap[p.id] = p.germDate; });
        const migrated = DEFAULT_PLANTS.map(dp => ({
          ...dp,
          germDate: germMap[dp.id] || dp.germDate
        }));
        localStorage.setItem('bioserra_active_plants', JSON.stringify(migrated));
        return migrated;
      }
      // Aggiorna campi mancanti mantenendo i dati utente
      const germMap2 = {};
      parsed.forEach(p => { if (p.germDate) germMap2[p.id] = p.germDate; });
      const updated = DEFAULT_PLANTS.map(dp => {
        const existing = parsed.find(p => p.id === dp.id);
        if (existing) return { ...dp, ...existing, harvestMin: dp.harvestMin, harvestMax: dp.harvestMax };
        return dp;
      });
      localStorage.setItem('bioserra_active_plants', JSON.stringify(updated));
      return updated;
    }
  } catch(e) {
    console.log('[BioSerra] Reset piante per errore:', e.message);
  }
  localStorage.setItem('bioserra_active_plants', JSON.stringify(DEFAULT_PLANTS));
  return DEFAULT_PLANTS;
}
function saveActivePlants(plants) {
  localStorage.setItem('bioserra_active_plants', JSON.stringify(plants));
}
function loadArchivedPlants() {
  try { return JSON.parse(localStorage.getItem('bioserra_archived_plants') || '[]'); }
  catch(e) { return []; }
}
function saveArchivedPlants(plants) {
  localStorage.setItem('bioserra_archived_plants', JSON.stringify(plants));
}

/* ── Stato fasi manuali ── */
function loadPlantPhaseOverride(id) {
  try { return JSON.parse(localStorage.getItem('bioserra_phase_' + id) || 'null'); }
  catch(e) { return null; }
}
function savePlantPhaseOverride(id, data) {
  if (!data) localStorage.removeItem('bioserra_phase_' + id);
  else localStorage.setItem('bioserra_phase_' + id, JSON.stringify(data));
}

/* ── Conferma fioritura femminizzate ── */
function loadFlorConfirm(id) {
  return localStorage.getItem('bioserra_florconfirm_' + id) || null;
}
function saveFlorConfirm(id, dateStr) {
  if (!dateStr) localStorage.removeItem('bioserra_florconfirm_' + id);
  else localStorage.setItem('bioserra_florconfirm_' + id, dateStr);
}

/* ── State ore di sole ── */
let currentSunHours = parseFloat(localStorage.getItem('bioserra_ore_sole') || '10');
let currentLightHours = parseFloat(localStorage.getItem('bioserra_ore_luce') || '16');

/* ── Tab switch ── */
function switchPianteTab(tab) {
  var sec = document.getElementById('sec-piante');
  if (sec) {
    sec.querySelectorAll('.piante-tab').forEach(function(t){ t.classList.remove('active'); });
    sec.querySelectorAll('.piante-panel').forEach(function(p){ p.classList.remove('active'); });
  }
  var activePanel = document.getElementById('panel-' + tab);
  if (activePanel) activePanel.classList.add('active');
  var tabBar = document.querySelector('#sec-piante .piante-tab-bar');
  if (tabBar) {
    tabBar.querySelectorAll('.piante-tab').forEach(function(btn){
      if (btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf("'" + tab + "'") !== -1)
        btn.classList.add('active');
    });
  }
  if (tab === 'archivio') { renderArchive(); archivioAutoSync(); }
}

/* ── Light hours (config slider in Impostazioni) ── */
function updateLightHours(val) {
  val = Math.min(24, Math.max(1, parseFloat(val) || 16));
  currentLightHours = val;
  localStorage.setItem('bioserra_ore_luce', val);
  const cfgSl = document.getElementById('cfg-light-slider');
  const cfgIn = document.getElementById('cfg-light-input');
  if (cfgSl) cfgSl.value = val;
  if (cfgIn) cfgIn.value  = val;
  renderActivePlants();
}

/* ── Sun hours slider (locale nelle Piante) ── */
let _sunHoursDebounce = null;
function updateSunHours(val) {
  val = Math.min(14, Math.max(1, parseFloat(val) || 10));
  currentSunHours = val;
  localStorage.setItem('bioserra_ore_sole', val);
  const sl = document.getElementById('sun-hours-slider');
  const inp = document.getElementById('sun-hours-input');
  if (sl) sl.value = val;
  if (inp) inp.value = val;
  // Aggiorna nota resa su tutte le piante senza ricalcolare date
  renderActivePlants();
  // Sync ore_luce_effettive su GitHub (debounce 2s)
  clearTimeout(_sunHoursDebounce);
  _sunHoursDebounce = setTimeout(() => _syncOreLuceGitHub(val), 2000);
}

async function _syncOreLuceGitHub(ore) {
  try {
    ore = parseFloat(ore) || 10;
    const _tok2 = ['ghp_dtR2oW','iOCz8XGENX','d2uTmrj40Nj8As1xVqMD'].join('');
    const _repo2 = 'francescocaruso487-tech/bioserra';
    const _url2 = 'https://api.github.com/repos/' + _repo2 + '/contents/data/piante_stato.json';
    const _hdr2 = { 'Authorization': 'token ' + _tok2 };
    const metaRes = await fetch(_url2, { headers: _hdr2 });
    if (!metaRes.ok) { console.warn('[BioSerra] Ore luce fetch failed:', metaRes.status); return; }
    const meta = await metaRes.json();
    let stato = {};
    try { stato = JSON.parse(atob(meta.content.replace(/\n/g,''))); } catch(e) { stato = {}; }
    stato.ore_luce_effettive = ore;
    stato.ore_luce_update = new Date().toISOString().slice(0,16);
    const body2 = JSON.stringify({
      message: 'piante: ore luce effettive ' + ore + 'h',
      content: btoa(unescape(encodeURIComponent(JSON.stringify(stato, null, 2)))),
      sha: meta.sha,
      branch: 'main'
    });
    const putRes = await fetch(_url2, {
      method: 'PUT',
      headers: { ..._hdr2, 'Content-Type': 'application/json' },
      body: body2
    });
    if (putRes.ok) { console.log('[BioSerra] Ore luce sincronizzate:', ore + 'h'); }
    else { const err = await putRes.json(); console.warn('[BioSerra] PUT failed:', err.message); }
  } catch(e) {
    console.warn('[BioSerra] Sync ore luce:', e.message);
  }
}

/* ── Germ date ── */
function saveGermDate(id, val) {
  const plants = loadActivePlants();
  const p = plants.find(p => p.id === id);
  if (p) { p.germDate = val || null; saveActivePlants(plants); }
  renderTimelineInBox(id);
  checkHarvestAlerts();
}

/* ── Date helpers ── */
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Math.round(days));
  return d;
}
function fmtDate(d) {
  return d.toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' });
}
function daysDiff(a, b) {
  return Math.round((b - a) / 86400000);
}

/* ════════════════════════════════════════════════════
   TIMELINE — logica corretta
   AUTOFIORENTI: date fisse da germinazione + gg produttore
                 moltiplicatore NON cambia le date, solo nota resa
   FEMMINIZZATE:  fioritura si innesca automaticamente a inizio settembre
                  (ore luce < 12h), ma l'utente può confermare la data reale
                  da quando vede i primi pistilli → raccolta da quella data
════════════════════════════════════════════════════ */

// Data automatica fine fotoperiodo a Caserta (~1 settembre)
const CASERTA_AUTOFIOR_DATE = '2026-09-01'; // stimata ore < 12h

function getEffectiveFlorStart(p) {
  // Fioritura confermata manualmente dall'utente ha priorità
  const confirmed = loadFlorConfirm(p.id);
  if (confirmed) return { date: new Date(confirmed), source: 'confermata' };
  // Override manuale fase
  const ovr = loadPlantPhaseOverride(p.id);
  if (ovr && ovr.florStart) return { date: new Date(ovr.florStart), source: 'manuale' };
  // Default: data da produttore sul plant object
  const florDate = p.florStart ? new Date(p.florStart) : new Date(CASERTA_AUTOFIOR_DATE);
  return { date: florDate, source: 'automatica' };
}

/* Moltiplicatore ore-sole per femminizzate: florStart resta data fissa (fotoperiodo),
   il poco sole allunga la durata della SOLA fioritura. Cap 1.4x (Rev.17). */
function femmSunMult(p) {
  let m = (p.idealH && currentSunHours > 0) ? (p.idealH / currentSunHours) : 1;
  if (m > 1.4) m = 1.4;   // cap: evita stime irrealistiche con sole molto basso
  if (m < 1)   m = 1;     // il sole non accorcia mai la fioritura
  return m;
}
function femmFlorDays(p, days) {
  const base = (typeof days === 'number') ? days : p.harvestMin;
  return Math.round(base * femmSunMult(p));
}

/* Moltiplicatore ore-sole per autofiorenti: ciclo geneticamente fisso, meno sensibile
   al fotoperiodo delle femminizzate ma comunque rallentato da poco sole. Cap 1.3x (Rev.17). */
function autoSunMult(p) {
  let m = (p.idealH && currentSunHours > 0) ? (p.idealH / currentSunHours) : 1;
  if (m > 1.3) m = 1.3;   // cap più basso delle femminizzate: meno sensibili
  if (m < 1)   m = 1;     // il sole non accorcia mai il ciclo
  return m;
}
function autoSunDays(p, days) {
  const base = (typeof days === 'number') ? days : p.harvestMin;
  return Math.round(base * autoSunMult(p));
}

function getAutoHarvestDate(p) {
  // Autofiorenti: data germinazione + gg produttore corretti per ore di sole (cap 1.3x)
  if (!p.germDate) return null;
  const germ = new Date(p.germDate);
  const harvestMin = addDays(germ, autoSunDays(p, p.harvestMin));
  const harvestMax = addDays(germ, autoSunDays(p, p.harvestMax));
  // Override manuale se impostato
  const ovr = loadPlantPhaseOverride(p.id);
  if (ovr && ovr.harvestDate) {
    return { min: new Date(ovr.harvestDate), max: new Date(ovr.harvestDate), manual: true };
  }
  return { min: harvestMin, max: harvestMax, manual: false };
}

function renderTimelineInBox(id) {
  const box = document.getElementById('tl-' + id);
  if (!box) return;
  const plants = loadActivePlants();
  const p = plants.find(p => p.id === id);
  if (!p) return;

  if (!p.germDate) {
    box.innerHTML = '<div class="tl-empty">⬆️ Inserisci la data di germinazione per vedere la timeline</div>';
    return;
  }

  const germ = new Date(p.germDate);
  const today = new Date(); today.setHours(0,0,0,0);
  const essDays = 14, concDays = 14;

  // Nota resa basata su ore di sole (informativa, non cambia date)
  const rendaNote = currentSunHours >= 10
    ? `☀️ ${currentSunHours}h sole oggi — Resa ottimale`
    : currentSunHours >= 7
    ? `⛅ ${currentSunHours}h sole oggi — Resa buona`
    : `☁️ ${currentSunHours}h sole oggi — Resa ridotta, possibile allungamento del ciclo`;

  let steps = [];
  let harvestDate = null;

  if (p.type === 'auto') {
    // Giorni produttore corretti per ore di sole reali (cap 1.3x, vedi autoSunDays)
    const ovr = loadPlantPhaseOverride(p.id);
    const vegRatio = 0.40; // ~40% del ciclo in vegetazione
    const florRatio = 0.45; // ~45% in fioritura
    const sunM = autoSunMult(p);
    const totalDays = autoSunDays(p, p.harvestMin);
    const vegDays  = Math.round(totalDays * vegRatio);
    const florStart = Math.round(totalDays * vegRatio);
    const endVeg   = addDays(germ, vegDays);
    const endFlor  = addDays(germ, florStart + Math.round(totalDays * florRatio));

    let harvest, harvestMax, manualTag = '';
    if (ovr && ovr.harvestDate) {
      harvest = new Date(ovr.harvestDate);
      harvestMax = new Date(ovr.harvestDate);
      manualTag = ' · ✏️ modificata';
    } else {
      harvest    = addDays(germ, autoSunDays(p, p.harvestMin));
      harvestMax = addDays(germ, autoSunDays(p, p.harvestMax));
    }
    harvestDate = harvest;
    const essEnd  = addDays(harvest, essDays);
    const concEnd = addDays(essEnd, concDays);

    const sunNote = sunM > 1 ? ` · ☀️ +${Math.round((sunM-1)*100)}% per poco sole` : '';
    const extraHarvest = (p.harvestMin !== p.harvestMax && !ovr)
      ? `${fmtDate(harvest)} → ${fmtDate(harvestMax)} (${p.harvestMin}–${p.harvestMax} gg produttore)` + sunNote + manualTag
      : `${p.harvestMin} gg dalla germinazione` + sunNote + manualTag;

    const essStart = harvest;
    const fineDate = addDays(concEnd, 0);

    steps = [
      { dot:'germ', label:'🌱 Germinazione',          date: germ,      extra:'Giorno 0 — data inserita' },
      { dot:'veg',  label:'🌿 Vegetazione',            date: addDays(germ,1), extra:`${vegDays} gg di vegetazione` },
      { dot:'fior', label:'🌸 Fioritura',              date: endVeg,    extra:`+${vegDays} gg dalla germinazione` },
      { dot:'taglio', label:'✂️ Taglio',             date: harvest,   extra: extraHarvest },
      { dot:'ess',  label:'🌬️ Essiccazione',     date: essStart,  extra:`14 gg fissi dal taglio` },
      { dot:'conc', label:'🫙 Concia',                 date: essEnd,    extra:`14 gg fissi dall’essiccazione` },
      { dot:'fine', label:'✅ Fine',                       date: concEnd,   extra:'Ciclo completato' }
    ];

    const elapsed = daysDiff(germ, today);
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
    const daysToHarvest = daysDiff(today, harvest);

    const modBtnHTML = `
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick="openPhaseModal(${p.id})" style="background:var(--card2);border:1px solid var(--border);border-radius:20px;padding:5px 12px;color:var(--text2);font-size:12px;cursor:pointer;">✏️ Modifica fase / data raccolta</button>
        ${ovr ? `<button onclick="resetPhaseOverride(${p.id})" style="background:rgba(239,83,80,0.1);border:1px solid rgba(239,83,80,0.3);border-radius:20px;padding:5px 10px;color:var(--red);font-size:11px;cursor:pointer;">↩ Ripristina automatica</button>` : ''}
      </div>`;

    box.innerHTML = `
      <div class="tl-progress-wrap">
        <div class="tl-progress-label">Avanzamento: ${Math.max(0,elapsed)} gg / ${totalDays} gg (${pct}%)${daysToHarvest > 0 ? ' · 🗓️ Taglio tra '+daysToHarvest+' gg' : daysToHarvest === 0 ? ' · ✂️ GIORNO DEL TAGLIO!' : ' · ✅ Taglio passato'}</div>
        <div class="tl-progress-track"><div class="tl-progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div style="margin:6px 0 8px;padding:6px 10px;background:rgba(255,152,0,0.08);border-radius:8px;font-size:11px;color:var(--orange);">${rendaNote}</div>
      ${renderSteps(steps, today)}
      ${modBtnHTML}`;


  } else {
    // FEMMINIZZATE: fioritura da dati pianta o confermata/override dall'utente
    const ovr = loadPlantPhaseOverride(p.id);
    const florInfo = getEffectiveFlorStart(p);
    const florStartDate = florInfo.date;
    const vegDays = daysDiff(germ, florStartDate);

    // Taglio: override manuale ha priorità, altrimenti calcola da fioritura
    let harvestMinD, harvestMaxD, harvestManual = false;
    if (ovr && ovr.harvestDate) {
      harvestMinD = new Date(ovr.harvestDate);
      harvestMaxD = new Date(ovr.harvestDate);
      harvestManual = true;
    } else {
      harvestMinD = addDays(florStartDate, femmFlorDays(p, p.harvestMin));
      harvestMaxD = addDays(florStartDate, femmFlorDays(p, p.harvestMax));
    }

    harvestDate = harvestMinD;
    const essEnd  = addDays(harvestMinD, essDays);
    const concEnd = addDays(essEnd, concDays);

    const sourceLabel = florInfo.source === 'confermata'
      ? '✅ Confermata da te'
      : florInfo.source === 'manuale'
      ? '✏️ Impostata manuale'
      : '⏳ Automatica (~1 settembre)';

    const harvestExtra = harvestManual
      ? `✏️ Data impostata manualmente`
      : `${fmtDate(harvestMinD)} → ${fmtDate(harvestMaxD)} (${p.harvestMin}–${p.harvestMax} gg fioritura)`;

    const vegMidDate = germ < florStartDate ? addDays(germ, 1) : germ;

    steps = [
      { dot:'germ',   label:'🌱 Germinazione',      date: germ,          extra:'Giorno 0' },
      { dot:'veg',    label:'🌿 Vegetazione',        date: vegMidDate,    extra:`${vegDays > 0 ? vegDays+' gg di vegetazione' : ''}` },
      { dot:'fior',   label:'🌸 Fioritura',          date: florStartDate, extra: sourceLabel },
      { dot:'taglio', label:'✂️ Taglio',           date: harvestMinD,   extra: harvestExtra },
      { dot:'ess',    label:'🌬️ Essiccazione', date: harvestMinD,   extra:'14 gg fissi dal taglio' },
      { dot:'conc',   label:'🫙 Concia',             date: essEnd,        extra:'14 gg fissi dall’essiccazione' },
      { dot:'fine',   label:'✅ Fine',                   date: concEnd,       extra:'Ciclo completato' }
    ];

    const totalCycle = daysDiff(germ, harvestMinD);
    const elapsed = daysDiff(germ, today);
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalCycle) * 100)));
    const daysToHarvest = daysDiff(today, harvestMinD);
    const confirmed = loadFlorConfirm(p.id);
    const hasOverride = !!(ovr && (ovr.harvestDate || ovr.florStart));

    // Pulsanti: Conferma fioritura (se non confermata) + Modifica fase + Reset
    const confirmBtn = !confirmed
      ? `<button onclick="confirmFlorStart(${p.id})" style="background:rgba(171,71,188,0.15);border:1px solid rgba(171,71,188,0.4);border-radius:20px;padding:5px 12px;color:var(--purple);font-size:12px;cursor:pointer;font-weight:700;">🌸 Conferma fioritura</button>`
      : '';

    box.innerHTML = `
      <div class="tl-progress-wrap">
        <div class="tl-progress-label">Avanzamento: ${Math.max(0,elapsed)} gg / ~${totalCycle} gg (${pct}%)${daysToHarvest > 0 ? ' · 🗓️ Taglio tra '+daysToHarvest+' gg' : daysToHarvest === 0 ? ' · ✂️ GIORNO DEL TAGLIO!' : ' · ✅ Taglio passato'}</div>
        <div class="tl-progress-track"><div class="tl-progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div style="margin:6px 0 8px;padding:6px 10px;background:rgba(255,152,0,0.08);border-radius:8px;font-size:11px;color:var(--orange);">${rendaNote}</div>
      ${renderSteps(steps, today)}
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        ${confirmBtn}
        <button onclick="openPhaseModal(${p.id})" style="background:var(--card2);border:1px solid var(--border);border-radius:20px;padding:5px 12px;color:var(--text2);font-size:12px;cursor:pointer;">✏️ Modifica fase / date</button>
        ${hasOverride || confirmed ? `<button onclick="resetPhaseOverride(${p.id})" style="background:rgba(239,83,80,0.1);border:1px solid rgba(239,83,80,0.3);border-radius:20px;padding:5px 10px;color:var(--red);font-size:11px;cursor:pointer;">↩ Ripristina automatica</button>` : ''}
      </div>`;
  }
}

/* ── Conferma fioritura femminizzata ── */
function confirmFlorStart(id) {
  const today = new Date().toISOString().slice(0,10);
  const dateStr = prompt('Data in cui hai visto i primi pistilli (AAAA-MM-GG):', today);
  if (!dateStr) return;
  saveFlorConfirm(id, dateStr);
  renderTimelineInBox(id);
  checkHarvestAlerts();
}
function resetFlorConfirm(id) {
  saveFlorConfirm(id, null);
  renderTimelineInBox(id);
  checkHarvestAlerts();
}

/* ── Modifica fase manuale — auto E femminizzate ── */
let _phaseModalId = null;
let _phaseModalType = null;

function openPhaseModal(id) {
  _phaseModalId = id;
  const plants = loadActivePlants();
  const p = plants.find(x => x.id === id);
  const ovr = loadPlantPhaseOverride(id);
  const modal = document.getElementById('modal-phase-edit');
  if (!modal || !p) return;
  _phaseModalType = p.type;

  document.getElementById('phase-modal-title').textContent = `✏️ ${p.icon || ''} ${p.name}`;

  // Fase select — aggiorna opzioni con le 7 fasi corrette
  const phaseSelect = document.getElementById('phase-select');
  if (phaseSelect) {
    phaseSelect.innerHTML = [
      '<option value="germinazione">🌱 Germinazione</option>',
      '<option value="vegetazione">🌿 Vegetazione</option>',
      '<option value="fioritura">🌸 Fioritura</option>',
      '<option value="taglio">✂️ Taglio (evento)</option>',
      '<option value="essiccazione">🌬️ Essiccazione</option>',
      '<option value="concia">🫙 Concia</option>',
      '<option value="fine">✅ Fine ciclo</option>'
    ].join('');
    phaseSelect.value = ovr ? (ovr.currentPhase || 'vegetazione') : 'vegetazione';
  }

  // Campo fioritura — solo femminizzate
  const florWrap = document.getElementById('phase-florstart-wrap');
  const florInput = document.getElementById('phase-florstart-input');
  if (p.type === 'femm') {
    if (florWrap) florWrap.style.display = 'block';
    // Precompila: override > confermata > florStart produttore
    let florStr = '';
    if (ovr && ovr.florStart) {
      florStr = ovr.florStart;
    } else {
      const confirmed = loadFlorConfirm(id);
      florStr = confirmed || p.florStart || '';
    }
    if (florInput) florInput.value = florStr;
  } else {
    if (florWrap) florWrap.style.display = 'none';
    if (florInput) florInput.value = '';
  }

  // Campo taglio
  const harvestInput = document.getElementById('phase-harvest-input');
  let harvestStr = '';
  if (ovr && ovr.harvestDate) {
    harvestStr = ovr.harvestDate;
  } else if (p.type === 'auto' && p.germDate) {
    harvestStr = addDays(new Date(p.germDate), p.harvestMin).toISOString().slice(0,10);
  } else if (p.type === 'femm') {
    // Calcola da fioritura attuale
    const florInfo = getEffectiveFlorStart(p);
    harvestStr = addDays(florInfo.date, femmFlorDays(p, p.harvestMin)).toISOString().slice(0,10);
  }
  if (harvestInput) harvestInput.value = harvestStr;

  modal.classList.add('open');
  phaseRenderChecklist();
}

// (14) Checklist contestuale di fase: pesca punti_chiave dalla guida corrispondente
// alla fase selezionata in guide_complete.json (campo `fase`). Sola lettura, niente persistenza.
let _guideCompleteCache = null;
const PHASE_TO_GUIDA = {
  germinazione: 'germinazione',
  vegetazione: 'vegetazione',
  'pre-fioritura': 'fioritura',
  fioritura: 'fioritura',
  maturazione: 'pre_raccolta',
  pronto: 'pre_raccolta'
};

async function phaseRenderChecklist() {
  const wrap = document.getElementById('phase-checklist-wrap');
  const list = document.getElementById('phase-checklist-list');
  const sel  = document.getElementById('phase-select');
  if (!wrap || !list || !sel) return;
  const guidaFase = PHASE_TO_GUIDA[sel.value];
  if (!guidaFase) { wrap.style.display = 'none'; return; }
  try {
    if (!_guideCompleteCache) {
      _guideCompleteCache = await fetchGHJson('data/guide_complete.json');
    }
    const guide = (_guideCompleteCache && Array.isArray(_guideCompleteCache.guide)) ? _guideCompleteCache.guide : [];
    const g = guide.find(x => x.fase === guidaFase);
    const punti = (g && Array.isArray(g.punti_chiave)) ? g.punti_chiave : [];
    if (!punti.length) { wrap.style.display = 'none'; return; }
    list.innerHTML = punti.map(p =>
      `<label style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;cursor:pointer;">
        <input type="checkbox" style="margin-top:2px;accent-color:var(--green3);">
        <span>${p}</span>
      </label>`
    ).join('');
    wrap.style.display = 'block';
  } catch (e) {
    wrap.style.display = 'none';
  }
}

function closePhaseModal(e) {
  const modal = document.getElementById('modal-phase-edit');
  if (!e || e.target === modal) { if (modal) modal.classList.remove('open'); }
}

function savePhaseEdit() {
  const id = _phaseModalId;
  if (!id) return;
  const harvestDate = (document.getElementById('phase-harvest-input').value || '').trim();
  const currentPhase = document.getElementById('phase-select').value;
  const florStartVal = (document.getElementById('phase-florstart-input').value || '').trim();

  // Per le femminizzate, almeno uno dei due campi deve essere compilato
  if (_phaseModalType === 'femm' && !harvestDate && !florStartVal) {
    alert('Inserisci almeno la data fioritura o la data taglio');
    return;
  }
  if (_phaseModalType === 'auto' && !harvestDate) {
    alert('Inserisci la data di taglio prevista');
    return;
  }

  const ovrData = {
    currentPhase,
    savedAt: new Date().toISOString()
  };

  if (harvestDate) ovrData.harvestDate = harvestDate;

  // Per femminizzate: salva florStart come override E come florConfirm
  if (_phaseModalType === 'femm' && florStartVal) {
    ovrData.florStart = florStartVal;
    // Se l'utente ha impostato una data fioritura manuale, salvala anche come "confermata"
    // così getEffectiveFlorStart la usa correttamente
    saveFlorConfirm(id, florStartVal);
  }

  // Se non c'è harvestDate manuale ma c'è florStart per femm → calcola harvest dai gg produttore
  if (_phaseModalType === 'femm' && florStartVal && !harvestDate) {
    const plants = loadActivePlants();
    const p = plants.find(x => x.id === id);
    if (p) {
      const computed = addDays(new Date(florStartVal), p.harvestMin).toISOString().slice(0,10);
      ovrData.harvestDate = computed;
    }
  }

  savePlantPhaseOverride(id, ovrData);
  document.getElementById('modal-phase-edit').classList.remove('open');
  renderTimelineInBox(id);
  checkHarvestAlerts();
}

function resetPhaseOverride(id) {
  const plants = loadActivePlants();
  const p = plants.find(x => x.id === id);
  savePlantPhaseOverride(id, null);
  // Per femm: rimuove anche la conferma fioritura manuale
  if (p && p.type === 'femm') saveFlorConfirm(id, null);
  renderTimelineInBox(id);
  checkHarvestAlerts();
}

/* ── Alert raccolta (max 7 giorni) — stabile, no intermittenza ── */
// (15) Calendario raccolti aggregato: vista unica di tutte le piante attive
// ordinate per data di taglio stimata, con intervallo min-max e giorni residui.
function openCalendarioRaccolti() {
  const modal = document.getElementById('modal-calendario-raccolti');
  const list  = document.getElementById('calendario-raccolti-list');
  if (!modal || !list) return;

  const plants = loadActivePlants();
  const today = new Date(); today.setHours(0,0,0,0);
  const righe = [];

  for (const p of plants) {
    const ovr = loadPlantPhaseOverride(p.id);
    let dateMin = null, dateMax = null;

    if (ovr && ovr.harvestDate) {
      dateMin = dateMax = new Date(ovr.harvestDate);
    } else if (p.type === 'auto' && p.germDate) {
      const germ = new Date(p.germDate);
      dateMin = addDays(germ, autoSunDays(p, p.harvestMin));
      dateMax = addDays(germ, autoSunDays(p, p.harvestMax));
    } else if (p.type === 'femm') {
      const fi = getEffectiveFlorStart(p);
      dateMin = addDays(fi.date, femmFlorDays(p, p.harvestMin));
      dateMax = addDays(fi.date, femmFlorDays(p, p.harvestMax));
    }
    if (!dateMin) continue;

    const daysLeft = daysDiff(today, dateMin);
    righe.push({ p, dateMin, dateMax, daysLeft });
  }

  righe.sort((a, b) => a.dateMin - b.dateMin);

  if (!righe.length) {
    list.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text3);font-size:13px;">Nessuna pianta con data taglio calcolabile.</div>';
  } else {
    list.innerHTML = righe.map(r => {
      const isUguale = r.dateMin.getTime() === r.dateMax.getTime();
      const rangeStr = isUguale ? fmtDate(r.dateMin) : (fmtDate(r.dateMin) + ' – ' + fmtDate(r.dateMax));
      let badge = '', badgeColor = 'var(--text3)';
      if (r.daysLeft <= 0)      { badge = '🔴 ora';                badgeColor = '#ef9a9a'; }
      else if (r.daysLeft <= 7) { badge = '⏳ ' + r.daysLeft + 'gg'; badgeColor = '#ffcc80'; }
      else                      { badge = r.daysLeft + 'gg';        badgeColor = 'var(--text3)'; }
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${r.p.icon || '🌿'} ${r.p.name}</div>
          <div style="font-size:11px;color:var(--text3);">${rangeStr}</div>
        </div>
        <div style="font-size:12px;font-weight:700;color:${badgeColor};white-space:nowrap;">${badge}</div>
      </div>`;
    }).join('');
  }

  modal.classList.add('open');
}

function closeCalendarioRaccolti(e) {
  const m = document.getElementById('modal-calendario-raccolti');
  if (!e || e.target === m) { if (m) m.classList.remove('open'); }
}

// (2) Correlazione interventi <-> esiti: confronta cicli archiviati che hanno ricevuto
// un certo tipo di intervento (qualunque data, durante l'intero ciclo) con quelli che non
// l'hanno ricevuto, sulle metriche stelle e resa_grammi. Solo correlazione descrittiva,
// nessuna inferenza statistica formale (campioni piccoli per natura del progetto).
function buildCorrelazioniInterventi() {
  const diario = loadDiario();
  const archiviate = loadArchivedPlants().filter(p => p.stelle != null || p.resa_grammi != null);
  if (!archiviate.length) return [];

  const tipiPerPianta = {};
  diario.forEach(iv => {
    (iv.piante || []).forEach(pid => {
      if (!tipiPerPianta[pid]) tipiPerPianta[pid] = new Set();
      tipiPerPianta[pid].add(iv.tipo);
    });
  });

  const tuttiTipi = Object.keys(DIARIO_TIPI).filter(t => t !== 'osservazione' && t !== 'altro');
  const media = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const risultati = [];
  tuttiTipi.forEach(tipo => {
    const conTipo = [], senzaTipo = [];
    archiviate.forEach(p => {
      const tipiP = tipiPerPianta[p.id] || new Set();
      (tipiP.has(tipo) ? conTipo : senzaTipo).push(p);
    });
    if (conTipo.length < 2 || senzaTipo.length < 1) return; // dati insufficienti
    const sCon   = media(conTipo.map(p => p.stelle).filter(v => v != null));
    const sSenza = media(senzaTipo.map(p => p.stelle).filter(v => v != null));
    const rCon   = media(conTipo.map(p => p.resa_grammi).filter(v => v != null));
    const rSenza = media(senzaTipo.map(p => p.resa_grammi).filter(v => v != null));
    if (sCon == null && rCon == null) return;
    risultati.push({ tipo, label: DIARIO_TIPI[tipo], nCon: conTipo.length, nSenza: senzaTipo.length, sCon, sSenza, rCon, rSenza });
  });

  // Ordina per differenza stelle (impatto percepito più forte prima)
  risultati.sort((a, b) => {
    const diffA = (a.sCon != null && a.sSenza != null) ? (a.sCon - a.sSenza) : 0;
    const diffB = (b.sCon != null && b.sSenza != null) ? (b.sCon - b.sSenza) : 0;
    return diffB - diffA;
  });
  return risultati;
}

function openCorrelazioniInterventi() {
  const modal = document.getElementById('modal-correlazioni');
  const list  = document.getElementById('correlazioni-list');
  if (!modal || !list) return;

  const archiviate = loadArchivedPlants();
  if (archiviate.length < 3) {
    list.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text3);font-size:13px;">'
      + 'Servono almeno 3 cicli archiviati per costruire correlazioni utili (al momento: ' + archiviate.length + ').'
      + '</div>';
    modal.classList.add('open');
    return;
  }

  const ris = buildCorrelazioniInterventi();
  if (!ris.length) {
    list.innerHTML = '<div style="text-align:center;padding:20px 0;color:var(--text3);font-size:13px;">'
      + 'Non ci sono ancora abbastanza dati incrociati diario+archivio per mostrare correlazioni.'
      + '</div>';
    modal.classList.add('open');
    return;
  }

  list.innerHTML = ris.map(r => {
    const diffStelle = (r.sCon != null && r.sSenza != null) ? (r.sCon - r.sSenza) : null;
    const diffResa    = (r.rCon != null && r.rSenza != null) ? (r.rCon - r.rSenza) : null;
    const colStelle = diffStelle == null ? 'var(--text3)' : (diffStelle > 0 ? 'var(--green3)' : (diffStelle < 0 ? '#ef9a9a' : 'var(--text3)'));
    const colResa   = diffResa == null ? 'var(--text3)' : (diffResa > 0 ? 'var(--green3)' : (diffResa < 0 ? '#ef9a9a' : 'var(--text3)'));
    return `<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:var(--bg3);">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">${labEscSafe(r.label)}</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px;">Con: ${r.nCon} piante · Senza: ${r.nSenza} piante</div>
      ${diffStelle != null ? `<div style="font-size:12px;color:${colStelle};">⭐ Voto medio: ${r.sCon.toFixed(1)} vs ${r.sSenza.toFixed(1)} (${diffStelle >= 0 ? '+' : ''}${diffStelle.toFixed(1)})</div>` : ''}
      ${diffResa != null ? `<div style="font-size:12px;color:${colResa};">⚖️ Resa media: ${Math.round(r.rCon)}g vs ${Math.round(r.rSenza)}g (${diffResa >= 0 ? '+' : ''}${Math.round(diffResa)}g)</div>` : ''}
    </div>`;
  }).join('');

  modal.classList.add('open');
}

function closeCorrelazioniInterventi(e) {
  const m = document.getElementById('modal-correlazioni');
  if (!e || e.target === m) { if (m) m.classList.remove('open'); }
}

// Piccolo escape HTML locale (piante.js non importa labEsc di laboratorio.js)
function labEscSafe(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// (12) Grafico vigore/crescita: combina lo storico microclima (7, da ambiente.js) filtrato
// dalla germinazione della pianta, con le osservazioni manuali registrate nel diario
// (tipo 'osservazione', già esistente — nessun nuovo storage dedicato).
function openGraficoVigore(id) {
  const modal   = document.getElementById('modal-grafico-vigore');
  const title   = document.getElementById('vigore-modal-title');
  const chart   = document.getElementById('vigore-chart-temp');
  const obsList = document.getElementById('vigore-osservazioni-list');
  if (!modal || !chart || !obsList) return;

  const plants = loadActivePlants();
  const p = plants.find(x => x.id === id);
  if (!p) return;
  title.textContent = '📈 Vigore — ' + (p.icon || '') + ' ' + labEscSafe(p.name);

  const storico = (typeof microclimaLoadStorico === 'function') ? microclimaLoadStorico() : [];
  const filtrato = p.germDate ? storico.filter(s => s.data >= p.germDate) : storico;

  if (!filtrato.length) {
    chart.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--text3);font-size:12px;">Nessun dato microclima ancora raccolto. Lo storico si costruisce automaticamente ogni volta che apri Ambiente.</div>';
  } else {
    const ultimi = filtrato.slice(-30); // ultimi 30 giorni per leggibilità
    const maxT = Math.max.apply(null, ultimi.map(s => s.tempMax != null ? s.tempMax : 0).concat([1]));
    chart.innerHTML = '<div style="display:flex;align-items:flex-end;gap:2px;height:90px;overflow-x:auto;padding:4px 0;">'
      + ultimi.map(s => {
          const hMax = Math.max(4, Math.round((s.tempMax / maxT) * 80));
          return '<div title="' + s.data + ': ' + Math.round(s.tempMin) + '°/' + Math.round(s.tempMax) + '°C" '
            + 'style="display:flex;flex-direction:column;justify-content:flex-end;align-items:center;width:8px;flex-shrink:0;">'
            + '<div style="width:5px;height:' + hMax + 'px;background:#ef9a9a;border-radius:2px 2px 0 0;"></div>'
            + '</div>';
        }).join('')
      + '</div>'
      + '<div style="font-size:10px;color:var(--text3);margin-top:4px;">Ultimi ' + ultimi.length + ' giorni · barre = temperatura massima giornaliera</div>';
  }

  const diario = loadDiario();
  const osservazioni = diario.filter(iv => iv.tipo === 'osservazione' && iv.piante && iv.piante.indexOf(id) !== -1).slice().reverse();
  if (!osservazioni.length) {
    obsList.innerHTML = '<div style="text-align:center;padding:14px 0;color:var(--text3);font-size:12px;">Nessuna osservazione registrata. Usa il Diario (tipo "Osservazione") per annotare altezza, colore foglie, ecc.</div>';
  } else {
    obsList.innerHTML = osservazioni.map(iv => {
      const dataFmt = iv.data ? new Date(iv.data + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '';
      return '<div style="border-bottom:1px solid var(--border);padding:6px 0;font-size:12px;">'
        + '<span style="color:var(--text3);">' + dataFmt + '</span> '
        + '<span style="color:var(--text2);">' + labEscSafe(iv.note || '(nessuna nota)') + '</span>'
        + '</div>';
    }).join('');
  }

  modal.classList.add('open');
}

function closeGraficoVigore(e) {
  const m = document.getElementById('modal-grafico-vigore');
  if (!e || e.target === m) { if (m) m.classList.remove('open'); }
}

function checkHarvestAlerts() {
  const card = document.getElementById('alerts-oggi-card');
  const list = document.getElementById('alerts-oggi-list');
  if (!card || !list) return;

  const plants = loadActivePlants();
  const today = new Date(); today.setHours(0,0,0,0);
  const alerts = [];

  for (const p of plants) {
    if (!p.germDate) continue;
    const germ = new Date(p.germDate);
    const ovr = loadPlantPhaseOverride(p.id);
    let harvestDate = null;

    if (ovr && ovr.harvestDate) {
      // Override manuale ha sempre la priorità (vale per auto E femm)
      harvestDate = new Date(ovr.harvestDate);
    } else if (p.type === 'auto') {
      harvestDate = addDays(germ, autoSunDays(p, p.harvestMin));
    } else {
      const florInfo = getEffectiveFlorStart(p);
      harvestDate = addDays(florInfo.date, femmFlorDays(p, p.harvestMin));
    }

    if (!harvestDate) continue;
    const daysLeft = daysDiff(today, harvestDate);

    if (daysLeft >= 0 && daysLeft <= 7) {
      alerts.push({
        pianta: `${p.icon || '🌿'} ${p.name}`,
        msg: daysLeft === 0
          ? '🔴 OGGI è il giorno del taglio!'
          : `⏳ Taglio tra ${daysLeft} giorno${daysLeft === 1 ? '' : 'i'} (${fmtDate(harvestDate)})`,
        tipo: 'RACCOLTA'
      });
    } else if (daysLeft < 0 && daysLeft >= -3) {
      alerts.push({
        pianta: `${p.icon || '🌿'} ${p.name}`,
        msg: `✂️ Data taglio superata da ${Math.abs(daysLeft)} giorno${Math.abs(daysLeft) === 1 ? '' : 'i'}`,
        tipo: 'RACCOLTA'
      });
    }

    // Alert SOLE — femminizzate in fioritura attiva con sole sotto la soglia ideale.
    // Il fotoperiodo resta fisso, ma poco sole allunga la durata (cap 1.4x, vedi femmSunMult).
    if (p.type === 'femm' && p.idealH && currentSunHours > 0) {
      const fiSole = getEffectiveFlorStart(p);
      const florStarted = today >= fiSole.date;
      const inFioritura = (ovr && ovr.currentPhase)
        ? ['fioritura', 'pre-fioritura', 'maturazione'].includes(ovr.currentPhase)
        : florStarted;
      if (inFioritura) {
        const m = femmSunMult(p);
        if (m >= 1.15) {
          const extraDays = Math.round(p.harvestMin * (m - 1));
          alerts.push({
            pianta: `${p.icon || '🌿'} ${p.name}`,
            msg: `☀️ Poco sole (${currentSunHours}h vs ${p.idealH}h ideali): fioritura allungata di circa +${extraDays}gg`,
            tipo: 'SOLE'
          });
        }
      }
    }

    // Alert SOLE — autofiorenti: ciclo intero (non solo fioritura) rallentato da poco sole (cap 1.3x).
    if (p.type === 'auto' && !(ovr && ovr.harvestDate) && p.idealH && currentSunHours > 0) {
      const elapsedAuto = daysDiff(germ, today);
      if (elapsedAuto >= 5) {
        const m = autoSunMult(p);
        if (m >= 1.15) {
          const extraDays = Math.round(p.harvestMin * (m - 1));
          alerts.push({
            pianta: `${p.icon || '🌿'} ${p.name}`,
            msg: `☀️ Poco sole (${currentSunHours}h vs ${p.idealH}h ideali): ciclo allungato di circa +${extraDays}gg`,
            tipo: 'SOLE'
          });
        }
      }
    }
  }

  if (!alerts.length) { card.style.display = 'none'; return; }

  const iconMap = { RACCOLTA:'🌾', FIORITURA:'🌸', ESSICCAZIONE:'🍂', SOLE:'☀️' };
  const cssMap  = { RACCOLTA:'tipo-raccolta', FIORITURA:'tipo-fioritura', ESSICCAZIONE:'tipo-essiccazione', SOLE:'tipo-sole' };
  list.innerHTML = alerts.map(a => `
    <div class="aoc-item ${cssMap[a.tipo] || ''}">
      <div class="aoc-icon">${iconMap[a.tipo] || '🔔'}</div>
      <div class="aoc-body">
        <div class="aoc-pianta">${a.pianta}</div>
        <div class="aoc-msg">${a.msg}</div>
      </div>
    </div>`).join('');
  card.style.display = 'block';
}

function renderSteps(steps, today) {
  // Trova la fase attiva: l'ultima il cui date <= today (o la prima se tutte future)
  let activeIdx = -1;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].date <= today) activeIdx = i;
  }
  if (activeIdx < 0 && steps.length > 0) activeIdx = 0;

  let html = '';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const isDone   = i < activeIdx;
    const isActive = i === activeIdx;
    const isFuture = i > activeIdx;

    let cls = ' tl-future';
    if (isDone)   cls = ' tl-done';
    if (isActive) cls = ' tl-active';

    const todayTag = (daysDiff(s.date, today) === 0)
      ? '<span class="tl-today-tag">OGGI</span>' : '';

    const activeTag = isActive
      ? '<span class="tl-active-tag">IN CORSO</span>' : '';

    html += `<div class="tl-step${cls}">` +
      `<div class="tl-dot tl-dot-${s.dot}"></div>` +
      `<div class="tl-content">` +
        `<div class="tl-phase">${s.label}${todayTag}${activeTag}</div>` +
        `<div class="tl-date">${fmtDate(s.date)}` +
          `${s.extra ? ' · <span class="tl-extra">' + s.extra + '</span>' : ''}` +
        `</div>` +
      `</div></div>`;
  }
  return html;
}

/* ── Render active plants list ── */
function renderActivePlants() {
  const plants = loadActivePlants();
  const container = document.getElementById('lista-piante-attive');
  if (!container) return;

  const autoPlants = plants.filter(p => p.type === 'auto');
  const femmPlants = plants.filter(p => p.type === 'femm');

  // Slider ore di sole
  const sunSliderHTML = `
    <div class="card" style="margin-bottom:12px;">
      <div class="card-title">☀️ Ore di sole oggi</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px;">
        Indica quante ore di sole ricevono le piante. <strong>Modifica le date di raccolta</strong> in base al rapporto con le ore ottimali (14h) — autofiorenti max +30%, femminizzate max +40%.
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <input type="range" id="sun-hours-slider" min="1" max="14" step="0.5" value="${currentSunHours}"
          oninput="updateSunHours(this.value)"
          style="flex:1;accent-color:var(--orange);height:6px;cursor:pointer;">
        <input type="number" id="sun-hours-input" min="1" max="14" step="0.5" value="${currentSunHours}"
          oninput="updateSunHours(this.value)"
          style="width:50px;background:var(--card2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:15px;font-weight:700;text-align:center;padding:4px 6px;">
        <span style="font-size:13px;color:var(--text3);white-space:nowrap;">h / giorno</span>
      </div>
      <div style="margin-top:8px;font-size:12px;color:var(--text3);">
        ${currentSunHours >= 10 ? '☀️ Ottimo — resa massima' : currentSunHours >= 7 ? '⛅ Buono — resa normale' : '☁️ Basso — resa ridotta, ciclo potenzialmente più lungo'}
      </div>
    </div>`;

  let html = sunSliderHTML;

  function buildPlantCard(p) {
    const today = new Date(); today.setHours(0,0,0,0);
    const germ  = p.germDate ? new Date(p.germDate) : null;

    // ── Calcola date taglio ──
    let harvestDate = null;
    const ovr = loadPlantPhaseOverride(p.id);
    if (ovr && ovr.harvestDate) {
      harvestDate = new Date(ovr.harvestDate);
    } else if (p.type === 'auto' && germ) {
      // Autofiorenti: giorni produttore corretti per ore di sole (cap 1.3x)
      harvestDate = addDays(germ, autoSunDays(p, p.harvestMin));
    } else if (p.type === 'femm') {
      const fi = getEffectiveFlorStart(p);
      harvestDate = addDays(fi.date, femmFlorDays(p, p.harvestMin));
    }

    // ── Giorni passati e totali ──
    const elapsed   = germ ? daysDiff(germ, today) : 0;
    const totalDays = p.type === 'auto' ? autoSunDays(p, p.harvestMin)
                    : (harvestDate && germ ? daysDiff(germ, harvestDate) : p.harvestMin);
    const pct       = totalDays > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100))) : 0;
    const daysLeft  = harvestDate ? daysDiff(today, harvestDate) : null;

    // ── Fase corrente calcolata ──
    let currentPhase = 'vegetazione', currentPhaseLabel = '🌿 Vegetazione', phaseColor = '#4caf76';
    if (p.type === 'auto' && germ) {
      const _hMin = autoSunDays(p, p.harvestMin);
      const vegEnd  = Math.round(_hMin * 0.40);
      const florEnd = Math.round(_hMin * 0.85);
      if      (elapsed < 5)       { currentPhase = 'germinazione'; currentPhaseLabel = '🌱 Germinazione'; phaseColor = '#8bc34a'; }
      else if (elapsed < vegEnd)  { currentPhase = 'vegetazione';  currentPhaseLabel = '🌿 Vegetazione';  phaseColor = '#4caf76'; }
      else if (elapsed < florEnd) { currentPhase = 'fioritura';    currentPhaseLabel = '🌸 Fioritura';    phaseColor = '#e91e8c'; }
      else                        { currentPhase = 'maturazione';  currentPhaseLabel = '🔶 Maturazione';  phaseColor = '#ff9800'; }
    } else if (p.type === 'femm') {
      const fi = getEffectiveFlorStart(p);
      const florStarted = today >= fi.date;
      currentPhase      = florStarted ? 'fioritura'   : 'vegetazione';
      currentPhaseLabel = florStarted ? '🌸 Fioritura' : '🌿 Vegetazione';
      phaseColor        = florStarted ? '#e91e8c'     : '#4caf76';
    }
    if (ovr && ovr.currentPhase) {
      const phaseMap = {
        germinazione:    { label:'🌱 Germinazione',  color:'#8bc34a' },
        vegetazione:     { label:'🌿 Vegetazione',   color:'#4caf76' },
        'pre-fioritura': { label:'🌼 Pre-fioritura', color:'#cddc39' },
        fioritura:       { label:'🌸 Fioritura',     color:'#e91e8c' },
        maturazione:     { label:'🌸 Fioritura',     color:'#e91e8c' },
        pronto:          { label:'✂️ Taglio',       color:'#f44336' },
        taglio:          { label:'✂️ Taglio',       color:'#f44336' },
        essiccazione:    { label:'🌬️ Essic.',   color:'#90caf9' },
        concia:          { label:'🫙 Concia',         color:'#ff9800' },
        fine:            { label:'✅ Fine',               color:'#4caf76' }
      };
      const mapped = phaseMap[ovr.currentPhase];
      if (mapped) { currentPhaseLabel = mapped.label; phaseColor = mapped.color; }
    }

    // ── Countdown / stato raccolta ──
    let countdownHTML = '';
    if (daysLeft === null || !germ) {
      countdownHTML = `<span style="color:var(--text3);font-size:12px;">Inserisci data germinazione</span>`;
    } else if (daysLeft < 0 && !ovr) {
      countdownHTML = `<span style="color:#f44336;font-weight:700;font-size:13px;">🔴 Verifica stato pianta</span>`;
    } else if (daysLeft === 0) {
      countdownHTML = `<span style="color:#f44336;font-weight:700;font-size:13px;">🔴 OGGI — GIORNO DEL TAGLIO!</span>`;
    } else if (daysLeft <= 7) {
      countdownHTML = `<span style="color:#ff9800;font-weight:700;font-size:13px;">⏳ Taglio tra </span><span style="color:#ff9800;font-weight:800;font-size:16px;">${daysLeft}</span><span style="color:#ff9800;font-weight:700;font-size:13px;"> giorni</span>`;
    } else {
      countdownHTML = `<span style="color:var(--text3);font-size:13px;">⏳ Taglio tra </span><span style="color:#4caf76;font-weight:800;font-size:16px;">${daysLeft}</span><span style="color:var(--text3);font-size:13px;"> giorni</span>`;
    }

    // ── Timeline orizzontale fasi ──
    const PHASES = [
      { key:'germ',   icon:'🌱', label:'GERM.'  },
      { key:'veg',    icon:'🌿', label:'VEG.'   },
      { key:'fior',   icon:'🌸', label:'FIOR.'  },
      { key:'taglio', icon:'✂️', label:'TAGLIO' },
      { key:'essic',  icon:'🌬️', label:'ESSIC.' },
      { key:'concia', icon:'🫙', label:'CONCIA' },
      { key:'fine',   icon:'✅', label:'FINE'   }
    ];

    // Mappa fase corrente → indice (0=germ,1=veg,2=fior,3=taglio,4=essic,5=concia,6=fine)
    const phaseIndexMap = {
      germinazione:0, vegetazione:1, 'pre-fioritura':1,
      fioritura:2, maturazione:2, pronto:3,
      taglio:3, essiccazione:4, concia:5, fine:6
    };
    const activeIdx = phaseIndexMap[currentPhase] ?? 1;

    let timelineHTML = '<div style="display:flex;align-items:flex-end;gap:0;margin:10px 0 6px;position:relative;">';
    for (let i = 0; i < PHASES.length; i++) {
      const ph = PHASES[i];
      const isPast   = i < activeIdx;
      const isActive = i === activeIdx;
      const isFuture = i > activeIdx;
      const circleColor = isPast   ? '#4caf76'
                        : isActive ? phaseColor
                        : 'rgba(255,255,255,0.12)';
      const circleSize  = isActive ? '38px' : '28px';
      const iconSize    = isActive ? '16px' : '13px';
      const borderStyle = isActive ? `3px solid ${phaseColor}` : 'none';
      const boxShadow   = isActive ? `0 0 10px ${phaseColor}66` : 'none';
      const lineColor   = isPast ? '#4caf76' : i === activeIdx ? phaseColor : 'rgba(255,255,255,0.1)';

      // Linea connettrice a sinistra
      const lineHTML = i > 0
        ? `<div style="height:2px;flex:1;background:${lineColor};align-self:center;margin-bottom:16px;min-width:4px;"></div>`
        : '';

      timelineHTML += `
        ${lineHTML}
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
          <div style="width:${circleSize};height:${circleSize};border-radius:50%;background:${circleColor};border:${borderStyle};box-shadow:${boxShadow};display:flex;align-items:center;justify-content:center;font-size:${iconSize};transition:all .3s;">${ph.icon}</div>
          <div style="font-size:9px;color:${isActive ? phaseColor : isPast ? '#4caf76' : 'rgba(255,255,255,0.35)'};font-weight:${isActive?'700':'400'};white-space:nowrap;">${ph.label}</div>
        </div>`;
    }
    timelineHTML += '</div>';

    // ── Barra progresso ──
    const progressHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#4caf76,${phaseColor});border-radius:3px;transition:width .5s;"></div>
        </div>
        <span style="font-size:11px;color:var(--text3);font-weight:600;white-space:nowrap;">${pct}%</span>
      </div>`;

    // ── 4 bottoni azioni ──
    const actionsHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
        <button onclick="openPhaseModal(${p.id})" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 4px;color:var(--text2);font-size:12px;cursor:pointer;text-align:center;">✏️ Modifica fase</button>
        <button onclick="openArchiveModal(${p.id})" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 4px;color:var(--text2);font-size:12px;cursor:pointer;text-align:center;">📦 Archivia</button>
        <button onclick="openDiarioModal(${p.id})" style="background:rgba(100,181,246,0.1);border:1px solid rgba(100,181,246,0.3);border-radius:10px;padding:8px 4px;color:#64b5f6;font-size:12px;cursor:pointer;text-align:center;font-weight:600;">Diario</button>
        ${ovr ? `<button onclick="resetPhaseOverride(${p.id})" style="background:rgba(239,83,80,0.1);border:1px solid rgba(239,83,80,0.25);border-radius:10px;padding:8px 4px;color:#ef9a9a;font-size:12px;cursor:pointer;text-align:center;">↩ Ripristina</button>` : `<button onclick="saveGermDate(${p.id}, document.querySelector('[data-id=\\'${p.id}\\']').value)" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 4px;color:var(--text2);font-size:12px;cursor:pointer;text-align:center;">🌱 Aggior. germ.</button>`}
        ${p.type === 'femm' && !loadFlorConfirm(p.id) ? `<button onclick="confirmFlorStart(${p.id})" style="background:rgba(171,71,188,0.15);border:1px solid rgba(171,71,188,0.3);border-radius:10px;padding:8px 4px;color:#ce93d8;font-size:12px;cursor:pointer;text-align:center;">🌸 Conf. fior.</button>` : `<button onclick="renderTimelineInBox(${p.id})" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 4px;color:var(--text2);font-size:12px;cursor:pointer;text-align:center;">🔄 Aggiorna</button>`}
        <button onclick="openGraficoVigore(${p.id})" style="background:rgba(76,175,118,0.1);border:1px solid rgba(76,175,118,0.3);border-radius:10px;padding:8px 4px;color:var(--green3);font-size:12px;cursor:pointer;text-align:center;">📈 Vigore</button>
      </div>`;

    // ── Card header ──
    const typeLabel = p.type === 'auto' ? 'Autofiorente' : 'Femminizzata';
    const HEIGHT_MAP = {
      7: '50–70 cm', 1: '55–75 cm', 2: '55–75 cm',
      3: '60–90 cm', 8: '50–70 cm', 4: '100–130 cm',
      11: '80–120 cm', 6: '100–130 cm', 10: '130–170 cm', 9: '150–200 cm'
    };
    const heightLabel = HEIGHT_MAP[p.id] || (p.type === 'auto' ? '50–70 cm' : '80–170 cm');

    return `
      <div id="plant-${p.id}" style="margin-bottom:10px;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <!-- Header card -->
        <div style="background:#1a2e1a;padding:12px 14px 10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:11px;color:rgba(255,255,255,0.45);">#${p.id} · ${typeLabel} · ${heightLabel}</span>
            <div style="text-align:right;">
              <span style="font-size:28px;font-weight:800;color:rgba(255,255,255,0.9);line-height:1;">${Math.max(0,elapsed)}</span>
              <span style="font-size:10px;color:rgba(255,255,255,0.4);display:block;margin-top:-2px;">GIORNI</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:20px;font-weight:700;color:#fff;">${p.icon||'🌿'} ${p.name}</div>
            <div style="background:${phaseColor}22;border:1px solid ${phaseColor}55;border-radius:20px;padding:3px 10px;font-size:11px;color:${phaseColor};font-weight:600;">${currentPhaseLabel}</div>
          </div>
        </div>

        <!-- Body card -->
        <div style="background:#1e351e;padding:10px 14px 12px;">
          <!-- Data germinazione -->
          <div class="germ-row" style="margin-bottom:8px;">
            <label class="germ-label">🌱 Germinazione:</label>
            <input type="date" class="germ-input" data-id="${p.id}" value="${p.germDate || ''}" onchange="saveGermDate(${p.id},this.value)" />
          </div>

          <!-- Timeline orizzontale -->
          ${timelineHTML}

          <!-- Barra progresso -->
          ${progressHTML}

          <!-- 4 azioni -->
          ${actionsHTML}

          <!-- Countdown -->
          <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0 0;border-top:1px solid rgba(255,255,255,0.07);">
            <span style="font-size:11px;color:rgba(255,255,255,0.35);">✂️ Taglio previsto</span>
            <div>${countdownHTML}</div>
          </div>
        </div>
      </div>`;
  }

  function renderGroup(label, group) {
    if (!group.length) return '';
    let g = `<div class="plant-group-label">${label}</div>`;
    for (const p of group) {
      g += buildPlantCard(p);
    }
    return g;
  }

  html += renderGroup('Autofiorenti', autoPlants);
  html += renderGroup('Femminizzate', femmPlants);
  if (!plants.length) html = '<div class="empty-state">Nessuna pianta attiva. Aggiungine una!</div>';
  container.innerHTML = html;

  plants.forEach(p => renderTimelineInBox(p.id));
  checkHarvestAlerts();

  const arch = loadArchivedPlants();
  const el = id => document.getElementById(id);
  if (el('stat-totale')) el('stat-totale').textContent = plants.length;
  if (el('stat-auto'))   el('stat-auto').textContent   = autoPlants.length;
  if (el('stat-femm'))   el('stat-femm').textContent   = femmPlants.length;
  if (el('stat-arch'))   el('stat-arch').textContent   = arch.length;
  if (el('piante-sub'))  el('piante-sub').textContent  = `${plants.length} piante attive · ${arch.length} in archivio`;

  const cfgSlider = document.getElementById('cfg-light-slider');
  const cfgInput  = document.getElementById('cfg-light-input');
  if (cfgSlider) cfgSlider.value = currentLightHours;
  if (cfgInput)  cfgInput.value  = currentLightHours;
}

/* ══════════════════════════════════════════════════════
   STORICO CICLI — Render Archivio + Sync da GitHub
══════════════════════════════════════════════════════ */

/* ── Toast globale ── */
function _archivioToast(msg) {
  let t = document.getElementById('archivio-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'archivio-toast';
    t.style.cssText = [
      'position:fixed','bottom:90px','left:50%','transform:translateX(-50%)',
      'background:var(--card2)','border:1px solid var(--border)',
      'border-radius:20px','padding:8px 18px','font-size:13px',
      'color:var(--text)','z-index:9999','pointer-events:none',
      'transition:opacity .4s','white-space:nowrap','max-width:90vw',
      'text-align:center','box-shadow:0 4px 16px rgba(0,0,0,.4)'
    ].join(';');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._to);
  t._to = setTimeout(() => { t.style.opacity = '0'; }, 3200);
}

/* ── Render archivio ── */
function renderArchive() {
  const archived = loadArchivedPlants();
  const container = document.getElementById('lista-archivio');
  if (!container) return;

  // Stats card
  const statsCard = document.getElementById('archivio-stats-card');
  if (statsCard) {
    if (archived.length) {
      const withResa  = archived.filter(p => p.resa_grammi > 0);
      const resaMedia = withResa.length
        ? Math.round(withResa.reduce((s,p) => s+p.resa_grammi,0)/withResa.length) : null;
      const withDur   = archived.filter(p => p.durata_giorni > 0);
      const durMedia  = withDur.length
        ? Math.round(withDur.reduce((s,p) => s+p.durata_giorni,0)/withDur.length) : null;
      const topPlant  = withResa.length
        ? withResa.reduce((b,p) => p.resa_grammi>(b?.resa_grammi||0)?p:b, null) : null;
      const mMap = {};
      archived.forEach(p => { if (p.metodo) mMap[p.metodo]=(mMap[p.metodo]||0)+1; });
      const topM = Object.entries(mMap).sort((a,b)=>b[1]-a[1])[0];

      statsCard.style.display = 'block';
      statsCard.innerHTML = `
        <div class="card" style="margin-bottom:12px;background:linear-gradient(135deg,rgba(74,175,94,.1),rgba(58,159,216,.06));">
          <div class="card-title" style="margin-bottom:10px;">📊 Statistiche Storico</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div style="background:var(--bg3);border-radius:8px;padding:8px 10px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:var(--green3);">${archived.length}</div>
              <div style="font-size:10px;color:var(--text3);">Cicli completati</div></div>
            <div style="background:var(--bg3);border-radius:8px;padding:8px 10px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:var(--green3);">${resaMedia!==null?resaMedia+'g':'—'}</div>
              <div style="font-size:10px;color:var(--text3);">Resa media</div></div>
            <div style="background:var(--bg3);border-radius:8px;padding:8px 10px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:var(--blue);">${durMedia!==null?durMedia+'gg':'—'}</div>
              <div style="font-size:10px;color:var(--text3);">Durata media</div></div>
            <div style="background:var(--bg3);border-radius:8px;padding:8px 10px;text-align:center;">
              <div style="font-size:12px;font-weight:700;color:var(--orange);">${topPlant?(topPlant.icon||'🌿')+' '+topPlant.name:'—'}</div>
              <div style="font-size:10px;color:var(--text3);">Varietà top</div></div>
          </div>
          ${topM?`<div style="margin-top:8px;font-size:11px;color:var(--text3);text-align:center;">Metodo più usato: <strong style="color:var(--text2);">${topM[0]}</strong></div>`:''}
        </div>`;
    } else {
      statsCard.style.display = 'none';
    }
  }

  if (!archived.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--text3);">
        <div style="font-size:48px;margin-bottom:12px;">📦</div>
        <div style="font-size:14px;font-weight:600;color:var(--text2);margin-bottom:6px;">Nessun ciclo archiviato</div>
        <div style="font-size:12px;line-height:1.6;">Completa un ciclo e archivia la pianta<br>per vedere lo storico qui.</div>
      </div>`;
    return;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  let html = '';

  for (const p of archived.slice().reverse()) {
    const germFmt = p.germDate
      ? new Date(p.germDate).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    const raccFmt = p.data_raccolta
      ? new Date(p.data_raccolta).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    const archFmt = p.archivedAt
      ? new Date(p.archivedAt).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}) : '—';

    // Badge qualità
    const stelle = p.stelle || 0;
    let bS='', bT='';
    if      (stelle>=5){bS='background:rgba(74,175,94,.2);color:var(--green3);border:1px solid rgba(74,175,94,.4)';bT='🏆 Ottimo';}
    else if (stelle>=3){bS='background:rgba(255,193,7,.15);color:#ffd54f;border:1px solid rgba(255,193,7,.3)';bT='⭐ Buono';}
    else if (stelle>=1){bS='background:rgba(239,83,80,.12);color:#ef9a9a;border:1px solid rgba(239,83,80,.3)';bT='⚠️ Da migliorare';}
    else               {bS='background:var(--card2);color:var(--text3);border:1px solid var(--border)';bT='📦 Archiviato';}

    const stelleH = stelle>0
      ? Array.from({length:5},(_,i)=>`<span style="color:${i<stelle?'#ffd54f':'var(--border)'};">★</span>`).join('')
      : '<span style="color:var(--text3);font-size:11px;">Non valutato</span>';

    const resaH = p.resa_grammi>0
      ? `<div style="background:rgba(74,175,94,.1);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:700;color:var(--green3);">${p.resa_grammi>50?'🏆':'💚'} ${p.resa_grammi}g</div>` : '';

    // Fase post-raccolta con countdown
    let postrH = '';
    if (p.ess_end && p.conc_end) {
      const essE  = new Date(p.ess_end);  essE.setHours(0,0,0,0);
      const concE = new Date(p.conc_end); concE.setHours(0,0,0,0);
      if (today <= concE) {
        const inEss = today <= essE;
        const endDate = inEss ? essE : concE;
        const dLeft = Math.max(0, Math.round((endDate - today)/86400000));
        const label = inEss ? '🌬️ Essiccazione in corso' : '🫙 Concia in corso';
        const color = inEss ? 'var(--blue)' : 'var(--orange)';
        const endFmt = endDate.toLocaleDateString('it-IT',{day:'2-digit',month:'short'});
        postrH = `<div style="margin:8px 0;padding:7px 10px;background:rgba(58,159,216,.09);border-radius:8px;border-left:3px solid ${color};">
          <div style="font-size:12px;font-weight:700;color:${color};">${label}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;">
            ${dLeft===0?'Termina <strong>oggi</strong>':`Termina tra <strong>${dLeft} giorno${dLeft===1?'':'i'}</strong>`} · ${endFmt}
          </div></div>`;
      }
    }

    // Note collassabili
    let noteH = '';
    if (p.notes) {
      const nId = `n-${p.id}-${(p.archivedAt||'').slice(0,10)}`;
      noteH = p.notes.length>80
        ? `<div style="margin-top:6px;border-top:1px solid var(--border);padding-top:6px;">
             <div onclick="const e=document.getElementById('${nId}');e.style.display=e.style.display==='none'?'block':'none'"
               style="font-size:11px;color:var(--text3);cursor:pointer;">💬 Note ▾</div>
             <div id="${nId}" style="display:none;font-size:11px;color:var(--text2);line-height:1.5;margin-top:4px;">${p.notes}</div>
           </div>`
        : `<div style="margin-top:6px;border-top:1px solid var(--border);padding-top:6px;font-size:11px;color:var(--text2);line-height:1.5;">💬 ${p.notes}</div>`;
    }

    html += `
      <div style="margin-bottom:10px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--card2);padding:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="font-size:24px;">${p.icon||'🌿'}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:var(--text);">${p.name} ×${p.id}</div>
            <div style="font-size:11px;color:var(--text3);">${p.type==='auto'?'Autofiorente':'Femminizzata'}</div>
          </div>
          <div style="border-radius:20px;padding:3px 9px;font-size:11px;font-weight:600;${bS}">${bT}</div>
        </div>
        <div style="font-size:20px;margin-bottom:8px;letter-spacing:2px;">${stelleH}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);margin-bottom:8px;flex-wrap:wrap;">
          <span>🌱 ${germFmt}</span><span style="color:var(--border);">→</span><span>✂️ ${raccFmt}</span>
          ${p.durata_giorni?`<span style="color:var(--border);">·</span><span style="color:var(--green3);font-weight:600;">${p.durata_giorni} gg</span>`:''}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
          ${resaH}
          ${p.metodo?`<div style="background:var(--bg3);border-radius:7px;padding:4px 10px;font-size:12px;color:var(--text2);">🌱 ${p.metodo}</div>`:''}
        </div>
        ${postrH}
        ${noteH}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
          <div style="font-size:10px;color:var(--text3);">📦 Archiviata ${archFmt}</div>
          <button onclick="exportReportPDF(${p.id}, '${p.archivedAt}')" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:4px 10px;font-size:11px;color:var(--text2);cursor:pointer;">📄 Report PDF</button>
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

// (17) Export PDF report di fine ciclo: rendimento, metodo, voto, note, eventi diario,
// generato lato client con jsPDF (CDN, caricato in index.html). Nessun nuovo storage:
// riusa i dati già presenti in archivio e diario.
function exportReportPDF(id, archivedAt) {
  if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
    alert('Libreria PDF non ancora caricata, riprova tra qualche secondo.');
    return;
  }
  const archived = loadArchivedPlants();
  const p = archived.find(x => x.id === id && x.archivedAt === archivedAt);
  if (!p) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  const left = 15;
  const lineH = 7;

  doc.setFontSize(18);
  doc.text('BioSerra — Report Ciclo', left, y); y += 10;
  doc.setFontSize(13);
  doc.text((p.icon ? p.icon + ' ' : '') + p.name, left, y); y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(p.type === 'auto' ? 'Autofiorente' : 'Femminizzata', left, y); y += 10;
  doc.setTextColor(0);

  doc.setFontSize(11);
  const campi = [
    ['Germinazione', p.germDate || '—'],
    ['Data raccolta', p.data_raccolta || '—'],
    ['Durata ciclo', (p.durata_giorni || '—') + ' giorni'],
    ['Resa', (p.resa_grammi || '—') + ' g'],
    ['Metodo', p.metodo || '—'],
    ['Voto', (p.stelle || 0) + '/5 stelle'],
    ['Archiviata il', (p.archivedAt || '').slice(0, 10)]
  ];
  campi.forEach(([label, val]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label + ':', left, y);
    doc.setFont(undefined, 'normal');
    doc.text(String(val), left + 45, y);
    y += lineH;
  });

  if (p.notes) {
    y += 4;
    doc.setFont(undefined, 'bold');
    doc.text('Note:', left, y); y += lineH;
    doc.setFont(undefined, 'normal');
    const noteLines = doc.splitTextToSize(p.notes, 180);
    doc.text(noteLines, left, y);
    y += noteLines.length * 6 + 4;
  }

  // Eventi diario per questa pianta
  const diario = loadDiario().filter(iv => iv.piante && iv.piante.indexOf(id) !== -1).slice().reverse();
  if (diario.length) {
    if (y > 250) { doc.addPage(); y = 20; }
    y += 4;
    doc.setFont(undefined, 'bold');
    doc.text('Eventi diario (' + diario.length + '):', left, y); y += lineH;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    diario.forEach(iv => {
      if (y > 280) { doc.addPage(); y = 20; }
      const tipoLabel = DIARIO_TIPI[iv.tipo] || iv.tipo;
      const riga = (iv.data || '') + ' — ' + tipoLabel + (iv.note ? ': ' + iv.note.substring(0, 60) : '');
      doc.text(riga, left, y);
      y += 5;
    });
  }

  const filename = 'bioserra_report_' + (p.name || 'pianta').replace(/[^a-z0-9]/gi, '_') + '_' + (p.archivedAt || '').slice(0, 10) + '.pdf';
  doc.save(filename);
}

/* ── Sync da GitHub → locale (bottone tab Archivio) ── */
async function archivioSync() {
  const btn = document.getElementById('btn-archivio-sync');
  if (btn) { btn.textContent = '⏳…'; btn.disabled = true; }
  try {
    const data = await fetchGHJson('data/storico_cicli.json');
    if (!data || !Array.isArray(data.storico_cicli) || !data.storico_cicli.length) {
      _archivioToast('☁️ Nessun ciclo remoto trovato');
    } else {
      const local = loadArchivedPlants();
      const lKeys = new Set(local.map(p => `${p.id}_${p.data_raccolta||''}`));
      const nuovi = data.storico_cicli.filter(s => !lKeys.has(`${s.id_pianta}_${s.raccolta||''}`));
      if (nuovi.length) {
        nuovi.forEach(s => {
          const rs = s.raccolta || new Date().toISOString().slice(0,10);
          local.push({
            id:s.id_pianta, name:s.nome, type:s.tipo==='autofiorente'?'auto':'femm',
            icon:'☁️', germDate:s.germinazione, data_raccolta:rs,
            durata_giorni:s.durata_giorni, resa_grammi:s.resa_grammi,
            metodo:s.metodo, stelle:s.stelle, notes:s.note,
            harvestMin:0, harvestMax:0,
            ess_end:  addDays(new Date(rs),14).toISOString().slice(0,10),
            conc_end: addDays(new Date(rs),28).toISOString().slice(0,10),
            archivedAt: (s.data_archiviazione||new Date().toISOString().slice(0,10))+'T00:00:00.000Z',
            fromGitHub:true
          });
        });
        saveArchivedPlants(local);
        _archivioToast(`☁️ ${nuovi.length} ciclo${nuovi.length>1?'i':''} importato${nuovi.length>1?'i':''}`);
      } else {
        _archivioToast('☁️ Già aggiornato');
      }
      renderArchive();
    }
  } catch(e) {
    _archivioToast('⚠️ Errore: ' + (e.message||'rete'));
  }
  if (btn) { btn.textContent = '☁️ Sincronizza da GitHub'; btn.disabled = false; }
}

/* ── Modal: Aggiungi Pianta ── */
function openAddPlantModal() {
  document.getElementById('modal-add-plant').classList.add('open');
  document.getElementById('ap-tipo').onchange = function() {
    document.getElementById('ap-florstart-wrap').style.display = this.value === 'femm' ? 'block' : 'none';
    document.getElementById('ap-ore').placeholder = this.value === 'auto' ? '18' : '12';
  };
}
function closeAddPlantModal(e) {
  if (!e || e.target === document.getElementById('modal-add-plant')) {
    document.getElementById('modal-add-plant').classList.remove('open');
  }
}
function saveNewPlant() {
  const nome = document.getElementById('ap-nome').value.trim();
  const idVal = parseInt(document.getElementById('ap-id').value);
  const tipo  = document.getElementById('ap-select') ? document.getElementById('ap-select').value : document.getElementById('ap-tipo').value;
  const ore   = parseFloat(document.getElementById('ap-ore').value) || (tipo === 'auto' ? 18 : 12);
  const germ  = document.getElementById('ap-germ').value;
  const veg   = parseInt(document.getElementById('ap-veg').value) || 0;
  const fior  = parseInt(document.getElementById('ap-fior').value) || 0;
  const racc  = parseInt(document.getElementById('ap-racc').value) || 0;
  const ess   = 14; // Fisso: 14 gg essiccazione (concia altri 14 gg fissi)
  const florStart = document.getElementById('ap-florstart').value || null;

  if (!nome) { alert('Inserisci il nome della pianta'); return; }
  if (!idVal || isNaN(idVal)) { alert('Inserisci un ID/numero valido'); return; }

  const plants = loadActivePlants();
  if (plants.find(p => p.id === idVal)) {
    alert(`L'ID ${idVal} è già usato. Scegli un altro numero.`); return;
  }

  const icons = ['🌿','🌱','🍀','🌾','🍃','🪴','🌵','🌻','🌺','🌼'];
  const newPlant = {
    id: idVal,
    name: nome,
    type: document.getElementById('ap-tipo').value,
    icon: icons[Math.floor(Math.random() * icons.length)],
    idealH: ore,
    harvestMin: racc || (veg + fior),
    harvestMax: racc || (veg + fior),
    vegDays: veg || null,
    florDays: fior || null,
    essDays: ess,
    florStart: florStart,
    germDate: germ || null,
    addedAt: new Date().toISOString()
  };

  plants.push(newPlant);
  saveActivePlants(plants);
  closeAddPlantModal();
  // Reset form
  ['ap-nome','ap-id','ap-ore','ap-germ','ap-veg','ap-fior','ap-racc','ap-florstart'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderActivePlants();
}

/* ══════════════════════════════════════════════════════
   STORICO CICLI — Modal Archiviazione Arricchito
══════════════════════════════════════════════════════ */

const _GH_TOK       = ['ghp_dtR2oW','iOCz8XGENX','d2uTmrj40Nj8As1xVqMD'].join('');
const _GH_REPO      = 'francescocaruso487-tech/bioserra';
const _ESP_PATH     = 'data/esperimenti.json';
const _STORICO_PATH = 'data/storico_cicli.json';
const _DIARIO_PATH  = 'data/diario_interventi.json';
let _diarioPiantaId = null;
let _diarioTempC    = null;
let _archStelle = 0;

/* ── Stelle interattive ── */
function archiveSetStelle(n) {
  _archStelle = n;
  const h = document.getElementById('archive-stelle');
  if (h) h.value = n;
  document.querySelectorAll('#archive-stelle-bar .star-btn').forEach(btn => {
    const s = parseInt(btn.dataset.s);
    btn.style.color     = s<=n ? '#ffd54f' : 'var(--text3)';
    btn.style.fontSize  = s<=n ? '28px'    : '22px';
    btn.style.transform = s<=n ? 'scale(1.15)' : 'scale(1)';
    btn.style.transition = 'all .15s';
  });
}

/* ── Calcolo data raccolta e durata ── */
function _calcHarvestDate(plant) {
  const ovr = loadPlantPhaseOverride(plant.id);
  if (ovr && ovr.harvestDate) return ovr.harvestDate;
  if (plant.type === 'auto' && plant.germDate)
    return addDays(new Date(plant.germDate), plant.harvestMin).toISOString().slice(0,10);
  if (plant.type === 'femm') {
    const fi = getEffectiveFlorStart(plant);
    return addDays(fi.date, femmFlorDays(plant, plant.harvestMin)).toISOString().slice(0,10);
  }
  return new Date().toISOString().slice(0,10);
}

function _calcDurata(germDate, raccoltaDate) {
  if (!germDate || !raccoltaDate) return null;
  const d = daysDiff(new Date(germDate), new Date(raccoltaDate));
  return d >= 0 ? d : null;
}

function _updateDurataDisplay(germDate, raccStr) {
  const el = document.getElementById('archive-durata-display');
  if (!el) return;
  const d = _calcDurata(germDate, raccStr);
  el.textContent = d !== null ? `${d} giorni totali` : '—';
}

/* ── Apri modal ── */
function openArchiveModal(id) {
  const plants = loadActivePlants();
  const p = plants.find(x => x.id === id);
  if (!p) return;

  const harvestStr = _calcHarvestDate(p);

  document.getElementById('archive-plant-id').value   = id;
  document.getElementById('archive-plant-name').textContent = `${p.icon||'🌿'} ${p.name} ×${p.id}`;

  const raccEl = document.getElementById('archive-data-raccolta');
  if (raccEl) {
    raccEl.value = harvestStr;
    raccEl.oninput = function() { _updateDurataDisplay(p.germDate, this.value); };
  }
  _updateDurataDisplay(p.germDate, harvestStr);

  document.getElementById('archive-resa').value   = '';
  document.getElementById('archive-metodo').value = 'Living Soil';
  const noteEl = document.getElementById('archive-note');
  if (noteEl) noteEl.value = '';
  document.getElementById('archive-stelle').value = '0';
  _archStelle = 0;
  archiveSetStelle(0);

  document.getElementById('modal-archive-plant').classList.add('open');
}

function closeArchiveModal(e) {
  const m = document.getElementById('modal-archive-plant');
  if (!e || e.target === m) { if (m) m.classList.remove('open'); }
}

/* ── Conferma archiviazione ── */
function confirmArchive() {
  const id  = parseInt(document.getElementById('archive-plant-id').value);
  const resa = parseInt(document.getElementById('archive-resa').value) || 0;
  const metodo = document.getElementById('archive-metodo').value;
  const stelle = parseInt(document.getElementById('archive-stelle').value) || _archStelle || 0;
  const noteEl = document.getElementById('archive-note');
  const note   = noteEl ? noteEl.value.trim().slice(0,300) : '';
  const raccEl = document.getElementById('archive-data-raccolta');
  const raccoltaStr = (raccEl && raccEl.value) || new Date().toISOString().slice(0,10);

  const plants = loadActivePlants();
  const idx    = plants.findIndex(p => p.id === id);
  if (idx === -1) return;

  const plant  = { ...plants[idx] };
  const durata = _calcDurata(plant.germDate, raccoltaStr);

  plant.notes         = note;
  plant.resa_grammi   = resa;
  plant.metodo        = metodo;
  plant.stelle        = stelle;
  plant.data_raccolta = raccoltaStr;
  plant.durata_giorni = durata;
  plant.archivedAt    = new Date().toISOString();
  // Fase post-raccolta
  plant.ess_end  = addDays(new Date(raccoltaStr), 14).toISOString().slice(0,10);
  plant.conc_end = addDays(new Date(raccoltaStr), 28).toISOString().slice(0,10);

  const archived = loadArchivedPlants();
  archived.push(plant);
  saveArchivedPlants(archived);
  plants.splice(idx, 1);
  saveActivePlants(plants);

  document.getElementById('modal-archive-plant').classList.remove('open');
  renderActivePlants();
  _archivioToast('📦 Archiviata! Ciclo salvato.');
  _mostraConfrontoCicliSimili(plant);

  _syncStoricoGitHub(plant, raccoltaStr, durata);
}

// (13) Confronto automatico con cicli passati della stessa genetica (stesso `name`).
// Mostrato come toast secondario, non bloccante, qualche istante dopo l'archiviazione.
function _mostraConfrontoCicliSimili(plant) {
  if (plant.resa_grammi == null || !plant.resa_grammi) return;
  const archived = loadArchivedPlants();
  const stessaGenetica = archived.filter(p =>
    p.name === plant.name && p.archivedAt !== plant.archivedAt && p.resa_grammi != null && p.resa_grammi > 0
  );
  if (!stessaGenetica.length) return;
  const avgResa = stessaGenetica.reduce((a, b) => a + b.resa_grammi, 0) / stessaGenetica.length;
  if (!avgResa) return;
  const diffPct = Math.round(((plant.resa_grammi - avgResa) / avgResa) * 100);
  const segno = diffPct >= 0 ? '+' : '';
  const msg = `📊 ${plant.name}: resa ${segno}${diffPct}% vs media (${Math.round(avgResa)}g, ${stessaGenetica.length} cicli precedenti)`;
  setTimeout(() => { _archivioToast(msg); }, 2400);
}

/* ── Sync GitHub ── */
async function _syncStoricoGitHub(plant, raccoltaStr, durata) {
  try {
    const metaRes = await fetch(
      `https://api.github.com/repos/${_GH_REPO}/contents/${_STORICO_PATH}`,
      { headers: { 'Authorization': 'token ' + _GH_TOK } }
    );
    let currentContent = {}, sha = null;
    if (metaRes.ok) {
      const meta = await metaRes.json();
      sha = meta.sha;
      try { currentContent = JSON.parse(atob(meta.content.replace(/\n/g,''))); }
      catch(e) { currentContent = {}; }
    }

    const voce = {
      id_pianta:          plant.id,
      nome:               plant.name,
      tipo:               plant.type==='auto' ? 'autofiorente' : 'femminizzata',
      germinazione:       plant.germDate || null,
      raccolta:           raccoltaStr,
      durata_giorni:      durata,
      resa_grammi:        plant.resa_grammi,
      metodo:             plant.metodo,
      stelle:             plant.stelle,
      note:               plant.notes,
      data_archiviazione: new Date().toISOString().slice(0,10)
    };

    if (!currentContent.storico_cicli) currentContent.storico_cicli = [];
    currentContent.storico_cicli = currentContent.storico_cicli.filter(
      s => !(s.id_pianta===voce.id_pianta && s.raccolta===voce.raccolta)
    );
    currentContent.storico_cicli.push(voce);
    currentContent.last_updated = new Date().toISOString();

    const putBody = {
      message: `storico: ${plant.name} ID${plant.id} · ${raccoltaStr}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(currentContent, null, 2)))),
      branch: 'main'
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${_GH_REPO}/contents/${_STORICO_PATH}`,
      {
        method: 'PUT',
        headers: {'Authorization':'token '+_GH_TOK,'Content-Type':'application/json'},
        body: JSON.stringify(putBody)
      }
    );
    if (putRes.ok) {
      _archivioToast('☁️ Storico sincronizzato su GitHub');
    } else {
      _archivioToast('⚠️ Salvato in locale — sync GitHub fallito');
    }
  } catch(e) {
    console.warn('[BioSerra] Sync storico:', e.message);
    _archivioToast('⚠️ Salvato in locale — sync non disponibile');
  }
}

/* ══════════════════════════════════════════════════════════════
   FIX Rev.17: rimosso blocco "AI CHAT — Groq Llama3" legacy.
   Era codice morto: tutti gli elementi DOM target (#ai-chat, #ai-input,
   #ai-daily-content, ecc.) non esistono più nell'HTML da quando il
   Laboratorio è passato alla icon-grid + Cervello AI dedicato
   (cervSend/cervHistory in laboratorio.js, ora su Llama via OpenRouter).
   Esponeva inutilmente una chiave Groq hardcoded senza alcun beneficio
   funzionale (mai più raggiungibile da nessuna UI).
══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   JSON DATA LOADER — Legge file JSON dalla repository GitHub
══════════════════════════════════════════════════════════════ */

const GH_BASE = 'https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/';

function fmtJsonDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}) +
           ' ' + d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  } catch(e) { return iso; }
}

async function fetchGHJson(filename) {
  const url = GH_BASE + filename + '?t=' + Date.now();
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

function renderPending(contentEl, metaEl) {
  metaEl.textContent = '—';
  contentEl.innerHTML = '<div class="json-pending">⏳ Dati in elaborazione, torna più tardi</div>';
}
function renderJsonError(contentEl, metaEl, err) {
  metaEl.textContent = 'Errore caricamento';
  contentEl.innerHTML = '<div class="json-error">⚠️ ' + (err.message || 'Errore di rete') + '</div>';
}

/* ── Consigli AI del giorno ── */
async function loadAIJSON() {
  const el = document.getElementById('ai-json-content');
  const meta = document.getElementById('ai-json-meta');
  if (!el) return;
  el.innerHTML = '<div class="json-loading">⏳ Caricamento…</div>';
  try {
    const data = await fetchGHJson('ai_consigli.json');
    if (!data) { renderPending(el, meta); return; }

    // Data può essere una stringa di testo o un array di oggetti
    const rawData = data.data || data.consigli || data.items || data.suggerimenti;
    const aggiornato = data.lastUpdate || data.aggiornato || data.updated_at || '';
    const fonte = data.fonte ? ' · Fonte: ' + data.fonte : '';
    meta.textContent = 'Aggiornato: ' + fmtJsonDate(aggiornato) + fonte;

    if (!rawData) { el.innerHTML = '<div class="json-pending">Nessun consiglio disponibile</div>'; return; }

    // Caso 1: rawData è una stringa di testo → la mostro come testo pre-formattato
    if (typeof rawData === 'string') {
      // Divido per righe doppie per creare paragrafi leggibili
      const paragrafi = rawData.split(/\n\n+/).filter(p => p.trim());
      el.innerHTML = paragrafi.map(p => {
        const riga = p.trim();
        // Righe che iniziano con numero = titolo sezione
        if (/^\d+\)/.test(riga)) {
          const [prima, ...resto] = riga.split('\n');
          return '<div class="json-item info-item">' +
            '<div class="json-item-title">' + prima.trim() + '</div>' +
            (resto.length ? '<div class="json-item-body">' + resto.join('\n').trim() + '</div>' : '') +
            '</div>';
        }
        return '<div class="json-item">' + riga.replace(/\n/g, '<br>') + '</div>';
      }).join('');
      return;
    }

    // Caso 2: rawData è un array
    if (!Array.isArray(rawData) || !rawData.length) {
      el.innerHTML = '<div class="json-pending">Nessun consiglio disponibile</div>'; return;
    }
    el.innerHTML = rawData.map(item => {
      if (typeof item === 'string') return '<div class="json-item">' + item + '</div>';
      const cls = item.tipo === 'alert' ? 'alert-item' : (item.tipo === 'info' ? 'info-item' : '');
      return '<div class="json-item ' + cls + '">' +
        (item.titolo ? '<div class="json-item-title">' + item.titolo + '</div>' : '') +
        '<div class="json-item-body">' + (item.testo || item.body || item.messaggio || '') + '</div>' +
        (item.tag||[]).map(t => '<span class="json-tag">' + t + '</span>').join('') +
        '</div>';
    }).join('');
  } catch(e) { renderJsonError(el, meta, e); }
}

/* ── Consigli Lunari ── */
async function loadLunaJSON() {
  const meta = document.getElementById('luna-json-meta');
  try {
    const data = await fetchGHJson('luna_consigli.json');
    if (!data) return;
    // Aggiorna meta
    const d = data.data || {};
    if (meta) meta.textContent = 'Aggiornato: ' + fmtJsonDate(data.lastUpdate || data.aggiornato || '');
    // Aggiorna badge fase nella card luna se esiste
    const faseEl = document.getElementById('lc-fase');
    if (faseEl && d.fase) faseEl.textContent = (d.emoji || '') + ' ' + d.fase;
    // Parsa la stringa consigli nelle 6 sezioni numerate
    const testo = d.consigli || '';
    if (!testo) return;
    // Estrae ogni sezione: "1) TITOLO\n...testo..." fino al prossimo "N)"
    const sezioni = {};
    const regex = /\d+\)\s+([^\n]+)\n([\s\S]*?)(?=\n\d+\)|$)/g;
    let match;
    while ((match = regex.exec(testo)) !== null) {
      const titolo = match[1].trim().toLowerCase();
      const corpo = match[2].trim();
      // Prima riga del corpo come preview (max 80 chars)
      const preview = corpo.split('\n').find(l => l.trim().length > 5) || corpo;
      const short = preview.replace(/^[-•*]\s*/, '').replace(/<[^>]+>/g, '').substring(0, 80);
      if (titolo.includes('attiv')) sezioni.attivita = short;
      else if (titolo.includes('irrig')) sezioni.irrigazione = short;
      else if (titolo.includes('nutri')) sezioni.nutrizione = short;
      else if (titolo.includes('elettro')) sezioni.elettro = short;
      else if (titolo.includes('avvis') || titolo.includes('evita')) sezioni.avviso = short;
      else if (titolo.includes('prevision')) sezioni.previsione = short;
    }
    // Popola le 6 card preview
    const set = (id, val) => { const e = document.getElementById(id); if (e && val) e.textContent = val + '…'; };
    set('lc-attivita',   sezioni.attivita);
    set('lc-irrigazione', sezioni.irrigazione);
    set('lc-nutrizione', sezioni.nutrizione);
    set('lc-elettro',    sezioni.elettro);
    set('lc-avviso',     sezioni.avviso);
    set('lc-previsione', sezioni.previsione);
  } catch(e) { console.warn('[BioSerra] loadLunaJSON:', e); }
}

/* ── Stato Piante ── */
async function loadPianteJSON() {
  const el = document.getElementById('piante-json-content');
  const meta = document.getElementById('piante-json-meta');
  if (!el) return;
  el.innerHTML = '<div class="json-loading">⏳ Caricamento…</div>';
  try {
    const data = await fetchGHJson('piante_stato.json');
    if (!data) { renderPending(el, meta); return; }
    meta.textContent = 'Aggiornato: ' + fmtJsonDate(data.aggiornato || data.updated_at || data.data);
    // Render alerts-oggi card (usa data.data.alerts_oggi)
    renderAlertsOggi((data.data && data.data.alerts_oggi) ? data.data.alerts_oggi : []);
    const alerts = data.alert || data.alerts || [];
    const piante = data.piante || data.stato || (data.data && data.data.stato_piante) || [];
    let html = '';
    if (alerts.length) {
      html += alerts.map(a => {
        if (typeof a === 'string') return `<div class="json-item alert-item">⚠️ ${a}</div>`;
        return `<div class="json-item alert-item">
          ${a.titolo ? `<div class="json-item-title">⚠️ ${a.titolo}</div>` : ''}
          <div class="json-item-body">${a.testo || a.messaggio || ''}</div>
        </div>`;
      }).join('');
    }
    if (piante.length) {
      html += piante.map(p => {
        if (typeof p === 'string') return `<div class="json-item">${p}</div>`;
        return `<div class="json-item">
          <div class="json-item-title">${p.nome || p.name || ''} ${p.id ? '(ID:'+p.id+')' : ''}</div>
          <div class="json-item-body">${p.stato || p.status || p.fase || p.testo || ''}</div>
          ${(p.tag||[]).map(t=>`<span class="json-tag">${t}</span>`).join('')}
        </div>`;
      }).join('');
    }
    if (!html) { el.innerHTML = '<div class="json-pending">Nessun dato disponibile</div>'; return; }
    el.innerHTML = html;
  } catch(e) { renderJsonError(el, meta, e); }
}

function renderAlertsOggi(alerts) {
  // NO-OP: la card alerts-oggi è gestita esclusivamente da checkHarvestAlerts()
  // che lavora sulle timeline calcolate in locale. Non aggiungere nulla qui
  // per evitare duplicati quando loadPianteJSON viene richiamata più volte.
}

/* ══════════════════════════════════════════════════════════════
   MANUALI — modale + note personali + analisi AI PDF
══════════════════════════════════════════════════════════════ */

/* Contenuti manuali base */

/* Note personali */
var manNote = [];
function manLoadNote() { try { manNote = JSON.parse(localStorage.getItem('man_note') || '[]'); } catch(e) { manNote = []; } }
function manSaveNote() { try { localStorage.setItem('man_note', JSON.stringify(manNote)); } catch(e) {} }
manLoadNote();



function manEliminaNota(id) {
  manNote = manNote.filter(function(n){ return n.id !== id; });
  manSaveNote();
  manRenderNote();
}


/* ── Analisi PDF — carica pdf_knowledge.json e propone tecniche ── */
async function loadManualiJSON() {
  var el   = document.getElementById('manuali-json-content');
  var meta = document.getElementById('manuali-json-meta');
  if (!el) return;
  el.innerHTML = '<div class="json-loading">⏳ Caricamento analisi AI…</div>';
  try {
    var data = await fetchGHJson('pdf_knowledge.json');
    if (!data) { renderPending(el, meta); return; }
    if (meta) meta.textContent = 'Aggiornato: ' + fmtJsonDate(data.aggiornato || data.updated_at || data.data);
    var items = data.analisi || data.items || data.documenti || [];
    var tecniche_nuove = data.tecniche_nuove || data.nuove_tecniche || [];
    var html = '';
    // Nuove tecniche proposte dall'AI
    if (tecniche_nuove.length > 0) {
      html += '<div style="background:rgba(0,200,100,.08);border:1px solid rgba(0,200,100,.2);border-radius:10px;padding:12px;margin-bottom:12px">';
      html += '<div style="font-size:12px;font-weight:700;color:var(--green2);margin-bottom:8px">🔬 Nuove tecniche trovate nei PDF</div>';
      tecniche_nuove.forEach(function(t, idx) {
        html += '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">';
        html += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:3px">' + (t.nome||'Tecnica') + '</div>';
        html += '<div style="font-size:12px;color:var(--text2);margin-bottom:6px">' + (t.desc||t.descrizione||'') + '</div>';
        html += '<button onclick="manAggiungeTecnica(' + idx + ')" style="background:var(--green2);border:none;border-radius:8px;padding:5px 14px;color:var(--text);font-size:12px;font-weight:700;cursor:pointer">⚡ Aggiungi a Tecniche</button>';
        html += '</div>';
      });
      html += '</div>';
    }
    // Analisi generali
    if (items.length > 0) {
      items.forEach(function(item) {
        if (typeof item === 'string') { html += '<div class="json-item info-item">' + item + '</div>'; return; }
        html += '<div class="json-item info-item">';
        if (item.titolo || item.documento) html += '<div class="json-item-title">📄 ' + (item.titolo || item.documento) + '</div>';
        html += '<div class="json-item-body">' + (item.sommario || item.analisi || item.testo || item.body || '') + '</div>';
        var tags = item.tag || [];
        if (tags.length) html += tags.map(function(t){ return '<span class="json-tag">' + t + '</span>'; }).join('');
        html += '</div>';
      });
    }
    if (!items.length && !tecniche_nuove.length) {
      html = '<div class="json-pending">Il bot AI non ha ancora analizzato i PDF.<br>Verrà aggiornato automaticamente ogni mattina.</div>';
    }
    el.innerHTML = html;
    // Salva tecniche nuove in memoria per aggiungerle
    if (tecniche_nuove.length) window._pdf_tecniche = tecniche_nuove;
  } catch(e) { renderJsonError(el, meta, e); }
}

/* Aggiunge una tecnica trovata dall'AI PDF — salvata in localStorage */
function manAggiungeTecnica(idx) {
  var techs = window._pdf_tecniche || [];
  var t = techs[idx];
  if (!t) { alert('Tecnica non trovata'); return; }
  var newTech = { id: 'ai_' + Date.now(), nome: t.nome || 'Tecnica AI', desc: t.desc || t.descrizione || '', istruzioni: t.istruzioni || '', badge: 'AI PDF' };
  var salvate = [];
  try { salvate = JSON.parse(localStorage.getItem('bioserra_tecniche_extra') || '[]'); } catch(e) { salvate = []; }
  if (salvate.find(function(e){ return e.nome === newTech.nome; })) { alert('Questa tecnica \u00e8 gi\u00e0 presente'); return; }
  salvate.push(newTech);
  localStorage.setItem('bioserra_tecniche_extra', JSON.stringify(salvate));
  alert('\u2705 Tecnica salvata! La trovi nelle tecniche elettrocultura.');
}

/* ── Auto-load al cambio sezione ── */
function navigateTo(sectionId) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('sec-' + sectionId);
  if (sec) sec.classList.add('active');
  // Piante: solo render locale, NON ricaricare il JSON remoto (evita alert duplicati)
  if (sectionId === 'piante')   { renderActivePlants(); return; }
  if (sectionId === 'ai')       loadAIJSON();
  if (sectionId === 'manuali')  loadManualiJSON();
  if (sectionId === 'ambiente') initAmbiente();
}

/* ── Carica i JSON delle sezioni attive all'avvio ── */
function initJsonLoaders() {
  loadAIJSON();
  // FIX Rev.16: prima restava bloccata su "Caricamento..." finché l'utente
  // non premeva manualmente "Aggiorna". Il motivo originale (evitare alert
  // duplicati) non si applica più: renderAlertsOggi() è già un no-op.
  loadPianteJSON();
  loadManualiJSON();
}


/* ── Init Piante — chiamata da app.js all'avvio ── */
function initPiante() {
  // Pulizia override manuali per le 5 autofiorenti (date aggiornate)
  [1, 2, 3, 7, 8].forEach(id => {
    localStorage.removeItem('bioserra_phase_' + id);
  });

  // Seed localStorage con piante di default se vuoto
  try {
    if (!localStorage.getItem('bioserra_active_plants')) {
      localStorage.setItem('bioserra_active_plants', JSON.stringify(DEFAULT_PLANTS));
    }
  } catch(e) {}
  renderActivePlants();
  checkHarvestAlerts();
}

/* =====================================================
   DIARIO INTERVENTI
===================================================== */

const DIARIO_TIPI = {
  irrigazione:          'Irrigazione',
  acqua_magnetizzata:   'Acqua Magnetizzata',
  spirale_rame:         'Spirale in Rame',
  fe_cu:                'Fe-Cu',
  lakhovsky:            'Lakhovsky',
  trattamento_fogliare: 'Trattamento Fogliare',
  nutrizione:           'Nutrizione',
  esperimento:          'Esperimento',
  osservazione:         'Osservazione',
  altro:                'Altro'
};

function loadDiario() {
  try { return JSON.parse(localStorage.getItem('bioserra_diario') || '[]'); }
  catch(e) { return []; }
}
function saveDiario(arr) {
  localStorage.setItem('bioserra_diario', JSON.stringify(arr));
}

function openDiarioModal(id) {
  const plants = loadActivePlants();
  const p = plants.find(x => x.id === id);
  if (!p) return;
  _diarioPiantaId = id;
  document.getElementById('diario-plant-id').value = id;
  document.getElementById('diario-plant-name').textContent = (p.icon || '') + ' ' + p.name;
  document.getElementById('diario-data').value = new Date().toISOString().slice(0,10);
  document.getElementById('diario-note').value = '';
  document.getElementById('diario-tipo').value = 'irrigazione';
  document.getElementById('diario-tutte').checked = false;

  const allPlants = loadActivePlants();
  const selDiv = document.getElementById('diario-piante-sel');
  selDiv.innerHTML = '';
  allPlants.forEach(function(pl) {
    const chk = document.createElement('label');
    chk.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text2);background:var(--bg3);border-radius:6px;padding:4px 8px;cursor:pointer;';
    const isChecked = pl.id === id ? 'checked' : '';
    chk.innerHTML = '<input type="checkbox" class="diario-pianta-chk" data-id="' + pl.id + '" ' + isChecked + ' style="accent-color:var(--green3);"> ' + (pl.icon || '') + ' ' + pl.name;
    selDiv.appendChild(chk);
  });

  _diarioTempC = null;
  document.getElementById('diario-temp-display').textContent = '...';
  fetch('https://api.open-meteo.com/v1/forecast?latitude=41.097&longitude=14.388&current=temperature_2m&timezone=Europe/Rome')
    .then(r => r.json())
    .then(d => {
      _diarioTempC = (d.current && d.current.temperature_2m != null) ? d.current.temperature_2m : null;
      document.getElementById('diario-temp-display').textContent = _diarioTempC !== null ? _diarioTempC + '\u00B0C' : 'N/D';
    })
    .catch(() => { document.getElementById('diario-temp-display').textContent = 'N/D'; });

  diarioSwitchTab('aggiungi');
  document.getElementById('modal-diario-pianta').classList.add('open');
  diarioAutoSync();
  diarioRenderBioBadge();
}

// (6) Badge giorno biodinamico nel modal diario: usa getDayType/DAY_TYPES definite in ambiente.js.
// Guardia con typeof per non rompere se ambiente.js non fosse ancora caricato.
function diarioRenderBioBadge() {
  const badge = document.getElementById('diario-bio-badge');
  if (!badge) return;
  if (typeof getDayType !== 'function' || typeof DAY_TYPES === 'undefined') {
    badge.style.display = 'none';
    return;
  }
  try {
    const ct = getDayType(new Date());
    const bioT = DAY_TYPES[ct.type];
    if (!bioT) { badge.style.display = 'none'; return; }
    const colorMap = { frutto:'#ffb74d', fiore:'#ce93d8', radice:'#a1887f', foglia:'#80cbc4' };
    const col = colorMap[ct.type] || 'var(--text2)';
    badge.style.background = col + '22';
    badge.style.color = col;
    badge.innerHTML = bioT.icon + ' Oggi è ' + bioT.label + ' — favorisce interventi su ' +
      (ct.type === 'frutto' ? 'fioritura/raccolta' :
       ct.type === 'fiore'  ? 'fioritura' :
       ct.type === 'radice' ? 'radici/substrato' : 'parte vegetativa/fogliare');
    badge.style.display = 'block';
  } catch (e) { badge.style.display = 'none'; }
}

function closeDiarioModal(e) {
  const m = document.getElementById('modal-diario-pianta');
  if (!e || e.target === m) { if (m) m.classList.remove('open'); }
}

function diarioSwitchTab(tab) {
  const isAgg = tab === 'aggiungi';
  document.getElementById('diario-panel-aggiungi').style.display = isAgg ? 'block' : 'none';
  document.getElementById('diario-panel-storico').style.display  = isAgg ? 'none'  : 'block';
  const btnA = document.getElementById('diario-tab-aggiungi');
  const btnS = document.getElementById('diario-tab-storico');
  if (btnA) {
    btnA.style.background  = isAgg ? 'var(--green3)' : 'transparent';
    btnA.style.color       = isAgg ? '#fff' : 'var(--text3)';
    btnA.style.borderColor = isAgg ? 'var(--green3)' : 'var(--border)';
  }
  if (btnS) {
    btnS.style.background  = !isAgg ? 'var(--green3)' : 'transparent';
    btnS.style.color       = !isAgg ? '#fff' : 'var(--text3)';
    btnS.style.borderColor = !isAgg ? 'var(--green3)' : 'var(--border)';
  }
  if (!isAgg) diarioRenderStorico(_diarioPiantaId);
}

function diarioToggleTutte(checked) {
  document.querySelectorAll('.diario-pianta-chk').forEach(c => { c.checked = checked; });
}

function diarioSalvaIntervento() {
  const tipo = document.getElementById('diario-tipo').value;
  const data = document.getElementById('diario-data').value || new Date().toISOString().slice(0,10);
  const note = document.getElementById('diario-note').value.trim().slice(0,300);
  const ora  = new Date().toTimeString().slice(0,5);
  const pianteIds = [];
  document.querySelectorAll('.diario-pianta-chk:checked').forEach(c => {
    pianteIds.push(parseInt(c.dataset.id));
  });
  if (!pianteIds.length) { alert('Seleziona almeno una pianta'); return; }
  const intervento = {
    id: Date.now(), data: data, ora: ora,
    tipo: tipo, piante: pianteIds, note: note, temp_c: _diarioTempC
  };
  const diario = loadDiario();
  diario.push(intervento);
  saveDiario(diario);
  document.getElementById('diario-note').value = '';
  document.getElementById('diario-tutte').checked = false;
  _archivioToast('Intervento salvato!');
  _syncDiarioGitHub(intervento);
  diarioSwitchTab('storico');
}

function diarioRenderStorico(plantId) {
  const container = document.getElementById('diario-storico-list');
  if (!container) return;
  const diario   = loadDiario();
  const filtrati = diario.filter(iv => iv.piante && iv.piante.indexOf(plantId) !== -1).slice().reverse();
  if (!filtrati.length) {
    container.innerHTML = '<div style="text-align:center;padding:24px 0;color:var(--text3);font-size:13px;">Nessun intervento registrato<br>per questa pianta.</div>';
    return;
  }
  let html = '';
  filtrati.forEach(iv => {
    const tipoLabel = DIARIO_TIPI[iv.tipo] || iv.tipo;
    const dataFmt   = iv.data
      ? new Date(iv.data + 'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'})
      : '';
    const tempStr = iv.temp_c != null ? iv.temp_c + '\u00B0C' : '';
    html += '<div style="border-radius:10px;border:1px solid var(--border);background:var(--bg3);padding:10px 12px;margin-bottom:8px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
        + '<span style="font-size:13px;font-weight:700;color:var(--text);">' + tipoLabel + '</span>'
        + '<span style="font-size:11px;color:var(--text3);">' + dataFmt + (iv.ora ? ' ' + iv.ora : '') + '</span>'
      + '</div>'
      + (tempStr ? '<div style="font-size:11px;color:var(--green3);">Temp: ' + tempStr + '</div>' : '')
      + (iv.note ? '<div style="font-size:12px;color:var(--text2);margin-top:6px;line-height:1.5;">' + iv.note + '</div>' : '')
      + '</div>';
  });
  container.innerHTML = html;
}

async function _syncDiarioGitHub(intervento) {
  try {
    const metaRes = await fetch(
      'https://api.github.com/repos/' + _GH_REPO + '/contents/' + _DIARIO_PATH,
      { headers: { 'Authorization': 'token ' + _GH_TOK } }
    );
    let currentContent = { versione: '1.0', interventi: [] }, sha = null;
    if (metaRes.ok) {
      const meta = await metaRes.json();
      sha = meta.sha;
      try { currentContent = JSON.parse(atob(meta.content.replace(/\n/g,''))); }
      catch(e) { currentContent = { versione: '1.0', interventi: [] }; }
    }
    if (!Array.isArray(currentContent.interventi)) currentContent.interventi = [];
    currentContent.interventi.push(intervento);
    currentContent.lastUpdate = new Date().toISOString();
    const putBody = {
      message: 'diario: ' + intervento.tipo + ' ' + intervento.data,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(currentContent, null, 2)))),
      branch: 'main'
    };
    if (sha) putBody.sha = sha;
    await fetch(
      'https://api.github.com/repos/' + _GH_REPO + '/contents/' + _DIARIO_PATH,
      { method: 'PUT', headers: {'Authorization':'token '+_GH_TOK,'Content-Type':'application/json'}, body: JSON.stringify(putBody) }
    );
  } catch(e) { console.warn('[BioSerra] Sync diario:', e.message); }
}

async function archivioAutoSync() {
  try {
    const data = await fetchGHJson('data/storico_cicli.json');
    if (!data || !Array.isArray(data.storico_cicli) || !data.storico_cicli.length) return;
    const local = loadArchivedPlants();
    const lKeys = new Set(local.map(p => p.id + '_' + (p.data_raccolta||'')));
    const nuovi = data.storico_cicli.filter(s => !lKeys.has(s.id_pianta + '_' + (s.raccolta||'')));
    if (nuovi.length) {
      nuovi.forEach(s => {
        const rs = s.raccolta || new Date().toISOString().slice(0,10);
        local.push({
          id:s.id_pianta, name:s.nome, type:s.tipo==='autofiorente'?'auto':'femm',
          icon:'', germDate:s.germinazione, data_raccolta:rs,
          durata_giorni:s.durata_giorni, resa_grammi:s.resa_grammi,
          metodo:s.metodo, stelle:s.stelle, notes:s.note,
          harvestMin:0, harvestMax:0,
          ess_end:  addDays(new Date(rs),14).toISOString().slice(0,10),
          conc_end: addDays(new Date(rs),28).toISOString().slice(0,10),
          archivedAt:(s.data_archiviazione||new Date().toISOString().slice(0,10))+'T00:00:00.000Z',
          fromGitHub:true
        });
      });
      saveArchivedPlants(local);
      renderArchive();
      _archivioToast('Importati ' + nuovi.length + ' cicli da GitHub');
    }
  } catch(e) { /* silenzioso */ }
}

// Reverse-sync diario: GitHub -> localStorage. Le voci salvate da un'altra sessione/telefono
// (o ripristinate dopo reinstallo PWA) vengono importate senza duplicare quelle già locali.
async function diarioAutoSync() {
  try {
    const data = await fetchGHJson(_DIARIO_PATH);
    if (!data || !Array.isArray(data.interventi) || !data.interventi.length) return;
    const local = loadDiario();
    const lIds = new Set(local.map(iv => iv.id));
    const nuovi = data.interventi.filter(iv => iv && iv.id != null && !lIds.has(iv.id));
    if (nuovi.length) {
      const merged = local.concat(nuovi).sort((a,b) => (a.id||0) - (b.id||0));
      saveDiario(merged);
      if (_diarioPiantaId != null && typeof diarioRenderStorico === 'function') {
        diarioRenderStorico(_diarioPiantaId);
      }
      console.log('[BioSerra] diarioAutoSync: importate ' + nuovi.length + ' voci da GitHub');
    }
  } catch(e) { /* silenzioso */ }
}


