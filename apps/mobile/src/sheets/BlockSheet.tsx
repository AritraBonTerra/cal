import { useActions } from "@cal/app-core";
import type { TimeBlock } from "@cal/domain";
import { toDayKey } from "@cal/domain";
import { router } from "expo-router";
import { Check, CheckCheck, ExternalLink, Trash2 } from "lucide-react-native";
import { Text, View } from "react-native";
import { useApp } from "../lib/app";
import { useColors } from "../lib/theme";
import { formatRange, formatRelativeDay } from "../lib/time";
import { Button, HeaderAction, SheetHeader } from "../ui/controls";

/*
 * A time block's sheet: what it's for and when, then the three block actions from
 * PLAN §5.3: complete the to-do, done for this session only, or remove the block.
 */
export function BlockSheet({ block }: { block: TimeBlock }) {
  const { data, today } = useApp();
  const colors = useColors();
  const actions = useActions();
  const task = data.tasks.find((each) => each.uuid === block.task_uuid);
  const project = data.projects.find((each) => each.uuid === task?.project_uuid);
  const start = new Date(block.start_at);
  const end = new Date(block.end_at);
  const done = block.done_at !== undefined;

  const run = (action: () => Promise<unknown>) => {
    router.back();
    void action();
  };

  return (
    <View className="flex-1 bg-raised">
      <SheetHeader
        title="Block"
        right={<HeaderAction title="Done" bold onPress={() => router.back()} />}
      />
      <View className="px-4 pb-6">
        <Text
          className={`text-title-2 font-semibold ${done ? "text-ink-3 line-through" : "text-ink"}`}
        >
          {task?.title ?? "Block"}
        </Text>
        <Text className="mt-1 text-body text-ink-2" style={{ fontVariant: ["tabular-nums"] }}>
          {formatRelativeDay(toDayKey(start), today)} · {formatRange(start, end)}
        </Text>
        {project && <Text className="mt-0.5 text-small text-ink-3">{project.title}</Text>}

        <View className="mt-6 gap-2">
          <Button
            title={done ? "Reopen to-do" : "Complete to-do"}
            kind="primary"
            onPress={() => run(() => actions.setBlockDone(block, !done))}
            icon={<Check size={18} color={colors.white} strokeWidth={2} absoluteStrokeWidth />}
          />
          {!done && (
            <Button
              title="Done for this session"
              onPress={() => run(() => actions.setBlockDone(block, true, true))}
              icon={
                <CheckCheck size={18} color={colors.ink} strokeWidth={1.5} absoluteStrokeWidth />
              }
            />
          )}
          {task && (
            <Button
              title="Open to-do"
              onPress={() => router.replace({ pathname: "/task/[id]", params: { id: task.uuid } })}
              icon={
                <ExternalLink size={18} color={colors.ink} strokeWidth={1.5} absoluteStrokeWidth />
              }
            />
          )}
          <Button
            title="Remove from calendar"
            kind="destructive"
            onPress={() => run(() => actions.deleteBlock(block.uuid))}
            icon={<Trash2 size={18} color={colors.now} strokeWidth={1.5} absoluteStrokeWidth />}
          />
        </View>
      </View>
    </View>
  );
}
