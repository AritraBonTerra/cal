# Cal: product and build plan

A keyboard-first calendar (Notion Calendar's UX), task manager (Things 3 / TickTick), habit tracker and deterministic auto-scheduler, with no LLM. It runs on the Mac (Electron) and on iPhone and iPad (Expo), synced through Convex. It's for personal use now and may become a product.

Research behind this plan:
- [research/01-calendars.md](research/01-calendars.md): Notion Calendar, Fantastical, Vimcal, Amie, Morgen, Google, Apple; sync APIs
- [research/02-tasks.md](research/02-tasks.md): Things 3, TickTick, Todoist, OmniFocus, Sunsama, Akiflow; time-blocking rules
- [research/03-auto-scheduling.md](research/03-auto-scheduling.md): Motion, Reclaim, SkedPal, Morgen; algorithms; trust UX
- [research/04-habits.md](research/04-habits.md): Streaks, Loop, Habitify, Habitica, Reclaim habits; behavior research
- [research/05-stack-react-native.md](research/05-stack-react-native.md): Theo's "Did AI Kill React Native?" video; Expo in 2026; Electron + EventKit; Convex; monorepo
- [research/06-t3code-ui-process.md](research/06-t3code-ui-process.md): how T3 Code improved its UI through repeated scored review rounds; a review loop we can reuse
- [research/07-ui-design.md](research/07-ui-design.md): Capy, Notion Calendar, Things, Linear, Raycast teardowns; Cal's design values

---

## 1. Where the gap is

| Need                | Who does it well        | What's wrong with them                                                                           |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| Fast calendar UX    | Notion Calendar, Vimcal | No tasks, no habits. Electron and slow. Notion can't edit offline. Vimcal has no iCloud.         |
| Task management     | Things 3                | No durations, no times of day, read-only calendar strip. Apple only.                             |
| Tasks on a calendar | TickTick                | One block per task (can't split). Destructive Google sync. Cluttered.                            |
| Time-blocking       | Sunsama, Akiflow        | $17–34/mo with no free tier. No habits.                                                          |
| Auto-scheduling     | Motion, Reclaim         | Motion reshuffles constantly ("calendar anxiety") at $29–49/mo. Clockwise shut down in Mar 2026. |
| Habits              | Streaks, Loop           | Track completion but schedule nothing. Reclaim schedules habits but never records completion.    |

No app combines calendar, tasks and habits for less than $20–30/mo. No app both schedules habits and records completion. Offline editing and a fast native-feeling app are also open ground.

## 2. Principles

Each principle comes from a complaint we found in the research.

1. **Keyboard first, and instant.** Every action works from the keyboard, and `⌘K` lists every action with its shortcut. Edits apply locally right away and never wait on the network.
2. **Offline edits are never lost.**
   - Device calendars are read locally through EventKit, so they always work offline.
   - Each device keeps a copy of our own data (tasks, habits, blocks) in a local SQLite database managed by PowerSync, and the UI reads from that copy.
   - Edits are saved locally first and uploaded whenever the device is back online, even after a restart.
   - Convex is the shared record across devices. §3.1 explains how.
3. **The calendar is the plan; the log is the truth.** A time block is an intention. Completing a task or habit is a separate fact. Doing the gym habit at 6pm counts even if its block was at 7am.
4. **The scheduler proposes and the user decides.** It never silently moves work. Big replans show a diff before anything changes, and every placement can answer "Why is this here?"
5. **Nothing disappears.** Unfinished blocks stay where they were as history. Work that can't fit goes to a visible "Couldn't fit" tray. Deleting a calendar event never deletes a task.
6. **Missing a habit isn't failure.** Use Loop-style habit strength as the main number and a "never miss twice" grace rule. A single missed day never resets everything to zero.

## 3. Platform and stack (decided)

| Layer            | Choice                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mac app          | **Electron**, Vite, React 19 (DOM), Tailwind v4. Calendar dragging uses pointer events directly, with no gesture library in between.                                                                                                                                                                                    |
| Mac calendars    | **`calkit`, a small Swift helper** that Electron starts and talks to over stdio with JSON. It uses EventKit to read and write every calendar account set up in macOS, plus Reminders, and it reports changes.                                                                                                           |
| iPhone / iPad    | **Expo** (SDK 58), Expo Router, Uniwind (Tailwind for React Native), Reanimated 4, Gesture Handler 3, Legend List. Device calendars come from `expo-calendar`. iPad keyboard shortcuts need a small custom Expo module.                                                                                                 |
| Sync and backend | **Convex** is the shared record for Cal's own data: tasks, blocks, habits, settings. **PowerSync** keeps a local SQLite copy on each device and queues edits made offline (§3.1). Device calendar events never go into Convex. Each device reads its own, and the Mac and iPhone usually have the same accounts anyway. |
| Local storage    | The PowerSync client libraries: `@powersync/web` in the Electron window, and `@powersync/react-native` on iPhone/iPad. The two apps share one schema and the same `@powersync/react` query hooks.                                                                                                                       |
| Auth             | **Convex Auth.** PowerSync accepts its tokens directly, and that's how the official PowerSync + Convex demo works. On Electron, start with email sign-in to avoid OAuth redirects. Better Auth is the fallback if Convex Auth gets in the way.                                                                          |
| Shared TS        | Domain types, the scheduler, the natural-language parser, recurrence and time math, React hooks over Convex, the command and keyboard-shortcut list, and theme values.                                                                                                                                                  |
| Tooling          | bun workspaces with the hoisted linker (no Turborepo yet), one pinned React version, Biome, `tsc --noEmit`, `bun test`.                                                                                                                                                                                                 |

**Why the Mac and iPad get separate UI code.** The calendar grid is the product, and the Mac is where its keyboard and drag behavior matter most. Running the Expo UI inside Electron through react-native-web would route those drags through Gesture Handler's web support, which has open bugs for exactly these cases. T3 Code made the same split: a React DOM desktop app and a React Native mobile app sharing everything below the views. Only views and gesture code are written twice.

**Things to get right with `calkit`:**
- macOS checks calendar permission against the Electron app, not the helper. The usage description and the `com.apple.security.personal-information.calendars` entitlement go on the app bundle, or access fails with no prompt.
- The Mac app ships outside the App Store, signed with a Developer ID and notarized.
- EventKit can't add attendees. Sending invites waits for direct Google API support.

**What the video changed** (Theo, "Did AI Kill React Native?", 2026-09-14): use Expo rather than bare React Native, and plan on over-the-air updates. Use Legend List rather than FlashList. Watch for `useEffect`s that hurt performance, and test back-swipe gestures on a real device.

```
cal/
├─ apps/
│  ├─ desktop/        # Electron: main (menu bar, hotkeys, notifications, calkit), preload, renderer (React DOM)
│  │  └─ native/calkit/   # SwiftPM: EventKit over JSON-RPC on stdio
│  └─ mobile/         # Expo: app/ (routes), src/grid/ (touch grid), modules/cal-keys/
└─ packages/
   ├─ backend/        # convex/: schema, tasks, blocks, habits, crons, auth
   ├─ domain/         # types, client IDs, Temporal helpers, all-day dates with no time zone, rrule
   ├─ scheduler/      # pure plan(); bun test snapshot tests
   ├─ nlp/            # Quick Entry parser built on chrono-node
   ├─ calendar-source/# ExternalEvent type and CalendarSource interface (EventKit now, Google later)
   ├─ sync/           # PowerSync schema, Sync Streams config, upload connector that calls Convex mutations (§3.1)
   ├─ app-core/       # React hooks over the PowerSync tables, undo stack, command registry (no DOM or React Native imports)
   └─ theme/          # theme.css design values, shared by desktop Tailwind and Uniwind
```

### 3.1 Offline sync (PowerSync + Convex)

PowerSync sits between each device's local SQLite and Convex. The source for this section is PowerSync's [Convex announcement](https://releases.powersync.com/announcements/announcing-convex-backend-support-experimental), dated 2026-06-10.

- **Reads.** The UI queries local SQLite through `@powersync/react` hooks, so it never waits on the network. PowerSync copies data out of Convex using Convex's streaming export: a snapshot at first, then it checks for changes every 1000ms. That interval is fixed on PowerSync Cloud. Sync Streams decide which rows each user receives (only their own).
- **Writes.** Edits go to local SQLite immediately and wait in PowerSync's upload queue. The queue is stored on disk, so offline edits survive a restart. Our upload connector replays them by calling our normal Convex mutations. When the change comes back through replication, the local copy is confirmed.
- **What Convex needs:**
  - a `powersync_checkpoints` table
  - a `powersync_checkpoints:createCheckpoint` mutation
  - a deploy key for the deployment being copied
- **IDs.** Devices create UUIDs. Every Convex table has an indexed `id` column holding that UUID, and mutations look records up by it rather than by Convex's own `_id`.
- **Conflicts.** For each field, the newest edit wins.
  - Every upload batch carries the device ID, and every write carries `updated_at`. Together they are the edit's version, and the device ID breaks ties when two timestamps match.
  - A server-only `sync_state` table stores which version last set each field, so the result is the same whatever order uploads arrive in.
  - Deleting a record leaves a marker in `sync_state`. A retried upload from another device can then never bring a deleted record back.
  - Habit check-offs follow the same rules. Unchecking a habit deletes its entry.
- **Hosting.** Use PowerSync Cloud while this is a personal app. Self-hosting is the escape hatch if cost or the 1s interval becomes a problem.
- **Caveats:**
  - The Convex connector is **experimental**, and its API may change. Pin versions and keep the connector code in one package (`packages/sync`).
  - Never delete a table from the Convex dashboard, because clients would keep the old rows. Use "Clear Table" or delete through mutations.
  - Convex's 64-bit integers and binary values arrive as text, so store times as ISO strings or ordinary numbers.
- **Check in M0.** Before building on it, confirm that PowerSync's web library stores its data permanently inside Electron's window, then show an offline edit surviving a restart on both Mac and iOS.

**The scheduler runs on the device** because it needs that device's busy times. It commits placements in a single Convex mutation guarded by a plan version. Convex crons handle the day rollover, creating the next instance of recurring tasks, and habit periods. Reminders and alarms are local notifications.

## 4. Domain model (core)

```
Area ─┬─ Project ─┬─ Heading
      │           └─ Task ──< TimeBlock >── (optional) mirrored external event
      └─ Task                │
Tag >──< Task                └─ ChecklistItem

Habit ─ HabitSchedule (fixed RRULE | quota "3x/week" | interval "every N days")
  ├──< HabitEntry   (completion log: date, value, source; unchecking deletes)
  ├──< HabitPause
  └──< TimeBlock    (optional, placed by the scheduler)

Calendar (device, via EventKit / expo-calendar) ──< Event   (read live, never stored in Convex)
CalendarLink: TimeBlock ↔ exported device event (opt-in per account)
TimeMap (named working windows with green/yellow/red preference tiers)
SchedulerRun ──< Placement (with reason trace), Risk, Unplaced
```

Key decisions (details are in the research docs):
- **Every record has a `uuid` generated on the device, plus `created_at`/`updated_at`.** Columns are snake_case to match SQLite. All writes go to the PowerSync tables, and only the upload connector calls Convex (`sync:upload`). The newest `updated_at` wins. A deletion wins over an edit made offline to the same record.
- **Task dates follow Things: a start date ("When") and a separate deadline.** A start date is never overdue; only deadlines turn red. Tasks also have `estimateMin`, `priority` (P1–P4), `minChunkMin`, `energy`, `timeMapId`, and `autoSchedule: bool`.
- **TimeBlock is its own record, and one task can have many** (splitting). Remaining time = estimate − sum of done and future blocks. Blocks stay in the app by default. Writing them to a real calendar as "busy" is opt-in per account (decided).
- **Recurring tasks** store an RRULE plus a mode (fixed schedule or after completion). Only the next instance exists at any time.
- **Habits are separate from tasks.** Score, streaks, and the total count are all computed from the entry log and never stored as the source of truth.

## 5. Features by pillar

### 5.1 Calendar (copying Notion Calendar)

| Key                | Action                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| `1`–`9`            | Show N days (`1`/`D` = day)                                                  |
| `0` / `W`          | Week                                                                         |
| `M`                | Month                                                                        |
| `⌘K` → "14"        | Show any count from 1 to 31 days                                             |
| `←` `→`            | Move by the visible span. Hold to repeat.                                    |
| `J` `K`            | Next / previous week                                                         |
| `T`                | Today (setting: jump there, or left-align it)                                |
| `.`                | Go to a date typed in plain English ("3 months from now")                    |
| `C` / drag on grid | New event or task (chooser), with natural-language input                     |
| `Z`                | Overlay another time zone                                                    |
| `?` / `F`          | Searchable shortcut list / on-screen labels for every shortcut (from Vimcal) |
| `⌘Z`               | Undo anything                                                                |
- Drag behavior: drag on the grid to create, drag across days for multi-day, resize from either edge, `⌥`-drag to duplicate, `⇧` turns off 15-min snapping, `⇧`-drag to box-select, and hold `⌘` to skip the confirm step.
- The visible day count persists between launches. After a big jump, the target day flashes.
- Calendar sets (`⌃1–9`) switch which calendars are visible. `⌥`-click a calendar to show only that one.
- Menu bar: next event with a countdown and join button, today's habits, quick add.
- Week-level time zone columns, merging duplicate events across accounts, and reliable local alarms.

### 5.2 Tasks (copying Things 3, plus durations)

- Smart lists: Inbox, Today (with This Evening), Upcoming, Anytime, Someday, Logbook. Each is a filter over the date fields.
- Areas → Projects → Headings, plus tags, checklists, and notes.
- Quick Entry has a global hotkey and parses inline tokens: `tomorrow`, `!deadline fri`, `#tag`, `/project`, `~45m`, `p1`. A live preview highlights what was parsed.
- Repeating tasks can be fixed-schedule or after-completion. You can complete early, and change one instance or the whole rule.
- Keyboard parity with Things (`⌘N`, `⌘T` today, `⌘E` evening, `⌘O` someday, `⌘K` complete, and the rest).

### 5.3 Time-blocking (the core interaction)

Following the Sunsama/Akiflow model:

- **Drag a task from the sidebar onto the grid** to create a linked block. Its length is the remaining estimate, or 30 min if there's no estimate. Drag the same task again to add more blocks. The sidebar shows "1h30 of 3h scheduled".
- **Drag a block back to the sidebar**, or press Delete, to remove it. The task stays.
- **Checking a block's checkbox** completes the task. "Done for this session" marks only that block done and leaves the task open.
- **Past unfinished blocks** stay in place, shown hatched. The task goes back to "needs time" with a rollover count. `P` (Replan) offers the next free slot. Nothing moves on its own.
- `X` schedules the selected task into the next free slot. Arrow keys nudge a selected block by 15 min, and `⇧`+arrow resizes it.
- **Workload bar per day:** estimates for the day vs free time within working hours.
- Visual difference: events are solid. Task blocks are lighter with a checkbox and a stripe in the project color. Done blocks are struck through.

### 5.4 Habits

- Three schedule types:
  - fixed ("Mon/Wed/Fri")
  - quota ("3x per week")
  - interval ("every 3 days after last done")
- Two kinds of habit: done/not-done, and measured (count or minutes, with a target).
- Four ways to show a habit, chosen per habit:
  - List only.
  - **Day strip (default):** chips under each day header showing check rings and quota progress.
  - A fixed time block.
  - A flexible block that the scheduler places.
- Check off from anywhere: the menu bar (one click, +1, start/stop timer), a calendar block's context menu ("Done / Done, 20 min / Skip"), or a widget. You can log up to 7 days back. The day starts at 04:00 by default.
- The main number is Loop's habit strength: `score = prev·m + c·(1−m)`, `m = 0.5^(√f/13)`. Streaks are counted per habit period and allow one grace miss ("never miss twice"). The all-time total never resets.
- Links to tasks:
  - A habit can create a task each time it's due (e.g. a weekly review with a checklist).
  - Completed tasks that match a filter can count toward a habit (e.g. `#writing` → "write 5x/week").
  - Habits can be stacked, either after another habit or after a recurring event.
- Views: a year heatmap per habit, a grid of all habits × days for the weekly review, and a weekday × hour histogram (this also helps the scheduler).
- Pause and vacation days don't count against score or streaks. A habit the scheduler couldn't fit counts as neutral, not as a miss.

### 5.5 Auto-scheduler (deterministic)

Signature: `plan(inputs, previousPlan, now) → { placements, unplaced, risks, reasons }`.

**v1 engine:** greedy placement with slot scoring.
1. Build free time per time map with preference tiers. Subtract events, pinned blocks, buffers, and the frozen window (anything starting in the next 60–120 min).
2. Place fixed items first: P1 habits, then work with hard deadlines.
3. Order the remaining work by slack (free capacity in the task's own windows before its deadline, minus remaining work), then priority, then a stable id.
4. For each piece of work, score every candidate slot and take the cheapest:
   `lateness + tier + distance from ideal time + energy mismatch + fragmentation + day imbalance + moved-from-last-plan penalty`.
   Repeat until the task's remaining time fits nowhere at or above its minimum chunk size.
5. A repair pass swaps lower-priority items to fit anything that failed. Whatever is still left goes to "Couldn't fit" with a reason.
6. **At-risk warnings** use the classic earliest-deadline-first capacity check: for each deadline, compare the work due by then with the free time before it. For example: "Thursday: 7h of work, 4h free".

**Keeping the plan stable (Motion's biggest failure):**
- Nothing in the frozen window moves.
- A block moves only if the improvement is above a threshold.
- A new event re-places only the blocks it overlaps.
- The same inputs always give the same plan.
- Sync bursts are debounced.

**User control:**
- Small fixes to today's plan apply automatically with an Undo toast.
- "Plan my day" and "Plan my week" show ghost blocks and a diff ("3 moved, 1 added, 1 can't fit"). Accept everything, accept per item, or discard.
- Dragging a block pins it, and a lock icon shows it's pinned.
- Each block can answer "Why is this here?", e.g. "earliest green slot after start date; due Thu 17:00; 3h40 slack".
- A change log lists every move with its cause, and each run can be undone.
- Hard limits it never crosses without asking: outside working hours, weekends, pinned items, external events.

**Later, light ML:**
- v1.5: adjust estimates per tag from actual vs estimated time (a shrunk log-ratio mean). Learn preferred hours from completions and drags, and suggest them as settings rather than applying them silently.
- v2: a seeded local-search pass behind an "Optimize week" button. Add CP-SAT only if dependencies or multi-person scheduling become central.

## 6. Design system and review loop

Robin Ebers said T3 Code was let down by "the fonts, the border radius, the icons, the font hierarchy". T3 Code fixed that with shared design values and repeated scored review rounds. We set the values up before building any screen. Details are in research/07 §7 and research/06 §4.

**Design values (`packages/theme`):**
- **Font:** the system font (SF Pro) on both platforms, with no font files to bundle. Every time, date and count uses fixed-width (tabular) digits.
- **Type scale:** six sizes. Mac is 11/12/13/15/20/26 px; iPad is 12/13/15/17/22/28 pt. Weights are 400/500/600, and 700 is only for the date header. Nothing goes below 11.
- **Spacing:** a 4px grid. Controls are 24/28/32 tall on Mac and 32/44/50 on iPad. An hour is 48px tall, so a 15-minute snap is 12px.
- **Radius:** 3/4/6/10/14 plus full. A nested element's radius is its parent's minus the padding between them.
- **Color:**
  - Defined in OKLCH and compiled to solid hex.
  - Warm neutrals with almost no color for the chrome. Saturated color is for calendar data only.
  - One blue accent, and red only for "now".
  - Secondary text is a solid mixed color, never opacity.
- **Event chips:** a pale fill with a 3px saturated bar on the left and darker text in the same hue. Every color is worked out from one hue per calendar, and contrast is checked: about 9.5:1 for titles and 6:1 for times.
- **Icons:** Lucide at 12/14/16/20 with a 1.5 stroke. On iPad, SF Symbols are used for native chrome only.
- **Motion:** keyboard navigation, selection and view switches are never animated. Popovers open in 150ms ease-out. Every animation can be interrupted and respects Reduce Motion.
- **Fitting the platform:** on Mac, inset traffic lights, native context menus, no pointer cursor, and Settings in its own window. On iPad, split view, sheets, pointer effects and 44pt touch targets.
- **Lint:** made-up values outside the design scale fail the build.

**Review loop (from T3 Code's `council` process):**
1. Seeded fixture data and a frozen clock (Wednesday, 10:40) so every round looks at the same screens.
2. The list of scenes is data: week, day and month views in light and dark, the event editor, Quick Entry, Today, a drag in progress, the "plan my day" diff, the habit strip, the `⌘K` palette, settings, empty states, and a narrow window.
3. Screenshots are captured automatically: Playwright for Electron, `simctl` for iOS.
4. Reviewers from different model providers score each screen out of 10 against a 10-category rubric that includes "calendar legibility". They score blind and compare against Notion Calendar, Things 3, Linear and Capy captured in the same round. Each returns MUST and SHOULD fixes with file:line.
5. We fix, then run another round. A round counts as done when every category is at least 9. Scores drift upward between rounds, so we only compare against references scored in that same round.

Each milestone that changes UI ends with a review round.

## 7. Milestones

Each milestone produces something usable.

| #     | Milestone               | Done when                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0    | **Foundation**          | bun monorepo, Convex schema and auth, PowerSync Cloud connected to Convex, the `sync` package (schema, upload connector, an offline edit that survives a restart), `app-core`, design values in `packages/theme`, a keyboard-shortcut system and the `⌘K` palette framework, undo stack. The Electron shell starts `calkit` and lists the Mac's calendars. Fixture data and screenshot capture work. Lint, format and typecheck pass. |
| M1    | **Calendar grid (Mac)** | N-day/week/month views, every navigation key, drag to create, move and resize, all-day dates that don't shift with time zones. It feels as fast as Notion Calendar. First review round.                                                                                                                                                                                                                                               |
| M2    | **Mac calendars**       | Read and write every macOS calendar through `calkit`, and refresh on change. Calendar list, colors, show-only-one. Menu bar next event.                                                                                                                                                                                                                                                                                               |
| M3    | **Tasks**               | Things-style data model in Convex, sidebar, smart lists, Quick Entry with natural language and a global hotkey, repeating tasks.                                                                                                                                                                                                                                                                                                      |
| M4    | **Time-blocking**       | Drag tasks onto and off the grid, multiple blocks per task, completion rules, Replan, `X`, workload bar. **The first version you can use every day.**                                                                                                                                                                                                                                                                                 |
| M4.5  | **iPhone and iPad**     | The Expo app reuses every package. A touch grid (1–3 days on iPhone, up to a week on iPad), Today, tasks, Quick Entry, hardware-keyboard shortcuts, device calendars through `expo-calendar`.                                                                                                                                                                                                                                         |
| M5    | **Habits**              | Habit model, day strip, check-off from the menu bar and widget, score and streaks, heatmap and grid views.                                                                                                                                                                                                                                                                                                                            |
| M6    | **Auto-scheduler v1**   | Time maps, the greedy engine with reasons, preview and diff, pins, at-risk bar, "Couldn't fit" tray, flexible habit blocks. Snapshot test suite.                                                                                                                                                                                                                                                                                      |
| M7    | **Polish and reach**    | Direct Google API (invites, Meet links, colors), availability as text (`S`), calendar sets, ICS subscriptions, over-the-air updates.                                                                                                                                                                                                                                                                                                  |
| Later |                         | Better duration estimates from history, local search in the scheduler, Outlook through Graph, Apple Health auto-completion from the iPhone.                                                                                                                                                                                                                                                                                           |

## 8. Not in v1

- Collaboration, shared projects, team scheduling
- Booking pages (Calendly-style). Availability as copyable text covers the personal case.
- Notion and other integrations
- Gamification beyond streaks and score
- Any LLM features

## 9. Decisions log

- 2026-10-28: Electron on Mac, Expo on iPhone and iPad, Convex for sync, TypeScript, Tailwind and bun. Tauri dropped.
- 2026-10-28: Time blocks write to real calendars only when opted in per account.
- 2026-10-28: Personal use for now, so Google OAuth verification is skipped. On the Mac, EventKit already covers Google accounts.
- 2026-10-28: Offline edits must never be lost. Use PowerSync (Cloud) on top of Convex rather than building our own sync layer (§3.1). Its Convex connector is experimental, so all connector code stays in `packages/sync`.
- 2026-10-28: Auth moves to Convex Auth, the setup PowerSync's demo uses.
- 2026-10-28: Using Convex Pro (already paid), which Convex says streaming export needs, and PowerSync Cloud on the Free plan (50 devices online at once). If this becomes a product, move to PowerSync Pro or self-host.
- 2026-10-28: Speech input ("MIF 2") dropped. Not needed.

## 10. Open questions

None blocking. M0 needs two accounts from you: Convex (log in and create a project) and PowerSync Cloud (create an instance and give it the Convex deploy key).
