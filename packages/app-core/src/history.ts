import type { SyncedTable } from "@cal/backend/sync";
import type { NewRow, RowPatch, SqlValue } from "@cal/sync";
import type { DataSource } from "./data";

type Fields = Record<string, SqlValue>;

// A recorded write, kept as data so undo can replay its inverse later. `external` is a
// change outside Cal's tables (e.g. a device calendar event) with its own do/undo.
type Op =
  | { kind: "insert"; table: SyncedTable; row: Fields }
  | { kind: "update"; table: SyncedTable; uuid: string; patch: Fields }
  | { kind: "remove"; table: SyncedTable; uuid: string }
  | { kind: "external"; run: () => Promise<void>; inverse: () => Promise<void> };

interface Entry {
  label: string;
  ops: Op[];
}

/**
 * Writes made through a History transaction. Each write records its inverse, so the
 * whole transaction can be undone as one step (⌘Z).
 */
export class Writer {
  readonly inverses: Op[] = [];

  constructor(
    private readonly source: DataSource,
    private readonly aliases: Map<string, string>,
  ) {}

  async insert<T extends SyncedTable>(table: T, row: NewRow<T>) {
    const uuid = await this.source.insert(table, this.remap(row));
    this.inverses.push({ kind: "remove", table, uuid });
    return uuid;
  }

  async update<T extends SyncedTable>(table: T, uuid: string, patch: RowPatch<T>) {
    const id = this.resolve(uuid);
    const current: Record<string, unknown> | undefined = await this.source.get(table, id);
    if (!current) return false;
    const previous: Fields = {};
    for (const key of Object.keys(patch)) previous[key] = toSql(current[key]);
    const changed = await this.source.update(table, id, this.remap(patch));
    if (changed) this.inverses.push({ kind: "update", table, uuid: id, patch: previous });
    return changed;
  }

  async remove(table: SyncedTable, uuid: string) {
    const id = this.resolve(uuid);
    const current: Record<string, unknown> | undefined = await this.source.get(table, id);
    if (!current || !(await this.source.remove(table, id))) return false;
    const row: Fields = {};
    for (const [key, value] of Object.entries(current)) row[key] = toSql(value);
    this.inverses.push({ kind: "insert", table, row });
    return true;
  }

  /**
   * Makes a change outside Cal's tables (`apply`) as part of this step, with `revert`
   * to undo it, e.g. moving a device calendar event and moving it back.
   */
  async external(apply: () => Promise<void>, revert: () => Promise<void>) {
    await apply();
    this.inverses.push({ kind: "external", run: revert, inverse: apply });
  }

  /*
   * Replays a recorded op. Deletes are final on the server, so a removed record comes
   * back under a new uuid; `aliases` maps the old uuid to the new one. Every write
   * resolves uuids and `*_uuid` references through it, so older undo steps and ids the
   * UI still holds keep pointing at the restored record.
   */
  async apply(op: Op) {
    if (op.kind === "external") {
      await this.external(op.run, op.inverse);
      return true;
    }
    if (op.kind === "remove") return this.remove(op.table, op.uuid);
    if (op.kind === "update") return this.update(op.table, op.uuid, op.patch);
    const { uuid, created_at, updated_at, ...fields } = op.row;
    // Recorded rows are plain data; the store checks field types again on insert.
    const restored = await this.insert(op.table, fields as NewRow<SyncedTable>);
    if (typeof uuid === "string") this.aliases.set(uuid, restored);
    return true;
  }

  // The current uuid of a record that may have been restored under a new one.
  resolve(uuid: string): string {
    const next = this.aliases.get(uuid);
    return next === undefined ? uuid : this.resolve(next);
  }

  private remap<R extends object>(fields: R): R {
    const remapped = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        key.endsWith("_uuid") && typeof value === "string" ? this.resolve(value) : value,
      ]),
    );
    // Same keys, and string values stay strings.
    return remapped as R;
  }
}

const toSql = (value: unknown): SqlValue =>
  typeof value === "string" || typeof value === "number" ? value : null;

/**
 * Undo and redo for the user's edits. Every UI write goes through `transact`, which
 * runs writes one transaction at a time and records how to reverse them. Undoing
 * replays the inverses, and the inverse of that becomes the redo step.
 */
export class History {
  private readonly undos: Entry[] = [];
  private redos: Entry[] = [];
  private readonly aliases = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly source: DataSource,
    private readonly limit = 200,
  ) {}

  // Runs `fn`'s writes as one undoable step named `label` (e.g. "Move Block").
  transact<R>(label: string, fn: (writer: Writer) => Promise<R>) {
    return this.serial(async () => {
      const writer = new Writer(this.source, this.aliases);
      const result = await fn(writer);
      if (writer.inverses.length) {
        this.undos.push({ label, ops: writer.inverses });
        if (this.undos.length > this.limit) this.undos.shift();
        this.redos = [];
        this.emit();
      }
      return result;
    });
  }

  undo() {
    return this.serial(() => this.replay(this.undos, this.redos));
  }

  redo() {
    return this.serial(() => this.replay(this.redos, this.undos));
  }

  // The label of the step ⌘Z / ⇧⌘Z would reverse, for menus and toasts.
  get nextUndo() {
    return this.undos.at(-1)?.label;
  }

  get nextRedo() {
    return this.redos.at(-1)?.label;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async replay(from: Entry[], to: Entry[]) {
    const entry = from.pop();
    if (!entry) return undefined;
    const writer = new Writer(this.source, this.aliases);
    for (const op of [...entry.ops].reverse()) await writer.apply(op);
    to.push({ label: entry.label, ops: writer.inverses });
    this.emit();
    return entry.label;
  }

  private serial<R>(fn: () => Promise<R>) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
