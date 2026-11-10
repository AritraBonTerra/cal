import { describe, expect, test } from "bun:test";
import { colors, contrast, fromHex, habitColors } from "@cal/theme";
import { ringLabels } from "../src/renderer/src/components/grid/habitLabels";
import { HUES } from "../src/renderer/src/lib/data";

// Compact habit rings: the letter each ring shows, and that it reads on every hue.

describe("ringLabels", () => {
  test("distinct initials stay one letter", () => {
    expect(ringLabels(["Gym", "Read", "Meditate"])).toEqual(["G", "R", "M"]);
  });

  test("a shared initial grows to the two-letter prefix", () => {
    expect(ringLabels(["Read", "Run", "Gym"])).toEqual(["Re", "Ru", "G"]);
  });

  test("never more than two characters, even when two still clash", () => {
    expect(ringLabels(["Reading", "Read aloud"])).toEqual(["Re", "Re"]);
  });

  test("ignores case and spaces, and keeps emoji whole", () => {
    expect(ringLabels(["morning run", "Meditate"])).toEqual(["Mo", "Me"]);
    expect(ringLabels(["🏋️ Gym", "Read"])).toEqual(["🏋️", "R"]);
  });
});

describe("compact ring colors", () => {
  const white = fromHex("#ffffff");
  for (const mode of ["light", "dark"] as const) {
    test(`letters reach 4.5:1 on every habit hue in ${mode} mode`, () => {
      for (const hue of HUES) {
        const ring = habitColors(hue, mode);
        // Done: white on the filled ring. Otherwise the hue's letter on the canvas.
        expect(contrast(white, fromHex(ring.badge))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(fromHex(ring.label), colors.canvas[mode])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(fromHex(ring.initial), colors.canvas[mode])).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
