import type { DataSource } from "@cal/app-core";
import type { CalendarSource } from "@cal/calendar-source";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import {
  type AuthCall,
  type AuthState,
  type CalBridge,
  type CalendarCall,
  channels,
  type DataCall,
  type DataChanged,
  type SyncStatus,
  type Theme,
} from "../shared/api";

// Subscribes to a main-process broadcast; returns an unsubscribe.
function listen<T>(channel: string, listener: (payload: T) => void) {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.off(channel, handler);
  };
}

const callData = (call: DataCall) => ipcRenderer.invoke(channels.data, call);
const callCalendar = (call: CalendarCall) => ipcRenderer.invoke(channels.calendar, call);
const callAuth = (call: AuthCall): Promise<AuthState> => ipcRenderer.invoke(channels.auth, call);

// IPC returns `any`; these wrappers restore each method's declared type from DataSource.
const data: DataSource = {
  list: (...args) => callData({ method: "list", args }),
  get: (...args) => callData({ method: "get", args }),
  insert: (...args) => callData({ method: "insert", args }),
  update: (...args) => callData({ method: "update", args }),
  remove: (...args) => callData({ method: "remove", args }),
  subscribe: (listener) => listen<DataChanged>(channels.dataChanged, listener),
};

const calendar: CalendarSource = {
  access: (...args) => callCalendar({ method: "access", args }),
  requestAccess: (...args) => callCalendar({ method: "requestAccess", args }),
  calendars: (...args) => callCalendar({ method: "calendars", args }),
  events: (...args) => callCalendar({ method: "events", args }),
  createEvent: (...args) => callCalendar({ method: "createEvent", args }),
  updateEvent: (...args) => callCalendar({ method: "updateEvent", args }),
  deleteEvent: (...args) => callCalendar({ method: "deleteEvent", args }),
  onChange: (listener) => listen<null>(channels.calendarChanged, () => listener()),
};

const bridge: CalBridge = {
  platform: process.platform,
  config: ipcRenderer.sendSync(channels.config),
  data,
  auth: {
    state: () => callAuth({ method: "state", args: [] }),
    signInWithGoogle: async () => {
      await ipcRenderer.invoke(channels.auth, { method: "signInWithGoogle", args: [] });
    },
    submitCode: (code) => callAuth({ method: "submitCode", args: [code] }),
    signOut: () => callAuth({ method: "signOut", args: [] }),
    onChange: (listener) => listen<AuthState>(channels.authChanged, listener),
    onError: (listener) => listen<string>(channels.authError, listener),
  },
  sync: {
    status: (): Promise<SyncStatus> => ipcRenderer.invoke(channels.syncStatus),
    onChange: (listener) => listen<SyncStatus>(channels.syncChanged, listener),
  },
  calendar,
  onCommand: (listener) => listen<string>("cal:command", listener),
  setTheme: (theme: Theme) => ipcRenderer.invoke(channels.theme, theme),
};

contextBridge.exposeInMainWorld("cal", bridge);
