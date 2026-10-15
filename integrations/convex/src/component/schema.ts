import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Where a list stands. `running` covers everything before SpecStream is done;
 * the rest are final. `partial` means SpecStream finished with the rows it
 * found, fewer than you asked for.
 */
export const listStatus = v.union(
  v.literal("running"),
  v.literal("completed"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("canceled"),
  v.literal("expired"),
);

/** How progress reaches the component. Webhook mode polls slowly as a safety net. */
export const trackMode = v.union(v.literal("webhook"), v.literal("poll"));

/** One cell of a row: what SpecStream found, and the page it read it on. */
export const cell = v.object({
  columnId: v.string(),
  label: v.string(),
  value: v.optional(v.any()),
  /** The value as a person would read it. Prefer this for display. */
  display: v.optional(v.string()),
  /** Why the cell is empty, when SpecStream could not fill it ("Not published", "Couldn't check"). */
  absence: v.optional(v.string()),
  /** The page the value came from. */
  sourceUrl: v.optional(v.string()),
  /** When SpecStream read that page. */
  observedAt: v.optional(v.string()),
});

export default defineSchema({
  quotes: defineTable({
    request: v.string(),
    canonicalSentence: v.optional(v.string()),
    astHash: v.string(),
    /** How many rows the price covers. */
    rows: v.number(),
    /** SpecStream's own quote id and signature, sent back when the quote is approved. */
    quoteId: v.string(),
    quoteHash: v.string(),
    currency: v.string(),
    /** The most the list can cost, in cents. Nothing is charged for rows that are not delivered. */
    maximumCents: v.number(),
    unitCents: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    canAuthorize: v.boolean(),
    /** Set once the quote is approved, so approving twice starts one list. */
    listId: v.optional(v.id("lists")),
    createdAt: v.number(),
  }).index("quoteId", ["quoteId"]),

  lists: defineTable({
    /** SpecStream's id for the list (`fnd_...`). */
    specstreamListId: v.string(),
    request: v.string(),
    canonicalSentence: v.optional(v.string()),
    quoteId: v.optional(v.id("quotes")),
    status: listStatus,
    mode: trackMode,
    /** Rows you asked for. */
    requestedCount: v.number(),
    /** Rows SpecStream has accepted so far, as last reported. */
    acceptedCount: v.number(),
    /** Rows stored in Convex. */
    rowCount: v.number(),
    /** The accepted count at the last time rows were read, so rows are read again only when it moves. */
    syncedAcceptedCount: v.number(),
    maximumCents: v.optional(v.number()),
    currency: v.optional(v.string()),
    /** Where to open the list in SpecStream. */
    link: v.string(),
    error: v.optional(v.string()),
    /** App mutation to call once the list reaches a final state. */
    onComplete: v.optional(v.string()),
    /** Opaque app data handed back to `onComplete`. */
    context: v.optional(v.any()),
    /** Set once the final transition is handled, so it happens exactly once. */
    finalized: v.boolean(),
    pollAttempt: v.number(),
    startedAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("specstreamListId", ["specstreamListId"])
    .index("status", ["status"]),

  rows: defineTable({
    listId: v.id("lists"),
    /** SpecStream's stable id for the thing the row describes. */
    entityId: v.string(),
    ordinal: v.number(),
    cells: v.array(cell),
    /** The full set of cells, when SpecStream returns more than the table view shows. */
    details: v.optional(v.array(cell)),
    /** The page behind the row: the first page any cell was read on. */
    sourceUrl: v.optional(v.string()),
    observedAt: v.optional(v.string()),
    /** True when the row is held back until the list's access is settled. */
    locked: v.optional(v.boolean()),
  })
    .index("listId_ordinal", ["listId", "ordinal"])
    .index("listId_entityId", ["listId", "entityId"]),
});
