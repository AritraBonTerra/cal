import { type Oklch, oklch } from "./color";

/*
 * Cal's design values (PLAN §6, research/07 §7). Colors are authored in OKLCH and
 * compiled to opaque hex for both platforms by `scripts/build-css.ts` (Tailwind on the
 * Mac) and the TS exports below (Uniwind on iOS). Neutrals sit on hue 75 with almost no
 * chroma so calendar colors read true; blue is the one accent and red means "now".
 */

export type Mode = "light" | "dark";

// Hue of every neutral: a slight warmth, following Linear's 2026 shift and Notion's grays.
export const NEUTRAL_HUE = 75;
const neutral = (l: number, c = 0.004) => oklch(l, c, NEUTRAL_HUE);

export const colors = {
  // Surfaces, from the canvas up: the sidebar is a step down, floating layers a step up.
  canvas: { light: oklch(1, 0, 0), dark: neutral(0.185) },
  sidebar: { light: neutral(0.975, 0.003), dark: neutral(0.165) },
  raised: { light: oklch(1, 0, 0), dark: neutral(0.235, 0.005) },
  hover: { light: neutral(0.96, 0.003), dark: neutral(0.23) },
  active: { light: neutral(0.94), dark: neutral(0.26, 0.005) },
  offhours: { light: neutral(0.985, 0.002), dark: neutral(0.17) },
  // Hairlines: hour lines and dividers, then input and panel edges, then outlines.
  grid: { light: neutral(0.925, 0.003), dark: neutral(0.255) },
  edge: { light: neutral(0.885), dark: neutral(0.3, 0.005) },
  "edge-strong": { light: neutral(0.8, 0.005), dark: neutral(0.36, 0.006) },
  // Text, primary to tertiary. Opaque mixes, never opacity.
  ink: { light: neutral(0.24, 0.006), dark: neutral(0.94) },
  "ink-2": { light: neutral(0.47, 0.008), dark: neutral(0.78, 0.006) },
  "ink-3": { light: neutral(0.56, 0.008), dark: neutral(0.68, 0.006) },
  // The one accent (links, focus, checked boxes) and its soft fill for selected rows.
  accent: { light: oklch(0.55, 0.17, 255), dark: oklch(0.72, 0.13, 255) },
  "accent-solid": { light: oklch(0.55, 0.17, 255), dark: oklch(0.55, 0.17, 255) },
  "accent-soft": { light: oklch(0.95, 0.03, 255), dark: oklch(0.3, 0.06, 255) },
  // Red only for "now": the now line, today badge, overdue deadlines, destructive.
  now: { light: oklch(0.58, 0.21, 27), dark: oklch(0.68, 0.19, 27) },
  success: { light: oklch(0.55, 0.14, 150), dark: oklch(0.72, 0.14, 150) },
  warning: { light: oklch(0.7, 0.15, 70), dark: oklch(0.78, 0.14, 75) },
  white: { light: oklch(1, 0, 0), dark: oklch(1, 0, 0) },
} satisfies Record<string, Record<Mode, Oklch>>;

export type ColorToken = keyof typeof colors;

// Type roles: size and line height in px on the Mac (iPad values are one step up).
export const type = {
  caption: { size: 11, line: 14 },
  small: { size: 12, line: 16 },
  body: { size: 13, line: 18 },
  "title-3": { size: 15, line: 20 },
  "title-2": { size: 20, line: 25 },
  "title-1": { size: 26, line: 32 },
} as const;

export const radius = { xs: 3, sm: 4, md: 6, lg: 10, xl: 14 } as const;

// Grid geometry: an hour is 48px, so a 15-minute snap is 12px.
export const grid = {
  hourHeight: 48,
  snapMinutes: 15,
  gutterWidth: 52,
  dayHeaderHeight: 44,
} as const;

// Durations in ms. Keyboard navigation and view switches are always `instant`.
export const motion = {
  instant: 0,
  fast: 100,
  base: 150,
  slow: 220,
  flash: 600,
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  easeInOut: "cubic-bezier(0.645, 0.045, 0.355, 1)",
} as const;
