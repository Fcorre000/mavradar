# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

UTA commuters who drive near the Center St crossing in Arlington, TX. They check MavRadar before leaving, glance at it en route (at a red light, never while moving), and get pushed an alert when a crossing they follow is blocked. Their job is one decision: go through Center St, or take the West St underpass.

City staff and emergency dispatch are a later audience (blueprint D3, deferred). Design for commuters now without closing that door.

## Product Purpose

MavRadar tells you, in real time, whether a freight train is blocking a grade crossing, so you can divert before you're stuck. Success this year means real students relying on it: published on Google Play and trusted by UTA commuters once the field node is live.

## Positioning

No public freight train position data exists, so MavRadar detects trains itself: a 24 GHz radar node at the crossing reports what it sees, and the app says how fresh that report is. It never guesses. When the data can't back a state, it says Unknown.

## Operating Context

- Checked in seconds: before a drive, at a light, or from a notification on the lock screen. Often in a car, in daylight or glare, one-handed.
- The decision is binary and time-sensitive: wait, or detour. The detour (West St underpass) opens in the phone's own maps app.
- Alerts arrive while the app is closed and must stand on their own in a single line.
- Until the server is live the app runs on clearly labeled demo data ("Demo").

## Capabilities and Constraints

- Screens: Status (one crossing's live state, freshness, today's blockages, detour), Map with a List alternative, History (7 and 30 days, busiest hours), Settings.
- Following a crossing turns on push alerts: Blocked, Stopped, Cleared. Approaching alerts stay off while the single node sits at the crossing, because it sees a train only seconds ahead (blueprint D4, OQ19).
- Alert preferences: alert types, minimum blockage time, commute windows, quiet hours, mute today.
- Also: share a crossing's status as plain text; color themes; mode (system, light, dark).
- States, always these words: Clear, Approaching, Blocked, Stopped, Unknown. Freshness: Live, Delayed. A crossing is "followed"; the alternative route is the "detour".
- One field node at Center St for now; a second, spaced-out pair later. One crossing live; the design must scale to many.
- Android first; iOS waits on Apple Developer enrollment. Expo (React Native) app, built with EAS cloud builds, with a monthly build budget, so native changes are batched.
- The train-alerts notification channel carries only real train events; everything else uses service-status.
- Never commit or display the node's exact mounting location.
- Undecided: the iOS push path; when alerts switch on publicly (after the log-only weeks); the city-facing product.

## Brand Commitments

- Name: MavRadar (for the UT Arlington Mavericks).
- Voice: plain, calm and honest. Sentence case. Durations count up, never down; no arrival predictions. Copy avoids em dashes.
- Every screen that shows status keeps the line "Travel information only. Always obey crossing signals and gates."
- The approved design direction and its tokens live in `docs/design/` (SPECS.md, tokens.json) and on the design canvas. Crossing status colors, shapes and words are a safety system and never change with a theme or style.

## Evidence on Hand

- No real users, no deployed sensor, and no usage data yet. Do not invent testimonials, ratings, accuracy figures, user counts or press.
- Real assets: the app icon (`docs/design/icon/`), the approved design canvas, `docs/design/SPECS.md`, the design blueprint (`docs/artifacts/blueprint/`), and the design audit (`docs/design/audit/AUDIT.md`).
- History and status in the app are simulated until the server writes live data.

## Product Principles

1. **Trust over coverage.** Never show a state the data can't back. Unknown beats a stale guess, and every state shows how fresh it is.
2. **A glance is the whole interaction.** Blocked or clear, and what to do about it, readable in two seconds; the detour is one tap away. Nothing asks for attention while someone drives.
3. **Quiet until it matters.** Alerts only for train events the person asked for, worded to stand alone. The urgent channel is never spent on anything else.
4. **Private by default.** No account, no location, only an anonymous device token.
5. **Native on each phone.** Android feels like an Android app and iPhone like an iOS app, with MavRadar's brand on top.

## Accessibility & Inclusion

- WCAG AA contrast in light and dark; touch targets at least 48 dp (44 pt on iOS).
- State is never carried by color alone: word, shape and color together, so it survives color blindness and sun glare.
- Text scales to 200%; screen readers get a full sentence for each state and a live announcement when it changes; reduced motion is honored.
- The design must not encourage use while driving: glanceable at a stop, alerts readable without opening the app.
