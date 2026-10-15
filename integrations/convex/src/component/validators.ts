import { v } from "convex/values";
import { cell, listStatus, trackMode } from "./schema.js";

/** A list as the app sees it. The component's private bookkeeping stays out. */
export const listView = v.object({
  _id: v.id("lists"),
  _creationTime: v.number(),
  /** SpecStream's own id for the list (`fnd_...`). */
  specstreamListId: v.string(),
  request: v.string(),
  canonicalSentence: v.optional(v.string()),
  quoteId: v.optional(v.id("quotes")),
  status: listStatus,
  mode: trackMode,
  requestedCount: v.number(),
  acceptedCount: v.number(),
  rowCount: v.number(),
  maximumCents: v.optional(v.number()),
  currency: v.optional(v.string()),
  link: v.string(),
  error: v.optional(v.string()),
  context: v.optional(v.any()),
  finalized: v.boolean(),
  startedAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),
});

export const rowView = v.object({
  _id: v.id("rows"),
  _creationTime: v.number(),
  listId: v.id("lists"),
  entityId: v.string(),
  ordinal: v.number(),
  cells: v.array(cell),
  details: v.optional(v.array(cell)),
  sourceUrl: v.optional(v.string()),
  observedAt: v.optional(v.string()),
  locked: v.optional(v.boolean()),
});

export const quoteView = v.object({
  _id: v.id("quotes"),
  _creationTime: v.number(),
  request: v.string(),
  canonicalSentence: v.optional(v.string()),
  rows: v.number(),
  currency: v.string(),
  maximumCents: v.number(),
  unitCents: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  canAuthorize: v.boolean(),
  listId: v.optional(v.id("lists")),
  createdAt: v.number(),
});

/** What SpecStream made of a request, before anything is priced. */
export const readingResult = v.object({
  /** `runnable` when the request can be priced. Anything else needs a clearer request. */
  status: v.string(),
  astHash: v.optional(v.string()),
  /** The request as SpecStream read it, in plain words. */
  canonicalSentence: v.optional(v.string()),
  notice: v.optional(v.string()),
  /** The row count named in the request itself, if it names one. */
  statedRows: v.optional(v.number()),
  /** True when SpecStream filled in a default count because the request names none. */
  rowsInferred: v.boolean(),
});

export const needsEdit = v.object({
  status: v.literal("needs_edit"),
  request: v.string(),
  /** The request as SpecStream read it, so you can show what was missing. */
  readAs: v.string(),
  notice: v.optional(v.string()),
  message: v.string(),
});

export const quoted = v.object({
  status: v.literal("quoted"),
  quoteId: v.string(),
  request: v.string(),
  readAs: v.optional(v.string()),
  rows: v.number(),
  currency: v.string(),
  maximumCents: v.number(),
  unitCents: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  canAuthorize: v.boolean(),
});

export const started = v.object({
  status: v.literal("started"),
  listId: v.string(),
  specstreamListId: v.string(),
  link: v.string(),
  maximumCents: v.number(),
});

export const overMaximum = v.object({
  status: v.literal("over_maximum"),
  request: v.string(),
  maximumCents: v.number(),
  message: v.string(),
});

export const quoteResult = v.union(quoted, needsEdit);
export const findListResult = v.union(started, needsEdit, overMaximum);
