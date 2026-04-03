# Development Log

> **更新规范**：后续更新请写在文件开头，越新的进度越靠前（倒序排列）。
> 当前最新更新：2026-04-03

## 2026-04-03 — Stabilize Idle Scheduling And Add Detailed Auto-Capture Diagnostics

### Changed files

| File                                   | Change                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/index.ts`                         | Replace global idle timer with per-session scheduling and status-aware cancellation        |
| `src/services/auto-capture.ts`         | Return capture outcomes, retry safely per session, and add detailed step logs              |
| `src/services/ai/opencode-provider.ts` | Prefer OpenCode config directory, resolve env/file references, and log provider resolution |
| `src/services/ai/opencode-state.ts`    | Store both OpenCode `state` path and `config` path                                         |
| `src/services/user-memory-learning.ts` | Align provider fallback behavior and add diagnostic logs                                   |
| `devlog.md`                            | Record root cause, mitigations, and verification                                           |

### 1. Runtime symptom

Auto-capture could still look random even after the summary parsing fix:

- one session becoming busy again could invalidate a previously scheduled idle capture
- multiple sessions shared one global idle timer
- provider availability checks could fail even though the provider config itself was usable
- logs were not detailed enough to tell whether the failure happened in event timing, provider resolution, message extraction, or memory write

### 2. Root cause

The plugin had several assumptions that were too optimistic for actual OpenCode runtime behavior:

- it primarily relied on `session.idle` as a single completion signal
- it kept only one idle timeout for the whole plugin process instead of one per session
- it treated `provider.list().connected` as a hard prerequisite for structured-output calls
- it only remembered the OpenCode `state` path, even though OpenCode also exposes a separate `config` directory

These assumptions made failures look intermittent instead of deterministic.

### 3. Fix

`src/index.ts` now:

- keeps idle timers per `sessionID`
- listens to `session.status` and cancels pending capture when status returns to `busy` or `retry`
- schedules idle processing from both `session.status = idle` and legacy `session.idle`
- runs multiple capture passes per idle window so queued prompts in the same session are drained more reliably
- writes explicit logs for timer schedule, cancel, skip, start, finish, and owner-only maintenance steps

`src/services/auto-capture.ts` now:

- tracks capture concurrency per session instead of globally
- returns explicit outcomes: `captured`, `skipped`, `retry`, `none`, or `busy`
- logs prompt claim, message fetch, assistant extraction, summary generation, memory write, and retry release decisions

`src/services/ai/opencode-provider.ts` now:

- prefers the OpenCode `config` directory when resolving provider config
- still falls back to nearby/default locations if needed
- resolves `env://...`, `{env:...}`, `file://...`, and `{file:...}` values before making requests
- logs provider resolution without printing secret values

`src/services/user-memory-learning.ts` now follows the same provider fallback behavior and emits matching diagnostic logs.

### 4. Verification

Local verification after the change:

- `bun run build` passed

Operational note:

- this change is primarily about reliability and diagnosability; if capture still fails later, the local log should now show exactly whether the blocker was event timing, provider resolution, model response shape, or memory persistence

## 2026-04-03 — Add Historical Prompt Backfill Script For Missed Memories

### Changed files

| File                                     | Change                                                          |
| ---------------------------------------- | --------------------------------------------------------------- |
| `scripts/backfill-historical-prompts.ts` | Add prompt-only backfill flow for uncaptured historical prompts |
| `devlog.md`                              | Record the historical recovery path                             |

### 1. Problem

Fixing future auto-capture reliability does not automatically recover older prompts
that were already stored in `user-prompts.db` without corresponding memories.

Those prompts had durable user intent, but the original assistant-side capture
context was no longer available in a full transcript form.

### 2. Approach

A new script, `scripts/backfill-historical-prompts.ts`, clusters historical
prompts by:

- `project_path`
- `session_id`
- time gap
- maximum prompts per cluster

It then generates one conservative memory per cluster using only the historical
user prompts.

### 3. Safety rules

Because only prompt history is available, the script instructs the model to:

- avoid inventing completed code changes or assistant actions
- prefer `discussion` / `analysis` when outcome is unresolved
- return `skip` for vague or non-durable clusters
- write a clear `## Request` / `## Outcome` summary only from confirmed prompt evidence

### 4. Operational behavior

The script supports dry-run and apply flows, reuses the configured
`opencodeProvider + opencodeModel`, and marks linked prompts after successful
memory creation so they are not backfilled repeatedly.

## 2026-04-03 — Fix Auto-Capture Summary Parsing And Prompt Retry Recovery

### Changed files

| File                                              | Change                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `src/services/auto-capture.ts`                    | Normalize provider payloads and release failed prompts for retry |
| `src/services/user-prompt/user-prompt-manager.ts` | Add explicit prompt release path for `captured = 2` recovery     |
| `devlog.md`                                       | Record the root cause of missing memories and the local fix      |

### 1. Runtime symptom

The plugin was active and receiving `session.idle` events, but many conversations
still produced no saved memory entries.

Observed local state during debugging:

- `user-prompts.db` contained many saved prompts
- project memory shards contained only a few actual memory rows
- runtime logs showed auto-capture reaching summary generation, then failing before write

This meant the problem was not "plugin not loaded", but "prompt recorded, summary/write path failing".

### 2. Root cause

The OpenCode provider path was returning structured output in multiple shapes that
the old auto-capture code did not tolerate consistently.

Examples seen in logs:

- wrapped payloads such as `answer`, `result`, or nested JSON strings
- `summary` returned as an object with `request` / `outcome` fields instead of a single string
- `skip` payloads that omitted empty `summary` / `tags`

When this happened, validation failed and the prompt never became a memory.

There was a second recovery bug too:

- after claim, failed prompts could remain stuck in `captured = 2`
- those prompts were no longer eligible for normal retry until restart/reset

### 3. Fix

`src/services/auto-capture.ts` now:

- accepts unknown provider payloads first, then normalizes them into `{ summary, type, tags }`
- unwraps common wrapper fields such as `answer`, `result`, `data`, `response`, `output`, and `payload`
- converts `{ request, outcome }` structures into the expected markdown summary
- tolerates `skip` payloads even when the provider omits empty fields

`src/services/user-prompt/user-prompt-manager.ts` now adds an explicit
`releasePrompt(...)` path so failed captures are returned from `captured = 2`
back to `captured = 0` for retry.

### 4. Verification

Local verification after the fix:

- `bun run build` passed

Operational note:

- restarting OpenCode Desktop is required so the local plugin wrapper reloads the rebuilt `dist/index.js`
- this fix restores future auto-capture reliability, but it does not by itself backfill all previously missed prompts into memories

## 2026-04-03 — Trace Auto-Capture Idle Flow And Harden Provider Parsing

### Changed files

| File                                   | Change                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `src/index.ts`                         | Log incoming plugin events before idle auto-capture dispatch                  |
| `src/services/auto-capture.ts`         | Add step-by-step tracing for prompt claim, message fetch, and AI summary flow |
| `src/services/ai/opencode-provider.ts` | Ignore directory candidates and unwrap single-wrapper JSON responses          |
| `AGENTS.md`                            | Document current runtime architecture and debugging path                      |
| `devlog.md`                            | Record review notes and architectural implications                            |

### 1. Review result

The current working diff builds successfully with `bun run build`.

No blocking compile issue was found in this review pass.

The main residual risk is operational rather than structural: the new debug
logs intentionally persist prompt/provider snippets into the local log file for
diagnosis, so that log should now be treated as sensitive local debugging data.

### 2. Idle-driven auto-capture is now traceable

`src/index.ts` now records each received plugin event before checking for
`session.idle`.

`src/services/auto-capture.ts` now logs the major phases of the capture
pipeline:

- finding the last uncaptured prompt
- claiming that prompt
- fetching OpenCode session messages
- extracting assistant text/tool output
- generating the structured summary
- writing the memory record

This makes it much easier to debug why a prompt was not captured without having
to guess which stage failed.

### 3. OpenCode provider parsing is more tolerant

`src/services/ai/opencode-provider.ts` now verifies that candidate config paths
are actual files before attempting to read them. This matters because the
OpenCode state path may resolve to a directory-like location in some runtime
layouts.

The OpenAI-compatible parsing path now also unwraps a single top-level object
wrapper before `zod` validation. That keeps structured output working when a
provider returns payloads like `{ "result": { ...actual schema... } }` instead
of the schema object directly.

### 4. Documentation follow-up

`AGENTS.md` now explains the current runtime architecture more explicitly:

- startup/bootstrap flow
- `session.idle` auto-capture flow
- provider structured-output flow
- local logging and debugging caveats

## 2026-04-03 — Switch OpenCode Desktop To Local Plugin Mode

### Changed files

| File        | Change                                                       |
| ----------- | ------------------------------------------------------------ |
| `AGENTS.md` | Document local plugin mode as the preferred setup on Windows |
| `devlog.md` | Record why npm/cache plugin loading was replaced             |

### 1. Root cause of the recurring Web UI failure

OpenCode Desktop was not consistently loading this working copy.

When `opencode-mem` was configured through the `"plugin"` array in
`~/.config/opencode/opencode.json`, Desktop could reinstall or refresh an npm
copy under `~/.cache/opencode/node_modules/opencode-mem/` and load that copy
instead of this fork.

That cached copy could be an older upstream build which still triggered the
Windows startup failure involving `@xenova/transformers` / `sharp`. When the
plugin failed to load, the Web UI on `http://127.0.0.1:4747` disappeared.

### 2. Operational fix

The preferred setup on this machine is now **local plugin mode**:

- keep `opencode-mem` out of the `"plugin"` array
- load the plugin through `~/.config/opencode/plugins/opencode-mem.js`
- have that local wrapper import this working tree's built output

This avoids relying on the cache-managed npm copy and keeps OpenCode Desktop
pointed at the fork being developed locally.

### 3. Maintenance rule for future debugging

If Web UI disappears again, inspect the Desktop logs first and verify the exact
plugin target path being loaded.

If logs point at `~/.cache/opencode/node_modules/opencode-mem/dist/plugin.js`,
Desktop has probably fallen back to the wrong npm/cache copy again.

## 2026-04-02 — Windows Compatibility & Provider Rewrite

### Changed files

| File                                   | Change                                         |
| -------------------------------------- | ---------------------------------------------- |
| `src/services/embedding.ts`            | Defer `@xenova/transformers` import to runtime |
| `src/index.ts`                         | Background warmup; lazy warmup on add/search   |
| `src/services/api-handlers.ts`         | Remove forced warmup from read-only endpoints  |
| `src/services/ai/opencode-provider.ts` | Rewrite: read config directly, no `ai` SDK     |
| `src/services/ai/opencode-state.ts`    | New: extract state helpers from provider       |
| `src/web/index.html`                   | Dual repo links (Upstream + My Fork)           |
| `src/web/styles.css`                   | Pill-button style for repo links               |
| `package.json`                         | Build script uses `node scripts/build.mjs`     |
| `scripts/build.mjs`                    | New: Node-based copy step (Windows-safe)       |

### 1. `@xenova/transformers` deferred import

`@xenova/transformers` was imported at module top-level, which pulled `sharp`
and crashed plugin startup on Windows when local embedding was not even needed.

Fix: `@xenova/transformers` is now loaded via dynamic `import()` only when
local embedding is actually used. Remote embedding mode never triggers it.

### 2. Background / non-blocking warmup

`src/index.ts` previously `await`ed `memoryClient.warmup()` during plugin init,
blocking the entire startup. If warmup failed (e.g. model download timeout),
the plugin and Web UI would not load.

Fix: warmup runs in a fire-and-forget `async` IIFE. The Web UI and plugin
tools become available immediately. `add` and `search` commands call
`await memoryClient.warmup()` lazily before their first real operation.

### 3. Read-only Web UI endpoints no longer force warmup

`api-handlers.ts` previously called `await embeddingService.warmup()` in
`handleListTags`, `handleListMemories`, and `handleStats`. This meant the UI
could not render its shell if embedding was not ready.

Fix: removed those warmup calls. These endpoints now respond immediately with
whatever data is available.

### 4. opencodeProvider rewritten

The old provider integration depended on `ai`, `@ai-sdk/anthropic`,
`@ai-sdk/openai`, and `@vercel/oidc`. The `@vercel/oidc` dependency caused
plugin loading failures in this environment.

Fix: the provider now reads `opencode.json` / `opencode.jsonc` directly,
extracts `baseURL` and `apiKey`, and makes raw `fetch` calls to the
OpenAI-compatible `/chat/completions` or Anthropic `/messages` endpoints.
No `ai` SDK dependency at runtime.

State management helpers (`setStatePath`, `getStatePath`, etc.) were extracted
into a new `opencode-state.ts` to keep concerns separate.

### 5. Windows build

`package.json` build script previously ran `mkdir -p dist/web && cp -r src/web/* dist/web/`,
which fails on Windows.

Fix: replaced with `node scripts/build.mjs`, a Node-based copy using
`fs.cpSync`.

### 6. Web UI header customization

The single GitHub icon in the top-right was replaced with two pill-shaped
buttons: "Upstream" linking to `tickernelz/opencode-mem` and "My Fork" linking
to `OCDcreator/opencode-mem`. Responsive layout collapses them to full-width
on narrow screens.
