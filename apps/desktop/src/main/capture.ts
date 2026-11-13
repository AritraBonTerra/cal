import { BrowserWindow, globalShortcut, nativeTheme, screen, type WebContents } from "electron";
import { channels } from "../shared/api";
import { accelerator } from "./accelerator";

/*
 * Quick Entry from any app. A floating panel, kept hidden between uses, shows on a
 * global hotkey over whatever app (or full-screen Space) has focus. It is an NSPanel
 * that doesn't activate Cal, so typing goes to the panel while the other app stays
 * frontmost, and hiding the panel hands focus straight back to it. It's made on first
 * use, or ahead of time with `warm` so the first press is instant too.
 */

// The panel's width before it reports its own size, in points.
const WIDTH = 640;
// How far down the screen the panel's top edge sits, like Spotlight.
const TOP = 0.22;

export interface CaptureOptions {
  // Loads the renderer into the panel with ?surface=capture.
  load(window: BrowserWindow): void;
  preload: string;
  // Whether the app is quitting, when the panel may really close.
  quitting(): boolean;
  // Makes a closing window wait for its page to finish saving; added after the panel's
  // own close handler, which turns down every close but a quit's.
  hold(window: BrowserWindow): void;
}

export function createCapture({ load, preload, quitting, hold }: CaptureOptions) {
  let panel: BrowserWindow | undefined;
  // The binding registered system-wide, so a new report only re-registers on a change.
  let registered: string | undefined;

  const hide = () => {
    if (!panel?.isVisible()) return;
    panel.hide();
    panel.webContents.send(channels.captureReset);
  };

  const make = () => {
    const window = new BrowserWindow({
      type: "panel",
      width: WIDTH,
      height: 120,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#262524" : "#ffffff",
      webPreferences: { preload, sandbox: true, contextIsolation: true },
    });
    window.setAlwaysOnTop(true, "floating");
    // On the current Space, including over full-screen apps. skipTransformProcessType
    // keeps the Dock icon from flickering when this is set.
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    // A click in another app dismisses it, as with Spotlight.
    window.on("blur", hide);
    // ⌘W hides rather than destroys it; only quitting closes it.
    window.on("close", (event) => {
      if (quitting()) return;
      event.preventDefault();
      hide();
    });
    hold(window);
    load(window);
    return window;
  };

  const warm = () => {
    panel ??= make();
    return panel;
  };

  const show = () => {
    const window = warm();
    // On the screen with the pointer, centred, near the top.
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const [width = WIDTH] = window.getContentSize();
    window.setPosition(
      Math.round(workArea.x + (workArea.width - width) / 2),
      Math.round(workArea.y + workArea.height * TOP),
    );
    window.show();
    window.focus();
  };

  const toggle = () => (panel?.isVisible() ? hide() : show());

  return {
    warm,
    show,
    hide,
    toggle,

    // Whether `contents` is the panel's page.
    owns: (contents: WebContents) => panel !== undefined && panel.webContents === contents,

    // Fits the window to its content, keeping the top edge where it is.
    setSize(width: number, height: number) {
      if (!panel || !Number.isFinite(width) || !Number.isFinite(height)) return;
      panel.setContentSize(Math.max(200, Math.round(width)), Math.max(40, Math.round(height)));
    },

    /**
     * Registers the first of `keys` that Electron can take as the global hotkey, or none
     * when `keys` is null (a shortcut is being recorded, so the key must reach the
     * recorder). Returns the binding when another app already holds it.
     */
    bind(keys: readonly string[] | null): string | undefined {
      const binding = keys?.find((key) => accelerator(key) !== undefined);
      if (binding === registered) return undefined;
      if (registered) globalShortcut.unregister(accelerator(registered) ?? "");
      registered = undefined;
      const key = binding && accelerator(binding);
      if (!binding || !key) return undefined;
      if (!globalShortcut.register(key, toggle)) return binding;
      registered = binding;
      return undefined;
    },
  };
}
