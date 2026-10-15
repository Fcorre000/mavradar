/// <reference types="jest" />
import { blockageStats, median, TYPICAL_MIN_SAMPLES } from '../stats';
import type { BlockageEvent } from '../types';

const NOW = new Date(2026, 9, 15, 14, 0, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ev = (agoMs: number, durationMin: number, stopped = false, crossingId = 'A'): BlockageEvent => ({
  id: `${crossingId}-${agoMs}-${durationMin}`,
  crossingId,
  start: NOW - agoMs,
  durationMin,
  stopped,
});

describe('median', () => {
  it('takes the middle value, or the mean of the two middle values', () => {
    expect(median([1, 3, 9])).toBe(3);
    expect(median([2, 4, 6, 8])).toBe(5);
  });
});

describe('blockageStats', () => {
  const events = [ev(HOUR, 4), ev(2 * HOUR, 6), ev(DAY + HOUR, 3), ev(2 * DAY, 20, true), ev(3 * DAY, 5), ev(40 * DAY, 99), ev(HOUR, 7, false, 'B')];

  it('counts only this crossing inside the window', () => {
    const s = blockageStats(events, 'A', NOW, 7);
    expect(s.count).toBe(5);
    expect(s.events.map((e) => e.durationMin)).toEqual([4, 6, 3, 20, 5]); // newest first
  });

  it('gives the median of every blockage, and of stopped ones separately', () => {
    const s = blockageStats(events, 'A', NOW, 7);
    expect(s.typicalMin).toBe(5);
    expect(s.typicalStoppedMin).toBeNull(); // one stopped train is not enough to call typical
  });

  it('hides the typical time with fewer than the minimum samples', () => {
    expect(blockageStats(events.slice(0, TYPICAL_MIN_SAMPLES - 1), 'A', NOW, 7).typicalMin).toBeNull();
  });

  it('finds the longest blockage and counts per calendar day, oldest first', () => {
    const s = blockageStats(events, 'A', NOW, 7);
    expect(s.longest?.durationMin).toBe(20);
    expect(s.perDay).toHaveLength(7);
    expect(s.perDay[6]).toBe(2); // today
    expect(s.perDay.reduce((a, b) => a + b, 0)).toBe(5);
  });

  it('averages blockages per hour of day over the window', () => {
    const s = blockageStats([ev(HOUR, 4), ev(DAY + HOUR, 4)], 'A', NOW, 7);
    expect(s.hours[13]).toBeCloseTo(2 / 7);
    expect(s.hours).toHaveLength(24);
  });
});
