# Cal: working agreement

Product and architecture live in [PLAN.md](PLAN.md); research in `research/`.

## Models and review

- **Opus 5.5** writes most code. Parallel Opus subagents are fine for independent pieces.
- **Fable 5.1** writes UI code: views, styling, interaction, motion. Give it `research/07-ui-design.md` and the tokens in `packages/theme`.
- **GPT 6.1 Sol** (Codex) reviews every completed chunk of code, read-only. Use a fresh review task per chunk with the changed files and enough context to judge them. Fix confirmed findings, then re-review if the fixes are non-trivial. Report what Sol found and what changed.

## Checks before a chunk is done

`bun run check`, `bun run typecheck`, `bun run test` all pass.
