import { useActions } from "@cal/app-core";
import {
  dropLengthMinutes,
  isOpen,
  isOverdue,
  scheduledMinutes,
  snapMinutes,
  type Task,
} from "@cal/domain";
import { Flag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { DRAG_THRESHOLD, drag, geometry, useDrag } from "../lib/drag";
import { formatDuration, formatRelativeDay } from "../lib/time";
import { select, ui, useUi } from "../lib/ui";
import { zonedInstant } from "../lib/zones";
import { Checkbox } from "./ui";
import { WhenPicker } from "./WhenPicker";

/*
 * One to-do: checkbox, title, and a line of metadata (project, deadline, scheduled time).
 * Click selects, double-click or Enter edits the title, and dragging it onto the grid
 * schedules it.
 */
export function TaskRow({ task }: { task: Task }) {
  const { data, today, zone } = useApp();
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

  const meta: { text: string }[] = [];
  if (project || area) meta.push({ text: project?.title ?? area?.title ?? "" });
  if (task.when_date && task.when_date > today) {
    meta.push({ text: formatRelativeDay(task.when_date, today) });
  }
  if (task.estimate_min !== undefined) {
    meta.push({
      text:
        scheduled > 0
          ? `${formatDuration(Math.min(scheduled, task.estimate_min))} of ${formatDuration(task.estimate_min)} scheduled`
          : formatDuration(task.estimate_min),
    });
  } else if (scheduled > 0) meta.push({ text: `${formatDuration(scheduled)} scheduled` });

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
      className="relative list-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancel}
      onDoubleClick={() => ui.set({ editing: task.uuid })}
    >
      <div
        className={`flex items-start gap-2.5 rounded-md px-2 py-[5px] ${
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
          {editing ? (
            <TitleEditor task={task} />
          ) : (
            <div className="flex items-baseline gap-2">
              <div
                className={`min-w-0 flex-1 truncate ${done ? "text-ink-3 line-through" : "text-ink"}`}
              >
                {task.title || <span className="text-ink-3">New To-Do</span>}
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
          )}
          {meta.length > 0 && !editing && (
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
      {whenOpen && <WhenPicker task={task} />}
    </li>
  );
}

const clearDrag = () => drag.set({ task: null, ghost: null, pointer: null });

// Inline title editing: Enter saves, Escape reverts, and an empty new to-do is removed.
function TitleEditor({ task }: { task: Task }) {
  const actions = useActions();
  const [value, setValue] = useState(task.title);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (save: boolean) => {
    const title = value.trim();
    ui.set({ editing: null });
    if (save && title && title !== task.title) void actions.updateTask(task.uuid, { title });
    else if (!task.title && (!save || !title)) {
      select(null);
      void actions.deleteTask(task.uuid);
    }
  };

  return (
    <input
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
        event.stopPropagation();
      }}
      placeholder="New To-Do"
      aria-label="Title"
      className="w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
    />
  );
}
