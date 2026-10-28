import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation } from "./_generated/server";
import { requireUserId } from "./auth";
import { type SyncedTable, syncedTable } from "./syncTables";

// Values a PowerSync CRUD entry can carry: SQLite has only text, numbers, and NULL.
const sqliteValue = v.union(v.string(), v.number(), v.null());

// Columns owned by the server or PowerSync; never taken from a device.
const reserved = new Set(["id", "uuid", "owner_id", "_id", "_creationTime"]);

type Fields = Record<string, string | number | undefined>;

/**
 * A write's version: its `updated_at`, tie-broken by device id. `updated_at` is a
 * non-negative safe integer (at most 16 digits), so zero-padding to 16 makes plain
 * string comparison order versions.
 */
const versionOf = (updatedAt: number, device: string) =>
  `${updatedAt.toString().padStart(16, "0")}:${device}`;

// NULL clears a field: Convex removes fields patched to `undefined`.
const toFields = (data: Record<string, string | number | null> = {}): Fields =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !reserved.has(key))
      .map(([key, value]) => [key, value ?? undefined]),
  );

const findRow = (ctx: MutationCtx, table: SyncedTable, uuid: string) =>
  ctx.db
    .query(table)
    .withIndex("by_uuid", (q) => q.eq("uuid", uuid))
    .unique();

const findState = (ctx: MutationCtx, table: SyncedTable, uuid: string) =>
  ctx.db
    .query("sync_state")
    .withIndex("by_record", (q) => q.eq("table", table).eq("uuid", uuid))
    .unique();

async function saveState(
  ctx: MutationCtx,
  state: Doc<"sync_state"> | null,
  next: Pick<Doc<"sync_state">, "table" | "uuid" | "owner_id" | "versions" | "deleted_at">,
) {
  if (state) await ctx.db.replace(state._id, next);
  else await ctx.db.insert("sync_state", next);
}

/**
 * Applies one PowerSync upload transaction (a device's queued local writes) atomically.
 * Called only by the client upload connector in `@cal/sync`, with the PowerSync client id
 * as `device`.
 *
 * Conflict rules, which give the same result regardless of upload order or retries:
 * - Per-field last-writer-wins. Each field keeps the version that last set it; a write
 *   only changes fields where its version is newer. An equal version can only come from
 *   the same device in the same millisecond, and PowerSync uploads a device's queue in
 *   order (retrying a transaction before sending the next), so the later write wins.
 *   Replays rewrite identical values, so they are no-ops.
 * - Deletes are final. A tombstone in `sync_state` makes later PUT/PATCH for that uuid
 *   no-ops, including a retried PUT whose first response was lost.
 * - PUT creates the row if it doesn't exist; otherwise it merges like PATCH.
 *   PATCH for a row that doesn't exist (and was never deleted) is dropped.
 * Field types are enforced by the schema on write; a bad op fails the whole transaction.
 */
export const upload = mutation({
  args: {
    device: v.string(),
    ops: v.array(
      v.object({
        op: v.union(v.literal("PUT"), v.literal("PATCH"), v.literal("DELETE")),
        table: syncedTable,
        id: v.string(),
        data: v.optional(v.record(v.string(), sqliteValue)),
      }),
    ),
  },
  handler: async (ctx, { device, ops }) => {
    const ownerId = await requireUserId(ctx);
    const assertOwner = (owner: Id<"users">) => {
      if (owner !== ownerId) throw new ConvexError({ code: "NOT_AUTHORIZED" });
    };

    for (const { op, table, id, data } of ops) {
      const [existing, state] = await Promise.all([
        findRow(ctx, table, id),
        findState(ctx, table, id),
      ]);
      if (existing) assertOwner(existing.owner_id);
      if (state) assertOwner(state.owner_id);
      if (state?.deleted_at !== undefined) continue;

      if (op === "DELETE") {
        if (existing) await ctx.db.delete(existing._id);
        await saveState(ctx, state, {
          table,
          uuid: id,
          owner_id: ownerId,
          versions: {},
          deleted_at: Date.now(),
        });
        continue;
      }

      const fields = toFields(data);
      const updatedAt = fields.updated_at;
      if (typeof updatedAt !== "number" || !Number.isSafeInteger(updatedAt) || updatedAt < 0) {
        throw new ConvexError({
          code: "INVALID",
          message: `${op} ${table}/${id} needs updated_at`,
        });
      }
      const version = versionOf(updatedAt, device);
      const versions = { ...state?.versions };

      if (!existing) {
        if (op === "PATCH") continue;
        // The schema validator checks this row at runtime; TS can't see per-table shapes here.
        await ctx.db.insert(table, { ...fields, uuid: id, owner_id: ownerId } as never);
        for (const key of Object.keys(fields)) versions[key] = version;
      } else {
        const winners = Object.entries(fields).filter(([key]) => (versions[key] ?? "") <= version);
        if (winners.length === 0) continue;
        await ctx.db.patch(existing._id, Object.fromEntries(winners) as never);
        for (const [key] of winners) versions[key] = version;
      }
      await saveState(ctx, state, { table, uuid: id, owner_id: ownerId, versions });
    }
  },
});
