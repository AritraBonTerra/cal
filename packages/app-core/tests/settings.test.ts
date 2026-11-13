import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { LocalStore, type SqlDatabase, type SqlRow } from "@cal/sync";
import {
  type DeviceStore,
  readAccountSettings,
  readDeviceSettings,
  Settings,
  storeSource,
} from "../src";

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

  test("ties pick the same row whatever the order", () => {
    const row = (uuid: string, value: string) => ({
      uuid,
      key: "weekStart",
      value,
      created_at: 0,
      updated_at: 5,
    });
    expect(readAccountSettings([row("a", "0"), row("b", "3")]).weekStart).toBe(3);
    expect(readAccountSettings([row("b", "3"), row("a", "0")]).weekStart).toBe(3);
  });

  test("values with the wrong shape are ignored", () => {
    const row = (key: string, value: string) => ({
      uuid: key,
      key,
      value,
      created_at: 0,
      updated_at: 1,
    });
    const account = readAccountSettings([
      row("weekStart", "null"),
      row("workingHours", "[]"),
      row("timeZones", "[null]"),
      row("timeFormat", '"typo"'),
      row("primaryZone", '"Not/AZone"'),
      row("eventReminder", "null"),
    ]);
    expect(account).toMatchObject({
      weekStart: 1,
      workingHours: { start: 540, end: 1080 },
      timeZones: [],
      timeFormat: "system",
      primaryZone: null,
      eventReminder: null,
    });
  });

  test("keybindings keep up to four non-empty bindings per command", async () => {
    const { store, settings } = setup();
    expect(readAccountSettings([]).keybindings).toEqual({});
    await settings.setAccount("keybindings", { "task.new": ["mod+j"], "nav.today": [] });
    expect(readAccountSettings(store.list("settings")).keybindings).toEqual({
      "task.new": ["mod+j"],
      "nav.today": [],
    });
    const row = (value: string) => ({
      uuid: "k",
      key: "keybindings",
      value,
      created_at: 0,
      updated_at: 1,
    });
    for (const bad of [
      '{"a":["1","2","3","4","5"]}',
      '{"a":[""]}',
      '{"a":"t"}',
      "[]",
      '{"a":[1]}',
    ]) {
      expect(readAccountSettings([row(bad)]).keybindings).toEqual({});
    }
  });

  test("device settings persist in the device store and notify", () => {
    const { values, settings } = setup();
    let changes = 0;
    settings.subscribeDevice(() => changes++);
    settings.setDevice("theme", "dark");
    settings.setDevice("hourHeight", 52.7);
    expect(settings.device).toMatchObject({ theme: "dark", hourHeight: 52.7 });
    expect(
      readDeviceSettings({ getItem: (key) => values.get(key) ?? null, setItem: () => {} })
        .hourHeight,
    ).toBe(52.7);
    expect(values.get("cal.theme")).toBe('"dark"');
    expect(changes).toBe(2);
  });

  test("the sidebar's month and calendar list start open and remember being collapsed", () => {
    const { values, settings } = setup();
    expect(settings.device).toMatchObject({ showMiniMonth: true, showCalendarList: true });
    settings.setDevice("showMiniMonth", false);
    values.set("cal.showCalendarList", '"no"');
    const read = readDeviceSettings({
      getItem: (key) => values.get(key) ?? null,
      setItem: () => {},
    });
    expect(read).toMatchObject({ showMiniMonth: false, showCalendarList: true });
  });

  test("interface size keeps to its range and steps, and reload picks up another window's save", () => {
    const { values, settings } = setup();
    expect(settings.device.uiScale).toBe(100);
    const read = (raw: string) => {
      values.set("cal.uiScale", raw);
      return readDeviceSettings({ getItem: (key) => values.get(key) ?? null, setItem: () => {} })
        .uiScale;
    };
    expect(read("125")).toBe(125);
    expect(read("123")).toBe(100);
    expect(read("200")).toBe(100);
    expect(read("75")).toBe(100);
    // The capture panel saw nothing until told the main window saved.
    values.set("cal.uiScale", "110");
    expect(settings.device.uiScale).toBe(100);
    let heard = 0;
    settings.subscribeDevice(() => heard++);
    settings.reload();
    expect(settings.device.uiScale).toBe(110);
    expect(heard).toBe(1);
  });
});
