import { describe, expect, test } from "bun:test";
import {
  accentIds,
  chipColors,
  chipColorsFromHex,
  colors,
  contrast,
  fromHex,
  mix,
  oklch,
  type Palette,
  paletteOf,
  THEMES,
  themeIds,
  themesFor,
  toHex,
  type,
  typeMobile,
} from "../src";
import { renderCss, renderNativeCss } from "../src/css";

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

test("smart-list icon colors keep 3:1 on the sidebar, canvas and active row", () => {
  const lists = ["inbox", "today", "upcoming", "anytime", "someday", "logbook"] as const;
  for (const mode of ["light", "dark"] as const) {
    for (const list of lists) {
      const icon = fromHex(toHex(colors[`list-${list}`][mode]));
      for (const surface of ["sidebar", "canvas", "active"] as const) {
        expect(contrast(icon, fromHex(toHex(colors[surface][mode])))).toBeGreaterThanOrEqual(3);
      }
    }
  }
});

test("theme.css is up to date with tokens.ts", async () => {
  const file = await Bun.file(new URL("../theme.css", import.meta.url)).text();
  expect(file).toBe(renderCss());
});

test("theme.native.css is up to date with tokens.ts", async () => {
  const file = await Bun.file(new URL("../theme.native.css", import.meta.url)).text();
  expect(file).toBe(renderNativeCss());
});

test("the mobile scale is one step up from the Mac scale and never below 11", () => {
  expect(Object.keys(typeMobile)).toEqual(Object.keys(type));
  for (const role of Object.keys(type) as (keyof typeof type)[]) {
    expect(typeMobile[role].size).toBeGreaterThan(type[role].size);
    expect(typeMobile[role].line).toBeGreaterThanOrEqual(typeMobile[role].size);
  }
  expect(typeMobile.caption.size).toBeGreaterThanOrEqual(11);
});

describe("themes", () => {
  const modes = ["light", "dark"] as const;
  const ratio = (a: string, b: string) => contrast(fromHex(a), fromHex(b));
  const each = (check: (colors: Palette, name: string, mode: "light" | "dark") => void) => {
    for (const theme of themeIds)
      for (const accent of accentIds)
        check(paletteOf(theme, accent), `${theme}/${accent}`, THEMES[theme].mode);
  };

  test("the first light and dark themes with blue are exactly the base tokens", () => {
    for (const mode of modes) {
      const base = Object.fromEntries(
        Object.entries(colors).map(([name, value]) => [name, toHex(value[mode])]),
      );
      expect(paletteOf(themesFor(mode)[0] ?? "daylight", "blue")).toEqual(base as Palette);
    }
    expect(themesFor("light")).toHaveLength(6);
    expect(themesFor("dark")).toHaveLength(6);
  });

  test("text reads on every surface it sits on, in every theme", () => {
    each((palette, name) => {
      for (const surface of ["canvas", "sidebar", "raised", "hover"] as const) {
        expect([name, surface, ratio(palette.ink, palette[surface]) >= 10]).toEqual([
          name,
          surface,
          true,
        ]);
        expect([name, surface, ratio(palette["ink-2"], palette[surface]) >= 5.5]).toEqual([
          name,
          surface,
          true,
        ]);
        expect([name, surface, ratio(palette["ink-3"], palette[surface]) >= 4]).toEqual([
          name,
          surface,
          true,
        ]);
      }
    });
  });

  test("accents read as text and behind white", () => {
    each((palette, name) => {
      expect([name, "accent", ratio(palette.accent, palette.canvas) >= 4.2]).toEqual([
        name,
        "accent",
        true,
      ]);
      expect([name, "solid", ratio("#ffffff", palette["accent-solid"]) >= 4.5]).toEqual([
        name,
        "solid",
        true,
      ]);
      expect([name, "now", ratio("#ffffff", palette.now) >= 3]).toEqual([name, "now", true]);
      expect([name, "line", ratio(palette.now, palette.canvas) >= 2.5]).toEqual([
        name,
        "line",
        true,
      ]);
      // Selected rows keep readable text.
      expect([name, "soft", ratio(palette.ink, palette["accent-soft"]) >= 7]).toEqual([
        name,
        "soft",
        true,
      ]);
      expect([name, "danger", ratio(palette.danger, palette.canvas) >= 4]).toEqual([
        name,
        "danger",
        true,
      ]);
    });
  });

  test("layers stay apart: raised off the canvas in the dark, hairlines visible", () => {
    each((palette, name, mode) => {
      expect([name, palette.hover !== palette.canvas]).toEqual([name, true]);
      expect([name, palette.active !== palette.hover]).toEqual([name, true]);
      expect([name, ratio(palette.grid, palette.canvas) >= 1.12]).toEqual([name, true]);
      if (mode === "dark") expect([name, palette.raised !== palette.canvas]).toEqual([name, true]);
    });
  });

  test("smart-list icons keep 3:1 in every theme", () => {
    each((palette, name) => {
      for (const list of ["inbox", "today", "upcoming", "anytime", "someday", "logbook"] as const)
        for (const surface of ["sidebar", "canvas", "active"] as const)
          expect([
            name,
            list,
            surface,
            ratio(palette[`list-${list}`], palette[surface]) >= 3,
          ]).toEqual([name, list, surface, true]);
    });
  });

  test("only blue leaves now red", () => {
    for (const mode of modes) {
      const theme = themesFor(mode)[0] ?? "daylight";
      const red = toHex(colors.now[mode]);
      for (const accent of accentIds) {
        const palette = paletteOf(theme, accent);
        expect(palette.now === red).toBe(accent === "blue");
        expect(palette.danger).toBe(red);
      }
    }
  });

  test("past chips fade toward the theme's canvas", () => {
    const { canvas } = paletteOf("walnut", "blue");
    const past = chipColors(255, "dark", false, canvas);
    expect(past.pastFill).not.toBe(chipColors(255, "dark").pastFill);
    expect(past.fill).toBe(chipColors(255, "dark").fill);
  });
});
