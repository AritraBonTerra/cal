import type { DayKey } from "@cal/domain";
import { Pressable, Text, View } from "react-native";
import { useApp } from "../lib/app";
import { dayNumber, formatWeekday } from "../lib/time";
import { showDays } from "../lib/view";

// Weekday and date per column; today gets the red badge. Tap a day to open it alone.
export function DayHeaders({
  days,
  columnWidth,
}: {
  days: readonly DayKey[];
  columnWidth: number;
}) {
  const { today } = useApp();
  const narrow = columnWidth < 96;
  const single = days.length === 1;
  return (
    <View className="flex-row">
      {days.map((day) => {
        const isToday = day === today;
        const weekday = formatWeekday(day, single);
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={`${weekday} ${dayNumber(day)}`}
            onPress={() => showDays(1, day)}
            disabled={single}
            className={`h-13 min-w-0 flex-1 flex-row items-center ${
              single ? "gap-2 px-3" : narrow ? "flex-col justify-center gap-0 px-1" : "gap-1.5 px-2"
            }`}
          >
            <Text
              numberOfLines={1}
              className={`${single ? "text-title-3" : "text-small"} ${
                isToday ? "font-medium text-now" : "text-ink-2"
              }`}
            >
              {narrow && !single ? weekday.slice(0, 3) : weekday}
            </Text>
            <View
              className={`h-6 min-w-6 items-center justify-center rounded-md px-1 ${
                isToday ? "bg-now" : ""
              }`}
            >
              <Text
                className={`${single ? "text-title-3" : "text-body"} font-semibold ${
                  isToday ? "text-white" : "text-ink"
                }`}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {dayNumber(day)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
