/* ════════════════════════════════════════════════════════════════════
   SUNDAY M.I.A.
   A contextual CTV engine for YouTube Sunday Ticket × Fantasy.

   Three live signals fill one template — a BOARD OF EIGHT:
     • GEOGRAPHY  (IP → DMA + weekly blackout map)  — double duty
     • DAY → EMOTION  (calendar)                    — the collective tone
     • THE EIGHT  (Yahoo aggregate, geo-filtered)   — the market's eight
       most-drafted players, shown together, never a single face.

   The eight are shown EQUAL WEIGHT — a group feature, never a solo
   endorsement (NFLPA group-licensing safe). Geometry picks the eight and
   defines the blackout; the day sets the mood; Gemini renders the generic
   stadium backdrop behind them (no player likeness in the generated art).

   Players / teams are illustrative for the pitch; the live engine pulls the
   real eight most-drafted per market from Yahoo, geo-filtered.
   ════════════════════════════════════════════════════════════════════ */

const ESPN_LOGO = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`;
// ESPN headshot — deterministic by pid, same host as the team logos. Every
// board cell is a real headshot (transparent PNG) on a team-tinted plate.
const HEADSHOT = pid => `https://a.espncdn.com/i/headshots/nfl/players/full/${pid}.png`;

// team glow drives the per-cell tint and the backdrop bias light
const TEAMS = {
  cin: { glow: '#fb4f14' }, atl: { glow: '#a71930' }, ari: { glow: '#97233f' },
  buf: { glow: '#00338d' }, sf:  { glow: '#aa0000' }, kc:  { glow: '#e31837' },
  phi: { glow: '#1a5f57' }, min: { glow: '#4f2683' }, bal: { glow: '#241773' },
  wsh: { glow: '#7c1415' }, det: { glow: '#0076b6' }, lv:  { glow: '#a5acaf' },
  mia: { glow: '#008e97' }, dal: { glow: '#003594' }, lar: { glow: '#ffa300' },
  nyg: { glow: '#0b2265' }, hou: { glow: '#a71930' },
};

/* ── The national draft pool (rank-ordered, real ESPN pids). The engine
   derives each market's eight from this pool, filtered to who's out-of-market
   in that DMA. ── */
const POOL = [
  { name: "Ja'Marr Chase",       pos: 'WR', team: 'cin', city: 'Cincinnati',   pid: 4362628 },
  { name: 'Bijan Robinson',      pos: 'RB', team: 'atl', city: 'Atlanta',      pid: 4430807 },
  { name: 'Justin Jefferson',    pos: 'WR', team: 'min', city: 'Minnesota',    pid: 4262921 },
  { name: 'Saquon Barkley',      pos: 'RB', team: 'phi', city: 'Philadelphia', pid: 3929630 },
  { name: 'Jahmyr Gibbs',        pos: 'RB', team: 'det', city: 'Detroit',      pid: 4429795 },
  { name: 'CeeDee Lamb',         pos: 'WR', team: 'dal', city: 'Dallas',       pid: 4241389 },
  { name: 'Christian McCaffrey', pos: 'RB', team: 'sf',  city: 'San Francisco',pid: 3117251 },
  { name: 'Puka Nacua',          pos: 'WR', team: 'lar', city: 'Los Angeles',  pid: 4426515 },
  { name: 'Amon-Ra St. Brown',   pos: 'WR', team: 'det', city: 'Detroit',      pid: 4374302 },
  { name: 'Malik Nabers',        pos: 'WR', team: 'nyg', city: 'New York',     pid: 4595348 },
  { name: 'Ashton Jeanty',       pos: 'RB', team: 'lv',  city: 'Las Vegas',    pid: 4890973 },
  { name: "De'Von Achane",       pos: 'RB', team: 'mia', city: 'Miami',        pid: 4429160 },
  { name: 'Nico Collins',        pos: 'WR', team: 'hou', city: 'Houston',      pid: 4258173 },
  { name: 'Derrick Henry',       pos: 'RB', team: 'bal', city: 'Baltimore',    pid: 3043078 },
  { name: 'Brock Bowers',        pos: 'TE', team: 'lv',  city: 'Las Vegas',    pid: 4432665 },
  { name: 'Trey McBride',        pos: 'TE', team: 'ari', city: 'Arizona',      pid: 4361307 },
  { name: 'A.J. Brown',          pos: 'WR', team: 'phi', city: 'Philadelphia', pid: 4047646 },
  { name: 'George Kittle',       pos: 'TE', team: 'sf',  city: 'San Francisco',pid: 3040151 },
  { name: 'Josh Allen',          pos: 'QB', team: 'buf', city: 'Buffalo',      pid: 3918298 },
  { name: 'Lamar Jackson',       pos: 'QB', team: 'bal', city: 'Baltimore',    pid: 3916387 },
  { name: 'Jalen Hurts',         pos: 'QB', team: 'phi', city: 'Philadelphia', pid: 4040715 },
  { name: 'Joe Burrow',          pos: 'QB', team: 'cin', city: 'Cincinnati',   pid: 3915511 },
  { name: 'Jayden Daniels',      pos: 'QB', team: 'wsh', city: 'Washington',   pid: 4426348 },
  { name: 'Patrick Mahomes',     pos: 'QB', team: 'kc',  city: 'Kansas City',  pid: 3139477 },
];

/* ── Markets — city held constant, day flips the mood. Each market's BOARD is
   derived below: the national pool minus whoever's in-market there. ── */
const MARKETS = [
  { id: 'cle', city: 'Cleveland',   dma: 'Cleveland-Akron', inMarket: ['cle'] },
  { id: 'nyc', city: 'New York',    dma: 'New York',        inMarket: ['nyg', 'nyj'] },
  { id: 'la',  city: 'Los Angeles', dma: 'Los Angeles',     inMarket: ['lar', 'lac'] },
  { id: 'chi', city: 'Chicago',     dma: 'Chicago',         inMarket: ['chi'] },
];
// derive an eight-card board: rotate the pool per market (so the boards differ
// in the demo), drop anyone whose team is in-market (they're not blacked out),
// take the top eight that remain.
function deriveBoard(market, i) {
  const off = (i * 3) % POOL.length;
  const rotated = POOL.slice(off).concat(POOL.slice(0, off));
  return rotated.filter(p => !market.inMarket.includes(p.team)).slice(0, 8);
}
MARKETS.forEach((m, i) => { m.board = deriveBoard(m, i); });

/* ── The three signals (for the explainer cards) ───────────────────── */
const SIGNALS = [
  { icon: '📍', key: 'geo', name: 'Geography', source: 'IP → DMA + weekly blackout map',
    job: 'Double duty: which of the league’s most-drafted are out of market here, and which of their games is blacked out here.' },
  { icon: '😰', key: 'day', name: 'Day → Emotion', source: 'Calendar lookup',
    job: 'The frame. Monday grief, Sunday-morning panic, Sunday-afternoon helplessness — the tone of the whole board.' },
  { icon: '🏈', key: 'player', name: 'The eight', source: 'Yahoo ownership + Genius Sports data, geo-filtered',
    job: 'The wound. The eight most-drafted players in that market — Yahoo fantasy ownership blended with Genius Sports engagement. Shown together, equal weight, never a single face.' },
];

/* ── Day → emotion tone grid ───────────────────────────────────────── */
const DAYS = [
  { id: 'mon',       short: 'Mon',  name: 'Monday',            dow: 1, emotion: 'Grief',                 register: 'Rueful, the morning-after',        accent: '#5b8cff' },
  { id: 'tue',       short: 'Tue',  name: 'Tuesday',           dow: 2, emotion: 'Resentment → hope',     register: 'The fresh-start pivot',            accent: '#3fb6a8' },
  { id: 'wed',       short: 'Wed',  name: 'Wednesday',         dow: 3, emotion: 'Anxious gambling',      register: 'Wry, knowing',                     accent: '#e0a83d' },
  { id: 'thu',       short: 'Thu',  name: 'Thursday',          dow: 4, emotion: 'Reckless commitment',   register: 'The contrast — a game you can see', accent: '#ff7a3d' },
  { id: 'fri',       short: 'Fri',  name: 'Friday',            dow: 5, emotion: 'Studious dread',        register: 'Prep-mode, ominous',               accent: '#9b6cff' },
  { id: 'sat',       short: 'Sat',  name: 'Saturday',          dow: 6, emotion: 'Restless 2nd-guessing', register: 'Coiled, anticipatory',             accent: '#ff944d' },
  { id: 'sun-am',    short: 'Sun AM', name: 'Sunday Morning',  dow: 0, emotion: 'Peak panic',           register: 'Urgent, countdown-driven',         accent: '#ff5a3d' },
  { id: 'sun-pm',    short: 'Sun PM', name: 'Sunday Afternoon', dow: 0, emotion: 'Helplessness',        register: 'The core wound — present tense',    accent: '#ff2d2d' },
  { id: 'sun-night', short: 'Sun Night', name: 'Sunday Night', dow: 0, emotion: 'Exhausted hope',       register: 'Spent, hanging by a thread',       accent: '#6c7cff' },
];

/* ── Headlines — playful, witty, concise, and each day's three lines carry
   that day's EMOTION (Mon grief → Sun-PM helplessness → Sun-night exhausted
   hope). Each is a [lead, punch] pair: the lead sets it up (big caps), the
   punch lands it (accent italic). Three distinct angles per day. ── */
const DAY_HEADLINES = {
  // Monday-beat — grief, rueful morning-after (never names the day)
  'mon': [
    m => ['Your guys went nuclear.', 'You’re grieving the box score.'],
    m => ['RIP your weekend.', 'Studs everywhere, you saw zero.'],
    m => ['The mourning after.', `Eight ghosts, one sad ${m.city} recap.`],
  ],
  // Tuesday-beat — resentment turning to hope, the fresh-start pivot
  'tue': [
    m => ['New week, fresh waivers.', 'Same “still not on my TV.”'],
    m => ['Hope springs eternal.', 'Your channels don’t.'],
    m => ['Turning the page…', 'to the same old blackout.'],
  ],
  // Wednesday-beat — anxious gambling, wry and knowing
  'wed': [
    m => ['Locks of the week:', `eight guys, zero on ${m.city} TV.`],
    m => ['100% rostered,', '0% watchable. Sweat it.'],
    m => ['You’d bet the house.', 'Can’t even bet the remote.'],
  ],
  // Thursday-beat — reckless commitment, the contrast (a game you CAN see)
  'thu': [
    m => ['Tonight: one game, all in.', 'Then your guys vanish.'],
    m => ['Tonight’s the freebie.', 'The rest is a group chat.'],
    m => ['Go all-in tonight.', 'Pay for it at kickoff.'],
  ],
  // Friday-beat — studious dread, prep-mode and ominous
  'fri': [
    m => ['Lineup: locked and studied.', 'Channels: won’t cooperate.'],
    m => ['You did the homework.', 'The big quiz is off-air.'],
    m => ['Prepped, set… dreading.', 'Same blackout, every week.'],
  ],
  // Saturday-beat — restless second-guessing, coiled and anticipatory
  'sat': [
    m => ['Start ’em? Sit ’em?', 'Moot — you can’t see ’em.'],
    m => ['One sleep till kickoff.', 'Zero chance it’s on your TV.'],
    m => ['Overthinking every start.', 'Tomorrow they play out of town.'],
  ],
  // Sunday-morning-beat — peak panic, urgent countdown energy
  'sun-am': [
    m => ['Kickoff in an hour.', 'Your eight? Nowhere near your TV.'],
    m => ['Lineups locking — breathe.', 'Channels still won’t cooperate.'],
    m => ['It’s go time.', 'For everyone airing your guys.'],
  ],
  // Sunday-afternoon-beat — helplessness, the core wound, present tense
  'sun-pm': [
    m => ['Your guys are cooking right now.', 'You’re watching a spinner.'],
    m => ['Your lineup is balling, live.', 'Not on a screen you’ve got.'],
    m => ['Eight stars on, in real time.', `Zero on ${m.city} TV.`],
  ],
  // Sunday-night-beat — exhausted hope, spent and hanging by a thread
  'sun-night': [
    m => ['Primetime, last gasp.', 'Your season’s off-channel.'],
    m => ['One game left, eight missed.', 'Hope’s doing heavy lifting.'],
    m => ['The day’s almost gone.', 'Your guys never aired. Again.'],
  ],
};
// each variant returns a [lead, punch] pair for the selected day
const VARIANTS = [0, 1, 2].map(i => (m, d) =>
  (DAY_HEADLINES[d.id] || DAY_HEADLINES['sun-pm'])[i](m));
const headlineText = (m, d, i) => VARIANTS[i](m, d).join(' ');

// eyebrow: simply the market's most popular fantasy players
const EYEBROW = m => `${m.city}’s most popular fantasy players`;
const surname = name => name.split(' ').slice(1).join(' ');

/* ════════════════════ SECTION 01 — explainer ════════════════════ */
function buildSignals() {
  document.getElementById('signals').innerHTML = SIGNALS.map(s => `
    <article class="sig sig--${s.key}">
      <div class="sig__icon">${s.icon}</div>
      <h3>${s.name}</h3>
      <div class="sig__src">${s.source}</div>
      <p class="sig__job">${s.job}</p>
      ${s.key === 'player' ? '<div class="sig__logos"><img class="sig__yahoo" src="assets/yahoo-fantasy.jpg" alt="Yahoo Fantasy" /><img class="sig__yahoo" src="assets/genius-sports.svg" alt="Genius Sports" /></div>' : ''}
    </article>`).join('<div class="sig-x" aria-hidden="true">×</div>');
}

function buildWeekRail() {
  const m = MARKETS[0]; // Cleveland
  const logos = m.board.slice(0, 4)
    .map(p => `<img class="mini__lg" src="${ESPN_LOGO(p.team)}" alt="" loading="lazy" />`).join('');
  document.getElementById('weekRail').innerHTML = DAYS.map(d => `
    <button class="mini" data-day="${d.id}" style="--accent:${d.accent}">
      <span class="mini__top"><span class="mini__day">${d.short}</span><span class="mini__brand">▶ Sunday Ticket</span></span>
      <span class="mini__emo">${d.emotion}</span>
      <span class="mini__hl">${headlineText(m, d, 2)}</span>
      <span class="mini__logos">${logos}<span class="mini__more">+4</span></span>
    </button>`).join('');
  document.querySelectorAll('.mini').forEach(b => b.addEventListener('click', () => {
    document.getElementById('selDay').value = b.dataset.day;
    document.getElementById('selMarket').value = m.id;
    renderMixer();
    document.getElementById('mixer').scrollIntoView({ behavior: 'smooth' });
  }));
}

/* ════════════════════ SECTION 03 — production ════════════════════ */
function buildProduction() {
  // 1 · Aggregate — the eight most-drafted, ranked by DMA (logo stack)
  const dmas = document.getElementById('prodDmas');
  if (dmas) {
    dmas.innerHTML = MARKETS.map(m => {
      const logos = m.board
        .map(p => `<img src="${ESPN_LOGO(p.team)}" alt="" loading="lazy" />`).join('');
      return `<div class="dma">
        <span class="dma__city">${m.city}</span>
        <span class="dma__dma">${m.dma} DMA</span>
        <span class="dma__board">${logos}</span>
      </div>`;
    }).join('');
    document.getElementById('prodDmaMore').textContent = `+ ${210 - MARKETS.length} more U.S. DMAs`;
  }

  // 3 · Push to CTV — one fresh board per day of the week
  const week = document.getElementById('prodWeek');
  if (week) {
    const WEEK = [
      ['Mon', '#5b8cff'], ['Tue', '#3fb6a8'], ['Wed', '#e0a83d'], ['Thu', '#ff7a3d'],
      ['Fri', '#9b6cff'], ['Sat', '#ff944d'], ['Sun', '#ff2d2d'],
    ];
    week.innerHTML = WEEK.map(([s, a]) => `<span class="wk" style="--a:${a}">${s}</span>`).join('');
  }
}

/* ════════════════════ SECTION 02 — the mixer ════════════════════ */
function currentSel() {
  const m = MARKETS.find(x => x.id === document.getElementById('selMarket').value);
  const d = DAYS.find(x => x.id === document.getElementById('selDay').value);
  return { m, d };
}

function buildMixer() {
  document.getElementById('selMarket').innerHTML = MARKETS.map(m => `<option value="${m.id}">${m.city}</option>`).join('');
  document.getElementById('selDay').innerHTML = DAYS.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

  document.getElementById('selDay').value = beatForToday();

  ['selMarket', 'selDay'].forEach(id =>
    document.getElementById(id).addEventListener('change', () => { stopReel(); renderMixer(); }));
  document.getElementById('genBtn').addEventListener('click', () => { stopReel(); generateBackdrop(); });
  document.getElementById('randBtn').addEventListener('click', randomize);
  document.getElementById('reelBtn').addEventListener('click', toggleReel);
  renderMixer(true);
}

/* ── slot-machine randomize ──────────────────────────────────────────
   The two signal selects "roll" and clunk into place — market, then day —
   with the whole board rolling through combos behind a blur. */
const pick = a => a[Math.floor(Math.random() * a.length)];
let spinning = false;
function randomize() {
  if (spinning) return;
  stopReel();
  const mEl = document.getElementById('selMarket');
  const dEl = document.getElementById('selDay');
  const finalM = pick(MARKETS).id, finalD = pick(DAYS).id;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    mEl.value = finalM; dEl.value = finalD;
    renderMixer();
    return;
  }

  spinning = true;
  const btn = document.getElementById('randBtn');
  const ctv = document.getElementById('ctv');
  const controls = document.querySelector('.controls');
  btn.disabled = true;
  ctv.classList.add('is-spinning');
  controls.classList.add('is-spinning');

  const mIds = MARKETS.map(m => m.id), dIds = DAYS.map(d => d.id);
  let mDone = false;
  const flick = setInterval(() => {
    if (!mDone) mEl.value = pick(mIds);
    dEl.value = pick(dIds);
    renderMixer(true);            // instant roll of the whole board
  }, 75);

  // settle one reel at a time — market, then day
  setTimeout(() => { mDone = true; mEl.value = finalM; }, 560);
  setTimeout(() => {
    clearInterval(flick);
    dEl.value = finalD;
    ctv.classList.remove('is-spinning');
    controls.classList.remove('is-spinning');
    btn.disabled = false;
    spinning = false;
    renderMixer();                // final settle, with the headline retype
  }, 900);
}

/* ── headline: a caps LEAD (the setup) + an accent-italic PUNCH ───────
   Two registers by design — the lead sets it up big, the punch lands it
   italic in the day's accent color. ── */
function setHeadline(m, d, instant) {
  const [lead, accent] = VARIANTS[variantIdx](m, d);
  const h = document.getElementById('ctvHeadline');
  const leadEl = document.getElementById('ctvHlLead');
  const accEl = document.getElementById('ctvHlAccent');
  if (!h) return;
  leadEl.textContent = lead;
  accEl.textContent = accent;
  accEl.style.display = accent ? '' : 'none';
  if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  h.classList.remove('is-reveal');
  void h.offsetWidth;                                // restart the reveal animation
  h.classList.add('is-reveal');
}

/* ── engine auto-reel ────────────────────────────────────────────────
   Cycles market → day every couple seconds so the engine visibly renders
   a new board on its own. */
let reelTimer = null;
function toggleReel() { reelTimer ? stopReel() : startReel(); }
function startReel() {
  if (reelTimer || spinning) return;
  const btn = document.getElementById('reelBtn');
  btn.classList.add('is-on');
  btn.textContent = '⏸ Stop the engine';
  document.getElementById('ctv').classList.add('is-reeling');
  const step = () => {
    document.getElementById('selMarket').value = pick(MARKETS).id;
    document.getElementById('selDay').value = pick(DAYS).id;
    renderMixer();
  };
  step();
  reelTimer = setInterval(step, 2300);
}
function stopReel() {
  if (!reelTimer) return;
  clearInterval(reelTimer);
  reelTimer = null;
  const btn = document.getElementById('reelBtn');
  btn.classList.remove('is-on');
  btn.textContent = '▶ Watch the engine run';
  document.getElementById('ctv').classList.remove('is-reeling');
}

/* ── odometer count-up ───────────────────────────────────────────────*/
function animateOdometer() {
  const el = document.getElementById('odoNum');
  if (!el) return;
  const target = 5040; // 210 DMAs × 8 day-moods × 3 copy versions
  let started = false;
  const run = () => {
    if (started) return; started = true;
    const dur = 1700, t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { run(); io.disconnect(); } }), { threshold: 0.4 });
    io.observe(el);
  } else { run(); }
}

/* ── location detection, with an opt-out ─────────────────────────────*/
const GEO_OFF = 'ytst_geo_off';
const geoEnabled = () => localStorage.getItem(GEO_OFF) !== '1';
const REGION_MARKET = {
  NY: 'nyc', NJ: 'nyc', CT: 'nyc', MA: 'nyc', RI: 'nyc', NH: 'nyc', VT: 'nyc', ME: 'nyc', PA: 'nyc', MD: 'nyc', DE: 'nyc', DC: 'nyc', VA: 'nyc',
  OH: 'cle', MI: 'cle', IN: 'cle', KY: 'cle', WV: 'cle', TN: 'cle', NC: 'cle', SC: 'cle', GA: 'cle', FL: 'cle', AL: 'cle',
  IL: 'chi', WI: 'chi', MN: 'chi', IA: 'chi', MO: 'chi', ND: 'chi', SD: 'chi', NE: 'chi', KS: 'chi', OK: 'chi', AR: 'chi', LA: 'chi', MS: 'chi', TX: 'chi', CO: 'chi', NM: 'chi',
  CA: 'la', OR: 'la', WA: 'la', NV: 'la', AZ: 'la', UT: 'la', ID: 'la', MT: 'la', WY: 'la', HI: 'la', AK: 'la',
};
function marketFromGeo(city, region) {
  const byCity = MARKETS.find(m => m.city.toLowerCase() === (city || '').toLowerCase());
  if (byCity) return byCity.id;
  return REGION_MARKET[(region || '').toUpperCase()] || null;
}
async function detectLocation() {
  const status = document.getElementById('geoStatus');
  if (!geoEnabled()) { status.textContent = 'Location off — pick a market manually below.'; return; }
  status.textContent = 'Detecting your market…';
  try {
    const r = await fetch('/api/geo');
    const g = await r.json().catch(() => ({}));
    const id = marketFromGeo(g.city, g.region);
    if (id) {
      stopReel();
      document.getElementById('selMarket').value = id;
      renderMixer();
      const mk = MARKETS.find(m => m.id === id);
      status.innerHTML = `📍 Detected near <strong>${g.city || mk.city}</strong> — showing the ${mk.city} market.`;
    } else {
      status.textContent = g.city
        ? `📍 ${g.city} — showing a nearby sample market.`
        : 'Couldn’t detect location — showing a sample market.';
    }
  } catch {
    status.textContent = 'Couldn’t detect location — showing a sample market.';
  }
}
function initGeo() {
  const chk = document.getElementById('geoChk');
  if (!chk) return;
  chk.checked = geoEnabled();
  chk.addEventListener('change', () => {
    localStorage.setItem(GEO_OFF, chk.checked ? '0' : '1');
    if (chk.checked) detectLocation();
    else document.getElementById('geoStatus').textContent = 'Location off — pick a market manually below.';
  });
  detectLocation();
}

function beatForToday() {
  const dow = new Date().getDay();
  if (dow === 0) return 'sun-pm';
  const hit = DAYS.find(d => d.dow === dow);
  return hit ? hit.id : 'sun-pm';
}

function renderMixer(opts) {
  const instant = opts === true || (opts && opts.instant === true);
  const { m, d } = currentSel();
  const ctv = document.getElementById('ctv');
  ctv.style.setProperty('--accent', d.accent);
  ctv.style.setProperty('--team', d.accent);
  const room = document.getElementById('room');
  if (room) {
    room.style.setProperty('--accent', d.accent);
    room.style.setProperty('--team', d.accent);
  }

  document.getElementById('emoNote').textContent = `${d.emotion} — ${d.register}.`;
  document.getElementById('playerNote').innerHTML =
    `<strong>8 most-drafted starters</strong> · all out-of-market in ${m.city}.`;

  document.getElementById('ctvEyebrow').textContent = EYEBROW(m);
  setHeadline(m, d, instant);
  document.getElementById('stageCap').textContent =
    `Geography: ${m.dma} · Day→Emotion: ${d.emotion} · Board: ${m.city}’s 8 most-drafted, out-of-market`;
  renderVariants(m, d);
  renderBoard(m);

  // generated stadium backdrop → team/day-tinted plate (CSS default)
  applyBackdrop(backdropPrompt(d));
}

/* ── the board of eight: equal-weight headshot cells ─────────────────*/
function renderBoard(m) {
  const el = document.getElementById('ctvBoard');
  if (!el) return;
  el.innerHTML = m.board.map(p => `
    <div class="bcard" style="--team:${(TEAMS[p.team] || {}).glow || '#7a8290'}">
      <span class="bcard__pos">${p.pos}</span>
      <img class="bcard__face" src="${HEADSHOT(p.pid)}" alt="${p.name}" loading="lazy"
           onerror="this.style.opacity=0" />
      <img class="bcard__logo" src="${ESPN_LOGO(p.team)}" alt="" loading="lazy" />
      <span class="bcard__name">${surname(p.name)}</span>
    </div>`).join('');
}

/* three copy versions of the same board — click to load one into the asset */
let variantIdx = 0;
function renderVariants(m, d) {
  const wrap = document.getElementById('variantTabs');
  wrap.innerHTML = VARIANTS.map((fn, i) => `
    <button class="vtab ${i === variantIdx ? 'is-active' : ''}" data-v="${i}">
      <span class="vtab__n">Version ${i + 1}</span>
      <span class="vtab__hl">${headlineText(m, d, i)}</span>
    </button>`).join('');
  wrap.querySelectorAll('.vtab').forEach(b => b.addEventListener('click', () => {
    variantIdx = +b.dataset.v;
    setHeadline(m, d);
    wrap.querySelectorAll('.vtab').forEach(x => x.classList.toggle('is-active', x === b));
  }));
}

/* client-side cache: re-viewing a backdrop is instant, no re-generation */
const imgCache = {};
function applyBackdrop(prompt) {
  const media = document.getElementById('ctvMedia');
  const ctv = document.getElementById('ctv');
  if (imgCache[prompt]) {                  // a generated Gemini backdrop wins
    media.style.backgroundImage =
      `linear-gradient(0deg, rgba(4,6,10,.6), rgba(4,6,10,.25)), url("${imgCache[prompt]}")`;
    media.style.backgroundSize = 'cover';
    media.style.backgroundPosition = 'center';
    media.style.backgroundRepeat = 'no-repeat';
    ctv.classList.add('has-img');
  } else {                                 // fall back to the team/day-tinted plate
    media.style.cssText = '';
    ctv.classList.remove('has-img');
  }
}

/* backdrop prompt — a generic, player-free stadium plate. Our chrome and the
   real headshots supply everything else, so the generated art never renders a
   player likeness (rights-clean by construction). */
function backdropPrompt(d) {
  return [
    'Cinematic, photoreal 16:9 establishing shot of an empty professional American-football stadium at dusk — no players, no people in frame.',
    'Stadium floodlights, drifting field haze, deep shadows, telephoto compression, shallow depth of field, premium broadcast atmosphere.',
    `Emotional tone: ${d.emotion.toLowerCase()} — ${d.register.toLowerCase()}.`,
    'Muted and desaturated, designed to sit behind a grid of overlaid player cards and a headline.',
    'No readable text, no numbers, no team names, no logos, no jersey lettering, no sponsor marks, no watermarks, no players.',
  ].join(' ');
}

async function generateBackdrop() {
  const { d } = currentSel();
  const prompt = backdropPrompt(d);
  const btn = document.getElementById('genBtn');
  const loader = document.getElementById('ctvLoader');
  const status = document.getElementById('genStatus');

  // already rendered this exact backdrop — show it instantly
  if (imgCache[prompt]) {
    applyBackdrop(prompt);
    status.textContent = '✓ Showing saved backdrop — change the day for a new one.';
    return;
  }

  btn.disabled = true;
  loader.hidden = false;
  status.textContent = 'Generating with Gemini…';
  const txt = document.getElementById('ctvLoaderTxt');

  const t0 = Date.now();
  const tick = setInterval(() => {
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    txt.textContent = `Generating with Gemini… ${s}s`;
  }, 250);

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 55000);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.image) {
      const reason = data.error === 'no_key'
        ? 'Add YTST_KEY in Vercel to generate the photographic backdrop — showing the styled plate.'
        : (data.message || data.error || `Generation failed (${res.status}).`);
      throw new Error(reason);
    }
    imgCache[prompt] = data.image;
    applyBackdrop(prompt);
    status.textContent = `✓ Backdrop generated in ${((Date.now() - t0) / 1000).toFixed(1)}s.`;
  } catch (e) {
    status.textContent = e.name === 'AbortError'
      ? '⚠ Timed out — try again.'
      : '⚠ ' + e.message;
  } finally {
    clearInterval(tick);
    clearTimeout(timeout);
    txt.textContent = 'Generating with Gemini…';
    btn.disabled = false;
    loader.hidden = true;
  }
}

/* ── contextual day-of-week chip in the hero ───────────────────────── */
function buildToday() {
  const d = DAYS.find(x => x.id === beatForToday());
  if (!d) return;
  document.getElementById('todayName').textContent = d.name.replace(' Afternoon', '').replace(' Morning', ' morning').replace(' Night', ' night');
  document.getElementById('todayMsg').textContent = `${d.emotion} — today's board writes itself in this register.`;
  document.getElementById('todayChip').hidden = false;
}

/* ── expand the mock-up into a large lightbox ──────────────────────────
   The room lives deep inside the studio grid, whose stacking context paints
   below a body-level backdrop. So on open we MOVE the room node up to <body>
   (same node → keeps its listeners + live state) and restore it on close. */
function initExpand() {
  const btn = document.getElementById('expandBtn');
  const room = document.getElementById('room');
  if (!btn || !room) return;
  let bd = null, closeBtn = null, anchor = null;
  const onKey = e => { if (e.key === 'Escape') close(); };
  function close() {
    if (!room.classList.contains('is-expanded')) return;
    room.classList.remove('is-expanded');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(room, anchor);  // put it back
    if (anchor) anchor.remove();
    document.body.classList.remove('mockup-open');
    if (bd) bd.remove();
    if (closeBtn) closeBtn.remove();
    bd = closeBtn = anchor = null;
    document.removeEventListener('keydown', onKey);
    btn.setAttribute('aria-expanded', 'false');
  }
  function open() {
    anchor = document.createComment('room-placeholder');     // remember where it was
    room.parentNode.insertBefore(anchor, room);
    bd = document.createElement('div'); bd.className = 'lightbox-backdrop';
    closeBtn = document.createElement('button');
    closeBtn.className = 'lightbox-close'; closeBtn.innerHTML = '✕';
    closeBtn.setAttribute('aria-label', 'Close expanded mock-up');
    document.body.append(bd, room, closeBtn);                // lift room to top level
    document.body.classList.add('mockup-open');
    room.classList.add('is-expanded');
    bd.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    btn.setAttribute('aria-expanded', 'true');
  }
  btn.addEventListener('click', () => room.classList.contains('is-expanded') ? close() : open());
}

/* ── hero video: deferred load ─────────────────────────────────────── */
function initHeroVideo() {
  const v = document.getElementById('heroVid');
  if (!v) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduce || saveData) return;
  const load = () => {
    v.src = 'assets/hero.mp4';
    v.addEventListener('playing', () => v.classList.add('is-ready'), { once: true });
    v.play().catch(() => {});
  };
  if (document.readyState === 'complete') setTimeout(load, 200);
  else window.addEventListener('load', () => setTimeout(load, 200), { once: true });
}

/* ── init ── */
buildSignals();
buildWeekRail();
buildMixer();
buildProduction();
buildToday();
initHeroVideo();
animateOdometer();
initExpand();
initGeo();          // detects market + seeds the mixer (after buildMixer)
