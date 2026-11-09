"""Writes the synthetic replay logs in tests/data/. Run from edge/:

    uv run python -m scripts.make_logs

Made up, not recorded: shaped like what the OPS243-C should print in JSON mode (OJ, with OM, oM,
OT and OC on) from a node at the crossing, within about 100 m, with the rail about 20 m away
because the node sits 50+ ft from it. Seeded, so the same script always writes the same logs.
Change the scenarios here, not the .jsonl files.
"""

import json
import random
from collections.abc import Iterator
from pathlib import Path

DATA = Path(__file__).parents[1] / "tests" / "data"

POWER_ON_S = 100.0  # the radar's clock counts from power-on, so a log doesn't start at 0
REPORT_EVERY_S = 0.2
RANGE_EVERY_S = 0.5
FFT_EVERY_S = 2.0
BINS = 60  # 1 m bands, 0 to 60 m
TRACK_BAND = range(18, 23)
CLUTTER = {8.0: 40.0, 14.0: 35.0}  # a signal mast and a gate arm: always there, never moving
TRAIN_SPEED_MPS = 11.0  # about 25 mph


def text(value: float) -> str:
    # In JSON mode the radar sends numbers as text.
    return f"{value:.2f}"


def values(items: list[float]) -> str | list[str]:
    # One object prints as a single value; several as a list. Both appear, so both get parsed.
    return text(items[0]) if len(items) == 1 else [text(v) for v in items]


class Log:
    def __init__(self, seed: int) -> None:
        self.rng = random.Random(seed)
        self.lines: list[tuple[float, int, dict[str, object]]] = []

    def add(self, t: float, line: dict[str, object], order: int = 1) -> None:
        self.lines.append((t, order, line))

    def speed(self, t: float, objects: list[tuple[float, float]]) -> None:
        """objects: (signed speed, magnitude), strongest first; positive is toward the radar."""
        jittered = [(v + self.rng.uniform(-0.3, 0.3), m + self.rng.uniform(-4, 4)) for v, m in objects]
        jittered.sort(key=lambda o: -o[1])
        line: dict[str, object] = {"time": f"{POWER_ON_S + t:.3f}", "unit": "mps"}
        line["magnitude"] = values([m for _, m in jittered])
        line["speed"] = values([v for v, _ in jittered])
        self.add(t, line)

    def ranges(self, t: float, extra: list[tuple[float, float]] | None = None) -> None:
        """Distances to whatever reflects, moving or not: the clutter is always in the list."""
        everything: list[tuple[float, float]] = [*CLUTTER.items(), *(extra or [])]
        objects = sorted(everything, key=lambda o: -o[1])[:3]
        line: dict[str, object] = {"time": f"{POWER_ON_S + t:.3f}", "unit": "m"}
        line["magnitude"] = values([m + self.rng.uniform(-2, 2) for _, m in objects])
        line["range"] = values([r for r, _ in objects])
        self.add(t, line)

    def fft(self, t: float, train_on_track: bool = False, object_at: int | None = None) -> None:
        bins = [self.rng.uniform(2, 6) for _ in range(BINS)]
        for distance, level in CLUTTER.items():
            bins[int(distance)] = level
        if train_on_track:
            for i in TRACK_BAND:
                bins[i] = self.rng.uniform(80, 95)
        if object_at is not None:
            bins[object_at] = 70
        self.add(t, {"time": f"{POWER_ON_S + t:.3f}", "FFT": [round(b, 1) for b in bins]})

    def oc(self, start: float, end: float, max_speed: float, min_speed: float, magnitude: float) -> None:
        """The radar's summary once an object has left the beam, printed after its last report."""
        seconds = end - start
        frames = round(seconds / REPORT_EVERY_S)
        line: dict[str, object] = {
            "classifier": "object_outbound",
            "start_time": f"{POWER_ON_S + start:.3f}",
            "end_time": f"{POWER_ON_S + end:.3f}",
            "delta_time_msec": round(seconds * 1000),
            "max_speed_mps": round(max_speed, 2),
            "min_speed_mps": round(min_speed, 2),
            "max_magnitude": round(magnitude * 1.3),
            "avg_magnitude": round(magnitude),
            "total_frames": frames,
            "frames_per_mps": round(frames / max_speed, 4),
            "length_m": round(max_speed * seconds, 1),
            "speed_change": round((max_speed - min_speed) / max_speed, 3),
        }
        self.add(end, line, order=2)

    def background(self, start: float, end: float, train_on_track: bool = False) -> None:
        train = [(20.5, 90.0)] if train_on_track else []
        for t in steps(start, end, RANGE_EVERY_S):
            self.ranges(t, train)
        for t in steps(start, end, FFT_EVERY_S):
            self.fft(t, train_on_track)

    def write(self, name: str) -> None:
        self.lines.sort(key=lambda entry: (entry[0], entry[1]))
        out = [json.dumps({"recordedAt": None, "source": "synthetic"})]
        out += [json.dumps(line, separators=(",", ":")) for _, _, line in self.lines]
        (DATA / name).write_text("\n".join(out) + "\n")


def steps(start: float, end: float, every: float) -> Iterator[float]:
    n = 0
    while start + n * every < end - 1e-9:
        yield start + n * every
        n += 1


def approach(log: Log, start: float) -> float:
    """A train heading in from 100 m out at full speed. Returns when it reaches the crossing."""
    t, distance = start, 100.0
    while distance > 21:
        log.speed(t, [(TRAIN_SPEED_MPS, 50 + 40 * (100 - distance) / 80)])
        if distance < 60:
            log.ranges(t, [(distance, 50 + 40 * (100 - distance) / 80)])
        t += REPORT_EVERY_S
        distance -= TRAIN_SPEED_MPS * REPORT_EVERY_S
    return t


def crossing(log: Log, start: float, end: float) -> None:
    """Cars of a moving train crossing in front of the node: a long, strong, steady echo."""
    for t in steps(start, end, REPORT_EVERY_S):
        log.speed(t, [(-TRAIN_SPEED_MPS, 95.0)])
    log.background(start, end, train_on_track=True)


def train_passing() -> None:
    log = Log(seed=1)
    log.background(0, 10)
    arrived = approach(log, 10)
    log.background(10, arrived)
    crossing(log, arrived, arrived + 130)  # a 130 s train at 25 mph is about 1.4 km long
    log.oc(10, arrived + 130, TRAIN_SPEED_MPS + 0.3, TRAIN_SPEED_MPS - 0.3, 92)  # one long report
    log.background(arrived + 130, arrived + 160)
    log.write("train_passing.jsonl")


def train_stopping() -> None:
    log = Log(seed=2)
    log.background(0, 10)
    arrived = approach(log, 10)
    log.background(10, arrived)
    crossing(log, arrived, arrived + 20)
    slowing = arrived + 20
    for i, t in enumerate(steps(slowing, slowing + 15, REPORT_EVERY_S)):
        log.speed(t, [(-max(0.1, TRAIN_SPEED_MPS * (1 - i / 75)), 88.0)])
    log.background(slowing, slowing + 15, train_on_track=True)
    log.oc(10, slowing + 15, TRAIN_SPEED_MPS + 0.3, 0.1, 90)  # the beam loses it once it stops
    # Stopped: nothing moves, so no speed reports. The range reports and frames still see it.
    stopped = slowing + 15
    log.background(stopped, stopped + 180, train_on_track=True)
    moving = stopped + 180
    for i, t in enumerate(steps(moving, moving + 15, REPORT_EVERY_S)):
        log.speed(t, [(-max(0.1, TRAIN_SPEED_MPS * i / 75), 88.0)])
    log.background(moving, moving + 15, train_on_track=True)
    crossing(log, moving + 15, moving + 45)
    log.oc(moving, moving + 45, TRAIN_SPEED_MPS + 0.3, 0.1, 90)  # a second report for the same train
    log.background(moving + 45, moving + 75)
    log.write("train_stopping.jsonl")


def truck() -> None:
    """A truck on the road through the crossing: strong for a moment, then gone. Not a train."""
    log = Log(seed=3)
    log.background(0, 20)
    for t in steps(20, 21.6, REPORT_EVERY_S):
        log.speed(t, [(-13.0, 75.0)])
        log.ranges(t, [(25.0, 70.0)])
    log.fft(21.0, object_at=25)
    log.oc(20, 21.6, 13.3, 12.7, 70)
    log.background(21.6, 60)
    log.write("truck.jsonl")


def empty_track() -> None:
    """Nothing on the track: background, clutter, and two weak blips (birds)."""
    log = Log(seed=4)
    log.background(0, 120)
    for start in (37.0, 88.4):
        for t in steps(start, start + 0.4, REPORT_EVERY_S):
            log.speed(t, [(6.0, 25.0)])
    log.oc(88.4, 88.8, 6.2, 5.8, 25)
    log.write("empty_track.jsonl")


if __name__ == "__main__":
    DATA.mkdir(parents=True, exist_ok=True)
    for make in (train_passing, train_stopping, truck, empty_track):
        make()
    print(f"wrote 4 logs to {DATA}")
