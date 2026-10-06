/**
 * A stand-in for the Supabase client, injected into the page before it loads.
 * It keeps its "database" in sessionStorage, so a reload keeps the account the
 * way the real service would, and answers the calls Quartermap makes: tables
 * (select, insert, upsert, update, delete), the share-link functions, and
 * realtime, which a test can play events into with window.__fakeEmit.
 *
 * Flags a test can set on window: __fakeFail (every call fails as if offline),
 * __fakeNoShares (the shares table is missing), __fakeAnon (calls made through
 * a share link come from somebody without an account).
 */
export const FAKE_SUPABASE = () => {
  // State lives in sessionStorage so a reload keeps the "account", as the real service would.
  let saved = null; try { saved = JSON.parse(sessionStorage.getItem('__fake') || 'null'); } catch (e) {}
  const db = (saved && saved.db) || { boards: [], libraries: [], profiles: [], shares: [], comments: [] };
  if (!db.shares) db.shares = [];
  if (!db.comments) db.comments = [];
  const users = (saved && saved.users) || {}; const listeners = []; let session = (saved && saved.session) || null;
  const persist = () => { try { sessionStorage.setItem('__fake', JSON.stringify({ db, users, session })); } catch (e) {} };
  const emit = (ev, s) => listeners.forEach(cb => cb(ev, s));
  const pk = { boards: ['owner_id', 'id'], libraries: ['owner_id'], profiles: ['id'], shares: ['owner_id', 'board_id'], comments: ['id'] };
  const uid = () => 'u-' + Math.random().toString(36).slice(2, 10);
  const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  // the database stamps a share on every write, the way the trigger does
  const stamp = (t, r) => { if (t === 'shares') r.updated_at = new Date().toISOString(); return r; };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // realtime: what the page listens to, and a way for a test to play an event into it
  const rt = [];
  window.__fakeEmit = (table, type, row) => {
    if (table === 'comments') {
      if (type === 'DELETE') db.comments = db.comments.filter(r => r.id !== row.id && r.parent_id !== row.id);
      else {
        const i = db.comments.findIndex(r => r.id === row.id);
        if (i < 0) db.comments.push(clone(row)); else db.comments[i] = clone(row);
      }
      persist();
    }
    rt.filter(x => x.table === table).forEach(x => x.cb({ eventType: type, new: type === 'DELETE' ? {} : clone(row), old: type === 'DELETE' ? { id: row.id } : {} }));
  };
  const shareOf = (token) => db.shares.filter(r => r.token === token)[0] || null;
  // Like the real service: order and range apply to a select or a set-returning
  // function, and no answer holds more than MAX_ROWS rows.
  const MAX_ROWS = 1000;
  const shape = (rows, ord, rng) => {
    let out = rows.slice();
    if (ord.length) out.sort((a, b) => { for (const k of ord) { if (a[k] < b[k]) return -1; if (a[k] > b[k]) return 1; } return 0; });
    if (rng) out = out.slice(rng[0], rng[1] + 1);
    return out.slice(0, MAX_ROWS);
  };
  function builder(table) {
    const filters = [], ord = []; let op = 'select', payload = null, ret = false, rng = null;
    const match = (r) => filters.every(([k, v]) => String(r[k]) === String(v));
    const run = () => {
      if (window.__fakeFail) return { data: null, error: { message: 'FetchError: network down' } };
      // PostgREST answers a missing table with an error body, it does not throw
      if (window.__fakeNoShares && table === 'shares') return { data: null, error: { message: 'relation "shares" does not exist' } };
      if (op === 'select') return { data: shape(db[table].filter(match), ord, rng).map(clone), error: null };
      if (op === 'insert') {
        const added = (Array.isArray(payload) ? payload : [payload]).map(row => {
          const fresh = Object.assign({ id: uuid(), created_at: new Date().toISOString(), resolved: false }, clone(row));
          db[table].push(fresh);
          return fresh;
        });
        persist(); return { data: ret ? added.map(clone) : null, error: null };
      }
      if (op === 'upsert') {
        const touched = (Array.isArray(payload) ? payload : [payload]).map(row => {
          const i = db[table].findIndex(r => pk[table].every(k => r[k] === row[k]));
          if (i < 0) {
            const fresh = clone(row);
            if (table === 'shares' && !fresh.token) fresh.token = uuid();
            if (table === 'shares' && fresh.allow_comments === undefined) fresh.allow_comments = true;
            db[table].push(stamp(table, fresh));
            return fresh;
          }
          Object.assign(db[table][i], clone(row));
          return stamp(table, db[table][i]);
        });
        persist(); return { data: ret ? touched.map(clone) : null, error: null };
      }
      if (op === 'update') {
        const touched = db[table].filter(match);
        touched.forEach(r => { Object.assign(r, clone(payload)); stamp(table, r); });
        persist(); return { data: ret ? touched.map(clone) : null, error: null };
      }
      const dropped = db[table].filter(match).map(r => r.id);
      db[table] = db[table].filter(r => !match(r));
      // the database drops a thread's replies along with it
      if (table === 'comments') db.comments = db.comments.filter(r => dropped.indexOf(r.parent_id) < 0);
      persist(); return { data: null, error: null };
    };
    const b = {
      // a select after a write asks for the rows back, it does not undo the write
      select() { if (op !== 'select') ret = true; return b; },
      upsert(row) { op = 'upsert'; payload = row; return b; },
      insert(row) { op = 'insert'; payload = row; return b; },
      update(row) { op = 'update'; payload = row; return b; },
      delete() { op = 'delete'; return b; }, eq(k, v) { filters.push([k, v]); return b; },
      order(k) { ord.push(k); return b; }, range(a, z) { rng = [a, z]; return b; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: null }); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); }
    };
    return b;
  }
  const auth = {
    onAuthStateChange(cb) { listeners.push(cb); setTimeout(() => cb('INITIAL_SESSION', session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
    getSession() { return Promise.resolve({ data: { session }, error: null }); },
    signUp({ email, password }) {
      if (users[email]) return Promise.resolve({ data: { user: null, session: null }, error: { message: 'User already registered' } });
      users[email] = { id: uid(), email, password };
      session = { user: { id: users[email].id, email } }; persist();
      setTimeout(() => emit('SIGNED_IN', session), 0);
      return Promise.resolve({ data: { user: session.user, session }, error: null });
    },
    signInWithPassword({ email, password }) {
      const u = users[email];
      if (!u || u.password !== password) return Promise.resolve({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } });
      session = { user: { id: u.id, email } }; persist();
      setTimeout(() => emit('SIGNED_IN', session), 0);
      return Promise.resolve({ data: { user: session.user, session }, error: null });
    },
    signOut(opts) { window.__lastSignOut = opts || null; session = null; persist(); setTimeout(() => emit('SIGNED_OUT', null), 0); return Promise.resolve({ error: null }); },
    __expire() { session = null; persist(); emit('SIGNED_OUT', null); },
    resetPasswordForEmail() { return Promise.resolve({ data: {}, error: null }); },
    updateUser() { return Promise.resolve({ data: {}, error: null }); }
  };
  // the reader is somebody else: no account of theirs is in this browser
  const caller = () => (window.__fakeAnon || !session) ? null : session.user.id;
  const rpcRaw = (name, args) => {
    if (window.__fakeFail) return Promise.resolve({ data: null, error: { message: 'FetchError: network down' } });
    const share = shareOf(args && args.share_token);
    if (name === 'get_shared_board' || name === 'get_shared_quarter') {
      return Promise.resolve({
        data: share ? [{ board_id: share.board_id, data: clone(share.data),
                         theme: share.theme ? clone(share.theme) : null,
                         updated_at: share.updated_at || new Date().toISOString(),
                         allow_comments: share.allow_comments !== false }] : [],
        error: null
      });
    }
    if (name === 'get_share_comments') {
      if (!share || share.allow_comments === false) return Promise.resolve({ data: [], error: null });
      const rows = db.comments.filter(c => c.owner_id === share.owner_id && c.board_id === share.board_id)
        .sort((a, b) => a.created_at < b.created_at ? -1 : 1)
        .map(c => ({ id: c.id, roadmap: c.roadmap, anchor: clone(c.anchor), body: c.body, author_name: c.author_name,
                     by_owner: c.author_id === share.owner_id, parent_id: c.parent_id || null, resolved: !!c.resolved, created_at: c.created_at }));
      return Promise.resolve({ data: rows, error: null });
    }
    if (name === 'add_share_comment') {
      window.__lastComment = clone(args);
      if (!share) return Promise.resolve({ data: null, error: { code: 'P0002', message: 'this link is not active' } });
      if (share.allow_comments === false) return Promise.resolve({ data: null, error: { code: '42501', message: 'comments are off for this link' } });
      const body = String(args.p_body || '').trim(), author = String(args.p_author || '').trim();
      if (!body || body.length > 2000 || !author || author.length > 80) return Promise.resolve({ data: null, error: { code: '23514', message: 'violates check constraint' } });
      if (args.p_parent && !db.comments.some(c => c.id === args.p_parent && !c.parent_id && c.board_id === share.board_id && c.owner_id === share.owner_id)) {
        return Promise.resolve({ data: null, error: { code: 'P0002', message: 'no such thread' } });
      }
      const row = { id: uuid(), owner_id: share.owner_id, board_id: share.board_id, roadmap: args.p_roadmap, anchor: clone(args.p_anchor || {}),
                    body, author_name: author, author_id: caller(), parent_id: args.p_parent || null, resolved: false, created_at: new Date().toISOString() };
      db.comments.push(row); persist();
      return Promise.resolve({ data: [{ comment_id: row.id, posted_at: row.created_at }], error: null });
    }
    return Promise.resolve({ data: null, error: { message: 'unknown function' } });
  };
  const rpc = (name, args) => {
    const ord = []; let rng = null;
    const b = {
      order(k) { ord.push(k); return b; }, range(a, z) { rng = [a, z]; return b; },
      then(res, rej) {
        return rpcRaw(name, args).then(r => (r && Array.isArray(r.data) ? { data: shape(r.data, ord, rng), error: r.error } : r)).then(res, rej);
      }
    };
    return b;
  };
  const channel = () => {
    const ch = {
      bound: [],
      on(kind, opts, cb) { const x = { table: opts && opts.table, cb }; rt.push(x); ch.bound.push(x); return ch; },
      subscribe() { return ch; }
    };
    return ch;
  };
  const removeChannel = (ch) => { (ch && ch.bound || []).forEach(x => { const i = rt.indexOf(x); if (i >= 0) rt.splice(i, 1); }); };
  const client = { auth, from: builder, rpc, channel, removeChannel };
  // a test that edits __fakeDb by hand calls __fakeSave so the change survives a reload
  window.__fakeDb = db; window.__fakeAuth = auth; window.__fakeSave = persist;
  window.supabase = { createClient: () => client };
};
