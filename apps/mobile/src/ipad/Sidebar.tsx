import { inList, isOpen } from "@cal/domain";
import { router } from "expo-router";
import { CalendarDays, Repeat } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { syncLabel, useAccount, useCalendarAccess } from "../lib/account";
import { useApp } from "../lib/app";
import { type ListId, SMART_LISTS, SMART_TITLES } from "../lib/lists";
import { useColors } from "../lib/theme";
import { ProjectPie } from "../tasks/ProjectPie";
import { LIST_ICONS } from "../tasks/TaskList";

/*
 * The iPad sidebar, like the Mac's: smart lists with counts, Habits, then areas and
 * their projects, then calendar access and the account row.
 */
export type Pane = { kind: "list"; list: ListId } | { kind: "habits" };

export function Sidebar({ pane, onSelect }: { pane: Pane; onSelect: (pane: Pane) => void }) {
  const { data, today } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { auth, sync } = useAccount();
  const { access, request } = useCalendarAccess();
  const current = pane.kind === "list" ? pane.list : null;

  return (
    <View className="w-60 border-r border-grid bg-sidebar" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-3"
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
      >
        {SMART_LISTS.map((list) => {
          const Icon = LIST_ICONS[list];
          const count =
            list === "logbook" ? 0 : data.tasks.filter((task) => inList(task, list, today)).length;
          return (
            <Row
              key={list}
              active={current === list}
              onPress={() => onSelect({ kind: "list", list })}
              icon={
                <Icon
                  size={18}
                  color={current === list ? colors.accent : colors["ink-2"]}
                  strokeWidth={1.5}
                  absoluteStrokeWidth
                />
              }
              title={SMART_TITLES[list]}
              count={count}
            />
          );
        })}
        <Row
          active={pane.kind === "habits"}
          onPress={() => onSelect({ kind: "habits" })}
          icon={
            <Repeat
              size={18}
              color={pane.kind === "habits" ? colors.accent : colors["ink-2"]}
              strokeWidth={1.5}
              absoluteStrokeWidth
            />
          }
          title="Habits"
        />

        {data.areas.map((area) => {
          const projects = data.projects.filter(
            (project) => project.area_uuid === area.uuid && project.completed_at === undefined,
          );
          return (
            <View key={area.uuid} className="mt-5">
              <Row
                active={current === `area:${area.uuid}`}
                onPress={() => onSelect({ kind: "list", list: `area:${area.uuid}` })}
                title={area.title}
                bold
              />
              {projects.map((project) => {
                const own = data.tasks.filter((task) => task.project_uuid === project.uuid);
                const done = own.filter((task) => !isOpen(task)).length;
                return (
                  <Row
                    key={project.uuid}
                    active={current === `project:${project.uuid}`}
                    onPress={() => onSelect({ kind: "list", list: `project:${project.uuid}` })}
                    icon={<ProjectPie done={done} total={own.length} size={16} />}
                    title={project.title}
                  />
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      {access !== "fullAccess" && (
        <View className="mx-3 mb-2 flex-row items-start gap-2 rounded-lg bg-hover p-3">
          <CalendarDays size={16} color={colors["ink-2"]} strokeWidth={1.5} absoluteStrokeWidth />
          <View className="flex-1">
            <Text className="text-small text-ink-2">Cal can't see your calendars yet.</Text>
            <Pressable accessibilityRole="button" onPress={() => void request()} hitSlop={8}>
              <Text className="mt-1 text-small font-semibold text-accent">Allow access</Text>
            </Pressable>
          </View>
        </View>
      )}

      {auth.status === "signedOut" ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/sign-in")}
          className="mx-3 h-11 flex-row items-center gap-2 rounded-md px-2 active:bg-hover"
          style={{ marginBottom: insets.bottom + 8 }}
        >
          <View className="h-2.5 w-2.5 rounded-full border-[1.5px] border-edge-strong" />
          <Text className="text-small text-ink-3">Sign in to sync</Text>
        </Pressable>
      ) : (
        <View
          className="mx-3 min-h-11 flex-row items-center gap-2 rounded-md px-2"
          style={{ marginBottom: insets.bottom + 8 }}
        >
          <View
            className={`h-2.5 w-2.5 rounded-full ${
              sync.connected && !sync.needsSignIn ? "bg-success" : "bg-warning"
            }`}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-small text-ink" numberOfLines={1}>
              {auth.email}
            </Text>
            <Text className="text-caption text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
              {syncLabel(sync)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function Row({
  active,
  onPress,
  icon,
  title,
  count = 0,
  bold,
}: {
  active: boolean;
  onPress: () => void;
  icon?: ReactNode;
  title: string;
  count?: number;
  bold?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`h-11 flex-row items-center gap-2.5 rounded-md px-2.5 ${
        active ? "bg-active" : "active:bg-hover"
      }`}
    >
      {icon && <View className="w-5 items-center">{icon}</View>}
      <Text
        className={`flex-1 text-body text-ink ${bold ? "font-semibold" : ""}`}
        numberOfLines={1}
      >
        {title}
      </Text>
      {count > 0 && (
        <Text className="text-small text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
          {count}
        </Text>
      )}
    </Pressable>
  );
}
