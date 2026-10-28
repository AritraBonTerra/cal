import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { LocalStore, type SqlDatabase, type SqlRow } from "@cal/sync";
import { type DeviceStore, readAccountSettings, Settings, storeSource } from "../src";

function setup() {
  const db = new Database(":memory:");
  const adapter: SqlDatabase = {
    run: (sql, params = []) => {
      db.query(sql).run(...params);
    },
    all: (sql, params = []) => db.query<SqlRow, SqlRow[keyof SqlRow][]>(sql).all(...params),
    transaction: (fn) => db.transaction(fn)(),
  };
  const store = new LocalStore(adapter);
  const values = new Map<string, string>();
  const device: DeviceStore = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  return { store, values, settings: new Settings(storeSource(store), device) };
}

describe("settings", () => {
  test("account settings save to one synced row per key and read back over defaults", async () => {
    const { store, settings } = setup();
    await settings.setAccount("weekStart", 0);
    await settings.setAccount("weekStart", 6);
    await settings.setAccount("timeZones", [{ zone: "Asia/Kolkata", label: "IST" }]);
    expect(store.list("settings")).toHaveLength(2);
    const account = readAccountSettings(store.list("settings"));
    expect(account.weekStart).toBe(6);
    expect(account.timeZones).toEqual([{ zone: "Asia/Kolkata", label: "IST" }]);
    expect(account.eventMinutes).toBe(30);
  });

  test("the newest row wins when two devices wrote the same key; bad values are ignored", () => {
    const row = (uuid: string, key: string, value: string, updated_at: number) => ({
      uuid,
      key,
      value,
      created_at: 0,
      updated_at,
    });
    const account = readAccountSettings([
      row("a", "weekStart", "0", 5),
      row("b", "weekStart", "3", 9),
      row("c", "eventMinutes", '"lots"', 9),
      row("d", "showWeekends", "not json", 9),
    ]);
    expect(account.weekStart).toBe(3);
    expect(account.eventMinutes).toBe(30);
    expect(account.showWeekends).toBe(true);
  });

  test("device settings persist in the device store and notify", () => {
    const { values, settings } = setup();
    let changes = 0;
    settings.subscribeDevice(() => changes++);
    settings.setDevice("theme", "dark");
    settings.setDevice("hourHeight", 0);
    expect(settings.device).toMatchObject({ theme: "dark", hourHeight: 0 });
    expect(values.get("cal.theme")).toBe('"dark"');
    expect(changes).toBe(2);
  });
});
