/// <reference types="jest" />
import { shareText, statusCopy, typicalCopy } from '../copy';
import { CENTER_ST } from '../crossings';
import type { Effective } from '../freshness';
import { TYPICAL_MIN_SAMPLES } from '../stats';
import { formatDuration } from '../time';
import type { BlockageEvent } from '../types';

const NOW = new Date(2026, 8, 28, 14, 48, 0).getTime();
const MIN = 60_000;
const base: Effective = {
  state: 'clear',
  freshness: 'live',
  cause: null,
  ageSec: 8,
  lastAt: NOW - 8000,
  since: null,
  stoppedAt: null,
  detectedAt: null,
  clearSince: NOW - 30 * MIN,
};

describe('statusCopy', () => {
  it('counts blockage duration up, never down', () => {
    const c = statusCopy(CENTER_ST, { ...base, state: 'blocked', since: NOW - 7 * MIN }, NOW, false);
    expect(c.duration).toBe('Blocked for 7 min');
    expect(c.since).toBe('since 2:41 PM');
  });

  it('says "just now" in the first minute', () => {
    expect(statusCopy(CENTER_ST, { ...base, state: 'blocked', since: NOW - 20_000 }, NOW, false).duration).toBe('Blocked just now');
  });

  it('never shows a last state word when unknown, and always warns', () => {
    const c = statusCopy(CENTER_ST, { ...base, state: 'unknown', freshness: 'unknown', cause: 'sensor', lastAt: NOW - 34 * MIN }, NOW, false);
    expect(c.word).toBe('Unknown');
    expect(c.line).toBe('Last reading 2:14 PM');
    expect(c.explanation).toContain("Don't assume the crossing is clear.");
    expect(c.fresh).toBe('No data for 34 min');
  });

  it('shows the Delayed freshness line', () => {
    expect(statusCopy(CENTER_ST, { ...base, freshness: 'delayed', ageSec: 45 }, NOW, false).fresh).toBe('Updated 45 s ago · checking');
  });

  it('offers Retry only when the server is unreachable', () => {
    const server = statusCopy(CENTER_ST, { ...base, state: 'unknown', freshness: 'unknown', cause: 'server', lastAt: NOW - 2 * MIN }, NOW, false);
    const phone = statusCopy(CENTER_ST, { ...base, state: 'unknown', freshness: 'unknown', cause: 'phone', lastAt: NOW - 2 * MIN }, NOW, false);
    expect(server.retry).toBe(true);
    expect(phone.retry).toBe(false);
    expect(phone.kicker).toBe("You're offline");
  });

  it('formats long durations in hours and minutes', () => {
    expect(formatDuration(72)).toBe('1 h 12 min');
  });
});

// Finished blockages ending a few hours before NOW.
const ev = (durationMin: number, stopped = false, ageMs = 3 * 3_600_000, crossingId = CENTER_ST.id): BlockageEvent => ({
  id: `${crossingId}-${durationMin}-${stopped}-${ageMs}`,
  crossingId,
  start: NOW - ageMs,
  durationMin,
  stopped,
});
const moving = [3, 4, 5, 5, 6, 8].map((d) => ev(d)); // median 5
const stoppedRuns = [12, 20, 25, 30, 40].map((d) => ev(d, true)); // median 25

describe('typicalCopy', () => {
  const blocked = (m: number): Effective => ({ ...base, state: 'blocked', since: NOW - m * MIN });

  it('shows the typical time while the blockage is within it', () => {
    expect(typicalCopy(blocked(3), moving, CENTER_ST.id, NOW)).toMatchObject({ lead: 'Usually about 5 min', rest: 'here' });
    expect(typicalCopy(blocked(5), moving, CENTER_ST.id, NOW)?.lead).toBe('Usually about 5 min');
  });

  it('says "longer than usual" once past it, never counting down', () => {
    expect(typicalCopy(blocked(7), moving, CENTER_ST.id, NOW)).toMatchObject({ lead: 'Longer than usual.', rest: 'Typical: 5 min' });
  });

  it('compares stopped trains with stopped trains only', () => {
    const e: Effective = { ...base, state: 'stopped', since: NOW - 12 * MIN };
    expect(typicalCopy(e, [...moving, ...stoppedRuns], CENTER_ST.id, NOW)).toMatchObject({ lead: 'Stopped trains here:', rest: 'about 25 min' });
    expect(typicalCopy(e, moving, CENTER_ST.id, NOW)).toBeNull();
  });

  it('uses every blockage for Blocked, the same typical time History shows', () => {
    // 11 blockages: six moving (median 5) and five stopped (12 to 40) give an overall median of 8.
    expect(typicalCopy(blocked(3), [...moving, ...stoppedRuns], CENTER_ST.id, NOW)).toMatchObject({ lead: 'Usually about 8 min' });
  });

  it('stays hidden with too little history', () => {
    expect(typicalCopy(blocked(3), moving.slice(0, TYPICAL_MIN_SAMPLES - 1), CENTER_ST.id, NOW)).toBeNull();
  });

  it('ignores other crossings and blockages older than 30 days', () => {
    const old = [3, 4, 5, 5, 6].map((d) => ev(d, false, 31 * 86_400_000));
    const elsewhere = [3, 4, 5, 5, 6].map((d) => ev(d, false, 3_600_000, '000000X'));
    expect(typicalCopy(blocked(3), [...old, ...elsewhere], CENTER_ST.id, NOW)).toBeNull();
  });

  it('only appears for Blocked and Stopped', () => {
    for (const state of ['clear', 'approaching', 'unknown'] as const) {
      expect(typicalCopy({ ...base, state }, moving, CENTER_ST.id, NOW)).toBeNull();
    }
  });
});

describe('shareText', () => {
  it('says how long, when, and the detour for a blockage', () => {
    const text = shareText(CENTER_ST, { ...base, state: 'stopped', since: NOW - 12 * MIN }, NOW);
    expect(text).toBe('Center St crossing (Arlington) is blocked by a stopped train. 12 min so far, as of 2:47 PM.\nDetour: West St underpass.\nvia MavRadar');
  });

  it('stamps a clear crossing with the time of the last reading', () => {
    expect(shareText(CENTER_ST, base, NOW)).toBe('Center St crossing (Arlington) is clear, as of 2:47 PM.\nvia MavRadar');
  });

  it('never repeats a last state when the status is unknown', () => {
    const text = shareText(CENTER_ST, { ...base, state: 'unknown', cause: 'sensor' }, NOW);
    expect(text).toContain("can't confirm");
    expect(text).not.toMatch(/blocked|clear,/i);
  });
});
