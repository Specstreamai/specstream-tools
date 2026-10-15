import { defineComponent } from "convex/server";
import { v } from "convex/values";

export default defineComponent("specstream", {
  env: {
    /** SpecStream API key. Create one under Agents & API at https://specstream.ai/workspace/agents. */
    SPECSTREAM_API_KEY: v.string(),
    /** Override the API base URL. Defaults to https://api.specstream.ai. */
    SPECSTREAM_API_URL: v.optional(v.string()),
    /**
     * Signing secret returned when you register a webhook (see `registerWebhook`).
     * Optional, but recommended: when set, every delivery to the component's
     * HTTP route must carry a valid `Specstream-Signature`.
     */
    SPECSTREAM_WEBHOOK_SECRET: v.optional(v.string()),
  },
});
