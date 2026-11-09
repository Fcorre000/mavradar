"""The track builder and the rule-based classifier: each rule alone, then every synthetic log and
OmniPreSense's real bike and walker recordings run through them."""

from pathlib import Path

import pytest

from mavradar_edge.detector.classifier import RuleBasedClassifier, Verdict, oc_says_train
from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.detector.track import Track, TrackBuilder
from mavradar_edge.radar.omnipresense import RecordingSource
from mavradar_edge.radar.replay import ReplaySource
from mavradar_edge.radar.source import Distance, OcReport, RadarSource, RangeReport, Speed, SpeedReport

S = DetectorSettings()
V = Verdict
DATA = Path(__file__).parent / "data"
RECORDINGS = DATA / "omnipresense"


def speed(t: float, mps: float = 11.0, magnitude: float = 90.0) -> SpeedReport:
    return SpeedReport(t, (Speed(mps, magnitude),))


def band(t: float, m: float = 20.5, magnitude: float = 90.0) -> RangeReport:
    return RangeReport(t, (Distance(m, magnitude), Distance(8.0, 40.0)))


def build(*readings: SpeedReport | RangeReport) -> Track | None:
    builder = TrackBuilder(S)
    track = None
    for reading in readings:
        track = builder.add(reading)
    return track


def verdict(*readings: SpeedReport | RangeReport) -> Verdict:
    track = build(*readings)
    return RuleBasedClassifier(S).classify(track) if track else V.NOT_A_TRAIN


def steady(seconds: float, mps: float = 11.0, every: float = 0.2) -> list[SpeedReport]:
    return [speed(i * every, mps) for i in range(int(seconds / every) + 1)]


# The track


def test_weak_echoes_never_start_a_track() -> None:
    assert build(speed(0, magnitude=25), speed(0.2, magnitude=30)) is None  # birds


def test_a_gap_between_cars_keeps_the_track() -> None:
    track = build(speed(0), speed(2.5), speed(5.0))  # 2.5 s gaps, under the 3 s limit

    assert track is not None and track.duration_s == 5.0


def test_a_longer_gap_ends_it() -> None:
    track = build(speed(0), speed(1), speed(5))  # 4 s gap

    assert track is not None and track.start_t == 5


def test_the_strongest_object_above_the_floor_counts() -> None:
    builder = TrackBuilder(S)
    track = builder.add(SpeedReport(0, (Speed(1.3, 300.0), Speed(11.0, 90.0))))

    assert track is not None and track.speeds_mps == [1.3]  # strongest first, as the radar lists them


def in_band(*readings: SpeedReport | RangeReport) -> bool:
    track = build(*readings)
    return track is not None and track.in_band(S.band_window_s)


def test_the_track_band_counts_only_strong_echoes_inside_it() -> None:
    assert not in_band(speed(0), band(0.1, m=25))  # the road, past the rail
    assert not in_band(speed(0), band(0.1, magnitude=20))  # too weak
    assert in_band(speed(0), band(0.1))


def test_one_dropped_band_reading_doesnt_lose_the_train() -> None:
    track = build(band(0), *steady(4)[1:])  # last in band at 0 s, now 4 s: inside the 5 s window

    assert track is not None and track.in_band(S.band_window_s)


# The rules


def test_present_needs_duration_speed_and_the_band() -> None:
    assert verdict(*steady(10), band(10)) is V.TRAIN_PRESENT


@pytest.mark.parametrize(
    "readings",
    [
        [*steady(9), band(9)],  # too short: a truck
        [*steady(10, mps=1.3), band(10)],  # too slow: a walker
        steady(10, mps=-11),  # never in the band, never toward
    ],
    ids=["too short", "too slow", "off the track"],
)
def test_present_fails_if_any_one_is_missing(readings: list[SpeedReport | RangeReport]) -> None:
    assert verdict(*readings) is not V.TRAIN_PRESENT


def test_strength_alone_never_makes_a_train() -> None:
    loud = [SpeedReport(i * 0.2, (Speed(0.5, 900.0),)) for i in range(60)]  # 12 s, very strong, slow

    assert verdict(*loud, band(12)) is V.NOT_A_TRAIN


def test_approaching_needs_duration_speed_and_toward() -> None:
    assert verdict(*steady(4)) is V.TRAIN_APPROACHING
    assert verdict(*steady(3)) is V.NOT_A_TRAIN
    assert verdict(*steady(4, mps=-11)) is V.NOT_A_TRAIN  # moving away


def test_a_train_reaching_the_crossing_stays_approaching_until_confirmed() -> None:
    # At the crossing it moves across, not toward the radar, but it is in the band.
    assert (
        verdict(*steady(4), *(speed(4 + i * 0.2, -11) for i in range(1, 15)), band(6.8))
        is V.TRAIN_APPROACHING
    )


# The OC double-check


def oc(seconds: float, length_m: float) -> OcReport:
    return OcReport(0, False, 0, seconds, round(seconds * 1000), 11, 10, 120, 90, 50, 4.5, length_m, 0.1)


def test_oc_says_train_only_when_long_in_view_and_long() -> None:
    assert oc_says_train(oc(138, 1559), S)
    assert not oc_says_train(oc(1.6, 21), S)  # a truck
    assert not oc_says_train(oc(60, 50), S)  # slow and short: something lingering, not a train


# Every log and recording through track and classifier


def verdicts(source: RadarSource) -> list[Verdict]:
    builder, classifier = TrackBuilder(S), RuleBasedClassifier(S)
    seen: list[Verdict] = []
    for reading in source.readings():
        track = builder.add(reading)
        v = classifier.classify(track) if track else V.NOT_A_TRAIN
        if not seen or seen[-1] is not v:
            seen.append(v)
    return seen


def oc_results(name: str) -> list[bool]:
    source = ReplaySource(DATA / f"{name}.jsonl", speed=0)
    return [oc_says_train(r, S) for r in source.readings() if isinstance(r, OcReport)]


def test_the_passing_train_approaches_then_is_present_with_no_flicker() -> None:
    seen = verdicts(ReplaySource(DATA / "train_passing.jsonl", speed=0))

    assert seen == [V.NOT_A_TRAIN, V.TRAIN_APPROACHING, V.TRAIN_PRESENT, V.NOT_A_TRAIN]
    assert oc_results("train_passing") == [True]


def test_the_stopping_train_is_present_before_and_after_its_stop() -> None:
    # While stopped there are no speed reports, so the track ends; group 3's map takes over there.
    seen = verdicts(ReplaySource(DATA / "train_stopping.jsonl", speed=0))

    assert seen.count(V.TRAIN_PRESENT) == 2
    assert oc_results("train_stopping") == [True, True]  # one train, two OC reports


@pytest.mark.parametrize("name", ["truck", "empty_track"])
def test_no_train_in_the_truck_or_the_empty_track(name: str) -> None:
    assert verdicts(ReplaySource(DATA / f"{name}.jsonl", speed=0)) == [V.NOT_A_TRAIN]
    assert not any(oc_results(name))


@pytest.mark.skipif(not any(RECORDINGS.glob("*.txt")), reason="run scripts/fetch_recordings.py")
@pytest.mark.parametrize(
    "name",
    [
        "Bike_Inbound_231107_1254",
        "Bike_Inbound_231107_1307",
        "Bike_Outbound_231107_1304",
        "Walker_Outbound_231107_1252",
    ],
)
def test_no_train_in_the_real_bike_and_walker_recordings(name: str) -> None:
    assert verdicts(RecordingSource(RECORDINGS / f"{name}.txt")) == [V.NOT_A_TRAIN]
