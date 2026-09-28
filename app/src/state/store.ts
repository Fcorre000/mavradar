import { useSyncExternalStore } from 'react';

import { demoEngine } from '@/data';
import type { DemoControls } from '@/data/demo-engine';
import type { AlertMemory, AlertType, PermissionState } from '@/domain/alerts';
import { CENTER_ST, DEMO_CROSSINGS } from '@/domain/crossings';
import type { Crossing, SourceSnapshot } from '@/domain/types';

import { defaultPrefs, type Prefs } from './prefs';

export interface Snack {
  id: number;
  text: string;
  undo?: () => void;
}

export interface PrimingRequest {
  crossingId: string;
  reason: 'follow' | 'alert';
  alertType?: AlertType;
}

export interface AppState {
  snapshot: SourceSnapshot;
  controls: DemoControls;
  prefs: Prefs;
  prefsLoaded: boolean;
  permission: PermissionState;
  alertMemory: Record<string, AlertMemory>;
  ui: {
    snack: Snack | null;
    priming: PrimingRequest | null;
    statusCrossingId: string;
    selectedCrossingId: string;
    mapView: 'map' | 'list';
    historyCrossingId: string;
    historyRange: 7 | 30;
    /** Settings: the alert switch that was tapped while notifications are off. */
    settingsCardFor: AlertType | null;
  };
  demo: {
    dataset: 'one' | 'many';
    historyEmpty: boolean;
    showTip: boolean;
  };
}

const initialState: AppState = {
  snapshot: demoEngine.snapshot(),
  controls: demoEngine.controls(),
  prefs: defaultPrefs,
  prefsLoaded: false,
  permission: 'undetermined',
  alertMemory: {},
  ui: {
    snack: null,
    priming: null,
    statusCrossingId: CENTER_ST.id,
    selectedCrossingId: CENTER_ST.id,
    mapView: 'map',
    historyCrossingId: CENTER_ST.id,
    historyRange: 7,
    settingsCardFor: null,
  },
  demo: { dataset: 'one', historyEmpty: false, showTip: false },
};

let state = initialState;
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(update: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const patch = typeof update === 'function' ? update(state) : update;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function setUi(patch: Partial<AppState['ui']>) {
  setState((s) => ({ ui: { ...s.ui, ...patch } }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Read part of the app state. The selector must return a value that already exists in state
 * (a slice or a primitive), not a new object, or the screen re-renders on every update.
 */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

/** Crossings the app shows: just Center St, or all 12 in the demo's multi-crossing mode. */
export function visibleCrossings(s: AppState): Crossing[] {
  return s.demo.dataset === 'many' ? DEMO_CROSSINGS : [CENTER_ST];
}
