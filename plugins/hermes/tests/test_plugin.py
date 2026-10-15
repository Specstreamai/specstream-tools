"""Checks that the Hermes package stays loadable and in step with the shared skills."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]


def _json(name):
    return json.loads((ROOT / name).read_text())


def test_manifest_names_the_server_untrusted():
    manifest = _json("plugin.json")
    assert manifest["name"] == "specstream"
    assert re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"])
    servers = manifest["extensions"]["com.nousresearch.hermes"]["servers"]
    assert servers == {"specstream": {"trust": "untrusted"}}


def test_mcp_entry_is_remote_oauth_without_credentials():
    servers = _json("mcp.json")["mcpServers"]
    assert list(servers) == ["specstream"]
    entry = servers["specstream"]
    assert entry["type"] == "streamable-http"
    assert entry["url"] == "https://api.specstream.ai/mcp"
    assert "headers" not in entry and "env" not in entry


def test_skills_are_valid_and_match_the_shared_copies():
    names = sorted(p.name for p in (ROOT / "skills").iterdir())
    assert names == ["approve-work", "compile", "continue-work", "review-work"]
    for name in names:
        text = (ROOT / "skills" / name / "SKILL.md").read_text()
        front = re.match(r"---\nname: (.+)\ndescription: (.+)\n---\n", text)
        assert front and front.group(1) == name and front.group(2)
        assert text == (REPO / "skills" / name / "SKILL.md").read_text()
