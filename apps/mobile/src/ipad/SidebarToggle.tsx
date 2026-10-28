import { SymbolView } from "expo-symbols";
import { Pressable, useWindowDimensions } from "react-native";
import { createStore, useStore } from "../lib/store";
import { useColors } from "../lib/theme";

/*
 * Whether the iPad sidebar is shown, and the button that flips it. It follows iPadOS
 * split views: shown by default in landscape, hidden in portrait (where it would
 * squeeze a week into 60pt columns), and the choice is kept across routes.
 */

// Below this window width the sidebar starts hidden (every iPad in portrait).
const SIDEBAR_AUTO_WIDTH = 1100;

export const workspace = createStore<{ sidebar: boolean | null }>({ sidebar: null });

export function useSidebarOpen() {
  const choice = useStore(workspace, (state) => state.sidebar);
  const { width } = useWindowDimensions();
  return choice ?? width >= SIDEBAR_AUTO_WIDTH;
}

// The split view's toggle, an SF Symbol like every native iPad toolbar (research/07 §5).
export function SidebarToggle() {
  const open = useSidebarOpen();
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={open ? "Hide sidebar" : "Show sidebar"}
      onPress={() => workspace.set({ sidebar: !open })}
      hitSlop={4}
      className="h-9 w-9 items-center justify-center rounded-md active:bg-hover"
    >
      <SymbolView
        name="sidebar.leading"
        size={20}
        tintColor={colors["ink-2"]}
        weight="regular"
        resizeMode="scaleAspectFit"
      />
    </Pressable>
  );
}
