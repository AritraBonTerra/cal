import { useActions } from "@cal/app-core";
import { dropLengthMinutes, snapMinutes, startDay, type Task } from "@cal/domain";
import { useEffect, useRef } from "react";
import { useApp } from "./app";
import { now } from "./clock";
import { DRAG_THRESHOLD, type DragState, drag, geometry, useDrag } from "./drag";
import { zonedInstant } from "./zones";

/*
 * Dragging a to-do, from a list row or from its chip in the all-day lane. A press runs
 * `onPress` (selecting it); past the drag threshold the to-do follows the pointer. Over
 * the hour grid it shows a ghost block and dropping there schedules it; over a day's
 * header (today or later in the grid's zone) dropping moves its When date to that day.
 * Escape or a cancelled pointer drops the drag without writing anything.
 */

const DAY_MINUTES = 24 * 60;

export const clearDrag = () => drag.set({ task: null, ghost: null, pointer: null, dropDay: null });

// Spread the returned handlers on the element the to-do is pressed on.
export function useTaskDrag(task: Task, onPress: () => void, disabled = false) {
  const { data, zone, gridToday } = useApp();
  const actions = useActions();
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const dragging = useDrag((state) => state.task?.uuid === task.uuid);

  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      press.current = null;
      clearDrag();
    };
    // Capture phase, so the key never reaches the command registry (Deselect).
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dragging]);

  // An element that unmounts mid-drag (the calendar moved to another week) never sees
  // the release, so it drops its drag on the way out.
  useEffect(
    () => () => {
      if (!press.current?.dragging) return;
      press.current = null;
      clearDrag();
    },
    [],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || disabled) return;
    onPress();
    press.current = { x: event.clientX, y: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const state = press.current;
    if (!state) return;
    if (!state.dragging) {
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < DRAG_THRESHOLD) return;
      state.dragging = true;
      drag.set({
        task: {
          uuid: task.uuid,
          title: task.title,
          lengthMin: dropLengthMinutes(task, data.blocks, now()),
        },
      });
    }
    const point = geometry.grid?.locate(event.clientX, event.clientY) ?? null;
    const header = point ? null : (geometry.header?.dayAt(event.clientX, event.clientY) ?? null);
    let ghost: DragState["ghost"] = null;
    if (point) {
      const length = drag.get().task?.lengthMin ?? 30;
      const start = snapMinutes(point.minute, event.shiftKey ? 1 : 15);
      ghost = {
        day: point.day,
        start: Math.min(DAY_MINUTES - length, start),
        end: Math.min(DAY_MINUTES, start + length),
      };
    }
    drag.set({
      pointer: { x: event.clientX, y: event.clientY },
      ghost,
      // Days already past roll into Today, so they take no dates.
      dropDay: header !== null && header >= gridToday ? header : null,
    });
  };

  const onPointerUp = () => {
    const state = press.current;
    press.current = null;
    if (!state?.dragging) return;
    const { ghost, dropDay } = drag.get();
    clearDrag();
    // The ghost's day and minutes are wall-clock values in the grid's zone.
    if (ghost) {
      void actions.scheduleTask(
        task.uuid,
        zonedInstant(ghost.day, ghost.start, zone),
        zonedInstant(ghost.day, ghost.end, zone),
      );
    } else if (dropDay && dropDay !== startDay(task)) {
      void actions.setWhen(task.uuid, task.when === "evening" ? "evening" : "date", dropDay);
    }
  };

  const onPointerCancel = () => {
    press.current = null;
    clearDrag();
  };

  return { dragging, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
