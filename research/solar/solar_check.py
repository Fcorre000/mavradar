#!/usr/bin/env python3
"""
MavRadar solar sizing check.

Pulls two public datasets for Arlington, TX and checks the node's power
system (50 W panel, 20 Ah LiFePO4) against real sunlight:

  1. NREL PVWatts v8: modeled monthly output for a 50 W panel at a tilt.
  2. NASA POWER: measured daily sunlight for past winters, used to replay
     the battery day by day through the worst stretches.

Standard library only. Run:  python3 solar_check.py
Optional: export NREL_API_KEY=your_key   (DEMO_KEY works but is rate limited)
Results print to the terminal and are saved as CSVs in ./out/
"""

import csv
import json
import os
import sys
import urllib.parse
import urllib.request
from calendar import monthrange
from datetime import date, timedelta

# ---- Inputs (edit these) -------------------------------------------------

# City-level coordinates for Arlington, TX. Solar data doesn't change over a
# few km, so there is no need for the node's exact spot. Never put the real
# deployment coordinates here: this folder lives in a public repo.
LAT, LON = 32.735, -97.108

PANEL_W = 50            # Renogy 50 W
TILT_DEG = 45           # about equal to latitude; raise to ~45-50 to favor winter
AZIMUTH_DEG = 180       # facing south

# Our derate stack from the hardware report: 0.90 tolerance/wiring x 0.95
# soiling x 0.97 MPPT = 0.829, i.e. about 17% loss.
DERATE = 0.90 * 0.95 * 0.97
PVWATTS_LOSSES_PCT = round((1 - DERATE) * 100, 1)

USABLE_WH = 205         # 256 Wh x 0.80 usable (12 V 20 Ah LiFePO4)
LOADS_WH_PER_DAY = {"nominal": 48, "worst case": 73}   # radar build

# Winters to replay with NASA daily data (Nov 1 through end of Feb).
FIRST_WINTER, LAST_WINTER = 2014, 2024   # 2024 = Nov 2024 to Feb 2025

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


# ---- HTTP ----------------------------------------------------------------

def get_json(url, params):
    full = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full, headers={"User-Agent": "MavRadar-solar-check"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


# ---- 1. PVWatts ----------------------------------------------------------

def fetch_pvwatts():
    data = get_json("https://developer.nlr.gov/api/pvwatts/v8.json", {
        "api_key": os.environ.get("NREL_API_KEY", "DEMO_KEY"),
        "system_capacity": PANEL_W / 1000,   # kW
        "module_type": 0,                    # standard
        "losses": PVWATTS_LOSSES_PCT,
        "array_type": 0,                     # fixed, open rack
        "tilt": TILT_DEG,
        "azimuth": AZIMUTH_DEG,
        "lat": LAT,
        "lon": LON,
        "dataset": "nsrdb",
        "timeframe": "monthly",
    })
    if data.get("errors"):
        sys.exit(f"PVWatts error: {data['errors']}")
    return data


def pvwatts_table(data, year_for_days=2023):
    """Monthly DC Wh/day (we run DC, so skip the inverter) and sun-hours."""
    out = data["outputs"]
    rows = []
    for i, name in enumerate(MONTHS):
        days = monthrange(year_for_days, i + 1)[1]
        rows.append({
            "month": name,
            "sun_hours_on_panel": round(out["solrad_monthly"][i], 2),
            "harvest_wh_per_day": round(out["dc_monthly"][i] * 1000 / days, 1),
        })
    return rows


# ---- 2. NASA POWER -------------------------------------------------------

def fetch_nasa_daily(start, end):
    data = get_json("https://power.larc.nasa.gov/api/temporal/daily/point", {
        "parameters": "ALLSKY_SFC_SW_DWN",   # sunlight on flat ground, kWh/m2/day
        "community": "RE",
        "latitude": LAT,
        "longitude": LON,
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "format": "JSON",
    })
    series = data["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    fill = data.get("header", {}).get("fill_value", -999)
    return {date(int(k[:4]), int(k[4:6]), int(k[6:])): v
            for k, v in series.items() if v is not None and v != fill}


def tilt_factor(pv_rows, nasa):
    """
    Wh of panel output per 1 kWh/m2 of flat-ground sunlight, per month.
    Calibrates NASA's flat-ground numbers to our tilted, derated panel using
    PVWatts. It slightly flatters cloudy days (tilt helps less when light is
    diffuse), so the conservative column ignores tilt entirely.
    """
    factors = {}
    for m in range(1, 13):
        vals = [v for d, v in nasa.items() if d.month == m]
        if vals:
            flat_avg = sum(vals) / len(vals)
            factors[m] = pv_rows[m - 1]["harvest_wh_per_day"] / flat_avg
    return factors


def replay_winter(days, harvest, load):
    """Day-by-day battery simulation. Starts full, clamps at 0 and full."""
    soc = USABLE_WH
    min_soc, empty_days = soc, 0
    for d in days:
        soc = min(USABLE_WH, soc + harvest[d] - load)
        if soc <= 0:
            soc = 0
            empty_days += 1
        min_soc = min(min_soc, soc)
    return min_soc, empty_days


def worst_week(days, harvest):
    best = None
    for i in range(len(days) - 6):
        window = days[i:i + 7]
        avg = sum(harvest[d] for d in window) / 7
        if best is None or avg < best[0]:
            best = (avg, window[0])
    return best


# ---- Main ----------------------------------------------------------------

def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    print(f"Location {LAT}, {LON} | {PANEL_W} W panel, tilt {TILT_DEG}, "
          f"losses {PVWATTS_LOSSES_PCT}% | {USABLE_WH} Wh usable\n")

    # PVWatts
    pv = fetch_pvwatts()
    st = pv.get("station_info", {})
    print(f"PVWatts weather data: {st.get('weather_data_source', '?')}, "
          f"{st.get('distance', '?')} m from point")
    pv_rows = pvwatts_table(pv)
    with open(os.path.join(OUT_DIR, "pvwatts_monthly.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=pv_rows[0].keys())
        w.writeheader()
        w.writerows(pv_rows)

    print("\nPVWatts typical year")
    print(f"{'Month':<6}{'Sun-hours':>10}{'Wh/day':>9}{'x nominal':>11}{'x worst':>9}")
    for r in pv_rows:
        h = r["harvest_wh_per_day"]
        print(f"{r['month']:<6}{r['sun_hours_on_panel']:>10}{h:>9}"
              f"{h / LOADS_WH_PER_DAY['nominal']:>10.1f}x"
              f"{h / LOADS_WH_PER_DAY['worst case']:>8.1f}x")

    # NASA POWER, all winters in one request
    start = date(FIRST_WINTER, 11, 1)
    end = date(LAST_WINTER + 1, 2, 28)
    nasa = fetch_nasa_daily(start, end)
    factors = tilt_factor(pv_rows, nasa)

    summary = []
    for y in range(FIRST_WINTER, LAST_WINTER + 1):
        d0, d1 = date(y, 11, 1), date(y + 1, 2, 28)
        days = [d0 + timedelta(n) for n in range((d1 - d0).days + 1)]
        days = [d for d in days if d in nasa]
        if len(days) < 100:
            continue
        # Conservative: flat-ground sun-hours x panel x derate, no tilt gain
        cons = {d: nasa[d] * PANEL_W * DERATE for d in days}
        # Tilted: calibrated with PVWatts
        tilt = {d: nasa[d] * factors[d.month] for d in days}
        for label, harvest in (("conservative", cons), ("tilted", tilt)):
            wk_avg, wk_start = worst_week(days, harvest)
            row = {"winter": f"{y}-{y + 1}", "model": label,
                   "worst_week_start": wk_start.isoformat(),
                   "worst_week_wh_per_day": round(wk_avg, 1)}
            for name, load in LOADS_WH_PER_DAY.items():
                min_soc, empty = replay_winter(days, harvest, load)
                row[f"min_battery_wh_{name}"] = round(min_soc)
                row[f"empty_days_{name}"] = empty
            summary.append(row)

    with open(os.path.join(OUT_DIR, "winter_replay.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=summary[0].keys())
        w.writeheader()
        w.writerows(summary)

    print("\nNASA POWER winter replay (Nov-Feb), battery starts full")
    print(f"{'Winter':<11}{'Model':<14}{'Worst week':>12}{'Wh/day':>8}"
          f"{'Min batt nom':>14}{'Empty nom':>12}{'Min batt worst':>16}{'Empty worst':>12}")
    for r in summary:
        print(f"{r['winter']:<11}{r['model']:<14}{r['worst_week_start']:>12}"
              f"{r['worst_week_wh_per_day']:>8}"
              f"{r['min_battery_wh_nominal']:>14}{r['empty_days_nominal']:>12}"
              f"{r['min_battery_wh_worst case']:>16}{r['empty_days_worst case']:>12}")

    print(f"\nCSVs saved to {OUT_DIR}")


if __name__ == "__main__":
    main()
