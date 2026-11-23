import { type ReactElement, useEffect, useMemo, useRef } from "react";
import { FlatList, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

interface PagerProps {
  // The page showing, 0 to `count` - 1; one past either end shows the last there.
  page: number;
  count: number;
  width: number;
  height: number;
  // A swipe settled on another page.
  onPage: (page: number) => void;
  children: (page: number) => ReactElement;
}

// Fixed-size pages swiped sideways with native paging. A new `page` from outside scrolls
// there: animated to a neighbor (unless Reduce Motion is on), at once to anywhere else.
export function Pager({ page: wanted, count, width, height, onPage, children }: PagerProps) {
  const page = Math.min(count - 1, Math.max(0, wanted));
  const pages = useMemo(() => Array.from({ length: count }, (_, index) => index), [count]);
  const list = useRef<FlatList<number>>(null);
  const shown = useRef(page);
  const still = useReducedMotion();

  useEffect(() => {
    if (page === shown.current) return;
    const near = Math.abs(page - shown.current) === 1;
    shown.current = page;
    list.current?.scrollToIndex({ index: page, animated: near && !still });
  }, [page, still]);

  return (
    <FlatList
      ref={list}
      data={pages}
      horizontal
      pagingEnabled
      bounces={false}
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={String}
      getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      initialScrollIndex={page}
      initialNumToRender={1}
      windowSize={3}
      maxToRenderPerBatch={2}
      onMomentumScrollEnd={({ nativeEvent }) => {
        const next = Math.round(nativeEvent.contentOffset.x / width);
        if (next === shown.current) return;
        shown.current = next;
        onPage(next);
      }}
      renderItem={({ item }) => <View style={{ width, height }}>{children(item)}</View>}
      style={{ width, height }}
    />
  );
}
