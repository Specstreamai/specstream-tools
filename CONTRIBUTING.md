# Contributing

Fixes and improvements to the clients, the plugins, the skills and the examples are welcome.

- Open an issue first for anything larger than a fix, so we can agree on the shape.
- Keep a change to one package. Each package has its own tests: `python -m pytest` in `packages/sdk-py`, `npm test` in `packages/sdk-ts` and `integrations/n8n`, `python -m unittest` in `actions/find-action`.
- Never commit a key or a real result. Examples read `SPECSTREAM_API_KEY` from the environment.
- Anything that can spend money must keep the approval step: a quote, a maximum the person approved, and a stable request key.
- By contributing you agree your work is released under the [MIT license](LICENSE).

The SDKs and the n8n node are generated or synced from SpecStream's own source. We apply accepted changes there and they come back here with the next release.

Questions: support@specstream.ai.
