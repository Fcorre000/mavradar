import { CENTER_ST, DEMO_CROSSINGS } from '@/domain/crossings';
import { minutesBetween, startOfDay } from '@/domain/time';
import type { BlockageEvent, Connection, CrossingReading, ReportedState, SourceSnapshot } from '@/domain/types';

import type { CrossingSource } from './source';

const MIN = 60_000;
/** Seconds between sensor heartbeats in the demo. Real nodes set their own interval. */
const HEARTBEAT_MS = 8_000;
const TICK_MS = 250;

/** Simulated states for the other demo crossings, relative to when the demo starts (minutes). */
const SEEDS: Record<string, { state: ReportedState; since?: number; stoppedAt?: number; detectedAt?: number; clearSince?: number; lastReadingAt?: number }> = {
  '794984F': { state: 'clear', clearSince: -55 },
  '794983Y': { state: 'clear', clearSince: -41 },
  '794981K': { state: 'approaching', detectedAt: -1 },
  '794980D': { state: 'clear', clearSince: -18 },
  '794977V': { state: 'clear', clearSince: -26 },
  '794976N': { state: 'clear', clearSince: -33 },
  '794975G': { state: 'clear', clearSince: -64 },
  '794974A': { state: 'stopped', since: -12, stoppedAt: -7 },
  '794973T': { state: 'blocked', since: -6 },
  '849006P': { state: 'sensorOffline', lastReadingAt: -34 },
  '794971E': { state: 'clear', clearSince: -90 },
};

// Center St's blockages earlier today: [minute of day, duration in minutes, stopped].
const TODAY: [number, number, boolean][] = [
  [47, 4, false], [135, 3, false], [238, 6, true], [320, 4, false], [402, 5, false], [475, 3, false],
  [550, 7, true], [633, 4, false], [708, 5, false], [760, 8, false], [832, 9, false], [960, 6, false],
  [1080, 5, false], [1190, 11, true], [1290, 4, false], [1380, 3, false],
];
const YESTERDAY: [number, number, boolean][] = [[1247, 6, false], [1322, 21, true], [1406, 4, false]];

export interface DemoControls {
  centerState: ReportedState;
  frozen: boolean;
  speed: number;
  connection: Connection;
  scenarioRunning: boolean;
}

/**
 * Simulated crossing data for the demo. It keeps its own clock, which can run faster than real
 * time, sends heartbeats, and can play a whole train (approaching, blocked, stopped, cleared).
 */
export class DemoEngine implements CrossingSource {
  readonly kind = 'demo' as const;
  private listeners = new Set<(s: SourceSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private realAnchor = Date.now();
  private simAnchor = Date.now();
  private speed = 1;
  private readings: Record<string, CrossingReading> = {};
  private events: BlockageEvent[] = [];
  private connection: Connection = 'online';
  private lastSyncAt = Date.now();
  private frozen = false;
  private scenario: { t0: number; i: number; prevSpeed: number; steps: [number, ReportedState][] } | null = null;
  private lastEmitSecond = -1;
  private eventSeq = 0;

  constructor() {
    const now = this.now();
    const day = startOfDay(now);
    const addEvents = (list: [number, number, boolean][], dayStart: number) =>
      list.forEach(([m, d, stopped]) => {
        const start = dayStart + m * MIN;
        if (start + d * MIN < now) this.events.push({ id: `seed-${this.eventSeq++}`, crossingId: CENTER_ST.id, start, durationMin: d, stopped });
      });
    addEvents(YESTERDAY, day - 1440 * MIN);
    addEvents(TODAY, day);
    const last = this.events[this.events.length - 1];
    const clearSince = last ? Math.max(last.start + last.durationMin * MIN, now - 90 * MIN) : now - 30 * MIN;

    this.readings[CENTER_ST.id] = this.reading(CENTER_ST.id, 'clear', { clearSince });
    for (const c of DEMO_CROSSINGS) {
      if (c.id === CENTER_ST.id) continue;
      const s = SEEDS[c.id];
      const at = (m?: number) => (m === undefined ? null : now + m * MIN);
      this.readings[c.id] = this.reading(c.id, s.state, {
        since: at(s.since),
        stoppedAt: at(s.stoppedAt),
        detectedAt: at(s.detectedAt),
        clearSince: at(s.clearSince),
        lastReadingAt: at(s.lastReadingAt) ?? now - Math.random() * HEARTBEAT_MS,
      });
    }
  }

  now(): number {
    return this.simAnchor + (Date.now() - this.realAnchor) * this.speed;
  }

  controls(): DemoControls {
    return {
      centerState: this.readings[CENTER_ST.id].state,
      frozen: this.frozen,
      speed: this.speed,
      connection: this.connection,
      scenarioRunning: this.scenario !== null,
    };
  }

  snapshot(): SourceSnapshot {
    return {
      now: this.now(),
      connection: this.connection,
      lastSyncAt: this.lastSyncAt,
      readings: { ...this.readings },
      events: this.events.slice(),
    };
  }

  subscribe(listener: (s: SourceSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Demo control: what the Center St sensor reports. `live` means the change happens right now. */
  setCenterState(state: ReportedState, live = false) {
    const now = this.now();
    const r = { ...this.readings[CENTER_ST.id] };
    const prev = r.state;
    const wasBlocking = prev === 'blocked' || prev === 'stopped';
    if (wasBlocking && state !== 'blocked' && state !== 'stopped' && state !== 'sensorOffline' && r.since) {
      this.events.push({
        id: `demo-${this.eventSeq++}`,
        crossingId: CENTER_ST.id,
        start: r.since,
        durationMin: Math.max(1, minutesBetween(r.since, now)),
        stopped: prev === 'stopped' || r.stoppedAt !== null,
      });
    }
    if (state === 'clear') r.clearSince = live || wasBlocking ? now : now - 30 * MIN;
    if (state === 'approaching') r.detectedAt = live ? now : now - MIN;
    if (state === 'blocked') {
      r.since = wasBlocking && r.since ? r.since : live ? now : now - 7 * MIN;
      r.stoppedAt = null;
    }
    if (state === 'stopped') {
      r.since = wasBlocking && r.since ? r.since : live ? now : now - 12 * MIN;
      r.stoppedAt = prev === 'blocked' || live ? now : now - 7 * MIN;
    }
    if (state !== 'blocked' && state !== 'stopped') {
      if (state !== 'sensorOffline') r.stoppedAt = null;
    }
    r.state = state;
    r.lastReadingAt = state === 'sensorOffline' ? now - 34 * MIN : now;
    this.readings[CENTER_ST.id] = r;
    this.emit();
  }

  /** Demo control: runs approaching, blocked, stopped and cleared at 20x speed. */
  playTrain() {
    this.connection = 'online';
    this.frozen = false;
    if (this.readings[CENTER_ST.id].state !== 'clear') this.setCenterState('clear', true);
    this.scenario = {
      t0: this.now(),
      i: 0,
      prevSpeed: this.speed === 20 ? 1 : this.speed,
      steps: [[0, 'approaching'], [40, 'blocked'], [340, 'stopped'], [580, 'clear']],
    };
    this.setSpeed(20);
  }

  /** Demo control: stop heartbeats, so freshness goes Live, then Delayed, then Unknown. */
  setFrozen(frozen: boolean) {
    this.frozen = frozen;
    if (!frozen) this.readings[CENTER_ST.id] = { ...this.readings[CENTER_ST.id], lastReadingAt: this.now() };
    this.emit();
  }

  setSpeed(speed: number) {
    const now = this.now();
    this.realAnchor = Date.now();
    this.simAnchor = now;
    this.speed = speed;
    this.emit();
  }

  setConnection(connection: Connection) {
    if (connection !== 'online' && this.connection === 'online') this.lastSyncAt = this.now() - 2 * MIN;
    this.connection = connection;
    if (connection === 'online') {
      this.lastSyncAt = this.now();
      if (!this.frozen) this.readings[CENTER_ST.id] = { ...this.readings[CENTER_ST.id], lastReadingAt: this.now() };
    }
    this.emit();
  }

  private reading(crossingId: string, state: ReportedState, fields: Partial<CrossingReading>): CrossingReading {
    return {
      crossingId,
      state,
      since: null,
      stoppedAt: null,
      detectedAt: null,
      clearSince: null,
      lastReadingAt: this.now(),
      sensorName: 'East node',
      sensorBatteryOk: true,
      ...fields,
    };
  }

  private tick() {
    const now = this.now();
    if (this.connection === 'online') {
      this.lastSyncAt = now;
      for (const id of Object.keys(this.readings)) {
        const r = this.readings[id];
        if (r.state === 'sensorOffline' || (id === CENTER_ST.id && this.frozen)) continue;
        if (now - r.lastReadingAt >= HEARTBEAT_MS) this.readings[id] = { ...r, lastReadingAt: now };
      }
    }
    const sc = this.scenario;
    if (sc) {
      while (sc.i < sc.steps.length && now - sc.t0 >= sc.steps[sc.i][0] * 1000) {
        this.setCenterState(sc.steps[sc.i][1], true);
        sc.i += 1;
      }
      if (sc.i >= sc.steps.length) {
        this.scenario = null;
        this.setSpeed(sc.prevSpeed);
      }
    }
    // At normal speed, one update per second is enough and keeps screens calm.
    const second = Math.floor(now / 1000);
    if (this.speed > 1 || second !== this.lastEmitSecond) this.emit();
  }

  private emit() {
    this.lastEmitSecond = Math.floor(this.now() / 1000);
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }
}
