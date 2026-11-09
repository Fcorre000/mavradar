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
