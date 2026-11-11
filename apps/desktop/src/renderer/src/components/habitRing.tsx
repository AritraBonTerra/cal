import type { DayStatus } from "@cal/domain";
import { Check } from "lucide-react";

/*
 * The habit rings the day strip's chips and the sidebar's habit rows draw, so the two
 * always agree. `color` is the habit's ring colour (`habitColors(hueFor(habit),
 * mode).ring`); `status` is the day's DayStatus, or "future" for days not yet reached;
 * `segments` splits the ring into one arc per time for a times-a-day habit (see
 * habitDay in @cal/domain).
 */

const STROKE = 1.5;
// The space between two arcs of a split ring, in px along the ring.
const GAP = 2;

/**
 * The stroke of a habit ring inside an svg `size` wide: with `segments` > 1, that many
 * arcs starting at 12 o'clock, the first `fraction` of them in `lit`; otherwise one
 * ring in `unlit` with the progress arc over it. `dashed` marks a day a quota covers.
 */
export function RingStroke({
  size,
  r,
  fraction,
  segments,
  lit,
  unlit,
  dashed,
}: {
  size: number;
  r: number;
  fraction: number;
  segments: number;
  lit: string;
  unlit: string;
  dashed?: boolean;
}) {
  const c = 2 * Math.PI * r;
  const circle = {
    cx: size / 2,
    cy: size / 2,
    r,
    fill: "none",
    strokeWidth: STROKE,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
  };
  if (segments > 1) {
    const arc = c / segments - GAP;
    const done = Math.round(fraction * segments);
    return Array.from({ length: segments }, (_, index) => (
      <circle
        // biome-ignore lint/suspicious/noArrayIndexKey: the arcs are their positions.
        key={index}
        {...circle}
        stroke={index < done ? lit : unlit}
        strokeDasharray={`${arc} ${c - arc}`}
        strokeDashoffset={-(index * (c / segments) + GAP / 2)}
      />
    ));
  }
  return (
    <>
      <circle {...circle} stroke={unlit} strokeDasharray={dashed ? "2 2" : undefined} />
      {fraction > 0 && (
        <circle
          {...circle}
          stroke={lit}
          strokeDasharray={`${c * fraction} ${c}`}
          strokeLinecap="round"
        />
      )}
    </>
  );
}

// A 12px progress ring; done shows a check, covered days a dashed ring, future days a faint one.
export function HabitRing({
  fraction,
  status,
  color,
  segments = 1,
}: {
  fraction: number;
  status: DayStatus | "future";
  color: string;
  segments?: number;
}) {
  if (fraction >= 1) {
    return (
      <span
        className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: color }}
      >
        <Check size={8} strokeWidth={2.5} absoluteStrokeWidth />
      </span>
    );
  }
  const quiet = status === "covered" || status === "future" || status === "missed";
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      <RingStroke
        size={12}
        r={4.75}
        fraction={fraction}
        segments={segments}
        lit={color}
        // Part-way, the rest of the ring steps back so the progress reads.
        unlit={quiet || fraction > 0 ? "var(--cal-edge-strong)" : color}
        dashed={status === "covered"}
      />
    </svg>
  );
}

// A weekly quota's progress as dots, one per time owed, the first `count` in `color`.
export function QuotaPips({
  count,
  total,
  color,
}: {
  count: number;
  total: number;
  color: string;
}) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: total }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the dots are their positions.
          key={index}
          className="h-1 w-1 rounded-full"
          style={{ background: index < count ? color : "var(--cal-edge-strong)" }}
        />
      ))}
    </span>
  );
}
