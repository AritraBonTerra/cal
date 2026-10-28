/*
 * OKLCH color math, enough to author every color in OKLCH and ship opaque hex (PLAN §6).
 * Conversions follow Björn Ottosson's OKLab reference; out-of-gamut colors are brought
 * into sRGB by reducing chroma, never by clipping channels, so hues stay true.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

type Rgb = [r: number, g: number, b: number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

// Linear sRGB (possibly out of 0–1) for an OKLCH color.
function toLinearRgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function fromLinearRgb([r, g, b]: Rgb): Oklch {
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(a, b_);
  const h = c < 1e-6 ? 0 : ((Math.atan2(b_, a) * 180) / Math.PI + 360) % 360;
  return { l, c, h };
}

const inGamut = (rgb: Rgb, tolerance = 1e-4) =>
  rgb.every((channel) => channel >= -tolerance && channel <= 1 + tolerance);

// The same hue and lightness with the largest chroma (up to the given one) inside sRGB.
export function clampChroma(color: Oklch): Oklch {
  if (inGamut(toLinearRgb(color))) return color;
  let low = 0;
  let high = color.c;
  for (let step = 0; step < 24; step++) {
    const mid = (low + high) / 2;
    if (inGamut(toLinearRgb({ ...color, c: mid }))) low = mid;
    else high = mid;
  }
  return { ...color, c: low };
}

const hex2 = (channel: number) =>
  Math.round(clamp01(channel) * 255)
    .toString(16)
    .padStart(2, "0");

// Opaque `#rrggbb` for an OKLCH color, gamut-mapped by chroma.
export function toHex(color: Oklch) {
  const [r, g, b] = toLinearRgb(clampChroma(color)).map(fromLinear);
  return `#${hex2(r ?? 0)}${hex2(g ?? 0)}${hex2(b ?? 0)}`;
}

export const oklch = (l: number, c: number, h: number): Oklch => ({ l, c, h });

// Parses `#rgb`, `#rrggbb` or `#rrggbbaa` (alpha ignored); anything else is black.
export function fromHex(hex: string): Oklch {
  const digits = hex.replace("#", "");
  const full = digits.length === 3 || digits.length === 4 ? [...digits].map((d) => d + d) : null;
  const text = full ? full.join("") : digits;
  const value = Number.parseInt(text.slice(0, 6).padEnd(6, "0"), 16);
  const rgb: Rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return fromLinearRgb(rgb.map((channel) => toLinear(channel / 255)) as Rgb);
}

// Mixes `a` toward `b` by `amount` (0–1) in OKLab, returning opaque hex.
export function mix(a: Oklch, b: Oklch, amount: number) {
  const rgbA = toLinearRgb(clampChroma(a));
  const rgbB = toLinearRgb(clampChroma(b));
  const mixed = rgbA.map((channel, index) => channel + ((rgbB[index] ?? 0) - channel) * amount);
  return toHex(fromLinearRgb(mixed as Rgb));
}

// WCAG 2 relative luminance of an OKLCH color after gamut mapping.
function luminance(color: Oklch) {
  const [r, g, b] = toLinearRgb(clampChroma(color)).map(clamp01);
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

// WCAG 2 contrast ratio between two colors, 1–21.
export function contrast(a: Oklch, b: Oklch) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
