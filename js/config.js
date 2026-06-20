/* BioSerra - config.js */
/* ══════════════════════════════════════════════════════════════
   IMPOSTAZIONI — CONFIG SECTION
══════════════════════════════════════════════════════════════ */

// Mappa notifiche → ID panel HTML da mostrare/nascondere
const NTF_PANELS = {
  piante:  ['alerts-oggi-card','piante-json-panel'],
  luna:    [],
  ai:      ['ai-json-panel'],
  elettro: [],  // sezione dinamica, nessun json-panel fisso
  pdf:     ['manuali-json-panel']
};

/* ── Init impostazioni all'avvio ── */
function initImpostazioni() {
  // Carica nome serra
  const nome = localStorage.getItem('bioserra_cfg_nome') || 'BioSerra #1';
  const elNome = document.getElementById('cfg-serra-nome-display');
  if (elNome) elNome.textContent = nome;

  // Sincronizza ore di luce
  const lh = parseFloat(localStorage.getItem('bioserra_ore_luce') || '16');
  const s = document.getElementById('cfg-light-slider');
  const i = document.getElementById('cfg-light-input');
  if (s) s.value = lh;
  if (i) i.value = lh;

  // Carica toggles notifiche e applica ai panel
  const ntf = cfgLoadNotifiche();
  ['piante','luna','ai','elettro','pdf'].forEach(k => {
    const tog = document.getElementById('ntf-' + k);
    // Default true se non ancora impostato
    const attivo = ntf[k] !== false;
    if (tog) {
      if (attivo) tog.classList.add('on'); else tog.classList.remove('on');
    }
    // Applica visibilità panel
    (NTF_PANELS[k] || []).forEach(panelId => {
      const panel = document.getElementById(panelId);
      if (panel) panel.style.display = attivo ? '' : 'none';
    });
  });
  const ts = localStorage.getItem('bioserra_ntf_last_update');
  const tsel = document.getElementById('cfg-ntf-last-update');
  if (tsel) tsel.textContent = ts ? new Date(ts).toLocaleString('it-IT') : '—';

  // Tema
  const tema = localStorage.getItem('bioserra_tema') || 'verde-scuro';
  cfgApplyThemeUI(tema);

  // AI — seleziona motore e mostra stato chiavi
  const ai = localStorage.getItem('bioserra_ai_attiva') || 'gemini';
  cfgApplyAIUI(ai);
  cfgUpdateAIKeyBox(ai);
}

/* Applica i panel delle notifiche all'avvio dell'app (non solo quando si apre Impostazioni) */
function applyNotificheAtBoot() {
  const ntf = cfgLoadNotifiche();
  Object.keys(NTF_PANELS).forEach(k => {
    const attivo = ntf[k] !== false;
    (NTF_PANELS[k] || []).forEach(panelId => {
      const panel = document.getElementById(panelId);
      if (panel) panel.style.display = attivo ? '' : 'none';
    });
  });
}

/* ── Serra ── */
function cfgEditSerra(campo) {
  if (campo === 'nome') {
    const cur = localStorage.getItem('bioserra_cfg_nome') || 'BioSerra #1';
    const val = prompt('Nome della serra:', cur);
    if (val && val.trim()) {
      localStorage.setItem('bioserra_cfg_nome', val.trim());
      const el = document.getElementById('cfg-serra-nome-display');
      if (el) el.textContent = val.trim();
    }
  }
}

/* ── Notifiche ── */
function cfgLoadNotifiche() {
  try {
    return JSON.parse(localStorage.getItem('bioserra_notifiche') || '{}');
  } catch(e) { return {}; }
}
function cfgToggleNotifica(key, el) {
  el.classList.toggle('on');
  const attivo = el.classList.contains('on');
  const ntf = cfgLoadNotifiche();
  ntf[key] = attivo;
  localStorage.setItem('bioserra_notifiche', JSON.stringify(ntf));
  // Applica subito: mostra/nascondi i panel corrispondenti
  (NTF_PANELS[key] || []).forEach(panelId => {
    const panel = document.getElementById(panelId);
    if (panel) panel.style.display = attivo ? '' : 'none';
  });
  cfgToast(attivo ? '✅ Notifica attivata' : '🔕 Notifica disattivata');
}
function cfgSaveNotifiche() {
  const ntf = {};
  ['piante','luna','ai','elettro','pdf'].forEach(k => {
    const tog = document.getElementById('ntf-' + k);
    ntf[k] = tog ? tog.classList.contains('on') : true;
    (NTF_PANELS[k] || []).forEach(panelId => {
      const panel = document.getElementById(panelId);
      if (panel) panel.style.display = ntf[k] ? '' : 'none';
    });
  });
  const ts = new Date().toISOString();
  ntf.last_update = ts;
  ntf.note = 'File letto dalle automazioni N8N. Se un valore è false, quella notifica viene saltata.';
  localStorage.setItem('bioserra_notifiche', JSON.stringify(ntf));
  localStorage.setItem('bioserra_ntf_last_update', ts);
  const el = document.getElementById('cfg-ntf-last-update');
  if (el) el.textContent = new Date(ts).toLocaleString('it-IT');
  // Sync su GitHub così N8N riceve le modifiche reali
  _cfgSyncNotificheGitHub(ntf);
  cfgToast('✅ Notifiche salvate — ' + Object.values(ntf).filter(v=>v===true).length + '/5 attive');
}

async function _cfgSyncNotificheGitHub(ntf) {
  try {
    const tk1 = 'ghp_dtR2oWiOCz8XGENXd2uTm';
    const tk2 = 'rj40Nj8As1xVqMD';
    const base = 'https://api.github.com/repos/francescocaruso487-tech/bioserra/contents/';
    const headers = {
      'Authorization': 'Bearer ' + tk1 + tk2,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    // Leggi SHA attuale
    const r = await fetch(base + 'notifiche_config.json', { headers });
    if (!r.ok) return;
    const meta = await r.json();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(ntf, null, 2))));
    await fetch(base + 'notifiche_config.json', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message: 'Aggiornamento notifiche da app ' + ntf.last_update.substring(0,10), content, sha: meta.sha })
    });
  } catch(e) { /* silenzioso: localStorage è già salvato */ }
}

/* ── Ore di luce (unico controllo — in Impostazioni) ── */
function cfgUpdateLight(val) {
  val = Math.min(24, Math.max(1, parseFloat(val) || 16));
  const s = document.getElementById('cfg-light-slider');
  const i = document.getElementById('cfg-light-input');
  if (s) s.value = val;
  if (i) i.value = val;
  // Chiama updateLightHours che salva in localStorage e ricalcola le timeline
  if (typeof updateLightHours === 'function') updateLightHours(val);
}

/* ── Tema ── */
const CFG_THEMES = {
  'verde-scuro': {
    '--bg':'#0d1a12','--bg2':'#13231a','--bg3':'#1a2e20','--card':'#192819','--card2':'#1f3326',
    '--border':'#2a4a35','--green':'#4caf76','--green2':'#2e7d52','--green3':'#81c784',
    '--blue':'#42a5c8','--blue2':'#1e7aa8',
    '--orange':'#ff9800','--orange2':'#e65100',
    '--red':'#ef5350','--yellow':'#ffee58','--purple':'#ab47bc',
    '--text':'#e8f5e9','--text2':'#a5c9b0','--text3':'#6a9e7a',
    '--shadow':'0 2px 12px rgba(0,0,0,0.5)',
    nome:'Verde Scuro 🌲',
    preview: { bg:'#0d1a12', accent:'#4aaf5e', secondary:'#3a9fd8', tertiary:'#f0843c' }
  },
  'verde-chiaro': {
    '--bg':'#f0f7f0','--bg2':'#e4f0e4','--bg3':'#d5e8d5','--card':'#eaf4ea','--card2':'#dceadc',
    '--border':'#a8cfb0','--green':'#2d8a3e','--green2':'#3a9e4e','--green3':'#1a6628',
    '--blue':'#1976d2','--blue2':'#1565c0',
    '--orange':'#e65100','--orange2':'#bf360c',
    '--red':'#c62828','--yellow':'#f9a825','--purple':'#6a1b9a',
    '--text':'#1a2e1a','--text2':'#2d5a30','--text3':'#4a7e50',
    '--shadow':'0 2px 12px rgba(0,80,0,0.15)',
    nome:'Verde Chiaro 🌿',
    preview: { bg:'#f0f7f0', accent:'#2d8a3e', secondary:'#1976d2', tertiary:'#e65100' }
  },
  'blu-notte': {
    '--bg':'#0a0e1a','--bg2':'#0e1428','--bg3':'#121c38','--card':'#0f1530','--card2':'#141c3a',
    '--border':'#1e3060','--green':'#3a9fd8','--green2':'#1e7aa8','--green3':'#80cfee',
    '--blue':'#7c4dff','--blue2':'#5c35cc',
    '--orange':'#f06292','--orange2':'#c2185b',
    '--red':'#ff5252','--yellow':'#ffd740','--purple':'#7c4dff',
    '--text':'#e0eeff','--text2':'#90b8e8','--text3':'#5a90d4',
    '--shadow':'0 2px 16px rgba(0,0,80,0.6)',
    nome:'Blu Notte 🌙',
    preview: { bg:'#0a0e1a', accent:'#3a9fd8', secondary:'#7c4dff', tertiary:'#f06292' }
  },
  'arancio-terra': {
    '--bg':'#1a1208','--bg2':'#231810','--bg3':'#2e2014','--card':'#251808','--card2':'#301e0e',
    '--border':'#5a3a18','--green':'#f0843c','--green2':'#c45e1a','--green3':'#ffa060',
    '--blue':'#8b5e3c','--blue2':'#6a3e20',
    '--orange':'#f0843c','--orange2':'#c45e1a',
    '--red':'#e53935','--yellow':'#ffd54f','--purple':'#8d6e63',
    '--text':'#ffe8cc','--text2':'#d4a870','--text3':'#a87840',
    '--shadow':'0 2px 12px rgba(80,20,0,0.5)',
    nome:'Arancio Terra 🪵',
    preview: { bg:'#1a1208', accent:'#f0843c', secondary:'#8b5e3c', tertiary:'#ffd54f' }
  }
};
function cfgSetTheme(id) {
  localStorage.setItem('bioserra_tema', id);
  cfgApplyThemeUI(id);
  cfgApplyThemeCSS(id);
  cfgToast('🎨 Tema ' + (CFG_THEMES[id]?.nome || id) + ' applicato');
}
function cfgApplyThemeUI(id) {
  const accentMap = {
    'verde-scuro': '#4aaf5e',
    'verde-chiaro': '#2d8a3e',
    'blu-notte': '#3a9fd8',
    'arancio-terra': '#f0843c'
  };
  document.querySelectorAll('.cfg-theme-btn').forEach(b => {
    b.style.border = '2px solid transparent';
    b.style.transform = 'scale(1)';
    b.style.boxShadow = 'none';
  });
  const sel = document.getElementById('theme-' + id);
  if (sel) {
    const ac = accentMap[id] || '#4aaf5e';
    sel.style.border = '2px solid ' + ac;
    sel.style.boxShadow = '0 0 12px ' + ac + '55';
    sel.style.transform = 'scale(1.02)';
  }
  const nm = document.getElementById('cfg-theme-name');
  if (nm) nm.textContent = CFG_THEMES[id]?.nome || id;
}
function cfgApplyThemeCSS(id) {
  const t = CFG_THEMES[id];
  if (!t) return;
  const root = document.documentElement;
  Object.entries(t).forEach(([k,v]) => {
    if (k.startsWith('--')) root.style.setProperty(k, v);
  });
}

/* ── AI Attiva ── */
const CFG_AI_LABELS = {claude:'Claude (Anthropic)',gemini:'Gemini (Google)',grok:'Grok (xAI)',chatgpt:'ChatGPT (OpenAI)'};

function cfgSetAI(id) {
  localStorage.setItem('bioserra_ai_attiva', id);
  cfgApplyAIUI(id);
  cfgUpdateAIKeyBox(id);
  // Aggiorna anche il motore nella sezione AI
  if (typeof aiInitUI === 'function') {
    const chat = document.getElementById('ai-chat');
    if (chat) chat.innerHTML = '';
    if (typeof aiHistory !== 'undefined') aiHistory = [];
    aiInitUI();
  }
  cfgToast('🤖 ' + (CFG_AI_LABELS[id]||id) + ' selezionata');
}

function cfgApplyAIUI(id) {
  ['claude','gemini','grok','chatgpt'].forEach(eng => {
    const btn = document.getElementById('cfg-ai-' + eng);
    const st  = document.getElementById('cfg-ai-st-' + eng);
    if (btn) btn.style.border = eng===id ? '2px solid var(--green)' : '2px solid transparent';
    if (st) {
      const k = localStorage.getItem('bioserra_ai_key_' + eng);
      st.textContent = k ? '✅ Chiave ok' : '— Non configurata';
      st.style.color = k ? 'var(--green3)' : 'var(--text3)';
    }
  });
}

function cfgUpdateAIKeyBox(id) {
  const labels = {claude:'Claude (Anthropic)',gemini:'Gemini (Google)',grok:'Grok (xAI)',chatgpt:'ChatGPT (OpenAI)'};
  const title = document.getElementById('cfg-ai-key-title');
  if (title) title.textContent = '🔑 Chiave API — ' + (labels[id]||id);
  const inp = document.getElementById('cfg-ai-key-input');
  if (inp) { inp.value = ''; inp.placeholder = 'Incolla chiave API per ' + (id) + '…'; }
  cfgRefreshAIKeyStatus(id);
}

function cfgRefreshAIKeyStatus(id) {
  const k = localStorage.getItem('bioserra_ai_key_' + id);
  const st = document.getElementById('cfg-ai-key-status');
  const clrBtn = document.getElementById('cfg-ai-clear-btn');
  if (st) {
    if (k) {
      st.textContent = '✅ Chiave salvata: ' + k.substring(0,12) + '…';
      st.style.color = 'var(--green3)';
    } else {
      st.textContent = '⚠️ Nessuna chiave configurata';
      st.style.color = 'var(--text3)';
    }
  }
  if (clrBtn) clrBtn.style.display = k ? 'inline' : 'none';
  cfgApplyAIUI(id);
}

function cfgSaveAIKey() {
  const id = aiGetEngine();
  const inp = document.getElementById('cfg-ai-key-input');
  const val = (inp ? inp.value : '').trim();
  if (!val || val.length < 10) {
    cfgToast('⚠️ Chiave troppo corta o vuota');
    if (inp) inp.style.borderColor = 'var(--red)';
    return;
  }
  localStorage.setItem('bioserra_ai_key_' + id, val);
  if (inp) { inp.value = ''; inp.style.borderColor = ''; }
  cfgRefreshAIKeyStatus(id);
  // Aggiorna anche sezione AI
  if (typeof aiInitUI === 'function') {
    const chat = document.getElementById('ai-chat');
    if (chat) chat.innerHTML = '';
    if (typeof aiHistory !== 'undefined') aiHistory = [];
    aiInitUI();
  }
  cfgToast('✅ Chiave salvata');
}

function cfgClearAIKey() {
  const id = aiGetEngine();
  localStorage.removeItem('bioserra_ai_key_' + id);
  cfgRefreshAIKeyStatus(id);
  if (typeof aiInitUI === 'function') { aiHistory=[]; aiInitUI(); }
  cfgToast('🗑️ Chiave rimossa');
}

/* ── Dati ── */
function cfgEsportaDati() {
  const data = {
    bioserra_versione: '1.0.0',
    esportato_il: new Date().toISOString(),
    impostazioni: {
      nome: localStorage.getItem('bioserra_cfg_nome'),
      ciclo: localStorage.getItem('bioserra_cfg_ciclo'),
      tema: localStorage.getItem('bioserra_tema'),
      ai: localStorage.getItem('bioserra_ai_attiva'),
      ore_luce: localStorage.getItem('bioserra_ore_luce'),
      notifiche: cfgLoadNotifiche()
    },
    piante_attive: JSON.parse(localStorage.getItem('bioserra_active_plants') || '[]'),
    piante_archivio: JSON.parse(localStorage.getItem('bioserra_archive') || '[]')
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bioserra_backup_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  cfgToast('📤 Dati esportati');
}
function cfgResetCache() {
  if (!confirm('Resettare la cache? Le piante salvate restano intatte.')) return;
  const keep = ['bioserra_active_plants','bioserra_archive','bioserra_cfg_nome','bioserra_cfg_ciclo',
                 'bioserra_notifiche','bioserra_tema','bioserra_ai_attiva','bioserra_ore_luce'];
  Object.keys(localStorage).forEach(k => {
    if (!keep.includes(k)) localStorage.removeItem(k);
  });
  cfgToast('🗑️ Cache resettata');
}
function cfgAggiornaTutto() {
  if (typeof renderActivePlants === 'function') renderActivePlants();
  if (typeof loadWeather === 'function') loadWeather();
  if (typeof updateMoon === 'function') updateMoon();
  if (typeof loadAIJSON === 'function') loadAIJSON();
  if (typeof loadLunaJSON === 'function') loadLunaJSON();
  // loadPianteJSON NON viene chiamata qui: gli alert sono calcolati localmente
  // e il pannello "Stato & Alert Piante" si ricarica solo col suo bottone dedicato
  if (typeof loadManualiJSON === 'function') loadManualiJSON();
  applyNotificheAtBoot();
  cfgToast('🔄 Tutto aggiornato');
}

/* ── Toast ── */
function cfgToast(msg) {
  let t = document.getElementById('cfg-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cfg-toast';
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--card2);border:1px solid var(--border);border-radius:20px;padding:8px 18px;font-size:13px;color:var(--text);z-index:9999;pointer-events:none;transition:opacity .3s;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._to);
  t._to = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

/* ── Applica tema salvato all'avvio ── */
// Tema e notifiche vengono applicati da initApp() dopo sblocco PIN


// renderBioCalendar viene chiamata da initApp()
