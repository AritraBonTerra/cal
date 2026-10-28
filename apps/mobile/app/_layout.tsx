import { CalProvider } from "@cal/app-core";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { cal } from "../src/data/cal";
import "../global.css";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CalProvider cal={cal}>
        <Stack screenOptions={{ headerShown: false }} />
      </CalProvider>
    </GestureHandlerRootView>
  );
}
