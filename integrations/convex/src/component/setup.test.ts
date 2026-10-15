/// <reference types="vite/client" />
import { test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema.js";
import { RETRY } from "./api.js";

export const modules = import.meta.glob("./**/*.*s");

export const TEST_API_KEY = "ss_test_key";
export const TEST_WEBHOOK_SECRET = "whsec_test";
export const HASH = "a".repeat(64);

export function initConvexTest() {
  process.env.SPECSTREAM_API_KEY = TEST_API_KEY;
  // Keep retries instant so tests don't wait on backoff.
  RETRY.baseDelayMs = 0;
  RETRY.maxDelayMs = 0;
  return convexTest(schema, modules);
}

export type FetchCall = {
  url: string;
  path: string;
  method: string;
  body: any;
  headers: Record<string, string>;
};

type Reply = {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
};

/**
 * A stand-in for api.specstream.ai. `routes` maps "METHOD /path" (query string
 * ignored) to a reply, or to a function that picks one per call.
 */
export function fakeSpecStream(
  routes: Record<string, Reply | ((call: FetchCall, index: number) => Reply)>,
) {
  const calls: FetchCall[] = [];
  const seen: Record<string, number> = {};
  const fetchMock = vi.fn(
    async (
      url: string | URL,
      init?: {
        method?: string;
        body?: string;
        headers?: Record<string, string>;
      },
    ) => {
      const parsed = new URL(String(url));
      const call: FetchCall = {
        url: String(url),
        path: parsed.pathname,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(init.body) : undefined,
        headers: init?.headers ?? {},
      };
      calls.push(call);
      const key = `${call.method} ${call.path}`;
      const route = routes[key];
      const index = (seen[key] = (seen[key] ?? -1) + 1);
      const reply: Reply = route
        ? typeof route === "function"
          ? route(call, index)
          : route
        : {
            status: 404,
            body: { error: { code: "not_found", message: `no route ${key}` } },
          };
      return new Response(JSON.stringify(reply.body), {
        status: reply.status ?? 200,
        headers: reply.headers,
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const parseReply = (overrides: Record<string, unknown> = {}): Reply => ({
  body: {
    data: {
      status: "runnable",
      ast_hash: HASH,
      canonical_sentence: "Food banks in Texas",
      ast: { limit: { max: 100, inferred: false } },
      ...overrides,
    },
  },
});

export const quoteReply = (overrides: Record<string, unknown> = {}): Reply => ({
  body: {
    data: {
      quote_id: "qte_1",
      quote_hash: HASH,
      currency: "USD",
      maximum_cents: 1500,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      can_authorize: true,
      terms: { unit_cents: 15 },
      ...overrides,
    },
  },
});

export const executionReply = (): Reply => ({
  body: {
    data: {
      reservation_id: "res_1",
      find_id: "fnd_1",
      maximum_cents: 1500,
      state: "reserved",
      replay: false,
    },
  },
});

export const findReply = (status: string, accepted: number): Reply => ({
  body: {
    data: {
      find_id: "fnd_1",
      status,
      requested_count: 100,
      accepted_count: accepted,
    },
  },
});

export function cellOf(label: string, display: string, url?: string) {
  return {
    column_id: label.toLowerCase(),
    label,
    value: display,
    display,
    provenance: url
      ? { source_url: url, observed_at: "2026-10-15T10:00:00Z" }
      : null,
  };
}

export function rowOf(id: string, ordinal: number, name: string, url: string) {
  return {
    entity_id: id,
    ordinal,
    cells: [cellOf("Name", name, url), cellOf("Revenue", "$1.2M", url)],
  };
}

export const rowsReply = (rows: unknown[], status = "completed"): Reply => ({
  body: {
    data: {
      find_id: "fnd_1",
      status,
      accepted_count: rows.length,
      rows,
      next_cursor: null,
    },
  },
});

test("setup", () => {});
