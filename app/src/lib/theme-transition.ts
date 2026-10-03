type Runner = (apply: () => void) => void;

let runner: Runner | null = null;

/** Registered by ThemeFade, which covers the screen while the color scheme changes. */
export function setThemeTransitionRunner(next: Runner | null) {
  runner = next;
}

/**
 * Runs `apply` behind a short cross-fade. Native views (tab bar, window) switch scheme at once while
 * React re-renders text a moment later; the cover hides that gap. Without ThemeFade mounted, it
 * applies directly.
 */
export function withThemeTransition(apply: () => void) {
  if (runner) runner(apply);
  else apply();
}
