# ruff: noqa: E501
# Exact SQL and public-copy literals are kept intact; no behavioral checks are disabled.
"""GitHub Action runner: read the request, get the price, check it against confirm_max_usd, run, write a CSV.

Only the explicit workflow maximum authorizes new work. A stable request key per
workflow job recovers the original run, so a re-run never pays twice. No balance
top-up or subscription is created.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import quote as quote_path

DEFAULT_BASE_URL = "https://api.specstream.ai"


class ConfirmRequiredError(ValueError):
    """Missing confirm_max_usd. Auto-confirm is refused."""


def require_confirm_max_usd(value: Any) -> float:
    if value is None or isinstance(value, bool):
        raise ConfirmRequiredError("confirm_max_usd is required; auto-confirm is refused")
    if isinstance(value, str) and not value.strip():
        raise ConfirmRequiredError("confirm_max_usd is required; auto-confirm is refused")
    try:
        usd = float(value)
    except (TypeError, ValueError) as exc:
        raise ConfirmRequiredError(
            "confirm_max_usd is required and must be a number > 0; auto-confirm is refused"
        ) from exc
    if usd <= 0 or not math.isfinite(usd):
        raise ConfirmRequiredError("confirm_max_usd must be > 0; auto-confirm is refused")
    return usd


def _unwrap(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        data = payload["data"]
        if isinstance(data, dict):
            return data
    if isinstance(payload, dict):
        return payload
    return {}


def _request(
    base_url: str,
    api_key: str,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    *,
    missing_ok: bool = False,
) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    token = api_key if api_key.lower().startswith("bearer ") else f"Bearer {api_key}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": token,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "specstream-find-action/1.1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        if missing_ok and exc.code == 404:
            return {}
        err = exc.read().decode("utf-8", "replace") if exc.fp else ""
        print(f"{method} {path} failed HTTP {exc.code}: {err}", file=sys.stderr)
        raise SystemExit(1) from exc
    loaded = json.loads(text) if text else {}
    return _unwrap(loaded)


def rows_to_csv(page: dict[str, Any]) -> str:
    rows = page.get("rows")
    if not isinstance(rows, list) or not rows:
        return f"find_id,status\n{page.get('find_id', '')},{page.get('status', '')}\n"
    fieldnames: list[str] = []
    dict_rows: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        flat: dict[str, Any] = {}
        for key, value in row.items():
            if isinstance(value, (dict, list)):
                flat[key] = json.dumps(value, separators=(",", ":"))
            else:
                flat[key] = value
            if key not in fieldnames:
                fieldnames.append(key)
        dict_rows.append(flat)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames or ["row"])
    writer.writeheader()
    writer.writerows(dict_rows)
    return buf.getvalue()


def write_github_output(key: str, value: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(f"{key}={value}\n")


def main(env: dict[str, str] | None = None) -> int:
    source = env if env is not None else os.environ
    try:
        confirm_max_usd = require_confirm_max_usd(source.get("INPUT_CONFIRM_MAX_USD"))
    except ConfirmRequiredError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    request_text = (source.get("INPUT_REQUEST") or "").strip()
    api_key = (source.get("INPUT_API_KEY") or source.get("SPECSTREAM_API_KEY") or "").strip()
    if not request_text:
        print("request is required", file=sys.stderr)
        return 2
    if not api_key:
        print("api_key is required", file=sys.stderr)
        return 2
    base_url = (source.get("INPUT_BASE_URL") or DEFAULT_BASE_URL).strip()
    locale = (source.get("INPUT_LOCALE") or "en-US").strip() or "en-US"
    compiled = _request(
        base_url, api_key, "POST", "/v1/parse", {"q": request_text, "locale": locale}
    )
    ast_hash = str(compiled.get("ast_hash") or "")
    if not ast_hash:
        print("compile did not return ast_hash", file=sys.stderr)
        return 1
    run_identity = source.get("INPUT_IDEMPOTENCY_KEY") or ":".join(
        (source.get("GITHUB_RUN_ID", ""), source.get("GITHUB_JOB", ""))
    )
    if not run_identity or run_identity == ":":
        print("idempotency_key is required outside a GitHub workflow", file=sys.stderr)
        return 2
    # Re-running the same workflow job recovers its original execution first.
    key = "action:" + hashlib.sha256(run_identity.encode()).hexdigest()
    existing = _request(
        base_url,
        api_key,
        "GET",
        "/v1/capacity/requests/" + quote_path(key, safe=""),
        missing_ok=True,
    )
    find_id = str(existing.get("find_id") or "")
    if find_id:
        original = _request(base_url, api_key, "GET", f"/v1/finds/{quote_path(find_id, safe='')}")
        if original.get("ast_hash") != ast_hash:
            print(
                "This request key already belongs to a different request; no new work was started",
                file=sys.stderr,
            )
            return 2
    if not find_id:
        ast = compiled.get("ast")
        if not isinstance(ast, dict) or not isinstance(ast.get("limit"), dict):
            print("SpecStream did not return a readable request; nothing was run", file=sys.stderr)
            return 1
        quote = _request(
            base_url,
            api_key,
            "POST",
            "/v1/capacity/quotes",
            {
                "ast_hash": ast_hash,
                "operation": "find",
                "requested_units": ast["limit"]["max"],
            },
        )
        if str(quote.get("currency") or "USD").upper() != "USD":
            print(
                f"This account is priced in {quote.get('currency')}. "
                "confirm_max_usd is in US dollars; no execution started",
                file=sys.stderr,
            )
            return 2
        if quote.get("can_authorize") is False:
            print("This key cannot approve work for this quote; no execution started", file=sys.stderr)
            return 2
        maximum = quote.get("maximum_cents")
        if type(maximum) is not int or maximum > math.floor(confirm_max_usd * 100 + 1e-7):
            print(
                "The quote exceeds the explicitly configured maximum; no execution started",
                file=sys.stderr,
            )
            return 2
        created = _request(
            base_url,
            api_key,
            "POST",
            "/v1/capacity/executions",
            {
                "quote_id": quote["quote_id"],
                "quote_hash": quote["quote_hash"],
                "confirm_max_cents": maximum,
                "idempotency_key": key,
            },
        )
        find_id = str(created.get("find_id") or "")
    if not find_id:
        print("Execution was not confirmed; recover the same request key", file=sys.stderr)
        return 1
    write_github_output("find_id", find_id)
    deadline = time.monotonic() + 1800
    while True:
        state = _request(base_url, api_key, "GET", f"/v1/finds/{quote_path(find_id, safe='')}")
        if state.get("status") in {"completed", "partial"}:
            break
        if state.get("status") in {"failed", "canceled", "expired"} or time.monotonic() >= deadline:
            print(
                f"Find {find_id}: {state.get('status')}. Existing work is preserved; no repeated purchase.",
                file=sys.stderr,
            )
            return 1
        time.sleep(2)
    page = _request(base_url, api_key, "GET", f"/v1/finds/{quote_path(find_id, safe='')}/rows")
    rows = list(page.get("rows", []))
    cursor = page.get("next_cursor")
    seen = set()
    while cursor:
        if cursor in seen:
            raise RuntimeError("Repeated page cursor; refusing an incomplete export")
        seen.add(cursor)
        next_page = _request(
            base_url,
            api_key,
            "GET",
            f"/v1/finds/{quote_path(find_id, safe='')}/rows?cursor={quote_path(str(cursor), safe='')}",
        )
        rows.extend(next_page.get("rows", []))
        cursor = next_page.get("next_cursor")
    page["rows"] = rows
    csv_name = "specstream-results.csv"
    workspace = source.get("GITHUB_WORKSPACE") or os.getcwd()
    csv_path = os.path.join(workspace, csv_name)
    with open(csv_path, "w", encoding="utf-8", newline="") as handle:
        handle.write(rows_to_csv(page))
    write_github_output("find_id", find_id)
    write_github_output("csv_path", csv_path)
    print(f"wrote {csv_path} find_id={find_id} confirm_max_usd={confirm_max_usd}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
