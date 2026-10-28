import type { SqlDatabase, SqlRow } from "@cal/sync";
import { openDatabaseSync } from "expo-sqlite";

// Opens the device's local database for the sync store, using expo-sqlite's sync API.
export function openDatabase(name = "cal.db"): SqlDatabase {
  const db = openDatabaseSync(name);
  db.execSync("PRAGMA journal_mode = WAL");
  return {
    run: (sql, params = []) => {
      db.runSync(sql, [...params]);
    },
    all: (sql, params = []) => db.getAllSync<SqlRow>(sql, [...params]),
    transaction: (fn) => db.withTransactionSync(fn),
  };
}
