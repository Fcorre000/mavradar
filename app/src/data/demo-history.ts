/**
 * Longer-range history for the demo. The engine only simulates today and yesterday, so the 7 and
 * 30 day summaries use fixed numbers consistent with about 19 blockages a day at Center St.
 * A live source will compute these from crossings/{usdotId}/events.
 */
interface RangeStats {
  count: number;
  typicalMin: number;
  longestMin: number;
  longestStopped: boolean;
  /** Average blockages in each hour of the day, midnight first. */
  hours: number[];
}

export const DEMO_HISTORY: Record<7 | 30, RangeStats> = {
  7: {
    count: 126,
    typicalMin: 4,
    longestMin: 21,
    longestStopped: true,
    hours: [0.6, 0.5, 0.7, 0.8, 0.6, 0.7, 0.9, 1.0, 0.9, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.2, 1.0, 0.9, 0.8, 0.7, 0.6, 0.6, 0.5],
  },
  30: {
    count: 571,
    typicalMin: 4,
    longestMin: 38,
    longestStopped: true,
    hours: [0.7, 0.6, 0.7, 0.7, 0.6, 0.8, 0.9, 0.9, 0.9, 0.8, 0.9, 1.0, 1.0, 1.1, 1.3, 1.4, 1.3, 1.1, 0.9, 0.8, 0.8, 0.7, 0.6, 0.6],
  },
};
