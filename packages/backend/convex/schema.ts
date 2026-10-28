import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { syncedTable } from "./syncTables";

/*
 * Every app table is replicated to device SQLite by PowerSync, so fields stick to
 * types SQLite round-trips cleanly: strings, numbers, and optional (NULL) values.
 * No booleans or arrays — use timestamps/enums and join tables instead.
 *
 * Dates without a time ("When", deadlines, habit days) are floating `YYYY-MM-DD`
 * strings. Instants are ISO 8601 strings with an offset. `created_at`/`updated_at`
 * are epoch milliseconds; a write's `updated_at` (plus device id) is its version for
 * per-field last-writer-wins on upload (see sync.ts).
 *
 * References between app records use the device-generated `uuid`, never Convex
 * `_id`, so devices can link records before they reach the server.
 *
 * Every replicated table spreads `syncFields` and has `by_uuid` and `by_owner` indexes.
 */
const syncFields = {
  uuid: v.string(),
  owner_id: v.id("users"),
  created_at: v.number(),
  updated_at: v.number(),
};

export default defineSchema({
  ...authTables,

  // Required by PowerSync's Convex connector for write checkpoints.
  powersync_checkpoints: defineTable({ last_updated: v.float64() }),

  // Server-only sync bookkeeping per replicated record (never synced to devices):
  // the version that last set each field, and a tombstone once the record is deleted.
  sync_state: defineTable({
    table: syncedTable,
    uuid: v.string(),
    owner_id: v.id("users"),
    versions: v.record(v.string(), v.string()),
    deleted_at: v.optional(v.number()),
  }).index("by_record", ["table", "uuid"]),

  areas: defineTable({
    ...syncFields,
    title: v.string(),
    position: v.number(),
    archived_at: v.optional(v.number()),
  })
    .index("by_uuid", ["uuid"])
    .index("by_owner", ["owner_id"]),

  projects: defineTable({
    ...syncFields,
    title: v.string(),
    notes: v.optional(v.string()),
    area_uuid: v.optional(v.string()),
    position: v.number(),
    deadline: v.optional(v.string()),
    completed_at: v.optional(v.number()),
    canceled_at: v.optional(v.number()),
  })
    .index("by_uuid", ["uuid"])
    .index("by_owner", ["owner_id"]),

  tasks: defineTable({
    ...syncFields,
    title: v.string(),
    notes: v.optional(v.string()),
    area_uuid: v.optional(v.string()),
    project_uuid: v.optional(v.string()),
    position: v.number(),
    // Things-style "When": inbox/anytime/someday, or a day (optionally this evening).
    when: v.union(
      v.literal("inbox"),
      v.literal("anytime"),
      v.literal("someday"),
      v.literal("date"),
      v.literal("evening"),
    ),
    when_date: v.optional(v.string()),
    deadline: v.optional(v.string()),
    estimate_min: v.optional(v.number()),
    priority: v.optional(v.number()),
    recurrence_rule: v.optional(v.string()),
    recurrence_mode: v.optional(v.union(v.literal("fixed"), v.literal("after_completion"))),
    completed_at: v.optional(v.number()),
    canceled_at: v.optional(v.number()),
  })
    .index("by_uuid", ["uuid"])
    .index("by_owner", ["owner_id"]),

  // A planned chunk of time on the calendar for a task or habit. A task can have many.
  time_blocks: defineTable({
    ...syncFields,
    task_uuid: v.optional(v.string()),
    habit_uuid: v.optional(v.string()),
    start_at: v.string(),
    end_at: v.string(),
    time_zone: v.string(),
    source: v.union(v.literal("manual"), v.literal("scheduler")),
    done_at: v.optional(v.number()),
    pinned_at: v.optional(v.number()),
  })
    .index("by_uuid", ["uuid"])
    .index("by_owner", ["owner_id"]),

  habits: defineTable({
    ...syncFields,
    title: v.string(),
    kind: v.union(v.literal("check"), v.literal("measure")),
    target: v.optional(v.number()),
    unit: v.optional(v.string()),
    schedule: v.union(v.literal("fixed"), v.literal("quota"), v.literal("interval")),
    rrule: v.optional(v.string()),
    quota_count: v.optional(v.number()),
    quota_period: v.optional(v.union(v.literal("week"), v.literal("month"))),
    interval_days: v.optional(v.number()),
    display: v.union(
      v.literal("list"),
      v.literal("strip"),
      v.literal("fixed_block"),
      v.literal("flexible_block"),
    ),
    position: v.number(),
    archived_at: v.optional(v.number()),
  })
    .index("by_uuid", ["uuid"])
    .index("by_owner", ["owner_id"]),

  // Completion log; score and streaks are derived from it. Unchecking deletes the entry.
  habit_entries: defineTable({
    ...syncFields,
    habit_uuid: v.string(),
    date: v.string(),
    value: v.number(),
    source: v.union(
      v.literal("manual"),
      v.literal("calendar"),
      v.literal("task"),
      v.literal("timer"),
      v.literal("menu_bar"),
    ),
  })
    .index("by_uuid", ["uuid"])
    .index("by_owner", ["owner_id"]),
});
