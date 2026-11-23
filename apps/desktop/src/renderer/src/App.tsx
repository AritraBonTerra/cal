import {
  type AccountSettings,
  type DeviceSettings,
  type Settings,
  useCal,
  useSettings,
} from "@cal/app-core";
import {
  type Area,
  addDays,
  type DayKey,
  dayRange,
  fromDayKey,
  type Project,
  startOfMonth,
  startOfWeek,
  toOffsetIso,
  weekday,
} from "@cal/domain";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAppCommands } from "./commands";
import { AgendaView } from "./components/agenda/AgendaView";
import { EventPopover } from "./components/EventPopover";
import { DaysView } from "./components/grid/DaysView";
import { MonthView } from "./components/grid/MonthView";
import { YearView } from "./components/grid/YearView";
import { IcsDrop } from "./components/IcsDrop";
import { NewHabit } from "./components/NewHabit";
import { Palette } from "./components/Palette";
import { Pane, useSidebarPeek } from "./components/Pane";
import { PaneToggles } from "./components/PaneToggles";
import { QuickEntry } from "./components/QuickEntry";
import { ShortcutSheet } from "./components/ShortcutSheet";
import { Sidebar } from "./components/Sidebar";
import { SignInSheet } from "./components/SignInSheet";
import { SpanDialog } from "./components/SpanDialog";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { TaskPane } from "./components/TaskPane";
import { Toast } from "./components/Toast";
import { Toolbar } from "./components/Toolbar";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { Welcome } from "./components/Welcome";
import { ZonePicker } from "./components/ZonePicker";
import { useAccount, useCalendarAccess } from "./lib/account";
import { AppContext, type AppState } from "./lib/app";
import { useCalendarSet } from "./lib/calendarSets";
import { useCalendars, useChipPalette, useEvents, visibleEvents } from "./lib/calendars";
import { useNow, useToday } from "./lib/clock";
import { useData } from "./lib/data";
import { useDeskPrefs, useReveal } from "./lib/desk";
import { useKeyboard } from "./lib/keyboard";
import { isSmartList } from "./lib/lists";
import { clampWidth } from "./lib/panes";
import { useMode, usePalette } from "./lib/scheme";
import { shortcutText, useKeybindings } from "./lib/shortcuts";
import { setTimeFormat } from "./lib/time";
import { showToast } from "./lib/toast";
import {
  COMPACT_WIDTH,
  followToday,
  type ListId,
  setWeekStart,
  TIGHT_WIDTH,
  ui,
  useUi,
} from "./lib/ui";
import { yearDays } from "./lib/year";
import { deviceZone, zonedDayKey } from "./lib/zones";

// Weeks shown by the month view: the one holding the 1st through the one holding the last day.
const MONTH_ROWS = 6;

// How many days ahead `upcoming` reaches.
const UPCOMING_DAYS = 60;

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

/**
 * When the current list's project or area goes away (its creation undone, or deleted on
 * another device), the pane falls back to Today instead of showing a list that no longer
 * exists. A list is only dropped after it has been seen, so a project made a moment ago,
 * whose row hasn't arrived yet, stays put.
 */
function useListFallback(projects: readonly Project[], areas: readonly Area[]) {
  const list = useUi((state) => state.list);
  const seen = useRef<ListId | null>(null);
  useEffect(() => {
    if (isSmartList(list)) return;
    const uuid = list.slice(list.indexOf(":") + 1);
    const rows = list.startsWith("project:") ? projects : areas;
    if (rows.some((row) => row.uuid === uuid)) seen.current = list;
    else if (seen.current === list) {
      seen.current = null;
      ui.set((state) => ({
        list: "today",
        renaming: null,
        editing: null,
        selection: state.selection?.kind === "task" ? null : state.selection,
      }));
    }
  }, [list, projects, areas]);
}

// Settings that live outside React: the week start the view helpers read, the window
// theme, which Electron applies to `prefers-color-scheme`, and the interface size.
function useSettingsEffects(account: AccountSettings, device: DeviceSettings, today: DayKey) {
  useEffect(() => setWeekStart(account.weekStart, today), [account.weekStart, today]);
  useEffect(() => {
    void window.cal.setTheme(device.theme);
  }, [device.theme]);
  useEffect(() => window.cal.setScale(device.uiScale), [device.uiScale]);
}

// Says so when another app already holds the key for Quick Entry from any app.
function useGlobalKeyNotice() {
  useEffect(
    () =>
      window.cal.onGlobalKeyTaken((binding) =>
        showToast(
          `Another app is using ${shortcutText(binding)}. Pick another key for Quick Entry from Any App in Settings > Shortcuts.`,
        ),
      ),
    [],
  );
}

// When the date rolls over while the window is open, lets the view follow today. A zone
// change also moves the grid's today, but leaves the view where it is.
function useFollowToday(today: DayKey, zone: string, days: readonly DayKey[]) {
  const previous = useRef({ today, zone });
  useEffect(() => {
    const last = previous.current;
    if (last.today === today && last.zone === zone) return;
    if (last.zone === zone) followToday(last.today, today, days);
    previous.current = { today, zone };
  }, [today, zone, days]);
}

/**
 * Opens the Welcome walkthrough the first time Cal runs on this Mac, and records that it
 * has, so it never opens by itself again (Help > Welcome to Cal brings it back). Fixture
 * launches skip it: every one starts from the defaults, and scenes expect a bare window.
 */
function useFirstRun(welcomed: boolean, settings: Settings) {
  useEffect(() => {
    if (welcomed || window.cal.config.fixture) return;
    settings.setDevice("welcomed", true);
    ui.set((state) => (state.overlay === null ? { overlay: "welcome" } : {}));
  }, [welcomed, settings]);
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
  useListFallback(data.projects, data.areas);
  const today = useToday();
  const now = useNow();
  const mode = useMode();
  const colors = usePalette();
  const { account, device } = useSettings();
  useFirstRun(device.welcomed, cal.settings);
  useKeybindings(account.keybindings);
  // Before anything below formats a time, so one render never mixes clocks.
  setTimeFormat(account.timeFormat);
  useSettingsEffects(account, device, today);
  useGlobalKeyNotice();
  const calendars = useCalendars();
  const palette = useChipPalette(calendars, mode, device.calendarColors, colors.canvas);
  const { set: calendarSet, hidden } = useCalendarSet(calendars, device);
  const { auth, sync } = useAccount();
  const { access, request } = useCalendarAccess();
  const view = useUi((state) => state.view);
  const anchor = useUi((state) => state.anchor);
  const sidebar = useUi((state) => state.sidebar);
  const tasks = useUi((state) => state.tasks);
  const overlay = useUi((state) => state.overlay);
  const travelZone = useUi((state) => state.travelZone);
  const zone = travelZone ?? account.primaryZone ?? deviceZone;
  const peek = useSidebarPeek(
    !sidebar && overlay === null,
    clampWidth("sidebar", device.sidebarWidth),
  );
  const gridToday = zonedDayKey(now, zone);

  // The year view's days are its whole year, so one fetch covers every month.
  const days = useMemo(
    () =>
      view.kind === "days"
        ? visibleDays(anchor, view.count, account.showWeekends)
        : view.kind === "year"
          ? yearDays(anchor)
          : view.kind === "agenda"
            ? dayRange(anchor, view.span)
            : dayRange(startOfWeek(startOfMonth(anchor), account.weekStart), MONTH_ROWS * 7),
    [view, anchor, account.showWeekends, account.weekStart],
  );
  useFollowToday(gridToday, zone, days);
  const first = days[0] ?? today;
  const last = days[days.length - 1] ?? today;
  // Another zone's day overlaps two of the Mac's, so the fetch widens by one each side.
  const margin = zone === deviceZone ? 0 : 1;
  const {
    events: fetched,
    loaded: eventsLoaded,
    current: eventsCurrent,
    refresh,
  } = useEvents(
    toOffsetIso(fromDayKey(addDays(first, -margin))),
    toOffsetIso(fromDayKey(addDays(last, 1 + margin))),
  );
  const events = useMemo(
    () => visibleEvents(fetched, hidden, account.showDeclined),
    [fetched, hidden, account.showDeclined],
  );

  // What's ahead, whatever the view shows: the call ⌘J joins, and unanswered invitations.
  const { events: ahead } = useEvents(
    toOffsetIso(fromDayKey(today)),
    toOffsetIso(fromDayKey(addDays(today, UPCOMING_DAYS))),
  );
  const upcoming = useMemo(
    () => visibleEvents(ahead, hidden, account.showDeclined),
    [ahead, hidden, account.showDeclined],
  );

  // Invitations come whatever set is showing; only calendars hidden by hand stay out.
  const invited = useMemo(
    () => visibleEvents(ahead, device.hiddenCalendars, true),
    [ahead, device.hiddenCalendars],
  );
  useDeskPrefs(account, device);
  useReveal(gridToday, account.showWeekends, zone);

  const requestAccess = useCallback(() => void request(), [request]);
  const app: AppState = useMemo(
    () => ({
      data,
      calendars,
      calendarSet,
      hidden,
      palette,
      colors,
      events,
      eventsCurrent,
      upcoming,
      invited,
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
      calendarSet,
      hidden,
      palette,
      colors,
      events,
      eventsCurrent,
      upcoming,
      invited,
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
        <Pane name="sidebar" open={sidebar} peek={peek}>
          <Sidebar auth={auth} sync={sync} access={access} requestAccess={requestAccess} />
        </Pane>
        <Pane name="tasks" open={tasks}>
          <TaskPane />
        </Pane>
        <main className="flex min-w-0 flex-1 flex-col">
          <Toolbar first={first} last={last} />
          {view.kind === "days" ? (
            <DaysView />
          ) : view.kind === "month" ? (
            <MonthView />
          ) : view.kind === "agenda" ? (
            <AgendaView />
          ) : (
            <YearView />
          )}
        </main>
        {/*
          Order matters: Electron builds the draggable area in document order, so a drag
          band rendered after these fixed toggles would swallow their clicks. They come
          after every band, and before the overlays so those still cover them.
        */}
        <PaneToggles />
        <EventPopover />
        <IcsDrop />
        <SpanDialog />
        <Toast />
        {overlay === "palette" && <Palette />}
        {overlay === "shortcuts" && <ShortcutSheet />}
        {overlay === "quickEntry" && <QuickEntry />}
        {overlay === "signIn" && <SignInSheet />}
        {overlay === "newHabit" && <NewHabit />}
        {overlay === "settings" && <SettingsPanel auth={auth} sync={sync} />}
        {overlay === "zonePicker" && <ZonePicker />}
        {overlay === "welcome" && (
          <Welcome auth={auth} access={access} requestAccess={requestAccess} />
        )}
        {/* Last, so it floats over an open panel (Settings > About asks for a check). */}
        <UpdatePrompt />
      </div>
    </AppContext.Provider>
  );
}
