import {
  addDays,
  addMonths,
  type DayKey,
  dayRange,
  type SmartList,
  startOfMonth,
  startOfWeek,
  toDayKey,
} from "@cal/domain";
import { createStore, useStore } from "./store";

/*
 * What the window is showing: the calendar view and its first day, which list the
 * to-do pane shows, what's selected, and which overlay is open. Views read it with
 * `useUi`; commands and pointer handlers write it through the helpers below.
 */

export type View = { kind: "days"; count: number } | { kind: "month" };

// A sidebar entry: a smart list, or one project or area.
export type ListId = SmartList | `project:${string}` | `area:${string}`;

export type Selection =
  | { kind: "task"; uuid: string }
  | { kind: "block"; uuid: string }
  | { kind: "event"; id: string };

export type Overlay =
  | "palette"
  | "shortcuts"
  | "quickEntry"
  | "signIn"
  | "when"
  | "settings"
  | "zonePicker";

export type SettingsSection = "general" | "grid" | "zones" | "calendars" | "account";

// Why the zone picker is open: to add a column, swap the zone of column `index` (or
// the primary zone when `index` is absent), travel (`Z`), or set an event's zone.
export type ZonePickerPurpose =
  | { kind: "add" }
  | { kind: "change"; index?: number }
  | { kind: "travel" }
  | { kind: "event" };

export interface UiState {
  view: View;
  // First visible day (days view) or any day of the visible month.
  anchor: DayKey;
  sidebar: boolean;
  tasks: boolean;
  list: ListId;
  selection: Selection | null;
  overlay: Overlay | null;
  // The task whose title is being edited inline.
  editing: string | null;
  // Set after a jump (T, `.`) so the grid can flash the target day once.
  flashDay: DayKey | null;
  // First day of the week (0 = Sunday), mirrored from the account setting so view
  // helpers can read it without a settings handle.
  weekStart: number;
  settingsSection: SettingsSection;
  zonePicker: ZonePickerPurpose;
  // The zone the grid shows while travelling (`Z`); null when not travelling.
  travelZone: string | null;
}

const WEEK = 7;

export const ui = createStore<UiState>({
  view: { kind: "days", count: WEEK },
  anchor: startOfWeek(toDayKey(new Date())),
  sidebar: true,
  tasks: true,
  list: "today",
  selection: null,
  overlay: null,
  editing: null,
  flashDay: null,
  weekStart: 1,
  settingsSection: "general",
  zonePicker: { kind: "add" },
  travelZone: null,
});

export const useUi = <R>(select: (state: UiState) => R) => useStore(ui, select);

/**
 * Shows `count` days. A week starts on the configured weekday. Narrower spans start on
 * today when it's in view (week → day lands on today, like Notion), else keep their
 * first day.
 */
export function showDays(count: number, today: DayKey, from?: DayKey) {
  ui.set(({ anchor, view, weekStart }) => {
    const visible =
      view.kind === "days"
        ? dayRange(anchor, view.count).includes(today)
        : anchor.slice(0, 7) === today.slice(0, 7);
    const base = from ?? (visible ? today : view.kind === "month" ? startOfMonth(anchor) : anchor);
    return {
      view: { kind: "days", count },
      anchor: count === WEEK ? startOfWeek(base, weekStart) : base,
    };
  });
}

// Applies a new first day of the week, re-aligning the week view to it.
export function setWeekStart(weekStart: number) {
  ui.set(({ view, anchor }) => ({
    weekStart,
    anchor: view.kind === "days" && view.count === WEEK ? startOfWeek(anchor, weekStart) : anchor,
  }));
}

// Window-size defaults: panes hide on narrow windows and come back when there's room.
export const COMPACT_WIDTH = 1100;
export const TIGHT_WIDTH = 900;

export function showMonth() {
  ui.set({ view: { kind: "month" } });
}

// Moves by the visible span: N days, or a month.
export function moveView(direction: 1 | -1) {
  ui.set(({ view, anchor }) => ({
    anchor:
      view.kind === "month"
        ? addMonths(anchor, direction)
        : addDays(anchor, direction * view.count),
  }));
}

export function moveWeek(direction: 1 | -1) {
  ui.set(({ anchor }) => ({ anchor: addDays(anchor, direction * WEEK) }));
}

// `T`: jump to today. `leftAlign` keeps the span but puts today first (also ⌥T).
export function goToday(today: DayKey, leftAlign = false) {
  ui.set(({ view, weekStart }) => ({
    anchor:
      view.kind === "days" && view.count === WEEK && !leftAlign
        ? startOfWeek(today, weekStart)
        : today,
    flashDay: today,
  }));
}

export const select = (selection: Selection | null) => ui.set({ selection, editing: null });

export function toggleOverlay(overlay: Overlay) {
  ui.set((state) => ({ overlay: state.overlay === overlay ? null : overlay }));
}

export const closeOverlay = () => ui.set({ overlay: null });

export const openSettings = (section?: SettingsSection) =>
  ui.set((state) => ({ overlay: "settings", settingsSection: section ?? state.settingsSection }));

export const openZonePicker = (zonePicker: ZonePickerPurpose) =>
  ui.set({ overlay: "zonePicker", zonePicker });

// Switching lists drops a task selection, since the row it points at is no longer shown.
export const showList = (list: ListId) =>
  ui.set((state) => ({
    list,
    tasks: true,
    selection: state.selection?.kind === "task" ? null : state.selection,
    editing: null,
  }));
