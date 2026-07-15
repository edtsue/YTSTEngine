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

test('concurrent edits to the same note are last-write-wins (documented behaviour)', async () => {
  let t = 1000;
  const store = makeStore(fakeRedis(), () => t);
  const a = await store.create(seed);

  // Two reviewers both read the same note, then both write — interleaved.
  // update() is read-modify-write, so whichever write lands second wins
  // the WHOLE note body, silently discarding the other reviewer's edit.
  t = 2000;
  const first = await store.update(a.id, { text: 'reviewer A' });
  t = 3000;
  const second = await store.update(a.id, { text: 'reviewer B' });

  assert.equal(first.text, 'reviewer A');
  assert.equal(second.text, 'reviewer B');
  const { notes } = await store.list();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, 'reviewer B', 'the later write wins the whole note');
});

test('a note present in both hashes self-heals: live wins and the stale trash copy is removed', async () => {
  const redis = fakeRedis();
  const store = makeStore(redis, () => 1000);
  const a = await store.create(seed);

  // Simulate the race: bury() put it in TRASH and hdel'd LIVE, but a
  // concurrent update() then resurrected it into LIVE (read before the
  // hdel, wrote after) — leaving the id in BOTH hashes.
  await store.bury(a.id);
  redis.db.get('sys:notes').set(a.id, redis.db.get('sys:notes:trash').get(a.id));

  const { notes, trash } = await store.list();
  assert.equal(notes.length, 1, 'live wins: the note is visible on the wall');
  assert.equal(notes[0].id, a.id);
  assert.equal(trash.length, 0, 'the stale trash copy is excluded from the response');
  assert.equal(redis.db.get('sys:notes:trash').has(a.id), false, 'the stale trash copy is actually deleted, not just hidden');
});

test('list is unchanged when live and trash do not overlap (no spurious hdel)', async () => {
  const redis = fakeRedis();
  const store = makeStore(redis, () => 1000);
  const live = await store.create(seed);
  const dead = await store.create(seed);
  await store.bury(dead.id);

  const { notes, trash } = await store.list();
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, live.id);
  assert.equal(trash.length, 1);
  assert.equal(trash[0].id, dead.id);
  assert.equal(redis.db.get('sys:notes:trash').has(dead.id), true, 'no overlap means no hdel should fire');
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
