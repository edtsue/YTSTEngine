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
