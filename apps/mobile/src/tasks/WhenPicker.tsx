import {
  addDays,
  addMonths,
  type DayKey,
  dayRange,
  daysInMonth,
  startOfMonth,
  startOfWeek,
  type Task,
  weekday,
} from "@cal/domain";
import { Archive, ChevronLeft, ChevronRight, Layers, Moon, Star, Sun } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useApp } from "../lib/app";
import { useColors } from "../lib/theme";
import { dayNumber, formatMonthYear } from "../lib/time";

/*
 * Things' When choices, laid out for touch: Today, This Evening, Tomorrow, a month
 * grid, Anytime and Someday. Also used for deadlines, with only the grid.
 */
interface WhenPickerProps {
  when?: Task["when"];
  date?: DayKey;
  onChoose: (when: Task["when"] | "deadline", day?: DayKey) => void;
  // Deadline mode: just the calendar, and a way to clear.
  deadline?: boolean;
}

export function WhenPicker({ when, date, onChoose, deadline }: WhenPickerProps) {
  const { today } = useApp();
  const colors = useColors();
  const [month, setMonth] = useState(startOfMonth(date ?? today));
  const first = startOfWeek(month);
  const rows = daysInMonth(month) + ((weekday(month) + 6) % 7) > 35 ? 6 : 5;
  const days = dayRange(first, rows * 7);
  const choose = (value: Task["when"], day?: DayKey) =>
    onChoose(deadline ? "deadline" : value, day);

  return (
    <View className="rounded-lg bg-canvas">
      {!deadline && (
        <View className="flex-row gap-2 px-3 pt-3">
          <Quick
            icon={<Star size={16} color={colors.warning} strokeWidth={1.5} absoluteStrokeWidth />}
            label="Today"
            active={when === "date" && date === today}
            onPress={() => choose("date", today)}
          />
          <Quick
            icon={<Moon size={16} color={colors.accent} strokeWidth={1.5} absoluteStrokeWidth />}
            label="Evening"
            active={when === "evening" && date === today}
            onPress={() => choose("evening", today)}
          />
          <Quick
            icon={<Sun size={16} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />}
            label="Tomorrow"
            active={when === "date" && date === addDays(today, 1)}
            onPress={() => choose("date", addDays(today, 1))}
          />
        </View>
      )}

      <View className="px-3 pt-3">
        <View className="h-9 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            hitSlop={8}
            onPress={() => setMonth(addMonths(month, -1))}
            className="h-9 w-9 items-center justify-center rounded-md active:bg-hover"
          >
            <ChevronLeft size={18} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
          </Pressable>
          <Text
            className="text-body font-semibold text-ink"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {formatMonthYear(month)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            hitSlop={8}
            onPress={() => setMonth(addMonths(month, 1))}
            className="h-9 w-9 items-center justify-center rounded-md active:bg-hover"
          >
            <ChevronRight size={18} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
          </Pressable>
        </View>
        <View className="flex-row">
          {["M", "T", "W", "T", "F", "S", "S"].map((letter, index) => (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday letters.
              key={index}
              className="h-6 flex-1 text-center text-caption font-medium text-ink-3"
            >
              {letter}
            </Text>
          ))}
        </View>
        <View className="flex-row flex-wrap pb-2">
          {days.map((day) => {
            const inMonth = day.slice(0, 7) === month.slice(0, 7);
            const isToday = day === today;
            const chosen = day === date;
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={day}
                onPress={() => choose("date", day)}
                className="h-10 items-center justify-center"
                style={{ width: `${100 / 7}%` }}
              >
                <View
                  className={`h-8 w-8 items-center justify-center rounded-full ${
                    chosen ? "bg-accent" : ""
                  }`}
                >
                  <Text
                    className={`text-body ${
                      chosen
                        ? "font-semibold text-white"
                        : isToday
                          ? "font-semibold text-now"
                          : inMonth
                            ? "text-ink"
                            : "text-ink-3"
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
      </View>

      {!deadline && (
        <View className="flex-row gap-2 border-t border-grid px-3 py-3">
          <Quick
            icon={
              <Layers size={16} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
            }
            label="Anytime"
            active={when === "anytime"}
            onPress={() => choose("anytime")}
          />
          <Quick
            icon={
              <Archive size={16} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
            }
            label="Someday"
            active={when === "someday"}
            onPress={() => choose("someday")}
          />
        </View>
      )}
      {deadline && date && (
        <View className="border-t border-grid px-3 py-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => onChoose("deadline", undefined)}
            className="h-11 items-center justify-center rounded-md active:bg-hover"
          >
            <Text className="text-body text-now">Remove deadline</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Quick({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-md ${
        active ? "bg-accent-soft" : "bg-hover active:bg-active"
      }`}
    >
      {icon}
      <Text className={`text-body font-medium ${active ? "text-accent" : "text-ink"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
