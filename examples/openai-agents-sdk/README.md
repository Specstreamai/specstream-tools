# OpenAI Agents SDK example

An agent that connects to the SpecStream MCP server at `https://api.specstream.ai/mcp`, reads a request, and brings back the price. Python 3.10 or newer.

```sh
pip install -r requirements.txt
export OPENAI_API_KEY=...
export SPECSTREAM_API_KEY="ss_live_..."
python agent.py "Food banks in Texas, with their annual revenue."
```

By default the agent cannot approve a price. The tools that start paid work are filtered out with `create_static_tool_filter`, so it reads the request, quotes it and stops for you. To let it run work, pass `--allow-spend`, and use a key whose spending limit you set on purpose (**Agents & API** in the workspace).
