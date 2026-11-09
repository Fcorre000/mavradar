"""The detector stays portable: it may import the standard library, the contract, the reading
types and itself, nothing else from the node (09 E2 done-when)."""

import ast
from pathlib import Path

import pytest

DETECTOR = Path(__file__).parents[1] / "mavradar_edge" / "detector"
ALLOWED = ("mavradar_edge.contract", "mavradar_edge.radar.source", "mavradar_edge.detector")


def node_imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text())
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names += [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.append(node.module)
    return [name for name in names if name.startswith("mavradar_edge")]


@pytest.mark.parametrize("path", sorted(DETECTOR.glob("*.py")), ids=lambda p: p.name)
def test_the_detector_imports_only_portable_modules(path: Path) -> None:
    for name in node_imports(path):
        assert name.startswith(ALLOWED), f"{path.name} imports {name}"


def test_the_check_catches_a_forbidden_import(tmp_path: Path) -> None:
    bad = tmp_path / "bad.py"
    bad.write_text("from mavradar_edge.radar.replay import ReplaySource\n")

    assert not all(name.startswith(ALLOWED) for name in node_imports(bad))
