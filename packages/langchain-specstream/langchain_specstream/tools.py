"""LangChain tools that ask SpecStream for a list on the live web and read its rows."""

from __future__ import annotations

import json
from typing import Any, Optional

from langchain_core.callbacks import CallbackManagerForToolRun
from langchain_core.tools import BaseTool
from langchain_core.utils import secret_from_env
from pydantic import BaseModel, Field, SecretStr

from langchain_specstream._api import DEFAULT_BASE_URL, DEFAULT_WAIT_SECONDS, SpecStreamAPI


class FindListInput(BaseModel):
    """What the model fills in. The price ceiling is not here: the developer sets it on the tool."""

    request: str = Field(
        description=(
            "The list to find, in plain words: what every row must be or meet, and the details to bring back. "
            "Example: 'Roofing companies in Columbus, Ohio with their website and phone'."
        )
    )
    max_results: int = Field(default=25, ge=1, le=1000, description="How many matching rows to find.")


class GetListResultsInput(BaseModel):
    list_id: str = Field(description="The list_id returned by specstream_find_list.")


class _SpecStreamTool(BaseTool):
    api_key: SecretStr = Field(default_factory=secret_from_env("SPECSTREAM_API_KEY"))
    """A SpecStream API key. Read from SPECSTREAM_API_KEY when not passed."""
    base_url: str = DEFAULT_BASE_URL

    def _api(self) -> SpecStreamAPI:
        return SpecStreamAPI(self.api_key.get_secret_value(), self.base_url)


class SpecStreamFindList(_SpecStreamTool):
    """Ask for a list in plain words and get every matching row, each with the page it was read from.

    The list starts only if its price is within ``max_price_usd``, which you set here, in code. The model
    chooses the request and how many rows; it can't raise the price ceiling.

    Example:
        .. code-block:: python

            from langchain_specstream import SpecStreamFindList

            tool = SpecStreamFindList(max_price_usd=5)
            tool.invoke({"request": "Dental clinics in Lisbon with online booking", "max_results": 20})
    """

    name: str = "specstream_find_list"
    description: str = (
        "Find a list of real organizations, people, places or records on the live web from a plain-English "
        "request, and get back every matching row with the page it was read from. Use it when the answer is "
        "many items that meet conditions (companies in a city, clinics with a service, funding filings, open "
        "grants, tenders, repositories), not a single fact. Results cost money: the list starts only if its "
        "price is within the maximum the developer set, and only matching rows are paid for."
    )
    args_schema: type[BaseModel] = FindListInput

    max_price_usd: float = Field(gt=0)
    """The most one list may cost, in US dollars. If the price is higher, nothing runs."""
    wait_seconds: float = DEFAULT_WAIT_SECONDS
    """How long to wait for the list to finish before returning the rows found so far."""
    poll_interval: float = 3.0
    locale: str = "en-US"

    def _run(self, request: str, max_results: int = 25, run_manager: Optional[CallbackManagerForToolRun] = None) -> str:
        result = self._api().find_list(
            request,
            max_results=max_results,
            max_price_usd=self.max_price_usd,
            wait_seconds=self.wait_seconds,
            poll_interval=self.poll_interval,
            locale=self.locale,
        )
        return json.dumps(result, ensure_ascii=False, default=str)


class SpecStreamGetListResults(_SpecStreamTool):
    """Read every row found so far for a list. Reading a list you already have costs nothing."""

    name: str = "specstream_get_list_results"
    description: str = (
        "Get every row found so far for a SpecStream list, each with the page it was read from. Use it with "
        "the list_id from specstream_find_list when that list was still running. Costs nothing."
    )
    args_schema: type[BaseModel] = GetListResultsInput

    def _run(self, list_id: str, run_manager: Optional[CallbackManagerForToolRun] = None) -> str:
        return json.dumps(self._api().results(list_id), ensure_ascii=False, default=str)


def specstream_tools(max_price_usd: float, **kwargs: Any) -> list[BaseTool]:
    """Both tools, sharing one key and base URL: the usual way to give an agent SpecStream."""
    shared = {key: kwargs.pop(key) for key in ("api_key", "base_url") if key in kwargs}
    return [SpecStreamFindList(max_price_usd=max_price_usd, **shared, **kwargs), SpecStreamGetListResults(**shared)]
