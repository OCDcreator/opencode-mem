# AGENTS.md

This document is the current maintenance guide for the `OCDcreator/opencode-mem` fork.
It is intended for future coding agents and maintainers working on this repository.

Last updated: 2026-04-03

## 1. Fork Identity

- Upstream repository: `https://github.com/tickernelz/opencode-mem`
- Fork repository: `https://github.com/OCDcreator/opencode-mem`
- Local package version in this fork: `2.13.0-custom`

This fork is not a pure mirror. It contains behavior and compatibility fixes that are important for local OpenCode usage across Windows and macOS, with several fixes originally added because Windows was failing first.

## 2. What Changed In This Fork

### 2.1 Embedding loading is now mode-aware

File: `src/services/embedding.ts`

Important change:

- `@xenova/transformers` is no longer imported at module top-level.
- It is loaded dynamically only when local embedding is actually used.

Why this matters:

- The original loading path could crash plugin startup on Windows because `@xenova/transformers` pulls `sharp`.
- Remote embedding mode should not require `sharp` or local model loading at startup.

Practical rule:

- If `embeddingApiUrl` and `embeddingApiKey` are configured, the plugin should not need local `transformers` initialization during startup.

### 2.2 Windows build is fixed

Files:

- `package.json`
- `scripts/build.mjs`

Important change:

- The old build script used Unix shell commands like `mkdir -p` and `cp -r`.
- This fork replaced that with a Node-based copy step so `bun run build` works on Windows.

Practical rule:

- Use `bun run build`.
- Do not reintroduce shell-only copy commands unless they are Windows-safe.
- Prefer platform-neutral Node/Bun filesystem logic so the same build keeps working on macOS too.

### 2.3 Plugin startup is less fragile

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

- Keep startup tolerant.
- Avoid forcing `embeddingService.warmup()` in endpoints that only read metadata or list records.

### 2.4 OpenCode provider integration was rewritten

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

- Be careful when upgrading provider-related dependencies.
- If provider integration is changed again, re-test actual plugin loading inside OpenCode, not just isolated module imports.

### 2.5 Web UI header was customized for the fork

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

### 2.6 Auto-capture idle flow is now easier to trace

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

### 2.7 OpenAI-compatible provider parsing is more tolerant

File: `src/services/ai/opencode-provider.ts`

Important change:

- Config-path discovery now filters candidates to actual files.
- The OpenAI-compatible parser now unwraps a single wrapper object before `zod` validation.

Why this matters:

- `statePath` can point near the config without itself being the config file.
- Some providers return a schema payload wrapped in one extra object such as `{ "result": { ... } }`.

Practical rule:

- Keep provider output schemas rooted at a JSON object.
- If parsing fails, inspect the logged raw content before changing prompt/schema code.

### 2.8 OpenCode 1.3 plugin loader compatibility was restored

Files:

- `package.json`
- `src/plugin.ts`
- `tests/plugin-loader-contract.test.ts`

Important change:

- The package now exports both `"."` and `"./server"` through `dist/plugin.js`.
- `src/plugin.ts` now exports a `PluginModule` object with a `server` entrypoint instead of a bare default function.
- Plugin/runtime dependencies were moved to the OpenCode 1.3-compatible line.

Why this matters:

- Newer OpenCode builds can skip plugins that only export a bare default function.
- This compatibility fix matters on both Windows and macOS because it is a loader contract issue, not a platform-specific runtime bug.

Practical rule:

- Preserve the `PluginModule` export shape unless you intentionally rework plugin loading against a newer official contract.
- If plugin loading silently breaks after an OpenCode upgrade, re-run the loader contract test first.

## 3. Current Known-Good Runtime Configuration

The current local environment is configured to use:

- Auto-capture / user profile via OpenCode provider:
  - `opencodeProvider = "zhipuai-coding-plan"`
  - `opencodeModel = "glm-4.5"`
- Embedding via DashScope OpenAI-compatible endpoint:
  - `embeddingModel = "text-embedding-v4"`
  - `embeddingApiUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1"`
  - `embeddingApiKey = "env://DASHSCOPE_API_KEY"`
  - `embeddingDimensions = 1024`

Important:

- `text-embedding-v4` is not auto-known by this repo's static dimension map.
- `embeddingDimensions` must be set explicitly to `1024` when using this model, or future migrations/search behavior may break.

## 4. Embedding Modes

This fork supports both embedding modes, but only one mode is active at a time.

### 4.1 Remote embedding mode

Use this when:

- local Hugging Face model download is blocked
- startup stability matters more than local-only embedding
- DashScope or another OpenAI-compatible embedding endpoint is available

Required config:

```jsonc
"embeddingModel": "text-embedding-v4",
"embeddingDimensions": 1024,
"embeddingApiUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
"embeddingApiKey": "env://DASHSCOPE_API_KEY"
```

### 4.2 Local embedding mode

Use this when:

- a local / Hugging Face-backed Xenova model is desired
- the machine can access the model download source

Typical config:

```jsonc
"embeddingModel": "Xenova/nomic-embed-text-v1"
```

Notes:

- Local mode may need internet access on first use to download model artifacts.
- The default remote host used by `@xenova/transformers` is Hugging Face.
- If local mode fails with "Unable to connect", this is usually a model download/network problem, not necessarily a plugin logic problem.

## 5. Current Runtime Architecture

This section describes the current high-level runtime flow of the fork.

### 5.1 Startup / bootstrap flow

Primary file: `src/index.ts`

Current behavior:

- Plugin init calls `initConfig(directory)` and computes project/user tags.
- Memory warmup is started in the background and should not block plugin startup.
- OpenCode state path and connected provider list are fetched asynchronously and stored through `src/services/ai/opencode-state.ts`.
- The web server is started independently when enabled.

Why this matters:

- Provider-backed features can fail if OpenCode has not exposed provider state yet.
- A startup issue does not automatically mean embedding or web serving is broken; these paths are deliberately decoupled.

### 5.2 Event-driven auto-capture flow

Primary files:

- `src/index.ts`
- `src/services/auto-capture.ts`
- `src/services/user-prompt/user-prompt-manager.ts`

Current behavior:

- Auto-capture starts from the `session.idle` plugin event.
- `src/index.ts` debounces the idle event with a 10-second timeout before calling `performAutoCapture(...)`.
- `performAutoCapture(...)` claims the newest uncaptured prompt, fetches session messages, extracts assistant text/tool content, builds markdown context, calls the configured summarizer, and writes the resulting memory.
- Prompt rows use `captured = 2` as an in-progress claim state. On plugin startup, the prompt manager resets `captured = 2` back to `0`.
- If the summarizer returns `type = "skip"`, the prompt is deleted rather than stored as a memory.

Why this matters:

- If `session.idle` never appears, auto-capture never starts.
- If a prompt is claimed but not completed, restart behavior is part of the recovery path.

### 5.3 Provider structured-output flow

Primary files:

- `src/services/ai/opencode-provider.ts`
- `src/services/ai/opencode-state.ts`
- `src/services/auto-capture.ts`
- `src/services/user-memory-learning.ts`

Current behavior:

- Provider-backed structured output depends on `opencodeProvider + opencodeModel`.
- The provider loader finds `opencode.json` / `opencode.jsonc` near the recorded OpenCode state path or in the default OpenCode config directory.
- `generateStructuredOutput(...)` infers whether the provider should use the Anthropic or OpenAI-compatible HTTP path.
- The OpenAI-compatible path now accepts either the direct schema object or a single wrapped object around that schema object.

Why this matters:

- Both auto-capture summaries and user-profile learning depend on this path.
- A provider parse failure can be caused by config discovery, HTTP compatibility, or JSON wrapper shape; these are separate failure modes.

### 5.4 Logging and debugging flow

Primary file: `src/services/logger.ts`

Current behavior:

- Logs are written to `~/.opencode-mem/opencode-mem.log` unless `OPENCODE_MEM_LOG_FILE` overrides the destination.
- New logs now include event names, auto-capture phase transitions, and OpenAI-compatible raw/parsed JSON excerpts.

Why this matters:

- The log file is now the first place to inspect when idle capture or provider parsing behaves unexpectedly.
- The log file may contain prompt snippets or model-returned content, so handle it as local-sensitive debugging output.

## 6. Auto-Capture / Memory Model Rules

There are two different model families in this plugin:

- `embeddingModel`: used for vector search
- `memoryModel` / `opencodeModel`: used for auto-capture and user profile analysis

Current preferred rule in this fork:

- Prefer `opencodeProvider + opencodeModel` over manual `memoryModel + memoryApiUrl`.

Reason:

- The current user already has OpenCode providers configured.
- This avoids duplicating LLM credentials in `opencode-mem.jsonc`.

Current active setup:

```jsonc
"opencodeProvider": "zhipuai-coding-plan",
"opencodeModel": "glm-4.5"
```

## 7. OpenCode Installation Notes

### 7.1 Current preferred setup: local plugin mode

This fork is now intended to be loaded as a **local plugin**, not as an npm plugin.

Current preferred local setup:

- OpenCode config file: `~/.config/opencode/opencode.json`
- Local plugin wrapper: `~/.config/opencode/plugins/opencode-mem.js`
- Wrapper target: this working copy's built file, typically:
  - Windows example: `C:/Users/lt/Desktop/Write/custom-project/opencode-mem/dist/index.js`
  - macOS example: `/Users/<you>/Desktop/Write/custom-project/opencode-mem/dist/index.js`

Important rule:

- Keep `opencode-mem` **out of** the `"plugin"` array in `~/.config/opencode/opencode.json`.
- On this machine, the local wrapper should be the source of truth.

Why this matters:

- npm plugin mode can cause OpenCode Desktop to reinstall or refresh a separate copy under cache.
- local plugin mode avoids that extra copy and keeps development pointed at this working tree.

### 7.2 Legacy npm/cache plugin behavior

Important local behavior discovered during debugging:

- When `opencode-mem` is configured via the `"plugin"` array, OpenCode Desktop may load it from `~/.cache/opencode/node_modules/opencode-mem/`
- A symlink under `~/.config/opencode/node_modules/` was not the active path in this environment
- If Desktop falls back to the cached npm copy, it may load an outdated upstream build instead of this fork

Why this is dangerous on this machine:

- The cached upstream build reintroduced Windows startup failure involving `@xenova/transformers` / `sharp`
- When that happens, the plugin fails to load and the Web UI on `127.0.0.1:4747` disappears

Practical rule:

- Prefer local plugin mode over npm plugin mode on this machine
- If OpenCode appears to ignore local code changes, verify which `opencode-mem` path it is actually loading
- Check the desktop logs for the exact plugin target path being loaded
- If logs mention `~/.cache/opencode/node_modules/opencode-mem/dist/plugin.js`, Desktop is probably using the wrong copy again
- Apply the same check on macOS too; the exact cache root can differ, but the failure mode is the same: OpenCode can load a cached npm copy instead of your working tree.

## 8. Operational Caveats

### 8.1 Vector dimension changes are destructive-ish

If embedding dimensions change:

- stored vectors may no longer match current config
- migration logic may be required
- existing memories may need re-embedding or fresh-start cleanup

Do not change embedding dimensions casually.

### 8.2 Read-only UI endpoints should stay lightweight

Avoid adding embedding warmup to:

- stats endpoints
- tag listing
- timeline listing

Otherwise the UI can become unavailable during model/network issues.

### 8.3 Do not store plaintext secrets in committed docs

Use:

- `env://...`
- `file://...`

Avoid committing real API keys to the repository.

### 8.4 Debug logs can contain prompt/model snippets

Current behavior:

- The local logger now stores short prompt snippets and provider output excerpts to help diagnose auto-capture/provider failures.

Practical rule:

- Do not paste or publish the log file casually.
- If logs must be shared, sanitize them first.

## 9. Files Future Agents Should Inspect First

When working on this fork, start with:

- `src/services/embedding.ts`
- `src/index.ts`
- `src/services/api-handlers.ts`
- `src/services/auto-capture.ts`
- `src/services/ai/opencode-provider.ts`
- `src/services/ai/opencode-state.ts`
- `src/services/user-prompt/user-prompt-manager.ts`
- `src/services/logger.ts`
- `src/config.ts`
- `src/web/index.html`
- `src/web/styles.css`
- `~/.config/opencode/opencode.json`
- `~/.config/opencode/plugins/opencode-mem.js`

These files contain most of the fork-specific behavior changes.

## 10. Recommended Verification Checklist

After making changes, verify at least:

1. `bun run build`
2. Local plugin wrapper still points at this working copy's `dist/index.js`
3. `~/.config/opencode/opencode.json` does not list `opencode-mem` in the `"plugin"` array
4. Plugin module can be imported from `dist/plugin.js`
5. Web UI can respond on `http://127.0.0.1:4747/api/stats`
6. Remote embedding mode can return a vector successfully
7. If local embedding was touched, test first-run local model initialization separately

## 11. Current Intent Of This Fork

This fork is optimized for:

- cross-platform local development
- Windows-friendly development where upstream behavior was fragile
- macOS local plugin usage with the same repository and loader contract
- OpenCode local plugin iteration
- stable startup behavior
- support for both local embedding and remote embedding
- practical use with the user's existing OpenCode provider setup

If a future change conflicts with one of those goals, prefer stability and debuggability over keeping upstream behavior unchanged.
