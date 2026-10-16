"""SpecStream streams: your lists, and the records of each with every value's source page."""

from __future__ import annotations

import typing as t
from datetime import datetime

from singer_sdk import RESTStream
from singer_sdk import typing as th
from singer_sdk.authenticators import BearerTokenAuthenticator
from singer_sdk.pagination import JSONPathPaginator

# Workspace buttons, not facts.
BUTTON_COLUMNS = {"matches", "open"}


def _when(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


class SpecStreamStream(RESTStream):
    """A SpecStream API stream."""

    @property
    def url_base(self) -> str:
        return str(self.config.get("api_url") or "https://api.specstream.ai").rstrip("/")

    @property
    def authenticator(self) -> BearerTokenAuthenticator:
        return BearerTokenAuthenticator(token=self.config["api_key"])

    @property
    def http_headers(self) -> dict:
        return {"Accept": "application/json", "User-Agent": "tap-specstream"}


class NewestFirstPaginator(JSONPathPaginator):
    """Follows `next_after` until a page reaches lists synced before."""

    def __init__(self, synced_through: datetime | None) -> None:
        super().__init__("$.data.next_after")
        self.synced_through = synced_through

    def has_more(self, response) -> bool:
        lists = response.json()["data"].get("collections") or []
        if self.synced_through and lists:
            oldest = _when(lists[-1].get("created_at"))
            if oldest and oldest <= self.synced_through:
                return False
        return super().has_more(response)


class ListsStream(SpecStreamStream):
    """Every list the API key can open: found, imported, combined. Newer runs read only new lists; a
    SpecStream schedule delivers new and changed records as a new list."""

    name = "lists"
    path = "/v1/workspace/collections"
    primary_keys = ("id",)
    replication_key = "created_at"
    is_sorted = False  # The API returns the newest first.
    records_jsonpath = "$.data.collections[*]"

    schema = th.PropertiesList(
        th.Property("id", th.StringType, required=True, description="The list's ID."),
        th.Property("name", th.StringType, description="The list's name."),
        th.Property("kind", th.StringType, description="find, snapshot, import or combined."),
        th.Property("imported", th.BooleanType, description="Whether you imported the list's rows."),
        th.Property("project_id", th.StringType),
        th.Property("created_at", th.DateTimeType, required=True),
        th.Property("row_count", th.IntegerType, description="How many records the list has."),
        th.Property("link", th.StringType, description="The list in SpecStream."),
    ).to_dict()

    def _synced_through(self, context) -> datetime | None:
        return self.get_starting_timestamp(context)

    def get_new_paginator(self) -> NewestFirstPaginator:
        return NewestFirstPaginator(self._synced_through(None))

    def get_url_params(self, context, next_page_token) -> dict[str, t.Any]:
        params: dict[str, t.Any] = {"limit": 100, "sort": "recent"}
        if next_page_token:
            params["after"] = next_page_token
        return params

    def post_process(self, row: dict, context=None) -> dict | None:
        synced_through = self._synced_through(context)
        created = _when(row.get("created_at"))
        if synced_through and created and created <= synced_through:
            return None
        return {
            "id": row["id"],
            "name": row.get("name"),
            "kind": row.get("kind"),
            "imported": row.get("imported"),
            "project_id": row.get("project_id"),
            "created_at": row["created_at"],
            "row_count": row.get("row_count", row.get("total")),
            "link": f"https://specstream.ai/workspace/collections/{row['id']}",
        }

    def get_child_context(self, record: dict, context) -> dict:
        return {"list_id": record["id"], "list_created_at": record["created_at"]}


def _value(cell: dict) -> dict:
    provenance = cell.get("provenance") or {}
    shown = cell.get("display")
    if shown is None and cell.get("value") is not None:
        shown = str(cell["value"])
    return {
        "column_id": cell.get("column_id"),
        "label": cell.get("label") or cell.get("column_id"),
        "value": None if cell.get("absence") else shown,
        "source_url": provenance.get("source_url"),
        "observed_at": provenance.get("observed_at"),
    }


def shape_record(row: dict, list_id: str, list_created_at: str) -> dict:
    """A list row as one record with plain values.

    Records SpecStream found have an `ordinal` and `cells`; rows of a list you imported have an `id` and the
    columns you `provided`; rows of a combined list have an `id` and each column's values in `field_values`,
    the value the list shows first.
    """
    if "provided" in row:
        values = [
            {"column_id": key, "label": key, "value": None if value is None else str(value),
             "source_url": None, "observed_at": None}
            for key, value in (row.get("provided") or {}).items()
        ]
    elif "field_values" in row:
        values = [
            _value({"column_id": key, **entries[0]})
            for key, entries in (row.get("field_values") or {}).items()
            if entries and key not in BUTTON_COLUMNS
        ]
    else:
        values = [
            _value(cell)
            for cell in row.get("cells") or []
            if cell.get("column_id") and cell["column_id"] not in BUTTON_COLUMNS
        ]
    entity_id = row.get("entity_id") or next(
        (s["row"]["entity_id"] for s in row.get("sources") or [] if (s.get("row") or {}).get("entity_id")),
        None,
    )
    return {
        "list_id": list_id,
        "list_created_at": list_created_at,
        "record_id": str(row["ordinal"] if row.get("ordinal") is not None else row["id"]),
        "entity_id": entity_id,
        "values": {value["label"]: value["value"] for value in values},
        "cells": values,
    }


class RecordsStream(SpecStreamStream):
    """The records of each list, each value with the page it was read from and when."""

    name = "records"
    parent_stream_type = ListsStream
    path = "/v1/workspace/collections/{list_id}"
    primary_keys = ("list_id", "record_id")
    records_jsonpath = "$.data.rows[*]"
    state_partitioning_keys: t.ClassVar[list[str]] = []  # New records arrive as new lists.

    schema = th.PropertiesList(
        th.Property("list_id", th.StringType, required=True),
        th.Property("list_created_at", th.DateTimeType),
        th.Property("record_id", th.StringType, required=True, description="The record's ID in its list."),
        th.Property(
            "entity_id",
            th.StringType,
            description="The same for this company, place, person or posting in every list.",
        ),
        th.Property(
            "values",
            th.ObjectType(additional_properties=th.CustomType({"type": ["string", "null"]})),
            description="Each column's label and value.",
        ),
        th.Property(
            "cells",
            th.ArrayType(
                th.ObjectType(
                    th.Property("column_id", th.StringType),
                    th.Property("label", th.StringType),
                    th.Property("value", th.StringType),
                    th.Property("source_url", th.StringType, description="The page the value was read from."),
                    th.Property("observed_at", th.DateTimeType, description="When it was read."),
                )
            ),
        ),
    ).to_dict()

    def get_new_paginator(self):
        return None  # A list's records come in one response.

    def post_process(self, row: dict, context=None) -> dict | None:
        return shape_record(row, context["list_id"], context["list_created_at"])
