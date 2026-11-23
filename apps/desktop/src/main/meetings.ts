import { meetingFromUrl } from "@cal/domain";

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

// Apple Calendar's URL for an event. Occurrence ids carry their start after a "|".
export const calendarUrl = (eventId: string) =>
  `ical://ekevent/${encodeURIComponent(eventId.split("|")[0] ?? "")}?method=show&options=more`;
