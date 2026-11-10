import { useActions } from "@cal/app-core";
import { isOpen, isOverdue, scheduledMinutes, type Task, type TimeBlock } from "@cal/domain";
import { FileText, Flag } from "lucide-react";
import { useApp } from "../lib/app";
import { openCard } from "../lib/card";
import { now } from "../lib/clock";
import { nextBlock } from "../lib/lists";
import { revealBlock } from "../lib/reveal";
import { tagNames } from "../lib/tags";
import { useTaskDrag } from "../lib/taskDrag";
import { formatDuration, formatMinutes, formatRelativeDay } from "../lib/time";
import { select, useUi } from "../lib/ui";
import { zonedDayKey, zonedMinutes } from "../lib/zones";
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
  // What the row's section heading already says, so the meta line leaves it out.
  omit?: "day" | "project";
}

/*
 * One to-do: checkbox, title (with a note icon when it has notes), and a line of
 * metadata (project, day, next block, scheduled time, tags). Click selects,
 * double-click or Return opens it into a card in place, dragging it onto the grid
 * schedules it, and dragging it onto a day's header dates it to that day; an open
 * card can't be dragged.
 */
export function TaskRow({ task, slot, showNext = false, omit }: TaskRowProps) {
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
  if ((project || area) && omit !== "project") {
    meta.push({ text: project?.title ?? area?.title ?? "" });
  }
  if (task.when_date && task.when_date > today && omit !== "day") {
    meta.push({ text: formatRelativeDay(task.when_date, today) });
  }
  if (next) {
    const start = new Date(next.start_at);
    const day = zonedDayKey(start, zone);
    const time = formatMinutes(zonedMinutes(start, zone));
    // Under its day's heading, a block on that day shows just its time.
    const sameDay = omit === "day" && day === task.when_date;
    meta.push({ text: sameDay ? time : `${formatRelativeDay(day, gridToday)} ${time}` });
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

  const { handlers } = useTaskDrag(task, () => select({ kind: "task", uuid: task.uuid }), editing);

  return (
    <li
      className="relative flex list-none items-start"
      {...handlers}
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
