/**
 * Everything the Claude connector can do to a quarter, as plain functions on
 * the quarter's JSON: the same JSON the editor saves. They lean on the
 * editor's own rules (lib/model.cjs, built from the page), so whatever Claude
 * builds is something the editor can draw. Each function either changes the
 * quarter and reports what it did, or throws an OpError whose message says,
 * in words Claude can act on, what to fix.
 *
 * How a quarter is laid out (see also the page):
 *   sprints: [{ id, name, quarter, dates }]          the columns, left to right
 *   views.product / views.design: {
 *     title,
 *     rows: [{ id, libId, name, url, desc, area, accent, box, cells }],
 *     milestones: [{ id, label, col, row, endRow }]    the go-live lines
 *   }
 *   cells: { "<column index>": ["phase"] }            a whole sprint
 *          { "<column index>": ["phase", "phase"] }   two halves, either may be null
 *   accent: "lime" (yellow bar), "teal" (green bar) or "none"; the words for
 *   each bar live in accents[k].label. A go-live line sits on the boundary
 *   before column `col` (so col = n means after sprint n) and spans rows
 *   row..endRow.
 */
import QM from './model.cjs';

export { QM };

export class OpError extends Error {
  constructor(message) { super(message); this.name = 'OpError'; }
}
export const fail = (message) => { throw new OpError(message); };

/* How names are compared everywhere: case and spacing do not count. */
export const lower = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
export const sameName = (a, z) => lower(a) === lower(z);
const clip = (v, max) => (v === undefined || v === null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, max);
const longText = (v, max) => (v === undefined || v === null ? '' : String(v)).trim().slice(0, max);
const list = (xs) => xs.map((x) => '"' + x + '"').join(', ');

export const LIMITS = { name: 120, row: 200, area: 80, url: 2000, desc: 2000, label: 80, title: 160, note: 80, rows: 80 };

/* ---------- names Claude may use for things ---------- */

const VIEW_NAMES = { product: 'product', 'product roadmap': 'product', design: 'design', 'design roadmap': 'design' };
export function viewKey(v) {
  const k = VIEW_NAMES[lower(v === undefined ? 'product' : v)];
  if (!k) fail(`There is no "${v}" roadmap. A quarter has two: "product" and "design".`);
  return k;
}

const PHASE_NAMES = {
  discovery: 'discovery', d: 'discovery',
  specs: 'specs', spec: 'specs', specification: 'specs', specifications: 'specs', s: 'specs',
  delivery: 'delivery', dl: 'delivery', deliver: 'delivery',
  conception: 'conception', 'experience conception': 'conception', experience: 'conception', ec: 'conception'
};
const phaseList = (view) => list(QM.VIEWS[view].brushes.map((p) => QM.PHASES[p].label));
export function phaseKey(view, p) {
  const key = PHASE_NAMES[lower(p).replace(/[_-]+/g, ' ')];
  if (!key) fail(`"${p}" is not a phase. The ${view} roadmap has ${phaseList(view)}.`);
  if (QM.VIEWS[view].brushes.indexOf(key) < 0) {
    fail(`The ${view} roadmap has no ${QM.PHASES[key].label} phase. It has ${phaseList(view)}.`);
  }
  return key;
}

/* A sprint is its position on the slide (1 is the first column), its id, or
   its label: "Sprint 3", "Sprint 3 Q1" or "Q1 Sprint 3". */
export function sprintIndex(b, ref) {
  const n = b.sprints.length;
  if (typeof ref === 'number' || /^\s*\d+\s*$/.test(String(ref ?? ''))) {
    const i = Math.round(Number(ref)) - 1;
    if (!(i >= 0 && i < n)) fail(`There is no sprint ${ref}: this quarter has sprints 1 to ${n}.`);
    return i;
  }
  const byId = b.sprints.findIndex((s) => s.id === ref);
  if (byId >= 0) return byId;
  const want = lower(ref).replace(/\s+/g, ' ');
  const hits = [];
  b.sprints.forEach((s, i) => {
    const name = lower(s.name), q = lower(s.quarter);
    if (want === name || want === (name + ' ' + q).trim() || want === (q + ' ' + name).trim()) hits.push(i);
  });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) fail(`"${ref}" could be sprint ${hits.map((h) => h + 1).join(' or ')}. Use the sprint's position (1 to ${n}) instead.`);
  fail(`There is no sprint "${ref}". Use a position from 1 to ${n}, or a label such as "${QM.sprintLabel(b.sprints[0])}".`);
}
/* "3", "Sprint 3 Q1", or a range of positions: "2-4". */
export function sprintColumns(b, key) {
  const m = /^\s*(\d+)\s*(?:-|\u2013|\.\.|to)\s*(\d+)\s*$/i.exec(String(key));
  if (!m) return [sprintIndex(b, key)];
  let a = sprintIndex(b, m[1]), z = sprintIndex(b, m[2]);
  if (z < a) [a, z] = [z, a];
  const out = [];
  for (let i = a; i <= z; i++) out.push(i);
  return out;
}

/* A row is its position (1 is the top row), its id, or its name. */
export function rowIndex(b, view, ref) {
  const rows = b.views[view].rows;
  if (ref === undefined || ref === null || ref === '') fail(`Say which row of the ${view} roadmap: its name, its id or its position.`);
  /* A number is a position, even on a roadmap that has a row called "1". */
  if (typeof ref === 'number') {
    const i = Math.round(ref) - 1;
    if (i >= 0 && i < rows.length) return i;
    fail(`There is no row ${ref}: the ${view} roadmap has ${rows.length} row${rows.length === 1 ? '' : 's'}.`);
  }
  const byId = rows.findIndex((r) => r.id === ref);
  if (byId >= 0) return byId;
  const want = lower(ref);
  const hits = [];
  rows.forEach((r, i) => { if (lower(r.name) === want) hits.push(i); });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) fail(`${hits.length} rows of the ${view} roadmap are called "${ref}". Use the row id instead: ${list(hits.map((i) => rows[i].id))}.`);
  if (/^\s*\d+\s*$/.test(String(ref))) {
    const i = Math.round(Number(ref)) - 1;
    if (i >= 0 && i < rows.length) return i;
    fail(`There is no row ${ref}: the ${view} roadmap has ${rows.length} row${rows.length === 1 ? '' : 's'}.`);
  }
  const names = rows.slice(0, 40).map((r) => r.name);
  fail(`The ${view} roadmap has no row "${ref}".` + (names.length ? ` Its rows are ${list(names)}${rows.length > 40 ? ' and more' : ''}.` : ' It has no rows yet.'));
}

/* A go-live line is its id, its label, or its position in the list (1 is the first). */
export function lineIndex(b, view, ref) {
  const lines = b.views[view].milestones;
  if (typeof ref === 'number') {
    const i = Math.round(ref) - 1;
    if (i >= 0 && i < lines.length) return i;
    fail(`There is no go-live line ${ref}: the ${view} roadmap has ${lines.length}.`);
  }
  const byId = lines.findIndex((m) => m.id === ref);
  if (byId >= 0) return byId;
  const hits = [];
  /* A line saved with no label is shown, and so named, "Go-live". */
  lines.forEach((m, i) => { if (lower(m.label || 'Go-live') === lower(ref)) hits.push(i); });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) fail(`${hits.length} go-live lines are labelled "${ref}". Use the id or the position instead: ${list(hits.map((i) => lines[i].id))}.`);
  if (/^\s*\d+\s*$/.test(String(ref ?? ''))) {
    const i = Math.round(Number(ref)) - 1;
    if (i >= 0 && i < lines.length) return i;
  }
  fail(`The ${view} roadmap has no go-live line "${ref}".` + (lines.length ? ` Its lines are ${list(lines.map((m) => m.label || 'Go-live'))}.` : ' It has none.'));
}

/* The colour bar of a row: the bar's own words on this quarter, its colour,
   or what it stands for by default. */
const BAR_NAMES = { lime: 'lime', yellow: 'lime', legal: 'lime', teal: 'teal', green: 'teal', other: 'teal', none: 'none', 'no bar': 'none' };
export function accentKey(b, c) {
  const want = lower(c);
  for (const k of QM.BAR_KEYS) if (lower(QM.accentLabel(b, k)) === want) return k;
  for (const k of QM.BAR_KEYS) if (lower(QM.ACCENT_META[k].label) === want) return k;
  if (BAR_NAMES[want]) return BAR_NAMES[want];
  fail(`"${c}" is not a category of this quarter. Use "${QM.accentLabel(b, 'lime')}" (yellow bar), "${QM.accentLabel(b, 'teal')}" (green bar) or "none".`);
}

/* A link the slide can open (the model's rule, the editor's too), or ''. */
export function safeUrl(u) { return QM.safeUrl(u).slice(0, LIMITS.url); }
export function cleanUrl(u) {
  const s = String(u ?? '').trim();
  if (s && !safeUrl(s)) fail(`"${s.slice(0, 80)}" is not a link the slide can open. Use an address that starts with https://.`);
  return safeUrl(s);
}

/* ---------- phases ---------- */

/* One sprint of a row: "discovery" for the whole sprint, ["specs", "delivery"]
   for its two halves (null leaves a half empty), null or "" to clear it. */
export function cellOf(view, val, where) {
  if (val === null || val === undefined || val === '' || val === false) return null;
  if (typeof val === 'string') return [phaseKey(view, val)];
  if (Array.isArray(val)) {
    if (val.length === 1) return cellOf(view, val[0], where);
    if (val.length !== 2) fail(`Sprint ${where}: give one phase for the whole sprint, or two for its halves, not ${val.length}.`);
    const a = val[0] === null || val[0] === '' ? null : phaseKey(view, val[0]);
    const z = val[1] === null || val[1] === '' ? null : phaseKey(view, val[1]);
    if (!a && !z) return null;
    if (a && z && a === z) return [a];
    return [a, z];
  }
  fail(`Sprint ${where}: a phase is a word such as "discovery", or a pair such as ["specs", "delivery"] for the two halves.`);
}
/* phases: { "1": "discovery", "2-3": "specs", "4": ["specs", "delivery"], "5": null }.
   replace: the row keeps only these; otherwise only these sprints change.
   Ranges go first and single sprints after, so "3" wins over a "2-4" that
   covers it whatever order the keys come in (JavaScript lists keys such as
   "3" before keys such as "2-4", whatever order they were written in). */
export function paintRow(b, view, row, phases, replace) {
  if (phases === null || typeof phases !== 'object' || Array.isArray(phases)) {
    fail('phases is an object from sprint to phase, for example {"1": "discovery", "2-3": "specs", "4": ["specs", "delivery"]}.');
  }
  const next = replace ? {} : Object.assign({}, row.cells || {});
  const steps = Object.entries(phases).map(([key, val]) => ({ key, val, cols: sprintColumns(b, key) }));
  steps.sort((x, y) => (y.cols.length > 1) - (x.cols.length > 1));
  steps.forEach(({ key, val, cols }) => {
    const cell = cellOf(view, val, key);
    cols.forEach((c) => { if (cell) next[String(c)] = cell.slice(); else delete next[String(c)]; });
  });
  row.cells = next;
}

/* ---------- reading a quarter back ---------- */

export function cellText(cell) {
  if (!Array.isArray(cell) || !cell.length) return null;
  return cell.length === 1 ? cell[0] : [cell[0] || null, cell[1] || null];
}
function rowOut(b, row, i) {
  const phases = {};
  Object.keys(row.cells || {}).map(Number).sort((x, y) => x - y).forEach((c) => {
    const t = cellText(row.cells[String(c)]);
    if (t) phases[String(c + 1)] = t;
  });
  const out = { n: i + 1, id: row.id, name: row.name, category: row.accent === 'none' ? 'none' : QM.accentLabel(b, row.accent) };
  if (row.box) out.box = true;
  if (row.area) out.area = row.area;
  if (row.url) out.url = row.url;
  if (row.desc) out.description = row.desc;
  if (row.libId) out.library_entry = row.libId;
  out.phases = phases;
  return out;
}
function lineOut(b, view, m) {
  const rows = b.views[view].rows;
  const a = rows[m.row], z = rows[m.endRow];
  return {
    id: m.id, label: m.label || 'Go-live', after_sprint: m.col,
    from_row: a ? a.name : null, to_row: z ? z.name : null, rows: [m.row + 1, m.endRow + 1]
  };
}
/* The whole quarter, in the words the tools use. */
export function describe(b, opts = {}) {
  const views = opts.view ? [viewKey(opts.view)] : QM.VIEW_KEYS;
  const out = {
    id: b.id, name: b.name,
    note: { show: !!(b.note && b.note.show), text: (b.note && b.note.text) || '' },
    legend: !!(b.legend && b.legend.show),
    categories: [
      { label: QM.accentLabel(b, 'lime'), bar: 'yellow', color: b.accents.lime.color },
      { label: QM.accentLabel(b, 'teal'), bar: 'green', color: b.accents.teal.color },
      { label: 'none', bar: 'none' }
    ],
    sprints: b.sprints.map((s, i) => ({ n: i + 1, id: s.id, name: s.name, quarter: s.quarter, dates: s.dates })),
    roadmaps: {}
  };
  views.forEach((k) => {
    const v = b.views[k];
    out.roadmaps[k] = {
      title: v.title,
      phases: QM.VIEWS[k].brushes.slice(),
      rows: v.rows.map((r, i) => rowOut(b, r, i)),
      go_live: v.milestones.map((m) => lineOut(b, k, m))
    };
  });
  return out;
}

const SHORT = { discovery: 'D', specs: 'S', delivery: 'Dl', conception: 'EC' };
const shortCell = (cell) => {
  const t = cellText(cell);
  if (!t) return '';
  return typeof t === 'string' ? SHORT[t] : (t[0] ? SHORT[t[0]] : '_') + '/' + (t[1] ? SHORT[t[1]] : '_');
};
const pipeSafe = (s) => String(s).replace(/\|/g, '/').replace(/\s+/g, ' ');
/* The slide as a table: what Claude can show the person before and after a change. */
export function grid(b, view) {
  const v = b.views[view], n = b.sprints.length;
  const head = ['#', 'Initiative', 'Bar'].concat(b.sprints.map((s, i) => String(i + 1)));
  const lines = [`**${QM.VIEWS[view].name} roadmap**: ${pipeSafe(v.title || '')}`, ''];
  if (!v.rows.length) lines.push('(no rows yet)');
  else {
    lines.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|');
    v.rows.forEach((r, i) => {
      const bar = r.accent === 'none' ? '' : (r.accent === 'lime' ? 'yellow' : 'green');
      const cells = [];
      for (let c = 0; c < n; c++) cells.push(shortCell(r.cells[String(c)]));
      lines.push('| ' + [String(i + 1), pipeSafe(r.name || '(empty row, being added in the editor)') + (r.box ? ' [boxed]' : ''), bar].concat(cells).join(' | ') + ' |');
    });
  }
  v.milestones.forEach((m) => {
    const o = lineOut(b, view, m);
    const span = o.rows[0] === o.rows[1] ? `row ${o.rows[0]}` : `rows ${o.rows[0]} to ${o.rows[1]}`;
    lines.push(`Go-live line "${pipeSafe(o.label)}" ${m.col === 0 ? 'before sprint 1' : 'after sprint ' + m.col}, ${span}`);
  });
  lines.push('', 'Sprints: ' + b.sprints.map((s, i) => `${i + 1} = ${QM.sprintLabel(s)}${s.dates ? ' (' + s.dates + ')' : ''}`).join('; '));
  lines.push('Key: ' + QM.VIEWS[view].brushes.map((p) => SHORT[p] + ' ' + QM.PHASES[p].label).join(', ') + '; a/b is the first and second half of a sprint, _ an empty half.');
  return lines.join('\n');
}
export function summary(b) {
  const first = b.sprints[0], last = b.sprints[b.sprints.length - 1];
  return {
    id: b.id, name: b.name,
    sprints: b.sprints.length,
    from: first ? QM.sprintLabel(first) + (first.dates ? ' (' + first.dates + ')' : '') : null,
    to: last ? QM.sprintLabel(last) + (last.dates ? ' (' + last.dates + ')' : '') : null,
    product_rows: b.views.product ? b.views.product.rows.length : 0,
    design_rows: b.views.design ? b.views.design.rows.length : 0
  };
}

/* ---------- checks ---------- */

/* A roadmap may not grow past LIMITS.rows; one that is already longer is
   left alone (it was made in the editor). */
export function checkGrowth(b, before) {
  QM.VIEW_KEYS.forEach((k) => {
    const n = b.views[k].rows.length, was = before ? before.views[k].rows.length : 0;
    if (n > LIMITS.rows && n > was) fail(`A roadmap holds at most ${LIMITS.rows} rows; the ${k} roadmap would have ${n}.`);
  });
}
/* Refuse to save a new quarter the editor could not draw. */
export function check(b) {
  const p = QM.problems(b);
  if (p.length) fail('That would leave the quarter in a state the editor cannot draw: ' + p.slice(0, 8).join('; ') + '.');
  checkGrowth(b, null);
}

/* ---------- a new quarter ---------- */

/* "Q1" from "Q1 2027", else the quarter most of its sprints sit in. */
export function quarterTag(name, sprints) {
  const m = /\bQ([1-4])\b/i.exec(String(name || ''));
  if (m) return 'Q' + m[1];
  const count = {};
  (sprints || []).forEach((s) => { if (/^Q[1-4]$/.test(s.quarter)) count[s.quarter] = (count[s.quarter] || 0) + 1; });
  return Object.keys(count).sort((a, z) => count[z] - count[a])[0] || '';
}
const defaultTitle = (view, tag) => (view === 'product' ? 'Quarter roadmap snapshot' : 'Quarter design roadmap snapshot') + (tag ? ' (' + tag + ')' : '');

/* spec: { start_date, weeks_per_sprint, count, first_number, sprints_per_quarter, first_quarter }
   or { list: [{ name, quarter, dates }] }. keep: the sprints there now, whose
   ids carry over by position so comments on a sprint stay on it. */
export function makeSprints(spec, keep, name) {
  if (!spec || typeof spec !== 'object') fail('Say how the sprints run: a start date (YYYY-MM-DD) and how many, or a list of sprints.');
  keep = keep || [];
  if (Array.isArray(spec.list)) {
    if (spec.list.length < QM.MIN_SPRINTS || spec.list.length > QM.MAX_SPRINTS) fail(`A quarter has ${QM.MIN_SPRINTS} to ${QM.MAX_SPRINTS} sprints, not ${spec.list.length}.`);
    return { sprints: spec.list.map((s, i) => {
      const q = clip(s.quarter, 4).toUpperCase();
      if (q && QM.QUARTERS.indexOf(q) < 0) fail(`Sprint ${i + 1}: the quarter is one of Q1, Q2, Q3 or Q4, not "${s.quarter}".`);
      const label = clip(s.name, 40);
      if (!label) fail(`Sprint ${i + 1} needs a name, for example "Sprint ${i + 1}".`);
      return { id: (keep[i] && keep[i].id) || QM.uid('s'), name: label, quarter: q, dates: clip(s.dates, 40) };
    }), note: null };
  }
  const start = String(spec.start_date || '').trim();
  const firstQ = String(spec.first_quarter || quarterTag(name, keep) || 'Q1').toUpperCase();
  if (QM.QUARTERS.indexOf(firstQ) < 0) fail(`first_quarter is one of Q1, Q2, Q3 or Q4, not "${spec.first_quarter}".`);
  const made = QM.generateSprints({
    start, weeks: spec.weeks_per_sprint ?? 2, count: spec.count ?? 7,
    from: spec.first_number ?? 1, perQ: spec.sprints_per_quarter ?? 7, quarter: firstQ
  }, keep);
  if (!made) fail(`start_date must be a real date written YYYY-MM-DD, for example 2027-01-04, not "${start}".`);
  return { sprints: made.sprints, note: made.count !== made.asked ? `${made.asked} sprints were asked for; a quarter has ${QM.MIN_SPRINTS} to ${QM.MAX_SPRINTS}, so it has ${made.count}.` : null };
}

const countCells = (b) => QM.VIEW_KEYS.reduce((n, k) => n + b.views[k].rows.reduce((m, r) => m + Object.keys(r.cells || {}).length, 0), 0);
const countLines = (b) => QM.VIEW_KEYS.reduce((n, k) => n + b.views[k].milestones.length, 0);

export function setSprints(b, spec) {
  const cells = countCells(b), lines = countLines(b);
  const made = makeSprints(spec, b.sprints, b.name);
  b.sprints = made.sprints;
  QM.fitToSprints(b);
  const out = { sprints: b.sprints.length };
  if (countCells(b) < cells) out.phases_dropped = `${cells - countCells(b)} sprint${cells - countCells(b) === 1 ? '' : 's'} of phases past the last sprint were removed`;
  if (countLines(b) < lines) out.lines_dropped = `${lines - countLines(b)} go-live line${lines - countLines(b) === 1 ? '' : 's'} past the last sprint were removed`;
  if (made.note) out.note = made.note;
  return out;
}

/* opts: { name, sprints (a spec), copyFrom (a quarter), keepRows, keepPhases, barColor(k) } */
export function newQuarter(opts) {
  const name = clip(opts.name, LIMITS.name);
  if (!name) fail('Give the quarter a name, for example "Q1 2027".');
  const now = Date.now();
  let b;
  if (opts.copyFrom) {
    b = QM.clone(opts.copyFrom);
    b.id = QM.uid('b'); b.name = name; b.createdAt = now; b.updatedAt = now;
    delete b.touched;
    b.sprints.forEach((s) => { s.id = QM.uid('s'); });
    const tag = quarterTag(name, b.sprints);
    QM.VIEW_KEYS.forEach((k) => {
      const v = b.views[k];
      if (!v.title) v.title = defaultTitle(k, tag);
      else if (tag) v.title = v.title.replace(/\(Q[1-4][^)]*\)/, '(' + tag + ')');
      if (opts.keepRows === false) { v.rows = []; v.milestones = []; }
      else if (!opts.keepPhases) { v.milestones = []; v.rows.forEach((r) => { r.cells = {}; }); }
    });
  } else {
    if (!opts.sprints) fail('Say how the sprints of the new quarter run (start date and count), or copy them from an existing quarter.');
    const made = makeSprints(opts.sprints, [], name);
    const tag = quarterTag(name, made.sprints);
    b = {
      id: QM.uid('b'), name, createdAt: now, updatedAt: now,
      note: { show: false, text: 'To validate' },
      legend: { show: true },
      sprints: made.sprints,
      views: {
        product: { title: defaultTitle('product', tag), milestones: [], rows: [] },
        design: { title: defaultTitle('design', tag), milestones: [], rows: [] }
      }
    };
  }
  QM.fixAccents(b, opts.barColor);
  if (opts.copyFrom && opts.sprints) setSprints(b, opts.sprints);
  return b;
}

/* ---------- the quarter itself ---------- */

/* c: { name, note: { show, text }, legend, titles: { product, design }, categories: { <bar>: { label, color } } } */
export function updateQuarter(b, c) {
  const done = [];
  if (c.name !== undefined) {
    const n = clip(c.name, LIMITS.name);
    if (!n) fail('A quarter needs a name.');
    if (n !== b.name) { b.name = n; done.push('renamed it "' + n + '"'); }
  }
  if (c.note) {
    b.note = b.note || { show: false, text: 'To validate' };
    if (c.note.text !== undefined) { const t = clip(c.note.text, LIMITS.note); b.note.text = t || 'To validate'; done.push('set the note to "' + b.note.text + '"'); }
    if (c.note.show !== undefined) { b.note.show = !!c.note.show; done.push(b.note.show ? 'showed the note' : 'hid the note'); }
  }
  if (c.legend !== undefined) { b.legend = b.legend || {}; b.legend.show = !!c.legend; done.push(c.legend ? 'showed the legend' : 'hid the legend'); }
  if (c.titles) {
    Object.keys(c.titles).forEach((k) => {
      const view = viewKey(k), t = clip(c.titles[k], LIMITS.title);
      if (!t) fail(`The ${view} roadmap needs a title.`);
      b.views[view].title = t; done.push(`set the ${view} title`);
    });
  }
  if (c.categories) {
    Object.keys(c.categories).forEach((k) => {
      /* "yellow" and "green" name the bars themselves, whatever their words
         are (one may even be called "Green"). */
      const key = { yellow: 'lime', lime: 'lime', green: 'teal', teal: 'teal' }[lower(k)] || accentKey(b, k);
      if (key === 'none') fail('"none" has no bar to name or colour.');
      const want = c.categories[k] || {};
      if (want.label !== undefined) {
        const l = clip(want.label, 60);
        if (!l) fail('A category needs a few words for the legend.');
        b.accents[key].label = l; done.push(`named the ${key === 'lime' ? 'yellow' : 'green'} bar "${l}"`);
      }
      if (want.color !== undefined) {
        if (!/^#[0-9a-f]{6}$/i.test(String(want.color))) fail(`A colour is written #rrggbb, for example #17c3a2, not "${want.color}".`);
        b.accents[key].color = String(want.color).toLowerCase(); done.push(`coloured the ${key === 'lime' ? 'yellow' : 'green'} bar ${b.accents[key].color}`);
      }
    });
  }
  return done;
}

/* ---------- rows ---------- */

export function findEntry(library, ref) {
  const lib = library || [];
  const byId = lib.find((x) => x.id === ref);
  if (byId) return byId;
  const hits = lib.filter((x) => lower(x.name) === lower(ref));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) fail(`${hits.length} library entries are called "${ref}". Use the id instead: ${list(hits.map((x) => x.id))}.`);
  fail(`The library has no entry "${ref}".`);
}

/* spec: { name, category, box, area, url, description, phases (replaces), paint (only the sprints given) } */
export function patchRow(b, view, row, spec) {
  if (spec.name !== undefined) {
    const n = clip(spec.name, LIMITS.row);
    if (!n) fail('A row needs a name.');
    row.name = n;
  }
  if (spec.category !== undefined && spec.category !== null) row.accent = accentKey(b, spec.category);
  if (spec.box !== undefined) row.box = !!spec.box;
  if (spec.area !== undefined) row.area = clip(spec.area, LIMITS.area);
  if (spec.description !== undefined) row.desc = longText(spec.description, LIMITS.desc);
  if (spec.url !== undefined) row.url = cleanUrl(spec.url);
  if (spec.phases !== undefined && spec.phases !== null) paintRow(b, view, row, spec.phases, true);
  if (spec.paint !== undefined && spec.paint !== null) paintRow(b, view, row, spec.paint, false);
}
export function makeRow(b, view, spec, library) {
  const src = spec.from_library ? findEntry(library, spec.from_library) : null;
  const name = clip(spec.name !== undefined ? spec.name : (src && src.name), LIMITS.row);
  if (!name) fail('Every row needs a name.');
  /* An entry's link is copied only if the slide could open it. */
  const srcUrl = src ? safeUrl(src.url) : '';
  const row = {
    id: QM.uid('r'), libId: src ? src.id : null, name,
    url: srcUrl, desc: src ? longText(src.desc, LIMITS.desc) : '', area: src ? clip(src.area, LIMITS.area) : '',
    accent: 'teal', box: false, cells: {}
  };
  patchRow(b, view, row, Object.assign({}, spec, { name }));
  return row;
}
function assertFreeName(b, view, name, except) {
  const twin = b.views[view].rows.find((r) => r !== except && lower(r.name) === lower(name));
  if (twin) fail(`The ${view} roadmap already has a row called "${twin.name}". Change that one instead, or give the new one another name.`);
}
/* where: { position } (1 is the top), { before: row } or { after: row }; the end by default. */
function insertAt(b, view, where) {
  const v = b.views[view];
  if (!where) return v.rows.length;
  if (where.position !== undefined) return Math.max(0, Math.min(v.rows.length, Math.round(Number(where.position)) - 1));
  if (where.before !== undefined) return rowIndex(b, view, where.before);
  if (where.after !== undefined) return rowIndex(b, view, where.after) + 1;
  return v.rows.length;
}
export function addRows(b, view, specs, where, library) {
  if (!Array.isArray(specs) || !specs.length) fail('Give at least one row to add.');
  let at = insertAt(b, view, where);
  const added = [];
  specs.forEach((spec) => {
    const row = makeRow(b, view, spec, library);
    assertFreeName(b, view, row.name);
    QM.insertRowAt(b.views[view], at, row);
    added.push({ id: row.id, name: row.name, position: at + 1 });
    at++;
  });
  return added;
}
export function updateRows(b, view, changes) {
  if (!Array.isArray(changes) || !changes.length) fail('Give at least one row to change.');
  return changes.map((c) => {
    const row = b.views[view].rows[rowIndex(b, view, c.row)];
    if (c.name !== undefined) assertFreeName(b, view, c.name, row);
    patchRow(b, view, row, c);
    return { id: row.id, name: row.name };
  });
}
/* A go-live line that covered only removed rows goes with them, rather than
   sliding onto the next initiative. */
export function removeRows(b, view, refs) {
  if (!Array.isArray(refs) || !refs.length) fail('Say which rows to remove.');
  const v = b.views[view];
  const idx = Array.from(new Set(refs.map((r) => rowIndex(b, view, r))));
  const names = idx.map((i) => v.rows[i].name);
  const going = new Set(idx.map((i) => v.rows[i].id));
  const covered = QM.lineRows(v);
  v.rows = v.rows.filter((r) => !going.has(r.id));
  const lines = QM.placeLines(v, covered);
  return { names, lines };
}
/* Like the Up and Down buttons of the editor: the row moves, the go-live
   lines stay on the rows they cover by position. */
export function moveRow(b, view, ref, where) {
  const rows = b.views[view].rows;
  const from = rowIndex(b, view, ref);
  const row = rows[from];
  let to;
  if (where.position !== undefined) to = Math.max(0, Math.min(rows.length - 1, Math.round(Number(where.position)) - 1));
  else {
    const target = rowIndex(b, view, where.before !== undefined ? where.before : where.after);
    if (target === from) return { name: row.name, position: from + 1 };
    to = where.before !== undefined ? (target > from ? target - 1 : target) : (target >= from ? target : target + 1);
  }
  rows.splice(from, 1);
  rows.splice(to, 0, row);
  return { name: row.name, position: to + 1 };
}

/* ---------- go-live lines ---------- */

function lineColumn(b, after) {
  if (after === 0 || after === '0') return 0;
  return sprintIndex(b, after) + 1;
}
function lineRows(b, view, from, to) {
  if (!b.views[view].rows.length) fail(`The ${view} roadmap has no rows yet. Add them first, then the go-live line.`);
  let a = rowIndex(b, view, from), z = to === undefined || to === null ? a : rowIndex(b, view, to);
  if (z < a) [a, z] = [z, a];
  return [a, z];
}
/* item: { label, after_sprint, from_row, to_row } */
export function makeLine(b, view, item) {
  if (item.after_sprint === undefined || item.after_sprint === null) fail('Say where the go-live line goes: after_sprint is the sprint it closes (0 puts it before the first sprint).');
  const [row, endRow] = lineRows(b, view, item.from_row, item.to_row);
  return { id: QM.uid('m'), label: clip(item.label, LIMITS.label) || 'Go-live', col: lineColumn(b, item.after_sprint), row, endRow };
}
export function editLines(b, view, ops) {
  const v = b.views[view], done = [];
  (ops.update || []).forEach((u) => {
    const m = v.milestones[lineIndex(b, view, u.line)];
    if (u.label !== undefined) m.label = clip(u.label, LIMITS.label) || 'Go-live';
    if (u.after_sprint !== undefined) m.col = lineColumn(b, u.after_sprint);
    if (u.from_row !== undefined || u.to_row !== undefined) {
      const rows = v.rows;
      if (!rows.length) fail(`The ${view} roadmap has no rows for the line to cover.`);
      if (u.to_row === undefined) {
        /* Moved: it keeps the number of rows it spans, as far as there are rows. */
        const top = rowIndex(b, view, u.from_row);
        m.endRow = Math.min(rows.length - 1, top + Math.max(0, m.endRow - m.row));
        m.row = top;
      } else {
        const [row, endRow] = lineRows(b, view, u.from_row !== undefined ? u.from_row : rows[Math.min(m.row, rows.length - 1)].id, u.to_row);
        m.row = row; m.endRow = endRow;
      }
    }
    done.push('changed "' + (m.label || 'Go-live') + '"');
  });
  if (ops.remove && ops.remove.length) {
    const gone = Array.from(new Set(ops.remove.map((r) => lineIndex(b, view, r))));
    gone.sort((x, y) => y - x).forEach((i) => { done.push('removed "' + (v.milestones[i].label || 'Go-live') + '"'); v.milestones.splice(i, 1); });
  }
  (ops.add || []).forEach((item) => {
    const m = makeLine(b, view, item);
    v.milestones.push(m);
    done.push('added "' + m.label + '"');
  });
  return done;
}

/* ---------- a whole plan at once ---------- */

/* plan: { name, note, legend, titles, categories, sprints,
           product: { title, rows: [row spec], remove_unlisted, go_live: [line] },
           design: { ... } }
   Rows are matched to the roadmap's rows by name (or by id when a spec gives
   one): a match is updated with the fields given, anything else is added.
   remove_unlisted: rows the plan does not list go, and the rest follow the
   plan's order. go_live, when given, replaces the roadmap's lines. */
export function applyPlan(b, plan, library) {
  const report = { quarter: [], sprints: null, roadmaps: {} };
  report.quarter = updateQuarter(b, { name: plan.name, note: plan.note, legend: plan.legend, titles: plan.titles, categories: plan.categories });
  if (plan.sprints) report.sprints = setSprints(b, plan.sprints);
  QM.VIEW_KEYS.forEach((k) => {
    const p = plan[k];
    if (!p) return;
    const v = b.views[k], r = { added: [], updated: [], removed: [], go_live: [] };
    if (p.title !== undefined) {
      const t = clip(p.title, LIMITS.title);
      if (!t) fail(`The ${k} roadmap needs a title.`);
      v.title = t;
    }
    const covered = QM.lineRows(v);
    const listed = [], seen = {};
    (p.rows || []).forEach((spec) => {
      const key = spec.id || spec.match || spec.name;
      let i = -1;
      if (spec.id) {
        i = v.rows.findIndex((x) => x.id === spec.id);
        if (i < 0) fail(`The ${k} roadmap has no row with the id "${spec.id}".`);
      }
      if (i < 0 && key) {
        const hits = v.rows.map((x, j) => (lower(x.name) === lower(key) ? j : -1)).filter((j) => j >= 0);
        if (hits.length > 1) fail(`${hits.length} rows of the ${k} roadmap are called "${key}". Give the plan's row the id of the one you mean: ${list(hits.map((j) => v.rows[j].id))}.`);
        i = hits.length ? hits[0] : -1;
        /* A rename that finds nothing to rename must not add a second row. */
        if (i < 0 && spec.match) fail(`The ${k} roadmap has no row called "${spec.match}" to rename. Its rows are ${list(v.rows.map((x) => x.name))}.`);
      }
      let row;
      if (i >= 0) {
        row = v.rows[i];
        if (seen[row.id]) fail(`The plan lists the ${k} row "${row.name}" twice.`);
        if (spec.name !== undefined && lower(spec.name) !== lower(row.name)) assertFreeName(b, k, spec.name, row);
        patchRow(b, k, row, spec);
        r.updated.push(row.name);
      } else {
        row = makeRow(b, k, spec, library);
        assertFreeName(b, k, row.name);
        v.rows.push(row);
        r.added.push(row.name);
      }
      seen[row.id] = true;
      listed.push(row);
    });
    if (p.remove_unlisted) {
      r.removed = v.rows.filter((x) => !seen[x.id]).map((x) => x.name);
      v.rows = listed;
    }
    if (p.go_live) {
      v.milestones = [];
      p.go_live.forEach((item) => { const m = makeLine(b, k, item); v.milestones.push(m); r.go_live.push(m.label); });
    } else {
      /* Each line stays across the rows it covered that are left; reordered
         rows can spread them apart, and then the line spans rows it did not
         cover before, which the report says. */
      const dropped = QM.placeLines(v, covered);
      if (dropped.length) r.go_live_removed = dropped;
      const here = new Set(v.rows.map((x) => x.id));
      const spread = v.milestones.filter((m) => covered[m.id] && m.endRow - m.row + 1 > covered[m.id].filter((id) => here.has(id)).length)
        .map((m) => m.label || 'Go-live');
      if (spread.length) r.go_live_spread = spread;
    }
    QM.clampMilestones(v);
    report.roadmaps[k] = r;
  });
  return report;
}

/* ---------- the library ---------- */

/* ops: { add: [{ name, area, url, description }], update: [{ entry, ...same }], remove: [entry] }.
   Updates go first, then removals, then additions. inUse(entry), when given,
   lists where an entry is still used; such an entry is not removed. */
export function editLibrary(items, ops, inUse) {
  const lib = items.slice(), done = { added: [], updated: [], removed: [] };
  const free = (name, except) => {
    const twin = lib.find((x) => x !== except && lower(x.name) === lower(name));
    if (twin) fail(`The library already has "${twin.name}" (id ${twin.id}).`);
  };
  (ops.update || []).forEach((u) => {
    const it = findEntry(lib, u.entry);
    const i = lib.indexOf(it), next = Object.assign({}, it);
    if (u.name !== undefined) { const n = clip(u.name, LIMITS.row); if (!n) fail('A library entry needs a name.'); free(n, it); next.name = n; }
    if (u.area !== undefined) next.area = clip(u.area, LIMITS.area);
    if (u.url !== undefined) next.url = cleanUrl(u.url);
    if (u.description !== undefined) next.desc = longText(u.description, LIMITS.desc);
    lib[i] = next;
    done.updated.push(next.name);
  });
  (ops.remove || []).forEach((ref) => {
    const it = findEntry(lib, ref);
    const where = inUse ? inUse(it) : [];
    if (where.length) fail(`"${it.name}" is still used on ${where.join(', ')}. Remove those rows first, or keep the entry.`);
    lib.splice(lib.indexOf(it), 1);
    done.removed.push(it.name);
  });
  (ops.add || []).forEach((a) => {
    const n = clip(a.name, LIMITS.row);
    if (!n) fail('A library entry needs a name.');
    free(n);
    const it = { id: QM.uid('i'), name: n, url: cleanUrl(a.url), desc: longText(a.description, LIMITS.desc), area: clip(a.area, LIMITS.area) };
    lib.push(it);
    done.added.push({ id: it.id, name: it.name });
  });
  return { items: lib, done };
}
