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

/**
 * Whether a window point is over the to-do pane's visible part. The pane slides closed
 * by width while its content stays mounted at full width (see `Pane` in App.tsx), so
 * the content's rect is clipped to its `[data-pane]` wrapper, and a closed pane is no
 * drop target at all, even mid-slide.
 */
export const overTaskPane = (clientX: number, clientY: number) => {
  const pane = geometry.taskPane;
  if (!pane) return false;
  const wrapper = pane.closest<HTMLElement>("[data-pane]");
  if (wrapper && wrapper.dataset.open === undefined) return false;
  const rect = pane.getBoundingClientRect();
  const clip = wrapper?.getBoundingClientRect() ?? rect;
  const left = Math.max(rect.left, clip.left);
  const right = Math.min(rect.right, clip.right);
  const top = Math.max(rect.top, clip.top);
  const bottom = Math.min(rect.bottom, clip.bottom);
  return (
    left < right &&
    top < bottom &&
    clientX >= left &&
    clientX <= right &&
    clientY >= top &&
    clientY <= bottom
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
