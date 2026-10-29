import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { storeSource } from "@cal/app-core";
import { FIXTURE_NOW, FixtureCalendar, seedFixture } from "@cal/fixtures";
import { LocalStore, Session } from "@cal/sync";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  shell,
} from "electron";
import {
  type AuthCall,
  type CalendarCall,
  channels,
  type DataCall,
  type Theme,
} from "../shared/api";
import { createDesktopAuth, SCHEME } from "./auth";
import { Calkit } from "./calkit";
import { openDatabase } from "./db";
import { encryptedFile } from "./session";

// The dev deployment's public client URL; a build can point elsewhere with MAIN_VITE_CONVEX_URL.
const CONVEX_URL =
  import.meta.env.MAIN_VITE_CONVEX_URL ?? "https://charming-dachshund-581.convex.cloud";

// Fixture mode (CAL_FIXTURE=1) starts from the same seeded data and clock every launch,
// offline, for screenshots and design review.
const fixture = process.env.CAL_FIXTURE === "1";

// A second data directory (CAL_PROFILE=b) runs another "device" side by side for testing sync.
const profile = fixture ? "fixture" : process.env.CAL_PROFILE;
if (profile) app.setPath("userData", `${app.getPath("userData")}-${profile}`);

const dataDir = app.getPath("userData");
mkdirSync(dataDir, { recursive: true });
if (fixture) {
  for (const file of ["cal.sqlite", "cal.sqlite-wal", "cal.sqlite-shm"]) {
    rmSync(join(dataDir, file), { force: true });
  }
}
const store = new LocalStore(openDatabase(join(dataDir, "cal.sqlite")));
if (fixture) seedFixture(store);
const data = storeSource(store);
const calkit = new Calkit(
  app.isPackaged
    ? join(process.resourcesPath, "calkit")
    : join(app.getAppPath(), "native/calkit/.build/release/calkit"),
);
const calendar = fixture ? new FixtureCalendar() : calkit;

// Sends `channel` to every open window.
const broadcast = (channel: string, payload: unknown) => {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
};

// Google sign-in through Better Auth on the deployment's site URL (research/11).
const auth = createDesktopAuth(
  CONVEX_URL.replace(".convex.cloud", ".convex.site"),
  join(dataDir, "auth.json"),
);
const session = new Session(
  CONVEX_URL,
  store,
  encryptedFile(join(dataDir, "session.bin")),
  auth.adapter,
  {
    auth: (state) => broadcast(channels.authChanged, state),
    sync: (status) => broadcast(channels.syncChanged, status),
  },
);

// Finishes Google sign-in from the callback link or a pasted code.
async function completeSignIn(linkOrCode: string) {
  await auth.complete(linkOrCode);
  return session.signedIn();
}

// The browser hands sign-in back as dev.aritra.cal://auth/callback#token=…. Registered
// before `ready` so a link that launches the app isn't missed (works in packaged builds).
app.setAsDefaultProtocolClient(SCHEME);
app.on("open-url", (event, url) => {
  if (!url.startsWith(`${SCHEME}://auth/callback`)) return;
  event.preventDefault();
  completeSignIn(url).catch((error: unknown) =>
    broadcast(channels.authError, error instanceof Error ? error.message : String(error)),
  );
});

data.subscribe((tables) => broadcast(channels.dataChanged, tables));
calendar.onChange(() => broadcast(channels.calendarChanged, null));

const rendererFile = join(import.meta.dirname, "../renderer/index.html");

// Whether `url` is Cal's own window content, the only page allowed to use the bridge.
function isAppUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) return parsed.origin === new URL(dev).origin;
  // The built page itself; only its query and hash may differ.
  return (
    `${parsed.protocol}//${parsed.host}${parsed.pathname}` === pathToFileURL(rendererFile).href
  );
}

// Registers an IPC handler that refuses calls from any page other than Cal's own.
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAppUrl(event.senderFrame?.url ?? "")) throw new Error("Untrusted sender");
    return fn(...(args as A));
  });
}

// Read synchronously by the preload script before the window's code runs.
ipcMain.on(channels.config, (event) => {
  event.returnValue = isAppUrl(event.senderFrame?.url ?? "")
    ? { fixture, now: fixture ? FIXTURE_NOW.getTime() : undefined }
    : null;
});

handle(channels.data, (call: DataCall) => {
  switch (call.method) {
    case "list":
      return data.list(...call.args);
    case "get":
      return data.get(...call.args);
    case "insert":
      return data.insert(...call.args);
    case "update":
      return data.update(...call.args);
    case "remove":
      return data.remove(...call.args);
  }
});

handle(channels.auth, (call: AuthCall) => {
  switch (call.method) {
    case "state":
      return session.state();
    case "signInWithGoogle":
      return auth.start();
    case "submitCode":
      return completeSignIn(...call.args);
    case "signOut":
      return session.signOut();
  }
});

handle(channels.syncStatus, () => session.status());

handle(channels.calendar, (call: CalendarCall) => {
  switch (call.method) {
    case "access":
      return calendar.access();
    case "requestAccess":
      return calendar.requestAccess();
    case "calendars":
      return calendar.calendars();
    case "events":
      return calendar.events(...call.args);
    case "createEvent":
      return calendar.createEvent(...call.args);
    case "updateEvent":
      return calendar.updateEvent(...call.args);
    case "deleteEvent":
      return calendar.deleteEvent(...call.args);
  }
});

// The window's theme setting. Electron re-evaluates `prefers-color-scheme` from this.
handle(channels.theme, (theme: Theme) => {
  nativeTheme.themeSource = theme;
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    show: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c1b1a" : "#fbfaf9",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
    },
  });
  window.once("ready-to-show", () => window.show());
  // The window only ever shows Cal; web links open in the browser instead.
  const openOutside = (url: string) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  const stayInApp = (details: { url: string; preventDefault(): void }) => {
    if (isAppUrl(details.url)) return;
    details.preventDefault();
    openOutside(details.url);
  };
  window.webContents.on("will-navigate", stayInApp);
  window.webContents.on("will-redirect", stayInApp);
  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void window.loadFile(rendererFile);
  return window;
}

// Menu items that run a window command (see the renderer's command registry).
const command = (label: string, id: string, accelerator?: string): MenuItemConstructorOptions => ({
  label,
  accelerator,
  click: (_item, window) => {
    if (window instanceof BrowserWindow) window.webContents.send("cal:command", id);
  },
});

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      role: "appMenu",
      submenu: [
        { role: "about" },
        { type: "separator" },
        command("Settings…", "settings.open", "CmdOrCtrl+,"),
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        command("New To-Do", "task.new", "CmdOrCtrl+N"),
        command("Quick Entry", "task.quickEntry", "CmdOrCtrl+Shift+N"),
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        command("Undo", "edit.undo", "CmdOrCtrl+Z"),
        command("Redo", "edit.redo", "CmdOrCtrl+Shift+Z"),
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        command("Command Menu", "palette.open", "CmdOrCtrl+K"),
        command("Toggle Sidebar", "view.sidebar", "CmdOrCtrl+\\"),
        command("Toggle To-Do List", "view.tasks", "CmdOrCtrl+/"),
        { type: "separator" },
        command("Zoom Hours In", "grid.zoomIn", "CmdOrCtrl+Shift+."),
        command("Zoom Hours Out", "grid.zoomOut", "CmdOrCtrl+Shift+,"),
        command("Default Hour Height", "grid.zoomReset", "CmdOrCtrl+Shift+0"),
        { type: "separator" },
        command("Travel to Time Zone…", "zone.travel"),
        command("Add Time Zone…", "zone.add"),
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  if (!fixture) session.init();
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  calkit.stop();
  void session.close();
});
