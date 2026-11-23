import type { DayKey } from "@cal/domain";
import { Pressable, Text, View } from "react-native";
import { useApp } from "../lib/app";
import { dayNumber, formatFullDate } from "../lib/time";
import { jumpAgenda, useView } from "../lib/view";

export const ROW = 48;

export interface DayCellsProps {
  days: readonly DayKey[];
  // Colors of the events on each day, in time order.
  dots: ReadonlyMap<DayKey, readonly string[]>;
  // The month ("2026-10") the other days step back from, in the month grid.
  month?: string;
}

// Days in rows of seven: today's badge, the selected day's fill, and up to four dots for
// its events. Tap a day to scroll the agenda to it.
export function DayCells({ days, dots, month }: DayCellsProps) {
  const { today } = useApp();
  const selected = useView((state) => state.selected);
  return (
    <View className="flex-row flex-wrap bg-canvas">
      {days.map((day) => {
        const marks = dots.get(day) ?? [];
        const isToday = day === today;
        const isSelected = day === selected;
        const other = month !== undefined && !day.startsWith(month);
        const events =
          marks.length === 0 ? "" : marks.length === 1 ? ", 1 event" : `, ${marks.length} events`;
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={`${formatFullDate(day)}${isToday ? ", today" : ""}${events}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => jumpAgenda(day)}
            className="items-center pt-0.5"
            style={{ width: `${100 / 7}%`, height: ROW }}
          >
            <View
              className={`h-9 w-9 items-center justify-center rounded-lg ${
                isSelected ? "bg-active" : ""
              }`}
            >
              <View
                className={`h-7 min-w-7 items-center justify-center rounded-md px-1 ${
                  isToday ? "bg-now" : ""
                }`}
              >
                <Text
                  className={`text-body ${isToday || isSelected ? "font-semibold" : ""} ${
                    isToday ? "text-white" : other ? "text-ink-3" : "text-ink"
                  }`}
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {dayNumber(day)}
                </Text>
              </View>
            </View>
            <View className="h-1 flex-row gap-0.5">
              {marks.slice(0, 4).map((color, index) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: the dots are their positions.
                  key={index}
                  className="h-1 w-1 rounded-full"
                  style={{ backgroundColor: color, opacity: other ? 0.5 : 1 }}
                />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
