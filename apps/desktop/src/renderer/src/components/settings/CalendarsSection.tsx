import { useSettings } from "@cal/app-core";
import type { DeviceCalendar } from "@cal/calendar-source";
import { Check, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/app";
import { Select, Switch } from "../ui";
import { Group, Row } from "./controls";

/*
 * Calendars: every device calendar grouped by account, each with show/hide, a color
 * override kept in Cal, whether it counts as busy for planning, and which one new
 * events go to. Read-only calendars show a lock and can't be the default.
 */

const SWATCHES = [
  "#e5484d",
  "#f76b15",
  "#d9a300",
  "#22a06b",
  "#12a594",
  "#3b82f6",
  "#5b5bd6",
  "#8e4ec6",
  "#e93d82",
  "#a0765a",
  "#888888",
];

const REMINDERS = [
  { value: -1, label: "None" },
  { value: 0, label: "At start" },
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];

export function CalendarsSection() {
  const { calendars } = useApp();
  const { account, device, setAccount, setDevice } = useSettings();
  const accounts = [...new Set(calendars.map((calendar) => calendar.account))];
  const hidden = new Set(device.hiddenCalendars);
  const free = new Set(device.freeCalendars);
  const toggle = (list: readonly string[], id: string, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((each) => each !== id);
  // Without a choice, the first writable calendar stands in for the system default.
  const fallback = calendars.find((calendar) => calendar.writable)?.id ?? null;
  const defaultCalendar = device.defaultCalendar ?? fallback;

  return (
    <>
      {calendars.length === 0 && (
        <p className="px-1 pb-6 text-small text-ink-3">
          No calendars yet. Allow calendar access from the sidebar to see them here.
        </p>
      )}
      {accounts.map((name) => (
        <Group key={name} title={name}>
          {calendars
            .filter((calendar) => calendar.account === name)
            .map((calendar) => (
              <CalendarRow
                key={calendar.id}
                calendar={calendar}
                color={device.calendarColors[calendar.id]}
                shown={!hidden.has(calendar.id)}
                busy={!free.has(calendar.id)}
                isDefault={defaultCalendar === calendar.id}
                onColor={(color) => {
                  const { [calendar.id]: _previous, ...rest } = device.calendarColors;
                  setDevice("calendarColors", color ? { ...rest, [calendar.id]: color } : rest);
                }}
                onShown={(on) =>
                  setDevice("hiddenCalendars", toggle(device.hiddenCalendars, calendar.id, !on))
                }
                onBusy={(on) =>
                  setDevice("freeCalendars", toggle(device.freeCalendars, calendar.id, !on))
                }
                onDefault={() => setDevice("defaultCalendar", calendar.id)}
              />
            ))}
        </Group>
      ))}
      <Group title="New events">
        <Row label="Default reminder" note="Added to timed events Cal creates">
          <Select
            value={account.eventReminder ?? -1}
            options={REMINDERS}
            onChange={(value) => void setAccount("eventReminder", value < 0 ? null : value)}
            label="Default reminder"
            width={168}
          />
        </Row>
      </Group>
    </>
  );
}

interface CalendarRowProps {
  calendar: DeviceCalendar;
  color: string | undefined;
  shown: boolean;
  busy: boolean;
  isDefault: boolean;
  onColor: (color: string | null) => void;
  onShown: (on: boolean) => void;
  onBusy: (on: boolean) => void;
  onDefault: () => void;
}

function CalendarRow({
  calendar,
  color,
  shown,
  busy,
  isDefault,
  onColor,
  onShown,
  onBusy,
  onDefault,
}: CalendarRowProps) {
  return (
    <div className="flex h-11 items-center gap-3 px-3 [&+&]:border-t [&+&]:border-grid">
      <ColorDot color={color ?? calendar.color} own={calendar.color} onChange={onColor} />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className={`truncate text-body ${shown ? "text-ink" : "text-ink-3"}`}>
          {calendar.title}
        </span>
        {!calendar.writable && (
          <Lock size={11} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-ink-3" />
        )}
      </div>
      {calendar.writable ? (
        <button
          type="button"
          onClick={onDefault}
          aria-pressed={isDefault}
          className={`flex h-6 items-center gap-1 rounded-md px-2 text-caption font-medium ${
            isDefault ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink-2"
          }`}
        >
          {isDefault && <Check size={11} strokeWidth={2.5} absoluteStrokeWidth />}
          Default
        </button>
      ) : (
        <span className="text-caption text-ink-3">Read-only</span>
      )}
      <span className="flex items-center gap-1.5 text-caption text-ink-3">
        Busy
        <Switch checked={busy} onChange={onBusy} label={`${calendar.title} counts as busy`} />
      </span>
      <span className="flex items-center gap-1.5 text-caption text-ink-3">
        Show
        <Switch checked={shown} onChange={onShown} label={`Show ${calendar.title}`} />
      </span>
    </div>
  );
}

// The calendar's color as a 12px dot; click for a swatch popover with an override.
function ColorDot({
  color,
  own,
  onChange,
}: {
  color: string;
  own: string;
  onChange: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Calendar color"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
        className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-hover"
      >
        <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Calendar color"
          className="pop-in absolute left-0 top-7 z-30 w-44 origin-top-left rounded-lg bg-raised p-2 shadow-float"
        >
          <div className="grid grid-cols-6 gap-1">
            {SWATCHES.map((swatch) => (
              <button
                type="button"
                key={swatch}
                aria-label={swatch}
                onClick={() => {
                  setOpen(false);
                  onChange(swatch);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-hover"
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-white"
                  style={{ background: swatch }}
                >
                  {swatch === color && <Check size={10} strokeWidth={3} absoluteStrokeWidth />}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onChange(null);
            }}
            className="mt-1 flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-small text-ink hover:bg-hover"
          >
            <span className="h-3 w-3 rounded-full" style={{ background: own }} />
            Calendar's own color
          </button>
        </div>
      )}
    </div>
  );
}
