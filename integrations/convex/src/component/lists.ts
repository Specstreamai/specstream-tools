import { paginationOptsValidator, type FunctionHandle } from "convex/server";
import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { ActionCtx } from "./_generated/server.js";
import { asCount, listLink, specstreamRequest } from "./api.js";
import {
  DEFAULT_LOCALE,
  MAX_ROWS,
  executionKey,
  fail,
  isFinal,
  mapStatus,
  messageOf,
  priceReading,
  readAllRows,
  readRequest,
  statusOf,
  type ListStatus,
  type RowInput,
} from "./helpers.js";
import { cell, listStatus, trackMode } from "./schema.js";
import {
  findListResult,
  listView,
  quoteResult,
  quoteView,
  rowView,
} from "./validators.js";

/** Status checks before the component stops watching a list. `resume` starts it again. */
export const MAX_POLL_ATTEMPTS = 400;
export const STOPPED_TRACKING = "Stopped tracking this list";
const STORE_BATCH = 40;

const now = () => Date.now();

/** Seconds between status checks. Webhook mode checks slowly, as a safety net. */
function nextDelayMs(mode: "webhook" | "poll", attempt: number): number {
  if (mode === "webhook") return Math.min(30_000 * 1.25 ** attempt, 120_000);
  return Math.min(3_000 * 1.25 ** attempt, 15_000);
}

/** Argument shape of the mutation you pass as `onComplete`. */
export type ListCompletePayload = {
  listId: string;
  specstreamListId: string;
  status: Exclude<ListStatus, "running">;
  rowCount: number;
  requestedCount: number;
  error?: string;
  context?: any;
};

function publicList(doc: Doc<"lists">) {
  // `onComplete` is a function handle and `syncedAcceptedCount`, `pollAttempt` are bookkeeping.
  const {
    onComplete: _onComplete,
    syncedAcceptedCount: _synced,
    pollAttempt: _attempt,
    ...rest
  } = doc;
  return rest;
}

function publicQuote(doc: Doc<"quotes">) {
  const {
    astHash: _ast,
    quoteId: _quoteId,
    quoteHash: _quoteHash,
    ...rest
  } = doc;
  return rest;
}

// ---------------------------------------------------------------------------
// Quote and approve
// ---------------------------------------------------------------------------

type QuoteOutcome =
  | {
      status: "needs_edit";
      request: string;
      readAs: string;
      notice?: string;
      message: string;
    }
  | {
      status: "quoted";
      quoteId: string;
      request: string;
      readAs?: string;
      rows: number;
      currency: string;
      maximumCents: number;
      unitCents?: number;
      expiresAt?: number;
      canAuthorize: boolean;
    };

function checkRows(rows: number): void {
  if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS) {
    fail(
      "specstream_bad_rows",
      `rows must be a whole number from 1 to ${MAX_ROWS}.`,
    );
  }
}

async function quoteRequest(
  ctx: ActionCtx,
  args: { request: string; rows: number; locale?: string },
): Promise<QuoteOutcome> {
  checkRows(args.rows);
  const request = args.request.trim();
  const reading = await readRequest(request, args.locale ?? DEFAULT_LOCALE);
  if (reading.status !== "runnable" || !reading.astHash) {
    const readAs = reading.canonicalSentence ?? request;
    return {
      status: "needs_edit",
      request,
      readAs,
      notice: reading.notice,
      message: `SpecStream needs a clearer request before it can price it. It read: "${readAs}". Add the place or what every row must meet.`,
    };
  }
  const priced = await priceReading(reading.astHash, args.rows);
  const quoteId: Id<"quotes"> = await ctx.runMutation(
    internal.lists.createQuote,
    {
      request,
      canonicalSentence: reading.canonicalSentence,
      astHash: reading.astHash,
      rows: args.rows,
      quoteId: priced.quoteId,
      quoteHash: priced.quoteHash,
      currency: priced.currency,
      maximumCents: priced.maximumCents,
      unitCents: priced.unitCents,
      expiresAt: priced.expiresAt,
      canAuthorize: priced.canAuthorize,
    },
  );
  return {
    status: "quoted",
    quoteId,
    request,
    readAs: reading.canonicalSentence,
    rows: args.rows,
    currency: priced.currency,
    maximumCents: priced.maximumCents,
    unitCents: priced.unitCents,
    expiresAt: priced.expiresAt,
    canAuthorize: priced.canAuthorize,
  };
}

type StartedList = {
  status: "started";
  listId: string;
  specstreamListId: string;
  link: string;
  maximumCents: number;
};

async function approveQuote(
  ctx: ActionCtx,
  args: {
    quoteId: string;
    confirmMaxCents: number;
    idempotencyKey?: string;
    mode?: "webhook" | "poll";
    onComplete?: string;
    context?: unknown;
  },
): Promise<StartedList> {
  const quote: Doc<"quotes"> | null = await ctx.runQuery(
    internal.lists.getQuoteInternal,
    { quoteId: args.quoteId },
  );
  if (!quote)
    fail("specstream_unknown_quote", "No such quote. Ask for a new one.");

  if (quote.listId) {
    const existing: Doc<"lists"> | null = await ctx.runQuery(
      internal.lists.getInternal,
      { listId: quote.listId },
    );
    if (existing) {
      return {
        status: "started",
        listId: existing._id,
        specstreamListId: existing.specstreamListId,
        link: existing.link,
        maximumCents: quote.maximumCents,
      };
    }
  }
  if (quote.expiresAt !== undefined && now() > quote.expiresAt) {
    fail(
      "specstream_quote_expired",
      "This price has expired. Ask for a new quote.",
    );
  }
  if (!quote.canAuthorize) {
    fail(
      "specstream_quote_not_approvable",
      "SpecStream can't start this list with the current account. Open your workspace to see why.",
    );
  }
  if (args.confirmMaxCents !== quote.maximumCents) {
    fail(
      "specstream_approval_mismatch",
      `The approved maximum must equal the quoted maximum of ${quote.maximumCents} cents. Nothing ran.`,
    );
  }

  const run = await specstreamRequest("/v1/capacity/executions", {
    method: "POST",
    body: {
      quote_id: quote.quoteId,
      quote_hash: quote.quoteHash,
      confirm_max_cents: quote.maximumCents,
      idempotency_key: executionKey(quote.quoteId, args.idempotencyKey),
    },
  });
  const specstreamListId = typeof run.find_id === "string" ? run.find_id : "";
  if (!specstreamListId) {
    fail(
      "specstream_unreadable",
      "SpecStream returned a response this component could not read.",
    );
  }
  const created: { listId: Id<"lists"> } = await ctx.runMutation(
    internal.lists.createList,
    {
      quoteId: quote._id,
      specstreamListId,
      request: quote.request,
      canonicalSentence: quote.canonicalSentence,
      requestedCount: quote.rows,
      maximumCents: quote.maximumCents,
      currency: quote.currency,
      mode: args.mode,
      onComplete: args.onComplete,
      context: args.context,
    },
  );
  return {
    status: "started",
    listId: created.listId,
    specstreamListId,
    link: listLink(specstreamListId),
    maximumCents: quote.maximumCents,
  };
}

/**
 * Read a request, price it for a number of rows and keep the price. Nothing
 * runs and nothing is charged until `approve`.
 */
export const quote = action({
  args: {
    request: v.string(),
    rows: v.number(),
    locale: v.optional(v.string()),
  },
  returns: quoteResult,
  handler: async (ctx, args): Promise<QuoteOutcome> =>
    await quoteRequest(ctx, args),
});

/**
 * Start the list a quote prices. `confirmMaxCents` must equal the quote's
 * maximum: the component never decides how much to spend on its own. Approving
 * the same quote twice starts one list.
 */
export const approve = action({
  args: {
    quoteId: v.string(),
    confirmMaxCents: v.number(),
    /** Makes a retried approval start one list, even across new quotes. */
    idempotencyKey: v.optional(v.string()),
    mode: v.optional(trackMode),
    onComplete: v.optional(v.string()),
    context: v.optional(v.any()),
  },
  returns: v.object({
    status: v.literal("started"),
    listId: v.string(),
    specstreamListId: v.string(),
    link: v.string(),
    maximumCents: v.number(),
  }),
  handler: async (ctx, args): Promise<StartedList> =>
    await approveQuote(ctx, args),
});

/**
 * Quote and start in one call, but only when the most the list can cost is
 * within `maxCents`. Above it, nothing runs.
 */
export const findList = action({
  args: {
    request: v.string(),
    rows: v.number(),
    maxCents: v.number(),
    locale: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    mode: v.optional(trackMode),
    onComplete: v.optional(v.string()),
    context: v.optional(v.any()),
  },
  returns: findListResult,
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.maxCents) || args.maxCents <= 0) {
      fail(
        "specstream_bad_maximum",
        "maxCents must be a whole number above 0.",
      );
    }
    const quoted = await quoteRequest(ctx, args);
    if (quoted.status === "needs_edit") return quoted;
    if (quoted.maximumCents > args.maxCents) {
      return {
        status: "over_maximum" as const,
        request: quoted.request,
        maximumCents: quoted.maximumCents,
        message: `Nothing ran: this list can cost up to ${quoted.maximumCents} cents, above your maximum of ${args.maxCents}. Ask for fewer rows or raise the maximum.`,
      };
    }
    return await approveQuote(ctx, {
      quoteId: quoted.quoteId,
      confirmMaxCents: quoted.maximumCents,
      idempotencyKey: args.idempotencyKey,
      mode: args.mode,
      onComplete: args.onComplete,
      context: args.context,
    });
  },
});

export const createQuote = internalMutation({
  args: {
    request: v.string(),
    canonicalSentence: v.optional(v.string()),
    astHash: v.string(),
    rows: v.number(),
    quoteId: v.string(),
    quoteHash: v.string(),
    currency: v.string(),
    maximumCents: v.number(),
    unitCents: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    canAuthorize: v.boolean(),
  },
  returns: v.id("quotes"),
  handler: async (ctx, args) =>
    await ctx.db.insert("quotes", { ...args, createdAt: now() }),
});

export const getQuoteInternal = internalQuery({
  args: { quoteId: v.string() },
  handler: async (ctx, args): Promise<Doc<"quotes"> | null> => {
    const id = ctx.db.normalizeId("quotes", args.quoteId);
    return id ? await ctx.db.get("quotes", id) : null;
  },
});

/** A saved quote, without SpecStream's signature. */
export const getQuote = query({
  args: { quoteId: v.string() },
  returns: v.union(v.null(), quoteView),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("quotes", args.quoteId);
    const doc = id ? await ctx.db.get("quotes", id) : null;
    return doc ? publicQuote(doc) : null;
  },
});

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

/** Start tracking a list SpecStream has begun. Safe to call twice for the same list. */
export const createList = internalMutation({
  args: {
    quoteId: v.id("quotes"),
    specstreamListId: v.string(),
    request: v.string(),
    canonicalSentence: v.optional(v.string()),
    requestedCount: v.number(),
    maximumCents: v.number(),
    currency: v.string(),
    mode: v.optional(trackMode),
    onComplete: v.optional(v.string()),
    context: v.optional(v.any()),
  },
  returns: v.object({ listId: v.id("lists") }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lists")
      .withIndex("specstreamListId", (q) =>
        q.eq("specstreamListId", args.specstreamListId),
      )
      .first();
    if (existing) {
      await ctx.db.patch("quotes", args.quoteId, { listId: existing._id });
      return { listId: existing._id };
    }
    const mode = args.mode ?? "poll";
    const startedAt = now();
    const listId = await ctx.db.insert("lists", {
      specstreamListId: args.specstreamListId,
      request: args.request,
      canonicalSentence: args.canonicalSentence,
      quoteId: args.quoteId,
      status: "running",
      mode,
      requestedCount: args.requestedCount,
      acceptedCount: 0,
      rowCount: 0,
      syncedAcceptedCount: -1,
      maximumCents: args.maximumCents,
      currency: args.currency,
      link: listLink(args.specstreamListId),
      onComplete: args.onComplete,
      context: args.context,
      finalized: false,
      pollAttempt: 0,
      startedAt,
      updatedAt: startedAt,
    });
    await ctx.db.patch("quotes", args.quoteId, { listId });
    await ctx.scheduler.runAfter(0, internal.lists.poll, {
      listId,
      chain: true,
    });
    return { listId };
  },
});

export const getInternal = internalQuery({
  args: { listId: v.id("lists") },
  handler: async (ctx, args): Promise<Doc<"lists"> | null> =>
    await ctx.db.get("lists", args.listId),
});

/** Status and progress of a list. Reactive: subscribe to it from a query. */
export const get = query({
  args: { listId: v.string() },
  returns: v.union(v.null(), listView),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("lists", args.listId);
    const doc = id ? await ctx.db.get("lists", id) : null;
    return doc ? publicList(doc) : null;
  },
});

/** Look up a list by SpecStream's own id (`fnd_...`). */
export const getBySpecstreamListId = query({
  args: { specstreamListId: v.string() },
  returns: v.union(v.null(), listView),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("lists")
      .withIndex("specstreamListId", (q) =>
        q.eq("specstreamListId", args.specstreamListId),
      )
      .first();
    return doc ? publicList(doc) : null;
  },
});

/** Recent lists, newest first. */
export const list = query({
  args: { status: v.optional(listStatus), limit: v.optional(v.number()) },
  returns: v.array(listView),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const { status } = args;
    const docs = status
      ? await ctx.db
          .query("lists")
          .withIndex("status", (q) => q.eq("status", status))
          .order("desc")
          .take(limit)
      : await ctx.db.query("lists").order("desc").take(limit);
    return docs.map(publicList);
  },
});

/** Rows of a list in SpecStream's order, a page at a time. Works with React's `usePaginatedQuery`. */
export const listRows = query({
  args: { listId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("lists", args.listId);
    if (!id) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    return await ctx.db
      .query("rows")
      .withIndex("listId_ordinal", (q) => q.eq("listId", id))
      .paginate(args.paginationOpts);
  },
});

/** One row by SpecStream's id for the thing it describes. */
export const getRow = query({
  args: { listId: v.string(), entityId: v.string() },
  returns: v.union(v.null(), rowView),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("lists", args.listId);
    if (!id) return null;
    return await ctx.db
      .query("rows")
      .withIndex("listId_entityId", (q) =>
        q.eq("listId", id).eq("entityId", args.entityId),
      )
      .first();
  },
});

/** Stop a running list. The rows found so far are kept. */
export const cancel = action({
  args: { listId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const list = await loadList(ctx, args.listId);
    if (!list || list.finalized) return null;
    await specstreamRequest(
      `/v1/finds/${encodeURIComponent(list.specstreamListId)}/cancel`,
      { method: "POST" },
    );
    await syncList(ctx, list._id, false);
    return null;
  },
});

/** Read the latest status and rows from SpecStream now, instead of waiting for the next check. */
export const refresh = action({
  args: { listId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const list = await loadList(ctx, args.listId);
    if (!list || list.finalized) return null;
    await syncList(ctx, list._id, false);
    return null;
  },
});

/**
 * Pick tracking back up for a list the component stopped watching (it stops
 * after a run of failed status checks, or a long wait). Returns false when
 * there is nothing to resume.
 */
export const resume = mutation({
  args: { listId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const id = ctx.db.normalizeId("lists", args.listId);
    const list = id ? await ctx.db.get("lists", id) : null;
    if (!list || !list.finalized || !list.error?.startsWith(STOPPED_TRACKING)) {
      return false;
    }
    await ctx.db.patch("lists", list._id, {
      status: "running",
      finalized: false,
      pollAttempt: 0,
      error: undefined,
      completedAt: undefined,
      updatedAt: now(),
    });
    await ctx.scheduler.runAfter(0, internal.lists.poll, {
      listId: list._id,
      chain: true,
    });
    return true;
  },
});

/** Delete a list and its stored rows. SpecStream keeps the list in your workspace. */
export const deleteList = mutation({
  args: { listId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const id = ctx.db.normalizeId("lists", args.listId);
    const list = id ? await ctx.db.get("lists", id) : null;
    if (!id || !list) return null;
    await ctx.db.delete("lists", id);
    await ctx.scheduler.runAfter(0, internal.lists.continueDelete, {
      listId: id,
    });
    return null;
  },
});

export const continueDelete = internalMutation({
  args: { listId: v.id("lists") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const rows = await ctx.db
      .query("rows")
      .withIndex("listId_ordinal", (q) => q.eq("listId", args.listId))
      .take(200);
    for (const row of rows) await ctx.db.delete("rows", row._id);
    if (rows.length === 200) {
      await ctx.scheduler.runAfter(0, internal.lists.continueDelete, {
        listId: args.listId,
      });
    }
    return null;
  },
});

// ---------------------------------------------------------------------------
// Following a list to the end
// ---------------------------------------------------------------------------

async function loadList(
  ctx: ActionCtx,
  listId: string,
): Promise<Doc<"lists"> | null> {
  return await ctx.runQuery(internal.lists.getByIdString, { listId });
}

export const getByIdString = internalQuery({
  args: { listId: v.string() },
  handler: async (ctx, args): Promise<Doc<"lists"> | null> => {
    const id = ctx.db.normalizeId("lists", args.listId);
    return id ? await ctx.db.get("lists", id) : null;
  },
});

const rowInput = v.object({
  entityId: v.string(),
  ordinal: v.number(),
  cells: v.array(cell),
  details: v.optional(v.array(cell)),
  sourceUrl: v.optional(v.string()),
  observedAt: v.optional(v.string()),
  locked: v.optional(v.boolean()),
});

/** Insert rows, or update the ones already stored, so reading a list twice never duplicates. */
export const storeRows = internalMutation({
  args: { listId: v.id("lists"), rows: v.array(rowInput) },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const list = await ctx.db.get("lists", args.listId);
    if (!list) return 0;
    let inserted = 0;
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("rows")
        .withIndex("listId_entityId", (q) =>
          q.eq("listId", args.listId).eq("entityId", row.entityId),
        )
        .first();
      if (existing) {
        await ctx.db.replace("rows", existing._id, {
          listId: args.listId,
          ...row,
        });
      } else {
        await ctx.db.insert("rows", { listId: args.listId, ...row });
        inserted += 1;
      }
    }
    if (inserted > 0) {
      await ctx.db.patch("lists", args.listId, {
        rowCount: list.rowCount + inserted,
      });
    }
    return inserted;
  },
});

async function finalizeList(
  ctx: {
    db: any;
    scheduler: { runAfter: any };
  },
  listId: Id<"lists">,
  status: Exclude<ListStatus, "running">,
  error?: string,
): Promise<void> {
  const list: Doc<"lists"> | null = await ctx.db.get("lists", listId);
  if (!list || list.finalized) return;
  await ctx.db.patch("lists", listId, {
    status,
    finalized: true,
    completedAt: now(),
    updatedAt: now(),
    ...(error ? { error } : {}),
  });
  if (!list.onComplete) return;
  const handle = list.onComplete as FunctionHandle<
    "mutation",
    ListCompletePayload
  >;
  await ctx.scheduler.runAfter(0, handle, {
    listId: listId as string,
    specstreamListId: list.specstreamListId,
    status,
    rowCount: list.rowCount,
    requestedCount: list.requestedCount,
    error: error ?? list.error,
    context: list.context,
  });
}

/**
 * Record progress from a status check and decide what happens next: finish, or
 * (when this call owns the check chain) schedule the next check.
 */
export const advance = internalMutation({
  args: {
    listId: v.id("lists"),
    status: listStatus,
    requestedCount: v.number(),
    acceptedCount: v.number(),
    syncedAcceptedCount: v.number(),
    chain: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const list = await ctx.db.get("lists", args.listId);
    if (!list || list.finalized) return null;

    const pollAttempt = args.chain ? list.pollAttempt + 1 : list.pollAttempt;
    await ctx.db.patch("lists", args.listId, {
      status: args.status,
      requestedCount: args.requestedCount,
      acceptedCount: args.acceptedCount,
      syncedAcceptedCount: args.syncedAcceptedCount,
      pollAttempt,
      error: undefined,
      updatedAt: now(),
    });

    if (isFinal(args.status)) {
      await finalizeList(
        ctx,
        args.listId,
        args.status as Exclude<ListStatus, "running">,
      );
      return null;
    }
    if (!args.chain) return null;

    if (pollAttempt >= MAX_POLL_ATTEMPTS) {
      await finalizeList(
        ctx,
        args.listId,
        "failed",
        `${STOPPED_TRACKING} after ${MAX_POLL_ATTEMPTS} status checks. The list may still be running at SpecStream: call resume to pick tracking back up.`,
      );
      return null;
    }
    await ctx.scheduler.runAfter(
      nextDelayMs(list.mode, pollAttempt),
      internal.lists.poll,
      { listId: args.listId, chain: true },
    );
    return null;
  },
});

/** A status check failed. Back off and try again, or give up on a key that no longer works. */
export const retryLater = internalMutation({
  args: {
    listId: v.id("lists"),
    error: v.string(),
    chain: v.boolean(),
    /** True when retrying cannot help, such as a revoked key. */
    permanent: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const list = await ctx.db.get("lists", args.listId);
    if (!list || list.finalized) return null;
    if (args.permanent) {
      await finalizeList(
        ctx,
        args.listId,
        "failed",
        `${STOPPED_TRACKING}: ${args.error} Fix it, then call resume.`,
      );
      return null;
    }
    const pollAttempt = args.chain ? list.pollAttempt + 1 : list.pollAttempt;
    await ctx.db.patch("lists", args.listId, {
      pollAttempt,
      error: args.error,
      updatedAt: now(),
    });
    if (!args.chain) return null;
    if (pollAttempt >= MAX_POLL_ATTEMPTS) {
      await finalizeList(
        ctx,
        args.listId,
        "failed",
        `${STOPPED_TRACKING} after ${MAX_POLL_ATTEMPTS} status checks: ${args.error} Call resume to pick tracking back up.`,
      );
      return null;
    }
    await ctx.scheduler.runAfter(
      nextDelayMs(list.mode, pollAttempt),
      internal.lists.poll,
      { listId: args.listId, chain: true },
    );
    return null;
  },
});

/**
 * One status check: ask SpecStream where the list stands, read its rows when
 * the count moved or it finished, and record both. Throws when SpecStream
 * can't be read.
 */
async function syncList(
  ctx: ActionCtx,
  listId: Id<"lists">,
  chain: boolean,
): Promise<void> {
  const list: Doc<"lists"> | null = await ctx.runQuery(
    internal.lists.getInternal,
    { listId },
  );
  if (!list || list.finalized) return;

  const data = await specstreamRequest(
    `/v1/finds/${encodeURIComponent(list.specstreamListId)}`,
  );
  const status = mapStatus(data.status);
  const requestedCount = asCount(data.requested_count) || list.requestedCount;
  const acceptedCount = asCount(data.accepted_count);

  let syncedAcceptedCount = list.syncedAcceptedCount;
  if (isFinal(status) || acceptedCount !== list.syncedAcceptedCount) {
    const rows: RowInput[] = await readAllRows(list.specstreamListId);
    for (let i = 0; i < rows.length; i += STORE_BATCH) {
      await ctx.runMutation(internal.lists.storeRows, {
        listId,
        rows: rows.slice(i, i + STORE_BATCH),
      });
    }
    syncedAcceptedCount = acceptedCount;
  }

  await ctx.runMutation(internal.lists.advance, {
    listId,
    status,
    requestedCount,
    acceptedCount,
    syncedAcceptedCount,
    chain,
  });
}

/**
 * Runs the check chain for a list, and once on demand when a webhook arrives
 * (`chain: false`, so the chain already in flight is not doubled).
 */
export const poll = internalAction({
  args: { listId: v.id("lists"), chain: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      await syncList(ctx, args.listId, args.chain);
    } catch (error) {
      // This runs from the scheduler: an uncaught throw would leave the list
      // stuck in `running` with nothing left to wake it.
      const status = statusOf(error);
      await ctx.runMutation(internal.lists.retryLater, {
        listId: args.listId,
        error: messageOf(error),
        chain: args.chain,
        permanent: status === 401 || status === 403 || status === 404,
      });
    }
    return null;
  },
});

/** One SpecStream delivery. Anything but a finished list we know about is accepted and ignored. */
export const handleWebhook = internalMutation({
  args: {
    event: v.optional(v.string()),
    specstreamListId: v.optional(v.string()),
  },
  returns: v.object({ accepted: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    if (args.event !== "find.completed" || !args.specstreamListId) {
      return { accepted: true, reason: "not a finished list" };
    }
    const specstreamListId = args.specstreamListId;
    // Webhooks belong to the account, so deliveries for lists started elsewhere arrive too.
    const list = await ctx.db
      .query("lists")
      .withIndex("specstreamListId", (q) =>
        q.eq("specstreamListId", specstreamListId),
      )
      .first();
    if (!list) return { accepted: true, reason: "unknown list" };
    if (list.finalized) return { accepted: true, reason: "already finalized" };
    await ctx.scheduler.runAfter(0, internal.lists.poll, {
      listId: list._id,
      chain: false,
    });
    return { accepted: true };
  },
});

export const _test = { nextDelayMs, publicList };
