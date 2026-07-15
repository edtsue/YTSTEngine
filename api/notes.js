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
