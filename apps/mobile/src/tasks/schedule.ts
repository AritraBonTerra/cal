import type { Actions } from "@cal/app-core";
import { addDays, fromDayKey, type Task, toDayKey, toOffsetIso } from "@cal/domain";
import { calendar } from "../data/cal";

/*
 * "Schedule": the touch stand-in for dragging a task onto the grid. Places a block in
 * the next free slot today, around device events and every block (see the
 * `scheduleNext` action). False when the working day is full, so the caller can say so.
 */
export async function scheduleNext(actions: Actions, task: Task, at: Date) {
  const day = toDayKey(at);
  const events = await calendar
    .events(toOffsetIso(fromDayKey(day)), toOffsetIso(fromDayKey(addDays(day, 1))))
    .catch(() => []);
  return actions.scheduleNext(
    task.uuid,
    events
      .filter((event) => !event.allDay && event.busy)
      .map((event) => ({ start: new Date(event.start), end: new Date(event.end) })),
  );
}
