import { type Infer, v } from "convex/values";

// App tables replicated by PowerSync and writable through `sync:upload`.
export const syncedTable = v.union(
  v.literal("areas"),
  v.literal("projects"),
  v.literal("tasks"),
  v.literal("time_blocks"),
  v.literal("habits"),
  v.literal("habit_entries"),
);

export type SyncedTable = Infer<typeof syncedTable>;
