# MavRadar app design audit, 2026-10-15

Impeccable `audit` (native) and `critique` over the four tabs, the map sheet, the list sheet and the modal sheets, in light and dark. Branch `feature/design-audit-and-styles`.

⚠️ DEGRADED: single-context (critique's two isolated reviewers need subagents, which this session only launches on an explicit request). Evidence: source review of `app/src`, the web preview at 375×812 in light and dark, and Impeccable's detector. No simulator or emulator exists on this machine, so there are no native screenshots; Android-only behavior is judged from code.

Detector: no findings in `app/src` (it scans web markup, not React Native, so this is not a clean bill). On the HTML mockup it flagged one item, the Stopped card's diagonal stripes, which is a false positive: the stripes are how Stopped stays distinct from Blocked without relying on color.

## Audit health score (technical)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Five controls below 48 dp; otherwise labeled, live regions, capped font scaling, reduced motion on the live dot |
| 2 | Performance | 2 | The whole app re-renders every second; History's 7 and 30 day lists aren't virtualized |
| 3 | Appearance & theming | 3 | Tokens throughout, both appearances first-class, contrast tested; the map cluster fill is hard-coded to Transit Navy |
| 4 | Platform conformance | 3 | Native tab bar, switches and bottom sheet; modal sheets show a handle that doesn't drag; two icon systems |
| 5 | Adaptivity | 2 | Portrait phone only; iPad runs in iPhone compatibility mode, Android tablets get a stretched phone layout |
| **Total** | | **13/20** | **Acceptable** |

**Platform conformance verdict: pass.** It reads as a native app, not a ported website. The tab bar is the system one, switches are native, the map sheet behaves like a real bottom sheet, and insets are respected. The tells are small: in-app icons are a custom line set while the tab bar uses SF Symbols and Material Symbols, top-level screens use a static custom header rather than iOS large titles, and the modal sheets draw a drag handle that does nothing.

## Design health score (critique)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Freshness on every state, live dot, Unknown never shows a stale state |
| 2 | Match system / real world | 3 | "USDOT 794978C" in the Status header is official jargon to a student |
| 3 | User control and freedom | 3 | Undo on follow; modal sheets can't be swiped down |
| 4 | Consistency and standards | 2 | Three screens show the "typical" blockage, with two different answers |
| 5 | Error prevention | 3 | Priming before the system prompt; nothing claims Clear without data |
| 6 | Recognition rather than recall | 3 | State is shape plus word plus color everywhere |
| 7 | Flexibility and efficiency | 2 | No glance surface yet (widget designed, not built) |
| 8 | Aesthetic and minimalist design | 3 | Clear card leaves a large empty band; the commute tip takes the Today timeline's place |
| 9 | Error recovery | 3 | Retry when the server is unreachable, offline banners, plain snackbars |
| 10 | Help and documentation | 3 | "How detection works" and Sensors cover the basics |
| **Total** | | **29/40** | **Good** |

## Design specificity verdict

Authored for this product, not category-interchangeable. The state system (one shape per state, the MUTCD-style amber diamond, solid cards only for Blocked and Stopped), the trust rule, the freshness line inside the card and the pinned detour button only make sense for a crossing app. The weak spots are generic rather than wrong: History's stat line and list read like any analytics app, and the Clear state spends most of the screen on a large, mostly empty card.

## Priority issues

**[P1] Two answers to "how long do blockages usually last"**
- Where: History stat line (`app/history.tsx:92`, from fixed numbers in `data/demo-history.ts`) says "typical 4 min"; the Status card (`typicalCopy`) and the map sheet (`crossing-sheet.tsx`) compute 5 min from the blockage log. The map sheet uses the upper median, Status the true median.
- Impact: the app contradicts itself on the number people use to decide whether to wait.
- Fix: one function and one source for typical duration, used by all three. When History goes live (task A4) it reads the server summary; the Status line and sheet should agree with it.
- Command: `/impeccable harden`

**[P1] Controls below the 48 dp touch minimum**
- Where: "Set commute hours" link 40 (`index.tsx:138`), Settings "Open settings" 40 (`settings.tsx:299`), "Suggest a crossing" 36 (`map.tsx:214`), Follow pill 40 (`crossing-sheet.tsx:125`), segmented controls 40 (`segmented.tsx:49`). (History's chips look 32 dp but already sit in a 48 dp tap area, so they were a false positive.)
- Impact: missed taps, especially one-handed or in a car. Material and HIG both set the floor at 48 dp / 44 pt.
- Fix: keep the visual size, extend the hit area with `hitSlop` or padding to 48.
- Command: `/impeccable adapt`

**[P2] The whole app re-renders every second**
- Where: `DemoEngine` and `FirestoreSource` emit a new snapshot each second (a fresh `events` array included) so the "updated 8 s ago" text ticks; every mounted tab that reads `snapshot` re-renders, and the native tab bar keeps all four mounted.
- Impact: battery and frame drops, worst on the map with many markers.
- Fix: tick the "seconds ago" text locally; only emit a new snapshot when data changes; select narrower slices.
- Command: `/impeccable optimize`

**[P2] Modal sheets look draggable but aren't**
- Where: `sheet-modal.tsx:19`, `priming-sheet.tsx:28` draw a handle; the sheet is a plain `Modal` with no drag gesture.
- Impact: people try to swipe it down and nothing happens. The map and list sheets do drag, so it's inconsistent too.
- Fix: build these on the same bottom-sheet component as the map (`@gorhom/bottom-sheet` modal), or drop the handle.
- Command: `/impeccable polish`

**[P2] History lists aren't virtualized**
- Where: `history.tsx:123-135` maps every blockage into a `ScrollView`: about 126 rows for 7 days and 500+ for 30.
- Fix: `SectionList` grouped by day.
- Command: `/impeccable optimize`

**[P2] Clear state hierarchy**
- Where: Status when Clear: the card's minimum height leaves a large empty band, and the second-visit commute tip replaces the Today timeline.
- Impact: the screen's best supporting information (today's blockages) disappears exactly when someone is learning the app.
- Fix: show the tip under the timeline, not instead of it; let the Clear card shrink to its content.
- Command: `/impeccable layout`

## Persona red flags

- **Commuting student, phone in a mount:** the 36 to 40 dp links and chips are hard to hit at a red light. The Status screen itself passes the glance test.
- **City or dispatch staff:** "USDOT 794978C" helps them and confuses everyone else. Keep the ID, but move it to the map sheet or Sensors detail.
- **Screen reader user:** strong. Roles and labels on every control, a polite live region on the card, and capped scaling keep the layout intact at 200%.

## Minor observations

- Two icon systems: native SF Symbols / Material Symbols in the tab bar, a custom line set inside screens (P3).
- Static headers on top-level screens instead of iOS large titles (P3; Android doesn't use them).
- Map cluster fill is hard-coded to Transit Navy (`crossing-map.tsx:158`), so it ignores the other color themes (P3).
- `themed-text.tsx` and `themed-view.tsx` are unused Expo template leftovers, one with a stray `#3c87f7` (P3).
- iPad: `ios.supportsTablet` is unset, so iPad runs the iPhone app scaled up; Android tablets stretch the phone layout (P3 while Android phones are the target).

## What's working

- The state system: shape, word and color together, so it survives color blindness and glare, and Unknown never shows the last state.
- Trust built into copy: freshness inside every card, "as of" times in shared text, "Past data, not a prediction" on History.
- Accessibility basics done properly: roles on every control, live regions, `maxFontSizeMultiplier` caps, a large-text layout switch, reduced motion on the live dot, and contrast enforced by a test for every color theme.
- Permission flow: the priming sheet before the system prompt, with Undo on follow.

## Questions to consider

- Should Clear be quieter than it is now? Most checks will land on Clear, and the screen could say "you're fine" faster with less card.
- Is History for students or for the city? The stat line and busiest-hours chart serve planners; a commuter mostly wants "when should I avoid this crossing."
