import {
  addDays,
  type DayKey,
  daysBetween,
  daysInMonth,
  startOfMonth,
  startOfWeek,
  toDayKey,
  weekday,
} from "./dates";
import type { Habit, HabitEntry } from "./tasks";

/*
 * Habit progress, always derived from the entry log (PLAN §5.4). The main number is
 * Loop's habit strength; streaks allow one missed day but never two in a row; the total
 * never resets.
 */

// How a day stands for a habit: done (logged), covered (a quota or interval already
// met), off (a fixed habit's unscheduled day), missed, or open (today, not yet done).
export type DayStatus = "done" | "covered" | "off" | "missed" | "open";

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// The weekdays a fixed habit is scheduled on: its RRULE's BYDAY, or every day.
export function scheduledWeekdays(habit: Habit) {
  const byDay = habit.rrule?.match(/BYDAY=([A-Z,]+)/)?.[1];
  if (!byDay) return [0, 1, 2, 3, 4, 5, 6];
  return byDay
    .split(",")
    .map((code) => WEEKDAYS.indexOf(code))
    .filter((day) => day >= 0);
}

/**
 * One entry per habit and day, the most recently updated. Logging replaces a day's
 * entry, but two devices logging the same day offline each create one and sync keeps
 * both, so everything that reads entries goes through this.
 */
export function latestEntries(entries: readonly HabitEntry[]) {
  const latest = new Map<string, HabitEntry>();
  for (const entry of entries) {
    const key = `${entry.habit_uuid}|${entry.date}`;
    const current = latest.get(key);
    const newer =
      !current ||
      entry.updated_at > current.updated_at ||
      (entry.updated_at === current.updated_at && entry.uuid > current.uuid);
    if (newer) latest.set(key, entry);
  }
  return [...latest.values()];
}

// Whether a logged value counts as done: any check, or reaching a measure's target.
export const isDone = (habit: Habit, value: number) =>
  habit.kind === "check" ? value > 0 : value >= (habit.target ?? 1);

/**
 * Whether a habit is counted in whole times a day ("brush teeth twice"): a measure
 * with no unit. Each click logs one more, where a measure with a unit ("20 min") logs
 * its whole target at once.
 */
export const countsTimes = (habit: Habit) => habit.kind === "measure" && !habit.unit;

// The most parts a ring is split into; a larger count draws one continuous arc.
const MAX_SEGMENTS = 6;

/**
 * A habit on one day, as its ring and its click need it:
 * - `value` logged against `target` (1 for done-or-not), `done`, and how full the ring is;
 * - `segments`, the parts the ring is split into (one per time, for a times-a-day habit
 *   with a small whole target);
 * - `next`, the value a click logs: one more for a times-a-day habit, the whole target
 *   otherwise (also from part-way), and 0 (clear the day) once the day is done;
 * - `less`, the value an ⌥-click or long press logs: one time fewer, or 0.
 * `entries` holds one entry per habit and day (see latestEntries).
 */
export function habitDay(habit: Habit, entries: readonly HabitEntry[], day: DayKey) {
  const value =
    entries.find((entry) => entry.habit_uuid === habit.uuid && entry.date === day)?.value ?? 0;
  const target = habit.kind === "measure" ? (habit.target ?? 1) : 1;
  const done = isDone(habit, value);
  const times = countsTimes(habit);
  return {
    value,
    target,
    done,
    fraction: done ? 1 : Math.min(1, value / target),
    segments:
      times && Number.isInteger(target) && target >= 2 && target <= MAX_SEGMENTS ? target : 1,
    next: done ? 0 : times ? Math.min(target, Math.floor(value) + 1) : target,
    less: times ? Math.max(0, Math.ceil(value) - 1) : 0,
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

/**
 * A habit's progress in words, always naming its period so a count per day never reads
 * like a count per week: "1/2 today", "15/20 min", "2/5 this week". A habit with both
 * shows both, shortened ("1/2 day · 2/5 wk"). "" for a habit that's simply done or not.
 */
export function habitProgress(habit: Habit, entries: readonly HabitEntry[], today: DayKey) {
  const count = quotaCount(habit, entries, today);
  const quota = count === undefined ? undefined : `${count}/${habit.quota_count ?? 1}`;
  const month = habit.quota_period === "month";
  if (habit.kind !== "measure") return quota ? `${quota} this ${month ? "month" : "week"}` : "";
  const { value, target } = habitDay(habit, entries, today);
  const amount = `${value}/${target}`;
  const unit = habit.unit ? ` ${habit.unit}` : "";
  if (quota) return `${amount}${unit || " day"} · ${quota} ${month ? "mo" : "wk"}`;
  return `${amount}${unit || " today"}`;
}

/*
 * Expected completions per scored day, for Loop's score multiplier. Fixed habits are
 * scored only on their scheduled days, so each of those counts as one expected check.
 */
function frequency(habit: Habit) {
  switch (habit.schedule) {
    case "quota":
      return (habit.quota_count ?? 1) / (habit.quota_period === "month" ? 30 : 7);
    case "interval":
      return 1 / Math.max(1, habit.interval_days ?? 1);
    case "fixed":
      return 1;
  }
}

/**
 * Status of each day from `from` to `today` inclusive. Quotas count within a rolling
 * window (7 or 30 days) so a habit done 3 times this week covers its other days.
 */
export function dayStatuses(
  habit: Habit,
  entries: readonly HabitEntry[],
  from: DayKey,
  today: DayKey,
) {
  const done = new Set(
    latestEntries(entries)
      .filter((entry) => entry.habit_uuid === habit.uuid && isDone(habit, entry.value))
      .map((entry) => entry.date),
  );
  const fixedDays = scheduledWeekdays(habit);
  const statuses = new Map<DayKey, DayStatus>();
  for (let day = from; day <= today; day = addDays(day, 1)) {
    if (done.has(day)) {
      statuses.set(day, "done");
      continue;
    }
    if (habit.schedule === "fixed" && !fixedDays.includes(weekday(day))) {
      statuses.set(day, "off");
      continue;
    }
    let covered = false;
    if (habit.schedule === "quota") {
      const window = habit.quota_period === "month" ? 30 : 7;
      let count = 0;
      for (let back = 1; back < window; back++) if (done.has(addDays(day, -back))) count++;
      covered = count >= (habit.quota_count ?? 1);
    }
    if (habit.schedule === "interval") {
      const interval = Math.max(1, habit.interval_days ?? 1);
      for (let back = 1; back < interval && !covered; back++)
        covered = done.has(addDays(day, -back));
    }
    statuses.set(day, covered ? "covered" : day === today ? "open" : "missed");
  }
  return statuses;
}

export interface HabitStats {
  // Loop's habit strength, 0–1.
  score: number;
  // Consecutive successful days, forgiving single misses.
  streak: number;
  total: number;
}

/**
 * Strength, streak and total for a habit as of `today`. Strength follows Loop:
 * `score = previous·m + checked·(1−m)` per day with `m = 0.5^(√f/13)`, where `f` is
 * expected completions per day, so frequent habits respond faster.
 */
export function habitStats(
  habit: Habit,
  entries: readonly HabitEntry[],
  today: DayKey,
): HabitStats {
  const own = latestEntries(entries).filter((entry) => entry.habit_uuid === habit.uuid);
  const first =
    [toDayKey(new Date(habit.created_at)), ...own.map((entry) => entry.date)].sort()[0] ?? today;
  const statuses = dayStatuses(habit, own, first, today);
  const multiplier = 0.5 ** (Math.sqrt(frequency(habit)) / 13);

  let score = 0;
  for (const status of statuses.values()) {
    if (status === "open" || status === "off") continue;
    score = score * multiplier + (status === "missed" ? 0 : 1) * (1 - multiplier);
  }

  let streak = 0;
  let missedBefore = false;
  for (let day = today; daysBetween(first, day) >= 0; day = addDays(day, -1)) {
    const status = statuses.get(day);
    if (status === "done") streak++;
    if (status === "missed") {
      if (missedBefore) break;
      missedBefore = true;
      continue;
    }
    if (status === "done" || status === "covered") missedBefore = false;
  }

  return { score, streak, total: own.filter((entry) => isDone(habit, entry.value)).length };
}
