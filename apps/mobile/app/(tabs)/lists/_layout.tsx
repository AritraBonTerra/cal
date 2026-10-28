import { Stack } from "expo-router";
import { useColors } from "../../../src/lib/theme";

// Lists hub, then one list pushed on top with a native back swipe.
export default function ListsLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
