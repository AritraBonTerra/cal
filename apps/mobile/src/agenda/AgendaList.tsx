import { agendaDays, isEmptyDay } from "@cal/app-core";
import {
  addDays,
  type DayKey,
  dayRange,
  fromDayKey,
  localTimeZone,
  toOffsetIso,
} from "@cal/domain";
import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { useApp } from "../lib/app";
import { useEvents } from "../lib/calendars";
import { useNow } from "../lib/clock";
import { AGENDA_MAX, extendAgenda, followAgenda, useView, view } from "../lib/view";
import { DaySection } from "./DaySection";

// Fewer listed days than this after one may not fill the screen below it.
const LAST_DAYS = 12;

/*
 * The agenda's days as one list, each day an item. Days with nothing on them are left
 * out, except today and a day that was jumped to. Reaching the end adds days; a jump
 * scrolls to its day, and scrolling by hand moves the selected day along.
 */
export function AgendaList({ bottomInset = 0 }: { bottomInset?: number }) {
  const { data, today } = useApp();
  const now = useNow();
  const anchor = useView((state) => state.anchor);
  const span = useView((state) => state.span);
  const pinned = useView((state) => state.pinned);
  const jumps = useView((state) => state.jumps);
  const list = useRef<LegendListRef>(null);
  const still = useReducedMotion();
  const { events, loaded } = useEvents(
    toOffsetIso(fromDayKey(anchor)),
    toOffsetIso(fromDayKey(addDays(anchor, span))),
  );

  const { tasks, blocks, projects, habits, entries } = data;
  const days = useMemo(
    () =>
      agendaDays(dayRange(anchor, span), {
        events,
        blocks,
        tasks,
        projects,
        habits,
        entries,
        gridToday: today,
        today,
        zone: localTimeZone(),
      }),
    [anchor, span, events, blocks, tasks, projects, habits, entries, today],
  );
  const shown = days.filter((day) => day.day === today || day.day === pinned || !isEmptyDay(day));

  const pinnedAt = shown.findIndex((day) => day.day === pinned);
  const nearEnd = pinnedAt >= 0 && pinnedAt >= shown.length - LAST_DAYS;

  // The list grew but shows nothing more: a stretch of empty days. Keep going, since the
  // end it already reached won't be reached again.
  const ended = useRef(-1);
  useEffect(() => {
    if (loaded && span < AGENDA_MAX && ended.current === shown.length) extendAgenda();
  }, [loaded, span, shown.length]);

  // Whether the user is doing the scrolling, so a jump doesn't select days on its way.
  const following = useRef(false);
  const latest = useRef(shown);
  latest.current = shown;

  // Brings a listed day to the top.
  const toDay = useCallback((day: DayKey, animated: boolean) => {
    if (!latest.current.some((each) => each.day === day)) return;
    void list.current?.scrollToKey({ key: day, animated, viewPosition: 0 });
  }, []);

  // A jump within the list scrolls; the list opens at its first day by itself.
  const jumped = useRef(jumps);
  useEffect(() => {
    if (jumps === jumped.current) return;
    jumped.current = jumps;
    following.current = false;
    toDay(view.get().selected, !still);
  }, [jumps, still, toDay]);

  // A list made again elsewhere (the iPad's split view changing) goes back to the day it
  // was on, once its days are there.
  const restored = useRef(false);
  useEffect(() => {
    if (!loaded || restored.current) return;
    restored.current = true;
    const { selected, anchor } = view.get();
    if (selected !== anchor) toDay(selected, false);
  }, [loaded, toDay]);

  return (
    <LegendList
      // A list that starts on another day opens at its top.
      key={anchor}
      ref={list}
      data={shown}
      keyExtractor={(day) => day.day}
      estimatedItemSize={72}
      recycleItems
      // The now line moves and past rows fade as the minute changes.
      extraData={now}
      // Room under the last days, so one jumped to near the end can reach the top. Only
      // there: every day from the anchor on stays mounted.
      anchoredEndSpace={nearEnd ? { anchorIndex: pinnedAt } : undefined}
      onEndReached={() => {
        ended.current = shown.length;
        extendAgenda();
      }}
      onEndReachedThreshold={0.5}
      scrollEventThrottle={16}
      // A finger or VoiceOver, but never a jump.
      onUserScroll={() => {
        following.current = true;
      }}
      // A tap on the status bar arrives once the list is already at its top.
      onScrollToTop={() => {
        const first = latest.current[0];
        if (first) followAgenda(first.day);
      }}
      onScroll={() => {
        if (!following.current) return;
        const state = list.current?.getState();
        const top =
          state &&
          latest.current.findLast((_, index) => state.positionAtIndex(index) <= state.scroll + 1);
        if (top) followAgenda(top.day);
      }}
      contentContainerStyle={{ paddingBottom: bottomInset + 96 }}
      renderItem={({ item }) => <DaySection day={item} now={now} />}
    />
  );
}
