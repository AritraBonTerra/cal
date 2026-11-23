import { type DeviceSettings, useSettings } from "@cal/app-core";
import {
  ACCENTS,
  accentIds,
  type Mode,
  paletteOf,
  THEMES,
  type ThemeId,
  themesFor,
} from "@cal/theme";
import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useColors, useMode } from "../lib/theme";

const MODES: { value: DeviceSettings["theme"]; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/*
 * Settings > Appearance: light, dark or the device's setting; the theme each mode draws;
 * and the accent. All of it stays on this device.
 */
export function Appearance() {
  const { device, setDevice } = useSettings();
  const mode = useMode();
  const colors = useColors();
  return (
    <>
      <View className="gap-2.5 border-b border-grid px-4 py-3">
        <Text className="text-body text-ink">Mode</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Mode" className="flex-row gap-2">
          {MODES.map(({ value, label }) => {
            const on = device.theme === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setDevice("theme", value)}
                className={`h-11 flex-1 items-center justify-center rounded-md ${
                  on ? "bg-accent-soft" : "bg-hover active:bg-active"
                }`}
              >
                <Text className={`text-body font-medium ${on ? "text-accent" : "text-ink"}`}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Themes
        mode="light"
        value={device.lightTheme}
        onChange={(id) => setDevice("lightTheme", id)}
      />
      <Themes mode="dark" value={device.darkTheme} onChange={(id) => setDevice("darkTheme", id)} />
      <View className="gap-1 px-4 pt-3 pb-2">
        <Text className="text-body text-ink">Accent</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Accent"
          className="-mx-1 flex-row justify-between"
        >
          {accentIds.map((id) => {
            const on = id === device.accent;
            const theme = mode === "dark" ? device.darkTheme : device.lightTheme;
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={ACCENTS[id].label}
                onPress={() => setDevice("accent", id)}
                className="h-11 w-11 items-center justify-center rounded-full active:bg-hover"
              >
                <View
                  className="h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: paletteOf(theme, id)["accent-solid"] }}
                >
                  {on && (
                    <Check size={16} color={colors.white} strokeWidth={2.5} absoluteStrokeWidth />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}

// The themes of one mode as small pictures, three to a row.
function Themes({
  mode,
  value,
  onChange,
}: {
  mode: Mode;
  value: ThemeId;
  onChange: (id: ThemeId) => void;
}) {
  const label = mode === "light" ? "Light theme" : "Dark theme";
  return (
    <View className="gap-2.5 border-b border-grid px-4 pt-3 pb-1">
      <Text className="text-body text-ink">{label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="-mx-1 flex-row flex-wrap"
      >
        {themesFor(mode).map((id) => {
          const on = id === value;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={THEMES[id].label}
              onPress={() => onChange(id)}
              className="w-1/3 items-center gap-1 px-1 pb-2"
            >
              <ThemePicture id={id} on={on} />
              <Text className={`text-small ${on ? "font-medium text-ink" : "text-ink-2"}`}>
                {THEMES[id].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// A theme as a tiny window: its sidebar, canvas, two lines of text and the now color. The
// picked one is ringed in the accent.
function ThemePicture({ id, on }: { id: ThemeId; on: boolean }) {
  const { device } = useSettings();
  const colors = paletteOf(id, device.accent);
  return (
    <View
      className={`h-16 w-full rounded-lg border-2 p-0.5 ${on ? "border-accent" : "border-transparent"}`}
    >
      <View
        className="flex-1 flex-row overflow-hidden rounded-md border border-edge"
        style={{ backgroundColor: colors.canvas }}
      >
        <View className="w-1/3" style={{ backgroundColor: colors.sidebar }} />
        <View className="flex-1 gap-1.5 p-2">
          <View className="h-1 w-4/5 rounded-full" style={{ backgroundColor: colors.ink }} />
          <View className="h-1 w-3/5 rounded-full" style={{ backgroundColor: colors["ink-3"] }} />
          <View className="mt-auto h-2 w-2 rounded-full" style={{ backgroundColor: colors.now }} />
        </View>
      </View>
    </View>
  );
}
