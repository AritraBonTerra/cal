import { useActions } from "@cal/app-core";
import { isOpen, isOverdue, scheduledMinutes, type Task } from "@cal/domain";
import { router } from "expo-router";
import { Check, Flag } from "lucide-react-native";
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { useColors } from "../lib/theme";
import { formatDuration, formatRelativeDay } from "../lib/time";
import { Checkbox } from "../ui/controls";

/*
 * One to-do: checkbox, title, and a line of metadata (project, deadline, scheduled
 * time). Tap opens the detail sheet; swipe right completes it, like Things.
 */
export function TaskRow({ task }: { task: Task }) {
  const { data, today } = useApp();
  const colors = useColors();
  const actions = useActions();
  const swipe = useRef<SwipeableMethods>(null);
  const done = !isOpen(task);
  const project = data.projects.find((each) => each.uuid === task.project_uuid);
  const area = data.areas.find((each) => each.uuid === (task.area_uuid ?? project?.area_uuid));
  const scheduled = scheduledMinutes(task, data.blocks, now());
  const overdue = isOverdue(task, today);

  const meta: string[] = [];
  if (project || area) meta.push(project?.title ?? area?.title ?? "");
  if (task.when_date && task.when_date > today) meta.push(formatRelativeDay(task.when_date, today));
  if (task.estimate_min !== undefined) {
    meta.push(
      scheduled > 0
        ? `${formatDuration(Math.min(scheduled, task.estimate_min))} of ${formatDuration(task.estimate_min)} scheduled`
        : formatDuration(task.estimate_min),
    );
  } else if (scheduled > 0) meta.push(`${formatDuration(scheduled)} scheduled`);

  const complete = () => {
    swipe.current?.close();
    void actions.setTaskDone(task.uuid, !done);
  };

  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={1.6}
      leftThreshold={72}
      overshootLeft={false}
      onSwipeableOpen={complete}
      renderLeftActions={() => (
        <View className="w-24 flex-row items-center justify-start bg-accent-solid pl-5">
          <Check size={22} color={colors.white} strokeWidth={2.5} absoluteStrokeWidth />
        </View>
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={task.title}
        onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.uuid } })}
        className="min-h-11 flex-row items-start gap-3 bg-canvas px-4 py-2.5 active:bg-hover"
      >
        <View className="h-5 justify-center">
          <Checkbox
            checked={done}
            size={22}
            label={done ? "Reopen" : "Complete"}
            onChange={(checked) => void actions.setTaskDone(task.uuid, checked)}
          />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline gap-2">
            <Text
              numberOfLines={1}
              className={`min-w-0 flex-1 text-body ${done ? "text-ink-3 line-through" : "text-ink"}`}
            >
              {task.title || "New To-Do"}
            </Text>
            {task.deadline && (
              <View className="flex-row items-center gap-1">
                <Flag
                  size={12}
                  color={overdue ? colors.now : colors["ink-3"]}
                  strokeWidth={1.5}
                  absoluteStrokeWidth
                />
                <Text
                  className={`text-small ${overdue ? "text-now" : "text-ink-3"}`}
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {overdue ? "Overdue" : formatRelativeDay(task.deadline, today)}
                </Text>
              </View>
            )}
          </View>
          {meta.length > 0 && (
            <Text
              numberOfLines={1}
              className="text-small text-ink-3"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {meta.join(" · ")}
            </Text>
          )}
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}
