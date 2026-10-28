import { addDays, atMinute, type DayKey, toDayKey } from "@cal/domain";

/*
 * The deterministic auto-scheduler (PLAN §5.5): greedy placement in slack order with
 * scored slots, a frozen near-term window, stickiness to the previous plan, reasons
 * for every placement, and earliest-deadline-first "at risk" checks. Pure: the same
 * inputs always give the same plan. Times are epoch milliseconds unless named *Min.
 */

export interface Interval {
  start: number;
  end: number;
}

export interface WorkItem {
  id: string;
  title: string;
  remainingMin: number;
  // Nothing is placed before this day.
  startDay?: DayKey;
  // Work should finish by the end of this day.
  deadline?: DayKey;
  // 1 (highest) to 4; undefined sorts last.
  priority?: number;
  // Smallest and largest block to place; a task's last piece may be smaller than min.
  minChunkMin?: number;
  maxChunkMin?: number;
}

export interface PlanInput {
  now: Date;
  // Days to plan, from today.
  horizonDays: number;
  // Working windows per weekday (0 = Sunday), as minutes after midnight.
  workingHours: Record<number, readonly { startMin: number; endMin: number }[]>;
  // Time already taken: busy events and blocks the scheduler must not touch.
  busy: readonly Interval[];
  work: readonly WorkItem[];
  // The scheduler's own blocks from the last run, which it prefers to keep.
  previous?: readonly Placement[];
  // Nothing starting sooner than this moves (default 90).
  frozenMin?: number;
  // Placement granularity (default 15).
  stepMin?: number;
}

export interface Placement extends Interval {
  id: string;
  reason: string;
}

export interface Unplaced {
  id: string;
  remainingMin: number;
  reason: string;
}

export interface Risk {
  deadline: DayKey;
  workMin: number;
  freeMin: number;
  ids: string[];
}

export interface Plan {
  placements: Placement[];
  unplaced: Unplaced[];
  risks: Risk[];
}

const MINUTE = 60_000;

const endOfDay = (day: DayKey) => atMinute(addDays(day, 1), 0).getTime();
const startOfDay = (day: DayKey) => atMinute(day, 0).getTime();
const formatMin = (minutes: number) =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? String(minutes % 60).padStart(2, "0") : ""}`
    : `${minutes}m`;

// `free` minus `taken`, keeping order; both sorted and non-overlapping within themselves.
export function subtract(free: readonly Interval[], taken: readonly Interval[]) {
  let result = [...free];
  for (const cut of taken) {
    result = result.flatMap((slot) => {
      if (cut.end <= slot.start || cut.start >= slot.end) return [slot];
      const pieces: Interval[] = [];
      if (cut.start > slot.start) pieces.push({ start: slot.start, end: cut.start });
      if (cut.end < slot.end) pieces.push({ start: cut.end, end: slot.end });
      return pieces;
    });
  }
  return result;
}

const minutesIn = (slots: readonly Interval[], from: number, to: number) =>
  slots.reduce(
    (total, slot) =>
      total + Math.max(0, Math.min(slot.end, to) - Math.max(slot.start, from)) / MINUTE,
    0,
  );

// Working time from `frozenUntil` to the end of the horizon, minus busy time, on the step grid.
function freeTime(input: PlanInput, frozenUntil: number, step: number) {
  const today = toDayKey(input.now);
  const windows: Interval[] = [];
  for (let offset = 0; offset < input.horizonDays; offset++) {
    const day = addDays(today, offset);
    const weekday = atMinute(day, 0).getDay();
    for (const { startMin, endMin } of input.workingHours[weekday] ?? []) {
      windows.push({
        start: atMinute(day, startMin).getTime(),
        end: atMinute(day, endMin).getTime(),
      });
    }
  }
  const stepMs = step * MINUTE;
  const open = subtract(windows, [{ start: 0, end: frozenUntil }, ...input.busy]);
  return open
    .map((slot) => ({
      start: Math.ceil(slot.start / stepMs) * stepMs,
      end: Math.floor(slot.end / stepMs) * stepMs,
    }))
    .filter((slot) => slot.end > slot.start);
}

/**
 * Plans `work` into free time. Order: least slack first (free time before the deadline
 * minus the work left), then priority, then id. Each piece goes in the cheapest slot,
 * where cost favors keeping last run's placement, finishing before the deadline, and
 * earlier times. Previous placements in the frozen window stay as they are.
 */
export function plan(input: PlanInput): Plan {
  const step = input.stepMin ?? 15;
  const frozenUntil = input.now.getTime() + (input.frozenMin ?? 90) * MINUTE;
  const frozen = (input.previous ?? []).filter((placement) => placement.start < frozenUntil);
  const placements: Placement[] = frozen.filter((placement) => placement.end > input.now.getTime());
  let free = freeTime(input, frozenUntil, step);
  const horizonEnd = endOfDay(addDays(toDayKey(input.now), input.horizonDays - 1));

  const remaining = new Map(input.work.map((item) => [item.id, item.remainingMin]));
  for (const placement of frozen) {
    if (placement.end <= input.now.getTime()) continue;
    const left = (remaining.get(placement.id) ?? 0) - (placement.end - placement.start) / MINUTE;
    remaining.set(placement.id, Math.max(0, left));
  }

  const windowOf = (item: WorkItem) => ({
    from: item.startDay ? Math.max(startOfDay(item.startDay), frozenUntil) : frozenUntil,
    to: item.deadline ? endOfDay(item.deadline) : horizonEnd,
  });
  const slackOf = (item: WorkItem) => {
    if (!item.deadline) return Number.POSITIVE_INFINITY;
    const { from, to } = windowOf(item);
    return minutesIn(free, from, to) - (remaining.get(item.id) ?? 0);
  };
  const ordered = [...input.work].sort(
    (a, b) =>
      slackOf(a) - slackOf(b) || (a.priority ?? 5) - (b.priority ?? 5) || a.id.localeCompare(b.id),
  );

  const unplaced: Unplaced[] = [];
  for (const item of ordered) {
    const slack = slackOf(item);
    const { from, to } = windowOf(item);
    const minChunk = item.minChunkMin ?? 30;
    const maxChunk = item.maxChunkMin ?? 120;
    const previous = (input.previous ?? []).filter(
      (placement) => placement.id === item.id && placement.start >= frozenUntil,
    );
    let left = remaining.get(item.id) ?? 0;

    while (left > 0) {
      const want = Math.min(left, maxChunk);
      const need = Math.min(left, minChunk);
      let best:
        | { slot: Interval; start: number; length: number; cost: number; kept: boolean }
        | undefined;
      for (const slot of free) {
        const start = Math.max(slot.start, from);
        const room = (slot.end - start) / MINUTE;
        if (room < need) continue;
        const length = Math.min(want, room);
        const end = start + length * MINUTE;
        const kept = previous.some(
          (placement) => placement.start === start && placement.end === end,
        );
        const late = end > to && item.deadline ? (end - to) / MINUTE : 0;
        const cost =
          (kept ? 0 : 50) +
          late * 1_000 +
          (start - input.now.getTime()) / (60 * MINUTE) +
          (want - length) * 0.5;
        if (!best || cost < best.cost) best = { slot, start, length, cost, kept };
      }
      // Also try last run's exact slots, which may sit mid-interval.
      for (const placement of previous) {
        const slot = free.find(
          (each) => each.start <= placement.start && each.end >= placement.end,
        );
        const length = (placement.end - placement.start) / MINUTE;
        if (!slot || placement.start < from || length > want || length < need) continue;
        const late = placement.end > to && item.deadline ? (placement.end - to) / MINUTE : 0;
        const cost =
          late * 1_000 +
          (placement.start - input.now.getTime()) / (60 * MINUTE) +
          (want - length) * 0.5;
        if (!best || cost < best.cost) {
          best = { slot, start: placement.start, length, cost, kept: true };
        }
      }
      if (!best) break;

      const end = best.start + best.length * MINUTE;
      const parts = [
        best.kept ? "Kept from the last plan" : "Earliest free slot",
        item.startDay ? `after ${item.startDay}` : undefined,
        item.deadline ? `due ${item.deadline}` : undefined,
        Number.isFinite(slack) ? `${formatMin(Math.max(0, Math.round(slack)))} slack` : undefined,
      ];
      placements.push({
        id: item.id,
        start: best.start,
        end,
        reason: parts.filter(Boolean).join("; "),
      });
      free = subtract(free, [{ start: best.start, end }]);
      left -= best.length;
    }

    if (left > 0) {
      unplaced.push({
        id: item.id,
        remainingMin: left,
        reason: item.deadline
          ? `Not enough free time before ${item.deadline}`
          : `No free time in the next ${input.horizonDays} days`,
      });
    }
  }

  placements.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return { placements, unplaced, risks: risks(input, frozenUntil, step) };
}

/**
 * Earliest-deadline-first capacity check: for each deadline, all work due by then
 * against the free time before it, e.g. "Thursday: 7h of work, 4h free".
 */
export function risks(
  input: PlanInput,
  frozenUntil = input.now.getTime(),
  step = input.stepMin ?? 15,
) {
  const free = freeTime(input, frozenUntil, step);
  const due = input.work
    .filter((item) => item.deadline)
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
  const found: Risk[] = [];
  let workMin = 0;
  const ids: string[] = [];
  for (let index = 0; index < due.length; index++) {
    const item = due[index];
    if (!item?.deadline) continue;
    workMin += item.remainingMin;
    ids.push(item.id);
    if (due[index + 1]?.deadline === item.deadline) continue;
    const freeMin = minutesIn(free, frozenUntil, endOfDay(item.deadline));
    if (workMin > freeMin) found.push({ deadline: item.deadline, workMin, freeMin, ids: [...ids] });
  }
  return found;
}
