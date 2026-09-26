# server

FastAPI ingest and fan-out service on Cloud Run (`us-central1`, `min-instances=1`). **Not started.**

The hot path: authenticate the node, validate the event, assign an `eventId`, run the alert filter, send the push through FCM HTTP v1 token multicast, then write to Firestore. The push always goes first; the Firestore write never blocks it.

Things to carry over from the handoff when this starts:

- Every FCM message sets `android.priority: "high"` and `android.notification.channel_id`. Only real train events go on `train-alerts`; everything else goes on `service-status`.
- Subscriptions are served from an in-memory crossing-to-token map kept fresh by a Firestore snapshot listener, so there is no read before the push.
- The FCM service account key is generated only once this service exists, and never committed.

Configuration comes from environment variables. See `.env.example`.

Read `docs/MAVRADAR_HANDOFF.md` and its amendments (latest: `docs/MAVRADAR_HANDOFF_AMENDMENT_003.md`) before starting here.
