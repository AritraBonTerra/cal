import { useActions } from "@cal/app-core";
import {
  dropLengthMinutes,
  isOpen,
  isOverdue,
  scheduledMinutes,
  snapMinutes,
  type Task,
  type TimeBlock,
} from "@cal/domain";
import { FileText, Flag } from "lucide-react";
import { useEffect, useRef } from "react";
import { useApp } from "../lib/app";
import { openCard } from "../lib/card";
import { now } from "../lib/clock";
import { DRAG_THRESHOLD, drag, geometry, useDrag } from "../lib/drag";
import { nextBlock } from "../lib/lists";
import { revealBlock } from "../lib/reveal";
import { tagNames } from "../lib/tags";
import { formatDuration, formatMinutes, formatRelativeDay } from "../lib/time";
import { select, useUi } from "../lib/ui";
import { zonedDayKey, zonedInstant, zonedMinutes } from "../lib/zones";
import { TaskCard } from "./TaskCard";
import { Checkbox } from "./ui";
import { WhenPicker } from "./WhenPicker";

interface TaskRowProps {
  task: Task;
  // In Today's Scheduled section: the block today whose start shows in a time column;
  // clicking the time shows the block on the calendar.
  slot?: TimeBlock;
  // Whether the meta line leads with the next block's day and time (all lists but Today).
  showNext?: boolean;
}

/*
 * One to-do: checkbox, title (with a note icon when it has notes), and a line of
 * metadata (project, day, next block, scheduled time, tags). Click selects,
 * double-click or Return opens it into a card in place, and dragging it onto the grid
 * schedules it; an open card can't be dragged.
 */
export function TaskRow({ task, slot, showNext = false }: TaskRowProps) {
  const { data, today, zone, gridToday, days } = useApp();
  const actions = useActions();
  const selected = useUi(
    (state) => state.selection?.kind === "task" && state.selection.uuid === task.uuid,
  );
  const editing = useUi((state) => state.editing === task.uuid);
  const whenOpen = useUi((state) => state.overlay === "when") && selected;
  const done = !isOpen(task);
  const project = data.projects.find((each) => each.uuid === task.project_uuid);
  const area = data.areas.find((each) => each.uuid === (task.area_uuid ?? project?.area_uuid));
  const at = now();
  const scheduled = scheduledMinutes(task, data.blocks, at);
  const overdue = isOverdue(task, today);

  const next = showNext ? nextBlock(task, data.blocks, at) : undefined;
  // With a time on the row (the column, or the next block in the meta line), the
  // duration drops "scheduled": "1h30 of 3h".
  const timed = slot !== undefined || next !== undefined;

  const meta: { text: string }[] = [];
  if (project || area) meta.push({ text: project?.title ?? area?.title ?? "" });
  if (task.when_date && task.when_date > today) {
    meta.push({ text: formatRelativeDay(task.when_date, today) });
  }
  if (next) {
    const start = new Date(next.start_at);
    meta.push({
      text: `${formatRelativeDay(zonedDayKey(start, zone), gridToday)} ${formatMinutes(zonedMinutes(start, zone))}`,
    });
  }
  const suffix = timed ? "" : " scheduled";
  if (task.estimate_min !== undefined) {
    meta.push({
      text:
        scheduled > 0
          ? `${formatDuration(Math.min(scheduled, task.estimate_min))} of ${formatDuration(task.estimate_min)}${suffix}`
          : formatDuration(task.estimate_min),
    });
  } else if (scheduled > 0) meta.push({ text: `${formatDuration(scheduled)}${suffix}` });
  const tags = tagNames(task.tags);
  if (tags.length > 0) meta.push({ text: tags.map((name) => `#${name}`).join(" ") });

  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const dragging = useDrag((state) => state.task?.uuid === task.uuid);

  // Drops the drag without scheduling: a cancelled pointer, or Escape mid-drag.
  const cancel = () => {
    press.current = null;
    clearDrag();
  };
  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      press.current = null;
      clearDrag();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dragging]);

  const onPointerDown = (event: React.PointerEvent<HTMLLIElement>) => {
    if (event.button !== 0 || editing) return;
    select({ kind: "task", uuid: task.uuid });
    press.current = { x: event.clientX, y: event.clientY, dragging: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLLIElement>) => {
    const state = press.current;
    if (!state) return;
    if (!state.dragging) {
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) < DRAG_THRESHOLD) return;
      state.dragging = true;
      drag.set({
        task: {
          uuid: task.uuid,
          title: task.title,
          lengthMin: dropLengthMinutes(task, data.blocks, at),
        },
      });
    }
    const point = geometry.grid?.locate(event.clientX, event.clientY) ?? null;
    const length = drag.get().task?.lengthMin ?? 30;
    drag.set({
      pointer: { x: event.clientX, y: event.clientY },
      ghost: point
        ? {
            day: point.day,
            start: Math.min(1440 - length, snapMinutes(point.minute, event.shiftKey ? 1 : 15)),
            end: Math.min(1440, snapMinutes(point.minute, event.shiftKey ? 1 : 15) + length),
          }
        : null,
    });
  };

  const onPointerUp = () => {
    const state = press.current;
    press.current = null;
    if (!state?.dragging) return;
    const { ghost } = drag.get();
    clearDrag();
    // The ghost's day and minutes are wall-clock values in the grid's zone.
    if (ghost) {
      void actions.scheduleTask(
        task.uuid,
        zonedInstant(ghost.day, ghost.start, zone),
        zonedInstant(ghost.day, ghost.end, zone),
      );
    }
  };

  return (
    <li
      className="relative flex list-none items-start"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancel}
      onDoubleClick={() => {
        if (!editing) openCard(task);
      }}
    >
      {slot && !editing && (
        <button
          type="button"
          title="Show in Calendar"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => revealBlock(slot, zone, days)}
          className="mt-[3px] h-[22px] w-[62px] shrink-0 rounded-md px-2 text-left text-caption font-medium text-accent tnum hover:bg-hover"
        >
          {formatMinutes(zonedMinutes(new Date(slot.start_at), zone))}
        </button>
      )}
      {editing ? (
        <div className="min-w-0 flex-1">
          <TaskCard task={task} />
        </div>
      ) : (
        <div
          className={`flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-2 py-[5px] ${
            selected ? "bg-accent-soft" : "hover:bg-hover"
          }`}
          data-selected={selected || undefined}
        >
          <div className="flex h-[18px] items-center">
            <Checkbox
              checked={done}
              onChange={(checked) => void actions.setTaskDone(task.uuid, checked)}
              label={done ? "Reopen" : "Complete"}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <div
                className={`flex min-w-0 flex-1 items-center gap-1.5 ${done ? "text-ink-3" : "text-ink"}`}
              >
                <span className={`truncate ${done ? "line-through" : ""}`}>
                  {task.title || <span className="text-ink-3">New To-Do</span>}
                </span>
                {task.notes && (
                  <FileText
                    size={12}
                    strokeWidth={1.5}
                    absoluteStrokeWidth
                    aria-label="Has notes"
                    className="shrink-0 text-ink-3"
                  />
                )}
              </div>
              {task.deadline && (
                <span
                  className={`flex shrink-0 items-center gap-1 text-small tnum ${
                    overdue ? "text-now" : "text-ink-3"
                  }`}
                >
                  <Flag size={11} strokeWidth={1.5} absoluteStrokeWidth />
                  {overdue ? "Overdue" : formatRelativeDay(task.deadline, today)}
                </span>
              )}
            </div>
            {meta.length > 0 && (
              <div className="mt-px truncate text-small text-ink-3 tnum">
                {meta.map((item, index) => (
                  <span key={item.text}>
                    {index > 0 && <span className="mx-1">·</span>}
                    {item.text}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {whenOpen && !editing && <WhenPicker task={task} />}
    </li>
  );
}

const clearDrag = () => drag.set({ task: null, ghost: null, pointer: null });
