# 01 — Calendar apps: UX, gaps, sync realities

Researched 2026-10-28. The sources disagree on some points, and some are old. Each item is tagged with a date, plus **[unverified]** where only one secondary source supports it. "Cron changelog" means the official cron.com/changelog. It ran from 2021 until the January 2024 rebrand and is the most detailed primary record of how Notion Calendar's interaction model was built.

---

## 1. Notion Calendar (formerly Cron)

**Facts**
- Cron launched in 2021 and was acquired by Notion in June 2022. It was rebranded as Notion Calendar on 2024-01-17.
- Free on every platform: Mac (macOS 11+), Windows, web (calendar.notion.so), iOS, Android. There is no Linux app, only community Electron wrappers.
- The desktop app is Electron (bundle id `com.cron.electron`).
- Providers:
  - Google: multiple accounts, OAuth.
  - iCloud: needs an Apple **app-specific password**.
  - Outlook/M365: added **2026-06-26**. Desktop and web only; mobile is "coming soon". Supports Teams, delegated calendars, and editing single or future occurrences of recurring events.
- Notion's help center says you "may be unable to add more than five calendars" because performance degrades past that.

### View switching (the thing the owner loves)
- **Number keys set how many days are visible.**
  - Cron changelog 2021-03-08: `1`/`D` = day, `2`–`9` = N days, `0`/`W` = week. The same entry: "→/← move by the number of displayed days, J/K move by one week".
  - Changelog 2021-05-24: `⌘K` → "Set number of displayed days" accepts **1–31**. Third-party guides say typing "14" there gives 14 days.
  - `M` = month view (added 2022-01-17).
- The days control is also clickable. A `±` sits right of the last visible date; `-`/`+` step the count. Mobile is limited to 1/2/3 days.
- Navigation:
  - `T` = today. A setting makes `T` either jump to today or left-align today. `⌥T` left-aligns today.
  - `J`/`K` = next/previous week, or month in month view.
  - `←`/`→` = shift by the visible span.
  - `.` = "Go to…" date with natural language (e.g. "three months from now").
  - Navigation keys can be held down to auto-repeat.
  - After navigating, the target day flashes orange so you can see where you landed.
- Toggles:
  - Old bindings: `⇧⌘E` weekends, `⇧⌘D` declined events.
  - Notion's 2024+ guide says `⌘K` toggles weekends; the settings page says `⌘K` collapses all-day. In both cases they are almost certainly `⌘K` command-menu actions, not direct bindings.
- Grid zoom:
  - Cron: `⇧⌘.` in, `⇧⌘,` out, `⇧⌘0` reset.
  - Notion: View → Zoom Hours In/Out (density), plus View → Interface scale.

### Keyboard model (aggregated: Notion help, Cron changelog, 2sync 2026, Matthias Frank)
The app has single-key verbs, `G`-prefixed "go to" chords, `E`-prefixed edit chords, and `⌘K` for everything else.

| Key | Action |
|---|---|
| `?` | Searchable shortcut cheat sheet |
| `⌘K` | Command menu (every action is reachable here) |
| `C` | Create event |
| `/` or `⌘F` | Search events. `⌥`-click a result to jump to it |
| `N` / `B` (or `⇧N`) | Select next / previous event |
| `S` | Scheduling / share availability |
| `Z` | Time-travel to another time zone (temporary red overlay; `Esc` exits). Right-click the zone label to pin it |
| `P` | Overlay a teammate's calendar |
| `F` | "Meet with…" (participants focus) |
| `O` | Add a Notion database |
| `V` (in-app) / `⌘J` | Join conferencing for the selected or next event |
| `E` then a letter | Edit a field, e.g. `E` `Y`/`N`/`M` = RSVP yes/no/maybe, `E` `E` = email participants |
| `X`, `⇧`-click, `⌘`-click, `⇧`-drag box | Multi-select; then batch move/resize/delete/color/RSVP |
| `⌘A` / `⌘⇧A` | Select all / add to selection |
| `⌘X/C/V/D` | Cut / copy / paste / duplicate events |
| `⌥`-drag | Duplicate an event |
| `⌘↩` | Save/send from any focused input |
| `⇧⌘↩` | Save **without emailing** participants. `⇧⌘⌫` deletes without email |
| hold `⌘` while dragging | Commit the move instantly, skipping the confirm. `⇧⌘` also skips the email |
| `⌘,` or `G` `S` | Settings |
| `G` `H` / `G` `F` | Help / feedback |
| `` ` `` / `~` | Toggle the app menu |
| `⇧⌃L` (later `⇧⌘L`) | Toggle theme |
| `Space` in a new event | Natural-language description: type "lunch w/ Sam Thu 1pm" and it fills title/time/participants. Shipped **2026-09-21**, desktop only |

- **Global (system-wide) shortcuts:** Cron's defaults were `⌃⌘K` to open the menu-bar calendar and `⌃⌘J` to join the next meeting (changelog 2021-12-06). An HN user cites `⌘⇧J`. Both are customizable in Settings → Menu bar → System-wide keyboard shortcuts.
- Cron also had a **Raycast integration and an API** (2022-01). Notion now exposes calendar read/write through Notion MCP (Oct 2026).

### Event creation and drag behaviour
- Double-click or drag on the grid to create an event. Dragging right after a double-click adjusts the new selection. Dragging across days creates a multi-day event.
- All-day events can be dragged into time slots, and timed events into the all-day row (2023-10).
- Typing `16:30` works in the time picker. Bare hours are disambiguated: 8–11 default to AM, 1–7 to PM.
- "Birthday" in a title becomes a yearly all-day event automatically.
- Events duplicated across calendars (same iCalUID) merge into one chip.
- The right **context panel** holds all fields and can be hidden (2026-01). Cron engineers cut panel keystroke latency from 200 ms to **16 ms** (2021-07-26), which shows they treated input latency as a feature.
- Propose a new time by dragging someone else's event.
- 0-minute events are allowed.

### Time zones
- Several zone columns sit left of the grid. Click `+` to add a zone, drag one to the far right to make it primary, and rename them with labels like "Ldn".
- `Z` time travel is temporary.
- On launch, the app detects that you are in a new zone and offers to switch.
- Zone search accepts countries and accented city names.
- The context panel shows times in your zone, with "Switch to event's time zone".

### Availability / scheduling
- `S`, then drag slots on the grid, produces a **text snippet plus links**. The snippet is auto-copied and includes the recipient's time zone.
- Since 2025-04-08 there are full scheduling links: one-off or recurring, with expiration, booking window, location/video, custom URL and description.
  - "Avoid conflicts" keeps the link valid for multiple bookings.
  - Invitees can reschedule or cancel from a link in the event.
- "Smart scheduling" (2026-08-31): when you add attendees, it suggests mutually free slots and shows conflicts first.
- Event blocking: personal events can auto-create "busy" mirrors on your work calendar, including "Block all events" and circular blocking.

### Menu bar
- Shows the next event as title + time + countdown, and four display variants down to icon-only.
- Settings control how many days of events appear, the lead time for the upcoming-event preview, and filters: no all-day, no events without participants, no events without conferencing/location.
- A join button sits at the top level. RSVP works from the menu bar.
- An upcoming-meeting popup can be snoozed and has a join button about a minute before start.
- Duplicates are merged, and the preview avoids the notch.
- Hiding a calendar from the menu bar also kills its meeting notifications. These are coupled; users may not want that.

### Settings (complete list from help center)
- General:
  - Show weekends, declined events, week numbers.
  - Week start.
  - `T` behaviour.
  - How far ahead the "upcoming meeting" panel looks.
  - Language, time format.
  - Prompt on new time zone.
  - Maps: Apple or Google.
  - Theme: Auto/Light/Dark only.
  - Launch at login.
- Notifications:
  - Default reminders defer to Google's per-calendar settings.
  - Invite notifications.
  - Upcoming-meeting lead time and sound.
- Menu bar section as above.
- Conferencing defaults per account.
- Calendar accounts, Notion workspaces.
- Per-calendar slider: color, include in menu bar, event blocking, default conferencing.

### What it does NOT do / complaints
- **No native tasks or reminders.** "Tasks" means Notion database items. They can't have recurrence, attendees or meeting links, and only name and date are editable from the calendar.
  - In mid-2026 an unannounced change made completed tasks vanish from the grid, and it can't be turned off (App Store review, 2026-08).
- **No habits, no reminders/alarms of its own.** Default reminders are delegated to Google.
- **Can't subscribe to ICS feeds in-app.** You have to subscribe in Google Calendar instead.
- No travel time.
- iCloud needs an app-specific password.
- Notion database items never reach Google/iCloud/Outlook (one-way world).
- **Offline:**
  - Cron disabled create/edit while offline (2021-02).
  - HN users list "no offline mode" (on flights) as a gap.
  - The app shows an offline toast but does not queue writes.
- **Mobile is weak:**
  - Only 1–3 day views; no week, month or agenda.
  - You can't edit events you didn't create on mobile.
  - No search, no scheduling links, no Outlook.
  - No iPad app.
  - App Store reviews from Sept 2026 say it has become "frighteningly slow".
- **Trust:**
  - The Google OAuth scope looks like "delete all your calendars". HN's top comment: "so scary"; replies: "the only scope that allows create also allows delete."
  - Users were forced to log out every 90 days, and there's no Keychain support.
  - The Cron→Notion migration silently uninstalled the app, and some users missed meetings.
- Perceived **neglect after the acquisition**. The product is drifting toward Notion AI/meeting notes; 2026 releases are mostly AI meeting notes and agents.
- Sync glitches: events on the wrong days, duplicates showing up about 20 minutes late (App Store 2026).
- UI nit: the selected date and today are both red, and users booked on the wrong day because of it.
- Limited theming (no accent colours, no density presets beyond zoom).

---

## 2. Fantastical (Flexibits)

**Platforms and pricing**
- Mac, iOS/iPadOS, watchOS, visionOS and Windows. **Android is "coming 2027"** (flexibits.com, Oct 2026).
- Free tier, then **Flexibits Premium at $6.99/mo or $56.99/yr**. Family is $10.49/mo or $89.99/yr for 5 people. Team plan is web only. 14-day trial.
- It moved from one-time purchase to subscription in 2020, and the annual price went from $39.99 to $56.99 around 2022–23. This is still the #1 complaint: G2 says "unacceptable, I'm switching"; Morgen quotes a Reddit user: "40% increase after 13 years".

**Signature UX worth stealing**
- **Natural-language parser**, the reference implementation.
  - Typing "Lunch with Sarah at 1pm tomorrow at Blue Bottle" shows a live-highlighted preview of the parsed fields as you type.
  - Works in English, French, German, Italian, Spanish, Portuguese and Japanese.
  - The same input box creates tasks; `⌘K` toggles event/task mode.
  - Forwarding an email creates an event (Premium).
  - Per flexibits.com/pricing, NL entry is **free**. Unstar's claim that it is paywalled is wrong.
- **Mini Window**: a menu-bar popover with a full input field, upcoming list and day/week/month/quarter/task views. It can be detached as a floating window and pinned on top (`⌃⌘A`).
  - Global open: `⌃⌥Space`.
  - `⌥`-click the menu icon opens the full window; `⌥`-double-click a date jumps the full window there.
- **Calendar Sets**: named groups of calendars, e.g. Work/Home.
  - `⌃1` = All, `⌃2…` = sets.
  - Premium: switches automatically by time or location, ties into Focus Filters, and syncs sets across devices.
- **DayTicker**: a compact horizontally scrolling day list. Other views: day, week, month, quarter, year.
- Keyboard: `⌘N` new, `⌘T` today, `⇧⌘T` go to date, `⌘F` search, `⌘↓` open first result, `⌘R` toggle task list, `⌘E` details, `⌘I` info, `⌥⌘S` sidebar, `⇧⌘H` show hidden items.
  - Arrow navigation: `⇢/⇠` month, `⇧⇢/⇧⇠` day, `⇧⇣/⇧⇡` week. `⌥←/→` moves one interval in the current view.
  - Move events: `⌃⌘→/←` ±1 day, `⌃⌘↓/↑` ±15 min (start), `⌃⇧↓/↑` ±15 min (end).
  - View switching is probably `⌘1`–`⌘5` **[unverified; not on the help page]**.
  - **No "N days" view**: week shows a fixed 7 days, or a configurable number of days in settings.
- Drag modifiers:
  - `⌥`-drag duplicates.
  - **`⌥`-drag across days in week view creates a timed event repeating on each day.**
  - `⌘⌥`-drag creates over an existing event.
  - Drag snaps to 15 min; hold `⇧` to disable snapping.
- **Openings** (booking links that respect existing events) and **Proposals** (polls across several candidate times). Both are Premium.
- **Weather inline** in all views (AccuWeather: 3 days free, 10 days Premium).
- **Interesting Calendars**: holidays, sports, TV.
- Conference-link detection for dozens of services, including WhatsApp, Signal and Slack Huddle, with a one-click Join button (Premium).
- **Tasks**: iCloud Reminders, Todoist and Google Tasks (free). Overdue tasks carry forward.
- Emoji badges, custom event colors, templates.
- Accounts: Google, M365, Exchange, iCloud, CalDAV, Todoist.
  - Flexibits says to **add accounts directly rather than via macOS/iOS system accounts (EventKit)**. System accounts give a "limited and slower experience": no invitees, no push, no room lookup, no hide-event, no custom colors.
  - iCloud still uses an app-specific password.

**Weaknesses**
- Subscription anger and the price hike.
- Crashes: App Store and G2 report "crashes daily" and "a bit crashy lately".
- Feature density makes it feel heavy; HN mentions "beachballing".
- Free tier limits: 1 calendar set, 1 invitee per event, 2-week calendar mirroring.
- Fixed views, no arbitrary N-day.

---

## 3. Amie

- **Status: pivoted.** The Oct 2026 homepage says "Run your workday on autopilot with AI agents". It is now mainly a bot-free AI meeting recorder/notetaker plus an agent, with an MCP server.
- Calendar and todos are still there, but no longer the pitch.
- Platforms: macOS, Windows, iOS. Providers: Google and Apple; full Outlook sync reportedly added in 2026.
- Pricing (Ellie review, Oct 2026): **Pro $25/mo ($20/mo yearly), Business $50/mo ($40/mo yearly)**. No free plan, 7-day trial. Sources disagree, and the pricing page renders no numbers.

**Ideas worth stealing (from its 2022–2024 calendar era)**
- Unscheduled **todos in a column next to the grid. Drag a todo onto a slot to time-block it, and drag it back to unschedule.**
- Todos and events can be **checked off on the calendar** ("I love marking things done on my calendar so I see how far ahead/behind I am").
- Strong "joy" polish: purposeful animations, a premium feel, emoji. Keyboard-first for everything.
- Split view for comparing multiple calendars side by side.
- AI chat for bulk operations ("I'm sick, move everything to Thursday").

**Weaknesses**
- Price.
- Google/Outlook sync bugs and "stability problems" (Ellie 2026).
- Tasks are secondary; **no habits/goals**.
- Strategic drift away from being a calendar. An HN user switched from Cron to Amie in 2024; by 2026 Amie had become a notetaker.

---

## 4. Vimcal

- Positioning: "Superhuman for calendar", for founders and executive assistants.
- Platforms: Mac/Windows desktop, web, Chrome extension, iOS. Providers: Google and Outlook/Exchange only, no iCloud.
- Pricing (2026): **$20/mo or $16.67/mo yearly**. The free tier is iOS only. EA plan is $75/mo.
- Design method (TechCrunch 2022): the team "listed out every keystroke and mouse movement" for the 10 most common tasks and cut steps. The goal was half the steps of competitors.

**Ideas worth stealing**
- `⌘K` **Command Center**. It lists the most-used actions first and accepts NL creation ("Lunch with Lisa 1pm tomorrow").
- **Flash shortcuts**: press `F` to overlay hotkey hints on every UI element, Vimium style. This is a cheap way to teach shortcuts.
- `J/K/H/L`-style navigation. `D`/`W`/`M` views.
- **Slots** (`A`): drag times on the grid, and formatted text ("Tue 10–11, Wed 2–3 PT") updates live in the side panel, ready to paste into email.
  - `Z` adds up to 5 extra zones to the text.
  - **Holds**: proposed slots become tentative "hold" events, and the rest are auto-deleted when one is booked.
  - "Previously sent" history lets you reuse slot sets.
- **Time Travel** (`Z`): views another zone without changing settings. A work-hours overlay appears only while time travelling.
- **Free Time Finder**: paste a conversation or drop a screenshot containing proposed times, and it parses them onto the grid.
- Templates and sticky notes, color tagging, a weekly metrics report, focus mode, Slack integration, MCP.

**Weaknesses**
- Expensive and niche.
- No iCloud.
- Shortcut learning curve: "until you learn the shortcuts it feels like a prettier calendar" (AISO Tools).
- Aimed at EAs, so it is overkill for personal planning. No tasks or habits.

---

## 5. Google Calendar (web)

- Free; Workspace adds appointment schedules, Gemini features, Focus time/OOO/working location.
- **Shortcuts are opt-in**: Settings → "Enable keyboard shortcuts". `?` lists them.
  - Views: `1`/`D` day, `2`/`W` week, `3`/`M` month, `4`/`X` **custom view**, `5`/`A` agenda (schedule). Year view exists too.
  - `J`/`N` next range, `K`/`P` previous range (`K`/`P` are not on the fetched help page but are long-standing).
  - `T` today, `G` go to date, `C` create, `E` details, `Backspace` delete, **`Z` undo**, `/` search, `R` refresh, `S` settings, `⌘S` save, `Esc` back.
- **Custom view = 2–7 days or 2/3/4 weeks**. It is set in Settings → View options, and only one custom value is available at a time. You can also drag across the mini-month to show an arbitrary range.
  - This is much slower than Cron's press-a-digit model.
- Tasks: Google Tasks can be dragged onto the grid. Reminders were merged into Tasks.
- Weaknesses:
  - **No native desktop app.**
  - Shortcuts are hidden behind a setting.
  - Quick-add NL parsing is weak outside English.
  - Search results are not sorted by date.
  - Notification permissions get reset after iOS updates.
  - Recurrence UI is clunky.
  - Gemini scheduling features are paywalled (Workspace Business+, rolled out Jan–Feb 2026).

---

## 6. Apple Calendar (macOS 27 "Golden Gate", released 2026-09-14)

- Free; built on EventKit/CalDAV. iOS/macOS 18 added Reminders inside Calendar.
- macOS 27 adds natural-language add/edit, pull-to-refresh, faster scrolling and Siri availability checks. The iOS 27 redesign covers only event details and creation. The Mac app has been "functionally unchanged in years" (How-To Geek on macOS 26).
- Shortcuts:
  - Views: `⌘1` day, `⌘2` week, `⌘3` month, `⌘4` year.
  - Navigation: `⌘←/→` previous/next, `⌘T` today, `⇧⌘T` go to date, `⌘F` find.
  - Events: `⌘N` new, `⌘E` edit, `⌥⌘I` inspector.
  - Move events: `⌃⌥↑/↓` ±15 min, `⌃⌥←/→` ±1 day.
  - `⇧⌘A` availability panel. `⌥⌘`-click a calendar checkbox to solo it.
- **No N-day view, no command palette, no single-key shortcuts.**
- Complaints:
  - Colors are per calendar only.
  - Adding CalDAV/Exchange accounts is hard to discover.
  - After airplane mode, sync between devices takes 5–15 minutes.
  - All-day events shift by a day across time zones.
  - macOS 26.x notification regressions: alerts not firing, default alert resetting to None.
  - Week view showed odd ranges on 26.0.1.

---

## 7. Morgen

- Paid only since **March 2026**: **$30/mo or $180/yr**. Teams are $10/seat/mo yearly. 14-day trial.
- Platforms: macOS, Windows, **Linux**, iOS, Android.
- Providers: Google, Outlook, **iCloud, CalDAV**, Exchange.
- Tasks are read-write with Todoist, Notion, ClickUp, Linear, Google Tasks, Apple Reminders and Obsidian.

**Ideas worth stealing**
- `⌘K` **command bar with inline syntax**: `>list` picks a task list, `/calendar` picks a calendar, `!` sets priority. Including a time schedules the item.
  - `⌘⇧K` is global: it focuses Morgen with the command bar open from any app.
- **Calendar sets on number keys `0`–`9`.** Note the clash: Cron uses digits for day count. Pick one.
- `\` toggles theme. `.` lists all shortcuts. `D`/`W`/`M`, `T`, `R` refresh, `Space` toggles the drawer.
- **Frames**: recurring typed time blocks, e.g. "Deep work 9–11". Filters on tag, project or source decide which tasks the AI planner may place there.
  - Drag on the grid → choose Event/Task/Frame/Routine.
  - `Ctrl`-drag a Frame moves its tasks with it.
  - A "Not flexible" flag pins tasks.
- The AI planner **proposes and the user approves**, unlike Motion, which reshuffles automatically.

**Weaknesses**
- Price.
- Basic booking links (no custom questions).
- Task UI gets cluttered at scale.
- Mobile needs desktop setup first.
- Some features are desktop-only (Apple Reminders, system shortcuts).

---

## 8. Others (brief)

- **Dola**: a chat-only AI calendar assistant (WhatsApp/Telegram/iMessage) over Google/Apple/CalDAV. One source (2026-09-28) says it was **discontinued** (heydola.com dead); others were still live in June 2026. Lesson: a chat-only calendar is not a defensible product.
- **MeetingBar** (open source, Apache-2.0, macOS):
  - The reference "next meeting in menu bar" app, built on EventKit or Google directly.
  - Shows title/time/countdown, filters (all-day, declined, tentative, link-less), detects 50+ meeting providers, and has a global join shortcut.
  - Full-screen reminders for important meetings. AppleScript hook on join (e.g. pause music).
  - It shows how small the menu-bar feature set can be and still be loved.
- **BusyCal**: one-time ~$50, CalDAV-native, travel time, rich recurrence, Reminders. The anti-subscription choice.
- **Itsycal**: free menu-bar mini month. Users are asking for reminders support.

---

## Patterns worth stealing (ranked)

1. **Digit = day count, arrows = shift by visible span, J/K = week, T = today, `.` = go to date.**
   - This is the core of the "fast" feeling the owner likes. It is instant, has no menu and no animation lag, and holding a key auto-repeats.
   - Allow up to 31 via the command menu ("14" → 14 days).
   - Persist the last count. Flash the target day after big jumps.
2. **`⌘K` command menu that also accepts natural language.** Every action is listed in it, with its shortcut shown, so the command menu teaches the shortcuts. Add Morgen-style inline tokens (`/calendar`, `>list`, `!priority`, `#tag`).
3. **Natural-language create with live parsed preview.**
   - Fantastical-style highlighting while typing.
   - Cron rules: 8–11 = AM, 1–7 = PM; `16:30` works.
   - Notion 2026: `Space` in a new event jumps to the NL field.
   - Must work offline and locally; no LLM round-trip for "lunch tomorrow 1pm".
4. **Optimistic, instant edits with modifier escape hatches.**
   - Hold `⌘` while dragging to commit without a confirm sheet. `⇧⌘↩` saves without emailing guests.
   - Undo on `Z` (Google) or `⌘Z`.
   - Never block the UI on the network. Queue writes and reconcile (see sync notes). Cron/Notion *disable* editing offline, which is a gap to exploit.
5. **Drag grammar.**
   - Drag-create, drag across days to create multi-day, drag between all-day and timed.
   - Resize edges, `⌥`-drag to duplicate, `⇧` disables 15-minute snapping.
   - Fantastical's `⌥`-drag across days creates a repeating event.
   - Box-select with `⇧`-drag, then batch move/resize/color/delete.
   - Dragging a todo from the sidebar to the grid time-blocks it; dragging it back unschedules it (Amie).
6. **Menu bar as a first-class surface.**
   - Next event with countdown, a join button, a configurable lookahead, filters (skip all-day/no-attendee/no-link events).
   - Global hotkeys: open the panel (`⌃⌘K`-style) and join the next meeting (`⌃⌘J`-style).
   - Fantastical's Mini Window adds a full NL input in the popover; detachable and pinnable.
7. **Time zone handling.**
   - Multiple zone columns, drag to make primary.
   - `Z` "time travel" as a temporary overlay with work-hours shading.
   - Auto-detect travel; "show in event's zone" on each event.
8. **Availability as text** (Cron `S`, Vimcal `A`).
   - Drag slots on the grid and get auto-copied, formatted text in the recipient's zone, plus a link.
   - Optional holds that auto-clear on booking.
   - For a personal app this beats a full Calendly clone.
9. **Shortcut discoverability.** `?` searchable cheat sheet; Vimcal's `F` flash-hints overlay; shortcuts shown in context menus and in `⌘K`.
10. **Calendar sets / quick solo.**
    - Fantastical `⌃1..9` sets with time/location auto-switch.
    - Apple/Cron `⌥`-click the eye or checkbox to show only that calendar.
11. **Event chip details.**
    - Merge duplicates across accounts (same iCalUID).
    - RSVP status ordering.
    - Emoji badges; inline weather (Fantastical).
    - Clearly distinguish "selected date" from "today" (a Notion complaint).
12. **Cross-calendar blocking.** Personal events create "busy" mirrors on a work calendar (Cron/Notion; Fantastical "calendar mirroring").

## Common complaints / gaps to exploit

- **No real tasks, and no habits at all** in Notion Calendar, Fantastical (tasks are delegated to Reminders/Todoist), Vimcal, Google or Apple. Amie and Morgen do tasks but cost $20–30/mo and have no habits. *A unified calendar + tasks + habits app has no direct competitor.*
- **Offline**: Notion/Cron block edits offline, and Amie loses recordings offline. A local-first store with a write queue is a clear differentiator.
- **Subscription fatigue**: Fantastical's price hike, Morgen dropping its free plan, Amie and Vimcal at $20+. Free, or a fair one-time or low price, wins goodwill.
- **Electron sluggishness / Notion lag**: "frighteningly slow" (Notion Calendar iOS 2026), and Notion's apps generally take the most performance complaints. A native or very tight app is a selling point.
- **Provider gaps**: Vimcal has no iCloud; Notion added Outlook only in 2026, with no mobile Outlook; Amie is Google/Apple first. iCloud needs app-specific passwords everywhere. CalDAV/Fastmail is rarely supported (Morgen, Fantastical, BusyCal do support it).
- **Trust / permissions**: Google's broad scopes scare users. Explain the scopes, store tokens in the Keychain, don't force re-login every 90 days.
- **Acquisition/pivot risk**: Cron → Notion neglect, Amie → AI notetaker, Dola shut down. Users value a calendar that stays a calendar.
- **Mobile parity**: Notion mobile only has 1–3 day views and can't edit others' events. Users explicitly ask for week/month/agenda on mobile.
- **Hidden or opt-in shortcuts** (Google), and no N-day views (Apple, Fantastical).
- **Time zone bugs** across all apps: all-day events shifting across zones, DST, NL parsing ignoring the stated zone ("3pm Pacific" saved as local).
- **Notifications silently failing** (Google after iOS updates, Apple macOS 26). Reliable local alarms are table stakes.
- **Recurrence editing**: weak in Notion, clunky in Google, and Outlook can duplicate a series when one instance is edited.
- **No in-app ICS subscription** (Notion).

## Sync integration notes

### Google Calendar API (v3)
- **Quotas**:
  - 10,000 requests/min/project and 600 requests/min/user/project, over a sliding window.
  - 1M/day billing threshold. Billing details are "later in 2026" with ≥90 days' notice. **New quotas apply to projects created on or after 2026-05-01.**
  - Exceeding quota returns `403 usageLimits` or `429`. Use truncated exponential backoff (2^n s + ≤1 s jitter, cap 32–64 s).
  - Separate undocumented "operational limits" apply to rapid writes to one calendar.
  - Google says not to sync every client at midnight: jitter recurring intervals by ±25%.
- **Incremental sync**:
  - A full list returns `nextSyncToken` on the last page. Later lists pass `syncToken` and get only changes, **always including deletions**.
  - Most filters are incompatible with `syncToken` (400 error). The sample does a full sync with `timeMin` = one year ago.
  - **`410 Gone` → wipe the local store and do a full resync.**
- **Push**:
  - `events.watch` per calendar (and `calendarList.watch` per user).
  - Needs a **public HTTPS webhook with a valid certificate**. That means a server: a desktop-only app can't receive pushes directly.
  - Notifications carry **no payload**, only headers (`X-Goog-Resource-State: sync|exists`). Every push must be followed by an incremental list.
  - Channels expire, there is no auto-renew, and pushes "are not 100% reliable", so a polling fallback is still required.
  - Desktop-only design: poll with a sync token every 30–60 s while the app is focused, back off when it's in the background. Or run a small relay server that receives webhooks and forwards them over WebSocket/APNs.
- **OAuth**:
  - `calendar` / `calendar.events` are **sensitive (not restricted)** scopes. They need Google verification, but no CASA security audit (CASA applies to Gmail/Drive).
  - Unverified apps are capped at **100 users** and show a scary warning. In Testing mode, refresh tokens expire every 7 days.
  - Verification can take weeks (a forum post from Sept 2026 had been stuck 4+ weeks).
  - Notion Calendar hit "Google Auth rate limits" on launch day (2024-01-17).
- Extras: event types (`focusTime`, `outOfOffice`, `workingLocation`, `birthday`), `conferenceData` for Meet links, `colorId` from a fixed palette (no arbitrary hex per event), and Google Tasks as a separate API.

### Microsoft Graph (Outlook / M365)
- **Delta**:
  - `/me/calendarView/delta?startDateTime&endDateTime` works over a **fixed date window, per calendar**. Delta without a window exists only in beta.
  - It returns `@odata.nextLink`, then `@odata.deltaLink`; tokens encode the window. Deleted items come back as `@removed`.
  - `$select` is not supported.
  - Recurring series come back expanded as occurrences and exceptions inside the window.
- **Webhooks (subscriptions)**:
  - Maximum lifetime for event/message/contact subscriptions is **10,080 min (<7 days)**, or 1,440 min (<1 day) with `includeResourceData`.
  - Must be renewed. The notification URL must be HTTPS and pass a validation-token handshake.
  - `lifecycleNotificationUrl` delivers `reauthorizationRequired`, `subscriptionRemoved` and `missed` events.
  - Latency for events is documented as "unknown"; calendar is <1 min average, 3 min maximum.
- **Throttling**: **10,000 requests per 10 min per app per mailbox, 4 concurrent requests per mailbox**, 150 MB upload per 5 min. `429` comes with `Retry-After`. JSON batching sends at most 4 requests to Outlook in parallel.
- Work accounts may need **tenant admin consent** (Notion's help center flags this).

### iCloud (CalDAV)
- **No REST API, no OAuth for general developers, no push for third parties.** The only way in is CalDAV at `caldav.icloud.com`: discover via `/.well-known/caldav`, then PROPFIND principal → calendar-home-set.
  - Use ctag/etag or `sync-collection` (RFC 6578) to poll for changes.
  - Each write is a hand-built iCalendar (RFC 5545) payload sent with PUT.
- Auth is an **app-specific password**:
  - Requires 2FA; maximum 25 per account.
  - All of them are revoked when the user changes their Apple password, with no warning. Detect the 401 and prompt for a new one.
  - The user must create it manually. Notion Calendar, Fantastical and Morgen all make users do this step.
- Since **2025-10-07** Apple supports OAuth-style "authorize with Apple Account" for iCloud Mail/Calendar/Contacts in "supported third-party apps". The only confirmed partner is Microsoft Outlook, and there is **no public developer program**. Treat it as unavailable.
- Vendors report other quirks: query ranges of about a year at most, no `primary` alias, limited filter support. Sync lag between devices commonly runs 30–90 s or more.

### EventKit (macOS/iOS, on-device)
- Reads and writes **every account the user has configured in System Settings**: iCloud, Google (via CalDAV), Exchange, CalDAV, subscribed and local calendars. Also covers **Reminders** (`EKReminder`).
  - No OAuth, no server, no passwords for us. The OS handles sync and push.
- Permissions (iOS 17 / macOS 14+): `requestFullAccessToEvents` or write-only access; there is no read-only access. Info.plist must declare `NSCalendarsFullAccessUsageDescription`. Reminders need separate full access.
- Change detection: an `EKEventStoreChanged` notification fires with no diff, so re-query the visible range (cheap; it's local).
- **Hard limits**:
  - **Can't add or modify attendees or send invites.** `EKParticipant` is read-only: "EventKit cannot add participants to an event nor change participant information." The workarounds are the system `EKEventEditViewController` or private API.
  - No Google Meet `conferenceData` creation, no Google event colors, no focus/OOO types, no RSVP via the provider's semantics.
  - Sync freshness depends on the OS. Google accounts added to macOS sync by polling CalDAV, with noticeable lag.
- Fantastical's own docs say system accounts give a "limited and slower experience" and require direct accounts for invitees, push, room lookup and colors. MeetingBar and Itsycal use EventKit happily because they are read-mostly.

### Practical architecture implications
- **Local-first store** (SQLite) as the source of truth for the UI:
  - Render from local data, and apply edits optimistically with an outbox queue that drains to providers.
  - Handle conflicts with etag/If-Match (Google `etag`, Graph `@odata.etag`, CalDAV `ETag`). On 412, refetch and re-apply or surface the conflict.
  - Recurrence expansion happens client-side (RRULE + EXDATE + overrides). Store instances lazily for the visible window.
  - Time zones: store events with an IANA zone; all-day events are floating dates, never UTC midnights (the most common cross-app bug).
- **Cheapest viable v1 for a personal Mac app**:
  - **EventKit for reading everything and for simple writes**, plus Reminders.
  - Add a **direct Google API** connection later for invites, Meet links, colors and push freshness.
  - Graph after that.
  - Direct CalDAV for iCloud is only worth it for cross-platform; on Mac, EventKit already covers iCloud.
- **Push requires a server** for Google and Graph. Without one, poll with sync tokens and delta links while foregrounded, which is cheap with incremental sync. iCloud is always polling (or EventKit on Apple platforms).
- Tasks and habits are our own data, so they don't need provider sync; stored locally, they work offline by default. Optional export: time-blocked tasks as real events on a chosen calendar, and habits as local-only.

---

## Sources

**Notion Calendar / Cron**
- https://www.notion.com/help/notion-calendar-keyboard-shortcuts
- https://www.notion.com/help/notion-calendar-settings
- https://www.notion.com/help/guides/getting-started-with-notion-calendar
- https://www.notion.com/help/manage-your-calendars-and-events
- https://www.notion.com/help/availability-blocking-and-time-zones
- https://www.cron.com/changelog (primary; 2021–2024 feature and shortcut history)
- https://www.calendar.com/cron-calendar/ (secondary guide confirming 2–9, ⌘K "14", Z, global ⌃⌘K/⌃⌘J)
- https://matthiasfrank.de/en/notion-calendar/ (shortcuts guide)
- https://matthiasfrank.de/en/notion-updates/ (2026 dated updates: Outlook 06-26, smart scheduling 08-31, NL events 09-21)
- https://alternativeto.net/news/2026/6/notion-calendar-introduces-outlook-integration-for-unified-event-management/
- https://2sync.com/blog/how-to-use-notion-calendar (Oct 2026; limits, mobile gaps; vendor-biased)
- https://21notion.com/en/notion-updates/notion-calendar-natural-language-events
- https://news.ycombinator.com/item?id=39030375 (launch thread, Jan 2024)
- https://apps.apple.com/us/app/notion-calendar/id1607562761?see-all=reviews&platform=iphone
- https://techcrunch.com/2024/01/17/notion-launches-a-calendar-app/
- https://appcatalog.cloud/apps/notion-calendar (bundle id com.cron.electron)

**Fantastical**
- https://flexibits.com/fantastical/help/keyboard-shortcuts
- https://flexibits.com/fantastical/help/calendar-views
- https://flexibits.com/fantastical/help/calendar-sets
- https://flexibits.com/fantastical
- https://flexibits.com/pricing
- https://flexibits.com/fantastical/faq
- https://flexibits.com/fantastical-ios/faq (direct vs system accounts)
- https://flexibits.com/fantastical/icloudauthentication
- https://flexibits.com/blog/2023/01/a-day-in-the-life-of-using-keyboard-shortcuts-in-fantastical/
- https://horacal.app/blog/fantastical-pricing/
- https://talk.tidbits.com/t/alternative-to-fantastical/21177
- https://www.morgen.so/blog-posts/fantastical-pricing

**Amie / Vimcal / Morgen / others**
- https://amie.so , https://amie.so/pricing
- https://ellieplanner.com/comparisons/amie-calendar-review (Oct 2026; competitor-authored)
- https://techcrunch.com/2022/03/17/amie-is-a-new-calendar-app-with-a-social-twist
- https://techcrunch.com/2022/11/15/vimcal-wants-be-the-most-nifty-calendar-app-on-the-block/
- https://docs.vimcal.com/most-popular-features/slots
- https://docs.vimcal.com/most-popular-features/time-travel
- https://docs.vimcal.com/advanced-features/free-time-finder
- https://makerstack.co/reviews/vimcal-review/
- https://www.morgen.so/guides/morgen-web-app-essential-shortcuts
- https://www.morgen.so/guides/create-events-and-tasks-with-command-bar
- https://www.morgen.so/frames
- https://ellieplanner.com/comparisons/morgen-calendar-review
- https://get-alfred.ai/blog/morgen-pricing
- https://aisotools.com/pricing/dola-ai , https://znewsai.com/dola-ai-review-2026/
- https://github.com/leits/MeetingBar

**Google / Apple**
- https://support.google.com/calendar/answer/37034 (keyboard shortcuts)
- https://www.makeuseof.com/tag/google-calendar-settings/ (custom view 2–7 days / 2–4 weeks)
- https://workspaceupdates.googleblog.com/2026/01/improved-meeting-suggestions-gemini-calendar.html
- https://support.apple.com/guide/calendar/keyboard-shortcuts-ical002/mac
- https://www.howtogeek.com/all-the-macos-26-tahoe-feature-youre-not-getting-at-launch/
- https://9to5mac.com/2026/09/14/macos-27-golden-gate-now-available-here-is-everything-new/
- https://9to5mac.com/2026/09/03/apples-calendar-app-in-ios-27-has-brand-new-design-for-key-features/
- https://discussions.apple.com/thread/256218887 (Tahoe notification regressions)

**Complaint aggregations**
- https://unstar.app/blog/fantastical-google-apple-outlook-notion-calendar-apps-ranked-2026 (May 2026; no raw counts, vendor; some claims wrong, e.g. Fantastical NL is free)

**Sync / APIs**
- https://developers.google.com/workspace/calendar/api/guides/quota
- https://developers.google.com/workspace/calendar/api/guides/push
- https://developers.google.com/workspace/calendar/api/guides/sync
- https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/ (scope sensitivity)
- https://discuss.google.dev/t/sensitive-scope-verification-calendar-events-pending-since-aug-26-no-update-in-4-weeks/398909
- https://learn.microsoft.com/en-us/graph/api/resources/subscription
- https://learn.microsoft.com/en-us/graph/delta-query-events
- https://learn.microsoft.com/en-us/graph/throttling-limits
- https://support.apple.com/en-us/121539 (iCloud "authorize with Apple Account", 2025-10-07)
- https://support.apple.com/en-us/102654 (app-specific passwords)
- https://techcommunity.microsoft.com/blog/outlook/it%E2%80%99s-now-easier-to-access-icloud-mail-calendar-and-contacts-in-outlook/4465707
- https://developer.nylas.com/docs/cookbook/calendar/apple-calendar-api/ (CalDAV vs EventKit)
- https://openradar.appspot.com/15504551 , https://developer.apple.com/forums/thread/74209 (EventKit attendees read-only)
