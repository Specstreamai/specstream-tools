/// <reference types="vite/client" />
import { test, vi } from "vitest";
import { convexTest } from "convex-test";
import {
  componentsGeneric,
  defineSchema,
  defineTable,
  type GenericSchema,
  type SchemaDefinition,
} from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import { register } from "../test.js";

export const modules = import.meta.glob("./**/*.*s");

export const appSchema = defineSchema({
  completions: defineTable({
    listId: v.string(),
    status: v.string(),
    rowCount: v.number(),
    context: v.optional(v.any()),
  }),
});

export function initConvexTest<
  Schema extends SchemaDefinition<GenericSchema, boolean>,
>(schema?: Schema) {
  process.env.SPECSTREAM_API_KEY = "ss_test_key";
  const t = convexTest(schema ?? defineSchema({}), modules);
  register(t);
  return t;
}

export const components = componentsGeneric() as unknown as {
  specstream: ComponentApi;
};

type Reply = { status?: number; body: unknown };

/** A stand-in for api.specstream.ai that answers by "METHOD /path". */
export function mockFetch(routes: Record<string, Reply | (() => Reply)>) {
  const calls: Array<{ path: string; method: string; body: any }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string | URL, init?: { method?: string; body?: string }) => {
        const path = new URL(String(url)).pathname;
        const method = init?.method ?? "GET";
        calls.push({
          path,
          method,
          body: init?.body ? JSON.parse(init.body) : undefined,
        });
        const route = routes[`${method} ${path}`];
        const reply =
          typeof route === "function"
            ? route()
            : (route ?? { status: 404, body: {} });
        return new Response(JSON.stringify(reply.body), {
          status: reply.status ?? 200,
        });
      },
    ),
  );
  return calls;
}

test("setup", () => {});
