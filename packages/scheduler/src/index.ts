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

/*
 * What plan() and risks() share: free time (minus the frozen window, busy time, and
 * last run's placements kept in the frozen window), each item's work left after those
 * kept placements, and the window each item may be placed in.
 */
function prepare(input: PlanInput) {
  const step = input.stepMin ?? 15;
  const now = input.now.getTime();
  const frozenUntil = now + (input.frozenMin ?? 90) * MINUTE;
  const retained = (input.previous ?? []).filter(
    (placement) => placement.start < frozenUntil && placement.end > now,
  );
  const free = subtract(freeTime(input, frozenUntil, step), retained);
  const remaining = new Map(input.work.map((item) => [item.id, item.remainingMin]));
  for (const placement of retained) {
    const left = (remaining.get(placement.id) ?? 0) - (placement.end - placement.start) / MINUTE;
    remaining.set(placement.id, Math.max(0, left));
  }
  const horizonEnd = endOfDay(addDays(toDayKey(input.now), input.horizonDays - 1));
  const windowOf = (item: WorkItem) => ({
    from: item.startDay ? Math.max(startOfDay(item.startDay), frozenUntil) : frozenUntil,
    to: item.deadline ? endOfDay(item.deadline) : horizonEnd,
  });
  return { step, frozenUntil, retained, free, remaining, windowOf };
}

/*
 * Whether a piece of `length` minutes is allowed with `left` minutes of work to go: at
 * most maxChunk, at least minChunk (or all that's left), and never leaving a remainder
 * too small to place on its own.
 */
function validPiece(length: number, left: number, minChunk: number, maxChunk: number) {
  const rest = left - length;
  return (
    length > 0 &&
    length <= Math.min(left, maxChunk) &&
    length >= Math.min(left, minChunk) &&
    !(rest > 0 && rest < minChunk)
  );
}

// The longest valid piece that fits in `room` minutes, if any.
function pieceFor(room: number, left: number, minChunk: number, maxChunk: number) {
  let length = Math.min(left, maxChunk, room);
  const rest = left - length;
  if (rest > 0 && rest < minChunk) length = left - minChunk;
  return validPiece(length, left, minChunk, maxChunk) ? length : undefined;
}

/**
 * Plans `work` into free time. Order: least slack first (free time before the deadline
 * minus the work left), then priority, then id. Each piece goes in the cheapest slot,
 * where cost favors keeping last run's placement, finishing before the deadline, and
 * earlier times. Previous placements in the frozen window stay as they are.
 */
export function plan(input: PlanInput): Plan {
  const { step, frozenUntil, retained, remaining, windowOf, ...shared } = prepare(input);
  let free = shared.free;
  const stepMs = step * MINUTE;
  const now = input.now.getTime();
  const placements: Placement[] = [...retained];

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
      let best: { start: number; length: number; cost: number; kept: boolean } | undefined;
      const consider = (start: number, length: number, kept: boolean) => {
        const end = start + length * MINUTE;
        const late = end > to && item.deadline ? (end - to) / MINUTE : 0;
        const cost =
          (kept ? 0 : 50) + late * 1_000 + (start - now) / (60 * MINUTE) + (want - length) * 0.5;
        if (!best || cost < best.cost) best = { start, length, cost, kept };
      };
      for (const slot of free) {
        const start = Math.ceil(Math.max(slot.start, from) / stepMs) * stepMs;
        const length = pieceFor((slot.end - start) / MINUTE, left, minChunk, maxChunk);
        if (length === undefined) continue;
        const end = start + length * MINUTE;
        const kept = previous.some(
          (placement) => placement.start === start && placement.end === end,
        );
        consider(start, length, kept);
      }
      // Also try last run's exact slots, which may sit mid-interval.
      for (const placement of previous) {
        const length = (placement.end - placement.start) / MINUTE;
        const fits = free.some(
          (each) => each.start <= placement.start && each.end >= placement.end,
        );
        if (!fits || placement.start < from || !validPiece(length, left, minChunk, maxChunk))
          continue;
        consider(placement.start, length, true);
      }
      const chosen: { start: number; length: number; kept: boolean } | undefined = best;
      if (!chosen) break;

      const end = chosen.start + chosen.length * MINUTE;
      const parts = [
        chosen.kept ? "Kept from the last plan" : "Earliest free slot",
        item.startDay ? `after ${item.startDay}` : undefined,
        item.deadline ? `due ${item.deadline}` : undefined,
        Number.isFinite(slack) ? `${formatMin(Math.max(0, Math.round(slack)))} slack` : undefined,
      ];
      placements.push({
        id: item.id,
        start: chosen.start,
        end,
        reason: parts.filter(Boolean).join("; "),
      });
      free = subtract(free, [{ start: chosen.start, end }]);
      left -= chosen.length;
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
  return { placements, unplaced, risks: risks(input) };
}

/**
 * Earliest-deadline-first capacity check, with start days: for each deadline, the work
 * that must happen between some start point and that deadline, against the free time
 * between them, e.g. "Thursday: 7h of work, 4h free". Reports the worst gap per deadline.
 */
export function risks(input: PlanInput) {
  const { free, retained, windowOf, ...shared } = prepare(input);
  // Kept work that runs past its own deadline still has to happen before it.
  const remaining = new Map(shared.remaining);
  for (const item of input.work) {
    if (!item.deadline) continue;
    const deadlineEnd = endOfDay(item.deadline);
    const late = retained
      .filter((placement) => placement.id === item.id)
      .reduce(
        (total, placement) =>
          total + Math.max(0, placement.end - Math.max(placement.start, deadlineEnd)) / MINUTE,
        0,
      );
    remaining.set(item.id, (remaining.get(item.id) ?? 0) + late);
  }
  const due = input.work
    .filter((item) => item.deadline && (remaining.get(item.id) ?? 0) > 0)
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? "") || a.id.localeCompare(b.id));
  const releases = [...new Set(due.map((item) => windowOf(item).from))].sort((a, b) => a - b);
  const deadlines = [...new Set(due.map((item) => item.deadline ?? ""))];

  const found: Risk[] = [];
  for (const deadline of deadlines) {
    const to = endOfDay(deadline);
    let worst: Risk | undefined;
    for (const release of releases) {
      const items = due.filter(
        (item) => (item.deadline ?? "") <= deadline && windowOf(item).from >= release,
      );
      if (items.length === 0) continue;
      const workMin = items.reduce((total, item) => total + (remaining.get(item.id) ?? 0), 0);
      const freeMin = minutesIn(free, release, to);
      if (workMin <= freeMin) continue;
      if (!worst || workMin - freeMin > worst.workMin - worst.freeMin) {
        worst = { deadline, workMin, freeMin, ids: items.map((item) => item.id) };
      }
    }
    if (worst) found.push(worst);
  }
  return found;
}
