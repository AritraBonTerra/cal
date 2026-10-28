import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server";
import { requireUserId } from "./auth";
import { type SyncedTable, syncedTable } from "./syncTables";

// Values a queued device write can carry: SQLite has only text, numbers, and NULL.
const sqliteValue = v.union(v.string(), v.number(), v.null());

// Columns owned by the server or the device's SQLite; never taken from a device.
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

const findRow = (ctx: QueryCtx, table: SyncedTable, uuid: string) =>
  ctx.db
    .query(table)
    .withIndex("by_uuid", (q) => q.eq("uuid", uuid))
    .unique();

// A record as devices store it: no Convex bookkeeping, and no owner (it's always the caller).
const clientRow = ({ _id, _creationTime, owner_id, ...row }: Doc<SyncedTable>) => row;

/*
 * The server's current value of a record for a device: its row (null once deleted, or
 * if it never existed) and `seq`, the change number of its latest write (0 if none).
 * Devices keep the record with the highest `seq`, whichever way it arrived.
 */
async function currentRecord(ctx: QueryCtx, table: SyncedTable, uuid: string, seq: number) {
  const doc = await findRow(ctx, table, uuid);
  return { table, uuid, seq, row: doc && clientRow(doc) };
}

const findState = (ctx: QueryCtx, table: SyncedTable, uuid: string) =>
  ctx.db
    .query("sync_state")
    .withIndex("by_table_and_uuid", (q) => q.eq("table", table).eq("uuid", uuid))
    .unique();

async function saveState(
  ctx: MutationCtx,
  state: Doc<"sync_state"> | null,
  next: Pick<Doc<"sync_state">, "table" | "uuid" | "owner_id" | "seq" | "versions" | "deleted_at">,
) {
  if (state) await ctx.db.replace(state._id, next);
  else await ctx.db.insert("sync_state", next);
}

/**
 * Applies one upload batch (a device's queued local writes) atomically. Called only by
 * the `@cal/sync` client engine, with its persisted device id as `device`.
 *
 * Conflict rules, which give the same result regardless of upload order or retries:
 * - Per-field last-writer-wins. Each field keeps the version that last set it; a write
 *   only changes fields where its version is newer. An equal version can only come from
 *   the same device in the same millisecond, and `@cal/sync` uploads a device's queue in
 *   order (retrying a batch before sending the next), so the later write wins.
 *   Replays change no values, so they are no-ops.
 * - Deletes are final. A tombstone in `sync_state` makes later PUT/PATCH for that uuid
 *   no-ops, including a retried PUT whose first response was lost.
 * - PUT creates the row if it doesn't exist; otherwise it merges like PATCH.
 *   PATCH for a row that doesn't exist (and was never deleted) is dropped.
 * Field types are enforced by the schema on write; a bad op fails the whole transaction.
 * Every record whose values this changes gets the user's next change number, which
 * `pull` pages by.
 *
 * Returns the current server value of every record in the batch, so the device can
 * replace its optimistic copy even when its write lost and nothing changed here.
 * A device may receive pull pages newer than this reply first; `seq` orders them.
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
    // Every upload reads and writes this one document, so a user's uploads commit one
    // at a time and change numbers increase in commit order.
    const cursor = await ctx.db
      .query("sync_cursors")
      .withIndex("by_owner_id", (q) => q.eq("owner_id", ownerId))
      .unique();
    let seq = cursor?.seq ?? 0;
    const touched = new Map<string, { table: SyncedTable; uuid: string }>();

    for (const { op, table, id, data } of ops) {
      touched.set(`${table}/${id}`, { table, uuid: id });
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
          seq: ++seq,
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
      let changed = true;

      if (!existing) {
        if (op === "PATCH") continue;
        // The schema validator checks this row at runtime; TS can't see per-table shapes here.
        await ctx.db.insert(table, { ...fields, uuid: id, owner_id: ownerId } as never);
        for (const key of Object.keys(fields)) versions[key] = version;
      } else {
        const winners = Object.entries(fields).filter(([key]) => (versions[key] ?? "") <= version);
        if (winners.length === 0) continue;
        const current: Fields = existing;
        const edits = winners.filter(([key, value]) => current[key] !== value);
        changed = edits.length > 0;
        if (changed) await ctx.db.patch(existing._id, Object.fromEntries(edits) as never);
        for (const [key] of winners) versions[key] = version;
      }
      await saveState(ctx, state, {
        table,
        uuid: id,
        owner_id: ownerId,
        seq: changed ? ++seq : (state?.seq ?? ++seq),
        versions,
      });
    }

    if (cursor) await ctx.db.patch(cursor._id, { seq });
    else if (seq > 0) await ctx.db.insert("sync_cursors", { owner_id: ownerId, seq });

    return Promise.all(
      [...touched.values()].map(async ({ table, uuid }) => {
        const state = await findState(ctx, table, uuid);
        return currentRecord(ctx, table, uuid, state?.seq ?? 0);
      }),
    );
  },
});

// Records per `pull` page: up to two reads each, far below Convex's per-query limits.
const PULL_PAGE = 200;

/**
 * Returns the caller's records changed after change number `after`, oldest first, as
 * their current values (or `row: null` once deleted). `seq` is the change number to pass
 * next; `more` means another page is waiting. Devices subscribe to this reactively, so
 * a new page arrives as soon as any of the user's devices uploads.
 */
export const pull = query({
  args: { after: v.number() },
  handler: async (ctx, { after }) => {
    const ownerId = await requireUserId(ctx);
    const states = await ctx.db
      .query("sync_state")
      .withIndex("by_owner_id_and_seq", (q) => q.eq("owner_id", ownerId).gt("seq", after))
      .take(PULL_PAGE);
    const changes = await Promise.all(
      states.map(({ table, uuid, seq }) => currentRecord(ctx, table, uuid, seq)),
    );
    return {
      changes,
      seq: states.at(-1)?.seq ?? after,
      more: states.length === PULL_PAGE,
    };
  },
});
