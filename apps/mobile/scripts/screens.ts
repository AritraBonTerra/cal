/*
 * Captures the iPhone app in fixture mode for design review: starts Metro, opens each
 * route from scenes below on the "Cal iPhone" simulator (light and dark), and writes
 * PNGs to artifacts/screens/ios-<name>.png. Usage: `bun run screens [name...]`.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Each scene is an expo-router path, opened by deep link.
const scenes: { name: string; path: string; dark?: boolean }[] = [
  { name: "home", path: "/" },
  { name: "home-dark", path: "/", dark: true },
];

const root = join(import.meta.dir, "..");
const outDir = join(root, "../../artifacts/screens");
mkdirSync(outDir, { recursive: true });

const text = (command: string[]) => new TextDecoder().decode(Bun.spawnSync(command).stdout).trim();
const udid = text(["xcrun", "simctl", "list", "devices", "available"])
  .split("\n")
  .find((line) => line.includes("Cal iPhone"))
  ?.match(/\(([0-9A-F-]{36})\)/)?.[1];
if (!udid) throw new Error('Create a simulator named "Cal iPhone" first');
Bun.spawnSync(["xcrun", "simctl", "boot", udid]);

const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
const metro = Bun.spawn(["bunx", "expo", "start", "--port", "8081"], {
  cwd: root,
  env: { ...env, CI: "1", EXPO_PUBLIC_CAL_FIXTURE: "1" },
  stdout: "pipe",
  stderr: "pipe",
});
const log: string[] = [];
const reader = (async () => {
  for await (const chunk of metro.stdout) log.push(new TextDecoder().decode(chunk));
})();

async function until(check: () => boolean, ms: number) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`Timed out. Metro said:\n${log.join("")}`);
    await Bun.sleep(250);
  }
}

await until(() => log.join("").includes("Waiting on http://localhost:8081"), 120_000);
const wanted = process.argv.slice(2);
for (const scene of scenes.filter((each) => !wanted.length || wanted.includes(each.name))) {
  Bun.spawnSync(["xcrun", "simctl", "ui", udid, "appearance", scene.dark ? "dark" : "light"]);
  Bun.spawnSync(["xcrun", "simctl", "terminate", udid, "host.exp.Exponent"]);
  const bundles = log.join("").split("Bundled").length;
  const url = `exp://127.0.0.1:8081/--${scene.path}?__expo_disable_fab=1&__expo_disable_onboarding=1`;
  Bun.spawnSync(["xcrun", "simctl", "openurl", udid, url]);
  await until(() => log.join("").split("Bundled").length > bundles, 180_000).catch(() => undefined);
  await Bun.sleep(4_000);
  const path = join(outDir, `ios-${scene.name}.png`);
  Bun.spawnSync(["xcrun", "simctl", "io", udid, "screenshot", path]);
  console.log(path);
}

Bun.spawnSync(["xcrun", "simctl", "ui", udid, "appearance", "light"]);
metro.kill();
await reader.catch(() => undefined);
process.exit(0);
