import type { Actions } from "@cal/app-core";
import {
  addDays,
  dropLengthMinutes,
  fromDayKey,
  type Interval,
  nextFreeSlot,
  type Task,
  type TimeBlock,
  toDayKey,
  toOffsetIso,
} from "@cal/domain";
import { calendar } from "../data/cal";

/*
 * "Schedule": the touch stand-in for dragging a task onto the grid. Places a block in
 * the next free slot today, around device events and existing blocks. False when the
 * working day is full, so the caller can say so.
 */
export async function scheduleNext(
  actions: Actions,
  task: Task,
  blocks: readonly TimeBlock[],
  at: Date,
) {
  const day = toDayKey(at);
  const events = await calendar
    .events(toOffsetIso(fromDayKey(day)), toOffsetIso(fromDayKey(addDays(day, 1))))
    .catch(() => []);
  const busy: Interval[] = [
    ...events
      .filter((event) => !event.allDay && event.busy)
      .map((event) => ({ start: new Date(event.start), end: new Date(event.end) })),
    ...blocks
      .filter((block) => toDayKey(new Date(block.start_at)) === day)
      .map((block) => ({ start: new Date(block.start_at), end: new Date(block.end_at) })),
  ];
  const slot = nextFreeSlot(busy, at, dropLengthMinutes(task, blocks, at));
  if (!slot) return false;
  await actions.scheduleTask(task.uuid, slot.start, slot.end);
  return true;
}
