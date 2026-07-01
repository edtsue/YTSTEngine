/* ════════════════════════════════════════════════════════════════════
   SET YOUR SUNDAY
   A contextual CTV engine for YouTube Sunday Ticket × Fantasy.

   The pitch: Genius Sports data helps fantasy managers set a smarter lineup
   through the week; Sunday Ticket is how they watch it pay off. Three live
   signals fill one template — an AD OF EIGHT:
     • GENIUS DATA (performance projections, usage, matchup) — the advantage
     • PLANNING DAY (calendar)                               — the decision
       you're making today: waivers, matchups, start/sit, lineup lock.
     • THE ELITE EIGHT (Genius top-projected)                — this week's
       must-starts, shown together, equal weight, never one face.

   The eight are shown EQUAL WEIGHT — a group feature, never a solo
   endorsement (NFLPA group-licensing safe). The day sets the decision; the
   data sharpens the call; the payoff line points to a Sunday Ticket utility
   (every game, out-of-market, Fantasy View). Gemini renders the generic
   stadium backdrop behind them (no player likeness in the generated art).

   Players / teams are illustrative for the pitch; the live engine pulls the
   real eight highest-projected each week from Genius Sports.
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

/* ── The Elite Eight: this week's national top-projected must-starts. No
   geo-filter — the city element is gone; the same eight lead the ad all week,
   the DAY changes the decision around them. ── */
const BOARD = POOL.slice(0, 8);

/* ── The three signals (for the explainer cards) ───────────────────── */
const SIGNALS = [
  { icon: '📊', key: 'data', name: 'Genius Sports data', source: 'Performance projections · usage · matchup grades',
    job: 'The advantage. Genius Sports projects who’s about to go off — usage, matchup and snap-count signals turned into a start/sit edge, refreshed every day of the week.' },
  { icon: '🗓️', key: 'day', name: 'The planning day', source: 'Where you are in the fantasy week',
    job: 'The decision. Waivers, matchups, start/sit, lineup lock — the ad meets you at the exact call you’re making today, from Monday planning to Sunday’s 1:00 lock.' },
  { icon: '🏈', key: 'player', name: 'The Elite Eight', source: 'Genius Sports top-projected must-starts',
    job: 'The players. The eight Genius projects highest this week — the names to target and start. Shown together, equal weight, never a single face — and only Sunday Ticket lets you watch every one of them.' },
];

/* ── The fantasy planning cycle: each day is a roster DECISION, paired with
   the Genius data that helps make it. Emotion is out; utility is in. ── */
const DAYS = [
  { id: 'mon',       short: 'Mon',  name: 'Monday',            dow: 1, task: 'Plan the week',       emoji: '📊', register: 'Genius flags the week’s risers',            accent: '#5b8cff' },
  { id: 'tue',       short: 'Tue',  name: 'Tuesday',           dow: 2, task: 'Set your claims',     emoji: '📝', register: 'Projections rank your waiver targets',      accent: '#3fb6a8' },
  { id: 'wed',       short: 'Wed',  name: 'Wednesday',         dow: 3, task: 'Read the matchups',   emoji: '🔍', register: 'Matchup grades sort your starts',           accent: '#e0a83d' },
  { id: 'thu',       short: 'Thu',  name: 'Thursday',          dow: 4, task: 'TNF start / sit',     emoji: '🏈', register: 'Final Thursday-night projections land',      accent: '#ff7a3d' },
  { id: 'fri',       short: 'Fri',  name: 'Friday',            dow: 5, task: 'Injury check',        emoji: '🩹', register: 'Injury-adjusted projections update',         accent: '#9b6cff' },
  { id: 'sat',       short: 'Sat',  name: 'Saturday',          dow: 6, task: 'Finalize the lineup', emoji: '✅', register: 'The model’s best lineup, set',               accent: '#ff944d' },
  { id: 'sun',       short: 'Sun',  name: 'Sunday',            dow: 0, task: 'Lock & watch',        emoji: '🔒', register: 'Last-call projections before the 1:00 lock', accent: '#ff2d2d' },
];

/* ── Headlines — ONE best [lead, payoff] pair per day. Fantasy is played in a
   league of friends, so the stakes are SOCIAL: win the week and you get
   bragging rights in the group chat; blow it and you're the loser they roast.
   The LEAD sits you at the day's roster decision + that social stake (Genius
   data is the edge); the PAYOFF lands the bragging right or the Sunday Ticket
   watch utility. Plan → decide → lock → flex. ── */
const DAY_HEADLINES = {
  'mon': () => ['Last week’s winner won’t stop gloating.', 'This Sunday, you answer back.'],
  'tue': () => ['Claim him before the group chat wakes up.', 'Beat your league to the wire.'],
  'wed': () => ['The matchup data says start him.', 'Bragging rights start Sunday.'],
  'thu': () => ['Forget to set Thursday? The chat never forgets.', 'Catch it in Fantasy View.'],
  'fri': () => ['Injuries hit — fix it before your league notices.', 'Follow them all, out of market.'],
  'sat': () => ['Set the lineup that wins the group chat.', 'Screenshots ready for Sunday.'],
  'sun': () => ['Rosters lock at 1:00. Winners flex, losers cope.', 'Watch every player, every game.'],
};
// the single best [lead, payoff] pair for the selected day
const headline = d => (DAY_HEADLINES[d.id] || DAY_HEADLINES['sun'])();
const headlineText = d => headline(d).join(' ');

// eyebrow: this week's top-projected must-starts (Genius Sports)
const EYEBROW = 'This week’s top-projected must-starts';
const surname = name => name.split(' ').slice(1).join(' ');

/* ════════════════════ SECTION 01 — explainer ════════════════════ */
function buildSignals() {
  document.getElementById('signals').innerHTML = SIGNALS.map(s => `
    <article class="sig sig--${s.key}">
      <div class="sig__icon">${s.icon}</div>
      <h3>${s.name}${s.key === 'data' ? ' <span class="first-badge first-badge--sm">First time ever</span>' : ''}</h3>
      <div class="sig__src">${s.source}</div>
      <p class="sig__job">${s.job}</p>
      ${s.key === 'data' ? '<div class="sig__logos"><img class="sig__srclogo" src="assets/genius-sports.svg" alt="Genius Sports" /></div>' : ''}
    </article>`).join('<div class="sig-x" aria-hidden="true">×</div>');
}

function buildWeekRail() {
  document.getElementById('weekRail').innerHTML = DAYS.map((d, i) => `
    <button class="mini" data-day="${d.id}" style="--accent:${d.accent}">
      <span class="mini__rings" aria-hidden="true"></span>
      <span class="mini__top"><span class="mini__day">${d.name}</span><span class="mini__brand">▶ Sunday Ticket</span></span>
      <span class="mini__body">
        <span class="mini__emo">${d.task}</span>
        <span class="mini__hl">${headlineText(d)}</span>
        <span class="mini__face" aria-hidden="true">${d.emoji}</span>
      </span>
      <span class="mini__scrub" aria-hidden="true">
        <span class="mini__scrub-tag">Ad</span>
        <span class="mini__scrub-bar"><span class="mini__scrub-fill" style="width:${18 + i * 11}%"></span></span>
        <span class="mini__scrub-t">0:15</span>
      </span>
    </button>`).join('');
  document.querySelectorAll('.mini').forEach(b => b.addEventListener('click', () => {
    document.getElementById('selDay').value = b.dataset.day;
    renderMixer();
    document.getElementById('mixer').scrollIntoView({ behavior: 'smooth' });
  }));
  initWeekAutoScroll();
}

// slow auto-scroll: Monday → Sunday, hold, snap back to Monday, repeat
function initWeekAutoScroll() {
  const rail = document.getElementById('weekRail');
  if (!rail || (typeof reduceMotion === 'function' && reduceMotion())) return;
  const SPEED = 0.4;                 // px/frame — a slow drift
  let paused = false, phase = 'scroll', hold = 0, pos = 0;
  const pause = () => { paused = true; };
  const resume = () => { paused = false; pos = rail.scrollLeft; };
  ['pointerenter', 'pointerdown', 'focusin'].forEach(e => rail.addEventListener(e, pause, { passive: true }));
  ['pointerleave', 'focusout'].forEach(e => rail.addEventListener(e, resume));
  rail.style.scrollSnapType = 'none';   // don't fight the drift
  function tick() {
    const max = rail.scrollWidth - rail.clientWidth;
    if (max > 4 && !paused) {
      if (phase === 'scroll') {
        pos += SPEED;
        if (pos >= max) { pos = max; phase = 'holdEnd'; hold = 100; }
        rail.scrollLeft = pos;
      } else if (phase === 'holdEnd') {
        if (--hold <= 0) { phase = 'snap'; hold = 70; rail.scrollTo({ left: 0, behavior: 'smooth' }); }
      } else if (phase === 'snap') {
        if (--hold <= 0) { pos = 0; phase = 'scroll'; }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ════════════════════ SECTION 03 — production ════════════════════ */
function buildProduction() {
  // 1 · Planning cycle — the same eight, matched to each day's decision
  const dmas = document.getElementById('prodDmas');
  if (dmas) {
    dmas.innerHTML = DAYS.map(d => `<div class="dma dma--day" style="--a:${d.accent}">
        <span class="dma__city">${d.name}</span>
        <span class="dma__dma">${d.task}</span>
      </div>`).join('');
    document.getElementById('prodDmaMore').textContent = 'One headline per planning day · Monday to lock';
  }

  // 2 · AI asset assembly — the ingredients that show up in the composited ad:
  //     the planning day, the Elite Eight (headshots), the headline.
  const asmGrid = document.getElementById('asmGrid');
  if (asmGrid) {
    asmGrid.innerHTML = BOARD.map(p =>
      `<span class="asm__cell"><img src="${HEADSHOT(p.pid)}" alt="" loading="lazy" onerror="this.style.opacity=0" /></span>`).join('');
  }
  const asmDma = document.getElementById('asmDma');
  if (asmDma) asmDma.textContent = 'This week · top-projected';
}

/* ════════════════════ SECTION 02 — the mixer ════════════════════ */
function currentSel() {
  const d = DAYS.find(x => x.id === document.getElementById('selDay').value) || DAYS[DAYS.length - 1];
  return { d };
}

function buildMixer() {
  document.getElementById('selDay').innerHTML = DAYS.map(d => `<option value="${d.id}">${d.name} — ${d.task}</option>`).join('');

  document.getElementById('selDay').value = beatForToday();

  document.getElementById('selDay').addEventListener('change', () => { stopSpot(); renderMixer(); });
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
   The day select "rolls" and clunks into place, the whole board rolling
   through the week's decisions behind a blur. */
const pick = a => a[Math.floor(Math.random() * a.length)];
let spinning = false;
function randomize() {
  if (spinning) return;
  stopSpot();
  const dEl = document.getElementById('selDay');
  const finalD = pick(DAYS).id;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dEl.value = finalD;
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

  const dIds = DAYS.map(d => d.id);
  const flick = setInterval(() => {
    dEl.value = pick(dIds);
    renderMixer(true);            // instant roll of the whole board
  }, 75);

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
function setHeadline(d, instant) {
  const [lead, accent] = headline(d);
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

/* resting scrubber — keeps the ad frame alive: the bar advances while the
   timer ticks 0:15 → 0:00 on a loop. Yields to the real spot when it plays. */
function initAdScrubber() {
  const fill = document.getElementById('ctvAdProg');
  const time = document.getElementById('ctvAdTime');
  const ctv = document.getElementById('ctv');
  if (!fill || !time || !ctv || reduceMotion()) return;    // reduced motion → static 16% resting fill
  const DUR = 15000;
  let t0 = null;
  const loop = ts => {
    requestAnimationFrame(loop);
    if (ctv.classList.contains('is-spot')) {                // the :15 spot drives its own bar/timer
      if (fill.style.width) fill.style.width = '';          // clear inline so the spot's CSS wins
      t0 = null; return;
    }
    if (t0 == null) t0 = ts;
    const p = ((ts - t0) % DUR) / DUR;                      // 0 → 1, looping
    fill.style.width = (p * 100).toFixed(2) + '%';
    time.textContent = '0:' + String(Math.max(0, Math.ceil((1 - p) * 15))).padStart(2, '0');
  };
  requestAnimationFrame(loop);
}

/* hover tooltip on every Genius Sports logo — one delegated box covers all
   instances, including the ones injected on render. */
function initGeniusTooltips() {
  const TXT = 'Genius Sports is the official data provider for the NFL, EPL and sportsbooks — meaning they hold the data that predicts how well any player will perform.';
  const tip = document.createElement('div');
  tip.className = 'gs-tip'; tip.setAttribute('role', 'tooltip');
  tip.innerHTML = `<strong>Genius Sports</strong><span>${TXT}</span>`;
  document.body.appendChild(tip);
  let cur = null;
  const isLogo = el => el && el.tagName === 'IMG' && /genius-sports/.test(el.getAttribute('src') || '');
  const place = el => {
    const r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tr.width / 2 + window.scrollX;
    left = Math.max(10, Math.min(left, window.scrollX + document.documentElement.clientWidth - tr.width - 10));
    let top = r.top + window.scrollY - tr.height - 10;
    if (top < window.scrollY + 6) top = r.bottom + window.scrollY + 10;   // flip below if no room above
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  };
  document.addEventListener('mouseover', e => {
    if (isLogo(e.target)) { cur = e.target; place(cur); tip.classList.add('is-on'); }
  });
  document.addEventListener('mouseout', e => {
    if (cur && e.target === cur) { cur = null; tip.classList.remove('is-on'); }
  });
  window.addEventListener('scroll', () => { if (cur) place(cur); }, { passive: true });
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
  const target = 24; // 24MM fantasy managers — a data-driven nudge for every roster
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
  const { d } = currentSel();
  const ctv = document.getElementById('ctv');
  ctv.style.setProperty('--accent', d.accent);
  ctv.style.setProperty('--team', d.accent);
  const room = document.getElementById('room');
  if (room) {
    room.style.setProperty('--accent', d.accent);
    room.style.setProperty('--team', d.accent);
  }

  document.getElementById('emoNote').textContent = `${d.task} — ${d.register}.`;
  document.getElementById('playerNote').innerHTML =
    `<strong>8 top-projected must-starts</strong> · ranked by Genius Sports projections.`;

  document.getElementById('ctvEyebrow').textContent = EYEBROW;
  setHeadline(d, instant);
  document.getElementById('stageCap').textContent =
    `Planning day: ${d.name} (${d.task}) · Data: ${d.register} · Ad: this week’s 8 top-projected must-starts`;
  renderBoard();

  // generated stadium backdrop → team/day-tinted plate (CSS default)
  applyBackdrop(backdropPrompt(d));
}

/* ── the board of eight: equal-weight headshot cells ─────────────────*/
function renderBoard() {
  const el = document.getElementById('ctvBoard');
  if (!el) return;
  el.innerHTML = BOARD.map(p => `
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
    'Tone: premium, confident, data-driven broadcast atmosphere — not somber.',
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

/* ── random signal glitch on the board, one player at a time ───────── */
/* ── INSIGHT — glitch-swap the stakes phrase with "fantasy sports" ─────
   Every few seconds the lime phrase glitches (chromatic split) and, mid-
   glitch, swaps between the two readings. Only runs while it's on screen. */
function initInsightGlitch() {
  const el = document.querySelector('.insight__stakes');
  if (!el) return;
  const words  = ['something even higher stakes', 'fantasy sports', 'your lineup', 'fantasy sports', 'the waiver wire', 'fantasy sports', 'start/sit calls', 'fantasy sports', 'roster moves', 'fantasy sports', 'the data edge', 'fantasy sports'];
  const colors = ['#5b8cff', '#d4ff3d', '#3fb6a8', '#d4ff3d', '#e0a83d', '#d4ff3d', '#9b6cff', '#d4ff3d', '#ff944d', '#d4ff3d', '#5b8cff', '#d4ff3d'];
  let i = 0;
  el.style.color = colors[0];
  const swap = () => { i = (i + 1) % words.length; el.textContent = words[i]; el.style.color = colors[i]; };
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

/* ── INSIGHT stat counters — slot-machine count-up on scroll-in ─────── */
function initStatCounters() {
  const vals = document.querySelectorAll('.istat__val');
  if (!vals.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = t => 1 - Math.pow(1 - t, 3);                 // easeOutCubic — decisive stop
  const run = el => {
    const target = parseInt(el.dataset.count, 10) || 0;
    if (reduce) { el.textContent = target; return; }
    const dur = 1500; let start = null;
    const step = ts => {
      if (start == null) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const e = ease(p);
      el.textContent = Math.round(e * target);
      // color scrolls from a dark-but-visible grey → white (var(--ink)) in lockstep with the number
      el.style.color = `rgb(${Math.round(70 + e * 168)},${Math.round(72 + e * 170)},${Math.round(78 + e * 170)})`;
      if (p < 1) { requestAnimationFrame(step); }
      else { el.textContent = target; el.style.color = ''; }   // settle to CSS default
    };
    requestAnimationFrame(step);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
    }), { threshold: 0.6 });
    vals.forEach(v => io.observe(v));
  } else {
    vals.forEach(run);
  }
}

/* ── BRIEF — modal overlay embedding the Google Doc ───────────────────
   Uses the /preview endpoint (embeddable); /edit refuses to iframe. If the
   doc's sharing blocks embedding, the "Open in Google Docs" link is the
   fallback. The iframe src is set on first open so it doesn't load upfront. */
function initBrief() {
  const modal = document.getElementById('briefModal');
  const btn = document.getElementById('briefBtn');
  const frame = document.getElementById('briefFrame');
  if (!modal || !btn || !frame) return;
  const SRC = 'https://docs.google.com/document/d/1A_CQNyy7HaVu7_4b_4H0bxm8AY2sc5RIOoSjI0Sr4gs/preview';
  const open = () => {
    if (!frame.getAttribute('src')) frame.setAttribute('src', SRC);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('briefClose').focus();
  };
  const close = () => { modal.hidden = true; document.body.style.overflow = ''; btn.focus(); };
  btn.addEventListener('click', open);
  modal.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
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

/* ── hero title: the week flaps past and lands on SUNDAY ──────────────
   MON → TUE → … → SAT flip by (last few slow down), then SUNDAY lands in
   bold lime with a definitive thump. */
function initHeroFlap() {
  const el = document.querySelector('.hero__title-mia');
  if (!el) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = 'Sunday'; el.classList.add('landed'); return; }
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  let i = 0;
  const step = () => {
    el.textContent = days[i];
    if (i < days.length - 1) {
      el.classList.remove('flap'); void el.offsetWidth; el.classList.add('flap');
      const slow = i >= days.length - 3;            // decelerate into the landing
      i++;
      setTimeout(step, slow ? 300 : 130);
    } else {
      el.classList.remove('flap'); void el.offsetWidth;
      el.classList.add('landed');                   // bold lime SUNDAY + thump
    }
  };
  setTimeout(step, 450);
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
initHeroVideo();
initHeroFlap();     // week flaps past → SUNDAY lands in lime with a thump
animateOdometer();
initExpand();
initBoardGlitch();
initInsightGlitch(); // glitch-swaps the INSIGHT stakes phrase with "fantasy sports"
initStatCounters();  // slot-machine count-up on the 3 INSIGHT stats
initSpotAutoplay(); // plays the :15 spot once when the mock-up scrolls into view
initAdScrubber();   // keeps the resting scrubber moving as the ad counts 0:15 → 0:00
initGeniusTooltips(); // hover explainer on every Genius Sports logo
initBrief();        // BRIEF nav button → Google Doc modal overlay
