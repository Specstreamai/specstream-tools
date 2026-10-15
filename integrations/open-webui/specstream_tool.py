"""
title: SpecStream
author: SpecStream
author_url: https://specstream.ai
git_url: https://github.com/specstream/specstream-tools
description: Ask for a list in plain words and get every matching row from the live web, each with the page it came from. You see the price first and pay only for the matches.
required_open_webui_version: 0.6.31
version: 1.0.0
license: MIT
"""

import asyncio
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

from pydantic import BaseModel, Field

BASE_URL = "https://api.specstream.ai"
LIST_URL = "https://specstream.ai/workspace/collections/"
FINISHED = {"completed", "partial", "failed", "canceled", "expired"}
# The most one list may ever be quoted for through this tool, whatever the Valves say.
HARD_CEILING_CENTS = 50_000


class SpecStreamError(Exception):
    def __init__(self, message: str, status: Optional[int] = None, code: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.code = code


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())


def _send(api_key: str, method: str, path: str, body: Optional[dict] = None) -> dict:
    """One HTTPS call to the SpecStream API. Returns the `data` object of the response."""
    request = urllib.request.Request(
        BASE_URL + path,
        data=None if body is None else json.dumps(body).encode("utf-8"),
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "specstream-open-webui/1.0.0",
        },
    )
    try:
        with _OPENER.open(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8", "replace") if exc.fp else ""
        message, code = f"SpecStream answered HTTP {exc.code}.", None
        try:
            error = json.loads(text).get("error") or {}
            message = error.get("message") or message
            code = error.get("code")
        except ValueError:
            pass
        if exc.code in (401, 403) or (exc.code == 404 and message == "This page isn't available."):
            message = "SpecStream did not accept this API key. Check the key in the tool's Valves."
        raise SpecStreamError(message, exc.code, code) from None
    except (urllib.error.URLError, OSError, ValueError):
        raise SpecStreamError("Could not reach SpecStream. Try again in a moment.") from None
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise SpecStreamError("SpecStream returned an unexpected answer.")
    return data


def _dollars(cents: Any) -> float:
    return round(int(cents or 0) / 100, 2)


def _flatten(record: dict) -> dict:
    """One row as plain fields, plus the page each value was read from."""
    values: dict[str, Any] = {}
    sources: dict[str, dict] = {}
    for cell in record.get("cells") or []:
        label = str(cell.get("label") or cell.get("column_id") or "").strip()
        if not label:
            continue
        shown = cell.get("display")
        values[label] = shown if shown is not None else cell.get("value")
        provenance = cell.get("provenance") or {}
        if provenance.get("source_url"):
            sources[label] = {
                "page": provenance["source_url"],
                "checked_at": provenance.get("observed_at"),
            }
    return {"row": record.get("ordinal"), "values": values, "pages": sources}


class Tools:
    class Valves(BaseModel):
        api_key: str = Field(
            default="",
            description="SpecStream API key (starts with ss_live_). Create one under Agents & API in your SpecStream workspace. New accounts start with $10 of work, no card.",
            json_schema_extra={"input": {"type": "password"}},
        )
        max_price_usd: float = Field(
            default=5.0,
            description="The most any one list may cost, in dollars. A quote above this is refused before anything runs.",
        )
        confirm_with_dialog: bool = Field(
            default=True,
            description="Ask the person to approve each price in a dialog in Open WebUI. The model cannot answer it for them.",
        )
        auto_approve_within_cap: bool = Field(
            default=False,
            description="Start any list whose price is at or under the cap without asking. Off by default.",
        )
        wait_seconds: int = Field(
            default=90,
            description="How long to wait for rows after a list starts. The list keeps running after that and can be read later.",
        )
        max_rows_shown: int = Field(
            default=25,
            description="Most rows handed to the model per read. Keeps long lists from filling the context.",
        )

    class UserValves(BaseModel):
        api_key: str = Field(
            default="",
            description="Your own SpecStream API key. Leave empty to use the key the admin set.",
            json_schema_extra={"input": {"type": "password"}},
        )
        max_price_usd: float = Field(
            default=0.0,
            description="Your own cap per list, in dollars. 0 uses the admin's cap. It can only lower it.",
        )

    def __init__(self) -> None:
        self.valves = self.Valves()

    # Helpers start with an underscore so Open WebUI does not offer them to the model.

    def _key(self, user: Optional[dict]) -> str:
        own = ""
        valves = (user or {}).get("valves")
        if valves is not None:
            own = str(getattr(valves, "api_key", "") or "").strip()
        key = own or self.valves.api_key.strip()
        if not key:
            raise SpecStreamError(
                "No SpecStream API key is set. Add one in this tool's Valves (create it under Agents & API at https://specstream.ai)."
            )
        return key

    def _cap_cents(self, user: Optional[dict]) -> int:
        cap = round(max(self.valves.max_price_usd, 0) * 100)
        valves = (user or {}).get("valves")
        own = float(getattr(valves, "max_price_usd", 0) or 0) if valves is not None else 0
        if own > 0:
            cap = min(cap, round(own * 100))
        return min(cap, HARD_CEILING_CENTS)

    async def _status(self, emitter: Any, text: str, done: bool = False) -> None:
        if emitter:
            await emitter({"type": "status", "data": {"description": text, "done": done}})

    async def _rows(
        self, key: str, find_id: str, wait: int, emitter: Any, cursor: Optional[str] = None
    ) -> dict:
        path = f"/v1/finds/{find_id}/rows?limit={max(1, min(100, self.valves.max_rows_shown))}"
        if cursor:
            path += "&cursor=" + urllib.parse.quote(cursor, safe="")
        page = await asyncio.to_thread(_send, key, "GET", path)
        deadline = time.monotonic() + max(0, wait)
        while page.get("status") not in FINISHED and time.monotonic() < deadline:
            await self._status(
                emitter, f"Reading the web: {page.get('accepted_count', 0)} rows so far"
            )
            await asyncio.sleep(5)
            page = await asyncio.to_thread(_send, key, "GET", path)
        rows = [_flatten(r) for r in (page.get("rows") or [])]
        if emitter:
            for row in rows[:20]:
                for label, source in list(row["pages"].items())[:1]:
                    name = str(next(iter(row["values"].values()), "Row"))[:80]
                    await emitter(
                        {
                            "type": "citation",
                            "data": {
                                "document": [json.dumps(row["values"], ensure_ascii=False)],
                                "metadata": [{"source": name, "url": source["page"]}],
                                "source": {"name": name, "url": source["page"]},
                            },
                        }
                    )
        finished = page.get("status") in FINISHED
        result: dict[str, Any] = {
            "list_id": find_id,
            "status": page.get("status"),
            "rows_found": page.get("accepted_count", 0),
            "rows_shown": len(rows),
            "rows": rows,
            "open_in_workspace": LIST_URL + find_id,
        }
        if page.get("next_cursor"):
            result["next_cursor"] = page["next_cursor"]
            result["more"] = "Call get_list_rows with this list_id and next_cursor for the next rows."
        if not finished:
            result["still_running"] = (
                "The list is still being built and keeps going. Call get_list_rows with this list_id later for the rest."
            )
        commerce = page.get("commerce") or {}
        if finished and commerce.get("amount_captured_cents") is not None:
            result["charged_usd"] = _dollars(commerce["amount_captured_cents"])
        return result

    # Tools the model can call.

    async def quote_list(
        self,
        request: str,
        count: int = 25,
        __user__: Optional[dict] = None,
        __event_emitter__: Any = None,
    ) -> dict:
        """
        Price a list before anything runs. Use this first whenever the person wants a list of many things
        (every roofer in Columbus rated 4.5 or better, every food bank in Texas with its revenue, every
        company that filed to raise $5M or more this week) rather than one fact. It spends nothing.
        Tell the person the maximum price, then call approve_list only after they say yes.

        :param request: The list in plain words: what to find, where, and what every row must meet.
        :param count: How many rows to ask for, from 1 to 10000. Default 25.
        """
        try:
            key = self._key(__user__)
            count = max(1, min(10000, int(count)))
            await self._status(__event_emitter__, "Reading your request")
            reading = await asyncio.to_thread(
                _send, key, "POST", "/v1/parse", {"q": request, "locale": "en-US"}
            )
            read_as = reading.get("canonical_sentence")
            if reading.get("status") != "runnable" or not reading.get("ast_hash"):
                await self._status(__event_emitter__, "Needs a clearer request", True)
                return {
                    "status": "needs_a_clearer_request",
                    "read_as": read_as or request,
                    "note": reading.get("notice"),
                    "next_step": "Ask the person to add the place, the kind of thing, or what every row must meet, then call quote_list again.",
                }
            await self._status(__event_emitter__, "Getting the price")
            quote = await asyncio.to_thread(
                _send,
                key,
                "POST",
                "/v1/capacity/quotes",
                {"ast_hash": reading["ast_hash"], "operation": "find", "requested_units": count},
            )
            cap = self._cap_cents(__user__)
            maximum = int(quote["maximum_cents"])
            terms = quote.get("terms") or {}
            result: dict[str, Any] = {
                "status": "quoted",
                "read_as": read_as,
                "rows_asked_for": count,
                "most_it_can_cost_usd": _dollars(maximum),
                "price_per_match_usd": _dollars(terms.get("unit_cents")) if terms.get("unit_cents") else None,
                "you_pay_only_for_matches": True,
                "within_spending_cap": maximum <= cap,
                "spending_cap_usd": _dollars(cap),
                "price_expires_at": quote.get("expires_at"),
                "quote_id": quote["quote_id"],
                "can_approve": bool(quote.get("can_authorize", True)),
            }
            if maximum > cap:
                result["next_step"] = (
                    "This is above the spending cap, so it cannot start. Offer fewer rows, or tell the person the cap is set in the tool's Valves."
                )
            elif not result["can_approve"]:
                result["next_step"] = (
                    "SpecStream cannot start this yet (balance or plan). Tell the person to check their balance at https://specstream.ai."
                )
            else:
                result["next_step"] = (
                    "Show the person what was read and the most it can cost. Call approve_list with this quote_id only after they say yes."
                )
            await self._status(__event_emitter__, "Price ready", True)
            return result
        except SpecStreamError as exc:
            await self._status(__event_emitter__, "Could not price the list", True)
            return {"status": "error", "message": str(exc), "code": exc.code}

    async def approve_list(
        self,
        quote_id: str,
        user_said_yes: bool = False,
        __user__: Optional[dict] = None,
        __event_emitter__: Any = None,
        __event_call__: Any = None,
    ) -> dict:
        """
        Start the list from a quote the person has approved, then return the rows found. This spends money,
        up to the quoted maximum and never more, and only for matches. Call it only after the person has
        seen the price from quote_list and said yes. Never guess a quote_id.

        :param quote_id: The quote_id returned by quote_list.
        :param user_said_yes: True only if the person said yes to this exact price in this conversation.
        """
        try:
            key = self._key(__user__)
            quote = await asyncio.to_thread(
                _send, key, "GET", f"/v1/capacity/quotes/{urllib.parse.quote(quote_id, safe='')}"
            )
            maximum = int(quote["maximum_cents"])
            cap = self._cap_cents(__user__)
            if maximum > cap:
                return {
                    "status": "not_started",
                    "message": f"The most it can cost, ${_dollars(maximum)}, is above the spending cap of ${_dollars(cap)}. Nothing ran and nothing was charged.",
                }
            if quote.get("can_authorize") is False:
                return {
                    "status": "not_started",
                    "message": "SpecStream cannot start this list yet (balance or plan). Nothing was charged.",
                }

            request_key = "openwebui-" + hashlib.sha256(quote_id.encode()).hexdigest()[:32]
            started = None
            try:
                started = await asyncio.to_thread(
                    _send, key, "GET", f"/v1/capacity/requests/{request_key}"
                )
            except SpecStreamError:
                started = None

            if not (started and started.get("find_id")):
                if not self.valves.auto_approve_within_cap:
                    if self.valves.confirm_with_dialog and __event_call__:
                        answer = await __event_call__(
                            {
                                "type": "confirmation",
                                "data": {
                                    "title": "Start this list?",
                                    "message": f"SpecStream will read the web for this list. It can cost at most ${_dollars(maximum)} and you pay only for the matches.",
                                },
                            }
                        )
                        if answer is not True:
                            return {
                                "status": "not_started",
                                "message": "The person did not approve the price. Nothing ran and nothing was charged.",
                            }
                    elif not user_said_yes:
                        return {
                            "status": "not_started",
                            "message": f"Ask the person first: the most this list can cost is ${_dollars(maximum)}. Call approve_list again with user_said_yes=true after they agree.",
                        }
                await self._status(__event_emitter__, "Starting the list")
                started = await asyncio.to_thread(
                    _send,
                    key,
                    "POST",
                    "/v1/capacity/executions",
                    {
                        "quote_id": quote["quote_id"],
                        "quote_hash": quote["quote_hash"],
                        "confirm_max_cents": maximum,
                        "idempotency_key": request_key,
                    },
                )

            find_id = started.get("find_id")
            if not find_id:
                return {"status": "error", "message": "SpecStream did not return a list ID."}
            result = await self._rows(key, find_id, self.valves.wait_seconds, __event_emitter__)
            result["most_it_could_cost_usd"] = _dollars(maximum)
            await self._status(__event_emitter__, f"{result['rows_found']} rows found", True)
            return result
        except SpecStreamError as exc:
            await self._status(__event_emitter__, "Could not start the list", True)
            return {"status": "error", "message": str(exc), "code": exc.code}

    async def get_list_rows(
        self,
        list_id: str,
        next_cursor: str = "",
        __user__: Optional[dict] = None,
        __event_emitter__: Any = None,
    ) -> dict:
        """
        Read the rows of a list that was already started, for free. Each row has its values and the page
        each value came from. Use it to check on a running list or to page through a long one.

        :param list_id: The list_id from approve_list. It starts with fnd_.
        :param next_cursor: The next_cursor from the previous read, to get the following rows. Leave empty for the first rows.
        """
        try:
            key = self._key(__user__)
            if not list_id.startswith("fnd_"):
                return {"status": "error", "message": "Pass the list_id from approve_list. It starts with fnd_."}
            return await self._rows(key, list_id, 0, __event_emitter__, next_cursor or None)
        except SpecStreamError as exc:
            return {"status": "error", "message": str(exc), "code": exc.code}

    async def get_balance(
        self, __user__: Optional[dict] = None, __event_emitter__: Any = None
    ) -> dict:
        """
        Show how much SpecStream balance the person has left. Free to call. Use it when a list cannot start
        or the person asks what they have.
        """
        try:
            key = self._key(__user__)
            balance = await asyncio.to_thread(_send, key, "GET", "/v1/capacity/balance")
            return {
                "available_usd": _dollars(balance.get("available_cents")),
                "reserved_for_running_lists_usd": _dollars(balance.get("reserved_cents")),
                "add_balance": "https://specstream.ai/pricing",
            }
        except SpecStreamError as exc:
            return {"status": "error", "message": str(exc), "code": exc.code}
