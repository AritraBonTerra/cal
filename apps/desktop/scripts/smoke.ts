/*
 * Drives the fixture app through the grid's pointer and keyboard interactions and
 * prints PASS/FAIL per check. Usage: `bun run smoke` (after `bun run build`).
 */
import { _electron as electron } from "playwright";

const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
const app = await electron.launch({
  args: ["."],
  cwd: `${import.meta.dir}/..`,
  env: { ...env, CAL_FIXTURE: "1" },
});
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
);
await page.waitForSelector("[data-ready]", { timeout: 15_000 });
page.on("console", (m) => {
  if (m.type() === "error") console.log("console error:", m.text());
});
page.on("pageerror", (e) => console.log("pageerror:", e.message));

const blocks = () => page.locator("[data-item^='block:']").count();
const boxOf = async (locator: ReturnType<typeof page.locator>) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return box;
};
const col = (day: string) => boxOf(page.locator(`[data-column='${day}']`));
const results: string[] = [];
const check = (name: string, ok: boolean) => {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}`);
  console.log(results.at(-1));
};

// 1. drag to create on Thu 15:00-16:00
let before = await blocks();
let c = await col("2026-10-29");
const body = await page
  .locator("[data-column]")
  .first()
  .evaluate((el) => {
    const parent = el.parentElement;
    if (!parent) throw new Error("no grid body");
    return { top: parent.getBoundingClientRect().top, scrollTop: parent.scrollTop };
  });
const y = (minute: number) => body.top + (minute / 60) * 48 - body.scrollTop;
await page.mouse.move(c.x + c.width / 2, y(15 * 60));
await page.mouse.down();
await page.mouse.move(c.x + c.width / 2, y(15 * 60 + 30), { steps: 4 });
await page.mouse.move(c.x + c.width / 2, y(16 * 60), { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(100);
await page.keyboard.type("Smoke block");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
check("drag to create makes a block", (await blocks()) === before + 1);
const created = page.locator("[data-item^='block:'] > div", { hasText: "Smoke block" });
check("created block shows 3–4 PM", (await created.textContent())?.includes("3–4 PM") ?? false);

// 2. move it down two hours
let box = await boxOf(created);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 48, { steps: 5 });
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 96, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
check("move block to 5–6 PM", (await created.textContent())?.includes("5–6 PM") ?? false);

// 3. resize from the bottom edge by 30 min
box = await boxOf(created);
await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height + 24, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
check("resize block to 5–6:30 PM", (await created.textContent())?.includes("5–6:30 PM") ?? false);

// 3b. Escape mid-move cancels without writing
box = await boxOf(created);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 48, { steps: 5 });
await page.keyboard.press("Escape");
await page.mouse.up();
await page.waitForTimeout(300);
check("Escape cancels a block move", (await created.textContent())?.includes("5–6:30 PM") ?? false);

// 4. select and delete with Backspace
await created.click();
await page.keyboard.press("Backspace");
await page.waitForTimeout(300);
check("Backspace removes selected block", (await blocks()) === before);

// 5. undo brings it back
await page.keyboard.press("Meta+z");
await page.waitForTimeout(300);
check("⌘Z restores the block", (await blocks()) === before + 1);

// 6. drag a task row onto Fri 13:00; first with Escape, which must not schedule
before = await blocks();
const row = page.locator("li", { hasText: "Review Sam's PR" }).first();
const rb = await boxOf(row);
c = await col("2026-10-30");
await page.mouse.move(rb.x + 100, rb.y + 10);
await page.mouse.down();
await page.mouse.move(rb.x + 120, rb.y + 20, { steps: 3 });
await page.mouse.move(c.x + c.width / 2, y(13 * 60), { steps: 8 });
await page.keyboard.press("Escape");
await page.mouse.up();
await page.waitForTimeout(300);
check("Escape cancels a task drag", (await blocks()) === before);
await page.mouse.move(rb.x + 100, rb.y + 10);
await page.mouse.down();
await page.mouse.move(rb.x + 120, rb.y + 20, { steps: 3 });
await page.mouse.move(c.x + c.width / 2, y(13 * 60), { steps: 8 });
const ghost = await page.locator("text=Review Sam's PR").count();
await page.mouse.up();
await page.waitForTimeout(300);
check("task drag creates a block", (await blocks()) === before + 1 && ghost >= 2);
const dropped = page.locator("[data-item^='block:'] > div", { hasText: "Review Sam's PR" });
check(
  "dropped block is 45m at 1 PM",
  (await dropped.textContent())?.includes("1–1:45 PM") ?? false,
);
check(
  "row shows scheduled time",
  (await row.textContent())?.includes("45m of 45m scheduled") ?? false,
);

// 7. drag that block back onto the task pane
box = await boxOf(dropped);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x - 50, box.y, { steps: 5 });
await page.mouse.move(500, 500, { steps: 10 });
const removing = await page.locator("text=Remove from calendar").count();
await page.mouse.up();
await page.waitForTimeout(300);
check("drag block to pane removes it", (await blocks()) === before && removing === 1);

// 8. X schedules selected task into next free slot today
await row.click();
await page.keyboard.press("x");
await page.waitForTimeout(300);
check(
  "X schedules into next free slot",
  (await dropped.count()) === 1 && ((await dropped.textContent())?.includes("10:45") ?? false),
);

// 9. checkbox on block completes task
await dropped.locator("[role=checkbox]").click();
await page.waitForTimeout(300);
check(
  "block checkbox completes the task",
  (await page.locator("li", { hasText: "Review Sam's PR" }).count()) === 0,
);

// 10. habit toggle
const habit = page.locator("button[title^='Meditate']").nth(2);
await habit.click();
await page.waitForTimeout(200);
check("habit chip toggles", (await habit.getAttribute("aria-pressed")) === "true");

// 11. Quick entry creates a task with a block
before = await blocks();
await page.keyboard.press("Meta+Shift+n");
await page.keyboard.type("Water plants tomorrow 9am ~15m");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
check("quick entry adds a block", (await blocks()) === before + 1);

// 12. ⌘N creates and edits
await page.keyboard.press("Meta+n");
await page.waitForTimeout(200);
await page.keyboard.type("Typed task");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
check("⌘N new to-do", (await page.locator("li", { hasText: "Typed task" }).count()) === 1);

// 13. event move (writable calendar)
const retro = page.locator("[data-item^='event:'] > div", { hasText: "Retro" });
box = await boxOf(retro);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 48, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
check("device event moves", (await retro.textContent())?.includes("4–5 PM") ?? false);
await page.keyboard.press("Meta+z");
await page.waitForTimeout(400);
check("⌘Z moves the event back", (await retro.textContent())?.includes("3–4 PM") ?? false);
await page.keyboard.press("Meta+Shift+z");
await page.waitForTimeout(400);
check("⇧⌘Z moves it again", (await retro.textContent())?.includes("4–5 PM") ?? false);

// 13b. drag to create from Wed 19:00 to Thu 20:00 keeps the anchor day
before = await blocks();
const wed = await col("2026-10-28");
const thu = await col("2026-10-29");
await page.mouse.move(wed.x + wed.width / 2, y(19 * 60));
await page.mouse.down();
await page.mouse.move(wed.x + wed.width / 2, y(19 * 60 + 30), { steps: 4 });
await page.mouse.move(thu.x + thu.width / 2, y(20 * 60), { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(100);
await page.keyboard.type("Overnight");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const inColumn = (day: string) =>
  page.locator(`[data-column='${day}'] [data-item^='block:'] > div`, { hasText: "Overnight" });
check(
  "drag across days makes one block spanning both",
  (await blocks()) === before + 2 &&
    (await inColumn("2026-10-28").count()) === 1 &&
    (await inColumn("2026-10-29").count()) === 1,
);
check(
  "its label runs from the anchor day",
  (await inColumn("2026-10-28").textContent())?.includes("7–8 PM") ?? false,
);
// Only the next day in view: the block still shows there.
await page.keyboard.press("1");
await page.waitForTimeout(150);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(150);
check(
  "overnight block shows on the next day alone",
  (await page.locator("[data-column]").count()) === 1 &&
    (await inColumn("2026-10-29").count()) === 1,
);
await page.keyboard.press("m");
await page.waitForTimeout(200);
check(
  "month view continues it with its end time",
  (await page.locator("button", { hasText: "Overnight" }).filter({ hasText: "–8 PM" }).count()) ===
    1,
);
await page.keyboard.press("0");
await page.keyboard.press("t");
await page.waitForTimeout(200);
await inColumn("2026-10-28").click();
await page.keyboard.press("Backspace");
await page.waitForTimeout(300);
check("Backspace removes the overnight block", (await blocks()) === before);

// 14. nav keys and palette
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(100);
check("→ moves a week", (await page.locator("h1").textContent()) === "November 2026");
await page.keyboard.press("Meta+k");
await page.keyboard.type("14");
await page.keyboard.press("Enter");
await page.waitForTimeout(100);
check("palette shows 14 days", (await page.locator("[data-column]").count()) === 14);

// 15. X from another week still schedules around today's meetings
const spec = page.locator("li", { hasText: "Write launch spec" }).first();
await spec.click();
await page.keyboard.press("x");
await page.waitForTimeout(400);
await page.keyboard.press("t");
await page.waitForTimeout(200);
const specBlocks = page.locator("[data-item^='block:'] > div", { hasText: "Write launch spec" });
// A half-hour chip is too short for a time label, so check where it sits: 12:00 is 576px.
const tops = await specBlocks.evaluateAll((chips) =>
  chips.map((chip) => (chip instanceof HTMLElement ? chip.style.top : "")),
);
check("X from another week schedules after today's 1:1", tops.includes(`${12 * 48}px`));

// 16. a completed task leaves the list and loses its selection
const rent = page.locator("li", { hasText: "Pay rent" }).first();
await rent.click();
await page.keyboard.press(" ");
await page.waitForTimeout(300);
await page.keyboard.press(" ");
await page.waitForTimeout(300);
check(
  "Space on a hidden row does nothing",
  (await page.locator("li", { hasText: "Pay rent" }).count()) === 0,
);

// 17. switching lists drops the selection; ⌘N in Upcoming lands in Upcoming
await page.locator("li", { hasText: "Typed task" }).first().click();
await page.keyboard.press("Meta+3");
await page.waitForTimeout(200);
check("switching lists drops the selection", (await page.locator("[data-selected]").count()) === 0);
await page.keyboard.press("Meta+n");
await page.waitForTimeout(200);
await page.keyboard.type("Upcoming task");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
check(
  "⌘N in Upcoming shows the new to-do",
  (await page.locator("li", { hasText: "Upcoming task" }).count()) === 1 &&
    (await page.locator("h2", { hasText: "Upcoming" }).count()) === 1,
);

await app.close();
if (results.some((line) => line.startsWith("FAIL"))) process.exit(1);
