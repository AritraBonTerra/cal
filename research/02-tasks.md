# 02: Task management research

Scope: task management for a personal calendar + tasks + habits app (Mac first). Main feature: drag tasks from a sidebar onto the calendar to time-block them.

Researched 2026-10-28. Sources are listed at the end. Freshness notes:
- Things and Todoist facts come from current official docs and 2026 release posts.
- Many TickTick help pages render client-side and could not be fetched. TickTick details come from search excerpts of its help center, blog posts (several from 2020-2021), and third-party API docs. Treat TickTick menu paths and free/premium splits as possibly stale.
- Prices move often. Dated prices are noted inline.

---

## 1. Things 3 (Cultured Code)

Current versions as of Oct 2026: Mac 3.24.1, iPhone/iPad 3.25.x. Recent releases:
- **3.23 (Aug 2026)** reworked repeating to-dos.
- **3.24 (Sep 2026)** added iOS 27 Siri AI, Spotlight, snooze options (15m/1h/3h/tomorrow) and an XL widget.
- **3.25 (Oct 2026)** added an iPhone Duo adaptive layout and full keyboard support on iPhone.

Apple platforms only. One-time purchase per platform.

### Data model
- **Containers.** Areas hold projects and loose to-dos. Projects hold to-dos, optionally grouped under Headings. That is the whole hierarchy:
  - Areas don't nest. Projects don't nest.
  - Headings exist only inside projects.
  - The only level below a to-do is a checklist.
- **To-do fields:**
  - title, notes (Markdown)
  - checklist: flat items with title and done state only. No dates or notes per item.
  - tags: hierarchical, each with an optional keyboard shortcut
  - When (start date, optionally "This Evening")
  - Deadline
  - reminder: a time attached to When. Reminders cannot attach to deadlines.
  - repeat rule
  - There are no priorities, no attachments, and no durations.
- **When vs Deadline.** This is the core idea.
  - When = the day you intend to start. It is never overdue. It stays in Today until you finish or reschedule it.
  - Deadline = the day it's due. An overdue deadline shows red, and Today shows a red badge count.
  - A Someday item that gets a deadline flips to Today on that date.
  - OmniFocus maps the same way: When ≈ Defer/Start, Deadline ≈ Due.
- **Built-in lists.** Each one is a filter over the same data.
  - **Inbox:** to-dos with no list and no date.
  - **Today:** any to-do whose start date, deadline, or repeat rule matches today. Ordered manually by drag. Can group by project/area (a synced setting). Calendar events sit grouped at the top.
  - **This Evening:** a section at the bottom of Today, "still present, so you know there's more to do, but unobtrusive."
  - **Upcoming:** to-dos with a future start date. The next 7 days get separate headers, starting tomorrow. Dragging an item onto a day changes its start date. Projects with a future start date go into "hibernation" and drop out of the sidebar until that date.
  - **Anytime:** all active to-dos. Deadline-only to-dos stay here because they are active. Today items show a yellow star. Loose to-dos come first, then everything else grouped by parent.
  - **Someday:** excluded from Anytime and Upcoming. Visually de-emphasized. Inactive Someday projects are hidden from the sidebar.
  - **Logbook:** completed and canceled items. Shift-Cmd-Y moves completed items there.
  - **Hidden lists** reachable via Quick Find or the URL scheme: `tomorrow`, `deadlines`, `repeating`, `all-projects`, `logged-projects`.
- **Repeating (3.23)**
  - Two rule types: fixed schedule, or after completion.
  - Things keeps a template and spawns the next copy. Copies get a small grey repeat icon.
  - You can now complete a copy early with a normal checkbox, which schedules the next copy per the rule.
  - You can drag a copy to another date. For fixed rules, Things asks: "Make Exception" moves one instance, "Update Rule" changes the pattern (Monday → Tuesday from now on). After-completion rules just move, with no prompt.
  - "Create Next Copy" lets you start a future instance early.
  - You can pause, resume, or stop many rules at once.
  - Before 3.23, a repeating to-do could not be checked off until it reached Today. The press framed the fix as "only took nine years".

### Capture, natural language, input
- **Quick Entry.** Ctrl-Space, global and rebindable.
  - Fields: title, notes, tags, When, list and heading.
  - All main-app shortcuts work inside it.
  - Esc discards. In the main app, Esc saves.
  - Cmd-Return saves and closes.
- **Quick Entry with Autofill.** Ctrl-Opt-Space, off by default, needs a helper app. It captures the current Safari page, the selected Mail message, or the selected Finder file as a link in the notes.
- **Natural language lives only in the When and Deadline pickers. It never parses the title.**
  - Examples: `tod`, `10-3 9`, `2p`, `17d`, `jul9 + 17d`, `3rd wed jul`, `last fri jul`, `tues 8am`.
  - Abbreviations are tolerated ("be lazy").
  - Works in 8 languages.
  - The docs say nothing about extracting tags or projects from the title.
- **Magic Plus button (iOS).**
  - Tap = new to-do.
  - Drag it to a position in a list, to a day in Upcoming, or under a heading = insert there.
  - Drag it to the left edge inside a project = new heading.
  - Drag it to the Inbox target = add to Inbox.
  - The Mac equivalent is keyboard-driven: Space adds a new to-do below the selection.
- **Type Travel (Mac).** Start typing anywhere and Quick Find opens. It matches lists, projects, to-dos, and tags "in milliseconds".
- **Paste a bulleted list** and it becomes a checklist.

### Mac keyboard shortcuts (official list)
| Action | Keys |
|---|---|
| New to-do / new below selection | Cmd-N / Space |
| New project / new heading | Opt-Cmd-N / Shift-Cmd-N |
| Complete / cancel | Cmd-K / Opt-Cmd-K |
| Duplicate | Cmd-D |
| Move to list | Shift-Cmd-M |
| When picker | Cmd-S |
| Today / This Evening / Anytime / Someday | Cmd-T / Cmd-E / Cmd-R / Cmd-O |
| Deadline | Shift-Cmd-D |
| Inbox, Today, Upcoming, Anytime, Someday, Logbook | Cmd-1 through Cmd-6 |
| Edit tags | Shift-Cmd-T |
| Toggle a specific tag / filter by a tag | Ctrl + tag shortcut / Ctrl-Opt + tag shortcut |
| Toggle sidebar | Cmd-/ |
| Move completed to Logbook | Shift-Cmd-Y |

### Calendar integration
- Read-only.
- Reads Apple Calendar only. Google and Outlook calendars must first be added to Calendar.app.
- Display is local, so you enable it per device.
- Events show at the top of Today and under each day in Upcoming. Multi-day events appear as all-day items on each day (since 3.5). Declined events are hidden.
- On iOS, tapping an event block opens Calendar.app.
- You cannot create, move, or resize events. Things has no time-of-day for to-dos except the reminder.

### Design philosophy
- "Design is not an afterthought... it's a way of building apps."
- Opening a to-do turns it into a white card ("a clear white piece of paper"). Secondary fields (tags, checklist, dates) stay hidden in a corner until used.
- Every action is animated using an in-house animation toolkit. The core layers are shared between Mac and iOS. Since 3.23, the to-do display and editing code is shared as well.
- Multi-select on iOS: swipe along the circles to select a range. Long-press and the items "gather under your finger".
- Reviewers often credit the white space and the care over "every pixel".

### Known weaknesses
- No time-blocking, durations, or time-of-day scheduling. The calendar is a read-only strip.
- No collaboration or shared lists. A TechRadar writer said his wife couldn't add tasks for him.
- No web, Android, or Windows apps.
- No file attachments. Links in notes only.
- No priorities.
- No location reminders.
- Checklist items can't have dates, notes, or assignees.
- Slow feature cadence. The repeat overhaul took 9 years. A TechRadar piece was titled roughly "A lack of updates has me looking elsewhere", and AlternativeTo users cite a "lack of innovation".
- Natural language works only in date fields. You can't type "call mom tomorrow #family" in the title.

---

## 2. TickTick

Cross-platform: iOS, Android, Mac, Windows, web, watch. Freemium. Premium was $35.99/yr for years. The 2026 App Store and web listings show $4.99/mo or $49.99/yr. There's no lifetime option and no family plan.

Releases this year:
- **8.0 (Jan 2026):** Yearly view with a completion heatmap, a "Modern" calendar style, pinch-zoom on the month grid.
- **8.x (~Apr 2026):** AI voice add that splits several tasks, plus an MCP server.
- **Oct 2026:** AI Assistant and iOS 27 Siri support.

### Data model (from the Open API)
- Task fields:
  - `title`, `content`/`desc`
  - `projectId`, which is the list
  - `startDate`, `dueDate`, `isAllDay`, `timeZone`
  - `repeatFlag`: an RRULE string, e.g. `RRULE:FREQ=DAILY;INTERVAL=1`
  - `repeatFrom`: 0 = due date, 1 = completion date, 2 = calendar/skip missed
  - `reminders`: iCalendar TRIGGER strings like `TRIGGER:PT0S`
  - `priority`: 0 none, 1 low, 3 medium, 5 high
  - `tags`, `status`, `completedTime`, `sortOrder`
  - `items[]`: a checklist where each item can carry its own `startDate`
  - `kind`: TEXT or CHECKLIST
- **A task with startDate ≠ dueDate is a time span.** The task is the time block. There's no separate block entity, so one task gets at most one block.
- Hierarchy: Folders hold Lists hold Tasks. Lists can be grouped into sections. Subtasks nest under tasks. Tags nest.
- Smart lists: Today, Tomorrow, Next 7 Days, All, Inbox, Assigned to me, Completed, Trash, Summary. You can show or hide each.
- Time zone mode:
  - Fixed: the time shifts with your zone.
  - Floating: the time stays the same local time wherever you are.

### Natural language
- Smart Recognition parses dates, times, and recurrences in the title, e.g. "gym every Tuesday and Thursday" or "meeting tomorrow at 3 p.m.". It also sets a reminder.
- Parsed tokens are highlighted blue. Tap one to revert it to plain text.
- A setting removes the parsed text from the title.
- Symbols: `#tag`, `!priority`, `~list` (older guides say `^list`), `@user` in shared lists.
- 2026 reviews say date phrasing has to be more exact than in Todoist.

### Calendar and drag-to-schedule
- Views: Day, 3-Day (mobile), Week, Month, Multi-Day, Multi-Week, Agenda, Year (8.0). Also Kanban and Timeline (a Gantt-lite where dragging sets dates and durations).
- **Arrange Tasks panel.** Undated tasks sorted by List, Tag, or Priority. Drag one onto a time slot. You can also drag from the all-day bar into a time. Habits cannot be dragged.
- **Desktop 6.0 (mid-2024): "Show Tasks with Calendar".** Right-click the tasks tab and the task list docks next to the calendar. You can drag in both directions. Dragging a task back to the list unschedules it.
- Resize by dragging an edge. Older docs give a 30-minute minimum. Clicking an empty slot creates a task.
- Default hidden hours are 0-7 and 21-24. You drag to change them.
- Colors come from list (default), tag, or priority.
- View options toggle: completed tasks, checklist items, future recurrences.
- External calendars: subscribe to Google, iCloud, Outlook, or CalDAV to show events.
- **Two-way Google Calendar integration.** Timed tasks in chosen lists become Google events, and new Google events become TickTick tasks.
  - Users report deletions propagate both ways.
  - Users report recurring events get mangled.
  - This is the danger of treating tasks and events as one object.
- Calendar views were Premium-only as of the older sources. 2026 reviews call "calendar is shown in onboarding, then paywalled" the top 1-star complaint.

### Other modules
- **Eisenhower Matrix.** Quadrants default to priority. Each quadrant's rule can be edited with List, Tag, Date, Priority, or Task conditions. It's a saved filter laid out 2×2.
- **Filters.** Normal mode is a form. Advanced mode adds AND/OR across lists, dates, priorities, tags, and keywords, with a Preview. Built in a UI, not as a typed query. Custom smart lists are Premium.
- **Pomodoro/Focus.** Default 25 minutes. Long-press the timer to change the length.
  - Per task you set either Estimated Pomos or an Estimated Duration, not both.
  - Actual focused time shows next to the estimate after a session.
  - Focus stats feed the Statistics view.
- **Habits.** A separate entity from tasks, with its own tab.
  - Gallery of 60+ templates.
  - Frequency: daily, specific weekdays, or N times per week.
  - Goal: once, or "reach a certain amount" with a unit, e.g. 2 pages.
  - Check-in modes: Auto (+1 per tap), Manual (enter an amount), Complete all.
  - Sections: morning, afternoon, night.
  - Streak, total days, check-in rate.
  - You can backfill missed days from the month view.
  - Duration: 7 days, 30 days, or forever.
- **Countdown (May 2025).** Types: Holiday, Birthday (with "ignore year"), Anniversary, Countdown. Shows days until or days since. Has a widget. The free tier allows 5. Separate from the older per-task "Countdown Mode", which toggles a due date to "N days left".
- **Other:** "Plan your day" walks you through overdue and today items one at a time. Progress percent on a task. Task links. A daily summary notification. Constant (nagging) reminders. Location reminders (iOS).

### Known weaknesses
- Cluttered. Mark Ellis: TickTick "tries to cram too much text and rather old-fashioned icons into its narrow layout", while in Things "the purpose of every pixel has been carefully considered". Some Capterra users disagree. It depends on what you compare it to.
- Every module (habits, pomo, matrix, countdown) is a toggle in Settings > Features. The breadth creates settings sprawl.
- Premium gating of calendar and smart lists. A 2026 price increase.
- Sync lag: 30-90 s between devices per reviews. Google Calendar sync lags minutes and sometimes fails silently.
- The task-is-the-event model means no splitting a task across blocks, and the two-way Google sync is destructive.
- Support response complaints about billing.

---

## 3. Others: ideas and complaints

### Todoist
- **Quick Add syntax.**
  - `#Project` (can create a new project), `/Section`, `%label`
  - `@label` still works but is being retired by end of 2026
  - `p1`-`p3`, `{deadline}`, `!reminder` (e.g. `!30 min before`), `+assignee`
  - Dates in natural language: "every other Tuesday starting March 3"
  - Duration: "for 45m"
  - Click a highlighted token to un-parse it.
  - Quick Add can turn pasted text, images, or documents into several tasks.
- **Date vs deadline** are now separate fields, like Things. In filters, `due` checks the date first, then the deadline.
- **Filter query language.** The best typed-query design among these apps.
  - Operators: `&`, `|`, `!`, `()`, and `,` (several result lists in one view). `\` escapes, `*` is a wildcard.
  - Dates: `date before: sat`, `deadline before: today`, `5 days`, `-3 days`, `+4 hours`, `no date`, `no time`, `overdue`, `recurring`.
  - Projects: `##Work` includes sub-projects, `/Meetings` matches a section in any project.
  - Other: `created after: -30 days`, `subtask`, `search: keyword`.
  - Examples: `(today | overdue) & #Work`, `overdue & !no time, date: today & !no time`.
  - "Filter Assist" turns English or Spanish into a query.
- **Filter gotchas:**
  - Renaming a project breaks filters that use the old name. Store IDs, not names.
  - Results don't update live while the filter is open.
  - Completed tasks never appear in filters.
- **Duration and calendar.**
  - Duration is a first-class field, up to 24 h max.
  - In the calendar layout, dragging a task from all-day to a time slot defaults to 30 min. Drag the bottom edge to resize. Clicking a slot opens Quick Add with 30 min.
  - The "Plan" sidebar in Today and Upcoming lists overdue, all-day, and unscheduled-with-deadline-within-7-days tasks to drag in.
  - Calendar layout is Pro/Business only.
- **Recurrence.** "every 3 days" is fixed. "every! 3 days" counts from completion.

### OmniFocus
- **Three dates (planned dates added in 4.7):**
  - Defer = unavailable until this date. Hides the item from "available" perspectives, and children inherit it.
  - Due = must finish by. Drives "Due Soon" and "Overdue" status, and children inherit it.
  - Planned = when you intend to work on it. Doesn't change status. Shows in Forecast and can notify. Unfinished planned items pile up in Forecast's "Past" section. Children don't inherit it. A child's planned date may fall before or after its parent's.
  - Rule of thumb: defer if it can't be done before Friday, plan if it could be done now but you'll do it Friday. The "planned" layer maps directly onto time blocks.
- **Project types.** Sequential (only the first action is available) vs parallel (the default). Single-action lists.
- **Review.** Each project has "Review Every N days/weeks/months" and a Next Review date. The Review perspective lists due projects. Marking reviewed sets next = now + interval. The default is weekly.
- **Custom perspectives (Pro).** Saved rule-based views: folder, flagged, due within, availability, tags. Users build their whole system on them.
- **Complaints:** steep learning curve, Pro upsell, dense UI. Learn OmniFocus itself says "use due dates sparingly", which shows how easily people misuse dates.

### Sunsama
- **Daily planning ritual.**
  - Morning: review yesterday's leftovers, pull tasks from integrations into today, estimate time, check against your workload limit. Example: you set 6 h, plan 9 h, and get warned.
  - End of day: a shutdown ritual at a time you pick. It reviews what got done, decides what moves, and reflects.
  - Weekly review on Fridays.
- **Timeboxing.**
  - Drag a task onto the calendar, or hover and press `X` to auto-schedule into the next free slot.
  - This creates a real event on Google, Outlook, iCloud, or CalDAV. You set the target calendar per channel or as a default.
  - Since ~2026 there's also a private internal Sunsama calendar, so task blocks don't "pollute your regular Google/Outlook/Apple calendar". The docs contradict themselves on this, which suggests the change is recent.
- **Splitting.** Drag the same task onto the calendar more than once, or use the working-sessions pop-out.
- **Completion.** `C` completes a task, including when hovering its calendar block.
  - Optional "auto-reschedule when completed ahead of schedule" trims the block's end and pulls later blocks earlier.
  - Completed blocks can reflect actual time instead of planned.
- **Planned time vs actual time** per task, with a timer.
- **Rollover.**
  - Incomplete tasks move to the next day at midnight. Imported meetings roll too unless auto-complete is on.
  - Unedited recurring instances that roll onto a day with their next instance are dropped, to avoid duplicates.
  - The task shows a counter of consecutive rollovers.
  - After N consecutive rollovers (configurable), tasks auto-move to an Archive. Its purpose is clearing out tasks you "simply aren't doing."
  - The docs don't say what happens to a rolled task's old calendar event.
- **Complaints:**
  - $17/mo annual, $22/mo monthly (2026). No free tier, 14-day trial. Typical: "At $20 a month, it's the most expensive subscription I have."
  - Weak mobile app. No offline mode.

### Akiflow
- **Universal inbox** pulling from Gmail, Slack, Notion, Todoist, Asana, and others.
- **Fast keyboard planning.** `P` = plan a task (type a date, slot, or project).
- **Time Slots.** Calendar containers that hold several tasks.
  - The slot's color comes from its project. Tasks dropped in inherit the project.
  - A count badge on the slot drops as tasks are completed. There's a progress bar at the bottom, and hovering shows done/pending and total planned duration.
  - Focus mode for a slot (Sep 2026).
  - Slots can recur, and a recurring task can "copy the slot recurrence".
  - Moving a slot moves its tasks.
- **Lock.** A locked task or slot writes one busy event to Google, Outlook, or iCloud. Tasks inside a locked slot are auto-unlocked to avoid duplicate events, so a 2 h task in a 1 h slot produces a single 1 h event. Lock is off by default.
- **Unfinished work never moves silently.**
  - "Replan Undone Tasks" (Magic Button or `P`) suggests the next slot in the same series or project, and you confirm.
  - When the assistant moves a slot that has a mix of done and undone tasks, it leaves the done tasks in the original slot and creates a new slot for the undone ones.
  - Akiflow markets this as keeping you in control, unlike autonomous schedulers.
- **Multi-session tasks.** The task stays one item across sessions. For clean stats, the docs suggest duplicating it, marking the original done, and planning the copy. That workaround shows the model lacks per-session records.
- **Complaints:** $34/mo monthly or $19/mo annual. 7-day trial, no free tier. Billing complaints.

### Structured
- A single vertical timeline per day. Block height is proportional to duration, and a "now" marker moves down the day.
- Inbox for unscheduled items. All-day row. Icons and colors per task.
- **Energy Monitor:** tag tasks with an energy cost and see whether the day is overloaded.
- **Replan:** moves unfinished items forward. Pro only.
- Pro also adds calendar and Reminders import, and recurring tasks.
- Pricing (US, Sep 2026): $29.99/yr or $99.99 lifetime. Popular with ADHD users because the day is visual and linear.

### Amie
- An opinionated calendar with a todo sidebar. Unscheduled todos sit on the left and you drag them onto the calendar.
- You can also attach todos to existing events.
- Todos have date, deadline, duration, recurrence, labels, priority.
- AI auto-scheduling into free slots.
- Pulls tasks from Todoist, Things 3, and Notion. Two-way Outlook sync since Aug 2026.
- Polished, playful design.

### Reclaim (auto-scheduling reference)
- A task has a total duration (15-minute steps), a min/max session length, "schedule after", and a due date.
- If the duration exceeds the max session, Reclaim splits the task across free time before the due date and spaces sessions out.
- When nothing fits, it schedules past the deadline. "Up Next" forces ASAP.
- Useful as a reference for what auto-scheduling needs: duration, chunk bounds, window.

### Apple Reminders
- Since iOS 18 / macOS Sequoia, scheduled reminders appear in Calendar.app with a checkbox. You can create a reminder from a time slot.
- Every reminder renders as a fixed 30-minute item. Users ask for durations, and there is none.
- iOS 26.x added Apple Intelligence suggested reminders (from mail and messages), per-reminder time zones, Urgent reminders with alarms (26.2), and an Urgent smart list (26.4).
- Reminders already has sections, columns, tags, smart lists, subtasks, and grocery auto-sorting.
- **Takeaway:** Apple ships "tasks in calendar" for free. A paid app has to beat it on duration, splitting, planning flow, and polish.

---

## Patterns worth stealing (ranked)

1. **Three date layers.** Things' When/Deadline split, plus a time-block layer like OmniFocus "planned".
   - Start date (when it becomes relevant) and deadline (when it's due) are task fields.
   - Time blocks (when I'll work on it) are separate records that point to the task.
   - Never collapse these. TickTick's task-equals-event model can't split work, and it breaks two-way sync.
2. **Task sidebar beside the calendar, drag both ways.** Seen in TickTick desktop 6.0, Sunsama, Akiflow, Todoist Plan, and Amie.
   - The sidebar lists unscheduled items for the visible day: today's tasks without blocks, overdue items, deadlines within 7 days, and the Inbox.
   - Dragging a block back onto the sidebar unschedules it.
3. **Global Quick Entry with context capture.** Things' Ctrl-Space, plus Autofill grabbing the Safari URL, Mail message, or Finder file. Esc discards, Cmd-Return saves.
4. **Inline natural-language tokens with click-to-revert.** Todoist and TickTick.
   - Parse in the title: date, time, duration "for 45m", `#project`, `@tag`, `!priority`, `{deadline}`.
   - Highlight each parsed token. Click a token to keep it as literal text.
   - Things restricts parsing to the date pickers. That's safe but slower.
5. **Today = events on top + tasks + "This Evening" section** (Things). The calendar and the list show the same day, so keep the list view for people who don't time-block.
6. **Type Travel.** Type anywhere to jump to a list, project, tag, or task. Plus a full shortcut set modeled on Things: Cmd-1..6 lists, Cmd-T/E/R/O buckets, Cmd-S when, Shift-Cmd-D deadline, Space for a new item below the selection.
7. **Repeat semantics from Things 3.23.**
   - Fixed schedule vs after completion.
   - Complete early.
   - Moving one instance asks "this one" or "change the rule".
   - "Create next copy" to start early.
   - Bulk pause.
8. **Planning ritual with a workload limit** (Sunsama).
   - Morning: plan with the sum of estimates shown against free calendar time.
   - Evening: shutdown that resolves leftovers.
   - Keep both optional and short.
9. **Rollover counter + auto-archive** (Sunsama). Show "rolled 4×". After N rolls, move the task to Someday with a notice. This makes procrastination visible without nagging.
10. **Estimate vs actual** (TickTick, Sunsama). One estimate field. Actual time comes from completed blocks or a focus timer.
11. **Filter query language stored by ID** (Todoist syntax, saved as smart lists). Provide a form builder (TickTick) that writes the same query. Avoid Todoist's rename breakage.
12. **Positional insert** (Things Magic Plus, TickTick draggable +). On Mac: drag a "+" from the toolbar into a list, onto a day in Upcoming, or straight onto the calendar.
13. **Headings inside projects** (Things). Cheaper than subprojects. Moving a heading moves its tasks, and you can archive a heading.
14. **Habit check-in modes** (TickTick): boolean, count with goal, or amount entered manually. Frequency "N per week". Backfill. Habits stay separate from recurring tasks.
15. **Project review interval** (OmniFocus). An optional "review every N weeks" on projects and areas, feeding a Review list.
16. **Countdowns** (TickTick). A tiny feature and a common ask. Do it later as a deadline display mode.
17. **Eisenhower matrix.** It's just a saved filter laid out in 2×2. Low priority, cheap once filters exist.

## Common complaints / gaps to exploit

- **Things users want time-blocking and won't leave the design.** Things has no durations, read-only Apple-only calendar display, and no event creation. People bolt on Fantastical, Structured, or Akiflow. The opening is a native app that feels like Things and treats the calendar as editable.
- **TickTick users want TickTick's features with Things' calm.** Fix the clutter by keeping modules (habits, focus, countdown) out of the task UI until used, not behind a settings toggle wall.
- **Planner pricing is the top Sunsama and Akiflow complaint.** $17-34/mo with no free tier. A one-time or modest annual price is a real differentiator. Structured offers $99.99 lifetime, and Things is a one-time purchase.
- **Calendar pollution and destructive sync.** TickTick two-way Google sync deletes things on both sides and mangles recurrences. Sunsama added an internal calendar to stop polluting work calendars. Default task blocks to a local-only layer and make "publish as busy" an explicit per-calendar option (Akiflow's lock).
- **Splitting work across sessions.** Common, and poorly modeled. TickTick can't. Akiflow tells you to duplicate the task for clean stats. Sunsama allows multiple drags. Model blocks as a 1:N child of the task.
- **Silent rescheduling.** Users distrust it. Akiflow sells "you stay in control". Reclaim pushes past deadlines when nothing fits. Make rollover visible and one-click, never automatic for timed blocks.
- **Weak mobile apps and no offline mode** (Sunsama). Build local-first.
- **Paywalled calendar** (TickTick, Todoist calendar layout). The core feature should not be the upsell.
- **No collaboration in Things.** Out of scope for a personal app. At most, consider a shared list later.
- **Apple Reminders' fixed 30-minute blocks.** That's the free baseline. Durations, splitting, and the planning flow are what you'd charge for.

## Time-blocking interaction design

Concrete behavior proposal. Each rule notes its precedent.

1. **Drag task → calendar creates a TimeBlock record linked to the task** (Sunsama, Akiflow).
   - Duration = the task's remaining estimate, or 30 min if there's no estimate (Todoist and Apple use 30). Snap to 15 min.
   - If the task's start date is empty or later than the block's day, set it to that day so the task shows in Today. Leave the deadline alone.
2. **The block lives in a local "Tasks" layer by default.** Per calendar account, an opt-in "show as busy" writes one opaque event to Google/iCloud/Outlook. The event title is the task title, with a URL back to the app. Busy/private is configurable. The event's external ID is stored on the block.
   - Edits flow from app to calendar. On the calendar side, accept only time moves and resizes. Never delete the task because the event was deleted. Detach the block instead.
3. **Completion.**
   - Checking the task anywhere marks it done. Its current or next block is marked done. Future blocks for that task are deleted, after asking if there are any.
   - Optional: if you complete during a block, trim the block's end to now (Sunsama "auto-reschedule").
   - Checking a block's checkbox completes the task.
   - "Done for this session" is a separate block action. It marks the block done and leaves the task open (fixes Akiflow's duplicate-the-task workaround).
4. **Past, unfinished blocks** stay on the calendar where they were, styled hatched or dimmed. They are history and are not moved. The task becomes "needs time" again and shows in tomorrow's sidebar with the remaining estimate and a rollover count.
   - One action: "Replan" (keyboard `P`) offers the next free slot of the same length, or the next block of the same project (Akiflow).
   - No automatic moving of timed blocks.
   - Untimed Today tasks just stay in Today. A When date never goes overdue (Things semantics).
5. **Splitting.** Dragging a task that already has blocks creates another block.
   - The sidebar shows "1h 30m of 3h scheduled".
   - Remaining = estimate − sum of future and done blocks.
   - Option-drag duplicates a block.
   - Auto-split (Reclaim-style min/max chunk) is a later feature.
6. **Resize changes the block, not the estimate.** If total block time exceeds the estimate, show the overage. Don't silently rewrite the estimate.
7. **Block → sidebar unschedules** it by deleting the block (TickTick desktop). Delete key on a block does the same. Deleting a block never deletes the task.
8. **Recurring tasks.** A block attaches to a specific instance. With a fixed-schedule rule, moving the block to another day does not trigger "exception or update rule". Only changing the instance's date does.
9. **Visual distinction.**
   - Events: filled color blocks.
   - Task blocks: lighter fill with a checkbox and the project color edge.
   - Done blocks: struck through.
   - Deadlines and dated-but-untimed tasks: in the all-day row, or in a "Today" panel above the grid.
   - Habits due today: a separate compact row, not draggable (TickTick also forbids dragging habits). A habit can optionally have a default time block.
10. **Workload bar per day** (Sunsama): sum of estimates for today's tasks vs free time between working hours minus events. Shown in the sidebar header.
11. **Keyboard parity.**
    - With a task selected, `X` or Cmd-Shift-S = "schedule into next free slot" (Sunsama `X`).
    - Arrow keys nudge a selected block by 15 min. Shift+arrow resizes.
    - Every drag action has a keyboard equivalent.
12. **Creating from the calendar.** Click-drag on empty grid opens a chooser: event or task.
    - "Task" creates the task and its first block together, filed to Inbox (or the current project) with the block's length as its estimate.

## Proposed task data model

Principles:
- Date-only values are local calendar dates, not instants.
- Timed values store the instant plus a time zone or a floating flag (TickTick's fixed/floating).
- Order fields are per-container.
- References use IDs, never names (avoids Todoist's rename breakage).
- Everything has `createdAt`, `updatedAt`, and `deletedAt` (soft delete) for sync.

```ts
type LocalDate = `${number}-${number}-${number}`; // "2026-10-28", no TZ
type Id = string; // ULID/UUIDv7: sortable, client-generated for offline

interface Area {
  id: Id; title: string; sortKey: string; color?: string;
  reviewEveryDays?: number; nextReviewOn?: LocalDate;  // OmniFocus review
  archivedAt?: number;
}

interface Project {
  id: Id; areaId?: Id; title: string; notes: string;   // markdown
  status: "open" | "completed" | "canceled";
  startOn?: LocalDate;                                  // hibernate until (Things)
  someday: boolean;
  deadlineOn?: LocalDate;
  sequential: boolean;                                  // only first open task is "available" (OmniFocus); default false
  reviewEveryDays?: number; nextReviewOn?: LocalDate;
  sortKey: string; completedAt?: number;
}

interface Heading { id: Id; projectId: Id; title: string; sortKey: string; archivedAt?: number }

interface Task {
  id: Id;
  title: string; notes: string;                         // markdown; links captured by Quick Entry go here
  // Container. None of these set = Inbox.
  projectId?: Id; headingId?: Id; areaId?: Id;
  parentTaskId?: Id;                                    // optional true subtasks; keep checklist for lightweight steps
  status: "open" | "completed" | "canceled";
  completedAt?: number;

  // Planning layer 1: relevance (Things "When")
  startOn?: LocalDate;                                  // appears in Today on/after this date, never "overdue"
  someday: boolean;                                     // mutually exclusive with startOn in UI
  evening: boolean;                                     // "This Evening" section of Today

  // Planning layer 2: obligation
  deadlineOn?: LocalDate;
  deadlineAt?: { instant: number; tz: string | "floating" }; // optional time-of-day deadline

  // Planning layer 3 lives in TimeBlock (1:N), not here.
  estimateMinutes?: number;                             // total effort; remaining = estimate − sum(blocks)
  priority: 0 | 1 | 2 | 3;                              // none/low/med/high; map to VTODO PRIORITY 0/9/5/1
  tagIds: Id[];
  reminders: Reminder[];
  recurrenceId?: Id;                                    // set on template and on spawned instances
  occurrenceOn?: LocalDate;                             // which instance of the rule this is
  rolloverCount: number;                                // incremented when a Today task passes midnight undone
  sortKeys: { container: string; today?: string };      // Today has its own manual order (Things)
}

interface ChecklistItem { id: Id; taskId: Id; title: string; done: boolean; sortKey: string }

interface Tag { id: Id; title: string; parentTagId?: Id; color?: string; shortcut?: string }

type Reminder =
  | { kind: "absolute"; at: number; tz: string | "floating" }
  | { kind: "onStartDate"; time: `${number}:${number}` }     // Things: reminder rides the When date
  | { kind: "beforeBlock"; minutes: number };                 // fires before each linked TimeBlock

interface TimeBlock {
  id: Id; taskId?: Id;                                  // taskId absent = Akiflow-style "slot"; add slotTaskIds later if needed
  start: number; end: number; tz: string | "floating";
  state: "planned" | "done" | "partial" | "skipped";    // set on completion or when time passes
  actualMinutes?: number;                               // from focus timer or trim-on-complete
  external?: { accountId: Id; calendarId: string; eventId: string; etag?: string }; // only when published as busy
}

interface RecurrenceRule {
  id: Id;
  rrule: string;                                        // RFC 5545 RRULE body, e.g. "FREQ=WEEKLY;BYDAY=MO,TH"
  mode: "fixed" | "afterCompletion";                    // Things/TickTick repeatFrom; Todoist "every" vs "every!"
  dtstart: LocalDate;
  exdates: LocalDate[];                                 // "Make Exception" = EXDATE + a detached instance
  templateTaskId: Id;                                   // fields copied into each new instance
  deadlineOffsetDays?: number;                          // deadline relative to instance start
  pausedAt?: number; endedAt?: number;
}

interface Habit {                                       // separate entity, not a recurring task (TickTick)
  id: Id; title: string; sectionId?: Id;                // morning/afternoon/evening
  schedule: { rrule: string } | { timesPer: "week" | "month"; count: number };
  goal: { kind: "once" } | { kind: "amount"; target: number; unit: string };
  checkInMode: "tap" | "increment" | "enter";
  defaultTime?: { start: `${number}:${number}`; minutes: number }; // optional block on the calendar
  archivedAt?: number;
}
interface HabitCheckIn { id: Id; habitId: Id; on: LocalDate; amount: number; note?: string }

interface SavedFilter { id: Id; title: string; query: string; /* Todoist-style; stores ids */ }
```

Decisions behind this model:
- **Materialize one instance at a time for recurring tasks.** Generate the next instance when the current one is completed (after-completion mode) or when its date reaches the Upcoming window (fixed mode). Upcoming shows future occurrences virtually from the RRULE. Things and Todoist both work this way. Keep `occurrenceOn` so "complete early" and "make exception" are unambiguous.
- **Checklist vs subtasks.** Things gets by with checklists only. TickTick and Todoist have nested subtasks, which make every view more complex (Todoist filters show either parent or child, not both). Ship checklists first. Add `parentTaskId` only if real demand shows up.
- **Inbox is derived** (no container), not a list row. Same for Today, Upcoming, Anytime, Someday, and Logbook. They are queries over `startOn`, `someday`, `deadlineOn`, `status`, and blocks:
  - **Today** = open and not someday, and any of: `startOn <= today`, `deadlineOn <= today`, or a block today.
  - **Anytime** = open, not someday, `startOn` null or ≤ today, and not in a project that is still hibernating.
  - **Upcoming** = `startOn > today`, or a future block, or a future deadline, plus virtual recurrences.
- **Priority** is a small enum. Things has none and users don't miss it much. TickTick/Todoist users expect 3-4 levels, and the Eisenhower view needs it.
- **Sync and interop.** The fields map onto iCalendar VTODO:
  - `startOn` → DTSTART, `deadlineOn` → DUE, `status` → STATUS, `completedAt` → COMPLETED.
  - `priority` → PRIORITY, checklist/subtasks → RELATED-TO, `recurrence` → RRULE.
  - Apple EventKit's EKReminder has start and due date components but no duration, so blocks can't round-trip through Reminders.
  - Blocks map to VEVENT only when published.

---

## Sources

Things (Cultured Code)
- Keyboard shortcuts (Mac): https://culturedcode.com/things/support/articles/2785159/
- Today/Upcoming/Anytime/Someday: https://culturedcode.com/things/support/articles/4001304/
- Natural language input: https://culturedcode.com/things/support/articles/9780167/
- Quick Entry: https://culturedcode.com/things/support/articles/2249437/
- URL scheme (list IDs, when/deadline params): https://culturedcode.com/things/support/articles/2803573/
- Calendar integration: https://culturedcode.com/things/support/articles/2803583/
- Headings: https://culturedcode.com/things/support/articles/2803577/
- Gestures (Magic Plus): https://culturedcode.com/things/support/articles/2803582/
- Features / design page: https://culturedcode.com/things/features/
- Repeating To-Dos, Refined (3.23, Aug 2026): https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/
- Mac release notes: https://culturedcode.com/things/support/articles/1100684/
- iPhone release notes: https://culturedcode.com/things/support/articles/2409121/
- MacRumors, Things for iOS 27: https://www.macrumors.com/2026/09/14/things-3-updated-for-ios-27/
- MacRumors, iPhone Duo: https://www.macrumors.com/2026/10/22/things-updated-for-iphone-duo/
- iDrop News on 3.23: https://www.idropnews.com/news/things-3-repeating-tasks-update-2026/267466/
- TechRadar, leaving Things for Reminders: https://www.techradar.com/computing/websites-apps/after-years-of-using-things-3-ios-26-could-move-me-to-reminders
- When vs Deadline explainer: https://pinwork.app/articles/when-vs-deadline/
- AlternativeTo (Things): https://alternativeto.net/software/things/about

TickTick
- Add Tasks / smart date parsing: https://help.ticktick.com/articles/7055782422935240704
- Calendar FAQ: https://help.ticktick.com/articles/7063851189372190720
- Show Tasks with Calendar: https://help.ticktick.com/articles/7358389904469917696
- Timeline view: https://help.ticktick.com/articles/7055780375439605760
- Eisenhower Matrix: https://help.ticktick.com/articles/7055782055577124864
- Filters: https://help.ticktick.com/articles/7055782240994721792
- Habits: https://help.ticktick.com/articles/7055781878401335296 , https://help.ticktick.com/articles/7055781805944733696
- Pomodoro: https://help.ticktick.com/articles/7055782025193586688
- FAQ (estimated pomo/duration): https://help.ticktick.com/articles/7055792921664028672
- Countdowns: https://help.ticktick.com/articles/7322524237753745408
- Google Calendar integration: https://help.ticktick.com/articles/7055781593733922816
- What's New: https://help.ticktick.com/articles/7082552170989486080
- Features page: https://ticktick.com/features?language=en_us
- Calendar quickstart (2020): https://blog.ticktick.com/2020/11/30/ticktick-calendar-quickstart/
- 20 lesser-known features (2020): https://blog.ticktick.com/2020/12/08/20-lesser-known-ticktick-features/
- Desktop 6.0 news: https://alternativeto.net/news/2024/7/ticktick-desktop-6-0-released-to-enhance-your-task-management-and-habit-tracking
- Open API task fields (third-party docs): https://github.com/TickTeam/ticktick-cli , https://github.com/Code-MonkeyZhang/ticktick-mcp-enhanced/blob/main/ticktick-api-doc.md , https://github.com/prabhuakshay/nudge/issues/8
- Quick add symbols: https://curtismchale.ca/2020/08/10/ticktick-quick-add-syntax/ , https://www.makeuseof.com/guide-to-organizing-tasks-in-ticktick/
- Things vs TickTick (clutter): https://markellisreviews.com/reviews/ive-switched-to-do-list-apps-things-vs-ticktick/
- Google sync complaints: https://community.latenode.com/t/ticktick-and-google-calendar-sync-completely-destroyed-my-schedule/35459
- Reviews/pricing 2026: https://unstar.app/blog/todoist-ticktick-things-3-microsoft-todo-apple-reminders-todo-apps-ranked-2026 , https://habitbox.app/blog/ticktick-review , https://lifestack.ai/blog/ticktick-review , https://www.techharry.com/2026/09/tick-tick-review.html

Todoist
- Filters: https://www.todoist.com/help/articles/introduction-to-filters-V98wIH
- Quick Add: https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz
- Task duration: https://www.todoist.com/help/todoist/features/set-a-task-duration-L1kYkZv8d
- Time blocking: https://www.todoist.com/help/articles/time-blocking-in-todoist-d6Pf1uTpc
- Calendar layout: https://www.todoist.com/help/articles/use-the-calendar-layout-in-todoist-lPHRQTu0o
- Upcoming view: https://www.todoist.com/help/articles/plan-your-week-with-the-upcoming-view-OKOg1mR8

OmniFocus
- 4.7 release (planned dates): https://www.omnigroup.com/blog/omnifocus-4.7-now-available
- Planned vs deferred (Ken Case): https://discourse.omnigroup.com/t/planned-versus-deferred-date-intended-usage/71146
- Perspectives manual: https://support.omnigroup.com/documentation/omnifocus/universal/4.3.3/en/perspectives/
- Planned dates tutorial: https://learnomnifocus.com/tutorial/unlock-the-power-of-planned-dates-in-omnifocus/
- Due dates sparingly: https://learnomnifocus.com/tutorial/best-practice-due-dates/

Sunsama
- Calendar integration: https://help.sunsama.com/docs/calendar-integration
- Rollover: https://help.sunsama.com/docs/getting-started/basics/task-rollover-and-recurring-tasks-the-basics/
- FAQ: https://help.sunsama.com/docs/faq/faq/
- Daily shutdown: https://roadmap.sunsama.com/changelog/daily-shutdown
- Complete tasks in calendar (roadmap): https://roadmap.sunsama.com/improvements/p/ability-to-complete-tasks-in-calendar
- Pricing review 2026: https://www.usecarly.com/blog/sunsama-review/
- Sunsama vs Akiflow: https://toolfinder.com/comparisons/akiflow-vs-sunsama , https://blog.saner.ai/sunsama-vs-akiflow/

Akiflow
- Time Slots: https://product.akiflow.com/en/help/articles/3089241-time-slots
- What can Aki do: https://product.akiflow.com/help/articles/5330825-what-can-aki-do
- Changelog: https://product.akiflow.com/changelog
- Three weeks with Akiflow (Jan 2026): https://thenewsprint.co/2026/01/25/three-weeks-with-akiflow/

Others
- Structured reviews: https://calmevo.com/structured-app-review/ , https://habitbox.app/blog/structured-app-review
- Amie: https://techcrunch.com/2022/11/28/amie-grabbed-7-million-for-its-opinionated-calendar-and-todo-app/ , https://agent-finder.co/reviews/amie
- Reclaim tasks: https://help.reclaim.ai/en/articles/5108936-overview-what-reclaim-tasks-are-and-how-to-create-and-use-them
- Reminders in Calendar (iOS 18): https://9to5mac.com/2024/07/19/reminders-in-ios-18-can-now-live-inside-the-calendar-app/
- Reminders iOS 26: https://9to5mac.com/2025/10/13/heres-everything-new-in-reminders-with-ios-26/ , https://9to5mac.com/2026/02/27/ios-26-4-gives-reminders-best-new-feature-the-one-thing-it-was-missing/
- RFC 5545 (iCalendar VTODO, RRULE): https://www.rfc-editor.org/rfc/rfc5545
