import {
  addDays,
  byPosition,
  type DayKey,
  daysInMonth,
  type Habit,
  type HabitEntry,
  isDone,
  startOfMonth,
  startOfWeek,
} from "@cal/domain";
import type { NewRow } from "@cal/sync";

/*
 * The New Habit form's choices and the `habits` row they make, plus how a habit stands
 * on a day, which the day strip and the sidebar both read. The form keeps numbers as
 * typed text; `habitRow` checks them and maps the four schedule choices onto the row's
 * fields (PLAN §5.4): every day and specific weekdays are fixed RRULEs, "N times per
 * week or month" is a quota, and "every N days" an interval.
 */

export type HabitSchedule = "daily" | "weekdays" | "quota" | "interval";

export interface HabitDraft {
  title: string;
  schedule: HabitSchedule;
  // Days for "weekdays", 0 = Sunday.
  weekdays: readonly number[];
  // Times per period, for "quota".
  count: string;
  period: "week" | "month";
  // Days between, for "interval".
  every: string;
  // Measured habits log an amount toward a target ("20 min"); others are done or not.
  measured: boolean;
  target: string;
  unit: string;
}

export const emptyHabit: HabitDraft = {
  title: "",
  schedule: "daily",
  weekdays: [1, 3, 5],
  count: "3",
  period: "week",
  every: "2",
  measured: false,
  target: "",
  unit: "",
};

const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// A whole number typed into a field, if it's between `min` and `max`.
function whole(text: string, min: number, max: number) {
  const value = Number(text.trim());
  return /^\d+$/.test(text.trim()) && value >= min && value <= max ? value : undefined;
}

type HabitRow = Omit<NewRow<"habits">, "position">;
type ScheduleFields = Pick<
  HabitRow,
  "schedule" | "rrule" | "quota_count" | "quota_period" | "interval_days"
>;

// The schedule fields of a draft, or undefined while a number is missing or out of range.
function scheduleFields(draft: HabitDraft): ScheduleFields | undefined {
  switch (draft.schedule) {
    case "daily":
      return { schedule: "fixed", rrule: "FREQ=DAILY" };
    case "weekdays": {
      const days = [...new Set(draft.weekdays)]
        .filter((day) => day >= 0 && day < 7)
        .sort((a, b) => a - b);
      if (days.length === 0) return undefined;
      if (days.length === 7) return { schedule: "fixed", rrule: "FREQ=DAILY" };
      const byDay = days.map((day) => RRULE_DAYS[day]).join(",");
      return { schedule: "fixed", rrule: `FREQ=WEEKLY;BYDAY=${byDay}` };
    }
    case "quota": {
      const count = whole(draft.count, 1, draft.period === "week" ? 7 : 31);
      return count === undefined
        ? undefined
        : { schedule: "quota", quota_count: count, quota_period: draft.period };
    }
    case "interval": {
      const days = whole(draft.every, 1, 365);
      return days === undefined ? undefined : { schedule: "interval", interval_days: days };
    }
  }
}

/**
 * The row a draft makes, shown in the day strip, or null while it's incomplete: no
 * title, no weekday picked, or a count, interval or target that isn't a usable number.
 */
export function habitRow(draft: HabitDraft): HabitRow | null {
  const title = draft.title.trim();
  const schedule = scheduleFields(draft);
  if (!title || !schedule) return null;
  const base = { title, display: "strip" as const, ...schedule };
  if (!draft.measured) return { ...base, kind: "check" };
  const target = Number(draft.target.trim());
  if (!draft.target.trim() || !Number.isFinite(target) || target <= 0) return null;
  const unit = draft.unit.trim();
  return { ...base, kind: "measure", target, ...(unit && { unit }) };
}

// Habits that aren't archived, in `position` order.
export const activeHabits = (habits: readonly Habit[]) =>
  habits.filter((habit) => habit.archived_at === undefined).sort(byPosition);

/**
 * A habit on one day: the amount logged, its target (1 for done-or-not), whether it's
 * done, how full its ring is, and the value a click logs (the target, or 0 to uncheck).
 */
export function habitDay(habit: Habit, entries: readonly HabitEntry[], day: DayKey) {
  const value =
    entries.find((entry) => entry.habit_uuid === habit.uuid && entry.date === day)?.value ?? 0;
  const target = habit.kind === "measure" ? (habit.target ?? 1) : 1;
  const done = isDone(habit, value);
  return {
    value,
    target,
    done,
    fraction: done ? 1 : Math.min(1, value / target),
    toggle: value ? 0 : target,
  };
}

// Days a quota habit was done in the period holding `day`: its Monday-to-Sunday week or
// its calendar month. Undefined for habits without a quota.
export function quotaCount(habit: Habit, entries: readonly HabitEntry[], day: DayKey) {
  if (habit.schedule !== "quota") return undefined;
  const month = habit.quota_period === "month";
  const first = month ? startOfMonth(day) : startOfWeek(day);
  const last = addDays(first, month ? daysInMonth(day) - 1 : 6);
  return entries.filter(
    (entry) =>
      entry.habit_uuid === habit.uuid &&
      entry.date >= first &&
      entry.date <= last &&
      isDone(habit, entry.value),
  ).length;
}

// Today's progress as the sidebar shows it: "15/20 min" for a measured habit, "2/3" for a
// quota, or "" for a habit that's simply done or not.
export function habitProgress(habit: Habit, entries: readonly HabitEntry[], today: DayKey) {
  if (habit.kind === "measure") {
    const { value, target } = habitDay(habit, entries, today);
    return `${value}/${target}${habit.unit ? ` ${habit.unit}` : ""}`;
  }
  const count = quotaCount(habit, entries, today);
  return count === undefined ? "" : `${count}/${habit.quota_count ?? 1}`;
}
