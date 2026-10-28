/*
 * Gets the dev Electron app ready to read calendars: builds `calkit` and adds the
 * calendar usage descriptions to node_modules' Electron.app, since macOS asks for
 * calendar access on behalf of the app that starts the helper. Safe to run repeatedly.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const root = join(import.meta.dir, "..");
const run = (command: string[]) => {
  const result = Bun.spawnSync(command, { cwd: root, stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`${command.join(" ")} failed`);
};

run(["swift", "build", "-c", "release", "--package-path", "native/calkit"]);

const electron = dirname(createRequire(join(root, "package.json")).resolve("electron"));
const plist = join(electron, "dist/Electron.app/Contents/Info.plist");
if (!existsSync(plist)) throw new Error(`No Electron.app at ${plist}`);

const usage = "Cal shows and edits the events in your calendars.";
for (const key of ["NSCalendarsFullAccessUsageDescription", "NSCalendarsUsageDescription"]) {
  const has =
    Bun.spawnSync(["/usr/libexec/PlistBuddy", "-c", `Print :${key}`, plist]).exitCode === 0;
  if (!has) run(["/usr/libexec/PlistBuddy", "-c", `Add :${key} string ${usage}`, plist]);
}
