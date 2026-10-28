import { dayRange } from "@cal/domain";
import { router } from "expo-router";
import { CalendarDays, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCalendarAccess } from "../lib/account";
import { useApp } from "../lib/app";
import { useColors } from "../lib/theme";
import { formatSpan } from "../lib/time";
import { showDays, useView } from "../lib/view";
import { DaysPager } from "./DaysPager";

/*
 * The calendar: a title for the visible span, Today, the day-count switch (1 or 3 on
 * iPhone, up to a week on iPad), the pager, and a floating + for Quick Entry.
 */
export function CalendarScreen({
  counts,
  inset = true,
}: {
  counts: readonly number[];
  inset?: boolean;
}) {
  const { today } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const anchor = useView((state) => state.anchor);
  const count = useView((state) => state.count);
  const { access, request } = useCalendarAccess();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const days = dayRange(anchor, count);
  const last = days[days.length - 1] ?? anchor;
  const atToday = days.includes(today);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: inset ? insets.top : 0 }}>
      <View className="h-14 flex-row items-center gap-2 pl-4 pr-3">
        <Text className="flex-1 text-title-2 font-bold text-ink" numberOfLines={1}>
          {formatSpan(anchor, last)}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => showDays(count, today)}
          hitSlop={4}
          className={`h-9 justify-center rounded-md px-3 active:bg-hover ${atToday ? "" : "bg-hover"}`}
        >
          <Text className={`text-body font-medium ${atToday ? "text-ink-3" : "text-ink"}`}>
            Today
          </Text>
        </Pressable>
        <View className="h-9 flex-row rounded-md bg-hover p-0.5">
          {counts.map((each) => (
            <Pressable
              key={each}
              accessibilityRole="button"
              accessibilityState={{ selected: each === count }}
              onPress={() => showDays(each, atToday ? today : anchor)}
              className={`h-8 min-w-9 items-center justify-center rounded-[5px] px-2 ${
                each === count ? "bg-canvas shadow-sm" : ""
              }`}
            >
              <Text
                className={`text-body ${each === count ? "font-semibold text-ink" : "text-ink-2"}`}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {each === 7 ? "Week" : each === 1 ? "Day" : `${each} days`}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {access !== "fullAccess" && (
        <View className="mx-4 mb-2 flex-row items-center gap-3 rounded-lg bg-hover px-3 py-2">
          <CalendarDays size={16} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
          <Text className="flex-1 text-small text-ink-2">Cal can't see your calendars yet.</Text>
          <Pressable accessibilityRole="button" onPress={() => void request()} hitSlop={8}>
            <Text className="text-small font-semibold text-accent">Allow access</Text>
          </Pressable>
        </View>
      )}

      <View
        className="flex-1"
        onLayout={({ nativeEvent: { layout } }) =>
          setSize({ width: layout.width, height: layout.height })
        }
      >
        {size.width > 0 && <DaysPager width={size.width} height={size.height} />}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New to-do"
        onPress={() => router.push("/quick-entry")}
        className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-accent-solid active:opacity-80"
        style={{
          bottom: 20 + (inset ? 0 : insets.bottom),
          shadowColor: colors["accent-solid"],
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Plus size={26} color={colors.white} strokeWidth={2.25} absoluteStrokeWidth />
      </Pressable>
    </View>
  );
}
