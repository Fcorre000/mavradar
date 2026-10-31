"""NodeAuthenticator: which node, if any, a key belongs to (OQ3)."""

import hashlib
import hmac
from collections.abc import Mapping
from dataclasses import dataclass

from app.config import NodeConfig


def hash_key(key: str) -> str:
    # Plain SHA-256 is enough: node keys are 32 random bytes, not guessable passwords, so a slow
    # password hash would only add latency to every event.
    return hashlib.sha256(key.encode()).hexdigest()


@dataclass(frozen=True)
class Node:
    node_id: str
    crossing_id: str


class NodeAuthenticator:
    def __init__(self, nodes: Mapping[str, NodeConfig]) -> None:
        self._nodes = nodes

    def verify(self, key: str | None) -> Node | None:
        """The node this key belongs to, or None for a missing or wrong key."""
        if not key:
            return None
        presented = hash_key(key)
        found: Node | None = None
        # Check every node, with compare_digest rather than ==, so the time taken leaks nothing
        # about which hash came close.
        for node_id, node in self._nodes.items():
            if hmac.compare_digest(presented, node.key_hash):
                found = Node(node_id=node_id, crossing_id=node.crossing_id)
        return found
