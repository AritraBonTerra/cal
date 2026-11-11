/*
 * Drives the fixture app through the grid's pointer and keyboard interactions and
 * prints PASS/FAIL per check. Usage: `bun run smoke` (after `bun run build`).
 */
import { grid as gridTokens } from "@cal/theme";
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
// The script's own hour height, whatever the default is: its pointer moves assume that
// the afternoon and evening are on screen at 1440×900.
const HOUR = 48;
const DEFAULT_HOUR = gridTokens.hourHeight;
await page.evaluate((hourHeight) => window.calTest?.seed({ device: { hourHeight } }), HOUR);
await page.waitForTimeout(300);
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
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + HOUR, { steps: 5 });
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 2 * HOUR, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
check("move block to 5–6 PM", (await created.textContent())?.includes("5–6 PM") ?? false);

// 3. resize from the bottom edge by 30 min
box = await boxOf(created);
await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height + HOUR / 2, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
check("resize block to 5–6:30 PM", (await created.textContent())?.includes("5–6:30 PM") ?? false);

// 3b. Escape mid-move cancels without writing
box = await boxOf(created);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + HOUR, { steps: 5 });
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

// 10b. the sidebar's Habits: a row toggles today, as today's chip does; right-click archives
const readRow = page.locator("[data-habit-list] li", { hasText: "Read" }).locator("button");
await readRow.click();
await page.waitForTimeout(200);
check(
  "sidebar habit row logs today's target",
  (await readRow.getAttribute("aria-pressed")) === "true" &&
    ((await readRow.textContent()) ?? "").includes("20/20 min"),
);
await readRow.click();
await page.waitForTimeout(200);
await readRow.click({ button: "right" });
await page.locator("[role=menuitem]", { hasText: "Archive" }).click();
await page.waitForTimeout(200);
const archived =
  (await readRow.count()) === 0 && (await page.locator("button[title^='Read ·']").count()) === 0;
await page.keyboard.press("Meta+z");
await page.waitForTimeout(200);
check(
  "archiving a habit hides it from sidebar and strip; undo brings it back",
  archived && (await readRow.count()) === 1,
);
check(
  "the strip's dashed + is in today's column",
  (await page.locator("[data-add-habit]").count()) === 1,
);

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

// 12b. a new card reads its title as Quick Entry text and applies it on close
before = await blocks();
await page.keyboard.press("Meta+n");
await page.waitForTimeout(200);
await page.keyboard.type("Smoke card 4pm ~45m #home");
await page.waitForTimeout(100);
check(
  "a new card lights up its tokens and previews the time",
  (await page.locator("[data-card] [data-token]").count()) === 3 &&
    (await page.locator("[data-card] button", { hasText: "Today 4 PM" }).count()) === 1,
);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
const smokeRow = page.locator("li", { hasText: "Smoke card" });
const smokeText = (await smokeRow.textContent()) ?? "";
check(
  "closing it saves the clean title, tag and estimate",
  (await smokeRow.count()) === 1 &&
    !smokeText.includes("4pm") &&
    smokeText.includes("#home") &&
    smokeText.includes("45m"),
);
check(
  "closing it places a 4–4:45 PM block",
  (await blocks()) === before + 1 &&
    ((await page.locator("[data-item^='block:']", { hasText: "Smoke card" }).textContent()) ?? "")
      .replace(/\s/g, "")
      .includes("4–4:45PM"),
);

// 12c. an existing to-do's card never re-reads its title
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
// The title opens selected; → puts the caret at its end.
await page.keyboard.press("ArrowRight");
await page.keyboard.type(" tomorrow");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check(
  "editing an existing to-do keeps date words as text",
  (await page.locator("li", { hasText: "Smoke card tomorrow" }).count()) === 1 &&
    (await page.locator("[data-item^='block:']", { hasText: "Smoke card" }).count()) === 1,
);

// 12d. Backspace after a fresh token keeps it as text; a title of only tokens stays as typed
await page.keyboard.press("Meta+n");
await page.waitForTimeout(200);
await page.keyboard.type("Read tomorrow");
await page.keyboard.press("Backspace");
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.press("Meta+n");
await page.waitForTimeout(200);
await page.keyboard.type("someday");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check(
  "un-parsed and token-only titles are kept as typed",
  (await page.locator("li", { hasText: "Read tomorrow" }).count()) === 1 &&
    (await page.locator("li", { hasText: /^someday$/ }).count()) === 1,
);

// 12e. a chip field left open when the card closes saves first, so the typed text wins
await page.keyboard.press("Meta+n");
await page.waitForTimeout(200);
await page.keyboard.type("Chip race ~45m");
await page.locator("[data-card] button", { hasText: "45m" }).click();
await page.keyboard.press("Meta+a");
await page.keyboard.type("15m");
await page.locator("header h1").click();
await page.waitForTimeout(400);
const raceText = (await page.locator("li", { hasText: "Chip race" }).textContent()) ?? "";
check(
  "the title's estimate beats a chip field left open",
  raceText.includes("45m") && !raceText.includes("15m"),
);

// 13. event move (writable calendar)
const retro = page.locator("[data-item^='event:'] > div", { hasText: "Retro" });
box = await boxOf(retro);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + HOUR, { steps: 8 });
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

// 13d2. a time typed into the Start field saves with ⌘↩, without Enter or a blur first
await renamed.click();
await page.waitForTimeout(200);
await page.locator("[role=dialog][aria-label='Event'] input[aria-label='Start time']").click();
await page.keyboard.type("7pm");
await page.keyboard.press("Meta+Enter");
await page.waitForTimeout(400);
check(
  "⌘↩ right after typing a start time saves the typed time",
  (await renamed.textContent())?.includes("7–8 PM") ?? false,
);

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
// That Esc belonged to the span dialog alone: the editor stays open, with no discard prompt.
check(
  "Esc in the span dialog leaves the editor open without asking to discard",
  (await page.locator("[role=dialog][aria-label='Event']").count()) === 1 &&
    (await page.locator("text=Discard changes?").count()) === 0,
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

// 13i. Quick Entry with the switch untouched reads a time range and a place as an event
await page.keyboard.press("Meta+Shift+n");
await page.keyboard.type("Coffee tomorrow 3-4pm at Blue Bottle");
await page.waitForTimeout(100);
const quickFooter = () => page.locator("[role=dialog][aria-label='Quick Entry'] footer");
check(
  "Quick Entry infers Event from a time range and a place",
  (await quickFooter().textContent())?.includes("Add event") ?? false,
);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const coffee = page.locator("[data-column='2026-10-29'] [data-item^='event:'] > div", {
  hasText: "Coffee",
});
check(
  "the inferred event lands at 3–4 PM tomorrow",
  (await coffee.filter({ hasText: "3–4 PM" }).count()) === 1,
);
// Delete it again: the month-view checks later count on this Thursday's chips.
await coffee.click();
await page.waitForTimeout(200);
await page.keyboard.press("Escape");
await page.waitForTimeout(100);
await page.keyboard.press("Backspace");
await page.waitForTimeout(400);

// 13j. ⌘2 overrides a typed "event " prefix
await page.keyboard.press("Meta+Shift+n");
await page.keyboard.type("event Buy stamps");
await page.waitForTimeout(100);
const prefixed = (await quickFooter().textContent())?.includes("Add event") ?? false;
await page.keyboard.press("Meta+2");
await page.waitForTimeout(100);
check(
  "⌘2 after an 'event' prefix switches to To-do",
  prefixed && ((await quickFooter().textContent())?.includes("Add to-do") ?? false),
);
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.press("Meta+1");
await page.waitForTimeout(200);
check(
  "the prefixed text became a to-do",
  (await page.locator("li", { hasText: "Buy stamps" }).count()) === 1 &&
    (await page.locator("[data-item^='event:'] > div", { hasText: "Buy stamps" }).count()) === 0,
);
await page.keyboard.press("Meta+2");
await page.waitForTimeout(200);

// 13j2. Quick Entry's keys work wherever focus is in it, not only in the text field
await page.keyboard.press("Meta+Shift+n");
await page.keyboard.type("Water the plants");
const quickPanel = page.locator("[role=dialog][aria-label='Quick Entry']");
// A blank stretch of the footer, between "Esc Cancel" and the title preview.
await quickPanel.locator("footer").click({ position: { x: 300, y: 16 } });
const focusOnPanel = await page.evaluate(
  () => document.activeElement?.getAttribute("aria-label") === "Quick Entry",
);
await page.keyboard.press("Meta+1");
await page.waitForTimeout(100);
const switchedFromBlank =
  ((await quickFooter().textContent())?.includes("Add event") ?? false) &&
  (await page.locator("h2", { hasText: "Inbox" }).count()) === 0;
// The keyboard switch hands focus back to the text, and typing from the panel lands there.
const keyBackInField = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
await quickPanel.locator("footer").click({ position: { x: 300, y: 16 } });
await page.keyboard.type("c");
await page.waitForTimeout(100);
const typedFromBlank =
  (await quickPanel.count()) === 1 &&
  (await quickPanel.locator("input").inputValue()) === "Water the plantsc";
await quickPanel.getByRole("radio", { name: "To-do" }).click();
const backInField = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
await quickPanel.locator("footer").click({ position: { x: 300, y: 16 } });
await page.keyboard.press("Escape");
await page.waitForTimeout(100);
check(
  "a click on Quick Entry's blank parts keeps ⌘1 and Esc there; the switch hands focus back",
  focusOnPanel &&
    switchedFromBlank &&
    keyBackInField &&
    typedFromBlank &&
    backInField &&
    (await quickPanel.count()) === 0,
);

// 13k. undoing a repeating event's creation removes every occurrence
await page.keyboard.press("Meta+Shift+n");
await page.keyboard.press("Meta+1");
await page.keyboard.type("Yoga tomorrow 7am every day");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const yoga = page.locator("[data-item^='event:'] > div", { hasText: "Yoga" });
const yogaCount = await yoga.count();
await page.keyboard.press("Meta+z");
await page.waitForTimeout(400);
check(
  "⌘Z after creating a repeating event removes the whole series",
  yogaCount >= 3 && (await yoga.count()) === 0,
);

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

// 19. zoom keys step the hour height and stop at fit; ⌘0 resets. Starts from the
// default, which is on the zoom ladder; the fit floor is lower than it at 1440×900.
await page.evaluate((hourHeight) => window.calTest?.seed({ device: { hourHeight } }), DEFAULT_HOUR);
await page.waitForTimeout(300);
const hourOf = async () => Number((await gridState()).hour);
const startHour = await hourOf();
await page.keyboard.press("Meta+Shift+Equal");
await page.waitForTimeout(100);
const zoomedIn = await hourOf();
await page.keyboard.press("Meta+Minus");
await page.waitForTimeout(100);
check("⌘+ zooms in and ⌘- back out", zoomedIn > startHour && (await hourOf()) === startHour);
await page.keyboard.press("Meta+Equal");
await page.waitForTimeout(100);
check("⌘= zooms in too", (await hourOf()) === zoomedIn);
await page.keyboard.press("Meta+Minus");
await page.waitForTimeout(100);
for (let i = 0; i < 8; i++) {
  await page.keyboard.press("Meta+Minus");
  await page.waitForTimeout(50);
}
let state = await gridState();
check(
  "zoom out stops at fit and fills the body",
  state.hour === state.fit &&
    Number(state.fit) < startHour &&
    Math.abs(state.scrollHeight - state.clientHeight) <= 1,
);
await page.keyboard.press("Meta+0");
await page.waitForTimeout(100);
check("⌘0 restores the default height", (await hourOf()) === DEFAULT_HOUR);
// A pinch saves its height 200ms after the last tick; a reset in between must stand.
await grid.evaluate((element) => {
  element.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY: -20,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      clientY: element.getBoundingClientRect().top + 200,
    }),
  );
});
await page.keyboard.press("Meta+0");
await page.waitForTimeout(400);
check("⌘0 right after a pinch keeps the default height", (await hourOf()) === DEFAULT_HOUR);

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
// Once fit is taller than the default, a reset stores the default itself, not "fit":
// shrinking the window afterwards brings the default back rather than keeping the fit.
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1400),
);
await page.waitForTimeout(400);
await page.keyboard.press("Meta+0");
await page.waitForTimeout(100);
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900),
);
await page.waitForTimeout(400);
check("⌘0 in a tall window keeps the default after it shrinks", (await hourOf()) === DEFAULT_HOUR);
await page.evaluate((hourHeight) => window.calTest?.seed({ device: { hourHeight } }), HOUR);
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
// Scoped to the calendar: to-do rows show their next block's time too ("Tomorrow 09:00").
check(
  "24-hour time relabels the gutter",
  (await page.locator("main").locator("text=09:00").count()) === 1,
);
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

// 25. resizing the side panes by dragging their right edges
await page.keyboard.press("w");
await page.waitForTimeout(200);
for (const pane of ["sidebar", "tasks"]) {
  const toggle = page.locator(`[data-pane-toggle=${pane}]`);
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
}
await page.waitForTimeout(350);
const paneWidth = (pane: string) =>
  page.locator(`[data-pane=${pane}]`).evaluate((element) => element.getBoundingClientRect().width);
// The device setting a drag saved (fixture mode keeps device settings in memory).
const savedWidth = (key: "sidebarWidth" | "tasksWidth") =>
  page.evaluate((name) => window.calTest?.device()[name], key);
const handleAt = async (pane: string) => {
  const box = await boxOf(page.locator(`[data-resize=${pane}]`));
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
await grid.evaluate((element) => {
  element.scrollTop = 300;
});
const beforeResize = await gridState();
const daysBeforeResize = await page
  .locator("[data-column]")
  .evaluateAll((columns) => columns.map((column) => column.getAttribute("data-column")));
let handle = await handleAt("sidebar");
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x + 30, handle.y, { steps: 3 });
await page.mouse.move(handle.x + 60, handle.y, { steps: 3 });
// Read at once: with the slide still on, the width would lag behind the pointer.
const midDrag = await paneWidth("sidebar");
const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
await page.mouse.up();
await page.waitForTimeout(100);
const afterResize = await gridState();
const daysAfterResize = await page
  .locator("[data-column]")
  .evaluateAll((columns) => columns.map((column) => column.getAttribute("data-column")));
check(
  "dragging the sidebar's edge resizes it live and saves the width on release",
  midDrag === 284 &&
    (await paneWidth("sidebar")) === 284 &&
    (await savedWidth("sidebarWidth")) === 284,
);
check(
  "the sidebar's content fills the dragged width",
  (await page
    .locator("[data-pane=sidebar] aside")
    .evaluate((aside) => aside.getBoundingClientRect().width)) === 284,
);
check(
  "resizing keeps the grid's scrollTop and dates, and selects no text",
  afterResize.scrollTop === beforeResize.scrollTop &&
    daysAfterResize.join() === daysBeforeResize.join() &&
    selected === "",
);
handle = await handleAt("sidebar");
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x + 200, handle.y, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(100);
check("the sidebar stops at 320px", (await paneWidth("sidebar")) === 320);
handle = await handleAt("sidebar");
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x - 60, handle.y, { steps: 3 });
await page.keyboard.press("Escape");
await page.mouse.up();
await page.waitForTimeout(100);
check(
  "Escape mid-drag puts the starting width back",
  (await paneWidth("sidebar")) === 320 && (await savedWidth("sidebarWidth")) === 320,
);
handle = await handleAt("sidebar");
await page.mouse.dblclick(handle.x, handle.y);
await page.waitForTimeout(350);
check(
  "double-clicking the edge resets the sidebar to 224px",
  (await paneWidth("sidebar")) === 224 && (await savedWidth("sidebarWidth")) === 224,
);
// The to-do list: wider, its content following.
handle = await handleAt("tasks");
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x + 80, handle.y, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(100);
check(
  "dragging the to-do list's edge resizes it and its content",
  (await paneWidth("tasks")) === 400 &&
    (await savedWidth("tasksWidth")) === 400 &&
    (await page
      .locator("[data-pane=tasks] section")
      .first()
      .evaluate((list) => list.getBoundingClientRect().width)) === 400,
);
// Drag to close: 60px under the minimum collapses the pane; back out restores it.
handle = await handleAt("tasks");
await page.mouse.move(handle.x, handle.y);
await page.mouse.down();
await page.mouse.move(handle.x - 220, handle.y, { steps: 6 });
const collapsed = await paneWidth("tasks");
await page.mouse.move(handle.x - 100, handle.y, { steps: 3 });
const restored = await paneWidth("tasks");
await page.mouse.move(handle.x - 220, handle.y, { steps: 3 });
await page.mouse.up();
await page.waitForTimeout(350);
check(
  "dragging the edge far past the minimum collapses the pane, and back out restores it",
  collapsed === 0 && restored === 300,
);
check(
  "letting go past the threshold closes the to-do list, keeping its saved width",
  (await page.locator("[data-pane-toggle=tasks]").getAttribute("aria-pressed")) === "false" &&
    (await paneWidth("tasks")) === 0 &&
    (await savedWidth("tasksWidth")) === 400,
);
await page.keyboard.press("Meta+/");
await page.waitForTimeout(350);
check("⌘/ brings it back at its saved width", (await paneWidth("tasks")) === 400);
await page.keyboard.press("Meta+k");
await page.keyboard.type("Reset Pane Widths");
await page.keyboard.press("Enter");
await page.waitForTimeout(350);
check(
  "Reset Pane Widths puts both panes back to their defaults",
  (await paneWidth("sidebar")) === 224 && (await paneWidth("tasks")) === 320,
);

// 26. the hidden sidebar peeks over the content from the window's left edge
await page.keyboard.press("Meta+\\");
await page.waitForTimeout(350);
const peekPanel = page.locator("[data-peek]");
const firstColumn = async () => (await col(daysBeforeResize[0] ?? "")).x;
const columnBefore = await firstColumn();
await page.mouse.move(300, 400);
await page.mouse.move(2, 400);
await page.waitForTimeout(80);
const tooSoon = await peekPanel.count();
await page.waitForTimeout(250);
check(
  "resting at the left edge peeks the sidebar without moving the calendar",
  tooSoon === 0 &&
    (await page.locator("[data-peek=in]").count()) === 1 &&
    Math.round((await boxOf(peekPanel)).width) === 224 &&
    (await paneWidth("sidebar")) === 0 &&
    (await firstColumn()) === columnBefore &&
    (await page.locator("[data-pane-toggle=sidebar]").getAttribute("aria-pressed")) === "false",
);
check(
  "the pane toggles come after every drag band in the page, so the window can't swallow their clicks",
  await page.evaluate(() => {
    const toggles = document.querySelector("[data-pane-toggle]");
    return (
      toggles !== null &&
      [...document.querySelectorAll(".drag-region")].every(
        (band) => band.compareDocumentPosition(toggles) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
    );
  }),
);
check(
  "the hidden sidebar's toggle drops its collapse chevron; the open to-do list keeps its check",
  await page.evaluate(() => {
    const part = (pane: string, selector: string) => {
      const element = document.querySelector(`[data-pane-toggle=${pane}] ${selector}`);
      return element ? getComputedStyle(element) : null;
    };
    return (
      part("sidebar", "path:last-child")?.opacity === "0" &&
      part("tasks", "path:last-child")?.visibility === "visible"
    );
  }),
);
const toggleBox = await boxOf(page.locator("[data-pane-toggle=tasks]"));
check(
  "the pane toggles stay on top of the peeked sidebar",
  await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-pane-toggle]") !== null,
    { x: toggleBox.x + toggleBox.width / 2, y: toggleBox.y + toggleBox.height / 2 },
  ),
);
await page.locator("[data-peek] li", { hasText: "Upcoming" }).first().click();
await page.waitForTimeout(150);
check(
  "clicking a list in the peeked sidebar shows it and keeps the peek",
  (await page.locator("h2", { hasText: "Upcoming" }).count()) === 1 &&
    (await page.locator("[data-peek=in]").count()) === 1,
);
await page.mouse.move(600, 400);
await page.waitForTimeout(150);
await page.mouse.move(100, 400);
await page.waitForTimeout(300);
const stayed = await page.locator("[data-peek=in]").count();
await page.mouse.move(600, 400);
await page.waitForTimeout(150);
const lingering = await page.locator("[data-peek=in]").count();
await page.waitForTimeout(500);
check(
  "the peek stays when the pointer comes back, and leaves 300ms after it goes",
  stayed === 1 && lingering === 1 && (await peekPanel.count()) === 0,
);
await page.mouse.move(2, 400);
await page.waitForTimeout(300);
const peekedAgain = await page.locator("[data-peek=in]").count();
await page.keyboard.press("Escape");
await page.waitForTimeout(50);
check("Escape closes the peek at once", peekedAgain === 1 && (await peekPanel.count()) === 0);
// A press held from the empty end of the to-do list.
await page.mouse.move(160, 860);
await page.mouse.down();
await page.mouse.move(2, 860, { steps: 4 });
await page.waitForTimeout(300);
const peekWhileDragging = await peekPanel.count();
await page.mouse.up();
check("a drag never starts a peek", peekWhileDragging === 0);
await page.mouse.move(300, 400);
await page.mouse.move(2, 400);
await page.waitForTimeout(300);
const peekedOnce = await page.locator("[data-peek=in]").count();
await page.keyboard.press("Meta+\\");
await page.waitForTimeout(350);
check(
  "showing the real sidebar ends the peek",
  peekedOnce === 1 && (await peekPanel.count()) === 0 && (await paneWidth("sidebar")) === 224,
);

// The year view: Y shows it, arrows move a year, T comes back, a day or month name leaves.
const toolbarTitle = () => page.locator("header h1").textContent();
await page.keyboard.press("y");
await page.waitForTimeout(200);
check(
  "Y shows the year's twelve months",
  (await toolbarTitle()) === "2026" && (await page.locator("[data-year-month]").count()) === 12,
);
check(
  "the year marks today and dots busy days",
  (await page.locator("[data-year-day='2026-10-28'][aria-current=date]").count()) === 1 &&
    (await page.locator("[data-year-day='2026-10-29'] .rounded-full").count()) === 1 &&
    (await page.locator("[data-year-day='2026-03-12'] .rounded-full").count()) === 0,
);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(150);
const nextYear = await toolbarTitle();
await page.keyboard.press("t");
await page.waitForTimeout(150);
check("→ moves a year and T comes back", nextYear === "2027" && (await toolbarTitle()) === "2026");
await page.locator("[data-year-day='2026-03-12']").click();
await page.waitForTimeout(200);
check(
  "a day click leaves the year for that day's week",
  (await page.locator("[data-year-view]").count()) === 0 &&
    (await page.locator("[data-column='2026-03-12']").count()) === 1,
);
await page.keyboard.press("y");
await page.waitForTimeout(150);
await page.locator("[data-year-month='2026-06-01'] button", { hasText: "June" }).click();
await page.waitForTimeout(150);
check("a month name opens that month", (await toolbarTitle()) === "June 2026");

// 27. Settings > Shortcuts: record, cancel, conflicts, reset, and the menu bar following
const settingsOpen = () => page.locator("[role=dialog][aria-label=Settings]").count();
const paletteOpen = () => page.locator("[role=dialog][aria-label='Command menu']").count();
const menuAccelerator = (label: string) =>
  app.evaluate(({ Menu }, wanted) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const item of items) {
        if (item.label === wanted) return item;
        const inner = item.submenu && find(item.submenu.items);
        if (inner) return inner;
      }
    };
    return find(Menu.getApplicationMenu()?.items ?? [])?.accelerator ?? null;
  }, label);
check(
  "the menu shows ⌘K for Command Menu",
  (await menuAccelerator("Command Menu")) === "CmdOrCtrl+K",
);
// The month view (left showing above) registers no zoom commands, so they lose their keys.
const zoomInMonth = await menuAccelerator("Zoom Hours In");
await page.keyboard.press("w");
await page.waitForTimeout(200);
check(
  "a command its view isn't showing has no menu shortcut",
  zoomInMonth === null && (await menuAccelerator("Zoom Hours In")) === "CmdOrCtrl+Plus",
);
await page.keyboard.press("Meta+,");
await page.click("[data-section=shortcuts]");
await page.waitForTimeout(200);
check(
  "Shortcuts lists commands but not Show 14 days",
  (await page.locator("[data-command='task.new']").count()) === 1 &&
    (await page.locator("[data-command='view.days.14']").count()) === 0,
);
await page.fill("[aria-label='Search shortcuts']", "14");
check(
  "searching 14 finds Show 14 days",
  (await page.locator("[data-command='view.days.14']").count()) === 1,
);
await page.fill("[aria-label='Search shortcuts']", "⌘K");
check(
  "searching ⌘K finds Command Menu",
  (await page.locator("[data-command='palette.open']").count()) === 1 &&
    (await page.locator("[data-command='task.new']").count()) === 0,
);
await page.fill("[aria-label='Search shortcuts']", "command menu");
const paletteKey = page.locator("[data-command='palette.open'] [data-key]");
await paletteKey.click();
check("clicking a binding records", (await page.locator("[data-recording]").count()) === 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
check(
  "Escape cancels recording and keeps Settings open",
  (await page.locator("[data-recording]").count()) === 0 && (await settingsOpen()) === 1,
);
await paletteKey.click();
await page.keyboard.press("Meta+j");
await page.waitForTimeout(300);
check(
  "a recorded key saves without running anything",
  (await paletteOpen()) === 0 &&
    (await settingsOpen()) === 1 &&
    ((await page.locator("[data-command='palette.open']").textContent()) ?? "").includes("Changed"),
);
check(
  "the menu follows the new binding",
  (await menuAccelerator("Command Menu")) === "CmdOrCtrl+J",
);
await page.fill("[aria-label='Search shortcuts']", "new to-do");
await page.hover("[data-command='task.new']");
await page.click("[data-command='task.new'] [data-add]");
await page.keyboard.press("Meta+j");
await page.waitForTimeout(300);
check(
  "a shared key warns but saves",
  ((await page.locator("[data-command='task.new'] [data-conflict]").textContent()) ?? "").includes(
    "Also used by Command Menu",
  ) && (await page.locator("[data-command='task.new'] [data-key]").count()) === 2,
);
await page.hover("[data-command='task.new']");
await page.click("[data-command='task.new'] [aria-label='Remove shortcut ⌘J']");
await page.waitForTimeout(300);
check(
  "removing the extra key clears the change",
  (await page.locator("[data-command='task.new'] [data-key]").count()) === 1 &&
    (await page.locator("[data-command='task.new'] [data-conflict]").count()) === 0,
);
// Escape clears the search, then closes Settings.
await page.click("[aria-label='Search shortcuts']");
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.keyboard.press("Meta+j");
await page.waitForTimeout(200);
check("the new binding opens the command menu", (await paletteOpen()) === 1);
await page.keyboard.press("Escape");
await page.keyboard.press("Meta+k");
await page.waitForTimeout(200);
check("the old binding no longer does", (await paletteOpen()) === 0);
await page.keyboard.press("?");
await page.click("text=Customize…");
await page.waitForTimeout(200);
check(
  "the ? sheet's Customize opens Settings on Shortcuts",
  (await page.locator("[data-section=shortcuts][aria-current=true]").count()) === 1,
);
await page.click("text=Reset all");
await page.waitForTimeout(300);
check(
  "Reset all restores ⌘K and disables itself",
  (await menuAccelerator("Command Menu")) === "CmdOrCtrl+K" &&
    (await page.locator("button:has-text('Reset all')").isDisabled()),
);
await page.click("[data-section=about]");
check(
  "About shows the version",
  ((await page.locator("[data-version]").textContent()) ?? "").includes("0.1.0"),
);
await page.keyboard.press("Escape");

await app.close();
if (results.some((line) => line.startsWith("FAIL"))) process.exit(1);
