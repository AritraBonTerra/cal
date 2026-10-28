import type { CalendarAccess } from "@cal/calendar-source";
import type { AuthState, SyncStatus } from "@cal/sync";
import { useEffect, useState } from "react";
import { calendar, onAuthChange, onSyncChange, session } from "../data/cal";

// The signed-in user and sync status, kept current from the session.
export function useAccount() {
  const [auth, setAuth] = useState<AuthState>(() => session.state());
  const [sync, setSync] = useState<SyncStatus>(() => session.status());
  useEffect(() => {
    const stopAuth = onAuthChange(setAuth);
    const stopSync = onSyncChange(setSync);
    return () => {
      stopAuth();
      stopSync();
    };
  }, []);
  return { auth, sync };
}

// One line for the account row: "Synced", "Offline · 3 to upload", "Sign in again".
export function syncLabel(sync: SyncStatus) {
  if (sync.needsSignIn) return "Sign in again";
  if (!sync.connected) return sync.pending > 0 ? `Offline · ${sync.pending} to upload` : "Offline";
  return sync.pending > 0 ? `${sync.pending} to upload` : "Synced";
}

// Calendar permission, with a way to ask for it.
export function useCalendarAccess() {
  const [access, setAccess] = useState<CalendarAccess>("fullAccess");
  useEffect(() => {
    void calendar.access().then(setAccess);
  }, []);
  const request = () => calendar.requestAccess().then(setAccess);
  return { access, request };
}
