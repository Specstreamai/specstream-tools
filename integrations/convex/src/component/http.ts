import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { verifySignature } from "./signature.js";

const http = httpRouter();

/**
 * SpecStream webhook sink for finished lists. Mounted under the app's
 * `httpPrefix`, e.g. `app.use(specstream, { httpPrefix: "/specstream/" })`
 * serves it at `<site>/specstream/webhook`.
 *
 * With SPECSTREAM_WEBHOOK_SECRET set, a delivery must carry a valid
 * `Specstream-Signature`. Either way a delivery only wakes up a list the
 * component already tracks: rows always come from the SpecStream API with
 * your key, never from the delivery itself.
 */
http.route({
  path: "/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();

    const secret = env.SPECSTREAM_WEBHOOK_SECRET;
    if (secret) {
      const valid = await verifySignature(
        secret,
        raw,
        request.headers.get("specstream-signature"),
      );
      if (!valid) return new Response("invalid signature", { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response("invalid JSON", { status: 400 });
    }

    const result = await ctx.runMutation(internal.lists.handleWebhook, {
      event: typeof payload?.event === "string" ? payload.event : undefined,
      specstreamListId:
        typeof payload?.find_id === "string" ? payload.find_id : undefined,
    });
    return new Response(result.reason ?? null, {
      status: result.accepted ? 200 : 400,
    });
  }),
});

export default http;
