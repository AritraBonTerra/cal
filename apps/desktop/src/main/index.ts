import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { storeSource } from "@cal/app-core";
import { FIXTURE_NOW, FixtureCalendar, seedFixture } from "@cal/fixtures";
import { LocalStore, Session } from "@cal/sync";
import {
  app,
  BrowserWindow,
  globalShortcut,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  shell,
  type WebContents,
} from "electron";
import {
  type AuthCall,
  CAPTURE_COMMAND,
  type CalendarCall,
  channels,
  type DataCall,
  type MenuKeys,
  type Theme,
} from "../shared/api";
import { menuAccelerator } from "./accelerator";
import { createDesktopAuth, SCHEME } from "./auth";
import { Calkit } from "./calkit";
import { createCapture } from "./capture";
import { openDatabase } from "./db";
import { encryptedFile } from "./session";
import { checkNow, startUpdates } from "./updater";

// The dev deployment's public client URL; a build can point elsewhere with MAIN_VITE_CONVEX_URL.
const CONVEX_URL =
  import.meta.env.MAIN_VITE_CONVEX_URL ?? "https://charming-dachshund-581.convex.cloud";

// Fixture mode (CAL_FIXTURE=1) starts from the same seeded data and clock every launch,
// offline, for screenshots and design review. Each launch gets its own throwaway data
// directory in the system temp folder, emptied on quit, so several can run side by side.
const fixture = process.env.CAL_FIXTURE === "1";

// A second data directory (CAL_PROFILE=b) runs another "device" side by side for testing sync.
const profile = process.env.CAL_PROFILE;
if (fixture) app.setPath("userData", mkdtempSync(join(tmpdir(), "cal-fixture-")));
else if (profile) app.setPath("userData", `${app.getPath("userData")}-${profile}`);

const dataDir = app.getPath("userData");
mkdirSync(dataDir, { recursive: true });
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
  handleFrom(channel, (_event, ...args: A) => fn(...args));
}

// `handle` for handlers that need to know which window called.
function handleFrom<A extends unknown[], R>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: A) => R,
) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isAppUrl(event.senderFrame?.url ?? "")) throw new Error("Untrusted sender");
    return fn(event, ...(args as A));
  });
}

// Read synchronously by the preload script before the window's code runs.
ipcMain.on(channels.config, (event) => {
  event.returnValue = isAppUrl(event.senderFrame?.url ?? "")
    ? { fixture, now: fixture ? FIXTURE_NOW.getTime() : undefined, version: app.getVersion() }
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

// A write from one window (the capture panel, say) tells the others to reload events;
// the writer refreshes itself, and fixture calendars never report changes on their own.
async function written<T>(event: IpcMainInvokeEvent, write: Promise<T>) {
  const result = await write;
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.webContents !== event.sender) window.webContents.send(channels.calendarChanged);
  }
  return result;
}

handleFrom(channels.calendar, (event, call: CalendarCall) => {
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
      return written(event, calendar.createEvent(...call.args));
    case "updateEvent":
      return written(event, calendar.updateEvent(...call.args));
    case "deleteEvent":
      return written(event, calendar.deleteEvent(...call.args));
  }
});

// The window's theme setting. Electron re-evaluates `prefers-color-scheme` from this.
handle(channels.theme, (theme: Theme) => {
  nativeTheme.themeSource = theme;
});

// Interface size: the window zooms itself (preload); main keeps the traffic lights
// centred on its top band, 52px tall at 100%, as `trafficLightPosition` does at launch.
handleFrom(channels.scale, (event, percent: number) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || capture?.owns(event.sender)) return;
  if (typeof percent !== "number" || !(percent >= 50 && percent <= 300)) return;
  window.setWindowButtonPosition({ x: 16, y: Math.round(26 * (percent / 100) - 8) });
});

// Open at login: reads macOS's Login Items, and with `open` changes it first. A
// development build would register the bare Electron binary, so only the installed app
// can be a login item.
handle(channels.openAtLogin, (open?: boolean) => {
  if (!app.isPackaged || fixture) return false;
  if (typeof open === "boolean") app.setLoginItemSettings({ openAtLogin: open });
  return app.getLoginItemSettings().openAtLogin;
});

// Quick Entry from any app; made once the app is ready (see createCapture).
let capture: ReturnType<typeof createCapture> | undefined;

handle(channels.captureOpen, () => capture?.show());
handle(channels.captureHide, () => capture?.hide());
handleFrom(channels.captureSize, (event, width: number, height: number) => {
  if (capture?.owns(event.sender)) capture.setSize(width, height);
});

// Registers the capture command's keys system-wide. Fixture launches leave the key to
// the real app; scripts open the panel through `calCapture` instead.
function bindCaptureKey(keys: readonly string[] | null, reporter?: WebContents) {
  if (fixture || !capture) return;
  const taken = capture.bind(keys);
  if (taken) reporter?.send(channels.globalKeyTaken, taken);
}

// How long a closing window may take to save before it's closed anyway.
const CLOSE_WAIT_MS = 1500;
// Set once the app has been asked to quit, so a window that held its close resumes the quit.
let quitting = false;

/**
 * Makes `window` wait before closing: it's told it is closing, and closes once it
 * answers that what was open in it (a to-do card's text) has been saved. A page that
 * doesn't answer in time, or has crashed, is closed anyway. A close another handler has
 * already turned down (the capture panel hides instead) is left alone.
 */
function holdClose(window: BrowserWindow) {
  let state: "open" | "waiting" | "ready" = "open";
  window.on("close", (event) => {
    if (state === "open" && event.defaultPrevented) return;
    if (state === "ready" || window.webContents.isCrashed()) return;
    event.preventDefault();
    if (state === "waiting") return;
    state = "waiting";
    const proceed = () => {
      if (state === "ready") return;
      state = "ready";
      clearTimeout(timer);
      ipcMain.off(channels.closeReady, onReady);
      if (quitting) app.quit();
      else window.close();
    };
    const onReady = (reply: IpcMainEvent) => {
      if (reply.sender === window.webContents) proceed();
    };
    const timer = setTimeout(proceed, CLOSE_WAIT_MS);
    ipcMain.on(channels.closeReady, onReady);
    window.webContents.send(channels.closing);
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    show: false,
    titleBarStyle: "hiddenInset",
    // The lights' centre must sit on y = 26, the middle of the renderer's 52px top band,
    // with the pane toggles and the toolbar. Electron centres the 16px buttons in a
    // container 16 + 2·y tall, so y = 18 puts them there.
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c1b1a" : "#fbfaf9",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
    },
  });
  window.once("ready-to-show", () => window.show());
  holdClose(window);
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
  loadRenderer(window);
  return window;
}

// Loads the window's page; `surface` picks another root (the capture panel's).
function loadRenderer(window: BrowserWindow, surface?: string) {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void window.loadURL(surface ? `${dev}?surface=${surface}` : dev);
  else void window.loadFile(rendererFile, surface ? { query: { surface } } : undefined);
}

// Every window but the capture panel.
const mainWindows = () =>
  BrowserWindow.getAllWindows().filter((window) => !capture?.owns(window.webContents));

// The keys in effect for each command, as the window last reported them. A command the
// report leaves out (one its view isn't showing) has no menu shortcut until it's back.
let menuKeys = new Map<string, readonly string[]>();

// A null report means the window is recording a shortcut: until its next report every
// menu shortcut is ignored, Close and Quit included, so the keys pressed run nothing.
// The global Quick Entry key is paused the same way.
handleFrom(channels.menuKeys, (event, keys: MenuKeys | null) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.setIgnoreMenuShortcuts(keys === null);
  }
  if (keys === null) {
    bindCaptureKey(null);
    return;
  }
  menuKeys = new Map(
    Object.entries(keys).filter(
      ([, list]) => Array.isArray(list) && list.every((each) => typeof each === "string"),
    ),
  );
  bindCaptureKey(menuKeys.get(CAPTURE_COMMAND) ?? [], event.sender);
  buildMenu();
});

handle(channels.checkForUpdates, () => checkNow());

// Menu items that run a window command (see the renderer's command registry), with the
// command's first ⌘ or ⌃ binding as the accelerator.
const command = (label: string, id: string): MenuItemConstructorOptions => ({
  label,
  accelerator: menuAccelerator(menuKeys.get(id) ?? []),
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
        { label: "Check for Updates…", click: () => void checkNow() },
        { type: "separator" },
        command("Settings…", "settings.open"),
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
        command("New To-Do", "task.new"),
        command("Quick Entry", "task.quickEntry"),
        command("Quick Entry from Any App", CAPTURE_COMMAND),
        command("New Project", "project.new"),
        command("New Area", "area.new"),
        command("New Habit…", "habit.new"),
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        command("Undo", "edit.undo"),
        command("Redo", "edit.redo"),
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
        command("Command Menu", "palette.open"),
        command("Toggle Sidebar", "view.sidebar"),
        command("Toggle To-Do List", "view.tasks"),
        { type: "separator" },
        command("Zoom Hours In", "grid.zoomIn"),
        command("Zoom Hours Out", "grid.zoomOut"),
        command("Default Hour Height", "grid.zoomReset"),
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
  const window = createWindow();
  capture = createCapture({
    load: (panel) => loadRenderer(panel, "capture"),
    preload: join(import.meta.dirname, "../preload/index.cjs"),
    quitting: () => quitting,
    // A quit waits for the panel's save under way, as it does for the main window's.
    hold: holdClose,
  });
  // Ready before the first press. Fixture launches make it only when a script opens it
  // (`calCapture`), so the scripts' window 0 stays the main window.
  if (fixture) Object.assign(globalThis, { calCapture: capture });
  else window.once("ready-to-show", () => capture?.warm());
  startUpdates();
  app.on("activate", () => {
    if (mainWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// A window that is still saving cancels the quit and asks again when it's done, so this
// runs twice then; the helpers stop once.
app.on("before-quit", () => {
  if (quitting) return;
  quitting = true;
  void session.close();
});

// Every window has closed, so their saves are done: an event written just before ⌘Q
// still has calkit to reach EventKit through.
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  calkit.stop();
});

app.on("quit", () => {
  if (fixture) rmSync(dataDir, { recursive: true, force: true });
});
