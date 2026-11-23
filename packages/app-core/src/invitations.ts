import type { ExternalEvent } from "@cal/calendar-source";

/**
 * Invitations still waiting for the user's answer: events ahead they were invited to and
 * haven't replied to, soonest first. A repeating one counts once, at its next occurrence,
 * since one answer covers the series.
 */
export function pendingInvitations(events: readonly ExternalEvent[], now: Date) {
  const seen = new Set<string>();
  return events
    .filter((event) => event.myStatus === "pending" && Date.parse(event.end) > now.getTime())
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .filter((event) => {
      const series = seriesOf(event.id);
      if (seen.has(series)) return false;
      seen.add(series);
      return true;
    });
}

// An occurrence's id is its series' identifier, "|" and its start (see calkit).
const seriesOf = (id: string) => id.split("|")[0] ?? id;
