# Roadmap Snapshot Studio

Tool per costruire le due slide di roadmap che servono a ogni fine quarter,
senza ridisegnarle a mano ogni volta:

- **Vista Prodotto** — `Quarter roadmap snapshot (Qx)`, per CPO, head of business
  unit e stakeholder. Fasi: Discovery → Specs → Delivery.
- **Vista Design** — `Quarter design roadmap snapshot (Qx)`, per il team di
  design. Fasi: Experience Conception → Delivery.

Le due viste condividono gli stessi sprint e la stessa libreria di iniziative,
ma hanno righe, ordine, etichette, colori di categoria e milestone indipendenti:
la vista design può mostrare un sottoinsieme delle iniziative e accorpare due
righe in una sola, dandole un'etichetta valida solo lì.

## Come si usa

La slide **è** l'editor: quello che vedi è esattamente quello che esporti.

| Gesto | Effetto |
| --- | --- |
| clic su una cella | applica la fase selezionata nella barra in alto |
| trascinamento | riempie più sprint di fila |
| `Shift` + clic | stende l'intera sequenza (Discovery, Specs, Delivery) da quello sprint in poi |
| `Alt` + clic | affianca una seconda fase nella stessa colonna (rende le `D` `S` mezze colonne) |
| tasto destro | cancella la cella |
| `1`–`4` / `0` | cambiano la fase attiva / gomma |
| clic sul titolo, sul post-it, sulle intestazioni sprint | modifica diretta del testo |
| clic sull'etichetta di riga | apre il dettaglio nel pannello di sinistra |
| `↗` sull'etichetta | apre il link alla documentazione |
| `−` `+` in alto a destra | zoom; `Adatta` torna alla larghezza della finestra |
| `☰` in alto a sinistra | mostra o nasconde il pannello laterale |
| `Ctrl/Cmd+Z` | annulla; con `Shift` ripristina |
| `?` | elenco delle scorciatoie |

### Milestone

La linea verde di go-live si modifica direttamente sulla slide: si scrive
sull'etichetta, si trascina il corpo della linea per spostarla tra gli sprint,
si tirano i due pallini ai capi per allungarla sulle righe e la `×` la elimina.
`+ Milestone` nella barra degli strumenti ne aggiunge una.

### Presentazione

`▶ Presenta` (o `P`) apre il deck a schermo intero: niente editor, solo le
slide del quarter. `←` `→` scorrono le viste, `↑` `↓` cambiano quarter, `Esc`
esce. Le iniziative con un link restano cliccabili durante la presentazione,
così apri la documentazione mentre parli.

La slide non scende mai sotto il 62%: sotto quella soglia le celle degli sprint
diventano bersagli da ~40×21 px e cliccarle è un terno al lotto. In una finestra
stretta il canvas scorre in orizzontale invece di rimpicciolirsi, il pannello
laterale parte chiuso e zoom e stato del pannello restano memorizzati.

### Pannello laterale

- **Iniziative** — la libreria persistente. La spunta dice se l'iniziativa è
  nella vista aperta; il dettaglio contiene nome, **link alla documentazione**,
  etichetta alternativa valida solo in quella vista, colore della barra di
  categoria (verde / lime "da validare" / nessuna) e riquadro di evidenza.
- **Sprint** — genera le intestazioni da una data di inizio, una durata e un
  numero di sprint; numerazione e quarter avanzano da soli. Le fasi già dipinte
  restano dove sono.
- **Milestone** — la linea verticale verde con l'etichetta di go-live: sprint di
  ancoraggio e righe coperte.

### Esportare

`Scarica PNG` produce un file 3200×1800 (2×) pronto da incollare in Google
Slides o Keynote; `Copia PNG` mette la stessa immagine negli appunti. Le
affordance dell'editor (contorni tratteggiati, frecce di riordino, maniglie
delle milestone) non finiscono mai nell'export.

Dal menu `•••`: `Esporta deck in PDF` mette entrambe le viste del quarter in un
PDF orizzontale da mandare a chi non era in riunione; poi duplica il quarter
successivo (mantiene righe e sprint, azzera le fasi), rinomina, elimina,
esporta e importa tutto in JSON.

## Brand

I colori della slide sono fissi e non seguono il tema chiaro/scuro, perché sono
l'artwork che finisce nel deck:

| Ruolo | Hex |
| --- | --- |
| Discovery, barra di categoria, milestone | `#17c3a2` |
| Specs, Experience Conception | `#f4a32a` |
| Delivery | `#5b4ee8` |
| Post-it "To validate", barra "da validare" | `#dcf223` |
| Testo | `#101012` |
| Pillola di riga | `#f0f0f1` |
| Link | `#1155cc` |

Il carattere è **Figtree** (Google Fonts). Per sostituirlo con il font
aziendale basta cambiare il `<link>` e la `font-family` in cima al file.

## Struttura del repository

```
src/roadmap-studio.html   sorgente (corpo pagina, senza skeleton)
build.sh                  genera index.html dal sorgente (bash + awk, zero dipendenze)
index.html                pagina servita e apribile da disco — output del build
vercel.json               hosting statico: cache e header
test/review.mjs           suite di verifica funzionale in Chromium
```

Dopo ogni modifica al sorgente:

```sh
./build.sh
```

`index.html` è generato: non modificarlo a mano, le modifiche vanno in
`src/roadmap-studio.html`.

## Verifica

```sh
npm --prefix test install
npm --prefix test test
```

Apre `index.html` in Chromium ed esercita ogni comportamento del tool —
pennelli, gomma (clic, trascinamento, tasto destro, tastiera), undo/redo,
milestone trascinabili, presentazione, export PNG e PDF, generazione sprint,
persistenza e regole per finestre strette. Esce con codice diverso da zero al
primo fallimento o errore JavaScript di pagina.

In ambienti senza accesso alle CDN, passa `H2C_PATH` e `JSPDF_PATH` con copie
locali di html2canvas e jsPDF; `CHROMIUM` punta a un binario alternativo.

## Hosting e persistenza

**Produzione: https://roadmap-snapshot-studio.vercel.app**

Progetto Vercel `roadmap-snapshot-studio`, collegato a questo repo: ogni push
sul branch di produzione (`claude/keen-ritchie-1wkx3v`) fa un deploy
automatico. Il deploy è statico — `index.html` viene servito così com'è, senza
build e senza runtime — quindi esegui `./build.sh` e committa `index.html`
insieme alle modifiche al sorgente, altrimenti va online la pagina precedente.
`.vercelignore` tiene fuori sorgente, test e documentazione.

L'URL di produzione è pubblico: chi ha il link apre il tool, ma non i tuoi
dati, che restano nel browser di chi li ha inseriti.

- Su Vercel (o aperto da disco) i dati stanno nel `localStorage` del browser:
  restano tra le sessioni su quel dispositivo, non seguono l'utente altrove.
  `Esporta tutto (JSON)` è il modo per spostarli o tenerne un backup.
- Pubblicato come Artifact, i dati stanno nel database dell'artifact e seguono
  l'utente tra dispositivi. Chi ha accesso in sola lettura consulta ed esporta
  ma non modifica.

Il tool si apre su un quarter di esempio, così la prima sessione parte da una
board funzionante e non da una griglia vuota. Per caricare la tua roadmap usa
`•••` → `Importa JSON`: sostituisce l'esempio e resta salvata nel tuo browser.

## Limiti noti

- Una cella tiene al massimo due fasi affiancate.
- Il set di fasi è fisso per vista (tre per Prodotto, due per Design).
- Il deck di presentazione è il quarter aperto: `↑` `↓` passano agli altri.
- Export PNG e PDF usano `html2canvas` e `jsPDF` da CDN: senza rete quei due pulsanti non funzionano.
