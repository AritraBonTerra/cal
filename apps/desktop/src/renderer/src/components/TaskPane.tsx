import type { ExternalEvent } from "@cal/calendar-source";
import {
  addDays,
  type DayKey,
  fromDayKey,
  isOpen,
  type Project,
  type Task,
  toOffsetIso,
} from "@cal/domain";
import {
  Archive,
  CalendarRange,
  CheckCircle2,
  Inbox,
  Layers,
  Moon,
  Star,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/app";
import { eventsOnDay, graphite, useEvents, visibleEvents } from "../lib/calendars";
import { useCardSaver } from "../lib/card";
import { useNow } from "../lib/clock";
import { geometry, useDrag } from "../lib/drag";
import {
  isSmartList,
  listSections,
  listTitle,
  type Section,
  sectionKey,
  UPCOMING_DAYS,
} from "../lib/lists";
import {
  dayNumber,
  formatMinutes,
  formatMonth,
  formatRelativeDay,
  formatWeekday,
} from "../lib/time";
import { select, showList, useUi } from "../lib/ui";
import { deviceZone, zonedDayKey, zonedMinutes } from "../lib/zones";
import { ProjectRing, SMART_COLORS } from "./listIcons";
import { TaskPaneBar } from "./TaskPaneBar";
import { TaskRow } from "./TaskRow";
import { Keycaps } from "./ui";

/*
 * The to-do list for the sidebar's current entry, drawn from `listSections` (the same
 * order ↑/↓ follow). Rows can be dragged onto the grid to schedule them, a block dragged
 * here is removed from the calendar, and a row opens in place into a card.
 */

const ICONS = {
  inbox: Inbox,
  today: Star,
  upcoming: CalendarRange,
  anytime: Layers,
  someday: Archive,
  logbook: CheckCircle2,
};

export function TaskPane() {
  const { data, today, gridToday, zone } = useApp();
  const now = useNow();
  useCardSaver();
  const list = useUi((state) => state.list);
  const removing = useDrag((state) => state.removing);
  const dragging = useDrag((state) => state.task);
  const pointer = useDrag((state) => state.pointer);
  const selection = useUi((state) => state.selection);
  const editing = useUi((state) => state.editing);
  const sections = useSteadyWhileOpen(
    listSections(list, data, { today, gridToday, zone, now }),
    data.tasks,
    editing,
  );
  const rows = sections.flatMap((section) => section.rows);
  // A selected task that left the list (completed, moved) is dropped, so Space and ⌘⌫
  // never act on a row that isn't on screen. A row still loading its new title is kept.
  useEffect(() => {
    if (selection?.kind !== "task" || editing === selection.uuid || !data.loaded) return;
    if (!rows.some((task) => task.uuid === selection.uuid)) select(null);
  }, [selection, editing, rows, data.loaded]);
  const Icon = isSmartList(list) ? ICONS[list] : null;
  const project = list.startsWith("project:")
    ? data.projects.find((each) => each.uuid === list.slice("project:".length))
    : undefined;

  return (
    <section
      ref={(element) => {
        geometry.taskPane = element;
      }}
      className={`relative flex h-full w-full shrink-0 flex-col border-r border-grid bg-canvas ${
        removing ? "bg-hover" : ""
      }`}
      data-dense
      aria-label="To-dos"
    >
      <div className="drag-region h-13 shrink-0" />
      <header className="flex items-center gap-2 px-5 pb-2">
        {Icon && (
          <Icon
            size={20}
            strokeWidth={1.5}
            absoluteStrokeWidth
            className={isSmartList(list) ? SMART_COLORS[list] : undefined}
          />
        )}
        <h2 className="min-w-0 flex-1 truncate text-title-2 font-semibold">
          {listTitle(list, data.projects, data.areas)}
        </h2>
        {rows.length > 0 && <span className="text-small text-ink-3 tnum">{rows.length}</span>}
      </header>
      {project?.deadline && (
        <div className="px-5 pb-2 text-small text-ink-3">
          Deadline {formatRelativeDay(project.deadline, today)}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {rows.length === 0 && (
          <p className="flex flex-col items-center gap-2 px-4 pt-16 text-center text-small text-ink-2">
            {Icon && (
              <Icon size={24} strokeWidth={1.5} absoluteStrokeWidth className="text-ink-3" />
            )}
            <span>
              Nothing here. Press <Keycaps binding="mod+n" className="mx-0.5 align-text-bottom" />{" "}
              to add a to-do.
            </span>
          </p>
        )}
        {list === "upcoming" ? (
          <UpcomingSections sections={sections} />
        ) : (
          sections.map((section) => (
            <SectionRows key={sectionKey(section)} section={section} showNext={list !== "today"} />
          ))
        )}
      </div>
      <TaskPaneBar />

      {removing && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-edge-strong text-small text-ink-2">
          <Trash2 size={14} strokeWidth={1.5} absoluteStrokeWidth />
          Remove from calendar
        </div>
      )}
      {dragging && pointer && (
        <div
          className="pointer-events-none fixed z-50 max-w-60 truncate rounded-sm bg-raised px-2 py-1 text-small font-medium text-ink shadow-drag"
          style={{ left: pointer.x + 12, top: pointer.y + 12 }}
        >
          {dragging.title || "New To-Do"}
        </div>
      )}
    </section>
  );
}

// Upcoming's day sections list that day's calendar events above its to-dos, so the
// pane fetches the coming week's events itself (the grid may show another week).
function UpcomingSections({ sections }: { sections: Section[] }) {
  const { today, account, device } = useApp();
  const from = addDays(today, 1);
  const { events: fetched } = useEvents(
    toOffsetIso(fromDayKey(from)),
    toOffsetIso(fromDayKey(addDays(from, UPCOMING_DAYS))),
  );
  const events = useMemo(
    () => visibleEvents(fetched, device.hiddenCalendars, account.showDeclined),
    [fetched, device.hiddenCalendars, account.showDeclined],
  );
  return sections.map((section) => (
    <SectionRows key={sectionKey(section)} section={section} showNext events={events} />
  ));
}

/**
 * One section of the list: its heading, if it has one, then its rows. Rows lead their
 * meta line with their next block (`showNext`) everywhere but Today, where Scheduled
 * rows show the time in a column instead, and skip what their heading already says
 * (the day, the project). A day section in Upcoming also lists `events` on that day.
 */
function SectionRows({
  section,
  showNext,
  events = [],
}: {
  section: Section;
  showNext: boolean;
  events?: readonly ExternalEvent[];
}) {
  const { today } = useApp();
  const rows = (
    <ul>
      {section.rows.map((task) => (
        <TaskRow
          key={task.uuid}
          task={task}
          slot={section.kind === "scheduled" ? section.next.get(task.uuid) : undefined}
          showNext={showNext}
          omit={section.kind === "day" ? "day" : section.kind === "project" ? "project" : undefined}
        />
      ))}
    </ul>
  );
  switch (section.kind) {
    case "plain":
      return rows;
    case "scheduled":
      return (
        <>
          <Heading>Scheduled</Heading>
          {rows}
        </>
      );
    case "unscheduled":
      return (
        <>
          <Heading hint="press X to place">Not scheduled</Heading>
          {rows}
        </>
      );
    case "evening":
      return (
        <>
          <Heading>
            <Moon size={12} strokeWidth={1.5} absoluteStrokeWidth />
            This Evening
          </Heading>
          {rows}
        </>
      );
    case "day":
      return (
        <>
          <DateHeading
            big={String(dayNumber(section.day))}
            small={
              section.day === addDays(today, 1) ? "Tomorrow" : formatWeekday(section.day, true)
            }
          />
          {eventsOnDay(events, section.day).map((event) => (
            <EventLine key={event.id} event={event} day={section.day} />
          ))}
          {rows}
        </>
      );
    case "month":
      return (
        <>
          <MonthHeading month={section.month} />
          {rows}
        </>
      );
    case "project":
      return (
        <>
          <ProjectHeading project={section.project} />
          {rows}
        </>
      );
  }
}

// Upcoming's group heading: a large numeral (or month) and a small word after it.
function DateHeading({ big, small }: { big: string; small?: string }) {
  return (
    <h3 className="mt-3 mb-1 flex items-baseline gap-2 border-b border-grid px-2 pb-1 first:mt-0">
      <span className="text-title-2 font-semibold tnum">{big}</span>
      {small && <span className="text-small font-medium text-ink-3 tnum">{small}</span>}
    </h3>
  );
}

// "November", with the year when it isn't this one: "January 2027".
function MonthHeading({ month }: { month: DayKey }) {
  const { today } = useApp();
  const year = month.slice(0, 4);
  return (
    <DateHeading big={formatMonth(month)} small={year === today.slice(0, 4) ? undefined : year} />
  );
}

// A quiet line for an event on an Upcoming day: its calendar's bar, title and start.
function EventLine({ event, day }: { event: ExternalEvent; day: DayKey }) {
  const { palette, mode } = useApp();
  const start = new Date(event.start);
  const startsToday = !event.allDay && zonedDayKey(start, deviceZone) === day;
  return (
    <div className="flex items-center gap-2 px-2 py-0.5 text-small text-ink-2">
      <span
        className="h-3 w-[3px] shrink-0 rounded-full"
        style={{ background: (palette.get(event.calendarId) ?? graphite(mode)).bar }}
      />
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      {startsToday && (
        <span className="shrink-0 tnum">{formatMinutes(zonedMinutes(start, deviceZone))}</span>
      )}
    </div>
  );
}

// Anytime's project heading: the progress ring and title; pressing it opens the project.
function ProjectHeading({ project }: { project: Project }) {
  const { data } = useApp();
  const tasks = data.tasks.filter((task) => task.project_uuid === project.uuid);
  const open = tasks.filter(isOpen).length;
  return (
    <h3 className="mt-4 mb-1 first:mt-0">
      <button
        type="button"
        onClick={() => showList(`project:${project.uuid}`)}
        className="flex h-6 w-full items-center gap-1.5 rounded-md px-2 text-left text-small font-medium text-ink transition-colors duration-100 hover:bg-hover hover:duration-0"
      >
        <ProjectRing done={tasks.length - open} total={tasks.length} />
        <span className="truncate">{project.title}</span>
      </button>
    </h3>
  );
}

// A section label, with an optional quiet hint at the right; the first one sits flush.
function Heading({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <h3 className="mt-4 mb-1 flex items-center gap-1.5 px-2 text-small font-medium text-ink-2 first:mt-0">
      {children}
      {hint && <span className="ml-auto font-normal text-ink-3">{hint}</span>}
    </h3>
  );
}

/**
 * While a card is open, the list keeps the layout it had when the card opened, with each
 * row's latest data, so setting the card's When or project never moves or hides it
 * mid-edit; the list settles when the card closes. ↑/↓ are off while a card is open,
 * so they still follow what's on screen.
 */
function useSteadyWhileOpen(sections: Section[], tasks: readonly Task[], editing: string | null) {
  const [frozen, setFrozen] = useState<{ uuid: string; sections: Section[] } | null>(null);
  const shows = (each: Section[], uuid: string) =>
    each.some((section) => section.rows.some((task) => task.uuid === uuid));
  // A new to-do may reach the table a moment after its card opens: freeze once it's in.
  if (editing && frozen?.uuid !== editing && shows(sections, editing)) {
    setFrozen({ uuid: editing, sections });
  } else if (!editing && frozen) setFrozen(null);
  if (!editing || frozen?.uuid !== editing) return sections;
  const latest = new Map(tasks.map((task) => [task.uuid, task]));
  return frozen.sections.map((section) => ({
    ...section,
    rows: section.rows.flatMap((task) => latest.get(task.uuid) ?? []),
  }));
}
