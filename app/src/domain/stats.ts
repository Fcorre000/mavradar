import { startOfDay } from './time';
import type { BlockageEvent } from './types';

const DAY = 86_400_000;

/** Fewest finished blockages before a typical time is stated anywhere in the app. */
export const TYPICAL_MIN_SAMPLES = 5;

export function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const typical = (durations: number[]) =>
  durations.length < TYPICAL_MIN_SAMPLES ? null : Math.max(1, Math.round(median([...durations].sort((a, b) => a - b))));

export interface BlockageStats {
  days: number;
  count: number;
  /** Median duration of every blockage in the window, whole minutes. Null with too little history. */
  typicalMin: number | null;
  /** Median of stopped-train blockages only. Null with too little history. */
  typicalStoppedMin: number | null;
  longest: BlockageEvent | null;
  /** Average blockages in each hour of the day, midnight first. 24 values. */
  hours: number[];
  /** Blockages per calendar day, oldest first, ending today. One value per day. */
  perDay: number[];
  /** The window's blockages, newest first. */
  events: BlockageEvent[];
}

/**
 * The one place blockage statistics are computed, so Status, the crossing sheet and History always
 * agree. The window covers `days` calendar days, today included: it starts at local midnight
 * `days - 1` days ago. A live source's server-side summary must use the same definitions.
 */
export function blockageStats(events: BlockageEvent[], crossingId: string, now: number, days: number): BlockageStats {
  const today = startOfDay(now);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  const from = start.getTime();
  const mine = events.filter((ev) => ev.crossingId === crossingId && ev.start >= from && ev.start <= now).sort((a, b) => b.start - a.start);

  const hours = Array<number>(24).fill(0);
  const perDay = Array<number>(days).fill(0);
  let longest: BlockageEvent | null = null;
  for (const ev of mine) {
    hours[new Date(ev.start).getHours()] += 1;
    // Rounded, not floored: a day that crosses a daylight-saving change is 23 or 25 hours long.
    perDay[days - 1 - Math.round((today - startOfDay(ev.start)) / DAY)] += 1;
    if (!longest || ev.durationMin > longest.durationMin) longest = ev;
  }

  return {
    days,
    count: mine.length,
    typicalMin: typical(mine.map((ev) => ev.durationMin)),
    typicalStoppedMin: typical(mine.filter((ev) => ev.stopped).map((ev) => ev.durationMin)),
    longest,
    hours: hours.map((n) => n / days),
    perDay,
    events: mine,
  };
}
