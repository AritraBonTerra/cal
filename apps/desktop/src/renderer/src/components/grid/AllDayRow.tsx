import { type DayKey, toDayKey } from "@cal/domain";
import { useApp } from "../../lib/app";
import { graphite } from "../../lib/calendars";
import { openEdit } from "../../lib/events";
import { assignLanes } from "../../lib/layout";
import { select, useUi } from "../../lib/ui";
import { barColumns } from "./model";

const LANE = 21;

// All-day events as bars spanning their days, stacked in lanes (20px chips, 1px gaps).
export function AllDayRow({ days }: { days: readonly DayKey[] }) {
  const { events, palette, mode, zone } = useApp();
  const selected = useUi((state) =>
    state.selection?.kind === "event" ? state.selection.id : null,
  );
  const first = days[0] ?? "";
  const last = days[days.length - 1] ?? "";
  const bars = events
    .filter((event) => event.allDay)
    .flatMap((event) => {
      const startDay = toDayKey(new Date(event.start));
      const endDay = toDayKey(new Date(Date.parse(event.end) - 1));
      // Hidden weekends leave gaps: the bar runs over the visible days it touches.
      const columns = barColumns(days, startDay, endDay);
      if (!columns) return [];
      return [{ event, ...columns, clippedStart: startDay < first, clippedEnd: endDay > last }];
    });
  const placed = assignLanes(bars);
  const lanes = placed.reduce((max, { lane }) => Math.max(max, lane + 1), 0);

  return (
    <div className="relative min-w-0 flex-1" style={{ height: Math.max(1, lanes) * LANE + 3 }}>
      {placed.map(({ item, lane }) => {
        const colors = palette.get(item.event.calendarId) ?? graphite(mode);
        const isSelected = selected === item.event.id;
        return (
          <button
            type="button"
            key={item.event.id}
            data-item={`event:${item.event.id}`}
            onClick={() => {
              select({ kind: "event", id: item.event.id });
              openEdit(item.event, zone);
            }}
            className={`absolute flex h-5 items-center truncate border-l-[3px] px-1.5 text-small font-medium ${
              item.clippedStart ? "" : "rounded-l-sm"
            } ${item.clippedEnd ? "" : "rounded-r-sm"}`}
            style={{
              top: lane * LANE + 2,
              left: `calc(${(item.from / days.length) * 100}% + 2px)`,
              width: `calc(${((item.to - item.from + 1) / days.length) * 100}% - 4px)`,
              background: isSelected ? colors.solid : colors.fill,
              borderColor: isSelected ? colors.solid : colors.bar,
              color: isSelected ? "#ffffff" : colors.title,
            }}
          >
            <span className="truncate">{item.event.title}</span>
          </button>
        );
      })}
    </div>
  );
}
