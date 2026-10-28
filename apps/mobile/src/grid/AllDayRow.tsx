import type { ExternalEvent } from "@cal/calendar-source";
import { type DayKey, toDayKey } from "@cal/domain";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useApp } from "../lib/app";
import { graphite } from "../lib/calendars";
import { assignLanes } from "../lib/layout";

const LANE = 25;

// All-day events as bars spanning their days, stacked in lanes (24pt chips, 1pt gaps).
export function AllDayRow({
  days,
  events,
}: {
  days: readonly DayKey[];
  events: readonly ExternalEvent[];
}) {
  const { palette, mode, calendars } = useApp();
  const first = days[0] ?? "";
  const last = days[days.length - 1] ?? "";
  const bars = events
    .filter((event) => event.allDay)
    .flatMap((event) => {
      const startDay = toDayKey(new Date(event.start));
      const endDay = toDayKey(new Date(Date.parse(event.end) - 1));
      if (endDay < first || startDay > last) return [];
      const from = Math.max(0, days.indexOf(startDay));
      const to = days.includes(endDay) ? days.indexOf(endDay) : days.length - 1;
      return [{ event, from, to, clippedStart: startDay < first, clippedEnd: endDay > last }];
    });
  if (bars.length === 0) return null;
  const placed = assignLanes(bars);
  const lanes = placed.reduce((max, { lane }) => Math.max(max, lane + 1), 0);

  return (
    <View className="relative" style={{ height: lanes * LANE + 4 }}>
      {placed.map(({ item, lane }) => {
        const colors = palette.get(item.event.calendarId) ?? graphite(mode);
        const calendar = calendars.find((each) => each.id === item.event.calendarId);
        return (
          <Pressable
            accessibilityRole="button"
            key={item.event.id}
            onPress={() =>
              router.push({
                pathname: "/event/[id]",
                params: {
                  id: item.event.id,
                  title: item.event.title,
                  start: item.event.start,
                  end: item.event.end,
                  allDay: "1",
                  location: item.event.location ?? "",
                  notes: item.event.notes ?? "",
                  calendar: calendar?.title ?? "",
                  color: calendar?.color ?? "#888888",
                },
              })
            }
            className="absolute h-6"
            style={{
              top: lane * LANE + 2,
              left: `${(item.from / days.length) * 100}%`,
              width: `${((item.to - item.from + 1) / days.length) * 100}%`,
              paddingHorizontal: 2,
            }}
          >
            <View
              className={`flex-1 justify-center px-1.5 ${item.clippedStart ? "" : "rounded-l-sm"} ${
                item.clippedEnd ? "" : "rounded-r-sm"
              }`}
              style={{
                backgroundColor: colors.fill,
                borderLeftWidth: 3,
                borderLeftColor: colors.bar,
              }}
            >
              <Text
                numberOfLines={1}
                className="text-small font-medium"
                style={{ color: colors.title }}
              >
                {item.event.title}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
