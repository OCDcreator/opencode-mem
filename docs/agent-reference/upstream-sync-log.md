# Upstream Sync Log

## Quick Checklist

- fetch latest history: `git fetch --all --prune`
- read the newest entry in this file and note `Reviewed through upstream commit`
- compare only the range after that cursor unless a full re-audit was explicitly requested
- use `git log`, `git cherry`, and targeted diffs to separate merged, manually absorbed, already covered, and still-pending upstream commits
- merge or manually absorb only the commits that still add value to the fork
- run the smallest verification set that matches the affected files
- append a new top entry here with the new review window, decisions, and advanced cursor

This file is the running ledger for upstream review work against:

- upstream repository: `tickernelz/opencode-mem`
- fork repository: `OCDcreator/opencode-mem`

Purpose:

- avoid re-analyzing from the original fork point every time
- give future agents a clear "last reviewed upstream commit" cursor
- record which upstream commits were merged, manually absorbed, already covered, or intentionally skipped

Working rule:

- unless a maintainer explicitly asks for a full historical audit, start upstream-sync analysis from the most recent `Reviewed through upstream commit` entry in this file
- after each upstream review pass, append a new entry at the top and advance the cursor
- if a commit was not cherry-picked verbatim, record whether it was manually absorbed or already covered by fork-specific work

## 2026-04-16 — Review upstream changes through `40508eb`

### Review window

- previous practical baseline used for this pass: `e391f4d` (`2026-03-31`)
- reviewed through upstream commit: `40508eb` (`2026-04-15`, `fix(embedding): migrate from @xenova/transformers to @huggingface/transformers (#90)`)
- local branch reviewed: `main`

### Merged in this pass

- `4c25113` `chore(gitignore): ignore sisyphus state`

### Manually absorbed in this pass

- `54c66f7` / `4c6da77` `fix(plugin): derive id from package name`
  - not cherry-picked directly because `src/plugin.ts` already carried fork-specific startup failure handling
  - equivalent behavior was applied manually by deriving plugin `id` from `package.json`
  - loader contract test was updated to assert that `dist/plugin.js` exports a non-empty `id` equal to package name

### Already covered before this pass

- `b190922` `fix(plugin): restore OpenCode 1.3 loader compatibility (#81)`
- `eee6ffc` `fix(embedding): defer transformers initialization`
- `6186a69` `fix(index): defer opencode provider startup import`
- `dbe32de` `fix: Chinese language detection fallback and lower minLength threshold (#76)`
- `59d5eeb` `feat(memory): add optional all-projects query scope (#84)`
- `c77d9b9` `fix: allow explicit profile preference writes (#91)`
- `40508eb` `fix(embedding): migrate from @xenova/transformers to @huggingface/transformers (#90)`
- `46121f6`, `b41f34e`, `fedcbb9`, `09d3c71`, `7d43059` openai-chat typing / guard refactors already reflected in the fork's later sync work

### Notes

- future upstream-sync comparisons should start from `40508eb` unless a full re-audit is explicitly requested
- when comparing new upstream commits, still sanity-check for duplicate coverage via `git cherry` or targeted diffs before deciding to merge
