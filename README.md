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
affordance dell'editor (contorni tratteggiati, frecce di riordino, pulsanti
link) non finiscono mai nell'export.

Dal menu `•••`: duplica il quarter successivo (mantiene righe e sprint, azzera
le fasi), rinomina, elimina, esporta e importa tutto in JSON.

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
build.sh                  genera index.html standalone dal sorgente
index.html                versione autonoma, apribile da disco
```

Dopo ogni modifica al sorgente:

```sh
./build.sh
```

## Persistenza

- Pubblicato come Artifact, i dati stanno nel database dell'artifact: restano tra
  sessioni e dispositivi e sono visibili a chi ha accesso all'artifact. Chi ha
  accesso in sola lettura vede la roadmap ed esporta, ma non modifica.
- Aperto da disco (`index.html`), i dati stanno nel `localStorage` del browser.
  Usa `Esporta tutto (JSON)` per portarli altrove.

Il tool si apre su un quarter di esempio, così la prima sessione parte da una
board funzionante e non da una griglia vuota. Per caricare la tua roadmap usa
`•••` → `Importa JSON`: sostituisce l'esempio e resta salvata nel tuo browser.

## Limiti noti

- Una cella tiene al massimo due fasi affiancate.
- Il set di fasi è fisso per vista (tre per Prodotto, due per Design).
- L'export PNG usa `html2canvas` da CDN: senza rete il pulsante non funziona.
