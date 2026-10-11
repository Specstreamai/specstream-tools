from __future__ import annotations

import io, json
import pytest

from specstream_client.cli import _parser, main


def test_removed_commands_are_not_alternative_work_paths():
    for command in ("quote", "confirm", "run"):
        with pytest.raises(SystemExit):
            _parser().parse_args([command])


def test_current_quote_and_authorization_use_explicit_request_files(tmp_path):
    body = tmp_path / "reviewed.json"
    body.write_text(
        json.dumps(
            {
                "quote_id": "cqt_fixture",
                "quote_hash": "a" * 64,
                "confirm_max_cents": 123,
                "idempotency_key": "stable-request",
            }
        )
    )
    parsed = _parser().parse_args(["authorize-capacity-work", "--request", str(body)])
    assert parsed.cmd == "authorize-capacity-work"
    with parsed.request as stream:
        assert json.load(stream)["confirm_max_cents"] == 123
    with pytest.raises(SystemExit):
        _parser().parse_args(["authorize-capacity-work"])


def test_family_discovery_is_available_without_keys():
    output = io.StringIO()
    assert main(["families"], out=output) == 0
    assert "software_repository" in json.loads(output.getvalue())
