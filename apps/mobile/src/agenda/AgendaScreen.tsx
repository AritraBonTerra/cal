import type { ExternalEvent } from "@cal/calendar-source";
import {
  addDays,
  addMonths,
  type DayKey,
  dayRange,
  daysBetween,
  fromDayKey,
  startOfMonth,
  startOfWeek,
  toDayKey,
  toOffsetIso,
} from "@cal/domain";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useApp } from "../lib/app";
import { graphite, useEvents } from "../lib/calendars";
import { weekdayLetter } from "../lib/time";
import { focusAgenda, setMonth, useView, view } from "../lib/view";
import { AgendaList } from "./AgendaList";
import { DayCells, ROW } from "./DayCells";
import { Pager } from "./Pager";

/*
 * The iPhone's agenda: a week strip over the list, pulled down by its grabber to a full
 * month. The list is a panel that slides over the month, so a pull only moves layers:
 * the month shifts until the current week's row is the strip, and the panel covers the
 * rest. Swiping pages weeks (or months, pulled down); a tap goes to that day.
 */

const WEEKS = 6;
// How far the panel slides.
const PULL = (WEEKS - 1) * ROW;
const LETTERS = 20;
// Pages either side of today: five years of weeks, and of months.
const WEEK_PAGES = 261;
const MONTH_PAGES = 60;

// Settles without overshoot, taking over a drag's speed. Reduce Motion jumps instead.
function settle(open: SharedValue<number>, to: number, velocity = 0) {
  "worklet";
  open.set(
    withSpring(to, {
      duration: 300,
      dampingRatio: 1,
      velocity,
      overshootClamping: true,
      reduceMotion: ReduceMotion.System,
    }),
  );
}

// A vertical drag that pulls the month open. It picks up wherever the strip is, even
// part-way through settling, and leaves sideways drags to the pager.
function usePull(open: SharedValue<number>) {
  const from = useSharedValue(0);
  return usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-12, 12],
    onActivate: (event) => {
      "worklet";
      cancelAnimation(open);
      from.set(open.get() - event.translationY / PULL);
    },
    onUpdate: (event) => {
      "worklet";
      open.set(Math.min(1, Math.max(0, from.get() + event.translationY / PULL)));
    },
    onDeactivate: (event) => {
      "worklet";
      const velocity = event.velocityY / PULL;
      // Where the drag would coast to in a moment decides, so a flick counts.
      const to = open.get() + velocity * 0.15 > 0.5 ? 1 : 0;
      settle(open, to, velocity);
      scheduleOnRN(setMonth, to === 1);
    },
  });
}

export function AgendaScreen({ width }: { width: number }) {
  const { today } = useApp();
  const weekStart = useView((state) => state.weekStart);
  const focus = useView((state) => state.focus);
  const selected = useView((state) => state.selected);
  const month = useView((state) => state.month);
  const dots = useDots(focus, weekStart);

  // 0 is the week strip, 1 the month. `month` is where it's headed, so a toggle from
  // outside a drag (the grabber, VoiceOver, a deep link) animates it.
  const open = useSharedValue(month ? 1 : 0);
  useEffect(() => settle(open, month ? 1 : 0), [open, month]);
  const strip = usePull(open);
  const grabber = usePull(open);

  // Pages count from fixed first ones, so a page's number never changes.
  const [origin] = useState(today);
  const firstWeek = addDays(startOfWeek(origin, weekStart), -7 * WEEK_PAGES);
  const firstMonth = addMonths(startOfMonth(origin), -MONTH_PAGES);
  const weekOf = (day: DayKey) => Math.floor(daysBetween(firstWeek, day) / 7);
  const monthOf = (day: DayKey) =>
    (Number(day.slice(0, 4)) - Number(firstMonth.slice(0, 4))) * 12 +
    Number(day.slice(5, 7)) -
    Number(firstMonth.slice(5, 7));
  const monthDays = (first: DayKey) => dayRange(startOfWeek(first, weekStart), WEEKS * 7);
  // A swipe that brings back the selected day's week or month lands on that day.
  const land = (first: DayKey, same: boolean) => focusAgenda(same ? selected : first);

  const current = startOfMonth(focus);
  const row = Math.floor(daysBetween(startOfWeek(current, weekStart), focus) / 7);

  const monthStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (open.get() - 1) * row * ROW }],
  }));
  // Invisible views take no touches, so once it's pulled the month underneath does.
  const weekStyle = useAnimatedStyle(() => ({ opacity: open.get() > 0 ? 0 : 1 }));
  // The months to swipe lie over the still one only once it has stopped moving.
  const pagerStyle = useAnimatedStyle(() => ({ opacity: open.get() === 1 ? 1 : 0 }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: open.get() * PULL }],
  }));

  return (
    <View className="flex-1 overflow-hidden bg-canvas">
      <GestureDetector gesture={strip}>
        <View collapsable={false} style={{ height: LETTERS + WEEKS * ROW }}>
          <View
            accessibilityElementsHidden
            className="z-10 flex-row items-center bg-canvas"
            style={{ height: LETTERS }}
          >
            {dayRange(startOfWeek(origin, weekStart), 7).map((day) => (
              <Text key={day} className="flex-1 text-center text-caption font-medium text-ink-3">
                {weekdayLetter(day)}
              </Text>
            ))}
          </View>
          <Animated.View accessibilityElementsHidden={!month} style={monthStyle}>
            <DayCells days={monthDays(current)} dots={dots} month={current.slice(0, 7)} />
          </Animated.View>
          {month && (
            <Animated.View className="absolute inset-x-0" style={[{ top: LETTERS }, pagerStyle]}>
              <Pager
                page={monthOf(focus)}
                count={MONTH_PAGES * 2 + 1}
                width={width}
                height={WEEKS * ROW}
                onPage={(page) => {
                  const first = addMonths(firstMonth, page);
                  land(first, selected.startsWith(first.slice(0, 7)));
                }}
              >
                {(page) => {
                  const first = addMonths(firstMonth, page);
                  return <DayCells days={monthDays(first)} dots={dots} month={first.slice(0, 7)} />;
                }}
              </Pager>
            </Animated.View>
          )}
          <Animated.View
            accessibilityElementsHidden={month}
            className="absolute inset-x-0"
            style={[{ top: LETTERS }, weekStyle]}
          >
            <Pager
              key={firstWeek}
              page={weekOf(focus)}
              count={WEEK_PAGES * 2 + 1}
              width={width}
              height={ROW}
              onPage={(page) => {
                const first = addDays(firstWeek, page * 7);
                land(first, weekOf(selected) === page);
              }}
            >
              {(page) => <DayCells days={dayRange(addDays(firstWeek, page * 7), 7)} dots={dots} />}
            </Pager>
          </Animated.View>
        </View>
      </GestureDetector>

      <Animated.View
        className="absolute inset-x-0 bottom-0 bg-canvas"
        style={[{ top: LETTERS + ROW }, panelStyle]}
      >
        <GestureDetector gesture={grabber}>
          <View collapsable={false} className="z-10 border-b border-grid">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={month ? "Show week" : "Show month"}
              accessibilityState={{ expanded: month }}
              onPress={() => setMonth(!view.get().month)}
              hitSlop={{ bottom: 22 }}
              className="h-[22px] items-center justify-center"
            >
              <View className="h-[5px] w-9 rounded-full bg-edge-strong" />
            </Pressable>
          </View>
        </GestureDetector>
        <AgendaList bottomInset={month ? PULL : 0} />
      </Animated.View>
    </View>
  );
}

// The calendar color of each event per day, in time order, for the month in focus and
// those either side of it.
function useDots(focus: DayKey, weekStart: number) {
  const { palette, mode } = useApp();
  const month = startOfMonth(focus);
  const first = startOfWeek(addMonths(month, -1), weekStart);
  const end = addDays(startOfWeek(addMonths(month, 1), weekStart), WEEKS * 7);
  const { events } = useEvents(toOffsetIso(fromDayKey(first)), toOffsetIso(fromDayKey(end)));
  return useMemo(() => {
    const dots = new Map<DayKey, string[]>();
    const byTime = (a: ExternalEvent, b: ExternalEvent) =>
      Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start);
    for (const event of [...events].sort(byTime)) {
      const color = (palette.get(event.calendarId) ?? graphite(mode)).bar;
      const start = new Date(event.start);
      const last = toDayKey(new Date(Math.max(start.getTime(), Date.parse(event.end) - 1)));
      // Only the days fetched, so an event years long can't run away.
      let day = toDayKey(start);
      if (day < first) day = first;
      for (; day <= last && day < end; day = addDays(day, 1))
        dots.set(day, [...(dots.get(day) ?? []), color]);
    }
    return dots;
  }, [events, palette, mode, first, end]);
}
