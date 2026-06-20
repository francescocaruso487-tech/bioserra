/* BioSerra - ambiente.js */
/* ══════════════════════════════════════════════════════════════
   METEO — Open-Meteo · Caserta fissa
══════════════════════════════════════════════════════════════ */
const CASERTA = { lat: 41.09696262016739, lon: 14.388065360906802 };
const WMO = {0:'Sereno ☀️',1:'Prevalentemente sereno 🌤️',2:'Parzialmente nuvoloso ⛅',3:'Nuvoloso ☁️',45:'Nebbia 🌫️',48:'Nebbia gelata 🌫️',51:'Pioggerella 🌦️',53:'Pioggerella moderata 🌦️',55:'Pioggerella intensa 🌧️',61:'Pioggia leggera 🌧️',63:'Pioggia moderata 🌧️',65:'Pioggia intensa 🌧️',71:'Neve leggera ❄️',73:'Neve moderata ❄️',75:'Neve intensa ❄️',80:'Rovesci leggeri 🌦️',81:'Rovesci moderati 🌧️',82:'Rovesci violenti ⛈️',95:'Temporale ⛈️',96:'Temporale con grandine ⛈️',99:'Temporale forte ⛈️'};
const WMO_ICONS = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',71:'❄️',73:'❄️',75:'❄️',80:'🌦️',81:'🌧️',82:'⛈️',95:'⛈️',96:'⛈️',99:'⛈️'};
const DAYS_IT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

async function loadWeather() {
  const loading = document.getElementById('weather-loading');
  const error = document.getElementById('weather-error');
  const content = document.getElementById('weather-content');
  loading.style.display = 'block'; error.style.display = 'none'; content.style.display = 'none';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${CASERTA.lat}&longitude=${CASERTA.lon}`
      + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure,uv_index,rain`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min,rain_sum,et0_fao_evapotranspiration,sunrise,sunset`
      + `&timezone=Europe%2FRome&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    const c = d.current;
    const now = new Date();
    document.getElementById('w-lastupdate').textContent = now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('w-temp').textContent = Math.round(c.temperature_2m) + '°';
    document.getElementById('w-feels').textContent = Math.round(c.apparent_temperature);
    document.getElementById('w-desc').textContent = WMO[c.weather_code] || '—';
    document.getElementById('w-icon').textContent = WMO_ICONS[c.weather_code] || '🌡️';
    document.getElementById('w-humidity').textContent = c.relative_humidity_2m + '%';
    document.getElementById('w-uv').textContent = (c.uv_index ?? '—');
    document.getElementById('w-wind').textContent = Math.round(c.wind_speed_10m) + ' km/h';
    document.getElementById('w-pressure').textContent = Math.round(c.surface_pressure) + ' hPa';
    document.getElementById('w-rain').textContent = (d.daily.rain_sum[0] ?? 0).toFixed(1) + ' mm';
    const et = d.daily.et0_fao_evapotranspiration[0];
    document.getElementById('w-et').textContent = et != null ? et.toFixed(1) + ' mm' : '—';
    // Alba / tramonto / fotoperiodo
    const srStr = d.daily.sunrise[0]; const ssStr = d.daily.sunset[0];
    const sr = new Date(srStr); const ss = new Date(ssStr);
    document.getElementById('w-sunrise').textContent = sr.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    document.getElementById('w-sunset').textContent = ss.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    const dayMinutes = Math.round((ss-sr)/60000);
    document.getElementById('w-daylen').textContent = Math.floor(dayMinutes/60)+'h'+(dayMinutes%60>0?String(dayMinutes%60).padStart(2,'0'):'');
    // Consiglio irrigazione basato su ETo e pioggia
    const rain = d.daily.rain_sum[0] || 0;
    const etVal = et || 0;
    const netNeed = Math.max(0, etVal - rain);
    let irrigMain, irrigDetail;
    if (rain > 5) {
      irrigMain = '🌧️ Sospendi irrigazione automatica';
      irrigDetail = `Pioggia prevista ${rain.toFixed(1)} mm > ETo ${etVal.toFixed(1)} mm. Disattiva il timer della pompa solare per oggi per evitare eccesso idrico nei vasi in tessuto.`;
    } else if (netNeed < 2) {
      irrigMain = '✅ Irrigazione normale — condizioni ideali';
      irrigDetail = `Fabbisogno idrico netto: ${netNeed.toFixed(1)} mm. Mantieni la frequenza impostata. Verifica che i bordi dei vasi siano umidi.`;
    } else if (netNeed < 4) {
      irrigMain = '💧 Leggero aumento consigliato';
      irrigDetail = `ETo ${etVal.toFixed(1)} mm, pioggia ${rain.toFixed(1)} mm → fabbisogno netto ${netNeed.toFixed(1)} mm. Valuta 1 irrigazione extra oggi o aumenta la durata del ciclo.`;
    } else {
      irrigMain = '⚠️ Caldo secco — aumenta irrigazione';
      irrigDetail = `Alta evapotraspirazione: ${etVal.toFixed(1)} mm, pioggia ${rain.toFixed(1)} mm → fabbisogno netto ${netNeed.toFixed(1)} mm. Bagna manualmente i bordi dei vasi e aggiungi 1 ciclo extra di pompa.`;
    }
    const iMain=document.getElementById('w-irrig-main'); if(iMain) iMain.textContent=irrigMain;
    const iDet=document.getElementById('w-irrig-detail'); if(iDet) iDet.textContent=irrigDetail;
    // Alert serra
    const alert = document.getElementById('w-serra-alert');
    const alertText = document.getElementById('w-serra-alert-text');
    const temp = c.temperature_2m; const hum = c.relative_humidity_2m; const uv = c.uv_index;
    const alerts = [];
    if (temp > 35) alerts.push('🌡️ Temperatura critica (' + Math.round(temp) + '°C) — ombreggia la serra e aumenta l\'irrigazione');
    if (hum > 80) alerts.push('💧 Umidità alta (' + hum + '%) — rischio muffe. Ventila la mini-serra');
    if (hum < 30) alerts.push('🌵 Umidità bassa (' + hum + '%) — stress idrico. Bagna i bordi dei vasi');
    if (uv != null && uv > 8) alerts.push('☀️ UV molto alto (' + uv + ') — considera un pannello ombreggiante sulle piante delicate');
    if (alerts.length > 0) { alertText.innerHTML = '⚠️ <strong>Alert Serra:</strong><br>' + alerts.join('<br>'); alert.style.display='block'; }
    else alert.style.display = 'none';
    // Previsioni 7 giorni
    const fc = document.getElementById('w-forecast');
    fc.innerHTML = d.daily.time.map((t,i) => {
      const dt = new Date(t+'T12:00'); const icon = WMO_ICONS[d.daily.weather_code[i]] || '🌡️';
      const r = (d.daily.rain_sum[i]||0).toFixed(1);
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="font-size:13px;color:var(--text2);min-width:32px;">${i===0?'Oggi':DAYS_IT[dt.getDay()]}</span>
        <span style="font-size:20px;">${icon}</span>
        <span style="font-size:11px;color:#4fc3f7;">${r>0?'💧'+r+'mm':''}</span>
        <span style="font-size:13px;color:var(--text2);">${Math.round(d.daily.temperature_2m_min[i])}°</span>
        <span style="font-size:13px;font-weight:600;">${Math.round(d.daily.temperature_2m_max[i])}°</span>
      </div>`;
    }).join('');
    loading.style.display = 'none'; content.style.display = 'block';
    // Aggiorna card OGGI con dati meteo appena caricati
    try { renderOggiMaster(); } catch(e2) {}
  } catch(e) {
    loading.style.display = 'none';
    document.getElementById('weather-error-msg').textContent = 'Errore: ' + e.message;
    error.style.display = 'block';
  }
}

/* ══════════════════════════════════════════════════════════════
   LUNA — algoritmo Meeus preciso con countdown ore/minuti
══════════════════════════════════════════════════════════════ */
const LUNAR_CYCLE = 29.53058867;
const KNOWN_NEW_MOON_JD = 2451549.5;
function dateToJD(d){let y=d.getUTCFullYear(),m=d.getUTCMonth()+1,dd=d.getUTCDate()+d.getUTCHours()/24+d.getUTCMinutes()/1440;if(m<=2){y--;m+=12;}const A=Math.floor(y/100),B=2-A+Math.floor(A/4);return Math.floor(365.25*(y+4716))+Math.floor(30.6001*(m+1))+dd+B-1524.5;}
function jdToDate(jd){const z=Math.floor(jd+0.5);let a=z<2299161?z:z+1+Math.floor((z-1867216.25)/36524.25)-Math.floor(Math.floor((z-1867216.25)/36524.25)/4);const b=a+1524,c=Math.floor((b-122.1)/365.25),dd=Math.floor(365.25*c),e=Math.floor((b-dd)/30.6001),day=b-dd-Math.floor(30.6001*e),month=(e<14)?e-1:e-13,year=(month>2)?c-4716:c-4715;return new Date(Date.UTC(year,month-1,day));}
function getMoonAge(d){const jd=dateToJD(d),days=jd-KNOWN_NEW_MOON_JD;let age=days%LUNAR_CYCLE;if(age<0)age+=LUNAR_CYCLE;return age;}
function getMoonIllum(age){return Math.round(((1-Math.cos((age/LUNAR_CYCLE)*2*Math.PI))/2)*100);}
function getMoonPhase(age){const p=age/LUNAR_CYCLE;
  if(p<0.034)return{name:'Luna Nuova',emoji:'🌑',code:'new'};
  if(p<0.25)return{name:'Luna Crescente',emoji:'🌒',code:'waxing_crescent'};
  if(p<0.30)return{name:'Primo Quarto',emoji:'🌓',code:'first_quarter'};
  if(p<0.50)return{name:'Gibbosa Crescente',emoji:'🌔',code:'waxing_gibbous'};
  if(p<0.534)return{name:'Luna Piena',emoji:'🌕',code:'full'};
  if(p<0.75)return{name:'Gibbosa Calante',emoji:'🌖',code:'waning_gibbous'};
  if(p<0.80)return{name:'Ultimo Quarto',emoji:'🌗',code:'last_quarter'};
  return{name:'Luna Calante',emoji:'🌘',code:'waning_crescent'};}

function getAdvice(code){const a={
  new:{main:'🌑 Luna Nuova — energia nelle radici',detail:'Momento ideale per il terreno. Prepara l\'infuso di ortiche, sciacqua il serbatoio e rinnova l\'humus. Evita trapianti o operazioni invasive sulle piante.',tags:['🧫 Rinnova humus','🌱 Nutrimento radici','💧 Rinnova serbatoio'],
    serra:'🌿 Per Epsilon F1, Gaia F1 (autofiorenti): controlla il timer della pompa e regola la frequenza. Per i femminizzati in veg: giorno neutro, nessuna operazione urgente.'},
  waxing_crescent:{main:'🌿 Crescente — massima crescita vegetativa',detail:'La linfa sale verso foglie e fusti. Somministra infuso di ortiche diluito 1:10 (1-2L/vaso) e melassa (1ml/L). Le piante assorbono meglio in fase crescente.',tags:['🌿 Ortiche+Melassa','🌱 Crescita attiva','⬆️ Linfa in salita'],
    serra:'🔬 Autofiorenti in fioritura (Epsilon, Gaia, Medusa): applica tè di banana e cenere. Femminizzati in veg (Astro Lemonade, Cosmic Cheddar, Orbital Banana): ottimo per somministrare miscela organica.'},
  first_quarter:{main:'🌱 Primo Quarto — picco energetico',detail:'Massimo sviluppo vegetativo. Ideale per trapianti, rinvasi e applicazione della miscela organica (gusci+banana+caffè, 1 cucchiaio/vaso).',tags:['🌱 Trapianto OK','🧪 Miscela organica','💪 Massima energia'],
    serra:'⚡ Attiva o controlla la pila galvanica ferro-rame. Verifica i circuiti di Lakhovsky. Ottimo momento per osservare e fotografare la crescita di tutte le 10 varietà.'},
  waxing_gibbous:{main:'🌸 Gibbosa Crescente — prepara la fioritura',detail:'La pianta prepara la fioritura. Somministra tè di banana con cenere di legna (1:5) per potassio extra. Controlla i gocciolatori e la posizione dei Geomag.',tags:['🍌 Tè banana+cenere','🌸 Pre-fioritura','🧲 Geomag OK'],
    serra:'🍊 Per le autofiorenti in piena fioritura: aumenta potassio con tè banana ogni 2 settimane. Royal Gorilla e Mexican Rush (fioritura ottobre): mantieni veg ottimale con miscela organica.'},
  full:{main:'🌕 Luna Piena — massima vitalità',detail:'Picco di energia. Documenta visivamente gli esperimenti (elettrocultura, pila galvanica, cerchi di Lakhovsky). Osserva le resine sulle piante in fioritura.',tags:['📊 Documenta esperimenti','⚡ Verifica circuiti','🔍 Osserva resine'],
    serra:'📸 Fotografa tutte e 10 le piante e registra le osservazioni. Controlla il Pantacle di rame e la pila galvanica. Ottimo per confrontare piante con/senza esperimenti.'},
  waning_gibbous:{main:'🌿 Gibbosa Calante — nutrimento delle radici',detail:'La linfa scende verso le radici. Ideale per somministrare humus e infuso di ortiche. La pila galvanica ferro-rame è più efficace in questa fase.',tags:['🌿 Humus radici','🧫 Infuso ortiche','⚗️ Pila galvanica'],
    serra:'🌱 Versa infuso di humus nella tanica (5L + 100-150g BioBizz Worm Humus). Per le autofiorenti in maturazione (mesi 7-8): posiziona mela o banana matura nella serra per etilene.'},
  last_quarter:{main:'♻️ Ultimo Quarto — rinnovamento e pulizia',detail:'Fase di reset. Sciacqua il serbatoio da 50L, rimuovi foglie morte o malate, controlla i tubi per eventuali ostruzioni.',tags:['🗑️ Pulizia serbatoio','💧 Rinnovo irrigazione','🔧 Manutenzione'],
    serra:'🔧 Controlla l\'integrità di: gocciolatori (10 pz), tubo principale, fissaggio Geomag, archi Pantacle tra i vasi. Agita la tanica 15 secondi. Bagna manualmente i bordi di tutti i vasi.'},
  waning_crescent:{main:'📸 Luna Calante — riposo e osservazione',detail:'Fase di minima energia. Osserva, fotografa, annota il diario di coltivazione. Preparare il prossimo infuso di ortiche lasciandolo macerare.',tags:['📸 Diario coltivazione','📋 Prepara ortiche','🌙 Riposo delle piante'],
    serra:'🌙 Prepara in anticipo la miscela organica (essicca e tritando gusci d\'uovo, bucce banana e fondi caffè). Pianifica le operazioni del mese successivo. Giorno ideale per riordinare la mini-serra.'}
};return a[code]||a.new;}

function fmtIT(d){const m=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'],dn=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];return`${dn[d.getDay()]} ${d.getDate()} ${m[d.getMonth()]}`;}
function fmtFull(d){const m=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];return`${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;}

// Countdown preciso a prossima fase (restituisce {days, hours} con JD preciso)
function nextPhaseCountdown(today, targetFrac) {
  const age = getMoonAge(today);
  const currentFrac = age / LUNAR_CYCLE;
  let diff = targetFrac - currentFrac;
  if (diff <= 0.001) diff += 1;
  const daysExact = diff * LUNAR_CYCLE;
  const days = Math.floor(daysExact);
  const hours = Math.round((daysExact - days) * 24);
  const targetDate = new Date(today.getTime() + daysExact * 86400000);
  return { days, hours, date: targetDate };
}

function renderLunarSection(){
  const today=new Date(),age=getMoonAge(today),illum=getMoonIllum(age),phase=getMoonPhase(age),advice=getAdvice(phase.code);
  document.getElementById('moonSymbol').textContent=phase.emoji;
  document.getElementById('moonPhaseName').textContent=phase.name;
  document.getElementById('moonIllumPct').textContent=illum+'%';
  document.getElementById('moonProgressBar').style.width=illum+'%';
  document.getElementById('moonDateToday').textContent=fmtFull(today);
  document.getElementById('moonAge').textContent=Math.round(age);

  // Countdown preciso luna piena e nuova
  const fullInfo = nextPhaseCountdown(today, 0.5);
  const newInfo = nextPhaseCountdown(today, 0);
  const fullLabel = fullInfo.days === 0 ? (fullInfo.hours === 0 ? 'Oggi!' : fullInfo.hours+'h') : (fullInfo.days === 1 ? '1 giorno' : fullInfo.days+' gg');
  const newLabel  = newInfo.days === 0  ? (newInfo.hours === 0  ? 'Oggi!' : newInfo.hours+'h')  : (newInfo.days === 1  ? '1 giorno' : newInfo.days+' gg');
  document.getElementById('daysToFull').textContent = fullLabel;
  document.getElementById('daysToNew').textContent  = newLabel;
  document.getElementById('dateFullMoon').textContent = fmtIT(fullInfo.date) + (fullInfo.days < 2 ? ' ~'+fullInfo.hours+'h' : '');
  document.getElementById('dateNewMoon').textContent  = fmtIT(newInfo.date)  + (newInfo.days  < 2 ? ' ~'+newInfo.hours+'h'  : '');

  document.getElementById('agriAdviceMain').textContent=advice.main;
  document.getElementById('agriAdviceDetail').textContent=advice.detail;
  document.getElementById('agriAdviceTags').innerHTML=advice.tags.map(t=>`<span class="badge badge-green">${t}</span>`).join('');

  // Box consiglio specifico per la serra
  const serraBox = document.getElementById('agriAdviceSerra');
  if(serraBox) serraBox.textContent = advice.serra || '';

  const strip=document.getElementById('moonStrip');
  strip.innerHTML='';
  const dn=['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
  for(let i=0;i<7;i++){const d=new Date(today);d.setDate(d.getDate()+i);const a=getMoonAge(d),il=getMoonIllum(a),sy=getMoonPhase(a).emoji;
    strip.innerHTML+=`<div style="flex:0 0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 6px;text-align:center;min-width:52px;${i===0?'border-color:#4aaf5e;background:rgba(74,175,94,0.1);':''}">
      <div style="font-size:22px;">${sy}</div><div style="font-size:9px;color:var(--text3);">${i===0?'Oggi':dn[d.getDay()]}</div>
      <div style="font-size:9px;color:var(--text3);">${d.getDate()}/${d.getMonth()+1}</div>
      <div style="font-size:11px;font-weight:600;color:var(--text2);">${il}%</div></div>`;}

  const phases=[{code:'new',e:'🌑',n:'Luna Nuova',r:'0%'},{code:'waxing_crescent',e:'🌒',n:'Crescente',r:'1–49%'},{code:'first_quarter',e:'🌓',n:'Primo Quarto',r:'~50%'},{code:'waxing_gibbous',e:'🌔',n:'Gibbosa Crescente',r:'51–99%'},{code:'full',e:'🌕',n:'Luna Piena',r:'100%'},{code:'waning_gibbous',e:'🌖',n:'Gibbosa Calante',r:'99–51%'},{code:'last_quarter',e:'🌗',n:'Ultimo Quarto',r:'~50%'},{code:'waning_crescent',e:'🌘',n:'Calante',r:'49–1%'}];
  document.querySelector('#phasesTable tbody').innerHTML=phases.map(p=>`<tr style="${p.code===phase.code?'color:#4aaf5e;font-weight:600;background:rgba(74,175,94,0.06);':'color:var(--text2);'}"><td style="padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.05);">${p.e}</td><td style="padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.05);">${p.n}${p.code===phase.code?' ← oggi':''}</td><td style="padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.05);">${p.r}</td></tr>`).join('');
  document.getElementById('moonCycleInfo').innerHTML=`🌕 Luna Piena: <strong>${fmtIT(fullInfo.date)}</strong> (tra ${fullLabel})<br>🌑 Luna Nuova: <strong>${fmtIT(newInfo.date)}</strong> (tra ${newLabel})<br>⭕ Età luna: <strong>${Math.round(age)} giorni</strong> su ${Math.round(LUNAR_CYCLE)}<br>💡 Illuminazione: <strong>${illum}%</strong>`;
}

/* ══════════════════════════════════════════════════════════════
   BIODINAMICA — ALGORITMO STEINER
   Metodo: posizione della Luna nelle costellazioni zodiacali
   Fonte: calendario biodinamico Thun / metodo antroposofico
══════════════════════════════════════════════════════════════ */

/*
  Le costellazioni zodiacali usate in biodinamica (NON i segni astrologici)
  coprono porzioni diseguali dell'eclittica. Usiamo le lunghezze astronomiche
  reali secondo la tradizione Thun/biodinamica:

  Costellazione  | Elemento | Tipo giorno  | Long. inizio | Long. fine
  Ariete         | Fuoco    | Frutto       |  22°         |  51°
  Toro           | Terra    | Radice       |  51°         |  87°
  Gemelli        | Aria     | Fiore        |  87°         | 118°
  Cancro         | Acqua    | Foglia       | 118°         | 138°
  Leone          | Fuoco    | Frutto       | 138°         | 155°
  Vergine        | Terra    | Radice       | 155°         | 218°
  Bilancia       | Aria     | Fiore        | 218°         | 241°
  Scorpione      | Acqua    | Foglia       | 241°         | 270°  (usato Ofiuco→radice in alcune varianti, qui foglia)
  Sagittario     | Fuoco    | Frutto       | 270°         | 299°
  Capricorno     | Terra    | Radice       | 299°         | 327°
  Acquario       | Aria     | Fiore        | 327°         | 351°
  Pesci          | Acqua    | Foglia       | 351°         | 382° (=22° dopo 0)

  Per calcolare la longitudine eclittica della Luna usiamo
  le formule di Jean Meeus (Astronomical Algorithms, cap. 47).
  Precisione: ±1° (sufficiente per biodinamica, errore massimo ~2 ore).
*/

const CONSTELLATIONS = [
  { name: 'Ariete',     sym: '♈', element: 'Fuoco 🔥',  type: 'frutto',  start:  22, end:  51 },
  { name: 'Toro',       sym: '♉', element: 'Terra 🌍',  type: 'radice',  start:  51, end:  87 },
  { name: 'Gemelli',    sym: '♊', element: 'Aria 💨',   type: 'fiore',   start:  87, end: 118 },
  { name: 'Cancro',     sym: '♋', element: 'Acqua 💧',  type: 'foglia',  start: 118, end: 138 },
  { name: 'Leone',      sym: '♌', element: 'Fuoco 🔥',  type: 'frutto',  start: 138, end: 155 },
  { name: 'Vergine',    sym: '♍', element: 'Terra 🌍',  type: 'radice',  start: 155, end: 218 },
  { name: 'Bilancia',   sym: '♎', element: 'Aria 💨',   type: 'fiore',   start: 218, end: 241 },
  { name: 'Scorpione',  sym: '♏', element: 'Acqua 💧',  type: 'foglia',  start: 241, end: 270 },
  { name: 'Sagittario', sym: '♐', element: 'Fuoco 🔥',  type: 'frutto',  start: 270, end: 299 },
  { name: 'Capricorno', sym: '♑', element: 'Terra 🌍',  type: 'radice',  start: 299, end: 327 },
  { name: 'Acquario',   sym: '♒', element: 'Aria 💨',   type: 'fiore',   start: 327, end: 351 },
  { name: 'Pesci',      sym: '♓', element: 'Acqua 💧',  type: 'foglia',  start: 351, end: 382 },
];

const DAY_TYPES = {
  frutto: { label: 'Giorno Frutto', icon: '🍊', color: 'frutto', bannerClass: 'bio-banner-frutto', tipClass: 'tip-frutto' },
  fiore:  { label: 'Giorno Fiore',  icon: '🌸', color: 'fiore',  bannerClass: 'bio-banner-fiore',  tipClass: 'tip-fiore'  },
  radice: { label: 'Giorno Radice', icon: '🌿', color: 'radice', bannerClass: 'bio-banner-radice', tipClass: 'tip-radice' },
  foglia: { label: 'Giorno Foglia', icon: '💧', color: 'foglia', bannerClass: 'bio-banner-foglia', tipClass: 'tip-foglia' },
};

const ADVICE = {
  frutto: {
    short: 'Giorno Frutto — Raccolta, resina, aromi. Ottimale per le cime mature.',
    tips: [
      '🍊 Raccolta: se le autofiorenti (Epsilon F1, Gaia F1, Medusa F1) mostrano trichomi ambrati ≥30%, oggi è il giorno migliore per tagliare.',
      '✂️ Potatura e lollipopping: massima concentrazione di terpeni — la linfa è al picco nei frutti. Rimuovi fan leaves basse per migliorare la ventilazione.',
      '💧 Riduci leggermente l\'irrigazione oggi del 10-15%: i giorni Frutto riducono la domanda idrica nelle foglie.',
      '🧪 Evita azoto (fondi di caffè). Favorisci potassio: tè di banana con cenere per Titan F1, Orbital Banana F1 in fioritura.',
      '🔭 Osserva con lente i trichomi delle autofiorenti in maturazione — i giorni Frutto ne evidenziano la massima densità e maturità.',
      '🌡️ Controlla la temperatura della serra: tienila sotto i 24°C per massimizzare la produzione di resina.',
    ]
  },
  fiore: {
    short: 'Giorno Fiore — Aromi, terpeni, fioritura attiva. Stimola con potassio.',
    tips: [
      '🌸 Tè di banana e cenere (ogni 2 settimane, mesi 5-8): bolli 3-4 bucce in 1L per 15 min, filtra, aggiungi 1 cucchiaino cenere, diluisci 1:5. Somministra oggi.',
      '👃 Astro Lemonade F1, Orbital Banana F1 e Cosmic Cheddar F1: i giorni Fiore esaltano i profili terpenici — ottimo per valutare aroma e sviluppo.',
      '💨 Ventilazione: i giorni Fiore favoriscono la produzione di terpeni volatili — assicura buona circolazione d\'aria nella mini-serra.',
      '🌡️ Temperatura ideale: 22-26°C. Sotto i 20°C i terpeni si conservano meglio ma la crescita rallenta.',
      '🚫 Evita spruzzi fogliari e acqua sulle cime: i giorni Fiore aumentano la sensibilità a muffe su gemme umide.',
    ]
  },
  radice: {
    short: 'Giorno Radice — Substrato, microbi, nutrimento radicale. Ottimale per humus.',
    tips: [
      '🌿 Giornata perfetta per la Giornata Biologica mensile: infuso ortiche (1-2L/vaso diluito 1:10) + miscela organica (1 cucchiaio grande/vaso) + rinnovo humus in tanica (5L + 100-150g BioBizz Worm Humus).',
      '🦠 I microbi del suolo sono più attivi oggi — la melassa (1ml/L) somministrata in giorni Radice ha effetto potenziato.',
      '⚗️ Verifica la pila galvanica ferro-rame: il terreno umido in giorni Radice massimizza la conduzione galvanica. Versa acqua con melassa sopra il chiodo.',
      '💧 Bagna i bordi di tutti e 10 i vasi in tessuto manualmente — le radici perimetrali sono particolarmente attive nei giorni Radice.',
      '🔍 Controlla i vasi sollevando: se il peso è molto ridotto, aumenta la durata del ciclo di irrigazione automatica.',
    ]
  },
  foglia: {
    short: 'Giorno Foglia — Crescita vegetativa, stomi, assorbimento idrico massimo.',
    tips: [
      '💧 I giorni Foglia aumentano la domanda idrica — controlla il livello della tanica da 50L e verifica che tutti i 10 gocciolatori funzionino.',
      '🍃 Diagnosi fogliare: osserva ingiallimenti (carenza azoto o ferro), macchie (Botrite, Septoria), o deformazioni. I femminizzati in veg (Royal Gorilla, Mexican Rush) sono nella fase di massima crescita fogliare.',
      '🌱 Escavatori di luce (dischi Mylar): verifica che i dischi siano in posizione e riflettano la luce sulle foglie inferiori — gli stomi ventrali assorbono meglio nei giorni Foglia.',
      '🧲 Controlla la polarità dei Geomag sui gocciolatori — l\'acqua strutturata in giorni Foglia dovrebbe aumentare la turgidità fogliare.',
      '🔄 Agita il serbatoio per 15 secondi — l\'ossigenazione dell\'acqua è particolarmente utile in giorni Foglia per il metabolismo idrico delle piante.',
    ]
  }
};

/* ── Calcolo longitudine eclittica lunare (Meeus, cap 47) ── */
function moonEclipticLongitude(date) {
  // Julian Day Number
  const JD = date.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545.0) / 36525.0; // secoli giuliani da J2000

  // Anomalia media del Sole
  const M = toRad(357.5291092 + 35999.0502909 * T);
  // Anomalia media della Luna
  const Mprime = toRad(134.9633964 + 477198.8675055 * T);
  // Argomento di latitudine
  const F = toRad(93.2720950 + 483202.0175233 * T);
  // Elongazione media
  const D = toRad(297.8501921 + 445267.1114034 * T);
  // Longitudine media della Luna
  const L0 = 218.3164477 + 481267.88123421 * T;

  // Principali termini perturbativi (gradi)
  let dL = 6.288774 * Math.sin(Mprime)
          + 1.274027 * Math.sin(2*D - Mprime)
          + 0.658314 * Math.sin(2*D)
          + 0.213618 * Math.sin(2*Mprime)
          - 0.185116 * Math.sin(M)
          - 0.114332 * Math.sin(2*F)
          + 0.058793 * Math.sin(2*D - 2*Mprime)
          + 0.057066 * Math.sin(2*D - M - Mprime)
          + 0.053322 * Math.sin(2*D + Mprime)
          + 0.045758 * Math.sin(2*D - M)
          - 0.040923 * Math.sin(M - Mprime)
          - 0.034720 * Math.sin(D)
          - 0.030383 * Math.sin(M + Mprime)
          + 0.015327 * Math.sin(2*D - 2*F)
          - 0.012528 * Math.sin(2*F + Mprime)
          - 0.010980 * Math.sin(2*F - Mprime)
          + 0.010675 * Math.sin(4*D - Mprime)
          + 0.010034 * Math.sin(3*Mprime)
          + 0.008548 * Math.sin(4*D - 2*Mprime);

  let lon = ((L0 + dL) % 360 + 360) % 360;
  return lon;
}

function toRad(deg) { return deg * Math.PI / 180; }

function getConstellation(lon) {
  // Normalizza 0-360
  lon = ((lon % 360) + 360) % 360;
  // Cerchiamo nella tabella (Pesci copre 351-360 + 0-22)
  for (const c of CONSTELLATIONS) {
    if (c.end > 360) {
      // Pesci: 351-360 oppure 0-22
      if (lon >= c.start || lon < (c.end - 360)) return c;
    } else {
      if (lon >= c.start && lon < c.end) return c;
    }
  }
  // Fallback: Pesci (copre 0-22)
  return CONSTELLATIONS[11];
}

function getDayType(date) {
  // Usiamo la longitudine a mezzogiorno UTC del giorno
  const noon = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0));
  const lon = moonEclipticLongitude(noon);
  return getConstellation(lon);
}

/* ── Rendering Biodinamica ── */
let bioViewYear, bioViewMonth;

function bioChangeMonth(delta) {
  if (delta === 0) {
    var now = new Date();
    bioViewYear = now.getFullYear();
    bioViewMonth = now.getMonth();
  } else {
    bioViewMonth += delta;
    if (bioViewMonth < 0) { bioViewMonth = 11; bioViewYear--; }
    if (bioViewMonth > 11) { bioViewMonth = 0; bioViewYear++; }
  }
  renderBioCalendar();
  // Aggiorna anche griglia nella pagina scorrevole Ambiente con mese selezionato
  var grid = document.getElementById('bio-cal-grid-main');
  if (grid) {
    var year = bioViewYear, month = bioViewMonth;
    var today = new Date(); var todayStr = today.toISOString().slice(0,10);
    var firstDay = new Date(year, month, 1);
    var startDow = firstDay.getDay(); if (startDow === 0) startDow = 7;
    var daysInMonth = new Date(year, month+1, 0).getDate();
    var cells = '';
    for (var i=1; i<startDow; i++) cells += '<div class="bio-cell empty"></div>';
    for (var d=1; d<=daysInMonth; d++) {
      var date2 = new Date(year, month, d);
      var ct2 = getDayType(date2); var bioT2 = DAY_TYPES[ct2.type];
      var ds2 = date2.toISOString().slice(0,10);
      var isToday2 = ds2 === todayStr;
      cells += '<div class="bio-cell day-'+ct2.type+(isToday2?' today':'')+'" onclick="openCalBioDayPopup('+year+','+month+','+d+')" title="'+bioT2.label+'">'+d+'</div>';
    }
    grid.innerHTML = cells;
    var MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    var titleEl = document.getElementById('bio-cal-month-title');
    if (titleEl) titleEl.textContent = MONTHS[month] + ' ' + year;
  }
}

const MONTH_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const SHORT_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function renderBioCalendar() {
  const now = new Date();
  if (bioViewYear === undefined) { bioViewYear = now.getFullYear(); bioViewMonth = now.getMonth(); }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  document.getElementById('bio-cal-month').textContent = `${MONTH_IT[bioViewMonth]} ${bioViewYear}`;

  // Calcola giorno di oggi
  const todayConst = getDayType(today);
  const todayType = DAY_TYPES[todayConst.type];

  // Aggiorna banner oggi
  const banner = document.getElementById('bio-today-banner');
  banner.className = `bio-today-banner ${todayType.bannerClass}`;
  document.getElementById('bio-today-icon').textContent = todayType.icon;
  document.getElementById('bio-today-type').textContent = todayType.label;
  document.getElementById('bio-today-date').textContent =
    `${today.getDate()} ${MONTH_IT[today.getMonth()]} ${today.getFullYear()} · ${todayConst.sym} ${todayConst.name}`;
  document.getElementById('bio-today-advice').textContent = ADVICE[todayConst.type].short;

  // Costellazione attuale
  document.getElementById('bio-const-icon').textContent = todayConst.sym;
  document.getElementById('bio-const-name').textContent = `${todayConst.name} — ${todayType.label}`;
  document.getElementById('bio-const-element').textContent = `Elemento: ${todayConst.element} · Longitudine eclittica: ${Math.round(moonEclipticLongitude(now))}°`;

  // Tips
  const tipList = document.getElementById('bio-tip-list');
  const tips = ADVICE[todayConst.type].tips;
  tipList.innerHTML = tips.map(t =>
    `<div class="bio-tip-item ${todayType.tipClass}">${t}</div>`
  ).join('');

  // Griglia mensile
  const grid = document.getElementById('bio-grid');
  grid.innerHTML = '';

  const firstDay = new Date(bioViewYear, bioViewMonth, 1);
  const daysInMonth = new Date(bioViewYear, bioViewMonth + 1, 0).getDate();

  // Primo giorno della settimana (0=dom → convertiamo: Lun=0)
  let startDow = firstDay.getDay(); // 0=dom
  startDow = (startDow + 6) % 7;   // → 0=lun

  // Celle vuote iniziali
  for (let i = 0; i < startDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'bio-cell empty';
    grid.appendChild(empty);
  }

  // Giorni del mese
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(bioViewYear, bioViewMonth, d);
    const constData = getDayType(date);
    const dt = DAY_TYPES[constData.type];
    const isToday = date.getTime() === today.getTime() &&
                    bioViewYear === today.getFullYear() && bioViewMonth === today.getMonth();

    const cell = document.createElement('div');
    cell.className = `bio-cell day-${constData.type}${isToday ? ' today' : ''}`;
    cell.innerHTML = `
      <div class="bio-cell-day">${d}</div>
      <div class="bio-cell-icon">${dt.icon}</div>
      <div class="bio-cell-type">${constData.name.substring(0,3)}</div>
    `;
    cell.onclick = () => showBioPopup(date, constData, dt);
    grid.appendChild(cell);
  }
}

function showBioPopup(date, constData, dt) {
  const popup = document.getElementById('bio-popup');
  const content = document.getElementById('bio-popup-content');
  const tips = ADVICE[constData.type].tips;
  const phase = getMoonPhase(date);
  const phaseName = phase < 7.4 ? '🌒 Luna Crescente' : phase < 14.77 ? '🌔 Gibbosa Crescente' : phase < 22.1 ? '🌖 Gibbosa Calante' : '🌘 Luna Calante';

  content.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:28px;margin-bottom:6px">${dt.icon} ${dt.label}</div>
      <div style="font-size:14px;color:var(--text2)">${date.getDate()} ${MONTH_IT[date.getMonth()]} ${date.getFullYear()}</div>
      <div style="font-size:13px;color:var(--text3);margin-top:4px">${constData.sym} ${constData.name} · ${constData.element}</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">${phaseName} · Giorno ${Math.round(phase)} del ciclo</div>
    </div>
    <div style="font-size:13px;color:var(--text2);margin-bottom:12px">${ADVICE[constData.type].short}</div>
    <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Consigli del giorno</div>
    ${tips.map(t => `<div class="bio-tip-item ${dt.tipClass}" style="margin-bottom:6px;font-size:13px">${t}</div>`).join('')}
  `;
  popup.classList.remove('hidden');
}

function closeBioPopup(e) {
  if (e.target === document.getElementById('bio-popup')) {
    document.getElementById('bio-popup').classList.add('hidden');
  }
}
function closeBioPopupDirect() {
  document.getElementById('bio-popup').classList.add('hidden');
}

// renderBioCalendar viene chiamata da initApp() dopo sblocco PIN


/* ══════════════════════════════════════════════════════════════
   AMBIENTE — Meteo + Luna + Bio (versione corretta)
══════════════════════════════════════════════════════════════ */

/* ── Switch tab interno — chiama direttamente le funzioni originali ── */
function switchAmbTab(tab) {
  // Sezione ambiente scrollabile — avvia tutto insieme
  _doLoadWeather();
  setTimeout(_doRenderLunar, 50);
  _doRenderBio();
}

/* switchCalSub non più usata — sezione ambiente ora scrollabile */

/* ── Wrappers sicuri che chiamano le funzioni originali ── */
function _doLoadWeather() {
  // chiama la funzione loadWeather che usa gli ID DOM dentro sec-ambiente
  const loading = document.getElementById('weather-loading');
  const error   = document.getElementById('weather-error');
  const content = document.getElementById('weather-content');
  if (!loading || !error || !content) return;
  loading.style.display='block'; error.style.display='none'; content.style.display='none';
  // CASERTA, WMO, WMO_ICONS, DAYS_IT sono const globali nello stesso script block
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${CASERTA.lat}&longitude=${CASERTA.lon}`
    + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure,uv_index,rain`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,rain_sum,et0_fao_evapotranspiration,sunrise,sunset`
    + `&timezone=Europe%2FRome&forecast_days=7`;
  fetch(url)
    .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(d => {
      const c = d.current;
      const now = new Date();
      document.getElementById('w-lastupdate').textContent = now.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
      document.getElementById('w-temp').textContent = Math.round(c.temperature_2m)+'°';
      document.getElementById('w-feels').textContent = Math.round(c.apparent_temperature);
      document.getElementById('w-desc').textContent = WMO[c.weather_code] || '—';
      document.getElementById('w-icon').textContent = WMO_ICONS[c.weather_code] || '🌡️';
      document.getElementById('w-humidity').textContent = c.relative_humidity_2m+'%';
      document.getElementById('w-uv').textContent = (c.uv_index ?? '—');
      document.getElementById('w-wind').textContent = Math.round(c.wind_speed_10m)+' km/h';
      document.getElementById('w-pressure').textContent = Math.round(c.surface_pressure)+' hPa';
      document.getElementById('w-rain').textContent = (d.daily.rain_sum[0]||0).toFixed(1)+' mm';
      const et = d.daily.et0_fao_evapotranspiration[0];
      document.getElementById('w-et').textContent = et!=null ? et.toFixed(1)+' mm' : '—';
      // Alba/tramonto/fotoperiodo
      const sr=new Date(d.daily.sunrise[0]); const ss=new Date(d.daily.sunset[0]);
      document.getElementById('w-sunrise').textContent = sr.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
      document.getElementById('w-sunset').textContent  = ss.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
      const dm = Math.round((ss-sr)/60000);
      document.getElementById('w-daylen').textContent = Math.floor(dm/60)+'h'+(dm%60>0?String(dm%60).padStart(2,'0'):'');
      // Consiglio irrigazione
      const rain=d.daily.rain_sum[0]||0; const etVal=et||0; const netNeed=Math.max(0,etVal-rain);
      let irrigMain, irrigDetail;
      if(rain>5){ irrigMain='🌧️ Sospendi irrigazione automatica'; irrigDetail=`Pioggia prevista ${rain.toFixed(1)} mm > ETo ${etVal.toFixed(1)} mm. Disattiva il timer della pompa solare.`; }
      else if(netNeed<2){ irrigMain='✅ Irrigazione normale — condizioni ideali'; irrigDetail=`Fabbisogno netto: ${netNeed.toFixed(1)} mm. Mantieni la frequenza impostata.`; }
      else if(netNeed<4){ irrigMain='💧 Leggero aumento consigliato'; irrigDetail=`ETo ${etVal.toFixed(1)} mm, pioggia ${rain.toFixed(1)} mm → fabbisogno netto ${netNeed.toFixed(1)} mm.`; }
      else { irrigMain='⚠️ Caldo secco — aumenta irrigazione'; irrigDetail=`Alta ETo: ${etVal.toFixed(1)} mm, pioggia ${rain.toFixed(1)} mm → fabbisogno netto ${netNeed.toFixed(1)} mm. Bagna i bordi.`; }
      const _iM=document.getElementById('w-irrig-main'); if(_iM)_iM.textContent=irrigMain;
      const _iD=document.getElementById('w-irrig-detail'); if(_iD)_iD.textContent=irrigDetail;
      // Alert serra
      const alertEl=document.getElementById('w-serra-alert'); const alertTxt=document.getElementById('w-serra-alert-text');
      const temp=c.temperature_2m; const hum=c.relative_humidity_2m; const uv=c.uv_index; const alerts=[];
      if(temp>35) alerts.push('🌡️ Temperatura critica ('+Math.round(temp)+'°C) — ombreggia la serra');
      if(hum>80)  alerts.push('💧 Umidità alta ('+hum+'%) — rischio muffe. Ventila.');
      if(hum<30)  alerts.push('🌵 Umidità bassa ('+hum+'%) — stress idrico. Bagna i bordi.');
      if(uv!=null&&uv>8) alerts.push('☀️ UV molto alto ('+uv+') — ombreggia le piante delicate.');
      if(alerts.length){ alertTxt.innerHTML='⚠️ <strong>Alert Serra:</strong><br>'+alerts.join('<br>'); alertEl.style.display='block'; }
      else alertEl.style.display='none';
      // Previsioni 7 giorni cliccabili
      const fc=document.getElementById('w-forecast');
      fc.innerHTML = d.daily.time.map((t,i)=>{
        const dt=new Date(t+'T12:00'); const icon=WMO_ICONS[d.daily.weather_code[i]]||'🌡️';
        const r=(d.daily.rain_sum[i]||0).toFixed(1);
        return `<div onclick="openForecastPopup(${i})" style="display:flex;align-items:center;justify-content:space-between;padding:9px 4px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;">
          <span style="font-size:13px;color:var(--text2);min-width:32px;">${i===0?'Oggi':DAYS_IT[dt.getDay()]}</span>
          <span style="font-size:20px;">${icon}</span>
          <span style="font-size:11px;color:#4fc3f7;">${r>0?'💧'+r+'mm':''}</span>
          <span style="font-size:13px;color:var(--text2);">${Math.round(d.daily.temperature_2m_min[i])}°</span>
          <span style="font-size:13px;font-weight:600;">${Math.round(d.daily.temperature_2m_max[i])}°</span>
          <span style="font-size:12px;color:var(--text3);">›</span>
        </div>`;
      }).join('');
      loading.style.display='none'; content.style.display='block';
      // Aggiorna card OGGI con dati meteo
      try { renderOggiMaster(); } catch(e2) {}
    })
    .catch(e => {
      loading.style.display='none';
      document.getElementById('weather-error-msg').textContent='Errore: '+e.message;
      error.style.display='block';
    });
}

function _doRenderLunar() {
  if (typeof renderLunarSection === 'function') {
    try { renderLunarSection(); } catch(e) { console.warn('[BioSerra] renderLunarSection:', e); }
  }
  if (typeof renderCalLunare === 'function') {
    try { renderCalLunare(); } catch(e) { console.warn('[BioSerra] renderCalLunare:', e); }
  }
  _renderLunarStrip14();
  loadLunaConsigli6();
}

function _renderLunarStrip14() {
  var today = new Date();
  var strip = document.getElementById('lunar-strip');
  if (!strip) return;
  strip.innerHTML = '';
  var DAYS = ['D','L','M','M','G','V','S'];
  for (var i=0; i<14; i++) {
    var d = new Date(today.getTime() + i*86400000);
    var a = getMoonAge(d); var p = getMoonPhase(a); var il = getMoonIllum(a);
    var div = document.createElement('div');
    div.style.cssText = 'flex:0 0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 6px;text-align:center;min-width:52px;cursor:pointer;';
    if (i===0) div.style.cssText += 'border-color:#4aaf5e;background:rgba(74,175,94,0.1);';
    div.innerHTML = '<div style="font-size:20px;">'+p.emoji+'</div>'
      + '<div style="font-size:9px;color:var(--text3);">'+(i===0?'Oggi':DAYS[d.getDay()])+'</div>'
      + '<div style="font-size:9px;color:var(--text3);">'+d.getDate()+'/'+(d.getMonth()+1)+'</div>'
      + '<div style="font-size:11px;font-weight:600;color:var(--text2);">'+il+'%</div>';
    (function(dt){ div.onclick = function(){ openCalLunarePopup(dt); }; })(new Date(d));
    strip.appendChild(div);
  }
  var age2 = getMoonAge(today); var ph = getMoonPhase(age2); var adv = getAdvice(ph.code);
  var adel = document.getElementById('lunar-phase-advice');
  if (adel) adel.innerHTML = '<strong>'+ph.emoji+' '+ph.name+'</strong><br>'+adv.detail+'<br><br><strong style="color:var(--green3);">Per la tua serra:</strong><br>'+(adv.serra||'');
  var phases8 = [
    {code:'new',emoji:String.fromCodePoint(0x1F311),nome:'Luna Nuova'},
    {code:'waxing_crescent',emoji:String.fromCodePoint(0x1F312),nome:'Luna Crescente'},
    {code:'first_quarter',emoji:String.fromCodePoint(0x1F313),nome:'Primo Quarto'},
    {code:'waxing_gibbous',emoji:String.fromCodePoint(0x1F314),nome:'Gibbosa Crescente'},
    {code:'full',emoji:String.fromCodePoint(0x1F315),nome:'Luna Piena'},
    {code:'waning_gibbous',emoji:String.fromCodePoint(0x1F316),nome:'Gibbosa Calante'},
    {code:'last_quarter',emoji:String.fromCodePoint(0x1F317),nome:'Ultimo Quarto'},
    {code:'waning_crescent',emoji:String.fromCodePoint(0x1F318),nome:'Luna Calante'}
  ];
  var pt = document.getElementById('lunar-phases-table');
  if (pt) {
    var curCode = ph.code;
    pt.innerHTML = phases8.map(function(pp){
      var a2 = getAdvice(pp.code);
      var activeStyle = pp.code===curCode ? 'background:rgba(74,175,94,0.08);color:#4aaf5e;font-weight:700;' : 'color:var(--text2);';
      return '<div onclick="openPhasePopup(\'' + pp.code + '\')" style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;'+activeStyle+'">'
        +'<span style="font-size:22px;">'+pp.emoji+'</span>'
        +'<div style="flex:1;"><div style="font-size:13px;font-weight:600;">'+pp.nome+(pp.code===curCode?' ← oggi':'')+'</div>'
        +'<div style="font-size:11px;color:var(--text3);">'+a2.main.substring(0,60)+'...</div></div>'
        +'<span style="color:var(--text3);">›</span></div>';
    }).join('');
  }
}

function _doRenderBio() {
  if (typeof renderBioCalendar === 'function') {
    try { renderBioCalendar(); } catch(e) { console.warn('[BioSerra] renderBioCalendar:', e); }
  }
  try { renderBio3Giorni(); } catch(e) {}
  try { updateBioElettroPreview(); } catch(e) {}
  // Calendari nuovi tab
  try { _renderSemine(); } catch(e) {}
  try { _renderTrattamenti(); } catch(e) {}
  try { _renderFotoperiodo(); } catch(e) {}
  try { _renderFenologico(); } catch(e) {}
  // Calendari pagina scorrevole Ambiente
  try { renderCalOggi(); } catch(e) {}
  try { renderCalBio(); } catch(e) {}
  try { renderCalSemine(); } catch(e) {}
  try { renderCalTratt(); } catch(e) {}
  try { renderCalFoto(); } catch(e) {}
  try { renderCalFenol(); } catch(e) {}
  try { renderCalLavori(); } catch(e) {}
  try { renderCalGDD(); } catch(e) {}
  try { renderCalGelo(); } catch(e) {}
  try { renderCalMatur(); } catch(e) {}
  // Popola card Oggi master
  try { renderOggiMaster(); } catch(e) {}
  // Griglia bio nella nuova sezione scrollabile
  try { _syncBioGridMain(); } catch(e) {}
}

/* Sincronizza la griglia bio nella sezione scrollabile (usa gli stessi dati di renderBioCalendar) */
function _syncBioGridMain() {
  var grid = document.getElementById('bio-cal-grid-main');
  if (!grid) return;
  var today = new Date();
  var year = today.getFullYear(), month = today.getMonth();
  var todayStr = today.toISOString().slice(0,10);
  var firstDay = new Date(year, month, 1);
  var startDow = firstDay.getDay(); if (startDow === 0) startDow = 7;
  var daysInMonth = new Date(year, month+1, 0).getDate();
  var cells = '';
  for (var i=1; i<startDow; i++) cells += '<div class="bio-cell empty"></div>';
  for (var d=1; d<=daysInMonth; d++) {
    var date = new Date(year, month, d);
    var ct = getDayType(date); var bioT = DAY_TYPES[ct.type];
    var ds = date.toISOString().slice(0,10);
    var isToday = ds === todayStr;
    cells += '<div class="bio-cell day-'+ct.type+(isToday?' today':'')+'" onclick="openCalBioDayPopup('+year+','+month+','+d+')" title="'+bioT.label+'">'+d+'</div>';
  }
  grid.innerHTML = cells;
  var titleEl = document.getElementById('bio-cal-month-title');
  var MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  if (titleEl) titleEl.textContent = MONTHS[month] + ' ' + year;
}

/* Card Oggi master — riepilogo integrato nella sezione scorrevole */
function renderOggiMaster() {
  var today = new Date();
  var MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var DAYS_IT2 = ['Domenica','Lunedi','Martedi','Mercoledi','Giovedi','Venerdi','Sabato'];
  var el = document.getElementById('oggi-data-master');
  if (el) el.textContent = DAYS_IT2[today.getDay()]+' '+today.getDate()+' '+MONTHS_IT[today.getMonth()]+' '+today.getFullYear();
  var sun = calcSunTimes(today);
  var age = getMoonAge(today); var phase = getMoonPhase(age); var bio = getDayType(today); var bioT = DAY_TYPES[bio.type];
  var fenol = (typeof getFenolFase === 'function') ? getFenolFase(today) : {fase:'-',desc:''};
  var sem = (typeof getSemineOggi === 'function') ? getSemineOggi(today) : {emoji:'-',label:'-',motivo:''};
  var tratt = (typeof getTrattOggi === 'function') ? getTrattOggi(today) : {label:'-',desc:''};
  var wTempEl = document.getElementById('w-temp');
  var wIconEl = document.getElementById('w-icon');
  var wDescEl = document.getElementById('w-desc');
  var meteoVal = wTempEl && wTempEl.textContent !== '—°' ? (wIconEl?wIconEl.textContent:'🌡️')+' '+wTempEl.textContent : '⏳ Caricamento…';
  var meteoSub = wDescEl && wDescEl.textContent ? wDescEl.textContent : 'Meteo Caserta';
  var rows = [
    {icon:'⛅', label:'Meteo', val:meteoVal, sub:meteoSub},
    {icon:'🌙', label:'Luna', val:phase.emoji+' '+phase.name, sub:getMoonIllum(age)+'% illum.'},
    {icon:'🌱', label:'Biodinamica', val:bioT.icon+' '+bioT.label, sub:bio.sym+' '+bio.name},
    {icon:'☀️', label:'Fotoperiodo', val:sun.dayLen.toFixed(1).replace('.',',')+' h luce', sub:'Alba '+hToHHMM(sun.sunrise)+' Tramonto '+hToHHMM(sun.sunset)},
    {icon:'🌾', label:'Semine', val:sem.emoji+' '+sem.label, sub:sem.motivo},
    {icon:'🧪', label:'Trattamenti', val:tratt.label, sub:tratt.desc},
    {icon:'🌸', label:'Fenologia', val:fenol.fase, sub:fenol.desc}
  ];
  var grid = document.getElementById('oggi-master-grid');
  if (grid) {
    grid.innerHTML = rows.map(function(r){
      return '<div onclick="openDayPopup(new Date())" style="background:var(--bg3);border-radius:10px;padding:8px 10px;cursor:pointer;display:flex;align-items:flex-start;gap:8px;">'
        +'<span style="font-size:18px;flex-shrink:0;">'+r.icon+'</span>'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.4px;">'+r.label+'</div>'
        +'<div style="font-size:12px;font-weight:600;color:var(--text);margin-top:2px;">'+r.val+'</div>'
        +'<div style="font-size:11px;color:var(--text3);">'+r.sub+'</div></div></div>';
    }).join('');
  }
  var cons = document.getElementById('oggi-master-consiglio');
  if (cons) {
    var adv = getAdvice(phase.code);
    cons.textContent = adv.main + ' ' + (bio.type==='frutto'?'Ottimo per raccolta e aromi.':bio.type==='fiore'?'Ottimo per cime e terpeni.':bio.type==='radice'?'Ideale per substrato e radici.':'Ideale per vegetazione e irrigazione.');
  }
}

/* Pop-up universale per giorno — mostra TUTTE le info */
function openDayPopup(date) {
  var overlay = document.getElementById('amb-popup-overlay');
  var contentEl = document.getElementById('amb-popup-content');
  if (!overlay || !contentEl) return;
  var MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var DAYS_IT2 = ['Domenica','Lunedi','Martedi','Mercoledi','Giovedi','Venerdi','Sabato'];
  var sun = calcSunTimes(date);
  var age = getMoonAge(date); var ph = getMoonPhase(age); var adv = getAdvice(ph.code);
  var bio = getDayType(date); var bioT = DAY_TYPES[bio.type]; var bioAdv = ADVICE[bio.type];
  var fenol = (typeof getFenolFase === 'function') ? getFenolFase(date) : {fase:'-',desc:''};
  var sem = (typeof getSemineOggi === 'function') ? getSemineOggi(date) : {emoji:'-',label:'-',motivo:''};
  var tratt = (typeof getTrattOggi === 'function') ? getTrattOggi(date) : {label:'-',desc:''};
  var lavori = (typeof getLavoriOggi === 'function') ? getLavoriOggi(date) : {titolo:'-',sub:''};
  contentEl.innerHTML =
    '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;">Riepilogo integrato</div>'
    +'<div style="font-size:18px;font-weight:700;margin:6px 0 14px;">'+DAYS_IT2[date.getDay()]+' '+date.getDate()+' '+MONTHS_IT[date.getMonth()]+' '+date.getFullYear()+'</div>'
    +'<div class="amb-popup-section"><div class="amb-popup-label">Luna</div>'
    +'<div style="font-size:15px;font-weight:700;">'+ph.emoji+' '+ph.name+'</div>'
    +'<div style="font-size:13px;color:var(--text2);margin-top:4px;">'+getMoonIllum(age)+'% illuminazione · Giorno '+Math.round(age)+' del ciclo</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-top:4px;">'+adv.main+'</div></div>'
    +'<div class="amb-popup-section"><div class="amb-popup-label">Biodinamica</div>'
    +'<div style="font-size:15px;font-weight:700;">'+bioT.icon+' '+bioT.label+'</div>'
    +'<div style="font-size:12px;color:var(--text2);margin-top:4px;">'+bio.sym+' '+bio.name+' · '+bio.element+'</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-top:3px;">'+bioAdv.short+'</div></div>'
    +'<div class="amb-popup-section"><div class="amb-popup-label">Fotoperiodo</div>'
    +'<div style="font-size:22px;font-weight:800;color:#ffd54f;">'+sun.dayLen.toFixed(1)+'h</div>'
    +'<div style="font-size:12px;color:var(--text2);">Alba '+hToHHMM(sun.sunrise)+' → Tramonto '+hToHHMM(sun.sunset)+'</div></div>'
    +'<div class="amb-popup-section"><div class="amb-popup-label">Semine</div>'
    +'<div style="font-size:13px;font-weight:600;">'+sem.emoji+' '+sem.label+'</div>'
    +'<div style="font-size:12px;color:var(--text3);">'+sem.motivo+'</div></div>'
    +'<div class="amb-popup-section"><div class="amb-popup-label">Trattamenti</div>'
    +'<div style="font-size:13px;font-weight:600;">'+tratt.label+'</div>'
    +'<div style="font-size:12px;color:var(--text3);">'+tratt.desc+'</div></div>'
    +'<div class="amb-popup-section"><div class="amb-popup-label">Fenologia</div>'
    +'<div style="font-size:13px;font-weight:600;">'+fenol.fase+'</div>'
    +'<div style="font-size:12px;color:var(--text3);">'+fenol.desc+'</div></div>'
    +'<div class="amb-popup-section" style="border:none;"><div class="amb-popup-label">Lavori consigliati</div>'
    +'<div style="font-size:13px;font-weight:600;">'+lavori.titolo+'</div>'
    +'<div style="font-size:12px;color:var(--text3);">'+lavori.sub+'</div></div>';
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/* ── Init ambiente (chiamato da showSection) ── */
async function loadCalOggiAI() {
  var el = document.getElementById('cal-oggi-ai');
  if (!el) return;
  // 1. Prova knowledge_digest.json — consiglio integrato piu ricco
  try {
    var rk = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/knowledge_digest.json?v=' + Date.now());
    if (rk.ok) {
      var dk = await rk.json();
      var consDigest = dk.consiglio_integrato || '';
      if (consDigest && consDigest.length > 20) {
        el.innerHTML = '<span style="color:var(--green2);font-size:10px;font-weight:700;display:block;margin-bottom:4px">⭐ CONSIGLIO INTEGRATO</span>' + consDigest;
        return;
      }
    }
  } catch(ek) {}
  // 2. Prova luna_consigli.json
  try {
    var r = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/luna_consigli.json?v=' + Date.now());
    if (r.ok) {
      var d = await r.json();
      var items = d.consigli || d.items || d.consigli_lunari || [];
      var today_key = new Date().toISOString().slice(0,10);
      var item = items.find(function(i){ return (i.data||i.date||'').startsWith(today_key); }) || items[0];
      if (item) {
        var testo = item.testo || item.body || item.consiglio || '';
        if (testo) { el.textContent = testo; return; }
      }
    }
  } catch(e) {}
  // 3. Prova brain.json
  try {
    var r2 = await fetch('https://raw.githubusercontent.com/francescocaruso487-tech/bioserra/main/data/brain.json?v=' + Date.now());
    if (r2.ok) {
      var d2 = await r2.json();
      var cerv = d2.cervello || {};
      var cons = cerv.consigli_giorno ? cerv.consigli_giorno[0] : (d2.consiglio_oggi || d2.consiglio || '');
      if (cons) { el.textContent = cons; return; }
    }
  } catch(e2) {}
  // 4. Fallback calcolato
  var age = getMoonAge(new Date()); var ph = getMoonPhase(age); var bio = getDayType(new Date());
  var adv = getAdvice(ph.code);
  el.textContent = ph.emoji + ' ' + ph.name + ' · ' + DAY_TYPES[bio.type].icon + ' ' + DAY_TYPES[bio.type].label + ' — ' + adv.main;
}

function initAmbiente() {
  _doLoadWeather();
  setTimeout(_doRenderLunar, 50);
  _doRenderBio();
  // GDD richiede fetch asincrono
  setTimeout(function(){ try { loadGDD(); } catch(e) {} }, 200);
  // Consiglio AI del giorno
  setTimeout(function(){ try { loadCalOggiAI(); } catch(e) {} }, 300);
}

/* ══════════════════════════════════════════════════════════════
   POP-UP UNIVERSALE
══════════════════════════════════════════════════════════════ */
function openAmbPopup(type) {
  const overlay=document.getElementById('amb-popup-overlay');
  const content=document.getElementById('amb-popup-content');
  if(!overlay||!content) return;
  content.innerHTML=buildPopupContent(type);
  overlay.style.display='flex';
  document.body.style.overflow='hidden';
}
function closeAmbPopup(e) {
  if(e&&e.target!==document.getElementById('amb-popup-overlay')) return;
  closeAmbPopupDirect();
}
function closeAmbPopupDirect() {
  const o=document.getElementById('amb-popup-overlay');
  if(o) o.style.display='none';
  document.body.style.overflow='';
}

function buildPopupContent(type) {
  // Delega ai nuovi popup calendario se il tipo inizia con queste stringhe
  if (type && (type.startsWith('semine-') || type.startsWith('tratt-') ||
      type.startsWith('foto-') || type.startsWith('fenol-'))) {
    const result = _buildPopupNuovi(type);
    if (result !== null) return result;
  }
  const today=new Date();
  const age=getMoonAge(today);
  const phase=getMoonPhase(age);
  const advice=getAdvice(phase.code);
  const bioConst=getDayType(today);
  const bioType=DAY_TYPES[bioConst.type];

  const gv=(id)=>{ const e=document.getElementById(id); return e?e.textContent:'—'; };

  switch(type) {
    case 'meteo-main': return `<div class="amb-popup-label">Temperatura & Condizioni</div>
<div class="amb-popup-title">🌡️ Meteo Attuale</div>
<div class="amb-popup-section">
  <div style="font-size:48px;text-align:center;margin:8px 0;">${gv('w-icon')}</div>
  <div style="text-align:center;font-size:36px;font-weight:800;margin-bottom:4px;">${gv('w-temp')}</div>
  <div style="text-align:center;color:var(--text2);margin-bottom:16px;">${gv('w-desc')}</div>
  <div style="color:var(--text2);font-size:13px;line-height:2;">
    🌡️ Percepita: <strong>${gv('w-feels')}°</strong><br>
    💧 Umidità: <strong>${gv('w-humidity')}</strong><br>
    🔆 UV: <strong>${gv('w-uv')}</strong><br>
    💨 Vento: <strong>${gv('w-wind')}</strong><br>
    🌡️ Pressione: <strong>${gv('w-pressure')}</strong><br>
    🌧️ Pioggia: <strong>${gv('w-rain')}</strong><br>
    💦 ETo: <strong>${gv('w-et')}</strong>
  </div>
</div>
<div class="amb-popup-section">
  <div class="amb-popup-label">Fotoperiodo</div>
  <div style="display:flex;gap:8px;margin-top:8px;">
    <div style="flex:1;background:var(--card2);border-radius:8px;padding:10px;text-align:center;font-size:13px;">🌅 Alba<br><strong>${gv('w-sunrise')}</strong></div>
    <div style="flex:1;background:var(--card2);border-radius:8px;padding:10px;text-align:center;font-size:13px;">🌇 Tramonto<br><strong>${gv('w-sunset')}</strong></div>
    <div style="flex:1;background:var(--card2);border-radius:8px;padding:10px;text-align:center;font-size:13px;">⏱️ Durata<br><strong>${gv('w-daylen')}</strong></div>
  </div>
</div>`;

    case 'meteo-umidita': return `<div class="amb-popup-label">Umidità</div>
<div class="amb-popup-title">💧 Umidità Relativa — ${gv('w-humidity')}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
Misura il vapore acqueo nell'aria. Per la tua serra in grow bag da 10L:<br><br>
🟢 <strong>40–60%</strong> → Ideale. Nessuna azione.<br>
🟡 <strong>60–75%</strong> → Attenzione muffe. Ventila.<br>
🔴 <strong>>75%</strong> → Rischio elevato. Ventila subito e riduci irrigazione.<br>
🟡 <strong><35%</strong> → Stress idrico. Bagna i bordi dei vasi.<br><br>
<strong>Autofiorenti</strong> (Epsilon, Gaia, Medusa, Titan, Milky Way) tollerano fino al 70% in fioritura.<br>
<strong>Femminizzate</strong> in vegetativa preferiscono 50–65%.
</div></div>`;

    case 'meteo-uv': return `<div class="amb-popup-label">Radiazione UV</div>
<div class="amb-popup-title">🔆 UV Index — ${gv('w-uv')}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
🟢 <strong>0–2</strong> → Basso. Fotosintesi limitata.<br>
🟢 <strong>3–5</strong> → Moderato. Ideale vegetativa.<br>
🟡 <strong>6–7</strong> → Alto. Ottimo per resine.<br>
🔴 <strong>8–10</strong> → Molto alto. Ombreggia parzialmente.<br>
🔴 <strong>>10</strong> → Estremo. Proteggi le cime in fioritura.<br><br>
Il Mylar riflettente amplifica la luce disponibile anche con UV moderato. UV alto favorisce la produzione di tricomi nelle piante in fioritura.
</div></div>`;

    case 'meteo-vento': return `<div class="amb-popup-label">Vento</div>
<div class="amb-popup-title">💨 Vento — ${gv('w-wind')}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
🟢 <strong>0–15 km/h</strong> → Ideale. Buona circolazione.<br>
🟡 <strong>15–30 km/h</strong> → Verifica stabilità tutori elettrocultura.<br>
🔴 <strong>>30 km/h</strong> → Assicura i vasi e i bastoncini rame. Proteggi le cime.<br><br>
<strong>Effetti positivi vento leggero:</strong> rinforza i fusti, riduce umidità superficiale, migliora circolazione CO₂.
</div></div>`;

    case 'meteo-pressione': return `<div class="amb-popup-label">Pressione</div>
<div class="amb-popup-title">🌡️ Pressione — ${gv('w-pressure')}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
🟢 <strong>>1013 hPa</strong> → Alta pressione. Bel tempo. Ottimo per fotosintesi.<br>
🟡 <strong>1000–1013 hPa</strong> → Variabile. Monitora.<br>
🔴 <strong><1000 hPa</strong> → Possibile maltempo. Riduci irrigazione automatica.<br><br>
Alta pressione → maggiore attività microbica nel Living Soil. La pila galvanica è più efficace con terreno umido e alta pressione.
</div></div>`;

    case 'meteo-pioggia': return `<div class="amb-popup-label">Pioggia</div>
<div class="amb-popup-title">🌧️ Pioggia — ${gv('w-rain')}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
🟢 <strong>0–2 mm</strong> → Irrigazione normale.<br>
🟡 <strong>2–5 mm</strong> → Riduci di 1 ciclo il timer pompa.<br>
🔴 <strong>>5 mm</strong> → Sospendi irrigazione automatica.<br><br>
I grow bag da 10L drenano bene, ma i bordi si seccano anche dopo la pioggia. Controlla sempre i bordi laterali manualmente.
</div></div>`;

    case 'meteo-eto': return `<div class="amb-popup-label">Evapotraspirazione</div>
<div class="amb-popup-title">💦 ETo — ${gv('w-et')}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
Quanta acqua perdono piante e suolo ogni giorno.<br>
<strong>Fabbisogno netto = ETo − Pioggia</strong><br><br>
🟢 <strong>ETo <2 mm</strong> → 1 ciclo/giorno.<br>
🟡 <strong>ETo 2–4 mm</strong> → 1–2 cicli/giorno.<br>
🔴 <strong>ETo >4 mm</strong> → 2+ cicli + irrigazione manuale bordi.<br><br>
Con ETo alta, i bordi dei grow bag si disidratano in poche ore. Bagna i bordi ogni mattina.
</div></div>`;

    case 'meteo-impatto': return `<div class="amb-popup-label">Impatto Serra</div>
<div class="amb-popup-title">🏡 Azioni Consigliate</div>
<div class="amb-popup-section">
  <div style="font-size:15px;font-weight:700;margin-bottom:8px;">${gv('w-irrig-main')}</div>
  <div style="color:var(--text2);font-size:13px;line-height:1.7;margin-bottom:16px;">${gv('w-irrig-detail')}</div>
</div>
<div class="amb-popup-section">
  <div class="amb-popup-label">Checklist operativa</div>
  <div style="color:var(--text2);font-size:13px;line-height:2;">
    ☐ Umidità superficiale tutti i vasi<br>
    ☐ Bordi vasi (idrofobia?)<br>
    ☐ Gocciolatori attivi e non ostruiti<br>
    ☐ Livello serbatoio 50L sufficiente<br>
    ☐ Timer pompa solare corretto<br>
    ☐ Pannello solare pulito e orientato<br>
    ☐ Magnete principale + Geomag in posizione
  </div>
</div>`;

    /* ── LUNA ── */
    case 'luna-fase': {
      const fc7=[];
      for(let i=0;i<8;i++){const d=new Date(today.getTime()+i*86400000);const a=getMoonAge(d);const p=getMoonPhase(a);fc7.push({d,p,ill:getMoonIllum(a)});}
      return `<div class="amb-popup-label">Fase Lunare</div>
<div class="amb-popup-title">${phase.emoji} ${phase.name}</div>
<div class="amb-popup-section">
  <div style="font-size:13px;color:var(--text2);line-height:2;">
    📅 ${fmtFull(today)}<br>💡 Illuminazione: <strong>${getMoonIllum(age)}%</strong><br>
    📆 Età: <strong>${age.toFixed(1)}/29.5 giorni</strong><br>
    🌕 Luna Piena: <strong>${gv('dateFullMoon')}</strong><br>
    🌑 Luna Nuova: <strong>${gv('dateNewMoon')}</strong>
  </div>
</div>
<div class="amb-popup-section">
  <div class="amb-popup-label">Prossimi 8 giorni</div>
  ${fc7.map(({d,p,ill})=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
    <span style="font-size:12px;color:var(--text2);min-width:80px;">${fmtIT(d)}</span>
    <span style="font-size:20px;">${p.emoji}</span>
    <span style="font-size:12px;color:var(--text3);">${p.name}</span>
    <span style="font-size:12px;color:#3a9fd8;">${ill}%</span>
  </div>`).join('')}
</div>`; }

    case 'luna-piena': return `<div class="amb-popup-label">Luna Piena</div>
<div class="amb-popup-title">🌕 Prossima Luna Piena</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
📅 Data: <strong>${gv('dateFullMoon')}</strong><br>⏳ Mancano: <strong>${gv('daysToFull')} giorni</strong><br><br>
<strong>Cosa fare:</strong><br>
📸 Fotografa tutti gli esperimenti (Lakhovsky, pila galvanica, Pantacle)<br>
🔍 Osserva produzione resine sulle piante in fioritura<br>
⚡ Verifica tutti i circuiti<br>
💧 Somministra melassa (massima attività microbica)
</div></div>`;

    case 'luna-nuova': return `<div class="amb-popup-label">Luna Nuova</div>
<div class="amb-popup-title">🌑 Prossima Luna Nuova</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
📅 Data: <strong>${gv('dateNewMoon')}</strong><br>⏳ Mancano: <strong>${gv('daysToNew')} giorni</strong><br><br>
<strong>Cosa fare:</strong><br>
🧫 Rinnova infuso humus nel serbatoio (5L + 100-150g)<br>
📋 Pianifica la settimana e prepara additivi<br>
💧 Sciacqua il serbatoio da 50L<br>
🔧 Manutenzione generale sistema<br>
⛔ Evita trapianti e operazioni invasive
</div></div>`;

    case 'luna-attivita': return `<div class="amb-popup-label">Attività di Oggi</div>
<div class="amb-popup-title">📋 ${advice.main}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">${advice.detail}</div></div>
<div class="amb-popup-section">
  <div class="amb-popup-label">Tag</div>
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">${(advice.tags||[]).map(t=>`<span class="json-tag">${t}</span>`).join('')}</div>
</div>
<div class="amb-popup-section">
  <div class="amb-popup-label">La tua serra</div>
  <div style="font-size:13px;color:var(--text2);line-height:1.7;">${advice.serra}</div>
</div>`;

    case 'luna-irrigazione': return `<div class="amb-popup-label">Irrigazione Lunare</div>
<div class="amb-popup-title">💧 Irrigazione — ${phase.name}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">
${phase.code==='waxing_crescent'||phase.code==='waxing_gibbous'||phase.code==='first_quarter'?
'🌿 <strong>Fase crescente</strong>: le piante assorbono meglio. Ottimo per somministrare melassa (1ml/L) e infuso ortiche. La linfa sale verso foglie e fusti.':
phase.code==='full'?'🌕 <strong>Luna Piena</strong>: picco di assorbimento. Somministra la dose mensile di infuso ortiche e miscela organica.':
phase.code==='waning_gibbous'||phase.code==='last_quarter'||phase.code==='waning_crescent'?'🌿 <strong>Fase calante</strong>: linfa verso le radici. Priorità a humus e infuso in profondità. Riduci apporti fogliari.':
'🌑 <strong>Luna Nuova</strong>: rinnova l\'infuso di humus nel serbatoio. Sciacqua la tanica.'}<br><br>
<strong>Timer pompa:</strong> ${phase.code==='new'||phase.code==='waning_crescent'?'1 ciclo/giorno (piante a riposo)':'1–2 cicli/giorno (piante attive)'}<br>
<strong>Bordi vasi:</strong> controlla ogni mattina<br>
<strong>Melassa:</strong> ${phase.code==='full'||phase.code==='waxing_gibbous'?'✅ Ottimo momento':'ogni 15 giorni'}
</div></div>`;

    case 'luna-nutrizione': return `<div class="amb-popup-label">Nutrizione</div>
<div class="amb-popup-title">🧪 Nutrizione — ${phase.name}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
<strong>Priorità nutritive oggi:</strong><br>
${phase.code==='waxing_crescent'||phase.code==='first_quarter'?'🌿 <strong>Azoto (N)</strong> — crescita vegetativa. Infuso ortiche + fondi caffè.':
phase.code==='waxing_gibbous'||phase.code==='full'?'🌸 <strong>Potassio (K)</strong> — fioritura. Tè di banana con cenere di legna (ogni 2 sett., mesi 5-8).':
phase.code==='waning_gibbous'||phase.code==='last_quarter'?'🌿 <strong>Radici e microbi</strong> — humus in profondità. Pila galvanica ferro-rame più efficace.':
'🌑 <strong>Minima attività nutritiva</strong> — ideale per rinnovo humus e serbatoio.'}<br><br>
<strong>Calendario additivi:</strong><br>
🍯 Melassa 1ml/L → ogni 15 gg<br>
🌿 Ortiche + Miscela + Humus → 1×/mese<br>
🍌 Tè banana + cenere → ogni 2 sett. (mesi 5-8)<br>
🍎 Generatore etilene → mesi 7-8
</div></div>`;

    case 'luna-elettro': return `<div class="amb-popup-label">Elettrocultura</div>
<div class="amb-popup-title">⚡ Elettrocultura — ${phase.name}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
<strong>Stato consigliato:</strong><br>
${phase.code==='first_quarter'||phase.code==='full'?'⚡ <strong>OTTIMO</strong> — Attiva e verifica tutti i sistemi.':
phase.code==='waxing_crescent'||phase.code==='waxing_gibbous'?'🟢 <strong>BUONO</strong> — Controlla fissaggio Geomag.':
phase.code==='waning_gibbous'?'⚗️ <strong>PILA GALVANICA</strong> — particolarmente efficace ora (fase calante).':
'🔧 <strong>MANUTENZIONE</strong> — controlla integrità circuiti.'}<br><br>
<strong>Checklist:</strong><br>
☐ Bastoncini elettrocultura (10) stabili<br>
☐ Filo rame a spirale integro<br>
☐ Cerchi Lakhovsky: estremità sovrapposte 2-3 cm, 1 cm di spazio<br>
☐ Pantacle rame: archi tra vasi in contatto col terreno<br>
☐ Pila galvanica: chiodo ferro + filo rame collegati<br>
☐ Magnete principale vicino al tubo principale<br>
☐ Geomag (1/gocciolatoio) fissati con nastro
</div></div>`;

    case 'luna-avviso': return `<div class="amb-popup-label">Avviso</div>
<div class="amb-popup-title">⚠️ Avvisi Lunari</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
${phase.code==='full'?'🌕 <strong>LUNA PIENA</strong>: documenta gli esperimenti. Osserva resine e tricomi.<br><br>':''}
${phase.code==='new'?'🌑 <strong>LUNA NUOVA</strong>: evita trapianti. Giornata per pulizia e manutenzione.<br><br>':''}
${age>26?'⚠️ Fine ciclo (gg '+age.toFixed(0)+'/29.5). Rinnova humus e pulisci serbatoio presto.<br><br>':''}
${age<2?'🌑 Ciclo fresco iniziato. Imposta obiettivi del mese e prepara additivi.<br><br>':''}
<strong>Promemoria permanenti:</strong><br>
🌱 Bordi vasi: bagna manualmente ogni 7-10 gg<br>
🧲 Geomag: polo Nord verso il basso sui gocciolatori<br>
🍎 Mesi 7-8: cambia frutta etilene ogni 3-4 gg
</div></div>`;

    case 'luna-previsione': {
      const next7=[];
      for(let i=1;i<=7;i++){const d=new Date(today.getTime()+i*86400000);const a=getMoonAge(d);const p=getMoonPhase(a);const adv=getAdvice(p.code);next7.push({d,p,adv,ill:getMoonIllum(a)});}
      return `<div class="amb-popup-label">Previsione</div>
<div class="amb-popup-title">🔭 Prossimi 7 giorni</div>
${next7.map(({d,p,adv,ill})=>`<div class="amb-popup-section" style="padding:10px 0;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
    <span style="font-size:24px;">${p.emoji}</span>
    <div><div style="font-weight:700;">${fmtIT(d)}</div><div style="font-size:12px;color:var(--text3);">${p.name} · ${ill}%</div></div>
  </div>
  <div style="font-size:12px;color:var(--text2);">${adv.main}</div>
</div>`).join('')}`; }

    case 'luna-piante': {
      const piante=[
        {nome:'Epsilon F1',id:7,tipo:'Auto',fase:'Fioritura'},
        {nome:'Milky Way F1',id:1,tipo:'Auto',fase:'Fioritura'},
        {nome:'Titan F1',id:2,tipo:'Auto',fase:'Fioritura'},
        {nome:'Medusa F1',id:3,tipo:'Auto',fase:'Fioritura'},
        {nome:'Gaia F1',id:8,tipo:'Auto',fase:'Fioritura'},
        {nome:'Astro Lemonade F1',id:4,tipo:'Fem',fase:'Vegetativa'},
        {nome:'Cosmic Cheddar F1',id:11,tipo:'Fem',fase:'Vegetativa'},
        {nome:'Orbital Banana F1',id:6,tipo:'Fem',fase:'Vegetativa'},
        {nome:'Royal Gorilla',id:10,tipo:'Fem',fase:'Vegetativa'},
        {nome:'Mexican Rush',id:9,tipo:'Fem',fase:'Vegetativa'}
      ];
      const cons=(p)=>p.fase==='Fioritura'?(phase.code==='full'||phase.code==='waxing_gibbous'?'🌸 Ottimo per resine — tè banana':phase.code==='new'?'🌑 Rinnovo substrati':'✅ '+advice.main.split('—')[0]):(phase.code.includes('waxing')||phase.code==='first_quarter'?'🌿 Veg ottimale — ortiche':phase.code==='full'?'💪 Max assorbimento':'✅ '+advice.main.split('—')[0]);
      return `<div class="amb-popup-label">Correlazione</div>
<div class="amb-popup-title">🌱 Analisi per ogni pianta</div>
<div style="font-size:12px;color:var(--text3);margin-bottom:12px;">${phase.emoji} ${phase.name} · ${getMoonIllum(age)}% illuminazione</div>
${piante.map(p=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
  <div><div style="font-weight:700;font-size:13px;">${p.nome} <span style="font-size:10px;opacity:.6">ID:${p.id}</span></div><div style="font-size:11px;color:var(--text3);">${p.tipo} · ${p.fase}</div></div>
  <div style="font-size:11px;color:var(--text2);text-align:right;max-width:160px;line-height:1.4;">${cons(p)}</div>
</div>`).join('')}`; }

    /* ── BIO ── */
    case 'bio-oggi': {
      const adv=ADVICE[bioConst.type];
      return `<div class="amb-popup-label">Biodinamica Oggi</div>
<div class="amb-popup-title">${bioType.icon} Giorno ${bioType.label}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
📅 ${fmtFull(today)}<br>
♐ Costellazione: <strong>${bioConst.sym} ${bioConst.name}</strong><br>
🌍 Elemento: <strong>${bioConst.element}</strong>
</div></div>
<div class="amb-popup-section">
  <div class="amb-popup-label">Consigli per la serra</div>
  <div style="font-size:13px;color:var(--text2);line-height:1.7;">${adv.tips.map(t=>'✅ '+t).join('<br>')}</div>
</div>
<div class="amb-popup-section">
  <div class="amb-popup-label">Cosa evitare</div>
  <div style="font-size:13px;color:var(--orange);">
    ${bioConst.type==='frutto'?'❌ Non trapiantare. Non potare in modo invasivo.':
    bioConst.type==='fiore'?'❌ Evita concimazioni azotate pesanti.':
    bioConst.type==='radice'?'❌ Non disturbare la superficie del substrato.':
    '❌ Non ideale per raccolta o potature importanti.'}
  </div>
</div>`; }

    case 'bio-elettro': {
      const bioElMap={
        frutto:{t:'🍊 Giorno Frutto × Elettrocultura',d:'Ottimo per la produzione di resine. La pila galvanica ferro-rame e le antenne rame sono molto attive. La micro-corrente favorisce Potassio e Magnesio verso le zone produttive.',a:'⚡ Verifica tutti i circuiti. Somministra tè banana (K) se siamo nei mesi 5-8.'},
        fiore:{t:'🌸 Giorno Fiore × Elettrocultura',d:'I giorni Fiore (Aria/Luce) amplificano l\'effetto dell\'elettrocultura atmosferica. I bastoncini di rame captano meglio con alta pressione.',a:'🔁 Controlla i cerchi Lakhovsky: 2-3 cm sovrapposizione, 1 cm spazio. Documenta la crescita.'},
        radice:{t:'🌿 Giorno Radice × Elettrocultura',d:'I giorni Radice (Terra) sono i più potenti per la pila galvanica. La micro-corrente ionizza i nutrienti rendendoli disponibili alle radici.',a:'⚗️ Versa acqua con melassa sul chiodo di ferro per aumentare la conducibilità.'},
        foglia:{t:'💧 Giorno Foglia × Elettrocultura',d:'I giorni Foglia (Acqua) attivano il sistema Geomag. L\'acqua strutturata è teoricamente più attiva. Il Pantacle distribuisce le cariche tra tutti i vasi.',a:'🧲 Controlla fissaggio Geomag su ogni gocciolatoio e il magnete principale.'}
      };
      const m=bioElMap[bioConst.type]||bioElMap.frutto;
      return `<div class="amb-popup-label">Bio × Elettrocultura</div>
<div class="amb-popup-title">${m.t}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">${m.d}</div></div>
<div class="amb-popup-section"><div class="amb-popup-label">Azione oggi</div><div style="font-size:13px;color:var(--green3);line-height:1.7;">${m.a}</div></div>`; }


    case 'luna-fasi':
    case 'luna-fase': {
      const _a=getMoonAge(today),_p=getMoonPhase(_a),_il=getMoonIllum(_a),_adv=getAdvice(_p.code);
      return '<div class="amb-popup-label">Fase Lunare</div><div class="amb-popup-title">'+_p.emoji+' '+_p.name+'</div>'
        +'<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">Illuminazione: <strong>'+_il+'%</strong><br>Età: <strong>'+Math.round(_a)+' giorni</strong><br><br>'+_adv.detail+'</div></div>'
        +'<div class="amb-popup-section"><div class="amb-popup-label">Consigli</div><div style="font-size:13px;color:var(--text2);line-height:1.7;">'+_adv.tips.slice(0,3).map(function(t){return '✅ '+t;}).join('<br>')+'</div></div>';
    }
    case 'gdd-dettaglio': {
      const _gv=typeof _gddData!=='undefined'&&_gddData?Math.round(_gddData.total)+'':'—';
      return '<div class="amb-popup-label">Gradi Giorno</div><div class="amb-popup-title">📈 GDD Stagione 2026</div>'
        +'<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">GDD accumulati: <strong>'+_gv+' GDD</strong><br>Base 10°C · dal 1 gen 2026<br><br>🌱 Germinazione: 50-100 GDD<br>🌿 Vegetativa: 100-400 GDD<br>🌸 Pre-fioritura: 400-600 GDD<br>🍊 Maturazione: 600+ GDD</div></div>';
    }
    case 'lavori-oggi': {
      const _lv=getLavoriOggi(today);
      return '<div class="amb-popup-label">Piano di Lavoro</div><div class="amb-popup-title">🔧 '+_lv.titolo+'</div>'
        +'<div class="amb-popup-section"><div style="font-size:12px;color:var(--text3);margin-bottom:8px;">'+_lv.sub+'</div>'
        +'<div style="font-size:13px;color:var(--text2);line-height:2.0;">'+_lv.lavori.map(function(l){return '☐ '+l;}).join('<br>')+'</div></div>';
    }
    case 'matur-prossima': {
      const _mp=document.getElementById('cal-matur-prossima'),_md=document.getElementById('cal-matur-desc');
      return '<div class="amb-popup-label">Prossima Raccolta</div><div class="amb-popup-title">🍊 Maturazione</div>'
        +'<div class="amb-popup-section"><div style="font-size:14px;font-weight:700;color:var(--orange);">'+(_mp?_mp.textContent:'—')+'</div>'
        +'<div style="font-size:13px;color:var(--text2);margin-top:6px;">'+(_md?_md.textContent:'—')+'</div></div>'
        +'<div class="amb-popup-section"><div class="amb-popup-label">Ottimizzazione lunare</div><div style="font-size:13px;color:var(--text2);">Raccogli in Giorno Frutto 🍊 con luna calante. Ultimi 2 settimane: solo acqua pura.</div></div>';
    }
    case 'meteo-et': {
      const _et=document.getElementById('w-et');
      return '<div class="amb-popup-label">Evapotraspirazione</div><div class="amb-popup-title">💦 ETo Giornaliero</div>'
        +'<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">ETo: <strong>'+(_et?_et.textContent:'—')+'</strong><br><br>ETo < 3mm: irrigazione normale<br>ETo 3-5mm: +20% durata<br>ETo > 5mm: +40% durata</div></div>';
    }
    case 'semine-oggi': {
      const _sm=getSemineOggi(today);
      return '<div class="amb-popup-label">Semine & Trapianti</div><div class="amb-popup-title">'+_sm.emoji+' '+_sm.label+'</div>'
        +'<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">'+_sm.motivo+'</div></div>'
        +'<div class="amb-popup-section"><div class="amb-popup-label">Nota</div><div style="font-size:13px;color:var(--text2);">Giorni Radice + luna crescente = ottimale per trapianti cannabis.</div></div>';
    }
    case 'tratt-oggi': {
      const _tr=getTrattOggi(today);
      return '<div class="amb-popup-label">Trattamenti</div><div class="amb-popup-title">'+_tr.label+'</div>'
        +'<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">'+_tr.desc+'</div></div>';
    }
    case 'fenol-oggi': {
      const _fn=getFenolFase(today);
      return '<div class="amb-popup-label">Fenologia</div><div class="amb-popup-title">🌸 '+_fn.fase+'</div>'
        +'<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);">'+_fn.desc+'</div></div>';
    }
    case 'foto-oggi': {
      const _sn=calcSunTimes(today);
      return '<div class="amb-popup-label">Fotoperiodo</div><div class="amb-popup-title">☀️ '+_sn.dayLen.toFixed(1)+'h di luce</div>'
        +'<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">Alba: <strong>'+hToHHMM(_sn.sunrise)+'</strong><br>Tramonto: <strong>'+hToHHMM(_sn.sunset)+'</strong><br><br>⚡ Autofiorenti: ciclo fisso, ore extra = resa maggiore<br>🌸 Femminizzate: fioriscono sotto 12h (settembre Caserta)</div></div>';
    }
    case 'bio-oggi': {
      const _bc=getDayType(today),_bt=DAY_TYPES[_bc.type],_ba=ADVICE[_bc.type];
      return '<div class="amb-popup-label">Biodinamica</div><div class="amb-popup-title">'+_bt.icon+' '+_bt.label+'</div>'
        +'<div class="amb-popup-section"><div style="font-size:12px;color:var(--text3);">'+_bc.sym+' '+_bc.name+' · '+_bc.element+'</div>'
        +'<div style="font-size:13px;color:var(--text2);margin-top:8px;line-height:1.6;">'+_ba.short+'</div></div>'
        +'<div class="amb-popup-section"><div class="amb-popup-label">Consigli</div><div style="font-size:13px;color:var(--text2);line-height:1.7;">'+_ba.tips.slice(0,3).map(function(t){return '✅ '+t;}).join('<br>')+'</div></div>';
    }
    default: {
      // Prova nei popup del Calendario Unificato
      if (typeof buildCalPopupContent === 'function') {
        const r = buildCalPopupContent(type);
        if (r !== null) return r;
      }
      return `<div class="amb-popup-title">ℹ️ Info</div><div style="color:var(--text2);font-size:13px;">Dati non disponibili.</div>`;
    }
  }
}

/* ── Popup forecast ── */
function openForecastPopup(dayIdx) {
  const today=new Date();
  const d=new Date(today.getTime()+dayIdx*86400000);
  const a=getMoonAge(d); const p=getMoonPhase(a); const adv=getAdvice(p.code);
  const bioC=getDayType(d); const bioT=DAY_TYPES[bioC.type];
  const overlay=document.getElementById('amb-popup-overlay');
  const content=document.getElementById('amb-popup-content');
  if(!overlay||!content) return;
  content.innerHTML=`<div class="amb-popup-label">${dayIdx===0?'Oggi':fmtIT(d)}</div>
<div class="amb-popup-title">📅 ${fmtIT(d)}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">
🌙 Luna: <strong>${p.emoji} ${p.name}</strong> (${getMoonIllum(a)}%)<br>
🌿 Bio: <strong>${bioT.icon} Giorno ${bioT.label}</strong> · ${bioC.sym} ${bioC.name}
</div></div>
<div class="amb-popup-section"><div class="amb-popup-label">Consiglio lunare</div>
<div style="font-size:13px;color:var(--text2);line-height:1.7;">${adv.main}<br><br>${adv.detail}</div></div>
<div class="amb-popup-section"><div class="amb-popup-label">Serra</div>
<div style="font-size:13px;color:var(--green3);line-height:1.7;">${adv.serra}</div></div>`;
  overlay.style.display='flex'; document.body.style.overflow='hidden';
}

/* ── Popup fase lunare dalla tabella ── */
function openPhasePopup(code) {
  const pNames={new:'🌑 Luna Nuova',waxing_crescent:'🌒 Luna Crescente',first_quarter:'🌓 Primo Quarto',waxing_gibbous:'🌔 Gibbosa Crescente',full:'🌕 Luna Piena',waning_gibbous:'🌖 Gibbosa Calante',last_quarter:'🌗 Ultimo Quarto',waning_crescent:'🌘 Luna Calante'};
  const adv=getAdvice(code);
  const overlay=document.getElementById('amb-popup-overlay');
  const content=document.getElementById('amb-popup-content');
  if(!overlay||!content) return;
  content.innerHTML=`<div class="amb-popup-label">Fase Lunare</div>
<div class="amb-popup-title">${pNames[code]||code}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">${adv.detail}</div></div>
<div class="amb-popup-section"><div class="amb-popup-label">Tag</div>
<div style="display:flex;flex-wrap:wrap;gap:6px;">${(adv.tags||[]).map(t=>`<span class="json-tag">${t}</span>`).join('')}</div></div>
<div class="amb-popup-section"><div class="amb-popup-label">Serra</div>
<div style="font-size:13px;color:var(--text2);line-height:1.7;">${adv.serra}</div></div>`;
  overlay.style.display='flex'; document.body.style.overflow='hidden';
}

/* ══════════════════════════════════════════════════════════════
   LUNA — 6 sezioni cliccabili
══════════════════════════════════════════════════════════════ */
async function loadLunaConsigli6() {
  const today=new Date();
  const age=getMoonAge(today); const phase=getMoonPhase(age); const advice=getAdvice(phase.code);
  const setVal=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val;};
  // Dati calcolati localmente (sempre disponibili)
  setVal('lc-attivita', advice.main);
  setVal('lc-irrigazione', phase.code==='full'?'Max assorbimento — infuso ortiche':phase.code.includes('waxing')?'Fase crescente — piante assorbono':phase.code==='new'?'Rinnova infuso humus':'Fase calante — priorità radici');
  setVal('lc-nutrizione', phase.code.includes('waxing')||phase.code==='first_quarter'?'Azoto — infuso ortiche + caffè':phase.code==='full'||phase.code==='waxing_gibbous'?'Potassio — tè banana + cenere':phase.code.includes('waning')||phase.code==='last_quarter'?'Radici — humus + infuso':'🌑 Rinnovo humus e serbatoio');
  setVal('lc-elettro', phase.code==='full'||phase.code==='first_quarter'?'⚡ OTTIMO — verifica tutti i circuiti':phase.code==='waning_gibbous'?'⚗️ Pila galvanica efficace oggi':'🔧 Controlla integrità circuiti');
  setVal('lc-avviso', age>26?'Fine ciclo (gg '+age.toFixed(0)+'). Rinnova humus.':age<1.5?'Luna nuova: evita trapianti oggi':phase.code==='full'?'Luna piena: documenta esperimenti':'Nessun avviso urgente');
  const tom=new Date(today.getTime()+86400000); const pa=getMoonAge(tom); const pp=getMoonPhase(pa);
  setVal('lc-previsione', 'Domani: '+pp.emoji+' '+pp.name+' ('+getMoonIllum(pa)+'%)');
  // Aggiorna preview luna-piante
  const prev=document.getElementById('luna-piante-preview');
  if(prev) prev.textContent=phase.emoji+' '+phase.name+' · '+advice.detail.split('.')[0]+'. Tocca per analisi per ogni pianta.';
  // Prova JSON
  try {
    const data=await fetchGHJson('luna_consigli.json');
    if(!data) return;
    const meta=document.getElementById('luna-json-meta');
    if(meta) meta.textContent='JSON: '+fmtJsonDate(data.aggiornato||data.updated_at||data.data);
    const items=data.consigli||data.items||data.consigli_lunari||[];
    if(!items.length) return;
    const find=(keys)=>{for(const k of keys){const f=items.find(i=>(i.titolo||'').toLowerCase().includes(k)||(i.testo||'').toLowerCase().includes(k));if(f)return(f.titolo?f.titolo+': ':'')+( f.testo||f.body||'');}return null;};
    const a=find(['attivit','oggi']);if(a)setVal('lc-attivita',a);
    const ir=find(['irrig','acqua']);if(ir)setVal('lc-irrigazione',ir);
    const nu=find(['nutriz','fertil','melassa','ortic']);if(nu)setVal('lc-nutrizione',nu);
    const el=find(['elettro','rame','lakhovsky','pila']);if(el)setVal('lc-elettro',el);
    const av=find(['avvis','alert']);if(av)setVal('lc-avviso',av);
    const pr=find(['previs','prossim']);if(pr)setVal('lc-previsione',pr);
  } catch(e) { /* usa dati locali */ }
}

/* ══════════════════════════════════════════════════════════════
   BIO — prossimi 3 giorni + correlazione
══════════════════════════════════════════════════════════════ */
function renderBio3Giorni() {
  const c=document.getElementById('bio-3giorni'); if(!c) return;
  const today=new Date();
  const items=[];
  for(let i=1;i<=3;i++){const d=new Date(today.getTime()+i*86400000);const cd=getDayType(d);const dt=DAY_TYPES[cd.type];const adv=ADVICE[cd.type];items.push({d,cd,dt,adv});}
  c.innerHTML=items.map(({d,cd,dt,adv},i)=>`
    <div class="amb-pianta-card" onclick="openBio3Popup(${i})">
      <div style="font-size:22px;">${dt.icon}</div>
      <div style="flex:1;"><div style="font-size:12px;font-weight:700;">${fmtIT(d)}</div>
      <div style="font-size:11px;color:var(--text3);">${dt.label} · ${cd.sym} ${cd.name}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:2px;">${adv.short}</div></div>
      <div style="color:var(--text3);">›</div>
    </div>`).join('');
}

function openBio3Popup(idx) {
  const today=new Date();
  const d=new Date(today.getTime()+(idx+1)*86400000);
  const cd=getDayType(d); const dt=DAY_TYPES[cd.type]; const adv=ADVICE[cd.type];
  const overlay=document.getElementById('amb-popup-overlay');
  const content=document.getElementById('amb-popup-content');
  if(!overlay||!content) return;
  content.innerHTML=`<div class="amb-popup-label">${fmtIT(d)}</div>
<div class="amb-popup-title">${dt.icon} Giorno ${dt.label}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">
♐ ${cd.sym} ${cd.name} · 🌍 ${cd.element}
</div></div>
<div class="amb-popup-section"><div class="amb-popup-label">Consigli serra</div>
<div style="font-size:13px;color:var(--text2);line-height:1.7;">${adv.tips.map(t=>'✅ '+t).join('<br>')}</div></div>`;
  overlay.style.display='flex'; document.body.style.overflow='hidden';
}

function updateBioElettroPreview() {
  const p=document.getElementById('bio-elettro-preview'); if(!p) return;
  const cd=getDayType(new Date());
  const msgs={frutto:'🍊 Giorno Frutto: pila galvanica e antenne rame molto attive. Potassio verso le cime.',
    fiore:'🌸 Giorno Fiore: elettrocultura atmosferica amplificata. Controlla i bastoncini.',
    radice:'🌿 Giorno Radice: pila galvanica ferro-rame al massimo. Ionizzazione radici.',
    foglia:'💧 Giorno Foglia: acqua strutturata più attiva. Controlla Geomag e magnete principale.'};
  p.textContent=msgs[cd.type]||msgs.frutto;
}
/* ══════════════════════════════════════════════════════════════
   NUOVI CALENDARI AMBIENTE — Semine, Trattamenti, Fotoperiodo, Fenologico
══════════════════════════════════════════════════════════════ */

const _PIANTE = [
  {id:7,  nome:'Epsilon F1',       tipo:'auto', germ:'2026-04-21', raccolta:'2026-06-20'},
  {id:1,  nome:'Milky Way F1',     tipo:'auto', germ:'2026-04-23', raccolta:'2026-07-07'},
  {id:2,  nome:'Titan F1',         tipo:'auto', germ:'2026-04-22', raccolta:'2026-07-06'},
  {id:3,  nome:'Medusa F1',        tipo:'auto', germ:'2026-04-21', raccolta:'2026-07-05'},
  {id:8,  nome:'Gaia F1',          tipo:'auto', germ:'2026-04-21', raccolta:'2026-06-30'},
  {id:4,  nome:'Astro Lemonade F1',tipo:'femm', germ:'2026-04-21', raccolta:'2026-11-15'},
  {id:11, nome:'Cosmic Cheddar F1',tipo:'femm', germ:'2026-05-02', raccolta:'2026-11-15'},
  {id:6,  nome:'Orbital Banana F1',tipo:'femm', germ:'2026-04-30', raccolta:'2026-11-15'},
  {id:10, nome:'Royal Gorilla',    tipo:'femm', germ:'2026-04-22', raccolta:'2026-11-25'},
  {id:9,  nome:'Mexican Rush',     tipo:'femm', germ:'2026-04-21', raccolta:'2026-11-25'},
];
const _ORE_LUCE = [9.5,10.5,11.8,13.2,14.3,15.0,14.7,13.6,12.2,10.8,9.7,9.2];
const _MESI_S = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function _fasePianta(p, oggi) {
  const g = new Date(p.germ); const r = new Date(p.raccolta);
  const days = Math.floor((oggi - g) / 86400000);
  if (oggi < g) return {fase:'Pre-germinazione', emoji:'🌰', days:0};
  if (oggi > r) return {fase:'Raccolta completata', emoji:'✅', days};
  if (p.tipo === 'auto') {
    if (days < 30) return {fase:'Vegetativa', emoji:'🌿', days};
    return {fase:'Fioritura', emoji:'🌸', days};
  } else {
    const fiorIn = new Date(p.tipo === 'femm' ? p.raccolta : p.raccolta);
    fiorIn.setMonth(9); fiorIn.setDate(1); // ottobre
    if (oggi < fiorIn) return {fase:'Vegetativa', emoji:'🌿', days};
    return {fase:'Fioritura', emoji:'🌸', days};
  }
}

/* ── Semine: popola il semaforo e la lista piante ── */
function _renderSemine() {
  const today = new Date();
  try {
    const age = getMoonAge(today);
    const ph  = getMoonPhase(age);
    const cd  = getDayType(today);
    const lunaCresc = ['waxing_crescent','first_quarter','waxing_gibbous'].includes(ph.code);
    const giornoBuono = ['frutto','fiore'].includes(cd.type);
    const emEl = document.getElementById('semine-oggi-emoji');
    const lbEl = document.getElementById('semine-oggi-label');
    const mvEl = document.getElementById('semine-oggi-motivo');
    if (lunaCresc && giornoBuono) {
      if(emEl) emEl.textContent = '✅';
      if(lbEl) lbEl.textContent = 'Favorevole per semine e trapianti';
      if(mvEl) mvEl.textContent = ph.emoji + ' Luna crescente · ' + DAY_TYPES[cd.type].icon + ' ' + DAY_TYPES[cd.type].label;
    } else if (!lunaCresc) {
      if(emEl) emEl.textContent = '⛔';
      if(lbEl) lbEl.textContent = 'Sfavorevole — luna calante';
      if(mvEl) mvEl.textContent = ph.emoji + ' ' + ph.name + ' · evita trapianti';
    } else {
      if(emEl) emEl.textContent = '⚪';
      if(lbEl) lbEl.textContent = 'Neutro';
      if(mvEl) mvEl.textContent = ph.emoji + ' ' + ph.name + ' · ' + DAY_TYPES[cd.type].label;
    }
  } catch(e) {}

  const list = document.getElementById('semine-piante-list');
  if (!list) return;
  list.innerHTML = _PIANTE.map(p => {
    const f = _fasePianta(p, today);
    const col = f.fase === 'Vegetativa' ? 'var(--green3)' : f.fase === 'Fioritura' ? '#ce93d8' : 'var(--text3)';
    return '<div class="amb-pianta-card" onclick="openAmbPopup(&quot;semine-pianta-' + p.id + '&quot;)" style="cursor:pointer;">' +
      '<div style="font-size:18px;">' + (p.tipo==='auto'?'⚡':'🌸') + '</div>' +
      '<div style="flex:1;"><div style="font-size:12px;font-weight:700;">' + p.nome + '</div>' +
      '<div style="font-size:11px;color:' + col + ';margin-top:2px;">' + f.emoji + ' ' + f.fase + ' · ' + f.days + ' gg dalla germ.</div></div>' +
      '<div style="color:var(--text3);">›</div></div>';
  }).join('');
}

/* ── Trattamenti: popola il suggerimento di oggi ── */
function _renderTrattamenti() {
  try {
    const cd = getDayType(new Date());
    const tipo = cd.type;
    const suggerimenti = {
      radice: {label:'🦠 Melassa + Rinnovo Humus + Miscela Organica', desc:'Giorno Radice: microbi al massimo. Somministra melassa (1ml/L) e rinnova infuso humus in tanica.'},
      foglia: {label:'🌿 Infuso Ortiche', desc:'Giorno Foglia: assorbimento idrico elevato. Infuso ortiche diluito 1:10 (1-2L per vaso).'},
      frutto: {label:'🍌 Tè Banana + Cenere', desc:'Giorno Frutto: potassio ottimale. Bolli bucce, filtra, aggiungi cenere, diluisci 1:5.'},
      fiore:  {label:'🌸 Tè Banana + Cenere', desc:'Giorno Fiore: terpeni al picco. Tè banana amplifica aromi. Evita trattamenti fogliari bagnanti.'},
    };
    const s = suggerimenti[tipo] || {label:'💧 Solo irrigazione', desc:'Nessun trattamento specifico oggi.'};
    const lbEl = document.getElementById('tratt-oggi-label');
    const dsEl = document.getElementById('tratt-oggi-desc');
    if(lbEl) lbEl.textContent = s.label;
    if(dsEl) dsEl.textContent = s.desc;
  } catch(e) {}
}

/* ── Fotoperiodo: popola grafico e testi ── */
function _renderFotoperiodo() {
  const m    = new Date().getMonth();
  const ore  = _ORE_LUCE[m];
  const sr   = document.getElementById('w-sunrise');
  const ss   = document.getElementById('w-sunset');

  const fOre  = document.getElementById('foto-ore-oggi');
  const fAlba = document.getElementById('foto-alba-tramonto');
  const fAuto = document.getElementById('foto-auto-txt');
  const fFemm = document.getElementById('foto-femm-txt');

  if(fOre) {
    const dlEl = document.getElementById('w-daylen');
    fOre.textContent = (dlEl && dlEl.textContent !== '—h') ? dlEl.textContent : ore + 'h';
  }
  if(fAlba && sr && ss) fAlba.textContent = 'Alba ' + sr.textContent + ' · Tramonto ' + ss.textContent;

  const mult = (18 / ore).toFixed(2);
  if(fAuto) fAuto.textContent = ore + 'h · mult. ×' + mult + (ore >= 16 ? ' ✅' : ore >= 14 ? ' ⚠️' : ' 🔴');
  if(fFemm) fFemm.textContent = ore > 12 ? ore + 'h · 🌿 Vegetativa' : ore + 'h · 🌸 Fioritura indotta';

  const graf = document.getElementById('foto-grafico');
  if(!graf) return;
  const max = Math.max.apply(null, _ORE_LUCE);
  graf.innerHTML = _ORE_LUCE.map(function(o, i) {
    const isCur = i === m;
    const pct = Math.round(o / max * 100);
    const col = o <= 12 ? '#f48fb1' : o >= 15 ? '#81c784' : '#64b5f6';
    return '<div style="display:flex;align-items:center;gap:8px;cursor:pointer;" onclick="openAmbPopup(&quot;foto-mese-' + i + '&quot;)">' +
      '<div style="font-size:11px;min-width:28px;' + (isCur ? 'color:var(--green3);font-weight:700;' : 'color:var(--text3);') + '">' + _MESI_S[i] + '</div>' +
      '<div style="flex:1;height:18px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;">' +
        '<div style="height:100%;width:' + pct + '%;background:' + (isCur ? 'var(--green)' : col) + ';border-radius:4px;"></div></div>' +
      '<div style="font-size:11px;font-weight:' + (isCur ? '700' : '400') + ';color:' + (isCur ? 'var(--green3)' : 'var(--text2)') + ';min-width:30px;">' + o + 'h</div>' +
      (o <= 12 ? '<div style="font-size:10px;">🌸</div>' : '') +
      (isCur ? '<div style="font-size:10px;color:var(--green3);font-weight:700;">◀</div>' : '') +
      '</div>';
  }).join('');
}

/* ── Fenologico: popola fase e lista piante ── */
function _renderFenologico() {
  const today = new Date();
  const piante = _PIANTE.map(function(p){ return Object.assign({}, p, _fasePianta(p, today)); });

  const fazioCount = {};
  piante.forEach(function(p){ fazioCount[p.fase] = (fazioCount[p.fase]||0)+1; });
  const fasePred = Object.keys(fazioCount).sort(function(a,b){return fazioCount[b]-fazioCount[a];})[0];
  const fenEl = document.getElementById('fenol-fase-oggi');
  if(fenEl) fenEl.textContent = fasePred + ' (' + fazioCount[fasePred] + ' piante) · ' + piante.filter(function(p){return p.fase===fasePred;}).map(function(p){return p.nome;}).join(', ');

  const list = document.getElementById('fenol-piante');
  if(list) {
    list.innerHTML = piante.map(function(p) {
      const col = p.fase==='Vegetativa'?'var(--green3)':p.fase==='Fioritura'?'#ce93d8':'var(--text3)';
      const pct = Math.min(100, Math.round(p.days / 210 * 100));
      return '<div class="amb-pianta-card" onclick="openAmbPopup(&quot;fenol-pianta-' + p.id + '&quot;)" style="cursor:pointer;">' +
        '<div style="font-size:16px;">' + (p.tipo==='auto'?'⚡':'🌸') + '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-size:12px;font-weight:700;">' + p.nome + '</div>' +
          '<div style="font-size:11px;color:' + col + ';">' + p.emoji + ' ' + p.fase + '</div>' +
          '<div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;margin-top:3px;"><div style="height:100%;width:' + pct + '%;background:' + col + ';border-radius:2px;"></div></div>' +
        '</div>' +
        '<div style="color:var(--text3);">›</div></div>';
    }).join('');
  }

  const stagEl = document.getElementById('fenol-stagionale');
  if(stagEl) {
    const fasi = [
      {m:3,  label:'🌱 Germinazione',           chi:'Tutte le 10 piante'},
      {m:4,  label:'🌿 Crescita vegetativa',     chi:'Autofiorenti + Femminizzate'},
      {m:5,  label:'🌸 Fioritura autofiorenti',  chi:'Epsilon, Gaia, Medusa, Titan, Milky Way'},
      {m:9,  label:'🍂 Cambio fotoperiodo',      chi:'Femminizzate entrano in fioritura'},
      {m:10, label:'🌸 Fioritura femminizzate',  chi:'Astro Lemonade, Orbital Banana, Cosmic Cheddar'},
      {m:11, label:'🍊 Raccolta femminizzate',   chi:'Tutte le femminizzate'},
    ];
    const cur = today.getMonth();
    stagEl.innerHTML = fasi.map(function(f) {
      const isCur = f.m === cur;
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;' + (isCur?'background:rgba(74,175,94,0.12);border:1px solid rgba(74,175,94,0.25);':'') + '">' +
        '<div style="font-size:12px;font-weight:700;color:var(--text3);min-width:28px;">' + _MESI_S[f.m] + '</div>' +
        '<div style="flex:1;"><div style="font-size:13px;font-weight:' + (isCur?'700':'500') + ';' + (isCur?'color:var(--green3);':'') + '">' + f.label + '</div>' +
        '<div style="font-size:11px;color:var(--text2);">' + f.chi + '</div></div>' +
        (isCur ? '<div style="font-size:10px;color:var(--green3);font-weight:700;">← ORA</div>' : '') +
        '</div>';
    }).join('');
  }
}

/* ── Popup per i nuovi tipi ── */
function _buildPopupNuovi(type) {
  var today = new Date();
  var ph, cd, age;
  try { age=getMoonAge(today); ph=getMoonPhase(age); cd=getDayType(today); } catch(e) { ph={name:'?',emoji:'?',code:'?'}; cd={type:'frutto'}; }
  var lunaCresc = ['waxing_crescent','first_quarter','waxing_gibbous'].indexOf(ph.code) >= 0;

  if (type === 'semine-oggi') {
    var favStr = lunaCresc ? '✅ FAVOREVOLE — luna crescente' : '⛔ SFAVOREVOLE — luna calante o nuova';
    var motStr = lunaCresc
      ? 'Ottimo per trapiantare e rinvasare. Le radici si sviluppano con luna crescente.'
      : 'Evita trapianti. Concentrati su irrigazione e trattamenti del suolo.';
    var pianteStr = _PIANTE.map(function(p){ var f=_fasePianta(p,today); return (p.tipo==='auto'?'⚡':'🌸')+' <strong>'+p.nome+'</strong>: '+f.emoji+' '+f.fase; }).join('<br>');
    return '<div class="amb-popup-title">🌱 Semine &amp; Trapianti</div>' +
      '<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">' +
      'Luna: ' + ph.emoji + ' <strong>' + ph.name + '</strong><br>' +
      'Bio: ' + DAY_TYPES[cd.type].icon + ' <strong>' + DAY_TYPES[cd.type].label + '</strong><br><br>' +
      '<strong>' + favStr + '</strong><br>' + motStr +
      '</div></div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">Le 10 varietà oggi</div>' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.8;">' + pianteStr + '</div></div>';
  }
  if (type === 'tratt-melassa') {
    return '<div class="amb-popup-title">🍯 Melassa</div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">📋 Ricetta</div>' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">Sciogliere <strong>1 ml per litro</strong> in bottiglia separata da 15-25L. NON aggiungere al serbatoio principale. Irrigare tutte le 10 piante.</div></div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">⏱️ Cadenza · Giorno ottimale</div>' +
      '<div style="font-size:13px;color:var(--text2);">Ogni 15 giorni · 🌿 Giorni Radice o Foglia</div></div>';
  }
  if (type === 'tratt-ortiche') {
    return '<div class="amb-popup-title">🌿 Infuso Ortiche</div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">📋 Ricetta</div>' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">100-150g foglie ortiche fresche in 1L acqua. Macera 3-7 giorni. Filtra. Diluisci <strong>1:10</strong>. Somministra 1-2L per vaso.</div></div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">⏱️ Cadenza · Giorno ottimale</div>' +
      '<div style="font-size:13px;color:var(--text2);">1x al mese · 💧 Giorni Foglia</div></div>';
  }
  if (type === 'tratt-banana') {
    return '<div class="amb-popup-title">🍌 Te di Banana + Cenere</div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">📋 Ricetta</div>' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">Bolli 3-4 bucce di banana in 1L acqua per 15 min. Raffredda, filtra. Aggiungi <strong>1 cucchiaino di cenere di legna</strong>. Diluisci <strong>1:5</strong>.</div></div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">⏱️ Cadenza · Mesi</div>' +
      '<div style="font-size:13px;color:var(--text2);">Ogni 2 settimane · 🍊 Giorni Frutto/Fiore · Solo mesi 5-8</div></div>';
  }
  if (type === 'tratt-humus') {
    return '<div class="amb-popup-title">🦠 Rinnovo Humus</div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">📋 Ricetta</div>' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">Prepara <strong>5L acqua + 100-150g BioBizz Worm Humus</strong> in contenitore separato. Infusione 1h. Versa nella tanica da 50L.</div></div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">⏱️ Cadenza · Giorno ottimale</div>' +
      '<div style="font-size:13px;color:var(--text2);">1x al mese · 🌿 Giorni Radice</div></div>';
  }
  if (type === 'tratt-miscela') {
    return '<div class="amb-popup-title">🥚 Miscela Organica</div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">📋 Ricetta</div>' +
      '<div style="font-size:13px;color:var(--text2);line-height:1.7;">Gusci uovo + bucce banana + fondi caffe — essiccati e tritati. <strong>1 cucchiaio grande per vaso</strong>. Mescola con humus. Poi irrigare.</div></div>' +
      '<div class="amb-popup-section"><div class="amb-popup-label">Funzione</div>' +
      '<div style="font-size:13px;color:var(--text2);">Calcio + Potassio + Azoto · 🌿 Giorni Radice</div></div>';
  }
  if (type === 'tratt-oggi') {
    var testi = {
      radice: 'Giorno Radice: melassa (1ml/L) + rinnovo humus + miscela organica. Microbi al massimo.',
      foglia: 'Giorno Foglia: infuso ortiche diluito 1:10 (1-2L per vaso). Massimo assorbimento idrico.',
      frutto: 'Giorno Frutto: te di banana con cenere (1:5). Potassio per resine e aromi.',
      fiore:  'Giorno Fiore: te di banana con cenere (1:5). Evita spruzzi sulle cime.'
    };
    return '<div class="amb-popup-title">' + DAY_TYPES[cd.type].icon + ' Trattamento ottimale</div>' +
      '<div class="amb-popup-section"><div style="font-size:14px;color:var(--text2);line-height:1.7;">' + (testi[cd.type]||'Solo irrigazione.') + '</div></div>';
  }
  if (type === 'foto-oggi') {
    var m = today.getMonth(); var ore = _ORE_LUCE[m]; var mult = (18/ore).toFixed(2);
    var condAuto = ore>=16 ? '✅ Eccellenti' : ore>=14 ? '⚠️ Buone' : '🔴 Valuta lampada';
    var condFemm = ore>12 ? '🌿 Vegetativa ('+ore+'h > 12h)' : '🌸 Fioritura indotta!';
    return '<div class="amb-popup-title">☀️ Fotoperiodo ' + _MESI_S[m] + ' — Caserta</div>' +
      '<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">' +
      'Ore luce: <strong>' + ore + 'h</strong><br><br>' +
      '⚡ <strong>Autofiorenti</strong> — ore ideali 18h<br>' +
      'Moltiplicatore: <strong>x' + mult + '</strong> · ' + condAuto + '<br><br>' +
      '🌸 <strong>Femminizzate</strong> — soglia 12h<br>' + condFemm +
      '</div></div>';
  }
  if (type.indexOf('foto-mese-') === 0) {
    var mi = parseInt(type.split('-')[2]); var ore2 = _ORE_LUCE[mi]; var mult2 = (18/ore2).toFixed(2);
    return '<div class="amb-popup-title">☀️ ' + _MESI_S[mi] + ' — Fotoperiodo</div>' +
      '<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">' +
      'Ore medie: <strong>' + ore2 + 'h</strong><br>' +
      '⚡ Autofiorenti: x' + mult2 + '<br>' +
      '🌸 Femminizzate: ' + (ore2>12 ? '🌿 Vegetativa' : '🌸 Fioritura') +
      '</div></div>';
  }
  if (type.indexOf('semine-pianta-') === 0 || type.indexOf('fenol-pianta-') === 0) {
    var pid = parseInt(type.split('-')[2]);
    var p = null;
    for (var pi=0; pi<_PIANTE.length; pi++) { if (_PIANTE[pi].id===pid) { p=_PIANTE[pi]; break; } }
    if (!p) return '<div>Pianta non trovata</div>';
    var fP = _fasePianta(p, today);
    return '<div class="amb-popup-title">' + (p.tipo==='auto'?'⚡':'🌸') + ' ' + p.nome + '</div>' +
      '<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.8;">' +
      'Tipo: <strong>' + (p.tipo==='auto'?'Autofiorente':'Femminizzata') + '</strong><br>' +
      'Germinazione: <strong>' + p.germ + '</strong><br>' +
      'Raccolta: <strong>' + p.raccolta + '</strong><br>' +
      'Fase: <strong>' + fP.emoji + ' ' + fP.fase + '</strong><br>' +
      'Giorni dalla germ.: <strong>' + fP.days + '</strong>' +
      '</div></div>';
  }
  return null;
}




/* ══════════════════════════════════════════════════════════════
   CALENDARIO UNIFICATO — Sistema completo 11 sotto-tab
   Coordinate: 41.09696262016739, 14.388065360906802 (Caserta)
══════════════════════════════════════════════════════════════ */

const CAL_LAT = 41.09696262016739;
const CAL_LON = 14.388065360906802;

/* Dati piante */
const CAL_PIANTE = [
  {id:7,  nome:'Epsilon F1',       tipo:'auto', germ:'2026-04-21', giorni:60,  fiorGG:30, label:'30-40gg fioritura'},
  {id:1,  nome:'Milky Way F1',     tipo:'auto', germ:'2026-04-23', giorni:72,  fiorGG:42, label:'42-45gg fioritura'},
  {id:2,  nome:'Titan F1',         tipo:'auto', germ:'2026-04-22', giorni:72,  fiorGG:40, label:'40-45gg fioritura'},
  {id:3,  nome:'Medusa F1',        tipo:'auto', germ:'2026-04-21', giorni:72,  fiorGG:40, label:'40-45gg fioritura'},
  {id:8,  nome:'Gaia F1',          tipo:'auto', germ:'2026-04-21', giorni:67,  fiorGG:40, label:'40-45gg fioritura'},
  {id:4,  nome:'Astro Lemonade F1',tipo:'femm', germ:'2026-04-21', raccolta:'2026-10-30', fiorInizio:'2026-10-01', fiorGG:55, label:'Fioritura inizio ott.'},
  {id:11, nome:'Cosmic Cheddar F1',tipo:'femm', germ:'2026-05-02', raccolta:'2026-10-30', fiorInizio:'2026-10-01', fiorGG:55, label:'Fioritura inizio ott.'},
  {id:6,  nome:'Orbital Banana F1',tipo:'femm', germ:'2026-04-30', raccolta:'2026-10-30', fiorInizio:'2026-10-01', fiorGG:60, label:'Fioritura inizio ott.'},
  {id:10, nome:'Royal Gorilla',    tipo:'femm', germ:'2026-04-22', raccolta:'2026-11-09', fiorInizio:'2026-10-15', fiorGG:60, label:'Fioritura metà ott.'},
  {id:9,  nome:'Mexican Rush',     tipo:'femm', germ:'2026-04-21', raccolta:'2026-11-09', fiorInizio:'2026-10-15', fiorGG:65, label:'Fioritura metà ott.'}
];

/* ── Toggle calendario ── */
let _calOpen = false;
function toggleCalendario() {
  _calOpen = !_calOpen;
  const w = document.getElementById('cal-wrapper');
  const a = document.getElementById('cal-toggle-arrow');
  if (w) w.style.display = _calOpen ? 'block' : 'none';
  if (a) a.style.transform = _calOpen ? 'rotate(180deg)' : '';
  if (_calOpen) switchCalTab('oggi');
}

/* ── Switch sotto-tab ── */
function switchCalTab(tab) {
  document.querySelectorAll('.cal-subtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.cal-panel').forEach(p => p.classList.remove('active'));
  const btn = document.getElementById('cst-' + tab);
  const panel = document.getElementById('cal-panel-' + tab);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');
  const renders = {
    oggi:   renderCalOggi,
    lunare: renderCalLunare,
    bio:    renderCalBio,
    semine: renderCalSemine,
    tratt:  renderCalTratt,
    foto:   renderCalFoto,
    fenol:  renderCalFenol,
    lavori: renderCalLavori,
    gdd:    renderCalGDD,
    gelo:   renderCalGelo,
    matur:  renderCalMatur
  };
  if (renders[tab]) renders[tab]();
}

/* ══════════════════════════════════════════════════════════════
   UTILITÀ ASTRONOMICHE
══════════════════════════════════════════════════════════════ */

/* Calcolo alba/tramonto (algoritmo NOAA adattato) */
function calcSunTimes(date) {
  const lat = CAL_LAT, lon = CAL_LON;
  const JD = dateToJD(date);
  const n = JD - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) % 360;
  const gR = g * Math.PI / 180;
  const lambda = L + 1.915 * Math.sin(gR) + 0.02 * Math.sin(2 * gR);
  const lambdaR = lambda * Math.PI / 180;
  const epsilon = 23.439 - 0.0000004 * n;
  const epsilonR = epsilon * Math.PI / 180;
  const RA = Math.atan2(Math.cos(epsilonR) * Math.sin(lambdaR), Math.cos(lambdaR)) * 180 / Math.PI;
  const decl = Math.asin(Math.sin(epsilonR) * Math.sin(lambdaR));
  const EqT = (L - RA + 720) % 360;
  const solarNoon = 720 - 4 * lon - EqT;
  const latR = lat * Math.PI / 180;
  const hAngle = Math.acos((Math.sin(-0.8333 * Math.PI / 180) - Math.sin(latR) * Math.sin(decl)) /
    (Math.cos(latR) * Math.cos(decl)));
  const hAngleDeg = hAngle * 180 / Math.PI;
  const sunrise = (solarNoon - hAngleDeg * 4) / 60;
  const sunset = (solarNoon + hAngleDeg * 4) / 60;
  const dayLen = sunset - sunrise;
  return { sunrise, sunset, dayLen };
}

function hToHHMM(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return String(hh).padStart(2,'0') + ':' + String(mm % 60).padStart(2,'0');
}

/* ══════════════════════════════════════════════════════════════
   TAB OGGI — Card integrata
══════════════════════════════════════════════════════════════ */
function renderCalOggi() {
  const today = new Date();
  const el = document.getElementById('cal-oggi-data');
  if (el) el.textContent = fmtFull(today);

  const sun = calcSunTimes(today);
  const age = getMoonAge(today);
  const phase = getMoonPhase(age);
  const advice = getAdvice(phase.code);
  const bio = getDayType(today);
  const bioT = DAY_TYPES[bio.type];
  const fenol = getFenolFase(today);
  const lavoriOggi = getLavoriOggi(today);
  const sem = getSemineOggi(today);
  const tratt = getTrattOggi(today);
  const irrig = getIrrigOggi(today, sun);

  const rows = [
    { icon:'🌙', label:'Luna', val: phase.emoji + ' ' + phase.name, sub: getMoonIllum(age) + '% illuminazione', popup:'luna-fase' },
    { icon:'🌱', label:'Biodinamica', val: bioT.icon + ' ' + bioT.label, sub: bio.sym + ' ' + bio.name, popup:'bio-oggi' },
    { icon:'🌾', label:'Semine', val: sem.emoji + ' ' + sem.label, sub: sem.motivo, popup:'cal-semine-oggi' },
    { icon:'🧪', label:'Trattamenti', val: tratt.label, sub: tratt.desc, popup:'cal-tratt-oggi' },
    { icon:'☀️', label:'Fotoperiodo', val: sun.dayLen.toFixed(1).replace('.',',') + 'h luce', sub: '🌅 ' + hToHHMM(sun.sunrise) + ' → 🌇 ' + hToHHMM(sun.sunset), popup:'cal-foto-oggi' },
    { icon:'🌸', label:'Fase Fenologica', val: fenol.fase, sub: fenol.desc, popup:'cal-fenol-oggi' },
    { icon:'🔧', label:'Lavori oggi', val: lavoriOggi.titolo, sub: lavoriOggi.sub, popup:'cal-lavori-oggi' },
    { icon:'💧', label:'Irrigazione', val: irrig.label, sub: irrig.desc, popup:'meteo-impatto' },
  ];

  const grid = document.getElementById('oggi-master-grid');
  if (grid) {
    grid.innerHTML = rows.map(r => `
      <div class="cal-oggi-row" onclick="openAmbPopup('${r.popup}')">
        <div class="cal-oggi-icon">${r.icon}</div>
        <div style="flex:1;min-width:0;">
          <div class="cal-oggi-label">${r.label}</div>
          <div class="cal-oggi-val">${r.val}</div>
          <div class="cal-oggi-sub">${r.sub}</div>
        </div>
        <div style="color:var(--text3);flex-shrink:0;">›</div>
      </div>`).join('');
  }

  // Consiglio AI integrato da JSON
  const ai = document.getElementById('cal-oggi-ai');
  if (ai) {
    ai.innerHTML = `
      <strong>${phase.emoji} ${phase.name}</strong> + <strong>${bioT.icon} ${bioT.label}</strong> + 
      ☀️ ${sun.dayLen.toFixed(1)}h luce<br><br>
      ${advice.main}<br><br>
      <em style="color:var(--text3);font-size:12px;">${bio.type === 'frutto' ? '🍊 Giornata ottima per raccolta, resine e aromi.' :
      bio.type === 'fiore' ? '🌸 Giornata per cime, terpeni, fioritura attiva.' :
      bio.type === 'radice' ? '🌿 Giornata per substrato, microbi e radici.' :
      '💧 Giornata per vegetazione e assorbimento idrico.'}</em>`;
    // Prova a caricare da brain.json per aggiornare
    fetchGHJson('brain.json').then(d => {
      if (!d) return;
      const txt = d.consiglio_giornaliero || d.oggi || d.summary || '';
      if (txt) ai.innerHTML = `<em style="color:var(--text3);font-size:11px;">🤖 Brain AI:</em><br>${txt.substring(0,300)}${txt.length>300?'…':''}`;
    }).catch(()=>{});
  }
}

/* ══════════════════════════════════════════════════════════════
   TAB LUNARE
══════════════════════════════════════════════════════════════ */
function renderCalLunare() {
  const today = new Date();
  const age = getMoonAge(today);
  const phase = getMoonPhase(age);
  const illum = getMoonIllum(age);
  const advice = getAdvice(phase.code);

  const setT = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  const setH = (id,v) => { const e=document.getElementById(id); if(e) e.innerHTML=v; };

  setT('cal-moon-emoji', phase.emoji);
  setT('cal-moon-name', phase.name);
  setT('cal-moon-illum', illum);
  setT('cal-moon-age', Math.round(age));
  const bar = document.getElementById('cal-moon-bar');
  if (bar) bar.style.width = illum + '%';

  const fullInfo = nextPhaseCountdown(today, 0.5);
  const newInfo = nextPhaseCountdown(today, 0);
  setT('cal-days-full', fullInfo.days);
  setT('cal-date-full', fmtIT(fullInfo.date));
  setT('cal-days-new', newInfo.days);
  setT('cal-date-new', fmtIT(newInfo.date));

  // Striscia 14 giorni
  const strip = document.getElementById('cal-lunar-strip');
  if (strip) {
    strip.innerHTML = '';
    for (let i=0; i<14; i++) {
      const d = new Date(today.getTime() + i*86400000);
      const a = getMoonAge(d);
      const p = getMoonPhase(a);
      const il = getMoonIllum(a);
      const div = document.createElement('div');
      div.className = 'cal-moon-day' + (i===0?' today':'');
      div.innerHTML = `<span style="font-size:18px;">${p.emoji}</span><span style="font-size:9px;color:var(--text3);">${['D','L','M','M','G','V','S'][d.getDay()]}</span><span style="font-size:9px;color:var(--text3);">${d.getDate()}</span><span style="font-size:9px;color:#3a9fd8;">${il}%</span>`;
      div.onclick = () => openCalLunarePopup(d);
      strip.appendChild(div);
    }
  }

  setH('cal-lunar-advice', `
    <strong>${phase.emoji} ${phase.name}</strong><br>
    ${advice.detail}<br><br>
    <strong style="color:var(--green3);">Per la tua serra:</strong><br>${advice.serra}`);

  // Tabella 8 fasi
  const phases8 = [
    {code:'new',emoji:'🌑',nome:'Luna Nuova'},
    {code:'waxing_crescent',emoji:'🌒',nome:'Luna Crescente'},
    {code:'first_quarter',emoji:'🌓',nome:'Primo Quarto'},
    {code:'waxing_gibbous',emoji:'🌔',nome:'Gibbosa Crescente'},
    {code:'full',emoji:'🌕',nome:'Luna Piena'},
    {code:'waning_gibbous',emoji:'🌖',nome:'Gibbosa Calante'},
    {code:'last_quarter',emoji:'🌗',nome:'Ultimo Quarto'},
    {code:'waning_crescent',emoji:'🌘',nome:'Luna Calante'}
  ];
  const pt = document.getElementById('cal-phases-table');
  if (pt) {
    pt.innerHTML = phases8.map(p => {
      const a = getAdvice(p.code);
      return `<div class="cal-phase-row" onclick="openPhasePopup('${p.code}')">
        <span style="font-size:24px;">${p.emoji}</span>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${p.nome}</div>
        <div style="font-size:11px;color:var(--text3);">${a.main.substring(0,60)}…</div></div>
        <span style="color:var(--text3);">›</span>
      </div>`;
    }).join('');
  }
}

function openCalLunarePopup(date) {
  const a = getMoonAge(date); const p = getMoonPhase(a); const adv = getAdvice(p.code);
  const bio = getDayType(date); const bioT = DAY_TYPES[bio.type];
  const sun = calcSunTimes(date);
  const overlay=document.getElementById('amb-popup-overlay');
  const content=document.getElementById('amb-popup-content');
  if(!overlay||!content) return;
  content.innerHTML = `<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;">Dettaglio giorno</div>
<div style="font-size:18px;font-weight:700;margin:6px 0;">${fmtIT(date)}</div>
<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:12px;">
  <div style="font-size:13px;color:var(--text2);line-height:1.9;">
    🌙 <strong>${p.emoji} ${p.name}</strong> · ${getMoonIllum(a)}% illum.<br>
    🌱 <strong>${bioT.icon} ${bioT.label}</strong> · ${bio.sym} ${bio.name}<br>
    ☀️ <strong>${sun.dayLen.toFixed(1)}h luce</strong> · 🌅 ${hToHHMM(sun.sunrise)} → 🌇 ${hToHHMM(sun.sunset)}
  </div>
</div>
<div style="font-size:13px;color:var(--text2);line-height:1.7;">${adv.main}<br><br>${adv.detail}</div>
<div style="margin-top:12px;padding:10px;background:rgba(74,175,94,0.08);border-radius:8px;">
  <div style="font-size:11px;font-weight:700;color:var(--green3);margin-bottom:4px;">SERRA</div>
  <div style="font-size:12px;color:var(--text2);">${adv.serra}</div>
</div>`;
  overlay.style.display='flex'; document.body.style.overflow='hidden';
}

/* ══════════════════════════════════════════════════════════════
   TAB BIODINAMICO
══════════════════════════════════════════════════════════════ */
let _calBioY, _calBioM;

function renderCalBio() {
  const today = new Date();
  if (_calBioY === undefined) { _calBioY = today.getFullYear(); _calBioM = today.getMonth(); }
  const bio = getDayType(today); const bioT = DAY_TYPES[bio.type]; const adv = ADVICE[bio.type];

  // Banner oggi — aggiorna ENTRAMBI i set di ID
  const banner = document.getElementById('cal-bio-banner');
  if (banner) {
    banner.className = 'bio-today-banner ' + bioT.bannerClass;
    document.getElementById('cal-bio-icon').textContent = bioT.icon;
    document.getElementById('cal-bio-type').textContent = bioT.label;
    document.getElementById('cal-bio-date').textContent = fmtFull(today);
    document.getElementById('cal-bio-advice').textContent = adv.short;
  }
  // Nuovi ID nella sezione fusa
  var todayBanner = document.getElementById('bio-today-banner');
  if (todayBanner) {
    todayBanner.className = 'bio-today-banner ' + bioT.bannerClass;
    var el_icon = document.getElementById('bio-today-icon'); if(el_icon) el_icon.textContent = bioT.icon;
    var el_type = document.getElementById('bio-today-type'); if(el_type) el_type.textContent = bioT.label;
    var el_date = document.getElementById('bio-today-date'); if(el_date) el_date.textContent = fmtFull(today);
    var el_adv  = document.getElementById('bio-today-advice'); if(el_adv) el_adv.textContent = adv.short;
  }
  // Griglia bio usa cal-bio-grid (già nel nuovo HTML)

  _renderCalBioGrid();

  // Preparazioni
  const prep = document.getElementById('cal-bio-prep');
  if (prep) {
    const prepsMonth = getPreparazioniBiodinamiche(today);
    prep.innerHTML = prepsMonth.map(p => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <span style="font-size:18px;">${p.icon}</span>
      <div><div style="font-size:12px;font-weight:700;">${p.nome}</div><div style="font-size:11px;color:var(--text3);">${p.quando}</div></div>
    </div>`).join('');
  }

  // Compostaggio
  const comp = document.getElementById('cal-bio-compost');
  if (comp) {
    const compInfo = getCompostaggioInfo(today);
    comp.textContent = compInfo;
  }
}

function calBioChangeMonth(delta) {
  const today = new Date();
  if (delta === 0) { _calBioY = today.getFullYear(); _calBioM = today.getMonth(); }
  else {
    _calBioM += delta;
    if (_calBioM > 11) { _calBioM = 0; _calBioY++; }
    if (_calBioM < 0) { _calBioM = 11; _calBioY--; }
  }
  _renderCalBioGrid();
}

function _renderCalBioGrid() {
  const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const el = document.getElementById('cal-bio-month'); if (el) el.textContent = `${MONTHS[_calBioM]} ${_calBioY}`;
  const grid = document.getElementById('cal-bio-grid'); if (!grid) return;
  const today = new Date(); const todayStr = today.toISOString().slice(0,10);
  const firstDay = new Date(_calBioY, _calBioM, 1);
  let startDow = firstDay.getDay(); if (startDow === 0) startDow = 7;
  const daysInMonth = new Date(_calBioY, _calBioM+1, 0).getDate();
  let cells = '';
  for (let i=1; i<startDow; i++) cells += '<div></div>';
  for (let d=1; d<=daysInMonth; d++) {
    const date = new Date(_calBioY, _calBioM, d);
    const ct = getDayType(date); const bioT = DAY_TYPES[ct.type];
    const ds = date.toISOString().slice(0,10);
    const isToday = ds === todayStr;
    cells += `<div class="bio-cell ${bioT.color}${isToday?' bio-today':''}" onclick="openCalBioDayPopup(${_calBioY},${_calBioM},${d})" title="${bioT.label}">${d}</div>`;
  }
  grid.innerHTML = cells;
}

function openCalBioDayPopup(y, m, d) {
  const date = new Date(y, m, d);
  const bio = getDayType(date); const bioT = DAY_TYPES[bio.type]; const adv = ADVICE[bio.type];
  const sun = calcSunTimes(date);
  const moonA = getMoonAge(date); const moonP = getMoonPhase(moonA);
  const overlay=document.getElementById('amb-popup-overlay');
  const content=document.getElementById('amb-popup-content');
  if(!overlay||!content) return;
  content.innerHTML = `<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;">Biodinamica</div>
<div style="font-size:18px;font-weight:700;margin:6px 0;">${bioT.icon} ${bioT.label} — ${fmtIT(date)}</div>
<div style="background:var(--card2);border-radius:10px;padding:10px;margin-bottom:12px;font-size:13px;color:var(--text2);line-height:1.8;">
  ♐ ${bio.sym} ${bio.name} · 🌍 ${bio.element}<br>
  🌙 ${moonP.emoji} ${moonP.name} · ${getMoonIllum(moonA)}%<br>
  ☀️ ${sun.dayLen.toFixed(1)}h luce
</div>
<div style="font-size:13px;font-weight:700;margin-bottom:8px;">Consigli per la serra:</div>
<div style="font-size:13px;color:var(--text2);line-height:1.8;">${adv.tips.map(t=>'✅ '+t).join('<br>')}</div>
<div style="margin-top:12px;padding:10px;background:rgba(255,152,0,0.08);border-radius:8px;font-size:12px;color:var(--orange);">
  ${bio.type==='frutto'?'❌ Non trapiantare. Non potare invasivamente.':
    bio.type==='fiore'?'❌ Evita concimazioni azotate pesanti.':
    bio.type==='radice'?'❌ Non disturbare la superficie.':'❌ Non ideale per raccolta importanti.'}
</div>`;
  overlay.style.display='flex'; document.body.style.overflow='hidden';
}

function getPreparazioniBiodinamiche(today) {
  const m = today.getMonth();
  const preparations = [
    {icon:'🌿', nome:'Preparato 500 — Cornoletame', quando: m>=3&&m<=9 ? '✅ Stagione attiva — applica alla sera' : '⏸️ Fuori stagione (ottobre-marzo)'},
    {icon:'🦷', nome:'Preparato 501 — Cornosilice', quando: m>=4&&m<=8 ? '✅ Primavera-estate — applica al mattino presto' : '⏳ Usare da maggio ad agosto'},
    {icon:'🌱', nome:'Preparato Ortica (508)', quando: 'Ogni 2-3 settimane · Contro parassiti e carenze'},
    {icon:'🫙', nome:'Infuso Valeriana (507)', quando: 'Prima di gelate previste · Stimola fioritura'},
  ];
  return preparations;
}

function getCompostaggioInfo(today) {
  const bio = getDayType(today);
  const msgs = {
    radice: '🌿 Ottimo per girare il compost e aggiungere materiale verde (radici, rifiuti organici). Massima attività microbica.',
    foglia: '💧 Buono per irrigare il cumulo di compost. Aggiungi foglie secche per equilibrare l\'umidità.',
    frutto: '🍊 Giorno ideale per raccogliere scarti organici freschi (frutta, verdura). Evita di girare oggi.',
    fiore: '🌸 Giornata neutra per il compost. Aggiungi cenere di legno per correggere pH.'
  };
  return msgs[bio.type] || msgs.radice;
}

/* ══════════════════════════════════════════════════════════════
   TAB SEMINE
══════════════════════════════════════════════════════════════ */
function getSemineOggi(today) {
  const bio = getDayType(today); const moonA = getMoonAge(today); const moonP = getMoonPhase(moonA);
  let score = 0; let motivi = [];
  if (bio.type === 'radice') { score += 3; motivi.push('Giorno Radice ✅'); }
  if (bio.type === 'frutto') { score += 2; motivi.push('Giorno Frutto ✅'); }
  if (bio.type === 'foglia') { score -= 1; motivi.push('Giorno Foglia (neutro)'); }
  if (bio.type === 'fiore') { score += 1; motivi.push('Giorno Fiore (buono)'); }
  if (moonP.code === 'waxing_crescent' || moonP.code === 'first_quarter') { score += 2; motivi.push('Luna crescente ✅'); }
  if (moonP.code === 'full') { score += 1; motivi.push('Luna piena'); }
  if (moonP.code === 'new') { score -= 2; motivi.push('Luna nuova ⚠️'); }
  if (moonP.code === 'waning_gibbous' || moonP.code === 'last_quarter') { score -= 1; motivi.push('Luna calante'); }
  if (score >= 4) return { emoji:'🟢', label:'Molto favorevole', motivo: motivi.join(' · ') };
  if (score >= 2) return { emoji:'🟡', label:'Favorevole', motivo: motivi.join(' · ') };
  if (score >= 0) return { emoji:'🟠', label:'Neutro', motivo: motivi.join(' · ') };
  return { emoji:'🔴', label:'Sfavorevole', motivo: motivi.join(' · ') };
}

function renderCalSemine() {
  const today = new Date();
  const sem = getSemineOggi(today);
  const setT=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  setT('cal-sem-emoji', sem.emoji);
  setT('cal-sem-label', sem.label);
  setT('cal-sem-motivo', sem.motivo);

  // 10 piante — fase attuale
  const lista = document.getElementById('cal-sem-piante');
  if (lista) {
    lista.innerHTML = CAL_PIANTE.map(p => {
      const germ = new Date(p.germ);
      const gg = Math.floor((today - germ) / 86400000);
      let fase, azione;
      if (p.tipo === 'auto') {
        const giornaFior = Math.floor(p.giorni * 0.45);
        if (gg < 14) { fase='Germinazione/Seedling'; azione='Nessun trapianto'; }
        else if (gg < giornaFior) { fase='Vegetativa'; azione='Ottimo per rinvasare'; }
        else if (gg < p.giorni-15) { fase='Fioritura'; azione='Non stressare'; }
        else { fase='Pre-raccolta/Maturazione'; azione='Solo osservazione'; }
      } else {
        const racD = new Date(p.raccolta);
        const fiorD = new Date(p.fiorInizio);
        if (gg < 21) { fase='Seedling'; azione='Nessun trapianto'; }
        else if (today < fiorD) { fase='Vegetativa'; azione=sem.score>=2?'✅ Potatura/rinvaso oggi':'Attendi giorno migliore'; }
        else if (today < racD) { fase='Fioritura'; azione='Non stressare'; }
        else { fase='Raccolta'; azione='Osserva trichomi'; }
      }
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--card2);border-radius:8px;gap:8px;">
        <div>
          <div style="font-size:12px;font-weight:700;">${p.nome} <span style="font-size:10px;opacity:.6">ID:${p.id}</span></div>
          <div style="font-size:10px;color:var(--text3);">${p.tipo==='auto'?'⚡ Auto':'🌸 Femm.'} · Gg ${gg} · ${fase}</div>
        </div>
        <div style="font-size:11px;color:var(--text2);text-align:right;">${azione}</div>
      </div>`;
    }).join('');
  }

  // Prossime 14 giorni
  const strip = document.getElementById('cal-sem-strip');
  if (strip) {
    strip.innerHTML = '';
    for (let i=0; i<14; i++) {
      const d = new Date(today.getTime()+i*86400000);
      const s = getSemineOggi(d);
      strip.innerHTML += `<div class="cal-sem-day" style="border-left-color:${s.emoji==='🟢'?'#4caf76':s.emoji==='🟡'?'#ffd54f':s.emoji==='🟠'?'#ff9800':'#ef5350'};">
        <span style="font-size:16px;">${s.emoji}</span>
        <div><div style="font-size:12px;font-weight:600;">${fmtIT(d)}</div><div style="font-size:10px;color:var(--text3);">${s.label}</div></div>
      </div>`;
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   TAB TRATTAMENTI
══════════════════════════════════════════════════════════════ */
function getTrattOggi(today) {
  const bio = getDayType(today); const moonA = getMoonAge(today); const moonP = getMoonPhase(moonA);
  const day = today.getDate();
  if (bio.type === 'radice' && moonP.code.includes('waxing')) return { label:'🌿 Infuso Ortiche + Humus', desc:'Giorno Radice + Luna crescente: massima efficacia. Diluire 1:10.' };
  if (bio.type === 'frutto' && (moonP.code==='full'||moonP.code==='waxing_gibbous')) return { label:'🍌 Tè Banana + Cenere', desc:'Giorno Frutto + Luna piena/crescente: potenzia K. Bolli 15min, diluire 1:5.' };
  if (bio.type === 'foglia') return { label:'🍯 Melassa 1ml/L', desc:'Giorno Foglia: attiva batteri del suolo. Non mescolare con ortiche.' };
  if (bio.type === 'radice') return { label:'🦠 Rinnovo Humus', desc:'Giorno Radice: aggiungi 100-150g BioBizz Worm Humus nel serbatoio.' };
  if (moonP.code === 'new') return { label:'⏸️ Riposo — no trattamenti', desc:'Luna nuova: pausa. Prepara i prossimi additivi.' };
  return { label:'💧 Irrigazione normale', desc:'Nessun trattamento specifico oggi. Controlla solo i bordi dei vasi.' };
}

function renderCalTratt() {
  const today = new Date();
  const tratt = getTrattOggi(today);
  const setT=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  setT('cal-tratt-label', tratt.label);
  setT('cal-tratt-desc', tratt.desc);

  // Schema mensile
  const schema = document.getElementById('cal-tratt-schema');
  if (schema) {
    schema.innerHTML = [
      {icon:'🍯', nome:'Melassa 1ml/L', freq:'Ogni 15 giorni', giorni:'Foglia/Radice', pop:'tratt-melassa'},
      {icon:'🌿', nome:'Infuso Ortiche + Miscela + Humus', freq:'1× al mese', giorni:'Radice (Luna crescente)', pop:'tratt-ortiche'},
      {icon:'🍌', nome:'Tè Banana + Cenere di legno', freq:'Ogni 2 settimane (mag-ago)', giorni:'Frutto/Fiore', pop:'tratt-banana'},
      {icon:'🥚', nome:'Miscela Organica (caffè+guscio+banana)', freq:'1× al mese', giorni:'Radice', pop:'tratt-miscela'},
      {icon:'🦠', nome:'Rinnovo Humus nel serbatoio', freq:'1× al mese (Luna nuova)', giorni:'Radice', pop:'tratt-humus'},
      {icon:'🍎', nome:'Generatore Etilene (frutto)', freq:'Luglio-Agosto', giorni:'Fase maturazione', pop:'tratt-oggi'},
    ].map(t => `<div class="cal-tratt-item" onclick="openAmbPopup('${t.popup}')">
      <span style="font-size:22px;">${t.icon}</span>
      <div style="flex:1;"><div style="font-size:12px;font-weight:700;">${t.nome}</div>
      <div style="font-size:10px;color:var(--text3);">${t.freq} · ${t.giorni}</div></div>
      <span style="color:var(--text3);">›</span>
    </div>`).join('');
  }

  // Difesa integrata
  const difesa = document.getElementById('cal-tratt-difesa');
  if (difesa) {
    difesa.innerHTML = [
      {icon:'🛡️', titolo:'Preventivo muffe', desc:'Giorni Frutto + bassa umidità: ventila la serra. Usa bicarbonato 5g/L in fogliare.'},
      {icon:'🐛', titolo:'Parassiti foglie', desc:'Giorni Foglia + luna calante: applica infuso di ortiche concentrate. Controlla sotto le foglie.'},
      {icon:'🌡️', titolo:'Stress termico', desc:'T>35°C: ombreggia. T<5°C: copri i vasi con telo. La radice di cannabis subisce stress a T<10°C.'},
      {icon:'💧', titolo:'Marciume radicale', desc:'Evita ristagni. Giorni Foglia con alta umidità: riduci irrigazione del 30%.'},
    ].map(d => `<div style="padding:8px 10px;background:var(--card2);border-radius:8px;border-left:3px solid rgba(239,83,80,0.4);">
      <div style="font-size:12px;font-weight:700;margin-bottom:3px;">${d.icon} ${d.titolo}</div>
      <div style="font-size:11px;color:var(--text2);">${d.desc}</div>
    </div>`).join('');
  }

  // Prossime finestre
  const finestre = document.getElementById('cal-tratt-finestre');
  if (finestre) {
    finestre.innerHTML = '';
    for (let i=0; i<7; i++) {
      const d = new Date(today.getTime()+i*86400000);
      const t = getTrattOggi(d);
      finestre.innerHTML += `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--card2);border-radius:8px;">
        <div style="min-width:60px;font-size:11px;color:var(--text3);">${i===0?'Oggi':fmtIT(d)}</div>
        <div style="font-size:12px;color:var(--text);">${t.label}</div>
      </div>`;
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   TAB FOTOPERIODO
══════════════════════════════════════════════════════════════ */
function renderCalFoto() {
  const today = new Date();
  const sun = calcSunTimes(today);
  const setT=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  setH=(id,v)=>{const e=document.getElementById(id);if(e)e.innerHTML=v;};

  setT('cal-foto-ore', sun.dayLen.toFixed(1).replace('.',',') + 'h');
  setT('cal-foto-alba-tr', '🌅 ' + hToHHMM(sun.sunrise) + ' → 🌇 ' + hToHHMM(sun.sunset));

  const ore = sun.dayLen;
  setT('cal-foto-auto', ore >= 18 ? '✅ Crescita ottimale' : ore >= 15 ? '🟡 Buona crescita' : '⚠️ Crescita rallentata');
  setT('cal-foto-femm', ore > 12 ? '🌿 Fase vegetativa' : ore <= 12 ? '🌸 Innesco fioritura' : '⏸️ Soglia critica');

  // Grafico ore mensili
  const MONTHS_S = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const chart = document.getElementById('cal-foto-chart');
  if (chart) {
    chart.innerHTML = '';
    const monthData = MONTHS_S.map((m, mi) => {
      const d = new Date(2026, mi, 21);
      const s = calcSunTimes(d);
      return { m, ore: s.dayLen };
    });
    const maxOre = Math.max(...monthData.map(x=>x.ore));
    chart.innerHTML = monthData.map(({m, ore}) => {
      const pct = (ore / maxOre * 100).toFixed(0);
      const color = ore >= 14 ? '#4caf76' : ore >= 12 ? '#ffd54f' : '#ef5350';
      const isNow = new Date().getMonth() === MONTHS_S.indexOf(m);
      return `<div class="cal-foto-bar">
        <div style="width:28px;font-size:11px;color:var(--text3);font-weight:${isNow?'700':'400'};color:${isNow?'var(--green3)':'var(--text3)'};">${m}</div>
        <div class="cal-foto-bar-fill" style="width:${pct}%;max-width:calc(100% - 80px);background:${color};"></div>
        <div style="font-size:11px;color:var(--text2);min-width:36px;text-align:right;">${ore.toFixed(1)}h</div>
      </div>`;
    }).join('');
  }

  // Prossimi 30 giorni
  const p30 = document.getElementById('cal-foto-30g');
  if (p30) {
    p30.innerHTML = '';
    for (let i=0; i<=30; i+=3) {
      const d = new Date(today.getTime()+i*86400000);
      const s = calcSunTimes(d);
      const impact = s.dayLen <= 12 ? '🌸 Fioritura femm.' : s.dayLen >= 18 ? '⚡ Auto ottimale' : '🌿 Vegetativa';
      p30.innerHTML += `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
        <span style="font-size:11px;color:var(--text3);min-width:70px;">${fmtIT(d)}</span>
        <span style="font-size:12px;font-weight:600;">${s.dayLen.toFixed(1)}h</span>
        <span style="font-size:10px;color:var(--text3);">${impact}</span>
      </div>`;
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   TAB FENOLOGICO
══════════════════════════════════════════════════════════════ */
function getFenolFase(date) {
  const m = date.getMonth(); const d = date.getDate();
  const fasi = [
    {da:[0,1], a:[1,28],  fase:'❄️ Dormienza invernale', desc:'Riposo vegetativo. Terreno freddo. Minimizza disturbi.'},
    {da:[2,1], a:[3,14],  fase:'🌱 Risveglio primaverile', desc:'Germogliamento. Attività microbi in aumento. Prepara substrati.'},
    {da:[3,15],a:[4,31],  fase:'🌿 Crescita vegetativa attiva', desc:'Massima crescita fogliare. Azoto, luce, irrigazione abbondante.'},
    {da:[5,1], a:[6,20],  fase:'🌸 Pre-fioritura', desc:'Allungamento internodi. Switcha a K/P. Aumenta ore luce.'},
    {da:[6,21],a:[8,14],  fase:'🍊 Fioritura piena — Estate', desc:'Calura estiva. Trichomi visibili. Massima produzione resina.'},
    {da:[8,15],a:[9,14],  fase:'🍂 Maturazione autunnale', desc:'Ore luce < 12h → innesco femminizzate. Trichomi ambrati.'},
    {da:[9,15],a:[10,30], fase:'🌾 Raccolta e post-raccolta', desc:'Autofiorenti già raccolte. Femminizzate in raccolta. Essiccazione.'},
    {da:[11,1],a:[11,31], fase:'🫙 Conservazione e concia', desc:'Barattoli. Aria fresca e buia. Monitoraggio muffe. Fine ciclo.'},
  ];
  const dayOfYear = (m * 30 + d);
  for (const f of fasi) {
    const start = f.da[0]*30 + f.da[1];
    const end = f.a[0]*30 + f.a[1];
    if (dayOfYear >= start && dayOfYear <= end) return f;
  }
  return fasi[fasi.length-1];
}

function renderCalFenol() {
  const today = new Date();
  const fenol = getFenolFase(today);
  const setT=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  setT('cal-fenol-fase', fenol.fase);
  setT('cal-fenol-desc', fenol.desc);

  // Per varietà
  const lista = document.getElementById('cal-fenol-piante');
  if (lista) {
    lista.innerHTML = CAL_PIANTE.map(p => {
      const germ = new Date(p.germ);
      const gg = Math.floor((today - germ) / 86400000);
      let faseP, icona;
      if (p.tipo === 'auto') {
        const pctFior = p.giorni * 0.45;
        if (gg < 0) { faseP='Non ancora germinata'; icona='⏳'; }
        else if (gg < 10) { faseP='Germinazione/Seedling'; icona='🌱'; }
        else if (gg < pctFior) { faseP='Vegetativa (gg '+gg+'/'+Math.floor(pctFior)+')'; icona='🌿'; }
        else if (gg < p.giorni-10) { faseP='Fioritura ('+Math.floor(gg-pctFior)+'/'+Math.floor(p.giorni-pctFior)+'gg)'; icona='🌸'; }
        else { faseP='Maturazione — prossima raccolta'; icona='🍊'; }
      } else {
        const fiorD = new Date(p.fiorInizio);
        const racD = new Date(p.raccolta);
        if (today < fiorD) { faseP='Vegetativa → innesco a '+(fiorD.getDate())+'/0'+(fiorD.getMonth()+1); icona='🌿'; }
        else if (today < racD) {
          const ggFior = Math.floor((today-fiorD)/86400000);
          faseP='Fioritura (gg '+ggFior+'/'+p.fiorGG+')'; icona='🌸';
        } else { faseP='Raccolta completata'; icona='🍊'; }
      }
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--card2);border-radius:8px;">
        <span style="font-size:18px;">${icona}</span>
        <div><div style="font-size:12px;font-weight:700;">${p.nome}</div>
        <div style="font-size:11px;color:var(--text3);">${faseP}</div></div>
      </div>`;
    }).join('');
  }

  // Calendario stagionale annuale
  const anno = document.getElementById('cal-fenol-anno');
  if (anno) {
    const stagioni = [
      {periodo:'Gen–Feb', fase:'❄️ Dormienza', desc:'Preparazione substrato, sterilizzazione vasi'},
      {periodo:'Mar–Apr', fase:'🌱 Germinazione', desc:'Germ. apr: Epsilon(21/4), Gaia(21/4), Medusa(21/4), Titan(22/4), Milky Way(23/4)'},
      {periodo:'Mag–Giu', fase:'🌿 Vegetativa', desc:'Crescita attiva. Femm. > 12h luce. Ortiche mensili.'},
      {periodo:'Lug–Ago', fase:'🌸 Fioritura auto', desc:'Autofiorenti in fioritura. Tè banana ogni 2 sett.'},
      {periodo:'Set–Ott', fase:'🌸→🍊 Femm. fioriscono', desc:'Ore luce < 12h: innesco femminizzate (inizio ott)'},
      {periodo:'Ott–Nov', fase:'🍊 Raccolta', desc:'Autofiorenti già raccolte. Femm.: Astro/Cosmic/Orbital(30/10), Royal/Mexican(9/11)'},
      {periodo:'Nov–Dic', fase:'🫙 Essiccazione/Concia', desc:'14gg essiccazione + 14gg concia in barattoli.'},
    ];
    anno.innerHTML = stagioni.map(s => `<div style="padding:8px 10px;background:var(--card2);border-radius:8px;border-left:3px solid var(--green2);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
        <span style="font-size:11px;font-weight:700;color:var(--text3);min-width:50px;">${s.periodo}</span>
        <span style="font-size:12px;font-weight:700;">${s.fase}</span>
      </div>
      <div style="font-size:11px;color:var(--text2);">${s.desc}</div>
    </div>`).join('');
  }
}

/* ══════════════════════════════════════════════════════════════
   TAB LAVORI
══════════════════════════════════════════════════════════════ */
function getLavoriOggi(today) {
  const bio = getDayType(today); const moonA = getMoonAge(today); const moonP = getMoonPhase(moonA);
  const sun = calcSunTimes(today);
  let titolo='', sub='', lavori=[];

  if (bio.type === 'radice') {
    titolo='🌿 Terreno & Radici'; sub='Humus, lavorazione substrato, pila galvanica';
    lavori=['Rinova l\'infuso humus nel serbatoio (5L + 100-150g)','Controlla peso vasi (alzali: secchi = irrigare di più)','Verifica pila galvanica ferro-rame','Aggiungi miscela organica al substrato'];
  } else if (bio.type === 'frutto') {
    titolo='🍊 Osservazione & Raccolta'; sub='Trichomi, resine, potature leggere';
    lavori=['Osserva i trichomi con lente (ambrato ≥30% = raccolta)','Rimuovi foglie secche o malate','Controlla i bastoncini di elettrocultura','Aggiorna foto degli esperimenti'];
  } else if (bio.type === 'fiore') {
    titolo='🌸 Terpeni & Cime'; sub='Ventilazione, aromi, documentazione';
    lavori=['Ventila bene la serra (terpeni volatili escono nei giorni Fiore)','Documenta aroma e sviluppo cime','Controlla umidità (evita spruzzi sulle cime)','Verifica e aggiusta cerchi Lakhovsky'];
  } else {
    titolo='💧 Irrigazione & Vegetazione'; sub='Acqua, stomi, Geomag';
    lavori=['Agita il serbatoio 15 secondi (ossigena l\'acqua)','Controlla Geomag sui gocciolatori (polo N verso basso)','Bagna i bordi di tutti i vasi manualmente','Ispeziona foglie (ingiallimenti, macchie, deformazioni)'];
  }
  if (moonP.code === 'new') lavori.push('Luna nuova: pulisci e prepara additivi per il mese');
  if (sun.dayLen < 12 && today.getMonth() >= 8) lavori.push('⚠️ Ore luce < 12h — femminizzate in innesco fioritura');
  return { titolo, sub, lavori };
}

function renderCalLavori() {
  const today = new Date();
  const lav = getLavoriOggi(today);

  const el = document.getElementById('cal-lavori-oggi');
  if (el) el.innerHTML = lav.lavori.map(l=>`<div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;">
    <span style="color:var(--green3);flex-shrink:0;">☐</span>
    <span style="font-size:13px;color:var(--text2);">${l}</span>
  </div>`).join('');

  // Piano settimana
  const sett = document.getElementById('cal-lavori-settimana');
  if (sett) {
    sett.innerHTML = '';
    for (let i=0; i<7; i++) {
      const d = new Date(today.getTime()+i*86400000);
      const l = getLavoriOggi(d);
      const bio = getDayType(d); const bioT = DAY_TYPES[bio.type];
      sett.innerHTML += `<div class="cal-lavori-day" onclick="openCalLavoriPopup(${d.getTime()})">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:12px;font-weight:700;">${i===0?'Oggi':fmtIT(d)}</div>
          <span style="font-size:11px;color:var(--text3);">${bioT.icon} ${bioT.label}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:3px;">${l.titolo}</div>
      </div>`;
    }
  }

  // Piano mese Terra Nuova
  const mese = document.getElementById('cal-lavori-mese');
  if (mese) {
    const m = today.getMonth();
    const pianiMese = {
      0:['❄️ Pianificazione stagione','📋 Ordine semi e substrati','🧪 Sterilizzazione attrezzi'],
      1:['🌱 Preparazione substrato','📦 Rinnovo BioBizz e additivi','🌡️ Monitoraggio temperature'],
      2:['🌱 Prime semine indoor','🧫 Preparazione inoculo micorrize','☀️ Posizionamento serra'],
      3:['🌿 Trapianti principali','💧 Attivazione sistema irrigazione','⚡ Setup elettrocultura'],
      4:['🌿 Vegetativa piena','🍯 Prima melassa stagionale','🔧 Verifica sistemi'],
      5:['🌸 Pre-fioritura auto','🍌 Primo tè banana','📊 Documentazione crescita'],
      6:['🍊 Fioritura auto','🌡️ Gestione caldo estivo','🍎 Generatore etilene (mese 3)'],
      7:['🍊 Raccolta autofiorenti (da ago)','🌸 Pre-fioritura femm.','🫙 Primo ciclo essiccazione'],
      8:['🌸 Innesco fioritura femm.','📸 Documentazione trichomi','🍊 Raccolta auto tardive'],
      9:['🌸 Fioritura femm. piena','🧪 Riduzione irrigazione','🔍 Monitoraggio maturazione'],
      10:['🍊 Raccolta femm. (ott-nov)','🌬️ Essiccazione 14 giorni','📋 Preparazione concia'],
      11:['🫙 Concia in barattoli','📊 Valutazione ciclo','🌱 Pianificazione 2027'],
    };
    mese.innerHTML = (pianiMese[m]||[]).map(l=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--card2);border-radius:8px;">
      <span style="font-size:14px;">${l.split(' ')[0]}</span>
      <span style="font-size:12px;color:var(--text2);">${l.substring(l.indexOf(' ')+1)}</span>
    </div>`).join('');
  }
}

function openCalLavoriPopup(ts) {
  const d = new Date(ts); const lav = getLavoriOggi(d);
  const bio = getDayType(d); const bioT = DAY_TYPES[bio.type];
  const sun = calcSunTimes(d);
  const overlay=document.getElementById('amb-popup-overlay');
  const content=document.getElementById('amb-popup-content');
  if(!overlay||!content) return;
  content.innerHTML = `<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;">Piano lavori</div>
<div style="font-size:18px;font-weight:700;margin:6px 0;">${fmtIT(d)} — ${lav.titolo}</div>
<div style="font-size:13px;color:var(--text3);margin-bottom:12px;">${bioT.icon} ${bioT.label} · ☀️ ${sun.dayLen.toFixed(1)}h luce</div>
<div style="font-size:13px;font-weight:700;margin-bottom:8px;">Checklist operativa:</div>
${lav.lavori.map(l=>`<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
  <span style="color:var(--green3);">☐</span>
  <span style="font-size:13px;color:var(--text2);">${l}</span>
</div>`).join('')}`;
  overlay.style.display='flex'; document.body.style.overflow='hidden';
}

/* ══════════════════════════════════════════════════════════════
   TAB GDD — Gradi-Giorno
══════════════════════════════════════════════════════════════ */
let _gddData = null;

function renderCalGDD() {
  const lista = document.getElementById('cal-gdd-piante');
  if (_gddData) {
    _renderGDDContent();
    return;
  }
  loadGDD();
  // Mostra stime locali intanto
  if (lista) {
    const today = new Date();
    lista.innerHTML = CAL_PIANTE.map(p => {
      const germ = new Date(p.germ);
      const gg = Math.floor((today-germ)/86400000);
      const raccoItaStr = p.tipo==='auto' ? (() => {
        const r = new Date(germ.getTime() + p.giorni*86400000);
        return fmtIT(r);
      })() : (p.raccolta ? fmtIT(new Date(p.raccolta)) : 'Ott–Nov 2026');
      const avanzamento = p.tipo==='auto' ? Math.min(100, Math.round(gg/p.giorni*100)) : null;
      return `<div class="cal-gdd-row" onclick="openCalGDDPopup('${p.id}')">
        <div>
          <div style="font-size:12px;font-weight:700;">${p.nome}</div>
          <div style="font-size:10px;color:var(--text3);">${p.tipo==='auto'?'⚡ Auto · Gg '+gg+'/'+p.giorni:'🌸 Femm.'}</div>
        </div>
        <div style="text-align:right;">
          ${avanzamento!==null?`<div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;width:80px;margin-bottom:3px;"><div style="height:100%;background:var(--green);border-radius:2px;width:${avanzamento}%;"></div></div>`:''}
          <div style="font-size:11px;color:var(--text3);">Raccolta: ${raccoItaStr}</div>
        </div>
      </div>`;
    }).join('');
  }
}

async function loadGDD() {
  const loading = document.getElementById('cal-gdd-loading');
  const content = document.getElementById('cal-gdd-content');
  const totEl = document.getElementById('cal-gdd-totale');
  const chart = document.getElementById('cal-gdd-chart');
  if (loading) loading.style.display = 'block';
  if (content) content.style.display = 'none';

  try {
    const today = new Date();
    const startDate = '2026-01-01';
    const endDate = today.toISOString().slice(0,10);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${CAL_LAT}&longitude=${CAL_LON}` +
      `&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%2FRome` +
      `&start_date=${startDate}&end_date=${endDate}`;
    const res = await fetch(url);
    const data = await res.json();

    // Calcola GDD base 10°C
    let gddTotal = 0;
    const gddMonthly = new Array(12).fill(0);
    const MESI_S = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

    data.daily.time.forEach((t, i) => {
      const tMax = data.daily.temperature_2m_max[i];
      const tMin = data.daily.temperature_2m_min[i];
      const tMed = (tMax + tMin) / 2;
      const gdd = Math.max(0, tMed - 10);
      gddTotal += gdd;
      const month = new Date(t).getMonth();
      gddMonthly[month] += gdd;
    });

    _gddData = { total: Math.round(gddTotal), monthly: gddMonthly };

    if (totEl) totEl.textContent = Math.round(gddTotal) + ' GDD';
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';

    // Grafico mensile
    if (chart) {
      const maxGDD = Math.max(...gddMonthly);
      chart.innerHTML = gddMonthly.map((g, mi) => {
        const pct = maxGDD > 0 ? (g/maxGDD*100).toFixed(0) : 0;
        const color = g > 200 ? '#f0843c' : g > 100 ? '#ffd54f' : '#4caf76';
        const isNow = mi <= today.getMonth();
        return `<div class="cal-foto-bar" style="opacity:${isNow?1:0.3};">
          <div style="width:28px;font-size:10px;color:var(--text3);">${MESI_S[mi]}</div>
          <div class="cal-foto-bar-fill" style="width:${pct}%;max-width:calc(100% - 80px);background:${color};height:8px;"></div>
          <div style="font-size:10px;color:var(--text2);min-width:46px;text-align:right;">${Math.round(g)} GDD</div>
        </div>`;
      }).join('');
    }

    _renderGDDContent();
    // Aggiorna badge nella card meteo
    var badge = document.getElementById('w-gdd-badge');
    if (badge && _gddData) badge.textContent = Math.round(_gddData.total) + ' GDD';
  } catch(e) {
    if (loading) loading.textContent = '⚠️ Errore caricamento GDD.';
  }
}

function _renderGDDContent() {
  if (!_gddData) return;
  const today = new Date();
  const lista = document.getElementById('cal-gdd-piante');
  if (!lista) return;

  lista.innerHTML = CAL_PIANTE.map(p => {
    const germ = new Date(p.germ);
    const gg = Math.floor((today-germ)/86400000);
    const avanzamento = p.tipo==='auto' ? Math.min(100, Math.round(gg/p.giorni*100)) : null;
    const raccoItaStr = p.tipo==='auto' ? fmtIT(new Date(germ.getTime()+p.giorni*86400000)) :
      (p.raccolta ? fmtIT(new Date(p.raccolta)) : 'Ott–Nov 2026');
    const gddNeeded = p.fiorGG * 12; // Stima GDD necessari (12 GDD/gg medio)
    const gddHave = Math.min(_gddData.total, gddNeeded);
    const gddPct = Math.min(100, Math.round(gddHave/gddNeeded*100));

    return `<div class="cal-gdd-row" onclick="openCalGDDPopup('${p.id}')">
      <div style="flex:1;">
        <div style="font-size:12px;font-weight:700;">${p.nome}</div>
        <div style="font-size:10px;color:var(--text3);">${p.tipo==='auto'?'⚡ Gg '+gg+'/'+p.giorni:'🌸 Femm. → '+raccoItaStr}</div>
        <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;width:100%;margin-top:4px;">
          <div style="height:100%;background:${gddPct>=80?'#4caf76':gddPct>=50?'#ffd54f':'#ef5350'};border-radius:2px;width:${gddPct}%;"></div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;margin-left:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--blue);">${gddPct}% GDD</div>
        <div style="font-size:10px;color:var(--text3);">Raccolta: ${raccoItaStr}</div>
      </div>
    </div>`;
  }).join('');
}

function openCalGDDPopup(id) {
  const p = CAL_PIANTE.find(x=>String(x.id)===String(id));
  if (!p) return;
  const today = new Date(); const germ = new Date(p.germ);
  const gg = Math.floor((today-germ)/86400000);
  const overlay=document.getElementById('amb-popup-overlay');
  const content=document.getElementById('amb-popup-content');
  if(!overlay||!content) return;
  const gddTotal = _gddData ? _gddData.total : '?';
  const racD = p.tipo==='auto' ? new Date(germ.getTime()+p.giorni*86400000) : new Date(p.raccolta);
  const daysLeft = Math.max(0, Math.floor((racD-today)/86400000));
  content.innerHTML = `<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;">GDD — ${p.tipo==='auto'?'Autofiorente':'Femminizzata'}</div>
<div style="font-size:18px;font-weight:700;margin:6px 0;">${p.nome} (ID:${p.id})</div>
<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:12px;font-size:13px;color:var(--text2);line-height:1.9;">
  📅 Germinazione: <strong>${fmtIT(germ)}</strong><br>
  🌿 Giorno: <strong>${gg}</strong> su ${p.tipo==='auto'?p.giorni:'~'} giorni totali<br>
  📈 GDD accumulati 2026: <strong>${gddTotal}</strong><br>
  🍊 Raccolta prevista: <strong>${fmtIT(racD)}</strong> (${daysLeft>0?daysLeft+' giorni':'⚠️ Data passata!'})
</div>
<div style="font-size:13px;color:var(--text2);line-height:1.7;">
  ${p.tipo==='auto'?`Autofiorente: ciclo fisso di ${p.giorni} giorni dalla germinazione. I GDD influenzano la resa ma non la data esatta. Con ${_gddData?_gddData.total:'molti'} GDD la resa sarà ${_gddData&&_gddData.total>300?'ottimale ✅':'buona 🟡'}.`
  :`Femminizzata fotoperiodica. Innesco fioritura previsto inizio ottobre (ore luce < 12h). Poi ${p.fiorGG} giorni di fioritura. GDD disponibili accelerano leggermente la maturazione.`}
</div>`;
  overlay.style.display='flex'; document.body.style.overflow='hidden';
}

/* ══════════════════════════════════════════════════════════════
   TAB GELO
══════════════════════════════════════════════════════════════ */
function renderCalGelo() {
  const today = new Date();
  const m = today.getMonth();
  const d = today.getDate();

  // Statistiche gelo Caserta (dati storici 1981-2010)
  const GELO_STATS = {
    primoGelo: { mese:11, giorno:15, nome:'15 Dicembre (media storica)' },
    ultimoGelo: { mese:1, giorno:20, nome:'20 Febbraio (media storica)' },
    fineSicura: { inizio: { mese:2, giorno:1 }, fine: { mese:11, giorno:30 } },
    tempMinMedia: [-1,1,4,8,13,17,21,21,17,11,5,1]
  };

  // Status gelo attuale
  const geloRischio = m===11&&d>=15 || m===0 || m===1&&d<=20 || m===11&&d>=20;
  const setT=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  const setH=(id,v)=>{const e=document.getElementById(id);if(e)e.innerHTML=v;};

  const geloEl = document.getElementById('cal-gelo-emoji');
  const stEl = document.getElementById('cal-gelo-status');
  const dEl = document.getElementById('cal-gelo-desc');
  if (geloRischio) {
    if (geloEl) geloEl.textContent='❄️';
    if (stEl) stEl.textContent='⚠️ Periodo a rischio gelo';
    if (dEl) dEl.textContent='Temperatura minima può scendere sotto 0°C. Proteggi i vasi.';
  } else if (m>=2&&m<=10) {
    if (geloEl) geloEl.textContent='✅';
    if (stEl) stEl.textContent='Finestra sicura outdoor';
    if (dEl) dEl.textContent=`T minima media: ${GELO_STATS.tempMinMedia[m]}°C. Nessun rischio gelo.`;
  } else {
    if (geloEl) geloEl.textContent='🌡️';
    if (stEl) stEl.textContent='Monitorare le temperature';
    if (dEl) dEl.textContent='Periodo di transizione. Controlla le previsioni.';
  }

  // Statistiche
  const stats = document.getElementById('cal-gelo-stats');
  if (stats) {
    stats.innerHTML = [
      {label:'Primo gelo medio', val:'15 Dicembre', note:'Caserta storico'},
      {label:'Ultimo gelo medio', val:'20 Febbraio', note:'Caserta storico'},
      {label:'T minima assoluta', val:'-5°C (1985)', note:'Eccezionale'},
      {label:'Giorni gelo/anno', val:'~8 giorni', note:'Media 1981-2010'},
      {label:'Finestra sicura', val:'1 Mar → 30 Nov', note:'9 mesi outdoor'},
    ].map(s => `<div class="cal-gelo-stat">
      <div><div style="font-size:12px;font-weight:700;">${s.label}</div><div style="font-size:10px;color:var(--text3);">${s.note}</div></div>
      <div style="font-size:13px;font-weight:700;color:var(--blue);">${s.val}</div>
    </div>`).join('');
  }

  // Finestra sicura
  const fw = document.getElementById('cal-gelo-finestra');
  if (fw) fw.innerHTML = `
    <div style="font-size:13px;color:var(--text2);line-height:1.8;">
      🟢 <strong>Inizio stagione sicura:</strong> 1 Marzo<br>
      🔴 <strong>Fine stagione sicura:</strong> 30 Novembre<br>
      📅 <strong>Durata:</strong> ~9 mesi outdoor<br><br>
      <strong>Per le tue piante 2026:</strong><br>
      ✅ Germinazioni Apr 2026: tutte in finestra sicura<br>
      ✅ Autofiorenti raccolta Lug–Ago: ampiamente sicure<br>
      ✅ Femminizzate raccolta Ott–Nov: sicure fino al 30 Nov<br>
      ⚠️ Concia in Dec–Jan: portare indoor sotto 5°C
    </div>`;

  // Badge nella card meteo
  var gBadge = document.getElementById('w-gelo-badge');
  var gBadgeTxt = document.getElementById('w-gelo-badge-txt');
  if (gBadge && gBadgeTxt && stEl) {
    gBadgeTxt.textContent = stEl.textContent;
    gBadge.style.display = geloRischio ? 'block' : 'none';
  }
  // Avvisi
  const avv = document.getElementById('cal-gelo-avvisi');
  if (avv) {
    const avvisi = [];
    if (m>=11||m<=1) avvisi.push({color:'#ef5350',txt:'❄️ RISCHIO GELO ATTIVO — Copri i vasi con telo termico sotto 4°C'});
    if (m===2&&d<15) avvisi.push({color:'#ff9800',txt:'⚠️ Ultime possibili gelate tardive — monitorare notte'});
    if (m>=8&&m<=9) avvisi.push({color:'#ffd54f',txt:'🍂 Autunno in arrivo — controlla le previsioni per freddo notturno'});
    if (avvisi.length===0) avvisi.push({color:'#4caf76',txt:'✅ Nessun rischio gelo attuale — stagione sicura'});
    avv.innerHTML = avvisi.map(a=>`<div style="padding:10px 12px;background:var(--card2);border-radius:8px;border-left:4px solid ${a.color};font-size:13px;color:var(--text2);">${a.txt}</div>`).join('');
  }
}

/* ══════════════════════════════════════════════════════════════
   TAB MATURAZIONE
══════════════════════════════════════════════════════════════ */
function renderCalMatur() {
  const today = new Date();

  // Prossima raccolta
  const prossima = CAL_PIANTE
    .map(p => {
      const d = p.tipo==='auto' ? new Date(new Date(p.germ).getTime()+p.giorni*86400000) : new Date(p.raccolta);
      return { p, d, gg: Math.floor((d-today)/86400000) };
    })
    .filter(x => x.gg >= 0)
    .sort((a,b) => a.gg-b.gg)[0];

  const pmEl = document.getElementById('cal-matur-prossima');
  const pdEl = document.getElementById('cal-matur-desc');
  if (prossima && pmEl) {
    pmEl.textContent = `${prossima.p.nome} — ${fmtIT(prossima.d)} (tra ${prossima.gg} giorni)`;
    if (pdEl) pdEl.textContent = `ID:${prossima.p.id} · ${prossima.p.tipo==='auto'?'Autofiorente '+prossima.p.giorni+'gg':'Femminizzata · innesco ott.'}`;
  }

  // Lista tutte le piante
  const lista = document.getElementById('cal-matur-piante');
  if (lista) {
    const sorted = CAL_PIANTE.map(p => {
      const racD = p.tipo==='auto' ? new Date(new Date(p.germ).getTime()+p.giorni*86400000) : new Date(p.raccolta);
      const gg = Math.floor((racD-today)/86400000);
      return { p, racD, gg };
    }).sort((a,b) => a.gg-b.gg);

    lista.innerHTML = sorted.map(({p, racD, gg}) => {
      const status = gg < 0 ? '✅ Raccolta' : gg === 0 ? '🍊 OGGI!' : gg <= 7 ? '🔴 Imminente' : gg <= 30 ? '🟡 Prossima' : '🟢 In crescita';
      const moonFase = getMoonPhase(getMoonAge(racD));
      return `<div class="cal-matur-row" onclick="openCalMaturPopup('${p.id}')">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:700;">${p.nome} <span style="font-size:10px;opacity:.6">ID:${p.id}</span></div>
          <div style="font-size:10px;color:var(--text3);">${p.tipo==='auto'?'⚡ Auto':'🌸 Femm.'} · Raccolta: ${fmtIT(racD)}</div>
          <div style="font-size:10px;color:var(--text3);">🌙 ${moonFase.emoji} ${moonFase.name} (${gg>=0?'tra '+gg+' gg':'passata'})</div>
        </div>
        <div style="flex-shrink:0;font-size:12px;font-weight:700;text-align:right;">${status}</div>
      </div>`;
    }).join('');
  }

  // Ottimizzazione luna
  const luna = document.getElementById('cal-matur-luna');
  if (luna) {
    const age = getMoonAge(today); const phase = getMoonPhase(age);
    luna.innerHTML = `
      <strong>Fase attuale: ${phase.emoji} ${phase.name}</strong><br><br>
      <strong>Quando raccogliere per massima qualità:</strong><br>
      🌕 <strong>Luna Piena</strong> → Massimo contenuto di resine e terpeni. Ideale per raccolta e prima valutazione.<br>
      🌔 <strong>Gibbosa Crescente</strong> → Ottimo secondo best. Pianta al picco di vigore.<br>
      🌑 <strong>Luna Nuova</strong> → Da evitare per raccolta. Minima vitalità.<br><br>
      <strong>Per l'essiccazione:</strong><br>
      🌿 Giorno Radice o Frutto → Miglior conservazione degli aromi durante il processo.<br><br>
      <strong>Per la concia (barattoli):</strong><br>
      🌙 Luna calante → Processo di curing più uniforme secondo la tradizione biodinamica.`;
  }
}

function openCalMaturPopup(id) {
  const p = CAL_PIANTE.find(x=>String(x.id)===String(id));
  if (!p) return;
  const today = new Date(); const germ = new Date(p.germ);
  const racD = p.tipo==='auto' ? new Date(germ.getTime()+p.giorni*86400000) : new Date(p.raccolta);
  const gg = Math.floor((racD-today)/86400000);
  const moonFase = getMoonPhase(getMoonAge(racD));
  const overlay=document.getElementById('amb-popup-overlay');
  const content=document.getElementById('amb-popup-content');
  if(!overlay||!content) return;
  content.innerHTML = `<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;">Maturazione</div>
<div style="font-size:18px;font-weight:700;margin:6px 0;">${p.nome}</div>
<div style="background:var(--card2);border-radius:10px;padding:12px;margin-bottom:12px;font-size:13px;color:var(--text2);line-height:1.9;">
  🌱 Germinazione: <strong>${fmtIT(germ)}</strong><br>
  🍊 Raccolta prevista: <strong>${fmtIT(racD)}</strong><br>
  ⏳ Mancano: <strong>${gg>=0?gg+' giorni':'DATA PASSATA'}</strong><br>
  🌙 Fase lunare alla raccolta: <strong>${moonFase.emoji} ${moonFase.name}</strong><br>
  📏 ${p.tipo==='auto'?'Ciclo: '+p.giorni+'gg fisso · Fioritura: '+p.fiorGG+'gg':'Fioritura: '+p.fiorGG+'gg · Innesco: '+fmtIT(new Date(p.fiorInizio))}
</div>
<div style="font-size:13px;font-weight:700;margin-bottom:8px;">Segnali di maturità:</div>
<div style="font-size:13px;color:var(--text2);line-height:1.8;">
  🔬 Trichomi: <strong>≥30% ambrati</strong> → raccogli<br>
  🍂 Pistilli: <strong>80% arancioni/rossi</strong> → maturità<br>
  🌿 Foglie: ingiallimento naturale delle foglie più vecchie<br>
  👃 Aroma: intenso e caratteristico della varietà
</div>
<div style="margin-top:12px;padding:10px;background:rgba(74,175,94,0.08);border-radius:8px;font-size:12px;color:var(--text2);">
  <strong>Post-raccolta:</strong><br>
  🌬️ Essiccazione: 14 giorni a 18-22°C, 50% umidità, buio<br>
  🫙 Concia: 14 giorni in barattoli di vetro, aprire 15min/giorno
</div>`;
  overlay.style.display='flex'; document.body.style.overflow='hidden';
}

/* ══════════════════════════════════════════════════════════════
   POPUP AGGIUNTIVI per buildPopupContent
══════════════════════════════════════════════════════════════ */
function buildCalPopupContent(type) {
  const today = new Date();
  const bio = getDayType(today); const bioT = DAY_TYPES[bio.type];
  const moonA = getMoonAge(today); const moonP = getMoonPhase(moonA); const adv = getAdvice(moonP.code);
  const sun = calcSunTimes(today);
  const lav = getLavoriOggi(today);
  const tratt = getTrattOggi(today);
  const fenol = getFenolFase(today);

  switch(type) {
    case 'cal-semine-oggi': {
      const sem = getSemineOggi(today);
      return `<div class="amb-popup-label">Semine Oggi</div>
<div class="amb-popup-title">${sem.emoji} ${sem.label}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">${sem.motivo}</div></div>
<div class="amb-popup-section">
  <div class="amb-popup-label">Metodo Maria Thun</div>
  <div style="font-size:13px;color:var(--text2);line-height:1.7;">
    🌱 <strong>Giorni Radice</strong> (${bio.type==='radice'?'✅ oggi!':'non oggi'}) → Seminare tuberi e radici<br>
    🌸 <strong>Giorni Fiore</strong> (${bio.type==='fiore'?'✅ oggi!':'non oggi'}) → Fiorite, aromi<br>
    🍊 <strong>Giorni Frutto</strong> (${bio.type==='frutto'?'✅ oggi!':'non oggi'}) → Cime, fiori, semi<br>
    💧 <strong>Giorni Foglia</strong> (${bio.type==='foglia'?'✅ oggi!':'non oggi'}) → Foglie, vegetali<br><br>
    Per la cannabis: preferisci <strong>Giorni Frutto</strong> per la fioritura e <strong>Giorni Radice</strong> per la crescita radicale.
  </div>
</div>`;
    }
    case 'cal-tratt-oggi': {
      return `<div class="amb-popup-label">Trattamento Oggi</div>
<div class="amb-popup-title">${tratt.label}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">${tratt.desc}</div></div>
<div class="amb-popup-section">
  <div class="amb-popup-label">Ricette complete</div>
  <div style="font-size:13px;color:var(--text2);line-height:1.8;">
    🍯 <strong>Melassa:</strong> 1ml/L acqua · bottiglia separata · ogni 15 gg · Giorni Foglia<br>
    🌿 <strong>Ortiche:</strong> 100g/L · macera 7gg · diluire 1:10 · Giorni Foglia/Radice<br>
    🍌 <strong>Banana:</strong> 3-4 bucce bolli 15min · 1 cucch. cenere · diluire 1:5 · Giorni Frutto/Fiore<br>
    🦠 <strong>Humus:</strong> 5L + 100-150g BioBizz · rinnova ogni mese · Giorni Radice<br>
    🥚 <strong>Miscela:</strong> caffè essiccato + guscio uovo + banana · 1 cucch./vaso · Giorni Radice
  </div>
</div>`;
    }
    case 'cal-foto-oggi': {
      return `<div class="amb-popup-label">Fotoperiodo</div>
<div class="amb-popup-title">☀️ ${sun.dayLen.toFixed(2)}h di luce oggi</div>
<div class="amb-popup-section">
  <div style="font-size:13px;color:var(--text2);line-height:1.8;">
    🌅 Alba: <strong>${hToHHMM(sun.sunrise)}</strong><br>
    🌇 Tramonto: <strong>${hToHHMM(sun.sunset)}</strong><br>
    ⏱️ Durata: <strong>${sun.dayLen.toFixed(2)}h</strong><br>
    📍 Coordinate: 41.097°N 14.388°E (Caserta)<br><br>
    <strong>Impatto sulle piante:</strong><br>
    ⚡ <strong>Autofiorenti:</strong> ${sun.dayLen>=18?'✅ Crescita ottimale (≥18h)':sun.dayLen>=15?'🟡 Buona crescita (15-18h)':sun.dayLen>=12?'🟠 Crescita moderata':'⚠️ Crescita rallentata (<12h)'}<br>
    🌸 <strong>Femminizzate:</strong> ${sun.dayLen>12?'🌿 Fase vegetativa (>12h)':sun.dayLen===12?'⚠️ Soglia critica 12h!':'🌸 FIORITURA INNESCATA (<12h)'}<br><br>
    Algoritmo astronomico NOAA adattato. Calcolo preciso per le coordinate della serra.
  </div>
</div>`;
    }
    case 'cal-fenol-oggi': {
      return `<div class="amb-popup-label">Fase Fenologica</div>
<div class="amb-popup-title">${fenol.fase}</div>
<div class="amb-popup-section"><div style="font-size:13px;color:var(--text2);line-height:1.7;">${fenol.desc}</div></div>
<div class="amb-popup-section">
  <div class="amb-popup-label">Impatto sulle 10 piante</div>
  <div style="font-size:13px;color:var(--text2);line-height:1.8;">
    ${CAL_PIANTE.map(p=>{
      const germ=new Date(p.germ); const gg=Math.floor((today-germ)/86400000);
      return `${p.nome}: ${gg<0?'⏳ non ancora germinata':gg<15?'🌱 seedling':gg<50?'🌿 vegetativa':'🌸 fioritura/maturazione'}`;
    }).join('<br>')}
  </div>
</div>`;
    }
    case 'cal-lavori-oggi': {
      return `<div class="amb-popup-label">Lavori Oggi</div>
<div class="amb-popup-title">🔧 ${lav.titolo}</div>
<div class="amb-popup-section">
  <div style="font-size:13px;color:var(--text3);margin-bottom:8px;">${lav.sub}</div>
  ${lav.lavori.map(l=>`<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
    <span style="color:var(--green3);">☐</span><span style="font-size:13px;color:var(--text2);">${l}</span>
  </div>`).join('')}
</div>`;
    }
    case 'cal-preparazioni': {
      return `<div class="amb-popup-label">Preparazioni Biodinamiche</div>
<div class="amb-popup-title">🧘 Calendario Preparati</div>
<div class="amb-popup-section">
  <div style="font-size:13px;color:var(--text2);line-height:1.8;">
    🌿 <strong>Preparato 500 (Cornoletame)</strong><br>
    Usa in primavera-autunno. Applica la sera su terreno umido. 1g/vaso diluito 1:10 agitato 1h. Favorisce vita del suolo.<br><br>
    🦷 <strong>Preparato 501 (Cornosilice)</strong><br>
    Usa in estate (mag-ago). Applica al mattino presto (6-8h). Potenzia fotosintesi e resine. Non usare in fioritura avanzata.<br><br>
    🌿 <strong>Preparato Ortica (508)</strong><br>
    Infuso di ortiche fermentato 14 giorni. Ricco di Fe, K, N. Rinforza le piante e contrasta i parassiti. Ogni 2-3 settimane.<br><br>
    🫙 <strong>Valeriana (507)</strong><br>
    Prima di temperature estreme. Stimola la fioritura. 8 gocce/L agitate 15min.
  </div>
</div>`;
    }
    case 'cal-compostaggio': {
      return `<div class="amb-popup-label">Compostaggio</div>
<div class="amb-popup-title">♻️ Calendario Compost Living Soil</div>
<div class="amb-popup-section">
  <div style="font-size:13px;color:var(--text2);line-height:1.8;">
    <strong>Giorni Radice:</strong> Gira il cumulo e aggiungi materiale verde (scarti organici). Massima attività microbica.<br><br>
    <strong>Giorni Foglia:</strong> Aggiungi materiale carbonio (foglie secche, cartone) e irrora con acqua.<br><br>
    <strong>Giorni Frutto:</strong> Aggiungi bucce di banana, fondi caffè, gusci uovo. Ideale per raccogliere scarti di cucina.<br><br>
    <strong>Giorni Fiore:</strong> Aggiungi cenere di legno e polvere di roccia basaltica per remineralizzare.<br><br>
    <strong>Luna nuova:</strong> Gira il cumulo principale. Massima penetrazione di ossigeno.<br>
    <strong>Luna piena:</strong> Irrora con infuso di ortiche per attivare i microbi.
  </div>
</div>`;
    }
    case 'cal-thun': {
      return `<div class="amb-popup-label">Metodo Maria Thun</div>
<div class="amb-popup-title">📖 Lunario delle Semine</div>
<div class="amb-popup-section">
  <div style="font-size:13px;color:var(--text2);line-height:1.8;">
    Maria Thun (1922-2012) ha codificato il legame tra la posizione della Luna nelle costellazioni zodiacali e la crescita delle piante.<br><br>
    <strong>Sistema delle 4 qualità:</strong><br>
    🍊 <strong>Frutto</strong> (Ariete, Leone, Sagittario — Fuoco) → Semi, cime, frutti<br>
    🌸 <strong>Fiore</strong> (Gemelli, Bilancia, Acquario — Aria) → Fiori, aromi, terpeni<br>
    🌿 <strong>Radice</strong> (Toro, Vergine, Capricorno — Terra) → Radici, tuberi, substrato<br>
    💧 <strong>Foglia</strong> (Cancro, Scorpione, Pesci — Acqua) → Foglie, vegetazione<br><br>
    <strong>Per la cannabis:</strong><br>
    ✅ Semina in Giorni Frutto (Ariete, Leone, Sagittario)<br>
    ✅ Trapianto in Giorni Radice (Toro, Vergine, Capricorno)<br>
    ✅ Raccolta in Giorni Frutto, preferibilmente Luna Piena<br>
    ⚠️ Evita Giorni Foglia per operazioni importanti
  </div>
</div>`;
    }
    case 'cal-conservazione': {
      return `<div class="amb-popup-label">Conservazione</div>
<div class="amb-popup-title">🫙 Essiccazione e Concia</div>
<div class="amb-popup-section">
  <div style="font-size:13px;color:var(--text2);line-height:1.8;">
    <strong>🌬️ Essiccazione (14 giorni):</strong><br>
    🌡️ Temperatura: 18-22°C<br>
    💧 Umidità: 50% (evita muffe)<br>
    🌑 Luce: buio totale<br>
    💨 Ventilazione: leggera circolazione d'aria<br>
    📅 Ideale in Giorni Frutto o Radice (biodinamica)<br><br>
    <strong>🫙 Concia/Curing (14+ giorni):</strong><br>
    📦 Barattoli di vetro (non plastica)<br>
    🌡️ Luogo fresco e buio (15-20°C)<br>
    🔄 Apri 15 minuti/giorno (primi 7 giorni)<br>
    📉 Poi ogni 2-3 giorni per altre 2 settimane<br>
    🌙 Inizia in Luna calante per curing uniforme (tradizione biodinamica)<br><br>
    <strong>✅ Pronta quando:</strong><br>
    Umidità interna 62-65% · Aroma pieno · Consistenza morbida ma non umida
  </div>
</div>`;
    }
    default: return null;
  }
}

/* buildCalPopupContent è chiamata dalla buildPopupContent originale tramite hook nel default */

function getIrrigOggi(today, sun) {
  const bio = getDayType(today); const moonA = getMoonAge(today); const moonP = getMoonPhase(moonA);
  const dayLen = sun ? sun.dayLen : 14;
  if (bio.type === 'foglia') return { label:'💧 Irrigazione aumentata (Giorno Foglia)', desc:'Massima domanda idrica. Verifica serbatoio 50L.' };
  if (moonP.code === 'new') return { label:'⏸️ Irrigazione ridotta (Luna Nuova)', desc:'Minima vitalità. 1 ciclo/giorno sufficiente.' };
  if (dayLen > 16) return { label:'⚠️ Alta ETo — Bagna i bordi dei vasi', desc:'Giornata lunga e calda. 2 cicli pompa + bordi manuali.' };
  return { label:'✅ Irrigazione normale', desc:'1-2 cicli pompa. Controlla umidità superficiale.' };
}


(function avvioApp() {
  function runInit() {
    if (typeof window.initApp === 'function' && !window._appInitialized) {
      window._appInitialized = true;
      try {
        window.initApp();
      } catch(e) {
        console.error('[BioSerra] initApp error:', e);
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
  } else {
    runInit();
  }
})();


