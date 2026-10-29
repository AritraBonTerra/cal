/*
 * End-to-end check against a real Convex deployment: two "devices" (SQLite files) sync
 * through it. Signs up a throwaway user, writes on device A while it's offline, restarts
 * A, and checks B receives it; then concurrent edits and a delete.
 *
 * Usage: bun scripts/live.ts <convex url>   (e.g. https://….convex.cloud)
 */
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api } from "@cal/backend/api";
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { convexRemote, LocalStore, type SqlDatabase, type SqlRow, SyncEngine } from "../src";

const url = process.argv[2];
if (!url) throw new Error("Pass the Convex deployment URL");
const dir = mkdtempSync(join(tmpdir(), "cal-live-"));

function openSqlite(path: string) {
  const db = new Database(path);
  const adapter: SqlDatabase = {
    run: (sql, params = []) => {
      db.query(sql).run(...params);
    },
    all: (sql, params = []) => db.query<SqlRow, SqlRow[keyof SqlRow][]>(sql).all(...params),
    transaction: (fn) => db.transaction(fn)(),
  };
  return { db, adapter };
}

// Signs up a throwaway user through Better Auth's email route, then mints a Convex JWT
// with the session (the apps do the same through Google).
const site = url.replace(".convex.cloud", ".convex.site");
const email = `cal-live-${Date.now()}@example.test`;
const signUp = await fetch(`${site}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "cal://" },
  body: JSON.stringify({ email, password: crypto.randomUUID(), name: "Cal live check" }),
});
const created = (await signUp.json()) as { token?: string };
const sessionToken = signUp.headers.get("set-auth-token") ?? created.token;
if (!signUp.ok || !sessionToken) throw new Error(`Sign-up failed: ${signUp.status}`);
const minted = await fetch(`${site}/api/auth/convex/token`, {
  headers: { authorization: `Bearer ${sessionToken}` },
});
const { token } = (await minted.json()) as { token?: string };
if (!token) throw new Error(`No Convex token: ${minted.status}`);
const me = new ConvexHttpClient(url);
me.setAuth(token);
const { userId } = await me.query(api.users.me, {});
console.log(`signed up ${email}`);

// A device: its own SQLite file, Convex connection and engine; `online` starts syncing.
function device(name: string) {
  const sqlite = openSqlite(join(dir, `${name}.sqlite`));
  const store = new LocalStore(sqlite.adapter);
  const client = new ConvexClient(url ?? "");
  client.setAuth(async () => token ?? null);
  const engine = new SyncEngine(store, convexRemote(client), {
    onError: (error) => console.warn(`[${name}]`, error),
  });
  return {
    store,
    online: () => engine.start(userId),
    idle: () => engine.idle(),
    close: async () => {
      engine.stop();
      await client.close();
      sqlite.db.close();
    },
  };
}

async function until(label: string, check: () => boolean, timeoutMs = 15_000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out: ${label}`);
    await Bun.sleep(100);
  }
  console.log(`PASS ${label}`);
}

let a = device("a");
const uuid = a.store.insert("tasks", { title: "Written offline", position: 0, when: "inbox" });
await a.close();
a = device("a");
await until("offline edit is still queued after a restart", () => a.store.pendingCount() === 1);
a.online();
await a.idle();
await until("uploads once online", () => a.store.pendingCount() === 0);

const b = device("b");
b.online();
await until(
  "other device receives it",
  () => b.store.get("tasks", uuid)?.title === "Written offline",
);

a.store.update("tasks", uuid, { title: "Renamed on A" });
b.store.update("tasks", uuid, { notes: "Notes from B" });
await until("concurrent edits to different fields merge on both devices", () =>
  [a, b].every(
    (each) =>
      each.store.get("tasks", uuid)?.title === "Renamed on A" &&
      each.store.get("tasks", uuid)?.notes === "Notes from B",
  ),
);

b.store.remove("tasks", uuid);
await until("a delete reaches the other device", () => a.store.get("tasks", uuid) === undefined);

await a.close();
await b.close();
console.log("done");
process.exit(0);
