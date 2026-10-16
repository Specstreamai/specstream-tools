# SpecStream for Airbyte

A manifest-only Airbyte source that syncs your SpecStream data: every list your API key can open and its records, each value with the page it was read from. It only reads. It never starts a request or spends from your balance.

## Streams

- `lists`: one row per list (`id`, `name`, `kind`, `imported`, `created_at`, `row_count`). Incremental on `created_at`.
- `records`: one row per record (`list_id`, `record_id`, `list_created_at`, `entity_id`, and `cells`: each value with `label`, `display` and `provenance.source_url`). Rows of an imported list carry `provided`; rows of a combined list carry `field_values`. Incremental by new lists.

## Use it

1. Create an API key in SpecStream under **Agents & API**. The source only reads, so the key can have a spending limit of $0.
2. In Airbyte (Cloud or self-managed), open **Builder**, choose **Import a YAML**, and select `manifest.yaml`.
3. Enter the API key under **Testing values**, test the streams, then **Publish** the source to your workspace.
4. Create a connection from the SpecStream source to your destination.

The source has also been submitted to the [Airbyte connector catalog](https://github.com/airbytehq/airbyte/pulls?q=source-specstream).
