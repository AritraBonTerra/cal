import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { syncedTable, syncedTables } from "./syncTables";

// Replicated tables on the server: the device fields plus the owning user.
const owner_id = v.id("users");

export default defineSchema({
  // Convex Auth's tables from before Google sign-in, kept so this deploy drops no data;
  // they can go once exported. Better Auth keeps its own tables in its component.
  ...authTables,

  // Cal's users. `authId` is the Better Auth user id (the JWT subject); the other fields
  // are Convex Auth's, so rows from before still validate.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    authId: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("authId", ["authId"]),

  // Each user's change counter. Every write to a user's records takes the next number,
  // so devices can pull "everything after N" (see sync.ts).
  sync_cursors: defineTable({
    owner_id: v.id("users"),
    seq: v.number(),
  }).index("by_owner_id", ["owner_id"]),

  // Server-only sync bookkeeping per replicated record: the version that last set each
  // field, the change number of its latest write, and a tombstone once it is deleted.
  sync_state: defineTable({
    table: syncedTable,
    uuid: v.string(),
    owner_id: v.id("users"),
    seq: v.number(),
    versions: v.record(v.string(), v.string()),
    deleted_at: v.optional(v.number()),
  })
    .index("by_table_and_uuid", ["table", "uuid"])
    .index("by_owner_id_and_seq", ["owner_id", "seq"]),

  areas: defineTable({ ...syncedTables.areas, owner_id }).index("by_uuid", ["uuid"]),
  projects: defineTable({ ...syncedTables.projects, owner_id }).index("by_uuid", ["uuid"]),
  tasks: defineTable({ ...syncedTables.tasks, owner_id }).index("by_uuid", ["uuid"]),
  time_blocks: defineTable({ ...syncedTables.time_blocks, owner_id }).index("by_uuid", ["uuid"]),
  habits: defineTable({ ...syncedTables.habits, owner_id }).index("by_uuid", ["uuid"]),
  habit_entries: defineTable({ ...syncedTables.habit_entries, owner_id }).index("by_uuid", [
    "uuid",
  ]),
  settings: defineTable({ ...syncedTables.settings, owner_id }).index("by_uuid", ["uuid"]),
});
