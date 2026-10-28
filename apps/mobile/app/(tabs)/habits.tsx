import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HabitList } from "../../src/habits/HabitList";
import { Workspace } from "../../src/ipad/Workspace";
import { useIsWide } from "../../src/lib/device";

export default function HabitsRoute() {
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  if (wide) return <Workspace initial={{ kind: "habits" }} />;
  return (
    <View className="flex-1 bg-sidebar">
      <HabitList topInset={insets.top} />
    </View>
  );
}
