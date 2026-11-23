import { pendingInvitations, useCommands } from "@cal/app-core";
import type { ExternalEvent } from "@cal/calendar-source";
import { toDayKey, weekday } from "@cal/domain";
import { ArrowUpRight, Mail } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useApp } from "../lib/app";
import { graphite } from "../lib/calendars";
import { useNow } from "../lib/clock";
import { openEdit } from "../lib/events";
import { formatMinutes, formatRelativeDay } from "../lib/time";
import { showToast } from "../lib/toast";
import { jumpTo, select } from "../lib/ui";
import { zonedDayKey, zonedMinutes } from "../lib/zones";
import { useDismiss } from "./Menu";
import { IconButton } from "./ui";

/*
 * The toolbar's envelope, there only while an invitation waits for an answer. It lists
 * them, soonest first: a click shows the event, and Reply opens it in Apple Calendar,
 * since nothing on the Mac lets Cal answer for you. Once you have, the calendar reports
 * the change and the invitation leaves the list.
 */
export function Invitations() {
  const { invited } = useApp();
  const now = useNow();
  const pending = useMemo(() => pendingInvitations(invited, now), [invited, now]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const any = pending.length > 0;
  useCommands(
    () => [
      {
        id: "event.invitations",
        title: "Unanswered Invitations",
        group: "Calendar",
        when: "An invitation waits for an answer",
        aliases: ["invites", "rsvp", "reply"],
        enabled: () => any,
        run: () => setOpen(true),
      },
    ],
    [any],
  );
  if (!any) return null;
  const label = `${pending.length} unanswered ${pending.length === 1 ? "invitation" : "invitations"}`;
  return (
    <div ref={ref} className="no-drag relative">
      <IconButton
        label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative"
        data-invitations
      >
        <Mail size={16} strokeWidth={1.5} absoluteStrokeWidth />
        <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
      </IconButton>
      {open && (
        <div
          ref={focusFirst}
          role="dialog"
          aria-label="Unanswered invitations"
          // Keys stay in the list, so Return never reaches the window's commands.
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Escape") return;
            event.preventDefault();
            setOpen(false);
          }}
          className="pop-in absolute top-8 right-0 z-30 flex max-h-96 w-80 origin-top-right flex-col overflow-y-auto rounded-lg bg-raised p-1 shadow-float"
        >
          {pending.map((event) => (
            <Invitation key={event.id} event={event} onClose={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

// Puts the keyboard on the first invitation as the list opens.
const focusFirst = (list: HTMLDivElement | null) => list?.querySelector("button")?.focus();

function Invitation({ event, onClose }: { event: ExternalEvent; onClose: () => void }) {
  const { palette, mode, zone, gridToday, account } = useApp();
  const start = new Date(event.start);
  // All-day events keep to this Mac's days; timed ones show in the grid's zone.
  const day = event.allDay ? toDayKey(start) : zonedDayKey(start, zone);
  const from = event.attendees?.find((attendee) => attendee.organizer);
  const when = event.allDay
    ? formatRelativeDay(day, gridToday)
    : `${formatRelativeDay(day, gridToday)} ${formatMinutes(zonedMinutes(start, zone))}`;
  return (
    <div className="flex items-center gap-2 rounded-md pr-1 hover:bg-hover">
      <button
        type="button"
        onClick={() => {
          onClose();
          jumpTo(
            day,
            gridToday,
            !account.showWeekends && (weekday(day) === 0 || weekday(day) === 6),
          );
          select({ kind: "event", id: event.id });
          openEdit(event, zone);
        }}
        className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left"
      >
        <span
          className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
          style={{ background: (palette.get(event.calendarId) ?? graphite(mode)).bar }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body text-ink">{event.title}</span>
          <span className="block truncate text-small text-ink-3 tnum">
            {[when, from && (from.name ?? from.email)].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          onClose();
          const { itemId = event.id, start, allDay } = event;
          const recurring = event.recurring || event.detached === true;
          window.cal
            .openInCalendar({ itemId, start, recurring, allDay })
            .catch(() => showToast("Couldn't open Apple Calendar."));
        }}
        title="Answer in Apple Calendar"
        className="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-small font-medium text-accent hover:bg-active"
      >
        Reply
        <ArrowUpRight size={12} strokeWidth={1.5} absoluteStrokeWidth />
      </button>
    </div>
  );
}
