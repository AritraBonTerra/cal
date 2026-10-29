import { type Command, useActions, useCommands, useHistory, useSettings } from "@cal/app-core";
import { addDays, fromDayKey, isOpen, toDayKey, toOffsetIso } from "@cal/domain";
import { useRef } from "react";
import type { AuthState } from "../../shared/api";
import type { AppState } from "./lib/app";
import { now } from "./lib/clock";
import {
  closeEditor,
  defaultCalendar,
  deleteWithUndo,
  editorStore,
  eventWriter,
  nextFreeSlot,
  openCreate,
  openEdit,
  spanFor,
} from "./lib/events";
import { newTaskIn, SMART_LISTS, SMART_TITLES, tasksIn } from "./lib/lists";
import {
  closeOverlay,
  goToday,
  moveView,
  moveWeek,
  openSettings,
  openZonePicker,
  select,
  showDays,
  showList,
  showMonth,
  toggleOverlay,
  ui,
} from "./lib/ui";
import { zonedDayKey } from "./lib/zones";

/*
 * Every command the window offers, registered once. ⌘K, the `?` sheet, the menu bar
 * and key presses all go through this list, so a shortcut is never defined twice.
 * Commands read the UI store and the latest data at run time rather than re-registering
 * on every change.
 */

const NUDGE = 15;

export function useAppCommands(app: AppState, auth: AuthState, requestAccess: () => void) {
  const actions = useActions();
  const { history } = useHistory();
  const { setAccount } = useSettings();
  const latest = useRef(app);
  latest.current = app;

  useCommands(() => {
    const selectedTask = () => {
      const { selection } = ui.get();
      if (selection?.kind !== "task") return undefined;
      return latest.current.data.tasks.find((task) => task.uuid === selection.uuid);
    };
    const selectedBlock = () => {
      const { selection } = ui.get();
      if (selection?.kind !== "block") return undefined;
      return latest.current.data.blocks.find((block) => block.uuid === selection.uuid);
    };
    const hasTask = () => ui.get().selection?.kind === "task" && !ui.get().editing;
    const hasBlock = () => ui.get().selection?.kind === "block";
    const selectedEvent = () => {
      const { selection } = ui.get();
      if (selection?.kind !== "event") return undefined;
      return latest.current.events.find((event) => event.id === selection.id);
    };
    const hasEvent = () => ui.get().selection?.kind === "event" && !editorStore.get().editor;
    const writer = () => eventWriter(history, latest.current.refreshEvents);

    // Moves the task selection within the visible list; with nothing selected, picks an end.
    const step = (direction: 1 | -1) => {
      const { list, selection, tasks } = ui.get();
      if (!tasks) return;
      const rows = tasksIn(list, latest.current.data.tasks, latest.current.today);
      if (rows.length === 0) return;
      const selectedUuid = selection?.kind === "task" ? selection.uuid : null;
      const index = rows.findIndex((task) => task.uuid === selectedUuid);
      const next =
        index === -1
          ? direction === 1
            ? 0
            : rows.length - 1
          : Math.min(rows.length - 1, Math.max(0, index + direction));
      const task = rows[next];
      if (task) select({ kind: "task", uuid: task.uuid });
    };

    const nudgeBlock = (minutes: number, resize: boolean) => {
      const block = selectedBlock();
      if (!block) return;
      const start = new Date(Date.parse(block.start_at) + (resize ? 0 : minutes * 60_000));
      const end = new Date(Date.parse(block.end_at) + minutes * 60_000);
      if (end.getTime() - start.getTime() < NUDGE * 60_000) return;
      void actions.moveBlock(block.uuid, start, end);
    };

    const views: Command[] = [
      {
        id: "view.days.1",
        title: "Day",
        group: "View",
        keys: ["1", "d"],
        aliases: ["1 day"],
        run: () => showDays(1, latest.current.today),
      },
      ...[2, 3, 4, 5, 6, 8, 9].map(
        (count): Command => ({
          id: `view.days.${count}`,
          title: `Show ${count} days`,
          group: "View",
          keys: [String(count)],
          aliases: [String(count)],
          run: () => showDays(count, latest.current.today),
        }),
      ),
      {
        id: "view.days.7",
        title: "Week",
        group: "View",
        keys: ["0", "w"],
        aliases: ["7 days"],
        run: () => showDays(7, latest.current.today),
      },
      { id: "view.month", title: "Month", group: "View", keys: ["m"], run: showMonth },
      ...Array.from({ length: 22 }, (_, index) => index + 10).map(
        (count): Command => ({
          id: `view.days.${count}`,
          title: `Show ${count} days`,
          group: "View",
          aliases: [String(count)],
          run: () => showDays(count, latest.current.today),
        }),
      ),
      {
        id: "view.sidebar",
        title: "Toggle Sidebar",
        group: "View",
        keys: ["mod+\\"],
        run: () => ui.set((state) => ({ sidebar: !state.sidebar })),
      },
      {
        id: "view.tasks",
        title: "Toggle To-Do List",
        group: "View",
        keys: ["mod+/"],
        aliases: ["tasks", "pane"],
        run: () => ui.set((state) => ({ tasks: !state.tasks })),
      },
      {
        id: "view.weekends",
        title: "Toggle Weekends",
        group: "View",
        keys: ["mod+shift+e"],
        aliases: ["hide weekends", "show weekends", "saturday", "sunday"],
        run: () => void setAccount("showWeekends", !latest.current.account.showWeekends),
      },
      {
        id: "view.declined",
        title: "Toggle Declined Events",
        group: "View",
        keys: ["mod+shift+d"],
        aliases: ["hide declined", "show declined"],
        run: () => void setAccount("showDeclined", !latest.current.account.showDeclined),
      },
      {
        id: "zone.add",
        title: "Add Time Zone…",
        group: "View",
        aliases: ["timezone", "time zone column", "world clock"],
        enabled: () => latest.current.account.timeZones.length < 3,
        run: () => openZonePicker({ kind: "add" }),
      },
      {
        id: "zone.travel",
        title: "Travel to Time Zone…",
        group: "View",
        keys: ["z"],
        aliases: ["time travel", "timezone", "view in zone"],
        run: () => {
          if (ui.get().travelZone) ui.set({ travelZone: null });
          else openZonePicker({ kind: "travel" });
        },
      },
      {
        id: "zone.exit",
        title: "Stop Travelling",
        group: "View",
        keys: ["escape"],
        aliases: ["return to my time zone"],
        enabled: () => ui.get().travelZone !== null && ui.get().overlay === null,
        run: () => ui.set({ travelZone: null }),
      },
    ];

    const navigate: Command[] = [
      {
        id: "nav.next",
        title: "Next",
        group: "Navigate",
        keys: ["arrowright"],
        aliases: ["forward"],
        enabled: () => !ui.get().editing,
        run: () => moveView(1),
      },
      {
        id: "nav.prev",
        title: "Previous",
        group: "Navigate",
        keys: ["arrowleft"],
        aliases: ["back"],
        enabled: () => !ui.get().editing,
        run: () => moveView(-1),
      },
      {
        id: "nav.nextWeek",
        title: "Next Week",
        group: "Navigate",
        keys: ["j"],
        run: () => moveWeek(1),
      },
      {
        id: "nav.prevWeek",
        title: "Previous Week",
        group: "Navigate",
        keys: ["k"],
        run: () => moveWeek(-1),
      },
      {
        id: "nav.today",
        title: "Today",
        group: "Navigate",
        keys: ["t"],
        aliases: ["now"],
        run: () => goToday(latest.current.today, latest.current.account.todayKey === "left-align"),
      },
      {
        id: "nav.todayLeft",
        title: "Today, Left-Aligned",
        group: "Navigate",
        keys: ["alt+t"],
        aliases: ["start from today"],
        run: () => goToday(latest.current.today, true),
      },
      ...SMART_LISTS.map(
        (list, index): Command => ({
          id: `list.${list}`,
          title: `Go to ${SMART_TITLES[list]}`,
          group: "Navigate",
          keys: [`mod+${index + 1}`],
          aliases: [list],
          run: () => showList(list),
        }),
      ),
    ];

    const todo: Command[] = [
      {
        id: "task.new",
        title: "New To-Do",
        group: "To-Do",
        keys: ["mod+n"],
        aliases: ["add", "create task"],
        run: () => {
          const { list } = ui.get();
          const { today } = latest.current;
          void actions
            .createTask({ title: "", ...newTaskIn(list, today) })
            .then((uuid) =>
              ui.set({ selection: { kind: "task", uuid }, editing: uuid, tasks: true }),
            );
        },
      },
      {
        id: "task.quickEntry",
        title: "Quick Entry",
        group: "To-Do",
        keys: ["mod+shift+n"],
        aliases: ["natural language"],
        run: () => toggleOverlay("quickEntry"),
      },
      {
        id: "task.complete",
        title: "Complete",
        group: "To-Do",
        keys: [" ", "mod+."],
        aliases: ["mark done", "check"],
        enabled: () => hasTask() || hasBlock(),
        run: () => {
          const task = selectedTask();
          if (task) {
            void actions.setTaskDone(task.uuid, isOpen(task));
            return;
          }
          const block = selectedBlock();
          if (block) void actions.setBlockDone(block, block.done_at === undefined);
        },
      },
      {
        id: "task.edit",
        title: "Edit Title",
        group: "To-Do",
        keys: ["enter"],
        enabled: hasTask,
        run: () =>
          ui.set((state) => ({
            editing: state.selection?.kind === "task" ? state.selection.uuid : null,
          })),
      },
      {
        id: "task.when",
        title: "When…",
        group: "To-Do",
        keys: ["mod+s"],
        aliases: ["schedule", "date"],
        enabled: hasTask,
        run: () => toggleOverlay("when"),
      },
      {
        id: "task.today",
        title: "Move to Today",
        group: "To-Do",
        keys: ["mod+t"],
        enabled: hasTask,
        run: () => {
          const task = selectedTask();
          if (task) void actions.setWhen(task.uuid, "date", latest.current.today);
        },
      },
      {
        id: "task.evening",
        title: "Move to This Evening",
        group: "To-Do",
        keys: ["mod+e"],
        enabled: hasTask,
        run: () => {
          const task = selectedTask();
          if (task) void actions.setWhen(task.uuid, "evening", latest.current.today);
        },
      },
      {
        id: "task.tomorrow",
        title: "Move to Tomorrow",
        group: "To-Do",
        enabled: hasTask,
        run: () => {
          const task = selectedTask();
          if (task) void actions.setWhen(task.uuid, "date", addDays(latest.current.today, 1));
        },
      },
      {
        id: "task.anytime",
        title: "Move to Anytime",
        group: "To-Do",
        keys: ["mod+r"],
        enabled: hasTask,
        run: () => {
          const task = selectedTask();
          if (task) void actions.setWhen(task.uuid, "anytime");
        },
      },
      {
        id: "task.someday",
        title: "Move to Someday",
        group: "To-Do",
        keys: ["mod+o"],
        enabled: hasTask,
        run: () => {
          const task = selectedTask();
          if (task) void actions.setWhen(task.uuid, "someday");
        },
      },
      {
        id: "task.schedule",
        title: "Schedule in Next Free Slot",
        group: "To-Do",
        keys: ["x"],
        aliases: ["time block", "find time"],
        enabled: hasTask,
        run: () => {
          const task = selectedTask();
          if (!task) return;
          // Today's events are fetched here: the view may be showing another week, and
          // anything overlapping today counts, including a meeting that began yesterday.
          const today = toDayKey(now());
          void window.cal.calendar
            .events(toOffsetIso(fromDayKey(today)), toOffsetIso(fromDayKey(addDays(today, 1))))
            .catch(() => [])
            .then((events) =>
              actions.scheduleNext(
                task.uuid,
                events
                  .filter(
                    (event) =>
                      event.busy &&
                      !event.allDay &&
                      !latest.current.device.freeCalendars.includes(event.calendarId),
                  )
                  .map((event) => ({ start: new Date(event.start), end: new Date(event.end) })),
              ),
            );
        },
      },
      {
        id: "task.delete",
        title: "Delete To-Do",
        group: "To-Do",
        keys: ["mod+backspace"],
        enabled: hasTask,
        run: () => {
          const task = selectedTask();
          if (!task) return;
          select(null);
          void actions.deleteTask(task.uuid);
        },
      },
      {
        id: "task.up",
        title: "Previous To-Do",
        group: "To-Do",
        keys: ["arrowup"],
        enabled: () => !hasBlock() && !ui.get().editing && ui.get().tasks,
        run: () => step(-1),
      },
      {
        id: "task.down",
        title: "Next To-Do",
        group: "To-Do",
        keys: ["arrowdown"],
        enabled: () => !hasBlock() && !ui.get().editing && ui.get().tasks,
        run: () => step(1),
      },
    ];

    const calendar: Command[] = [
      {
        id: "event.new",
        title: "New Event",
        group: "Calendar",
        keys: ["c"],
        aliases: ["create event", "add event", "meeting"],
        run: () => {
          const { calendars, device, account, events, data, gridToday, zone } = latest.current;
          const calendar = defaultCalendar(calendars, device.defaultCalendar);
          const busy = [
            ...events.filter((event) => event.busy && !event.allDay),
            ...data.blocks.map((block) => ({ start: block.start_at, end: block.end_at })),
          ].map((span) => ({ start: new Date(span.start), end: new Date(span.end) }));
          const slot = nextFreeSlot(now(), account.eventMinutes, busy);
          closeOverlay();
          // The slot's day in the grid's zone: while travelling, it may be "tomorrow" here.
          if (!latest.current.days.includes(zonedDayKey(slot.start, zone))) goToday(gridToday);
          select(null);
          openCreate(slot, {
            calendarId: calendar?.id ?? "",
            timeZone: zone,
            reminder: account.eventReminder,
            canCreateEvents: calendar !== undefined,
          });
        },
      },
      {
        id: "event.edit",
        title: "Edit Event",
        group: "Calendar",
        keys: ["enter", "e"],
        aliases: ["open event"],
        enabled: hasEvent,
        run: () => {
          const event = selectedEvent();
          if (event) openEdit(event, latest.current.zone);
        },
      },
      {
        id: "event.delete",
        title: "Delete Event",
        group: "Calendar",
        keys: ["backspace", "delete", "mod+backspace"],
        aliases: ["remove event"],
        enabled: hasEvent,
        run: () => {
          const event = selectedEvent();
          if (!event) return;
          const calendar = latest.current.calendars.find((each) => each.id === event.calendarId);
          if (!calendar?.writable) return;
          void spanFor(event, "Delete repeating event").then((span) => {
            if (!span) return;
            select(null);
            closeEditor();
            return deleteWithUndo(event, span, writer(), history);
          });
        },
      },
      {
        id: "block.delete",
        title: "Remove from Calendar",
        group: "Calendar",
        keys: ["backspace", "delete"],
        aliases: ["delete block"],
        enabled: hasBlock,
        run: () => {
          const block = selectedBlock();
          if (!block) return;
          select(null);
          void actions.deleteBlock(block.uuid);
        },
      },
      {
        id: "block.session",
        title: "Done for This Session",
        group: "Calendar",
        aliases: ["block done"],
        enabled: hasBlock,
        run: () => {
          const block = selectedBlock();
          if (block) void actions.setBlockDone(block, block.done_at === undefined, true);
        },
      },
      {
        id: "block.earlier",
        title: "Move Block Earlier",
        group: "Calendar",
        keys: ["arrowup"],
        enabled: hasBlock,
        run: () => nudgeBlock(-NUDGE, false),
      },
      {
        id: "block.later",
        title: "Move Block Later",
        group: "Calendar",
        keys: ["arrowdown"],
        enabled: hasBlock,
        run: () => nudgeBlock(NUDGE, false),
      },
      {
        id: "block.shorter",
        title: "Shorten Block",
        group: "Calendar",
        keys: ["shift+arrowup"],
        enabled: hasBlock,
        run: () => nudgeBlock(-NUDGE, true),
      },
      {
        id: "block.longer",
        title: "Lengthen Block",
        group: "Calendar",
        keys: ["shift+arrowdown"],
        enabled: hasBlock,
        run: () => nudgeBlock(NUDGE, true),
      },
      {
        id: "calendar.access",
        title: "Allow Calendar Access…",
        group: "Calendar",
        run: requestAccess,
      },
      {
        id: "select.clear",
        title: "Deselect",
        group: "Calendar",
        keys: ["escape"],
        enabled: () => ui.get().selection !== null || ui.get().editing !== null,
        run: () => select(null),
      },
    ];

    const general: Command[] = [
      {
        id: "palette.open",
        title: "Command Menu",
        group: "General",
        keys: ["mod+k"],
        aliases: ["search", "actions"],
        run: () => toggleOverlay("palette"),
      },
      {
        id: "help.shortcuts",
        title: "Keyboard Shortcuts",
        group: "General",
        keys: ["?"],
        aliases: ["help", "keys"],
        run: () => toggleOverlay("shortcuts"),
      },
      {
        id: "settings.open",
        title: "Settings…",
        group: "General",
        keys: ["mod+,"],
        aliases: ["preferences", "options", "theme", "time format", "calendars"],
        run: () => openSettings(),
      },
      {
        id: "edit.undo",
        title: "Undo",
        group: "General",
        keys: ["mod+z"],
        run: () => void history.undo(),
      },
      {
        id: "edit.redo",
        title: "Redo",
        group: "General",
        keys: ["mod+shift+z"],
        run: () => void history.redo(),
      },
      {
        id: "account.signIn",
        title: "Sign In…",
        group: "General",
        aliases: ["account", "sync", "log in"],
        enabled: () => auth.status === "signedOut",
        run: () => toggleOverlay("signIn"),
      },
      {
        id: "account.signOut",
        title: "Sign Out",
        group: "General",
        aliases: ["account", "log out"],
        enabled: () => auth.status === "signedIn",
        run: () => {
          closeOverlay();
          void window.cal.auth.signOut();
        },
      },
    ];

    return [...views, ...navigate, ...todo, ...calendar, ...general];
  }, [actions, history, auth.status, requestAccess, setAccount]);
}
