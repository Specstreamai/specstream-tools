"""Offline shaping tests, plus the Singer SDK's standard tap tests when SPECSTREAM_API_KEY is set."""

import os
from datetime import datetime, timedelta, timezone

import pytest

from tap_specstream.streams import shape_record
from tap_specstream.tap import TapSpecStream


def test_found_records_keep_each_value_with_its_page():
    row = {
        "ordinal": 3,
        "entity_id": "ent_1",
        "cells": [
            {"column_id": "business", "label": "Business", "display": "Ace Roofing",
             "provenance": {"source_url": "https://ace.example/", "observed_at": "2026-10-16T06:00:00Z"}},
            {"column_id": "email", "label": "Email", "absence": "not_published", "display": "Not published"},
            {"column_id": "open", "label": "Open", "display": "Open"},
        ],
    }
    record = shape_record(row, "fnd_1", "2026-10-16T06:00:00+00:00")
    assert record["record_id"] == "3" and record["entity_id"] == "ent_1"
    assert record["values"] == {"Business": "Ace Roofing", "Email": None}
    assert record["cells"][0]["source_url"] == "https://ace.example/"


def test_imported_and_combined_rows():
    imported = shape_record({"id": "r1", "provided": {"Company": "Acme", "Employees": 40}}, "imp_1", "2026-10-16T06:00:00+00:00")
    assert imported["record_id"] == "r1" and imported["values"]["Employees"] == "40"
    combined = shape_record(
        {"id": "r2", "sources": [{"row": {"entity_id": "ent_9"}}],
         "field_values": {"phone": [{"label": "Phone", "display": "555", "provenance": {"source_url": "https://p.example"}}],
                          "matches": [{}]}},
        "cmb_1", "2026-10-16T06:00:00+00:00",
    )
    assert combined["entity_id"] == "ent_9" and combined["values"] == {"Phone": "555"}


KEY = os.environ.get("SPECSTREAM_API_KEY")

if KEY:
    from singer_sdk.testing import get_tap_test_class

    TestTapSpecStream = get_tap_test_class(
        tap_class=TapSpecStream,
        config={
            "api_key": KEY,
            "start_date": (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    )
else:

    @pytest.mark.skip(reason="Set SPECSTREAM_API_KEY to run the live tap tests.")
    def test_live_tap():
        pass
