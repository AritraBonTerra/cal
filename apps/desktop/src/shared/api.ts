import type { DataSource } from "@cal/app-core";
import type { SyncedTable } from "@cal/backend/sync";
import type { CalendarSource } from "@cal/calendar-source";

import type { AuthState, SignInFlow, SyncStatus } from "@cal/sync";

export type { AuthState, SignInFlow, SyncStatus };

/**
 * What the preload script exposes to the window as `window.cal`. The window has no
 * Node access; everything goes through these calls to the main process.
 */
export interface AppConfig {
  // Fixture mode: seeded data, fixed clock, no network (see main/fixtures.ts).
  fixture: boolean;
  // A fixed "now" in epoch ms; the window's clock starts here and runs normally.
  now?: number;
}

export interface CalBridge {
  platform: NodeJS.Platform;
  config: AppConfig;
  data: DataSource;
  auth: {
    state(): Promise<AuthState>;
    // Resolves with the new state, or rejects with a message the window can show.
    signIn(email: string, password: string, flow: SignInFlow): Promise<AuthState>;
    signOut(): Promise<AuthState>;
    onChange(listener: (state: AuthState) => void): () => void;
  };
  sync: {
    status(): Promise<SyncStatus>;
    onChange(listener: (status: SyncStatus) => void): () => void;
  };
  calendar: CalendarSource;
  // Menu items (Undo, ⌘K, New To-Do) arrive as command ids for the window's registry.
  onCommand(listener: (id: string) => void): () => void;
}

// IPC channel names, shared by main and preload.
export const channels = {
  config: "cal:config",
  data: "cal:data",
  dataChanged: "cal:data-changed",
  auth: "cal:auth",
  authChanged: "cal:auth-changed",
  syncStatus: "cal:sync-status",
  syncChanged: "cal:sync-changed",
  calendar: "cal:calendar",
  calendarChanged: "cal:calendar-changed",
} as const;

// A DataSource call sent over IPC: the method name and its arguments.
export type DataCall = {
  [K in Exclude<keyof DataSource, "subscribe">]: { method: K; args: Parameters<DataSource[K]> };
}[Exclude<keyof DataSource, "subscribe">];

export type CalendarCall = {
  [K in Exclude<keyof CalendarSource, "onChange">]: {
    method: K;
    args: Parameters<CalendarSource[K]>;
  };
}[Exclude<keyof CalendarSource, "onChange">];

export type AuthCall =
  | { method: "state"; args: [] }
  | { method: "signIn"; args: [string, string, SignInFlow] }
  | { method: "signOut"; args: [] };

export type DataChanged = readonly SyncedTable[];
