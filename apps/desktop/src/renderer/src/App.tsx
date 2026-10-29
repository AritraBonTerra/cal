import { type AccountSettings, type DeviceSettings, useCal, useSettings } from "@cal/app-core";
import {
  addDays,
  dayRange,
  fromDayKey,
  startOfMonth,
  startOfWeek,
  toOffsetIso,
  weekday,
} from "@cal/domain";
import { useCallback, useEffect, useMemo } from "react";
import { useAppCommands } from "./commands";
import { DaysView } from "./components/grid/DaysView";
import { MonthView } from "./components/grid/MonthView";
import { Palette } from "./components/Palette";
import { QuickEntry } from "./components/QuickEntry";
import { ShortcutSheet } from "./components/ShortcutSheet";
import { Sidebar } from "./components/Sidebar";
import { SignInSheet } from "./components/SignInSheet";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { TaskPane } from "./components/TaskPane";
import { Toolbar } from "./components/Toolbar";
import { ZonePicker } from "./components/ZonePicker";
import { useAccount, useCalendarAccess } from "./lib/account";
import { AppContext, type AppState } from "./lib/app";
import { useCalendars, useChipPalette, useEvents } from "./lib/calendars";
import { useNow, useToday } from "./lib/clock";
import { useData } from "./lib/data";
import { useKeyboard } from "./lib/keyboard";
import { useMode } from "./lib/scheme";
import { setTimeFormat } from "./lib/time";
import { COMPACT_WIDTH, setWeekStart, TIGHT_WIDTH, ui, useUi } from "./lib/ui";
import { deviceZone, zonedDayKey } from "./lib/zones";

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

// Settings that live outside React: the week start the view helpers read, and the
// window theme, which Electron applies to `prefers-color-scheme`.
function useSettingsEffects(account: AccountSettings, device: DeviceSettings) {
  useEffect(() => setWeekStart(account.weekStart), [account.weekStart]);
  useEffect(() => {
    void window.cal.setTheme(device.theme);
  }, [device.theme]);
}

const isWeekend = (day: string) => weekday(day) === 0 || weekday(day) === 6;

/**
 * The days a days view shows from `anchor`. With weekends hidden, a week keeps its
 * weekdays (Mon–Fri) and shorter spans skip over weekends; a single day always shows.
 */
function visibleDays(anchor: string, count: number, showWeekends: boolean) {
  const range = dayRange(anchor, count);
  if (showWeekends || count === 1) return range;
  if (count === 7) return range.filter((day) => !isWeekend(day));
  const days = [anchor];
  for (let day = addDays(anchor, 1); days.length < count; day = addDays(day, 1)) {
    if (!isWeekend(day)) days.push(day);
  }
  return days;
}

export function App() {
  const cal = useCal();
  useKeyboard(cal);
  usePaneDefaults();
  const data = useData();
  const today = useToday();
  const now = useNow();
  const mode = useMode();
  const { account, device } = useSettings();
  // Before anything below formats a time, so one render never mixes clocks.
  setTimeFormat(account.timeFormat);
  useSettingsEffects(account, device);
  const calendars = useCalendars();
  const palette = useChipPalette(calendars, mode, device.calendarColors);
  const { auth, sync } = useAccount();
  const { access, request } = useCalendarAccess();
  const view = useUi((state) => state.view);
  const anchor = useUi((state) => state.anchor);
  const sidebar = useUi((state) => state.sidebar);
  const tasks = useUi((state) => state.tasks);
  const overlay = useUi((state) => state.overlay);
  const travelZone = useUi((state) => state.travelZone);
  const zone = travelZone ?? account.primaryZone ?? deviceZone;
  const gridToday = zonedDayKey(now, zone);

  const days = useMemo(
    () =>
      view.kind === "days"
        ? visibleDays(anchor, view.count, account.showWeekends)
        : dayRange(startOfWeek(startOfMonth(anchor), account.weekStart), MONTH_ROWS * 7),
    [view, anchor, account.showWeekends, account.weekStart],
  );
  const first = days[0] ?? today;
  const last = days[days.length - 1] ?? today;
  // Another zone's day overlaps two of the Mac's, so the fetch widens by one each side.
  const margin = zone === deviceZone ? 0 : 1;
  const {
    events: fetched,
    loaded: eventsLoaded,
    refresh,
  } = useEvents(
    toOffsetIso(fromDayKey(addDays(first, -margin))),
    toOffsetIso(fromDayKey(addDays(last, 1 + margin))),
  );
  const events = useMemo(() => {
    const hidden = new Set(device.hiddenCalendars);
    return fetched.filter(
      (event) =>
        !hidden.has(event.calendarId) && (account.showDeclined || event.myStatus !== "declined"),
    );
  }, [fetched, device.hiddenCalendars, account.showDeclined]);

  const requestAccess = useCallback(() => void request(), [request]);
  const app: AppState = useMemo(
    () => ({
      data,
      calendars,
      palette,
      events,
      refreshEvents: refresh,
      mode,
      today,
      days,
      account,
      device,
      zone,
      gridToday,
    }),
    [
      data,
      calendars,
      palette,
      events,
      refresh,
      mode,
      today,
      days,
      account,
      device,
      zone,
      gridToday,
    ],
  );
  useAppCommands(app, auth, requestAccess);

  return (
    <AppContext.Provider value={app}>
      <div
        className="flex h-screen w-screen overflow-hidden bg-canvas text-body text-ink"
        data-ready={data.loaded && eventsLoaded ? "" : undefined}
      >
        <Pane open={sidebar} width={224} name="sidebar">
          <Sidebar auth={auth} sync={sync} access={access} requestAccess={requestAccess} />
        </Pane>
        <Pane open={tasks} width={320} name="tasks">
          <TaskPane />
        </Pane>
        <main className="flex min-w-0 flex-1 flex-col">
          <Toolbar first={first} last={last} />
          {view.kind === "days" ? <DaysView /> : <MonthView />}
        </main>
        {overlay === "palette" && <Palette />}
        {overlay === "shortcuts" && <ShortcutSheet />}
        {overlay === "quickEntry" && <QuickEntry />}
        {overlay === "signIn" && <SignInSheet />}
        {overlay === "settings" && <SettingsPanel auth={auth} sync={sync} />}
        {overlay === "zonePicker" && <ZonePicker />}
      </div>
    </AppContext.Provider>
  );
}

/**
 * A side pane that slides open and closed by width (200ms ease-out; instant under
 * reduced motion). Its content keeps a fixed width and stays mounted, so scroll
 * positions survive a toggle and the calendar beside it only ever changes width.
 */
function Pane({
  open,
  width,
  name,
  children,
}: {
  open: boolean;
  width: number;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pane-slide shrink-0 overflow-hidden"
      style={{ width: open ? width : 0 }}
      aria-hidden={!open}
      inert={!open}
      data-pane={name}
      data-open={open ? "" : undefined}
    >
      <div className="h-full" style={{ width }}>
        {children}
      </div>
    </div>
  );
}
