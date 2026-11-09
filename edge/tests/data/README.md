# Recorded radar logs

What `ReplaySource` (`mavradar_edge/radar/replay.py`) plays back, so the node can be built and tested with no radar. The lines are what the OPS243-C prints in **JSON mode** (`OJ`), with magnitude (`OM`, `oM`), time (`OT`), units (`OU`) and vehicle classification (`OC`) turned on, per OmniPreSense's AN-010-AE. A recording of the real radar is the same lines, written down as they arrive.

One JSON object per line ([JSON Lines](https://jsonlines.org)), in the order the radar printed them. Blank lines are skipped. In JSON mode the radar sends numbers as text (`"11.20"`); plain numbers are accepted too. Any field the format doesn't use is ignored, so a newer firmware adding one doesn't break the replay.

## Time

`time` is the radar's clock: **seconds since it powered on** (`OT`), like `"137.429"`. The replay waits `(time - previous time) / speed` before each line, so a log plays the same way any day. It may repeat but never go backwards. An OC report has no `time`; it uses its `end_time`, and since it's printed just after the object leaves, it can trail the line before it a little.

## The four line types

### Speed report (Doppler): what is moving

```json
{"time": "137.429", "unit": "mps", "magnitude": ["95.20", "40.10"], "speed": ["-11.13", "6.02"]}
```

Up to three objects, strongest echo first. One object can be a single value instead of a list. `speed` is in m/s and **positive means toward the radar**; the node sits at the crossing, so that's toward the crossing. `magnitude` is the radar's raw echo strength; it grows with size and reflectivity but shrinks with distance, so a person close by can out-echo a vehicle far away.

### Range report (FMCW): distances to whatever reflects

```json
{"time": "137.431", "unit": "m", "magnitude": ["90.10", "39.50"], "range": ["20.50", "8.00"]}
```

Moving or not, so fixed clutter (a mast, a gate arm) shows up in every report. **Speed and range are separate reports.** The radar measures them separately and lists each strongest first, so nothing says which speed goes with which distance. The replay keeps them apart; relating them is the detector's job.

### OC report: the radar's summary of one object

```json
{"classifier": "object_outbound", "start_time": "120.000", "end_time": "121.600", "delta_time_msec": 1600,
 "max_speed_mps": 13.3, "min_speed_mps": 12.7, "max_magnitude": 91, "avg_magnitude": 70,
 "total_frames": 8, "frames_per_mps": 0.6015, "length_m": 21.3, "speed_change": 0.045}
```

Printed once the object leaves the beam (firmware v1.2.5 or newer on the OPS243-C). `delta_time_msec` is the time in view and `length_m` is max speed times that time, so it's overstated. OC is Doppler-based, so it never sees a stopped train. A long train may give **one report or several**, split at the gaps between cars; the synthetic logs have both.

### Raw range data (FFT): echo by distance band

```json
{"time": "138.000", "FFT": [5.5, 5.9, 40.0, 3.6, 90.2]}
```

**This layout is our guess.** AN-010-AE only says `oF` output is JSON; check it on the real radar first thing in E6 and fix this section. Each value is the raw magnitude for one distance band, nearest first. The band size isn't in the line: it's the `MAVRADAR_NODE_RANGE_BIN_M` setting (the radar reports it with `?z`). Against the background map of the empty track, this is what shows a stopped train, which gives no speed reports.

### Optional first line

```json
{"recordedAt": "2026-11-05T14:00:00Z", "source": "ops243"}
```

Written by our recorder, never by the radar: when and how the log was made. Null for a synthetic log.

A line that breaks any rule stops the replay before it starts, with the file name and line number.

## The synthetic logs

Written by `scripts/make_logs.py` (seeded, so it always writes the same files). Edit the script and rerun it; don't edit the `.jsonl` files by hand. The node sits at the crossing with the rail about 20 m away (bands 18 to 22), a signal mast at 8 m and a gate arm at 14 m. Times start at 100 s, as if the radar had been on a while.

| Log | What happens | OC reports | What E2's detector should report |
|---|---|---|---|
| `train_passing.jsonl` | Approaches from 100 m at about 25 mph, crosses for 130 s, leaves | one long one | approaching, blocked, clear |
| `train_stopping.jsonl` | Approaches, crosses, slows to a stop for 180 s (no speed reports, only range sees it), moves again, leaves | two, split at the stop | approaching, blocked, stopped, blocked, clear |
| `truck.jsonl` | A strong echo for 1.6 s on the road, then nothing | one short one | nothing |
| `empty_track.jsonl` | Background, clutter and two weak blips (birds) | one tiny one | nothing |

## OmniPreSense's sample recordings

Three bikes and a walker from [omnipresense/Radar-Datasets](https://github.com/omnipresense/Radar-Datasets), taken with an OPS243-A (Doppler only). None should ever look like a train. The dataset has no license, so the files are never committed: `uv run python -m scripts.fetch_recordings` downloads them into `omnipresense/` here (gitignored), and the tests that use them skip when they're missing.

They aren't this format: they're spreadsheet-converted plain speed reports, read by `mavradar_edge/radar/omnipresense.py`.
