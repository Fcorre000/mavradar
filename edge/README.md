# edge

Python detection service for the field node. **Not started.**

It will run on a Raspberry Pi Zero 2 W next to an OmniPreSense OPS243-C radar (Doppler plus FMCW range, so it can see a stopped train), classify trains, and POST events to the ingest API in `server/`. While there is one node, it sits at the crossing, within radar range; a second node later means spacing the two out, one on each side (blueprint D4). Either way, at least 50 ft from the nearest rail.

Two rules from the handoff that shape the code:

- **The uplink is a swappable transport.** Detection produces an event; a transport layer ships it. No assumptions about WiFi vs Cat-M vs anything else.
- **Events survive dropouts.** A local SQLite buffer holds events until the ingest API acknowledges them. The node creates each event's `eventId` and keeps it with the event, so a retry after a lost ack is recognized as a repeat (blueprint OQ6). A 503 means "try again later".

Configuration comes from environment variables. See `.env.example`.

Read `docs/MAVRADAR_HANDOFF.md` and its amendments (latest: `docs/MAVRADAR_HANDOFF_AMENDMENT_003.md`) before starting here, then the design blueprint: `docs/artifacts/blueprint/08_design_class_diagrams.md` section 1 has the classes and `09_build_order.md` the tasks (E1 to E7).
