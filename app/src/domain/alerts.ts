import { SERVICE_STATUS_CHANNEL, TRAIN_ALERTS_CHANNEL } from '@/lib/channels';

import { isBlocking, type Effective } from './freshness';
import { formatTime, minutesBetween } from './time';
import type { Crossing, CrossingState } from './types';

export type AlertKind = 'blocked' | 'stopped' | 'cleared' | 'sensorOffline';
export type AlertType = 'blocked' | 'stopped' | 'cleared';
export type PermissionState = 'undetermined' | 'granted' | 'denied';

/** Minutes a sensor must be quiet before followers get a "status unknown" note. */
export const SENSOR_OFFLINE_NOTICE_MIN = 10;

export interface AlertMemory {
  prevState: CrossingState | null;
  /** The blockage in progress, if any. */
  event: { since: number; sent: boolean; stoppedSent: boolean } | null;
  unknownSince: number | null;
  unknownSent: boolean;
}

export const initialAlertMemory: AlertMemory = { prevState: null, event: null, unknownSince: null, unknownSent: false };

export interface AlertStep {
  memory: AlertMemory;
  alerts: AlertKind[];
  /** Set when a blockage ends with an alert: how long it lasted. */
  clearedAfterMin?: number;
}

/**
 * Alert rules for one crossing, run every time its effective state is recomputed.
 * - Blocked alerts only after the blockage has lasted `minBlockMin` (confirmation).
 * - At most one follow-up per blockage: Blocked to Stopped.
 * - Cleared only for a blockage that was alerted.
 * - "Status unknown" once, after the sensor has been quiet for 10 minutes.
 * - The first observation never alerts, so opening the app mid-blockage stays silent.
 */
export function stepAlerts(mem: AlertMemory, e: Effective, now: number, minBlockMin: number): AlertStep {
  const cur = e.state;
  const alerts: AlertKind[] = [];
  let { event, unknownSince, unknownSent } = mem;
  let clearedAfterMin: number | undefined;

  if (mem.prevState === null) {
    if (isBlocking(cur)) event = { since: e.since ?? now, sent: true, stoppedSent: cur === 'stopped' };
    if (cur === 'unknown' && e.cause === 'sensor') {
      unknownSince = now;
      unknownSent = true;
    }
    return { memory: { prevState: cur, event, unknownSince, unknownSent }, alerts };
  }

  const prev = mem.prevState;
  if (prev !== cur) {
    if (!isBlocking(prev) && isBlocking(cur)) {
      event = { since: e.since ?? now, sent: false, stoppedSent: false };
    }
    if (prev === 'blocked' && cur === 'stopped' && event?.sent && !event.stoppedSent) {
      alerts.push('stopped');
      event = { ...event, stoppedSent: true };
    }
    if (isBlocking(prev) && !isBlocking(cur)) {
      // Going Unknown mid-blockage says nothing about the train, so it never counts as cleared.
      if ((cur === 'clear' || cur === 'approaching') && event?.sent) {
        alerts.push('cleared');
        clearedAfterMin = Math.max(1, minutesBetween(event.since, now));
      }
      event = null;
    }
    if (cur === 'unknown' && e.cause === 'sensor') {
      unknownSince = now;
      unknownSent = false;
    } else if (cur !== 'unknown') {
      unknownSince = null;
      unknownSent = false;
    }
  }

  if (isBlocking(cur) && event && !event.sent && now - event.since >= minBlockMin * 60_000) {
    alerts.push(cur === 'stopped' ? 'stopped' : 'blocked');
    event = { ...event, sent: true, stoppedSent: cur === 'stopped' || event.stoppedSent };
  }

  if (cur === 'unknown' && e.cause === 'sensor' && unknownSince !== null && !unknownSent && now - unknownSince >= SENSOR_OFFLINE_NOTICE_MIN * 60_000) {
    alerts.push('sensorOffline');
    unknownSent = true;
  }

  return { memory: { prevState: cur, event, unknownSince, unknownSent }, alerts, clearedAfterMin };
}

export interface DeliveryPrefs {
  following: boolean;
  permission: PermissionState;
  types: Record<AlertType, boolean>;
  mutedToday: boolean;
}

/** Whether an alert reaches the phone. Status-unknown notes ignore alert types and mute. */
export function shouldDeliver(kind: AlertKind, prefs: DeliveryPrefs): boolean {
  if (!prefs.following || prefs.permission !== 'granted') return false;
  if (kind === 'sensorOffline') return true;
  if (prefs.mutedToday) return false;
  return prefs.types[kind];
}

/**
 * Android channel for an alert. The train-alerts channel is one-shot (its importance can't be
 * raised again) and only ever carries a real train event, so demo alerts always use service-status.
 */
export function channelFor(kind: AlertKind, mode: 'demo' | 'live'): string {
  if (mode === 'demo' || kind === 'sensorOffline') return SERVICE_STATUS_CHANNEL;
  return TRAIN_ALERTS_CHANNEL;
}

/** Notification text. Titles carry the message on their own for a one-line glance. */
export function alertContent(kind: AlertKind, crossing: Crossing, e: Effective, now: number, clearedAfterMin?: number) {
  const n = crossing.name;
  switch (kind) {
    case 'blocked':
      return { title: `${n} is blocked`, body: `Train on the crossing since ${formatTime(e.since ?? now)}. Detour: West St underpass.` };
    case 'stopped':
      return { title: `Train stopped on ${n}`, body: `Stopped since ${formatTime(e.stoppedAt ?? now)}. Blocked for ${minutesBetween(e.since ?? now, now)} min.` };
    case 'cleared':
      return { title: `${n} is clear`, body: `Blocked for ${clearedAfterMin ?? 1} min. Cleared at ${formatTime(now)}.` };
    default:
      return { title: `${n} status unknown`, body: `No sensor data since ${formatTime(e.lastAt || now)}. Don't assume it's clear.` };
  }
}
