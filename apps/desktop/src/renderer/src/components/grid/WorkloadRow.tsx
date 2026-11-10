import type { DayKey } from "@cal/domain";
import {
  overMinutes,
  plannedMinutes,
  type Workload,
  workloadDetail,
  workloadLabel,
} from "./agenda";

// Columns at least this wide put a label beside the bar.
const LABEL_WIDTH = 150;
// Rough width of one caption character, to pick the long or short label.
const CHAR_WIDTH = 6;

/**
 * The workload row under the day headers (PLAN §5.3): per day a 4px bar of meetings
 * (grey) then planned work (accent) over the day's working hours, and a label when the
 * column has room (the short form when the long one wouldn't fit). Over-planned days
 * turn the planned part and the label red. The tooltip always has the full breakdown.
 * Past days (no entry in `loads`) stay empty, and the row isn't drawn at all when no day
 * has anything on it.
 */
export function WorkloadRow({
  days,
  loads,
  columnWidth,
  gutter,
}: {
  days: readonly DayKey[];
  loads: ReadonlyMap<DayKey, Workload>;
  columnWidth: number;
  gutter: number;
}) {
  const busy = [...loads.values()].some((load) => load.meetings + plannedMinutes(load) > 0);
  if (!busy) return null;
  const labelled = columnWidth >= LABEL_WIDTH;
  const narrow = columnWidth < 88;
  // The bar takes a quarter of the column (40–120px) and the label what's left.
  const inner = columnWidth - 16;
  const room = inner - Math.min(120, Math.max(40, inner / 4)) - 6;
  return (
    <div className="-mt-1.5 flex" data-workload>
      <div className="shrink-0" style={{ width: gutter }} />
      {days.map((day) => {
        const load = loads.get(day);
        const planned = load ? plannedMinutes(load) : 0;
        // Days without working hours show a bar only when something is planned on them.
        if (!load || (load.capacity === 0 && load.meetings + planned === 0))
          return <div key={day} className="min-w-0 flex-1" />;
        const over = overMinutes(load) > 0;
        // The bar spans the working hours, or the whole load when that's more.
        const scale = Math.max(load.capacity, load.meetings + planned, 1);
        const long = workloadLabel(load);
        const label = long.length * CHAR_WIDTH <= room ? long : workloadLabel(load, true);
        return (
          <div
            key={day}
            title={workloadDetail(load)}
            data-workload-day={day}
            className={`flex h-3.5 min-w-0 flex-1 items-center gap-1.5 ${narrow ? "px-1" : "px-2"}`}
          >
            <div
              className={`flex h-1 overflow-hidden rounded-full bg-hover ${
                labelled ? "w-1/4 max-w-30 min-w-10 shrink-0" : "w-full"
              }`}
            >
              <div
                className="h-full shrink-0 bg-edge-strong"
                style={{ width: `${(load.meetings / scale) * 100}%` }}
              />
              <div
                className={`h-full shrink-0 ${over ? "bg-now" : "bg-accent"}`}
                style={{ width: `${(planned / scale) * 100}%` }}
              />
            </div>
            {labelled && label && (
              <span
                className={`min-w-0 truncate text-caption tnum ${over ? "text-now" : "text-ink-3"}`}
              >
                {label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
