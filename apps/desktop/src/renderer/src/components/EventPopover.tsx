import { type History, useActions, useCal } from "@cal/app-core";
import type { Attendee, EventSpan, ExternalEvent } from "@cal/calendar-source";
import { addDays, type DayKey, fromDayKey, toDayKey, toOffsetIso } from "@cal/domain";
import { parseQuickEntry, type QuickEntry, type TaskEntry, type Token } from "@cal/nlp";
import {
  AlignLeft,
  ArrowRight,
  Bell,
  Clock,
  Flag,
  Folder,
  Link2,
  Lock,
  MapPin,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useApp } from "../lib/app";
import { now } from "../lib/clock";
import { parseClock, parseDurationText } from "../lib/clockText";
import { type Literal, shiftLiterals } from "../lib/entryText";
import {
  closeEditor,
  type EditorState,
  type EventWriter,
  eventPatch,
  eventWriter,
  formDay,
  patchForm,
  setFormText,
  spanFor,
  toEventInput,
  useEditor,
} from "../lib/events";
import { inTextField } from "../lib/keyboard";
import { describeRule, repeatPresets } from "../lib/recurrence";
import {
  formatDuration,
  formatMinutes,
  formatRelativeDay,
  formatWeekdayMonthDay,
} from "../lib/time";
import { showToast } from "../lib/toast";
import { openZonePicker, select, ui } from "../lib/ui";
import { zoneAbbreviation, zonedDayKey, zonedInstant, zonedMinutes } from "../lib/zones";
import { TokenText } from "./TokenText";
import { IconButton, Keycaps, Segmented, Select, Switch } from "./ui";

/*
 * The event popover (research/08 §D): one panel for creating and editing, grown from
 * the chip it belongs to on whichever side has room. The title parses as you type and
 * fills the fields below; every other row edits one field. ↩ in the title or ⌘↩
 * anywhere saves, Esc discards, and clicking outside saves a titled draft. Events on
 * read-only calendars open with every field disabled.
 */

const WIDTH = 320;
const GAP = 8;
const MARGIN = 8;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const ALARM_PRESETS = [
  { value: 0, label: "At start" },
  { value: 5, label: "5 min before" },
  { value: 10, label: "10 min before" },
  { value: 15, label: "15 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];

export const alarmLabel = (minutes: number) =>
  ALARM_PRESETS.find((preset) => preset.value === minutes)?.label ??
  `${formatDuration(minutes)} before`;

const STATUS: Record<Attendee["status"], string> = {
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Maybe",
  pending: "No reply",
  unknown: "",
};

export function EventPopover() {
  const editor = useEditor();
  if (!editor) return null;
  return <Popover key={editor.anchor} editor={editor} />;
}

// Where the panel sits: beside the anchor chip, inside the window.
function usePlacement(
  anchor: string,
  panel: React.RefObject<HTMLDivElement | null>,
  deps: unknown[],
) {
  const [place, setPlace] = useState({ left: 0, top: 0, origin: "left top", ready: false });
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measures when the chip moves.
  useLayoutEffect(() => {
    const measure = () => {
      const wrapper = document.querySelector<HTMLElement>(`[data-item="${anchor}"]`);
      const target =
        wrapper && wrapper.getBoundingClientRect().width === 0
          ? (wrapper.firstElementChild ?? wrapper)
          : wrapper;
      const height = panel.current?.offsetHeight ?? 0;
      const rect = target?.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        setPlace((current) =>
          current.ready
            ? current
            : {
                left: Math.round((window.innerWidth - WIDTH) / 2),
                top: Math.round(window.innerHeight * 0.2),
                origin: "center top",
                ready: true,
              },
        );
        return;
      }
      const fitsRight = rect.right + GAP + WIDTH <= window.innerWidth - MARGIN;
      const left = fitsRight ? rect.right + GAP : Math.max(MARGIN, rect.left - GAP - WIDTH);
      const top = Math.max(MARGIN, Math.min(rect.top, window.innerHeight - MARGIN - height));
      setPlace({
        left: Math.round(left),
        top: Math.round(top),
        origin: fitsRight ? "left top" : "right top",
        ready: true,
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [anchor, ...deps]);
  return place;
}

function Popover({ editor }: { editor: EditorState }) {
  const { calendars, palette, data, account, refreshEvents, today, zone: gridZone } = useApp();
  const { history } = useCal();
  const actions = useActions();
  const { form, event } = editor;
  const creating = editor.mode === "create";
  const panel = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [customRule, setCustomRule] = useState(false);
  const writable = calendars.filter((calendar) => calendar.writable);
  const calendar = calendars.find((each) => each.id === form.calendarId);
  const readOnly = !creating && !(calendar?.writable ?? false);
  const canCreateEvents = writable.length > 0;
  const place = usePlacement(editor.anchor, panel, [form.start, form.end, form.allDay, form.kind]);
  // Focus the title once the panel is placed; a hidden input can't take focus.
  useEffect(() => {
    if (place.ready && !readOnly) title.current?.focus();
  }, [place.ready, readOnly]);

  // New titles parse live; an existing event's title is text, never re-read.
  const parse = (text: string, literals: readonly Literal[]) =>
    parseQuickEntry(text, {
      now: now(),
      surface: "grid",
      kind: form.kind,
      calendars: writable,
      projects: data.projects,
      literals,
      weekStartsOn: account.weekStart,
      defaultEventMin: account.eventMinutes,
    });
  const entry: QuickEntry | null = creating ? parse(form.text, form.literals) : null;
  const tokens: readonly Token[] = entry?.tokens ?? [];
  const titleText = form.title;
  const zone = form.timeZone;
  const day = formDay(form);
  const startMin = zonedMinutes(form.start, zone);
  const endMin = zonedMinutes(form.end, zone);
  const length = Math.round((form.end.getTime() - form.start.getTime()) / MINUTE);
  const zoneDiffers = zone !== gridZone;

  const writer = eventWriter(history, refreshEvents);

  const onText = (text: string) => {
    const literals = shiftLiterals(form.literals, form.text, text);
    setFormText(text, literals, creating ? parse(text, literals) : null);
  };
  const unparse = (token: Token) => {
    const literals = [...form.literals, { start: token.start, end: token.end }];
    setFormText(form.text, literals, creating ? parse(form.text, literals) : null);
  };

  // Time edits keep the day; a date edit keeps the time of day and the length.
  const setStart = (minutes: number) => {
    const start = zonedInstant(day, minutes, zone);
    patchForm({ start, end: new Date(start.getTime() + length * MINUTE) });
  };
  const setEnd = (minutes: number) => {
    let end = zonedInstant(day, minutes, zone);
    if (end.getTime() <= form.start.getTime()) end = new Date(end.getTime() + DAY);
    patchForm({ end });
  };
  const setDay = (next: DayKey) => {
    if (form.allDay) {
      const span = form.end.getTime() - form.start.getTime();
      const start = fromDayKey(next);
      patchForm({ start, end: new Date(start.getTime() + span) });
      return;
    }
    const start = zonedInstant(next, startMin, zone);
    patchForm({ start, end: new Date(start.getTime() + length * MINUTE) });
  };
  const timed = useRef({ start: form.start, end: form.end });
  const setAllDay = (allDay: boolean) => {
    if (allDay) {
      timed.current = { start: form.start, end: form.end };
      const start = fromDayKey(day);
      patchForm({ allDay, start, end: fromDayKey(addDays(day, 1)), busy: false });
      return;
    }
    // The times from before the all-day switch come back if the day didn't change.
    const keep = timed.current;
    const kept = zonedDayKey(keep.start, zone) === day;
    const start = kept ? keep.start : zonedInstant(day, 9 * 60, zone);
    const end = kept ? keep.end : new Date(start.getTime() + account.eventMinutes * MINUTE);
    patchForm({ allDay, start, end, busy: true });
  };

  const presets = repeatPresets(day);
  const presetRule = presets.some((preset) => preset.rule === form.recurrence);
  const repeatOptions = [
    ...presets,
    ...(presetRule || !form.recurrence
      ? []
      : [{ rule: form.recurrence, label: describeRule(form.recurrence) }]),
    { rule: "custom", label: "Custom…" },
  ].map((preset) => ({ value: preset.rule, label: preset.label }));

  const close = () => {
    closeEditor();
  };

  const save = async () => {
    if (readOnly) return close();
    if (form.kind === "task") {
      if (!titleText) return close();
      close();
      const typed: TaskEntry =
        entry?.kind === "task" ? entry : { kind: "task", title: titleText, tokens: [] };
      await actions.createFromEntry(
        {
          ...typed,
          title: titleText,
          when: "date",
          when_date: day,
          start_at: toOffsetIso(form.start),
          estimate_min: length,
          ...(form.deadline && { deadline: form.deadline }),
          ...(form.projectUuid && { project_uuid: form.projectUuid }),
        },
        { position: -1 },
      );
      return;
    }
    const input = toEventInput(form, titleText || "New event");
    if (creating) {
      if (!titleText) return close();
      close();
      try {
        const id = await writer.create(input);
        if (id) select({ kind: "event", id });
      } catch (error) {
        showToast(`Couldn't save the event: ${error instanceof Error ? error.message : error}`);
      }
      return;
    }
    if (!event) return close();
    const patch = eventPatch(event, input);
    if (Object.keys(patch).length === 0) return close();
    const span = await spanFor(
      event,
      "Save repeating event",
      patch.recurrence !== undefined ? ["future", "all"] : undefined,
    );
    if (!span) return title.current?.focus();
    close();
    try {
      await writer.update(event, patch, span);
    } catch (error) {
      showToast(`Couldn't save the event: ${error instanceof Error ? error.message : error}`);
    }
  };

  const remove = async () => {
    if (!event || readOnly) return;
    const span = await spanFor(event, "Delete repeating event");
    if (!span) return title.current?.focus();
    close();
    select(null);
    await deleteWithUndo(event, span, writer, history);
  };

  // Esc drops an untouched draft at once, and asks when fields were edited.
  const dismiss = () => {
    if (!editor.dirty || readOnly || confirmDiscard) return close();
    setConfirmDiscard(true);
  };

  // Esc with focus elsewhere in the window (after a dialog closed) still dismisses.
  useEffect(() => {
    const onKey = (keyboard: KeyboardEvent) => {
      if (keyboard.key !== "Escape" || keyboard.defaultPrevented) return;
      if (panel.current?.contains(keyboard.target as Node) || ui.get().overlay !== null) return;
      keyboard.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // Clicking outside saves a titled draft or edited event, like the to-do draft does.
  useEffect(() => {
    const away = (pointer: PointerEvent) => {
      if (ui.get().overlay !== null) return;
      const target = pointer.target instanceof Element ? pointer.target : null;
      if (
        !target ||
        panel.current?.contains(target) ||
        target.closest('[data-item="draft"], [role=dialog], [role=listbox], [role=menu]')
      ) {
        return;
      }
      if (creating ? titleText : editor.dirty) void save();
      else close();
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  });

  const onKeyDown = (keyboard: ReactKeyboardEvent<HTMLDivElement>) => {
    const meta = keyboard.metaKey;
    const typing = inTextField(keyboard.target);
    if (keyboard.key === "Escape") dismiss();
    else if (keyboard.key === "Enter" && meta) void save();
    else if (meta && keyboard.key === "1" && creating && canCreateEvents)
      patchForm({ kind: "event" });
    else if (meta && keyboard.key === "2" && creating) patchForm({ kind: "task" });
    else if (keyboard.key === "Backspace" && (meta || !typing) && !creating) void remove();
    else if (!meta) {
      // Plain keys belong to the fields; never to the grid's single-letter shortcuts.
      keyboard.stopPropagation();
      return;
    } else return;
    keyboard.preventDefault();
    keyboard.stopPropagation();
  };

  const kindLabel = form.kind === "task" ? "To-do" : "Event";
  const projectOptions = [
    { value: "", label: "No project" },
    ...data.projects.map((project) => ({ value: project.uuid, label: project.title })),
  ];

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={creating ? `New ${kindLabel.toLowerCase()}` : kindLabel}
      data-editor={editor.mode}
      onKeyDown={onKeyDown}
      className="pop-in fixed z-40 flex max-h-[calc(100vh-16px)] flex-col overflow-hidden rounded-xl bg-raised text-body text-ink shadow-float"
      style={{
        width: WIDTH,
        left: place.left,
        top: place.top,
        transformOrigin: place.origin,
        opacity: place.ready ? 1 : 0,
      }}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 pr-2 pl-3">
        {creating && canCreateEvents ? (
          <>
            <Segmented
              value={form.kind}
              options={[
                { value: "event", label: "Event" },
                { value: "task", label: "To-do" },
              ]}
              onChange={(kind) => patchForm({ kind })}
              label="Kind"
            />
            <span className="flex gap-1 text-caption text-ink-3">
              <Keycaps binding="mod+1" />
              <Keycaps binding="mod+2" />
            </span>
          </>
        ) : (
          <span className="text-small font-medium text-ink-2">{kindLabel}</span>
        )}
        <span className="flex-1" />
        {!creating && !readOnly && (
          <IconButton label="Delete event" onClick={() => void remove()}>
            <Trash2 size={14} strokeWidth={1.5} absoluteStrokeWidth />
          </IconButton>
        )}
        <IconButton label="Close" onClick={dismiss}>
          <X size={14} strokeWidth={1.5} absoluteStrokeWidth />
        </IconButton>
      </header>

      {readOnly && (
        <div className="mx-3 mb-2 flex h-7 items-center gap-1.5 rounded-md bg-hover px-2 text-small text-ink-2">
          <Lock size={12} strokeWidth={1.5} absoluteStrokeWidth />
          Read-only: {calendar?.title ?? "this calendar"}
        </div>
      )}

      <fieldset disabled={readOnly} className="flex min-h-0 flex-col overflow-y-auto">
        <div className="px-3 pb-2">
          <TokenText
            inputRef={title}
            value={form.text}
            tokens={tokens}
            onChange={onText}
            onUnparse={unparse}
            onKeyDown={(keyboard) => {
              if (keyboard.key === "Enter" && !keyboard.metaKey) {
                keyboard.preventDefault();
                void save();
              }
            }}
            placeholder={form.kind === "task" ? "New to-do" : "New event"}
            label="Title"
            className="h-8 rounded-md bg-hover px-2 text-title-3 font-medium"
          />
        </div>

        <Section>
          <Row icon={Clock}>
            {form.allDay ? (
              <span className="text-ink-2">All day</span>
            ) : (
              <span className="flex items-center gap-1.5 tnum">
                <TextField
                  value={formatMinutes(startMin)}
                  onCommit={(text) => {
                    const minutes = parseClock(text);
                    if (minutes !== undefined) setStart(minutes);
                  }}
                  label="Start time"
                  width={66}
                />
                <ArrowRight
                  size={12}
                  strokeWidth={1.5}
                  absoluteStrokeWidth
                  className="text-ink-3"
                />
                <TextField
                  value={formatMinutes(endMin)}
                  onCommit={(text) => {
                    const minutes = parseClock(text);
                    if (minutes !== undefined) setEnd(minutes);
                  }}
                  label="End time"
                  width={66}
                />
                <TextField
                  value={formatDuration(length)}
                  onCommit={(text) => {
                    const minutes = parseDurationText(text);
                    if (minutes)
                      patchForm({ end: new Date(form.start.getTime() + minutes * MINUTE) });
                  }}
                  label="Duration"
                  width={48}
                  muted
                />
              </span>
            )}
          </Row>
          <Row>
            <TextField
              value={
                form.allDay && form.end.getTime() - form.start.getTime() > DAY
                  ? `${formatWeekdayMonthDay(day)} – ${formatWeekdayMonthDay(toDayKey(new Date(form.end.getTime() - 1)))}`
                  : formatWeekdayMonthDay(day)
              }
              onCommit={(text) => {
                const parsed = parseQuickEntry(text, { now: now(), kind: "event" });
                const dated = parsed.tokens.some(
                  (token) =>
                    token.applied && (token.kind === "when" || token.kind === "date_range"),
                );
                if (!dated) return;
                setDay(parsed.allDay ? parsed.start : zonedDayKey(new Date(parsed.start), zone));
              }}
              label="Date"
              width={200}
            />
            {!form.allDay && zoneDiffers && (
              <span className="ml-1 text-caption text-ink-3 tnum">
                {formatMinutes(zonedMinutes(form.start, gridZone))} your time
              </span>
            )}
          </Row>
          <Row>
            <span className="flex h-6 items-center gap-1.5 text-small text-ink-2">
              <Switch checked={form.allDay} onChange={setAllDay} label="All-day" />
              All-day
            </span>
            {form.kind === "event" && (
              <>
                <button
                  type="button"
                  onClick={() => openZonePicker({ kind: "event" })}
                  disabled={form.allDay}
                  className={`h-6 rounded-md px-1.5 text-small hover:bg-hover disabled:text-ink-3 disabled:hover:bg-transparent ${
                    zoneDiffers ? "text-ink" : "text-ink-3"
                  }`}
                  title={zone}
                >
                  {form.allDay ? "Time zone" : zoneAbbreviation(zone, form.start)}
                </button>
                <Select
                  value={customRule ? "custom" : form.recurrence || "none"}
                  options={repeatOptions}
                  placeholder="Repeat"
                  quiet
                  width={form.recurrence ? 150 : 76}
                  label="Repeat"
                  onChange={(rule) => {
                    if (rule === "custom") setCustomRule(true);
                    else {
                      setCustomRule(false);
                      patchForm({ recurrence: rule });
                    }
                  }}
                />
              </>
            )}
          </Row>
          {customRule && (
            <Row>
              <input
                value={form.recurrence}
                onChange={(change) => patchForm({ recurrence: change.target.value.toUpperCase() })}
                placeholder="FREQ=WEEKLY;INTERVAL=2;BYDAY=TU"
                aria-label="Repeat rule"
                spellCheck={false}
                className="h-6 w-full rounded-md bg-hover px-2 font-mono text-caption text-ink outline-none placeholder:text-ink-3"
              />
            </Row>
          )}
        </Section>

        {form.kind === "event" ? (
          <>
            <Section>
              <Row icon={MapPin}>
                <LineInput
                  value={form.location}
                  onChange={(location) => patchForm({ location })}
                  placeholder="Location"
                />
              </Row>
              <Row icon={Link2}>
                <LineInput
                  value={form.url}
                  onChange={(url) => patchForm({ url })}
                  placeholder="Link"
                />
              </Row>
              <Row icon={AlignLeft} top>
                <textarea
                  value={form.notes}
                  onChange={(change) => patchForm({ notes: change.target.value })}
                  placeholder="Notes"
                  aria-label="Notes"
                  rows={form.notes ? 3 : 1}
                  className="min-h-6 w-full resize-none bg-transparent py-[3px] text-body text-ink outline-none placeholder:text-ink-3"
                />
              </Row>
            </Section>
            {event?.attendees && event.attendees.length > 0 && (
              <Section>
                <Row icon={Users} top>
                  <ul className="flex w-full flex-col gap-0.5 py-0.5">
                    {event.attendees.map((attendee, index) => (
                      <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: attendees have no stable id.
                        key={index}
                        className="flex items-center gap-2 text-small"
                      >
                        <span className="min-w-0 flex-1 truncate text-ink">
                          {attendee.name ?? attendee.email ?? "Guest"}
                          {attendee.organizer && (
                            <span className="ml-1 text-ink-3">· organizer</span>
                          )}
                        </span>
                        <span className="shrink-0 text-caption text-ink-3">
                          {STATUS[attendee.status]}
                        </span>
                      </li>
                    ))}
                    <li className="pt-0.5 text-caption text-ink-3">
                      Cal can't invite people on the Mac yet.
                    </li>
                  </ul>
                </Row>
              </Section>
            )}
            <Section>
              <Row>
                <Select
                  value={form.calendarId}
                  options={(creating ? writable : calendars)
                    .filter((each) => each.writable || each.id === form.calendarId)
                    .map((each) => ({
                      value: each.id,
                      label: each.title,
                      color: palette.get(each.id)?.bar ?? each.color,
                    }))}
                  onChange={(calendarId) => patchForm({ calendarId })}
                  label="Calendar"
                  quiet
                  width={170}
                />
                <span className="flex-1" />
                <Segmented
                  value={form.busy ? "busy" : "free"}
                  options={[
                    { value: "busy", label: "Busy" },
                    { value: "free", label: "Free" },
                  ]}
                  onChange={(value) => patchForm({ busy: value === "busy" })}
                  label="Availability"
                />
              </Row>
              <Row icon={Bell} top>
                <div className="flex flex-wrap items-center gap-1 py-0.5">
                  {form.alarms.map((minutes) => (
                    <span
                      key={minutes}
                      className="flex h-6 items-center gap-1 rounded-md bg-hover pl-2 pr-1 text-small text-ink tnum"
                    >
                      {alarmLabel(minutes)}
                      <button
                        type="button"
                        aria-label={`Remove reminder ${alarmLabel(minutes)}`}
                        onClick={() =>
                          patchForm({ alarms: form.alarms.filter((each) => each !== minutes) })
                        }
                        className="flex h-4 w-4 items-center justify-center rounded-sm text-ink-3 hover:bg-active hover:text-ink"
                      >
                        <X size={10} strokeWidth={2} absoluteStrokeWidth />
                      </button>
                    </span>
                  ))}
                  <Select
                    value={-1}
                    options={ALARM_PRESETS.filter((preset) => !form.alarms.includes(preset.value))}
                    placeholder={form.alarms.length ? "+ Add" : "Add reminder"}
                    quiet
                    width={form.alarms.length ? 76 : 124}
                    label="Add reminder"
                    onChange={(minutes) =>
                      patchForm({ alarms: [...form.alarms, minutes].sort((a, b) => a - b) })
                    }
                  />
                </div>
              </Row>
            </Section>
          </>
        ) : (
          <Section>
            <Row icon={Folder}>
              <Select
                value={form.projectUuid ?? ""}
                options={projectOptions}
                onChange={(uuid) => patchForm({ projectUuid: uuid || null })}
                label="Project"
                quiet
                width={200}
              />
            </Row>
            <Row icon={Flag}>
              <TextField
                value={form.deadline ? `Due ${formatRelativeDay(form.deadline, today)}` : ""}
                placeholder="Deadline"
                onCommit={(text) => {
                  if (!text.trim()) return patchForm({ deadline: null });
                  const parsed = parseQuickEntry(text.replace(/^due\s+/i, ""), {
                    now: now(),
                    kind: "event",
                  });
                  if (parsed.tokens.some((token) => token.applied && token.kind === "when")) {
                    patchForm({
                      deadline: parsed.allDay ? parsed.start : toDayKey(new Date(parsed.start)),
                    });
                  }
                }}
                label="Deadline"
                width={200}
              />
            </Row>
          </Section>
        )}
      </fieldset>

      <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-grid px-3 text-caption text-ink-3">
        {confirmDiscard ? (
          <>
            <span className="text-ink-2">Discard changes?</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setConfirmDiscard(false)}
              className="h-6 rounded-md px-2 text-small text-ink hover:bg-hover"
            >
              Keep editing
            </button>
            <button
              type="button"
              onClick={close}
              className="h-6 rounded-md px-2 text-small font-medium text-now hover:bg-hover"
            >
              Discard
            </button>
          </>
        ) : readOnly ? (
          <span className="flex items-center gap-1">
            <Keycaps binding="escape" /> Close
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <Keycaps binding={creating ? "enter" : "mod+enter"} /> Save
            </span>
            <span className="flex items-center gap-1">
              <Keycaps binding="escape" /> {creating ? "Discard" : "Cancel"}
            </span>
            {!creating && (
              <span className="flex items-center gap-1">
                <Keycaps binding="mod+backspace" /> Delete
              </span>
            )}
            {creating && form.kind === "event" && calendar && (
              <span className="ml-auto flex items-center gap-1.5 truncate">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: palette.get(calendar.id)?.bar ?? calendar.color }}
                />
                <span className="truncate">{calendar.title}</span>
              </span>
            )}
          </>
        )}
      </footer>
    </div>
  );
}

/**
 * Deletes `event` as an undoable step and offers Undo in a toast. Shared with the
 * grid's ⌫ command.
 */
export async function deleteWithUndo(
  event: ExternalEvent,
  span: EventSpan,
  writer: EventWriter,
  history: History,
) {
  try {
    await writer.remove(event, span);
    showToast(`Deleted “${event.title}”`, { label: "Undo", run: () => void history.undo() });
  } catch (error) {
    showToast(`Couldn't delete the event: ${error instanceof Error ? error.message : error}`);
  }
}

// A hairline-separated group of rows.
function Section({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-0.5 border-t border-grid px-3 py-2">{children}</div>;
}

// One row: a 14px icon (or its space) and the field beside it.
function Row({
  icon: Icon,
  top = false,
  children,
}: {
  icon?: typeof Clock;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-h-6 gap-2 ${top ? "items-start" : "items-center"}`}>
      <span
        className={`flex h-6 w-4 shrink-0 items-center justify-center text-ink-3 ${top ? "mt-0" : ""}`}
      >
        {Icon && <Icon size={14} strokeWidth={1.5} absoluteStrokeWidth />}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  );
}

// A borderless text input that writes through on every change.
function LineInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(change) => onChange(change.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      spellCheck={false}
      className="h-6 w-full rounded-md bg-transparent px-1 -mx-1 text-body text-ink outline-none placeholder:text-ink-3 focus:bg-hover"
    />
  );
}

interface TextFieldProps {
  value: string;
  onCommit: (text: string) => void;
  label: string;
  width: number;
  placeholder?: string;
  // Secondary text, for the duration beside the times.
  muted?: boolean;
}

// A text field that holds what you type and commits it on Enter, Tab or blur.
function TextField({ value, onCommit, label, width, placeholder, muted }: TextFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      value={draft ?? value}
      onChange={(change) => setDraft(change.target.value)}
      onFocus={(focus) => focus.target.select()}
      onBlur={commit}
      onKeyDown={(keyboard) => {
        if (keyboard.key === "Enter" && !keyboard.metaKey) {
          keyboard.preventDefault();
          commit();
          keyboard.currentTarget.blur();
        } else if (keyboard.key === "Escape" && draft !== null) {
          keyboard.stopPropagation();
          setDraft(null);
        }
      }}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      style={{ width }}
      className={`h-6 rounded-md bg-transparent px-1 -mx-1 text-body outline-none placeholder:text-ink-3 focus:bg-hover ${
        muted ? "text-ink-3" : "text-ink"
      }`}
    />
  );
}
