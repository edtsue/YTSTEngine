# Sticky Notes — Design

**Date:** 2026-07-15
**Project:** Set Your Sunday (YTSTEngine)
**Status:** Approved, pending implementation plan

## Purpose

Add yellow sticky notes that can be placed anywhere on the Set Your Sunday pitch
site, to collect feedback on the pitch itself. Notes persist server-side and are
shared: anyone who is through the password gate sees the same wall of notes.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Audience | Shared wall, everyone behind the gate | Feedback tool, not a private scratchpad |
| Identity | Anonymous — no author on notes | Gate is a shared password; real identity isn't enforceable without a second login |
| Permissions | Anyone behind the gate can edit/delete any note | Follows from anonymity: with no identity, "only the author" is not enforceable |
| Anchoring | Element + fractional offset | Survives responsive reflow; a pixel position drifts off its target on a narrow window |
| Visibility | Hidden by default, toggle button always present | Client opening the pitch sees clean creative; notes are one click away for reviewers |
| Storage | Upstash Redis via Vercel Marketplace | Supabase free tier pauses after ~1wk idle and needs a manual dashboard restore — fatal for a site used in bursts |
| Editing | Rich text: B/I/U, colour, font size, clear + per-note paper colour | Matches the house rule for editable surfaces |
| Deleting | **Soft delete → graveyard, restorable** | Feedback is expensive to re-create; a misclick must never destroy someone's note |
| Timestamps | **`created` + `updated` + `deletedAt`, stamped server-side** | Client clocks are unreliable and skew; the server is the only trustworthy source |

### Why not Supabase

The user asked for Supabase. It was rejected after checking the account: of three
projects (`optionviz`, `desolo26`, `Overwatch`), two are already `INACTIVE`.
Supabase's free plan pauses a project after roughly a week of inactivity, and a
paused project does not wake on request — it needs a manual restore from the
dashboard. A pitch site is used in bursts (pitch, then dormant for weeks), so the
notes would reliably be broken at the moment they were next needed. Piggybacking
on `desolo26` (currently active) does not help: that trip ended in June 2026, so
it is heading for the same pause.

Upstash Redis does not auto-pause, lives in the same Vercel account as the site,
and its free tier (~10k commands/day) is far beyond this feature's needs.

Storage is swappable: client and API contract are unchanged if this moves to
Supabase or Blob later.

## Architecture

Three new units, each independently understandable:

```
index.html ──┬── notes.css      presentation only
             └── notes.js       the whole client feature (self-contained layer)
                    │  fetch
                    ▼
             api/notes.js       method-dispatched CRUD; holds Upstash creds
                    │
                    ▼
             Upstash Redis      hash `sys:notes`  (live)
                                hash `sys:notes:trash`  (graveyard)
```

`notes.js` stays out of `app.js` (~3000 lines) because the notes layer shares no
state with the pitch's own behaviour. It touches the page only through
`document.elementFromPoint` and `getBoundingClientRect`.

### Auth

None of our own. `middleware.js` matches `/((?!api/gate|gate.html).*)`, so
`/api/notes` is already behind the gate cookie. Two consequences the client must
handle:

1. An unauthenticated request is **rewritten to `/gate.html`** — it returns HTML
   with status 200, not a 401. The client must detect a non-JSON response and
   surface "your session expired, reload" rather than parsing it as notes.
2. The gate **fails open**: if `YTST_GATE` were unset, the notes API would be
   world-writable. Verified 2026-07-15: `YTST_GATE` is set for Production and
   Preview. It is absent in Development, so the API is intentionally open on
   localhost.

## Data model

Two Redis hashes: `sys:notes` (live) and `sys:notes:trash` (graveyard). Field =
note id, value = JSON. Identical shape in both:

```json
{
  "id": "a1b2c3",
  "html": "<b>cut</b> this line",
  "text": "cut this line",
  "anchor": "#wishlist .wish__title",
  "ax": 0.42,
  "ay": 0.60,
  "section": "06 · The wishlist",
  "color": "yellow",
  "created": 1768435200000,
  "updated": 1768435200000,
  "deletedAt": null
}
```

- **`html`** — rendered note body. **`text`** — plain-text mirror, used by the
  tray and any future search. Both stored, per the WCCommand triage editor
  precedent.
- **`ax`/`ay`** — offsets as fractions (0–1) of the anchor element's box, *not*
  pixels. This is what survives reflow: a note at 50% across `.wish__title`
  stays at 50% whether that heading is 900px or 320px wide.
- **`section`** — human-readable section label, captured at drop time so a note
  can still say where it came from once orphaned or buried.
- **`created` / `updated` / `deletedAt`** — epoch ms, all **stamped by the
  server**, never sent by the client. Client clocks drift and would produce
  notes "created" in the future or out of order. `deletedAt` is `null` on live
  notes and set on burial.

A hash (rather than one JSON blob) is the point: `HSET`/`HDEL` are atomic **per
field**, so two reviewers adding notes simultaneously cannot clobber each other.
`HGETALL` still lists everything in one round trip.

Keeping the graveyard in a **separate hash** rather than filtering on
`deletedAt` keeps the live list free of buried notes without a scan, and makes
burial/restore a two-key move rather than a rewrite.

**The graveyard is not auto-purged.** No TTL: a graveyard that silently empties
itself is not a graveyard, and it would break the one promise the feature makes.
Volume is tens of notes; emptying is a deliberate manual action.

## API — `api/notes.js`

Single function, dispatched on method. Takes the project from 3 functions to 4,
under the Hobby cap of 12. All responses JSON.

| Method | Body | Returns | Redis |
|---|---|---|---|
| GET | — | `{notes: [...], trash: [...]}` | `HGETALL` both hashes |
| POST | `{html, text, anchor, ax, ay, section, color}` | `{note}` with new id | `HSET sys:notes` |
| PATCH | `{id, ...changed fields}` | `{note}` | `HGET` → merge → `HSET` |
| PATCH | `{id, restore: true}` | `{note}` | trash → `sys:notes`, clear `deletedAt` |
| DELETE | `{id}` | `{ok: true, note}` | **soft** — move to `sys:notes:trash`, set `deletedAt` |
| DELETE | `{id, purge: true}` | `{ok: true}` | hard — `HDEL sys:notes:trash` |
| DELETE | `{purgeAll: true}` | `{ok: true}` | `DEL sys:notes:trash` |

GET returns live and buried notes together (two `HGETALL`s, one round trip) so
opening the tray needs no second request. Volume makes this trivial.

Note ids are generated **server-side** on POST (short random string), so the
client never invents an id that could collide with another reviewer's.

Burial echoes the buried note back in the response. This is deliberate: it is
what lets the client show the **server's** `deletedAt` instead of stamping one
from a browser clock, which would contradict the timestamp rule above.

Errors return `{error: string}` with a 4xx/5xx status. Unknown method → 405.
Upstash credentials come from the Marketplace-provisioned env vars and never
reach the browser.

### Sanitisation

Note HTML is authored by one user and rendered into everyone else's page, so it
is sanitised **server-side on write** (not merely on paste) — a crafted PATCH
bypasses any client-side cleaning. Allowlist:

- Tags: `b`, `strong`, `i`, `em`, `u`, `br`, `div`, `span`
- Attributes: `style` on `span` only, and only `color` and `font-size`
- Everything else is stripped to its text content.

## Client — `notes.js`

### Interaction

- **Toggle button**, fixed bottom-right, yellow, with a count badge. Off by
  default → a cold load is a clean pitch.
- Toggling on reveals the notes layer, an **"+ Add"** button, and the **tray**
  button.
- "+ Add" **arms placement**: crosshair cursor, and page clicks are intercepted
  at the capture phase so the page goes inert. The next click drops a note at
  that point instead of firing a nav link or the FAQ modal. `Escape` cancels.
  One click, one note — no stickies from stray clicks.
- Each note: a small tilted yellow card (same violator feel as the FPO sticker),
  a contenteditable body, a formatting toolbar, a colour swatch, a timestamp
  footer, and `×` to bury. Drag to reposition, which re-anchors to whatever it
  lands on.

### Timestamps

Each sticky shows its **created** time in a small muted footer — compact and
absolute (`Jul 15, 2:14 PM`), with the full date/time in a `title` tooltip.
Absolute rather than "2h ago": relative time is friendly but ambiguous on a wall
of feedback read days later.

If `updated > created`, the footer appends `· edited`. The tray shows `created`
alongside `deletedAt` for buried notes.

### Rich text

Toolbar on the focused note only, to keep the wall quiet:

`B` · `I` · `U` · text colour · font size · clear formatting

- **Text colour:** ink (near-black, default), red, blue, green — swatches, not a
  colour picker. Legible on every paper colour.
- **Font size:** three steps — small / normal / large. Not a numeric input.

Implemented with `document.execCommand`. It is formally deprecated but remains
universally supported and is what the existing WCCommand editor uses; matching
the codebase beats introducing an editor dependency for a note widget.

**Paste is forced to plain text** via `execCommand('insertText')`, per the
WCCommand precedent — this stops Word/web pastes dragging in junk markup.

Per-note **paper colour** is separate from text colour: a swatch picker
(yellow default, plus pink/blue/green/orange), stored as `color`.

Saves are debounced (~500ms) on input and flushed on blur.

### Anchoring algorithm

On drop:

1. Hit-test with `document.elementFromPoint` (notes layer set to
   `pointer-events: none` during the test so it doesn't catch its own click).
2. Compute a selector for that element: prefer `#id`; otherwise build an
   `:nth-child()` path up to the nearest id'd ancestor.
3. Store the selector plus `ax`/`ay` as fractions of the element's box, and the
   enclosing section's label.

On render: resolve selector → `getBoundingClientRect()` → position the sticky in
page coordinates within an absolutely-positioned overlay layer.

Recalculate on resize, font load, and a `ResizeObserver` on the body, throttled
through `requestAnimationFrame`. **Not** on scroll — page-coordinate positioning
makes scrolling free.

### The tray — one panel, two tabs

A single docked panel (bottom-left) holding every note that isn't on the wall.
Two trays would clutter a pitch site, and both tabs answer the same question:
"what notes exist that I can't see?"

**Tab 1 — Unanchored.** Notes whose stored selector no longer resolves, because
the HTML underneath was edited or deleted. Orphans must never silently vanish:
they show text, original section, and created time, and can be re-placed (arm a
click, same as "+ Add") or buried.

**Tab 2 — Graveyard.** Buried notes, newest first, showing text, section,
created and deleted times. Each offers **Restore**; the panel offers **Empty
graveyard** behind a confirm, since that is the one genuinely irreversible
action in the feature.

**Restore is not guaranteed to return a note to its old spot.** If the note was
buried and the HTML it pointed at has since changed, restore puts it back on the
live wall but its anchor no longer resolves — so it lands in **Unanchored**
rather than failing or vanishing. The two tabs feed each other by design.

## Error handling

| Failure | Behaviour |
|---|---|
| API returns HTML (gate expired) | Banner: session expired, reload. Never parse as notes. |
| API unreachable / 5xx | Keep the note in the DOM, mark it unsaved, retry on next edit. Never discard typed text. |
| Anchor selector unresolvable | Note → Unanchored tab, not deleted. |
| Restore of a note whose anchor is now gone | Restores to the wall, lands in Unanchored. Never errors. |
| Restore of an id missing from trash (double-click, two reviewers) | Idempotent: succeed if it's already live, else 404. Never duplicate the note. |
| Note dragged onto the notes UI itself | Ignore; re-anchor only to page content. |

The through-line: **never lose text the user typed**, and never silently drop a
note. Burial is reversible; only "Empty graveyard" is not, and it is confirmed.

## Testing

The project is vanilla JS with no test framework, so verification is by driving
the real page:

1. Drop a note → reload → it returns, anchored to the same element.
2. Resize desktop → mobile width → the note tracks its anchor.
3. Bold/underline/colour/size → reload → formatting survives.
4. Two browsers add notes at once → both survive (the anti-clobber claim).
5. Rename an anchor's class in the HTML → the note lands in Unanchored.
6. Paste rich text from a web page → arrives as plain text.
7. Cold load with notes off → no notes visible, only the toggle button.
8. Delete a note → gone from wall, present in Graveyard with a deleted time.
9. Restore it → back on the wall, same spot, `deletedAt` cleared.
10. Delete → change its anchor's HTML → restore → lands in Unanchored, not lost.
11. Timestamps: create → footer shows created; edit → footer shows `· edited`.
12. Empty graveyard → confirms first; buried notes gone, live wall untouched.

## Files

| File | Change |
|---|---|
| `api/notes.js` | new — CRUD dispatcher, soft delete, restore, purge |
| `notes.js` | new — client layer, tray, editor |
| `notes.css` | new — sticky/toolbar/tray styles |
| `index.html` | 2 lines — link + script |
| `package.json` | add `@upstash/redis` |

## Out of scope

Author names, per-user permissions, real login, threaded replies, note search,
export, auto-purge/TTL on the graveyard. Revisit only if the wall is actually
used.
