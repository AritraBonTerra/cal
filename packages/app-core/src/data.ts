import type { SyncedTable } from "@cal/backend/sync";
import type { LocalStore, NewRow, Row, RowPatch } from "@cal/sync";

/**
 * How the UI reads and writes the user's records, whatever the platform. On iOS it is
 * the LocalStore itself (`storeSource`); in Electron the store lives in the main
 * process and the window reaches it over IPC. Reads return whole tables: a personal
 * calendar holds thousands of rows at most, and views filter in memory.
 */
export interface DataSource {
  list<T extends SyncedTable>(table: T): Promise<Row<T>[]>;
  get<T extends SyncedTable>(table: T, uuid: string): Promise<Row<T> | undefined>;
  insert<T extends SyncedTable>(table: T, row: NewRow<T>): Promise<string>;
  update<T extends SyncedTable>(table: T, uuid: string, patch: RowPatch<T>): Promise<boolean>;
  remove(table: SyncedTable, uuid: string): Promise<boolean>;
  // Calls `listener` with the tables that changed, after local or synced writes.
  subscribe(listener: (tables: readonly SyncedTable[]) => void): () => void;
}

// A DataSource over a LocalStore in the same process.
export const storeSource = (store: LocalStore): DataSource => ({
  list: async (table) => store.list(table),
  get: async (table, uuid) => store.get(table, uuid),
  insert: async (table, row) => store.insert(table, row),
  update: async (table, uuid, patch) => store.update(table, uuid, patch),
  remove: async (table, uuid) => store.remove(table, uuid),
  subscribe: (listener) => store.subscribe(({ tables }) => listener([...tables])),
});
