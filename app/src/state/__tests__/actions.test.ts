
import { startApp } from '../actions';
import { source } from '@/data';
import { stepAlerts, shouldDeliver } from '@/domain/alerts';
import { deliverAlert } from '@/lib/alert-delivery';
import { getState } from '../store';
import type { SourceSnapshot } from '@/domain/types';
import type { AppState } from '../store';

// Mock the data source and capture its subscriber.
jest.mock('@/data', () => ({
  source: {
    kind: 'demo',
    subscribe: jest.fn(),
  },
  demoEngine: {
    controls: jest.fn(() => ({})),
  },
}));

jest.mock('@/domain/alerts', () => ({
  initialAlertMemory: {},
  stepAlerts: jest.fn(),
  shouldDeliver: jest.fn(),
}));

jest.mock('@/domain/crossings', () => ({
  crossingById: jest.fn(() => ({
    id: 'crossing-1',
    name: 'Test Crossing',
  })),
}));

jest.mock('@/domain/freshness', () => ({
  effectiveState: jest.fn(() => ({
    state: 'blocked',
  })),
}));

jest.mock('@/lib/alert-delivery', () => ({
  deliverAlert: jest.fn(() => Promise.resolve()),
  onAlertTapped: jest.fn(),
}));

jest.mock('@/lib/push', () => ({
  getAlertPermission: jest.fn(() => new Promise(() => {})),
  registerDevice: jest.fn(),
  requestAlertPermission: jest.fn(),
}));

jest.mock('@/lib/style-fonts', () => ({
  loadStyleFonts: jest.fn(),
}));

jest.mock('@/lib/theme-transition', () => ({
  withThemeTransition: jest.fn(),
}));

jest.mock('../prefs', () => ({
  loadPrefs: jest.fn(() => new Promise(() => {})),
  savePrefs: jest.fn(),
  localDay: jest.fn(() => '2026-10-31'),
}));

jest.mock('../store', () => ({
  getState: jest.fn(),
  setState: jest.fn(),
  setUi: jest.fn(),
}));

describe('onSnapshot local notification rules', () => {
  let onSnapshot: (snapshot: SourceSnapshot) => void;

  const snapshot = {
    now: Date.now(),
    readings: {
      'crossing-1': {},
    },
  } as unknown as SourceSnapshot;

  beforeAll(() => {
    // startApp registers onSnapshot using source.subscribe.
    startApp(jest.fn());

    onSnapshot = jest.mocked(source.subscribe)
      .mock.calls[0][0];
  });

  beforeEach(() => {
    jest.clearAllMocks();

    jest.mocked(getState).mockReturnValue({
      prefs: {
        following: ['crossing-1'],
        mutedDay: null,
        minBlockMin: 1,
        alertTypes: { blocked: true },
      },
      permission: 'granted',
      alertMemory: {},
      controls: {},
    } as unknown as AppState);

    // Ensure an eligible alert exists for each test.
    jest.mocked(stepAlerts).mockReturnValue({
      memory: {},
      alerts: ['blocked'],
      clearedAfterMin: undefined,
    } as ReturnType<typeof stepAlerts>);

    jest.mocked(shouldDeliver).mockReturnValue(true);
  });

  test('does not deliver local alerts in live mode', () => {
    Object.defineProperty(source, 'kind', {
      value: 'live',
      configurable: true,
    });

    onSnapshot(snapshot);

    expect(stepAlerts).toHaveBeenCalled();
    expect(deliverAlert).not.toHaveBeenCalled();
  });

  test('delivers local alerts in demo mode', () => {
    Object.defineProperty(source, 'kind', {
      value: 'demo',
      configurable: true,
    });

    onSnapshot(snapshot);

    expect(stepAlerts).toHaveBeenCalled();
    expect(deliverAlert).toHaveBeenCalledTimes(1);
  });
});
