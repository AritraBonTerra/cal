import { isThisEvening } from "@cal/domain";
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
import { useEffect } from "react";
import { useApp } from "../lib/app";
import { geometry, useDrag } from "../lib/drag";
import { isSmartList, listTitle, tasksIn } from "../lib/lists";
import { formatRelativeDay } from "../lib/time";
import { select, useUi } from "../lib/ui";
import { TaskRow } from "./TaskRow";
import { Keycaps } from "./ui";

/*
 * The to-do list for the sidebar's current entry. Rows can be dragged onto the grid to
 * schedule them, and a block dragged here is removed from the calendar.
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
  const { data, today } = useApp();
  const list = useUi((state) => state.list);
  const removing = useDrag((state) => state.removing);
  const dragging = useDrag((state) => state.task);
  const pointer = useDrag((state) => state.pointer);
  const rows = tasksIn(list, data.tasks, today);
  const selection = useUi((state) => state.selection);
  const editing = useUi((state) => state.editing);
  // A selected task that left the list (completed, moved) is dropped, so Space and ⌘⌫
  // never act on a row that isn't on screen. A row still loading its new title is kept.
  useEffect(() => {
    if (selection?.kind !== "task" || editing === selection.uuid || !data.loaded) return;
    if (!rows.some((task) => task.uuid === selection.uuid)) select(null);
  }, [selection, editing, rows, data.loaded]);
  const evening = list === "today" ? rows.filter((task) => isThisEvening(task, today)) : [];
  const main = rows.filter((task) => !evening.includes(task));
  const Icon = isSmartList(list) ? ICONS[list] : null;
  const project = list.startsWith("project:")
    ? data.projects.find((each) => each.uuid === list.slice("project:".length))
    : undefined;

  return (
    <section
      ref={(element) => {
        geometry.taskPane = element;
      }}
      className={`relative flex h-full w-80 shrink-0 flex-col border-r border-grid bg-canvas ${
        removing ? "bg-hover" : ""
      }`}
      data-dense
      aria-label="To-dos"
    >
      <div className="drag-region h-13 shrink-0" />
      <header className="flex items-center gap-2 px-5 pb-2">
        {Icon && <Icon size={20} strokeWidth={1.5} absoluteStrokeWidth className="text-accent" />}
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
        <ul>
          {main.map((task) => (
            <TaskRow key={task.uuid} task={task} />
          ))}
        </ul>
        {evening.length > 0 && (
          <>
            <h3 className="mt-4 mb-1 flex items-center gap-1.5 px-2 text-small font-medium text-ink-2">
              <Moon size={12} strokeWidth={1.5} absoluteStrokeWidth />
              This Evening
            </h3>
            <ul>
              {evening.map((task) => (
                <TaskRow key={task.uuid} task={task} />
              ))}
            </ul>
          </>
        )}
      </div>

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
