import {
  type AgendaDay,
  agendaDays,
  isEmptyDay,
  type TimedEntry,
  useActions,
  useCommands,
} from "@cal/app-core";
import type { ExternalEvent } from "@cal/calendar-source";
import {
  type DayKey,
  habitDay,
  isOverdue,
  joinable,
  meetingOf,
  placeOf,
  type Task,
} from "@cal/domain";
import { blockColors, habitColors } from "@cal/theme";
import { Flag, Video } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useApp } from "../../lib/app";
import { graphite } from "../../lib/calendars";
import { openCard } from "../../lib/card";
import { useNow } from "../../lib/clock";
import { hueFor } from "../../lib/data";
import { editorStore, openEdit } from "../../lib/events";
import { openMeeting } from "../../lib/meetings";
import {
  formatDuration,
  formatMinutes,
  formatMonthDay,
  formatRelativeDay,
  formatWeekday,
} from "../../lib/time";
import { extendAgenda, type Selection, select, ui, useUi } from "../../lib/ui";
import { zonedDayKey, zonedMinutes } from "../../lib/zones";
import { listShowing } from "../grid/agenda";
import { HabitRing } from "../habitRing";
import { Checkbox } from "../ui";

/*
 * The agenda (A): the days from the anchor as one list, each with its all-day events,
 * the to-dos without a block, then its events and blocks in time order, with the now
 * line between them. Days with nothing on them are left out, except today. Scrolling to
 * the end adds days. Click selects (an event opens its popover); ↑ and ↓ walk the list.
 */
export function AgendaView() {
  const { days, events, data, gridToday, today, zone } = useApp();
  const now = useNow();
  const flashDay = useUi((state) => state.flashDay);
  const body = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () =>
      agendaDays(days, {
        events,
        blocks: data.blocks,
        tasks: data.tasks,
        projects: data.projects,
        habits: data.habits,
        entries: data.entries,
        gridToday,
        today,
        zone,
      }).filter((day) => day.day === gridToday || !isEmptyDay(day)),
    [days, events, data, gridToday, today, zone],
  );

  // A jump (T, the mini month, the arrows) starts the list again from its first day.
  const first = days[0];
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when the first day changes.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [first]);

  // Re-observed as the list grows, so a list still too short to scroll keeps growing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: as above.
  useEffect(() => {
    const mark = end.current;
    if (!mark) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((entry) => entry.isIntersecting) && extendAgenda(),
      { root: body.current, rootMargin: "400px" },
    );
    observer.observe(mark);
    return () => observer.disconnect();
  }, [days.length]);

  useStepping(shown, now);

  return (
    <div
      ref={body}
      className="min-h-0 flex-1 overflow-y-auto border-t border-grid"
      data-dense
      data-agenda
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) select(null);
      }}
    >
      <div className="mx-auto max-w-180 px-6 pt-2 pb-16">
        {shown.map((day) => (
          <Day key={day.day} day={day} now={now} flash={flashDay === day.day} />
        ))}
        <div ref={end} className="h-px" />
      </div>
    </div>
  );
}

// ↑ and ↓ move the selection through the agenda's events and blocks. With nothing
// selected, ↓ starts at what's on now or next.
function useStepping(shown: readonly AgendaDay[], now: Date) {
  const rows = useMemo(
    () =>
      shown.flatMap((day) => [
        ...day.allDay.map((event) => ({
          key: `event:${event.id}`,
          event,
          end: new Date(event.end),
        })),
        ...day.timed.map((entry) => ({
          key: entry.key,
          event: entry.kind === "event" ? entry.event : undefined,
          end: entry.end,
        })),
      ]),
    [shown],
  );
  const latest = useRef({ rows, now });
  latest.current = { rows, now };
  useCommands(() => {
    const step = (direction: 1 | -1) => {
      const { rows, now } = latest.current;
      const key = keyOf(ui.get().selection);
      const at = rows.findIndex((row) => row.key === key);
      const next =
        at === -1
          ? Math.max(
              0,
              rows.findIndex((row) => row.end.getTime() > now.getTime()),
            )
          : Math.min(rows.length - 1, Math.max(0, at + direction));
      const row = rows[next];
      if (!row) return;
      select(
        row.event
          ? { kind: "event", id: row.event.id }
          : { kind: "block", uuid: row.key.slice("block:".length) },
      );
      document
        .querySelector(`[data-row="${CSS.escape(row.key)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    };
    // A selected to-do keeps the arrows for its own list.
    const enabled = () => {
      const { selection, editing } = ui.get();
      return selection?.kind !== "task" && !editing && !editorStore.get().editor;
    };
    return [
      {
        id: "agenda.down",
        title: "Next in Agenda",
        group: "Calendar",
        when: "The agenda is showing",
        keys: ["arrowdown"],
        enabled,
        run: () => step(1),
      },
      {
        id: "agenda.up",
        title: "Previous in Agenda",
        group: "Calendar",
        when: "The agenda is showing",
        keys: ["arrowup"],
        enabled,
        run: () => step(-1),
      },
    ];
  }, []);
}

// Selects a to-do, with its list in the to-do pane so the to-do shortcuts act on it.
function showTask(task: Task, tasks: readonly Task[], today: DayKey) {
  ui.set((state) => ({
    list: listShowing(task, state.list, tasks, today),
    selection: { kind: "task", uuid: task.uuid },
    editing: null,
  }));
}

// The row a selection points at.
const keyOf = (selection: Selection | null) =>
  selection?.kind === "event"
    ? `event:${selection.id}`
    : selection?.kind === "block"
      ? `block:${selection.uuid}`
      : undefined;

function Day({ day, now, flash }: { day: AgendaDay; now: Date; flash: boolean }) {
  const { gridToday } = useApp();
  const isToday = day.day === gridToday;
  // The now line goes before the first thing still to start.
  const next = day.timed.findIndex((entry) => entry.start.getTime() > now.getTime());
  const line = next === -1 ? day.timed.length : next;
  return (
    <section className="pt-4" data-agenda-day={day.day}>
      <h2
        className={`sticky top-0 z-10 flex items-baseline gap-2 bg-canvas py-1.5 ${flash ? "relative" : ""}`}
      >
        {flash && (
          <span
            className="flash-out pointer-events-none absolute -inset-x-2 inset-y-0 rounded-md bg-accent-soft"
            onAnimationEnd={() => ui.set({ flashDay: null })}
          />
        )}
        <span
          className={`relative text-title-3 font-semibold ${isToday ? "text-now" : "text-ink"}`}
        >
          {dayTitle(day.day, gridToday)}
        </span>
        <span className="relative text-small text-ink-3 tnum">
          {daySubtitle(day.day, gridToday)}
        </span>
      </h2>
      {day.habits.length > 0 && <Habits day={day} />}
      {day.allDay.map((event) => (
        <EventRow key={event.id} event={event} day={day.day} now={now} />
      ))}
      {day.tasks.map((task) => (
        <TaskLine key={task.uuid} task={task} day={day.day} />
      ))}
      {day.due.map((task) => (
        <TaskLine key={task.uuid} task={task} day={day.day} />
      ))}
      {day.timed.map((entry, index) => (
        <div key={entry.key}>
          {isToday && index === line && <NowLine now={now} />}
          {entry.kind === "event" ? (
            <EventRow event={entry.event} entry={entry} day={day.day} now={now} />
          ) : (
            <BlockRow entry={entry} day={day.day} now={now} />
          )}
        </div>
      ))}
      {isToday && line === day.timed.length && <NowLine now={now} />}
      {isEmptyDay(day) && <p className="py-1 text-body text-ink-3">Nothing planned</p>}
    </section>
  );
}

// "Today", "Tomorrow", "Yesterday", else the weekday.
function dayTitle(day: DayKey, today: DayKey) {
  const relative = formatRelativeDay(day, today);
  return ["Today", "Tomorrow", "Yesterday"].includes(relative)
    ? relative
    : formatWeekday(day, true);
}

// The date, with the weekday when the title doesn't say it.
function daySubtitle(day: DayKey, today: DayKey) {
  const titled = dayTitle(day, today) === formatWeekday(day, true);
  return titled ? formatMonthDay(day) : `${formatWeekday(day)}, ${formatMonthDay(day)}`;
}

function NowLine({ now }: { now: Date }) {
  const { zone } = useApp();
  return (
    <div className="flex h-5 items-center" data-agenda-now>
      <span className="w-20 shrink-0 text-caption font-semibold text-now tnum">
        {formatMinutes(zonedMinutes(now, zone))}
      </span>
      <span className="-ml-px h-2 w-2 shrink-0 rounded-full bg-now" />
      <span className="h-px flex-1 bg-now" />
    </div>
  );
}

interface RowProps {
  // Start over end, or a word ("all-day").
  time: ReactNode;
  mark: ReactNode;
  title: ReactNode;
  // One line under the title.
  detail?: ReactNode;
  past?: boolean;
  selected?: boolean;
  rowKey?: string;
  onClick: () => void;
  onDoubleClick?: () => void;
  action?: ReactNode;
}

// One line of the agenda: the time column, a mark in the item's color, then its text.
function Row(props: RowProps) {
  const { time, mark, title, detail, past, selected, rowKey, onClick, onDoubleClick, action } =
    props;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: ↑/↓ and Return do the same from the keyboard.
    // biome-ignore lint/a11y/useKeyWithClickEvents: as above.
    <div
      className={`-mx-2 flex min-h-9 items-start rounded-md px-2 py-1.5 ${
        selected ? "bg-accent-soft" : "hover:bg-hover"
      }`}
      data-row={rowKey}
      data-selected={selected || undefined}
      data-past={past || undefined}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="w-20 shrink-0 text-small leading-[18px] tnum">{time}</div>
      <div className="flex h-[18px] w-6 shrink-0 items-center">{mark}</div>
      <div className="min-w-0 flex-1">
        {/* The popover grows from the title (its anchor), not the full-width row. */}
        <div className={`flex min-w-0 ${past ? "text-ink-3" : "text-ink"}`}>
          <span data-item={rowKey} className="min-w-0 truncate">
            {title}
          </span>
        </div>
        {detail && <div className="truncate text-small text-ink-3 tnum">{detail}</div>}
      </div>
      {action}
    </div>
  );
}

// A start over an end, in the grid's zone. An end on another day is named by its day.
function Times({ entry, day, past }: { entry: TimedEntry; day: DayKey; past: boolean }) {
  const { zone, gridToday } = useApp();
  const label = (at: Date) => {
    const on = zonedDayKey(at, zone);
    return on === day ? formatMinutes(zonedMinutes(at, zone)) : formatRelativeDay(on, gridToday);
  };
  return (
    <>
      <div className={past ? "text-ink-3" : "text-ink"}>{label(entry.start)}</div>
      <div className="text-caption text-ink-3">{label(entry.end)}</div>
    </>
  );
}

function EventRow({
  event,
  entry,
  day,
  now,
}: {
  event: ExternalEvent;
  // The timed entry; absent for an all-day event.
  entry?: TimedEntry;
  day: DayKey;
  now: Date;
}) {
  const { palette, mode, zone } = useApp();
  const rowKey = `event:${event.id}`;
  const selected = useUi((state) => keyOf(state.selection) === rowKey);
  const past = Date.parse(event.end) <= now.getTime();
  const colors = palette.get(event.calendarId) ?? graphite(mode);
  const color = past ? colors.pastTime : colors.bar;
  const meeting = meetingOf(event);
  const declined = event.myStatus === "declined";
  const details = [event.myStatus === "pending" && "Not answered yet", placeOf(event)].filter(
    Boolean,
  );
  return (
    <Row
      rowKey={rowKey}
      selected={selected}
      past={past || declined}
      onClick={() => {
        select({ kind: "event", id: event.id });
        openEdit(event, zone);
      }}
      time={
        entry ? (
          <Times entry={entry} day={day} past={past} />
        ) : (
          <span className="text-ink-3">all-day</span>
        )
      }
      mark={
        <span
          className="h-2 w-2 rounded-full"
          style={
            event.myStatus === "pending"
              ? { boxShadow: `inset 0 0 0 1.5px ${color}` }
              : { background: color }
          }
        />
      }
      title={<span className={declined ? "line-through" : ""}>{event.title}</span>}
      detail={details.join(" · ")}
      action={
        meeting && joinable(event, now) ? (
          <button
            type="button"
            onClick={(click) => {
              click.stopPropagation();
              openMeeting(meeting.url);
            }}
            className="ml-2 flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-small font-medium text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] hover:bg-active"
            data-agenda-join
          >
            <Video size={12} strokeWidth={1.5} absoluteStrokeWidth />
            Join
          </button>
        ) : meeting ? (
          <Video
            size={12}
            strokeWidth={1.5}
            absoluteStrokeWidth
            aria-label="Video call"
            className="mt-[3px] ml-2 shrink-0 text-ink-3"
          />
        ) : null
      }
    />
  );
}

function BlockRow({
  entry,
  day,
  now,
}: {
  entry: Extract<TimedEntry, { kind: "block" }>;
  day: DayKey;
  now: Date;
}) {
  const { mode, data, today } = useApp();
  const actions = useActions();
  const selected = useUi((state) => keyOf(state.selection) === entry.key);
  const { block, task, project } = entry;
  const done = block.done_at !== undefined;
  const past = entry.end.getTime() <= now.getTime();
  const stripe = project ? blockColors(hueFor(project), mode).stripe : "var(--cal-edge-strong)";
  const minutes = Math.round((entry.end.getTime() - entry.start.getTime()) / 60_000);
  return (
    <Row
      rowKey={entry.key}
      selected={selected}
      past={past || done}
      onClick={() => select({ kind: "block", uuid: block.uuid })}
      onDoubleClick={() => {
        if (!task) return;
        showTask(task, data.tasks, today);
        openCard(task);
      }}
      time={<Times entry={entry} day={day} past={past} />}
      mark={
        <Checkbox
          checked={done}
          label={done ? "Reopen" : "Complete"}
          onChange={(checked) => void actions.setBlockDone(block, checked)}
        />
      }
      title={<span className={done ? "line-through" : ""}>{task?.title ?? "Block"}</span>}
      detail={
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-[3px] shrink-0 rounded-full" style={{ background: stripe }} />
          {[project?.title, formatDuration(minutes)].filter(Boolean).join(" · ")}
        </span>
      }
    />
  );
}

// A to-do without a time on its day, or one due that day.
function TaskLine({ task, day }: { task: Task; day: DayKey }) {
  const { data, today } = useApp();
  const actions = useActions();
  const selected = useUi(
    (state) => state.selection?.kind === "task" && state.selection.uuid === task.uuid,
  );
  const project = data.projects.find((each) => each.uuid === task.project_uuid);
  const overdue = isOverdue(task, today);
  const due = task.deadline !== undefined && task.deadline <= day;
  return (
    <Row
      selected={selected}
      onClick={() => showTask(task, data.tasks, today)}
      onDoubleClick={() => {
        showTask(task, data.tasks, today);
        openCard(task);
      }}
      time={null}
      mark={
        <Checkbox
          checked={false}
          label="Complete"
          onChange={(checked) => void actions.setTaskDone(task.uuid, checked)}
        />
      }
      title={task.title || "New To-Do"}
      detail={
        due || project ? (
          <span className="flex items-center gap-1">
            {due && (
              <span className={`flex items-center gap-1 ${overdue ? "text-danger" : ""}`}>
                <Flag size={11} strokeWidth={1.5} absoluteStrokeWidth />
                {overdue ? "Overdue" : task.deadline === today ? "Due today" : "Due"}
              </span>
            )}
            {due && project && <span>·</span>}
            {project?.title}
          </span>
        ) : undefined
      }
    />
  );
}

// Today's habits as one line of chips; a click logs one.
function Habits({ day }: { day: AgendaDay }) {
  const { data, mode } = useApp();
  const actions = useActions();
  return (
    <div className="flex flex-wrap gap-1 py-1 pl-20" data-agenda-habits>
      {day.habits.map((habit) => {
        const state = habitDay(habit, data.entries, day.day);
        const colors = habitColors(hueFor(habit), mode);
        return (
          <button
            type="button"
            key={habit.uuid}
            aria-pressed={state.done}
            onClick={(event) =>
              void actions.logHabit(habit.uuid, day.day, event.altKey ? state.less : state.next)
            }
            className={`flex h-6 items-center gap-1.5 rounded-full pr-2.5 pl-1.5 text-small font-medium ${
              state.done ? "" : "bg-hover text-ink-2"
            }`}
            style={state.done ? { background: colors.fill, color: colors.label } : undefined}
          >
            <HabitRing
              fraction={state.fraction}
              status={state.done ? "done" : "open"}
              color={colors.ring}
              segments={state.segments}
            />
            {habit.title}
          </button>
        );
      })}
    </div>
  );
}
