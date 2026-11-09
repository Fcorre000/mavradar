"""TrainClassifier: is this track a train? (07, Strategy card.)

Swappable on purpose: the rules below are the first version, the log-only weeks will retune them,
and a small model could replace them later behind the same interface. The detector's states ask
the classifier; they never hold thresholds themselves.

Live decisions use the node's own features, because the radar's OC summary only arrives once the
object has gone (for a train, minutes after it blocked the crossing). OC is the after-the-fact
double-check instead.
"""

from enum import StrEnum
from typing import Protocol

from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.detector.track import Track
from mavradar_edge.radar.source import OcReport


class Verdict(StrEnum):
    NOT_A_TRAIN = "notATrain"
    TRAIN_APPROACHING = "trainApproaching"
    TRAIN_PRESENT = "trainPresent"
    # The track band holds something train-sized by the background map, and nothing is moving.
    # The state machine only accepts it after a train was present: a parked object isn't a train.
    TRAIN_STOPPED = "trainStopped"


class TrainClassifier(Protocol):
    def classify(self, track: Track | None, occupied: bool, still_s: float) -> Verdict:
        """`occupied`: the background map sees something train-sized on the track (the latest
        range frame). `still_s`: how long nothing has moved."""
        ...


class RuleBasedClassifier:
    """Three features at once, never echo strength alone (OPS243 research page)."""

    def __init__(self, settings: DetectorSettings) -> None:
        self._s = settings

    def classify(self, track: Track | None, occupied: bool, still_s: float) -> Verdict:
        s = self._s
        if track is None:
            return Verdict.TRAIN_STOPPED if occupied and still_s >= s.stop_s else Verdict.NOT_A_TRAIN
        moving = track.median_speed_mps >= s.min_speed_mps
        in_band = track.in_band(s.band_window_s)
        # Present: long enough, at train speed, and in the track band. All three, so a truck
        # (too short), a walker (too slow) or anything off the track can't block the crossing.
        if track.duration_s >= s.present_duration_s and moving and in_band:
            return Verdict.TRAIN_PRESENT
        # Approaching: heading for the crossing, or already reaching it but not yet confirmed as
        # present. The "or" matters: once a train reaches the crossing it moves across, not toward
        # the radar, and without it the verdict would drop to "not a train" for a few seconds.
        if track.duration_s >= s.approach_duration_s and moving and (track.toward or in_band):
            return Verdict.TRAIN_APPROACHING
        # Stopped: a track that has gone quiet while the track band stays full.
        if occupied and still_s >= s.stop_s:
            return Verdict.TRAIN_STOPPED
        return Verdict.NOT_A_TRAIN


def oc_says_train(oc: OcReport, settings: DetectorSettings) -> bool:
    """The radar's own summary agrees it was a train: long in view and long. The detector compares
    this with what it decided, and logs a mismatch as a likely false alarm or miss."""
    return oc.delta_time_msec / 1000 >= settings.oc_min_time_s and oc.length_m >= settings.oc_min_length_m
