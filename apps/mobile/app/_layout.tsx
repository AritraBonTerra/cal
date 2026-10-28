import { CalProvider } from "@cal/app-core";
import { toDayKey } from "@cal/domain";
import { Stack } from "expo-router";
import { lockAsync, OrientationLock } from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { cal } from "../src/data/cal";
import { AppProvider } from "../src/lib/app";
import { ClockProvider, now } from "../src/lib/clock";
import { useColors } from "../src/lib/theme";
import { view } from "../src/lib/view";
import "../global.css";

// Deep links to a sheet open it over the tabs rather than alone.
export const unstable_settings = { anchor: "(tabs)" };

// The calendar opens on today; the day count is set per device in the tabs layout.
view.set({ anchor: toDayKey(now()) });

// iPhone is portrait only, like Things; iPad turns freely for the split view.
if (Platform.OS === "ios" && !Platform.isPad) void lockAsync(OrientationLock.PORTRAIT_UP);

const sheet = {
  presentation: "formSheet",
  sheetAllowedDetents: "fitToContents",
  sheetGrabberVisible: true,
  sheetCornerRadius: 14,
  headerShown: false,
} as const;

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <CalProvider cal={cal}>
          <ClockProvider>
            <AppProvider>
              <StatusBar style="auto" />
              <Routes />
            </AppProvider>
          </ClockProvider>
        </CalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Tabs (or the iPad split view) underneath; every editor is a native sheet route.
function Routes() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="(tabs)" />
      {/* A page sheet, not a form sheet: form sheets misplace ScrollViews on Fabric. */}
      <Stack.Screen name="task/[id]" options={{ presentation: "modal", headerShown: false }} />
      <Stack.Screen name="block/[id]" options={sheet} />
      <Stack.Screen name="event/[id]" options={sheet} />
      <Stack.Screen name="new-block" options={sheet} />
      <Stack.Screen name="quick-entry" options={sheet} />
      <Stack.Screen name="sign-in" options={sheet} />
    </Stack>
  );
}
