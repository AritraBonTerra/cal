import type { AccountSettings, DeviceSettings } from "@cal/app-core";

/*
 * Screens captured by `bun run screenshots` for design review rounds. Each scene starts
 * from a fresh fixture launch (seeded data, clock at Wed 2026-10-28 10:40), seeds any
 * `settings`, then plays `keys` with Playwright's key names ("Meta+k", "ArrowRight",
 * "7"), types `text`, presses `after`, and clicks `click` (a CSS selector) before the
 * capture. `steps` runs any sequence of those in order instead.
 */
export type Step = { press: string } | { type: string } | { click: string } | { wait: number };

export interface Scene {
  name: string;
  width?: number;
  height?: number;
  dark?: boolean;
  // Account and device settings applied before the first key, as if the user had set them.
  settings?: { account?: Partial<AccountSettings>; device?: Partial<DeviceSettings> };
  keys?: string[];
  text?: string;
  after?: string[];
  click?: string;
  steps?: Step[];
}

// The Standup occurrence on the fixture Wednesday: a repeating event with reminders.
const STANDUP = "[data-item^='event:standup|2026-10-28'] > div";

export const scenes: Scene[] = [
  { name: "week-light" },
  { name: "week-dark", dark: true },
  { name: "day", keys: ["1"] },
  { name: "three-day", keys: ["3"] },
  { name: "month", keys: ["m"] },
  { name: "palette", keys: ["Meta+k"] },
  { name: "shortcuts", keys: ["?"] },
  {
    name: "quick-entry",
    keys: ["Meta+Shift+n"],
    text: "Call the movers tomorrow 3pm ~30m !fri p2 /launch",
  },
  { name: "today", keys: ["ArrowDown", "ArrowDown"] },
  { name: "when-picker", keys: ["ArrowDown", "Meta+s"] },
  { name: "block-selected", click: "[data-item^='block:'] [data-edge=end] >> xpath=.." },
  {
    name: "sign-in",
    keys: ["Meta+k"],
    text: "sign in",
    click: "[role=option][aria-selected=true]",
  },
  { name: "narrow", width: 860, height: 700 },
  // The grid fills a tall window: no blank space under 11 PM.
  { name: "tall-fit", width: 1440, height: 1200, settings: { device: { hourHeight: 0 } } },
  { name: "zoomed-in", keys: ["Meta+Shift+.", "Meta+Shift+."] },
  { name: "zoomed-in-dark", dark: true, keys: ["Meta+Shift+.", "Meta+Shift+."] },
  { name: "sidebar-collapsed", keys: ["Meta+\\"] },
  // Both panes hidden: the title clears the traffic lights and the pane toggles.
  { name: "panes-collapsed", keys: ["Meta+\\", "Meta+/"] },
  // The sidebar's + menu, and a project just made with ⌥⌘N, its title being typed.
  { name: "new-list-menu", click: "[data-new-list]" },
  { name: "new-project", keys: ["Meta+Alt+n"], text: "Garden" },
  { name: "new-project-dark", dark: true, keys: ["Meta+Alt+n"], text: "Garden" },
  // New Habit… from the + beside the habit strip, set to a weekly quota.
  {
    name: "new-habit",
    steps: [
      { click: "button[aria-label='New Habit…']" },
      { type: "Stretch" },
      { click: "[role=radio]:has-text('Times per')" },
    ],
  },
  {
    name: "new-habit-dark",
    dark: true,
    steps: [
      { click: "button[aria-label='New Habit…']" },
      { type: "Read" },
      { click: "[role=radio]:has-text('On days')" },
      { click: "[role=radio]:has-text('An amount')" },
    ],
  },
  // The to-do bar's Move menu for the selected to-do (⇧⌘M).
  { name: "task-move", keys: ["ArrowDown", "Meta+Shift+m"] },
  { name: "task-move-dark", dark: true, keys: ["ArrowDown", "Meta+Shift+m"] },
  // The sidebar's mini month and calendar list, one calendar hidden (an outlined swatch).
  { name: "sidebar-calendars", settings: { device: { hiddenCalendars: ["holidays"] } } },
  {
    name: "sidebar-calendars-dark",
    dark: true,
    settings: { device: { hiddenCalendars: ["holidays"] } },
  },
  // A click on Nov 4 shows its week and flashes the day; the mini month bands it.
  {
    name: "mini-month-jump",
    click: "[data-mini-month] button[aria-label='Wednesday, November 4']",
  },
  // Both sections collapsed to their headings.
  {
    name: "sidebar-sections-collapsed",
    settings: { device: { showMiniMonth: false, showCalendarList: false } },
  },
  // A short, narrow window: the lists scroll between the month and the footer.
  { name: "sidebar-short", width: 760, height: 520, keys: ["Meta+\\"] },
  // Smart-list icons in their own colors; Upcoming is the active row and the pane header.
  { name: "list-colors", keys: ["Meta+3"] },
  { name: "list-colors-dark", dark: true, keys: ["Meta+3"] },
  { name: "settings-general", keys: ["Meta+,"] },
  { name: "settings-general-dark", dark: true, keys: ["Meta+,"] },
  { name: "settings-grid", keys: ["Meta+,"], click: "[data-section=grid]" },
  { name: "settings-calendars", keys: ["Meta+,"], click: "[data-section=calendars]" },
  {
    name: "settings-zones",
    settings: {
      account: { timeZones: [{ zone: "Europe/London", label: "Ldn" }, { zone: "Asia/Kolkata" }] },
    },
    keys: ["Meta+,"],
    click: "[data-section=zones]",
  },
  {
    name: "two-zones",
    settings: {
      account: { timeZones: [{ zone: "Europe/London", label: "Ldn" }, { zone: "Asia/Kolkata" }] },
    },
  },
  {
    name: "two-zones-dark",
    dark: true,
    settings: {
      account: { timeZones: [{ zone: "Europe/London", label: "Ldn" }, { zone: "Asia/Kolkata" }] },
    },
  },
  { name: "zone-picker", keys: ["z"], text: "tok" },
  { name: "travel", keys: ["z"], text: "tokyo", after: ["Enter"] },
  // The event popover on a draft made with `C` (the next free slot after 10:40).
  { name: "event-create", keys: ["c"], text: "Coffee with Sam at Blue Bottle" },
  { name: "event-create-dark", dark: true, keys: ["c"], text: "Coffee with Sam at Blue Bottle" },
  // A drag-made draft with a parsed time, moved by its title to tomorrow at 3.
  {
    name: "event-create-parsed",
    keys: ["c"],
    text: "Design sync tomorrow 3pm for 45m alert 15m every weekday",
  },
  { name: "event-edit", click: STANDUP },
  { name: "event-edit-dark", dark: true, click: STANDUP },
  { name: "event-attendees", click: "[data-item='event:fixture-6'] > div" },
  // Halloween sits on the subscribed Holidays calendar: the popover opens view-only.
  { name: "event-readonly", click: "[data-item='event:fixture-19']" },
  {
    name: "span-dialog",
    steps: [{ click: STANDUP }, { press: "Meta+a" }, { type: "Daily standup" }, { press: "Enter" }],
  },
  {
    name: "event-deleted-toast",
    steps: [
      { click: "[data-item='event:fixture-12'] > div" },
      { press: "Escape" },
      { press: "Backspace" },
    ],
  },
  {
    name: "quick-entry-event",
    keys: ["Meta+Shift+n", "Meta+1"],
    text: "Sunday school planning tomorrow at 3 for 45m at Blue Bottle",
  },
  {
    name: "quick-entry-event-dark",
    dark: true,
    keys: ["Meta+Shift+n", "Meta+1"],
    text: "Lunch with Sam tomorrow 1pm for 1h alert 10m",
  },
  {
    name: "settings-live",
    settings: {
      account: { showWeekends: false, weekNumbers: true, timeFormat: "24h" },
      device: {
        halfHourLines: true,
        calendarColors: { work: "#8e4ec6" },
        hiddenCalendars: ["family"],
      },
    },
  },
];
