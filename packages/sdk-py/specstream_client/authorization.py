"""Require an explicit signed-work authorization before any client HTTP call."""

from __future__ import annotations

import re
from typing import Any


def require_work_authorization(value: Any) -> None:
    required = {"quote_id", "quote_hash", "idempotency_key", "confirm_max_cents"}
    if (
        not isinstance(value, dict)
        or not required <= value.keys()
        or set(value) - required - {"authority_id"}
    ):
        raise ValueError(
            "Provide the exact quote identity, signature, maximum cents and request key"
        )
    if not isinstance(value["quote_id"], str) or not value["quote_id"]:
        raise ValueError("An explicit quote identity is required")
    if not isinstance(value["quote_hash"], str) or not re.fullmatch(
        r"[0-9a-f]{64}", value["quote_hash"]
    ):
        raise ValueError("The reviewed quote signature is required")
    key = value["idempotency_key"]
    if not isinstance(key, str) or not 8 <= len(key) <= 128:
        raise ValueError("Use a stable request key containing 8 to 128 characters")
    maximum = value["confirm_max_cents"]
    if type(maximum) is not int or maximum < 0:
        raise ValueError("The approved maximum must be an explicit nonnegative integer in cents")
    if value.get("authority_id") is not None and not isinstance(value["authority_id"], str):
        raise ValueError("Authority must be an explicit existing identifier")
