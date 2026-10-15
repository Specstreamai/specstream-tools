"use strict";

// Needs the build output: `npm test` builds first.
const assert = require("assert");
const { SpecstreamTrigger } = require("../dist/nodes/Specstream/SpecstreamTrigger.node.js");

function context(staticData, calls, failDelete) {
  return {
    getWorkflowStaticData: () => staticData,
    getCredentials: async () => ({ apiBase: "https://api.specstream.ai" }),
    getNodeParameter: () => "find.completed",
    getNodeWebhookUrl: () => "https://n8n.example/webhook/specstream",
    getNode: () => ({ name: "SpecStream Trigger", type: "specstreamTrigger", typeVersion: 1, id: "n1", position: [0, 0], parameters: {} }),
    helpers: {
      httpRequestWithAuthentication: async (_name, options) => {
        calls.push(`${options.method} ${options.url.replace("https://api.specstream.ai", "")}`);
        if (options.method === "DELETE" && failDelete) throw Object.assign(new Error("404 not found"), { httpCode: "404" });
        if (options.method === "POST") return { data: { hook_id: "hk_new", secret: "s_new" } };
        return { data: {} };
      },
    },
  };
}

(async () => {
  const methods = new SpecstreamTrigger().webhookMethods.default;

  // Activating again removes the hook stored last time before registering a new one.
  let calls = [];
  let data = { hook_id: "hk_old", secret: "s_old", event: "find.completed" };
  await methods.create.call(context(data, calls));
  assert.deepStrictEqual(calls, ["DELETE /v1/account/webhooks/hk_old", "POST /v1/account/webhooks"]);
  assert.strictEqual(data.hook_id, "hk_new");

  // The old hook is already gone: the new one is still registered.
  calls = [];
  data = { hook_id: "hk_old", secret: "s_old", event: "find.completed" };
  await methods.create.call(context(data, calls, true));
  assert.strictEqual(data.hook_id, "hk_new");

  // A hook saved for another event is not reused.
  calls = [];
  data = { hook_id: "hk_old", secret: "s", event: "monitor.found" };
  assert.strictEqual(await methods.checkExists.call(context(data, calls)), false);
  assert.deepStrictEqual(calls, []);

  console.log("n8n trigger webhook replacement ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
