import { type DayKey, toDayKey } from "@cal/domain";
import * as chrono from "chrono-node";

export type TokenKind = "when" | "evening" | "deadline" | "estimate" | "priority" | "project";

// A recognized part of the input, for highlighting it as the user types.
export interface Token {
  kind: TokenKind;
  start: number;
  end: number;
}

export interface QuickEntry {
  title: string;
  when?: "date" | "evening" | "someday" | "anytime";
  when_date?: DayKey;
  // A specific time from the input ("tomorrow 3pm"), to place a block on the calendar.
  start_at?: Date;
  deadline?: DayKey;
  estimate_min?: number;
  priority?: number;
  project_uuid?: string;
  tokens: Token[];
}

const ESTIMATE = /(?<=^|\s)~(?:(\d+)h(?:(\d+)m?)?|(\d+)m?)(?=\s|$)/gi;
const PRIORITY = /(?<=^|\s)p([1-4])(?=\s|$)/gi;
const PROJECT = /(?<=^|\s)\/(\S+)/g;
const EVENING = /(?<=^|\s)(tonight|this evening)(?=\s|$)/gi;
const LATER = /(?<=^|\s)(someday|anytime)(?=\s|$)/gi;
const DEADLINE = /(?<=^|\s)!(?:deadline\s+|due\s+)?/gi;

/**
 * Parses Quick Entry text such as "Write report tomorrow ~45m p1 !fri /work":
 * - a date or time ("tomorrow", "next tue 3pm") sets When; "tonight" sets This Evening;
 *   a lone "someday" or "anytime" sets those lists
 * - `!` before a date ("!fri", "!deadline nov 3") sets the deadline
 * - `~45m`, `~2h`, `~1h30` set the estimate; `p1`–`p4` the priority
 * - `/name` picks the first project whose title starts with `name`
 * Everything else is the title. Dates are read relative to `now`, always forward.
 */
export function parseQuickEntry(
  text: string,
  now: Date,
  projects: readonly { uuid: string; title: string }[] = [],
): QuickEntry {
  const entry: QuickEntry = { title: "", tokens: [] };
  const taken: Token[] = [];
  const take = (kind: TokenKind, start: number, end: number) => {
    if (taken.some((token) => start < token.end && end > token.start)) return false;
    taken.push({ kind, start, end });
    return true;
  };

  for (const match of text.matchAll(ESTIMATE)) {
    const [, hours, minutes, plain] = match;
    const value = hours ? Number(hours) * 60 + Number(minutes ?? 0) : Number(plain);
    if (value > 0 && take("estimate", match.index, match.index + match[0].length)) {
      entry.estimate_min = value;
    }
  }
  for (const match of text.matchAll(PRIORITY)) {
    if (take("priority", match.index, match.index + match[0].length)) {
      entry.priority = Number(match[1]);
    }
  }
  for (const match of text.matchAll(PROJECT)) {
    const name = (match[1] ?? "").toLowerCase();
    const project = projects.find((each) => each.title.toLowerCase().startsWith(name));
    if (project && take("project", match.index, match.index + match[0].length)) {
      entry.project_uuid = project.uuid;
    }
  }
  for (const match of text.matchAll(DEADLINE)) {
    const rest = text.slice(match.index + match[0].length);
    const [date] = chrono.parse(rest, now, { forwardDate: true });
    if (date?.index !== 0) continue;
    const end = match.index + match[0].length + date.text.length;
    if (take("deadline", match.index, end)) entry.deadline = toDayKey(date.start.date());
  }
  // Dates first, so "tonight at 8pm" stays one phrase and keeps its time.
  for (const date of chrono.parse(text, now, { forwardDate: true })) {
    const evening = new RegExp(EVENING.source, "i").test(date.text);
    if (!take(evening ? "evening" : "when", date.index, date.index + date.text.length)) continue;
    let start = date.start.date();
    // "Tonight" is always today's evening, even after chrono's implied 20:00 has passed.
    if (evening) {
      start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        start.getHours(),
        start.getMinutes(),
      );
    }
    entry.when_date = toDayKey(start);
    entry.when = evening ? "evening" : "date";
    if (date.start.isCertain("hour")) entry.start_at = start;
    break;
  }
  for (const match of text.matchAll(EVENING)) {
    if (take("evening", match.index, match.index + match[0].length)) {
      entry.when = "evening";
      entry.when_date = toDayKey(now);
    }
  }
  for (const match of text.matchAll(LATER)) {
    if (entry.when) break;
    if (take("when", match.index, match.index + match[0].length)) {
      entry.when = match[1]?.toLowerCase() === "someday" ? "someday" : "anytime";
    }
  }

  entry.tokens = taken.sort((a, b) => a.start - b.start);
  let title = "";
  let cursor = 0;
  for (const token of entry.tokens) {
    title += `${text.slice(cursor, token.start)} `;
    cursor = token.end;
  }
  entry.title = `${title}${text.slice(cursor)}`.replace(/\s+/g, " ").trim();
  return entry;
}
