import { useActions, useCal, useSettings } from "@cal/app-core";
import type { CalendarAccess } from "@cal/calendar-source";
import { type Area, byPosition, inList, isOpen, type Project } from "@cal/domain";
import { Box, CalendarDays, ChevronDown, Plus, Repeat, Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthState, SyncStatus } from "../../../shared/api";
import { useApp } from "../lib/app";
import { byAccount, calendarColor, soloCalendar, withId } from "../lib/calendars";
import { SMART_LISTS, SMART_TITLES } from "../lib/lists";
import { type ListId, openSettings, showList, toggleOverlay, ui, useUi } from "../lib/ui";
import { HabitList } from "./HabitList";
import { ProjectRing, SMART_COLORS, SMART_ICONS } from "./listIcons";
import { PopMenu, useDismiss } from "./Menu";
import { MiniMonth } from "./MiniMonth";
import { IconButton } from "./ui";

/*
 * The sidebar: a mini month, then Things-style navigation (smart lists with counts, in
 * three groups; projects outside any area; areas and their projects), habits, the
 * device's calendars, and a footer with Settings, a + menu for new projects, areas and
 * habits, and the account. Double-click a project or area to rename it. The navigation
 * scrolls between the month and the footer. The top band is the window's drag region;
 * the traffic lights and the pane toggles sit over it.
 */

// Smart lists that open a new group, as in Things.
const GROUP_STARTS: readonly ListId[] = ["today", "logbook"];

export const ROW =
  "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body transition-colors duration-100 hover:duration-0";

interface SidebarProps {
  auth: AuthState;
  sync: SyncStatus;
  access: CalendarAccess;
  requestAccess: () => void;
}

export function Sidebar({ auth, sync, access, requestAccess }: SidebarProps) {
  const { data, today } = useApp();
  const current = useUi((state) => state.list);
  const counts = (list: ListId) =>
    data.tasks.filter((task) =>
      list === "today" || list === "inbox" ? inList(task, list, today) : false,
    ).length;
  const areas = [...data.areas].sort(byPosition);
  const areaIds = new Set(areas.map((area) => area.uuid));
  const projects = data.projects
    .filter((project) => project.completed_at === undefined)
    .sort(byPosition);
  // Projects whose area is gone count as outside any area, so they never vanish.
  const loose = projects.filter(
    (project) => project.area_uuid === undefined || !areaIds.has(project.area_uuid),
  );

  const projectRow = (project: Project) => {
    const tasks = data.tasks.filter((task) => task.project_uuid === project.uuid);
    const open = tasks.filter(isOpen).length;
    return (
      <li key={project.uuid}>
        <NameRow
          kind="project"
          record={project}
          active={current === `project:${project.uuid}`}
          icon={<ProjectRing done={tasks.length - open} total={tasks.length} />}
        />
      </li>
    );
  };

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-sidebar" data-dense>
      <div className="drag-region h-13 shrink-0" />
      <MiniMonth />

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ul>
          {SMART_LISTS.map((list) => {
            const Icon = SMART_ICONS[list];
            const count = counts(list);
            return (
              <li key={list} className={GROUP_STARTS.includes(list) ? "mt-3" : undefined}>
                <Row active={current === list} onClick={() => showList(list)}>
                  <Icon
                    size={16}
                    strokeWidth={1.5}
                    absoluteStrokeWidth
                    className={`shrink-0 ${SMART_COLORS[list]}`}
                    data-tint
                  />
                  <span className="flex-1 truncate">{SMART_TITLES[list]}</span>
                  {count > 0 && <span className="text-caption text-ink-3 tnum">{count}</span>}
                </Row>
              </li>
            );
          })}
        </ul>

        {loose.length > 0 && <ul className="mt-5">{loose.map(projectRow)}</ul>}

        {areas.map((area) => (
          <section key={area.uuid} className="mt-5">
            <NameRow kind="area" record={area} active={current === `area:${area.uuid}`} />
            <ul>{projects.filter((project) => project.area_uuid === area.uuid).map(projectRow)}</ul>
          </section>
        ))}

        <HabitList />
        <CalendarList />
      </nav>

      {access !== "fullAccess" && (
        <div className="mx-2 mb-2 rounded-lg bg-hover p-3 text-small text-ink-2">
          <div className="flex items-start gap-2">
            <CalendarDays
              size={14}
              strokeWidth={1.5}
              absoluteStrokeWidth
              className="mt-0.5 shrink-0"
            />
            <div>
              Cal can't see your calendars yet.
              <button
                type="button"
                onClick={requestAccess}
                className="mt-1 block font-medium text-accent"
              >
                Allow access
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative flex h-11 shrink-0 items-center gap-1 px-2" data-sidebar-footer>
        <IconButton label="Settings (⌘,)" onClick={() => openSettings()} data-settings>
          <Settings size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </IconButton>
        <NewListButton />
        <Account auth={auth} sync={sync} />
      </div>
    </aside>
  );
}

// A sidebar row. Icons go accent when active, ink-2 otherwise, except a smart list's
// own colored icon (marked `data-tint`), which keeps its color either way.
function Row({
  active,
  onClick,
  onDoubleClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-current={active || undefined}
      className={`${ROW} ${
        active
          ? "bg-active text-ink [&>svg:not([data-tint])]:text-accent"
          : "text-ink hover:bg-hover [&>svg:not([data-tint])]:text-ink-2"
      }`}
    >
      {children}
    </button>
  );
}

/*
 * The device's calendars, by account: click shows or hides one on the grid, ⌥-click
 * shows only that one (again to show them all). The heading collapses the list.
 */
function CalendarList() {
  const { calendars, device } = useApp();
  const { setDevice } = useSettings();
  if (calendars.length === 0) return null;
  const open = device.showCalendarList;
  const hidden = device.hiddenCalendars;
  return (
    <section className="mt-5" data-calendar-list>
      <button
        type="button"
        onClick={() => setDevice("showCalendarList", !open)}
        aria-expanded={open}
        className="group flex h-7 w-full items-center gap-1 px-2 text-left text-small text-ink-3"
      >
        Calendars
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          absoluteStrokeWidth
          className={open ? "invisible group-hover:visible" : "-rotate-90"}
        />
      </button>
      {open && (
        <ul>
          {byAccount(calendars).flatMap(({ calendars: group }) =>
            group.map((calendar) => {
              const shown = !hidden.includes(calendar.id);
              const color = calendarColor(calendar, device.calendarColors);
              return (
                <li key={calendar.id}>
                  <button
                    type="button"
                    aria-pressed={shown}
                    title={`${calendar.account} · ⌥-click to show only this calendar`}
                    onClick={(event) =>
                      setDevice(
                        "hiddenCalendars",
                        event.altKey
                          ? soloCalendar(calendars, hidden, calendar.id)
                          : withId(hidden, calendar.id, shown),
                      )
                    }
                    className={`${ROW} hover:bg-hover ${shown ? "text-ink" : "text-ink-3"}`}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      <span
                        className="h-3 w-3 rounded-xs"
                        style={
                          shown
                            ? { background: color }
                            : { boxShadow: `inset 0 0 0 1.5px ${color}` }
                        }
                      />
                    </span>
                    <span className="flex-1 truncate">{calendar.title}</span>
                  </button>
                </li>
              );
            }),
          )}
        </ul>
      )}
    </section>
  );
}

interface NameRowProps {
  kind: "project" | "area";
  record: Project | Area;
  active: boolean;
  icon?: React.ReactNode;
}

// A project or area row: click shows it, double-click (or a new one) edits its title.
function NameRow({ kind, record, active, icon }: NameRowProps) {
  const renaming = useUi((state) => state.renaming?.uuid === record.uuid);
  const placeholder = kind === "project" ? "New Project" : "New Area";
  const weight = kind === "area" ? "font-medium" : "";
  if (renaming) {
    return (
      <div className={`${ROW} bg-active text-ink`} data-renaming>
        {icon}
        <NameEditor kind={kind} record={record} placeholder={placeholder} className={weight} />
      </div>
    );
  }
  const list: ListId = kind === "project" ? `project:${record.uuid}` : `area:${record.uuid}`;
  return (
    <Row
      active={active}
      onClick={() => showList(list)}
      onDoubleClick={() => ui.set({ renaming: { uuid: record.uuid, back: list } })}
    >
      {icon}
      <span className={`flex-1 truncate ${weight} ${record.title ? "" : "text-ink-3"}`}>
        {record.title || placeholder}
      </span>
    </Row>
  );
}

/*
 * Inline title editing, as for a to-do: Enter or a click away saves, Escape reverts, and
 * a new project or area left without a title is removed, returning to the list shown
 * before it was made.
 */
function NameEditor({
  kind,
  record,
  placeholder,
  className,
}: {
  kind: "project" | "area";
  record: Project | Area;
  placeholder: string;
  className: string;
}) {
  const actions = useActions();
  const [value, setValue] = useState(record.title);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const title = value.trim();
    const back = ui.get().renaming?.back;
    ui.set({ renaming: null });
    if (save && title && title !== record.title) {
      void (kind === "project"
        ? actions.updateProject(record.uuid, { title }, "Rename Project")
        : actions.updateArea(record.uuid, { title }, "Rename Area"));
    } else if (!record.title && (!save || !title)) {
      if (back) showList(back);
      void (kind === "project"
        ? actions.deleteProject(record.uuid)
        : actions.deleteArea(record.uuid));
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
      placeholder={placeholder}
      aria-label={kind === "project" ? "Project title" : "Area title"}
      className={`min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3 ${className}`}
    />
  );
}

// The footer's +: a menu with New Project, New Area and New Habit, running the same
// commands as ⌘K.
// The menu hangs from the footer (not the button), so it stays inside the sidebar.
function NewListButton() {
  const { commands } = useCal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div ref={ref}>
      <IconButton
        label="New List"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
        className={open ? "bg-active" : ""}
        data-new-list
      >
        <Plus size={16} strokeWidth={1.5} absoluteStrokeWidth />
      </IconButton>
      {open && (
        <PopMenu
          label="New List"
          onClose={close}
          className="bottom-full left-2 mb-1 origin-bottom-left"
          items={[
            {
              id: "project",
              label: "New Project",
              icon: <ProjectRing done={0} total={0} />,
              keys: "mod+alt+n",
              run: () => commands.run("project.new"),
            },
            {
              id: "area",
              label: "New Area",
              icon: <Box size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-ink-2" />,
              run: () => commands.run("area.new"),
            },
            {
              id: "habit",
              label: "New Habit",
              icon: (
                <Repeat size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-ink-2" />
              ),
              run: () => commands.run("habit.new"),
            },
          ]}
        />
      )}
    </div>
  );
}

/*
 * The account chip and, at the far right, the sync dot: hollow when signed out, green
 * when synced, amber when offline or the session has lapsed. Signed out, the chip opens
 * sign-in. Signed in, it names the account, or what sync is waiting on, and opens the
 * account settings (or sign-in again, once the session has lapsed).
 */
function Account({ auth, sync }: { auth: AuthState; sync: SyncStatus }) {
  const signedOut = auth.status === "signedOut";
  const healthy = !signedOut && sync.connected && !sync.needsSignIn;
  const status = signedOut
    ? "Not signed in"
    : sync.needsSignIn
      ? "Sign in again"
      : !sync.connected
        ? sync.pending > 0
          ? `Offline · ${sync.pending} to upload`
          : "Offline"
        : sync.pending > 0
          ? `${sync.pending} to upload`
          : "Synced";
  const label = signedOut ? "Sign in to sync" : status === "Synced" ? auth.email : status;
  return (
    <>
      <button
        type="button"
        onClick={() =>
          signedOut || sync.needsSignIn ? toggleOverlay("signIn") : openSettings("account")
        }
        className="h-6 min-w-0 truncate rounded-full bg-canvas px-2.5 text-small font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--cal-edge)] transition-colors duration-100 tnum hover:bg-hover hover:duration-0 active:bg-active"
        data-account
      >
        {label}
      </button>
      <span className="flex-1" />
      <span
        role="img"
        aria-label={status}
        title={status}
        className={`mr-2 h-2 w-2 shrink-0 rounded-full ${
          signedOut
            ? "shadow-[inset_0_0_0_1.5px_var(--cal-edge-strong)]"
            : healthy
              ? "bg-success"
              : "bg-warning"
        }`}
        data-sync-dot
      />
    </>
  );
}
