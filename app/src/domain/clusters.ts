import type { Crossing, CrossingState } from './types';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export type MapItem =
  | { kind: 'crossing'; crossing: Crossing }
  | { kind: 'cluster'; id: string; crossings: Crossing[]; latitude: number; longitude: number };

/** Markers closer than this on screen merge into a cluster (a 36 dp marker plus breathing room). */
export const CLUSTER_DISTANCE_PX = 56;

/**
 * Grid clustering by on-screen distance, enough for a few dozen crossings. Swap for supercluster
 * once the network grows. A cell is `CLUSTER_DISTANCE_PX` wide at the current zoom, so markers
 * that would overlap merge and markers that fit stay separate.
 */
export function clusterCrossings(crossings: Crossing[], region: MapRegion, viewport = { width: 400, height: 800 }): MapItem[] {
  if (crossings.length < 2) return crossings.map((crossing) => ({ kind: 'crossing', crossing }));
  const cellLat = (region.latitudeDelta * CLUSTER_DISTANCE_PX) / viewport.height;
  const cellLng = (region.longitudeDelta * CLUSTER_DISTANCE_PX) / viewport.width;
  const cells = new Map<string, Crossing[]>();
  for (const c of crossings) {
    const key = `${Math.floor(c.latitude / cellLat)}:${Math.floor(c.longitude / cellLng)}`;
    cells.set(key, [...(cells.get(key) ?? []), c]);
  }
  return [...cells.entries()].map(([key, members]) =>
    members.length === 1
      ? { kind: 'crossing', crossing: members[0] }
      : {
          kind: 'cluster',
          id: key,
          crossings: members,
          latitude: members.reduce((sum, c) => sum + c.latitude, 0) / members.length,
          longitude: members.reduce((sum, c) => sum + c.longitude, 0) / members.length,
        },
  );
}

/** The most urgent state in a cluster, for its ring and badge. Only Blocked and Stopped count. */
export function worstState(states: CrossingState[]): 'blocked' | 'stopped' | null {
  if (states.includes('stopped')) return 'stopped';
  if (states.includes('blocked')) return 'blocked';
  return null;
}

/** Region that fits every crossing, with some margin. */
export function regionFor(crossings: Crossing[], minDelta = 0.008): MapRegion {
  const lats = crossings.map((c) => c.latitude);
  const lngs = crossings.map((c) => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.6, minDelta),
    longitudeDelta: Math.max((maxLng - minLng) * 1.3, minDelta),
  };
}
