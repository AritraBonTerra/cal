/*
 * Screens captured by `bun run screenshots` for design review rounds. Each scene starts
 * from a fresh fixture launch (seeded data, clock at Wed 2026-10-28 10:40), then plays
 * `keys` with Playwright's key names ("Meta+k", "ArrowRight", "7"), types `text`, and
 * clicks `click` (a CSS selector) before the capture.
 */
export interface Scene {
  name: string;
  width?: number;
  height?: number;
  dark?: boolean;
  keys?: string[];
  text?: string;
  click?: string;
}

export const scenes: Scene[] = [
  { name: "week-light" },
  { name: "week-dark", dark: true },
  { name: "day", keys: ["1"] },
  { name: "three-day", keys: ["3"] },
  { name: "month", keys: ["m"] },
  { name: "palette", keys: ["Meta+k"] },
  { name: "shortcuts", keys: ["?"] },
  {
    name: "quick-entry",
    keys: ["Meta+Shift+n"],
    text: "Call the movers tomorrow 3pm ~30m !fri p2 /launch",
  },
  { name: "today", keys: ["ArrowDown", "ArrowDown"] },
  { name: "when-picker", keys: ["ArrowDown", "Meta+s"] },
  { name: "block-selected", click: "[data-item^='block:'] [data-edge=end] >> xpath=.." },
  {
    name: "sign-in",
    keys: ["Meta+k"],
    text: "sign in",
    click: "[role=option][aria-selected=true]",
  },
  { name: "narrow", width: 860, height: 700 },
];
