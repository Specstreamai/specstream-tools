---
name: compile
description: Show how SpecStream understands a request, without running or charging anything.
---

# Understand a request

SpecStream is the live web data engine for teams and agents. This plugin uses the SpecStream MCP server at `https://api.specstream.ai/mcp`, signed in as the user.

Call `compile` with the user's own words, in any language. Show the reading it returns in plain language: what to find, the conditions every result must meet, and the facts to bring back, each marked required or optional. Point out any condition SpecStream can't check.

To change a condition or a fact to bring back, call `edit_spec` with the revised reading. Don't drop a hard condition to make the request easier, and don't treat a missing fact as a no.

Understanding a request costs nothing and starts nothing. For examples that already work, call `list_request_templates`.

Never ask the user for an API key. The connection is already signed in.
