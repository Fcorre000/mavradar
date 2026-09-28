import type { CrossingState } from '@/constants/theme';

export type { CrossingState };

/** What a sensor node reports. `sensorOffline` means the node told us it is down or unhealthy. */
export type ReportedState = 'clear' | 'approaching' | 'blocked' | 'stopped' | 'sensorOffline';

/** How this phone is talking to MavRadar. `phone` = no network, `server` = network but no MavRadar. */
export type Connection = 'online' | 'phone' | 'server';

export type UnknownCause = 'sensor' | 'phone' | 'server';

export interface Crossing {
  /** App-wide ID. Equal to the USDOT crossing ID, which keys crossings/{usdotId} in Firestore. */
  id: string;
  name: string;
  city: string;
  /** Public crossing location from the FRA crossing inventory. Never a sensor node's location. */
  latitude: number;
  longitude: number;
}

/**
 * One crossing's latest report. Mirrors the planned crossings/{usdotId} document the server
 * writes (Amendment 003, 4.3). All times are epoch milliseconds.
 */
export interface CrossingReading {
  crossingId: string;
  state: ReportedState;
  /** Start of the current blockage (blocked or stopped). */
  since: number | null;
  stoppedAt: number | null;
  /** When an approaching train was detected. */
  detectedAt: number | null;
  clearSince: number | null;
  /** Last heartbeat from the node. Drives the Live, Delayed and Unknown freshness rule. */
  lastReadingAt: number;
  sensorName: string;
  sensorBatteryOk: boolean;
}

/** A finished blockage (crossings/{usdotId}/events/{eventId}). */
export interface BlockageEvent {
  id: string;
  crossingId: string;
  start: number;
  durationMin: number;
  stopped: boolean;
}

export interface SourceSnapshot {
  now: number;
  connection: Connection;
  /** Last successful sync with MavRadar. Shown when the phone or server is offline. */
  lastSyncAt: number;
  readings: Record<string, CrossingReading>;
  /** Finished blockages, oldest first. */
  events: BlockageEvent[];
}
