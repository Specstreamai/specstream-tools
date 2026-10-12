# Installing the SpecStream MCP server

These steps are for an AI agent, such as Cline, setting up SpecStream for its user.

SpecStream is a hosted MCP server at `https://api.specstream.ai/mcp` (Streamable HTTP). Cline starts local servers, so it connects through `specstream-mcp-stdio`, a small stdio proxy that forwards to the hosted server with the user's API key. Nothing else runs locally.

## 1. Get the user's API key

Ask the user for their SpecStream API key. It starts with `ss_live_`.

If they don't have one yet, tell them:

1. Sign in at https://specstream.ai/workspace (new accounts start with $10 of work free for 30 days, no card).
2. Open **Agents & API** and create a key.
3. Give it only what the work needs: read, prepare or execute, the projects it may use, an expiry and a spending limit.

Never guess or invent a key.

## 2. Install the proxy

Requires Python 3.10 or newer.

```sh
pip install specstream-mcp-stdio
```

Check that it installed:

```sh
pip show specstream-mcp-stdio
```

If `pip` installs it somewhere that isn't on `PATH`, use the full path to the `specstream-mcp-stdio` executable as `command` in the next step (`python3 -m site --user-base` shows the user base; the executable is in its `bin` folder). With `uv`, `uvx specstream-mcp-stdio` also works: set `command` to `uvx` and `args` to `["specstream-mcp-stdio"]`.

## 3. Add the server to Cline

Add this to `cline_mcp_settings.json`, with the user's key in place of `ss_live_...`:

```json
{
  "mcpServers": {
    "specstream": {
      "command": "specstream-mcp-stdio",
      "args": [],
      "env": {
        "SPECSTREAM_MCP_URL": "https://api.specstream.ai/mcp",
        "SPECSTREAM_API_KEY": "ss_live_..."
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Keep `autoApprove` empty. Running a request spends from the user's balance, so the user should see each run before it starts.

## 4. Check the connection

The server should connect and list its tools. Call `get_me` to confirm the key works: it returns the signed-in account.

If the server reports `SPECSTREAM_API_KEY is required`, the key is missing from `env`. If it reports a 401, the key is wrong, expired or revoked: ask the user for a new one.

## 5. Use it

1. `compile` reads a request in plain words, like "food banks in Texas, with their annual revenue", into the conditions every row must meet and the facts to bring back. Show the user anything marked ambiguous.
2. `quote_capacity_work` prices that exact request. Pricing never spends anything.
3. Show the user the maximum and get their approval.
4. `authorize_capacity_work` runs it. Only matching rows are charged, never more than the approved maximum.
5. `list_find_rows` reads the rows as they arrive, each with its source.

More: https://specstream.ai/docs/mcp and https://specstream.ai/agents.md
