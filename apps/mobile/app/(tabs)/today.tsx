import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Workspace } from "../../src/ipad/Workspace";
import { useIsWide } from "../../src/lib/device";
import { useColors } from "../../src/lib/theme";
import { TaskList } from "../../src/tasks/TaskList";

// Today: the list on iPhone, the workspace with Today selected on iPad.
export default function TodayRoute() {
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  if (wide) return <Workspace initial={{ kind: "list", list: "today" }} />;
  return (
    <View className="flex-1 bg-canvas">
      <TaskList list="today" header={<View style={{ height: insets.top + 8 }} />} />
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
