import { v } from "convex/values";
import { action } from "./_generated/server.js";
import { asString, specstreamRequest } from "./api.js";
import { fail, readRequest } from "./helpers.js";
import { readingResult } from "./validators.js";

/**
 * Read a request in plain words and say what SpecStream understood. Nothing is
 * priced, nothing runs and nothing is charged.
 */
export const read = action({
  args: { request: v.string(), locale: v.optional(v.string()) },
  returns: readingResult,
  handler: async (_ctx, args) => await readRequest(args.request, args.locale),
});

/** Who the API key belongs to and what is left to spend. */
export const account = action({
  args: {},
  returns: v.object({
    email: v.optional(v.string()),
    /** Null when the balance could not be read. */
    availableCents: v.union(v.number(), v.null()),
  }),
  handler: async () => {
    const me = await specstreamRequest("/v1/me");
    let availableCents: number | null = null;
    try {
      const balance = await specstreamRequest("/v1/capacity/balance");
      if (typeof balance.available_cents === "number") {
        availableCents = balance.available_cents;
      }
    } catch {
      availableCents = null;
    }
    return { email: asString(me.email), availableCents };
  },
});

/**
 * Ask SpecStream to call your deployment when a list finishes. Webhooks belong
 * to the account, so do this once, then set the returned `secret` as
 * SPECSTREAM_WEBHOOK_SECRET. The URL must be public HTTPS, for example
 * `https://<your-deployment>.convex.site/specstream/webhook`.
 */
export const registerWebhook = action({
  args: { url: v.string() },
  returns: v.object({ hookId: v.string(), secret: v.string() }),
  handler: async (_ctx, args) => {
    const data = await specstreamRequest("/v1/account/webhooks", {
      method: "POST",
      body: { url: args.url, events: ["find.completed"] },
    });
    const hookId = asString(data.hook_id);
    const secret = asString(data.secret);
    if (!hookId || !secret) {
      fail(
        "specstream_unreadable",
        "SpecStream returned a webhook this component could not read.",
      );
    }
    return { hookId, secret };
  },
});
