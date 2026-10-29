import { createCal, storeSource } from "@cal/app-core";
import { FIXTURE_NOW, FixtureCalendar, seedFixture } from "@cal/fixtures";
import { LocalStore, Session, type SessionStorage } from "@cal/sync";
import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { deleteDatabaseSync } from "expo-sqlite";
import { SQLiteStorage } from "expo-sqlite/kv-store";
import { createMobileAuth } from "./auth";
import { deviceCalendar } from "./calendar";
import { openDatabase } from "./db";

// The dev deployment's public client URL; a build can point elsewhere with EXPO_PUBLIC_CONVEX_URL.
const CONVEX_URL =
  process.env.EXPO_PUBLIC_CONVEX_URL ?? "https://charming-dachshund-581.convex.cloud";

const SESSION_KEY = "cal.session";

// Who is signed in (user id and email), in the iOS Keychain.
const keychain: SessionStorage = {
  read: () => SecureStore.getItem(SESSION_KEY) ?? undefined,
  write: (value) => SecureStore.setItem(SESSION_KEY, value),
  clear: () => {
    void SecureStore.deleteItemAsync(SESSION_KEY);
  },
};

/*
 * Fixture mode (EXPO_PUBLIC_CAL_FIXTURE=1) starts from the same seeded week, fixed clock
 * and fake calendars every launch, offline, for screenshots and design review.
 */
export const fixture = process.env.EXPO_PUBLIC_CAL_FIXTURE === "1";
// A fixed "now" in fixture mode; the clock starts here and runs normally.
export const startNow = fixture ? FIXTURE_NOW.getTime() : undefined;

const offset = startNow === undefined ? 0 : startNow - Date.now();
// The app's current instant, including the fixture offset. For event handlers and actions.
export const now = () => new Date(Date.now() + offset);

/*
 * The app's data layer, created once: the local SQLite store (which the UI reads and
 * writes directly, so it never waits on the network), the sync session, and app-core.
 */
const dbName = fixture ? "cal-fixture.db" : "cal.db";
if (fixture) {
  try {
    deleteDatabaseSync(dbName);
  } catch {
    // First fixture launch: nothing to delete.
  }
}
export const store = new LocalStore(openDatabase(dbName), { newId: randomUUID });
if (fixture) seedFixture(store);

export const calendar = fixture ? new FixtureCalendar() : deviceCalendar;

type Listener<T> = (value: T) => void;
const authListeners = new Set<Listener<ReturnType<Session["state"]>>>();
const syncListeners = new Set<Listener<ReturnType<Session["status"]>>>();

// Google sign-in through Better Auth on the deployment's site URL.
export const auth = createMobileAuth(CONVEX_URL.replace(".convex.cloud", ".convex.site"));

export const session = new Session(CONVEX_URL, store, keychain, auth.adapter, {
  auth: (state) => {
    for (const listener of authListeners) listener(state);
  },
  sync: (status) => {
    for (const listener of syncListeners) listener(status);
  },
});
if (!fixture) session.init();

// Device settings in their own small SQLite key-value store (in memory for fixtures).
const deviceSettings = fixture ? undefined : new SQLiteStorage("cal-settings.db");
export const cal = createCal(
  storeSource(store),
  now,
  deviceSettings && {
    getItem: (key) => deviceSettings.getItemSync(key),
    setItem: (key, value) => deviceSettings.setItemSync(key, value),
  },
);
// Undo steps belong to the account that made them; see History.clear.
onAuthChange(() => void cal.history.clear());

// Subscribes to sign-in changes; returns an unsubscribe.
export function onAuthChange(listener: Listener<ReturnType<Session["state"]>>) {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

// Subscribes to sync status (pending edits, connection); returns an unsubscribe.
export function onSyncChange(listener: Listener<ReturnType<Session["status"]>>) {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}
