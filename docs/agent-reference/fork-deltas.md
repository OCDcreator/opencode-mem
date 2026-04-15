# Fork Deltas and Caveats

This document contains the fork-specific behavior that differs from upstream and the caveats that future agents should preserve.

If `opencode` is on `PATH`, prefer that command form in examples below. If not, use the launcher that exists in your shell such as `~/.opencode/bin/opencode` on POSIX or `opencode.cmd` / `opencode.ps1` on Windows npm installs.

## 1. High-Impact Fork Deltas

Use `docs/agent-reference/runtime-config.md` as the source of truth for the current runtime architecture.

### 1.1 Embedding loading is now mode-aware

File: `src/services/embedding.ts`

Important change:

- `@huggingface/transformers` is no longer imported at module top-level.
- It is loaded dynamically only when local embedding is actually used.

Why this matters:

- The original loading path could crash plugin startup because the older `@xenova/transformers` / `sharp` chain was fragile in plugin install contexts.
- This fork now uses `@huggingface/transformers`, which keeps the same lazy-loading model but is safer in `--ignore-scripts` style installs.
- Remote embedding mode should not require `sharp` or local model loading at startup.

Practical rule:

- If `embeddingApiUrl` and `embeddingApiKey` are configured in `~/.config/opencode/opencode-mem.jsonc` or `<project>/.opencode/opencode-mem.jsonc`, the plugin should not need local `transformers` initialization during startup.

### 1.2 Windows build is fixed

Files:

- `package.json`
- `scripts/build.mjs`
- `tsconfig.json`

Important change:

- The old build script used Unix shell commands like `mkdir -p` and `cp -r`.
- This fork replaced that with a Node-based copy step so `bun run build` works on Windows.
- `tsconfig.json` now explicitly includes `"types": ["bun"]` so the TypeScript build sees Bun/Node runtime globals during `bun run build`.

Practical rule:

- Use `bun run build`.
- Do not reintroduce shell-only copy commands unless they are Windows-safe.
- Prefer platform-neutral Node/Bun filesystem logic so the same build keeps working on macOS too.
- If the build suddenly loses `Bun`, `process`, `fetch`, or Node builtin module types, fix the compiler type setup first instead of patching runtime code.

### 1.3 Plugin startup is less fragile

Files:

- `src/index.ts`
- `src/services/api-handlers.ts`

Important change:

- Startup warmup is now background/non-blocking.
- Web UI read-only endpoints no longer force embedding warmup before responding.

Why this matters:

- The Web UI should be able to open even if embedding is not ready yet.
- A failed local model download should not completely prevent the UI from loading.

Practical rule:

- Do not `await` embedding or memory warmup during plugin init or in read-only endpoints such as stats, tags, or timeline handlers.
- If startup flow changes, verify `opencode --print-logs --log-level INFO stats` still works without requiring a successful local model download.

### 1.4 OpenCode provider integration was rewritten

Files:

- `src/services/ai/opencode-provider.ts`
- `src/services/ai/opencode-state.ts`

Important change:

- The old provider path depended on the `ai` package in a way that crashed plugin loading in this environment.
- This fork now reads OpenCode provider config directly from local config/state and makes provider requests without relying on the problematic startup path.

Why this matters:

- This is required for the current OpenCode setup using `zhipuai-coding-plan`.
- It also avoids startup failure caused by `@vercel/oidc` / `ai` dependency behavior in this environment.

Practical rule:

- After provider-path changes, run `bun test tests/opencode-provider.test.ts`.
- Rebuild with `bun run build`.
- Verify `opencode --print-logs --log-level INFO stats` loads the local wrapper without provider startup/export errors.
- If auto-capture or user-profile generation changed, also verify behavior in a live `opencode . --print-logs --log-level INFO` session.

### 1.5 Web UI header was customized for the fork

Files:

- `src/web/index.html`
- `src/web/styles.css`

Important change:

- The top-right header now shows two repository links:
  - `Upstream`
  - `My Fork`
- The old single small GitHub icon was replaced by clearer pill buttons.

Practical rule:

- Preserve both repository links unless the user explicitly wants a different header design.

### 1.6 Auto-capture idle flow is now easier to trace

Files:

- `src/index.ts`
- `src/services/auto-capture.ts`
- `src/services/logger.ts`

Important change:

- Plugin events are now logged when received.
- The auto-capture pipeline now logs each major step from prompt claim through summary generation.

Why this matters:

- Auto-capture failures were previously hard to localize.
- Future debugging can now follow the actual idle-event path instead of guessing whether the failure happened before or after provider calls.

Practical rule:

- If auto-capture stops working, inspect the local log file first.
- Treat those logs as sensitive local debugging data because they may contain prompt snippets and provider output excerpts.

### 1.7 OpenAI-compatible provider parsing is more tolerant

File: `src/services/ai/opencode-provider.ts`

Important change:

- Config-path discovery now filters candidates to actual files.
- The OpenAI-compatible parser now unwraps a single wrapper object before `zod` validation.

Why this matters:

- `statePath` can point near the config without itself being the config file.
- Some providers return a schema payload wrapped in one extra object such as `{ "result": { ... } }`.

Practical rule:

- Keep structured-output responses as JSON objects.
- Accept either the schema object itself or one wrapper object such as `{ "result": { ... } }`; do not switch to array or string top-level payloads.
- If parsing fails, inspect the logged raw content before changing prompt or schema code.

### 1.8 OpenCode 1.3 loader compatibility and build outputs were restored

Files:

- `package.json`
- `src/plugin.ts`
- `scripts/build.mjs`
- `tests/plugin-loader-contract.test.ts`

Important change:

- The package now exports both `"."` and `"./server"` through `dist/plugin.js`.
- `src/plugin.ts` now exports a `PluginModule` object with a `server` entrypoint instead of a bare default function.
- `bun run build` refreshes `dist/index.js`, `dist/plugin.js`, and `dist/web/`, and some tests read those built files directly.

Why this matters:

- Newer OpenCode builds can skip plugins that only export a bare default function.
- Stale `dist/` output can look like a loader regression even when the source code is correct.

Practical rule:

- Preserve the `PluginModule` export shape unless you intentionally rework plugin loading against a newer official contract.
- Do not hand-edit `dist/`; rebuild it.
- If plugin loading silently breaks after an OpenCode upgrade, run `bun run build` and then `bun test tests/plugin-loader-contract.test.ts` before debugging deeper.

### 1.9 Local plugin loading was verified against OpenCode source

Source-of-truth repo on this machine:

- `/Volumes/SDD2T/obsidian-vault-write/open-source-project/opencode`

Important confirmed behavior:

- Local plugins in `~/.config/opencode/plugins/` auto-load on this machine; the `"plugin"` array is not required for the local wrapper path.
- Path plugins must export `id`, and server plugins must default export an object with `server()`.
- A local plugin and an npm plugin can both load, so duplicate configuration is dangerous.

Practical rule:

- When debugging loading, inspect desktop logs for the actual loaded path before changing plugin runtime logic.
- Treat the local wrapper contract as part of the deployed system, even though it lives outside this repo.

### 1.10 OpenCode 1.4 startup CPU investigation separated plugin bugs from host startup load

Files:

- `src/plugin.ts`
- `src/services/web-server.ts`
- `src/index.ts`
- `src/services/logger.ts`
- `src/services/embedding.ts`
- `opencode-1.4-startup-cpu-investigation.md`

Important change:

- A direct A/B test showed that the large startup CPU spike remained similar even with the local plugin wrapper disabled.
- Keep only the fixes backed by that evidence:
  - lazy plugin export with explicit `id`
  - Node HTTP bridge for the plugin Web UI
  - filtered event logging instead of logging every watcher event
  - `unref?.()` on non-critical timers
  - only **in-flight** deduplication for provider-state init, not permanent one-time freezing

Practical rule:

- If OpenCode startup CPU suddenly spikes after a host upgrade, compare startup with and without the local wrapper before changing plugin business logic.
- If the spike remains similar without the plugin, inspect local OpenCode config for duplicate skills and noisy MCP startup failures before adding more repo-side complexity.
- Do not reintroduce blanket event logging for `file.watcher.updated` unless you are doing a short-lived targeted debug session.
- If provider-state init is revisited, keep deduplication limited to concurrent startup work unless you have proof that later refreshes are unnecessary.

## 2. Operational Caveats

### 2.1 Vector dimension changes are destructive-ish

If embedding dimensions change:

- stored vectors may no longer match current config
- migration logic may be required
- existing memories may need re-embedding or fresh-start cleanup

Do not change embedding dimensions casually.

### 2.2 Read-only UI endpoints should stay lightweight

Avoid adding embedding warmup to:

- stats endpoints
- tag listing
- timeline listing

Otherwise the UI can become unavailable during model/network issues.

### 2.3 Do not store plaintext secrets in committed docs

Use:

- `env://...`
- `file://...`

Avoid committing real API keys to the repository.

### 2.4 Debug logs can contain prompt/model snippets

Current behavior:

- The local logger now stores short prompt snippets and provider output excerpts to help diagnose auto-capture/provider failures.

Practical rule:

- Do not paste or publish the log file casually.
- If logs must be shared, sanitize them first.

### 2.5 OpenCode startup noise can come from outside this repo

Important local behavior observed during the OpenCode `1.4.0` investigation:

- Duplicate skills under both `~/.claude/skills/` and `~/.config/opencode/skills/` created startup warnings and extra scanning.
- Several MCP servers on this machine errored during startup because OpenCode probes `prompts/list` and those servers did not implement that method.
- Those issues can make Desktop startup look like a plugin problem even when the plugin is not the primary CPU source.

Practical rule:

- If startup CPU or fan noise suddenly appears after an OpenCode upgrade, inspect Desktop logs for duplicate-skill warnings and MCP `prompts/list` errors before making deeper repo-side changes.
- Keep local config hygiene in mind when evaluating plugin startup regressions.
