import { defineApp } from "convex/server";
import { v } from "convex/values";
import specstream from "@specstream/convex/convex.config";

const app = defineApp({
  env: {
    SPECSTREAM_API_KEY: v.string(),
    SPECSTREAM_WEBHOOK_SECRET: v.optional(v.string()),
    // Point at the mock server used by `npm run dev:mock`. Defaults to
    // https://api.specstream.ai.
    SPECSTREAM_API_URL: v.optional(v.string()),
  },
});

app.use(specstream, {
  // Mounts the component's webhook route at <site>/specstream/webhook.
  // Optional: without it, the component checks on each list every few seconds.
  httpPrefix: "/specstream/",
  env: {
    SPECSTREAM_API_KEY: app.env.SPECSTREAM_API_KEY,
    SPECSTREAM_WEBHOOK_SECRET: app.env.SPECSTREAM_WEBHOOK_SECRET,
    SPECSTREAM_API_URL: app.env.SPECSTREAM_API_URL,
  },
});

export default app;
