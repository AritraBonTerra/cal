import { type DeviceSettings, useCal } from "@cal/app-core";
import { type Mode, type Palette, paletteOf } from "@cal/theme";
import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { Uniwind, useUniwind } from "uniwind";

/*
 * The theme and accent picked in Settings > Appearance. Classes ("bg-canvas") read them
 * as Uniwind variables; code that can't take a className (SVG strokes, icon colors, chip
 * palettes, animated styles) reads the same values from `useColors`.
 */

type ThemeSettings = Pick<DeviceSettings, "lightTheme" | "darkTheme" | "accent">;

const paletteIn = (mode: Mode, { lightTheme, darkTheme, accent }: ThemeSettings) =>
  paletteOf(mode === "dark" ? darkTheme : lightTheme, accent);

// Sets every color class in both modes. theme.native.css holds the base themes' values.
function paintColors(settings: ThemeSettings) {
  for (const mode of ["light", "dark"] as const) {
    const colors = Object.entries(paletteIn(mode, settings));
    Uniwind.updateCSSVariables(
      mode,
      Object.fromEntries(colors.map(([token, hex]) => [`--color-${token}`, hex])),
    );
  }
}

// Paints the saved theme before the first render, so the app never shows another.
export function paintTheme(settings: DeviceSettings) {
  paintColors(settings);
  Uniwind.setTheme(settings.theme);
}

// "light" or "dark": the device's, or the one picked in Settings.
export function useMode(): Mode {
  const { theme } = useUniwind();
  return theme === "dark" ? "dark" : "light";
}

const ColorsContext = createContext<Palette>(paletteOf("daylight", "blue"));

// Every color token as hex, in the theme and mode in force.
export const useColors = () => useContext(ColorsContext);

// Repaints when the mode, a theme or the accent changes, and gives `useColors` its values.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useCal();
  const { theme, lightTheme, darkTheme, accent } = useSyncExternalStore(
    (listener) => settings.subscribeDevice(listener),
    () => settings.device,
  );
  const mode = useMode();
  const picked = useMemo(
    () => ({ lightTheme, darkTheme, accent }),
    [lightTheme, darkTheme, accent],
  );
  useLayoutEffect(() => paintColors(picked), [picked]);
  useLayoutEffect(() => Uniwind.setTheme(theme), [theme]);
  return <ColorsContext value={paletteIn(mode, picked)}>{children}</ColorsContext>;
}
