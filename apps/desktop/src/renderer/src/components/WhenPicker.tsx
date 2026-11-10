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
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app";
import { dayNumber, formatMonthYear } from "../lib/time";
import { closeOverlay } from "../lib/ui";

/*
 * Things' When popover under the selected to-do: Today, This Evening, a compact month
 * grid, Anytime and Someday. Opens with ⌘S (or the When chip of an open card), closes
 * on Escape or a choice. Its shell and month grid also serve the card's other pickers.
 */
export function WhenPicker({ task }: { task: Task }) {
  const { today } = useApp();
  const actions = useActions();

  const choose = (when: Task["when"], day?: string) => {
    void actions.setWhen(task.uuid, when, day);
    closeOverlay();
  };

  const current = task.when_date;

  return (
    <Popover label="When" onClose={closeOverlay}>
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
        <MonthGrid value={current} today={today} onPick={(day) => choose("date", day)} />
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
    </Popover>
  );
}

/**
 * The popover shell under a to-do (When, and the card's Deadline and Project menus):
 * focused on open, so ↑/↓ move between its buttons and keys never reach the window's
 * shortcuts; Escape or a press outside closes it. A button marked `data-initial` takes
 * focus first.
 */
export function Popover({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose, so a parent's re-render doesn't re-register the listener.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const initial = ref.current?.querySelector<HTMLElement>("[data-initial]");
    (initial ?? ref.current)?.focus();
    const away = (event: PointerEvent) => {
      if (!(event.target instanceof Node && ref.current?.contains(event.target))) close.current();
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, []);

  // ↑/↓ walk the popover's buttons, wrapping at either end.
  const step = (direction: 1 | -1) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const index = buttons.findIndex((button) => button === document.activeElement);
    const next =
      index === -1
        ? direction === 1
          ? 0
          : buttons.length - 1
        : (index + direction + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close.current();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          step(event.key === "ArrowDown" ? 1 : -1);
        }
        // Keys stay in the popover, except ⌘↩, which closes the card it belongs to.
        if (!(event.key === "Enter" && (event.metaKey || event.ctrlKey))) event.stopPropagation();
      }}
      className="pop-in absolute left-2 top-full z-30 mt-1 w-64 origin-top-left rounded-lg bg-raised p-1 shadow-float outline-none"
    >
      {children}
    </div>
  );
}

/**
 * A compact Monday-first month with ‹ › to change month; `value` is drawn chosen and
 * today in red. Used for When and for the card's Deadline.
 */
export function MonthGrid({
  value,
  today,
  onPick,
}: {
  value: DayKey | undefined;
  today: DayKey;
  onPick: (day: DayKey) => void;
}) {
  const [month, setMonth] = useState(startOfMonth(value ?? today));
  const days = monthGridDays(month);
  return (
    <>
      <div className="flex items-center justify-between text-small font-medium text-ink">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(addMonths(month, -1))}
          className="h-5 w-5 rounded-sm text-ink-2 hover:bg-hover"
        >
          ‹
        </button>
        <span className="tnum">{formatMonthYear(month)}</span>
        <button
          type="button"
          aria-label="Next month"
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
          const chosen = day === value;
          return (
            <button
              type="button"
              key={day}
              onClick={() => onPick(day)}
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
    </>
  );
}

// The Monday-first grid holding `month`: five rows, or six when the month needs them.
export function monthGridDays(month: DayKey) {
  const offset = (weekday(month) + 6) % 7;
  const rows = offset + daysInMonth(month) > 35 ? 6 : 5;
  return dayRange(startOfWeek(month), rows * 7);
}

// One 28px row of a popover: an icon and a label, accent when it's the current choice.
export function Option({
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
      data-initial={active || undefined}
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
