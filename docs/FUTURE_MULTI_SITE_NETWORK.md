# Future: Multi-Site Radar Network with Per-Crossing Subscriptions

**Status:** earmarked, not in scope for the 2026-2027 capstone.
**Purpose:** design v1 so this needs no architectural rewrite. Do not build it yet.

## The idea

Scale beyond one crossing. Users choose which crossings alert them, either by picking
manually or by letting the app decide from their location while driving.

## Verdict

The software scales easily and most of it already exists in the v1 design. The binding
constraint is not the network, it is **site acquisition**. Every additional crossing needs
a property owner 50+ feet from the rail who will host an unattended unit and, since
Amendment 001, supply its internet. That is a human problem that does not get cheaper with
engineering effort. One site is currently unsolved; ten sites is that problem ten times.

Per-site hardware is roughly a full BOM each: radar, Pi, power, enclosure, mounting, uplink.

## Part A: manual per-crossing subscriptions

Straightforward. The changes are small and mostly additive.

- Field units already authenticate individually, so every event can carry a `crossingId`
  without changing the device protocol.
- The Firestore token registry gains a `subscriptions: [crossingId]` array per device.
- The alert filter, which already handles quiet hours and radius, gains one more predicate.

Fan-out per event **drops** as crossings multiply, because each event targets a subset
rather than the whole user base. FCM multicast caps at 500 tokens per call, so a few
hundred students is one call. Even 10,000 users across 10 crossings is roughly 1,000 tokens
per event, or two batched calls. Latency is unaffected.

### The one real architectural consequence

v1 pushes first and writes Firestore after, so nothing blocks the notification. Subscription
filtering introduces a **read** before the push, which is exactly the thing that design
avoids.

Solve it with an in-memory subscription map on the Cloud Run instance. `min-instances=1`
already keeps a process warm, so it can hold the crossing-to-token map in memory and keep a
Firestore snapshot listener open to update it as registrations change. The hot path stays at
zero I/O before the multicast.

**Design v1 accordingly:** put the token registry behind a small interface rather than
querying Firestore inline in the request handler. That single decision is what makes this
feature additive later instead of surgical.

## Part B: geolocation auto-selection

**This reduces to Part A.** Auto-selection is a client-side mechanism that writes the same
`subscriptions` array a manual picker would. The server does not change at all.

### Do not copy Life360's approach

Life360 does continuous background location. That costs battery, triggers iOS's recurring
"has been using your location in the background" prompt with a map of everywhere the user
has been, draws App Store review scrutiny, and puts you in possession of student location
traces. For a safety app that students must keep installed and permitted, that is a bad
trade, and the privacy posture alone is a burden a public-repo university project should
not take on.

### Use geofencing instead

Register a region around each crossing. The OS monitors it at the system level and wakes the
app only on enter or exit. Battery cost is near zero and no location history is stored or
transmitted. On enter, subscribe to that crossing; on exit, unsubscribe.

Confirmed available in `expo-location` on SDK 57:

- `startGeofencingAsync(taskName, regions)`, `stopGeofencingAsync`, `hasStartedGeofencingAsync`
- **iOS: 20 simultaneously monitored regions.** Far beyond any realistic scope here.
- **Android: 100 active geofences per app.**
- Requires a development build. Does not work in Expo Go.

If the 20-region iOS cap were ever reached, the standard pattern is to register the 20
nearest crossings and re-register as the user moves.

### Native config this will require

```json
["expo-location", {
  "isIosBackgroundLocationEnabled": true,
  "isAndroidBackgroundLocationEnabled": true
}]
```

Plus `NSLocationAlwaysAndWhenInUseUsageDescription`, `location` in `UIBackgroundModes`, and
on Android both `ACCESS_FINE_LOCATION` and `ACCESS_BACKGROUND_LOCATION`. iOS needs "Always"
authorization via `requestBackgroundPermissionsAsync`.

**Recommendation: leave this out of the v1 native config batch.** The EAS free tier allows
15 iOS builds a month and this costs exactly one extra rebuild whenever the feature lands.
That is cheaper than declaring a sensitive background capability the app does not use,
which invites App Store review questions and makes the permission story harder to explain.

## Why Part B is a safety feature, not a convenience

More crossings means more alerts per user. iOS asks once whether to keep Time Sensitive
alerts from an app, and a single irrelevant alert can burn that channel permanently for that
user. A student subscribed to five crossings receives five times the notifications and has
five times the chance of getting one that does not apply to them.

Geofenced auto-subscription makes irrelevant alerts structurally impossible: you are only
subscribed while you are physically near the crossing. At multi-site scale this stops being
a nicety and becomes the mechanism that protects the notification channel.

## Capstone relevance

Extensibility is one of the eighteen required design constraint categories in the SRS. This
is a concrete answer to it: additional crossings require a new field unit and a crossing ID,
with no architectural change. Cite it there. Keep it out of core scope in the project
charter, where it belongs under future work.
