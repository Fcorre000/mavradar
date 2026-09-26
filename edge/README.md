# edge

Python detection service for the field node. **Not started.**

It will run on a Raspberry Pi Zero 2 W next to an OmniPreSense OPS243-C radar (Doppler plus FMCW range, so it can see a stopped train), classify trains, and POST events to the ingest API in `server/`. Nodes sit roughly 550 m down the track from the crossing, at least 50 ft from the nearest rail.

Two rules from the handoff that shape the code:

- **The uplink is a swappable transport.** Detection produces an event; a transport layer ships it. No assumptions about WiFi vs Cat-M vs anything else.
- **Events survive dropouts.** A local SQLite buffer holds events until the ingest API acknowledges them.

Configuration comes from environment variables. See `.env.example`.

Read `docs/MAVRADAR_HANDOFF.md` and its amendments (latest: `docs/MAVRADAR_HANDOFF_AMENDMENT_003.md`) before starting here.
