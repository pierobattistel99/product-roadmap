# Roadmap Snapshot Studio

**Production: https://roadmap-snapshot-studio.vercel.app**

A tool for building the two roadmap slides that come round every quarter,
instead of redrawing them by hand:

- **Product view** — `Quarter roadmap snapshot (Qx)`, for the CPO, heads of
  business unit and stakeholders. Phases: Discovery → Specs → Delivery.
- **Design view** — `Quarter design roadmap snapshot (Qx)`, for the design
  team. Phases: Discovery → Experience Conception.

The design team reads those two words its own way: *experience/experimentation*
is the discovery phase, and *conception* is their delivery. So the design view
carries Discovery in the same green as the product view and Experience
Conception in amber — and no Delivery, which belongs to the product view only.

### The two roadmaps are independent

They share the sprint header and one initiative library, and nothing else. Each
view keeps its own rows, ordering, labels, category bars and milestones, so the
design roadmap is free to carry requests the product roadmap has never heard of
— a design system audit, an illustration refresh — and to leave out product work
the design team is not involved in.

**A row owns its own data.** Name, link, description and area live on the row,
not in a shared record, so renaming a row on the design roadmap never touches
the product one — the two can word the same piece of work differently, or carry
work the other has never heard of.

The library is a **catalogue to pick from**, not the source of truth. Ticking an
entry copies its fields onto the roadmap you have open; from that moment the row
is independent. **P** and **D** show where an entry has already been used, the
dropdown narrows the list to what is on the open view or missing from it, and
*New initiative* adds a catalogue entry plus a row on the open view.
*Remove from library* drops the catalogue entry and leaves every roadmap alone.

Boards saved before this are migrated on load: each row keeps the name it was
showing, taking the per-view label where one was set.

## Using it

The slide **is** the editor: what you see is exactly what you export.

| Gesture | Effect |
| --- | --- |
| click a cell | applies the phase selected in the toolbar |
| drag | fills several sprints in a row |
| `Shift` + click | lays the whole sequence (Discovery, Specs, Delivery) from that sprint on |
| `Alt` + click | puts a second phase beside the first in the same sprint |
| right-click | erases the cell — drag to erase a run |
| `½ Half sprint` / `H` | paints only the half of the sprint you click |
| `1`–`4` / `0` | pick a phase / the eraser |
| click the title, the sticky note, a sprint header | edit the text in place |
| click a row label | opens the detail in the left panel |
| `↗` on a label | opens the documentation link |
| hover a row label | shows the initiative's area and short description |
| `−` `+` top right | zoom; `Fit` goes back to the window width |
| `☰` top left | show or hide the side panel |
| `Ctrl/Cmd+Z` | undo; with `Shift`, redo |
| `?` | list of every shortcut |

The slide never scales below 62%: past that, sprint cells become ~40×21 px
targets and clicking them is a lottery. In a narrow window the canvas scrolls
horizontally instead of shrinking, the side panel starts folded, and the zoom
and panel state are remembered.

### Category bars and the legend

The coloured bar down the left of each row says **why** the initiative is on the
roadmap:

- **yellow** — a legal obligation
- **green** — every other reason

The legend is printed at the bottom of the slide and only lists the colours
actually in use. Turn it off under `•••` → `Show legend on the slide`, or in the
Sprints panel.

That is separate from **Area** (Finance, Operations, Business, Legal, Growth,
Tech…), which says who owns the initiative. Area shows up beside each name in
the library, is searchable, and appears in the hover card.

### Milestones and go-live lines

A milestone is the green vertical line with a caption: a go-live that happens on
its own date, independent of any initiative's delivery.

- Drag **⇥ Go-live** from the toolbar onto the grid to drop one where you want
  it; click it without dragging to add one at a default spot.
- Type on the caption to rename it.
- Drag the body of the line to move it along the timeline.
- Drag the two dots at the ends to stretch it across rows.
- `×` deletes it.

A go-live lands on a real date, which is rarely a sprint boundary, so the line
snaps to **quarters of a sprint**: start, a quarter in, middle, three quarters
in, end. That is 33 positions across eight sprints rather than 8. The
Milestones panel sets the same thing with two dropdowns — which sprint, and
where inside it — for anyone who would rather not drag.

### The sticky note

The yellow "To validate" note is off by default. `+ Note` in the toolbar puts it
back and focuses it so you can type; the `×` on it removes it again. The text
is saved per quarter.

### Presenting

`▶ Present` (or `P`) opens the deck full screen: no editor, just the quarter's
slides. `←` `→` move between views, `↑` `↓` between quarters, `Esc` exits.
Initiatives with a link stay clickable while presenting, so the documentation
opens while you talk.

### Side panel

- **Initiatives** — the persistent library. The checkbox says whether an
  initiative is on the view you have open; the detail edits the selected row —
  name, short description, area, **documentation link**, the category bar and the
  highlight box — and those edits stay on that roadmap.
- **Sprints** — generates the headers from a start date, a length and a number
  of sprints; numbering and quarters advance on their own. Phases already
  painted stay where they are.
- **Milestones** — the same lines, editable with fields instead of dragging.

### Exporting

`Download PNG` produces a 3200×1800 (2×) file ready to paste into Google Slides
or Keynote; `Copy PNG` puts the same image on the clipboard. Editor affordances
(dashed outlines, reorder arrows, milestone handles) never end up in the export.

From the `•••` menu: `Export deck as PDF` puts both views of the quarter into one
landscape PDF for the people who were not in the room; then duplicate into the
next quarter (keeps rows and sprints, clears phases), rename, delete, and export
or import everything as JSON.

Import **merges** rather than replaces: a quarter whose id is already there is
overwritten, new ones are added, and anything the file does not mention is left
alone. So a file can restore one quarter without touching the rest.

## Brand

The slide's colours are fixed and do not follow the light/dark theme, because
they are the artwork that lands in the deck:

| Role | Hex |
| --- | --- |
| Discovery, category bar, milestones | `#17c3a2` |
| Specs, Experience Conception | `#f4a32a` |
| Delivery | `#5b4ee8` |
| Sticky note, "legal obligation" bar | `#dcf223` |
| Text | `#101012` |
| Row pill | `#f0f0f1` |
| Link | `#1155cc` |

The editor chrome around the slide uses `#2151ff` as its accent and does follow
the viewer's theme.

The typeface is **Figtree** (Google Fonts). To swap in the company font, change
the `<link>` and the `font-family` at the top of the source file.

## Repository layout

```
src/roadmap-studio.html   source (page body, no skeleton)
build.sh                  generates index.html from source (bash + awk, no dependencies)
index.html                the page that is served, and opens from disk — build output
vercel.json               static hosting: cache and security headers
test/review.mjs           functional review suite, driven in Chromium
```

After every change to the source:

```sh
./build.sh
```

`index.html` is generated: do not edit it by hand, changes go in
`src/roadmap-studio.html`.

## Review

```sh
npm --prefix test install
npm --prefix test test
```

Opens `index.html` in Chromium and exercises every behaviour the tool promises —
brushes, the eraser in all four ways, half sprints, undo/redo, draggable
milestones and dropped go-live lines, the legend, the sticky note, area and
description fields, the hover card, row reordering, presentation mode, PNG and
PDF export, the sprint generator, persistence and narrow-window rules. It exits
non-zero on the first failure or page JavaScript error.

Where the CDNs are unreachable, pass `H2C_PATH` and `JSPDF_PATH` pointing at
local copies of html2canvas and jsPDF; `CHROMIUM` points at another binary and
`PAGE_URL` at another build.

## Hosting and persistence

Vercel project `roadmap-snapshot-studio`, linked to this repository: every push
to the production branch (`claude/keen-ritchie-1wkx3v`) deploys automatically.
The deploy is static — `index.html` is served as it is, with no build and no
runtime — so run `./build.sh` and commit `index.html` along with the source
change, or the previous page ships. `.vercelignore` keeps source, tests and
documentation out.

The production URL is public: anyone with the link opens the tool, but not your
data, which stays in the browser of whoever entered it.

- On Vercel (or opened from disk) data lives in the browser's `localStorage`: it
  survives across sessions on that device and does not follow you elsewhere.
  `Export everything (JSON)` is how you move it or keep a backup.
- Published as an Artifact, data lives in the artifact database and follows the
  user across devices. Read-only viewers can browse and export but not edit.

The tool opens on an example quarter, so the first session starts from a working
board rather than an empty grid — with a design view deliberately unlike the
product one, to show the two are not tied together. To load your own roadmap use
`•••` → `Import JSON`, then delete the example from `•••` when you no longer
need it.

## Known limits

- A sprint holds at most two phases side by side.
- The phase set is fixed per view: Discovery, Specs and Delivery for Product;
  Discovery and Experience Conception for Design.
- The presentation deck is the quarter you have open; `↑` `↓` reach the others.
- PNG and PDF export use `html2canvas` and `jsPDF` from a CDN: with no network,
  those two buttons do not work.
