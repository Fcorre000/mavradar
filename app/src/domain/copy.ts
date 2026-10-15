import { DETOUR } from './crossings';
import type { Effective } from './freshness';
import { formatAgo, formatDuration, formatTime, minutesBetween } from './time';
import type { BlockageEvent, Crossing, CrossingState } from './types';

export const STATE_WORD: Record<CrossingState, string> = {
  clear: 'Clear',
  approaching: 'Approaching',
  blocked: 'Blocked',
  stopped: 'Stopped',
  unknown: 'Unknown',
};

export const DISCLAIMER = 'Travel information only. Always obey crossing signals and gates.';

export interface StatusCopy {
  word: string;
  kicker: string;
  /** Blocked and Stopped: "Blocked for 7 min". Absent for other states. */
  duration?: string;
  /** Goes with `duration`: "since 2:41 PM". */
  since?: string;
  /** Other states: "Clear since 2:18 PM", "Last reading 2:14 PM". */
  line?: string;
  /** Freshness line inside the card. */
  fresh: string;
  explanation: string;
  sensor: string;
  /** One line for the map sheet: "Blocked for 7 min · updated 8 s ago". */
  meta: string;
  /** Text after the bold state word in a list row. */
  listDetail: string;
  /** Full sentence for screen readers. */
  a11y: string;
  /** Server unreachable: show a Retry action. */
  retry: boolean;
}

const blockedText = (m: number) => (m < 1 ? 'Blocked just now' : `Blocked for ${formatDuration(m)}`);

/** Every user-facing string for a crossing's current state. Wording follows docs/design/SPECS.md. */
export function statusCopy(crossing: Crossing, e: Effective, now: number, following: boolean): StatusCopy {
  const ago = formatAgo(e.ageSec);
  const fresh = e.freshness === 'delayed' ? `Updated ${ago} · checking` : `Live · updated ${ago}`;
  const updatedSpoken = ` Updated ${Math.floor(e.ageSec)} seconds ago.`;
  const tail = following ? ' Following.' : '';
  const base = { word: STATE_WORD[e.state], fresh, sensor: 'Online', retry: false };
  const intro = `${crossing.name} crossing, ${crossing.city}.`;

  switch (e.state) {
    case 'clear': {
      const at = e.clearSince ? formatTime(e.clearSince) : formatTime(now);
      return {
        ...base,
        kicker: 'No train detected',
        line: `Clear since ${at}`,
        explanation: 'No train on the crossing. The sensor is reporting normally.',
        meta: `Clear since ${at} · updated ${ago}`,
        listDetail: ` · updated ${ago}`,
        a11y: `${intro} Clear since ${at}.${updatedSpoken}${tail}`,
      };
    }
    case 'approaching': {
      const at = formatTime(e.detectedAt ?? now);
      return {
        ...base,
        kicker: 'Train detected nearby',
        line: `Detected at ${at}`,
        explanation: 'A train is near the crossing. Gates may come down soon.',
        meta: `Train nearby · updated ${ago}`,
        listDetail: ` · train nearby · updated ${ago}`,
        a11y: `${intro} Train approaching.${updatedSpoken}${tail}`,
      };
    }
    case 'blocked': {
      const m = minutesBetween(e.since ?? now, now);
      return {
        ...base,
        kicker: 'Train on crossing',
        duration: blockedText(m),
        since: `since ${formatTime(e.since ?? now)}`,
        explanation: 'A moving train is on the crossing.',
        meta: `${blockedText(m)} · updated ${ago}`,
        listDetail: `${m < 1 ? ' just now' : ` for ${formatDuration(m)}`} · updated ${ago}`,
        a11y: `${intro} ${m < 1 ? 'Blocked just now.' : `Blocked for ${m} minutes.`}${updatedSpoken}${tail}`,
      };
    }
    case 'stopped': {
      const m = minutesBetween(e.since ?? now, now);
      return {
        ...base,
        kicker: 'Train not moving',
        duration: blockedText(m),
        since: `since ${formatTime(e.since ?? now)} · stopped at ${formatTime(e.stoppedAt ?? now)}`,
        explanation: 'A train is stopped across the road. This can take a while.',
        meta: `Stopped · ${blockedText(m).toLowerCase()} · updated ${ago}`,
        listDetail: ` · ${blockedText(m).toLowerCase()} · updated ${ago}`,
        a11y: `${intro} Stopped. Blocked for ${m} minutes.${updatedSpoken}${tail}`,
      };
    }
    default: {
      const last = e.lastAt ? formatTime(e.lastAt) : null;
      const dontAssume = "Don't assume the crossing is clear.";
      if (e.cause === 'phone') {
        return {
          ...base,
          kicker: "You're offline",
          line: 'Reconnect to see live status.',
          fresh: last ? `Last synced ${last}` : 'Not synced yet',
          explanation: `Your phone has no connection, so this can't be current. ${dontAssume}`,
          sensor: 'Unknown while offline',
          meta: `You're offline${last ? ` · last synced ${last}` : ''}`,
          listDetail: " · you're offline",
          a11y: `${intro} Status unknown. You're offline. ${dontAssume}${tail}`,
        };
      }
      if (e.cause === 'server') {
        return {
          ...base,
          kicker: "Can't reach MavRadar",
          line: "We can't reach MavRadar right now.",
          fresh: last ? `Last update ${last}` : 'No update yet',
          explanation: `The sensor may still be working, but we can't get its data. ${dontAssume}`,
          sensor: 'Unknown',
          meta: `Can't reach MavRadar${last ? ` · last update ${last}` : ''}`,
          listDetail: ' · no connection to MavRadar',
          a11y: `${intro} Status unknown. We can't reach MavRadar. ${dontAssume}${tail}`,
          retry: true,
        };
      }
      const gone = Math.max(1, minutesBetween(e.lastAt, now));
      return {
        ...base,
        kicker: 'Sensor offline',
        line: last ? `Last reading ${last}` : 'No sensor data yet',
        fresh: last ? `No data for ${formatDuration(gone)}` : 'No data',
        explanation: last ? `No sensor data since ${last}. ${dontAssume}` : `No sensor data yet. ${dontAssume}`,
        sensor: last ? `Offline since ${last}` : 'Offline',
        meta: last ? `No data since ${last}` : 'No sensor data',
        listDetail: last ? ` · no data since ${last}` : ' · no sensor data',
        a11y: `${intro} Status unknown. ${last ? `No sensor data since ${last}.` : 'No sensor data.'} ${dontAssume}${tail}`,
      };
    }
  }
}

// ---------------------------------------------------------------- typical duration

/** Fewest past blockages of the same kind before a typical time is shown. Below this the line stays hidden. */
export const TYPICAL_MIN_SAMPLES = 5;
const TYPICAL_WINDOW_MS = 30 * 86_400_000;

export interface TypicalCopy {
  /** Bold part: "Usually about 5 min", "Longer than usual." */
  lead: string;
  rest: string;
  a11y: string;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How long blockages at this crossing usually last, from its finished blockages in the last 30 days.
 * Moving trains are compared with moving trains and stopped with stopped. It reports the past and
 * never predicts when this one will clear. Null outside Blocked and Stopped, or with too little history.
 */
export function typicalCopy(e: Effective, events: BlockageEvent[], crossingId: string, now: number): TypicalCopy | null {
  if (e.state !== 'blocked' && e.state !== 'stopped') return null;
  const stopped = e.state === 'stopped';
  const durations = events
    .filter((ev) => ev.crossingId === crossingId && ev.stopped === stopped && ev.start >= now - TYPICAL_WINDOW_MS)
    .map((ev) => ev.durationMin)
    .sort((a, b) => a - b);
  if (durations.length < TYPICAL_MIN_SAMPLES) return null;
  const typicalMin = Math.max(1, Math.round(median(durations)));
  const typical = formatDuration(typicalMin);
  const kind = stopped ? 'Stopped trains' : 'Blockages';
  if (minutesBetween(e.since ?? now, now) > typicalMin) {
    return { lead: 'Longer than usual.', rest: `Typical: ${typical}`, a11y: `Longer than usual. ${kind} here typically last ${typical}.` };
  }
  return stopped
    ? { lead: 'Stopped trains here:', rest: `about ${typical}`, a11y: `Stopped trains here usually last about ${typical}.` }
    : { lead: `Usually about ${typical}`, rest: 'here', a11y: `Blockages here usually last about ${typical}.` };
}

// ---------------------------------------------------------------- sharing

/**
 * Plain text for the share sheet, readable in any chat app. Stamped with the time of the last
 * reading, because a shared message gets read later. Unknown never repeats the last state.
 */
export function shareText(crossing: Crossing, e: Effective, now: number): string {
  const name = `${crossing.name} crossing (${crossing.city})`;
  const at = formatTime(e.lastAt || now);
  const sign = 'via MavRadar';
  const detour = `Detour: ${DETOUR.name}.`;
  const sofar = (m: number) => `${m < 1 ? 'Under a minute' : formatDuration(m)} so far, as of ${at}.`;
  switch (e.state) {
    case 'blocked':
      return `${name} is blocked by a train. ${sofar(minutesBetween(e.since ?? now, now))}\n${detour}\n${sign}`;
    case 'stopped':
      return `${name} is blocked by a stopped train. ${sofar(minutesBetween(e.since ?? now, now))}\n${detour}\n${sign}`;
    case 'approaching':
      return `A train is approaching ${name}, as of ${at}.\n${detour}\n${sign}`;
    case 'clear':
      return `${name} is clear, as of ${at}.\n${sign}`;
    default:
      return `MavRadar can't confirm ${name} right now. Don't assume it's clear.\n${sign}`;
  }
}
