# SpecStream with dlt

Load your SpecStream lists into DuckDB, BigQuery, Snowflake, Postgres or any other [dlt](https://dlthub.com) destination with dlt's REST API source.

Three tables:

- `lists`: one row per list (`id`, `name`, `kind`, `created_at`, `row_count`).
- `records`: one row per record (`list_id`, `record_id`, `list_created_at`, `entity_id`).
- `records__cells`: one row per value (`label`, `value`, `source_url`, `observed_at`), joined to its record by `_dlt_parent_id`.

Later runs load only the lists created since the last run. A SpecStream schedule delivers new and changed records as a new list, so they arrive on the next run. The pipeline only reads: it never starts a request or spends from your balance.

```bash
pip install "dlt[duckdb]"
export SOURCES__SPECSTREAM__API_KEY=...   # create one under Agents & API in SpecStream
python specstream_pipeline.py
```

To load somewhere else, change `destination` in `dlt.pipeline(...)` and add that destination's credentials as dlt describes. The key can have a spending limit of $0.
