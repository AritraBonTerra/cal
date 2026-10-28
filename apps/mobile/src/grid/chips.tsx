import type { Project, Task, TimeBlock } from "@cal/domain";
import { blockColors, type ChipColors } from "@cal/theme";
import { Lock, MapPin } from "lucide-react-native";
import { useLayoutEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { hueFor } from "../lib/data";
import { useColors, useMode } from "../lib/theme";
import { formatRange, formatTime } from "../lib/time";
import { Checkbox } from "../ui/controls";
import { DAY_MINUTES, HOUR, SNAP } from "./model";

/*
 * Chips on the touch grid (research/07 §7.6). Events are a pale fill with a 3pt bar;
 * task blocks are lighter, with a checkbox and a project stripe. What shows depends on
 * height: under 20pt a title only, under 36pt one line with the time, else two lines.
 * Blocks move with a long-press drag and resize from their bottom edge; both run on
 * the UI thread and commit once, on release.
 */

export interface Frame {
  top: number;
  height: number;
  // Fractions of the column width.
  left: number;
  width: number;
  z: number;
}

const tnum = { fontVariant: ["tabular-nums" as const] };

function frameStyle({ top, height, left, width, z }: Frame) {
  return {
    position: "absolute" as const,
    top,
    height: Math.max(14, height - 1),
    left: `${left * 100}%` as const,
    width: `${width * 100}%` as const,
    paddingRight: left + width < 1 ? 3 : 2,
    paddingLeft: left > 0 ? 1 : 0,
    zIndex: z,
  };
}

interface EventChipProps {
  title: string;
  location?: string;
  start: Date;
  end: Date;
  colors: ChipColors;
  frame: Frame;
  past: boolean;
  // Narrow columns (3 days on a phone) drop the inline time so titles stay readable.
  narrow: boolean;
  onPress: () => void;
}

export function EventChip({
  title,
  location,
  start,
  end,
  colors,
  frame,
  past,
  narrow,
  onPress,
}: EventChipProps) {
  const { height } = frame;
  const fill = past ? colors.pastFill : colors.fill;
  const text = past ? colors.pastTitle : colors.title;
  const time = past ? colors.pastTime : colors.time;
  const bar = past ? colors.pastTime : colors.bar;
  return (
    <View style={frameStyle(frame)} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${formatRange(start, end)}`}
        onPress={onPress}
        className="flex-1 overflow-hidden rounded-sm"
        style={{
          backgroundColor: fill,
          borderLeftWidth: 3,
          borderLeftColor: bar,
          paddingLeft: 6,
          paddingRight: 4,
          paddingTop: height < 20 ? 0 : 2,
        }}
      >
        {height < 36 ? (
          <View className="flex-row items-baseline gap-1">
            <Text
              numberOfLines={1}
              className="shrink text-small font-medium"
              style={{ color: text, lineHeight: height < 20 ? 14 : 16 }}
            >
              {title}
            </Text>
            {height >= 20 && !narrow && (
              <Text className="text-caption" style={[{ color: time }, tnum]} numberOfLines={1}>
                {formatTime(start)}
              </Text>
            )}
          </View>
        ) : (
          <>
            <Text numberOfLines={1} className="text-small font-medium" style={{ color: text }}>
              {title}
            </Text>
            <View className="flex-row items-center gap-1">
              <Text className="text-caption" style={[{ color: time }, tnum]} numberOfLines={1}>
                {formatRange(start, end)}
              </Text>
              {location && height >= 52 && (
                <>
                  <MapPin size={11} color={time} strokeWidth={1.5} absoluteStrokeWidth />
                  <Text className="shrink text-caption" style={{ color: time }} numberOfLines={1}>
                    {location}
                  </Text>
                </>
              )}
            </View>
          </>
        )}
      </Pressable>
    </View>
  );
}

// Where a drag left a block: whole days sideways and minutes up or down, or a new length.
export interface BlockChange {
  dayDelta: number;
  minuteDelta: number;
  lengthDelta: number;
}

interface BlockChipProps {
  block: TimeBlock;
  task?: Task;
  project?: Project;
  start: Date;
  end: Date;
  // Minutes after midnight of this segment, for clamping drags to the day.
  startMinute: number;
  endMinute: number;
  frame: Frame;
  past: boolean;
  dayIndex: number;
  dayCount: number;
  columnWidth: SharedValue<number>;
  onPress: () => void;
  onToggle: (done: boolean) => void;
  onChange: (change: BlockChange) => void;
}

export function BlockChip({
  block,
  task,
  project,
  start,
  end,
  startMinute,
  endMinute,
  frame,
  past,
  dayIndex,
  dayCount,
  columnWidth,
  onPress,
  onToggle,
  onChange,
}: BlockChipProps) {
  const theme = useColors();
  const mode = useMode();
  const { height } = frame;
  const done = block.done_at !== undefined;
  const colors = project ? blockColors(hueFor(project), mode) : null;
  const unfinished = past && !done;

  // Drag state, in points. Reset when the block's stored time catches up with a drop.
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dh = useSharedValue(0);
  const lifted = useSharedValue(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the stored time is the trigger.
  useLayoutEffect(() => {
    tx.set(0);
    ty.set(0);
    dh.set(0);
  }, [block.start_at, block.end_at, tx, ty, dh]);

  const length = endMinute - startMinute;
  const move = usePanGesture({
    activateAfterLongPress: 250,
    onActivate: () => {
      "worklet";
      lifted.set(1);
    },
    onUpdate: (event) => {
      "worklet";
      const width = columnWidth.get();
      const days = Math.round(event.translationX / width);
      const dayDelta = Math.max(-dayIndex, Math.min(dayCount - 1 - dayIndex, days));
      const minutes = Math.round(((event.translationY / HOUR) * 60) / SNAP) * SNAP;
      const minuteDelta = Math.max(-startMinute, Math.min(DAY_MINUTES - endMinute, minutes));
      tx.set(dayDelta * width);
      ty.set((minuteDelta / 60) * HOUR);
    },
    onFinalize: (event) => {
      "worklet";
      lifted.set(0);
      const dayDelta = Math.round(tx.get() / columnWidth.get());
      const minuteDelta = Math.round((ty.get() / HOUR) * 60);
      if (event.canceled || (dayDelta === 0 && minuteDelta === 0)) {
        tx.set(0);
        ty.set(0);
        return;
      }
      scheduleOnRN(onChange, { dayDelta, minuteDelta, lengthDelta: 0 });
    },
  });

  const resize = usePanGesture({
    minDistance: 2,
    onActivate: () => {
      "worklet";
      lifted.set(1);
    },
    onUpdate: (event) => {
      "worklet";
      const minutes = Math.round(((event.translationY / HOUR) * 60) / SNAP) * SNAP;
      const delta = Math.max(SNAP - length, Math.min(DAY_MINUTES - endMinute, minutes));
      dh.set((delta / 60) * HOUR);
    },
    onFinalize: (event) => {
      "worklet";
      lifted.set(0);
      const lengthDelta = Math.round((dh.get() / HOUR) * 60);
      if (event.canceled || lengthDelta === 0) {
        dh.set(0);
        return;
      }
      scheduleOnRN(onChange, { dayDelta: 0, minuteDelta: 0, lengthDelta });
    },
  });

  const base = frameStyle(frame);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }],
    height: base.height + dh.get(),
    zIndex: lifted.get() ? 50 : base.zIndex,
    shadowOpacity: lifted.get() ? 0.18 : 0,
  }));

  return (
    <GestureDetector gesture={move}>
      <Animated.View
        style={[
          base,
          animated,
          { shadowColor: "#000", shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${task?.title ?? "Block"}, ${formatRange(start, end)}`}
          onPress={onPress}
          className={`flex-1 overflow-hidden rounded-sm border ${
            unfinished ? "bg-offhours" : "bg-canvas dark:bg-raised"
          }`}
          style={{
            borderColor: colors?.border ?? theme.edge,
            borderLeftWidth: 3,
            borderLeftColor: colors?.stripe ?? theme["edge-strong"],
            paddingLeft: 6,
            paddingRight: 4,
            paddingTop: height < 20 ? 0 : 2,
          }}
        >
          <View className="flex-row items-center gap-1.5">
            {height >= 20 && (
              <Checkbox
                checked={done}
                size={14}
                label={done ? "Reopen" : "Complete"}
                onChange={onToggle}
              />
            )}
            <Text
              numberOfLines={1}
              className={`shrink text-small font-medium ${
                done ? "text-ink-3 line-through" : unfinished ? "text-ink-2" : "text-ink"
              }`}
              style={height < 20 ? { lineHeight: 14 } : undefined}
            >
              {task?.title ?? "Block"}
            </Text>
            {block.pinned_at !== undefined && height >= 20 && (
              <Lock size={11} color={theme["ink-3"]} strokeWidth={1.5} absoluteStrokeWidth />
            )}
          </View>
          {height >= 36 && (
            <Text className="text-caption text-ink-2" style={tnum} numberOfLines={1}>
              {formatRange(start, end)}
            </Text>
          )}
        </Pressable>
        <GestureDetector gesture={resize}>
          <View
            accessibilityLabel="Resize"
            hitSlop={{ top: 6, bottom: 10 }}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 12 }}
          />
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}

// The ghost drawn while a new block is being created: accent outline and its time range.
export function DraftChip({ top, height, label }: { top: number; height: number; label: string }) {
  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0.5 z-20 rounded-sm border border-dashed border-accent bg-accent-soft px-1.5 pt-0.5"
      style={{ top, height: Math.max(14, height - 1) }}
    >
      <Text className="text-caption font-medium text-accent" style={tnum}>
        {label}
      </Text>
    </View>
  );
}
