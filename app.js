/* ════════════════════════════════════════════════════════════════════
   A Fantasy Player's Week — Sunday Ticket creative-brief visualizer
   Data drives the arc chart, the day cards, Sunday phases, and product.
   ════════════════════════════════════════════════════════════════════ */

// Each point feeds the emotional-intensity arc. `card` entries also render
// as journal cards. intensity is 0–100 (felt emotional load that day).
const POINTS = [
  {
    id: 'mon', label: 'Mon', name: 'Monday', dow: 1,
    title: 'The Reckoning', emotion: 'Vindication or despair', intensity: 56,
    opening: "The loss happened in a game he couldn't see.",
    ritual: 'Grieve or gloat in the group chat',
    rituals: [
      'Opens the app before he’s fully awake to confirm the score he already knew was coming',
      'Group chat: the victory lap, or the silent absence of the guy who lost',
      'Replays the one decision that swung it — “if I’d just started him…”',
    ],
    feeling: 'Smug and expansive if he won; a specific low-grade grief if he lost. Either way, the result was often decided by a player in a game he never actually watched.',
    today: 'The result already landed in a game you couldn’t see. Here’s the one you missed.',
  },
  {
    id: 'tue', label: 'Tue', name: 'Tuesday', dow: 2,
    title: 'The Wound & The Wire', emotion: 'Resentment → hope', intensity: 41,
    opening: 'The guy who beat you was on a screen you don’t get.',
    ritual: 'Lick wounds, scan the wire',
    rituals: [
      'Post-mortem: reads the recap, checks what his bench would have scored (always more)',
      'Opens the waiver wire — scouts Sunday’s breakouts everyone now wants',
      'Builds his claim list',
    ],
    feeling: 'Resentment at the bench points left on the table, curdling into hope. The wire is a fresh start. The gambler’s optimism returns: next week is different.',
    today: 'The breakout everyone’s adding broke out where you couldn’t watch.',
  },
  {
    id: 'wed', label: 'Wed', name: 'Wednesday', dow: 3,
    title: 'The Bidding War', emotion: 'Anxious gambling', intensity: 52,
    opening: null,
    ritual: 'Waiver claims · FAAB bidding',
    rituals: [
      'Waivers process overnight — he learns if he won his targets',
      'FAAB budget agony: how much fake money to blow on a maybe',
      'The handcuff math — grab his stud RB’s backup as insurance?',
    ],
    feeling: 'A blind auction where everyone’s bidding on the same rumor. Small dopamine hit if a claim lands; a quiet sulk if a rival outbids him.',
    today: null,
  },
  {
    id: 'thu', label: 'Thu', name: 'Thursday', dow: 4,
    title: 'The First Lock', emotion: 'Reckless commitment', intensity: 47,
    opening: 'First lock of the week — and he can’t watch it out-of-market.',
    ritual: 'Thursday Night — one player locks early',
    rituals: [
      'Thursday Night Football — a player in it locks at kickoff',
      'The last call: start the TNF guy, or hold for a safer Sunday option?',
      'Settles in to watch — this one’s national, so he can actually see it',
    ],
    feeling: 'Reckless commitment, pulling the trigger before he has all the information — but a clean, rare joy. This is what watching your guy is supposed to feel like. The contrast that sets up all of Sunday’s pain.',
    today: 'Your first lock is tonight. Out-of-market — but this is the one you get to watch.',
  },
  {
    id: 'fri', label: 'Fri', name: 'Friday', dow: 5,
    title: 'The Homework', emotion: 'Studious dread', intensity: 60,
    opening: null,
    ritual: 'Matchup research · injury reports · podcasts',
    rituals: [
      'Deep research: injury reports, snap counts, target shares',
      'Start/sit podcasts on the commute',
      'Matchup previews — which defense is a soft touch this week',
    ],
    feeling: 'The more he learns, the more impossible the decisions feel. Every expert says something different. A nerd’s quiet pleasure in the prep, undercut by knowing it’s mostly luck.',
    today: null,
  },
  {
    id: 'sat', label: 'Sat', name: 'Saturday', dow: 6,
    title: 'The Tinkering', emotion: 'Restless second-guessing', intensity: 68,
    opening: null,
    ritual: 'Final lineup tinkering · weather checks',
    rituals: [
      'Sets a provisional lineup, then un-sets it three times',
      'Checks weather for outdoor stadiums (wind kills passing games)',
      'Stares at his flex slot like it owes him money',
    ],
    feeling: 'The lineup is never done, only abandoned. A low-key obsession that intrudes on dinner, on the kids, on sleep. Coiled anticipation for tomorrow.',
    today: null,
  },
  {
    id: 'sun-am', label: 'Sun AM', name: 'Sunday Morning', dow: 0, phase: true,
    title: 'The Panic Window', emotion: 'Peak anxiety', intensity: 95, time: '~10am–1pm ET',
    icon: '☀️',
    opening: 'The deadline moment — “6 starters, games you can’t see.”',
    ritual: 'Start/sit panic → lineups lock at 1pm',
    rituals: [
      'Final injury news drops 90 minutes before kickoff — a starter is suddenly OUT',
      'Frantic last-second lineup surgery',
      'The group chat becomes a war room: “do I start him?? HELP”',
      '1:00pm — lineups lock. No more decisions. The cage closes.',
    ],
    feeling: 'The highest-stress moment of the week: the specific terror of an irreversible decision made with incomplete information. After lock, a strange helpless calm — it’s out of my hands now.',
    today: 'Lineups lock at 1pm. After that, the only place your guys are on is here.',
  },
  {
    id: 'sun-pm', label: 'Sun PM', name: 'Sunday Afternoon', dow: 0, phase: true, wound: true,
    title: 'The Scramble', emotion: 'Mania / helplessness', intensity: 100, time: '1pm–8pm',
    icon: '🏈',
    opening: 'ST is the only place those out-of-market games are on.',
    ritual: 'The watch — or the scramble',
    rituals: [
      'TV on, phone running the stat tracker, maybe a laptop too',
      '~9 starters scattered across 6–8 games — most out-of-market',
      'Local Fox/CBS is showing 1–2 games and his guys aren’t in them',
      'Toggles between a tracker number, a RedZone tease, a stream that buffers',
      'Watches a “6” become a “12” and knows his RB scored — somewhere he can’t see',
    ],
    feeling: 'Mania on a 10-second loop — the high of a big play, the gut-drop of a fumble. Frozen out of the decision (locked) AND frozen out of the broadcast. The modern ache: I have a stake in this game and I’m experiencing it as a spreadsheet.',
    today: 'Your guys are in 6 games right now. Your TV is showing one of them. This is the fix.',
  },
  {
    id: 'sun-night', label: 'Sun Night', name: 'Sunday Night', dow: 0, phase: true,
    title: 'The Sweat', emotion: 'Exhausted hope', intensity: 74, time: 'evening',
    icon: '🌙',
    opening: null,
    ritual: 'SNF sweat · Monday preview',
    rituals: [
      'Sunday Night Football — a player in it could still swing his whole week',
      'The “I need 12 points from my last guy” math',
      'Calculates Monday-night scenarios before bed',
    ],
    feeling: 'Exhausted hope or slow-motion dread, depending on the margin. Emotionally spent — a full day of involuntary cardio. Already, faintly, thinking about next week’s waivers.',
    today: 'One guy left, primetime. Your whole week, riding on a number.',
  },
];

const PRODUCT = [
  { beat: 'Sunday-morning panic / lock', truth: 'The deadline moment — built-in urgency for reactive social.', feat: 'The Hook' },
  { beat: 'The afternoon scramble', truth: 'ST is the only place those out-of-market games are on.', feat: 'The Reason' },
  { beat: '“Watching a number, not football”', truth: 'Fantasy View puts the score and the live game on one screen.', feat: 'Fantasy View' },
  { beat: '9 starters, 1–2 visible', truth: 'Multiview — watch up to 4 of your guys at once, built from your lineup.', feat: 'Multiview' },
];

/* ════════════════════════════════════════════════════════════════════
   THE CONTEXTUAL CREATIVE ENGINE
   Three signals — geography, day→emotion, top player — fill one template.
   Geography does double duty: who's popular in-market AND what's blacked out.
   Players are illustrative; the live engine pulls real most-drafted names
   per position from Yahoo, geo-filtered.
   ════════════════════════════════════════════════════════════════════ */
const SIGNALS = [
  { icon: '📍', key: 'geo', name: 'Geography', source: 'IP → DMA + weekly blackout map', job: 'Double duty — who’s popular here, and what’s blacked out here', read: m => `${m.dma} · ${m.wr.city} is out-of-market` },
  { icon: '📅', key: 'day', name: 'Day → Emotion', source: 'Calendar lookup', job: 'The frame — the tone of the message', read: (m, p) => `${p.name.replace(' Afternoon', '')} · ${p.emotion}` },
  { icon: '🏈', key: 'player', name: 'Top player', source: 'Yahoo aggregate ownership, geo-filtered', job: 'The hook — the named subject', read: m => `${m.wr.name} (${m.wr.team}) — most-drafted WR` },
];

// city held as the constant; day flips the tone, player stays the hook.
const MARKETS = [
  {
    id: 'cle', city: 'Cleveland', dma: 'Cleveland-Akron',
    wr: { name: "Ja'Marr Chase", city: 'Cincinnati', team: 'CIN' },
    distance: '250 miles down I-71', shortBlackout: 'Same state.',
    geoJab: 'Same state — you live in Ohio.', punchline: 'Same state. Different screen.',
    blackoutTail: 'same state, and your channels still didn’t pick it',
    roster: [
      { pos: 'QB', name: 'Joe Burrow', team: 'CIN' },
      { pos: 'RB', name: 'Bijan Robinson', team: 'ATL' },
      { pos: 'WR', name: "Ja'Marr Chase", team: 'CIN', hook: true },
      { pos: 'TE', name: 'Trey McBride', team: 'ARI' },
    ],
  },
  {
    id: 'nyc', city: 'New York', dma: 'New York',
    wr: { name: "Ja'Marr Chase", city: 'Cincinnati', team: 'CIN' },
    distance: 'out of your market', shortBlackout: 'Not on local Fox/CBS.',
    geoJab: 'Your own market, and the broadcast skipped it.', punchline: 'Different screen entirely.',
    blackoutTail: 'not on your local Fox or CBS',
    roster: [
      { pos: 'QB', name: 'Josh Allen', team: 'BUF' },
      { pos: 'RB', name: 'Bijan Robinson', team: 'ATL' },
      { pos: 'WR', name: "Ja'Marr Chase", team: 'CIN', hook: true },
      { pos: 'TE', name: 'George Kittle', team: 'SF' },
    ],
  },
  {
    id: 'la', city: 'Los Angeles', dma: 'Los Angeles',
    wr: { name: 'Justin Jefferson', city: 'Minnesota', team: 'MIN' },
    distance: '1,900 miles away', shortBlackout: '1,900 miles out.',
    geoJab: 'Nineteen hundred miles out of your market.', punchline: 'A different time zone, a different screen.',
    blackoutTail: '1,900 miles out, and your channels still didn’t pick it',
    roster: [
      { pos: 'QB', name: 'Patrick Mahomes', team: 'KC' },
      { pos: 'RB', name: 'Saquon Barkley', team: 'PHI' },
      { pos: 'WR', name: 'Justin Jefferson', team: 'MIN', hook: true },
      { pos: 'TE', name: 'George Kittle', team: 'SF' },
    ],
  },
];

// the template, filled per (day-beat, market). day = tone, player = hook, geo = the wall.
const CREATIVE = {
  'mon':       m => `All of ${m.city} drafted ${m.wr.name}. None of ${m.city} got to watch him. He plays in ${m.wr.city}. ${m.geoJab} Make it make sense.`,
  'tue':       m => `The WR ${m.city} loves is back Sunday. ${m.shortBlackout} Still not on your TV. There’s a fix.`,
  'wed':       m => `${m.city}’s most-drafted WR plays Sunday in ${m.wr.city}. You know the drill by now.`,
  'thu':       m => `Tonight you actually get to watch your guy. Enjoy it — Sunday, ${m.wr.name} is back out of reach in ${m.wr.city}.`,
  'fri':       m => `You’ll study ${m.wr.name} all weekend. Come Sunday, ${m.city}’s channels still won’t carry ${m.wr.city}.`,
  'sat':       m => `Start ${m.wr.name}? You’ve changed your mind three times. Doesn’t matter — ${m.city} can’t see ${m.wr.city} anyway.`,
  'sun-am':    m => `Lineups lock in 1 hour. ${m.city}’s favorite WR is ${m.distance} in ${m.wr.city}. Your channels didn’t pick it.`,
  'sun-pm':    m => `Right now: the receiver all of ${m.city} drafted is playing a game all of ${m.city} can’t see. ${m.punchline}`,
  'sun-night': m => `One WR left, primetime. ${m.wr.name} could carry ${m.city}’s whole week — from a screen ${m.city} never got.`,
};

let engineState = { market: 'cle', day: 'sun-pm' };

function buildSignals() {
  document.getElementById('signals').innerHTML = SIGNALS.map(s => `
    <article class="sig sig--${s.key}">
      <div class="sig__icon">${s.icon}</div>
      <h3>${s.name}</h3>
      <div class="sig__src">${s.source}</div>
      <p class="sig__job">${s.job}</p>
    </article>`).join('');
}

function buildBuilder() {
  const mSel = document.getElementById('selMarket');
  mSel.innerHTML = MARKETS.map(m => `<option value="${m.id}">${m.city}</option>`).join('');
  const dSel = document.getElementById('selDay');
  dSel.innerHTML = POINTS.map(p => `<option value="${p.id}">${p.name.replace(' Afternoon', '').replace(' Morning', ' AM').replace(' Night', ' Night')}</option>`).join('');

  // default day = today's beat
  const todayBeat = beatForToday();
  engineState.day = todayBeat;
  dSel.value = todayBeat;

  mSel.addEventListener('change', e => { engineState.market = e.target.value; renderEngine(); });
  dSel.addEventListener('change', e => { engineState.day = e.target.value; renderEngine(); });
  renderEngine();
}

function beatForToday() {
  const dow = new Date().getDay(); // 0 Sun … 6 Sat
  if (dow === 0) return 'sun-pm';
  const hit = POINTS.find(p => p.dow === dow && !p.phase);
  return hit ? hit.id : 'sun-pm';
}

function renderEngine() {
  const m = MARKETS.find(x => x.id === engineState.market);
  const p = POINTS.find(x => x.id === engineState.day);

  // signal readout
  document.getElementById('readout').innerHTML = SIGNALS.map(s => `
    <div class="ro ro--${s.key}">
      <span class="ro__icon">${s.icon}</span>
      <span class="ro__name">${s.name}</span>
      <span class="ro__val">${s.read(m, p)}</span>
    </div>`).join('<span class="ro__plus">+</span>');

  // generated creative
  document.getElementById('creative').textContent = '“' + CREATIVE[p.id](m) + '”';

  // logic gate
  document.getElementById('gate').innerHTML =
    `<span class="gate__ok">✓ logic gate</span> ${m.wr.name} is out-of-market in ${m.city} — eligible to serve. If the top guy were on a national broadcast, the engine swaps to the next blacked-out player.`;

  // Most Wanted poster
  document.getElementById('mwTitle').textContent = `${m.city}'s Most Wanted`;
  document.getElementById('mwGrid').innerHTML = m.roster.map(r => `
    <article class="mw ${r.hook ? 'mw--hook' : ''}">
      ${r.hook ? '<span class="mw__hook">The hook</span>' : ''}
      <span class="mw__pos">${r.pos}</span>
      <span class="mw__name">${r.name}</span>
      <span class="mw__team">${r.team}</span>
      <span class="mw__stamp">Out of market</span>
    </article>`).join('');

  // compounding payoff (Sunday framing, annotated by signal)
  document.getElementById('payoffLine').innerHTML =
    `“It’s Sunday, lineups just locked<sup class="pf pf--day">day</sup>. The WR all of ${m.city} drafted<sup class="pf pf--player">player</sup> is playing in ${m.wr.city} — ${m.blackoutTail}<sup class="pf pf--geo">geo</sup>.”`;
}

/* ─────────────────────────────  ARC CHART  ───────────────────────────── */
function buildChart() {
  const el = document.getElementById('chart');
  const W = 1000, H = 360, padX = 56, padY = 48;
  const n = POINTS.length;
  const x = i => padX + (i / (n - 1)) * (W - padX * 2);
  const y = v => H - padY - (v / 100) * (H - padY * 2);

  // smooth-ish path via Catmull-Rom → bezier
  const pts = POINTS.map((p, i) => [x(i), y(p.intensity)]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  const area = `${d} L ${pts[n - 1][0]} ${H - padY} L ${pts[0][0]} ${H - padY} Z`;

  const dots = POINTS.map((p, i) => {
    const cls = p.wound ? 'dot dot--wound' : p.phase ? 'dot dot--phase' : 'dot';
    return `
      <g class="dotg" data-id="${p.id}" tabindex="0" role="button" aria-label="${p.name}: ${p.emotion}">
        <line class="dot__stem" x1="${x(i)}" y1="${y(p.intensity)}" x2="${x(i)}" y2="${H - padY}" />
        <circle class="${cls}" cx="${x(i)}" cy="${y(p.intensity)}" r="6" />
        <text class="dot__lbl" x="${x(i)}" y="${H - padY + 24}">${p.label}</text>
        <text class="dot__emo" x="${x(i)}" y="${y(p.intensity) - 16}">${p.emotion}</text>
      </g>`;
  }).join('');

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="areaG" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#ff2d2d" stop-opacity="0.42" />
          <stop offset="1" stop-color="#ff2d2d" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="lineG" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#5b8cff" />
          <stop offset="0.7" stop-color="#ff7a3d" />
          <stop offset="1" stop-color="#ff2d2d" />
        </linearGradient>
      </defs>
      <path class="area" d="${area}" fill="url(#areaG)" />
      <path class="line" d="${d}" fill="none" stroke="url(#lineG)" />
      ${dots}
    </svg>`;

  el.querySelectorAll('.dotg').forEach(g => {
    const id = g.getAttribute('data-id');
    g.addEventListener('click', () => openFlyout(id));
    g.addEventListener('keypress', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFlyout(id); } });
  });
}

/* ─────────────────────────────  CARDS  ───────────────────────────── */
function buildWeek() {
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = POINTS.filter(p => !p.phase).map(p => cardHTML(p)).join('');
  wireCards(grid);
}

function buildSunday() {
  const wrap = document.getElementById('sundayPhases');
  wrap.innerHTML = POINTS.filter(p => p.phase).map(p => `
    <article class="phase ${p.wound ? 'phase--wound' : ''}" data-id="${p.id}" tabindex="0">
      <div class="phase__icon">${p.icon}</div>
      <div class="phase__time">${p.time}</div>
      <h3>${p.name}</h3>
      <div class="phase__sub">${p.title}</div>
      <ul class="phase__list">${p.rituals.map(r => `<li>${r}</li>`).join('')}</ul>
      <div class="phase__emo"><span>Dominant emotion</span>${p.emotion}</div>
    </article>`).join('');
  wireCards(wrap);
}

function cardHTML(p) {
  return `
    <article class="card" data-id="${p.id}" tabindex="0">
      <div class="card__top">
        <span class="card__day">${p.label}</span>
        <span class="card__bar"><i style="height:${p.intensity}%"></i></span>
      </div>
      <h3 class="card__title">${p.title}</h3>
      <p class="card__ritual">${p.ritual}</p>
      <div class="card__emo">${p.emotion}</div>
      ${p.opening ? `<div class="card__open"><span>ST opening</span>${p.opening}</div>` : ''}
    </article>`;
}

function wireCards(scope) {
  scope.querySelectorAll('[data-id]').forEach(c => {
    const id = c.getAttribute('data-id');
    c.addEventListener('click', () => openFlyout(id));
    c.addEventListener('keypress', e => { if (e.key === 'Enter') openFlyout(id); });
  });
}

function buildProduct() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = PRODUCT.map(p => `
    <article class="prod">
      <span class="prod__feat">${p.feat}</span>
      <p class="prod__beat">${p.beat}</p>
      <p class="prod__truth">${p.truth}</p>
    </article>`).join('');
}

/* ─────────────────────────────  FLYOUT  ───────────────────────────── */
function openFlyout(id) {
  const p = POINTS.find(x => x.id === id);
  if (!p) return;
  const body = document.getElementById('flyoutBody');
  body.innerHTML = `
    <div class="fly__kicker">${p.time ? p.name + ' · ' + p.time : p.name}</div>
    <h3 class="fly__title ${p.wound ? 'is-wound' : ''}">${p.title}</h3>
    <div class="fly__meter"><span style="width:${p.intensity}%"></span><b>${p.intensity}</b></div>
    <div class="fly__emo">${p.emotion}</div>
    <h4>Rituals</h4>
    <ul>${p.rituals.map(r => `<li>${r}</li>`).join('')}</ul>
    <h4>How it feels</h4>
    <p>${p.feeling}</p>
    ${p.opening ? `<div class="fly__open"><span>The opening for Sunday Ticket</span>${p.opening}</div>` : ''}`;
  const fly = document.getElementById('flyout');
  fly.hidden = false;
  requestAnimationFrame(() => fly.classList.add('is-open'));
}
function closeFlyout() {
  const fly = document.getElementById('flyout');
  fly.classList.remove('is-open');
  setTimeout(() => { fly.hidden = true; }, 280);
}

/* ──────────────────  CONTEXTUAL DAY-OF-WEEK SIGNAL  ────────────────── */
function buildToday() {
  const dow = new Date().getDay(); // 0 = Sun … 6 = Sat
  // pick the representative point. Sunday → afternoon (the core wound).
  let p = POINTS.find(x => x.dow === dow && !x.phase) || POINTS.find(x => x.dow === dow && x.wound);
  if (!p) return;
  const chip = document.getElementById('todayChip');
  document.getElementById('todayName').textContent = p.name.replace(' Afternoon', '');
  document.getElementById('todayMsg').textContent = p.today || `${p.title} — ${p.emotion.toLowerCase()}.`;
  chip.hidden = false;
  // highlight the matching dot + card
  const mark = el => el && el.classList.add('is-now');
  setTimeout(() => {
    mark(document.querySelector(`.dotg[data-id="${p.id}"]`));
    mark(document.querySelector(`.card[data-id="${p.id}"], .phase[data-id="${p.id}"]`));
  }, 60);
}

/* ─────────────────────────────  INIT  ───────────────────────────── */
buildChart();
buildSignals();
buildBuilder();
buildWeek();
buildSunday();
buildProduct();
buildToday();
document.getElementById('flyoutClose').addEventListener('click', closeFlyout);
document.getElementById('flyout').addEventListener('click', e => { if (e.target.id === 'flyout') closeFlyout(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFlyout(); });
