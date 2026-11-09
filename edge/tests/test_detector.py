"""The Detector end to end: each synthetic log produces exactly the CrossingEvents in blueprint 06's
table (and tests/data/README.md), and nothing for the truck, the empty track, or OmniPreSense's
real bike and walker recordings. Then the details: event fields, the clear hold, faults, OC."""

import logging
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import pytest

from mavradar_edge.contract import CrossingEvent, ReportedState
from mavradar_edge.detector.background import BackgroundMap
from mavradar_edge.detector.detector import CLASSIFIER_VERSION, Detector
from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.radar.omnipresense import RecordingSource
from mavradar_edge.radar.replay import ReplaySource
from mavradar_edge.radar.source import (
    Distance,
    OcReport,
    RadarSource,
    RangeFrame,
    RangeReport,
    Reading,
    Speed,
    SpeedReport,
)

R = ReportedState
DATA = Path(__file__).parent / "data"
RECORDINGS = DATA / "omnipresense"
START = datetime(2026, 11, 9, 14, 0, tzinfo=UTC)
S = DetectorSettings()
MAP = BackgroundMap.from_frames(list(ReplaySource(DATA / "empty_track.jsonl", speed=0).range_frames(1e9)))


def detector(log_only: bool = True) -> Detector:
    return Detector(
        node_id="node-a",
        crossing_id="794980D",
        log_only=log_only,
        background=MAP,
        settings=S,
        time_of=lambda t: START + timedelta(seconds=t),
    )


def run(readings: Iterable[Reading], d: Detector | None = None) -> list[CrossingEvent]:
    d = d or detector()
    return [event for reading in readings if (event := d.on_reading(reading)) is not None]


def changes(events: list[CrossingEvent]) -> list[tuple[ReportedState, ReportedState]]:
    return [(e.from_state, e.to_state) for e in events]


def log(name: str) -> RadarSource:
    return ReplaySource(DATA / f"{name}.jsonl", speed=0)


# End to end


def test_the_passing_train() -> None:
    assert changes(run(log("train_passing").readings())) == [
        (R.CLEAR, R.APPROACHING),
        (R.APPROACHING, R.BLOCKED),
        (R.BLOCKED, R.CLEAR),
    ]


def test_the_stopping_train() -> None:
    assert changes(run(log("train_stopping").readings())) == [
        (R.CLEAR, R.APPROACHING),
        (R.APPROACHING, R.BLOCKED),
        (R.BLOCKED, R.STOPPED),
        (R.STOPPED, R.BLOCKED),  # moving again, never straight to clear
        (R.BLOCKED, R.CLEAR),
    ]


@pytest.mark.parametrize("name", ["truck", "empty_track"])
def test_no_events_for_the_truck_or_the_empty_track(name: str) -> None:
    assert run(log(name).readings()) == []


@pytest.mark.skipif(not any(RECORDINGS.glob("*.txt")), reason="run scripts/fetch_recordings.py")
@pytest.mark.parametrize("path", sorted(RECORDINGS.glob("*.txt")), ids=lambda p: p.stem)
def test_no_events_for_the_real_bikes_and_walker(path: Path) -> None:
    assert run(RecordingSource(path).readings()) == []


# Every event


@pytest.mark.parametrize("log_only", [True, False])
def test_every_event_has_a_new_id_and_the_log_only_flag_from_config(log_only: bool) -> None:
    events = run(log("train_stopping").readings(), detector(log_only))

    assert len({e.event_id for e in events}) == len(events)
    assert all(UUID(e.event_id) for e in events)
    assert all(e.log_only is log_only for e in events)
    assert all(e.node_id == "node-a" and e.crossing_id == "794980D" for e in events)
    assert all(e.classifier_version == CLASSIFIER_VERSION for e in events)


def test_every_event_is_valid_by_the_contract() -> None:
    for event in run(log("train_stopping").readings()):
        assert CrossingEvent.from_dict(event.to_dict()) == event


def test_approaching_and_blocked_carry_the_trains_speed() -> None:
    approaching, blocked, *_ = run(log("train_passing").readings())

    assert approaching.train is not None and approaching.train.speed_mps == pytest.approx(11, abs=0.5)
    assert blocked.train is not None


def test_a_clear_is_dated_when_the_train_left_not_when_it_was_confirmed() -> None:
    clear = run(log("train_passing").readings())[-1]
    readings = list(log("train_passing").readings())
    last_motion = max(r.t for r in readings if isinstance(r, SpeedReport))

    # About the 3 s gap allowance after the last car, not that plus the 10 s hold.
    after_last_motion = (clear.occurred_at - START).total_seconds() - last_motion
    assert S.gap_s <= after_last_motion < S.gap_s + 1


# The clear hold


def train_then(gap_s: float, then: float, quiet_s: float = 30) -> list[Reading]:
    """A train present for 12 s, a gap with nothing at all, then (optionally) more train, then
    `quiet_s` of an empty crossing."""
    readings: list[Reading] = []
    t = 100.0
    while t < 112:
        readings += [SpeedReport(t, (Speed(-11, 90),)), RangeReport(t, (Distance(20.5, 90),))]
        t += 0.2
    t += gap_s
    while t < 112 + gap_s + then:
        readings += [SpeedReport(t, (Speed(-11, 90),)), RangeReport(t, (Distance(20.5, 90),))]
        t += 0.2
    end = t + quiet_s
    while t < end:  # then quiet: nothing moving, empty band frames
        readings.append(RangeFrame(t, 1.0, MAP.normal))
        t += 0.5
    return readings


def test_a_gap_between_cars_doesnt_clear() -> None:
    events = run(train_then(gap_s=6, then=5))

    assert changes(events) == [(R.CLEAR, R.APPROACHING), (R.APPROACHING, R.BLOCKED), (R.BLOCKED, R.CLEAR)]


def test_the_clear_waits_for_the_hold() -> None:
    assert changes(run(train_then(gap_s=0, then=0, quiet_s=9)))[-1] == (R.APPROACHING, R.BLOCKED)
    assert changes(run(train_then(gap_s=0, then=0, quiet_s=15)))[-1] == (R.BLOCKED, R.CLEAR)


# Faults


def test_silence_is_sensor_offline_and_recovery_reports_what_it_sees() -> None:
    d = detector()
    run(log("truck").readings(), d)

    offline = d.tick(200)
    assert offline is not None and (offline.from_state, offline.to_state) == (R.CLEAR, R.SENSOR_OFFLINE)
    assert d.tick(201) is None  # only once

    back = d.on_reading(RangeFrame(202, 1.0, MAP.normal))
    assert back is not None and (back.from_state, back.to_state) == (R.SENSOR_OFFLINE, R.CLEAR)


def test_recovery_on_a_stopped_train_reports_stopped() -> None:
    d = detector()
    d.on_reading(RangeFrame(100, 1.0, MAP.normal))
    d.tick(120)
    stopped_train = tuple(88.0 if 18 <= i <= 22 else v for i, v in enumerate(MAP.normal))

    back = d.on_reading(RangeFrame(121, 1.0, stopped_train))

    assert back is not None and back.to_state is R.STOPPED


def test_no_fault_while_readings_keep_coming() -> None:
    d = detector()
    d.on_reading(RangeFrame(100, 1.0, MAP.normal))

    assert d.tick(109) is None


# The OC double-check


def oc(start: float, end: float, length_m: float) -> OcReport:
    seconds = end - start
    return OcReport(end, False, start, end, round(seconds * 1000), 11, 10, 120, 90, 50, 4.5, length_m, 0.1)


def test_agreeing_oc_reports_log_nothing(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING):
        run(log("train_stopping").readings())
        run(log("truck").readings())

    assert "OC disagrees" not in caplog.text


def test_a_long_oc_report_with_no_call_is_a_likely_miss(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.WARNING):
        run([RangeFrame(100, 1.0, MAP.normal), oc(100, 240, 1500)])

    assert "likely miss" in caplog.text


def test_a_short_oc_report_during_a_call_is_a_likely_false_alarm(caplog: pytest.LogCaptureFixture) -> None:
    readings = [r for r in log("train_passing").readings() if not isinstance(r, OcReport)]
    call_time = 125.0
    with caplog.at_level(logging.WARNING):
        run([*(r for r in readings if r.t <= call_time), oc(124, 125.5, 20)])

    assert "likely false alarm" in caplog.text
