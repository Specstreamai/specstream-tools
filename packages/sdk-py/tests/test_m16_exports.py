"""Forward-compatible parsing, structured conflicts and credential-isolated exports."""

from __future__ import annotations

import io
import json
import urllib.error

import pytest
from specstream_client.client import Client, SpecstreamError


class Response(io.BytesIO):
    status = 200


def data(value):
    return Response(json.dumps({"data": value}).encode())


def test_compile_accepts_additive_server_family():
    client = Client("offline", opener=lambda *_: data({"ast": {"entity_type": "future_family"}}))
    assert client.compile("new source breadth")["ast"]["entity_type"] == "future_family"


def test_conflict_has_structured_details_without_changing_historical_body():
    payload = {"error": {"code": "unquoted_plan", "details": {"current_version": 8}}}
    for body in (payload, json.dumps(payload), json.dumps(payload).encode()):
        error = SpecstreamError("conflict", 409, body)
        assert error.status == 409 and error.code == "unquoted_plan"
        assert error.details == {"current_version": 8} and error.body == body
    assert SpecstreamError("bad gateway", 502, "<html>").details == {}


@pytest.mark.parametrize("format", ["xlsx", "csv", "json", "html"])
def test_download_fetches_capability_without_bearer_or_cookie(format):
    calls = []

    def opener(request, timeout):
        calls.append(request)
        if request.get_method() == "POST":
            assert request.get_header("Authorization") == "Bearer offline"
            assert json.loads(request.data)["format"] == format
            return data({"download_url": "https://specstream.ai/export/one_use"})
        assert request.get_header("Authorization") is None
        assert request.get_header("Cookie") is None
        assert request.get_header("Accept-encoding") == "identity"
        return Response(b"owned-artifact")

    assert Client("offline", opener=opener).download_export("find", format) == b"owned-artifact"
    assert len(calls) == 2


@pytest.mark.parametrize(
    "url",
    [
        "https://other.example/export/capability",
        "https://api.specstream.ai.other.example/export/capability",
        "https://user@specstream.ai/export/capability",
        "https://@specstream.ai/export/capability",
        "http://specstream.ai/export/capability",
        "https://specstream.ai/v1/account/export",
        "https://specstream.ai/export/capability?leak=yes",
        "https://specstream.ai/export/%2e%2e",
        "https://specstream.ai\\@other.example/export/capability",
        "https://specstream.ai:bad/export/capability",
        "https://specstream.ai:0/export/capability",
        "\nhttps://specstream.ai/export/capability",
    ],
)
def test_untrusted_export_location_is_rejected_before_download(url):
    calls = []

    def opener(request, timeout):
        calls.append(request)
        return data({"download_url": url})

    with pytest.raises(SpecstreamError, match="download location"):
        Client("offline", opener=opener).download_export("find")
    assert len(calls) == 1


@pytest.mark.parametrize("body,limit,message", [(b"", 20, "no body"), (b"12345", 4, "max_bytes")])
def test_empty_and_oversized_exports_fail_instead_of_returning_a_false_delivery(
    body, limit, message
):
    def opener(request, timeout):
        if request.get_method() == "POST":
            return data({"download_url": "https://specstream.ai/export/capability"})
        return Response(body)

    with pytest.raises(SpecstreamError, match=message):
        Client("offline", opener=opener).download_export("find", max_bytes=limit)


def test_transport_errors_do_not_expose_download_capability():
    def opener(request, timeout):
        if request.get_method() == "POST":
            return data({"download_url": "https://specstream.ai/export/private_capability"})
        raise urllib.error.URLError(request.full_url)

    with pytest.raises(SpecstreamError) as failure:
        Client("offline", opener=opener).download_export("find")
    assert "private_capability" not in str(failure.value)
    assert failure.value.body is None


@pytest.mark.parametrize("limit", [0, -1, True, 0.5])
def test_invalid_download_bound_does_not_create_capability(limit):
    def refused(*_):
        pytest.fail("invalid byte limit reached the API")

    with pytest.raises(ValueError):
        Client("offline", opener=refused).download_export("find", max_bytes=limit)


@pytest.mark.parametrize(
    "origin,url",
    [
        ("https://local.example", "https://local.example:443/export/one_use"),
        ("https://local.example:443", "https://local.example/export/one_use"),
    ],
)
def test_explicit_default_port_is_the_same_export_origin(origin, url):
    def opener(request, timeout):
        return data({"download_url": url}) if request.get_method() == "POST" else Response(b"owned")

    assert Client("offline", base_url=origin, opener=opener).download_export("find") == b"owned"


def test_real_download_redirect_is_not_followed_and_never_carries_bearer():
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    seen = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            seen.append((self.path, self.headers.get("Authorization")))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {
                        "data": {
                            "download_url": f"http://127.0.0.1:{self.server.server_port}/export/one_use"
                        }
                    }
                ).encode()
            )

        def do_GET(self):
            seen.append((self.path, self.headers.get("Authorization")))
            self.send_response(302)
            self.send_header("Location", "/unexpected")
            self.end_headers()

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        client = Client("offline", base_url=f"http://127.0.0.1:{server.server_port}")
        with pytest.raises(SpecstreamError) as failure:
            client.download_export("find")
        assert failure.value.status == 302 and failure.value.body is None
        assert seen == [("/v1/finds/find/export", "Bearer offline"), ("/export/one_use", None)]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        assert not thread.is_alive()
