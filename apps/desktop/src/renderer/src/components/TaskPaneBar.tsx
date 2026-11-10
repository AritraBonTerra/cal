import { useActions, useCal } from "@cal/app-core";
import { byPosition } from "@cal/domain";
import { ArrowRight, Box, CalendarDays, Plus, Search } from "lucide-react";
import { useCallback, useRef } from "react";
import { useApp } from "../lib/app";
import { useDrag } from "../lib/drag";
import { moveInto } from "../lib/lists";
import { useShortcut, withShortcut } from "../lib/shortcuts";
import { closeOverlay, useUi } from "../lib/ui";
import { ProjectRing, SMART_COLORS, SMART_ICONS } from "./listIcons";
import { PopMenu, type PopMenuItem, useDismiss } from "./Menu";
import { IconButton } from "./ui";

/*
 * The to-do pane's bottom bar: New To-Do on the left; When, Move and Search on the
 * right. Every button runs the command ⌘K lists, so the shortcut and the click do the
 * same thing. When and Move act on the selected to-do and are disabled without one.
 * While a block is dragged over the pane the bar steps aside for the drop hint.
 */

const ICON = { size: 16, strokeWidth: 1.5, absoluteStrokeWidth: true } as const;

export function TaskPaneBar() {
  const { commands } = useCal();
  const hasTask = useUi((state) => state.selection?.kind === "task" && !state.editing);
  const moving = useUi((state) => state.overlay === "move");
  const whenOpen = useUi((state) => state.overlay === "when");
  const removing = useDrag((state) => state.removing);
  // Each button's tooltip names its command's shortcut, "When (⌘S)".
  const keys = {
    new: useShortcut("task.new"),
    when: useShortcut("task.when"),
    move: useShortcut("task.move"),
    search: useShortcut("palette.open"),
  };
  const moveRef = useRef<HTMLDivElement>(null);
  const closeMove = useCallback(() => {
    if (moving) closeOverlay();
  }, [moving]);
  useDismiss(moveRef, moving, closeMove);

  return (
    <div
      className={`flex h-10 shrink-0 items-center gap-0.5 border-t border-grid bg-canvas px-2 ${
        removing ? "invisible" : ""
      }`}
      data-task-bar
    >
      <button
        type="button"
        title={withShortcut("New To-Do", keys.new)}
        onClick={() => commands.run("task.new")}
        className="no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-small font-medium text-ink-2 transition-colors duration-100 hover:bg-hover hover:duration-0 active:bg-active"
      >
        <Plus {...ICON} />
        New To-Do
      </button>
      <span className="flex-1" />
      <IconButton
        label="When"
        title={withShortcut("When", keys.when)}
        disabled={!hasTask}
        aria-expanded={whenOpen}
        // The picker closes on any press outside it; this one toggles it instead.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => commands.run("task.when")}
        className="disabled:text-edge-strong disabled:hover:bg-transparent"
      >
        <CalendarDays {...ICON} />
      </IconButton>
      <div ref={moveRef} className="relative">
        <IconButton
          label="Move"
          title={withShortcut("Move", keys.move)}
          disabled={!hasTask}
          aria-haspopup="menu"
          aria-expanded={moving}
          onClick={() => commands.run("task.move")}
          className={`disabled:text-edge-strong disabled:hover:bg-transparent ${moving ? "bg-active" : ""}`}
        >
          <ArrowRight {...ICON} />
        </IconButton>
        {moving && hasTask && <MoveMenu />}
      </div>
      <IconButton
        label="Search"
        title={withShortcut("Search", keys.search)}
        onClick={() => commands.run("palette.open")}
      >
        <Search {...ICON} />
      </IconButton>
    </div>
  );
}

/*
 * Where the selected to-do can go: the undated lists and Today (the same commands as
 * ⌘R, ⌘T and so on), then every open project and area.
 */
function MoveMenu() {
  const { data } = useApp();
  const { commands } = useCal();
  const actions = useActions();
  const selection = useUi((state) => state.selection);
  const keys = {
    today: useShortcut("task.today"),
    anytime: useShortcut("task.anytime"),
    someday: useShortcut("task.someday"),
  };
  const task =
    selection?.kind === "task"
      ? data.tasks.find((each) => each.uuid === selection.uuid)
      : undefined;
  if (!task) return null;

  const smart = (
    [
      ["inbox", "Inbox", "task.inbox", null],
      ["today", "Today", "task.today", keys.today],
      ["anytime", "Anytime", "task.anytime", keys.anytime],
      ["someday", "Someday", "task.someday", keys.someday],
    ] as const
  ).map(([list, label, command, binding]): PopMenuItem => {
    const Icon = SMART_ICONS[list];
    return {
      id: list,
      label,
      keys: binding ?? undefined,
      icon: <Icon {...ICON} className={SMART_COLORS[list]} />,
      run: () => commands.run(command),
    };
  });
  const projects = data.projects
    .filter((project) => project.completed_at === undefined)
    .sort(byPosition)
    .map(
      (project, index): PopMenuItem => ({
        id: project.uuid,
        label: project.title || "New Project",
        divider: index === 0,
        icon: <ProjectRing done={0} total={0} />,
        run: () =>
          void actions.updateTask(
            task.uuid,
            moveInto(task, { project: project.uuid }),
            "Move To-Do",
          ),
      }),
    );
  const areas = [...data.areas].sort(byPosition).map(
    (area, index): PopMenuItem => ({
      id: area.uuid,
      label: area.title || "New Area",
      divider: index === 0,
      icon: <Box {...ICON} className="text-ink-2" />,
      run: () =>
        void actions.updateTask(task.uuid, moveInto(task, { area: area.uuid }), "Move To-Do"),
    }),
  );

  return (
    <PopMenu
      label="Move"
      onClose={closeOverlay}
      className="right-0 bottom-full mb-1 origin-bottom-right"
      items={[...smart, ...projects, ...areas]}
    />
  );
}
