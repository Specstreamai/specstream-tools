# SpecStream piece for Activepieces

SpecStream builds lists from the live web: describe the list in plain words ("roofing companies in Columbus, Ohio with their website and phone") and get every matching row, each with the page it was read from. The price is shown before anything runs.

## Install

In Activepieces, open **Platform admin → Pieces → Install piece**, choose **npm**, and enter `@specstream/piece-specstream`.

## Actions

- **Find a List**: reads the request, prices it, and starts it only if the price is at or below your **Maximum Price**. Returns the list ID and link.
- **Get List Results**: the rows of a list, each with `source_url` and `checked_at`.
- **Custom API Call**: any endpoint on `https://api.specstream.ai`.

## Triggers

- **New Row in a Finished List**: runs once for every row when a list finishes.
- **New or Changed Row in a Watched List**: runs once for every new or changed row in a list you keep current.

## Connect

Create an API key in SpecStream under [Agents & API](https://specstream.ai/workspace/settings). New accounts get $10 of work free. Docs: https://specstream.ai/docs/api
