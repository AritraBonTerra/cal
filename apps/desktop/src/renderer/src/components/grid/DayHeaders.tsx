import type { DayKey } from "@cal/domain";
import { useApp } from "../../lib/app";
import { dayNumber, formatWeekday } from "../../lib/time";
import { showDays } from "../../lib/ui";

// Weekday and date per column; today (in the grid's zone) gets the red badge. Click a
// day to open it. Narrow columns keep one weekday letter so nothing truncates mid-word.
export function DayHeaders({
  days,
  columnWidth,
}: {
  days: readonly DayKey[];
  columnWidth: number;
}) {
  const { today, gridToday } = useApp();
  const narrow = columnWidth < 88;
  return (
    <>
      {days.map((day) => {
        const isToday = day === gridToday;
        const weekday = formatWeekday(day, days.length === 1);
        return (
          <button
            type="button"
            key={day}
            onClick={() => showDays(1, today, day)}
            className={`flex h-11 min-w-0 flex-1 items-center gap-1.5 text-left ${narrow ? "px-1" : "px-2"}`}
          >
            <span
              className={`truncate text-small ${isToday ? "font-medium text-now" : "text-ink-2"}`}
            >
              {narrow ? weekday.slice(0, 1) : weekday}
            </span>
            <span
              className={`shrink-0 text-body font-medium tnum ${
                isToday
                  ? "flex h-5 min-w-5 items-center justify-center rounded-md bg-now px-1 text-white"
                  : "text-ink"
              }`}
            >
              {dayNumber(day)}
            </span>
          </button>
        );
      })}
    </>
  );
}
