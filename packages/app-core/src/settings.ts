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
  // The zone the grid renders in; null follows the device's zone.
  primaryZone: null as string | null,
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
  // Zones picked lately, newest first, so the picker can offer them before the search.
  recentZones: [] as string[],
};

export type AccountSettings = typeof accountDefaults;
export type DeviceSettings = typeof deviceDefaults;

// Where a platform keeps device settings: the renderer's localStorage on the Mac,
// expo-sqlite's key-value store on iOS. Values are JSON strings.
export interface DeviceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Whether a stored value is acceptable for its setting.
type Check = (value: unknown) => boolean;

const isBool: Check = (value) => typeof value === "boolean";
const isInt =
  (min: number, max: number): Check =>
  (value) =>
    Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
const oneOf =
  (...values: unknown[]): Check =>
  (value) =>
    values.includes(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const arrayOf =
  (check: Check, max = 100): Check =>
  (value) =>
    Array.isArray(value) && value.length <= max && value.every(check);
const isString: Check = (value) => typeof value === "string" && value.length > 0;
const isHex: Check = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);

// An IANA zone name this runtime knows.
const isZone: Check = (value) => {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

/*
 * A check per setting, so a value from another app version or a bad write is ignored
 * (the default stands) instead of reaching the UI with the wrong shape.
 */
const accountChecks: { [K in keyof AccountSettings]: Check } = {
  weekStart: isInt(0, 6),
  showWeekends: isBool,
  showDeclined: isBool,
  weekNumbers: isBool,
  todayKey: oneOf("go", "left-align"),
  timeFormat: oneOf("system", "12h", "24h"),
  timeZones: arrayOf(
    (zone) =>
      isRecord(zone) &&
      isZone(zone.zone) &&
      (zone.label === undefined || typeof zone.label === "string"),
    3,
  ),
  primaryZone: nullable(isZone),
  workingHours: (value) =>
    isRecord(value) &&
    isInt(0, 24 * 60)(value.start) &&
    isInt(0, 24 * 60)(value.end) &&
    Number(value.start) < Number(value.end),
  eventMinutes: isInt(5, 24 * 60),
  eventReminder: nullable(isInt(0, 7 * 24 * 60)),
  maps: oneOf("apple", "google"),
};

const deviceChecks: { [K in keyof DeviceSettings]: Check } = {
  theme: oneOf("system", "light", "dark"),
  // Pinch and ⌥-scroll zoom leave fractional heights.
  hourHeight: (value) =>
    value === 0 ||
    (typeof value === "number" && Number.isFinite(value) && value >= 16 && value <= 400),
  halfHourLines: isBool,
  hiddenCalendars: arrayOf(isString, 1000),
  calendarColors: (value) => isRecord(value) && Object.values(value).every(isHex),
  freeCalendars: arrayOf(isString, 1000),
  defaultCalendar: nullable(isString),
  launchAtLogin: isBool,
  recentZones: arrayOf(isZone, 20),
};

// `json` parsed, if it passes `check`.
function parseChecked(json: string, check: Check): { value: unknown } | undefined {
  try {
    const value: unknown = JSON.parse(json);
    return check(value) ? { value } : undefined;
  } catch {
    return undefined;
  }
}

// Whether `a` beats `b` for the same key: later write, then the higher uuid, so every
// device picks the same row even when two were written in the same millisecond.
const newer = (a: SyncedRow<"settings">, b: SyncedRow<"settings">) =>
  a.updated_at > b.updated_at || (a.updated_at === b.updated_at && a.uuid > b.uuid);

/**
 * Account settings from the synced rows: the newest row per key, over the defaults.
 * Values that fail their setting's check are ignored.
 */
export function readAccountSettings(rows: readonly SyncedRow<"settings">[]): AccountSettings {
  const newest = new Map<string, SyncedRow<"settings">>();
  for (const row of rows) {
    const current = newest.get(row.key);
    if (!current || newer(row, current)) newest.set(row.key, row);
  }
  const settings: AccountSettings = {
    ...accountDefaults,
    timeZones: [...accountDefaults.timeZones],
  };
  for (const [key, check] of Object.entries(accountChecks)) {
    const row = newest.get(key);
    const parsed = row && parseChecked(row.value, check);
    if (parsed) Reflect.set(settings, key, parsed.value);
  }
  return settings;
}

// Device settings from a DeviceStore, over the defaults, checked the same way.
export function readDeviceSettings(store: DeviceStore): DeviceSettings {
  const settings: DeviceSettings = { ...deviceDefaults };
  for (const [key, check] of Object.entries(deviceChecks)) {
    const raw = store.getItem(`cal.${key}`);
    const parsed = raw === null ? undefined : parseChecked(raw, check);
    if (parsed) Reflect.set(settings, key, parsed.value);
  }
  return settings;
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
    const newest = rows.reduce<(typeof rows)[number] | undefined>(
      (best, row) => (!best || newer(row, best) ? row : best),
      undefined,
    );
    const json = JSON.stringify(value);
    if (newest) await this.source.update("settings", newest.uuid, { value: json });
    else await this.source.insert("settings", { key, value: json });
  }
}
