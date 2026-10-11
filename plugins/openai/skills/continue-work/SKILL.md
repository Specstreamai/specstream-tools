---
name: continue-work
description: Read results with their sources, download them, and add to them deliberately.
---

# Read and continue results

Use the SpecStream MCP server at `https://api.specstream.ai/mcp`.

Call `list_find_rows` for a run's results. Follow `next_cursor` with the `cursor` argument until it is null, because the first page is not the whole list. Each result comes with the source behind each check. Use those sources instead of inventing links, and leave unknown facts unknown. Reading shows nothing to the user: to show the list, call `show_specstream_records` once with its `find_id` as `collection_id`. The separate possible list holds candidates with open conditions. They were not charged, and they are not results.

`export_find` creates a download link as CSV, Excel, JSON or HTML, or KML and GeoJSON for records with places. The link works for 24 hours. Reading and downloading results costs nothing.

To get more results, add facts, or recheck, start again from a price: change the reading with `edit_spec` if needed, then call `quote_more_results`, `quote_more_facts` or `quote_refresh` with the list's `find_id`. Results the user already has are not bought again.

Maps, comparisons, monitors and Send to (Google Sheets, Excel, Notion, Airtable, HubSpot, Salesforce and Outlook drafts) are in the SpecStream workspace at https://specstream.ai/workspace, on the same account. Projects you can open are listed by `list_projects` and `get_project`.
