# Solar sizing check

Checks the node's power system (50 W panel, 20 Ah LiFePO4, 205 Wh usable)
against real sunlight data for Arlington, TX. It closes the open item from the
sensor report: are the December sun-hours we assumed (4.1 to 4.8) realistic?

## Run it

```bash
cd research/solar
python3 solar_check.py
```

No packages to install. Python 3 standard library only.

It works with NREL's `DEMO_KEY`, but that key is rate limited. For your own
free key, sign up at developer.nlr.gov/signup, then:

```bash
export NREL_API_KEY=your_key_here
python3 solar_check.py
```

Never paste the key into the script or commit it. The repo is public.

## What it does

1. **PVWatts (NREL):** models a typical year for a 50 W panel at the set tilt,
   using our 17% derate. Prints sun-hours and Wh/day per month, and the margin
   over the 48 Wh/day nominal and 73 Wh/day worst-case loads.
2. **NASA POWER:** pulls measured daily sunlight for every winter (Nov to Feb)
   from 2014 to 2025, finds the worst 7-day stretch each winter, and replays
   the battery day by day. It starts full, charges from that day's sun, and
   subtracts the load.

The replay has two models:
- **Conservative:** ignores the panel's tilt. Pessimistic on purpose.
- **Tilted:** uses PVWatts to estimate the tilt gain. Slightly optimistic on
  cloudy days.

The real answer sits between them.

## Reading the results

- **Empty days** is the number to watch. Anything above 0 means the node
  would have gone dark that winter at that load.
- **Min batt** is the lowest the battery got, out of 205 Wh.
- CSVs land in `out/`. They're fine to commit and cite in the SRS.

## Things to try

Edit the constants at the top of the script:
- `TILT_DEG`: try 45 to 50. A steeper tilt trades summer output for winter
  output, and winter is the only season that matters here.
- `LOADS_WH_PER_DAY`: plug in measured numbers once the INA219 is logging real
  draw.

The coordinates are city-level on purpose. Solar data doesn't change over a few
km, and the node's real location must never be committed.
