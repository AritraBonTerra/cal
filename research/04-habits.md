# Habit tracking research

Researched 2026-10-28 for a personal calendar + task manager + habit tracker (Mac first). Pricing and UI details from third-party reviews go stale fast. Where a source is old or conflicts with another, the text says so.

## Per-app notes

### Streaks (Crunchy Bagel; iPhone, iPad, Watch, Mac, Vision Pro)

- Data model. Up to 24 tasks, laid out as pages of icons. Task kinds: plain check, "times per day" count, timed (built-in timer with Lock Screen countdown), negative ("don't smoke"), and Health-linked.
- Frequency. Specific weekdays, N days per week, N days per month, every other day, and specific days of the month (1 to 31, plus "last day" and "second last day", added in v10, Sept 2024). Tasks pinned to specific days fade on off days. "N times per week" tasks can't fade because any day qualifies.
- Streak rules. A miss resets to 0. Off days are neutral. The v10 "2-Day Rule" lets the first missed day count as "skipped" and the second consecutive miss reset the streak. A "2" badge marks the day the task must be done. The Activity Rings task pauses when the user pauses rings in Fitness.
- Health. Reads steps, distance, cycling, swimming, HR zones, stand minutes, flights, rings, medication, daylight, mindful minutes. Writes water, mindfulness, and State of Mind back to Health.
- Visuals and widgets. Current and best streak, completion rate, completions by weekday and by time of day. Home Screen widgets, Control Center controls that complete tasks or start timers (iOS 18), Watch Smart Stack and double-tap to complete.
- Other. One-time $5.99, no subscription. iCloud sync. CSV export and import; a recent changelog switched the export to local time instead of UTC. Shared tasks go over iCloud.
- Complaints from App Store reviews: the 24-task cap, iCloud sync un-completing tasks, an interactive widget that was removed, Shortcuts/NFC logging failing unless the app is open, "if you fail" notification copy that discourages people, "number of days" labels that mean times per period, and no easy way to unmark a completion.

### Habitify (iOS, Android, Mac, web, Watch)

- Data model. Goal = value + unit + period (day, week, month, year). Repeat = daily on chosen weekdays, monthly on chosen dates, or interval (every N days). Time-of-day sections: morning, afternoon, evening, anytime. User-defined "Areas" group habits.
- Check-in states: done, skip, fail, or nothing.
- Streak rules are documented in detail:
  - Daily-goal habits follow Repeat. On scheduled days, no check-in or Fail ends the streak. Skip preserves it. Check-ins on unscheduled days don't change it.
  - Weekly-goal and monthly-goal habits count consecutive periods that met the goal. Repeat is ignored, and failed days inside a period that still met its goal don't break the streak.
  - "Off Mode" pauses all habits and protects streaks during vacations.
  - Streaks can't be hidden. Users have asked for that; Habitify says the request is "passed to product team".
- Health. Apple Health / Google Fit sync with a start date auto-completes habits.
- Pricing and export. Free tier allows 3 habits. Premium prices differ by source, from $29.99 to $49.99 a year, with lifetime offers between $59.99 and $119.99. Verify before quoting. CSV export and a SQLite backup exist. Its pricing page lists an API plus Zapier and IFTTT.
- Complaints: a 3-habit free cap, widgets redesigned without streaks or progress, no way to log the previous day (night-shift workers and forgotten entries), counts capped at the goal, sync bugs, reminders firing after the habit is done, and habits "tied to specific days" with no flexible weekly cycle (this was before weekly goals got better).

### Loop Habit Tracker (Android, open source GPLv3, ~10k GitHub stars, v2.3.2 Oct 2026)

- Data model (`uhabits-core`). `Habit` has `type` YES_NO or NUMERICAL, `targetType` AT_LEAST or AT_MOST, `targetValue`, `unit`, `frequency`, `question`, `reminder`, `color`, `category`, archived flag. `Frequency(numerator, denominator)`, for example 3/7 = 3 times per week and 1/2 = every other day. `Entry(date, value, notes)`. Boolean values are YES_MANUAL=2, YES_AUTO=1, NO=0, SKIP=3, UNKNOWN=-1. Numeric values are stored ×1000.
- YES_AUTO. For non-daily boolean habits, Loop builds intervals from the frequency and fills the days inside a satisfied interval with YES_AUTO. Those days count as "completed" for streaks but don't add to the score's rolling sum. That is how a 3x/week habit keeps a streak alive across rest days.
- Numeric completion is judged per period: day if denominator ≤ 1, week if ≤ 7, otherwise month. The period target drops by `dailyTarget × skippedDays`.
- Habit strength score, verbatim from `Score.kt`:
  ```
  multiplier = 0.5 ^ (sqrt(frequency) / 13)
  score = previousScore * multiplier + checkmarkValue * (1 - multiplier)
  ```
  It is an exponential moving average evaluated once per day. `checkmarkValue` is `min(1, rollingSum / numerator)` over a sliding window of `denominator` days. For non-daily boolean habits Loop doubles numerator and denominator (3/7 becomes 6/14) to smooth irregular weekdays. SKIP days are dropped and don't advance the average. AT_MOST habits start at 1.0 and lose score in proportion to overshoot.
- What the constants mean. Half-life is 13/sqrt(f) days: 13 days for a daily habit, 19.9 for 3x/week, 34.4 for weekly. A daily habit done perfectly from zero reaches 31% at day 7, 50% at day 13, 80% at day 30, 97% at day 66. One miss at 100% drops it to 94.8%. Streaks are computed separately as runs of consecutive "completed" days.
- Other. History heatmap, score chart, bar charts by week, month, and year, weekday-frequency grid, streak list. Home-screen widgets for checkmark, history, score, and streaks. Reminders that can be checked off from the notification. CSV and SQLite export; Tasker can add checkmarks. No account and no cloud sync. Volunteer-maintained.
- Gap from Play Store reviews: no weekly streaks for cumulative numeric goals (example: 150 min/week of exercise).

### TickTick habit module (inside a task + calendar app)

- Goal types: "Achieve it all" (boolean) or "Reach a certain amount", added in v5.2.0 in 2019. Record modes: Auto (fixed increment per tap, such as +250 ml water), Manual (enter the amount), Complete all.
- Frequency: Daily on chosen weekdays, Weekly N times, and Interval (every N days, added 2020).
- Sections: morning, afternoon, evening, other, rearranged by drag.
- Up to 10 reminders per habit.
- Check-in states: achieved, "Unachieved" (added 2020, so a miss is recorded explicitly), and backfill by tapping a date in the monthly view. Each check-in can carry a habit log (note + mood); the log prompt can be turned off per habit. Stats show current streak, total days, check-in overview, and a monthly table.
- Calendar integration is the relevant part. A habit with a reminder time appears on the calendar timeline at that time. Calendar "View Options" has a "Show Habit" toggle. Habits are shown on the calendar, not scheduled; there is no flexible placement. The help pages are 2019 to 2020 era, so labels may have changed.

### Things 3 (and similar task-only apps)

- No habit object. Users fake habits with repeating to-dos. Repeat modes are fixed schedule (daily, weekly, monthly, yearly) or "after completion" (the next copy is due N days after you finish).
- Things 3.23 (around Aug 2026) added an ordinary checkbox for completing a repeating to-do early, a choice between "Make Exception" and "Update Rule" when moving one, and "Create Next Copy".
- No history, streak, count, or chart. Task-manager reviewers call this "boring, which is a feature" for people who live in the task app. The lesson for us: "after completion" repeat is half of a habit already. What it lacks is a completion log and the stats derived from it.

### Habitica (gamified RPG; web, iOS, Android)

- Three types. Habits are +/- counters with no schedule; doing a negative habit often turns it red and costs HP. Dailies are scheduled and carry a streak. To-Dos never cause damage.
- "Cron" runs at a custom day start. Each missed due Daily resets its streak, costs HP (more during boss quests, where the whole party takes damage), and gets redder, so its future rewards and penalties grow.
- "Record Yesterday's Activity" shows yesterday's unchecked Dailies before cron. This is a good forgiving-backfill pattern. Dailies that aren't due show grey and can still be done for a bonus.
- "Inn/Tavern" mode pauses damage.
- Damage after a long absence counts each missed Daily once, not once per day missed.
- Criticism: setup and upkeep take real time, the game elements distract, recurrence options are limited, and party damage adds social pressure. Some users find that pressure motivating. The punishment model is the extreme case of a guilt mechanic.

### Everyday (everyday.app; iOS, Android, Mac, web, browser extensions)

- Seinfeld "don't break the chain" grid. Each habit is a horizontal bar on a timeline, and the color fades after a break; how it fades is configurable. "Break habit" mode shows descending colors for quitting.
- Has a skip option and "no weekends".
- No Apple Health, limited reminders.
- Free tier allows 3 habits. Pricing reports conflict (about $30/yr or a $99 lifetime). One review complained of a price jump from $12 to $30 a year.
- Worth copying: the multi-habit timeline grid is the densest overview of many habits over many weeks.

### Productive (iOS; Android status disputed)

- Habits are grouped into morning, afternoon, and evening routines. Has location-based reminders, opt-in "challenges" and programs, and Apple Health plus Calendar integration for reading and exercise habits.
- Most expensive in its class: one source quotes $10.99/mo; others quote about $30/yr with a 5-habit free cap. Reviews (Jan 2026) say it isn't worth the subscription, the paywall shows too often, gamification can't be turned off, it pressures users after a streak breaks, has no "reduce" (vs. quit) habits, and ignores Dynamic Type.

### (Not Boring) Habits (iOS, iPad; no Mac found)

- Pitch: "No streaks. No guilt." The goal is 60 total repetitions, consecutive or not, and each completion builds a low-poly 3D world.
- Widgets: Grid (heatmap), Climb (progress toward the total), and later a Streak widget. Users asked for streaks, so the company added one even though it argues against them.
- Apple Design Award. $14.99/yr or a bundle plan.
- Worth copying: a cumulative counter that never resets sits beside or replaces the streak.

### Reclaim Habits (calendar-native; Google and Outlook calendars)

- 1.0 model (help center, labeled legacy):
  - Scheduling hours: work, personal, or custom.
  - Min and max duration, for example "no less than 30m and no more than 1h".
  - Frequency: daily, weekly, monthly, or custom (2nd Friday, the 15th).
  - Ideal days and an ideal time that must fall inside the hours; Reclaim schedules as close to it as possible.
  - A start date.
  - Priority P1 to P4. P1 can overbook lower-priority habits, tasks, and smart meetings. Habits never overbook scheduling-link meetings or events Reclaim didn't create. Same-priority ties go Smart Meetings, then Habits, then Tasks.
  - The event shows Free while the calendar is open and flips to Busy as the calendar fills or the start time nears. A "Time defense" setting makes it flip earlier.
  - When time runs short, low-priority habits can be skipped for the week.
- 2.0 model (rolled out around May 2026). Habits become "Agents" attached to a solo recurring event, and any existing recurring event can be converted with "Make a habit". Settings split into a default event (time, duration, free/busy, priority) and conflict rules: move within a window, shorten to a minimum, skip when busy, defend time.
- Reclaim doesn't track completion. A habit means "time exists on the calendar", not "I did it". It has no check-off, streaks, or score. That is the gap our product can fill.

### Apple Activity rings as a habit model

- Three daily quantity goals (Move, Exercise, Stand), filled automatically from sensors, with zero logging. Awards and Move-streak badges. Activity sharing adds social pressure.
- watchOS 11 (Sept 2024) added per-weekday goal schedules ("Change Daily Goal → Schedule") and "Pause Rings" for today, a week, a month, or a custom range up to 90 days, keeping the streak. This came only after years of complaints that rings had no rest days. Some users had worked around it by logging fake manual workouts.
- Lessons: auto-completion removes logging friction entirely, per-day targets beat one fixed target, and explicit pause is table stakes.
- Mac caveat for us: HealthKit is not available on macOS. `HKHealthStore.isHealthDataAvailable()` returns false on macOS 26 according to developer reports. App Store guideline 5.1.3(ii) also bars storing personal health information in iCloud. Health-driven completion therefore needs an iPhone companion. That companion can either push only derived results ("habit X done on date D, value V", not raw health samples) to the Mac, or sync locally.

## Behavior design takeaways

1. Habits take a long time to form, and the time varies widely. Lally et al. 2010 tracked 82 analyzable participants doing one daily behavior in a fixed context. Time to 95% of asymptotic automaticity had a median of 66 days and a range of 18 to 254; the top of the range is extrapolated past the 84-day study. Missing one occasion "did not materially affect" the habit's development. Buyalskaya et al. 2023 (PNAS, 12M+ gym check-ins and 40M+ handwashing events) found gym habits take months while handwashing takes weeks, and that "there is no magic number". Product implication: don't promise "21 days". Show slow accumulation and treat single misses as noise.
2. Streaks motivate, and broken streaks demotivate. Silverman & Barasch 2023 (JCR, 7 studies) found that a log showing an intact streak increases continued behavior compared with one showing a broken streak, independent of actual past behavior. In one study, 66% vs 58% chose to continue a strength exercise. The effect is stronger when people blame themselves for the break and weaker when they can repair it. The authors advise against "you broke your streak" messaging and recommend offering ways to keep or repair a streak.
3. The "what-the-hell effect" (Herman & Polivy; dieters who think their diet is already broken eat more) and the related abstinence-violation effect describe how one lapse becomes abandonment. Applying these to habit apps is practitioner inference, not tested directly, but it matches the user reports below.
4. "Never miss twice" has field evidence. In the Milkman et al. 2021 megastudy (Nature, 61,293 gym members, 54 interventions), the best intervention was a tiny bonus (about $0.09) for returning after a missed workout, which raised visits by up to 27%. Milkman's reading is that what matters is avoiding a series of misses. Streaks' 2-Day Rule and Duolingo's freezes implement the same idea. Duolingo found that a second freeze improved return rates and a third added little; it also warned that too much slack causes frequent breaks.
5. Flexibility beats rigid routine for some behaviors. Beshears, Milkman et al. 2021 (Management Science, 2,508 employees) found that paying for gym visits inside a chosen 2-hour window produced fewer visits, during and after the intervention, than paying for visits at any time. Implication for us: a habit's calendar block should guide the user, not decide whether the habit counted. Completion at any time should count.
6. Implementation intentions ("if situation X, then I do Y") work. Gollwitzer & Sheeran 2006 meta-analysis: d = 0.65 across 94 tests. A larger 2024/25 meta-analysis by Sheeran et al. (642 tests) reports a smaller corrected effect, about d = 0.36 raw and about 0.15 after bias correction, according to secondary sources I couldn't verify against the paper. Habit stacking (Fogg's "Tiny Habits" anchors, Clear's "After I [current habit], I will [new habit]") is the same mechanism with an existing routine as the cue. Implication: give each habit a cue field ("after morning coffee"), and let a habit be anchored to a calendar event or another habit.
7. Reminders help repetition and can slow automaticity. Stawarz, Cox & Blandford 2015 (CHI; 4-week study plus review of 115 apps) found that relying on reminders supported repetition but hindered habit development. Contextual cues and implementation intentions did better. Their CHI 2016 follow-up found that reminders and streaks create dependency on the app, and when people stop using the app the behavior often lapses. Implication: offer reminders, but default them to cue-based or calendar-based timing, and let reminders fade as the score rises. Tapering reminders is my suggestion, not a tested intervention.
8. Fresh starts. Dai, Milkman & Riis 2014 (Management Science) found that people pursue goals more after temporal landmarks such as a new week, month, or birthday. Implication: a weekly review where a missed week resets cleanly works better than a red wall of Xs.
9. Score versus streak. A streak is binary and fragile. An EMA score like Loop's degrades gracefully and still rewards consistency. Showing both, with the score as the headline and the streak in the natural period, keeps the motivational pull of streaks without the cliff.

## Common complaints / gaps

- Logging friction. Opening an app for each check-in is the main daily cost. Users complain about widgets that can't check things off (Streaks, Habitify), Shortcuts that only work while the app is open, and deep Watch menus. Auto-completion (Health, rings) gets the most praise. Logging should take one click from wherever the user already is.
- Guilt and streak loss. Reported over and over: a broken streak is followed by guilt, then the app gets abandoned, often within 2 to 3 weeks. People also start with 15 habits and drown. Fail-framed notifications ("if you fail") make it worse. Fixes users praise include skip, pause, the 2-day rule, (Not Boring)'s total count, and Loop's score.
- Weak flexible frequency. Habitify reviews complain that habits are "tied to specific days". Loop doesn't count cumulative weekly numeric goals toward streaks. Weekly habits vanish from Today views (Habitify's workaround is "goal 1/week + repeat daily"). A day is marked failed when a not-due habit is unchecked (an old Habitify complaint).
- No backfill. Users can't log yesterday, which hurts night-shift workers and people logging before bed after midnight. A custom day start (Habitica) and a backfill window are needed.
- No calendar integration. Habit apps don't schedule time. Calendar schedulers (Reclaim) don't track completion. TickTick shows habits on its calendar but doesn't place them flexibly. The market is split between "time exists" and "I did it", and few products do both.
- Subscription fatigue. Free tiers cap habits at 3 to 5. Productive and Habitify pricing is widely criticized. Streaks ($5.99 one-time) and Loop (free) get credit for avoiding subscriptions. Lifetime plans are common.
- Data export. Loop (CSV + SQLite) and Streaks (CSV) have it. Habitify gates it in some tiers. Competing apps can't import each other's formats. Time zone bugs show up in exports (Streaks moved from UTC to local time).
- Sync bugs. iCloud un-completing tasks (Streaks), Habitify desktop sync failing. Completion logs need conflict-free merges, such as append-only entries with idempotent IDs.
- Smaller items: caps on habit count, no "reduce" (at-most) habits, forced gamification, no way to hide streaks.

## Integration with calendar + tasks

Principle: the calendar block is a plan and the completion log is the truth. Doing the habit at any time counts. The block only helps it happen.

### Display modes (per habit)

1. List only. Shown in Today, the menu bar, and the habit view. No calendar presence.
2. Day strip. A compact row of habit chips under each day header, in the all-day area, with check rings and partial-progress arcs. It doesn't take up time in the grid. Off days are hidden. Quota habits (3x/week) show a "2 of 3 this week" counter on every day until the quota is met. This is the right default for most habits.
3. Fixed time block. A recurring event at a set time ("Gym, Mon/Wed/Fri 7:00"). Good for anchored habits and implementation intentions.
4. Flexible block. The auto-scheduler places it. Settings: window (for example 06:00 to 10:00), ideal time, min and max duration, allowed days, priority relative to tasks, conflict policy (move within window, shorten to min, skip when busy, defend), and show-as free or busy. This copies Reclaim's settings, which are proven, and adds completion.

### Auto-scheduler behavior for habits

- Quota habits are where this beats competitors. For "3x/week, 45 min, mornings", the scheduler places 3 blocks across the week, spread out with a minimum gap of 1 day. If the user does it off-block, the next unfulfilled block for that period is released. If a block is missed, the scheduler re-places it within the remaining period if a slot fits. Once the quota is met, remaining blocks are removed.
- Interval habits ("every 3 days after last done") re-plan from the actual completion date, like Things' "after completion".
- Priority between habits and tasks is a single ordering. Tasks with hard deadlines beat P3 and P4 habits, and P1 habits beat everything flexible. Conflicts with external events are never resolved by moving the external event.
- When the scheduler drops a habit for lack of time, mark that occurrence "unscheduled", which counts as neutral. Don't count it as a miss caused by the user. Surface it in the daily or weekly review.
- Pauses and vacation mode remove future blocks and make those days neutral for streak and score.

### Checking off

- Completing a habit block checks the habit. Event context menu: "Done", "Done, 20 min", "Skip".
- A block that ends unchecked is not auto-completed by default. Add it to an end-of-day "Record yesterday" sheet (Habitica's pattern) instead of marking it failed. Opt-in per habit: "count attended block as done", for habits like lunch or meditation where showing up is the habit.
- Menu bar: today's due habits with one-click check, +1 for counts, start or stop for duration habits (the timer writes a duration value), and a quota progress line. A global hotkey opens it. Add App Intents / Shortcuts actions that work without the app in the foreground, plus a desktop widget with interactive check buttons.
- Backfill window, for example 7 days, editable without friction. Custom day start, default 04:00, so post-midnight logging lands on the right day.

### Linking habits and tasks

- A habit can emit a task per occurrence, for example "Weekly review" appears in Today with a checklist. Completing the task writes the habit entry. This is a reference link, not a copy, so editing either side stays consistent.
- Tasks can count toward a habit. Rule: any completed task matching a filter (project "Writing", tag `#exercise`) adds +1 or adds its tracked minutes to the habit. This turns "write 5 days a week" into something measured from work the user already logs.
- Focus or timer sessions on a task count toward duration habits ("deep work 2h/day").
- A calendar event can count as completion. Rule: an event whose title matches "Gym" or that sits in a chosen calendar marks the habit done once the event ends. Opt-in, because it trusts the calendar.
- Anchor ("after X"): a habit can be anchored to another habit or to a recurring event. The scheduler places it right after the anchor, and the reminder fires when the anchor completes or ends. That is habit stacking built into the product.

### Visualization in a calendar app

- Week view shows chips and quota progress. Month view uses dots or fill per day.
- Habit detail: year heatmap in GitHub style, with the habit's own period cells for weekly habits; a score line; streak list; and a weekday × hour histogram of completion times, which lets the scheduler learn ideal times.
- A multi-habit grid (Everyday-style rows × days) for the weekly review.

## Proposed habit data model

TypeScript-ish types for the shape. Storage can be SQLite or Convex. Dates are local `YYYY-MM-DD` strings for "logical day", never UTC timestamps.

```ts
type HabitId = string & { readonly __brand: "HabitId" };
type LocalDate = `${number}-${number}-${number}`; // logical day after applying dayStart

// How "done" is measured. Boolean is a count with target 1.
type Measure =
  | { kind: "check" }                                           // did it / didn't
  | { kind: "count"; unit: string; step: number }               // glasses, pages; step = +1 button size
  | { kind: "duration" }                                        // minutes; timers and focus sessions write here
type Target = { direction: "atLeast" | "atMost"; amount: number }; // atMost covers "reduce" habits

// When the habit is due. Fixed schedules use RRULE semantics for calendar interop.
// Quota and interval schedules can't be expressed as RRULEs, so they get their own variants.
type Schedule =
  | { kind: "fixed"; rrule: string }                            // FREQ=WEEKLY;BYDAY=MO,WE,FR, BYMONTHDAY=-1, etc.
  | { kind: "quota"; times: number; period: "week" | "month"; allowedDays?: Weekday[] } // 3x/week
  | { kind: "interval"; everyDays: number; from: "anchorDate" | "lastCompletion"; anchorDate?: LocalDate }

type Habit = {
  id: HabitId;
  title: string;
  icon: string; color: string;
  measure: Measure;
  target: Target;              // per due day for fixed and interval; per period for quota
  schedule: Schedule;
  section: "morning" | "afternoon" | "evening" | "anytime";
  cue?: string;                // implementation intention: "after morning coffee"
  anchor?: { kind: "habit"; id: HabitId } | { kind: "event"; seriesId: string };
  startDate: LocalDate;
  endDate?: LocalDate;         // challenges, 30-day programs
  archivedAt?: number;
  grace: { missAllowance: 0 | 1 };      // 1 = Streaks' 2-day rule / "never miss twice"
  calendar:
    | { mode: "none" | "strip" }
    | { mode: "fixed"; startTime: string; durationMin: number }
    | { mode: "flexible"; window: [string, string]; idealTime?: string;
        minMin: number; maxMin: number; priority: 1 | 2 | 3 | 4;
        onConflict: "move" | "shorten" | "skip" | "defend"; showAs: "free" | "busy";
        attendedCountsAsDone: boolean };
  reminders: Array<{ kind: "time"; at: string } | { kind: "afterAnchor" } | { kind: "blockStart"; offsetMin: number }>;
  autoComplete: Array<
    | { kind: "health"; metric: string; threshold: number }      // evaluated on iPhone companion
    | { kind: "taskFilter"; filter: TaskFilter; contributes: "one" | "trackedMinutes" }
    | { kind: "eventMatch"; calendarId?: string; titlePattern?: string }>;
  emitsTask?: { template: TaskTemplate };   // one linked task per occurrence
  position: number;
};

// Append-only log. Several entries per day are allowed for counts; values sum.
type HabitEntry = {
  id: string;                  // client-generated, idempotent across sync
  habitId: HabitId;
  date: LocalDate;
  value: number;               // 1 for a check; units or minutes otherwise
  status: "done" | "skip" | "fail";        // "fail" is an explicit miss; absence = unknown
  source: "manual" | "menubar" | "calendar" | "task" | "health" | "timer" | "shortcut" | "backfill";
  sourceRef?: string;          // taskId / eventId / health sample summary id
  note?: string; mood?: 1 | 2 | 3 | 4 | 5;
  createdAt: number; deletedAt?: number;    // tombstones so sync merges cleanly
};

type Pause = { id: string; habitId?: HabitId; from: LocalDate; to: LocalDate; reason?: string }; // habitId undefined = vacation for all

// Scheduler output, regenerated freely; never the source of truth for completion.
type HabitOccurrenceBlock = {
  habitId: HabitId; periodKey: string; // "2026-W44" or the date
  start: number; end: number; state: "planned" | "released" | "unscheduled";
};

type UserSettings = { dayStart: string /* "04:00" */; weekStart: Weekday; backfillDays: number };
```

### Derived state (computed, cached, never stored as truth)

1. Period evaluation. Each habit's timeline divides into periods: a day for fixed and interval schedules, a week or month for quota. Each period resolves to one of:
   - `met`: sum of done values hits the target, or the at-most total stays under it.
   - `partial`
   - `missed`
   - `excused`: skip entry, pause, or a scheduler "unscheduled" with no completion
   - `notDue`
   - `open`: the current period, which never counts as missed

   Quota targets shrink in proportion to excused days, as Loop does.
2. Streak, counted in periods: days for daily habits, weeks for quota/week. `excused` and `notDue` are neutral. With `grace.missAllowance = 1`, one `missed` period is tolerated if the next due period is `met`, and the UI marks it as "saved". Two consecutive misses reset. Store the current and best streak with their date ranges.
3. Score, using Loop's formula on daily steps:
   - `f = timesPerPeriod / periodDays`
   - `m = 0.5 ** (Math.sqrt(f) / 13)`
   - `c = min(1, rollingSum / numerator)` over a sliding window of `denominator` days, doubled for non-daily boolean habits
   - `score = prev * m + c * (1 - m)`

   Excused and paused days don't step the average. Count habits use `rollingSum / target` capped at 1. At-most habits start at 1 and lose score in proportion to overshoot. Keep the `13` as a tunable constant. It gives a 13-day half-life for daily habits and about 20 days for 3x/week. Show the score as the main number ("Habit strength 78%").
4. Total reps. A lifetime count of `met` periods, which never resets ((Not Boring)'s motivator). Optional milestone at 66.
5. Learned timing. A histogram of completion hours per weekday. The flexible scheduler uses it to propose `idealTime` when the user hasn't set one.

### Notes on the model

- One `Schedule` union covers every frequency rule seen in the surveyed apps: weekdays, N per week/month, every N days, month days, last day of month, and "after completion". Anything RRULE can express stays RRULE, so habits export to ICS as recurring events.
- Completion is append-only with source tags. That makes multi-device sync, Health import from the iPhone companion, and "undo" safe. Absence of an entry means unknown, never failure, until the period closes.
- The scheduler only reads habits and writes `HabitOccurrenceBlock`s. Habits never depend on blocks, so changing the scheduler can't corrupt history.
- Export: CSV of entries (local dates, value, status, source) plus JSON of habits. Import from Loop CSV and Streaks CSV would lower switching cost, since those are the two apps that export.

## Sources

Apps (primary where available)
- Streaks home page: https://streaks.app/
- Streaks 10 release notes (Sept 2024): https://crunchybagel.com/now-available-streaks-10/
- Streaks App Store reviews: https://apps.apple.com/us/app/streaks/id963034692?see-all=reviews
- Habitify streak rules: https://intercom.help/habitify-app/en/articles/6113621-learn-about-streak-in-habitify
- Habitify goal setting: https://intercom.help/habitify-app/en/articles/12393175-good-habit-setting-goal
- Habitify weekly habit workaround (feedback board): https://feedback.habitify.me/p/weekly-habits-that-stay-until-they-are-completed
- Habitify pricing: https://habitify.me/pricing
- Habitify Health sync: https://habitify.me/onboarding-instruction/create-synced-habit
- Habitify App Store reviews: https://apps.apple.com/us/app/habitify-habit-tracker/id1111447047?see-all=reviews
- Loop source (Score.kt, ScoreList.kt, EntryList.kt, Entry.kt, Frequency.kt, StreakList.kt): https://github.com/iSoron/uhabits/tree/dev/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models
- Loop README: https://github.com/iSoron/uhabits
- Loop on Google Play: https://play.google.com/store/apps/details?id=org.isoron.uhabits
- TickTick "Start a New Habit": https://help.ticktick.com/articles/7055781878401335296
- TickTick "Better Achieve Habits": https://help.ticktick.com/articles/7055781805944733696
- TickTick 2019 frequency update: https://blog.ticktick.com/2019/06/03/habit510/
- TickTick 5.2.0 Goal feature: https://blog.ticktick.com/2019/08/07/ticktick520goal/
- TickTick 2020 habit update (Unachieved, habit log): https://blog.ticktick.com/2020/05/22/a-healthier-life-with-ticktick-habit/
- Things repeating to-dos: https://culturedcode.com/things/support/articles/2803564/
- Things 3.23 discussion: https://forums.macrumors.com/threads/things-3-23-brings-long-requested-overhaul-of-repeating-to-dos.2487208/
- Habitica wiki, Dailies: https://habitica.fandom.com/wiki/Dailies
- Habitica wiki, Cron: https://habitica.fandom.com/wiki/Cron
- Habitica on Wikipedia: https://en.wikipedia.org/wiki/Habitica
- Everyday: https://everyday.app/ and https://apps.apple.com/us/app/everyday-habit-tracker/id1394150432
- Productive: https://apps.apple.com/us/app/productive-habit-tracker/id983826477
- 2Sync roundup (Productive pricing): https://2sync.com/blog/best-habit-tracker-apps
- (Not Boring) Habits: https://apps.apple.com/us/app/not-boring-habits/id1593891243
- TapSmart review of (Not Boring) Habits: https://www.tapsmart.com/apps/review-not-boring-habits/
- Reclaim Habits overview (1.0): https://help.reclaim.ai/en/articles/4129152-habits-overview-auto-schedule-flexible-time-for-your-routines
- Reclaim, prioritizing habits: https://help.reclaim.ai/en/articles/4129286-prioritizing-your-habits
- Reclaim 2.0 FAQ: https://help.reclaim.ai/en/articles/15280604-reclaim-2-0-faq
- Reclaim, habits vs tasks: https://reclaim.ai/blog/habits-vs-tasks
- Apple, adjust Activity ring goals / pause rings: https://support.apple.com/guide/watch/adjust-your-activity-ring-goals-apd29b30023c/watchos
- MacRumors on watchOS 11 per-day goals: https://www.macrumors.com/2024/06/18/watchos-11-custom-activity-goals-different-days/
- Rest-day workaround for Activity rings: https://jonwestfall.com/2021/08/rest-days-that-dont-break-your-apple-activity-streaks/
- HealthKit `isHealthDataAvailable`: https://developer.apple.com/documentation/healthkit/hkhealthstore/ishealthdataavailable()
- macOS HealthKit unavailable (developer report, Oct 2026): https://github.com/jnnabugwu/steady/issues/97
- Timing roundup of habit apps for iPhone and Mac (2026): https://timingapp.com/blog/habit-tracker-apps-iphone-mac/

Research
- Lally et al. 2010, How are habits formed, EJSP 40(6): https://www.researchgate.net/publication/32898894_How_are_habits_formed_Modeling_habit_formation_in_the_real_world
- BPS summary of Lally et al.: https://www.bps.org.uk/research-digest/how-form-habit
- Buyalskaya et al. 2023, PNAS: https://www.pnas.org/doi/10.1073/pnas.2216115120 (correction: https://www.pnas.org/doi/full/10.1073/pnas.2312763120)
- Silverman & Barasch 2023, JCR, On or Off Track: https://udspace.udel.edu/items/42ce576b-8e1f-429a-8541-e29e48dbcfbb
- Psychology Today summary of Silverman & Barasch: https://www.psychologytoday.com/us/blog/ulterior-motives/202306/how-broken-streaks-sap-motivation
- Milkman et al. 2021, Megastudies, Nature 600: https://www.nature.com/articles/s41586-021-04128-4
- Beshears et al. 2021, flexibility vs routinization, Management Science: https://pubsonline.informs.org/doi/10.1287/mnsc.2020.3706
- Gollwitzer & Sheeran 2006, implementation intentions meta-analysis: https://kops.uni-konstanz.de/handle/123456789/10973
- Stawarz, Cox & Blandford 2015, CHI: https://discovery.ucl.ac.uk/1468224/
- Stawarz et al. 2016, Don't Kick the Habit: https://discovery.ucl.ac.uk/1477627/1/Chi%202016%20LBW%202.1%20camera%20ready.pdf
- Polivy & Herman review (what-the-hell effect): https://pmc.ncbi.nlm.nih.gov/articles/PMC7096476/
- Dai, Milkman & Riis 2014, The Fresh Start Effect, Management Science 60(10). Cited from memory; not re-fetched.
- Duolingo, improving the streak: https://blog.duolingo.com/improving-the-streak
- Duolingo, how streaks keep learners committed: https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/
- Duolingo streak freeze experiments (Shuttleworth interview): https://elsewhere.news/en/linearcapital/duolingobolt

Community
- HN, flexible streaks discussion: https://news.ycombinator.com/item?id=8248793
- HN, Show HN habit tracker with freezes: https://news.ycombinator.com/item?id=40893866
- Streak anxiety roundup (vendor blog quoting r/getdisciplined): https://habitdoom.com/blog/streak-anxiety-habit-trackers
