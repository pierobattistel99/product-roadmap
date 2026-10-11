/**
 * Unit tests for the roadmap model shared by the editor and the Claude
 * connector (lib/model.cjs, built from the page). No browser needed:
 *
 *   node --test test/model.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const QM = require('../lib/model.cjs');
const clone = (x) => JSON.parse(JSON.stringify(x));

const board = () => ({
  id: 'b1', name: 'Q1 2027', note: { show: false, text: 'To validate' }, legend: { show: true },
  accents: { lime: { label: 'Legal obligation', color: '#dcf223' }, teal: { label: 'Other initiatives', color: '#17c3a2' } },
  sprints: [{ id: 's1', name: 'Sprint 1', quarter: 'Q1', dates: '' }, { id: 's2', name: 'Sprint 2', quarter: 'Q1', dates: '' }, { id: 's3', name: 'Sprint 3', quarter: 'Q1', dates: '' }],
  views: {
    product: {
      title: 'Quarter roadmap snapshot (Q1)',
      rows: [
        { id: 'r1', libId: null, name: 'Alpha', url: '', desc: '', area: '', accent: 'teal', box: false, cells: { 0: ['discovery'] } },
        { id: 'r2', libId: null, name: 'Beta', url: '', desc: '', area: '', accent: 'lime', box: false, cells: {} },
        { id: 'r3', libId: null, name: 'Gamma', url: '', desc: '', area: '', accent: 'teal', box: false, cells: {} }
      ],
      milestones: [{ id: 'm1', label: 'Go-live', col: 1, row: 1, endRow: 2 }]
    },
    design: { title: 'Quarter design roadmap snapshot (Q1)', rows: [], milestones: [] }
  }
});

test('sprints: dates are right across a clock change', () => {
  const made = QM.generateSprints({ start: '2026-10-19', weeks: 2, count: 4, from: 1, perQ: 6, quarter: 'Q4' });
  assert.deepEqual(made.sprints.map((s) => s.dates), ['19/10 – 30/10', '02/11 – 13/11', '16/11 – 27/11', '30/11 – 11/12']);
  assert.equal(made.count, 4);
});

test('sprints: numbering rolls into the next quarter, and the count is clamped', () => {
  const made = QM.generateSprints({ start: '2027-01-04', weeks: 2, count: 20, from: 6, perQ: 7, quarter: 'Q4' });
  assert.equal(made.count, QM.MAX_SPRINTS);
  assert.equal(made.asked, 20);
  assert.deepEqual(made.sprints.slice(0, 3).map((s) => s.name + ' ' + s.quarter), ['Sprint 6 Q4', 'Sprint 7 Q4', 'Sprint 1 Q1']);
});

test('sprints: ids carry over by position; a bad date gives nothing', () => {
  const made = QM.generateSprints({ start: '2027-01-04', weeks: 1, count: 3 }, [{ id: 'keep-me' }]);
  assert.equal(made.sprints[0].id, 'keep-me');
  assert.notEqual(made.sprints[1].id, 'keep-me');
  assert.equal(QM.generateSprints({ start: '2027-02-30' }), null);
  assert.equal(QM.generateSprints({ start: 'next monday' }), null);
});

test('sprints: fewer sprints drop the phases and lines past the end, a line at the very end stays', () => {
  const b = board();
  b.views.product.rows[0].cells = { 0: ['discovery'], 2: ['specs'] };
  b.views.product.milestones = [{ id: 'a', label: '', col: 2, row: 0, endRow: 0 }, { id: 'b', label: '', col: 3, row: 0, endRow: 0 }];
  b.sprints = b.sprints.slice(0, 2);
  QM.fitToSprints(b);
  assert.deepEqual(Object.keys(b.views.product.rows[0].cells), ['0']);
  assert.deepEqual(b.views.product.milestones.map((m) => m.id), ['a']);
});

test('rows: inserting and removing moves the go-live lines with their rows', () => {
  const b = board(), v = b.views.product;
  QM.insertRowAt(v, 0, { id: 'r0', name: 'Zero', cells: {} });
  assert.deepEqual([v.milestones[0].row, v.milestones[0].endRow], [2, 3]);
  QM.removeRowsAt(v, [0, 1]);
  assert.deepEqual([v.milestones[0].row, v.milestones[0].endRow], [0, 1]);
});

test('migrate: legacy rows get their text and a stable id; blank rows go', () => {
  const b = board();
  b.views.product.rows = [{ iid: 'i-1', accent: 'teal', label: '', cells: {} }, { name: '', cells: {} }];
  QM.migrateBoard(b, { libEntry: (id) => (id === 'i-1' ? { name: 'From library', url: 'https://x.dev' } : null) });
  assert.equal(b.views.product.rows.length, 1);
  assert.equal(b.views.product.rows[0].name, 'From library');
  assert.equal(b.views.product.rows[0].id, 'r-l-i-1');
  assert.equal(b.views.product.rows[0].url, 'https://x.dev');
});

test('problems: a good quarter has none, a broken one says what is wrong', () => {
  assert.deepEqual(QM.problems(board()), []);
  const b = board();
  b.views.product.rows[0].cells = { 0: ['conception'], 7: ['specs'], 1: ['specs', 'specs'] };
  b.views.product.milestones[0].endRow = 9;
  const p = QM.problems(b).join(' | ');
  assert.match(p, /conception/);
  assert.match(p, /outside the sprints/);
  assert.doesNotMatch(p, /twice/, 'the half-sprint brush paints the same phase in both halves, and the editor draws it');
  assert.match(p, /rows that are not there/);
  const keys = QM.problemList(b).map((x) => x.key);
  assert.ok(keys.indexOf('product row uses conception, which the product roadmap does not have') >= 0, keys.join(' | '));
  const few = board();
  few.sprints = few.sprints.slice(0, 1);
  few.views.product.rows[0].cells = {};
  assert.match(QM.problems(few).join(' | '), /2 to 12 sprints, this one has 1/);
});

test('merge: a row added on one side and a cell painted on the other both survive', () => {
  const base = board(), local = clone(base), remote = clone(base);
  local.views.product.rows[1].cells['2'] = ['delivery'];
  remote.views.product.rows.push({ id: 'r4', name: 'Delta', accent: 'teal', box: false, cells: {} });
  remote.views.product.title = 'Q1 plan';
  const m = QM.mergeBoards(base, local, remote);
  assert.deepEqual(m.views.product.rows.map((r) => r.id), ['r1', 'r2', 'r3', 'r4']);
  assert.deepEqual(m.views.product.rows[1].cells['2'], ['delivery']);
  assert.equal(m.views.product.title, 'Q1 plan');
});

test('merge: a row removed on either side stays removed; new rows keep their place', () => {
  const base = board(), local = clone(base), remote = clone(base);
  local.views.product.rows.splice(0, 1);
  remote.views.product.rows[0].name = 'Alpha renamed';
  remote.views.product.rows.splice(2, 0, { id: 'rX', name: 'Inserted', cells: {} });
  const m = QM.mergeBoards(base, local, remote);
  assert.deepEqual(m.views.product.rows.map((r) => r.id), ['r2', 'rX', 'r3']);
});

test('merge: the side that reordered sets the order', () => {
  const base = board(), local = clone(base), remote = clone(base);
  remote.views.product.rows.reverse();
  local.views.product.rows[0].cells['1'] = ['specs'];
  const m = QM.mergeBoards(base, local, remote);
  assert.deepEqual(m.views.product.rows.map((r) => r.id), ['r3', 'r2', 'r1']);
  assert.deepEqual(m.views.product.rows[2].cells['1'], ['specs']);
});

test('merge: the same value changed on both sides keeps the local one', () => {
  const base = board(), local = clone(base), remote = clone(base);
  local.views.product.rows[0].cells['0'] = ['specs'];
  remote.views.product.rows[0].cells['0'] = ['delivery'];
  local.name = 'Mine'; remote.name = 'Theirs';
  const m = QM.mergeBoards(base, local, remote);
  assert.deepEqual(m.views.product.rows[0].cells['0'], ['specs']);
  assert.equal(m.name, 'Mine');
});

test('merge: key order from the database does not read as a change', () => {
  const base = board();
  const reordered = JSON.parse(JSON.stringify(base, Object.keys(base).sort()));
  const sorted = (o) => (Array.isArray(o) ? o.map(sorted) : o && typeof o === 'object'
    ? Object.keys(o).sort().reduce((a, k) => { a[k] = sorted(o[k]); return a; }, {}) : o);
  const remote = sorted(base);
  const local = clone(base);
  local.views.product.rows[2].name = 'Gamma 2';
  assert.ok(QM.equal(base, remote));
  const m = QM.mergeBoards(base, local, remote);
  assert.equal(m.views.product.rows[2].name, 'Gamma 2');
  assert.ok(reordered);
});

test('merge: a cell painted on one side and erased on the other: local wins', () => {
  const base = board(), local = clone(base), remote = clone(base);
  delete local.views.product.rows[0].cells['0'];
  remote.views.product.rows[0].cells['0'] = ['specs'];
  const m = QM.mergeBoards(base, local, remote);
  assert.equal(m.views.product.rows[0].cells['0'], undefined);
});

test('merge: library lists merge by id', () => {
  const base = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const local = [{ id: 'a', name: 'A2' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
  const remote = [{ id: 'a', name: 'A' }, { id: 'd', name: 'D' }];
  // c follows the last element before it that survived (a); b was removed by remote
  assert.deepEqual(QM.mergeLists(base, local, remote).map((x) => x.id + ':' + x.name), ['a:A2', 'c:C', 'd:D']);
});

test('merge: go-live lines stay within the rows after a merge removes rows', () => {
  const base = board(), local = clone(base), remote = clone(base);
  local.views.product.rows.splice(1, 2);
  local.views.product.milestones[0].row = 0; local.views.product.milestones[0].endRow = 0;
  remote.views.product.milestones[0].label = 'Launch';
  const m = QM.mergeBoards(base, local, remote);
  assert.deepEqual(m.views.product.milestones.map((x) => [x.label, x.row, x.endRow]), [['Launch', 0, 0]]);
});

test('migrate: a copy about to be merged keeps its empty rows, a copy being loaded drops them', () => {
  const b = board();
  b.views.product.rows.push({ id: 'r-new', libId: null, name: '', url: '', desc: '', area: '', accent: 'teal', box: false, cells: {} });
  assert.equal(QM.migrateBoard(clone(b), { keepBlank: true }).views.product.rows.length, 4);
  assert.equal(QM.migrateBoard(clone(b)).views.product.rows.length, 3);
});

test('merge: a row added here and being typed into survives a change made elsewhere', () => {
  const base = board();
  base.views.product.rows.push({ id: 'r-new', libId: null, name: '', url: '', desc: '', area: '', accent: 'teal', box: false, cells: {} });
  const local = clone(base), remote = QM.migrateBoard(clone(base), { keepBlank: true });
  local.views.product.rows[3].name = 'Checkout';
  remote.views.product.rows[0].name = 'Alpha (renamed elsewhere)';
  const m = QM.mergeBoards(base, local, remote);
  assert.deepEqual(m.views.product.rows.map((r) => r.name), ['Alpha (renamed elsewhere)', 'Beta', 'Gamma', 'Checkout']);
});

test('merge: go-live lines stay on their initiatives when both sides add or remove rows', () => {
  const base = board(), local = clone(base), remote = clone(base);
  base.views.product.rows.push({ id: 'r4', name: 'Delta', cells: {} });
  local.views.product.rows.push({ id: 'r4', name: 'Delta', cells: {} });
  remote.views.product.rows.push({ id: 'r4', name: 'Delta', cells: {} });
  [base, local, remote].forEach((b) => { b.views.product.milestones = [{ id: 'm1', label: 'On Gamma', col: 2, row: 2, endRow: 2 }]; });
  QM.removeRowsAt(local.views.product, [0]);
  QM.insertRowAt(remote.views.product, 0, { id: 'rN', name: 'New', cells: {} });
  const m = QM.mergeBoards(base, local, remote);
  const v = m.views.product;
  assert.deepEqual(v.rows.map((r) => r.id), ['rN', 'r2', 'r3', 'r4']);
  assert.equal(v.rows[v.milestones[0].row].name, 'Gamma');
  assert.equal(v.milestones[0]._rows, undefined, 'no bookkeeping left on the lines');
  assert.equal(base.views.product.milestones[0]._rows, undefined, 'the copies passed in are not marked');
});

test('lines: they follow the rows they covered; one with no row left goes, unless asked to stay', () => {
  const v = { rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], milestones: [{ id: 'm1', label: 'L1', col: 1, row: 0, endRow: 2 }, { id: 'm2', label: 'L2', col: 2, row: 3, endRow: 3 }] };
  const covered = QM.lineRows(v);
  assert.deepEqual(covered, { m1: ['a', 'b', 'c'], m2: ['d'] });
  v.rows = [{ id: 'b' }, { id: 'x' }];
  assert.deepEqual(QM.placeLines(v, covered), ['L2']);
  assert.deepEqual(v.milestones.map((m) => [m.id, m.row, m.endRow]), [['m1', 0, 0]]);
  const w = { rows: [{ id: 'a' }], milestones: [{ id: 'm3', col: 1, row: 0, endRow: 0 }] };
  const c2 = QM.lineRows(w);
  w.rows = [{ id: 'z' }];
  assert.deepEqual(QM.placeLines(w, c2, true), []);
  assert.equal(w.milestones.length, 1);
});
