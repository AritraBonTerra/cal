/*
 * Captures every scene in scenes.ts to `artifacts/screens/<name>.png` from a fixture
 * build of the app. Usage: `bun run screenshots [name...]` (all scenes by default).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { _electron as electron } from "playwright";
import { scenes } from "./scenes";

const root = join(import.meta.dir, "..");
const outDir = join(root, "../../artifacts/screens");
mkdirSync(outDir, { recursive: true });

// Electron must not run as plain Node (T3 Code's terminal sets ELECTRON_RUN_AS_NODE).
const { ELECTRON_RUN_AS_NODE, ...env } = process.env;

const build = Bun.spawnSync(["bunx", "electron-vite", "build"], {
  cwd: root,
  env,
  stdout: "ignore",
  stderr: "inherit",
});
if (build.exitCode !== 0) process.exit(build.exitCode);

const wanted = process.argv.slice(2);
for (const scene of scenes.filter((each) => !wanted.length || wanted.includes(each.name))) {
  const app = await electron.launch({
    args: ["."],
    cwd: root,
    env: { ...env, CAL_FIXTURE: "1" },
  });
  const page = await app.firstWindow();
  await app.evaluate(
    ({ BrowserWindow }, size) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(size.width, size.height),
    { width: scene.width ?? 1440, height: scene.height ?? 900 },
  );
  await page.emulateMedia({ colorScheme: scene.dark ? "dark" : "light", reducedMotion: "reduce" });
  await page.waitForSelector("[data-ready]", { timeout: 15_000 });
  if (scene.settings) {
    await page.evaluate((settings) => window.calTest?.seed(settings), scene.settings);
    await page.waitForTimeout(200);
  }
  for (const key of scene.keys ?? []) {
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }
  if (scene.text) await page.keyboard.type(scene.text, { delay: 10 });
  for (const key of scene.after ?? []) {
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }
  if (scene.click) await page.click(scene.click);
  for (const step of scene.steps ?? []) {
    if ("press" in step) await page.keyboard.press(step.press);
    else if ("type" in step) await page.keyboard.type(step.type, { delay: 10 });
    else if ("click" in step) await page.click(step.click);
    else await page.waitForTimeout(step.wait);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
  const path = join(outDir, `${scene.name}.png`);
  await page.screenshot({ path });
  console.log(path);
  await app.close();
}
