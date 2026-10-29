/*
 * Repeat phrases → RRULE parts. chrono can't read recurrence ("every Monday" becomes a
 * one-off Monday) and rrule's fromText only takes whole sentences, so this is Cal's own
 * small grammar (research/10 §4.3). It runs before dates so "every Monday" is claimed
 * as a rule, and returns the span it read so the editor can highlight it.
 */

export const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export type DayCode = (typeof DAY_CODES)[number];

const DAY_NAMES: Record<string, DayCode> = {
  sun: "SU",
  sunday: "SU",
  mon: "MO",
  monday: "MO",
  tue: "TU",
  tues: "TU",
  tuesday: "TU",
  wed: "WE",
  weds: "WE",
  wednesday: "WE",
  thu: "TH",
  thur: "TH",
  thurs: "TH",
  thursday: "TH",
  fri: "FR",
  friday: "FR",
  sat: "SA",
  saturday: "SA",
};

const DAY = "(?:sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:day|nesday|sday|rsday|urday)?";
const DAY_PLURAL = "(?:sun|mon|tues|wednes|thurs|fri|satur)days";
const ORDINALS: Record<string, number> = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
  fourth: 4,
  "4th": 4,
  last: -1,
};
const ORDINAL = "(first|second|third|fourth|last|1st|2nd|3rd|4th)";
const UNIT_FREQ: Record<string, string> = {
  day: "DAILY",
  week: "WEEKLY",
  month: "MONTHLY",
  year: "YEARLY",
};
const WORD_FREQ: Record<string, [string, number]> = {
  daily: ["DAILY", 1],
  weekly: ["WEEKLY", 1],
  monthly: ["MONTHLY", 1],
  yearly: ["YEARLY", 1],
  annually: ["YEARLY", 1],
  quarterly: ["MONTHLY", 3],
};

export interface Rule {
  freq: string;
  interval: number;
  byDay?: string[];
  byMonthDay?: number;
  // `every!`: the next one counts from when the last was done (tasks).
  afterCompletion: boolean;
}

export interface RuleMatch {
  start: number;
  end: number;
  rule: Rule;
  // Where the rule's words end, before any bound.
  ruleEnd: number;
  // The text after "until" ("Dec 18 with Sam"), for the caller to read a date from the
  // start of; only the date it finds belongs to the rule.
  until?: { start: number; text: string };
  count?: number;
  // "for 3 weeks": the rule ends that long after it starts.
  span?: { count: number; unit: "day" | "week" | "month" | "year" };
}

export function dayCode(name: string): DayCode | undefined {
  const key = name.toLowerCase().replace(/s$/, "");
  return DAY_NAMES[key] ?? DAY_NAMES[name.toLowerCase()];
}

// The parts of the day list in "Mon, Wed and Fri" / "Tuesdays and Thursdays".
function dayList(text: string) {
  return text
    .split(/\s*(?:,|\band\b|&)\s*/i)
    .map((part) => dayCode(part.trim()))
    .filter((code): code is DayCode => code !== undefined);
}

const PATTERNS: { regex: RegExp; read: (match: RegExpExecArray) => Rule | undefined }[] = [
  {
    // every! 2 weeks, every other week, every 3 days, each month; weeks may name days:
    // "every 2 weeks on Monday and Wednesday"
    regex: new RegExp(
      `\\b(every|each)(!?)\\s+(?:(\\d+|other)\\s+)?(day|week|month|year)s?\\b(?:(?<=weeks?)\\s+on\\s+(${DAY}(?:\\s*(?:,|and|&)\\s*${DAY})*)\\b)?`,
      "gi",
    ),
    read: (m) => {
      const freq = UNIT_FREQ[(m[4] ?? "").toLowerCase()] ?? "DAILY";
      const days = m[5] ? dayList(m[5]) : [];
      return {
        freq,
        interval: m[3] === undefined ? 1 : m[3].toLowerCase() === "other" ? 2 : Number(m[3]),
        ...(days.length && freq === "WEEKLY" && { byDay: days }),
        afterCompletion: m[2] === "!",
      };
    },
  },
  {
    // first Friday of each month, every 3rd Tuesday, the last Monday of the month
    regex: new RegExp(
      `\\b(?:every\\s+|on\\s+)?(?:the\\s+)?${ORDINAL}\\s+(${DAY})(?:\\s+of\\s+(?:the|each|every)\\s+month)?\\b`,
      "gi",
    ),
    read: (m) => {
      const whole = m[0].toLowerCase();
      if (!whole.startsWith("every") && !whole.includes(" of ")) return undefined;
      const nth = ORDINALS[(m[1] ?? "").toLowerCase()];
      const code = dayCode(m[2] ?? "");
      return nth && code
        ? { freq: "MONTHLY", interval: 1, byDay: [`${nth}${code}`], afterCompletion: false }
        : undefined;
    },
  },
  {
    // (on) the last day of every month
    regex: /\b(?:on\s+)?(?:the\s+)?last\s+day\s+of\s+(?:the|each|every)\s+month\b/gi,
    read: () => ({ freq: "MONTHLY", interval: 1, byMonthDay: -1, afterCompletion: false }),
  },
  {
    // every weekday, weekdays, every weekend. "weekend" alone is a date ("this weekend").
    regex: /\b(?:every\s+(weekday|weekend)|(weekday|weekend)s)\b/gi,
    read: (m) => ({
      freq: "WEEKLY",
      interval: 1,
      byDay:
        (m[1] ?? m[2] ?? "").toLowerCase() === "weekday"
          ? ["MO", "TU", "WE", "TH", "FR"]
          : ["SA", "SU"],
      afterCompletion: false,
    }),
  },
  {
    // every Monday, every other Tuesday, every Mon, Wed, Fri
    regex: new RegExp(
      `\\bevery(!?)\\s+(?:(other)\\s+)?(${DAY}(?:\\s*(?:,|and|&)\\s*${DAY})*)\\b`,
      "gi",
    ),
    read: (m) => {
      const days = dayList(m[3] ?? "");
      return days.length
        ? { freq: "WEEKLY", interval: m[2] ? 2 : 1, byDay: days, afterCompletion: m[1] === "!" }
        : undefined;
    },
  },
  {
    // Tuesdays and Thursdays, Mondays
    regex: new RegExp(`\\b(${DAY_PLURAL}(?:\\s*(?:,|and|&)\\s*${DAY_PLURAL})*)\\b`, "gi"),
    read: (m) => {
      const days = dayList(m[1] ?? "");
      return days.length
        ? { freq: "WEEKLY", interval: 1, byDay: days, afterCompletion: false }
        : undefined;
    },
  },
  {
    // daily, weekly, quarterly…
    regex: /\b(daily|weekly|monthly|yearly|annually|quarterly)\b/gi,
    read: (m) => {
      const [freq, interval] = WORD_FREQ[(m[1] ?? "").toLowerCase()] ?? ["DAILY", 1];
      return { freq, interval, afterCompletion: false };
    },
  },
];

// A bound right after a rule: "until Dec 18", "through Friday", "for 3 times", "3 times".
const BOUND =
  /^\s+(?:(?:until|through|thru|ending)\s+([^,;]+)|(?:for\s+)?(\d+)\s+times\b|for\s+(\d+|a|an|one|two|three|four|six)\s+(day|week|month|year)s?\b)/i;
const SMALL_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  six: 6,
};

/**
 * The first repeat phrase in `masked` (claimed spans already blanked out), with any
 * bound that follows it. Undefined when there's none.
 */
export function findRule(masked: string): RuleMatch | undefined {
  let best: RuleMatch | undefined;
  for (const { regex, read } of PATTERNS) {
    regex.lastIndex = 0;
    for (let m = regex.exec(masked); m; m = regex.exec(masked)) {
      const rule = read(m);
      if (!rule) continue;
      const end = m.index + m[0].length;
      const match: RuleMatch = { start: m.index, end, ruleEnd: end, rule };
      // Prefer the earliest, then the longest phrase.
      const better =
        !best || match.start < best.start || (match.start === best.start && match.end > best.end);
      if (better) best = match;
      break;
    }
  }
  if (!best) return undefined;
  best.ruleEnd = best.end;
  const bound = BOUND.exec(masked.slice(best.end));
  if (bound?.[1]) {
    // The caller claims "until" plus whatever date it reads at the start of this text.
    best.until = { start: best.end + bound[0].indexOf(bound[1]), text: bound[1] };
  } else if (bound?.[2]) {
    best.count = Number(bound[2]);
    best.end += bound[0].length;
  } else if (bound?.[3] && bound[4]) {
    const unit = bound[4].toLowerCase();
    const count = SMALL_NUMBERS[bound[3].toLowerCase()] ?? Number(bound[3]);
    if (unit === "day" || unit === "week" || unit === "month" || unit === "year") {
      best.span = { count, unit };
      best.end += bound[0].length;
    }
  }
  return best;
}

// The RRULE body for a rule and its bounds.
export function toRRule(rule: Rule, bounds: { until?: string; count?: number } = {}) {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(",")}`);
  if (rule.byMonthDay !== undefined) parts.push(`BYMONTHDAY=${rule.byMonthDay}`);
  if (bounds.count) parts.push(`COUNT=${bounds.count}`);
  if (bounds.until) parts.push(`UNTIL=${bounds.until}`);
  return parts.join(";");
}

const DAY_LABELS: Record<string, string> = {
  SU: "Sun",
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
};
const NTH_LABELS: Record<string, string> = {
  "1": "first",
  "2": "second",
  "3": "third",
  "4": "fourth",
  "-1": "last",
};

// A short chip label, e.g. "Every 2 weeks on Tue" or "Monthly on the first Fri".
export function ruleLabel(rule: Rule) {
  const unit =
    { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[rule.freq] ?? "day";
  const every = rule.interval > 1 ? `Every ${rule.interval} ${unit}s` : `Every ${unit}`;
  const days = rule.byDay?.map((code) => {
    const nth = code.match(/^(-?\d)(\w\w)$/);
    return nth
      ? `the ${NTH_LABELS[nth[1] ?? ""] ?? ""} ${DAY_LABELS[nth[2] ?? ""] ?? ""}`
      : DAY_LABELS[code];
  });
  let label = every;
  if (days?.length) {
    const weekdays = days.join(",") === "Mon,Tue,Wed,Thu,Fri";
    label = weekdays && rule.interval === 1 ? "Every weekday" : `${every} on ${days.join(", ")}`;
  }
  if (rule.byMonthDay === -1) label = `${every} on the last day`;
  return rule.afterCompletion ? `${label} after done` : label;
}
