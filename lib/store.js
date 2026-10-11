/**
 * The account behind a Claude connection: its quarters, its library, its
 * share links and comments, read and written as that person. The database's
 * row level security applies exactly as in the editor, so a connection only
 * ever reaches the account that approved it.
 *
 * Every change to a quarter names the version it started from, like the
 * editor's saves. When the quarter moved on in the meantime (it is open in
 * the editor and someone is typing), nothing is written over: the change is
 * worked out again on the newer copy and saved on top of it.
 */
import { createClient } from '@supabase/supabase-js';
import { QM, OpError, fail, summary, checkGrowth, sameName, lower } from './ops.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
/* What the database records as the author of a change. Changes written as
   'mcp' are kept in board_history, so they can be undone; an undo is written
   as 'mcp-undo' and is not recorded itself. */
export const WRITER = 'mcp', UNDO_WRITER = 'mcp-undo';
const TRIES = 4;

/* The problems a quarter has, counted by kind: "design row 3 uses delivery"
   and "design row 4 uses delivery" are the same problem once a row is added
   above it, so positions do not count (the model gives each problem a key
   without them). */
const problemCounts = (b) => QM.problemList(b).reduce((m, p) => { m[p.key] = (m[p.key] || 0) + 1; return m; }, {});

function dbError(err) {
  const msg = String((err && err.message) || err || 'unknown error');
  if (/jwt|token/i.test(msg) && /expired|invalid/i.test(msg)) {
    return new OpError('The connection to Quartermap has expired. Ask the person to reconnect Quartermap in Claude, then try again.');
  }
  const e = new Error('Quartermap could not reach its database: ' + msg.slice(0, 200));
  e.cause = err;
  return e;
}

/* token: the person's access token. origin: where the editor lives, for links. */
export function openAccount({ token, userId, email, origin, client }) {
  const sb = client || createClient(SUPABASE_URL, SUPABASE_KEY, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const uid = userId;
  const run = async (query) => {
    let r;
    try { r = await query; } catch (e) { throw dbError(e); }
    if (r.error) throw dbError(r.error);
    return r.data;
  };

  /* The library and the look, read once per request: a quarter saved long ago
     reads its rows' text from the library, and seeds missing bars from the look. */
  let shared = null;
  const context = () => {
    if (!shared) {
      shared = Promise.all([
        run(sb.from('libraries').select('items').eq('owner_id', uid).maybeSingle()),
        run(sb.from('profiles').select('theme').eq('id', uid).maybeSingle())
      ]).then(([lib, prof]) => ({
        library: (lib && Array.isArray(lib.items)) ? lib.items : [],
        theme: (prof && prof.theme) || null
      }));
      shared.catch(() => { shared = null; });
    }
    return shared;
  };
  const barColor = (theme) => (k) => {
    const c = theme && theme.colors && theme.colors[QM.BAR_THEME_KEY[k]];
    return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : QM.DEFAULT_BAR[k];
  };
  /* Empty rows stay: they are the editor's, and one may be the row somebody
     is typing into while Claude saves. */
  const migrate = (raw, ctx) => {
    const b = QM.migrateBoard(QM.clone(raw), {
      libEntry: (id) => ctx.library.find((x) => x.id === id) || null,
      barColor: barColor(ctx.theme),
      keepBlank: true
    });
    if (!b || typeof b !== 'object' || !b.views || !b.views.product || !b.views.design) {
      fail('This quarter is saved in a shape the connector cannot read. Open it in the editor once, then try again.');
    }
    return b;
  };

  const links = {
    quarter: (id) => origin + '/?q=' + encodeURIComponent(id),
    share: (token) => origin + '/?s=' + encodeURIComponent(token)
  };

  /* Every quarter's id and name, without the quarters themselves. Read once
     per call to the connector, and again after a quarter is created, deleted
     or renamed. */
  let nameList = null;
  const names = () => {
    if (!nameList) {
      nameList = run(sb.from('boards').select('id,name:data->>name').eq('owner_id', uid));
      nameList.catch(() => { nameList = null; });
    }
    return nameList;
  };

  /* A quarter by id, by name, or (only to read one: opts.partial) by a piece
     of its name that only one has. A change or a deletion needs the whole
     name, so a quarter that is gone never sends it to another one. */
  async function resolve(ref, opts = {}) {
    const want = String(ref ?? '').trim();
    if (!want) fail('Say which quarter: its name (for example "Q1 2027") or its id.');
    const rows = await names();
    if (!rows.length) fail('This account has no quarters yet. create_quarter makes one.');
    const byId = rows.find((r) => r.id === want);
    if (byId) return byId;
    const all = (list) => list.map((r) => `"${r.name}" (${r.id})`).join(', ');
    const named = rows.filter((r) => sameName(r.name, want));
    if (named.length === 1) return named[0];
    if (named.length > 1) fail(`${named.length} quarters are called "${want}". Use the id of the one you mean: ${all(named)}.`);
    const part = rows.filter((r) => lower(r.name).includes(lower(want)));
    if (part.length === 1 && opts.partial) return part[0];
    if (part.length === 1) fail(`There is no quarter called "${want}". Did you mean "${part[0].name}"? Use its whole name or its id (${part[0].id}).`);
    if (part.length > 1) fail(`"${want}" is part of the name of ${part.length} quarters: ${all(part)}. Use the whole name or the id.`);
    fail(`There is no quarter "${want}". The quarters are ${all(rows)}.`);
  }

  async function readRow(id) {
    return run(sb.from('boards').select('id,data,version,updated_at').eq('owner_id', uid).eq('id', id).maybeSingle());
  }

  /* fn(board, ctx) changes the quarter in place and returns a report. Problems
     the change would bring into the quarter stop it; ones it had before do not. */
  async function mutate(ref, fn, opts = {}) {
    const { id } = await resolve(ref);
    for (let i = 0; i < TRIES; i++) {
      const row = await readRow(id);
      if (!row) fail('That quarter was deleted in the meantime.');
      const ctx = await context();
      const board = migrate(row.data, ctx);
      const before = QM.clone(board);
      const result = await fn(board, ctx);
      if (QM.equal(before, board)) return { board, result, changed: false };
      const had = problemCounts(before), now = problemCounts(board);
      const fresh = QM.problemList(board).filter((p) => {
        if ((now[p.key] || 0) <= (had[p.key] || 0)) return false;
        now[p.key]--;
        return true;
      }).map((p) => p.text);
      if (fresh.length) fail('That would leave the quarter in a state the editor cannot draw: ' + fresh.slice(0, 8).join('; ') + '.');
      checkGrowth(board, before);
      board.updatedAt = Date.now();
      if (opts.dryRun) return { board, result, changed: true, dryRun: true };
      const saved = await run(sb.from('boards').update({ data: board, writer: opts.writer || WRITER })
        .eq('owner_id', uid).eq('id', id).eq('version', row.version).select('version'));
      if (saved.length) {
        if (board.name !== before.name) nameList = null;
        return { board, result, changed: true, version: saved[0].version };
      }
    }
    fail('The quarter kept changing while this was being saved (someone is probably editing it right now). Try again in a moment.');
  }

  return {
    uid, email, links, context, migrate, resolve, names,
    barColor: (ctx) => barColor(ctx && ctx.theme),

    /* Every quarter that can be read, migrated; an unreadable one is skipped. */
    async boards() {
      const [rows, ctx] = await Promise.all([run(sb.from('boards').select('id,data').eq('owner_id', uid)), context()]);
      const out = [];
      rows.forEach((r) => { try { out.push(migrate(r.data, ctx)); } catch (e) { /* not drawable: left out */ } });
      return out;
    },

    async quarters() {
      const [rows, shares, ctx] = await Promise.all([
        run(sb.from('boards').select('id,data,updated_at').eq('owner_id', uid)),
        run(sb.from('shares').select('board_id,token').eq('owner_id', uid)),
        context()
      ]);
      const shared = {};
      shares.forEach((s) => { shared[s.board_id] = s.token; });
      return rows.map((r) => {
        let b;
        try { b = migrate(r.data, ctx); } catch (e) { return { id: r.id, name: (r.data && r.data.name) || r.id, unreadable: true }; }
        return Object.assign(summary(b), {
          created: b.createdAt ? new Date(b.createdAt).toISOString() : null,
          updated: r.updated_at, link: links.quarter(r.id),
          share_link: shared[r.id] ? links.share(shared[r.id]) : null
        });
      }).sort((a, z) => String(z.created || '').localeCompare(String(a.created || '')));
    },

    async quarter(ref, opts = {}) {
      const { id } = await resolve(ref, { partial: opts.partial !== false });
      const [row, ctx, share] = await Promise.all([
        readRow(id), context(),
        run(sb.from('shares').select('token,allow_comments').eq('owner_id', uid).eq('board_id', id).maybeSingle())
      ]);
      if (!row) fail('That quarter was deleted in the meantime.');
      return { board: migrate(row.data, ctx), version: row.version, updated: row.updated_at, share };
    },

    mutate,

    async create(board) {
      const saved = await run(sb.from('boards').insert({ owner_id: uid, id: board.id, data: board, writer: WRITER }).select('version'));
      nameList = null;
      return saved[0] && saved[0].version;
    },

    async remove(ref) {
      const { id, name } = await resolve(ref);
      const gone = await run(sb.from('boards').delete().eq('owner_id', uid).eq('id', id).select('id'));
      nameList = null;
      if (!gone.length) fail('That quarter was already gone.');
      return { id, name };
    },

    /* Changes the library the same careful way as a quarter. */
    async mutateLibrary(fn) {
      for (let i = 0; i < TRIES; i++) {
        const row = await run(sb.from('libraries').select('items,version').eq('owner_id', uid).maybeSingle());
        const items = row && Array.isArray(row.items) ? row.items : [];
        const out = await fn(QM.clone(items));
        if (QM.equal(items, out.items)) return out;
        const q = row
          ? sb.from('libraries').update({ items: out.items, writer: WRITER }).eq('owner_id', uid).eq('version', row.version).select('version')
          : sb.from('libraries').insert({ owner_id: uid, items: out.items, writer: WRITER }).select('version');
        let r;
        try { r = await q; } catch (e) { throw dbError(e); }
        if (r.error && r.error.code !== '23505') throw dbError(r.error);
        if (!r.error && r.data && r.data.length) { shared = null; return out; }
      }
      fail('The library kept changing while this was being saved. Try again in a moment.');
    },

    async share(ref, opts = {}) {
      const { id } = await resolve(ref);
      const [ctx, row] = await Promise.all([context(), readRow(id)]);
      if (!row) fail('That quarter was deleted in the meantime.');
      const body = { owner_id: uid, board_id: id, data: row.data, theme: ctx.theme };
      if (opts.allowComments !== undefined) body.allow_comments = !!opts.allowComments;
      const r = await run(sb.from('shares').upsert(body, { onConflict: 'owner_id,board_id' }).select('token,allow_comments'));
      if (!r[0]) fail('The link could not be made. Try again in a moment.');
      return { link: links.share(r[0].token), allow_comments: r[0].allow_comments !== false };
    },
    async unshare(ref) {
      const { id } = await resolve(ref);
      const gone = await run(sb.from('shares').delete().eq('owner_id', uid).eq('board_id', id).select('token'));
      return gone.length > 0;
    },

    /* Every comment on a quarter, a page of 1,000 at a time (the most the
       service gives in one answer). */
    async comments(ref, opts = {}) {
      const { id } = await resolve(ref, { partial: opts.partial !== false });
      const rows = [], PAGE = 1000;
      for (let from = 0; from < 20 * PAGE; from += PAGE) {
        const page = await run(sb.from('comments')
          .select('id,roadmap,anchor,body,author_name,author_id,parent_id,resolved,created_at')
          .eq('owner_id', uid).eq('board_id', id).order('created_at', { ascending: true }).order('id', { ascending: true })
          .range(from, from + PAGE - 1));
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      return { id, rows };
    },
    async addComment(row) {
      const r = await run(sb.from('comments').insert(Object.assign({ owner_id: uid, author_id: uid }, row)).select('id,created_at'));
      return r[0];
    },
    async resolveThread(boardId, threadId, resolved) {
      const r = await run(sb.from('comments').update({ resolved: !!resolved })
        .eq('owner_id', uid).eq('board_id', boardId).eq('id', threadId).is('parent_id', null).select('id'));
      if (!r.length) fail('There is no comment thread with that id on this quarter.');
    },

    /* Puts back what the latest change made by Claude replaced, and keeps
       whatever was edited in the editor since then. */
    async undo(ref) {
      const { id } = await resolve(ref);
      for (let i = 0; i < TRIES; i++) {
        const h = await run(sb.from('board_history').select('id,before,after,created_at')
          .eq('owner_id', uid).eq('board_id', id).order('id', { ascending: false }).limit(1).maybeSingle());
        if (!h) fail('There is no change made by Claude to undo on this quarter (only the last 30 are kept). A quarter Claude created is removed with delete_quarter.');
        const [row, ctx] = await Promise.all([readRow(id), context()]);
        if (!row) fail('That quarter was deleted in the meantime.');
        const now = migrate(row.data, ctx), after = migrate(h.after, ctx), before = migrate(h.before, ctx);
        const next = QM.mergeBoards(after, now, before);
        /* Nothing left of that change: it was taken back already (by hand, or
           by another undo at the same moment). It is not one to go past. */
        const content = (x) => Object.assign({}, x, { updatedAt: 0, touched: 0 });
        if (QM.equal(content(next), content(now))) {
          await run(sb.from('board_history').delete().eq('owner_id', uid).eq('id', h.id));
          fail('That change was already taken back: the quarter is as it was before it. Nothing else was changed.');
        }
        next.updatedAt = Date.now();
        const saved = await run(sb.from('boards').update({ data: next, writer: UNDO_WRITER })
          .eq('owner_id', uid).eq('id', id).eq('version', row.version).select('version'));
        if (!saved.length) continue;
        await run(sb.from('board_history').delete().eq('owner_id', uid).eq('id', h.id));
        return { board: next, changedAt: h.created_at };
      }
      fail('The quarter kept changing while the undo was being saved. Try again in a moment.');
    }
  };
}
