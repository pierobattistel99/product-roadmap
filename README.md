# Roadmap Snapshot Studio

**Production: https://roadmap-snapshot-studio.vercel.app**

A tool for building the two roadmap slides that come round every quarter,
instead of drawing them by hand:

- **Product roadmap**: `Quarter roadmap snapshot (Qx)`, for the CPO, the heads
  of business unit and the stakeholders. Phases: Discovery, Specs, Delivery.
- **Design roadmap**: `Quarter design roadmap snapshot (Qx)`, for the design
  team. Phases: Discovery, Experience Conception.

The design team reads those two words its own way: experience and
experimentation are the discovery phase, and conception is their delivery. So
the design roadmap has Discovery in the same green as the product roadmap and
Experience Conception in amber, and no Delivery, which belongs to the product
roadmap only.

### The two roadmaps are independent

They share the sprint header and one library of initiatives, and nothing else.
Each roadmap keeps its own rows, order, names, colour bars and go-live lines.
The design roadmap can carry requests the product roadmap has never heard of,
such as a design system audit, and can leave out product work the design team
is not involved in.

**A row owns its own data.** Name, link, description and area live on the row,
not in a shared record. Renaming a row on the design roadmap never touches the
product one: the two can word the same piece of work differently.

The library is a catalogue to pick from. Ticking an initiative copies its
fields onto the roadmap you have open; from that moment the row is
independent. **P** and **D** show where an initiative is already used, and the
dropdown narrows the list to what is on the open roadmap or missing from it.
A row typed on the slide joins the library as soon as you leave the name, so
the other roadmap can pick it with one tick. Renaming a row renames its library
entry too, so the list shows what you typed; the other roadmap's row keeps its
own wording. The `×` on a library entry removes it from the library and leaves
every roadmap alone; `•••` and *Remove unused initiatives* clears out everything
no roadmap uses. Both can be undone.

Boards saved before this are migrated on load: each row keeps the name it was
showing.

## Using it

The slide is the editor: what you see is what you export.

| Action | Effect |
| --- | --- |
| click a cell | paints the phase selected in the toolbar |
| drag | paints several sprints in a row |
| `Shift` + click | paints the whole sequence (Discovery, Specs, Delivery) from that sprint |
| `Alt` + click | adds a second phase beside the first in the same sprint |
| right-click | erases the cell (drag to erase several) |
| `½ Half sprint` or `H` | paints only the half of the sprint you click |
| `1` to `4`, `0` | choose a phase, or the eraser |
| click any text on the slide | edits it in place: title, note, sprint header, row name, go-live caption |
| click anywhere on a row's pill | selects the row and puts the caret in its name |
| `Enter` in a row name | finishes the name; on the last row it starts a new row |
| `Shift` + `Enter` | inserts a row below |
| `Tab` | moves to the next row name |
| `Esc` | leaves the field; an empty row goes away |
| `Backspace` in an empty name | removes that row |
| `Delete` or `Backspace` with a row selected | deletes the row, with Undo in the toast |
| `+ Initiative` under the last row | adds a blank row ready to type |
| `▲ ▼ ×` on the selected row | move it or delete it |
| `↗` on a linked row | opens the link |
| hover a row | shows the initiative's area and description |
| `−` `+` top right | zoom; `Fit` goes back to the window width |
| `☰` top left | shows or hides the side panel |
| `Ctrl/Cmd+Z` | undo; with `Shift`, redo. Inside a text field it is the field's own undo |
| `?` | lists every shortcut |

Undo works per action: a burst of typing in one field is one step, a painted
stroke is one step, adding or deleting a row is one step. Undo also switches
back to the roadmap the change was made on.

Empty rows never stick: `Enter` or `Esc` on an empty row removes it, and an
unnamed row exports without the grey pill.

The slide never scales below 62%. Past that, sprint cells become small
targets, so in a narrow window the canvas scrolls sideways instead of
shrinking. The side panel starts folded in narrow windows, and the zoom and
panel state are remembered.

### The side panel

- **Initiatives**: the selected row's fields sit at the top (name,
  description, area, link, colour bar, box, up, down, clear phases, delete
  row). Below them, the box to add an initiative (`Enter` adds it) and the
  library.
- **Sprints**: creates the sprint headers from a start date, a length and a
  number of sprints; numbering and quarters advance on their own. Painted
  phases stay where they are. Also the note and legend toggles.
- **Go-live lines**: the same lines, editable with fields instead of dragging.

Selecting a row on the slide opens the Initiatives panel at the top.

### Colour bars and the legend

The coloured bar down the left of each row says why the initiative is on the
roadmap:

- **yellow**: a legal obligation
- **green**: every other reason

The legend is printed at the bottom of the slide and lists only the colours in
use. Turn it on or off from the `•••` menu or in the Sprints panel.

That is separate from **Area** (Finance, Operations, Business, Legal, Growth,
Tech), which says who owns the initiative. Area shows beside each name in the
library, is searchable, and appears in the hover card.

### Go-live lines

A go-live line is the green vertical line with a caption.

- Drag **⇥ Go-live** from the toolbar onto the grid to drop one where you want
  it. Click the button without dragging to add one on the selected row.
- Click the caption once to select its text, then type the new name.
- Drag the body of the line to move it along the timeline.
- Drag the two dots at the ends to stretch it across rows.
- `×` deletes it, with Undo in the toast.

A go-live lands on a real date, which is rarely a sprint boundary, so the line
snaps to quarters of a sprint: start, 1/4, middle, 3/4, end. The Go-live lines
panel sets the same thing with two dropdowns.

### The note

The yellow "To validate" note is off by default. `+ Note` in the toolbar puts
it back with its text selected, so you can type over it; the `×` on it removes
it again. The text is saved per quarter.

### Presenting

`▶ Present` (or `P`) opens the deck full screen: no editor, just the quarter's
slides. `←` `→` move between roadmaps, `↑` `↓` between quarters, `Esc` exits.
Rows with a link stay clickable while presenting.

### Exporting

`Download PNG` produces a 3200×1800 (2×) file ready to paste into Google Slides
or Keynote; `Copy PNG` puts the same image on the clipboard. Editor marks
(dashed outlines, row tools, line handles) never end up in the export. Names
too long for two lines are shortened with an ellipsis before the capture, so
the image matches what the editor shows.

From the `•••` menu: `Save both roadmaps as PDF` puts the quarter's roadmaps
into one landscape PDF (an empty roadmap is left out, and the toast says so);
then duplicate the quarter (keeps rows and sprints, clears phases), rename,
delete, and back up or import everything as JSON.

Import merges rather than replaces: a quarter whose id is already there is
overwritten, new ones are added, and anything the file does not mention is
left alone. So a file can restore one quarter without touching the rest.

### Layout rules

Rows always fit: the row height shrinks to the room left under the header and
above the legend. Past the minimum height a notice above the slide says how
many rows do not fit. With nine sprints or more the header stacks and shrinks;
past nine the chips use their short labels (D, S, Dl, EC). A half-sprint chip
always uses the short label.

## Brand

The slide's colours are fixed and do not follow the light or dark theme,
because they are the artwork that lands in the deck:

| Role | Hex |
| --- | --- |
| Discovery, green bar, go-live lines | `#17c3a2` |
| Specs, Experience Conception | `#f4a32a` |
| Delivery | `#5b4ee8` |
| Note, "legal obligation" bar | `#dcf223` |
| Text | `#101012` |
| Row pill | `#f0f0f1` |
| Link | `#1155cc` |

The editor chrome around the slide uses `#2151ff` as its accent and follows
the viewer's theme. Selection and focus marks drawn on the slide use the same
blue in both themes, because the slide stays white.

The typeface is **Figtree** (Google Fonts). To swap in the company font, change
the `<link>` and the `font-family` at the top of the source file.

## Repository layout

```
src/roadmap-studio.html   source (page body, no skeleton)
build.sh                  generates index.html from source (bash + awk, no dependencies)
index.html                the page that is served, and opens from disk: build output
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

Opens `index.html` in Chromium and exercises every behaviour the tool promises:
brushes, the eraser in all four ways, half sprints, undo per action, draggable
go-live lines and dropped lines, the legend, the note, area and description
fields, the hover card, typing on the slide, empty-row clean-up, the Delete
key, the library with undo, the row-height fit, the dense header, presentation
mode, PNG and PDF export, the sprint generator, persistence and the
narrow-window rules. It exits non-zero on the first failure or page JavaScript
error.

Where the CDNs are unreachable, pass `H2C_PATH` and `JSPDF_PATH` pointing at
local copies of html2canvas and jsPDF; `CHROMIUM` points at another binary and
`PAGE_URL` at another build.

## Hosting and persistence

Vercel project `roadmap-snapshot-studio`, linked to this repository: every push
to the production branch (`claude/keen-ritchie-1wkx3v`) deploys automatically.
The deploy is static. `index.html` is served as it is, with no build and no
runtime, so run `./build.sh` and commit `index.html` along with the source
change, or the previous page ships. `.vercelignore` keeps source, tests and
documentation out.

The production URL is public: anyone with the link opens the tool, but not your
data, which stays in the browser of whoever entered it.

- On Vercel (or opened from disk) data lives in the browser's `localStorage`: it
  survives across sessions on that device and does not follow you elsewhere.
  `Back up everything (JSON)` is how you move it or keep a copy.
- Published as an Artifact, data lives in the artifact database and follows the
  user across devices. Read-only viewers can browse and export but not edit.

The tool opens on an example quarter, so the first session starts from a
working board rather than an empty grid, with a design roadmap deliberately
unlike the product one, to show the two are not tied together. To load your own
roadmap use `•••` and `Import a backup (JSON)`, then delete the example from
`•••` when you no longer need it.

## Known limits

- A sprint holds at most two phases side by side.
- The phase set is fixed per roadmap: Discovery, Specs and Delivery for
  Product; Discovery and Experience Conception for Design.
- Between 2 and 12 sprints per quarter.
- The presentation deck is the quarter you have open; `↑` `↓` reach the others.
- PNG and PDF export use `html2canvas` and `jsPDF` from a CDN: with no network,
  those two buttons do not work.
