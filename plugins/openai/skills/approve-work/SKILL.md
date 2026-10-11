---
name: approve-work
description: Start paid work only after the user approves the price and its ceiling.
---

# Approve a price

Use the SpecStream MCP server at `https://api.specstream.ai/mcp`.

Each job has its own run tool: `run_new_list`, `run_imported_list`, `run_more_results`, `run_more_facts` and `run_refresh`. A run tool starts paid work, so it is a write. Use the one for the job the price is for, and only after the user says yes to the price you showed, or set a ceiling that the price fits under. Send the price's `quote_id` and `quote_hash`, the ceiling the user approved in cents as `confirm_max_cents`, and an `idempotency_key` that you create once and keep.

If the reply is lost, call the same run tool again with the same `idempotency_key`. SpecStream returns the same run and doesn't start a second one. If the price expired or the request changed, get a new price and ask again.

SpecStream never charges more than the approved ceiling. If the balance or a spending limit stops the work, say so plainly and keep the request as it is. Balance and payment stay in the user's SpecStream workspace. Don't open a payment sheet from chat.

Follow progress with `get_find`. To stop a run, call `cancel_find`. The run keeps what it already found.
