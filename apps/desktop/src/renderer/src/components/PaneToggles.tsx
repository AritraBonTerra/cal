import { ListTodo, PanelLeft } from "lucide-react";
import { togglePane, useUi } from "../lib/ui";
import { IconButton } from "./ui";

/*
 * The sidebar and to-do list switches, pinned beside the traffic lights above
 * whichever pane is leftmost. They never move, so the click that hides a pane brings
 * it back; a hidden pane's icon dims. Each keeps one name and reports pressed or not,
 * and the tooltip says what a click will do. `PANE_TOGGLES_END` is where they stop, for
 * the toolbar to keep its title clear of them once both panes are hidden.
 */
export const PANE_TOGGLES_END = 140;

export function PaneToggles() {
  const sidebar = useUi((state) => state.sidebar);
  const tasks = useUi((state) => state.tasks);
  return (
    <div className="fixed top-3 left-20 z-20 flex gap-1">
      <IconButton
        label="Sidebar"
        title={`${sidebar ? "Hide" : "Show"} sidebar (⌘\\)`}
        aria-pressed={sidebar}
        onClick={() => togglePane("sidebar")}
        className="aria-[pressed=false]:text-ink-3"
        data-pane-toggle="sidebar"
      >
        <PanelLeft size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </IconButton>
      <IconButton
        label="To-dos"
        title={`${tasks ? "Hide" : "Show"} to-dos (⌘/)`}
        aria-pressed={tasks}
        onClick={() => togglePane("tasks")}
        className="aria-[pressed=false]:text-ink-3"
        data-pane-toggle="tasks"
      >
        <ListTodo size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </IconButton>
    </div>
  );
}
