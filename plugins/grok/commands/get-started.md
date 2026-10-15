---
description: Try SpecStream with a free first list in Grok Build
---

# SpecStream: get started

Walk the user through their first list, one short step at a time. Keep every message brief and ask before moving on.

## Step 1: Check the connection

Confirm the specstream MCP server is connected. If it is not ready, tell the user to open `/mcp`, select **specstream**, and press `i` to sign in. The sign-in opens SpecStream in the browser. New accounts get $10 of work free for 30 days.

## Step 2: Ask for a list

Ask what list they wish they had. If they have no idea, offer one: "independent bookstores in Oregon with a website and a phone number", "open grants for food banks in Texas", or "companies that filed to raise $5M or more this week". Use `list_request_templates` for more that already work.

## Step 3: Read it back

Run `compile` and say back what it found: the kind of thing, the conditions, the details to bring back and how many. Nothing runs and nothing is charged yet. Fix anything wrong with `edit_spec`.

## Step 4: See the price

Use the `specstream-review-work` skill to get the exact maximum price. Say it out loud with the expiry. Reading and pricing are free.

## Step 5: Approve and read the rows

Only if the user says go, use `specstream-approve-work`. Then use `specstream-continue-work` to read the rows with the page behind each fact, and offer to send them to Google Sheets, Excel, Notion, Airtable or a CRM, or to keep the list current.
