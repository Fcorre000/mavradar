import type { Crossing } from './types';

/**
 * Crossing locations are public, from the FRA crossing inventory (data.transportation.gov,
 * dataset m2f8-22s6). They are road and rail intersections, never a sensor node's mounting spot.
 */

/** The launch crossing. USDOT 794978C, Union Pacific, 2 main tracks. */
export const CENTER_ST: Crossing = {
  id: '794978C',
  name: 'Center St',
  city: 'Arlington',
  latitude: 32.737244,
  longitude: -97.107045,
};

/** The detour. West St crosses the same line (USDOT 794979J). */
export const DETOUR = {
  name: 'West St underpass',
  latitude: 32.7374069,
  longitude: -97.110673,
} as const;

/**
 * Real public crossings on the same Union Pacific line through Arlington. Only the demo's
 * "12 crossings" mode shows them, with simulated states, to exercise the map and list.
 */
export const DEMO_CROSSINGS: Crossing[] = [
  { id: '794984F', name: 'Bowen Rd', city: 'Arlington', latitude: 32.734104, longitude: -97.149134 },
  { id: '794983Y', name: 'Fielder Rd', city: 'Arlington', latitude: 32.7361891, longitude: -97.1315838 },
  { id: '794981K', name: 'Davis Dr', city: 'Arlington', latitude: 32.737869, longitude: -97.123204 },
  { id: '794980D', name: 'Cooper St', city: 'Arlington', latitude: 32.737538, longitude: -97.114419 },
  CENTER_ST,
  { id: '794977V', name: 'Mesquite St', city: 'Arlington', latitude: 32.737206, longitude: -97.10577 },
  { id: '794976N', name: 'East St', city: 'Arlington', latitude: 32.7371527, longitude: -97.103424 },
  { id: '794975G', name: 'Collins St', city: 'Arlington', latitude: 32.736938, longitude: -97.097334 },
  { id: '794974A', name: 'Stadium Dr', city: 'Arlington', latitude: 32.7390765, longitude: -97.083984 },
  { id: '794973T', name: 'Division St', city: 'Arlington', latitude: 32.7418562, longitude: -97.0822992 },
  { id: '849006P', name: 'Six Flags Dr', city: 'Arlington', latitude: 32.7466822, longitude: -97.0687569 },
  { id: '794971E', name: 'Great Southwest Pkwy', city: 'Arlington', latitude: 32.7392269, longitude: -97.0459479 },
];

export function crossingById(id: string): Crossing {
  return DEMO_CROSSINGS.find((c) => c.id === id) ?? CENTER_ST;
}
