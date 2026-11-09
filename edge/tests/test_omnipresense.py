"""The reader for OmniPreSense's sample recordings. A hand-made sample in their format always runs;
the real four files run only once scripts/fetch_recordings.py has downloaded them (no license, so
never committed)."""

from pathlib import Path

import pytest

from mavradar_edge.radar.omnipresense import RecordingFormatError, RecordingSource, read_omnipresense
from mavradar_edge.radar.source import RadarSource, Speed, SpeedReport

RECORDINGS = Path(__file__).parent / "data" / "omnipresense"
PAD = "\t" * 20  # every line in the real files is padded with empty columns

# Their format: raw I/Q lines, and speed reports with the date, then magnitude and speed pairs.
SAMPLE = "\n".join(
    [
        '{"I":[2119\t2042\t2108]}' + PAD,
        '{"Q":[2120\t2012\t2096]}' + PAD,
        "Tue Nov  7 2023 20:54:49.396 GMT\t72.81\t5.58\t47.77\t5.64\t38.02\t5.52" + PAD,
        '{"I":[2044\t2072]}' + PAD,
        "Tue Nov  7 2023 20:55:00.416 GMT\t29.28\t-8.98" + PAD,
    ]
)


def test_reads_the_speed_reports_and_skips_the_raw_samples(tmp_path: Path) -> None:
    path = tmp_path / "Bike.txt"
    path.write_text(SAMPLE)

    reports = read_omnipresense(path)

    assert reports == [
        SpeedReport(0.0, (Speed(5.58, 72.81), Speed(5.64, 47.77), Speed(5.52, 38.02))),
        SpeedReport(pytest.approx(11.02), (Speed(-8.98, 29.28),)),  # pyright: ignore[reportArgumentType]
    ]


def test_a_broken_line_names_its_line_number(tmp_path: Path) -> None:
    path = tmp_path / "Bad.txt"
    path.write_text(SAMPLE + "\nTue Nov  7 2023 20:55:01.000 GMT\t29.28\n")

    with pytest.raises(RecordingFormatError, match="line 6: expected magnitude and speed pairs"):
        read_omnipresense(path)


def test_a_recording_is_a_radar_source(tmp_path: Path) -> None:
    path = tmp_path / "Bike.txt"
    path.write_text(SAMPLE)
    source: RadarSource = RecordingSource(path)

    assert len(list(source.readings())) == 2
    assert list(source.range_frames(10)) == []  # an OPS243-A has no range mode


real = pytest.mark.skipif(
    not any(RECORDINGS.glob("*.txt")), reason="run scripts/fetch_recordings.py to get the sample recordings"
)


@real
def test_the_real_recordings_read_as_the_research_page_describes() -> None:
    by_name = {path.stem: read_omnipresense(path) for path in RECORDINGS.glob("*.txt")}

    assert len(by_name) == 4
    bike = by_name["Bike_Inbound_231107_1254"]
    assert bike[0].objects[0] == Speed(5.58, 72.81)  # toward the radar, as the sensor reported
    walker = by_name["Walker_Outbound_231107_1252"]
    assert max(o.magnitude for r in walker for o in r.objects) == 326.84  # close, so strongest
    assert all(o.mps < 0 for r in by_name["Bike_Outbound_231107_1304"] for o in r.objects)
