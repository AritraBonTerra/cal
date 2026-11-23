import type { ExternalEvent } from "@cal/calendar-source";
import { eventToJoin, meetingOf } from "@cal/domain";
import { now } from "./clock";
import { editorStore } from "./events";
import { showToast } from "./toast";
import { ui } from "./ui";

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
 * Joins a call (Join Call, ⌘J): the open event's as its fields stand, else the selected
 * event's, else the one on now or up next. A selected event without a call doesn't fall
 * through to another event's.
 */
export function joinCall(events: readonly ExternalEvent[], upcoming: readonly ExternalEvent[]) {
  const { editor } = editorStore.get();
  const { selection } = ui.get();
  const open = editor?.mode === "edit" ? editor.form : undefined;
  const selected =
    selection?.kind === "event"
      ? [...events, ...upcoming].find((event) => event.id === selection.id)
      : undefined;
  const chosen = open !== undefined || selection?.kind === "event";
  const target = open ?? selected ?? (chosen ? undefined : eventToJoin(upcoming, now()));
  const meeting = target && meetingOf(target);
  if (meeting) openMeeting(meeting.url);
  else showToast(chosen ? "That event has no call to join." : "No calls coming up.");
}
