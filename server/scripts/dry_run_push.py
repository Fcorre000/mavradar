"""Check both kinds of message against real FCM, in dry run. Run from server/:

    gcloud auth application-default login        # once, if you haven't
    uv run python -m scripts.dry_run_push <FCM token from your Android dev build>

Always dry run, whatever MAVRADAR_FCM_DRY_RUN says: FCM validates the token and each message fully,
and nothing reaches the phone. "delivered" means FCM would have delivered it.
"""

import asyncio
import sys
from datetime import UTC, datetime

from app.config import Settings
from app.domain.crossing_state import AlertKind
from app.services.notifications import Channel, FirebaseFcmClient, NotificationService, Push, alert_push


async def main(token: str) -> None:
    service = NotificationService(FirebaseFcmClient(Settings().firebase_project_id, dry_run=True))
    pushes = [
        alert_push(AlertKind.CLEARED, "794980D", datetime.now(UTC), Channel.TRAIN_ALERTS),
        Push("Dry run check", "Not sent to the phone.", {"crossingId": "794980D"}, Channel.SERVICE_STATUS),
    ]
    for push in pushes:
        report = await service.send(push, [token])
        outcome = "delivered" if report.delivered else "dead token" if report.dead else "failed"
        print(f"{push.channel}: {outcome} (token ...{token[-6:]})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: uv run python -m scripts.dry_run_push <fcm-token>")
    asyncio.run(main(sys.argv[1]))
