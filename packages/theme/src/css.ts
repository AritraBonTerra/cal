import { toHex } from "./color";
import { colors, grid, type Mode, motion, radius, type } from "./tokens";

/*
 * Renders tokens.ts as CSS for the Mac app: every color as a `--cal-*` variable with
 * light and dark values, and a Tailwind v4 `@theme` that exposes only Cal's scale, so a
 * made-up size, radius or color has no utility and fails to build.
 */

// Floating layers: a half-pixel ring plus two soft shadow layers (stronger in the dark).
const shadows: Record<Mode, { float: string; drag: string }> = {
  light: {
    float:
      "0 0 0 0.5px oklch(0 0 0 / 0.08), 0 4px 12px -2px oklch(0 0 0 / 0.08), 0 16px 32px -8px oklch(0 0 0 / 0.12)",
    drag: "0 2px 4px oklch(0 0 0 / 0.1), 0 8px 20px -4px oklch(0 0 0 / 0.18)",
  },
  dark: {
    float:
      "0 0 0 0.5px oklch(1 0 0 / 0.08), 0 4px 12px -2px oklch(0 0 0 / 0.4), 0 16px 32px -8px oklch(0 0 0 / 0.5)",
    drag: "0 2px 4px oklch(0 0 0 / 0.3), 0 8px 20px -4px oklch(0 0 0 / 0.5)",
  },
};

function palette(mode: Mode) {
  const lines = Object.entries(colors).map(
    ([name, value]) => `  --cal-${name}: ${toHex(value[mode])};`,
  );
  lines.push(`  --cal-shadow-float: ${shadows[mode].float};`);
  lines.push(`  --cal-shadow-drag: ${shadows[mode].drag};`);
  return lines.join("\n");
}

export function renderCss() {
  const colorTheme = Object.keys(colors)
    .map((name) => `  --color-${name}: var(--cal-${name});`)
    .join("\n");
  const textTheme = Object.entries(type)
    .map(
      ([name, { size, line }]) =>
        `  --text-${name}: ${size}px;\n  --text-${name}--line-height: ${line}px;`,
    )
    .join("\n");
  const radiusTheme = Object.entries(radius)
    .map(([name, value]) => `  --radius-${name}: ${value}px;`)
    .join("\n");

  return `/* Generated from packages/theme/src/tokens.ts by \`bun run build:css\`. Do not edit. */

:root {
  color-scheme: light dark;
${palette("light")}
}

@media (prefers-color-scheme: dark) {
  :root {
${palette("dark")}
  }
}

@theme {
  --color-*: initial;
  --font-*: initial;
  --text-*: initial;
  --radius-*: initial;
  --shadow-*: initial;
  --ease-*: initial;

  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Inter Variable", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;

${textTheme}

${radiusTheme}
  --radius-full: 9999px;

  --spacing-hour: ${grid.hourHeight}px;
  --spacing-gutter: ${grid.gutterWidth}px;
  --spacing-day-header: ${grid.dayHeaderHeight}px;

  --ease-out: ${motion.easeOut};
  --ease-in-out: ${motion.easeInOut};
  --default-transition-duration: ${motion.base}ms;
  --default-transition-timing-function: ${motion.easeOut};
}

@theme inline {
${colorTheme}
  --shadow-float: var(--cal-shadow-float);
  --shadow-drag: var(--cal-shadow-drag);
}
`;
}
