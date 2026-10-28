import { isThisEvening, type Task } from "@cal/domain";
import { LegendList } from "@legendapp/list/react-native";
import {
  Archive,
  CalendarRange,
  CheckCircle2,
  Inbox,
  Layers,
  Moon,
  Star,
} from "lucide-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { SidebarToggle } from "../ipad/SidebarToggle";
import { useApp } from "../lib/app";
import { isSmartList, type ListId, listTitle, tasksIn } from "../lib/lists";
import { useColors } from "../lib/theme";
import { formatRelativeDay } from "../lib/time";
import { TaskRow } from "./TaskRow";

/*
 * The to-dos of one list, as a Legend List: a title row, the rows, and for Today a
 * "This Evening" section at the end. Shown full-screen on iPhone and as the middle
 * pane on iPad.
 */

export const LIST_ICONS = {
  inbox: Inbox,
  today: Star,
  upcoming: CalendarRange,
  anytime: Layers,
  someday: Archive,
  logbook: CheckCircle2,
};

type Entry =
  | { key: string; kind: "task"; task: Task }
  | { key: string; kind: "section"; title: string };

export function TaskList({
  list,
  header,
  bottomInset = 0,
  toggle,
}: {
  list: ListId;
  // Rendered above the title, e.g. the iPhone large-title spacing.
  header?: ReactNode;
  bottomInset?: number;
  // The iPad pane shows the sidebar toggle before the title.
  toggle?: boolean;
}) {
  const { data, today } = useApp();
  const colors = useColors();
  const rows = tasksIn(list, data.tasks, today);
  const evening = list === "today" ? rows.filter((task) => isThisEvening(task, today)) : [];
  const main = rows.filter((task) => !evening.includes(task));
  const Icon = isSmartList(list) ? LIST_ICONS[list] : null;
  const project = list.startsWith("project:")
    ? data.projects.find((each) => each.uuid === list.slice("project:".length))
    : undefined;

  const entries: Entry[] = main.map((task) => ({ key: task.uuid, kind: "task", task }));
  if (evening.length > 0) {
    entries.push({ key: "evening", kind: "section", title: "This Evening" });
    for (const task of evening) entries.push({ key: task.uuid, kind: "task", task });
  }

  return (
    <LegendList
      data={entries}
      keyExtractor={(entry) => entry.key}
      estimatedItemSize={48}
      recycleItems
      contentContainerStyle={{ paddingBottom: bottomInset + 96 }}
      ListHeaderComponent={
        <View>
          {header}
          <View
            className={`flex-row items-center gap-2.5 pb-2 pt-2 pr-4 ${toggle ? "pl-2" : "pl-4"}`}
          >
            {toggle && <SidebarToggle />}
            {Icon && <Icon size={24} color={colors.accent} strokeWidth={1.5} absoluteStrokeWidth />}
            <Text className="min-w-0 flex-1 text-title-2 font-semibold text-ink" numberOfLines={1}>
              {listTitle(list, data.projects, data.areas)}
            </Text>
            {rows.length > 0 && (
              <Text className="text-body text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
                {rows.length}
              </Text>
            )}
          </View>
          {project?.deadline && (
            <Text className="px-4 pb-2 text-small text-ink-3">
              Deadline {formatRelativeDay(project.deadline, today)}
            </Text>
          )}
          {rows.length === 0 && (
            <View className="items-center gap-2 px-8 pt-16">
              {Icon && (
                <Icon size={28} color={colors["ink-3"]} strokeWidth={1.5} absoluteStrokeWidth />
              )}
              <Text className="text-center text-body text-ink-2">
                Nothing here. Tap + to add a to-do.
              </Text>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) =>
        item.kind === "task" ? (
          <TaskRow task={item.task} />
        ) : (
          <View className="flex-row items-center gap-1.5 px-4 pb-1 pt-5">
            <Moon size={14} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
            <Text className="text-small font-medium text-ink-2">{item.title}</Text>
          </View>
        )
      }
    />
  );
}
