import { parseIcs, useCal } from "@cal/app-core";
import type { EventInput } from "@cal/calendar-source";
import { toDayKey, weekday } from "@cal/domain";
import { CalendarPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/app";
import { defaultCalendar, eventWriter } from "../lib/events";
import { dismissToast, showToast } from "../lib/toast";
import { closeOverlay, jumpTo } from "../lib/ui";
import { zonedDayKey } from "../lib/zones";

// An .ics file larger than this is a whole calendar's export, not an invitation.
const MAX_BYTES = 5_000_000;

const isIcs = (file: File) => /\.(ics|ical|ifb)$/i.test(file.name) || file.type === "text/calendar";

const count = (amount: number, word: string) => `${amount} ${word}${amount === 1 ? "" : "s"}`;

/*
 * Dropping an .ics file anywhere on the window adds its events to the calendar new events
 * go to, as one undoable step, and shows the first one's day. The whole window is the
 * target while a file is over it.
 */
export function IcsDrop() {
  const app = useApp();
  const { history } = useCal();
  const [over, setOver] = useState(false);
  const calendar = defaultCalendar(app.calendars, app.device.defaultCalendar);
  const latest = useRef({ app, calendar });
  latest.current = { app, calendar };

  useEffect(() => {
    const holdsFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const onOver = (event: DragEvent) => {
      if (!holdsFiles(event)) return;
      event.preventDefault();
      setOver(true);
    };
    // Leaving the window, not just moving between its elements.
    const onLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) setOver(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!holdsFiles(event)) return;
      event.preventDefault();
      setOver(false);
      void add([...(event.dataTransfer?.files ?? [])]);
    };
    const add = async (files: readonly File[]) => {
      const wanted = files.filter(isIcs);
      if (wanted.length === 0) return showToast("Drop an .ics file to add its events.");
      if (wanted.some((file) => file.size > MAX_BYTES)) {
        return showToast("That calendar file is too big to add.");
      }
      const { app, calendar } = latest.current;
      if (!calendar) return showToast("No calendar here can take new events.");
      const read = (await Promise.all(wanted.map((file) => file.text()))).map(parseIcs);
      const events = read.flatMap((file) => file.events);
      const exceptions = read.reduce((total, file) => total + file.exceptions, 0);
      if (events.length === 0) return showToast("There are no events to add in that file.");
      const inputs: EventInput[] = events.map((event) => ({ ...event, calendarId: calendar.id }));
      const writer = eventWriter(history, app.refreshEvents);
      let made: string[];
      try {
        made = await writer.createAll(inputs, "Add Events");
      } catch (error) {
        showToast(`Couldn't add the events: ${error instanceof Error ? error.message : error}`);
        return;
      }
      const [first] = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      if (first) {
        const start = new Date(first.start);
        const day = first.allDay ? toDayKey(start) : zonedDayKey(start, app.zone);
        closeOverlay();
        jumpTo(
          day,
          app.gridToday,
          !app.account.showWeekends && (weekday(day) === 0 || weekday(day) === 6),
        );
      }
      const added =
        made.length === 1 && events.length === 1
          ? `Added “${first?.title}” to ${calendar.title}`
          : `Added ${count(made.length, "event")} to ${calendar.title}`;
      const notes = [
        made.length < events.length && `${events.length - made.length} couldn't be added`,
        exceptions > 0 && `${count(exceptions, "changed date")} left out`,
      ].filter(Boolean);
      const id = showToast([added, ...notes].join(" · "), {
        label: "Undo",
        run: () => void history.undo(),
      });
      // Undo is for this step alone: another one takes the offer away.
      const stop = history.subscribe(() => {
        stop();
        dismissToast(id);
      });
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [history]);

  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-2 z-50 flex items-center justify-center rounded-xl border-2 border-accent border-dashed">
      <div className="flex items-center gap-2 rounded-lg bg-raised px-4 py-3 text-body font-medium text-ink shadow-float">
        <CalendarPlus size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-accent" />
        {calendar ? `Drop to add to ${calendar.title}` : "Drop to add"}
      </div>
    </div>
  );
}
