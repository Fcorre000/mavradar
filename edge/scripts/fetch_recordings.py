"""Downloads OmniPreSense's four sample recordings into tests/data/omnipresense/. Run from edge/:

    uv run python -m scripts.fetch_recordings

The dataset has no license, so the files stay out of git (.gitignore) and the tests that need
them skip when they're missing. About 233 KB; the videos and CSV copies aren't fetched.
"""

import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/omnipresense/Radar-Datasets/main"
FILES = [
    "Bike_Inbound_231107_1254/Bike_Inbound_231107_1254.txt",
    "Bike_Inbound_231107_1307/Bike_Inbound_231107_1307.txt",
    "Bike_Outbound_231107_1304/Bike_Outbound_231107_1304.txt",
    "Walker_231107_1252/Walker_Outbound_231107_1252.txt",
]
TARGET = Path(__file__).parents[1] / "tests" / "data" / "omnipresense"


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        with urllib.request.urlopen(f"{BASE}/{name}", timeout=30) as response:
            body: bytes = response.read()
        (TARGET / Path(name).name).write_bytes(body)
        print(f"fetched {Path(name).name} ({len(body):,} bytes)")


if __name__ == "__main__":
    main()
