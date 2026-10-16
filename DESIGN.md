---
name: MavRadar
description: "Signal, calm by default. Real-time grade crossing status that stays quiet until a train blocks the road."
colors:
  transit-navy: "#1B3A66"
  on-transit-navy: "#FFFFFF"
  ink-navy: "#13213A"
  slate-ink: "#4B566A"
  warm-paper: "#FBFAF7"
  platform-stone: "#F1EFE9"
  sheet-white: "#FFFFFF"
  selected-mist: "#DCE4F0"
  tonal-mist: "#E8ECF3"
  track-sand: "#EAE7E0"
  divider-sand: "#E3E0D8"
  outline-sand: "#C8C4BA"
  snackbar-navy: "#1B2A42"
  snackbar-action: "#A9C4EC"
  night-platform: "#0D1522"
  night-surface: "#152033"
  night-text: "#EEF2F8"
  night-secondary: "#AEB9CB"
  night-selected: "#23395C"
  night-tonal: "#1C2A42"
  night-divider: "#22304A"
  night-outline: "#33425E"
  night-navy: "#A9C4EC"
  clear-green-teal: "#007A6E"
  clear-tint: "#E0F2EF"
  clear-ink: "#00594F"
  clear-tint-dark: "#0E2A27"
  clear-ink-dark: "#7FD9CC"
  approaching-amber: "#F2A900"
  approaching-tint: "#FFE8A3"
  approaching-ink: "#5C3A00"
  approaching-tint-dark: "#3A2C00"
  approaching-ink-dark: "#FFD66B"
  blocked-red: "#C62828"
  blocked-red-dark: "#8C1D18"
  stopped-dark-red: "#8E1B1B"
  stopped-dark-red-dark: "#5E0F0F"
  unknown-gray: "#6B7280"
  unknown-tint: "#ECEEF1"
  unknown-ink: "#3D4450"
  unknown-tint-dark: "#22262B"
  unknown-ink-dark: "#C9CED6"
  signal-ink: "#1A1A1A"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "48px"
    fontWeight: 700
    lineHeight: "52px"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: "36px"
    fontFeature: "tnum"
  title:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "28px"
  title-small:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
  body:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-small:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.2px"
  label-button:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "21px"
  label-nav:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
  caption:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  axis:
    fontFamily: "Atkinson Hyperlegible Next, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "14px"
rounded:
  timeline: "4px"
  chip: "8px"
  snackbar: "8px"
  button: "16px"
  card: "20px"
  segmented: "20px"
  widget: "24px"
  sheet: "28px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  screen-padding: "20px"
  card-padding: "20px"
  section-gap: "16px"
  max-content-width: "600px"
components:
  button-filled:
    backgroundColor: "{colors.transit-navy}"
    textColor: "{colors.on-transit-navy}"
    typography: "{typography.label-button}"
    rounded: "{rounded.button}"
    padding: "8px 18px"
    height: "56px"
  button-tonal:
    backgroundColor: "{colors.tonal-mist}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.label-button}"
    rounded: "{rounded.button}"
    padding: "8px 18px"
    height: "56px"
  button-outline:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.label-button}"
    rounded: "{rounded.button}"
    padding: "8px 18px"
    height: "48px"
  button-text:
    textColor: "{colors.ink-navy}"
    typography: "{typography.label-button}"
    rounded: "{rounded.button}"
    padding: "8px 18px"
    height: "48px"
  status-card-clear:
    backgroundColor: "{colors.clear-tint}"
    textColor: "{colors.clear-ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  status-card-approaching:
    backgroundColor: "{colors.approaching-tint}"
    textColor: "{colors.approaching-ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  status-card-blocked:
    backgroundColor: "{colors.blocked-red}"
    textColor: "{colors.on-transit-navy}"
    rounded: "{rounded.card}"
    padding: "20px"
    height: "288px"
  status-card-stopped:
    backgroundColor: "{colors.stopped-dark-red}"
    textColor: "{colors.on-transit-navy}"
    rounded: "{rounded.card}"
    padding: "20px 20px 28px"
    height: "288px"
  status-card-unknown:
    backgroundColor: "{colors.unknown-tint}"
    textColor: "{colors.unknown-ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  chip:
    textColor: "{colors.ink-navy}"
    typography: "{typography.body-small}"
    rounded: "{rounded.chip}"
    padding: "4px 14px"
    height: "32px"
  chip-selected:
    backgroundColor: "{colors.selected-mist}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.body-small}"
    rounded: "{rounded.chip}"
    padding: "4px 14px 4px 10px"
    height: "32px"
  segmented:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.body-small}"
    rounded: "{rounded.segmented}"
    height: "40px"
  segmented-selected:
    backgroundColor: "{colors.selected-mist}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.body-small}"
    rounded: "{rounded.segmented}"
    height: "40px"
  row:
    textColor: "{colors.ink-navy}"
    typography: "{typography.body}"
    height: "48px"
  row-tall:
    textColor: "{colors.ink-navy}"
    typography: "{typography.body}"
    padding: "8px 0"
    height: "72px"
  bottom-sheet:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.sheet}"
    padding: "10px 24px 20px"
  snackbar:
    backgroundColor: "{colors.snackbar-navy}"
    textColor: "{colors.night-text}"
    typography: "{typography.body-small}"
    rounded: "{rounded.snackbar}"
    padding: "6px 8px 6px 16px"
    height: "48px"
  nav-bar:
    backgroundColor: "{colors.platform-stone}"
    textColor: "{colors.ink-navy}"
    typography: "{typography.label-nav}"
    height: "80px"
  nav-indicator:
    backgroundColor: "{colors.selected-mist}"
    rounded: "{rounded.full}"
    width: "64px"
    height: "32px"
  demo-badge:
    textColor: "{colors.slate-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: MavRadar

## Overview

**Creative North Star: "The Crossing Signal"**

A railroad crossing signal is dark almost all the time. Nobody notices it until a train comes, and then nothing on the street is louder. MavRadar works the same way. On a normal check the screen is calm, legible and honest: warm paper, deep navy text, a tinted card that says Clear and how fresh that is. When a train blocks the road the card turns solid red and the screen gives the detour, so someone glancing at a red light gets the answer in two seconds.

The mood is calm, legible and honest. Neutrals carry the whole interface so that the five status colors stay rare and meaningful. Type is one humanist family built for low vision, set large for the state and plain for everything else. Surfaces are flat, separated by tone and hairlines rather than shadows. The density is that of a utility, not a feed: one crossing, one decision, generous touch targets.

This file documents the default look, Signal, in its default color theme (Transit Navy). The four other color themes (Graphite, Cobalt, Prairie Slate, Railtie) swap only the neutrals and primary; their values live in `app/src/constants/theme.ts` and `docs/design/tokens.json`. Sizes below are written as px; on a device they are dp (Android) and pt (iOS), and type sizes are sp.

**Key Characteristics:**
- Quiet neutrals; status color appears only where status is shown.
- Every state has a word, a shape and a color, never color alone.
- Solid fills only for Blocked and Stopped; calm states are tinted.
- One family, Atkinson Hyperlegible Next, with tabular numerals on every time.
- Flat tonal layering; shadows only on things that float over content.
- Native controls (tab bar, switches, share sheet) with MavRadar's tokens on top.

## Colors

Deep navy on warm paper for the interface, plus a locked five-color status set that never changes with a theme or style.

### Primary
- **Transit Navy** (#1B3A66): filled buttons (Directions when blocked, Turn on alerts), switch tracks when on, links. In dark mode it becomes **Night Navy** (#A9C4EC) with Night Platform text on it. White text on it is 11.4:1.

### Neutral
- **Ink Navy** (#13213A): primary text and icons on light surfaces.
- **Slate Ink** (#4B566A): secondary text, the city line, row values, captions.
- **Warm Paper** (#FBFAF7): the screen background. Slightly warm so it reads as paper, not as a white web page.
- **Platform Stone** (#F1EFE9): the raised surface, used for the tab bar and grouped areas.
- **Sheet White** (#FFFFFF): bottom sheets and the segmented control, one step lighter than the paper so they read as on top.
- **Selected Mist** (#DCE4F0): the selected tab indicator, selected chips and the pressed segment.
- **Tonal Mist** (#E8ECF3): tonal buttons (Directions when Clear, Share, Follow).
- **Track Sand** (#EAE7E0): switch tracks when off and the empty Today timeline.
- **Divider Sand** (#E3E0D8) and **Outline Sand** (#C8C4BA): hairlines between rows, and borders on outlined buttons, chips and the Demo badge.
- **Night Platform** (#0D1522), **Night Surface** (#152033), **Night Text** (#EEF2F8), **Night Secondary** (#AEB9CB): the dark-mode counterparts. Dark mode is first-class, not an inversion.

### Status (locked)
Same values in every color theme and every style. Markers, list icons and notification circles use the strong fill; the status card uses a tint for calm states and the strong color for Blocked and Stopped.
- **Clear Green-Teal** (#007A6E): Clear. Card tint #E0F2EF with #00594F text in light; #0E2A27 with #7FD9CC in dark.
- **Approaching Amber** (#F2A900): Approaching, always with a black (#1A1A1A) border and glyph, MUTCD style. Card tint #FFE8A3 with #5C3A00 text.
- **Blocked Red** (#C62828): Blocked. Solid card with white text (5.6:1); #8C1D18 in dark.
- **Stopped Dark Red** (#8E1B1B): Stopped. Solid card with white text and a striped band; #5E0F0F in dark.
- **Unknown Gray** (#6B7280): Unknown. Card tint #ECEEF1 with #3D4450 text and a dashed border.

### Named Rules
**The Status Is Sacred Rule.** Status colors mean status. Nothing else in the interface uses red, amber, teal-green or purple, and no color theme may put a brand surface or primary in those hues (chroma 0.2 or more). The only reuse is the Today timeline and History bars, which show past blockages. `theme.test.ts` enforces it.

**The Dark Until Needed Rule.** Only Blocked and Stopped earn a solid fill. A calm state that shouts teaches people to ignore the red one.

## Typography

**Body Font:** Atkinson Hyperlegible Next (with the platform sans-serif as fallback)
**Display Font:** the same family at 700
**Label/Mono Font:** none; times use the family's tabular numerals

**Character:** One family designed by the Braille Institute for low-vision readers, with letterforms that can't be confused (I, l, 1; 0, O). It reads as plain and trustworthy rather than branded, which is the point.

### Hierarchy
- **Display** (700, 48/52): the state word in the status card, "Blocked". Font scale capped at 1.1 so it never clips.
- **Headline** (600, 32/36, tabular): the duration on Blocked and Stopped, "12 min". Capped at 1.25.
- **Title** (600, 22/28): the crossing name in the screen header. **Title small** (600, 20/26) is the sheet name and the one-line state line on calm cards.
- **Body** (400, 16/24): explanations, row labels, the typical line.
- **Body small** (400, 14/20): secondary lines, row values, chips, segments, freshness.
- **Label** (500, 13/16, +0.2): the card kicker ("Train on crossing") and the Demo badge. Sentence case, never uppercase.
- **Label button** (600, 16/21) with a 13/17 sublabel; **Label nav** (500, 12/16); **Caption** (400, 13/18) for the disclaimer; **Axis** (400, 11/14) for chart axes.

### Named Rules
**The Weight Is the Family Rule.** Each weight is its own font file. Set the family for the weight and never `fontWeight`, or Android synthesizes bold on an already bold file.

**The Counting Up Rule.** Every time and duration uses tabular numerals and counts up ("Blocked for 7 min"). Nothing in the type system is ever set as a countdown.

## Layout

A single column, 20px from each edge, on a 4px grid. Screens are vertical stacks with 16px between sections and 6 to 12px inside them. The Status screen follows a fixed order: header (64), status card, explanation, Today timeline, three rows, then a flexible gap and the Directions button pinned 12px above the tab bar with the disclaimer under it. At 200% text the header, card and rows scroll and only the Directions button and tab bar stay pinned.

On tablets the content sits in a centered column at most 600px wide; the map stays full width. Phones stay portrait; iPad runs in every orientation.

**The One Decision Rule.** Every screen answers one question first. Status answers "can I go through?", and the action that follows (Directions) is always one tap away at the bottom.

## Elevation & Depth

Flat, tonal layering. Depth comes from surface steps (Warm Paper, Platform Stone, Sheet White in light; Night Platform, Night Surface in dark) and from hairline dividers, never from shadows on cards. A 45% black scrim (60% in dark) dims the screen behind modal sheets. The only shadow in the app is under the snackbar, because it floats over moving content.

### Shadow Vocabulary
- **Snackbar float** (`0 3px 8px rgba(0,0,0,0.2)`, Android elevation 6): the snackbar only.

### Named Rules
**The Flat By Default Rule.** Cards, rows and buttons sit flat on the page. If something needs to stand out, change its tone, not its height.

## Shapes

Soft, sturdy corners on everything people touch; hand-drawn geometry only where it carries meaning. Cards are 20px, buttons 16px, sheets 28px on the top edge, chips and the snackbar 8px, pills and the tab indicator fully round. The state icons are the one place shape is semantic: circle with check (Clear), diamond with a train (Approaching), rounded square with an X (Blocked), octagon with pause bars (Stopped), dashed circle with a question mark (Unknown). Unknown's dashed border and Stopped's 45 degree stripe band extend that language to the card itself. Every other icon comes from the platform: SF Symbols on iOS, Material Symbols on Android and web.

**The Shape Carries the State Rule.** A state must be readable in grayscale from its shape alone. Don't reuse the five state shapes for anything else.

## Components

Sturdy and unfussy: big targets, soft corners, flat fills, no ornament, like a well-made physical control.

### Buttons
- **Shape:** gently rounded (16px), 56px tall with optional icon and sublabel ("Directions" / "via West St underpass"); outline and text buttons are 48px.
- **Filled:** Transit Navy with white label. Used for the one action that matters now, such as Directions while blocked.
- **Tonal:** Tonal Mist with Ink Navy label. The same Directions button when Clear, so it is there but not urging.
- **Outline:** 1px Outline Sand border, transparent fill ("Open in Status").
- **Pressed:** 85% opacity. No hover; this is a touch app.

### Chips
- **Style:** 32px tall inside a 48px tap area, 8px corners, 1px Outline Sand border, Body small at 500.
- **Selected:** Selected Mist fill, no border, a leading check and 700 weight. Single choice, used for History's 7 and 30 day ranges and filters.

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** the status card is the only card; its fill comes from the locked status set (tinted or solid by state).
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** only Unknown, 2px dashed Unknown Gray.
- **Internal Padding:** 20px, 6px between lines. Blocked and Stopped hold a 288px minimum height; calm states size to their content.

### Inputs / Fields
- **Segmented control:** 40px tall (48px tap), 20px corners, 1px Outline Sand border on Sheet White, 1px dividers between segments. The selected segment fills with Selected Mist and gains a check.
- **Switches:** the native switch in a 48px row. On is Transit Navy, off is Track Sand. Never a status color.

### Rows
- **Info, switch and nav rows:** 48px minimum (72px with a description line), flat on the background, a hairline Divider Sand rule above each and below the last. Label in Body on the left, value in Body small Slate Ink on the right, chevron for navigation.
- **List row (Map > List):** 72px, 32px state icon, name, a secondary line with the state word in bold, a 48px star toggle. The whole row is the tap target.

### Navigation
- **Tab bar:** the platform's native tab bar (four tabs: Status, Map, History, Settings) on Platform Stone, with a 64 by 32 Selected Mist indicator on Android and system icons on both platforms. Labels always visible.
- **Header:** a static 64px title block, crossing name in Title with the city line under it, and on the right the Demo badge (while on demo data) next to a round 48px Tonal Mist Share button.

### Status Card (signature)
The heart of the app. Top to bottom: a 40px state icon, the kicker in Label, the state word in Display, then either the duration in Headline with "since 2:41 PM" on the same baseline (Blocked, Stopped) or a one-line state line (calm states). Blocked and Stopped add a typical line under a 35% hairline rule, with an 18px clock and a bold lead ("**Usually about 5 min** here"). The freshness line is pinned to the bottom: a pulsing dot with "Live · updated 8 s ago", or a hollow ring with "Updated 1 min ago · checking" when delayed. The card is a polite live region and cross-fades in 200ms on a state change.

### Bottom Sheet
Sheet White, 28px top corners, a 32 by 4 handle 10px from the top. The map sheet snaps between peek (120), half (440) and full; modal sheets close by tapping the scrim, Android back, or dragging the top down past 100px.

### Snackbar
Snackbar Navy with Night Text, 8px corners, 12px from the screen edges, 48px tall, optional bold "Undo" in Snackbar Action. Leaves after 4.5 seconds.

## Do's and Don'ts

### Do:
- **Do** pair every state with its word and its shape, in the card, on the map, in the list and in notifications.
- **Do** keep the Directions button pinned at the bottom of Status, filled when blocked and tonal when Clear.
- **Do** show freshness inside every status card, and switch to Unknown past 90 seconds without the last state word.
- **Do** read every color through `useTheme()` so dark mode and all five color themes stay correct together.
- **Do** keep touch targets at 48px, extending the hit area with padding or hitSlop when the visual is smaller.
- **Do** keep "Travel information only. Always obey crossing signals and gates." on every screen that shows status.

### Don't:
- **Don't** use red, amber, teal-green or purple for anything that isn't a crossing state, including brand surfaces, badges and charts.
- **Don't** give Clear, Approaching or Unknown a solid fill or the 288px card height.
- **Don't** put shadows on cards, rows or buttons.
- **Don't** set a hex value inside a component, or a `fontWeight` on brand text.
- **Don't** show a countdown, an arrival estimate or a progress bar that implies an end time.
- **Don't** draw custom icons where the platform has one; only the state shapes, map art and the star are hand-drawn.
- **Don't** uppercase labels or the state word.
