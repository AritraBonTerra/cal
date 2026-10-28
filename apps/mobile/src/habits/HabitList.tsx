import { useActions } from "@cal/app-core";
import { dayRange, dayStatuses, habitStats, isDone, startOfWeek } from "@cal/domain";
import { habitColors } from "@cal/theme";
import { LegendList } from "@legendapp/list/react-native";
import { Flame, Repeat } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { SidebarToggle } from "../ipad/SidebarToggle";
import { useApp } from "../lib/app";
import { hueFor } from "../lib/data";
import { useColors } from "../lib/theme";
import { Ring } from "../ui/controls";

/*
 * Today's habits (PLAN §5.4): a large check ring per habit that logs today, the
 * streak and Loop's habit strength underneath, and this week's days as small rings.
 */
export function HabitList({
  topInset = 0,
  bottomInset = 0,
  toggle,
}: {
  topInset?: number;
  bottomInset?: number;
  // The iPad pane: the sidebar toggle and a pane-sized title instead of the large one.
  toggle?: boolean;
}) {
  const { data, today, mode } = useApp();
  const colors = useColors();
  const actions = useActions();
  const habits = data.habits.filter((habit) => habit.archived_at === undefined);
  const week = dayRange(startOfWeek(today), 7);

  return (
    <LegendList
      data={habits}
      keyExtractor={(habit) => habit.uuid}
      estimatedItemSize={92}
      recycleItems
      contentContainerStyle={{ paddingTop: topInset + 8, paddingBottom: bottomInset + 32 }}
      ListHeaderComponent={
        toggle ? (
          <View className="flex-row items-center gap-2.5 pb-2 pl-2 pr-4 pt-2">
            <SidebarToggle />
            <Repeat size={24} color={colors.accent} strokeWidth={1.5} absoluteStrokeWidth />
            <Text className="flex-1 text-title-2 font-semibold text-ink">Habits</Text>
          </View>
        ) : (
          <View className="px-5 pb-3">
            <Text className="text-title-1 font-bold text-ink">Habits</Text>
          </View>
        )
      }
      ListEmptyComponent={
        <View className="items-center px-8 pt-16">
          <Text className="text-center text-body text-ink-2">
            No habits yet. Add one on the Mac.
          </Text>
        </View>
      }
      renderItem={({ item: habit }) => {
        const own = data.entries.filter((entry) => entry.habit_uuid === habit.uuid);
        const value = own.find((entry) => entry.date === today)?.value ?? 0;
        const target = habit.kind === "measure" ? (habit.target ?? 1) : 1;
        const done = isDone(habit, value);
        const stats = habitStats(habit, data.entries, today);
        const statuses = dayStatuses(habit, own, week[0] ?? today, today);
        const palette = habitColors(hueFor(habit), mode);
        const schedule =
          habit.schedule === "quota"
            ? `${habit.quota_count ?? 1}× per ${habit.quota_period ?? "week"}`
            : habit.schedule === "interval"
              ? `Every ${habit.interval_days ?? 1} days`
              : "Daily";
        const measure =
          habit.kind === "measure" ? ` · ${value}/${target} ${habit.unit ?? ""}`.trimEnd() : "";
        return (
          <View className="mx-4 mb-3 rounded-lg bg-canvas px-4 py-3">
            <View className="flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ checked: done }}
                accessibilityLabel={`${habit.title}, ${done ? "done" : "not done"} today`}
                onPress={() => void actions.logHabit(habit.uuid, today, value ? 0 : target)}
                hitSlop={6}
                className="h-11 w-11 items-center justify-center"
              >
                <Ring
                  fraction={done ? 1 : Math.min(1, value / target)}
                  color={palette.ring}
                  size={36}
                />
              </Pressable>
              <View className="min-w-0 flex-1">
                <Text className="text-body font-medium text-ink" numberOfLines={1}>
                  {habit.title}
                </Text>
                <Text
                  className="text-small text-ink-3"
                  style={{ fontVariant: ["tabular-nums"] }}
                  numberOfLines={1}
                >
                  {schedule}
                  {measure}
                </Text>
              </View>
              <View className="items-end">
                <View className="flex-row items-center gap-1">
                  <Flame
                    size={14}
                    color={stats.streak > 0 ? colors.warning : colors["ink-3"]}
                    strokeWidth={1.5}
                    absoluteStrokeWidth
                  />
                  <Text
                    className="text-body font-semibold text-ink"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {stats.streak}
                  </Text>
                </View>
                <Text className="text-caption text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
                  {Math.round(stats.score * 100)}% strength
                </Text>
              </View>
            </View>
            <View className="mt-3 flex-row justify-between pl-1 pr-1">
              {week.map((day) => {
                const dayValue = own.find((entry) => entry.date === day)?.value ?? 0;
                const status = day > today ? "future" : (statuses.get(day) ?? "open");
                const dayDone = isDone(habit, dayValue);
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="button"
                    accessibilityLabel={day}
                    disabled={day > today}
                    onPress={() => void actions.logHabit(habit.uuid, day, dayValue ? 0 : target)}
                    className="h-11 w-9 items-center justify-center gap-1.5"
                  >
                    <Ring
                      fraction={dayDone ? 1 : Math.min(1, dayValue / target)}
                      status={status}
                      color={palette.ring}
                      size={18}
                    />
                    <Text
                      className={`text-caption ${day === today ? "font-semibold text-now" : "text-ink-3"}`}
                    >
                      {["M", "T", "W", "T", "F", "S", "S"][week.indexOf(day)]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      }}
    />
  );
}
