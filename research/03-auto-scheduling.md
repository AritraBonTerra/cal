# Auto-scheduling: prior art, algorithms, trust UX

Research date: 2026-10-28. Scope: non-LLM auto-placement of tasks and habits on a personal calendar. Vendor facts come from help centers where possible. Prices and product status change often, so each section notes how fresh its information is.

## TL;DR

- The market is moving away from silent, continuous auto-placement of tasks. Reclaim 2.0 (default for signups since May 2026) **stopped auto-booking task time** and now suggests tasks inside Focus Time, with a Preview Mode that stages changes before they apply. Morgen's planner shows a proposal and writes nothing until you accept. Sunsama's 2026 Autoplan ends each run on a review screen with per-change undo. Motion still reshuffles continuously, and its most common scheduler complaint is churn.
- Clockwise shut down on 2026-03-27 after a Salesforce acqui-hire. Motion moved toward "AI Employees" and SMB agents in 2025, then pulled back on pricing. Reclaim is still running under Dropbox. Nobody owns "a local-first, deterministic, explainable personal scheduler."
- How these products place work is not complicated. Every vendor that documents its behavior describes a priority-plus-deadline ordering with greedy placement into allowed windows. The hard parts are stability between runs, how much the user trusts it, and duration estimates.
- Recommendation: v1 is a deterministic greedy scheduler that orders by slack and scores slots, with stickiness, a frozen near-term window, an EDF feasibility check for at-risk warnings, and reason codes on every placement. v2 adds a local-search improvement pass, and CP-SAT only if constraint complexity really needs it, behind an explicit "Optimize week" action that shows a diff.

---

## 1. Motion (usemotion.com)

**Inputs per task** (help center): duration, start date, deadline, a hard-deadline toggle, priority (ASAP > High > Medium > Low), min chunk size, schedule (named working-hour templates such as "Work 9-5" or "Personal 6-8pm"), recurrence, and blockers (dependencies: "If Task A blocks Task B, Task A is always scheduled first").

**Documented hierarchy, in order** (Motion's own auto-scheduling page):
1. ASAP: "overrides all other scheduling parameters". The deadline field greys out.
2. Hard deadlines: these can be scheduled *outside* the assigned schedule or working hours to hit the date.
3. Soft deadlines: sooner due dates go earlier.
4. Priority.
5. Duration and chunking: with no min chunk set, the task needs one contiguous slot. Shorter tasks may jump ahead of longer ones with slightly earlier due dates.
6. Start date: nothing is placed before it, "even if earlier time is free".
7. Recurrence: recurring tasks go ahead of lower-priority one-offs "to maintain cadence".

The same page contradicts itself. A hint box says "Priority always comes first" while the list ranks deadlines above priority. This tells you the real system is a weighted blend, not a strict lexicographic order.

**Hard preconditions.** A task with no duration "cannot be scheduled", and a task with neither deadline nor priority "won't be scheduled". Only *busy* events on *your connected* calendars block time.

**Rescheduling.** It is event-driven and continuous: "Add a meeting? Move a task? Motion reshuffles automatically." The help center admits that new work "can make some tasks shift multiple times." Breaks are a global setting, e.g. 15 min every 2 h. Travel time is per event.

**Locking.** Dragging an auto-scheduled task makes it "Locked" (lock icon). Exception: Motion reschedules a locked task if it isn't completed within 60 minutes of its slot. You can also turn auto-schedule off per task, which makes it fixed or unscheduled with a "No ETA" label.

**Past due and can't fit.**
- Past due: rescheduled into the next available slot and flagged with a red "!". Motion "will keep auto-scheduling these tasks".
- ETA colors: orange means "scheduled past deadline, still fixable" and red means "missed deadline". Hovering the ETA shows the cause and suggested fixes.
- "Could not fit" tasks stay unscheduled and pinned at the top of the calendar until you change duration, deadline, or priority. They live in a rolling window of unspecified length.
- Missed recurring instances are marked overdue, not moved within the week.

**How the plan shows.** Tasks appear as blocks on Motion's calendar and can sync to Google or Outlook. An ETA badge sits on each task and project. "AI Agenda" was a 2025 redesign.

**Pricing** (Carly review, 2026-09-28; usemotion.com/pricing shows the same structure):

| Plan | Individual, annual | Individual, monthly | Team seat, annual | Team seat, monthly | AI credits |
|---|---|---|---|---|---|
| Pro AI | $29 | $49 | $19 | $29 | 7,500/mo |
| Business AI | $39 | $69 | $29 | $49 | 15,000/mo |

There is no free plan, and the trial needs a card. The widely quoted "$19" is the team annual rate.

**Company direction.** In May 2025 Motion launched "AI Employees" for SMBs, with named agents for exec assistant, sales, support, and marketing. It raised a $38M Series C in Sep 2025, reported at a $550M valuation. Pricing in 2025 moved to a six-tier credit grid ($29 to $599/mo) and then back to Pro AI and Business AI. As of late 2026 the AI Employee pages redirect away.

**Complaints** (App Store, r/UseMotion, Trustpilot, as quoted in the Carly review and others):
- Churn: "Doesn't keep any tasks where I move them and moved everything around constantly" (App Store, Feb 2026). One comparison counted 11 reschedules in one day and calls the feeling "AI calendar anxiety". Tasks got pushed to Saturday without the user noticing.
- Correctness: "scheduled tasks directly on top of existing calendar events that were already marked as busy… if I have to supervise the scheduler, it defeats the purpose" (Jun 2026).
- Redesign regression: "The new version feels useless – I constantly find myself manually moving tasks around" (Oct 2025). That user moved to Reclaim.
- Overhead: you must mark tasks done or they keep reappearing (HN, 2024).
- Billing: a "Try for free" click led to an immediate charge, double charges, refunds at Motion's discretion, and a reported 30% renewal increase.
- Product focus: "flashy features that literally nobody asked for" while basics like event reminders were missing. Mobile apps had gone without an update since Nov 2025.
- Praise is almost entirely about the scheduler. ADHD and "time blindness" users love that it re-plans for them.

## 2. Reclaim.ai

**Status.** Dropbox acquired Reclaim, announced 2024-08-20. MarketScreener reports $40.2M, while the announcement left terms undisclosed. All 22 staff and both founders joined. Outlook support landed after the deal, and in 2026 Reclaim shipped ChatGPT and MCP integrations. **Reclaim 2.0** is the default for signups since May 2026, and 1.0 users upgrade through a banner.

**Pricing** (third-party checks, Aug-Sep 2026): Lite is free with a 1-week horizon. Starter is $10/seat/mo annual ($12 monthly) with an 8-week horizon. Business is $15 ($18) with a 12-week horizon. Enterprise is $22 with a 100-seat minimum. The scheduling horizon is a pricing lever.

**Priorities (1.0 doc).** There are four levels: P1 Critical, P2 High, P3 Medium, P4 Low.
- Higher priority can overbook lower-priority Habits, Tasks, and Smart Meetings.
- For tasks, priority is weighed with due date: "A High-priority Task due later may land after a Medium-priority Task due sooner."
- Ties at the same priority go Smart Meetings, then Habits, then Tasks. Equal-priority tasks sort by earliest due.
- Events created outside Reclaim default to P1. Habits, Tasks, and Smart Meetings never displace them.
- Reaction to conflicts is "in real time (about 15 seconds or less)." An invite counts as a conflict only after a Yes or Maybe RSVP.

**Free/busy defense** is Reclaim's signature mechanism. Smart events start as **Free**, so colleagues can book over them, and flip to **Busy** and lock as the calendar fills or the start approaches. Habits use two signals: time left in the habit's window, and time until start. There are three defense levels:
- *Most flexible*: always free, prefers the ideal time over max duration.
- *Let Reclaim decide*: the default.
- *Most defensive*: always busy, prefers max duration over ideal time.

An older doc said the least defensive level flips to busy 30 min before start, or when only one viable slot remains. Smart Meetings flip at <12 h or one slot left. If two same-priority habits compete for one slot, the more defensive one wins. Known weak spot (HN, 2020): a flexible lunch window shown as Free can be booked over in full by others.

**Habits** are flexible recurring blocks. Each has days, a time window (e.g. 11:30-14:00), min and max duration (30-60 min), an **ideal time** (12:00), priority, and a defense level. The scheduler places the habit as close to the ideal time as it can. When time is short, low-priority habits get skipped that week. API field names: `idealTime`, `durationMinMins`, `durationMaxMins`, `defenseAggression`.

**Tasks (1.0).**
- Fields: duration (≥15 min), due date (default +3 days), earliest start, and min/max chunk. Max chunk is used to "space out" work so blocks aren't stacked back-to-back. `nosplit` forces one block.
- "Up Next" overrides priority logic, like Motion's ASAP, with drag-to-rank.
- Inline syntax from Todoist or Google Tasks: `Write docs [30m] (due Friday not before Monday priority:critical upnext nosplit)`.
- Internally Reclaim uses 15-minute chunks, per a third-party API doc.

**Tasks (2.0), the big change.** Tasks "no longer automatically schedule dedicated task time on your calendar. Instead, Reclaim surfaces suggested tasks during your available Focus Time." Features are now "Agents": Focus Time, Habits, Buffers, Smart Meetings, and Meeting Quality. **Preview Mode** stages changes so "you see what will move before anything hits your live calendar", with *Review & apply* and *Discard*. Attendees aren't notified until you apply. Changes made by AI tools over MCP are staged too.

**Focus Time (1.0)** has two modes:
- *Proactive*: a weekly goal with ideal and max hours per day and min/max block length. It fills the calendar ahead of time.
- *Reactive*: it only books blocks when you're "at risk of missing that minimum" and keeps you open for meetings otherwise.

If you move a Focus block, it locks. If you delete one, Reclaim treats that as a skip and does not refill it. Optional auto-decline applies.

**Buffers**: travel time before and after events with a location, decompression time after meetings (skipped if another event follows directly), and breaks between Tasks and Habits. Breaks are free space, not events.

**Smart Meetings and Smart 1:1s**: recurring meetings that float to the best mutual time each instance. Either side can reschedule or skip an instance. With no viable slot, the meeting stays at its ideal time with a ⚠️ rather than disappearing.

## 3. Other tools

**Clockwise.** Team-level optimizer. It moved meetings marked "flexible" to merge fragmented gaps into Focus Time, with per-user limits such as allowed windows and max moves per week. Third-party reviews say optimization ran in a daily batch around 4 pm. It only worked well with critical mass, since everyone on the team needed it. **Shut down 2026-03-27** as a Salesforce acqui-hire (Agentforce team). It gave a week's notice, removed all Smart Holds, stopped flexible meetings, and deleted user data. Lesson: a scheduler that writes into third-party calendars leaves debris when it dies.

**SkedPal.** The most configurable of these tools.
- **Time Maps** are named weekly availability templates (Work, Evenings, Deep Work, Weekends). Hours are colored **green, then yellow, then red**: green fills first, and yellow and red are used only when tasks won't fit by their deadline.
- A task can use the union or the intersection of several maps, and overlapping maps compete by priority. Time Maps use absolute times that ignore time zones.
- Recompute is a manual "Update Schedule". Pro adds an instant update for today only, after a 10 s delay.
- Tasks that can't meet their deadline are left off the schedule.
- It supports "immediately before/after" dependencies with fixed gaps, bundles (several tasks in one block), and repeat-N-days-after-completion.
- Default behavior front-loads the earliest slots. The planning window is 21 or 60 days.
- Pricing: $14.95/mo or $119/yr. Complaints: steep learning curve, scattered docs, and re-tuning maps every week is a chore. Users who stick with it love it.

**FlowSavvy.**
- Rebuilds the whole schedule on every edit by default, which can be switched to a manual "Recalculate" button. Vendor-measured runs take 1-3 s.
- Tasks that can't fit before the deadline are scheduled *after* it and colored red, configurable per task. Green, orange, and red colors show deadline proximity.
- Default load mode is **Balanced**: it spreads work across days instead of front-loading, so five things due Friday don't pile onto Thursday night. Front-load is an option.
- Has a free tier. Paid is $14/mo or $120/yr. Main weakness: the plan drifts when estimates are bad, and users hit Recalculate several times a day.

**Akiflow.** Manual-first. "Time Slots" are category containers you drop tasks into. The **Schedule Optimizer** shows a button only after you resize or drag a task into an overlap.
- Clicking it reflows only the tasks *after* the changed one, keeping their order, with an Undo toast. Ignoring it makes the button disappear and your manual change stands.
- Events, Time Slots, recurring instances, earlier tasks, and completed tasks never move.
- "ASAP" puts one task into the first open slot today, previewing the time ("ASAP 2:30 PM").
- It never runs on its own and has no week planning, splitting, or priority reorder. This is the minimal-assist end of the spectrum, and it's well judged.

**Sunsama.** Built around a manual daily ritual: review yesterday, pull in tasks, run a **capacity check** that flags a 14 h plan in a 9 h day, timebox, then a shutdown review. "Auto-reschedule" shifts the rest of today's scheduled tasks when one runs long or finishes early. Per-channel working hours exist. In 2026 it added **Autoplan** (beta, LLM assistant "Sunny"). Each run ends in a review screen and briefing that says "what it didn't act on and why", with a receipt and one-click undo per change. A June 2026 bug fix is worth noting: iCloud-synced bookings were treated as free, so tasks were auto-scheduled on top of them.

**Morgen AI Planner.**
- **Frames** are recurring blocks with filters by tag, project, or source, such as "deep work" or "quick wins". Without Frames, timing "is unlikely to be ideal".
- The planner proposes 1-8 days, and the proposal pulses over Frames. You edit, then "Schedule all", or press Esc to discard. Nothing syncs until you accept.
- Removing a task backfills the gap. Dragging one in reshuffles the others inside the preview.
- For yesterday's unfinished tasks it asks: reschedule ASAP, rearrange, or unschedule.
- The "Priority Factor" decays for long-overdue tasks.
- It suggests an optional 20% buffer, citing the planning fallacy. `[30m]` tags in titles count as estimates.
- It only considers visible calendars. Morgen doesn't say whether the planner uses an LLM.

**Trevor AI.** Suggestion-only. Predicted durations and suggested blocks are not events until you click, one at a time or in bulk. Per-user models predict duration, day of week, and time of day from time-blocking history. It offers "Adaptive AI" or "Simple" (priority plus due date) strategies. About $5/mo.

**TickTick vs Reclaim habits.** TickTick tracks: check-offs, streaks, charts, any frequency, 5 habits free, about $36/yr. It never decides *when*. Reclaim schedules a window-bound flexible block and doesn't care much about streaks. The product we're designing needs both: a habit is a schedulable flexible block *and* a tracked check-off with a streak.

**Open source and clones.**
- *FluidCalendar* (MIT, Next.js/Prisma) is an explicit Motion alternative. It uses "priority-first greedy … with constraint satisfaction" and scores slots by work hours, buffers, time-of-day preference, and grouping similar tasks. The author: optimal is NP-hard, and heuristics are "good enough… computable in milliseconds." Google Calendar is polled every 15 min.
- *SelfPlanner* (academic, see §4) is the closest documented design.
- Google's *Timeful* became *Google Calendar Goals* in 2016: you answer "how often, best time", it finds slots, re-finds them on conflict, and learns better times from deferrals. This was early "light ML" placement.

---

## 4. What makes schedulers loved vs hated

**Loved**
- It replans missed work for you. HN, 2018: "I wish… the calendar [would] automatically reflow around my tasks/events in case I miss something." ADHD and time-blind users find this life-changing.
- Deadline risk shows up early. Motion's orange/red ETA and FlowSavvy's colors tell you *before* the miss.
- Habits flex inside a window with an ideal time, so lunch and gym survive meeting creep.
- Low setup at the start, as with FlowSavvy and Reclaim defaults.
- A plan you can execute without opening the app (Reclaim's founder on HN).

**Hated**
- **Churn**: blocks move many times per day, and you can't predict your afternoon.
- **Manual moves undone**: the scheduler overrides a user's drag.
- **Silent moves**: something lands on Saturday, outside the expected window, and you never got told.
- **Correctness bugs**: placing over busy events. Usually this is a sync or free/busy interpretation bug (Motion 2026, Sunsama iCloud 2026). One of these destroys trust faster than any bad heuristic.
- **Mandatory fields**: "no duration means never scheduled" without an obvious signal.
- **Book-keeping tax**: undone tasks keep reappearing if you forget to mark them done.
- **Config debt**: SkedPal-style maps need weekly upkeep.
- **Opaque decisions**: no answer to "why is this here?"
- **Price and billing**: Motion at $29-49/mo solo, plus dark-pattern trials.

**Design choices that separate them**

| Choice | Helpful default | Annoying default |
|---|---|---|
| Trigger | Run on change, but only re-place what's affected, plus a manual "Replan" | Global reshuffle on every change |
| Near term | Freeze the next N hours. Today's plan only changes on conflict | Today rearranges whenever a meeting lands next week |
| User moves | Drag = pin. Show the pin. Unpin is one click | Drag is a hint the solver may ignore |
| Late work | Keep it visible and red, and ask: push, shrink, drop | Silently roll it forward, or silently drop it |
| Load shape | Balanced across days, with front-load opt-in | Pack everything ASAP, then a sudden crunch |
| Out-of-hours | Never, unless the user opts in per task | Hard deadline quietly spills into evenings or weekends |
| Calendar writes | Write blocks to the local calendar. Mirror to Google as optional busy holds | Fill a shared work calendar with dozens of moving events |
| Setup | Works with working hours plus defaults. Time maps are optional and come later | Required maps or frames before anything is scheduled |

---

## 5. Algorithm options

### Problem shape
- **Single resource** (one person) with discrete time. 15-minute slots are standard: Reclaim uses 15, and 5 is fine too.
- **Fixed blocks**: events, pinned tasks, locked habits.
- **Flexible items**:
  - Tasks: remaining duration, min/max chunk, earliest start, due date (hard or soft), priority, allowed schedule or "time map" with preference tiers, dependencies, energy tag.
  - Habits: per-day or per-week occurrences, window, ideal time, min/max duration.
- **Soft goals**: preferred times, energy matching, buffers, spacing chunks out, balancing load, stability against the last plan, minimal context switching.
- The horizon is small: one person, 1-4 weeks, roughly 50-300 flexible items, 2-4k slots. Every method below handles that size. What separates them is stability, explainability, and engineering cost.

### Classical results worth knowing
- **EDF / Jackson's rule**: earliest due date first minimizes maximum lateness on one machine. With preemption, which here means splitting into chunks, EDF is optimal for feasibility. The **demand check** follows: for every deadline d, the remaining work due by d must be ≤ the free capacity up to d. That gives an exact, explainable at-risk test with no solver.
- **Least slack first**: slack = capacity in the task's own allowed windows before its due date, minus remaining work. It beats plain EDF when tasks have different allowed windows (work vs personal hours, time maps). This is the right ordering key.
- **Moore-Hodgson**: minimizes the *number* of late tasks when overloaded. It's useful for deciding which tasks to flag as "won't make it" rather than smearing lateness across everything.
- **Interval scheduling / weighted interval scheduling**: relevant when choosing among competing optional items, such as low-priority habits, for a fixed window.

### Option A: greedy with slot scoring (recommended v1)
1. Build an availability bitmap per schedule or time map, with preference tiers green/yellow/red as in SkedPal. Subtract busy events, pinned items, buffers around meetings, and items frozen in the near-term window.
2. Place fixed-ish items first: habits with Critical priority, then items with hard deadlines.
3. Order the rest by (pinned/ASAP, hard deadline slack, priority, soft due, stable id). Respect dependencies with a topological order: a task's earliest start becomes the max of its blockers' planned ends.
4. For each item, enumerate candidate chunk placements in its window and score them.

   `cost = lateness·W_late + tier_penalty + |start − ideal|·W_ideal + energy_mismatch + fragmentation (leftover gap < min chunk) + day_load_imbalance + context_switch + moved_from_previous·W_stab`

   Take the lowest cost and write it into the bitmap. Chunking means repeating step 4 until the remaining duration is 0 or no slot ≥ min chunk is left. Use max chunk to spread work out, as Reclaim does.
5. Anything unplaced goes to "Couldn't fit" with a reason code. Anything placed past due is marked red. Never place silently outside allowed hours.

Properties: about 1-20 ms in Swift or TS for this size, fully deterministic given a stable tie-break, and easy to explain because every decision is a local argmin with named terms. It's weak on global trade-offs, e.g. placing task A early blocks B's only window. Mitigate that with slack ordering plus a cheap repair pass: when an item fails, try swapping it with lower-priority placed items in its window. This is the "squeaky wheel" idea SelfPlanner uses.

### Option B: local search / LNS on top of greedy (v2)
Start from the greedy plan. Run moves (shift a chunk, swap two chunks, merge or split chunks, move a habit within its window) under a time budget of 50-300 ms, using hill climbing or simulated annealing with a fixed seed. Large Neighborhood Search works well here: unassign one day, or every item touching a changed event, and re-insert greedily. It stays in-language with no native dependency, it's deterministic with a seeded RNG, and you keep the scoring function from v1. Alexiadis & Refanidis published exactly this for SelfPlanner ("Optimizing individual activity personal plans through local search"). Timefold/OptaPlanner is the industrial version of the same approach: construction heuristic, then local search, with `@PlanningPin` for pinned entities and a "minimize disruption" soft constraint for replanning. It's on the JVM (Apache-2.0 community edition), and the Python version is "significantly slower". That's a poor fit to embed in a Mac app, but its docs on pinning and non-disruptive replanning are the best design reference.

### Option C: CP-SAT (OR-Tools)
- **Model**: one optional interval per chunk (`new_optional_interval_var`), with start domains restricted to allowed windows via `Domain.from_intervals`. Add `add_no_overlap` over all present intervals plus fixed intervals for events. Duration sums per task go in as linear constraints, hard deadlines as bounds, and dependencies as end ≤ start. The objective is weighted lateness, preference penalties, and a **churn term** (|start − previous start|, or a Boolean "moved" per chunk).
- **Pros**: global optimality or bounds, and declarative constraints, so adding a rule is cheap.
- **Cons**:
  - Native C++ dependency with no Swift bindings. The route is the C API `SolveCpModelWithParameters` (serialized protos, used by the Rust and Go wrappers) or a community WASM build (`or-tools-wasm`). Google calls emscripten "low priority".
  - Determinism needs `num_workers=1`, or `interleave_search` with a fixed batch size, a fixed `random_seed`, and `max_deterministic_time` instead of wall-clock limits. A CP-SAT version once regressed determinism even single-threaded (issue #3590).
  - Explanations are harder, because "the solver chose it" is not a reason.
  - The CP-SAT Primer itself warns against reaching for intervals first. With discrete slots, Booleans per (chunk, slot) can be faster, and no-overlap performance has varied a lot across versions.
- **Use it if**: dependency chains, team scheduling, or many interacting hard constraints show up. Seed it with the greedy plan as a hint.

### Option D: MIP (HiGHS, CBC, Gurobi)
Time-indexed binaries x[task, slot] with linear soft costs. It's clean for "assign chunks to slots" and HiGHS is MIT-licensed and embeddable. Disjunctive no-overlap and min-chunk contiguity make the model big. CP-SAT usually beats MIP on this structure. Only worth it if the team already knows MIP.

### Stability (minimizing churn)
Churn is the top complaint against Motion. Treat it as a first-class part of the objective, not a side effect:
- **Frozen window**: never move anything starting within the next 60-120 min, or anything today, unless it conflicts with a hard block. Timefold calls this the "published" vs "draft" period in continuous planning.
- **Stickiness**: add W_stab·moved to the cost, and only re-place an item if the improvement beats a threshold (hysteresis). This is the minimal perturbation problem; see Probe Backtrack (Sakkout & Wallace), UniTime MPP, and Zweben's iterative repair.
- **Local repair first**: on a new event, unplace only the items it overlaps plus same-day dependents, and re-insert them. Fall back to a full replan only on explicit request or overnight.
- **Determinism**: stable sort keys (id as final tie-break), seeded RNG, and no wall-clock limits that change the result. The same inputs must give the same plan, so snapshot tests can catch regressions.
- **Batch triggers**: debounce sync events (Reclaim reacts in about 15 s) so a burst of calendar edits causes one replan.

### Explainability
Record a reason trace per placement, built from the scoring terms:
- "Earliest green slot in *Deep Work* after start date Tue; due Thu 17:00; 3h40 slack."
- "Moved from 14:00: 'Design review' added 09:12."
- "Not scheduled: needs 2h block, largest free gap before due is 1h30."

Greedy and local search make this cheap. With CP-SAT you can still explain by diffing against the previous plan and by naming the binding constraints, e.g. "every slot before Thu is occupied by higher-priority items: A, B, C."

### Soft-constraint checklist (v1 scope)
- Preferred times: time maps with green/yellow/red tiers, plus a per-item ideal time with a distance penalty, as Reclaim habits do.
- Energy: tag tasks high, low, or admin and tag hours by energy. Mismatch is a soft penalty.
- Splitting: min chunk (hard), max chunk (spread), "no split" flag, and at most one chunk per task per day as a soft rule.
- Buffers: before and after meetings (soft, or hard for travel), and breaks after N minutes of continuous task time (Motion's "15 min every 2 h").
- Dependencies: hard ordering, plus optional fixed gaps (SkedPal).
- Pinned or locked: a drag pins. Pinned items are fixed obstacles. Recurring events are fixed.
- Habits: window, ideal time, min/max duration, N per week, priority, skip if no room, then report the skip.
- Overflow policy per task: schedule late (red), leave unscheduled, or allow out-of-hours. The default is "schedule late, red, ask".

### Light ML (no LLM)
- **Duration calibration**: log ratio r = log(actual/estimate) per tag or project. Keep a shrunk mean, a Bayesian average with a prior of 0 and about 5 pseudo-observations, and use exp(mean) as the multiplier. Plan with the median and run the at-risk check with P80. White & Awadallah (MSR, WSDM 2019) predicted durations from calendar data at about 80% multiclass accuracy using subject, context, and history. The planning fallacy (Buehler et al. 1994) explains why a systematic multiplier helps. Morgen's 20% buffer is the crude version. Actuals come from start/stop or from completion time minus block start.
- **Preferred times**: per tag, keep counts of completions and manual drags per hour-of-week bucket with Beta-Binomial smoothing, then turn them into tier suggestions ("You usually do writing 9-11. Make it green?"). Suggest changes to user-visible settings rather than silently changing weights, so the user can still read and explain the model.
- **Learn from overrides**: every manual drag is a labeled preference (A rejected, B chosen). Even a simple counter of drag-away hours gives a penalty map. Trevor and FluidCalendar claim to do this. Google Calendar Goals (Timeful) learned from deferrals.
- **Skip prediction for habits**: P(complete | hour, weekday) from history. Place habits in high-probability windows.

### Recommendation

**v1 (ship).**
- Engine: greedy ordered by slack, slot scoring, local repair, frozen window, stickiness, an EDF demand check for at-risk warnings, and reason codes. Pure Swift or TS, so it runs on device in milliseconds with no native solver.
- Data model: the scheduler is a pure function `plan(inputs, previousPlan, now) → (placements, unplaced, risks, reasons)`, so it can be snapshot-tested.
- 15-min slots, 2-4 week horizon.
- Habits are first-class: flexible recurring blocks plus check-off tracking.

**v1.5.**
- Duration calibration multipliers.
- "Balanced vs front-load" setting.
- Learned time-of-day suggestions.

**v2.**
- Local-search or LNS improvement pass behind "Optimize week". Same scoring function, seeded, 100-300 ms.
- Add CP-SAT through the C API only if dependency-heavy projects or multi-person scheduling become core. Keep greedy as the fallback and the hint.

---

## 6. Trust and control UX patterns

**Proposal before commit.**
- Reclaim 2.0 Preview Mode: staged changes, then Review & apply or Discard. Attendees aren't notified until you apply.
- Morgen: the proposal pulses over Frames, and "Schedule all" or Esc decides.
- Trevor: suggestions are not events until clicked.

For us: show **ghost blocks** and a **diff list** ("3 moved, 1 added, 1 can't fit"). Accept all, accept per item, or discard.

**Two modes, with the user choosing per scope.**
- *Continuous* for today's local repairs only: a conflict appears, the affected item moves, and a toast with Undo shows.
- *Explicit* for bigger replans: a "Plan my day" or "Plan this week" button, plus a morning or Sunday ritual with a Sunsama-style capacity check before it fills the calendar. FlowSavvy's auto-recalculate toggle shows users want this choice.

**Contextual optimize.** Akiflow shows "Optimize schedule" only after a manual change creates an overlap. It reflows only what's after the change, and an ignored button disappears without side effects. Good model for "assist without taking over".

**Pins are visible and cheap.** Dragging pins the item and shows a lock. Unpin from the context menu. Motion turns drags into locks, which is right, but its "unlock after 60 min if not done" rule is a surprise. Make that explicit instead, e.g. "Missed. Re-plan?"

**"Why is this here?"** Clicking a block shows the reason trace: due date, slack, which time map tier, what displaced it, and the last move with its cause. Motion's ETA hover, which shows cause and suggested fixes, is the closest shipped version.

**At-risk warnings before the miss.**
- Per task: green, amber, red ETA (Motion, FlowSavvy).
- Per day and week: an overload bar from the EDF demand check ("Thursday: 7h of work, 4h free").
- Offer fixes ranked by cost: extend hours today, push X (low priority), split Y, drop habit Z this week.

**Late and unschedulable work stays visible.** A "Couldn't fit" tray with the specific reason (Motion's pinned tray, SkedPal's central view, Morgen's side list). Never silently drop or bury it.

**Habits degrade gracefully.** Shrink to min duration, then move within the window, then skip with a note ("Gym skipped Wed: no 45-min gap 6-9pm"). Reclaim's free-to-busy defense matters if blocks are mirrored to a shared work calendar: keep them free until they're at risk, then flip to busy.

**Change log and undo.** Every automatic move is logged with its cause, and there's a per-run undo, as Sunsama receipts do. A daily "what moved overnight" summary removes the "pushed to Saturday without noticing" surprise.

**Boundaries the scheduler never crosses without asking.** Outside working hours, weekends, pinned items, events, and anything inside the frozen window.

---

## Sources

Motion
- https://www.usemotion.com/help/time-management/auto-scheduling
- https://www.usemotion.com/help/time-management/auto-scheduling/reference-auto-scheduling/what-auto-scheduling-considers
- https://www.usemotion.com/help/time-management/auto-scheduling/reference-auto-scheduling/how-auto-scheduling-works-behind-the-scenes
- https://www.usemotion.com/help/time-management/auto-scheduling/auto-scheduling-how-to-guide
- https://www.usemotion.com/help/project-management/task/task-scheduling-faq
- https://www.usemotion.com/help/project-management/task/reference-tasks/task-states-and-task-types
- https://www.usemotion.com/blog/etas
- https://www.usemotion.com/pricing
- https://www.usecarly.com/blog/motion-ai-review/ (competitor-written, 2026-09-28; quotes App Store and r/UseMotion)
- https://finance.yahoo.com/news/y-combinator-backed-motion-raises-150000121.html (TechCrunch, Sep 2025)
- https://www.usagepricing.com/blueprint/motion (pricing history)
- https://getdailytoolbox.com/productivity/motion-vs-reclaim-ai/ (churn anecdote)
- HN comments 44391813, 42274875 (https://news.ycombinator.com/item?id=42274875)

Reclaim
- https://help.reclaim.ai/en/articles/6207587-how-reclaim-manages-your-schedule-automatically
- https://help.reclaim.ai/en/articles/4129286-prioritizing-your-habits
- https://help.reclaim.ai/en/articles/4129290-time-defense-settings-for-habits
- https://help.reclaim.ai/en/articles/4129152-habits-overview-auto-schedule-flexible-time-for-your-routines
- https://help.reclaim.ai/en/articles/5108936-overview-what-reclaim-tasks-are-and-how-to-create-and-use-them
- https://help.reclaim.ai/en/articles/6332766-use-focus-time-to-defend-time-for-productive-work
- https://help.reclaim.ai/en/articles/4281992-buffer-time-overview-travel-decompression-and-tasks-habit-breaks
- https://help.reclaim.ai/en/articles/17438753-switching-from-reclaim-1-0-to-2-0
- https://help.reclaim.ai/en/articles/15280604-reclaim-2-0-faq
- https://help.reclaim.ai/en/articles/11887122-adjusting-your-scheduling-window-for-reclaim-events
- https://reclaim.ai/blog/dropbox-acquires-reclaim
- https://www.marketscreener.com/quote/stock/DROPBOX-INC-45013534/news/Dropbox-Inc-acquired-Reclaim-ai-Inc-for-40-2-million-47716890/
- https://reclaim.ai/blog/habits-vs-tasks
- https://www.morgen.so/blog-posts/reclaim-pricing (third-party pricing)
- HN comment 23133168 (free-block weakness), https://news.ycombinator.com/item?id=23133168

Others
- https://temporal.day/blog/clockwise-shutting-down-alternatives ; https://www.usecarly.com/blog/clockwise-shut-down/ (Clockwise shutdown)
- https://docs.skedpal.com/time-maps/introduction-to-time-maps
- https://flowsavvy.app/flowsavvy-vs-skedpal (vendor-written)
- https://product.akiflow.com/en/help/articles/3161671-schedule-optimizer
- https://product.akiflow.com/en/help/articles/3089241-time-slots
- https://roadmap.sunsama.com/changelog (Autoplan, Sep-Oct 2026)
- https://roadmap.sunsama.com/changelog/auto-reschedule
- https://www.morgen.so/guides/plan-your-day-using-the-ai-planner
- https://www.trevorai.com/docs
- https://github.com/dotnetfactory/fluid-calendar ; https://www.emadibrahim.com/fluidcalendar
- https://techcrunch.com/2016/04/12/google-calendar-goals/ (Timeful, then Goals)
- https://www.saashub.com/compare-habits-by-reclaim-ai-vs-ticktick
- HN comment 39765528 (timeboxing as category fill and spill)

Algorithms and papers
- Refanidis & Yorke-Smith, "A Constraint-Based Approach to Scheduling an Individual's Activities", ACM TIST 2010. https://homepage.tudelft.nl/0p6y8/papers/n82.pdf
- Alexiadis & Refanidis, "Optimizing individual activity personal plans through local search", AI Communications. https://journals.sagepub.com/doi/abs/10.3233/AIC-150680
- Sakkout & Wallace, "Probe Backtrack Search for Minimal Perturbation in Dynamic Scheduling", Constraints 2000. https://link.springer.com/article/10.1023/A:1009856210543
- Müller, Rudová, Barták, "Minimal Perturbation Problem in Course Timetabling", PATAT 2004/05. https://www.unitime.org/papers/patat05.pdf
- Zweben et al., "Rescheduling with Iterative Repair", AAAI 1992 SS. https://aaai.org/papers/0020-ss92-01-020-rescheduling-with-iterative-repair/
- White & Awadallah, "Task Duration Estimation", WSDM 2019. https://www.microsoft.com/en-us/research/uploads/prod/2019/01/TaskDuration-WSDM2019.pdf
- Buehler, Griffin, Ross, "Exploring the planning fallacy", JPSP 67(3), 1994. https://doi.org/10.1037/0022-3514.67.3.366
- CP-SAT Primer, advanced modelling (intervals, no-overlap, resolution caveats). https://d-krupke.github.io/cpsat-primer/advanced_modelling.html
- CP-SAT Primer, parameters (determinism, hints). https://d-krupke.github.io/cpsat-primer/parameters.html
- OR-Tools determinism issue. https://github.com/google/or-tools/issues/3590
- OR-Tools WASM. https://github.com/Axelwickm/or-tools-wasm ; C API via Rust wrapper https://github.com/moorbrook/cpsat-rs
- Timefold: responding to change, pinning, real-time replanning. https://docs.timefold.ai/timefold-solver/1.x/responding-to-change/responding-to-change ; https://docs.timefold.ai/timefold-solver/latest/domain-modeling/modeling-planning-problems ; https://docs.timefold.ai/timefold-platform/latest/guides/responding-to-disruptions-with-real-time-replanning
- Timefold Python (Apache-2.0, slower than JVM). https://github.com/TimefoldAI/timefold-solver-python

Caveats: no vendor documents its actual algorithm. Statements about how Motion and Reclaim work internally are inferred from help docs. Clockwise's 4 pm batch and "millions of permutations" come from third-party reviews. Reddit was not searchable directly, so Reddit quotes come secondhand through review articles.
