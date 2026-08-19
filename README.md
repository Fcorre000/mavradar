# UTA Train Alert

Real-time alerts for freight trains blocking the Center St grade crossing near the University of Texas at Arlington.

## The problem

Freight trains regularly block Center St long enough to make students late for class. A viable alternate route exists (the West St underpass), but it only helps if you know about the train *before* you commit to the Center St corridor. By the time you can see the train, you are already stuck behind it.

No public real-time freight train position data exists. Class I railroads treat movement data as proprietary, and the shipper-facing APIs track individual railcars, not "is there a train at this crossing right now." So the system detects trains directly.

## How it works

A 24GHz doppler radar unit near the crossing detects an approaching train and pushes an event to a cloud backend, which fans out push notifications to a mobile app. Students get 30 to 45 seconds of warning, roughly the same window the crossing gates give drivers, which is enough to divert.

```
radar -> Raspberry Pi -> LTE -> ingest API -> alert filter -> FCM/APNs -> phone
```

## Repo layout

| Path | What's in it |
|---|---|
| `app/` | Expo (React Native) mobile app, iOS and Android |
| `edge/` | Python detection service running on the Raspberry Pi |
| `server/` | FastAPI ingest and fan-out service, deployed to Cloud Run |
| `docs/` | Architecture notes, hardware BOM, site survey, permissions |

## Status

Hardware selected, ordering in progress. See `docs/` for the full bill of materials and the architecture writeup.

Roadmap:

- [ ] Field unit assembled and bench tested
- [ ] Deployed in log-only mode, detection reliability measured
- [ ] Historical pattern layer over 100+ logged train passes
- [ ] Push notifications live, v1 app shipped

## Legal and siting

The radar is FCC Part 15 certified and requires no license. The device is mounted on private property with written permission from the owner, at least 50 feet from the nearest rail, outside all railroad right of way. Exact deployment coordinates are deliberately not in this repository.

## Running it

Each subdirectory has its own README with setup instructions. Every service reads its configuration from environment variables. See `.env.example` in each directory for the required keys.

No credentials, service account files, or signing keys are committed to this repository.

## License

MIT