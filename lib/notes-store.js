/* ════════════════════════════════════════════════════════════════════
   Sticky-note storage — two Upstash Redis hashes.

     sys:notes        live notes      field = id, value = JSON
     sys:notes:trash  the graveyard   same shape, deletedAt set

   Hashes (not one JSON blob) because HSET/HDEL are atomic per field: two
   reviewers creating DIFFERENT notes at the same moment cannot clobber
   each other's fields. That atomicity does NOT extend to two reviewers
   editing the SAME note id: update() is read-modify-write, so concurrent
   edits to one note are last-write-wins — the later write replaces the
   whole note body and the earlier edit is silently lost. That's an
   accepted tradeoff for a sticky-note wall, not a bug to fix here.

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
const WRITABLE = ['html', 'text', 'anchor', 'ax', 'ay', 'section', 'color', 'w', 'h'];

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

      // Self-heal: a note can transiently land in BOTH hashes if update()
      // reads it just before a concurrent bury() deletes it from LIVE, then
      // writes it back after — resurrecting it into LIVE while a copy still
      // sits in TRASH. Live wins (it never loses a note the user may still
      // be editing); the stale trash copy is swept here, on the read path
      // both callers use, using the hashes already fetched above.
      const deadEntries = dead ? Object.entries(dead) : [];
      const overlapIds = live ? deadEntries.filter(([id]) => id in live).map(([id]) => id) : [];
      if (overlapIds.length) {
        await Promise.all(overlapIds.map(id => redis.hdel(TRASH, id)));
      }
      const overlapSet = new Set(overlapIds);

      return {
        notes: rows(live).sort((a, b) => a.created - b.created),
        trash: deadEntries
          .filter(([id]) => !overlapSet.has(id))
          .map(([, raw]) => parse(raw))
          .sort((a, b) => b.deletedAt - a.deletedAt), // newest burial first
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
