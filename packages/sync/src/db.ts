// Values SQLite stores for our tables: text, numbers, and NULL.
export type SqlValue = string | number | null;

export type SqlRow = Record<string, SqlValue>;

/**
 * The synchronous SQLite surface the local store needs. Each platform adapts its driver:
 * `node:sqlite` in Electron's main process, `expo-sqlite` on iOS, `bun:sqlite` in tests.
 * `transaction` runs `fn` atomically and rolls back if it throws; calls never nest.
 */
export interface SqlDatabase {
  run(sql: string, params?: readonly SqlValue[]): void;
  all(sql: string, params?: readonly SqlValue[]): SqlRow[];
  transaction(fn: () => void): void;
}
