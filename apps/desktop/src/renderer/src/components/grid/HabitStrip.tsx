import { useActions, useCal } from "@cal/app-core";
import { type DayKey, type DayStatus, dayStatuses, type Habit, type HabitEntry } from "@cal/domain";
import { habitColors } from "@cal/theme";
import { Plus } from "lucide-react";
import { useApp } from "../../lib/app";
import { hueFor } from "../../lib/data";
import { activeHabits, habitDay, quotaCount } from "../../lib/habits";
import { HabitRing } from "../habitRing";
import { ringLabels } from "./habitLabels";

/*
 * Habit chips under the day headers (PLAN §5.4 "day strip"): a ring per habit per
 * day that fills as it's done; click toggles the day's entry. Narrow columns show rings
 * only, each in its habit's hue with the habit's initial inside (see ringLabels), and
 * the title on hover. Today's column (the first if today isn't shown) ends with a dashed
 * + for New Habit…; with no habits it holds an "Add a habit" pill instead.
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
            const { value, target, done, fraction, toggle } = habitDay(habit, data.entries, day);
            const status = day > today ? "future" : (statuses[index]?.get(day) ?? "open");
            const colors = habitColors(hueFor(habit), mode);
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
                  onClick={() => void actions.logHabit(habit.uuid, day, toggle)}
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
                onClick={() => void actions.logHabit(habit.uuid, day, toggle)}
                className={`flex h-5 shrink-0 items-center gap-1 rounded-full pr-2 pl-1 text-caption font-medium tnum ${
                  done ? "" : "bg-hover text-ink-2"
                }`}
                style={done ? { background: colors.fill, color: colors.label } : undefined}
              >
                <HabitRing fraction={fraction} status={status} color={colors.ring} />
                <span className="truncate">
                  {label(habit, day, value, done, data.entries, today)}
                </span>
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
  if (habit.schedule === "quota" && habit.quota_period !== "month" && day === today)
    return `${habit.title} ${quotaCount(habit, entries, day)}/${habit.quota_count ?? 1}`;
  return habit.title;
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
  status: DayStatus | "future";
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
