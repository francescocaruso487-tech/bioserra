# Changelog

Storico sintetico delle revisioni principali del progetto. Dettagli tecnici completi e istruzioni operative sono gestiti separatamente (non in questo repository).

## Rev.23 — 2026-07-06
- Verifica end-to-end del primo run notturno reale dopo i fix di Rev.22
- Sincronizzazione della fase/data di raccolta dell'app verso i dati salvati, invece di restare solo locale al dispositivo
- Fix di un disallineamento visivo nella timeline di fase delle piante
- Pulizia e blindatura della memoria a lungo termine dell'AI contro urgenze di raccolta obsolete/errate
- Stesso fix applicato al modulo di generazione del briefing giornaliero
- Retry automatico (3 tentativi) sul workflow di deploy, per ridurre i fallimenti sotto push ravvicinati

## Rev.22 — 2026-07-05
- Fix di una race condition nel deploy che causava fallimenti sporadici
- Audit completo dell'app (sintassi, handler, coerenza dati)
- Corretto un bug importante: i calcoli lato server non applicavano gli stessi moltiplicatori del client
- Fix di una perdita di dati (ore di luce) ad ogni aggiornamento notturno
- Corretta una fase di crescita rimasta non aggiornata

## Rev.21 — 2026-07-05
- Ricalibrazione del moltiplicatore di crescita delle piante autofiorenti su un dato reale osservato

## Rev.13 → Rev.20 — giugno/luglio 2026
- Costruzione progressiva della pipeline dati notturna (estrazione, traduzione, classificazione, analisi semantica dei manuali di coltivazione)
- Introduzione del Second Brain (ricerca semantica sui manuali)
- Introduzione della memoria a lungo termine dell'assistente AI
- Introduzione di funzionalità piante (calendario raccolti, correlazioni interventi/esiti, export PDF) e ambiente (alert meteo, storico microclima)
- Consolidamento della resilienza degli script (retry automatici su lettura/scrittura dati)
- Progressiva rimozione di codice orfano/duplicato
