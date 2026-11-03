"""AlertPolicy and SubscriptionMap: the rule list, its order, and who ends up with the alert."""

from app.contract import AlertMode, AlertTypesDoc
from app.domain.crossing_state import AlertKind
from app.repositories.memory import MemoryAlertLog
from app.services.alert_policy import HOT_PATH_RULES, AlertPolicy
from app.services.alert_rules import (
    AlertModeRule,
    AlertTypeRule,
    CommuteWindowRule,
    LatenessRule,
    LogOnlyRule,
    QuietHoursRule,
    ToldAlreadyRule,
)
from app.services.notifications import Channel
from app.services.subscriptions import Device, SubscriptionMap
from tests.helpers import CROSSING, context, device

K = AlertKind
TOLD_BLOCKED = {"token-a": frozenset({K.BLOCKED}), "token-b": frozenset({K.BLOCKED})}


def followed_by(*devices: Device) -> SubscriptionMap:
    subscriptions = SubscriptionMap()
    for d in devices:
        subscriptions.upsert(d.token, d.doc)
    return subscriptions


def test_rule_order() -> None:
    # Crossing-wide rules first, so a crossing in logOnly checks nothing per device.
    assert [type(rule) for rule in HOT_PATH_RULES] == [
        AlertModeRule,
        LogOnlyRule,
        LatenessRule,
        AlertTypeRule,
        QuietHoursRule,
        CommuteWindowRule,
        ToldAlreadyRule,
    ]


def test_followers_who_pass_every_rule_get_it_on_train_alerts() -> None:
    no_cleared = AlertTypesDoc(approaching=False, blocked=True, stopped=True, cleared=False)
    policy = AlertPolicy(followed_by(device("token-a"), device("token-b", alert_types=no_cleared)))

    recipients = policy.recipients(context(K.CLEARED, told=TOLD_BLOCKED))

    assert recipients.tokens == ["token-a"]
    assert recipients.channel is Channel.TRAIN_ALERTS


def test_blocked_waits_for_the_blockage_checks() -> None:
    policy = AlertPolicy(followed_by(device("token-a")))

    assert policy.recipients(context(K.BLOCKED)).tokens == []


def test_log_only_crossing_reaches_nobody() -> None:
    policy = AlertPolicy(followed_by(device("token-a")))

    assert (
        policy.recipients(context(K.CLEARED, alert_mode=AlertMode.LOG_ONLY, told=TOLD_BLOCKED)).tokens == []
    )


def test_until_s5_sends_blocked_nobody_is_told_so_cleared_reaches_nobody() -> None:
    policy = AlertPolicy(followed_by(device("token-a")))

    assert policy.recipients(context(K.CLEARED, told=MemoryAlertLog().who_was_told(CROSSING))).tokens == []


def test_only_followers_of_this_crossing() -> None:
    elsewhere = device("token-c").doc.model_copy(update={"subscriptions": ["123456A"]})
    subscriptions = followed_by(device("token-a"))
    subscriptions.upsert("token-c", elsewhere)

    assert [d.token for d in subscriptions.followers(CROSSING)] == ["token-a"]


def test_upsert_replaces_a_devices_follows() -> None:
    subscriptions = followed_by(device("token-a"))

    subscriptions.upsert("token-a", device("token-a").doc.model_copy(update={"subscriptions": []}))

    assert subscriptions.followers(CROSSING) == []


def test_drop_removes_dead_tokens() -> None:
    subscriptions = followed_by(device("token-a"), device("token-b"))

    subscriptions.drop(["token-a", "never-seen"])

    assert [d.token for d in subscriptions.followers(CROSSING)] == ["token-b"]


def test_alert_log_forgets_on_close() -> None:
    log = MemoryAlertLog()
    log.mark_told(CROSSING, ["token-a"], K.BLOCKED)
    log.mark_told(CROSSING, ["token-a"], K.STOPPED)

    assert log.who_was_told(CROSSING) == {"token-a": frozenset({K.BLOCKED, K.STOPPED})}
    log.close_blockage(CROSSING)
    assert log.who_was_told(CROSSING) == {}
