# Recorded radar logs

What `ReplaySource` (`mavradar_edge/radar/replay.py`) plays back, so the node can be built and tested with no radar. A recording from the real OPS243-C will use the same format.

## The format

One JSON object per line ([JSON Lines](https://jsonlines.org)), in the order the readings happened. Blank lines are skipped.

### Time

Every reading has `t`: **seconds since the recording started**, never a date. The replay waits `(t - previous t) / speed` before each reading, so the same file plays the same way any day, and a made-up log can just count up. `t` may repeat but never go backwards.

### Header (optional, first line only)

```json
{"type": "header", "recordedAt": "2026-11-05T14:00:00Z", "source": "ops243"}
```

When and how the log was made. `recordedAt` is null for a synthetic log.

### Detection: something moving

```json
{"t": 3.2, "type": "detection", "speedMps": 11.2, "direction": "toward", "rangeM": 84.0, "strength": 0.9}
```

| Field | Unit | Rule |
|---|---|---|
| `speedMps` | metres per second | 0 or more |
| `direction` | | `toward` or `away` from the crossing |
| `rangeM` | metres | 0 or more, or null when the radar gives a speed with no distance |
| `strength` | | echo strength, 0 to 1 |

The field names match the contract's `train` block (`contract/schemas/crossing-event.schema.json`).

### Range frame: echo by distance, moving or not

```json
{"t": 4.0, "type": "range", "binSizeM": 1.0, "bins": [0.03, 0.05, 0.4, 0.9]}
```

| Field | Unit | Rule |
|---|---|---|
| `binSizeM` | metres | `bins[i]` covers `i * binSizeM` up to `(i + 1) * binSizeM` |
| `bins` | | echo strength per distance band, 0 to 1, nearest first; at least one |

Compared with the background map of the empty track, a range frame is what shows a stopped train: it gives no Doppler detections, but it still fills the track band.

A line that breaks any rule stops the replay before it starts, with the file name and line number.

## The synthetic logs

Written by `scripts/make_logs.py` (seeded, so it always writes the same files). Edit the script and rerun it; don't edit the `.jsonl` files by hand. The node sits at the crossing with the rail about 20 m away (bins 18 to 22), a signal mast at 8 m and a gate arm at 14 m.

| Log | What happens | What E2's detector should report |
|---|---|---|
| `train_passing.jsonl` | Approaches from 100 m at about 25 mph, crosses for 130 s, leaves | approaching, blocked, clear |
| `train_stopping.jsonl` | Approaches, crosses, slows to a stop for 180 s (no detections, only the range frames see it), moves again, leaves | approaching, blocked, stopped, blocked, clear |
| `truck.jsonl` | A strong echo for 3 s on the road, then nothing | nothing |
| `empty_track.jsonl` | Background and two weak blips (birds) | nothing |
