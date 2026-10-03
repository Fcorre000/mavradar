import { Appearance, Linking, Platform } from 'react-native';

import { demoEngine, source } from '@/data';
import { initialAlertMemory, shouldDeliver, stepAlerts, type AlertType } from '@/domain/alerts';
import { CENTER_ST, crossingById, DETOUR } from '@/domain/crossings';
import { effectiveState } from '@/domain/freshness';
import type { Connection, ReportedState, SourceSnapshot } from '@/domain/types';
import { deliverAlert, onAlertTapped } from '@/lib/alert-delivery';
import { getAlertPermission, registerDevice, requestAlertPermission } from '@/lib/push';
import { withThemeTransition } from '@/lib/theme-transition';

import { loadPrefs, localDay, savePrefs, type Prefs } from './prefs';
import { getState, setState, setUi, type AppState } from './store';

let started = false;

/** Loads saved choices, reads the permission state, and starts listening to crossing data. */
export function startApp(onOpenCrossing: (crossingId: string) => void) {
  if (started) return;
  started = true;
  loadPrefs().then((saved) => {
    const prefs = { ...saved, launches: saved.launches + 1 };
    setState({ prefs, prefsLoaded: true });
    savePrefs(prefs);
    applyAppearance(prefs.appearance);
  });
  getAlertPermission()
    .then((permission) => {
      setState({ permission });
      if (permission === 'granted') syncDevice();
    })
    .catch(() => {});
  source.subscribe(onSnapshot);
  onAlertTapped((crossingId) => {
    setUi({ statusCrossingId: crossingId });
    onOpenCrossing(crossingId);
  });
}

function onSnapshot(snapshot: SourceSnapshot) {
  const s = getState();
  const memory = { ...s.alertMemory };
  const muted = s.prefs.mutedDay === localDay(snapshot.now);
  for (const id of s.prefs.following) {
    const crossing = crossingById(id);
    const e = effectiveState(snapshot.readings[id], snapshot);
    const step = stepAlerts(memory[id] ?? initialAlertMemory, e, snapshot.now, s.prefs.minBlockMin);
    memory[id] = step.memory;
    for (const kind of step.alerts) {
      const prefs = { following: true, permission: s.permission, types: s.prefs.alertTypes, mutedToday: muted };
      if (shouldDeliver(kind, prefs)) {
        deliverAlert(kind, crossing, e, snapshot.now, source.kind, step.clearedAfterMin).catch(() => {});
      }
    }
  }
  setState({ snapshot, alertMemory: memory, controls: source.kind === 'demo' ? demoEngine.controls() : s.controls });
}

// ---------------------------------------------------------------- preferences

export function setPrefs(patch: Partial<Prefs>) {
  const prefs = { ...getState().prefs, ...patch };
  setState({ prefs });
  savePrefs(prefs);
  const { appearance } = patch;
  if (appearance) withThemeTransition(() => applyAppearance(appearance));
  if (patch.following && getState().permission === 'granted') syncDevice();
}

function applyAppearance(appearance: Prefs['appearance']) {
  // Drives the whole app, native tab bar included. Not available on web.
  if (Platform.OS !== 'web') Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
}

function syncDevice() {
  // Fails softly where push isn't available (Expo Go, simulators, no network).
  registerDevice(getState().prefs.following).catch(() => {});
}

// ---------------------------------------------------------------- snackbar

export function showSnack(text: string, undo?: () => void) {
  setUi({ snack: { id: Date.now(), text, undo } });
}

export function dismissSnack() {
  setUi({ snack: null });
}

// ---------------------------------------------------------------- follow and alerts

export function isFollowing(s: AppState, id: string) {
  return s.prefs.following.includes(id);
}

function addFollow(id: string) {
  const following = getState().prefs.following;
  if (!following.includes(id)) setPrefs({ following: [...following, id] });
}

function removeFollow(id: string) {
  const s = getState();
  const alertMemory = { ...s.alertMemory };
  delete alertMemory[id];
  setState({ alertMemory });
  setPrefs({ following: s.prefs.following.filter((f) => f !== id) });
}

/** Follow or unfollow. The first follow shows the priming sheet before any system prompt. */
export function toggleFollow(id: string) {
  const s = getState();
  const name = crossingById(id).name;
  if (isFollowing(s, id)) {
    removeFollow(id);
    showSnack(`Unfollowed ${name}.`, () => addFollow(id));
    return;
  }
  if (s.permission === 'undetermined') {
    setUi({ priming: { crossingId: id, reason: 'follow' } });
    return;
  }
  addFollow(id);
  showSnack(
    s.permission === 'granted' ? `Following ${name}. Alerts on.` : `Following ${name}. Notifications are off for MavRadar.`,
    () => removeFollow(id),
  );
}

/** Settings alert switch. With notifications off, it shows the inline card instead. */
export function setAlertType(type: AlertType, on: boolean) {
  const s = getState();
  if (on && s.permission === 'undetermined') {
    setUi({ priming: { crossingId: CENTER_ST.id, reason: 'alert', alertType: type } });
    return;
  }
  if (on && s.permission === 'denied') {
    setUi({ settingsCardFor: type });
    return;
  }
  setPrefs({ alertTypes: { ...s.prefs.alertTypes, [type]: on } });
}

/** "Turn on alerts" in the priming sheet: now the system prompt appears. */
export async function confirmPriming() {
  const request = getState().ui.priming;
  setUi({ priming: null });
  if (!request) return;
  const permission = await requestAlertPermission();
  setState({ permission });
  const name = crossingById(request.crossingId).name;
  if (request.reason === 'follow') addFollow(request.crossingId);
  if (request.reason === 'alert' && request.alertType && permission === 'granted') {
    setPrefs({ alertTypes: { ...getState().prefs.alertTypes, [request.alertType]: true } });
  }
  if (permission === 'granted') {
    syncDevice();
    if (request.reason === 'follow') showSnack(`Following ${name}. Alerts on.`, () => removeFollow(request.crossingId));
  } else {
    showSnack('Alerts are off. You can still check status here.');
  }
}

export function dismissPriming() {
  setUi({ priming: null });
}

// ---------------------------------------------------------------- navigation helpers

export function openDirections() {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${DETOUR.latitude},${DETOUR.longitude}&travelmode=driving`;
  Linking.openURL(url).catch(() => showSnack("Couldn't open Maps."));
}

export function dismissTip() {
  setPrefs({ tipDismissed: true });
  setState((s) => ({ demo: { ...s.demo, showTip: false } }));
}

export function selectCrossing(id: string) {
  setUi({ selectedCrossingId: id });
}

// ---------------------------------------------------------------- demo controls

export const demo = {
  setCenterState: (state: ReportedState) => demoEngine.setCenterState(state),
  playTrain: () => demoEngine.playTrain(),
  setFrozen: (frozen: boolean) => demoEngine.setFrozen(frozen),
  setSpeed: (speed: number) => demoEngine.setSpeed(speed),
  setConnection: (connection: Connection) => demoEngine.setConnection(connection),
  setDataset(dataset: 'one' | 'many') {
    setState((s) => ({ demo: { ...s.demo, dataset } }));
    if (dataset === 'one') setUi({ statusCrossingId: CENTER_ST.id, selectedCrossingId: CENTER_ST.id, historyCrossingId: CENTER_ST.id });
  },
  setHistoryEmpty: (historyEmpty: boolean) => setState((s) => ({ demo: { ...s.demo, historyEmpty } })),
  retry: () => showSnack(demoEngine.controls().connection === 'server' ? "Still can't reach MavRadar. We'll keep trying." : 'Reconnected.'),
  setShowTip: (showTip: boolean) => setState((s) => ({ demo: { ...s.demo, showTip } })),
};
