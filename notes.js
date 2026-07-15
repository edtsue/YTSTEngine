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
  // Ids whose DELETE is in flight. mousedown on ✕ (which fires before focus
  // moves off the body, and therefore before focusout's immediate save)
  // marks a note here; save paths must treat that as a no-op until the
  // DELETE resolves, or the late PATCH races the DELETE and resurrects it.
  const burying = new Set();
  let layer, toggle, addBtn, countEl;
  // Pending debounced save timers, keyed by note id. Declared here (not
  // inside init()) so anyBusy() below — used by the poll loop — can see it.
  const debounced = new Map();

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
    renderTray();
  }

  const reposition = () => {
    for (const el of layer.children) {
      const note = state.notes.find(n => n.id === el.dataset.id);
      if (note) place(el, note);
    }
  };

  /* ── persistence ─────────────────────────────────────────────────── */
  async function saveNote(note, el) {
    // Belt and braces: saveNote is called from several places, not just the
    // debounced path the mousedown guard clears. A note being buried must
    // never round-trip a save while its DELETE is in flight.
    if (burying.has(note.id)) return;
    try {
      // w/h added in Task 7 so a resize survives reload. The store applies
      // them via the same conditional-write allowlist as every other field,
      // so this is a no-op PATCH body key for notes that were never resized.
      await api('PATCH', { id: note.id, html: note.html, text: note.text,
        anchor: note.anchor, ax: note.ax, ay: note.ay, color: note.color,
        w: note.w, h: note.h });
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

  /* ── boot ────────────────────────────────────────────────────────── */
  async function load() {
    try {
      const data = await api('GET');
      state.notes = data.notes;
      state.trash = data.trash;
      lastSig = sigOf(data);
      render();
    } catch (err) {
      banner(err.message === 'gate' ? 'Session expired — reload.' : 'Could not load notes.');
    }
  }

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

    // Nothing is fetched until the user opens the layer. A client loading the
    // pitch must not pay a network request for a feature they never open —
    // cold-load weight on this site is hard-won.
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

    addBtn.addEventListener('click', () => arm(!state.arming));

    // Capture phase: while arming, the page must not react to the click.
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
        burying.delete(id);
        render();
      } catch {
        // A failed delete leaves the note in the DOM (no render() here), so
        // it must come back out of burying or it's frozen — un-saveable —
        // forever even though it's still a live, editable note.
        burying.delete(id);
        banner('Could not delete note.');
      }
    });

    // styleWithCSS MUST be false. With it true, execCommand('bold') emits
    // <span style="font-weight:bold">, and the sanitiser's span allowlist only
    // permits color/font-size — so bold silently vanished on reload. With it
    // false, b/i/u emit <b>/<i>/<u> (allowlisted) and colour/size emit <font>,
    // which the sanitiser normalises into spans. Verified in Chrome.
    try { document.execCommand('styleWithCSS', false, false); } catch {}

    const noteOf = el => state.notes.find(n => n.id === el.dataset.id);

    // Click order on ✕ is mousedown → focus shifts off the body → focusout
    // (which saves IMMEDIATELY, not debounced) → mouseup → click. So a click
    // handler is always too late to stop that focusout save from racing the
    // DELETE — only mousedown fires early enough. Capture phase so this runs
    // before anything else can react to the mousedown.
    layer.addEventListener('mousedown', e => {
      const btn = e.target.closest('.sn-note__del');
      if (!btn) return;
      const id = btn.closest('.sn-note').dataset.id;
      burying.add(id);
      clearTimeout(debounced.get(id));
      debounced.delete(id);
    }, true);

    function queueSave(el) {
      const note = noteOf(el);
      if (!note) return;
      const body = el.querySelector('.sn-note__body');
      note.html = body.innerHTML;
      note.text = body.textContent;
      clearTimeout(debounced.get(note.id));
      // Delete on fire, not just clear: anyBusy() (Task 9) treats any entry
      // left in this map as an unflushed save. Leaving a fired timer's id
      // behind would wedge the poll loop "busy" forever after one edit.
      debounced.set(note.id, setTimeout(() => { debounced.delete(note.id); saveNote(note, el); }, 500));
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
      if (!note || burying.has(note.id)) return;
      clearTimeout(debounced.get(note.id));
      debounced.delete(note.id); // this save is happening now, not later
      saveNote(note, el);
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
    // Set by the tray's Re-place button; the next arming click re-anchors
    // this orphan instead of drop()-ing a brand-new note.
    let pendingReplace = null;
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

    let raf;
    const onLayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(reposition); };
    addEventListener('resize', onLayout);
    new ResizeObserver(onLayout).observe(document.body);
    document.fonts?.ready.then(onLayout);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
