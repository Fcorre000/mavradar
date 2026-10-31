"""Issue a node key. Run from server/: uv run python -m scripts.new_node_key

Prints a new random key and its hash. The key goes on the node only; the hash goes in the
server's MAVRADAR_NODES. Neither one goes in the repo.
"""

import secrets

from app.services.auth import hash_key

key = secrets.token_urlsafe(32)
print(f"node key, for the node's environment only: {key}")
print(f"key_hash, for the server's MAVRADAR_NODES:   {hash_key(key)}")
