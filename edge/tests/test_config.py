"""NodeConfig from environment variables: defaults, and a clear error for anything bad."""

from pathlib import Path

import pytest

from mavradar_edge.config import ConfigError, NodeConfig

BASE = {"MAVRADAR_NODE_ID": "node-a", "MAVRADAR_NODE_CROSSING_ID": "794980D"}


def test_defaults() -> None:
    config = NodeConfig.from_env(BASE)

    assert config == NodeConfig(node_id="node-a", crossing_id="794980D")
    assert config.log_only  # on unless turned off on purpose
    assert config.replay_log is None and config.replay_speed == 1.0


def test_everything_set() -> None:
    config = NodeConfig.from_env(
        BASE
        | {
            "MAVRADAR_NODE_LOG_ONLY": "False",
            "MAVRADAR_NODE_REPLAY_LOG": "tests/data/truck.jsonl",
            "MAVRADAR_NODE_REPLAY_SPEED": "10",
        }
    )

    assert not config.log_only
    assert config.replay_log == Path("tests/data/truck.jsonl")
    assert config.replay_speed == 10


@pytest.mark.parametrize("missing", ["MAVRADAR_NODE_ID", "MAVRADAR_NODE_CROSSING_ID"])
def test_a_required_setting_is_missing(missing: str) -> None:
    env = {k: v for k, v in BASE.items() if k != missing}

    with pytest.raises(ConfigError, match=missing):
        NodeConfig.from_env(env)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("MAVRADAR_NODE_LOG_ONLY", "yes please"),
        ("MAVRADAR_NODE_REPLAY_SPEED", "fast"),
        ("MAVRADAR_NODE_REPLAY_SPEED", "-2"),
    ],
)
def test_a_bad_value_is_refused(name: str, value: str) -> None:
    with pytest.raises(ConfigError, match=name):
        NodeConfig.from_env(BASE | {name: value})


def test_a_blank_log_only_still_means_on() -> None:
    assert NodeConfig.from_env(BASE | {"MAVRADAR_NODE_LOG_ONLY": "  "}).log_only


def test_range_bin_size() -> None:
    assert NodeConfig.from_env(BASE).range_bin_m == 1.0
    assert NodeConfig.from_env(BASE | {"MAVRADAR_NODE_RANGE_BIN_M": "0.34"}).range_bin_m == 0.34


@pytest.mark.parametrize("value", ["wide", "0", "-1"])
def test_a_bad_range_bin_size_is_refused(value: str) -> None:
    with pytest.raises(ConfigError, match="MAVRADAR_NODE_RANGE_BIN_M"):
        NodeConfig.from_env(BASE | {"MAVRADAR_NODE_RANGE_BIN_M": value})


def test_detector_thresholds_come_from_settings() -> None:
    config = NodeConfig.from_env(BASE | {"MAVRADAR_NODE_MIN_SPEED_MPS": "4.5", "MAVRADAR_NODE_GAP_S": "2"})

    assert config.detector.min_speed_mps == 4.5 and config.detector.gap_s == 2
    assert NodeConfig.from_env(BASE).detector.present_duration_s == 10  # the default


@pytest.mark.parametrize(
    "change",
    [
        {"MAVRADAR_NODE_MIN_MAGNITUDE": "loud"},
        {"MAVRADAR_NODE_GAP_S": "-1"},
        {"MAVRADAR_NODE_TRACK_BAND_MIN_M": "25"},  # above the max of 23
    ],
)
def test_a_bad_threshold_is_refused(change: dict[str, str]) -> None:
    with pytest.raises(ConfigError):
        NodeConfig.from_env(BASE | change)


# The uplink


def test_uplink_defaults() -> None:
    config = NodeConfig.from_env(BASE)

    assert config.server_url is None and config.node_key is None  # a run with no server
    assert config.buffer_path == Path("data/events.db")
    assert (config.send_timeout_s, config.retry_first_s, config.retry_max_s) == (10, 1, 60)


def test_uplink_settings() -> None:
    config = NodeConfig.from_env(
        BASE
        | {
            "MAVRADAR_NODE_SERVER_URL": "https://ingest.example.com/",
            "MAVRADAR_NODE_KEY": "a-secret-key",
            "MAVRADAR_NODE_BUFFER_PATH": "/var/lib/mavradar/events.db",
            "MAVRADAR_NODE_RETRY_MAX_S": "120",
        }
    )

    assert config.server_url == "https://ingest.example.com"
    assert config.node_key == "a-secret-key"
    assert config.buffer_path == Path("/var/lib/mavradar/events.db")
    assert config.retry_max_s == 120


def test_the_node_key_never_shows_when_the_config_is_printed() -> None:
    config = NodeConfig.from_env(BASE | {"MAVRADAR_NODE_KEY": "a-secret-key"})

    assert "a-secret-key" not in repr(config) and "a-secret-key" not in str(config)


@pytest.mark.parametrize(
    "change",
    [
        {"MAVRADAR_NODE_SERVER_URL": "http://ingest.example.com"},  # the key would travel in the clear
        {"MAVRADAR_NODE_SEND_TIMEOUT_S": "0"},
        {"MAVRADAR_NODE_RETRY_FIRST_S": "soon"},
        {"MAVRADAR_NODE_RETRY_FIRST_S": "90"},  # more than the max of 60
    ],
)
def test_a_bad_uplink_setting_is_refused(change: dict[str, str]) -> None:
    with pytest.raises(ConfigError):
        NodeConfig.from_env(BASE | change)
