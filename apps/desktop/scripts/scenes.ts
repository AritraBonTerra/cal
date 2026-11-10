import type { AccountSettings, DeviceSettings } from "@cal/app-core";

/*
 * Screens captured by `bun run screenshots` for design review rounds. Each scene starts
 * from a fresh fixture launch (seeded data, clock at Wed 2026-10-28 10:40), seeds any
 * `settings`, then plays `keys` with Playwright's key names ("Meta+k", "ArrowRight",
 * "7"), types `text`, presses `after`, and clicks `click` (a CSS selector) before the
 * capture. `steps` runs any sequence of those in order instead, plus pointer moves to a
 * window point (`move`) or onto an element (`hover`, a CSS selector), right-clicks
 * (`context`, a CSS selector), and scrolling an element to the top of its list (`reveal`).
 */
export type Step =
  | { press: string }
  | { type: string }
  | { click: string }
  | { context: string }
  | { move: { x: number; y: number } }
  | { hover: string }
  | { reveal: string }
  | { wait: number };

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

// Archives every fixture habit from the sidebar's Habits, for the no-habits state.
const NO_HABITS: Step[] = ["Gym", "Read", "Meditate"].flatMap((title) => [
  { context: `[data-habit-list] li:has-text('${title}') button` },
  { click: "[role=menuitem]:has-text('Archive')" },
]);

// The Standup occurrence on the fixture Wednesday: a repeating event with reminders.
const STANDUP = "[data-item^='event:standup|2026-10-28'] > div";
// Shortcut overrides: Quick Entry on ⌘N too (shared with New To-Do), Today unbound, and
// a second key for the command menu.
const SHORTCUT_CHANGES = {
  "task.quickEntry": ["mod+n"],
  "nav.today": [],
  "palette.open": ["mod+k", "mod+p"],
};

// A to-do in Today with notes, tags, a deadline and an estimate.
const PRICING = "li:has-text('Update pricing page copy')";

export const scenes: Scene[] = [
  { name: "week-light" },
  { name: "week-dark", dark: true },
  { name: "day", keys: ["1"] },
  { name: "three-day", keys: ["3"] },
  // The day headers: deadlines, the workload row, and each day's to-dos without a block.
  { name: "day-agenda" },
  { name: "day-agenda-dark", dark: true },
  { name: "day-agenda-wide", keys: ["Meta+\\", "Meta+/"] },
  { name: "day-agenda-three-day", keys: ["3"] },
  { name: "day-agenda-deadlines", click: "[data-deadlines='2026-10-30']" },
  // Short working hours over-plan Wednesday: the bar and its label turn red.
  {
    name: "day-agenda-over",
    settings: { account: { workingHours: { start: 11 * 60, end: 15 * 60 } } },
    keys: ["Meta+\\", "Meta+/"],
  },
  // Travelling to Tokyo with extra zone columns and weekends hidden: days are Tokyo's.
  {
    name: "day-agenda-travel-dark",
    dark: true,
    settings: {
      account: {
        showWeekends: false,
        timeZones: [{ zone: "Europe/London", label: "Ldn" }, { zone: "Asia/Kolkata" }],
      },
    },
    keys: ["z"],
    text: "tokyo",
    after: ["Enter"],
  },
  { name: "day-agenda-hidden", settings: { device: { workloadBar: false } } },
  // Narrow columns: compact habit rings with each habit's initial in its own hue.
  { name: "habit-rings" },
  { name: "habit-rings-dark", dark: true },
  { name: "month", keys: ["m"] },
  // The year: twelve mini months, today's badge, a dot on each busy day.
  { name: "year", keys: ["y"] },
  { name: "year-dark", dark: true, keys: ["y"] },
  { name: "year-panes-hidden", keys: ["y", "Meta+\\", "Meta+/"] },
  { name: "year-panes-hidden-dark", dark: true, keys: ["y", "Meta+\\", "Meta+/"] },
  { name: "year-narrow", width: 860, height: 700, keys: ["y"] },
  { name: "year-narrow-panes", width: 860, height: 700, keys: ["y", "Meta+\\", "Meta+/"] },
  { name: "year-tight", width: 760, height: 520, keys: ["y"] },
  { name: "year-tight-sidebar-dark", dark: true, width: 760, height: 520, keys: ["y", "Meta+\\"] },
  { name: "palette", keys: ["Meta+k"] },
  { name: "shortcuts", keys: ["?"] },
  {
    name: "quick-entry",
    keys: ["Meta+Shift+n"],
    text: "Call the movers tomorrow 3pm ~30m !fri p2 /launch",
  },
  { name: "today", keys: ["ArrowDown", "ArrowDown"] },
  { name: "when-picker", keys: ["ArrowDown", "Meta+s"] },
  // A to-do opened into a card with Return: notes, then the When/Deadline/Estimate/
  // Project/Tags chips.
  { name: "task-card", steps: [{ click: PRICING }, { press: "Enter" }] },
  { name: "task-card-dark", dark: true, steps: [{ click: PRICING }, { press: "Enter" }] },
  {
    name: "task-card-project",
    steps: [
      { click: PRICING },
      { press: "Enter" },
      { click: "[data-card] button >> text=Launch v2" },
    ],
  },
  {
    name: "task-card-deadline",
    dark: true,
    steps: [{ click: PRICING }, { press: "Enter" }, { click: "[data-card] button >> text=Fri" }],
  },
  // ⌘N opens the new row as a card with the title focused; its chips show quiet labels.
  { name: "task-card-new", keys: ["Meta+n"], text: "Call the bank" },
  // A new card reads its title as Quick Entry text: tokens light up and the chips
  // preview the day and time, deadline, estimate, project and tags.
  {
    name: "task-card-parse",
    keys: ["Meta+n"],
    text: "Movers tomorrow 3pm ~45m !fri",
  },
  {
    name: "task-card-parse-dark",
    dark: true,
    keys: ["Meta+n"],
    text: "Draft launch post 2pm /launch #writing",
  },
  // Backspace right after "tomorrow" was recognised keeps it as title text.
  {
    name: "task-card-parse-unparse",
    keys: ["Meta+n"],
    text: "Read tomorrow",
    after: ["Backspace"],
  },
  // Closed with Return: the row has the clean title and the time, with a block on the grid.
  {
    name: "task-card-parse-closed",
    keys: ["Meta+n"],
    text: "Water the ferns 4pm ~30m #home",
    after: ["Enter"],
  },
  // Today split into Scheduled (with each row's start time) and Not scheduled.
  { name: "today-scheduled-dark", dark: true },
  // From next week, the time on a Scheduled row brings today's block back into view
  // and selects it.
  {
    name: "scheduled-reveal",
    steps: [
      { press: "j" },
      { click: "li:has-text('Write launch spec') button[title='Show in Calendar']" },
    ],
  },
  // Anytime by project (loose to-dos first); rows lead with the next block's time.
  { name: "anytime-projects", keys: ["Meta+4"] },
  { name: "anytime-projects-dark", dark: true, keys: ["Meta+4"] },
  // Upcoming by day for the week (with each day's events), then by month.
  { name: "upcoming-days", keys: ["Meta+3"] },
  { name: "upcoming-days-dark", dark: true, keys: ["Meta+3"] },
  { name: "upcoming-narrow", width: 760, height: 700, keys: ["Meta+3"] },
  { name: "block-selected", click: "[data-item^='block:'] [data-edge=end] >> xpath=.." },
  {
    name: "sign-in",
    keys: ["Meta+k"],
    text: "sign in",
    click: "[role=option][aria-selected=true]",
  },
  { name: "narrow", width: 860, height: 700 },
  // Panes dragged wider: the sidebar and the to-do list lay out at the saved widths.
  { name: "panes-resized", settings: { device: { sidebarWidth: 300, tasksWidth: 440 } } },
  {
    name: "panes-resized-dark",
    dark: true,
    settings: { device: { sidebarWidth: 300, tasksWidth: 440 } },
  },
  // The pointer over the sidebar's right edge shows the resize line.
  { name: "pane-resize-hover", steps: [{ move: { x: 224, y: 400 } }] },
  // The narrowest window with both panes shown at their defaults.
  { name: "narrow-760-panes", width: 760, height: 700, keys: ["Meta+\\", "Meta+/"] },
  // The hidden sidebar peeks over the calendar when the pointer rests at the left edge.
  {
    name: "sidebar-peek",
    keys: ["Meta+\\"],
    steps: [{ move: { x: 200, y: 400 } }, { move: { x: 2, y: 400 } }, { wait: 300 }],
  },
  {
    name: "sidebar-peek-dark",
    dark: true,
    keys: ["Meta+\\"],
    steps: [{ move: { x: 200, y: 400 } }, { move: { x: 2, y: 400 } }, { wait: 300 }],
  },
  // The grid fills a tall window: no blank space under 11 PM.
  { name: "tall-fit", width: 1440, height: 1200, settings: { device: { hourHeight: 0 } } },
  { name: "zoomed-in", keys: ["Meta+Shift+.", "Meta+Shift+."] },
  { name: "zoomed-in-dark", dark: true, keys: ["Meta+Shift+.", "Meta+Shift+."] },
  { name: "sidebar-collapsed", keys: ["Meta+\\"] },
  // Both panes hidden: the title clears the traffic lights and the pane toggles.
  { name: "panes-collapsed", keys: ["Meta+\\", "Meta+/"] },
  { name: "panes-collapsed-dark", dark: true, keys: ["Meta+\\", "Meta+/"] },
  // The pane toggles beside the traffic lights: open icons carry the collapse cue, a
  // hidden pane's icon is plain and dim; one hovered.
  { name: "pane-toggles-dark", dark: true },
  { name: "pane-toggles-mixed", keys: ["Meta+/"] },
  { name: "pane-toggles-hover", steps: [{ move: { x: 97, y: 26 } }] },
  // The sidebar's + menu, and a project just made with ⌥⌘N, its title being typed.
  { name: "new-list-menu", click: "[data-new-list]" },
  { name: "new-project", keys: ["Meta+Alt+n"], text: "Garden" },
  { name: "new-project-dark", dark: true, keys: ["Meta+Alt+n"], text: "Garden" },
  // New Habit… from the dashed + in the habit strip, set to a weekly quota.
  {
    name: "new-habit",
    steps: [
      { click: "[data-add-habit]" },
      { type: "Stretch" },
      { click: "[role=radio]:has-text('Times per')" },
    ],
  },
  {
    name: "new-habit-dark",
    dark: true,
    steps: [
      { click: "[data-add-habit]" },
      { type: "Read" },
      { click: "[role=radio]:has-text('On days')" },
      { click: "[role=radio]:has-text('An amount')" },
    ],
  },
  // Habits in the sidebar (today's ring, progress) and the strip's "habits" caption and +.
  { name: "habits", keys: ["3"] },
  { name: "habits-dark", dark: true },
  { name: "habits-narrow", width: 860, height: 700 },
  // No habits: the strip's "Add a habit" pill in today's column, "No habits yet" in the
  // sidebar; in a window too narrow for the pill, the dashed + instead.
  { name: "habits-empty", steps: NO_HABITS },
  { name: "habits-empty-dark", dark: true, steps: NO_HABITS },
  // The sidebar is hidden at this width: show it to archive, then hide it again.
  {
    name: "habits-empty-narrow",
    width: 760,
    height: 700,
    steps: [{ press: "Meta+\\" }, ...NO_HABITS, { press: "Meta+\\" }],
  },
  // A habit row's right-click menu (the footer + menu is new-list-menu).
  {
    name: "habit-archive-menu",
    steps: [{ context: "[data-habit-list] li:has-text('Read') button" }],
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
  { name: "quick-entry-dark", dark: true, keys: ["Meta+Shift+n"], text: "Call the movers" },
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
  // Settings > Shortcuts: every command, a row hovered to show + and ×.
  {
    name: "settings-shortcuts",
    keys: ["Meta+,"],
    steps: [{ click: "[data-section=shortcuts]" }, { hover: "[data-command='view.days.1']" }],
  },
  {
    name: "settings-shortcuts-dark",
    dark: true,
    keys: ["Meta+,"],
    steps: [{ click: "[data-section=shortcuts]" }, { hover: "[data-command='view.days.1']" }],
  },
  // Changed rows: Quick Entry moved onto ⌘N (a conflict), a second key, an unbound one.
  {
    name: "settings-shortcuts-changed",
    settings: { account: { keybindings: SHORTCUT_CHANGES } },
    keys: ["Meta+,"],
    steps: [{ click: "[data-section=shortcuts]" }, { reveal: "[data-command='nav.today']" }],
  },
  {
    name: "settings-shortcuts-changed-dark",
    dark: true,
    settings: { account: { keybindings: SHORTCUT_CHANGES } },
    keys: ["Meta+,"],
    steps: [{ click: "[data-section=shortcuts]" }, { reveal: "[data-command='nav.today']" }],
  },
  // Searching by keys, and a binding being recorded.
  {
    name: "settings-shortcuts-search",
    keys: ["Meta+,"],
    steps: [
      { click: "[data-section=shortcuts]" },
      { click: "[aria-label='Search shortcuts']" },
      { type: "cmd n" },
    ],
  },
  {
    name: "settings-shortcuts-recording",
    keys: ["Meta+,"],
    steps: [
      { click: "[data-section=shortcuts]" },
      { click: "[data-command='palette.open'] [data-key]" },
    ],
  },
  {
    name: "settings-shortcuts-recording-dark",
    dark: true,
    keys: ["Meta+,"],
    steps: [
      { click: "[data-section=shortcuts]" },
      { click: "[data-command='palette.open'] [data-key]" },
    ],
  },
  { name: "settings-about", keys: ["Meta+,"], click: "[data-section=about]" },
  { name: "settings-about-dark", dark: true, keys: ["Meta+,"], click: "[data-section=about]" },
  { name: "settings-account", keys: ["Meta+,"], click: "[data-section=account]" },
];
