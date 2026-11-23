import type { ExternalEvent } from "@cal/calendar-source";
import { eventToJoin, meetingOf } from "@cal/domain";
import { now } from "./clock";
import { showToast } from "./toast";

// Opens the call at `url` in its app or the browser, saying so when it can't.
export function openMeeting(url: string) {
  window.cal.joinMeeting(url).then(
    (opened) => {
      if (!opened) showToast("Cal doesn't know how to join that link.");
    },
    () => showToast("Couldn't open the call."),
  );
}

/**
 * Joins a call: the selected event's, else the one on now or up next (Join Call, ⌘J). A
 * selected event without a call doesn't fall through to another event's.
 */
export function joinCall(selected: ExternalEvent | undefined, upcoming: readonly ExternalEvent[]) {
  const event = selected ?? eventToJoin(upcoming, now());
  const meeting = event && meetingOf(event);
  if (meeting) openMeeting(meeting.url);
  else showToast(selected ? "That event has no call to join." : "No calls coming up.");
}
