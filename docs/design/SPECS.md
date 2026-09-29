# MavRadar design specs (v2, "Signal, calm by default")

This is the Checkpoint 4 handoff for the app. It goes with:

- `tokens.json` in this folder: every color, type style, size and radius named below.
- `mockup/index.html` in this folder: a clickable HTML mockup of the whole app. Open it in a browser.
- The design canvas: https://claude.ai/artifact/Bt3AFTrrqTyxD3jk9vFX8E (pages for Checkpoints 1 to 4).

All sizes are dp, type is sp, frame is 412 x 915. Token names in `code` refer to `tokens.json`.

## Rules that apply everywhere

- Never show Clear when data is stale. Live is 30 s or less, Delayed is 30 to 90 s, and past 90 s the crossing is Unknown. Unknown never shows the last state word, only the time of the last reading.
- Durations count up ("Blocked for 7 min"). Under 1 minute say "Blocked just now". Past 60 minutes say "1 h 12 min". No arrival countdowns, anywhere.
- Every state has a word, a shape and a color. Color is never the only cue.
- "Travel information only. Always obey crossing signals and gates." appears on Status, in the map sheet, in Settings and in the store listing. Status is the first screen anyone sees, so the line is on screen from the first launch.
- Touch targets are at least 48 dp. Text passes WCAG AA (4.5:1, 3:1 at 24 sp and up). Icons and marker rings pass 3:1.
- Every time and duration uses tabular numerals.

## Brand: Transit Navy

Transit Navy was chosen on 2026-09-27: deep navy on warm paper, like transit wayfinding. Its values are `color.neutral` in `tokens.json` and `DefaultBrand` in `app/src/constants/theme.ts`.

| Role | Light | Dark |
|---|---|---|
| Background | #FBFAF7 | #0D1522 |
| Surface | #F1EFE9 | #152033 |
| Text | #13213A | #EEF2F8 |
| Secondary text | #4B566A | #AEB9CB |
| Primary (filled buttons, switches, links) | #1B3A66 on #FFFFFF | #A9C4EC on #0D1522 |
| Selected (nav indicator, segments) | #DCE4F0 | #23395C |

- The brand changes neutrals and primary only. Status card, marker, timeline and notification colors never change.
- The other candidates (Graphite, Cobalt, Prairie Slate, Railtie) stay in `tokens.json` and `BrandSchemes` for reference.

## Components

### Status card

The main status block on the Status screen.

| Part | Spec |
|---|---|
| Container | Full width minus 20 dp side padding. Radius `radius.card` (20). Padding 20. Min height `size.statusCardMinHeight` (288), grows with content. |
| Fill | `color.statusCard.<theme>.<state>.container`. Tinted for Clear, Approaching, Unknown. Solid for Blocked, Stopped. |
| Unknown border | 2 dp dashed, `border` token. No other state has a border. |
| Icon | 40 dp, top left, 8 dp below it. Shape per state (circle + check, warning diamond + train, rounded square + X, octagon + pause bars, dashed circle + ?). |
| Kicker | `typography.scale.kicker`, 6 dp above the state word. "No train detected", "Train detected nearby", "Train on crossing", "Train not moving", or the Unknown cause. |
| State word | `stateWord` (48/52 bold), sentence case. Wraps to 2 lines if needed, never clips. `maxFontSizeMultiplier` 1.1. |
| Duration line | Blocked and Stopped: `duration` (32/36) plus `body` "since 2:41 PM" on the same baseline, wrapping below if needed. Other states: `stateLine` (20/26). |
| Freshness line | Pinned to the bottom of the card with `margin-top: auto`, 10 dp above. Filled dot + "Live · updated 8 s ago". Delayed: hollow ring + "Updated 1 min ago · checking" in secondary text (on-container on solid cards). |
| Stopped stripe | 8 dp band on the bottom edge, 45 degree stripes at 12% white, 6 dp on and 6 dp off. Never behind text (card bottom padding becomes 28). |
| Accessibility | The card is a polite live region. Reading order: state word, duration, freshness, then the explanation below the card. |
| Motion | Crossfade 200 ms on state change. The live dot pulses every 2 s, off with reduce motion. |

### Map marker

| Part | Spec |
|---|---|
| Size | 36 dp, 44 dp when selected. Hit area always 48 dp. |
| Fill | `color.strong.<state>`. Same in both themes. |
| Ring | 2 dp white ring, then 1 dp `rgba(0,0,0,0.4)` outer stroke, so it holds 3:1 on any tile. Unknown uses a dashed ring. |
| Shapes | Clear circle, Approaching diamond with 1.5 dp black inner border, Blocked rounded square (radius 10 of 48), Stopped octagon, Unknown circle. |
| Selected label | A pill 32 dp tall centered 8 dp above the marker: "Center St · Blocked", 13 sp semibold, 12 dp side padding, `labelPill` colors, 1 dp border. |
| Followed badge | 12 dp star on a 16 dp white disc, at the marker's top right. |
| Detour pin | Teardrop 28 x 36 in `detourPin`, with a route arrow glyph and a permanent "West St underpass" label. It has no status, so it never uses a status color or a circle. |
| Accessibility | Label reads "Center St crossing, Arlington. Blocked for 7 minutes. Updated 8 seconds ago. Following." |

### Cluster

| Part | Spec |
|---|---|
| Size | 40 dp circle, 52 dp hit area. Shown below zoom 12. |
| Fill | `marker.clusterFill`, count in 16 sp bold `clusterText`. Same white ring and outer stroke as markers. |
| Worst state | If any member is Blocked or Stopped: a 4 dp ring segment starting at 12 o'clock, its length equal to the share of Blocked plus Stopped members, in the worst state's strong color. Plus a 20 dp worst-state badge at the top right. |
| Tap | Zooms to the cluster's bounds. |

### Bottom sheet (map)

| Part | Spec |
|---|---|
| Type | Standard, non-modal. Sits above the nav bar. Top radius `radius.sheet` (28). Handle 32 x 4 dp, 10 dp from the top. |
| Heights | Peek 120. Half 440 (508 with the v1.1 Watch button). Full 775. Snap in 250 ms. |
| Peek | Name 20/26 semibold. 24 dp state icon + state word 16 bold. Meta line in secondary: "Blocked for 7 min · updated 8 s ago". Follow button at the right: tonal, 40 dp tall inside a 48 dp target, plus icon or check. |
| Half | Directions button (56 dp, filled unless Clear), then 48 dp rows: Sensor, Last blockage, 30-day typical blockage, then the disclaimer. |
| Full | "Last 7 days" bar chart (neutral bars, today hatched) and an outlined "Open in Status" button. |
| Behavior | Dragging the map collapses to peek. Predictive back collapses one step. With a street-level map at half or full, the map moves up 170 dp so the selected marker stays visible. |

### Row

| Variant | Spec |
|---|---|
| Info row | Min 48 dp, 1 dp `divider` above. Label `body` left, value `secondary` right. |
| Switch row | Min 48 dp (72 dp with a description line). Switch 52 x 32 in a 48 dp target. On: track `textPrimary`, 24 dp thumb in `bg`. Off: 2 dp `outline` border, 16 dp thumb in `textSecondary`. Neutral colors on purpose, so status colors stay special. |
| List row | 72 dp. 32 dp state icon, name 16/22 semibold, secondary line with the state word in bold, 48 dp star toggle at the right. |
| Settings nav row | 72 dp with a description, value right in 15 semibold, chevron. |

### Today timeline

| Part | Spec |
|---|---|
| Header | "Today" 14 semibold left, caption right: "11 blockages · 58 min total". |
| Bar | Full width, 20 dp tall, radius 4, `track` fill. 24 hours from midnight. |
| Segments | Moving: solid `history.moving`, at least 4 dp wide. Stopped: 45 degree hatch of `history.stopped`, at least 6 dp. No-data gap (Unknown): hatch of `history.noData`. |
| Now marker | 2 dp line in `textPrimary`. |
| Axis | 12 AM, 6 AM, 12 PM, 6 PM at 11 sp. |
| Tap | Opens History. Accessibility label: "Today: 11 blockages, 58 minutes total. Open History." |

## Redlines: Status screen at 100% scale

| Zone | Measure |
|---|---|
| Top inset | 36 (system status bar), y 0 to 36 |
| Header | 64: name 22/28, city line 14/20, y 36 to 100 |
| Gap | 16 (8 header bottom + 8 content top) |
| Status card | min 288, y 116 to 404 |
| Gap | 16 |
| Explanation | 16/24, 1 to 2 lines, y 420 to 444 for one line |
| Gap | 16 |
| Today timeline | 75 (4 top, header 20, gap 8, bar 20, gap 8, axis 15), y 460 to 535 |
| Gap | 16 |
| Rows | 3 x 48 plus 1 dp dividers (Alerts switch, Sensor, Last blockage), y 551 to 699 |
| Flexible space | at least 16 (about 20 at 100%) |
| Directions button | 56, radius 16, 20 side padding |
| Gap | 12 |
| Disclaimer | 13/18, 2 lines |
| Gap | 12 |
| Nav bar | 80: 64 x 32 indicator, 24 dp icons, 12 sp labels |

At 200% font scale the header, card and everything down to the rows scroll. Only the directions button and the nav bar stay pinned, and the disclaimer moves into the scroll area.

## Redlines: Map screen

| Element | Measure |
|---|---|
| Map \| List control | 40 tall, 216 wide (two 108 segments), 40 from top, centered |
| Coverage banner | 20 side margins, 96 from top, radius 16, padding 10 x 14 |
| Sheet peek | 120 above an 80 nav bar |
| Snackbar | 12 side margins, 12 above the sheet, min 48 tall, radius 8 |
| Priming sheet | Modal, top radius 28, padding 24, scrim at 45% |

## First launch

There is no welcome or onboarding screen. Checking a crossing is often time critical, so the app opens straight on live Status for Center St.

- No account, no location question and no permission prompt at launch.
- The notification priming sheet appears only when the person asks for alerts: Follow in the map sheet, the star in the List, the alerts switch on Status, or an alert switch in Settings. After that comes the Android dialog.
- On the second visit, Status can show one dismissible tip ("Set your commute hours so alerts only come when you drive") in place of the Today timeline.
- Tapping any notification opens Status for that crossing.

## Notifications

| Event | Channel | Title | Body | Actions |
|---|---|---|---|---|
| Blocked (confirmed) | Crossing blocked and cleared (high) | Center St is blocked | Train on the crossing since 2:41 PM. Detour: West St underpass. | Directions via West St · Mute today |
| Became stopped | same, updates the same notification | Train stopped on Center St | Stopped since 2:47 PM. Blocked for 6 min. | Directions via West St |
| Cleared | same, replaces it | Center St is clear | Blocked for 9 min. Cleared at 2:50 PM. | none |
| Sensor offline (over 10 min, followers only) | Sensor status (default) | Center St status unknown | No sensor data since 2:14 PM. Don't assume it's clear. | none |

- Small icon: the state shape as a white silhouette on the accent circle (`color.notification.accent`).
- The title alone must carry the message in one collapsed line.
- At most one follow-up per event.
- Every FCM message sets `android.priority: "high"` and the channel id.
- Test pushes never go on the blocked and cleared channel.

Live Update (v1.1):

- Started by the user from "Watch this blockage" in the sheet.
- Standard template, not ProgressStyle. A progress bar implies an end time, which would be a countdown.
- Status bar chip reads "Blocked 7m", not colorized.
- Ends automatically when the crossing clears.

## Widgets

- 2x2 (176 x 176) and 4x1 (364 x 80), radius 24, status card colors.
- Show the state icon, state word, duration and "Updated 2:48 PM".
- A widget that misses the stale threshold shows Unknown.

## Play Store screenshot list

Portrait 1080 x 1920 or larger, 9:16. Put the headline above the device, in Atkinson Hyperlegible Next 700, on the `surface` color. Use only real app states. Never show a countdown.

| # | Screen | Headline | Source board |
|---|---|---|---|
| 1 | Status, Blocked, light | Know if Center St is blocked before you get there | v2 · Status, light row |
| 2 | Map, one crossing, sheet at half | See the crossing and the detour on one map | Checkpoint 2, one crossing |
| 3 | Heads-up notification, Blocked | Get an alert only when a train blocks your crossing | Checkpoint 3, surfaces |
| 4 | Status, Stopped, dark | Stopped trains are called out, with how long | v2 · Status, dark row |
| 5 | History, 7 days | See when this crossing is usually blocked | Checkpoint 3, History |
| 6 | Status, Unknown, sensor offline | When data is old, we say so. Never a false "Clear" | v2 · Status, variants |
| 7 | Settings, alerts | Alerts on your terms. No account, no location | Checkpoint 3, Settings |
| 8 | Map, Follow priming sheet | Follow a crossing to get alerts. Change it anytime | Checkpoint 2, follow flow |

Widgets and the Live Update are designed but not in v1, so they stay out of store screenshots until they ship.

- The store description must include "Travel information only. Always obey crossing signals and gates."
- Feature graphic: 1024 x 500, crossing shapes on `surface`, no train photos.
