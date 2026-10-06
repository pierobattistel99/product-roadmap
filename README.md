# Quartermap

**Production: https://roadmap-snapshot-studio.vercel.app**

Quartermap builds the two roadmap slides that come round every quarter,
instead of drawing them by hand:

- **Product roadmap**: `Quarter roadmap snapshot (Qx)`, for the CPO, the heads
  of business unit and the stakeholders. Phases: Discovery, Specs, Delivery.
- **Design roadmap**: `Quarter design roadmap snapshot (Qx)`, for the design
  team. Phases: Discovery, Experience Conception.

The design team reads those two words its own way: experience and
experimentation are the discovery phase, and conception is their delivery. So
the design roadmap has Discovery in the same colour as the product roadmap and
Experience Conception in the Specs colour, and no Delivery, which belongs to
the product roadmap only.

## Accounts and saving

Every change is saved as you make it. Where it goes depends on whether you are
logged in:

- **With an account**, roadmaps, the library and your look settings are saved
  to the account and open on any device. The status in the top bar reads
  `saved`. Two devices logged in as the same person see each other's changes
  live.
- **Without an account**, everything stays in this browser only. The status
  reads `on this device`, and `Back up everything (JSON)` is how you move it.

`Log in` in the top bar opens the account dialog: log in, create an account
with email and password, or continue without one. Logging out signs out that
device only and removes every copy of the account's data from it, the look
settings and the light or dark choice included. Work done on a device before logging in is carried into
the account on the first login. On later logins the account wins, except for
a quarter you really edited on the device more recently than in the account,
which is kept and pushed; an untouched example board is dropped, and an
example you painted on before logging in joins the account as a quarter of
its own. If the
account cannot be loaded (no network), the status reads `offline`, edits stay
on the device and the load is retried.

The backend is a Supabase project (Postgres with row level security: each
user reads and writes only their own rows) reached straight from the page with
the publishable key. There is no server of our own. The tables are `profiles`
(the slide look, the editor's light or dark in its own `ui_theme` column, the
onboarding flag), `boards` (one row per quarter, the board as JSON) and
`libraries` (one per user); the schema is in the project's migration history.
`ui_theme` is a column of its own so that a save from a device that never
picked a theme cannot clear the one another device chose.

Two settings live in the Supabase dashboard, not in this repository:

- **Authentication, URL configuration**: the Site URL must be the production
  URL, or the links in confirmation and password-reset emails point to
  localhost.
- **Authentication, Providers, Email**: "Confirm email" is on by default.
  Supabase's built-in email service is meant for trying things out and stops
  after a handful of messages an hour. For a trial with colleagues, turn
  "Confirm email" off (accounts work at once, no email needed); for real use,
  set a custom SMTP provider.

## Sharing a quarter by link

`•••` and *Share this quarter by link* makes a link to the quarter you have
open. Anyone who has it can read that quarter without an account of their own:
no login, nothing to install, nothing to download. The page refreshes itself
every few seconds, so a reader who leaves it open follows your edits.

What a reader gets is the slide and nothing else. No side panel, no brushes,
no menu: the quarter cannot be changed from the link, and the reader's own
roadmaps on that device are neither read nor written. They can switch between
the Product and the Design roadmap, present it full screen and download the
PNG, which is the point: nobody has to be sent an image any more.

The link carries the look the quarter was shared with, so it reads the way you
made it whatever the reader's own settings are.

*Stop sharing* in the same dialog withdraws it, and the link stops opening
anything from that moment. Deleting the quarter withdraws it too.

How it works: the shared copy is a row of its own, refreshed by the same save
that writes the quarter. The token in the link is the only way to reach it,
the table cannot be listed, and the copy carries nothing about who owns it.

## Comments

Comments work the way they do on a shared deck: each one is pinned to a part
of the slide, and they sit in a panel on the right of it.

- **Somebody with the link** opens it and finds the Comments panel already
  out (on a wide enough window; elsewhere `Comments` opens it). While it is
  out, a click on any part of the slide (a row, a cell, a sprint header, a
  go-live line, the title, the note, the legend) starts a comment about it;
  with it closed, the slide is just for reading, and text can be selected.
  The first time, they type their name, which their browser remembers. They
  can reply to any thread. They cannot resolve or delete anything. On a
  phone the panel tucks away while they choose a part, and comes back with
  what they had typed.
- **You, the owner**, see the same comments in the editor: `Comments` in the
  top bar, or the `C` key. `+ Comment`, then a click on the slide, adds one of
  your own; picking a target never edits or paints what is under the pointer.
  You can reply, resolve (and reopen with *Show resolved*) and delete. A
  comment left on the link reaches you within a second or two, with a note at
  the bottom of the screen.

A yellow mark with a number sits on each part of the slide that has open
comments. Clicking it brings its thread forward, and selecting a thread lights
up what it is about. The marks are for the screen only: they are never in the
PNG, the PDF or the presentation. The *About* list in the form is the way to
choose a target with the keyboard, and to comment on the whole slide.

A comment holds on to rows, sprints and go-live lines by id, not by position,
so moving a row moves its comments with it. When the part it is about is
deleted, the comment stays in the panel marked *Removed from the slide*, and
undoing the delete brings its mark back. Each roadmap of a quarter has its own
comments; the panel says when the other one has some.

People with the link may comment by default. The share dialog has *Let people
with the link comment* to turn it off and on again; while it is off, readers
see no comments and cannot add any, and the ones already left stay in your
panel. Comments live in the `comments` table and are deleted with their
quarter. Readers reach them only through two functions that take the link's
token, `get_share_comments` and `add_share_comment`; the table itself is
readable by its owner only.

While the panel is out, the side panel steps aside on windows narrower than
1820 pixels, so the slide keeps a usable size, and comes back when the panel
closes.

Comments arrive in pages of 1,000, the most the service gives in one answer,
so a long list is never cut short. A reader's page asks for them with every
refresh of the slide while the panel is out, and every third refresh while it
is closed. The owner gets them live, with a full check every 30 seconds while
the panel is out and every two minutes while it is closed.

## The look of the slide

The first visit opens a short flow: choose the font, choose the colours (a
preset or each colour by hand), then decide about an account. The slide behind
the card updates as you go. `•••` and *Appearance: font and colours* reopens it
at any time. The choice is saved on the device and, with an account, in the
profile, so it follows you.

Fonts: Figtree, Inter, DM Sans, Manrope, Poppins, Work Sans, Nunito, Source
Sans 3 (Google Fonts). Colours: the four phases, the two bars, the note, the
text, the row background and the link. Presets: papernest (the default),
Ocean, Forest, Mono. The editor around the slide keeps its own font and
colours.

### The editor: light or dark

The sun and moon button in the top bar switches the editor between light and
dark. It changes the chrome only: the slide stays white artwork in the brand
colours, so a PNG exported at night looks the same as one exported at noon.
Before anything is chosen the editor follows the machine. The choice is saved
on the device, and with an account in the profile, so it follows you; logging
out hands it back to the machine along with the rest of the account's look.

Every label in the chrome is checked against the surface behind it on each
test run, light and dark, at the WCAG AA ratios (4.5:1, or 3:1 for large
text). The slide is left out of that check: its colours are yours to pick.

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
| `Backspace` | picks the eraser; press again to get your brush back |
| `½ Half sprint` or `H` | paints only the half of the sprint you click |
| `1` to `4`, `0` | choose a phase, or the eraser |
| click any text on the slide | edits it in place: title, note, sprint header, row name, go-live caption |
| click anywhere on a row's pill | selects the row and puts the caret in its name |
| `Enter` in a row name | finishes the name; on the last row it starts a new row |
| `Shift` + `Enter` | inserts a row below |
| `Tab` | moves to the next row name |
| `Esc` | leaves the field; an empty row goes away |
| `Backspace` in an empty name | removes that row |
| `Delete` with a row selected | deletes the row, with Undo in the toast |
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
roadmap. There are two categories, plus "no bar". Out of the box they read
"Legal obligation" in yellow and "Other initiatives" in green.

Both the colour and the wording are yours to set, in the Sprints panel under
*Category bars*. They belong to the quarter, not to the editor, so one quarter
can sort its rows by legal risk and the next by team, and a roadmap you send
to someone else carries its own legend with it. A name left empty goes back to
the default one. A new quarter starts from the colours of the look you chose,
and can be changed from there.

The legend is printed at the bottom of the slide and lists only the bars in
use. Turn it on or off from the `•••` menu or in the Sprints panel.

That is separate from **Area** (Finance, Operations, Business, Legal, Growth,
Tech), which says who owns the initiative. Area shows beside each name in the
library, is searchable, and appears in the hover card.

### Go-live lines

A go-live line is the vertical line with a caption, in the Discovery colour.

- Drag **⇥ Go-live** from the toolbar onto the grid to drop one where you want
  it. Click the button without dragging to add one on the selected row.
- Click the caption once to select its text, then type the new name.
- Drag the body of the line to move it along the timeline.
- Drag the two dots at the ends to stretch it across rows.
- `×` deletes it, with Undo in the toast.
- Lines move with their rows when rows are inserted or deleted.

A go-live lands on a real date, which is rarely a sprint boundary, so the line
snaps to quarters of a sprint: start, 1/4, middle, 3/4, end. The Go-live lines
panel sets the same thing with two dropdowns.

### The note

The "To validate" note is off by default. `+ Note` in the toolbar puts it back
with its text selected, so you can type over it; the `×` on it removes it
again. The text is saved per quarter.

### Presenting

`▶ Present` (or `P`) opens the deck full screen: no editor, just the quarter's
slides. `←` `→` move between roadmaps, `↑` `↓` between quarters, `Esc` exits.
Rows with a link stay clickable while presenting.

### Exporting

`Download PNG` produces a 3200×1800 (2×) file ready to paste into Google Slides
or Keynote; `Copy PNG` puts the same image on the clipboard. Editor marks
(dashed outlines, row tools, line handles) never end up in the export. Names
too long for two lines are shortened with an ellipsis before the capture, so
the image matches what the editor shows. The export waits for the chosen font
to load.

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

## Default colours

The default look is the papernest palette. The slide's colours never follow
the light or dark theme of the editor, because they are the artwork that lands
in the deck:

| Role | Hex |
| --- | --- |
| Discovery, go-live lines, new "other" bars | `#17c3a2` |
| Specs, Experience Conception | `#f4a32a` |
| Delivery | `#5b4ee8` |
| Note, new "legal obligation" bars | `#dcf223` |
| Text | `#101012` |
| Row pill | `#f0f0f1` |
| Link | `#1155cc` |

The editor chrome around the slide uses `#2151ff` as its accent and follows
the viewer's theme. Selection and focus marks drawn on the slide use the same
blue in both themes, because the slide stays white.

## Repository layout

```
src/roadmap-studio.html   source (page body, no skeleton)
build.sh                  generates index.html from source (bash + awk, no dependencies)
index.html                the page that is served, and opens from disk: build output
favicon.svg               the site icon, plus favicon-32.png and apple-touch-icon.png
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
and Backspace keys, the library with undo, the row-height fit, the dense
header, the onboarding flow and the look settings, presentation mode, PNG and
PDF export, the sprint generator, persistence and the narrow-window rules. The
account flow (sign up, live save, log out clears the device, log in brings the
data back), share links and comments (pinning, replies, resolve, delete, the
live note, a reader with no account) run against an in-memory stand-in for
the Supabase client in `test/fake-supabase.mjs`, so the suite needs no
network. It exits non-zero on the first failure or page
JavaScript error.

The suite serves `index.html` on a local port for the run rather than opening
it as a file: Chromium now and then loses a file page's local storage across a
reload, which made the persistence check fail at random.

Where the CDNs are unreachable, pass `H2C_PATH` and `JSPDF_PATH` pointing at
local copies of html2canvas and jsPDF; `CHROMIUM` points at another binary and
`PAGE_URL` at another build.

## Hosting

Vercel project `roadmap-snapshot-studio`, linked to this repository: every push
to the production branch (`claude/keen-ritchie-1wkx3v`) deploys automatically.
The deploy is static. `index.html` is served as it is, with no build and no
runtime, so run `./build.sh` and commit `index.html` along with the source
change, or the previous page ships. `.vercelignore` keeps source, tests and
documentation out.

The production URL is public: anyone with the link opens the tool. Data is
only ever visible to the account that owns it, or to the browser it was typed
in when there is no account.

Published as an Artifact, the page uses the artifact database instead of
Supabase and follows the user across devices there. Read-only viewers can
browse and export but not edit.

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
- PNG and PDF export use `html2canvas` and `jsPDF` from a CDN, and accounts
  need the Supabase client from a CDN: with no network, export and login do
  not work, and the tool runs on this device only.
- A share link gives a read-only copy: people with it can comment, but there
  is no way to let someone else edit a roadmap.
- Nobody is emailed about a comment. The owner sees new ones in the editor,
  live while it is open, and on the button's count otherwise.
- A comment cannot be edited once posted. A reader cannot delete theirs; the
  owner can delete any comment.
- A reader's name is whatever they type: the link does not say who they are.
- At most 2,000 comments per quarter and 2,000 characters per comment.
- One link per quarter. To send two quarters, send two links.
- A reader asks for the quarter again every seven seconds, so an edit shows up
  within about that. A tab in the background waits until it is looked at.
- A shared quarter deleted while the editor is offline keeps its link working
  until that device is back online and the deletion reaches the account.
