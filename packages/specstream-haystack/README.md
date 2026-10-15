# specstream-haystack

Give your Haystack pipeline or agent any list from the live web. Search components hand a pipeline pages to read; SpecStream hands it the finished list. Ask in plain words – "dental clinics in Lisbon with online booking", "US startups that filed a $5M+ Form D this week" – and get back every matching row as a `Document`, each with the page it was read from. The list starts only within a price you set in code, and the model can't raise it.

```bash
pip install -U specstream-haystack
export SPECSTREAM_API_KEY=ss_live_...   # Agents & API in your SpecStream workspace
```

A free account comes with $10 of work to use within 30 days and needs no card: [specstream.ai](https://specstream.ai/signup).

## In a pipeline

```python
from haystack_integrations.components.fetchers.specstream import SpecStreamListFetcher

fetcher = SpecStreamListFetcher(max_price_usd=3, max_results=25)
result = fetcher.run(request="Breweries in Portland, Oregon that host events, with their website")

for doc in result["documents"]:
    print(doc.meta["source_url"], doc.content)
```

Each `Document` is one row. `content` is the row as JSON. `meta` carries `source_url` (the page the row was read from), `checked_at`, `list_id`, `list_link`, `position`, `request` and `fields` (the row's columns as a dict).

`run` also returns `list_id`, `status`, `list_link` and a `message` when the list was still running. When the quoted price is above `max_price_usd`, or the request is too vague to price, nothing runs and `SpecStreamError` explains why.

## As an agent tool

```python
from haystack.components.agents import Agent
from haystack.components.generators.chat import OpenAIChatGenerator
from haystack.dataclasses import ChatMessage
from haystack_integrations.tools.specstream import SpecStreamListTool

agent = Agent(
    chat_generator=OpenAIChatGenerator(model="gpt-4o"),
    tools=[SpecStreamListTool(max_price_usd=5)],
)
result = agent.run(messages=[ChatMessage.from_user("Find open grants for urban beekeeping in the EU and list their deadlines.")])
print(result["last_message"].text)
```

The agent writes the request and picks how many rows. You decide what one list may cost.

## Retries don't buy twice

The same request with the same limits, in the same hour, reaches the run it already started instead of starting another. A retried step never pays for the list twice.

MIT licensed. Source: [specstream/specstream-tools](https://github.com/specstream/specstream-tools/tree/main/packages/specstream-haystack).
