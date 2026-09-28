const MINUTE = 60_000;

/** 12-hour time with AM/PM, e.g. "2:48 PM". */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Clock without AM/PM, for a status bar style display. */
export function formatClock(ms: number): string {
  return formatTime(ms).replace(/ (AM|PM)$/, '');
}

/** Durations count up: "7 min", "1 h 12 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** Relative freshness: "8 s ago", "1 min ago". */
export function formatAgo(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))} s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

/** Whole minutes from `from` to `to`, never negative. */
export function minutesBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / MINUTE));
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Minutes since local midnight. */
export function minuteOfDay(ms: number): number {
  return (ms - startOfDay(ms)) / MINUTE;
}
