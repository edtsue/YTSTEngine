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
