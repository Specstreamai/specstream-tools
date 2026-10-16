"""SpecStream tap class."""

from __future__ import annotations

from singer_sdk import Tap
from singer_sdk import typing as th

from tap_specstream.streams import ListsStream, RecordsStream


class TapSpecStream(Tap):
    """Singer tap for SpecStream. It only reads: it never starts a request or spends from your balance."""

    name = "tap-specstream"

    config_jsonschema = th.PropertiesList(
        th.Property(
            "api_key",
            th.StringType,
            required=True,
            secret=True,
            description="A SpecStream API key from Agents & API. The tap only reads, so a $0 spending limit is enough.",
        ),
        th.Property(
            "start_date",
            th.DateTimeType,
            description="Read only lists created after this time. Leave empty for every list.",
        ),
        th.Property(
            "api_url",
            th.StringType,
            default="https://api.specstream.ai",
            description="The SpecStream API.",
        ),
    ).to_dict()

    def discover_streams(self):
        return [ListsStream(self), RecordsStream(self)]


if __name__ == "__main__":
    TapSpecStream.cli()
