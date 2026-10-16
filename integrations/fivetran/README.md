# SpecStream for Fivetran

A [Fivetran Connector SDK](https://fivetran.com/docs/connector-sdk) connector that syncs your SpecStream data into your warehouse: every list your API key can open, its records, and one row per value with the page it was read from and when it was read. It only reads. It never starts a request or spends from your balance.

## Tables

- `LIST`: one row per list (`id`, `name`, `project_id`, `imported`, `created_at`, `row_count`).
- `RECORD`: one row per record (`list_id`, `record_id`, `entity_id`, `values` as a JSON object of label to value, `sources` as a JSON array of pages).
- `RECORD_VALUE`: one row per value (`list_id`, `record_id`, `column_id`, `label`, `value`, `raw_value`, `source_url`, `observed_at`).

Later syncs read only the lists created since the last one. A SpecStream schedule delivers new and changed records as a new list, so they arrive on the next sync.

## Run it

1. Create an API key in SpecStream under **Agents & API**. The connector only reads, so the key can have a spending limit of $0.
2. Put the key in `configuration.json`.
3. Test locally:

   ```bash
   pip install fivetran-connector-sdk
   fivetran debug --configuration configuration.json
   ```

4. Deploy to your Fivetran destination:

   ```bash
   fivetran deploy --api-key <FIVETRAN_API_KEY> --destination <DESTINATION_NAME> --connection specstream --configuration configuration.json
   ```

The connector has also been submitted to Fivetran's [community connectors](https://github.com/fivetran/community_connectors).
