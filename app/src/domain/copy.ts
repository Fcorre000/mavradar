import type { Effective } from './freshness';
import { formatAgo, formatDuration, formatTime, minutesBetween } from './time';
import type { Crossing, CrossingState } from './types';

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
