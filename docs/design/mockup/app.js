/* MavRadar interactive mockup (design handoff v2, Checkpoints 1 to 3).
   Plain JS, no build step. Everything inside the phone is the app; the side panel drives the fake sensor.
   Times run on a simulated clock that starts at 2:48 PM. */
'use strict';
(function () {
  // ---------------------------------------------------------------- time
  const START = 14 * 3600 + 48 * 60;
  let simNow = START;
  const HEARTBEAT = 8; // seconds between sensor heartbeats in this mockup
  const fmt = (t) => {
    t = Math.floor(((t % 86400) + 86400) % 86400);
    let h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const ap = h < 12 ? 'AM' : 'PM';
    h = h % 12 || 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
  };
  const clock = (t) => fmt(t).replace(/ (AM|PM)$/, '');
  const minsSince = (t) => Math.max(0, Math.floor((simNow - t) / 60));
  const fmtDur = (m) => (m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min');
  const fmtAgo = (s) => (s < 60 ? Math.max(0, Math.floor(s)) + ' s ago' : Math.floor(s / 60) + ' min ago');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- data
  const CROSSINGS = [
    { id: 'center', name: 'Center St', city: 'Arlington', usdot: '794978C', ax: 246, ay: 372 },
    { id: 'gsw', name: 'Great Southwest Pkwy', city: 'Grand Prairie', ax: 30, ay: 361.5, state: 'clear', clearOff: -41 },
    { id: 'bowen', name: 'Bowen Rd', city: 'Arlington', ax: 84, ay: 364, state: 'clear', clearOff: -55 },
    { id: 'davis', name: 'Davis Dr', city: 'Arlington', ax: 138, ay: 367, state: 'approaching', detOff: -1 },
    { id: 'cooper', name: 'Cooper St', city: 'Arlington', ax: 192, ay: 370, state: 'clear', clearOff: -18 },
    { id: 'mesquite', name: 'Mesquite St', city: 'Arlington', ax: 300, ay: 375, state: 'stopped', sinceOff: -12, stopOff: -7 },
    { id: 'collins', name: 'Collins St', city: 'Arlington', ax: 354, ay: 378, state: 'blocked', sinceOff: -6 },
    { id: 'mainst', name: 'Main St', city: 'Grand Prairie', ax: 60, ay: 688, state: 'sensorOff', lastOff: -34 },
    { id: 'sw3rd', name: 'SW 3rd St', city: 'Grand Prairie', ax: 132, ay: 644, state: 'clear', clearOff: -72 },
    { id: 'carrier', name: 'Carrier Pkwy', city: 'Grand Prairie', ax: 204, ay: 600, state: 'clear', clearOff: -26 },
    { id: 'sherman', name: 'Sherman St', city: 'Arlington', ax: 276, ay: 556, state: 'clear', clearOff: -47 },
    { id: 'matlock', name: 'Matlock Rd', city: 'Arlington', ax: 348, ay: 512, state: 'clear', clearOff: -90 }
  ];
  CROSSINGS.forEach((c) => {
    if (c.clearOff != null) c.clearSince = START + c.clearOff * 60;
    if (c.detOff != null) c.detectedAt = START + c.detOff * 60;
    if (c.sinceOff != null) c.since = START + c.sinceOff * 60;
    if (c.stopOff != null) c.stoppedAt = START + c.stopOff * 60;
    if (c.lastOff != null) c.last = START + c.lastOff * 60;
  });
  const byId = (id) => CROSSINGS.find((c) => c.id === id);
  const CLUSTERS = [
    { ids: ['gsw', 'bowen', 'davis', 'cooper', 'center', 'mesquite', 'collins'], x: 199, y: 262 },
    { ids: ['sw3rd', 'carrier', 'sherman', 'matlock'], x: 223, y: 365 },
    { ids: ['mainst'], x: 133, y: 420 }
  ];
  // Today's past blockages at Center St: [minutes after midnight, duration min, stopped]
  const PAST = [[47, 4, 0], [135, 3, 0], [238, 6, 1], [320, 4, 0], [402, 5, 0], [475, 3, 0], [550, 7, 1], [633, 4, 0], [708, 5, 0], [760, 8, 0], [832, 9, 0]];
  const YESTERDAY = [[1406, 4, 0], [1322, 21, 1], [1247, 6, 0]];
  const WORDS = { clear: 'Clear', approaching: 'Approaching', blocked: 'Blocked', stopped: 'Stopped', unknown: 'Unknown' };


  // Brand color candidates, mirrored from app/src/constants/theme.ts (BrandSchemes). Status colors never change.
  const BRANDS = {
    graphite: { name: 'Graphite', desc: 'Neutral. Only the status colors carry color.',
      light: { bg: '#FFFFFF', surface: '#F6F7F9', text: '#111418', text2: '#4A5260', divider: '#E3E6EB', outline: '#C9CED6', pill: '#E3E6EB', tonal: '#EDF0F3', track: '#ECEEF1', sheet: '#FFFFFF', handle: '#C9CED6', primary: '#111418', 'on-primary': '#FFFFFF', link: '#111418', ok: '#007A6E', 'snack-bg': '#2B3036', 'snack-ink': '#F2F4F7', 'snack-action': '#7FD9CC' },
      dark: { bg: '#121212', surface: '#1B1E22', text: '#F2F4F7', text2: '#B6BDC8', divider: '#2C3137', outline: '#3A4048', pill: '#2C3137', tonal: '#262A30', track: '#2C3137', sheet: '#1B1E22', handle: '#5A616B', primary: '#F2F4F7', 'on-primary': '#121212', link: '#F2F4F7', ok: '#7FD9CC', 'snack-bg': '#E3E6EB', 'snack-ink': '#111418', 'snack-action': '#00594F' } },
    transitNavy: { name: 'Transit Navy', desc: 'Deep navy on warm paper, like transit wayfinding.',
      light: { bg: '#FBFAF7', surface: '#F1EFE9', text: '#13213A', text2: '#4B566A', divider: '#E3E0D8', outline: '#C8C4BA', pill: '#DCE4F0', tonal: '#E8ECF3', track: '#EAE7E0', sheet: '#FFFFFF', handle: '#C8C4BA', primary: '#1B3A66', 'on-primary': '#FFFFFF', link: '#1B3A66', ok: '#007A6E', 'snack-bg': '#1B2A42', 'snack-ink': '#EEF2F8', 'snack-action': '#A9C4EC' },
      dark: { bg: '#0D1522', surface: '#152033', text: '#EEF2F8', text2: '#AEB9CB', divider: '#22304A', outline: '#33425E', pill: '#23395C', tonal: '#1C2A42', track: '#22304A', sheet: '#152033', handle: '#4A5A78', primary: '#A9C4EC', 'on-primary': '#0D1522', link: '#A9C4EC', ok: '#7FD9CC', 'snack-bg': '#DCE4F0', 'snack-ink': '#13213A', 'snack-action': '#1B3A66' } },
    cobalt: { name: 'Cobalt', desc: 'Bright civic blue. The most energetic option.',
      light: { bg: '#FFFFFF', surface: '#F4F6FB', text: '#0F1523', text2: '#4A5366', divider: '#E1E6F0', outline: '#C3CBDA', pill: '#DDE6FF', tonal: '#EAF0FF', track: '#E8ECF4', sheet: '#FFFFFF', handle: '#C3CBDA', primary: '#2350C8', 'on-primary': '#FFFFFF', link: '#2350C8', ok: '#007A6E', 'snack-bg': '#1A2233', 'snack-ink': '#F0F3FA', 'snack-action': '#9DB6FF' },
      dark: { bg: '#0E1117', surface: '#171C27', text: '#F0F3FA', text2: '#B2BACB', divider: '#262D3C', outline: '#384257', pill: '#24345E', tonal: '#1E2638', track: '#262D3C', sheet: '#171C27', handle: '#4B5670', primary: '#9DB6FF', 'on-primary': '#0E1117', link: '#9DB6FF', ok: '#7FD9CC', 'snack-bg': '#DDE6FF', 'snack-ink': '#0F1523', 'snack-action': '#2350C8' } },
    prairieSlate: { name: 'Prairie Slate', desc: 'Blue-gray on sand. Quiet and regional.',
      light: { bg: '#F7F5F0', surface: '#EFECE5', text: '#1C2227', text2: '#525A61', divider: '#E2DED5', outline: '#C6C1B6', pill: '#DDE3E7', tonal: '#E8ECEE', track: '#E7E3DB', sheet: '#FFFDF9', handle: '#C6C1B6', primary: '#3B5163', 'on-primary': '#FFFFFF', link: '#3B5163', ok: '#007A6E', 'snack-bg': '#27323B', 'snack-ink': '#EEF0F1', 'snack-action': '#B7C8D6' },
      dark: { bg: '#121517', surface: '#1B2024', text: '#EEF0F1', text2: '#B3BBC1', divider: '#2A3136', outline: '#3B454C', pill: '#2B3A45', tonal: '#232A30', track: '#2A3136', sheet: '#1B2024', handle: '#525E66', primary: '#B7C8D6', 'on-primary': '#121517', link: '#B7C8D6', ok: '#7FD9CC', 'snack-bg': '#DDE3E7', 'snack-ink': '#1C2227', 'snack-action': '#3B5163' } },
    railtie: { name: 'Railtie', desc: 'Espresso brown on cream, like weathered rail ties.',
      light: { bg: '#FAF7F2', surface: '#F2EDE5', text: '#231B15', text2: '#5A5048', divider: '#E6DFD4', outline: '#CBC1B3', pill: '#E8DDD0', tonal: '#F0E8DE', track: '#EAE3D8', sheet: '#FFFDF9', handle: '#CBC1B3', primary: '#4A3528', 'on-primary': '#FFFFFF', link: '#4A3528', ok: '#007A6E', 'snack-bg': '#33271E', 'snack-ink': '#F4EEE7', 'snack-action': '#E2CDB5' },
      dark: { bg: '#15110E', surface: '#1F1915', text: '#F4EEE7', text2: '#C0B4A7', divider: '#30271F', outline: '#45382C', pill: '#3A2E24', tonal: '#2A221B', track: '#30271F', sheet: '#1F1915', handle: '#5E4F41', primary: '#E2CDB5', 'on-primary': '#15110E', link: '#E2CDB5', ok: '#7FD9CC', 'snack-bg': '#E8DDD0', 'snack-ink': '#231B15', 'snack-action': '#4A3528' } }
  };

  // ---------------------------------------------------------------- state
  const S = {
    onboarded: false, tab: 'status', mapView: 'map', sheet: 'peek', selectedId: 'center', statusId: 'center',
    dataset: 'one', zoom: 'area', appearance: 'system', brand: 'graphite', k: 1,
    conn: 'online', offlineSince: null,
    center: { state: 'clear', clearSince: START - 30 * 60, since: null, stoppedAt: null, detectedAt: null, lastReading: null },
    age: 3, ageOthers: 5, frozen: false, speed: 1,
    permission: 'unasked',
    following: new Set(),
    alerts: { blocked: true, cleared: true, stopped: true, approaching: false }, minBlock: 1, commute: 0, quiet: 0,
    overlay: null, ctx: null, choice: null, info: null, snack: null,
    settingsCard: null, historyRange: '7', historyId: 'center', historyEmpty: false,
    tip: false, mapFails: false, watching: false, mutedToday: false,
    notifs: [], expanded: {}, headsUp: null, locked: false, shade: false,
    extra: [], evt: null, prevState: 'clear', unknownSince: null, unknownNotified: false,
    scenario: null, dragging: false
  };
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
  const theme = () => (S.appearance === 'system' ? (systemDark.matches ? 'dark' : 'light') : S.appearance);
  const visible = () => (S.dataset === 'one' ? [CROSSINGS[0]] : CROSSINGS);

  // ---------------------------------------------------------------- derived crossing state
  function eff(c) {
    if (S.conn !== 'online') return { state: 'unknown', cause: S.conn, last: S.offlineSince };
    if (c.id === 'center') {
      const cs = S.center;
      if (cs.state === 'sensorOff') return { state: 'unknown', cause: 'sensor', last: cs.lastReading };
      if (S.age > 90) return { state: 'unknown', cause: 'sensor', last: simNow - S.age, stale: true };
      return Object.assign({}, cs, { delayed: S.age > 30, age: S.age });
    }
    if (c.state === 'sensorOff') return { state: 'unknown', cause: 'sensor', last: c.last };
    return { state: c.state, clearSince: c.clearSince, since: c.since, stoppedAt: c.stoppedAt, detectedAt: c.detectedAt, delayed: false, age: S.ageOthers };
  }

  function copy(c) {
    const e = eff(c);
    const v = { state: e.state, word: WORDS[e.state], retry: false, delayed: !!e.delayed };
    const ago = e.age != null ? fmtAgo(e.age) : '';
    v.fresh = e.delayed ? 'Updated ' + ago + ' · checking' : 'Live · updated ' + ago;
    v.freshKind = e.delayed ? 'delayed' : 'live';
    v.sensor = 'Online · East node';
    const blockedText = (m) => (m < 1 ? 'Blocked just now' : 'Blocked for ' + fmtDur(m));
    switch (e.state) {
      case 'clear':
        v.kicker = 'No train detected'; v.line = 'Clear since ' + fmt(e.clearSince);
        v.expl = 'No train on the crossing. The sensor is reporting normally.';
        v.meta = 'Clear since ' + fmt(e.clearSince) + ' · updated ' + ago;
        v.rest = ' · updated ' + ago; v.spoken = 'Clear.';
        break;
      case 'approaching':
        v.kicker = 'Train detected nearby'; v.line = 'Detected at ' + fmt(e.detectedAt);
        v.expl = 'A train is near the crossing. Gates may come down soon.';
        v.meta = 'Train nearby · updated ' + ago; v.rest = ' · train nearby · updated ' + ago; v.spoken = 'Train approaching.';
        break;
      case 'blocked': {
        const m = minsSince(e.since);
        v.kicker = 'Train on crossing'; v.dur = blockedText(m); v.sinceTxt = 'since ' + fmt(e.since);
        v.expl = 'A moving train is on the crossing.';
        v.meta = blockedText(m) + ' · updated ' + ago; v.rest = (m < 1 ? ' just now' : ' for ' + fmtDur(m)) + ' · updated ' + ago;
        v.spoken = m < 1 ? 'Blocked just now.' : 'Blocked for ' + m + ' minutes.';
        break;
      }
      case 'stopped': {
        const m = minsSince(e.since);
        v.kicker = 'Train not moving'; v.dur = blockedText(m); v.sinceTxt = 'since ' + fmt(e.since) + ' · stopped at ' + fmt(e.stoppedAt);
        v.expl = 'A train is stopped across the road. This can take a while.';
        v.meta = 'Stopped · ' + blockedText(m).toLowerCase() + ' · updated ' + ago; v.rest = ' · ' + blockedText(m).toLowerCase() + ' · updated ' + ago;
        v.spoken = 'Stopped. Blocked for ' + m + ' minutes.';
        break;
      }
      default: {
        v.freshKind = 'unknown';
        if (e.cause === 'phone') {
          v.kicker = "You're offline"; v.line = 'Reconnect to see live status.'; v.fresh = 'Last synced ' + fmt(e.last);
          v.expl = "Your phone has no connection, so this can't be current. Don't assume the crossing is clear.";
          v.meta = "You're offline · last synced " + fmt(e.last); v.rest = " · you're offline"; v.sensor = 'Unknown while offline';
        } else if (e.cause === 'server') {
          v.kicker = "Can't reach MavRadar"; v.line = "We can't reach MavRadar right now."; v.fresh = 'Last update ' + fmt(e.last); v.retry = true;
          v.expl = "The sensor may still be working, but we can't get its data. Don't assume the crossing is clear.";
          v.meta = "Can't reach MavRadar · last update " + fmt(e.last); v.rest = ' · no connection to MavRadar'; v.sensor = 'Unknown';
        } else {
          const gone = Math.max(1, minsSince(e.last));
          v.kicker = 'Sensor offline'; v.line = 'Last reading ' + fmt(e.last); v.fresh = 'No data for ' + fmtDur(gone);
          v.expl = 'No sensor data since ' + fmt(e.last) + ". Don't assume the crossing is clear.";
          v.meta = 'No data since ' + fmt(e.last); v.rest = ' · no data since ' + fmt(e.last); v.sensor = 'Offline since ' + fmt(e.last);
        }
        v.spoken = 'Status unknown. ' + v.meta + ". Don't assume it's clear.";
      }
    }
    v.a11y = c.name + ' crossing, ' + c.city + '. ' + v.spoken + (e.state !== 'unknown' ? ' Updated ' + Math.floor(e.age || 0) + ' seconds ago.' : '') + (S.following.has(c.id) ? ' Following.' : '');
    return v;
  }

  // ---------------------------------------------------------------- icons
  const OCT = 'M15.5 3H32.5L45 15.5V32.5L32.5 45H15.5L3 32.5V15.5Z';
  const QM = 'M18.5 19a5.5 5.5 0 1 1 7.8 5c-1.5.7-2.3 1.7-2.3 3.4v.8';
  const STRONG = { clear: ['#007A6E', '#FFFFFF'], approaching: ['#F2A900', '#1A1A1A'], blocked: ['#C62828', '#FFFFFF'], stopped: ['#8E1B1B', '#FFFFFF'], unknown: ['#6B7280', '#FFFFFF'] };
  const svg = (size, inner, vb) => '<svg width="' + size + '" height="' + size + '" viewBox="' + (vb || '0 0 48 48') + '" aria-hidden="true" focusable="false">' + inner + '</svg>';
  function shapeEl(state, fill, stroke, width, dash) {
    const st = 'fill:' + fill + ';' + (stroke ? 'stroke:' + stroke + ';stroke-width:' + width + ';stroke-linejoin:round;' : '') + (dash ? 'stroke-dasharray:' + dash + ';' : '');
    if (state === 'approaching') return '<path d="M24 2L46 24L24 46L2 24Z" style="' + st + '"/>';
    if (state === 'blocked') return '<rect x="3" y="3" width="42" height="42" rx="10" style="' + st + '"/>';
    if (state === 'stopped') return '<path d="' + OCT + '" style="' + st + '"/>';
    return '<circle cx="24" cy="24" r="21" style="' + st + '"/>';
  }
  const train = (bg) => '<rect x="17" y="14" width="14" height="17" rx="3.5" style="fill:#1A1A1A"/><rect x="19.5" y="17" width="9" height="5.5" rx="1.2" style="fill:' + bg + '"/><circle cx="20.8" cy="26.8" r="1.6" style="fill:' + bg + '"/><circle cx="27.2" cy="26.8" r="1.6" style="fill:' + bg + '"/><path d="M19.5 31l-2.5 4M28.5 31l2.5 4" style="fill:none;stroke:#1A1A1A;stroke-width:2.2;stroke-linecap:round"/>';
  function glyphEl(state, g, bg) {
    if (state === 'clear') return '<path d="M14.5 24.5l6.5 6.5 12.5-13" style="fill:none;stroke:' + g + ';stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round"/>';
    if (state === 'approaching') return train(bg || '#F2A900');
    if (state === 'blocked') return '<path d="M16 16L32 32M32 16L16 32" style="fill:none;stroke:' + g + ';stroke-width:5;stroke-linecap:round"/>';
    if (state === 'stopped') return '<rect x="16.5" y="15" width="5.5" height="18" rx="1.5" style="fill:' + g + '"/><rect x="26" y="15" width="5.5" height="18" rx="1.5" style="fill:' + g + '"/>';
    return '<path d="' + QM + '" style="fill:none;stroke:' + g + ';stroke-width:4;stroke-linecap:round"/><circle cx="24" cy="34.5" r="2.4" style="fill:' + g + '"/>';
  }
  const dashedUnknown = (ink) => '<circle cx="24" cy="24" r="19.5" style="fill:none;stroke:' + ink + ';stroke-width:3.5;stroke-dasharray:5.5 4"/>' + glyphEl('unknown', ink);
  const approachIcon = () => '<path d="M24 3.5L44.5 24L24 44.5L3.5 24Z" style="fill:#F2A900;stroke:#1A1A1A;stroke-width:2.5;stroke-linejoin:round"/>' + train('#F2A900');
  function cardIcon(state, size) {
    if (state === 'approaching') return svg(size, approachIcon());
    if (state === 'unknown') return svg(size, dashedUnknown('var(--c-ink)'));
    return svg(size, shapeEl(state, 'var(--c-icon)') + glyphEl(state, 'var(--c-glyph)'));
  }
  function plainIcon(state, size) {
    if (state === 'approaching') return svg(size, approachIcon(), '-2 -2 52 52');
    if (state === 'unknown') return svg(size, dashedUnknown('var(--i-unknown)'), '-2 -2 52 52');
    if (state === 'clear') return svg(size, shapeEl('clear', 'var(--i-clear)') + glyphEl('clear', 'var(--i-clear-glyph)'), '-2 -2 52 52');
    return svg(size, shapeEl(state, STRONG[state][0]) + glyphEl(state, STRONG[state][1]), '-2 -2 52 52');
  }
  function markerIcon(state, size) {
    const f = STRONG[state][0];
    let inner = shapeEl(state, f, 'rgba(0,0,0,0.4)', 7) + shapeEl(state, f, '#FFFFFF', 5, state === 'unknown' ? '7 4' : null);
    if (state === 'approaching') inner += '<path d="M24 4L44 24L24 44L4 24Z" style="fill:#F2A900;stroke:#1A1A1A;stroke-width:1.5;stroke-linejoin:round"/>';
    return svg(size, inner + glyphEl(state, STRONG[state][1], f), '-2 -2 52 52');
  }
  function notifGlyph(kind, accent) {
    if (kind === 'stopped') return svg(22, '<path d="' + OCT + '" style="fill:#FFFFFF"/>' + glyphEl('stopped', accent));
    if (kind === 'cleared') return svg(22, '<circle cx="24" cy="24" r="20" style="fill:none;stroke:#FFFFFF;stroke-width:4"/>' + glyphEl('clear', '#FFFFFF'));
    if (kind === 'unknown') return svg(22, dashedUnknown('#FFFFFF'));
    return svg(22, '<rect x="4" y="4" width="40" height="40" rx="9" style="fill:none;stroke:#FFFFFF;stroke-width:4"/>' + glyphEl('blocked', '#FFFFFF'));
  }
  const I = {
    status: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="7" cy="9" r="4"/><circle cx="17" cy="9" r="4"/><path d="M12 13v8M8 21h8"/></svg>',
    map: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    history: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    settings: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.5"/><circle cx="10" cy="17" r="2.5"/></svg>',
    route: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M5 21V12a4 4 0 0 1 4-4h10"/><path d="M15 4l4 4-4 4"/></svg>',
    eye: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chevD: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    chevR: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="opacity:.7"><path d="M9 6l6 6-6 6"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    bell: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    bellOff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M6 10a6 6 0 0 1 9.3-5M18 10v4l2 3H8M10 20a2 2 0 0 0 4 0M3 3l18 18"/></svg>',
    cloudOff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;margin-top:1px"><path d="M3 3l18 18"/><path d="M8.5 6.2A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.3 7.3M16 18H7a4 4 0 0 1-1.2-7.8"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    starOn: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    starOff: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" fill="none" stroke="var(--text2)" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    mapOff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M3 3l18 18"/></svg>',
    wifi: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="position:relative"><path d="M12 20l-9-11a13 13 0 0 1 18 0z"/></svg>',
    batt: '<svg width="22" height="14" viewBox="0 0 26 14" fill="none" aria-hidden="true" style="position:relative"><rect x="0.75" y="0.75" width="21" height="12.5" rx="3" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="3" width="14" height="8" rx="1.5" fill="currentColor"/><rect x="23" y="4.5" width="2" height="5" rx="1" fill="currentColor"/></svg>'
  };

  // ---------------------------------------------------------------- live text patching
  let LIVE = {};
  const live = (key, text) => { LIVE[key] = text; return '<span data-live="' + key + '">' + esc(text) + '</span>'; };
  const prevMasked = {};
  function patch(el, html, name) {
    const masked = html.replace(/(<span data-live="[^"]+">)[^<]*(<\/span>)/g, '$1$2');
    if (prevMasked[name] === masked) {
      el.querySelectorAll('[data-live]').forEach((s) => { const t = LIVE[s.dataset.live]; if (t !== undefined && s.textContent !== t) s.textContent = t; });
      return;
    }
    prevMasked[name] = masked;
    const scrolls = {};
    el.querySelectorAll('[data-scroll]').forEach((s) => { scrolls[s.dataset.scroll] = s.scrollTop; });
    const active = document.activeElement;
    const focusKey = active && el.contains(active) && active.dataset && active.dataset.fk ? active.dataset.fk : null;
    el.innerHTML = html;
    el.querySelectorAll('[data-scroll]').forEach((s) => { if (scrolls[s.dataset.scroll] != null) s.scrollTop = scrolls[s.dataset.scroll]; });
    if (focusKey) { const f = el.querySelector('[data-fk="' + focusKey + '"]'); if (f) f.focus({ preventScroll: true }); }
  }

  // ---------------------------------------------------------------- shared pieces
  const fk = (act, id) => ' data-act="' + act + '"' + (id != null ? ' data-id="' + esc(id) + '"' : '') + ' data-fk="' + act + (id != null ? '-' + esc(id) : '') + '"';
  function nav(active) {
    const item = (id, label) => '<button type="button"' + fk('tab', id) + (active === id ? ' aria-current="page"' : '') + ' class="t-nav"><span class="ind">' + I[id] + '</span>' + label + '</button>';
    return '<nav class="nav" aria-label="Main">' + item('status', 'Status') + item('map', 'Map') + item('history', 'History') + item('settings', 'Settings') + '</nav>';
  }
  const disclaimer = '<p class="t-disc">Travel information only. Always obey crossing signals and gates.</p>';
  function switchBtn(on, act, id, label, disabled) {
    return '<button type="button" class="switch" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(label) + '"' + fk(act, id) + (disabled ? ' disabled' : '') + '><span class="track"><span class="thumb"></span></span></button>';
  }
  function directionsBtn(filled) {
    return '<button type="button" class="btn ' + (filled ? 'filled' : 'tonal') + '"' + fk('directions') + '>' + I.route + '<span class="lbl"><span class="t-btn">Directions via West St underpass</span><span class="t-btnsub">Opens Google Maps</span></span></button>';
  }
  const sheetHeight = () => {
    if (S.sheet === 'none') return 0;
    if (S.sheet === 'peek') return 120;
    if (S.sheet === 'full') return 775;
    return watchVisible() ? 508 : 440;
  };
  const watchVisible = () => {
    if (S.selectedId !== 'center') return false;
    const st = eff(byId('center')).state;
    return st === 'blocked' || st === 'stopped';
  };

  // ---------------------------------------------------------------- timeline and history data
  function todayEvents(c) {
    const list = PAST.map(([m, d, st]) => ({ start: m * 60, dur: d, stopped: !!st }));
    if (c.id === 'center') S.extra.forEach((x) => list.push(x));
    return list;
  }
  function timeline(c) {
    const e = eff(c);
    const events = todayEvents(c).slice();
    let count = events.length;
    let total = events.reduce((a, x) => a + x.dur, 0);
    if (e.state === 'blocked' || e.state === 'stopped') {
      const d = Math.max(1, minsSince(e.since));
      events.push({ start: e.since, dur: d, stopped: e.state === 'stopped' });
      count += 1; total += d;
    }
    const hatch = (col) => 'repeating-linear-gradient(-45deg,' + col + ' 0 2px,transparent 2px 4px)';
    let segs = events.map((x) => '<span style="left:' + (x.start / 86400 * 100).toFixed(2) + '%;width:' + Math.max(x.dur / 1440 * 372, x.stopped ? 6 : 4).toFixed(1) + 'px;background:' + (x.stopped ? hatch('var(--moving)') : 'var(--moving)') + '"></span>').join('');
    if (e.state === 'unknown' && e.cause === 'sensor' && e.last) {
      const w = Math.max(4, (simNow - e.last) / 86400 * 372);
      segs += '<span style="left:' + (e.last / 86400 * 100).toFixed(2) + '%;width:' + w.toFixed(1) + 'px;background:' + hatch('var(--gap)') + '"></span>';
    }
    segs += '<span style="left:' + (simNow / 86400 * 100).toFixed(2) + '%;width:2px;background:var(--text)"></span>';
    const caption = count + ' blockages · ' + total + ' min total';
    return '<div class="stack" style="gap:8px;padding-top:4px">' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;column-gap:12px"><span class="t-sec" style="font-weight:600">Today</span><span class="t-sec muted">' + caption + '</span></div>' +
      '<button type="button" class="tl-bar"' + fk('tab', 'history') + ' aria-label="Today: ' + caption + '. Open History.">' + segs + '</button>' +
      '<div class="tl-axis t-axis"><span style="left:0">12 AM</span><span style="left:25%">6 AM</span><span style="left:50%">12 PM</span><span style="left:75%">6 PM</span></div></div>';
  }
  function lastBlockage(c) {
    const ev = todayEvents(c);
    const x = ev.reduce((a, b) => (b.start > a.start ? b : a), ev[0]);
    return fmt(x.start) + ' · ' + x.dur + ' min · ' + (x.stopped ? 'stopped' : 'moving');
  }

  // ---------------------------------------------------------------- views
  function sysbar() {
    let chip = '';
    if (S.watching) {
      const e = eff(byId('center'));
      const m = e.since ? minsSince(e.since) : 0;
      chip = '<span class="chip" aria-label="Watching Center St">' + svg(14, '<rect x="5" y="5" width="38" height="38" rx="9" style="fill:none;stroke:currentColor;stroke-width:5"/><path d="M17 17L31 31M31 17L17 31" style="stroke:currentColor;stroke-width:5;stroke-linecap:round"/>') + live('chip', (e.state === 'stopped' ? 'Stopped ' : 'Blocked ') + m + 'm') + '</span>';
    }
    return '<div class="sysbar"><button type="button" class="sysbar-hit" data-act="shade" aria-label="Open notification shade"></button><span style="position:relative">' + live('clock', clock(simNow)) + '</span>' + chip + '<span class="spacer"></span>' + I.wifi + I.batt + '</div>';
  }

  function welcomeView() {
    return '<div class="view welcome stack">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:8px">' + I.status.replace('width="24" height="24"', 'width="28" height="28"') + '<span style="font-size:20px;font-weight:700">MavRadar</span></div>' +
      '<div data-theme="' + theme() + '" data-s="blocked" class="card" aria-hidden="true" style="min-height:0">' +
      '<span class="example" style="color:var(--c-bg)">Example</span><span class="ico" style="width:36px;height:36px">' + cardIcon('blocked', 36) + '</span>' +
      '<span class="t-kicker">Train on crossing</span><span style="font-size:40px;line-height:1.08;font-weight:700">Blocked</span><span style="font-size:24px;font-weight:600">Blocked for 7 min</span>' +
      '<span class="fresh t-sec">' + svg(10, '<circle cx="24" cy="24" r="24" style="fill:var(--c-ink)"/>') + 'Live · updated 8 s ago</span></div>' +
      '<div class="stack" style="gap:12px"><h1 style="margin:0;font-size:calc(28px * min(var(--k),1.5));line-height:1.22">Know if Center St is blocked before you get there.</h1>' +
      '<p class="t-body muted" style="margin:0">MavRadar uses a sensor at the tracks to show live crossing status. No account, and no location needed.</p></div>' +
      '<div style="flex:1"></div>' +
      '<div style="display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border-radius:16px;background:var(--surface)">' + I.info + '<span class="t-sec">Travel information only. Always obey crossing signals and gates.</span></div>' +
      '<button type="button" class="btn filled" style="justify-content:center"' + fk('start') + '><span class="t-btn">See live status</span></button></div>';
  }

  function statusView() {
    const c = byId(S.statusId);
    const v = copy(c);
    const big = S.k === 2;
    const following = S.following.has(c.id);
    let card = '<section class="card" data-s="' + v.state + '" aria-live="polite" aria-label="' + esc(v.a11y) + '">' +
      '<span class="ico">' + cardIcon(v.state, 40) + '</span>' +
      '<span class="t-kicker">' + esc(v.kicker) + '</span><h1 class="t-state">' + v.word + '</h1>';
    if (v.dur) card += '<div class="durrow"><span class="t-dur">' + live('dur', v.dur) + '</span><span class="t-body">' + esc(v.sinceTxt) + '</span></div>';
    else card += '<div class="t-line">' + live('line', v.line) + '</div>';
    if (v.retry) card += '<button type="button" class="retry t-body"' + fk('retry') + '>Retry</button>';
    const dot = v.freshKind === 'live'
      ? svg(10, '<circle class="live-dot" cx="24" cy="24" r="24" style="fill:var(--c-ink)"/>')
      : svg(10, '<circle cx="24" cy="24" r="19" style="fill:none;stroke:currentColor;stroke-width:9"/>');
    card += '<div class="fresh t-sec' + (v.freshKind === 'delayed' ? ' dim' : '') + '">' + dot + live('fresh', v.fresh) + '</div>';
    if (v.state === 'stopped') card += '<span class="stripe"></span>';
    card += '</section>';

    const tip = '<div style="display:flex;align-items:flex-start;gap:12px;padding:14px 4px 10px 16px;border-radius:16px;background:var(--surface);border:1px solid var(--divider)">' + I.clock +
      '<div class="stack" style="flex:1;gap:2px"><span class="t-body" style="font-weight:600;line-height:1.4">Set your commute hours so alerts only come when you drive.</span>' +
      '<button type="button" class="t-sec" style="align-self:flex-start;min-height:40px;font-weight:700;text-decoration:underline;text-underline-offset:3px"' + fk('tipGo') + '>Set commute hours</button></div>' +
      '<button type="button" style="width:48px;height:48px;margin-top:-10px;display:flex;align-items:center;justify-content:center;color:var(--text2)" aria-label="Dismiss tip"' + fk('tipDismiss') + '>' + I.close + '</button></div>';

    const rows = '<div class="stack">' +
      '<div class="row"><span class="t-body">Alerts for ' + esc(c.name) + '</span>' + switchBtn(following, 'toggleFollow', c.id, 'Alerts for ' + c.name) + '</div>' +
      '<div class="row"><span class="t-body">Sensor</span><span class="val t-sec" style="color:' + (v.state === 'unknown' ? 'var(--text2)' : 'var(--text)') + '">' +
      (v.state === 'unknown' ? svg(10, '<circle cx="24" cy="24" r="19" style="fill:none;stroke:var(--text2);stroke-width:9"/>') : svg(10, '<circle cx="24" cy="24" r="24" style="fill:var(--ok)"/>')) + esc(v.sensor) + '</span></div>' +
      '<div class="row"><span class="t-body">Last blockage</span><span class="val t-sec muted">' + lastBlockage(c) + '</span></div></div>';

    const sw = S.following.size > 1 ? '<button type="button" class="text-btn t-sec"' + fk('switchCrossing') + '>Switch</button>' : '';
    return '<div class="view">' +
      '<header class="head"><div class="grow"><div class="t-name">' + esc(c.name) + '</div><div class="t-sec muted">' + esc(c.city) + ', TX · ' + (c.usdot ? 'USDOT ' + c.usdot : 'Mock crossing') + '</div></div>' + sw + '</header>' +
      '<div class="scroll pad stack" data-scroll="status" style="gap:16px;padding-top:8px;padding-bottom:4px">' + card +
      '<p class="t-body" style="margin:0">' + esc(v.expl) + '</p>' + (S.tip ? tip : timeline(c)) + rows + (big ? disclaimer : '') + '</div>' +
      '<div class="pinned">' + directionsBtn(v.state !== 'clear') + (big ? '' : disclaimer) + '</div>' + nav('status') + '</div>';
  }

  // ---- map
  const STREET_SVG = () => '<svg width="412" height="1200" viewBox="0 0 412 1200" aria-hidden="true" style="display:block">' +
    '<rect width="412" height="1200" style="fill:var(--land)"/>' +
    '<path d="M-10 712C80 700 120 770 200 760S330 812 430 792" style="fill:none;stroke:var(--water);stroke-width:10;stroke-linecap:round"/>' +
    '<rect x="258" y="530" width="84" height="54" rx="4" style="fill:var(--park)"/>' +
    '<path d="M96 0V1200M166 0V1200M236 0V1200M316 0V1200M386 0V1200M0 190H412M0 500H412M0 600H412M0 860H412M0 980H412" style="fill:none;stroke:var(--casing);stroke-width:9"/>' +
    '<path d="M96 0V1200M166 0V1200M236 0V1200M316 0V1200M386 0V1200M0 190H412M0 500H412M0 600H412M0 860H412M0 980H412" style="fill:none;stroke:var(--road);stroke-width:7"/>' +
    '<path d="M0 300H412" style="stroke:var(--casing);stroke-width:16"/><path d="M0 300H412" style="stroke:var(--major);stroke-width:13"/>' +
    '<path d="M0 392L412 404" style="stroke:var(--rail);stroke-width:3;stroke-dasharray:10 6"/><path d="M84 388.5h24M84 401.5h24" style="stroke:var(--rail);stroke-width:2"/>' +
    '<g style="font-size:11px;font-weight:600;fill:var(--maplabel)"><text x="14" y="304">Division St</text><text x="14" y="504">Main St</text><text x="14" y="604">Abram St</text>' +
    '<text transform="translate(100 262) rotate(-90)">West St</text><text transform="translate(240 262) rotate(-90)">Center St</text><text transform="translate(320 262) rotate(-90)">Mesquite St</text>' +
    '<text x="300" y="426" style="font-style:italic;font-weight:500">Union Pacific</text></g></svg>';
  const AREA_SVG = (vb, labels) => '<svg width="412" height="915" viewBox="' + vb + '" aria-hidden="true" style="display:block">' +
    '<rect x="-700" y="-700" width="1900" height="2600" style="fill:var(--land)"/>' +
    '<path d="M-320 880C-220 830 -120 860 -40 900S40 1010 -60 1060S-280 1060 -320 1000Z" style="fill:var(--water)"/>' +
    '<rect x="222" y="420" width="96" height="70" rx="6" style="fill:var(--park)"/>' +
    '<path d="M84 -300V1215M138 -300V1215M246 -300V1215M300 -300V1215M412 -300V1215M-300 220H712M-300 460H712M-300 560H712M-300 660H712M-300 880H712" style="fill:none;stroke:var(--casing);stroke-width:7"/>' +
    '<path d="M84 -300V1215M138 -300V1215M246 -300V1215M300 -300V1215M412 -300V1215M-300 220H712M-300 460H712M-300 560H712M-300 660H712M-300 880H712" style="fill:none;stroke:var(--road);stroke-width:5"/>' +
    '<path d="M-300 300H712M-300 780H712M30 -300V1215M192 -300V1215M354 -300V1215" style="fill:none;stroke:var(--casing);stroke-width:11"/>' +
    '<path d="M-300 300H712M-300 780H712M30 -300V1215M192 -300V1215M354 -300V1215" style="fill:none;stroke:var(--major);stroke-width:8"/>' +
    '<path d="M-300 140H712M165 -300V1215" style="fill:none;stroke:var(--casing);stroke-width:16"/><path d="M-300 140H712M165 -300V1215" style="fill:none;stroke:var(--major);stroke-width:13"/>' +
    '<path d="M-300 345L712 395.6" style="stroke:var(--rail);stroke-width:3;stroke-dasharray:10 6"/><path d="M-300 908L712 290" style="stroke:var(--rail);stroke-width:3;stroke-dasharray:10 6"/>' +
    (labels ? '<g style="font-size:11px;font-weight:600;fill:var(--maplabel)"><text x="366" y="144">I-30</text><text x="226" y="304">Division St</text><text x="226" y="784">Pioneer Pkwy</text><text transform="translate(169 250) rotate(-90)">SH 360</text><text transform="translate(196 270) rotate(-90)">Cooper St</text></g>' : '') + '</svg>';

  function markerHtml(c, x, y) {
    const v = copy(c);
    const sel = S.sheet !== 'none' && S.selectedId === c.id;
    const size = sel ? 44 : 36;
    let h = '<button type="button" class="marker" style="left:' + x + 'px;top:' + y + 'px" aria-label="' + esc(v.a11y) + '"' + fk('select', c.id) + '>' + markerIcon(v.state, size) + '</button>';
    if (S.following.has(c.id)) h += '<span class="star-badge" style="left:' + (x + size * 0.28) + 'px;top:' + (y - size / 2 - 4) + 'px">' + svg(16, '<circle cx="8" cy="8" r="7.5" style="fill:#FFFFFF;stroke:rgba(0,0,0,0.4);stroke-width:1"/><path d="M8 3.2l1.4 2.9 3.2.4-2.3 2.2.6 3.2L8 10.4l-2.9 1.5.6-3.2-2.3-2.2 3.2-.4z" style="fill:#111418"/>', '0 0 16 16') + '</span>';
    if (sel) h += '<span class="marker-label" style="left:' + x + 'px;top:' + y + 'px">' + esc(c.name) + ' · ' + v.word + '</span>';
    return h;
  }
  function clusterHtml(cl) {
    const members = cl.ids.map(byId);
    if (members.length === 1) return markerHtml(members[0], cl.x, cl.y);
    const states = members.map((c) => eff(c).state);
    const hot = states.filter((s) => s === 'blocked' || s === 'stopped').length;
    const worst = states.includes('stopped') ? 'stopped' : states.includes('blocked') ? 'blocked' : null;
    const circ = 2 * Math.PI * 21;
    let ring = '';
    if (worst) ring = '<circle cx="26" cy="26" r="21" transform="rotate(-90 26 26)" style="fill:none;stroke:' + STRONG[worst][0] + ';stroke-width:4;stroke-dasharray:' + (circ * hot / members.length).toFixed(1) + ' ' + circ.toFixed(1) + '"/>';
    const label = members.length + ' crossings' + (hot ? ', ' + hot + ' blocked or stopped' : ', none blocked') + '. Zoom in.';
    let h = '<button type="button" class="marker" style="left:' + cl.x + 'px;top:' + cl.y + 'px;width:52px;height:52px;margin:-26px 0 0 -26px" aria-label="' + label + '"' + fk('zoomIn', cl.ids[0]) + '>' +
      '<svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" style="position:absolute;left:0;top:0"><circle cx="26" cy="26" r="21" style="fill:var(--cluster-bg);stroke:rgba(0,0,0,0.4);stroke-width:5"/><circle cx="26" cy="26" r="21" style="fill:var(--cluster-bg);stroke:#FFFFFF;stroke-width:3"/>' + ring + '</svg>' +
      '<span style="position:relative;font-size:16px;font-weight:700">' + members.length + '</span></button>';
    if (worst) h += '<span class="star-badge" style="left:' + (cl.x + 14) + 'px;top:' + (cl.y - 32) + 'px">' + markerIcon(worst, 20) + '</span>';
    return h;
  }

  function sheetHtml() {
    const c = byId(S.selectedId);
    const v = copy(c);
    const fol = S.following.has(c.id);
    const h = sheetHeight();
    let body = '<div style="display:flex;align-items:flex-start;gap:12px"><div class="stack" style="flex:1;gap:4px;min-width:0">' +
      '<div style="font-size:20px;line-height:1.3;font-weight:600">' + esc(c.name) + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' + plainIcon(v.state, 24) + '<span style="font-size:16px;font-weight:700">' + v.word + '</span></div>' +
      '<div class="t-sec muted">' + live('meta-' + c.id, v.meta) + '</div></div>' +
      '<button type="button" class="pill-btn" aria-pressed="' + fol + '" style="margin-top:4px"' + fk('toggleFollow', c.id) + '>' + (fol ? I.check : I.plus) + (fol ? 'Following' : 'Follow') + '</button></div>';
    if (S.sheet === 'half' || S.sheet === 'full') {
      body += '<div class="stack" style="gap:12px;padding-top:18px">' + directionsBtn(v.state !== 'clear');
      if (watchVisible()) {
        body += '<button type="button" class="btn tonal"' + fk('watch') + '>' + I.eye + '<span class="lbl"><span class="t-btn">' + (S.watching ? 'Stop watching' : 'Watch this blockage') + '</span><span class="t-btnsub muted">' + (S.watching ? 'Showing in your status bar' : 'Live in your status bar until it clears · v1.1 preview') + '</span></span></button>';
      }
      body += '<div class="stack">' +
        '<div class="row"><span class="t-body">Sensor</span><span class="val t-sec muted">' + esc(v.state === 'unknown' ? v.sensor : v.sensor + ' · battery OK') + '</span></div>' +
        '<div class="row"><span class="t-body">Last blockage</span><span class="val t-sec muted">' + lastBlockage(c) + '</span></div>' +
        '<div class="row"><span class="t-body">30-day typical blockage</span><span class="val t-sec muted">4 min</span></div></div>' + disclaimer + '</div>';
    }
    if (S.sheet === 'full') {
      const counts = [18, 14, 21, 19, 22, 20, 12 + S.extra.length];
      const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Today'];
      body += '<div class="stack" style="gap:12px;padding-top:22px"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:16px;font-weight:600">Last 7 days</span><span class="t-sec muted">Blockages per day</span></div>' +
        '<div class="week">' + counts.map((n, i) => '<div><span>' + n + '</span><i style="height:' + Math.round(Math.min(n, 24) / 24 * 92) + 'px;background:' + (i === 6 ? 'repeating-linear-gradient(-45deg,var(--gap) 0 2px,transparent 2px 5px)' : 'var(--gap)') + '"></i><span style="font-weight:' + (i === 6 ? 700 : 400) + '">' + days[i] + '</span></div>').join('') + '</div>' +
        '<button type="button" class="btn outline"' + fk('openStatus', c.id) + '>Open in Status</button></div>';
    }
    return '<section class="sheet" style="height:' + h + 'px" aria-label="' + esc(c.name) + ' details">' +
      '<button type="button" class="grab" data-drag="sheet"' + fk('cycleSheet') + ' aria-label="Sheet is ' + S.sheet + '. Tap to resize, or drag."><span></span></button>' +
      '<div class="sheet-body" data-scroll="sheet">' + body + '</div></section>';
  }

  function segControl(listActive) {
    const mapBtn = S.mapFails
      ? '<button type="button" disabled>Map</button>'
      : '<button type="button" aria-pressed="' + !listActive + '"' + fk('mapView', 'map') + '>' + (!listActive ? I.check : '') + 'Map</button>';
    return '<div class="seg" role="group" aria-label="View">' + mapBtn + '<button type="button" aria-pressed="' + listActive + '"' + fk('mapView', 'list') + '>' + (listActive ? I.check : '') + 'List</button></div>';
  }

  function mapView() {
    const listMode = S.mapView === 'list' || S.mapFails;
    if (listMode) return listView();
    const street = S.dataset === 'one';
    const shift = street && (S.sheet === 'half' || S.sheet === 'full') ? -170 : 0;
    let layer = street ? STREET_SVG() : AREA_SVG(S.zoom === 'cluster' ? '-206 -152 824 1830' : '0 0 412 915', S.zoom !== 'cluster');
    if (street) {
      layer += '<span class="marker" style="left:96px;top:390px;pointer-events:none">' + svg(28, '<path d="M14 35C14 35 2 21.5 2 13.5a12 12 0 0 1 24 0C26 21.5 14 35 14 35z" style="fill:var(--detour);stroke:#FFFFFF;stroke-width:2"/><path d="M9 19v-4a3 3 0 0 1 3-3h7M16.5 9.5L19 12l-2.5 2.5" style="fill:none;stroke:#FFFFFF;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"/>', '0 0 28 36').replace('height="28"', 'height="36"') + '</span>' +
        '<span class="detour-label" style="left:116px;top:374px">West St underpass</span>' + markerHtml(byId('center'), 236, 399);
    } else if (S.zoom === 'cluster') {
      layer += CLUSTERS.map(clusterHtml).join('');
    } else {
      layer += CROSSINGS.map((c) => markerHtml(c, c.ax, c.ay)).join('');
    }
    let top = '<div class="map-top">' + segControl(false) + '</div>';
    if (S.conn !== 'online' && S.sheet !== 'full') {
      top += '<div class="banner offline" role="status">' + I.cloudOff + '<span class="stack" style="gap:2px"><span style="font-size:15px;font-weight:700">' + (S.conn === 'phone' ? "You're offline." : "Can't reach MavRadar.") + '</span><span class="t-sec muted">Crossings show Unknown until ' + (S.conn === 'phone' ? 'you reconnect.' : 'we reconnect.') + '</span></span></div>';
    } else if (street && S.sheet !== 'full') {
      top += '<div class="banner"><span class="t-sec">1 crossing live in Arlington. More coming.</span><a href="#" class="t-sec"' + fk('suggest') + '>Suggest a crossing</a></div>';
    }
    if (!street && S.sheet !== 'full') {
      top += '<div class="zoom" style="bottom:' + (sheetHeight() + 12) + 'px"><button type="button" aria-label="Zoom in"' + fk('zoomIn') + '>+</button><button type="button" aria-label="Zoom out"' + fk('zoomOut') + '>−</button></div>';
    }
    return '<div class="view"><div class="map-area" data-map="1"><div class="map-layer" style="transform:translateY(' + shift + 'px)">' + layer + '</div>' + top + (S.sheet !== 'none' ? sheetHtml() : '') + '</div>' + nav('map') + '</div>';
  }

  function listView() {
    const vis = visible();
    const cities = [];
    vis.forEach((c) => { if (!cities.includes(c.city)) cities.push(c.city); });
    const rank = (c) => (S.following.has(c.id) ? 0 : ['blocked', 'stopped'].includes(eff(c).state) ? 1 : 2);
    let rows = '';
    cities.forEach((city) => {
      const list = vis.filter((c) => c.city === city).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      rows += '<h2 class="sec-h">' + esc(city) + '</h2>' + list.map((c) => {
        const v = copy(c);
        const fol = S.following.has(c.id);
        return '<div class="lrow">' + plainIcon(v.state, 32) +
          '<button type="button" class="main" aria-label="' + esc(v.a11y) + ' Show on map."' + fk('selectFromList', c.id) + '><span style="font-size:16px;line-height:1.4;font-weight:600">' + esc(c.name) + '</span>' +
          '<span class="t-sec muted"><b style="color:var(--text)">' + v.word + '</b>' + live('list-' + c.id, v.rest) + '</span></button>' +
          '<button type="button" class="star" aria-pressed="' + fol + '" aria-label="' + (fol ? 'Unfollow ' : 'Follow ') + esc(c.name) + '"' + fk('toggleFollow', 'star-' + c.id) + ' data-cid="' + c.id + '">' + (fol ? I.starOn : I.starOff) + '</button></div>';
      }).join('');
    });
    const errorBanner = S.mapFails ? '<div role="status" style="margin:4px 20px 8px;padding:12px 14px;border-radius:16px;background:var(--surface);display:flex;align-items:center;gap:10px">' + I.mapOff + '<span style="font-size:15px;font-weight:600">Map unavailable. Showing list.</span></div>' : '';
    const offline = S.conn !== 'online' ? '<div role="status" style="margin:4px 20px 8px;padding:12px 14px;border-radius:16px;border:2px dashed var(--gap);display:flex;align-items:center;gap:10px">' + I.cloudOff + '<span style="font-size:15px;font-weight:600">' + (S.conn === 'phone' ? "You're offline." : "Can't reach MavRadar.") + '</span></div>' : '';
    const one = S.dataset === 'one' ? '<div style="margin:16px 20px 0;padding:14px 16px;border-radius:16px;background:var(--surface)" class="stack"><span class="t-sec">1 crossing live in Arlington. More coming.</span><a href="#" class="t-sec" style="align-self:flex-start;min-height:36px;display:flex;align-items:center;font-weight:700;text-underline-offset:3px"' + fk('suggest') + '>Suggest a crossing</a></div><div class="pad" style="padding-top:16px">' + disclaimer + '</div>' : '';
    return '<div class="view"><div style="display:flex;justify-content:center;padding:40px 20px 12px;flex-shrink:0"><div style="width:216px">' + segControl(true) + '</div></div>' + errorBanner + offline +
      '<div class="scroll" data-scroll="list">' + rows + one + '</div>' + nav('map') + '</div>';
  }

  function historyView() {
    const c = byId(S.historyId);
    const empty = S.historyEmpty || c.id !== 'center';
    const thirty = S.historyRange === '30';
    const chip = (r, label) => '<button type="button" class="chipbtn" aria-pressed="' + (S.historyRange === r) + '"' + fk('range', r) + '><span>' + (S.historyRange === r ? I.check : '') + label + '</span></button>';
    let body;
    if (empty) {
      body = '<div class="stack" style="flex:1;justify-content:center;gap:12px;padding:0 32px 80px">' + I.history.replace('width="24" height="24"', 'width="44" height="44"').replace('stroke-width="2"', 'stroke-width="1.6" style="color:var(--text2)"') +
        '<p style="margin:0;font-size:20px;line-height:1.3;font-weight:600">No blockages recorded yet.</p><p class="t-body muted" style="margin:0">History starts from when this sensor went live on [launch date].</p></div>';
    } else {
      const hv = thirty ? [0.7, 0.6, 0.7, 0.7, 0.6, 0.8, 0.9, 0.9, 0.9, 0.8, 0.9, 1.0, 1.0, 1.1, 1.3, 1.4, 1.3, 1.1, 0.9, 0.8, 0.8, 0.7, 0.6, 0.6] : [0.6, 0.5, 0.7, 0.8, 0.6, 0.7, 0.9, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.6, 0.5];
      const max = Math.max.apply(null, hv);
      const peak = hv.indexOf(max);
      const hr = (h) => (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? ' AM' : ' PM');
      const ev = (x) => {
        const hatch = 'repeating-linear-gradient(-45deg,var(--stopped-bar) 0 3px,var(--moving) 3px 6px)';
        return '<div style="display:flex;align-items:center;gap:12px;min-height:52px;border-bottom:1px solid var(--divider)" aria-label="' + (x.stopped ? 'Stopped' : 'Moving') + ' train at ' + fmt(x.start) + ', blocked ' + x.dur + ' minutes">' +
          plainIcon(x.stopped ? 'stopped' : 'blocked', 20) + '<span style="width:74px;flex-shrink:0;font-size:15px;font-weight:600">' + fmt(x.start) + '</span>' +
          '<span style="flex:1;height:8px;border-radius:4px;background:var(--track);overflow:hidden"><span style="display:block;height:8px;border-radius:4px;width:' + Math.min(100, Math.round(x.dur / 40 * 100)) + '%;background:' + (x.stopped ? hatch : 'var(--moving)') + '"></span></span>' +
          '<span class="t-sec muted" style="width:112px;flex-shrink:0;text-align:right"><b style="color:var(--text)">' + x.dur + ' min</b> · ' + (x.stopped ? 'stopped' : 'moving') + '</span></div>';
      };
      const today = todayEvents(c).sort((a, b) => b.start - a.start);
      const yday = YESTERDAY.map(([m, d, st]) => ({ start: m * 60, dur: d, stopped: !!st }));
      const total7 = 126 + S.extra.length;
      body = '<div class="scroll" data-scroll="history"><div class="pad stack" style="gap:16px;padding-top:4px">' +
        '<p class="t-body" style="margin:0"><b>' + (thirty ? '30 days:' : '7 days:') + '</b> ' + (thirty ? (571 + S.extra.length) + ' blockages · typical 4 min · longest 38 min (stopped)' : total7 + ' blockages · typical 4 min · longest 21 min (stopped)') + '</p>' +
        '<section style="padding:16px;border-radius:20px;background:var(--surface)" class="stack" aria-label="Busiest hours. Most blockages between ' + hr(peak) + ' and ' + hr(peak + 1) + '."><div class="stack" style="gap:2px;margin-bottom:10px"><span style="font-size:16px;font-weight:600">Busiest hours</span><span style="font-size:13px" class="muted">Average blockages per hour. Past data, not a prediction.</span></div>' +
        '<div style="position:relative;height:96px;display:flex;align-items:flex-end;gap:3px;padding-top:18px">' + hv.map((x, i) => '<span style="flex:1;height:' + Math.round(x / max * 70) + 'px;border-radius:2px 2px 0 0;background:' + (i === peak ? 'var(--text)' : 'var(--bar)') + '"></span>').join('') +
        '<span style="position:absolute;top:0;left:' + ((peak + 0.5) / 24 * 100).toFixed(1) + '%;transform:translateX(-50%);font-size:12px;font-weight:700;white-space:nowrap">Busiest ' + hr(peak) + ' to ' + hr(peak + 1) + '</span></div>' +
        '<div class="tl-axis t-axis" style="margin-top:10px"><span style="left:0">12 AM</span><span style="left:25%">6 AM</span><span style="left:50%">12 PM</span><span style="left:75%">6 PM</span></div></section></div>' +
        '<div class="pad" style="padding-top:8px"><h2 class="sec-h" style="padding-left:0">Today</h2>' + today.map(ev).join('') + '<h2 class="sec-h" style="padding-left:0">Yesterday</h2>' + yday.map(ev).join('') + '</div></div>';
    }
    return '<div class="view"><header style="padding:36px 12px 4px;flex-shrink:0"><button type="button" style="display:flex;align-items:center;gap:6px;min-height:48px;padding:4px 8px;border-radius:12px;text-align:left" aria-label="Crossing: ' + esc(c.name) + '. Change crossing"' + fk('historyPicker') + '>' +
      '<span class="stack"><span class="t-name">' + esc(c.name) + '</span><span class="t-sec muted">' + esc(c.city) + ', TX · History</span></span>' + I.chevD + '</button></header>' +
      '<div class="chips pad" role="group" aria-label="Range" style="padding-top:4px;padding-bottom:8px;flex-shrink:0">' + chip('7', '7 days') + chip('30', '30 days') + '</div>' + body + nav('history') + '</div>';
  }

  function settingsView() {
    const granted = S.permission === 'granted';
    const statusLine = granted ? 'Android notifications are on for MavRadar.' : S.permission === 'denied' ? 'Android notifications are off for MavRadar.' : "Notifications aren't set up yet. They turn on when you follow a crossing.";
    const followed = CROSSINGS.filter((c) => S.following.has(c.id)).map((c) => c.name);
    const types = [['blocked', 'Blocked', 'When a train blocks the crossing'], ['cleared', 'Cleared', 'When the crossing clears'], ['stopped', 'Stopped', 'When a train stops across the road'], ['approaching', 'Approaching', 'Available when early-warning sensors are installed']];
    const toggles = types.map(([k, t, d]) => {
      const dis = k === 'approaching';
      let h = '<div class="row row72 inset" style="border-top:0;border-bottom:1px solid var(--divider)"><span class="stack" style="flex:1;gap:2px"><span class="t-body" style="line-height:1.4;color:' + (dis ? 'var(--text2)' : 'var(--text)') + '">' + t + '</span><span class="t-sec muted">' + d + '</span></span>' + switchBtn(!dis && granted && S.alerts[k], 'alertType', k, t + ' alerts', dis) + '</div>';
      if (S.settingsCard === k) {
        h += '<div role="status" style="margin:12px 20px 4px;padding:14px 16px;border-radius:16px;border:1px solid var(--outline)" class="stack"><span class="t-sec" style="font-weight:600;margin-bottom:6px">Notifications are off for MavRadar in Android settings.</span><span class="t-sec muted" style="margin-bottom:10px">Turn them on there to get alerts. Status still works without them.</span>' +
          '<button type="button" class="pill-btn" style="align-self:flex-start;padding:0 18px"' + fk('openAndroidSettings') + '>Open settings</button></div>';
      }
      return h;
    }).join('');
    const seg = (opts, cur, act) => '<div class="seg" role="group">' + opts.map(([v, l]) => '<button type="button" aria-pressed="' + (String(cur) === String(v)) + '"' + fk(act, v) + '>' + (String(cur) === String(v) ? I.check : '') + l + '</button>').join('') + '</div>';
    const navRow = (act, title, desc, val) => '<button type="button" class="row row72 inset" style="width:calc(100% - 40px);border-top:0;border-bottom:1px solid var(--divider);text-align:left"' + fk(act) + '><span class="stack" style="flex:1;gap:2px"><span class="t-body" style="line-height:1.4">' + title + '</span>' + (desc ? '<span class="t-sec muted">' + desc + '</span>' : '') + '</span><span style="font-size:15px;font-weight:600">' + val + '</span>' + I.chevR + '</button>';
    const commute = ['All day', 'Weekdays 7 to 9 AM, 4 to 7 PM'][S.commute];
    const quiet = ['Off', '10 PM to 6 AM'][S.quiet];
    return '<div class="view"><div class="scroll" data-scroll="settings"><header style="padding:36px 20px 8px"><h1 class="t-name" style="margin:0">Settings</h1></header>' +
      '<h2 class="sec-h">Alerts</h2><div style="margin:0 20px;padding:12px 14px;border-radius:16px;background:var(--surface);display:flex;align-items:center;gap:10px">' + (granted ? I.bell : I.bellOff) + '<span class="t-sec">' + statusLine + '</span></div>' +
      '<div class="pad t-sec muted" style="padding-top:14px">' + (followed.length ? 'For crossings you follow: ' + esc(followed.join(', ')) : "You're not following a crossing yet. Follow one from Status or the map.") + '</div>' +
      toggles +
      '<div class="inset stack" style="gap:10px;padding-top:16px;padding-bottom:16px;border-bottom:1px solid var(--divider)"><span class="t-body">Minimum blockage before alerting</span>' + seg([[1, '1 min'], [3, '3 min'], [5, '5 min']], S.minBlock, 'minBlock') + '<span class="t-sec muted">Blockages shorter than this won\'t alert you.</span></div>' +
      navRow('commute', 'Commute windows', 'Only alert at set times, like weekdays 7 to 9 AM', commute.length > 10 ? 'Set' : commute) + navRow('quiet', 'Quiet hours', 'No alerts overnight or while you sleep', quiet.length > 4 ? 'On' : quiet) +
      '<h2 class="sec-h" style="padding-top:24px">Appearance</h2><div class="pad">' + seg([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], S.appearance, 'appearance') + '</div>' +
      '<h2 class="sec-h" style="padding-top:24px">Brand colors <span style="font-weight:500">· exploring options</span></h2><div class="inset stack" role="radiogroup" aria-label="Brand colors">' +
      Object.keys(BRANDS).map((key) => {
        const b = BRANDS[key];
        const p = b[theme()];
        const on = S.brand === key;
        return '<button type="button" class="brand-opt" role="radio" aria-checked="' + on + '"' + fk('brand', key) + '><span class="radio' + (on ? ' on' : '') + '"></span>' +
          '<span class="brand-sw" aria-hidden="true"><i style="background:' + p.bg + '"></i><i style="background:' + p.surface + '"></i><i style="background:' + p.primary + '"></i><i style="background:' + p.text + '"></i></span>' +
          '<span class="stack" style="flex:1;gap:2px"><span class="t-body" style="font-weight:600;line-height:1.4">' + b.name + '</span><span class="t-sec muted">' + b.desc + '</span></span></button>';
      }).join('') + '</div><p class="t-disc inset" style="padding-top:10px">Brand colors change neutrals and buttons only. Crossing status colors stay the same in every option.</p>' +
      '<h2 class="sec-h" style="padding-top:24px">About</h2>' + navRow('aboutHow', 'How detection works', '', '') + navRow('aboutSensors', 'Sensors', '', '1 online') + navRow('feedback', 'Send feedback', '', '') +
      '<div class="inset stack" style="gap:4px;padding-top:16px;padding-bottom:16px;border-bottom:1px solid var(--divider)"><span class="t-body">Privacy</span><span class="t-sec muted">No account. No location. We store an anonymous device token for alerts.</span></div>' +
      '<div class="pad" style="padding-top:16px">' + disclaimer + '<p class="t-disc" style="padding:4px 0 24px">Version 1.0.0 · mockup</p></div></div>' + nav('settings') + '</div>';
  }

  // ---- notifications
  function notifData(n) {
    const e = eff(byId('center'));
    if (n.kind === 'live') {
      const m = e.since ? minsSince(e.since) : 0;
      return { kind: 'blocked', accent: '#C62828', hdr: 'MavRadar · Watching this blockage', title: e.state === 'stopped' ? 'Train stopped on Center St' : 'Center St is blocked', body: 'Blocked for ' + m + ' min, since ' + (e.since ? fmt(e.since) : '') + '. Detour: West St underpass.', when: 'Live', acts: [['nDirections', 'Directions via West St'], ['nStopWatch', 'Stop watching']], key: 'live' };
    }
    return n;
  }
  function notifCard(n0, opts) {
    const n = notifData(n0);
    const exp = opts.expanded;
    const acc = n.accent;
    return '<div class="notif ' + (exp ? '' : 'collapsed ') + (opts.raised ? 'raised' : '') + '">' +
      '<div class="top"><span class="circ" style="background:' + acc + '">' + notifGlyph(n.kind, acc) + '</span>' +
      '<button type="button" class="txt" style="text-align:left"' + fk('nOpen', n.key) + '>' + (exp ? '<span class="hdr">' + esc(n.hdr) + '</span>' : '') +
      '<span style="display:flex;align-items:baseline;gap:6px;min-width:0"><span class="ttl">' + esc(n.title) + '</span>' + (exp ? '' : '<span style="flex-shrink:0;font-size:12px;color:var(--text2)">· ' + esc(n.when) + '</span>') + '</span>' +
      '<span class="body">' + esc(n.body) + '</span></button>' +
      '<button type="button" class="chev" aria-label="' + (exp ? 'Collapse' : 'Expand') + '"' + fk('nToggle', n.key) + '><span style="display:flex;transform:rotate(' + (exp ? 180 : 0) + 'deg)">' + I.chevD + '</span></button></div>' +
      (exp && n.acts && n.acts.length ? '<div class="acts">' + n.acts.map(([a, l]) => '<button type="button"' + fk(a, n.key) + '>' + l + '</button>').join('') + '</div>' : '') + '</div>';
  }
  function makeNotif(kind) {
    const e = eff(byId('center'));
    const base = { kind, created: simNow, when: 'now' };
    if (kind === 'blocked') return Object.assign(base, { key: 'crossing', accent: '#C62828', hdr: 'MavRadar · Crossing blocked and cleared · now', title: 'Center St is blocked', body: 'Train on the crossing since ' + fmt(e.since) + '. Detour: West St underpass.', acts: [['nDirections', 'Directions via West St'], ['nMute', 'Mute today']] });
    if (kind === 'stopped') return Object.assign(base, { key: 'crossing', accent: '#8E1B1B', hdr: 'MavRadar · Crossing blocked and cleared · now', title: 'Train stopped on Center St', body: 'Stopped since ' + fmt(e.stoppedAt) + '. Blocked for ' + minsSince(e.since) + ' min.', acts: [['nDirections', 'Directions via West St']] });
    if (kind === 'cleared') return Object.assign(base, { key: 'crossing', accent: '#007A6E', hdr: 'MavRadar · Crossing blocked and cleared · ' + fmt(simNow), title: 'Center St is clear', body: 'Blocked for ' + S.lastBlockMins + ' min. Cleared at ' + fmt(simNow) + '.', acts: [], when: fmt(simNow) });
    return Object.assign(base, { key: 'sensor', accent: '#6B7280', silent: true, hdr: 'MavRadar · Sensor status · ' + fmt(simNow), title: 'Center St status unknown', body: 'No sensor data since ' + fmt(e.last) + ". Don't assume it's clear.", acts: [], when: fmt(simNow) });
  }
  let headsTimer = null;
  function notify(kind) {
    if (S.permission !== 'granted') return;
    const watchEnd = kind === 'cleared' && S.watching;
    if (!S.following.has('center') && !watchEnd) return;
    if (kind !== 'unknown' && S.mutedToday) return;
    if (kind !== 'unknown' && !watchEnd && !S.alerts[kind]) return;
    const n = makeNotif(kind);
    S.notifs = [n].concat(S.notifs.filter((x) => x.key !== n.key));
    if (!n.silent && !S.locked && !S.shade) {
      S.headsUp = n.key;
      S.expanded['hu-' + n.key] = true;
      clearTimeout(headsTimer);
      headsTimer = setTimeout(() => { S.headsUp = null; render(); }, 7000);
    }
  }

  // ---- overlays
  function overlays() {
    let h = '';
    if (S.overlay === 'priming') {
      const c = byId(S.ctx.id || 'center');
      h += '<div class="scrim"' + fk('closeOverlay') + '></div><section class="modal" role="dialog" aria-modal="true" aria-labelledby="ptitle"><div style="display:flex;justify-content:center;padding-top:10px"><span style="width:32px;height:4px;border-radius:2px;background:var(--handle)"></span></div>' +
        '<h2 id="ptitle">Get alerts for ' + esc(c.name) + '?</h2><p class="t-body">We\'ll notify you when a train blocks the crossing and when it clears. No marketing, and you can change this anytime.</p>' +
        '<div aria-label="Example notification" style="pointer-events:none">' + notifCard({ kind: 'blocked', key: 'ex', accent: '#C62828', hdr: 'MavRadar · now', title: c.name + ' is blocked', body: 'Train on the crossing since 2:41 PM. Detour: West St underpass.', when: 'now', acts: [['x', 'Directions via West St'], ['y', 'Mute today']] }, { expanded: true }).replace('class="notif ', 'style="width:auto;background:var(--surface)" class="notif ') + '</div>' +
        '<div class="stack" style="gap:4px"><button type="button" class="btn filled" style="justify-content:center"' + fk('primeYes') + '><span class="t-btn">Turn on alerts</span></button><button type="button" class="btn" style="justify-content:center;min-height:48px"' + fk('closeOverlay') + '><span class="t-btn">Not now</span></button></div></section>';
    }
    if (S.overlay === 'system') {
      h += '<div class="scrim"></div><div class="sysdialog" role="alertdialog" aria-modal="true" aria-labelledby="stitle">' + I.bell + '<p id="stitle" style="margin:0;font-size:20px;line-height:1.3">Allow <b>MavRadar</b> to send you notifications?</p>' +
        '<div class="opts"><button type="button"' + fk('sysAllow') + '>Allow</button><button type="button"' + fk('sysDeny') + '>Don\'t allow</button></div><span style="font-size:11px" class="muted">Android system dialog (simulated)</span></div>';
    }
    if (S.overlay === 'choice') {
      h += '<div class="scrim"' + fk('closeOverlay') + '></div><section class="modal" role="dialog" aria-modal="true" aria-label="' + esc(S.choice.title) + '"><div style="display:flex;justify-content:center;padding-top:10px"><span style="width:32px;height:4px;border-radius:2px;background:var(--handle)"></span></div><h2>' + esc(S.choice.title) + '</h2><div class="stack" role="radiogroup">' +
        S.choice.items.map((it, i) => '<button type="button" class="choice" role="radio" aria-checked="' + !!it.on + '"' + fk('choose', i) + '><span class="radio' + (it.on ? ' on' : '') + '"></span><span class="stack"><span class="t-body">' + esc(it.label) + '</span>' + (it.sub ? '<span class="t-sec muted">' + esc(it.sub) + '</span>' : '') + '</span></button>').join('') + '</div></section>';
    }
    if (S.overlay === 'info') {
      h += '<div class="scrim"' + fk('closeOverlay') + '></div><section class="modal" role="dialog" aria-modal="true" aria-label="' + esc(S.info.title) + '"><div style="display:flex;justify-content:center;padding-top:10px"><span style="width:32px;height:4px;border-radius:2px;background:var(--handle)"></span></div><h2>' + esc(S.info.title) + '</h2>' + S.info.html + '<button type="button" class="btn outline"' + fk('closeOverlay') + '>Done</button></section>';
    }
    if (S.snack) {
      let bottom = 92;
      if (S.onboarded && S.tab === 'map' && S.mapView === 'map' && !S.mapFails) bottom = 80 + sheetHeight() + 12;
      h += '<div class="snack" role="status" style="bottom:' + bottom + 'px"><span>' + esc(S.snack.text) + '</span>' + (S.snack.undo ? '<button type="button"' + fk('snackUndo') + '>Undo</button>' : '') + '</div>';
    }
    const n = S.headsUp && S.notifs.find((x) => x.key === S.headsUp);
    if (n) h += '<div class="headsup">' + notifCard(n, { expanded: S.expanded['hu-' + n.key] !== false, raised: true }) + '</div>';
    if (S.shade || S.locked) {
      const loud = S.notifs.filter((x) => !x.silent);
      const quiet = S.notifs.filter((x) => x.silent);
      const cards = (S.watching ? [{ kind: 'live', key: 'live' }] : []).concat(loud);
      const list = cards.map((x) => notifCard(x, { expanded: !!S.expanded[x.key] || x.key === 'live' })).join('');
      if (S.locked) {
        h += '<div class="lock" role="dialog" aria-label="Lock screen"><div class="clock">' + live('lockclock', clock(simNow)) + '</div><div style="font-size:16px;font-weight:500;margin-bottom:40px">Saturday, September 26</div><div class="stack" style="gap:8px;align-items:center">' + list + '</div>' +
          (quiet.length ? '<div class="stack" style="gap:8px;align-items:center;margin-top:8px">' + quiet.map((x) => notifCard(x, { expanded: !!S.expanded[x.key] })).join('') + '</div>' : '') +
          '<button type="button" class="unlock"' + fk('unlock') + '>Tap to unlock</button></div>';
      } else {
        h += '<div class="shade" role="dialog" aria-label="Notification shade"><div class="when"><b>' + live('shadeclock', clock(simNow)) + '</b><span class="t-sec muted">Sat, Sep 26</span></div>' + (cards.length ? list : '<p class="t-sec muted" style="align-self:stretch;padding:16px 24px">No notifications</p>') +
          (quiet.length ? '<span class="t-sec muted" style="align-self:flex-start;padding:8px 24px 0;font-weight:600">Silent</span>' + quiet.map((x) => notifCard(x, { expanded: !!S.expanded[x.key] })).join('') : '') +
          '<div class="foot"><button type="button"' + fk('clearAll') + '>Clear all</button><button type="button"' + fk('closeShade') + '>Close</button></div></div>';
      }
    }
    return h;
  }

  // ---------------------------------------------------------------- render
  const screen = document.getElementById('screen');
  const panelEl = document.getElementById('panel');
  screen.innerHTML = '<div id="L-app"></div><div id="L-over"></div><div id="L-sys"></div>';
  const LA = document.getElementById('L-app');
  const LO = document.getElementById('L-over');
  const LS = document.getElementById('L-sys');
  function appHtml() {
    if (!S.onboarded) return welcomeView();
    if (S.tab === 'map') return mapView();
    if (S.tab === 'history') return historyView();
    if (S.tab === 'settings') return settingsView();
    return statusView();
  }
  function render() {
    if (S.dragging) return;
    LIVE = {};
    screen.dataset.theme = theme();
    screen.dataset.k = String(S.k);
    screen.style.setProperty('--k', S.k);
    const pal = BRANDS[S.brand][theme()];
    Object.keys(pal).forEach((k) => screen.style.setProperty('--' + k, pal[k]));
    patch(LA, appHtml(), 'app');
    patch(LO, overlays(), 'over');
    patch(LS, sysbar(), 'sys');
    patch(panelEl, panelHtml(), 'panel');
  }

  // ---------------------------------------------------------------- logic
  let snackTimer = null;
  function snack(text, undo) {
    S.snack = { text, undo };
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => { S.snack = null; render(); }, 4500);
  }
  function requestFollow(id, on) {
    const c = byId(id);
    if (!on) { S.following.delete(id); snack('Unfollowed ' + c.name + '.', () => S.following.add(id)); return; }
    if (S.permission === 'unasked') { S.overlay = 'priming'; S.ctx = { type: 'follow', id }; return; }
    S.following.add(id);
    snack(S.permission === 'granted' ? 'Following ' + c.name + '. Alerts on.' : 'Following ' + c.name + '. Notifications are off for MavRadar.', () => S.following.delete(id));
  }
  function applyCtx(allowed) {
    const ctx = S.ctx || {};
    const c = byId(ctx.id || 'center');
    if (ctx.type === 'follow') {
      S.following.add(c.id);
      if (allowed) snack('Following ' + c.name + '. Alerts on.', () => S.following.delete(c.id));
    }
    if (ctx.type === 'watch' && allowed) { S.watching = true; snack('Watching Center St. It shows in your status bar.'); }
    if (ctx.type === 'alert' && allowed) S.alerts[ctx.k] = true;
    if (!allowed) snack('Alerts are off. You can still check status here.');
    S.ctx = null;
  }
  function setCenter(state, liveNow) {
    const cs = S.center;
    const prev = cs.state;
    const wasBlocking = prev === 'blocked' || prev === 'stopped';
    const now = simNow;
    if (state === 'clear') cs.clearSince = liveNow || wasBlocking ? now : now - 30 * 60;
    if (state === 'approaching') cs.detectedAt = liveNow ? now : now - 60;
    if (state === 'blocked') { cs.since = wasBlocking ? cs.since : liveNow ? now : now - 7 * 60; cs.stoppedAt = null; }
    if (state === 'stopped') { cs.since = wasBlocking ? cs.since : liveNow ? now : now - 12 * 60; cs.stoppedAt = prev === 'blocked' || liveNow ? now : now - 7 * 60; }
    if (state === 'sensorOff') cs.lastReading = now - 34 * 60;
    cs.state = state;
    if (state !== 'sensorOff') S.age = 0;
    evaluate();
  }
  function evaluate() {
    const e = eff(byId('center'));
    const cur = e.state;
    const prev = S.prevState;
    if (prev !== cur) {
      const was = prev === 'blocked' || prev === 'stopped';
      const is = cur === 'blocked' || cur === 'stopped';
      if (!was && is) S.evt = { sent: false, stoppedSent: false, since: e.since };
      if (prev === 'blocked' && cur === 'stopped' && S.evt && S.evt.sent && !S.evt.stoppedSent) { notify('stopped'); S.evt.stoppedSent = true; }
      if (was && !is) {
        if (cur === 'clear' || cur === 'approaching') {
          const since = S.evt ? S.evt.since : e.clearSince;
          const mins = Math.max(1, Math.round((simNow - since) / 60));
          S.lastBlockMins = mins;
          S.extra.push({ start: since, dur: mins, stopped: prev === 'stopped' || !!(S.evt && S.evt.stoppedSent) });
          if ((S.evt && S.evt.sent) || S.watching) notify('cleared');
        }
        S.evt = null;
        S.watching = false;
      }
      if (cur === 'unknown' && e.cause === 'sensor') { S.unknownSince = simNow; S.unknownNotified = false; }
      if (cur === 'unknown' && S.watching) S.watching = false;
      S.prevState = cur;
    }
    if ((cur === 'blocked' || cur === 'stopped') && S.evt && !S.evt.sent && simNow - e.since >= S.minBlock * 60) {
      notify(cur);
      S.evt.sent = true;
      if (cur === 'stopped') S.evt.stoppedSent = true;
    }
    if (cur === 'unknown' && e.cause === 'sensor' && !S.unknownNotified && S.unknownSince != null && simNow - S.unknownSince >= 600) {
      notify('unknown');
      S.unknownNotified = true;
    }
  }
  function playTrain() {
    S.conn = 'online'; S.frozen = false; S.age = 0;
    if (S.center.state !== 'clear') setCenter('clear', true);
    S.scenario = { t0: simNow, i: 0, prevSpeed: S.speed === 20 ? 1 : S.speed, steps: [[0, 'approaching'], [40, 'blocked'], [340, 'stopped'], [580, 'clear']] };
    S.speed = 20;
  }

  // ---------------------------------------------------------------- actions
  const A = {
    start() { S.onboarded = true; S.tab = 'status'; },
    tab(d) { S.tab = d.id; S.overlay = null; if (d.id === 'map' && S.sheet === 'none') S.sheet = 'peek'; },
    toggleFollow(d, el) { const id = el.dataset.cid || d.id; requestFollow(id, !S.following.has(id)); },
    directions() { snack('Opens Google Maps with directions via the West St underpass.'); },
    retry() { snack(S.conn === 'server' ? "Still can't reach MavRadar. We'll keep trying." : 'Retrying.'); },
    tipDismiss() { S.tip = false; },
    tipGo() { S.tip = false; S.tab = 'settings'; },
    mapView(d) { S.mapView = d.id; },
    select(d) { S.selectedId = d.id; if (S.sheet === 'none') S.sheet = 'peek'; },
    selectFromList(d) { S.selectedId = d.id; S.mapView = 'map'; S.sheet = 'peek'; if (S.dataset === 'many') S.zoom = 'area'; },
    zoomIn() { S.zoom = 'area'; },
    zoomOut() { S.zoom = 'cluster'; },
    cycleSheet() { if (justDragged) return; S.sheet = { peek: 'half', half: 'full', full: 'peek', none: 'peek' }[S.sheet]; },
    watch() {
      if (S.watching) { S.watching = false; snack('Stopped watching.'); return; }
      if (S.permission !== 'granted') { if (S.permission === 'unasked') { S.overlay = 'priming'; S.ctx = { type: 'watch', id: 'center' }; } else snack('Live updates need notifications, which are off for MavRadar.'); return; }
      S.watching = true; snack('Watching Center St. It shows in your status bar.');
    },
    openStatus(d) { S.statusId = d.id; S.tab = 'status'; },
    suggest(d, el, ev) { ev.preventDefault(); snack('Opens a short form to suggest a crossing.'); },
    switchCrossing() {
      const ids = CROSSINGS.filter((c) => S.following.has(c.id)).map((c) => c.id);
      S.choice = { title: 'Show on Status', items: ids.map((id) => ({ label: byId(id).name, sub: byId(id).city, on: id === S.statusId, id })), pick: (it) => { S.statusId = it.id; } };
      S.overlay = 'choice';
    },
    historyPicker() {
      const list = visible().slice().sort((a, b) => (S.following.has(b.id) - S.following.has(a.id)) || a.name.localeCompare(b.name));
      S.choice = { title: 'History for', items: list.map((c) => ({ label: c.name, sub: c.city + (S.following.has(c.id) ? ' · following' : ''), on: c.id === S.historyId, id: c.id })), pick: (it) => { S.historyId = it.id; } };
      S.overlay = 'choice';
    },
    range(d) { S.historyRange = d.id; },
    alertType(d) {
      const k = d.id;
      if (k === 'approaching') return;
      if (S.permission === 'unasked') { S.overlay = 'priming'; S.ctx = { type: 'alert', id: 'center', k }; return; }
      if (S.permission === 'denied') { S.settingsCard = k; return; }
      S.alerts[k] = !S.alerts[k];
    },
    openAndroidSettings() { snack("Opens Android's notification settings for MavRadar."); },
    minBlock(d) { S.minBlock = Number(d.id); },
    commute() { S.choice = { title: 'Commute windows', items: [{ label: 'All day', sub: 'Alerts any time', on: S.commute === 0, v: 0 }, { label: 'Weekdays 7 to 9 AM, 4 to 7 PM', sub: 'Only while you usually drive', on: S.commute === 1, v: 1 }], pick: (it) => { S.commute = it.v; } }; S.overlay = 'choice'; },
    quiet() { S.choice = { title: 'Quiet hours', items: [{ label: 'Off', on: S.quiet === 0, v: 0 }, { label: '10 PM to 6 AM', sub: 'No alerts overnight', on: S.quiet === 1, v: 1 }], pick: (it) => { S.quiet = it.v; } }; S.overlay = 'choice'; },
    appearance(d) { S.appearance = d.id; },
    brand(d) { S.brand = d.id; },
    aboutHow() { S.info = { title: 'How detection works', html: '<p class="t-body">A small solar-powered radar near the tracks watches for trains and reports every few seconds. When a train is on the crossing, we show it here and, if you follow the crossing, send an alert.</p><p class="t-body">If the sensor goes quiet, we show Unknown instead of guessing.</p>' + disclaimer }; S.overlay = 'info'; },
    aboutSensors() { S.info = { title: 'Sensors', html: '<div class="row"><span class="t-body">Center St · East node</span><span class="val t-sec muted">' + (eff(byId('center')).state === 'unknown' ? 'Offline' : 'Online · battery OK') + '</span></div>' }; S.overlay = 'info'; },
    feedback() { snack('Opens your email app to send feedback.'); },
    primeYes() { S.overlay = 'system'; },
    sysAllow() { S.permission = 'granted'; S.overlay = null; S.settingsCard = null; applyCtx(true); },
    sysDeny() { S.permission = 'denied'; S.overlay = null; applyCtx(false); },
    choose(d) { const it = S.choice.items[Number(d.id)]; S.choice.pick(it); S.overlay = null; S.choice = null; },
    closeOverlay() { S.overlay = null; S.ctx = null; },
    snackUndo() { if (S.snack && S.snack.undo) S.snack.undo(); S.snack = null; },
    nToggle(d) {
      const key = S.headsUp === d.id && !S.shade && !S.locked ? 'hu-' + d.id : d.id;
      const cur = key.indexOf('hu-') === 0 ? S.expanded[key] !== false : !!S.expanded[key];
      S.expanded[key] = !cur;
      if (key.indexOf('hu-') === 0) clearTimeout(headsTimer);
    },
    nOpen() { S.headsUp = null; S.shade = false; S.locked = false; S.onboarded = true; S.tab = 'status'; S.statusId = 'center'; },
    nDirections() { S.headsUp = null; snack('Opens Google Maps with directions via the West St underpass.'); },
    nMute() { S.mutedToday = true; S.headsUp = null; S.notifs = S.notifs.filter((x) => x.key !== 'crossing'); snack('Center St alerts muted for today.'); },
    nStopWatch() { S.watching = false; },
    shade() { S.shade = true; S.headsUp = null; },
    closeShade() { S.shade = false; },
    clearAll() { S.notifs = []; },
    unlock() { S.locked = false; }
  };

  // demo panel actions
  const D = {
    centerState(d) { S.scenario = null; setCenter(d.id, false); },
    playTrain() { playTrain(); },
    freeze() { S.frozen = !S.frozen; if (!S.frozen) S.age = 0; },
    speed(d) { S.speed = Number(d.id); },
    conn(d) { const was = S.conn; S.conn = d.id; if (d.id !== 'online' && was === 'online') S.offlineSince = simNow - 2 * 60; if (d.id === 'online') S.age = 0; },
    appearance(d) { S.appearance = d.id; },
    k(d) { S.k = Number(d.id); },
    perm(d) { S.permission = d.id; S.settingsCard = null; },
    lock() { S.locked = true; S.shade = false; S.headsUp = null; },
    shade() { S.shade = true; S.locked = false; },
    dataset(d) { S.dataset = d.id; S.selectedId = 'center'; S.statusId = 'center'; S.historyId = 'center'; S.zoom = 'area'; },
    mapFails() { S.mapFails = !S.mapFails; },
    historyEmpty() { S.historyEmpty = !S.historyEmpty; },
    tip() { S.tip = !S.tip; },
    onboarding() { S.onboarded = false; S.overlay = null; S.tab = 'status'; },
    reset() { window.location.reload(); }
  };

  // ---------------------------------------------------------------- events
  let justDragged = false;
  screen.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = A[el.dataset.act];
    if (!fn) return;
    fn(el.dataset, el, ev);
    render();
  });
  panelEl.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-demo]');
    if (!el) return;
    D[el.dataset.demo](el.dataset);
    render();
  });
  let drag = null;
  const scale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  screen.addEventListener('pointerdown', (ev) => {
    const g = ev.target.closest('[data-drag="sheet"]');
    if (g) {
      const sheet = g.closest('.sheet');
      drag = { y0: ev.clientY, h0: sheet.getBoundingClientRect().height / scale(), sheet, moved: false, id: ev.pointerId };
      g.setPointerCapture(ev.pointerId);
      return;
    }
    if (ev.target.closest('[data-map]') && !ev.target.closest('button, a, .sheet') && (S.sheet === 'half' || S.sheet === 'full')) { S.sheet = 'peek'; render(); }
  });
  screen.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const dy = (ev.clientY - drag.y0) / scale();
    if (Math.abs(dy) > 4 && !drag.moved) { drag.moved = true; S.dragging = true; drag.sheet.classList.add('dragging'); }
    if (drag.moved) drag.sheet.style.height = Math.max(120, Math.min(775, drag.h0 - dy)) + 'px';
  });
  const endDrag = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    if (drag.moved) {
      const h = drag.sheet.getBoundingClientRect().height / scale();
      const half = watchVisible() ? 508 : 440;
      const snaps = [[120, 'peek'], [half, 'half'], [775, 'full']];
      S.sheet = snaps.reduce((a, b) => (Math.abs(b[0] - h) < Math.abs(a[0] - h) ? b : a))[1];
      drag.sheet.classList.remove('dragging');
      drag.sheet.style.height = sheetHeight() + 'px';
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
      setTimeout(() => { S.dragging = false; render(); }, 260);
    }
    drag = null;
  };
  screen.addEventListener('pointerup', endDrag);
  screen.addEventListener('pointercancel', endDrag);
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (S.overlay) { S.overlay = null; S.ctx = null; }
    else if (S.shade) S.shade = false;
    else if (S.headsUp) S.headsUp = null;
    else if (S.tab === 'map' && (S.sheet === 'full' || S.sheet === 'half')) S.sheet = S.sheet === 'full' ? 'half' : 'peek';
    else return;
    render();
  });
  if (systemDark.addEventListener) systemDark.addEventListener('change', render);

  // ---------------------------------------------------------------- demo panel
  function panelHtml() {
    const opt = (demo, cur, list) => '<div class="opts">' + list.map(([v, l]) => '<button type="button" data-demo="' + demo + '" data-id="' + v + '" data-fk="d-' + demo + '-' + v + '" aria-pressed="' + (String(cur) === String(v)) + '">' + l + '</button>').join('') + '</div>';
    const e = eff(byId('center'));
    const cs = S.center.state;
    const beat = S.center.state === 'sensorOff' ? 'Sensor offline' : S.conn !== 'online' ? 'No connection' : 'Last heartbeat ' + Math.floor(S.age) + ' s ago' + (S.frozen ? ' (frozen)' : '');
    const th = theme();
    const v = copy(byId('center'));
    const wBg = th === 'dark' ? '#1B1F25' : '#C9D1DA';
    const w22 = '<div class="widget w22" data-s="' + v.state + '"><div style="display:flex;justify-content:space-between;gap:8px"><span style="font-size:13px;font-weight:600">Center St</span>' + cardIcon(v.state, 28) + '</div><div style="flex:1"></div>' +
      '<span style="font-size:26px;line-height:1.1;font-weight:700">' + v.word + '</span><span style="font-size:14px;font-weight:600">' + live('w-line', v.dur || v.line) + '</span><span style="font-size:12px;color:var(--c-dim)">' + live('w-fresh', v.state === 'unknown' ? "Don't assume it's clear" : 'Updated ' + fmt(simNow - (e.age || 0))) + '</span>' + (v.state === 'stopped' ? '<span class="stripe" style="position:absolute;left:0;right:0;bottom:0;height:6px;background:repeating-linear-gradient(-45deg,rgba(255,255,255,.12) 0 5px,transparent 5px 10px)"></span>' : '') + '</div>';
    const w41 = '<div class="widget w41" data-s="' + v.state + '">' + cardIcon(v.state, 32) + '<span class="stack" style="flex:1;min-width:0;gap:2px"><span style="font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Center St · ' + v.word + '</span><span style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + live('w-wide', (v.dur || v.line) + ' · ' + (v.state === 'unknown' ? "don't assume clear" : 'updated ' + fmt(simNow - (e.age || 0)))) + '</span></span></div>';
    return '<h1>MavRadar · clickable mockup</h1>' +
      '<p class="intro">Everything inside the phone is the app, built from design handoff v2 (Checkpoints 1 to 3). These controls stand in for the sensor and the phone. Times are simulated from 2:48 PM. The map is schematic. Specs: <code>docs/design/SPECS.md</code>. Tokens: <code>docs/design/tokens.json</code>.</p>' +
      '<section aria-label="Center St sensor"><h2>Center St sensor</h2>' +
      '<label class="ctl">Reported state' + opt('centerState', cs, [['clear', 'Clear'], ['approaching', 'Approaching'], ['blocked', 'Blocked'], ['stopped', 'Stopped'], ['sensorOff', 'Sensor offline']]) + '</label>' +
      '<div class="opts"><button type="button" class="act primary" data-demo="playTrain" data-fk="d-playTrain">' + (S.scenario ? 'Train running…' : 'Play a train') + '</button><button type="button" class="act" data-demo="freeze" data-fk="d-freeze">' + (S.frozen ? 'Resume heartbeat' : 'Freeze heartbeat') + '</button></div>' +
      '<p class="note">' + live('beat', beat) + '. Freeze the heartbeat to watch Live turn Delayed at 30 s and Unknown at 90 s. Play a train runs approaching, blocked, stopped, cleared at 20x speed. Follow Center St and allow notifications first to see the alerts.</p>' +
      '<label class="ctl">Clock speed' + opt('speed', S.speed, [[1, '1x'], [10, '10x'], [20, '20x'], [30, '30x']]) + '</label></section>' +
      '<section aria-label="Phone"><h2>Phone</h2>' +
      '<label class="ctl">Connection' + opt('conn', S.conn, [['online', 'Online'], ['phone', 'Phone offline'], ['server', 'Server down']]) + '</label>' +
      '<label class="ctl">Theme' + opt('appearance', S.appearance, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]) + '</label>' +
      '<label class="ctl">Text size' + opt('k', S.k, [[1, '100%'], [2, '200%']]) + '</label>' +
      '<label class="ctl">Notification permission' + opt('perm', S.permission, [['unasked', 'Not asked'], ['granted', 'Allowed'], ['denied', 'Denied']]) + '</label>' +
      '<div class="opts"><button type="button" class="act" data-demo="lock" data-fk="d-lock">Lock phone</button><button type="button" class="act" data-demo="shade" data-fk="d-shade">Open shade</button></div>' +
      '<p class="note">Tap the phone\'s status bar to open the shade. Esc works like the back gesture.</p></section>' +
      '<section aria-label="App data"><h2>App data</h2>' +
      '<label class="ctl">Crossings' + opt('dataset', S.dataset, [['one', '1 crossing (launch)'], ['many', '12 mock crossings']]) + '</label>' +
      '<div class="opts"><button type="button" data-demo="mapFails" data-fk="d-mapFails" aria-pressed="' + S.mapFails + '">Map fails to load</button><button type="button" data-demo="historyEmpty" data-fk="d-historyEmpty" aria-pressed="' + S.historyEmpty + '">Empty history</button><button type="button" data-demo="tip" data-fk="d-tip" aria-pressed="' + S.tip + '">Second-visit tip</button></div>' +
      '<div class="opts"><button type="button" class="act" data-demo="onboarding" data-fk="d-onboarding">Replay onboarding</button><button type="button" class="act" data-demo="reset" data-fk="d-reset">Reset everything</button></div></section>' +
      '<section aria-label="Widgets"><h2>Home screen widgets (designed, not in v1)</h2><div class="widgets" data-theme="' + th + '" style="background:' + wBg + '">' + w22 + w41 + '</div><p class="note">Widgets follow the same stale rule: no fresh data means Unknown.</p></section>' +
      '<p class="note">Travel information only. Always obey crossing signals and gates. This page is a design mockup, not the app.</p>';
  }

  // ---------------------------------------------------------------- loop
  function fit() {
    const avail = Math.min(window.innerHeight - 48, (window.innerWidth - 32));
    const s = Math.min(1, avail / 939, (window.innerWidth - 32) / 436);
    document.documentElement.style.setProperty('--scale', Math.max(0.5, s).toFixed(3));
  }
  window.addEventListener('resize', fit);
  fit();
  let lastT = performance.now();
  setInterval(() => {
    const t = performance.now();
    const ds = ((t - lastT) / 1000) * S.speed;
    lastT = t;
    simNow += ds;
    const beating = !S.frozen && S.center.state !== 'sensorOff' && S.conn === 'online';
    S.age += ds;
    if (beating && S.age >= HEARTBEAT) S.age = S.age % HEARTBEAT;
    S.ageOthers = (S.ageOthers + ds) % HEARTBEAT;
    if (S.scenario) {
      const sc = S.scenario;
      while (sc.i < sc.steps.length && simNow - sc.t0 >= sc.steps[sc.i][0]) { setCenter(sc.steps[sc.i][1], true); sc.i += 1; }
      if (sc.i >= sc.steps.length) { S.speed = sc.prevSpeed; S.scenario = null; }
    }
    evaluate();
    render();
  }, 250);
  S.prevState = eff(byId('center')).state;
  render();
})();
