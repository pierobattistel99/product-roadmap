/**
 * A stand-in for the Supabase client the Claude connector uses (lib/store.js),
 * for tests that run without a network. It keeps its tables in memory and
 * behaves like the real database where the connector depends on it:
 *   - row level security: one person sees and writes only their own rows;
 *   - boards and libraries carry a version that every update moves on by one;
 *   - a change to a quarter written as 'mcp' is kept in board_history (the
 *     newest 30 per quarter), as the record_board_change trigger does;
 *   - the copy behind a share link follows its quarter, and is filled from it
 *     when the link is made;
 *   - deleting a quarter deletes its link, comments and history;
 *   - an insert over an existing row fails with code 23505.
 * db.before(fn) runs fn once just before the next update reaches a table: a
 * test uses it to play the editor saving at the same moment.
 */
const PK = { boards: ['owner_id', 'id'], libraries: ['owner_id'], profiles: ['id'], shares: ['owner_id', 'board_id'], comments: ['id'], board_history: ['id'] };
const OWNER = { profiles: 'id' };
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

export function fakeDb() {
  const t = { boards: [], libraries: [], profiles: [], shares: [], comments: [], board_history: [] };
  let hist = 0, hooks = [];
  const calls = [];

  function bumped(table, row, before) {
    if (table === 'boards' || table === 'libraries') row.version = (before.version || 1) + 1;
    row.updated_at = new Date().toISOString();
    if (table === 'boards' && !same(before.data, row.data)) {
      t.shares.filter((s) => s.owner_id === row.owner_id && s.board_id === row.id).forEach((s) => { s.data = clone(row.data); });
      if (row.writer === 'mcp') {
        t.board_history.push({ id: ++hist, owner_id: row.owner_id, board_id: row.id, before: clone(before.data), after: clone(row.data), writer: row.writer, created_at: new Date(Date.now() + hist).toISOString() });
        const mine = t.board_history.filter((h) => h.owner_id === row.owner_id && h.board_id === row.id).sort((a, z) => z.id - a.id);
        const keep = new Set(mine.slice(0, 30).map((h) => h.id));
        t.board_history = t.board_history.filter((h) => !(h.owner_id === row.owner_id && h.board_id === row.id) || keep.has(h.id));
      }
    }
  }
  function fresh(table, row, uid) {
    const r = clone(row);
    if (table === 'boards' || table === 'libraries') r.version = 1;
    if (table === 'comments') { r.id = r.id || uuid(); r.created_at = new Date().toISOString(); if (r.resolved === undefined) r.resolved = false; if (r.parent_id === undefined) r.parent_id = null; }
    if (table === 'shares') {
      r.token = r.token || uuid();
      if (r.allow_comments === undefined) r.allow_comments = true;
      const b = t.boards.find((x) => x.owner_id === r.owner_id && x.id === r.board_id);
      if (b) r.data = clone(b.data);
    }
    r.updated_at = new Date().toISOString();
    return r;
  }
  const pick = (row, cols) => {
    if (!cols || cols === '*') return clone(row);
    const out = {};
    cols.split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => {
      const m = /^(?:(\w+):)?(\w+)(?:->>(\w+))?$/.exec(c);
      if (!m) throw new Error('fake db cannot select ' + c);
      const key = m[1] || (m[3] ? m[3] : m[2]);
      const v = m[3] ? (row[m[2]] && row[m[2]][m[3]] !== undefined && row[m[2]][m[3]] !== null ? String(row[m[2]][m[3]]) : null) : row[m[2]];
      out[key] = clone(v);
    });
    return out;
  };

  function client(uid) {
    const from = (table) => {
      if (!t[table]) throw new Error('fake db has no table ' + table);
      const filters = [], order = [];
      let op = 'select', payload = null, cols = '*', back = null, single = false, limit = null, conflict = null, span = null;
      const mine = (r) => r[OWNER[table] || 'owner_id'] === uid;
      const hit = (r) => mine(r) && filters.every(([k, v, how]) => (how === 'is' ? (r[k] === undefined ? null : r[k]) === v : String(r[k]) === String(v)));
      const err = (code, message) => ({ data: null, error: { code, message } });
      const finish = (rows) => {
        rows = rows.slice();
        order.forEach(([k, asc]) => rows.sort((a, z) => (a[k] < z[k] ? -1 : a[k] > z[k] ? 1 : 0) * (asc ? 1 : -1)));
        if (span) rows = rows.slice(span[0], span[1] + 1);
        if (limit !== null) rows = rows.slice(0, limit);
        rows = rows.slice(0, 1000);
        const data = rows.map((r) => pick(r, back || cols));
        if (single) {
          if (data.length > 1) return err('PGRST116', 'JSON object requested, multiple (or no) rows returned');
          return { data: data[0] || null, error: null };
        }
        return { data, error: null };
      };
      const run = () => {
        calls.push({ table, op });
        if (op === 'select') return finish(t[table].filter(hit));
        if (op === 'insert' || op === 'upsert') {
          const list = Array.isArray(payload) ? payload : [payload];
          const out = [];
          for (const row of list) {
            if ((row[OWNER[table] || 'owner_id']) !== uid) return err('42501', 'new row violates row-level security policy for table "' + table + '"');
            if (table === 'comments' && row.author_id !== uid) return err('42501', 'new row violates row-level security policy for table "comments"');
            const keys = conflict ? conflict.split(',') : PK[table];
            const twin = t[table].find((r) => keys.every((k) => r[k] === row[k]) && keys.every((k) => row[k] !== undefined));
            if (twin && op === 'insert') return err('23505', 'duplicate key value violates unique constraint "' + table + '_pkey"');
            if (twin) {
              const before = clone(twin);
              const next = fresh(table, Object.assign({}, twin, row), uid);
              Object.keys(next).forEach((k) => { if (k !== 'version' && k !== 'token') twin[k] = next[k]; });
              bumped(table, twin, before);
              out.push(twin);
            } else {
              if (table === 'boards' && !row.data) return err('23502', 'null value in column "data"');
              const r = fresh(table, row, uid);
              t[table].push(r);
              out.push(r);
            }
          }
          return back ? finish(out) : { data: null, error: null };
        }
        if (op === 'update') {
          const rows = t[table].filter(hit);
          const due = hooks.filter((h) => h.table === table);
          if (due.length) { hooks = hooks.filter((h) => due.indexOf(h) < 0); due.forEach((h) => h.fn(api)); }
          const now = t[table].filter(hit);
          rows.length = 0; now.forEach((r) => rows.push(r));
          rows.forEach((r) => { const before = clone(r); Object.assign(r, clone(payload)); bumped(table, r, before); });
          return back ? finish(rows) : { data: null, error: null };
        }
        if (op === 'delete') {
          const gone = t[table].filter(hit);
          t[table] = t[table].filter((r) => !hit(r));
          if (table === 'boards') gone.forEach((b) => ['shares', 'comments', 'board_history'].forEach((x) => {
            t[x] = t[x].filter((r) => !(r.owner_id === b.owner_id && r.board_id === b.id));
          }));
          return back ? { data: gone.map((r) => pick(r, back)), error: null } : { data: null, error: null };
        }
        throw new Error('fake db: unknown op ' + op);
      };
      const q = {
        select(c) { if (op === 'select') cols = c || '*'; else back = c || '*'; return q; },
        insert(row) { op = 'insert'; payload = row; return q; },
        upsert(row, o) { op = 'upsert'; payload = row; conflict = o && o.onConflict; return q; },
        update(row) { op = 'update'; payload = row; return q; },
        delete() { op = 'delete'; return q; },
        eq(k, v) { filters.push([k, v, 'eq']); return q; },
        is(k, v) { filters.push([k, v, 'is']); return q; },
        order(k, o) { order.push([k, !o || o.ascending !== false]); return q; },
        limit(n) { limit = n; return q; },
        range(a, z) { span = [a, z]; return q; },
        maybeSingle() { single = true; return q; },
        then(ok, no) { return Promise.resolve().then(run).then(ok, no); }
      };
      return q;
    };
    return { from };
  }

  const api = {
    tables: t, calls, client,
    before(table, fn) { hooks.push({ table, fn }); },
    /* Another writer (the editor) changes a quarter: the version moves on. */
    edit(uid, id, change, writer) {
      const r = t.boards.find((x) => x.owner_id === uid && x.id === id);
      const before = clone(r);
      change(r.data);
      r.writer = writer || 'c-editor';
      bumped('boards', r, before);
      return r;
    }
  };
  return api;
}
