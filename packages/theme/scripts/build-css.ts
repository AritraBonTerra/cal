/*
 * Writes `theme.css` from tokens.ts: Tailwind v4 `@theme` values plus light and dark
 * palettes as CSS variables. Run `bun run build:css` after editing tokens; the test
 * suite fails if the file is stale.
 */
import { renderCss } from "../src/css";

const file = new URL("../theme.css", import.meta.url);
await Bun.write(file, renderCss());
console.log(`wrote ${file.pathname}`);
