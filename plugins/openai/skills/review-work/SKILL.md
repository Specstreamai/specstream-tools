---
name: review-work
description: Get SpecStream's price for a request before anything runs.
---

# Get a price

Use the SpecStream MCP server at `https://api.specstream.ai/mcp`.

Each job has its own price tool. For a new request, call `quote_new_list` with the `ast_hash` from `compile` or `edit_spec`. For a list the user imported, `quote_imported_list` prices filling in or checking its rows. For a list the user already has, pass its `find_id`: `quote_more_results` prices more results, `quote_more_facts` prices facts added with `edit_spec`, and `quote_refresh` prices a recheck.

Show the price in text: what will be found, the facts that come back, the most the work can cost, and when the price expires. Use only the amounts the price states. A price lasts 30 minutes.

Getting a price spends nothing. `get_capacity_balance` shows the balance, but a balance is not permission to spend. Never approve a price for the user.

Anything about balance or payment happens in the user's SpecStream workspace, not in chat. Don't open a checkout or a payment page.
