"""Load your SpecStream lists into any dlt destination.

Three tables: `lists` (one row per list), `records` (one row per record) and `records__cells` (one row
per value, with its label, the page it was read from and when it was read). Later runs load only the
lists created since the last run; a SpecStream schedule delivers new and changed records as a new list.
The pipeline only reads.

    pip install "dlt[duckdb]"
    export SOURCES__SPECSTREAM__API_KEY=...   # a key from Agents & API in SpecStream
    python specstream_pipeline.py
"""

import dlt
from dlt.sources.rest_api import rest_api_source

# Workspace buttons, not facts.
BUTTON_COLUMNS = {"matches", "open"}


def plain_cell(column_id: str, cell: dict) -> dict:
    """One value with the page it was read from. A value SpecStream couldn't read is None."""
    provenance = cell.get("provenance") or {}
    return {
        "column_id": column_id,
        "label": cell.get("label") or column_id,
        "value": None if cell.get("absence") else cell.get("display"),
        "source_url": provenance.get("source_url"),
        "observed_at": provenance.get("observed_at"),
    }


def shape_record(row: dict) -> dict:
    """Turn a row of a list into a record with its list, a record ID and plain cells.

    Records SpecStream found have an `ordinal` and `cells`; rows of a list you imported have an `id` and the
    columns you `provided`; rows of a combined list have an `id` and each column's values in `field_values`,
    the value the list shows first.
    """
    if "provided" in row:
        cells = [
            {
                "column_id": key,
                "label": key,
                "value": None if value is None else str(value),
                "source_url": None,
                "observed_at": None,
            }
            for key, value in (row.get("provided") or {}).items()
        ]
    elif "field_values" in row:
        cells = [
            plain_cell(key, values[0])
            for key, values in (row.get("field_values") or {}).items()
            if values and key not in BUTTON_COLUMNS
        ]
    else:
        cells = [
            plain_cell(cell["column_id"], cell)
            for cell in row.get("cells") or []
            if cell.get("column_id") and cell["column_id"] not in BUTTON_COLUMNS
        ]
    entity_id = row.get("entity_id") or next(
        (s["row"]["entity_id"] for s in row.get("sources") or [] if (s.get("row") or {}).get("entity_id")),
        None,
    )
    return {
        "list_id": row["_lists_id"],
        "list_created_at": row["_lists_created_at"],
        "record_id": str(row["ordinal"] if row.get("ordinal") is not None else row["id"]),
        "entity_id": entity_id,
        "cells": cells,
    }


@dlt.source(name="specstream", max_table_nesting=1)
def specstream_source(api_key: str = dlt.secrets.value, start_date: str = "2020-01-01T00:00:00+00:00"):
    return rest_api_source(
        {
            "client": {
                "base_url": "https://api.specstream.ai",
                "auth": {"type": "bearer", "token": api_key},
            },
            "resources": [
                {
                    "name": "lists",
                    "primary_key": "id",
                    "write_disposition": "merge",
                    "endpoint": {
                        "path": "/v1/workspace/collections",
                        "params": {"limit": 100, "sort": "recent"},
                        "data_selector": "data.collections",
                        "paginator": {
                            "type": "cursor",
                            "cursor_path": "data.next_after",
                            "cursor_param": "after",
                        },
                        "incremental": {"cursor_path": "created_at", "initial_value": start_date},
                    },
                },
                {
                    "name": "records",
                    "primary_key": ["list_id", "record_id"],
                    "write_disposition": "merge",
                    "include_from_parent": ["id", "created_at"],
                    "endpoint": {
                        "path": "/v1/workspace/collections/{resources.lists.id}",
                        "data_selector": "data.rows",
                        "paginator": "single_page",
                    },
                    "processing_steps": [{"map": shape_record}],
                },
            ],
        }
    )


if __name__ == "__main__":
    pipeline = dlt.pipeline(pipeline_name="specstream", destination="duckdb", dataset_name="specstream_data")
    print(pipeline.run(specstream_source()))
