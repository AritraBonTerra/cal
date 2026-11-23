import { describe, expect, test } from "bun:test";
import { eventToJoin, joinable, meetingFromUrl, meetingOf, placeOf } from "../src";

describe("meetingFromUrl", () => {
  test("knows each service's join links", () => {
    const links = {
      "https://us02web.zoom.us/j/81234567890?pwd=abc": "Zoom",
      "https://acme.zoom.us/my/priya": "Zoom",
      "https://zoomgov.com/j/1601234567": "Zoom",
      "https://meet.google.com/abc-defg-hij": "Google Meet",
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0?context=%7b%7d":
        "Microsoft Teams",
      "https://teams.live.com/meet/9361234567": "Microsoft Teams",
      "https://acme.webex.com/meet/priya": "Webex",
      "https://facetime.apple.com/join#v=1&p=abc": "FaceTime",
      "https://whereby.com/standup": "Whereby",
    };
    for (const [url, service] of Object.entries(links)) {
      expect(meetingFromUrl(url)?.service as string).toBe(service);
    }
  });

  test("leaves other pages alone, on the services' own sites and on look-alikes", () => {
    for (const url of [
      "https://zoom.us/pricing",
      "https://us02web.zoom.us/u/kdXyZ",
      "https://meet.google.com/landing",
      "https://evil.example/?u=https://zoom.us/j/81234567890",
      "https://notzoom.us/j/81234567890",
      "https://zoom.us.evil.example/j/81234567890",
      "https://zoom.us@evil.example/j/81234567890",
      "https://me@zoom.us/j/81234567890",
      "javascript:alert(1)//zoom.us/j/81234567890",
      "not a url",
    ]) {
      expect(meetingFromUrl(url)).toBeUndefined();
    }
  });

  test("gives plain Zoom meetings the app's URL, password included", () => {
    expect(meetingFromUrl("https://us02web.zoom.us/j/81234567890?pwd=a%2Bb.1")?.nativeUrl).toBe(
      "zoommtg://us02web.zoom.us/join?action=join&confno=81234567890&pwd=a%2Bb.1",
    );
    for (const url of [
      "https://zoom.us/my/priya",
      "https://zoom.us/w/81234567890?tk=abc",
      "https://zoom.us/j/81234567890?tk=abc",
      "https://meet.google.com/abc-defg-hij",
    ]) {
      expect(meetingFromUrl(url)?.nativeUrl).toBeUndefined();
    }
  });

  test("unwraps Outlook and Google redirects", () => {
    const zoom = "https://us02web.zoom.us/j/81234567890?pwd=abc";
    const safe = `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(zoom)}&data=05`;
    expect(meetingFromUrl(safe)?.url).toBe(zoom);
    expect(
      meetingFromUrl(`https://www.google.com/url?q=${encodeURIComponent(zoom)}&sa=D`)?.url,
    ).toBe(zoom);
  });

  test("always joins over https", () => {
    expect(meetingFromUrl("http://zoom.us/j/81234567890")?.url).toBe(
      "https://zoom.us/j/81234567890",
    );
  });
});

describe("meetingOf", () => {
  const zoom = "https://zoom.us/j/81234567890?pwd=abc";
  const meet = "https://meet.google.com/abc-defg-hij";

  test("reads the URL, then the location, then the notes", () => {
    expect(meetingOf({ url: zoom, location: meet })?.service).toBe("Zoom");
    expect(meetingOf({ url: "https://acme.com/doc", location: meet })?.service).toBe("Google Meet");
    expect(meetingOf({ location: "Room 4", notes: `Join here: ${zoom}.` })?.url).toBe(zoom);
    expect(meetingOf({ location: "Zoom" })).toBeUndefined();
  });

  test("finds links in HTML notes and after links that aren't calls", () => {
    const html = `<p>Agenda: <a href="https://acme.com/doc">doc</a></p><a href="https://zoom.us/j/81234567890?pwd=abc&amp;from=addon">Join</a>`;
    expect(meetingOf({ notes: html })?.url).toBe(
      "https://zoom.us/j/81234567890?pwd=abc&from=addon",
    );
    expect(meetingOf({ notes: `(${meet})` })?.url).toBe(meet);
    expect(meetingOf({ notes: `Teams <${meet}>` })?.url).toBe(meet);
  });
});

test("a place names the call instead of showing its URL", () => {
  expect(placeOf({ location: "https://zoom.us/j/81234567890" })).toBe("Zoom");
  expect(placeOf({ location: "Room 4; https://zoom.us/j/81234567890" })).toBe("Room 4; Zoom");
  expect(placeOf({ location: "https://zoom.us/j/81234567890, Room 4" })).toBe("Zoom, Room 4");
  expect(placeOf({ location: "Chez Marcel" })).toBe("Chez Marcel");
  expect(placeOf({ url: "https://meet.google.com/abc-defg-hij" })).toBe("Google Meet");
  expect(placeOf({})).toBeUndefined();
});

describe("which call to join", () => {
  const now = new Date("2026-10-28T10:40:00-07:00");
  const call = (title: string, start: string, end: string, extra = {}) => ({
    title,
    start: `2026-10-28T${start}:00-07:00`,
    end: `2026-10-28T${end}:00-07:00`,
    allDay: false,
    url: "https://zoom.us/j/81234567890",
    ...extra,
  });

  test("shows Join from ten minutes before until the end", () => {
    expect(joinable(call("soon", "10:50", "11:00"), now)).toBe(true);
    expect(joinable(call("later", "10:51", "11:00"), now)).toBe(false);
    expect(joinable(call("over", "10:00", "10:40"), now)).toBe(false);
    expect(joinable(call("day", "00:00", "23:59", { allDay: true }), now)).toBe(false);
  });

  test("prefers the call about to start over one running over, else the next", () => {
    const running = call("running", "10:00", "11:00");
    const soon = call("soon", "10:45", "11:15");
    const later = call("later", "15:00", "16:00");
    expect(eventToJoin([later, running, soon], now)?.title).toBe("soon");
    expect(eventToJoin([later, running], now)?.title).toBe("running");
    expect(eventToJoin([later], now)?.title).toBe("later");
  });

  test("skips events without a call, declined ones and ones that are over", () => {
    const events = [
      call("no call", "10:45", "11:00", { url: undefined }),
      call("declined", "10:45", "11:00", { myStatus: "declined" }),
      call("over", "09:00", "10:00"),
    ];
    expect(eventToJoin(events, now)).toBeUndefined();
  });
});
