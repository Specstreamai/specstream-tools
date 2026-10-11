from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import run as find_action

HASH = "h" * 64


def quote(**over: object) -> dict:
    base = {
        "quote_id": "cqt_abc",
        "quote_hash": "a" * 64,
        "maximum_cents": 1200,
        "currency": "USD",
        "can_authorize": True,
    }
    base.update(over)
    return base


def service(calls: list, *, price: dict | None = None, existing: dict | None = None):
    """A stand-in for the API that answers the way api.specstream.ai answers."""

    def fake_request(base_url, api_key, method, path, body=None, *, missing_ok=False):
        calls.append((method, path, body))
        if path == "/v1/parse":
            return {"ast_hash": HASH, "ast": {"limit": {"max": 25}}}
        if path.startswith("/v1/capacity/requests/"):
            return existing or {}
        if path == "/v1/capacity/quotes":
            return price or quote()
        if path == "/v1/capacity/executions":
            return {"find_id": "find_9"}
        if path == "/v1/finds/find_9":
            return {"find_id": "find_9", "status": "completed", "ast_hash": HASH}
        if path == "/v1/finds/find_9/rows":
            return {"rows": [{"name": "Row", "entity_type": "grant"}], "next_cursor": None}
        raise AssertionError(path)

    return fake_request


def run_action(fake, confirm: str, workspace: str) -> int:
    with (
        mock.patch.object(find_action, "_request", side_effect=fake),
        mock.patch.object(find_action, "write_github_output"),
    ):
        return find_action.main(
            {
                "INPUT_REQUEST": "US wastewater grants",
                "INPUT_API_KEY": "ss_test_x",
                "INPUT_CONFIRM_MAX_USD": confirm,
                "GITHUB_RUN_ID": "42",
                "GITHUB_JOB": "find",
                "GITHUB_WORKSPACE": workspace,
            }
        )


class FindActionTests(unittest.TestCase):
    def test_missing_confirm_max_usd_fails_before_http(self) -> None:
        with mock.patch.object(find_action, "_request") as request:
            code = find_action.main(
                {
                    "INPUT_REQUEST": "HVAC shops in Austin with a published email",
                    "INPUT_API_KEY": "ss_test_x",
                    "INPUT_CONFIRM_MAX_USD": "",
                }
            )
        self.assertEqual(code, 2)
        request.assert_not_called()

    def test_absent_confirm_key_fails(self) -> None:
        with mock.patch.object(find_action, "_request") as request:
            code = find_action.main(
                {"INPUT_REQUEST": "creators with a published email", "INPUT_API_KEY": "ss_test_x"}
            )
        self.assertEqual(code, 2)
        request.assert_not_called()

    def test_zero_confirm_fails(self) -> None:
        with mock.patch.object(find_action, "_request") as request:
            code = find_action.main(
                {
                    "INPUT_REQUEST": "tenders in Texas",
                    "INPUT_API_KEY": "ss_test_x",
                    "INPUT_CONFIRM_MAX_USD": "0",
                }
            )
        self.assertEqual(code, 2)
        request.assert_not_called()

    def test_happy_path_approves_the_quoted_maximum_and_writes_a_csv(self) -> None:
        calls: list = []
        with tempfile.TemporaryDirectory() as workspace:
            code = run_action(service(calls), "15", workspace)
            self.assertEqual(code, 0)
            self.assertTrue((Path(workspace) / "specstream-results.csv").is_file())
        execute = [c for c in calls if c[1] == "/v1/capacity/executions"]
        self.assertEqual(len(execute), 1)
        body = execute[0][2]
        self.assertEqual(body["confirm_max_cents"], 1200)
        self.assertEqual(body["quote_id"], "cqt_abc")
        self.assertTrue(body["idempotency_key"].startswith("action:"))

    def test_quote_above_the_ceiling_runs_nothing(self) -> None:
        calls: list = []
        with tempfile.TemporaryDirectory() as workspace:
            code = run_action(service(calls, price=quote(maximum_cents=1600)), "15", workspace)
        self.assertEqual(code, 2)
        self.assertFalse([c for c in calls if c[1] == "/v1/capacity/executions"])

    def test_euro_quote_is_refused_against_a_dollar_ceiling(self) -> None:
        calls: list = []
        with tempfile.TemporaryDirectory() as workspace:
            code = run_action(service(calls, price=quote(currency="EUR")), "15", workspace)
        self.assertEqual(code, 2)
        self.assertFalse([c for c in calls if c[1] == "/v1/capacity/executions"])

    def test_a_rerun_recovers_the_original_work_and_pays_nothing_more(self) -> None:
        calls: list = []
        existing = {"find_id": "find_9", "state": "settled"}
        with tempfile.TemporaryDirectory() as workspace:
            code = run_action(service(calls, existing=existing), "15", workspace)
        self.assertEqual(code, 0)
        self.assertFalse([c for c in calls if c[1] in ("/v1/capacity/quotes", "/v1/capacity/executions")])


if __name__ == "__main__":
    unittest.main()
