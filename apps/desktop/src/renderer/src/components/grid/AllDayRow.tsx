import { useActions } from "@cal/app-core";
import { type DayKey, type Task, toDayKey } from "@cal/domain";
import { useApp } from "../../lib/app";
import { graphite } from "../../lib/calendars";
import { useDrag } from "../../lib/drag";
import { openEdit } from "../../lib/events";
import { assignLanes } from "../../lib/layout";
import { useTaskDrag } from "../../lib/taskDrag";
import { select, showList, ui, useUi } from "../../lib/ui";
import { Checkbox } from "../ui";
import { listShowing } from "./agenda";
import { barColumns } from "./model";

const LANE = 21;
// To-do chips shown per day before the rest fold into "+N more".
const MAX_TODOS = 3;
// Height of the "+N more" line: one caption line plus a 2px gap.
const MORE = 16;

/**
 * All-day events as bars spanning their days, stacked in lanes (20px chips, 1px gaps).
 * Under each day's events sit its unscheduled to-dos (`todos`, see unscheduledByDay): up
 * to three chips, then "+N more", which opens the list holding the rest. A to-do chip is
 * dragged like a list row: into the hours to block it, onto another day to re-date it.
 */
export function AllDayRow({
  days,
  todos,
}: {
  days: readonly DayKey[];
  todos: ReadonlyMap<DayKey, readonly Task[]>;
}) {
  const { events, palette, mode, zone, gridToday } = useApp();
  const selected = useUi((state) =>
    state.selection?.kind === "event" ? state.selection.id : null,
  );
  const dropDay = useDrag((state) => state.dropDay);
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
  // Each day's to-dos start below the lowest event lane crossing that day.
  const eventLanes = days.map((_, index) =>
    placed.reduce(
      (max, { item, lane }) =>
        item.from <= index && item.to >= index ? Math.max(max, lane + 1) : max,
      0,
    ),
  );
  const heights = days.map((day, index) => {
    const count = todos.get(day)?.length ?? 0;
    return (
      ((eventLanes[index] ?? 0) + Math.min(count, MAX_TODOS)) * LANE +
      (count > MAX_TODOS ? MORE : 0)
    );
  });
  const column = (index: number, span = 1) => ({
    left: `calc(${(index / days.length) * 100}% + 2px)`,
    width: `calc(${(span / days.length) * 100}% - 4px)`,
  });

  return (
    <div
      className="relative min-w-0 flex-1"
      style={{ height: Math.max(LANE, ...heights) + 3 }}
      data-all-day
    >
      {days.map((day, index) =>
        day === dropDay ? (
          <div
            key={`drop-${day}`}
            className="pointer-events-none absolute inset-y-0.5 rounded-sm border border-dashed border-accent bg-accent-soft"
            style={column(index)}
          />
        ) : null,
      )}
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
              ...column(item.from, item.to - item.from + 1),
              background: isSelected ? colors.solid : colors.fill,
              borderColor: isSelected ? colors.solid : colors.bar,
              color: isSelected ? "#ffffff" : colors.title,
            }}
          >
            <span className="truncate">{item.event.title}</span>
          </button>
        );
      })}
      {days.map((day, index) => {
        const tasks = todos.get(day) ?? [];
        const top = (eventLanes[index] ?? 0) * LANE + 2;
        const hidden = tasks.length - MAX_TODOS;
        return [
          ...tasks
            .slice(0, MAX_TODOS)
            .map((task, row) => (
              <TodoChip
                key={`${day}:${task.uuid}`}
                task={task}
                style={{ top: top + row * LANE, ...column(index) }}
              />
            )),
          hidden > 0 && (
            <button
              type="button"
              key={`${day}:more`}
              onClick={() => showList(day === gridToday ? "today" : "upcoming")}
              className="absolute flex h-3.5 items-center truncate px-1.5 text-caption text-ink-3 tnum hover:text-ink-2"
              style={{ top: top + MAX_TODOS * LANE, ...column(index) }}
            >
              +{hidden} more
            </button>
          ),
        ];
      })}
    </div>
  );
}

/**
 * A dated to-do without a block, as a light chip: checkbox and title. A click selects it
 * (showing a list that holds it, so the to-do shortcuts act on it); the checkbox
 * completes it; a drag blocks or re-dates it (see useTaskDrag).
 */
function TodoChip({ task, style }: { task: Task; style: React.CSSProperties }) {
  const { data, today } = useApp();
  const actions = useActions();
  const selected = useUi(
    (state) => state.selection?.kind === "task" && state.selection.uuid === task.uuid,
  );
  const { handlers } = useTaskDrag(task, () =>
    ui.set((state) => ({
      list: listShowing(task, state.list, data.tasks, today),
      selection: { kind: "task", uuid: task.uuid },
      editing: null,
    })),
  );
  return (
    <div
      {...handlers}
      title={task.title}
      data-task-chip={task.uuid}
      data-selected={selected || undefined}
      className={`absolute flex h-5 items-center gap-1.5 rounded-sm px-1.5 text-small ${
        selected
          ? "bg-accent-soft shadow-[inset_0_0_0_2px_var(--cal-accent)]"
          : "bg-canvas shadow-[inset_0_0_0_1px_var(--cal-edge)]"
      }`}
      style={style}
    >
      <Checkbox
        checked={false}
        size={12}
        label="Complete"
        onChange={(checked) => void actions.setTaskDone(task.uuid, checked)}
      />
      <span className="min-w-0 truncate text-ink">{task.title || "New To-Do"}</span>
    </div>
  );
}
