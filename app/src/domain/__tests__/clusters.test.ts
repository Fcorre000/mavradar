/// <reference types="jest" />
import { clusterCrossings, regionFor, worstState } from '../clusters';
import { CENTER_ST, DEMO_CROSSINGS } from '../crossings';

describe('clusterCrossings', () => {
  it('shows every crossing on its own when zoomed in', () => {
    const items = clusterCrossings(DEMO_CROSSINGS, { latitude: 32.737, longitude: -97.107, latitudeDelta: 0.002, longitudeDelta: 0.002 });
    expect(items).toHaveLength(DEMO_CROSSINGS.length);
    expect(items.every((i) => i.kind === 'crossing')).toBe(true);
  });

  it('merges crossings whose markers would overlap, without losing any', () => {
    const items = clusterCrossings(DEMO_CROSSINGS, regionFor(DEMO_CROSSINGS));
    const total = items.reduce((n, i) => n + (i.kind === 'cluster' ? i.crossings.length : 1), 0);
    expect(total).toBe(DEMO_CROSSINGS.length);
    expect(items.some((i) => i.kind === 'cluster')).toBe(true);
  });

  it('never clusters a single crossing', () => {
    expect(clusterCrossings([CENTER_ST], { latitude: 32.7, longitude: -97.1, latitudeDelta: 1, longitudeDelta: 1 })[0].kind).toBe('crossing');
  });
});

describe('worstState', () => {
  it('ranks Stopped above Blocked and ignores calm states', () => {
    expect(worstState(['clear', 'blocked', 'stopped'])).toBe('stopped');
    expect(worstState(['clear', 'blocked'])).toBe('blocked');
    expect(worstState(['clear', 'approaching', 'unknown'])).toBeNull();
  });
});
