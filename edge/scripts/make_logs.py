"""Writes the synthetic replay logs in tests/data/. Run from edge/:

    uv run python -m scripts.make_logs

Made up, not recorded: shaped like what the OPS243-C should see from a node at the crossing
(within ~100 m, the track band about 20 m away since the node sits 50+ ft from the rail). Seeded,
so the same script always writes the same logs. Change the scenarios here, not the .jsonl files.
"""

import json
import random
from collections.abc import Iterator
from pathlib import Path

DATA = Path(__file__).parents[1] / "tests" / "data"

DETECTION_EVERY_S = 0.2
FRAME_EVERY_S = 2.0
BIN_SIZE_M = 1.0
BINS = 60  # 0 to 60 m
TRACK_BAND = range(18, 23)  # the rail is about 20 m from the node
CLUTTER = {8: 0.4, 14: 0.35}  # a signal mast and a gate arm: always there, never moving
TRAIN_SPEED_MPS = 11.0  # about 25 mph


class Log:
    def __init__(self, seed: int) -> None:
        self.rng = random.Random(seed)
        self.lines: list[dict[str, object]] = [{"type": "header", "recordedAt": None, "source": "synthetic"}]

    def detection(
        self, t: float, speed: float, direction: str, range_m: float | None, strength: float
    ) -> None:
        jitter = self.rng.uniform(-0.03, 0.03)
        self.lines.append(
            {
                "t": round(t, 2),
                "type": "detection",
                "speedMps": round(max(0.0, speed + self.rng.uniform(-0.3, 0.3)), 2),
                "direction": direction,
                "rangeM": None if range_m is None else round(range_m, 1),
                "strength": round(min(1.0, max(0.0, strength + jitter)), 2),
            }
        )

    def frame(self, t: float, train_on_track: bool = False, object_at: int | None = None) -> None:
        bins = [self.rng.uniform(0.02, 0.06) for _ in range(BINS)]
        for i, level in CLUTTER.items():
            bins[i] = level
        if train_on_track:
            for i in TRACK_BAND:
                bins[i] = self.rng.uniform(0.8, 0.95)
        if object_at is not None:
            bins[object_at] = 0.7
        self.lines.append(
            {"t": round(t, 2), "type": "range", "binSizeM": BIN_SIZE_M, "bins": [round(b, 2) for b in bins]}
        )

    def write(self, name: str) -> None:
        self.lines[1:] = sorted(self.lines[1:], key=lambda line: (line["t"], line["type"] != "range"))  # pyright: ignore[reportUnknownLambdaType, reportUnknownMemberType]
        text = "\n".join(json.dumps(line, separators=(",", ":")) for line in self.lines)
        (DATA / name).write_text(text + "\n")


def steps(start: float, end: float, every: float) -> Iterator[float]:
    n = 0
    while start + n * every < end:
        yield start + n * every
        n += 1


def frames(log: Log, start: float, end: float, train_on_track: bool = False) -> None:
    for t in steps(start, end, FRAME_EVERY_S):
        log.frame(t, train_on_track)


def approach(log: Log, start: float) -> float:
    """A train heading in from 100 m out, at full speed. Returns when it reaches the crossing."""
    t, range_m = start, 100.0
    while range_m > 21:
        log.detection(t, TRAIN_SPEED_MPS, "toward", range_m, 0.5 + 0.4 * (100 - range_m) / 80)
        t += DETECTION_EVERY_S
        range_m -= TRAIN_SPEED_MPS * DETECTION_EVERY_S
    return t


def on_crossing(log: Log, start: float, end: float, speed: float = TRAIN_SPEED_MPS) -> None:
    """Cars of a moving train crossing in front of the node: a long, strong, steady echo."""
    for t in steps(start, end, DETECTION_EVERY_S):
        log.detection(t, speed, "away", log.rng.uniform(19, 22), 0.9)
    frames(log, start, end, train_on_track=True)


def train_passing() -> None:
    log = Log(seed=1)
    frames(log, 0, 10)
    arrived = approach(log, 10)
    frames(log, 10, arrived)
    on_crossing(log, arrived, arrived + 130)  # a 130 s train at 25 mph is about 1.4 km long
    frames(log, arrived + 130, arrived + 160)
    log.write("train_passing.jsonl")


def train_stopping() -> None:
    log = Log(seed=2)
    frames(log, 0, 10)
    arrived = approach(log, 10)
    frames(log, 10, arrived)
    on_crossing(log, arrived, arrived + 20)
    slowing = arrived + 20
    for i, t in enumerate(steps(slowing, slowing + 15, DETECTION_EVERY_S)):
        log.detection(t, max(0.0, TRAIN_SPEED_MPS * (1 - i / 75)), "away", 20.5, 0.85)
    frames(log, slowing, slowing + 15, train_on_track=True)
    # Stopped: no motion, so no Doppler detections at all. Only the range frames still see it.
    stopped = slowing + 15
    frames(log, stopped, stopped + 180, train_on_track=True)
    moving = stopped + 180
    for i, t in enumerate(steps(moving, moving + 15, DETECTION_EVERY_S)):
        log.detection(t, TRAIN_SPEED_MPS * i / 75, "away", 20.5, 0.85)
    frames(log, moving, moving + 15, train_on_track=True)
    on_crossing(log, moving + 15, moving + 45)
    frames(log, moving + 45, moving + 75)
    log.write("train_stopping.jsonl")


def truck() -> None:
    """A truck on the road through the crossing: strong for a moment, then gone. Not a train."""
    log = Log(seed=3)
    frames(log, 0, 20)
    for t in steps(20, 23, DETECTION_EVERY_S):
        log.detection(t, 13.0, "away", log.rng.uniform(23, 27), 0.7)
    log.frame(22, object_at=25)
    frames(log, 24, 60)
    log.write("truck.jsonl")


def empty_track() -> None:
    """Nothing on the track: background, clutter, and a couple of weak blips (birds)."""
    log = Log(seed=4)
    frames(log, 0, 120)
    for start in (37.0, 88.4):
        for t in steps(start, start + 0.4, DETECTION_EVERY_S):
            log.detection(t, 6.0, "toward", log.rng.uniform(5, 40), 0.15)
    log.write("empty_track.jsonl")


if __name__ == "__main__":
    DATA.mkdir(parents=True, exist_ok=True)
    for make in (train_passing, train_stopping, truck, empty_track):
        make()
    print(f"wrote 4 logs to {DATA}")
