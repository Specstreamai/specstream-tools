import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * The app owns the list → user mapping. The component deliberately doesn't
   * know about users (it can't see `ctx.auth`), so ownership lives here and is
   * checked on every list-scoped operation.
   */
  listOwners: defineTable({
    listId: v.string(),
    userId: v.string(),
    label: v.optional(v.string()),
  })
    .index("listId", ["listId"])
    .index("userId", ["userId"]),

  /**
   * Written by the `onComplete` callback when a list finishes, to show how an
   * app reacts to a list reaching a final state.
   */
  listReports: defineTable({
    listId: v.string(),
    userId: v.string(),
    label: v.optional(v.string()),
    status: v.string(),
    rowCount: v.number(),
    requestedCount: v.number(),
    error: v.optional(v.string()),
  })
    .index("listId", ["listId"])
    .index("userId", ["userId"]),
});
