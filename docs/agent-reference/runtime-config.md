# Runtime and Configuration Reference

This document is the current runtime reference for configuration, embedding mode selection, startup flow, and provider-backed memory behavior.

## 1. Current Known-Good Runtime Configuration

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

### 1.1 Config precedence

Current behavior:

- Global config loads from `~/.config/opencode/opencode-mem.jsonc` or `.json`.
- Project config loads from `<project>/.opencode/opencode-mem.jsonc` or `.json`.
- Project config overrides global config key-by-key.

Why this matters:

- If runtime behavior does not match the global file, inspect the project-level `.opencode` config next.
- Keys such as `embeddingApiUrl`, `embeddingApiKey`, `opencodeProvider`, and `opencodeModel` belong in one of those config files, with secrets referenced via `env://...` or `file://...` rather than committed plaintext.

## 2. Embedding Modes

This fork supports both embedding modes, but only one mode is active at a time.

### 2.1 Remote embedding mode

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

Put those keys in `~/.config/opencode/opencode-mem.jsonc` for the machine-wide default or in `<project>/.opencode/opencode-mem.jsonc` for a project override.

### 2.2 Local embedding mode

Use this when:

- a local Hugging Face model is desired
- the machine can access the model download source

Typical config:

```jsonc
"embeddingModel": "Xenova/nomic-embed-text-v1"
```

Notes:

- Local mode may need internet access on first use to download model artifacts.
- This fork now loads local models through `@huggingface/transformers`.
- Existing Hugging Face model IDs such as `Xenova/nomic-embed-text-v1` still remain valid configuration values.
- If local mode fails with "Unable to connect", this is usually a model download/network problem, not necessarily a plugin logic problem.

## 3. Current Runtime Architecture

### 3.1 Startup / bootstrap flow

Primary file: `src/index.ts`

Current behavior:

- Plugin init calls `initConfig(directory)` and computes project/user tags.
- Memory warmup is started in the background and should not block plugin startup.
- OpenCode state path and connected provider list are fetched asynchronously and stored through `src/services/ai/opencode-state.ts`.
- Provider-state init now deduplicates only concurrent startup work; it does not assume one successful init should permanently block later refreshes.
- The web server is started independently when enabled.

Why this matters:

- Provider-backed features can fail if OpenCode has not exposed provider state yet.
- A startup issue does not automatically mean embedding or web serving is broken; these paths are deliberately decoupled.

### 3.2 Event-driven auto-capture flow

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

### 3.3 Provider structured-output flow

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

### 3.4 Logging and debugging flow

Primary file: `src/services/logger.ts`

Current behavior:

- Logs are written to `~/.opencode-mem/opencode-mem.log` unless `OPENCODE_MEM_LOG_FILE` overrides the destination.
- New logs now include selected event names, auto-capture phase transitions, and OpenAI-compatible raw/parsed JSON excerpts.
- Large payloads are truncated before being written.

Why this matters:

- The log file is now the first place to inspect when idle capture or provider parsing behaves unexpectedly.
- Logging every watcher event can become its own performance problem after host-side event-flow changes.
- The log file may contain prompt snippets or model-returned content, so handle it as local-sensitive debugging output.

## 4. Auto-Capture / Memory Model Rules

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
