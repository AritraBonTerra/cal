import type { DayKey } from "@cal/domain";
import { Circle, Flag, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import { dayNumber, formatWeekday, formatWeekdayMonthDay } from "../../lib/time";
import { showDays, showList, ui } from "../../lib/ui";
import { type Deadlines, listShowing } from "./agenda";

// Below this column width the flag would sit on top of the date, so it's left out.
const FLAG_MIN = 56;

// Weekday and date per column; today (in the grid's zone) gets the red badge. Click a
// day to open it. Narrow columns keep one weekday letter so nothing truncates mid-word.
// A day with deadlines shows a flag and their count at the right, where there's room.
export function DayHeaders({
  days,
  columnWidth,
  deadlines,
}: {
  days: readonly DayKey[];
  columnWidth: number;
  deadlines: ReadonlyMap<DayKey, Deadlines>;
}) {
  const { today, gridToday } = useApp();
  const narrow = columnWidth < 88;
  return (
    <>
      {days.map((day) => {
        const isToday = day === gridToday;
        const weekday = formatWeekday(day, days.length === 1);
        const due = deadlines.get(day);
        return (
          <div key={day} className="relative flex h-11 min-w-0 flex-1 items-center">
            <button
              type="button"
              onClick={() => showDays(1, today, day)}
              className={`flex h-full min-w-0 flex-1 items-center gap-1.5 text-left ${narrow ? "px-1" : "px-2"}`}
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
            {due && due.tasks.length + due.projects.length > 0 && columnWidth >= FLAG_MIN && (
              <DeadlineFlag day={day} deadlines={due} narrow={narrow} />
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * The flag and count of a day's deadlines. Clicking it lists them in a popover: a to-do
 * there is selected and shown in a list that holds it, a project opens. Escape or a
 * click elsewhere closes it.
 */
function DeadlineFlag({
  day,
  deadlines,
  narrow,
}: {
  day: DayKey;
  deadlines: Deadlines;
  narrow: boolean;
}) {
  const { data, today } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = deadlines.tasks.length + deadlines.projects.length;

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    // Capture phase, so Escape closes the popover before it reaches Deselect.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative shrink-0 ${narrow ? "pr-1" : "pr-2"}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${count} ${count === 1 ? "deadline" : "deadlines"}`}
        title={`${count} ${count === 1 ? "deadline" : "deadlines"}`}
        data-deadlines={day}
        onClick={() => setOpen((state) => !state)}
        className="flex h-5 items-center gap-0.5 rounded-sm px-1 text-caption font-medium text-now tnum hover:bg-hover"
      >
        <Flag size={12} strokeWidth={1.5} absoluteStrokeWidth />
        {count}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Deadlines on ${formatWeekdayMonthDay(day)}`}
          className="pop-in absolute top-6 right-0 z-40 w-60 origin-top-right rounded-lg bg-raised p-1 shadow-float"
        >
          <div className="px-2 pt-1 pb-0.5 text-caption font-medium text-ink-3">
            Deadlines · {formatWeekdayMonthDay(day)}
          </div>
          {deadlines.projects.map((project) => (
            <button
              type="button"
              key={project.uuid}
              onClick={() => {
                setOpen(false);
                showList(`project:${project.uuid}`);
              }}
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body text-ink hover:bg-hover"
            >
              <Circle
                size={12}
                strokeWidth={1.5}
                absoluteStrokeWidth
                className="shrink-0 text-ink-2"
              />
              <span className="truncate">{project.title}</span>
            </button>
          ))}
          {deadlines.tasks.map((task) => (
            <button
              type="button"
              key={task.uuid}
              onClick={() => {
                setOpen(false);
                ui.set((state) => ({
                  list: listShowing(task, state.list, data.tasks, today),
                  tasks: true,
                  selection: { kind: "task", uuid: task.uuid },
                  editing: null,
                }));
              }}
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body text-ink hover:bg-hover"
            >
              <Square
                size={12}
                strokeWidth={1.5}
                absoluteStrokeWidth
                className="shrink-0 text-ink-2"
              />
              <span className="truncate">{task.title || "New To-Do"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
