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
      { pos: 'QB', name: 'Joe Burrow',     team: 'cin', city: 'Cincinnati' },
      { pos: 'RB', name: 'Bijan Robinson',  team: 'atl', city: 'Atlanta' },
      { pos: 'WR', name: "Ja'Marr Chase",   team: 'cin', city: 'Cincinnati', hook: true },
      { pos: 'TE', name: 'Trey McBride',    team: 'ari', city: 'Arizona' },
    ],
  },
  {
    id: 'nyc', city: 'New York', dma: 'New York',
    geoClause: 'off your local Fox and CBS', punchline: 'Different screen entirely.',
    roster: [
      { pos: 'QB', name: 'Josh Allen',     team: 'buf', city: 'Buffalo' },
      { pos: 'RB', name: 'Bijan Robinson', team: 'atl', city: 'Atlanta' },
      { pos: 'WR', name: "Ja'Marr Chase",  team: 'cin', city: 'Cincinnati', hook: true },
      { pos: 'TE', name: 'George Kittle',  team: 'sf',  city: 'San Francisco' },
    ],
  },
  {
    id: 'la', city: 'Los Angeles', dma: 'Los Angeles',
    geoClause: '1,900 miles out of market', punchline: 'A different time zone, a different screen.',
    roster: [
      { pos: 'QB', name: 'Patrick Mahomes',  team: 'kc',  city: 'Kansas City' },
      { pos: 'RB', name: 'Saquon Barkley',   team: 'phi', city: 'Philadelphia' },
      { pos: 'WR', name: 'Justin Jefferson', team: 'min', city: 'Minnesota', hook: true },
      { pos: 'TE', name: 'George Kittle',    team: 'sf',  city: 'San Francisco' },
    ],
  },
  {
    id: 'chi', city: 'Chicago', dma: 'Chicago',
    geoClause: 'a division rival you still can’t watch', punchline: 'Same division. Still blacked out.',
    roster: [
      { pos: 'QB', name: 'Josh Allen',       team: 'buf', city: 'Buffalo' },
      { pos: 'RB', name: 'Bijan Robinson',   team: 'atl', city: 'Atlanta' },
      { pos: 'WR', name: 'Justin Jefferson', team: 'min', city: 'Minnesota', hook: true },
      { pos: 'TE', name: 'Trey McBride',     team: 'ari', city: 'Arizona' },
    ],
  },
];

/* ── The template — fills per (day, market, player). Always reads true. ── */
const CREATIVE = {
  'mon':       (m, p) => `All of ${m.city} drafted ${p.name}. None of ${m.city} got to watch him — he plays in ${p.city}, ${m.geoClause}.`,
  'tue':       (m, p) => `The ${p.pos} ${m.city} loves is back Sunday. ${cap(m.geoClause)}. Still not on your TV — there’s a fix.`,
  'wed':       (m, p) => `${m.city}’s most-drafted ${p.pos} plays Sunday in ${p.city} — ${m.geoClause}. You know the drill by now.`,
  'thu':       (m, p) => `Tonight you get to watch your guy. Enjoy it — Sunday, ${p.name} is back out of reach in ${p.city}.`,
  'fri':       (m, p) => `You’ll study ${p.name} all weekend. Come Sunday, ${m.city}’s channels still won’t carry ${p.city}.`,
  'sat':       (m, p) => `Start ${p.name}? You’ve flip-flopped three times. Doesn’t matter — ${m.city} can’t see ${p.city} anyway.`,
  'sun-am':    (m, p) => `Lineups lock in 1 hour. ${m.city}’s ${p.name} is in ${p.city} — ${m.geoClause}. Your channels didn’t pick it.`,
  'sun-pm':    (m, p) => `Right now: the ${p.pos} all of ${m.city} drafted is playing a game all of ${m.city} can’t see. ${m.punchline}`,
  'sun-night': (m, p) => `One ${p.pos} left, primetime. ${p.name} could carry ${m.city}’s whole week — from a screen ${m.city} never got.`,
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ════════════════════ SECTION 01 — explainer ════════════════════ */
function buildSignals() {
  document.getElementById('signals').innerHTML = SIGNALS.map(s => `
    <article class="sig sig--${s.key}">
      <div class="sig__icon">${s.icon}</div>
      <h3>${s.name}</h3>
      <div class="sig__src">${s.source}</div>
      <p class="sig__job">${s.job}</p>
    </article>`).join('');
}

function buildWeekRail() {
  const m = MARKETS[0]; // Cleveland
  const p = m.roster.find(r => r.hook);
  document.getElementById('weekRail').innerHTML = DAYS.map(d => `
    <button class="mini" data-day="${d.id}" style="--accent:${d.accent}">
      <span class="mini__top"><span class="mini__day">${d.short}</span><span class="mini__brand">▶ Sunday Ticket</span></span>
      <span class="mini__emo">${d.emotion}</span>
      <span class="mini__hl">${CREATIVE[d.id](m, p)}</span>
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

  document.getElementById('emoNote').textContent = `${d.emotion} — ${d.register}.`;
  document.getElementById('playerNote').innerHTML =
    `${p.name} · ${p.city} (${p.team.toUpperCase()}) — out-of-market in ${m.city}.`;

  document.getElementById('ctvLogo').src = ESPN_LOGO(p.team);
  document.getElementById('ctvEyebrow').textContent = `${m.city}'s Most Wanted · ${p.pos} · ${d.name}`;
  document.getElementById('ctvHeadline').textContent = CREATIVE[d.id](m, p);
  document.getElementById('stageCap').textContent =
    `Geography: ${m.dma} · Day→Emotion: ${d.emotion} · Player: ${p.name} (${p.team.toUpperCase()})`;
}

/* image prompt — a clean photographic plate; our chrome supplies all text/branding */
function imagePrompt(m, d, p) {
  return [
    'Cinematic, photoreal 16:9 connected-TV advertisement background plate for an NFL broadcast product.',
    `Scene: a dramatic, stadium-lit American-football moment evoking a star ${p.pos}, in ${p.city} team colors, broadcast-grade lighting, shallow depth of field, motion and intensity, premium sports-marketing mood.`,
    `Emotional tone: ${d.emotion.toLowerCase()} — ${d.register.toLowerCase()}.`,
    'Composition: keep the left third darker and clean as copy space for an overlaid headline.',
    'Do NOT render any text, words, numbers, logos, team names, jersey lettering or sponsor marks. No watermarks. Photographic scene only.',
  ].join(' ');
}

async function generateAsset() {
  const { m, d, p } = currentSel();
  const prompt = imagePrompt(m, d, p);
  const btn = document.getElementById('genBtn');
  const loader = document.getElementById('ctvLoader');
  const status = document.getElementById('genStatus');

  btn.disabled = true;
  loader.hidden = false;
  status.textContent = 'Generating with Gemini…';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.image) {
      const reason = data.error === 'no_key'
        ? 'Add YTST_KEY in Vercel to generate the photographic hero — showing the styled preview.'
        : (data.message || data.error || `Generation failed (${res.status}).`);
      throw new Error(reason);
    }
    const media = document.getElementById('ctvMedia');
    media.style.backgroundImage = `url(${data.image})`;
    document.getElementById('ctv').classList.add('has-img');
    status.textContent = '✓ Hero generated with Gemini.';
  } catch (e) {
    status.textContent = '⚠ ' + e.message;
  } finally {
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

/* ── init ── */
buildSignals();
buildWeekRail();
buildMixer();
buildToday();
