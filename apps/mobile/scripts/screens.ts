/*
 * Captures the app in fixture mode for design review: starts Metro, opens each route
 * from `scenes` below by deep link on the "Cal iPhone" or "Cal iPad" simulator (light
 * or dark), and writes PNGs to artifacts/screens/ios-<name>.png.
 * Usage: `bun run screens [name...]`.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

type Device = "iPhone" | "iPad";

// Each scene is an expo-router path, opened by deep link. Sheets are routes too, so a
// scene can show the state after a tap (a task's sheet, Quick Entry with text typed).
const scenes: { name: string; path: string; dark?: boolean; device?: Device }[] = [
  { name: "calendar-day", path: "/?days=1" },
  { name: "calendar-day-dark", path: "/?days=1", dark: true },
  { name: "calendar-3day", path: "/?days=3" },
  { name: "calendar-3day-dark", path: "/?days=3", dark: true },
  { name: "today", path: "/today" },
  { name: "lists", path: "/lists" },
  { name: "task", path: "/task/by-title?title=Write%20launch%20spec" },
  { name: "task-when", path: "/task/by-title?title=Write%20launch%20spec&section=when" },
  { name: "block", path: "/block/by-title?title=Write%20launch%20spec" },
  { name: "new-block", path: "/new-block?day=2026-10-28&start=600&end=630" },
  {
    name: "event",
    path: "/event/fixture-9?title=All%20Hands&start=2026-10-28T16:00:00-07:00&end=2026-10-28T17:00:00-07:00&allDay=0&location=Zoom&calendar=Work&color=3b82f6",
  },
  {
    name: "quick-entry",
    path: "/quick-entry?text=Call%20the%20movers%20tomorrow%203pm%20~30m%20!fri%20%2Flaunch",
  },
  { name: "habits", path: "/habits" },
  { name: "habits-dark", path: "/habits", dark: true },
  { name: "sign-in", path: "/sign-in" },
  // Workspace reads `?sidebar=1|0` on any route; portrait hides the sidebar by default.
  { name: "ipad", path: "/?days=7&sidebar=0", device: "iPad" },
  { name: "ipad-dark", path: "/?days=7&sidebar=0", device: "iPad", dark: true },
  { name: "ipad-sidebar", path: "/?days=7&sidebar=1", device: "iPad" },
  { name: "ipad-3day", path: "/?days=3&sidebar=1", device: "iPad" },
  { name: "ipad-habits", path: "/habits?sidebar=1", device: "iPad" },
];

const root = join(import.meta.dir, "..");
const outDir = join(root, "../../artifacts/screens");
mkdirSync(outDir, { recursive: true });

const run = (command: string[]) => Bun.spawnSync(command);
const text = (command: string[]) => new TextDecoder().decode(run(command).stdout).trim();

const EXPO_GO = "host.exp.Exponent";

/*
 * The simulator named "Cal <device>", booted, with Expo Go installed (copied from
 * another simulator that has it when needed) and allowed to open exp:// links
 * without the "Open in Expo Go?" prompt.
 */
function simulator(device: Device) {
  const udid = text(["xcrun", "simctl", "list", "devices", "available"])
    .split("\n")
    .find((line) => line.includes(`Cal ${device}`))
    ?.match(/\(([0-9A-F-]{36})\)/)?.[1];
  if (!udid) throw new Error(`Create a simulator named "Cal ${device}" first`);
  // Approve the exp:// scheme for Expo Go the way Expo CLI does, so no "Open in Expo
  // Go?" prompt appears. The simulator only reads the approval at boot.
  const domain = "com.apple.launchservices.schemeapproval";
  const key = "com.apple.CoreSimulator.CoreSimulatorBridge-->exp";
  run(["xcrun", "simctl", "boot", udid]);
  run(["xcrun", "simctl", "bootstatus", udid, "-b"]);
  if (!text(["xcrun", "simctl", "spawn", udid, "defaults", "read", domain]).includes(key)) {
    run(["xcrun", "simctl", "spawn", udid, "defaults", "write", domain, key, "-string", EXPO_GO]);
    run(["xcrun", "simctl", "shutdown", udid]);
  }
  run(["xcrun", "simctl", "boot", udid]);
  run(["xcrun", "simctl", "bootstatus", udid]);
  if (run(["xcrun", "simctl", "get_app_container", udid, EXPO_GO]).exitCode !== 0) {
    const other = simulator(device === "iPad" ? "iPhone" : "iPad");
    const app = text(["xcrun", "simctl", "get_app_container", other, EXPO_GO]);
    if (!app) throw new Error(`Install Expo Go on "Cal ${device}" first (press i in expo start)`);
    run(["xcrun", "simctl", "install", udid, app]);
  }
  return udid;
}

/*
 * A Metro left on port 8081 by an interrupted run (killing `bunx` leaves its node child
 * behind) would make Expo refuse to start, so a stale `expo start` of this project is
 * stopped first. Anything else on the port is someone's: say so and stop.
 */
for (const pid of text(["lsof", "-ti", "tcp:8081", "-sTCP:LISTEN"]).split("\n").filter(Boolean)) {
  const command = text(["ps", "-o", "command=", "-p", pid]);
  if (!command.includes("expo start")) {
    throw new Error(`Port 8081 is in use by pid ${pid} (${command}). Stop it and run again.`);
  }
  run(["kill", pid]);
}

const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
const metro = Bun.spawn(["bunx", "expo", "start", "--port", "8081"], {
  cwd: root,
  env: { ...env, CI: "1", EXPO_PUBLIC_CAL_FIXTURE: "1" },
  stdout: "pipe",
  stderr: "pipe",
});
const log: string[] = [];
const reader = Promise.all(
  [metro.stdout, metro.stderr].map(async (stream) => {
    for await (const chunk of stream) log.push(new TextDecoder().decode(chunk));
  }),
);

async function until(check: () => boolean, ms: number) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`Timed out. Metro said:\n${log.join("")}`);
    await Bun.sleep(250);
  }
}

await until(() => log.join("").includes("Waiting on http://localhost:8081"), 120_000);
const wanted = process.argv.slice(2);
const udids = new Map<Device, string>();
for (const scene of scenes.filter((each) => !wanted.length || wanted.includes(each.name))) {
  const device = scene.device ?? "iPhone";
  const udid = udids.get(device) ?? simulator(device);
  udids.set(device, udid);
  run(["xcrun", "simctl", "ui", udid, "appearance", scene.dark ? "dark" : "light"]);
  run(["xcrun", "simctl", "terminate", udid, EXPO_GO]);
  const bundles = log.join("").split("Bundled").length;
  const url = `exp://127.0.0.1:8081/--${scene.path}${scene.path.includes("?") ? "&" : "?"}__expo_disable_fab=1&__expo_disable_onboarding=1`;
  // Expo Go is launched first: a URL opened into a running app never shows the system
  // "Open in Expo Go?" prompt, which would leave the home screen in the screenshot.
  // That first open loads the project and lands on "/" (a cold Expo Go drops the
  // path). Once the app runs, opening the URL again reaches expo-router as a link
  // event, which navigates to the scene's route.
  run(["xcrun", "simctl", "launch", udid, EXPO_GO]);
  await Bun.sleep(1_500);
  run(["xcrun", "simctl", "openurl", udid, url]);
  await until(() => log.join("").split("Bundled").length > bundles, 180_000).catch(() => undefined);
  await Bun.sleep(2_500);
  run(["xcrun", "simctl", "openurl", udid, url]);
  await Bun.sleep(3_000);
  const path = join(outDir, `ios-${scene.name}.png`);
  run(["xcrun", "simctl", "io", udid, "screenshot", path]);
  console.log(path);
}

for (const udid of udids.values()) run(["xcrun", "simctl", "ui", udid, "appearance", "light"]);
// Stop Metro and its node child, which outlives a plain kill of `bunx`.
run(["pkill", "-P", String(metro.pid)]);
metro.kill();
await reader.catch(() => undefined);
// Metro's output (bundling errors, Uniwind warnings) for debugging a bad capture.
await Bun.write(join(outDir, "metro.log"), log.join(""));
process.exit(0);
