import type { CalendarAccess } from "@cal/calendar-source";
import { inList, isOpen } from "@cal/domain";
import {
  Archive,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Inbox,
  Layers,
  Settings,
  Star,
} from "lucide-react";
import type { AuthState, SyncStatus } from "../../../shared/api";
import { useApp } from "../lib/app";
import { SMART_LISTS, SMART_TITLES } from "../lib/lists";
import { type ListId, openSettings, showList, toggleOverlay, useUi } from "../lib/ui";
import { IconButton } from "./ui";

/*
 * Things-style navigation: smart lists with counts (Inbox, the dated lists and Logbook
 * as three groups), then areas and their projects, then a footer with Settings and the
 * account. The top band is the window's drag region; the traffic lights and the pane
 * toggles sit over it.
 */

// Smart lists that open a new group, as in Things.
const GROUP_STARTS: readonly ListId[] = ["today", "logbook"];

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
    <aside className="flex h-full w-full shrink-0 flex-col bg-sidebar" data-dense>
      <div className="drag-region h-13 shrink-0" />

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <ul>
          {SMART_LISTS.map((list) => {
            const Icon = ICONS[list];
            const count = counts(list);
            return (
              <li key={list} className={GROUP_STARTS.includes(list) ? "mt-3" : undefined}>
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

      <div className="flex h-11 shrink-0 items-center gap-1 px-2" data-sidebar-footer>
        <IconButton label="Settings (⌘,)" onClick={() => openSettings()} data-settings>
          <Settings size={16} strokeWidth={1.5} absoluteStrokeWidth />
        </IconButton>
        <Account auth={auth} sync={sync} />
      </div>
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
