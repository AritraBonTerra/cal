import { type Oklch, oklch, toHex } from "./color";
import { type ColorToken, colors, type Mode } from "./tokens";

/*
 * Themes tint the neutrals; accents pick the one strong color. Both are worked out from
 * tokens.ts rather than written by hand: a theme keeps every neutral's place in the
 * scale and changes its hue, chroma and how far the surfaces sit from white or black.
 * Calendar colors are the same in every theme. Each device picks a light theme, a dark
 * theme and an accent; `paletteOf` gives the hex values both apps draw with.
 */

interface ThemeSpec {
  label: string;
  mode: Mode;
  hue: number;
  chroma: number;
  // Lightness added to the surfaces (negative goes darker).
  shift: number;
  // The canvas's own lightness, where it isn't the shifted one.
  canvas?: number;
}

export const THEMES = {
  daylight: { label: "Daylight", mode: "light", hue: 75, chroma: 0, shift: 0 },
  linen: { label: "Linen", mode: "light", hue: 80, chroma: 0.008, shift: -0.025 },
  mist: { label: "Mist", mode: "light", hue: 245, chroma: 0.012, shift: -0.022 },
  sand: { label: "Sand", mode: "light", hue: 85, chroma: 0.022, shift: -0.03 },
  sage: { label: "Sage", mode: "light", hue: 145, chroma: 0.016, shift: -0.026 },
  lilac: { label: "Lilac", mode: "light", hue: 305, chroma: 0.016, shift: -0.026 },
  charcoal: { label: "Charcoal", mode: "dark", hue: 75, chroma: 0, shift: 0 },
  black: { label: "Black", mode: "dark", hue: 75, chroma: 0, shift: -0.03, canvas: 0 },
  slate: { label: "Slate", mode: "dark", hue: 250, chroma: 0.02, shift: 0.02 },
  walnut: { label: "Walnut", mode: "dark", hue: 62, chroma: 0.018, shift: 0.005 },
  pine: { label: "Pine", mode: "dark", hue: 165, chroma: 0.02, shift: 0.005 },
  plum: { label: "Plum", mode: "dark", hue: 310, chroma: 0.024, shift: 0.01 },
} as const satisfies Record<string, ThemeSpec>;

export type ThemeId = keyof typeof THEMES;

export const themeIds = Object.keys(THEMES) as ThemeId[];

// The themes for one mode, in picker order.
export const themesFor = (mode: Mode) => themeIds.filter((id) => THEMES[id].mode === mode);

// Hue and chroma of each accent. "blue" is Cal's own: the one accent that leaves "now"
// red. Every other colors the now line and today's badge as well.
export const ACCENTS = {
  blue: { label: "Blue", hue: 255, chroma: 0.17 },
  brick: { label: "Brick", hue: 35, chroma: 0.16 },
  ochre: { label: "Ochre", hue: 70, chroma: 0.12 },
  green: { label: "Green", hue: 150, chroma: 0.13 },
  plum: { label: "Plum", hue: 325, chroma: 0.16 },
  ink: { label: "Ink", hue: 75, chroma: 0 },
} as const satisfies Record<string, { label: string; hue: number; chroma: number }>;

export type AccentId = keyof typeof ACCENTS;

export const accentIds = Object.keys(ACCENTS) as AccentId[];

// Every color token as hex.
export type Palette = Record<ColorToken, string>;

// The neutrals, as surfaces (which shift) and ink (which keeps its distance from them).
const SURFACES: readonly ColorToken[] = [
  "canvas",
  "sidebar",
  "raised",
  "hover",
  "active",
  "offhours",
];
const LINES: readonly ColorToken[] = ["grid", "edge", "edge-strong"];
const INKS: readonly ColorToken[] = ["ink", "ink-2", "ink-3"];

// The smart lists' icon colors, which only darken with a light theme's paper.
const isListColor = (token: ColorToken) => token.startsWith("list-");

const clamp = (value: number) => Math.min(1, Math.max(0, value));

// A neutral token in a theme: the token's own lightness, moved and tinted.
function neutral(token: ColorToken, spec: ThemeSpec): Oklch {
  const base = colors[token][spec.mode];
  const tint = base.c + spec.chroma;
  const hue = spec.chroma > 0 ? spec.hue : base.h;
  if (token === "canvas" && spec.canvas !== undefined) return oklch(spec.canvas, tint, hue);
  if (SURFACES.includes(token)) {
    // Raised layers move half as far, so popovers and cards still lift off the canvas.
    const shift = token === "raised" ? spec.shift / 2 : spec.shift;
    return oklch(clamp(base.l + shift), tint, hue);
  }
  if (LINES.includes(token)) return oklch(clamp(base.l + spec.shift), tint, hue);
  // Ink follows a light theme's darker paper down; on dark themes it stays put.
  return oklch(clamp(base.l + (spec.mode === "light" ? spec.shift : 0)), tint, hue);
}

// The accent tokens in a mode. Lightness is fixed per role, so contrast is too.
function accentColors(id: AccentId, mode: Mode): Partial<Record<ColorToken, Oklch>> {
  if (id === "blue") return {};
  const { hue, chroma }: { hue: number; chroma: number } = ACCENTS[id];
  const color = (l: number, c = chroma) => oklch(l, Math.min(c, chroma), hue);
  if (id === "ink") {
    const strong = mode === "light" ? color(0.3) : color(0.9);
    const solid = mode === "light" ? color(0.3) : color(0.48);
    const soft = mode === "light" ? color(0.92) : color(0.32);
    return { accent: strong, "accent-solid": solid, "accent-soft": soft, now: solid };
  }
  return mode === "light"
    ? {
        accent: color(0.52),
        "accent-solid": color(0.52),
        "accent-soft": color(0.94, 0.035),
        now: color(0.54),
      }
    : {
        accent: color(0.75, 0.13),
        "accent-solid": color(0.54),
        "accent-soft": color(0.31, 0.06),
        now: color(0.6),
      };
}

const cache = new Map<string, Palette>();

// Every color in `theme` with `accent`, as opaque hex. The same object per pair.
export function paletteOf(theme: ThemeId, accent: AccentId): Palette {
  const key = `${theme}/${accent}`;
  const known = cache.get(key);
  if (known) return known;
  const spec: ThemeSpec = THEMES[theme];
  const accents = accentColors(accent, spec.mode);
  const entries = Object.entries(colors).map(([name, value]) => {
    const token = name as ColorToken;
    const themed = [...SURFACES, ...LINES, ...INKS].includes(token)
      ? neutral(token, spec)
      : (accents[token] ?? value[spec.mode]);
    const darker = isListColor(token) && spec.mode === "light" ? spec.shift : 0;
    return [token, toHex({ ...themed, l: themed.l + darker })];
  });
  const palette = Object.fromEntries(entries) as Palette;
  cache.set(key, palette);
  return palette;
}
