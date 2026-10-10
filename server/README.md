# server

FastAPI ingest and fan-out service on Cloud Run (`us-central1`, `min-instances=1`, `max-instances=1`, request-based billing). **Not started.**

The hot path: authenticate the node, validate the event, check its `eventId` (the node creates it) against the event log, run the alert filter, send the push through FCM HTTP v1 token multicast, write to Firestore, then acknowledge the node. The push always goes first; the Firestore write never blocks it. If the writes fail, the node gets a 503 and resends, and the event log makes sure the second try skips the push.

Request-based billing gives CPU only during a request, so nothing runs in the background. Blockage checks at 1, 3 and 5 minutes are Cloud Tasks, and two Cloud Scheduler jobs call `/tasks/check-nodes` and `/tasks/sync-devices` once a minute (blueprint D5).

Things to carry over from the handoff when this starts:

- Every FCM message sets `android.priority: "high"` and `android.notification.channel_id`. Only real train events go on `train-alerts`; everything else goes on `service-status`.
- Subscriptions are served from an in-memory crossing-to-token map, synced once a minute from the device documents that changed, so there is no read before the push. A new follow can take up to a minute to reach the server.
- The FCM service account key is generated only once this service exists, and never committed.

Configuration comes from environment variables. See `.env.example`.

Read `docs/MAVRADAR_HANDOFF.md` and its amendments (latest: `docs/MAVRADAR_HANDOFF_AMENDMENT_003.md`) before starting here, then the design blueprint: `docs/artifacts/blueprint/08_design_class_diagrams.md` sections 2 and 4 have the classes and the shared contract, and `09_build_order.md` the tasks (S1 to S7).
