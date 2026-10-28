import { addDays, type DayKey, dayRange, fromDayKey, toOffsetIso } from "@cal/domain";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated, { type SharedValue, useAnimatedRef } from "react-native-reanimated";
import { useApp } from "../lib/app";
import { useEvents } from "../lib/calendars";
import { AllDayRow } from "./AllDayRow";
import { DayHeaders } from "./DayHeaders";
import { HabitStrip } from "./HabitStrip";
import { GUTTER, type Item } from "./model";
import { TimeGrid } from "./TimeGrid";

/*
 * One page of the calendar: day headers, the habit strip and the all-day row above
 * the scrolling hour grid. Device events are fetched for exactly these days.
 */
interface DaysViewProps {
  start: DayKey;
  count: number;
  scrollY: SharedValue<number>;
  initialY: number;
  activePage: SharedValue<number>;
  page: number;
}

export function DaysView({ start, count, scrollY, initialY, activePage, page }: DaysViewProps) {
  const { data } = useApp();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const days = dayRange(start, count);
  const first = days[0] ?? start;
  const last = days[days.length - 1] ?? start;
  const { events } = useEvents(
    toOffsetIso(fromDayKey(first)),
    toOffsetIso(fromDayKey(addDays(last, 1))),
  );
  const [columnWidth, setColumnWidth] = useState(160);

  const items: Item[] = [
    ...events
      .filter((event) => !event.allDay)
      .map(
        (event): Item => ({
          kind: "event",
          id: `event:${event.id}`,
          event,
          start: new Date(event.start),
          end: new Date(event.end),
        }),
      ),
    // Every block overlapping the visible days, so an overnight block shows on both.
    ...data.blocks
      .filter(
        (block) =>
          Date.parse(block.start_at) < fromDayKey(addDays(last, 1)).getTime() &&
          Date.parse(block.end_at) > fromDayKey(first).getTime(),
      )
      .map((block): Item => {
        const task = data.tasks.find((each) => each.uuid === block.task_uuid);
        const project = data.projects.find((each) => each.uuid === task?.project_uuid);
        return {
          kind: "block",
          id: `block:${block.uuid}`,
          block,
          task,
          project,
          start: new Date(block.start_at),
          end: new Date(block.end_at),
        };
      }),
  ];

  const allDay = events.some((event) => event.allDay);

  return (
    <View className="flex-1 bg-canvas">
      <View className="border-b border-grid">
        <View className="flex-row">
          <View style={{ width: GUTTER }} />
          <View
            className="flex-1"
            onLayout={(event) => setColumnWidth(event.nativeEvent.layout.width / count)}
          >
            <DayHeaders days={days} columnWidth={columnWidth} />
            <HabitStrip days={days} columnWidth={columnWidth} />
          </View>
        </View>
        {allDay && (
          <View className="flex-row border-t border-grid">
            <View className="justify-center pr-2" style={{ width: GUTTER }}>
              <Text className="text-right text-caption text-ink-3">all-day</Text>
            </View>
            <View className="flex-1">
              <AllDayRow days={days} events={events} />
            </View>
          </View>
        )}
      </View>
      <TimeGrid
        days={days}
        items={items}
        scrollRef={scrollRef}
        scrollY={scrollY}
        initialY={initialY}
        activePage={activePage}
        page={page}
      />
    </View>
  );
}
