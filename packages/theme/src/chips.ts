import { fromHex, mix, type Oklch, oklch, toHex } from "./color";
import { colors, type Mode } from "./tokens";

/*
 * Event-chip colors derived from one calendar hue (research/07 §7.4): a pale fill, a
 * saturated 3px left bar, same-hue dark text, and a solid fill with white text when
 * selected. Every value is opaque so overlapping chips and grid lines never show
 * through text. Graphite (chroma 0) calendars pass `neutral`.
 */

export interface ChipColors {
  fill: string;
  bar: string;
  title: string;
  time: string;
  solid: string;
  // The same chip mixed halfway toward the canvas, for events already over.
  pastFill: string;
  pastTitle: string;
  pastTime: string;
}

export function chipColors(hue: number, mode: Mode, neutral = false): ChipColors {
  const color = (l: number, c: number): Oklch => oklch(l, neutral ? 0 : c, hue);
  const canvas = colors.canvas[mode];
  const past = (value: Oklch) => mix(value, canvas, 0.5);
  const parts =
    mode === "light"
      ? {
          fill: color(0.95, 0.03),
          bar: color(0.68, 0.13),
          title: color(0.36, 0.07),
          time: color(0.47, 0.07),
        }
      : {
          fill: color(0.32, 0.05),
          bar: color(0.72, 0.13),
          title: color(0.94, 0.025),
          time: color(0.8, 0.05),
        };
  return {
    fill: toHex(parts.fill),
    bar: toHex(parts.bar),
    title: toHex(parts.title),
    time: toHex(parts.time),
    solid: toHex(color(0.56, 0.13)),
    pastFill: past(parts.fill),
    pastTitle: past(parts.title),
    pastTime: past(parts.time),
  };
}

// Chip colors for a calendar's own hex color: its hue is kept, everything else is ours.
export function chipColorsFromHex(hex: string, mode: Mode) {
  const { c, h } = fromHex(hex);
  return chipColors(h, mode, c < 0.02);
}

// Task-block outline and stripe for a project hue (research/07 §7.6).
export function blockColors(hue: number, mode: Mode) {
  return {
    border: toHex(mode === "light" ? oklch(0.88, 0.03, hue) : oklch(0.38, 0.04, hue)),
    stripe: toHex(mode === "light" ? oklch(0.68, 0.13, hue) : oklch(0.72, 0.13, hue)),
  };
}

// Habit-chip fill and label when done: the same pale fill and dark text as a chip.
export function habitColors(hue: number, mode: Mode) {
  const { fill, title, bar } = chipColors(hue, mode);
  return { fill, label: title, ring: bar };
}
