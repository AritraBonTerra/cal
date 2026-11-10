import { type DeviceSettings, deviceDefaults } from "@cal/app-core";

/*
 * Side pane widths. Dragging a pane's right edge resizes it within its limits, and the
 * width is saved per device under `setting`. Dragging the edge more than `CLOSE_PAST`
 * px under the minimum closes the pane on release, as in Things.
 */

export type PaneName = "sidebar" | "tasks";

interface PaneLimits {
  min: number;
  max: number;
  initial: number;
  setting: keyof DeviceSettings;
}

export const PANES = {
  sidebar: { min: 180, max: 320, initial: deviceDefaults.sidebarWidth, setting: "sidebarWidth" },
  tasks: { min: 260, max: 480, initial: deviceDefaults.tasksWidth, setting: "tasksWidth" },
} as const satisfies Record<PaneName, PaneLimits>;

export const CLOSE_PAST = 60;

// A width inside the pane's limits, in whole pixels (a saved width may come from anywhere).
export const clampWidth = (pane: PaneName, width: number) =>
  Math.round(Math.min(PANES[pane].max, Math.max(PANES[pane].min, width)));

// The width a drag to `width` gives the pane, or null when it's far enough under the
// minimum that letting go closes the pane.
export const dragWidth = (pane: PaneName, width: number) =>
  width < PANES[pane].min - CLOSE_PAST ? null : clampWidth(pane, width);
