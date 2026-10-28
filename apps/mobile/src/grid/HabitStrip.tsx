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
import { Pressable, Text, View } from "react-native";
import { useApp } from "../lib/app";
import { hueFor } from "../lib/data";
import { Ring } from "../ui/controls";

/*
 * Habit chips under the day headers (PLAN §5.4 "day strip"): a ring per habit per
 * day that fills as it's done; tap toggles the day's entry. Narrow columns show rings
 * only; the single-day view shows titles and quota progress.
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
  const compact = columnWidth < 72 * habits.length + 16;
  // Three 24pt rings with 4pt gaps fit a week column on a 13" iPad (about 82pt).
  const statuses = habits.map((habit) => dayStatuses(habit, data.entries, days[0] ?? today, today));

  return (
    <View className="flex-row">
      {days.map((day) => (
        <View
          key={day}
          className={`min-w-0 flex-1 flex-row flex-wrap items-center pb-2 ${
            compact ? "gap-1 px-1" : "gap-1.5 px-3"
          }`}
        >
          {habits.map((habit, index) => {
            const entry = data.entries.find(
              (each) => each.habit_uuid === habit.uuid && each.date === day,
            );
            const value = entry?.value ?? 0;
            const status = day > today ? "future" : (statuses[index]?.get(day) ?? "open");
            const done = isDone(habit, value);
            const target = habit.kind === "measure" ? (habit.target ?? 1) : 1;
            const colors = habitColors(hueFor(habit), mode);
            return (
              <Pressable
                key={habit.uuid}
                accessibilityRole="button"
                accessibilityState={{ checked: done }}
                accessibilityLabel={habit.title}
                hitSlop={6}
                onPress={() => void actions.logHabit(habit.uuid, day, value ? 0 : target)}
                className={`flex-row items-center gap-1.5 rounded-full ${
                  compact ? "h-6 w-6 justify-center" : "h-7 pl-1.5 pr-2.5"
                } ${done ? "" : "bg-hover"}`}
                style={done ? { backgroundColor: colors.fill } : undefined}
              >
                <Ring
                  fraction={done ? 1 : Math.min(1, value / target)}
                  status={status}
                  color={colors.ring}
                  size={compact ? 14 : 16}
                />
                {!compact && (
                  <Text
                    numberOfLines={1}
                    className={`text-small font-medium ${done ? "" : "text-ink-2"}`}
                    style={[done && { color: colors.label }, { fontVariant: ["tabular-nums"] }]}
                  >
                    {label(habit, day, value, done, data.entries, today)}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// "Gym", "Read 15/20", or "Gym 2/3" for a weekly quota (on today's chip only).
export function label(
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
