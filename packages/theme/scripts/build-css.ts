/*
 * Writes `theme.css` (Mac, Tailwind) and `theme.native.css` (Expo, Uniwind) from
 * tokens.ts: `@theme` values plus light and dark palettes as CSS variables. Run `bun run build:css` after editing tokens; the test
 * suite fails if the file is stale.
 */
import { renderCss, renderNativeCss } from "../src/css";

for (const [name, render] of [
  ["theme.css", renderCss],
  ["theme.native.css", renderNativeCss],
] as const) {
  const file = new URL(`../${name}`, import.meta.url);
  await Bun.write(file, render());
  console.log(`wrote ${file.pathname}`);
}
