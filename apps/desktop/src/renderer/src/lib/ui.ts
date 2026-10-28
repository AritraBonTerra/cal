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

export type Overlay = "palette" | "shortcuts" | "quickEntry" | "signIn" | "when";

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
});

export const useUi = <R>(select: (state: UiState) => R) => useStore(ui, select);

/**
 * Shows `count` days. A week always starts on Monday. Narrower spans start on today
 * when it's in view (week → day lands on today, like Notion), else keep their first day.
 */
export function showDays(count: number, today: DayKey, from?: DayKey) {
  ui.set(({ anchor, view }) => {
    const visible =
      view.kind === "days"
        ? dayRange(anchor, view.count).includes(today)
        : anchor.slice(0, 7) === today.slice(0, 7);
    const base = from ?? (visible ? today : view.kind === "month" ? startOfMonth(anchor) : anchor);
    return { view: { kind: "days", count }, anchor: count === WEEK ? startOfWeek(base) : base };
  });
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

export function goToday(today: DayKey) {
  ui.set(({ view }) => ({
    anchor: view.kind === "days" && view.count === WEEK ? startOfWeek(today) : today,
    flashDay: today,
  }));
}

export const select = (selection: Selection | null) => ui.set({ selection, editing: null });

export function toggleOverlay(overlay: Overlay) {
  ui.set((state) => ({ overlay: state.overlay === overlay ? null : overlay }));
}

export const closeOverlay = () => ui.set({ overlay: null });

export const showList = (list: ListId) => ui.set({ list, tasks: true });
