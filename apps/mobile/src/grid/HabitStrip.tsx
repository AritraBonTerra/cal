import { useActions } from "@cal/app-core";
import {
  type DayKey,
  dayStatuses,
  type Habit,
  type HabitEntry,
  habitDay,
  quotaCount,
} from "@cal/domain";
import { habitColors } from "@cal/theme";
import { Pressable, Text, View } from "react-native";
import { useApp } from "../lib/app";
import { hueFor } from "../lib/data";
import { Ring } from "../ui/controls";

/*
 * Habit chips under the day headers (PLAN §5.4 "day strip"): a ring per habit per
 * day that fills as it's done. A tap logs the day: one more time for a times-a-day
 * habit (its ring is split into that many arcs), done for the rest, and it clears a day
 * that's already full; a long press takes one time back. Days after today can't be
 * logged. Narrow columns show rings only; the single-day view shows titles and quota
 * progress.
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
            const { value, done, fraction, segments, next, less } = habitDay(
              habit,
              data.entries,
              day,
            );
            const status = day > today ? "future" : (statuses[index]?.get(day) ?? "open");
            const colors = habitColors(hueFor(habit), mode);
            return (
              <Pressable
                key={habit.uuid}
                accessibilityRole="button"
                accessibilityState={{ checked: done }}
                accessibilityLabel={habit.title}
                hitSlop={6}
                disabled={day > today}
                onPress={() => void actions.logHabit(habit.uuid, day, next)}
                onLongPress={() => void actions.logHabit(habit.uuid, day, less)}
                className={`flex-row items-center gap-1.5 rounded-full ${
                  compact ? "h-6 w-6 justify-center" : "h-7 pl-1.5 pr-2.5"
                } ${done ? "" : "bg-hover"}`}
                style={done ? { backgroundColor: colors.fill } : undefined}
              >
                <Ring
                  fraction={fraction}
                  status={status}
                  color={colors.ring}
                  size={compact ? 14 : 16}
                  segments={segments}
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

// "Gym", "Read 15/20", or "Gym 2/3 this week" for a weekly quota (on today's chip only).
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
  if (habit.schedule === "quota" && habit.quota_period !== "month" && day === today)
    return `${habit.title} ${quotaCount(habit, entries, day)}/${habit.quota_count ?? 1} this week`;
  return habit.title;
}
