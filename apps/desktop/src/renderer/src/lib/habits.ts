import { byPosition, type Habit } from "@cal/domain";
import type { NewRow } from "@cal/sync";

/*
 * The New Habit form's choices and the `habits` row they make. The form keeps numbers
 * as typed text; `habitRow` checks them and maps the four schedule choices onto the
 * row's fields (PLAN §5.4): every day and specific weekdays are fixed RRULEs, "N times
 * per week or month" is a quota, and "every N days" an interval. How a habit stands on
 * a day (habitDay, habitProgress) lives in @cal/domain, shared with the iOS app.
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
  // What a day logs: done or not, a number of times ("twice a day"), or an amount
  // toward a target ("20 min").
  track: "check" | "times" | "amount";
  // Times a day, for "times".
  times: string;
  // For "amount".
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
  track: "check",
  times: "2",
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
 * title, no weekday picked, or a count, interval, times or target that isn't a usable
 * number.
 */
export function habitRow(draft: HabitDraft): HabitRow | null {
  const title = draft.title.trim();
  const schedule = scheduleFields(draft);
  if (!title || !schedule) return null;
  const base = { title, display: "strip" as const, ...schedule };
  if (draft.track === "check") return { ...base, kind: "check" };
  if (draft.track === "times") {
    // Counted in whole times: a measure without a unit (see countsTimes). Once a day is
    // plain done-or-not.
    const times = whole(draft.times, 1, 20);
    if (times === undefined) return null;
    return times === 1 ? { ...base, kind: "check" } : { ...base, kind: "measure", target: times };
  }
  const target = Number(draft.target.trim());
  if (!draft.target.trim() || !Number.isFinite(target) || target <= 0) return null;
  const unit = draft.unit.trim();
  return { ...base, kind: "measure", target, ...(unit && { unit }) };
}

// Habits that aren't archived, in `position` order.
export const activeHabits = (habits: readonly Habit[]) =>
  habits.filter((habit) => habit.archived_at === undefined).sort(byPosition);
