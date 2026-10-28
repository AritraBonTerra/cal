import type { SyncedRow } from "@cal/backend/sync";
import type { DataSource } from "./data";

/*
 * Preferences, in two kinds:
 * - Account settings follow you to every device: they're stored as rows of the synced
 *   `settings` table (one key each, JSON value; the newest row per key wins).
 * - Device settings stay on this device (theme, hour height, which calendars show):
 *   calendar ids differ between a Mac and an iPhone, and so does screen size. Each
 *   platform stores them through a DeviceStore.
 */

// A time zone shown as an extra column on the grid.
export interface ZoneColumn {
  // IANA name, e.g. "Asia/Kolkata".
  zone: string;
  // Short custom label; the zone's abbreviation when absent.
  label?: string;
}

export const accountDefaults = {
  // 0 = Sunday … 6 = Saturday.
  weekStart: 1,
  showWeekends: true,
  showDeclined: false,
  weekNumbers: false,
  // What `T` does: jump to today, or keep the span and put today first.
  todayKey: "go" as "go" | "left-align",
  timeFormat: "system" as "system" | "12h" | "24h",
  // Extra time zones beside the main one, outermost first (at most 3).
  timeZones: [] as ZoneColumn[],
  // Minutes after midnight.
  workingHours: { start: 9 * 60, end: 18 * 60 },
  // Length of a new event or block, in minutes.
  eventMinutes: 30,
  // Reminder added to new timed events, in minutes before; null for none.
  eventReminder: 10 as number | null,
  maps: "apple" as "apple" | "google",
};

export const deviceDefaults = {
  theme: "system" as "system" | "light" | "dark",
  // Pixels per hour; 0 fits the whole day in the window. The grid never goes below fit.
  hourHeight: 48,
  halfHourLines: false,
  // Device calendars hidden from the grid, by calendar id.
  hiddenCalendars: [] as string[],
  // Color overrides by calendar id (hex), kept in Cal rather than written to the calendar.
  calendarColors: {} as Record<string, string>,
  // Calendars whose events don't count as busy for scheduling.
  freeCalendars: [] as string[],
  // Where new events go; the system default calendar when unset.
  defaultCalendar: null as string | null,
  launchAtLogin: false,
};

export type AccountSettings = typeof accountDefaults;
export type DeviceSettings = typeof deviceDefaults;

// Where a platform keeps device settings: the renderer's localStorage on the Mac,
// expo-sqlite's key-value store on iOS. Values are JSON strings.
export interface DeviceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Account settings from the synced rows: the newest row per key, parsed over the
 * defaults. A value that doesn't parse, or has a different type than its default, is
 * ignored, so a newer app version's settings can't break an older one.
 */
export function readAccountSettings(rows: readonly SyncedRow<"settings">[]): AccountSettings {
  const newest = new Map<string, SyncedRow<"settings">>();
  for (const row of rows) {
    const current = newest.get(row.key);
    if (!current || row.updated_at > current.updated_at) newest.set(row.key, row);
  }
  const settings: AccountSettings = {
    ...accountDefaults,
    timeZones: [...accountDefaults.timeZones],
  };
  for (const key of Object.keys(accountDefaults)) {
    const row = newest.get(key);
    if (!row) continue;
    const value = parseLike(row.value, Reflect.get(accountDefaults, key));
    if (value !== undefined) Reflect.set(settings, key, value);
  }
  return settings;
}

// Device settings from a DeviceStore, parsed over the defaults the same way.
export function readDeviceSettings(store: DeviceStore): DeviceSettings {
  const settings: DeviceSettings = { ...deviceDefaults };
  for (const key of Object.keys(deviceDefaults)) {
    const raw = store.getItem(`cal.${key}`);
    if (raw === null) continue;
    const value = parseLike(raw, Reflect.get(deviceDefaults, key));
    if (value !== undefined) Reflect.set(settings, key, value);
  }
  return settings;
}

// `json` parsed, if it has the same shape of type as `example` (null matches anything).
function parseLike(json: string, example: unknown): unknown {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (example === null || value === null) return value;
  if (Array.isArray(example)) return Array.isArray(value) ? value : undefined;
  return typeof value === typeof example ? value : undefined;
}

/**
 * Reads and writes both kinds of settings for a window. Account settings come from the
 * live `settings` table (see useSettings); device settings are held here and saved to
 * the DeviceStore. Settings changes aren't undo steps.
 */
export class Settings {
  private deviceSnapshot: DeviceSettings;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly source: DataSource,
    private readonly store: DeviceStore,
  ) {
    this.deviceSnapshot = readDeviceSettings(store);
  }

  get device() {
    return this.deviceSnapshot;
  }

  setDevice<K extends keyof DeviceSettings>(key: K, value: DeviceSettings[K]) {
    this.store.setItem(`cal.${key}`, JSON.stringify(value));
    this.deviceSnapshot = { ...this.deviceSnapshot, [key]: value };
    for (const listener of this.listeners) listener();
  }

  subscribeDevice(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Saves an account setting: updates the newest row for the key, or adds one.
  async setAccount<K extends keyof AccountSettings>(key: K, value: AccountSettings[K]) {
    const rows = (await this.source.list("settings")).filter((row) => row.key === key);
    const newest = rows.sort((a, b) => b.updated_at - a.updated_at)[0];
    const json = JSON.stringify(value);
    if (newest) await this.source.update("settings", newest.uuid, { value: json });
    else await this.source.insert("settings", { key, value: json });
  }
}
