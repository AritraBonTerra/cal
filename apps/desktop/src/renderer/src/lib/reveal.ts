import { type DayKey, startOfWeek, type TimeBlock, weekday } from "@cal/domain";
import { select, ui } from "./ui";
import { zonedDayKey } from "./zones";

/**
 * Shows a to-do's block on the calendar and selects it (the time on a Today row, or
 * "Show in Calendar"): first brings its day into view if `days` (what the grid shows)
 * lacks it, then scrolls the grid so the block sits in the upper third. Where the view
 * can't show the block (the month view, or a week with its weekend hidden and the block
 * on it) the day opens on its own. The jump is instant, like every view change.
 */
export function revealBlock(block: TimeBlock, zone: string, days: readonly DayKey[]) {
  const day = zonedDayKey(new Date(block.start_at), zone);
  const { view } = ui.get();
  const week = view.kind === "days" && view.count === 7;
  // A week view showing fewer than seven days has its weekend hidden.
  const hiddenWeekend = week && days.length < 7 && (weekday(day) === 0 || weekday(day) === 6);
  if (view.kind === "month" || hiddenWeekend) {
    ui.set({ view: { kind: "days", count: 1 }, anchor: day });
  } else if (!days.includes(day)) {
    ui.set(({ weekStart }) => ({ anchor: week ? startOfWeek(day, weekStart) : day }));
  }
  select({ kind: "block", uuid: block.uuid });
  // After the grid has rendered the new days.
  requestAnimationFrame(() => {
    const body = document.querySelector<HTMLElement>("[data-grid-body]");
    const chip = body?.querySelector(`[data-item='block:${block.uuid}'] > *`);
    if (!body || !chip) return;
    const top =
      chip.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    body.scrollTop = Math.max(0, top - body.clientHeight / 3);
  });
}
