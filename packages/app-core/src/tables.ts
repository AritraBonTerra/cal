import type { SyncedTable } from "@cal/backend/sync";
import type { Row } from "@cal/sync";
import type { DataSource } from "./data";

type Snapshot<T extends SyncedTable> = { rows: Row<T>[]; loaded: boolean };

/**
 * A live, in-memory copy of each table the UI uses. A table loads on first use and
 * reloads whenever the source reports it changed; subscribers are notified after each
 * load. Snapshots are replaced, never mutated, so React can compare them by identity.
 */
export class LiveTables {
  // Keyed by table; the entry for `T` always holds `Snapshot<T>` (TS can't express that).
  private readonly snapshots = new Map<SyncedTable, { rows: unknown[]; loaded: boolean }>();
  private readonly listeners = new Map<SyncedTable, Set<() => void>>();
  private readonly loading = new Map<SyncedTable, Promise<void>>();
  private readonly stale = new Set<SyncedTable>();

  constructor(private readonly source: DataSource) {
    source.subscribe((tables) => {
      for (const table of tables) if (this.snapshots.has(table)) void this.load(table);
    });
  }

  snapshot<T extends SyncedTable>(table: T): Snapshot<T> {
    const existing = this.snapshots.get(table);
    if (existing) return existing as Snapshot<T>;
    const empty: Snapshot<T> = { rows: [], loaded: false };
    this.snapshots.set(table, empty);
    void this.load(table);
    return empty;
  }

  // Rows of `table` from the latest snapshot, e.g. for reading a row before editing it.
  rows<T extends SyncedTable>(table: T) {
    return this.snapshot(table).rows;
  }

  subscribe(table: SyncedTable, listener: () => void) {
    const set = this.listeners.get(table) ?? new Set();
    this.listeners.set(table, set);
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  // Loads `table`, coalescing changes that arrive mid-load into one more load.
  private async load<T extends SyncedTable>(table: T): Promise<void> {
    const inFlight = this.loading.get(table);
    if (inFlight) {
      this.stale.add(table);
      return inFlight;
    }
    const run = (async () => {
      const rows = await this.source.list(table);
      this.snapshots.set(table, { rows, loaded: true });
      for (const listener of this.listeners.get(table) ?? []) listener();
    })();
    this.loading.set(table, run);
    try {
      await run;
    } finally {
      this.loading.delete(table);
    }
    if (this.stale.delete(table)) await this.load(table);
  }
}
