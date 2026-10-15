# SpecStream: find a list

Ask `@agent` for a list and get the whole list. Every roofer in Columbus rated 4.5 or better, every food bank in Texas with its revenue, every company that filed to raise $5M or more this week. SpecStream reads the live web where those things are kept and hands back every matching row with the page it came from.

You approve the price before anything runs, and you pay only for the matches: 10¢, 30¢ or $1 a row. New accounts start with $10 of work, no card.

## Set up

1. In SpecStream ([specstream.ai](https://specstream.ai)), open **Agents & API** and create an API key (it starts with `ss_live_`).
2. In AnythingLLM, open **Agent Skills**, find **SpecStream: find a list**, paste the key, and set the spending cap.
3. In a workspace chat, ask with `@agent`:

> @agent Find every roofing company in Columbus, Ohio rated 4.5 or better with fewer than 20 Google reviews, with their phone number. Give me 50.

The agent shows the most it can cost and waits for you to approve. Then it returns every row with the pages it came from and a link to the full list. Ask for a started list by ID (`fnd_...`) to read its rows again for free.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `SPECSTREAM_API_KEY` | empty | SpecStream API key |
| `MAX_PRICE_USD` | 5 | The most one list may cost. A price above it is refused before anything runs |
| `APPROVAL` | `ask` | `ask` shows an approval prompt for every price. `within_cap` starts lists at or under the cap without asking |
| `WAIT_SECONDS` | 90 | How long to wait for rows after a list starts. The list keeps running after that |
| `MAX_ROWS` | 25 | Most rows handed to the model per read |

AnythingLLM approves automatically in runs with nobody at the screen, such as scheduled jobs. The cap still applies there, so keep it at a number you're happy to lose.

Prefer MCP? Add `https://api.specstream.ai/mcp` as a Streamable HTTP server. Steps in the [full guide](https://github.com/specstream/specstream-tools/tree/main/integrations/anythingllm).

Support: support@specstream.ai · MIT license.
