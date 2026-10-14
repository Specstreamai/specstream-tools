from typing import Any

import requests

BASE_URL = "https://api.specstream.ai"
LIST_URL = "https://specstream.ai/workspace/collections/"

# Fields every row carries; a column with the same name is renamed so it can't overwrite them.
RESERVED = {"id", "list_id", "list_link", "position", "source_url", "checked_at"}


class SpecStreamClient:
    def __init__(self, api_key: str) -> None:
        self.session = requests.Session()
        self.session.headers.update(
            {"Authorization": f"Bearer {api_key.strip()}", "Content-Type": "application/json"}
        )

    def _send(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        response = self.session.request(
            method, BASE_URL + path, json=body, timeout=60, allow_redirects=False
        )
        response.raise_for_status()
        return response.json()["data"]

    def get(self, path: str) -> dict[str, Any]:
        return self._send("GET", path)

    def post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        return self._send("POST", path, body)

    def recover(self, request_key: str) -> dict[str, Any] | None:
        try:
            data = self.get(f"/v1/capacity/requests/{request_key}")
        except requests.HTTPError:
            return None
        return data if data.get("find_id") else None


def list_link(list_id: str) -> str:
    return LIST_URL + list_id


def flatten(list_id: str, record: dict[str, Any]) -> dict[str, Any]:
    """One row as flat fields: each column's label holds what the list shows, plus the page
    the row's first value was read from and the link to the list."""
    row: dict[str, Any] = {
        "id": f"{list_id}:{record.get('entity_id')}",
        "list_id": list_id,
        "list_link": list_link(list_id),
        "position": record.get("ordinal"),
    }
    source: dict[str, Any] | None = None
    for cell in record.get("cells") or []:
        label = str(cell.get("label") or cell.get("column_id") or "").strip()
        if not label:
            continue
        if label in RESERVED:
            label = f"{label} (column)"
        value = cell.get("display")
        row[label] = value if value is not None else cell.get("value", "")
        provenance = cell.get("provenance") or {}
        if source is None and provenance.get("source_url"):
            source = provenance
    row["source_url"] = (source or {}).get("source_url", "")
    row["checked_at"] = (source or {}).get("observed_at", "")
    return row
