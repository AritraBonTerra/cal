import { type DeviceSettings, useSettings } from "@cal/app-core";
import { type Mode, type Palette, paletteOf } from "@cal/theme";
import { useLayoutEffect, useSyncExternalStore } from "react";

const query = window.matchMedia("(prefers-color-scheme: dark)");

const subscribe = (listener: () => void) => {
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};

const currentMode = (): Mode => (query.matches ? "dark" : "light");

// "light" or "dark", following the system. Chip colors are derived per mode.
export const useMode = (): Mode => useSyncExternalStore(subscribe, currentMode);

type ThemeSettings = Pick<DeviceSettings, "lightTheme" | "darkTheme" | "accent">;

const paletteIn = (mode: Mode, { lightTheme, darkTheme, accent }: ThemeSettings) =>
  paletteOf(mode === "dark" ? darkTheme : lightTheme, accent);

// The colors in force, as hex, for code that mixes them or can't use a class.
export const usePalette = (): Palette => paletteIn(useMode(), useSettings().device);

// Sets every `--cal-*` color on the page. theme.css holds the base theme's values.
function paint(palette: Palette) {
  const { style } = document.documentElement;
  for (const [token, hex] of Object.entries(palette)) style.setProperty(`--cal-${token}`, hex);
  // Main gives the window the same background, so resizing never flashes another color.
  void window.cal.setBackground(palette.canvas);
}

// Paints the saved theme before the first render, so the window never shows another.
export const paintTheme = (settings: ThemeSettings) => paint(paletteIn(currentMode(), settings));

// Repaints when the mode, a theme or the accent changes; every window has one.
export function ThemePaint() {
  const palette = usePalette();
  useLayoutEffect(() => paint(palette), [palette]);
  return null;
}

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export const reducedMotion = () => motionQuery.matches;
