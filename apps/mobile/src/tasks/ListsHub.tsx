import { inList, isOpen } from "@cal/domain";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { syncLabel, useAccount } from "../lib/account";
import { useApp } from "../lib/app";
import { type ListId, SMART_LISTS, SMART_TITLES } from "../lib/lists";
import { useColors } from "../lib/theme";
import { ProjectPie } from "./ProjectPie";
import { LIST_ICONS } from "./TaskList";

/*
 * The iPhone "Lists" tab: Things' sidebar as a grouped list. Smart lists with counts,
 * then each area and its projects, then the account row.
 */
export function ListsHub() {
  const { data, today } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { auth, sync } = useAccount();
  const open = (list: ListId) => router.push({ pathname: "/lists/[id]", params: { id: list } });

  return (
    <ScrollView
      className="flex-1 bg-sidebar"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32 }}
    >
      <Text className="px-5 pb-3 text-title-1 font-bold text-ink">Lists</Text>
      <View className="mx-4 overflow-hidden rounded-lg bg-canvas">
        {SMART_LISTS.map((list, index) => {
          const Icon = LIST_ICONS[list];
          const count =
            list === "logbook" ? 0 : data.tasks.filter((task) => inList(task, list, today)).length;
          return (
            <HubRow
              key={list}
              icon={<Icon size={20} color={colors.accent} strokeWidth={1.5} absoluteStrokeWidth />}
              title={SMART_TITLES[list]}
              count={count}
              last={index === SMART_LISTS.length - 1}
              onPress={() => open(list)}
            />
          );
        })}
      </View>

      {data.areas.map((area) => {
        const projects = data.projects.filter(
          (project) => project.area_uuid === area.uuid && project.completed_at === undefined,
        );
        return (
          <View key={area.uuid} className="mt-6">
            <Pressable
              accessibilityRole="button"
              onPress={() => open(`area:${area.uuid}`)}
              className="mx-4 h-9 flex-row items-center justify-between px-1"
            >
              <Text className="text-title-3 font-semibold text-ink">{area.title}</Text>
              <ChevronRight
                size={16}
                color={colors["ink-3"]}
                strokeWidth={1.5}
                absoluteStrokeWidth
              />
            </Pressable>
            {projects.length > 0 && (
              <View className="mx-4 overflow-hidden rounded-lg bg-canvas">
                {projects.map((project, index) => {
                  const own = data.tasks.filter((task) => task.project_uuid === project.uuid);
                  const done = own.filter((task) => !isOpen(task)).length;
                  return (
                    <HubRow
                      key={project.uuid}
                      icon={<ProjectPie done={done} total={own.length} />}
                      title={project.title}
                      count={own.length - done}
                      last={index === projects.length - 1}
                      onPress={() => open(`project:${project.uuid}`)}
                    />
                  );
                })}
              </View>
            )}
          </View>
        );
      })}

      <View className="mx-4 mt-6 overflow-hidden rounded-lg bg-canvas">
        {auth.status === "signedOut" ? (
          <HubRow
            icon={<View className="h-2.5 w-2.5 rounded-full border-[1.5px] border-edge-strong" />}
            title="Sign in to sync"
            last
            onPress={() => router.push("/sign-in")}
          />
        ) : (
          <View className="min-h-14 flex-row items-center gap-3 px-4 py-2">
            <View
              className={`h-2.5 w-2.5 rounded-full ${
                sync.connected && !sync.needsSignIn ? "bg-success" : "bg-warning"
              }`}
            />
            <View className="min-w-0 flex-1">
              <Text className="text-body text-ink" numberOfLines={1}>
                {auth.email}
              </Text>
              <Text className="text-small text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
                {syncLabel(sync)}
              </Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function HubRow({
  icon,
  title,
  count = 0,
  last,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  last?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 pl-4 active:bg-hover"
    >
      <View className="w-6 items-center">{icon}</View>
      <View
        className={`h-11 flex-1 flex-row items-center gap-2 pr-3 ${last ? "" : "border-b border-grid"}`}
      >
        <Text className="flex-1 text-body text-ink" numberOfLines={1}>
          {title}
        </Text>
        {count > 0 && (
          <Text className="text-body text-ink-3" style={{ fontVariant: ["tabular-nums"] }}>
            {count}
          </Text>
        )}
        <ChevronRight
          size={16}
          color={colors["edge-strong"]}
          strokeWidth={1.5}
          absoluteStrokeWidth
        />
      </View>
    </Pressable>
  );
}
