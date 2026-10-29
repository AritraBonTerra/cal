import { app, dialog, Notification } from "electron";
import electronUpdater from "electron-updater";

/*
 * Updates from the repo's GitHub Releases, which CI publishes on every merge to main
 * (see .github/workflows/release.yml and the `publish` block in electron-builder.yml).
 * A packaged app checks at launch and every few hours, downloads in the background,
 * and installs on quit; a notification offers to restart sooner. Dev builds skip it.
 */

const { autoUpdater } = electronUpdater;
const EVERY = 4 * 60 * 60 * 1000;

// Starts background update checks for a packaged build.
export function startUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-downloaded", ({ version }) => {
    const note = new Notification({
      title: `Cal ${version} is ready`,
      body: "Click to restart now, or it installs the next time you quit.",
    });
    note.on("click", () => autoUpdater.quitAndInstall());
    note.show();
  });
  // Offline or a failed check: try again at the next interval.
  autoUpdater.on("error", () => {});
  const check = () => void autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, EVERY);
}

// The menu's "Check for Updates…": says what it found instead of staying quiet.
export async function checkNow() {
  if (!app.isPackaged) {
    await dialog.showMessageBox({ message: "Updates are only checked in the installed app." });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    const latest = result?.updateInfo.version;
    if (!result?.isUpdateAvailable || !latest) {
      await dialog.showMessageBox({ message: `Cal ${app.getVersion()} is the latest version.` });
      return;
    }
    await dialog.showMessageBox({
      message: `Downloading Cal ${latest}…`,
      detail: "You'll get a notification when it's ready to install.",
    });
  } catch (error) {
    await dialog.showMessageBox({
      type: "warning",
      message: "Couldn't check for updates.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
