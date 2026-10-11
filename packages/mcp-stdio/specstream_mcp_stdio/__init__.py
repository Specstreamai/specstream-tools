"""SPECSTREAM MCP stdio proxy. Bearer from environment only."""

from specstream_mcp_stdio.proxy import authorization_from_env, main

__all__ = ["authorization_from_env", "main"]
