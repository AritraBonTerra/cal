/*
 * Screens captured by `bun run screenshots` for design review rounds. Each scene starts
 * from a fresh fixture launch (seeded data, clock at Wed 2026-10-28 10:40), then plays
 * `keys` with Playwright's key names ("Meta+k", "ArrowRight", "7").
 */
export interface Scene {
  name: string;
  width?: number;
  height?: number;
  dark?: boolean;
  keys?: string[];
}

export const scenes: Scene[] = [
  { name: "week-light" },
  { name: "week-dark", dark: true },
  { name: "day", keys: ["1"] },
  { name: "three-day", keys: ["3"] },
  { name: "month", keys: ["m"] },
  { name: "palette", keys: ["Meta+k"] },
  { name: "narrow", width: 860, height: 700 },
];
