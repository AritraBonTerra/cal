import { meetingFromUrl } from "@cal/domain";
import type { CalendarTarget } from "../shared/api";

export interface JoinOptions {
  // The app macOS opens `url`'s scheme with; "" when there is none.
  handlerFor(url: string): string;
  open(url: string): Promise<void>;
}

/**
 * Joins a call from its link: in the service's own app when one is installed, so no
 * browser tab is left behind, else at the https link. Only links `meetingFromUrl`
 * recognizes open, and the app URL is rebuilt here from the link, so a page can't hand
 * over a scheme of its own. Resolves with whether a call opened.
 */
export function createJoin({ handlerFor, open }: JoinOptions) {
  return async (url: unknown) => {
    const meeting = typeof url === "string" ? meetingFromUrl(url) : undefined;
    if (!meeting) return false;
    const { nativeUrl } = meeting;
    if (nativeUrl && handlerFor(nativeUrl)) {
      try {
        await open(nativeUrl);
        return true;
      } catch {
        // The app is registered but wouldn't open; the browser still can.
      }
    }
    await open(meeting.url);
    return true;
  };
}

const digits = (value: number) => String(value).padStart(2, "0");

/**
 * Apple Calendar's link to an event, by EventKit's item identifier. A repeating one also
 * names the occurrence's start: in UTC, or an all-day event's own day.
 */
export function calendarUrl({ itemId, start, recurring, allDay }: CalendarTarget) {
  const at = new Date(start);
  const stamp = allDay
    ? `${at.getFullYear()}${digits(at.getMonth() + 1)}${digits(at.getDate())}T000000Z`
    : at.toISOString().replace(/[-:]|\.\d+/g, "");
  return `ical://ekevent/${recurring ? `${stamp}/` : ""}${encodeURIComponent(itemId)}?method=show&options=more`;
}
