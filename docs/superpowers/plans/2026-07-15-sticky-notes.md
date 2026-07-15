# Sticky Notes Implementation Plan

> **10 tasks.** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared, restorable, rich-text sticky notes that can be dropped anywhere on the Set Your Sunday pitch site and persist server-side.

**Architecture:** A self-contained client layer (`notes.js` + `notes.css`) renders an overlay of sticky notes anchored to page elements by CSS selector + fractional offset. It talks to one method-dispatched serverless function (`api/notes.js`), which delegates to two `lib/` modules — an HTML sanitiser and an Upstash Redis store holding a live hash and a graveyard hash. The existing edge middleware already gates the endpoint, so the feature adds no auth of its own.

**Tech Stack:** Vanilla ESM JavaScript (no build step), Vercel serverless functions (Node), Upstash Redis via Vercel Marketplace, `@upstash/redis`, `sanitize-html`, `node --test` (built into Node 24) for pure-logic tests.

**Spec:** `docs/superpowers/specs/2026-07-15-sticky-notes-design.md`

## Global Constraints

- **Node ESM only.** `package.json` has `"type": "module"`. Use `import`, never `require`.
- **Function style must match `api/gate.js`:** `export default function handler(req, res)`, `res.status(n).json({...})`, unknown method → `405`. Not the Web `Request`/`Response` signature.
- **Function budget:** this adds exactly ONE function (`api/notes.js`), taking the project 3 → 4. The Hobby cap is 12. Code under `lib/` is NOT a function and is free — put shared logic there.
- **Never trust client timestamps.** `created`, `updated`, `deletedAt` are stamped server-side only. Reject/ignore any timestamp in a request body.
- **Never trust client HTML.** All note HTML is sanitised server-side on write, on POST *and* PATCH.
- **Never hard-delete on `DELETE {id}`.** That is a burial (move to graveyard). Only `purge: true` / `purgeAll: true` destroy data.
- **Never lose typed text.** A failed save keeps the note in the DOM marked unsaved; it is never discarded.
- **No new client dependencies.** The browser layer is hand-written vanilla JS; no editor library, no framework.
- **Redis keys:** live = `sys:notes`, graveyard = `sys:notes:trash`. Both hashes, field = note id.
- **Paper colours:** `yellow` (default), `pink`, `blue`, `green`, `orange`.
- **Text colours:** ink `#1a1a1a` (default), red `#d92d20`, blue `#1d4ed8`, green `#15803d`.
- **Font sizes:** three steps only — small `12px`, normal `14px`, large `18px`.
- **Commit after every task.** Author email `edtsue@gmail.com`.

---

### Task 1: Provision Upstash Redis and confirm env var names

Do this first: it is the only step that may need a human, and everything downstream is blocked on knowing the real env var names. **Do not guess the names** — the Vercel Marketplace Upstash integration has shipped both `KV_REST_API_*` and `UPSTASH_REDIS_REST_*` conventions, and which one you get depends on how it was provisioned.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the dependencies**

```bash
npm install @upstash/redis sanitize-html
```

- [ ] **Step 2: Provision Upstash Redis on the Vercel project**

Try the CLI first:

```bash
vercel integration add upstash --scope ed-2664s-projects
```

If that is unavailable or non-interactive-hostile, provision via the dashboard instead: Vercel → project `ytst-engine` → Storage → Marketplace → Upstash → **Redis** (not Vector/QStash) → free plan → connect to `ytst-engine` for **Production, Preview, and Development**.

Connecting to Development matters: it is what lets `vercel env pull` give you working local credentials.

- [ ] **Step 3: Confirm the actual env var names**

```bash
vercel env ls --scope ed-2664s-projects
```

Expected: new rows appear. Record whether they are `KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Task 3 reads both, so either is fine — but you must confirm at least one pair exists. If nothing appeared, provisioning silently failed; stop and fix it before continuing.

- [ ] **Step 4: Pull credentials for local dev**

```bash
vercel env pull .env.development.local --environment=development --scope ed-2664s-projects
```

Expected: file written containing the Upstash URL and token. Note that per project convention, Encrypted vars pull as empty — if the Upstash values come back blank, get them from the Upstash dashboard instead.

- [ ] **Step 5: Verify `.env.development.local` is git-ignored**

```bash
git check-ignore -v .env.development.local
```

Expected: a line naming the ignore rule. **If the command exits non-zero, the file is NOT ignored** — add `.env*.local` to `.gitignore` before doing anything else. Committing a live Redis token would be a real leak.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore
git -c user.email=edtsue@gmail.com commit -m "deps: add @upstash/redis + sanitize-html for sticky notes"
```

---

### Task 2: HTML sanitiser

Pure function, no I/O — the one piece of this feature that is security-critical, so it gets tested first and hardest. It also absorbs the `<font>` vs `<span>` browser difference so no other code has to care.

**Files:**
- Create: `lib/sanitize.js`
- Test: `test/sanitize.test.js`

**Interfaces:**
- Consumes: `sanitize-html` (Task 1)
- Produces: `sanitizeNoteHtml(html: string) => string` — used by `api/notes.js` in Task 4.

- [ ] **Step 1: Write the failing test**

Create `test/sanitize.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeNoteHtml } from '../lib/sanitize.js';

test('keeps allowed formatting tags', () => {
  assert.equal(sanitizeNoteHtml('<b>bold</b> <i>it</i> <u>u</u>'), '<b>bold</b> <i>it</i> <u>u</u>');
});

test('strips script tags entirely', () => {
  assert.equal(sanitizeNoteHtml('hi<script>alert(1)</script>'), 'hi');
});

test('strips event handler attributes', () => {
  assert.equal(sanitizeNoteHtml('<b onclick="alert(1)">x</b>'), '<b>x</b>');
});

test('strips img/onerror payloads', () => {
  assert.equal(sanitizeNoteHtml('<img src=x onerror=alert(1)>'), '');
});

test('keeps span colour within the allowlist', () => {
  assert.equal(
    sanitizeNoteHtml('<span style="color:#d92d20">red</span>'),
    '<span style="color:#d92d20">red</span>'
  );
});

test('drops disallowed style properties', () => {
  const out = sanitizeNoteHtml('<span style="position:fixed;color:#1a1a1a">x</span>');
  assert.ok(!out.includes('position'));
  assert.ok(out.includes('color'));
});

test('normalises legacy font tags into spans', () => {
  const out = sanitizeNoteHtml('<font color="#1d4ed8" size="6">big blue</font>');
  assert.ok(out.startsWith('<span'), `expected span, got: ${out}`);
  assert.ok(out.includes('color:#1d4ed8'));
  assert.ok(out.includes('font-size:18px'));
  assert.ok(out.includes('big blue'));
});

test('handles null and undefined without throwing', () => {
  assert.equal(sanitizeNoteHtml(null), '');
  assert.equal(sanitizeNoteHtml(undefined), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sanitize.test.js`
Expected: FAIL — cannot find module `../lib/sanitize.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/sanitize.js`:

```js
/* ════════════════════════════════════════════════════════════════════
   Sticky-note HTML sanitiser.

   Note HTML is written by one reviewer and rendered into every other
   reviewer's page, so it is cleaned server-side on every write. Client-side
   cleaning is not enough: a crafted PATCH goes straight past it.

   This also normalises legacy <font> tags into spans. Browsers disagree
   about whether execCommand('fontSize'/'foreColor') emits <font ...> or
   <span style>, depending on styleWithCSS — normalising here means the
   client never has to care which one it got.
   ════════════════════════════════════════════════════════════════════ */
import sanitizeHtml from 'sanitize-html';

// execCommand fontSize takes 1-7; we only ever emit 2/4/6 (small/normal/large).
const FONT_SIZE_MAP = { 1: '12px', 2: '12px', 3: '14px', 4: '14px', 5: '18px', 6: '18px', 7: '18px' };

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RGB = /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/;
const SIZE = /^(?:12|14|18)px$/;

export function sanitizeNoteHtml(html) {
  return sanitizeHtml(String(html ?? ''), {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'span'],
    allowedAttributes: { span: ['style'] },
    allowedStyles: { span: { color: [HEX, RGB], 'font-size': [SIZE] } },
    disallowedTagsMode: 'discard',
    transformTags: {
      font: (tagName, attribs) => {
        const style = [];
        if (attribs.color) style.push(`color:${attribs.color}`);
        if (attribs.size && FONT_SIZE_MAP[attribs.size]) {
          style.push(`font-size:${FONT_SIZE_MAP[attribs.size]}`);
        }
        return { tagName: 'span', attribs: style.length ? { style: style.join(';') } : {} };
      },
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/sanitize.test.js`
Expected: PASS — 8 tests.

If the `<font>` test fails on the style string, log the actual output first — `sanitize-html` may normalise `color:#1d4ed8` to `color:#1d4ed8;`. Loosen the assertion to match reality; do not loosen the allowlist.

- [ ] **Step 5: Commit**

```bash
git add lib/sanitize.js test/sanitize.test.js
git -c user.email=edtsue@gmail.com commit -m "feat: add server-side sticky-note HTML sanitiser"
```

---

### Task 3: Notes store

All Redis logic and every timestamp decision live here. The store takes its Redis client and its clock as arguments, which is what makes both testable without a network or a real clock — and is what makes the spec's "storage is swappable" claim true rather than aspirational.

**Files:**
- Create: `lib/notes-store.js`
- Test: `test/notes-store.test.js`

**Interfaces:**
- Consumes: `@upstash/redis` (Task 1)
- Produces:
  - `makeStore(redis, now?) => store` — factory for tests
  - `getStore() => store` — singleton reading env vars, used by `api/notes.js`
  - `store.list() => Promise<{notes: Note[], trash: Note[]}>`
  - `store.create(data) => Promise<Note>`
  - `store.update(id, patch) => Promise<Note|null>`
  - `store.bury(id) => Promise<Note|null>` — returns the buried note (with the server's `deletedAt`) so callers never invent a timestamp
  - `store.restore(id) => Promise<Note|null>`
  - `store.purge(id) => Promise<boolean>`
  - `store.purgeAll() => Promise<boolean>`
  - `Note = {id, html, text, anchor, ax, ay, section, color, created, updated, deletedAt}`

- [ ] **Step 1: Write the failing test**

Create `test/notes-store.test.js`. The fake implements only the five Redis commands the store uses:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStore } from '../lib/notes-store.js';

function fakeRedis() {
  const db = new Map(); // key -> Map(field -> string)
  const h = k => db.get(k) || new Map();
  return {
    db,
    async hgetall(k) {
      const m = db.get(k);
      if (!m || m.size === 0) return null; // upstash returns null for missing
      return Object.fromEntries(m);
    },
    async hget(k, f) { return h(k).get(f) ?? null; },
    async hset(k, obj) {
      const m = db.get(k) || new Map();
      for (const [f, v] of Object.entries(obj)) m.set(f, v);
      db.set(k, m);
      return 1;
    },
    async hdel(k, f) { const m = h(k); const had = m.delete(f); db.set(k, m); return had ? 1 : 0; },
    async del(k) { return db.delete(k) ? 1 : 0; },
  };
}

const seed = { html: '<b>x</b>', text: 'x', anchor: '#a', ax: 0.5, ay: 0.5, section: '06', color: 'yellow' };

test('create stamps server timestamps and returns an id', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  const note = await store.create(seed);
  assert.ok(note.id);
  assert.equal(note.created, 1000);
  assert.equal(note.updated, 1000);
  assert.equal(note.deletedAt, null);
});

test('create ignores client-supplied timestamps and id', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  const note = await store.create({ ...seed, id: 'evil', created: 5, updated: 5, deletedAt: 7 });
  assert.notEqual(note.id, 'evil');
  assert.equal(note.created, 1000);
  assert.equal(note.deletedAt, null);
});

test('list returns created notes and an empty graveyard', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  await store.create(seed);
  const { notes, trash } = await store.list();
  assert.equal(notes.length, 1);
  assert.equal(trash.length, 0);
});

test('update bumps updated but preserves created', async () => {
  let t = 1000;
  const store = makeStore(fakeRedis(), () => t);
  const a = await store.create(seed);
  t = 2000;
  const b = await store.update(a.id, { text: 'changed' });
  assert.equal(b.text, 'changed');
  assert.equal(b.created, 1000);
  assert.equal(b.updated, 2000);
});

test('update of a missing id returns null', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  assert.equal(await store.update('nope', { text: 'x' }), null);
});

test('bury moves the note to the graveyard with deletedAt', async () => {
  let t = 1000;
  const store = makeStore(fakeRedis(), () => t);
  const a = await store.create(seed);
  t = 3000;
  const buried = await store.bury(a.id);
  assert.equal(buried.id, a.id);
  assert.equal(buried.deletedAt, 3000, 'bury must return the note carrying the server deletedAt');
  const { notes, trash } = await store.list();
  assert.equal(notes.length, 0);
  assert.equal(trash.length, 1);
  assert.equal(trash[0].id, a.id);
  assert.equal(trash[0].deletedAt, 3000);
  assert.equal(trash[0].created, 1000, 'burial must not touch created');
});

test('restore returns the note to the wall and clears deletedAt', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  const a = await store.create(seed);
  await store.bury(a.id);
  const back = await store.restore(a.id);
  assert.equal(back.id, a.id);
  assert.equal(back.deletedAt, null);
  const { notes, trash } = await store.list();
  assert.equal(notes.length, 1);
  assert.equal(trash.length, 0);
});

test('restore is idempotent when the note is already live', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  const a = await store.create(seed);
  const back = await store.restore(a.id);
  assert.equal(back.id, a.id);
  const { notes } = await store.list();
  assert.equal(notes.length, 1, 'must not duplicate the note');
});

test('restore of an unknown id returns null', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  assert.equal(await store.restore('nope'), null);
});

test('bury of a missing id returns null', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  assert.equal(await store.bury('nope'), null);
});

test('bury is not a hard delete — purge is', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  const a = await store.create(seed);
  await store.bury(a.id);
  assert.equal(await store.purge(a.id), true);
  const { trash } = await store.list();
  assert.equal(trash.length, 0);
  assert.equal(await store.restore(a.id), null, 'purged notes are gone for good');
});

test('purgeAll empties the graveyard and leaves the wall alone', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  const live = await store.create(seed);
  const dead = await store.create(seed);
  await store.bury(dead.id);
  await store.purgeAll();
  const { notes, trash } = await store.list();
  assert.equal(trash.length, 0);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, live.id);
});

test('tolerates values already deserialised by the client', async () => {
  const redis = fakeRedis();
  const store = makeStore(redis, () => 1000);
  const a = await store.create(seed);
  // Simulate @upstash/redis auto-parsing JSON on read
  redis.db.get('sys:notes').set(a.id, JSON.parse(redis.db.get('sys:notes').get(a.id)));
  const { notes } = await store.list();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, a.id);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/notes-store.test.js`
Expected: FAIL — cannot find module `../lib/notes-store.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/notes-store.js`:

```js
/* ════════════════════════════════════════════════════════════════════
   Sticky-note storage — two Upstash Redis hashes.

     sys:notes        live notes      field = id, value = JSON
     sys:notes:trash  the graveyard   same shape, deletedAt set

   Hashes (not one JSON blob) because HSET/HDEL are atomic per field: two
   reviewers adding notes at the same moment cannot clobber each other.

   Deleting is a burial, never a destruction — only purge()/purgeAll()
   actually remove data, and the graveyard has no TTL. A graveyard that
   quietly empties itself would break the only promise the feature makes.

   Timestamps are stamped HERE from the injected clock, never taken from the
   client: browser clocks skew, which would yield notes created in the future
   and a graveyard that sorts wrong.
   ════════════════════════════════════════════════════════════════════ */
import { Redis } from '@upstash/redis';

const LIVE = 'sys:notes';
const TRASH = 'sys:notes:trash';

// Fields a client is allowed to write. Anything else (id, created, updated,
// deletedAt) is server-owned and silently dropped.
const WRITABLE = ['html', 'text', 'anchor', 'ax', 'ay', 'section', 'color'];

const newId = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

// @upstash/redis may auto-parse JSON on read; tolerate both shapes.
const parse = v => (typeof v === 'string' ? JSON.parse(v) : v);
const rows = hash => (hash ? Object.values(hash).map(parse) : []);

const pick = data => {
  const out = {};
  for (const k of WRITABLE) if (data[k] !== undefined) out[k] = data[k];
  return out;
};

export function makeStore(redis, now = () => Date.now()) {
  const put = (key, note) => redis.hset(key, { [note.id]: JSON.stringify(note) });
  const read = async (key, id) => {
    const raw = await redis.hget(key, id);
    return raw ? parse(raw) : null;
  };

  return {
    async list() {
      const [live, dead] = await Promise.all([redis.hgetall(LIVE), redis.hgetall(TRASH)]);
      return {
        notes: rows(live).sort((a, b) => a.created - b.created),
        trash: rows(dead).sort((a, b) => b.deletedAt - a.deletedAt), // newest burial first
      };
    },

    async create(data) {
      const t = now();
      const note = {
        id: newId(),
        html: '', text: '', anchor: '', ax: 0.5, ay: 0.5, section: '', color: 'yellow',
        ...pick(data),
        created: t, updated: t, deletedAt: null,
      };
      await put(LIVE, note);
      return note;
    },

    async update(id, patch) {
      const note = await read(LIVE, id);
      if (!note) return null;
      const next = { ...note, ...pick(patch), updated: now() };
      await put(LIVE, next);
      return next;
    },

    async bury(id) {
      const note = await read(LIVE, id);
      if (!note) return null;
      // Return the buried note so the caller renders the SERVER's deletedAt
      // instead of inventing one from a browser clock.
      const dead = { ...note, deletedAt: now() };
      await put(TRASH, dead);
      await redis.hdel(LIVE, id);
      return dead;
    },

    async restore(id) {
      // Idempotent: a double-click or a second reviewer must not duplicate it.
      const live = await read(LIVE, id);
      if (live) return live;
      const note = await read(TRASH, id);
      if (!note) return null;
      const next = { ...note, deletedAt: null, updated: now() };
      await put(LIVE, next);
      await redis.hdel(TRASH, id);
      return next;
    },

    async purge(id) {
      return (await redis.hdel(TRASH, id)) > 0;
    },

    async purgeAll() {
      await redis.del(TRASH);
      return true;
    },
  };
}

let singleton;
export function getStore() {
  if (!singleton) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) throw new Error('Upstash Redis env vars are missing');
    singleton = makeStore(new Redis({ url, token }));
  }
  return singleton;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/notes-store.test.js`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/notes-store.js test/notes-store.test.js
git -c user.email=edtsue@gmail.com commit -m "feat: add notes store with graveyard and server-stamped timestamps"
```

---

### Task 4: API dispatcher

**Files:**
- Create: `api/notes.js`
- Test: `test/notes-api.test.js`

**Interfaces:**
- Consumes: `sanitizeNoteHtml` (Task 2), `makeStore` / `getStore` (Task 3)
- Produces: `handler(req, res)` default export; named export `makeHandler(store)` for tests.
- HTTP contract consumed by the client in Tasks 6–9:
  - `GET` → `{notes, trash}`
  - `POST {html, text, anchor, ax, ay, section, color}` → `{note}`
  - `PATCH {id, ...fields}` → `{note}`
  - `PATCH {id, restore: true}` → `{note}`
  - `DELETE {id}` → `{ok: true, note}` (burial; `note` carries the server's `deletedAt`)
  - `DELETE {id, purge: true}` → `{ok: true}`
  - `DELETE {purgeAll: true}` → `{ok: true}`

- [ ] **Step 1: Write the failing test**

Create `test/notes-api.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler } from '../api/notes.js';
import { makeStore } from '../lib/notes-store.js';

function fakeRedis() {
  const db = new Map();
  const h = k => db.get(k) || new Map();
  return {
    async hgetall(k) { const m = db.get(k); return !m || !m.size ? null : Object.fromEntries(m); },
    async hget(k, f) { return h(k).get(f) ?? null; },
    async hset(k, obj) { const m = db.get(k) || new Map(); for (const [f, v] of Object.entries(obj)) m.set(f, v); db.set(k, m); return 1; },
    async hdel(k, f) { const m = h(k); const had = m.delete(f); db.set(k, m); return had ? 1 : 0; },
    async del(k) { return db.delete(k) ? 1 : 0; },
  };
}

function fakeRes() {
  return {
    code: 200, body: null, headers: {},
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

const call = async (handler, method, body) => {
  const res = fakeRes();
  await handler({ method, body, headers: {} }, res);
  return res;
};

const newHandler = () => makeHandler(makeStore(fakeRedis(), () => 1000));
const seed = { html: 'x', text: 'x', anchor: '#a', ax: 0.5, ay: 0.5, section: '06', color: 'yellow' };

test('GET returns notes and trash', async () => {
  const h = newHandler();
  const res = await call(h, 'GET');
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { notes: [], trash: [] });
});

test('unknown method returns 405', async () => {
  const res = await call(newHandler(), 'PUT');
  assert.equal(res.code, 405);
});

test('POST creates a note and sanitises its html', async () => {
  const res = await call(newHandler(), 'POST', { ...seed, html: 'hi<script>alert(1)</script>' });
  assert.equal(res.code, 200);
  assert.equal(res.body.note.html, 'hi');
  assert.equal(res.body.note.created, 1000);
});

test('POST parses a string body', async () => {
  const res = await call(newHandler(), 'POST', JSON.stringify(seed));
  assert.equal(res.code, 200);
  assert.ok(res.body.note.id);
});

test('PATCH sanitises html on update too', async () => {
  const h = newHandler();
  const made = await call(h, 'POST', seed);
  const res = await call(h, 'PATCH', { id: made.body.note.id, html: '<b>ok</b><script>bad()</script>' });
  assert.equal(res.body.note.html, '<b>ok</b>');
});

test('PATCH without an id returns 400', async () => {
  const res = await call(newHandler(), 'PATCH', { html: 'x' });
  assert.equal(res.code, 400);
});

test('PATCH of a missing note returns 404', async () => {
  const res = await call(newHandler(), 'PATCH', { id: 'nope', html: 'x' });
  assert.equal(res.code, 404);
});

test('DELETE buries rather than destroys, and echoes the server deletedAt', async () => {
  const h = newHandler();
  const made = await call(h, 'POST', seed);
  const del = await call(h, 'DELETE', { id: made.body.note.id });
  assert.equal(del.code, 200);
  assert.equal(del.body.note.id, made.body.note.id);
  assert.equal(del.body.note.deletedAt, 1000, 'client must not have to invent a burial time');
  const list = await call(h, 'GET');
  assert.equal(list.body.notes.length, 0);
  assert.equal(list.body.trash.length, 1, 'the note must still exist in the graveyard');
});

test('PATCH restore brings a buried note back', async () => {
  const h = newHandler();
  const made = await call(h, 'POST', seed);
  await call(h, 'DELETE', { id: made.body.note.id });
  const res = await call(h, 'PATCH', { id: made.body.note.id, restore: true });
  assert.equal(res.code, 200);
  assert.equal(res.body.note.deletedAt, null);
  const list = await call(h, 'GET');
  assert.equal(list.body.notes.length, 1);
  assert.equal(list.body.trash.length, 0);
});

test('DELETE purge destroys a buried note', async () => {
  const h = newHandler();
  const made = await call(h, 'POST', seed);
  await call(h, 'DELETE', { id: made.body.note.id });
  await call(h, 'DELETE', { id: made.body.note.id, purge: true });
  const list = await call(h, 'GET');
  assert.equal(list.body.trash.length, 0);
});

test('DELETE purgeAll empties the graveyard only', async () => {
  const h = newHandler();
  const live = await call(h, 'POST', seed);
  const dead = await call(h, 'POST', seed);
  await call(h, 'DELETE', { id: dead.body.note.id });
  await call(h, 'DELETE', { purgeAll: true });
  const list = await call(h, 'GET');
  assert.equal(list.body.trash.length, 0);
  assert.equal(list.body.notes.length, 1);
  assert.equal(list.body.notes[0].id, live.body.note.id);
});

test('client-supplied timestamps are ignored', async () => {
  const res = await call(newHandler(), 'POST', { ...seed, created: 5, updated: 5, deletedAt: 9 });
  assert.equal(res.body.note.created, 1000);
  assert.equal(res.body.note.deletedAt, null);
});

test('responses are marked no-store', async () => {
  const res = await call(newHandler(), 'GET');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/notes-api.test.js`
Expected: FAIL — cannot find module `../api/notes.js`.

- [ ] **Step 3: Write the implementation**

Create `api/notes.js`:

```js
/* ════════════════════════════════════════════════════════════════════
   /api/notes — sticky notes CRUD.

     GET                         → { notes, trash }
     POST   {html,text,anchor,ax,ay,section,color}  → { note }
     PATCH  {id, ...fields}      → { note }
     PATCH  {id, restore:true}   → { note }   graveyard → wall
     DELETE {id}                 → { ok, note }  wall → graveyard (NOT a delete)
     DELETE {id, purge:true}     → { ok }     gone for good
     DELETE {purgeAll:true}      → { ok }     empty the graveyard

   No auth here on purpose: middleware.js already gates every route except
   /api/gate, so reaching this handler means the gate cookie checked out.
   NOTE: the gate fails open — if YTST_GATE is unset the site, and therefore
   this endpoint, is public.

   All note HTML is sanitised on write (POST and PATCH). Timestamps come from
   the store, never from the request body.
   ════════════════════════════════════════════════════════════════════ */
import { getStore } from '../lib/notes-store.js';
import { sanitizeNoteHtml } from '../lib/sanitize.js';

const readBody = req => {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
};

const clean = data => (data.html === undefined ? data : { ...data, html: sanitizeNoteHtml(data.html) });

export function makeHandler(store) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const body = readBody(req);

    try {
      if (req.method === 'GET') {
        return res.status(200).json(await store.list());
      }

      if (req.method === 'POST') {
        return res.status(200).json({ note: await store.create(clean(body)) });
      }

      if (req.method === 'PATCH') {
        if (!body.id) return res.status(400).json({ error: 'id required' });
        const note = body.restore
          ? await store.restore(body.id)
          : await store.update(body.id, clean(body));
        if (!note) return res.status(404).json({ error: 'not found' });
        return res.status(200).json({ note });
      }

      if (req.method === 'DELETE') {
        if (body.purgeAll) return res.status(200).json({ ok: await store.purgeAll() });
        if (!body.id) return res.status(400).json({ error: 'id required' });

        if (body.purge) {
          if (!(await store.purge(body.id))) return res.status(404).json({ error: 'not found' });
          return res.status(200).json({ ok: true });
        }

        // Burial echoes the note back so the client can show the server's
        // deletedAt rather than stamping one from an unreliable browser clock.
        const note = await store.bury(body.id);
        if (!note) return res.status(404).json({ error: 'not found' });
        return res.status(200).json({ ok: true, note });
      }

      return res.status(405).json({ error: 'method' });
    } catch (err) {
      return res.status(500).json({ error: String(err.message || err) });
    }
  };
}

export default function handler(req, res) {
  return makeHandler(getStore())(req, res);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/notes-api.test.js`
Expected: PASS — 13 tests.

- [ ] **Step 5: Run the whole suite**

Run: `node --test test/*.test.js`

Note the glob: `node --test test/` fails on Node 24 (it tries to resolve the
directory as a module). Use the glob form.
Expected: PASS — 34 tests across three files.

- [ ] **Step 6: Commit**

```bash
git add api/notes.js test/notes-api.test.js
git -c user.email=edtsue@gmail.com commit -m "feat: add /api/notes dispatcher with burial, restore and purge"
```

---

### Task 5: Live API smoke test

Unit tests proved the logic against a fake. This proves the wiring against real Redis — the first point where a bad env var or a missing integration will show up.

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

```bash
vercel dev --listen 3000
```

Note: `YTST_GATE` is not set in Development, so the gate is open locally and you can curl the endpoint directly.

- [ ] **Step 2: Create a note against real Redis**

```bash
curl -s -X POST localhost:3000/api/notes -H 'content-type: application/json' \
  -d '{"html":"<b>smoke</b><script>x</script>","text":"smoke","anchor":"#hero","ax":0.5,"ay":0.5,"section":"01","color":"yellow"}'
```

Expected: `{"note":{...}}` with a real `id`, `created`/`updated` as epoch ms, `deletedAt: null`, and `html` equal to `<b>smoke</b>` — the script stripped.

**If this returns a 500 about missing env vars, Task 1 did not actually provision.** Fix that before continuing.

- [ ] **Step 3: Verify burial and restore round-trip**

Using the id from Step 2:

```bash
ID=<paste-id>
curl -s -X DELETE localhost:3000/api/notes -H 'content-type: application/json' -d "{\"id\":\"$ID\"}"
curl -s localhost:3000/api/notes | head -c 400
```

Expected: the note is absent from `notes` and present in `trash` with a numeric `deletedAt`.

```bash
curl -s -X PATCH localhost:3000/api/notes -H 'content-type: application/json' -d "{\"id\":\"$ID\",\"restore\":true}"
curl -s localhost:3000/api/notes | head -c 400
```

Expected: back in `notes`, `deletedAt: null`, `trash` empty.

- [ ] **Step 4: Clean up the smoke note**

```bash
curl -s -X DELETE localhost:3000/api/notes -H 'content-type: application/json' -d "{\"id\":\"$ID\"}"
curl -s -X DELETE localhost:3000/api/notes -H 'content-type: application/json' -d '{"purgeAll":true}'
```

Expected: `{"ok":true}` from both; a final GET shows empty `notes` and `trash`.

---

### Task 6: Notes layer, toggle button and anchoring

The client's foundation: the overlay, the toggle, dropping a note, and keeping it stuck to its element. No editing yet — that is Task 7.

**Files:**
- Create: `notes.css`
- Create: `notes.js`
- Modify: `index.html` (two lines, before `</body>`)

**Interfaces:**
- Consumes: the HTTP contract from Task 4.
- Produces (module-internal, used by Tasks 7–8): `state.notes`, `state.trash`, `render()`, `api(method, body)`, `selectorFor(el)`, `sectionFor(el)`, `resolve(note)`, `saveNote(note)`.

- [ ] **Step 1: Write the stylesheet**

Create `notes.css`:

```css
/* ════════════════════════════════════════════════════════════════════
   Sticky notes — overlay layer, toggle, and the notes themselves.
   Off by default: a cold load must look like a clean pitch.
   ════════════════════════════════════════════════════════════════════ */
.sn-layer {
  position: absolute; inset: 0 auto auto 0;
  width: 100%; height: 100%;
  pointer-events: none; z-index: 9000;
  display: none;
}
.sn-on .sn-layer { display: block; }

.sn-toggle {
  position: fixed; right: 18px; bottom: 18px; z-index: 9100;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 14px; border: 0; border-radius: 999px;
  background: #ffd400; color: #1a1a1a; cursor: pointer;
  font: 700 13px/1 'Archivo', system-ui, sans-serif; letter-spacing: .04em;
  box-shadow: 0 6px 20px rgba(0,0,0,.45);
}
.sn-toggle__count {
  min-width: 18px; padding: 2px 5px; border-radius: 999px;
  background: rgba(0,0,0,.28); font-size: 11px;
}
.sn-add {
  position: fixed; right: 18px; bottom: 66px; z-index: 9100;
  padding: 8px 12px; border: 0; border-radius: 999px;
  background: #1a1a1a; color: #fff; cursor: pointer;
  font: 700 12px/1 'Archivo', system-ui, sans-serif;
  display: none;
}
.sn-on .sn-add { display: inline-block; }
.sn-add[aria-pressed="true"] { background: #d92d20; }

/* Arming placement: the page goes inert so the next click lands a note
   instead of firing a nav link or the FAQ modal. */
.sn-arming, .sn-arming * { cursor: crosshair !important; }

.sn-note {
  position: absolute; width: 190px; min-height: 96px;
  padding: 10px 10px 6px; border-radius: 2px;
  background: #ffe94d; color: #1a1a1a;
  font: 400 14px/1.35 'Archivo', system-ui, sans-serif;
  box-shadow: 0 8px 18px rgba(0,0,0,.4);
  transform: rotate(-1.4deg); transform-origin: top left;
  pointer-events: auto;
}
.sn-note--pink   { background: #ffb3c8; }
.sn-note--blue   { background: #a8d5ff; }
.sn-note--green  { background: #b6e8b6; }
.sn-note--orange { background: #ffcc8f; }

.sn-note__body {
  min-height: 44px; outline: 0; word-break: break-word;
  overflow-y: auto; /* a resized note must scroll, not spill past its edge */
}
.sn-note__body:empty::before { content: 'Type a note…'; opacity: .45; }
.sn-note__foot {
  margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(0,0,0,.14);
  font-size: 10px; letter-spacing: .02em; opacity: .6;
  display: flex; justify-content: space-between; gap: 6px;
}
.sn-note__del {
  border: 0; background: none; cursor: pointer;
  font-size: 13px; line-height: 1; opacity: .5; padding: 0 2px;
}
.sn-note__del:hover { opacity: 1; }
.sn-note__grip { cursor: grab; }
.sn-note--dragging { cursor: grabbing; opacity: .85; }
.sn-note--unsaved { outline: 2px solid #d92d20; }

/* Resize handle — bottom-right corner, drawn as two diagonal rules. */
.sn-note__resize {
  position: absolute; right: 0; bottom: 0; width: 16px; height: 16px;
  cursor: nwse-resize; opacity: .45;
  background:
    linear-gradient(135deg, transparent 0 45%, rgba(0,0,0,.55) 45% 55%, transparent 55%),
    linear-gradient(135deg, transparent 0 70%, rgba(0,0,0,.55) 70% 80%, transparent 80%);
}
.sn-note__resize:hover { opacity: .9; }
.sn-note--resizing { user-select: none; }
```

- [ ] **Step 2: Write the client foundation**

Create `notes.js`:

```js
/* ════════════════════════════════════════════════════════════════════
   Sticky notes — client layer.

   Self-contained: shares no state with app.js, and touches the page only
   through elementFromPoint / getBoundingClientRect.

   Anchoring: a note stores a CSS selector for the element it was dropped on
   plus ax/ay as FRACTIONS of that element's box. Fractions are what survive
   reflow — a raw pixel position drifts off its target on a narrow window.
   ════════════════════════════════════════════════════════════════════ */
(() => {
  const state = { on: false, arming: false, notes: [], trash: [], orphans: [] };
  let layer, toggle, addBtn, countEl;

  /* ── api ─────────────────────────────────────────────────────────── */
  async function api(method, body) {
    const res = await fetch('/api/notes', {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ct = res.headers.get('content-type') || '';
    // The gate REWRITES unauthenticated requests to gate.html: HTML, status
    // 200. Parsing that as JSON would throw a confusing error, so name it.
    if (!ct.includes('application/json')) throw new Error('gate');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'request failed');
    return data;
  }

  /* ── anchoring ───────────────────────────────────────────────────── */
  function selectorFor(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node !== document.body) {
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      const parent = node.parentElement;
      if (!parent) break;
      const i = [...parent.children].indexOf(node) + 1;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${i})`);
      node = parent;
    }
    return parts.join(' > ') || 'body';
  }

  function sectionFor(el) {
    const sec = el.closest('section, header, footer');
    if (!sec) return '';
    const eyebrow = sec.querySelector('[class$="__eyebrow"]');
    return (eyebrow?.textContent || sec.id || '').trim().slice(0, 40);
  }

  const resolve = note => {
    try { return document.querySelector(note.anchor); } catch { return null; }
  };

  /* ── positioning ─────────────────────────────────────────────────── */
  function place(el, note) {
    const target = resolve(note);
    if (!target) return false;
    const r = target.getBoundingClientRect();
    el.style.left = `${r.left + window.scrollX + r.width * note.ax}px`;
    el.style.top = `${r.top + window.scrollY + r.height * note.ay}px`;
    return true;
  }

  /* ── render ──────────────────────────────────────────────────────── */
  function noteEl(note) {
    const el = document.createElement('div');
    el.className = 'sn-note' + (note.color && note.color !== 'yellow' ? ` sn-note--${note.color}` : '');
    el.dataset.id = note.id;
    el.innerHTML = `
      <div class="sn-note__body" contenteditable="true"></div>
      <div class="sn-note__foot">
        <span class="sn-note__grip" title="Drag to move">⠿ <span class="sn-note__time"></span></span>
        <button class="sn-note__del" title="Move to graveyard" aria-label="Delete note">✕</button>
      </div>`;
    el.querySelector('.sn-note__body').innerHTML = note.html || '';
    el.querySelector('.sn-note__time').textContent = stamp(note);
    el.querySelector('.sn-note__time').title = new Date(note.created).toLocaleString();
    return el;
  }

  const fmt = t => new Date(t).toLocaleString(undefined,
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const stamp = note => fmt(note.created) + (note.updated > note.created ? ' · edited' : '');

  function render() {
    layer.textContent = '';
    state.orphans = [];
    for (const note of state.notes) {
      const el = noteEl(note);
      layer.appendChild(el);
      if (!place(el, note)) { el.remove(); state.orphans.push(note); }
    }
    countEl.textContent = String(state.notes.length);
  }

  const reposition = () => {
    for (const el of layer.children) {
      const note = state.notes.find(n => n.id === el.dataset.id);
      if (note) place(el, note);
    }
  };

  /* ── persistence ─────────────────────────────────────────────────── */
  async function saveNote(note, el) {
    try {
      await api('PATCH', { id: note.id, html: note.html, text: note.text,
        anchor: note.anchor, ax: note.ax, ay: note.ay, color: note.color });
      el?.classList.remove('sn-note--unsaved');
    } catch (err) {
      // Never discard typed text: mark it and let the next edit retry.
      el?.classList.add('sn-note--unsaved');
      if (err.message === 'gate') banner('Session expired — reload to keep saving.');
    }
  }

  function banner(msg) {
    let b = document.querySelector('.sn-banner');
    if (!b) {
      b = document.createElement('div');
      b.className = 'sn-banner';
      b.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9200;' +
        'background:#d92d20;color:#fff;padding:8px 14px;border-radius:6px;font:700 12px Archivo,sans-serif';
      document.body.appendChild(b);
    }
    b.textContent = msg;
  }

  /* ── placing ─────────────────────────────────────────────────────── */
  function arm(on) {
    state.arming = on;
    addBtn.setAttribute('aria-pressed', String(on));
    document.body.classList.toggle('sn-arming', on);
  }

  async function drop(x, y) {
    layer.style.pointerEvents = 'none';
    const target = document.elementFromPoint(x, y);
    layer.style.pointerEvents = '';
    if (!target || target.closest('.sn-toggle, .sn-add, .sn-note')) return;

    const r = target.getBoundingClientRect();
    const draft = {
      html: '', text: '',
      anchor: selectorFor(target),
      ax: r.width ? (x - r.left) / r.width : 0.5,
      ay: r.height ? (y - r.top) / r.height : 0.5,
      section: sectionFor(target),
      color: 'yellow',
    };
    try {
      const { note } = await api('POST', draft);
      state.notes.push(note);
      render();
      layer.querySelector(`[data-id="${note.id}"] .sn-note__body`)?.focus();
    } catch (err) {
      banner(err.message === 'gate' ? 'Session expired — reload.' : 'Could not save note.');
    }
  }

  /* ── boot ────────────────────────────────────────────────────────── */
  async function load() {
    try {
      const data = await api('GET');
      state.notes = data.notes;
      state.trash = data.trash;
      render();
    } catch (err) {
      banner(err.message === 'gate' ? 'Session expired — reload.' : 'Could not load notes.');
    }
  }

  function init() {
    layer = document.createElement('div');
    layer.className = 'sn-layer';
    document.body.appendChild(layer);

    toggle = document.createElement('button');
    toggle.className = 'sn-toggle';
    toggle.innerHTML = 'Notes <span class="sn-toggle__count">0</span>';
    countEl = toggle.querySelector('.sn-toggle__count');
    document.body.appendChild(toggle);

    addBtn = document.createElement('button');
    addBtn.className = 'sn-add';
    addBtn.textContent = '+ Add';
    addBtn.setAttribute('aria-pressed', 'false');
    document.body.appendChild(addBtn);

    // Nothing is fetched until the user opens the layer. A client loading the
    // pitch must not pay a network request for a feature they never open —
    // cold-load weight on this site is hard-won.
    toggle.addEventListener('click', () => {
      state.on = !state.on;
      document.body.classList.toggle('sn-on', state.on);
      if (state.on) load(); else arm(false);
    });

    addBtn.addEventListener('click', () => arm(!state.arming));

    // Capture phase: while arming, the page must not react to the click.
    document.addEventListener('click', e => {
      if (!state.arming) return;
      if (e.target.closest('.sn-add, .sn-toggle')) return;
      e.preventDefault();
      e.stopPropagation();
      arm(false);
      drop(e.clientX, e.clientY);
    }, true);

    document.addEventListener('keydown', e => { if (e.key === 'Escape') arm(false); });

    // Delete → burial, not destruction.
    layer.addEventListener('click', async e => {
      const btn = e.target.closest('.sn-note__del');
      if (!btn) return;
      const id = btn.closest('.sn-note').dataset.id;
      try {
        // The response carries the server's deletedAt — never stamp it here.
        const { note: dead } = await api('DELETE', { id });
        state.notes = state.notes.filter(n => n.id !== id);
        state.trash.unshift(dead);
        render();
      } catch { banner('Could not delete note.'); }
    });

    let raf;
    const onLayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(reposition); };
    addEventListener('resize', onLayout);
    new ResizeObserver(onLayout).observe(document.body);
    document.fonts?.ready.then(onLayout);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
```

- [ ] **Step 3: Wire it into the page**

In `index.html`, add the stylesheet next to the existing `styles.css` link:

```html
<link rel="stylesheet" href="notes.css" />
```

and the script immediately before `</body>`:

```html
<script src="notes.js"></script>
```

- [ ] **Step 4: Verify in the browser**

With `vercel dev` running, open `localhost:3000` and check, in order:

1. **Cold load shows no notes** — only the yellow "Notes 0" button bottom-right. This is the client-facing guarantee; if notes are visible on load, stop and fix it.
   Also open devtools → Network, hard-reload, and confirm **NO request to `/api/notes` is made on page load.** The fetch must happen only when the layer is opened. A client viewing the pitch must not pay for a feature they never open.
2. Click **Notes** → the "+ Add" button appears.
3. Click **+ Add** → cursor becomes a crosshair.
4. Click the "06 · The wishlist" heading → a sticky appears there and takes focus. **The page must not navigate or open a modal.**
5. Reload → click **Notes** → the sticky is back in the same place.
6. Narrow the window to ~380px → the sticky tracks its heading rather than drifting away.
7. Click `✕` → the sticky disappears; `curl -s localhost:3000/api/notes` shows it in `trash`, not gone.

- [ ] **Step 5: Commit**

```bash
git add notes.js notes.css index.html
git -c user.email=edtsue@gmail.com commit -m "feat: add sticky notes layer, toggle and element anchoring"
```

---

### Task 7: Rich text, paper colour, drag, resize

**Files:**
- Modify: `notes.js` (extend `noteEl`, add toolbar + drag + resize handlers)
- Modify: `notes.css` (toolbar + resize-handle styles)
- Modify: `lib/notes-store.js` (allow `w`/`h` through the writable allowlist)
- Modify: `test/notes-store.test.js` (cover `w`/`h`)

**Interfaces:**
- Consumes: `state`, `render`, `saveNote`, `place` (Task 6); `PATCH {id, html, text, color, anchor, ax, ay, w, h}` (Task 4).
- Produces: toolbar + resize handle markup inside `.sn-note`; no new exports.

- [ ] **Step 0: Let the store persist note size**

A resized note must stay resized after reload, so `w`/`h` need to be writable fields. In `lib/notes-store.js`, extend the allowlist:

```js
const WRITABLE = ['html', 'text', 'anchor', 'ax', 'ay', 'section', 'color', 'w', 'h'];
```

Leave everything else in that file alone — `id`/`created`/`updated`/`deletedAt` stay server-owned.

Add this test to `test/notes-store.test.js`:

```js
test('w and h are writable and survive an update', async () => {
  const store = makeStore(fakeRedis(), () => 1000);
  const a = await store.create({ ...seed, w: 240, h: 180 });
  assert.equal(a.w, 240);
  assert.equal(a.h, 180);
  const b = await store.update(a.id, { w: 320 });
  assert.equal(b.w, 320);
  assert.equal(b.h, 180, 'unchanged dimensions must survive a partial update');
});
```

Run `node --test test/notes-store.test.js` — it must pass, and no existing test may break. Notes created before this change simply have no `w`/`h` and fall back to the CSS default size, which is why the client applies them conditionally in Step 2.

- [ ] **Step 1: Add toolbar styles**

Append to `notes.css`:

```css
.sn-note__bar {
  display: none; gap: 2px; flex-wrap: wrap;
  margin: -4px -4px 6px; padding: 4px;
  background: rgba(0,0,0,.06); border-radius: 3px;
}
.sn-note--active .sn-note__bar { display: flex; }
.sn-note__bar button {
  border: 0; background: none; cursor: pointer; border-radius: 2px;
  padding: 2px 5px; font: 700 11px/1 'Archivo', system-ui, sans-serif; color: #1a1a1a;
}
.sn-note__bar button:hover { background: rgba(0,0,0,.12); }
.sn-note__bar .sn-i { font-style: italic; }
.sn-note__bar .sn-u { text-decoration: underline; }
.sn-note__sw {
  width: 13px; height: 13px; padding: 0; border-radius: 50%;
  border: 1px solid rgba(0,0,0,.25) !important;
}
.sn-note__sep { width: 1px; margin: 2px 3px; background: rgba(0,0,0,.15); }
```

- [ ] **Step 2: Add the toolbar to the note markup**

In `notes.js`, replace the whole `noteEl` function from Task 6 with this version. The
toolbar becomes the note's first child, above the body:

```js
  const TOOLBAR = `
    <div class="sn-note__bar">
      <button data-cmd="bold" title="Bold">B</button>
      <button data-cmd="italic" class="sn-i" title="Italic">I</button>
      <button data-cmd="underline" class="sn-u" title="Underline">U</button>
      <span class="sn-note__sep"></span>
      <button class="sn-note__sw" data-fore="#1a1a1a" style="background:#1a1a1a" title="Ink"></button>
      <button class="sn-note__sw" data-fore="#d92d20" style="background:#d92d20" title="Red"></button>
      <button class="sn-note__sw" data-fore="#1d4ed8" style="background:#1d4ed8" title="Blue"></button>
      <button class="sn-note__sw" data-fore="#15803d" style="background:#15803d" title="Green"></button>
      <span class="sn-note__sep"></span>
      <button data-size="2" title="Small">A-</button>
      <button data-size="4" title="Normal">A</button>
      <button data-size="6" title="Large">A+</button>
      <span class="sn-note__sep"></span>
      <button data-cmd="removeFormat" title="Clear formatting">⌫</button>
      <span class="sn-note__sep"></span>
      <button class="sn-note__sw sn-note__paper" data-paper="yellow" style="background:#ffe94d" title="Yellow paper"></button>
      <button class="sn-note__sw sn-note__paper" data-paper="pink" style="background:#ffb3c8" title="Pink paper"></button>
      <button class="sn-note__sw sn-note__paper" data-paper="blue" style="background:#a8d5ff" title="Blue paper"></button>
      <button class="sn-note__sw sn-note__paper" data-paper="green" style="background:#b6e8b6" title="Green paper"></button>
      <button class="sn-note__sw sn-note__paper" data-paper="orange" style="background:#ffcc8f" title="Orange paper"></button>
    </div>`;

  function noteEl(note) {
    const el = document.createElement('div');
    el.className = 'sn-note' + (note.color && note.color !== 'yellow' ? ` sn-note--${note.color}` : '');
    el.dataset.id = note.id;
    el.innerHTML = TOOLBAR + `
      <div class="sn-note__body" contenteditable="true"></div>
      <div class="sn-note__foot">
        <span class="sn-note__grip" title="Drag to move">⠿ <span class="sn-note__time"></span></span>
        <button class="sn-note__del" title="Move to graveyard" aria-label="Delete note">✕</button>
      </div>
      <div class="sn-note__resize" title="Drag to resize"></div>`;
    // Applied only when set, so notes saved before resizing existed keep the
    // CSS default size instead of collapsing to 0.
    if (note.w) el.style.width = note.w + 'px';
    if (note.h) el.style.height = note.h + 'px';
    // innerHTML, not textContent: this html is already sanitised server-side.
    el.querySelector('.sn-note__body').innerHTML = note.html || '';
    el.querySelector('.sn-note__time').textContent = stamp(note);
    el.querySelector('.sn-note__time').title = new Date(note.created).toLocaleString();
    return el;
  }
```

- [ ] **Step 3: Wire the toolbar, focus, autosave, paste and drag**

Append inside `init()` in `notes.js`, after the existing delete handler:

```js
    // styleWithCSS makes execCommand emit spans instead of <font> where the
    // browser supports it. The server normalises <font> anyway, so this is
    // belt-and-braces rather than load-bearing.
    try { document.execCommand('styleWithCSS', false, true); } catch {}

    const noteOf = el => state.notes.find(n => n.id === el.dataset.id);
    const debounced = new Map();

    function queueSave(el) {
      const note = noteOf(el);
      if (!note) return;
      const body = el.querySelector('.sn-note__body');
      note.html = body.innerHTML;
      note.text = body.textContent;
      clearTimeout(debounced.get(note.id));
      debounced.set(note.id, setTimeout(() => saveNote(note, el), 500));
    }

    // Toolbar only on the focused note, so the wall stays quiet.
    layer.addEventListener('focusin', e => {
      const el = e.target.closest('.sn-note');
      for (const n of layer.children) n.classList.toggle('sn-note--active', n === el);
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.sn-note')) {
        for (const n of layer.children) n.classList.remove('sn-note--active');
      }
    });

    layer.addEventListener('input', e => {
      if (e.target.classList.contains('sn-note__body')) queueSave(e.target.closest('.sn-note'));
    });
    layer.addEventListener('focusout', e => {
      if (!e.target.classList.contains('sn-note__body')) return;
      const el = e.target.closest('.sn-note');
      const note = noteOf(el);
      if (note) { clearTimeout(debounced.get(note.id)); saveNote(note, el); }
    });

    // Paste as plain text — stops Word/web pastes dragging in junk markup.
    layer.addEventListener('paste', e => {
      if (!e.target.classList.contains('sn-note__body')) return;
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      document.execCommand('insertText', false, text);
    });

    layer.addEventListener('mousedown', e => {
      // Keep the caret in the body when a toolbar button is pressed.
      if (e.target.closest('.sn-note__bar')) e.preventDefault();
    });

    // Cancel a pending debounced save before this note gets buried. Without
    // this, typing then immediately clicking ✕ puts a PATCH and a DELETE in
    // flight together, and the late PATCH can resurrect the note into the live
    // hash while a copy sits in the graveyard. The store self-heals that on
    // read, but not racing in the first place is better. Capture phase so this
    // runs before the delete handler registered in Task 6.
    layer.addEventListener('click', e => {
      const btn = e.target.closest('.sn-note__del');
      if (!btn) return;
      const id = btn.closest('.sn-note').dataset.id;
      clearTimeout(debounced.get(id));
      debounced.delete(id);
    }, true);

    layer.addEventListener('click', e => {
      const el = e.target.closest('.sn-note');
      if (!el) return;
      const btn = e.target.closest('.sn-note__bar button');
      if (!btn) return;
      const body = el.querySelector('.sn-note__body');
      body.focus();

      if (btn.dataset.paper) {
        const note = noteOf(el);
        if (!note) return;
        note.color = btn.dataset.paper;
        el.className = 'sn-note sn-note--active' +
          (note.color !== 'yellow' ? ` sn-note--${note.color}` : '');
        saveNote(note, el);
        return;
      }
      if (btn.dataset.cmd) document.execCommand(btn.dataset.cmd);
      if (btn.dataset.fore) document.execCommand('foreColor', false, btn.dataset.fore);
      if (btn.dataset.size) document.execCommand('fontSize', false, btn.dataset.size);
      queueSave(el);
    });

    // Resize from the bottom-right corner. Size is per-note and persisted, so
    // a note stays the size you left it at.
    const MIN_W = 120, MIN_H = 80;
    let resize = null;
    layer.addEventListener('mousedown', e => {
      const h = e.target.closest('.sn-note__resize');
      if (!h) return;
      const el = h.closest('.sn-note');
      const r = el.getBoundingClientRect();
      resize = { el, x: e.clientX, y: e.clientY, w: r.width, h: r.height };
      el.classList.add('sn-note--resizing');
      e.preventDefault();
      e.stopPropagation();
    });
    addEventListener('mousemove', e => {
      if (!resize) return;
      resize.el.style.width = Math.max(MIN_W, resize.w + e.clientX - resize.x) + 'px';
      resize.el.style.height = Math.max(MIN_H, resize.h + e.clientY - resize.y) + 'px';
    });
    addEventListener('mouseup', () => {
      if (!resize) return;
      const { el } = resize;
      el.classList.remove('sn-note--resizing');
      resize = null;
      const note = noteOf(el);
      if (!note) return;
      note.w = Math.round(el.getBoundingClientRect().width);
      note.h = Math.round(el.getBoundingClientRect().height);
      saveNote(note, el);
    });

    // Drag by the grip; re-anchor to whatever it lands on.
    let drag = null;
    layer.addEventListener('mousedown', e => {
      const grip = e.target.closest('.sn-note__grip');
      if (!grip) return;
      const el = grip.closest('.sn-note');
      drag = { el, dx: e.clientX - el.getBoundingClientRect().left,
                   dy: e.clientY - el.getBoundingClientRect().top };
      el.classList.add('sn-note--dragging');
      e.preventDefault();
    });
    addEventListener('mousemove', e => {
      if (!drag) return;
      drag.el.style.left = `${e.clientX - drag.dx + window.scrollX}px`;
      drag.el.style.top = `${e.clientY - drag.dy + window.scrollY}px`;
    });
    addEventListener('mouseup', e => {
      if (!drag) return;
      const { el } = drag;
      el.classList.remove('sn-note--dragging');
      drag = null;
      const note = noteOf(el);
      if (!note) return;
      layer.style.pointerEvents = 'none';
      const target = document.elementFromPoint(e.clientX, e.clientY);
      layer.style.pointerEvents = '';
      // Re-anchor only to page content, never to the notes UI itself.
      if (!target || target.closest('.sn-note, .sn-toggle, .sn-add')) { place(el, note); return; }
      const r = target.getBoundingClientRect();
      note.anchor = selectorFor(target);
      note.ax = r.width ? (e.clientX - r.left) / r.width : 0.5;
      note.ay = r.height ? (e.clientY - r.top) / r.height : 0.5;
      place(el, note);
      saveNote(note, el);
    });
```

- [ ] **Step 4: Verify in the browser**

At `localhost:3000`, with a note open:

1. Focus a note → the toolbar appears; click away → it hides.
2. Type text, select it, click **B** → bold. Same for **I**, **U**.
3. Select text → click red swatch → red. Click **A+** → larger.
4. Click **⌫** with text selected → formatting clears.
5. Click a paper swatch → the sticky changes colour immediately.
6. **Reload → click Notes → all formatting and paper colour survived.** This is the real test: it proves the sanitiser kept what it should.
7. Copy formatted text from any web page, paste into a note → it arrives as **plain text**.
8. Drag a note by its grip onto a different heading → release → reload → it comes back anchored to the **new** heading.
8b. **Resize** a note from its bottom-right corner → it grows/shrinks, stops at the 120×80 minimum, and long text scrolls inside rather than spilling out. Reload → **it comes back the size you left it**.
8c. Resizing must NOT move the note, and dragging must NOT resize it — the two handles are independent.
9. Confirm `curl -s localhost:3000/api/notes` shows `html` containing only allowlisted tags — no `<font>`, no `<script>`.

- [ ] **Step 5: Commit**

```bash
git add notes.js notes.css
git -c user.email=edtsue@gmail.com commit -m "feat: sticky note rich text, paper colours and drag-to-reanchor"
```

---

### Task 8: The tray — Unanchored and Graveyard

One docked panel, two tabs. Both answer "what notes exist that I can't see?" — two floating trays would clutter a pitch site.

**Files:**
- Modify: `notes.js` (tray render + handlers)
- Modify: `notes.css` (tray styles)

**Interfaces:**
- Consumes: `state.orphans` (populated by `render()` in Task 6), `state.trash`, `api`, `render`, `fmt` (Task 6); `PATCH {id, restore:true}`, `DELETE {id, purge:true}`, `DELETE {purgeAll:true}` (Task 4).
- Produces: `renderTray()`, called at the end of `render()`.

- [ ] **Step 1: Add tray styles**

Append to `notes.css`:

```css
.sn-tray {
  position: fixed; left: 18px; bottom: 18px; z-index: 9100;
  width: 260px; max-height: 46vh; display: none;
  flex-direction: column; border-radius: 8px; overflow: hidden;
  background: #14161a; color: #e8edf5;
  border: 1px solid rgba(255,255,255,.14);
  box-shadow: 0 10px 30px rgba(0,0,0,.5);
  font: 400 12px/1.4 'Archivo', system-ui, sans-serif;
}
.sn-on .sn-tray { display: flex; }
.sn-tray__tabs { display: flex; border-bottom: 1px solid rgba(255,255,255,.12); }
.sn-tray__tab {
  flex: 1; padding: 8px 6px; border: 0; cursor: pointer;
  background: none; color: #98a2b3;
  font: 700 11px/1 'Archivo', system-ui, sans-serif; letter-spacing: .04em;
}
.sn-tray__tab[aria-selected="true"] { color: #ffd400; box-shadow: inset 0 -2px 0 #ffd400; }
.sn-tray__list { overflow-y: auto; padding: 6px; }
.sn-tray__item {
  padding: 7px; border-radius: 5px; margin-bottom: 5px;
  background: rgba(255,255,255,.05);
}
.sn-tray__txt { display: block; margin-bottom: 4px; word-break: break-word; }
.sn-tray__meta { display: block; font-size: 10px; opacity: .5; margin-bottom: 5px; }
.sn-tray__item button {
  border: 0; border-radius: 3px; cursor: pointer; padding: 3px 7px; margin-right: 4px;
  background: #ffd400; color: #1a1a1a; font: 700 10px/1 'Archivo', system-ui, sans-serif;
}
.sn-tray__item button.sn-ghost { background: rgba(255,255,255,.12); color: #e8edf5; }
.sn-tray__empty { padding: 14px 8px; text-align: center; opacity: .4; font-size: 11px; }
.sn-tray__foot { padding: 6px; border-top: 1px solid rgba(255,255,255,.12); }
.sn-tray__foot button {
  width: 100%; padding: 6px; border: 0; border-radius: 4px; cursor: pointer;
  background: rgba(217,45,32,.18); color: #ff8b83;
  font: 700 10px/1 'Archivo', system-ui, sans-serif;
}
```

- [ ] **Step 2: Build the tray**

Add to `notes.js`, before `init()`:

```js
  /* ── tray ────────────────────────────────────────────────────────── */
  let tray, tab = 'orphans';

  function trayItem(note, kind) {
    const when = kind === 'trash'
      ? `${fmt(note.created)} · buried ${fmt(note.deletedAt)}`
      : `${fmt(note.created)} · ${note.section || 'unknown section'}`;
    return `
      <div class="sn-tray__item" data-id="${note.id}">
        <span class="sn-tray__txt">${(note.text || '(empty note)').slice(0, 90)}</span>
        <span class="sn-tray__meta">${when}</span>
        ${kind === 'trash'
          ? `<button data-act="restore">Restore</button>
             <button data-act="purge" class="sn-ghost">Delete forever</button>`
          : `<button data-act="replace">Re-place</button>
             <button data-act="bury" class="sn-ghost">Bury</button>`}
      </div>`;
  }

  function renderTray() {
    if (!tray) return;
    const items = tab === 'trash' ? state.trash : state.orphans;
    const empty = tab === 'trash' ? 'The graveyard is empty.' : 'Every note is anchored.';
    tray.querySelector('[data-tab="orphans"]').textContent = `Unanchored ${state.orphans.length}`;
    tray.querySelector('[data-tab="trash"]').textContent = `Graveyard ${state.trash.length}`;
    for (const t of tray.querySelectorAll('.sn-tray__tab')) {
      t.setAttribute('aria-selected', String(t.dataset.tab === tab));
    }
    tray.querySelector('.sn-tray__list').innerHTML =
      items.length ? items.map(n => trayItem(n, tab === 'trash' ? 'trash' : 'orphans')).join('')
                   : `<div class="sn-tray__empty">${empty}</div>`;
    tray.querySelector('.sn-tray__foot').style.display = tab === 'trash' ? '' : 'none';
  }
```

Add `renderTray()` as the final line of `render()`, after `countEl.textContent = ...`:

```js
    countEl.textContent = String(state.notes.length);
    renderTray();
  }
```

- [ ] **Step 3: Mount the tray and wire its actions**

Add inside `init()`, after `addBtn` is appended:

```js
    tray = document.createElement('div');
    tray.className = 'sn-tray';
    tray.innerHTML = `
      <div class="sn-tray__tabs">
        <button class="sn-tray__tab" data-tab="orphans" aria-selected="true">Unanchored 0</button>
        <button class="sn-tray__tab" data-tab="trash" aria-selected="false">Graveyard 0</button>
      </div>
      <div class="sn-tray__list"></div>
      <div class="sn-tray__foot" style="display:none">
        <button data-act="purgeAll">Empty graveyard</button>
      </div>`;
    document.body.appendChild(tray);

    tray.addEventListener('click', async e => {
      const t = e.target.closest('.sn-tray__tab');
      if (t) { tab = t.dataset.tab; renderTray(); return; }

      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;

      if (act === 'purgeAll') {
        // The only irreversible action in the feature — confirm it.
        if (!confirm(`Permanently delete ${state.trash.length} buried note(s)? This cannot be undone.`)) return;
        try { await api('DELETE', { purgeAll: true }); state.trash = []; renderTray(); }
        catch { banner('Could not empty the graveyard.'); }
        return;
      }

      const id = btn.closest('.sn-tray__item').dataset.id;

      if (act === 'restore') {
        try {
          const { note } = await api('PATCH', { id, restore: true });
          state.trash = state.trash.filter(n => n.id !== id);
          state.notes.push(note);
          // If its anchor died while buried, render() drops it into Unanchored
          // rather than losing it.
          render();
        } catch { banner('Could not restore note.'); }
        return;
      }
      if (act === 'purge') {
        if (!confirm('Delete this note forever?')) return;
        try { await api('DELETE', { id, purge: true }); state.trash = state.trash.filter(n => n.id !== id); renderTray(); }
        catch { banner('Could not delete note.'); }
        return;
      }
      if (act === 'bury') {
        try {
          const { note: dead } = await api('DELETE', { id });
          state.notes = state.notes.filter(n => n.id !== id);
          state.trash.unshift(dead);
          render();
        } catch { banner('Could not bury note.'); }
        return;
      }
      if (act === 'replace') {
        const note = state.notes.find(n => n.id === id);
        if (!note) return;
        arm(true);
        // Next page click re-anchors this orphan instead of creating a new note.
        pendingReplace = note;
      }
    });
```

Add `let pendingReplace = null;` beside the `drag` declaration, and change the arming click handler in `init()` so a pending re-place wins:

```js
    document.addEventListener('click', e => {
      if (!state.arming) return;
      if (e.target.closest('.sn-add, .sn-toggle, .sn-tray')) return;
      e.preventDefault();
      e.stopPropagation();
      arm(false);
      if (pendingReplace) {
        const note = pendingReplace;
        pendingReplace = null;
        reanchor(note, e.clientX, e.clientY);
      } else {
        drop(e.clientX, e.clientY);
      }
    }, true);
```

And add `reanchor` beside `drop`:

```js
  async function reanchor(note, x, y) {
    layer.style.pointerEvents = 'none';
    const target = document.elementFromPoint(x, y);
    layer.style.pointerEvents = '';
    if (!target || target.closest('.sn-toggle, .sn-add, .sn-note, .sn-tray')) return;
    const r = target.getBoundingClientRect();
    note.anchor = selectorFor(target);
    note.ax = r.width ? (x - r.left) / r.width : 0.5;
    note.ay = r.height ? (y - r.top) / r.height : 0.5;
    note.section = sectionFor(target);
    render();
    try { await api('PATCH', { id: note.id, anchor: note.anchor, ax: note.ax, ay: note.ay, section: note.section }); }
    catch { banner('Could not re-place note.'); }
  }
```

- [ ] **Step 4: Verify in the browser**

At `localhost:3000`:

1. Click **Notes** → the tray appears bottom-left with two tabs.
2. Delete a note → **Graveyard** count rises; the note is listed with its created and buried times.
3. Click **Restore** → it returns to the wall in its original spot; Graveyard count drops.
4. **The orphan path** — delete a note anchored to `.wish__title`, then in devtools rename that element's class, then click Restore. Expected: the note restores and appears under **Unanchored**, *not* on the wall and *not* lost.
5. Click **Re-place** on the orphan → crosshair → click a heading → it lands there and sticks after reload.
6. Click **Empty graveyard** → a confirm appears. Cancel → nothing happens. Accept → graveyard empties, **wall untouched**.
7. Confirm a purged note cannot be restored: `curl -s localhost:3000/api/notes` shows it in neither list.

- [ ] **Step 5: Commit**

```bash
git add notes.js notes.css
git -c user.email=edtsue@gmail.com commit -m "feat: add notes tray with unanchored and graveyard tabs"
```

---

### Task 9: Live polling — see other reviewers' notes appear

The wall is shared, so a reviewer must see other people's notes without reloading. Polling, not websockets: Vercel functions are serverless (no long-lived connections) and Upstash's REST API has no pub/sub.

**Files:**
- Modify: `notes.js` (poll loop + merge)

**Interfaces:**
- Consumes: `state`, `render`, `api`, `load`, `debounced` (Tasks 6–8); `GET /api/notes` → `{notes, trash}` (Task 4).
- Produces: `startPolling()`, `stopPolling()`, `anyBusy()`.

**The trap this task exists to avoid:** `render()` does `layer.textContent = ''` and rebuilds every note. If a poll fires while someone is typing, it destroys their caret mid-sentence and can discard text that has not been saved yet. **The poll must stand down while anyone is editing** — correctness beats freshness. A note is "busy" if it holds focus or has a debounced save pending; while any note is busy, skip the cycle entirely and catch up on the next idle one.

- [ ] **Step 1: Add the poll loop**

Add to `notes.js`, before `init()`:

```js
  /* ── live polling ────────────────────────────────────────────────── */
  const POLL_MS = 10000;
  let pollTimer = null, lastSig = '';

  // Cheap change-detector: re-rendering unchanged data every 10s would flicker
  // the wall and fight with dragging.
  const sigOf = d => JSON.stringify([
    d.notes.map(n => [n.id, n.updated]),
    d.trash.map(t => [t.id, t.deletedAt]),
  ]);

  // Typing or an unflushed save = busy. Never blow away in-progress work.
  const anyBusy = () =>
    debounced.size > 0 || !!document.activeElement?.closest?.('.sn-note');

  async function poll() {
    if (!state.on || document.hidden || anyBusy()) return;
    try {
      const data = await api('GET');
      const sig = sigOf(data);
      if (sig === lastSig) return;          // nothing changed — don't re-render
      lastSig = sig;
      state.notes = data.notes;
      state.trash = data.trash;
      render();
    } catch {
      // Polling failures are silent on purpose: a broken tab must not nag the
      // user every 10 seconds. Real actions (add/edit/delete) still surface errors.
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(poll, POLL_MS);
  }
  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }
```

- [ ] **Step 2: Keep `lastSig` in step with local changes**

In `load()`, after `state.notes`/`state.trash` are assigned and before `render()`, add:

```js
      lastSig = sigOf(data);
```

This stops the first poll after a manual load from re-rendering identical data.

- [ ] **Step 3: Drive the loop from the toggle and tab visibility**

Replace the toggle handler added in Task 6 with:

```js
    toggle.addEventListener('click', () => {
      state.on = !state.on;
      document.body.classList.toggle('sn-on', state.on);
      if (state.on) { load(); startPolling(); }
      else { arm(false); stopPolling(); }
    });

    // A hidden tab must not burn Upstash quota. Resume on return, and poll once
    // immediately so the wall is current the moment you look at it.
    document.addEventListener('visibilitychange', () => {
      if (!state.on) return;
      if (document.hidden) stopPolling();
      else { startPolling(); poll(); }
    });
```

- [ ] **Step 4: Verify in the browser**

Open `localhost:3000` in **two side-by-side windows** (this needs two clients — one window cannot prove it).

1. Open the notes layer in both. In window A, add a note. Within ~10s it appears in **window B** without a reload.
2. In window B, delete a note. Within ~10s it disappears from **window A**'s wall and shows in its Graveyard.
3. **The important one — the busy guard.** In window A, click into a note and type continuously for ~30s. Your text must NOT be wiped, and your caret must NOT jump, even though polls are firing. Confirm in devtools → Network that `/api/notes` GETs pause while you type and resume shortly after you stop.
4. Switch to another browser tab for ~30s, then come back. Confirm in Network that polling **stopped** while hidden and resumed on return.
5. Close the notes layer. Confirm polling **stops entirely** — no further `/api/notes` requests.
6. Cold-load the page and never open the layer. Confirm **zero** `/api/notes` requests, ever. This is the client-facing guarantee.

- [ ] **Step 5: Commit**

```bash
git add notes.js
git -c user.email=edtsue@gmail.com commit -m "feat: poll for other reviewers' notes while the layer is open"
```

---

### Task 10: Deploy and verify in production

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `node --test test/*.test.js`
Expected: PASS, 34 tests. Do not deploy on a red suite.

- [ ] **Step 2: Confirm no secrets are staged**

```bash
git status --short
git ls-files | grep -i 'env' || echo "no env files tracked"
```

Expected: no `.env*` file tracked. If one is, remove it from the index before pushing.

- [ ] **Step 3: Push (this auto-deploys production)**

```bash
git push origin main
```

Per project convention, a push to `main` auto-deploys prod for `ytst-engine`.

- [ ] **Step 4: Verify the gate actually protects the endpoint**

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://ytst.mfgpilots.com/api/notes
```

Expected: `200 text/html` — the middleware rewrote the unauthenticated request to the gate page. **It must NOT return JSON.** If you see `application/json`, the notes API is publicly readable and writable; stop and fix the gate before telling anyone the URL.

- [ ] **Step 5: Verify the pitch itself is UNBROKEN — this is the top priority**

Set Your Sunday is a client-facing pitch. A working notes feature that damages the pitch is a net loss. Open `https://ytst.mfgpilots.com`, enter the gate password, and confirm **the site behaves exactly as it did before**:

1. The page loads with **no notes visible** — only the "Notes" button bottom-right.
2. **Cold load fires ZERO `/api/notes` requests** (devtools → Network, hard reload). Confirm the page's load weight and timing are unchanged.
3. **Hero:** the SUNDAY flap/slam animation runs, lede fades in, video plays.
4. **INSIGHT:** stat counters count up, glitch phrase cycles, week rail auto-scrolls.
5. **Build an asset:** day selector + randomize work; the ad scrubber loops.
6. **FAQ modal** opens from the footer button and closes.
7. Devtools → Console: **no new errors** from `notes.js`.
8. Scroll the full page — no layout shift, no element displaced by the notes layer.

If ANY of these regressed, stop and fix before going further. The notes layer is additive and namespaced (`.sn-*`); nothing here should have moved.

- [ ] **Step 6: Verify burial/restore over REAL HTTP**

This could not be tested locally: `vercel dev` hangs on PATCH/DELETE carrying a body for any route behind `middleware.js` (a dev-emulation bug — it affects the pre-existing `/api/geo` too, and production handles these fine). So the burial and restore round-trip must be confirmed here, in production, over real HTTP.

With the gate password entered in the browser:

1. Click **Notes** → add a note → reload → it persists.
2. Delete it → confirm it leaves the wall and appears in **Graveyard** with a burial time. **If this hangs or errors, the dev-only diagnosis was wrong — stop and investigate.**
3. **Restore** it → it returns to the wall.
4. Add a formatted note (bold + a colour + a paper colour) → reload → formatting survives.
5. Empty the graveyard to leave production tidy.

- [ ] **Step 7: Verify on a phone viewport**

In devtools, switch to an iPhone viewport and reload. Confirm the note tracks its anchor rather than drifting off-screen — this is the whole reason for fractional offsets, so it is worth seeing with your own eyes.

---

## Self-review notes

- **Spec coverage:** audience/gate (Task 4 + 9), anonymity (no author field anywhere), permissions (no ownership checks — anyone behind the gate edits anything), anchoring + fractional offsets (Task 6), orphan tray (Task 8), visibility toggle (Task 6), Upstash storage (Tasks 1/3), rich text B/I/U/colour/size/clear (Task 7), paper colour (Task 7), paste-as-plain (Task 7), server-side sanitisation (Task 2, applied on POST *and* PATCH in Task 4), graveyard soft delete + restore + purge + no TTL (Tasks 3/4/8), server-stamped timestamps + `· edited` (Tasks 3/6), error handling incl. gate-rewrite detection and unsaved marking (Task 6), idempotent restore (Task 3).
- **Deliberately deferred:** the spec's "two browsers add notes at once" test is covered at the unit level by per-field `HSET` (Task 3) rather than by a scripted two-browser test; verify by hand if it ever matters.
- **Known sharp edge:** `execCommand` is deprecated. It is used because the codebase already does (WCCommand triage editor) and it avoids an editor dependency. The `<font>` normalisation in Task 2 is what makes it safe across browsers.
