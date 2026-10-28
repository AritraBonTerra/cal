import type { CalendarAccess } from "@cal/calendar-source";
import { useEffect, useState } from "react";
import type { AuthState, SyncStatus } from "../../../shared/api";

// The signed-in user and sync status, kept current from the main process.
export function useAccount() {
  const [auth, setAuth] = useState<AuthState>({ status: "signedOut" });
  const [sync, setSync] = useState<SyncStatus>({
    pending: 0,
    connected: false,
    needsSignIn: false,
  });
  useEffect(() => {
    void window.cal.auth.state().then(setAuth);
    void window.cal.sync.status().then(setSync);
    const stopAuth = window.cal.auth.onChange(setAuth);
    const stopSync = window.cal.sync.onChange(setSync);
    return () => {
      stopAuth();
      stopSync();
    };
  }, []);
  return { auth, sync };
}

// Calendar permission, with a way to ask for it.
export function useCalendarAccess() {
  const [access, setAccess] = useState<CalendarAccess>("fullAccess");
  useEffect(() => {
    void window.cal.calendar.access().then(setAccess);
  }, []);
  const request = () => window.cal.calendar.requestAccess().then(setAccess);
  return { access, request };
}
