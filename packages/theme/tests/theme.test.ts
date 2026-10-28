import { describe, expect, test } from "bun:test";
import { chipColors, chipColorsFromHex, contrast, fromHex, mix, oklch, toHex } from "../src";
import { renderCss } from "../src/css";

describe("color", () => {
  test("converts OKLCH to hex and back", () => {
    expect(toHex(oklch(1, 0, 0))).toBe("#ffffff");
    expect(toHex(oklch(0, 0, 0))).toBe("#000000");
    const blue = fromHex("#1570d1");
    expect(blue.l).toBeCloseTo(0.55, 1);
    expect(blue.h).toBeCloseTo(255, 0);
    expect(toHex(blue)).toBe("#1570d1");
  });

  test("keeps the hue when a color is outside sRGB", () => {
    const vivid = oklch(0.95, 0.3, 120);
    const hex = toHex(vivid);
    expect(fromHex(hex).h).toBeCloseTo(120, -1);
    expect(fromHex(hex).l).toBeCloseTo(0.95, 1);
  });

  test("mixes toward the canvas without leaving sRGB", () => {
    expect(mix(oklch(0.36, 0.07, 255), oklch(1, 0, 0), 0.5)).toMatch(/^#[0-9a-f]{6}$/);
    expect(mix(oklch(0.5, 0, 0), oklch(0.5, 0, 0), 0.5)).toBe(toHex(oklch(0.5, 0, 0)));
  });
});

describe("chips", () => {
  const hues = [25, 55, 95, 150, 190, 255, 280, 310, 350];

  test("titles and times pass contrast on their fill in both modes", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const hue of hues) {
        const chip = chipColors(hue, mode);
        expect(contrast(fromHex(chip.title), fromHex(chip.fill))).toBeGreaterThan(7);
        expect(contrast(fromHex(chip.time), fromHex(chip.fill))).toBeGreaterThan(4.5);
        expect(contrast(oklch(1, 0, 0), fromHex(chip.solid))).toBeGreaterThan(4);
      }
    }
  });

  test("derives from a calendar's hex, with graphite staying neutral", () => {
    const blue = chipColorsFromHex("#3b82f6", "light");
    expect(fromHex(blue.bar).h).toBeCloseTo(fromHex("#3b82f6").h, 0);
    const gray = chipColorsFromHex("#888888", "light");
    expect(fromHex(gray.fill).c).toBeLessThan(0.005);
  });
});

test("theme.css is up to date with tokens.ts", async () => {
  const file = await Bun.file(new URL("../theme.css", import.meta.url)).text();
  expect(file).toBe(renderCss());
});
