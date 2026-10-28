import { type SyncedRow, type SyncedTable, syncedTables } from "@cal/backend/sync";
import type { SqlDatabase, SqlRow, SqlValue } from "./db";

export type Row<T extends SyncedTable> = SyncedRow<T>;
type Editable<T extends SyncedTable> = Omit<Row<T>, "uuid" | "created_at" | "updated_at">;
// A new record; `uuid` is generated unless given (e.g. to link records before inserting).
export type NewRow<T extends SyncedTable> = Editable<T> & { uuid?: string };
// Fields to change on a record; `null` clears an optional field.
export type RowPatch<T extends SyncedTable> = { [K in keyof Editable<T>]?: Editable<T>[K] | null };

export type OpKind = "PUT" | "PATCH" | "DELETE";

// A local write waiting in the outbox for upload, oldest first by `id`.
export interface PendingOp {
  id: number;
  op: OpKind;
  table: SyncedTable;
  uuid: string;
  data: SqlRow | null;
}

// The server's current value of a record (`row: null` once deleted) and the change
// number of its latest write (`seq`), which orders values of the same record.
export interface ServerRecord {
  table: SyncedTable;
  uuid: string;
  seq: number;
  row: Record<string, string | number | undefined> | null;
}

export interface StoreChange {
  tables: ReadonlySet<SyncedTable>;
  // True for writes made on this device, which add to the outbox.
  local: boolean;
}

export const tableNames = Object.keys(syncedTables) as SyncedTable[];
const columnsOf = (table: SyncedTable) => Object.keys(syncedTables[table]);
const quote = (name: string) => `"${name}"`;

/**
 * The device's copy of the user's records in SQLite, plus an outbox of local writes
 * waiting to upload. The UI reads and writes only here, so it never waits on the network.
 *
 * Every local write updates the record and appends to the outbox in one transaction, so
 * an edit made offline survives a restart. The last server value of each record is kept
 * in `_server`; whenever it changes or a write is confirmed, the record is rebuilt as
 * that value plus the still-pending local writes, so the device shows "server state plus
 * my unsent edits" until the server confirms them.
 */
export class LocalStore {
  readonly device: string;
  private clock: number;
  private readonly listeners = new Set<(change: StoreChange) => void>();
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(
    private readonly db: SqlDatabase,
    options: { now?: () => number; newId?: () => string } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.newId = options.newId ?? (() => crypto.randomUUID());
    migrate(db);
    // A different set of columns means records may be missing fields: pull everything again.
    const schema = JSON.stringify(tableNames.map((table) => [table, columnsOf(table)]));
    db.transaction(() => {
      if (this.meta("schema") !== schema) {
        this.setMeta("schema", schema);
        this.db.run("DELETE FROM _server");
        this.setMeta("seq", "0");
      }
      if (!this.meta("device")) this.setMeta("device", this.newId());
    });
    this.device = this.meta("device") ?? "";
    this.clock = Number(this.meta("clock") ?? 0);
  }

  // The change number of the last server page applied; see `sync:pull`.
  get seq() {
    return Number(this.meta("seq") ?? 0);
  }

  // The signed-in user whose records this holds, if any has signed in.
  get user() {
    return this.meta("user");
  }

  subscribe(listener: (change: StoreChange) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Runs a read-only query against the local tables, e.g. for a view.
  query(sql: string, params: readonly SqlValue[] = []) {
    return this.db.all(sql, params);
  }

  get<T extends SyncedTable>(table: T, uuid: string): Row<T> | undefined {
    return this.list(table, "uuid = ?", [uuid])[0];
  }

  // Rows of `table` matching an optional SQL `where` clause.
  list<T extends SyncedTable>(table: T, where = "1", params: readonly SqlValue[] = []): Row<T>[] {
    return this.db
      .all(`SELECT * FROM ${quote(table)} WHERE ${where}`, params)
      .map((row) => fromSql(row) as Row<T>);
  }

  insert<T extends SyncedTable>(table: T, row: NewRow<T>) {
    const uuid = row.uuid ?? this.newId();
    this.write(table, () => {
      const time = this.tick(0);
      const data = { ...toData(row), uuid, created_at: time, updated_at: time };
      this.apply("PUT", table, uuid, data);
      this.enqueue("PUT", table, uuid, data);
    });
    return uuid;
  }

  // Changes fields of a record. Returns false if the record doesn't exist here.
  update<T extends SyncedTable>(table: T, uuid: string, patch: RowPatch<T>) {
    return this.write(table, () => {
      const current = this.rawRow(table, uuid);
      if (!current) return false;
      const data = { ...toData(patch), updated_at: this.tick(Number(current.updated_at)) };
      this.apply("PATCH", table, uuid, data);
      this.enqueue("PATCH", table, uuid, data);
      return true;
    });
  }

  // Deletes a record. Returns false if the record doesn't exist here.
  remove(table: SyncedTable, uuid: string) {
    return this.write(table, () => {
      if (!this.rawRow(table, uuid)) return false;
      this.apply("DELETE", table, uuid, null);
      this.enqueue("DELETE", table, uuid, null);
      return true;
    });
  }

  pending(limit: number): PendingOp[] {
    return this.db
      .all("SELECT id, op, tbl, uuid, data FROM _outbox ORDER BY id LIMIT ?", [limit])
      .map((entry) => ({
        id: Number(entry.id),
        op: parseOp(entry.op),
        table: parseTable(entry.tbl),
        uuid: String(entry.uuid),
        data: typeof entry.data === "string" ? parseData(entry.data) : null,
      }));
  }

  pendingCount() {
    return Number(this.db.all("SELECT count(*) AS n FROM _outbox")[0]?.n ?? 0);
  }

  /**
   * Applies records from the server (a pull page, or an upload's reply) and removes the
   * outbox entries in `confirm`. A record replaces the stored server copy unless that copy
   * is newer (higher `seq`), since replies and pages can arrive in either order. Each
   * affected record is then rebuilt from its server copy plus pending writes. A deleted
   * record drops its pending writes too, since deletes are final.
   */
  applyServer(
    records: readonly ServerRecord[],
    { seq, confirm = [] }: { seq?: number; confirm?: readonly number[] } = {},
  ) {
    const tables = new Set<SyncedTable>();
    this.db.transaction(() => {
      for (const id of confirm) this.db.run("DELETE FROM _outbox WHERE id = ?", [id]);
      for (const record of records) {
        tables.add(record.table);
        const stored = this.db.all("SELECT seq FROM _server WHERE tbl = ? AND uuid = ?", [
          record.table,
          record.uuid,
        ])[0];
        if (!stored || record.seq >= Number(stored.seq)) {
          this.db.run(
            "INSERT INTO _server (tbl, uuid, seq, row) VALUES (?, ?, ?, ?) ON CONFLICT (tbl, uuid) DO UPDATE SET seq = excluded.seq, row = excluded.row",
            [record.table, record.uuid, record.seq, record.row && JSON.stringify(record.row)],
          );
          if (!record.row && record.seq > 0) {
            this.db.run("DELETE FROM _outbox WHERE tbl = ? AND uuid = ?", [
              record.table,
              record.uuid,
            ]);
          }
        }
        this.rebuild(record.table, record.uuid);
        // Later local edits must beat what the server has, even when pending writes
        // replayed on top show an older `updated_at`.
        this.clock = Math.max(this.clock, Number(record.row?.updated_at ?? 0));
      }
      this.setMeta("clock", String(this.clock));
      if (seq !== undefined) this.setMeta("seq", String(seq));
    });
    this.emit({ tables, local: false });
  }

  /**
   * Gives up on an outbox entry the server keeps refusing: keeps it in `_rejected` so
   * nothing is lost, and rebuilds its record without it so the device matches the server.
   */
  reject(op: PendingOp, error: string) {
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO _rejected (op, tbl, uuid, data, error, at) VALUES (?, ?, ?, ?, ?, ?)",
        [op.op, op.table, op.uuid, op.data && JSON.stringify(op.data), error, this.now()],
      );
      this.db.run("DELETE FROM _outbox WHERE id = ?", [op.id]);
      this.rebuild(op.table, op.uuid);
    });
    this.emit({ tables: new Set([op.table]), local: false });
  }

  /**
   * Binds the store to a signed-in user. The first sign-in keeps records made while
   * signed out, which then upload to that user. Switching to a different user clears
   * the local copy (the server still has it) and parks the previous user's unsent
   * writes, which come back when that user signs in here again.
   */
  setUser(userId: string) {
    const previous = this.user;
    if (previous === userId) return;
    this.db.transaction(() => {
      if (previous) {
        this.db.run(
          "INSERT INTO _parked (user, op, tbl, uuid, data) SELECT ?, op, tbl, uuid, data FROM _outbox ORDER BY id",
          [previous],
        );
        this.db.run("DELETE FROM _outbox");
        for (const table of tableNames) this.db.run(`DELETE FROM ${quote(table)}`);
        this.db.run("DELETE FROM _server");
        this.setMeta("seq", "0");
      }
      const parked = this.db.all(
        "SELECT op, tbl, uuid, data FROM _parked WHERE user = ? ORDER BY id",
        [userId],
      );
      for (const entry of parked) {
        this.db.run("INSERT INTO _outbox (op, tbl, uuid, data) VALUES (?, ?, ?, ?)", [
          parseOp(entry.op),
          parseTable(entry.tbl),
          String(entry.uuid),
          typeof entry.data === "string" ? entry.data : null,
        ]);
      }
      this.db.run("DELETE FROM _parked WHERE user = ?", [userId]);
      for (const entry of parked) this.rebuild(parseTable(entry.tbl), String(entry.uuid));
      this.setMeta("user", userId);
    });
    if (previous) this.emit({ tables: new Set(tableNames), local: false });
  }

  // Runs a local write in a transaction and notifies listeners if it changed anything.
  private write<R>(table: SyncedTable, fn: () => R) {
    let result: R | undefined;
    this.db.transaction(() => {
      result = fn();
    });
    if (result !== false) this.emit({ tables: new Set([table]), local: true });
    return result as R;
  }

  /*
   * The next `updated_at` for a local write: wall-clock time, but always later than any
   * earlier write from this device and than the record's current `updated_at`, so a
   * later edit here wins even if the clock moved backwards or another device's runs ahead.
   */
  private tick(recordUpdatedAt: number) {
    this.clock = Math.max(this.now(), this.clock + 1, recordUpdatedAt + 1);
    this.setMeta("clock", String(this.clock));
    return this.clock;
  }

  // Recomputes a record as its server copy (if any) with pending writes applied in order.
  private rebuild(table: SyncedTable, uuid: string) {
    const server = this.db.all("SELECT row FROM _server WHERE tbl = ? AND uuid = ?", [
      table,
      uuid,
    ])[0]?.row;
    this.apply("DELETE", table, uuid, null);
    if (typeof server === "string") {
      const columns = columnsOf(table);
      const row = parseData(server);
      this.db.run(
        `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
        columns.map((column) => (column === "uuid" ? uuid : (row[column] ?? null))),
      );
    }
    const ops = this.db.all("SELECT op, data FROM _outbox WHERE tbl = ? AND uuid = ? ORDER BY id", [
      table,
      uuid,
    ]);
    for (const op of ops) {
      this.apply(
        parseOp(op.op),
        table,
        uuid,
        typeof op.data === "string" ? parseData(op.data) : null,
      );
    }
  }

  private rawRow(table: SyncedTable, uuid: string) {
    return this.db.all(`SELECT * FROM ${quote(table)} WHERE uuid = ?`, [uuid])[0];
  }

  private apply(op: OpKind, table: SyncedTable, uuid: string, data: SqlRow | null) {
    const known = new Set(columnsOf(table));
    const fields = Object.entries(data ?? {}).filter(([key]) => known.has(key) && key !== "uuid");
    if (op === "DELETE") {
      this.db.run(`DELETE FROM ${quote(table)} WHERE uuid = ?`, [uuid]);
    } else if (op === "PUT") {
      const names = ["uuid", ...fields.map(([key]) => key)];
      const update = fields.length
        ? `DO UPDATE SET ${fields.map(([key]) => `${quote(key)} = excluded.${quote(key)}`).join(", ")}`
        : "DO NOTHING";
      this.db.run(
        `INSERT INTO ${quote(table)} (${names.map(quote).join(", ")}) VALUES (${names.map(() => "?").join(", ")}) ON CONFLICT(uuid) ${update}`,
        [uuid, ...fields.map(([, value]) => value)],
      );
    } else if (fields.length) {
      this.db.run(
        `UPDATE ${quote(table)} SET ${fields.map(([key]) => `${quote(key)} = ?`).join(", ")} WHERE uuid = ?`,
        [...fields.map(([, value]) => value), uuid],
      );
    }
  }

  private enqueue(op: OpKind, table: SyncedTable, uuid: string, data: SqlRow | null) {
    this.db.run("INSERT INTO _outbox (op, tbl, uuid, data) VALUES (?, ?, ?, ?)", [
      op,
      table,
      uuid,
      data && JSON.stringify(data),
    ]);
  }

  private meta(key: string) {
    const value = this.db.all("SELECT value FROM _meta WHERE key = ?", [key])[0]?.value;
    return value === undefined || value === null ? undefined : String(value);
  }

  private setMeta(key: string, value: string) {
    this.db.run(
      "INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, value],
    );
  }

  private emit(change: StoreChange) {
    for (const listener of this.listeners) listener(change);
  }
}

// Creates the local tables, adding columns that newer schemas introduced.
function migrate(db: SqlDatabase) {
  db.transaction(() => {
    for (const table of tableNames) {
      db.run(`CREATE TABLE IF NOT EXISTS ${quote(table)} ("uuid" TEXT PRIMARY KEY NOT NULL)`);
      const existing = new Set(db.all(`PRAGMA table_info(${quote(table)})`).map((c) => c.name));
      for (const column of columnsOf(table)) {
        if (!existing.has(column))
          db.run(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(column)}`);
      }
    }
    db.run(
      "CREATE TABLE IF NOT EXISTS _outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL, tbl TEXT NOT NULL, uuid TEXT NOT NULL, data TEXT)",
    );
    db.run("CREATE INDEX IF NOT EXISTS _outbox_record ON _outbox (tbl, uuid)");
    // The last server value of each record (`row` is JSON, NULL once deleted) and its
    // change number. Local tables are this plus pending outbox writes.
    db.run(
      "CREATE TABLE IF NOT EXISTS _server (tbl TEXT NOT NULL, uuid TEXT NOT NULL, seq INTEGER NOT NULL, row TEXT, PRIMARY KEY (tbl, uuid))",
    );
    // Unsent writes of a user who isn't signed in here right now (see setUser).
    db.run(
      "CREATE TABLE IF NOT EXISTS _parked (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, op TEXT NOT NULL, tbl TEXT NOT NULL, uuid TEXT NOT NULL, data TEXT)",
    );
    db.run("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
    db.run(
      "CREATE TABLE IF NOT EXISTS _rejected (id INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL, tbl TEXT NOT NULL, uuid TEXT NOT NULL, data TEXT, error TEXT NOT NULL, at INTEGER NOT NULL)",
    );
  });
}

// Field values as SQLite stores them; `undefined` fields are left out.
function toData(fields: object): SqlRow {
  const data: SqlRow = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string" && typeof value !== "number") {
      throw new TypeError(`${key} must be a string, number, or null`);
    }
    data[key] = value;
  }
  return data;
}

// A SQLite row as a record: NULL columns are absent, like optional Convex fields.
function fromSql(row: SqlRow) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null));
}

function parseData(json: string) {
  return toData(JSON.parse(json));
}

function parseOp(value: unknown): OpKind {
  if (value === "PUT" || value === "PATCH" || value === "DELETE") return value;
  throw new Error(`Unknown outbox op ${String(value)}`);
}

function parseTable(value: unknown): SyncedTable {
  const table = tableNames.find((name) => name === value);
  if (!table) throw new Error(`Unknown outbox table ${String(value)}`);
  return table;
}
