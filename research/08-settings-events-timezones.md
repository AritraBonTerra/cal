# 08: Settings, hour height, time zones and event creation

Researched 2026-10-28, after the owner tried v1. It covers four requests modeled on Notion Calendar: a Settings window, a setting for hour height (the smallest zoom fits the whole day), extra time-zone columns, and creating real calendar events instead of only to-dos.

How I gathered this:
- **Notion help center** (notion.com/help, fetched today): the settings, time zones, manage-events, getting-started and shortcuts pages, plus the 2026 release notes.
- **Cron changelog** (cron.com/changelog, read in full, 2021-01 to 2024-01). Notion's help pages are thin, so this is still the best record of how the grid, the time-zone columns and the edit dialogs behave.
- **Apple developer docs** for EventKit and EventKitUI, read from the DocC JSON behind developer.apple.com, so the quotes are Apple's own wording. Also the expo-calendar SDK 58 docs and Electron's `webContents` docs.
- **Comparable apps**: Fantastical settings help and blog, Apple Calendar and BusyCal help, Morgen guides and changelog, the Amie changelog, Vimcal docs, and one Microsoft support article on a DST bug.
- **The owner's screenshot** of Notion Calendar's General settings and its quick-create popover. Anything I took only from that screenshot is marked **[screenshot]**.
- **[unverified]** means only a secondary source supports it, or I'm working from memory or inference.

What research/01 already covers and I don't repeat: the keyboard model, the drag grammar, the menu bar feature list, the sync realities of each provider, and the short list of Notion settings (01 §1 "Settings"). This doc goes deeper on those settings and adds the parts 01 didn't have.

What Cal does today (checked in the repo): the hour height is a fixed token (`grid.hourHeight` = 48 on Mac, 56 on iPad, exposed as `--spacing-hour`). Dragging on the grid creates a draft chip whose only path is a to-do plus a block (`DraftChip` in `TimeGrid.tsx`). `calkit` already reads title, times, all-day, location, notes, URL and busy, and writes title, calendar, all-day, times, location and notes, with a `this`/`future` span.

---

## 1. Notion Calendar settings, page by page

Source: https://www.notion.com/help/notion-calendar-settings unless noted. The help page lists no default values. Defaults below come from the Cron changelog where it gives one.

The window has a left sidebar with three groups [screenshot]: **Account** (General, Profile, Notifications, Menu bar, Conferencing), **Calendar accounts** (one row per connected account), and **Notion workspaces**. Open it with `⌘,` or `G` then `S` (Cron 2021-04-19, 2021-08-02). `⌘,` works even while a text field has focus (2021-06-07). Cron's launch note on settings: "you won't find random knobs and dials in Cron's settings" (2021-04-19).

### General
| Setting | Choices | What it does / notes |
|---|---|---|
| Calendar view: Weekends | toggle | Show or hide Sat/Sun. Also `⇧⌘E` (Cron 2021-10-18) and in the view selector (2022-01-17). |
| Calendar view: Declined events | toggle | Hide invitations you declined. Also `⇧⌘D`. |
| Calendar view: Week numbers | toggle | Week label at the top, in the mini month and in month view (2022-01-17). |
| Start week on | weekday | The date picker follows it too (2022-01-10). |
| Calendar navigation: Press T to | Go to today / Left-align today | Added 2021-04-26. `⌥T` always left-aligns (01). |
| Meetings | lead time | How far ahead the upcoming meeting shows in the right context panel. The screenshot shows "N hours before" [screenshot]. |
| Language | list | Added 2024-01-15. |
| Time format | System / 12-hour / 24-hour [screenshot] | Added 2022-02-07; "the default comes from Google Calendar". |
| Time zones | "Ask to change time zone when traveling" toggle | Desktop only. The screenshot also shows a note that zones are configured on the grid, and that `Z` travels [screenshot]. |
| Location | Apple Maps / Google Maps | Apple Maps option added 2023-10-30. |
| Theme | Auto / Light / Dark | Added 2021-06-28. No accent colors. |
| System startup | launch at login | Cron had two: "Start menu bar calendar" and "Open calendar window" (2021-09-06). |

### Profile
Photo, full name, username, the primary login account, and "Delete Notion Calendar account". Cron added this as Settings > Account > Profile on 2021-10-25.

### Notifications
- **Default event reminders** link out to Google Calendar's per-calendar notification settings. Notion doesn't store its own defaults. Notion on X (2025): "you can customize reminder times through your Google Calendar settings" (https://x.com/NotionHQ/status/1907866235586375696).
- **Event invite notifications**: new invitations and updates.
- **Upcoming meeting notifications**: lead time and sound.
- Desktop notifications need OS permission. Mobile can't mark them time-sensitive.
- Cron 2022-08-22: reminders "use system time instead of the primary time zone".

### Menu bar (desktop only)
- On/off. Days of events to include. Filters: exclude all-day events, events without participants, events without conferencing/location.
- "Preview upcoming event in menu bar": lead time (Cron added 4 h and 8 h on 2022-01-10), plus toggles for "Event title" and "Event time".
- System-wide keyboard shortcuts live here: show/hide the menu bar calendar and join the next meeting (defaults `⌃⌘K` and `⌃⌘J` per Cron 2021-12-06). Click the shortcut and type a new one.
- Per calendar, right-click it in the sidebar and turn off "Events included in menu bar". That also turns off upcoming-meeting notifications for it. 01 already flags the coupling as a mistake.

### Conferencing
Connect Zoom, Meet, Teams and others. Each calendar account then has a "Default conferencing", and a calendar can override it (Cron 2021-09-27). Cron auto-adds the default link once the first participant is added (2021-09-27).

### Calendar accounts (one page per account)
Default Notion workspace, default conferencing, Disconnect, and "Add calendar account".

### Per-calendar settings (not in Settings)
From https://www.notion.com/help/manage-your-calendars-and-events and the Cron changelog:
- In the sidebar: an eye icon toggles visibility, and hidden calendars show a struck-through icon. `⌥`-click the eye means "Show only this calendar" (2021-06-21).
- Hover → `•••` → color. Click a calendar's name to see its upcoming events. A slider icon there holds color, "Events included in menu bar", event blocking and default conferencing.
- Select a calendar to rename it, edit its description or change its color (2021-06-21).
- **Default calendar**: right-click → "Make default calendar", or Settings → `•••`. It can be a Notion database. In Cron the "active" calendar had a color ring and was the default for new events (2021-01-11). It reset to the primary calendar on each launch until 2021-10-04, when Cron started to "persist the active calendar across launches".
- Drag to reorder calendars and accounts (2021-07-05, 2021-09-13). "Remove calendar from list" (2021-09-13).
- Creating an event on a hidden calendar unhides it (2021-01-04, 2021-06-07).

### Notion workspaces
Default database for AI meeting notes, auto-add notes to new events, Disconnect. None of this applies to Cal.

### Controls outside Settings
- Day count: the `±` next to the last date (01).
- All-day section collapse: arrows in the zone column, or `⌘K`.
- **View → Interface scale**: Zoom In / Zoom Out / Actual Size. This is whole-UI zoom.
- **View → Zoom Hours In / Zoom Hours Out**: grid density. See §2.

### Worth copying for Cal
Copy: weekends, declined events, week numbers, start week on, `T` behavior, time format, theme, maps app, launch at login, the travel prompt, the menu bar page, per-calendar color, visibility, default calendar and menu-bar inclusion.

Change: default reminders. Notion delegates them to Google. With EventKit there is no API to read the account's default alert, so Cal has to own them (§4.4).

Skip: Language (follow macOS), Profile beyond the existing sign-in, Conferencing (EventKit can't create meetings), Notion workspaces, event blocking (PLAN already makes busy blocks opt-in per account).

Add what Notion lacks: hour height, default event duration, working hours, and a separate "count as busy" per calendar for the scheduler.

---

## 2. Hour height and zoom

### Notion Calendar / Cron
- Cron 2021-03-01, "Grid density": "We have drastically improved the vertical layout of the grid and added user controls to fine-tune it."
  - The default density should feel "just right".
  - "If you resize Cron's window to taller than 24 hours, we start increasing the row height" while it "smartly keep[s] you anchored in place."
  - View → Zoom Hours In (`⇧⌘.`) shows fewer hours. Zoom Hours Out (`⇧⌘,`) shows more. Default Hour Size (`⇧⌘0`) resets. All three are in `⌘K` too.
- So the rule is a fixed hour height in px, with a floor of "24 hours fill the window". You can never zoom out to blank space below midnight. Zooming out stops at fit, and a tall window raises the floor.
- Notion still ships these. The settings page names "Zoom Hours In / Out" under View, and says that on Windows `Ctrl + Shift` must not be claimed by input-language hotkeys. That fits `Ctrl+Shift+.`/`,` on Windows and `⇧⌘.`/`⇧⌘,` on Mac. The exact Mac keys come from third-party guides (medium.com/@LearnChangeDo, a LinkedIn article), so they are [unverified] for the current build.
- Interface scale is a separate menu (View → Interface scale). In Cron `⌘+` was browser-style zoom; the changelog fixes "`⌘ +` from zooming in twice" (2021-10-11) and the grid viewport "shifting when changing interface scale/browser zoom" (2021-10-25).
- I found no pinch or `⌥`-scroll zoom in Notion's docs or the changelog [unverified either way].
- One Cron bug worth avoiding: "Fixes bottom grid gap showing at higher density settings (View > Zoom Hours Out)" (early 2021). The fit floor must be computed from the real viewport, after the all-day row and headers.

### Others
- **Apple Calendar (Mac)**: Settings → General → "Show __ hours at a time", 6 to 24, plus "Day starts at" and "Day ends at" (https://support.apple.com/guide/calendar/icl26668/mac). This counts hours, not pixels.
- **Fantastical (Mac)**: Settings → General → "Show (hours) at a time" for day and week views, and "Day starts/ends at" for the highlighted hours (https://flexibits.com/fantastical/help/settings). Trackpad pinch changes the hours visible. Release notes for 4.1.17 (2026-07-21) fix "choppy pinch-and-zoom when changing the number of hours visible in Day and Week view" (https://flexibits.com/fantastical/releasenotes). iOS has "Only Show Day Start And End Hours".
- **BusyCal**: 4 to 24 hours. `⌥`+scroll anywhere zooms. Scrolling over the time ruler zooms, and dragging on the ruler sets the hours shown. Day and week views each remember their own value. A setting turns off ruler-scroll zoom. A toolbar button collapses hours outside working hours (https://www.busymac.com/docs/busycal/70587-day-view/).
- **Morgen**: a zoom slider changes slot height; a mobile feedback post asks for pinch (https://feedback.morgen.so/p/pinch-to-zoom-in-the-mobile-calendar). The desktop location is [unverified].
- **Amie**: nothing in the changelog about zoom or density. A 2024 review says zoom is adjustable [unverified].
- **Vimcal**: no zoom or density control found in docs or reviews.

### Electron facts that matter
- "Visual zoom is disabled by default in Electron", so a trackpad pinch won't scale the page (https://www.electronjs.org/docs/latest/api/web-contents, `setVisualZoomLevelLimits`). Chromium reports a trackpad pinch to the page as `wheel` events with `ctrlKey: true`. The grid can catch those and treat them as hour zoom [unverified in current Electron; test it].
- The standard Electron menu roles `zoomIn`, `zoomOut` and `resetZoom` give `⌘+`, `⌘-` and `⌘0` page zoom, which is Notion's "Interface scale".

---

## 3. Multiple time zones

### Notion Calendar
From https://www.notion.com/help/time-zones and the Cron changelog.
- The primary zone sits directly left of the grid, and events render in it. Extra zones are "secondary" and sit further left. On first setup the primary zone comes from Google Calendar, and after that the two don't sync.
- **Add**: click `+` next to the primary zone and pick from the list. `⌘K` → "time zone" works too. Up to four zones show by default. For more, the help page links to a tweet.
- **Right-click a zone**: `Change`, `Rename` (custom label such as "Ldn"), `Make time zone primary` (moves it next to the grid and shifts the others left), `Remove time zone from list`. Cron also allowed a double-click to rename (2021-07-05).
- **Reorder**: drag. "The right-most time zone will become your primary time zone."
- **Search** accepts cities, abbreviations, "UTC", country names ("Swe", "Switz"), and accent-insensitive text ("montreal" matches "Montréal") (2021-07-12, 2022-01-10, 2023-05-01). It "remembers recent time zones" (2021-08-23).
- **`Z` travel**: "Travel to time zone…" (Cron 2021-07-05). The chosen zone temporarily becomes primary, with a red overlay of local time until `Esc` (matthiasfrank.de). To keep it, right-click it → `Add as primary time zone` or `Add as secondary time zone`. Cron fixed "showing temporary time zone that matches an existing time zone" (2021-12-06).
- **Travel prompt**: Cron "automatically detects when you travel to a new time zone" and offers to make it primary (2021-07-12). It "auto-asks to change time zone to new locations upon launch" (2021-10-25). It no longer re-asks once you've changed it (2023-01-16). Desktop only.
- **Per-event zones**: the event panel shows another zone's event in your current zone, with "Switch to event's time zone" and back (2022-05-23). A repeat series applies its zone to all instances (2021-09-20). Read-only events hide the All-day, Time zone and Repeat fields (2021-05-24).
- **Edge cases Cron had to fix**: non-integral offsets such as India in the zone column (2021-02-01), DST offsets in the event's zone menu (2021-04-05), math "around UTC midnight" (2021-07-26), the date picker off by a day when the primary zone differs from system time (2021-06-07), `N` picking the wrong event in the same case (2022-05-23), non-IANA zones freezing the app (2022-01-10), and the Kyiv rename (2022-12-12). The mini month marks "Today" in the primary zone (2021-12-06).
- Not documented: how all-day events and the now line behave in extra columns, and how a column labels a week that crosses a DST change.

### Others
- **Fantastical**: Settings → Advanced has "Time zone override" (render everything in one zone), "Additional time zones in Day and Week" (up to 6 extra timelines per the settings page; a 2023 blog post describes "a second timeline on the right of your calendar"), and "Favorite Time Zones" shown in event details while creating events (https://flexibits.com/blog/2023/03/saving-daylight-with-fantasticals-time-zones/).
- **Vimcal**: `Z` Time Travel, "Instantly view any time zone without changing your calendar settings." It opens from `Z`, the zone label at top left, `⌘K` → "Time Travel", or the Slots panel. A work-hours overlay appears only while time travelling: "This will only display when using the Time Travel feature!" Up to 5 zones at once on EA plans (https://docs.vimcal.com/most-popular-features/time-travel).
- **Morgen**: a list of up to 10 zones (up to 9 secondary in the 2021 changelog). Add from the zone in the header → "Add time zone". Hovering the timeline shows a widget with the time in every listed zone, and `Z` shows it while hovering an event. The mobile app follows the system zone when you travel (https://www.morgen.so/guides/manage-multiple-time-zones-in-your-calendar, https://changelog.morgen.so/introducing-time-zone-assistant-215349).
- **Outlook DST bug, the thing to avoid**: with a secondary zone in the time bar, when DST starts or ends on a different date in each zone, "the time difference between the primary and secondary time zones in the time bar doesn't reflect the DST change", and events on that day and later in the view render at the wrong time. Outlook picks one offset for the whole visible week. Microsoft's workaround is to use a view that doesn't contain the DST day (https://learn.microsoft.com/en-us/troubleshoot/outlook/calendaring/additional-time-zone-shows-one-hour-offset-on-dst). The bug happens because one gutter column labels several days whose offsets differ.
- **Google**: its help page says it uses UTC internally and warns that events far in the past or future "might not reflect daylight saving time changes" (https://support.google.com/calendar/answer/37064).

---

## 4. Event creation and editing

### 4.1 Notion Calendar's create flow
- Ways to create: double-click a slot, drag a range, `C`, `⌘K` → "Create event", or right-click empty grid (Cron 2021-05-31, 2022-01-17). Dragging right after a double-click adjusts the range (2021-05-24). Dragging across days makes a multi-day event. `C` uses the current grid selection's times (2021-06-14). `C` works even while a field has focus (2022-04-11). Events of 0 minutes are allowed (2021-11-29).
- Help center: "select a time slot in your calendar, then enter details for your event", then "`Send invite`" if there are guests. The dropdown next to `Event` picks `Event`, `Focus time`, `Out of office` or `Birthday` (Workspace accounts only for the middle two). A title containing "birthday" becomes a yearly all-day event.
- **Event vs task**: Notion has no to-dos of its own. The "task" path is the calendar picker. If the default calendar is a Notion database, a new item becomes a page in it (https://www.notion.com/help/manage-your-calendars-and-events, 2sync guide). Database items can only edit name and date, with no repeat, participants or links (matthiasfrank.de).
- **Popover fields, top to bottom [screenshot]**: title; start → end with the duration; date; a row of All-day / Time zone / Repeat; Participants; Conferencing; Location; Docs and links; Description; the calendar picker with its color; Busy/Free; visibility; Reminders (e.g. "30min before").
  - The help center confirms Participants and Rooms, Conferencing, Location, Docs and links, Busy/Free, Public/Private, and a Description with headers, links and lists.
  - The 2026-01-20 release (Notion 3.2) lets you "hide the context panel now for a full view of your calendar". The popover is probably what appears when the panel is hidden [unverified].
- **Keyboard and parsing**:
  - Typed times: `16:30` works. Bare hours 8–11 mean AM and 1–7 mean PM (2021-05-31). Exact "to" times were once misread as durations (fixed 2021-06-28).
  - `↑`/`↓` in a context-panel field opens its menu (2021-01-11). `E` then a letter jumps to a field (2021-03-29).
  - `⌘↩` saves or sends. `⇧⌘↩` saves without email.
  - `Space` in a new event opens the natural-language field (2026-09-21).
  - Typing in the panel went from 200 ms to 16 ms per keystroke (2021-07-26).
- **Repeat presets** are generated from the date, e.g. "Every month on last Thu" (2021-05-24), plus "Every 2 weeks" and "Every month" (2021-02-15). Custom patterns end "never, on a specific date, or after a number of times" (2023-01-16).
- **Defaults**:
  - Duration: no setting is documented. Thomas Frank says the Notion Home widget's `+` makes 30-minute events [unverified for the calendar app].
  - All-day events default to Free (2022-05-23). Month-view creation defaults to all-day (2022-01-17).
  - All-day reminder presets are "1 day before" rather than "5 mins before" (2023-05-01). An earlier bug put default reminders on all-day events at "10 mins before midnight" (2021-07-19).
  - Default reminders otherwise come from Google.
- **Editing** happens in the right context panel (help center). Changes are pending until you commit. Cron 2021-02-22 added "pending changes" dialogs, "dozens of permutations of dialogs to edit repeat events, events with participants". They offer save, keep editing or discard, with a small changelog of what will change. Hold `⌘` to commit "this event" only, without a dialog. Hold `⇧⌘` to also skip email.
- **Recurring choices**: "This event", "This and following events", "All events" (the changelog names all three in fixes, 2021-03-29, 2021-07-26, 2021-10-25). Color, visibility, free/busy and reminders can change for the whole series at once (2023-05-01). Outlook calendars allow "individual occurrences or all future events" (help center).
- **Deleting**: right-click → Delete, or select and press `delete`. `⌘⌫` deletes or cancels without a dialog, and `⇧⌘⌫` skips the email (2021-02-22). A new event with participants that you discard gets deleted (2021-03-08). Delete and Repeat are hidden on read-only events (2021-01-25).

### 4.2 How others choose event vs task
- **Morgen**: highlighting a range opens a widget that "by default … will open an event". Pick Task in its top-right corner, or type "task" then a space at the start of the title. The same widget offers Frame. Task mode adds notes, list, importance, due date and recurrence (https://www.morgen.so/guides/the-starter-guide-to-morgen-tasks, https://www.morgen.so/guides/how-to-use-frames).
- **Fantastical**: one input; `⌘K` switches it between event and task (01).
- **Amie**: drag a todo onto the grid to schedule it. "event privacy when created from todo correctly respects your preference" (changelog #114, 2024-06-18). Up to 5 reminders per event (#113).
- **Fantastical settings** worth copying for events: Default calendar, Default event duration, separate default alerts for timed, all-day and birthday events, and "Go to today after adding items" (https://flexibits.com/fantastical/help/settings).
- **Apple Calendar** asks "Delete Only This Event" or "Delete All Future Events" for repeating events, and has no "all events" choice (https://support.apple.com/guide/calendar/icl1018/mac). That matches EventKit's two spans exactly.

### 4.3 What EventKit can do per field
Quotes are from developer.apple.com/documentation/eventkit (DocC JSON, fetched 2026-10-28).

| Field | EventKit | Notes for Cal |
|---|---|---|
| Title | `title` get/set | |
| Start, end, all-day | `startDate`, `endDate`, `isAllDay` get/set | Already wired. |
| Time zone | `timeZone: TimeZone?` get/set. "If `nil`, the calendar item is a floating event … The start and end times of a floating event should be set as if they were in the system time zone." | One zone per event. Google's separate start and end zones can't be expressed. All-day events should be floating [unverified that EventKit forces this]. |
| Location | `location: String?` and `structuredLocation: EKStructuredLocation?` (title, `geoLocation`, `radius`; `init(mapItem:)`) | Plain text is enough. A structured location gives Apple Maps a pin. |
| Notes | `notes: String?` | Plain text only. Notion's rich description won't round-trip. |
| URL | `url: URL?` get/set | Calendar.app's URL field. The natural home for a meeting link. |
| Alarms | `alarms`, `addAlarm`, `removeAlarm`. `EKAlarm(relativeOffset:)` or `(absoluteDate:)`. Geofence alarms exist. | For all-day events, the offset counts from local midnight, so "day before at 9:00" is −15 h. |
| Recurrence | `recurrenceRules`, but "The implementation only supports a single recurrence rule. Adding a recurrence rule replaces the single recurrence rule." Rules can't be modified, only replaced. Ends: `EKRecurrenceEnd(end:)` or `(occurrenceCount:)`, nil = forever. The complex initializer covers days of week, month and year, weeks, months and set positions. | Enough for every Notion preset and custom pattern. |
| Availability | `availability`: `notSupported`, `busy`, `free`, `tentative`, `unavailable`. "If the event's calendar does not support availability settings, this property's value is notSupported." The calendar's `supportedEventAvailabilities` is a bitmask. | Hide Busy/Free when the calendar says none. |
| Attendees | "This property is read-only; it is not possible to add attendees with Event Kit." `EKParticipant`: "EventKit cannot add participants to an event nor change participant information." | Show attendees and RSVP status read-only. |
| Organizer, status | `organizer` get only. `status` get only; act on it only if `canceled`. | |
| Visibility (public/private) | No property. | Don't offer it. |
| Conferencing | No property. | Use `url`, and detect links in location and notes. |
| Calendar | `calendar` get/set. `allowsContentModifications` "indicates whether you can add, edit, and delete items in the calendar." `isSubscribed`, `isImmutable` (the calendar's own properties are locked, but items can still be added), `type`, `source`. | The picker lists only calendars with `allowsContentModifications`. |
| Calendar color | `cgColor` get/set, saved with `saveCalendar(_:commit:)`. | Writing it changes the color in Calendar.app, and for iCloud on every device [unverified]. Cal should keep its own override. |
| Default calendar | `defaultCalendarForNewEvents`, "as specified by user settings" (get only). | A good default for Cal's own setting. |
| Save, delete | `save(_:span:commit:)`, `remove(_:span:commit:)`. `EKSpan` is `thisEvent` or `futureEvents` only. "If the event has been deleted from the database, it's recreated as a new event." | "All events" means saving the series' first occurrence with `futureEvents`. Undo of a delete recreates the event with a new identifier. |
| Detached occurrences | `isDetached`: true when an occurrence has been modified away from the series. `occurrenceDate`. | calkit already keys occurrences by identifier + `occurrenceDate`. |

**Platform limits.**
- `EKEventEditViewController`, Apple's editor that can add invitees, is iOS, iPadOS, Mac Catalyst and visionOS only. There is no AppKit version, so the Electron app has no supported way to invite people.
- Write-only access "can create events, but it can't access any of the existing calendars and events". Cal needs full access, which it already requests.

**expo-calendar SDK 58** (https://docs.expo.dev/versions/latest/sdk/calendar/; Cal pins `~58.0.6`):
- The default export is a new object API. Legacy `*Async` functions "will throw in runtime" unless imported from `expo-calendar/legacy`.
- `event.update()` can change title, location, timeZone, url, notes, alarms, recurrenceRule, availability, startDate, endDate and allDay. That matches EventKit.
- `RecurringEventOptions { futureEvents, instanceStartDate }` is iOS only. `getDefaultCalendarSync()` is iOS only. `calendar.update()` can change only color and title.
- `event.createAttendee()` is listed for iOS. That contradicts EventKit, so assume it fails on iOS [unverified].
- `calendar.addEventWithForm()` and `event.editInCalendar()` present Apple's editor. That is the one way to invite people from the iPad app.

### 4.4 Reminders and notifications under EventKit
- Alarms saved on an `EKEvent` belong to the event. macOS and iOS deliver them through the system Calendar notifications whichever app created the event [unverified, but this is how Calendar.app alerts behave for events from other apps]. Cal doesn't need its own notification engine for event reminders.
- EventKit has no API for an account's or calendar's default alert, and I found no doc saying the OS adds one to events created through EventKit [unverified]. If Cal wants "10 minutes before" on new events, it has to add the alarm itself.

---

## 5. Sidebar and context panel

- **Mini month**: added to Cron's left menu on 2021-02-15 ("a month overview and date picker", toggled with `~`). Clicking a day flashes the target (2021-08-30). It shows week labels (2022-01-17) and adjacent-month days (2023-05-01), marks "Today" in the primary zone, and respects hidden weekends (fixed 2024-01-15).
- **Calendar list**: per-account groups that collapse and reorder, eye toggles, `⌥`-click to solo, color, default calendar, and calendar sets (`⌃1–9`, already in PLAN). Lists taller than the window scroll (2021-12-20).
- **Scheduling**: one-off and recurring links open from the panel or `S` (https://www.notion.com/help/availability-blocking-and-time-zones). Out of scope here. PLAN prefers availability as text.
- **Right context panel**:
  - Empty state when nothing is selected (2021-03-08). With nothing selected it shows the upcoming meeting, within the lead time from General → Meetings.
  - With a range selected it shows the active calendar (2022-01-10). With an event selected it holds every field. Clicking a calendar name lists that calendar's upcoming events.
  - The panel can be hidden since 2026-01-20.

---

## Recommendations for Cal

### A. Settings window
A separate `BrowserWindow`, opened with `⌘,` and `G` `S`. A left sidebar of pages, controls on the right, and every change applies at once with no Save button. The renderer stores settings in one typed record.
- **Synced** (Convex, through the sync engine like other records): everything below except the device-only rows.
- **Device-only** (local store): launch at login, menu bar, hour height, global shortcuts.

Pages and defaults:

**General**
| Setting | Choices | Default |
|---|---|---|
| Show weekends | on/off | on |
| Show declined events | on/off | off. Declined = an attendee with `isCurrentUser` and status declined. |
| Show week numbers | on/off | off. ISO weeks when the week starts Monday, otherwise the locale's count. |
| Start week on | System / Sunday / Monday / Saturday | System (`Intl.Locale(...).weekInfo.firstDay`) |
| Press T to | Go to today / Left-align today | Go to today |
| Time format | System / 12-hour / 24-hour | System. On Mac, `systemPreferences.getUserDefault('AppleICUForce24HourTime', 'boolean')` overrides the locale [unverified key]. |
| Theme | System / Light / Dark | System (`nativeTheme.themeSource`) |
| Open locations in | Apple Maps / Google Maps | Apple Maps |
| Launch at login | on/off | off (`app.setLoginItemSettings`) |

**Calendar grid** (Cal-only page)
| Setting | Choices | Default |
|---|---|---|
| Hour height | Fit day / 40 / 48 / 64 / 80 / 96 px (iPad: Fit / 44 / 56 / 72 / 88 / 112 pt) | 48 (iPad 56) |
| Working hours | start, end, days | 09:00–18:00, Mon–Fri. If the scheduler's time maps already hold this, reuse them. |
| Default event duration | 15 / 30 / 45 / 60 / 90 min | 30 (`CLICK_LENGTH` today) |
| Half-hour lines | on/off | off (07 §7.5) |

**Time zones**: the same list the grid's `+` edits (§C), plus "Ask to switch when the Mac's time zone changes" (default on) and "Primary zone: Follow Mac / fixed zone" (default Follow Mac).

**Events**: default calendar (default: EventKit's `defaultCalendarForNewEvents`), default reminder for timed events (None / At start / 5 / 10 / 15 / 30 min / 1 h / 1 day; default 10 min), default reminder for all-day events (None / Day of at 09:00 / Day before at 09:00; default None), new all-day events are Free (on).

**Calendars**: one section per EventKit source. Per calendar: show (eye), color override (local; never written to EventKit by default), "Counts as busy for planning" (default on, off for subscribed calendars), "Include in menu bar" (default on), "Make default". Read-only calendars show a lock and no default option.

**Menu bar**: on/off (on), days to include (1), skip all-day (on), skip events with no link or location (off), show next event title (on) and time (on), preview the next event N before it starts (15 min / 30 min / 1 h / 4 h / 8 h; default 1 h), global shortcuts (open the menu bar panel `⌃⌘K`, join the next meeting `⌃⌘J`, Quick Entry as today). Keep menu-bar inclusion separate from reminders; don't copy Notion's coupling.

**Account**: the existing Convex sign-in (email, sign out). Nothing else.

Don't build: Language, Profile photo, Conferencing, Notion workspaces, event visibility.

### B. Hour height and zoom
- Store `hourHeight` in px per device (default 48 on Mac, 56 on iPad). Render with `effective = max(hourHeight, fitHeight)`, where `fitHeight = gridViewportHeight / 24` and the viewport is the scrollable area below the all-day row, measured with a `ResizeObserver`. The day can never be shorter than the window, and a tall window raises the floor. That is Cron's 2021-03-01 rule. "Fit day" in Settings stores 0, so the floor always wins.
- Drive `--spacing-hour` from `effective` at runtime instead of the fixed token. Keep `grid.hourHeight` as the default only. Every y position is `minutes / 60 * effective`. Round only the drawn hairlines to whole pixels, because the fit height is fractional (about 31.7 px on a 760 px grid).
- Zoom steps: `⇧⌘.` in, `⇧⌘,` out, `⇧⌘0` back to the default, through the ladder Fit, 32, 40, 48, 56, 64, 80, 96. Zoom out stops at fit and goes no further. List them under View and in `⌘K` with their keys.
- Continuous zoom: `⌥`+scroll and trackpad pinch (`wheel` with `ctrlKey`; call `preventDefault`) scale `hourHeight` by `exp(-deltaY * 0.01)`, clamped to [fit, 96]. Persist it when the gesture ends. On iPad, use a pinch gesture on the grid with the same clamp.
- Anchoring: while zooming, keep the time under the pointer (or the viewport center for key zoom) at the same screen y by adjusting `scrollTop` in the same frame. No animation, per PLAN §6.
- Snapping stays 15 minutes, which is 8 px at the fit height. Keep `⇧` for free placement. The chip layout-by-height rules (07 §7.5) already work in pixels, so they adapt.
- Leave `⌘+`/`⌘-`/`⌘0` as Electron's page zoom ("Interface scale") through the standard menu roles.

### C. Time zones
- **Model**: `timeZones: { primary: "system" | IANA; extras: { zone: IANA; label?: string }[] }`, at most 3 extras (4 columns, like Notion). Never store fixed offsets, only IANA names, and canonicalize old names (Kyiv).
- **Gutter**: each extra zone gets a 44 px column left of the primary gutter. The primary column is the one next to the grid. Each column header sits in the all-day row band and shows the label, or the short name from `Intl.DateTimeFormat(..., { timeZoneName: "short" })` ("PDT", "GMT+5:30"). A `+` sits beside the primary header.
  - Hour labels in an extra column are the time in that zone at each primary hour line, so a +5:30 zone reads "3:30". Extra columns use `text-3`; the primary column uses the normal label style.
- **Editing**: right-click a header → Change…, Rename…, Make primary, Remove. Drag headers to reorder; whichever ends up right-most is primary. `⌘K` → "Add time zone". The zone picker searches city, country, abbreviation, IANA name and "UTC±n", ignores accents, and shows recent zones first.
- **DST**: compute each extra column's labels from one reference day: today if it's visible, otherwise the first visible day. If any visible day has a different offset between the two zones, show a small "±1h on Sun" marker in that column's header, with a tooltip. Events always render by their own instants in the primary zone, so a label mismatch never moves an event (unlike Outlook). The primary grid always has 24 wall-clock rows. On a spring-forward day nothing can start in the missing hour. On a fall-back day both 1:00 hours share one row band, and their events overlap like any other overlap. Keep the wall-clock-minutes approach from commit eca9eff.
- **Now line**: drawn at the current instant in primary-zone wall time. The primary gutter gets the red pill ("3:40"). Each extra column shows the same instant in its zone as a smaller pill in `now` mixed toward the canvas.
- **All-day events** are floating dates and never shift when the primary zone changes or during travel. Only timed events move.
- **`Z` travel**: opens the zone picker. Choosing a zone re-renders the grid with it as a temporary primary. The primary header turns `now`-colored with the zone name and "Esc to return", and working hours from Settings draw in the travel zone (Vimcal's overlay). `Esc` or `Z` again exits. Right-click the header → "Keep as primary" or "Add as extra". Travel state is never saved.
- **Travel prompt**: check `Intl.DateTimeFormat().resolvedOptions().timeZone` on launch and on window focus against the last seen value. If primary is "Follow Mac", switch silently and show a toast ("Now on London time. Undo"). If primary is a fixed zone, ask once per new zone: "You're in London. Show London time?" [Switch] [Keep New York]. Never ask twice for the same zone.
- **Event zones**: new timed events get `timeZone` = the current primary zone, never nil. The editor shows a Time zone row only when the user opens it or the event's zone differs from primary. Then it shows both, e.g. "10:00–11:00 PDT · 18:00 your time", with "Show in event's zone" as a one-click travel.

### D. Event creation and editing
- **Entry points**: drag on the grid, double-click, a single click (default duration), `C` (next free 15-minute slot from now, or the grid selection), and `⌘K` → "New event". All of them open the same draft chip plus a popover beside it, on whichever side has room. Popovers grow from the chip in 150 ms (07 §7.8).
- **Event or to-do**: a two-segment control at the top right of the popover, `Event | To-do`, with keys `⌘1`/`⌘2` shown as keycaps. Typing "todo " or "task " at the start of the title also switches, like Morgen. The default is the type last used, and Event on first launch. To-do mode keeps today's behavior (task with `estimate_min` = span, plus its block) and adds list/project and deadline rows. Events go only to writable EventKit calendars. If none exist, the control shows To-do only.
- **Event fields** (one row each, empty rows show a placeholder, `Tab` moves down, `↑`/`↓` opens a row's menu):
  1. Title, focused, with the `@cal/nlp` live parse ("lunch w Sam tmr 1pm" fills date and time).
  2. Time: `10:00 → 10:30` with the duration (`30m`) as editable text, then the date. Typed times follow Cron's rules: `16:30`, `4p`, 8–11 = AM, 1–7 = PM. Typing a duration such as `45m` sets the end.
  3. All-day switch · Time zone (§C) · Repeat. Presets are built from the date: Daily, Weekdays, Weekly on Wed, Every 2 weeks, Monthly on the 4th Wed, Monthly on the last Wed, Yearly on Oct 28, and Custom… (interval, weekdays, end never / on date / after N). One `EKRecurrenceRule`.
  4. Location: text, with a pin if picked from a suggestion (`structuredLocation`). "Open in Maps" follows the setting.
  5. Link (`url`). A pasted Zoom/Meet/Teams URL there, in location or in notes gets a Join button on the chip and in the menu bar.
  6. Notes, as plain text.
  7. Calendar: a color dot and name, writable calendars only, default from Settings. Picking another calendar affects only this event.
  8. Busy / Free: hidden if the calendar's `supportedEventAvailabilities` is none. All-day defaults to Free.
  9. Reminders: chips ("10 min before ×") plus "+ Add", presets as in Settings. Multiple alarms are fine.
  - Read-only display only: attendees with RSVP state and the organizer, plus a note that Cal can't send invites yet. No visibility or conferencing rows.
- **Keys**: `↩` in the title or `⌘↩` anywhere saves. `Esc` discards an untouched draft, and asks if fields were edited. Clicking outside saves if there's a title, as the to-do draft does today. One save is one undo step.
- **Editing an existing event**: click selects. `↩`, double-click or `E` opens the same popover anchored to the chip, with the same fields filled in. No side panel; the grid stays visible. Events on read-only calendars open the popover with every field disabled and "Read-only: <calendar>" at the top.
- **Recurring events**: on save, drag or resize of an occurrence, ask "This event / This and following / All events". `⌘`-drag skips the dialog with "This event" (Cron's rule). "All events" means calkit fetches the series' first occurrence, applies the same delta or fields, and saves with `.futureEvents`. Add `span: "all"` to `EventSpan`. Repeat-rule changes always offer only "This and following" and "All events".
- **Deleting**: `⌫` or the context menu. A one-off event deletes at once with an Undo toast; undo recreates it, with a new identifier. A recurring one asks "Delete this event / This and following / All events". Events with attendees warn that the calendar server may send cancellations [unverified per provider].
- **calkit additions needed**: write `url`, `timeZone`, `availability`, `alarms`, `recurrenceRule` and `structuredLocation`. Read attendees (name, status, `isCurrentUser`), organizer, status, `timeZone`, `alarms`, the rule and `isDetached`. Add calendar fields `supportedEventAvailabilities`, `isSubscribed`, `type` and `isDefault` (from `defaultCalendarForNewEvents`). Add `span: "all"`. On iPad, use expo-calendar's new object API (`calendar.createEvent`, `event.update`, `event.delete` with `futureEvents`/`instanceStartDate`). Offer `addEventWithForm()` as "Invite people…", since it's the only supported way to add invitees.

---

## Sources

**Notion Calendar / Cron**
- https://www.notion.com/help/notion-calendar-settings
- https://www.notion.com/help/time-zones
- https://www.notion.com/help/manage-your-calendars-and-events
- https://www.notion.com/help/guides/getting-started-with-notion-calendar
- https://www.notion.com/help/availability-blocking-and-time-zones (scheduling links; the time-zone content has moved to /help/time-zones)
- https://www.notion.com/help/notion-calendar-keyboard-shortcuts (only `?` and the global shortcuts location)
- https://www.notion.com/releases/2026-01-20 (hide the context panel)
- https://www.cron.com/changelog (primary record, 2021-01 to 2024-01; entries cited by date)
- https://x.com/NotionHQ/status/1907866235586375696 (reminders come from Google)
- https://matthiasfrank.de/en/notion-calendar/ (Time Travel red overlay, Notion items' limits, Space NL)
- https://2sync.com/blog/how-to-use-notion-calendar (database as default calendar)
- https://thomasjfrank.com/notion-home-everything-you-need-to-know/ (30-minute default from the Home widget)
- https://medium.com/@LearnChangeDo/the-ultimate-guide-to-using-notion-calendar-for-time-intentionality-c1e589850c79 (zoom-hours keys, secondary)

**Comparable apps**
- https://flexibits.com/fantastical/help/settings
- https://flexibits.com/fantastical/releasenotes (4.1.17 pinch-zoom fix)
- https://flexibits.com/blog/2023/03/saving-daylight-with-fantasticals-time-zones/
- https://support.apple.com/guide/calendar/icl26668/mac (Apple Calendar General settings)
- https://support.apple.com/guide/calendar/icl1018/mac (repeating events)
- https://www.busymac.com/docs/busycal/70587-day-view/
- https://www.morgen.so/guides/manage-multiple-time-zones-in-your-calendar
- https://changelog.morgen.so/introducing-time-zone-assistant-215349
- https://www.morgen.so/guides/the-starter-guide-to-morgen-tasks
- https://www.morgen.so/guides/how-to-use-frames
- https://feedback.morgen.so/p/pinch-to-zoom-in-the-mobile-calendar
- https://amie.so/changelog
- https://docs.vimcal.com/most-popular-features/time-travel
- https://learn.microsoft.com/en-us/troubleshoot/outlook/calendaring/additional-time-zone-shows-one-hour-offset-on-dst
- https://support.google.com/calendar/answer/37064

**Platform**
- https://developer.apple.com/documentation/eventkit/ekevent and the linked pages: `EKCalendarItem` (`timeZone`, `recurrenceRules`, `addRecurrenceRule(_:)`, `attendees`, `url`), `EKEvent` (`availability`, `structuredLocation`, `isAllDay`, `status`, `organizer`, `isDetached`), `EKParticipant`, `EKAlarm`, `EKRecurrenceRule`, `EKRecurrenceEnd`, `EKSpan`, `EKEventAvailability`, `EKStructuredLocation`, `EKCalendar` (`allowsContentModifications`, `supportedEventAvailabilities`, `cgColor`, `isImmutable`, `isSubscribed`, `type`), `EKEventStore` (`save(_:span:commit:)`, `remove(_:span:commit:)`, `saveCalendar(_:commit:)`, `defaultCalendarForNewEvents`, `requestWriteOnlyAccessToEvents`)
- https://developer.apple.com/documentation/eventkitui/ekeventeditviewcontroller (platform list: no macOS)
- https://docs.expo.dev/versions/latest/sdk/calendar/
- https://www.electronjs.org/docs/latest/api/web-contents (`setVisualZoomLevelLimits`, `zoom-changed`)
