/*
 * Video-call links in events. A calendar has no field for them: invitations put the
 * link in the URL, the location or the notes (plain text or HTML), sometimes behind a
 * mail filter's redirect. Both apps find it here, so a Join button always agrees.
 */

// The services Cal knows, with the URLs that join a call there. Help pages, dial-in
// lists and settings on the same hosts are not calls, so each matches on path too.
const SERVICES = [
  {
    name: "Zoom",
    hosts: ["zoom.us", "zoom.com", "zoomgov.com"],
    path: /^\/(?:j|s|w|my|wc\/join)\/[^/]+|^\/wc\/\d+\/join/,
  },
  {
    name: "Google Meet",
    hosts: ["meet.google.com"],
    path: /^\/(?:[a-z]{3}-[a-z]{4}-[a-z]{3}|lookup\/[^/]+)/i,
  },
  {
    name: "Microsoft Teams",
    hosts: ["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"],
    path: /^\/(?:l\/meetup-join|meet)\/[^/]+/,
  },
  {
    name: "Webex",
    hosts: ["webex.com"],
    path: /^\/(?:meet|join)\/[^/]+|\/j\.php$|\/wbxmjs\/joinservice|^\/webappng\/.*\/meeting\//,
  },
  { name: "FaceTime", hosts: ["facetime.apple.com"], path: /^\/join/ },
  { name: "GoTo Meeting", hosts: ["meet.goto.com", "gotomeet.me"], path: /^\/[^/]+/ },
  { name: "Whereby", hosts: ["whereby.com"], path: /^\/[^/]+/ },
  { name: "Jitsi", hosts: ["meet.jit.si"], path: /^\/[^/]+/ },
  { name: "Slack", hosts: ["app.slack.com"], path: /^\/huddle\/[^/]+/ },
] as const;

export type MeetingService = (typeof SERVICES)[number]["name"];

export interface Meeting {
  service: MeetingService;
  // The https link.
  url: string;
  // The same call as the service's own app URL, which opens it without a browser tab.
  // Only for links known to carry over whole.
  nativeUrl?: string;
}

// Whether `host` is `domain` or a subdomain of it ("us02web.zoom.us").
const under = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

function parseUrl(text: string) {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}

// The link a mail filter or Google wraps in a redirect of its own, else the link itself.
function unwrapped(url: URL): URL {
  const target = under(url.hostname, "safelinks.protection.outlook.com")
    ? url.searchParams.get("url")
    : under(url.hostname, "google.com") && url.pathname === "/url"
      ? (url.searchParams.get("q") ?? url.searchParams.get("url"))
      : null;
  return (target && parseUrl(target)) || url;
}

/**
 * Zoom's app URL for a plain meeting link ("/j/<number>?pwd=…"). Personal links, webinars
 * and registered links (`tk`) carry details only Zoom's site can resolve, so they have none.
 */
function zoomApp(url: URL) {
  const number = /^\/j\/(\d{9,12})\/?$/.exec(url.pathname)?.[1];
  if (!number || url.searchParams.has("tk")) return undefined;
  const params = new URLSearchParams({ action: "join", confno: number });
  const password = url.searchParams.get("pwd");
  if (password) params.set("pwd", password);
  return `zoommtg://${url.hostname}/join?${params}`;
}

// The call `text` links to, when the whole text is a meeting URL.
export function meetingFromUrl(text: string): Meeting | undefined {
  const given = parseUrl(text.trim());
  const url = given && unwrapped(given);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return undefined;
  // Never a link that carries credentials or a port: no service uses either.
  if (url.username || url.password || url.port) return undefined;
  url.protocol = "https:";
  const service = SERVICES.find(
    ({ hosts, path }) => hosts.some((host) => under(url.hostname, host)) && path.test(url.pathname),
  );
  if (!service) return undefined;
  const nativeUrl = service.name === "Zoom" ? zoomApp(url) : undefined;
  return { service: service.name, url: url.href, ...(nativeUrl && { nativeUrl }) };
}

// A link inside text or HTML, up to the punctuation a sentence puts after it.
const LINK = /https?:\/\/[^\s<>"'\\^`{|}]*[^\s<>"'\\^`{|}.,;:!?)\]]/gi;

const linksIn = (text: string) =>
  [...text.matchAll(LINK)].map(([link]) => link.replaceAll("&amp;", "&"));

/**
 * The call an event links to: its URL first, then its location, then its notes; within
 * each, the first link that joins a call.
 */
export function meetingOf(event: {
  url?: string;
  location?: string;
  notes?: string;
}): Meeting | undefined {
  for (const text of [event.url, event.location, event.notes]) {
    for (const link of text ? linksIn(text) : []) {
      const meeting = meetingFromUrl(link);
      if (meeting) return meeting;
    }
  }
  return undefined;
}

/**
 * Where an event happens, in words: its location, with a link to a call read as the
 * service ("Zoom") instead of a raw URL. An event with only a call is at the call.
 */
export function placeOf(event: { url?: string; location?: string; notes?: string }) {
  const location = event.location?.trim();
  if (!location) return meetingOf(event)?.service;
  return location.replace(LINK, (link) => meetingFromUrl(link)?.service ?? link);
}

// How long before its start a call can be joined with one press.
export const JOIN_LEAD_MIN = 10;

interface Timed {
  start: string;
  end: string;
  allDay: boolean;
  myStatus?: string;
}

// Whether a timed event is on now or starts within JOIN_LEAD_MIN: when its Join shows.
export const joinable = (event: Timed, now: Date) =>
  !event.allDay &&
  Date.parse(event.start) - JOIN_LEAD_MIN * 60_000 <= now.getTime() &&
  Date.parse(event.end) > now.getTime();

/**
 * The event whose call to join at `now`: of those joinable, the one that started last
 * (a call about to start beats one running over); with none, the next to start.
 * Declined and all-day events and events without a call don't count.
 */
export function eventToJoin<T extends Timed & { url?: string; location?: string; notes?: string }>(
  events: readonly T[],
  now: Date,
): T | undefined {
  const calls = events
    .filter(
      (event) =>
        !event.allDay &&
        event.myStatus !== "declined" &&
        Date.parse(event.end) > now.getTime() &&
        meetingOf(event) !== undefined,
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return calls.findLast((event) => joinable(event, now)) ?? calls[0];
}
