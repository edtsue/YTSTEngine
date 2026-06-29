/* ════════════════════════════════════════════════════════════════════
   SUNDAY'S MOST WANTED
   A contextual CTV engine for YouTube Sunday Ticket × Fantasy.

   Three live signals fill one template:
     • GEOGRAPHY  (IP → DMA + weekly blackout map)  — double duty
     • DAY → EMOTION  (calendar)                    — the tone
     • TOP PLAYER  (Yahoo aggregate, geo-filtered)  — the named hook

   Players / teams are illustrative for the pitch; the live engine pulls
   the real most-drafted name per position from Yahoo, geo-filtered.
   ════════════════════════════════════════════════════════════════════ */

const ESPN_LOGO = abbr => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`;

// team colors drive both the action-shot prompt and the default backdrop tint
const TEAMS = {
  cin: { colors: 'black and bright orange tiger-stripe', glow: '#fb4f14' },
  atl: { colors: 'black, red and white',                 glow: '#a71930' },
  ari: { colors: 'cardinal red and white',               glow: '#97233f' },
  buf: { colors: 'royal blue, red and white',            glow: '#00338d' },
  sf:  { colors: 'scarlet red and metallic gold',        glow: '#aa0000' },
  kc:  { colors: 'bright red, gold and white',           glow: '#e31837' },
  phi: { colors: 'midnight green, black and white',      glow: '#1a5f57' },
  min: { colors: 'deep purple and gold',                 glow: '#4f2683' },
};
const ACTION = {
  WR: 'leaping to make a dramatic one-handed catch',
  RB: 'breaking a tackle on an explosive run, ball tucked tight',
  QB: 'firing a deep pass downfield, throwing arm cocked back',
  TE: 'powering through contact after a catch over the middle',
};

// Real player photos keyed by ESPN pid, resolved by photoUrl(). A value is
// either a vendored asset under assets/ (used as-is, served same-origin) or a
// bare Wikimedia Commons file title resolved through Special:FilePath (Wikimedia
// does the redirect and clamps ?width to the original, so no dead thumbnails).
//
// Prefer genuine in-game ACTION frames. Every roster player gets a photo: a
// direct shot of the player where one exists, else a same-team action shot
// (the chrome supplies the player's name, so a teammate in the right uniform
// reads right).
const PHOTO = {
  4362628: 'assets/jamarr-chase.jpg',                        // Ja'Marr Chase (CIN) — supplied in-game action shot (vendored, Bengals white)
  4262921: 'Justin Jefferson Commanders vs Vikings NOV2022.jpg', // Justin Jefferson (MIN) — in-game, Vikings purple
  4430807: '2025 Commanders at Falcons 11.jpg',              // Bijan Robinson (ATL) — in-game action, Falcons (Sept 2025; from his Commons category)
  3139477: 'Patrick Mahomes (51616341245).jpg',             // Patrick Mahomes (KC) — in-game
  3040151: 'George Kittle 2019 (48940368597).jpg',          // George Kittle (SF) — in-game, 49ers red
  3915511: 'Joe Burrow Bengals.jpg',                        // Joe Burrow (CIN) — direct, Bengals
  3918298: 'Josh Allen (43569465444).jpg',                  // Josh Allen (BUF) — in-game, Bills (rookie-year frame)
  3929630: 'Saquon Barkley 112024.jpg',                     // Saquon Barkley (PHI) — in-game, Eagles (Nov 2024)
  4361307: 'assets/trey-mcbride.jpg',                       // Trey McBride (ARI) — supplied in-game action shot (vendored, Cardinals red)
};
// A PHOTO value is either a vendored asset path / absolute URL (used as-is) or
// a bare Commons file title resolved through Special:FilePath (Wikimedia does
// the redirect and clamps ?width to the original, so no dead thumbnails).
const photoUrl = (v, w = 1280) =>
  /^(assets\/|https?:)/.test(v) ? v
    : `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(v)}?width=${w}`;
// ESPN headshot (deterministic by pid, same host as the team logos) — a
// guaranteed last-resort so a mockup is never blank if a Commons file fails.
const HEADSHOT = pid => `https://a.espncdn.com/i/headshots/nfl/players/full/${pid}.png`;

/* ── The three signals (for the explainer cards) ───────────────────── */
const SIGNALS = [
  { icon: '📍', key: 'geo', name: 'Geography', source: 'IP → DMA + weekly blackout map',
    job: 'Double duty: who’s most-drafted here, and which of their games is blacked out here.' },
  { icon: '😰', key: 'day', name: 'Day → Emotion', source: 'Calendar lookup',
    job: 'The frame. Monday grief, Sunday-morning panic, Sunday-afternoon helplessness — the tone of the spot.' },
  { icon: '🏈', key: 'player', name: 'Popular players', source: 'Yahoo ownership + Genius Sports data, geo-filtered',
    job: 'The hook. The most popular player per position in that market — Yahoo fantasy ownership blended with Genius Sports engagement data. Four faces, one machine.' },
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

/* ── Markets — city held constant, day flips the mood ──────────────── */
const MARKETS = [
  {
    id: 'cle', city: 'Cleveland', dma: 'Cleveland-Akron',
    geoClause: 'same state, still out of market', punchline: 'Same state. Different screen.',
    roster: [
      { pos: 'QB', name: 'Joe Burrow',     team: 'cin', city: 'Cincinnati',   pid: 3915511 },
      { pos: 'RB', name: 'Bijan Robinson',  team: 'atl', city: 'Atlanta',      pid: 4430807 },
      { pos: 'WR', name: "Ja'Marr Chase",   team: 'cin', city: 'Cincinnati',   pid: 4362628, hook: true },
      { pos: 'TE', name: 'Trey McBride',    team: 'ari', city: 'Arizona',      pid: 4361307 },
    ],
  },
  {
    id: 'nyc', city: 'New York', dma: 'New York',
    geoClause: 'off your local Fox and CBS', punchline: 'Different screen entirely.',
    roster: [
      { pos: 'QB', name: 'Josh Allen',     team: 'buf', city: 'Buffalo',       pid: 3918298 },
      { pos: 'RB', name: 'Bijan Robinson', team: 'atl', city: 'Atlanta',       pid: 4430807 },
      { pos: 'WR', name: "Ja'Marr Chase",  team: 'cin', city: 'Cincinnati',    pid: 4362628, hook: true },
      { pos: 'TE', name: 'George Kittle',  team: 'sf',  city: 'San Francisco', pid: 3040151 },
    ],
  },
  {
    id: 'la', city: 'Los Angeles', dma: 'Los Angeles',
    geoClause: '1,900 miles out of market', punchline: 'A different time zone, a different screen.',
    roster: [
      { pos: 'QB', name: 'Patrick Mahomes',  team: 'kc',  city: 'Kansas City',  pid: 3139477 },
      { pos: 'RB', name: 'Saquon Barkley',   team: 'phi', city: 'Philadelphia', pid: 3929630 },
      { pos: 'WR', name: 'Justin Jefferson', team: 'min', city: 'Minnesota',    pid: 4262921, hook: true },
      { pos: 'TE', name: 'George Kittle',    team: 'sf',  city: 'San Francisco', pid: 3040151 },
    ],
  },
  {
    id: 'chi', city: 'Chicago', dma: 'Chicago',
    geoClause: 'a division rival you still can’t watch', punchline: 'Same division. Still blacked out.',
    roster: [
      { pos: 'QB', name: 'Josh Allen',       team: 'buf', city: 'Buffalo',    pid: 3918298 },
      { pos: 'RB', name: 'Bijan Robinson',   team: 'atl', city: 'Atlanta',    pid: 4430807 },
      { pos: 'WR', name: 'Justin Jefferson', team: 'min', city: 'Minnesota',  pid: 4262921, hook: true },
      { pos: 'TE', name: 'Trey McBride',     team: 'ari', city: 'Arizona',    pid: 4361307 },
    ],
  },
];

/* ── Three headline variants per mockup. Same image, different copy. ──
   The hook is always: this player is the most-drafted at his position in
   this market — and you'll miss him without Sunday Ticket. ── */
const firstName = p => p.name.split(' ')[0];
// eyebrow: the popularity-in-this-geography fact
const EYEBROW = (m, p) => `${p.name} — ${m.city}’s most-drafted fantasy ${p.pos} this week`;
// Three headlines PER DAY, each tuned to that day's emotion. Same image,
// three selectable copy versions — the tone tracks the calendar (Monday grief
// is rueful; Sunday-morning panic is all-caps countdown energy). The hook is
// always: this is the most-popular player at his position in this market, and
// you'll miss him without Sunday Ticket.
const DAY_HEADLINES = {
  // Monday — grief, rueful morning-after
  'mon': [
    (m, d, p) => `Monday grief: you’re mourning a ${firstName(p)} game you never saw.`,
    (m, d, p) => `RIP your weekend. ${firstName(p)} went off — you got the box score.`,
    (m, d, p) => `Five stages of grief. You’re stuck on “${firstName(p)} did WHAT?”`,
  ],
  // Tuesday — resentment turning to hope, the fresh-start pivot
  'tue': [
    (m, d, p) => `New week, same blackout: ${firstName(p)} still isn’t on your TV.`,
    (m, d, p) => `The waiver wire’s open. Your channel lineup isn’t.`,
    (m, d, p) => `Hope is a ${m.city} fan refreshing ${firstName(p)}’s stat line.`,
  ],
  // Wednesday — anxious gambling, wry and knowing
  'wed': [
    (m, d, p) => `You’d bet the house on ${firstName(p)}. You can’t even watch him.`,
    (m, d, p) => `Hump-day math: 100% rostered, 0% on your screen.`,
    (m, d, p) => `${firstName(p)}’s a lock this week. Seeing him? Long odds.`,
  ],
  // Thursday — reckless commitment, the contrast (a game you CAN see)
  'thu': [
    (m, d, p) => `Tonight you get a game. Sunday, ${firstName(p)} vanishes.`,
    (m, d, p) => `Thursday’s on. ${firstName(p)}? Out of market, out of luck.`,
    (m, d, p) => `Enjoy the one game they give you — ${firstName(p)} isn’t in it.`,
  ],
  // Friday — studious dread, prep-mode and ominous
  'fri': [
    (m, d, p) => `You studied every matchup. ${firstName(p)}’s won’t be on your TV.`,
    (m, d, p) => `Friday prep, Sunday dread: ${firstName(p)} plays where you can’t look.`,
    (m, d, p) => `Lineup locked, ${firstName(p)} in — your channels still don’t carry him.`,
  ],
  // Saturday — restless second-guessing, coiled and anticipatory
  'sat': [
    (m, d, p) => `Start ${firstName(p)}? Bench him? Moot if you can’t see him.`,
    (m, d, p) => `One sleep till kickoff. Zero chance ${m.city} airs ${firstName(p)}.`,
    (m, d, p) => `Saturday scaries: tomorrow ${firstName(p)} plays off your channels.`,
  ],
  // Sunday morning — PEAK PANIC, urgent countdown energy
  'sun-am': [
    (m, d, p) => `KICKOFF IN 1 HOUR — and ${firstName(p)} is on ZERO ${m.city} channels. 😰`,
    (m, d, p) => `PANIC: your ${p.pos}1 ${firstName(p)} is BLACKED OUT. Right. Now.`,
    (m, d, p) => `Lineups lock, ${firstName(p)} kicks off — your TV has the pregame show.`,
  ],
  // Sunday afternoon — helplessness, the core wound, present tense
  'sun-pm': [
    (m, d, p) => `${firstName(p)} is scoring RIGHT NOW — on a screen ${m.city} doesn’t get.`,
    (m, d, p) => `${firstName(p)} just went off. You’re watching a progress bar.`,
    (m, d, p) => `Somewhere ${firstName(p)} is winning your week. Not on your TV.`,
  ],
  // Sunday night — exhausted hope, spent and hanging by a thread
  'sun-night': [
    (m, d, p) => `Primetime, and your season’s riding on ${firstName(p)} — off-channel.`,
    (m, d, p) => `One player left: ${firstName(p)}. Of course you can’t see him.`,
    (m, d, p) => `Last hope, ${firstName(p)} — playing on everything but your TV.`,
  ],
};
// VARIANTS pulls version 1/2/3 for the selected day, with a safe fallback.
const VARIANTS = [0, 1, 2].map(i => (m, d, p) =>
  (DAY_HEADLINES[d.id] || DAY_HEADLINES['sun-pm'])[i](m, d, p));

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
  const p = m.roster.find(r => r.hook);
  document.getElementById('weekRail').innerHTML = DAYS.map(d => `
    <button class="mini" data-day="${d.id}" style="--accent:${d.accent}">
      <span class="mini__top"><span class="mini__day">${d.short}</span><span class="mini__brand">▶ Sunday Ticket</span></span>
      <span class="mini__emo">${d.emotion}</span>
      <span class="mini__hl">${VARIANTS[2](m, d, p)}</span>
      <img class="mini__logo" src="${ESPN_LOGO(p.team)}" alt="" loading="lazy" />
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
  // 1 · Aggregate — popularity ranked by DMA (real markets, hook player per market)
  const dmas = document.getElementById('prodDmas');
  if (dmas) {
    dmas.innerHTML = MARKETS.map(m => {
      const p = m.roster.find(r => r.hook) || m.roster[0];
      return `<div class="dma">
        <span class="dma__city">${m.city}</span>
        <span class="dma__dma">${m.dma} DMA</span>
        <span class="dma__top"><img src="${ESPN_LOGO(p.team)}" alt="" loading="lazy" />${p.name}</span>
      </div>`;
    }).join('');
    document.getElementById('prodDmaMore').textContent = `+ ${210 - MARKETS.length} more U.S. DMAs`;
  }

  // 3 · Push to CTV — one fresh asset per day of the week
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
  const pos = document.getElementById('selPos').value;
  const p = m.roster.find(r => r.pos === pos);
  return { m, d, p };
}

function buildMixer() {
  document.getElementById('selMarket').innerHTML = MARKETS.map(m => `<option value="${m.id}">${m.city}</option>`).join('');
  document.getElementById('selDay').innerHTML = DAYS.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  document.getElementById('selPos').innerHTML = ['WR', 'QB', 'RB', 'TE'].map(p => `<option value="${p}">${p}</option>`).join('');

  document.getElementById('selDay').value = beatForToday();

  ['selMarket', 'selDay', 'selPos'].forEach(id =>
    document.getElementById(id).addEventListener('change', () => { stopReel(); renderMixer(); }));
  document.getElementById('genBtn').addEventListener('click', () => { stopReel(); generateAsset(); });
  document.getElementById('randBtn').addEventListener('click', randomize);
  document.getElementById('reelBtn').addEventListener('click', toggleReel);
  renderMixer(true);
}

/* ── slot-machine randomize (feature 4) ──────────────────────────────
   The three signal selects "roll" and clunk into place one by one, with
   the whole mockup rolling through combos behind a blur. */
const POS = ['WR', 'QB', 'RB', 'TE'];
const pick = a => a[Math.floor(Math.random() * a.length)];
let spinning = false;
function randomize() {
  if (spinning) return;
  stopReel();
  const mEl = document.getElementById('selMarket');
  const dEl = document.getElementById('selDay');
  const pEl = document.getElementById('selPos');
  const finalM = pick(MARKETS).id, finalD = pick(DAYS).id, finalP = pick(POS);

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    mEl.value = finalM; dEl.value = finalD; pEl.value = finalP;
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
  let mDone = false, dDone = false;
  const flick = setInterval(() => {
    if (!mDone) mEl.value = pick(mIds);
    if (!dDone) dEl.value = pick(dIds);
    pEl.value = pick(POS);
    renderMixer(true);            // instant roll of the whole mockup
  }, 75);

  // settle one reel at a time — market, then day, then position
  setTimeout(() => { mDone = true; mEl.value = finalM; }, 520);
  setTimeout(() => { dDone = true; dEl.value = finalD; }, 720);
  setTimeout(() => {
    clearInterval(flick);
    pEl.value = finalP;
    ctv.classList.remove('is-spinning');
    controls.classList.remove('is-spinning');
    btn.disabled = false;
    spinning = false;
    renderMixer();                // final settle, with the headline retype
  }, 920);
}

/* ── headline typewriter / glitch (feature 5) ────────────────────────
   Retypes the headline on every change. Panic days type fast with a
   glitch flicker; slower, heavier emotions type calmly. */
let headlineToken = 0;
function typeHeadline(text, emotion) {
  const el = document.getElementById('ctvHeadline');
  if (!el) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = text; return; }
  const token = ++headlineToken;
  const panic = /panic/i.test(emotion || '');
  const base = panic ? 13 : 28;
  const glyphs = '#%&X0/\\*';
  el.classList.add('is-typing');
  let i = 0;
  const step = () => {
    if (token !== headlineToken) return;             // a newer headline superseded us
    if (i <= text.length) {
      const glitch = (panic && i < text.length) ? glyphs[Math.floor(Math.random() * glyphs.length)] : '';
      el.textContent = text.slice(0, i) + glitch;
      i++;
      setTimeout(step, base + (panic ? Math.random() * 38 : 0));
    } else {
      el.textContent = text;
      el.classList.remove('is-typing');
    }
  };
  step();
}

/* ── engine auto-reel (feature 3) ────────────────────────────────────
   Cycles market → day → player every couple seconds so the engine
   visibly renders a new asset on its own. Uses curated photos (instant,
   no Gemini call). */
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
    document.getElementById('selPos').value = pick(POS);
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

/* ── odometer count-up (feature 3) ───────────────────────────────────*/
function animateOdometer() {
  const el = document.getElementById('odoNum');
  if (!el) return;
  const target = 20160; // 210 DMAs × 8 day-moods × 4 positions × 3 versions
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

/* ── location detection (feature 1), with an opt-out ─────────────────*/
const GEO_OFF = 'ytst_geo_off';
const geoEnabled = () => localStorage.getItem(GEO_OFF) !== '1';
// US state/region → nearest of our four sample markets
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
      status.innerHTML = `📍 Detected near <strong>${g.city || mk.region || mk.city}</strong> — showing the ${mk.city} market.`;
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
  const { m, d, p } = currentSel();
  const ctv = document.getElementById('ctv');
  ctv.style.setProperty('--accent', d.accent);
  ctv.style.setProperty('--team', (TEAMS[p.team] || {}).glow || d.accent);
  const room = document.getElementById('room');
  if (room) {
    room.style.setProperty('--accent', d.accent);
    room.style.setProperty('--team', (TEAMS[p.team] || {}).glow || d.accent);
  }

  document.getElementById('emoNote').textContent = `${d.emotion} — ${d.register}.`;
  document.getElementById('playerNote').innerHTML =
    `${p.name} · ${p.city} (${p.team.toUpperCase()}) — out-of-market in ${m.city}.`;

  document.getElementById('ctvEyebrow').textContent = EYEBROW(m, p);
  const headline = VARIANTS[variantIdx](m, d, p);
  if (instant) document.getElementById('ctvHeadline').textContent = headline;
  else typeHeadline(headline, d.emotion);
  document.getElementById('stageCap').textContent =
    `Geography: ${m.dma} · Day→Emotion: ${d.emotion} · Player: ${p.name} (${p.team.toUpperCase()})`;
  renderVariants(m, d, p);

  // generated shot → real photo → team backdrop, in that order
  applyMedia(imagePrompt(m, d, p), p);
}

/* three copy versions of the same mockup — click to load one into the asset */
let variantIdx = 0;
function renderVariants(m, d, p) {
  const wrap = document.getElementById('variantTabs');
  wrap.innerHTML = VARIANTS.map((fn, i) => `
    <button class="vtab ${i === variantIdx ? 'is-active' : ''}" data-v="${i}">
      <span class="vtab__n">Version ${i + 1}</span>
      <span class="vtab__hl">${fn(m, d, p)}</span>
    </button>`).join('');
  wrap.querySelectorAll('.vtab').forEach(b => b.addEventListener('click', () => {
    variantIdx = +b.dataset.v;
    typeHeadline(VARIANTS[variantIdx](m, d, p), d.emotion);
    wrap.querySelectorAll('.vtab').forEach(x => x.classList.toggle('is-active', x === b));
  }));
}

/* client-side cache: re-viewing a combo is instant, no re-generation */
const imgCache = {};
function applyMedia(prompt, p) {
  const media = document.getElementById('ctvMedia');
  const ctv = document.getElementById('ctv');
  // Monotonic token: a probe that resolves after the user has moved on is stale
  // and must not overwrite the newer selection.
  const token = (media._mediaToken = (media._mediaToken || 0) + 1);
  const current = () => media._mediaToken === token;

  const backdrop = () => {                 // last resort: team-tinted plate
    media.style.cssText = '';
    ctv.classList.remove('has-img');
  };
  // ESPN headshot composited over a team-tinted plate. Guaranteed to render
  // (deterministic per pid), so a mockup is never left blank.
  const headshot = () => {
    if (!p) return backdrop();
    const url = HEADSHOT(p.pid);
    media.style.backgroundImage =
      `url("${url}"),` +
      'radial-gradient(120% 120% at 74% 14%, color-mix(in srgb, var(--team, var(--accent)) 55%, transparent), transparent 62%),' +
      'linear-gradient(160deg, #14232f, #060a10 72%)';
    media.style.backgroundSize = 'auto 96%, cover, cover';
    media.style.backgroundPosition = 'right 4% bottom, center, center';
    media.style.backgroundRepeat = 'no-repeat';
    ctv.classList.add('has-img');
    const probe = new Image();
    probe.onerror = () => { if (current()) backdrop(); };
    probe.src = url;
  };
  // A full-bleed photo (curated Commons shot, or a generated Gemini shot).
  const fill = (url, pos, onfail) => {
    media.style.backgroundImage = `url("${url}")`;
    media.style.backgroundSize = 'cover';
    media.style.backgroundPosition = pos;
    media.style.backgroundRepeat = 'no-repeat';
    ctv.classList.add('has-img');
    if (!onfail) return;
    const probe = new Image();
    probe.onerror = () => { if (current()) onfail(); };
    probe.src = url;
  };

  if (imgCache[prompt]) {                  // a generated Gemini shot wins
    fill(imgCache[prompt], 'center');
  } else if (p && PHOTO[p.pid]) {          // curated real photo, headshot on failure
    // Anchor to the top so the player's head is always in frame: a tall photo
    // cropped to 16:9 shows only its middle band at 'center', which slices
    // heads off — 'top' keeps them; 'center' horizontally keeps a wide
    // (landscape) subject from being cropped out the side.
    fill(photoUrl(PHOTO[p.pid]), 'center top', headshot);
  } else {                                 // no curated entry → headshot
    headshot();
  }
}

/* image prompt — a clean photographic plate; our chrome supplies all text/branding */
function imagePrompt(m, d, p) {
  const t = TEAMS[p.team] || { colors: `${p.city} team colors` };
  return [
    'Cinematic, photoreal 16:9 sports-photography action shot for a connected-TV advertisement.',
    `Subject: a professional American-football ${p.pos} in a generic ${t.colors} uniform, ${ACTION[p.pos]}, under dramatic stadium floodlights.`,
    'Real photographic style: motion blur, turf spray, shallow depth of field, telephoto compression, premium broadcast mood.',
    `Emotional tone: ${d.emotion.toLowerCase()} — ${d.register.toLowerCase()}.`,
    'Keep the left third darker and clean as copy space for an overlaid headline.',
    'No readable text, no numbers, no team names, no logos, no jersey lettering, no sponsor marks, no watermarks.',
  ].join(' ');
}

async function generateAsset() {
  const { m, d, p } = currentSel();
  const prompt = imagePrompt(m, d, p);
  const btn = document.getElementById('genBtn');
  const loader = document.getElementById('ctvLoader');
  const status = document.getElementById('genStatus');

  // already rendered this exact combo — show it instantly
  if (imgCache[prompt]) {
    applyMedia(prompt, p);
    status.textContent = '✓ Showing saved render — change a signal for a new one.';
    return;
  }

  btn.disabled = true;
  loader.hidden = false;
  status.textContent = 'Generating with Gemini…';
  const txt = document.getElementById('ctvLoaderTxt');

  // live elapsed counter so the wait never looks frozen
  const t0 = Date.now();
  const tick = setInterval(() => {
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    txt.textContent = `Generating with Gemini… ${s}s`;
  }, 250);

  // hard ceiling so a hung request can't spin forever
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
        ? 'Add YTST_KEY in Vercel to generate the photographic hero — showing the styled preview.'
        : (data.message || data.error || `Generation failed (${res.status}).`);
      throw new Error(reason);
    }
    imgCache[prompt] = data.image;
    applyMedia(prompt, p);
    status.textContent = `✓ Hero generated in ${((Date.now() - t0) / 1000).toFixed(1)}s.`;
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
  document.getElementById('todayMsg').textContent = `${d.emotion} — today's spot writes itself in this register.`;
  document.getElementById('todayChip').hidden = false;
}

/* ── hero video: deferred load (Beckett treatment) ─────────────────── */
function initHeroVideo() {
  const v = document.getElementById('heroVid');
  if (!v) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduce || saveData) return; // keep the poster still; never autoplay
  // defer the fetch until the page is otherwise loaded, so it never blocks paint
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
initGeo();          // detects market + seeds the mixer (after buildMixer)
