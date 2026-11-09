"""The detector's thresholds. Starting values only: the log-only weeks exist to measure them
(blueprint 06), so they are settings (MAVRADAR_NODE_*), never numbers in the code."""

from dataclasses import dataclass


@dataclass(frozen=True)
class DetectorSettings:
    # A speed or range reading counts only above this raw magnitude. It decides what counts as a
    # reading, never "train": a person close by can out-echo a vehicle far away.
    min_magnitude: float = 40.0
    # A track survives a gap this long with no strong speed reading (the gaps between cars).
    gap_s: float = 3.0
    # Approaching: strong and moving toward the crossing at least this long. Short, because one
    # node at the crossing sees only ~100 m: about 7 s of warning at 25 mph.
    approach_duration_s: float = 4.0
    # Present (blocked): duration, speed and the track band, all three.
    present_duration_s: float = 10.0
    min_speed_mps: float = 3.0  # a walker is ~1.3 m/s
    track_band_min_m: float = 18.0  # the rail is about 20 m from the node
    track_band_max_m: float = 23.0
    # "In the track band" means seen there within this long, so one dropped reading doesn't lose a train.
    band_window_s: float = 5.0
    # Doppler readings slower than this are fixed clutter, not motion (the OPS243 research page
    # saw ~0.06 m/s with nothing moving), so they never count toward a track or as movement.
    clutter_mps: float = 0.3
    # Background map: a band is "something new" when its echo is this far above its own normal,
    # and the track is occupied when at least this many track bands are (one is a person).
    map_margin: float = 30.0
    min_occupied_bands: float = 3
    # Stopped: the track band occupied and nothing moving for this long (06: "the stop threshold").
    stop_s: float = 10.0
    # "Occupied" comes from the latest range frame and stops counting once frames stop this long.
    frame_stale_s: float = 5.0
    # The OC double-check: the radar's own summary says train if both hold.
    oc_min_time_s: float = 10.0
    oc_min_length_m: float = 100.0
