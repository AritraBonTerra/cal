# 05: Stack for Electron (Mac) + Expo (iOS/iPadOS) + Convex

Researched 2026-10-28. This replaces PLAN.md §3 (Tauri) with the owner's decisions: Convex for sync, Expo/React Native for iPhone and iPad, Electron for the Mac with full EventKit access, and TypeScript, Tailwind and bun everywhere.

How to read this:
- Versions come from the npm registry on 2026-10-28 unless noted.
- **[unverified]** means only a secondary source or a single GitHub issue/PR supports the claim.
- **[inference]** means my own reasoning, not something a source states.

---

## 0. The owner's video

**"Did AI Kill React Native?"** by Theo (t3.gg), published 2026-09-14, 62:53. https://www.youtube.com/watch?v=oPZLPUtmROo

I read the full auto-generated transcript, pulled with `yt-dlp --write-auto-subs`. The video is not a "how to use React Native" tutorial. It is Theo reacting to Shopify's 2026-09-10 post "Native is now the future of mobile at Shopify" (https://shopify.engineering/back-to-native). Practical advice comes up along the way. Sponsors were Greptile and **Convex**, so his Convex praise (47:00–48:40) is a paid read.

### What he recommends or claims, in order
1. **Use Expo.** He quotes Jamon Holmgren (Infinite Red): "If you have React Native apps and you're not using Expo, you end up spending your time rebuilding Expo." He blames part of Shopify's pain on not adopting Expo.
   - What Expo gives you: cloud builds, OTA updates, and a **dev client**. One person deals with Apple signing and builds the dev client; everyone else scans a QR code and iterates on JS.
   - Native-only Apple capabilities (his example: share extensions) still need the signing dance.
2. **OTA updates are RN's biggest advantage, more than code sharing.** Store review delays, slow staged rollouts, and many users running old builds make native hotfixes slow (half of Twitch's users were 2+ versions behind). An OTA JS bundle can ship a fix or flip a feature the same day.
3. **Expo's web target helps agents.** Agents can iterate against the web build without a simulator. Shopify instead built a headless CLI for this, which he calls "criminally overengineered".
4. **Lists: prefer Legend List over FlashList.**
   - Legend List "has less native implications". It is pure JS, so it was ported to web.
   - T3 Code uses it in the RN app **and** in the Electron and web apps. He credits it for their scroll areas behaving better than other agent UIs.
   - Shopify is looking for a new long-term steward for FlashList and will keep fixing critical breakages in the meantime.
5. **The New Architecture is the default and much faster** (layout and effects sync, refs are effectively native). Comparisons against the old architecture, including Shopify's, overstate the gap with native.
6. **The real negatives:**
   - **Library and native build pain** comes from CocoaPods and Xcode linking, not JS.
   - **Footguns:** "one bad useEffect can just destroy the experience you have on mobile."
   - **Upgrades:** he has "never successfully bumped the version for Expo and React Native and had it just work". For big bumps he deletes the lockfile and reinstalls, or rewrites.
   - **Dependence on Meta** for access to new Apple APIs.
   - **Background work:** the JS runtime dies when an iOS app sleeps, so background data work needs native code.
7. **App size is not a real argument.** A default Expo app is roughly 20–30 MB. Shopify's native rewrite shaved about 1 MB. Bloat usually comes from assets and localization.
8. **Navigation gestures need real-device testing.**
   - Many users start the back-swipe mid-screen, not at the left edge.
   - SwiftUI's native NavigationStack only accepts the left gutter and can't be changed. Apple's own Settings app accepts the swipe from anywhere.
   - In their RN app, a leftover drawer captured the left 8 px and broke back-swipe for edge swipers.
9. **Agents have shrunk RN's skill advantage.** RN's real pitch was "learn once, write anywhere" and Meta-grade native engineers writing the bindings. Now agents write decent Swift.
   - Theo had an agent port the T3 Code RN app to UIKit and to SwiftUI, each in under 3 hours. He daily-drives the SwiftUI port.
   - RN still wins on lists and OTA. SwiftUI lists are "hell".
10. **Ecosystem risk.**
    - He says Meta has been shrinking the React/RN teams, so upstream will move slower. [unverified; his claim]
    - Shopify's libraries: Skia forks to a new name under William Candillon, FlashList needs a steward, Restyle will be archived.
11. **Test on both platforms with daily drivers.** Someone on the team has to use Android every day.
12. **He refused to discuss Electron**, beyond saying the agents-close-the-gap argument "is not the case in Electron".

### What this means for Cal
- Use Expo with dev builds and EAS Update. Use Legend List (it also runs in the Electron renderer).
- Don't build on Restyle or rely on Skia's current package name. FlashList is fine, but its steward is uncertain.
- Keep logic headless and testable without a simulator (pure TS packages + `bun test`). That captures the good part of Shopify's design at none of the cost.
- Test back-swipe and edge gestures on device. On iPad the calendar grid's horizontal pans will compete with system edge gestures.

---

## 1. "MIF 2" (speech-to-text)

**Nothing called "MIF 2" turned up.** No library, model or Expo version with that name exists in the RN/Expo ecosystem that I could find. These are the closest real names, best first:

| Candidate | What it is | Status (npm, 2026-10-28) |
|---|---|---|
| **`expo-speech-recognition`** (jamsch) | Wraps `SFSpeechRecognizer` (iOS) / `SpeechRecognizer` (Android) / Web Speech. The de facto Expo STT module. `requiresOnDeviceRecognition` defaults to **false**, so audio goes to Apple unless you set it. | 58.0.0, 2026-10-16. Versions now track the Expo SDK. |
| **`react-native-nitro-speech`** | Nitro module that says it is "the only library" supporting Apple's new **SpeechAnalyzer / SpeechTranscriber** (iOS 26). "Nitro" could plausibly be misheard. | 0.4.9, 2026-09-18 |
| **Moonshine v2** | Streaming on-device ASR model. RN bindings: `@siteed/moonshine.rn`. The model generation it ships is not stated. | 0.4.1, 2026-08-25 |
| `whisper.rn` / `react-native-executorch` | whisper.cpp (+ NVIDIA Parakeet) / Whisper on ExecuTorch, on-device. The smallest Whisper model adds about 151 MB to the app. | 0.7.4 / 0.11.0 |
| `react-native-nitro-mlx` | MLX Swift on iOS 26+: LLM, TTS, STT. "MLX" is another possible mishearing. | — |

The owner should say which one he meant. Dictation isn't in PLAN v1. If it's added for Quick Entry, `expo-speech-recognition` with `requiresOnDeviceRecognition: true` is the low-effort path on iOS. On the Mac, the Swift helper (§4) could call SpeechAnalyzer directly. [inference]

---

## 2. React Native / Expo in late 2026

### Versions and status
- **Expo SDK 58** (2026-10-15): RN **0.88** (now 0.88.1) and React **19.3**, built for **iOS 27**. `expo` 58.0.20, `expo-router` 58.0.27.
  - Prebuild generates `SceneDelegate.swift`. iOS 27 requires the UIScene lifecycle; SDK 57 offered it as opt-in.
  - Expo Router reworked its core: deterministic navigation state, and most of the forked React Navigation API is gone.
  - Strict TS API is the default, so deep `react-native/Libraries/*` imports are type errors.
  - Removed: `InteractionManager`, `ImageBackground` (deprecated), and others.
  - **"SDK 58 does not support macOS yet"**, pending react-native-macos catching up.
- **New Architecture:** it is the only architecture. 0.82 was the first New-Arch-only release, and 0.84 continued removing legacy code. Hermes V1 has been the default since RN 0.84 / SDK 56.
- **Cadence:** SDK 56 (May), 57 (June 30), 58 (Oct 15). SDK 57 was a deliberately small upgrade. RN 0.86 and 0.88 had "no user-facing breaking changes".
- **Expo Go** is "not recommended as a development environment for production apps" (SDK 57 post), and as of September 2026 it requires a login. Use a **development build** from the start. `expo-calendar` doesn't work in Expo Go anyway.
- **Expo UI** (SwiftUI/Compose components from JS) was production-ready in SDK 56. SDK 58 adds recycling `List`/`LazyVStack`, `NavigationSplitView` (2/3 columns), and toolbars. It could serve native-feeling iPad chrome (sidebar split view, toolbars). The calendar grid itself stays custom RN views.
- **Expo Router:** file-based, native tabs/toolbars are stable, and `NavigationSplitView`-style layouts are available via Expo UI.

### Styling with Tailwind
| | Uniwind | NativeWind |
|---|---|---|
| Version | **1.13.0** (2026-10-19), MIT. A paid "Pro" adds a C++ engine. | **4.2.7** stable (Tailwind **3**); **5.0.0-rc.0** (2026-09-13, Tailwind 4) |
| Tailwind | v4 only, CSS-first `@theme` in `global.css` | v4 only in v5 RC; v5 drops bare RN support |
| Build | Metro plugin, no Babel preset; styles computed at build time | v5 uses `react-native-css` 3.1.0-rc.0 |
| Platforms | iOS, Android, web, tvOS; Expo Go works (free tier) | — |
| Speed | Its own benchmark: 2,000 views in 60.7 ms vs 138 ms (NW4) / 323 ms (NW5) on iOS. Vendor numbers. | — |
| Who | Unistyles authors (uni-stack) | nativewind org |

**Pick Uniwind.** It's stable on Tailwind v4 today, and v4's CSS-first `@theme` means **the desktop app (Tailwind v4) and the mobile app can import the same `theme.css` tokens**. NativeWind v5 is still a release candidate.

### Gestures and animation (drag-heavy calendar)
- **Reanimated 4.7.1** + **react-native-worklets 0.13.1**. Reanimated 4.7 made the new layout-animations engine the default. 4.5 added CSS-style animations of shadow/border/background and `:hover`.
- **Gesture Handler 3.4.0**: 3.0 went stable 2026-05-28. Hook-based API (React Compiler compatible). `onStart`/`onEnd` were renamed `onActivate`/`onDeactivate`. New Architecture only.
- **Pattern for the grid** [inference, standard RNGH/Reanimated practice]:
  - Keep all drag state in shared values. Hit-test and snap to 15 min inside worklets on the UI thread. Call `runOnJS` only on drop, to fire the Convex mutation with an optimistic update.
  - Never `setState` per pan frame.
  - **Create:** `Pan` on empty grid → ghost block.
  - **Move:** `LongPress(minDuration≈250)` → `Pan` composed with `Gesture.Simultaneous`. On iPad, also accept trackpad/mouse drags without the long-press.
  - **Resize:** small edge handles with their own `Pan`, and `hitSlop` so they're touchable.
  - **List → grid:** a single top-level drag overlay (portal) sits above sidebar and grid. On activation, hide the source row and render the ghost in the overlay. The grid publishes its measured frame and scroll offset as shared values. Auto-scroll with Reanimated `scrollTo` near edges.
- **Libraries worth reading, not depending on:**
  - **react-native-drax**: Reanimated 4/RNGH 3, UI-thread-first. Cross-container drag is "experimental".
  - **@howljs/calendar-kit** 2.x: drag-to-create/edit on RNGH and Reanimated, but "not yet fully optimized for the web".
  - Building our own gives the Notion-Calendar semantics PLAN §5.1 needs (⌥-duplicate, ⇧ no-snap, cross-day).

### Lists
- **Legend List 3.7.0** (2026-10-26): "100% JS", drop-in for FlatList/FlashList, bidirectional infinite scroll, `maintainVisibleContentPosition`, React DOM entry `@legendapp/list/react`, web `scrollElement`. Use it for task lists, the Logbook and search results, **on both mobile and desktop**.
- **FlashList 2.3.3** (2026-10-01): pure-JS v2, New Arch only. Shopify is leaving RN and wants a new steward.
- The calendar grid is **not** a virtualized list. Render the visible N day columns (1–3 on iPhone, up to 7+ on iPad) with absolutely positioned blocks. Page horizontally with a 3-page window (prev/current/next). [inference]

### iPad: hardware keyboard, pointer, windows
- **Keyboard shortcuts:** RN core has no `UIKeyCommand` API. Options:
  - `react-native-apple-key-commands` 0.1.1: Expo module, iOS only, `UIKeyCommand`, works in iPad-on-Mac. No menu-bar integration. Brand new (July 2026).
  - Expensify `react-native-key-command`: iOS, Android and web; needs AppDelegate edits.
  - `react-native-external-keyboard`: focus management and key events.
  - **Recommended: a small local Expo module (~100 lines Swift).** It installs `UIKeyCommand`s with titles on the root view controller, so they show in the hold-⌘ overlay. Set `wantsPriorityOverSystemBehavior = true` or arrows and Tab won't fire on iPadOS 15+.
  - `UIKeyCommand` has no auto-repeat, so hold-to-repeat `←`/`→` (PLAN §5.1) needs `pressesBegan`/`pressesEnded` handling in the same module. [unverified, from a GitHub PR]
  - The command list itself is shared TS (§6).
- **Multi-window:** RN 0.88 and SDK 58 adopt `SceneDelegate`, but running several RN window scenes at once is still not mainstream. RN is built around one root view and one JS context. Support **resizable single-window** (Split View / Stage Manager); on iOS 27, `requireFullScreen` no longer prevents resizing. Skip multi-window.
- **Pointer:** treat iPad trackpad as first-class for the grid (hover states, click-drag without long-press). Verify hover events on a real device. [unverified for RN 0.88 specifics]

### What makes RN feel native vs janky
- **Native:**
  - native stack navigation with full-width back swipe (test it)
  - gestures and animations on the UI thread
  - system controls via Expo UI (date pickers, menus, sheets)
  - haptics on snap
  - Hermes V1, release builds
  - lists that recycle
  - a consistent 120 Hz on ProMotion
- **Janky:**
  - JS-thread animations or `setState` per frame
  - `useEffect` chains that refetch or re-render whole screens (Theo's main footgun)
  - huge Convex query results feeding every component (subscribe per visible range)
  - Android-style drawers stealing edge gestures
  - judging performance in dev mode
- Use React Compiler. Profile with React Native DevTools. Test release builds on device.

### EAS
- **EAS Build** for signed iOS builds without hand-managed Xcode settings.
- **EAS Update** for OTA JS fixes, which Theo calls RN's biggest win.
- **EAS Submit** for TestFlight.
- EAS Observe now records native crashes too (October 2026).

---

## 3. Sharing code between the Mac (Electron) and iOS/iPadOS (Expo)

| | (a) Expo app → react-native-web, hosted in Electron | (b) Separate React DOM app in Electron, shared logic packages | (c) React Native macOS (Microsoft) | (d) Other: Mac Catalyst / iPad-on-Mac, Electrobun |
|---|---|---|---|---|
| UI shared | ~85–95% | 0% of views; hooks/view-models/logic shared | high with iOS (but no Expo) | ~100% (Catalyst) |
| Desktop UI quality | RN primitives rendered to DOM. Missing desktop affordances (text selection, context menus, focus rings, hover) need work. | Best: real DOM, CSS, native-feeling web desktop UI like Notion Calendar | Native AppKit views | Catalyst = iPad UI on Mac; Electrobun = system WebKit |
| Keyboard/drag fidelity | **Weak spot.** RNGH web Pan bugs open in Oct 2026: #4607 (the move that crosses the view edge is dropped; `onEnd` reports a stale position, which hits drag handles), #4636 (stale velocity), hover start issues. | Pointer Events + `setPointerCapture` + keydown: full fidelity, no abstraction | Good keyboard (`onKeyDown` in RN-macOS) but small ecosystem | Catalyst keyboard via UIKeyCommand |
| EventKit | Same as (b), via Electron main | Swift helper via Electron main (§4) | Direct native module | Catalyst: expo-calendar works natively |
| Version risk | Expo SDK 58 defaults Router web output to `server`; set `web.output: "single"`/`"static"` for Electron [inference] | Low | **High: react-native-macos is at 0.83.0 (2026-09-30) vs RN 0.88. SDK 58 has no macOS.** | Expo doesn't officially support Catalyst. A maintainer floated it as "perhaps easier" (Nov 2025). |
| Complexity | One UI, but desktop polish fights the abstraction | Two UIs, one model | Two RN toolchains, lagging fork | Low code, low ceiling |

**Recommendation: (b).** Reasons:
1. **The grid is the product, and the Mac is where it matters.** The keyboard-first Notion Calendar UX (number-key views, ⌥-drag duplicate, ⇧ box-select, hold-to-repeat) is easiest to build to a high bar in the DOM. Touch and desktop grids differ anyway: Notion Calendar's own mobile app is limited to 1/2/3 days (research/01).
2. Option (a) puts the desktop's most important interaction (pointer drag) on RNGH's web backend, the least-tested path, with open bugs on exactly these cases.
3. Option (c) is ruled out by the version lag and Expo's lack of macOS support. Option (d) Catalyst would give EventKit for free, but caps Mac UX at "iPad app".
4. This is what Theo's T3 Code does: a separate Electron/web React DOM app and an RN mobile app, sharing the wire protocol and Legend List.
5. Agents make writing two view layers much cheaper, which is the video's main argument.

**What gets shared in (b):** the Convex backend and generated API, the domain types, the scheduler, the NL parser, recurrence/time math, Convex-backed React hooks and view-models (React is the same on both sides), the command/keybinding registry, theme tokens (`theme.css`), and Legend List. Only views and gesture code are written twice.

---

## 4. EventKit from Electron (and on iOS)

### Options on the Mac
| Option | Notes | Verdict |
|---|---|---|
| `eventkit-node` (dacay) | Swift via node-gyp. Covers calendars, events (`saveEvent(data, span)`), reminders, sources. **No change-notification API.** 9 stars, MPL-2.0, last publish 1.0.5 on 2026-03-19, no prebuilds. | Read as reference only. |
| `node-mac-permissions` (codebytere) | Only asks for and checks permissions: `askForCalendarAccess('full')` (default is `'write-only'`), `getAuthStatus('calendar')`. 2.5.0, last release 2025-03-15. | Not needed if the helper handles auth. |
| Node-API addon in Swift (`node-swift`, 583★) or Obj-C++ (`node-addon-api`) | In-process and fast. Node-API is ABI-stable, so rebuilds aren't needed per Electron version. A crash takes down the main process. | Viable second choice. |
| **Swift helper binary (stdio JSON)** | Separate process, Swift concurrency, testable from a terminal, crash-isolated, no node-gyp. Costs JSON serialization, trivial at calendar scale. | **Recommended.** |

**Helper design** (`calkit`, a SwiftPM executable) [inference unless cited]:
- **Protocol:** newline-delimited JSON-RPC over stdin/stdout.
  - Methods: `auth.status`, `auth.request`, `calendars.list`, `sources.list`, `events.range {start,end,calendarIds}`, `event.save {..., span}`, `event.remove {id, span}`, `reminders.*`.
  - Server→client notification: `store.changed`.
- **Change detection:** subscribe to `EKEventStoreChanged`. Apple: it is posted "whenever changes are made to the Calendar database"; "Individual changes are not described"; refetch everything you hold, as it is "considered stale". The system posts it on the main actor, so the helper needs a running main run loop (`dispatchMain()`/`RunLoop.main`). Debounce, then emit `store.changed`; the renderer refetches the visible range.
- **Dates:** the helper returns UTC instants + IANA time zone + an `allDay` flag. All-day events become floating dates (PLAN §3).
- **Lifecycle:** spawn from the Electron **main** process and expose a typed API to the renderer via `contextBridge`. Restart on crash.

**Permissions, signing and the TCC trap:**
- **Info.plist:** add `NSCalendarsFullAccessUsageDescription` (and `NSRemindersFullAccessUsageDescription` if Reminders) to the **Electron app's** Info.plist (Forge/packager `extendInfo`, or electron-builder `mac.extendInfo`). Keep the legacy `NSCalendarsUsageDescription` only if you support macOS ≤13.
- **Request API:** `requestFullAccessToEvents` (macOS 14+). There is no read-only access: "To read events or reminders from the event store, your app needs full access". Write-only access sees one virtual calendar and reads nothing.
- **Entitlement:** `com.apple.security.personal-information.calendars = true` in the hardened-runtime entitlements. Apple: "enable the App Sandbox or Hardened Runtime capability … and then select Calendar". It is required for notarized, non-App-Store distribution.
- **TCC attributes a spawned helper to the *responsible process*, the Electron app.** The helper's own Info.plist and entitlements are not consulted. If the app lacks the usage key or entitlement, **the request is denied silently with no prompt**. T3 Code has this exact open bug (#21283). So the keys and entitlement go on the app; the helper is signed with the same Developer ID and hardened runtime. [unverified as a rule, but consistent across about 8 independent issues/PRs]
- **Dev-mode corollary:** with `electron .`, the responsible app is the stock `Electron.app` in node_modules (or your terminal), which lacks the key. Fixes [inference]:
  - test calendar features in a signed dev package; or
  - run `calkit` standalone from a terminal that has calendar access; or
  - launch it via `launchctl submit`/Launch Services so it becomes its own responsible process.
- **Re-prompts:** ad-hoc re-signing changes the code hash and re-prompts. Reset with `tccutil reset Calendar <bundle-id>`.
- **Helper location:** put the binary in `Contents/MacOS/` or `Contents/Helpers/` (nested code belongs there, not in Resources), then sign and notarize via `@electron/osx-sign` + `@electron/notarize` (Forge does both). Electron's docs: Squirrel.Mac autoUpdater "requires the app to be signed for automatic updates to work at all". [placement: inference from Apple's nested-code rules]

**Limits to design around:**
- `EKCalendarItem.attendees` is "read-only; it is not possible to add attendees with Event Kit". So no invites or RSVPs from Cal through EventKit; that needs the Google/Graph APIs (PLAN M7).
- Event identity:
  - `eventIdentifier` "most likely changes" if the event's calendar changes.
  - `calendarItemIdentifier` is lost on a full sync.
  - `calendarItemExternalIdentifier` works across devices, **but** it is shared by all occurrences of a recurring event (add the start date), can be duplicated (ICS imports, delegates, shared + invited), and **differs between iOS and macOS for Exchange**.
  - Store all three plus calendar id and start date, and match tolerantly. For events Cal writes (exported time blocks), also put `cal://block/<id>` in the event's `url`, a key we control. [inference]

### On iOS/iPadOS: `expo-calendar` 58.0.6
- **API:** the class-based API is now the root export (`ExpoCalendar`, `ExpoCalendarEvent`, `ExpoCalendarReminder`); the old `*Async` functions moved to `expo-calendar/legacy`, and the deprecated ones "will throw in runtime".
  - Queries: `Calendar.listEvents(calendars, start, end)`.
  - Writes: `calendar.createEvent`, `event.update`, `event.delete`.
  - Recurrence: `RecurrenceRule`. The full iOS field set includes `daysOfTheWeek`, `setPositions` and more.
  - Reminders (iOS).
  - Config plugin `calendarPermission` writes the full-access keys.
- **Gaps for Cal:**
  - **No change listener.** Refetch on `AppState` → active and on a timer.
  - **Span edits are unclear.** `update()`/`delete()` take no span options. `RecurringEventOptions {futureEvents, instanceStartDate}` only appears on `getOccurrenceSync`, and the docs don't say how it interacts with update.
  - Attendees can't be edited on iOS.
- **Plan:** start with expo-calendar. If we need `EKEventStoreChanged`, "this and future" edits, or speed, write a local Expo module and **reuse the Swift EventKit mapping code** from `calkit` (one SwiftPM library, two thin hosts). [inference]

---

## 5. Convex for Cal

- **Version:** `convex` 1.48.0. React Native uses the same `convex/react` client (`ConvexProvider`, `useQuery`, `useMutation`).

### Auth
| Option | Expo | Electron | Status |
|---|---|---|---|
| **Better Auth** via `@convex-dev/better-auth` 0.12.6 | official Expo guide | **official `@better-auth/electron`** (since Better Auth 1.5): system browser + custom-protocol deep link, PKCE | component is pre-1.0; issue #7149 (baseURL validation vs custom protocols) |
| Convex Auth `@convex-dev/auth` 0.0.96 (2.0.0-beta tag exists) | yes ("React Native mobile app") | works in the renderer as an SPA for password/OTP; OAuth redirects in Electron are DIY [inference] | **beta**, "may change in backward-incompatible ways" |
| Clerk (`@clerk/expo` 4.14.4) | strong ("great … React Native support") | nothing official found | paid service at scale |

**Pick Better Auth** because it is the only option with first-party integrations for both Expo and Electron. For a weekend start, Convex Auth with email+password also works everywhere with no deep links. Convex has no RLS: check `ctx.auth` at the top of every public function.

### Offline: the main conflict with PLAN §2
PLAN says "Local-first… everything works offline". **Convex alone does not do that.**
- **What Convex does:**
  - The client "will handle reconnecting and re-establishing the Convex session automatically".
  - Mutations run "one at a time in a single, ordered queue", are retried "until they are confirmed", and the backend makes "every mutation call only execute once".
  - Optimistic updates are "run when a mutation is initiated, rerun if the local query results change, and rolled back when a mutation completes".
  - Mutations started while disconnected wait in memory and send on reconnect.
- **What it doesn't do:**
  - No persisted outbox and no persisted query cache: **pending writes are lost if the app quits offline**, and a cold start offline shows nothing.
  - Actions in flight fail on disconnect.
  - [unverified, community PR] Convex 1.46 on RN listens for the browser `online` event and takes about 60 s to notice a dead socket. Nudge reconnects from `AppState`/NetInfo.
- **Paths:**
  1. **v1 (recommended):** Convex direct, online-first with optimistic updates on every user-facing mutation. Show the connection state (`useConvexConnectionState`). Also keep a small persisted read cache (MMKV on mobile, a JSON/SQLite file on desktop) so a cold start shows last-known data read-only. Make every write offline-ready now:
     - client-generated UUID `clientId` on every document
     - idempotent upsert mutations keyed by `clientId`
     - no server-computed values the UI waits on
  2. **Later, true offline:** **PowerSync + Convex**, *experimental* since 2026-06-10.
     - Local SQLite on each client; the upload handler calls our existing Convex mutations; Convex stays the source of truth.
     - Replication polls Convex's streaming export every 1000 ms (fixed on PowerSync Cloud).
     - Needs a UUID→`_id` mapping, which path 1's `clientId` already provides.
     - Alternative: community `convex-offline` (Yjs CRDTs, op-sqlite).
- Device calendars are **always** available offline, since they're read locally from EventKit.

### Modeling device-local calendar data
- **Convex holds only Cal's own data:** areas, projects, headings, tasks, checklistItems, tags, timeBlocks, habits, habitEntries (append-only), habitPauses, timeMaps, schedulerRuns/placements, settings, devices.
- **EventKit events never live in Convex as truth.** Each client reads its own EventKit for the visible range. The Mac and iPhone usually have the same iCloud/Google/Exchange accounts, so both see the same events without Cal syncing them.
- **Export link table** (`calendarLinks`): `{ blockId, deviceKind, calendarId, eventIdentifier, externalIdentifier, occurrenceStart, url: "cal://block/<id>" }`. Opt-in per account, as PLAN §8.4 suggests.
- **Scheduler runs on the client** because it needs device busy times. `plan()` is a pure TS function; the client calls it with local events plus Convex data, then writes placements in one mutation guarded by a `planVersion`. Optionally a device can publish anonymized **busy intervals** (start/end only) so another device's planner sees Mac-only calendars. [inference]
- **Crons** handle server-only chores: day rollover at the user's 04:00 (habit periods, unfinished-block rollover counts), next instance of recurring tasks, habit strength materialization if needed.
  - Cron times are **UTC only**, so run hourly and select users whose local boundary passed.
  - "At most one run of each cron job can be executing at any moment", and overlapping runs may be skipped.
  - Notifications and alarms should be **local** (device), not Convex.

### Limits that matter
- **Transactions:** queries and mutations get 1 s of user-code time. Per transaction: 16 MiB read, 32,000 documents scanned, 16,000 written, 4,096 index ranges. The scheduler's write mutation must stay small (fine).
- **Documents:** 1 MiB max, 8,192 array elements, 32 indexes per table.
- **Free plan:** 1M function calls/month, 0.5 GB DB, 1 GB DB I/O/month. Generous for one user, but reactive queries over large ranges add up. Subscribe per visible window.
- **Scheduling:** a mutation can schedule up to 1,000 functions.

---

## 6. Monorepo with bun

- **bun workspaces, no Turborepo at first.** Two apps and a handful of source-only packages don't need a task graph. `bun --filter` runs scripts across workspaces. Add Turbo only if CI caching starts to matter.
- **Linker: set it explicitly.**
  - Bun 1.3.2+ defaults new *workspace* projects to the **isolated** linker. Bun is now at 1.4.x; one report says 1.4 forces isolated when workspaces exist. [unverified]
  - Expo officially supports isolated installs since SDK 54, but warns "some React Native libraries may cause build or resolution errors", and documents a hoisted fallback only for pnpm.
  - A 2026 report shows CocoaPods autolinking paths breaking under bun's isolated store. [unverified, blog]
  - **Start with `bunfig.toml` → `[install] linker = "hoisted"`.** Revisit later.
- **Single copies:**
  - "Duplicate React Native versions in a single monorepo are not supported"; duplicate React in one app breaks at runtime.
  - Pin `react`/`react-dom` to the version RN 0.88 uses (19.3.x) in the root `resolutions`. The desktop app uses the same React.
  - Check with `bun pm why react`.
- **Metro:** auto-configured for monorepos since SDK 52. Don't hand-set `watchFolders`/`nodeModulesPaths`. Autolinking module resolution is on by default for monorepos since SDK 55.
- **Shared packages:** ship **TS source** (`"exports": {".": "./src/index.ts"}`), no build step; Metro and Vite both compile TS. Keep shared packages free of `react-native` and DOM imports. If a split is unavoidable, use explicit entry points (`@cal/x/native`, `@cal/x/web`) rather than `.native.ts` suffixes, which Vite doesn't resolve by default. [inference]
- **Convex:**
  - Lives in `packages/backend/convex`. Run `bunx convex dev` there.
  - Apps import `@cal/backend/convex/_generated/api`.
  - URLs: `EXPO_PUBLIC_CONVEX_URL` for mobile, `VITE_CONVEX_URL` for desktop.
  - Server-side shared code (validators, scheduler types) must be importable by Convex's bundler, so keep it dependency-light.
- **Tooling:**
  - One formatter/linter across the repo (Biome, or oxlint+Prettier). There's no existing project config.
  - `tsc --noEmit` per workspace, and `bun test` for packages.
  - `expo lint` is optional for mobile-specific rules.

---

## 7. Recommended architecture

**Summary:** Electron 45 + Vite + React 19 DOM + Tailwind v4 on the Mac, with a Swift `calkit` helper for EventKit. Expo SDK 58 + Expo Router + Uniwind + Reanimated 4 + RNGH 3 + Legend List 3 on iPhone and iPad. Convex holds Cal's own data. Device calendars stay on each device. Shared TS packages hold everything below the view layer.

```
cal/
├─ package.json              # "workspaces": ["apps/*","packages/*"]; resolutions: react 19.3.x
├─ bunfig.toml               # [install] linker = "hoisted"
├─ tsconfig.base.json
├─ biome.json
├─ apps/
│  ├─ desktop/               # Electron 45 (Forge 8 + Vite) — the primary surface
│  │  ├─ src/main/           # windows, menu bar (tray), global hotkey (Quick Entry), local notifications,
│  │  │                      # spawns calkit, IPC handlers, deep-link protocol for auth
│  │  ├─ src/preload/        # contextBridge: typed window.cal.{calendar,app}
│  │  ├─ src/renderer/       # React DOM: grid (pointer events), sidebar, ⌘K, Legend List (@legendapp/list/react)
│  │  ├─ native/calkit/      # SwiftPM: CalKitCore (library) + calkit (executable, JSON-RPC over stdio)
│  │  └─ build/entitlements.mac.plist   # hardened runtime + personal-information.calendars
│  └─ mobile/                # Expo SDK 58, dev client, EAS Build/Update
│     ├─ app/                # Expo Router routes (iPhone stack, iPad split view)
│     ├─ src/grid/           # RN grid: RNGH 3 + Reanimated 4 worklets, drag overlay
│     └─ modules/
│        ├─ cal-keys/        # local Expo module: UIKeyCommand + key repeat, discoverability titles
│        └─ cal-eventkit/    # later: EKEventStoreChanged + span edits, reusing CalKitCore
├─ packages/
│  ├─ backend/               # convex/: schema.ts, tasks.ts, blocks.ts, habits.ts, crons.ts, auth (Better Auth)
│  ├─ domain/                # types, ids (clientId), Temporal helpers, floating dates, rrule wrappers
│  ├─ scheduler/             # pure plan(inputs, prev, now) + bun test snapshot suite
│  ├─ nlp/                   # chrono-node Quick Entry parser (tokens: tomorrow, !deadline, #tag, ~45m, p1)
│  ├─ calendar-source/       # ExternalEvent type + CalendarSource interface (EventKit desktop/iOS, later Google)
│  ├─ app-core/              # React hooks/view-models over Convex (useVisibleRange, useBlocks, optimistic
│  │                         # updates), undo stack, command registry (id, title, default keys) — no DOM/RN imports
│  └─ theme/                 # theme.css: Tailwind v4 @theme tokens imported by desktop Tailwind and Uniwind
```

**Data flow:**
1. The renderer or RN screen asks `app-core` for the visible range.
2. Convex queries return tasks, blocks and habits; the `CalendarSource` returns device events (calkit or expo-calendar).
3. View-models merge both into one timeline.
4. Edits go through Convex mutations with optimistic updates.
5. A device `store.changed` triggers a refetch of only the device events.
6. The scheduler runs client-side and commits placements in one guarded mutation.

**Build order, mapped to PLAN milestones:**
- **M0:** monorepo, backend schema, auth, `app-core`, and desktop shell with calkit returning calendars.
- **M1–M2:** desktop grid + EventKit read/write + `store.changed`.
- **M3–M4:** tasks and time-blocking on desktop.
- **M4.5:** the iPhone/iPad app reuses all packages, with a touch grid (1–3 days on iPhone, more on iPad) and a hardware-keyboard module.
- **M6:** scheduler.
- **Later:** PowerSync if offline writes become a real need.

**Open questions for the owner:**
1. Which "MIF 2" was meant (§1)?
2. Is online-first with optimistic updates acceptable for v1, given PLAN's local-first principle (§5)?
3. Better Auth or Convex Auth for the first cut?
4. Distribute the Mac app outside the App Store (Developer ID + notarization, assumed here) or via the Mac App Store (adds App Sandbox)?

---

## Sources

**Video**
- Theo, "Did AI Kill React Native?" (2026-09-14): https://www.youtube.com/watch?v=oPZLPUtmROo (auto-captions via yt-dlp)
- Shopify Engineering, "Native is now the future of mobile at Shopify": https://shopify.engineering/back-to-native (via https://simonwillison.net/2026/Sep/10/shopify-react-native/)

**Expo / React Native**
- Expo changelog index: https://expo.dev/changelog
- Expo SDK 58: https://expo.dev/changelog/sdk-58
- Expo SDK 57: https://expo.dev/changelog/sdk-57
- Expo SDK 56: https://expo.dev/changelog/sdk-56
- Expo monorepos guide: https://docs.expo.dev/guides/monorepos/
- Expo additional platform support (macOS/tvOS at module level only): https://docs.expo.dev/modules/additional-platform-support/
- Expo discussion on macOS / Catalyst: https://github.com/expo/expo/discussions/22273
- expo-calendar docs: https://docs.expo.dev/versions/latest/sdk/calendar/
- expo-calendar migration guide: https://docs.expo.dev/guides/sdk-libraries-migration/calendar/
- React Native blog (0.84–0.88): https://reactnative.dev/blog
- react-native-macos releases: https://github.com/microsoft/react-native-macos/releases
- react-native-macos 0.83–0.87 tracker: https://github.com/microsoft/react-native-macos/issues/3098
- react-strict-dom releases: https://github.com/react/react-strict-dom/releases
- Evan Bacon on RNW becoming optional: https://x.com/Baconbrix/status/2053866784957362302

**Styling**
- Uniwind: https://github.com/uni-stack/uniwind
- Uniwind docs: https://docs.uniwind.dev/
- Uniwind vs NativeWind: https://uniwind.dev/vs-nativewind
- NativeWind releases: https://github.com/nativewind/nativewind/releases
- NativeWind v5 docs: https://www.nativewind.dev/v5/core-concepts/tailwindcss

**Gestures, animation and lists**
- Reanimated changelog: https://swmansion.com/changelog/react-native-reanimated/
- Gesture Handler 3.0.0: https://github.com/software-mansion/react-native-gesture-handler/releases/tag/v3.0.0
- RNGH web issue #4607: https://github.com/software-mansion/react-native-gesture-handler/issues/4607
- RNGH web issue #4636: https://github.com/software-mansion/react-native-gesture-handler/issues/4636
- Legend List: https://github.com/LegendApp/legend-list
- Legend List releases: https://github.com/LegendApp/legend-list/releases
- FlashList releases: https://github.com/Shopify/flash-list/releases
- react-native-drax: https://github.com/nuclearpasta/react-native-drax
- calendar-kit: https://github.com/howljs/react-native-calendar-kit

**iPad**
- react-native-apple-key-commands: https://store.boilerplate.com/product/npm/react-native-apple-key-commands
- Expensify react-native-key-command: https://github.com/Expensify/react-native-key-command
- react-native-external-keyboard: https://github.com/ArturKalach/react-native-external-keyboard
- Apple forum on `wantsPriorityOverSystemBehavior`: https://developer.apple.com/forums/thread/687666
- RN multi-window write-up [secondary]: https://vp0.com/blogs/multi-window-support-react-native-ios
- RN 0.88 UIScene notes (Customer.io): https://docs.customer.io/integrations/sdk/react-native/whats-new/ios-27-uiscene-support/

**Speech**
- micdrop overview: https://micdrop.dev/blog/speech-to-text-react-native
- expo-speech-recognition: https://github.com/jamsch/expo-speech-recognition
- nitro-speech: https://github.com/NotGeorgeMessier/nitro-speech
- react-native-nitro-mlx: https://github.com/corasan/react-native-nitro-mlx
- @siteed/moonshine.rn: https://npmx.dev/package/@siteed/moonshine.rn

**Electron and EventKit**
- Electron releases: https://releases.electronjs.org/
- Electron code signing: https://www.electronjs.org/docs/latest/tutorial/code-signing
- Apple, Accessing the event store: https://developer.apple.com/documentation/eventkit/accessing-the-event-store
- Apple, requestFullAccessToEvents: https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoevents(completion:)
- Apple, Calendars entitlement: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.personal-information.calendars
- Apple, NSCalendarsFullAccessUsageDescription: https://developer.apple.com/documentation/bundleresources/information-property-list/nscalendarsfullaccessusagedescription
- Apple, EKEventStoreChanged: https://developer.apple.com/documentation/foundation/nsnotification/name-swift.struct/ekeventstorechanged
- Apple, attendees (read-only): https://developer.apple.com/documentation/eventkit/ekcalendaritem/attendees
- Apple, calendarItemExternalIdentifier: https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemexternalidentifier
- Apple, eventIdentifier: https://developer.apple.com/documentation/eventkit/ekevent/eventidentifier
- Apple, calendarItemIdentifier: https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier
- eventkit-node: https://github.com/dacay/eventkit-node
- node-mac-permissions: https://github.com/codebytere/node-mac-permissions
- node-swift: https://github.com/kabiroberai/node-swift
- TCC responsible-process reports:
  - https://github.com/pingdotgg/t3code/issues/21283
  - https://github.com/microsoft/vscode/issues/307364
  - https://github.com/FradSer/mcp-server-apple-events/issues/93
  - https://github.com/swiftbar/SwiftBar/pull/549
- Electrobun 2.0 (alternative shell): https://blackboard.sh/blog/electrobun-2-0/

**Convex and auth**
- Convex React Native: https://docs.convex.dev/client/react-native
- Convex React client: https://docs.convex.dev/client/react
- Optimistic updates: https://docs.convex.dev/client/react/optimistic-updates
- ConnectionState: https://docs.convex.dev/api/modules/browser
- Limits: https://docs.convex.dev/production/state/limits
- Cron jobs: https://docs.convex.dev/scheduling/cron-jobs
- Auth overview: https://docs.convex.dev/auth
- Convex Auth: https://labs.convex.dev/auth
- Convex + Better Auth: https://labs.convex.dev/better-auth
- Better Auth Electron: https://better-auth.com/docs/integrations/electron
- Better Auth 1.5: https://better-auth.com/blog/1-5
- PowerSync + Convex (experimental): https://releases.powersync.com/announcements/announcing-convex-backend-support-experimental
- convex-offline: https://github.com/musicmindmachine/convex-offline
- Convex Automerge post: https://stack.convex.dev/automerge-and-convex

**bun**
- Isolated installs: https://bun.com/docs/pm/isolated-installs
- Bun 1.3.2: https://bun.com/blog/bun-v1.3.2
- Bun isolated linker vs Expo [secondary]: https://www.taosu.blog/blog/09-bun-isolated-linker-expo-builds/

**Package versions:** `https://registry.npmjs.org/<pkg>` dist-tags, fetched 2026-10-28.
