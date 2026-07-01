/* ════════════════════════════════════════════════════════════════════
   SUNDAY M.I.A.
   A contextual CTV engine for YouTube Sunday Ticket × Fantasy.

   Three live signals fill one template — an AD OF EIGHT:
     • DMA        (IP → DMA + weekly blackout map)     — double duty
     • DAY → EMOTION  (calendar)                       — the collective tone
     • THE EIGHT  (Genius Sports projections, geo-filt) — the players
       projected to perform best this week, shown together, never one face.

   The eight are shown EQUAL WEIGHT — a group feature, never a solo
   endorsement (NFLPA group-licensing safe). The DMA filters the week's
   top-projected players to the out-of-market ones and defines the blackout;
   the day sets the mood; Gemini renders the generic stadium backdrop behind
   them (no player likeness in the generated art).

   Players / teams are illustrative for the pitch; the live engine pulls the
   real eight highest-projected each week from Genius Sports, geo-filtered.
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
  { icon: '📍', key: 'geo', name: 'DMA', source: 'IP → DMA + weekly blackout map',
    job: 'Double duty: which of the week’s top-projected players are out of market here, and which of their games is blacked out here.' },
  { icon: '😰', key: 'day', name: 'Day → Emotion', source: 'Calendar lookup',
    job: 'The frame. Monday grief, Sunday-morning panic, Sunday-afternoon helplessness — the tone of the whole ad.' },
  { icon: '🏈', key: 'player', name: 'The eight', source: 'Genius Sports performance projections, geo-filtered',
    job: 'The wound. The eight players projected to perform best this week — modeled on Genius Sports performance data, then geo-filtered to the ones out of market. Shown together, equal weight, never a single face.' },
];

/* ── Day → emotion tone grid ───────────────────────────────────────── */
const DAYS = [
  { id: 'mon',       short: 'Mon',  name: 'Monday',            dow: 1, emotion: 'Grief',                 register: 'Rueful, the morning-after',        accent: '#5b8cff' },
  { id: 'tue',       short: 'Tue',  name: 'Tuesday',           dow: 2, emotion: 'Resentment → hope',     register: 'The fresh-start pivot',            accent: '#3fb6a8' },
  { id: 'wed',       short: 'Wed',  name: 'Wednesday',         dow: 3, emotion: 'Anxious gambling',      register: 'Wry, knowing',                     accent: '#e0a83d' },
  { id: 'thu',       short: 'Thu',  name: 'Thursday',          dow: 4, emotion: 'Reckless commitment',   register: 'The contrast — a game you can see', accent: '#ff7a3d' },
  { id: 'fri',       short: 'Fri',  name: 'Friday',            dow: 5, emotion: 'Studious dread',        register: 'Prep-mode, ominous',               accent: '#9b6cff' },
  { id: 'sat',       short: 'Sat',  name: 'Saturday',          dow: 6, emotion: 'Restless 2nd-guessing', register: 'Coiled, anticipatory',             accent: '#ff944d' },
  { id: 'sun',       short: 'Sun',  name: 'Sunday',            dow: 0, emotion: 'Helplessness',          register: 'The core wound — present tense',    accent: '#ff2d2d' },
];

/* ── Headlines — playful, witty, concise. ONE best headline per day, each
   carrying that day's EMOTION (Mon grief → Sun-night exhausted hope). Each
   is a [lead, punch] pair: the lead sets it up (big caps), the punch lands
   it (accent italic) — and the two lines rhyme like a little couplet. ── */
const DAY_HEADLINES = {
  'mon': m => ['Your studs all hit their peak.', 'Your TV stayed bleak.'],
  'tue': m => ['New week, new waiver dreams.', 'Same off-air schemes.'],
  'wed': m => ['Eight stone-cold locks.', 'Zero on your box.'],
  'thu': m => ['One game on tonight.', 'Then they’re out of sight.'],
  'fri': m => ['Lineup locked and read.', 'Your channels fill with dread.'],
  'sat': m => ['Start ’em? Sit ’em?', 'You can’t even get ’em.'],
  'sun': m => ['Your guys are cooking hot.', 'You? A buffering dot.'],
};
// the single best [lead, punch] pair for the selected day
const headline = (m, d) => (DAY_HEADLINES[d.id] || DAY_HEADLINES['sun'])(m);
const headlineText = (m, d) => headline(m, d).join(' ');

// eyebrow: this week's highest-projected players (Genius Sports), localized
const EYEBROW = m => `This week’s top-projected players in ${m.city}`;
const surname = name => name.split(' ').slice(1).join(' ');

/* ════════════════════ SECTION 01 — explainer ════════════════════ */
function buildSignals() {
  document.getElementById('signals').innerHTML = SIGNALS.map(s => `
    <article class="sig sig--${s.key}">
      <div class="sig__icon">${s.icon}</div>
      <h3>${s.name}</h3>
      <div class="sig__src">${s.source}</div>
      <p class="sig__job">${s.job}</p>
      ${s.key === 'player' ? '<div class="sig__logos"><img class="sig__srclogo" src="assets/genius-sports.svg" alt="Genius Sports" /></div>' : ''}
    </article>`).join('<div class="sig-x" aria-hidden="true">×</div>');
}

function buildWeekRail() {
  const m = MARKETS[0]; // Cleveland
  const logos = m.board.slice(0, 4)
    .map(p => `<img class="mini__lg" src="${ESPN_LOGO(p.team)}" alt="" loading="lazy" />`).join('');
  document.getElementById('weekRail').innerHTML = DAYS.map(d => `
    <button class="mini" data-day="${d.id}" style="--accent:${d.accent}">
      <span class="mini__rings" aria-hidden="true"></span>
      <span class="mini__top"><span class="mini__day">${d.name}</span><span class="mini__brand">▶ Sunday Ticket</span></span>
      <span class="mini__body">
        <span class="mini__emo">${d.emotion}</span>
        <span class="mini__hl">${headlineText(m, d)}</span>
        <span class="mini__logos">${logos}<span class="mini__more">+4</span></span>
      </span>
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
  // 1 · Aggregate — the eight top-projected, filtered out-of-market by DMA (logo stack)
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
    document.getElementById(id).addEventListener('change', () => { stopSpot(); renderMixer(); }));
  document.getElementById('genBtn').addEventListener('click', async () => {
    if (spotPlaying) { stopSpot(); return; }   // playing → this click stops it
    stopSpot();
    await generateBackdrop();                  // composite the backdrop…
    if (!spotPlaying) playSpot();              // …then play the finished :15 spot
  });
  document.getElementById('randBtn').addEventListener('click', randomize);
  renderMixer(true);
}

/* ── slot-machine randomize ──────────────────────────────────────────
   The two signal selects "roll" and clunk into place — market, then day —
   with the whole board rolling through combos behind a blur. */
const pick = a => a[Math.floor(Math.random() * a.length)];
let spinning = false;
function randomize() {
  if (spinning) return;
  stopSpot();
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
  const [lead, accent] = headline(m, d);
  const h = document.getElementById('ctvHeadline');
  const leadEl = document.getElementById('ctvHlLead');
  const accEl = document.getElementById('ctvHlAccent');
  if (!h) return;
  leadEl.textContent = lead;
  accEl.textContent = accent;
  accEl.dataset.text = accent;                 // feeds the glitch pseudo-elements
  accEl.style.display = accent ? '' : 'none';
  if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  h.classList.remove('is-reveal');
  void h.offsetWidth;                                // restart the reveal animation
  h.classList.add('is-reveal');
}

/* ── :15 CTV spot playthrough ─────────────────────────────────────────
   Plays the current ad as a scripted 15-second spot: brand ident → the
   eight cascade in → players cut to TV static as the headline lands →
   payoff + CTA slam → QR end card, under a live "Ad · 0:15" countdown.
   Then it restores the static resting frame. Works on whatever market /
   day / version is loaded — i.e. on every ad the engine can render. */
const SPOT_MS = 15000;
let spotPlaying = false;
let spotTimers = [];
let spotCountdown = null;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const later = (fn, t) => { spotTimers.push(setTimeout(fn, t)); };


function setSpotPhase(phase) {
  const ctv = document.getElementById('ctv');
  ['spot-ident', 'spot-build', 'spot-wound', 'spot-payoff', 'spot-end']
    .forEach(c => ctv.classList.toggle(c, c === phase));
}

function playSpot() {
  if (spotPlaying || spinning) return;
  stopSpot();                                   // clean slate
  const ctv = document.getElementById('ctv');
  const lbl = document.getElementById('genBtnLbl');
  spotPlaying = true;
  if (lbl) lbl.textContent = 'Stop the spot';
  ctv.classList.add('is-spot');

  // reduced motion → no choreography, just resolve to the end card
  if (reduceMotion()) {
    setSpotPhase('spot-end');
    document.getElementById('ctvAdTime').textContent = '0:00';
    return;
  }

  // arm the countdown + the 15s progress bar
  const time = document.getElementById('ctvAdTime');
  ctv.classList.remove('is-running'); void ctv.offsetWidth; ctv.classList.add('is-running');
  time.textContent = '0:15';
  const t0 = performance.now();
  spotCountdown = setInterval(() => {
    const left = Math.max(0, Math.ceil((SPOT_MS - (performance.now() - t0)) / 1000));
    time.textContent = `0:${String(left).padStart(2, '0')}`;
    if (left <= 0) { clearInterval(spotCountdown); spotCountdown = null; }
  }, 250);

  // beat 1 — brand ident
  setSpotPhase('spot-ident');

  // beat 2 — the eight cascade in
  later(() => {
    setSpotPhase('spot-build');
    document.querySelectorAll('#ctvBoard .bcard')
      .forEach((c, i) => later(() => c.classList.add('spot-card-in'), i * 330));
  }, 1700);

  // beat 3 — players cut to static, the headline lands
  later(() => {
    setSpotPhase('spot-wound');
    document.querySelectorAll('#ctvBoard .bcard').forEach((c, i) => later(() => {
      c.classList.remove('is-glitch'); void c.offsetWidth; c.classList.add('is-glitch');
      later(() => c.classList.remove('is-glitch'), 600);
    }, i * 210));
  }, 5200);

  // beat 4 — payoff bar + CTA slam in
  later(() => setSpotPhase('spot-payoff'), 9000);

  // beat 5 — QR end card
  later(() => setSpotPhase('spot-end'), 12400);

  // restore the resting frame
  later(() => stopSpot(), SPOT_MS);
}

function stopSpot() {
  spotTimers.forEach(clearTimeout); spotTimers = [];
  if (spotCountdown) { clearInterval(spotCountdown); spotCountdown = null; }
  const ctv = document.getElementById('ctv');
  const wasPlaying = spotPlaying || (ctv && ctv.classList.contains('is-spot'));
  if (ctv) ctv.classList.remove('is-spot', 'is-running', 'spot-ident', 'spot-build', 'spot-wound', 'spot-payoff', 'spot-end');
  spotPlaying = false;
  const lbl = document.getElementById('genBtnLbl');
  if (lbl) lbl.textContent = 'Generate the contextual ad';
  if (wasPlaying) renderMixer(true);            // rebuild the clean static frame
}

/* auto-play the spot once, the first time the mock-up scrolls into view */
function initSpotAutoplay() {
  const room = document.getElementById('room');
  if (!room || reduceMotion() || !('IntersectionObserver' in window)) return;
  let fired = false;
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting && !fired) {
      fired = true; io.disconnect();
      setTimeout(() => { if (!spotPlaying && !spinning) playSpot(); }, 450);
    }
  }), { threshold: 0.55 });
  io.observe(room);
}

/* ── odometer count-up ───────────────────────────────────────────────*/
function animateOdometer() {
  const el = document.getElementById('odoNum');
  if (!el) return;
  const target = 1470; // 210 DMAs × 7 days — one best ad per DMA / day
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
      stopSpot();
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
  const hit = DAYS.find(d => d.dow === dow);
  return hit ? hit.id : 'sun';
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
    `<strong>8 top-projected starters</strong> · all out-of-market in ${m.city}.`;

  document.getElementById('ctvEyebrow').textContent = EYEBROW(m);
  setHeadline(m, d, instant);
  document.getElementById('stageCap').textContent =
    `DMA: ${m.dma} · Day→Emotion: ${d.emotion} · Ad: this week’s 8 top-projected, out-of-market in ${m.city}`;
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
  document.getElementById('todayMsg').textContent = `${d.emotion} — today's ad writes itself in this register.`;
  document.getElementById('todayChip').hidden = false;
}

/* ── random signal glitch on the board, one player at a time ───────── */
/* ── INSIGHT — glitch-swap the stakes phrase with "fantasy sports" ─────
   Every few seconds the lime phrase glitches (chromatic split) and, mid-
   glitch, swaps between the two readings. Only runs while it's on screen. */
function initInsightGlitch() {
  const el = document.querySelector('.insight__stakes');
  if (!el) return;
  const words  = ['something even higher stakes', 'fantasy sports'];
  const colors = ['#5b8cff', '#d4ff3d'];   // stakes = blue · fantasy sports = lime
  let i = 0;
  el.style.color = colors[0];
  const swap = () => { i ^= 1; el.textContent = words[i]; el.style.color = colors[i]; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let onScreen = true;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { onScreen = e.isIntersecting; }), { threshold: 0.2 });
    io.observe(el);
  }
  setInterval(() => {
    if (!onScreen || document.hidden) return;
    if (reduce) { swap(); return; }
    el.classList.add('is-glitching');
    setTimeout(swap, 150);                                  // swap mid-glitch
    setTimeout(() => el.classList.remove('is-glitching'), 440);
  }, 2900);
}

function initBoardGlitch() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const run = () => {
    if (spotPlaying) { setTimeout(run, 900); return; }   // the spot drives its own glitches
    const cards = document.querySelectorAll('#ctvBoard .bcard');
    if (cards.length) {
      const c = cards[Math.floor(Math.random() * cards.length)];
      c.classList.add('is-glitch');
      setTimeout(() => c.classList.remove('is-glitch'), 600);
    }
    setTimeout(run, 650 + Math.random() * 1500);   // next glitch after a random gap
  };
  setTimeout(run, 1400);
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
initBoardGlitch();
initInsightGlitch(); // glitch-swaps the INSIGHT stakes phrase with "fantasy sports"
initSpotAutoplay(); // plays the :15 spot once when the mock-up scrolls into view
initGeo();          // detects market + seeds the mixer (after buildMixer)
