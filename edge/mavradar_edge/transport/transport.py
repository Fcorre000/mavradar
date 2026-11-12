"""Transport: moves one message to the ingest API and says how it went (07, Strategy card).

The uplink is a swappable transport (Amendment 001): Wi-Fi, Ethernet and Cat-M all give the node
an IP address, so today they are one HTTPS client. The transport only moves bytes; the Uplink owns
the buffer and the retries. A network failure is an answer (no status), never an exception.
"""

import http.client
import json
import threading
import urllib.error
import urllib.request
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlsplit

LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")
# The server reads the node's key from this header (server/app/api/deps.py). Authorization is left
# for the Google-signed tokens on the /tasks routes, so each header means one thing.
KEY_HEADER = "X-Node-Key"


@dataclass(frozen=True)
class Response:
    status: int | None  # None: no answer at all (timeout, no network, connection refused)


class Transport(Protocol):
    def post(self, path: str, body: Mapping[str, object]) -> Response: ...


def check_server_url(url: str) -> str:
    """The server's base URL, without a trailing slash. Plain http is refused except to this
    machine, because the node's key would travel unencrypted."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError(f"not a server URL: {url!r}")
    if parts.scheme == "http" and parts.hostname not in LOCAL_HOSTS:
        raise ValueError("the server URL must be https (http is only for localhost)")
    return url.rstrip("/")


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    """A redirect would resend the request, key header included, to wherever it points. The node
    talks to one server; a 3xx is just an answer that isn't 200."""

    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


class HttpsTransport:
    def __init__(self, server_url: str, node_key: str, timeout_s: float = 10.0) -> None:
        self._base = check_server_url(server_url)
        self._key = node_key  # never logged
        self._timeout_s = timeout_s
        self._opener = urllib.request.build_opener(_NoRedirects)

    def post(self, path: str, body: Mapping[str, object]) -> Response:
        request = urllib.request.Request(
            self._base + path,
            data=json.dumps(body, separators=(",", ":")).encode(),
            headers={"Content-Type": "application/json", KEY_HEADER: self._key},
            method="POST",
        )
        try:
            with self._opener.open(request, timeout=self._timeout_s) as answer:
                return Response(answer.status)
        except urllib.error.HTTPError as error:  # any non-2xx answer, 3xx included
            return Response(error.code)
        except (OSError, http.client.HTTPException):  # URLError and timeouts are OSErrors
            return Response(None)


class FakeTransport:
    """For tests: answers from a script and records every post. Once the script runs out it
    answers 200. Clear `gate` to make every post hang until it is set again, like a dead link."""

    def __init__(self, statuses: Sequence[int | None] = ()) -> None:
        self._statuses = list(statuses)
        self.posts: list[tuple[str, Mapping[str, object]]] = []
        self.gate = threading.Event()
        self.gate.set()

    def post(self, path: str, body: Mapping[str, object]) -> Response:
        self.posts.append((path, body))
        self.gate.wait()
        return Response(self._statuses.pop(0) if self._statuses else 200)
