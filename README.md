# MavRadar

Real-time alerts for freight trains blocking grade crossings, starting with the Center St crossing near the University of Texas at Arlington.

## The problem

A freight train sitting across a grade crossing blocks everyone on that road: commuters, students, and ambulances and fire trucks trying to get through. Detours usually exist, but they only help if you know about the train *before* you commit to the road. By the time you can see the train, you are already stuck behind it.

The first site is Center St at UTA, where trains regularly make students late for class and the West St underpass is the way around. The system is built so any city, emergency dispatch center, or campus with a blocked-crossing problem could run it at their own crossings.

No public real-time freight train position data exists. Class I railroads treat movement data as proprietary, and the shipper-facing APIs track individual railcars, not "is there a train at this crossing right now." So the system detects trains directly.

## How it works

Radar nodes sit about 550 m down the track on each side of the crossing. A 24GHz radar (Doppler plus FMCW range, so it also sees a train that has stopped) detects the train and a small solar-powered computer pushes an event to a cloud backend, which fans out push notifications to a mobile app. Placing the nodes down the track, instead of at the crossing, is what buys enough warning to divert.

```
radar -> Pi Zero 2 W -> uplink -> ingest API -> alert filter -> FCM -> phone
```

Crossings are identified by their USDOT crossing ID, and every blockage is logged, so the same backend serves one crossing or many.

## Repo layout

| Path | What's in it |
|---|---|
| `app/` | Expo (React Native) mobile app. Android first, iOS to follow |
| `edge/` | Python detection service for the field node |
| `server/` | FastAPI ingest and fan-out service, deployed to Cloud Run |
| `docs/` | Architecture handoff and amendments, course constraints |
| `firestore.rules` | Firestore security rules, deployed with the Firebase CLI |

## Status

Hardware selected, radar not yet ordered. App setup done (push, anonymous auth, device registration); detection service and backend not started. See `docs/` for the architecture writeup and its amendments.

Roadmap:

- [ ] Field unit assembled and bench tested
- [ ] Deployed in log-only mode, detection reliability measured
- [ ] Historical pattern layer over 100+ logged train passes
- [ ] Push notifications live, v1 app shipped

## Legal and siting

The radar is FCC Part 15 certified and requires no license. Each node is mounted on private property with written permission from the owner, at least 50 feet from the nearest rail, outside all railroad right of way. Exact deployment coordinates are deliberately not in this repository.

## Running it

Each subdirectory has its own README with setup instructions. Every service reads its configuration from environment variables. See `.env.example` in each directory for the required keys.

No credentials, service account files, or signing keys are committed to this repository.

## License

MIT, see `LICENSE`.