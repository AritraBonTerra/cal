import { Stack, Tabs } from "expo-router";
import { CalendarDays, List, Repeat, Star } from "lucide-react-native";
import { useEffect } from "react";
import { useIsWide } from "../../src/lib/device";
import { useColors } from "../../src/lib/theme";
import { view } from "../../src/lib/view";

/*
 * iPhone: four tabs (Calendar, Today, Lists, Habits). iPad: the same routes in a
 * plain stack, each rendering the split-view workspace, so there's no tab bar and a
 * deep link to /today opens the workspace with Today selected.
 */
export default function TabsLayout() {
  const wide = useIsWide();
  const colors = useColors();

  // A week fits on iPad; a day on iPhone.
  useEffect(() => {
    view.set(({ count }) => ({ count: wide ? (count === 1 ? 7 : count) : Math.min(count, 3) }));
  }, [wide]);

  if (wide) return <Stack screenOptions={{ headerShown: false, animation: "none" }} />;

  const stroke = { strokeWidth: 1.5, absoluteStrokeWidth: true } as const;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors["ink-3"],
        tabBarStyle: { backgroundColor: colors.canvas, borderTopColor: colors.grid },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color }) => <CalendarDays size={24} color={color} {...stroke} />,
        }}
      />
      <Tabs.Screen
        name="today"
        options={{
          title: "Today",
          tabBarIcon: ({ color }) => <Star size={24} color={color} {...stroke} />,
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: "Lists",
          tabBarIcon: ({ color }) => <List size={24} color={color} {...stroke} />,
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: "Habits",
          tabBarIcon: ({ color }) => <Repeat size={24} color={color} {...stroke} />,
        }}
      />
    </Tabs>
  );
}
