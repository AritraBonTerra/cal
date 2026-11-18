import { app, dialog, autoUpdater as squirrel } from "electron";
import electronUpdater from "electron-updater";
import type { UpdateState } from "../shared/api";
import { createUpdateFlow } from "./updateFlow";

/*
 * Updates from the repo's GitHub Releases, which CI publishes on every merge to main
 * (see .github/workflows/release.yml and the `publish` block in electron-builder.yml).
 * A packaged app checks at launch and every few hours. When it finds a newer release
 * the window asks whether to install it (updateFlow.ts); Install downloads it, then
 * quits and relaunches into it. Dev builds never check, unless CAL_FAKE_UPDATE=<version>
 * stands in a pretend release to try the prompt against.
 *
 * Nightlies (branch builds, versioned like 0.1.13-nightly.15) are never published,
 * so every install follows stable releases only. electron-updater would otherwise
 * read a prerelease version as a "nightly" channel and find nothing to follow.
 */

const { autoUpdater } = electronUpdater;
const EVERY = 4 * 60 * 60 * 1000;

export interface UpdatesOptions {
  // Sends each new state to the windows.
  publish(state: UpdateState): void;
  // Shows the main window, making one if none is open, so a check's answer is seen.
  reveal(): void;
  // See UpdateFlowOptions.
  closeWindows(): Promise<void>;
  installFailed(): void;
}

/**
 * The app's updates: `start` begins background checks once the app is ready; the
 * rest is what IPC and the menu call. In development nothing checks, and `check`
 * explains that updates need the installed app.
 */
export function createUpdates({ reveal, ...hooks }: UpdatesOptions) {
  const fake = process.env.CAL_FAKE_UPDATE;
  const flow = app.isPackaged ? packagedFlow(hooks) : fake ? fakeFlow(fake, hooks) : undefined;
  return {
    start() {
      if (!flow) return;
      void flow.check(false);
      setInterval(() => void flow.check(false), EVERY);
    },
    state: (): UpdateState => flow?.state() ?? { status: "idle" },
    // The menu's "Check for Updates…" and Settings > About.
    async check() {
      reveal();
      if (flow) return flow.check(true);
      await dialog.showMessageBox({ message: "Updates are only checked in the installed app." });
    },
    install: () => flow?.install(),
    dismiss: () => flow?.dismiss(),
  };
}

// The update flow over electron-updater, for the installed app.
function packagedFlow(hooks: Omit<UpdatesOptions, "reveal">) {
  autoUpdater.allowPrerelease = false;
  // Nothing downloads until the user says Install.
  autoUpdater.autoDownload = false;
  // On macOS this also hands the download to Squirrel.Mac as soon as it lands, which
  // quitAndInstall needs; an update downloaded but not yet installed goes in at quit.
  autoUpdater.autoInstallOnAppQuit = true;
  const flow = createUpdateFlow(
    {
      checkForUpdates: () => autoUpdater.checkForUpdates(),
      downloadUpdate: downloadAndStage,
      quitAndInstall: () => autoUpdater.quitAndInstall(),
    },
    { current: app.getVersion(), ...hooks },
  );
  autoUpdater.on("download-progress", ({ percent }) => flow.progress(percent));
  autoUpdater.on("error", (error) => flow.fail(error));
  return flow;
}

/**
 * Downloads the update and waits for Squirrel.Mac to stage it. electron-updater's
 * download resolves once Squirrel has fetched the zip from its local proxy, before it
 * has checked and unpacked it; quitAndInstall called in that gap leaves a restart
 * listener behind that a failed staging never removes. Waiting for Electron's own
 * `update-downloaded` means quitAndInstall runs once, on an update that's ready.
 */
async function downloadAndStage() {
  let stop = () => {};
  const staged = new Promise<void>((resolve, reject) => {
    const done = () => resolve();
    stop = () => {
      squirrel.off("update-downloaded", done);
      squirrel.off("error", reject);
    };
    squirrel.once("update-downloaded", done);
    squirrel.once("error", reject);
  });
  try {
    await Promise.all([autoUpdater.downloadUpdate(), staged]);
  } finally {
    stop();
  }
}

// A pretend release for development: found after a moment, downloaded over a few
// seconds, and "installed" by closing the windows, then failing, since a dev build
// can't relaunch into it.
function fakeFlow(version: string, hooks: Omit<UpdatesOptions, "reveal">) {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const flow = createUpdateFlow(
    {
      checkForUpdates: async () => {
        await wait(800);
        return { isUpdateAvailable: true, updateInfo: { version } };
      },
      downloadUpdate: async () => {
        for (let percent = 0; percent <= 100; percent += 4) {
          flow.progress(percent);
          await wait(120);
        }
      },
      quitAndInstall: () => {
        setTimeout(() => flow.fail(new Error("Pretend update: nothing to install.")), 1500);
      },
    },
    { current: app.getVersion(), ...hooks },
  );
  return flow;
}
