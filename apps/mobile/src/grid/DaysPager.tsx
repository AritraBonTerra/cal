import { addDays, type DayKey, daysBetween } from "@cal/domain";
import { useEffect, useRef, useState } from "react";
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { useView, view } from "../lib/view";
import { DaysView } from "./DaysView";
import { GRID_HEIGHT, HOUR, minutesOf, pixelsFor } from "./model";

/*
 * Horizontal paging between ranges: a paged list of page offsets around a base day,
 * so swiping left or right moves by the visible span with native paging physics.
 * Jumps from outside (Today, a tapped day header, a new day count) rebase the list.
 */

const RANGE = 260;
const MIDDLE = RANGE;
const offsets = Array.from({ length: RANGE * 2 + 1 }, (_, index) => index - RANGE);

export function DaysPager({ width, height }: { width: number; height: number }) {
  const { today } = useApp();
  const anchor = useView((state) => state.anchor);
  const count = useView((state) => state.count);
  const [base, setBase] = useState(anchor);
  // Bumped on every jump from outside, so the list starts over even when the jump
  // lands back on `base` (swipe away, then tap Today).
  const [jumps, setJumps] = useState(0);
  // The day the list is showing, as far as this pager knows.
  const shown = useRef(anchor);
  const listRef = useRef<FlatList<number>>(null);

  // Rebase when the anchor moved for a reason other than a swipe here.
  useEffect(() => {
    if (anchor === shown.current) return;
    shown.current = anchor;
    setBase(anchor);
    setJumps((value) => value + 1);
  }, [anchor]);

  // The first page opens on now (today) or the working morning, shared by every page.
  const [initialY] = useState(() => {
    const todayVisible = daysBetween(anchor, today) >= 0 && daysBetween(anchor, today) < count;
    const wanted = todayVisible ? pixelsFor(minutesOf(now())) - 2 * HOUR : 7.5 * HOUR;
    return Math.min(GRID_HEIGHT - 8 * HOUR, Math.max(0, wanted));
  });
  const scrollY = useSharedValue(initialY);
  const activePage = useSharedValue(MIDDLE);

  // Every key change remounts the list on its middle page; the page that publishes
  // vertical scroll must follow, or scrolling stops syncing between pages.
  const listKey = `${count}:${base}:${width}:${jumps}`;
  useEffect(() => {
    void listKey;
    activePage.set(MIDDLE);
  }, [listKey, activePage]);

  const onPageSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    activePage.set(index);
    const next: DayKey = addDays(base, (index - MIDDLE) * count);
    if (next === anchor) return;
    shown.current = next;
    view.set({ anchor: next });
  };

  return (
    <FlatList
      // Pages are laid out in points of `width`: a new width (the iPad sidebar opening)
      // would leave the list on a far-off page, so it starts over.
      key={listKey}
      ref={listRef}
      data={offsets}
      horizontal
      pagingEnabled
      bounces={false}
      showsHorizontalScrollIndicator={false}
      keyExtractor={(offset) => String(offset)}
      getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      initialScrollIndex={MIDDLE}
      initialNumToRender={1}
      windowSize={3}
      maxToRenderPerBatch={2}
      onMomentumScrollEnd={onPageSettled}
      renderItem={({ item: offset, index }) => (
        <View style={{ width, height }}>
          <DaysView
            start={addDays(base, offset * count)}
            count={count}
            scrollY={scrollY}
            initialY={initialY}
            activePage={activePage}
            page={index}
          />
        </View>
      )}
      style={{ width, height }}
    />
  );
}
