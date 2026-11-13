import { useSettings } from "@cal/app-core";
import type { ReactNode } from "react";
import { useShortcut, withShortcut } from "../lib/shortcuts";
import { togglePane, useUi } from "../lib/ui";

/*
 * The sidebar and to-do list switches, pinned beside the traffic lights above whichever
 * pane is leftmost, and above the sidebar when it peeks. They never move, so the click
 * that hides a pane brings it back. Each icon animates between "click to collapse" (pane
 * open) and the plain shape (pane hidden, dimmed). Their 30px buttons centre on y = 26,
 * the middle of the 52px top band, where the traffic lights and toolbar also sit.
 * App.tsx renders them after every drag band, so Electron leaves their clicks alone.
 * `paneTogglesEnd` is where they stop, for the toolbar to keep its title clear of them
 * once both panes are hidden.
 *
 * The traffic lights don't zoom with the interface size, so the toggles' left edge stays
 * at the same screen distance from them: LEFT window points, fewer CSS pixels when the
 * window draws larger. Main moves the lights down to the scaled band's centre.
 */
// 12px after the green light's right edge: x ≈ 75 on macOS 26 and later, whose lights are
// wider and further apart than before (x ≈ 70 there, so the gap is a little larger).
const LEFT = 87;
const SIZE = 30;
const GAP = 4;

// The toggles' left edge in CSS pixels at interface size `scale` (percent).
const leftAt = (scale: number) => (LEFT * 100) / scale;

export const paneTogglesEnd = (scale: number) => leftAt(scale) + SIZE * 2 + GAP;

export function PaneToggles() {
  const { device } = useSettings();
  const sidebar = useUi((state) => state.sidebar);
  const tasks = useUi((state) => state.tasks);
  const sidebarKey = useShortcut("view.sidebar");
  const tasksKey = useShortcut("view.tasks");
  return (
    <div className="fixed top-[11px] z-40 flex" style={{ left: leftAt(device.uiScale), gap: GAP }}>
      <Toggle
        pane="sidebar"
        label="Sidebar"
        open={sidebar}
        title={withShortcut(`${sidebar ? "Hide" : "Show"} sidebar`, sidebarKey)}
      >
        <SidebarIcon open={sidebar} />
      </Toggle>
      <Toggle
        pane="tasks"
        label="To-dos"
        open={tasks}
        title={withShortcut(`${tasks ? "Hide" : "Show"} to-dos`, tasksKey)}
      >
        <TodoIcon open={tasks} />
      </Toggle>
    </div>
  );
}

interface ToggleProps {
  pane: "sidebar" | "tasks";
  label: string;
  open: boolean;
  title: string;
  children: ReactNode;
}

// IconButton's recipe at 30px; pressed while the pane shows.
function Toggle({ pane, label, open, title, children }: ToggleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={open}
      title={title}
      onClick={() => togglePane(pane)}
      data-pane-toggle={pane}
      className={`no-drag flex items-center justify-center rounded-md transition-colors duration-100 hover:bg-hover hover:duration-0 active:bg-active ${
        open ? "text-ink-2 hover:text-ink" : "text-ink-3 hover:text-ink-2"
      }`}
      style={{ width: SIZE, height: SIZE }}
    >
      {children}
    </button>
  );
}

// The parts that come and go: 150ms ease-out, instant under reduced motion.
const MOTION = "duration-150 ease-out motion-reduce:transition-none";

// A 20px lucide-style icon on the 24px grid.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// PanelLeft; while open, PanelLeftClose's chevron, which leaves leftward with the pane.
function SidebarIcon({ open }: { open: boolean }) {
  return (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path
        d="m16 15-3-3 3-3"
        className={`transition-[opacity,translate] ${MOTION} ${
          open ? "opacity-100" : "-translate-x-0.5 opacity-0"
        }`}
      />
    </Icon>
  );
}

/*
 * ListTodo; the check draws itself in when the list opens and back out when it closes.
 * Visibility flips only at the end of the draw-out, so no round-cap dot is left behind.
 */
function TodoIcon({ open }: { open: boolean }) {
  return (
    <Icon>
      <path d="M13 5h8" />
      <path d="M13 12h8" />
      <path d="M13 19h8" />
      <rect x="3" y="4" width="6" height="6" rx="1" />
      <path
        d="m3 17 2 2 4-4"
        pathLength={1}
        strokeDasharray="1"
        className={`transition-[stroke-dashoffset,visibility] ${MOTION} ${
          open ? "[stroke-dashoffset:0]" : "invisible [stroke-dashoffset:1]"
        }`}
      />
    </Icon>
  );
}
