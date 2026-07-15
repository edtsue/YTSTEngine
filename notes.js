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

    let raf;
    const onLayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(reposition); };
    addEventListener('resize', onLayout);
    new ResizeObserver(onLayout).observe(document.body);
    document.fonts?.ready.then(onLayout);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
