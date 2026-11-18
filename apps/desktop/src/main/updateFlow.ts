import type { UpdateState } from "../shared/api";

// The parts of electron-updater's AppUpdater the flow drives (narrowed so tests can fake it).
export interface Updater {
  checkForUpdates(): Promise<{
    isUpdateAvailable: boolean;
    updateInfo: { version: string };
  } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface UpdateFlowOptions {
  // The running app's version, shown when a check finds nothing newer.
  current: string;
  // Called with every new state, for the windows to show.
  publish(state: UpdateState): void;
  // Closes every window (each saves first) before quitAndInstall; rejects if one won't. With none open,
  // Electron installs straight away instead of closing them itself, which would leave
  // a window-list observer that re-runs the install whenever the windows next close.
  closeWindows(): Promise<void>;
  // The install failed after closeWindows, so the app carries on: show it again.
  installFailed(): void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The update prompt's state machine: check → ask → download → quit and relaunch.
 * Nothing downloads until the user says Install. Background checks only ever
 * surface an available update; checks the user asks for also report "checking",
 * "up to date" and failures. updater.ts wires it to electron-updater and IPC.
 */
export function createUpdateFlow(
  updater: Updater,
  { current, publish, closeWindows, installFailed }: UpdateFlowOptions,
) {
  let state: UpdateState = { status: "idle" };
  // The version the user said Later to; background checks don't offer it again.
  let dismissed: string | undefined;
  // Counts checks and dismissals. A check's answer counts only if nothing has bumped it
  // since, so a closed prompt or a newer check (which shares electron-updater's
  // in-flight request) drops the older answer.
  let generation = 0;

  // The status now. Read through a call after an await: TypeScript keeps a narrowing
  // of `state` across it, though `set` may have run meanwhile.
  const status = () => state.status;
  const set = (next: UpdateState) => {
    state = next;
    publish(next);
  };

  // Looks for a newer release. `manual` is a check the user asked for.
  async function check(manual: boolean) {
    const before = state.status;
    if (before === "checking" || before === "downloading" || before === "installing") return;
    // A background check never replaces something on screen.
    if (!manual && before !== "idle") return;
    const id = ++generation;
    if (manual) set({ status: "checking" });
    try {
      const result = await updater.checkForUpdates();
      if (id !== generation) return;
      const version = result?.isUpdateAvailable ? result.updateInfo.version : undefined;
      if (version && (manual || version !== dismissed)) {
        set({ status: "available", version, current });
      } else if (manual) {
        set({ status: "current", version: current });
      }
    } catch (error) {
      if (manual && id === generation) set({ status: "failed", message: messageOf(error) });
    }
  }

  // Downloads the offered update, then quits and relaunches into it.
  async function install() {
    if (state.status !== "available" && !(state.status === "failed" && state.version)) return;
    const { version } = state;
    if (!version) return;
    set({ status: "downloading", version, percent: 0 });
    try {
      await updater.downloadUpdate();
    } catch (error) {
      if (status() === "downloading") set({ status: "failed", version, message: messageOf(error) });
      return;
    }
    // An error event may have already failed it.
    if (status() !== "downloading") return;
    set({ status: "installing", version });
    try {
      await closeWindows();
      // An error event may have failed it while the windows closed.
      if (status() !== "installing") return;
      updater.quitAndInstall();
    } catch (error) {
      fail(error);
    }
  }

  // Closes the prompt. Downloading and installing can't be dismissed.
  function dismiss() {
    if (state.status === "downloading" || state.status === "installing") return;
    generation++;
    if (state.status === "available") dismissed = state.version;
    if (state.status !== "idle") set({ status: "idle" });
  }

  // The download's progress, 0–100; republished only when the whole percent changes.
  function progress(percent: number) {
    if (state.status !== "downloading") return;
    const rounded = Math.min(100, Math.max(0, Math.floor(percent)));
    if (rounded !== state.percent) set({ ...state, percent: rounded });
  }

  // The updater's error event: fails a download or install under way. Errors from
  // background checks stay quiet; the next check tries again.
  function fail(error: unknown) {
    if (state.status !== "downloading" && state.status !== "installing") return;
    if (state.status === "installing") installFailed();
    set({ status: "failed", version: state.version, message: messageOf(error) });
  }

  return { state: () => state, check, install, dismiss, progress, fail };
}
