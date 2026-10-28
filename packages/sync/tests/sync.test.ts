import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api } from "@cal/backend/api";
import schema from "@cal/backend/schema";
import { convexTest } from "convex-test";
import {
  LocalStore,
  type PullPage,
  type Remote,
  type SqlDatabase,
  type SqlRow,
  SyncEngine,
} from "../src";

// convex-test normally uses Vite's import.meta.glob; under bun we list modules by hand.
const modules = {
  "../../backend/convex/_generated/api.js": () => import("../../backend/convex/_generated/api.js"),
  "../../backend/convex/_generated/server.js": () =>
    import("../../backend/convex/_generated/server.js"),
  "../../backend/convex/auth.ts": () => import("../../backend/convex/auth"),
  "../../backend/convex/sync.ts": () => import("../../backend/convex/sync"),
};

type Backend = ReturnType<typeof convexTest>;
type Client = ReturnType<Backend["withIdentity"]>;

// A bun:sqlite database behind the store's SqlDatabase interface.
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

/*
 * The server as devices see it. Like ConvexClient, an upload made while offline waits
 * for the connection instead of failing, and every device's pull subscription sees an
 * upload's result before the upload itself resolves.
 */
class Network {
  readonly remotes = new Set<TestRemote>();
  async refresh() {
    for (const remote of this.remotes) await remote.refresh();
  }
}

interface Watcher {
  after: number;
  onPage: (page: PullPage) => void;
  onError: (error: Error) => void;
  last?: string;
}

class TestRemote implements Remote {
  private online = true;
  private holdUploads = false;
  private replyGate: Promise<void> | undefined;
  private openGate: (() => void) | undefined;
  private readonly waiters = new Set<() => void>();
  private readonly watchers = new Set<Watcher>();

  constructor(
    private readonly network: Network,
    private client: Client | Backend,
  ) {
    network.remotes.add(this);
  }

  async upload(device: string, ops: Parameters<Remote["upload"]>[1]) {
    while (!this.online || this.holdUploads) {
      await new Promise<void>((resolve) => this.waiters.add(resolve));
    }
    const records = await this.client.mutation(api.sync.upload, { device, ops });
    await this.network.refresh();
    await this.replyGate;
    return records;
  }

  watch(after: number, onPage: Watcher["onPage"], onError: Watcher["onError"]) {
    const watcher: Watcher = { after, onPage, onError };
    this.watchers.add(watcher);
    void this.refreshOne(watcher);
    return () => {
      this.watchers.delete(watcher);
    };
  }

  async refresh() {
    for (const watcher of [...this.watchers]) await this.refreshOne(watcher);
  }

  // Signs this device's connection in as someone else, like ConvexClient.setAuth.
  useClient(client: Client) {
    this.client = client;
  }

  setOnline(online: boolean) {
    this.online = online;
    if (online) this.release();
  }

  setHoldUploads(hold: boolean) {
    this.holdUploads = hold;
    if (!hold) this.release();
  }

  // While held, uploads commit on the server but their replies wait for `releaseReplies`.
  holdReplies() {
    this.replyGate = new Promise((resolve) => {
      this.openGate = resolve;
    });
  }

  releaseReplies() {
    this.openGate?.();
    this.replyGate = undefined;
  }

  private release() {
    for (const resolve of this.waiters) resolve();
    this.waiters.clear();
    void this.refresh();
  }

  private async refreshOne(watcher: Watcher) {
    if (!this.online) return;
    let page: PullPage;
    try {
      page = await this.client.query(api.sync.pull, { after: watcher.after });
    } catch (error) {
      if (this.watchers.has(watcher)) watcher.onError(error as Error);
      return;
    }
    const key = JSON.stringify(page);
    if (!this.watchers.has(watcher) || key === watcher.last) return;
    watcher.last = key;
    watcher.onPage(page);
  }
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A backend, a shared network, and helpers to make signed-in devices.
async function world() {
  const backend = convexTest(schema, modules);
  const network = new Network();
  const dir = mkdtempSync(join(tmpdir(), "cal-sync-"));
  dirs.push(dir);
  let clockValue = 1_000;
  const clock = { now: () => clockValue, set: (value: number) => (clockValue = value) };

  const signUp = async () => {
    const userId = await backend.run((ctx) => ctx.db.insert("users", {}));
    return { userId, client: backend.withIdentity({ subject: `${userId}|session` }) };
  };

  // A device with its own SQLite file; `restart` reopens it like an app relaunch.
  const device = (name: string, user: { userId: string; client: Client }) => {
    const path = join(dir, `${name}.sqlite`);
    const remote = new TestRemote(network, user.client);
    const boot = () => {
      const sqlite = openSqlite(path);
      const store = new LocalStore(sqlite.adapter, { now: clock.now });
      const engine = new SyncEngine(store, remote, { backoff: () => 0, maxAttempts: 2 });
      return { sqlite, store, engine };
    };
    let current = boot();
    const self = {
      remote,
      get store() {
        return current.store;
      },
      get engine() {
        return current.engine;
      },
      get db() {
        return current.sqlite.adapter;
      },
      start: () => current.engine.start(user.userId),
      restart: () => {
        current.engine.stop();
        current.sqlite.db.close();
        current = boot();
      },
    };
    return self;
  };

  // Lets every device upload and pull until nothing is left in flight.
  const settle = async (...devices: ReturnType<typeof device>[]) => {
    for (let round = 0; round < 3; round++) {
      for (const each of devices) await each.engine.idle();
      await network.refresh();
    }
  };

  return { backend, network, clock, signUp, device, settle };
}

const newTask = (title: string) => ({ title, position: 0, when: "inbox" as const });

describe("sync between devices", () => {
  test("an edit made offline survives a restart and reaches other devices", async () => {
    const { signUp, device, settle } = await world();
    const user = await signUp();
    const mac = device("mac", user);
    const phone = device("phone", user);
    mac.remote.setOnline(false);
    mac.start();
    const uuid = mac.store.insert("tasks", newTask("Written offline"));
    expect(mac.store.pendingCount()).toBe(1);

    mac.restart();
    expect(mac.store.get("tasks", uuid)?.title).toBe("Written offline");
    expect(mac.store.pendingCount()).toBe(1);

    mac.remote.setOnline(true);
    mac.start();
    phone.start();
    await settle(mac, phone);
    expect(mac.store.pendingCount()).toBe(0);
    expect(phone.store.get("tasks", uuid)?.title).toBe("Written offline");
  });

  test("offline edits to different fields on two devices both survive", async () => {
    const { signUp, device, settle } = await world();
    const user = await signUp();
    const mac = device("mac", user);
    const phone = device("phone", user);
    mac.start();
    phone.start();
    const uuid = mac.store.insert("tasks", newTask("Plan"));
    await settle(mac, phone);

    mac.remote.setOnline(false);
    phone.remote.setOnline(false);
    mac.store.update("tasks", uuid, { title: "Plan the week" });
    phone.store.update("tasks", uuid, { notes: "From the phone" });
    mac.remote.setOnline(true);
    phone.remote.setOnline(true);
    await settle(mac, phone);
    for (const each of [mac, phone]) {
      expect(each.store.get("tasks", uuid)).toMatchObject({
        title: "Plan the week",
        notes: "From the phone",
      });
    }
  });

  test("a device whose edit lost shows the winning value", async () => {
    const { signUp, device, settle, clock } = await world();
    const user = await signUp();
    const mac = device("mac", user);
    const phone = device("phone", user);
    mac.start();
    phone.start();
    const uuid = mac.store.insert("tasks", newTask("Plan"));
    await settle(mac, phone);

    mac.remote.setOnline(false);
    clock.set(5_000);
    mac.store.update("tasks", uuid, { title: "Older, from the Mac" });
    clock.set(9_000);
    phone.store.update("tasks", uuid, { title: "Newer, from the phone" });
    await settle(phone);

    mac.remote.setOnline(true);
    await settle(mac, phone);
    expect(mac.store.get("tasks", uuid)?.title).toBe("Newer, from the phone");
    expect(mac.store.pendingCount()).toBe(0);
  });

  test("pulled changes keep this device's unsent edits on top", async () => {
    const { signUp, device, settle } = await world();
    const user = await signUp();
    const mac = device("mac", user);
    const phone = device("phone", user);
    mac.start();
    phone.start();
    const uuid = mac.store.insert("tasks", newTask("Plan"));
    await settle(mac, phone);

    mac.remote.setHoldUploads(true);
    mac.store.update("tasks", uuid, { title: "Unsent, from the Mac" });
    phone.store.update("tasks", uuid, { notes: "From the phone" });
    await settle(phone);
    expect(mac.store.get("tasks", uuid)).toMatchObject({
      title: "Unsent, from the Mac",
      notes: "From the phone",
    });

    mac.remote.setHoldUploads(false);
    await settle(mac, phone);
    expect(phone.store.get("tasks", uuid)?.title).toBe("Unsent, from the Mac");
  });

  test("an upload reply older than a page already applied doesn't roll it back", async () => {
    const { signUp, device, settle } = await world();
    const user = await signUp();
    const mac = device("mac", user);
    const phone = device("phone", user);
    mac.start();
    phone.start();
    const uuid = mac.store.insert("tasks", newTask("Plan"));
    await settle(mac, phone);

    mac.remote.holdReplies();
    mac.store.update("tasks", uuid, { title: "From the Mac" });
    await Bun.sleep(0);
    phone.store.update("tasks", uuid, { notes: "From the phone" });
    await settle(phone);
    mac.remote.releaseReplies();
    await settle(mac, phone);

    expect(mac.store.get("tasks", uuid)).toMatchObject({
      title: "From the Mac",
      notes: "From the phone",
    });
  });

  test("a delete on one device wins over an offline edit on another", async () => {
    const { signUp, device, settle } = await world();
    const user = await signUp();
    const mac = device("mac", user);
    const phone = device("phone", user);
    mac.start();
    phone.start();
    const uuid = mac.store.insert("tasks", newTask("Plan"));
    await settle(mac, phone);

    mac.remote.setOnline(false);
    mac.store.update("tasks", uuid, { title: "Edited offline" });
    phone.store.remove("tasks", uuid);
    await settle(phone);
    mac.remote.setOnline(true);
    await settle(mac, phone);

    expect(mac.store.get("tasks", uuid)).toBeUndefined();
    expect(mac.store.pendingCount()).toBe(0);
  });

  test("a write the server keeps refusing is set aside, and the rest still sync", async () => {
    const { signUp, device, settle } = await world();
    const user = await signUp();
    const mac = device("mac", user);
    const phone = device("phone", user);
    // A task missing required fields, as an older app version might have queued it.
    mac.db.run("INSERT INTO _outbox (op, tbl, uuid, data) VALUES ('PUT', 'tasks', 'bad', ?)", [
      JSON.stringify({ title: "No position", updated_at: 1 }),
    ]);
    const good = mac.store.insert("tasks", newTask("Fine"));
    mac.start();
    phone.start();
    await settle(mac, phone);

    expect(mac.store.pendingCount()).toBe(0);
    expect(mac.db.all("SELECT uuid FROM _rejected")).toEqual([{ uuid: "bad" }]);
    expect(phone.store.get("tasks", good)?.title).toBe("Fine");
    expect(mac.store.get("tasks", "bad")).toBeUndefined();
  });

  test("switching users hides the previous user's records and keeps their unsent edits", async () => {
    const { signUp, device, settle } = await world();
    const first = await signUp();
    const second = await signUp();
    const mac = device("mac", first);
    mac.start();
    const synced = mac.store.insert("tasks", newTask("Synced"));
    await settle(mac);
    mac.remote.setOnline(false);
    const unsent = mac.store.insert("tasks", newTask("Written offline"));

    mac.engine.start(second.userId);
    mac.remote.useClient(second.client);
    expect(mac.store.list("tasks")).toEqual([]);
    expect(mac.store.pendingCount()).toBe(0);

    mac.engine.start(first.userId);
    mac.remote.useClient(first.client);
    expect(mac.store.get("tasks", unsent)?.title).toBe("Written offline");
    mac.remote.setOnline(true);
    await settle(mac);
    expect(mac.store.get("tasks", synced)?.title).toBe("Synced");
    expect(mac.store.pendingCount()).toBe(0);
    const phone = device("phone", first);
    phone.start();
    await settle(phone);
    expect(phone.store.get("tasks", unsent)?.title).toBe("Written offline");
  });

  test("a reply that arrives after switching users doesn't reach the new user's data", async () => {
    const { signUp, device, settle } = await world();
    const first = await signUp();
    const second = await signUp();
    const mac = device("mac", first);
    mac.start();
    mac.remote.holdReplies();
    const uuid = mac.store.insert("tasks", newTask("First user's"));
    await Bun.sleep(0);

    mac.remote.useClient(second.client);
    mac.engine.start(second.userId);
    mac.remote.releaseReplies();
    await settle(mac);
    expect(mac.store.get("tasks", uuid)).toBeUndefined();
    expect(mac.store.list("tasks")).toEqual([]);
  });

  test("editing a field just pulled beats the server, even with an older edit pending", async () => {
    const { signUp, device, settle, clock } = await world();
    const user = await signUp();
    const mac = device("mac", user);
    const phone = device("phone", user);
    mac.start();
    phone.start();
    const uuid = mac.store.insert("tasks", newTask("Plan"));
    await settle(mac, phone);

    mac.remote.setHoldUploads(true);
    mac.store.update("tasks", uuid, { notes: "Pending on the Mac" });
    clock.set(9_000);
    phone.store.update("tasks", uuid, { title: "From the phone" });
    await settle(phone);
    expect(mac.store.get("tasks", uuid)?.title).toBe("From the phone");

    clock.set(1_500);
    mac.store.update("tasks", uuid, { title: "Edited after seeing it" });
    mac.remote.setHoldUploads(false);
    await settle(mac, phone);
    for (const each of [mac, phone]) {
      expect(each.store.get("tasks", uuid)).toMatchObject({
        title: "Edited after seeing it",
        notes: "Pending on the Mac",
      });
    }
  });

  test("records made before the first sign-in upload to that user", async () => {
    const { signUp, device, settle } = await world();
    const user = await signUp();
    const mac = device("mac", user);
    const uuid = mac.store.insert("tasks", newTask("Before sign-in"));
    const phone = device("phone", user);
    mac.start();
    phone.start();
    await settle(mac, phone);
    expect(phone.store.get("tasks", uuid)?.title).toBe("Before sign-in");
  });

  test("uploads pause without a session and keep the outbox", async () => {
    const { backend, network } = await world();
    const remote = new TestRemote(network, backend);
    const store = new LocalStore(openSqlite(":memory:").adapter);
    const engine = new SyncEngine(store, remote, { backoff: () => 0 });
    engine.start("user");
    store.insert("tasks", newTask("Waiting"));
    await engine.idle();
    expect(store.pendingCount()).toBe(1);
  });
});

describe("LocalStore", () => {
  test("a later local edit wins even if the clock went backwards", () => {
    let now = 10_000;
    const store = new LocalStore(openSqlite(":memory:").adapter, { now: () => now });
    const uuid = store.insert("tasks", newTask("Plan"));
    now = 5_000;
    store.update("tasks", uuid, { title: "Later edit" });
    const [put, patch] = store.pending(10);
    expect(Number(patch?.data?.updated_at)).toBeGreaterThan(Number(put?.data?.updated_at));
  });

  test("null clears an optional field", () => {
    const store = new LocalStore(openSqlite(":memory:").adapter);
    const uuid = store.insert("tasks", { ...newTask("Plan"), notes: "draft" });
    store.update("tasks", uuid, { notes: null });
    expect(store.get("tasks", uuid)).not.toHaveProperty("notes");
  });

  test("editing or removing a missing record changes nothing", () => {
    const store = new LocalStore(openSqlite(":memory:").adapter);
    expect(store.update("tasks", "missing", { title: "x" })).toBe(false);
    expect(store.remove("tasks", "missing")).toBe(false);
    expect(store.pendingCount()).toBe(0);
  });
});
