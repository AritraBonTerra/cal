import { useActions } from "@cal/app-core";
import {
  addDays,
  addMonths,
  type DayKey,
  dayRange,
  daysInMonth,
  startOfMonth,
  startOfWeek,
  type Task,
  weekday,
} from "@cal/domain";
import { Archive, Layers, Moon, Star, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app";
import { dayNumber, formatMonthYear } from "../lib/time";
import { closeOverlay } from "../lib/ui";

/*
 * Things' When popover under the selected to-do: Today, This Evening, a compact month
 * grid, Anytime and Someday. Opens with ⌘S, closes on Escape or a choice.
 */
export function WhenPicker({ task }: { task: Task }) {
  const { today } = useApp();
  const actions = useActions();
  const [month, setMonth] = useState(startOfMonth(task.when_date ?? today));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) closeOverlay();
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const choose = (when: Task["when"], day?: string) => {
    void actions.setWhen(task.uuid, when, day);
    closeOverlay();
  };

  const days = monthGridDays(month);
  const current = task.when_date;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label="When"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeOverlay();
        }
        event.stopPropagation();
      }}
      className="pop-in absolute left-2 top-full z-30 mt-1 w-64 origin-top-left rounded-lg bg-raised p-1 shadow-float outline-none"
    >
      <Option
        icon={Star}
        label="Today"
        onClick={() => choose("date", today)}
        active={task.when === "date" && current === today}
      />
      <Option
        icon={Moon}
        label="This Evening"
        onClick={() => choose("evening", today)}
        active={task.when === "evening" && current === today}
      />
      <Option
        icon={Sun}
        label="Tomorrow"
        onClick={() => choose("date", addDays(today, 1))}
        active={task.when === "date" && current === addDays(today, 1)}
      />

      <div className="mt-1 border-t border-grid px-2 pt-2 pb-1">
        <div className="flex items-center justify-between text-small font-medium text-ink">
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, -1))}
            className="h-5 w-5 rounded-sm text-ink-2 hover:bg-hover"
          >
            ‹
          </button>
          <span className="tnum">{formatMonthYear(month)}</span>
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, 1))}
            className="h-5 w-5 rounded-sm text-ink-2 hover:bg-hover"
          >
            ›
          </button>
        </div>
        <div className="mt-1 grid grid-cols-7 text-center text-caption font-medium text-ink-3">
          {["M", "T", "W", "T", "F", "S", "S"].map((letter, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday letters.
            <span key={index} className="h-5 leading-5">
              {letter}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 text-center text-caption tnum">
          {days.map((day) => {
            const inMonth = day.slice(0, 7) === month.slice(0, 7);
            const isToday = day === today;
            const chosen = day === current;
            return (
              <button
                type="button"
                key={day}
                onClick={() => choose("date", day)}
                className={`mx-auto h-6 w-6 rounded-md ${
                  chosen
                    ? "bg-accent text-white"
                    : isToday
                      ? "font-semibold text-now"
                      : inMonth
                        ? "text-ink hover:bg-hover"
                        : "text-ink-3 hover:bg-hover"
                }`}
              >
                {dayNumber(day)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-grid pt-1">
        <Option
          icon={Layers}
          label="Anytime"
          onClick={() => choose("anytime")}
          active={task.when === "anytime"}
        />
        <Option
          icon={Archive}
          label="Someday"
          onClick={() => choose("someday")}
          active={task.when === "someday"}
        />
      </div>
    </div>
  );
}

// The Monday-first grid holding `month`: five rows, or six when the month needs them.
export function monthGridDays(month: DayKey) {
  const offset = (weekday(month) + 6) % 7;
  const rows = offset + daysInMonth(month) > 35 ? 6 : 5;
  return dayRange(startOfWeek(month), rows * 7);
}

function Option({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Star;
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-body hover:bg-hover ${
        active ? "text-accent" : "text-ink"
      }`}
    >
      <Icon
        size={14}
        strokeWidth={1.5}
        absoluteStrokeWidth
        className={active ? "text-accent" : "text-ink-2"}
      />
      {label}
    </button>
  );
}
