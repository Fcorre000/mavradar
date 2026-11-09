"""BackgroundMap and the stopped verdict: each band judged against its own normal, then the
synthetic logs run with a map built from the empty crossing."""

from pathlib import Path

import pytest

from mavradar_edge.detector.background import BackgroundMap, BandWatcher, MapMismatchError
from mavradar_edge.detector.classifier import RuleBasedClassifier, Verdict
from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.detector.track import TrackBuilder
from mavradar_edge.radar.replay import ReplaySource
from mavradar_edge.radar.source import RangeFrame, Speed, SpeedReport

S = DetectorSettings()
V = Verdict
DATA = Path(__file__).parent / "data"
# Bands 0 to 30 m: a mast at 8 m (40), a gate arm at 14 m (35), about 4 everywhere else.
NORMAL = [4.0] * 31
NORMAL[8], NORMAL[14] = 40.0, 35.0


def frame(t: float = 0.0, **bands: float) -> RangeFrame:
    """A frame of the empty crossing with some bands changed: frame(b20=88) sets band 20."""
    bins = list(NORMAL)
    for name, value in bands.items():
        bins[int(name[1:])] = value
    return RangeFrame(t, 1.0, tuple(bins))


MAP = BackgroundMap.from_frames([frame(), frame()])
TRAIN = {f"b{i}": 88.0 for i in range(18, 23)}


# The map


def test_each_bands_normal_is_the_median_so_a_blip_doesnt_count() -> None:
    capture = [frame(), frame(b20=90), frame(), frame(), frame()]  # a bird in one frame

    assert BackgroundMap.from_frames(capture).normal[20] == 4.0


def test_the_mast_and_gate_are_normal_not_new() -> None:
    assert MAP.new_bands(frame(), S.map_margin) == []  # 40 at the mast is just the mast


def test_a_band_counts_only_well_above_its_own_normal() -> None:
    assert MAP.new_bands(frame(b20=33), S.map_margin) == []  # 4 + 30 = 34, not over
    assert MAP.new_bands(frame(b20=35), S.map_margin) == [20]
    assert MAP.new_bands(frame(b8=69), S.map_margin) == []  # the mast's own normal is 40


def test_the_track_band_is_bands_18_to_22() -> None:
    assert MAP.track_bands(S) == range(18, 23)


def test_train_sized_needs_three_track_bands() -> None:
    assert MAP.track_occupied(frame(**TRAIN), S)
    assert MAP.track_occupied(frame(b18=88, b19=88, b20=88), S)
    assert not MAP.track_occupied(frame(b20=88), S)  # one band: a person
    assert not MAP.track_occupied(frame(b25=88, b26=88, b27=88), S)  # past the rail: the road


def test_a_frame_from_other_radar_settings_is_refused() -> None:
    with pytest.raises(MapMismatchError):
        MAP.new_bands(RangeFrame(0, 0.5, (4.0,) * 62), S.map_margin)
    with pytest.raises(MapMismatchError):
        BackgroundMap.from_frames([frame(), RangeFrame(0, 0.5, (4.0,) * 31)])
    with pytest.raises(ValueError):
        BackgroundMap.from_frames([])


def test_occupied_goes_stale_when_frames_stop() -> None:
    watcher = BandWatcher(MAP, S)
    watcher.add(frame(100, **TRAIN))

    assert watcher.occupied(104)
    assert not watcher.occupied(106)  # 6 s with no frame: the radar may have gone quiet


# The stopped verdict


def classify(occupied: bool, still_s: float) -> Verdict:
    return RuleBasedClassifier(S).classify(None, occupied, still_s)


def test_stopped_needs_the_band_full_and_nothing_moving_long_enough() -> None:
    assert classify(occupied=True, still_s=10) is V.TRAIN_STOPPED
    assert classify(occupied=True, still_s=9) is V.NOT_A_TRAIN  # might still be creeping
    assert classify(occupied=False, still_s=60) is V.NOT_A_TRAIN


def test_crawling_near_zero_is_clutter_not_motion() -> None:
    builder = TrackBuilder(S)
    builder.add(SpeedReport(100, (Speed(11, 90),)))
    builder.add(SpeedReport(110, (Speed(-0.1, 88),)))  # 0.1 m/s: under the clutter floor

    assert builder.still_s(112) == 12  # last real motion was at 100


# The logs, with a map of the empty crossing


def run(name: str) -> list[Verdict]:
    background = BackgroundMap.from_frames(
        list(ReplaySource(DATA / "empty_track.jsonl", speed=0).range_frames(1e9))
    )
    builder, watcher, classifier = TrackBuilder(S), BandWatcher(background, S), RuleBasedClassifier(S)
    seen: list[Verdict] = []
    for reading in ReplaySource(DATA / f"{name}.jsonl", speed=0).readings():
        track = builder.add(reading)
        watcher.add(reading)
        v = classifier.classify(track, watcher.occupied(reading.t), builder.still_s(reading.t))
        if not seen or seen[-1] is not v:
            seen.append(v)
    return seen


def test_the_stopping_train_shows_stopped_during_its_stop() -> None:
    seen = run("train_stopping")

    assert seen.count(V.TRAIN_STOPPED) == 1
    assert seen.index(V.TRAIN_STOPPED) > seen.index(V.TRAIN_PRESENT)  # only after it was present


@pytest.mark.parametrize("name", ["train_passing", "truck", "empty_track"])
def test_nothing_else_ever_shows_stopped(name: str) -> None:
    assert V.TRAIN_STOPPED not in run(name)
