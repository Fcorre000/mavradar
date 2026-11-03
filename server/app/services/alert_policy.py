"""AlertPolicy: which followers get an alert, and on which channel (SD2 messages 15 to 18)."""

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.crossing_state import AlertKind
from app.services.alert_rules import (
    AlertContext,
    AlertModeRule,
    AlertRule,
    AlertTypeRule,
    CommuteWindowRule,
    LatenessRule,
    LogOnlyRule,
    QuietHoursRule,
    ToldAlreadyRule,
)
from app.services.subscriptions import SubscriptionMap

# Only ever carries a real train event: the user owns its importance after the first one.
TRAIN_ALERTS_CHANNEL = "train-alerts"

# Rules that are the same for every device come first, so a crossing in logOnly checks nothing else.
HOT_PATH_RULES: tuple[AlertRule, ...] = (
    AlertModeRule(),
    LogOnlyRule(),
    LatenessRule(),
    AlertTypeRule(),
    QuietHoursRule(),
    CommuteWindowRule(),
    ToldAlreadyRule(),
)


@dataclass(frozen=True)
class Recipients:
    tokens: list[str]
    channel: str


class AlertPolicy:
    def __init__(self, subscriptions: SubscriptionMap, rules: Sequence[AlertRule] = HOT_PATH_RULES) -> None:
        self._subscriptions = subscriptions
        self._rules = rules

    def recipients(self, ctx: AlertContext) -> Recipients:
        if ctx.kind is AlertKind.BLOCKED:
            # Blocked waits for each device's minimum blockage time, so it goes out from the
            # 1, 3 and 5 minute checks (SD4, S5), never from the event itself.
            return Recipients([], TRAIN_ALERTS_CHANNEL)
        tokens = [
            device.token
            for device in self._subscriptions.followers(ctx.crossing_id)
            if all(rule.allows(device, ctx) for rule in self._rules)
        ]
        return Recipients(tokens, TRAIN_ALERTS_CHANNEL)
