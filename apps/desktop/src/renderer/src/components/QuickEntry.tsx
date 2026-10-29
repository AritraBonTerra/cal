import { useActions, useCal } from "@cal/app-core";
import { parseQuickEntry, type Token, type TokenKind } from "@cal/nlp";
import {
  AtSign,
  Bell,
  CalendarDays,
  Clock,
  Flag,
  Folder,
  Globe,
  Hash,
  Hourglass,
  Link2,
  MapPin,
  Moon,
  Repeat,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { type Literal, shiftLiterals } from "../lib/entryText";
import { defaultCalendar, type EntryKind, entryInput, eventWriter } from "../lib/events";
import { showToast } from "../lib/toast";
import { closeOverlay, select } from "../lib/ui";
import { TokenText } from "./TokenText";
import { Keycaps, Overlay, Segmented } from "./ui";

/*
 * ⇧⌘N: one line of natural language. Recognized parts light up as you type and are
 * listed as chips underneath; Enter creates the to-do (and a block when a time was
 * given) or, in Event mode, the calendar event. The Event | To-do switch (⌘1/⌘2)
 * decides; before it's touched, a leading "event " / "task " or the shape of the text
 * does. A click on a highlight or Backspace right after a token keeps that text in the
 * title instead.
 */

const TOKEN_ICONS: Partial<Record<TokenKind, typeof Flag>> = {
  when: CalendarDays,
  date_range: CalendarDays,
  time: Clock,
  time_range: Clock,
  all_day: CalendarDays,
  evening: Moon,
  later: CalendarDays,
  deadline: Flag,
  estimate: Hourglass,
  duration: Hourglass,
  priority: Zap,
  list: Folder,
  tag: Hash,
  recurrence: Repeat,
  reminder: Bell,
  alert: Bell,
  timezone: Globe,
  location: MapPin,
  attendee: AtSign,
  url: Link2,
};

export function QuickEntry() {
  const { data, calendars, account, device, zone, refreshEvents } = useApp();
  const actions = useActions();
  const { history } = useCal();
  const [text, setText] = useState("");
  const [literals, setLiterals] = useState<Literal[]>([]);
  // The switch, once the user has flipped it (⌘1/⌘2 or a click). Until then the parser
  // decides: a leading "event " or "task ", else what the text looks like, else To-do.
  const [chosen, setChosen] = useState<EntryKind | null>(null);
  const writable = calendars.filter((calendar) => calendar.writable);
  const entry = parseQuickEntry(text, {
    now: now(),
    surface: "quick",
    ...(chosen && { kind: chosen }),
    calendars: writable,
    projects: data.projects,
    literals,
    weekStartsOn: account.weekStart,
    defaultEventMin: account.eventMinutes,
    // "9am" is 9am in the zone the grid shows.
    timeZone: zone,
  });
  const kind: EntryKind = entry.kind;
  const chips = entry.tokens.filter((token) => token.applied && token.kind !== "mode");

  const change = (next: string) => {
    setLiterals((current) => shiftLiterals(current, text, next));
    setText(next);
  };
  const unparse = (token: Token) =>
    setLiterals((current) => [...current, { start: token.start, end: token.end }]);

  const submit = async () => {
    if (!entry.title) return;
    closeOverlay();
    if (entry.kind === "task") {
      await actions.createFromEntry(entry);
      return;
    }
    const calendar =
      writable.find((each) => each.id === entry.calendarId) ??
      defaultCalendar(calendars, device.defaultCalendar);
    if (!calendar) {
      showToast("No calendar accepts new events. Allow calendar access in Settings.");
      return;
    }
    try {
      const id = await eventWriter(history, refreshEvents).create(
        entryInput(entry, { calendarId: calendar.id, zone, reminder: account.eventReminder }),
      );
      if (id) select({ kind: "event", id });
    } catch (error) {
      showToast(`Couldn't save the event: ${error instanceof Error ? error.message : error}`);
    }
  };

  const placeholder =
    kind === "event"
      ? "New event, e.g. Lunch with Sam tomorrow 1pm for 1h at Blue Bottle"
      : "New to-do, e.g. Call the movers tomorrow 3pm ~30m !fri /launch";

  return (
    <Overlay onClose={closeOverlay} width={640} label="Quick Entry">
      <div className="flex h-11 items-center border-b border-grid pr-3">
        <div className="min-w-0 flex-1">
          <TokenText
            autoFocus
            value={text}
            tokens={entry.tokens}
            onChange={change}
            onUnparse={unparse}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
              else if (event.key === "Escape") closeOverlay();
              else if (event.metaKey && event.key === "1" && writable.length) setChosen("event");
              else if (event.metaKey && event.key === "2") setChosen("task");
              else return;
              event.preventDefault();
              event.stopPropagation();
            }}
            placeholder={placeholder}
            label={kind === "event" ? "New event" : "New to-do"}
            className="h-11 px-4 text-title-3"
          />
        </div>
        {writable.length > 0 && (
          <Segmented
            value={kind}
            options={[
              { value: "event", label: "Event" },
              { value: "task", label: "To-do" },
            ]}
            onChange={setChosen}
            label="Kind"
          />
        )}
      </div>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 px-4 py-2">
        {chips.length === 0 &&
          (kind === "event" ? (
            <span className="text-small text-ink-3">
              Try <span className="text-ink-2">tomorrow 1pm</span>,{" "}
              <span className="text-ink-2">12:30-1:30</span>,{" "}
              <span className="text-ink-2">for 1h</span>,{" "}
              <span className="text-ink-2">at Blue Bottle</span>,{" "}
              <span className="text-ink-2">every Monday</span>,{" "}
              <span className="text-ink-2">alert 10m</span>
            </span>
          ) : (
            <span className="text-small text-ink-3">
              Try <span className="text-ink-2">tomorrow</span>,{" "}
              <span className="text-ink-2">tonight</span>, <span className="text-ink-2">!fri</span>,{" "}
              <span className="text-ink-2">~45m</span>, <span className="text-ink-2">p1</span>,{" "}
              <span className="text-ink-2">/project</span>
            </span>
          ))}
        {chips.map((token) => {
          const Icon = TOKEN_ICONS[token.kind] ?? CalendarDays;
          return (
            <span
              key={token.start}
              data-chip={token.kind}
              className={`flex h-6 items-center gap-1 rounded-md bg-hover px-2 text-small font-medium tnum ${
                token.pending ? "text-ink-3" : "text-ink-2"
              } ${token.confidence === "guess" ? "underline decoration-dotted underline-offset-[3px]" : ""}`}
              title={
                token.confidence === "guess"
                  ? "A guess; click the text to keep it as is"
                  : undefined
              }
            >
              <Icon size={12} strokeWidth={1.5} absoluteStrokeWidth />
              {token.label}
            </span>
          );
        })}
      </div>
      <footer className="flex h-8 items-center gap-4 border-t border-grid px-4 text-caption text-ink-3">
        <span className="flex items-center gap-1">
          <Keycaps binding="enter" /> {kind === "event" ? "Add event" : "Add to-do"}
        </span>
        {writable.length > 0 && (
          <span className="flex items-center gap-1">
            <Keycaps binding="mod+1" />
            <Keycaps binding="mod+2" /> Event / To-do
          </span>
        )}
        <span className="flex items-center gap-1">
          <Keycaps binding="escape" /> Cancel
        </span>
        {entry.title && <span className="ml-auto truncate text-ink-2">“{entry.title}”</span>}
      </footer>
    </Overlay>
  );
}
