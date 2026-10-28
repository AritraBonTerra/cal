<img src="assets/icon.svg" width="64" height="64" alt="">

# Cal

A keyboard-first calendar, task manager, habit tracker, and auto-scheduler for Mac (Electron) and iPhone/iPad (Expo). See [PLAN.md](PLAN.md).

## Layout

- `packages/backend`: Convex schema and functions. `sync:upload` applies PowerSync upload batches.
- `packages/sync`: PowerSync endpoint and sync rules (`powersync/sync-config.yaml`).

## Development

```sh
bun install
bun run dev:backend   # convex dev, run from packages/backend
bun run check         # Biome lint + format (writes fixes)
bun run typecheck
bun run test
```

Created in [T3 Code](https://t3.codes).
