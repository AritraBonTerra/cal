import { type ObjectType, type Validator, v } from "convex/values";

/*
 * The app tables replicated to devices, as devices store them. `schema.ts` adds the
 * server-only `owner_id`; `@cal/sync` builds each device's SQLite tables from these
 * fields. Written through `sync:upload`, read through `sync:pull`.
 *
 * Fields stick to types SQLite round-trips cleanly: strings, numbers, and optional
 * (NULL) values. No booleans or arrays: use timestamps/enums and join tables instead.
 *
 * Dates without a time ("When", deadlines, habit days) are floating `YYYY-MM-DD`
 * strings. Instants are ISO 8601 strings with an offset. `created_at`/`updated_at`
 * are epoch milliseconds; a write's `updated_at` (plus device id) is its version for
 * per-field last-writer-wins on upload (see sync.ts).
 *
 * References between app records use the device-generated `uuid`, never Convex
 * `_id`, so devices can link records before they reach the server.
 */
const syncFields = {
  uuid: v.string(),
  created_at: v.number(),
  updated_at: v.number(),
};

export const syncedTables = {
  areas: {
    ...syncFields,
    title: v.string(),
    position: v.number(),
    archived_at: v.optional(v.number()),
  },

  projects: {
    ...syncFields,
    title: v.string(),
    notes: v.optional(v.string()),
    area_uuid: v.optional(v.string()),
    position: v.number(),
    deadline: v.optional(v.string()),
    completed_at: v.optional(v.number()),
    canceled_at: v.optional(v.number()),
  },

  tasks: {
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
  },

  // A planned chunk of time on the calendar for a task or habit. A task can have many.
  time_blocks: {
    ...syncFields,
    task_uuid: v.optional(v.string()),
    habit_uuid: v.optional(v.string()),
    start_at: v.string(),
    end_at: v.string(),
    time_zone: v.string(),
    source: v.union(v.literal("manual"), v.literal("scheduler")),
    done_at: v.optional(v.number()),
    pinned_at: v.optional(v.number()),
  },

  habits: {
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
  },

  // Completion log; score and streaks are derived from it. Unchecking deletes the entry.
  habit_entries: {
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
  },
};

export type SyncedTable = keyof typeof syncedTables;

export const syncedTable: Validator<SyncedTable> = v.union(
  v.literal("areas"),
  v.literal("projects"),
  v.literal("tasks"),
  v.literal("time_blocks"),
  v.literal("habits"),
  v.literal("habit_entries"),
);

// A record as a device stores it, e.g. `SyncedRow<"tasks">`.
export type SyncedRow<T extends SyncedTable> = ObjectType<(typeof syncedTables)[T]>;
