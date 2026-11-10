import { describe, expect, test } from "bun:test";
import { CLOSE_PAST, clampWidth, dragWidth, PANES } from "../src/renderer/src/lib/panes";

// Pane widths: drags clamp to each pane's limits, and far enough under the minimum close it.
describe("clampWidth", () => {
  test("keeps each pane inside its limits, in whole pixels", () => {
    expect(clampWidth("sidebar", 100)).toBe(180);
    expect(clampWidth("sidebar", 900)).toBe(320);
    expect(clampWidth("sidebar", 250.6)).toBe(251);
    expect(clampWidth("tasks", 0)).toBe(260);
    expect(clampWidth("tasks", 481)).toBe(480);
    expect(clampWidth("tasks", 320)).toBe(320);
  });

  test("the defaults are inside the limits", () => {
    for (const pane of ["sidebar", "tasks"] as const) {
      expect(clampWidth(pane, PANES[pane].initial)).toBe(PANES[pane].initial);
    }
    expect(PANES.sidebar.initial).toBe(224);
    expect(PANES.tasks.initial).toBe(320);
  });
});

describe("dragWidth", () => {
  test("clamps a drag that stays near the pane", () => {
    expect(dragWidth("sidebar", 260)).toBe(260);
    expect(dragWidth("sidebar", 400)).toBe(320);
    expect(dragWidth("sidebar", 150)).toBe(180);
    expect(dragWidth("tasks", 210)).toBe(260);
  });

  test("closes once the pointer is more than 60px under the minimum", () => {
    expect(CLOSE_PAST).toBe(60);
    expect(dragWidth("sidebar", 120)).toBe(180);
    expect(dragWidth("sidebar", 119.5)).toBeNull();
    expect(dragWidth("tasks", 200)).toBe(260);
    expect(dragWidth("tasks", 199)).toBeNull();
    expect(dragWidth("tasks", -50)).toBeNull();
  });
});
