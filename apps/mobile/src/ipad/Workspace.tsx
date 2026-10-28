import { useGlobalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarScreen } from "../grid/CalendarScreen";
import { HabitList } from "../habits/HabitList";
import { TaskList } from "../tasks/TaskList";
import { type Pane, Sidebar } from "./Sidebar";
import { useSidebarOpen, workspace } from "./SidebarToggle";

/*
 * The iPad layout, like the Mac: sidebar, the chosen list (or Habits) in the middle,
 * and the calendar with up to a week of days. The sidebar choice is local state, so
 * switching lists never remounts the grid.
 * The sidebar can be hidden (SidebarToggle), which portrait does by default; a deep
 * link's `?sidebar=1` or `0` forces it, for screenshots.
 */

const PANE_WIDTH = 304;

export function Workspace({ initial }: { initial: Pane }) {
  const [pane, setPane] = useState<Pane>(initial);
  const insets = useSafeAreaInsets();
  const sidebar = useSidebarOpen();
  const params = useGlobalSearchParams<{ sidebar?: string }>();
  useEffect(() => {
    if (params.sidebar === "1" || params.sidebar === "0")
      workspace.set({ sidebar: params.sidebar === "1" });
  }, [params.sidebar]);
  return (
    <View className="flex-1 flex-row bg-canvas">
      {sidebar && <Sidebar pane={pane} onSelect={setPane} />}
      <View
        className="border-r border-grid bg-canvas"
        style={{ width: PANE_WIDTH, paddingTop: insets.top }}
      >
        {pane.kind === "list" ? (
          <TaskList list={pane.list} bottomInset={insets.bottom} toggle />
        ) : (
          <HabitList bottomInset={insets.bottom} toggle />
        )}
      </View>
      <View className="flex-1">
        <CalendarScreen counts={[1, 3, 7]} />
      </View>
    </View>
  );
}
