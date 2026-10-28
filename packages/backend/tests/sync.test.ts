import { describe, expect, test } from "bun:test";
import type { FunctionArgs } from "convex/server";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// convex-test normally uses Vite's import.meta.glob; under bun we list modules by hand.
const modules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/_generated/server.js": () => import("../convex/_generated/server.js"),
  "../convex/auth.ts": () => import("../convex/auth"),
  "../convex/sync.ts": () => import("../convex/sync"),
};

type Op = FunctionArgs<typeof api.sync.upload>["ops"][number];
type Batch = [device: string, ops: Op[]];

const task = (overrides: Record<string, string | number | null> = {}) => ({
  title: "Write plan",
  position: 0,
  when: "inbox",
  created_at: 1,
  updated_at: 1,
  ...overrides,
});

const put = (id: string, data: Op["data"] = task()): Op => ({
  op: "PUT",
  table: "tasks",
  id,
  data,
});
const patch = (id: string, data: Op["data"]): Op => ({ op: "PATCH", table: "tasks", id, data });
const del = (id: string): Op => ({ op: "DELETE", table: "tasks", id });

// A fresh backend with one signed-in user. Convex Auth subjects are `userId|sessionId`.
async function setup() {
  const t = convexTest(schema, modules);
  const signIn = async () => {
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const client = t.withIdentity({ subject: `${userId}|session` });
    // Uploads one batch as `device`, one of this user's devices.
    const upload = (device: string, ...ops: Op[]) =>
      client.mutation(api.sync.upload, { device, ops });
    return { userId, upload };
  };
  // Task rows without Convex bookkeeping, for comparing outcomes across runs.
  const tasks = () =>
    t.run(async (ctx) =>
      (await ctx.db.query("tasks").collect()).map(
        ({ _id, _creationTime, owner_id, ...row }) => row,
      ),
    );
  return { t, signIn, tasks, ...(await signIn()) };
}

// Runs the batches in order and in reverse, returning both final task tables.
async function bothOrders(seed: Op[], batches: Batch[]) {
  const run = async (ordered: Batch[]) => {
    const { upload, tasks } = await setup();
    await upload("seed", ...seed);
    for (const [device, ops] of ordered) await upload(device, ...ops);
    return tasks();
  };
  return [await run(batches), await run([...batches].reverse())];
}

describe("sync:upload", () => {
  test("PUT inserts a row owned by the caller and ignores reserved columns", async () => {
    const { t, upload, userId } = await setup();
    await upload("a", put("t1", { ...task(), owner_id: "spoofed", id: "x" }));
    const rows = await t.run((ctx) => ctx.db.query("tasks").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ uuid: "t1", owner_id: userId, title: "Write plan" });
  });

  test("replaying the same PUT is a no-op", async () => {
    const { upload, tasks } = await setup();
    await upload("a", put("t1"));
    const before = await tasks();
    await upload("a", put("t1"));
    expect(await tasks()).toEqual(before);
  });

  test("a newer NULL clears an optional field", async () => {
    const { upload, tasks } = await setup();
    await upload("a", put("t1", task({ notes: "draft" })));
    await upload("a", patch("t1", { notes: null, updated_at: 2 }));
    const [row] = await tasks();
    expect(row?.notes).toBeUndefined();
  });

  test("edits to different fields from two devices both survive, in either order", async () => {
    const results = await bothOrders(
      [put("t1")],
      [
        ["a", [patch("t1", { title: "From A", updated_at: 20 })]],
        ["b", [patch("t1", { notes: "From B", updated_at: 30 })]],
      ],
    );
    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.[0]).toMatchObject({ title: "From A", notes: "From B", updated_at: 30 });
  });

  test("the newer edit to the same field wins, in either order", async () => {
    const results = await bothOrders(
      [put("t1")],
      [
        ["a", [patch("t1", { title: "Older", updated_at: 20 })]],
        ["b", [patch("t1", { title: "Newer", updated_at: 30 })]],
      ],
    );
    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.[0]?.title).toBe("Newer");
  });

  test("equal timestamps are tie-broken by device, in either order", async () => {
    const results = await bothOrders(
      [put("t1")],
      [
        ["a", [patch("t1", { title: "From A", updated_at: 20 })]],
        ["b", [patch("t1", { title: "From B", updated_at: 20 })]],
      ],
    );
    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.[0]?.title).toBe("From B");
  });

  test("successive edits from one device in the same millisecond keep the last", async () => {
    const { upload, tasks } = await setup();
    await upload("a", put("t1"));
    await upload("a", patch("t1", { title: "First", updated_at: 20 }));
    await upload("a", patch("t1", { title: "Second", updated_at: 20 }));
    expect((await tasks())[0]?.title).toBe("Second");
  });

  test("a retry after another device's edit does not overwrite it", async () => {
    const { upload, tasks } = await setup();
    await upload("seed", put("t1"));
    const fromA = patch("t1", { title: "From A", updated_at: 20 });
    await upload("a", fromA);
    await upload("b", patch("t1", { title: "From B", updated_at: 20 }));
    await upload("a", fromA);
    expect((await tasks())[0]?.title).toBe("From B");
  });

  test("a PUT retried after another device deleted the row stays deleted", async () => {
    const { upload, tasks } = await setup();
    await upload("a", put("t1")); // A's response is lost, so A will retry.
    await upload("b", del("t1"));
    await upload("a", put("t1"));
    await upload("a", patch("t1", { title: "Edited offline", updated_at: 99 }));
    expect(await tasks()).toHaveLength(0);
  });

  test("rejects writes without a valid updated_at", async () => {
    const { upload } = await setup();
    const { updated_at, ...noTimestamp } = task();
    await expect(upload("a", put("t1", noTimestamp))).rejects.toThrow("INVALID");
    await upload("a", put("t2"));
    await expect(upload("a", patch("t2", { title: "x" }))).rejects.toThrow("INVALID");
    await expect(upload("a", patch("t2", { title: "x", updated_at: -1 }))).rejects.toThrow(
      "INVALID",
    );
    for (const updated_at of [1.5, Number.MAX_SAFE_INTEGER + 2]) {
      await expect(upload("a", patch("t2", { title: "x", updated_at }))).rejects.toThrow("INVALID");
    }
  });

  test("rejects writes to another user's rows, live or deleted, and rolls back the batch", async () => {
    const { upload, signIn, tasks } = await setup();
    await upload("a", put("t1"), put("t2"), del("t2"));
    const other = await signIn();
    await expect(
      other.upload("x", put("t3"), patch("t1", { title: "Hijacked", updated_at: 99 })),
    ).rejects.toThrow("NOT_AUTHORIZED");
    await expect(other.upload("x", put("t2"))).rejects.toThrow("NOT_AUTHORIZED");
    expect((await tasks()).map((row) => [row.uuid, row.title])).toEqual([["t1", "Write plan"]]);
  });

  test("rejects unauthenticated uploads", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.sync.upload, { device: "a", ops: [put("t1")] })).rejects.toThrow(
      "NOT_AUTHENTICATED",
    );
  });

  test("schema validation rejects rows with missing required fields", async () => {
    const { upload } = await setup();
    await expect(upload("a", put("t1", { title: "No position", updated_at: 1 }))).rejects.toThrow();
  });
});
