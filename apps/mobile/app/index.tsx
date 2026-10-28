import { useTable } from "@cal/app-core";
import { Text, View } from "react-native";

// Placeholder until the Today and calendar screens land.
export default function Home() {
  const { rows, loaded } = useTable("tasks");
  return (
    <View className="flex-1 items-center justify-center">
      <Text className="text-lg font-semibold">Cal</Text>
      <Text>{loaded ? `${rows.length} tasks` : "Loading…"}</Text>
    </View>
  );
}
