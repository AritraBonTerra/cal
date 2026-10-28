import { DatabaseSync } from "node:sqlite";
import type { SqlDatabase, SqlRow } from "@cal/sync";

// Opens the local SQLite database at `path` for the sync store, using Node's built-in
// driver. WAL keeps reads fast while the engine writes.
export function openDatabase(path: string): SqlDatabase {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  return {
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: (sql, params = []) =>
      db
        .prepare(sql)
        .all(...params)
        .map((row) => ({ ...row }) as SqlRow),
    transaction: (fn) => {
      db.exec("BEGIN");
      try {
        fn();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
