import test from "node:test";
import assert from "node:assert/strict";
import {Client, SpecstreamError} from "../dist/index.js";

const data = (value: unknown, status = 200) => new Response(JSON.stringify({data: value}), {status});

test("additive family responses remain usable", async () => {
  const client = new Client({apiKey: "offline", fetch: async () => data({ast: {entity_type: "future_family"}})});
  assert.deepEqual((await client.compile("new breadth")).ast, {entity_type: "future_family"});
});

test("conflict details and historical body are both preserved", () => {
  const body = {error: {code: "unquoted_plan", details: {current_version: 8}}};
  for (const payload of [body, JSON.stringify(body)]) {
    const error = new SpecstreamError("conflict", 409, payload);
    assert.equal(error.code, "unquoted_plan");
    assert.deepEqual(error.details, {current_version: 8});
    assert.equal(error.body, payload);
  }
});

for (const format of ["xlsx", "csv", "json", "html"] as const) {
  test(`download ${format} carries no account bearer or ambient cookies`, async () => {
    let calls = 0;
    const client = new Client({apiKey: "offline", fetch: async (url, init) => {
      calls++;
      if (init?.method === "POST") {
        assert.equal(new Headers(init.headers).get("Authorization"), "Bearer offline");
        assert.equal(JSON.parse(init.body as string).format, format);
        return data({download_url: "https://specstream.ai/export/one_use"});
      }
      assert.equal(new Headers(init?.headers).get("Authorization"), null);
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.redirect, "error");
      return new Response("owned-artifact");
    }});
    assert.equal(new TextDecoder().decode(await client.downloadExport("find", format)), "owned-artifact");
    assert.equal(calls, 2);
  });
}

for (const url of [
  "https://other.example/export/capability", "https://user@specstream.ai/export/capability",
  "https://specstream.ai:0/export/capability", "https://@specstream.ai/export/capability",
  "http://specstream.ai/export/capability", "https://specstream.ai/v1/account/export",
  "https://specstream.ai/export/capability?leak=yes", "https://specstream.ai/export/%2f",
  "https://specstream.ai\\@other.example/export/capability", "\nhttps://specstream.ai/export/capability",
]) {
  test(`reject untrusted export location ${JSON.stringify(url)}`, async () => {
    let calls = 0;
    const client = new Client({apiKey: "offline", fetch: async () => {calls++; return data({download_url: url});}});
    await assert.rejects(client.downloadExport("find"), /download location/);
    assert.equal(calls, 1);
  });
}

test("empty and oversized streams are errors", async () => {
  for (const [body, limit, message] of [["", 20, /no body/], ["12345", 4, /maxBytes/]] as const) {
    const client = new Client({apiKey: "offline", fetch: async (_url, init) => init?.method === "POST"
      ? data({download_url: "https://specstream.ai/export/one_use"}) : new Response(body)});
    await assert.rejects(client.downloadExport("find", "json", limit), message);
  }
});

test("download transport errors omit the capability", async () => {
  const client = new Client({apiKey: "offline", fetch: async (url, init) => {
    if (init?.method === "POST") return data({download_url: "https://specstream.ai/export/private_capability"});
    throw new Error(url);
  }});
  await assert.rejects(client.downloadExport("find"), (error: SpecstreamError) => {
    assert.doesNotMatch(error.message, /private_capability/);
    assert.equal(error.body, null);
    return true;
  });
});

test("request and export transport deadlines are explicit", async () => {
  let calls = 0;
  const client = new Client({apiKey: "offline", timeoutMs: 250, fetch: async (_url, init) => {
    calls++;
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init?.signal?.aborted, false);
    return init?.method === "POST"
      ? data({download_url: "https://specstream.ai/export/one_use"}) : new Response("owned");
  }});
  await client.downloadExport("find");
  assert.equal(calls, 2);
  for (const timeoutMs of [0, -1, 0.5, Infinity, NaN, 2_147_483_648]) {
    assert.throws(() => new Client({apiKey: "offline", timeoutMs}), /timeoutMs/);
  }
});
