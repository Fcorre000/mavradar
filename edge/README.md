# edge

Python detection service for the field node. **So far:** settings (`config.py`) and the `RadarSource` interface with a replay source that plays recorded logs, so the node can be built and tested with no radar (E1). The log format and the synthetic logs are in `tests/data/`. The detector (`mavradar_edge/detector/`, E2) turns readings into CrossingEvents: a track and a rule-based classifier for moving trains, a background map of the empty crossing for stopped ones, and a state machine that sends one event per real change. Every threshold is a `MAVRADAR_NODE_*` setting. Each event goes into a SQLite buffer (`buffer/`) before anything is sent, and the uplink (`uplink/`, E3) sends the oldest one in its own thread through a swappable transport (`transport/`), deleting it only once the server has answered for it. A third thread (`health/`, E4) sends a heartbeat every 30 seconds; a failed one is dropped, and battery and temperature are deliberately impossible stubs (0 V, -999 °C) until that hardware is wired. An unexpected error in the uplink or heartbeat thread exits the process (code 1) so systemd can restart the node. `python -m mavradar_edge.calibrate` captures a new background map (E5): it throws out a capture with movement or too few frames, warns if the track bands look train-sized next to the current map, and saves only on the maintainer's y, keeping the previous map in `data/maps/`. Until the real radar adapter (E6) it calibrates from `MAVRADAR_NODE_REPLAY_LOG`. `python -m mavradar_edge` starts the node (E7); on the Pi it runs as a systemd user service, below. With no background map saved it doesn't detect: its heartbeats say calibrating, so the crossing shows Unknown, until `calibrate` saves one.

It will run on a Raspberry Pi Zero 2 W next to an OmniPreSense OPS243-C radar (Doppler plus FMCW range, so it can see a stopped train), classify trains, and POST events to the ingest API in `server/`. While there is one node, it sits at the crossing, within radar range; a second node later means spacing the two out, one on each side (blueprint D4). Either way, at least 50 ft from the nearest rail.

Two rules from the handoff that shape the code:

- **The uplink is a swappable transport.** Detection produces an event; a transport layer ships it. No assumptions about WiFi vs Cat-M vs anything else.
- **Events survive dropouts.** A local SQLite buffer holds events until the ingest API acknowledges them. The node creates each event's `eventId` and keeps it with the event, so a retry after a lost ack is recognized as a repeat (blueprint OQ6). A 503 means "try again later".

Configuration comes from environment variables. See `.env.example`.

Read `docs/MAVRADAR_HANDOFF.md` and its amendments (latest: `docs/MAVRADAR_HANDOFF_AMENDMENT_003.md`) before starting here, then the design blueprint: `docs/artifacts/blueprint/08_design_class_diagrams.md` section 1 has the classes and `09_build_order.md` the tasks (E1 to E7).

## Run it on the Pi

The Pi Zero 2 W already has Raspberry Pi OS, Python 3.13, uv and Tailscale. Everything below runs on the Pi as its normal user (the one in the `dialout` group, which the radar's serial port will need in E6).

**1. Get the code.** The service expects the repo at `~/mavradar`.

```bash
git clone https://github.com/Fcorre000/mavradar.git ~/mavradar
cd ~/mavradar/edge
uv sync --python 3.13
```

**2. Settings and the node key.** Copy the example and fill it in. The key comes from the server's `scripts/new_node_key.py`: the key goes here, its hash goes to the server. `.env` is gitignored; keep it readable by you only.

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Set `MAVRADAR_NODE_ID`, `MAVRADAR_NODE_CROSSING_ID`, `MAVRADAR_NODE_SERVER_URL` and `MAVRADAR_NODE_KEY`. Leave `MAVRADAR_NODE_LOG_ONLY` commented out: the node then runs log-only, so the server records every event and alerts nobody. Until the radar adapter arrives (E6), set `MAVRADAR_NODE_REPLAY_LOG=tests/data/empty_track.jsonl`: it makes no events, so nothing made-up reaches the real server's crossing history. It plays for 2 minutes, then the node stops (exit 0) until E6 brings a radar that doesn't end. Never put the node's location in this file or anywhere in the repo.

**3. Install the service.** Linger makes your user services start at boot, before anyone logs in. It's the one step that needs sudo.

```bash
mkdir -p ~/.config/systemd/user
cp deploy/mavradar-edge.service ~/.config/systemd/user/
sudo loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable --now mavradar-edge
```

**4. Check it.**

```bash
systemctl --user status mavradar-edge
journalctl --user -u mavradar-edge -f
```

With no map yet, the log says so and the node only sends heartbeats saying calibrating. Exit codes: 0 means the replay log finished (no restart), 1 a failure (restarted after 5 s), 2 a setting is missing or wrong (no restart; the reason is the last line of the log).

**5. Calibrate.** `calibrate` reads the same settings, stops the service while it uses the radar, and starts it again when it ends, however it ends. Load the settings into your shell first:

```bash
set -a; . ./.env; set +a
.venv/bin/python -m mavradar_edge.calibrate
```

To go back to the previous map after a bad calibration, copy `data/maps/previous.json` over `data/maps/current.json` and run `systemctl --user restart mavradar-edge`.

### Tests to run on the Pi (Jira SCRUM-64)

These need the real Pi, so they're done by hand. Each one has a pass line.

**Starts on boot.** `sudo reboot`, wait a minute, SSH back in: `systemctl --user status mavradar-edge` says active (running). Pass: it's running and nobody started it.

**Restarts after a crash.** Note the PID in `systemctl --user status mavradar-edge`, then kill it hard:

```bash
systemctl --user kill -s KILL mavradar-edge
```

Pass: about 5 s later, status shows active again with a new PID.

**No buffered event lost to a power cut.** Make the node buffer events it can't send, then pull the plug mid-run.

1. Calibrate from the empty-track log, so there's a map:

   ```bash
   set -a; . ./.env; set +a
   MAVRADAR_NODE_REPLAY_LOG=tests/data/empty_track.jsonl MAVRADAR_NODE_REPLAY_SPEED=0 .venv/bin/python -m mavradar_edge.calibrate --seconds 1000
   ```

2. Keep a copy of your `.env` (`cp .env .env.real`), then in `.env` set `MAVRADAR_NODE_REPLAY_LOG=tests/data/train_passing.jsonl`, `MAVRADAR_NODE_REPLAY_SPEED=1`, `MAVRADAR_NODE_SERVER_URL=http://localhost:9` (nothing answers there, so every event stays in the buffer) and `MAVRADAR_NODE_BUFFER_PATH=data/power-test.db` (its own buffer, so these made-up events never mix with real ones). Run `systemctl --user restart mavradar-edge`.
3. Watch the buffer fill. The train takes about 3 minutes and makes three events:

   ```bash
   .venv/bin/python -c "import sqlite3; print([r[0] for r in sqlite3.connect('data/power-test.db').execute('SELECT event_id FROM events ORDER BY seq')])"
   ```

4. Once it lists two eventIds, **pull the power**. Write the two IDs down.
5. Plug it back in, SSH in, and run the same command. Pass: both IDs are still there, in the same order. (The replay starts over at boot, so new IDs may follow them; that's expected.)
6. Clean up, so the made-up train never reaches the real server: `mv .env.real .env`, `rm data/power-test.db*`, then `systemctl --user restart mavradar-edge`. The map from step 1 came from a synthetic log; calibrate again once the real radar is mounted.

