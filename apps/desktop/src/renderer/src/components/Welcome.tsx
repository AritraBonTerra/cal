import type { CalendarAccess } from "@cal/calendar-source";
import { addDays, type DayKey, type DayStatus } from "@cal/domain";
import { type ChipColors, chipColors, habitColors } from "@cal/theme";
import { CalendarDays, Check, Clock, Flag, Hourglass, Star, X } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { type AuthState, CAPTURE_COMMAND } from "../../../shared/api";
import { useApp } from "../lib/app";
import { graphite } from "../lib/calendars";
import { isMac } from "../lib/keyboard";
import { useShortcut, useShortcuts } from "../lib/shortcuts";
import {
  dayNumber,
  formatHour,
  formatMinuteRange,
  formatMinutes,
  formatWeekday,
} from "../lib/time";
import { closeOverlay, toggleOverlay } from "../lib/ui";
import { HabitRing } from "./habitRing";
import { IconButton, Keycaps, Overlay } from "./ui";

/*
 * Welcome to Cal: a six-step walkthrough of calendars, to-dos, planning by drag, habits,
 * shortcuts and sync. It opens by itself the first time Cal runs on a Mac (see
 * useFirstRun in App) and any time after from Help > Welcome to Cal or ⌘K. Each step is
 * a small picture drawn from the app's own pieces over a title and a few lines; the
 * calendar and sync steps also carry the real button, so the walkthrough sets Cal up as
 * it explains it. ← and → step through, Return presses the focused button (Next unless
 * you Tab elsewhere; Tab stays inside the walkthrough). Escape, the × in the corner (left on the Mac) or
 * a click outside closes it at any step; Settings > General shows it again. Menu shortcuts
 * that would change what's behind it are held off (see OVER_WELCOME in lib/keyboard). Shortcuts shown are the ones in effect, so a
 * rebound key reads right.
 */

interface WelcomeProps {
  auth: AuthState;
  access: CalendarAccess;
  requestAccess: () => void;
}

// Hues the pictures use, from the same set projects and habits draw theirs from.
const BLUE = 255;
const GREEN = 150;
const PURPLE = 300;
const AMBER = 60;

// The picture's sample to-dos; the second is the one dragged, scheduled and synced.
const TODOS = ["Write launch post", "Review pricing page", "Book flights"] as const;
const DRAGGED = TODOS[1];

const secondaryButton =
  "flex h-7 items-center gap-1.5 rounded-md bg-canvas px-3 text-small font-medium text-ink shadow-[inset_0_0_0_1px_var(--cal-edge)] hover:bg-hover active:bg-active";

// A surface inside a picture: canvas with a hairline edge, running off the stage's bottom.
const card = "absolute bottom-0 rounded-t-lg bg-canvas shadow-[0_0_0_1px_var(--cal-edge)]";

// Hour lines `step` px apart, as the grid draws them.
const hourLines = (step: number): CSSProperties => ({
  backgroundImage: `repeating-linear-gradient(to bottom, var(--cal-grid) 0 1px, transparent 1px ${step}px)`,
});

// A command's shortcut in effect as keycaps set into a sentence; nothing when unbound.
// The walkthrough's text runs on 22px lines so an 18px keycap never pushes a line apart.
function Key({ binding }: { binding: string | null }) {
  return binding ? <Keycaps binding={binding} className="mx-0.5 align-middle" /> : null;
}

// The five days around today as column headers, today with the grid's red badge.
function DayRow({ today }: { today: DayKey }) {
  return (
    <div className="flex h-8 border-b border-grid">
      {[-2, -1, 0, 1, 2].map((offset) => {
        const day = addDays(today, offset);
        return (
          <div key={day} className="flex min-w-0 flex-1 items-center gap-1.5 px-2">
            <span
              className={`text-caption ${offset === 0 ? "font-medium text-now" : "text-ink-2"}`}
            >
              {formatWeekday(day)}
            </span>
            <span
              className={`text-small font-medium tnum ${
                offset === 0
                  ? "flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-now px-1 text-white"
                  : "text-ink"
              }`}
            >
              {dayNumber(day)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// An event chip as the grid draws it: pale fill, 3px bar, same-hue title.
function ArtEvent({
  title,
  colors,
  top,
  height,
}: {
  title: string;
  colors: ChipColors;
  top: number;
  height: number;
}) {
  return (
    <div
      className="absolute inset-x-0.5 overflow-hidden rounded-sm border-l-[3px] pl-1.5 pt-0.5"
      style={{ top, height: height - 1, background: colors.fill, borderColor: colors.bar }}
    >
      <div className="truncate text-caption font-medium" style={{ color: colors.title }}>
        {title}
      </div>
    </div>
  );
}

// The to-do checkbox, drawn only: pictures hold nothing that can be pressed.
function ArtCheckbox({ checked = false, size = 14 }: { checked?: boolean; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xs ${
        checked
          ? "bg-accent text-white"
          : "bg-canvas shadow-[inset_0_0_0_1.5px_var(--cal-edge-strong)]"
      }`}
      style={{ width: size, height: size }}
    >
      {checked && <Check size={size - 4} strokeWidth={3} absoluteStrokeWidth />}
    </span>
  );
}

function ArtTodo({ title, done = false }: { title: string; done?: boolean }) {
  return (
    <div className="flex h-7 items-center gap-2.5 px-2">
      <ArtCheckbox checked={done} />
      <span className={`truncate ${done ? "text-ink-3 line-through" : "text-ink"}`}>{title}</span>
    </div>
  );
}

// The week's events by column, as [title, calendar hue, top, height] on a 32px hour.
const WEEK: readonly (readonly [string, number, number, number])[][] = [
  [
    ["Standup", BLUE, 8, 20],
    ["Design review", PURPLE, 72, 44],
  ],
  [
    ["Standup", BLUE, 8, 20],
    ["Lunch with Maya", GREEN, 56, 36],
  ],
  [
    ["Standup", BLUE, 8, 20],
    ["Dentist", AMBER, 96, 28],
  ],
  [
    ["Standup", BLUE, 8, 20],
    ["Sprint planning", PURPLE, 40, 60],
  ],
  [
    ["Standup", BLUE, 8, 20],
    ["Flight to SFO", AMBER, 80, 80],
  ],
];

// A week of events: gray until Cal can read the calendars, in color once it can.
function CalendarsArt({ access }: WelcomeProps) {
  const { mode, today } = useApp();
  const connected = access === "fullAccess";
  return (
    <div className={`${card} inset-x-14 top-7 flex flex-col`}>
      <DayRow today={today} />
      <div className="flex min-h-0 flex-1" style={hourLines(32)}>
        {WEEK.map((events, column) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the columns are their positions.
            key={column}
            className="relative min-w-0 flex-1 border-grid border-l first:border-l-0"
          >
            {events.map(([title, hue, top, height]) => (
              <ArtEvent
                key={title}
                title={title}
                colors={connected ? chipColors(hue, mode) : graphite(mode)}
                top={top}
                height={height}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const ENTRY_CHIPS = [
  { Icon: CalendarDays, label: () => "Tomorrow" },
  { Icon: Clock, label: () => formatMinutes(15 * 60) },
  { Icon: Hourglass, label: () => "30 min" },
  { Icon: Flag, label: () => "Due Fri" },
] as const;

// Quick Entry mid-sentence: the parts it understood lit up, and listed underneath.
function EntryArt() {
  const token = "rounded-xs bg-accent-soft text-accent";
  return (
    <div className="absolute inset-x-20 top-[50px] rounded-xl bg-raised shadow-float">
      <div className="flex h-11 items-center px-4 text-title-3 text-ink">
        <span className="whitespace-pre">
          Call the movers <span className={token}>tomorrow 3pm</span>{" "}
          <span className={token}>~30m</span> <span className={token}>!fri</span>
        </span>
        <span className="ml-px h-[18px] w-px bg-ink" />
      </div>
      <div className="flex h-10 items-center gap-1.5 px-4">
        {ENTRY_CHIPS.map(({ Icon, label }) => (
          <span
            key={label()}
            className="flex h-6 items-center gap-1 rounded-md bg-hover px-2 text-small font-medium text-ink-2 tnum"
          >
            <Icon size={12} strokeWidth={1.5} absoluteStrokeWidth />
            {label()}
          </span>
        ))}
      </div>
      <div className="flex h-8 items-center gap-1 border-grid border-t px-4 text-caption text-ink-3">
        <Keycaps binding="enter" /> Add to-do
      </div>
    </div>
  );
}

// Where the dragged to-do starts (its row in the list) and the slot it lands in, in
// stage px. The drag in styles.css travels the difference.
const ROW_AT = { x: 52, y: 92 };
const SLOT_AT = { x: 351, y: 75 };

// A to-do dragged from the list onto 10 o'clock, where it becomes a block. The drag
// loops; under reduced motion the picture is the block already in place.
function PlanArt() {
  const { mode } = useApp();
  const travel = {
    "--welcome-dx": `${SLOT_AT.x - ROW_AT.x}px`,
    "--welcome-dy": `${SLOT_AT.y - ROW_AT.y}px`,
  } as CSSProperties;
  return (
    <>
      <div className={`${card} top-7 left-12 w-[212px] px-1`}>
        <div className="flex h-9 items-center gap-1.5 px-2 text-body font-semibold text-ink">
          <Star size={14} strokeWidth={1.5} absoluteStrokeWidth className="text-list-today" />
          Today
        </div>
        {TODOS.map((title) => (
          <ArtTodo key={title} title={title} />
        ))}
      </div>
      <div className={`${card} top-7 right-12 flex w-[248px] overflow-hidden`}>
        <div className="w-11 shrink-0 text-right text-caption text-ink-3 tnum">
          {[10, 11, 12, 13].map((hour) => (
            <div key={hour} className="flex h-10 items-end justify-end pr-1.5">
              <span className="translate-y-1/2">{formatHour(hour)}</span>
            </div>
          ))}
        </div>
        <div className="relative flex-1 border-grid border-l" style={hourLines(40)}>
          <ArtEvent title="Standup" colors={chipColors(BLUE, mode)} top={8} height={24} />
          <div
            className={`welcome-drop absolute inset-x-0.5 top-[41px] h-[39px] rounded-sm border border-edge border-l-[3px] border-l-edge-strong pt-0.5 pl-1.5 ${
              mode === "light" ? "bg-canvas" : "bg-raised"
            }`}
          >
            <div className="flex items-center gap-1.5 text-small leading-4">
              <ArtCheckbox size={12} />
              <span className="truncate font-medium text-ink">{DRAGGED}</span>
            </div>
            <div className="text-caption text-ink-2 tnum">
              {formatMinuteRange(10 * 60, 11 * 60)}
            </div>
          </div>
        </div>
      </div>
      <div
        className="welcome-drag absolute w-[204px] rounded-md bg-raised shadow-drag"
        style={{ left: ROW_AT.x, top: ROW_AT.y, ...travel }}
      >
        <ArtTodo title={DRAGGED} />
      </div>
    </>
  );
}

// Each habit's five days around today: how full the ring is and the day's status.
const HABITS: readonly { title: string; hue: number; days: readonly (DayStatus | "future")[] }[] = [
  { title: "Gym", hue: GREEN, days: ["done", "missed", "done", "future", "future"] },
  { title: "Read", hue: BLUE, days: ["done", "done", "open", "future", "future"] },
  { title: "Meditate", hue: PURPLE, days: ["done", "done", "open", "future", "future"] },
];

// The day strip: a chip per habit under each day, filled on the days it was done.
function HabitsArt() {
  const { mode, today } = useApp();
  return (
    <div className={`${card} inset-x-14 top-7 flex flex-col`}>
      <DayRow today={today} />
      <div className="flex border-grid border-b">
        {[0, 1, 2, 3, 4].map((column) => (
          <div key={column} className="flex min-w-0 flex-1 flex-col items-start gap-1 px-2 py-1.5">
            {HABITS.map(({ title, hue, days }) => {
              const status = days[column] ?? "future";
              const colors = habitColors(hue, mode);
              const done = status === "done";
              return (
                <span
                  key={title}
                  className={`flex h-5 max-w-full items-center gap-1 rounded-full pr-2 pl-1 text-caption font-medium ${
                    done ? "" : "bg-hover text-ink-2"
                  }`}
                  style={done ? { background: colors.fill, color: colors.label } : undefined}
                >
                  <HabitRing fraction={done ? 1 : 0} status={status} color={colors.ring} />
                  <span className="truncate">{title}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex-1" style={hourLines(32)} />
    </div>
  );
}

// One line of the shortcut list: a label and the keys in effect for its commands. A
// line whose commands are all unbound isn't shown.
function KeyLine({ label, ids }: { label: string; ids: readonly (readonly [string, string?])[] }) {
  const bindings = useShortcuts(ids).filter((key) => key !== null);
  if (bindings.length === 0) return null;
  return (
    <li className="flex h-7 items-center gap-3 text-body text-ink">
      <span className="flex-1 truncate">{label}</span>
      <span className="flex items-center gap-1.5">
        {bindings.map((binding) => (
          <Keycaps key={binding} binding={binding} />
        ))}
      </span>
    </li>
  );
}

const KEY_LINES: readonly (readonly {
  label: string;
  ids: readonly (readonly [string, string?])[];
}[])[] = [
  [
    { label: "Command menu", ids: [["palette.open"]] },
    { label: "Go to today", ids: [["nav.today"]] },
    {
      label: "Day, week, month",
      ids: [["view.days.1", "d"], ["view.days.7", "w"], ["view.month"]],
    },
    { label: "Previous, next", ids: [["nav.prev"], ["nav.next"]] },
    { label: "Undo", ids: [["edit.undo"]] },
  ],
  [
    { label: "New to-do", ids: [["task.new"]] },
    { label: "New event", ids: [["event.new"]] },
    { label: "Complete a to-do", ids: [["task.complete"]] },
    { label: "Schedule in next free slot", ids: [["task.schedule"]] },
    { label: "Sidebar, to-do list", ids: [["view.sidebar"], ["view.tasks"]] },
  ],
];

// The shortcuts worth knowing on day one, in two columns.
function KeysArt() {
  return (
    <div className="flex h-full items-center gap-10 px-12">
      {KEY_LINES.map((lines, column) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the columns are their positions.
        <ul key={column} className="min-w-0 flex-1">
          {lines.map((line) => (
            <KeyLine key={line.label} {...line} />
          ))}
        </ul>
      ))}
    </div>
  );
}

// The same list on a Mac window and a phone, one to-do done on both.
function SyncArt() {
  const rows = TODOS.map((title) => <ArtTodo key={title} title={title} done={title === DRAGGED} />);
  return (
    <>
      <div className={`${card} top-7 left-[84px] w-[272px] px-1`}>
        <div className="flex h-7 items-center gap-1.5 px-2">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="h-2 w-2 rounded-full bg-edge" />
          ))}
        </div>
        {rows}
      </div>
      <div className={`${card} top-12 right-[84px] w-[132px] rounded-t-xl px-1 text-small`}>
        <div className="mx-auto mt-2 mb-1 h-1 w-9 rounded-full bg-edge" />
        {rows}
      </div>
    </>
  );
}

function CalendarsText({ access, requestAccess }: WelcomeProps) {
  const { calendars } = useApp();
  return (
    <>
      <p>
        Your calendar, to-dos and habits share one window. Cal shows the calendars already set up on
        this Mac, so iCloud, Google and Exchange sit side by side. To add an account, open System
        Settings &gt; Internet Accounts.
      </p>
      <div className="mt-3 flex h-7 items-center">
        {access === "fullAccess" ? (
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <Check size={14} strokeWidth={2} absoluteStrokeWidth className="text-success" />
            {calendars.length === 0
              ? "Calendar access is on"
              : `${calendars.length} ${calendars.length === 1 ? "calendar" : "calendars"} connected`}
          </span>
        ) : access === "notDetermined" ? (
          <button type="button" onClick={requestAccess} className={secondaryButton}>
            <CalendarDays size={14} strokeWidth={1.5} absoluteStrokeWidth />
            Allow calendar access
          </button>
        ) : (
          <span className="text-ink">
            Calendar access is off. Turn it on in System Settings &gt; Privacy &amp; Security &gt;
            Calendars.
          </span>
        )}
      </div>
    </>
  );
}

function EntryText() {
  const quick = useShortcut("task.quickEntry");
  const anywhere = useShortcut(CAPTURE_COMMAND);
  const plain = useShortcut("task.new");
  return (
    <p>
      Open Quick Entry <Key binding={quick} /> and type a to-do the way you'd say it. Cal picks out
      the date, the time, how long it takes and when it's due.
      {anywhere && (
        <>
          {" "}
          <Key binding={anywhere} /> opens it over any other app.
        </>
      )}
      {plain && (
        <>
          {" "}
          <Key binding={plain} /> adds a blank to-do to the list you're in.
        </>
      )}
    </p>
  );
}

function PlanText() {
  const schedule = useShortcut("task.schedule");
  const undo = useShortcut("edit.undo");
  return (
    <p>
      Drop a to-do on a time to block that time out, or on a day's header to move it to that day.
      Drag on an empty part of the calendar to make an event.
      {schedule && (
        <>
          {" "}
          With a to-do selected, <Key binding={schedule} /> puts it in your next free slot.
        </>
      )}
      {undo && (
        <>
          {" "}
          <Key binding={undo} /> undoes any of it.
        </>
      )}
    </p>
  );
}

function HabitsText() {
  return (
    <p>
      Every habit gets a ring under each day. Click a ring to log it, or Option-click to take one
      back. Add a habit with the + beside Habits in the sidebar: every day, on set days, a few times
      a week, or every few days.
    </p>
  );
}

function KeysText() {
  const all = useShortcut("help.shortcuts");
  return (
    <p>
      These are the ones to learn first.{" "}
      {all ? (
        <>
          Press <Key binding={all} /> for the full list
        </>
      ) : (
        "The full list is under Help > Keyboard Shortcuts"
      )}
      , and change any of them in Settings &gt; Shortcuts.
    </p>
  );
}

function SyncText({ auth }: WelcomeProps) {
  return (
    <>
      <p>
        Your to-dos, time blocks and habits stay on this Mac until you sign in. After that they sync
        to Cal on your other devices. Calendar events don't travel: each device reads its own
        calendar accounts.
      </p>
      <div className="mt-3 flex h-7 items-center">
        {auth.status === "signedIn" ? (
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <Check size={14} strokeWidth={2} absoluteStrokeWidth className="text-success" />
            Signed in as {auth.email}
          </span>
        ) : (
          <button type="button" onClick={() => toggleOverlay("signIn")} className={secondaryButton}>
            Sign in…
          </button>
        )}
      </div>
    </>
  );
}

const STEPS: readonly {
  id: string;
  title: string;
  Art: (props: WelcomeProps) => ReactNode;
  Text: (props: WelcomeProps) => ReactNode;
}[] = [
  { id: "calendars", title: "Welcome to Cal", Art: CalendarsArt, Text: CalendarsText },
  { id: "entry", title: "Add a to-do in one line", Art: EntryArt, Text: EntryText },
  { id: "plan", title: "Drag a to-do onto the calendar", Art: PlanArt, Text: PlanText },
  { id: "habits", title: "Habits sit under each day", Art: HabitsArt, Text: HabitsText },
  { id: "keys", title: "Everything has a key", Art: KeysArt, Text: KeysText },
  { id: "sync", title: "Sign in to sync", Art: SyncArt, Text: SyncText },
];

export function Welcome(props: WelcomeProps) {
  const [index, setIndex] = useState(0);
  const primary = useRef<HTMLButtonElement>(null);
  const last = index === STEPS.length - 1;
  const step = STEPS[index];
  const go = (to: number) => setIndex(Math.min(STEPS.length - 1, Math.max(0, to)));

  // Focus stays on Next through every step (Back comes and goes), so Return keeps
  // advancing and no key falls through to the window behind. Answering the calendar
  // prompt removes the Allow button that had focus, so Next takes it back then too.
  const { access } = props;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus on each step and answer.
  useEffect(() => primary.current?.focus(), [index, access]);

  // Closing hands focus back to whatever had it when the walkthrough opened.
  useEffect(() => {
    const before = document.activeElement;
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  if (!step) return null;
  const { Art, Text } = step;
  return (
    <Overlay
      onClose={closeOverlay}
      width={600}
      label="Welcome to Cal"
      onKeyDown={(event) => {
        // Keys stay in the walkthrough: nothing behind it runs a shortcut.
        event.stopPropagation();
        if (event.key === "ArrowRight") go(index + 1);
        else if (event.key === "ArrowLeft") go(index - 1);
        else if (event.key === "Escape") closeOverlay();
        else if (event.key === "Tab") {
          // Tab cycles through the walkthrough's own buttons and never leaves it.
          const buttons = [...event.currentTarget.querySelectorAll("button")];
          const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = (at + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        } else return;
        event.preventDefault();
      }}
    >
      {/* The picture gives way on a short window, so the words and buttons always fit. */}
      <div
        aria-hidden
        className="relative h-[216px] overflow-hidden border-grid border-b bg-sidebar [@media(max-height:620px)]:hidden"
        data-welcome-art={step.id}
      >
        <Art {...props} />
      </div>
      <div className="min-h-[156px] px-6 pt-5 text-body leading-[22px] text-ink-2">
        <h2 className="mb-1.5 text-title-2 font-semibold text-ink">{step.title}</h2>
        <Text {...props} />
      </div>
      <div className="flex items-center gap-2 px-6 pt-3 pb-5">
        <div className="-ml-1.5 flex flex-1 items-center">
          {STEPS.map((each, at) => (
            <button
              type="button"
              key={each.id}
              aria-label={`Step ${at + 1} of ${STEPS.length}: ${each.title}`}
              aria-current={at === index ? "step" : undefined}
              onClick={() => go(at)}
              className="flex h-5 w-[18px] items-center justify-center rounded-sm"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${at === index ? "bg-accent" : "bg-edge-strong"}`}
              />
            </button>
          ))}
        </div>
        {index > 0 && (
          <button type="button" onClick={() => go(index - 1)} className={secondaryButton}>
            Back
          </button>
        )}
        <button
          ref={primary}
          type="button"
          onClick={() => (last ? closeOverlay() : go(index + 1))}
          className="h-7 min-w-16 rounded-md bg-accent-solid px-3 text-small font-medium text-white"
        >
          {last ? "Done" : "Next"}
        </button>
      </div>
      {/* After the rest, so Tab reaches it last. It sits in the corner where the platform
          puts a window's close button: top left on the Mac, top right elsewhere. */}
      <IconButton
        label="Close"
        onClick={closeOverlay}
        className={`absolute top-2 ${isMac ? "left-2" : "right-2"}`}
        data-welcome-close
      >
        <X size={14} strokeWidth={1.5} absoluteStrokeWidth />
      </IconButton>
    </Overlay>
  );
}
