import { DemoEngine } from '@/data/demo-engine';

describe('DemoEngine getHistory', () => {
  test('handles a crossing with no recorded blockages', () => {
    const engine = new DemoEngine();

    const stats = engine.getHistory(
      '794984F',
      Date.now(),
      7
    );

    expect(stats.count).toBe(0);
    expect(stats.events).toEqual([]);
    expect(stats.typicalMin).toBeNull();
    expect(stats.longest).toBeNull();
    expect(stats.hours).toHaveLength(24);
    expect(stats.hours.every((hour) => hour === 0)).toBe(true);
  });
});