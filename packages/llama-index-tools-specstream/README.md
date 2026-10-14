# llama-index-tools-specstream

Give your LlamaIndex agent any list from the live web. Search tools hand an agent pages to read; SpecStream hands it the finished list. It asks in plain words – "dental clinics in Lisbon with online booking", "US startups that filed a $5M+ Form D this week" – and gets back every matching row, each with the page it was read from. The list starts only within a price you set in code, and the model can't raise it.

```bash
pip install -U llama-index-tools-specstream
export SPECSTREAM_API_KEY=ss_live_...   # Agents & API in your SpecStream workspace
```

A free account comes with $10 of work to use within 30 days and needs no card: [specstream.ai](https://specstream.ai/signup).

## An agent that can find lists

```python
from llama_index.core.agent.workflow import FunctionAgent
from llama_index.llms.anthropic import Anthropic
from llama_index.tools.specstream import SpecStreamToolSpec

agent = FunctionAgent(
    tools=SpecStreamToolSpec(max_price_usd=5).to_tool_list(),
    llm=Anthropic(model="claude-sonnet-5-5"),
)
response = await agent.run(
    "Find US startups that raised $5M or more in a Form D filed after October 8, 2026. Which industries lead?"
)
```

The agent writes the request and picks how many rows. You decide what one list may cost.

## What comes back

One flat row per match: the list's own columns, then where the row was read. This is a real row from the request above.

```json
{
  "list_id": "fnd_gk5y3d0r97bvyz0t08zzh75kr6",
  "position": 26,
  "Organization": "RapidCanvas Inc",
  "Published address": "801 BARTON SPRINGS RD, AUSTIN, TEXAS, 78704",
  "Source industry classification": "Other Technology",
  "Amount sold (USD)": "28999988",
  "Funding filing date": "2026-10-14",
  "source_url": "https://www.sec.gov/Archives/edgar/data/2052031/000205203126000006/primary_doc.xml",
  "checked_at": "2026-10-14T19:56:02.016693Z",
  "list_link": "https://specstream.ai/workspace/collections/fnd_gk5y3d0r97bvyz0t08zzh75kr6"
}
```

Columns follow the request. Ask for "breweries in Portland, Oregon that host events, with their website" and the rows carry the brewery and its website instead. A fact a source doesn't publish comes back empty, never guessed.

## The two tools

| Tool | The model gives | What happens | Cost |
| --- | --- | --- | --- |
| `specstream_find_list` | `request`, `max_results` | Reads the request, prices it, starts it only within `max_price_usd`, waits up to `wait_seconds` (7 minutes by default) and returns every row | Only the rows that match |
| `specstream_get_list_results` | `list_id` | Every row found so far, for a list that was still running | Free |

When the price is above your maximum, nothing runs: the tool returns the price, so the agent can ask for fewer rows or tell the user. When a request is too vague to price ("clinics"), it returns how SpecStream read it, so the agent can add the place or the conditions.

Settings live on the spec, never in the tool schema:

```python
spec = SpecStreamToolSpec(
    max_price_usd=20,     # the most one list may cost
    wait_seconds=600,     # how long find_list waits before handing back what it has
    locale="en-GB",       # the language the requests are written in
)
```

## As a retriever

```python
from llama_index.tools.specstream import SpecStreamRetriever

retriever = SpecStreamRetriever(max_price_usd=3, max_results=25)
nodes = retriever.retrieve("Breweries in Portland, Oregon that host events, with their website")

nodes[0].text                      # "Business location: Occidental Brewing Company\nPublished business website: http://occidentalbeers.com ..."
nodes[0].metadata["source_url"]    # the page that row was read from
```

One node per row, its facts as text and its source in the metadata. The model sees each row with the page behind it, so a query engine can cite every claim; the list's bookkeeping stays out of the prompt and out of embeddings. Above the maximum, the retriever raises `SpecStreamError` and nothing runs.

## Money, plainly

- `max_price_usd` lives on the spec, in your code. The model never sees it and can't change it.
- You pay for rows that match. Candidates SpecStream couldn't confirm are left out and aren't billed.
- A retried step asking for the same list within the hour gets the list it already started, not a second bill.
- Rates and plans: [specstream.ai/pricing](https://specstream.ai/pricing).

## When to reach for it

When the answer is many things that meet conditions: companies in a city, clinics with a service, funding filings, open grants, tenders, repositories, people in a role. For a single fact or a summary of one page, a search tool fits better.

## More

- [SpecStream docs](https://specstream.ai/docs) and the [LlamaIndex page](https://specstream.ai/docs/llamaindex)
- Agents outside LlamaIndex: the [MCP server](https://specstream.ai/docs/mcp) at `https://api.specstream.ai/mcp`
- The [Python SDK](https://pypi.org/project/specstream-client/) for everything else in the API
- Questions: support@specstream.ai

MIT licensed. Made by [SpecStream](https://specstream.ai), the live web data engine for teams and agents.
