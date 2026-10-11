# Security

## Report a vulnerability

Use [private vulnerability reporting](https://github.com/Specstreamai/specstream-tools/security/advisories/new) on this repository, or write to support@specstream.ai with "Security" in the subject. Please do not open a public issue for a vulnerability.

Include what you found, the steps to reproduce it, and the package or file involved. We reply, and we tell you when it is fixed.

## What this repository covers

The code here is client code and configuration: the SDKs, the stdio proxy, the n8n node, the GitHub Action, the plugins and the examples. The SpecStream service at `specstream.ai` and `api.specstream.ai` is reported the same way.

## Keys

Never put a SpecStream API key in a prompt, a file in this repository or an issue. Every client here reads `SPECSTREAM_API_KEY` from the environment. If a key was exposed, revoke it under **Agents & API** in the workspace and create a new one.

A key can be limited to read, prepare or execute, to named projects, to an expiry and to a spending ceiling. Paid work needs an approved price in every case.

## Supported versions

The latest release of each package receives fixes.
