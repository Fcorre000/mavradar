"""The detector: radar readings in, crossing states out (blueprint 06, edge detector).

Kept portable on purpose: it imports only the reading types and the contract, never the event
buffer, the transport or the radar driver (tests/test_detector_imports.py checks), so it could move
to a smaller board later.
"""
