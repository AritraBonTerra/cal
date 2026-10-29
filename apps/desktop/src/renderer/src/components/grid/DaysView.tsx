import { useCommands } from "@cal/app-core";
import { useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import { AllDayRow } from "./AllDayRow";
import { DayHeaders } from "./DayHeaders";
import { HabitStrip } from "./HabitStrip";
import { GUTTER, type Item, withinDays, ZONE_COLUMN } from "./model";
import { TimeGrid } from "./TimeGrid";
import { useHourHeight } from "./useHourHeight";
import { ZoneHeaders } from "./ZoneHeaders";

/*
 * N-day view: day headers, the habit strip, the all-day row, then the scrolling hour
 * grid. The header rows pad for the body's scrollbar so columns line up. The gutter
 * holds the main zone's hour labels plus one 44px column per extra time zone.
 */
export function DaysView() {
  const { days, events, data, account } = useApp();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollbar, setScrollbar] = useState(0);
  const [columnWidth, setColumnWidth] = useState(160);
  const gutter = GUTTER + ZONE_COLUMN * account.timeZones.length;
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(() => {
      setScrollbar(body.offsetWidth - body.clientWidth);
      setColumnWidth((body.clientWidth - gutter) / days.length);
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [days.length, gutter]);

  const { hour, fit, step, reset } = useHourHeight(bodyRef);
  useCommands(
    () => [
      {
        id: "grid.zoomIn",
        title: "Zoom Hours In",
        group: "View",
        keys: ["mod+shift+."],
        aliases: ["bigger hours", "hour height"],
        run: () => step(1),
      },
      {
        id: "grid.zoomOut",
        title: "Zoom Hours Out",
        group: "View",
        keys: ["mod+shift+,"],
        aliases: ["smaller hours", "fit day"],
        run: () => step(-1),
      },
      {
        id: "grid.zoomReset",
        title: "Default Hour Height",
        group: "View",
        keys: ["mod+shift+0"],
        aliases: ["reset zoom"],
        run: reset,
      },
    ],
    [step, reset],
  );

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
    // Blocks that touch the visible days, so one running past midnight shows on both.
    ...data.blocks
      .filter((block) =>
        withinDays({ start: new Date(block.start_at), end: new Date(block.end_at) }, first, last),
      )
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
          <ZoneHeaders />
          <DayHeaders days={days} columnWidth={columnWidth} />
        </div>
        <div className="flex">
          <div className="shrink-0" style={{ width: gutter }} />
          <HabitStrip days={days} columnWidth={columnWidth} />
        </div>
        <div className="flex border-t border-grid">
          <div
            className="shrink-0 pt-1 pr-2 text-right text-caption text-ink-3"
            style={{ width: gutter }}
          >
            all-day
          </div>
          <AllDayRow days={days} />
        </div>
      </div>
      <TimeGrid days={days} items={items} bodyRef={bodyRef} hour={hour} fit={fit} />
    </div>
  );
}
