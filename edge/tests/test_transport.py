"""The transport: HttpsTransport against a small local server (plain http is allowed to
localhost), and the fake one the other tests use."""

import json
import socket
import threading
import time
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from mavradar_edge.transport.transport import FakeTransport, HttpsTransport, Response, check_server_url
from tests.factories import event

KEY = "test-node-key"


class Server:
    """Answers every POST with `status` and remembers what it was sent."""

    def __init__(self) -> None:
        self.status = 200
        self.delay_s = 0.0
        self.location: str | None = None
        self.requests: list[tuple[str, str | None, str | None, object]] = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length", "0"))
                body: object = json.loads(self.rfile.read(length) or b"null")
                outer.requests.append(
                    (self.path, self.headers.get("X-Node-Key"), self.headers.get("Content-Type"), body)
                )
                time.sleep(outer.delay_s)
                self.send_response(outer.status)
                if outer.location:
                    self.send_header("Location", outer.location)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def do_GET(self) -> None:  # only reached if a redirect is followed
                outer.requests.append((self.path, self.headers.get("X-Node-Key"), None, None))
                self.send_response(200)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, format: str, *args: object) -> None:
                pass

        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self._httpd.server_address[1]}"
        # A short poll so shutdown() returns quickly; the default waits up to half a second.
        threading.Thread(target=lambda: self._httpd.serve_forever(poll_interval=0.01), daemon=True).start()

    def close(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()


@pytest.fixture
def server() -> Iterator[Server]:
    s = Server()
    yield s
    s.close()


# HttpsTransport


def test_posts_the_event_as_json_with_the_key_header(server: Server) -> None:
    body = event().to_dict()

    response = HttpsTransport(server.url + "/", KEY).post("/events", body)

    assert response == Response(200)
    assert server.requests == [("/events", KEY, "application/json", body)]


@pytest.mark.parametrize("status", [401, 422, 500, 503])
def test_an_error_answer_is_a_status_not_an_exception(server: Server, status: int) -> None:
    server.status = status

    assert HttpsTransport(server.url, KEY).post("/events", {}) == Response(status)


def test_no_server_is_no_answer() -> None:
    with socket.socket() as s:  # a port nothing is listening on
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    assert HttpsTransport(f"http://127.0.0.1:{port}", KEY).post("/events", {}) == Response(None)


def test_a_slow_server_times_out_as_no_answer(server: Server) -> None:
    server.delay_s = 1.0

    assert HttpsTransport(server.url, KEY, timeout_s=0.2).post("/events", {}) == Response(None)


def test_a_redirect_is_not_followed_so_the_key_goes_nowhere_else(server: Server) -> None:
    server.status, server.location = 302, server.url + "/elsewhere"

    assert HttpsTransport(server.url, KEY).post("/events", {}) == Response(302)
    assert [path for path, *_ in server.requests] == ["/events"]


# The server URL


@pytest.mark.parametrize(
    "url",
    [
        "https://ingest.example.com",
        "https://ingest.example.com/",
        "http://localhost:8090",
        "http://127.0.0.1:8090",
    ],
)
def test_https_or_local_http_is_accepted(url: str) -> None:
    assert check_server_url(url) == url.rstrip("/")


@pytest.mark.parametrize(
    "url", ["http://ingest.example.com", "ftp://ingest.example.com", "ingest.example.com", ""]
)
def test_plain_http_to_another_machine_is_refused(url: str) -> None:
    with pytest.raises(ValueError):
        check_server_url(url)

    with pytest.raises(ValueError):
        HttpsTransport(url, KEY)


# FakeTransport


def test_the_fake_answers_from_its_script_then_200_and_records_posts() -> None:
    fake = FakeTransport([503, None])

    answers = [fake.post("/events", {"n": n}) for n in range(3)]

    assert answers == [Response(503), Response(None), Response(200)]
    assert fake.posts == [("/events", {"n": 0}), ("/events", {"n": 1}), ("/events", {"n": 2})]
