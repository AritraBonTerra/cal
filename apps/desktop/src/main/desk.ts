import { readFileSync, writeFileSync } from "node:fs";
import type { DataSource } from "@cal/app-core";
import type { CalendarSource, ExternalEvent } from "@cal/calendar-source";
import { type DayKey, meetingOf, toDayKey, toOffsetIso } from "@cal/domain";
import {
  Menu,
  type MenuItemConstructorOptions,
  Notification,
  nativeImage,
  powerMonitor,
  Tray,
} from "electron";
import type { DeskPrefs } from "../shared/api";
import { TRAY_ICON } from "./trayIcon";
import {
  callKey,
  clockText,
  deskRange,
  menuBarTitle,
  menuModel,
  morningSummary,
  shownEvents,
  startingCalls,
  summaryDue,
} from "./upcoming";

/*
 * Cal outside its window: the menu bar item with the next event and Join, a notification
 * with Join as a call starts, and the morning summary. It lives in the main process, so
 * it keeps going with every window closed. It starts once a window reports its settings.
 */

export interface DeskOptions {
  data: DataSource;
  calendar: CalendarSource;
  now(): Date;
  join(url: string): Promise<unknown>;
  // Shows the main window on `day`, with the event open when there is one.
  reveal(day: DayKey, eventId?: string): void;
  quickEntry(): void;
  // Where the last summary's day is kept, so a relaunch doesn't repeat it.
  file: string;
  // Fixture launches keep their menu and notifications to themselves, for the scripts.
  quiet: boolean;
}

const REFETCH_MIN = 5;

export function createDesk(options: DeskOptions) {
  const { data, calendar, now, join, reveal, quickEntry, file, quiet } = options;
  let prefs: DeskPrefs | undefined;
  let fetched: ExternalEvent[] = [];
  let fetchedAt = 0;
  let tray: Tray | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let soon: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const seen = new Set<string>();
  // Held until dismissed: a collected Notification drops its click handlers.
  const showing = new Set<Notification>();
  // What the scripts read in fixture mode.
  const record: { title: string; items: string[]; notices: string[] } = {
    title: "",
    items: [],
    notices: [],
  };

  const notify = (notice: {
    title: string;
    body: string;
    join?: string;
    day: DayKey;
    eventId?: string;
  }) => {
    if (quiet) record.notices.push(`${notice.title} | ${notice.body}`);
    if (quiet || !Notification.isSupported()) return;
    const url = notice.join;
    const notification = new Notification({
      title: notice.title,
      body: notice.body,
      ...(url && { actions: [{ type: "button" as const, text: "Join" }] }),
    });
    showing.add(notification);
    const done = () => showing.delete(notification);
    notification.on("click", () => {
      done();
      reveal(notice.day, notice.eventId);
    });
    notification.on("action", () => {
      done();
      if (url) void join(url);
    });
    notification.on("close", done);
    notification.on("failed", done);
    notification.show();
  };

  // The local tables with the events the user sees.
  const read = async (events: ExternalEvent[]) => {
    const [tasks, blocks, projects, habits, entries] = await Promise.all([
      data.list("tasks"),
      data.list("time_blocks"),
      data.list("projects"),
      data.list("habits"),
      data.list("habit_entries"),
    ]);
    return { events, tasks, blocks, projects, habits, entries };
  };

  const lastSummary = (): DayKey | undefined => {
    try {
      const saved: { summary?: unknown } = JSON.parse(readFileSync(file, "utf8"));
      return typeof saved.summary === "string" ? saved.summary : undefined;
    } catch {
      return undefined;
    }
  };

  const drawMenu = (desk: Awaited<ReturnType<typeof read>>, at: Date, { hour12 }: DeskPrefs) => {
    const model = menuModel(desk, at, hour12);
    const call = model.join;
    const items: MenuItemConstructorOptions[] = [
      ...(call
        ? [{ label: call.label, click: () => void join(call.url) }, { type: "separator" as const }]
        : []),
      ...(model.rows.length > 0
        ? model.rows.map((row) => ({
            label: row.label,
            click: () => reveal(model.day, row.eventId),
          }))
        : [{ label: "Nothing else today", enabled: false }]),
      { type: "separator" },
      { label: "Quick Entry…", click: quickEntry },
      { label: "Open Cal", click: () => reveal(model.day) },
      { role: "quit" },
    ];
    record.title = menuBarTitle(desk.events, at, hour12);
    record.items = items.map((item) => item.label ?? item.role ?? "—");
    if (quiet) return;
    if (!tray) {
      const icon = nativeImage.createEmpty();
      for (const { scaleFactor, dataURL } of TRAY_ICON)
        icon.addRepresentation({ scaleFactor, dataURL });
      icon.setTemplateImage(true);
      tray = new Tray(icon);
    }
    tray.setTitle(record.title ? ` ${record.title}` : "", { fontType: "monospacedDigit" });
    tray.setContextMenu(Menu.buildFromTemplate(items));
  };

  // Brings everything up to date. Runs each minute, and soon after anything changes.
  const refresh = async (refetch: boolean) => {
    const at = now();
    if (refetch || at.getTime() - fetchedAt >= REFETCH_MIN * 60_000) {
      const { start, end } = deskRange(at);
      try {
        fetched = await calendar.events(toOffsetIso(start), toOffsetIso(end));
      } catch {
        // Without calendar access there are no events.
        fetched = [];
      }
      fetchedAt = at.getTime();
    }
    if (!prefs || stopped) return;
    const desk = await read(shownEvents(fetched, prefs, at));
    if (stopped) return;
    if (prefs.menuBar) drawMenu(desk, at, prefs);
    else {
      tray?.destroy();
      tray = undefined;
    }
    if (prefs.callNotices) {
      for (const event of startingCalls(desk.events, at, seen)) {
        seen.add(callKey(event));
        const meeting = meetingOf(event);
        notify({
          title: event.title,
          body: `${clockText(new Date(event.start), prefs.hour12)} · ${meeting?.service ?? "Call"}`,
          join: meeting?.url,
          day: toDayKey(at),
          eventId: event.id,
        });
      }
    }
    if (summaryDue(prefs.morningSummary, at, lastSummary())) {
      // Recorded first: a summary that can't be shown isn't worth repeating every minute.
      writeFileSync(file, JSON.stringify({ summary: toDayKey(at) }));
      notify({ ...morningSummary(desk, at, prefs.hour12), day: toDayKey(at) });
    }
  };

  // One refresh at a time. What's asked for meanwhile runs after it, as one, so an older
  // read can't draw over a newer one, and a wanted refetch is never lost.
  let running = false;
  let wanted: { refetch: boolean } | undefined;
  const run = async (refetch: boolean) => {
    if (running) {
      wanted = { refetch: refetch || wanted?.refetch === true };
      return;
    }
    running = true;
    let next: { refetch: boolean } | undefined = { refetch };
    while (next && !stopped) {
      wanted = undefined;
      // A failure (a database closing on quit) leaves the menu as it was until the next tick.
      await refresh(next.refetch).catch(() => undefined);
      next = wanted;
    }
    running = false;
  };
  let soonRefetch = false;
  const runSoon = (refetch: boolean) => {
    if (stopped) return;
    soonRefetch ||= refetch;
    clearTimeout(soon);
    soon = setTimeout(() => {
      const wants = soonRefetch;
      soonRefetch = false;
      void run(wants);
    }, 300);
  };
  const tick = () => {
    void run(false);
    timer = setTimeout(tick, 60_000 - (now().getTime() % 60_000) + 50);
  };

  return {
    record,
    // The menu bar item, while it shows.
    tray: () => tray,
    // Takes the window's settings; the first call starts the clock.
    setPrefs(next: DeskPrefs) {
      const first = prefs === undefined;
      prefs = next;
      if (!first) return runSoon(false);
      calendar.onChange(() => runSoon(true));
      data.subscribe(() => runSoon(false));
      powerMonitor.on("resume", () => runSoon(true));
      tick();
    },
    // After a write from a window: fixture calendars report none on their own.
    changed: () => runSoon(true),
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(soon);
      tray?.destroy();
      tray = undefined;
    },
  };
}
