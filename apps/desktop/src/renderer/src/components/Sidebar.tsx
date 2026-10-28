import type { CalendarAccess } from "@cal/calendar-source";
import { inList, isOpen } from "@cal/domain";
import {
  Archive,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Inbox,
  Layers,
  PanelLeft,
  Star,
} from "lucide-react";
import type { AuthState, SyncStatus } from "../../../shared/api";
import { useApp } from "../lib/app";
import { SMART_LISTS, SMART_TITLES } from "../lib/lists";
import { type ListId, showList, toggleOverlay, ui, useUi } from "../lib/ui";
import { IconButton } from "./ui";

/*
 * Things-style navigation: smart lists with counts, then areas and their projects, then
 * the account row. The top band is the window's drag region and leaves room for the
 * inset traffic lights.
 */

const ICONS = {
  inbox: Inbox,
  today: Star,
  upcoming: CalendarRange,
  anytime: Layers,
  someday: Archive,
  logbook: CheckCircle2,
};

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

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-sidebar" data-dense>
      <div className="drag-region flex h-13 shrink-0 items-center justify-end pr-2 pl-20">
        <IconButton label="Hide sidebar (⌘\\)" onClick={() => ui.set({ sidebar: false })}>
          <PanelLeft size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </IconButton>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <ul>
          {SMART_LISTS.map((list) => {
            const Icon = ICONS[list];
            const count = counts(list);
            return (
              <li key={list}>
                <Row active={current === list} onClick={() => showList(list)}>
                  <Icon size={16} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" />
                  <span className="flex-1 truncate">{SMART_TITLES[list]}</span>
                  {count > 0 && <span className="text-caption text-ink-3 tnum">{count}</span>}
                </Row>
              </li>
            );
          })}
        </ul>

        {data.areas.map((area) => {
          const projects = data.projects.filter(
            (project) => project.area_uuid === area.uuid && project.completed_at === undefined,
          );
          return (
            <section key={area.uuid} className="mt-5">
              <Row
                active={current === `area:${area.uuid}`}
                onClick={() => showList(`area:${area.uuid}`)}
              >
                <span className="flex-1 truncate font-medium">{area.title}</span>
              </Row>
              <ul>
                {projects.map((project) => {
                  const open = data.tasks.filter(
                    (task) => task.project_uuid === project.uuid && isOpen(task),
                  ).length;
                  const total = data.tasks.filter(
                    (task) => task.project_uuid === project.uuid,
                  ).length;
                  return (
                    <li key={project.uuid}>
                      <Row
                        active={current === `project:${project.uuid}`}
                        onClick={() => showList(`project:${project.uuid}`)}
                      >
                        <Progress done={total - open} total={total} />
                        <span className="flex-1 truncate">{project.title}</span>
                      </Row>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
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

      <AccountRow auth={auth} sync={sync} />
    </aside>
  );
}

function Row({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active || undefined}
      className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-body transition-colors duration-100 hover:duration-0 ${
        active
          ? "bg-active text-ink [&>svg]:text-accent"
          : "text-ink hover:bg-hover [&>svg]:text-ink-2"
      }`}
    >
      {children}
    </button>
  );
}

// Things' project pie: a ring that fills as the project completes.
function Progress({ done, total }: { done: number; total: number }) {
  const fraction = total === 0 ? 0 : done / total;
  const r = 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-accent" aria-hidden>
      <circle cx="8" cy="8" r={r + 1.25} fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={r * 2}
        strokeDasharray={`${c * fraction} ${c}`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

// Signed in: the account and a quiet sync status. Signed out: one line that opens sign-in.
function AccountRow({ auth, sync }: { auth: AuthState; sync: SyncStatus }) {
  if (auth.status === "signedOut") {
    return (
      <button
        type="button"
        onClick={() => toggleOverlay("signIn")}
        className="mx-2 mb-2 flex h-7 items-center gap-2 rounded-md px-2 text-left text-small text-ink-3 hover:bg-hover"
      >
        <span className="h-2 w-2 rounded-full shadow-[inset_0_0_0_1.5px_var(--cal-edge-strong)]" />
        Sign in to sync
      </button>
    );
  }
  const status = sync.needsSignIn
    ? "Sign in again"
    : !sync.connected
      ? sync.pending > 0
        ? `Offline · ${sync.pending} to upload`
        : "Offline"
      : sync.pending > 0
        ? `${sync.pending} to upload`
        : "Synced";
  return (
    <div className="mx-2 mb-2 flex h-9 items-center gap-2 rounded-md px-2 text-small">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          sync.connected && !sync.needsSignIn ? "bg-success" : "bg-warning"
        }`}
      />
      <div className="min-w-0">
        <div className="truncate text-ink">{auth.email}</div>
        <div className="truncate text-caption text-ink-3 tnum">{status}</div>
      </div>
    </div>
  );
}
