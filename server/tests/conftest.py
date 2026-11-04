"""Applies to every test."""

import os

# The lifespan builds a real Firestore client. Pointing it at a local emulator means it needs no
# credentials (CI has none) and that a test which forgot to swap in memory storage could never
# write to the real database. `firebase emulators:exec` sets its own value, which wins.
os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
