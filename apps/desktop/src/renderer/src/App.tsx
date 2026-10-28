import { useCal } from "@cal/app-core";
import { addDays, dayRange, fromDayKey, startOfMonth, startOfWeek, toOffsetIso } from "@cal/domain";
import { useCallback, useEffect, useMemo } from "react";
import { useAppCommands } from "./commands";
import { DaysView } from "./components/grid/DaysView";
import { MonthView } from "./components/grid/MonthView";
import { Palette } from "./components/Palette";
import { QuickEntry } from "./components/QuickEntry";
import { ShortcutSheet } from "./components/ShortcutSheet";
import { Sidebar } from "./components/Sidebar";
import { SignInSheet } from "./components/SignInSheet";
import { TaskPane } from "./components/TaskPane";
import { Toolbar } from "./components/Toolbar";
import { useAccount, useCalendarAccess } from "./lib/account";
import { AppContext, type AppState } from "./lib/app";
import { useCalendars, useChipPalette, useEvents } from "./lib/calendars";
import { useToday } from "./lib/clock";
import { useData } from "./lib/data";
import { useKeyboard } from "./lib/keyboard";
import { useMode } from "./lib/scheme";
import { COMPACT_WIDTH, TIGHT_WIDTH, ui, useUi } from "./lib/ui";

// Weeks shown by the month view: the one holding the 1st through the one holding the last day.
const MONTH_ROWS = 6;

// Hides the to-do pane on narrow windows and the sidebar on very narrow ones, and
// brings them back when the window grows; the user can still toggle either in between.
function usePaneDefaults() {
  useEffect(() => {
    let compact = window.innerWidth < COMPACT_WIDTH;
    let tight = window.innerWidth < TIGHT_WIDTH;
    ui.set({ tasks: !compact, sidebar: !tight });
    const onResize = () => {
      const nextCompact = window.innerWidth < COMPACT_WIDTH;
      const nextTight = window.innerWidth < TIGHT_WIDTH;
      if (nextCompact !== compact) ui.set({ tasks: !nextCompact });
      if (nextTight !== tight) ui.set({ sidebar: !nextTight });
      compact = nextCompact;
      tight = nextTight;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
}

export function App() {
  const cal = useCal();
  useKeyboard(cal);
  usePaneDefaults();
  const data = useData();
  const today = useToday();
  const mode = useMode();
  const calendars = useCalendars();
  const palette = useChipPalette(calendars, mode);
  const { auth, sync } = useAccount();
  const { access, request } = useCalendarAccess();
  const view = useUi((state) => state.view);
  const anchor = useUi((state) => state.anchor);
  const sidebar = useUi((state) => state.sidebar);
  const tasks = useUi((state) => state.tasks);
  const overlay = useUi((state) => state.overlay);

  const days = useMemo(
    () =>
      view.kind === "days"
        ? dayRange(anchor, view.count)
        : dayRange(startOfWeek(startOfMonth(anchor)), MONTH_ROWS * 7),
    [view, anchor],
  );
  const first = days[0] ?? today;
  const last = days[days.length - 1] ?? today;
  const {
    events,
    loaded: eventsLoaded,
    refresh,
  } = useEvents(toOffsetIso(fromDayKey(first)), toOffsetIso(fromDayKey(addDays(last, 1))));

  const requestAccess = useCallback(() => void request(), [request]);
  const app: AppState = useMemo(
    () => ({ data, calendars, palette, events, refreshEvents: refresh, mode, today, days }),
    [data, calendars, palette, events, refresh, mode, today, days],
  );
  useAppCommands(app, auth, requestAccess);

  return (
    <AppContext.Provider value={app}>
      <div
        className="flex h-screen w-screen overflow-hidden bg-canvas text-body text-ink"
        data-ready={data.loaded && eventsLoaded ? "" : undefined}
      >
        {sidebar && (
          <Sidebar auth={auth} sync={sync} access={access} requestAccess={requestAccess} />
        )}
        {tasks && <TaskPane />}
        <main className="flex min-w-0 flex-1 flex-col">
          <Toolbar first={first} last={last} />
          {view.kind === "days" ? <DaysView /> : <MonthView />}
        </main>
        {overlay === "palette" && <Palette />}
        {overlay === "shortcuts" && <ShortcutSheet />}
        {overlay === "quickEntry" && <QuickEntry />}
        {overlay === "signIn" && <SignInSheet />}
      </div>
    </AppContext.Provider>
  );
}
