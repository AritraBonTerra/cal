import { useActions, useCal } from "@cal/app-core";
import {
  type DayKey,
  type DayStatus,
  dayStatuses,
  type Habit,
  type HabitEntry,
  habitDay,
  quotaCount,
  startOfMonth,
  startOfWeek,
} from "@cal/domain";
import { habitColors } from "@cal/theme";
import { Plus } from "lucide-react";
import { useApp } from "../../lib/app";
import { hueFor } from "../../lib/data";
import { activeHabits } from "../../lib/habits";
import { HabitRing, QuotaPips, RingStroke } from "../habitRing";
import { ringLabels } from "./habitLabels";

/*
 * Habit chips under the day headers (PLAN §5.4 "day strip"): a ring per habit per
 * day that fills as it's done. A click logs the day: one more time for a times-a-day
 * habit (its ring is split into that many arcs), done for the rest, and it clears a day
 * that's already full; ⌥-click takes one time back. Days after today can't be logged.
 * Narrow columns show rings only, each in its habit's hue with the habit's initial
 * inside (see ringLabels), and the title and progress on hover. Today's chip shows a
 * weekly quota as dots. Today's column (the first if today isn't shown) ends with a
 * dashed + for New Habit…; with no habits it holds an "Add a habit" pill instead.
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
  const habits = activeHabits(data.habits).filter((habit) => habit.display === "strip");
  const compact = columnWidth < 60 * habits.length + 16;
  const anchor = days.includes(today) ? today : days[0];

  const statuses = habits.map((habit) => dayStatuses(habit, data.entries, days[0] ?? today, today));
  const letters = ringLabels(habits.map((habit) => habit.title));

  return (
    <div className="flex min-w-0 flex-1">
      {days.map((day) => (
        <div key={day} className="flex min-w-0 flex-1 flex-wrap gap-1 px-2 py-1">
          {habits.map((habit, index) => {
            const { value, done, fraction, segments, next, less } = habitDay(
              habit,
              data.entries,
              day,
            );
            const status = day > today ? "future" : (statuses[index]?.get(day) ?? "open");
            const colors = habitColors(hueFor(habit), mode);
            const title = tooltip(habit, day, data.entries, today);
            // Today's chip shows a weekly quota as dots, one per time owed.
            const weekly = habit.schedule === "quota" && habit.quota_period !== "month";
            const pips = weekly && day === today ? (habit.quota_count ?? 1) : 0;
            const log = (event: { altKey: boolean }) =>
              void actions.logHabit(habit.uuid, day, event.altKey ? less : next);
            if (compact) {
              return (
                <button
                  type="button"
                  key={habit.uuid}
                  title={title}
                  // The ring only has room for an initial; the name is the habit's.
                  aria-label={title}
                  aria-pressed={done}
                  disabled={day > today}
                  onClick={log}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full enabled:hover:bg-hover"
                >
                  <InitialRing
                    letter={letters[index] ?? ""}
                    fraction={fraction}
                    segments={segments}
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
                disabled={day > today}
                onClick={log}
                className={`flex h-5 shrink-0 items-center gap-1 rounded-full pr-2 pl-1 text-caption font-medium tnum ${
                  done ? "" : "bg-hover text-ink-2"
                }`}
                style={done ? { background: colors.fill, color: colors.label } : undefined}
              >
                <HabitRing
                  fraction={fraction}
                  status={status}
                  color={colors.ring}
                  segments={segments}
                />
                <span className="truncate">{label(habit, value, done)}</span>
                {pips > 0 && (
                  <QuotaPips
                    count={quotaCount(habit, data.entries, day) ?? 0}
                    total={pips}
                    color={colors.ring}
                  />
                )}
              </button>
            );
          })}
          {day === anchor && <AddHabit pill={habits.length === 0 && columnWidth >= 112} />}
        </div>
      ))}
    </div>
  );
}

// The dashed control that runs New Habit…: a 20px round + after the chips, or the
// "Add a habit" pill an empty strip shows in a column wide enough for it.
function AddHabit({ pill }: { pill: boolean }) {
  const { commands } = useCal();
  const dashed =
    "flex h-5 shrink-0 items-center rounded-full border border-edge-strong border-dashed text-ink-2 transition-colors duration-100 hover:bg-hover hover:duration-0";
  const plus = <Plus size={12} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" />;
  if (pill) {
    return (
      <button
        type="button"
        onClick={() => commands.run("habit.new")}
        className={`${dashed} gap-1 pr-2 pl-1.5 text-caption font-medium`}
        data-add-habit
      >
        {plus}
        Add a habit
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label="New Habit…"
      title="New Habit…"
      onClick={() => commands.run("habit.new")}
      className={`${dashed} w-5 justify-center`}
      data-add-habit
    >
      {plus}
    </button>
  );
}

// "Gym", or "Read 15/20" for a day that's part-way.
const label = (habit: Habit, value: number, done: boolean) =>
  habit.kind === "measure" && !done && value > 0
    ? `${habit.title} ${value}/${habit.target ?? 1}`
    : habit.title;

// A chip's hover text: "Read · 15/20 min", "Gym · 2/5 this week", or both parts.
function tooltip(habit: Habit, day: DayKey, entries: readonly HabitEntry[], today: DayKey) {
  const parts = [habit.title];
  if (habit.kind === "measure") {
    const { value, target } = habitDay(habit, entries, day);
    parts.push(`${value}/${target}${habit.unit ? ` ${habit.unit}` : ""}`);
  }
  const count = quotaCount(habit, entries, day);
  if (count !== undefined) {
    const month = habit.quota_period === "month";
    const start = month ? startOfMonth : startOfWeek;
    const which = start(day) === start(today) ? "this" : "that";
    parts.push(`${count}/${habit.quota_count ?? 1} ${which} ${month ? "month" : "week"}`);
  }
  return parts.join(" · ");
}

/**
 * A compact ring: 16px with the habit's letter inside, always in the habit's hue. Done
 * fills it (white letter); a habit part-way shows its arc (or its lit arcs, for a
 * times-a-day habit) over a pale track; today's open ring is solid; days covered by a
 * quota (dashed), missed or not yet due get the pale track and a lighter letter, the
 * same states the 12px ring draws.
 */
function InitialRing({
  letter,
  fraction,
  segments,
  status,
  colors,
}: {
  letter: string;
  fraction: number;
  segments: number;
  status: DayStatus | "future";
  colors: ReturnType<typeof habitColors>;
}) {
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
        <RingStroke
          size={16}
          r={7.25}
          fraction={fraction}
          segments={segments}
          lit={colors.ring}
          unlit={quiet || fraction > 0 ? colors.track : colors.ring}
          dashed={status === "covered"}
        />
      </svg>
      <span className={text}>{letter}</span>
    </span>
  );
}
