/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  actionGeneric,
  anyApi,
  internalMutationGeneric,
  makeFunctionReference,
  type ApiFromModules,
} from "convex/server";
import { v } from "convex/values";
import { SpecStreamClient, dollars, flattenRow, listLink } from "./index.js";
import type { ListCompletePayload, ListRow } from "./index.js";
import {
  appSchema,
  components,
  initConvexTest,
  mockFetch,
} from "./setup.test.js";

const specstream = new SpecStreamClient(components.specstream);

// App-side wrappers, the way a consuming app would write them.
export const findFoodBanks = actionGeneric({
  args: { maxPriceUsd: v.number() },
  handler: async (ctx, args) =>
    await specstream.findList(ctx, {
      request: "food banks in Texas, with their annual revenue",
      rows: 100,
      maxPriceUsd: args.maxPriceUsd,
      idempotencyKey: "food-banks-1",
      onComplete: makeFunctionReference<"mutation", ListCompletePayload, null>(
        "index.test:onDone",
      ) as any,
      context: { label: "food banks" },
    }),
});

export const quoteIt = actionGeneric({
  args: {},
  handler: async (ctx) =>
    await specstream.quote(ctx, { request: "food banks in Texas", rows: 100 }),
});

export const approveIt = actionGeneric({
  args: { quoteId: v.string(), confirmMaxCents: v.number() },
  handler: async (ctx, args) => await specstream.approve(ctx, args),
});

export const onDone = internalMutationGeneric({
  args: {
    listId: v.string(),
    specstreamListId: v.string(),
    status: v.string(),
    rowCount: v.number(),
    requestedCount: v.number(),
    error: v.optional(v.string()),
    context: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("completions", {
      listId: args.listId,
      status: args.status,
      rowCount: args.rowCount,
      context: args.context,
    });
  },
});

const testApi = (
  anyApi as unknown as ApiFromModules<{
    "index.test": {
      findFoodBanks: typeof findFoodBanks;
      quoteIt: typeof quoteIt;
      approveIt: typeof approveIt;
    };
  }>
)["index.test"];

const HASH = "b".repeat(64);
const routes = {
  "POST /v1/parse": {
    body: {
      data: {
        status: "runnable",
        ast_hash: HASH,
        canonical_sentence: "Food banks in Texas",
        ast: { limit: { max: 100, inferred: false } },
      },
    },
  },
  "POST /v1/capacity/quotes": {
    body: {
      data: {
        quote_id: "qte_9",
        quote_hash: HASH,
        currency: "USD",
        maximum_cents: 1500,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        can_authorize: true,
        terms: { unit_cents: 15 },
      },
    },
  },
  "POST /v1/capacity/executions": {
    body: {
      data: {
        reservation_id: "res_9",
        find_id: "fnd_9",
        maximum_cents: 1500,
        state: "reserved",
        replay: false,
      },
    },
  },
  "GET /v1/finds/fnd_9": {
    body: {
      data: {
        find_id: "fnd_9",
        status: "completed",
        requested_count: 100,
        accepted_count: 1,
      },
    },
  },
  "GET /v1/finds/fnd_9/rows": {
    body: {
      data: {
        find_id: "fnd_9",
        status: "completed",
        accepted_count: 1,
        next_cursor: null,
        rows: [
          {
            entity_id: "ent_1",
            ordinal: 1,
            cells: [
              {
                column_id: "name",
                label: "Name",
                value: "Houston Food Bank",
                display: "Houston Food Bank",
                provenance: {
                  source_url: "https://houstonfoodbank.org",
                  observed_at: "2026-10-15T10:00:00Z",
                },
              },
              {
                column_id: "revenue",
                label: "Annual revenue",
                value: 1200000,
                display: "$1.2M",
                provenance: {
                  source_url: "https://houstonfoodbank.org/990",
                  observed_at: "2026-10-15T10:00:00Z",
                },
              },
            ],
          },
        ],
      },
    },
  },
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SpecStreamClient", () => {
  test("quote then approve starts the list the quote prices", async () => {
    const t = initConvexTest();
    const calls = mockFetch(routes);

    const quoted = await t.action(testApi.quoteIt, {});
    if (quoted.status !== "quoted") throw new Error("expected a quote");
    expect(quoted.maximumCents).toBe(1500);

    const started = await t.action(testApi.approveIt, {
      quoteId: quoted.quoteId,
      confirmMaxCents: quoted.maximumCents,
    });
    expect(started).toMatchObject({
      status: "started",
      specstreamListId: "fnd_9",
    });
    expect(
      calls.filter((c) => c.path === "/v1/capacity/executions"),
    ).toHaveLength(1);
  });

  test("approving the wrong maximum from the app runs nothing", async () => {
    const t = initConvexTest();
    const calls = mockFetch(routes);
    const quoted = await t.action(testApi.quoteIt, {});
    if (quoted.status !== "quoted") throw new Error("expected a quote");
    await expect(
      t.action(testApi.approveIt, {
        quoteId: quoted.quoteId,
        confirmMaxCents: 100,
      }),
    ).rejects.toThrow();
    expect(calls.some((c) => c.path === "/v1/capacity/executions")).toBe(false);
  });

  test("findList stops above the maximum", async () => {
    const t = initConvexTest();
    const calls = mockFetch(routes);
    const result = await t.action(testApi.findFoodBanks, { maxPriceUsd: 10 });
    expect(result).toMatchObject({
      status: "over_maximum",
      maximumCents: 1500,
    });
    expect(calls.some((c) => c.path === "/v1/capacity/executions")).toBe(false);
  });

  test("findList turns dollars into cents and runs onComplete once with the context", async () => {
    const t = initConvexTest(appSchema);
    const calls = mockFetch(routes);

    const result = await t.action(testApi.findFoodBanks, { maxPriceUsd: 15 });
    expect(result).toMatchObject({ status: "started" });
    const execution = calls.find((c) => c.path === "/v1/capacity/executions")!;
    expect(execution.body).toMatchObject({
      confirm_max_cents: 1500,
      idempotency_key: "convex-food-banks-1",
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const done = await t.run(
      async (ctx: any) => await ctx.db.query("completions").collect(),
    );
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({
      status: "completed",
      rowCount: 1,
      context: { label: "food banks" },
    });
  });

  test("rejects a maximum that isn't a positive price", async () => {
    const t = initConvexTest();
    mockFetch(routes);
    await expect(
      t.action(testApi.findFoodBanks, { maxPriceUsd: 0 }),
    ).rejects.toThrow(/greater than 0/);
  });
});

describe("helpers", () => {
  const row: ListRow = {
    _id: "r1",
    _creationTime: 1,
    listId: "l1",
    entityId: "ent_1",
    ordinal: 4,
    sourceUrl: "https://a.org",
    observedAt: "2026-10-15T10:00:00Z",
    cells: [
      { columnId: "name", label: "Name", display: "Houston Food Bank" },
      { columnId: "phone", label: "Phone", absence: "Not published" },
      { columnId: "sourceUrl", label: "sourceUrl", value: "x" },
    ],
  };

  test("flattenRow gives one field per column and the page behind the row", () => {
    expect(flattenRow(row)).toEqual({
      entityId: "ent_1",
      position: 4,
      sourceUrl: "https://a.org",
      checkedAt: "2026-10-15T10:00:00Z",
      Name: "Houston Food Bank",
      Phone: "",
      "sourceUrl (column)": "x",
    });
  });

  test("flattenRow prefers the full detail set", () => {
    const flat = flattenRow({
      ...row,
      details: [{ columnId: "ein", label: "EIN", value: "74-123" }],
    });
    expect(flat.EIN).toBe("74-123");
    expect(flat.Name).toBeUndefined();
  });

  test("links and money read the way people write them", () => {
    expect(listLink("fnd_1")).toBe(
      "https://specstream.ai/workspace/collections/fnd_1",
    );
    expect(dollars(1500)).toBe("$15.00");
  });
});
