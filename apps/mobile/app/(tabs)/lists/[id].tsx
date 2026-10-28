import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Plus } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Workspace } from "../../../src/ipad/Workspace";
import { useIsWide } from "../../../src/lib/device";
import { isSmartList, type ListId } from "../../../src/lib/lists";
import { useColors } from "../../../src/lib/theme";
import { TaskList } from "../../../src/tasks/TaskList";

// One list (a smart list, project or area) with a back button to the hub.
export default function ListRoute() {
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = toListId(id);
  if (wide) return <Workspace initial={{ kind: "list", list }} />;
  return (
    <View className="flex-1 bg-canvas">
      <TaskList
        list={list}
        header={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lists"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/lists"))}
            hitSlop={8}
            className="h-11 flex-row items-center gap-0.5 px-2"
            style={{ marginTop: insets.top }}
          >
            <ChevronLeft size={22} color={colors.accent} strokeWidth={1.75} absoluteStrokeWidth />
            <Text className="text-title-3 text-accent">Lists</Text>
          </Pressable>
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New to-do"
        onPress={() => router.push("/quick-entry")}
        className="absolute right-5 bottom-5 h-14 w-14 items-center justify-center rounded-full bg-accent-solid active:opacity-80"
        style={{
          shadowColor: colors["accent-solid"],
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <Plus size={26} color={colors.white} strokeWidth={2.25} absoluteStrokeWidth />
      </Pressable>
    </View>
  );
}

// Route ids are "today", "project:<uuid>" or "area:<uuid>"; anything else is Inbox.
function toListId(id: string | undefined): ListId {
  if (!id) return "inbox";
  if (isSmartList(id)) return id;
  if (id.startsWith("project:")) return `project:${id.slice("project:".length)}`;
  if (id.startsWith("area:")) return `area:${id.slice("area:".length)}`;
  return "inbox";
}
