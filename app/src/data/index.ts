import { DemoEngine } from './demo-engine';
import type { CrossingSource } from './source';

/** The simulated source the app runs on until the server writes live crossing status. */
export const demoEngine = new DemoEngine();

/** The active source. Swap for `new FirestoreSource([...ids])` once the server is live. */
export const source: CrossingSource = demoEngine;
