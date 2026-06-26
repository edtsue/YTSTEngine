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

// Real player photos (Wikimedia Commons, freely licensed) keyed by ESPN pid.
// Values are bare Commons file titles; commonsUrl() resolves them through
// Special:FilePath, which Wikimedia redirects to the live CDN file and clamps
// ?width to the original (so it never 404s on a portrait narrower than 1280,
// the way a hand-built /thumb/.../1280px- URL does).
//
// Prefer genuine in-game ACTION frames (All-Pro Reels game photography). Every
// roster player gets a photo: a direct shot where one exists, else a same-team
// action shot (the chrome supplies the player's name, so a teammate in the
// right uniform reads right).
const PHOTO = {
  4362628: "Ja'Marr Chase.jpg",                              // Ja'Marr Chase (CIN) — Bengals (portrait; no free in-game shot yet)
  4262921: 'Justin Jefferson Commanders vs Vikings NOV2022.jpg', // Justin Jefferson (MIN) — in-game, Vikings purple
  4430807: 'Bijan Robinson 2025.jpg',                        // Bijan Robinson (ATL) — Falcons (portrait; no free in-game shot yet)
  3139477: 'Patrick Mahomes (51616341245).jpg',             // Patrick Mahomes (KC) — in-game
  3040151: 'George Kittle 2019 (48940368597).jpg',          // George Kittle (SF) — in-game, 49ers red
  3915511: 'Joe Burrow Bengals.jpg',                        // Joe Burrow (CIN) — direct, Bengals
  3918298: 'Josh Allen (43569465444).jpg',                  // Josh Allen (BUF) — in-game, Bills (rookie-year frame)
  3929630: 'Saquon Barkley 112024.jpg',                     // Saquon Barkley (PHI) — in-game, Eagles (Nov 2024)
  4361307: 'Kyler Murray passing.png',                      // Trey McBride (ARI) slot — same-team Cardinals action shot (Kyler Murray)
};
const commonsUrl = (file, w = 1280) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;
// ESPN headshot (deterministic by pid, same host as the team logos) — a
// guaranteed last-resort so a mockup is never blank if a Commons file fails.
const HEADSHOT = pid => `https://a.espncdn.com/i/headshots/nfl/players/full/${pid}.png`;

/* ── The three signals (for the explainer cards) ───────────────────── */
const SIGNALS = [
  { icon: '📍', key: 'geo', name: 'Geography', source: 'IP → DMA + weekly blackout map',
    job: 'Double duty: who’s most-drafted here, and which of their games is blacked out here.' },
  { icon: '📅', key: 'day', name: 'Day → Emotion', source: 'Calendar lookup',
    job: 'The frame. Monday grief, Sunday-morning panic, Sunday-afternoon helplessness — the tone of the spot.' },
  { icon: '🏈', key: 'player', name: 'Top player', source: 'Yahoo aggregate ownership, geo-filtered',
    job: 'The hook. The real most-drafted player per position in that market — four faces, one machine.' },
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
// one clever headline, with three selectable versions sharing the same image
const EMO_HEADLINE = {
  'mon':       'Monday grief, brought to you by a game you couldn’t see.',
  'tue':       'The wire’s open. Your blackout isn’t going anywhere.',
  'wed':       'You spent the whole budget. You still can’t buy his channel.',
  'thu':       'Tonight you watch. Sunday, he vanishes.',
  'fri':       'You did the homework. You’ll still squint at a number.',
  'sat':       'Lineup’s perfect. Your channel lineup isn’t.',
  'sun-am':    'Lineups lock in an hour. So does your view.',
  'sun-pm':    'He’s scoring right now — on a screen you don’t get.',
  'sun-night': 'Primetime, and your last hope is off-channel.',
};
const VARIANTS = [
  (m, d, p) => `You drafted ${firstName(p)}. Your TV didn’t.`,
  (m, d, p) => `Your best ${p.pos}. Someone else’s broadcast.`,
  (m, d, p) => EMO_HEADLINE[d.id],
];

/* ════════════════════ SECTION 01 — explainer ════════════════════ */
function buildSignals() {
  document.getElementById('signals').innerHTML = SIGNALS.map(s => `
    <article class="sig sig--${s.key}">
      <div class="sig__icon">${s.icon}</div>
      <h3>${s.name}</h3>
      <div class="sig__src">${s.source}</div>
      <p class="sig__job">${s.job}</p>
      ${s.key === 'player' ? '<img class="sig__yahoo" src="assets/yahoo-fantasy.jpg" alt="Yahoo Fantasy" />' : ''}
    </article>`).join('');
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
    document.getElementById(id).addEventListener('change', renderMixer));
  document.getElementById('genBtn').addEventListener('click', generateAsset);
  document.getElementById('randBtn').addEventListener('click', randomize);
  renderMixer();
}

/* randomize the three signals — geography, day, and player/position */
function randomize() {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  document.getElementById('selMarket').value = pick(MARKETS).id;
  document.getElementById('selDay').value = pick(DAYS).id;
  document.getElementById('selPos').value = pick(['WR', 'QB', 'RB', 'TE']);
  renderMixer();
}

function beatForToday() {
  const dow = new Date().getDay();
  if (dow === 0) return 'sun-pm';
  const hit = DAYS.find(d => d.dow === dow);
  return hit ? hit.id : 'sun-pm';
}

function renderMixer() {
  const { m, d, p } = currentSel();
  const ctv = document.getElementById('ctv');
  ctv.style.setProperty('--accent', d.accent);
  ctv.style.setProperty('--team', (TEAMS[p.team] || {}).glow || d.accent);

  document.getElementById('emoNote').textContent = `${d.emotion} — ${d.register}.`;
  document.getElementById('playerNote').innerHTML =
    `${p.name} · ${p.city} (${p.team.toUpperCase()}) — out-of-market in ${m.city}.`;

  document.getElementById('ctvEyebrow').textContent = EYEBROW(m, p);
  document.getElementById('ctvHeadline').textContent = VARIANTS[variantIdx](m, d, p);
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
    document.getElementById('ctvHeadline').textContent = VARIANTS[variantIdx](m, d, p);
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
    fill(commonsUrl(PHOTO[p.pid]), 'right center', headshot);
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
buildToday();
initHeroVideo();
