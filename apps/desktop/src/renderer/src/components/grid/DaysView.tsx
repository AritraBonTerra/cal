import { useCommands } from "@cal/app-core";
import type { DayKey } from "@cal/domain";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import { now } from "../../lib/clock";
import { geometry } from "../../lib/drag";
import { AllDayRow } from "./AllDayRow";
import { deadlinesByDay, unscheduledByDay, type Workload, workloadOn } from "./agenda";
import { DayHeaders } from "./DayHeaders";
import { HabitStrip } from "./HabitStrip";
import { GUTTER, type Item, withinDays, ZONE_COLUMN } from "./model";
import { TimeGrid } from "./TimeGrid";
import { useHourHeight } from "./useHourHeight";
import { WorkloadRow } from "./WorkloadRow";
import { ZoneHeaders } from "./ZoneHeaders";

/*
 * N-day view: day headers (with each day's deadlines), the workload row, the habit
 * strip (always shown, so there's a place to add one), the all-day row (events, then the day's to-dos without a block), then the
 * scrolling hour grid. The header rows pad for the body's scrollbar so columns line up.
 * The gutter holds the main zone's hour labels plus one 44px column per extra time zone.
 * A to-do dragged onto a day's header column is re-dated to that day.
 */
export function DaysView() {
  const { days, events, data, account, device, zone, gridToday } = useApp();
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
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

  // Maps a window point over the header to its day column, for to-do drags.
  useLayoutEffect(() => {
    geometry.header = {
      dayAt: (clientX, clientY) => {
        const rect = headerRef.current?.getBoundingClientRect();
        if (!rect || clientY < rect.top || clientY > rect.bottom) return null;
        const left = rect.left + gutter;
        const width = rect.width - gutter - scrollbar;
        if (clientX < left || clientX >= left + width) return null;
        return days[Math.floor(((clientX - left) / width) * days.length)] ?? null;
      },
    };
    return () => {
      geometry.header = null;
    };
  });

  const todos = useMemo(
    () => unscheduledByDay(days, data.tasks, data.blocks, gridToday, zone),
    [days, data.tasks, data.blocks, gridToday, zone],
  );
  const deadlines = useMemo(
    () => deadlinesByDay(days, data.tasks, data.projects),
    [days, data.tasks, data.projects],
  );
  // Today and later only; past days show no workload.
  const loads = useMemo(() => {
    const byDay = new Map<DayKey, Workload>();
    if (!device.workloadBar) return byDay;
    for (const day of days) {
      if (day < gridToday) continue;
      byDay.set(
        day,
        workloadOn(day, {
          events,
          blocks: data.blocks,
          tasks: data.tasks,
          unscheduled: todos.get(day) ?? [],
          hours: account.workingHours,
          freeCalendars: device.freeCalendars,
          zone,
          now: now(),
        }),
      );
    }
    return byDay;
  }, [
    days,
    events,
    data.blocks,
    data.tasks,
    todos,
    account.workingHours,
    device.workloadBar,
    device.freeCalendars,
    zone,
    gridToday,
  ]);

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
    // Blocks that touch the visible days (in the grid's zone), so one running past
    // midnight shows on both.
    ...data.blocks
      .filter((block) =>
        withinDays(
          { start: new Date(block.start_at), end: new Date(block.end_at) },
          first,
          last,
          zone,
        ),
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
      <div
        ref={headerRef}
        className="shrink-0 border-b border-grid"
        style={{ paddingRight: scrollbar }}
      >
        <div className="flex">
          <ZoneHeaders />
          <DayHeaders days={days} columnWidth={columnWidth} deadlines={deadlines} />
        </div>
        <WorkloadRow days={days} loads={loads} columnWidth={columnWidth} gutter={gutter} />
        <div className="flex">
          <div
            className="shrink-0 pt-1 pr-2 text-right text-caption leading-5 text-ink-3"
            style={{ width: gutter }}
          >
            habits
          </div>
          <HabitStrip days={days} columnWidth={columnWidth} />
        </div>
        <div className="flex border-t border-grid">
          <div
            className="shrink-0 pt-1 pr-2 text-right text-caption text-ink-3"
            style={{ width: gutter }}
          >
            all-day
          </div>
          <AllDayRow days={days} todos={todos} />
        </div>
      </div>
      <TimeGrid days={days} items={items} bodyRef={bodyRef} hour={hour} fit={fit} />
    </div>
  );
}
