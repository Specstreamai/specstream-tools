from typing import Any

from haystack.tools import ComponentTool
from haystack.utils import Secret

from haystack_integrations.components.fetchers.specstream import SpecStreamListFetcher

DESCRIPTION = (
    "Find a list of real organizations, people, places or records on the live web from a plain-English request, "
    "and get back every matching row with the page it was read from. Use it when the answer is many items that "
    "meet conditions (companies in a city, clinics with a service, funding filings, open grants, tenders, "
    "repositories), not a single fact. Results cost money: the list starts only if its price is within the "
    "maximum the developer set, and only matching rows are paid for."
)


def _rows_as_text(documents: list) -> str:
    return "\n".join(f"{doc.content}  (source: {doc.meta.get('source_url') or 'n/a'})" for doc in documents)


class SpecStreamListTool(ComponentTool):
    """
    A Haystack tool an agent can call to get a finished list from the live web.

    The model writes the request and picks how many rows. The price ceiling is set here, in code, and the model can't raise it.

    ```python
    from haystack.components.agents import Agent
    from haystack.components.generators.chat import OpenAIChatGenerator
    from haystack.dataclasses import ChatMessage
    from haystack_integrations.tools.specstream import SpecStreamListTool

    agent = Agent(chat_generator=OpenAIChatGenerator(model="gpt-4o"), tools=[SpecStreamListTool(max_price_usd=5)])
    ```
    """

    def __init__(
        self,
        max_price_usd: float,
        api_key: Secret = Secret.from_env_var("SPECSTREAM_API_KEY"),
        name: str = "specstream_find_list",
        description: str = DESCRIPTION,
        **fetcher_kwargs: Any,
    ):
        super().__init__(
            component=SpecStreamListFetcher(max_price_usd=max_price_usd, api_key=api_key, **fetcher_kwargs),
            name=name,
            description=description,
            outputs_to_string={"source": "documents", "handler": _rows_as_text},
        )
