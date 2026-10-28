import { toDayKey } from "@cal/domain";
import { useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import { AllDayRow } from "./AllDayRow";
import { DayHeaders } from "./DayHeaders";
import { HabitStrip } from "./HabitStrip";
import { GUTTER, type Item } from "./model";
import { TimeGrid } from "./TimeGrid";

/*
 * N-day view: day headers, the habit strip, the all-day row, then the scrolling hour
 * grid. The header rows pad for the body's scrollbar so columns line up.
 */
export function DaysView() {
  const { days, events, data } = useApp();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollbar, setScrollbar] = useState(0);
  const [columnWidth, setColumnWidth] = useState(160);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(() => {
      setScrollbar(body.offsetWidth - body.clientWidth);
      setColumnWidth((body.clientWidth - GUTTER) / days.length);
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [days.length]);

  const first = days[0] ?? "";
  const last = days[days.length - 1] ?? "";
  const items: Item[] = [
    ...events
      .filter((event) => !event.allDay)
      .map(
        (event): Item => ({
          kind: "event",
          id: `event:${event.id}`,
          event,
          start: new Date(event.start),
          end: new Date(event.end),
        }),
      ),
    ...data.blocks
      .filter((block) => {
        const day = toDayKey(new Date(block.start_at));
        return day >= first && day <= last;
      })
      .map((block): Item => {
        const task = data.tasks.find((each) => each.uuid === block.task_uuid);
        const project = data.projects.find((each) => each.uuid === task?.project_uuid);
        return {
          kind: "block",
          id: `block:${block.uuid}`,
          block,
          task,
          project,
          start: new Date(block.start_at),
          end: new Date(block.end_at),
        };
      }),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-grid" style={{ paddingRight: scrollbar }}>
        <div className="flex">
          <div className="shrink-0" style={{ width: GUTTER }} />
          <DayHeaders days={days} columnWidth={columnWidth} />
        </div>
        <div className="flex">
          <div className="shrink-0" style={{ width: GUTTER }} />
          <HabitStrip days={days} columnWidth={columnWidth} />
        </div>
        <div className="flex border-t border-grid">
          <div
            className="shrink-0 pt-1 pr-2 text-right text-caption text-ink-3"
            style={{ width: GUTTER }}
          >
            all-day
          </div>
          <AllDayRow days={days} />
        </div>
      </div>
      <TimeGrid days={days} items={items} bodyRef={bodyRef} />
    </div>
  );
}
