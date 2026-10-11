from __future__ import annotations

import json
from urllib.parse import parse_qs, urlsplit

import pytest
from specstream_client.client import Client
from tests.test_client import _FakeResponse


def test_continuation_quote_does_not_execute_or_change_its_parent():
    calls = []

    def opener(request, timeout):
        calls.append((request.full_url, json.loads(request.data) if request.data else None))
        return _FakeResponse({"quote_id": "cqt_next", "maximum_cents": 250})

    client = Client("fixture-key", opener=opener)
    scope = {
        "ast_hash": "a" * 64,
        "operation": "refresh",
        "parent_find_id": "fnd_parent",
        "requested_units": 25,
    }
    client.quote_capacity_work(scope)
    assert calls == [("https://api.specstream.ai/v1/capacity/quotes", scope)]


def test_row_page_cursor_and_revisit_cursor_use_their_actual_contracts():
    calls = []

    def opener(request, timeout):
        calls.append(request.full_url)
        return _FakeResponse({"rows": [], "next_cursor": None})

    client = Client("fixture-key", opener=opener)
    client.rows("fnd/a", cursor="opaque?&page", limit=17)
    client.revisit("fnd/a", after="target?&id", limit=20)
    assert urlsplit(calls[0]).path.endswith("/fnd%2Fa/rows")
    assert parse_qs(urlsplit(calls[0]).query) == {"cursor": ["opaque?&page"], "limit": ["17"]}
    assert parse_qs(urlsplit(calls[1]).query) == {"after": ["target?&id"], "limit": ["20"]}
    for limit in (True, 0, 101, 1.2, "3"):
        with pytest.raises(ValueError):
            client.rows("fnd/a", limit=limit)
    assert len(calls) == 2
