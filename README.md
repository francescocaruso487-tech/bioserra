# 🌿 BioSerra

PWA mobile-first per la gestione di una serra **Living Soil** outdoor, con monitoraggio piante, ambiente ed elettrocultura, pipeline dati automatizzata e assistente AI.

**🔗 App live:** https://francescocaruso487-tech.github.io/bioserra/

![Deploy status](https://github.com/francescocaruso487-tech/bioserra/actions/workflows/deploy-pages.yml/badge.svg)

## Cos'è

BioSerra segue il ciclo di vita di 10 piante (5 autofiorenti, 5 femminizzate fotoperiodiche) coltivate in Living Soil / water-only, con esperimenti di elettrocultura (circuito Lakhovsky, coppie galvaniche Fe-Cu, pantacolo di rame, acqua magnetizzata, antenna cosmica) e pratiche biodinamiche integrate.

L'app è pensata per essere usata interamente da smartphone: nessuna dipendenza da PC per la gestione quotidiana.

## Funzionalità principali

- **🌿 Piante** — timeline di fase, calendario raccolti, diario interventi, correlazioni intervento↔esito, export report PDF
- **🌍 Ambiente** — meteo, fasi lunari, alert critici, storico microclima
- **🔬 Laboratorio** — tecniche di elettrocultura, pratiche ON/OFF, un "Second Brain" con ricerca semantica sui manuali di coltivazione, assistente AI conversazionale
- **⚙️ Config** — temi, notifiche, salute della pipeline dati

## Stack tecnico

- **Frontend:** JavaScript vanilla, nessun framework — PWA con service worker per uso offline
- **Automazione:** GitHub Actions, pipeline notturna a step sequenziali (estrazione testi, traduzione, classificazione, analisi semantica, generazione briefing giornaliero)
- **AI:** Mistral AI (`mistral-small-latest` + `mistral-embed`) per l'elaborazione della pipeline; OpenRouter/Llama per la chat lato client
- **Dati:** meteo via Open-Meteo, notifiche via Telegram Bot API
- **Hosting:** GitHub Pages

## Pipeline dati (sintesi)

Ogni notte una catena di script Python legge ~89 manuali di coltivazione, li traduce, li classifica, ne estrae connessioni semantiche, e genera un briefing giornaliero personalizzato basato sullo stato reale delle piante — poi lo notifica via Telegram.

## Struttura cartelle

```
index.html          punto d'ingresso PWA
js/                  app.js, piante.js, ambiente.js, laboratorio.js, config.js
css/                 stili e temi
data/                JSON generati/aggiornati dalla pipeline notturna
MANUALI/             manuali di coltivazione (PDF, fonte per il Second Brain)
.github/workflows/   definizioni della pipeline GitHub Actions
.github/scripts/     script Python della pipeline
```

## Nota

Progetto personale/sperimentale, sviluppato e gestito interamente da mobile.
