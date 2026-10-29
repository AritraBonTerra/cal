import * as Calendar from "expo-calendar/legacy";

/*
 * RRULE strings (without "RRULE:") ↔ expo-calendar's RecurrenceRule, the iOS twin of
 * calkit's Rules.swift. Cal keeps repeats as RRULE text everywhere else.
 */

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQUENCIES: Record<string, Calendar.Frequency> = {
  DAILY: Calendar.Frequency.DAILY,
  WEEKLY: Calendar.Frequency.WEEKLY,
  MONTHLY: Calendar.Frequency.MONTHLY,
  YEARLY: Calendar.Frequency.YEARLY,
};

const numbers = (value?: string) => value?.split(",").map(Number).filter(Number.isFinite);

// An UNTIL value (20261218T171500Z or 20261218) as a Date.
function untilDate(value: string) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/.exec(value);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return m[4] === undefined
    ? new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, 23, 59, 59)
    : new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0));
}

export function toExpoRule(rrule: string): Calendar.RecurrenceRule {
  const parts = Object.fromEntries(
    rrule.split(";").map((pair) => {
      const [key = "", value = ""] = pair.split("=");
      return [key.toUpperCase(), value];
    }),
  );
  const frequency = FREQUENCIES[parts.FREQ ?? ""];
  if (!frequency) throw new Error(`Unsupported repeat rule ${rrule}`);
  const rule: Calendar.RecurrenceRule = { frequency, interval: Number(parts.INTERVAL ?? 1) };
  if (parts.BYDAY) {
    rule.daysOfTheWeek = parts.BYDAY.split(",").map((entry) => {
      const weekNumber = Number(entry.slice(0, -2)) || undefined;
      return { dayOfTheWeek: DAYS.indexOf(entry.slice(-2)) + 1, ...(weekNumber && { weekNumber }) };
    });
  }
  const monthDays = numbers(parts.BYMONTHDAY);
  if (monthDays?.length) rule.daysOfTheMonth = monthDays;
  const months = numbers(parts.BYMONTH);
  if (months?.length) rule.monthsOfTheYear = months;
  const positions = numbers(parts.BYSETPOS);
  if (positions?.length) rule.setPositions = positions;
  if (parts.COUNT) rule.occurrence = Number(parts.COUNT);
  else if (parts.UNTIL) rule.endDate = untilDate(parts.UNTIL);
  return rule;
}

const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function fromExpoRule(rule: Calendar.RecurrenceRule) {
  const freq = Object.entries(FREQUENCIES).find(([, value]) => value === rule.frequency)?.[0];
  const parts = [`FREQ=${freq ?? "DAILY"}`];
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.daysOfTheWeek?.length) {
    const days = rule.daysOfTheWeek.map(
      ({ dayOfTheWeek, weekNumber }) => `${weekNumber || ""}${DAYS[dayOfTheWeek - 1] ?? "MO"}`,
    );
    parts.push(`BYDAY=${days.join(",")}`);
  }
  if (rule.daysOfTheMonth?.length) parts.push(`BYMONTHDAY=${rule.daysOfTheMonth.join(",")}`);
  if (rule.monthsOfTheYear?.length) parts.push(`BYMONTH=${rule.monthsOfTheYear.join(",")}`);
  if (rule.setPositions?.length) parts.push(`BYSETPOS=${rule.setPositions.join(",")}`);
  if (rule.occurrence) parts.push(`COUNT=${rule.occurrence}`);
  else if (rule.endDate) parts.push(`UNTIL=${stamp(new Date(rule.endDate))}`);
  return parts.join(";");
}
