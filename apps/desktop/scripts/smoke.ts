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
// The default hour height; the fit floor is lower than it at 1440×900.
const HOUR = 48;
const y = (minute: number) => body.top + (minute / 60) * HOUR - body.scrollTop;
await page.mouse.move(c.x + c.width / 2, y(15 * 60));
await page.mouse.down();
await page.mouse.move(c.x + c.width / 2, y(15 * 60 + 30), { steps: 4 });
await page.mouse.move(c.x + c.width / 2, y(16 * 60), { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(150);
// Drag-create opens the popover on an Event draft; ⌘2 switches it to a to-do.
check(
  "drag to create opens the popover",
  (await page.locator("[role=dialog][aria-label='New event']").count()) === 1,
);
await page.keyboard.press("Meta+2");
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
await page.waitForTimeout(150);
await page.keyboard.press("Meta+2");
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

// 13c. drag-create an event on Fri 18:00–19:00 and save it
const eventChips = () => page.locator("[data-item^='event:'] > div");
const eventsBefore = await eventChips().count();
// Clicks above may have scrolled the grid; `y()` assumes the opening scroll position.
await page.locator("[data-grid-body]").evaluate((element, top) => {
  element.scrollTop = top;
}, body.scrollTop);
const fri = await col("2026-10-30");
await page.mouse.move(fri.x + fri.width / 2, y(18 * 60));
await page.mouse.down();
await page.mouse.move(fri.x + fri.width / 2, y(18 * 60 + 30), { steps: 4 });
await page.mouse.move(fri.x + fri.width / 2, y(19 * 60), { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(150);
// The popover remembers the last kind used (To-do above), so pick Event.
await page.keyboard.press("Meta+1");
await page.keyboard.type("Smoke event");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const smokeEvent = page.locator("[data-item^='event:'] > div", { hasText: "Smoke event" });
check(
  "drag-create → Event saves a device event at 6–7 PM",
  (await eventChips().count()) === eventsBefore + 1 &&
    ((await smokeEvent.textContent())?.includes("6–7 PM") ?? false),
);

// 13d. click it, rename it, ⌘↩ saves
await smokeEvent.click();
await page.waitForTimeout(200);
check(
  "clicking an event opens the popover",
  (await page.locator("[role=dialog][aria-label='Event'] input[aria-label=Title]").inputValue()) ===
    "Smoke event",
);
await page.keyboard.press("Meta+a");
await page.keyboard.type("Renamed event");
await page.keyboard.press("Meta+Enter");
await page.waitForTimeout(400);
const renamed = page.locator("[data-item^='event:'] > div", { hasText: "Renamed event" });
check("editing the title renames the event", (await renamed.count()) === 1);

// 13e. delete it with ⌫, then Undo from the toast
await renamed.click();
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(100);
await page.keyboard.press("Backspace");
await page.waitForTimeout(400);
check(
  "⌫ deletes the selected event and offers Undo",
  (await renamed.count()) === 0 &&
    (await page.locator("[data-toast]", { hasText: "Undo" }).count()) === 1,
);
await page.click("[data-toast] button:has-text('Undo')");
await page.waitForTimeout(400);
check("Undo brings the event back", (await renamed.count()) === 1);
await renamed.click();
await page.waitForTimeout(200);
await page.keyboard.press("Meta+Backspace");
await page.waitForTimeout(400);
check("⌘⌫ in the popover deletes it again", (await renamed.count()) === 0);

// 13f. saving a change to a repeating event asks for the span
const standup = page.locator("[data-column='2026-10-29'] [data-item^='event:'] > div", {
  hasText: "Standup",
});
await standup.click();
await page.waitForTimeout(200);
await page.keyboard.press("Meta+a");
await page.keyboard.type("Daily standup");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
check(
  "a repeating event asks which occurrences to change",
  (await page.locator("[role=dialog][aria-label='Repeating event']").count()) === 1,
);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check(
  "Esc leaves the repeating event unchanged",
  (await page.locator("[role=dialog][aria-label='Repeating event']").count()) === 0 &&
    (await standup.count()) === 1,
);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// 13g. Quick Entry in Event mode creates an event
await page.keyboard.press("Meta+Shift+n");
await page.keyboard.press("Meta+1");
await page.keyboard.type("Lunch tomorrow 1pm for 1h");
await page.waitForTimeout(100);
check(
  "Quick Entry shows the parsed chips",
  (await page.locator("[data-chip=duration]").count()) === 1 &&
    (await page.locator("[data-chip=time]").count()) === 1,
);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const lunch = page.locator("[data-column='2026-10-29'] [data-item^='event:'] > div", {
  hasText: "Lunch",
});
check(
  "Quick Entry in Event mode makes a 1–2 PM event tomorrow",
  (await lunch.filter({ hasText: "1–2 PM" }).count()) === 1,
);

// 13h. un-parsing a token keeps its text in the title
await page.keyboard.press("Escape");
await page.keyboard.press("Meta+Shift+n");
await page.keyboard.type("Call Sam tomorrow ");
await page.waitForTimeout(100);
await page.locator("[data-token=when]").click();
await page.waitForTimeout(100);
check(
  "clicking a token un-parses it",
  (await page.locator("[data-chip=when]").count()) === 0 &&
    ((await page.locator("footer").textContent())?.includes("“Call Sam tomorrow”") ?? false),
);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.press("Meta+1");
await page.waitForTimeout(200);
check(
  "the un-parsed text stays in the to-do's title",
  (await page.locator("li", { hasText: "Call Sam tomorrow" }).count()) === 1,
);
await page.keyboard.press("Meta+2");
await page.waitForTimeout(200);

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
check("X from another week schedules after today's 1:1", tops.includes(`${12 * HOUR}px`));

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

// 18. sidebar toggle keeps the grid's scroll position and the visible dates
const grid = page.locator("[data-grid-body]");
const gridState = () =>
  grid.evaluate((element) => ({
    scrollTop: element.scrollTop,
    hour: element.getAttribute("data-hour"),
    fit: element.getAttribute("data-fit"),
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
await page.keyboard.press("0");
await page.waitForTimeout(150);
await grid.evaluate((element) => {
  element.scrollTop = 300;
});
const beforeToggle = await gridState();
const daysBefore = await page
  .locator("[data-column]")
  .evaluateAll((columns) => columns.map((column) => column.getAttribute("data-column")));
await page.keyboard.press("Meta+\\");
await page.waitForTimeout(350);
const afterToggle = await gridState();
const daysAfter = await page
  .locator("[data-column]")
  .evaluateAll((columns) => columns.map((column) => column.getAttribute("data-column")));
check(
  "sidebar toggle keeps scrollTop and dates",
  afterToggle.scrollTop === beforeToggle.scrollTop &&
    daysAfter.join() === daysBefore.join() &&
    (await page
      .locator("[data-pane=sidebar]")
      .evaluate((pane) => pane.getBoundingClientRect().width)) === 0,
);
await page.keyboard.press("Meta+\\");
await page.waitForTimeout(350);

// 19. zoom keys step the hour height and stop at fit; ⇧⌘0 resets
const hourOf = async () => Number((await gridState()).hour);
const startHour = await hourOf();
await page.keyboard.press("Meta+Shift+.");
await page.waitForTimeout(100);
const zoomedIn = await hourOf();
await page.keyboard.press("Meta+Shift+,");
await page.waitForTimeout(100);
check("⇧⌘. zooms in and ⇧⌘, back out", zoomedIn > startHour && (await hourOf()) === startHour);
for (let i = 0; i < 8; i++) {
  await page.keyboard.press("Meta+Shift+,");
  await page.waitForTimeout(50);
}
let state = await gridState();
check(
  "zoom out stops at fit and fills the body",
  state.hour === state.fit &&
    Number(state.fit) < startHour &&
    Math.abs(state.scrollHeight - state.clientHeight) <= 1,
);
await page.keyboard.press("Meta+Shift+0");
await page.waitForTimeout(100);
check("⇧⌘0 restores the default height", (await hourOf()) === 48);

// 20. "fit" in a tall window: 24 hours exactly fill the body
await page.evaluate(() => window.calTest?.seed({ device: { hourHeight: 0 } }));
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1200),
);
await page.waitForTimeout(400);
state = await gridState();
check(
  "fit fills a tall window",
  state.hour === state.fit &&
    Math.abs(Number(state.hour) * 24 - state.clientHeight) < 1 &&
    Math.abs(state.scrollHeight - state.clientHeight) <= 1,
);
await page.evaluate(() => window.calTest?.seed({ device: { hourHeight: 48 } }));
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
);
await page.waitForTimeout(300);

// 21. settings take effect live: hidden weekends, 24-hour labels, a hidden calendar
await page.evaluate(() =>
  window.calTest?.seed({
    account: { showWeekends: false, timeFormat: "24h" },
    device: { hiddenCalendars: ["personal"] },
  }),
);
await page.waitForTimeout(300);
check("hiding weekends leaves five columns", (await page.locator("[data-column]").count()) === 5);
check("24-hour time relabels the gutter", (await page.locator("text=09:00").count()) === 1);
check(
  "a hidden calendar's events leave the grid",
  (await page.locator("[data-item^='event:'] > div", { hasText: "Dentist" }).count()) === 0,
);
await page.keyboard.press("Meta+,");
await page.waitForTimeout(200);
check(
  "⌘, opens Settings",
  (await page.locator("[role=dialog][aria-label=Settings]").count()) === 1,
);
await page.click("[role=switch][aria-label='Show weekends']");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check(
  "the weekends switch shows seven columns again",
  (await page.locator("[data-column]").count()) === 7,
);

// 22. an extra time zone column and Z travel
await page.evaluate(() =>
  window.calTest?.seed({ account: { timeZones: [{ zone: "Asia/Kolkata", label: "IST" }] } }),
);
await page.waitForTimeout(300);
check(
  "an extra zone column labels 09:00 as 21:30",
  (await page.locator("[data-zone-column='Asia/Kolkata']", { hasText: "21:30" }).count()) === 1,
);
await page.keyboard.press("z");
await page.keyboard.type("tokyo");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const travelRetro = page.locator("[data-item^='event:'] > div", { hasText: "Retro" });
check(
  "Z travel shows Tokyo time and shifts events",
  (await page.locator("[data-travel]").count()) === 1 &&
    // Retro sits at 4–5 PM since step 13, shown in 24-hour time since step 21: Friday
    // 4 PM Pacific is 08:00 Saturday in Tokyo.
    ((await travelRetro.first().textContent())?.includes("08:00–09:00") ?? false),
);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("Esc returns from travel", (await page.locator("[data-travel]").count()) === 0);

// 23. with the to-do pane closed, a block dragged across where the pane was moves there
// instead of being removed. The Smoke block sits on Thursday (17:00–18:30 in 24-hour
// time since step 21); Monday's column now covers the pane's old place.
await page.keyboard.press("Meta+/");
await page.waitForTimeout(350);
// Earlier steps scrolled and re-fit the grid; the opening scroll shows 17:00–18:30.
await page.locator("[data-grid-body]").evaluate((element, top) => {
  element.scrollTop = top;
}, body.scrollTop);
before = await blocks();
const smokeBlock = page.locator("[data-item^='block:'] > div", { hasText: "Smoke block" });
box = await boxOf(smokeBlock);
const mon = await col("2026-10-26");
check(
  "closing the to-do pane puts Monday where the pane was",
  mon.x < 544 && mon.x + mon.width > 224,
);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x - 40, box.y + box.height / 2, { steps: 4 });
await page.mouse.move(mon.x + mon.width / 2, box.y + box.height / 2, { steps: 8 });
const removingClosed = await page.locator("text=Remove from calendar").count();
await page.mouse.up();
await page.waitForTimeout(300);
check(
  "with the pane closed, a block dragged over its old place moves instead of being removed",
  (await blocks()) === before &&
    removingClosed === 0 &&
    (await page
      .locator("[data-column='2026-10-26'] [data-item^='block:'] > div", { hasText: "Smoke block" })
      .count()) === 1 &&
    ((await smokeBlock.textContent())?.includes("17:00–18:30") ?? false),
);
await page.keyboard.press("Meta+/");
await page.waitForTimeout(350);

// 24. travelling to Tokyo: a task dropped at a grid time saves a block at that Tokyo
// time, and the block shows at the same time in the day and month views.
await page.keyboard.press("z");
await page.keyboard.type("tokyo");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.press("Meta+2");
await page.waitForTimeout(200);
await page.locator("[data-grid-body]").evaluate((element, top) => {
  element.scrollTop = top;
}, body.scrollTop);
before = await blocks();
const typed = page.locator("li", { hasText: "Typed task" }).first();
await typed.scrollIntoViewIfNeeded();
const tb = await boxOf(typed);
const friTokyo = await col("2026-10-30");
await page.mouse.move(tb.x + 100, tb.y + 10);
await page.mouse.down();
await page.mouse.move(tb.x + 120, tb.y + 20, { steps: 3 });
await page.mouse.move(friTokyo.x + friTokyo.width / 2, y(13 * 60), { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
const typedBlock = (day: string) =>
  page.locator(`[data-column='${day}'] [data-item^='block:'] > div`, { hasText: "Typed task" });
// A half-hour chip is too short for a time label, so check where it sits: 13:00 is 624px.
const typedTop = async (day: string) =>
  (await typedBlock(day).count()) === 1
    ? typedBlock(day).evaluate((chip) => (chip instanceof HTMLElement ? chip.style.top : ""))
    : "";
check(
  "while travelling, a task dropped at 13:00 Friday lands at 13:00 Friday in Tokyo",
  (await blocks()) === before + 1 && (await typedTop("2026-10-30")) === `${13 * HOUR}px`,
);
// Day view of that Friday (1 opens the Mac's today, two days earlier in Tokyo).
await page.keyboard.press("1");
await page.waitForTimeout(150);
await page.keyboard.press("ArrowRight");
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(200);
check(
  "the Tokyo day view shows the block at 13:00",
  (await page.locator("[data-column]").count()) === 1 &&
    (await typedTop("2026-10-30")) === `${13 * HOUR}px`,
);
// A taller window keeps the day's items out of "+N more".
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1200),
);
await page.keyboard.press("m");
await page.waitForTimeout(400);
const typedCell = page.locator("[data-day='2026-10-30'] button", { hasText: "Typed task" });
check(
  "the Tokyo month view puts it on Friday at 13:00",
  (await typedCell.count()) === 1 &&
    ((await typedCell.textContent())?.includes("13:00") ?? false) &&
    (await page.locator("[data-day='2026-10-29'] button", { hasText: "Typed task" }).count()) === 0,
);
// The dragged row is still selected, so the first Esc may deselect it rather than
// stop travelling.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
if ((await page.locator("[data-travel]").count()) === 1) await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check(
  "back in the Mac's zone the block shows on Thursday evening",
  (await page.locator("[data-travel]").count()) === 0 &&
    (await page.locator("[data-day='2026-10-29'] button", { hasText: "Typed task" }).count()) === 1,
);
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
);

await app.close();
if (results.some((line) => line.startsWith("FAIL"))) process.exit(1);
