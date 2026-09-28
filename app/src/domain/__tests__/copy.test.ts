/// <reference types="jest" />
import { statusCopy } from '../copy';
import { CENTER_ST } from '../crossings';
import type { Effective } from '../freshness';
import { formatDuration } from '../time';

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
