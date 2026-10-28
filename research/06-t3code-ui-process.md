# 06: How T3 Code ran its UI "hill climb", and a review loop we can reuse for Cal

Researched 2026-10-28 against `pingdotgg/t3code` main at `9bc4138923`, the PR branches named below, and Theo's public skills repo `t3dotgg/tstack`. The repo was cloned read-only into `/tmp/t3code-study/repo`. File:line references point at that commit unless a PR branch is named.

**Did we find the PR?** Yes. The tweet's link is cut off, so we can't tell which of the first two PRs it pointed to. Both were opened on Oct 25 and both are linked below. The review in the owner's screenshot (T3 current 7.4, Claude Code 8.3, Codex 8.5) matches the GPT Sol scores reported in [#24837](https://github.com/pingdotgg/t3code/pull/24837). That makes the screenshot a round from #24837's run. The work that shipped is [#24865](https://github.com/pingdotgg/t3code/pull/24865).

---

## 1. What happened

### Timeline (all times UTC)

| When | PR | What | Council |
|---|---|---|---|
| Sep 22–24 | [#13397](https://github.com/pingdotgg/t3code/pull/13397), [#13207](https://github.com/pingdotgg/t3code/pull/13207) (Julius) | Groundwork. `@shadcn/lint no-arbitrary-values` became an error (479 findings to 0). App code stopped restyling `components/ui` exports (`no-restyle` findings went from 402 to 250). Added `text-2xs` and `text-3xs` tokens. | — |
| Oct 20 | [#22287](https://github.com/pingdotgg/t3code/pull/22287) | Sidebar buttons switched to the shared `--control-radius` and `--sidebar-row-content-inset` tokens | — |
| Oct 24–25 | `t3dotgg/tstack` commits `6efae36420` and `7de017b3fc` | Theo published the `council` skill. The next day, council results started going into PR descriptions. | — |
| Oct 25 07:33 | [#24776](https://github.com/pingdotgg/t3code/pull/24776) "UI polish overhaul" (closed, superseded) | Token pass: Inter, the radius scale, 1.75 icon stroke, a three-level settings hierarchy, contrast | 3 rounds, about 6 → 9/10 |
| Oct 25 09:00 | [#24810](https://github.com/pingdotgg/t3code/pull/24810) "blue marks where you are…" (closed) | Blue accent pass. **Dropped:** the council pushed back toward neutral rows | 9.5 target, final 9.5–9.6 |
| Oct 25 09:57 | [#24837](https://github.com/pingdotgg/t3code/pull/24837) "calmer, clearer UI that beats Claude Code and Codex in design review" (closed, superseded) | First run scored against the reference apps: sidebar, composer, details panel, settings | 5 rounds, 7.1/6.9/7.4 → 9.0/7.9/9.0 |
| Oct 25 12:12, merged 20:44 | **[#24865](https://github.com/pingdotgg/t3code/pull/24865)** "UI design overhaul, with the new look behind a Beta toggle" | One PR that supersedes the three above. The big changes sit behind `Settings → Beta → New design`. | **18 rounds** to every category ≥ 9.5 |
| Oct 25 | [#24883](https://github.com/pingdotgg/t3code/pull/24883) | The toggle itself (`data-redesign` on `<html>`, a Tailwind `redesign:` variant) | — |
| Oct 26 02:46 | [#25251](https://github.com/pingdotgg/t3code/pull/25251) "New design brings back color where it means something" | Corrected the over-gray result. Added 4 rubric categories. | 13 rounds, 14 categories, ends 10/10 |
| Oct 26 04:49 | [#25323](https://github.com/pingdotgg/t3code/pull/25323), [#25324](https://github.com/pingdotgg/t3code/pull/25324) | User bubble fixed on true black. New design turned on by default. | `sol-loop`, 1 round |
| Oct 26 | #25316, #25321, #25329, #25335 | Follow-up nits: composer double edges, a boxed VS Code icon, a dark band, the toolbar background | — |
| Oct 27 05:30 | [#25778](https://github.com/pingdotgg/t3code/pull/25778) "the new design is the only design" | Deleted the toggle and the classic styles (+248/−455). Proved no visual change with a pixel diff. | `sol-loop`, 1 round |
| Oct 27 | [#25876](https://github.com/pingdotgg/t3code/pull/25876) (closed), **[#25968](https://github.com/pingdotgg/t3code/pull/25968) (open)** | The iOS hill climb. A behavior eval graded from app state, not pixels. A **design council eval with a committed brief**, scored from simulator screenshots. | 4 rounds each |
| Oct 27 (open) | [#25869](https://github.com/pingdotgg/t3code/pull/25869), [#26196](https://github.com/pingdotgg/t3code/pull/26196) | Next targets: a simpler composer, tool-call cards (Beta) | — |

The full cycle took about 48 hours: complaint, token pass, comparison council, a toggle, on by default, then the old code deleted. Every PR says "Made with Claude Opus 5.5 in Claude Code, running in T3 Code". Theo steered and made the final calls, and the agent did the work.

### What the complaint turned into

Robin's complaint ("the fonts, the border radius, the icons, the font hierarchy") opens every PR description word for word. #24776 traced it to concrete causes:
- **Fonts.** "On Windows and Linux, the system font has no 500 or 600 weight, so every `font-medium` drew as regular text and the hierarchy fell flat."
- **Radius.** Corners ranged from 6px to 22px.
- **Contrast.** Several labels and controls were too faint to read.

Each complaint became a token. Nothing was fixed one component at a time.

---

## 2. The review loop

### 2.1 The `council` skill (public, `t3dotgg/tstack/skills/council/SKILL.md`)

This is the whole skill as of `1085050f3b` (Oct 28), lightly trimmed:

> Before an audit, address outstanding PR comments, fix known issues, and run relevant checks. Give council the updated implementation; do not defer known fixes until reviews return. …
>
> Bring in three delegates to help with the user's request, usually for review or feedback. Use one strong model from each of three different providers, at high reasoning effort. … pick the latest flagship model from each provider, for example Claude Opus, GPT Sol, and Gemini Pro.
>
> In T3 Code, use `orchestrator_capabilities` to resolve the models, then `delegate_task` to start one delegate per model in parallel. … If you cannot reach three providers, or a named member is unavailable, report it instead of substituting.
>
> … For review or feedback, keep their work read-only. Collect their responses and summarize the useful findings, disagreements, and recommended next steps.
>
> For a code review, ask each delegate for a score out of 10. Count each full review pass as one round. A fresh review after fixes starts a new round.
>
> If the work ends in a pull request, put the results in the PR description … `## Council review` / `Rounds: N` / a table of Delegate × Round. … If a delegate gives no score, write `no score`. Do not invent one.
>
> If you agree with their recommendations, make the changes and request a fresh review after. Continue this process until all delegates are satisfied with the outcome.
>
> **Do not let repeated reviews result in scope creep. It is your job to fight to keep scope limited.**

The skill has no design content of its own. The design part lived in a per-task brief (`/tmp/t3-council/BRIEF.md` in the screenshot), which was **never committed** for the web pass. Its sibling skill `sol-loop` is the cheaper single-reviewer version (3 rounds by default, blocker/should/nit labels). That's what the small follow-up PRs used.

### 2.2 The web design brief (reconstructed)

From the screenshot and the PR descriptions:

- **Instruction to each delegate:** "Act as the review sub-agent for this task. Read the brief at /tmp/t3-council/BRIEF.md and follow it exactly. This is round N. Open every screenshot listed there (PNG files; view them as images). Work read-only."
- **Comparison set:** T3 main, T3 current branch, Claude Code desktop, Codex desktop. All four are scored on the same categories in the same reply.
- **Categories (named in the screenshot):** Typography, Hierarchy, Spacing & density, Color & contrast, Iconography, Consistency & polish, Clarity, plus Overall. #25251 says there were "ten design categories". Round 10 added four more: **accessibility, responsive behavior, motion, copy**, for 14 in total. The other three of the ten aren't public.
- **Reply sections:** a score table → "What current T3 does better" → "Prioritized fixes" tagged MUST (and lower), each with exact values (e.g. "14px/20px, weight 500, `text-sidebar-foreground/90`") and a source `file:line` (e.g. `SidebarThreadRow.tsx L973`). Reviewers had the repo, so they cited code as well as pixels.

### 2.3 Screenshot method (web)

- **Fixed setup:** "macOS, 1280×832, seeded dev data with the dev sidebar artwork turned off." #24776 used Linux renders on purpose, because that's where the font bug showed.
- **Screens per round:** thread dark, thread light, new thread (light), settings dark. Later rounds added the details panel, Changes panel, model picker, a wide window, appearance, usage, a markdown table, syntax, and providers.
- **Build labels:** captures are named per build (`ui-95-s10-thread-dark`), so each round's images line up with its scores (s1…s10).
- **Pitfall:** downscaled images create fake defects. In #24776, Sol scored 8.5 over a "clipped placeholder". The 1:1 crops showed it was a downscaling artifact, and Sol re-scored 9. **Send 1:1 crops of dense areas along with the full frames.**
- **PR evidence:** an annotated main-vs-PR image, with each screen stacked "BEFORE (MAIN)" over "AFTER (THIS PR)", pink numbered arrows, and a numbered legend ("1. User turns stand off the canvas", "2. Diff counts pair emerald-700 with red-700 at 12px"…). The full screenshots go in a `<details>` table.
- **Desktop capture tool:** the evals call a `shot` CLI from the user's skills dir (`~/.claude/skills/shot/scripts/shot <url> --size 1440x900 --sleep 2500 --eval "<js>" --click … --out file.png`, see `evals/mobile-design/capture-desktop.ts` on PR #25968). It isn't public. The JS sets dark mode through `localStorage` before rendering.

### 2.4 Rounds, fixes, and stopping

- **Who did what:** the author agent (Opus 5.5) applied fixes. Delegates only reviewed. Each round started from fresh screenshots of the new build.
- **Delegates:** Claude Opus 5.5, Codex GPT-6.1 Sol, Muse Wonder Full, and for one phase Gemini 4 Argon, all at `xhigh`. Not every delegate ran every round. Sol, the fastest, ran most rounds, and the others joined at checkpoints (see the "not run" cells in #24865).
- **Targets got stricter in stages.**
  1. Reach 9.0.
  2. Beat both reference apps overall.
  3. "Push past 9.5": every delegate rates **every category** ≥ 9.5, with the lowest category reported per delegate.
  4. A merge/code review round checks the code. It also confirms the new design still matches the approved build (s10) and that classic is no worse than main.
- **Declining fixes:** some fixes were turned down with a reason, which the PR records.
  - Muse asked for a weaker focus ring (55%/45%). It was declined because it would drop below 3:1 non-text contrast, and Muse accepted.
  - Requests to hide sidebar agent logos, make switches monochrome, and gray the composer's model logo were declined "to hold scope".
- **Owner calls:** some decisions are reserved for the owner and kept out of reviewers' reach. In #24865 they were the blue switch accent, the model logo's brand color, three-line sidebar rows, the canvas color, and 75% read titles.
- **Rewriting a correct ask:** Opus asked to override the muted variable on the row. That wouldn't work, because `--contrast-*` tokens are computed on the sidebar. The fix re-declared the tokens on the row instead.
- **Stopping:** all delegates at or above target with nothing deferred (#25251 round 13: "10/10 in all 14 categories… would ship it as is"). The alternative was the author stopping to keep scope tight (#25968: "I stopped the council there").
- **Score noise is real.** Gemini's scores for the *same reference images* moved from about 8.5 to about 9.6 between rounds, and the PR says "treat them as noisy". Scores also climb toward 10 as reviewers get used to the build. **Read deltas against references scored in the same round, not raw numbers.**
- **The council can overshoot.** #24865 made idle icons gray, and the next day #25251 had to say it "went too far toward grayscale… quiet but flat, and some states were hard to read". Opus had already pushed back on graying the model logo.

### 2.5 The committed version: `evals/mobile-design/` (PR #25968, open)

This is the only committed brief and rubric so far. It's built for the iOS redesign and is the most reusable piece.

- `brief.md`: "You are a senior product designer… read-only… Read each image before you score."
  - 1–10 per axis per device class, anchored: "10 is the best mobile app you know for this kind of work. 7 is solid but clearly behind the best."
  - Asks what "feels worse, blander or less clear than it should", and what "works well and must stay as it is".
  - Asks for **five fixes**, most important first, each naming screen + device + what's wrong + the change. "'The question panel leaves a 120 pt scroll area on the closed Duo; let it take the space above the composer' is useful, 'improve spacing' is not."
  - Ends with exactly one fenced `json` block.
- `cases.ts` defines the axes:
  - `visual`: "type, color, icons, spacing and hierarchy"
  - `layout`: "use of the screen, safe areas, the keyboard, folds and rotation, large text"
  - `flow`: "how obvious each task is, from the flows and from what each screen offers next"
  - `polish`: "alignment, truncation, clipped or overlapping content, empty space, state indicators"
  - `desktop`: "whether this reads as the same product as the desktop app"
  - `competitors`: "how this compares with the Codex and Claude iOS apps"
- `scores.ts` parses the last ```json block with an Effect Schema, takes medians per axis and device, and writes deltas against `--baseline`. It warns when the panel changed, since "a different panel moves the median by itself".
- **Blind review:** "The commit under review is in `run.json`, outside the pack. Do not tell reviewers which build is new."
- **Scenes:** each scene has a `source`, the issue it guards (e.g. "#24930 conversation text under the header").
- **Poses:** dark, light, largest Dynamic Type, landscape, Duo closed and open, iPad landscape and portrait.
- **Flows:** six tasks recorded as filmstrips with tap counts. One example: "Start a thread takes 7 taps over 5 screens".
- **Capture (`ios.ts`):**
  - `xcrun simctl ui <udid> appearance dark|light`
  - `simctl ui <udid> content_size <size>`
  - `simctl openurl` deep links
  - taps through `agent-device`
  - `simctl io <udid> screenshot`, then `sips --rotate` for landscape
  - Throwaway simulators named `T3 Design …` are deleted afterwards.
- **Contact sheets (`pack.ts`):** `sharp` lays the tiles out, scaled to one height, max width 2400, with a label above each tile.
- **References (`references/README.md`):** your own device screenshots of Codex/Claude iOS, named `<app>-<device>-<screen>.png`, dark mode, default text size. "Do not scrape or commit third-party marketing images."
- **Cost:** about 90 min to capture, about 115 images per round, 2 reviewers at `xhigh`.
- **Baseline example:** iPhone layout 4.5, polish 5.0, vs-competitors 5.5. These are much lower than the web scores, so the anchor works.

---

## 3. Design decisions they made

All in `apps/web/src/index.css` unless noted. Tailwind v4, CSS-first. There's no `tailwind.config`, and tokens live in `@theme` / `@theme inline` blocks.

### Type
- **Font stack** (`index.css:171`, mirrored in `apps/web/src/appearanceFonts.ts:13`): `-apple-system, BlinkMacSystemFont, "Inter Variable", "Segoe UI", system-ui, sans-serif`.
  - macOS keeps SF Pro. Windows and Linux get bundled Inter (`@fontsource-variable/inter`, imported in `apps/web/src/main.tsx:4`, about 48 KB Latin) so 500 and 600 render.
  - Mono: `ui-monospace, "SF Mono", …`. A font set in Settings > Appearance still wins.
- **Scale:** Tailwind defaults plus dense steps (`index.css:183–190`).
  - `text-2xs` is 11px and `text-3xs` is 10px. 4xs (8px) and 5xs (7px) are only for icon badges.
  - Odd sizes (11px, .7rem, 9px…) were folded into these and are now banned by lint.
- **Hierarchy rules that shipped:**
  - Settings (`components/settings/settingsLayout.tsx:235,470,489`): section titles `text-base font-semibold` (16/600), row titles `text-sm font-medium` (14/500), descriptions `text-xs text-muted-foreground text-balance` (12, muted).
  - Sidebar: the thread title is `text-sm` (14px), `font-medium`, or `font-normal` once read. Project, branch and age are all `text-xs` in one secondary color.
  - Chat: body at 90% foreground. `strong` is 600. Inline code is `0.85em` with a 10% foreground fill, no border, and radius `0.25rem`. Markdown tables went from 12px to 14px.
  - The model picker and model names are 14px.

### Radius
- `--radius: 0.5rem` (8px, `index.css:1115`), down from 10px. The scale (`index.css:289–294`) is `sm 4 / md 6 / lg 8 / xl 12 / 2xl 16 / 3xl 20`.
- Large surfaces (composer, details card, plan card) went from 22px to **16px**. Code blocks went from 12px to 8px. Controls use `--control-radius: 0.5rem`.
- Sidebar rows are `rounded-md` (6px).

### Spacing and density
- Semantic geometry tokens (`index.css:103–112`): `--sidebar-content-inset 0.5rem`, `--sidebar-row-content-inset 0.625rem`, `--sidebar-control-gap 0.5rem`, `--floating-content-inset 0.75rem`, `--command-content-inset 1rem`. The comment explains why: "Keep these values semantic so sidebar, palette, tooltip, and toolbar controls cannot quietly drift apart."
- The sidebar row is a fixed **78px** (`h-[4.875rem]`) with three lines (`SidebarThreadRow.tsx:1351`):
  1. 20px project line
  2. title line, `mt-1`
  3. branch line, `mt-0.5`

  Rows with no branch drop the third line, and the provider icon moves to the title line (#25251).
- The composer rests at two lines with no vertical dividers.
- Wide windows center the chat between the sidebar and the details card, with an eased shift that a unit test checks at every width from 1300 to 1800px.

### Color
- **Dark canvas is true black `#000`** (`index.css:1192`). Surfaces lift with `neutral-950` mixed 3% toward white (cards, popovers, composer). The user bubble uses 8% (`--message-surface`, about `#1e1e1e`), which matches the selected sidebar row.
  - On `#000`, a 4% white alpha comes out at `#0a0a0a`, darker than the composer, which is why #25323 switched the bubble to a solid tone.
- **Muted text:**
  - Light: `--muted-foreground: zinc-500`.
  - Dark: `neutral-400` (`index.css:1203`), raised from a darker mix.
  - Sidebar metadata gets its own dark step, `--secondary-label: #8f8f8f`, "a step below read titles (75% white)" (`index.css:1276`).
  - Light foreground went from zinc-800 to **zinc-900**.
- **Borders and inputs in dark:** white at 8% and 11% (up from 6% and 8%). Inside the sidebar the input is 18%.
- **Sidebar row fills (dark):** foreground at 8% for hover, 11% for active, 7% for selected (`index.css:1270–1272`). The light active row is flat white with an inset `ring-sidebar-border/70`.
- **Primary:** `oklch(0.488 0.217 264)` in light, `oklch(0.571 0.21 264)` in dark. A blue focus ring comes from `--ring: var(--primary)`.
- **Final color rule (#25251):**
  - Structure stays neutral: canvas, row fills, text, borders.
  - **Identity** is in color: project, agent and editor icons at rest.
  - **Action and state** use the one blue: switches, checkboxes, focus, Merge, NEW, snoozed wake times.
  - **Meaning** uses semantic color: added files green, deleted red, modified a *muted* blue (`--diff-modified-icon`, 50% info mixed into muted) "so the rare changes lead".
  - The blue "you are here" tint on rows was rejected.
- **Light-mode semantic pair:** emerald-700 / red-700 for diff counts (was 600). Syntax colors were darkened, keeping their hue, until each hits 4.5:1 on every light code surface (the `t3-light` theme).
- **Contrast floors are cited by number:** 4.5:1 for text and 3:1 for non-text (focus rings). The placeholder went from 3.0:1 to 4.8:1.

### Icons
- Lucide throughout. The default stroke drops from 2 to **1.75** through a zero-specificity rule, so `stroke-*` utilities still win (`index.css:1722–1725`):
  ```css
  @layer base { :where(svg.lucide[stroke-width="2"]) { stroke-width: 1.75; } }
  ```
- Hand-drawn icons were matched to 1.75.
- Select chevrons went from `size-3 opacity-50` to `size-3.5 opacity-70` (`components/ui/select.tsx`).
- Sidebar icon color is 85% muted (up from 60%).
- One leading icon per row in the details panel.
- A gauge icon replaced the brain for "effort".
- Chevrons only where something expands ("Show N more ›" replaced "+").

### Opacity
- Read titles use **text color** at 75% (`text-foreground/75`, which brightens on hover and focus), not element opacity (`SidebarThreadRow.tsx:1021`).
- Whole-row `opacity-70` survives only on settled-and-still-working rows (`:959`).
- Idle provider logos in the sidebar provider stack are `opacity-40 grayscale` until hover or focus (`:1168`). Project favicons went back to color in #25251.
- Hover actions swap instantly with the time label. Absolute positioning keeps them from overlapping.

### Light/dark handling
- `@custom-variant dark (&:is(.dark, .dark *))` plus per-scope token overrides: `:root`, then `[data-app-sidebar]`, then named themes via `--app-theme-*`.
- Components read semantic tokens (`text-secondary-label`, `bg-sidebar-row-active`) and never raw colors. The `--contrast-*` layer applies the user's contrast setting on top.
- Both themes are reviewed in every round.

### Process decisions worth copying
- **Ship big changes behind a toggle.** A `data-redesign` attribute plus a Tailwind `redesign:` variant that "adds no specificity, so it loses to dark:, hover:" (#24883). The sequence was: on by default → toggle deleted within 2 days. That avoided two half-maintained looks.
- **Prove "no visual change" by pixel diff.** #25778 did this, and the diff caught two `cn()` merge regressions.
- **Lint enforces tokens:** `no-arbitrary-values` and `no-restyle`.

---

## 4. Reusable loop for Cal

### 4.1 One-time setup (M0)

1. **Token file first.** Define these before any screen exists:
   - type: 11 / 12 / 13 / 14 / 16 / 20 / 28 with line heights
   - weights: 400 / 500 / 600
   - radius: 4 / 6 / 8 / 12 / 16
   - spacing insets as semantic names
   - text roles: `foreground`, `foreground/75` (read or receding), `secondary-label` (metadata), `muted` (descriptions), `placeholder`
   - surfaces: canvas, raised, row hover/active/selected
   - one accent and the semantic colors

   Turn on lint for arbitrary values (`@shadcn/lint no-arbitrary-values` or eslint-plugin-tailwindcss equivalents).
2. **Font.** On Mac use the system font (SF Pro). For anything that might render elsewhere, bundle Inter Variable as the fallback so weights 500 and 600 exist. Use `font-variant-numeric: tabular-nums` for every time, date and count. A calendar is mostly numbers.
3. **Seeded fixture data and a frozen clock.** Make one `fixtures/review` dataset with the same data every round:
   - a realistic week: overlapping events, a 15-min event, an all-day event, a multi-day event
   - tasks with long titles, a past unfinished block (hatched), habits partly done, a "Couldn't fit" tray
   - 3 calendars with colors

   The clock is fixed to a known Wednesday at 10:40. Without this, scores drift with the data.
4. **A scene list as data.** Same idea as `cases.ts`: each scene has an `id`, a `source` (the complaint or issue it guards), the steps to reach it, and a `ready` selector. Start with:
   - week view (dark, light)
   - day view
   - month view
   - event popover/editor
   - quick entry with parsed tokens highlighted
   - Today list
   - task detail
   - drag-in-progress
   - plan-my-day diff
   - habit day strip
   - habit heatmap
   - `⌘K` palette
   - settings
   - empty states
   - narrow window (900px)

### 4.2 Capturing screenshots

**Web / desktop (React + Vite).** Use Playwright from a bun script, against the Vite dev server with the fixture:
- Fixed viewport `1280×832`, `deviceScaleFactor: 2`.
- Set `colorScheme: 'dark' | 'light'` on the context.
- Before each shot:
  - `await page.clock.setFixedTime(...)`
  - `await page.evaluate(() => document.fonts.ready)`
  - `await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })`
- Save the full frame, plus 1:1 crops of the sidebar, a dense part of the grid, and the popover. This avoids the downscaling false positives seen in #24776.

**Desktop shell.**
- **Electron:** `const app = await _electron.launch({ args: ['.'] }); const win = await app.firstWindow(); await win.screenshot({ path })` (Playwright's Electron support). The same scene runner works.
- **Real macOS chrome (traffic lights, vibrancy):** run `screencapture -o -l <windowId> out.png` once per round for the main window. `-o` drops the shadow. Get the window id from `osascript` or `GetWindowID`.
- **Tauri (the stack in PLAN.md):** Note that PLAN.md §3 recommends Tauri, while the brief for this doc says Electron. With Tauri, capture the same frontend in **Playwright WebKit**, which is the closest match to WKWebView, and add `screencapture -l` frames of the real app.

**iOS / iPadOS simulator (Expo dev build).** Follows `evals/mobile-design/ios.ts`:
```sh
xcrun simctl create "Cal Design iPhone" "iPhone 17 Pro"      # throwaway device
xcrun simctl boot <udid> && xcrun simctl bootstatus <udid> -b
xcrun simctl install <udid> <path/to/Cal.app>                 # from `bunx expo run:ios` / EAS dev build
xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4
xcrun simctl ui <udid> appearance dark                        # and light
xcrun simctl ui <udid> content_size large                     # also accessibility-extra-extra-extra-large
xcrun simctl openurl <udid> "cal://week?date=2026-10-28"      # deep link per scene (expo-router scheme)
xcrun simctl io <udid> screenshot --type=png out/iphone-week-dark.png
xcrun simctl delete <udid>                                    # when done
```
- Repeat on iPad Pro 13 in landscape and portrait.
- For taps, use Maestro or `agent-device`. If every scene is reachable by deep link, you don't need taps. Build that in from the start.
- Inside T3 Code, the `device_open` / `device_screenshot` and `preview_*` MCP tools can do the same capture by hand.

**Packing.** Build one contact sheet per scene with the poses side by side and a label above each tile (sharp or `magick montage -label '%t' … -tile x1 -geometry +24+24`). Desktop and iPad go in one pair for the "same product" axis. Keep image count per round around 40–60 for web and around 100 for mobile.

### 4.3 Reference apps

Score references **in the same round with the same rubric**, from **your own screenshots** of each app's real UI with your own account (as `references/README.md` requires). Name files `<app>-<device>-<screen>.png`, dark and light.

| App | Screens to capture | Why |
|---|---|---|
| Notion Calendar | week, day, event popover, `⌘K`, settings, menu bar | The UX we're copying. Grid density, keyboard affordances. |
| Things 3 (Mac + iPhone) | Today, Upcoming, project, quick entry, task detail | Type hierarchy, calm color, checkbox and date chips |
| Linear | list, issue detail, `⌘K`, sidebar | Sidebar rows, density, muted metadata, icon discipline |
| Capy | main view and sidebar | The app Robin said he "vibes with". Treat it as a taste reference, not a feature reference. |
| Optional: Fantastical, Apple Calendar | week, month | Native Mac and iPad calendar conventions |

Re-capture references only when those apps ship a redesign. Keep them in `design-review/references/`, and add that folder to `.gitignore` if licensing is a concern.

### 4.4 Rubric (10 categories, 1–10)

Anchors: **10 = the best app you know for this kind of work. 7 = solid but clearly behind the best. 5 = obvious problems a user would notice.** Score Cal and every reference.

| # | Category | What it covers |
|---|---|---|
| 1 | Typography | Families, sizes, weights and line heights are on the scale. Weights render. Numbers are tabular. No accidental sizes. |
| 2 | Hierarchy | The eye lands on the most important thing first in every row and panel (event title, task title, today). Metadata recedes, one step below. |
| 3 | Spacing & density | Consistent insets and gaps. Information per screen fits a power user without crowding. Alignment to a shared column. |
| 4 | Color & contrast | Neutral structure, with color only for identity (calendar colors), action/state (one accent), and meaning (overdue, conflict). Text ≥ 4.5:1, non-text ≥ 3:1. Both themes. |
| 5 | Iconography | One set (Lucide), one stroke (1.75), consistent sizes (14/16), one leading icon per row, chevrons only where things expand. |
| 6 | Consistency & polish | Same control looks the same everywhere. Radii on the scale. No double borders, clipped text, bad truncation, or misaligned baselines. |
| 7 | Clarity | Each screen says what it is and what you can do next. Labels are plain. Nothing ambiguous (a "16h" that could be an age or a wake time). |
| 8 | States & feedback | Hover, focus, selected, pressed, disabled, empty, loading, error, drag-over, pinned, done, past/unfinished. Focus is distinct from selection. |
| 9 | Calendar legibility | (Cal-specific) 15-min events readable, overlaps resolved, all-day/multi-day clear, now-line visible, events vs task blocks vs habits distinguishable at a glance, time zones readable. |
| 10 | Platform fit | Feels native on Mac (window chrome, menus, shortcuts shown) and on iOS/iPadOS (safe areas, Dynamic Type, touch targets ≥ 44pt, sheets), while reading as one product. |
| — | Overall | Not an average. The reviewer's honest judgment. |

Later-round add-ons (T3 added these at round 10 of #25251): **Accessibility** (VoiceOver labels, Dynamic Type, reduced motion), **Responsive** (900px window, iPad split view), **Motion** (drag, view switch, no bounce), **Copy** (sentence case, plain verbs).

### 4.5 Brief template (`design-review/BRIEF.md`, regenerated each round)

```markdown
# Design review: Cal, round {{ROUND}}

You are a senior product designer reviewing Cal, a keyboard-first calendar + tasks + habits app
for Mac (desktop) and iPhone/iPad. Its taste references are Notion Calendar, Things 3, Linear
and Capy. This is a read-only review: do not edit files, run servers, or open browsers or
simulators. Read every image listed below before you score. You may read the source tree at
{{REPO_PATH}} to cite file:line for fixes.

## The pack
Paths are relative to this file.
- `cal/<scene>-<pose>.png`: the build under review. (Which commit is under review is not
  disclosed. Do not guess.)
- `crops/<scene>-<region>.png`: 1:1 crops. If a full frame and a crop disagree, trust the crop.
- `references/<app>-<device>-<screen>.png`: the reference apps, same screens where they exist.
- `flows/<task>.png`: one frame per step, labelled with the action and tap/keystroke count.

The data is a fixture with a frozen clock. Don't score the wording of event or task titles. Do
score how the app lays them out and truncates them.

Scenes:
{{SCENES}}   <!-- id, title, what it guards -->

Owner decisions. Do not score these down or ask to change them:
{{OWNER_CALLS}}   <!-- e.g. "calendar colors stay saturated on event blocks", "#000 dark canvas" -->

Previous round's open fixes, and what was done with each (applied / declined + reason):
{{LEDGER}}

## How to score
Score each category 1–10 for Cal (desktop), Cal (iPhone), Cal (iPad), and each reference app.
10 is the best app you know for this kind of work; 7 is solid but clearly behind the best;
5 has problems a user would notice.

Categories:
{{RUBRIC}}

## Reply format
1. Scores table: rows = categories + Overall; columns = Cal desktop, Cal iPhone, Cal iPad,
   then each reference.
2. What Cal does better than the references (keep these; max 5 bullets).
3. What feels worse, blander, or less clear than it should (name the scene and pose).
4. Prioritized fixes, most impactful first, at most 8:
   - [MUST|SHOULD|COULD] <scene/pose>: <what is wrong>. Change: <exact change with values,
     e.g. "event title 13px/16px weight 500, time 11px secondary-label, tabular-nums">.
     Source: <path>:<line>.
   MUST = blocks a 9+; SHOULD = clear improvement; COULD = taste. "Improve spacing" is not a fix.
5. End with exactly one fenced json block:
{{JSON}}   <!-- {"scores":{"cal-desktop":{...},"notion-calendar":{...}}, "fixes":[...]} -->
```

### 4.6 Running a round

1. **Prep.** Fix known issues and run lint, typecheck and tests before the round. The council skill insists on this: don't spend reviewers on things you already know about.
2. **Capture.** `bun run design:capture --out design-review/runs/r{{N}}`, then `design:pack`, which writes `BRIEF.md` and the contact sheets.
3. **Review.** Send `BRIEF.md` to 2–3 delegates from **different providers** (e.g. Opus, GPT Sol, Gemini), read-only, in parallel. In T3 Code: `orchestrator_capabilities` → one `delegate_task` per model. Save replies as `scores/<model>.md`.
4. **Summarize.** Parse the JSON blocks and take the **median** per category. Show the **delta vs the previous round and vs each reference** (the gap matters more than the raw score). Merge fixes that several reviewers raised. A fix raised by 2+ reviewers ranks above a single reviewer's MUST.
5. **Apply.** Change tokens first and components second, using MUST items you agree with. For each item, record applied / declined + reason / owner call in the ledger. Decline anything that:
   - breaks a contrast floor
   - widens scope beyond the round's surfaces
   - contradicts an owner call
6. **Re-capture** and start a new round. Don't re-review a round's images after the code has changed.
7. **Stop** when any of these is true:
   - (a) every reviewer has every category ≥ target (start at 8.5, raise to 9.0 later) **and** Cal ≥ every reference overall
   - (b) a round returns only COULD items
   - (c) a 5-round budget per surface runs out

   Then the owner looks at the before/after pair and decides. Scores are a guide.
8. **Record the results in the PR:**
   - an annotated before/after image (stacked, numbered arrows, legend)
   - the `## Council review` table (Delegate × Round, plus final Cal vs references)
   - owner calls and declined items

**Guardrails learned from T3:**
- Expect noise. Use the same reviewers across a baseline and its comparison, or flag the panel change.
- When reviewers ask for "quieter" twice in a row, check that state and identity are still readable. T3 overshot into gray and had to undo it the next day.
- Big visual shifts go behind a flag first, then default on, then delete the flag within days.
- Pixel-diff any "no visual change" refactor.

### 4.7 Output format (round summary, `runs/rN/summary.md`)

```markdown
# Cal design review: round 4 (build a1b2c3d, 2026-11-12)

| Category | Median | Opus | Sol | Gemini | Δ r3 | Notion Cal | Things 3 | Linear |
|---|---|---|---|---|---|---|---|---|
| Typography | 8.5 | 9 | 8.5 | 8 | +0.5 | 8.5 | 9.5 | 9 |
| …        |     |   |     |   |      |     |     |   |
| Overall | 8.4 | … | … | … | +0.6 | 8.6 | 9.3 | 9.1 |

## Fixes (merged, ranked)
1. MUST (3/3) Week view, dark: event titles and times share one weight, so a 15-min event reads
   as noise. Title 12px/16px 500 foreground; time 11px secondary-label tabular-nums; drop the
   time on blocks < 30 min. Source: src/calendar/EventBlock.tsx:88
2. SHOULD (2/3) …

## Ledger
| id | from | item | outcome |
|---|---|---|---|
| r3-2 | Sol | weaker focus ring | declined: below 3:1 |
```

---

## Sources

**PRs, `pingdotgg/t3code`**
- [#24776](https://github.com/pingdotgg/t3code/pull/24776) UI polish overhaul (closed)
- [#24810](https://github.com/pingdotgg/t3code/pull/24810) blue accent pass (closed)
- [#24837](https://github.com/pingdotgg/t3code/pull/24837) calmer, clearer UI that beats Claude Code and Codex (closed)
- [#24865](https://github.com/pingdotgg/t3code/pull/24865) UI design overhaul, behind a Beta toggle (merged)
- [#24883](https://github.com/pingdotgg/t3code/pull/24883) New design toggle (merged)
- [#25251](https://github.com/pingdotgg/t3code/pull/25251) color where it means something (merged)
- [#25323](https://github.com/pingdotgg/t3code/pull/25323) user bubble on black
- [#25324](https://github.com/pingdotgg/t3code/pull/25324) on by default
- [#25778](https://github.com/pingdotgg/t3code/pull/25778) only design, no toggle
- [#25968](https://github.com/pingdotgg/t3code/pull/25968) mobile design council eval (open; `evals/mobile-design/{brief.md,README.md,cases.ts,scores.ts,pack.ts,ios.ts,capture-desktop.ts,references/README.md}`)
- [#25876](https://github.com/pingdotgg/t3code/pull/25876) mobile behavior eval (closed)
- [#25869](https://github.com/pingdotgg/t3code/pull/25869) simpler composer (open)
- [#26196](https://github.com/pingdotgg/t3code/pull/26196) tool call cards (open)
- [#13397](https://github.com/pingdotgg/t3code/pull/13397) no-arbitrary-values lint
- [#13207](https://github.com/pingdotgg/t3code/pull/13207) stop restyling ui exports
- [#22287](https://github.com/pingdotgg/t3code/pull/22287) sidebar geometry tokens

**Code on main (`9bc4138923`)**
- `apps/web/src/index.css`: lines 103–112, 171, 183–190, 289–294, 1113–1225, 1234–1277, 1722–1725
- `apps/web/src/appearanceFonts.ts:13`
- `apps/web/src/main.tsx:4`
- `apps/web/src/components/sidebar/SidebarThreadRow.tsx`: lines 943–964, 1015–1036, 1168, 1351–1365, 1515
- `apps/web/src/components/settings/settingsLayout.tsx`: lines 235, 470, 489
- `apps/web/src/composerPlaceholder.ts:1`
- `.agents/skills/test-t3-app/SKILL.md`

**Skills**
- [t3dotgg/tstack](https://github.com/t3dotgg/tstack): `skills/council/SKILL.md` (commits `6efae36420`, `7de017b3fc`, `1085050f3b`) and `skills/sol-loop/SKILL.md`

**X**
- [Theo: "Think I can turn T3 Code's UI into a hill climb for Opus?"](https://x.com/theo/status/2114280056784921048)
- [Theo: "Holy shit it worked"](https://x.com/theo/status/2114577413967667628)
- [AI Coding Weekly on Theo's hill climbs](https://aicodingweekly.news/stories/theo-t3-code-search-18-hour-hill-climb-53-of-54) (secondary; not relied on)

**Not found or not public:** the web council's `/tmp/t3-council/BRIEF.md`, the full list of 10 web design categories, and the `shot` screenshot skill.
