import type { DataSource } from "@cal/app-core";
import type { CalendarSource } from "@cal/calendar-source";
import { contextBridge, type IpcRendererEvent, ipcRenderer, webFrame } from "electron";
import {
  type AuthCall,
  type AuthState,
  type CalBridge,
  type CalendarCall,
  channels,
  type DataCall,
  type DataChanged,
  type MenuKeys,
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

// What the window wants done before it closes. Main waits for the answer, so with
// nothing registered the answer goes straight back.
const closing = new Set<() => Promise<void>>();
ipcRenderer.on(channels.closing, () => {
  void Promise.allSettled([...closing].map((listener) => listener())).then(() =>
    ipcRenderer.send(channels.closeReady),
  );
});

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
  setMenuKeys: (keys: MenuKeys | null) => ipcRenderer.invoke(channels.menuKeys, keys),
  checkForUpdates: () => ipcRenderer.invoke(channels.checkForUpdates),
  setTheme: (theme: Theme) => ipcRenderer.invoke(channels.theme, theme),
  onClosing: (listener) => {
    closing.add(listener);
    return () => {
      closing.delete(listener);
    };
  },
  setScale: (percent) => {
    webFrame.setZoomFactor(percent / 100);
    // Main moves the traffic lights to stay centred on the scaled top band.
    void ipcRenderer.invoke(channels.scale, percent);
  },
  onGlobalKeyTaken: (listener) => listen<string>(channels.globalKeyTaken, listener),
  openAtLogin: {
    get: () => ipcRenderer.invoke(channels.openAtLogin),
    set: (open) => ipcRenderer.invoke(channels.openAtLogin, open),
  },
  capture: {
    open: () => ipcRenderer.invoke(channels.captureOpen),
    hide: () => ipcRenderer.invoke(channels.captureHide),
    setSize: (width, height) => ipcRenderer.invoke(channels.captureSize, width, height),
    onReset: (listener) => listen<null>(channels.captureReset, () => listener()),
  },
};

contextBridge.exposeInMainWorld("cal", bridge);
