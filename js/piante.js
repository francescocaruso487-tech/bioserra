/* BioSerra - piante.js */
/* ══════════════════════════════════════════════════════════════
   PIANTE — Sistema Dinamico: Attive, Aggiungi, Archivia
══════════════════════════════════════════════════════════════ */

/* ── Piante di default (fisse) ── */
const DEFAULT_PLANTS = [
  { id:7,  name:'Epsilon F1',         type:'auto', icon:'🌸', harvestMin:60,  harvestMax:60,  idealH:18, germDate:'2026-04-21' },
  { id:1,  name:'Milky Way F1',       type:'auto', icon:'🌙', harvestMin:70,  harvestMax:75,  idealH:18, germDate:'2026-04-23' },
  { id:2,  name:'Titan F1',           type:'auto', icon:'⚡', harvestMin:70,  harvestMax:75,  idealH:18, germDate:'2026-04-22' },
  { id:3,  name:'Medusa F1',          type:'auto', icon:'🪼', harvestMin:70,  harvestMax:75,  idealH:18, germDate:'2026-04-21' },
  { id:8,  name:'Gaia F1',            type:'auto', icon:'🌍', harvestMin:65,  harvestMax:70,  idealH:18, germDate:'2026-04-21' },
  { id:4,  name:'Astro Lemonade F1',  type:'femm', icon:'🍋', harvestMin:50,  harvestMax:60,  idealH:12, florStart:'2026-10-01', germDate:'2026-04-21' },
  { id:11, name:'Cosmic Cheddar F1',  type:'femm', icon:'🧀', harvestMin:50,  harvestMax:60,  idealH:12, florStart:'2026-10-01', germDate:'2026-05-02' },
  { id:6,  name:'Orbital Banana F1',  type:'femm', icon:'🍌', harvestMin:55,  harvestMax:65,  idealH:12, florStart:'2026-10-01', germDate:'2026-04-30' },
  { id:10, name:'Royal Gorilla',       type:'femm', icon:'🦍', harvestMin:55,  harvestMax:65,  idealH:12, florStart:'2026-10-15', germDate:'2026-04-22' },
  { id:9,  name:'Mexican Rush',        type:'femm', icon:'🌮', harvestMin:60,  harvestMax:70,  idealH:12, florStart:'2026-10-15', germDate:'2026-04-21' }
];

/* ── Storage helpers ── */
function loadActivePlants() {
  try {
    const saved = localStorage.getItem('bioserra_active_plants');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrazione: se i dati sono stati generati dal vecchio codice con moltiplicatore,
      // harvestMin delle autofiorenti sarebbe >> 75 (es. 60×3=180). Reset ai default.
      const needsMigration = parsed.some(p =>
        p.type === 'auto' && p.harvestMin > 100
      );
      if (needsMigration) {
        console.log('[BioSerra] Migrazione dati piante: reset ai valori produttore corretti');
        // Conserva solo le date di germinazione inserite dall'utente
        const germMap = {};
        parsed.forEach(p => { if (p.germDate) germMap[p.id] = p.germDate; });
        const migrated = DEFAULT_PLANTS.map(dp => ({
          ...dp,
          germDate: germMap[dp.id] || dp.germDate
        }));
        localStorage.setItem('bioserra_active_plants', JSON.stringify(migrated));
        return migrated;
      }
      return parsed;
    }
  } catch(e) {}
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
  if (tab === 'archivio') renderArchive();
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

function getAutoHarvestDate(p) {
  // Autofiorenti: data germinazione + gg produttore (nessun moltiplicatore)
  if (!p.germDate) return null;
  const germ = new Date(p.germDate);
  const harvestMin = addDays(germ, p.harvestMin);
  const harvestMax = addDays(germ, p.harvestMax);
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
    // DATE FISSE: germ + giorni produttore (NO moltiplicatore)
    const ovr = loadPlantPhaseOverride(p.id);
    const vegRatio = 0.40; // ~40% del ciclo in vegetazione
    const florRatio = 0.45; // ~45% in fioritura
    const totalDays = p.harvestMin;
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
      harvest    = addDays(germ, p.harvestMin);
      harvestMax = addDays(germ, p.harvestMax);
    }
    harvestDate = harvest;
    const essEnd  = addDays(harvest, essDays);
    const concEnd = addDays(essEnd, concDays);

    const extraHarvest = (p.harvestMin !== p.harvestMax && !ovr)
      ? `${fmtDate(harvest)} → ${fmtDate(harvestMax)} (${p.harvestMin}–${p.harvestMax} gg produttore)` + manualTag
      : `${p.harvestMin} gg dalla germinazione` + manualTag;

    steps = [
      { dot:'germ', label:'🌱 Germinazione',      date: germ,     extra:'Giorno 0 — data inserita' },
      { dot:'veg',  label:'🌿 Fine Vegetazione',   date: endVeg,   extra:`+${vegDays} gg dalla germinazione` },
      { dot:'fior', label:'🌸 Inizio Fioritura',   date: endFlor,  extra:`+${florStart + Math.round(totalDays * florRatio)} gg totali` },
      { dot:'rec',  label:'✂️ Taglio previsto',    date: harvest,  extra: extraHarvest },
      { dot:'ess',  label:'🌬️ Fine Essiccazione', date: essEnd,   extra:`+${essDays} gg fissi` },
      { dot:'conc', label:'🫙 Fine Concia',        date: concEnd,  extra:`+${concDays} gg fissi` }
    ];

    const elapsed = daysDiff(germ, today);
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / p.harvestMin) * 100)));
    const daysToHarvest = daysDiff(today, harvest);

    const modBtnHTML = `
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick="openPhaseModal(${p.id})" style="background:var(--card2);border:1px solid var(--border);border-radius:20px;padding:5px 12px;color:var(--text2);font-size:12px;cursor:pointer;">✏️ Modifica fase / data raccolta</button>
        ${ovr ? `<button onclick="resetPhaseOverride(${p.id})" style="background:rgba(239,83,80,0.1);border:1px solid rgba(239,83,80,0.3);border-radius:20px;padding:5px 10px;color:var(--red);font-size:11px;cursor:pointer;">↩ Ripristina automatica</button>` : ''}
      </div>`;

    box.innerHTML = `
      <div class="tl-progress-wrap">
        <div class="tl-progress-label">Avanzamento: ${Math.max(0,elapsed)} gg / ${p.harvestMin} gg (${pct}%)${daysToHarvest > 0 ? ' · 🗓️ Taglio tra '+daysToHarvest+' gg' : daysToHarvest === 0 ? ' · ✂️ GIORNO DEL TAGLIO!' : ' · ✅ Taglio passato'}</div>
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
      harvestMinD = addDays(florStartDate, p.harvestMin);
      harvestMaxD = addDays(florStartDate, p.harvestMax);
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

    steps = [
      { dot:'germ', label:'🌱 Germinazione',      date: germ,          extra:'Giorno 0' },
      { dot:'veg',  label:'🌿 Vegetazione',        date: florStartDate, extra:`${vegDays > 0 ? vegDays+' gg fino alla fioritura' : ''}` },
      { dot:'fior', label:'🌸 Inizio Fioritura',   date: florStartDate, extra: sourceLabel },
      { dot:'rec',  label:'✂️ Taglio previsto',    date: harvestMinD,   extra: harvestExtra },
      { dot:'ess',  label:'🌬️ Fine Essiccazione', date: essEnd,        extra:`+${essDays} gg fissi` },
      { dot:'conc', label:'🫙 Fine Concia',        date: concEnd,       extra:`+${concDays} gg fissi` }
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

  // Fase select
  const phaseSelect = document.getElementById('phase-select');
  if (phaseSelect) phaseSelect.value = ovr ? (ovr.currentPhase || 'vegetazione') : 'vegetazione';

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
    harvestStr = addDays(florInfo.date, p.harvestMin).toISOString().slice(0,10);
  }
  if (harvestInput) harvestInput.value = harvestStr;

  modal.classList.add('open');
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
      harvestDate = addDays(germ, p.harvestMin);
    } else {
      const florInfo = getEffectiveFlorStart(p);
      harvestDate = addDays(florInfo.date, p.harvestMin);
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
  }

  if (!alerts.length) { card.style.display = 'none'; return; }

  const iconMap = { RACCOLTA:'🌾', FIORITURA:'🌸', ESSICCAZIONE:'🍂' };
  const cssMap  = { RACCOLTA:'tipo-raccolta', FIORITURA:'tipo-fioritura', ESSICCAZIONE:'tipo-essiccazione' };
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
  let html = '';
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const isPast = s.date < today;
    const isToday = daysDiff(s.date, today) === 0;
    const pastCls = isPast && !isToday ? ' tl-past' : '';
    const todayTag = isToday ? '<span class="tl-today-tag">OGGI</span>' : '';
    html += `<div class="tl-step${pastCls}"><div class="tl-dot tl-dot-${s.dot}"></div><div class="tl-content"><div class="tl-phase">${s.label}${todayTag}</div><div class="tl-date">${fmtDate(s.date)}${s.extra ? ' · <span style="color:var(--text3)">' + s.extra + '</span>' : ''}</div></div></div>`;
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

  // Slider ore di sole — iniettato una sola volta sopra la lista
  const sunSliderHTML = `
    <div class="card" style="margin-bottom:12px;">
      <div class="card-title">☀️ Ore di sole oggi</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px;">
        Indica quante ore di sole ricevono le piante. <strong>Non cambia le date di raccolta</strong> — influenza solo la nota sulla resa attesa.
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

  function renderGroup(label, group) {
    if (!group.length) return '';
    let g = `<div class="plant-group-label">${label}</div>`;
    for (const p of group) {
      const badge = p.type === 'auto'
        ? '<span class="badge badge-green">Attiva</span>'
        : '<span class="badge badge-blue">Veg.</span>';
      g += `
        <div class="plant-card-full" id="plant-${p.id}">
          <div class="plant-card-header">
            <div class="plant-icon">${p.icon || '🌿'}</div>
            <div class="plant-info">
              <div class="plant-name">${p.name} ×${p.id}</div>
              <div class="plant-detail">${p.type === 'auto' ? 'Autofiorente' : 'Femminizzata'} · Raccolta produttore: ${p.harvestMin}${p.harvestMax !== p.harvestMin ? '–'+p.harvestMax : ''} gg${p.type === 'femm' && p.florStart ? ' · Fior. prevista '+new Date(p.florStart).toLocaleDateString('it-IT',{day:'2-digit',month:'short'}) : ''}</div>
            </div>
            ${badge}
            <button class="btn-archive" onclick="openArchiveModal(${p.id})">📦 Archivia</button>
          </div>
          <div class="germ-row">
            <label class="germ-label">🌱 Data germinazione:</label>
            <input type="date" class="germ-input" data-id="${p.id}" value="${p.germDate || ''}" onchange="saveGermDate(${p.id},this.value)" />
          </div>
          <div class="timeline-box" id="tl-${p.id}"></div>
        </div>`;
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

/* ── Render archive ── */
function renderArchive() {
  const archived = loadArchivedPlants();
  const container = document.getElementById('lista-archivio');
  if (!container) return;

  // ── Statistiche riepilogative ──
  const statsCard = document.getElementById('archivio-stats-card');
  if (statsCard) {
    if (archived.length) {
      const withResa = archived.filter(p => p.resa_grammi > 0);
      const resaMedia = withResa.length
        ? Math.round(withResa.reduce((s,p) => s + p.resa_grammi, 0) / withResa.length)
        : null;
      const withDurata = archived.filter(p => p.durata_giorni > 0);
      const durataMedia = withDurata.length
        ? Math.round(withDurata.reduce((s,p) => s + p.durata_giorni, 0) / withDurata.length)
        : null;
      // Varietà più produttiva
      let topPlant = null;
      if (withResa.length) {
        topPlant = withResa.reduce((best, p) => (p.resa_grammi > (best?.resa_grammi||0) ? p : best), null);
      }
      // Metodo più usato
      const metodiMap = {};
      archived.forEach(p => { if (p.metodo) metodiMap[p.metodo] = (metodiMap[p.metodo]||0)+1; });
      const topMetodo = Object.entries(metodiMap).sort((a,b)=>b[1]-a[1])[0];

      statsCard.style.display = 'block';
      statsCard.innerHTML = `
        <div class="card" style="margin-bottom:12px;background:linear-gradient(135deg,rgba(74,175,94,0.1),rgba(58,159,216,0.06));">
          <div class="card-title" style="margin-bottom:10px;">📊 Statistiche Storico</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div style="background:var(--bg3);border-radius:8px;padding:8px 10px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:var(--green3);">${archived.length}</div>
              <div style="font-size:10px;color:var(--text3);">Cicli completati</div>
            </div>
            <div style="background:var(--bg3);border-radius:8px;padding:8px 10px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:var(--green3);">${resaMedia !== null ? resaMedia+'g' : '—'}</div>
              <div style="font-size:10px;color:var(--text3);">Resa media</div>
            </div>
            <div style="background:var(--bg3);border-radius:8px;padding:8px 10px;text-align:center;">
              <div style="font-size:22px;font-weight:800;color:var(--blue);">${durataMedia !== null ? durataMedia+'gg' : '—'}</div>
              <div style="font-size:10px;color:var(--text3);">Durata media ciclo</div>
            </div>
            <div style="background:var(--bg3);border-radius:8px;padding:8px 10px;text-align:center;">
              <div style="font-size:13px;font-weight:700;color:var(--orange);">${topPlant ? (topPlant.icon||'🌿')+' '+topPlant.name : '—'}</div>
              <div style="font-size:10px;color:var(--text3);">Varietà top</div>
            </div>
          </div>
          ${topMetodo ? `<div style="margin-top:8px;font-size:11px;color:var(--text3);text-align:center;">Metodo più usato: <strong style="color:var(--text2);">${topMetodo[0]}</strong> (${topMetodo[1]} cicl${topMetodo[1]===1?'o':'i'})</div>` : ''}
        </div>`;
    } else {
      statsCard.style.display = 'none';
    }
  }

  if (!archived.length) {
    container.innerHTML = `
      <div class="empty-archive" style="text-align:center;padding:40px 20px;color:var(--text3);">
        <div style="font-size:48px;margin-bottom:12px;">📦</div>
        <div style="font-size:14px;font-weight:600;color:var(--text2);margin-bottom:6px;">Nessun ciclo archiviato</div>
        <div style="font-size:12px;line-height:1.6;">Quando archivi una pianta, il ciclo completo<br>appare qui con tutte le statistiche.</div>
      </div>`;
    return;
  }

  // Ordine cronologico inverso
  const list = archived.slice().reverse();
  let html = '';
  for (const p of list) {
    const archDate = p.archivedAt
      ? new Date(p.archivedAt).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'})
      : '—';
    const germFmt = p.germDate
      ? new Date(p.germDate).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'})
      : '—';
    const raccFmt = p.data_raccolta
      ? new Date(p.data_raccolta).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'})
      : '—';

    // Badge qualità in base alle stelle
    const stelle = p.stelle || 0;
    let badgeCls = '', badgeTxt = '';
    if (stelle >= 5)      { badgeCls = 'background:rgba(74,175,94,0.2);color:var(--green3);border:1px solid rgba(74,175,94,0.4)'; badgeTxt = '🏆 Ottimo'; }
    else if (stelle >= 3) { badgeCls = 'background:rgba(255,193,7,0.15);color:#ffd54f;border:1px solid rgba(255,193,7,0.3)';      badgeTxt = '⭐ Buono'; }
    else if (stelle >= 1) { badgeCls = 'background:rgba(239,83,80,0.12);color:#ef9a9a;border:1px solid rgba(239,83,80,0.3)';      badgeTxt = '⚠️ Da migliorare'; }
    else                  { badgeCls = 'background:var(--card2);color:var(--text3);border:1px solid var(--border)';               badgeTxt = '📦 Archiviato'; }

    // Stelle render
    const stelleHtml = stelle > 0
      ? Array.from({length:5}, (_,i) => `<span style="color:${i<stelle?'#ffd54f':'var(--border)'}">★</span>`).join('')
      : '<span style="color:var(--text3);font-size:11px;">Non valutato</span>';

    // Esperimenti
    const espHtml = (p.esperimenti_attivi && p.esperimenti_attivi.length)
      ? p.esperimenti_attivi.map(e => `<span style="background:rgba(58,159,216,0.12);border-radius:5px;padding:2px 7px;font-size:10px;color:var(--blue);">${e}</span>`).join(' ')
      : '<span style="color:var(--text3);font-size:11px;">Nessuno</span>';

    // Problemi collassabili
    const problemiId = `prob-${p.id}-${p.archivedAt ? p.archivedAt.slice(0,10) : 'x'}`;
    const problemiHtml = p.problemi
      ? `<div style="margin-top:6px;">
           <div onclick="document.getElementById('${problemiId}').style.display=document.getElementById('${problemiId}').style.display==='none'?'block':'none'"
             style="font-size:11px;color:var(--orange);cursor:pointer;font-weight:600;">
             ⚠️ Problemi riscontrati ▾
           </div>
           <div id="${problemiId}" style="display:none;margin-top:4px;font-size:11px;color:var(--text2);line-height:1.5;padding:6px 8px;background:var(--bg3);border-radius:6px;">
             ${p.problemi}
           </div>
         </div>`
      : '';

    html += `
      <div class="archive-card" style="margin-bottom:10px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--card2);padding:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="font-size:24px;">${p.icon || '🌿'}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:14px;font-weight:700;color:var(--text);">${p.name} ×${p.id}</div>
            <div style="font-size:11px;color:var(--text3);">${p.type === 'auto' ? 'Autofiorente' : 'Femminizzata'}</div>
          </div>
          <div style="border-radius:20px;padding:3px 9px;font-size:11px;font-weight:600;${badgeCls}">${badgeTxt}</div>
        </div>

        <!-- Stelle -->
        <div style="font-size:18px;margin-bottom:8px;">${stelleHtml}</div>

        <!-- Timeline ciclo -->
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);margin-bottom:8px;flex-wrap:wrap;">
          <span>🌱 ${germFmt}</span>
          <span style="color:var(--border);">→</span>
          <span>✂️ ${raccFmt}</span>
          ${p.durata_giorni ? `<span style="color:var(--border);">·</span><span style="color:var(--green3);font-weight:600;">${p.durata_giorni} giorni</span>` : ''}
        </div>

        <!-- Resa + Metodo -->
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          ${p.resa_grammi ? `<div style="background:rgba(74,175,94,0.1);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:700;color:var(--green3);">💚 ${p.resa_grammi}g</div>` : ''}
          ${p.metodo ? `<div style="background:var(--bg3);border-radius:7px;padding:4px 10px;font-size:12px;color:var(--text2);">🔧 ${p.metodo}</div>` : ''}
        </div>

        <!-- Esperimenti -->
        <div style="margin-bottom:6px;">
          <div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">⚡ ESPERIMENTI</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">${espHtml}</div>
        </div>

        <!-- Problemi collassabili -->
        ${problemiHtml}

        <!-- Note -->
        ${p.notes ? `<div style="margin-top:6px;font-size:11px;color:var(--text2);line-height:1.5;border-top:1px solid var(--border);padding-top:6px;">💬 ${p.notes}</div>` : ''}

        <div style="margin-top:6px;font-size:10px;color:var(--text3);">📦 Archiviata il ${archDate}</div>
      </div>`;
  }
  container.innerHTML = html;
}

/* ── Sync da GitHub: carica storico_cicli e mostra cicli remoti non in locale ── */
async function archivioSync() {
  const btn = document.getElementById('btn-archivio-sync');
  if (btn) { btn.textContent = '⏳ Sincronizzazione…'; btn.disabled = true; }
  try {
    const data = await fetchGHJson('data/esperimenti.json');
    if (!data || !data.storico_cicli || !data.storico_cicli.length) {
      _archivioToast('☁️ Nessun ciclo remoto trovato');
      if (btn) { btn.textContent = '☁️ Sincronizza da GitHub'; btn.disabled = false; }
      return;
    }

    // Cache per mostrarli nella lista
    localStorage.setItem('bioserra_storico_gh_cache', JSON.stringify(data.storico_cicli));

    // Deduplicazione: non aggiungere cicli già in locale
    const local = loadArchivedPlants();
    const localKeys = new Set(local.map(p => `${p.id}_${p.data_raccolta || p.archivedAt?.slice(0,10)}`));

    const remoti = data.storico_cicli.filter(s => {
      const k = `${s.id_pianta}_${s.raccolta}`;
      return !localKeys.has(k);
    });

    if (remoti.length) {
      // Converti formato remoto → formato locale e aggiungi
      const toAdd = remoti.map(s => ({
        id: s.id_pianta,
        name: s.nome,
        type: s.tipo === 'autofiorente' ? 'auto' : 'femm',
        icon: '☁️',
        germDate: s.germinazione,
        data_raccolta: s.raccolta,
        durata_giorni: s.durata_giorni,
        resa_grammi: s.resa_grammi,
        metodo: s.metodo,
        stelle: s.stelle,
        problemi: s.problemi,
        esperimenti_attivi: s.esperimenti_attivi || [],
        notes: s.note,
        harvestMin: 0, harvestMax: 0,
        archivedAt: s.data_archiviazione ? s.data_archiviazione + 'T00:00:00.000Z' : new Date().toISOString(),
        fromGitHub: true
      }));
      local.push(...toAdd);
      saveArchivedPlants(local);
      _archivioToast(`☁️ ${remoti.length} ciclo${remoti.length>1?'i':''} importato${remoti.length>1?'i':''} da GitHub`);
    } else {
      _archivioToast('☁️ Già sincronizzato — nessun ciclo nuovo');
    }
    renderArchive();
  } catch(e) {
    _archivioToast('⚠️ Errore sync: ' + (e.message || 'rete'));
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

/* ── Modal: Archivia Pianta ── */
function openArchiveModal(id) {
  const plants = loadActivePlants();
  const p = plants.find(p => p.id === id);
  if (!p) return;
  document.getElementById('archive-plant-id').value = id;
  document.getElementById('archive-plant-name').textContent = `${p.icon || '🌿'} ${p.name} ×${p.id}`;
  // Reset campi
  document.getElementById('archive-notes').value = '';
  document.getElementById('archive-resa').value = '';
  document.getElementById('archive-metodo').value = 'Naturale';
  document.getElementById('archive-problemi').value = '';
  document.getElementById('archive-stelle').value = '0';
  archiveSetStelle(0);
  // Precompila esperimenti attivi da localStorage
  try {
    const espJson = localStorage.getItem('bioserra_esp_attivi');
    const espAttivi = espJson ? JSON.parse(espJson) : null;
    const espEl = document.getElementById('archive-esperimenti');
    if (espAttivi && Array.isArray(espAttivi) && espAttivi.length) {
      espEl.value = espAttivi.map(e => e.nome || e.name || e).join(', ');
    } else if (espAttivi && typeof espAttivi === 'string') {
      espEl.value = espAttivi;
    } else {
      // Prova a leggere da esperimenti.json cached
      const espCache = localStorage.getItem('bioserra_esperimenti_cache');
      if (espCache) {
        try {
          const ec = JSON.parse(espCache);
          const attivi = (ec.esperimenti_attivi || ec.attivi || []).map(e => e.nome || e.name || e).filter(Boolean);
          espEl.value = attivi.join(', ');
        } catch(e2) { espEl.value = ''; }
      } else {
        espEl.value = '';
      }
    }
  } catch(e) {
    document.getElementById('archive-esperimenti').value = '';
  }
  document.getElementById('modal-archive-plant').classList.add('open');
}

function archiveSetStelle(n) {
  document.getElementById('archive-stelle').value = n;
  document.querySelectorAll('.star-btn').forEach(btn => {
    const s = parseInt(btn.dataset.s);
    btn.style.color = s <= n ? '#ffd54f' : 'var(--text3)';
    btn.style.fontSize = s <= n ? '24px' : '20px';
    btn.style.background = 'none';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.padding = '0 2px';
    btn.style.transition = 'all 0.15s';
  });
}

function closeArchiveModal(e) {
  if (!e || e.target === document.getElementById('modal-archive-plant')) {
    document.getElementById('modal-archive-plant').classList.remove('open');
  }
}
function confirmArchive() {
  const id = parseInt(document.getElementById('archive-plant-id').value);
  const notes      = document.getElementById('archive-notes').value.trim();
  const resa       = parseInt(document.getElementById('archive-resa').value) || 0;
  const metodo     = document.getElementById('archive-metodo').value;
  const stelle     = parseInt(document.getElementById('archive-stelle').value) || 0;
  const problemi   = document.getElementById('archive-problemi').value.trim();
  const espTxt     = document.getElementById('archive-esperimenti').value.trim();
  const esperimenti = espTxt ? espTxt.split(',').map(s => s.trim()).filter(Boolean) : [];

  const plants = loadActivePlants();
  const idx = plants.findIndex(p => p.id === id);
  if (idx === -1) return;
  const plant = { ...plants[idx] };

  // Calcola durata effettiva in giorni
  const today = new Date().toISOString().slice(0,10);
  let durata = null;
  if (plant.germDate) {
    durata = daysDiff(new Date(plant.germDate), new Date(today));
  }

  // Override raccolto: usa harvestDate da phase override se esiste
  const ovr = loadPlantPhaseOverride(id);
  const dataRaccolta = (ovr && ovr.harvestDate) ? ovr.harvestDate : today;

  // Arricchisci l'oggetto pianta con i dati del ciclo
  plant.notes         = notes;
  plant.resa_grammi   = resa;
  plant.metodo        = metodo;
  plant.stelle        = stelle;
  plant.problemi      = problemi;
  plant.esperimenti_attivi = esperimenti;
  plant.data_raccolta = dataRaccolta;
  plant.durata_giorni = durata;
  plant.archivedAt    = new Date().toISOString();

  // Salva in localStorage
  const archived = loadArchivedPlants();
  archived.push(plant);
  saveArchivedPlants(archived);
  plants.splice(idx, 1);
  saveActivePlants(plants);

  // Chiudi modal e aggiorna UI
  document.getElementById('modal-archive-plant').classList.remove('open');
  renderActivePlants();

  // Sync GitHub (silenzioso, non-bloccante)
  _archivioSyncGitHub(plant, dataRaccolta, durata, esperimenti);
}

/* ── Sync GitHub: aggiunge voce a esperimenti.json → storico_cicli ── */
const GH_TOKEN  = ['ghp_dtR2oWiOCz8XGENXd2uTmrj40Nj', '8As1xVqMD'].join('');
const GH_REPO   = 'francescocaruso487-tech/bioserra';
const ESP_FILE  = 'data/esperimenti.json';

async function _archivioSyncGitHub(plant, dataRaccolta, durata, esperimenti) {
  try {
    // 1. Leggi SHA e contenuto attuale
    const metaRes = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${ESP_FILE}`, {
      headers: { 'Authorization': 'token ' + GH_TOKEN }
    });
    let currentContent = {};
    let sha = null;
    if (metaRes.ok) {
      const meta = await metaRes.json();
      sha = meta.sha;
      try { currentContent = JSON.parse(atob(meta.content.replace(/\n/g,''))); } catch(e) { currentContent = {}; }
    }

    // 2. Prepara voce storico
    const voce = {
      id_pianta:        plant.id,
      nome:             plant.name,
      tipo:             plant.type === 'auto' ? 'autofiorente' : 'femminizzata',
      germinazione:     plant.germDate || null,
      raccolta:         dataRaccolta,
      durata_giorni:    durata,
      resa_grammi:      plant.resa_grammi,
      metodo:           plant.metodo,
      stelle:           plant.stelle,
      problemi:         plant.problemi,
      esperimenti_attivi: esperimenti,
      note:             plant.notes,
      data_archiviazione: new Date().toISOString().slice(0,10)
    };

    // 3. Aggiungi allo storico
    if (!currentContent.storico_cicli) currentContent.storico_cicli = [];
    // Deduplicazione per id+raccolta
    currentContent.storico_cicli = currentContent.storico_cicli.filter(
      s => !(s.id_pianta === voce.id_pianta && s.raccolta === voce.raccolta)
    );
    currentContent.storico_cicli.push(voce);
    currentContent.last_updated = new Date().toISOString();

    // 4. PUT su GitHub
    const body = {
      message: `Archivia ${plant.name} (ID:${plant.id}) · ${dataRaccolta}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(currentContent, null, 2)))),
      branch: 'main'
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(`https://api.github.com/repos/${GH_REPO}/contents/${ESP_FILE}`, {
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + GH_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (putRes.ok) {
      _archivioToast('☁️ Ciclo sincronizzato su GitHub');
    }
  } catch(e) {
    // Fail silenzioso — l'archiviazione locale è già avvenuta
    console.warn('[BioSerra] Sync GitHub archivio fallito:', e.message);
  }
}

function _archivioToast(msg) {
  let t = document.getElementById('archivio-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'archivio-toast';
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--card2);border:1px solid var(--border);border-radius:20px;padding:8px 18px;font-size:13px;color:var(--text);z-index:9999;pointer-events:none;transition:opacity .4s;white-space:nowrap;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._to);
  t._to = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

/* ── Init ── */
function initPiante() {
  var stored = null;
  try { stored = localStorage.getItem('bioserra_active_plants'); } catch(e) {}
  if (!stored) {
    try { localStorage.setItem('bioserra_active_plants', JSON.stringify(DEFAULT_PLANTS)); } catch(e) {}
  }
  renderActivePlants();
  checkHarvestAlerts();
}


/* ══════════════════════════════════════════════════════════════
   AI CHAT — Groq Llama3 (sempre attivo, zero config)
══════════════════════════════════════════════════════════════ */

const PIANTE_CTX = 'Autofiorenti: Epsilon F1(ID:7,germ 21/04,taglio 20/06), Milky Way(ID:1,germ 23/04,taglio 22/07), Titan(ID:2,germ 22/04,taglio 21/07), Medusa(ID:3,germ 21/04,taglio 20/07), Gaia(ID:8,germ 21/04,taglio 15/07). Femminizzate: Astro Lemonade(ID:4,taglio 30/10), Cosmic Cheddar(ID:11,taglio 30/10), Orbital Banana(ID:6,taglio 30/10), Royal Gorilla(ID:10,taglio 09/11), Mexican Rush(ID:9,taglio 09/11).';
const MANUALE_CTX = 'Serra Living Soil: 10 vasi 10L, substrato BioBizz+cocco+SuperSoil+Humus+micorrize. Additivi: Melassa 1ml/L ogni 15gg; Miscela organica 1 cucchiaio/vaso/mese; Infuso ortiche 1:10 ogni mese; Te banana+cenere ogni 2 sett da mese 5; Etilene mesi 7-8. Esperimenti: elettrocultura, Lakhovsky, pila galvanica Fe-Cu, acqua magnetizzata, Pantacle rame.';

const _GK = ['gsk_4WWWCiu82jj6fg9','gsYCNWGdyb3FYyb8Ndg1','gHyT6a7BwK8dFofZ8'].join('');
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_FALLBACK = 'llama3-8b-8192';

let aiHistory = [];
let aiDailyCache = { date: '', text: '' };

function buildSystem() {
  const oggi = new Date().toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  return 'Sei BioSerra AI, assistente esperto di coltivazione Living Soil biologica.' +
    ' Oggi: ' + oggi + '.' +
    ' Piante: ' + PIANTE_CTX +
    ' Manuale: ' + MANUALE_CTX +
    ' Rispondi SEMPRE in italiano, conciso e pratico. Usa emoji per i punti chiave.';
}

/* ─── Chiamata Groq con fallback automatico ─── */
async function callGroq(messages, model) {
  model = model || GROQ_MODEL;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + _GK
    },
    body: JSON.stringify({ model: model, max_tokens: 800, messages: messages, temperature: 0.7 })
  });
  const data = await res.json();
  // Se il modello è dismesso, riprova con il fallback
  if (data.error) {
    const msg = data.error.message || '';
    if ((msg.includes('decommissioned') || msg.includes('deprecated')) && model !== GROQ_FALLBACK) {
      return callGroq(messages, GROQ_FALLBACK);
    }
    throw new Error(msg || 'Errore Groq');
  }
  return data.choices?.[0]?.message?.content || 'Nessuna risposta.';
}

/* ─── Consigli giornalieri dinamici ─── */
async function aiGenerateDaily() {
  const dc  = document.getElementById('ai-daily-content');
  const dm  = document.getElementById('ai-daily-meta');
  const btn = document.getElementById('ai-daily-refresh');
  if (!dc) return;
  if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
  dc.textContent = '⏳ Analisi in corso…';

  const oggi = new Date().toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'});
  const msgs = [
    { role: 'system', content: buildSystem() },
    { role: 'user', content:
      'Analizza la mia serra oggi (' + oggi + ') e dammi:\n' +
      '1) Le 2-3 azioni PIÙ URGENTI da fare oggi\n' +
      '2) Una cosa da controllare questa settimana\n' +
      '3) La pianta che merita più attenzione in questo momento\n' +
      'Max 120 parole. Sii diretto e usa emoji.'
    }
  ];

  try {
    const reply = await callGroq(msgs);
    dc.textContent = reply;
    const today = new Date().toISOString().slice(0, 10);
    aiDailyCache = { date: today, text: reply };
    if (dm) dm.textContent = 'Aggiornato alle ' + new Date().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
  } catch(e) {
    dc.textContent = '⚠️ ' + (e.message || 'Errore di connessione. Riprova.');
  }
  if (btn) { btn.textContent = '🔄 Aggiorna'; btn.disabled = false; }
}

/* ─── Chat principale ─── */
async function aiSend() {
  const input = document.getElementById('ai-input');
  const msg = (input.value || '').trim();
  if (!msg) return;
  input.value = '';
  appendMsg(msg, 'user');
  aiHistory.push({ role: 'user', content: msg });
  const loading = appendMsg('⚡ Groq elabora…', 'bot loading');
  try {
    const msgs = [
      { role: 'system', content: buildSystem() },
      ...aiHistory.slice(0, -1),
      { role: 'user', content: msg }
    ];
    const reply = await callGroq(msgs);
    loading.className = 'ai-msg bot';
    loading.textContent = reply;
    aiHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    loading.className = 'ai-msg bot';
    loading.textContent = '⚠️ ' + (e.message || 'Errore. Riprova tra un momento.');
  }
  document.getElementById('ai-chat').scrollTop = 99999;
}

function aiQuick(msg) {
  document.getElementById('ai-input').value = msg;
  aiSend();
}

/* ─── Init sezione AI ─── */
function aiInitUI() {
  const chat = document.getElementById('ai-chat');
  if (chat && chat.children.length === 0) {
    appendMsg('⚡ BioSerra AI pronto — Groq Llama3 attivo!\n\nChiedimi qualsiasi cosa sulle tue 10 piante, oppure premi uno dei bottoni rapidi!', 'bot');
  }
  // Genera analisi giornaliera se non già fatto oggi
  const today = new Date().toISOString().slice(0, 10);
  const dc = document.getElementById('ai-daily-content');
  if (aiDailyCache.date === today && aiDailyCache.text) {
    if (dc) dc.textContent = aiDailyCache.text;
  } else {
    aiGenerateDaily();
  }
}

function appendMsg(text, cls) {
  const chat = document.getElementById('ai-chat');
  const div = document.createElement('div');
  div.className = 'ai-msg ' + cls;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = 99999;
  return div;
}

function updateCfgKeyStatus() {}

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

/* Aggiunge una tecnica trovata dall'AI PDF a elTecnicheExtra */
function manAggiungeTecnica(idx) {
  var techs = window._pdf_tecniche || [];
  var t = techs[idx];
  if (!t) return;
  var newTech = { id: 'ai_' + Date.now(), nome: t.nome || 'Tecnica AI', desc: t.desc || t.descrizione || '', istruzioni: t.istruzioni || '', badge: 'AI PDF', lunaConsigl: [] };
  var exists = elTecnicheExtra.find(function(e){ return e.nome === newTech.nome; });
  if (exists) { alert('Questa tecnica è già presente'); return; }
  elTecnicheExtra.push(newTech);
  renderElTecnicheExtra();
  elUpdateStats();
  alert('✅ Tecnica aggiunta! Vai alla tab Tecniche per attivarla.');
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
  // loadPianteJSON viene chiamata solo dal bottone "Aggiorna" nel panel JSON
  // NON all'avvio: gli alert piante sono gestiti localmente da checkHarvestAlerts()
  loadManualiJSON();
}

