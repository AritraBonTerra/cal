<img src="assets/icon.svg" width="64" height="64" alt="">

# Cal

A keyboard-first calendar, task manager, habit tracker, and auto-scheduler for Mac (Electron) and iPhone/iPad (Expo), synced through Convex and usable fully offline. See [PLAN.md](PLAN.md).

## Layout

- `apps/desktop`: the Mac app. Electron main process (local SQLite store, sync, sign-in, the `calkit` EventKit helper in `native/calkit`), a sandboxed preload, and the React window.
- `apps/mobile`: the iPhone/iPad app (Expo, expo-router, Uniwind).
- `packages/backend`: Convex schema and functions. `sync:upload` applies a device's queued writes; `sync:pull` pages changes to devices.
- `packages/sync`: the device side of sync: local SQLite store, outbox, the engine that talks to Convex, and the sign-in session.
- `packages/app-core`: live tables, undo/redo, actions, and the command registry, shared by both apps.
- `packages/domain`, `packages/nlp`, `packages/scheduler`: dates and task rules, Quick Entry parsing, and the deterministic auto-scheduler.
- `packages/theme`: design tokens compiled to CSS for both apps. `packages/calendar-source`: device calendar types. `packages/fixtures`: the seeded week used for screenshots.

## Development

```sh
bun install
bun run dev:backend          # convex dev, run from packages/backend
bun --cwd apps/desktop dev   # the Mac app (builds calkit first)
bun --cwd apps/mobile ios    # the iPhone app in the simulator (Expo Go)
bun run check                # Biome lint + format (writes fixes)
bun run typecheck
bun run test
```

Proof tools:

```sh
bun --cwd apps/desktop smoke        # drives the Mac app through its main interactions
bun --cwd apps/desktop screenshots  # fixture screenshots to artifacts/screens/
bun --cwd apps/mobile screens       # iPhone/iPad fixture screenshots
bun --cwd packages/sync live <convex url>  # two devices syncing through a real deployment
```

Created in [T3 Code](https://t3.codes).
