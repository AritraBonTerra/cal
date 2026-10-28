import type { DayKey } from "@cal/domain";
import { createStore, useStore } from "./store";

/*
 * Cross-pane drags. A task row dragged onto the grid and a block dragged back onto the
 * to-do pane both need the other pane's geometry, so the grid publishes a `locate`
 * function and the to-do pane its element, and a small store carries the live state.
 */

export interface GridPoint {
  day: DayKey;
  // Minutes after midnight, unsnapped.
  minute: number;
}

export interface GridGeometry {
  // The grid cell under a window point, or null when the point is outside the grid.
  locate(clientX: number, clientY: number): GridPoint | null;
}

export const geometry: { grid: GridGeometry | null; taskPane: HTMLElement | null } = {
  grid: null,
  taskPane: null,
};

export const overTaskPane = (clientX: number, clientY: number) => {
  const rect = geometry.taskPane?.getBoundingClientRect();
  return (
    rect !== undefined &&
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
};

export interface DragState {
  // A task being dragged from the list; the grid draws the ghost where it would land.
  task: { uuid: string; title: string; lengthMin: number } | null;
  ghost: { day: DayKey; start: number; end: number } | null;
  // Where the pointer is while a task is dragged, for the floating label.
  pointer: { x: number; y: number } | null;
  // A block being dragged over the to-do pane, which then offers to remove it.
  removing: boolean;
}

export const drag = createStore<DragState>({
  task: null,
  ghost: null,
  pointer: null,
  removing: false,
});

export const useDrag = <R>(select: (state: DragState) => R) => useStore(drag, select);

// How far a pointer moves before a press becomes a drag.
export const DRAG_THRESHOLD = 3;
