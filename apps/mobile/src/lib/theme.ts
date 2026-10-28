import { type ColorToken, colors, type Mode, toHex } from "@cal/theme";
import { useUniwind } from "uniwind";

/*
 * Theme values for code that can't take a className: SVG strokes, icon colors, chip
 * palettes and animated styles. Classes stay the default for everything else.
 */

const cache = new Map<Mode, Record<ColorToken, string>>();

// Every color token as hex for `mode`, computed once per mode.
export function palette(mode: Mode) {
  const existing = cache.get(mode);
  if (existing) return existing;
  const entries = Object.entries(colors).map(([name, value]) => [name, toHex(value[mode])]);
  const built = Object.fromEntries(entries) as Record<ColorToken, string>;
  cache.set(mode, built);
  return built;
}

// "light" or "dark", following the device (Uniwind resolves "system" to one of them).
export function useMode(): Mode {
  const { theme } = useUniwind();
  return theme === "dark" ? "dark" : "light";
}

export const useColors = () => palette(useMode());
