import { type DayKey, daysInMonth, fromDayKey, weekday } from "@cal/domain";

/*
 * Repeat presets for the event popover, built from the event's date like Notion's:
 * daily, weekdays, weekly on that weekday, every 2 weeks, monthly on the nth or last
 * weekday, yearly, or a custom RRULE typed by hand. Rules are RFC 5545 bodies without
 * the "RRULE:" prefix, as the calendar source stores them.
 */

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th"];

export interface RepeatPreset {
  rule: string;
  label: string;
}

const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// The presets for an event on `day`, in menu order. "" means no repeat.
export function repeatPresets(day: DayKey): RepeatPreset[] {
  const index = weekday(day);
  const code = DAY_CODES[index] ?? "MO";
  const name = DAY_NAMES[index] ?? "Monday";
  const date = Number(day.slice(8, 10));
  const nth = Math.ceil(date / 7);
  const last = date + 7 > daysInMonth(day);
  const presets: RepeatPreset[] = [
    { rule: "", label: "Does not repeat" },
    { rule: "FREQ=DAILY", label: "Daily" },
    { rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Every weekday" },
    { rule: `FREQ=WEEKLY;BYDAY=${code}`, label: `Weekly on ${name}` },
    { rule: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${code}`, label: `Every 2 weeks on ${name}` },
    { rule: `FREQ=MONTHLY;BYDAY=${nth}${code}`, label: `Monthly on the ${ORDINALS[nth]} ${name}` },
  ];
  if (last)
    presets.push({ rule: `FREQ=MONTHLY;BYDAY=-1${code}`, label: `Monthly on the last ${name}` });
  presets.push({ rule: "FREQ=YEARLY", label: `Yearly on ${monthDay.format(fromDayKey(day))}` });
  return presets;
}

// A short reading of a rule that isn't one of the presets, e.g. "Every 3 days".
export function describeRule(rule: string) {
  const parts = new Map(rule.split(";").map((part) => part.split("=") as [string, string]));
  const freq = parts.get("FREQ")?.toLowerCase();
  const interval = Number(parts.get("INTERVAL") ?? 1);
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[freq ?? ""];
  if (!unit) return "Custom";
  const every = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  const byDay = parts.get("BYDAY");
  const days = byDay
    ? byDay
        .split(",")
        .map((each) => DAY_NAMES[DAY_CODES.indexOf(each.slice(-2) as (typeof DAY_CODES)[number])])
        .filter((each): each is string => Boolean(each))
    : [];
  const tail = days.length ? ` on ${days.map((each) => each.slice(0, 3)).join(", ")}` : "";
  const count = parts.get("COUNT");
  const until = parts.get("UNTIL");
  const end = count ? `, ${count} times` : until ? `, until ${until.slice(0, 10)}` : "";
  return `${every}${tail}${end}`;
}
