# Development Log

> **更新规范**：后续更新请写在文件开头，越新的进度越靠前（倒序排列）。
> 当前最新更新：2026-04-08

## 2026-04-08 — Fix Web UI Language Persistence Drift And Clarify Memory Count Label

### Changed files

| File                 | Change                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `devlog.md`          | Record the UI language-persistence fix and clearer stats wording                             |
| `src/web/i18n.js`    | Add missing translation keys, apply saved language on initial load, and localize titles      |
| `src/web/index.html` | Mark header tooltips and labels for translation so refresh does not leave mixed-language UI  |
| `src/web/app.js`     | Replace hardcoded English dynamic strings with `t(...)` and use a clearer total-memory label |

### 1. User-visible problem

After switching the plugin Web UI to Chinese and refreshing the page, some
parts of the interface could fall back to English again.

Observed local symptoms:

- the saved language choice was remembered, but not fully reapplied on reload
- some dynamic strings still rendered in English even when the UI was in Chinese
- the old stats label `总计` was too vague for a memory database overview

### 2. Root cause

Two separate issues were contributing to the mixed-language UI:

- the saved language in `localStorage` was not being applied early enough during page initialization
- several dynamic UI strings in `src/web/app.js` and header labels/tooltips in `src/web/index.html` were still hardcoded in English

That meant refreshes could restore the language state only partially, leaving
some visible English strings behind.

### 3. Fix kept

The UI localization path was tightened in a minimal way:

- apply the saved language during initial load instead of only after manual toggle
- sync `document.title`, `<html lang>`, placeholders, and tooltip titles through the same i18n path
- move dynamic strings such as search headers, pin/unpin tooltips, history button text, evidence counts, default category labels, and profile empty-state text into translation keys
- rename the stats label from `总计` to `记忆总数` so the meaning is clearer

### 4. Verification

Verified locally with:

- `bun run build`

Result:

- the build succeeded
- after refresh, Chinese UI text now stays consistent instead of partially reverting to English
- the memory stats label now reads more clearly in both Chinese and English

## 2026-04-08 — Investigate OpenCode 1.4 Startup CPU Spike, Separate Plugin Bugs From Host Startup Load

### Changed files

| File                                        | Change                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                 | Record the OpenCode 1.4 startup CPU findings and maintenance rules                                               |
| `opencode-local-plugin-loading.md`          | Cross-link the startup CPU investigation and distinguish loader vs host startup issues                           |
| `opencode-1.4-startup-cpu-investigation.md` | Add a full incident write-up covering symptoms, A/B results, and review                                          |
| `src/plugin.ts`                             | Keep lazy plugin export with `id` to satisfy the modern path-plugin contract                                     |
| `src/services/web-server.ts`                | Keep Node HTTP bridge so Desktop accepts plugin web responses                                                    |
| `src/index.ts`                              | Filter noisy event logging, `unref` idle timers, and keep only in-flight provider init dedupe                    |
| `src/services/logger.ts`                    | Truncate large log payloads before writing local debug logs                                                      |
| `src/services/embedding.ts`                 | `unref` timeout wrapper so non-critical timers do not hold the process                                           |
| `src/services/language-detector.ts`         | Selectively absorb low-risk upstream ISO fallback improvements without replacing fork-specific path/script logic |
| `tests/plugin-loader-contract.test.ts`      | Guard the `id` field and modern plugin export contract                                                           |
| `tests/language-detector.test.ts`           | Add a regression guard for 3-letter language-name lookup                                                         |

### 1. Why this investigation was necessary

After the local-plugin/macOS loading work and a same-day upgrade to OpenCode
`1.4.0`, the user observed:

- startup error sounds
- `127.0.0.1:4747` sometimes showing the Bun default page instead of the plugin UI
- `opencode-cli` / Bun using a lot of CPU during startup

Because these symptoms appeared near both a local plugin wrapper change and an
OpenCode upgrade, the cause could not be assumed.

### 2. What turned out to be real plugin bugs

Several issues were confirmed as real plugin/runtime compatibility bugs:

- local path-plugin loading required an explicit `id` and a safer lazy export path
- the plugin Web UI needed a Node HTTP bridge because the Desktop sidecar rejected Bun `_Response` objects in this environment
- the plugin was logging too many file-watcher events, which amplified startup noise and local log churn

These are worth keeping because they fix deterministic failures, not just
symptoms.

### 3. What the A/B test showed

A direct A/B test was run:

1. disable the local plugin wrapper
2. launch OpenCode and sample `opencode-cli`
3. restore the wrapper
4. relaunch and sample again

Observed result:

- without plugin: CPU delta stayed high over the same startup window
- with plugin: CPU delta was very similar

Conclusion:

- the startup CPU spike was **not primarily caused by this plugin**
- the plugin had real bugs, but the large startup CPU cost mostly remained even without it

### 4. What was causing startup noise outside this repo

Two local OpenCode configuration issues were also found:

- duplicate skills existed in both `~/.claude/skills/` and `~/.config/opencode/skills/`
- several MCP servers errored on `prompts/list` during startup

Those were cleaned up in local user config (outside this repo), and the
duplicate-skill / failed-prompts startup noise disappeared from the Desktop
logs afterward.

### 5. Review of the repo changes

The final code review conclusion was:

- keep the proven compatibility fixes (`src/plugin.ts`, `src/services/web-server.ts`, loader test)
- keep the log-noise reductions (`src/index.ts`, `src/services/logger.ts`)
- keep `unref` on non-critical timers
- avoid over-freezing startup state

One adjustment was made during review:

- provider-state initialization now deduplicates only **concurrent** startup work
- it no longer assumes one successful initialization should permanently block later refreshes

That is a safer compromise given that provider state can change while the host
process stays alive.

## 2026-04-08 — Verify Local Plugin Loading Against OpenCode Source And Document The Correct Path

### Changed files

| File                               | Change                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| `tsconfig.json`                    | Add Bun type declarations so `bun run build` succeeds again         |
| `AGENTS.md`                        | Record source-verified local plugin loading rules and wrapper shape |
| `devlog.md`                        | Record the verified loader diagnosis and minimal fix                |
| `opencode-local-plugin-loading.md` | Add a future-maintainer playbook for loading this plugin correctly  |

### 1. User-visible symptom

The user only wanted one thing: make the plugin load normally again inside
OpenCode on macOS without breaking the Windows-friendly fork behavior.

The misleading part was that the plugin already worked on Windows, so changing
random runtime logic first would have been the wrong move.

### 2. What was actually wrong

The local loading problem was verified against the real OpenCode source tree,
not inferred from memory.

Source-verified behavior:

- local plugins in `~/.config/opencode/plugins/` are auto-loaded
- path plugins must export `id`
- server plugins must default export an object with `server()`
- a local plugin and an npm plugin can both load, so keeping `opencode-mem` in
  the `"plugin"` array can make OpenCode use a cached npm copy instead of this
  working tree

The real local failure mode was the wrapper/export contract, not plugin
discovery itself.

### 3. Minimal fix kept

Only the minimal repo-level fix was kept:

- `tsconfig.json` now includes `"types": ["bun"]`

Why this was necessary:

- this fork already uses `bun run build`
- `@types/bun` was already installed
- without the Bun types, `bunx tsc` failed on Bun/Node runtime globals even
  though the runtime code itself was still valid

The actual local loader fix lives outside the repo in the user's local plugin
wrapper:

- `~/.config/opencode/plugins/opencode-mem.js`

That wrapper must export both:

- `export const id = "opencode-mem"`
- `export default { id, server: OpenCodeMemPlugin }`

### 4. Verification

Fast loader verification:

- `~/.opencode/bin/opencode --print-logs --log-level INFO stats`

Persistent Web UI verification:

- `~/.opencode/bin/opencode . --print-logs --log-level INFO`
- `curl http://127.0.0.1:4747/api/stats`
- `curl http://127.0.0.1:4747/`

Observed local result:

- the plugin loaded from the local wrapper path
- `http://127.0.0.1:4747/api/stats` returned `200`
- `http://127.0.0.1:4747/` returned `200`
- after stopping the OpenCode instance, port `4747` disappeared immediately

### 5. Important lesson for future debugging

If Windows already works, do not start by rewriting business logic.

Check these first:

1. which plugin path OpenCode is actually loading
2. whether the local wrapper matches the current loader contract
3. whether the plugin is accidentally also configured via the npm `"plugin"` array
4. whether the verification command is long-lived enough to keep the Web UI alive

That order avoids unnecessary source churn and preserves cross-platform behavior.

## 2026-04-04 — Fix Auto-Capture Language Drift Caused By Paths And `franc` Aliases

### Changed files

| File                                | Change                                                                |
| ----------------------------------- | --------------------------------------------------------------------- |
| `src/services/language-detector.ts` | Strip path/URL noise before detection and add script/ISO alias guards |
| `tests/language-detector.test.ts`   | Add regression tests for Chinese-with-path and Cyrillic prompts       |
| `devlog.md`                         | Record the root cause and verification                                |

### 1. Runtime symptom

The newest auto-captured memory could sometimes appear in the wrong language
even when the user never spoke that language.

Observed local failure pattern:

- a Chinese prompt that started with a Windows path produced a foreign-language memory
- the saved memory language did not match either the current Web UI language or the visible user prompt
- the issue reproduced specifically in auto-capture, not manual memory editing

### 2. Root cause

`autoCaptureLanguage` is currently left in `auto` mode, so auto-capture first
detects the prompt language and then instructs the summarizer to write in that
language.

The old detector was too naive for real coding prompts:

- it passed raw prompt text directly to `franc`
- raw prompts often include Windows paths, repo names, URLs, code fences, and mixed-language tokens
- `franc` can misclassify that noisy text, especially when the prompt begins with `C:\...`
- the detector also did not normalize some common ISO-639-3 results such as `cmn` to `zh`

That meant a Chinese prompt could be misdetected as another language before the
summary request was even sent to the model.

### 3. Fix

`src/services/language-detector.ts` now:

- removes code fences, inline code, URLs, Windows paths, Unix-like paths, and path-like token chains before detection
- uses a lightweight script-based guard for Han, Hiragana/Katakana, Hangul, Cyrillic, and Arabic text before falling back to `franc`
- maps common ISO-639-3 detection results such as `cmn`, `zho`, `yue`, `jpn`, `kor`, and `rus` to the expected plugin language codes

This keeps technical prompt noise from dominating language detection while still
preserving the existing `auto` workflow.

### 4. Verification

Local verification after the fix:

- `bun test tests/language-detector.test.ts`
- `bun run build`

Regression tests now cover:

- plain Chinese prompt detection
- Chinese prompt preceded by a Windows path
- Cyrillic prompt detection for Russian text

## 2026-04-03 — Merge OpenCode 1.3 Loader Compatibility Into The Custom Fork

### Changed files

| File                                   | Change                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `package.json`                         | Add package exports map and bump plugin/sdk dependencies to 1.3 line    |
| `src/plugin.ts`                        | Export `PluginModule` with `server` entrypoint instead of bare function |
| `tests/plugin-loader-contract.test.ts` | Add regression test for OpenCode 1.3 plugin loader contract             |
| `AGENTS.md`                            | Update fork version and document cross-platform loader compatibility    |
| `devlog.md`                            | Record the upstream compatibility merge                                 |

### 1. Upstream change worth merging

Upstream `v2.13.0` primarily introduced one high-value fix:

- restore compatibility with the OpenCode 1.3 plugin loader contract

This was a real integration fix, not just a cosmetic version bump, and it
matters for both Windows and macOS.

### 2. Why this fork did not take a blind merge

This fork already contains local changes that must be preserved:

- Windows-safe build script
- OpenCode provider rewrite
- startup tolerance changes
- local debugging and historical backfill tooling

So instead of replacing the fork with upstream wholesale, the required loader
contract pieces were merged into the custom fork selectively.

### 3. What changed

`package.json` now:

- exposes both `"."` and `"./server"` from `dist/plugin.js`
- uses the OpenCode 1.3-compatible `@opencode-ai/plugin` and `@opencode-ai/sdk` line
- keeps the custom Node-based build script so builds still work on Windows and macOS

`src/plugin.ts` now exports:

- `default { server: OpenCodeMemPlugin }`

instead of:

- a bare default plugin function

This matches the modern loader expectation used by newer OpenCode versions.

### 4. Cross-platform note

This compatibility merge was done with dual-device usage in mind:

- Windows still keeps the custom build/runtime fixes
- macOS now benefits from the same modern loader contract instead of depending on legacy export behavior

The goal is one fork that works across both machines, not separate Windows-only
and macOS-only plugin behavior.

### 5. Verification

Local verification after the merge:

- `bun install`
- `bun run build`
- `bun test tests/plugin-loader-contract.test.ts`

All passed after rebuilding `dist/plugin.js`.

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
