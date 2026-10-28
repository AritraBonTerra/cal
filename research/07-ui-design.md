# 07: UI design. Reference teardowns, craft principles, and Cal's design direction

Researched 2026-10-28. This doc assumes the stack named in the brief, Electron on Mac and Expo/React Native on iPad, both styled with Tailwind. PLAN.md still says Tauri. Almost nothing here depends on that choice, and where it does I say so.

How I gathered this:
- **[css]** means I read the value from CSS or JS that the product shipped on 2026-10-28: capy.ai, docs.capy.ai, linear.app, and the calendar.notion.so web app bundle. This is better evidence than any write-up, but marketing sites can differ from the logged-in app.
- **[shot]** means I observed it in a first-party screenshot: Capy changelog images, Notion's product page, the Things blog. Pixel values from screenshots are estimates.
- **[unverified]** means only one secondary source supports it, or I'm working from memory.

## The short version

1. **Font.** Use SF Pro through the system font on both platforms. Notion Calendar and Things do the same, it costs nothing to load, and Apple's license allows it as long as you don't embed the files. Turn on tabular numerals for every time, date and count.
2. **Type scale.** Six sizes and three weights. Body text is 13px on Mac and 15pt on iPad. Use 400, 500 and 600, and allow 700 only for the big date header.
3. **Color.** Chrome is near-neutral, with hue 75 at chroma 0.006 or less. Saturated color goes to calendar data. Beyond that there is one blue accent and one red for "now". Author every color in OKLCH and compile it to opaque hex for both platforms.
4. **Event chips.** Each chip is a pale fill with a 3px saturated left bar. Text uses darker shades of the same hue, never gray. Selected chips switch to a solid fill with white text. All six chip colors are derived from one hue by formula, and every pair passes contrast checks.
5. **Structure.** Use hairlines and background steps. Shadows appear only on things that float. Radii are 3/4/6/10/14 and follow the concentric rule.
6. **Motion.** Keyboard navigation, selection and view switches get zero animation. Popovers get 150ms ease-out. Every animation must be interruptible and must respect reduced motion.
7. **Icons.** Use Lucide everywhere content is drawn, at 12/14/16/20px with a 1.5px absolute stroke. On iPad, use SF Symbols (via expo-symbols) for native chrome only.
8. **Platform fit.** On Mac, use the inset traffic lights, native context menus and app menus, no pointer cursor, and Settings in its own window. On iPad, use a native split view, sheets, pointer effects, 44pt targets and Dynamic Type for lists.

---

## 1. Capy (capy.ai)

### What it is
- Capy is a cloud platform for coding agents from the Scrapybara team (YC F24, about 6 people in SF). You hand tasks to agents that run in their own VMs. The agents open PRs, and a review agent checks them.
- It runs on web and as a desktop app for macOS, Windows and Linux. The desktop app shipped as 0.2.0 on 2026-09-10.
- A full visual refresh ("Capy has a new look") shipped in 0.6.0 on **2026-10-27**, the day before this research. The details below are fresh, but they could change quickly.
- The marketing site is loud, with manga panels, a capybara mascot and Bebas Neue headlines. The product is the quiet part, so ignore the marketing site for inspiration.

### The product's tokens [css]
I took these from the product-UI components embedded in capy.ai's CSS. I checked them against docs.capy.ai, which the 0.4.7 changelog says "was redesigned to match the app and follow your color theme." The app itself sits behind a login, so I didn't inspect it directly.

| Token | Value |
|---|---|
| Sans | `--font-sans: var(--font-inter)` → Inter, with Geist Mono for code |
| Weights | normal **450**, medium 500, semibold **560**, bold 700 (variable-font in-betweens) |
| Text sizes (product scale) | 2xs 11px, xs 12px, sm 13px, base **14px**, lg 18, xl 22, 2xl 26. Line height 1.2–1.3 |
| Control heights | xs 24, sm 28, base 32; menu row 28; badges 18/20/24 |
| Icon sizes | 12 / 14 / 16 / 18 |
| Radius | xs 2, sm 3–4, **md 6 (the default `--radius`)**, lg/card/overlay 8, panel/xl 12, 2xl 16 |
| Borders | black at 8% / 11% / 15% alpha in light; white at 8% / 12% / 16% in dark |
| Muted text | `color-mix(in oklch, var(--text) 62%, var(--bg))`, then 48% and 36%. Dark: 68 / 52 / 38%. These are **opaque mixes, not opacity** |
| Card shadow | `0 0 0 .5px rgb(0 0 0/.09), 0 3px 6px -2px rgb(0 0 0/.02), 0 1px 1px rgb(0 0 0/.04)` |
| Overlay shadow (light) | `0 6px 18px /3%, 0 3px 9px /4%, 0 1px 1px /5%` |
| Transitions | default 150ms `cubic-bezier(.4,0,.2,1)`; buttons are `transition-colors duration-100` |
| Button details | 0.5px border, a 1px inset top highlight (`#ffffff0a` in dark), press = `brightness(97%)` with the shadow removed, `focus-visible` outline 1px at 1px offset, first/last icon nudged 2px outward (`-ml-0.5`) for optical alignment, `text-box-trim` on labels |
| Theme inputs | `bg`, `fg`, `primary`. Everything else is derived, e.g. `primary-soft = color-mix(in oklch, primary 20%, transparent)` |

### What the screenshots show [shot]
I looked at the 0.4.0 command menu, the 0.4.6 chat, the 0.6.0 themes grid and the files views.
- **Weight.** Almost everything is Inter at regular weight. Headings such as "Theme" are barely heavier than body text, and hierarchy comes mostly from gray levels.
- **Color.** Color shows up only as tiny status dots (about 7px), teal issue IDs, and a single filled send button. Everything else is grayscale.
- **Command menu.**
  - Category tabs are plain text, and the selected tab gets a gray pill.
  - Filters are segmented chips, `Author | is | Hana Kobayashi | ×`.
  - Rows show a 16px outline icon, then the title, then right-aligned gray metadata (`DSP-7 41m`).
  - The footer shows keycap hints: `↵ Select`, `← → Category`, `Esc Close`.
- **Surfaces.** A light-gray outer panel (`#f9f9f9`) holds a white inner card with a large soft radius. The nesting comes from background steps, not lines.
- **Spinners.** "Working" states use small dot-grid spinners instead of circular ones.
- **Themes.** 0.6.0 ships 18 themes, including Capy, Linear, Notion, GitHub, Catppuccin and Gruvbox. Each one is a few inputs plus a background effect.

### Why it feels clean
1. **It uses one family with soft weights.** 450 and 560 instead of 400 and 700 means nothing turns into a bold blob, and hierarchy comes from gray.
2. **Secondary text is an opaque mix of text and background.** It isn't alpha, so it looks identical on any surface.
3. **Edges come from 0.5px rings and 8% hairlines,** not visible borders or heavy shadows.
4. **Sizes are few and tied together.** Controls are 24/28/32 and icons 12/14/16/18, so a 28px row always holds a 14px icon.
5. **Color goes only where state lives.** Dots, links and one primary button.
6. **The whole theme comes from three inputs.** That's why the 18 themes all look finished.

Cal should take points 1, 2, 3, 4 and 6 directly. Point 5 needs adapting, because a calendar is full of color by nature. That's the reason chrome has to stay even quieter than Capy's.

---

## 2. Reference app teardowns

### 2.1 Notion Calendar (formerly Cron)

**Type [css].** The web app's sans stack is `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, …`, so on a Mac it renders in **SF Pro**. Sizes in the shipped JS cluster at 11, 12, 13 and 14px (11px is the most common), with only a few larger sizes. The code uses tabular numbers (`tnum`).

**Radius [css].** `border-radius: 6px` appears 67 times. The next most common are 10px (17), 8px (12), 4px (5) and 12px (5).

**Color [css].** The Notion design system tokens (`--nds-*`) are:
- **Neutrals are warm.** Light-mode gray fills and borders are alpha of a warm brown, `rgba(84,72,49, .04/.08/.15)`. Primary text is `rgba(50,48,44)` and secondary text `rgba(120,119,116)`.
- **Every named color has three fills and three text levels.** For blue in light mode, `fill-blueSecondary` is `rgb(231,243,248)` and `text-bluePrimary` is `rgb(24,51,71)`, which gives dark same-hue text on a pale same-hue fill. In dark mode the fill becomes `rgb(20,58,78)` and the text white at 87%.
- **Shadows.** Shadows have two layers: sm `0 4px 12px -2px /8%`, md `0 14px 28px -6px /10%, 0 2px 4px -1px /6%`, lg `0 24px 48px -8px /24%, 0 4px 12px -1px /12%`. Dark-mode shadows are roughly twice as strong. A "2xs" shadow is a 1px ring, `0 0 0 1px rgba(84,72,49,.15)`.

**Grid and chips [shot]** (Notion product-page images, which date from around January 2024 and may be stale):
- **Chips.** Pastel fill, a 3–4px saturated bar on the left edge, and a title in a dark shade of the same hue at medium weight. The time sits underneath in a lighter same-hue tone. On short events the time goes inline after the title ("Prep for All Hands 11:30AM").
- **Selected and dragged events** become a solid saturated fill with white text. A dragged chip lifts with a shadow, and a red outline shows where it will land.
- **Hour labels.** Small gray text, right-aligned in the gutter, sitting on the hour line ("10AM"). Extra time-zone columns sit to the left ("EST PST").
- **Today** is a red rounded-square badge with a white day number.
- **Command menu.** A large input ("Type a command…"). The selected row gets a gray fill plus a 3px blue bar on its left edge. Single-key shortcuts appear in keycaps on the right.
- **Context menu.** A dark HUD-style menu even in light mode, with a row of color swatches at the top. Shortcuts are right-aligned in gray.

**Design philosophy (secondary).** Raphael Schaad, Cron's founder, wrote that rebuilding the calendar meant they "needed to custom-engineer everything" rather than assemble standard components (LinkedIn). A third-party summary of his design masterclass calls the idea **"adaptive precision"**: before you click, the grid shows exactly where an event would be created.

### 2.2 Things 3 (Cultured Code)

**Type.** Things uses the system font, SF Pro. Its website also uses the system stack. Since 3.18 (September 2023) the app offers **14 text sizes** on Mac, all icons are vectors, and "the layout was tuned so everything scales together."

**OS 26 refresh, 3.22 (2025-09-15).** In Cultured Code's words: "rounder curves on windows, controls and dialogs", "looser spacing", and "a touch of glass in the sidebar that lets a hint of color shine through". Glassy buttons "glow and scale" when touched. Things 3.24 (2026-09-14) adjusted the glass effects for OS 27.

**Motion.** "Everything you do in Things is nicely animated for pop," done with "our own, custom built animation toolkit." When you open a to-do, it "smoothly transforms into a clear white piece of paper." Type Travel puts keyboard navigation first: "As soon as you strike a key, the search is on."

**What the OS 26 screenshots show [shot]:**
- **Color sits in icons, not surfaces.** The sidebar list icons are colored (yellow star, red calendar, green layers). Everything else is black, gray, and one blue.
- **List titles** are large and bold, about 26pt, with a colored icon.
- **Headings** inside a project are blue semibold with a hairline underneath.
- **To-do rows.** A small rounded-square checkbox with a thin gray stroke, the title at regular weight, and the project name in small gray text on a second line.
- **Calendar events in Today** are colored text lines, with the time in the calendar's color and the title in normal text. No fills at all. This shows how far restraint can go.
- **The "When" picker** is a dark HUD even in light mode. Today and This Evening rows sit above a compact month grid.
- **Tags** are outlined pills with gray text.
- **Selection** is a pale-blue rounded fill.
- **Mac and iPad share one design.** On iPad, rows and type are larger and a floating blue Magic Plus button appears. The iPad version also gets traffic lights in windowed mode (3.22 notes).

**The lesson for Cal.** Things looks the same on Mac and iPad because it's one design at two sizes, not two designs.

### 2.3 Linear

**Tokens [css]** (linear.app's static CSS, which shares tokens with the app):

| Token | Value |
|---|---|
| Font | `"Inter Variable", "SF Pro Display", -apple-system, …`, `font-feature-settings: "cv01","ss03"`, `font-variation-settings: "opsz" auto` |
| Mono | Berkeley Mono |
| Weights | 400, **510**, **590**, 680 (light 300 exists) |
| Sizes | micro 11/12, mini 12/13, small 13/14, regular 15/16, large 18, title3 20, title2 24, title1 36 (the paired values are two density modes) |
| Radius | 4, 6, 8, 12, 16, 24, 32, rounded 9999 |
| Buttons | heights 24 / 32 / 40 / 44; font 12/13/15/16; icon 12/16/18 |
| Focus ring | 2px, 2px offset (1px in some contexts) |
| Speeds | `highlightFadeIn: 0s`, `highlightFadeOut: .15s`, `quickTransition: .1s`, `regularTransition: .25s` |
| Text (dark) | primary `#f7f8f8`, secondary `#d0d6e0`, tertiary `#8a8f98`, quaternary `#62666d` |
| Surfaces (dark) | levels `#08090a`, `#0f1011`, `#141516`, `#191a1b` |
| Shadows | low `0 2px 4px /10%`, medium `0 4px 24px /20%`, high `0 7px 32px /35%` (dark) |

Highlights fade in over 0s and out over 0.15s. Hover feedback is instant, and only its removal is soft. Copy that.

**2024 redesign (2024-03-28).** Linear rebuilt its theme system on **LCH**. "Instead of having to define 98 specific variables for each theme, we defined three: base color, accent color, and contrast." The same generator produces light, dark and high-contrast themes. Headings moved to **Inter Display**, with regular Inter for everything else. They "limit[ed] how much chrome (blue) fed into the color calculations" to get a more neutral look.

**2026 refresh (2026-03-12, "A calmer interface").** Two principles: "Don't compete for attention you haven't earned" and "Structure should be felt not seen."
- The sidebar became "a few notches dimmer."
- Icons got fewer and smaller, and colored team-icon backgrounds were removed.
- Neutrals moved from "cool, blue-ish" to "a warmer gray that still feels crisp," while avoiding "muddy."
- Separators had "quietly proliferated," so they cut them and softened border contrast.
- They built an internal tool to tune "hue, chroma, and lightness of individual design tokens."

**iOS (2025-10-21).** Linear built its own version of Liquid Glass "with a ProKit philosophy." It left out refraction because refraction "can make dense professional interfaces harder to read." With Increase Contrast on, it draws solid outlines.

### 2.4 Raycast

- **Icons (2022-07-19).** The set is "an outline style, and a bolder stroke width," and "The icons follow the same rules for stroke width and corner radii." The search bar got bigger and leading icons got larger "to make them quicker to scan."
- **Action bar.** Actions live behind `⌘K` in a bottom bar, and each action shows its shortcut "so users learn action shortcuts."
- **Raycast 2.0 architecture (2026-05-14).** It's directly relevant to Electron and Cal: a native shell (AppKit on Mac, WPF on Windows) around a system web view running one React codebase. They call it "a native app that uses web for its UI." Their checks for native feel:
  - **No `cursor: pointer` and no hover highlights on most controls.**
  - Settings opens in its own native window.
  - Popovers and tooltips are native windows, so they can extend past the window edge.
  - Liquid Glass on macOS Tahoe.
  - "A lot of work to remove flicker during view transitions."
  - Windows are pre-rendered before they show (`alphaValue = 0`, then render in a `requestAnimationFrame`) so they never flash blank.
- **Store guidelines.**
  - Actions use Title Case and an ellipsis when they open a submenu (`Set Priority…`).
  - "Avoid having a list of actions where some have icons and some don't."
  - Search bars always have placeholders.
  - Show a loading state instead of a flash of "No results."
- **Animation.** Emil Kowalski cites Raycast as the model for not animating: "Raycast has no animations and it feels right."

### 2.5 Vercel Geist

- **Typography roles.** Geist splits text into **Label** ("designed for single-lines… marrying up with icons"), **Copy** (multi-line, taller line height), **Heading** and **Button**, and gives each one a size.
  - `label-14` is the "most common text style of all. Used in many menus."
  - `label-13` is "a secondary line next to other labels". Its tabular variant is "used when conveying numbers for consistent spacing."
  - `label-12` is for "tertiary level text in busy views… and the capitals in Calendars."
  - `copy-13` is for "views where space is a premium."
- **Colors.** Ten steps per scale:
  - 100–300 are component backgrounds (default, hover, active).
  - 400–600 are borders (default, hover, active).
  - 700–800 are high-contrast fills.
  - 900 is secondary text and 1000 primary text.
- **Gray vs gray-alpha.** "Use solid gray by default. Use the matching gray-alpha step only when the edge needs to blend with its surface." Two more rules: "Overlapping alpha borders make intersections stand out" and "Opaque shadows leave a gray halo."
- **Materials.** Radius is 6px for base and small surfaces, 12px for menus, modals and larger surfaces, and 16px for fullscreen. The tooltip is the "only floating element with a triangular stem."
- **Geist font.** OFL 1.1, 9 weights, "inspired by Swiss design," with Geist Mono for "code and tabular content."

### 2.6 Apple HIG and Apple Calendar

These come from the HIG JSON pages, fetched 2026-10-28.

**Type sizes.**

| Platform | Default size | Minimum size |
|---|---|---|
| iOS / iPadOS | 17pt | 11pt |
| macOS | 13pt | 10pt |

- macOS text styles: Body 13/16, Callout 12/15, Subheadline 11/14, Footnote 10/13, Headline 13 bold, Title 3 15/20, Title 2 17/22, Title 1 22/26, Large Title 26/32.
- iOS at the default "Large" size: Body 17/22, Subhead 15/20, Footnote 13/18, Caption 12/16.
- "Avoid light font weights… prefer Regular, Medium, Semibold, or Bold."
- "Minimize the number of typefaces you use."
- SF switches automatically between Text and Display optical sizes, and the system applies size-specific tracking. On macOS that means -0.08pt at 13pt and +0.06pt at 11pt.

**Control sizes.**

| Platform | Default control size | Minimum control size |
|---|---|---|
| iOS / iPadOS | 44×44pt | 28×28pt |
| macOS | 28×28pt | 20×20pt |

Leave "about 12 points of padding around elements that include a bezel," and about 24 around elements without one.

**Contrast.** The minimum is 4.5:1 for text up to 17pt. "For custom foreground and background colors, strive for a contrast ratio of 7:1, especially in small text." Check both appearances, and Increase Contrast too.

**Dark mode.** "Avoid offering an app-specific appearance setting." Dark colors "aren't necessarily inversions of their light counterparts."

**Motion.**
- "In apps, generally avoid adding motion to UI interactions that occur frequently."
- "Let people cancel motion… don't make people wait for an animation to complete."

**Concentricity (WWDC25 session 356).**
- There are three shape types: fixed, capsule, and concentric, where "inner radius = outer radius − padding."
- "If a corner in your design system just feels off, it probably needs to be concentric."
- On iPad and Mac, use concentric shapes for controls near the edge. Keep capsules for standout actions in dense desktop layouts.

**iPad pointer.** iPadOS has three pointer effects:
- **Highlight**, for small transparent elements like bar buttons.
- **Lift**, for small opaque elements.
- **Hover**, for large elements, where you set your own scale, tint and shadow.

Make hit regions contiguous across adjacent bar buttons, and avoid "gratuitous pointer and content effects."

**Sidebars.** Show "no more than two levels of hierarchy." Let people hide the sidebar the platform way, which on iPad is an edge swipe. Sidebar icons use the accent color by default.

**Apple Calendar itself.** It's the baseline Cal has to beat on looks, not the model. 01-calendars.md cites How-To Geek: the Mac app has been "functionally unchanged in years." The iOS 27 redesign only touched event details and creation. [unverified, from memory] Its event chips follow the same recipe as Notion's: a tinted fill, a saturated left stripe, and darker same-hue text. "Now" is a red line with a red time label, and today is circled in red. Notion, Apple and Fantastical all converged on this recipe, so Cal should use it too.

---

## 3. Craft principles for a dense calendar and task UI (ranked)

These are ranked by how much they will move the quality of Cal's screenshots and daily feel.

1. **Response time is part of the look. Keyboard actions repaint on the next frame, with no animation.**
   - Emil Kowalski: keyboard actions "should *never* animate."
   - Rauno Freiberg: macOS context menus and the app switcher appear without animation, and he "felt like I was moving much faster" after removing motion.
   - Linear's hover highlight fades in over 0s.
   - Local writes render optimistically. Never show a spinner for a local operation.

2. **Use few sizes and few weights, and build hierarchy mostly from color.** Six sizes and three weights is enough.
   - Capy gets its calm from weights 450/560 and three gray levels.
   - Apple's HIG says to vary "weight, size, and color." Refactoring UI says to de-emphasize secondary text instead of enlarging primary text. (Refactoring UI, "7 Practical Tips for Cheating at Design," 2018. Medium returned 403, so I'm citing it from memory.)
   - If you're tempted to add a size, try a gray level first.

3. **Chrome stays neutral, and color goes to data.** A calendar is mostly colored chips. If the sidebar, toolbar and selection states are colored too, nothing reads.
   - Linear dimmed its sidebar "a few notches" and removed colored icon backgrounds. Things keeps color inside icons.
   - Cal gets one accent (blue), one "now" red, and calendar colors. Nothing else.

4. **Use opaque colors for secondary text, especially on colored surfaces.**
   - Use the same hue at a different lightness, never gray, on colored chips.
   - Capy and Geist both mix opaque colors instead of using alpha. Geist says "Overlapping alpha borders make intersections stand out."
   - Alpha text over a chip that overlaps a grid line or another chip shows the line through the text.
   - Apple's own secondary label colors are alpha. They're fine for system chrome on solid backgrounds, but not on Cal's grid.

5. **Use tabular numerals for every number that sits in a column or changes in place.** That covers hour labels, event times, durations, mini-calendar digits, counts, countdowns and streaks. Use CSS `font-variant-numeric: tabular-nums` and RN `fontVariant: ['tabular-nums']`. Geist's `label-13` tabular variant exists for this reason.

6. **Structure should be felt, not seen.** That's Linear's phrase.
   - Separate regions with background steps: sidebar vs canvas, canvas vs raised.
   - Hour lines are hairlines one step off the canvas.
   - No borders around every panel.
   - Shadows appear only on floating layers (menus, popovers, the palette, dragged chips), and always as two or more layers (Vercel WIG).

7. **Keep radii small and concentric.** Inner radius equals outer radius minus padding (Apple; Vercel WIG). Chips at 4px and menu items at 6px inside a 10px menu with 4px padding. Large radii on small dense items look toy-like.

8. **Icons come from one set, with one stroke, at sizes tied to the text, and optically aligned.**
   - Raycast: "same rules for stroke width and corner radii."
   - Vercel WIG: "a thin-stroke icon may need a bolder stroke next to medium-weight text," and "Adjust ±1px when perception beats geometry."
   - Capy pulls first and last icons 2px outward.

9. **Keyboard focus is visible, distinct from selection, and appears only for keyboard users.**
   - Use `:focus-visible` (WIG).
   - In the grid, "selected" (a solid chip) and "keyboard cursor" (a 2px accent ring) can apply together, so they must look different.
   - Focus never gets covered by sticky headers.

10. **Hit targets are bigger than visuals.**
    - Mac: visible controls 20–28px, hit area at least 24px (WIG).
    - iPad: 44pt (HIG).
    - Chip resize handles are invisible 6px bands at the top and bottom edges.
    - Adjacent toolbar buttons have contiguous hit regions so the iPad pointer doesn't flicker.

11. **Motion explains space. It doesn't decorate.**
    - Under 300ms, ease-out for enter and exit, interruptible, and starting from the trigger (Emil Kowalski, WIG).
    - Never scale from 0. Start at 0.9 or higher (Emil uses 0.93–0.97).
    - The first tooltip waits; the ones after it appear instantly.
    - Delight goes to rare moments only, like a streak milestone or finishing setup. Benji Taylor's "Delight-Impact Curve" puts it this way: the less often a feature is used, the more delight it can carry.

12. **The command palette lists every action, shows its shortcut, and opens instantly.**
    - Superhuman: "Wherever your user is… they must be able to bring up the command palette." Every action exists as "a UI element, a keyboard shortcut, and a command."
    - Matching is fuzzy, with aliases. Ranking depends on context.
    - The same key closes it, and focus returns to where it was.

13. **Adaptive precision on the grid.** Before a click, show where an event would land, as a ghost at the snapped time under the pointer (Cron's idea, via the masterclass summary). The same applies to drags: show the drop target, not just the dragged chip (Notion's red outline).

14. **Every state gets a design.** Empty, sparse, dense, overlapping, error and loading (WIG).
    - Loading indicators appear only after 150–300ms and stay at least 300–500ms once shown.
    - Skeletons match the final layout exactly.

15. **Generate the theme from a few inputs.** Linear went from 98 variables to 3. Capy derives everything from bg/fg/primary. Cal derives every chip color from one hue (section 7.4). Then dark mode, high contrast and future themes come almost free.

---

## 4. Fonts

| Candidate | License | Mac (Electron) | iPad (Expo) | Verdict |
|---|---|---|---|---|
| **SF Pro (system)** | Apple system font. Use it through the system and never embed the files (HIG: "don't embed system fonts") | `font-family: system-ui, -apple-system, BlinkMacSystemFont`. Chromium 83+ handles SF's optical-size axis and its `trak` tracking table (web.dev) | The default when `fontFamily` is unset ("On iOS, it's SF Pro," Expo docs) | **Use it.** Identical on both platforms, zero bytes to load, automatic optical sizes, Dynamic Type and Bold Text for free. Matches Things, Notion Calendar and Apple Calendar. |
| Inter 4.x / Inter Display | OFL 1.1 | `@fontsource-variable/inter` (5.3.0), with the `opsz` axis giving Display at large sizes | `expo-font` config plugin. SDK 58 supports variable fonts, but on iOS "A weight that no named instance covers is out of reach," so the 450/510/560/590 tricks need static instances exported with fontTools | Best fallback if you ship Windows or web. Linear and Capy use it. Next to iPad's native chrome it reads as "web app". |
| Geist | OFL 1.1 | npm `geist` 1.8.2 or self-hosted woff2 | Static TTFs via `expo-font` | More mechanical and Swiss. Great for a dev tool, colder for a personal planner. |
| IBM Plex Sans | OFL 1.1 | Fontsource | `expo-font` | Wider, heavier texture at 11–13px. Not a fit for dense grids. |

**Decision: SF Pro via the system font on both.** Cal's character comes from the scale, the weights, the color and the grid, not from a typeface. If the owner wants a signature, it goes in one place, the month/date header, as SF Pro Display Bold with the system's tight tracking. Don't add a second family.

Implementation notes:
- **Mac CSS.** Set `font-family: system-ui, -apple-system, BlinkMacSystemFont, "Inter Variable", sans-serif` on `html`, plus `-webkit-font-smoothing: antialiased`. Don't add `letter-spacing` to SF, because the system already tracks per size. For italics there's an old Chromium issue where SF italics track too wide (issue 40476242). Avoid italics in UI chrome anyway.
- **iPad.** Leave `fontFamily` unset and set `fontWeight: '400' | '500' | '600' | '700'`. For list text, scale with Dynamic Type (`allowFontScaling` stays on). Cap scaling in the grid with `maxFontSizeMultiplier` around 1.3 so chips don't explode, and offer Things-style text sizes in settings instead.
- **Numerals.** Make tabular numerals the default on time and date components, not something each caller remembers.
- **Mono.** You barely need one. If you show IDs or keyboard hints in mono, use `ui-monospace` (SF Mono) on Mac and `Menlo` on iPad.

---

## 5. Icons

| Set | License / price | Packages | Style | Fit for Cal |
|---|---|---|---|---|
| **Lucide** | ISC, free | `lucide-react` 1.63.0, `lucide-react-native` 1.63.0 | 24px canvas, 2px stroke, round caps and joins, 2px corner radius on shapes 8px or larger (Lucide design guide); `absoluteStrokeWidth` prop | **Default pick.** Big set, both platforms, consistent rules |
| Phosphor | MIT | `@phosphor-icons/react` 2.1.10, `phosphor-react-native` 3.0.6 | 1,248+ icons, **6 weights** (thin, light, regular, bold, fill, duotone), "designed at 16 × 16px" (README) | Strong alternative. Drawn for small sizes, and the fill weight gives selected states |
| Central Icons (Iconists) | Paid, "from $59" (Untitled UI roundup, 2026); npm packages need a license key at install | `@central-icons-react/*`, `@central-icons-react-native/*` | 2,153 icons × 30 variants (stroke 1 / 1.5 / 2 × 5 corner styles × line/solid); 24px grid with a 20px live area | The upgrade if Lucide reads as generic. The 1.5px stroke with medium corners sits closest to SF Symbols |
| Heroicons | MIT | `heroicons` 2.2.0 | Small set; 24 outline, 20 solid, 16 micro | Too few icons for the calendar, habit and scheduling domain |
| SF Symbols | Apple license: only for UIs "running on Apple's iOS, iPadOS, macOS…"; no trademark use | iPad: `expo-symbols` (SF Symbols on iOS, Material Symbols on Android/web). Mac Electron: only by rendering NSImages at runtime (`nativeImage.createFromNamedImage`), which gives you PNGs, not tintable vectors | 9 weights matched to SF text weights, 3 scales | iPad native chrome only |

**Decision.**
- **Content icons are Lucide on both platforms.** That covers chips, rows, the inspector, the palette, empty states, checkboxes, habit rings, recurrence, video and location. They must look identical on Mac and iPad, because they're part of Cal's identity.
- **Native chrome on iPad uses SF Symbols through expo-symbols.** That covers navigation bars, toolbars, native context menus and the sidebar toggle. iPadOS users expect those, and native menus take SF Symbol names anyway.
- **Mac chrome uses Lucide.** Native Mac menus can be text-only.

| Context | Size | Stroke |
|---|---|---|
| Inline metadata (repeat, location on a chip) | 12px | 1.5px absolute |
| Rows, menus, palette, chips | 14px | 1.5px absolute |
| Sidebar, toolbar buttons | 16px | 1.5px absolute |
| Empty states, onboarding | 20px or 24px | 1.5px absolute, in text-3 |

Use `absoluteStrokeWidth` so stroke doesn't scale with size. Check one icon next to 13px regular text and next to 13px 500 text. If it looks thin next to medium text, go to 1.75px (WIG's "balance contrast in lockups"). Icons take the color of the text beside them, usually text-2. Only state icons get color: the checked checkbox, a done habit ring, the "at risk" warning.

---

## 6. Cross-platform coherence (Mac Electron + iPad Expo)

**Model.** Follow Things: one design at two sizes. Don't follow a "shared web UI" model where the iPad app looks like a website in a frame, and don't let the two apps drift apart.

### Shared on both
- **Tokens.** Keep one TypeScript package. Colors are authored in OKLCH and compiled to hex for light and dark, with optional P3. Spacing, radius, type roles and motion durations live there too.
  - Tailwind v4 (4.3.3) consumes it on Mac through `@theme`.
  - NativeWind (4.2.7) or Uniwind (1.13.0) consumes it on iPad. I haven't evaluated their maturity; prototype the grid in both before choosing.
  - React Native 0.88's color docs list hex, rgb, hsl and hwb but **not `oklch()`**. Support for `oklch()` is only a PR against the experimental native CSS parser. Hence compile to hex.
- **Content.** Grid geometry, chip recipes, type roles, content icons, copy, and keyboard shortcuts.
- **Font.** SF Pro on both, so there's no font mismatch to hide.

### Mac (Electron): what to respect
- **Window.**
  - `titleBarStyle: 'hiddenInset'` with `trafficLightPosition` set so the lights center vertically in the toolbar row.
  - The sidebar can take `vibrancy: 'sidebar'` with `visualEffectState: 'followWindow'`. Things added glass to its sidebar in 3.22, but test readability first.
  - Let the system draw the window corners. macOS 27's default radius is reportedly 20pt [unverified, MacRumors forum]. Inner panels touching the window corner should follow the concentric rule.
- **Menus.**
  - Use a real app menu bar listing every command with its shortcut. It's how Mac users discover commands.
  - Right-click uses native context menus (`Menu.popup`). They come with the system look, keyboard handling and accessibility.
  - Keep custom popovers for rich pickers: color, date, the "When" picker.
- **No `cursor: pointer`** on controls (Raycast 2.0). Hover backgrounds go only on list rows, chips and borderless icon buttons. They appear instantly and fade out over 100–150ms (Linear).
- **Settings** opens in its own window with `⌘,`.
- **Overscroll.** Set `overscroll-behavior: none` on `html` so the desktop doesn't rubber-band (WIG).
- **Startup.** Show the window only after first paint (`ready-to-show`) to avoid a blank flash. Raycast goes further and renders hidden windows first.
- **Appearance.** Follow the system light/dark setting through `nativeTheme`. HIG says "Avoid offering an app-specific appearance setting." Notion does offer one, so make it a later setting, not a v1 toggle.
- **Accent.** Optionally adopt the system accent color for selection (`systemPreferences.getAccentColor()`), as HIG expects for sidebar icons. Cal's blue is the fallback.

### iPad (Expo): what to respect
- **Layout.** A native split view with a collapsible sidebar (edge swipe to show or hide), the grid in the detail area, and an inspector as a native sheet or popover. Don't draw fake Mac chrome.
- **Controls.** Use native components for date and time pickers, switches, menus and sheets. Custom-drawn copies look uncanny next to system ones.
- **Keyboard.** Support hardware-keyboard shortcuts with the system `⌘`-hold discoverability overlay. React Native needs a key-command library for this, so prototype it early, because "keyboard first" on iPad depends on it.
- **Pointer.**
  - Use the highlight effect on toolbar buttons and the hover effect on chips (HIG).
  - Make hit regions 44pt.
  - Drag-to-create on the grid uses long-press with touch and a plain drag with the pointer.
- **Type.** Body text is 15pt, larger than Mac's 13px (section 7.1). Lists support Dynamic Type. The grid has its own zoom.
- **Windows.** Handle iPadOS windowed mode (Things shows traffic lights on iPad in 3.22) and Stage Manager resizing. The grid recomputes the day count from the width.

### How to avoid looking uncanny
- Don't port Mac 28px rows to iPad, and don't port 44pt iPad rows to Mac.
- Don't use iOS bounce or springy sheets on Mac, or Mac-style menus on iPad.
- Same visual language, platform-native mechanics. Chips, colors, type and icons in the content match. Navigation, menus, sheets, pickers and scroll physics are native.

---

## 7. Cal design direction (tokens)

### 7.1 Type

The family is the system font, SF Pro. Pixel values on Mac equal points on iPad.

| Role | Mac size / line height | iPad size / line height | Weight | Used for |
|---|---|---|---|---|
| `caption` | 11 / 14 | 12 / 16 | 400 (500 for emphasis) | Hour labels, chip times, badges, keycaps, weekday names, counts |
| `small` | 12 / 16 | 13 / 18 | 400; **500 for chip titles** | Event chip titles, secondary row lines, sidebar section labels, tooltips |
| `body` | 13 / 18 | 15 / 20 | 400; 500 for emphasis | Task titles, sidebar rows, menus, inputs, palette rows, inspector fields |
| `title-3` | 15 / 20 | 17 / 22 | 600 | Inspector title, dialog titles, panel headings |
| `title-2` | 20 / 25 | 22 / 28 | 600 | List titles (Today, Inbox, a project) |
| `title-1` | 26 / 32 | 28 / 34 | 700 | The month/date header ("October 2026") |

Rules:
- Use only 400, 500 and 600. 700 is reserved for `title-1`. Never use Light or Thin.
- All numbers use `tabular-nums`. That covers times, dates in the grid, durations, counts, streaks and the mini calendar.
- Time format follows the system's 12h/24h setting. Hour labels are compact ("9 AM" / "09:00"). On chips, write the range as "9:30–10:15", with an en dash and no spaces, and add "AM"/"PM" only when the range crosses noon or for the first time on the chip.
- Section labels are sentence case, not ALL CAPS. If you ever use caps (weekday letters in the mini calendar), use `caption` at 500 with +0.02em tracking.
- Never go below 11px on Mac or 11pt on iPad. The HIG minimums are 10 and 11, but Cal's chips are already small.

### 7.2 Spacing and sizing

Use a 4px grid with 2px half-steps inside chips. Tailwind's default spacing (`0.5` = 2px, `1` = 4px, … `8` = 32px) already covers this, so no custom scale is needed.

| Token | Mac | iPad |
|---|---|---|
| Control height: small / default / large | 24 / **28** / 32 | 32 / **44** / 50 |
| Sidebar row | 28 | 44 |
| List row (task, one line / two lines) | 28 / 40 | 44 / 56 |
| Menu row | 28 (inside 4px menu padding) | native |
| Palette input / row | 44 / 36 | 52 / 44 |
| Hour height (default; zoom range) | 48 (32–96) | 56 (40–112) |
| Hour-label gutter | 52 | 56 |
| Day header height | 44 | 52 |
| Chip padding | 2px top, 6px left after the 3px bar, 4px right | 3 / 7 / 5 |
| Gap between adjacent chips | 1px | 1px |
| Panel padding | 12 or 16 | 16 or 20 |

With 15-minute snapping at 48px per hour, each snap step is 12px.

### 7.3 Radius

| Token | Value | Used for |
|---|---|---|
| `radius-xs` | 3 | Checkboxes, tiny badges |
| `radius-sm` | 4 | Event chips, task blocks, tags, keycaps |
| `radius-md` | 6 | Buttons, inputs, row and menu-item highlights, today badge |
| `radius-lg` | 10 | Menus, popovers, tooltips (inside: 4px padding, so items are 6) |
| `radius-xl` | 14 | Command palette, dialogs, Mac sheets (inside: 8px padding, so items are 6) |
| `radius-full` | 9999 | Habit chips, avatars, status dots, count pills |
| window | system | Let macOS and iPadOS draw it |

The rule is child radius = parent radius − padding. If a combination doesn't fit the table, change the padding, not the radius.

### 7.4 Color

Every color is authored in OKLCH and compiled to opaque hex. Neutrals use hue 75, a slight warmth, following Linear's 2026 shift and Notion's warm grays, with chroma kept at 0.008 or less so calendar colors read true. I checked contrast with a local OKLCH→sRGB script (WCAG 2 plus APCA-W3 0.0.98G).

**Neutrals**

| Token | Light (OKLCH → hex) | Dark (OKLCH → hex) | Use |
|---|---|---|---|
| `bg-canvas` | 1 0 0 → `#ffffff` | 0.185 0.004 75 → `#141211` | Grid, lists, inspector |
| `bg-sidebar` | 0.975 0.003 75 → `#f8f6f5` | 0.165 0.004 75 → `#0f0e0c` | Sidebar, toolbar band |
| `bg-raised` | `#ffffff` plus a shadow | 0.235 0.005 75 → `#1f1e1b` | Menus, popovers, palette. In dark mode, higher means lighter |
| `bg-hover` | 0.96 0.003 75 → `#f3f1f0` | 0.23 0.004 75 → `#1e1d1b` | Row and button hover |
| `bg-active` | 0.94 0.004 75 → `#edebe8` | 0.26 0.005 75 → `#252421` | Pressed, current sidebar item |
| `bg-offhours` | 0.985 0.002 75 → `#fbfaf9` | 0.17 0.004 75 → `#100f0d` | Outside working hours, weekends |
| `line-grid` | 0.925 0.003 75 → `#e7e6e4` | 0.255 0.004 75 → `#242321` | Hour lines, day dividers |
| `border` | 0.885 0.004 75 → `#dbd9d6` | 0.30 0.005 75 → `#2f2d2b` | Inputs, panel edges (sparingly) |
| `border-strong` | 0.80 0.005 75 → `#c0bdba` | 0.36 0.006 75 | Checkbox outline, hovered input |
| `text-1` | 0.24 0.006 75 → `#211f1c` (16.5:1) | 0.94 0.004 75 → `#edebe8` (15.6:1) | Primary text |
| `text-2` | 0.47 0.008 75 → `#5d5a56` (6.8:1) | 0.78 0.006 75 → `#bab7b3` (9.3:1) | Secondary text, icons |
| `text-3` | 0.56 0.008 75 → `#77746f` (4.7:1) | 0.68 0.006 75 → `#9a9894` (6.5:1, APCA Lc ≈ 46) | Hour labels, placeholders, meta |

**Accent and semantic colors**

| Token | Light | Dark | Use |
|---|---|---|---|
| `accent` | 0.55 0.17 255 → `#1570d1` (4.9:1) | 0.72 0.13 255 → `#6aa7f4` | Links, focus ring, selected sidebar icon, checked checkbox |
| `accent-solid` | 0.55 0.17 255 | 0.55 0.17 255 | Primary button (white text, 4.9:1) |
| `accent-soft` | 0.95 0.03 255 → `#e1f0ff` | 0.30 0.06 255 → `#182e4b` | Selected rows, target-day flash |
| `now` | 0.58 0.21 27 → `#db2c2b` (4.8:1) | 0.68 0.19 27 → `#f75e54` | Now line, today badge, overdue deadline, destructive |
| `success` | 0.55 0.14 150 → `#1c8742` | 0.72 0.14 150 | Done states that need color |
| `warning` | 0.70 0.15 70 → `#d98b09` (use as fill or icon, never as text on white) | 0.78 0.14 75 | "At risk" capacity bar |

**Event chip recipe.** Take the calendar's hue `h`. A user-picked hex is converted to OKLCH and its hue kept. Graphite uses chroma 0.

| Part | Light | Dark |
|---|---|---|
| Fill | `oklch(0.95 0.03 h)` | `oklch(0.32 0.05 h)` |
| Left bar (3px) | `oklch(0.68 0.13 h)` | `oklch(0.72 0.13 h)` |
| Title (500) | `oklch(0.36 0.07 h)` → about 9.5:1 on the fill | `oklch(0.94 0.025 h)` → about 10.6:1 |
| Time (400) | `oklch(0.47 0.07 h)` → about 6:1 | `oklch(0.80 0.05 h)` → about 6.8:1 |
| Selected / dragging fill | `oklch(0.56 0.13 h)` with white text (4.4–5.0:1, Lc 75–79) | same |
| Past event | Mix fill and text 50% toward `bg-canvas` in OKLCH at build time. The result stays opaque (blue title: `#607489` on `#eff8ff`, 4.5:1) | same rule |

Blue in light mode works out to a `#e0f1ff` fill, `#549de5` bar, `#1d3f60` title and `#3b5e81` time. In dark mode it's a `#1e354b` fill, `#dfedfc` title and `#a6c1dd` time. All nine sample hues (red, orange, yellow, green, teal, blue, indigo, purple, pink) land within about 0.5:1 of each other, so no calendar color reads louder than another.

Light fills at L 0.95 sit just outside sRGB for most hues. Clamp chroma, don't clip channels, and emit a P3 value inside `@media (color-gamut: p3)` on Mac if you want the extra richness (Evil Martians). One function generates all of it:

```ts
import { clampChroma, formatHex } from "culori";

type Mode = "light" | "dark";

// Derives every color for an event chip from a single calendar hue.
// Values are opaque so overlapping chips and grid lines never show through text.
export function chipColors(h: number, mode: Mode, neutral = false) {
  const hex = (l: number, c: number) =>
    formatHex(clampChroma({ mode: "oklch", l, c: neutral ? 0 : c, h }, "oklch"));
  const solid = hex(0.56, 0.13);
  return mode === "light"
    ? { fill: hex(0.95, 0.03), bar: hex(0.68, 0.13), title: hex(0.36, 0.07), time: hex(0.47, 0.07), solid }
    : { fill: hex(0.32, 0.05), bar: hex(0.72, 0.13), title: hex(0.94, 0.025), time: hex(0.8, 0.05), solid };
}
```

### 7.5 Calendar grid

- **Hour lines.** 1px `line-grid` on hour boundaries only. Don't draw half-hour lines by default; they double the noise. They can be a setting.
- **Day dividers.** 1px `line-grid`.
- **Working hours.** Outside working hours and on weekends, use the `bg-offhours` fill. Don't use stripes.
- **Hour labels.**
  - `caption` in `text-3` with tabular numerals, right-aligned 8px from the grid, vertically centered on their line.
  - Skip the label at the top edge.
  - Extra time-zone columns go to the left of the primary one, with a one-line header ("PST").
- **Day header.**
  - The weekday is `small` in `text-2`, and the day number is `body` at 500 with tabular numerals.
  - **Today** puts the number in a 20px-tall `now`-colored badge with `radius-md` and white text.
  - Above the grid, the date title uses `title-1`.
- **Now line.**
  - In today's column, a 1px `now` line plus an 8px dot at the left edge.
  - In other columns of the same row, the line is `now` mixed 35% toward the canvas, opaque.
  - In the gutter, a pill with white text at `caption` 600: "3:40".
- **All-day row.**
  - Chips 20px tall, stacked.
  - Above 3 rows, collapse into "+2 more", toggled by a keyboard command.
- **Target-day flash.** After a big jump (`.`, `T`), fill the day column with `accent-soft` and fade it to the canvas over 600ms. This is the one deliberately visible animation, copied from Notion's orange flash.
- **Hover ghost (adaptive precision).**
  - Hovering the empty grid shows a 1px dashed `border-strong` outline at the snapped 15- or 30-minute slot, with the time in `caption` `text-3`.
  - It appears instantly and hides when the keyboard is in use.

### 7.6 Chips: events, task blocks, habits, proposals

All chips use `radius-sm` (4px) with a 1px gap to their neighbors. Text is top-aligned, never vertically centered.

**Layout by height**, at 48px per hour:

| Duration | Height | Layout |
|---|---|---|
| 15 min or less | 12px | Title only, 11px, no vertical padding. If it would clip, show the left bar and title only |
| 30 min | 24px | One line: title (500), then the start time in the time color |
| 45 min or more | 36px or more | Title on line 1, wrapping to 2 lines if there's room. Time range on the next line |

Truncate with an ellipsis, never mid-glyph.

**Event chip.** Uses the recipe in 7.4.
- **Selected:** solid fill with white title and time (time is `oklch(0.93 0.03 h)`).
- **Keyboard cursor:** a 2px `accent` ring inside the chip edge (inset box-shadow), so it shows up on both pale and solid fills.
- **Declined:** no fill, a 1px border in the bar color, and the title struck through in `text-3`.
- **Tentative or needs RSVP:** a 45° hatch made with `repeating-linear-gradient` (stripes of the fill color and canvas, 6px period) plus the normal bar. Status is never shown by color alone.

**Overlap.**
- Up to 3 concurrent events sit side by side with 2px gaps.
- Beyond 3, later events cascade, offset 12px to the right. Each gets a 1px `bg-canvas` outline (box-shadow) so the edges separate without alpha.

**Task block** (PLAN 5.3: "lighter, with a checkbox and a stripe in the project color"):
- The fill is `bg-canvas` in light mode and `bg-raised` in dark mode.
- A 1px border in `oklch(0.88 0.03 h)` (dark mode: `oklch(0.38 0.04 h)`) and a 3px left stripe in the project bar color.
- A 12px checkbox at the start of the title line: `radius-xs`, a 1.5px `border-strong` outline, and `accent` with a white check when checked. The title is `small` at 500 in `text-1`. Time is `caption` in `text-2`.
- **Done:** the title is struck through in `text-3`, and the checkbox is filled.
- **Past and unfinished:**
  - A hatch of `line-grid` stripes at 45° with a 6px period, over the canvas.
  - The title in `text-2`.
  - A small rollover-count pill ("↻2") in `caption` tabular numerals.
- **Pinned:** a 12px lock icon at the top right in `text-3`.

**Habit chip** (day strip under the day header):
- Height 20px (iPad 28), `radius-full`, fill `bg-hover`.
- A 12px progress ring in the habit's hue (1.5px stroke). The label is `caption` at 500 in `text-2`, and quota habits show "2/3" in tabular numerals.
- **Done:** the fill switches to the habit's chip fill (`oklch(0.95 0.03 h)`), the ring fills with a check, and the label switches to the chip title color. "Done" should look satisfying, not faded.
- **Paused or skipped:** a dashed ring in `text-3`.
- **Flexible habit block on the grid:** the task-block style with the ring in place of the checkbox.

**Proposed block** (scheduler preview and diff):
- No fill, a 1px dashed `accent` border, and the title in `accent`.
- A **moved** block shows its old position as a dotted `border-strong` outline, with a 1px `accent` connector line to the new spot.
- **Accept** turns the block into a normal task block with no animation. **Discard** removes it.

### 7.7 Surfaces and shadows

- **Structure.** Use background steps between surfaces: sidebar `bg-sidebar`, then canvas `bg-canvas`, then popovers `bg-raised`. Use a single 1px `line-grid` only where two surfaces of the same color meet.
- **Floating layers in light mode:** `box-shadow: 0 0 0 0.5px oklch(0 0 0 / 0.08), 0 4px 12px -2px oklch(0 0 0 / 0.08), 0 16px 32px -8px oklch(0 0 0 / 0.12)`.
- **Floating layers in dark mode:** use a lighter `bg-raised`, a 0.5px ring of `oklch(1 0 0 / 0.08)`, and the same shadows at 0.4 and 0.5 alpha (Notion doubles its dark shadows).
- **Dragged chip:** `0 2px 4px oklch(0 0 0 / .10), 0 8px 20px -4px oklch(0 0 0 / .18)`. The original slot shows a 1px dashed outline.
- **Keycaps** are 18px tall, at least 18px wide, `radius-sm`, `bg-hover` fill, a 0.5px `border`, and `caption` 500 text in `text-2`. Use real symbols (⌘ ⇧ ⌥ ⌃ ↵ ⎋) with non-breaking spaces, and render the platform's symbols.

### 7.8 Motion

| Token | Value | Use |
|---|---|---|
| `instant` | 0ms | All keyboard navigation (← → J K T, number keys), selection changes, view and day-count switches, palette open and close, hover-in |
| `fast` | 100ms | Hover-out color fades, press feedback |
| `base` | 150ms | Menus, popovers and tooltips in. Out takes 100ms |
| `slow` | 220ms | Inspector panel slide, Mac sheets, Undo toast |
| `flash` | 600ms | Target-day flash (opacity only) |
| `ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Enter and exit (ease-out-quint, which Linear and Capy both ship) |
| `ease-in-out` | `cubic-bezier(0.645, 0.045, 0.355, 1)` | Something moving from one place to another |

Rules:
- Popovers start at `scale(0.97)` with opacity 0, `transform-origin` at the trigger.
- Press feedback is `scale(0.97)` or Capy's `brightness(97%)`.
- The first tooltip waits 500ms; tooltips after it appear with no delay and no animation.
- Dragging tracks the pointer 1:1 with no easing. On drop, the chip settles over 120ms ease-out.
- Animate only `transform` and `opacity`, and never use `transition: all`. Prefer CSS transitions, because they can be interrupted, over keyframes or JS (Emil Kowalski).
- With `prefers-reduced-motion`, or Reduce Motion on iPad, movement becomes an opacity change of 150ms or less, and the flash becomes a static highlight that fades out.
- On iPad, native sheets and navigation keep their system springs. Don't override them.
- Delight goes only to rare moments: a streak milestone, a clean "Plan my week" with nothing in Couldn't fit, finishing onboarding. Even then, keep it under 600ms and never block input.

### 7.9 Focus and keyboard states

- **Focus ring:** 2px `accent` with a 2px offset on controls (Linear). In dense grids and lists, the ring sits inside the element (inset) so it doesn't overlap neighbors. Use `:focus-visible` only.
- **Row states**, ordered by contrast as the WIG says interactions should increase contrast:
  - hover `bg-hover`
  - keyboard cursor `bg-hover` plus the 2px inset ring
  - selected `accent-soft`
  - selected and focused `accent-soft` plus the ring
- **Multi-select** (box-select, `⌘`-click): selected chips go solid. A count pill appears in the toolbar ("3 selected") with the available actions and their keycaps.
- **Shortcut hints (`F` overlay, from Vimcal).** Keycaps sit at the top-left of each target. Everything else dims by drawing a `bg-canvas` overlay at 60%. That's alpha, but it's a deliberate overlay, not text.

### 7.10 Command palette (`⌘K`)

- **Placement and size.** Centered, 640px wide, top edge at 20% of the window height, `radius-xl`, floating shadow. On iPad, use a native form sheet.
- **Input.** 44px tall, `body` at 15px (one step up from body), placeholder "Type a command or search…" in `text-3`. A 1px `line-grid` separates it from the results.
- **Rows.** 36px tall:
  - a 14px icon in `text-2`
  - the title in `body`
  - the matched alias after it in `text-3` (e.g. "Complete (Mark done)", per Superhuman)
  - a right-aligned keycap shortcut
- **Selected row.** `bg-hover` fill and a 3px `accent` bar at the left edge (Notion), with the row radius at `radius-md`.
- **Groups.** Headers in `caption` 500 `text-3` ("Navigate", "Create", "Selected event"). Context group first.
- **Footer.** 32px tall, keycap hints: `↵ Run`, `⇥ Actions`, `Esc Close`.
- **Behavior.**
  - It opens on the frame after the key press, with no animation.
  - `⌘K` again closes it and returns focus to where it was.
  - Matching is fuzzy, with aliases.
  - The default ranking comes from context and recent use.
  - Typing a number like "14" offers "Show 14 days" first.
  - Use cmdk (`cmdk` 1.1.1, Paco Coursey) for the web side.
  - Leave the last visible row cut off so it's obvious the list scrolls (Superhuman).

### 7.11 Empty states and copy

- **Lists.** An empty list shows one 24px icon in `text-3` and one sentence in `text-2`, with the action as a keycap: "Nothing in Today. Press `⌘N` to add a to-do." No illustrations.
- **Trays.** An empty "Couldn't fit" tray disappears entirely rather than showing an empty box.
- **The grid** is never empty. An empty week is just a calm grid.
- **First run of Habits.** Show the three schedule types as three buttons, so the empty state teaches the model.
- **Copy rules.**
  - Use sentence case everywhere except Mac menu items, which take Title Case per Apple's style. Raycast and Vercel use Title Case for actions.
  - Use the `…` character for actions that need more input.
  - Write numbers as numerals.
  - Separate numbers and units with a non-breaking space ("45 min").
  - Error messages say how to fix the problem.

### 7.12 Never do

1. Never use opacity for text, or for past or overlapping chips. Mix opaque colors instead. Alpha is only for hover overlays, rings and shadows.
2. Never use gray text on a colored chip. Use the same hue at a different lightness.
3. Never use a size or weight outside the scale. No 10px text, no Light or Thin, no 700 below `title-1`.
4. Never use proportional digits in times, dates, durations or counts.
5. Never animate keyboard navigation, selection, view switches or the palette.
6. Never use `transition: all`, and never animate width, height, top or left.
7. Never use `cursor: pointer` on Mac controls.
8. Never put shadows on in-flow content. Never border every panel or stack separators.
9. Never invent a radius. Children are concentric with their parents.
10. Never mix icon sets, stroke widths, or filled and outline icons in one surface. The only exception is filled for selected state.
11. Never show status by color alone. Declined, tentative, done and proposed each differ in shape too: strike, hatch, check, dashed.
12. Never embed SF Pro files, and never export SF Symbols to SVG for the Mac app.
13. Never put glass, gradients or blur behind dense content. Glass goes only on chrome, like the sidebar, and only if text stays at 4.5:1 or better.
14. Never show a spinner for a local operation. Local edits render on the same frame.
15. Never build a custom version of a native iPad control (picker, switch, menu, sheet), and never use iOS-style bounce on Mac.

---

## 8. Screenshot review rubric

Score each category 1–10. Any "never do" violation in a category caps it at 5. Review light and dark mode at 100% zoom on a Retina screen, plus one non-Retina external display for the Mac. Keep a reference set next to the screenshots: Notion Calendar week view, a Things Today list, Linear's issue list.

| # | Category | What a 9/10 looks like | Common deductions |
|---|---|---|---|
| 1 | Typography | Only the six roles and three weights appear. Chip titles at 500 are crisp at 12px. Times line up in columns. The date header is the only bold thing on screen. Nothing is italic. | A seventh size; bold used for emphasis in body text; proportional digits jittering in the time column; manual letter-spacing on SF |
| 2 | Color and contrast | Chrome is near-gray, and the eye goes straight to events. One accent and one red. Every text pair is at least 4.5:1, except `text-3` meta, which is at least 4.5:1 in light mode and around Lc 45 in dark mode. Dark mode is a separate palette, not an inversion. | Blue in chrome competing with blue events; alpha text on chips; muddy or blue-tinted grays; a pure #000 dark background |
| 3 | Hierarchy and density | In a week view with 30 events, you can find "what's next" in under 2 seconds. The sidebar recedes and the grid leads. Density matches Notion Calendar at its default zoom. | Equal visual weight everywhere; oversized headers stealing grid height; empty padding that pushes events off screen |
| 4 | Spacing and alignment | Everything sits on the 4px grid. Icons are optically centered with their text. Chip text starts at the same x in every column. Hour labels are centered on their lines. | 1px misalignments between sidebar and toolbar; icons a pixel low; uneven chip padding |
| 5 | Shape, borders and elevation | Radii come from the token table and nest concentrically. Hairlines appear only where needed. Only floating things cast shadows, and those shadows have layers. | A 12px radius on a 24px chip; double borders where panels meet; one-layer gray shadows with a halo |
| 6 | Event, task and habit chips | Every calendar color has the same visual weight. Task blocks are clearly lighter than events. A done habit looks rewarding. Declined, tentative, past and proposed are each identifiable in grayscale. 15-minute events stay readable. | Saturated full fills for every event; a white title on a yellow fill; task blocks you can't tell from events; clipped text in short chips |
| 7 | Calendar grid | Hour lines barely visible, the now line obvious, today findable from across the room. Off-hours tinted, not striped. Overlaps readable. | Heavy grid lines; half-hour lines; a now line the same weight as grid lines; overlapping chips merging into one blob |
| 8 | Iconography | One set and one stroke weight. Sizes match the text beside them. Color only on state icons. | A heavier icon here and there; mixed filled and outline; colored decorative icons in chrome |
| 9 | States | Hover, keyboard cursor, selected, multi-selected, focused input, disabled, empty, loading and error all designed and distinct. Keyboard focus visible on every control. | Focus ring missing or clipped; selection and focus looking identical; a "No results" flash before data loads |
| 10 | Motion and responsiveness (screen recording) | Keyboard navigation repaints instantly at 60fps. Popovers grow out of their trigger in 150ms. The target-day flash is the only noticeable animation. Reduced Motion is respected. | Eased transitions on ←/→; palette fade-in; a drag that lags the pointer; frame drops while scrolling a busy week |
| 11 | Platform fit | The Mac screenshot looks like a Mac app: traffic lights aligned, native menus, no pointer hand. The iPad screenshot looks like an iPad app: split view, native sheets, 44pt targets. Content looks identical on both. | iPad rows at 28pt; Mac rows at 44px; custom date pickers on iPad; misaligned traffic lights |
| 12 | Polish and restraint | Nothing to remove. Copy is short and consistent. Delight only in rare moments. Someone who uses Things or Notion Calendar would call it "clean" without being able to say why. | Decorative gradients and glass on content; emoji in chrome; three ways to say "task" |

For each finding, note the category, the screenshot region, the token that was broken, and the fix. A screen ships at an average of 8 or higher with no category below 7.

---

## Sources

**Capy**
- https://capy.ai (homepage; CSS bundles `/_marketing/_next/static/immutable/chunks/281k1ktymkfn7.css`, `1zm0jz35fo2_m.css`, read 2026-10-28)
- https://docs.capy.ai/welcome (CSS `/_next/static/immutable/chunks/16v71mta8c7n2.css`: `--font-sans: var(--font-inter)`, weights 450/560)
- https://capy.ai/changelog, https://capy.ai/changelog/0.6.0 (new look, themes, 2026-10-27), https://capy.ai/changelog/0.4.6 (chat redesign), https://capy.ai/changelog/0.4.0 (command menu filters)
- Screenshots: https://downloads.capy.ai/stable/changelog/0.4.0-command-menu.webp, 0.4.6-chat.webp, 0.6.0-themes.webp, 0.6.0-files.webp
- https://www.ycombinator.com/companies/capy
- https://x.com/justinsunyt/status/2087207830202024358 (Capy v2 announcement)
- https://fudge.design/share/capy.ai-design (secondary; marketing site only)

**Notion Calendar / Cron**
- https://calendar.notion.so (bundle `/assets/cron-Bgb08sCY.js`, `/assets/App-CVACXgZ_.js`: font stack, `--nds-*` tokens, sizes, radii)
- https://www.notion.com/product/calendar (screenshots `time-drag.png`, `personal-block-events.png`, `command-bar.png`; probably 2024-era)
- https://www.linkedin.com/posts/raphaelschaad_cron-is-a-new-calendar-app-following-in-sunrise-activity-6891758576507924480-c0Uv
- https://glasp.co/youtube/p/design-masterclass-with-the-best-designer-i-ve-ever-met-raphael-schaad-with-cron-calendar (secondary summary; "adaptive precision")
- https://podcasts.apple.com/us/podcast/raphael-schaad-designing-a-startup-from-0-to-acquisition/id1686414242?i=1000656458846 (Dive Club, May 2024; not listened to)

**Things 3**
- https://culturedcode.com/things/blog/2025/09/things-for-os-26/ (3.22 refresh; screenshots `things-os26-screenshot-macos-io75.jpg`, `-ipados-io75.jpg`)
- https://culturedcode.com/things/blog/2023/09/things-big-and-small/ (14 text sizes, vector icons)
- https://culturedcode.com/things/features/ (animation toolkit, Type Travel)
- https://culturedcode.com/things/blog/ (3.23–3.25 notes)
- https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/ (2017 review)

**Linear**
- https://linear.app (static CSS from `static.linear.app/web/_next/static/css/*.css`, read 2026-10-28)
- https://linear.app/now/how-we-redesigned-the-linear-ui (2024-03-28; LCH, 3 theme variables, Inter Display)
- https://linear.app/now/behind-the-latest-design-refresh (2026-03-12; "calmer interface")
- https://linear.app/changelog/2026-03-12-ui-refresh
- https://linear.app/now/linear-liquid-glass (2025-10-21)

**Raycast**
- https://www.raycast.com/blog/a-fresh-look-and-feel (2022-07-19)
- https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast (2026-05-14)
- https://developers.raycast.com/basics/prepare-an-extension-for-store
- https://www.raycast.com/blog/raycast-for-ios

**Vercel Geist and guidelines**
- https://vercel.com/geist/typography, https://vercel.com/geist/colors, https://vercel.com/geist/materials
- https://vercel.com/font
- https://github.com/vercel-labs/web-interface-guidelines (README, read 2026-10-28)

**Apple**
- https://developer.apple.com/design/human-interface-guidelines/typography (read through the JSON at developer.apple.com/tutorials/data/design/human-interface-guidelines/typography.json; changelog entry dated 2025-12-16)
- https://developer.apple.com/design/human-interface-guidelines/accessibility (control sizes, contrast)
- https://developer.apple.com/design/human-interface-guidelines/dark-mode
- https://developer.apple.com/design/human-interface-guidelines/motion
- https://developer.apple.com/design/human-interface-guidelines/pointing-devices
- https://developer.apple.com/design/human-interface-guidelines/sidebars
- https://developer.apple.com/design/human-interface-guidelines/sf-symbols
- https://developer.apple.com/videos/play/wwdc2025/356/ (concentricity), https://wwdcnotes.com/documentation/wwdc25-356-get-to-know-the-new-design-system/
- https://developer.apple.com/forums/thread/739523 (SF Symbols license text quoted)
- https://forums.macrumors.com/threads/want-the-bigger-window-corner-radius-back-come-inside.2484898/ (window radius numbers; unverified)

**Practitioners**
- https://emilkowal.ski/ui/you-dont-need-animations
- https://emilkowal.ski/ui/great-animations
- https://emilkowal.ski/ui/7-practical-animation-tips
- https://rauno.me/craft/interaction-design (July 2023)
- https://benji.org/family-values (2024-07-08)
- https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/ (2021-10-12)
- https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886 (2018; returned 403, cited from memory)
- https://github.com/pacocoursey/cmdk (cmdk 1.1.1 on npm, 2025-03-14)

**Color**
- https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl (updated 2025-09-17; parts written in 2024)
- https://reactnative.dev/docs/colors (RN 0.88; no oklch)
- https://github.com/react/react-native/pull/58782 (oklch in the native CSS parser; merge status unknown)
- https://github.com/react/react-native/pull/42830 (Display P3 on iOS)

**Fonts and icons**
- https://rsms.me/inter/ (Inter 4.1, OFL, opsz, features)
- https://web.dev/blog/more-variable-font-options-in-chromium-83 (system-ui opsz and `trak` in Chromium)
- https://issues.chromium.org/issues/40476242 (SF italic tracking)
- https://docs.expo.dev/develop/user-interface/fonts/ (SDK 58 variable fonts, system font)
- https://docs.expo.dev/versions/latest/sdk/symbols/
- https://lucide.dev/contribute/icon-design-guide
- https://github.com/phosphor-icons/homepage (README: 1,248 icons, 6 weights, 16px)
- https://centralicons.com, https://iconists.co/central, https://www.npmjs.com/package/@central-icons-react/all, https://www.untitledui.com/blog/icon-sets (price)
- https://www.electronjs.org/docs/latest/api/structures/base-window-options (titleBarStyle, vibrancy)
- npm registry, checked 2026-10-28: lucide-react 1.63.0, @phosphor-icons/react 2.1.10, phosphor-react-native 3.0.6, expo-symbols 58.0.4, geist 1.8.2, @fontsource-variable/inter 5.3.0, tailwindcss 4.3.3, nativewind 4.2.7, uniwind 1.13.0, culori 4.0.2, motion 14.7.1

**Stale or unverified**
- The Notion product screenshots are probably from early 2024. The current app may have moved on, but the token values above come from the live bundle.
- The Capy tokens come from the marketing and docs CSS, which mirror the product. The logged-in app wasn't inspected, and 0.6.0 is one day old.
- The Refactoring UI tips, the Apple Calendar chip styling, and the macOS 27 window radius are from memory or a single forum source.
- Whether NativeWind or Uniwind can handle Cal's grid performance hasn't been tested.
