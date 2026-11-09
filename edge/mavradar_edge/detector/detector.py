"""Detector: radar readings in, CrossingEvents out (SD1 messages 3 to 6; blueprint 06).

Feed it every reading with on_reading(), and call tick() now and then (the run loop does, E3) so
a radar that goes silent is noticed. A change in what the crossing is, as the server sees it,
produces exactly one CrossingEvent, per 06's "Which changes produce a CrossingEvent".

Log-only mode is not a state: the same machine runs, and every event carries the flag.
"""

import logging
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

from mavradar_edge.contract import CrossingEvent, Direction, ReportedState, Train
from mavradar_edge.detector.background import BackgroundMap, BandWatcher
from mavradar_edge.detector.classifier import RuleBasedClassifier, TrainClassifier, Verdict, oc_says_train
from mavradar_edge.detector.settings import DetectorSettings
from mavradar_edge.detector.states import FAULTED, IDLE, DetectorState, Evidence
from mavradar_edge.detector.track import Track, TrackBuilder
from mavradar_edge.radar.source import OcReport, Reading

logger = logging.getLogger(__name__)

CLASSIFIER_VERSION = "rules-1"  # so later data shows which rules made each call
TRAIN_STATES = (ReportedState.APPROACHING, ReportedState.BLOCKED, ReportedState.STOPPED)
CALL_MEMORY_S = 900.0  # how far back an OC report can look for the detector's own call


def wall_clock(t: float) -> datetime:
    """On the node, an event happens now. Tests map the radar's seconds onto a fixed start instead."""
    return datetime.now(UTC)


class Detector:
    def __init__(
        self,
        *,
        node_id: str,
        crossing_id: str,
        log_only: bool,
        background: BackgroundMap,
        settings: DetectorSettings,
        classifier: TrainClassifier | None = None,
        time_of: Callable[[float], datetime] = wall_clock,
        new_id: Callable[[], str] = lambda: str(uuid4()),
    ) -> None:
        """`background` is required: without a map of the empty crossing there's no seeing a stopped
        train. Capturing one is calibration (E5)."""
        self._node_id = node_id
        self._crossing_id = crossing_id
        self._log_only = log_only
        self._s = settings
        self._classifier = classifier or RuleBasedClassifier(settings)
        self._time_of = time_of
        self._new_id = new_id
        self._tracks = TrackBuilder(settings)
        self._band = BandWatcher(background, settings)
        self._state: DetectorState = IDLE
        self._last_reading_t: float | None = None
        self._quiet_since: float | None = None
        self._train_calls: deque[float] = deque()  # times the detector reported a train

    @property
    def state(self) -> DetectorState:
        return self._state

    def on_reading(self, reading: Reading) -> CrossingEvent | None:
        t = reading.t
        self._last_reading_t = t
        track = self._tracks.add(reading)
        self._band.add(reading)
        if isinstance(reading, OcReport):
            self._check_oc(reading)

        occupied = self._band.occupied(t)
        still_s = self._tracks.still_s(t)
        verdict = self._classifier.classify(track, occupied, still_s)
        moving = still_s < self._s.motion_window_s
        if verdict is Verdict.NOT_A_TRAIN and not occupied and not moving:
            if self._quiet_since is None:
                self._quiet_since = t
        else:
            self._quiet_since = None
        quiet_s = 0.0 if self._quiet_since is None else t - self._quiet_since

        ev = Evidence(t, verdict, track is not None, moving, occupied, quiet_s)
        new = self._state.next(ev, self._s.clear_hold_s)
        if new.reported is ReportedState.CLEAR and self._quiet_since is not None:
            at = self._quiet_since  # a clear happened when the quiet began, not when it was confirmed
        else:
            at = t
        return self._move(new, at, track)

    def tick(self, now: float) -> CrossingEvent | None:
        """Call regularly with the radar's clock. Silence for fault_after_s means the radar has
        stopped responding."""
        if self._state is FAULTED or self._last_reading_t is None:
            return None
        if now - self._last_reading_t >= self._s.fault_after_s:
            return self._move(FAULTED, now, None)
        return None

    def _move(self, new: DetectorState, at: float, track: Track | None) -> CrossingEvent | None:
        old, self._state = self._state, new
        if new.reported in TRAIN_STATES:
            self._remember_call(at)
        if new.reported is old.reported:
            return None  # Idle and Tracking both read as clear: no event
        event = CrossingEvent(
            event_id=self._new_id(),
            node_id=self._node_id,
            crossing_id=self._crossing_id,
            from_state=old.reported,
            to_state=new.reported,
            occurred_at=self._time_of(at),
            log_only=self._log_only,
            train=_train(track)
            if new.reported in (ReportedState.APPROACHING, ReportedState.BLOCKED)
            else None,
            classifier_version=CLASSIFIER_VERSION,
        )
        logger.info(
            "%s to %s",
            event.from_state,
            event.to_state,
            extra={"event_id": event.event_id, "crossing_id": self._crossing_id, "log_only": self._log_only},
        )
        return event

    def _remember_call(self, t: float) -> None:
        self._train_calls.append(t)
        while self._train_calls and t - self._train_calls[0] > CALL_MEMORY_S:
            self._train_calls.popleft()

    def _check_oc(self, oc: OcReport) -> None:
        """The after-the-fact double-check: does the radar's own summary agree with the call?"""
        called = any(oc.start_time <= t <= oc.end_time for t in self._train_calls)
        says = oc_says_train(oc, self._s)
        if called == says:
            return
        logger.warning(
            "OC disagrees: likely %s (%.1f s in view, %.0f m long, %.1f to %.1f)",
            "false alarm" if called else "miss",
            oc.delta_time_msec / 1000,
            oc.length_m,
            oc.start_time,
            oc.end_time,
            extra={"crossing_id": self._crossing_id, "oc_says_train": says, "detector_called_train": called},
        )


def _train(track: Track | None) -> Train | None:
    if track is None or not track.speeds_mps:
        return None
    return Train(
        speed_mps=round(track.median_speed_mps, 2),
        direction=Direction.TOWARD if track.toward else Direction.AWAY,
    )
