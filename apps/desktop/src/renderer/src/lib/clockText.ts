/*
 * Typed times and durations in the event popover, following Cron's rules: "16:30",
 * "4:30pm", "4p" and bare hours where 8–11 mean AM, 12 means noon and 1–7 mean PM.
 */

const CLOCK = /^\s*(\d{1,2})(?::(\d{2}))?\s*(a|am|p|pm)?\s*$/i;

// Minutes after midnight for a typed time, or undefined when it isn't one.
export function parseClock(text: string): number | undefined {
  const match = CLOCK.exec(text);
  if (!match) return undefined;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase().charAt(0);
  if (hours > 24 || minutes > 59) return undefined;
  if (meridiem === "a") hours = hours % 12;
  else if (meridiem === "p") hours = (hours % 12) + 12;
  // No suffix: 24-hour when it only makes sense that way, else the working-day reading.
  else if (hours <= 7 && hours >= 1) hours += 12;
  return (hours % 24) * 60 + minutes;
}

const DURATION =
  /^\s*(?:(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)(?:\s*(\d{1,2})\s*(?:m|min|mins)?)?|(\d+)\s*(?:m|min|mins|minutes)?|(\d+):(\d{2}))\s*$/i;

// Minutes for a typed length: "45", "45m", "1h", "1h30", "1.5h", "1:30".
export function parseDurationText(text: string): number | undefined {
  const match = DURATION.exec(text);
  if (!match) return undefined;
  if (match[1]) return Math.round(Number(match[1]) * 60 + Number(match[3] ?? 0));
  if (match[4]) return Number(match[4]);
  return Number(match[5]) * 60 + Number(match[6]);
}
