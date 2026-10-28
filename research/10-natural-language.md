# 10: Natural-language Quick Entry for events and tasks

Researched 2026-10-28. Scope: one text field that creates calendar events (written to device calendars through EventKit / expo-calendar) and Things-style tasks. It parses on the device, deterministically, on every keystroke, and highlights the parsed tokens live. It must run as pure TypeScript in Electron and in Hermes. No LLM.

How to read this:
- App behavior comes from each vendor's help pages unless marked otherwise. Several of those pages show examples without stating rules, so "the docs show X" does not mean "X is the rule".
- **[unverified]** means only a secondary source supports it, or I'm working from memory.
- **[measured]** means I ran it on 2026-10-28 against the versions named, with `TZ=America/Los_Angeles` and reference time Wed 2026-10-28 10:40. The scripts lived in `/tmp`, outside the repo.
- **[inference]** means my own reasoning.
- Package versions and sizes come from the npm registry and GitHub API on 2026-10-28. Bundle sizes come from `bun build --minify --target browser` of a one-line import.

---

## TL;DR

- Everyone converges on the same shape. You type a sentence, the recognized pieces light up, and you click a piece to turn it back into plain text. Todoist and TickTick document click-to-revert. Fantastical documents quoting to escape. Nobody documents a confidence model. They all parse greedily and rely on the undo.
- Event/task choice is explicit almost everywhere. Fantastical defaults to event and switches on a leading `task`/`todo`/`reminder` keyword or a toggle. Morgen switches on a leading `task`. Todoist, TickTick and Things only make tasks. No vendor documents inferring the mode from content. Cal can do better here, because it knows which tokens only make sense for one kind.
- chrono-node is still the right date/time engine (MIT, released 2026-10-12, about 13.5 KB gzipped for English). Out of the box it gets these wrong [measured]:
  - `for 1h` becomes "an hour from now"
  - `at 5` becomes 5 AM
  - `March for Science` becomes March 1
  - `Sunday school` becomes Sunday
  - `every Monday` loses the "every"
  - `2p`, `7-9`, `tue 8` and `the 15th` aren't recognized
  - `PST` is applied as a fixed -08:00 during PDT
  - mixed-zone ranges land on a past date
  - `next week` / `in 2 weeks` drift an hour across the Nov 1 DST change.

  Today's `packages/nlp` inherits all of these. "Deep work for 1h" currently gets start_at 11:40 today [measured].
- No library parses recurrence out of a sentence well enough. rrule.js `fromText` wants the whole string to be a rule. It fails on "every other week", "weekdays" and "first Friday of each month", and it silently turns "daily until Dec" into a yearly rule [measured]. compromise-dates finds more but is 195 KB gzipped and gets common cases wrong. Cal should write its own small recurrence grammar that emits RRULE strings.
- EventKit cannot add attendees. `EKCalendarItem.attendees` is get-only. "with sam@x.com" can be parsed but not acted on for device calendars. Recurrence, alarms, URL, location, all-day and time zone all map cleanly.
- The recommendation is a multi-pass tokenizer over a masked copy of the input. Sigils go first, then recurrence, keyword phrases, chrono for dates and times, then location and attendees. Each token carries a span, a value, a confidence and alternatives. A pure `parse(text, context, literals)` drives both the highlighting and the unparse. Section "Recommendation for Cal" has the design and 55 test cases.

---

## 1. What the apps support

### 1.1 Fantastical (Flexibits)

From the Mac help page "Adding events and tasks" and the Tips page:

- **Mode.** "Fantastical will automatically create an event when you begin typing a sentence." Start with `reminder`, `todo`, `task` or `√` (⌥V) to make a task, or use the toggle at the top right. ⌘K toggles event/reminder while creating.
- **Calendar or list.** `/` plus a prefix: "/h would switch to your calendar named Home and /w would switch to your Work calendar". Four spaces then the prefix also works (Tips page).
- **Invitees.** "with" plus the start of a contact name. The 2021 invites blog post says that as soon as you type "with", Fantastical assumes an invite.
- **Location.** "at" plus a place. Previous and suggested locations are offered.
- **Priority (tasks).** Trailing exclamation marks: "More exclamation points will increase the priority."
- **Escaping.** Quote the text: `"Prepare for Wacky Wednesday" on Tuesday at 9pm`.
- **Documented examples** (verbatim, the only spec there is):
  - `Grocery shopping at Wegmans Thursday at 5pm`
  - `Soccer practice every Tuesday with John at 6pm`
  - `Family vacation from August 9-18`
  - `Sam's birthday every year on 5/16`
  - `Piano lessons Tuesdays and Thursdays at 5-6pm from 1/21 to 2/23`
  - `Lunch every Tuesday until 2/5`
  - `task Final project due August 15`
  - `todo Finish important task by Thursday!!!`
  - `Haircut tomorrow at Quick Cuts 10am alert 30 minutes`
  - `Important meeting at 2pm on Tuesday /work`
  - `Staff meeting Tuesday 2pm alert 20 min`
  - `Pizza party on the 2nd Friday of every month at 1pm`
  - `Flight 593 on Monday 3pm EST to 6pm PST`
  - `Lunch with Matthew at 123 Main St at 1:30 Monday`
- MacStories adds `Coffee with Chris tomorrow from 6 to 7` and `Genius Bar tomorrow at 5 for 30 minutes` [secondary].
- **Video calls.** The conference-call help page says you add Zoom/Teams/Meet/Webex from the event details checkbox, not by typing. I found no parser keyword for it.
- **Automation.** `x-fantastical://parse?sentence=...` takes the same sentence, plus `task=1`, `calendarName`, `start`/`end` (these also accept natural language).
- Not documented: all-day keyword, alerts in hours, duration rules, am/pm inference, how "next Friday" resolves. A 2026 third-party guide claims "every other Wednesday afternoon" and "first Monday of every month" work [unverified].

### 1.2 Todoist

From the Quick Add, dates, recurring dates, duration and smart-date-recognition help pages:

- **Sigils.**
  - `#Project`. It can create a project.
  - `/Section`. Needs a project first.
  - `%label`. `@label` "is planned to be retired by the end of 2026".
  - `p1`–`p3`. p4 is the default, so it means no priority.
  - `{march 30}` sets a deadline.
  - `!14:00` or `!30 min before` sets a reminder.
  - `+Lucile` assigns. Shared projects only.
- **Dates.**
  - Absolute dates: `jan 27`, `27 jan`, `27/1`, ISO forms, `27th`, `mid January` (Jan 15), `end of month`, `3rd friday jan`, `next year`.
  - Relative dates: `today`/`tod`, `tomorrow`/`tom`, `in 5 days` / `+5 days`, `in 3 weeks`, `next month` (same date), `someday` (two months out), `later this week`, `this weekend` (Saturday), `next weekend` ("the second-next Saturday to occur").
  - Offsets from a date: `50 days before new year's eve`, `28 days after 21 July`.
  - `no date` clears the date.
- **Times.**
  - `Fri 7pm`, `Fri at 1900`, `tomorrow at 16:00`.
  - "today at 10" is read as 10 AM.
  - "6pm" means today unless 6pm has passed, then tomorrow.
  - `in the morning` 9 AM, `afternoon` 12 PM, `evening` 7 PM, `tom night` 10 PM.
- **Weekdays.**
  - "Friday" means the nearest upcoming Friday.
  - "next Friday" means "the second Friday to occur". The doc's example: on Monday Oct 20, "next Tuesday" is Oct 28.
  - The same page also says a passed weekday means "the next upcoming occurrence", which contradicts itself a little.
  - `next week` defaults to the coming Monday. This is a setting.
- **Recurrence.**
  - Simple frequencies: `every day`/`daily`, `every week`/`weekly`, `every quarter`, `every 3 months`, `every 12 days`, `every other week`, `every other fri` (starts on the *second* Friday from now).
  - Weekday patterns: `every weekday`/`every workday`, `every mon, fri`, `every 3 workday`, `every last workday at 3pm`, `every 1st wed jan, 3rd thu jul`.
  - Days of the month: `every 2, 15, 27`. Yearly dates: `every 14 jan, 14 apr`. Holidays: `every halloween`.
  - Hourly: `every hour`, `every 12 hours starting at 9pm`.
  - Bounds: `starting aug 3` / `from aug 3`, `until aug 3` / `ending aug 3` (inclusive), `everyday for 3 weeks`.
  - `every!` repeats from the completion date. `after 10 days` becomes `every! 10 days`.
  - One rule can't mix different times on different days. A new recurring task starts today unless you give a start.
- **Duration.**
  - `for 45m`, `for 1h15m`. The current page allows a duration without a date ("Write paper for 1h").
  - The glossary still says it needs a date and time, so the docs disagree. Max 24 h.
- **Misparse handling.** "Click or tap the word to turn it into plain text." The doc's own example is "monthly" in "Create monthly report". A global setting turns smart date recognition off. Then dates only come from the scheduler. No escape character is documented.

### 1.3 Things 3

- Natural language lives **only in the When, Deadline and Reminder fields**, never in the title (article 9780167). On Mac, ⌘S opens When and ⇧⌘D opens Deadline. You type into the popover.
- Examples:
  - `tod`
  - `10-3` (region-ordered date)
  - `10-3 9`
  - `2p` (2 PM reminder)
  - `17d`
  - `17d from jul9` / `jul9 + 17d`
  - `3rd wed jul`
  - `last fri jul`
  - `tues 8am`

  Units are `d`, `w`, `mo`, `y`, and partial words are fine. It works in 8 languages.
- Reminders attach to the start date, never the deadline.
- This Evening, Someday and Anytime are When values, not dates. You can type them in the When popover, and release notes fix bugs in typing "This Evening". The URL scheme `when` accepts `today|tomorrow|evening|anytime|someday|<date>|<datetime>`.
- The tags popover autocompletes (⇧⌘T). It's type-ahead inside a popover, not inline parsing.

Things is the model for Cal's *data* (When vs Deadline, This Evening, Someday). It isn't the model for parsing.

### 1.4 TickTick

TickTick's help center renders client-side and I couldn't fetch it. These points come from search excerpts and 02-tasks.md.
- "Smart Recognition" finds dates, times and repeats in the title and sets a reminder. A setting removes the matched text from the title.
- Tapping the highlighted text reverts it.
- Sigils: `#tag` (official), `~list` (older `^list`), `!priority`, `*date`, `@user` [unverified, blogs].
- 2026 reviews say TickTick needs more exact phrasing than Todoist [unverified].

### 1.5 Morgen, Amie, Notion Calendar

- **Morgen command bar (⌃K).**
  - Example: "Meeting with Amit at 3 pm at 11 City Diner in Chicago" parses time, location and invitee.
  - Sigils: `;location`, `/calendar`, `@invitee`, `>task list`, `!priority`.
  - Default event length 1 h. `for 2hours` changes it.
  - Typing `task ` at the start of a new calendar item turns it into a task.
- **Amie.**
  - Docs examples: "Call John tomorrow at 3pm for 30 min", "Review proposal Friday morning", "Team standup every weekday at 9am". It handles dates, times, durations and repeats for todos.
  - Reviews say an `@` before the date is accepted, and that some inputs get AI-estimated durations [unverified].
  - The NL features look partly AI-backed. That rules it out as a deterministic reference.
- **Notion Calendar.**
  - Since 2026-09-21: press Space in a new event and "describe the plan in one sentence". It fills title, time and participants. Desktop only.
  - Source: a third-party update tracker and our own 01-calendars.md. Notion's help pages don't describe it yet.
  - Whether it uses an LLM is not stated [unverified].
  - Notion Calendar's older `.` "go to date" takes natural language ("three months from now").

### 1.6 Apple Calendar, Reminders, Google Calendar

- **Apple Calendar (Mac).**
  - Create Quick Event examples: `Party Feb 6`, `Soccer Game on Saturday from 11am-1pm`, `Vacation in Bahamas Mon-Fri`. Month view: `Dinner at 6-7`. Spotlight: `Movie tonight at 7pm`.
  - Typing a time before the event name reuses a suggested event's details at the new time.
  - Defaults (duration, meal-word times) are not documented.
- **Apple Reminders (Mac).**
  - "Take Maris to choir practice every Wednesday at 5 p.m.", "Pay bills on Saturday". It shows a suggested date that you click to accept.
  - Locations come from a menu, not from parsing. iOS 26 added time zones per reminder.
- **Google Calendar.**
  - The web "Add title and time" box takes `Tennis practice at 5pm`, `Dinner at 7pm`. You pick the date by clicking the grid.
  - The API's `events.quickAdd` "Creates an event based on a simple text string" and documents nothing else.

### 1.7 Event phrase patterns across apps

| Pattern | Fantastical | Todoist (tasks) | Morgen | Apple Cal | chrono-node 2.10.3 [measured] |
|---|---|---|---|---|---|
| `tomorrow 1pm` | yes | yes | yes | yes | yes |
| `for 1h` / `for 30 minutes` | yes (MacStories) | yes (duration) | yes | not documented | **wrong**: read as "1 h from now" |
| `1-2pm`, `5-6pm` | yes | n/a | not documented | `11am-1pm`, `6-7` | `1-2pm` yes; `7-9`, `12-1`, `Fri 9-5` not found |
| `from 3 to 4:30` | `from 6 to 7` | n/a | not documented | not documented | found, but **3 AM–4:30 AM tomorrow** |
| all day | not documented | n/a (no time = all day) | not documented | date without time | no keyword |
| multi-day `Aug 9-18`, `Mon-Fri`, `Tue–Thu` | yes | n/a | not documented | yes | yes (en dash too) |
| location `at X` | yes | no | `;X` and "at X" | not documented | n/a |
| attendees `with X` | contacts | `+name` assigns | `@name` | Siri only | n/a |
| calendar `/work` | yes | `#project` | `/calendar` | no | n/a |
| alert `alert 30 minutes` | yes | `!30 min before` | not documented | no | n/a |
| recurrence `every …` | yes | yes (richest) | yes | no | no ("every" left in title) |
| time zone `3pm EST to 6pm PST` | yes | no | not documented | no | abbreviations yes, but fixed offsets; mixed-zone range broken |
| video link | no (checkbox) | no | not documented | no | n/a |

### 1.8 Task fields across apps

| Field | Things | Todoist | TickTick | Fantastical | Cal today (`packages/nlp`) |
|---|---|---|---|---|---|
| Start / When | When field, NL | date in title | date in title | date in title | chrono date |
| Deadline | separate field | `{date}` | none (due = date) | `due`/`by` (example only) | `!fri`, `!deadline nov 3` |
| This Evening / Someday | When values | `someday` = +2 months | no | no | `tonight`, `this evening`, `someday`, `anytime` |
| Priority | none | `p1`–`p3` | `!` | trailing `!!!` | `p1`–`p4` |
| Tags | popover | `%label` | `#tag` | no | not yet (PLAN says `#tag`) |
| Project/list | popover | `#Project`, `/Section` | `~list` | `/list` | `/prefix` |
| Estimate | none | `for 45m` | pomo count | no | `~45m` |
| Reminder | on When | `!time`, `!30 min before` | auto from time | `alert` | no |
| Recurrence | repeat dialog | `every`, `every!` | yes | `every` | no |

### 1.9 How each app decides event vs task

| App | Rule |
|---|---|
| Fantastical | Event by default. A leading `task`/`todo`/`reminder`/`√`, or the toggle (⌘K), makes a task. |
| Morgen | Command bar decides by context. In the calendar, a leading `task ` converts. |
| Notion Calendar | Events only. Tasks live in Notion databases. |
| Amie | Separate entry points (todo panel vs calendar) [unverified beyond docs]. |
| Todoist, TickTick, Things | Tasks only. A time makes a timed task, never an event. |
| Apple | Separate apps. |

Nobody infers mode from content. Cal has three surfaces: the grid, a task list, and the global Quick Entry. Content inference is a real improvement there, as long as the mode chip is always visible and flips with one key [inference].

---

## 2. Ambiguity rules

### 2.1 "at 5": am or pm

- **Todoist.** "today at 10" is 10 AM. A time that has passed today rolls to tomorrow. It documents nothing for 1–6 without am/pm.
- **chrono.** Bare hours are AM. The forward-date refiner then rolls them to tomorrow [measured]. So `Standup at 5` gives Thu 5:00 AM, `Pick up kids at 3` gives Thu 3:00 AM, and `today at 4` gives 4:00 AM, already past. Issue #250 (open since 2018) asks for casual words to imply meridiem. Issue #377 shows "at 5 health" parsed as 5 AM.
- **chrono's README.** It shows the fix directly, a refiner that sets PM for 1:00–4:00 when the meridiem isn't certain.
- **Cal rule [inference].**
  1. Explicit am/pm wins.
  2. Then a context word decides: `morning` → AM; `afternoon`/`evening`/`tonight` → PM.
  3. A tiny title list (`dinner`, `supper`, `drinks`) biases to PM.
  4. Otherwise 1–6 → PM, 7–11 → AM, 12 → noon.
  5. In a range, an explicit meridiem on one end carries to the other when that keeps start < end (`1-2pm` → 13–14). An end earlier than the start rolls past midnight (`9pm-1am`).
  6. With no date, a time already passed today moves to tomorrow (Todoist's rule).
  7. Every inferred meridiem gets confidence `guess` and the opposite reading as an alternative.

### 2.2 "Friday" when today is Friday, "this" and "next"

| Input | Todoist (docs) | chrono 2.10.3 `forwardDate` [measured] | Proposed for Cal |
|---|---|---|---|
| `Friday` on Wed Oct 28 | Oct 30 | Oct 30 | Oct 30 |
| `Wednesday` on Wed Oct 28 | "nearest upcoming" (today or +7: unclear) | Oct 28 (today) | today. If a time is given and has passed, +7 (`Wednesday 9am` → Nov 4; chrono agrees) |
| `next Friday` on Wed Oct 28 | Nov 6 (second to occur) | Nov 6 | Nov 6 |
| `next Friday` on Sat Oct 31 | Nov 13 (second to occur) | Nov 6 | Nov 6: "next" = that weekday in the next calendar week (week start from settings, Monday default) |
| `this Friday` on Sat Oct 31 | not documented | Nov 6 | Nov 6, flagged `guess` |
| `next week` | coming Monday (setting) | +7 days, and **9:40** across DST | Monday of next week, date only (Nov 2) |
| `in 2 weeks` | +14 days | Nov 11 **9:40** (DST drift) | Nov 11, date only |
| `this weekend` | Saturday | Sat Oct 31 | Sat Oct 31 |

chrono issue #484 (open) reports that a same-day weekday jumps a week under `forwardDate`. In 2.10.3 that only happens when a passed time is attached [measured]. Whatever the rule, the chip must show the resolved date ("Fri, Nov 6"), so a surprising "next" is visible before saving.

### 2.3 Date words inside titles

chrono 2.10.3 [measured]:
- `Buy May flowers` → nothing. Good.
- `March for Science on Saturday` → "March" (Mar 1 2027) **and** "on Saturday".
- `Sunday school` → Sunday.
- `Read chapter 3`, `Buy 2 apples`, `1:1 with Sam` → nothing. Good.
- `Room 101 at 3` → 3 AM.
- `Report Q4` → nothing.

Today's parser takes the first chrono hit, so `March for Science` becomes title "for Science" on 2027-03-01, and `Sunday school` becomes "school" [measured].

Todoist's answer is "click it to make it plain text". Fantastical's is quoting. Cal can avoid most of these with three deterministic rules [inference]:

1. **Weak dates.** A bare month name (no day number) or a bare weekday counts as a date only in two cases. It can have a lead word (`on`, `by`, `due`, `until`, `from`, `in`, `this`, `next`, `every`). Or it can sit in the *tail* of the input, meaning nothing but other tokens follows it. So `Sunday school` stays a title, `Review Friday` parses, and `March for Science` stays a title.
2. **Rightmost wins.** If two date phrases of the same kind compete, the rightmost one is applied and the others go back to title text. `Sunday school this Sunday 9am` keeps the title "Sunday school".
3. **Remembered literals.** When the user unparses a phrase, store the lowercased phrase with its neighbor word ("sunday school") in a local per-user list. Never parse it again. It stays on the device and is easy to inspect.

### 2.4 Escaping and undo

- Fantastical: wrap in double quotes. Todoist and TickTick: click or tap the highlight. Todoist also has a global off switch. Nobody documents backspace behavior.
- macOS autocorrect is the familiar keyboard model. The first Backspace right after an autocorrection reverts it. Cal can copy that.
  - Pressing Backspace while the caret sits at the end of a token that was *just* recognized unparses the token instead of deleting a character [inference].
  - Tab / ⇧Tab moves focus between token chips. Backspace or Delete on a focused chip unparses it.
  - Clicking a highlight unparses it.
  - Each of these adds the span to a `literals` list. Re-parsing treats literal spans like quoted text.

---

## 3. TypeScript libraries

### 3.1 chrono-node

- **Basics.** v2.10.3, published 2026-10-12. MIT, zero dependencies, 5.3k stars, last push 2026-10-12. Releases came out monthly through 2026, with DST resolution reworked in 2.10.0.
- **Size.** `chrono-node/en` minifies to 48 KB, 13.5 KB gzipped [measured].
- **Speed.** One parse of a 75-character Quick Entry string takes about 0.013 ms on Bun/JSC after warm-up [measured]. Hermes will be slower but still far under a frame [inference].
- **Pipeline.** Parsers (regex + extract) produce results. Refiners filter, merge and annotate them. `chrono.casual.clone()` gives a configuration you can push custom parsers and refiners onto (README).
- **Results.** Each result has `index`, `text`, `start`/`end` components, and `isCertain(component)`. That's enough for highlighting and for telling "user typed a time" from "implied noon".
- **Locales.** Full: en (plus en.GB day-first), ar, fi, fr, id, it, ja, nl, ru, uk, vi. Partial: de, es, pt, sv, zh.
- **Time zones.** `ParsingReference.timezone` takes an abbreviation or a minute offset, **not an IANA name**. The `timezones` option maps abbreviations to fixed or DST-aware offsets.
- **Hermes.**
  - Issues #483 and #527: the ru/uk parsers used `\p{L}` regexes that Hermes rejected.
  - 2.7.3 switched those to lazily built patterns. The maintainer notes ru/uk still don't work on Hermes.
  - Importing `chrono-node/en` avoids the problem entirely. The English bundle has no `\p{}`, lookbehind or named groups [measured by grepping the bundle].
- **Gaps that matter for Cal** [measured unless noted]:
  - **Durations.** `for 1h`, `for 30m`, `2 hours` and `for 90 min` come back as "now + duration" with every component marked certain. Duration parsing is issue #271, open since 2018. Durations must be masked before chrono runs.
  - **Recurrence.** Not supported. Issue #349 was closed and pointed people to other libraries. `every Monday` yields a one-off Monday, and `first Friday of each month` yields "Friday".
  - **Bare-hour ranges.** `7-9`, `12-1`, `Fri 9-5`, `tomorrow 1-2` aren't recognized. `1-2pm` and `9:00-10:30` are.
  - **Shorthand.** `2p`, `9a`, `tom`, `tues`, `1530`, `eod`, `the 15th`, `end of week`, `Halloween`, `Christmas` aren't recognized. `tmrw`, `Thurs`, `end of month` are.
  - **Meridiem.** See 2.1.
  - **Fixed zone offsets.** `3pm PST` on Oct 28 (a PDT date) is applied as -08:00, which gives 4 PM PDT. Issues #590 and #553 cover time-zone handling and are open.
  - **Mixed-zone ranges.** `Monday 3pm EST to 6pm PST` starts on Mon **Oct 26**, in the past. The same range without zones resolves to Nov 2.
  - **DST drift.** Relative day units drift across DST. `next week` / `in a week` / `in 2 weeks` come back at 9:40, not 10:40. The date is right, but the implied time shouldn't be used.
  - **Meridiem overrides.** `Thursday morning` → 6:00, `afternoon` → 15:00, `this evening` → 20:00, `tonight` → 22:00. These are chrono's choices. Todoist uses 9/12/19/22.

### 3.2 rrule.js (`rrule`)

- **Basics.** v2.8.1, published 2023-11-10. BSD-3-Clause, depends only on `tslib`. 3.7k stars. 218 open issues, last push 2024-06. Treat it as unmaintained but stable.
- **Size.** 47 KB minified, 13.6 KB gzipped. The NLP module isn't tree-shaken out.
- **Scope.** Full RFC 5545 expansion (RRule, RRuleSet, EXDATE), `toString()`, `toText()`.
- **`fromText`/`parseText`.** The README calls these "incomplete support… test them with your input". Results [measured]:

| Input | Result |
|---|---|
| `every Monday` | `FREQ=WEEKLY;BYDAY=MO` |
| `every 2 weeks` | `INTERVAL=2;FREQ=WEEKLY` |
| `every weekday` | `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| `every month on the first Friday` | `FREQ=MONTHLY;BYDAY=+1FR` |
| `every month on the last Friday` | `BYDAY=-1FR` |
| `every Tuesday and Thursday` | `BYDAY=TU,TH` |
| `every day for 3 times` | `COUNT=3` |
| `every Monday at 9am` | `BYHOUR=9` |
| `every other week` | throws "Unexpected end" |
| `every other Tuesday` | throws |
| `weekdays` | throws "expected every" |
| `first Friday of each month` | throws |
| `daily until Dec` | **silently returns an empty rule whose `toText()` is "every year"** |
| `every weekend` | `FREQ=WEEKLY` with no BYDAY (wrong) |

- **Why `fromText` doesn't fit.** It only accepts a string that *is* a rule, starting with "every". It can't find a rule inside a sentence or report a span, and it fails silently. `toText()` is decent for chip labels ("every 2 weeks on Tuesday") but English-only.

### 3.3 Other candidates

| Library | Version / date | License | Size | Verdict |
|---|---|---|---|---|
| `rrule-temporal` | 2.2.8, 2026-10-01 | MIT | 181 KB min / 52 KB gz (without a Temporal polyfill) [measured] | Maintained, RFC 5545 + RFC 7529, Temporal-based, `toText` in several languages, no text parsing. Needs `temporal-polyfill` (1.0.6, about 1 MB unpacked). I found no evidence Hermes ships Temporal. Callstack's Node-API post calls Temporal a future use [unverified]. Good choice later if Cal adopts Temporal. |
| `compromise` + `compromise-dates` | 14.19.0 / 3.10.0, 2026-10-18 | MIT | 508 KB min / 195 KB gz [measured] | Finds `every other week`, `every weekday until December`, `3 to 4:30`. But [measured]: `tomorrow 1pm for 1h` → null start; `first Friday of each month` → repeat `{"":1}`; `3pm PST` ignores the zone; `Standup at 5` → nothing; `Sunday school` → Sunday. Too big and too loose. |
| `sherlockjs` | 1.4.2, 2021-07-18 | MIT | 37 KB unpacked | Whole-sentence event parser (title, start, end, all-day). Abandoned since 2021, US-only, no spans. A useful design reference, nothing more. |
| `any-date-parser` | 2.2.4, 2026-08-25 | ISC | 116 KB unpacked | Parses a *whole* string as a date in any `Intl` locale. Doesn't extract from sentences. Could back the `.` go-to-date box; not Quick Entry. |
| `everwhen` | 0.3.0, 2026-06-22 | MIT | 203 KB unpacked + Luxon | New (0 stars). Whole-string EN/FR recurrence grammar ("every other tuesday", "first and third monday", "except weekends"). Computes occurrences but doesn't emit RRULE. Default zone Europe/Paris. Its grammar table is a good checklist for Cal's own grammar. |
| `date-fns` / `@date-fns/tz` | 4.4.0 / 1.5.0, 2026-05 | MIT | tree-shakable | No NL parsing. Handy for DST-safe `addDays`/`nextFriday`/`startOfWeek` in a zone. |
| `natural-date`, a "todoist parser" | none found on npm | | | No maintained Todoist-style quick-add parser exists on npm. |

### 3.4 Platform constraints that shape the grammar

From Apple's EventKit docs (JSON API, fetched 2026-10-28):
- **Attendees.** `EKCalendarItem.attendees` is `{ get }`. "This property is read-only; it is not possible to add attendees with Event Kit." Calendar.app adds invitees through private frameworks. Cal can't send invites to device calendars until it talks to Google/CalDAV directly.
- **Recurrence.** `EKRecurrenceRule` has frequency (daily/weekly/monthly/yearly; no hourly), interval, daysOfTheWeek (with week number, so `1FR`/`-1FR`), daysOfTheMonth, monthsOfTheYear, weeksOfTheYear, daysOfTheYear, setPositions, and an end (date or count). That covers every rule in the test table.
- **Alarms.** `EKAlarm(relativeOffset:)` / `(absoluteDate:)`.
- **Time zone and all-day.** `timeZone` nil means floating ("lunch at noon"). `isAllDay` exists. `EventInput` in `packages/calendar-source` doesn't carry recurrence, alarms, URL or time zone yet.
- **expo-calendar.** It exposes the same recurrence and alarm fields on iOS [unverified for the current SDK].

---

## 4. Proposed parser for Cal

### 4.1 Output shape

```ts
type Confidence = "certain" | "likely" | "guess";

// One recognized span of the input. The editor highlights it; clicking it adds the span to `literals`.
interface Token<K extends TokenKind = TokenKind> {
  kind: K;
  start: number;
  end: number; // UTF-16 offsets into the original text
  confidence: Confidence;
  label: string; // chip text, e.g. "Fri, Nov 6" or "every 2 weeks on Tue"
  alternatives?: string[]; // labels of other readings, e.g. ["9:00 PM today"]
  applied: boolean; // false for suggestions (weak dates mid-title) and duplicates that lost
}

interface Common {
  title: string;
  tokens: Token[];
  rrule?: string; // RFC 5545 body without "RRULE:", same convention as habits
}

type QuickEntry =
  | (Common & {
      kind: "event";
      allDay: boolean;
      start: string; // ISO with offset; all-day uses YYYY-MM-DD
      end: string; // exclusive for all-day
      timeZone?: string; // IANA; omitted = device zone
      calendarId?: string;
      location?: string;
      url?: string;
      attendees?: string[]; // emails; EventKit can't invite, so the app saves them to notes
      alertsMin?: number[]; // minutes before start
    })
  | (Common & {
      kind: "task";
      when?: "date" | "evening" | "someday" | "anytime";
      when_date?: DayKey;
      start_at?: string; // a time block start
      deadline?: DayKey;
      estimate_min?: number;
      priority?: 1 | 2 | 3 | 4;
      project_uuid?: string;
      tags?: string[];
      reminder_at?: string;
      repeat?: "fixed" | "after_completion";
    });

declare function parseQuickEntry(
  text: string,
  context: {
    now: Date;
    surface: "quick" | "grid" | "list";
    calendars: readonly { id: string; title: string }[];
    projects: readonly { uuid: string; title: string }[];
    tags: readonly string[];
    literals?: readonly { start: number; end: number }[];
    settings?: { weekStartsOn: 0 | 1; defaultEventMin: number; dayBand: [number, number] };
  },
): QuickEntry;
```

### 4.2 Token kinds and syntax

| Kind | Syntax | Value | Mode signal |
|---|---|---|---|
| `mode` | leading `task `, `todo `, `reminder `, `event ` | forces kind | explicit |
| `when` | chrono dates and times plus Cal's parsers: `2p`, `9a`, `tom`, `tues`, `the 15th`, `end of week`, `mid January`; weak-date rule (2.3) | date and/or time | none |
| `time_range` | `1-2pm`, `from 3 to 4:30`, `12:30-1:30`, `9pm-1am`, `9-11:30` after a date or at the tail | start, end | event |
| `date_range` | `Aug 9-18`, `Tue–Thu`, `Thursday until Sunday`, `Nov 20 8am to Nov 22 6pm` | start, end (all-day if no times) | event |
| `all_day` | `all day`, `all-day` | allDay | event |
| `duration` | `for 1h`, `for 45m`, `for 1h30`, `for 90 min`, `for 2 hours` | minutes. Event: end = start + d. Task: estimate. | event if a start time exists |
| `estimate` | `~45m`, `~2h`, `~1h30`, `~25` | minutes | task |
| `deadline` | `!<date>`, `!deadline <date>`, `due <date>`, `by <date>`, `before <date>` | DayKey | task |
| `evening` | `tonight`, `this evening` (with an optional time) | When = evening | task |
| `later` | `someday`, `anytime` | When | task |
| `recurrence` | own grammar (4.3, step 3) | RRULE (+ `every!` = after completion) | `every!` = task |
| `timezone` | `PST/PDT/PT`, `EST/EDT/ET`, `CST/CT`, `MST/MT`, `GMT/UTC`, `JST`, `CET`, `BST`, `UTC±h`; abbreviation families map to an IANA zone | IANA zone | event |
| `alert` | `alert 10m [before]`, `alarm 1h before`, `remind me 10 min before` | minutes before | event (`alert`/`alarm`), task (`remind me`) |
| `reminder` | `remind me at 9am`, `remind me tomorrow 9am` | instant | task |
| `location` | `@ Blue Bottle`, `@office`, `at <Capitalized Words>`, `at <known place>`; stops at the next token | string | event |
| `attendee` | `with <email>`, `with <contact>` (contacts on device), `+<email>` | emails | event |
| `list` | `/prefix`. It matches calendars and projects/areas. With both, the mode decides; with one, that match signals the mode. | id | event or task |
| `tag` | `#tag` (existing or new) | tag | task |
| `priority` | `p1`–`p4` | 1–4 | task |
| `url` | `https://…`; hosts `zoom.us`, `meet.google.com`, `teams.microsoft.com`, `*.webex.com` get a video chip | URL | event |

`!` stays the deadline sigil, as PLAN.md §5.2 and today's code already have it. Todoist's `!` means reminder and Fantastical's `!!!` means priority. Copying either would break existing muscle memory in Cal [inference].

### 4.3 Order of passes

Every pass reads a **masked** copy of the input. Spans that are already claimed, quoted, or in `literals` are replaced with spaces of the same length, so offsets never shift.

1. **Normalize and mask.** Map en/em dashes and `→` to `-`, and curly quotes to straight ones, in the scan copy only. Mask `"…"` spans and `literals`.
2. **Mode prefix.** Anchored at the start.
3. **Sigils and literal shapes.** URLs, emails, `#tag`, `/list`, `~estimate`, `p1`–`p4`, `@ place`. These are certain and cheap, and they take characters that chrono might misread (`/home` is safe, `5/16` is not a list).
4. **Recurrence grammar.** It runs before chrono so `every Monday` isn't read as a one-off. A small hand-written recursive-descent parser over word tokens:

   ```
   rule      := ("every" ["!"] | "each") spec | freqword | plural-days | "weekdays" | "weekends"
   spec      := [n | "other"] unit [on-clause] | day-list | ordinal day-name "of" ("the"|"each"|"every") "month"
              | "last day of" ("the"|"every"|"each") "month" | "year on" date
   freqword  := "daily" | "weekly" | "monthly" | "yearly" | "annually" | "quarterly"
   bounds    := ("until" | "through" | "ending") date | ("starting" | "from") date | n "times" | "for" n unit
   ```

   Also: `Tuesdays and Thursdays` (plural weekdays), `first Friday of each month`, `every 3rd Tuesday`, `every! 2 weeks` / `every 2 weeks after completion`. Date pieces inside `until`/`starting` call chrono on that substring. It emits `FREQ`, `INTERVAL`, `BYDAY` (with ordinals), `BYMONTHDAY` (−1 for last day), `BYMONTH`, `COUNT`, `UNTIL`. Grammar ideas come from Todoist's recurring-dates page and everwhen's table.
5. **Keyword phrases.** `for <duration>`, `all day`, `alert|alarm …`, `remind me …`, `due|by|before <date>` (call chrono on the rest, keep it only if the date starts right after the keyword, as today's `!` code does), `tonight`/`this evening`, `someday`/`anytime`, timezone abbreviations attached to a time.
6. **Dates and times (chrono).** Use a cloned `chrono-node/en` casual config with:
   - Cal's custom parsers (`2p`, `9a`, `tom`, `tues`, bare-hour ranges, `the 15th`, `end of week`, `mid <month>`).
   - Refiners for meridiem (2.1) and weak dates (2.3). They mark a weak date `applied: false` when it isn't a tail or lead-word match.
   - A refiner that drops implied times from relative day/week/month units, which also fixes the DST drift.
   - A refiner that splits ranges whose two ends name different zones and resolves each end alone.
7. **Location and attendees.** `at <…>` only claims text that is left after time parsing, so `at 5` is already gone. It takes capitalized words up to the next token boundary or connector (`with`, `on`, `for`). Lowercase `at home` / `at the office` count only when they match a known place. `with <email>` is certain. `with <name>` is an attendee only on a contact match. Otherwise "with Sam" stays in the title.
8. **Assemble.** Resolve conflicts (4.4), choose the mode (4.6), compute start/end/defaults (4.8), build the title from the unclaimed text, and drop connector words that ended up next to a removed span (`on`, `at`, `from`, `by`, `due`, `for`, `@`). A connector belongs inside the token's span when the token claims it, so the highlight covers "on Saturday" and not just "Saturday".

### 4.4 Conflict resolution

1. Spans never overlap. A span claimed by an earlier pass is masked for later ones, so pass order is the priority order.
2. Within one pass, the longer match wins ("tomorrow 1pm" over "tomorrow").
3. Two applied tokens of one kind (two `when`s, two deadlines): the rightmost wins, the others become `applied: false` and go back to the title. Today's code keeps the first, which is why `March for Science on Saturday` breaks.
4. Kind conflicts that need the mode: `/work` matching a calendar and a project, `for 45m` as duration or estimate, `remind me` vs `alert`. These resolve after the mode is chosen.
5. If an incompatible pair shows up after the mode is chosen (a `deadline` on an event), the token stays highlighted but becomes `applied: false` with the label "Deadline (tasks only)". The user then sees why it didn't take [inference].

### 4.5 Confidence and ambiguity

| Confidence | Examples | UI |
|---|---|---|
| `certain` | sigils, explicit keywords with a valid value, ISO dates, times with am/pm or `:mm`, emails, URLs | solid highlight, applied |
| `likely` | weekday or month with a lead word or at the tail, `next Friday`, `in March`, `at Capitalized Place`, recurrence with `until <month>` | solid highlight, applied, resolved date in the chip |
| `guess` | inferred meridiem, `this <weekday>` on a weekend, `until <month>` boundary, bare-hour ranges | dotted underline, applied, chip offers the alternative (Tab to the chip, ↑/↓ to switch) |
| suggestion | weak dates mid-title (`Sunday school`), losing duplicates | faint underline, **not applied**. Clicking applies it. |

The model is a fixed table, not a score. It stays deterministic and every case is testable [inference].

### 4.6 Event or task

1. A `mode` prefix or a manual toggle wins.
2. Otherwise count signals from the table in 4.2. Event signals: time range, date range, all-day, duration with a start time, location, attendee, URL, `alert`, time zone, a list that only matches a calendar. Task signals: deadline, estimate, priority, tag, evening/someday/anytime, `every!`, `remind me`, a list that only matches a project.
3. More signals wins. A tie, including zero, goes to the surface default: grid → event, task list → task, global Quick Entry → task. Cal's global entry is Things-style capture. A task with a time becomes a time block, which still shows on the grid.
4. The mode chip is always the first chip, and the toggle flips it. Flipping doesn't re-parse. It changes how `for`, `/list` and alerts are read in assembly.

### 4.7 Live highlighting and unparse

- The overlay renderer in `apps/desktop/src/renderer/src/components/QuickEntry.tsx` already draws tokens from spans. It needs `confidence` and `applied` styling.
- **Pending tokens.** A token whose end touches the caret, with no following space yet, renders as "pending" (lighter). This stops `tom` from flashing "Tomorrow" while you type "tomato" [inference].
- The editor keeps `literals: {start,end}[]`. On each edit it shifts ranges after the edit point by the length delta and drops any range the edit touched. Then it calls `parseQuickEntry` again. Parsing is pure, so re-parsing on every keystroke is fine at about 0.01–0.1 ms.
- Ways to unparse: click a highlight, Backspace straight after a newly recognized token, or Backspace/Delete on a focused chip. Each adds a literal. The phrase also goes into the remembered-literals list (2.3, rule 3).
- To apply a suggestion, click it or Tab to it and press Return.
- Quotes: the delimiting quote characters are removed from the title. Text inside is never parsed.

### 4.8 Defaults

- **Events.**
  - A time with no end or duration lasts `defaultEventMin` (60). Morgen documents 1 h. Fantastical's default isn't documented.
  - A date with no time is all-day, with an exclusive end.
  - No date and no time: start at the next quarter hour today [inference].
- **Tasks.**
  - A date sets When = date.
  - A time also sets `start_at`. The block lasts the estimate, else 30 min, per PLAN §5.3.
  - A time range or duration sets the estimate too.
- **Surface context.** The list a Quick Entry opened from, or the grid slot it was dragged from, fills only fields the text didn't set.
- **Recurrence start.** A rule with no explicit start begins at the first matching occurrence on or after today (Todoist's "starts today"). One more time cutoff applies: with a time that has already passed today, it begins at the next match. `every other Tuesday` starts on the *first* Tuesday. Todoist starts on the second, and the chip label makes the difference visible.
- **UNTIL.** Timed events with a zone get a UTC UNTIL at the occurrence's start time, which RFC 5545 requires when DTSTART has a TZID. Date-valued tasks and all-day events get a date UNTIL. `until <month>` means through the last day of the month before (`guess`, alternative "through the 1st").

---

## Recommendation for Cal

### Libraries

- **Keep `chrono-node` (2.10.3), imported as `chrono-node/en`.** Use a cloned casual config with Cal's parsers and refiners from 4.3, step 6. Never let it see durations or recurrence. Pin the exact version, because refiners depend on internals like `isCertain` and `assign`.
- **No library for recurrence text.** Write the grammar in 4.3, step 4 (a few hundred lines) and emit RRULE strings, matching the habits convention.
- **Expansion.** Use `rrule` (BSD-3, 13.6 KB gz) where the domain needs to expand rules: the Upcoming view, next instance, DTSTART checks in tests. Don't use its `fromText`. Revisit `rrule-temporal` if Cal moves to Temporal.
- **Not adopting:** compromise-dates (size, misparses), sherlockjs (abandoned), any-date-parser (whole-string only; it could back the `.` go-to-date box), everwhen (immature, Luxon, no RRULE).
- **Time zones.** Abbreviation families map to IANA zones (PST/PDT/PT → America/Los_Angeles, and so on). Offsets come from `Intl.DateTimeFormat` at the event's date, which Hermes supports. Don't rely on chrono's fixed-offset defaults.
- **EventKit wiring.** Extend `EventInput` with `rrule`, `alertsMin`, `url`, `timeZone`. Map RRULE to `EKRecurrenceRule` in the Swift helper. Attendees go into notes, with a chip that says invites need a direct Google/CalDAV account.

### Parser design (summary)

`parseQuickEntry(text, context)` is a pure function. It runs eight passes over a masked copy of the input: normalize/mask, mode, sigils, recurrence, keyword phrases, chrono, location/attendees, assemble. Each token carries a span, a value, a confidence, alternatives and an `applied` flag. Conflicts resolve by pass order, then length, then rightmost-wins. A signal count picks the mode, and the surface breaks ties. The editor keeps a `literals` list for unparsed spans and a remembered-phrases list on the device.

Fix these in the current package first, since they are bugs today [measured]:
- `for 1h` sets start_at to now + 1 h.
- `at 5` means 5 AM.
- `Sunday school` → "school".
- `March for Science` → "for Science".
- `every Monday` → title "Yoga every".
- The nlp tests don't pin `TZ`, while `@cal/domain` pins `America/New_York`. The table below assumes `TZ=America/Los_Angeles`, so add that to `packages/nlp`'s test script.

### Test table

Shared context: now = **Wed 2026-10-28 10:40 America/Los_Angeles** (PDT, -07:00; US DST ends Sun 2026-11-01, so dates from Nov 1 on are PST, -08:00).

| Context key | Value |
|---|---|
| calendars | Work `cal-work`, Home `cal-home` |
| projects | Work `p-work`, Errands `p-errands` |
| tags | `admin`, `deep` |
| contacts | none |
| `defaultEventMin` | 60 |
| `dayBand` | 7–22 |
| `weekStartsOn` | Monday |

Surface `quick` = global Quick Entry (ties → task). `grid` = calendar (ties → event).

All times below are local wall-clock with offset. All-day ends are exclusive. Fields not listed are absent.

| # | Input | Surface | Expected |
|---|---|---|---|
| 1 | `Lunch with Sam tomorrow 1pm for 1h` | quick | event · title "Lunch with Sam" · 2026-10-29T13:00-07:00 → 14:00-07:00 |
| 2 | `Lunch with sam@example.com tomorrow 12:30-1:30 at Blue Bottle /home` | quick | event · "Lunch" · 2026-10-29T12:30-07:00 → 13:30-07:00 · location "Blue Bottle" · calendar cal-home · attendees [sam@example.com] |
| 3 | `Design review 1-2pm` | quick | event · "Design review" · 2026-10-28T13:00-07:00 → 14:00-07:00 |
| 4 | `Call from 3 to 4:30` | quick | event · "Call" · 2026-10-28T15:00-07:00 → 16:30-07:00 · meridiem `guess` |
| 5 | `Standup at 9` | grid | event · "Standup" · 2026-10-29T09:00-07:00 → 10:00-07:00 · `guess`, alternative 2026-10-28T21:00 |
| 6 | `Dinner at 7` | grid | event · "Dinner" · 2026-10-28T19:00-07:00 → 20:00-07:00 |
| 7 | `Pick up kids at 3` | quick | task · "Pick up kids" · when date 2026-10-28 · start_at 2026-10-28T15:00-07:00 |
| 8 | `1:1 with Sam at 4` | quick | task · "1:1 with Sam" · 2026-10-28 · start_at 16:00-07:00 |
| 9 | `Call mom at 5 tomorrow` | quick | task · "Call mom" · 2026-10-29 · start_at 17:00-07:00 |
| 10 | `Call Sam 3pm` | quick | task · "Call Sam" · 2026-10-28 · start_at 15:00-07:00 |
| 11 | `Review Friday` | quick | task · "Review" · when date 2026-10-30 |
| 12 | `Review next Friday` | quick | task · "Review" · 2026-11-06 |
| 13 | `Call Wednesday` | quick | task · "Call" · 2026-10-28 |
| 14 | `Call Wednesday 9am` | quick | task · "Call" · 2026-11-04 · start_at 2026-11-04T09:00-08:00 |
| 15 | `Review in 2 weeks` | quick | task · "Review" · 2026-11-11 (no start_at) |
| 16 | `Plan Q1 next week` | quick | task · "Plan Q1" · 2026-11-02 |
| 17 | `Party this weekend` | quick | task · "Party" · 2026-10-31 |
| 18 | `Sunday school` | quick | task · "Sunday school" · no date · suggestion token on "Sunday" (`applied: false`) |
| 19 | `Sunday school this Sunday 9am` | quick | task · "Sunday school" · 2026-11-01 · start_at 2026-11-01T09:00-08:00 |
| 20 | `March for Science on Saturday` | quick | task · "March for Science" · 2026-10-31 |
| 21 | `Buy May flowers` | quick | task · "Buy May flowers" · no tokens |
| 22 | `Read chapter 3` | quick | task · "Read chapter 3" · no tokens |
| 23 | `"Prepare for Wacky Wednesday" on Tuesday at 9pm` | grid | event · "Prepare for Wacky Wednesday" · 2026-11-03T21:00-08:00 → 22:00-08:00 |
| 24 | `Offsite all day Friday /work` | quick | event · "Offsite" · all-day 2026-10-30 → 2026-10-31 · calendar cal-work |
| 25 | `Trip next Tue–Thu` | quick | event · "Trip" · all-day 2026-11-03 → 2026-11-06 |
| 26 | `Family vacation from Aug 9-18` | grid | event · "Family vacation" · all-day 2027-08-09 → 2027-08-19 |
| 27 | `Concert Dec 31 9pm-1am` | quick | event · "Concert" · 2026-12-31T21:00-08:00 → 2027-01-01T01:00-08:00 |
| 28 | `Investor call 9am ET tomorrow` | quick | event · "Investor call" · 2026-10-29T09:00-04:00 → 10:00-04:00 (06:00–07:00 PDT) · timeZone America/New_York |
| 29 | `Call 3pm PST` | quick | event · "Call" · 2026-10-28T15:00-07:00 → 16:00-07:00 · timeZone America/Los_Angeles (chrono alone gives 16:00 PDT) |
| 30 | `Sync Monday 4pm GMT` | quick | event · "Sync" · 2026-11-02T16:00Z → 17:00Z (08:00–09:00 PST) · timeZone GMT |
| 31 | `Flight 593 Monday 3pm EST to 6pm PST` | quick | event · "Flight 593" · 2026-11-02T15:00-05:00 → 2026-11-02T18:00-08:00 · timeZone America/New_York |
| 32 | `Yoga every Monday 7am` | grid | event · "Yoga" · 2026-11-02T07:00-08:00 → 08:00-08:00 · rrule `FREQ=WEEKLY;BYDAY=MO` |
| 33 | `Team sync every other Tuesday 10-10:30am /work` | quick | event · "Team sync" · 2026-11-03T10:00-08:00 → 10:30-08:00 · `FREQ=WEEKLY;INTERVAL=2;BYDAY=TU` · cal-work |
| 34 | `Standup weekdays at 9:15 until Dec 18` | grid | event · "Standup" · 2026-10-29T09:15-07:00 → 10:15-07:00 · `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261218T171500Z` |
| 35 | `Gym every Mon, Wed, Fri at 7am` | grid | event · "Gym" · 2026-10-30T07:00-07:00 → 08:00-07:00 · `FREQ=WEEKLY;BYDAY=MO,WE,FR` |
| 36 | `Piano Tuesdays and Thursdays 5-6pm` | grid | event · "Piano" · 2026-10-29T17:00-07:00 → 18:00-07:00 · `FREQ=WEEKLY;BYDAY=TU,TH` |
| 37 | `Sam's birthday every year on 5/16` | grid | event · "Sam's birthday" · all-day 2027-05-16 → 2027-05-17 · `FREQ=YEARLY` |
| 38 | `Pay rent first Friday of each month` | quick | task · "Pay rent" · 2026-11-06 · `FREQ=MONTHLY;BYDAY=1FR` · repeat fixed |
| 39 | `Send invoices on the last day of every month` | quick | task · "Send invoices" · 2026-10-31 · `FREQ=MONTHLY;BYMONTHDAY=-1` |
| 40 | `Water plants every 3 days` | quick | task · "Water plants" · 2026-10-28 · `FREQ=DAILY;INTERVAL=3` |
| 41 | `Review budget daily until Dec` | quick | task · "Review budget" · 2026-10-28 · `FREQ=DAILY;UNTIL=20261130` · `guess`, alternative UNTIL=20261201 |
| 42 | `Mow lawn every! 2 weeks` | quick | task · "Mow lawn" · 2026-10-28 · `FREQ=WEEKLY;INTERVAL=2` · repeat after_completion |
| 43 | `Write report tomorrow ~45m p1 !fri /wor` | quick | task · "Write report" · 2026-10-29 · estimate 45 · priority 1 · deadline 2026-10-30 · project p-work |
| 44 | `File taxes by Nov 15 #admin` | quick | task · "File taxes" · no when · deadline 2026-11-15 · tags [admin] |
| 45 | `Ship v2 by end of month p2` | quick | task · "Ship v2" · deadline 2026-10-31 · priority 2 |
| 46 | `Read this evening` | quick | task · "Read" · when evening · when_date 2026-10-28 |
| 47 | `Learn piano someday` | quick | task · "Learn piano" · when someday |
| 48 | `Email Anna tomorrow remind me at 9am` | quick | task · "Email Anna" · 2026-10-29 · reminder_at 2026-10-29T09:00-07:00 · no start_at |
| 49 | `Deep work tomorrow 9-11:30 #deep` | quick | task (range vs tag tie → quick default) · "Deep work" · 2026-10-29 · start_at 09:00-07:00 · estimate 150 · tags [deep] |
| 50 | `Dentist Nov 3 2:30pm alert 1h before` | quick | event · "Dentist" · 2026-11-03T14:30-08:00 → 15:30-08:00 · alertsMin [60] |
| 51 | `Haircut tomorrow at Quick Cuts 10am alert 30 minutes` | quick | event · "Haircut" · 2026-10-29T10:00-07:00 → 11:00-07:00 · location "Quick Cuts" · alertsMin [30] |
| 52 | `Coffee @ Blue Bottle Fri 8:30` | quick | event · "Coffee" · 2026-10-30T08:30-07:00 → 09:30-07:00 · location "Blue Bottle" |
| 53 | `Standup https://meet.google.com/abc-defg-hij tomorrow 9:30am for 15m` | quick | event · "Standup" · 2026-10-29T09:30-07:00 → 09:45-07:00 · url https://meet.google.com/abc-defg-hij (video chip) |
| 54 | `task Book flights Friday` | grid | task (prefix beats surface) · "Book flights" · 2026-10-30 |
| 55 | `event Focus time tomorrow` | quick | event (prefix) · "Focus time" · all-day 2026-10-29 → 2026-10-30 |

Behavior tests to add next to the table:
- **Literals.** `Create monthly report` with `literals=[{start:7,end:14}]` gives title "Create monthly report", no tokens, no rrule.
- **Pending tokens.** `Lunch tom` with the caret at the end gives a `when` token flagged pending. `Lunch tomato` gives no token.
- **Mode toggle.** Flipping row 49 to event gives 2026-10-29T09:00-07:00 → 11:30-07:00, and `#deep` turns `applied: false` with the label "Tags (tasks only)".
- **List conflicts.** `/work` alone resolves to cal-work in event mode and p-work in task mode.

---

## Sources

**Fantastical**
- Adding events and tasks (Mac): https://flexibits.com/fantastical/help/adding-events-and-tasks
- Tips: https://flexibits.com/fantastical/tips
- Integration (URL scheme, AppleScript): https://flexibits.com/fantastical/help/integration
- Conference calls: https://flexibits.com/fantastical/help/conference-call-support
- Invites blog (2021): https://flexibits.com/blog/2021/05/making-quick-and-efficient-event-invites-with-fantastical/
- The Sweet Setup guide (2019) [secondary]: https://thesweetsetup.com/wp-content/uploads/2019/09/Simple-Guide-to-Natural-Language.pdf
- MacStories review [secondary]: https://www.macstories.net/reviews/fantastical-for-iphone-review/

**Todoist**
- Quick Add: https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz
- Dates and times: https://www.todoist.com/help/articles/introduction-to-dates-and-time-q7VobO
- Recurring dates: https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV
- Task duration: https://www.todoist.com/help/todoist/features/set-a-task-duration-L1kYkZv8d
- Smart date recognition: https://www.todoist.com/help/articles/turn-smart-date-recognition-on-or-off-63WfIr
- Glossary: https://www.todoist.com/help/articles/todoist-glossary-cA60laWMH

**Things 3**
- Natural language input: https://culturedcode.com/things/support/articles/9780167/
- Quick Entry: https://culturedcode.com/things/support/articles/2249437/
- Mac keyboard shortcuts: https://culturedcode.com/things/support/articles/2785159/
- Mac release notes: https://culturedcode.com/things/support/articles/1100684/

**TickTick**
- Add Tasks (not fetchable): https://help.ticktick.com/articles/7055782422935240704
- Tags: https://help.ticktick.com/articles/7055782255804809216
- Quick add symbols (2020) [secondary]: https://curtismchale.ca/2020/08/10/ticktick-quick-add-syntax/

**Morgen, Amie, Notion Calendar**
- Morgen command bar: https://www.morgen.so/guides/create-events-and-tasks-with-command-bar
- Morgen shortcuts: https://www.morgen.so/guides/morgen-web-app-essential-shortcuts
- Amie quick start: https://amie.so/documentation/getting-started/quick-start
- Notion Calendar NL events [secondary]: https://21notion.com/en/notion-updates/notion-calendar-natural-language-events
- Notion Calendar help: https://www.notion.com/help/manage-your-calendars-and-events

**Apple and Google**
- Calendar for Mac, add events: https://support.apple.com/guide/calendar/icalwr13-events/mac
- Reminders for Mac: https://support.apple.com/guide/reminders/add-or-change-reminders-remndc729e28/mac , https://support.apple.com/guide/reminders/add-dates-or-locations-to-reminders-remnd4b206fb/mac
- Google Calendar, create an event: https://support.google.com/calendar/answer/72143
- Google Calendar API events.quickAdd: https://developers.google.com/workspace/calendar/api/v3/reference/events/quickAdd
- EventKit attendees: https://developer.apple.com/documentation/eventkit/ekcalendaritem/attendees
- EKRecurrenceRule: https://developer.apple.com/documentation/eventkit/ekrecurrencerule
- EKAlarm: https://developer.apple.com/documentation/eventkit/ekalarm
- EKCalendarItem.timeZone: https://developer.apple.com/documentation/eventkit/ekcalendaritem/timezone
- EKEvent.isAllDay: https://developer.apple.com/documentation/eventkit/ekevent/isallday
- RFC 5545: https://www.rfc-editor.org/rfc/rfc5545

**Libraries**
- chrono: https://github.com/wanasit/chrono (README, releases) ; issues #250, #271, #349, #377, #483, #484, #527, #553, #590: https://github.com/wanasit/chrono/issues
- rrule.js: https://github.com/jkbrzt/rrule
- rrule-temporal: https://github.com/ggaabe/rrule-temporal
- temporal-polyfill: https://github.com/fullcalendar/temporal-polyfill
- compromise-dates: https://github.com/spencermountain/compromise/tree/master/plugins/dates
- Sherlock: https://github.com/neilgupta/Sherlock
- any-date-parser: https://github.com/kensnyder/any-date-parser
- everwhen: https://github.com/coality/everwhen
- date-fns: https://github.com/date-fns/date-fns
- Hermes and Temporal [secondary]: https://www.callstack.com/blog/announcing-node-api-support-for-react-native ; React Native 0.84: https://reactnative.dev/blog/2026/02/11/react-native-0.84

**Package data:** `https://registry.npmjs.org/<pkg>` and `gh api repos/<owner>/<repo>`, fetched 2026-10-28.
