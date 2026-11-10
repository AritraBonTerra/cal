import type { DayStatus } from "@cal/domain";
import { Check } from "lucide-react";

/*
 * The 12px habit ring the day strip's chips and the sidebar's habit rows draw, so the
 * two always agree. `color` is the habit's ring colour (`habitColors(hueFor(habit),
 * mode).ring`); `status` is the day's DayStatus, or "future" for days not yet reached.
 */

// A 12px progress ring; done shows a check, covered days a dashed ring, future days a faint one.
export function HabitRing({
  fraction,
  status,
  color,
}: {
  fraction: number;
  status: DayStatus | "future";
  color: string;
}) {
  const r = 4.75;
  const c = 2 * Math.PI * r;
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
      <circle
        cx="6"
        cy="6"
        r={r}
        fill="none"
        stroke={quiet ? "var(--cal-edge-strong)" : color}
        strokeWidth="1.5"
        strokeDasharray={status === "covered" ? "2 2" : undefined}
      />
      {fraction > 0 && (
        <circle
          cx="6"
          cy="6"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray={`${c * fraction} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 6 6)"
        />
      )}
    </svg>
  );
}
