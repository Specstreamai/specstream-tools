# specstream-mcp-stdio

A stdio proxy for the [SpecStream](https://specstream.ai) MCP server at `https://api.specstream.ai/mcp`. Use it with clients that only start local servers, such as Zed, Cline and Continue. Clients that connect to a remote URL do not need it.

The proxy forwards to the same Streamable HTTP service that remote clients use, so your agent works on your account: the same balance, permissions and spending limits you have.

## Install

Python 3.12 or newer. The package has no dependencies.

```sh
pip install specstream-mcp-stdio
```

The command is `specstream-mcp-stdio`. In a GUI client, use its absolute path if the environment it was installed into is not on `PATH`.

Create an API key under **Agents & API** in your SpecStream workspace. Set `SPECSTREAM_API_KEY` in the private environment of the client, outside prompts and shared configuration. `SPECSTREAM_MCP_URL` is an optional endpoint override.

## Client configuration

For clients that take an `mcpServers` entry:

```json
{
  "mcpServers": {
    "specstream": {
      "command": "specstream-mcp-stdio",
      "args": [],
      "env": { "SPECSTREAM_MCP_URL": "https://api.specstream.ai/mcp" }
    }
  }
}
```

Zed uses `context_servers` with the same fields. Continue takes a YAML file:

```yaml
name: SpecStream
version: 1.0.0
schema: v1
mcpServers:
  - name: specstream
    type: stdio
    command: specstream-mcp-stdio
    args: []
    env:
      SPECSTREAM_MCP_URL: https://api.specstream.ai/mcp
      SPECSTREAM_API_KEY: ${{ secrets.SPECSTREAM_API_KEY }}
```

## Use the tools

Reconnect your client and list the tools. Start with `compile` to read a request, or `list_specs` and `list_projects` to find saved work.

New paid work goes `quote_capacity_work`, then `authorize_capacity_work` with the quote ID and hash, the approved maximum in `confirm_max_cents` and a stable request key. Reading saved results does not start more paid work. See the [agent guide](https://specstream.ai/docs/mcp).

## Connection problems

The proxy needs the endpoint and a valid key. If it cannot connect, check the client's environment and the key's permissions. Keep TLS verification on.

Protocol messages use stdin and stdout; diagnostics use stderr. The proxy keeps the negotiated HTTP session and does not follow redirects with credentials.

Source and issues: [github.com/specstream/specstream-tools](https://github.com/specstream/specstream-tools). MIT license.
