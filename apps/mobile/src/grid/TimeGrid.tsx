import { useActions } from "@cal/app-core";
import { addDays, type DayKey, toDayKey, weekday } from "@cal/domain";
import { mix, colors as tokens } from "@cal/theme";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  type AnimatedRef,
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
} from "react-native-reanimated";
import { useApp } from "../lib/app";
import { graphite } from "../lib/calendars";
import { useNow } from "../lib/clock";
import { layoutColumn } from "../lib/layout";
import { useColors } from "../lib/theme";
import { formatHour, formatTime } from "../lib/time";
import { type BlockChange, BlockChip, EventChip } from "./chips";
import {
  DAY_MINUTES,
  GRID_HEIGHT,
  GUTTER,
  HOUR,
  type Item,
  instant,
  minutesOf,
  pixelsFor,
  SNAP,
  segments,
  snap,
} from "./model";

/*
 * The hour grid for one page: a vertical scroll with the hour gutter and one column
 * per day. Long-press empty space to create a block (a sheet asks for the title);
 * chips handle their own taps and drags. Pages share one scroll position through
 * `scrollY`, so swiping between days never jumps vertically.
 */

const CLICK_LENGTH = 30;
const hairline = StyleSheet.hairlineWidth;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
// Hour labels are 16pt tall, centered on their line; one this close to the now pill hides.
const LABEL_HALF = 8;
const PILL_CLEARANCE = 20;

/*
 * The scroll offset to open at: `wanted`, clamped to what the viewport allows, then
 * moved up to the nearest hour line less a label's height, so the first hour label is
 * whole instead of cut by the top edge (research/07 §7.5: labels sit on their lines).
 */
export function alignedTop(wanted: number, viewport: number) {
  const max = Math.max(0, GRID_HEIGHT - viewport);
  const margin = LABEL_HALF + 4;
  return Math.max(0, Math.floor((Math.min(wanted, max) + margin) / HOUR) * HOUR - margin);
}

interface TimeGridProps {
  days: readonly DayKey[];
  items: readonly Item[];
  scrollRef: AnimatedRef<Animated.ScrollView>;
  scrollY: SharedValue<number>;
  initialY: number;
  // Which page is under the finger; only it writes `scrollY`, the others follow.
  activePage: SharedValue<number>;
  page: number;
}

export function TimeGrid({
  days,
  items,
  scrollRef,
  scrollY,
  initialY,
  activePage,
  page,
}: TimeGridProps) {
  const { today, mode, palette, calendars } = useApp();
  const theme = useColors();
  const now = useNow();
  const actions = useActions();
  const columnWidth = useSharedValue(100);
  const [width, setWidth] = useState(0);
  const aligned = useRef(false);
  // A block drawn at its dropped time until the store reflects the move.
  const [moved, setMoved] = useState<{ id: string; start: Date; end: Date } | null>(null);

  const onScroll = useAnimatedScrollHandler((event) => {
    if (activePage.get() === page) scrollY.set(event.contentOffset.y);
  });
  useAnimatedReaction(
    () => scrollY.get(),
    (y) => {
      if (activePage.get() !== page) scrollTo(scrollRef, 0, y, false);
    },
  );

  const shown =
    moved && items.some((item) => item.id === moved.id)
      ? items.map((item) =>
          item.id === moved.id ? { ...item, start: moved.start, end: moved.end } : item,
        )
      : items;
  const byDay = segments(shown, days);
  const nowMinute = minutesOf(now);
  const nowTop = pixelsFor(nowMinute);
  const nowFaded = mix(tokens.now[mode], tokens.canvas[mode], 0.65);
  const showsToday = days.includes(today);

  const change = (
    item: Item & { kind: "block" },
    { dayDelta, minuteDelta, lengthDelta }: BlockChange,
  ) => {
    const day = addDays(toDayKey(item.start), dayDelta);
    const start = instant(day, minutesOf(item.start) + minuteDelta);
    const end = new Date(
      start.getTime() + item.end.getTime() - item.start.getTime() + lengthDelta * 60_000,
    );
    setMoved({ id: item.id, start, end });
    void actions.moveBlock(item.block.uuid, start, end);
  };

  const create = (day: DayKey, event: GestureResponderEvent) => {
    const minute = snap((event.nativeEvent.locationY / HOUR) * 60 - SNAP / 2);
    const start = Math.min(DAY_MINUTES - CLICK_LENGTH, minute);
    router.push({
      pathname: "/new-block",
      params: { day, start: String(start), end: String(start + CLICK_LENGTH) },
    });
  };

  return (
    <Animated.ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      contentOffset={{ x: 0, y: initialY }}
      onLayout={(event) => {
        // Once the viewport is known: the page under the finger settles on an aligned
        // offset and publishes it; the pages beside it take whatever is current.
        if (aligned.current) return;
        aligned.current = true;
        const active = activePage.get() === page;
        const y = active ? alignedTop(initialY, event.nativeEvent.layout.height) : scrollY.get();
        if (active) scrollY.set(y);
        if (y !== initialY) scrollRef.current?.scrollTo({ y, animated: false });
      }}
      className="flex-1 bg-canvas"
    >
      <View style={{ height: GRID_HEIGHT, flexDirection: "row" }}>
        <View style={{ width: GUTTER }}>
          {HOURS.slice(1).map((hour) => (
            <Text
              key={hour}
              className="absolute right-2 text-caption text-ink-3"
              style={{
                top: hour * HOUR - LABEL_HALF,
                fontVariant: ["tabular-nums"],
                opacity: showsToday && Math.abs(hour * HOUR - nowTop) < PILL_CLEARANCE ? 0 : 1,
              }}
            >
              {formatHour(hour)}
            </Text>
          ))}
          {showsToday && (
            <View
              className="absolute right-1.5 h-5 justify-center rounded-sm bg-now px-1"
              style={{ top: nowTop - 10 }}
            >
              <Text
                className="text-caption font-semibold text-white"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {formatTime(now, true)}
              </Text>
            </View>
          )}
        </View>

        <View
          className="flex-1 flex-row"
          onLayout={(event) => {
            const next = event.nativeEvent.layout.width / days.length;
            columnWidth.set(next);
            setWidth(next);
          }}
        >
          {/* Hour lines, drawn once behind every column. */}
          {HOURS.map((hour) => (
            <View
              key={hour}
              pointerEvents="none"
              className="absolute inset-x-0 bg-grid"
              style={{ top: hour * HOUR, height: hairline }}
            />
          ))}
          {days.map((day, dayIndex) => {
            const column = byDay.get(day) ?? [];
            const slots = layoutColumn(
              column.map((segment) => ({
                id: segment.item.id,
                start: segment.start,
                end: segment.end,
              })),
            );
            const isToday = day === today;
            const weekend = weekday(day) === 0 || weekday(day) === 6;
            return (
              <Pressable
                key={day}
                accessibilityLabel={`${day} grid`}
                onLongPress={(event) => create(day, event)}
                delayLongPress={350}
                className="flex-1 border-l border-grid"
                style={{ height: GRID_HEIGHT }}
              >
                <View
                  pointerEvents="none"
                  className="absolute inset-x-0 top-0 bg-offhours"
                  style={{ height: weekend ? GRID_HEIGHT : 9 * HOUR }}
                />
                {!weekend && (
                  <View
                    pointerEvents="none"
                    className="absolute inset-x-0 bottom-0 bg-offhours"
                    style={{ height: 6 * HOUR }}
                  />
                )}
                {column.map((segment) => {
                  const { item } = segment;
                  const slot = slots.get(item.id) ?? { left: 0, width: 1, z: 0 };
                  const frame = {
                    top: pixelsFor(segment.start),
                    height: pixelsFor(segment.end - segment.start),
                    left: slot.left,
                    width: slot.width,
                    z: slot.z + 1,
                  };
                  const past = item.end.getTime() < now.getTime();
                  if (item.kind === "event") {
                    const calendar = calendars.find((each) => each.id === item.event.calendarId);
                    return (
                      <EventChip
                        key={item.id}
                        title={item.event.title}
                        location={item.event.location}
                        start={item.start}
                        end={item.end}
                        colors={palette.get(item.event.calendarId) ?? graphite(mode)}
                        frame={frame}
                        past={past}
                        narrow={width * slot.width < 150}
                        onPress={() =>
                          router.push({
                            pathname: "/event/[id]",
                            params: {
                              id: item.event.id,
                              title: item.event.title,
                              start: item.event.start,
                              end: item.event.end,
                              allDay: item.event.allDay ? "1" : "0",
                              location: item.event.location ?? "",
                              notes: item.event.notes ?? "",
                              calendar: calendar?.title ?? "",
                              color: calendar?.color ?? "#888888",
                            },
                          })
                        }
                      />
                    );
                  }
                  return (
                    <BlockChip
                      key={item.id}
                      block={item.block}
                      task={item.task}
                      project={item.project}
                      start={item.start}
                      end={item.end}
                      startMinute={segment.start}
                      endMinute={segment.end}
                      frame={frame}
                      past={past}
                      dayIndex={dayIndex}
                      dayCount={days.length}
                      columnWidth={columnWidth}
                      onPress={() =>
                        router.push({ pathname: "/block/[id]", params: { id: item.block.uuid } })
                      }
                      onToggle={(done) => void actions.setBlockDone(item.block, done)}
                      onChange={(delta) => change(item, delta)}
                    />
                  );
                })}
                {showsToday && (
                  <View
                    pointerEvents="none"
                    className="absolute inset-x-0 z-20"
                    style={{
                      top: nowTop,
                      height: 1,
                      backgroundColor: isToday ? theme.now : nowFaded,
                    }}
                  >
                    {isToday && (
                      <View
                        className="absolute h-2 w-2 rounded-full bg-now"
                        style={{ left: -4, top: -3.5 }}
                      />
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
          {width === 0 && <View />}
        </View>
      </View>
    </Animated.ScrollView>
  );
}
