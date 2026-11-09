"""The detector's states (blueprint 06, edge detector; 07, State card). Each state looks for its own
evidence and decides its own exits; none of them holds a threshold (those are in the classifier
and DetectorSettings).

The verdicts flicker (a gap between cars, a stop being confirmed); the states are what hold the
crossing steady across that, so one train is one set of events.
"""

from dataclasses import dataclass
from typing import Protocol

from mavradar_edge.contract import ReportedState
from mavradar_edge.detector.classifier import Verdict


@dataclass(frozen=True)
class Evidence:
    """What the detector knows after one reading."""

    t: float
    verdict: Verdict
    has_track: bool  # something is being tracked, train or not
    moving: bool  # real motion just now
    occupied: bool  # the background map sees something train-sized on the track
    quiet_s: float  # how long nothing has moved and the track band has been empty


class DetectorState(Protocol):
    reported: ReportedState  # what the crossing is, as the server sees it

    def next(self, ev: Evidence, clear_hold_s: float) -> "DetectorState": ...


def _arriving(ev: Evidence) -> "DetectorState | None":
    if ev.verdict is Verdict.TRAIN_PRESENT:
        return AT_CROSSING
    if ev.verdict is Verdict.TRAIN_APPROACHING:
        return APPROACHING
    return None


class IdleState:
    reported = ReportedState.CLEAR

    def next(self, ev: Evidence, clear_hold_s: float) -> DetectorState:
        return _arriving(ev) or (TRACKING if ev.has_track else IDLE)


class TrackingState:
    """Something is there but isn't a train yet. Internal: no event."""

    reported = ReportedState.CLEAR

    def next(self, ev: Evidence, clear_hold_s: float) -> DetectorState:
        return _arriving(ev) or (TRACKING if ev.has_track else IDLE)  # gone: a truck, a bird


class ApproachingState:
    reported = ReportedState.APPROACHING

    def next(self, ev: Evidence, clear_hold_s: float) -> DetectorState:
        if ev.verdict is Verdict.TRAIN_PRESENT:
            return AT_CROSSING
        if ev.quiet_s >= clear_hold_s:
            return IDLE  # the train never arrived
        return APPROACHING


class AtCrossingState:
    reported = ReportedState.BLOCKED

    def next(self, ev: Evidence, clear_hold_s: float) -> DetectorState:
        if ev.verdict is Verdict.TRAIN_STOPPED:
            return STOPPED
        if ev.quiet_s >= clear_hold_s:
            return IDLE  # the end of the train has left
        return AT_CROSSING


class StoppedState:
    reported = ReportedState.STOPPED

    def next(self, ev: Evidence, clear_hold_s: float) -> DetectorState:
        # Never straight to clear: a stopped train has to move to leave. If the band somehow empties
        # with no motion seen (a train creeping out under the clutter floor), it goes through
        # blocked, which then clears on its own hold.
        if ev.moving or ev.quiet_s >= clear_hold_s:
            return AT_CROSSING
        return STOPPED


class FaultedState:
    """The radar stopped responding. On its return, report whatever it sees now."""

    reported = ReportedState.SENSOR_OFFLINE

    def next(self, ev: Evidence, clear_hold_s: float) -> DetectorState:
        if ev.verdict is Verdict.TRAIN_PRESENT or (ev.occupied and ev.moving):
            return AT_CROSSING
        if ev.occupied or ev.verdict is Verdict.TRAIN_STOPPED:
            return STOPPED
        if ev.verdict is Verdict.TRAIN_APPROACHING:
            return APPROACHING
        return TRACKING if ev.has_track else IDLE


IDLE = IdleState()
TRACKING = TrackingState()
APPROACHING = ApproachingState()
AT_CROSSING = AtCrossingState()
STOPPED = StoppedState()
FAULTED = FaultedState()
