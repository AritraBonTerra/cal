import { useActions } from "@cal/app-core";
import {
  addDays,
  type DayKey,
  dayStatuses,
  type Habit,
  type HabitEntry,
  isDone,
  startOfWeek,
} from "@cal/domain";
import { habitColors } from "@cal/theme";
import { Check } from "lucide-react";
import { useApp } from "../../lib/app";
import { hueFor } from "../../lib/data";
import { ringLabels } from "./habitLabels";

/*
 * Habit chips under the day headers (PLAN §5.4 "day strip"): a ring per habit per
 * day that fills as it's done; click toggles the day's entry. Narrow columns show rings
 * only, each in its habit's hue with the habit's initial inside (see ringLabels), and
 * the title on hover.
 */
export function HabitStrip({
  days,
  columnWidth,
}: {
  days: readonly DayKey[];
  columnWidth: number;
}) {
  const { data, today, mode } = useApp();
  const actions = useActions();
  const habits = data.habits.filter(
    (habit) => habit.display === "strip" && habit.archived_at === undefined,
  );
  if (habits.length === 0) return null;
  const compact = columnWidth < 60 * habits.length + 16;

  const statuses = habits.map((habit) => dayStatuses(habit, data.entries, days[0] ?? today, today));
  const letters = ringLabels(habits.map((habit) => habit.title));

  return (
    <div className="flex min-w-0 flex-1">
      {days.map((day) => (
        <div key={day} className="flex min-w-0 flex-1 flex-wrap gap-1 px-2 py-1">
          {habits.map((habit, index) => {
            const entry = data.entries.find(
              (each) => each.habit_uuid === habit.uuid && each.date === day,
            );
            const value = entry?.value ?? 0;
            const status = day > today ? "future" : (statuses[index]?.get(day) ?? "open");
            const done = isDone(habit, value);
            const target = habit.kind === "measure" ? (habit.target ?? 1) : 1;
            const hue = hueFor(habit);
            const colors = habitColors(hue, mode);
            const fraction = done ? 1 : Math.min(1, value / target);
            const title = `${habit.title}${habit.kind === "measure" ? ` · ${value}/${target} ${habit.unit ?? ""}` : ""}`;
            if (compact) {
              return (
                <button
                  type="button"
                  key={habit.uuid}
                  title={title}
                  // The ring only has room for an initial; the name is the habit's.
                  aria-label={title}
                  aria-pressed={done}
                  onClick={() => void actions.logHabit(habit.uuid, day, value ? 0 : target)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-hover"
                >
                  <InitialRing
                    letter={letters[index] ?? ""}
                    fraction={fraction}
                    status={status}
                    colors={colors}
                  />
                </button>
              );
            }
            return (
              <button
                type="button"
                key={habit.uuid}
                title={title}
                aria-pressed={done}
                onClick={() => void actions.logHabit(habit.uuid, day, value ? 0 : target)}
                className={`flex h-5 shrink-0 items-center gap-1 rounded-full pr-2 pl-1 text-caption font-medium tnum ${
                  done ? "" : "bg-hover text-ink-2"
                }`}
                style={done ? { background: colors.fill, color: colors.label } : undefined}
              >
                <Ring fraction={fraction} status={status} color={colors.ring} />
                <span className="truncate">
                  {label(habit, day, value, done, data.entries, today)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// "Gym", "Read 15/20", or "Gym 2/3" for a weekly quota (on today's chip only).
function label(
  habit: Habit,
  day: DayKey,
  value: number,
  done: boolean,
  entries: readonly HabitEntry[],
  today: DayKey,
) {
  if (habit.kind === "measure" && !done && value > 0)
    return `${habit.title} ${value}/${habit.target ?? 1}`;
  if (habit.schedule === "quota" && habit.quota_period !== "month" && day === today) {
    const monday = startOfWeek(day);
    const sunday = addDays(monday, 6);
    const count = entries.filter(
      (entry) =>
        entry.habit_uuid === habit.uuid &&
        entry.date >= monday &&
        entry.date <= sunday &&
        isDone(habit, entry.value),
    ).length;
    return `${habit.title} ${count}/${habit.quota_count ?? 1}`;
  }
  return habit.title;
}

// A 12px progress ring; done shows a check, covered days a dashed ring, future days a faint one.
function Ring({ fraction, status, color }: { fraction: number; status: string; color: string }) {
  const r = 4.75;
  const c = 2 * Math.PI * r;
  if (fraction >= 1) {
    return (
      <span
        className="flex h-3 w-3 items-center justify-center rounded-full text-white"
        style={{ background: color }}
      >
        <Check size={8} strokeWidth={2.5} absoluteStrokeWidth />
      </span>
    );
  }
  const quiet = status === "covered" || status === "future" || status === "missed";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <circle
        cx="6"
        cy="6"
        r={r}
        fill="none"
        stroke={quiet ? "var(--cal-edge-strong)" : color}
        strokeWidth="1.5"
        strokeDasharray={status === "covered" ? "2 2" : undefined}
      />
      {fraction > 0 && (
        <circle
          cx="6"
          cy="6"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={`${c * fraction} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 6 6)"
        />
      )}
    </svg>
  );
}

/**
 * A compact ring: 16px with the habit's letter inside, always in the habit's hue. Done
 * fills it (white letter); a measured habit part-way shows its arc over a pale track;
 * today's open ring is solid; days covered by a quota (dashed), missed or not yet due
 * get the pale track and a lighter letter, the same states the 12px ring draws.
 */
function InitialRing({
  letter,
  fraction,
  status,
  colors,
}: {
  letter: string;
  fraction: number;
  status: string;
  colors: ReturnType<typeof habitColors>;
}) {
  const r = 7.25;
  const c = 2 * Math.PI * r;
  const text = "relative text-[9px] leading-none font-semibold";
  if (fraction >= 1) {
    return (
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full text-white"
        style={{ background: colors.badge }}
      >
        <span className={text}>{letter}</span>
      </span>
    );
  }
  const quiet = status === "covered" || status === "future" || status === "missed";
  return (
    <span
      className="relative flex h-4 w-4 items-center justify-center"
      style={{ color: quiet ? colors.initial : colors.label }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="absolute inset-0">
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke={quiet || fraction > 0 ? colors.track : colors.ring}
          strokeWidth="1.5"
          strokeDasharray={status === "covered" ? "2.5 2" : undefined}
        />
        {fraction > 0 && (
          <circle
            cx="8"
            cy="8"
            r={r}
            fill="none"
            stroke={colors.ring}
            strokeWidth="1.5"
            strokeDasharray={`${c * fraction} ${c}`}
            strokeLinecap="round"
            transform="rotate(-90 8 8)"
          />
        )}
      </svg>
      <span className={text}>{letter}</span>
    </span>
  );
}
