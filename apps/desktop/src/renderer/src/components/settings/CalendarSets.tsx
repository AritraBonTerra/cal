import { type CalendarSet, useSettings } from "@cal/app-core";
import { Trash2 } from "lucide-react";
import { useApp } from "../../lib/app";
import { calendarColor } from "../../lib/calendars";
import { formatMinutes } from "../../lib/time";
import { IconButton, Select, Switch } from "../ui";
import { Group, Row, RowButton } from "./controls";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WORK_HOURS = { days: [1, 2, 3, 4, 5], start: 9 * 60, end: 18 * 60 };
const MAX_SETS = 20;

/*
 * Calendar sets: each a name, the calendars it shows, and the hours Automatic shows it.
 * Which one is showing is picked beside the sidebar's Calendars heading, or with ⌃1–9.
 */
export function CalendarSets() {
  const { calendars } = useApp();
  const { device, setDevice } = useSettings();
  const sets = device.calendarSets;
  const save = (next: readonly CalendarSet[]) => setDevice("calendarSets", [...next]);
  const add = () =>
    save([
      ...sets,
      {
        id: crypto.randomUUID(),
        name: "",
        // Starts with what's showing, so a new set never blanks the calendar.
        calendars: calendars
          .map(({ id }) => id)
          .filter((id) => !device.hiddenCalendars.includes(id)),
      },
    ]);
  const remove = (id: string) => {
    save(sets.filter((set) => set.id !== id));
    // Without it, back to following the clock.
    if (device.calendarSet === id) setDevice("calendarSet", "auto");
  };
  return (
    <>
      <Group title="Calendar sets">
        <Row label="Sets" note="A group of calendars to show at a time">
          <RowButton onClick={add} disabled={sets.length >= MAX_SETS || calendars.length === 0}>
            New set
          </RowButton>
        </Row>
      </Group>
      {sets.map((set) => (
        <SetEditor
          key={set.id}
          set={set}
          onChange={(next) => save(sets.map((each) => (each.id === set.id ? next : each)))}
          onRemove={() => remove(set.id)}
        />
      ))}
    </>
  );
}

function SetEditor({
  set,
  onChange,
  onRemove,
}: {
  set: CalendarSet;
  onChange: (set: CalendarSet) => void;
  onRemove: () => void;
}) {
  const { calendars, device } = useApp();
  const { hours } = set;
  // Built at render, so the times follow the Time format setting. The end may be midnight.
  const times = Array.from({ length: 49 }, (_, half) => ({
    value: half * 30,
    label: half === 48 ? "Midnight" : formatMinutes(half * 30),
  }));
  return (
    <Group>
      <div className="flex items-center gap-2 px-3 py-2" data-set={set.id}>
        <input
          value={set.name}
          onChange={(change) => onChange({ ...set, name: change.target.value })}
          placeholder="Untitled set"
          aria-label="Set name"
          className="h-7 min-w-0 flex-1 rounded-md bg-hover px-2 text-body font-medium text-ink outline-none placeholder:text-ink-3"
        />
        <IconButton label="Delete set" onClick={onRemove}>
          <Trash2 size={14} strokeWidth={1.5} absoluteStrokeWidth />
        </IconButton>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-grid px-3 py-2">
        {calendars.map((calendar) => {
          const on = set.calendars.includes(calendar.id);
          const color = calendarColor(calendar, device.calendarColors);
          return (
            <button
              type="button"
              key={calendar.id}
              aria-pressed={on}
              onClick={() =>
                onChange({
                  ...set,
                  calendars: on
                    ? set.calendars.filter((id) => id !== calendar.id)
                    : [...set.calendars, calendar.id],
                })
              }
              className={`flex h-6 items-center gap-1.5 rounded-full px-2.5 text-small ${
                on
                  ? "bg-active text-ink"
                  : "text-ink-3 shadow-[inset_0_0_0_1px_var(--cal-edge)] hover:text-ink-2"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={on ? { background: color } : { boxShadow: `inset 0 0 0 1.5px ${color}` }}
              />
              {calendar.title}
            </button>
          );
        })}
      </div>
      <div className="border-t border-grid">
        <Row label="Show automatically" note={hours ? undefined : "Only when you pick it"}>
          <Switch
            checked={hours !== undefined}
            onChange={(on) => onChange({ ...set, hours: on ? WORK_HOURS : undefined })}
            label="Show automatically"
          />
        </Row>
      </div>
      {hours && (
        <div className="flex flex-wrap items-center gap-3 border-t border-grid px-3 py-2">
          <div className="flex gap-1">
            {DAYS.map((letter, day) => {
              const on = hours.days.includes(day);
              return (
                <button
                  type="button"
                  key={DAY_NAMES[day]}
                  aria-pressed={on}
                  aria-label={DAY_NAMES[day]}
                  onClick={() =>
                    onChange({
                      ...set,
                      hours: {
                        ...hours,
                        days: on ? hours.days.filter((each) => each !== day) : [...hours.days, day],
                      },
                    })
                  }
                  className={`h-6 w-6 rounded-full text-caption font-medium ${
                    on ? "bg-accent-solid text-white" : "text-ink-2 hover:bg-hover"
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
          <span className="flex-1" />
          <Select
            value={hours.start}
            options={times.filter(({ value }) => value < hours.end)}
            onChange={(start) => onChange({ ...set, hours: { ...hours, start } })}
            label="From"
            width={104}
          />
          <span className="text-small text-ink-3">to</span>
          <Select
            value={hours.end}
            options={times.filter(({ value }) => value > hours.start)}
            onChange={(end) => onChange({ ...set, hours: { ...hours, end } })}
            label="To"
            width={104}
          />
        </div>
      )}
    </Group>
  );
}
