import type { SyncedTable } from "@cal/backend/sync";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { type Actions, createActions } from "./actions";
import { type Command, CommandRegistry } from "./commands";
import type { DataSource } from "./data";
import { History } from "./history";
import { LiveTables } from "./tables";

export interface Cal {
  source: DataSource;
  tables: LiveTables;
  history: History;
  actions: Actions;
  commands: CommandRegistry;
}

// Wires the app's data layer around one DataSource. Create once per window. `now` is
// the app's clock, which actions use for timestamps and "today" (fixed in fixture mode).
export function createCal(source: DataSource, now?: () => Date): Cal {
  const history = new History(source);
  return {
    source,
    tables: new LiveTables(source),
    history,
    actions: createActions(history, now),
    commands: new CommandRegistry(),
  };
}

const CalContext = createContext<Cal | null>(null);

export function CalProvider({ cal, children }: { cal: Cal; children: ReactNode }) {
  return <CalContext.Provider value={cal}>{children}</CalContext.Provider>;
}

export function useCal() {
  const cal = useContext(CalContext);
  if (!cal) throw new Error("useCal needs a <CalProvider>");
  return cal;
}

// Live rows of `table`; re-renders when the table changes. `loaded` is false until the
// first read finishes, so views can tell "empty" from "not yet loaded".
export function useTable<T extends SyncedTable>(table: T) {
  const { tables } = useCal();
  return useSyncExternalStore(
    (listener) => tables.subscribe(table, listener),
    () => tables.snapshot(table),
  );
}

export const useActions = () => useCal().actions;

// Labels of the next undo and redo steps, for menus and toasts.
export function useHistory() {
  const { history } = useCal();
  const nextUndo = useSyncExternalStore(
    (listener) => history.subscribe(listener),
    () => history.nextUndo,
  );
  const nextRedo = useSyncExternalStore(
    (listener) => history.subscribe(listener),
    () => history.nextRedo,
  );
  return { history, nextUndo, nextRedo };
}

/**
 * Registers `commands` while the calling component is mounted. Pass `deps` like
 * useEffect's: the commands are re-registered when they change.
 */
export function useCommands(build: () => readonly Command[], deps: readonly unknown[]) {
  const { commands } = useCal();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `deps` stands in for `build`.
  const list = useMemo(build, deps);
  useEffect(() => commands.register(list), [commands, list]);
}

// Every enabled command, re-read when registrations change (for ⌘K); the `?` sheet
// passes `includeDisabled` to list shortcuts that only apply with a selection.
export function useCommandList(includeDisabled = false) {
  const { commands } = useCal();
  useSyncExternalStore(
    (listener) => commands.subscribe(listener),
    () => commands.version,
  );
  return commands.list(includeDisabled);
}
