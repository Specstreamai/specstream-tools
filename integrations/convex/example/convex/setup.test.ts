/// <reference types="vite/client" />
import { test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import specstream from "@specstream/convex/test";

const modules = import.meta.glob("./**/*.*s");

/**
 * Apps that install the component register it in their tests with the helper
 * exported from `@specstream/convex/test`.
 */
export function initConvexTest() {
  process.env.SPECSTREAM_API_KEY = "ss_test_key";
  process.env.DEMO_ALLOW_ANONYMOUS = "";
  const t = convexTest(schema, modules);
  specstream.register(t);
  return t;
}

/** A stand-in for api.specstream.ai that answers by "METHOD /path". */
export function mockFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: { method?: string }) => {
      const key = `${init?.method ?? "GET"} ${new URL(String(url)).pathname}`;
      calls.push(key);
      return new Response(JSON.stringify(routes[key] ?? {}), {
        status: routes[key] ? 200 : 404,
      });
    }),
  );
  return calls;
}

test("setup", () => {});
